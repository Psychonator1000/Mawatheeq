import assert from 'node:assert/strict';
import { dayRecord, monthSummary, parseAttendanceFile, monthDays, formatMinutes } from '../lib/attendance.ts';

const settings = { timezone: 'Asia/Kuwait', workDays: [0, 1, 2, 3, 4], start: '08:00', end: '16:00', graceMinutes: 10, monthlyLateAllowanceMinutes: 60,
  deductionMode: 'warn', dayRateBasis: '30', absenceDeduction: false, overtime: { enabled: false, multiplier: 1.25, minMinutes: 30 }, holidays: [{ date: '2026-10-15', name: 'عطلة' }], currency: 'KWD' };
const sched = { start: settings.start, end: settings.end, workDays: settings.workDays };
const later = '2026-11-30T12:00';
const day = (date, times, extra = {}) => dayRecord(date, sched, settings, times.map(t => `${date}T${t}:00`), extra.leave, extra.adjustments || [], extra.now || later);

// Days: 2026-10-11 is a Sunday (work day); 2026-10-16 Friday and 2026-10-17 Saturday are rest days.
assert.equal(day('2026-10-11', ['08:09', '16:00']).kind, 'present', 'Within grace is on time');
const late = day('2026-10-11', ['08:25', '15:40']);
assert.deepEqual([late.kind, late.lateMinutes, late.earlyMinutes, late.workedMinutes], ['late', 25, 20, 435], 'Late beyond grace counts from the scheduled start');
assert.equal(day('2026-10-11', ['16:30', '08:00', '12:00']).first, '08:00', 'Punches are ordered; first in and last out are used');
assert.equal(day('2026-10-11', []).kind, 'absent');
assert.equal(day('2026-10-11', [], { now: '2026-10-11T08:05' }).kind, 'expected', 'Not absent before the grace period ends today');
assert.equal(day('2026-10-11', [], { now: '2026-10-11T08:30' }).kind, 'absent');
assert.equal(day('2026-10-12', [], { now: '2026-10-11T09:00' }).kind, 'upcoming');
assert.equal(day('2026-10-11', ['08:00']).kind, 'missing', 'A single punch on a past day is a missing punch');
assert.equal(day('2026-10-11', ['08:30'], { now: '2026-10-11T11:00' }).kind, 'late', 'Still at work today');
assert.equal(day('2026-10-16', []).kind, 'weekend');
assert.equal(day('2026-10-15', []).kind, 'holiday');
assert.equal(day('2026-10-17', ['09:00', '12:00']).overtimeMinutes, 180, 'Rest-day work is overtime');
assert.equal(day('2026-10-11', ['08:00', '16:20']).overtimeMinutes, 0, 'Overtime below the minimum is ignored');
assert.equal(day('2026-10-11', ['08:00', '17:00']).overtimeMinutes, 60);
// Hours for single weekdays: a short Thursday (2026-10-22) and a working Saturday morning (2026-10-24).
{const own = { ...sched, workDays: [0, 1, 2, 3, 4, 6], days: { 4: { start: '08:00', end: '13:00' }, 6: { start: '09:00', end: '12:00' } } };
 const at = (date, times) => dayRecord(date, own, settings, times.map(t => `${date}T${t}:00`), undefined, [], later);
 assert.deepEqual([at('2026-10-22', ['08:00', '13:00']).kind, at('2026-10-22', ['08:00', '13:00']).earlyMinutes], ['present', 0], 'Leaving at the short Thursday end is not early');
 assert.equal(at('2026-10-22', ['08:00', '14:00']).overtimeMinutes, 60, 'Overtime counts from that day\'s own end');
 assert.deepEqual([at('2026-10-24', ['09:30', '12:00']).kind, at('2026-10-24', ['09:30', '12:00']).lateMinutes], ['late', 30], 'Lateness counts from that day\'s own start');
 assert.equal(at('2026-10-21', ['08:00', '13:00']).earlyMinutes, 180, 'Other days keep the usual hours');}
assert.equal(day('2026-10-11', [], { leave: { employeeId: 'e', from: '2026-10-11', to: '2026-10-12', type: 'سنوية' } }).kind, 'leave');
assert.equal(day('2026-10-11', ['09:00', '16:00'], { adjustments: [{ kind: 'excuse', note: 'مهمة' }] }).kind, 'excused', 'Excused days carry no lateness');
const manual = day('2026-10-11', ['08:00'], { adjustments: [{ kind: 'manual_out', time: '16:00', note: 'نسي' }] });
assert.deepEqual([manual.kind, manual.last], ['present', '16:00'], 'Manual punches complete the day');

