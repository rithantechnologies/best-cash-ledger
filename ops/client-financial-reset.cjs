'use strict';
// Client-only financial reset, Option A. Does not delete master data or audit trail.
// Requires a verified backup and suspended client API before --apply.
const { PrismaClient } = require('/var/www/cashledger/current/api/node_modules/@prisma/client');
const crypto=require('node:crypto');

const tables=[
'Transaction','TransactionCharge','TransactionCommission','CardSwipeDetail',
'CardDueClearingDetail','CardDueRecovery','CardDueCommissionCollection',
'CustomerPayable','PayablePayment','CustomerReceivable','ReceivableCollection',
'ProviderSettlement','ProviderSettlementReceipt','CashTransferDetail',
'QuickCashTransferDetail','QuickCashSourceAllocation','AepsDetail',
'MicroAtmDetail','InternalTransferDetail','CustomerLedgerEntryDetail',
'CustomerAdvanceOffset','CustomerLedgerAllocation','AccountEntryDetail',
'ExpenseDetail','AtmWithdrawalDetail','CreditCardPaymentDetail',
'CashSession','CashDenominationCount','LedgerJournal','LedgerEntry',
'DailyAccountBalance','DailyReceivableSummary','DailyPositionSnapshot',
'DailyPositionSummary','DailyPayableSummary'
];
const masters=[
'Role','User','Customer','CustomerTypeConfig','CustomerCard','CustomerDemoCard',
'CustomerBankAccount','CustomerUpiAccount','Beneficiary','BeneficiaryAccount',
'CustomerAepsAccount','CustomerEsevaiService','CustomerServiceProfile',
'Provider','ProviderGateway','PaymentTerm','CardNetwork','CommissionRule',
'FinancialAccount','ServiceCatalog','CashInTransferType','ExpenseCategory',
'ProviderPayoutChargeRule','AepsProviderCommissionRule','LedgerAccount','AuditLog'
];
const marker={entityType:'CLIENT_FINANCIAL_RESET',entityId:'client-financial-reset-20261016-option-A'};
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const mode=process.argv[2];
if(!['--inspect','--apply','--verify'].includes(mode)||process.argv.length!==3)
 throw Error('Usage: --inspect, --apply or --verify');

const url=new URL(process.env.DATABASE_URL||'about:blank');
if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='5432'||
 url.username!=='cashledger_app'||url.pathname!=='/cashledger_prod'||
 url.searchParams.get('schema')!=='public'||
 process.env.WEB_ORIGIN!=='https://ledger.bestmoney.in'||
 process.env.NODE_ENV!=='production')
 throw Error('REFUSED: unexpected client database identity');

