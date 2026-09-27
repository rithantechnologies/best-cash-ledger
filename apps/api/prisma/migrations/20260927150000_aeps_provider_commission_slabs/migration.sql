CREATE TABLE "AepsProviderCommissionRule" (
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
  CONSTRAINT "AepsProviderCommissionRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AepsProviderCommissionRule_providerId_effectiveFrom_effectiveTo_idx"
  ON "AepsProviderCommissionRule"("providerId", "effectiveFrom", "effectiveTo");
CREATE INDEX "AepsProviderCommissionRule_providerId_minAmount_maxAmount_idx"
  ON "AepsProviderCommissionRule"("providerId", "minAmount", "maxAmount");
ALTER TABLE "AepsProviderCommissionRule"
  ADD CONSTRAINT "AepsProviderCommissionRule_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AepsDetail"
  ADD COLUMN "providerCommissionRuleId" TEXT,
  ADD COLUMN "providerCommissionCalculationType" "CalculationType",
  ADD COLUMN "providerCommissionRate" DECIMAL(10,4),
  ADD COLUMN "providerCommissionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "AepsDetail"
  ADD CONSTRAINT "AepsDetail_providerCommissionRuleId_fkey"
  FOREIGN KEY ("providerCommissionRuleId") REFERENCES "AepsProviderCommissionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Provider"
SET "aepsProviderChargeRate" = 0
WHERE UPPER(REPLACE("name", ' ', '')) = 'DIGISEVA';

INSERT INTO "AepsProviderCommissionRule"
  ("id","providerId","minAmount","maxAmount","calculationType","value","effectiveFrom","createdAt","updatedAt")
SELECT gen_random_uuid()::text, p."id", slab.min_amount, slab.max_amount, 'FIXED'::"CalculationType", slab.commission, CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Provider" p
CROSS JOIN (VALUES
  (0.00::numeric,    199.00::numeric,  0.00::numeric),
  (200.00::numeric,  499.00::numeric,  1.00::numeric),
  (500.00::numeric, 1999.00::numeric,  4.00::numeric),
  (2000.00::numeric,2999.00::numeric,  8.00::numeric),
  (3000.00::numeric,3999.00::numeric, 10.00::numeric),
  (4000.00::numeric,5000.00::numeric, 14.00::numeric),
  (5001.00::numeric, NULL::numeric,    10.00::numeric)
) AS slab(min_amount,max_amount,commission)
WHERE UPPER(REPLACE(p."name", ' ', '')) = 'DIGISEVA';
