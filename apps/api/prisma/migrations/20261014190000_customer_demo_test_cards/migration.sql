-- Demo-only synthetic test card vault, separate from actual customer cards.
CREATE TABLE "CustomerDemoCard" (
  "id" TEXT NOT NULL,
  "customerCardId" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerDemoCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerDemoCard_customerCardId_key" ON "CustomerDemoCard"("customerCardId");
ALTER TABLE "CustomerDemoCard" ADD CONSTRAINT "CustomerDemoCard_customerCardId_fkey" FOREIGN KEY ("customerCardId") REFERENCES "CustomerCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
