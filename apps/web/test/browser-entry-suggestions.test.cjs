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
 constructor({name="",placeholder="",label="",type="text",step="",autocomplete="on",inputMode="",disabled=false,readOnly=false}={}){
  Object.assign(this,{name,placeholder,label,type,step,autocomplete,inputMode,disabled,readOnly,id:""});
  this.ownerDocument={location:{pathname:"/cashledger/customers"}};
 }
 closest(selector) {
  if (selector === "label") return this.label ? {querySelector:()=>({textContent:this.label})} : null;
  if (selector === "form") return {id:"create-customer"};
  return null;
 }
 getAttribute(name){
  return name==="placeholder"?this.placeholder:name==="aria-label"?null:name==="role"?null:null;
 }
}
class FakeTextarea extends FakeInput {}
global.HTMLInputElement=FakeInput;global.HTMLTextAreaElement=FakeTextarea;
class MemoryStorage{
 data=new Map();
 getItem(k){return this.data.get(k)??null}
 setItem(k,v){this.data.set(k,v)}
}
test("text, mobile and all non-money numeric inputs are eligible",()=>{
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_bank_name"})),"bank_name");
 assert.equal(suggestionFieldKey(new FakeInput({placeholder:"Partner company"})),"partner_company");
 assert.equal(suggestionFieldKey(new FakeInput({name:"customer_mobile",type:"tel",inputMode:"numeric"})),"customer_mobile");
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_aadhaar_last_four",inputMode:"numeric"})),"cashledger_aadhaar_last_four");
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_card_last_four",inputMode:"numeric"})),"cashledger_card_last_four");
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_upi_id",autocomplete:"off"})),"cashledger_upi_id");
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_ifsc"})),"cashledger_ifsc");
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_reference"})),"cashledger_reference");
 assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_customer_eb_number",inputMode:"numeric",autocomplete:"off"})),"cashledger_customer_eb_number");
 assert.equal(suggestionFieldKey(new FakeInput({label:"Total copies",type:"number",step:"1"})),"total_copies");
 assert.ok(suggestionFieldKey(new FakeInput({label:"Name",placeholder:"Optional"})).includes("customers_create_customer_name"));
});
test("amount and amount-like financial fields are strictly excluded",()=>{
 for(const name of ["cashledger_amount","transfer_amount","cashledger_customer_payout","cashledger_total","account_balance","cashledger_credit_limit","wallet_charge","cashledger_price","cashledger_commission_amount","cashledger_profit"]){
  assert.equal(suggestionFieldKey(new FakeInput({name,type:"number"})),null,name);
 }
 assert.equal(suggestionFieldKey(new FakeInput({label:"Amount received",name:"unknown_field"})),null);
 assert.equal(suggestionFieldKey(new FakeInput({label:"Opening balance",type:"number"})),null);
 assert.equal(suggestionFieldKey(new FakeInput({label:"Customer gets",type:"number",step:"0.01"})),null);
 assert.equal(suggestionFieldKey(new FakeInput({label:"Default commission %",type:"number",step:"0.01"})),"default_commission");
});
test("passwords and sensitive fields are excluded while search fields are eligible",()=>{
 for (const name of ["cashledger_password","cashledger_pin","cashledger_otp","cashledger_card_number","demo_card_number","cashledger_security_code"]) {
  assert.equal(suggestionFieldKey(new FakeInput({name})),null,name);
 }
 assert.equal(suggestionFieldKey(new FakeInput({type:"password",name:"cashledger_name"})),null);
 assert.ok(suggestionFieldKey(new FakeInput({type:"search",name:"name_search"})).startsWith("search_"));
 assert.ok(suggestionFieldKey(new FakeInput({inputMode:"search",placeholder:"Phone, first name, card last 4, bank, UPI or AEPS PR…"})).startsWith("search_"));
});
test("per staff browser storage persists, deduplicates and matches partial entries",()=>{
 const storage=new MemoryStorage();
 storage.setItem("cashledger_user",JSON.stringify({id:"staff-one-1"}));
 assert.equal(currentStaffId(storage),"staff-one-1");
 saveRemembered(storage,"staff-one-1","bank_name","State Bank of India");
 saveRemembered(storage,"staff-one-1","bank_name","Canara Bank");
 saveRemembered(storage,"staff-one-1","bank_name","STATE BANK OF INDIA");
 assert.deepEqual(getRemembered(storage,"staff-one-1").bank_name,["STATE BANK OF INDIA","Canara Bank"]);
 assert.deepEqual(matchesRemembered(getRemembered(storage,"staff-one-1").bank_name,"sta"),["STATE BANK OF INDIA"]);
 assert.equal(getRemembered(storage,"staff-two").bank_name,undefined);
});
test("blank fields show every saved entry and typing filters immediately",()=>{
 const values=["PRABU", "PRIYA", "PRITHVI", "PRASAD", "PREM"];
 assert.deepEqual(matchesRemembered(values,""),values);
 assert.deepEqual(matchesRemembered(values,"p"),values);
 assert.deepEqual(matchesRemembered(values,"pr"),values);
 assert.deepEqual(matchesRemembered(values,"iya"),["PRIYA"]);
 assert.deepEqual(matchesRemembered(values,"nomatch"),[]);
});
test("mobile numeric suggestions match without network",()=>{
 const storage=new MemoryStorage();
 saveRemembered(storage,"a-user-1","customer_mobile","9988776655");
 saveRemembered(storage,"a-user-1","customer_mobile","9912345678");
 saveRemembered(storage,"a-user-1","customer_mobile","8877665544");
 saveRemembered(storage,"a-user-1","cashledger_card_last_four","9812");
 assert.deepEqual(matchesRemembered(getRemembered(storage,"a-user-1").customer_mobile,"99"),["9912345678","9988776655"]);
 assert.deepEqual(getRemembered(storage,"a-user-1").cashledger_card_last_four,["9812"]);
 assert.deepEqual(matchesRemembered(["State Bank","Bank of Maharashtra"],"bank"),["Bank of Maharashtra","State Bank"]);
});
test("no monetary, full Aadhaar or full payment card values leak through generic keys",()=>{
 const storage=new MemoryStorage();
 for(const name of ["cashledger_amount","cashledger_customer_payout","account_balance"]){
  saveRemembered(storage,"a-user-1",name,"1000.00");
  assert.equal(getRemembered(storage,"a-user-1")[name],undefined,name);
 }
 saveRemembered(storage,"a-user-1","cashledger_notes","1234567890123456");
 saveRemembered(storage,"a-user-1","cashledger_notes","123456789012");
 saveRemembered(storage,"a-user-1","cashledger_notes","UPI 123456789");
 saveRemembered(storage,"a-user-1","cashledger_notes","Routine expense note");
 assert.deepEqual(getRemembered(storage,"a-user-1").cashledger_notes,["Routine expense note"]);
});
test("previously remembered bank names are available across equivalent fields",()=>{
 const storage=new MemoryStorage();
 saveRemembered(storage,"a-user-1","cashledger_bank","Indian Bank");
 assert.deepEqual(getRemembered(storage,"a-user-1").bank_name,["Indian Bank"]);
 clearRememberedField(storage,"a-user-1","bank_name");
 assert.equal(getRemembered(storage,"a-user-1").bank_name,undefined);
});
test("field clearing retains other fields",()=>{
 const storage=new MemoryStorage();
 saveRemembered(storage,"a-user-1","bank_name","Canara Bank");
 saveRemembered(storage,"a-user-1","cashledger_note","Lunch");
 clearRememberedField(storage,"a-user-1","bank_name");
 assert.equal(getRemembered(storage,"a-user-1").bank_name,undefined);
 assert.deepEqual(getRemembered(storage,"a-user-1").cashledger_note,["Lunch"]);
});
