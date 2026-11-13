// «الملفات» (owner, 12 November 2026): the office's file room. The files stay on the office's network share; the app
// reads them, and copies each scan into its place, from one of two ways in:
//   • «برنامج الملفات» (public/helper/mawatheeq-files.mjs), a small program on the office computer: any browser
//     (Zen, Firefox, Chrome…), owner: «make me use zen as well»;
//   • the browser's own folder access (Chrome or Edge only), given the four folders once.
//   الوارد (where the scanner puts its files) → المسح اليومي/سنة/شهر/يوم → ملفات القضايا/<الكود>/«الاسم الكود.pdf»
//   and أوامر الأداء/<الشركة>/… for the payment orders of each company.
// Nothing is ever deleted, moved or overwritten (owner: «don't delete originals, for now you can rearrange and auto
// place»): filing copies a scan, and a small hidden note in the inbox remembers where each scan was placed.
// Nothing is sent to the server.

export type RootKey = 'inbox' | 'daily' | 'cases' | 'orders';
export const ROOTS: Record<RootKey, { label: string; hint: string }> = {
  inbox: { label: 'الوارد من الماسح', hint: 'المجلد الذي يحفظ فيه الماسح الضوئي الملفات على الشبكة.' },
  daily: { label: 'المسح اليومي', hint: 'تُرتب فيه نسخة من ملفات كل يوم: سنة ← شهر ← يوم.' },
  cases: { label: 'ملفات القضايا', hint: 'مجلد لكل قضية باسم كودها، وفيه ملفاتها بأسماء تنتهي بالكود.' },
  orders: { label: 'أوامر الأداء', hint: 'مجلد لكل شركة، وفيه ملفات أوامر الأداء الواردة منها.' },
};
export const ROOT_KEYS = Object.keys(ROOTS) as RootKey[];
export type Entry = { name: string; kind: 'file' | 'dir'; size: number; modified: number };
/** A document in one of the folders: where it is (its folder's path inside the root) and what it is. */
export type FileItem = { name: string; size: number; modified: number; root: RootKey; dir: string[] };

/** The folders, whichever way the app reaches them. Copies only: nothing is deleted or overwritten. */
export interface Store {
  kind: 'browser' | 'helper';
  /** The folder as the person knows it (its name, or its full path through the helper). */
  label(root: RootKey): string;
  list(root: RootKey, dir: string[]): Promise<Entry[]>;
  read(root: RootKey, path: string[]): Promise<Blob>;
  /** Copies a file into a folder (made if needed): the same name and size already there is not copied again; another file of that name gets «(2)». */
  copy(item: FileItem, root: RootKey, dir: string[], name: string): Promise<{ name: string; copied: boolean }>;
  /** Writes the app's hidden note (JSON) at the top of a root folder. */
  note(root: RootKey, name: string, text: string): Promise<void>;
}

// ---- the browser's own folder access (Chrome or Edge) ------------------------------------------------------------
export type Roots = Partial<Record<RootKey, FileSystemDirectoryHandle>>;
type Perm = 'granted' | 'prompt' | 'denied';
type WithPerm = FileSystemDirectoryHandle & { queryPermission?: (d: { mode: string }) => Promise<Perm>; requestPermission?: (d: { mode: string }) => Promise<Perm> };
type Given = { __mawatheeqFileRoots?: Roots; __mawatheeqFilesHelper?: string };
const given = () => (typeof window === 'undefined' ? {} : window) as unknown as Given;

/** Whether this browser can be given folders itself (Chrome or Edge on a computer). */
export const canPick = () => typeof window !== 'undefined' && ('showDirectoryPicker' in window || !!given().__mawatheeqFileRoots);

