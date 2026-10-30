/**
 * Rank identity matches before broader substring / saved-detail matches.
 * "MU" -> Muthukrishnan (name prefix), Kumar Muthu (word prefix),
 * Amudha (internal substring). Keep combinations and card/mobile lookup.
 */
export type CustomerSearchIdentity={fullName:string;mobile?:string|null};

export function customerMatchRank(customer:CustomerSearchIdentity,raw:string):number{
  const query=raw.trim().toLocaleLowerCase().replace(/\s+/g," ");
  if(!query)return 10;
  const name=customer.fullName.trim().toLocaleLowerCase().replace(/\s+/g," ");
  const words=name.split(/\s+/).filter(Boolean);
  const terms=query.split(/\s+/).filter(Boolean);
  const numeric=/^\+?[\d\s()-]+$/.test(query);
  if(numeric){
    const digits=query.replace(/\D/g,"");
    const mobile=(customer.mobile??"").replace(/\D/g,"");
    if(digits.length>=2&&mobile){
      if(mobile===digits)return 0;
      if(mobile.startsWith(digits))return 1;
      if(mobile.includes(digits))return 5;
    }
    return 9;
  }
  if(name===query)return 0;
  if(name.startsWith(query))return 1;
  if(words.some(word=>word.startsWith(query)))return 2;
  // Words may be entered in combination, for example "muthu kri".
  if(terms.length>1&&terms.every(term=>words.some(word=>word.startsWith(term))))return 3;
  const initials=words.map(word=>word[0]).join("");
  if(query.length>=2&&initials.startsWith(query.replace(/\s/g,"")))return 4;
  if(name.includes(query))return 5;
  if(terms.length>1&&terms.every(term=>words.some(word=>word.includes(term))))return 6;
  return 9; // Matched card, bank, UPI, recipient, or other saved details.
}

export function sortCustomerMatches<T extends CustomerSearchIdentity>(customers:T[],query:string):T[]{
  const ranks=new Map<T,number>();
  customers.forEach(customer=>ranks.set(customer,customerMatchRank(customer,query)));
  return [...customers].sort((a,b)=>(ranks.get(a)??9)-(ranks.get(b)??9)||
    a.fullName.localeCompare(b.fullName,undefined,{sensitivity:"base"})||
    String((a as {id?:string}).id??"").localeCompare(String((b as {id?:string}).id??"")));
}
