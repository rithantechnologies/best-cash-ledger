ALTER TABLE "PayablePayment"
ADD COLUMN "destinationType" TEXT,
ADD COLUMN "destinationLabel" TEXT,
ADD COLUMN "destinationReference" TEXT,
ADD COLUMN "destinationDetails" JSONB;