const DB = 'mawatheeq-file-room', STORE = 'roots';
function db(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null); }
    catch { resolve(null); }
  });
}
export async function loadRoots(): Promise<Roots> {
  // Tests (and screenshots) hand the app their own folders.
  const g = given().__mawatheeqFileRoots;
  if (g) return g;
  const d = await db(); if (!d) return {};
  return new Promise(resolve => { const r = d.transaction(STORE).objectStore(STORE).get('roots'); r.onsuccess = () => resolve((r.result as Roots) || {}); r.onerror = () => resolve({}); });
}
export async function saveRoots(roots: Roots) {
  const g = given().__mawatheeqFileRoots;
  if (g) { Object.assign(g, roots); return; }
  const d = await db(); if (!d) return;
  await new Promise<void>(resolve => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(roots, 'roots'); t.oncomplete = () => resolve(); t.onerror = () => resolve(); });
}
/** Asks for one of the folders (the browser's own folder window). */
export async function pickRoot(key: RootKey, current?: FileSystemDirectoryHandle) {
  const pick = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  return pick({ id: 'mawatheeq-' + key, mode: 'readwrite', ...(current ? { startIn: current } : {}) });
}
/** Whether the app may use a folder now; `ask` asks the person (needs a click). */
export async function allowed(h: FileSystemDirectoryHandle, ask = false): Promise<boolean> {
  const x = h as WithPerm;
  if (!x.queryPermission) return true;
  if (await x.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
  return ask && !!x.requestPermission && await x.requestPermission({ mode: 'readwrite' }) === 'granted';
}
async function* values(dir: FileSystemDirectoryHandle) {
  for await (const e of (dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) yield e;
}
async function exists(dir: FileSystemDirectoryHandle, name: string) { try { return await (await dir.getFileHandle(name)).getFile(); } catch { return null; } }
export function browserStore(roots: Roots): Store {
  const at = async (root: RootKey, dir: string[], create = false) => {
    let d = roots[root]; if (!d) throw new Error('لم يُحدد مجلد «' + ROOTS[root].label + '».');
    for (const p of dir) d = await d.getDirectoryHandle(p, { create });
    return d;
  };
  return {
    kind: 'browser',
    label: root => roots[root]?.name || '',
    async list(root, dir) {
      const out: Entry[] = [];
      for await (const e of values(await at(root, dir))) {
        if (e.kind === 'directory') { out.push({ name: e.name, kind: 'dir', size: 0, modified: 0 }); continue; }
        const f = await (e as FileSystemFileHandle).getFile().catch(() => null);
        if (f) out.push({ name: e.name, kind: 'file', size: f.size, modified: f.lastModified });
      }
      return out;
    },
    async read(root, path) {
      const f = await (await (await at(root, path.slice(0, -1))).getFileHandle(path[path.length - 1])).getFile();
      // A copy in memory: a viewer given the file itself keeps reading it from the share, and the browser refuses
      // those reads (with an error in the page) once anything changes on the share.
      return new Blob([await f.arrayBuffer()], { type: f.type || typeOf(f.name) });
    },
    async copy(item, root, dir, name) {
      const src = await (await (await at(item.root, item.dir)).getFileHandle(item.name)).getFile();
      const to = await at(root, dir, true), e = ext(name), base = name.slice(0, -e.length);
      for (let i = 1; i < 1000; i++) {
        const n = i === 1 ? name : `${base} (${i})${e}`, there = await exists(to, n);
        if (there) { if (there.size === src.size) return { name: n, copied: false }; continue; }
        const target = await to.getFileHandle(n, { create: true }), w = await target.createWritable();
        await w.write(src); await w.close();
        if ((await target.getFile()).size !== src.size) throw new Error('لم تكتمل نسخة الملف.');
        return { name: n, copied: true };
      }
      throw new Error('يوجد ملفات كثيرة بالاسم نفسه في هذا المجلد.');
    },
    async note(root, name, text) {
      const w = await (await (await at(root, [])).getFileHandle(name, { create: true })).createWritable();
      await w.write(new Blob([text], { type: 'application/json' })); await w.close();
    },
  };
}

// ---- «برنامج الملفات» on the office computer (any browser) -------------------------------------------------------
export type HelperStatus = { app: 'mawatheeq-files'; version: string; roots: Record<RootKey, { path: string; ok: boolean }> };
export const helperBase = () => given().__mawatheeqFilesHelper || 'http://127.0.0.1:47821';
/** Downloads of the helper, served with the app. */
export const HELPER_FILES = ['helper/mawatheeq-files.mjs', 'helper/start-mawatheeq-files.bat'];
async function helperFetch(path: string, init?: RequestInit) {
  const r = await fetch(helperBase() + path, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch { /* No message. */ } throw new Error(m || 'تعذر الاتصال ببرنامج الملفات.'); }
  return r;
}
/** The helper's state when it runs on this computer; null otherwise (answers quickly either way). */
export async function helperStatus(): Promise<HelperStatus | null> {
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(helperBase() + '/status', { signal: ctl.signal }).finally(() => clearTimeout(t));
    const s = await r.json();
    return s?.app === 'mawatheeq-files' ? s as HelperStatus : null;
  } catch { return null; }
}
/** Sets the helper's folders (full paths on that computer, e.g. Z:\الوارد or \\SERVER\Share\الوارد). */
export async function setHelperRoots(paths: Partial<Record<RootKey, string>>): Promise<HelperStatus> {
  return (await helperFetch('/roots', { method: 'PUT', body: JSON.stringify(paths) })).json();
}
export function helperStore(status: HelperStatus): Store {
  const q = (root: RootKey, path: string[]) => `root=${root}&path=${encodeURIComponent(path.join('/'))}`;
  return {
    kind: 'helper',
    label: root => status.roots[root]?.path || '',
    list: async (root, dir) => (await helperFetch('/list?' + q(root, dir))).json(),
    read: async (root, path) => (await helperFetch('/read?' + q(root, path))).blob(),
    copy: async (item, root, dir, name) => (await helperFetch('/copy', { method: 'POST', body: JSON.stringify({ from: { root: item.root, path: [...item.dir, item.name].join('/') }, to: { root, path: dir.join('/') }, name }) })).json(),
    note: async (root, name, text) => { await helperFetch('/note', { method: 'POST', body: JSON.stringify({ root, name, text }) }); },
  };
}

// ---- reading -----------------------------------------------------------------------------------------------------
const DOC = /\.(pdf|jpe?g|png|tiff?|docx?|xlsx?)$/i;
const ext = (name: string) => (name.match(/\.[a-z0-9]{2,5}$/i)?.[0] || '.pdf').toLowerCase();
const typeOf = (name: string) => ({ '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' } as Record<string, string>)[ext(name)] || '';
/** The documents directly in a folder (not its sub-folders), newest first. */
export async function filesIn(store: Store, root: RootKey, dir: string[] = []): Promise<FileItem[]> {
  return (await store.list(root, dir)).filter(e => e.kind === 'file' && DOC.test(e.name) && !e.name.startsWith('.') && !e.name.startsWith('~$'))
    .map(e => ({ name: e.name, size: e.size, modified: e.modified, root, dir })).sort((a, b) => b.modified - a.modified);
}
export async function foldersIn(store: Store, root: RootKey, dir: string[] = []) {
  return (await store.list(root, dir)).filter(e => e.kind === 'dir' && !e.name.startsWith('.')).map(e => e.name);
}
export type Folder = { name: string; count: number; latest: number; files?: FileItem[] };
/** Each sub-folder of a root with how many documents it holds and when the newest came; `keep` keeps the files read. */
export async function folderSummaries(store: Store, root: RootKey, onProgress?: (done: number, total: number) => void, keep = false): Promise<Folder[]> {
  const subs = await foldersIn(store, root), out: Folder[] = [];
  let done = 0;
  // A few at a time: a network share answers slowly, one folder after another took long with thousands of cases.
  const queue = [...subs];
  const worker = async () => { for (let d = queue.shift(); d; d = queue.shift()) {
    const files = await filesIn(store, root, [d]).catch(() => [] as FileItem[]);
    out.push({ name: d, count: files.length, latest: files[0]?.modified || 0, ...(keep ? { files } : {}) });
    onProgress?.(++done, subs.length);
  } };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}
/** The daily scanning folder: how many documents each day holds (year/month/day folders). */
export async function dailyCounts(store: Store): Promise<Map<string, { count: number; dir: string[] }>> {
  const out = new Map<string, { count: number; dir: string[] }>();
  for (const y of await foldersIn(store, 'daily')) { if (!/^\d{4}$/.test(y)) continue;
    for (const m of await foldersIn(store, 'daily', [y])) { if (!/^\d{1,2}$/.test(m)) continue;
      for (const d of await foldersIn(store, 'daily', [y, m])) { if (!/^\d{1,2}$/.test(d)) continue;
        const dir = [y, m, d], n = (await store.list('daily', dir)).filter(e => e.kind === 'file' && DOC.test(e.name)).length;
        out.set(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, { count: n, dir });
      } } }
  return out;
}

// ---- filing (copies) ---------------------------------------------------------------------------------------------
/** A name Windows accepts for a file or folder: no path characters, no trailing dots or spaces. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 150);
/** The file name in a case folder: the document's name, then the case code (owner: «namings which end with the code»). */
export const caseFileName = (title: string, code: string, original: string) => `${safeName(title)} ${safeName(code)}${ext(original)}`;
/** The day folder of a date: year/month/day (owner: «each day's scan filed in year then month then day»). */
export function dayParts(t: number) { const d = new Date(t); return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')]; }
export const fileToDaily = (store: Store, item: FileItem) => store.copy(item, 'daily', dayParts(item.modified), item.name);
export const fileToCase = (store: Store, item: FileItem, code: string, title: string) => store.copy(item, 'cases', [safeName(code)], caseFileName(title, code, item.name));
export const fileToOrders = (store: Store, item: FileItem, company: string) => store.copy(item, 'orders', [safeName(company)], item.name);
export const readFile = (store: Store, item: FileItem) => store.read(item.root, [...item.dir, item.name]);
/** Opens a document in a new tab (the browser's own viewer). */
export async function openFile(store: Store, item: FileItem) {
  const url = URL.createObjectURL(await readFile(store, item));
  window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
/** Whether a file name ends with a case code (what the cases folder expects). */
export const endsWithCode = (name: string, code: string) => name.replace(/(\s*\(\d+\))?\.[a-z0-9]{2,5}$/i, '').trim().endsWith(code);

// ---- where each scan went ------------------------------------------------------------------------------------------
// The originals stay in the inbox, so a hidden note there remembers each scan's copies (by name and size):
// {"scan-0001.pdf": {"size": 1234, "to": [{"where": "daily", "path": "2026/11/12/scan-0001.pdf", "at": 1731400000000}]}}
export const PLACED_NOTE = '.mawatheeq-placed.json';
export type Placement = { where: Exclude<RootKey, 'inbox'>; path: string; at: number };
export type Placed = Record<string, { size: number; to: Placement[] }>;
export async function loadPlaced(store: Store): Promise<Placed> {
  try { const p = JSON.parse(await (await store.read('inbox', [PLACED_NOTE])).text()); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; }
  catch { return {}; }
}
/** The places a scan was copied to (only while it is the same scan: same name and size). */
export const placesOf = (placed: Placed, f: FileItem) => placed[f.name]?.size === f.size ? placed[f.name].to : [];
/** Adds copies to the note (read fresh first, so two computers filing at once both stay in it). */
export async function notePlaced(store: Store, adds: { item: FileItem; where: Placement['where']; dir: string[]; name: string }[]): Promise<Placed> {
  const placed = await loadPlaced(store), at = Date.now();
  for (const a of adds) {
    const cur = placed[a.item.name]?.size === a.item.size ? placed[a.item.name] : { size: a.item.size, to: [] };
    const path = [...a.dir, a.name].join('/');
    if (!cur.to.some(p => p.where === a.where && p.path === path)) cur.to.push({ where: a.where, path, at });
    placed[a.item.name] = cur;
  }
  await store.note('inbox', PLACED_NOTE, JSON.stringify(placed));
  return placed;
}
/** Copies every scan not yet in «المسح اليومي» into its day (owner: «auto place»); returns how many were copied. */
export async function autoDaily(store: Store, files: FileItem[], placed: Placed): Promise<{ copied: number; placed: Placed }> {
  const todo = files.filter(f => !placesOf(placed, f).some(p => p.where === 'daily'));
  if (!todo.length) return { copied: 0, placed };
  const adds: Parameters<typeof notePlaced>[1] = []; let copied = 0;
  for (const f of todo) {
    const r = await fileToDaily(store, f);
    if (r.copied) copied++;
    adds.push({ item: f, where: 'daily', dir: dayParts(f.modified), name: r.name });
  }
  return { copied, placed: await notePlaced(store, adds) };
}
