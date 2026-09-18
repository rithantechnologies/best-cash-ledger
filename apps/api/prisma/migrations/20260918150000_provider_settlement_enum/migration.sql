-- Add provider settlement transaction type in its own migration so PostgreSQL
-- can safely use the new enum value in subsequent migrations.
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'PROVIDER_SETTLEMENT';
