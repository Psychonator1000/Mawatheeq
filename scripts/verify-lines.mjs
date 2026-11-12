// The informative lines (owner, 12 November 2026: «statistics everywhere»): what a case, client and task line says,
// with Arabic number forms right, and what the summary tiles count.
import assert from 'node:assert/strict';
import { daysAr, caseLine, casePulse } from '../lib/case-line.ts';
import { clientLine, clientStats } from '../lib/client-line.ts';
import { workLine, workPulse } from '../lib/work-line.ts';
import { DEFAULT_RULES, caseState } from '../lib/domain.ts';

assert.deepEqual([1, 2, 3, 10, 11, 42, 103].map(n => daysAr(n)), ['يوم واحد', 'يومان', '3 أيام', '10 أيام', '11 يوماً', '42 يوماً', '103 أيام']);
assert.equal(daysAr(2, true), 'يومين');

const today = '2026-11-12', base = { id: 'c', code: 'K', autoNumber: '1', client: 'م', clientGroup: '', opponent: 'خ', role: '', ruling: '', appealRecorded: '', appealConfirmation: 'لا يوجد', notes: '', executionNote: '', copyDate: '', notificationDate: '', announcementDate: '', originalDate: '', executionStage: '', executionLegacy: '', noActionConfirmation: '', caseNumber: '', court: '', subject: '', lawyer: '', source: '', review: '', legacyNotes: '', insurance: false, procedures: [] };
const mk = v => ({ ...base, ...v });
const line = c => caseLine(c, caseState(c, DEFAULT_RULES, today), DEFAULT_RULES, { today });
// First-instance judgment 27 days ago: 3 days of 30 left, red, first step done.
let l = line(mk({ type: 'حكم أول درجة', date: '2026-10-16', outcome: 'لصالحنا' }));
assert.equal(l.meter.label, 'باقي 3 أيام'); assert.equal(l.meter.tone, 'red'); assert.equal(l.edge, 'red'); assert.equal(l.step, 0); assert.ok(l.stepDone);
assert.equal(Math.round(l.meter.pct), 90);
// Ended two days ago; with a sitting ahead and a procedure the story tells both.
l = line(mk({ type: 'حكم أول درجة', date: '2026-10-11', outcome: 'لصالحنا', procedures: [{ id: 'p', date: '2026-11-10', decision: 'تأجيل للاطلاع' }] }));
assert.equal(l.meter.label, 'انتهى منذ يومين'); assert.equal(l.meter.tone, 'grey');
assert.equal(caseLine(mk({ type: 'حكم أول درجة', date: '2026-10-11', outcome: 'لصالحنا', procedures: [{ id: 'p', date: '2026-11-10', decision: 'تأجيل للاطلاع' }] }), caseState(mk({ type: 'حكم أول درجة', date: '2026-10-11', outcome: 'لصالحنا' }), DEFAULT_RULES, today), DEFAULT_RULES, { hearing: '2026-11-20', today }).story, 'الجلسة القادمة 20/11 · 10/11: تأجيل للاطلاع');
// Cassation is final; an appealed judgment says so; no date says what is missing.
assert.equal(line(mk({ type: 'حكم تمييز', date: '2026-10-01', outcome: 'لصالحنا' })).meter.label, 'نهائي');
assert.equal(line(mk({ type: 'حكم تمييز', date: '2026-10-01', outcome: 'لصالحنا' })).step, 2);
assert.equal(line(mk({ type: 'حكم أول درجة', date: '2026-11-01', outcome: 'غير صالحنا', appealConfirmation: 'تم' })).meter.label, 'طُعن فيه');
l = line(mk({ type: 'حكم أول درجة', date: '', outcome: 'غير محدد' }));
assert.equal(l.meter.label, 'بلا تاريخ حكم'); assert.equal(l.edge, 'amber'); assert.match(l.story, /ينقصه تاريخ الحكم/);
// Execution running: last step, green.
l = line(mk({ type: 'حكم أول درجة', date: '2026-06-01', outcome: 'لصالحنا', executionNote: 'تم فتح ملف التنفيذ', executionStage: 'حجز راتب' }));
assert.equal(l.step, 3); assert.equal(l.edge, 'green'); assert.match(l.story, /التنفيذ: حجز راتب/);

const cases = [mk({ id: 'a', type: 'حكم أول درجة', date: '2026-10-16', outcome: 'لصالحنا', clientEntityId: 'x' }), mk({ id: 'b', type: 'حكم استئناف', date: '2026-11-02', outcome: 'غير صالحنا', clientEntityId: 'x' }), mk({ id: 'c2', type: 'حكم تمييز', date: '2026-01-02', outcome: 'لصالحنا', insurance: true })];
const p = casePulse(cases, DEFAULT_RULES, today);
assert.deepEqual(p.levels, [1, 1, 1]); assert.equal(p.outcome['لصالحنا'], 2); assert.equal(p.deadline.week, 1); assert.equal(p.insurance.total, 1);

const st = clientStats(cases, DEFAULT_RULES, today);
assert.deepEqual({ ...st.get('x') }, { cases: 2, favour: 1, against: 1, open: 0, executing: 0, ready: 0, week: 1, last: '2026-11-02', month: 1 });
const cl = clientLine({ id: 'x', name: 'م', kind: 'organization', sector: 'other', contacts: [{ id: 'p' }], aliases: [], notes: '', needsReview: false, revision: 0 }, st.get('x'), today);
assert.equal(cl.story, 'ميعاد طعن ينتهي خلال أسبوع · آخر حكم 02/11'); assert.equal(cl.edge, 'red');

