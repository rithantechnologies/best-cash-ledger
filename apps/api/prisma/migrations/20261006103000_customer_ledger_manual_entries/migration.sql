ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CUSTOMER_LEDGER_ENTRY';

CREATE TABLE "CustomerLedgerEntryDetail" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "customerCardId" TEXT,
  "financialAccountId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "remarks" TEXT NOT NULL,
  "receivableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "payableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLedgerEntryDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerLedgerEntryDetail_transactionId_key"
  ON "CustomerLedgerEntryDetail"("transactionId");
CREATE INDEX "CustomerLedgerEntryDetail_customerCardId_idx"
  ON "CustomerLedgerEntryDetail"("customerCardId");
CREATE INDEX "CustomerLedgerEntryDetail_financialAccountId_idx"
  ON "CustomerLedgerEntryDetail"("financialAccountId");

ALTER TABLE "CustomerLedgerEntryDetail"
  ADD CONSTRAINT "CustomerLedgerEntryDetail_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntryDetail"
  ADD CONSTRAINT "CustomerLedgerEntryDetail_customerCardId_fkey"
  FOREIGN KEY ("customerCardId") REFERENCES "CustomerCard"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerEntryDetail"
  ADD CONSTRAINT "CustomerLedgerEntryDetail_financialAccountId_fkey"
  FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
