const assert=require("node:assert/strict");
const {test}=require("node:test");
const fs=require("node:fs");
const path=require("node:path");
const page=fs.readFileSync(path.join(__dirname,"../src/app/customers/page.tsx"),"utf8");
const api=fs.readFileSync(path.join(__dirname,"../../api/src/customers/customers.controller.ts"),"utf8");
const settings=fs.readFileSync(path.join(__dirname,"../../api/src/settings/settings.controller.ts"),"utf8");
test("STAFF can add customers from header and empty search results",()=>{
 assert.match(page,/const canRegisterCustomer=admin\|\|role==="STAFF"/);
 assert.match(page,/\{canRegisterCustomer\?<button onClick=\{\(\)=>openCustomerCreate\(\)\}/);
 assert.match(page,/\{canRegisterCustomer&&listReady&&pagination.total===0/);
 assert.match(page,/No matching customers[\s\S]*canRegisterCustomer&&q\.trim\(\)\.length>=2/);
 assert.match(page,/openCustomerCreate\(q\)/);
 assert.match(page,/apiFetch<\{id:string\}>\("\/customers",\{method:"POST"/);
});
test("customer registration is authenticated and does not need owner-role permissions",()=>{
 assert.match(api,/@UseGuards\(JwtAuthGuard\)/);
 assert.match(api,/@Post\(\)\s*create\(@Body\(\) dto: CreateCustomerDto/);
 assert.match(settings,/@Get\('customer-types'\)/);
});
test("staff creation does not expose edit or retire controls",()=>{
 assert.match(page,/const admin=role==="OWNER"\|\|role==="ADMIN"/);
 assert.match(page,/\{admin\?<button type="button" onClick=\{\(\)=>beginEdit\(c\)\}/);
 assert.match(page,/\{admin\?<details/);
 assert.match(page,/\{admin\?<><button onClick=\{\(\)=>beginEdit\(c\)\}/);
});
