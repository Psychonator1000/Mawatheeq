import assert from 'node:assert/strict';
import { leaveDays, leaveUsed } from '../lib/leave.ts';

assert.equal(leaveDays('2026-10-11', '2026-10-11'), 1, 'Single day is inclusive');
assert.equal(leaveDays('2026-02-27', '2026-03-02'), 4, 'Crosses a short month');
assert.equal(leaveDays('2028-02-28', '2028-03-01'), 3, 'Leap day counted');
assert.equal(leaveDays('2026-10-12', '2026-10-11'), 0, 'Reversed range');
assert.equal(leaveDays('', '2026-10-11'), 0, 'Unknown dates never count');
assert.equal(leaveDays('2025-12-30', '2026-01-02', '2026-01-01', '2026-12-31'), 2, 'Clipped to the year');
for (const zone of ['Asia/Kuwait', 'America/Los_Angeles']) { process.env.TZ = zone; assert.equal(leaveDays('2026-03-28', '2026-03-31'), 4, 'No DST/timezone shift'); }

const leave = (subjectId, type, fromDate, toDate, status = 'approved') => ({ subjectId, payload: { type, fromDate, toDate, status } });
const rows = [
  leave('a', 'سنوية', '2026-01-04', '2026-01-08'),
  leave('a', 'سنوية', '2025-12-29', '2026-01-02'),
  leave('a', 'مرضية', '2026-05-10', '2026-05-11'),
  leave('a', 'سنوية', '2026-07-01', '2026-07-20', 'pending'),
  leave('a', 'سنوية', '2026-08-01', '2026-08-05', 'rejected'),
  leave('a', ' ', '2026-09-01', '2026-09-01'),
  leave('b', 'سنوية', '2026-01-01', '2026-01-31'),
];
const used = leaveUsed(rows, 'a', 2026);
assert.equal(used.total, 10, 'Approved days in 2026 only, for this employee only');
assert.deepEqual(used.byType, [['سنوية', 7], ['مرضية', 2], ['غير محدد', 1]]);
assert.equal(leaveUsed(rows, 'a', 2025).total, 3, 'Year-crossing leave is split between years');
assert.deepEqual(leaveUsed(rows, 'nobody', 2026), { total: 0, byType: [] });
console.log('Passed leave balances: inclusive date-only days, year clipping, leap years, timezone safety, approved-only per-employee totals by type.');
