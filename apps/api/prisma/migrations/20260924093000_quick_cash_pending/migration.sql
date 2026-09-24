CREATE TABLE "QuickCashTransferDetail" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "sourceAccountId" TEXT,
    "customerName" TEXT,
    "mobileNumber" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "commissionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "purpose" TEXT NOT NULL DEFAULT 'TRANSFER',
    "serviceName" TEXT,
    "completionTransactionId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickCashTransferDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickCashTransferDetail_transactionId_key" ON "QuickCashTransferDetail"("transactionId");
CREATE UNIQUE INDEX "QuickCashTransferDetail_completionTransactionId_key" ON "QuickCashTransferDetail"("completionTransactionId");
CREATE INDEX "QuickCashTransferDetail_cashAccountId_direction_idx" ON "QuickCashTransferDetail"("cashAccountId", "direction");
CREATE INDEX "QuickCashTransferDetail_sourceAccountId_idx" ON "QuickCashTransferDetail"("sourceAccountId");

ALTER TABLE "QuickCashTransferDetail"
ADD CONSTRAINT "QuickCashTransferDetail_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuickCashTransferDetail"
ADD CONSTRAINT "QuickCashTransferDetail_cashAccountId_fkey"
FOREIGN KEY ("cashAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuickCashTransferDetail"
ADD CONSTRAINT "QuickCashTransferDetail_sourceAccountId_fkey"
FOREIGN KEY ("sourceAccountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
