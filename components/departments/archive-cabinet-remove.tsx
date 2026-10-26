import {useState} from 'react';
import {Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {newDepartmentRecord,type DepartmentRecord} from '@/lib/departments';
import {CUSTODY_STATES,type ArchiveFile,type ArchiveLocation,type ArchiveMovement,type Custody,cabinetLabel} from '@/lib/archive';
import {todayISO} from '@/lib/domain';
import {OfficeSelect} from '../office-shared';
import {EditorDialog} from './shared';

type Cabinet={name:string;slots:ArchiveLocation[]};
const cabName=(c:Cabinet)=>c.name?cabinetLabel(c.name):'الأدراج بلا خزانة';
const slotName=(l:ArchiveLocation)=>l.payload.shelf||l.payload.box||l.payload.code;

/**
 * Removing a cabinet, as when an old one is replaced. Its files either move drawer by drawer into the cabinet chosen
 * (the first drawer into the first, and so on; any extra into the last), or are taken off their places to be put in
 * the new cabinet later by scanning. Either way each file's history records it, and then the drawers are closed. A closed place leaves the map but keeps the files' history readable.
 * A file of it that is out with someone holds the removal until it is back.
 */
export default function RemoveCabinet({room,cabinet,rooms,files,custody,onClose,onDone}:{room:string;cabinet:Cabinet;rooms:{name:string;cabinets:Cabinet[]}[];files:ArchiveFile[];custody:Map<string,Custody>;onClose:()=>void;onDone:()=>void}){
 const cu=(f:ArchiveFile)=>custody.get(f.id)!;
 const ids=new Set(cabinet.slots.map(l=>l.id)),held=files.filter(f=>ids.has(cu(f).locationId));
 const here=held.filter(f=>cu(f).state==='in'),away=held.filter(f=>cu(f).state!=='in');
 const targets=rooms.flatMap(r=>r.cabinets.filter(c=>!(r.name===room&&c.name===cabinet.name)&&c.slots.some(l=>!l.archived)).map(c=>({key:r.name+'\u0000'+c.name,label:`${cabName(c)} · ${r.name}`,c})));
 const [mode,setMode]=useState<'move'|'clear'>('move'),[to,setTo]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(0),[error,setError]=useState('');
 const target=targets.find(t=>t.key===to)?.c,open=target?.slots.filter(l=>!l.archived)||[];
 const mapTo=(l:ArchiveLocation)=>open[Math.min(cabinet.slots.indexOf(l),open.length-1)];
 async function run(){setBusy(true);setError('');
  try{for(const f of here){if(mode==='clear'){await departmentRequest('unplace_file',{workspace:'archive',fileId:f.id,note:'رُفع عند إزالة '+cabName(cabinet)});setDone(n=>n+1);continue}
    const l=mapTo(cabinet.slots.find(s=>s.id===cu(f).locationId)!);
    await departmentRequest('save_record',{workspace:'archive',record:{...newDepartmentRecord('archive','movement',{type:'move',date:todayISO(),holder:'',holderId:'',purpose:'',dueDate:'',locationId:l.id,notes:'نُقل من '+cabName(cabinet)+' عند إزالتها'}),caseId:f.caseId,subjectId:f.id} as unknown as DepartmentRecord<ArchiveMovement['payload']>});setDone(n=>n+1)}
   for(const l of cabinet.slots.filter(s=>!s.archived))await departmentRequest('archive_record',{workspace:'archive',id:l.id,revision:l.revision,archived:true});
   toast.success(`أُزيلت ${cabName(cabinet)}${!here.length?'':mode==='clear'?`؛ ${here.length} ملف بلا مكان حفظ الآن، ضعها في مكانها الجديد بمسحها`:` ونُقل ${here.length} ملف إلى ${cabName(target!)}`}`);onDone()}
  catch(e){setError((e as Error).message);onDone()}finally{setBusy(false)}}
 return <EditorDialog title={'إزالة '+cabName(cabinet)} description={`${room} · ${cabinet.slots.length} ${cabinet.slots.length>2&&cabinet.slots.length<11?'أدراج':'درج'} · ${held.length} ملف`} busy={busy} onClose={onClose}>
  {away.length>0?<div className="notice" role="alert"><p>لا يمكن إزالتها الآن: {away.length} من ملفاتها خارج الأرشيف. أعدها أولاً، ثم أزل الخزانة.</p>
    <ul className="cabinet-away">{away.map(f=>{const c=cu(f);return <li key={f.id}><b dir="ltr">{f.payload.number}</b> {c.state==='staff'?'مع':'لدى'} {c.holder||CUSTODY_STATES[c.state]}</li>})}</ul></div>
  :here.length>0?<>
    <fieldset className="cabinet-mode"><legend>ماذا يحدث لملفاتها ({here.length})؟</legend>
     <label className="checkbox-line"><input type="radio" name="cabinet-mode" checked={mode==='move'} onChange={()=>setMode('move')}/> تُنقل إلى خزانة أخرى درجاً بدرج</label>
     <label className="checkbox-line"><input type="radio" name="cabinet-mode" checked={mode==='clear'} onChange={()=>setMode('clear')}/> تُرفع من أماكنها وأضعها في الخزانة الجديدة لاحقاً بمسحها</label></fieldset>
    {mode==='move'&&<OfficeSelect label="انقل ملفاتها إلى" value={to} onChange={setTo} options={[['','اختر الخزانة الجديدة'],...targets.map(t=>[t.key,t.label] as [string,string])]}/>}
    {mode==='move'&&target&&<ul className="cabinet-plan">{cabinet.slots.map(l=>{const n=here.filter(f=>cu(f).locationId===l.id).length;return n?<li key={l.id}>{slotName(l)} ← {n} ملف → {slotName(mapTo(l))}</li>:null})}</ul>}
    {mode==='clear'&&<p className="subtitle">تظهر الملفات في «ملف بلا مكان حفظ» أعلى الخريطة حتى تضعها في أدراجها الجديدة.</p>}
    {mode==='move'&&!targets.length&&<p className="notice">أضف الخزانة الجديدة أولاً بـ«خزانة جديدة بأدراجها»، ثم أزل القديمة.</p>}
   </>:<p className="subtitle">الخزانة فارغة؛ تُغلق أدراجها وتبقى في السجل.</p>}
  {busy&&here.length>0&&<p className="subtitle">نُقل {done} من {here.length}…</p>}
  {error&&<p className="notice" role="alert">{error}</p>}
  <div className="actions"><button type="button" className="btn primary danger" disabled={busy||away.length>0||(here.length>0&&mode==='move'&&!target)} onClick={()=>void run()}><Trash2 size={15}/> {!here.length?'إزالة الخزانة':mode==='move'?'نقل الملفات وإزالة الخزانة':'رفع الملفات وإزالة الخزانة'}</button>
   <button type="button" className="btn" onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}
