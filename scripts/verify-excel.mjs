import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';
import * as X from 'xlsx';

// Bundle the actual browser importer; all fixture records are synthetic.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mawatheeq-excel-test-'));
try {
 await build({configFile:false,logLevel:'error',build:{outDir:temp,lib:{entry:path.resolve('lib/excel.ts'),formats:['es'],fileName:()=> 'excel.mjs'},rollupOptions:{external:['xlsx']}}});
 fs.symlinkSync(path.resolve('node_modules'),path.join(temp,'node_modules'),'dir');
 const {readWorkbook}=await import(pathToFileURL(path.join(temp,'excel.mjs')).href);
 const file=rows=>{const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet(rows),'الأحكام');return new File([X.write(w,{type:'array',bookType:'xlsx'})],'fixture.xlsx');};
 const header=['معرف السجل الداخلي','الموكل','إدخال الرقم الآلي','نوع الحكم','تاريخ الحكم','تاريخ فتح ملف التنفيذ','تاريخ  الاجراءت'];
 for(const zone of ['UTC','Asia/Kuwait','Pacific/Kiritimati','America/Los_Angeles']){
  process.env.TZ=zone;
  const records=await readWorkbook(file([header,
   ['R0001','Example A','001234','حكم اول درجة','7/9/2026','8/9/2026','9/9/2026'],
   ['R0002','Example B','009876','اشكال',(Date.UTC(2026,8,27)-Date.UTC(1899,11,30))/86400000],
   ['','Helper block label','0123','',(Date.UTC(2026,8,27)-Date.UTC(1899,11,30))/86400000],
   ['معرف السجل الداخلي','الموكل','إدخال الرقم الآلي','نوع الحكم','تاريخ الحكم']]));
  assert.equal(records.length,2,'Workbook helper tables are not case records');
  assert.equal(records[0].autoNumber,'001234');
  assert.equal(records[0].type,'حكم أول درجة');assert.equal(records[1].type,'إشكال');
  assert.equal(records[0].date,'2026-09-07',zone);assert.equal(records[1].date,'2026-09-27',zone);
  assert.equal(records[0].executionOpenDate,'2026-09-08');assert.equal(records[0].executionProcedureDate,'2026-09-09');
 }
 assert.equal((await readWorkbook(file([['الموكل','الرقم الآلي','تاريخ الحكم'],['Example C','00012','27/9/2026']]))).length,1,'Plain exports do not require legacy internal IDs');
 await assert.rejects(()=>readWorkbook(file([header,['R0001','Example A','001234','حكم اول درجة','31/2/2026']])),/تاريخ غير صالح/);
 // Lenient reading for supplementing the website: new rows without an ID, the helper table pasted below is not read,
 // and a bad date is reported on its row instead of failing the file.
 const lenient=await readWorkbook(file([header,
  ['R0001','Example A','001234','حكم اول درجة','7/9/2026','8/9/2026','26/3/202'],
  ['','New judgment','005555','حكم استئناف','5-10-2026'],
  ['','',''],
  ['الكود','الرقم الآلي','تاريخ الحكم','الموكل','الخصم'],
  ['77','000999','2026-06-30','Helper row that must not be read']]),true);
 assert.equal(lenient.length,2,'Lenient mode reads new rows and stops at the pasted helper table');
 assert.equal(lenient[1].date,'2026-10-05','Day-month-year with dashes');assert.equal(lenient[1]._row,3);
 assert.equal(lenient[0].executionProcedureDate,'');assert.match(lenient[0]._issues[0],/26\/3\/202/);
 console.log('Passed: legacy workbook helper exclusion, text IDs, single-digit dates, calendar dates across timezones, type spelling normalization, execution dates, invalid-date rejection, and lenient supplement reading (new rows, helper-table stop, per-row date issues).');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
