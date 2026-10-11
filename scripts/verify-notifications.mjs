import assert from 'node:assert/strict';
import { buildNotices, myWork } from '../lib/notifications.ts';
import { caseState, DEFAULT_RULES } from '../lib/domain.ts';

const today = '2026-10-11';
const work = (id, extra) => ({ id, revision: 1, caseId: '', title: 'عمل ' + id, kind: 'task', dueDate: today, dueTime: '', assigneeId: 'me', priority: 'normal', status: 'open', location: '', notes: '', completionNote: '', ...extra });
const items = [
  work('late', { dueDate: '2026-10-09' }),
  work('today', { kind: 'hearing', dueTime: '09:00', location: 'المحكمة الكلية' }),
  work('urgent', { priority: 'urgent' }),
  work('future', { dueDate: '2026-10-14' }),
  work('far', { dueDate: '2026-11-30' }),
  work('done', { status: 'done', dueDate: '2026-10-01' }),
  work('cancelled', { status: 'cancelled' }),
  work('other', { assigneeId: 'someone-else' }),
  work('undated', { dueDate: '' }),
];
const base = { procedures: [], archived: false, outcome: 'لصالحنا', type: 'حكم أول درجة', appealRecorded: '', role: '' };
const cases = [
  { ...base, id: 'soon', code: 'SOON', date: '2026-09-13' },
  { ...base, id: 'expired-1', code: 'OLD1', date: '2026-01-01' },
  { ...base, id: 'expired-2', code: 'OLD2', date: '2026-02-01' },
  { ...base, id: 'archived', code: 'ARCH', date: '2026-09-13', archived: true },
  { ...base, id: 'follow', code: 'FOLLOW', date: '', procedures: [{ id: 'p1', date: '2026-10-01', text: 'مراجعة إدارة التنفيذ', followup: today }, { id: 'p2', date: '2026-10-01', text: 'لاحقاً', followup: '2026-10-20' }] },
];
const stateOf = c => caseState(c, DEFAULT_RULES, today);
const notices = buildNotices({ cases, stateOf, work: items, userId: 'me', today, showDeadlines: true, showWork: true });
const ids = notices.map(n => n.id);

assert.deepEqual(ids.filter(id => id.startsWith('work-')).sort(), ['work-late', 'work-today', 'work-urgent'], 'Only my open overdue/today work');
assert.equal(notices.find(n => n.id === 'work-late').tone, 'danger');
assert.equal(notices.find(n => n.id === 'work-urgent').tone, 'danger');
assert.equal(notices.find(n => n.id === 'work-today').tone, 'warning');
assert.match(notices.find(n => n.id === 'work-today').detail, /09:00 · المحكمة الكلية/);
assert.ok(ids.includes('deadline-soon'), 'Deadline within the warning window is listed');
assert.ok(!ids.includes('deadline-archived'), 'Archived cases do not alert');
assert.equal(notices.find(n => n.id === 'deadline-expired').title, '2 قضية انتهت مهلة الطعن فيها', 'Expired deadlines are summarized once');
assert.ok(ids.includes('followup-follow-p1') && !ids.includes('followup-follow-p2'), 'Only follow-ups due today');
assert.deepEqual(notices.map(n => n.tone), [...notices.map(n => n.tone)].sort((a, b) => ['danger', 'warning', 'info'].indexOf(a) - ['danger', 'warning', 'info'].indexOf(b)), 'Most urgent first');

assert.equal(buildNotices({ cases, stateOf, work: items, userId: 'me', today, showDeadlines: false, showWork: false }).length, 0, 'Hidden sections produce no alerts');
assert.ok(buildNotices({ cases, stateOf, work: items, userId: 'me', today, showDeadlines: false, showWork: true }).every(n => n.view === 'work'));

const feed = { lastRead: 5, items: [
  { id: 7, targetType: 'case', targetId: 'soon', author: 'clerk', body: 'راجع   الإعلان\nقبل الجلسة' },
  { id: 6, targetType: 'work', targetId: 'today', author: 'lead', body: 'x'.repeat(120) },
  { id: 5, targetType: 'case', targetId: 'soon', author: 'old', body: 'مقروء' },
] };
const withMentions = buildNotices({ cases, stateOf, work: items, userId: 'me', today, showDeadlines: false, showWork: false, mentions: feed });
assert.deepEqual(withMentions.map(n => n.id), ['mention-6', 'mention-7'], 'Unread mentions only, even when other sections are hidden');
const caseMention = withMentions.find(n => n.id === 'mention-7');
assert.equal(caseMention.title, 'أشار إليك clerk'); assert.equal(caseMention.detail, 'راجع الإعلان قبل الجلسة', 'Whitespace collapsed');
assert.equal(caseMention.caseId, 'soon'); assert.equal(caseMention.mentionId, 7); assert.equal(caseMention.workId, undefined);
const workMention = withMentions.find(n => n.id === 'mention-6');
assert.equal(workMention.workId, 'today'); assert.equal(workMention.view, 'work'); assert.equal(workMention.detail.length, 91, 'Long comments are shortened');
assert.equal(buildNotices({ cases, stateOf, work: items, userId: 'me', today, showDeadlines: false, showWork: false, mentions: null }).length, 0);

const mine = myWork(items, 'me', today, '2026-10-18');
assert.deepEqual(mine.overdue.map(w => w.id), ['late']);
assert.deepEqual(mine.today.map(w => w.id), ['urgent', 'today'], 'Untimed work sorts before timed work on the same day');
assert.deepEqual(mine.upcoming.map(w => w.id), ['future'], 'Upcoming stops at the horizon');

console.log('Passed: unread @mention alerts, personal work alerts, approaching and expired deadlines, today follow-ups, archived/section exclusions, urgency order and personal agenda grouping.');
