import { loadBackend } from './supabase-client';
import { localRequest, fileRequest, clientRequest } from './local-auth';
import { DEFAULT_RULES, type CaseRecord, type Rules } from './domain';
import { enrichCase, type ClientEntity } from './clients';
import { canReadCases, type Permissions } from './permissions';
import { cachedUser, readSnapshot, writeSnapshot } from './boot-cache';
import { isTrimmed, restoreHistory } from './case-trim';
export { isTrimmed, restoreHistory };

type StoredRow = { id: string; revision: number; payload: Record<string, unknown>; archived?: boolean; filename?: string; file_key?: string | null; updated_at: string };

function checked<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Case lists are read «light»: each case keeps its judgments, recent entries and last sessions, and older sessions stay
 * on the server (the case is marked «proceduresTrimmed»). A case opened or saved is read whole with «case_full».
 * A database without the light lists answers in full, as before.
 */
async function allRows(table: string, light = false, expected?: Promise<number>): Promise<StoredRow[]> {
  const action = table === 'mawatheeq_cases' ? 'cases_page' : 'documents_page', ask = (offset: number) => localRequest<StoredRow[] | null>(action, light ? { offset, light } : { offset }).then(r => r || []),
    // A page cut off by a busy database is asked once more after a moment before the read gives up.
    page = (offset: number) => ask(offset).catch(() => new Promise(r => setTimeout(r, 700 + Math.random() * 600)).then(() => ask(offset)));
  // Four pages at a time, each asked for as soon as one returns, so a slow database answers several at once instead
  // of one round after another. Pages are read until one comes back short; once the number of records is known, no
  // page past the end is asked for (a full last page still asks for the one after it).
  const pages: StoredRow[][] = [];
  let next = 0, end = Infinity, limit = Infinity;
  void expected?.then(n => { limit = Math.floor(n / 500) + 1; }, () => undefined);
  const worker = async () => {
    for (;;) {
      const i = next; if (i >= end || i >= limit) return;
      next++;
      const rows = await page(i * 500); pages[i] = rows;
      if (rows.length < 500) end = Math.min(end, i + 1); else if (i + 1 >= limit) limit = i + 2;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return pages.slice(0, end).flat();
}

async function allClients(action: 'list' | 'lookup') {
  const clients: ClientEntity[] = []; let canMerge = false;
  for (let offset = 0; ; offset += 500) {
    const page = await clientRequest<{ clients: ClientEntity[]; canMerge: boolean }>(action, { offset }); clients.push(...page.clients); canMerge = page.canMerge;
    if (page.clients.length < 500) return { clients, canMerge };
  }
}

/**
 * Cases are kept between refreshes: after the first full read each refresh asks only for what changed since the last
 * look («cases_changes») and checks the server's fingerprint of every visible case and revision against its own copy.
 * Any disagreement (a case removed, hidden by a permissions change, or more changes than one answer carries) reads
 * everything again, as does a copy older than ten minutes where the browser cannot compute the fingerprint.
 */
type CaseCopy = { asOf: string; rows: StoredRow[]; full: number; print?: string };
type Changes = { asOf: string; count: number; fingerprint: string; more: boolean; rows: StoredRow[] };
// The stored copy is read once and every refresh waits for that same read: two refreshes starting together (a
// return to the window during a timed refresh) would otherwise both find no copy and both read every case again.
let caseCopy: CaseCopy | null = null, copyRead: Promise<void> | null = null, copyUser = '';
let lastCases: { rows: StoredRow[]; directory: unknown; rulesKey: string; result: unknown } | null = null;
const textTag = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + t.length.toString(36); };
async function fingerprint(rows: StoredRow[]) {
  if (!globalThis.crypto?.subtle) return null;
  const text = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(r => `${r.id}:${r.revision}`).join(',');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function keptCopy(user: string) {
  if (user !== copyUser) { copyUser = user; copyRead = null; caseCopy = null; clientCopy = null; lastCases = null; }
  await (copyRead ??= readSnapshot<CaseCopy>('case-rows').then(c => { if (copyUser === user) caseCopy = c; }));
}
/**
 * The cases kept from the last visit, for the screen to open with before the server answers (one stored copy serves
 * both: the workspace keeps only the clients and rules beside it). `print` is the fingerprint those cases carry, so
 * the workspace trusts the opening copy's stamp only when it describes these very cases.
 */
export async function storedCases(clients: ClientEntity[]): Promise<{ cases: CaseRecord[]; print?: string } | null> {
  const user = cachedUser()?.id || ''; if (!user) return null;
  await keptCopy(user);
  return caseCopy && { cases: caseCopy.rows.map(row => enrichCase({ ...row.payload, id: row.id, revision: row.revision, archived: row.archived } as CaseRecord, clients)), print: caseCopy.print };
}
async function caseRows(): Promise<{ rows: StoredRow[]; changed: boolean; print?: string }> {
  // A database without «cases_changes» yet (before its update is applied) is read in full as before.
  try { return await changedRows(); } catch { return { rows: await allRows('mawatheeq_cases'), changed: true }; }
}
async function changedRows(): Promise<{ rows: StoredRow[]; changed: boolean; print?: string }> {
  // Signing in as someone else (or switching to a staff account) starts from that account's own copy.
  const user = cachedUser()?.id || '';
  await keptCopy(user);
  if (caseCopy) {
    const d = await localRequest<Changes>('cases_changes', { since: caseCopy.asOf, light: true });
    if (!d.more) {
      // Nothing changed: keep the very same list, so the screen has nothing to redo.
      if (!d.rows.length && caseCopy.rows.length === d.count) {
        const print = await fingerprint(caseCopy.rows);
        if (print ? print === d.fingerprint : Date.now() - caseCopy.full < 600000) { caseCopy = { ...caseCopy, asOf: d.asOf, print: print || undefined }; return { rows: caseCopy.rows, changed: false, print: caseCopy.print }; }
      }
      const byId = new Map(caseCopy.rows.map(r => [r.id, r]));
      for (const r of d.rows) byId.set(r.id, r);
      const rows = [...byId.values()], print = await fingerprint(rows);
      const fresh = rows.length === d.count && (print ? print === d.fingerprint : Date.now() - caseCopy.full < 600000);
      if (fresh) { caseCopy = { asOf: d.asOf, rows, full: caseCopy.full, print: print || undefined }; if (d.rows.length) void writeSnapshot('case-rows', caseCopy); return { rows, changed: d.rows.length > 0, print: caseCopy.print }; }
    }
  }
  // The marker of «now» and the pages are asked for together; the marker also says how many pages to queue.
  const marker = localRequest<Changes>('cases_changes', { light: true });
  const [start, rows] = await Promise.all([marker, allRows('mawatheeq_cases', true, marker.then(d => d.count))]);
  caseCopy = { asOf: start.asOf, rows, full: Date.now(), print: (await fingerprint(rows)) === start.fingerprint ? start.fingerprint : undefined }; void writeSnapshot('case-rows', caseCopy);
  return { rows, changed: true, print: caseCopy.print };
}
// The client list is small but read with every refresh; it is read again when cases changed or after five minutes.
let clientCopy: { at: number; action: string; value: { clients: ClientEntity[]; canMerge: boolean } } | null = null;
async function clientList(action: 'list' | 'lookup', casesChanged: boolean) {
  if (clientCopy && clientCopy.action === action && !casesChanged && Date.now() - clientCopy.at < 300000) return clientCopy.value;
  const value = await allClients(action); clientCopy = { at: Date.now(), action, value }; return value;
}

export async function sharedRequest(path: string, init?: RequestInit): Promise<unknown> {
  const method = init?.method || 'GET';
  if (path === '/api/cases' && method === 'GET') {
    const rules = localRequest<Rules | null>('rules'); rules.catch(() => undefined);
    const access = await localRequest<Permissions>('access');
    const canRead = canReadCases(access);
    // The client list is read alongside the cases (not after them); it is read again only if cases changed and the
    // copy it gave predates this refresh.
    const clientAction = access.sections.includes('clients') ? 'list' : 'lookup', asked = Date.now();
    const early = canRead ? clientList(clientAction, false) : null; early?.catch(() => undefined);
    const [cases, settings] = await Promise.all([canRead ? caseRows() : { rows: [] as StoredRow[], changed: false, print: undefined as string | undefined }, rules]);
    const directory = !early ? { clients: [], canMerge: false } : cases.changed && (clientCopy?.at ?? 0) < asked ? await clientList(clientAction, true) : await early;
    const rows = cases.rows, rulesKey = JSON.stringify(settings || DEFAULT_RULES);
    // Unchanged cases, clients and rules give back the previous answer itself: the workspace sees the same object and
    // skips redrawing and re-saving 7,000 cases on every refresh, which kept slow computers busy for seconds.
    if (lastCases && lastCases.rows === rows && lastCases.directory === directory && lastCases.rulesKey === rulesKey) return lastCases.result;
    // What the answer holds, in a few characters: the server's fingerprint of every case and revision, the clients and
    // the rules. The workspace compares it with the copy it opened with and, when they agree, keeps what is on screen.
    const stamp = cases.print ? `${cases.print}:${textTag(JSON.stringify(directory))}:${textTag(rulesKey)}` : undefined;
    const result = { ...directory, stamp, cases: rows.map(row => enrichCase({ ...row.payload, id: row.id, revision: row.revision, archived: row.archived } as CaseRecord, directory.clients)), rules: settings || DEFAULT_RULES };
    if (canRead) lastCases = { rows, directory, rulesKey, result };
    return result;
  }
  if (path === '/api/cases' && method === 'POST') {
    const body = JSON.parse(String(init?.body));
    return { case: await localRequest('save_case', { case: await withFullHistory(body.case) }) };
  }
  if (path === '/api/cases' && method === 'PUT') {
    const body = JSON.parse(String(init?.body));
    return await localRequest('import_cases', { cases: body.cases });
  }
  if (path.startsWith('/api/clients') && method === 'POST') clientCopy = null;
  if (path === '/api/clients' && method === 'POST') {
    const body = JSON.parse(String(init?.body)); return { client: await clientRequest('save', { client: body.client }) };
  }
  if (path === '/api/clients/merge' && method === 'POST') return clientRequest('merge', JSON.parse(String(init?.body)));
  if (path === '/api/settings' && method === 'POST') {
    const body = JSON.parse(String(init?.body));
    return { rules: await localRequest('save_rules', { rules: body.rules }) };
  }
  if (path === '/api/documents' && method === 'GET') {
    const rows = await allRows('mawatheeq_documents');
    return { documents: rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(row => ({ ...row.payload, id: row.id, filename: row.filename, updatedAt: row.updated_at, fileKey: row.file_key, revision: row.revision })) };
  }
  if (path === '/api/documents' && method === 'POST') return saveDocument(init?.body);
  throw new Error('العملية المطلوبة غير متاحة.');
}

/** The whole case from the server: every entry of its history. */
export async function fullCase(id: string): Promise<StoredRow> { return localRequest<StoredRow>('case_full', { id }); }
/**
 * A case saved from a light list gets its older sessions back: the entries the list left out are put before the ones
 * it showed (as they stand now, edited, removed or added). A case read whole goes as it is.
 */
export async function withFullHistory(c: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!isTrimmed(c)) return c;
  return restoreHistory(c, (await fullCase(String(c.id))).payload);
}
/** Every case whole, for a backup or a full export. */
export async function fullCaseRows(): Promise<StoredRow[]> { return allRows('mawatheeq_cases'); }

async function saveDocument(body: BodyInit | null | undefined) {
  if (!(body instanceof FormData)) throw new Error('بيانات المستند غير صالحة.');
  const id = String(body.get('id') || crypto.randomUUID());
  const payloadText = String(body.get('payload') || '{}');
  if (payloadText.length > 1000000) throw new Error('النص المستخرج كبير جداً.');
  const payload = JSON.parse(payloadText);
  const file = body.get('file');
  let fileKey: string | null = null;
  let filename = String(body.get('filename') || 'مستند');
  if (file instanceof File) {
    if (file.size > 25 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf') || new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') {
      throw new Error('اختر ملف PDF صالحاً بحجم لا يتجاوز 25 ميجابايت.');
    }
    const upload = await fileRequest('upload', { id });
    fileKey = upload.path;
    filename = file.name;
    checked(await (await loadBackend()).storage.from('mawatheeq-documents').uploadToSignedUrl(fileKey, upload.token!, file, { contentType: 'application/pdf', upsert: false }));
  }
  try {
    return await localRequest('save_document', { id, payload, filename, fileKey, revision: Number(body.get('revision') || 0) });
  } catch (error) {
    if (fileKey) await fileRequest('cleanup', { path: fileKey }).catch(() => undefined);
    throw error;
  }
}

export async function downloadDocument(id: string): Promise<Blob> {
  const access = await fileRequest('download', { id });
  if (!access.url) throw new Error('لا يوجد ملف PDF محفوظ لهذا المستند.');
  const response = await fetch(access.url);
  if (!response.ok) throw new Error('تعذر تحميل ملف PDF الأصلي.');
  return response.blob();
}
