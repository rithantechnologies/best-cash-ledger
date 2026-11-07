-- The combined Card Due receipt allocates principal and already-assessed
-- commission separately. Both components must be permitted against one case.
-- Keep all existing payable/card-due target shape checks and positive amounts.
ALTER TABLE "CustomerLedgerAllocation"
  DROP CONSTRAINT "CustomerLedgerAllocation_target_check";

ALTER TABLE "CustomerLedgerAllocation"
  ADD CONSTRAINT "CustomerLedgerAllocation_target_check" CHECK (
    ("targetType" = 'PAYABLE' AND "payableId" IS NOT NULL AND "cardDueClearingId" IS NULL)
    OR
    ("targetType" IN ('CARD_DUE', 'CARD_DUE_COMMISSION')
      AND "cardDueClearingId" IS NOT NULL AND "payableId" IS NULL)
  );

-- One row per receipt + case + component, not one row per receipt + case:
-- a receipt can legally settle principal AND assessed commission together.
DROP INDEX "CustomerLedgerAllocation_entry_card_due_key";
CREATE UNIQUE INDEX "CustomerLedgerAllocation_entry_card_due_key"
  ON "CustomerLedgerAllocation"("customerLedgerEntryId", "cardDueClearingId", "targetType")
  WHERE "cardDueClearingId" IS NOT NULL;
