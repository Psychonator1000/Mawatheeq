import type {CaseRecord} from './domain';
import type {DocumentData} from './document-fields';
import {departmentRequest} from './local-auth';
export type Department = 'secretary'|'collections'|'accounting'|'hr'|'archive';
export type WorkspaceId = 'legal'|Department;
export const WORKSPACES = {
 legal:{name:'القضايا',description:'ملفات القضايا، الموكلون، التنفيذ والتحليل'},
 secretary:{name:'السكرتارية',description:'أجندة المكتب، الجلسات وتوزيع المهام'},
 collections:{name:'التحصيل',description:'ملفات المطالبات وإعداد صحيفة الدعوى والحافظة'},
 accounting:{name:'المحاسبة',description:'الأتعاب والمقبوضات والمصروفات'},
 hr:{name:'الموارد البشرية',description:'ملفات الموظفين والإجازات'},
 archive:{name:'الأرشيف',description:'الملفات الورقية: أماكن حفظها وعهدتها وطلباتها'},
};
export type CaseSummary = Pick<CaseRecord,'id'|'code'|'autoNumber'|'client'|'clientGroup'|'clientEntityName'|'opponent'|'revision'|'archived'>;
export type DepartmentRecord<P=Record<string,string>> = {
 id:string;workspace:Exclude<Department,'secretary'>;kind:'file'|'entry'|'employee'|'leave'|'statement'|'payment'|'location'|'movement'|'request';
 caseId:string;subjectId:string;payload:P;revision:number;archived:boolean;createdAt:string;updatedAt:string;createdBy:string;updatedBy:string;
 review:{recordRevision:number;caseRevision:number;reviewer:string;createdAt:string;sourceReference:string}|null;
};
/** Follow-up fields of a collection file (status, assignee, instalments, tags, closing). Changing only these keeps the source review. */
export const FOLLOW_FIELDS = ['fileStatus','executionStatus','arrivalDate','debtReason','installment','installmentsTotal','delayDays','overdueAmount','batchNumber','accountingContract','orderFee','promissoryAmount','promissoryDate','promissoryDueDate','tag1','tag2','tag3','tag4','requiredAction','closedDate','closedReason','assignedTo'] as const;
export type CollectionData = DocumentData & {sourceReference:string;notes:string} & Partial<Record<typeof FOLLOW_FIELDS[number],string>>;
export type CollectionRecord = DepartmentRecord<CollectionData>;
export type LedgerData = {type:'fee'|'receipt'|'expense';date:string;currency:Currency;amount:string;amountMinor:string;reference:string;party:string;notes:string;status:'posted'|'void';voidReason:string};
export type LedgerRecord = DepartmentRecord<LedgerData>;
export const CURRENCIES = {KWD:3,SAR:2,AED:2,EGP:2,USD:2};
export type Currency = keyof typeof CURRENCIES;
export const ENTRY_TYPES = {fee:'أتعاب مستحقة',receipt:'مقبوضات',expense:'مصروفات'};
export const LEAVE_STATUSES = {pending:'بانتظار القرار',approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة'};
export const workspaceStorageKey='mawatheeq.workspace.v1';
export async function departmentPages<T>(workspace:Department,action:string,data:Record<string,unknown>={},size=500):Promise<T[]> {
 const rows:T[]=[];
 for(let offset=0;;offset+=size){const page=await departmentRequest<T[]>(action,{...data,workspace,offset});rows.push(...page);if(page.length<size)return rows;}
}
export function newDepartmentRecord<P>(workspace:DepartmentRecord['workspace'],kind:DepartmentRecord['kind'],payload:P):DepartmentRecord<P> {
 return {id:crypto.randomUUID(),workspace,kind,caseId:'',subjectId:'',payload,revision:0,archived:false,review:null,createdAt:'',updatedAt:'',createdBy:'',updatedBy:''};
}
// Integer minor units throughout, including totals beyond Number.MAX_SAFE_INTEGER.
export function moneyText(minor:string|bigint,currency:Currency) {
 const n=BigInt(minor),negative=n<BigInt(0),s=(negative?-n:n).toString().padStart(CURRENCIES[currency]+1,'0'),places=CURRENCIES[currency];
 return (negative?'-':'')+s.slice(0,-places).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+s.slice(-places)+' '+currency;
}
export function ledgerTotals(rows:LedgerRecord[],currency:Currency) {
 const totals={fee:BigInt(0),receipt:BigInt(0),expense:BigInt(0)};
 for(const r of rows)if(r.payload.currency===currency&&r.payload.status==='posted')totals[r.payload.type]+=BigInt(r.payload.amountMinor);
 return {...totals,outstanding:totals.fee-totals.receipt,net:totals.receipt-totals.expense};
}
