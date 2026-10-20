// Reading a bank's statement file (Excel or CSV) into statement lines: the header row is found by its column names, and
// amounts come either from one signed column or from separate withdrawal and deposit columns.

export type StatementLineInput = { date: string; label: string; ref: string; partnerName: string; amount: string };
export type StatementParse = { lines: StatementLineInput[]; skipped: number; columns: Record<string, string>; opening: string; closing: string };

const norm = (s: unknown) => String(s ?? '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase().replace(/\s+/g, ' ').trim();
const COLUMNS: Record<string, string[]> = {
  date: ['تاريخ العمليه', 'تاريخ الحركه', 'تاريخ القيد', 'التاريخ', 'تاريخ', 'date', 'transaction date', 'posting date', 'value date'],
  label: ['البيان', 'الوصف', 'التفاصيل', 'تفاصيل العمليه', 'description', 'details', 'narrative', 'particulars', 'label'],
  ref: ['المرجع', 'رقم المرجع', 'رقم الشيك', 'reference', 'ref', 'cheque no', 'cheque number'],
  partner: ['المستفيد', 'الطرف', 'الاسم', 'beneficiary', 'partner', 'name', 'payee'],
  amount: ['المبلغ', 'amount', 'transaction amount'],
  debit: ['مدين', 'سحب', 'مسحوبات', 'السحب', 'debit', 'withdrawal', 'withdrawals', 'dr'],
  credit: ['دائن', 'ايداع', 'ايداعات', 'الايداع', 'credit', 'deposit', 'deposits', 'cr'],
  balance: ['الرصيد', 'balance', 'running balance'],
};
const toArabicDigits = (s: string) => s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** A cell as a plain amount ("-12.500"), or '' when it holds none. Brackets and a trailing minus mean money out. */
export function cellAmount(v: unknown): string {
  let s = toArabicDigits(String(v ?? '')).replace(/[,\s]|KWD|د\.ك|دينار/gi, '');
  if (!s) return '';
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return '';
  const fils = Math.round(Number(s) * 1000);
  if (!fils) return '';
  const t = (fils / 1000).toFixed(3);
  return neg ? '-' + t : t;
}
/** A cell as a date (YYYY-MM-DD): day/month/year, year-month-day, or an Excel day number. */
export function cellDate(v: unknown): string {
  const s = toArabicDigits(String(v ?? '').trim());
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5); return d.toISOString().slice(0, 10); }
  return '';
}

/** Rows of a statement sheet as lines; the first row naming a date and an amount (or debit/credit) column is the header. */
export function parseStatementRows(rows: unknown[][]): StatementParse {
  let header = -1; const col: Record<string, number> = {};
  for (let r = 0; r < Math.min(rows.length, 40) && header < 0; r++) {
    const cells = (rows[r] || []).map(norm), found: Record<string, number> = {};
    for (const [key, names] of Object.entries(COLUMNS)) {
      const i = cells.findIndex(c => c && names.some(n => c === n || (n.length > 3 && c.startsWith(n))));
      if (i >= 0 && !Object.values(found).includes(i)) found[key] = i;
    }
    if (found.date !== undefined && (found.amount !== undefined || found.debit !== undefined || found.credit !== undefined)) { header = r; Object.assign(col, found); }
  }
  if (header < 0) throw new Error('لم نجد في الملف عمودي التاريخ والمبلغ (أو مدين ودائن). تأكد أنه كشف حساب من البنك.');
  const lines: StatementLineInput[] = []; let skipped = 0, opening = '', closing = '';
  for (const row of rows.slice(header + 1)) {
    const date = cellDate(row[col.date]);
    let amount = '';
    if (col.amount !== undefined) amount = cellAmount(row[col.amount]);
    if (!amount && (col.debit !== undefined || col.credit !== undefined)) {
      const out = col.debit !== undefined ? cellAmount(row[col.debit]) : '', inn = col.credit !== undefined ? cellAmount(row[col.credit]) : '';
      amount = inn && !inn.startsWith('-') ? inn : out ? (out.startsWith('-') ? out.slice(1) : '-' + out) : '';
    }
    const balance = col.balance !== undefined ? cellAmount(row[col.balance]) : '';
    if (!date || !amount) { if (row.some(c => String(c ?? '').trim())) skipped++; continue; }
    if (!lines.length && balance) opening = ((Math.round(Number(balance) * 1000) - Math.round(Number(amount) * 1000)) / 1000).toFixed(3);
    if (balance) closing = balance;
    lines.push({ date, amount, label: String(row[col.label] ?? '').trim().slice(0, 300), ref: col.ref !== undefined ? String(row[col.ref] ?? '').trim().slice(0, 100) : '', partnerName: col.partner !== undefined ? String(row[col.partner] ?? '').trim().slice(0, 200) : '' });
  }
  if (!lines.length) throw new Error('لا توجد حركات بتاريخ ومبلغ تحت عناوين الأعمدة.');
  const names = Object.fromEntries(Object.entries(col).map(([k, i]) => [k, String(rows[header][i] ?? '')]));
  return { lines, skipped, columns: names, opening, closing };
}

export async function readStatement(file: File): Promise<StatementParse> {
  const { openWorkbook } = await import('./excel-files');
  const { X, book } = await openWorkbook(file, { cellDates: false, raw: false });
  const sheet = book.Sheets[book.SheetNames[0]];
  return parseStatementRows(X.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' }));
}
