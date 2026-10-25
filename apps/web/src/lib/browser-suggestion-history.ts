/**
 * Browser-local suggestions for previously entered values.
 * Values are per staff + per browser profile, not shared across devices.
 * Passwords, security codes and full card/Aadhaar numbers deliberately rely
 * on secure/native input mechanisms and are never stored in this local history.
 */
export const HISTORY_PREFIX = "cashledger_field_suggestions_v1:";
const MAX_FIELDS = 180;
const MAX_PER_FIELD = 24;

// Amounts and monetary amounts must never enter autocomplete history.
// "Rate" and percentages aren't principal amounts and can be remembered.
const MONEY_PATTERN = /(?:^|_)(?:amount|balance|outstanding|cash_received|cash_given|cash_paid|cash_collected|customer_gets|payout|payable|receivable|price|cost|charge|fee|commission_amount|opening_balance|closing_balance|payment_amount|credit_limit|profit|earning|income|revenue|subtotal|denomination)(?:_|$)/;
const SECRET_PATTERN = /password|passwd|secret|token|otp|one_time_code|(?:^|_)pin(?:_|$)|cvv|cvc|security_code|(?:^|_)card_number(?:_|$)|demo_card_number|(?:^|_)aadhaar_number(?:_|$)|(?:^|_)aadhar_number(?:_|$)/;
const EXISTING_SEARCH = /(?:^|_)(search|filter|query)(?:_|$)/;
const GENERIC_LABEL = /^(optional|enter|type|name|value|details|reference|number|other|description|select|search|your details)$/;

export type Remembered = Record<string, string[]>;
const LEGACY_ALIASES: Record<string,string[]> = {
  bank_name: ["cashledger_bank", "cashledger_bank_name"],
  customer_name: ["cashledger_name", "cashledger_customer_name"],
  customer_mobile: ["cashledger_mobile", "cashledger_customer_mobile"],
};

