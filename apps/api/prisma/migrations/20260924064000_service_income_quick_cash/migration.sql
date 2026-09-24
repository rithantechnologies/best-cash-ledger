-- SERVICE_INCOME must exist before the quick-cash detail table is introduced.
-- The detail columns are created with that table in the later quick-cash migration.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'SERVICE_INCOME';
