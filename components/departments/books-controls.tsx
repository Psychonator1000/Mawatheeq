import {useEffect,useMemo,useState} from 'react';
import {Check,X,Undo2,Lock,LockOpen,Printer,Wallet,Save,Eye} from 'lucide-react';
import {toast} from 'sonner';
import {booksRequest} from '@/lib/local-auth';
import {APPROVAL_STATUSES,CHANGE_ACTIONS,CHANGE_FIELDS,CHANGE_RECORDS,MOVE_STATES,changedFields,money,toFils,type Approval,type ApprovalSettings,type ApprovalStatus,type BooksSetup,type Change,type ControlsSetup,type CreditRow,type Period,type ProposalItem} from '@/lib/books';
import {todayISO,formatDate} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect,officeTime} from '../office-shared';
import FilterSelect from '../filter-select';
import Needs from '../needs';
import {EditorDialog} from './shared';

export type CtlSetup=BooksSetup&ControlsSetup;
type Tab='approvals'|'run'|'credit'|'periods'|'changes'|'rules';
// A request sent for approval was announced already; it is not an error.
const fail=(e:unknown)=>{if(!(e as {handled?:boolean}).handled)toast.error((e as Error).message)};
const amount=(v:string)=>money(toFils(v||'0'));
const validAmount=(v:string)=>{if(v.trim()==='')return true;try{return toFils(v)>=0}catch{return false}};
const MONTHS=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/**
 * «الرقابة والاعتماد»: approval requests and who may post or approve how much, the payment run for what is due,
 * client credit limits, closing months one at a time, and the log of every change in the books.
 */
