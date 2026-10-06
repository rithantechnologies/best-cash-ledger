CREATE TABLE "CustomerLedgerAllocation" (
  "id" TEXT NOT NULL,
  "customerLedgerEntryId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "payableId" TEXT,
  "cardDueClearingId" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLedgerAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerLedgerAllocation_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "CustomerLedgerAllocation_target_check" CHECK (
    ("targetType" = 'PAYABLE' AND "payableId" IS NOT NULL AND "cardDueClearingId" IS NULL)
    OR
    ("targetType" = 'CARD_DUE' AND "cardDueClearingId" IS NOT NULL AND "payableId" IS NULL)
  )
);

CREATE INDEX "CustomerLedgerAllocation_customerLedgerEntryId_idx"
  ON "CustomerLedgerAllocation"("customerLedgerEntryId");
CREATE INDEX "CustomerLedgerAllocation_payableId_idx"
  ON "CustomerLedgerAllocation"("payableId");
CREATE INDEX "CustomerLedgerAllocation_cardDueClearingId_idx"
  ON "CustomerLedgerAllocation"("cardDueClearingId");
CREATE UNIQUE INDEX "CustomerLedgerAllocation_entry_payable_key"
  ON "CustomerLedgerAllocation"("customerLedgerEntryId", "payableId")
  WHERE "payableId" IS NOT NULL;
CREATE UNIQUE INDEX "CustomerLedgerAllocation_entry_card_due_key"
  ON "CustomerLedgerAllocation"("customerLedgerEntryId", "cardDueClearingId")
  WHERE "cardDueClearingId" IS NOT NULL;

ALTER TABLE "CustomerLedgerAllocation"
  ADD CONSTRAINT "CustomerLedgerAllocation_customerLedgerEntryId_fkey"
  FOREIGN KEY ("customerLedgerEntryId") REFERENCES "CustomerLedgerEntryDetail"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAllocation"
  ADD CONSTRAINT "CustomerLedgerAllocation_payableId_fkey"
  FOREIGN KEY ("payableId") REFERENCES "CustomerPayable"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedgerAllocation"
  ADD CONSTRAINT "CustomerLedgerAllocation_cardDueClearingId_fkey"
  FOREIGN KEY ("cardDueClearingId") REFERENCES "CardDueClearingDetail"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
