// Court and expert sessions (الجلسات). Each session is kept in the case's procedure log for its court level,
// so closing a level keeps its sessions with it. The decision says what happens next: an adjournment brings
// the next session date, a reserved judgment the pronouncement date, a judgment closes the level's sessions.
import type { CaseRecord, Procedure } from './domain';

export const VENUES = ['المحكمة', 'إدارة الخبراء'] as const;
export type Venue = typeof VENUES[number];
export type Decision = { label: string; next: 'session' | 'judgment' | 'none'; experts?: boolean; judgment?: boolean };
export const DECISIONS: Decision[] = [
  { label: 'تأجيل للإعلان', next: 'session' },
  { label: 'تأجيل للاطلاع والرد', next: 'session' },
  { label: 'تأجيل لتقديم مستندات', next: 'session' },
  { label: 'تأجيل لسماع الشهود', next: 'session' },
  { label: 'تأجيل إداري', next: 'session' },
  { label: 'حجز للحكم', next: 'judgment' },
  { label: 'مد أجل النطق بالحكم', next: 'judgment' },
  { label: 'صدور الحكم', next: 'none', judgment: true },
  { label: 'إحالة إلى إدارة الخبراء', next: 'session', experts: true },
  { label: 'إعادة الدعوى من الخبراء', next: 'session' },
  { label: 'شطب الدعوى', next: 'none' },
  { label: 'وقف الدعوى', next: 'none' },
  { label: 'أخرى', next: 'session' },
];
export const EXPERT_DECISIONS: Decision[] = [
  { label: 'تأجيل لحضور الأطراف', next: 'session' },
  { label: 'تأجيل لتقديم مستندات', next: 'session' },
  { label: 'معاينة', next: 'session' },
  { label: 'إيداع التقرير', next: 'none' },
  { label: 'أخرى', next: 'session' },
];
export const decisionOf = (venue: string, label: string) => (venue === 'إدارة الخبراء' ? EXPERT_DECISIONS : DECISIONS).find(d => d.label === label);
export const isSession = (p: Procedure) => p.kind === 'جلسة' || p.kind === 'جلسة خبراء';

export type SessionInput = { date: string; venue: Venue; court: string; decision: string; details: string; nextDate: string; nextTime: string; recordedBy: string };
/** The procedure-log entry for a session. */
export function sessionProcedure(s: SessionInput, id = crypto.randomUUID()): Procedure {
  const d = decisionOf(s.venue, s.decision), next = d?.next === 'none' ? '' : s.nextDate;
  return {
    id, date: s.date, kind: s.venue === 'إدارة الخبراء' ? 'جلسة خبراء' : 'جلسة', venue: s.venue, court: s.court.trim(), decision: s.decision,
    text: [s.decision, s.details.trim()].filter(Boolean).join(' — '), followup: next, nextTime: next ? s.nextTime : '', recordedBy: s.recordedBy, source: 'إدخال يدوي',
  };
}
/** Title of the hearing created for the next session. */
export function nextSessionTitle(s: SessionInput, level: string, c: Pick<CaseRecord, 'code' | 'autoNumber'>) {
  const ref = c.code || c.autoNumber || '';
  const what = decisionOf(s.venue, s.decision)?.next === 'judgment' ? 'النطق بالحكم' : s.venue === 'إدارة الخبراء' || decisionOf(s.venue, s.decision)?.experts ? 'جلسة خبراء' : 'جلسة';
  return `${what} · ${level}${ref ? ' · ' + ref : ''}`;
}
/** Where the next session is held: a referral moves the case to the experts, a return brings it back to court. */
export function nextVenue(s: SessionInput): Venue {
  if (decisionOf(s.venue, s.decision)?.experts) return 'إدارة الخبراء';
  if (s.venue === 'إدارة الخبراء' && s.decision === 'إيداع التقرير') return 'المحكمة';
  return s.venue;
}
