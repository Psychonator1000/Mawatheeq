// What a case's line in the register tells at a glance (owner, 12 November 2026: «statistics everywhere»): the steps it
// has gone through, how much of its appeal (or execution) time is used, the colour of its edge, and a short story (the
// next sitting, the last thing done, the execution stage); and what the register's summary tiles count.
import { caseState, formatDate, inCaseCategory, todayISO, type CaseRecord, type Rules } from './domain.ts';
import { currentLevel } from './case-stages.ts';

/** Days in Arabic with the right number form: «يوم واحد», «يومان» (after «منذ»: «يومين»), «5 أيام», «42 يوماً». */
export function daysAr(n: number, after = false) {
  return n === 1 ? 'يوم واحد' : n === 2 ? (after ? 'يومين' : 'يومان') : n % 100 >= 3 && n % 100 <= 10 ? `${n} أيام` : `${n} يوماً`;
}

export const CASE_STEPS = ['أول درجة', 'استئناف', 'تمييز', 'تنفيذ'] as const;
type Tone = 'green' | 'amber' | 'red' | 'grey';
type State = ReturnType<typeof caseState>;
type Procedure = { date?: string; decision?: string; text?: string };
/** A date in a story: day/month in the current year, the full date otherwise. */
const short = (d: string, today: string) => d.slice(0, 4) === today.slice(0, 4) ? formatDate(d).slice(0, 5) : formatDate(d);

export type CaseLine = {
  step: number; stepDone: boolean;
  meter: { pct: number; tone: Tone; label: string; title: string };
  edge: Tone; story: string;
};

/**
 * One case's line. `exec`: the execution list, where the time that counts is the execution period. `hearing`: the next
 * sitting on the office's list, if any.
 */
export function caseLine(c: CaseRecord, s: State, rules: Rules, { exec = false, hearing = '', today = todayISO() }: { exec?: boolean; hearing?: string; today?: string } = {}): CaseLine {
  const level = currentLevel(c), executing = s.status === 'تنفيذ قائم';
  const step = executing ? 3 : level === 'تمييز' ? 2 : level === 'استئناف' ? 1 : 0, stepDone = executing || (!!c.date && !s.awaiting);
  // The time: used of the window, in words; ended windows grey, the last days red.
  const window = exec ? rules.execution : s.days, left = exec ? s.executionRemaining : s.remaining;
  let meter: CaseLine['meter'];
  if (!exec && s.appeal === 'تم') meter = { pct: 100, tone: 'grey', label: 'طُعن فيه', title: 'سُجّل طعن على هذا الحكم' };
  else if (!exec && s.days === 0) meter = { pct: 100, tone: 'grey', label: 'نهائي', title: 'حكم نهائي لا يُطعن فيه' };
  else if (!c.date) meter = { pct: 0, tone: 'grey', label: s.awaiting ? 'بانتظار الحكم' : 'بلا تاريخ حكم', title: s.awaiting ? 'انتقلت القضية لدرجة أعلى ولم يصدر حكمها بعد' : 'لا يُحسب الميعاد بلا تاريخ الحكم' };
  else if (left === null || !window) meter = { pct: 0, tone: 'grey', label: '—', title: 'لا ميعاد لهذا النوع من الأحكام' };
  else if (left < 0) meter = { pct: 100, tone: 'grey', label: 'انتهى منذ ' + daysAr(-left, true), title: (exec ? 'موعد التنفيذ ' : 'ميعاد الطعن انتهى ') + formatDate(exec ? s.executionDue : s.due) };
  else if (left === 0) meter = { pct: 100, tone: 'red', label: 'ينتهي اليوم', title: (exec ? 'موعد التنفيذ' : 'آخر يوم للطعن') + ' اليوم' };
  else meter = { pct: (window - left) / window * 100, tone: left <= rules.warning ? 'red' : left <= 15 ? 'amber' : 'green', label: 'باقي ' + daysAr(left), title: (exec ? 'موعد التنفيذ ' : 'ينتهي ميعاد الطعن ') + formatDate(exec ? s.executionDue : s.due) };
  // The edge: red when its time is nearly up, amber when it waits on the office, green when it is in hand or done.
  const waits = ['بيانات ناقصة', 'بانتظار تأكيد الطعن', 'بانتظار تأكيد الإجراءات', 'جاهز للتنفيذ'].includes(s.status);
  const edge: Tone = meter.tone === 'red' ? 'red' : waits ? 'amber' : s.status === 'منتهي' ? 'grey' : 'green';
  // The story: the next sitting, the last thing done, the execution stage, else when the judgment was announced.
  const procs = ((c.procedures || []) as Procedure[]).filter(p => p.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last = procs.at(-1), lastText = last ? String(last.decision || last.text || '').trim() : '';
  const announced = String(c.notificationDate || c.announcementDate || '');
  const parts = [
    hearing ? (hearing === today ? 'جلسة اليوم' : 'الجلسة القادمة ' + short(hearing, today)) : '',
    lastText ? `${short(String(last!.date), today)}: ${lastText}` : '',
    c.executionStage ? 'التنفيذ: ' + String(c.executionStage) : '',
    !lastText && announced ? 'أُعلن ' + short(announced, today) : '',
    s.status === 'بيانات ناقصة' ? (!c.date ? 'ينقصه تاريخ الحكم' : s.outcome === 'غير محدد' ? 'ينقصه نتيجة الحكم' : 'ينقصه نوع الحكم') : '',
  ].filter(Boolean);
  return { step, stepDone, meter, edge, story: parts.join(' · ') || (c.date ? `${c.type || 'حكم'} ${short(c.date, today)}` : 'لا إجراءات مسجلة بعد') };
}

/** What the register's summary tiles count, over the cases in view. */
export function casePulse(records: CaseRecord[], rules: Rules, today = todayISO()) {
  const p = {
    all: records.length, levels: [0, 0, 0], outcome: { 'لصالحنا': 0, 'غير صالحنا': 0, 'غير محدد': 0 } as Record<string, number>,
    deadline: { week: 0, month: 0, ended: 0, none: 0 }, execution: { total: 0, running: 0, ready: 0, missing: 0, other: 0 },
    insurance: { total: 0, favour: 0, against: 0, open: 0 }, telecom: { total: 0, favour: 0, against: 0, open: 0 },
  };
  for (const c of records) {
    const s = caseState(c, rules, today), l = currentLevel(c);
    p.levels[l === 'تمييز' ? 2 : l === 'استئناف' ? 1 : 0]++;
    p.outcome[s.outcome] = (p.outcome[s.outcome] || 0) + 1;
    const live = s.appeal !== 'تم' && s.days !== 0 && s.remaining !== null;
    if (live && s.remaining! >= 0 && s.remaining! <= 7) p.deadline.week++;
    else if (live && s.remaining! > 7 && s.remaining! <= 30) p.deadline.month++;
    else if (live && s.remaining! < 0) p.deadline.ended++;
    else p.deadline.none++;
    if (inCaseCategory(c, 'execution', rules)) {
      p.execution.total++;
      if (s.status === 'تنفيذ قائم') p.execution.running++; else if (s.status === 'جاهز للتنفيذ') p.execution.ready++; else if (s.status === 'بيانات ناقصة') p.execution.missing++; else p.execution.other++;
    }
    for (const k of ['insurance', 'telecom'] as const) if (inCaseCategory(c, k, rules)) {
      const t = p[k]; t.total++;
      if (s.outcome === 'لصالحنا') t.favour++; else if (s.outcome === 'غير صالحنا') t.against++; else t.open++;
    }
  }
  return p;
}
