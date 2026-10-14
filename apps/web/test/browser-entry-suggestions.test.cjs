const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");
const file=path.join(__dirname,"../src/lib/browser-suggestion-history.ts");
const compiled=ts.transpileModule(fs.readFileSync(file,"utf8"),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
}).outputText;
const mod=new Module(file,module);
mod.filename=file;mod.paths=module.paths;mod._compile(compiled,file);
const {currentStaffId,suggestionFieldKey,getRemembered,saveRemembered,matchesRemembered,clearRememberedField}=mod.exports;
class FakeInput {
 constructor({name="",placeholder="",type="text",autocomplete="on",inputMode="",disabled=false,readOnly=false}={}){
  Object.assign(this,{name,placeholder,type,autocomplete,inputMode,disabled,readOnly});
 }
 closest(){return null}
 getAttribute(name){return name==="placeholder"?this.placeholder:null}
}
class FakeTextarea extends FakeInput {}
global.HTMLInputElement=FakeInput;global.HTMLTextAreaElement=FakeTextarea;
class MemoryStorage{
 data=new Map();
 getItem(k){return this.data.get(k)??null}
 setItem(k,v){this.data.set(k,v)}
}
test("eligible repeat-entry fields have stable keys",()=>{
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_bank_name"})),"cashledger_bank_name");
 assert.equal(suggestionFieldKey(new FakeInput({placeholder:"Partner company"})),"partner_company");
 assert.equal(suggestionFieldKey(new FakeInput({name:"customer_mobile",type:"tel"})),"customer_mobile");
});
test("never store password, card/Aadhaar/account numbers, OTP, or financial amounts",()=>{
 for (const name of ["cashledger_aadhaar_last_four","cashledger_card_last_four","cashledger_bank_account_number","cashledger_password","cashledger_pin","cashledger_reference","cashledger_amount","cashledger_commission","cashledger_search"]) {
  assert.equal(suggestionFieldKey(new FakeInput({name})),null,name);
 }
 assert.equal(suggestionFieldKey(new FakeInput({type:"password",name:"cashledger_name"})),null);
});
test("per-staff browser storage persists, de-duplicates and matches partial entries",()=>{
 const storage=new MemoryStorage();
 storage.setItem("cashledger_user",JSON.stringify({id:"staff-one-1"}));
 assert.equal(currentStaffId(storage),"staff-one-1");
 saveRemembered(storage,"staff-one-1","cashledger_bank","State Bank of India");
 saveRemembered(storage,"staff-one-1","cashledger_bank","Canara Bank");
 saveRemembered(storage,"staff-one-1","cashledger_bank","STATE BANK OF INDIA");
 assert.deepEqual(getRemembered(storage,"staff-one-1").cashledger_bank,["STATE BANK OF INDIA","Canara Bank"]);
 assert.deepEqual(matchesRemembered(getRemembered(storage,"staff-one-1").cashledger_bank,"sta"),["STATE BANK OF INDIA"]);
 assert.equal(getRemembered(storage,"staff-two").cashledger_bank,undefined);
});
test("mobile prefix 99 suggestions and keyboard matching operate without network",()=>{
 const storage=new MemoryStorage();
 saveRemembered(storage,"a-user-1","customer_mobile","9988776655");
 saveRemembered(storage,"a-user-1","customer_mobile","9912345678");
 saveRemembered(storage,"a-user-1","customer_mobile","8877665544");
 assert.deepEqual(matchesRemembered(getRemembered(storage,"a-user-1").customer_mobile,"99"),["9912345678","9988776655"]);
 assert.deepEqual(matchesRemembered(["State Bank","Bank of Maharashtra"],"bank"),["Bank of Maharashtra","State Bank"]);
});
test("sensitive-looking values inside generic fields and huge values are excluded",()=>{
 const storage=new MemoryStorage();
 saveRemembered(storage,"a-user-1","cashledger_notes","1234567890123456");
 saveRemembered(storage,"a-user-1","cashledger_notes","UPI 123456789");
 saveRemembered(storage,"a-user-1","cashledger_notes","A routine transfer");
 assert.deepEqual(getRemembered(storage,"a-user-1").cashledger_notes,["A routine transfer"]);
});
test("field clearing removes saved suggestions without touching other fields",()=>{
 const storage=new MemoryStorage();
 saveRemembered(storage,"a-user-1","cashledger_bank","Canara Bank");
 saveRemembered(storage,"a-user-1","cashledger_note","Lunch");
 clearRememberedField(storage,"a-user-1","cashledger_bank");
 assert.equal(getRemembered(storage,"a-user-1").cashledger_bank,undefined);
 assert.deepEqual(getRemembered(storage,"a-user-1").cashledger_note,["Lunch"]);
});
