// Reading payment-order PDFs in the background (owner, 11 November 2026: «what if I have something to do?»): the
// orders are read one after another on this computer while the person keeps working; a small bar on the page shows how
// far it has got, and the orders read are checked and saved when the person chooses. The reading lives here, outside
// any one page, so moving between the collections pages does not stop it.
import { useSyncExternalStore } from 'react';
import type { DocumentData } from './document-fields';
import { pagesText } from './order-import';

export type OrderItem = {
  id: string; file: File; status: 'waiting' | 'reading' | 'ready' | 'failed'; progress: number; message: string;
  data?: DocumentData; client?: string; skip: boolean; error?: string;
};
type State = { items: OrderItem[]; running: boolean; open: boolean };

// The order, the court receipt, the office's bundle list and the account statement are the first four pages.
const PAGES = 4;
let state: State = { items: [], running: false, open: false };
let stopper: AbortController | null = null;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach(l => l()); };

export function patchOrder(id: string, v: Partial<OrderItem>) { set({ items: state.items.map(i => i.id === id ? { ...i, ...v } : i) }); }

// Two orders are read at once on a computer with the room for it (4 or more cores and 4 GB or more of memory), one at a
// time on a weaker one, so the page stays smooth (each reading has its own text-recognition engine).
function lanes() {
  const cores = navigator.hardwareConcurrency || 2, memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores >= 4 && memory >= 4 ? 2 : 1;
}

async function run() {
  if (state.running) return;
  const { extractPDF } = await import('./pdf-reader'); const { extractFields } = await import('./document-fields');
  const ctrl = new AbortController(); stopper = ctrl; set({ running: true });
  // Each lane takes the next order still waiting (marked as being read at once, so no two lanes take the same one).
  const lane = async () => {
    for (let item = state.items.find(i => i.status === 'waiting'); item && !ctrl.signal.aborted; item = state.items.find(i => i.status === 'waiting')) {
      const it = item;
      patchOrder(it.id, { status: 'reading', progress: 0, message: 'تجهيز القراءة…' });
      try {
        const pages = await extractPDF(it.file, (p, message) => patchOrder(it.id, { progress: p, message }), ctrl.signal, PAGES);
        patchOrder(it.id, { status: 'ready', progress: 100, data: extractFields(pagesText(pages), it.file.name) });
      } catch (e) {
        if (ctrl.signal.aborted) { patchOrder(it.id, { status: 'waiting', progress: 0, message: 'أُوقفت القراءة' }); break; }
        patchOrder(it.id, { status: 'failed', error: (e as Error).message });
      }
    }
  };
  try { await Promise.all(Array.from({ length: lanes() }, lane)); }
  finally { stopper = null; set({ running: false }); }
}

export const orderReading = {
  /** Adds PDFs to the queue and starts reading if it is not already. */
  start(files: File[]) {
    set({ items: [...state.items, ...files.map(file => ({ id: crypto.randomUUID(), file, status: 'waiting' as const, progress: 0, message: 'بانتظار القراءة', skip: false }))] });
    void run();
  },
  resume() { void run(); },
  stop() { stopper?.abort(); },
  open(v: boolean) { set({ open: v }); },
  /** Drops the orders saved (or all of them), and stops reading when nothing is left. */
  remove(ids?: string[]) {
    const items = ids ? state.items.filter(i => !ids.includes(i.id)) : [];
    if (!items.length) stopper?.abort();
    set({ items, open: items.length ? state.open : false });
  },
  get: () => state,
};

export function useOrderReading() {
  return useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state, () => state);
}