// Month: October 2026 has 21 Sunday–Thursday days minus one holiday = 20 scheduled days.
const employee = { id: 'e1', name: 'One', employeeNumber: 'E-1', active: true, pin: '101', salaryMinor: '900000', currency: 'KWD', schedule: null };
const punches = [];
for (const d of monthDays('2026-10')) {
  const wd = new Date(d + 'T00:00:00Z').getUTCDay();
  if (wd > 4 || d === '2026-10-15' || d === '2026-10-20' || d === '2026-10-21') continue; // 20th absent, 21st on leave
  const inTime = d === '2026-10-05' ? '08:40' : d === '2026-10-06' ? '08:50' : '07:58';
  punches.push({ pin: '101', at: `${d}T${inTime}:00` }, { pin: '101', at: `${d}T16:02:00` });
}
punches.push({ pin: '999', at: '2026-10-05T08:00:00' });
const leaves = [{ employeeId: 'e1', from: '2026-10-21', to: '2026-10-21', type: 'سنوية' }];
const warn = monthSummary(employee, '2026-10', settings, punches, leaves, [], later);
assert.equal(warn.scheduledDays, 20);
assert.deepEqual([warn.presentDays, warn.absentDays, warn.leaveDays, warn.lateDays, warn.lateMinutes], [18, 1, 1, 2, 90]);
assert.deepEqual([warn.allowanceMinutes, warn.excessMinutes], [60, 30]);
assert.equal(warn.lateDeductionMinor, 0n, 'Warn mode never deducts');
assert.equal(warn.netMinor, 900000n);
// 900 KWD ÷ 30 days ÷ 480 minutes × 30 minutes = 1.875 KWD
assert.equal(warn.potentialDeductionMinor, 1875n, 'The would-be deduction is still shown');
assert.ok(warn.warnings.some(w => w.includes('تجاوز سماحية التأخير')) && warn.warnings.some(w => w.includes('غياب 1 يوم')));

const deduct = monthSummary(employee, '2026-10', { ...settings, deductionMode: 'deduct', absenceDeduction: true }, punches, leaves, [], later);
assert.equal(deduct.lateDeductionMinor, 1875n);
assert.equal(deduct.absenceDeductionMinor, 30000n, 'One absent day = 900 ÷ 30');
assert.equal(deduct.netMinor, 900000n - 1875n - 30000n);
const workdays = monthSummary(employee, '2026-10', { ...settings, deductionMode: 'deduct', absenceDeduction: true, dayRateBasis: 'workdays' }, punches, leaves, [], later);
assert.equal(workdays.absenceDeductionMinor, 45000n, '900 ÷ 20 scheduled days');
const overtime = monthSummary(employee, '2026-10', { ...settings, overtime: { enabled: true, multiplier: 1.5, minMinutes: 30 } }, [...punches, { pin: '101', at: '2026-10-17T09:00:00' }, { pin: '101', at: '2026-10-17T13:00:00' }], leaves, [], later);
assert.equal(overtime.overtimeMinutes, 240);
assert.equal(overtime.overtimePayMinor, 22500n, '240 min × 1.5 × (900 ÷ 30 ÷ 480) = 22.5 KWD');
const unmapped = monthSummary({ ...employee, pin: null }, '2026-10', settings, punches, [], [], later);
assert.ok(unmapped.warnings.includes('لم يُربط الموظف برقم بصمة'));
const custom = monthSummary({ ...employee, schedule: { start: '09:00', end: '13:00', workDays: [0] } }, '2026-10', settings, punches, [], [], later);
assert.equal(custom.scheduledDays, 4, 'Employee schedules override the office schedule');

// Imports: ZKTeco attlog.dat, CSV exports and Arabic digits; headers and junk are skipped.
const file = [
  '﻿        101\t2026-10-11 08:05:00\t1\t0\t1\t0',
  '102,Employee Two,11/10/2026 09:20',
  'No.,Name,Time,State',
  '"103","Three","2026/10/11 7:59:30","C/In"',
  '١٠٤\t٢٠٢٦-١٠-١١ ٠٨:٠٠:٠٠',
  '105 11-Oct-2026 08:15',
  'garbage line',
  '106\t2026-13-40 25:61:00',
].join('\r\n');
const parsed = parseAttendanceFile(file);
assert.deepEqual(parsed.punches, [
  { pin: '101', wall: '2026-10-11 08:05:00' }, { pin: '102', wall: '2026-10-11 09:20:00' }, { pin: '103', wall: '2026-10-11 07:59:30' },
  { pin: '104', wall: '2026-10-11 08:00:00' }, { pin: '105', wall: '2026-10-11 08:15:00' },
]);
assert.equal(parsed.skipped, 3);
assert.equal(formatMinutes(135), '2 س 15 د'); assert.equal(formatMinutes(45), '45 د'); assert.equal(formatMinutes(0), '0');
console.log('Passed attendance calculations: grace and lateness, early leave, missing punches, today\'s expected arrivals, rest days, holidays, leave, excuses, manual punches, overtime minimums, monthly allowance, warn vs deduct modes, 30-day and workday rates in exact fils, overtime pay, employee schedules, unmapped employees and attlog/CSV/Arabic-digit imports.');

const { toMinor, fromMinor } = await import('../lib/attendance.ts');
assert.equal(toMinor('1,250.5', 3), '1250500'); assert.equal(toMinor('٣٠٠', 3), '300000'); assert.equal(toMinor('0.001', 3), '1');
assert.equal(toMinor('1.2345', 3), null, 'Too many decimals are refused, never rounded'); assert.equal(toMinor('-5', 3), null); assert.equal(toMinor('', 2), null);
assert.equal(fromMinor('1250500', 3), '1250.500'); assert.equal(fromMinor('5', 2), '0.05');
console.log('Passed amount parsing: separators, Arabic digits, exact decimals and refusal of excess precision.');
