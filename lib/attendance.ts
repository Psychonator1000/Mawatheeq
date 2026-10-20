// Attendance and payroll estimates from fingerprint punches. Pure functions: no I/O, no timezone shifts.
// Punch times arrive as office wall-clock strings (YYYY-MM-DDTHH:MM:SS) converted by the server.

/** `days` holds hours that differ from `start`–`end` on some weekdays (0 = Sunday … 6 = Saturday), e.g. a short Thursday. */
export type DayHours = { start: string; end: string };
export type Schedule = { start: string; end: string; workDays: number[]; days?: Partial<Record<string, DayHours>> };
export type AttendanceSettings = Schedule & {
  timezone: string; graceMinutes: number; monthlyLateAllowanceMinutes: number;
  deductionMode: 'warn' | 'deduct'; dayRateBasis: '30' | 'workdays'; absenceDeduction: boolean;
  overtime: { enabled: boolean; multiplier: number; minMinutes: number };
  holidays: { date: string; name: string }[]; currency: string;
};
export type AttEmployee = { id: string; name: string; employeeNumber: string; active: boolean; pin: string | null; salaryMinor: string; currency: string; schedule: Schedule | null; department?: string; title?: string; profileRevision?: number };
export type AttPunch = { pin: string; at: string; source?: string; deviceId?: string | null };
export type AttLeave = { employeeId: string; from: string; to: string; type: string };
export type AttAdjustment = { id: string; employeeId: string; day: string; kind: 'excuse' | 'manual_in' | 'manual_out'; time: string | null; note: string; revision: number; by?: string };
export type DayKind = 'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'weekend' | 'excused' | 'missing' | 'upcoming' | 'expected';
export type DayRecord = { date: string; kind: DayKind; first: string | null; last: string | null; punches: string[]; lateMinutes: number; earlyMinutes: number; workedMinutes: number; overtimeMinutes: number; note: string };

