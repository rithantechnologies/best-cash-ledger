ALTER TYPE "TransactionType" ADD VALUE 'MICRO_ATM';

CREATE TABLE "MicroAtmDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "cardLastFour" TEXT NOT NULL,
    "customerBankName" TEXT,
    "withdrawalAmount" DECIMAL(18,2) NOT NULL,
    "providerId" TEXT NOT NULL,
    "gatewayId" TEXT,
    "providerCommissionRate" DECIMAL(10,4) NOT NULL,
    "providerCommissionAmount" DECIMAL(18,2) NOT NULL,
    "cashGiven" DECIMAL(18,2) NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "settlementAccountId" TEXT NOT NULL,
    "settlementAmount" DECIMAL(18,2) NOT NULL,
    "providerReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MicroAtmDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MicroAtmDetail_transactionId_key" ON "MicroAtmDetail"("transactionId");

ALTER TABLE "MicroAtmDetail"
ADD CONSTRAINT "MicroAtmDetail_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MicroAtmDetail"
ADD CONSTRAINT "MicroAtmDetail_cashAccountId_fkey"
FOREIGN KEY ("cashAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MicroAtmDetail"
ADD CONSTRAINT "MicroAtmDetail_settlementAccountId_fkey"
FOREIGN KEY ("settlementAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
