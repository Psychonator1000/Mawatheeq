// The cases desk: sessions posting (ترحيل الجلسات) and its errors, the sessions roll and follow-up, case statements,
// consultations, the judgments register, cases without a fee agreement, cases under study and stayed cases.
// Everything is computed from the case records the account may see; nothing here grants access.
import type { CaseRecord, Procedure } from './domain';

/** Where a matter stands before it is a filed case: a consultation, or a case being studied before filing. */
export type Workflow = '' | 'consultation' | 'study';
export const workflowOf = (c: Pick<CaseRecord, 'workflow'> | Record<string, unknown>): Workflow =>
  c.workflow === 'consultation' || c.workflow === 'study' ? c.workflow : '';
/** Filed cases: everything that is neither a consultation nor a case under study. */
export const isFiled = (c: CaseRecord) => !workflowOf(c);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const valid = (s: unknown): s is string => typeof s === 'string' && ISO.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
export function shiftDays(s: string, n: number) { if (!valid(s)) return ''; const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
/** Friday and Saturday, the weekend in Kuwait, when courts do not sit. */
export const isWeekend = (s: string) => valid(s) && [5, 6].includes(new Date(s + 'T12:00:00Z').getUTCDay());

export const isSessionEntry = (p: Procedure) => p.kind === 'جلسة' || p.kind === 'جلسة خبراء';
/** Entries that set the next sitting: sessions, and the filing of a case with its first hearing date. */
const setsNext = (p: Procedure) => isSessionEntry(p) || p.kind === 'قيد الدعوى';
const byDate = (a: Procedure, b: Procedure) => (a.date || '').localeCompare(b.date || '');

/** The latest session (or filing) of the current court level. */
export function lastSitting(c: CaseRecord): Procedure | undefined {
  return (c.procedures || []).filter(setsNext).sort(byDate).at(-1);
}
/** The date the case is next expected in court: what the latest sitting adjourned it to. */
export const nextSitting = (c: CaseRecord) => { const p = lastSitting(c); return valid(p?.followup) ? p!.followup! : ''; };

/** Decisions that end the sittings of a level, so no next date is expected after them. */
const ENDS = ['صدور الحكم', 'شطب الدعوى', 'وقف الدعوى', 'إيداع التقرير', 'ترك الخصومة', 'انقطاع سير الخصومة'];
const decisionOf = (p: Procedure) => String(p.decision || p.text?.split(' — ')[0] || '').trim();
const live = (c: CaseRecord) => isFiled(c) && !c.archived;

/** Cases whose sitting falls on `date` and still need its result posted (ترحيل الجلسات). */
export function dueForPosting(records: CaseRecord[], date: string) {
  return records.filter(c => live(c) && nextSitting(c) === date).sort((a, b) => String(lastSitting(a)?.court || a.court).localeCompare(String(lastSitting(b)?.court || b.court)));
}

export type PostingError = { kind: 'notPosted' | 'noNextDate' | 'weekend' | 'backwards' | 'judgmentPending'; label: string; date: string };
export const POSTING_ERRORS: Record<PostingError['kind'], string> = {
  notPosted: 'جلسة مضت دون ترحيل', noNextDate: 'تأجيل دون موعد الجلسة التالية', weekend: 'الجلسة التالية في عطلة نهاية الأسبوع',
  backwards: 'الجلسة التالية قبل تاريخ الجلسة', judgmentPending: 'موعد النطق بالحكم مضى دون تسجيل الحكم',
};
/**
 * Mistakes and gaps in the sessions posting (أخطاء الترحيل): a sitting date passed without its result, an adjournment
 * without the next date, a next date on a Friday or Saturday or before the sitting itself, and a reserved judgment
 * whose date passed with no judgment recorded.
 */
export function postingErrors(c: CaseRecord, today: string): PostingError[] {
  if (!live(c)) return [];
  const p = lastSitting(c); if (!p) return [];
  const decision = decisionOf(p), next = valid(p.followup) ? p.followup : '', out: PostingError[] = [];
  const add = (kind: PostingError['kind'], date: string) => out.push({ kind, label: POSTING_ERRORS[kind], date });
  const reserved = /^(حجز للحكم|مد أجل النطق)/.test(decision);
  if (!next && !ENDS.includes(decision) && (/^(تأجيل|حجز|مد أجل|إحالة|إعادة|معاينة)/.test(decision) || p.kind === 'قيد الدعوى')) add('noNextDate', p.date);
  if (next && next < today) add(reserved && !c.date ? 'judgmentPending' : 'notPosted', next);
  if (next && isWeekend(next)) add('weekend', next);
  if (next && valid(p.date) && next < p.date) add('backwards', next);
  return out;
}

export type Sitting = { c: CaseRecord; date: string; time: string; court: string; venue: string; last?: Procedure; required: string };
/** What the court asked for at the last sitting, for preparing the next one. */
export function requiredAction(p?: Procedure) {
  const d = p ? decisionOf(p) : '';
  if (!p) return 'الجلسة الأولى';
  if (/مستندات/.test(d)) return 'تقديم المستندات المطلوبة';
  if (/الاطلاع والرد/.test(d)) return 'إعداد المذكرة والرد';
  if (/إعلان/.test(d)) return 'متابعة إعلان الخصم';
  if (/شهود/.test(d)) return 'إحضار الشهود';
  if (/حجز للحكم|النطق/.test(d)) return 'حضور النطق بالحكم';
  if (/خبراء|معاينة|حضور الأطراف/.test(d)) return 'حضور جلسة الخبراء';
  return d || 'متابعة';
}
/** Sittings from `from` to `to` (inclusive), by date then court: the sessions roll and its follow-up. */
export function sittingsBetween(records: CaseRecord[], from: string, to: string): Sitting[] {
  return records.filter(live).flatMap(c => {
    const last = lastSitting(c), date = nextSitting(c);
    if (!date || date < from || date > to) return [];
    return [{ c, date, time: String(last?.nextTime || ''), court: String(last?.court || c.court || ''), venue: String(last?.venue || 'المحكمة'), last, required: requiredAction(last) }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.court.localeCompare(b.court) || a.time.localeCompare(b.time));
}

export type Judgment = { c: CaseRecord; level: string; date: string; outcome: string; ruling: string; caseNumber: string; court: string; current: boolean };
/** Every judgment issued, at every court level, between two dates (empty bounds are open). */
export function judgmentsBetween(records: CaseRecord[], from = '', to = ''): Judgment[] {
  const within = (d: string) => valid(d) && (!from || d >= from) && (!to || d <= to);
  return records.filter(isFiled).flatMap(c => {
    const stages = Array.isArray(c.stages) ? c.stages as Record<string, unknown>[] : [];
    const past = stages.filter(s => within(String(s.date || ''))).map(s => ({ c, level: String(s.level || ''), date: String(s.date), outcome: String(s.outcome || ''), ruling: String(s.ruling || ''), caseNumber: String(s.caseNumber || ''), court: String(s.court || ''), current: false }));
    const now = within(c.date) ? [{ c, level: String(c.stage || ''), date: c.date, outcome: c.outcome, ruling: c.ruling, caseNumber: c.caseNumber, court: c.court, current: true }] : [];
    return [...past, ...now];
  }).sort((a, b) => b.date.localeCompare(a.date));
}

/** A case stayed or struck off by the court, or marked stayed by hand, with why and since when. */
export function stayOf(c: CaseRecord): { reason: string; since: string; manual: boolean } | null {
  if (!live(c)) return null;
  if (c.stayed) return { reason: String(c.stayReason || 'موقوفة'), since: String(c.stayDate || ''), manual: true };
  const p = lastSitting(c), d = p ? decisionOf(p) : '';
  if (p && /^(وقف الدعوى|شطب الدعوى|انقطاع سير الخصومة)/.test(d)) return { reason: d, since: p.date, manual: false };
  return null;
}
/**
 * A struck-off case must be renewed within sixty days of the striking off or it lapses; a stayed case is renewed once
 * the stay ends. Returns the renewal reminder date for struck-off cases (a reminder only: the lawyer confirms it).
 */
export const renewalDeadline = (s: { reason: string; since: string }) => s.reason.startsWith('شطب') && valid(s.since) ? shiftDays(s.since, 60) : '';

/** Filed, open cases with no fee agreement recorded (القضايا بدون عقود). */
export const withoutContract = (records: CaseRecord[]) => records.filter(c => live(c) && !String(c.contractNumber || '').trim() && !c.contractWaived);

export type ConsultationStatus = 'new' | 'study' | 'answered' | 'closed';
export const CONSULTATION_STATUSES: [ConsultationStatus, string][] = [['new', 'جديدة'], ['study', 'قيد الدراسة'], ['answered', 'تم الرد'], ['closed', 'مغلقة']];
export const CONSULTATION_TYPES = ['شفهية', 'مكتوبة', 'مراجعة عقد', 'صياغة عقد', 'رأي قانوني', 'أخرى'];

/** The pages of the cases desk, with their sidebar label and a one-line description. */
export type DeskPage='posting'|'postingErrors'|'roll'|'followup'|'statements'|'consultations'|'judgments'|'noContract'|'study'|'stayed';
export const DESK_PAGES:[DeskPage,string,string][]=[
 ['posting','ترحيل الجلسات','سجّل قرار كل جلسة وموعد الجلسة التالية.'],
 ['postingErrors','أخطاء الترحيل','جلسات لم تُرحَّل، أو رُحّلت بموعد ناقص أو غير صحيح.'],
 ['roll','مواعيد الجلسات (رول)','جلسات الفترة مرتبة بالتاريخ والمحكمة، جاهزة للطباعة.'],
 ['followup','متابعة الجلسات','الجلسات القادمة وما طلبته المحكمة، والمكلف بحضورها.'],
 ['statements','كشوف القضايا','كشف قضايا موكل أو محامٍ أو محكمة، للطباعة أو الإرسال.'],
 ['consultations','الاستشارات','طلبات الرأي القانوني ومواعيد الرد عليها.'],
 ['judgments','الأحكام الصادرة','الأحكام الصادرة في فترة بكل درجات التقاضي، بما فيها الدرجات السابقة، للطباعة.'],
 ['noContract','القضايا بدون عقود','قضايا مفتوحة لم يُسجل لها عقد أتعاب.'],
 ['study','قضايا تحت الدراسة','قضايا قبل رفعها: الدراسة ثم القيد.'],
 ['stayed','القضايا الموقوفة','قضايا موقوفة أو مشطوبة، ومواعيد تجديدها.'],
];
