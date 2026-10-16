import { describe, expect, it, vi } from 'vitest';
import { EntryType, RoleName, Prisma, TransactionType } from '@prisma/client';
import { CashCounterService } from './cash-counter.service.js';

// Service-level cash custody simulations. All storage is in memory; no connection
// to the real client database, no actual transaction and no live balance changes.
const reserve = { id: 'owner-shop', accountName: 'Main Cash Reserve', ledgerAccount: { id: 'led-owner' } };
const staff = { id: 'staff-till', accountName: 'Staff Counter Drawer', ledgerAccount: { id: 'led-staff' } };
const home = { id: 'owner-home', accountName: 'Owner Home Reserve', ledgerAccount: { id: 'led-home' } };

function fixture() {
  const accounts: Record<string, typeof reserve> = {
    [reserve.id]: reserve, [staff.id]: staff, [home.id]: home,
  };
  const posted: Array<{ entries: Array<{ ledgerAccountId: string; entryType: EntryType; amount: number }> }>=[];
  const transfers: any[]=[];
  const sessions: any[]=[];
  const audit: any[]=[];
  const tx: any = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    transaction: { create: vi.fn(async ({data}:any)=>({ id:'transfer-'+(transfers.length+1), ...data })) },
    internalTransferDetail: { create: vi.fn(async ({data}:any)=>{transfers.push(data);return data}) },
    cashSession: {
      create: vi.fn(async ({data}:any)=>{
        const session={id:'session-'+(sessions.length+1),...data,
          cashAccount:accounts[data.cashAccountId],denominationCounts:[],closedAt:null,
          expectedClosingTotal:null,actualClosingTotal:null,differenceAmount:null,closedById:null,
          closingNotes:null,adjustmentTransactionId:null};
        sessions.push(session);return session;
      }),
      findFirst: vi.fn(async ({where}:any)=>sessions.find(s=>s.cashAccountId===where.cashAccountId&&s.status===where.status)||null),
      findUnique: vi.fn(async ({where}:any)=>sessions.find(s=>s.id===where.id)||null),
      update: vi.fn(async ({where,data}:any)=>{
        const s=sessions.find(s=>s.id===where.id);
        Object.assign(s,data);return s;
      }),
    },
    user:{findUnique:vi.fn(async ({where}:any)=>({id:where.id,fullName:where.id,isActive:true}))},
    auditLog:{create:vi.fn(async ({data}:any)=>{audit.push(data);return data})},
  };
  const prisma:any={
    cashSession:{findFirst:tx.cashSession.findFirst},
    user:{findUnique:tx.user.findUnique},
    $transaction:vi.fn(async (f:any)=>f(tx)),
  };
  const validation:any={
    cashAccount:vi.fn(async (_db:any,id:string)=>accounts[id]),
    lockAccount:vi.fn(async()=>undefined),
    requireOpenCashDesk:vi.fn(async()=>({id:'source-session'})),
    ensureSufficientFunds:vi.fn(async()=>undefined),
  };
  const ledger:any={ post:vi.fn(async (_tx:any,_transaction:string,_actor:string,_summary:string,entries:any[])=>{
    posted.push({entries});return {};
  }) };
  const service=new CashCounterService(prisma,ledger,validation);
  const session=(cashAccountId:string,openingTotal:number,openedById='staff-1')=>{
    const s={id:'session-'+(sessions.length+1),cashAccountId,openingTotal:new Prisma.Decimal(openingTotal),
      cashAccount:accounts[cashAccountId],openedById,openedAt:new Date(),
      status:'OPEN',denominationCounts:[],closedAt:null,expectedClosingTotal:null,actualClosingTotal:null,
      differenceAmount:null,closedById:null,closingNotes:null,adjustmentTransactionId:null};
    sessions.push(s);return s;
  };
  return {service,prisma,tx,validation,ledger,posted,transfers,sessions,audit,session};
}
const notes=(amount:number)=>[{denomination:500,quantity:amount/500}];

