// Financial splits are entered independently. Do not silently transfer any
// remainder between customer due and customer credit.
function paise(input:string):number|null {
  const value=input.trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(value))return null;
  const number=Number(value);
  if(!Number.isFinite(number)||number>Number.MAX_SAFE_INTEGER/100)return null;
  return Math.round(number*100);
}
export function customerLedgerSplit(amount:string,createsDue:string,reducesCredit:string){
  const payment=paise(amount);
  const due=paise(createsDue);
  const credit=paise(reducesCredit);
  const validInputs=payment!==null&&payment>0&&due!==null&&credit!==null;
  const classified=due!==null&&credit!==null?due+credit:null;
  const difference=validInputs&&classified!==null?payment-classified:null;
  return { valid:validInputs&&difference===0, classifiedPaise:classified, differencePaise:difference };
}
