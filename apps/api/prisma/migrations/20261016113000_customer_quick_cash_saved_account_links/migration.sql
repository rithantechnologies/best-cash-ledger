-- Link quick entries and AEPS transactions to active customer saved accounts.
-- Existing historical snapshots and journal postings are not changed.
ALTER TABLE "QuickCashTransferDetail" ADD COLUMN "customerBankAccountId" TEXT;
ALTER TABLE "QuickCashTransferDetail" ADD COLUMN "customerUpiAccountId" TEXT;
ALTER TABLE "QuickCashTransferDetail" ADD COLUMN "beneficiaryAccountId" TEXT;
ALTER TABLE "QuickCashTransferDetail" ADD COLUMN "customerAepsAccountId" TEXT;
ALTER TABLE "AepsDetail" ADD COLUMN "customerAepsAccountId" TEXT;
CREATE INDEX "QuickCashTransferDetail_customerBankAccountId_idx" ON "QuickCashTransferDetail"("customerBankAccountId");
CREATE INDEX "QuickCashTransferDetail_customerUpiAccountId_idx" ON "QuickCashTransferDetail"("customerUpiAccountId");
CREATE INDEX "QuickCashTransferDetail_beneficiaryAccountId_idx" ON "QuickCashTransferDetail"("beneficiaryAccountId");
CREATE INDEX "QuickCashTransferDetail_customerAepsAccountId_idx" ON "QuickCashTransferDetail"("customerAepsAccountId");
CREATE INDEX "AepsDetail_customerAepsAccountId_idx" ON "AepsDetail"("customerAepsAccountId");
ALTER TABLE "QuickCashTransferDetail" ADD CONSTRAINT "QuickCashTransferDetail_customerBankAccountId_fkey" FOREIGN KEY ("customerBankAccountId") REFERENCES "CustomerBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuickCashTransferDetail" ADD CONSTRAINT "QuickCashTransferDetail_customerUpiAccountId_fkey" FOREIGN KEY ("customerUpiAccountId") REFERENCES "CustomerUpiAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuickCashTransferDetail" ADD CONSTRAINT "QuickCashTransferDetail_beneficiaryAccountId_fkey" FOREIGN KEY ("beneficiaryAccountId") REFERENCES "BeneficiaryAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuickCashTransferDetail" ADD CONSTRAINT "QuickCashTransferDetail_customerAepsAccountId_fkey" FOREIGN KEY ("customerAepsAccountId") REFERENCES "CustomerAepsAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AepsDetail" ADD CONSTRAINT "AepsDetail_customerAepsAccountId_fkey" FOREIGN KEY ("customerAepsAccountId") REFERENCES "CustomerAepsAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
