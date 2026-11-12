// What a client's line on «الموكلون» tells at a glance (owner, 12 November 2026: «statistics everywhere»): how many
// cases (against the busiest client), how their judgments went, how many are in execution, the latest judgment and
// what is urgent; and what the page's summary tiles count.
import { caseState, formatDate, todayISO, type CaseRecord, type Rules } from './domain.ts';
import type { ClientEntity } from './clients.ts';

export type ClientStats = { cases: number; favour: number; against: number; open: number; executing: number; ready: number; week: number; last: string; month: number };
const blank = (): ClientStats => ({ cases: 0, favour: 0, against: 0, open: 0, executing: 0, ready: 0, week: 0, last: '', month: 0 });

/** Each client's numbers, from the cases not archived. */
export function clientStats(records: CaseRecord[], rules: Rules, today = todayISO()) {
  const map = new Map<string, ClientStats>(), month = today.slice(0, 7);
  for (const c of records) {
    if (c.archived || !c.clientEntityId) continue;
    let t = map.get(c.clientEntityId); if (!t) map.set(c.clientEntityId, t = blank());
    const s = caseState(c, rules, today);
    t.cases++;
    if (s.outcome === 'لصالحنا') t.favour++; else if (s.outcome === 'غير صالحنا') t.against++; else t.open++;
    if (s.status === 'تنفيذ قائم') t.executing++; else if (s.status === 'جاهز للتنفيذ') t.ready++;
    if (s.appeal !== 'تم' && s.days !== 0 && s.remaining !== null && s.remaining >= 0 && s.remaining <= 7) t.week++;
    if (c.date && c.date <= today && c.date > t.last) t.last = c.date;
    if (c.date?.startsWith(month)) t.month++;
  }
  return map;
}

/** A client's story in one line, and the colour of its edge. */
export function clientLine(c: ClientEntity, t: ClientStats | undefined, today = todayISO()): { story: string; edge: 'red' | 'amber' | 'green' | 'grey' } {
  if (!t?.cases) return { story: c.needsReview ? 'لا قضايا مرتبطة · يحتاج مراجعة الملف' : 'لا قضايا مرتبطة بعد', edge: c.needsReview ? 'amber' : 'grey' };
  const short = (d: string) => d.slice(0, 4) === today.slice(0, 4) ? formatDate(d).slice(0, 5) : formatDate(d);
  const parts = [
    t.week ? (t.week === 1 ? 'ميعاد طعن ينتهي خلال أسبوع' : t.week === 2 ? 'ميعادا طعن ينتهيان خلال أسبوع' : t.week <= 10 ? `${t.week} مواعيد طعن تنتهي خلال أسبوع` : `مواعيد طعن تنتهي خلال أسبوع: ${t.week}`) : '',
    t.last ? 'آخر حكم ' + short(t.last) : '',
    t.month > 1 ? `أحكام هذا الشهر: ${t.month}` : '',
    t.ready ? `جاهز للتنفيذ: ${t.ready}` : '',
    c.needsReview ? 'يحتاج مراجعة الملف' : '',
    !c.contacts.length ? 'الأشخاص غير مسجلين' : '',
  ].filter(Boolean);
  return { story: parts.join(' · '), edge: t.week ? 'red' : c.needsReview || t.ready ? 'amber' : 'green' };
}

