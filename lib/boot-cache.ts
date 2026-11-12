// Opens the app instantly with what this signed-in account loaded last time, then refreshes from the server.
// The server stays the source of truth: every snapshot is replaced by fresh data within moments, saving still
// goes through the server's revision checks, and everything here is deleted when the session ends (sign-out,
// expiry, revocation or a permissions change), so nothing outlives the account's own sign-in on this browser.
import type { LocalUser } from './local-auth';
import type { Permissions } from './permissions';
import { forgetInstant } from './instant';

const BOOT = 'mawatheeq.boot.v1', OWNER_BOOT = 'mawatheeq.boot.owner.v1', OWNER_SESSION = 'mawatheeq.owner-session.v1', DB = 'mawatheeq-cache', STORE = 'snapshots', SESSION = 'mawatheeq.local-session.v1';
type Boot = { user: LocalUser; access?: Permissions; tag: string };
// A short fingerprint of the session token, so a cached account is only used with the session it came from.
const tagOf = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
const currentTag = () => { const t = localStorage.getItem(SESSION); return t ? tagOf(t) : ''; };

const parse = (k: string) => JSON.parse(localStorage.getItem(k) || 'null') as Boot | null;
// The owner's own copy is kept aside while they look through a staff account, so coming back is instant.
const read = (): Boot | null => {
  try { const tag = currentTag(); if (!tag) return null; for (const k of [BOOT, OWNER_BOOT]) { const b = parse(k); if (b?.user?.id && b.tag === tag) return b; } return null; } catch { return null; }
};
/** The account and permissions from the last visit, only while a session token is still stored. */
export const cachedUser = () => read()?.user ?? null;
export const cachedAccess = () => read()?.access ?? null;
export function rememberUser(user: LocalUser | null) {
  try {
    if (!user) return clearBoot();
    const tag = currentTag(); if (!tag) return;
    const old = parse(BOOT), kept = parse(OWNER_BOOT);
    if (old?.user?.id && old.user.id !== user.id) {
      // The owner opening a staff account keeps their own copy for the way back; anyone else signing in on this
      // browser starts clean, with only their own earlier copy (if any) left.
      if (localStorage.getItem(OWNER_SESSION)) localStorage.setItem(OWNER_BOOT, JSON.stringify(old));
      else { localStorage.removeItem(OWNER_BOOT); void dropSnapshots(user.id); }
    }
    const prev = old?.user?.id === user.id && old.tag === tag ? old : kept?.user?.id === user.id && kept.tag === tag ? kept : null;
    localStorage.setItem(BOOT, JSON.stringify({ user, tag, access: prev?.access }));
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
// The copies already read or saved in this visit, kept in memory: a workspace opened again (switching between
// workspaces, or back from another account) draws at once from here instead of waiting on the browser's storage.
const memory = new Map<string, unknown>();
/** The copy of a dataset already in memory for the signed-in account, or undefined; never waits. */
export function peekSnapshot<T>(name: string): T | undefined { const k = key(name); return k ? memory.get(k) as T | undefined : undefined; }
/** The last copy of a dataset for the signed-in account, or null. Never throws. */
export async function readSnapshot<T>(name: string): Promise<T | null> {
  const k = key(name); if (!k || typeof indexedDB === 'undefined') return null;
  if (memory.has(k)) return memory.get(k) as T;
  try { const d = await db(); return await new Promise(resolve => { const r = d.transaction(STORE).objectStore(STORE).get(k); r.onsuccess = () => { const v = r.result as unknown; try { const value = v && typeof v === 'object' && typeof (v as { json?: unknown }).json === 'string' ? JSON.parse((v as { json: string }).json) as T : (v as T) ?? null; if (value != null) memory.set(k, value); resolve(value); } catch { resolve(null); } }; r.onerror = () => resolve(null); }); }
  catch { return null; }
}
export async function writeSnapshot(name: string, value: unknown) {
  const k = key(name); if (!k) return;
  memory.set(k, value);
  if (typeof indexedDB === 'undefined') return;
  // Kept as one piece of text: the browser reads a single string back far faster than thousands of separate records.
  try { const d = await db(); d.transaction(STORE, 'readwrite').objectStore(STORE).put({ json: JSON.stringify(value) }, k); } catch { /* Next visit loads from the server. */ }
}
/** Deletes every stored dataset, or every one but `keep`'s (keys are «user id:name»). */
async function dropSnapshots(keep = '') {
  for (const k of [...memory.keys()]) if (!keep || !k.startsWith(keep + ':')) memory.delete(k);
  if (typeof indexedDB === 'undefined') return;
  try {
    const store = (await db()).transaction(STORE, 'readwrite').objectStore(STORE);
    if (!keep) { store.clear(); return; }
    const req = store.openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) return; if (!String(c.key).startsWith(keep + ':')) c.delete(); c.continue(); };
  } catch { /* Nothing stored. */ }
}
/** Forget the account, its permissions and every stored dataset. */
export function clearBoot() {
  try { localStorage.removeItem(BOOT); localStorage.removeItem(OWNER_BOOT); } catch { /* Ignore. */ }
  forgetInstant();
  void dropSnapshots();
  // The payment orders kept while being read (lib/order-store.ts) go with the account.
  void import('./order-store').then(m => m.dropOrders()).catch(() => {});
}
