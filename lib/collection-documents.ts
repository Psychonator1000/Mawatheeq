import type {CollectionData} from './departments';
export const COLLECTION_FIELDS:[string,[string,string][]][]=[
 ['الأطراف والعنوان',[['company','المدعي (الموكل)'],['defendant','المدعى عليه'],['defendantJob','وظيفة / إقامة المدعى عليه'],['civilId','الرقم المدني للمدعى عليه'],['nationality','الجنسية'],['address','العنوان'],['address2','تفاصيل إضافية للعنوان'],['companyCivil','الرقم المدني للمدعي'],['companyRegister','السجل التجاري للمدعي'],['phone','الهاتف']]],
 ['المطالبة وأمر الأداء',[['code','رقم ملف التحصيل'],['customerId','رقم العميل لدى الموكل'],['fileAutoNumber','الرقم الآلي لأمر الأداء (أعلى الطلب)'],['account','رقم العقد / الحساب'],['amount','مبلغ المطالبة (د.ك)'],['orderNumber','رقم أمر الأداء'],['court','محكمة أمر الأداء'],['rejectedDate','تاريخ رفض أمر الأداء'],['demandDate','تاريخ التكليف بالوفاء'],['statementDate','تاريخ كشف الحساب']]],
 ['الدعوى والجلسة',[['lawsuitNumber','رقم الدعوى'],['lawsuitYear','سنة الدعوى'],['hearingCourt','محكمة الجلسة'],['hearingCircuit','الدائرة'],['hearingDate','تاريخ الجلسة'],['hearingDay','يوم الجلسة']]],
 ['الإيصال',[['receiptNumber','رقم الإيصال'],['receiptDate','تاريخ الإيصال'],['receiptFee','رسوم الإيصال (د.ك)'],['orderAuto','الرقم الآلي في الإيصال']]],
];
export const COLLECTION_LABELS=Object.fromEntries(COLLECTION_FIELDS.flatMap(([,fields])=>fields));
const required={
 claim:['company','defendant','civilId','nationality','address','amount','amountWords','account','phone','orderNumber','court','rejectedDate','demandDate','statementDate','companyCivil','companyRegister','hearingCourt','hearingDate','hearingDay','hearingCircuit'],
 bundle:['company','defendant','hearingCourt','hearingDate','hearingCircuit','lawsuitNumber','lawsuitYear'],
};
/** Empty fields each document still needs, by field key: which documents ask for it. */
export function missingFieldKeys(data:CollectionData):Map<string,('claim'|'bundle')[]> {
 const out=new Map<string,('claim'|'bundle')[]>();
 for(const kind of ['claim','bundle'] as const)for(const k of required[kind])if(!String(data[k]||'').trim())out.set(k,[...(out.get(k)||[]),kind]);
 return out;
}
export function missingDocumentFields(data:CollectionData,kind:'claim'|'bundle') {
 const missing=required[kind].filter(k=>!String(data[k]||'').trim()).map(k=>COLLECTION_LABELS[k]||'المبلغ كتابة');
 if(kind==='bundle'&&!data.evidence.some(e=>e.included))missing.push('مستند واحد على الأقل بالحافظة');
 return missing;
}
