ALTER TABLE "CashTransferDetail"
  ADD COLUMN "customerBankAccountId" TEXT,
  ADD COLUMN "customerUpiAccountId" TEXT,
  ADD COLUMN "transferChargeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "transferChargeType" TEXT;

ALTER TABLE "CashTransferDetail"
  ADD CONSTRAINT "CashTransferDetail_customerBankAccountId_fkey"
  FOREIGN KEY ("customerBankAccountId") REFERENCES "CustomerBankAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashTransferDetail"
  ADD CONSTRAINT "CashTransferDetail_customerUpiAccountId_fkey"
  FOREIGN KEY ("customerUpiAccountId") REFERENCES "CustomerUpiAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CashTransferDetail_customerBankAccountId_idx"
  ON "CashTransferDetail"("customerBankAccountId");

CREATE INDEX "CashTransferDetail_customerUpiAccountId_idx"
  ON "CashTransferDetail"("customerUpiAccountId");
