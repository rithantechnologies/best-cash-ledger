ALTER TYPE "TransactionType" ADD VALUE 'CARD_DUE_CLEARING';
ALTER TYPE "TransactionType" ADD VALUE 'CARD_DUE_RECOVERY';
ALTER TYPE "TransactionType" ADD VALUE 'CARD_DUE_COMMISSION_COLLECTION';

CREATE TABLE "CardDueClearingDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "customerCardId" TEXT NOT NULL,
    "advanceSourceAccountId" TEXT NOT NULL,
    "dueAmount" DECIMAL(18,2) NOT NULL,
    "commissionRate" DECIMAL(10,4) NOT NULL,
    "commissionAmount" DECIMAL(18,2) NOT NULL,
    "principalRecovered" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "principalRemaining" DECIMAL(18,2) NOT NULL,
    "commissionCollected" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "commissionRemaining" DECIMAL(18,2) NOT NULL,
    "nextFollowUpAt" TIMESTAMP(3),
    "duePaymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CardDueClearingDetail_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CardDueRecovery" (
    "id" TEXT NOT NULL,
    "clearingId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "swipeAmount" DECIMAL(18,2) NOT NULL,
    "providerId" TEXT NOT NULL,
    "gatewayId" TEXT NOT NULL,
    "providerChargeRate" DECIMAL(10,4) NOT NULL,
    "providerChargeAmount" DECIMAL(18,2) NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "recoveredAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardDueRecovery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardDueCommissionCollection" (
    "id" TEXT NOT NULL,
    "clearingId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardDueCommissionCollection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardDueClearingDetail_transactionId_key" ON "CardDueClearingDetail"("transactionId");
CREATE INDEX "CardDueClearingDetail_nextFollowUpAt_idx" ON "CardDueClearingDetail"("nextFollowUpAt");
CREATE INDEX "CardDueClearingDetail_principalRemaining_idx" ON "CardDueClearingDetail"("principalRemaining");
CREATE INDEX "CardDueClearingDetail_commissionRemaining_idx" ON "CardDueClearingDetail"("commissionRemaining");

CREATE UNIQUE INDEX "CardDueRecovery_transactionId_key" ON "CardDueRecovery"("transactionId");
CREATE INDEX "CardDueRecovery_clearingId_recoveredAt_idx" ON "CardDueRecovery"("clearingId", "recoveredAt");
CREATE INDEX "CardDueRecovery_destinationAccountId_idx" ON "CardDueRecovery"("destinationAccountId");

CREATE UNIQUE INDEX "CardDueCommissionCollection_transactionId_key" ON "CardDueCommissionCollection"("transactionId");
CREATE INDEX "CardDueCommissionCollection_clearingId_collectedAt_idx" ON "CardDueCommissionCollection"("clearingId", "collectedAt");
CREATE INDEX "CardDueCommissionCollection_destinationAccountId_idx" ON "CardDueCommissionCollection"("destinationAccountId");
ALTER TABLE "CardDueClearingDetail" ADD CONSTRAINT "CardDueClearingDetail_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueClearingDetail" ADD CONSTRAINT "CardDueClearingDetail_customerCardId_fkey" FOREIGN KEY ("customerCardId") REFERENCES "CustomerCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueClearingDetail" ADD CONSTRAINT "CardDueClearingDetail_advanceSourceAccountId_fkey" FOREIGN KEY ("advanceSourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CardDueRecovery" ADD CONSTRAINT "CardDueRecovery_clearingId_fkey" FOREIGN KEY ("clearingId") REFERENCES "CardDueClearingDetail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueRecovery" ADD CONSTRAINT "CardDueRecovery_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueRecovery" ADD CONSTRAINT "CardDueRecovery_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueRecovery" ADD CONSTRAINT "CardDueRecovery_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "ProviderGateway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueRecovery" ADD CONSTRAINT "CardDueRecovery_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CardDueCommissionCollection" ADD CONSTRAINT "CardDueCommissionCollection_clearingId_fkey" FOREIGN KEY ("clearingId") REFERENCES "CardDueClearingDetail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueCommissionCollection" ADD CONSTRAINT "CardDueCommissionCollection_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueCommissionCollection" ADD CONSTRAINT "CardDueCommissionCollection_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
