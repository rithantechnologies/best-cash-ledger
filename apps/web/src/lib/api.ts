const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("cashledger_token") : null;

  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", "Bearer " + token);

  const response = await fetch(BASE_PATH + "/api" + path, {
    ...options,
    headers,
  });

  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("cashledger_token");
    localStorage.removeItem("cashledger_user");
    window.location.href = BASE_PATH + "/login";
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? "Request failed");
  }

  return response.json() as Promise<T>;
}