describe('Cash drawer custody workflow — in-memory simulation',()=>{
  it('moves ₹50,000 from an open owner reserve to a staff drawer when starting a shift', async ()=>{
    const x=fixture();
    const result=await x.service.open({
      cashAccountId:staff.id,sourceCashAccountId:reserve.id,
      responsibleUserId:'staff-1',denominations:notes(50000)
    },'owner-1',RoleName.OWNER);
    expect(Number(result.openingTotal)).toBe(50000);
    expect(result.openedById).toBe('staff-1');
    expect(x.transfers).toHaveLength(1);
    expect(x.transfers[0]).toMatchObject({sourceAccountId:reserve.id,destinationAccountId:staff.id,transferAmount:expect.anything()});
    expect(Number(x.transfers[0].transferAmount)).toBe(50000);
    expect(x.posted).toHaveLength(1);
    expect(x.posted[0].entries).toEqual([
      expect.objectContaining({ledgerAccountId:staff.ledgerAccount.id,entryType:EntryType.DEBIT,amount:50000}),
      expect.objectContaining({ledgerAccountId:reserve.ledgerAccount.id,entryType:EntryType.CREDIT,amount:50000}),
    ]);
    expect(x.audit[0]).toMatchObject({entityType:'CASH_SESSION',action:'OPEN'});
  });

  it('records a counted ₹23,800 opening with no source as a session count, not a posted ledger transfer',async()=>{
    const x=fixture();
    const result=await x.service.open({
      cashAccountId:staff.id,denominations:[{denomination:500,quantity:47},{denomination:100,quantity:3}],
    },'staff-1',RoleName.STAFF);
    expect(Number(result.openingTotal)).toBe(23800);
    expect(x.posted).toHaveLength(0);
    expect(x.transfers).toHaveLength(0);
    // This explains why a counted opening can diverge from a zero account balance.
  });

  it('prevents a staff member from operating the special Main Cash Reserve',async()=>{
    const x=fixture();
    await expect(x.service.open({cashAccountId:reserve.id,denominations:notes(50000)},'staff-1',RoleName.STAFF))
      .rejects.toThrow(/owner-only/);
    expect(x.sessions).toHaveLength(0);
  });

  it('refuses a second open shift for a drawer that is already open',async()=>{
    const x=fixture();
    x.session(staff.id,2000);
    await expect(x.service.open({cashAccountId:staff.id,denominations:notes(50000)},'staff-2',RoleName.STAFF))
      .rejects.toThrow(/already open/);
    expect(x.sessions).toHaveLength(1);
  });

  it('rejects closing a drawer with ₹500 cash variance',async()=>{
    const x=fixture();
    const s=x.session(staff.id,50000);
    vi.spyOn(x.service as any,'expectedClosing').mockResolvedValue({expected:50000,account:staff});
    await expect(x.service.close(s.id,{denominations:notes(49500)},'staff-1',RoleName.STAFF))
      .rejects.toThrow(/Difference: -500.00/);
    expect(x.tx.cashSession.update).not.toHaveBeenCalled();
  });

  it('moves all ₹50,000 back into the owner reserve on close-and-handover',async()=>{
    const x=fixture();
    const s=x.session(staff.id,50000);
    vi.spyOn(x.service as any,'expectedClosing').mockResolvedValue({expected:50000,account:staff});
    const result=await x.service.close(s.id,{
      denominations:notes(50000),handoverToCashAccountId:reserve.id
    },'staff-1',RoleName.STAFF);
    expect(result.status).toBe('CLOSED');
    expect(x.transfers).toHaveLength(1);
    expect(x.transfers[0]).toMatchObject({sourceAccountId:staff.id,destinationAccountId:reserve.id});
    expect(Number(x.transfers[0].transferAmount)).toBe(50000);
    expect(x.posted[0].entries).toEqual([
      expect.objectContaining({ledgerAccountId:reserve.ledgerAccount.id,entryType:EntryType.DEBIT,amount:50000}),
      expect.objectContaining({ledgerAccountId:staff.ledgerAccount.id,entryType:EntryType.CREDIT,amount:50000}),
    ]);
    expect(x.audit.some(a=>a.entityType==='CASH_SESSION'&&a.action==='CLOSE')).toBe(true);
  });

  it('exposes existing home-reserve limitation: transfers require an OPEN source session',async()=>{
    const x=fixture();
    x.validation.requireOpenCashDesk.mockRejectedValue(new Error('Opening cash source needs an open cash session'));
    await expect(x.service.open({
      cashAccountId:staff.id,sourceCashAccountId:home.id,denominations:notes(50000)
    },'owner-1',RoleName.OWNER)).rejects.toThrow(/open cash session/);
    expect(x.sessions).toHaveLength(0);
  });

  it.fails('KNOWN GAP: staff must not be allowed to issue owner reserve cash to themselves',async()=>{
    const x=fixture();
    await expect(x.service.open({
      cashAccountId:staff.id,sourceCashAccountId:reserve.id,denominations:notes(50000)
    },'staff-1',RoleName.STAFF)).rejects.toThrow(/owner-only|Forbidden/);
  });

  it.fails('KNOWN GAP: two simultaneous opening requests must not produce two open drawer sessions',async()=>{
    const x=fixture();
    // Emulates simultaneous requests both passing the preflight before either creates.
    x.prisma.cashSession.findFirst=vi.fn(async()=>null);
    await Promise.all([
      x.service.open({cashAccountId:staff.id,denominations:notes(50000)},'staff-1',RoleName.STAFF),
      x.service.open({cashAccountId:staff.id,denominations:notes(50000)},'staff-1',RoleName.STAFF),
    ]);
    expect(x.sessions).toHaveLength(1);
  });

  it.todo('Owner-only audited edits of opening count and denomination details with balanced ledger corrections');
  it.todo('Owner can reconcile a closed shift without silently changing historical journal entries');
  it.todo('Source owner home reserve transfers work without an operational counter session');
  it.todo('Recipient confirms physical cash received before cross-custodian handover is final');
});
