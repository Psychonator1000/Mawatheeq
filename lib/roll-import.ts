// The court roll report («رول الجلسات», LegalRollReport.xls): one block of rows per hearing, grouped here by case.
// Each block holds the case (court, level, circuit, automatic number, case number, parties) and three sessions: the
// previous one, this one (its date and purpose) and, once it was held, the next one (its date and what it was
// adjourned for). The database import (local request «import_roll») matches cases by automatic number only.
import { emptyCase, type CaseRecord, type Procedure } from './domain';
import type { Level } from './case-stages';
import { decisionOf } from './sessions';
import { joinCircuit } from './circuits';

export type RollHearing = {
  seq: string; date: string; time: string; order: string; expert: boolean;
  purpose: string; outcome: string; nextDate: string; prevDate: string; prevPurpose: string;
  place: string; expertName: string; expertRoom: string;
};
export type RollCase = {
  autoNumber: string; special: string; fileNumber: string; client: string; opponent: string; role: string;
  caseNumber: string; building: string; level: Level | ''; circuit: string; floor: string; room: string;
  subject: string; lawyer: string; caseType: string; status: string; hearings: RollHearing[];
};
export type RollParse = { cases: RollCase[]; hearings: number; withoutNumber: { seq: string; date: string; client: string }[] };

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
/** dd/mm/yyyy to yyyy-mm-dd; anything else is ''. */
export function rollDate(v: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(v));
  if (!m) return '';
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? '' : iso;
}
const time = (v: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(clean(v)); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };
const LEVEL: Record<string, Level> = { 'ابتدائى': 'ابتدائي', 'ابتدائي': 'ابتدائي', 'استئناف': 'استئناف', 'تمييز': 'تمييز' };
export const rollLevel = (v: string): Level | '' => LEVEL[clean(v).replace(/^[إأ]/, 'ا')] || '';
const ROLES: [RegExp, string][] = [
  [/^مدع[يى]?\s*عل[يى]ه?(ا|م|ما|هما)?$/, 'مدعى عليه'], [/^مدع(ى|ي|يه|ية)$/, 'مدعي'], [/^مست[أا]نف(ة|ه)?\s*ضد(ه|ها|هم|هما)?$/, 'مستأنف ضده'],
  [/^مست[أا]نف(ة|ه)?$/, 'مستأنف'], [/^مطعون\s*ضد/, 'مطعون ضده'], [/^طاعن/, 'طاعن'], [/^متظلم\s*ضد/, 'متظلم ضده'], [/^متظلم/, 'متظلم'],
  [/^متهم/, 'متهم'], [/^شاك/, 'شاكي'], [/^مجن[يى] عليه/, 'مجني عليه'],
];
/** The roll's party role in the app's wording; unknown roles are kept as written. */
export const rollRole = (v: string) => { const t = clean(v); return ROLES.find(([r]) => r.test(t))?.[1] || t; };

/**
 * Reads the report's rows (as text). A hearing block starts at the row that carries the sequence number and the
 * venue («محكمة» or «خبراء»); the two rows after it hold the session and the next session, and expert sessions add a
 * row for the expert and one for the time and order on the roll.
 */
