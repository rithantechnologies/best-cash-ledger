-- Operational-only amount, not a journal, payable, or account movement.
-- Existing follow-ups remain NULL until staff confirms their planned amounts.
ALTER TABLE "FollowUpTask" ADD COLUMN "plannedSwipeAmount" DECIMAL(18,2);
