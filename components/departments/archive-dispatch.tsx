import {useState} from 'react';
import {Plus,Printer,ScanLine,Send,Trash2,Inbox} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import type {CaseSummary} from '@/lib/departments';
import {CUSTODY_STATES,PAPER_FILES_EVENT,PURPOSES,type ArchiveFile,type ArchiveRequest,type Custody} from '@/lib/archive';
import {clientName} from '@/lib/clients';
import {formatDate,todayISO} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import Needs from '../needs';

type Person={id:string;username:string;displayName:string};
type Row={fileId:string;holderId:string;purpose:string};
type Sent={date:string;rows:string[][]};
const personName=(p:Person)=>p.displayName||p.username;

/**
 * «كشف التسليم»: the morning list of files going out. Scan or type each archive number or case code, pick who
 * receives it, and send: every recipient is notified, every file shows as with them, and each waits for its
 * recipient's «استلمت» before the papers change hands. The sheet prints for signatures, as on paper.
 */
export default function DispatchSheet({files,custody,cases,people,requests,canPrint,printedBy,onDone}:{files:ArchiveFile[];custody:Map<string,Custody>;cases:CaseSummary[];people:Person[];requests:ArchiveRequest[];canPrint:boolean;printedBy:string;onDone:()=>void}) {
 const today=todayISO();
 const [rows,setRows]=useState<Row[]>([]),[code,setCode]=useState(''),[holder,setHolder]=useState(''),[purpose,setPurpose]=useState('');
 const [date,setDate]=useState(today),[dueDate,setDueDate]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState<Sent|null>(null);
 const fileOf=(id:string)=>files.find(f=>f.id===id),caseOf=(id:string)=>cases.find(c=>c.id===id),nameOf=(id:string)=>{const p=people.find(x=>x.id===id);return p?personName(p):''};
 const open=requests.filter(r=>!r.archived&&(r.payload.status==='pending'||r.payload.status==='ready')&&r.payload.requesterId&&custody.get(r.subjectId)?.state==='in'&&!rows.some(x=>x.fileId===r.subjectId));
 function add(list:ArchiveFile[],extra:Partial<Row>={}){
  const fresh=list.filter(f=>!rows.some(r=>r.fileId===f.id));
  const away=fresh.filter(f=>custody.get(f.id)?.state!=='in');
  if(away.length){const c=custody.get(away[0].id)!;toast.error(`الملف ${away[0].payload.number} خارج الأرشيف الآن (${CUSTODY_STATES[c.state]}${c.holder?': '+c.holder:''}).`)}
  const ok=fresh.filter(f=>custody.get(f.id)?.state==='in');
  if(ok.length)setRows(r=>[...r,...ok.map(f=>({fileId:f.id,holderId:holder,purpose,...extra}))]);
  return ok.length;
 }
 // An archive number, a case code (every paper file of that case), or a bare number of either.
 function scan(){const v=code.trim();if(!v)return;const up=v.toUpperCase();
  let found=files.filter(f=>f.payload.number.toUpperCase()===up||f.payload.number.toUpperCase()==='ARC-'+up);
  if(!found.length){const ids=new Set(cases.filter(c=>c.code&&c.code.toUpperCase()===up).map(c=>c.id));found=files.filter(f=>ids.has(f.caseId))}
  if(!found.length){toast.error('لا يوجد ملف بهذا الرقم أو كود القضية: '+v);return}
  if(found.every(f=>rows.some(r=>r.fileId===f.id))){toast.message('الملف مضاف إلى الكشف بالفعل.');setCode('');return}
  if(add(found))setCode('');
 }
 const addRequests=()=>{let n=0;for(const r of open){const f=fileOf(r.subjectId);if(f&&!rows.some(x=>x.fileId===f.id)){setRows(x=>[...x,{fileId:f.id,holderId:r.payload.requesterId,purpose:r.payload.purpose}]);n++}}if(n)toast.success(`أُضيف ${n} ملف مطلوب`)};
 const update=(i:number,k:keyof Row,v:string)=>setRows(r=>r.map((x,j)=>j===i?{...x,[k]:v}:x));
 const missing=rows.filter(r=>!r.holderId).length;
 const line=(r:Row,i:number)=>{const f=fileOf(r.fileId)!,k=caseOf(f.caseId);return [String(i+1),k?.code||'',f.payload.number,k?clientName(k):f.payload.title,k?.opponent||'',nameOf(r.holderId),r.purpose,'']};
 const print=(s:Sent)=>{if(!printHtml(listHtml('كشف تسليم ملفات من الأرشيف',`${formatDate(s.date)} · ${s.rows.length} ملف`,['م','الكود','رقم الأرشيف','الموكل','الخصم','المستلم','الغرض','توقيع المستلم'],s.rows,formatDate(today),printedBy)))toast.error('تعذر فتح نافذة الطباعة.')};
 async function send(){setBusy(true);setError('');
  try{const lines=rows.map(line);
   await departmentRequest('dispatch',{workspace:'archive',date,notes,items:rows.map(r=>({fileId:r.fileId,holderId:r.holderId,purpose:r.purpose,dueDate}))});
   setSent({date,rows:lines});setRows([]);setNotes('');onDone();dispatchEvent(new Event(PAPER_FILES_EVENT));
   toast.success(`أُرسل ${lines.length} ملف وأُشعر المستلمون`,{description:'يظهر كل ملف «بانتظار تأكيد الاستلام» حتى يضغط صاحبه «استلمت».'})}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="panel dispatch-sheet"><div className="panel-head"><div><h2>كشف التسليم</h2><p className="panel-note">أضف الملفات بالباركود أو رقم الأرشيف أو كود القضية، واختر مستلم كل ملف، ثم أرسل. يصل كل مستلم إشعار، ولا تُسلَّم الأوراق إلا بعد أن يضغط «استلمت».</p></div>
  {open.length>0&&<button type="button" className="btn" onClick={addRequests}><Inbox size={15}/> إضافة الطلبات المفتوحة ({open.length})</button>}</div>
  {sent&&<div className="notice dispatch-done" role="status"><span>أُرسل كشف {formatDate(sent.date)}: {sent.rows.length} ملف.</span>{canPrint&&<button type="button" className="btn" onClick={()=>print(sent)}><Printer size={15}/> طباعة الكشف للتوقيع</button>}<button type="button" className="btn" onClick={()=>setSent(null)}>إخفاء</button></div>}
  <div className="dispatch-add"><div className="archive-scan"><ScanLine size={18} aria-hidden/><label className="field"><span>رقم الأرشيف أو كود القضية</span><input dir="ltr" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();scan()}}} placeholder="ARC-00001 أو 4532"/></label><button type="button" className="btn" onClick={scan}><Plus size={15}/> إضافة</button></div>
   <OfficeSelect label="المستلم للملفات المضافة" value={holder} onChange={setHolder} empty="اختر لكل ملف" options={people.map(p=>[p.id,personName(p)])}/>
   <Field label="الغرض للملفات المضافة" value={purpose} onChange={setPurpose} suggestions={PURPOSES}/></div>
  {!rows.length?<Empty title="الكشف فارغ" text="امسح باركود الملف أو اكتب رقمه أو كود القضية ثم اضغط Enter."/>:<div className="table-wrap"><table className="office-table dispatch-table"><thead><tr><th>م</th><th>رقم الأرشيف</th><th>الملف والقضية</th><th>المستلم</th><th>الغرض</th><th><span className="sr-only">حذف</span></th></tr></thead><tbody>
   {rows.map((r,i)=>{const f=fileOf(r.fileId)!,k=caseOf(f.caseId);return <tr key={r.fileId}><td>{i+1}</td><td className="nowrap"><b dir="ltr">{f.payload.number}</b></td><td><b>{k?`${k.code||k.autoNumber||''} · ${clientName(k)}`:f.payload.title}</b><small>{k?'ضد '+k.opponent:f.payload.type}</small></td>
    <td><OfficeSelect label={'مستلم '+f.payload.number} value={r.holderId} onChange={v=>update(i,'holderId',v)} empty="اختر المستلم" options={people.map(p=>[p.id,personName(p)])}/></td>
    <td><Field label={'غرض '+f.payload.number} value={r.purpose} onChange={v=>update(i,'purpose',v)} suggestions={PURPOSES}/></td>
    <td><button type="button" className="icon-btn" aria-label={'حذف '+f.payload.number+' من الكشف'} onClick={()=>setRows(x=>x.filter((_,j)=>j!==i))}><Trash2 size={15}/></button></td></tr>})}</tbody></table></div>}
  {rows.length>0&&<div className="dispatch-foot"><div className="form-grid"><DateField label="تاريخ التسليم" value={date} onChange={setDate}/><DateField label="موعد الإعادة" value={dueDate} onChange={setDueDate}/><Field label="ملاحظات الكشف" value={notes} onChange={setNotes} placeholder="مثل: ملفات جلسات الغد"/></div>
   <Needs items={[missing>0&&`اختر المستلم لـ ${missing} ملف`,!date&&'اختر «تاريخ التسليم»',!!dueDate&&dueDate<date&&'موعد الإعادة يسبق تاريخ التسليم']}/>
   {error&&<p role="alert" className="notice">{error}</p>}
   <div className="actions"><button type="button" className="btn primary" disabled={busy||missing>0||!date||(!!dueDate&&dueDate<date)} onClick={()=>void send()}><Send size={15}/> إرسال وإشعار المستلمين ({rows.length})</button>
    {canPrint&&<button type="button" className="btn" disabled={busy||missing>0} onClick={()=>print({date,rows:rows.map(line)})}><Printer size={15}/> معاينة الكشف</button>}<button type="button" className="btn" disabled={busy} onClick={()=>setRows([])}>تفريغ الكشف</button></div></div>}
 </section>;
}
