/** Only navigate to internal Cash Ledger pages after a transaction edit. */
const RETURN_KEY = "cashledger_transaction_return_to";

export function safeReturnTo(candidate: string | null | undefined): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") ||
      candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) return "";
  try {
    const parsed = new URL(candidate, "https://cashledger.invalid");
    if (parsed.origin !== "https://cashledger.invalid" ||
        !/^\/(?:customers(?:\/[^/?#]+)?|accounts(?:\/[^/?#]+)?|expenses|transactions|cash-counter|search|payables|receivables|dues|reports)(?:\/|$)/.test(parsed.pathname)) return "";
    return parsed.pathname + parsed.search + parsed.hash;
  } catch { return ""; }
}

/** Origin pages are ledgers/lists, never transaction detail or edit pages. */
export function canRememberTransactionOrigin(path: string): boolean {
  return path === "/transactions" || path === "/expenses" || path === "/search" ||
    path === "/cash-counter" || path === "/dues" || path === "/payables" ||
    path === "/receivables" || path === "/reports" ||
    /^\/(?:customers|accounts)\/[^/]+$/.test(path);
}

export function rememberTransactionOrigin(candidate: string): void {
  if (typeof window === "undefined") return;
  const value = safeReturnTo(candidate);
  if (value && canRememberTransactionOrigin(value.split(/[?#]/, 1)[0])) {
    try { window.sessionStorage.setItem(RETURN_KEY, value); } catch {}
  }
}

export function transactionReturnPath(): string {
  if (typeof window === "undefined") return "/transactions";
  const explicit = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
  if (explicit) return explicit;
  try { return safeReturnTo(window.sessionStorage.getItem(RETURN_KEY)) || "/transactions"; }
  catch { return "/transactions"; }
}

export function withReturnTo(path: string, origin: string): string {
  const safe = safeReturnTo(origin);
  return safe ? path + (path.includes("?") ? "&" : "?") + "returnTo=" + encodeURIComponent(safe) : path;
}

export function transactionHref(transactionId: string, origin: string): string {
  return withReturnTo("/transactions/" + encodeURIComponent(transactionId), origin);
}

export const transactionDetailHref = transactionHref;
