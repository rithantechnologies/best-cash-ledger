import { describe, expect, it } from 'vitest';
import { AccountType } from '@prisma/client';
import { requireWholeRupeeCashPayout } from './financial-validation.service.js';

describe('whole-rupee physical customer payouts',()=>{
  it('blocks five-paise physical cash payouts without affecting wallet payouts',()=>{
    expect(()=>requireWholeRupeeCashPayout(AccountType.CASH,0.05)).toThrow(/whole-rupee/);
    expect(()=>requireWholeRupeeCashPayout(AccountType.CASH,125.50)).toThrow(/whole-rupee/);
    expect(()=>requireWholeRupeeCashPayout(AccountType.CASH,125)).not.toThrow();
    expect(()=>requireWholeRupeeCashPayout(AccountType.PROVIDER_WALLET,0.05)).not.toThrow();
    expect(()=>requireWholeRupeeCashPayout(AccountType.BANK,125.50)).not.toThrow();
  });
});
