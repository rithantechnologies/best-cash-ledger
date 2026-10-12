const assert=require("node:assert/strict");
const test=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../src");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const types=read("components/customer-type-settings.tsx");
const customers=read("app/customers/page.tsx");
const profile=read("app/customers/[id]/page.tsx");
const settings=read("app/settings/page.tsx");
test("settings manages configurable customer types",()=>{
 assert.ok(settings.includes("<CustomerTypeSettings"));
 assert.ok(types.includes('/settings/customer-types'));
 assert.ok(types.includes('Customer type added.'));
 assert.ok(types.includes('Customer type renamed.'));
 assert.ok(types.includes('isActive:!type.isActive'));
 assert.ok(types.includes('Retired types stay on existing profiles.'));
});
test("customer create uses active configured types and selected UUID",()=>{
 assert.ok(customers.includes('activeTypes.map'));
 assert.ok(customers.includes('customerTypeId,fullName,mobile'));
 assert.ok(customers.includes('setCustomerTypeId(defaultTypeId())'));
 assert.ok(customers.includes('Save & add details'));
});
test("edit existing customers, including retired type assigned previously",()=>{
 assert.ok(customers.includes('t.isActive||t.id===editTypeId'));
 assert.ok(customers.includes('customerTypeId:editTypeId'));
 assert.ok(profile.includes('type.isActive||type.id===profileTypeId'));
 assert.ok(profile.includes('customerTypeId:profileTypeId'));
});
test("customer profile has visible saved-card action",()=>{
 assert.ok(profile.includes('+ Save new card'));
 assert.ok(profile.includes('setAddingCard(true)'));
 assert.ok(profile.includes('form="customer-add-card"'));
 assert.ok(profile.includes('apiFetch("/customers/"+id+"/cards"'));
});
