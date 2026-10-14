// Run against an isolated web release:
// PUPPETEER_MODULE=/path/to/puppeteer E2E_BASE=http://127.0.0.1:3211/cashledger node apps/web/test/browser-entry-suggestions.e2e.cjs
const assert=require("node:assert/strict");
const puppeteer=require(process.env.PUPPETEER_MODULE||"puppeteer");
const base=process.env.E2E_BASE||"http://127.0.0.1:3211/cashledger";
const browserPath=process.env.CHROME_PATH||"/home/cashledger/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome";
const regular="0a000000-0000-4000-8000-000000000001";
const staff={id:"test-staff-autofill-001",fullName:"UX Test Staff",role:"OWNER"};
const existing={
 id:"e2e-existing-1",customerCode:"CUS-E2E-01",customerType:"REGULAR",customerTypeId:regular,
 customerTypeConfig:{id:regular,name:"Regular",isActive:true},fullName:"Asha Test",mobile:"9876543210",
 ebNumber:null,notes:null,isActive:true,cards:[],bankAccounts:[],upiAccounts:[],beneficiaries:[],
};
let created=null,edited=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function button(page,text){await page.evaluate(text=>{const buttons=[...document.querySelectorAll("button")];const found=buttons.find(b=>b.textContent.trim().includes(text)&&!b.disabled);if(!found)throw Error("Button not found: "+text);found.click()},text)}
async function menuValues(page){return await page.$$eval('[data-entry-suggestions] [role="option"]',els=>els.map(x=>x.textContent?.trim()))}
async function openCreate(page){await button(page,"+ Customer");await page.waitForSelector('input[name="customer_name"]',{visible:true})}
async function closeCreate(page){await page.evaluate(()=>document.querySelector('[role="dialog"] button[aria-label="Close"]')?.click());await sleep(150)}
async function setControlled(page,selector,value){await page.$eval(selector,(el,value)=>{el.focus();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));},value)}
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:browserPath,args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"],defaultViewport:{width:1280,height:800}});
 try {
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request",request=>{
   const u=request.url();
   if(!u.includes("/cashledger/api/"))return request.continue();
   let value=[];
   if(u.includes("/customers/demo-card-availability"))value={enabled:false};
   else if(u.includes("/settings/customer-types"))value=[{id:regular,name:"Regular",legacyType:"REGULAR",isActive:true}];
   else if(request.method()==="POST" && /\/api\/customers$/.test(u)){created=JSON.parse(request.postData()||"{}");value={id:"e2e-created-2"};}
   else if(request.method()==="PATCH" && u.includes("/api/customers/e2e-existing-1")){edited=JSON.parse(request.postData()||"{}");value=existing;}
   else if(/\/api\/customers\?/.test(u))value={items:[existing],pagination:{page:1,pageSize:25,total:1,totalPages:1}};
   else if(u.includes("/api/customers/"))value=existing;
   else if(u.includes("/api/auth/"))value={user:staff};
   return request.respond({status:200,contentType:"application/json",body:JSON.stringify(value)});
  });
  await page.evaluateOnNewDocument((u)=>{localStorage.setItem("cashledger_user",JSON.stringify(u));},staff);
  await page.goto(base+"/customers",{waitUntil:"networkidle2",timeout:30000});
  await page.waitForSelector('input[placeholder="Search customers"]',{timeout:20000}).catch(()=>{});
  await openCreate(page);
  await page.type('input[name="customer_name"]',"State Bank of India");
  await page.click('input[name="customer_mobile"]');
  await sleep(130);
  const cached=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith("cashledger_field_suggestions_v1:")).map(k=>JSON.parse(localStorage.getItem(k))));
  assert.ok(cached.some(c=>c.customer_name?.includes("State Bank of India")),"Name remembered in this staff's browser");
  await closeCreate(page);
  await page.reload({waitUntil:"networkidle2"});
  await openCreate(page);
  await page.type('input[name="customer_name"]',"State");
  await page.waitForSelector('[data-entry-suggestions] [role="option"]',{visible:true});
  assert.ok((await menuValues(page)).includes("State Bank of India"));
  const anchors=await page.evaluate(()=>{
   const field=document.querySelector('input[name="customer_name"]').getBoundingClientRect(),menu=document.querySelector('[data-entry-suggestions]').getBoundingClientRect();
   return {distance:Math.abs(menu.top-field.bottom),leftDelta:Math.abs(menu.left-field.left),placement:document.querySelector('[data-entry-suggestions]').dataset.placement};
  });
  assert.ok(anchors.distance<18 && anchors.leftDelta<20,JSON.stringify(anchors));
  await page.click('[data-entry-suggestions] [role="option"]');
  assert.equal(await page.$eval('input[name="customer_name"]',el=>el.value),"State Bank of India");
  await page.type('input[name="customer_mobile"]',"9988776655");
  await page.click('input[name="customer_name"]');
  await sleep(100);
  await closeCreate(page);
  await page.reload({waitUntil:"networkidle2"});
  await openCreate(page);
  await page.type('input[name="customer_mobile"]',"99");
  await page.waitForSelector('[data-entry-suggestions] [role="option"]',{visible:true});
  assert.ok((await menuValues(page)).includes("9988776655"));
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await page.$eval('input[name="customer_mobile"]',e=>e.value),"9988776655");
  await setControlled(page,'input[name="customer_name"]',"Sample Created");
  await page.click('button[type="submit"][name="after_create"][value="stay"]');
  await sleep(400);
  assert.equal(created?.fullName,"Sample Created","form reads values correctly");
  assert.equal(created?.mobile,"9988776655","selected mobile is posted");
  console.log("PASS desktop: local persistence, anchored positioning, click/keyboard selection, actual submit payload");

  // Controlled field edit works even when React rerenders.
  await page.reload({waitUntil:"networkidle2"});
  await button(page,"Edit");
  await page.waitForSelector('input[name="cashledger_notes"]');
  await page.type('input[name="cashledger_notes"]',"Repeat expense note");
  await page.click('input[name="cashledger_name"]');
  await page.click('input[name="cashledger_notes"]');
  await page.keyboard.down("Control");await page.keyboard.press("A");await page.keyboard.up("Control");
  await page.type('input[name="cashledger_notes"]',"Rep");
  await page.waitForSelector('[data-entry-suggestions] [role="option"]',{visible:true});
  await page.click('[data-entry-suggestions] [role="option"]');
  assert.equal(await page.$eval('input[name="cashledger_notes"]',el=>el.value),"Repeat expense note");
  await page.click('input[name="cashledger_name"]');
  assert.equal(await page.$eval('input[name="cashledger_notes"]',el=>el.value),"Repeat expense note","React-controlled value survives rerender");
  await page.click('button[form="edit-customer"]');
  await sleep(300);
  assert.equal(edited?.notes,"Repeat expense note","React edit submitted selected value");
  console.log("PASS React-controlled edit: persisted suggestion, selection, rerender and PATCH payload");
  // An additional generic text control near the bottom tests keyboard viewport placement.
  const mobile=await browser.newPage();
  await mobile.setRequestInterception(true);
  mobile.on("request",req=>{
   if(!req.url().includes("/cashledger/api/"))return req.continue();
   const data=req.url().includes("customer-types")?[{id:regular,name:"Regular",legacyType:"REGULAR",isActive:true}]:req.url().includes("demo-card-availability")?{enabled:false}:req.url().includes("/customers?")?{items:[existing],pagination:{page:1,pageSize:25,total:1,totalPages:1}}:[];
   return req.respond({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  await mobile.evaluateOnNewDocument(user=>localStorage.setItem("cashledger_user",JSON.stringify(user)),staff);
  await mobile.setViewport({width:390,height:380,isMobile:true,hasTouch:true});
  await mobile.goto(base+"/customers",{waitUntil:"networkidle2",timeout:30000});
  await mobile.evaluate(()=>{
    const field=document.createElement("input");
    field.name="cashledger_test_partner";field.setAttribute("autocomplete","on");
    Object.assign(field.style,{position:"fixed",bottom:"20px",left:"16px",width:"310px",height:"44px",background:"#fff",zIndex:"20"});
    document.body.append(field);
  });
  await mobile.click('input[name="cashledger_test_partner"]');
  await mobile.type('input[name="cashledger_test_partner"]',"Canara Service Partner");
  await mobile.evaluate(()=>document.activeElement.blur());
  await mobile.click('input[name="cashledger_test_partner"]');
  await mobile.$eval('input[name="cashledger_test_partner"]',el=>el.value="");
  await mobile.type('input[name="cashledger_test_partner"]',"Can");
  await mobile.waitForSelector('[data-entry-suggestions][data-placement="above"]',{visible:true});
  const rect=await mobile.evaluate(()=>{
    const field=document.querySelector('input[name="cashledger_test_partner"]').getBoundingClientRect(),menu=document.querySelector('[data-entry-suggestions]').getBoundingClientRect();
    return {fieldTop:field.top,menuBottom:menu.bottom,menuTop:menu.top,width:menu.width,screenWidth:innerWidth};
  });
  assert.ok(rect.menuBottom<=rect.fieldTop,JSON.stringify(rect));
  assert.ok(rect.menuTop>=0 && rect.width<rect.screenWidth);
  await mobile.screenshot({path:"/tmp/cashledger-autosuggest-mobile-chromium.png"});
  const menuAfterScreenshot=await mobile.evaluate(()=>Boolean(document.querySelector('[data-entry-suggestions]')));
  console.log("Mobile menu visible after screenshot:",menuAfterScreenshot);
  if(!menuAfterScreenshot)await mobile.click('input[name="cashledger_test_partner"]');
  await mobile.waitForSelector('[data-entry-suggestions]',{visible:true});
  await mobile.click('[data-entry-suggestions] button:last-child');
  await mobile.evaluate(()=>document.activeElement.blur());
  const values=await mobile.evaluate(()=>JSON.parse(localStorage.getItem("cashledger_field_suggestions_v1:test-staff-autofill-001")||"{}").cashledger_test_partner||[]);
  assert.equal(values.length,0,"Clear action does not re-save on blur");
  await mobile.evaluate(()=>{
    const sensitive=document.createElement("input");sensitive.name="cashledger_bank_account_number";sensitive.type="text";document.body.append(sensitive);
    sensitive.focus();sensitive.value="123456789012";sensitive.dispatchEvent(new Event("input",{bubbles:true}));sensitive.blur();
  });
  const memory=await mobile.evaluate(()=>localStorage.getItem("cashledger_field_suggestions_v1:test-staff-autofill-001"));
  assert.ok(!JSON.parse(memory).cashledger_bank_account_number,"Financial identifiers not cached");
  console.log("PASS mobile: menu flips above, stays within viewport, clearing, bank-number protection");
  console.log("BROWSER_TESTS_PASSED Chromium 148 (Chrome-compatible), isolated mocked customer data");
 } finally{await browser.close();}
})().catch(e=>{console.error("BROWSER_TEST_FAILED",e.stack||e);process.exitCode=1});
