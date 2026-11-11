// «مهام اليوم والتقرير»: whose missions are whose, late and done states, the report filling itself, the team view.
import assert from 'node:assert/strict';
import { performance, periods, lineText, agendaBetween, datesAhead, passesDates, cleanReport, emptyReport, missionsFor, namesPerson, passesFilter, readReport, reportCount, reportText, reportsHtml, teamDay, teamStatus, withDone } from '../lib/daily-report.ts';
import { plainName, titled } from '../lib/staff-accounts.ts';
import { matchLawyer } from '../lib/lawyer-match.ts';
const today = '2026-11-09';
const base = { code: '', autoNumber: '', client: 'شركة', clientGroup: '', opponent: 'خصم', role: '', type: 'حكم أول درجة', ruling: '', outcome: 'غير محدد', appealRecorded: '', appealConfirmation: '', date: '', notes: '', court: 'الكلية', lawyer: '', procedures: [] };
const sitting = (date, followup, extra = {}) => ({ id: 'p' + date, date, kind: 'جلسة', venue: 'المحكمة', court: 'الكلية', decision: 'تأجيل', text: 'تأجيل', followup, ...extra });
const c1 = { ...base, id: 'c1', code: '101', lawyer: 'أحمد علي', procedures: [sitting('2026-10-01', today)] };
const c2 = { ...base, id: 'c2', code: '102', lawyer: 'سارة', procedures: [sitting('2026-10-01', today)] };
const c3 = { ...base, id: 'c3', code: '103', lawyer: 'احمد علي', procedures: [sitting('2026-10-01', '2026-11-05')] }; // overdue, not posted
const c4 = { ...base, id: 'c4', code: '104', lawyer: 'سارة', procedures: [sitting('2026-10-01', today), sitting(today, '2026-12-01', { decision: 'حجز للحكم', text: 'حجز للحكم' })] }; // posted today
const c5 = { ...base, id: 'c5', code: '105', lawyer: 'أحمد علي', procedures: [{ id: 'f', date: '2026-11-01', kind: 'إجراء', text: 'مراجعة الخبير', followup: today }] };
const records = [c1, c2, c3, c4, c5];
const members = [{ id: 'u1', username: 'ahmad', displayName: 'أحمد علي', enabled: true }, { id: 'u2', username: 'sara', displayName: 'سارة', enabled: true }];
const work = [
  { id: 'w1', revision: 1, caseId: 'c2', title: 'حضور', kind: 'hearing', dueDate: today, dueTime: '09:00', assigneeId: 'u1', priority: 'normal', status: 'open', location: '', notes: '', completionNote: '' },
  { id: 'w2', revision: 1, caseId: '', title: 'إيداع مذكرة', kind: 'task', dueDate: today, dueTime: '', assigneeId: 'u2', priority: 'normal', status: 'open', location: 'الكلية', notes: '', completionNote: '' },
  { id: 'w3', revision: 1, caseId: '', title: 'مراجعة الإدارة', kind: 'task', dueDate: '2026-11-07', dueTime: '', assigneeId: 'u2', priority: 'normal', status: 'in_progress', location: '', notes: '', completionNote: '' },
  { id: 'w4', revision: 1, caseId: '', title: 'تصوير ملف', kind: 'task', dueDate: today, dueTime: '', assigneeId: 'u2', priority: 'normal', status: 'done', location: '', notes: '', completionNote: 'صُوّر' },
];
const of = (person, date = today, extra = {}) => missionsFor({ records, work, members, date, today, person, viewerId: typeof person === 'object' ? person.id : '', ...extra });
const keys = list => list.map(m => m.key).sort();