const w = v => ({ id: 'w', revision: 0, caseId: '', title: 't', kind: 'task', dueDate: today, dueTime: '', assigneeId: 'u', priority: 'normal', status: 'open', location: '', notes: '', completionNote: '', ...v });
assert.equal(workLine(w({ dueDate: '2026-11-10' }), today).story, 'متأخرة يومين · لم تبدأ'); assert.equal(workLine(w({ dueDate: '2026-11-11' }), today).story, 'متأخرة يوماً واحداً · لم تبدأ');
assert.equal(workLine(w({ dueDate: '2026-11-13', location: 'قصر العدل' }), today).story, 'غداً · لم تبدأ · قصر العدل');
assert.equal(workLine(w({ dueDate: '2026-11-17' }), today).story, 'بعد 5 أيام · لم تبدأ');
assert.equal(workLine(w({ dueTime: '09:30' }), today).edge, 'amber');
assert.equal(workLine(w({ status: 'done', completedAt: '2026-11-08T10:00:00Z', completionNote: 'سُلّم' }), today).story, 'أُنجزت 08/11 «سُلّم»');
const wp = workPulse([w({ dueDate: '2026-11-10' }), w({ dueDate: today, kind: 'hearing' }), w({ dueDate: '2026-12-30', priority: 'urgent' }), w({ status: 'done' })], today);
assert.equal(wp.late, 1); assert.equal(wp.days[0].value, 1); assert.equal(wp.days[0].label, 'اليوم'); assert.equal(wp.days[1].label, 'جمعة'); assert.equal(wp.later, 1); assert.equal(wp.total, 3); assert.equal(wp.urgent, 1); assert.equal(wp.hearings, 1);
console.log('Informative lines: case, client and task stories and summary counts are right.');

// Collection files and paper files.
const { collectionLine } = await import('../lib/collection-line.ts');
const { archiveLine } = await import('../lib/archive-line.ts');
const pos = { claim: 1000000, fee: 0, total: 1000000, paid: 250000, external: 0, expenses: 0, remaining: 750000, net: 250000 };
let cl2 = collectionLine(pos, [{ category: 'calls', action: 'اتصال بالخصم', reviewDate: '2026-11-09', status: 'notDone', text: '', phone: '', contactParty: '', method: '' }], [{ type: 'payment', date: '2026-11-03', amount: '250', method: '', reference: '', notes: '' }], today, { assigned: true });
assert.equal(cl2.story, 'إفادة مستحقة منذ 3 أيام: اتصال بالخصم · آخر دفعة 250.000 د.ك في 03/11'); assert.equal(cl2.edge, 'red'); assert.equal(cl2.pct, 25);
cl2 = collectionLine({ ...pos, paid: 1000000, remaining: 0 }, [], [], today, { assigned: false });
assert.equal(cl2.story, 'لا دفعات بعد · غير موزّع'); assert.ok(cl2.paidAll);
const cust = v => ({ state: 'in', locationId: '', holder: '', holderId: '', dueDate: '', since: '', purpose: '', lastAudit: '', last: null, ...v });
assert.equal(archiveLine(cust({ since: '2026-10-01', lastAudit: '2026-11-01' }), today).story, 'منذ 01/10 · آخر جرد 01/11');
let al = archiveLine(cust({ state: 'staff', holder: 'أحمد', since: '2026-11-01', purpose: 'حضور جلسة', dueDate: '2026-11-10' }), today);
assert.equal(al.story, 'مع أحمد منذ 01/11 · حضور جلسة · متأخر يومين'); assert.equal(al.edge, 'red');
al = archiveLine(cust({ state: 'court', holder: 'إدارة التنفيذ', dueDate: '2026-11-20' }), today);
assert.equal(al.story, 'مع إدارة التنفيذ · يعود 20/11'); assert.equal(al.edge, 'amber');
console.log('Collection and archive lines are right too.');

// The register's lawyer and file-status filters.
const { matchesCaseFilters, EMPTY_CASE_FILTERS } = await import('../lib/case-browse.ts');
const f = v => ({ ...EMPTY_CASE_FILTERS, ...v });
const withLawyer = mk({ lawyer: 'آية زينهم', legacyStatus: 'متداول' }), without = mk({ lawyer: ' ', legacyStatus: 'منتهي' }), blank = mk({ lawyer: '' });
assert.deepEqual([withLawyer, without, blank].map(c => matchesCaseFilters(c, f({ lawyerSet: 'none' }))), [false, true, true]);
assert.deepEqual([withLawyer, without, blank].map(c => matchesCaseFilters(c, f({ lawyerSet: 'set' }))), [true, false, false]);
assert.deepEqual([withLawyer, without, blank].map(c => matchesCaseFilters(c, f({ fileStatus: 'منتهي' }))), [false, true, false]);
assert.deepEqual([withLawyer, without, blank].map(c => matchesCaseFilters(c, f({ fileStatus: '-' }))), [false, false, true]);
console.log('Lawyer and file-status filters pick the right cases.');
