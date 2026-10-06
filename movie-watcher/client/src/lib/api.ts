export type ApiOptions = RequestInit & { token?: string };

export async function api<T>(url: string, options: ApiOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (options.token) headers.set("x-member-token", options.token);
  const response = await fetch(url, { ...options, headers, credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? "The request could not be completed.");
  return payload as T;
}

export function tokenKey(code: string) { return `movie-watcher:member:${code.toUpperCase()}`; }
export function getStoredToken(code: string) { return window.localStorage.getItem(tokenKey(code)); }
export function storeToken(code: string, token: string) { window.localStorage.setItem(tokenKey(code), token); }