export function parseRollRows(raw: unknown[][]): RollParse {
  const rows = raw.map(r => (r || []).map(clean));
  const starts: number[] = [];
  rows.forEach((r, i) => { if (/^\d+$/.test(r[80] || '') && /^(محكمة|خبراء)$/.test(r[76] || '')) starts.push(i); });
  if (!starts.length) throw new Error('لم يُعثر على جلسات في الملف. تأكد أنه تقرير «رول الجلسات» كما يُصدر من البرنامج.');
  const skip = (r: string[]) => !r.some(Boolean) || /رول الجلس|الصفحة|DevExpress/.test(r.join(' ')) || r[24] === 'المحكمة' || r[0] === 'رقم الملف' || /^\d{4}\/\d{2}\/\d{2}$/.test(r[74] || '');
  const byCase = new Map<string, RollCase>(); const withoutNumber: RollParse['withoutNumber'] = []; let hearings = 0;
  starts.forEach((start, k) => {
    const lines = rows.slice(start, starts[k + 1] ?? rows.length).filter(r => !skip(r));
    const [A = [], B = [], C = [], ...rest] = lines; const g = (r: string[], j: number) => r[j] || '';
    let t = '', order = '', expertName = '', expertRoom = '';
    for (const r of rest) {
      if (g(r, 7) === 'الساعة:') { t = time(g(r, 3)); order = g(r, 12); }
      if (g(r, 23) === 'رقم القاعة:') { expertRoom = g(r, 19); expertName = g(r, 70); }
    }
    const date = rollDate(g(B, 21)); if (!date) return;
    const expert = g(A, 76) === 'خبراء';
    const fileNumber = [g(A, 0), g(C, 0)].find(v => /^\d{3,}$/.test(v) && !/^[1-4]007$/.test(v)) || '';
    const c: RollCase = {
      autoNumber: g(A, 55).replace(/\D/g, ''), special: g(B, 29).replace(/\D/g, ''), fileNumber,
      client: g(B, 68), opponent: g(C, 68), role: rollRole(g(B, 61)), caseNumber: g(C, 59),
      building: g(A, 26), level: rollLevel(g(A, 30)), circuit: g(A, 69), floor: g(A, 39), room: g(A, 41),
      subject: g(B, 43), lawyer: g(B, 0), caseType: g(C, 46), status: g(C, 31), hearings: [],
    };
    // The circuit number sits beside the circuit's kind.
    c.circuit = joinCircuit({ kind: c.circuit, number: g(A, 64), floor: c.floor });
    const h: RollHearing = {
      seq: g(A, 80), date, time: t, order, expert, purpose: g(B, 8), outcome: g(C, 8), nextDate: rollDate(g(C, 21)),
      prevDate: rollDate(g(A, 21)), prevPurpose: g(A, 8), place: [c.building, c.circuit, c.room && 'غرفة ' + c.room].filter(Boolean).join(' · '),
      expertName, expertRoom,
    };
    hearings++;
    if (!c.autoNumber) { withoutNumber.push({ seq: h.seq, date, client: c.client }); return; }
    const known = byCase.get(c.autoNumber);
    if (known) known.hearings.push(h);
    else byCase.set(c.autoNumber, { ...c, hearings: [h] });
  });
  for (const c of byCase.values()) c.hearings.sort((a, b) => a.date.localeCompare(b.date));
  return { cases: [...byCase.values()], hearings, withoutNumber };
}

