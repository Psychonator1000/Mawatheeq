// Collection files from scanned payment-order bundles («أمر أداء» PDFs): what was read, what a person should check,
// which client the order belongs to, and the new file's details. Reading happens on the user's own computer.
import { normalizeSearch } from './case-browse.ts';
import { amountInWords, blankDocument, type DocumentData, type Evidence } from './document-fields.ts';

/** The fields a new collection file takes from the order, in the order they are checked on screen. */
type TextField = Exclude<keyof DocumentData, 'evidence'> & string;
export const ORDER_FIELDS: [TextField, string][] = [
  ['orderAuto', 'الرقم الآلي'], ['orderNumber', 'رقم أمر الأداء'], ['company', 'الدائن (الموكل)'], ['defendant', 'المدين'], ['civilId', 'الرقم المدني'],
  ['address', 'العنوان'], ['amount', 'مبلغ المطالبة'], ['account', 'رقم كشف الحساب'], ['demandDate', 'تاريخ البعثية'], ['statementDate', 'تاريخ كشف الحساب'],
  ['receiptNumber', 'رقم الإيصال'], ['receiptFee', 'الرسوم القضائية'], ['receiptDate', 'تاريخ الإجراء'], ['court', 'المحكمة'],
];
/** Pages as the field finder expects them: each page's text under «الصفحة n». */
export const pagesText = (pages: { page: number; text: string; warning?: string }[]) => pages.filter(p => !p.warning).map(p => `الصفحة ${p.page}\n${p.text}`).join('\n\n');

/** Fields a person should look at: missing, or not shaped as that field must be. */
export function fieldsToCheck(d: DocumentData): TextField[] {
  const bad = (k: TextField, v: string) => {
    if (!v.trim()) return true;
    if (k === 'orderAuto') return !/^\d{9}$/.test(v);
    if (k === 'civilId') return !/^[23]\d{11}$/.test(v);
    if (k === 'orderNumber') return !/^\d{4,8}\/20\d{2}$/.test(v);
    if (k === 'amount' || k === 'receiptFee') return !(Number(v) > 0);
    if (k === 'receiptNumber') return !/^F\d{6,12}$/.test(v);
    if (/Date$/.test(k)) return !/^20\d{2}-\d{2}-\d{2}$/.test(v);
    return /[a-z]/i.test(v);
  };
  return ORDER_FIELDS.map(([k]) => k).filter(k => bad(k, String(d[k] ?? '')));
}

// The office files telecom clients under their English names; the orders name them in Arabic.
const TELECOM: [RegExp, RegExp][] = [[/الاتصالات\s*الكويتي/, /\bstc\b|الاتصالات\s*الكويتي/i], [/الوطني[ةه]\s*للاتصالات|اوريدو|أوريدو/, /ooredoo|الوطني[ةه]\s*للاتصالات/i], [/الاتصالات\s*المتنقل[ةه]|زين/, /\bzain\b|الاتصالات\s*المتنقل/i]];
type ClientFile = { archived?: boolean; payload: { clientEntityId?: string; company?: string } };
/** How many of the files each client holds. */
export function filesPerClient(files: ClientFile[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const f of files) if (!f.archived && f.payload.clientEntityId) n.set(f.payload.clientEntityId, (n.get(f.payload.clientEntityId) || 0) + 1);
  return n;
}
/**
 * The client file an order's creditor belongs to: the same name, or the telecom company the Arabic name refers to. When
 * two client files fit («شركة الاتصالات الكويتية» and «… STC»), the one holding more files wins, so the orders of one
 * client never split between two (owner, 14 November 2026).
 */
export function guessClient(company: string, clients: { id: string; name: string }[], held: Map<string, number> = new Map()): string {
  const n = normalizeSearch(company);
  if (!n) return '';
  const same = clients.find(c => normalizeSearch(c.name) === n);
  if (same) return same.id;
  // «الإتصالات» and «الاتصالات» are the same word; a name may also carry the English one («( Stc)»).
  const plain = company.replace(/[أإآ]/g, 'ا');
  for (const [arabic, client] of TELECOM) if (arabic.test(plain) || client.test(company)) {
    const hit = clients.filter(c => client.test(c.name.replace(/[أإآ]/g, 'ا'))).sort((a, b) => (held.get(b.id) || 0) - (held.get(a.id) || 0));
    if (hit.length === 1 || (hit.length > 1 && (held.get(hit[0].id) || 0) > (held.get(hit[1].id) || 0))) return hit[0].id;
  }
  return '';
}
/**
 * The client of an order whose creditor the scan could not read: the client the other orders of the same reading were
 * read for, else the client nearly all files (four in five) belong to; nobody when that is not clear.
 */
