// «مهام اليوم والتقرير»: the day's missions of one person (or the whole team) taken from the cases and the office's
// work, and that person's daily report, which fills itself with what was done and takes the rest by hand.
import { caseCode, caseState, formatDate, type CaseRecord, type Rules } from './domain.ts';
import { titled } from './staff-accounts.ts';
import { clientName } from './clients.ts';
import { normalizeSearch } from './case-browse.ts';
import { isFiled, isSessionEntry, lastSitting, nextSitting, shiftDays } from './case-desk.ts';
import type { Member, WorkItem } from './office.ts';
import { printFooter, printPage } from './print.ts';

export type MissionKind = 'hearing' | 'task' | 'deadline' | 'followup';
export const MISSION_KINDS: Record<MissionKind, string> = { hearing: 'جلسة', task: 'مهمة', deadline: 'موعد طعن', followup: 'متابعة' };
export type Mission = {
  key: string; kind: MissionKind; date: string; time: string; title: string; sub: string; place: string;
  /** open: still to do on its day; late: its day has passed and it is still open; done: finished. */
  state: 'open' | 'late' | 'done'; result: string; c?: CaseRecord; work?: WorkItem; who: string;
  /** A posted sitting's decision and what follows it, for its line in the report. */
  decision?: string; next?: string;
};
/** Whose missions are shown: the signed-in person, one colleague, or everyone the account can see. */
export type Person = { id: string; username: string; displayName?: string } | 'all';

export type LineField = 'text' | 'court' | 'subject' | 'result' | 'next';
/** `caseId`: the case a hearing line is about, picked by its code (lines that came from a posted sitting carry it in `key`). */
export type ReportLine = { key?: string; text: string; result: string; court?: string; subject?: string; next?: string; caseId?: string };
export type DailyPayload = {
  hearings: ReportLine[]; tasks: ReportLine[]; admin: ReportLine[]; external: ReportLine[]; other: ReportLine[]; pending: ReportLine[]; notes: string;
};
export type ReportPart = Exclude<keyof DailyPayload, 'notes'>;
/**
 * The report's parts in the order they are filled, shown and printed (the office's daily-work form): what each holds,
 * and the fields of each line. Sittings posted and tasks closed from «المهام» come in by themselves.
 */
