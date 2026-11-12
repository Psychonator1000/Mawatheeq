// What a task or sitting's line tells at a glance (owner, 12 November 2026: «statistics everywhere»): how late it is or
// how soon it comes, where it stands, where it is and what came of it; and what the list's summary tiles count.
import { addDays, daysBetween, formatDate } from './domain.ts';
import { WORK_STATUSES, workBucket, type WorkItem } from './office.ts';

const late = (n: number) => n === 1 ? 'متأخرة يوماً واحداً' : n === 2 ? 'متأخرة يومين' : n % 100 >= 3 && n % 100 <= 10 ? `متأخرة ${n} أيام` : `متأخرة ${n} يوماً`;
const after = (n: number) => n === 1 ? 'غداً' : n === 2 ? 'بعد يومين' : n % 100 >= 3 && n % 100 <= 10 ? `بعد ${n} أيام` : `بعد ${n} يوماً`;

export function workLine(w: WorkItem, today: string): { story: string; edge: 'red' | 'amber' | 'green' | 'grey' } {
  const b = workBucket(w, today), short = (d: string) => d.slice(0, 4) === today.slice(0, 4) ? formatDate(d).slice(0, 5) : formatDate(d);
  const when = b === 'overdue' ? late(daysBetween(w.dueDate, today) || 1) : b === 'today' ? 'اليوم' + (w.dueTime ? ' ' + w.dueTime : '') : b === 'upcoming' ? after(daysBetween(today, w.dueDate) || 1) : '';
  const closed = w.status === 'done' ? 'أُنجزت' + (w.completedAt ? ' ' + short(w.completedAt.slice(0, 10)) : '') + (w.completionNote.trim() ? ` «${w.completionNote.trim()}»` : '') : w.status === 'cancelled' ? 'أُلغيت' : '';
  const parts = [when, closed, b !== 'closed' ? WORK_STATUSES[w.status] : '', w.location.trim(), w.notes.trim().split('\n')[0]].filter(Boolean);
  return { story: parts.join(' · '), edge: b === 'overdue' ? 'red' : b === 'today' ? 'amber' : b === 'closed' ? 'green' : 'grey' };
}

const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
/** The open work: what is late, then each of the next seven days; and the open work per person and per kind. */
export function workPulse(items: WorkItem[], today: string) {
  const open = items.filter(w => workBucket(w, today) !== 'closed');
  const days = Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i); return { date: d, label: i === 0 ? 'اليوم' : WEEKDAYS[new Date(d + 'T12:00:00Z').getUTCDay()], value: open.filter(w => w.dueDate === d).length }; });
  const people = new Map<string, number>(); for (const w of open) people.set(w.assigneeId, (people.get(w.assigneeId) || 0) + 1);
  return {
    late: open.filter(w => workBucket(w, today) === 'overdue').length, days, later: open.filter(w => w.dueDate > addDays(today, 6)).length,
    people: [...people.entries()].sort((a, b) => b[1] - a[1]),
    hearings: open.filter(w => w.kind === 'hearing').length, tasks: open.filter(w => w.kind === 'task').length, urgent: open.filter(w => w.priority === 'urgent').length,
    total: open.length,
  };
}
