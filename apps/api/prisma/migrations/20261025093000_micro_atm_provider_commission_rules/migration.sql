CREATE TABLE "MicroAtmProviderCommissionRule" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MicroAtmProviderCommissionRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MicroAtmProviderCommissionRule_providerId_effectiveFrom_effectiveTo_idx"
 ON "MicroAtmProviderCommissionRule"("providerId","effectiveFrom","effectiveTo");
CREATE INDEX "MicroAtmProviderCommissionRule_providerId_minAmount_maxAmount_idx"
 ON "MicroAtmProviderCommissionRule"("providerId","minAmount","maxAmount");
ALTER TABLE "MicroAtmProviderCommissionRule"
 ADD CONSTRAINT "MicroAtmProviderCommissionRule_providerId_fkey"
 FOREIGN KEY ("providerId") REFERENCES "Provider"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
