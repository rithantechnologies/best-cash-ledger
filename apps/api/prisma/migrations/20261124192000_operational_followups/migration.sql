BEGIN;

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "customerId" TEXT NOT NULL,
    "cardId" TEXT,
    "providerId" TEXT,
    "gatewayId" TEXT,
    "accountId" TEXT,
    "sourceTransactionId" TEXT,
    "receiptTransactionId" TEXT,
    "expectedAmount" DECIMAL(18,2),
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "nextReminderAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpEvent" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpTask_receiptTransactionId_key" ON "FollowUpTask"("receiptTransactionId");

-- CreateIndex
CREATE INDEX "FollowUpTask_status_nextReminderAt_idx" ON "FollowUpTask"("status", "nextReminderAt");

-- CreateIndex
CREATE INDEX "FollowUpTask_customerId_status_idx" ON "FollowUpTask"("customerId", "status");

-- CreateIndex
CREATE INDEX "FollowUpTask_kind_status_idx" ON "FollowUpTask"("kind", "status");

-- CreateIndex
CREATE INDEX "FollowUpTask_sourceTransactionId_idx" ON "FollowUpTask"("sourceTransactionId");

-- CreateIndex
CREATE INDEX "FollowUpEvent_followUpId_createdAt_idx" ON "FollowUpEvent"("followUpId", "createdAt");

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CustomerCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "ProviderGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_receiptTransactionId_fkey" FOREIGN KEY ("receiptTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpEvent" ADD CONSTRAINT "FollowUpEvent_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "FollowUpTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
