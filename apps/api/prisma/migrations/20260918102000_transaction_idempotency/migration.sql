ALTER TABLE "Transaction" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Transaction_idempotencyKey_key" ON "Transaction"("idempotencyKey");
