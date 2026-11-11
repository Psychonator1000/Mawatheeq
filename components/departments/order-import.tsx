import {useEffect,useRef,useState} from 'react';
import {Check,FileText,LoaderCircle,X} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type CollectionRecord,newDepartmentRecord} from '@/lib/departments';
import {type DocumentData} from '@/lib/document-fields';
import {normalizeSearch} from '@/lib/case-browse';
import {ORDER_FIELDS,fieldsToCheck,fillEmpty,guessClient,orderPayload,pagesText} from '@/lib/order-import';
import {EditorDialog} from './shared';

type Item={id:string;file:File;status:'waiting'|'reading'|'ready'|'failed';progress:number;message:string;data?:DocumentData;client:string;skip:boolean;error?:string};
// The order, the court receipt, the office's bundle list and the account statement are the first four pages.
const PAGES=4;

/**
 * Collection files from scanned payment-order PDFs. Each order is read on this computer, one after another, its
 * fields are shown for checking (doubtful ones marked), and the files are created only when the user confirms.
 * An order whose automatic number is already on a file is left out unless chosen.
 */
export default function OrderImport({files,clients,onDone}:{files:CollectionRecord[];clients:{id:string;name:string}[];onDone:()=>void}) {
 const [items,setItems]=useState<Item[]|null>(null),[busy,setBusy]=useState(false),[saving,setSaving]=useState(false);
 const stop=useRef<AbortController|null>(null);
 const patch=(id:string,v:Partial<Item>)=>setItems(list=>list&&list.map(i=>i.id===id?{...i,...v}:i));
 // A file already made for this order (from the client's list of orders) is completed rather than made again.
 const existingFile=(d?:DocumentData)=>d?.orderAuto?files.find(f=>!f.archived&&(f.payload.orderAuto===d.orderAuto||f.payload.fileAutoNumber===d.orderAuto)):undefined;
 const existing=(d?:DocumentData)=>!!existingFile(d);
 async function readAll(list:Item[]){
  const {extractPDF}=await import('@/lib/pdf-reader');const {extractFields}=await import('@/lib/document-fields');
  const ctrl=new AbortController();stop.current=ctrl;setBusy(true);
  for(const item of list){
   if(ctrl.signal.aborted)break;
   patch(item.id,{status:'reading',progress:0,message:'تجهيز القراءة…'});
   try{
    const pages=await extractPDF(item.file,(p,message)=>patch(item.id,{progress:p,message}),ctrl.signal,PAGES);
    const data=extractFields(pagesText(pages),item.file.name);
    patch(item.id,{status:'ready',data,client:existingFile(data)?.payload.clientEntityId||guessClient(data.company,clients),skip:false});
   }catch(e){if(ctrl.signal.aborted)break;patch(item.id,{status:'failed',error:(e as Error).message})}
  }
  setBusy(false);stop.current=null;
 }
 useEffect(()=>()=>stop.current?.abort(),[]);
 function pick(chosen:FileList|null){
  const pdfs=[...(chosen||[])].filter(f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf');
  if(!pdfs.length){toast.error('اختر ملفات PDF لأوامر الأداء.');return}
  const list=pdfs.map(file=>({id:crypto.randomUUID(),file,status:'waiting' as const,progress:0,message:'بانتظار القراءة',client:'',skip:false}));
  setItems(list);void readAll(list);
 }
 const ready=(items||[]).filter(i=>i.status==='ready'&&!i.skip);
 async function create(){
  setSaving(true);const failed:string[]=[];let made=0;
  for(const i of ready){
   // The client's own details (civil and commercial register numbers, e-mail) are the same on every file: they come
   // from the latest file of the same client, so nobody types them again.
   const prev=[...files].filter(f=>!f.archived&&(i.client?f.payload.clientEntityId===i.client:normalizeSearch(f.payload.company)===normalizeSearch(i.data!.company))&&(f.payload.companyCivil||f.payload.companyRegister)).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))[0];
   const data={...i.data!,...(prev?{companyCivil:i.data!.companyCivil||prev.payload.companyCivil||'',companyRegister:i.data!.companyRegister||prev.payload.companyRegister||'',email:i.data!.email||prev.payload.email||''}:{})};
   const have=existingFile(i.data);
   try{
    if(have)await departmentRequest('save_record',{workspace:'collections',record:{...have,payload:{...fillEmpty(have.payload,data),clientEntityId:have.payload.clientEntityId||i.client}}});
    else await departmentRequest('save_record',{workspace:'collections',record:newDepartmentRecord('collections','file',orderPayload(data,{clientEntityId:i.client,source:'أمر أداء (PDF): '+i.file.name}))});
    made++;patch(i.id,{skip:true})}
   catch(e){failed.push(`${i.file.name}: ${(e as Error).message}`)}
  }
  setSaving(false);
  if(made)toast.success(`حُفظ ${made} ملف تحصيل. اطبعها من «طباعة الحافظة والدعوى».`);
  if(failed.length)toast.error(failed.join(' · '));else{setItems(null);onDone()}
 }
 const close=()=>{stop.current?.abort();setItems(null);if(ready.length===0)onDone()};
 return <>
  <label className="btn"><FileText size={16}/> من أوامر أداء (PDF)<input type="file" accept="application/pdf,.pdf" multiple className="upload-input" aria-label="ملفات PDF لأوامر الأداء" onChange={e=>{pick(e.target.files);e.target.value=''}}/></label>
  {items&&<EditorDialog title="ملفات تحصيل من أوامر الأداء" description="تُقرأ الأوامر على هذا الجهاز. راجع الحقول المظللة قبل الحفظ؛ الأمر الذي له ملف بالرقم الآلي نفسه يكمّل الحقول الفارغة في ذلك الملف فقط." busy={saving} onClose={close}>
   <div className="order-import">
    {items.map(i=>{const d=i.data,check=d?fieldsToCheck(d):[],dup=existing(d);
     return <section key={i.id} className={'order-card'+(i.skip?' skipped':'')} aria-label={i.file.name}>
      <header className="order-card-head"><b>{i.file.name}</b>
       {i.status==='reading'&&<span className="tag" role="status"><LoaderCircle className="spin" size={13}/> {i.message} ({Math.round(i.progress)}%)</span>}
       {i.status==='waiting'&&<span className="tag">بانتظار القراءة</span>}
       {i.status==='failed'&&<span className="tag red" role="alert">تعذرت القراءة: {i.error}</span>}
       {i.status==='ready'&&(dup?<span className="tag">يكمّل الملف الموجود بهذا الرقم الآلي</span>:check.length?<span className="tag amber">{check.length} حقل للمراجعة</span>:<span className="tag green">جاهز</span>)}
       {i.status==='ready'&&<label className="checkbox-line"><input type="checkbox" checked={!i.skip} onChange={e=>patch(i.id,{skip:!e.target.checked})}/> {dup?'إكمال الملف':'إنشاء ملف'}</label>}
      </header>
      {d&&!i.skip&&<div className="order-fields">
       <label className="field"><span>الموكل</span><select value={i.client} onChange={e=>patch(i.id,{client:e.target.value})} aria-label={'الموكل · '+i.file.name}><option value="">بلا ربط</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
       {ORDER_FIELDS.map(([k,label])=><label key={k} className={'field'+(check.includes(k)?' needs-check':'')+(k==='address'?' wide':'')}><span>{label}</span>
        <input value={String(d[k]??'')} dir={/Date$|amount|Fee|Auto|civilId|account|receiptNumber|orderNumber/.test(k)?'ltr':undefined} aria-label={label+' · '+i.file.name}
         onChange={e=>patch(i.id,{data:{...d,[k]:e.target.value}})}/></label>)}
      </div>}
     </section>})}
   </div>
   <div className="actions">
    <button className="btn primary" disabled={busy||saving||!ready.length} onClick={()=>void create()}>{saving?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>} حفظ {ready.length} ملف</button>
    {busy&&<button className="btn" onClick={()=>stop.current?.abort()}><X size={16}/> إيقاف القراءة</button>}
    <button className="btn" disabled={saving} onClick={close}>إغلاق</button>
   </div>
  </EditorDialog>}
 </>;
}
