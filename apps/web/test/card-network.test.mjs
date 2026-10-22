import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source=readFileSync(new URL("../src/lib/card-network.ts",import.meta.url),"utf8");
const javascript=ts.transpileModule(source,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},
}).outputText;
const {networkForSavedCard}=await import("data:text/javascript,"+encodeURIComponent(javascript));

const networks=[
  {id:"visa",name:"Visa",isActive:true},
  {id:"master",name:"Mastercard",isActive:true},
  {id:"rupay",name:"RuPay",isActive:true},
  {id:"inactive",name:"Maestro",isActive:false},
];

test("saved Mastercard remains Mastercard even when Visa exists",()=>{
  assert.equal(networkForSavedCard({
    bankName:"ICICI MASTER",cardNetworkId:"master",
  },networks),"master");
});

test("imported card labeled MASTER can be identified without a saved network",()=>{
  assert.equal(networkForSavedCard({
    bankName:"ICICI MASTER",cardNetworkId:null,
  },networks),"master");
});

test("existing RuPay card is not silently changed to Visa",()=>{
  assert.equal(networkForSavedCard({bankName:"SBI RuPay"},networks),"rupay");
});

test("last swipe network can fill an unrecognized legacy card",()=>{
  assert.equal(networkForSavedCard({bankName:"HDFC BANK"},networks,"master"),"master");
});

test("unknown and ambiguous names require manual selection",()=>{
  assert.equal(networkForSavedCard({bankName:"ICICI BANK"},networks),"");
  assert.equal(networkForSavedCard({bankName:"VISA MASTERCARD"},networks),"");
});

test("inactive saved network is not silently reused",()=>{
  assert.equal(networkForSavedCard({bankName:"HDFC",cardNetworkId:"inactive"},networks),"");
});
