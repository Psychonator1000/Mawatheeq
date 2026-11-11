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

async function run() {
  if (state.running) return;
  const { extractPDF } = await import('./pdf-reader'); const { extractFields } = await import('./document-fields');
  const ctrl = new AbortController(); stopper = ctrl; set({ running: true });
  try {
    for (let next = state.items.find(i => i.status === 'waiting'); next && !ctrl.signal.aborted; next = state.items.find(i => i.status === 'waiting')) {
      const item = next;
      patchOrder(item.id, { status: 'reading', progress: 0, message: 'تجهيز القراءة…' });
      try {
        const pages = await extractPDF(item.file, (p, message) => patchOrder(item.id, { progress: p, message }), ctrl.signal, PAGES);
        patchOrder(item.id, { status: 'ready', progress: 100, data: extractFields(pagesText(pages), item.file.name) });
      } catch (e) {
        if (ctrl.signal.aborted) { patchOrder(item.id, { status: 'waiting', progress: 0, message: 'أُوقفت القراءة' }); break; }
        patchOrder(item.id, { status: 'failed', error: (e as Error).message });
      }
    }
  } finally { stopper = null; set({ running: false }); }
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
