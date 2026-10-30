const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
const file = path.join(__dirname, "../src/lib/browser-suggestion-history.ts");
const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded._compile(output, file);
const { HISTORY_PREFIX, getRemembered, saveRemembered, matchesRemembered, safeRememberedValue, normalizeFieldKey, clearRememberedField } = loaded.exports;
const data = new Map();
const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
const staff = "staff-123456";
for (let i = 1; i <= 45; i++) saveRemembered(storage, staff, "customer_name", "PERSON " + String(i).padStart(2, "0"));
const values = getRemembered(storage, staff).customer_name;
assert.equal(values.length, 45, "No 24-entry cap");
assert.equal(matchesRemembered(values, "PERSON").length, 45, "No 3-match cap");
assert.deepEqual(matchesRemembered(values, "PERSON 12"), ["PERSON 12"]);
assert.equal(matchesRemembered(values, "").length, 45, "Blank input reveals all stored");
assert.equal(normalizeFieldKey("customerMobile"), "customer_mobile");
assert.equal(normalizeFieldKey("bankName"), "bank_name");
assert.equal(safeRememberedValue("customer_mobile", "98"), null, "Partial phone excluded");
assert.equal(safeRememberedValue("customer_mobile", "9876543210"), "9876543210");
assert.equal(safeRememberedValue("customer_mobile", "+919876543210"), "+919876543210");
assert.equal(safeRememberedValue("reference", "123456789012"), null, "Sensitive number excluded");
assert.equal(safeRememberedValue("card_number", "1234"), null);
assert.equal(safeRememberedValue("amount", "1000"), null);
saveRemembered(storage, staff, "reference", "ABCD");
assert.deepEqual(getRemembered(storage, staff).reference, ["ABCD"]);
clearRememberedField(storage, staff, "reference");
assert.equal(getRemembered(storage, staff).reference, undefined);
assert.ok(data.has(HISTORY_PREFIX + staff));
const component = fs.readFileSync(path.join(__dirname, "../src/components/browser-entry-suggestions.tsx"), "utf8");
const focusSection = component.slice(component.indexOf("function focus("), component.indexOf("function type("));
assert.match(focusSection, /void render\(input, key, input\.value\)/, "Classic suggestions must display immediately on focus");
assert.doesNotMatch(focusSection, /if \(pointerFocus\.current === input/, "No click-only restriction on autofocus");
assert.match(component, /Math\.min\(255, space - 8\)/, "Classic dropdown sizing restored");
assert.match(component, /background: "var\(--surface, #fff\)"/, "Solid classic suggestion background");
assert.match(component, /readFieldValues\(staff, key\)/, "Existing IndexedDB history still accessible");
// Every ordinary search box gets a page-scoped history key. An app-owned
// customer picker keeps its real results rather than displaying a second menu.
class FakeInput {
  constructor({name="", type="text", inputMode="", path="/payables", placeholder="", owned=false, role=null}={}) {
    Object.assign(this,{name,type,inputMode,placeholder,disabled:false,readOnly:false,
      step:"",autocomplete:"on",id:"",ownerDocument:{location:{pathname:path}},owned,role});
  }
  getAttribute(name){return name==="placeholder"?this.placeholder:name==="role"?this.role:null;}
  closest(selector){return selector==="[data-no-suggestions]"&&this.owned?this:null;}
}
global.HTMLInputElement=FakeInput;
global.HTMLTextAreaElement=class FakeTextarea {};
const { suggestionFieldKey }=loaded.exports;
const payableQuery=suggestionFieldKey(new FakeInput({name:"cashledger_q",placeholder:"Search customer"}));
const auditQuery=suggestionFieldKey(new FakeInput({name:"cashledger_q",path:"/audit",placeholder:"Search activity"}));
const phoneQuery=suggestionFieldKey(new FakeInput({name:"cashledger_daily_customer_search",path:"/daily-cash",inputMode:"search",placeholder:"Search name or mobile"}));
assert.equal(payableQuery,"search_payables_cashledger_q");
assert.equal(auditQuery,"search_audit_cashledger_q");
assert.equal(phoneQuery,"search_daily_cash_cashledger_daily_customer_search");
assert.notEqual(payableQuery,auditQuery,"Different screens retain independent searches");
assert.equal(suggestionFieldKey(new FakeInput({name:"cashledger_customer_search",owned:true,inputMode:"search"})),null);
assert.equal(suggestionFieldKey(new FakeInput({name:"search",role:"combobox"})),null);
assert.equal(suggestionFieldKey(new FakeInput({name:"amount",type:"number"})),null);
assert.equal(safeRememberedValue(payableQuery,"9876543210"),"9876543210","Full mobile lookup can be saved");
assert.equal(safeRememberedValue(payableQuery,"NIK"),"NIK","Customer names are valid search history");
assert.equal(safeRememberedValue(phoneQuery,"123456789012"),null,"Never store full Aadhaar as a search");
assert.equal(safeRememberedValue(phoneQuery,"1234567890123456"),null,"Never store full card");
saveRemembered(storage,staff,payableQuery,"9876543210");
saveRemembered(storage,staff,payableQuery,"NIK");
assert.deepEqual(matchesRemembered(getRemembered(storage,staff)[payableQuery],"98"),["9876543210"]);
assert.match(component,/Matching customers and saved searches/,"Global search shows live and recent matches");
console.log("PASS: all-entry history, universal search, independent pages, mobile/name matching, secure exclusions");
