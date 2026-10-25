import {useMemo,useState} from 'react';
import {ClipboardCheck,MapPin,Plus,Printer,ScanLine,Search,X,PackagePlus,Pencil} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {newDepartmentRecord,type CaseSummary,type DepartmentRecord} from '@/lib/departments';
import {CUSTODY_STATES,locationLabel,type ArchiveFile,type ArchiveLocation,type ArchiveMovement,type Custody,type LocationData} from '@/lib/archive';
import {normalizeSearch} from '@/lib/case-browse';
import {formatDate,todayISO} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {Field,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import {EditorDialog} from './shared';
import Needs from '../needs';

const save=<T,>(record:DepartmentRecord<T>)=>departmentRequest<DepartmentRecord<T>>('save_record',{workspace:'archive',record});
const byCode=(a:ArchiveLocation,b:ArchiveLocation)=>a.payload.code.localeCompare(b.payload.code,'en',{numeric:true});
const slotName=(l:ArchiveLocation)=>[l.payload.shelf&&(/^\d/.test(l.payload.shelf)?'رف '+l.payload.shelf:l.payload.shelf),l.payload.box&&'صندوق '+l.payload.box].filter(Boolean).join(' · ')||l.payload.code;
type Room={name:string;cabinets:{name:string;slots:ArchiveLocation[]}[]};

/**
 * «خريطة الحفظ»: the archive room as it stands. Each room shows its cabinets, each cabinet its drawers or shelves
 * with how full they are. Searching a file lights up the drawer it sits in; picking a drawer lists its files and lets
 * you place files there by scanning them, one after another.
 */
export default function ArchiveMap({locations,files,custody,cases,canEdit,canPrint,caseRef,onEdit,onAdd,onStocktake,onChanged}:{locations:ArchiveLocation[];files:ArchiveFile[];custody:Map<string,Custody>;cases:CaseSummary[];canEdit:boolean;canPrint:boolean;caseRef:(f:ArchiveFile)=>string;onEdit:(l:ArchiveLocation)=>void;onAdd?:()=>void;onStocktake:(l:ArchiveLocation)=>void;onChanged:()=>void}){
 const [closed,setClosed]=useState(false),[q,setQ]=useState(''),[found,setFound]=useState<ArchiveFile|null>(null),[picked,setPicked]=useState<string>(''),[cabinet,setCabinet]=useState(false);
 const cu=(f:ArchiveFile)=>custody.get(f.id)!;
 const rooms=useMemo<Room[]>(()=>{const m=new Map<string,Map<string,ArchiveLocation[]>>();
  for(const l of locations.filter(l=>closed||!l.archived).sort(byCode)){const r=l.payload.name||'بلا غرفة',c=l.payload.cabinet||'';if(!m.has(r))m.set(r,new Map());const cm=m.get(r)!;if(!cm.has(c))cm.set(c,[]);cm.get(c)!.push(l)}
  return [...m].map(([name,cm])=>({name,cabinets:[...cm].map(([c,slots])=>({name:c,slots}))}))},[locations,closed]);
 const inside=(l:ArchiveLocation)=>files.filter(f=>cu(f).locationId===l.id&&cu(f).state==='in');
 const unplaced=files.filter(f=>!cu(f).locationId);
 const term=normalizeSearch(q.trim()),caseCode=(id:string)=>cases.find(c=>c.id===id)?.code||'';
 const hits=term.length<1?[]:files.filter(f=>normalizeSearch([f.payload.number,f.payload.title,caseCode(f.caseId)].join(' ')).includes(term)).slice(0,8);
 const lit=found?cu(found).locationId:'',slot=locations.find(l=>l.id===picked)||null;
 const show=(f:ArchiveFile)=>{setFound(f);setQ('');const id=cu(f).locationId;if(id){setPicked(id);requestAnimationFrame(()=>document.getElementById('slot-'+id)?.scrollIntoView({block:'center',behavior:'smooth'}))}};
 const sheet=(l:ArchiveLocation)=>printHtml(listHtml('كشف جرد '+l.payload.code,locationLabel(l),['✓','رقم الأرشيف','الملف','القضية','النوع','الحالة'],files.filter(f=>cu(f).locationId===l.id).sort((a,b)=>a.payload.number.localeCompare(b.payload.number,'en',{numeric:true})).map(f=>{const c=cu(f);return ['☐',f.payload.number,f.payload.title,caseRef(f),f.payload.type,c.state==='in'?'في المكان':CUSTODY_STATES[c.state]+': '+c.holder]}),formatDate(todayISO()),''));
 return <section className="panel archive-map"><div className="panel-head"><div><h2>خريطة الحفظ</h2><p className="panel-note">أين يُحفظ كل ملف: الغرفة ثم الخزانة ثم الدرج أو الرف. ابحث عن ملف ليضيء مكانه، أو اختر درجاً لترى ما فيه وتضع فيه الملفات.</p></div>
  <div className="actions archive-head-actions"><label className="checkbox-line"><input type="checkbox" checked={closed} onChange={e=>setClosed(e.target.checked)}/> إظهار الأماكن المغلقة</label>
   {canEdit&&<button className="btn primary" onClick={()=>setCabinet(true)}><PackagePlus size={17}/> خزانة جديدة بأدراجها</button>}{onAdd&&<button className="btn" onClick={onAdd}><Plus size={17}/> مكان حفظ جديد</button>}</div></div>
  <div className="map-find"><label className="paper-search"><Search size={16} aria-hidden/><input aria-label="ابحث عن مكان ملف" value={q} onChange={e=>setQ(e.target.value)} placeholder="أين الملف؟ رقم الأرشيف أو كود القضية أو اسم الموكل"/></label>
   {term&&<ul className="map-hits" role="listbox" aria-label="الملفات">{hits.length?hits.map(f=>{const c=cu(f),l=locations.find(x=>x.id===c.locationId);return <li key={f.id}><button type="button" onClick={()=>show(f)}><b dir="ltr">{f.payload.number}</b><span>{f.payload.title}</span><small>{c.state!=='in'?CUSTODY_STATES[c.state]+(c.holder?': '+c.holder:''):l?locationLabel(l):'بلا مكان محدد'}</small></button></li>}):<li className="muted">لا يوجد ملف بهذا البحث</li>}</ul>}
   {found&&<p className="map-found" role="status"><MapPin size={15} aria-hidden/> <b dir="ltr">{found.payload.number}</b> {(()=>{const c=cu(found),l=locations.find(x=>x.id===c.locationId);return c.state!=='in'?`${CUSTODY_STATES[c.state]}${c.holder?': '+c.holder:''}${l?' · مكانه عند العودة: '+locationLabel(l):''}`:l?[l.payload.name,l.payload.cabinet&&'خزانة '+l.payload.cabinet,slotName(l)].filter(Boolean).join(' ← '):'لم يُحدَّد مكانه بعد'})()}
    <button type="button" className="icon-btn" aria-label="إخفاء" onClick={()=>setFound(null)}><X size={14}/></button></p>}</div>
  {unplaced.length>0&&<p className="notice">{unplaced.length} ملف بلا مكان حفظ. {locations.length?'اختر درجاً من الخريطة ثم امسح ملفاته واحداً بعد الآخر.':'أضف خزانة بأدراجها أولاً، ثم وزّع الملفات عليها.'}</p>}
  {!rooms.length?<Empty title="لا توجد أماكن حفظ" text="أضف خزانة بأدراجها؛ يظهر هنا رسم الغرفة وما في كل درج."/>
  :<div className="map-body"><div className="map-rooms">{rooms.map(r=><section key={r.name} className="map-room" aria-label={r.name}><h3><MapPin size={15} aria-hidden/> {r.name}</h3><div className="map-cabinets">
    {r.cabinets.map(c=><div key={c.name} className="map-cabinet"><b className="map-cabinet-name">{c.name?'خزانة '+c.name:'بلا خزانة'}</b><div className="map-slots">{c.slots.map(l=>{const n=inside(l).length,cap=Number(l.payload.capacity)||0,pct=cap?Math.min(100,Math.round(n/cap*100)):0;
     return <button type="button" key={l.id} id={'slot-'+l.id} className={'map-slot'+(picked===l.id?' on':'')+(lit===l.id?' lit':'')+(cap&&n>=cap?' full':pct>=75?' busy':'')+(l.archived?' closed':'')} aria-pressed={picked===l.id} aria-label={`${l.payload.code} · ${slotName(l)}: ${n} ملف`} onClick={()=>setPicked(p=>p===l.id?'':l.id)}>
      <span className="map-slot-name">{slotName(l)}</span><span className="map-slot-count">{n}{cap?<small>/{cap}</small>:null}</span>{cap>0&&<i style={{width:pct+'%'}} aria-hidden/>}<small className="map-slot-code" dir="ltr">{l.payload.code}</small></button>})}</div></div>)}</div></section>)}</div>
   {slot&&<SlotPanel key={slot.id} slot={slot} files={files} custody={custody} cases={cases} canEdit={canEdit} canPrint={canPrint} caseRef={caseRef} onClose={()=>setPicked('')} onEdit={()=>onEdit(slot)} onStocktake={()=>onStocktake(slot)} onPrint={()=>sheet(slot)} onChanged={onChanged}/>}</div>}
  {cabinet&&<CabinetMaker rooms={[...new Set(locations.map(l=>l.payload.name).filter(Boolean))]} taken={new Set(locations.map(l=>l.payload.code.toUpperCase()))} onClose={()=>setCabinet(false)} onDone={()=>{setCabinet(false);onChanged()}}/>}
 </section>;
}

/** One drawer: its files, and placing files in it by scanning or typing their number or case code. */
function SlotPanel({slot,files,custody,cases,canEdit,canPrint,caseRef,onClose,onEdit,onStocktake,onPrint,onChanged}:{slot:ArchiveLocation;files:ArchiveFile[];custody:Map<string,Custody>;cases:CaseSummary[];canEdit:boolean;canPrint:boolean;caseRef:(f:ArchiveFile)=>string;onClose:()=>void;onEdit:()=>void;onStocktake:()=>void;onPrint:()=>void;onChanged:()=>void}){
 const [scan,setScan]=useState(''),[busy,setBusy]=useState(false),[placed,setPlaced]=useState<string[]>([]);
 const cu=(f:ArchiveFile)=>custody.get(f.id)!;
 const here=files.filter(f=>cu(f).locationId===slot.id||placed.includes(f.id)).sort((a,b)=>a.payload.number.localeCompare(b.payload.number,'en',{numeric:true}));
 async function place(){const v=scan.trim().toUpperCase();if(!v)return;
  let list=files.filter(f=>f.payload.number.toUpperCase()===v||f.payload.number.toUpperCase()==='ARC-'+v);
  if(!list.length){const ids=new Set(cases.filter(c=>c.code&&c.code.toUpperCase()===v).map(c=>c.id));list=files.filter(f=>ids.has(f.caseId))}
  if(!list.length){toast.error('لا يوجد ملف بهذا الرقم أو الكود: '+scan.trim());return}
  setBusy(true);let n=0;
  for(const f of list){const c=cu(f);
   if(c.locationId===slot.id||placed.includes(f.id)){toast.message(f.payload.number+' في هذا المكان بالفعل');continue}
   if(c.state!=='in'){toast.error(`${f.payload.number} خارج الأرشيف الآن (${CUSTODY_STATES[c.state]}${c.holder?': '+c.holder:''})؛ يوضع في مكانه عند عودته.`);continue}
   try{await save<ArchiveMovement['payload']>({...newDepartmentRecord('archive','movement',{type:'move',date:todayISO(),holder:'',holderId:'',purpose:'',dueDate:'',locationId:slot.id,notes:'وُضع في '+slot.payload.code}),caseId:f.caseId,subjectId:f.id} as unknown as DepartmentRecord<ArchiveMovement['payload']>);setPlaced(p=>[...p,f.id]);n++}
   catch(e){toast.error(f.payload.number+': '+(e as Error).message)}}
  setBusy(false);if(n){toast.success(n===1?`وُضع ${list[0].payload.number} في ${slot.payload.code}`:`وُضع ${n} ملف في ${slot.payload.code}`);setScan('');onChanged()}}
 return <aside className="map-panel" aria-label={'محتوى '+slot.payload.code}><div className="map-panel-head"><div><b>{slotName(slot)}</b><small>{locationLabel(slot)}</small></div><button type="button" className="icon-btn" aria-label="إغلاق" onClick={onClose}><X size={16}/></button></div>
  {canEdit&&!slot.archived&&<div className="archive-scan compact"><ScanLine size={18} aria-hidden/><label className="field"><span>ضع ملفاً في هذا المكان</span><input dir="ltr" value={scan} disabled={busy} onChange={e=>setScan(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void place()}}} placeholder="ARC-00001"/></label><button type="button" className="btn" disabled={busy} onClick={()=>void place()}>وضع</button></div>}
  <div className="map-panel-actions">{canEdit&&!slot.archived&&<button type="button" className="btn" onClick={onStocktake}><ClipboardCheck size={15}/> جرد</button>}{canPrint&&<button type="button" className="btn" onClick={onPrint}><Printer size={15}/> كشف الجرد</button>}{canEdit&&<button type="button" className="btn" onClick={onEdit}><Pencil size={15}/> تعديل</button>}</div>
  <h4>{here.length} ملف</h4>
  {here.length?<ul className="map-files">{here.map(f=>{const c=cu(f);return <li key={f.id}><b dir="ltr">{f.payload.number}</b><span>{f.payload.title}<small>{caseRef(f)}</small></span>{c.state!=='in'&&<span className="tag amber">{CUSTODY_STATES[c.state]}</span>}{placed.includes(f.id)&&<span className="tag green">وُضع الآن</span>}</li>})}</ul>
  :<p className="muted">لا توجد ملفات في هذا المكان بعد.</p>}
 </aside>;
}

