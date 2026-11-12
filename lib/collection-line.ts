// What a collection file's line tells at a glance (owner, 12 November 2026: «statistics everywhere»): how much of what
// is owed came in, when the file is next to be followed up (or how late that is), the last payment; and what the
// list's summary tiles count.
import { formatDate } from './domain.ts';
import { kwd, type PaymentData, type Position, type StatementData } from './collections.ts';

const late = (n: number) => n === 1 ? 'منذ يوم واحد' : n === 2 ? 'منذ يومين' : n % 100 >= 3 && n % 100 <= 10 ? `منذ ${n} أيام` : `منذ ${n} يوماً`;
const dayN = (d: string) => Math.round(Date.parse(d + 'T12:00:00Z') / 86400000);

export function collectionLine(p: Position, statements: StatementData[], payments: PaymentData[], today: string, extra: { archived?: boolean; assigned?: boolean; status?: string } = {}) {
  const short = (d: string) => d.slice(0, 4) === today.slice(0, 4) ? formatDate(d).slice(0, 5) : formatDate(d);
  const open = statements.filter(s => s.status !== 'done' && s.reviewDate).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
  const next = open[0], overdue = !!next && next.reviewDate < today;
  const lastPay = payments.filter(x => x.status !== 'void' && x.type !== 'expense' && x.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const parts = [
    next ? (overdue ? `إفادة مستحقة ${late(dayN(today) - dayN(next.reviewDate))}` : next.reviewDate === today ? 'إفادة مستحقة اليوم' : 'المراجعة القادمة ' + short(next.reviewDate)) + (next.action ? `: ${next.action}` : '') : '',
    lastPay ? `آخر دفعة ${kwd(lastPay.amountMinor ? Number(lastPay.amountMinor) : Math.round(Number(lastPay.amount || 0) * 1000))} د.ك في ${short(lastPay.date)}` : p.total ? 'لا دفعات بعد' : '',
    !p.total ? 'المبلغ غير مسجل' : '',
    extra.assigned === false ? 'غير موزّع' : '',
  ].filter(Boolean);
  const paidAll = p.total > 0 && p.remaining <= 0;
  const edge: 'red' | 'amber' | 'green' | 'grey' = extra.archived || ['مغلق', 'حفظ'].includes(extra.status || '') ? 'grey' : overdue || (next?.reviewDate === today) ? 'red' : paidAll || extra.status === 'مسدد' ? 'green' : extra.assigned === false || !p.total ? 'amber' : 'green';
  return { story: parts.join(' · '), edge, pct: p.total ? Math.min(100, p.paid / p.total * 100) : 0, paidAll };
}
