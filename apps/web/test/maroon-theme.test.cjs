const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'../src/'+p),'utf8');
const shell=read('components/app-shell.tsx');
const layout=read('app/layout.tsx');
const css=read('app/globals.css');
const quick=read('components/quick-expense-entry.tsx');
const script=layout.split(String.fromCharCode(96))[1];
assert.ok(script,'An inline pre-paint theme script is required');

function bootstrap(saved,osDark=false){
 const doc={documentElement:{dataset:{theme:''}}};
 const localStorage={getItem:()=>saved};
 vm.runInNewContext(script,{localStorage,matchMedia:()=>({matches:osDark}),document:doc});
 return doc.documentElement.dataset.theme;
}

test('new browser uses maroon before React hydrates; existing choices are respected',()=>{
 assert.equal(bootstrap(null),'maroon');
 assert.equal(bootstrap('maroon'),'maroon');
 assert.equal(bootstrap('light'),'light');
 assert.equal(bootstrap('dark'),'dark');
 assert.equal(bootstrap('system',true),'dark');
 assert.equal(bootstrap('system',false),'light');
});
test('maroon is selectable and reversible on desktop and mobile menus',()=>{
 assert.match(shell,/type ThemeMode="maroon"\|"system"\|"light"\|"dark"/);
 assert.match(shell,/const \[theme,setTheme\]=useState<ThemeMode>\("maroon"\)/);
 assert.equal((shell.match(/\["maroon","system","light","dark"\] as ThemeMode\[\]/g)||[]).length,2);
 assert.equal((shell.match(/role="group" aria-label="Appearance theme"/g)||[]).length,2);
 assert.match(shell,/localStorage\.setItem\("cashledger_theme",mode\)/);
 assert.match(shell,/mode==="maroon"\?"maroon":dark\?"dark":"light"/);
});
test('maroon is a scoped palette, leaving financial meanings and classic appearance intact',()=>{
 assert.match(css,/html\[data-theme="maroon"\] \{/);
 assert.match(css,/--accent: #8c2043;/);
 assert.match(css,/--money-in: #087c58;/);
 assert.match(css,/--money-out: #bb3450;/);
 assert.match(css,/html\[data-theme="maroon"\] body\.cashledger-modern-task/);
 assert.match(css,/html\[data-theme="maroon"\] \.swipe-commerce-page/);
 assert.match(css,/html\[data-theme="maroon"\] \.ui-preview/);
 assert.match(css,/html\[data-theme="maroon"\] \.swipe-result-card/);
 assert.match(css,/html\[data-theme="maroon"\] \.dashboard-finance-shell/);
 assert.match(shell,/cashledger-mobile-new/);
 assert.match(shell,/cashledger-speed-card/);
 assert.match(quick,/cashledger-expense-trigger/);
 assert.match(css,/html\[data-theme="dark"\]/);
});
