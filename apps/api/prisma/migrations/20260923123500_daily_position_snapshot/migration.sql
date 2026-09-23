CREATE TABLE "DailyPositionSnapshot" (
    "id" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "availableFunds" DECIMAL(18,2) NOT NULL,
    "pendingProviderSettlements" DECIMAL(18,2) NOT NULL,
    "customerReceivable" DECIMAL(18,2) NOT NULL,
    "customerPayable" DECIMAL(18,2) NOT NULL,
    "ownerCreditCardOutstanding" DECIMAL(18,2) NOT NULL,
    "operatingPosition" DECIMAL(18,2) NOT NULL,
    "netFinancialPosition" DECIMAL(18,2) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DailyPositionSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyPositionSnapshot_businessDate_key" ON "DailyPositionSnapshot"("businessDate");