export default function Controls({setup,onOpen,onChanged,version}:{setup:CtlSetup;onOpen:(id:string)=>void;onChanged:()=>void;version:number}){
 const c=setup.controls,[tab,setTab]=useState<Tab>('approvals');
 const tabs:[Tab,string][]=[['approvals',c.pending?`طلبات الاعتماد (${c.pending})`:'طلبات الاعتماد'],['run','دفعة الموردين'],['credit','حدود الائتمان'],['periods','الفترات الشهرية'],['changes','سجل التغييرات'],...(setup.canConfigure?[['rules','صلاحيات الاعتماد']] as [Tab,string][]:[])];
 return <>
  <div className="books-due">{c.approvalsEnabled?<span className="tag">{c.myLimit===null?'تُرحّل دون حد':`حدّك للترحيل دون اعتماد: ${amount(c.myLimit)}`}</span>:<span className="tag">الاعتماد غير مفعّل: كل من يملك التعديل يرحّل مباشرة</span>}
   {c.myPending>0&&<span className="tag amber">{c.myPending} من طلباتك بانتظار الاعتماد</span>}{c.closedMonths.length>0&&<span className="tag">أشهر مقفلة: {c.closedMonths.length}</span>}</div>
  <div className="department-tabs view-switch" role="group" aria-label="الرقابة والاعتماد">{tabs.map(([k,l])=><button key={k} className={'btn '+(tab===k?'primary':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div>
  {tab==='approvals'&&<Approvals setup={setup} onOpen={onOpen} onChanged={onChanged} version={version}/>}
  {tab==='run'&&<PaymentRun setup={setup} onOpen={onOpen} onChanged={onChanged}/>}
  {tab==='credit'&&<Credit setup={setup} onChanged={onChanged} version={version}/>}
  {tab==='periods'&&<Periods setup={setup} onChanged={onChanged} version={version}/>}
  {tab==='changes'&&<Changes setup={setup} onOpen={onOpen}/>}
  {tab==='rules'&&setup.canConfigure&&<Rules onChanged={onChanged}/>}
 </>;
}

function Approvals({setup,onOpen,onChanged,version}:{setup:CtlSetup;onOpen:(id:string)=>void;onChanged:()=>void;version:number}){
 const [status,setStatus]=useState<ApprovalStatus|''>('pending'),[rows,setRows]=useState<Approval[]|null>(null),[busy,setBusy]=useState(false),[rejecting,setRejecting]=useState<Approval|null>(null),[note,setNote]=useState('');
 useEffect(()=>{let live=true;booksRequest<Approval[]>('list_approvals',{status}).then(r=>{if(live)setRows(r)}).catch(e=>{if(live){setRows([]);fail(e)}});return()=>{live=false}},[status,version]);
 const act=async(fn:()=>Promise<unknown>,done:string)=>{setBusy(true);try{const r=await fn() as {creditWarning?:string};toast.success(done);onChanged();if(r?.creditWarning)toast.warning(r.creditWarning)}catch(e){fail(e)}finally{setBusy(false)}};
 const canApprove=setup.controls.canApprove&&setup.canEdit;
 return <>
  <p className="muted">ما يتجاوز حد الموظف لا يُرحّل؛ ينتظر هنا حتى يعتمده مسؤول آخر فيُرحّل باسمه، أو يرفضه مع السبب فيبقى مسودة لتصحيحها. لا يعتمد أحد طلبه بنفسه.</p>
  <div className="work-chips" role="group" aria-label="حالة الطلبات">{([['pending','بانتظار الاعتماد'],['approved','المعتمدة'],['rejected','المرفوضة'],['','الكل']] as const).map(([k,l])=><button key={k} className={'work-chip'+(status===k?' on':'')} aria-pressed={status===k} onClick={()=>setStatus(k)}>{l}</button>)}</div>
  {rows===null?<p role="status">جارٍ التحميل…</p>:!rows.length?<Empty title={status==='pending'?'لا طلبات بانتظار الاعتماد':'لا توجد طلبات'} text="تظهر هنا الطلبات التي تتجاوز حدود الموظفين."/>
  :<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الطلب</th><th>المبلغ</th><th>مقدّم الطلب</th><th>الحالة</th><th></th></tr></thead><tbody>{rows.map(r=>{const mine=!!r.mine;return <tr key={r.id}>
   <td><b>{r.label||'طلب'}</b>{r.partner&&<small>{r.partner}</small>}{r.note&&<small>{r.status==='rejected'?'سبب الرفض: ':'ملاحظة: '}{r.note}</small>}</td>
   <td className="mono" dir="ltr">{amount(r.amount)}</td>
   <td>{r.requester}<small>{officeTime(r.requestedAt)}</small></td>
   <td><span className={'tag '+(r.status==='pending'?'amber':r.status==='approved'?'green':r.status==='rejected'?'red':'')}>{APPROVAL_STATUSES[r.status]}</span>{r.decider&&<small>{r.decider}{r.decidedAt?' · '+officeTime(r.decidedAt):''}</small>}</td>
   <td><div className="actions">{r.moveId&&<button className="btn" onClick={()=>onOpen(r.moveId)}><Eye size={14}/> عرض</button>}
    {r.status==='pending'&&canApprove&&!mine&&<><button className="btn primary" disabled={busy} onClick={()=>void act(()=>booksRequest('approve',{id:r.id}),'اعتُمد الطلب ورُحّل')}><Check size={14}/> اعتماد</button>
     <button className="btn" disabled={busy} onClick={()=>{setNote('');setRejecting(r)}}><X size={14}/> رفض</button></>}
    {r.status==='pending'&&(mine||setup.canConfigure)&&<button className="btn" disabled={busy} title="يبقى المستند مسودة ويمكن تعديله" onClick={()=>void act(()=>booksRequest('cancel_approval',{id:r.id}),'سُحب الطلب')}><Undo2 size={14}/> سحب الطلب</button>}
    {r.status==='pending'&&mine&&!setup.canConfigure&&<small className="muted">يعتمده مسؤول آخر</small>}</div></td>
  </tr>})}</tbody></table></div>}
  {rejecting&&<EditorDialog title="رفض الطلب" description={`${rejecting.label} · ${amount(rejecting.amount)} — يبقى المستند مسودة، ويرى مقدّم الطلب السبب.`} busy={busy} onClose={()=>setRejecting(null)}>
   <Field label="سبب الرفض" value={note} onChange={setNote} multiline wide/>
   <Needs items={[note.trim().length<2&&'اكتب سبب الرفض']}/>
   <div className="actions"><button className="btn primary" disabled={busy||note.trim().length<2} onClick={()=>void act(()=>booksRequest('reject',{id:rejecting.id,note}),'رُفض الطلب').then(()=>setRejecting(null))}><X size={15}/> رفض الطلب</button><button className="btn" onClick={()=>setRejecting(null)}>إلغاء</button></div>
  </EditorDialog>}
 </>;
}

function PaymentRun({setup,onOpen,onChanged}:{setup:CtlSetup;onOpen:(id:string)=>void;onChanged:()=>void}){
 const bankJournals=setup.journals.filter(j=>(j.type==='bank'||j.type==='cash')&&j.active);
 const [date,setDate]=useState(todayISO()),[journal,setJournal]=useState(bankJournals[0]?.id||''),[method,setMethod]=useState('transfer'),[items,setItems]=useState<ProposalItem[]|null>(null),[held,setHeld]=useState<Set<string>>(new Set()),[busy,setBusy]=useState(false);
 const [done,setDone]=useState<{name:string;payments:{id:string;name:string;partnerId:string;amount:string}[]}|null>(null);
 useEffect(()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;let live=true;booksRequest<ProposalItem[]>('payment_proposal',{date}).then(r=>{if(live){setItems(r);setHeld(new Set(r.filter(x=>x.pending).map(x=>x.id)))}}).catch(e=>{if(live){setItems([]);fail(e)}});return()=>{live=false}},[date,done]);
 const chosen=(items||[]).filter(x=>!held.has(x.id)&&!x.pending),total=chosen.reduce((n,x)=>n+toFils(x.residual),0),partners=new Set(chosen.map(x=>x.partnerId)).size;
 const toggle=(id:string)=>setHeld(h=>{const n=new Set(h);if(n.has(id))n.delete(id);else n.add(id);return n});
 async function run(){setBusy(true);try{const r=await booksRequest<{name:string;payments:{id:string;name:string;partnerId:string;amount:string}[]}>('payment_run',{moveIds:chosen.map(x=>x.id),journalId:journal,date,method});setDone(r);toast.success(`أُنشئت ${r.payments.length} دفعة في ${r.name}`);onChanged()}catch(e){fail(e)}finally{setBusy(false)}}
 const partnerName=(id:string)=>setup.partners.find(p=>p.id===id)?.name||'—';
 function print(){if(!done)return;if(!printHtml(listHtml('قائمة دفعة الموردين '+done.name,'بتاريخ '+formatDate(date)+' · من '+(bankJournals.find(j=>j.id===journal)?.name||''),['الدفعة','المستفيد','المبلغ'],
  done.payments.map(p=>[p.name,partnerName(p.partnerId),amount(p.amount)]),formatDate(todayISO()),'',[['الإجمالي',money(done.payments.reduce((n,p)=>n+toFils(p.amount),0))]])))toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.')}
 const needs=[!journal&&'اختر دفتر البنك أو الصندوق',!chosen.length&&'لا شيء مختار للدفع',!setup.canEdit&&'صلاحيتك للقراءة فقط'];
 return <>
  <p className="muted">تقترح الدفعة فواتير الموردين والإشعارات الدائنة للموكلين المستحقة حتى التاريخ. أزل علامة ما تريد تأجيله، ثم تُنشأ دفعة واحدة لكل مستفيد في دفعة مجمعة واحدة.</p>
  <div className="form-grid"><DateField label="المستحق حتى" value={date} onChange={setDate}/>
   <OfficeSelect label="الدفع من" value={journal} onChange={setJournal} options={bankJournals.map(j=>[j.id,j.name])} empty="اختر"/>
   <OfficeSelect label="طريقة الدفع" value={method} onChange={setMethod} options={[['transfer','تحويل بنكي'],['cheque','شيك'],['cash','نقداً']]}/></div>
  {done&&<div className="notice" role="status"><b>{done.name}</b>: {done.payments.length} دفعة بإجمالي {money(done.payments.reduce((n,p)=>n+toFils(p.amount),0))}.
   <div className="actions"><button className="btn" onClick={print}><Printer size={14}/> طباعة القائمة</button>{done.payments.map(p=><button key={p.id} className="btn" onClick={()=>onOpen(p.id)}>{p.name}</button>)}<button className="btn" onClick={()=>setDone(null)}>دفعة جديدة</button></div></div>}
  {items===null?<p role="status">جارٍ تجهيز المقترح…</p>:!items.length?<Empty title="لا شيء مستحق حتى هذا التاريخ" text="غيّر التاريخ لرؤية ما يستحق لاحقاً."/>
  :<div className="table-wrap"><table className="office-table books-table"><thead><tr><th><input type="checkbox" aria-label="تحديد الكل" checked={chosen.length===items.filter(x=>!x.pending).length} onChange={e=>setHeld(e.target.checked?new Set(items.filter(x=>x.pending).map(x=>x.id)):new Set(items.map(x=>x.id)))}/></th><th>المستند</th><th>المستفيد</th><th>الاستحقاق</th><th>المتبقي</th></tr></thead><tbody>
   {items.map(x=><tr key={x.id} className={held.has(x.id)||x.pending?'muted':''}><td><input type="checkbox" aria-label={'دفع '+x.name} disabled={x.pending} checked={!held.has(x.id)&&!x.pending} onChange={()=>toggle(x.id)}/></td>
    <td><button className="text-link" onClick={()=>onOpen(x.id)}>{x.name}</button><small>{x.moveType==='out_refund'?'إشعار دائن لموكل':'فاتورة مورد'}{x.ref?' · '+x.ref:''}{x.pending?' · بانتظار الاعتماد':''}</small></td>
    <td>{x.partner}</td><td>{formatDate(x.due)}{x.daysLate>0&&<small className="office-alert">متأخر {x.daysLate} يوم</small>}</td><td className="mono" dir="ltr">{amount(x.residual)}</td></tr>)}
  </tbody></table></div>}
  {items&&items.length>0&&<><Needs items={needs}/><div className="actions"><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>void run()}><Wallet size={15}/> دفع {chosen.length} مستند لـ {partners} مستفيد ({money(total)})</button></div></>}
 </>;
}

function Credit({setup,onChanged,version}:{setup:CtlSetup;onChanged:()=>void;version:number}){
 const [rows,setRows]=useState<CreditRow[]|null>(null),[edit,setEdit]=useState<{partnerId:string;limit:string;block:boolean}|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;booksRequest<CreditRow[]>('credit_report').then(r=>{if(live)setRows(r)}).catch(e=>{if(live){setRows([]);fail(e)}});return()=>{live=false}},[version]);
 const clients=setup.partners.filter(p=>p.kind==='customer'||p.kind==='both');
 async function save(){if(!edit)return;setBusy(true);try{await booksRequest('save_credit',edit);toast.success(edit.limit.trim()?'حُفظ حد الائتمان':'أُزيل حد الائتمان');setEdit(null);onChanged()}catch(e){fail(e)}finally{setBusy(false)}}
 return <>
  <div className="department-toolbar"><p className="muted">الحد هو أقصى ما يُسمح أن يستحق على الموكل. عند ترحيل فاتورة تتجاوزه يظهر تنبيه، أو تُمنع إن كان الموكل «موقوفاً عند التجاوز» (ويبقى لمسؤول المكتب ترحيلها).</p>
   {setup.canEdit&&<button className="btn primary" onClick={()=>setEdit({partnerId:'',limit:'',block:false})}>إضافة حد ائتمان</button>}</div>
  {rows===null?<p role="status">جارٍ التحميل…</p>:!rows.length?<Empty title="لا حدود ائتمان بعد" text="أضف حداً لموكل لمتابعة ما يستحق عليه."/>
  :<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الموكل</th><th>الحد</th><th>المستحق</th><th>المتاح</th><th>المتأخر</th><th>الاستخدام</th><th></th></tr></thead><tbody>{rows.map(r=>{const pct=toFils(r.limit)>0?Math.round(toFils(r.open)/toFils(r.limit)*100):0;return <tr key={r.partnerId}>
   <td><b>{r.name}</b>{r.block&&<small className="tag red">موقوف عند التجاوز</small>}</td><td className="mono" dir="ltr">{amount(r.limit)}</td><td className="mono" dir="ltr">{amount(r.open)}</td>
   <td className={'mono'+(toFils(r.available)<0?' office-alert':'')} dir="ltr">{amount(r.available)}</td><td className="mono" dir="ltr">{amount(r.overdue)}</td>
   <td><span className="legend-bar credit-bar" aria-hidden><s style={{width:Math.min(100,pct)+'%',background:pct>=100?'var(--destructive,#b42318)':pct>=80?'#c98a12':'var(--brand)'}}/></span><small>{pct}%</small></td>
   <td>{setup.canEdit&&<button className="btn" onClick={()=>setEdit({partnerId:r.partnerId,limit:r.limit.replace(/\.?0+$/,''),block:r.block})}>تعديل</button>}</td></tr>})}</tbody></table></div>}
  {edit&&<EditorDialog title="حد الائتمان" description="اترك الحد فارغاً لإزالته." busy={busy} onClose={()=>setEdit(null)}>
   <div className="form-grid"><FilterSelect label="الموكل" value={edit.partnerId} onChange={v=>setEdit({...edit,partnerId:v})} options={clients.map(p=>({value:p.id,label:p.name}))} placeholder="اختر الموكل"/>
    <Field label="الحد (د.ك)" value={edit.limit} onChange={v=>setEdit({...edit,limit:v})} placeholder="مثل 5000"/>
    <label className="checkbox-line"><input type="checkbox" checked={edit.block} onChange={e=>setEdit({...edit,block:e.target.checked})}/> منع الفواتير التي تتجاوز الحد</label></div>
   <Needs items={[!edit.partnerId&&'اختر الموكل',!validAmount(edit.limit)&&'الحد أرقام فقط حتى ثلاث خانات عشرية']}/>
   <div className="actions"><button className="btn primary" disabled={busy||!edit.partnerId||!validAmount(edit.limit)} onClick={()=>void save()}><Save size={15}/> حفظ</button><button className="btn" onClick={()=>setEdit(null)}>إلغاء</button></div>
  </EditorDialog>}
 </>;
}

function Periods({setup,onChanged,version}:{setup:CtlSetup;onChanged:()=>void;version:number}){
 const [year,setYear]=useState(Number(todayISO().slice(0,4))),[rows,setRows]=useState<Period[]|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;booksRequest<Period[]>('list_periods',{year}).then(r=>{if(live)setRows(r)}).catch(e=>{if(live){setRows([]);fail(e)}});return()=>{live=false}},[year,version]);
 const ro=!setup.canConfigure;
 async function act(month:string,close:boolean){setBusy(true);try{await booksRequest(close?'close_period':'reopen_period',{month});toast.success(close?'أُقفل الشهر':'أُعيد فتح الشهر');onChanged()}catch(e){fail(e)}finally{setBusy(false)}}
 return <>
  <div className="department-toolbar"><p className="muted">يُقفل كل شهر وحده: لا يُضاف إلى الشهر المقفل ولا يُرحّل فيه ولا يُعدّل أو يُحذف منه شيء، من أي شاشة. يُعاد فتحه عند الحاجة ما لم يكن ضمن سنة مالية مقفلة.</p>
   <OfficeSelect label="السنة" value={String(year)} onChange={v=>setYear(Number(v))} options={Array.from({length:6},(_,i)=>{const y=String(Number(todayISO().slice(0,4))-4+i);return [y,y] as [string,string]})}/></div>
  {rows===null?<p role="status">جارٍ التحميل…</p>:<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الشهر</th><th>المرحّل</th><th>المسودات</th><th>الحالة</th><th></th></tr></thead><tbody>{rows.map(p=>{const m=Number(p.month.slice(5,7));return <tr key={p.month}>
   <td><b>{MONTHS[m-1]} {p.month.slice(0,4)}</b></td><td className="mono">{p.posted}</td><td className="mono">{p.drafts}{p.pending>0&&<small className="office-alert">{p.pending} بانتظار الاعتماد</small>}</td>
   <td>{p.closed?<><span className="tag">مقفل</span><small>{p.closedBy}{p.closedAt?' · '+officeTime(p.closedAt):''}</small></>:<span className="tag green">مفتوح</span>}</td>
   <td>{!ro&&(p.closed?<button className="btn" disabled={busy} onClick={()=>void act(p.month,false)}><LockOpen size={14}/> إعادة فتح</button>
    :<button className="btn" disabled={busy||p.drafts>0} title={p.drafts>0?'رحّل المسودات أو ألغها أولاً':undefined} onClick={()=>void act(p.month,true)}><Lock size={14}/> إقفال</button>)}</td></tr>})}</tbody></table></div>}
  {ro&&<p className="muted">يُقفل الأشهر ويعيد فتحها مسؤول المكتب.</p>}
 </>;
}

