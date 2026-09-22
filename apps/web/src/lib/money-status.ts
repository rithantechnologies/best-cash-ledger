export type MoneyStatusTone = "slate"|"emerald"|"amber"|"rose"|"indigo";

type Obligation = { status:string; dueAt:string|null; remainingAmount?:string|number };
export type MoneyStatusTx = {
  payable?: Obligation|null;
  receivableSource?: Obligation|null;
};

function dueState(dueAt:string|null){
  if(!dueAt)return "pending" as const;
  const due=new Date(dueAt),now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const dueDay=new Date(due.getFullYear(),due.getMonth(),due.getDate());
  if(dueDay<today)return "overdue" as const;
  if(dueDay.getTime()===today.getTime())return "today" as const;
  return "pending" as const;
}

export function moneyStatus(tx:MoneyStatusTx){
  if(tx.payable){
    const p=tx.payable;
    if(p.status==="PAID")return {key:"PAYOUT_PAID",label:"Payout Paid",tone:"emerald" as MoneyStatusTone,dueAt:p.dueAt,kind:"payout" as const};
    if(p.status==="PARTIALLY_PAID")return {key:"PAYOUT_PARTIALLY_PAID",label:"Payout Partially Paid",tone:"amber" as MoneyStatusTone,dueAt:p.dueAt,kind:"payout" as const};
    if(p.status==="CANCELLED"||p.status==="REVERSED")return {key:"PAYOUT_"+p.status,label:"Payout "+p.status.toLowerCase(),tone:"rose" as MoneyStatusTone,dueAt:p.dueAt,kind:"payout" as const};
    const due=dueState(p.dueAt);
    if(p.status==="OVERDUE"||due==="overdue")return {key:"PAYOUT_OVERDUE",label:"Payout Overdue",tone:"rose" as MoneyStatusTone,dueAt:p.dueAt,kind:"payout" as const};
    if(due==="today")return {key:"PAYOUT_PENDING",label:"Payout Due Today",tone:"amber" as MoneyStatusTone,dueAt:p.dueAt,kind:"payout" as const};
    return {key:"PAYOUT_PENDING",label:"Payout Pending",tone:"amber" as MoneyStatusTone,dueAt:p.dueAt,kind:"payout" as const};
  }
  if(tx.receivableSource){
    const r=tx.receivableSource;
    if(r.status==="RECEIVED")return {key:"PAYIN_RECEIVED",label:"Pay-in Received",tone:"emerald" as MoneyStatusTone,dueAt:r.dueAt,kind:"payin" as const};
    if(r.status==="PARTIALLY_RECEIVED")return {key:"PAYIN_PARTIALLY_RECEIVED",label:"Pay-in Partially Received",tone:"indigo" as MoneyStatusTone,dueAt:r.dueAt,kind:"payin" as const};
    if(r.status==="CANCELLED"||r.status==="REVERSED")return {key:"PAYIN_"+r.status,label:"Pay-in "+r.status.toLowerCase(),tone:"rose" as MoneyStatusTone,dueAt:r.dueAt,kind:"payin" as const};
    const due=dueState(r.dueAt);
    if(r.status==="OVERDUE"||due==="overdue")return {key:"PAYIN_OVERDUE",label:"Pay-in Overdue",tone:"rose" as MoneyStatusTone,dueAt:r.dueAt,kind:"payin" as const};
    if(due==="today")return {key:"PAYIN_PENDING",label:"Pay-in Due Today",tone:"amber" as MoneyStatusTone,dueAt:r.dueAt,kind:"payin" as const};
    return {key:"PAYIN_PENDING",label:"Pay-in Pending",tone:"amber" as MoneyStatusTone,dueAt:r.dueAt,kind:"payin" as const};
  }
  return null;
}

export const moneyStatusOptions=[
  ["PAYOUT_PENDING","Payout Pending"],
  ["PAYOUT_OVERDUE","Payout Overdue"],
  ["PAYOUT_PARTIALLY_PAID","Payout Partially Paid"],
  ["PAYOUT_PAID","Payout Paid"],
  ["PAYIN_PENDING","Pay-in Pending"],
  ["PAYIN_OVERDUE","Pay-in Overdue"],
  ["PAYIN_PARTIALLY_RECEIVED","Pay-in Partially Received"],
  ["PAYIN_RECEIVED","Pay-in Received"],
] as const;
