ALTER TABLE "Transaction"
ADD COLUMN "correctionSourceTransactionId" TEXT,
ADD COLUMN "correctionReason" TEXT;

CREATE INDEX "Transaction_correctionSourceTransactionId_idx"
ON "Transaction"("correctionSourceTransactionId");
