// «مهام اليوم والتقرير»: the day's missions of one person (or the whole team) taken from the cases and the office's
// work, and that person's daily report, which fills itself with what was done and takes the rest by hand.
import { caseCode, caseState, type CaseRecord, type Rules } from './domain.ts';
import { clientName } from './clients.ts';
import { normalizeSearch } from './case-browse.ts';
import { isFiled, isSessionEntry, lastSitting, nextSitting, shiftDays } from './case-desk.ts';
import type { Member, WorkItem } from './office.ts';

export type MissionKind = 'hearing' | 'task' | 'deadline' | 'followup';
export const MISSION_KINDS: Record<MissionKind, string> = { hearing: 'جلسة', task: 'مهمة', deadline: 'موعد طعن', followup: 'متابعة' };
export type Mission = {
  key: string; kind: MissionKind; date: string; time: string; title: string; sub: string; place: string;
  /** open: still to do on its day; late: its day has passed and it is still open; done: finished. */
  state: 'open' | 'late' | 'done'; result: string; c?: CaseRecord; work?: WorkItem; who: string;
};
/** Whose missions are shown: the signed-in person, one colleague, or everyone the account can see. */
export type Person = { id: string; username: string; displayName?: string } | 'all';

export type ReportLine = { key?: string; text: string; result: string };
export type DailyPayload = {
  hearings: ReportLine[]; tasks: ReportLine[]; admin: ReportLine[]; external: ReportLine[]; other: ReportLine[]; pending: ReportLine[]; notes: string;
};
/** The report's hand-written parts, in the order they are shown and printed. */
export const REPORT_PARTS: [Exclude<keyof DailyPayload, 'notes'>, string, string, string][] = [
  ['hearings', 'الجلسات التي حضرتها', 'القضية والمحكمة', 'القرار والجلسة التالية'],
  ['tasks', 'المهام المنجزة', 'المهمة', 'النتيجة'],
  ['admin', 'أعمال إدارية داخل المحاكم', 'العمل والجهة', 'النتيجة'],
  ['external', 'مراجعة جهات أخرى', 'الجهة والموضوع', 'النتيجة'],
  ['other', 'أعمال أخرى', 'العمل', 'النتيجة'],
  ['pending', 'متابعات معلقة', 'ما يحتاج متابعة', 'الموعد أو الملاحظة'],
];
export const emptyReport = (): DailyPayload => ({ hearings: [], tasks: [], admin: [], external: [], other: [], pending: [], notes: '' });
/** A stored payload read safely: missing or malformed parts come back empty. */
export function readReport(raw: unknown): DailyPayload {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, out = emptyReport();
  for (const [k] of REPORT_PARTS) {
    const list = Array.isArray(o[k]) ? o[k] as unknown[] : [];
    out[k] = list.filter(x => x && typeof x === 'object').map(x => { const l = x as Record<string, unknown>; return { ...(l.key ? { key: String(l.key) } : {}), text: String(l.text ?? ''), result: String(l.result ?? '') }; });
  }
  out.notes = typeof o.notes === 'string' ? o.notes : '';
  return out;
}
/** Lines with something written in them, and the payload without empty lines (what is saved). */
export const filledLines = (lines: ReportLine[]) => lines.filter(l => l.text.trim() || l.result.trim());
export const cleanReport = (r: DailyPayload): DailyPayload => ({ ...r, ...Object.fromEntries(REPORT_PARTS.map(([k]) => [k, filledLines(r[k])])), notes: r.notes.trim() });
export const reportCount = (r: DailyPayload) => REPORT_PARTS.reduce((n, [k]) => n + filledLines(r[k]).length, 0) + (r.notes.trim() ? 1 : 0);

const ref = (c: CaseRecord) => caseCode(c) || c.autoNumber || 'بلا كود';
const parties = (c: CaseRecord) => `${clientName(c) || '—'} ضد ${c.opponent || '—'}`;
export const memberLabel = (m?: { username: string; displayName?: string }) => m ? m.displayName || m.username : '';

/** Whether the lawyer named on a case is this person (by the name the office uses for them or their sign-in name). */
export function namesPerson(lawyer: string, m: { username: string; displayName?: string }) {
  const l = normalizeSearch(lawyer.trim());
  if (!l) return false;
  return [m.displayName || '', m.username].map(s => normalizeSearch(s.trim())).filter(s => s.length >= 3).some(n => n === l || (l.length >= 3 && (l.includes(n) || n.includes(l))));
}

type Input = {
  records: CaseRecord[]; work: WorkItem[]; members: Member[]; rules?: Rules; date: string; today: string; person: Person;
  /** The signed-in account sees only its own cases (لا كل القضايا): an unassigned sitting of those cases is theirs. */
  ownCasesOnly?: boolean; viewerId?: string;
};

/**
 * The missions of `date` for `person`. On today's date, sittings not posted and tasks not closed from the last two weeks
 * come in as late, so nothing slips. A sitting with someone assigned to attend belongs to that person; otherwise to the
 * lawyer named on the case.
 */
