ALTER TABLE "CashTransferDetail"
ADD COLUMN "cashAccountId" TEXT NOT NULL;

ALTER TABLE "AepsDetail"
ADD COLUMN "cashAccountId" TEXT NOT NULL;

ALTER TABLE "CashTransferDetail"
ADD CONSTRAINT "CashTransferDetail_cashAccountId_fkey"
FOREIGN KEY ("cashAccountId") REFERENCES "FinancialAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AepsDetail"
ADD CONSTRAINT "AepsDetail_cashAccountId_fkey"
FOREIGN KEY ("cashAccountId") REFERENCES "FinancialAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
