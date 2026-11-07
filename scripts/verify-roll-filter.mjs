// Advanced roll filter: «فقط» keeps only the chosen values, «ما عدا» drops them, rules combine, spelling variants match.
import assert from 'node:assert/strict';
import { inRange, passesRollRules, rollOptions, splitValues } from '../lib/roll-filter.ts';
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
// Codes and numbers: ranges, lists and parts of a value.
const coded = [['100', '2024/1', '١١'], ['150', '2024/2', '12'], ['250', '2025/3', '13'], ['5', '2023/4', '14']].map(([code, autoNumber, caseNumber]) => ({ c: { code, autoNumber, caseNumber, client: 'شركة', opponent: code }, court: '' }));
const pick = rules => coded.filter(r => passesRollRules(r, rules)).map(r => r.c.code);
assert.deepEqual(pick([{ id: '1', field: 'code', mode: 'range', values: [], from: '100', to: '200' }]), ['100', '150'], 'Codes from 100 to 200 (numbers, not text order)');
assert.deepEqual(pick([{ id: '1', field: 'code', mode: 'range', values: [], from: '200', to: '100' }]), ['100', '150'], 'Ends given in either order');
assert.deepEqual(pick([{ id: '1', field: 'code', mode: 'range', values: [], from: '150' }]), ['150', '250'], 'Only a start: from 150 up');
assert.deepEqual(pick([{ id: '1', field: 'code', mode: 'outside', values: [], from: '100', to: '200' }]), ['250', '5'], 'Codes outside a range');
assert.deepEqual(pick([{ id: '1', field: 'code', mode: 'range', values: [] }]), ['100', '150', '250', '5'], 'An empty range does nothing');
assert.deepEqual(pick([{ id: '1', field: 'caseNumber', mode: 'only', values: ['11', '0013'] }]), ['100', '250'], 'Numbers match in Arabic-Indic digits and with leading zeros');
assert.deepEqual(pick([{ id: '1', field: 'autoNumber', mode: 'contains', values: ['2024'] }]), ['100', '150'], 'Automatic numbers containing a year');
assert.deepEqual(pick([{ id: '1', field: 'code', mode: 'except', values: splitValues('100، 250 5', 'code') }]), ['150'], 'A pasted list of codes');
assert.equal(inRange('ت-120', 'ت-100', 'ت-200'), true, 'An insurance code within an insurance range');
assert.equal(inRange('120', 'ت-100', 'ت-200'), false, 'An office code is not in an insurance range');
assert.deepEqual(splitValues('شركة أ، شركة ب', 'client'), ['شركة أ', 'شركة ب'], 'Names split at commas, not at spaces');
console.log('Passed roll filter: only / all except, combined rules, spelling variants, distinct choices, ranges of codes and numbers, lists and parts of values.');
