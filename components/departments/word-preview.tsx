import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Download,FileText,LoaderCircle,Printer} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '../ui/dialog';
import {saveBlob} from '../shared';
import {collectWord,openWord,printWords,renderWord,safeFileName,wordBlob,type WordDoc} from '@/lib/word-preview';

export type WordItem={id:string;name:string;kind:'claim'|'bundle';blob:Blob};
const KIND_LABEL={claim:'صحيفة الدعوى',bundle:'حافظة مستندات'};
/** The word each paper's file name ends with, and the folder its batch downloads into (owner, 11 November 2026). */
export const PAPER={bundle:'حافظة',claim:'صحيفة دعوى'} as const;
export const paperName=(who:string,kind:'claim'|'bundle')=>`${who} - ${PAPER[kind]}`;

/** Each paper's file name (without «.docx»); a name used twice gets «(2)», «(3)»… so no download replaces another. */
export function fileNames(items:WordItem[],names:Record<string,string>){
 const seen=new Map<string,number>();
 return Object.fromEntries(items.map(it=>{const base=safeFileName(names[it.id]??it.name),key=base.toLowerCase(),n=(seen.get(key)||0)+1;seen.set(key,n);return [it.id,n>1?`${base} (${n})`:base]}));
}

/**
 * The papers as they will print, before anything is downloaded: each one is drawn as its Word page and its text can be
 * corrected right on the page. Each paper is named before it is downloaded (the opposite party's name unless changed);
 * what downloads is the clean Word file with the corrections in it.
 */
