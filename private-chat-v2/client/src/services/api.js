export const API = import.meta.env.VITE_API_URL || "http://localhost:8080";
export function token() {
  return localStorage.getItem("token") || "";
}
export async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const r = await fetch(API + path, { ...options, headers });
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await r.json()
    : await r.text();
  if (!r.ok) throw new Error(data?.error || data || `HTTP ${r.status}`);
  return data;
}
