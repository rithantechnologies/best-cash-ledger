/** @typedef {{targetId:string,remainingAmount:number}} OutstandingItem */

/** @param {OutstandingItem[]} items @param {string|number} amount
 * @returns {Record<string,string>} */
export function oldestFirstAllocations(items, amount) {
  let left=Math.max(0,Number(amount)||0);
  /** @type {Record<string,string>} */
  const result={};
  for (const item of items) {
    if(left<=0.001) break;
    const applied=Math.round(Math.min(left,Math.max(0,item.remainingAmount))*100)/100;
    if(applied>0) {result[item.targetId]=String(applied);left=Math.round((left-applied)*100)/100;}
  }
  return result;
}

/**
 * A customer Pay Out never silently spills into another payable.
 * Splitting is preserved only when staff choose it explicitly.
 * @param {OutstandingItem[]} items
 * @param {string|number} amount
 * @param {string} choice - payable ID, AUTO, SPLIT, UNALLOCATED or empty
 * @param {Record<string,string>} previous
 * @returns {Record<string,string>}
 */
export function payOutAllocationsForChoice(items, amount, choice, previous={}) {
  if(choice==="AUTO") return oldestFirstAllocations(items,amount);
  if(choice==="SPLIT") return previous;
  if(!choice||choice==="UNALLOCATED") return {};
  const item=items.find(candidate=>candidate.targetId===choice);
  if(!item) return {};
  const applied=Math.round(Math.min(Math.max(0,Number(amount)||0),Math.max(0,item.remainingAmount))*100)/100;
  return applied>0?{[choice]:String(applied)}:{};
}
