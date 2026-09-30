CREATE TABLE "CustomerServiceProfile" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "nickname" TEXT,
  "providerName" TEXT,
  "referenceNumber" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerServiceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceProfile_customerId_serviceName_referenceNumber_key"
  ON "CustomerServiceProfile"("customerId", "serviceName", "referenceNumber");
CREATE INDEX "CustomerServiceProfile_customerId_serviceName_isActive_idx"
  ON "CustomerServiceProfile"("customerId", "serviceName", "isActive");

ALTER TABLE "CustomerServiceProfile"
  ADD CONSTRAINT "CustomerServiceProfile_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuickCashTransferDetail"
  ADD COLUMN "serviceProfileId" TEXT,
  ADD COLUMN "serviceReferenceLabel" TEXT,
  ADD COLUMN "serviceProviderName" TEXT,
  ADD COLUMN "serviceReferenceNumber" TEXT;

CREATE INDEX "QuickCashTransferDetail_serviceProfileId_idx"
  ON "QuickCashTransferDetail"("serviceProfileId");

ALTER TABLE "QuickCashTransferDetail"
  ADD CONSTRAINT "QuickCashTransferDetail_serviceProfileId_fkey"
  FOREIGN KEY ("serviceProfileId") REFERENCES "CustomerServiceProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
