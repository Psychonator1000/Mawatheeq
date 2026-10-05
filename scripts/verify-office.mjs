import assert from 'node:assert/strict';
import { reviewStatus, workBucket, changedFields, analysisValue } from '../lib/office.ts';
import { partyMatches, caseFiltersHash, caseLinkFilters } from '../lib/case-browse.ts';

const c={id:'fixture',revision:3,opponent:'أحمد علي',client:'شركة اختبار',clientEntityId:'entity',archived:false};
assert.equal(reviewStatus(c,[],'judgment'),'unreviewed');
const r={id:1,caseId:c.id,scope:'judgment',caseRevision:3,decision:'verified',current:true};
assert.equal(reviewStatus(c,[r],'judgment'),'verified');
assert.equal(reviewStatus({...c,revision:4},[r],'judgment'),'outdated');
assert.equal(reviewStatus(c,[{...r,current:false}],'judgment'),'outdated');
assert.equal(reviewStatus(c,[r],'announcement'),'unreviewed');
assert.equal(reviewStatus(c,[r,{...r,id:2,decision:'needs_review'}],'judgment'),'needs_review');
assert.equal(workBucket({dueDate:'2026-10-03',status:'open'},'2026-10-04'),'overdue');
assert.equal(workBucket({dueDate:'2026-10-04',status:'in_progress'},'2026-10-04'),'today');
assert.equal(workBucket({dueDate:'2026-10-05',status:'open'},'2026-10-04'),'upcoming');
assert.equal(workBucket({dueDate:'2026-10-01',status:'done'},'2026-10-04'),'closed');
assert.equal(workBucket({dueDate:'2026-10-01',status:'cancelled'},'2026-10-04'),'closed');
assert.equal(workBucket({dueDate:'',status:'open'},'2026-10-04'),'undated');
assert.deepEqual(changedFields({opponent:'old',revision:1},{opponent:'new',revision:2}),['opponent']);
const entities=[{id:'entity',name:'شركة اختبار',aliases:['الاسم القديم'],contacts:[{name:'سالم مثال'}]}];
assert.equal(partyMatches([c],entities,'').length,0);
assert.equal(partyMatches([c],entities,'احمد علي')[0].matches[0].role,'خصم');
assert.equal(partyMatches([c],entities,'الاسم القديم')[0].matches[0].role,'صيغة أخرى للموكل');
assert.equal(partyMatches([{...c,archived:true}],entities,'سالم مثال')[0].record.archived,true);
assert.equal(partyMatches([c],entities,'اسم غير موجود').length,0);
for(const field of ['type','outcome','status','appeal','appealRecorded']){
 const st={outcome:'لصالحنا',status:'جاهز للتنفيذ',appeal:'لا يوجد'};
 const value=analysisValue(c,st,field);
 const filters=caseLinkFilters(caseFiltersHash({analysisField:field,analysisValue:value}));
 assert.equal(filters.analysisField,field);assert.equal(filters.analysisValue,value);
 assert.equal(analysisValue(c,st,filters.analysisField),filters.analysisValue);
}
assert.equal(caseLinkFilters('#cases?analysisField=password&analysisValue=x').analysisField,undefined);
console.log('Passed office logic: distinct evidence approvals, stale revisions, date-only workload, field changes, archived-party matches and analytic links.');
