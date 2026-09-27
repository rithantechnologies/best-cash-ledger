ALTER TABLE "CashInTransferType"
ADD COLUMN "defaultCommissionRate" DECIMAL(10,4) NOT NULL DEFAULT 0;

UPDATE "CashInTransferType"
SET "defaultCommissionRate" = CASE
  WHEN "transferMode" = 'UPI' THEN 2
  WHEN "transferMode" = 'BANK' THEN 1
  ELSE 0
END;

ALTER TABLE "QuickCashTransferDetail"
ADD COLUMN "cashReceivedAmount" DECIMAL(18,2),
ADD COLUMN "customerChangeAmount" DECIMAL(18,2);
