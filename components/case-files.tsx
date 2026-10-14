'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Download,ExternalLink,FileImage,FileSpreadsheet,FileText,FolderOpen,LoaderCircle,Pencil,Search,Trash2,Upload,X} from 'lucide-react';
import {toast} from 'sonner';
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from '@/components/ui/alert-dialog';
import {caseFileRequest,fileRequest} from '@/lib/local-auth';
import {backend} from '@/lib/supabase-client';
import {formatDate,todayISO} from '@/lib/domain';
import {normalizeSearch} from '@/lib/case-browse';
import {CASE_FILE_ACCEPT,CASE_FILE_CATEGORIES,MAX_CASE_FILE,caseFileMime,formatSize,guessCategory,isPreviewable,titleFromName,type CaseFile} from '@/lib/case-files';
import {Field,DateField} from './shared';
import FilterSelect from './filter-select';

const CATEGORY_OPTIONS=CASE_FILE_CATEGORIES.map(c=>({value:c,label:c}));
const missing=(e:unknown)=>/Could not find the function|PGRST202|404/.test(String((e as Error)?.message||e));
type Pending={key:string;file:File;mime:string;title:string;category:string;docDate:string;state:'ready'|'uploading'|'done'|'failed';error?:string};
const iconFor=(mime:string)=>mime.startsWith('image/')?FileImage:/sheet|excel/.test(mime)?FileSpreadsheet:FileText;

/**
 * Every file attached to a case: memorandums, document bundles, judgments and the rest, newest first, with a
 * preview beside the list. Several files can be chosen (or dropped) at once; each gets a title, a category and the
 * date on the document before it is uploaded.
 */