export async function readRoll(file: File): Promise<RollParse> {
  const xlsx = await import('xlsx'); const X = (xlsx as unknown as { default?: typeof xlsx }).default || xlsx;
  const book = X.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheet = book.Sheets[book.SheetNames[0]];
  return parseRollRows(X.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' }));
}

/** The decision on the app's list that an adjournment reason reads as; the roll's own words stay in the details. */
export function rollDecision(outcome: string, expert: boolean): string {
  const t = outcome.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
  if (expert) {
    if (/مستند|حافظ/.test(t)) return 'تأجيل لتقديم مستندات';
    if (/معاين/.test(t)) return 'معاينة';
    if (/حضور|الاطراف/.test(t)) return 'تأجيل لحضور الأطراف';
    return 'أخرى';
  }
  if (/مد اجل/.test(t)) return 'مد أجل النطق بالحكم';
  if (/حكم|النطق/.test(t)) return 'حجز للحكم';
  if (/شطب/.test(t)) return 'شطب الدعوى';
  if (/^وقف|وقف الدعو/.test(t)) return 'وقف الدعوى';
  if (/خبير|خبراء/.test(t)) return 'إحالة إلى إدارة الخبراء';
  if (/اعلان|اخطار/.test(t)) return 'تأجيل للإعلان';
  if (/اطلاع|للرد|الرد|مذكر/.test(t)) return 'تأجيل للاطلاع والرد';
  if (/مستند|حافظ|تقديم/.test(t)) return 'تأجيل لتقديم مستندات';
  if (/شهود|شاهد|سماع/.test(t)) return 'تأجيل لسماع الشهود';
  return 'تأجيل إداري';
}

/** Sessions held before today, as entries for the case's session log (the roll gives what each was adjourned to). */
export function rollSessions(c: RollCase, today: string): Procedure[] {
  return c.hearings.filter(h => h.date < today && h.nextDate).map(h => {
    const venue = h.expert ? 'إدارة الخبراء' : 'المحكمة', decision = rollDecision(h.outcome, h.expert);
    const next = decisionOf(venue, decision)?.next === 'none' ? '' : h.nextDate;
    return {
      id: `roll-${c.autoNumber}-${h.date}`, date: h.date, kind: h.expert ? 'جلسة خبراء' : 'جلسة', venue,
      court: h.expert ? [h.expertName, h.expertRoom && 'قاعة ' + h.expertRoom].filter(Boolean).join(' · ') : c.circuit,
      decision, text: decision === 'أخرى' ? h.outcome || decision : [decision, h.outcome].filter(Boolean).join(' — '), followup: next, nextTime: '', recordedBy: 'رول الجلسات', source: 'رول الجلسات',
    };
  });
}

export type RollAppointment = { dueDate: string; dueTime: string; title: string; location: string; notes: string };
/** Hearings from today on: sessions on the roll still to come, and the next session of each one already held. */
export function rollUpcoming(c: RollCase, today: string, ref: string): RollAppointment[] {
  const out = new Map<string, RollAppointment>(); const level = c.level === 'استئناف' ? 'الاستئناف' : c.level === 'تمييز' ? 'التمييز' : 'أول درجة';
  const title = (expert: boolean, judgment: boolean) => `${judgment ? 'النطق بالحكم' : expert ? 'جلسة خبراء' : 'جلسة'} · ${level}${ref ? ' · ' + ref : ''}`;
  for (const h of c.hearings) {
    if (h.date >= today) out.set(h.date, { dueDate: h.date, dueTime: h.time, title: title(h.expert, /حكم|النطق/.test(h.purpose)),
      location: h.expert ? ['إدارة الخبراء', h.expertName, h.expertRoom && 'قاعة ' + h.expertRoom].filter(Boolean).join(' · ') : h.place,
      notes: ['من رول الجلسات', h.purpose && 'الغرض: ' + h.purpose, h.order && 'رقم الدور: ' + h.order].filter(Boolean).join(' · ') });
    else if (h.nextDate >= today && !out.has(h.nextDate)) {
      const expertNext = h.expert && !/محكم/.test(h.outcome);
      out.set(h.nextDate, { dueDate: h.nextDate, dueTime: '', title: title(expertNext, /حكم|النطق/.test(h.outcome)),
        location: expertNext ? ['إدارة الخبراء', h.expertName].filter(Boolean).join(' · ') : h.place,
        notes: ['من رول الجلسات', 'القرار السابق: ' + h.outcome].join(' · ') });
    }
  }
  return [...out.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** A case the register does not have yet, as an ongoing case at the level the roll names. */
export function rollNewCase(c: RollCase, file: string): CaseRecord {
  const type = c.level === 'تمييز' ? 'حكم تمييز' : c.level === 'استئناف' ? 'حكم استئناف' : 'حكم أول درجة';
  return {
    ...emptyCase(), client: c.client, clientGroup: c.client, opponent: c.opponent, role: c.role, type, stage: c.level || 'ابتدائي',
    caseNumber: c.caseNumber, court: c.building, subject: c.subject, lawyer: c.lawyer, source: 'رول الجلسات',
    notes: [`أُضيفت من رول الجلسات${file ? ' (' + file + ')' : ''}.`, c.fileNumber && 'رقم الملف في الرول: ' + c.fileNumber, c.special && 'ترقيم خاص: ' + c.special,
      c.caseType && 'نوع القضية: ' + c.caseType, c.status && 'حالة القضية: ' + c.status, c.circuit && 'الدائرة: ' + c.circuit].filter(Boolean).join('\n'),
  };
}

/** What the import sends for one case: the case as the roll describes it, its held sessions and its coming hearings. */
export function rollPayload(c: RollCase, today: string, file = '') {
  return {
    autoNumber: c.autoNumber, special: c.special, fileNumber: c.fileNumber, client: c.client, opponent: c.opponent, role: c.role,
    caseNumber: c.caseNumber, court: c.building, stage: c.level, subject: c.subject, lawyer: c.lawyer, caseType: c.caseType, status: c.status,
    circuit: c.circuit, sessions: rollSessions(c, today),
    held: c.hearings.filter(h => h.date < today).map(h => ({ date: h.date, note: [rollDecision(h.outcome, h.expert), h.outcome].filter(Boolean).join(' — ') || 'سُجلت في رول الجلسات' })),
    upcoming: rollUpcoming(c, today, c.autoNumber), newCase: rollNewCase(c, file),
  };
}
export type RollPayload = ReturnType<typeof rollPayload>;
