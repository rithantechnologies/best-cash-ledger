ALTER TABLE "QuickCashTransferDetail"
  ADD COLUMN IF NOT EXISTS "commissionCashAmount" DECIMAL(18,2);