assert.ok(namesPerson('احمد علي', members[0]) && !namesPerson('سارة', members[0]), 'The lawyer named on a case, spelling variants included');
const ahmad = of(members[0]);
// c1 by name, c2 because Ahmad is assigned to attend it (though Sara is its lawyer), c3 late, c5 a follow-up.
assert.deepEqual(keys(ahmad.filter(m => m.kind === 'hearing')), ['h:c1:' + today, 'h:c2:' + today, 'h:c3:2026-11-05'].sort(), 'Ahmad: his sittings, the one he attends, the late one');
assert.equal(ahmad.find(m => m.key === 'h:c3:2026-11-05').state, 'late', 'A sitting not posted is late');
assert.equal(ahmad[0].state, 'late', 'Late missions come first');
assert.ok(ahmad.some(m => m.kind === 'followup' && m.c.id === 'c5'), 'A follow-up date set on a procedure');
assert.ok(!ahmad.some(m => m.kind === 'task'), 'Nobody else\'s tasks');
const sara = of(members[1]);
assert.ok(!sara.some(m => m.key === 'h:c2:' + today), 'A sitting someone else attends leaves the lawyer\'s list');
assert.equal(sara.find(m => m.key === 'h:c4:' + today).state, 'done', 'A sitting posted today is done');
assert.match(sara.find(m => m.key === 'h:c4:' + today).result, /حجز للحكم/);
assert.deepEqual(sara.filter(m => m.kind === 'task').map(m => [m.key, m.state]).sort(), [['w:w2', 'open'], ['w:w3', 'late'], ['w:w4', 'done']], 'Tasks of the day, late and closed');
// Another day: no late items carried in, only that day.
assert.ok(!of(members[1], '2026-11-10').some(m => m.state === 'late'), 'Late items come in on today only');
// The whole team, and an account seeing only its own cases.
assert.equal(new Set(of('all').map(m => m.key)).size, of('all').length, 'Each mission once');
assert.ok(of('all').length >= ahmad.length + sara.length - 1);
const other = { id: 'u3', username: 'trainee', displayName: 'متدرب' };
assert.equal(of(other).filter(m => m.kind === 'hearing').length, 0, 'Not named, not assigned: nothing');
assert.ok(of(other, today, { ownCasesOnly: true, members: [...members, other] }).length === 0, 'Own-cases accounts take only sittings no colleague is named on');
const mine = missionsFor({ records: [{ ...c1, lawyer: 'محامٍ آخر' }], work: [], members, date: today, today, person: other, ownCasesOnly: true, viewerId: 'u3' });
assert.equal(mine.length, 1, 'An unnamed sitting of a case given to this account is theirs');
// Filters.
assert.deepEqual(['all', 'hearing', 'task', 'dates', 'late'].map(f => sara.filter(m => passesFilter(m, f)).length), [sara.length, sara.filter(m => m.kind === 'hearing').length, 3, 0, 1]);

