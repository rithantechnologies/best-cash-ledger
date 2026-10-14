/** Match all search terms against any of the saved fields, regardless of order.
 * A digit-only term also matches across formatting separators in account numbers.
 */
export function matchesSavedDetailSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const terms = query.trim().toLocaleLowerCase('en-IN').split(/\s+/).filter(Boolean);
  const compactQuery = query.trim().replace(/\D/g, '');
  if (compactQuery.length >= 3 && /^[\d-]+$/.test(query.trim())) {
    return fields.some((field) => (field ?? '').replace(/\D/g, '').includes(compactQuery));
  }
  if (!terms.length) return true;
  const values = fields.filter((field): field is string => typeof field === 'string' && !!field.trim());
  return terms.every((term) => values.some((value) => {
    const normalized = value.toLocaleLowerCase('en-IN');
    return normalized.includes(term) || ((/^[\d -]+$/.test(term) && value.replace(/\D/g, '').includes(term.replace(/\D/g, ''))));
  }));
}
