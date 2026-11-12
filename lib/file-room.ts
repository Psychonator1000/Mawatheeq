// «الملفات» (owner, 12 November 2026): the office's file room. The files stay on the office's network share; on an
// office computer (Chrome or Edge) the app is given four of its folders once and then reads, renames and moves files
// in them, and nowhere else:
//   الوارد (where the scanner puts its files) → المسح اليومي/سنة/شهر/يوم → ملفات القضايا/<الكود>/«الاسم الكود.pdf»
//   and أوامر الأداء/<الشركة>/… for the payment orders of each company.
// Nothing is sent to the server. The folders given are remembered in this browser (IndexedDB); after a restart the
// browser asks again, with one click, before the app may touch them.

export type RootKey = 'inbox' | 'daily' | 'cases' | 'orders';
export const ROOTS: Record<RootKey, { label: string; hint: string }> = {
  inbox: { label: 'الوارد من الماسح', hint: 'المجلد الذي يحفظ فيه الماسح الضوئي الملفات على الشبكة.' },
  daily: { label: 'المسح اليومي', hint: 'تُرتب فيه ملفات كل يوم: سنة ← شهر ← يوم.' },
  cases: { label: 'ملفات القضايا', hint: 'مجلد لكل قضية باسم كودها، وفيه ملفاتها بأسماء تنتهي بالكود.' },
  orders: { label: 'أوامر الأداء', hint: 'مجلد لكل شركة، وفيه ملفات أوامر الأداء الواردة منها.' },
};
export type Roots = Partial<Record<RootKey, FileSystemDirectoryHandle>>;
type Perm = 'granted' | 'prompt' | 'denied';
type WithPerm = FileSystemDirectoryHandle & { queryPermission?: (d: { mode: string }) => Promise<Perm>; requestPermission?: (d: { mode: string }) => Promise<Perm> };

/** Whether this browser can be given folders (Chrome or Edge on a computer). */
export const supported = () => typeof window !== 'undefined' && ('showDirectoryPicker' in window || !!(window as unknown as { __mawatheeqFileRoots?: unknown }).__mawatheeqFileRoots);

