// Opens the app instantly with what this signed-in account loaded last time, then refreshes from the server.
// The server stays the source of truth: every snapshot is replaced by fresh data within moments, saving still
// goes through the server's revision checks, and everything here is deleted when the session ends (sign-out,
// expiry, revocation or a permissions change), so nothing outlives the account's own sign-in on this browser.
import type { LocalUser } from './local-auth';
import type { Permissions } from './permissions';

const BOOT = 'mawatheeq.boot.v1', DB = 'mawatheeq-cache', STORE = 'snapshots', SESSION = 'mawatheeq.local-session.v1';
type Boot = { user: LocalUser; access?: Permissions; tag: string };
// A short fingerprint of the session token, so a cached account is only used with the session it came from.
const tagOf = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const currentTag = () => { const t = localStorage.getItem(SESSION); return t ? tagOf(t) : ''; };

const read = (): Boot | null => {
  try { const tag = currentTag(); if (!tag) return null; const b = JSON.parse(localStorage.getItem(BOOT) || 'null') as Boot | null; return b?.user?.id && b.tag === tag ? b : null; } catch { return null; }
};
/** The account and permissions from the last visit, only while a session token is still stored. */
export const cachedUser = () => read()?.user ?? null;
export const cachedAccess = () => read()?.access ?? null;
export function rememberUser(user: LocalUser | null) {
  try {
    if (!user) return clearBoot();
    const tag = currentTag(); if (!tag) return;
    const old = JSON.parse(localStorage.getItem(BOOT) || 'null') as Boot | null;
    if (old?.user?.id && old.user.id !== user.id) void dropSnapshots();
    localStorage.setItem(BOOT, JSON.stringify({ user, tag, access: old?.user?.id === user.id && old.tag === tag ? old.access : undefined }));
  } catch { /* The app still works without the shortcut. */ }
}
export function rememberAccess(access: Permissions) {
  try { const b = read(); if (b) localStorage.setItem(BOOT, JSON.stringify({ ...b, access })); } catch { /* Optional. */ }
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db() {
  return dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}
const key = (name: string) => { const u = read()?.user.id; return u ? u + ':' + name : ''; };
/** The last copy of a dataset for the signed-in account, or null. Never throws. */
export async function readSnapshot<T>(name: string): Promise<T | null> {
  const k = key(name); if (!k || typeof indexedDB === 'undefined') return null;
  try { const d = await db(); return await new Promise(resolve => { const r = d.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => resolve((r.result as T) ?? null); r.onerror = () => resolve(null); }); }
  catch { return null; }
}
export async function writeSnapshot(name: string, value: unknown) {
  const k = key(name); if (!k || typeof indexedDB === 'undefined') return;
  try { const d = await db(); d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, k); } catch { /* Next visit loads from the server. */ }
}
async function dropSnapshots() {
  if (typeof indexedDB === 'undefined') return;
  try { const d = await db(); d.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch { /* Nothing stored. */ }
}
/** Forget the account, its permissions and every stored dataset. */
export function clearBoot() {
  try { localStorage.removeItem(BOOT); } catch { /* Ignore. */ }
  void dropSnapshots();
}