export default function CaseFiles({caseId,canEdit:allowed,onCount}:{caseId:string;canEdit:boolean;onCount?:(n:number)=>void}){
 const [files,setFiles]=useState<CaseFile[]|null>(null),[serverEdit,setServerEdit]=useState(false),[off,setOff]=useState(false),[error,setError]=useState('');
 const [category,setCategory]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState<string>('');
 const [pending,setPending]=useState<Pending[]>([]),[uploading,setUploading]=useState(false),[dragging,setDragging]=useState(false);
 const [editing,setEditing]=useState<CaseFile|null>(null),[removing,setRemoving]=useState<CaseFile|null>(null),[busy,setBusy]=useState(false);
 const picker=useRef<HTMLInputElement>(null);
 const canEdit=allowed&&serverEdit;
 const [version,setVersion]=useState(0);const load=()=>setVersion(v=>v+1);
 useEffect(()=>{let live=true;
  caseFileRequest<{files:CaseFile[];canEdit:boolean}>('list',{caseId}).then(r=>{if(!live)return;setFiles(r.files);setServerEdit(r.canEdit);setError('')})
   .catch(e=>{if(!live)return;if(missing(e))setOff(true);else setError((e as Error).message)});
  return()=>{live=false}},[caseId,version]);
 useEffect(()=>{if(files)onCount?.(files.length)},[files,onCount]);

 const counts=useMemo(()=>{const m=new Map<string,number>();for(const f of files||[])m.set(f.category,(m.get(f.category)||0)+1);return m},[files]);
 const shown=useMemo(()=>{const q=normalizeSearch(query);return (files||[]).filter(f=>(!category||f.category===category)&&(!q||normalizeSearch(f.title+' '+f.name+' '+f.category).includes(q)))},[files,category,query]);
 const current=(files||[]).find(f=>f.id===selected)||null;

 function add(list:FileList|File[]){
  const next:Pending[]=[];const refused:string[]=[];
  for(const file of Array.from(list)){
   const mime=caseFileMime(file);
   if(!mime){refused.push(file.name+' (نوع غير مدعوم)');continue}
   if(file.size<1||file.size>MAX_CASE_FILE){refused.push(file.name+' (أكبر من 25 م.ب)');continue}
   next.push({key:crypto.randomUUID(),file,mime,title:titleFromName(file.name),category:guessCategory(file.name),docDate:todayISO(),state:'ready'});
  }
  if(refused.length)toast.error('لم تُضف هذه الملفات: '+refused.join('، '));
  if(next.length)setPending(p=>[...p.filter(x=>x.state!=='done'),...next]);
 }
 const setItem=(key:string,patch:Partial<Pending>)=>setPending(p=>p.map(x=>x.key===key?{...x,...patch}:x));
 async function uploadAll(){
  if(uploading)return;setUploading(true);let ok=0;
  for(const item of pending.filter(x=>x.state==='ready'||x.state==='failed')){
   setItem(item.key,{state:'uploading',error:undefined});
   try{
    const up=await fileRequest('case_upload',{caseId,name:item.file.name,size:item.file.size,mime:item.mime});
    const {error:sent}=await backend().storage.from('mawatheeq-case-files').uploadToSignedUrl(up.path,up.token!,item.file,{contentType:item.mime,upsert:false});
    if(sent)throw new Error('تعذر رفع الملف: '+sent.message);
    await caseFileRequest('add',{caseId,path:up.path,name:item.file.name,size:item.file.size,mime:item.mime,title:item.title.trim()||titleFromName(item.file.name),category:item.category,docDate:item.docDate});
    setItem(item.key,{state:'done'});ok++;
   }catch(e){setItem(item.key,{state:'failed',error:(e as Error).message})}
  }
  setUploading(false);load();
  if(ok)toast.success(ok===1?'رُفع الملف':'رُفعت '+ok+' ملفات');
  setPending(p=>p.filter(x=>x.state!=='done'));
 }
 async function saveEdit(){
  if(!editing||busy)return;setBusy(true);
  try{const f=await caseFileRequest<CaseFile>('update',{id:editing.id,revision:editing.revision,title:editing.title,category:editing.category,docDate:editing.docDate||''});
   setFiles(l=>(l||[]).map(x=>x.id===f.id?f:x));setEditing(null);toast.success('حُفظت بيانات المستند')}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false)}
 }
 async function remove(){
  if(!removing||busy)return;setBusy(true);
  try{await fileRequest('case_delete',{id:removing.id});setFiles(l=>(l||[]).filter(x=>x.id!==removing.id));if(selected===removing.id)setSelected('');toast.success('حُذف المستند')}
  catch(e){toast.error((e as Error).message)}finally{setBusy(false);setRemoving(null)}
 }
 async function download(f:CaseFile){
  try{const r=await fileRequest('case_download',{id:f.id,download:true});if(r.url)window.location.assign(r.url)}catch(e){toast.error((e as Error).message)}
 }

 if(off)return <p className="notice">المستندات غير مفعّلة بعد على قاعدة البيانات. سيتاح رفع الملفات بعد تحديثها.</p>;
 if(error&&!files)return <p className="notice">{error} <button type="button" className="text-link" onClick={load}>إعادة المحاولة</button></p>;
 if(!files)return <p className="muted"><LoaderCircle className="spin" size={15}/> جارٍ تحميل المستندات…</p>;
 const waiting=pending.filter(x=>x.state!=='done');
 return <div className="case-files">
  {canEdit&&<div className={'case-files-drop'+(dragging?' over':'')} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
   onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)add(e.dataTransfer.files)}}>
   <Upload size={20}/><div><b>أضف مستندات للقضية</b><small>اختر عدة ملفات مرة واحدة أو اسحبها إلى هنا · PDF والصور وWord وExcel · حتى 25 م.ب للملف</small></div>
   <button type="button" className="btn primary" onClick={()=>picker.current?.click()}>اختيار ملفات</button>
   <input ref={picker} type="file" multiple accept={CASE_FILE_ACCEPT} hidden aria-label="اختيار ملفات للقضية" onChange={e=>{if(e.target.files)add(e.target.files);e.target.value=''}}/>
  </div>}
  {waiting.length>0&&<section className="case-files-queue" aria-label="ملفات بانتظار الرفع">
   <header><b>{waiting.length} {waiting.length===1?'ملف':'ملفات'} بانتظار الرفع</b>
    <span className="case-files-all"><FilterSelect label="تصنيف الكل" value="" empty="اختر لتطبيقه على الكل" options={CATEGORY_OPTIONS} onChange={v=>{if(v)setPending(p=>p.map(x=>x.state==='done'?x:{...x,category:v}))}}/>
     <DateField label="تاريخ الكل" value="" onChange={v=>{if(v)setPending(p=>p.map(x=>x.state==='done'?x:{...x,docDate:v}))}}/></span></header>
   <ul>{waiting.map((x,i)=>{const Icon=iconFor(x.mime);return <li key={x.key} className={'queue-item '+x.state}>
    <span className="queue-name"><Icon size={16}/><span dir="auto">{x.file.name}</span><small>{formatSize(x.file.size)}</small></span>
    <Field label={'عنوان المستند '+(i+1)} value={x.title} onChange={v=>setItem(x.key,{title:v})}/>
    <FilterSelect label={'تصنيف المستند '+(i+1)} value={x.category} options={CATEGORY_OPTIONS} onChange={v=>setItem(x.key,{category:v})}/>
    <DateField label={'تاريخ المستند '+(i+1)} value={x.docDate} onChange={v=>setItem(x.key,{docDate:v})}/>
    <span className="queue-state">{x.state==='uploading'?<><LoaderCircle className="spin" size={15}/> جارٍ الرفع</>:x.state==='failed'?<span className="error-text">{x.error}</span>:null}
     {x.state!=='uploading'&&<button type="button" className="text-link danger" aria-label={'إزالة '+x.file.name} disabled={uploading} onClick={()=>setPending(p=>p.filter(y=>y.key!==x.key))}>إزالة</button>}</span>
   </li>})}</ul>
   <footer><button type="button" className="btn primary" disabled={uploading} onClick={()=>void uploadAll()}>{uploading?<><LoaderCircle className="spin" size={15}/> جارٍ الرفع…</>:<><Upload size={15}/> رفع {waiting.length===1?'الملف':waiting.length+' ملفات'}</>}</button>
    <button type="button" className="btn" disabled={uploading} onClick={()=>setPending([])}>إلغاء</button></footer>
  </section>}
  <div className="case-files-body">
   <section className="case-files-list">
    <div className="case-files-tools"><label className="case-files-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث في عناوين المستندات" aria-label="بحث في المستندات"/></label></div>
    <div className="case-files-cats" role="tablist" aria-label="تصنيفات المستندات">
     <button type="button" role="tab" aria-selected={!category} className={'chip'+(category?'':' active')} onClick={()=>setCategory('')}>الكل <b>{files.length}</b></button>
     {CASE_FILE_CATEGORIES.filter(c=>counts.get(c)).map(c=><button key={c} type="button" role="tab" aria-selected={category===c} className={'chip'+(category===c?' active':'')} onClick={()=>setCategory(c)}>{c} <b>{counts.get(c)}</b></button>)}
    </div>
    {!files.length?<p className="muted case-files-empty"><FolderOpen size={18}/> لا توجد مستندات مرفوعة لهذه القضية بعد.</p>
    :!shown.length?<p className="muted case-files-empty">لا توجد مستندات مطابقة.</p>
    :<div className="table-wrap"><table className="office-table case-files-table"><thead><tr><th>التاريخ</th><th>المستند</th><th>التصنيف</th><th><span className="sr-only">إجراءات</span></th></tr></thead>
     <tbody>{shown.map(f=>{const Icon=iconFor(f.mime);return <tr key={f.id} className={f.id===selected?'selected':''} onClick={()=>setSelected(f.id)}>
      <td className="mono">{f.docDate?formatDate(f.docDate):'—'}</td>
      <td><button type="button" className="case-file-open" onClick={e=>{e.stopPropagation();setSelected(f.id)}} aria-label={'عرض '+f.title}><Icon size={15}/><span>{f.title}</span></button><small><span dir="auto">{f.name}</span> · {formatSize(f.size)}{f.uploadedBy?' · رفعه '+f.uploadedBy:''}</small></td>
      <td><span className="tag">{f.category}</span></td>
      <td className="row-actions" onClick={e=>e.stopPropagation()}>
       <button type="button" className="icon-btn" title="تنزيل" aria-label={'تنزيل '+f.title} onClick={()=>void download(f)}><Download size={15}/></button>
       {canEdit&&<><button type="button" className="icon-btn" title="تعديل البيانات" aria-label={'تعديل '+f.title} onClick={()=>setEditing({...f})}><Pencil size={15}/></button>
        <button type="button" className="icon-btn danger" title="حذف" aria-label={'حذف '+f.title} onClick={()=>setRemoving(f)}><Trash2 size={15}/></button></>}
      </td></tr>})}</tbody></table></div>}
   </section>
   <Preview file={current} onDownload={download} onClose={()=>setSelected('')}/>
  </div>
  {editing&&<AlertDialog open onOpenChange={o=>{if(!o&&!busy)setEditing(null)}}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>بيانات المستند</AlertDialogTitle><AlertDialogDescription dir="auto">{editing.name}</AlertDialogDescription></AlertDialogHeader>
   <div className="form-grid single"><Field label="عنوان المستند" value={editing.title} onChange={v=>setEditing({...editing,title:v})}/>
    <FilterSelect label="تصنيف المستند" value={editing.category} options={CATEGORY_OPTIONS} onChange={v=>setEditing({...editing,category:v})}/>
    <DateField label="تاريخ المستند" value={editing.docDate||''} onChange={v=>setEditing({...editing,docDate:v})}/></div>
   <AlertDialogFooter><AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={busy||!editing.title.trim()} onClick={e=>{e.preventDefault();void saveEdit()}}>حفظ</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
  <AlertDialog open={!!removing} onOpenChange={o=>{if(!o&&!busy)setRemoving(null)}}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>حذف «{removing?.title}»؟</AlertDialogTitle>
   <AlertDialogDescription>يُحذف الملف من القضية نهائياً ولا يمكن استرجاعه.</AlertDialogDescription></AlertDialogHeader>
   <AlertDialogFooter><AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e=>{e.preventDefault();void remove()}}>حذف المستند</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}