export default function WordPreview({items,onClose}:{items:WordItem[];onClose:()=>void}){
 const [current,setCurrent]=useState(items[0]?.id||''),[names,setNames]=useState<Record<string,string>>(()=>Object.fromEntries(items.map(i=>[i.id,i.name])));
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[edited,setEdited]=useState<Set<string>>(new Set());
 const docs=useRef(new Map<string,WordDoc>()),shown=useRef(''),area=useRef<HTMLDivElement>(null),body=useRef<HTMLDivElement>(null);
 const item=items.find(i=>i.id===current)||items[0],many=items.length>1;
 // The corrections on the page drawn now go into its Word file (before another paper is drawn, and before downloading).
 const keep=()=>{const d=docs.current.get(shown.current);if(d&&body.current)collectWord(d,body.current)};
 // Another paper: the corrections on this one are kept first.
 const pick=(id:string)=>{if(id===shown.current)return;keep();setLoading(true);setError('');setCurrent(id)};
 useEffect(()=>{
  if(!item)return;let live=true;
  (async()=>{
   let d=docs.current.get(item.id);
   if(!d){d=await openWord(item.blob);docs.current.set(item.id,d)}
   if(!live||!body.current)return;
   renderWord(d,body.current);shown.current=item.id;
  })().catch(e=>{if(live)setError((e as Error).message)}).finally(()=>{if(live)setLoading(false)});
  return()=>{live=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[item?.id]);
 // The page is scaled down to fit the window's width (never a sideways scroll).
 useLayoutEffect(()=>{
  const box=area.current,page=body.current;if(!box||!page)return;
  const fit=()=>{const w=parseFloat(page.querySelector<HTMLElement>('.wd-sheet')?.style.width||'')||794;page.style.zoom=String(Math.min(1,(box.clientWidth-8)/(w+32)))};
  const ro=new ResizeObserver(fit);ro.observe(box);fit();return()=>ro.disconnect();
 },[loading]);
 const final=fileNames(items,names);
 const blobOf=(it:WordItem)=>{const d=docs.current.get(it.id);return d?wordBlob(d):it.blob};
 async function download(list:WordItem[]){
  setBusy(true);
  try{
   keep();
   if(list.length===1){saveBlob(blobOf(list[0]),final[list[0].id]+'.docx');toast.success('نُزّل ملف Word.');return}
   // Several papers download as one folder (a .zip) named after the paper: «حافظة»; with both papers, a folder for each.
   const PizZip=(await import('pizzip')).default,zip=new PizZip(),both=new Set(list.map(it=>it.kind)).size>1;
   for(const it of list)zip.file((both?PAPER[it.kind]+'/':'')+final[it.id]+'.docx',new Uint8Array(await blobOf(it).arrayBuffer()),{binary:true});
   saveBlob(zip.generate({type:'blob',mimeType:'application/zip',compression:'STORE'}),(both?`${PAPER.bundle} و${PAPER.claim.split(' ')[0]}`:PAPER[list[0].kind])+'.zip');
   toast.success(`نُزّل ${list.length} ملفات Word في مجلد واحد.`);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 // Straight to the printer, as drawn here (with the corrections), one paper or all of them.
 async function print(list:WordItem[]){
  setBusy(true);
  try{
   keep();
   const ready:WordDoc[]=[];
   for(const it of list){let d=docs.current.get(it.id);if(!d){d=await openWord(it.blob);docs.current.set(it.id,d)}ready.push(d)}
   await printWords(ready);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose()}}><DialogContent dir="rtl" className="office-dialog word-preview-dialog" onOpenAutoFocus={e=>e.preventDefault()}>
  <DialogHeader><DialogTitle><FileText size={18} aria-hidden/> معاينة Word قبل التنزيل</DialogTitle>
   <DialogDescription>{many?`${items.length} مستندات. `:''}انقر على أي نص في الصفحة لتعديله، ثم اطبعه مباشرة أو نزّله نظيفاً كما تراه. الحقول الفارغة نقاط تُكتب باليد.</DialogDescription></DialogHeader>
  <div className={'word-preview'+(many?' many':'')}>
   {many&&<ol className="word-preview-list" aria-label="المستندات">{items.map(it=><li key={it.id} className={it.id===item?.id?'on':''}>
    <button type="button" onClick={()=>pick(it.id)} aria-current={it.id===item?.id}><b><bdi>{final[it.id]}</bdi></b><small>{KIND_LABEL[it.kind]}{edited.has(it.id)?' · معدّل':''}</small></button></li>)}</ol>}
   <div className="word-preview-main">
    <label className="field word-preview-name"><span>اسم ملف Word</span><span className="word-preview-name-row"><input aria-label="اسم ملف Word" value={names[item?.id]??''} maxLength={120} onChange={e=>{const v=e.target.value;setNames(n=>({...n,[item.id]:v}))}} placeholder="اسم الملف"/><em>.docx</em></span></label>
    <div className="word-preview-area" ref={area} onInput={()=>setEdited(s=>s.has(item.id)?s:new Set(s).add(item.id))}
     onKeyDown={e=>{if(e.key==='Enter')e.preventDefault()}}>
     {loading&&<p className="word-preview-wait" role="status"><LoaderCircle className="spin" size={16}/> جارٍ تجهيز المعاينة…</p>}
     {error&&<p className="notice" role="alert">{error}</p>}
     <div ref={body} className="word-preview-page" aria-label={'معاينة '+(final[item?.id]||'')}/>
    </div>
   </div>
  </div>
  <div className="actions word-preview-actions">
   <button className="btn" disabled={busy||loading} onClick={()=>void print(many?items:[item])}><Printer size={16}/> {many?`طباعة الكل (${items.length})`:'طباعة'}</button>
   {many&&<button className="btn" disabled={busy||loading} onClick={()=>void print([item])}>طباعة هذا فقط</button>}
   {many?<><button className="btn primary" disabled={busy||loading} onClick={()=>void download(items)}><Download size={16}/> تنزيل الكل ({items.length})</button><button className="btn" disabled={busy||loading} onClick={()=>void download([item])}>تنزيل هذا الملف فقط</button></>
    :<button className="btn primary" disabled={busy||loading} onClick={()=>void download(items)}><Download size={16}/> تنزيل Word</button>}
   <button className="btn" disabled={busy} onClick={onClose}>إغلاق</button></div>
 </DialogContent></Dialog>;
}
