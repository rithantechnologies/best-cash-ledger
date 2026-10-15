-- Keep the customer-side Pay Out destination separately from the business source account.
-- Historical manual entries remain valid, with no recipient snapshot.
ALTER TABLE "CustomerLedgerEntryDetail"
  ADD COLUMN "payoutDestination" JSONB;