// The report fills itself with what was done, once, and keeps what was written by hand.
let r = withDone({ ...emptyReport(), other: [{ text: 'مراجعة', result: '' }] }, sara);
assert.equal(r.hearings.length, 1, 'The sitting posted today');
assert.equal(r.tasks.length, 1, 'The task closed today');
assert.equal(r.other[0].text, 'مراجعة');
assert.equal(withDone(r, sara), r, 'Nothing added twice');
r = { ...r, hearings: [] , tasks: r.tasks };
assert.equal(withDone({ ...r, hearings: [{ key: 'h:c4:' + today, text: 'edited', result: 'x' }] }, sara).hearings.length, 1, 'A line already there (by key) is not added again');
// Stored payloads are read safely and empty lines are dropped on saving.
assert.deepEqual(readReport(null), emptyReport());
assert.deepEqual(readReport({ admin: [{ text: 1, result: null }, 'x'], notes: 5 }).admin, [{ text: '1', result: '' }]);
const clean = cleanReport({ ...emptyReport(), admin: [{ text: ' ', result: '' }, { text: 'قيد صحيفة', result: 'تم' }], notes: '  ملاحظة ' });
assert.deepEqual(clean.admin, [{ text: 'قيد صحيفة', result: 'تم' }]);
assert.equal(reportCount(clean), 2);
assert.match(reportText(clean, 'سارة', '09/11/2026'), /ثالثاً: الأعمال الإدارية داخل المحاكم\n1\. قيد صحيفة — تم/);
assert.match(reportText(clean, 'سارة', '09/11/2026'), /ملخص اليوم: 0 جلسات · 1 أعمال إدارية/);
// A posted sitting fills the four fields of its line; an older report without them still reads.
const hearingLine = withDone(emptyReport(), sara).hearings[0];
assert.deepEqual([hearingLine.text, hearingLine.court, hearingLine.result, hearingLine.next], ['104', 'الكلية', 'حجز للحكم', 'الجلسة القادمة 01/12/2026']);
assert.deepEqual(readReport({ hearings: [{ text: '2310 · الكلية', result: 'تأجيل' }] }).hearings, [{ text: '2310 · الكلية', result: 'تأجيل' }]);
assert.deepEqual(readReport({ external: [{ text: 'الداخلية', subject: 'شهادة', result: 'تم', court: '' }] }).external, [{ text: 'الداخلية', subject: 'شهادة', result: 'تم' }]);
assert.equal(lineText({ text: 'الداخلية', subject: 'شهادة', result: 'تم' }, 'external'), 'الداخلية — شهادة — تم');
const html = reportsHtml([{ name: '<سارة>', date: '09/11/2026', payload: clean, sent: '' }], 'owner', '09/11/2026');
assert.ok(html.includes('&lt;سارة&gt;') && !html.includes('<سارة>'), 'Printed names are escaped');

// Team view: who sent, who has a draft, who wrote nothing; someone who wrote without being expected still shows.
const expected = [{ userId: 'u1', username: 'ahmad', displayName: 'أحمد علي' }, { userId: 'u2', username: 'sara', displayName: 'سارة' }, { userId: 'u4', username: 'x', displayName: 'خالد' }];
const reports = [{ userId: 'u1', username: 'ahmad', displayName: 'أحمد علي', date: today, payload: {}, submittedAt: today + 'T10:00:00Z', updatedAt: '', revision: 2 },
  { userId: 'u2', username: 'sara', displayName: 'سارة', date: today, payload: {}, submittedAt: null, updatedAt: '', revision: 1 },
  { userId: 'u5', username: 'y', displayName: 'يوسف', date: today, payload: {}, submittedAt: null, updatedAt: '', revision: 1 }];
