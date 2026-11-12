// What a paper file's line in the archive tells at a glance (owner, 12 November 2026: «statistics everywhere»): where it
// has been since when, who holds it and for what, when it is due back or how late it is, and when it was last counted.
import { formatDate } from './domain.ts';
import type { Custody } from './archive.ts';

const dayN = (d: string) => Math.round(Date.parse(d + 'T12:00:00Z') / 86400000);
const lateBy = (n: number) => n === 1 ? 'متأخر يوماً واحداً' : n === 2 ? 'متأخر يومين' : n % 100 >= 3 && n % 100 <= 10 ? `متأخر ${n} أيام` : `متأخر ${n} يوماً`;

export function archiveLine(c: Custody, today: string, flags: { lost?: boolean; missing?: boolean; archived?: boolean; awaiting?: boolean } = {}) {
  const short = (d: string) => d.slice(0, 4) === today.slice(0, 4) ? formatDate(d).slice(0, 5) : formatDate(d);
  const late = c.state !== 'in' && !!c.dueDate && c.dueDate < today;
  const parts = c.state === 'in'
    ? [c.since ? 'منذ ' + short(c.since) : '', c.lastAudit ? 'آخر جرد ' + short(c.lastAudit) : 'لم يُجرد بعد']
    : [(c.holder ? 'مع ' + c.holder : 'خارج الأرشيف') + (c.since ? ' منذ ' + short(c.since) : ''), c.purpose, c.dueDate ? (late ? lateBy(dayN(today) - dayN(c.dueDate)) : 'يعود ' + short(c.dueDate)) : 'بلا موعد إعادة'];
  if (flags.lost) parts.unshift('مفقود');
  if (flags.missing) parts.push('نواقص مفتوحة');
  const edge: 'red' | 'amber' | 'green' | 'grey' = flags.archived ? 'grey' : late || flags.lost || flags.missing ? 'red' : c.state !== 'in' || flags.awaiting ? 'amber' : 'green';
  return { story: parts.filter(Boolean).join(' · '), edge, late };
}

const dayAr = (n: number, after = false) => n === 1 ? 'يوم واحد' : n === 2 ? (after ? 'يومين' : 'يومان') : n % 100 >= 3 && n % 100 <= 10 ? `${n} أيام` : `${n} يوماً`;
/** When a request's file is needed, as a key for the tiles: late, today, within a week, later, or no date. */
export function neededWhen(neededBy: string, today: string): 'late' | 'today' | 'week' | 'later' | 'none' {
  if (!neededBy) return 'none';
  if (neededBy < today) return 'late';
  if (neededBy === today) return 'today';
  return dayN(neededBy) - dayN(today) <= 7 ? 'week' : 'later';
}
/** A file request's line: how its date stands, where the file is now, and its edge. */
export function requestLine(p: { status: string; neededBy: string; purpose: string; decisionNote?: string }, file: { state: string; holder: string; stateLabel: string } | null, today: string, unsent = false) {
  const closed = p.status === 'done' || p.status === 'declined';
  const when = neededWhen(p.neededBy, today), n = p.neededBy ? Math.abs(dayN(p.neededBy) - dayN(today)) : 0;
  const parts = [
    unsent ? 'عُلّم «سُلّم» ولم يُرسل للطالب' : '',
    closed ? '' : when === 'late' ? 'تأخر تجهيزه ' + dayAr(n, true) : when === 'today' ? 'مطلوب اليوم' : when === 'none' ? 'بلا موعد' : 'مطلوب بعد ' + dayAr(n, true),
    !file ? 'الملف غير موجود في الأرشيف' : file.state === 'in' ? (closed ? '' : 'الملف في الأرشيف') : `الملف الآن ${file.stateLabel}${file.holder ? ': ' + file.holder : ''}`,
    p.status === 'declined' && p.decisionNote ? 'السبب: ' + p.decisionNote : '',
  ];
  const edge: 'red' | 'amber' | 'green' | 'grey' = p.status === 'declined' ? 'grey' : unsent || (!closed && when === 'late') ? 'red' : closed || p.status === 'ready' ? 'green' : 'amber';
  return { story: parts.filter(Boolean).join(' · '), edge, when };
}
/** A movement's edge: back in the archive or counted green, out amber, cancelled red, moved within it grey. */
export function movementEdge(type: string, status: string): 'red' | 'amber' | 'green' | 'grey' {
  if (status === 'void') return 'red';
  if (type === 'return' || type === 'audit') return 'green';
  return type === 'move' ? 'grey' : 'amber';
}
