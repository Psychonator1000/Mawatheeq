import {useState} from 'react';
import {Check,FileText,LoaderCircle,X,Eye} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type CollectionRecord,newDepartmentRecord} from '@/lib/departments';
import {type DocumentData} from '@/lib/document-fields';
import {normalizeSearch} from '@/lib/case-browse';
import {ORDER_FIELDS,fieldsToCheck,fillEmpty,guessClient,orderPayload} from '@/lib/order-import';
import {orderReading,patchOrder,useOrderReading,type OrderItem} from '@/lib/order-reading';
import {EditorDialog} from './shared';

/** «أمر واحد», «أمرين», «3 أوامر», «11 أمراً»: the count of orders as Arabic says it. */
const orders=(n:number)=>n===1?'أمر واحد':n===2?'أمرين':n<=10?`${n} أوامر`:`${n} أمراً`;

/** «من أوامر أداء (PDF)»: the chosen orders join the reading queue, which runs in the background. */
export default function OrderImport(){
 function pick(chosen:FileList|null){
  const pdfs=[...(chosen||[])].filter(f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf');
  if(!pdfs.length){toast.error('اختر ملفات PDF لأوامر الأداء.');return}
  orderReading.start(pdfs);
  toast.success(`بدأت قراءة ${orders(pdfs.length)} في الخلفية. يمكنك متابعة عملك.`);
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
 const existingFile=(d?:DocumentData)=>d?.orderAuto?files.find(f=>!f.archived&&(f.payload.orderAuto===d.orderAuto||f.payload.fileAutoNumber===d.orderAuto)):undefined;
 const existing=(d?:DocumentData)=>!!existingFile(d);
 // The client is taken from the file this order completes, or guessed from the creditor's name, until it is chosen.
 const clientOf=(i:OrderItem)=>i.client??(existingFile(i.data)?.payload.clientEntityId||guessClient(i.data?.company||'',clients));
 const ready=items.filter(i=>i.status==='ready'&&!i.skip),done=items.filter(i=>i.status==='ready'||i.status==='failed').length;
 const current=items.find(i=>i.status==='reading'),waiting=items.filter(i=>i.status==='waiting').length;
 const overall=items.length?Math.round((done+(current?current.progress/100:0))/items.length*100):0;
 async function create(){
  setSaving(true);const failed:string[]=[],saved:string[]=[];let made=0;
  for(const i of ready){
   // The client's own details (civil and commercial register numbers, e-mail) are the same on every file: they come
   // from the latest file of the same client, so nobody types them again.
   const prev=[...files].filter(f=>!f.archived&&(clientOf(i)?f.payload.clientEntityId===clientOf(i):normalizeSearch(f.payload.company)===normalizeSearch(i.data!.company))&&(f.payload.companyCivil||f.payload.companyRegister)).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];
   const data={...i.data!,...(prev?{companyCivil:i.data!.companyCivil||prev.payload.companyCivil||'',companyRegister:i.data!.companyRegister||prev.payload.companyRegister||'',email:i.data!.email||prev.payload.email||''}:{})};
   const have=existingFile(i.data);
   try{
    if(have)await departmentRequest('save_record',{workspace:'collections',record:{...have,payload:{...fillEmpty(have.payload,data),clientEntityId:have.payload.clientEntityId||clientOf(i)}}});
    else await departmentRequest('save_record',{workspace:'collections',record:newDepartmentRecord('collections','file',orderPayload(data,{clientEntityId:clientOf(i),source:'أمر أداء (PDF): '+i.file.name}))});
    made++;saved.push(i.id)}
   catch(e){failed.push(`${i.file.name}: ${(e as Error).message}`)}
  }
  setSaving(false);orderReading.remove(saved);if(made)onDone();
  if(made)toast.success(`حُفظ ${made} ملف تحصيل. اطبعها من «طباعة الحافظة والدعوى».`);
  if(failed.length)toast.error(failed.join(' · '));
 }
 if(!items.length)return null;
 const allDone=!running&&!waiting;
 return <>
  <div className="order-reading" role="status" aria-label="قراءة أوامر الأداء">
   <div className="order-reading-text">{running?<LoaderCircle className="spin" size={15}/>:<FileText size={15}/>}
    <b>{allDone?`اكتملت قراءة ${items.length===1?'أمر الأداء':orders(items.length)}`:`قراءة أوامر الأداء: ${done} من ${items.length}`}</b>
    <small>{current?`${current.file.name} · ${current.message}`:allDone?`جاهز للمراجعة: ${ready.length}${items.some(i=>i.status==='failed')?` · تعذرت القراءة: ${items.filter(i=>i.status==='failed').length}`:''}`:waiting?'متوقفة':''}</small></div>
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
    {items.map(i=>{const d=i.data,check=d?fieldsToCheck(d):[],dup=existing(d);
     return <section key={i.id} className={'order-card'+(i.skip?' skipped':'')} aria-label={i.file.name}>
      <header className="order-card-head"><b>{i.file.name}</b>
       {i.status==='reading'&&<span className="tag" role="status"><LoaderCircle className="spin" size={13}/> {i.message} ({Math.round(i.progress)}%)</span>}
       {i.status==='waiting'&&<span className="tag">بانتظار القراءة</span>}
       {i.status==='failed'&&<span className="tag red" role="alert">تعذرت القراءة: {i.error}</span>}
       {i.status==='ready'&&(dup?<span className="tag">يكمّل الملف الموجود بهذا الرقم الآلي</span>:check.length?<span className="tag amber">{check.length} حقل للمراجعة</span>:<span className="tag green">جاهز</span>)}
       {i.status==='ready'&&<label className="checkbox-line"><input type="checkbox" checked={!i.skip} onChange={e=>patchOrder(i.id,{skip:!e.target.checked})}/> {dup?'إكمال الملف':'إنشاء ملف'}</label>}
      </header>
      {d&&!i.skip&&<div className="order-fields">
       <label className="field"><span>الموكل</span><select value={clientOf(i)} onChange={e=>patchOrder(i.id,{client:e.target.value})} aria-label={'الموكل · '+i.file.name}><option value="">بلا ربط</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
       {ORDER_FIELDS.map(([k,label])=><label key={k} className={'field'+(check.includes(k)?' needs-check':'')+(k==='address'?' wide':'')}><span>{label}</span>
        <input value={String(d[k]??'')} dir={/Date$|amount|Fee|Auto|civilId|account|receiptNumber|orderNumber/.test(k)?'ltr':undefined} aria-label={label+' · '+i.file.name}
         onChange={e=>patchOrder(i.id,{data:{...d,[k]:e.target.value}})}/></label>)}
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
