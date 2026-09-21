ALTER TABLE "Provider"
  ADD COLUMN "supportsAeps" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aepsCommissionRate" DECIMAL(10,4) NOT NULL DEFAULT 0;

UPDATE "Provider"
SET "supportsAeps" = true
WHERE UPPER("name") = 'DIGISEVA';
