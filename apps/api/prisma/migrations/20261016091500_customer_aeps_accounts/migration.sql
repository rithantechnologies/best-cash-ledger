-- Store only a six-digit AEPS lookup reference, not a complete Aadhaar number.
CREATE TABLE "CustomerAepsAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "aadhaarLastSix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerAepsAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerAepsAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerAepsAccount_last_six_format" CHECK ("aadhaarLastSix" ~ '^[0-9]{6}$')
);
CREATE INDEX "CustomerAepsAccount_customerId_isActive_idx" ON "CustomerAepsAccount"("customerId","isActive");
CREATE INDEX "CustomerAepsAccount_aadhaarLastSix_idx" ON "CustomerAepsAccount"("aadhaarLastSix");
