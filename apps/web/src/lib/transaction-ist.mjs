// Consistent India Standard Time for displayed transaction timestamps.
// These helpers NEVER modify the stored source timestamps or financial dates.
const formatter=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Asia/Kolkata",year:"numeric",month:"short",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23",
});
function parts(input){
  const date=input instanceof Date?input:new Date(input);
  if(Number.isNaN(date.getTime()))return null;
  const entries=formatter.formatToParts(date);
  return Object.fromEntries(entries.map(entry=>[entry.type,entry.value]));
}
export function formatTransactionTimeIst(input){
  const p=parts(input);
  if(!p)return "—";
  const hour=Number(p.hour);
  return String(hour%12||12).padStart(2,"0")+":"+p.minute+" "+(hour<12?"AM":"PM")+" IST";
}
export function formatTransactionDateIst(input){
  const p=parts(input);
  if(!p)return "—";
  return p.day+" "+p.month+" "+p.year+", "+formatTransactionTimeIst(input);
}
export function formatTransactionDayIst(input){
  const p=parts(input);
  return p?p.day+" "+p.month+" "+p.year:"—";
}
export function transactionRangeIst(range,now=new Date()){
  if(range==="all")return null;
  const d=now instanceof Date?now:new Date(now);
  if(Number.isNaN(d.getTime()))throw new Error("Invalid current date");
  const today=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(d);
  const v=Object.fromEntries(today.map(p=>[p.type,p.value]));
  const start=new Date(v.year+"-"+v.month+"-"+v.day+"T00:00:00+05:30").getTime();
  const offset=range==="yesterday"?1:range==="week"?6:0;
  const from=start-offset*86400000;
  const to=(range==="yesterday"?start:start+86400000)-1;
  return {from:new Date(from).toISOString(),to:new Date(to).toISOString()};
}


// datetime-local controls have no timezone. Interpret their contents as IST,
// not the user's browser timezone, before sending owner corrections to the API.
const editableFormatter=new Intl.DateTimeFormat("en-GB",{
  timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"
});
export function transactionTimestampToInputIst(input){
  const d=input instanceof Date?input:new Date(input);
  if(Number.isNaN(d.getTime()))return "";
  const p=Object.fromEntries(editableFormatter.formatToParts(d).map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day+"T"+p.hour+":"+p.minute;
}
export function transactionInputIstToIso(value){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error("Choose a valid IST date and time");
  const d=new Date(value+":00+05:30");
  if(Number.isNaN(d.getTime())||transactionTimestampToInputIst(d)!==value)
    throw new Error("Invalid IST date and time");
  return d.toISOString();
}
