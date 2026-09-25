CREATE TABLE "QuickCashSourceAllocation" (
  "id" TEXT NOT NULL,
  "quickCashTransferId" TEXT NOT NULL,
  "sourceAccountId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "referenceNumber" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuickCashSourceAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuickCashSourceAllocation_quickCashTransferId_idx"
  ON "QuickCashSourceAllocation"("quickCashTransferId");

CREATE INDEX "QuickCashSourceAllocation_sourceAccountId_idx"
  ON "QuickCashSourceAllocation"("sourceAccountId");

ALTER TABLE "QuickCashSourceAllocation"
  ADD CONSTRAINT "QuickCashSourceAllocation_quickCashTransferId_fkey"
  FOREIGN KEY ("quickCashTransferId") REFERENCES "QuickCashTransferDetail"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuickCashSourceAllocation"
  ADD CONSTRAINT "QuickCashSourceAllocation_sourceAccountId_fkey"
  FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
