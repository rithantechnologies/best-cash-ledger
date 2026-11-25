-- Operational-only attribution of existing card swipes to follow-up plans.
-- No ledger, payable, settlement, or original transaction row is modified.
CREATE TABLE "FollowUpSwipeAllocation" (
  "id" TEXT NOT NULL,
  "followUpId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "linkedById" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowUpSwipeAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FollowUpSwipeAllocation_transactionId_key" ON "FollowUpSwipeAllocation"("transactionId");
CREATE INDEX "FollowUpSwipeAllocation_followUpId_linkedAt_idx" ON "FollowUpSwipeAllocation"("followUpId", "linkedAt");
ALTER TABLE "FollowUpSwipeAllocation" ADD CONSTRAINT "FollowUpSwipeAllocation_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUpTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUpSwipeAllocation" ADD CONSTRAINT "FollowUpSwipeAllocation_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