function Changes({setup,onOpen}:{setup:CtlSetup;onOpen:(id:string)=>void}){
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[kind,setKind]=useState(''),[action,setAction]=useState(''),[actor,setActor]=useState(''),[rows,setRows]=useState<Change[]|null>(null);
 const [detail,setDetail]=useState<{change:Change;before:unknown;after:unknown}|null>(null);
 useEffect(()=>{let live=true;booksRequest<Change[]>('list_changes',{from,to,recordType:kind,action,actorId:actor}).then(r=>{if(live)setRows(r)}).catch(e=>{if(live){setRows([]);fail(e)}});return()=>{live=false}},[from,to,kind,action,actor]);
 const people=useMemo(()=>{const m=new Map<string,string>();for(const r of rows||[])m.set(r.byId,r.by);return [...m].map(([id,name])=>[id,name] as [string,string])},[rows]);
 async function show(ch:Change){try{const d=await booksRequest<{before:unknown;after:unknown}>('get_change',{id:ch.id});setDetail({change:ch,...d})}catch(e){fail(e)}}
 const partnerName=(id:string)=>setup.partners.find(p=>p.id===id)?.name;
 const journalName=(id:string)=>setup.journals.find(j=>j.id===id)?.name;
 const val=(v:unknown,k:string)=>{if(v==null||v==='')return '—';if(typeof v==='boolean'||v==='true'||v==='false')return v===true||v==='true'?'نعم':'لا';
  if(typeof v==='object')return Array.isArray(v)?`${v.length} سطر`:'…';const t=String(v);
  if(k==='state'&&t in MOVE_STATES)return MOVE_STATES[t as keyof typeof MOVE_STATES];if(k.toLowerCase().includes('partner')&&partnerName(t))return partnerName(t)!;
  if(k==='journalId'&&journalName(t))return journalName(t)!;if(/^\d{4}-\d{2}-\d{2}T/.test(t))return officeTime(t);if(/^\d{4}-\d{2}-\d{2}$/.test(t))return formatDate(t);return t};
 return <>
  <div className="form-grid"><DateField label="من" value={from} onChange={setFrom}/><DateField label="إلى" value={to} onChange={setTo}/>
   <OfficeSelect label="النوع" value={kind} onChange={setKind} options={Object.entries(CHANGE_RECORDS)} empty="الكل"/>
   <OfficeSelect label="العملية" value={action} onChange={setAction} options={Object.entries(CHANGE_ACTIONS)} empty="الكل"/>
   <OfficeSelect label="الموظف" value={actor} onChange={setActor} options={people} empty="الكل"/></div>
  {rows===null?<p role="status">جارٍ التحميل…</p>:!rows.length?<Empty title="لا تغييرات مطابقة"/>
  :<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الوقت</th><th>الموظف</th><th>العملية</th><th>السجل</th><th>المبلغ</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>
   <td>{officeTime(r.at)}</td><td>{r.by}</td><td>{CHANGE_ACTIONS[r.action]||r.action}<small>{CHANGE_RECORDS[r.recordType]||r.recordType}</small></td>
   <td>{r.recordType==='move'&&r.action!=='delete'?<button className="text-link" onClick={()=>onOpen(r.recordId)}>{r.label&&r.label!=='/'?r.label:'مسودة'}</button>:r.label||'—'}</td>
   <td className="mono" dir="ltr">{r.amount?amount(r.amount):''}</td><td>{r.hasDetail&&<button className="btn" onClick={()=>void show(r)}>قبل وبعد</button>}</td></tr>)}</tbody></table></div>}
  {detail&&<EditorDialog title={`${CHANGE_ACTIONS[detail.change.action]||detail.change.action} · ${detail.change.label||CHANGE_RECORDS[detail.change.recordType]||''}`} description={`${detail.change.by} · ${officeTime(detail.change.at)}`} busy={false} onClose={()=>setDetail(null)}>
   {(()=>{const keys=changedFields(detail.before,detail.after),b=(detail.before||{}) as Record<string,unknown>,a=(detail.after||{}) as Record<string,unknown>;
    return !keys.length?<p className="muted">لم يتغير شيء في الحقول المسجلة.</p>:<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead><tbody>
     {keys.map(k=><tr key={k}><td>{CHANGE_FIELDS[k]||k}</td><td>{val(b[k],k)}</td><td>{val(a[k],k)}</td></tr>)}</tbody></table></div>})()}
   <div className="actions"><button className="btn" onClick={()=>setDetail(null)}>إغلاق</button></div>
  </EditorDialog>}
 </>;
}

