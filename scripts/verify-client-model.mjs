import assert from 'node:assert/strict';
import {emptyCase,newCategoryCase,inCaseCategory,caseState,DEFAULT_RULES} from '../lib/domain.ts';
import {enrichCase} from '../lib/clients.ts';
import {dateFromISO,dateToISO} from '../lib/date-picker.ts';
const entity={id:'company-a',name:'Example organization',sector:'telecom',contacts:[{id:'person-a',name:'Person A'}],needsReview:false};
let c=enrichCase({...emptyCase(),client:'Original company and person wording',clientEntityId:entity.id,clientContactId:'person-a'},[entity]);
assert.equal(c.client,'Original company and person wording'); assert.equal(c.clientEntityName,entity.name); assert.equal(c.clientContactName,'Person A');
assert.ok(inCaseCategory(c,'telecom')); assert.equal(inCaseCategory(c,'insurance'),false);
const other=enrichCase({...c,clientEntityId:'company-b'},[{...entity,id:'company-b',sector:'other',contacts:[]}]);
assert.equal(other.clientContactName,''); assert.equal(inCaseCategory(other,'telecom'),false);
for(const category of ['execution','insurance','telecom']) {
 const record=newCategoryCase(category); assert.ok(inCaseCategory(record,category));
 assert.equal(record.outcome,'غير محدد'); assert.equal(record.appealConfirmation,''); assert.equal(caseState(record).eligible,false);
}
const won={...emptyCase(),outcome:'لصالحنا',appealConfirmation:'لا يوجد'};
assert.ok(inCaseCategory(won,'execution',DEFAULT_RULES));
assert.equal(inCaseCategory({...won,appealConfirmation:''},'execution'),false);
assert.equal(inCaseCategory({...won,role:'متهم',outcome:'غير صالحنا'},'execution'),false);
for(const zone of ['UTC','Asia/Kuwait','Pacific/Kiritimati','America/Los_Angeles']) {
 process.env.TZ=zone;
 for(const value of ['1900-01-01','2024-02-29','2026-09-28','2026-12-31','2045-01-01']) assert.equal(dateToISO(dateFromISO(value)),value,zone);
 for(const value of ['2026-02-29','2026-13-01','2026-04-31','28/09/2026','']) assert.equal(dateFromISO(value),undefined);
}
console.log('Passed: entity identity, representative boundaries, category defaults, unchanged execution rules, and timezone-safe calendar dates.');
