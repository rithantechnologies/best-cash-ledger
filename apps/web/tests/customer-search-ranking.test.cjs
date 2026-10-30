const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");

function load(source){
 const filename=path.resolve(__dirname,source);
 const text=fs.readFileSync(filename,"utf8");
 const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m=new Module(filename,module);m.filename=filename;m.paths=module.paths;m._compile(js,filename);
 return m.exports;
}
const web=load("../src/lib/customer-search-rank.ts");
const api=load("../../api/src/search/customer-search-rank.ts");
const rows=[
 {id:"a",fullName:"Amudha",mobile:"9876543210"},
 {id:"m",fullName:"Muthukrishnan",mobile:"9123456780"},
 {id:"k",fullName:"Kumar Muthu",mobile:"9001234567"},
 {id:"p",fullName:"Pramudha",mobile:"8899999999"},
];
for(const rank of [web,api]){
 assert.deepEqual(rank.sortCustomerMatches(rows,"MU").map(c=>c.fullName),[
  "Muthukrishnan","Kumar Muthu","Amudha","Pramudha"
 ],"Full/word prefix first; internal substring remains as fallback");
 assert.equal(rank.sortCustomerMatches(rows,"98")[0].fullName,"Amudha","Mobile prefix outranks incidental matches");
 assert.deepEqual(rank.sortCustomerMatches(rows,"mu").map(c=>c.id),
   rank.sortCustomerMatches(rows,"MU").map(c=>c.id),"Case-insensitive stable ordering");
 assert.equal(rank.customerMatchRank({fullName:"Muthu Krishnan"},"MU KRI"),3,
   "Combination word prefixes supported");
 assert.ok(rank.customerMatchRank({fullName:"Amudha"},"mu")>rank.customerMatchRank({fullName:"Muthukrishnan"},"mu"));
 assert.equal(rank.customerMatchRank({fullName:"Muthukrishnan"},"Muthukrishnan"),0);
 assert.equal(rank.customerMatchRank({fullName:"Kumar Muthu"},"mu"),2);
}
console.log("PASS: prefix-first customers, mobile prefix, mixed words, all substring fallbacks; API/web agree");
