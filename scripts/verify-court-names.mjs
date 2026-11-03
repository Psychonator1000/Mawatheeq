// Court names written out in full: abbreviations expanded, English letters dropped, the circuit number kept apart,
// and anything not certain left exactly as it was.
import assert from 'node:assert/strict';
import { fullCourtName, courtChoices } from '../lib/court-names.ts';
import { splitCircuit } from '../lib/circuits.ts';

const v = s => fullCourtName(s).value;
assert.equal(v('الكليه ت.م.ج/30'), 'المحكمة الكلية - تجاري مدني جزئي / 30');
assert.equal(v('الكليه ت.م.ج/A 30'), 'المحكمة الكلية - تجاري مدني جزئي / 30');
assert.equal(v('الرقعى ت.ك1'), 'محكمة الرقعي - تجاري كلي / 1');
assert.equal(v('الكليه س ج /3'), 'المحكمة الكلية - استئناف جزئي / 3');
assert.equal(v('الكليه ت.م.ك.ح/4'), 'المحكمة الكلية - تجاري مدني كلي حكومة / 4');
assert.equal(v('الكليه تمييزت/2'), 'المحكمة الكلية - تمييز تجاري / 2');
assert.equal(v('الرقعى جنح مستانف /2'), 'محكمة الرقعي - جنح مستأنفة / 2');
assert.equal(v('حولىH'), 'محكمة حولي');
assert.equal(v('عاصمه'), 'محكمة العاصمة');
assert.equal(v('ت جزئى / 1 · الدور 1'), 'تجاري جزئي / 1 · الدور 1');
assert.equal(v('المحكمة الكلية - تجاري مدني جزئي / 30'), 'المحكمة الكلية - تجاري مدني جزئي / 30', 'already full: unchanged');
// Not certain: left exactly as it was.
for (const s of ['الكليه ت جنايات /3', 'الرقعى جنح س /5', 'حنان سليمان العتيبي · قاعة 409', 'تحت الرفع']) {
  assert.equal(v(s), s); assert.equal(fullCourtName(s).changed, false);
}
// The court and the circuit number come apart in the circuit field.
const c = splitCircuit(v('الكليه ت.م.ج/30'));
assert.equal(c.kind, 'المحكمة الكلية - تجاري مدني جزئي'); assert.equal(c.number, '30');
// Only full names are offered to pick from.
const picks = courtChoices(['المحكمة الكلية - تجاري مدني جزئي / 30', 'المحكمة الكلية - تجاري مدني جزئي / 4', 'الكليه ت.م.ج/30', 'محكمة الرقعي - تجاري كلي / 1']);
assert.deepEqual(picks, ['المحكمة الكلية - تجاري مدني جزئي', 'محكمة الرقعي - تجاري كلي']);
console.log('court names OK');
// The court and the circuit type are picked apart and stored together.
const { courtPart, joinCourt, COURT_PLACES } = await import('../lib/court-names.ts');
assert.deepEqual(courtPart('المحكمة الكلية - تجاري مدني جزئي'), { place: 'المحكمة الكلية', type: 'تجاري مدني جزئي' });
assert.deepEqual(courtPart('محكمة حولي'), { place: 'محكمة حولي', type: '' });
assert.deepEqual(courtPart('تجاري كلي'), { place: '', type: 'تجاري كلي' });
assert.equal(joinCourt('محكمة الرقعي', 'تجاري كلي'), 'محكمة الرقعي - تجاري كلي');
assert.equal(joinCourt('', 'تجاري كلي'), 'تجاري كلي');
assert.ok(COURT_PLACES.includes('المحكمة الكلية') && COURT_PLACES.length === new Set(COURT_PLACES).size);
console.log('court parts OK');
