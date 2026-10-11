-- Match earlier customer Card Ledger Pay Out advances against later card swipes.
-- Accounting application posts no second payment against an asset account.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_ADVANCE_OFFSET';
ALTER TABLE "CustomerPayable" ADD COLUMN "offsetAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "CustomerLedgerEntryDetail" ADD COLUMN "advanceAppliedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
CREATE TABLE "CustomerAdvanceOffset" (
  "id" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "advanceEntryId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversedById" TEXT,
  "reversalTransactionId" TEXT,
  CONSTRAINT "CustomerAdvanceOffset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerAdvanceOffset_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "CustomerAdvanceOffset_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "CustomerPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerAdvanceOffset_advanceEntryId_fkey" FOREIGN KEY ("advanceEntryId") REFERENCES "CustomerLedgerEntryDetail"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomerAdvanceOffset_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerAdvanceOffset_transactionId_key" ON "CustomerAdvanceOffset"("transactionId");
CREATE UNIQUE INDEX "CustomerAdvanceOffset_reversalTransactionId_key" ON "CustomerAdvanceOffset"("reversalTransactionId");
CREATE INDEX "CustomerAdvanceOffset_payableId_createdAt_idx" ON "CustomerAdvanceOffset"("payableId","createdAt");
CREATE INDEX "CustomerAdvanceOffset_advanceEntryId_createdAt_idx" ON "CustomerAdvanceOffset"("advanceEntryId","createdAt");
