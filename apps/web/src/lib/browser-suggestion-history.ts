/**
 * Browser-local suggestions for repetitive, non-secret entry fields.
 * This is intentionally distinct from browser password/payment autofill and
 * from the server-backed customer selector.
 */
export const HISTORY_PREFIX = "cashledger_field_suggestions_v1:";
const MAX_FIELDS = 90;
const MAX_PER_FIELD = 18;
const BLOCKED_KEY = /password|secret|token|otp|pin(?:$|_)|aadhaar|aadhar|card(?:_|-)?(?:last|number|digits|four|cvv|cvc)|(?:bank_)?account_(?:number|reference)|accountnumber|accountref|upi_id|utr|rrn|reference|ifsc|eb_number|transaction_id|customer_code|date|amount|balance|commission|charge|price|rate|fee|percentage|quantity|denomination|search|filter/i;

export type Remembered = Record<string, string[]>;

export function currentStaffId(storage: Pick<Storage, "getItem">): string | null {
  try {
    const user = JSON.parse(storage.getItem("cashledger_user") || "{}");
    return typeof user.id === "string" && /^[\w-]{6,80}$/.test(user.id) ? user.id : null;
  } catch { return null; }
}

export function suggestionFieldKey(input: HTMLInputElement | HTMLTextAreaElement): string | null {
  if (input.disabled || input.readOnly || input.closest("[data-no-suggestions]") || input.getAttribute("role") === "combobox") return null;
  if (input instanceof HTMLInputElement) {
    if (!["text", "tel", "email", "url"].includes(input.type)) return null;
    if (["numeric", "decimal"].includes(input.inputMode)) return null;
  }
  if (["off", "one-time-code", "new-password", "current-password"].includes(input.autocomplete)) return null;
  const label = (input.getAttribute("aria-label") || input.getAttribute("placeholder") || "").trim();
  const raw = (input.name.trim() || label).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (raw.length < 3 || raw.length > 95 || BLOCKED_KEY.test(raw) || BLOCKED_KEY.test(label.replace(/\W+/g, "_"))) return null;
  return raw;
}

export function getRemembered(storage: Pick<Storage, "getItem">, staff: string): Remembered {
  try {
    const raw = storage.getItem(HISTORY_PREFIX + staff);
    if (!raw || raw.length > 80_000) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, entries]) =>
      key.length < 96 && !BLOCKED_KEY.test(key) && Array.isArray(entries)).map(([key, entries]) =>
      [key, (entries as unknown[]).filter((v): v is string => typeof v === "string" && v.length <= 100).slice(0, MAX_PER_FIELD)]));
  } catch { return {}; }
}

export function saveRemembered(storage: Pick<Storage, "getItem" | "setItem">, staff: string, field: string, raw: string) {
  const value = raw.trim().replace(/\s+/g, " ");
  if (BLOCKED_KEY.test(field) || value.length < 2 || value.length > 100) return;
  // Do not persist likely card numbers or account identifiers inside generic text fields.
  if (/\d{12,}/.test(value) || (/\d{8,}/.test(value) && !/mobile|phone|tel/.test(field))) return;
  const old = getRemembered(storage, staff);
  const items = [value, ...(old[field] || []).filter(s => s.toLocaleLowerCase() !== value.toLocaleLowerCase())].slice(0, MAX_PER_FIELD);
  delete old[field];
  old[field] = items;
  const trimmed = Object.entries(old).slice(-MAX_FIELDS);
  try { storage.setItem(HISTORY_PREFIX + staff, JSON.stringify(Object.fromEntries(trimmed))); } catch {}
}

export function matchesRemembered(items: string[], search: string): string[] {
  const query = search.trim().toLocaleLowerCase();
  if (query.length === 1) return [];
  const matching = items.filter(s => !query || s.toLocaleLowerCase().includes(query));
  return matching.sort((a, b) => {
    const aStart = a.toLocaleLowerCase().startsWith(query) ? 0 : 1;
    const bStart = b.toLocaleLowerCase().startsWith(query) ? 0 : 1;
    return aStart - bStart;
  }).slice(0, 6);
}

export function clearRememberedField(storage: Pick<Storage, "getItem" | "setItem">, staff: string, field: string) {
  const old = getRemembered(storage, staff);
  delete old[field];
  try { storage.setItem(HISTORY_PREFIX + staff, JSON.stringify(old)); } catch {}
}
