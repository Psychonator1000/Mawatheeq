import { backend } from './supabase-client';
import { DEFAULT_RULES } from './domain';

function checked<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

async function allRows(table: string): Promise<any[]> {
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    const page = checked(await backend().from(table).select('*').order('id').range(from, from + 499)) || [];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

export async function sharedRequest(path: string, init?: RequestInit): Promise<any> {
  const method = init?.method || 'GET';
  if (path === '/api/cases' && method === 'GET') {
    const [rows, settings] = await Promise.all([
      allRows('mawatheeq_cases'),
      backend().from('mawatheeq_settings').select('value').eq('key', 'rules').maybeSingle().then(checked),
    ]);
    return { cases: rows.map(row => ({ ...row.payload, id: row.id, revision: row.revision, archived: row.archived })), rules: settings?.value || DEFAULT_RULES };
  }
  if (path === '/api/cases' && method === 'POST') {
    const body = JSON.parse(String(init?.body));
    return { case: checked(await backend().rpc('mawatheeq_save_case', { p_case: body.case })) };
  }
  if (path === '/api/cases' && method === 'PUT') {
    const body = JSON.parse(String(init?.body));
    return checked(await backend().rpc('mawatheeq_import_cases', { p_cases: body.cases }));
  }
  if (path === '/api/settings' && method === 'POST') {
    const body = JSON.parse(String(init?.body));
    return { rules: checked(await backend().rpc('mawatheeq_save_rules', { p_rules: body.rules })) };
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
    fileKey = `documents/${id}/${crypto.randomUUID()}.pdf`;
    filename = file.name;
    checked(await backend().storage.from('mawatheeq-documents').upload(fileKey, file, { contentType: 'application/pdf', upsert: false }));
  }
  try {
    return checked(await backend().rpc('mawatheeq_save_document', {
      p_id: id, p_payload: payload, p_filename: filename, p_file_key: fileKey,
      p_revision: Number(body.get('revision') || 0),
    }));
  } catch (error) {
    if (fileKey) await backend().storage.from('mawatheeq-documents').remove([fileKey]);
    throw error;
  }
}

export async function downloadDocument(id: string): Promise<Blob> {
  const row = checked(await backend().from('mawatheeq_documents').select('file_key').eq('id', id).single());
  if (!row?.file_key) throw new Error('لا يوجد ملف PDF محفوظ لهذا المستند.');
  const file = checked(await backend().storage.from('mawatheeq-documents').download(row.file_key));
  if (!file) throw new Error('تعذر تحميل ملف PDF الأصلي.');
  return file;
}
