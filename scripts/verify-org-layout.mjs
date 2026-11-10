// The board of «فريق المكتب»: heads over their teams, branches growing down, left or right, people with nobody under them
// in one block, boxes put by hand keeping their place and carrying the boxes that arrange themselves under them.
import assert from 'node:assert/strict';
import { layoutBoard, BOX_W, BOX_H } from '../lib/org-layout.ts';

const kids = new Map([['', ['head', 'area']], ['head', ['lead', 'x1', 'x2']], ['lead', ['y1', 'y2', 'y3', 'y4', 'y5']], ['area', ['z1']]]);
const isLeaf = k => !kids.has(k) && !k.startsWith('area');
let b = layoutBoard({ kids, isLeaf, placed: {}, flows: {} });
const p = k => b.at.get(k);
assert.ok(p('lead').y > p('head').y && p('x1').y > p('head').y, 'Teams under their head');
assert.ok(p('head').x > p('area').x, 'The first tree is the rightmost');
assert.equal(b.groups.find(g => g.parent === 'lead').keys.length, 5, 'One block for the people with nobody under them');
assert.ok(p('y1').x > p('y2').x && p('y5').y > p('y1').y, 'The block reads right to left, then wraps after four');
for (const [a, c] of [['y1', 'y2'], ['x1', 'x2'], ['lead', 'x1']]) {
  const A = p(a), C = p(c); assert.ok(Math.abs(A.x - C.x) >= BOX_W || Math.abs(A.y - C.y) >= BOX_H, a + ' and ' + c + ' do not overlap');
}
// Sideways: the lead's team grows to the right of him, stacked, two side by side at most.
b = layoutBoard({ kids, isLeaf, placed: {}, flows: { lead: 'right' } });
assert.ok(p('y1').x > p('lead').x + BOX_W && p('y3').y > p('y1').y, 'To the right, stacked');
b = layoutBoard({ kids, isLeaf, placed: {}, flows: { lead: 'left' } });
assert.ok(p('y1').x + BOX_W < p('lead').x, 'To the left');
// Put by hand: the lead keeps his place and his team moves with him; a person put by hand leaves the block.
const before = layoutBoard({ kids, isLeaf, placed: {}, flows: {} });
b = layoutBoard({ kids, isLeaf, placed: { lead: [2000, 600] }, flows: {} });
assert.deepEqual(p('lead'), { x: 2000, y: 600 });
const dx = p('y1').x - p('lead').x, dy = p('y1').y - p('lead').y;
assert.deepEqual([dx, dy], [before.at.get('y1').x - before.at.get('lead').x, before.at.get('y1').y - before.at.get('lead').y], 'His team keeps its place under him');
b = layoutBoard({ kids, isLeaf, placed: { y3: [-500, -500] }, flows: {} });
assert.deepEqual(p('y3'), { x: -500, y: -500 });assert.ok(!b.groups.find(g => g.parent === 'lead').keys.includes('y3'));
// A block dragged as a whole: kept at its offset from its head, its people inside it, and it follows the head.
b = layoutBoard({ kids, isLeaf, placed: { 'g:lead': [400, 300] }, flows: {} });
const g = b.groups.find(x => x.parent === 'lead');
assert.deepEqual([g.x - p('lead').x, g.y - p('lead').y], [400, 300]);
assert.ok(p('y1').x >= g.x && p('y1').y >= g.y && p('y1').x + BOX_W <= g.x + g.w, 'Its people inside it');
b = layoutBoard({ kids, isLeaf, placed: { 'g:lead': [400, 300], lead: [5000, 5000] }, flows: {} });
assert.deepEqual([b.groups.find(x => x.parent === 'lead').x, b.groups.find(x => x.parent === 'lead').y], [5400, 5300], 'It follows its head');
// A box put by hand on top of another is drawn on the nearest free spot: never one inside the other.
{const free=layoutBoard({ kids, isLeaf, placed: {}, flows: {} });const on=free.at.get('lead');
 b = layoutBoard({ kids, isLeaf, placed: { x1: [on.x + 20, on.y + 10] }, flows: {} });
 const A=p('x1'),L=p('lead');assert.ok(A.x>=L.x+BOX_W||A.x+BOX_W<=L.x||A.y>=L.y+BOX_H||A.y+BOX_H<=L.y,'Not on top of the lead');
 for(const k of ['y1','y2','head','x2']){const o=p(k);assert.ok(A.x>=o.x+BOX_W||A.x+BOX_W<=o.x||A.y>=o.y+BOX_H||A.y+BOX_H<=o.y,'Not on top of '+k)}}
console.log('Passed org board layout: heads over teams, down, left and right, blocks of people, boxes put by hand with their teams.');