assert.deepEqual(teamStatus(expected, reports, today).map(t => [t.userId, t.status]), [['u4', 'none'], ['u2', 'draft'], ['u5', 'draft'], ['u1', 'sent']]);
// «الفريق اليوم»: each person's sittings and tasks of the day (done of all) and what is late, beside their report.
const board = Object.fromEntries(teamDay({ expected, reports, date: today, today, records, work, members }).map(r => [r.userId, r]));
const line = r => [r.status, r.hearings, r.hearingsDone, r.tasks, r.tasksDone, r.late];
assert.deepEqual(line(board.u2), ['draft', 1, 1, 2, 1, 1], 'Sara: c4 posted; two tasks, one done; the task of the 7th late');
assert.deepEqual(line(board.u1), ['sent', 2, 0, 0, 0, 1], 'Ahmad: c1 and c2 (assigned) to post; c3 late');
assert.deepEqual(line(board.u4), ['none', 0, 0, 0, 0, 0], 'Someone without an account in the members list: the report only');
// «المواعيد»: follow-ups ahead for the person; «التقويم»: each day's sittings and tasks.
const ahead = datesAhead({ records, work, members, today, person: members[0], viewerId: 'u1' });
assert.ok(ahead.some(m => m.kind === 'followup' && m.c.id === 'c5'), 'A follow-up set for today is listed');
assert.ok(ahead.every(m => m.date >= '2026-11-02'), 'Nothing older than a week');
assert.equal(ahead.filter(m => passesDates(m, 'followup', today)).length, ahead.filter(m => m.kind === 'followup').length);
const cal = agendaBetween({ records, work, members, today, person: members[1], viewerId: 'u2' }, '2026-11-01', '2026-11-30');
assert.equal(cal.get(today).hearings, 1, 'Sara: one sitting posted today (c4); c2 is attended by Ahmad');
assert.equal(cal.get(today).tasks, 2, 'Her two tasks of today');
assert.equal(cal.get('2026-11-07').tasks, 1, 'The late task on its own day');
assert.equal(agendaBetween({ records, work, members, today, person: 'all' }, '2026-11-01', '2026-11-30').get(today).hearings, 3, 'The office: c1, c2 due and c4 posted');
// «الأداء»: reports sent against working days, the same day or later, what they hold, sittings posted, overdue now.
const rep = (userId, username, date, submittedAt, payload) => ({ userId, username, displayName: username, date, payload, submittedAt, updatedAt: '', revision: 1 });
const recs = [{ ...c4, procedures: c4.procedures.map(p => ({ ...p, recordedBy: 'sara' })) }, c3];
const stats = performance({ people: expected.slice(0, 2), today, from: '2026-11-01', to: today, records: recs, work, members,
  reports: [rep('u2', 'sara', today, today + 'T09:00:00Z', { admin: [{ text: 'قيد', result: '' }], external: [{ text: 'الداخلية', result: '' }], hearings: [{ text: '104', result: 'حجز' }] }),
    rep('u2', 'sara', '2026-11-08', '2026-11-09T05:00:00Z', {}), rep('u1', 'ahmad', today, null, { tasks: [{ text: 'x', result: 'y' }] })] });
const s2 = stats.find(x => x.userId === 'u2'), s1 = stats.find(x => x.userId === 'u1');
assert.equal(s2.workDays, 7, 'Working days from 1 to 9 November 2026 (Friday and Saturday off)');
assert.deepEqual([s2.sent, s2.sameDay, s2.drafts, s2.hearings, s2.admin, s2.external], [2, 1, 0, 1, 1, 1], 'Sent, the same day, and what the reports hold');
assert.equal(s2.posted, 1, 'The sittings she posted in the cases in the period (the October one is outside it)');
assert.equal(s2.lateNow, 1, 'Her task overdue now');
assert.deepEqual([s1.sent, s1.drafts, s1.tasks], [0, 1, 1], 'A draft is not counted as sent');
assert.ok(s1.lateNow >= 1, 'His sitting not posted is overdue');
assert.equal(stats[0].userId, 'u2', 'Most reports sent first');
assert.deepEqual(periods('2026-11-09').map(p => p.slice(2)), [['2026-11-08', '2026-11-09'], ['2026-11-01', '2026-11-09'], ['2026-10-01', '2026-10-31'], ['2026-10-11', '2026-11-09']]);
// Names are plain and «أ/» is added when shown, however the title was written (owner, 11 November 2026).
for (const n of ['ا/ احمد ابواليزيد', 'أ/ احمد ابواليزيد', 'ا. احمد ابواليزيد', 'الأستاذ احمد ابواليزيد', 'احمد ابواليزيد']) { assert.equal(plainName(n), 'احمد ابواليزيد', n); assert.equal(titled(n), 'أ/ احمد ابواليزيد', n); }
assert.equal(titled('المحامى يوسف الشطى'), 'أ/ يوسف الشطى'); assert.equal(plainName('المحاسب'), 'المحاسب'); assert.equal(titled(''), '');
assert.equal(matchLawyer('احمد ابواليزيد', ['ا/ احمد ابواليزيد', 'ا/ اسلام محمد']), 'ا/ احمد ابواليزيد', 'A plain account name still finds the cases written with the title');
console.log('Passed daily report: missions by person (named lawyer, assigned attendee, own cases), late and done states, filters, the report filling itself once, safe reading, text and print, team status, names shown with «أ/».');
