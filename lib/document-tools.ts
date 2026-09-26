import {formatDate} from './domain';
import {getWordTemplate} from './client-api';
import {blankDocument, type DocumentData, type Evidence} from './document-fields';
export {blankDocument,extractFields,extractionSummary,normalizeDigits,amountInWords} from './document-fields';
export type {DocumentData,Evidence} from './document-fields';
export {extractPDF} from './pdf-reader';
export type {PDFPageText} from './pdf-reader';
export function suggestedEvidence(d:DocumentData):Evidence[]{return [
 {id:'statement',included:false,date:d.statementDate,description:`صورة كشف حساب المشترك${d.account?' رقم ('+d.account+')':''}${d.amount?'، بإجمالي مديونية قدرها '+d.amount+' د.ك':''}.`,pages:1},
 {id:'contract',included:false,date:'',description:'صورة عقد طلب الخدمة المذيل بتوقيع المدعى عليه وشروطه العامة.',pages:2},
 {id:'demand',included:false,date:d.demandDate,description:'صورة كتاب التكليف بالوفاء، مرفقاً به صورة كشف البعثية البريدية.',pages:2},
 {id:'civil',included:false,date:'',description:`صورة البطاقة المدنية للمدعى عليه ${d.defendant}.`,pages:1},
 {id:'order',included:false,date:d.rejectedDate,description:`صورة طلب استصدار أمر الأداء ${d.court}، والمؤشر عليه بالرفض${d.rejectedDate?' بتاريخ '+formatDate(d.rejectedDate):''}.`,pages:1},
 {id:'receipt',included:false,date:d.receiptDate,description:'صورة إيصال سداد الرسوم القضائية عن طلب أمر الأداء.',pages:1}];}
export async function generateWord(kind:'claim'|'bundle',d:DocumentData):Promise<Blob>{const PizZip=(await import('pizzip')).default;const base64=await getWordTemplate(kind);const zip=new PizZip(base64,{base64:true});const xml=zip.file('word/document.xml')!.asText();const parser=new DOMParser();const dom=parser.parseFromString(xml,'application/xml');const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';const fields:Record<string,string>={};for(const [k,v]of Object.entries(d)){if(typeof v==='string')fields[k]=k.toLowerCase().includes('date')?formatDate(v):v||'................'};
 const docs=d.evidence.filter(e=>e.included);fields.documentCount=String(docs.length);fields.pageCount=String(docs.reduce((n,e)=>n+Number(e.pages),0));if(kind==='bundle'){const table=dom.getElementsByTagNameNS(ns,'tbl')[1];const rows=table.getElementsByTagNameNS(ns,'tr');const proto=rows[1].cloneNode(true);rows[1].remove();docs.forEach((e,i)=>{const row=proto.cloneNode(true) as Element;let description=e.description;for(const id of [d.civilId,d.receiptNumber,d.orderNumber,d.orderAuto])if(id)description=description.split(id).join('');const r={index:String(i+1),date:formatDate(e.date),description:description.replace(/\(\s*\)/g,'').replace(/رقم\s*[,،.]/g,'').trim(),pages:String(e.pages)};for(const text of Array.from(row.getElementsByTagNameNS(ns,'t')))text.textContent=(text.textContent||'').replace(/\{\{(\w+)\}\}/g,(_,key)=>r[key as keyof typeof r]||'');table.appendChild(row)})}
 for(const text of Array.from(dom.getElementsByTagNameNS(ns,'t')))text.textContent=(text.textContent||'').replace(/\{\{(\w+)\}\}/g,(_,key)=>fields[key]||'................');zip.file('word/document.xml',new XMLSerializer().serializeToString(dom));return zip.generate({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});}