function Rules({onChanged}:{onChanged:()=>void}){
 const [s,setS]=useState<ApprovalSettings|null>(null),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{let live=true;booksRequest<ApprovalSettings>('approval_settings').then(r=>{if(live)setS(r)}).catch(e=>{if(live)fail(e)});return()=>{live=false}},[version]);
 if(!s)return <p role="status">جارٍ التحميل…</p>;
 const set=(i:number,patch:Partial<ApprovalSettings['people'][number]>)=>setS({...s,people:s.people.map((p,j)=>j===i?{...p,...patch}:p)});
 const bad=[!validAmount(s.defaultLimit)&&'الحد الافتراضي أرقام فقط',s.people.some(p=>!validAmount(p.postLimit)||!validAmount(p.approveLimit))&&'الحدود أرقام فقط حتى ثلاث خانات عشرية'];
 async function save(){if(!s)return;setBusy(true);try{await booksRequest('save_approval_settings',{revision:s.revision,enabled:s.enabled,defaultLimit:s.defaultLimit||'0',people:s.people});toast.success('حُفظت صلاحيات الاعتماد');setVersion(v=>v+1);onChanged()}catch(e){fail(e)}finally{setBusy(false)}}
 return <>
  <p className="muted">عند التفعيل يرحّل كل موظف حتى حدّه، وما فوقه يُرسل للاعتماد. مسؤول المكتب ومن يملك صلاحية الإعدادات يرحّلون دون حد ويعتمدون أي مبلغ. اترك حد الموظف فارغاً ليأخذ الحد الافتراضي، واترك حد الاعتماد فارغاً ليعتمد أي مبلغ.</p>
  <div className="form-grid"><label className="checkbox-line"><input type="checkbox" checked={s.enabled} onChange={e=>setS({...s,enabled:e.target.checked})}/> تفعيل الاعتماد</label>
   <Field label="الحد الافتراضي للترحيل دون اعتماد (د.ك)" value={s.defaultLimit.replace(/\.?0+$/,'')} onChange={v=>setS({...s,defaultLimit:v})} placeholder="0 = كل ترحيل يحتاج اعتماداً"/></div>
  {!s.people.length?<Empty title="لا موظفين بصفحات المحاسبة" text="امنح الموظفين صفحة المحاسبة من «فريق المكتب» أولاً."/>
  :<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الموظف</th><th>يرحّل دون اعتماد حتى</th><th>يعتمد طلبات غيره</th><th>حتى مبلغ</th></tr></thead><tbody>{s.people.map((p,i)=><tr key={p.userId}>
   <td><b>{p.name}</b></td><td><input className="books-limit" aria-label={'حد ترحيل '+p.name} dir="ltr" value={p.postLimit.replace(/\.?0+$/,'')} placeholder="الافتراضي" onChange={e=>set(i,{postLimit:e.target.value})}/></td>
   <td><input type="checkbox" aria-label={'يعتمد: '+p.name} checked={p.canApprove} onChange={e=>set(i,{canApprove:e.target.checked})}/></td>
   <td><input className="books-limit" aria-label={'حد اعتماد '+p.name} dir="ltr" value={p.approveLimit.replace(/\.?0+$/,'')} placeholder="أي مبلغ" disabled={!p.canApprove} onChange={e=>set(i,{approveLimit:e.target.value})}/></td></tr>)}</tbody></table></div>}
  <Needs items={bad}/><div className="actions"><button className="btn primary" disabled={busy||bad.some(Boolean)} onClick={()=>void save()}><Save size={15}/> حفظ صلاحيات الاعتماد</button></div>
 </>;
}
