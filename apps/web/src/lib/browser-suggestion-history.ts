/**
 * Browser-local field history. The application uses IndexedDB for persistent
 * entries; the legacy localStorage format is kept only for migration/fallback.
 * Staff history is isolated per login and never sent to Cash Ledger's server.
 */
export const HISTORY_PREFIX = "cashledger_field_suggestions_v1:";

const MONEY_PATTERN = /(?:^|_)(?:amount|balance|outstanding|cash_received|cash_given|cash_paid|cash_collected|customer_gets|payout|payable|receivable|price|cost|charge|fee|commission_amount|opening_balance|closing_balance|payment_amount|credit_limit|profit|earning|income|revenue|subtotal|denomination)(?:_|$)/;
const SECRET_PATTERN = /password|passwd|secret|token|otp|one_time_code|(?:^|_)pin(?:_|$)|cvv|cvc|security_code|(?:^|_)card_number(?:_|$)|demo_card_number|(?:^|_)aadhaar_number(?:_|$)|(?:^|_)aadhar_number(?:_|$)/;
const EXISTING_SEARCH = /(?:^|_)(search|filter|query)(?:_|$)/;
const GENERIC_LABEL = /^(optional|enter|type|name|value|details|reference|number|other|description|select|search|your_details)$/;

export type Remembered = Record<string, string[]>;
export const LEGACY_ALIASES: Record<string, string[]> = {
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
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Never record full card/Aadhaar numbers or accidentally pasted secrets. */
export function privateValue(value: string, key: string): boolean {
  const digits = value.replace(/[ -]/g, "");
  if (/^\d{16}$/.test(digits) || /^\d{12}$/.test(digits) || /\d{12,}/.test(value)) return true;
  if (/\d{8,}/.test(value) && !/(mobile|phone|tel|eb_number|account_number|upi|consumer_number|reference|utr|rrn)/.test(key)) return true;
  return false;
}

export function safeRememberedValue(key: string, raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, " ");
  if (MONEY_PATTERN.test(key) || SECRET_PATTERN.test(key) || value.length < 2 || value.length > 250) return null;
  if (key === "customer_mobile" || /(?:^|_)(?:mobile|phone|tel)(?:_|$)/.test(key)) {
    // Don't pollute the history with half-typed mobile numbers. Explicit +91
    // phone numbers are distinct from bare 12-digit Aadhaar numbers.
    if (!/^(?:\+91[\s-]?)?[6-9]\d{9}$/.test(value) && !/^(?:0)?[6-9]\d{9}$/.test(value)) return null;
    return value;
  }
  if (privateValue(value, key)) return null;
  return value;
}

export function normalizeFieldKey(raw: string): string {
  const key = normalize(raw);
  if (/^(?:cashledger_)?(?:new_|quick_)?customer_(?:full_)?name$/.test(key) || /^cashledger_name$/.test(key) || /^customer_full_name$/.test(key)) return "customer_name";
  if (/^(?:cashledger_)?(?:new_|quick_)?customer_(?:mobile|phone|phone_number|mobile_number)$/.test(key) || /^(?:cashledger_)?(?:mobile|phone|phone_number)$/.test(key)) return "customer_mobile";
  if (/^(?:cashledger_)?(?:bank|bank_name|card_bank_name)$/.test(key)) return "bank_name";
  if (/^(?:cashledger_)?(?:beneficiary|recipient)_(?:name|full_name)$/.test(key)) return "beneficiary_name";
  return key;
}

function labelFor(input: HTMLInputElement | HTMLTextAreaElement): string {
  const closest = input.closest("label");
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
    if (!["text", "tel", "email", "url", "number"].includes(input.type) || input.inputMode === "search") return null;
    if (input.type === "number" && ["0.01", "0.001"].includes(input.step) && !input.name && MONEY_PATTERN.test(normalize(labelFor(input)))) return null;
  }
  if (["one-time-code", "new-password", "current-password"].includes(input.autocomplete)) return null;
  const label = normalize(labelFor(input));
  const name = normalize(input.name.trim());
  const id = normalize(input.id.trim());
  let raw = name || (id && !/^react_/.test(id) ? id : label);
  if (GENERIC_LABEL.test(raw) || (!name && !id && GENERIC_LABEL.test(label))) {
    const page = normalize(input.ownerDocument?.location?.pathname || "entry").slice(-55);
    const form = normalize(input.closest("form")?.id || "form").slice(0, 28);
    raw = [page, form, raw].filter(Boolean).join("_");
  }
  if (raw.length < 3 || raw.length > 95 || SECRET_PATTERN.test(raw) || SECRET_PATTERN.test(label) ||
      MONEY_PATTERN.test(raw) || MONEY_PATTERN.test(label) ||
      (/(?:^|_)total(?:_|$)/.test(raw) && !/(copies|count|quantity|items)/.test(raw)) ||
      EXISTING_SEARCH.test(raw) || EXISTING_SEARCH.test(label)) return null;
  return normalizeFieldKey(raw);
}

/** Read old per-staff history for one-time migration to IndexedDB. */
export function getRemembered(storage: Pick<Storage, "getItem">, staff: string): Remembered {
  try {
    const raw = storage.getItem(HISTORY_PREFIX + staff);
    if (!raw) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries: Remembered = {};
    for (const [key, values] of Object.entries(value)) {
      if (key.length > 95 || MONEY_PATTERN.test(key) || SECRET_PATTERN.test(key) || !Array.isArray(values)) continue;
      const field = normalizeFieldKey(key);
      for (const item of values) {
        if (typeof item !== "string") continue;
        const safe = safeRememberedValue(field, item);
        if (!safe) continue;
        const list = entries[field] || (entries[field] = []);
        if (!list.some(v => v.toLocaleLowerCase() === safe.toLocaleLowerCase())) list.push(safe);
      }
    }
    return entries;
  } catch { return {}; }
}

/** Fallback when IndexedDB is unavailable; browser storage quota still applies. */
export function saveRemembered(storage: Pick<Storage, "getItem" | "setItem">, staff: string, field: string, raw: string) {
  const value = safeRememberedValue(field, raw);
  if (!value) return;
  const old = getRemembered(storage, staff);
  old[field] = [value, ...(old[field] || []).filter(s => s.toLocaleLowerCase() !== value.toLocaleLowerCase())];
  try { storage.setItem(HISTORY_PREFIX + staff, JSON.stringify(old)); } catch { /* full or disabled */ }
}

export function matchesRemembered(items: string[], search: string): string[] {
  const query = search.trim().toLocaleLowerCase();
  return items.filter(s => s.toLocaleLowerCase().includes(query)).sort((a, b) => {
    const aStart = a.toLocaleLowerCase().startsWith(query) ? 0 : 1;
    const bStart = b.toLocaleLowerCase().startsWith(query) ? 0 : 1;
    return aStart - bStart;
  }); // Show all matches. The dropdown itself scrolls.
}

export function clearRememberedField(storage: Pick<Storage, "getItem" | "setItem">, staff: string, field: string) {
  const old = getRemembered(storage, staff);
  delete old[field];
  for (const alias of LEGACY_ALIASES[field] || []) delete old[alias];
  try { storage.setItem(HISTORY_PREFIX + staff, JSON.stringify(old)); } catch {}
}
