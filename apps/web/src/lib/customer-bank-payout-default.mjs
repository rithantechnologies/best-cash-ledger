// A recipient default is safe only when it identifies one specific active bank.
// A future customer 'default bank' designation can resolve multiple accounts.
/** @typedef {{id: string, isActive: boolean, isDefault?: boolean}} CustomerBank */
/** @param {readonly CustomerBank[] | null | undefined} banks @returns {string} */
export function defaultPaidToCustomerBank(banks) {
 const active = (banks ?? []).filter(bank => bank.isActive);
 const preferred = active.filter(bank => bank.isDefault === true);
 if (preferred.length === 1) return 'BANK:' + preferred[0].id;
 return active.length === 1 ? 'BANK:' + active[0].id : '';
}
