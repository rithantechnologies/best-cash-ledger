-- Add 12-digit PR numbers without changing or deleting saved six-digit references.
-- The old column remains available during staged upgrades of the dev app.
ALTER TABLE "CustomerAepsAccount" ALTER COLUMN "aadhaarLastSix" DROP NOT NULL;
ALTER TABLE "CustomerAepsAccount" ADD COLUMN "prNumber" TEXT;
ALTER TABLE "CustomerAepsAccount" ADD CONSTRAINT "CustomerAepsAccount_pr_number_format"
  CHECK ("prNumber" IS NULL OR "prNumber" ~ '^[0-9]{12}$');
CREATE INDEX "CustomerAepsAccount_prNumber_idx" ON "CustomerAepsAccount"("prNumber");
