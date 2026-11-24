import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {gatewayDefaultRate} from "../src/lib/card-swipe-gateway-rate.mjs";

test("24PAY current 0.70% beats last swipe 0.82% for new swipe calculations",()=>{
 const selectedGateway={gatewayName:"BOB QR",defaultChargeRate:"0.7",isActive:true};
 const historicalSwipe={providerChargeRate:"0.82"};
 const fee=Math.round(10000*gatewayDefaultRate(selectedGateway))/100;
 assert.equal(gatewayDefaultRate(selectedGateway),0.7);
 assert.equal(fee,70);
 assert.equal(Number(historicalSwipe.providerChargeRate)*100,82);
});

test("an inactive historical gateway cannot supply a new fee",()=>{
 assert.equal(gatewayDefaultRate({defaultChargeRate:"0.82",isActive:false}),0);
 assert.equal(gatewayDefaultRate(undefined),0);
 assert.equal(gatewayDefaultRate({defaultChargeRate:"not-a-rate",isActive:true}),0);
});

test("quick entry refreshes providers on each opening and uses only the current gateway rate",()=>{
 const source=fs.readFileSync(new URL("../src/components/quick-card-swipe-entry.tsx",import.meta.url),"utf8");
 assert.match(source,/const providerRate=gatewayDefaultRate\(gateway\)/);
 assert.doesNotMatch(source,/const providerRate=.*historySetup/);
 assert.match(source,/if\(!open\)return;[\s\S]*setLoading\(true\);setError\(""\);setProviders\(\[\]\)/);
 assert.match(source,/\},\[open\]\);/);
 assert.match(source,/!loading&&!addingCardBusy/);
 assert.match(source,/!!gateway&&gateway\.isActive!==false/);
 assert.match(source,/const lastGateway=usable\.find\(g=>g\.id===historySetup\.gatewayId\)/);
});

test("detailed entry defaults to configured charge, while allowing an explicit manual override",()=>{
 const source=fs.readFileSync(new URL("../src/app/transactions/card-swipe/page.tsx",import.meta.url),"utf8");
 assert.match(source,/setProviderRate\(String\(gatewayDefaultRate\(gateway\)\)\)/);
 assert.match(source,/setProviderRate\(String\(gatewayDefaultRate\(previousGateway\)\)\)/);
 assert.match(source,/if\(manualProviderRateRef\.current\)return/);
 assert.match(source,/!!providerId&&!!gateway&&!!providerWallet/);
 assert.doesNotMatch(source,/setProviderRate\(rateText\(Number\(selectedCardSetup\.providerChargeRate\)/);
 assert.match(source,/manualProviderRateRef\.current=true;setProviderRate\(e\.target\.value\)/);
});