export const REPORT_PARTS: { key: ReportPart; title: string; hint: string; add: string; fields: [LineField, string][] }[] = [
  { key: 'hearings', title: 'الجلسات التي تم حضورها', hint: 'كل جلسة ترحّلها من القائمة تُضاف هنا بنفسها، أو أضفها يدوياً بالزر أدناه.', add: 'إضافة جلسة',
    fields: [['text', 'كود القضية'], ['court', 'المحكمة / الدائرة'], ['result', 'ما تم في الجلسة / القرار'], ['next', 'الإجراء المطلوب بعد الجلسة']] },
  { key: 'tasks', title: 'المهام المنجزة', hint: 'كل مهمة تُتمّها من القائمة تُضاف هنا بنفسها، أو أضفها يدوياً بالزر أدناه.', add: 'إضافة مهمة', fields: [['text', 'المهمة'], ['result', 'النتيجة']] },
  { key: 'admin', title: 'الأعمال الإدارية داخل المحاكم', hint: 'مثل الإعلانات، الإيداعات، استخراج الشهادات، متابعة الخبراء، مراجعة التنفيذ أو أقسام المحكمة.', add: 'إضافة عمل إداري',
    fields: [['text', 'العمل المنجز ورقم الملف'], ['result', 'النتيجة أو الإجراء المتخذ']] },
  { key: 'external', title: 'الأعمال والمراجعات الخارجية', hint: 'الوزارات، المخافر، النيابات، الجهات الحكومية وغيرها.', add: 'إضافة مراجعة',
    fields: [['text', 'الجهة التي تمت مراجعتها'], ['subject', 'موضوع المراجعة / رقم الملف'], ['result', 'النتيجة']] },
  { key: 'other', title: 'أعمال أخرى', hint: 'مثل الاجتماعات مع الموكلين، الاتصالات المهمة، أو إعداد مذكرات ومستندات قانونية.', add: 'إضافة عمل', fields: [['text', 'العمل المنجز'], ['result', 'النتيجة']] },
  { key: 'pending', title: 'الأعمال المعلقة والمتابعة المطلوبة', hint: 'رقم الملف، المطلوب، والموعد أو الشخص المسؤول عن المتابعة.', add: 'إضافة متابعة',
    fields: [['text', 'رقم الملف والمطلوب'], ['result', 'الموعد أو المسؤول عن المتابعة']] },
];
export const NOTES = { title: 'ملاحظات أو معوقات', hint: 'أي ملاحظة تستدعي تدخل المسؤول أو التنسيق مع الإداريين.' };
export const ORDINALS = ['أولاً', 'ثانياً', 'ثالثاً', 'رابعاً', 'خامساً', 'سادساً', 'سابعاً', 'ثامناً'];
const EXTRA: LineField[] = ['court', 'subject', 'next'];
export const emptyReport = (): DailyPayload => ({ hearings: [], tasks: [], admin: [], external: [], other: [], pending: [], notes: '' });
/** A stored payload read safely: missing or malformed parts come back empty; reports saved before the extra fields read as they were. */
export function readReport(raw: unknown): DailyPayload {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, out = emptyReport();
  for (const { key } of REPORT_PARTS) {
    const list = Array.isArray(o[key]) ? o[key] as unknown[] : [];
    out[key] = list.filter(x => x && typeof x === 'object').map(x => {
      const l = x as Record<string, unknown>, line: ReportLine = { ...(l.key ? { key: String(l.key) } : {}), text: String(l.text ?? ''), result: String(l.result ?? '') };
      for (const f of EXTRA) if (typeof l[f] === 'string' && (l[f] as string) !== '') line[f] = l[f] as string;
      if (typeof l.caseId === 'string' && l.caseId) line.caseId = l.caseId;
      return line;
    });
  }
  out.notes = typeof o.notes === 'string' ? o.notes : '';
  return out;
}
const lineValues = (l: ReportLine) => [l.text, l.court, l.subject, l.result, l.next].map(v => (v || '').trim());
/** Lines with something written in them, and the payload without empty lines (what is saved). */
export const filledLines = (lines: ReportLine[]) => lines.filter(l => lineValues(l).some(Boolean));
export const cleanReport = (r: DailyPayload): DailyPayload => ({ ...r, ...Object.fromEntries(REPORT_PARTS.map(({ key }) => [key, filledLines(r[key])])), notes: r.notes.trim() });
export const reportCount = (r: DailyPayload) => REPORT_PARTS.reduce((n, { key }) => n + filledLines(r[key]).length, 0) + (r.notes.trim() ? 1 : 0);
/** «ملخص اليوم»: how many of each the report holds. */
export const daySummary = (r: DailyPayload) => Object.fromEntries(REPORT_PARTS.map(({ key }) => [key, filledLines(r[key]).length])) as Record<ReportPart, number>;
/** A line as one piece of text, its fields in the part's order. */
export const lineText = (l: ReportLine, part: ReportPart) => (REPORT_PARTS.find(x => x.key === part)!.fields.map(([f]) => (l[f] || '').trim()).filter(Boolean)).join(' — ');

export const ref = (c: CaseRecord) => caseCode(c) || c.autoNumber || 'بلا كود';
const parties = (c: CaseRecord) => `${clientName(c) || '—'} ضد ${c.opponent || '—'}`;
// Names show with «أ/» before them, added here (the names themselves are kept plain).
export const memberLabel = (m?: { username: string; displayName?: string }) => m ? (m.displayName ? titled(m.displayName) : m.username) : '';

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
/** Whose a case's sitting on `day` is: the colleague assigned to attend it, else the lawyer named on the case. */
function ownerOf(work: WorkItem[], members: Member[], person: Person, ownCasesOnly: boolean, viewerId: string) {
  const all = person === 'all', who = (id?: string) => memberLabel(members.find(m => m.id === id));
  const attendee = new Map<string, WorkItem>();
  for (const w of work) if (w.kind === 'hearing' && w.caseId && w.status !== 'cancelled') attendee.set(w.caseId + '|' + w.dueDate, w);
  return (c: CaseRecord, day: string): { mine: boolean; who: string } => {
    const w = attendee.get(c.id + '|' + day);
    if (w) return { mine: all || w.assigneeId === (person as Exclude<Person, 'all'>).id, who: who(w.assigneeId) };
    const named = members.find(m => namesPerson(String(c.lawyer || ''), m));
    if (person === 'all') return { mine: true, who: named ? memberLabel(named) : String(c.lawyer || '') };
    return { mine: namesPerson(String(c.lawyer || ''), person) || (ownCasesOnly && person.id === viewerId && !named), who: memberLabel(person) };
  };
}

