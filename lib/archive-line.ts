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
