import type {CollectionData} from './departments';
export const COLLECTION_FIELDS:[string,[string,string][]][]=[
 ['الأطراف والعنوان',[['company','الشركة المدعية'],['defendant','المدعى عليه'],['civilId','الرقم المدني للمدعى عليه'],['nationality','الجنسية'],['address','العنوان'],['address2','تفاصيل إضافية للعنوان'],['companyCivil','الرقم المدني للشركة'],['companyRegister','السجل التجاري'],['phone','الهاتف']]],
 ['المطالبة وأمر الأداء',[['code','كود الملف'],['account','رقم العقد / الحساب'],['amount','مبلغ المطالبة (د.ك)'],['orderNumber','رقم أمر الأداء'],['court','محكمة أمر الأداء'],['rejectedDate','تاريخ رفض أمر الأداء'],['demandDate','تاريخ التكليف بالوفاء'],['statementDate','تاريخ كشف الحساب']]],
 ['الدعوى والجلسة',[['lawsuitNumber','رقم الدعوى'],['lawsuitYear','سنة الدعوى'],['hearingCourt','محكمة الجلسة'],['hearingCircuit','الدائرة'],['hearingDate','تاريخ الجلسة'],['hearingDay','يوم الجلسة']]],
 ['الإيصال',[['receiptNumber','رقم الإيصال'],['receiptDate','تاريخ الإيصال'],['receiptFee','رسوم الإيصال (د.ك)'],['orderAuto','الرقم الآلي لأمر الأداء']]],
];
export const COLLECTION_LABELS=Object.fromEntries(COLLECTION_FIELDS.flatMap(([,fields])=>fields));
const required={
 claim:['company','defendant','civilId','nationality','address','amount','amountWords','account','phone','orderNumber','court','rejectedDate','demandDate','statementDate','companyCivil','companyRegister','hearingCourt','hearingDate','hearingDay','hearingCircuit'],
 bundle:['company','defendant','hearingCourt','hearingDate','hearingCircuit','lawsuitNumber','lawsuitYear'],
};
export function missingDocumentFields(data:CollectionData,kind:'claim'|'bundle') {
 const missing=required[kind].filter(k=>!String(data[k]||'').trim()).map(k=>COLLECTION_LABELS[k]||'المبلغ كتابة');
 if(kind==='bundle'&&!data.evidence.some(e=>e.included))missing.push('مستند واحد على الأقل بالحافظة');
 return missing;
}
