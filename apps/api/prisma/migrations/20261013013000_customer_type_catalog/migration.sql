-- Add a configurable catalog while preserving the existing enum for old integrations.
CREATE TABLE "CustomerTypeConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legacyType" "CustomerType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerTypeConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerTypeConfig_name_key" ON "CustomerTypeConfig"("name");
CREATE UNIQUE INDEX "CustomerTypeConfig_legacyType_key" ON "CustomerTypeConfig"("legacyType");

INSERT INTO "CustomerTypeConfig" ("id", "name", "legacyType", "sortOrder", "updatedAt")
VALUES
 ('0a000000-0000-4000-8000-000000000001', 'Regular', 'REGULAR', 0, CURRENT_TIMESTAMP),
 ('0a000000-0000-4000-8000-000000000002', 'Walk-in', 'WALK_IN', 1, CURRENT_TIMESTAMP);

ALTER TABLE "Customer" ADD COLUMN "customerTypeId" TEXT;
UPDATE "Customer" SET "customerTypeId" = CASE "customerType"
 WHEN 'REGULAR' THEN '0a000000-0000-4000-8000-000000000001'
 WHEN 'WALK_IN' THEN '0a000000-0000-4000-8000-000000000002'
 END;
CREATE INDEX "Customer_customerTypeId_idx" ON "Customer"("customerTypeId");
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_customerTypeId_fkey"
 FOREIGN KEY ("customerTypeId") REFERENCES "CustomerTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
