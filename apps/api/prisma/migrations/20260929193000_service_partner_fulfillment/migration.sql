ALTER TABLE "ServiceCatalog"
  ADD COLUMN "allowPartnerFulfillment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "defaultPartnerName" TEXT,
  ADD COLUMN "defaultPartnerCharge" DECIMAL(18,2);

ALTER TABLE "QuickCashTransferDetail"
  ADD COLUMN "serviceFulfillmentMode" TEXT NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "servicePartnerName" TEXT,
  ADD COLUMN "servicePartnerCharge" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "servicePartnerPaymentTiming" TEXT,
  ADD COLUMN "servicePartnerPaymentAccountId" TEXT,
  ADD COLUMN "servicePartnerPaidAt" TIMESTAMP(3);

ALTER TABLE "QuickCashTransferDetail"
  ADD CONSTRAINT "QuickCashTransferDetail_servicePartnerPaymentAccountId_fkey"
  FOREIGN KEY ("servicePartnerPaymentAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "QuickCashTransferDetail_servicePartnerPaymentAccountId_idx"
  ON "QuickCashTransferDetail"("servicePartnerPaymentAccountId");

INSERT INTO "LedgerAccount"
  ("id", "ledgerCode", "ledgerName", "ledgerType", "ledgerCategory", "isActive", "createdAt")
VALUES
  ('cl-sys-service-partner-cost', 'SYS-SERVICE-PARTNER-COST', 'External Service / Partner Cost', 'EXPENSE', 'SERVICE_PARTNER_COST', true, CURRENT_TIMESTAMP),
  ('cl-sys-service-partner-payable', 'SYS-SERVICE-PARTNER-PAYABLE', 'Service Partner Payables', 'LIABILITY', 'SERVICE_PARTNER_PAYABLE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("ledgerCode") DO NOTHING;

UPDATE "ServiceCatalog"
SET
  "allowPartnerFulfillment" = true,
  "defaultPartnerCharge" = COALESCE("defaultPartnerCharge", 200)
WHERE lower("name") IN ('aadhar address correction', 'aadhaar address correction');
