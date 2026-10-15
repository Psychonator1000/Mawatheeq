// The court roll reader: hearing blocks grouped by case, dates, roles, levels, circuits, held sessions and coming
// hearings. Every row is synthetic and laid out at the report's columns.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'vite';
import * as X from 'xlsx';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'mawatheeq-roll-test-'));
try {
 await build({configFile:false,logLevel:'error',resolve:{alias:{'@':path.resolve('.')}},build:{outDir:temp,lib:{entry:path.resolve('lib/roll-import.ts'),formats:['es'],fileName:()=>'roll.mjs'},rollupOptions:{external:['xlsx']}}});
 fs.symlinkSync(path.resolve('node_modules'),path.join(temp,'node_modules'),'dir');
 const {parseRollRows,readRoll,rollPayload,rollRole,rollLevel,rollDecision}=await import(pathToFileURL(path.join(temp,'roll.mjs')).href);
 const row=cells=>{const r=Array(81).fill('');for(const [k,v] of Object.entries(cells))r[k]=v;return r;};
 const header=[row({34:'رول الجلســـات '}),row({2:'15/10/2026'}),row({74:'2026/10/01'}),row({0:'رقم الملف'}),row({24:'المحكمة',30:'درجة القضية',55:'الرقم الآلى',69:'الدائرة'})];
 // A court hearing held on 1 October and adjourned to 19 November; the same case on the roll again on 20 October.
 const held=[row({0:'5101',8:'للاعلان',21:'15/09/2026',26:'الرقعى',30:'إبتدائى ',39:'12',41:'51',55:'900000011',60:'10',64:'26',69:'ت كلى',76:'محكمة',80:'1'}),
  row({0:'محامٍ تجريبي',8:'للاطلاع',21:'01/10/2026',29:'7001',36:'ترقيم 1:',43:'مطالبة مالية تجريبية',61:'مدعى',68:'شركة اختبار الرول'}),
  row({0:'6',8:'للحكم',21:'19/11/2026',31:'متداول',37:'حالة القضية:',46:'تجارى',53:'نوع القضية:',59:'2026/111',65:'رقم القضية:',68:'خصم اختبار الرول'})];
 const later=[row({0:'5101',8:'للحكم',21:'01/10/2026',26:'الرقعى',30:'إبتدائى ',39:'12',41:'51',55:'900000011',64:'26',69:'ت كلى',76:'محكمة',80:'2'}),
  row({0:'محامٍ تجريبي',8:'للحكم',21:'20/10/2026',29:'7001',43:'مطالبة مالية تجريبية',61:'مدعى',68:'شركة اختبار الرول'}),
  row({0:'6',21:'',31:'متداول',46:'تجارى',59:'2026/111',68:'خصم اختبار الرول'})];
 // An expert session in appeal, still to come, with its time and order on the roll.
 const expert=[row({0:'2',21:'01/09/2026',26:'قصر العدل',30:'إستئناف',39:'10',41:'52',55:'900000022',64:'5',69:'ت م ك حكومه',76:'خبراء',80:'3'}),
  row({0:'محامٍ آخر',8:'مناقشه',21:'25/10/2026',29:'7002',43:'ندب خبير تجريبي',61:'مستأنف ضده',68:'موكل خبرة تجريبي'}),
  row({0:'4120',31:'متداول',46:'مدنى',59:'2025/222',68:'خصم خبرة تجريبي'}),
  row({19:'1054',23:'رقم القاعة:',32:'الرقعى',45:'محكمة الخبراء',70:'خبير تجريبي',78:'اسم الخبير:'}),
  row({3:'10:00',7:'الساعة:',12:'7',15:'رقم الدور'})];
 // A block without an automatic number is reported, not imported.
 const bare=[row({0:'1',76:'خبراء',80:'4'}),row({0:'محامٍ',8:'جلسة',21:'07/10/2026',68:'موكل بلا رقم'}),row({0:'4600',31:'متداول'})];
 const parsed=parseRollRows([...header,...held,...header,...later,...expert,...bare]);
 assert.equal(parsed.hearings,4);assert.equal(parsed.cases.length,2,'Hearings are grouped by automatic number');
 assert.deepEqual(parsed.withoutNumber,[{seq:'4',date:'2026-10-07',client:'موكل بلا رقم'}]);
 const [a,b]=parsed.cases;
 assert.deepEqual([a.autoNumber,a.special,a.fileNumber,a.client,a.opponent,a.role,a.caseNumber,a.building,a.level,a.circuit,a.room,a.lawyer,a.caseType,a.status],
  ['900000011','7001','5101','شركة اختبار الرول','خصم اختبار الرول','مدعي','2026/111','الرقعى','ابتدائي','ت كلى / 26 · الدور 12','51','محامٍ تجريبي','تجارى','متداول']);
 assert.deepEqual(a.hearings.map(h=>[h.date,h.purpose,h.outcome,h.nextDate]),[['2026-10-01','للاطلاع','للحكم','2026-11-19'],['2026-10-20','للحكم','','']]);
 assert.deepEqual([b.level,b.role,b.fileNumber,b.hearings[0].expert,b.hearings[0].time,b.hearings[0].order,b.hearings[0].expertName],['استئناف','مستأنف ضده','4120',true,'10:00','7','خبير تجريبي']);
 // What is sent to the database on 15 October.
 const pa=rollPayload(a,'2026-10-15'),pb=rollPayload(b,'2026-10-15');
 assert.deepEqual(pa.sessions.map(s=>[s.date,s.kind,s.decision,s.text,s.followup,s.court]),[['2026-10-01','جلسة','حجز للحكم','حجز للحكم — للحكم','2026-11-19','ت كلى / 26 · الدور 12']],'Held sessions enter the session log with their adjournment');
 assert.deepEqual(pa.upcoming.map(u=>[u.dueDate,u.title,u.location]),[['2026-10-20','النطق بالحكم · أول درجة · 900000011','الرقعى · ت كلى / 26 · الدور 12 · غرفة 51'],['2026-11-19','النطق بالحكم · أول درجة · 900000011','الرقعى · ت كلى / 26 · الدور 12 · غرفة 51']]);
 assert.deepEqual(pa.held,[{date:'2026-10-01',note:'حجز للحكم — للحكم'}]);
 assert.deepEqual([pb.sessions.length,pb.upcoming.map(u=>[u.dueDate,u.dueTime,u.title])],[0,[['2026-10-25','10:00','جلسة خبراء · الاستئناف · 900000022']]],'A coming expert session keeps its time');
 // Wording.
 assert.deepEqual(['مدعى','مدعيه','مدعى عليهما','مستانف ضدها','مستأنف','طاعن','متهم'].map(rollRole),['مدعي','مدعي','مدعى عليه','مستأنف ضده','مستأنف','طاعن','متهم']);
 assert.deepEqual(['إبتدائى','إستئناف','تمييز','غير ذلك'].map(rollLevel),['ابتدائي','استئناف','تمييز','']);
 assert.deepEqual(['للحكم','مد اجل الحكم','للاعلان منا','للاطلاع والرد','لتقديم حافظة مستندات','شطب','لسماع الشهود','للتقرير'].map(t=>rollDecision(t,false)),
  ['حجز للحكم','مد أجل النطق بالحكم','تأجيل للإعلان','تأجيل للاطلاع والرد','تأجيل لتقديم مستندات','شطب الدعوى','تأجيل لسماع الشهود','تأجيل إداري']);
 assert.equal(rollDecision('مناقشه',true),'أخرى');
 // The workbook as the browser reads it.
 const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([...header,...held]),'Sheet');
 const read=await readRoll(new File([X.write(w,{type:'array',bookType:'xls'})],'LegalRollReport.xls'));
 assert.equal(read.cases[0].autoNumber,'900000011');
 assert.throws(()=>parseRollRows([row({0:'ليس رولاً'})]),/رول الجلسات/);
 console.log('Passed roll import: hearing blocks grouped by case, report columns, roles, levels, circuits, expert sessions with time and order, held sessions for the log, coming hearings, blocks without a number reported, the .xls read in the browser, and unknown files refused.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
