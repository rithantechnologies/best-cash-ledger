import { describe, expect, it, vi } from 'vitest';
import { AccountNature, AccountType, EntryType, RoleName, TransactionStatus, TransactionType, Prisma } from '@prisma/client';
import { TransactionsService } from './transactions.service.js';

function setup(pending = false) {
 const from = {id:'bank-one',accountName:'Bank One',accountType:AccountType.BANK,accountNature:AccountNature.ASSET,
  ledgerAccount:{id:'ledger-one'},providerId:null,isActive:true,openingBalance:new Prisma.Decimal(10000)};
 const to = {...from,id:'bank-two',accountName:'Bank Two',ledgerAccount:{id:'ledger-two'}};
 const original = {id:'expense-one',transactionNumber:'EXP-1',transactionType:TransactionType.BUSINESS_EXPENSE,
  status:pending?TransactionStatus.PENDING:TransactionStatus.COMPLETED,transactionAt:new Date('2026-10-10T09:00:00.000Z'),
  referenceNumber:null,notes:null,charges:[],expense:{expenseType:'BUSINESS',expenseCategoryId:'cat-one',
  amount:new Prisma.Decimal(100),paymentAccountId:pending?null:from.id,description:'Old expense',payee:null},
  journal:pending?null:{id:'original-journal',postingDate:new Date('2026-10-10T09:00:00.000Z'),entries:[]}};
 const tx:any = {
  $queryRawUnsafe:vi.fn(),
  transaction:{findUnique:vi.fn().mockResolvedValue(original),create:vi.fn().mockResolvedValue({id:'adjustment-one'}),
   update:vi.fn().mockImplementation(({data}:any)=>Promise.resolve({...original,...data}))},
  financialAccount:{findUnique:vi.fn().mockImplementation(({where}:any)=>Promise.resolve(where.id===from.id?from:to))},
  expenseCategory:{findUnique:vi.fn().mockResolvedValue({id:'cat-one',expenseUsage:'BUSINESS',isActive:true})},
  ledgerAccount:{findUnique:vi.fn().mockImplementation(({where}:any)=>Promise.resolve({id:where.ledgerCode==='SYS-BUSINESS-EXPENSE'?'expense-ledger':'provider-ledger'}))},
  cashSession:{findFirst:vi.fn().mockResolvedValue(null)},
  transactionCharge:{deleteMany:vi.fn(),create:vi.fn()},
  expenseDetail:{update:vi.fn()},
  auditLog:{create:vi.fn()},
 };
 const prisma:any={$transaction:(cb:(db:any)=>Promise<unknown>)=>cb(tx)};
 const ledger:any={post:vi.fn()};
 const validation:any={lockAccount:vi.fn(),account:vi.fn().mockResolvedValue(to),
  ensureSufficientFunds:vi.fn(),ensureCreditCapacity:vi.fn(),requireOpenCashDesk:vi.fn()};
 const charges:any={resolve:vi.fn().mockResolvedValue(null)};
 const service=new TransactionsService(prisma,ledger,validation,{} as any,{} as any,charges);
 const dto:any={expenseCategoryId:'cat-one',amount:120,transactionAt:'2026-10-10T09:00:00.000Z',
  paymentAccountId:to.id,description:'Corrected expense',payee:'Supplier',referenceNumber:'UTR-77',
  notes:'Receipt checked',reason:'Correcting the original entry'};
 return {service,tx,prisma,ledger,validation,charges,dto};
}

describe('full expense correction',()=>{
 it('posts a balanced correction journal without replacing the original journal',async()=>{
  const {service,tx,ledger,validation,dto}=setup();
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(tx.transaction.create).toHaveBeenCalledOnce();
  expect(ledger.post).toHaveBeenCalledOnce();
  const entries=ledger.post.mock.calls[0][4] as Array<{entryType:EntryType;ledgerAccountId:string;amount:number}>;
  const signed=(id:string)=>entries.filter(e=>e.ledgerAccountId===id).reduce((sum,e)=>sum+(e.entryType===EntryType.DEBIT?e.amount:-e.amount),0);
  expect(signed('expense-ledger')).toBe(20);
  expect(signed('ledger-one')).toBe(100);
  expect(signed('ledger-two')).toBe(-120);
  expect(entries.reduce((sum,e)=>sum+(e.entryType===EntryType.DEBIT?e.amount:-e.amount),0)).toBe(0);
  expect(validation.ensureSufficientFunds).toHaveBeenCalledWith(tx,expect.anything(),120);
  expect(tx.transaction.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({referenceNumber:'UTR-77',status:TransactionStatus.COMPLETED})}));
  expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'UPDATE_EXPENSE',oldValues:expect.objectContaining({amount:100}),newValues:expect.objectContaining({amount:120,payee:'Supplier'})})}));
 });
 it('changes descriptive fields without generating a financial journal',async()=>{
  const {service,tx,ledger,dto}=setup();
  dto.amount=100;dto.paymentAccountId='bank-one';dto.description='Receipt description corrected';
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.transaction.create).not.toHaveBeenCalled();
  expect(tx.transactionCharge.deleteMany).not.toHaveBeenCalled();
  expect(tx.auditLog.create).toHaveBeenCalledOnce();
 });
 it('leaves an unpaid expense pending while correcting rough details',async()=>{
  const {service,tx,ledger,dto}=setup(true);
  dto.paymentAccountId=null;dto.amount=90;
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.transaction.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:TransactionStatus.PENDING})}));
 });
});
