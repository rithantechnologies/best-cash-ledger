const assert=require("node:assert/strict");
const test=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const customer=fs.readFileSync(path.join(__dirname,"../src/app/customers/page.tsx"),"utf8");
const profile=fs.readFileSync(path.join(__dirname,"../src/app/customers/[id]/page.tsx"),"utf8");
const service=fs.readFileSync(path.join(__dirname,"../../api/src/customers/customers.service.ts"),"utf8");

test("mobile creation is a compact bottom sheet with accessible fixed actions",()=>{
 assert.match(customer,/role="dialog" aria-modal="true"/);
 assert.match(customer,/items-end justify-center/);
 assert.match(customer,/sm:items-center/);
 assert.match(customer,/max-h-\[calc\(100dvh-0\.5rem\)\]/);
 assert.match(customer,/min-h-0 space-y-3 overflow-y-auto/);
 assert.match(customer,/shrink-0 space-y-2 border-t/);
 assert.match(customer,/name="customer_name" autoComplete="name"/);
 assert.match(customer,/name="customer_mobile" autoComplete="tel"/);
 assert.match(customer,/Save & add details/);
 assert.match(customer,/Save only/);
 assert.match(customer,/Customer type/);
 assert.match(customer,/activeTypes.map/);
 assert.match(customer,/settings\/customer-types/);
});
test("save-and-continue opens newly returned customer instead of list",()=>{
 assert.match(customer,/apiFetch<\{id:string\}>\("\/customers"/);
 assert.match(customer,/router\.push\("\/customers\/"\+customer\.id\+"\?setup=1"\)/);
 assert.match(customer,/const openDetails=submitter\?\.value!=="stay"/);
 assert.match(customer,/if\(openDetails\)/);
 assert.match(customer,/else\{setMessage\("Customer created\."\);await load\(1\);\}/);
 assert.match(service,/return customer;/);
});
test("mobile list prioritizes search and compact cards",()=>{
 assert.match(customer,/Sort & page size/); // collapsible option button in source
 assert.match(customer,/sm:contents/);
 assert.match(customer,/sm:hidden/);
 assert.match(customer,/Open details →/);
 assert.match(customer,/More actions/);
});
test("profile shows add-details view and retains activity ledger",()=>{
 assert.match(profile,/useState<"details"\|"activity">\("details"\)/);
 assert.match(profile,/aria-label="Customer profile sections"/);
 assert.match(profile,/Customer saved ✓/);
 assert.match(profile,/Add customer details/);
 for(const text of ["+ Card","+ Bank","+ UPI","+ Recipient","Activity & ledger","Card Ledger","Recent transactions"]){
  assert.ok(profile.includes(text),text);
 }
 assert.match(profile,/SavedList title="Saved cards" count=\{c\.cards\.length\} addLabel="Add card"/);
 assert.match(profile,/view==="activity"\?<\>/);
 assert.match(profile,/view==="details"\?<\>/);
});
test("saved card action uses customer-scoped API and validates four digits",()=>{
 assert.match(profile,/apiFetch\("\/customers\/"\+id\+"\/cards"/);
 assert.match(profile,/\^\\d\{4\}\$/);
 assert.match(profile,/lastFourDigits:cardLastFour/);
 assert.match(profile,/setAddingCard\(false\);setCardBank\(""\)/);
});
