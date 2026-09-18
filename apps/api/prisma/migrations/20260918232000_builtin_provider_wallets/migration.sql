-- Every provider owns exactly one built-in provider wallet.
CREATE UNIQUE INDEX "FinancialAccount_providerId_accountType_key"
ON "FinancialAccount"("providerId", "accountType");

INSERT INTO "FinancialAccount" (
  "id","accountCode","accountName","accountType","accountNature","providerId",
  "usageType","openingBalance","isActive","createdAt","updatedAt"
)
SELECT
  'provider-wallet-' || p."id",
  'WAL-' || upper(substr(replace(p."id",'-',''),1,12)),
  p."name" || ' Wallet',
  'PROVIDER_WALLET'::"AccountType",
  'ASSET'::"AccountNature",
  p."id",
  'BUSINESS'::"UsageType",
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Provider" p
WHERE NOT EXISTS (
  SELECT 1 FROM "FinancialAccount" a
  WHERE a."providerId"=p."id" AND a."accountType"='PROVIDER_WALLET'::"AccountType"
);

INSERT INTO "LedgerAccount" (
  "id","ledgerCode","ledgerName","ledgerType","ledgerCategory","financialAccountId","isActive","createdAt"
)
SELECT
  'ledger-' || a."id",
  'LED-' || a."accountCode",
  a."accountName",
  'ASSET'::"LedgerType",
  'PROVIDER_WALLET',
  a."id",
  true,
  CURRENT_TIMESTAMP
FROM "FinancialAccount" a
WHERE a."accountType"='PROVIDER_WALLET'::"AccountType"
  AND a."providerId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "LedgerAccount" l WHERE l."financialAccountId"=a."id"
  );