export function fallbackClient(batch: string[], held: Map<string, number>): string {
  const top = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const read = new Map<string, number>();
  for (const id of batch) if (id) read.set(id, (read.get(id) || 0) + 1);
  const fromBatch = top(read);
  if (fromBatch) return fromBatch[0];
  const all = [...held.values()].reduce((t, v) => t + v, 0), most = top(held);
  return most && most[1] >= all * 0.8 ? most[0] : '';
}
/** The client's name as the office writes it on its files (most of that client's files), else as its client file has it. */
export function clientNameOnFiles(clientId: string, files: ClientFile[], clients: { id: string; name: string }[]): string {
  if (!clientId) return '';
  const names = new Map<string, number>();
  for (const f of files) if (!f.archived && f.payload.clientEntityId === clientId && f.payload.company?.trim()) names.set(f.payload.company.trim(), (names.get(f.payload.company.trim()) || 0) + 1);
  return [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || clients.find(c => c.id === clientId)?.name || '';
}

/** The documents of a payment-order bundle, listed for the claim's bundle of evidence. */
export function orderEvidence(d: DocumentData): Evidence[] {
  return [
    { id: 'statement', included: true, date: d.statementDate, description: `صورة كشف حساب المشترك${d.account ? ' رقم (' + d.account + ')' : ''}${d.amount ? '، بإجمالي مديونية قدرها ' + d.amount + ' د.ك' : ''}.`, pages: 1 },
    { id: 'contract', included: true, date: '', description: 'صورة عقد طلب الخدمة المذيل بتوقيع المدعى عليه وشروطه العامة.', pages: 2 },
    { id: 'demand', included: true, date: d.demandDate, description: 'صورة كتاب التكليف بالوفاء، مرفقاً به صورة كشف البعثية البريدية.', pages: 2 },
    { id: 'civil', included: true, date: '', description: `صورة البطاقة المدنية للمدعى عليه ${d.defendant}.`, pages: 1 },
    { id: 'order', included: true, date: d.rejectedDate, description: `صورة طلب استصدار أمر الأداء ${d.court}${d.orderNumber ? ' رقم ' + d.orderNumber : ''}.`, pages: 1 },
    { id: 'receipt', included: true, date: d.receiptDate, description: 'صورة إيصال سداد الرسوم القضائية عن طلب أمر الأداء.', pages: 1 },
  ];
}

/** A new collection file's details from a checked order. */
export function orderPayload(d: DocumentData, extra: { clientEntityId?: string; source: string }) {
  const amount = d.amount.trim();
  return { ...blankDocument(), ...d, amount, amountWords: amount ? amountInWords(amount) : '', evidence: orderEvidence(d), clientEntityId: extra.clientEntityId || '', sourceReference: extra.source, notes: '' };
}

/**
 * An order read from its PDF completing a file that already exists (one made from the client's list of orders):
 * only empty fields are filled, nothing typed or checked on the file is overwritten, and the bundle's documents are
 * listed if the file has none yet.
 */
export function fillEmpty<T extends Record<string, unknown> & { evidence?: Evidence[] }>(file: T, read: DocumentData): T {
  const out: Record<string, unknown> = { ...file };
  for (const [k, v] of Object.entries(read)) if (k !== 'evidence' && typeof v === 'string' && v.trim() && !String(out[k] ?? '').trim()) out[k] = v;
  if (read.amount && !String(file.amountWords ?? '').trim()) out.amountWords = amountInWords(String(out.amount || read.amount));
  if (!file.evidence?.some(e => e.included)) out.evidence = orderEvidence(out as unknown as DocumentData);
  return out as T;
}
