import {useState} from 'react';
import {Check,FileText,LoaderCircle,X,Eye} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type CollectionRecord,newDepartmentRecord} from '@/lib/departments';
import {COLLECTION_LABELS,missingFieldKeys} from '@/lib/collection-documents';
import {type DocumentData} from '@/lib/document-fields';
import {normalizeSearch} from '@/lib/case-browse';
import {ORDER_FIELDS,clientNameOnFiles,fallbackClient,fieldsToCheck,filesPerClient,fillEmpty,guessClient,orderPayload} from '@/lib/order-import';
import {orderReading,patchOrder,useOrderReading,type OrderItem,type Only} from '@/lib/order-reading';

/** What the account statement page carries for a claim. */
const STATEMENT_FIELDS:(keyof DocumentData)[]=['phone','statementDate'];
import {EditorDialog} from './shared';

/** «أمر واحد», «أمرين», «3 أوامر», «11 أمراً»: the count of orders as Arabic says it. */
const orders=(n:number)=>n===1?'أمر واحد':n===2?'أمرين':n<=10?`${n} أوامر`:`${n} أمراً`;

/** «من أوامر أداء (PDF)»: the chosen orders join the reading queue, which runs in the background. */
export default function OrderImport({files=[]}:{files?:CollectionRecord[]}){
 // A PDF named by the automatic number of a file that lacks only what the account statement carries (the subscription
 // line, its date) is read from that page alone, a third of the time (owner, 14 November 2026: «I have to rescan again»).
 const only=(file:File):Only|undefined=>{
  const auto=file.name.match(/(?<!\d)(\d{9})(?!\d)/)?.[1],have=auto&&files.find(f=>!f.archived&&(f.payload.orderAuto===auto||f.payload.fileAutoNumber===auto));
  if(!auto||!have)return undefined;
  const need=[...missingFieldKeys(have.payload).entries()].filter(([,kinds])=>kinds.includes('claim')).map(([k])=>k);
  return need.length&&need.every(k=>STATEMENT_FIELDS.includes(k as keyof DocumentData))?{pages:[4],auto,need}:undefined;
 };
 function pick(chosen:FileList|null){
  const pdfs=[...(chosen||[])].filter(f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf');
  if(!pdfs.length){toast.error('اختر ملفات PDF لأوامر الأداء.');return}
  orderReading.start(pdfs,only);
  const quick=pdfs.filter(f=>only(f)).length;
  toast.success(`بدأت قراءة ${orders(pdfs.length)} في الخلفية${quick?`، منها ${quick} تُقرأ من صفحة كشف الحساب وحدها`:''}. يمكنك متابعة عملك.`);
 }
 return <label className="btn"><FileText size={16}/> من أوامر أداء (PDF)<input type="file" accept="application/pdf,.pdf" multiple className="upload-input" aria-label="ملفات PDF لأوامر الأداء" onChange={e=>{pick(e.target.files);e.target.value=''}}/></label>;
}

/**
 * The reading's bar on the page (how far it has got, stop, review) and the review of the orders read: their fields shown
 * for checking (doubtful ones marked), and the files created only when the person confirms. An order whose automatic
 * number is already on a file completes that file's empty fields instead.
 */
export function OrderReadingPanel({files,clients,onDone}:{files:CollectionRecord[];clients:{id:string;name:string}[];onDone:()=>void}){
 const {items,running,open}=useOrderReading();
 const [saving,setSaving]=useState(false);
 // A file already made for this order (from the client's list of orders) is completed rather than made again.
 // Without the automatic number (the scan missed it), the same payment order for the same debtor is that file too: it
 // made a second file for one order once (owner, 14 November 2026: «so that we don't find dups»).
 const existingFile=(d?:DocumentData)=>!d?undefined:d.orderAuto?files.find(f=>!f.archived&&(f.payload.orderAuto===d.orderAuto||f.payload.fileAutoNumber===d.orderAuto))
  :d.orderNumber?files.find(f=>!f.archived&&f.payload.orderNumber===d.orderNumber&&((!!d.civilId&&f.payload.civilId===d.civilId)||(!!d.defendant.trim()&&normalizeSearch(f.payload.defendant)===normalizeSearch(d.defendant)))):undefined;
 const existing=(d?:DocumentData)=>!!existingFile(d);
 // What reading the order again would add to the file it completes: only its empty fields (owner, 14 November 2026: «any
 // file that exists fully should be skipped»). A complete file is left as it is, with nothing saved.
 const adds=(have:CollectionRecord,payload:CollectionRecord['payload'])=>Object.keys(payload).filter(k=>JSON.stringify(payload[k as keyof typeof payload])!==JSON.stringify(have.payload[k as keyof typeof have.payload])).length;
 // The file this order completes: its empty fields filled, its client set, and the creditor written as the client's
 // other files write it when the file is that client's.
 const completed=(have:CollectionRecord,data:DocumentData,i:OrderItem)=>{const client=have.payload.clientEntityId||clientOf(i),name=client?clientNameOnFiles(client,files,clients):'';
  return {...fillEmpty(have.payload,data),clientEntityId:client,...(name?{company:name}:{})}};
 const fieldsAr=(n:number)=>n===1?'حقلاً واحداً':n===2?'حقلين':n%100>=3&&n%100<=10?`${n} حقول`:`${n} حقلاً`;
 // The client is taken from the file this order completes, or guessed from the creditor's name, until it is chosen; an
 // order whose creditor the scan could not read goes to the client of the others (owner, 14 November 2026: «make a
 // fall back to the correct client name so that we don't find dups»).
 const held=filesPerClient(files);
 const guessed=(i:OrderItem)=>existingFile(i.data)?.payload.clientEntityId||guessClient(i.data?.company||'',clients,held);
 const clientOf=(i:OrderItem)=>i.client??(guessed(i)||fallbackClient(items.filter(x=>x.status==='ready'&&!x.client).map(guessed),held));
 // With a client, the creditor is written as that client's other files write it («… ( Stc)»), never as the scan read it.
 // A file read from one page shows the saved file's details with what that page added.
 const shown=(i:OrderItem):DocumentData|undefined=>{
  const have=i.only&&i.data?existingFile(i.data):undefined;
  const d=i.data&&have?{...i.data,...Object.fromEntries(ORDER_FIELDS.map(([k])=>[k,String(i.data![k]??'').trim()||String(have.payload[k as keyof typeof have.payload]??'')])),phone:i.data.phone||String(have.payload.phone||'')}:i.data;
  const name=d&&clientNameOnFiles(clientOf(i),files,clients);return d&&name?{...d,company:name}:d};
 const ready=items.filter(i=>i.status==='ready'&&!i.skip),done=items.filter(i=>i.status==='ready'||i.status==='failed').length;
 const reading=items.filter(i=>i.status==='reading'),current=reading[0],waiting=items.filter(i=>i.status==='waiting').length;
 const overall=items.length?Math.round((done+reading.reduce((t,i)=>t+i.progress/100,0))/items.length*100):0;
 async function create(){
  setSaving(true);const failed:string[]=[],saved:string[]=[];let made=0,unchanged=0;
  for(const i of ready){
   // The client's own details (civil and commercial register numbers, e-mail) are the same on every file: they come
   // from the latest file of the same client, so nobody types them again.
   const read=shown(i)!;
   const prev=[...files].filter(f=>!f.archived&&(clientOf(i)?f.payload.clientEntityId===clientOf(i):normalizeSearch(f.payload.company)===normalizeSearch(read.company))&&(f.payload.companyCivil||f.payload.companyRegister)).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];
   const data={...read,...(prev?{companyCivil:read.companyCivil||prev.payload.companyCivil||'',companyRegister:read.companyRegister||prev.payload.companyRegister||'',email:read.email||prev.payload.email||''}:{})};
   const have=existingFile(i.data);
   try{
    if(have){const payload=completed(have,data,i);
     if(!adds(have,payload)){unchanged++;saved.push(i.id);continue}
     await departmentRequest('save_record',{workspace:'collections',record:{...have,payload}});}
    else await departmentRequest('save_record',{workspace:'collections',record:newDepartmentRecord('collections','file',orderPayload(data,{clientEntityId:clientOf(i),source:'أمر أداء (PDF): '+i.file.name}))});
    made++;saved.push(i.id)}
   catch(e){failed.push(`${i.file.name}: ${(e as Error).message}`)}
  }
  setSaving(false);orderReading.remove(saved);if(made)onDone();
  if(made)toast.success(`حُفظ ${made} ملف تحصيل. اطبعها من «طباعة الحافظة والدعوى».`);
  if(unchanged)toast.success(`${unchanged===1?'ملف واحد كان':unchanged===2?'ملفان كانا':unchanged%100>=3&&unchanged%100<=10?unchanged+' ملفات كانت':unchanged+' ملفاً كان'} مكتملاً فلم يتغير.`);
  if(failed.length)toast.error(failed.join(' · '));
 }
 if(!items.length)return null;
 const allDone=!running&&!waiting;
 return <>
  <div className="order-reading" role="status" aria-label="قراءة أوامر الأداء">
   <div className="order-reading-text">{running?<LoaderCircle className="spin" size={15}/>:<FileText size={15}/>}
    <b>{allDone?`اكتملت قراءة ${items.length===1?'أمر الأداء':orders(items.length)}`:`قراءة أوامر الأداء: ${done} من ${items.length}`}</b>
    <small>{current?(reading.length>1?`يقرأ ${orders(reading.length)} معاً: ${reading.map(i=>i.file.name).join('، ')}`:`${current.file.name} · ${current.message}`):allDone?`جاهز للمراجعة: ${ready.length}${items.some(i=>i.status==='failed')?` · تعذرت القراءة: ${items.filter(i=>i.status==='failed').length}`:''}`:waiting?'متوقفة':''}</small></div>
   <div className="order-reading-bar" aria-hidden><i style={{width:overall+'%'}}/></div>
   <div className="order-reading-acts">
    <button type="button" className="btn primary" disabled={!ready.length&&!items.some(i=>i.status==='failed')} onClick={()=>orderReading.open(true)}><Eye size={14}/> مراجعة وحفظ{ready.length?` (${ready.length})`:''}</button>
    {running?<button type="button" className="btn" onClick={()=>orderReading.stop()}><X size={14}/> إيقاف</button>
     :waiting?<button type="button" className="btn" onClick={()=>orderReading.resume()}>متابعة القراءة</button>
     :<button type="button" className="btn" onClick={()=>orderReading.remove()} title="إزالة الأوامر المقروءة دون حفظ">تجاهل</button>}
   </div>
  </div>
  {open&&<EditorDialog title="ملفات تحصيل من أوامر الأداء" description={(running?`القراءة مستمرة في الخلفية (${done} من ${items.length}). `:'')+'راجع الحقول المظللة قبل الحفظ؛ الأمر الذي له ملف بالرقم الآلي نفسه يكمّل الحقول الفارغة في ذلك الملف فقط.'} busy={saving} onClose={()=>orderReading.open(false)}>
   <div className="order-import">
    {items.map(i=>{const d=shown(i),check=d?fieldsToCheck(d):[],dup=existing(d),linked=!!(d&&clientOf(i)&&clientNameOnFiles(clientOf(i),files,clients));
     return <section key={i.id} className={'order-card'+(i.skip?' skipped':'')} aria-label={i.file.name}>
      <header className="order-card-head"><b>{i.file.name}</b>
       {i.status==='reading'&&<span className="tag" role="status"><LoaderCircle className="spin" size={13}/> {i.message} ({Math.round(i.progress)}%)</span>}
       {i.status==='waiting'&&<span className="tag">بانتظار القراءة</span>}
       {i.status==='failed'&&<><span className="tag red" role="alert">تعذرت القراءة: {i.error}</span><button type="button" className="btn" onClick={()=>orderReading.retry(i.id)}>إعادة القراءة</button></>}
       {i.status==='ready'&&(dup?(()=>{const have=existingFile(d)!,n=adds(have,completed(have,shown(i)!,i));return n?<span className="tag">يكمّل الملف الموجود بهذا الرقم الآلي: يضيف {fieldsAr(n)}</span>:(()=>{
        // «مكتمل» only for a file that can be printed; otherwise the reading added nothing and the file still lacks something (owner, 14 November 2026).
        const lacks=[...missingFieldKeys(have.payload).entries()].filter(([,kinds])=>kinds.includes('claim')).map(([k])=>k==='amountWords'?'المبلغ كتابة':COLLECTION_LABELS[k]||k);
        return lacks.length?<span className="tag amber" title="اكتب الناقص في الحقول أدناه ثم احفظ">لا جديد في هذه القراءة · ينقص الملف: {lacks.join('، ')}</span>:<span className="tag green">مكتمل · لن يتغير شيء</span>})()})():check.length?<span className="tag amber">{check.length} حقل للمراجعة</span>:<span className="tag green">جاهز</span>)}
       {i.status==='ready'&&<label className="checkbox-line"><input type="checkbox" checked={!i.skip} onChange={e=>patchOrder(i.id,{skip:!e.target.checked})}/> {dup?'إكمال الملف':'إنشاء ملف'}</label>}
      </header>
      {d&&!i.skip&&<div className="order-fields">
       <label className="field"><span>الموكل</span><select value={clientOf(i)} onChange={e=>patchOrder(i.id,{client:e.target.value})} aria-label={'الموكل · '+i.file.name}><option value="">بلا ربط</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
       {ORDER_FIELDS.map(([k,label])=><label key={k} className={'field'+(check.includes(k)?' needs-check':'')+(k==='address'?' wide':'')}><span>{label}</span>
        <input value={String(d[k]??'')} dir={/Date$|amount|Fee|Auto|civilId|account|receiptNumber|orderNumber/.test(k)?'ltr':undefined} aria-label={label+' · '+i.file.name}
         readOnly={k==='company'&&linked} title={k==='company'&&linked?'يُكتب كما في ملفات الموكل المختار. غيّر «الموكل» لتغييره.':undefined}
         onChange={e=>patchOrder(i.id,{data:{...i.data!,[k]:e.target.value}})}/></label>)}
      </div>}
     </section>})}
   </div>
   <div className="actions">
    <button className="btn primary" disabled={saving||!ready.length} onClick={()=>void create()}>{saving?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>} حفظ {ready.length} ملف</button>
    {running&&<button className="btn" onClick={()=>orderReading.stop()}><X size={16}/> إيقاف القراءة</button>}
    <button className="btn" disabled={saving} onClick={()=>orderReading.open(false)}>{running?'متابعة العمل والقراءة مستمرة':'إغلاق'}</button>
   </div>
  </EditorDialog>}
 </>;
}