export function currentStaffId(storage: Pick<Storage, "getItem">): string | null {
  try {
    const user = JSON.parse(storage.getItem("cashledger_user") || "{}");
    return typeof user.id === "string" && /^[\w-]{6,80}$/.test(user.id) ? user.id : null;
  } catch { return null; }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function privateValue(value: string, key: string): boolean {
  // Never remember complete payment-card / Aadhaar numbers, even if entered
  // accidentally into a description or other general field.
  const digits = value.replace(/[ -]/g, "");
  if (/^\d{16}$/.test(digits) || /^\d{12}$/.test(digits)) return true;
  if (/\d{12,}/.test(value)) return true;
  // Numeric identifiers and last-four fields are allowed, but reject mixed
  // long account numbers in generic unrelated fields.
  if (/\d{8,}/.test(value) && !/(mobile|phone|tel|eb_number|account_number|upi|consumer_number|reference|utr|rrn)/.test(key)) return true;
  return false;
}

function normalizeFieldKey(raw: string): string {
  const key = normalize(raw);
  // A few common concepts should reuse suggestions across separate forms.
  if (/^(?:cashledger_)?(?:new_|quick_)?customer_(?:full_)?name$/.test(key) || /^cashledger_name$/.test(key)) return "customer_name";
  if (/^(?:cashledger_)?(?:new_|quick_)?customer_(?:mobile|phone)$/.test(key) || /^(?:cashledger_)?mobile$/.test(key)) return "customer_mobile";
  if (/^(?:cashledger_)?(?:bank|bank_name)$/.test(key) || /^(?:cashledger_)?(?:card_)?bank_name$/.test(key)) return "bank_name";
  return key;
}

function labelFor(input: HTMLInputElement | HTMLTextAreaElement): string {
  const closest = input.closest("label");
  // Field components render a label containing a span and the input itself.
  const span = closest?.querySelector("span");
  const text = (span?.textContent || "").trim();
  const explicit = input.getAttribute("aria-label")?.trim() || "";
  const placeholder = input.getAttribute("placeholder")?.trim() || "";
  if (explicit) return explicit;
  if (text && text.length < 90) return text;
  return placeholder;
}

export function suggestionFieldKey(input: HTMLInputElement | HTMLTextAreaElement): string | null {
  if (input.disabled || input.readOnly || input.closest("[data-no-suggestions]") || input.getAttribute("role") === "combobox") return null;
  if (input instanceof HTMLInputElement) {
    // Existing customer searches, native date pickers and selection controls
    // already have dedicated matching UI. Do not display duplicate menus.
    if (!["text", "tel", "email", "url", "number"].includes(input.type) || input.inputMode === "search") return null;
    if (input.type === "number" && (input.step === "0.01" || input.step === "0.001") && !input.name) {
      const label = normalize(labelFor(input));
      if (MONEY_PATTERN.test(label)) return null;
    }
  }
  if (["one-time-code", "new-password", "current-password"].includes(input.autocomplete)) return null;
  const label = normalize(labelFor(input));
  const name = normalize(input.name.trim());
  let raw = name || label;
  if (GENERIC_LABEL.test(raw) && label) {
    const page = normalize(input.ownerDocument?.location?.pathname || "entry").slice(-55);
    const form = normalize(input.closest("form")?.id || "form").slice(0, 28);
    raw = [page, form, raw].filter(Boolean).join("_");
  }
  if (raw.length < 3 || raw.length > 95) return null;
  if (SECRET_PATTERN.test(raw) || SECRET_PATTERN.test(label) || MONEY_PATTERN.test(raw) || MONEY_PATTERN.test(label) || /(?:^|_)total(?:_|$)/.test(raw) && !/(copies|count|quantity|items)/.test(raw)) return null;
  if (EXISTING_SEARCH.test(raw) || EXISTING_SEARCH.test(label)) return null;
  // autocomplete="off" is used by existing bank/customer search comboboxes
  // and security fields, but regular reference / EB text entries are eligible.
  return normalizeFieldKey(raw);
}

export function getRemembered(storage: Pick<Storage, "getItem">, staff: string): Remembered {
  try {
    const raw = storage.getItem(HISTORY_PREFIX + staff);
    if (!raw || raw.length > 150_000) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries: Remembered = Object.fromEntries(Object.entries(value).filter(([key, entries]) =>
      key.length < 96 && !SECRET_PATTERN.test(key) && !MONEY_PATTERN.test(key) && Array.isArray(entries)).map(([key, entries]) =>
      [key, (entries as unknown[]).filter((v): v is string => typeof v === "string" && v.length <= 100 && !privateValue(v, key)).slice(0, MAX_PER_FIELD)]));
    for(const [canonical, aliases] of Object.entries(LEGACY_ALIASES)) {
      const values = [ ...(entries[canonical] || []), ...aliases.flatMap(alias => entries[alias] || []) ];
      if(values.length) entries[canonical] = [...new Map(values.map(v=>[v.toLocaleLowerCase(),v])).values()].slice(0,MAX_PER_FIELD);
    }
    return entries;
  } catch { return {}; }
}

export function saveRemembered(storage: Pick<Storage, "getItem" | "setItem">, staff: string, field: string, raw: string) {
  const value = raw.trim().replace(/\s+/g, " ");
  if (MONEY_PATTERN.test(field) || SECRET_PATTERN.test(field) || value.length < 2 || value.length > 100 || privateValue(value, field)) return;
  const old = getRemembered(storage, staff);
  const items = [value, ...(old[field] || []).filter(s => s.toLocaleLowerCase() !== value.toLocaleLowerCase())].slice(0, MAX_PER_FIELD);
  delete old[field];
  old[field] = items;
  try { storage.setItem(HISTORY_PREFIX + staff, JSON.stringify(Object.fromEntries(Object.entries(old).slice(-MAX_FIELDS)))); } catch {}
}

export function matchesRemembered(items: string[], search: string): string[] {
  const query = search.trim().toLocaleLowerCase();
  // A blank field shows the three most recently saved entries. As soon as
  // staff types, filter immediately, including single-character searches.
  const matching = query ? items.filter(s => s.toLocaleLowerCase().includes(query)) : items;
  return matching.sort((a, b) => {
    const aStart = a.toLocaleLowerCase().startsWith(query) ? 0 : 1;
    const bStart = b.toLocaleLowerCase().startsWith(query) ? 0 : 1;
    return aStart - bStart;
  }).slice(0, 3);
}

export function clearRememberedField(storage: Pick<Storage, "getItem" | "setItem">, staff: string, field: string) {
  const old = getRemembered(storage, staff);
  delete old[field];
  for(const alias of LEGACY_ALIASES[field] || []) delete old[alias];
  try { storage.setItem(HISTORY_PREFIX + staff, JSON.stringify(old)); } catch {}
}