export const DAY_LABELS: Record<DayKind, string> = { present: 'حاضر', late: 'متأخر', absent: 'غائب', leave: 'إجازة', holiday: 'عطلة رسمية', weekend: 'راحة', excused: 'معذور', missing: 'بصمة ناقصة', upcoming: '—', expected: 'لم يحضر بعد' };
export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const minutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const clock = (at: string) => at.slice(11, 16);
const weekday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
export const monthDays = (month: string) => { const [y, m] = month.split('-').map(Number); const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`); };
export const scheduleOf = (e: Pick<AttEmployee, 'schedule'>, s: AttendanceSettings): Schedule => e.schedule || { start: s.start, end: s.end, workDays: s.workDays, days: s.days };
/** The hours of one date: its weekday's own hours when set, otherwise the usual ones. */
export const hoursOn = (sched: Schedule, date: string): DayHours => sched.days?.[String(weekday(date))] || { start: sched.start, end: sched.end };
export const formatMinutes = (n: number) => n <= 0 ? '0' : n < 60 ? `${n} د` : `${Math.floor(n / 60)} س ${n % 60 ? (n % 60) + ' د' : ''}`.trim();

/** One employee's day. `now` is the office wall clock (YYYY-MM-DDTHH:MM) so today's late arrivals are not counted absent too early. */
export function dayRecord(date: string, sched: Schedule, s: AttendanceSettings, punches: string[], leave: AttLeave | undefined, adjustments: AttAdjustment[], now: string): DayRecord {
  const manual = adjustments.filter(a => a.kind !== 'excuse' && a.time).map(a => `${date}T${a.time}:00`);
  const times = [...new Set([...punches, ...manual])].sort();
  const excuse = adjustments.find(a => a.kind === 'excuse');
  const holiday = s.holidays.find(h => h.date === date);
  const base: DayRecord = { date, kind: 'present', first: times[0] ? clock(times[0]) : null, last: times.length > 1 ? clock(times[times.length - 1]) : null, punches: times.map(clock), lateMinutes: 0, earlyMinutes: 0, workedMinutes: 0, overtimeMinutes: 0, note: excuse?.note || holiday?.name || leave?.type || '' };
  const hours = hoursOn(sched, date), start = minutes(hours.start), end = minutes(hours.end);
  const worked = times.length > 1 ? minutes(clock(times[times.length - 1])) - minutes(clock(times[0])) : 0;
  const offDay = holiday || !sched.workDays.includes(weekday(date));
  if (offDay) {
    // Work on a rest day or holiday counts entirely as overtime.
    const overtime = worked >= s.overtime.minMinutes ? worked : 0;
    return { ...base, kind: holiday ? 'holiday' : 'weekend', workedMinutes: worked, overtimeMinutes: overtime };
  }
  if (leave) return { ...base, kind: 'leave' };
  if (excuse) return { ...base, kind: 'excused', workedMinutes: worked };
  const today = now.slice(0, 10), nowMinutes = minutes(now.slice(11, 16));
  if (!times.length) {
    if (date > today) return { ...base, kind: 'upcoming' };
    if (date === today && nowMinutes <= start + s.graceMinutes) return { ...base, kind: 'expected' };
    return { ...base, kind: 'absent' };
  }
  const first = minutes(clock(times[0]));
  // Arriving after the grace period counts every minute from the scheduled start.
  const late = first > start + s.graceMinutes ? first - start : 0;
  if (times.length === 1) {
    const stillWorking = date === today && nowMinutes < end;
    return { ...base, kind: stillWorking ? (late ? 'late' : 'present') : 'missing', lateMinutes: late };
  }
  const last = minutes(clock(times[times.length - 1]));
  const early = Math.max(0, end - last);
  const extra = Math.max(0, last - end);
  return { ...base, kind: late ? 'late' : 'present', lateMinutes: late, earlyMinutes: early, workedMinutes: worked, overtimeMinutes: extra >= s.overtime.minMinutes ? extra : 0 };
}

export type MonthSummary = {
  employee: AttEmployee; days: DayRecord[]; scheduledDays: number; presentDays: number; absentDays: number; leaveDays: number; excusedDays: number; missingDays: number;
  lateDays: number; lateMinutes: number; earlyMinutes: number; shortfallMinutes: number; allowanceMinutes: number; excessMinutes: number; overtimeMinutes: number;
  salaryMinor: bigint; lateDeductionMinor: bigint; absenceDeductionMinor: bigint; overtimePayMinor: bigint; netMinor: bigint;
  potentialDeductionMinor: bigint; warnings: string[];
};

// Exact minor-unit arithmetic: round(numerator / denominator) half up.
const ZERO = BigInt(0), TWO = BigInt(2), HUNDRED = BigInt(100);
const divRound = (n: bigint, d: bigint) => d === ZERO ? ZERO : (n * TWO + d) / (TWO * d);

/** Month totals, salary estimate and warnings for one employee. */
export function monthSummary(employee: AttEmployee, month: string, s: AttendanceSettings, punches: AttPunch[], leaves: AttLeave[], adjustments: AttAdjustment[], now: string): MonthSummary {
  const sched = scheduleOf(employee, s), dates = monthDays(month);
  const mine = employee.pin ? punches.filter(p => p.pin === employee.pin) : [];
  const byDay = new Map<string, string[]>();
  for (const p of mine) { const d = p.at.slice(0, 10); byDay.set(d, [...(byDay.get(d) || []), p.at]); }
  const days = dates.map(date => dayRecord(date, sched, s, byDay.get(date) || [],
    leaves.find(l => l.employeeId === employee.id && l.from <= date && l.to >= date),
    adjustments.filter(a => a.employeeId === employee.id && a.day === date), now));
  const count = (k: DayKind) => days.filter(d => d.kind === k).length;
  const scheduledDays = dates.filter(d => sched.workDays.includes(weekday(d)) && !s.holidays.some(h => h.date === d)).length;
  const lateMinutes = days.reduce((t, d) => t + d.lateMinutes, 0), earlyMinutes = days.reduce((t, d) => t + d.earlyMinutes, 0);
  const shortfall = lateMinutes + earlyMinutes, allowance = s.monthlyLateAllowanceMinutes, excess = Math.max(0, shortfall - allowance);
  const overtimeMinutes = days.reduce((t, d) => t + d.overtimeMinutes, 0);
  const salary = BigInt(employee.salaryMinor || '0');
  const basisDays = BigInt(s.dayRateBasis === '30' ? 30 : Math.max(1, scheduledDays));
  const dayMinutes = BigInt(Math.max(1, minutes(sched.end) - minutes(sched.start)));
  const minuteValue = (m: number) => divRound(salary * BigInt(m), basisDays * dayMinutes);
  const absentDays = count('absent');
  const lateValue = minuteValue(excess), absenceValue = divRound(salary * BigInt(absentDays), basisDays);
  const deduct = s.deductionMode === 'deduct';
  const lateDeductionMinor = deduct ? lateValue : ZERO;
  const absenceDeductionMinor = deduct && s.absenceDeduction ? absenceValue : ZERO;
  const overtimePayMinor = s.overtime.enabled ? divRound(salary * BigInt(overtimeMinutes) * BigInt(Math.round(s.overtime.multiplier * 100)), basisDays * dayMinutes * HUNDRED) : ZERO;
  const warnings: string[] = [];
  if (excess > 0) warnings.push(`تجاوز سماحية التأخير الشهرية (${formatMinutes(allowance)}) بمقدار ${formatMinutes(excess)}`);
  if (absentDays) warnings.push(`غياب ${absentDays} يوم دون إجازة أو عذر مسجل`);
  if (count('missing')) warnings.push(`${count('missing')} يوم ببصمة واحدة فقط (دخول دون خروج)`);
  if (employee.active && !employee.pin) warnings.push('لم يُربط الموظف برقم بصمة');
  return {
    employee, days, scheduledDays, presentDays: count('present') + count('late'), absentDays, leaveDays: count('leave'), excusedDays: count('excused'), missingDays: count('missing'),
    lateDays: days.filter(d => d.lateMinutes > 0).length, lateMinutes, earlyMinutes, shortfallMinutes: shortfall, allowanceMinutes: allowance, excessMinutes: excess, overtimeMinutes,
    salaryMinor: salary, lateDeductionMinor, absenceDeductionMinor, overtimePayMinor, netMinor: salary - lateDeductionMinor - absenceDeductionMinor + overtimePayMinor,
    potentialDeductionMinor: lateValue + (s.absenceDeduction ? absenceValue : ZERO), warnings,
  };
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const pad = (n: string) => n.padStart(2, '0');
/**
 * Parse fingerprint exports: ZKTeco USB "attlog.dat" (PIN<TAB>YYYY-MM-DD HH:MM:SS…), and CSV/TXT reports
 * from attendance software with a user number followed by a date and time (Y-M-D, D/M/Y or D-Mon-Y).
 */
export function parseAttendanceFile(text: string): { punches: { pin: string; wall: string }[]; skipped: number } {
  const punches: { pin: string; wall: string }[] = []; let skipped = 0;
  const digits = text.replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf));
  for (const raw of digits.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '').trim();
    if (!line) continue;
    const pin = line.match(/^"?\s*([0-9A-Za-z]{1,24})\s*"?\s*[\t,; ]/)?.[1];
    const ymd = line.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T,;\t"]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const dmy = line.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T,;\t"]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    const dmon = line.match(/(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{4})[ T,;\t"]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    let wall = '';
    if (ymd) wall = `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])} ${pad(ymd[4])}:${ymd[5]}:${ymd[6] || '00'}`;
    else if (dmy) wall = `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])} ${pad(dmy[4])}:${dmy[5]}:${dmy[6] || '00'}`;
    else if (dmon && MONTHS[dmon[2].toLowerCase()]) wall = `${dmon[3]}-${MONTHS[dmon[2].toLowerCase()]}-${pad(dmon[1])} ${pad(dmon[4])}:${dmon[5]}:${dmon[6] || '00'}`;
    const valid = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(wall);
    if (pin && valid) punches.push({ pin, wall });
    else skipped++;
  }
  return { punches, skipped };
}

/** "1,250.5" → "1250500" minor units for `places` decimals; null when the amount is not a plain non-negative number. */
export function toMinor(text: string, places: number): string | null {
  const v = text.replace(/[٠-٩۰-۹]/g, d => String(d.charCodeAt(0) & 0xf)).replace(/[,\s]/g, '').replace('٫', '.');
  const m = v.match(/^(\d{1,12})(?:\.(\d*))?$/);
  if (!m || (m[2] || '').length > places) return null;
  return (BigInt(m[1]) * BigInt(10) ** BigInt(places) + BigInt((m[2] || '').padEnd(places, '0') || '0')).toString();
}
/** Minor units → plain decimal text for form inputs ("1250500", 3 → "1250.500"). */
export const fromMinor = (minor: string, places: number) => { const s = String(minor || '0').padStart(places + 1, '0'); return places ? s.slice(0, -places) + '.' + s.slice(-places) : s; };
