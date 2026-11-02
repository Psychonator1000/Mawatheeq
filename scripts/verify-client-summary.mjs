// «ملخص الموكلين»: status buckets, one count per case across court levels, totals and the person groups.
import assert from 'node:assert/strict';
import { emptyCase, DEFAULT_RULES } from '../lib/domain.ts';
import { statusOf, casesOnce, summarize, samePerson, personGroups, casesFor } from '../lib/client-summary.ts';

const mk = (id, extra) => ({ ...emptyCase(), id, ...extra });
assert.equal(statusOf(mk('a', { legacyStatus: 'تحت الرفع' })), 'filing');
assert.equal(statusOf(mk('a', { legacyStatus: 'متداول', stage: 'استئناف' })), 'open2');
assert.equal(statusOf(mk('a', { legacyStatus: 'متداول', type: 'حكم تمييز' })), 'open3', 'The level comes from the judgment type when no stage is set');
assert.equal(statusOf(mk('a', { legacyStatus: '' })), 'open1', 'A case made in the app is open at its level');
assert.equal(statusOf(mk('a', { legacyStatus: 'وقف موكل ملف رقم حولي' })), 'stayed');
assert.equal(statusOf(mk('a', { legacyStatus: 'مشطوب' })), 'stayed');
assert.equal(statusOf(mk('a', { legacyStatus: 'مضمومه' })), 'closed');
assert.equal(statusOf(mk('a', { legacyStatus: 'متداول', archived: true })), 'closed', 'Archived counts as finished');
assert.equal(statusOf(mk('a', { legacyStatus: 'تنفيذ ملف رقم الفروانيه' })), 'execution');
assert.equal(statusOf(mk('a', { legacyStatus: 'متابعه' })), 'follow');

// Records of one case at several levels count once, at the highest level; an insurance code is its own case.
const levels = [mk('l1', { code: '326', autoNumber: '9', stage: 'ابتدائي', legacyStatus: 'متداول' }), mk('l2', { code: '326', autoNumber: '9', type: 'حكم تمييز', legacyStatus: 'متداول' }), mk('i', { code: '326', insurance: true })];
assert.deepEqual(casesOnce(levels).map(c => c.id).sort(), ['i', 'l2']);

const today = '2026-11-02';
const row = summarize([
  ...levels,
  mk('s', { code: '5', legacyStatus: 'متداول', procedures: [{ id: 'p', kind: 'جلسة', date: '2026-10-20', followup: '2026-11-05' }], lawyer: 'سالم', contractNumber: 'ع-1', contractFee: '1,500' }),
  mk('w', { code: '6', legacyStatus: 'منتهي', date: '2025-01-01', outcome: 'لصالحنا', lawyer: 'سالم' }),
], DEFAULT_RULES, today);
assert.equal(row.total, 4); assert.equal(row.open, 3); assert.equal(row.counts.open3, 1); assert.equal(row.counts.closed, 1);
assert.deepEqual([row.next7, row.next30, row.nextDate], [1, 1, '2026-11-05'], 'Coming sessions from the last adjournment');
assert.equal(row.won, 1); assert.equal(row.fees, 1500); assert.equal(row.noContract, 2, 'Open cases without a contract');
assert.deepEqual(row.lawyers, [['سالم', 1]], 'Lawyers of open cases');
// The list behind each number is exactly what the number counts.
{const all=[...levels,mk('s',{code:'5',legacyStatus:'متداول',procedures:[{id:'p',kind:'جلسة',date:'2026-10-20',followup:'2026-11-05'}],lawyer:'سالم',contractNumber:'ع-1',contractFee:'1,500'}),mk('w',{code:'6',legacyStatus:'منتهي',date:'2025-01-01',outcome:'لصالحنا'})];
 const r=summarize(all,DEFAULT_RULES,today);
 for(const k of ['total','open','next7','next30','won','lost','appealOpen','noContract'])assert.equal(casesFor(all,k,DEFAULT_RULES,today).length,r[k],'List and count agree: '+k);
 for(const k of Object.keys(r.counts))assert.equal(casesFor(all,k,DEFAULT_RULES,today).length,r.counts[k],'List and count agree: '+k);
 assert.deepEqual(casesFor(all,'total',DEFAULT_RULES,today).map(c=>c.code),['5','6','326','326'],'By code, each case once');
 assert.deepEqual(casesFor(all,'next7',DEFAULT_RULES,today).map(c=>c.id),['s']);}

// People: the same name written two ways, and grouping only when a person links several files.
assert.ok(samePerson('طلال محمد المطيري', 'طلال محمد عبدالله المطيري'));
assert.ok(samePerson('طلال محمد عبد الله المطيري', 'طلال محمد عبدالله المطيري'));
assert.ok(!samePerson('طلال محمد المطيري', 'طلال سعد العجمي'));
assert.ok(!samePerson('جميل', 'جميل'), 'A single name is not enough to link files');
const contact = name => ({ id: name, name, role: '', phone: '', notes: '' });
const clients = [
  { id: 'elec', name: 'الشركة العربية للكهرباء', kind: 'organization', sector: 'other', contacts: [contact('طلال محمد المطيري'), contact('فارس الحجوج')], aliases: [], notes: '', needsReview: false },
  { id: 'qur', name: 'شركة القريفة العقارية', kind: 'organization', sector: 'other', contacts: [contact('طلال محمد عبدالله المطيري')], aliases: [], notes: '', needsReview: false },
  { id: 'talal', name: 'طلال محمد عبدالله المطيري', kind: 'individual', sector: 'other', contacts: [], aliases: [], notes: '', needsReview: false },
  { id: 'other', name: 'بيت التمويل الكويتي', kind: 'organization', sector: 'other', contacts: [], aliases: [], notes: '', needsReview: false },
];
const groups = personGroups(clients);
assert.deepEqual(groups.map(g => [g.person, g.clients.map(c => c.id).sort()]), [['طلال محمد عبدالله المطيري', ['elec', 'qur', 'talal']]], 'One heading for the person behind several files; an owner of one file is no heading');
console.log('Passed client summary: status buckets, one count per case, totals and extras, person groups.');
