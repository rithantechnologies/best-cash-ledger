CREATE TABLE "ProviderPayoutChargeRule" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "minAmount" DECIMAL(18,2) NOT NULL,
  "maxAmount" DECIMAL(18,2),
  "calculationType" "CalculationType" NOT NULL,
  "value" DECIMAL(18,4) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderPayoutChargeRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderPayoutChargeRule_providerId_effectiveFrom_effectiveTo_idx"
  ON "ProviderPayoutChargeRule"("providerId", "effectiveFrom", "effectiveTo");
CREATE INDEX "ProviderPayoutChargeRule_providerId_minAmount_maxAmount_idx"
  ON "ProviderPayoutChargeRule"("providerId", "minAmount", "maxAmount");
ALTER TABLE "ProviderPayoutChargeRule"
  ADD CONSTRAINT "ProviderPayoutChargeRule_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransactionCharge"
  ADD COLUMN "sourceAccountId" TEXT,
  ADD COLUMN "providerPayoutChargeRuleId" TEXT;
CREATE INDEX "TransactionCharge_sourceAccountId_idx" ON "TransactionCharge"("sourceAccountId");
CREATE INDEX "TransactionCharge_providerPayoutChargeRuleId_idx" ON "TransactionCharge"("providerPayoutChargeRuleId");
ALTER TABLE "TransactionCharge"
  ADD CONSTRAINT "TransactionCharge_sourceAccountId_fkey"
  FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransactionCharge"
  ADD CONSTRAINT "TransactionCharge_providerPayoutChargeRuleId_fkey"
  FOREIGN KEY ("providerPayoutChargeRuleId") REFERENCES "ProviderPayoutChargeRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ProviderPayoutChargeRule"
  ("id","providerId","minAmount","maxAmount","calculationType","value","effectiveFrom","createdAt","updatedAt")
SELECT gen_random_uuid()::text, p."id", slab.min_amount, slab.max_amount, 'FIXED'::"CalculationType", slab.charge, CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Provider" p
CROSS JOIN (VALUES
  (100.00::numeric, 1000.00::numeric, 5.00::numeric),
  (1001.00::numeric, 25000.00::numeric, 7.00::numeric),
  (25001.00::numeric, NULL::numeric, 15.00::numeric)
) AS slab(min_amount,max_amount,charge)
WHERE UPPER(REGEXP_REPLACE(p."name", '[^A-Za-z0-9]', '', 'g')) = 'PAYSWITCH';
