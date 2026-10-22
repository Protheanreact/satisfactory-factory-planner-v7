const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SESSION_KEY = "sfp-supabase-session-v1";

export type CloudSession = { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } };
export type PlanPayload = { blocks: unknown[]; links: unknown[]; selectedId: string; target: number; updatedAt: string };
export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

function headers(token?: string) {
  return { "Content-Type": "application/json", apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
function parseError(data: any, fallback: string) {
  return data?.msg || data?.message || data?.error_description || data?.error || fallback;
}
export function getSavedSession(): CloudSession | null {
  try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) as CloudSession : null; } catch { return null; }
}
function storeSession(session: CloudSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY);
}
async function authRequest(path: string, body: unknown): Promise<CloudSession> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parseError(data, "Anmeldung fehlgeschlagen."));
  if (!data.access_token || !data.user) throw new Error("Supabase hat keine Sitzung zurückgegeben. Prüfe die E-Mail-Bestätigung in Supabase Authentication.");
  const session: CloudSession = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, user: data.user };
  storeSession(session); return session;
}
export async function signIn(email: string, password: string) { return authRequest("token?grant_type=password", { email, password }); }
export async function signUp(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, { method: "POST", headers: headers(), body: JSON.stringify({ email, password }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parseError(data, "Registrierung fehlgeschlagen."));
  if (!data.access_token || !data.user) return { needsEmailConfirmation: true as const };
  const session: CloudSession = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, user: data.user };
  storeSession(session); return { needsEmailConfirmation: false as const, session };
}
export function signOut() { storeSession(null); }
async function validSession(): Promise<CloudSession> {
  let session = getSavedSession();
  if (!session) throw new Error("Bitte zuerst anmelden.");
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: headers(), body: JSON.stringify({ refresh_token: session.refresh_token }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) { signOut(); throw new Error("Deine Sitzung ist abgelaufen. Bitte melde dich erneut an."); }
    session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, user: data.user };
    storeSession(session);
  }
  return session;
}
export async function loadCloudPlan(): Promise<PlanPayload | null> {
  const session = await validSession();
  const url = `${SUPABASE_URL}/rest/v1/factory_plans?select=id,title,data,updated_at&user_id=eq.${encodeURIComponent(session.user.id)}&order=updated_at.desc&limit=1`;
  const response = await fetch(url, { headers: headers(session.access_token) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parseError(data, "Cloud-Bauplan konnte nicht geladen werden."));
  if (!Array.isArray(data) || !data[0]?.data) return null;
  return data[0].data as PlanPayload;
}
export async function saveCloudPlan(plan: PlanPayload): Promise<void> {
  const session = await validSession();
  const findUrl = `${SUPABASE_URL}/rest/v1/factory_plans?select=id&user_id=eq.${encodeURIComponent(session.user.id)}&order=updated_at.desc&limit=1`;
  const foundResponse = await fetch(findUrl, { headers: headers(session.access_token) });
  const found = await foundResponse.json().catch(() => ({}));
  if (!foundResponse.ok) throw new Error(parseError(found, "Cloud-Bauplan konnte nicht geprüft werden."));
  const payload = { user_id: session.user.id, title: "Mein Bauplan", data: plan, updated_at: new Date().toISOString() };
  const existingId = Array.isArray(found) ? found[0]?.id : undefined;
  const response = existingId
    ? await fetch(`${SUPABASE_URL}/rest/v1/factory_plans?id=eq.${encodeURIComponent(existingId)}`, { method: "PATCH", headers: { ...headers(session.access_token), Prefer: "return=minimal" }, body: JSON.stringify(payload) })
    : await fetch(`${SUPABASE_URL}/rest/v1/factory_plans`, { method: "POST", headers: { ...headers(session.access_token), Prefer: "return=minimal" }, body: JSON.stringify(payload) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(parseError(data, "Cloud-Speichern fehlgeschlagen.")); }
}
