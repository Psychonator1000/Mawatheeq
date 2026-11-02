import { type CaseRecord, formatDate, todayISO } from './domain.ts';
import { lastSitting, nextSitting } from './case-desk.ts';
import { rollCardsHtml, type RollCard } from './print.ts';

/** Finished in the old register («منتهي»), or archived in the app. */
const closed = (c: CaseRecord) => Boolean(c.archived) || /^منته/.test(String(c.legacyStatus || '').trim());
const codeOrder = (a: CaseRecord, b: CaseRecord) => {
  const x = String(a.code || ''), y = String(b.code || '');
  return (/^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y, 'ar')) || String(a.autoNumber || '').localeCompare(String(b.autoNumber || ''));
};

/**
 * «رول قضايا الموكل»: one client's cases as roll bands, insurance and others alike, ordered by code. Each band carries
 * the numbers, the court, the last sitting and its decision, the next sitting and the judgment.
 */
export function clientRollCards(cases: CaseRecord[], openOnly: boolean): RollCard[] {
  return cases.filter(c => !openOnly || !closed(c)).sort(codeOrder).map(c => {
    const last = lastSitting(c), next = nextSitting(c);
    return {
      code: String(c.code || ''), client: String(c.clientEntityName || c.client || ''), role: String(c.role || ''), opponent: String(c.opponent || ''), lawyer: String(c.lawyer || ''),
      facts: [
        ['الرقم الآلي', String(c.autoNumber || '')], ['رقم القضية', String(c.caseNumber || '')], ['المحكمة', String(last?.court || c.court || '')],
        ['الجلسة السابقة', last?.date ? formatDate(String(last.date)) : ''], ['آخر قرار', String(last?.decision || last?.text || '')],
        ['الجلسة القادمة', next ? formatDate(next) : ''],
        ['الحكم', c.date ? `${c.type || 'حكم'} ${formatDate(c.date)}${c.outcome && c.outcome !== 'غير محدد' ? ' — ' + c.outcome : ''}` : 'لم يصدر'],
        ['حالة الملف', String(c.legacyStatus || (c.archived ? 'مؤرشف' : ''))],
        // A company's owner or representative named on the case.
        ...(c.casePerson ? [['الشخص المعني', String(c.casePerson), String(c.casePersonRole || '')]] : []),
      ] as [string, string, string?][],
    };
  });
}
/** `summary`, when given, follows the client's name: the counts of «ملخص الموكلين» for this client. */
export function clientRollHtml(name: string, cases: CaseRecord[], openOnly: boolean, printedBy = '', summary = '') {
  const cards = clientRollCards(cases, openOnly);
  return rollCardsHtml('رول قضايا الموكل', `${name} · ${openOnly ? 'القضايا المفتوحة' : 'كل القضايا'}${summary ? ' · ' + summary : ''}`, [['', cards]], formatDate(todayISO()), printedBy, true, 'قضية');
}
