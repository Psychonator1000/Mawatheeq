export type Procedure={id:string;date:string;text:string;lawyer?:string;source?:string;followup?:string;kind?:string};
export type CaseRecord={id:string;code:string;autoNumber:string;client:string;clientGroup:string;opponent:string;role:string;type:string;ruling:string;outcome:string;appealRecorded:string;appealConfirmation:string;date:string;notes:string;executionNote:string;copyDate:string;notificationDate:string;announcementDate:string;originalDate:string;executionStage:string;executionLegacy:string;noActionConfirmation:string;caseNumber:string;court:string;subject:string;lawyer:string;source:string;review:string;legacyNotes:string;insurance:boolean;procedures:Procedure[];revision?:number;archived?:boolean;[key:string]:unknown};
export const EXECUTION_NOTES=['تم عمل اجراءات التنفيذ','لم يتم عمل اجراءات التنفيذ','غير متداول','تم فتح ملف التنفيذ','لم يتم فتح ملف التنفيذ','مراجعة المستشار'];
export const TYPES=['حكم أول درجة','حكم استئناف','حكم تمييز','إشكال','يحتاج مراجعة'];
export type Rules={first:number;appeal:number;objection:number;execution:number;warning:number};
export const DEFAULT_RULES:Rules={first:30,appeal:60,objection:15,execution:30,warning:5};
export const todayISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const formatDate=(s:string)=>/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10).split('-').reverse().join('/'):(s||'—');
export const normalize=(s:unknown)=>String(s??'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065Fـ]/g,'').replace(/\s+/g,' ').trim();
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s}
export function addDays(s:string,n:number){if(!validDate(s))return '';const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function caseState(c:CaseRecord,r:Rules=DEFAULT_RULES,today=todayISO()){
 const type=c.type==='حكم ابتدائي'?'حكم أول درجة':c.type;
 const days=type==='حكم أول درجة'?r.first:type==='حكم استئناف'?r.appeal:type==='حكم تمييز'?0:type==='إشكال'?r.objection:null;
 const outcome=c.outcome?.startsWith('غير صالح')?'غير صالحنا':c.outcome?.startsWith('لصالحنا')?'لصالحنا':'غير محدد';
 const appeal=c.appealConfirmation||((c.appealRecorded||'').startsWith('تم')||c.legacyNotes?.includes('تم الاستئناف')||c.executionLegacy?.includes('يوجد استئناف')?'تم':c.appealRecorded==='لا يوجد'?'لا يوجد':'غير مؤكد');
 const criminal=['متهم','متهمه','جاني','جانيه'].includes(normalize(c.role))&&outcome==='غير صالحنا';
 const due=c.date&&days?addDays(c.date,days):'';
 const executionDue=c.date?addDays(c.date,r.execution):'';
 const remaining=due?Math.round((Date.parse(due)-Date.parse(today))/86400000):null;
 const eligible=!criminal&&outcome==='لصالحنا'&&appeal==='لا يوجد';
 const expired=due?today>due:days===0&&executionDue?today>executionDue:false;
 let status=criminal?'جنح':c.executionNote==='غير متداول'||c.appealRecorded==='منتهي'?'منتهي':appeal==='تم'?'متداول':outcome==='لصالحنا'&&['تم عمل اجراءات التنفيذ','تم فتح ملف التنفيذ'].includes(c.executionNote)?'تنفيذ قائم':!c.date||days===null||outcome==='غير محدد'?'بيانات ناقصة':expired&&appeal==='لا يوجد'?outcome==='لصالحنا'?'جاهز للتنفيذ':c.noActionConfirmation==='نعم'?'منتهي':c.noActionConfirmation==='لا'?'متداول':'بانتظار تأكيد الإجراءات':appeal==='غير مؤكد'?'بانتظار تأكيد الطعن':'متداول';
 const alert=status==='منتهي'?'ملف منتهي':appeal==='تم'?'تم اتخاذ الإجراء':days===0?'نهائي':remaining===null?'بيانات ناقصة':remaining<0?'انتهت المهلة':remaining<=r.warning?'خلال خمسة أيام':'ضمن المهلة';
 return {outcome,appeal,criminal,due,days,remaining,executionDue,eligible,status,alert};
}
export function emptyCase():CaseRecord{return {id:crypto.randomUUID(),code:'',autoNumber:'',client:'',clientGroup:'',opponent:'',role:'',type:'حكم أول درجة',ruling:'',outcome:'غير محدد',appealRecorded:'',appealConfirmation:'',date:'',notes:'',executionNote:'',copyDate:'',notificationDate:'',announcementDate:'',originalDate:'',executionStage:'',executionLegacy:'',noActionConfirmation:'',caseNumber:'',court:'',subject:'',lawyer:'',source:'إدخال يدوي',review:'',legacyNotes:'',insurance:false,procedures:[]}}