export function missionsFor({ records, work, members, rules, date, today, person, ownCasesOnly = false, viewerId = '' }: Input): Mission[] {
  const all = person === 'all', isToday = date === today, from = isToday ? shiftDays(date, -14) : date;
  const who = (id?: string) => memberLabel(members.find(m => m.id === id));
  const attendee = new Map<string, WorkItem>();
  for (const w of work) if (w.kind === 'hearing' && w.caseId && w.status !== 'cancelled') attendee.set(w.caseId + '|' + w.dueDate, w);
  const caseOwner = ownerOf(work, members, person, ownCasesOnly, viewerId);
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
      const decision = String(posted.text || posted.decision || ''), next = posted.followup ? 'الجلسة القادمة ' + formatDate(posted.followup) : '';
      if (o.mine) out.push({ key: 'h:' + c.id + ':' + date, kind: 'hearing', date, time: '', title: ref(c), sub: parties(c), place: String(posted.court || c.court || ''), state: 'done', result: [decision, next].filter(Boolean).join(' · '), decision, next, c, who: o.who });
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
  const add = (m: Mission): ReportLine => m.kind === 'hearing'
    ? { key: m.key, text: m.title, court: m.place, result: m.decision ?? m.result, next: m.next || '' }
    : { key: m.key, text: m.title, result: m.result };
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
/** One row of «الفريق اليوم»: the person's report, the day's sittings and tasks (done of all), and what is late now. */
export type TeamDayRow = {
  userId: string; username: string; name: string; status: 'sent' | 'draft' | 'none'; report?: StoredReport; items: number;
  hearings: number; hearingsDone: number; tasks: number; tasksDone: number; late: number;
};
export function teamDay({ expected, reports, date, today, records, work, members, rules }: {
  expected: { userId: string; username: string; displayName: string }[]; reports: StoredReport[]; date: string; today: string;
  records: CaseRecord[]; work: WorkItem[]; members: Member[]; rules?: Rules;
}): TeamDayRow[] {
  return teamStatus(expected, reports, date).map(t => {
    const member = members.find(m => m.id === t.userId);
    const all = member ? missionsFor({ records, work, members, rules, date, today, person: member, viewerId: t.userId }) : [];
    const on = all.filter(m => m.date === date), h = on.filter(m => m.kind === 'hearing'), k = on.filter(m => m.kind === 'task');
    return {
      userId: t.userId, username: t.username, name: t.displayName ? titled(t.displayName) : t.username, status: t.status, report: t.report,
      items: t.report ? reportCount(readReport(t.report.payload)) : 0,
      hearings: h.length, hearingsDone: h.filter(m => m.state === 'done').length, tasks: k.length, tasksDone: k.filter(m => m.state === 'done').length,
      late: all.filter(m => m.state === 'late').length,
    };
  });
}

/** The report as plain text, to paste into a message. */
export function reportText(r: DailyPayload, name: string, date: string): string {
  const parts = [`تقرير الأعمال اليومية — ${name} — ${date}`], sum = daySummary(r);
  REPORT_PARTS.forEach(({ key, title }, n) => { const lines = filledLines(r[key]); if (lines.length) parts.push('', `${ORDINALS[n]}: ${title}`, ...lines.map((l, i) => `${i + 1}. ${lineText(l, key)}`)); });
  if (r.notes.trim()) parts.push('', `${ORDINALS[REPORT_PARTS.length]}: ${NOTES.title}`, r.notes.trim());
  parts.push('', `ملخص اليوم: ${sum.hearings} جلسات · ${sum.admin} أعمال إدارية · ${sum.external} مراجعات خارجية · ${sum.tasks} مهام`);
  return parts.join('\n');
}
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
/** One or more reports as a printable page (one report per page). */
export function reportsHtml(list: { name: string; date: string; payload: DailyPayload; sent: string }[], _printedBy: string, printedAt: string): string {
  const one = (x: (typeof list)[number]) => {
    const body = REPORT_PARTS.map(({ key, title, fields }, n) => {
      const lines = filledLines(x.payload[key]);
      return lines.length ? `<h2>${ORDINALS[n]}: ${esc(title)}</h2><table class="list"><thead><tr><th class="n">م</th>${fields.map(([, label]) => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${lines.map((l, i) => `<tr><td class="n">${i + 1}</td>${fields.map(([f]) => `<td>${esc(l[f] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
    }).join('');
    const sum = daySummary(x.payload), tiles = ([['جلسات', sum.hearings], ['أعمال إدارية', sum.admin], ['مراجعات خارجية', sum.external], ['مهام منجزة', sum.tasks]] as [string, number][]).map(([l, v]) => `<div><b>${v}</b>${l}</div>`).join('');
    const status = x.sent ? `<span class="chip ${x.sent.startsWith('أُرسل') ? 'ok' : 'draft'}">${esc(x.sent)}</span>` : '';
    return `<section class="report"><header><h1>تقرير الأعمال اليومية</h1><p><b>${esc(x.name)}</b> · ${esc(x.date)} ${status}</p></header><div class="tiles">${tiles}</div>${body || '<p class="empty">لم يُكتب شيء في هذا التقرير.</p>'}${x.payload.notes.trim() ? `<h2>${ORDINALS[REPORT_PARTS.length]}: ${esc(NOTES.title)}</h2><p class="notes">${esc(x.payload.notes)}</p>` : ''}</section>`;
  };
  const style = `<style>.report+.report{break-before:page}.n{width:28px;text-align:center}.tiles{display:flex;gap:8px;margin:2px 0 6px}.tiles div{flex:1;border:1px solid #e3d8ca;border-radius:6px;padding:6px 4px;text-align:center;background:#fbf8f3;color:#76645a;font-size:11px}.tiles b{display:block;font-size:17px;color:#6e1f33;line-height:1.3}
.chip{display:inline-block;border-radius:999px;padding:0 9px;font-size:10.5px;margin-inline-start:4px}.chip.ok{background:#e6f1ea;color:#2f6b4f}.chip.draft{background:#f6ecd8;color:#8a5a1a}.notes{white-space:pre-wrap;border:1px solid #e3d8ca;border-radius:6px;padding:6px 8px;margin:0}.empty{color:#8a7a70}</style>`;
  return printPage('تقرير الأعمال اليومية', style + list.map(one).join('') + printFooter(printedAt));
}

type Range = Omit<Input, 'date'>;
/**
 * Deadlines and follow-ups from a week back to `days` ahead, for «المواعيد»: appeal deadlines (passed in the last week,
 * due soon or later in the period) and follow-up dates set on procedures, nearest first.
 */
export function datesAhead({ records, work, members, rules, today, person, ownCasesOnly = false, viewerId = '' }: Range, days = 30): Mission[] {
  const owner = ownerOf(work, members, person, ownCasesOnly, viewerId), from = shiftDays(today, -7), to = shiftDays(today, days), out: Mission[] = [];
  for (const c of records) {
    if (!isFiled(c) || c.archived) continue;
    const s = caseState(c, rules, today), due = String(s.due || '');
    if (due && due >= from && due <= to && s.alert !== 'تم اتخاذ الإجراء' && s.alert !== 'ملف منتهي' && s.alert !== 'نهائي') {
      const o = owner(c, today);
      if (o.mine) out.push({ key: 'd:' + c.id, kind: 'deadline', date: due, time: '', title: ref(c), sub: parties(c), place: due < today ? 'انتهت المهلة' : `يبقى ${s.remaining} يوم`, state: due < today ? 'late' : 'open', result: '', c, who: o.who });
    }
    for (const p of c.procedures || []) if (!isSessionEntry(p) && p.kind !== 'قيد الدعوى' && p.followup && p.followup >= from && p.followup <= to) {
      const o = owner(c, p.followup);
      if (o.mine) out.push({ key: 'f:' + c.id + ':' + p.id, kind: 'followup', date: p.followup, time: '', title: ref(c), sub: p.text || parties(c), place: '', state: p.followup < today ? 'late' : 'open', result: '', c, who: o.who });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
export type DatesFilter = 'all' | 'late' | 'week' | 'deadline' | 'followup';
export const DATES_FILTERS: [DatesFilter, string][] = [['all', 'الكل'], ['late', 'فائتة'], ['week', 'خلال أسبوع'], ['deadline', 'مواعيد الطعن'], ['followup', 'المتابعات']];
export const passesDates = (m: Mission, f: DatesFilter, today: string) => f === 'all' || (f === 'late' ? m.state === 'late' : f === 'week' ? m.date >= today && m.date <= shiftDays(today, 7) : m.kind === f);

export type AgendaDay = { hearings: number; tasks: number; done: number; items: { kind: MissionKind; title: string; done: boolean }[] };
/** Each day's sittings and tasks between two dates, for «التقويم»: sittings due or posted that day, and dated tasks. */
export function agendaBetween({ records, work, members, person, ownCasesOnly = false, viewerId = '' }: Range, from: string, to: string): Map<string, AgendaDay> {
  const owner = ownerOf(work, members, person, ownCasesOnly, viewerId), days = new Map<string, AgendaDay>();
  const day = (d: string) => { let v = days.get(d); if (!v) days.set(d, v = { hearings: 0, tasks: 0, done: 0, items: [] }); return v; };
  const caseIds = new Set<string>();
  for (const c of records) {
    if (!isFiled(c) || c.archived) continue;
    caseIds.add(c.id);
    const next = nextSitting(c);
    if (next && next >= from && next <= to && owner(c, next).mine) { const v = day(next); v.hearings++; v.items.push({ kind: 'hearing', title: ref(c), done: false }); }
    for (const p of c.procedures || []) if (isSessionEntry(p) && p.date >= from && p.date <= to && owner(c, p.date).mine) { const v = day(p.date); v.hearings++; v.done++; v.items.push({ kind: 'hearing', title: ref(c), done: true }); }
  }
  for (const w of work) {
    if (w.status === 'cancelled' || !w.dueDate || w.dueDate < from || w.dueDate > to || (w.kind === 'hearing' && caseIds.has(w.caseId))) continue;
    if (person !== 'all' && w.assigneeId !== person.id) continue;
    const v = day(w.dueDate); v.tasks++; if (w.status === 'done') v.done++; v.items.push({ kind: 'task', title: w.title, done: w.status === 'done' });
  }
  return days;
}

/** The date in Kuwait of a moment, for «sent the same day». */
const kuwaitDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait' }).format(new Date(iso));
export type PersonStats = {
  userId: string; name: string; workDays: number; sent: number; sameDay: number; drafts: number;
  hearings: number; tasks: number; admin: number; external: number; other: number; posted: number; lateNow: number; lastSent: string | null;
};
/**
 * «الأداء»: each person's work over a period — reports sent against working days (Friday and Saturday off), sent the
 * same day, what the reports hold, sittings they posted in the cases themselves, and what is overdue for them now.
 */
export function performance({ people, reports, from, to, today, records, work, members, rules }: {
  people: { userId: string; username: string; displayName: string }[]; reports: StoredReport[]; from: string; to: string; today: string;
  records: CaseRecord[]; work: WorkItem[]; members: Member[]; rules?: Rules;
}): PersonStats[] {
  let workDays = 0;
  for (let d = from; d <= (to < today ? to : today); d = shiftDays(d, 1)) if (![5, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) workDays++;
  const everyone = [...people, ...reports.filter(r => !people.some(p => p.userId === r.userId)).map(r => ({ userId: r.userId, username: r.username, displayName: r.displayName }))]
    .filter((p, i, a) => a.findIndex(x => x.userId === p.userId) === i);
  // Sittings posted in the period, by the account that recorded them.
  const posted = new Map<string, number>();
  for (const c of records) for (const p of c.procedures || []) if (isSessionEntry(p) && p.recordedBy && p.date >= from && p.date <= to) posted.set(p.recordedBy, (posted.get(p.recordedBy) || 0) + 1);
  return everyone.map(p => {
    const mine = reports.filter(r => r.userId === p.userId && r.date >= from && r.date <= to), sent = mine.filter(r => r.submittedAt);
    const sum = mine.reduce((t, r) => { const s = daySummary(readReport(r.payload)); for (const k of Object.keys(t) as ReportPart[]) t[k] += s[k]; return t; }, { hearings: 0, tasks: 0, admin: 0, external: 0, other: 0, pending: 0 } as Record<ReportPart, number>);
    const member = members.find(m => m.id === p.userId);
    const lateNow = member ? missionsFor({ records, work, members, rules, date: today, today, person: member, viewerId: p.userId }).filter(m => m.state === 'late').length : 0;
    return {
      userId: p.userId, name: p.displayName ? titled(p.displayName) : p.username, workDays, sent: sent.length, sameDay: sent.filter(r => kuwaitDay(r.submittedAt!) === r.date).length, drafts: mine.length - sent.length,
      hearings: sum.hearings, tasks: sum.tasks, admin: sum.admin, external: sum.external, other: sum.other, posted: posted.get(p.username) || 0, lateNow,
      lastSent: sent.map(r => r.submittedAt!).sort().at(-1) || null,
    };
  }).sort((a, b) => b.sent - a.sent || a.name.localeCompare(b.name, 'ar'));
}
/** The periods offered for «الأداء»: this week (Sunday to Thursday in Kuwait), this month, last month, the last 30 days. */
export function periods(today: string): [string, string, string, string][] {
  const dow = new Date(today + 'T12:00:00Z').getUTCDay(), sunday = shiftDays(today, -dow), month = today.slice(0, 7) + '-01';
  const lastEnd = shiftDays(month, -1), lastStart = lastEnd.slice(0, 7) + '-01';
  return [['week', 'هذا الأسبوع', sunday, today], ['month', 'هذا الشهر', month, today], ['last', 'الشهر الماضي', lastStart, lastEnd], ['30', 'آخر 30 يوماً', shiftDays(today, -29), today]];
}
/** «الأداء» as a printable page. */
export function performanceHtml(rows: PersonStats[], period: string, _printedBy: string, printedAt: string): string {
  const head = ['المحامي', 'التقارير المرسلة من أيام العمل', 'أُرسلت في يومها', 'مسودات', 'جلسات حضرها', 'جلسات رحّلها', 'أعمال إدارية', 'مراجعات خارجية', 'مهام منجزة', 'متأخر الآن'];
  const cell = (v: number, extra = '') => `<td class="num${v ? '' : ' zero'}${extra}">${v}</td>`;
  const body = rows.map(r => `<tr><td class="who">${esc(r.name)}</td><td class="num"><b>${r.sent}</b> <span class="of">من ${r.workDays}</span></td>${cell(r.sameDay)}${cell(r.drafts)}${cell(r.hearings)}${cell(r.posted)}${cell(r.admin)}${cell(r.external)}${cell(r.tasks)}${cell(r.lateNow, r.lateNow ? ' late' : '')}</tr>`).join('');
  const days = rows[0]?.workDays ?? 0;
  const style = `<style>.perf thead th{text-align:center;white-space:normal;line-height:1.35;vertical-align:middle}.perf td.num{text-align:center;font-variant-numeric:tabular-nums;vertical-align:middle}.perf td.who{font-weight:700;white-space:nowrap;vertical-align:middle}
.perf .zero{color:#bcaea3}.perf .late{color:#a32e38;font-weight:700}.perf .of{color:#8a7568;font-size:.9em}.legend{margin:10px 0 0;font-size:10.5px;color:#76645a;line-height:1.8}</style>`;
  return printPage('أداء الفريق', `${style}<header><h1>أداء الفريق</h1><p>${esc(period)} · أيام العمل في الفترة: ${days} (الجمعة والسبت عطلة)</p></header>
<table class="list perf"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}">لا أحد مكلف بالتقرير اليومي.</td></tr>`}</tbody></table>
<p class="legend">جلسات حضرها: المذكورة في تقاريره. جلسات رحّلها: المسجّلة في ملفات القضايا. متأخر الآن: جلسات لم تُرحَّل ومهام فات موعدها حتى يوم الطباعة.</p>${printFooter(printedAt)}`, true);
}

/** The case a hearing line is about: the one picked for it, or the one its posted sitting came from. */
export const lineCase = (l: ReportLine) => l.caseId || /^h:(.+):\d{4}-\d{2}-\d{2}$/.exec(l.key || '')?.[1] || '';
