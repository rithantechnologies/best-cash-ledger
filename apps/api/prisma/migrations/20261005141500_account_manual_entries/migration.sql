ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'ACCOUNT_ENTRY';

CREATE TABLE "AccountEntryDetail" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "entryKind" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "entryLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountEntryDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountEntryDetail_transactionId_key"
  ON "AccountEntryDetail"("transactionId");
CREATE INDEX "AccountEntryDetail_accountId_idx"
  ON "AccountEntryDetail"("accountId");

ALTER TABLE "AccountEntryDetail"
  ADD CONSTRAINT "AccountEntryDetail_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountEntryDetail"
  ADD CONSTRAINT "AccountEntryDetail_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "LedgerAccount"
  ("id", "ledgerCode", "ledgerName", "ledgerType", "ledgerCategory", "isActive", "createdAt")
VALUES
  ('cl-sys-loan-liability', 'SYS-LOAN-LIABILITY', 'Loan Liability', 'LIABILITY', 'LOAN_LIABILITY', true, CURRENT_TIMESTAMP),
  ('cl-sys-owner-funding', 'SYS-OWNER-FUNDING', 'Owner Funding / Capital', 'EQUITY', 'OWNER_FUNDING', true, CURRENT_TIMESTAMP),
  ('cl-sys-account-adjustment', 'SYS-ACCOUNT-ADJUSTMENT', 'Account Non-Income Adjustment', 'EQUITY', 'ACCOUNT_ADJUSTMENT', true, CURRENT_TIMESTAMP)
ON CONFLICT ("ledgerCode") DO NOTHING;
