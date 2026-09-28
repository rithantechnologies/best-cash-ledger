import { Injectable } from '@nestjs/common';
import { AccountType, CalculationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type ResolvedProviderPayoutCharge = {
  amount: number;
  calculationType: CalculationType;
  rate: number;
  providerId: string;
  ruleId: string;
};

@Injectable()
export class ProviderPayoutChargeService {
  constructor(private readonly prisma: PrismaService) {}

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async resolve(
    tx: Prisma.TransactionClient,
    sourceAccount: { accountType: AccountType; providerId: string | null },
    payoutAmount: number,
    transactionAt = new Date(),
  ): Promise<ResolvedProviderPayoutCharge | null> {
    if (
      sourceAccount.accountType !== AccountType.PROVIDER_WALLET ||
      !sourceAccount.providerId ||
      payoutAmount <= 0
    ) {
      return null;
    }

    const rule = await tx.providerPayoutChargeRule.findFirst({
      where: {
        providerId: sourceAccount.providerId,
        effectiveFrom: { lte: transactionAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: transactionAt } }],
        minAmount: { lte: payoutAmount },
        AND: [
          {
            OR: [
              { maxAmount: null },
              { maxAmount: { gte: payoutAmount } },
            ],
          },
        ],
      },
      orderBy: { minAmount: 'desc' },
    });
    if (!rule) return null;

    const rate = Number(rule.value);
    const amount = this.money(
      rule.calculationType === CalculationType.PERCENTAGE
        ? payoutAmount * rate / 100
        : rate,
    );
    return {
      amount,
      calculationType: rule.calculationType,
      rate,
      providerId: sourceAccount.providerId,
      ruleId: rule.id,
    };
  }
}
