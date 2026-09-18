import { ConflictException, Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async key(
    type: TransactionType,
    userId: string,
    payload: unknown,
    providedKey?: string,
  ) {
    const normalized = providedKey?.trim();
    const key = normalized
      ? 'CLIENT:' + userId + ':' + normalized.slice(0, 180)
      : this.fallbackKey(type, userId, payload);

    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey: key },
      select: { transactionNumber: true },
    });
    if (existing) {
      throw new ConflictException(
        'Duplicate request detected: ' + existing.transactionNumber,
      );
    }
    return key;
  }

  private fallbackKey(
    type: TransactionType,
    userId: string,
    payload: unknown,
  ) {
    const bucket = Math.floor(Date.now() / 30000);
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ type, payload }))
      .digest('hex')
      .slice(0, 24);
    return type + ':' + userId + ':' + bucket + ':' + fingerprint;
  }
}
