import { backend } from './supabase-client';
import { localRequest, fileRequest, clientRequest } from './local-auth';
import { DEFAULT_RULES, type CaseRecord, type Rules } from './domain';
import { enrichCase, type ClientEntity } from './clients';
import { canReadCases, type Permissions } from './permissions';
import { cachedUser, readSnapshot, writeSnapshot } from './boot-cache';

type StoredRow = { id: string; revision: number; payload: Record<string, unknown>; archived?: boolean; filename?: string; file_key?: string | null; updated_at: string };

function checked<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

async function allRows(table: string): Promise<StoredRow[]> {
  const action = table === 'mawatheeq_cases' ? 'cases_page' : 'documents_page', page = (offset: number) => localRequest<StoredRow[] | null>(action, { offset }).then(r => r || []);
  // Two pages at a time: one round trip for an office of up to 1,000 records instead of one per page.
  const rows: StoredRow[] = [];
  for (let from = 0; ; from += 1000) {
    const [a, b] = await Promise.all([page(from), page(from + 500)]);
    rows.push(...a);
    if (a.length < 500) return rows;
    rows.push(...b);
    if (b.length < 500) return rows;
  }
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
type CaseCopy = { asOf: string; rows: StoredRow[]; full: number };
type Changes = { asOf: string; count: number; fingerprint: string; more: boolean; rows: StoredRow[] };
let caseCopy: CaseCopy | null = null, copyLoaded = false, copyUser = '';
async function fingerprint(rows: StoredRow[]) {
  if (!globalThis.crypto?.subtle) return null;
  const text = [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(r => `${r.id}:${r.revision}`).join(',');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function caseRows(): Promise<{ rows: StoredRow[]; changed: boolean }> {
  // A database without «cases_changes» yet (before its update is applied) is read in full as before.
  try { return await changedRows(); } catch { return { rows: await allRows('mawatheeq_cases'), changed: true }; }
}
async function changedRows(): Promise<{ rows: StoredRow[]; changed: boolean }> {
  // Signing in as someone else (or switching to a staff account) starts from that account's own copy.
  const user = cachedUser()?.id || '';
  if (user !== copyUser) { copyUser = user; copyLoaded = false; caseCopy = null; clientCopy = null; }
  if (!copyLoaded) { copyLoaded = true; caseCopy = await readSnapshot<CaseCopy>('case-rows'); }
  if (caseCopy) {
    const d = await localRequest<Changes>('cases_changes', { since: caseCopy.asOf });
    if (!d.more) {
      const byId = new Map(caseCopy.rows.map(r => [r.id, r]));
      for (const r of d.rows) byId.set(r.id, r);
      const rows = [...byId.values()], print = await fingerprint(rows);
      const fresh = rows.length === d.count && (print ? print === d.fingerprint : Date.now() - caseCopy.full < 600000);
      if (fresh) { caseCopy = { asOf: d.asOf, rows, full: caseCopy.full }; if (d.rows.length) void writeSnapshot('case-rows', caseCopy); return { rows, changed: d.rows.length > 0 }; }
    }
  }
  const start = await localRequest<Changes>('cases_changes', {});
  const rows = await allRows('mawatheeq_cases');
  caseCopy = { asOf: start.asOf, rows, full: Date.now() }; void writeSnapshot('case-rows', caseCopy);
  return { rows, changed: true };
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
    const [cases, settings] = await Promise.all([canRead ? caseRows() : { rows: [], changed: false }, rules]);
    const directory = canRead ? await clientList(access.sections.includes('clients') ? 'list' : 'lookup', cases.changed) : { clients: [], canMerge: false };
    const rows = cases.rows;
    return { ...directory, cases: rows.map(row => enrichCase({ ...row.payload, id: row.id, revision: row.revision, archived: row.archived } as CaseRecord, directory.clients)), rules: settings || DEFAULT_RULES };
  }
  if (path === '/api/cases' && method === 'POST') {
    const body = JSON.parse(String(init?.body));
    return { case: await localRequest('save_case', { case: body.case }) };
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
    checked(await backend().storage.from('mawatheeq-documents').uploadToSignedUrl(fileKey, upload.token!, file, { contentType: 'application/pdf', upsert: false }));
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
