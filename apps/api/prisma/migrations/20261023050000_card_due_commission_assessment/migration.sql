ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CARD_DUE_COMMISSION_ASSESSMENT';

CREATE TABLE "CardDueCommissionAssessment" (
    "id" TEXT NOT NULL,
    "clearingId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardDueCommissionAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardDueCommissionAssessment_transactionId_key" ON "CardDueCommissionAssessment"("transactionId");
CREATE INDEX "CardDueCommissionAssessment_clearingId_createdAt_idx" ON "CardDueCommissionAssessment"("clearingId", "createdAt");

ALTER TABLE "CardDueCommissionAssessment"
 ADD CONSTRAINT "CardDueCommissionAssessment_clearingId_fkey"
 FOREIGN KEY ("clearingId") REFERENCES "CardDueClearingDetail"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardDueCommissionAssessment"
 ADD CONSTRAINT "CardDueCommissionAssessment_transactionId_fkey"
 FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
 ON DELETE RESTRICT ON UPDATE CASCADE;
