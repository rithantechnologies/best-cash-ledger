ALTER TABLE "Provider"
  ADD COLUMN "aepsProviderChargeRate" DECIMAL(10,4) NOT NULL DEFAULT 0;

UPDATE "Provider"
SET "aepsProviderChargeRate" = 1.6000
WHERE UPPER(REPLACE("name", ' ', '')) = 'DIGISEVA';
