-- A separate fee receipt is a transfer to payable, not another income entry.
-- Default keeps all existing card swipes in deducted-fee mode.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'CARD_SWIPE_COMMISSION_RECEIPT';

ALTER TABLE "CardSwipeDetail"
  ADD COLUMN "commissionSettlementMode" TEXT NOT NULL DEFAULT 'DEDUCT',
  ADD COLUMN "commissionReceiptAccountId" TEXT,
  ADD COLUMN "commissionReceiptTransactionId" TEXT,
  ADD COLUMN "commissionReceiptAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CardSwipeDetail_commissionReceiptTransactionId_key"
  ON "CardSwipeDetail"("commissionReceiptTransactionId");
