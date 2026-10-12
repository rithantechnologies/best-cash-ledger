import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { PrismaService } from '../prisma/prisma.service.js';

type BranchRow = [ifsc: string, branch: string, city: string, state: string];
type Directory = Record<string, BranchRow[]>;
type BranchResult = { ifsc: string; branch: string; city: string; state: string };
const POPULAR_BANKS = [
  'State Bank of India', 'Indian Bank', 'HDFC Bank', 'ICICI Bank',
  'Axis Bank', 'Canara Bank', 'Indian Overseas Bank', 'IDFC FIRST Bank',
  'Punjab National Bank', 'Union Bank of India', 'Bank of Baroda',
];

/** Searchable, all-India IFSC snapshot; frequently-used suggestions are never a restriction. */
@Injectable()
export class BankDirectoryService {
  constructor(private readonly prisma: PrismaService) {}
  private directory: Directory | undefined;

  private data(): Directory {
    if (!this.directory) {
      // Resolves beside API source/dist, even in a separately deployed client release.
      const filenamePath = fileURLToPath(new URL('../../data/ifsc-branches.v2.0.62.json.gz', import.meta.url));
      this.directory = JSON.parse(gunzipSync(readFileSync(filenamePath)).toString('utf8')) as Directory;
    }
    return this.directory;
  }

  async listBanks(): Promise<{ name: string; suggested: 'frequent' | 'popular' | null }[]> {
    const names = Object.keys(this.data()).sort((a, b) => a.localeCompare(b, 'en'));
    const byNormalizedName = new Map(names.map((name) => [name.trim().toLowerCase(), name]));
    const [customers, beneficiaries] = await Promise.all([
      this.prisma.customerBankAccount.groupBy({
        by: ['bankName'], where: { isActive: true }, _count: { bankName: true },
      }),
      this.prisma.beneficiaryAccount.groupBy({
        by: ['bankName'], where: { isActive: true, accountType: 'BANK', bankName: { not: null } },
        _count: { bankName: true },
      }),
    ]);
    const count = new Map<string, number>();
    for (const row of [...customers, ...beneficiaries]) {
      const name = byNormalizedName.get((row.bankName ?? '').trim().toLowerCase());
      if (name) count.set(name, (count.get(name) ?? 0) + row._count.bankName);
    }
    const frequent = [...count].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);
    const popular = POPULAR_BANKS.map((name) => byNormalizedName.get(name.toLowerCase())).filter((name): name is string => !!name);
    const suggested = [...new Set([...frequent, ...popular])];
    const first = new Set(suggested);
    return [...suggested, ...names.filter((name) => !first.has(name))].map((name) => ({
      name, suggested: frequent.includes(name) ? 'frequent' as const : popular.includes(name) ? 'popular' as const : null,
    }));
  }

  async searchBranches(bank: string | undefined, search: string | undefined): Promise<BranchResult[]> {
    const name = (bank ?? '').trim();
    const rows = this.data()[name];
    if (!rows) return [];
    const query = (search ?? '').trim();
    const terms = query.toUpperCase().split(/\s+/).filter(Boolean);
    const toResult = ([ifsc, branch, city, state]: BranchRow): BranchResult => ({ ifsc, branch, city, state });
    if (!query) {
      // Fast shortcuts based on actual stored destinations; remaining branches are always searchable.
      const [customers, beneficiaries] = await Promise.all([
        this.prisma.customerBankAccount.groupBy({
          by: ['ifsc'], where: { isActive: true, bankName: name, ifsc: { not: null } },
          _count: { ifsc: true },
        }),
        this.prisma.beneficiaryAccount.groupBy({
          by: ['ifsc'], where: { isActive: true, accountType: 'BANK', bankName: name, ifsc: { not: null } },
          _count: { ifsc: true },
        }),
      ]);
      const counts = new Map<string, number>();
      for (const row of [...customers, ...beneficiaries]) {
        if (row.ifsc) counts.set(row.ifsc.toUpperCase(), (counts.get(row.ifsc.toUpperCase()) ?? 0) + row._count.ifsc);
      }
      return rows.filter(([ifsc]) => counts.has(ifsc)).sort((a, b) => (counts.get(b[0]) ?? 0) - (counts.get(a[0]) ?? 0)).slice(0, 8).map(toResult);
    }
    if (query.length < 2) return [];
    const found: BranchResult[] = [];
    for (const row of rows) {
      const haystack = row.join(' ').toUpperCase();
      if (terms.every((term) => haystack.includes(term))) found.push(toResult(row));
      if (found.length >= 40) break;
    }
    return found;
  }
}
