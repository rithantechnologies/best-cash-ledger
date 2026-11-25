// A completed-task report is operational only; no bank or ledger values are posted.
const ist = value => value ? new Date(value).toLocaleString('en-IN', {
  timeZone:'Asia/Kolkata', year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hour12:false,
}) : '';
const safeCell = value => {
  const raw = value === null || value === undefined ? '' : String(value);
  // Protect spreadsheets against formulas in staff/customer free-text fields.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? "'"+raw : raw;
  return '"'+safe.replaceAll('"','""')+'"';
};
export function completedTasksCsv(rows) {
  const columns = [
    ['Completed at IST',row=>ist(row.completedAt)],
    ['Completed by',row=>row.completedBy],['Type',row=>row.kind],
    ['Customer',row=>row.customer],['Mobile',row=>row.mobile],
    ['Card',row=>row.card],['Provider',row=>row.provider],['Gateway',row=>row.gateway],
    ['Account',row=>row.account],
    ['Confirmed planned amount',row=>row.plannedAmount],
    ['Linked swipe amount',row=>row.swipedAmount],
    ['Expected refund',row=>row.expectedRefund],
    ['Refund credit verified',row=>row.kind==='BANK_REFUND'?(row.refundCreditVerified?'Yes':'No'):''],
    ['Task reason',row=>row.reason],['Reference',row=>row.reference],
    ['Completion note',row=>row.completionNote],['Created at IST',row=>ist(row.createdAt)],
    ['Task ID',row=>row.id],
  ];
  return '\uFEFF'+[columns.map(c=>safeCell(c[0])).join(','),
    ...rows.map(row=>columns.map(col=>safeCell(col[1](row))).join(','))].join('\r\n');
}