export function missionsFor({ records, work, members, rules, date, today, person, ownCasesOnly = false, viewerId = '' }: Input): Mission[] {
  const all = person === 'all', isToday = date === today, from = isToday ? shiftDays(date, -14) : date;
  const who = (id?: string) => memberLabel(members.find(m => m.id === id));
  const attendee = new Map<string, WorkItem>();
  for (const w of work) if (w.kind === 'hearing' && w.caseId && w.status !== 'cancelled') attendee.set(w.caseId + '|' + w.dueDate, w);
  const caseOwner = (c: CaseRecord, day: string): { mine: boolean; who: string } => {
    const w = attendee.get(c.id + '|' + day);
    if (w) return { mine: all || w.assigneeId === person.id, who: who(w.assigneeId) };
    const named = members.find(m => namesPerson(String(c.lawyer || ''), m));
    if (all) return { mine: true, who: named ? memberLabel(named) : String(c.lawyer || '') };
    return { mine: namesPerson(String(c.lawyer || ''), person) || (ownCasesOnly && person.id === viewerId && !named), who: memberLabel(person) };
  };
  const out: Mission[] = [];
  const live = records.filter(c => isFiled(c) && !c.archived);
  for (const c of live) {
    // Sittings: the one due that day (or overdue), and the one already posted that day.
    const next = nextSitting(c), last = lastSitting(c);
    if (next && next >= from && next <= date) {
      const o = caseOwner(c, next);
      if (o.mine) out.push({ key: 'h:' + c.id + ':' + next, kind: 'hearing', date: next, time: String(last?.nextTime || attendee.get(c.id + '|' + next)?.dueTime || ''), title: ref(c), sub: parties(c), place: String(last?.court || c.court || ''), state: next < today ? 'late' : 'open', result: '', c, who: o.who });
    }
    const posted = (c.procedures || []).filter(p => isSessionEntry(p) && p.date === date).at(-1);
    if (posted) {
      const o = caseOwner(c, date);
      if (o.mine) out.push({ key: 'h:' + c.id + ':' + date, kind: 'hearing', date, time: '', title: ref(c), sub: parties(c), place: String(posted.court || c.court || ''), state: 'done', result: [posted.decision || posted.text, posted.followup ? 'الجلسة التالية ' + posted.followup : ''].filter(Boolean).join(' · '), c, who: o.who });
    }
    // Follow-ups set on a procedure other than a sitting (a sitting's own next date is its posting).
    for (const p of c.procedures || []) if (!isSessionEntry(p) && p.kind !== 'قيد الدعوى' && p.followup === date) {
      const o = caseOwner(c, date);
      if (o.mine) out.push({ key: 'f:' + c.id + ':' + p.id, kind: 'followup', date, time: '', title: ref(c), sub: p.text || parties(c), place: '', state: 'open', result: '', c, who: o.who });
    }
    // Appeal deadlines: due within the warning days, or passed in the last week (still worth a look).
    const s = caseState(c, rules, date);
    if ((s.alert === 'خلال خمسة أيام' || (s.alert === 'انتهت المهلة' && (s.remaining ?? -99) >= -7)) && s.due) {
      const o = caseOwner(c, date);
      if (o.mine) out.push({ key: 'd:' + c.id, kind: 'deadline', date: String(s.due), time: '', title: ref(c), sub: parties(c), place: s.alert === 'انتهت المهلة' ? 'انتهت المهلة' : `يبقى ${s.remaining} يوم`, state: s.alert === 'انتهت المهلة' ? 'late' : 'open', result: '', c, who: o.who });
    }
  }
  const caseOf = new Map(records.map(c => [c.id, c]));
  for (const w of work) {
    if (w.status === 'cancelled' || !(all || w.assigneeId === person.id)) continue;
    // A sitting with its case at hand is already listed from the case.
    if (w.kind === 'hearing' && caseOf.has(w.caseId)) continue;
    const done = w.status === 'done', day = w.dueDate;
    if (done ? day !== date : !(day === date || (isToday && day >= from && day < date))) continue;
    const c = caseOf.get(w.caseId);
    out.push({ key: 'w:' + w.id, kind: 'task', date: day, time: w.dueTime, title: w.title, sub: c ? ref(c) + ' · ' + parties(c) : w.notes, place: w.location, state: done ? 'done' : day < date ? 'late' : 'open', result: w.completionNote, c, work: w, who: who(w.assigneeId) });
  }
  const rank = { late: 0, open: 1, done: 2 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || (a.time || '99').localeCompare(b.time || '99') || a.place.localeCompare(b.place) || a.title.localeCompare(b.title));
}

export type MissionFilter = 'all' | 'hearing' | 'task' | 'dates' | 'late';
export const MISSION_FILTERS: [MissionFilter, string][] = [['all', 'الكل'], ['hearing', 'جلسات'], ['task', 'مهام'], ['dates', 'مواعيد'], ['late', 'متأخرة']];
export const passesFilter = (m: Mission, f: MissionFilter) => f === 'all' || (f === 'late' ? m.state === 'late' : f === 'dates' ? m.kind === 'deadline' || m.kind === 'followup' : m.kind === f);

