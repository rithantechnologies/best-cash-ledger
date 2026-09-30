-- Pending quick-cash completion is metadata completion, not a new business date.
-- Keep the settlement/accounting movement on the original customer transaction date.
UPDATE "Transaction" AS completion
SET "transactionAt" = source."transactionAt"
FROM "QuickCashTransferDetail" AS quick
JOIN "Transaction" AS source ON source.id = quick."transactionId"
WHERE quick."completionTransactionId" = completion.id
  AND completion."transactionAt" IS DISTINCT FROM source."transactionAt";

UPDATE "LedgerJournal" AS journal
SET "postingDate" = source."transactionAt"
FROM "QuickCashTransferDetail" AS quick
JOIN "Transaction" AS source ON source.id = quick."transactionId"
WHERE quick."completionTransactionId" = journal."transactionId"
  AND journal."postingDate" IS DISTINCT FROM source."transactionAt";
