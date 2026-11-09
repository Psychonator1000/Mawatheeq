// The database's case_state() must agree with caseState() in lib/domain.ts on every field, for every kind of case:
// thousands of generated cases mixing every value the rules look at, odd and broken ones included, on several days and
// with the default and changed rules.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { caseState, DEFAULT_RULES } from '../lib/domain.ts';

const db = new PGlite();
await db.exec('create schema mawatheeq_private; create role anon; create role authenticated;');
await db.exec(fs.readFileSync('supabase/migrations/20261119000000_case_state.sql', 'utf8'));

let seed = 20261109;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rand() * a.length)];
const DATES = ['', '2026-11-09', '2026-11-04', '2026-10-10', '2026-10-09', '2026-09-10', '2026-08-01', '2025-12-31', '2024-02-29', '2025-02-29', '2026-02-30', '2026-13-01', '2026-1-5', '09/11/2026', 'غير معروف', '2026-11-14', '2026-11-15', '2026-12-31', '2027-01-01', '1999-01-01', '2026-10-08', '2026-10-12'];
// Besides made-up values, the words the office's own cases use (the labels only, no case details).
const TYPES = ['يحتاج مراجعة', 'حكم أول درجة', 'حكم ابتدائي', 'حكم استئناف', 'حكم تمييز', 'إشكال', '', 'أمر أداء', 'حكم', undefined];
const OUTCOMES = ['لصالحنا -', 'لصالحنا', 'لصالحنا جزئياً', 'غير صالحنا', 'غير صالح', 'غير صالحنا (رفض)', 'غير محدد', '', 'صالحنا', 'لصالح الخصم', undefined];
const ROLES = ['متهمين', 'متهم وشاكي', 'متهم / معارض', 'متهمه ثانيه', 'متهم5ومدعى مدني', 'مدعيه', 'مستانف ض', 'شاكى', 'مدعي', 'متهم', 'متهمة', 'مُتّهم', 'جاني', 'جانية', ' متهم ', 'متّهمه', 'مدعى عليه', '', 'المتهم', 'جانـي', '\u00a0متهم', 'متهم\t', 'مـتـهـم', '\u2003متهم\u3000', '\ufeffجانية', 'متهم\n', undefined];
const RECORDED = ['تم ', 'مؤجل', 'تم الطعن', 'لم ينجز', 'إعادة الى اول درجة', 'تم الاستنئاف', 'غير منجز', '', 'تم', 'تم الاستئناف', 'تم التمييز', 'لا يوجد', 'منتهي', 'غير مؤكد', 'تمت', undefined];
const CONFIRM = ['', '', '', 'تم', 'لا يوجد', 'غير مؤكد', 'شيء آخر'];
const NOTES = ['مراجعة المستشار', 'لم يتم عمل اجراءات التنفيذ', 'لم يتم فتح ملف التنفيذ', '', 'غير متداول', 'تم عمل اجراءات التنفيذ', 'تم فتح ملف التنفيذ', 'متداول', undefined];
const LEGACY = ['', 'تم الاستئناف بتاريخ', 'لا شيء', undefined];
const EXEC_LEGACY = ['', 'يوجد استئناف', 'لا يوجد استئناف', undefined];
const NOACTION = ['', 'نعم', 'لا', undefined];
const cases = [];
for (let i = 0; i < 30000; i++) {
  const c = { id: 'c' + i, date: pick(DATES), type: pick(TYPES), outcome: pick(OUTCOMES), role: pick(ROLES), appealRecorded: pick(RECORDED), appealConfirmation: pick(CONFIRM),
    executionNote: pick(NOTES), legacyNotes: pick(LEGACY), executionLegacy: pick(EXEC_LEGACY), noActionConfirmation: pick(NOACTION) };
  const st = rand(); if (st < 0.15) c.stages = [{ level: 'appeal' }]; else if (st < 0.2) c.stages = [];
  for (const k of Object.keys(c)) if (c[k] === undefined) delete c[k];
  cases.push(c);
}
const RULES = [DEFAULT_RULES, { first: 7, appeal: 0, objection: 3, execution: 10, warning: 2 }];
const DAYS = ['2026-11-09', '2026-10-09', '2026-12-31', '2024-02-29'];
let checked = 0;
for (const rules of RULES) for (const today of DAYS) {
  const { rows } = await db.query('select mawatheeq_private.case_state(x,$2::jsonb,$3::date) s from jsonb_array_elements($1::jsonb) with ordinality t(x,i) order by i', [JSON.stringify(cases), JSON.stringify(rules), today]);
  cases.forEach((c, i) => {
    const want = { ...caseState(c, rules, today) }, got = rows[i].s;
    try { assert.deepEqual(got, want); } catch (e) { console.error('Case', JSON.stringify(c), 'rules', JSON.stringify(rules), 'today', today); throw e; }
    checked++;
  });
}
await db.close();
console.log(`Passed case state: the database agrees with the page on all ${checked} case-days (${cases.length} cases × ${DAYS.length} days × ${RULES.length} rule sets).`);
