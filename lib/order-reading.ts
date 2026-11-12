// Reading payment-order PDFs in the background (owner, 11 November 2026: «what if I have something to do?»): the
// orders are read one after another on this computer while the person keeps working; a small bar on the page shows how
// far it has got, and the orders read are checked and saved when the person chooses. The reading lives here, outside
// any one page, so moving between the collections pages does not stop it; and the queue is kept in this browser's own
// storage (lib/order-store.ts), so a reload or a closed tab picks up where it was (owner, 12 November 2026).
import { useSyncExternalStore } from 'react';
import type { DocumentData } from './document-fields';
import { pagesText } from './order-import';
import { cachedUser } from './boot-cache';
import { dropOrders, loadOrders, putOrders, type StoredOrder } from './order-store';

export type OrderItem = {
  id: string; file: File; status: 'waiting' | 'reading' | 'ready' | 'failed'; progress: number; message: string;
  data?: DocumentData; client?: string; skip: boolean; error?: string;
};
type State = { items: OrderItem[]; running: boolean; open: boolean };

// The order, the court receipt, the office's bundle list and the account statement are the first four pages. Nothing is
// read from the bundle list (checked on real orders, 12 November 2026), so it is read only when the other three leave a
// field missing (an order whose pages come in another order). Each page's numbers pass (an extra reading of dates and
// codes, a third of the time) runs only when the page's own numbers are still missing after the main reading.
const PAGES = 4, FIRST = [1, 2, 4], SPARE = [3];
const NUMBERS: Record<number, (keyof DocumentData)[]> = { 1: ['civilId', 'orderNumber', 'amount'], 2: ['receiptDate', 'receiptNumber', 'receiptFee'], 4: ['statementDate'] };
const EXPECTED: (keyof DocumentData)[] = ['company', 'defendant', 'civilId', 'amount', 'orderNumber', 'receiptDate', 'receiptNumber', 'receiptFee', 'statementDate'];
const empty = (d: DocumentData, k: keyof DocumentData) => !String(d[k] ?? '').trim();
let state: State = { items: [], running: false, open: false };
let stopper: AbortController | null = null;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach(l => l()); };

// What is kept of each order: its file always, what was read once it was read, and the person's choices on it.
const added = new Map<string, number>();
const stored = (i: OrderItem): StoredOrder => ({
  id: i.id, user: cachedUser()?.id || '', at: added.get(i.id) ?? Date.now(), name: i.file.name, type: i.file.type, lastModified: i.file.lastModified, file: i.file,
  status: i.status === 'reading' ? 'waiting' : i.status, data: i.data, client: i.client, skip: i.skip, error: i.error,
});
const keep = (ids: string[]) => { const list = state.items.filter(i => ids.includes(i.id)).map(stored); if (list[0]?.user) void putOrders(list); };

export function patchOrder(id: string, v: Partial<OrderItem>) {
  set({ items: state.items.map(i => i.id === id ? { ...i, ...v } : i) });
  // Progress is not worth a write; a finished reading, a failure or the person's choices are.
  if (v.status === 'ready' || v.status === 'failed' || 'client' in v || 'skip' in v || 'data' in v) keep([id]);
}

// How many orders are read at once, each with its own engines (about 300 MB each): three or four on a strong computer
// (8 or 12 cores and 8 GB), two on an ordinary one (4 cores, 4 GB), one on a weaker one so the page stays smooth.
// The resolution stays the same everywhere: a lower one misread digits in the tests.
function capacity() {
  const cores = navigator.hardwareConcurrency || 2, memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return { lanes: memory >= 8 && cores >= 12 ? 4 : memory >= 8 && cores >= 8 ? 3 : cores >= 4 && memory >= 4 ? 2 : 1 };
}

