const assert=require("node:assert/strict");
const test=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../src/app/transactions/card-swipe/page.tsx"),"utf8");
function segment(start,end){
 const a=source.indexOf(start);
 assert.ok(a>=0,"Missing start: "+start);
 const b=source.indexOf(end,a+start.length);
 assert.ok(b>a,"Missing end: "+end);
 return source.slice(a,b);
}

test("latest non-reversed card swipe determines last-used card, sorted by actual transaction date",()=>{
 assert.match(source,/row\.status==="COMPLETED"&&!!row\.cardSwipe/);
 assert.match(source,/new Date\(b\.transactionAt\)\.getTime\(\)-new Date\(a\.transactionAt\)\.getTime\(\)/);
 assert.match(source,/card\.id===row\.cardSwipe\?\.customerCard\?\.id&&card\.isActive/);
 assert.match(source,/cardId\|\|historyLoadedFor!==customerId\|\|historyError\)return;/);
 assert.match(source,/if\(latestUsedCardId\)setCardId\(latestUsedCardId\)/);
 assert.match(source,/card\.id===latestUsedCardId\?<span/);
});

test("only the selected customer's loaded history can prefill prior gateway, fees, amount and term",()=>{
 const restore=segment("  useEffect(()=>{\n    if(customerMode!==\"existing\"||!cardId||historyLoading", "  useEffect(()=>{\n    if(!providerId)return;");
 assert.match(restore,/historyLoadedFor!==customerId/);
 assert.match(restore,/hydratedCardSetupRef\.current===setupKey/);
 assert.match(restore,/setProviderId\(previousProvider\.id\)/);
 assert.match(restore,/setGatewayId\(previousGateway\.id\)/);
 assert.match(restore,/setProviderRate\(rateText\(Number\(selectedCardSetup\.providerChargeRate\)\)\)/);
 assert.match(restore,/setTermId\(selectedCardSetup\.paymentTermId\)/);
 assert.match(restore,/setCommissionRate\(rateText\(previousCommission\)\)/);
 assert.match(restore,/setAmount\(String\(lastAmount\)\)/);
 assert.match(restore,/setReusedFromCard\(true\)/);
 assert.match(restore,/if\(!manualAmountRef\.current/);
 assert.match(restore,/if\(!manualGatewayRef\.current/);
 assert.match(restore,/if\(!manualCommissionRef\.current/);
 assert.match(restore,/if\(!manualTermRef\.current/);
});

test("explicit card choice and manually typed fields win over late responses and remembered card",()=>{
 const choose=segment("  function chooseCard(nextCardId:string)", "  function selectCustomer(next:Customer)");
 assert.match(choose,/setCardId\(nextCardId\)/);
 assert.match(choose,/resetCustomerPayoutState\(\)/);
 assert.match(choose,/setSettlementDueAt\(""\)/);
 assert.match(source,/manualAmountRef\.current=true;setAmount\(cleanAmountInput/);
 assert.match(source,/manualGatewayRef\.current=true;setGatewayId\(e\.target\.value\)/);
 assert.match(source,/manualTermRef\.current=true;setTermId\(term\.id\)/);
 const prefs=segment('const pref=JSON.parse(raw) as CustomerPreference;', '  },[customerId,providers,terms,customer]);');
 assert.doesNotMatch(prefs,/setCardId/);
});

test("reused swipe details do not copy receipt references, transfers, or payments",()=>{
 const restore=segment("  useEffect(()=>{\n    if(customerMode!==\"existing\"||!cardId||historyLoading", "  useEffect(()=>{\n    if(!providerId)return;");
 assert.doesNotMatch(restore,/setRecordCustomerPayment|setPaymentLegs|setSettledNow|setReference|setNotes/);
 assert.match(source,/Last swipe amount for this card suggested/);
 assert.match(source,/confirm or edit before saving/);
});

test("card prefill is keyed by customer and card; refreshing terms cannot replay old gateway",()=>{
 assert.match(source,/const setupKey=customerId\+":"\+cardId\+":"\+\(selectedCardHistory\?\.id\?\?"new"\)/);
 assert.match(source,/if\(hydratedCardSetupRef\.current===setupKey\)return/);
 const term=segment("  useEffect(()=>{\n    const term=terms.find(t=>t.id===termId)", "  useEffect(()=>{\n    const matchesCardHistory");
 assert.match(term,/defaultedTermRef\.current===termId\)return/);
 assert.match(term,/if\(!manualCommissionRef\.current\)setCommissionRate/);
 assert.match(source,/window\.addEventListener\("focus",refreshTerms\)/);
});
