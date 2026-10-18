'use strict';
// CASH LEDGER CLIENT — read-only provider-wallet reset readiness assessment.
// It does not alter any data or create/modify files.
const { PrismaClient, AccountType, AccountNature } = require('../apps/api/node_modules/@prisma/client');

const u=new URL(process.env.DATABASE_URL||'about:blank');
if(u.protocol!=='postgresql:'||u.hostname!=='127.0.0.1'||u.port!=='5432'||
 u.username!=='cashledger_app'||u.pathname!=='/cashledger_prod'||
 u.searchParams.get('schema')!=='public'||process.env.NODE_ENV!=='production'||
 process.env.WEB_ORIGIN!=='https://ledger.bestmoney.in') {
 throw Error('REFUSED: unexpected production DB identity (client VPS only)');
}
if(process.argv.length!==2)throw Error('READ ONLY. Usage: node --env-file=/etc/cashledger/cashledger.env ops/client-wallet-reset-readiness.cjs');
const db=new PrismaClient();
const n=x=>typeof x==='bigint'?Number(x):Number(x);
async function main(){
 const identity=(await db.$queryRawUnsafe('SELECT current_database() as db, current_user as role'))[0];
 if(identity.db!=='cashledger_prod'||identity.role!=='cashledger_app')throw Error('REFUSED: wrong database');
 const accounts=await db.financialAccount.findMany({
  select:{id:true,accountName:true,accountCode:true,accountType:true,accountNature:true,
    openingBalance:true,ledgerAccount:{select:{id:true}}},
  orderBy:{accountCode:'asc'}
 });
 if(!accounts.length||accounts.some(a=>!a.ledgerAccount))throw Error('REFUSED: financial accounts/ledgers missing');
 const wallets=accounts.filter(a=>a.accountType===AccountType.PROVIDER_WALLET);
 const others=accounts.filter(a=>a.accountType!==AccountType.PROVIDER_WALLET);
 if(!wallets.length||wallets.some(a=>a.accountNature!==AccountNature.ASSET))
   throw Error('REFUSED: provider-wallet account definitions invalid');
 const ledgerIds=wallets.map(a=>a.ledgerAccount.id);
 const walletIds=wallets.map(a=>a.id);
 const [entries,postedJournals,openCashSessions,unfinishedWalletQuick,unfinishedTransactions,
   unbalancedJournals, priorResetMarkers]=await Promise.all([
  db.ledgerEntry.findMany({
   where:{ledgerAccountId:{in:ledgerIds},journal:{status:'POSTED'}},
   select:{ledgerAccountId:true,entryType:true,amount:true,journalId:true}
  }),
  db.ledgerJournal.count({where:{status:'POSTED'}}),
  db.cashSession.count({where:{status:'OPEN'}}),
  db.quickCashTransferDetail.count({
   where:{completionTransactionId:null,
     OR:[{sourceAccountId:{in:walletIds}},
       {sourceAllocations:{some:{sourceAccountId:{in:walletIds}}}}]}
  }),
  db.transaction.count({where:{status:'PENDING'}}),
  db.$queryRawUnsafe(`
   SELECT count(*)::bigint AS n FROM (
    SELECT j."id"
    FROM "LedgerJournal" j
    JOIN "LedgerEntry" e ON e."journalId"=j."id"
    WHERE j."status"='POSTED'
    GROUP BY j."id"
    HAVING abs(sum(CASE WHEN e."entryType"='DEBIT' THEN e."amount" ELSE -e."amount" END)) > 0.009
   ) t`),
  db.auditLog.count({where:{entityType:'PROVIDER_WALLET_RESET',action:'RESET_TO_ZERO'}})
 ]);
 const movement=new Map(ledgerIds.map(id=>[id,0]));
 for(const e of entries)movement.set(e.ledgerAccountId,
   Math.round(((movement.get(e.ledgerAccountId)||0)+(e.entryType==='DEBIT'?1:-1)*n(e.amount))*100)/100);
 const summary=wallets.map(a=>({
  id:a.id,name:a.accountName,opening:Number(a.openingBalance),
  postedNetMovement:movement.get(a.ledgerAccount.id)||0,
  calculatedBalance:Number((Number(a.openingBalance)+(movement.get(a.ledgerAccount.id)||0)).toFixed(2)),
  existingWalletLedgerEntries:entries.filter(e=>e.ledgerAccountId===a.ledgerAccount.id).length,
 }));
 const unacceptable=summary.filter(a=>!Number.isFinite(a.calculatedBalance));
 const problems=[
  ...(unacceptable.length?['invalid wallet balance']:[]),
  ...(openCashSessions?['active cash sessions']:[]),
  ...(unfinishedWalletQuick?['unfinished wallet-source transfers']:[]),
  ...(n(unbalancedJournals[0]?.n)?['unbalanced posted journals']:[]),
  ...(priorResetMarkers?['wallet reset previously recorded']:[]),
 ];
 console.log(JSON.stringify({
  mode:'READ_ONLY',database:identity.db,
  walletCount:wallets.length,otherAccountCount:others.length,
  walletSummary:summary,postedJournals,openCashSessions,
  unfinishedWalletQuick,allPendingTransactions:unfinishedTransactions,
  unbalancedPostedJournals:n(unbalancedJournals[0]?.n||0),
  previousResetMarkers:priorResetMarkers,
  blockReset:problems.length>0,blockers:problems,
  next:'Obtain verified point-in-time full DB backup and separate wallet-ledger archive before applying any reset.'
 },null,2));
}
main().catch(e=>{console.error('READINESS REFUSED:',e.message);process.exitCode=1;})
 .finally(()=>db.$disconnect());
