import { describe, expect, it, vi } from 'vitest';
import { BankDirectoryService } from './bank-directory.service.js';

function fixture() {
  const prisma: any = {
    customerBankAccount: {
      groupBy: vi.fn(async (args: any) => args.by[0] === 'bankName'
        ? [{ bankName: 'IDFC FIRST Bank', _count: { bankName: 4 } }]
        : [{ ifsc: 'IDFB0021001', _count: { ifsc: 4 } }]),
    },
    beneficiaryAccount: {
      groupBy: vi.fn(async () => []),
    },
  };
  return { service: new BankDirectoryService(prisma), prisma };
}

describe('Indian bank and IFSC directory', () => {
  it('keeps the complete bank list and places frequently used banks first', async () => {
    const { service } = fixture();
    const banks = await service.listBanks();
    expect(banks.length).toBeGreaterThan(1000);
    expect(banks[0]).toEqual({ name: 'IDFC FIRST Bank', suggested: 'frequent' });
    expect(banks.some((bank) => bank.name === 'State Bank of India')).toBe(true);
    expect(banks.some((bank) => bank.name === 'HDFC Bank')).toBe(true);
  });

  it('searches IFSCs for any matching branch, including another city', async () => {
    const { service } = fixture();
    const first = await service.searchBranches('HDFC Bank', 'CHENNAI ADAMBAKKAM');
    expect(first).toContainEqual(expect.objectContaining({
      ifsc: 'HDFC0001858', branch: 'ADAMBAKKAM', city: 'CHENNAI',
    }));
    const exact = await service.searchBranches('HDFC Bank', 'HDFC0001858');
    expect(exact).toHaveLength(1);
    expect(await service.searchBranches('IDFC FIRST Bank', 'HDFC0001858')).toHaveLength(0);
  });

  it('handles frequent branch suggestions without limiting search', async () => {
    const { service } = fixture();
    const suggestions = await service.searchBranches('IDFC FIRST Bank', '');
    expect(suggestions.length).toBeLessThanOrEqual(8);
    const branches = await service.searchBranches('IDFC FIRST Bank', 'CHENNAI');
    expect(branches.length).toBeGreaterThan(0);
  });
});
