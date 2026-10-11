type Leave = { subjectId: string; payload: Record<string, string> };
const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

/** Inclusive calendar days in a date-only range, optionally clipped to [min, max]. */
export function leaveDays(from: string, to: string, min = '', max = ''): number {
  if (!valid(from) || !valid(to)) return 0;
  const start = min && from < min ? min : from, end = max && to > max ? max : to;
  return end < start ? 0 : day(end) - day(start) + 1;
}

/** Approved leave days an employee used within a calendar year, total and per leave type. */
export function leaveUsed(leaves: Leave[], employeeId: string, year: number) {
  const byType = new Map<string, number>(); let total = 0;
  for (const l of leaves) {
    if (l.subjectId !== employeeId || l.payload.status !== 'approved') continue;
    const days = leaveDays(l.payload.fromDate, l.payload.toDate, `${year}-01-01`, `${year}-12-31`);
    if (!days) continue;
    const type = (l.payload.type || '').trim() || 'غير محدد';
    byType.set(type, (byType.get(type) || 0) + days); total += days;
  }
  return { total, byType: [...byType].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ar')) };
}
