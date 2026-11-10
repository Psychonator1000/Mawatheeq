// What each account sees: items inherit the strictest setting above them; one click cycles shown → read-only → hidden;
// only known items with valid modes are kept; the templates hide money for «الأعمال الإدارية فقط» and for clients.
import assert from 'node:assert/strict';
import { VIEW_ITEMS, VIEW_TEMPLATES, viewMode, canSee, canChange, cycleMode, setMode, cleanView, itemMode, itemGranted, nextItemMode, withItemMode } from '../lib/view-map.ts';

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

// Every page of the side list can be hidden, «مهام اليوم والتقرير» and «ملفاتي الورقية» included.
const item = id => VIEW_ITEMS.find(i => i.id === id);
const daily = item('page:daily'), paper = item('page:paper');
const lawyer = { sections: ['cases', 'work'], view: {} };
assert.ok(itemGranted(lawyer, daily), 'The daily page opens with cases or work, without its own section');
assert.equal(itemMode(lawyer, daily), 'read', 'Without the daily section it is seen without a report');
let v = withItemMode(lawyer, daily, nextItemMode(lawyer, daily));
assert.equal(itemMode(v, daily), 'hide'); assert.ok(!canSee(v.view, 'page:daily'), 'Hidden from the side list'); assert.deepEqual(v.sections, ['cases', 'work']);
v = withItemMode(v, daily, nextItemMode(v, daily));
assert.equal(itemMode(v, daily), 'show'); assert.ok(v.sections.includes('daily') && canSee(v.view, 'page:daily'), 'Shown again, writing a report');
v = withItemMode(v, daily, 'read'); assert.ok(!v.sections.includes('daily') && itemMode(v, daily) === 'read');
const alone = { sections: ['daily'], view: {} };
assert.equal(itemMode(alone, daily), 'show');
assert.equal(itemMode(withItemMode(alone, daily, 'read'), daily), 'show', 'With nothing else the page needs its section to stay in the list');
assert.deepEqual(withItemMode(alone, daily, 'hide').sections, []);
assert.ok(!itemGranted({ sections: ['clients'], view: {} }, daily), 'Nothing in the day for clients only');
assert.ok(itemGranted({ sections: [], view: {} }, paper) && nextItemMode({ sections: [], view: {} }, paper, false) === 'hide');
assert.equal(withItemMode({ sections: [], view: {} }, paper, 'hide').view['page:paper'], 'hide');
assert.deepEqual(cleanView({ 'page:paper': 'hide' }), { 'page:paper': 'hide' }, 'Kept when saved');
// Hiding the last page of a section takes the section and keeps the pages hidden (some open by another section too).
let c = { sections: ['cases'], view: {} };
for (const i of VIEW_ITEMS.filter(x => x.section === 'cases')) c = withItemMode(c, i, 'hide');
assert.deepEqual(c.sections, []); assert.equal(c.view['page:cases'], 'hide');
console.log('view map OK');
