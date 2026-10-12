import { describe, expect, it, vi } from 'vitest';
import {
 AccountNature, AccountType, EntryType, JournalStatus,
 RoleName, TransactionStatus, TransactionType, Prisma,
} from '@prisma/client';
import { TransactionsService } from './transactions.service.js';

const oldDate = '2026-10-05T09:00:00.000Z';
const editedAt = '2026-10-11T11:00:00.000Z';
const entry = (id:string, ledgerAccountId:string, entryType:EntryType, amount:number) => ({
 id, ledgerAccountId, entryType, amount:new Prisma.Decimal(amount), description:'Original expense',
 customerId:null, payableId:null, receivableId:null, providerSettlementId:null,
});
function setup(opts:{pending?:boolean;previouslyPosted?:boolean;legacy?:boolean;cash?:boolean}={}){
 const from:any={id:'bank-one',accountName:opts.cash?'Staff Cash':'Bank One',
  accountType:opts.cash?AccountType.CASH:AccountType.BANK,
  accountNature:AccountNature.ASSET,ledgerAccount:{id:'ledger-one'},
  providerId:null,isActive:true,openingBalance:new Prisma.Decimal(10000)};
 const to={...from,id:'bank-two',accountName:'Bank Two',accountType:AccountType.BANK,ledgerAccount:{id:'ledger-two'}};
 const original:any={
  id:'expense-one',transactionNumber:'EXP-1',transactionType:TransactionType.BUSINESS_EXPENSE,
  status:opts.pending?TransactionStatus.PENDING:TransactionStatus.COMPLETED,
  transactionAt:new Date(oldDate),createdAt:new Date(oldDate),
  referenceNumber:null,notes:null,charges:[],expense:{
   expenseType:'BUSINESS',expenseCategoryId:'cat-one',expenseCategory:{name:'Old category'},amount:new Prisma.Decimal(100),
   paymentAccountId:opts.pending?null:from.id,description:'Old expense',payee:null,
  },
  journal:opts.pending&&!opts.previouslyPosted?null:{
   id:'original-journal',status:opts.pending?JournalStatus.REVERSED:JournalStatus.POSTED,
   postingDate:new Date(oldDate),
   entries:[entry('e1','expense-ledger',EntryType.DEBIT,100),entry('e2','ledger-one',EntryType.CREDIT,100)],
  },
 };
 const legacy=opts.legacy?[{
  id:'legacy-1',journal:{id:'legacy-journal',status:JournalStatus.POSTED,
   postingDate:new Date(editedAt),entries:[
    entry('a1','expense-ledger',EntryType.DEBIT,20),
    entry('a2','ledger-one',EntryType.DEBIT,100),
    entry('a3','ledger-two',EntryType.CREDIT,120),
   ]},
 }]:[];
 const tx:any={
  $queryRawUnsafe:vi.fn(),
  transaction:{findUnique:vi.fn().mockResolvedValue(original),findMany:vi.fn().mockResolvedValue(legacy),
   create:vi.fn(),update:vi.fn().mockImplementation(({data}:any)=>Promise.resolve({...original,...data}))},
  financialAccount:{
   findUnique:vi.fn().mockImplementation(({where}:any)=>Promise.resolve(where.id===from.id?from:to)),
   findMany:vi.fn().mockResolvedValue(opts.cash?[{id:from.id,accountName:from.accountName}]:[]),
  },
  expenseCategory:{findUnique:vi.fn().mockResolvedValue({id:'cat-one',expenseUsage:'BUSINESS',isActive:true})},
  ledgerAccount:{findUnique:vi.fn().mockImplementation(({where}:any)=>Promise.resolve({
   id:where.ledgerCode==='SYS-BUSINESS-EXPENSE'?'expense-ledger':'provider-ledger',
  }))},
  cashSession:{findFirst:vi.fn().mockResolvedValue(null)},
  ledgerEntry:{deleteMany:vi.fn(),createMany:vi.fn(),updateMany:vi.fn()},
  ledgerJournal:{update:vi.fn()},
  transactionCharge:{deleteMany:vi.fn(),create:vi.fn()},
  expenseDetail:{update:vi.fn()},
  auditLog:{create:vi.fn()},
 };
 const prisma:any={$transaction:(cb:(db:any)=>Promise<unknown>)=>cb(tx)};
 const ledger:any={post:vi.fn()};
 const validation:any={lockAccount:vi.fn(),account:vi.fn().mockResolvedValue(to),
  ensureSufficientFunds:vi.fn(),ensureCreditCapacity:vi.fn(),ensureReversalCapacity:vi.fn(),
  requireOpenCashDesk:vi.fn(),balance:vi.fn().mockResolvedValue(5000)};
 const charges:any={resolve:vi.fn().mockResolvedValue(null)};
 const service=new TransactionsService(prisma,ledger,validation,{} as any,{} as any,charges);
 const dto:any={
  expenseCategoryId:'cat-one',amount:120,transactionAt:oldDate,paymentAccountId:to.id,
  description:'Corrected expense',payee:'Supplier',referenceNumber:'UTR-77',
  notes:'Receipt checked',reason:'Correcting the original entry',
 };
 return {service,tx,prisma,ledger,validation,charges,dto,original};
}
describe('edit the original expense in place',()=>{
 it('replaces original journal lines without creating a new transaction and keeps the original posting date',async()=>{
  const {service,tx,ledger,validation,dto}=setup();
  const result=await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(result.id).toBe('expense-one');
  expect(tx.transaction.create).not.toHaveBeenCalled();
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.ledgerEntry.deleteMany).toHaveBeenCalledWith({where:{journalId:'original-journal'}});
  const rows=tx.ledgerEntry.createMany.mock.calls[0][0].data;
  const signed=(id:string)=>rows.filter((r:any)=>r.ledgerAccountId===id)
    .reduce((s:number,r:any)=>s+(r.entryType===EntryType.DEBIT?1:-1)*Number(r.amount),0);
  expect(signed('expense-ledger')).toBe(120);
  expect(signed('ledger-one')).toBe(0);
  expect(signed('ledger-two')).toBe(-120);
  expect(rows.reduce((s:number,r:any)=>s+(r.entryType===EntryType.DEBIT?1:-1)*Number(r.amount),0)).toBe(0);
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith({
   where:{id:'original-journal'},
   data:{status:JournalStatus.POSTED,postingDate:new Date(oldDate),description:'Expense: Corrected expense'},
  });
  expect(validation.ensureSufficientFunds).toHaveBeenCalledWith(tx,expect.anything(),120);
  expect(tx.transaction.update).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'expense-one'},data:expect.objectContaining({
    transactionAt:new Date(oldDate),referenceNumber:'UTR-77',status:TransactionStatus.COMPLETED,
   }),
  }));
  expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
   action:'UPDATE_EXPENSE',entityId:'expense-one',
   oldValues:expect.objectContaining({amount:100,originalJournal:expect.objectContaining({status:'POSTED'})}),
   newValues:expect.objectContaining({amount:120,payee:'Supplier',originalTransactionId:'expense-one'}),
  })}));
 });
 it('edits text and category in the same journal without financial movement',async()=>{
  const {service,tx,ledger,dto}=setup();
  dto.amount=100;dto.paymentAccountId='bank-one';dto.description='Receipt description corrected';
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith({where:{id:'original-journal'},data:{description:'Expense: Receipt description corrected'}});
  expect(tx.ledgerEntry.updateMany).toHaveBeenCalledTimes(2);
  expect(tx.ledgerEntry.deleteMany).not.toHaveBeenCalled();
  expect(tx.transaction.create).not.toHaveBeenCalled();
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.auditLog.create).toHaveBeenCalledOnce();
 });
 it('keeps rough pending entries pending without posting money',async()=>{
  const {service,tx,ledger,dto}=setup({pending:true});
  dto.paymentAccountId=null;dto.amount=90;
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.ledgerJournal.update).not.toHaveBeenCalled();
  expect(tx.transaction.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({status:TransactionStatus.PENDING,transactionAt:new Date(oldDate)}),
  }));
 });
 it('posts a pending expense using its original business date',async()=>{
  const {service,tx,ledger,dto}=setup({pending:true});
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(ledger.post).toHaveBeenCalledWith(tx,'expense-one','staff-one',
   'Expense payment: EXP-1',expect.any(Array),new Date(oldDate));
  expect(tx.transaction.create).not.toHaveBeenCalled();
 });
 it('can clear and later restore the payment source using the same journal',async()=>{
  const {service,tx,dto}=setup();
  dto.paymentAccountId=null;
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.OWNER);
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'original-journal'},data:expect.objectContaining({status:JournalStatus.REVERSED}),
  }));
  expect(tx.transaction.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({status:TransactionStatus.PENDING}),
  }));
 });
 it('reuses an existing reversed journal when a pending expense is paid again',async()=>{
  const {service,tx,ledger,dto}=setup({pending:true,previouslyPosted:true});
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.transaction.create).not.toHaveBeenCalled();
  expect(tx.ledgerEntry.createMany).toHaveBeenCalledOnce();
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'original-journal'},data:expect.objectContaining({status:JournalStatus.POSTED,postingDate:new Date(oldDate)}),
  }));
 });
 it('consolidates older EXA correction postings without adding another dated transaction',async()=>{
  const {service,tx,ledger,dto}=setup({legacy:true});
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith({
   where:{id:'legacy-journal'},data:{status:JournalStatus.REVERSED},
  });
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'original-journal'},data:expect.objectContaining({postingDate:new Date(oldDate)}),
  }));
  expect(tx.transaction.create).not.toHaveBeenCalled();
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({newValues:expect.objectContaining({
    historicalAdjustmentsConsolidated:['legacy-1'],
   })}),
  }));
 });
 it('changes business date only when the user explicitly supplies a new one',async()=>{
  const {service,tx,dto}=setup();
  dto.transactionAt='2026-10-06T09:00:00.000Z';
  dto.amount=100;dto.paymentAccountId='bank-one';
  await service.updateExpense('expense-one',dto,'staff-one',RoleName.STAFF);
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({postingDate:new Date('2026-10-06T09:00:00.000Z')}),
  }));
 });
 it('blocks silent changes to a reconciled cash session even by the owner',async()=>{
  const {service,tx,dto}=setup({cash:true});
  tx.cashSession.findFirst.mockResolvedValue({id:'closed-session'});
  await expect(service.updateExpense('expense-one',dto,'owner-one',RoleName.OWNER))
   .rejects.toThrow(/closed cash session/);
  expect(tx.ledgerEntry.deleteMany).not.toHaveBeenCalled();
  expect(tx.transaction.update).not.toHaveBeenCalled();
 });
});
describe('delete expense and quick category correction',()=>{
 it('changes only the category on the original expense with date preserved and a before/after audit',async()=>{
  const {service,tx,ledger,original}=setup();
  tx.expenseCategory.findUnique.mockResolvedValue({id:'cat-two',name:'Travel',expenseUsage:'BUSINESS',isActive:true});
  const changed=await service.updateExpenseCategory('expense-one',{expenseCategoryId:'cat-two',reason:'Category was wrong'},'staff-one');
  expect(changed.id).toBe(original.id);
  expect(changed.transactionAt).toEqual(new Date(oldDate));
  expect(tx.expenseDetail.update).toHaveBeenCalledWith({where:{transactionId:'expense-one'},data:{expenseCategoryId:'cat-two'}});
  expect(tx.transaction.update).toHaveBeenCalledWith({where:{id:'expense-one'},data:{updatedById:'staff-one'}});
  expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
   action:'UPDATE_EXPENSE_CATEGORY',oldValues:expect.objectContaining({expenseCategoryId:'cat-one',categoryName:'Old category'}),
   newValues:expect.objectContaining({expenseCategoryId:'cat-two',categoryName:'Travel'}),
   reason:'Category was wrong',
  })}));
  expect(tx.ledgerEntry.deleteMany).not.toHaveBeenCalled();
  expect(tx.ledgerJournal.update).not.toHaveBeenCalled();
  expect(ledger.post).not.toHaveBeenCalled();
 });
 it('rejects category changes to a mismatched expense type',async()=>{
  const {service,tx}=setup();
  tx.expenseCategory.findUnique.mockResolvedValue({id:'personal',name:'Personal',expenseUsage:'PERSONAL',isActive:true});
  await expect(service.updateExpenseCategory('expense-one',{expenseCategoryId:'personal',reason:'Testing mismatch'},'staff-one'))
   .rejects.toThrow(/category/);
  expect(tx.expenseDetail.update).not.toHaveBeenCalled();
 });
 it('deletes a pending expense without a journal or a replacement transaction',async()=>{
  const {service,tx,ledger}=setup({pending:true});
  const deleted=await service.deleteExpense('expense-one',{reason:'Duplicate rough entry'},'owner-one');
  expect(deleted).toEqual({id:'expense-one',deleted:true,status:TransactionStatus.REVERSED});
  expect(tx.transaction.update).toHaveBeenCalledWith({where:{id:'expense-one'},data:{
   status:TransactionStatus.REVERSED,reversalReason:'Duplicate rough entry',updatedById:'owner-one',
  }});
  expect(tx.transaction.create).not.toHaveBeenCalled();
  expect(tx.ledgerJournal.update).not.toHaveBeenCalled();
  expect(ledger.post).not.toHaveBeenCalled();
  expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
   action:'DELETE_EXPENSE',entityId:'expense-one',reason:'Duplicate rough entry',
  })}));
 });
 it('deletes an already posted bank expense by voiding its original journal and preserving evidence',async()=>{
  const {service,tx,validation,ledger,original}=setup();
  const result=await service.deleteExpense('expense-one',{reason:'Wrong duplicate bank expense'},'owner-one');
  expect(result.id).toBe(original.id);
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith({where:{id:'original-journal'},data:{status:JournalStatus.REVERSED}});
  expect(validation.ensureReversalCapacity).toHaveBeenCalledOnce();
  expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({
   action:'DELETE_EXPENSE',oldValues:expect.objectContaining({transactionAt:oldDate,amount:'100',
    postedJournals:expect.arrayContaining([expect.objectContaining({id:'original-journal'})])}),
   newValues:expect.objectContaining({status:TransactionStatus.REVERSED,journalsVoided:['original-journal']}),
  })}));
  expect(tx.transaction.create).not.toHaveBeenCalled();
  expect(ledger.post).not.toHaveBeenCalled();
 });
 it('deletes legacy expense amendments together with the original journal without a second posting',async()=>{
  const {service,tx}=setup({legacy:true});
  await service.deleteExpense('expense-one',{reason:'Incorrect expense'},'owner-one');
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith({where:{id:'original-journal'},data:{status:JournalStatus.REVERSED}});
  expect(tx.ledgerJournal.update).toHaveBeenCalledWith({where:{id:'legacy-journal'},data:{status:JournalStatus.REVERSED}});
  expect(tx.transaction.create).not.toHaveBeenCalled();
 });
 it('blocks deleting a cash expense touching a closed session, including for the owner',async()=>{
  const {service,tx}=setup({cash:true});
  tx.financialAccount.findMany.mockResolvedValue([{id:'bank-one',ledgerAccount:{id:'ledger-one'}}]);
  tx.cashSession.findFirst.mockResolvedValue({id:'closed-session'});
  await expect(service.deleteExpense('expense-one',{reason:'Duplicate cash expense'},'owner-one'))
   .rejects.toThrow(/closed cash session/);
  expect(tx.ledgerJournal.update).not.toHaveBeenCalled();
  expect(tx.transaction.update).not.toHaveBeenCalled();
 });
 it('rejects a second deletion and prevents repeat balance effects',async()=>{
  const {service,tx,original}=setup();original.status=TransactionStatus.REVERSED;
  await expect(service.deleteExpense('expense-one',{reason:'Delete again'},'owner-one'))
   .rejects.toThrow(/already deleted/);
  expect(tx.ledgerJournal.update).not.toHaveBeenCalled();
 });
});
