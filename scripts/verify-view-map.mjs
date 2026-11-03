// What each account sees: items inherit the strictest setting above them; one click cycles shown → read-only → hidden;
// only known items with valid modes are kept; the templates hide money for «الأعمال الإدارية فقط» and for clients.
import assert from 'node:assert/strict';
import { VIEW_ITEMS, VIEW_TEMPLATES, viewMode, canSee, canChange, cycleMode, setMode, cleanView } from '../lib/view-map.ts';

assert.equal(new Set(VIEW_ITEMS.map(i => i.id)).size, VIEW_ITEMS.length, 'Every item once');
for (const i of VIEW_ITEMS) if (i.parent) assert.ok(VIEW_ITEMS.some(p => p.id === i.parent), i.id + ' has a known parent');
assert.equal(viewMode({}, 'field:contractFee'), 'show');
assert.equal(viewMode({ 'tab:case': 'read' }, 'field:contractFee'), 'read', 'A read-only tab locks its fields');
assert.equal(viewMode({ 'card:contract': 'hide', 'field:contractFee': 'read' }, 'field:contractFee'), 'hide', 'A hidden card hides its fields');
assert.equal(viewMode({ 'tab:case': 'read', 'field:notes': 'hide' }, 'field:notes'), 'hide', 'The stricter wins');
assert.ok(canSee({ 'tab:case': 'read' }, 'field:code') && !canChange({ 'tab:case': 'read' }, 'field:code'));
assert.deepEqual(['show', 'read', 'hide'].map(m => cycleMode(m)), ['read', 'hide', 'show']);
assert.equal(cycleMode('show', false), 'hide', 'Items without a read-only state go straight to hidden');
assert.deepEqual(setMode({ 'tab:finance': 'hide' }, 'tab:finance', 'show'), {}, 'Shown items are not stored');
assert.deepEqual(cleanView({ 'tab:finance': 'hide', 'tab:nope': 'hide', 'field:code': 'maybe', 'card:stay': 'read' }), { 'tab:finance': 'hide', 'card:stay': 'read' });
const t = id => VIEW_TEMPLATES.find(x => x.id === id).view;
for (const id of ['tab:finance', 'tab:collections', 'card:contract', 'field:contractFee']) assert.equal(viewMode(t('admin'), id), 'hide', 'Administrative only hides ' + id);
assert.equal(viewMode(t('admin'), 'tab:sessions'), 'show');
assert.equal(viewMode(t('client'), 'field:contractFee'), 'hide');
assert.equal(viewMode(t('client'), 'tab:sessions'), 'read', 'A client reads the sessions');
assert.equal(viewMode(t('client'), 'ws:accounting'), 'hide');
for (const tpl of VIEW_TEMPLATES) assert.deepEqual(cleanView(tpl.view), tpl.view, tpl.id + ' uses only known items');
console.log('view map OK');
