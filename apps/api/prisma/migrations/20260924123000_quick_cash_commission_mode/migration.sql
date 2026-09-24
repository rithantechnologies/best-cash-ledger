ALTER TABLE "QuickCashTransferDetail"
  ADD COLUMN IF NOT EXISTS "commissionMode" TEXT NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS "commissionAccountId" TEXT;

CREATE INDEX IF NOT EXISTS "QuickCashTransferDetail_commissionAccountId_idx"
  ON "QuickCashTransferDetail"("commissionAccountId");

ALTER TABLE "QuickCashTransferDetail"
  ADD CONSTRAINT "QuickCashTransferDetail_commissionAccountId_fkey"
  FOREIGN KEY ("commissionAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
