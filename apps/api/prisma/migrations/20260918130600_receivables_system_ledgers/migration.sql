-- Seed receivable system ledgers after LedgerType.EQUITY is committed.
INSERT INTO "LedgerAccount"
  ("id", "ledgerCode", "ledgerName", "ledgerType", "ledgerCategory", "isActive", "createdAt")
VALUES
  ('cl-sys-cust-receivable', 'SYS-CUST-RECEIVABLE', 'Customer Receivables', 'ASSET', 'CUSTOMER_RECEIVABLE', true, CURRENT_TIMESTAMP),
  ('cl-sys-receivable-adjustment', 'SYS-RECEIVABLE-ADJUSTMENT', 'Receivable Opening Adjustments', 'EQUITY', 'RECEIVABLE_ADJUSTMENT', true, CURRENT_TIMESTAMP)
ON CONFLICT ("ledgerCode") DO NOTHING;
