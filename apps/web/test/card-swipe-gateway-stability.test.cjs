const assert=require("node:assert/strict");
const test=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../src/app/transactions/card-swipe/page.tsx"),"utf8");
function section(begin,end) {
 const start=source.indexOf(begin);
 assert.ok(start>=0,begin+" must exist");
 const finish=source.indexOf(end,start+begin.length);
 assert.ok(finish>start,end+" must exist after "+begin);
 return source.slice(start,finish);
}

test("last-card setup is restored only once per selected card/history, not after window focus refreshes terms",()=>{
 const restore=section("const setupKey=customerId", "  useEffect(()=>{\n    if(!providerId)return;");
 assert.match(restore,/selectedCardHistory\?\.id\?\?"new"/);
 assert.match(restore,/if\(hydratedCardSetupRef\.current===setupKey\)return/);
 assert.match(restore,/hydratedCardSetupRef\.current=setupKey/);
 assert.ok(restore.indexOf("if(hydratedCardSetupRef.current===setupKey)return")<restore.indexOf("setGatewayId(previousGateway.id)"));
 assert.match(source,/window\.addEventListener\("focus",refreshTerms\)/);
});

test("changing the customer commission does not rewrite the selected gateway",()=>{
 const edit=section("  function updateCommission(next:number)", "  function savePreferences(");
 assert.match(edit,/manualCommissionRef\.current=true/);
 assert.match(edit,/setCommissionRate/);
 assert.doesNotMatch(edit,/setGatewayId|setProviderId|setProviderRate/);
 const resolved=section("  useEffect(()=>{\n    const matchesCardHistory=", "  useEffect(()=>{\n    if(!recordCustomerPayment");
 assert.match(resolved,/if\(!manualCommissionRef\.current\)setCommissionRate\(rateText\(resolved\)\)/);
 assert.match(resolved,/if\(!manualCommissionRef\.current\)setCommissionRate\(rateText\(termDefault\)\)/);
 assert.doesNotMatch(resolved,/\},\[customerId,providerId,gatewayId,termId,terms,/);
});

test("refreshing payment-term settings does not overwrite the manually entered rate",()=>{
 const term=section("  useEffect(()=>{\n    const term=terms.find(t=>t.id===termId)", "  useEffect(()=>{\n    const matchesCardHistory");
 assert.match(term,/defaultedTermRef\.current===termId\)return/);
 assert.ok(term.indexOf("defaultedTermRef.current===termId")<term.indexOf("setCommissionRate"));
 const reset=section("  function resetSwipeDetails(openRouting=false)", "  function clearCustomerIdentity(");
 assert.match(reset,/hydratedCardSetupRef\.current=""/);
 assert.match(reset,/defaultedTermRef\.current=""/);
 assert.match(reset,/manualCommissionRef\.current=false/);
});
