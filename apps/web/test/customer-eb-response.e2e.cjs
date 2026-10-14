// Browser regression: an older Cash Ledger API may omit customer.serviceProfiles.
// PUPPETEER_MODULE=/path/to/puppeteer CHROME_PATH=/path/to/chrome
// E2E_BASE=http://127.0.0.1:3233/cashledger node apps/web/test/customer-eb-response.e2e.cjs
const assert = require("node:assert/strict");
const puppeteer = require(process.env.PUPPETEER_MODULE || "puppeteer");
const base = process.env.E2E_BASE || "http://127.0.0.1:3200/cashledger";
const chrome = process.env.CHROME_PATH;
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const customer = {
  id, customerCode:"CUS-TEST", customerType:"REGULAR", customerTypeId:null,
  customerTypeConfig:null, fullName:"Customer API compatibility test",
  mobile:null, ebNumber:null, notes:null, isActive:true,
  cards:[],bankAccounts:[],upiAccounts:[],beneficiaries:[],
  transactions:[],payables:[],receivables:[],
  // serviceProfiles intentionally omitted, matching the currently deployed older API.
};
(async()=>{
  const browser=await puppeteer.launch({headless:true,executablePath:chrome,
    args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
  try {
    const page=await browser.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.setRequestInterception(true);
    page.on("request",request=>{
      if(!request.url().includes("/cashledger/api/"))return request.continue();
      const url=request.url();
      let body=[];
      if(url.includes("/api/customers/"+id+"/card-ledger")) {
        body={availableAdvances:[],customer:{id,fullName:customer.fullName,mobile:null},
          cards:[],selectedCardId:null,openPayOutItems:[],openPayInItems:[],
          totals:{debit:0,credit:0,balance:0,position:"SETTLED"},rows:[]};
      } else if(url.includes("/api/customers/"+id+"/demo-card-status")) {
        body={enabled:false,cardIds:[]};
      } else if(url.includes("/api/customers/"+id)) {
        body=customer;
      }
      return request.respond({status:200,contentType:"application/json",body:JSON.stringify(body)});
    });
    await page.evaluateOnNewDocument(()=>localStorage.setItem("cashledger_user",
      JSON.stringify({id:"test-user",role:"OWNER",fullName:"Test User"})));
    const response=await page.goto(base+"/customers/"+id,{waitUntil:"networkidle2",timeout:30000});
    await page.waitForFunction(()=>document.body.innerText.includes("Customer API compatibility test"),
      {timeout:15000});
    assert.equal(response.status(),200);
    assert.deepEqual(errors,[],"No uncaught rendering errors");
    const content=await page.evaluate(()=>document.body.innerText);
    assert.ok(content.includes("EB records could not be loaded from the current API"),
      "Missing EB response is explained, not reported as zero saved");
    assert.ok(content.includes("Bank accounts"),"Other saved customer details still render");
    assert.ok(!content.includes("This page couldn’t load"),"Error boundary must not render");
    console.log("PASS: customer profile handles an older API response missing EB connections");
  }finally{await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
