-- Allow the same physical cash account to be opened and closed multiple times per business day.
DROP INDEX IF EXISTS "CashSession_cashAccountId_businessDate_key";
CREATE INDEX IF NOT EXISTS "CashSession_cashAccountId_businessDate_idx" ON "CashSession"("cashAccountId", "businessDate");
