/** «رول الأحكام»: the row data, column catalogue, filters, sorting and grouping behind the printed roll. */

export type RollCase = {
  id: string; autoNumber: string; code: string; caseNumber: string; level: string; client: string; role: string; opponent: string;
  court: string; hall: string; subject: string; date: string; type: string; outcome: string; remaining: string; status: string; appeal: string;
  lawyer: string; lastAction: string; nextHearing: string; nextHearingDate: string; executionStage: string; notes: string; categories: string[];
};
export type RollColumn = keyof Omit<RollCase, 'id' | 'categories' | 'nextHearingDate' | 'level' | 'role' | 'hall'>;
/** Every column the roll can print, in print order, and whether it is on by default. */
export const ROLL_COLUMNS: [RollColumn, string, boolean][] = [
  ['autoNumber', 'الرقم الآلي', true], ['code', 'الكود', true], ['caseNumber', 'رقم القضية / الدرجة', true],
  ['client', 'الموكل وصفته', true], ['opponent', 'الخصم', true], ['court', 'المحكمة / الدائرة / الدور', true], ['subject', 'موضوع الدعوى', true],
  ['date', 'تاريخ الحكم', true], ['type', 'نوع الحكم', true], ['outcome', 'النتيجة', true], ['remaining', 'المتبقي للطعن', true],
  ['status', 'حالة الملف', true], ['appeal', 'حالة الطعن', false], ['lastAction', 'آخر إجراء', true], ['nextHearing', 'الجلسة القادمة', true],
  ['lawyer', 'المحامي', true], ['executionStage', 'مرحلة التنفيذ', false], ['notes', 'ملاحظات', false],
];
export const DEFAULT_ROLL_COLUMNS = ROLL_COLUMNS.filter(c => c[2]).map(c => c[0]);

export type RollFilter = { from: string; to: string; year: string; month: string; hearingFrom: string; hearingTo: string; client: string; lawyer: string; outcome: string; status: string; level: string; category: string; court: string };
export const EMPTY_ROLL_FILTER: RollFilter = { from: '', to: '', year: '', month: '', hearingFrom: '', hearingTo: '', client: '', lawyer: '', outcome: '', status: '', level: '', category: '', court: '' };
const squash = (v: string) => v.replace(/\s+/g, ' ').trim();
/** Keeps the cases that match every chosen filter; empty filters match everything. */
export function filterRoll(rows: RollCase[], f: RollFilter): RollCase[] {
  return rows.filter(r => (!f.from || (r.date && r.date >= f.from)) && (!f.to || (r.date && r.date <= f.to))
    && (!f.year || r.date.slice(0, 4) === f.year) && (!f.month || r.date.slice(5, 7) === f.month)
    && (!f.hearingFrom || (r.nextHearingDate && r.nextHearingDate >= f.hearingFrom)) && (!f.hearingTo || (r.nextHearingDate && r.nextHearingDate <= f.hearingTo))
    && (!f.client || squash(r.client) === squash(f.client)) && (!f.lawyer || squash(r.lawyer) === squash(f.lawyer))
    && (!f.outcome || r.outcome === f.outcome) && (!f.status || r.status === f.status) && (!f.level || r.level === f.level)
    && (!f.category || r.categories.includes(f.category)) && (!f.court || squash(r.court).includes(squash(f.court))));
}
export type RollSort = 'date-desc' | 'date-asc' | 'number' | 'hearing' | 'court' | 'client';
export const ROLL_SORTS: [RollSort, string][] = [['date-desc', 'الأحدث حكماً أولاً'], ['date-asc', 'الأقدم حكماً أولاً'], ['hearing', 'الجلسة القادمة الأقرب'], ['number', 'الرقم الآلي'], ['court', 'المحكمة'], ['client', 'الموكل']];
export function sortRoll(rows: RollCase[], sort: RollSort): RollCase[] {
  const last = (v: string) => v ? v : '￿';
  const by: Record<RollSort, (a: RollCase, b: RollCase) => number> = {
    'date-desc': (a, b) => (b.date || '').localeCompare(a.date || ''), 'date-asc': (a, b) => last(a.date).localeCompare(last(b.date)),
    hearing: (a, b) => last(a.nextHearingDate).localeCompare(last(b.nextHearingDate)), number: (a, b) => (Number(a.autoNumber) || Infinity) - (Number(b.autoNumber) || Infinity) || a.autoNumber.localeCompare(b.autoNumber),
    court: (a, b) => last(a.court).localeCompare(last(b.court), 'ar'), client: (a, b) => last(a.client).localeCompare(last(b.client), 'ar'),
  };
  return [...rows].sort(by[sort]);
}
export type RollGroupKey = '' | 'client' | 'role' | 'type' | 'lawyer' | 'outcome' | 'status' | 'level' | 'month' | 'court' | 'hearing';
export const ROLL_GROUPS: [RollGroupKey, string][] = [['', 'بدون تجميع'], ['court', 'المحكمة'], ['hearing', 'يوم الجلسة القادمة'], ['client', 'الموكل'], ['lawyer', 'المحامي'], ['month', 'شهر الحكم'], ['outcome', 'نتيجة الحكم'], ['status', 'حالة الملف'], ['level', 'درجة التقاضي'], ['type', 'نوع الحكم'], ['role', 'صفة الموكل']];
const dmy = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
/** Groups rows in their current order; rows without a value go to a final «غير محدد» group. */
export function groupRoll(rows: RollCase[], key: RollGroupKey): [string, RollCase[]][] {
  if (!key) return [['', rows]];
  const label = (r: RollCase) => key === 'month' ? (/^\d{4}-\d{2}/.test(r.date) ? r.date.slice(5, 7) + '/' + r.date.slice(0, 4) : '')
    : key === 'hearing' ? dmy(r.nextHearingDate) : String(r[key] || '').trim();
  const groups = new Map<string, RollCase[]>();
  for (const r of rows) { const k = label(r); groups.set(k, [...(groups.get(k) || []), r]); }
  const blank = groups.get(''); groups.delete('');
  return [...groups, ...(blank ? [['غير محدد', blank] as [string, RollCase[]]] : [])];
}
/** The printed text of one cell; some columns combine two values. */
export function rollCell(r: RollCase, col: RollColumn): [string, string] {
  switch (col) {
    case 'caseNumber': return [r.caseNumber || '—', r.level];
    case 'client': return [r.client, r.role];
    case 'court': return [r.court || '—', r.hall];
    case 'date': return [dmy(r.date) || '—', ''];
    default: return [String(r[col] || '—'), ''];
  }
}