const db=new PrismaClient();
const rowInt=v=>typeof v==='bigint'?Number(v):Number(v);
async function snapshot(c){
 const out={};
 const sql=t=>'SELECT count(*)::bigint AS n FROM '+quote(t);
 for(const t of tables)out[t]=rowInt((await c.$queryRawUnsafe(sql(t)))[0].n);
 return out;
}
async function masterSnapshot(c){
 const out={};
 for(const t of masters){
  if(t==='AuditLog')continue;
  out[t]=rowInt((await c.$queryRawUnsafe('SELECT count(*)::bigint AS n FROM '+quote(t)))[0].n);
 }
 const accounts=await c.financialAccount.findMany({
  select:{id:true,accountCode:true,accountName:true,accountType:true,accountNature:true,
    openingBalance:true,ledgerAccount:{select:{id:true}}},orderBy:{accountCode:'asc'}
 });
 if(accounts.length!==33||accounts.some(a=>!a.ledgerAccount))
  throw Error('REFUSED: expected exactly 33 financial accounts, each linked to a ledger account');
 if(out.Customer<57)throw Error('REFUSED: imported customers fewer than 57');
 if(out.User<1||out.Role<1)throw Error('REFUSED: client user/role master data missing');
 const accountFingerprint=crypto.createHash('sha256').update(JSON.stringify(accounts.map(a=>[
  a.id,a.accountCode,a.accountName,a.accountType,a.accountNature,a.ledgerAccount.id
 ]))).digest('hex');
 return {counts:out,accountFingerprint,accounts};
}
async function tableGuard(c){
 const actual=(await c.$queryRawUnsafe(
  "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'")).map(x=>x.tablename);
 const expected=new Set([...tables,...masters,'_prisma_migrations']);
 const unknown=actual.filter(x=>!expected.has(x));
 const missing=tables.filter(x=>!actual.includes(x));
 if(unknown.length||missing.length)
  throw Error('REFUSED: unexpected DB tables='+unknown.join(',')+' or missing financial tables='+missing.join(','));
 const fk=await c.$queryRawUnsafe(`
  SELECT source.relname AS source, target.relname AS target, con.conname AS constraint
  FROM pg_catalog.pg_constraint con
  JOIN pg_catalog.pg_class source ON source.oid=con.conrelid
  JOIN pg_catalog.pg_class target ON target.oid=con.confrelid
  JOIN pg_catalog.pg_namespace srcschema ON srcschema.oid=source.relnamespace
  JOIN pg_catalog.pg_namespace tgtschema ON tgtschema.oid=target.relnamespace
  WHERE con.contype='f' AND srcschema.nspname='public' AND tgtschema.nspname='public'
 `);
 const set=new Set(tables);
 const unsafe=fk.filter(x=>set.has(x.target)&&!set.has(x.source));
 if(unsafe.length)
  throw Error('REFUSED: some retained master tables reference financial records: '+unsafe.map(x=>x.source+'->'+x.target).join(','));
}
async function main(){
 const ident=(await db.$queryRawUnsafe('SELECT current_database() AS db,current_user AS role'))[0];
 if(ident?.db!=='cashledger_prod'||ident?.role!=='cashledger_app')
  throw Error('REFUSED: connected to unexpected database');
 await tableGuard(db);
 const before=await snapshot(db);
 const base=await masterSnapshot(db);
 const previous=await db.auditLog.findMany({where:marker,select:{id:true,action:true,newValues:true}});
 if(previous.length>1)throw Error('REFUSED: duplicate prior reset markers');
 if(mode==='--inspect'){
  console.log('CLIENT DATABASE: cashledger_prod; RESET MODE: Financial only');
  console.log('PRESERVED MASTER COUNTS: '+JSON.stringify(base.counts));
  console.log('CURRENT FINANCIAL ROW COUNTS: '+JSON.stringify(before));
  console.log('NONZERO ACCOUNT OPENINGS: '+base.accounts.filter(a=>Number(a.openingBalance)!==0).length);
  console.log('PREVIOUS COMPLETED RESETS: '+previous.length);
  console.log('READ-ONLY inspection complete; database unchanged.');
  return;
 }
 if(mode==='--verify'){
  if(previous.length!==1||previous[0].action!=='RESET_OPTION_A')
   throw Error('REFUSED: approved reset audit record missing');
  const incomplete=Object.entries(before).filter(([_,n])=>n!==0);
  if(incomplete.length||base.accounts.some(a=>Number(a.openingBalance)!==0))
   throw Error('REFUSED: financial tables or account openings remain nonzero: '+JSON.stringify(incomplete));
  const prev=previous[0].newValues;
  if(!prev||prev.masterFingerprint!==base.accountFingerprint)
   throw Error('REFUSED: preserved account definitions differ from reset baseline');
  for(const [t,n] of Object.entries(prev.preservedMasterCounts||{})){
   if(base.counts[t]!==n)throw Error('REFUSED: preserved master count changed: '+t);
  }
  console.log('PASS: all 35 financial tables empty, 33 opening balances zero.');
  console.log('PASS: customer profiles, saved card data, account names, settings and users preserved.');
  console.log('PASS: reset audit trail intact.');
  return;
 }
 if(process.env.CASHLEDGER_FINANCIAL_RESET_APPROVED!=='YES_RESET_CLIENT_FINANCIAL_ONLY')
  throw Error('REFUSED: missing user-authorized reset scope');
 const sha=process.env.CASHLEDGER_RESET_BACKUP_SHA256||'';
 if(!/^[0-9a-f]{64}$/.test(sha))
  throw Error('REFUSED: verified pre-reset backup SHA256 not supplied');
 if(previous.length)throw Error('REFUSED: this reset was already recorded; will not run twice');
 const owner=await db.user.findFirst({where:{isActive:true,role:{name:'OWNER'}},select:{id:true}});
 if(!owner)throw Error('REFUSED: no active Owner to record reset audit');
 const deleteSql='TRUNCATE TABLE '+tables.map(quote).join(', ')+' RESTRICT';
 await db.$transaction(async tx=>{
  await tableGuard(tx);
  const inTx=await masterSnapshot(tx);
  if(inTx.accountFingerprint!==base.accountFingerprint||
      JSON.stringify(inTx.counts)!==JSON.stringify(base.counts))
   throw Error('REFUSED: master data changed during reset preflight');
  await tx.$executeRawUnsafe(deleteSql);
  await tx.$executeRawUnsafe('UPDATE "FinancialAccount" SET "openingBalance" = 0.00, "updatedAt" = now() WHERE "openingBalance" <> 0.00');
  const after=await snapshot(tx);
  if(Object.values(after).some(n=>n!==0))
   throw Error('REFUSED: financial records remain after reset attempt');
  const afterBase=await masterSnapshot(tx);
  if(afterBase.accountFingerprint!==base.accountFingerprint||
    JSON.stringify(afterBase.counts)!==JSON.stringify(base.counts)||
    afterBase.accounts.some(a=>Number(a.openingBalance)!==0))
   throw Error('REFUSED: master rows changed or account openings nonzero');
  await tx.auditLog.create({data:{
   userId:owner.id,entityType:marker.entityType,entityId:marker.entityId,
   action:'RESET_OPTION_A',
   reason:'Owner explicitly approved Option A: remove financial history, cash sessions and balances; keep customers, saved details, account names and settings on new client VPS only.',
   oldValues:{removedFinancialRecords:before,nonzeroAccountOpenings:base.accounts.filter(a=>Number(a.openingBalance)!==0).length},
   newValues:{masterFingerprint:base.accountFingerprint,preservedMasterCounts:base.counts,
      financialTablesCleared:tables.length,accountOpeningBalance:'0.00',
      backupSHA256:sha,backupFile:'client-before-financial-reset-20261016.dump',
      auditHistoryPreserved:true}
  }});
 },{maxWait:15000,timeout:120000});
 console.log('SUCCESS: client financial reset committed atomically.');
 console.log('CLEARED financial rows: '+Object.values(before).reduce((a,b)=>a+b,0));
 console.log('PRESERVED customers: '+base.counts.Customer+'; saved cards: '+base.counts.CustomerCard+'; financial account names: 33; settings and audit records retained.');
 console.log('BACKUP SHA256: '+sha);
}
main().catch(e=>{console.error('FINANCIAL RESET FAILED: '+(e?.message||e));process.exitCode=1})
 .finally(async()=>db.$disconnect());
