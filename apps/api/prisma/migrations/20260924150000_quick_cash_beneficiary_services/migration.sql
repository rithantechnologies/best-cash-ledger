CREATE TABLE IF NOT EXISTS "ServiceCatalog" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultAmount" DECIMAL(18,2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceCatalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceCatalog_name_key" ON "ServiceCatalog"("name");

ALTER TABLE "QuickCashTransferDetail"
  ADD COLUMN IF NOT EXISTS "beneficiaryMode" TEXT,
  ADD COLUMN IF NOT EXISTS "beneficiaryDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "servicePaymentMode" TEXT NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS "servicePaymentAccountId" TEXT;

CREATE INDEX IF NOT EXISTS "QuickCashTransferDetail_servicePaymentAccountId_idx"
  ON "QuickCashTransferDetail"("servicePaymentAccountId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'QuickCashTransferDetail_servicePaymentAccountId_fkey'
  ) THEN
    ALTER TABLE "QuickCashTransferDetail"
      ADD CONSTRAINT "QuickCashTransferDetail_servicePaymentAccountId_fkey"
      FOREIGN KEY ("servicePaymentAccountId") REFERENCES "FinancialAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