async function run() {
  if (state.running) return;
  const { extractPDF, createOcrEngine } = await import('./pdf-reader'); const { extractFields } = await import('./document-fields');
  const ctrl = new AbortController(); stopper = ctrl; set({ running: true });
  const { lanes } = capacity();
  // Each lane keeps its own two engines for all the orders it reads, and takes the next order still waiting
  // (marked as being read at once, so no two lanes take the same one).
  const lane = async () => {
    const engine = createOcrEngine();
    try {
      for (let item = state.items.find(i => i.status === 'waiting'); item && !ctrl.signal.aborted; item = state.items.find(i => i.status === 'waiting')) {
        const it = item;
        patchOrder(it.id, { status: 'reading', progress: 0, message: 'تجهيز القراءة…' });
        try {
          const name = it.file.name, wantNumbers = (page: number, text: string) => { const f = extractFields(text, name); return (NUMBERS[page] || []).some(k => empty(f, k)); };
          let pages = await extractPDF(it.file, (p, message) => patchOrder(it.id, { progress: p * .9, message }), ctrl.signal, PAGES, engine, { pages: FIRST, wantNumbers });
          let data = extractFields(pagesText(pages), name);
          if (EXPECTED.some(k => empty(data, k))) {
            const more = await extractPDF(it.file, (p, message) => patchOrder(it.id, { progress: 90 + p * .1, message }), ctrl.signal, PAGES, engine, { pages: SPARE });
            pages = [...pages, ...more].sort((a, b) => a.page - b.page); data = extractFields(pagesText(pages), name);
          }
          patchOrder(it.id, { status: 'ready', progress: 100, data });
        } catch (e) {
          if (ctrl.signal.aborted) { patchOrder(it.id, { status: 'waiting', progress: 0, message: 'أُوقفت القراءة' }); break; }
          patchOrder(it.id, { status: 'failed', error: (e as Error).message });
        }
      }
    } finally { await engine.close(); }
  };
  try { await Promise.all(Array.from({ length: lanes }, lane)); }
  finally { stopper = null; set({ running: false }); }
}

// After a reload: the orders kept for this account come back as they were, and reading goes on from the next one.
let restored = false;
async function restore() {
  if (restored || typeof window === 'undefined') return; restored = true;
  const user = cachedUser()?.id; if (!user) return;
  const kept = await loadOrders(user); if (!kept.length) return;
  const known = new Set(state.items.map(i => i.id));
  const back: OrderItem[] = kept.filter(o => !known.has(o.id)).map(o => {
    added.set(o.id, o.at);
    return { id: o.id, file: new File([o.file], o.name, { type: o.type, lastModified: o.lastModified }), status: o.status, progress: o.status === 'waiting' ? 0 : 100,
      message: o.status === 'waiting' ? 'بانتظار القراءة' : '', data: o.data as DocumentData | undefined, client: o.client, skip: o.skip, error: o.error };
  });
  if (!back.length) return;
  set({ items: [...back, ...state.items] });
  if (back.some(i => i.status === 'waiting')) void run();
}

export const orderReading = {
  /** Adds PDFs to the queue (and keeps them) and starts reading if it is not already. */
  start(files: File[]) {
    const now = Date.now();
    const fresh = files.map((file, n) => { const id = crypto.randomUUID(); added.set(id, now + n); return { id, file, status: 'waiting' as const, progress: 0, message: 'بانتظار القراءة', skip: false }; });
    set({ items: [...state.items, ...fresh] });
    keep(fresh.map(i => i.id));
    void run();
  },
  resume() { void run(); },
  stop() { stopper?.abort(); },
  open(v: boolean) { set({ open: v }); },
  /** Drops the orders saved (or all of them), and stops reading when nothing is left. */
  remove(ids?: string[]) {
    const items = ids ? state.items.filter(i => !ids.includes(i.id)) : [];
    if (!items.length) stopper?.abort();
    void dropOrders(ids ?? undefined);
    set({ items, open: items.length ? state.open : false });
  },
  get: () => state,
};

export function useOrderReading() {
  return useSyncExternalStore(l => { listeners.add(l); void restore(); return () => { listeners.delete(l); }; }, () => state, () => state);
}
