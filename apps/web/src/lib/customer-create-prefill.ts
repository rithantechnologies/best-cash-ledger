/** Numeric customer lookups are mobile searches, never EB consumer numbers. */
export function customerCreatePrefill(search: string) {
  const query = search.trim();
  const numericOnly = /^[+\d\s().-]+$/.test(query);
  const digits = query.replace(/\D/g, "");
  const phoneMatch = !numericOnly ? query.match(/(?:\+?91[\s().-]*)?[6-9]\d{9}$/) : null;
  const mobileDigits = numericOnly ? digits : phoneMatch?.[0].replace(/\D/g, "") ?? "";
  return {
    fullName: numericOnly ? "" : phoneMatch ? query.slice(0, phoneMatch.index).trim().toUpperCase() : query.toUpperCase(),
    mobile: mobileDigits.length === 12 && mobileDigits.startsWith("91") ? mobileDigits.slice(2) : mobileDigits,
    ebNumber: "",
  };
}
