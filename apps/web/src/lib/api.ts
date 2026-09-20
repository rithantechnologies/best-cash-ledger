const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");

  // Bearer-token fallback remains for older sessions/API clients during the
  // transition, while the browser now primarily uses the HttpOnly session cookie.
  const legacyToken =
    typeof window !== "undefined"
      ? localStorage.getItem("cashledger_token")
      : null;
  if (legacyToken) {
    headers.set("authorization", "Bearer " + legacyToken);
  }

  if (
    options.method &&
    options.method.toUpperCase() === "POST" &&
    !headers.has("idempotency-key") &&
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    headers.set("idempotency-key", crypto.randomUUID());
  }

  const response = await fetch(BASE_PATH + "/api" + path, {
    ...options,
    headers,
    credentials: "include",
  });

  if (
    response.status === 401 &&
    path !== "/auth/login" &&
    typeof window !== "undefined"
  ) {
    localStorage.removeItem("cashledger_token");
    localStorage.removeItem("cashledger_user");
    window.location.href = BASE_PATH + "/login";
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : body.message;
    throw new Error(message ?? "Request failed");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text.trim()) return null as T;
  return JSON.parse(text) as T;
}
