export type Procedure={id:string;date:string;text:string;lawyer?:string;source?:string;followup?:string;kind?:string;
 /** Session records: where it was held, the court's decision, and the time of the next session (followup holds its date). */
 venue?:string;court?:string;decision?:string;nextTime?:string;recordedBy?:string};
export type CaseRecord={id:string;code:string;autoNumber:string;client:string;clientGroup:string;opponent:string;role:string;type:string;ruling:string;outcome:string;appealRecorded:string;appealConfirmation:string;date:string;notes:string;executionNote:string;copyDate:string;notificationDate:string;announcementDate:string;originalDate:string;executionStage:string;executionLegacy:string;noActionConfirmation:string;caseNumber:string;court:string;subject:string;lawyer:string;source:string;review:string;legacyNotes:string;insurance:boolean;procedures:Procedure[];revision?:number;archived?:boolean;executionFile?:boolean;telecom?:boolean;clientEntityId?:string;clientContactId?:string;clientEntityName?:string;clientSector?:string;clientContactName?:string;casePerson?:string;casePersonRole?:string;executionOpenDate?:string;executionProcedureDate?:string;importReview?:string;[key:string]:unknown};
export const EXECUTION_NOTES=['تم عمل اجراءات التنفيذ','لم يتم عمل اجراءات التنفيذ','غير متداول','تم فتح ملف التنفيذ','لم يتم فتح ملف التنفيذ','مراجعة المستشار'];
export const TYPES=['حكم أول درجة','حكم استئناف','حكم تمييز','إشكال','يحتاج مراجعة'];
export type Rules={first:number;appeal:number;objection:number;execution:number;warning:number};
export const DEFAULT_RULES:Rules={first:30,appeal:60,objection:15,execution:30,warning:5};
// Today in Kuwait. Building a date formatter is slow, and this is asked for every case on every redraw, so one
// formatter is kept and the answer is reused for a second.
const kuwaitDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'});
let dayCache={at:0,value:''};
export const todayISO=()=>{const now=Date.now();if(now-dayCache.at>1000||!dayCache.value)dayCache={at:now,value:kuwaitDay.format(new Date(now))};return dayCache.value};
// Sorters built once: «a.localeCompare(b,'ar')» builds a new sorter on every comparison, which is slow over thousands of cases.
const arCollator=new Intl.Collator('ar'),arNumericCollator=new Intl.Collator('ar',{numeric:true}),enNumericCollator=new Intl.Collator('en',{numeric:true});
export const arCompare=(a:string,b:string)=>arCollator.compare(a,b);
export const arNumericCompare=(a:string,b:string)=>arNumericCollator.compare(a,b);
export const enNumericCompare=(a:string,b:string)=>enNumericCollator.compare(a,b);
export const formatDate=(s:string)=>/^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10).split('-').reverse().join('/'):(s||'—');
export const normalize=(s:unknown)=>String(s??'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065Fـ]/g,'').replace(/\s+/g,' ').trim();
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s}
export function addDays(s:string,n:number){if(!validDate(s))return '';const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function daysBetween(from:string,to:string){return validDate(from)&&validDate(to)?Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000):null}
export function elapsedDaysLabel(days:number|null){return days===null?'غير محدد':days<0?`الحكم بعد ${Math.abs(days)} يوم`:`${days} يوم`}
export function remainingDaysLabel(days:number|null,final=false){return final?'نهائي':days===null?'غير محدد':days<0?`انتهت منذ ${Math.abs(days)} يوم`:days===0?'اليوم':`${days} يوم`}
/** A case's state, remembered per case: the same case, rules and day give the same answer without working it out again. */
const stateCache=new WeakMap<CaseRecord,{r:Rules;today:string;value:ReturnType<typeof computeCaseState>}>();
export function caseState(c:CaseRecord,r:Rules=DEFAULT_RULES,today=todayISO()){
 const hit=stateCache.get(c);
 if(hit&&hit.r===r&&hit.today===today)return hit.value;
 const value=computeCaseState(c,r,today);stateCache.set(c,{r,today,value});return value;
}
function computeCaseState(c:CaseRecord,r:Rules,today:string){
 const type=c.type==='حكم ابتدائي'?'حكم أول درجة':c.type;
 const days=type==='حكم أول درجة'?r.first:type==='حكم استئناف'?r.appeal:type==='حكم تمييز'?0:type==='إشكال'?r.objection:null;
 const outcome=c.outcome?.startsWith('غير صالح')?'غير صالحنا':c.outcome?.startsWith('لصالحنا')?'لصالحنا':'غير محدد';
 const appeal=c.appealConfirmation||((c.appealRecorded||'').startsWith('تم')||c.legacyNotes?.includes('تم الاستئناف')||c.executionLegacy?.includes('يوجد استئناف')?'تم':c.appealRecorded==='لا يوجد'?'لا يوجد':'غير مؤكد');
 const criminal=['متهم','متهمه','جاني','جانيه'].includes(normalize(c.role))&&outcome==='غير صالحنا';
 const due=c.date&&days?addDays(c.date,days):'';
 const executionDue=c.date?addDays(c.date,r.execution):'';
 const remaining=daysBetween(today,due),elapsed=daysBetween(c.date,today),executionRemaining=daysBetween(today,executionDue);
 const eligible=!criminal&&outcome==='لصالحنا'&&appeal==='لا يوجد';
 const expired=due?today>due:days===0&&executionDue?today>executionDue:false;
 // Moved to a higher court and waiting for its judgment: the case is still in progress, not missing data.
 const awaiting=!c.date&&Array.isArray(c.stages)&&c.stages.length>0;
 const status=criminal?'جنح':awaiting?'متداول':c.executionNote==='غير متداول'||c.appealRecorded==='منتهي'?'منتهي':appeal==='تم'?'متداول':outcome==='لصالحنا'&&['تم عمل اجراءات التنفيذ','تم فتح ملف التنفيذ'].includes(c.executionNote)?'تنفيذ قائم':!c.date||days===null||outcome==='غير محدد'?'بيانات ناقصة':expired&&appeal==='لا يوجد'?outcome==='لصالحنا'?'جاهز للتنفيذ':c.noActionConfirmation==='نعم'?'منتهي':c.noActionConfirmation==='لا'?'متداول':'بانتظار تأكيد الإجراءات':appeal==='غير مؤكد'?'بانتظار تأكيد الطعن':'متداول';
 const alert=status==='منتهي'?'ملف منتهي':appeal==='تم'||awaiting?'تم اتخاذ الإجراء':days===0?'نهائي':remaining===null?'بيانات ناقصة':remaining<0?'انتهت المهلة':remaining<=r.warning?'خلال خمسة أيام':'ضمن المهلة';
 return {outcome,appeal,criminal,due,days,remaining,elapsed,executionDue,executionRemaining,eligible,status,alert,awaiting};
}
export function emptyCase():CaseRecord{return {id:crypto.randomUUID(),code:'',autoNumber:'',client:'',clientGroup:'',opponent:'',role:'',type:'حكم أول درجة',ruling:'',outcome:'غير محدد',appealRecorded:'',appealConfirmation:'',date:'',notes:'',executionNote:'',copyDate:'',notificationDate:'',announcementDate:'',originalDate:'',executionStage:'',executionLegacy:'',noActionConfirmation:'',caseNumber:'',court:'',subject:'',lawyer:'',source:'إدخال يدوي',review:'',legacyNotes:'',insurance:false,procedures:[]}}

export type CaseCategory = '' | 'execution' | 'insurance' | 'telecom';
export function inCaseCategory(c:CaseRecord,category:string,rules:Rules=DEFAULT_RULES){
 if(category==='execution')return Boolean(c.executionFile)||caseState(c,rules).eligible;
 if(category==='insurance')return Boolean(c.insurance)||c.clientSector==='insurance';
 if(category==='telecom')return Boolean(c.telecom)||c.clientSector==='telecom';
 return true;
}
export function newCategoryCase(category:CaseCategory,clientEntityId=''):CaseRecord{
 return {...emptyCase(),executionFile:category==='execution',insurance:category==='insurance',telecom:category==='telecom',clientEntityId,clientContactId:'',casePerson:'',casePersonRole:''};
}
/**
 * A case's code as shown: insurance cases keep their own register numbers, so they are shown with «ت-» and never look
 * like a base case with the same number. The stored code is unchanged.
 */
export const INSURANCE_CODE_PREFIX='ت-';
export function caseCode(c:{code?:unknown;insurance?:unknown}){const k=String(c.code??'').trim();return k&&c.insurance?INSURANCE_CODE_PREFIX+k:k}