/** A whole cabinet in one step: its room, its name and how many drawers or shelves, each becoming a place with its own code. */
function CabinetMaker({rooms,taken,onClose,onDone}:{rooms:string[];taken:Set<string>;onClose:()=>void;onDone:()=>void}){
 const [room,setRoom]=useState(rooms[0]||'غرفة الأرشيف'),[name,setName]=useState(''),[prefix,setPrefix]=useState(''),[count,setCount]=useState('4'),[kind,setKind]=useState('درج'),[capacity,setCapacity]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const n=Math.min(40,Math.max(0,Number(count)||0)),code=(prefix||name).trim().toUpperCase().replace(/\s+/g,'-');
 const codes=Array.from({length:n},(_,i)=>`${code}-${i+1}`),clash=codes.filter(c=>taken.has(c));
 async function make(){setBusy(true);setError('');let made=0;
  try{for(let i=0;i<n;i++){const payload:LocationData={code:codes[i],name:room.trim(),cabinet:name.trim(),shelf:`${kind} ${i+1}`,box:'',capacity,notes:''};
    await save(newDepartmentRecord('archive','location',payload));made++}
   toast.success(`أُضيفت الخزانة ${name} بـ ${n} ${kind==='درج'?'أدراج':'رفوف'}`);onDone()}
  catch(e){setError(`أُضيف ${made} ثم توقف: ${(e as Error).message}`)}finally{setBusy(false)}}
 const ready=!!room.trim()&&!!name.trim()&&!!code&&n>0&&!clash.length&&/^[A-Za-z0-9.\-]+$/.test(code);
 return <EditorDialog title="خزانة جديدة بأدراجها" description="كل درج أو رف يصبح مكان حفظ برمز يُكتب عليه ويظهر على ملصقات ملفاته." busy={busy} onClose={onClose}>
  <fieldset disabled={busy}><div className="form-grid"><Field label="الغرفة" value={room} onChange={setRoom} suggestions={[...new Set([...rooms,'غرفة الأرشيف','المخزن','مكتب المحامي','الخزنة'])]}/><Field label="اسم الخزانة أو رقمها" value={name} onChange={setName} placeholder="مثل: 1 أو A"/>
   <Field label="بادئة الرموز" value={prefix} onChange={v=>setPrefix(v.toUpperCase())} placeholder={code||'A'}/><Field label="عدد الأدراج أو الرفوف" value={count} onChange={v=>setCount(v.replace(/\D/g,''))}/>
   <OfficeSelect label="النوع" value={kind} onChange={setKind} options={[['درج','أدراج'],['رف','رفوف'],['صندوق','صناديق']]}/><Field label="سعة كل واحد (عدد الملفات)" value={capacity} onChange={v=>setCapacity(v.replace(/\D/g,''))}/></div></fieldset>
  {n>0&&code&&<p className="subtitle">ستُضاف الرموز: <span dir="ltr">{codes.slice(0,6).join('، ')}{n>6?'…':''}</span></p>}
  {error&&<p className="notice" role="alert">{error}</p>}
  <Needs items={[!room.trim()&&'أدخل «الغرفة»',!name.trim()&&'أدخل «اسم الخزانة أو رقمها»',n<1&&'أدخل «عدد الأدراج أو الرفوف»',!!code&&!/^[A-Za-z0-9.\-]+$/.test(code)&&'«بادئة الرموز» أحرف لاتينية وأرقام فقط',clash.length>0&&`الرمز ${clash[0]} مستخدم؛ غيّر «بادئة الرموز»`]}/>
  <div className="actions"><button className="btn primary" disabled={busy||!ready} onClick={()=>void make()}>إضافة الخزانة ({n})</button><button className="btn" disabled={busy} onClick={onClose}>إلغاء</button></div>
 </EditorDialog>;
}