/** The chosen document beside the list: PDFs and pictures open in place, other files offer a download. */
function Preview({file,onDownload,onClose}:{file:CaseFile|null;onDownload:(f:CaseFile)=>void;onClose:()=>void}){
 const [link,setLink]=useState<{id:string;url:string}|null>(null),[failed,setFailed]=useState<{id:string;message:string}|null>(null);
 useEffect(()=>{if(!file||!isPreviewable(file.mime))return;let live=true;
  fileRequest('case_download',{id:file.id}).then(r=>{if(live&&r.url)setLink({id:file.id,url:r.url})}).catch(e=>{if(live)setFailed({id:file.id,message:(e as Error).message})});
  return()=>{live=false}},[file]);
 if(!file)return <aside className="case-files-preview empty"><FolderOpen size={28}/><p>اختر مستنداً من القائمة لعرضه هنا.</p></aside>;
 const url=link?.id===file.id?link.url:'',error=failed?.id===file.id?failed.message:'';
 return <aside className="case-files-preview" aria-label={'عرض '+file.title}>
  <header><div><b>{file.title}</b><small>{file.category}{file.docDate?' · '+formatDate(file.docDate):''}</small></div>
   <span>{url&&<a className="icon-btn" href={url} target="_blank" rel="noopener noreferrer" title="فتح في نافذة جديدة" aria-label="فتح في نافذة جديدة"><ExternalLink size={15}/></a>}
    <button type="button" className="icon-btn" title="تنزيل" aria-label="تنزيل المستند" onClick={()=>onDownload(file)}><Download size={15}/></button>
    <button type="button" className="icon-btn" title="إغلاق العرض" aria-label="إغلاق العرض" onClick={onClose}><X size={15}/></button></span></header>
  <div className="case-files-frame">{!isPreviewable(file.mime)?<div className="case-files-noview"><FileText size={30}/><p>لا يمكن عرض هذا النوع داخل البرنامج.</p><button type="button" className="btn" onClick={()=>onDownload(file)}><Download size={15}/> تنزيل الملف</button></div>
   :error?<p className="notice">{error}</p>:!url?<p className="muted"><LoaderCircle className="spin" size={15}/> جارٍ فتح المستند…</p>
   :file.mime.startsWith('image/')?<img src={url} alt={file.title}/>:<iframe src={url} title={file.title}/>}</div>
 </aside>;
}
