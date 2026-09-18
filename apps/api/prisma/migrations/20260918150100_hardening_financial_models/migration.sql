-- Provider settlement lifecycle
CREATE TYPE "ProviderSettlementStatus" AS ENUM (
  'PENDING',
  'PARTIALLY_SETTLED',
  'SETTLED',
  'CANCELLED',
  'REVERSED'
);

CREATE TYPE "ReceivableReasonCategory" AS ENUM (
  'ADVANCE',
  'SETTLEMENT_DUE',
  'SHORTAGE_RECOVERY',
  'LOAN',
  'ADJUSTMENT',
  'OTHER'
);

ALTER TABLE "CustomerReceivable"
  ADD COLUMN "reasonCategory" "ReceivableReasonCategory" NOT NULL DEFAULT 'OTHER';

ALTER TABLE "CashSession"
  ADD COLUMN "adjustmentTransactionId" TEXT;

ALTER TABLE "LedgerEntry"
  ADD COLUMN "providerSettlementId" TEXT;

CREATE TABLE "ProviderSettlement" (
  "id" TEXT NOT NULL,
  "sourceTransactionId" TEXT NOT NULL,
  "providerId" TEXT,
  "gatewayId" TEXT,
  "expectedAmount" DECIMAL(18,2) NOT NULL,
  "receivedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(18,2) NOT NULL,
  "destinationAccountId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "status" "ProviderSettlementStatus" NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderSettlementReceipt" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "destinationAccountId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "referenceNumber" TEXT,
  "notes" TEXT,
  "status" "PaymentStatus" NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderSettlementReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyReceivableSummary" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "openingReceivable" DECIMAL(18,2) NOT NULL,
  "newReceivables" DECIMAL(18,2) NOT NULL,
  "collectionsMade" DECIMAL(18,2) NOT NULL,
  "closingReceivable" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyReceivableSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyPositionSummary" (
  "id" TEXT NOT NULL,
  "businessDate" DATE NOT NULL,
  "availableFunds" DECIMAL(18,2) NOT NULL,
  "pendingProviderSettlements" DECIMAL(18,2) NOT NULL,
  "customerReceivable" DECIMAL(18,2) NOT NULL,
  "customerPayable" DECIMAL(18,2) NOT NULL,
  "ownerCreditCardOutstanding" DECIMAL(18,2) NOT NULL,
  "operatingPosition" DECIMAL(18,2) NOT NULL,
  "netFinancialPosition" DECIMAL(18,2) NOT NULL,
  "cashVariance" DECIMAL(18,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyPositionSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderSettlement_sourceTransactionId_key"
  ON "ProviderSettlement"("sourceTransactionId");
CREATE INDEX "ProviderSettlement_providerId_gatewayId_idx"
  ON "ProviderSettlement"("providerId", "gatewayId");
CREATE INDEX "ProviderSettlement_status_dueAt_idx"
  ON "ProviderSettlement"("status", "dueAt");
CREATE INDEX "ProviderSettlement_destinationAccountId_idx"
  ON "ProviderSettlement"("destinationAccountId");

CREATE UNIQUE INDEX "ProviderSettlementReceipt_transactionId_key"
  ON "ProviderSettlementReceipt"("transactionId");
CREATE INDEX "ProviderSettlementReceipt_settlementId_idx"
  ON "ProviderSettlementReceipt"("settlementId");
CREATE INDEX "ProviderSettlementReceipt_destinationAccountId_idx"
  ON "ProviderSettlementReceipt"("destinationAccountId");

CREATE UNIQUE INDEX "CashSession_adjustmentTransactionId_key"
  ON "CashSession"("adjustmentTransactionId");
CREATE INDEX "LedgerEntry_providerSettlementId_idx"
  ON "LedgerEntry"("providerSettlementId");
CREATE UNIQUE INDEX "DailyReceivableSummary_businessDate_key"
  ON "DailyReceivableSummary"("businessDate");
CREATE UNIQUE INDEX "DailyPositionSummary_businessDate_key"
  ON "DailyPositionSummary"("businessDate");

ALTER TABLE "ProviderSettlement"
  ADD CONSTRAINT "ProviderSettlement_sourceTransactionId_fkey"
  FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderSettlement"
  ADD CONSTRAINT "ProviderSettlement_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderSettlement"
  ADD CONSTRAINT "ProviderSettlement_gatewayId_fkey"
  FOREIGN KEY ("gatewayId") REFERENCES "ProviderGateway"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderSettlement"
  ADD CONSTRAINT "ProviderSettlement_destinationAccountId_fkey"
  FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderSettlementReceipt"
  ADD CONSTRAINT "ProviderSettlementReceipt_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "ProviderSettlement"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderSettlementReceipt"
  ADD CONSTRAINT "ProviderSettlementReceipt_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderSettlementReceipt"
  ADD CONSTRAINT "ProviderSettlementReceipt_destinationAccountId_fkey"
  FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashSession"
  ADD CONSTRAINT "CashSession_adjustmentTransactionId_fkey"
  FOREIGN KEY ("adjustmentTransactionId") REFERENCES "Transaction"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_providerSettlementId_fkey"
  FOREIGN KEY ("providerSettlementId") REFERENCES "ProviderSettlement"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- System assets/expense ledgers for conservative settlement recognition and
-- physical cash reconciliation.
INSERT INTO "LedgerAccount"
  ("id", "ledgerCode", "ledgerName", "ledgerType", "ledgerCategory", "isActive", "createdAt")
VALUES
  ('cl-sys-provider-clearing', 'SYS-PROVIDER-CLEARING', 'Provider Settlement Clearing', 'ASSET', 'PROVIDER_CLEARING', true, CURRENT_TIMESTAMP),
  ('cl-sys-cash-over-short', 'SYS-CASH-OVER-SHORT', 'Cash Over / Short', 'EXPENSE', 'CASH_VARIANCE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("ledgerCode") DO NOTHING;
