const base='https://demo.rithantechnologies.com/cashledger/api';
const email=process.env.OWNER_EMAIL;
const password=process.env.OWNER_TEMP_PASSWORD;
if(!email||!password)throw new Error('Owner credentials missing');

const login=await fetch(base+'/auth/login',{
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({email,password}),
});
if(!login.ok)throw new Error('Public login failed: '+login.status);
const body=await login.json();
if(!body.accessToken)throw new Error('Public login token missing');
const headers={authorization:'Bearer '+body.accessToken};

for(const path of ['/dashboard/summary','/transactions?page=1&pageSize=5','/payables?page=1&pageSize=5','/reports/daily-summary']){
  const res=await fetch(base+path,{headers});
  if(!res.ok)throw new Error(path+' failed: '+res.status);
  await res.json();
}
console.log('✓ public owner login');
console.log('✓ public dashboard');
console.log('✓ public transaction pagination');
console.log('✓ public payable pagination');
console.log('✓ public reports');
console.log('PUBLIC AUTH SMOKE PASS');
