import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

// The production Node 22 runtime may lack its optional built-in TS strip-types.
const sourcePath=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../src/lib/customer-ledger-split.ts");
const js=ts.transpileModule(readFileSync(sourcePath,"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { customerLedgerSplit }=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));

test("₹29,008 payment cannot silently become ₹29,000 due and zero credit",()=>{
 const split=customerLedgerSplit("29008","29000","0");
 assert.equal(split.valid,false);
 assert.equal(split.differencePaise,800);
});

test("₹29,008 may be split as ₹29,000 advance plus ₹8 credit reduction",()=>{
 const split=customerLedgerSplit("29008","29000","8");
 assert.equal(split.valid,true);
 assert.equal(split.differencePaise,0);
});

test("₹29,000 actual transfer can be fully classified as advance",()=>{
 assert.equal(customerLedgerSplit("29000","29000","0").valid,true);
});

test("over-classification and blank or malformed inputs cannot be saved",()=>{
 assert.equal(customerLedgerSplit("29000","29008","0").differencePaise,-800);
 for(const amount of ["","0","1e4","NaN","29000.001"]){
  assert.equal(customerLedgerSplit(amount,"29000","0").valid,false);
 }
 assert.equal(customerLedgerSplit("29000","","29000").valid,false);
 assert.equal(customerLedgerSplit("29000","-1","29001").valid,false);
});
