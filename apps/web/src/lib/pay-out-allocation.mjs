/** @typedef {{targetId:string,remainingAmount:number}} OutstandingItem */

/**
 * A customer Pay Out never silently spills into another payable.
 * Splitting is preserved only when staff choose it explicitly.
 * @param {OutstandingItem[]} items
 * @param {string|number} amount
 * @param {string} choice - payable ID, SPLIT, UNALLOCATED or empty
 * @param {Record<string,string>} previous
 * @returns {Record<string,string>}
 */
export function payOutAllocationsForChoice(items, amount, choice, previous={}) {
  if(choice==="SPLIT") return previous;
  if(!choice||choice==="UNALLOCATED") return {};
  const item=items.find(candidate=>candidate.targetId===choice);
  if(!item) return {};
  const applied=Math.round(Math.min(Math.max(0,Number(amount)||0),Math.max(0,item.remainingAmount))*100)/100;
  return applied>0?{[choice]:String(applied)}:{};
}

/**
 * Prefill only when there is exactly one eligible payable.
 * Multiple swipes always need an explicit staff choice.
 * @param {OutstandingItem[]} items
 * @param {string|number} amount
 * @returns {{choice:string,allocations:Record<string,string>}}
 */
export function defaultPayOutSelection(items, amount) {
  const choice=items.length===1?items[0].targetId:"";
  return {choice,allocations:payOutAllocationsForChoice(items,amount,choice)};
}
