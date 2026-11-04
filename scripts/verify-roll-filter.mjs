// Advanced roll filter: «فقط» keeps only the chosen values, «ما عدا» drops them, rules combine, spelling variants match.
import assert from 'node:assert/strict';
import { passesRollRules, rollOptions } from '../lib/roll-filter.ts';
const row = (client, opponent, lawyer, court) => ({ c: { client, clientGroup: client, opponent, lawyer, role: 'مدعي' }, court });
const rows = [row('شركة أ', 'خصم 1', 'أحمد', 'الكلية'), row('شركة ب', 'خصم 2', 'سارة', 'الجزئية'), row('شركة أ', 'خصم 3', 'سارة', 'الكلية')];
const keep = rules => rows.filter(r => passesRollRules(r, rules)).map(r => r.c.opponent);
assert.deepEqual(keep([]), ['خصم 1', 'خصم 2', 'خصم 3'], 'No rules keep everything');
assert.deepEqual(keep([{ id: '1', field: 'client', mode: 'except', values: ['شركة أ'] }]), ['خصم 2'], 'All except a client');
assert.deepEqual(keep([{ id: '1', field: 'client', mode: 'only', values: ['شركة أ'] }]), ['خصم 1', 'خصم 3'], 'Only a client');
assert.deepEqual(keep([{ id: '1', field: 'client', mode: 'only', values: ['شركة أ'] }, { id: '2', field: 'lawyer', mode: 'except', values: ['سارة'] }]), ['خصم 1'], 'Rules combine');
assert.deepEqual(keep([{ id: '1', field: 'lawyer', mode: 'only', values: ['احمد'] }]), ['خصم 1'], 'Spelling variants of a name match');
assert.deepEqual(keep([{ id: '1', field: 'court', mode: 'except', values: [] }]), ['خصم 1', 'خصم 2', 'خصم 3'], 'A rule without values does nothing');
assert.deepEqual(rollOptions(rows, 'client'), ['شركة أ', 'شركة ب'], 'Each value offered once');
console.log('Passed roll filter: only / all except, combined rules, spelling variants, distinct choices.');
