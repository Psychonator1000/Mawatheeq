// The case's whole story in one list (السير الزمني): sessions, procedures, judgments and level moves from every
// court level, plus its scheduled and finished hearings and tasks. Built from data the case file already holds.
import type { CaseRecord, Procedure } from './domain';
import type { WorkItem } from './office';
import { LEVELS, LEVEL_TITLE, currentLevel, stagesOf, type Level } from './case-stages';
import { isSession } from './sessions';

export type TimelineKind = 'session' | 'procedure' | 'judgment' | 'level' | 'hearing' | 'task';
export type TimelineEvent = { id: string; date: string; time?: string; kind: TimelineKind; level: string; title: string; detail?: string; who?: string; state?: 'done' | 'upcoming' | 'overdue' };

const fromProcedure = (p: Procedure, level: string): TimelineEvent => ({
  id: 'p-' + p.id, date: p.date, kind: isSession(p) ? 'session' : 'procedure', level,
  title: isSession(p) ? (p.kind === 'جلسة خبراء' ? 'جلسة خبراء' : 'جلسة') + (p.decision ? ': ' + p.decision : '') : p.text,
  detail: isSession(p) ? [p.court, p.text !== p.decision ? p.text.replace((p.decision || '') + ' — ', '') : '', p.followup ? 'القادمة ' + p.followup.split('-').reverse().join('/') + (p.nextTime ? ' ' + p.nextTime : '') : ''].filter(Boolean).join(' · ') : p.followup ? 'متابعة ' + p.followup.split('-').reverse().join('/') : undefined,
  who: p.recordedBy || p.lawyer,
});

export function buildTimeline(c: CaseRecord, work: WorkItem[], today: string): TimelineEvent[] {
  const out: TimelineEvent[] = [], stages = stagesOf(c);
  stages.forEach((s, i) => {
    for (const p of s.procedures || []) if (p.date) out.push(fromProcedure(p, s.level));
    if (s.date) out.push({ id: 'j-' + s.id, date: s.date, kind: 'judgment', level: s.level, title: `${s.type || 'حكم'}${s.outcome && s.outcome !== 'غير محدد' ? ' · ' + s.outcome : ''}`, detail: [s.caseNumber && 'رقم ' + s.caseNumber, s.ruling].filter(Boolean).join(' · ') || undefined });
    const to: Level | undefined = stages[i + 1]?.level ?? (LEVELS[LEVELS.indexOf(s.level) + 1] as Level | undefined);
    const moved = s.movedOn || (s.closedAt || '').slice(0, 10);
    if (moved) out.push({ id: 'l-' + s.id, date: moved, kind: 'level', level: to || s.level, title: `انتقال إلى ${to ? LEVEL_TITLE[to] : 'الدرجة التالية'}`, detail: [s.appealedBy && 'الطاعن: ' + s.appealedBy, s.note].filter(Boolean).join(' · ') || undefined, who: s.closedBy });
  });
  const level = currentLevel(c);
  for (const p of c.procedures || []) if (p.date) out.push(fromProcedure(p, level));
  if (c.date) out.push({ id: 'j-current', date: c.date, kind: 'judgment', level, title: `${c.type || 'حكم'}${c.outcome && c.outcome !== 'غير محدد' ? ' · ' + c.outcome : ''}`, detail: [c.caseNumber && 'رقم ' + c.caseNumber, c.ruling].filter(Boolean).join(' · ') || undefined });
  // Hearings already recorded as sessions on the same day are not listed twice.
  const sessionDays = new Set((c.procedures || []).concat(stages.flatMap(s => s.procedures || [])).filter(isSession).map(p => p.date));
  for (const w of work) {
    if (w.caseId !== c.id || !w.dueDate || w.status === 'cancelled') continue;
    const done = w.status === 'done';
    if (done && w.kind === 'hearing' && sessionDays.has(w.dueDate)) continue;
    out.push({ id: 'w-' + w.id, date: w.dueDate, time: w.dueTime, kind: w.kind === 'hearing' ? 'hearing' : 'task', level, title: w.title, detail: done ? w.completionNote : w.location || w.notes || undefined, who: w.updatedBy || w.createdBy, state: done ? 'done' : w.dueDate < today ? 'overdue' : 'upcoming' });
  }
  return out.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || a.id.localeCompare(b.id));
}
