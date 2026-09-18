-- Extend transaction and ledger enums
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_RECEIVABLE';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_RECEIPT';
ALTER TYPE "LedgerType" ADD VALUE IF NOT EXISTS 'EQUITY';

-- Receivable lifecycle status
CREATE TYPE "ReceivableStatus" AS ENUM (
  'PENDING',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'OVERDUE',
  'CANCELLED',
  'REVERSED'
);

-- Customer receivable master
CREATE TABLE "CustomerReceivable" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "sourceTransactionId" TEXT NOT NULL,
  "sourceAccountId" TEXT,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "originalAmount" DECIMAL(18,2) NOT NULL,
  "receivedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(18,2) NOT NULL,
  "dueAt" TIMESTAMP(3),
  "status" "ReceivableStatus" NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerReceivable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReceivableCollection" (
  "id" TEXT NOT NULL,
  "receivableId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "collectionDate" TIMESTAMP(3) NOT NULL,
  "destinationAccountId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "referenceNumber" TEXT,
  "notes" TEXT,
  "status" "PaymentStatus" NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceivableCollection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LedgerEntry" ADD COLUMN "receivableId" TEXT;
CREATE UNIQUE INDEX "CustomerReceivable_sourceTransactionId_key"
  ON "CustomerReceivable"("sourceTransactionId");
CREATE INDEX "CustomerReceivable_customerId_idx"
  ON "CustomerReceivable"("customerId");
CREATE INDEX "CustomerReceivable_status_dueAt_idx"
  ON "CustomerReceivable"("status", "dueAt");
CREATE UNIQUE INDEX "ReceivableCollection_transactionId_key"
  ON "ReceivableCollection"("transactionId");
CREATE INDEX "ReceivableCollection_receivableId_idx"
  ON "ReceivableCollection"("receivableId");
CREATE INDEX "ReceivableCollection_destinationAccountId_idx"
  ON "ReceivableCollection"("destinationAccountId");

ALTER TABLE "CustomerReceivable"
  ADD CONSTRAINT "CustomerReceivable_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerReceivable"
  ADD CONSTRAINT "CustomerReceivable_sourceTransactionId_fkey"
  FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerReceivable"
  ADD CONSTRAINT "CustomerReceivable_sourceAccountId_fkey"
  FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReceivableCollection"
  ADD CONSTRAINT "ReceivableCollection_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "CustomerReceivable"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableCollection"
  ADD CONSTRAINT "ReceivableCollection_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableCollection"
  ADD CONSTRAINT "ReceivableCollection_destinationAccountId_fkey"
  FOREIGN KEY ("destinationAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "CustomerReceivable"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LedgerEntry_receivableId_idx" ON "LedgerEntry"("receivableId");
