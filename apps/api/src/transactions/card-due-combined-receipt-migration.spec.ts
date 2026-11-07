import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL(
  '../../prisma/migrations/20261107090000_card_due_combined_commission_allocations/migration.sql',
  import.meta.url,
), 'utf8');

describe('combined Card Due allocation database migration', () => {
  it('allows commission allocations only against a Card Due, not a payable', () => {
    expect(migration).toContain("'CARD_DUE_COMMISSION'");
    expect(migration).toMatch(/targetType" IN \('CARD_DUE', 'CARD_DUE_COMMISSION'\)/);
    expect(migration).toMatch(/"cardDueClearingId" IS NOT NULL AND "payableId" IS NULL/);
  });

  it('allows separate principal and commission rows for one receipt and case', () => {
    expect(migration).toMatch(/DROP INDEX "CustomerLedgerAllocation_entry_card_due_key"/);
    expect(migration).toMatch(/"customerLedgerEntryId", "cardDueClearingId", "targetType"/);
  });
});
