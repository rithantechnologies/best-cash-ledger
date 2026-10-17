import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A shared, version-independent directory on the client VPS; override on future VPS.
const IMAGE_DIRECTORY = process.env.CASHLEDGER_BANK_IMAGES_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/var/www/cashledger/releases/.client-bank-images'
    : resolve(process.cwd(), 'data', 'account-images'));

export function bankImageType(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    return 'image/png';
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 &&
      data[2] === 0xff && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9)
    return 'image/jpeg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

@Injectable()
export class AccountImagesService {
  constructor(private readonly prisma: PrismaService) {}

  private async account(id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Bank account not found');
    const account = await this.prisma.financialAccount.findUnique({
      where: { id }, select: { id: true, accountType: true },
    });
    if (!account || (account.accountType !== AccountType.BANK && account.accountType !== AccountType.UPI)) {
      throw new NotFoundException('Bank account not found');
    }
    return account;
  }

  private filename(id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Bank account not found');
    return join(IMAGE_DIRECTORY, id.toLowerCase() + '.img');
  }

  async get(id: string): Promise<{ contents: Buffer; contentType: string }> {
    await this.account(id);
    let contents: Buffer;
    try { contents = await readFile(this.filename(id)); }
    catch (error: any) {
      if (error?.code === 'ENOENT') throw new NotFoundException('No custom bank image');
      throw error;
    }
    const contentType = bankImageType(contents);
    if (!contentType) throw new NotFoundException('Bank image unavailable');
    return { contents, contentType };
  }

  async upload(id: string, contents: Buffer | undefined, actorId: string) {
    await this.account(id);
    if (!contents || contents.length < 12 || contents.length > MAX_IMAGE_BYTES)
      throw new BadRequestException('Choose an image smaller than 2 MB');
    const contentType = bankImageType(contents);
    if (!contentType) throw new BadRequestException('Only genuine PNG, JPEG and WebP images are allowed');
    await mkdir(IMAGE_DIRECTORY, { recursive: true, mode: 0o770 });
    const final = this.filename(id);
    const temporary = join(IMAGE_DIRECTORY, '.' + randomUUID() + '.tmp');
    let previous: Buffer | null = null;
    try { previous = await readFile(final); }
    catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
    try {
      await writeFile(temporary, contents, { mode: 0o600, flag: 'wx' });
      await rename(temporary, final);
      await this.prisma.auditLog.create({ data: {
        userId: actorId, entityType: 'FINANCIAL_ACCOUNT', entityId: id,
        action: 'SET_BANK_IMAGE',
        oldValues: { customImage: Boolean(previous) },
        newValues: {
          customImage: true, contentType, bytes: contents.length,
          sha256: createHash('sha256').update(contents).digest('hex'),
        },
      } });
    } catch (error) {
      // Restore previous image if audit recording fails.
      if (previous) await writeFile(final, previous);
      else await rm(final, { force: true });
      throw error;
    } finally { await rm(temporary, { force: true }); }
    return { uploaded: true };
  }

  async remove(id: string, actorId: string) {
    await this.account(id);
    const filename = this.filename(id);
    let previous: Buffer;
    try { previous = await readFile(filename); }
    catch (error: any) {
      if (error?.code === 'ENOENT') return { removed: false };
      throw error;
    }
    await rm(filename);
    try {
      await this.prisma.auditLog.create({ data: {
        userId: actorId, entityType: 'FINANCIAL_ACCOUNT', entityId: id,
        action: 'REMOVE_BANK_IMAGE',
        oldValues: { customImage: true }, newValues: { customImage: false },
      } });
    } catch (error) { await writeFile(filename, previous); throw error; }
    return { removed: true };
  }
}
