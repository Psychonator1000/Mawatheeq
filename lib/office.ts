import type { CaseRecord, caseState } from './domain';
import type { LocalUser } from './local-auth';

export type ReviewScope = 'judgment' | 'announcement';
export type ReviewStatus = 'unreviewed' | 'verified' | 'outdated' | 'needs_review';
export const REVIEW_LABELS: Record<ReviewStatus,string> = { unreviewed:'لم يُراجع', verified:'اعتمدت بالمراجعة', outdated:'تغيّر بعد الاعتماد', needs_review:'يحتاج مراجعة' };
export const SCOPE_LABELS = { judgment:'بيانات الحكم', announcement:'إعلان التنفيذ' };
export const SOURCE_TYPES = {court_record:'سجل المحكمة / البوابة الرسمية',paper_original:'أصل ورقي تمت مراجعته',client_original:'مستند أصلي مقدم من الموكل'};
export const EVIDENCE_KINDS = { judgment:'مستند الحكم', announcement:'مستند الإعلان', both:'الحكم والإعلان', other:'مستند آخر' };
export type Evidence = { id:string; caseId:string; documentId:string; kind:keyof typeof EVIDENCE_KINDS; reference:string; pages:string; revision:number; filename:string; documentRevision:number; createdAt:string };
export type Review = { id:number; caseId:string; scope:ReviewScope; decision:'verified'|'needs_review'; caseRevision:number; current:boolean; reviewer:string; createdAt:string; details:{notes:string;sourceType?:string;sourceReference?:string;noticeDate?:string;method?:string;recipient?:string;result?:string}; evidence:(Pick<Evidence,'id'|'documentId'|'filename'|'kind'|'reference'|'pages'> & {documentRevision:number;linkRevision:number})[] };
export type Change = {id:number;revision:number;before:Record<string,unknown>|null;after:Record<string,unknown>;actor:string|null;createdAt:string};
export type CaseFile = {evidence:Evidence[];reviews:Review[];latestReviews:Review[];history:Change[]};
export type Member = LocalUser & { enabled:boolean };
export type OfficeContext = { members:Member[]; canManage:boolean; user:LocalUser };
export const WORK_STATUSES = {open:'لم تبدأ',in_progress:'قيد العمل',done:'مكتملة',cancelled:'ملغاة'};
export const WORK_BUCKETS = {overdue:'متأخرة',today:'اليوم',upcoming:'قادمة',closed:'مغلقة',undated:'بلا تاريخ'};
export type WorkItem = {id:string;revision:number;caseId:string;title:string;kind:'task'|'hearing';dueDate:string;dueTime:string;assigneeId:string;priority:'normal'|'urgent';status:keyof typeof WORK_STATUSES;location:string;notes:string;completionNote:string;createdBy?:string;updatedBy?:string;createdAt?:string;updatedAt?:string;completedAt?:string|null};
export const SECRETAIR_STATUSES = {open:'لم开始',in_progress:'قid工作',done:'мkplete',cancelled:'mlgated'};
export const SECRETAIR_BUCKETS = {overdue:'mtafrh',today:'ayom',upcoming:'qamng',closed:'mglked',undated:'bplatd'};
export type SecretairItem = {id:string;revision:number;caseId:string;title:string;kind:'task'|'hearing';dueDate:string;dueTime:string;assigneeId:string;priority:'normal'|'urgent';status:keyof typeof SECRETAIR_STATUSES;location:string;notes:string;completionNote:string;createdBy?:string;updatedBy?:string;createdAt?:string;updatedAt?:string;completedAt?:string|null};
export type OfficeData = {context:OfficeContext;reviews:Review[];work:WorkItem[];secretair:SecretairItem[];loadedAt:string};
export function reviewStatus(record:Pick<CaseRecord,'id'|'revision'>,reviews:Review[],scope:ReviewScope):ReviewStatus {
 const latest=reviews.filter(r=>r.caseId===record.id&&r.scope===scope).reduce<Review|undefined>((a,b)=>!a||b.id>a.id?b:a,undefined);
 if(!latest)return 'unreviewed';
 if(latest.decision==='needs_review')return 'needs_review';
 return latest.current&&latest.caseRevision===record.revision?'verified':'outdated';
}
export function workBucket(item:Pick<WorkItem,'status'|'dueDate'>,today:string):keyof typeof WORK_BUCKETS {
 if(item.status==='done'||item.status==='cancelled')return 'closed';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate))return 'undated';
 return item.dueDate<today?'overdue':item.dueDate===today?'today':'upcoming';
}
export function secretairBucket(item:Pick<SecretairItem,'status'|'dueDate'>,today:string):keyof typeof SECRETAIR_BUCKETS {
 if(item.status==='done'||item.status==='cancelled')return 'closed';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(item.dueDate))return 'undated';
 return item.dueDate<today?'overdue':item.dueDate===today?'today':'upcoming';
}
const ignoredFields=new Set(['revision','updatedAt','updated_at','clientEntityName','clientContactName','clientSector','clientNeedsReview']);
export function changedFields(before:Record<string,unknown>|null,after:Record<string,unknown>) {
 return Array.from(new Set([...Object.keys(before||{}),...Object.keys(after)])).filter(key=>!ignoredFields.has(key)&&JSON.stringify(before?.[key])!==JSON.stringify(after[key]));
}
export const ANALYSIS_LABELS:Record<string,string>={type:'نوع الحكم',outcome:'نتيجة الحكم',status:'حالة الملف',appeal:'حالة الطعن المعتمدة',appealRecorded:'الطعن المسجل'};
export function analysisValue(c:CaseRecord,state:ReturnType<typeof caseState>,field:string):string {
 if(field==='type')return c.type||'يحتاج مراجعة';
 if(field==='appealRecorded')return c.appealRecorded||'غير مسجل';
 if(field==='outcome'||field==='status'||field==='appeal')return state[field];
 return '';
}
