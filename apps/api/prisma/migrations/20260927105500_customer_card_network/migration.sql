ALTER TABLE "CustomerCard" ADD COLUMN "cardNetworkId" TEXT;
CREATE INDEX "CustomerCard_cardNetworkId_idx" ON "CustomerCard"("cardNetworkId");
ALTER TABLE "CustomerCard" ADD CONSTRAINT "CustomerCard_cardNetworkId_fkey" FOREIGN KEY ("cardNetworkId") REFERENCES "CardNetwork"("id") ON DELETE SET NULL ON UPDATE CASCADE;
