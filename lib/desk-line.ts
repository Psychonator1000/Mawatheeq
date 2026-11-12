// What a line on the cases desk pages tells at a glance (owner, 12 November 2026: «every page must be informative»):
// a stayed case's renewal, a consultation's answer date, how long a case has waited; and the keys their tiles count.
import { formatDate, daysBetween as between } from './domain.ts';
import { daysAr } from './case-line.ts';

export type Edge = 'red' | 'amber' | 'green' | 'grey';
export type When = 'late' | 'today' | 'week' | 'later' | 'none';
const daysBetween = (a: string, b: string) => between(a, b) ?? 0;
const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
/** When a date falls from today: passed, today, within a week, later, or none set. */
export function whenOf(date: string, today: string): When {
  if (!ok(date)) return 'none';
  const n = daysBetween(today, date);
  return n < 0 ? 'late' : n === 0 ? 'today' : n <= 7 ? 'week' : 'later';
}
/** How long ago a date was, as «منذ …» (empty without a date). */
export const sinceAr = (date: string, today: string) => {
  if (!ok(date)) return '';
  const n = daysBetween(date, today);
  return n <= 0 ? 'منذ اليوم' : 'منذ ' + daysAr(n, true);
};
/** Age buckets for a waiting case: this month, up to 3 months, older, no date. */
export function ageOf(date: string, today: string): 'month' | 'quarter' | 'older' | 'none' {
  if (!ok(date)) return 'none';
  const n = daysBetween(date, today);
  return n <= 30 ? 'month' : n <= 90 ? 'quarter' : 'older';
}

/** A stayed or struck-off case: since when, and the renewal reminder (struck-off cases lapse 60 days after). */
export function stayLine(s: { reason: string; since: string; manual: boolean }, due: string, today: string) {
  const when = whenOf(due, today), left = ok(due) ? daysBetween(today, due) : 0;
  const parts = [
    s.manual ? 'أُوقفت يدوياً' : '',
    s.since ? (s.reason.startsWith('شطب') ? 'شُطبت ' : 'موقوفة ') + sinceAr(s.since, today) : 'بلا تاريخ',
    !due ? 'لا موعد تجديد' : when === 'late' ? 'فات موعد التجديد منذ ' + daysAr(-left, true) : when === 'today' ? 'آخر يوم للتجديد اليوم' : 'تُجدّد قبل ' + formatDate(due) + ' · باقي ' + daysAr(left),
  ];
  const edge: Edge = !due ? 'grey' : when === 'late' || left <= 14 ? 'red' : left <= 30 ? 'amber' : 'green';
  return { story: parts.filter(Boolean).join(' · '), edge, when };
}

/** A consultation: when it came, when its answer is due or how late, and who answers it. */
export function consultationLine(k: { status: string; receivedDate: string; dueDate: string; answer?: string }, lawyer: string, today: string) {
  const closed = k.status === 'answered' || k.status === 'closed', when = whenOf(k.dueDate, today);
  const n = ok(k.dueDate) ? Math.abs(daysBetween(today, k.dueDate)) : 0;
  const parts = [
    k.receivedDate ? 'وردت ' + sinceAr(k.receivedDate, today) : '',
    closed ? (k.status === 'answered' ? 'تم الرد' : 'أُغلقت') : when === 'late' ? 'تأخر الرد ' + daysAr(n, true) : when === 'today' ? 'الرد مستحق اليوم' : when === 'none' ? 'بلا موعد رد' : 'الرد خلال ' + daysAr(n),
    lawyer ? '' : 'بلا محامٍ مسؤول',
  ];
  const edge: Edge = closed ? 'green' : when === 'late' ? 'red' : when === 'today' || !lawyer ? 'amber' : when === 'none' ? 'grey' : 'green';
  return { story: parts.filter(Boolean).join(' · '), edge, when: closed ? 'none' as When : when };
}