// ---- remembering the folders given -------------------------------------------------------------------------------
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
  const given = (window as unknown as { __mawatheeqFileRoots?: Roots }).__mawatheeqFileRoots;
  if (given) return given;
  const d = await db(); if (!d) return {};
  return new Promise(resolve => { const r = d.transaction(STORE).objectStore(STORE).get('roots'); r.onsuccess = () => resolve((r.result as Roots) || {}); r.onerror = () => resolve({}); });
}
export async function saveRoots(roots: Roots) {
  const given = (window as unknown as { __mawatheeqFileRoots?: Roots }).__mawatheeqFileRoots;
  if (given) { Object.assign(given, roots); return; }
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

// ---- reading -----------------------------------------------------------------------------------------------------
export type FileItem = { name: string; size: number; modified: number; handle: FileSystemFileHandle; dir: FileSystemDirectoryHandle; path: string };
const DOC = /\.(pdf|jpe?g|png|tiff?|docx?|xlsx?)$/i;
async function* entries(dir: FileSystemDirectoryHandle) {
  for await (const e of (dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) yield e;
}
/** The documents directly in a folder (not its sub-folders), newest first. */
export async function filesIn(dir: FileSystemDirectoryHandle, path = ''): Promise<FileItem[]> {
  const out: FileItem[] = [];
  for await (const e of entries(dir)) {
    if (e.kind !== 'file' || !DOC.test(e.name) || e.name.startsWith('.') || e.name.startsWith('~$')) continue;
    const f = await (e as FileSystemFileHandle).getFile();
    out.push({ name: e.name, size: f.size, modified: f.lastModified, handle: e as FileSystemFileHandle, dir, path: path ? path + '/' + e.name : e.name });
  }
  return out.sort((a, b) => b.modified - a.modified);
}
export async function foldersIn(dir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle[]> {
  const out: FileSystemDirectoryHandle[] = [];
  for await (const e of entries(dir)) if (e.kind === 'directory' && !e.name.startsWith('.')) out.push(e as FileSystemDirectoryHandle);
  return out;
}
export type Folder = { name: string; handle: FileSystemDirectoryHandle; count: number; latest: number; files?: FileItem[] };
/** Each sub-folder with how many documents it holds and when the newest came; `keep` keeps the files read. */
export async function folderSummaries(dir: FileSystemDirectoryHandle, onProgress?: (done: number, total: number) => void, keep = false): Promise<Folder[]> {
  const subs = await foldersIn(dir), out: Folder[] = [];
  let done = 0;
  // A few at a time: a network share answers slowly, one folder after another took long with thousands of cases.
  const queue = [...subs];
  const worker = async () => { for (let d = queue.shift(); d; d = queue.shift()) {
    const files = await filesIn(d, d.name).catch(() => [] as FileItem[]);
    out.push({ name: d.name, handle: d, count: files.length, latest: files[0]?.modified || 0, ...(keep ? { files } : {}) });
    onProgress?.(++done, subs.length);
  } };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}
/** The daily scanning folder: how many documents each day holds (year/month/day folders). */
export async function dailyCounts(dir: FileSystemDirectoryHandle): Promise<Map<string, { count: number; handle: FileSystemDirectoryHandle }>> {
  const out = new Map<string, { count: number; handle: FileSystemDirectoryHandle }>();
  for (const y of await foldersIn(dir)) { if (!/^\d{4}$/.test(y.name)) continue;
    for (const m of await foldersIn(y)) { if (!/^\d{1,2}$/.test(m.name)) continue;
      for (const d of await foldersIn(m)) { if (!/^\d{1,2}$/.test(d.name)) continue;
        const key = `${y.name}-${m.name.padStart(2, '0')}-${d.name.padStart(2, '0')}`;
        let n = 0; for await (const e of entries(d)) if (e.kind === 'file' && DOC.test(e.name)) n++;
        out.set(key, { count: n, handle: d });
      } } }
  return out;
}

// ---- filing ------------------------------------------------------------------------------------------------------
/** A name Windows accepts for a file or folder: no path characters, no trailing dots or spaces. */
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 150);
const ext = (name: string) => (name.match(/\.[a-z0-9]{2,5}$/i)?.[0] || '.pdf').toLowerCase();
/** The file name in a case folder: the document's name, then the case code (owner: «namings which end with the code»). */
export const caseFileName = (title: string, code: string, original: string) => `${safeName(title)} ${safeName(code)}${ext(original)}`;
async function exists(dir: FileSystemDirectoryHandle, name: string) { try { await dir.getFileHandle(name); return true; } catch { return false; } }
/** A name not yet used in the folder: «name.pdf», then «name (2).pdf»… */
async function freeName(dir: FileSystemDirectoryHandle, name: string) {
  if (!await exists(dir, name)) return name;
  const e = ext(name), base = name.slice(0, -e.length);
  for (let i = 2; i < 1000; i++) { const n = `${base} (${i})${e}`; if (!await exists(dir, n)) return n; }
  throw new Error('يوجد ملفات كثيرة بالاسم نفسه في هذا المجلد.');
}
async function subdir(dir: FileSystemDirectoryHandle, parts: string[]) { let d = dir; for (const p of parts) d = await d.getDirectoryHandle(safeName(p), { create: true }); return d; }
/**
 * Puts a file into a folder under a name (never over another file), and removes it from where it was unless `keep`.
 * The copy is written whole and checked by its size before the original is removed, so a dropped connection to the
 * share never loses a file.
 */
export async function place(item: FileItem, to: FileSystemDirectoryHandle, name: string, keep = false): Promise<string> {
  const final = await freeName(to, name), src = await item.handle.getFile();
  const target = await to.getFileHandle(final, { create: true }), w = await target.createWritable();
  await w.write(src); await w.close();
  if ((await target.getFile()).size !== src.size) throw new Error('لم تكتمل نسخة الملف؛ بقي الأصل في مكانه.');
  if (!keep) await item.dir.removeEntry(item.name);
  return final;
}
/** The day folder of a date: year/month/day (owner: «each day's scan filed in year then month then day»). */
export function dayParts(t: number) { const d = new Date(t); return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')]; }
export const fileToDaily = async (item: FileItem, daily: FileSystemDirectoryHandle) => place(item, await subdir(daily, dayParts(item.modified)), item.name);
export const fileToCase = async (item: FileItem, cases: FileSystemDirectoryHandle, code: string, title: string, keep: boolean) =>
  place(item, await subdir(cases, [code]), caseFileName(title, code, item.name), keep);
export const fileToOrders = async (item: FileItem, orders: FileSystemDirectoryHandle, company: string, keep: boolean) =>
  place(item, await subdir(orders, [company]), item.name, keep);
/**
 * A document's bytes held in memory. A viewer given the file itself keeps reading it from the share, and once the file
 * is filed (moved) the browser refuses those reads with an error in the page; a copy in memory stays readable.
 */
export async function snapshot(item: Pick<FileItem, 'handle'>): Promise<Blob> {
  const f = await item.handle.getFile();
  return new Blob([await f.arrayBuffer()], { type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '') });
}
/** Opens a document in a new tab (the browser's own viewer). */
export async function openFile(item: Pick<FileItem, 'handle'>) {
  const url = URL.createObjectURL(await snapshot(item));
  window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
/** Whether a file name ends with a case code (what the cases folder expects). */
export const endsWithCode = (name: string, code: string) => name.replace(/(\s*\(\d+\))?\.[a-z0-9]{2,5}$/i, '').trim().endsWith(code);