/**
 * The report with what was done added: each posted sitting and completed task once (by its key), so posting from the
 * page or from the case file both show up, and nothing written by hand is touched.
 */
export function withDone(report: DailyPayload, missions: Mission[]): DailyPayload {
  const have = new Set([...report.hearings, ...report.tasks].map(l => l.key).filter(Boolean));
  const add = (m: Mission) => ({ key: m.key, text: [m.title, m.kind === 'hearing' ? m.place : m.sub].filter(Boolean).join(' · '), result: m.result });
  const hearings = missions.filter(m => m.state === 'done' && m.kind === 'hearing' && !have.has(m.key)).map(add);
  const tasks = missions.filter(m => m.state === 'done' && m.kind === 'task' && !have.has(m.key)).map(add);
  if (!hearings.length && !tasks.length) return report;
  return { ...report, hearings: [...report.hearings, ...hearings], tasks: [...report.tasks, ...tasks] };
}

export type StoredReport = { userId: string; username: string; displayName: string; date: string; payload: unknown; submittedAt: string | null; updatedAt: string; revision: number };
/** Who has sent, who has a draft and who has written nothing, for the team view. */
export function teamStatus(expected: { userId: string; username: string; displayName: string }[], reports: StoredReport[], date: string) {
  const on = reports.filter(r => r.date === date), byUser = new Map(on.map(r => [r.userId, r]));
  const people = [...expected, ...on.filter(r => !expected.some(e => e.userId === r.userId)).map(r => ({ userId: r.userId, username: r.username, displayName: r.displayName }))];
  return people.map(p => { const r = byUser.get(p.userId); return { ...p, report: r, status: (r?.submittedAt ? 'sent' : r ? 'draft' : 'none') as 'sent' | 'draft' | 'none' }; })
    .sort((a, b) => ({ none: 0, draft: 1, sent: 2 })[a.status] - ({ none: 0, draft: 1, sent: 2 })[b.status] || (a.displayName || a.username).localeCompare(b.displayName || b.username, 'ar'));
}
export const STATUS_LABELS = { sent: 'أُرسل', draft: 'مسودة', none: 'لم يُكتب' } as const;

/** The report as plain text, to paste into a message. */
export function reportText(r: DailyPayload, name: string, date: string): string {
  const parts = [`التقرير اليومي — ${name} — ${date}`];
  for (const [k, title] of REPORT_PARTS) { const lines = filledLines(r[k]); if (lines.length) parts.push('', title + ':', ...lines.map((l, i) => `${i + 1}. ${l.text}${l.result.trim() ? ' — ' + l.result : ''}`)); }
  if (r.notes.trim()) parts.push('', 'ملاحظات:', r.notes.trim());
  return parts.join('\n');
}
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
/** One or more reports as a printable page (one report per page). */
export function reportsHtml(list: { name: string; date: string; payload: DailyPayload; sent: string }[], printedBy: string, printedAt: string): string {
  const one = (x: (typeof list)[number]) => {
    const body = REPORT_PARTS.map(([k, title, a, b]) => { const lines = filledLines(x.payload[k]); return lines.length ? `<h2>${esc(title)}</h2><table><thead><tr><th class="n">م</th><th>${esc(a)}</th><th>${esc(b)}</th></tr></thead><tbody>${lines.map((l, i) => `<tr><td class="n">${i + 1}</td><td>${esc(l.text)}</td><td>${esc(l.result)}</td></tr>`).join('')}</tbody></table>` : ''; }).join('');
    return `<section><header><h1>التقرير اليومي</h1><p><b>${esc(x.name)}</b> · ${esc(x.date)}${x.sent ? ' · ' + esc(x.sent) : ''}</p></header>${body || '<p class="empty">لم يُكتب شيء في هذا التقرير.</p>'}${x.payload.notes.trim() ? `<h2>ملاحظات</h2><p class="notes">${esc(x.payload.notes)}</p>` : ''}</section>`;
  };
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>التقرير اليومي</title><style>
@page{size:A4;margin:14mm}body{font-family:Arial,Tahoma,sans-serif;font-size:12.5px;color:#111;margin:0}section{page-break-after:always}section:last-of-type{page-break-after:auto}
header{border-bottom:2px solid #111;margin-bottom:8px}h1{font-size:18px;margin:0 0 2px}header p{margin:0 0 6px}h2{font-size:13.5px;margin:12px 0 4px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:4px 6px;text-align:right;vertical-align:top}th{background:#eee}.n{width:26px;text-align:center}
.notes{white-space:pre-wrap;border:1px solid #888;padding:6px}.empty{color:#666}footer{margin-top:10px;font-size:10.5px;color:#555}</style></head><body>${list.map(one).join('')}<footer>طُبع ${esc(printedAt)} · ${esc(printedBy)}</footer></body></html>`;
}
