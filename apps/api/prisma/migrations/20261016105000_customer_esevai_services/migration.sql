-- Multiple E-Sevai service details per customer, without altering existing records.
CREATE TABLE "CustomerEsevaiService" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "esevaiName" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerEsevaiService_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerEsevaiService_customerId_fkey" FOREIGN KEY ("customerId")
    REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CustomerEsevaiService_customerId_isActive_idx" ON "CustomerEsevaiService"("customerId", "isActive");
