// The payment orders being read, kept in this browser's own storage (owner, 12 November 2026: «is it safe to reload
// while this is going?»): each PDF and, once read, what was read from it, so a reload or a closed tab picks up where it
// was. Kept per account and only until the orders are saved or removed; signing out clears them.
const DB = 'mawatheeq-orders', STORE = 'orders';

export type StoredOrder = {
  id: string; user: string; at: number; name: string; type: string; lastModified: number; file: Blob;
  status: 'waiting' | 'ready' | 'failed'; data?: unknown; client?: string; skip: boolean; error?: string;
};

let open: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return open ??= new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null); req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
const done = (t: IDBTransaction) => new Promise<void>(resolve => { t.oncomplete = () => resolve(); t.onerror = () => resolve(); t.onabort = () => resolve(); });

/** Keeps (or updates) orders. Never throws: without storage the reading simply is not kept. */
export async function putOrders(list: StoredOrder[]) {
  const d = await db(); if (!d || !list.length) return;
  try { const t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE); for (const o of list) s.put(o); await done(t); } catch { /* Not kept. */ }
}
/** Forgets the given orders, or all of them. */
export async function dropOrders(ids?: string[]) {
  const d = await db(); if (!d) return;
  try { const t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE); if (ids) for (const id of ids) s.delete(id); else s.clear(); await done(t); } catch { /* Nothing kept. */ }
}
/** The orders kept for this account, oldest first; another account's are removed (a shared computer). */
export async function loadOrders(user: string): Promise<StoredOrder[]> {
  const d = await db(); if (!d || !user) return [];
  try {
    const all = await new Promise<StoredOrder[]>(resolve => { const r = d.transaction(STORE).objectStore(STORE).getAll(); r.onsuccess = () => resolve((r.result || []) as StoredOrder[]); r.onerror = () => resolve([]); });
    const others = all.filter(o => o.user !== user).map(o => o.id);
    if (others.length) void dropOrders(others);
    return all.filter(o => o.user === user && o.file instanceof Blob).sort((a, b) => a.at - b.at);
  } catch { return []; }
}
