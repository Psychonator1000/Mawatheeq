import {useEffect,useState} from 'react';
import {Plus,Check,Trash2,Printer,Play,Lock,Send,Percent,Coins,Layers} from 'lucide-react';
import {toast} from 'sonner';
import {booksRequest} from '@/lib/local-auth';
import {SCHEDULE_KINDS,money,toFils,filsText,type AdvancedSetup,type Analytic,type FollowupLevel,type FollowupPartner,type Recurring,type Schedule,type ScheduleKind,type Tax,type YearEnd} from '@/lib/books';
import type {CaseSummary} from '@/lib/departments';
import {todayISO,formatDate} from '@/lib/domain';
import {listHtml,printHtml} from '@/lib/print';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import FilterSelect from '../filter-select';
import Needs from '../needs';
import {EditorDialog} from './shared';
import type {FullSetup} from './books-invoicing';

export type AdvSetup=FullSetup&AdvancedSetup;
const amount=(v:string)=>money(toFils(v));
// A request sent for approval was announced already; it is not an error.
const fail=(e:unknown)=>{if(!(e as {handled?:boolean}).handled)toast.error((e as Error).message)};
const popupBlocked=()=>toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.');
const accOptions=(setup:AdvSetup)=>setup.accounts.filter(a=>!a.deprecated).map(a=>({value:a.id,label:a.code+' '+a.name}));
const accByCode=(setup:AdvSetup,code:string)=>setup.accounts.find(a=>a.code===code)?.id||'';
const valid=(v:string)=>{try{return toFils(v)>=0}catch{return false}};
type Tab=ScheduleKind|'recurring'|'budgets'|'followups'|'yearend';

/** «المحاسبة المتقدمة»: assets and deferrals, recurring entries, budgets, payment follow-up and closing the year. */
export type AdvancedTab=Tab;
export default function Advanced({setup,cases,onOpen,onChanged,version,tab:tabProp}:{setup:AdvSetup;cases:CaseSummary[];onOpen:(id:string)=>void;onChanged:()=>void;version:number;tab?:Tab}){
 const [ownTab,setTab]=useState<Tab>('asset'),tab=tabProp??ownTab;
 const due=setup.due;
 return <>
  {(due.schedules>0||due.recurring>0||due.followups>0)&&<div className="books-due">{due.schedules>0&&<span className="tag amber">{due.schedules} قسط إهلاك أو تأجيل مستحق الترحيل</span>}{due.recurring>0&&<span className="tag amber">{due.recurring} قيد متكرر حان موعده</span>}{due.followups>0&&<span className="tag amber">{due.followups} موكل متأخر للمتابعة</span>}</div>}
  {!tabProp&&<div className="department-tabs view-switch" role="group" aria-label="المحاسبة المتقدمة">{([['asset','الأصول الثابتة'],['deferred_revenue','الإيرادات المؤجلة'],['deferred_expense','المصروفات المؤجلة'],['recurring','القيود المتكررة'],['budgets','الموازنات'],['followups','متابعة التحصيل'],['yearend','إقفال السنة']] as const).map(([k,l])=>
   <button key={k} className={'btn '+(tab===k?'primary':'')} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}</div>}
  {(tab==='asset'||tab==='deferred_revenue'||tab==='deferred_expense')&&<Schedules key={tab} setup={setup} cases={cases} kind={tab} onOpen={onOpen} onChanged={onChanged} version={version}/>}
  {tab==='recurring'&&<RecurringPanel setup={setup} onOpen={onOpen} onChanged={onChanged} version={version}/>}
  {tab==='budgets'&&<Budgets setup={setup} version={version}/>}
  {tab==='followups'&&<Followups setup={setup} onOpen={onOpen} version={version}/>}
  {tab==='yearend'&&<YearEndPanel setup={setup} onChanged={onChanged}/>}
 </>;
}

function Schedules({setup,cases,kind,onOpen,onChanged,version}:{setup:AdvSetup;cases:CaseSummary[];kind:ScheduleKind;onOpen:(id:string)=>void;onChanged:()=>void;version:number}){
 const k=SCHEDULE_KINDS[kind],[rows,setRows]=useState<Schedule[]|null>(null),[v,setV]=useState(0),[editing,setEditing]=useState<Schedule|null>(null),[open,setOpen]=useState<Schedule|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;booksRequest<Schedule[]>('list_schedules',{kind}).then(r=>{if(live)setRows(r)},fail);return()=>{live=false}},[kind,version,v]);
 const refresh=()=>{setV(x=>x+1);onChanged()};
 const blank=():Schedule=>({id:'',kind,name:'',journalId:setup.journals.find(j=>j.type==='general')?.id||'',debitAccount:accByCode(setup,k.debit),creditAccount:accByCode(setup,k.credit),assetAccount:kind==='asset'?accByCode(setup,'151000'):'',
  value:'',salvage:'0',months:kind==='asset'?36:12,firstDate:todayISO(),state:'draft',partnerId:'',caseId:'',analyticId:'',ref:'',revision:0,posted:'0',lines:[]});
 const postDue=()=>{setBusy(true);booksRequest<{posted:number}>('post_schedules',{date:todayISO()}).then(r=>{toast.success(r.posted?`رُحّل ${r.posted} قسط`:'لا توجد أقساط مستحقة');refresh()},fail).finally(()=>setBusy(false))};
 const desc=kind==='asset'?'شراء أصل (أثاث، أجهزة، سيارة) يُهلك بالتساوي على عمره، فيُرحّل كل شهر قيد الإهلاك إلى المصروفات.':kind==='deferred_revenue'?'أتعاب مقبوضة مقدماً عن فترة (مثل عقد استشارة سنوي) تُثبت إيراداً شهراً بشهر.':'مصروف مدفوع مقدماً (مثل إيجار سنة أو تأمين) يُحمّل على المصروفات شهراً بشهر.';
 return <section className="panel"><div className="department-toolbar"><h2>{k.label}</h2><div className="actions">{setup.canEdit&&<><button className="btn" disabled={busy} onClick={postDue}><Play size={15}/> ترحيل المستحق حتى اليوم</button><button className="btn primary" onClick={()=>setEditing(blank())}><Plus size={15}/> {k.one} جديد</button></>}</div></div>
  <p className="muted">{desc}</p>
  {rows&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الاسم</th><th>القيمة</th><th>المرحّل</th><th>الباقي</th><th>الأشهر</th><th>يبدأ</th><th>الحالة</th><th></th></tr></thead>
   <tbody>{rows.map(s=><tr key={s.id} className={s.state==='closed'?'ledger-void':''}><td>{s.name}</td><td dir="ltr">{amount(s.value)}</td><td dir="ltr">{amount(s.posted)}</td><td dir="ltr">{money(toFils(s.value)-toFils(s.salvage)-toFils(s.posted))}</td><td>{s.months}</td><td>{formatDate(s.firstDate)}</td>
    <td><span className={'tag '+(s.state==='running'?'green':s.state==='draft'?'amber':'')}>{s.state==='draft'?'مسودة':s.state==='running'?'جارٍ':'مغلق'}</span></td><td><button className="btn" onClick={()=>setOpen(s)}>فتح</button></td></tr>)}</tbody></table>
   {!rows.length&&<Empty title={'لا يوجد '+k.one} text={desc}/>}</div>}
  {editing&&<ScheduleEditor setup={setup} cases={cases} initial={editing} onClose={()=>setEditing(null)} onSaved={s=>{setEditing(null);refresh();setOpen(s)}}/>}
  {open&&<ScheduleView setup={setup} initial={open} onClose={()=>setOpen(null)} onEdit={s=>{setOpen(null);setEditing(s)}} onOpen={onOpen} onChanged={s=>{refresh();setOpen(s)}}/>}
 </section>;
}
function ScheduleEditor({setup,cases,initial,onClose,onSaved}:{setup:AdvSetup;cases:CaseSummary[];initial:Schedule;onClose:()=>void;onSaved:(s:Schedule)=>void}){
 const [s,setS]=useState(initial),[busy,setBusy]=useState(false),k=SCHEDULE_KINDS[s.kind],accounts=accOptions(setup),set=(p:Partial<Schedule>)=>setS(x=>({...x,...p}));
 const each=valid(s.value)&&valid(s.salvage||'0')&&s.months>0?Math.round((toFils(s.value)-toFils(s.salvage||'0'))/s.months):0;
 const needs=[!s.name.trim()&&'اكتب الاسم',!valid(s.value)||toFils(s.value)<=0?'اكتب القيمة':'',valid(s.salvage||'0')&&valid(s.value)&&toFils(s.salvage||'0')>=toFils(s.value)?'القيمة المتبقية أكبر من القيمة':'',!s.firstDate&&'اختر تاريخ أول قسط',
  (s.months<1||s.months>600)&&'عدد الأشهر بين 1 و600',!s.debitAccount&&'اختر الحساب المدين',!s.creditAccount&&'اختر الحساب الدائن',s.kind==='asset'&&!s.assetAccount?'اختر حساب الأصل':''];
 return <EditorDialog title={s.id?s.name:k.one+' جديد'} description={s.kind==='asset'?'كل شهر: مدين مصروف الإهلاك، دائن مجمع الإهلاك. الأصل نفسه يُسجل بفاتورة المورد أو بقيد.':'كل شهر قيد بالمبلغ نفسه من الحساب الأول إلى الثاني.'} busy={busy} onClose={onClose}>
  <div className="books-editor"><div className="form-grid">
   <Field label="الاسم" value={s.name} onChange={v=>set({name:v})}/><label className="field"><span>{s.kind==='asset'?'قيمة الشراء':'المبلغ'}</span><input dir="ltr" inputMode="decimal" value={s.value} onChange={e=>set({value:e.target.value})}/></label>
   {s.kind==='asset'&&<label className="field"><span>القيمة المتبقية في آخر عمره</span><input dir="ltr" inputMode="decimal" value={s.salvage} onChange={e=>set({salvage:e.target.value})}/></label>}
   <label className="field"><span>عدد الأشهر</span><input dir="ltr" inputMode="numeric" value={s.months} onChange={e=>set({months:Math.floor(Number(e.target.value)||0)})}/></label>
   <DateField label="تاريخ أول قسط" value={s.firstDate} onChange={v=>set({firstDate:v})}/>
   {s.kind==='asset'&&<FilterSelect label="حساب الأصل" value={s.assetAccount} onChange={v=>set({assetAccount:v})} options={accounts}/>}
   <FilterSelect label={s.kind==='asset'?'مصروف الإهلاك (مدين)':'الحساب المدين'} value={s.debitAccount} onChange={v=>set({debitAccount:v})} options={accounts}/>
   <FilterSelect label={s.kind==='asset'?'مجمع الإهلاك (دائن)':'الحساب الدائن'} value={s.creditAccount} onChange={v=>set({creditAccount:v})} options={accounts}/>
   <FilterSelect label="الدفتر" value={s.journalId} onChange={v=>set({journalId:v})} options={setup.journals.filter(j=>j.active).map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>
   <FilterSelect label="الشريك" value={s.partnerId} onChange={v=>set({partnerId:v})} empty="بلا شريك" options={setup.partners.map(p=>({value:p.id,label:p.name}))}/>
   <FilterSelect label="القضية" value={s.caseId} onChange={v=>set({caseId:v})} empty="بلا قضية" options={cases.filter(c=>!c.archived||c.id===s.caseId).map(c=>({value:c.id,label:(c.code||c.autoNumber||'')+' · '+c.client}))}/>
   {setup.analytic.length>0&&<FilterSelect label="مركز التكلفة" value={s.analyticId} onChange={v=>set({analyticId:v})} empty="بلا مركز تكلفة" options={setup.analytic.filter(a=>a.active).map(a=>({value:a.id,label:a.name}))}/>}
  </div>
  {each>0&&<p className="muted">قسط شهري تقريباً <b dir="ltr">{money(each)}</b> لمدة {s.months} شهراً.</p>}
  <Needs items={needs}/>
  <div className="actions"><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>{setBusy(true);booksRequest<Schedule>('save_schedule',{schedule:{...s,id:s.id||undefined}}).then(r=>{toast.success('حُفظ الجدول');onSaved(r)},fail).finally(()=>setBusy(false))}}>حفظ الجدول</button><button className="btn" onClick={onClose}>إغلاق</button></div></div>
 </EditorDialog>;
}
function ScheduleView({setup,initial,onClose,onEdit,onOpen,onChanged}:{setup:AdvSetup;initial:Schedule;onClose:()=>void;onEdit:(s:Schedule)=>void;onOpen:(id:string)=>void;onChanged:(s:Schedule)=>void}){
 const [s,setS]=useState(initial),[busy,setBusy]=useState(false),[dispose,setDispose]=useState<{date:string;sale:string;account:string}|null>(null);
 const act=(fn:()=>Promise<Schedule>,done:string)=>{setBusy(true);fn().then(r=>{toast.success(done);setS(r);onChanged(r)},fail).finally(()=>setBusy(false))};
 return <EditorDialog title={s.name} description={`${SCHEDULE_KINDS[s.kind].one} · ${amount(s.value)} على ${s.months} شهراً · المرحّل ${amount(s.posted)}`} busy={busy} onClose={onClose}><div className="books-editor">
  <div className="table-wrap books-preview"><table className="office-table books-table"><thead><tr><th>#</th><th>التاريخ</th><th>المبلغ</th><th>القيد</th></tr></thead><tbody>{s.lines.map(l=><tr key={l.id}><td>{l.seq}</td><td>{formatDate(l.date)}</td><td dir="ltr">{amount(l.amount)}</td>
   <td>{l.moveId?<button type="button" className="link mono" onClick={()=>onOpen(l.moveId)}>{l.moveName}</button>:<span className="muted">لم يُرحّل</span>}</td></tr>)}</tbody></table></div>
  {dispose&&<div className="books-reverse panel"><h3>{s.kind==='asset'?'بيع الأصل أو استبعاده':'إثبات الباقي دفعة واحدة'}</h3><div className="form-grid"><DateField label="التاريخ" value={dispose.date} onChange={v=>setDispose({...dispose,date:v})}/>
   {s.kind==='asset'&&<><label className="field"><span>ثمن البيع (صفر للاستبعاد)</span><input dir="ltr" inputMode="decimal" value={dispose.sale} onChange={e=>setDispose({...dispose,sale:e.target.value})}/></label>
    <FilterSelect label="استُلم الثمن في" value={dispose.account} onChange={v=>setDispose({...dispose,account:v})} empty="لا يوجد ثمن" options={setup.accounts.filter(a=>a.type==='asset_cash'||a.type==='asset_receivable').map(a=>({value:a.id,label:a.code+' '+a.name}))}/></>}</div>
   <div className="actions"><button className="btn danger" disabled={busy||!dispose.date} onClick={()=>act(()=>booksRequest<Schedule>('dispose_schedule',{id:s.id,date:dispose.date,saleAmount:dispose.sale,saleAccount:dispose.account}),'أُغلق الجدول')}>تأكيد</button><button className="btn" onClick={()=>setDispose(null)}>تراجع</button></div></div>}
  <div className="actions">
   {setup.canEdit&&s.state==='draft'&&<><button className="btn primary" disabled={busy} onClick={()=>act(()=>booksRequest<Schedule>('confirm_schedule',{id:s.id}),'بدأ الجدول')}><Check size={15}/> تأكيد وبدء</button><button className="btn" onClick={()=>onEdit(s)}>تعديل</button>
    <button className="btn danger" disabled={busy} onClick={()=>{if(confirm('حذف هذا الجدول؟')){setBusy(true);booksRequest('delete_schedule',{id:s.id}).then(()=>{toast.success('حُذف');onClose();onChanged({...s,state:'closed'})},fail).finally(()=>setBusy(false))}}}><Trash2 size={15}/> حذف</button></>}
   {setup.canEdit&&s.state==='running'&&<><button className="btn" disabled={busy} onClick={()=>{setBusy(true);booksRequest<{posted:number}>('post_schedules',{id:s.id,date:todayISO()}).then(r=>{toast.success(`رُحّل ${r.posted} قسط`);return booksRequest<Schedule[]>('list_schedules',{kind:s.kind})}).then(list=>{const n=list.find(x=>x.id===s.id);if(n){setS(n);onChanged(n)}},fail).finally(()=>setBusy(false))}}><Play size={15}/> ترحيل المستحق</button>
    {!dispose&&<button className="btn" onClick={()=>setDispose({date:todayISO(),sale:'',account:''})}>{s.kind==='asset'?'بيع / استبعاد':'إثبات الباقي الآن'}</button>}</>}
   <button className="btn" onClick={onClose}>إغلاق</button></div>
 </div></EditorDialog>;
}

function RecurringPanel({setup,onOpen,onChanged,version}:{setup:AdvSetup;onOpen:(id:string)=>void;onChanged:()=>void;version:number}){
 const [rows,setRows]=useState<Recurring[]|null>(null),[v,setV]=useState(0),[editing,setEditing]=useState<Recurring|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;booksRequest<Recurring[]>('list_recurring').then(r=>{if(live)setRows(r)},fail);return()=>{live=false}},[version,v]);
 const run=()=>{setBusy(true);booksRequest<{created:{id:string;name:string}[]}>('run_recurring',{date:todayISO()}).then(r=>{toast.success(r.created.length?`أُنشئ ${r.created.length} مستند`:'لا شيء مستحق اليوم');setV(x=>x+1);onChanged();if(r.created.length===1)onOpen(r.created[0].id)},fail).finally(()=>setBusy(false))};
 const kinds={entry:'قيد يومية',out_invoice:'فاتورة موكل',in_invoice:'فاتورة مورد'};
 return <section className="panel"><div className="department-toolbar"><h2>القيود والفواتير المتكررة</h2><div className="actions">{setup.canEdit&&<><button className="btn" disabled={busy} onClick={run}><Play size={15}/> إنشاء المستحق حتى اليوم</button>
   <button className="btn primary" onClick={()=>setEditing({id:'',name:'',kind:'entry',template:{journalId:setup.journals.find(j=>j.type==='general')?.id||'',lines:[]},interval:1,nextDate:todayISO(),endDate:null,autoPost:false,active:true,lastRun:null,revision:0})}><Plus size={15}/> جديد</button></>}</div></div>
  <p className="muted">مثل الإيجار الشهري أو أتعاب الاستشارة الشهرية لموكل: يُنشأ المستند في موعده، مسودة أو مرحّلاً مباشرة.</p>
  {rows&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الاسم</th><th>النوع</th><th>كل</th><th>الموعد القادم</th><th>ينتهي</th><th>ترحيل تلقائي</th><th></th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.id} className={r.active?'':'ledger-void'}><td>{r.name}</td><td>{kinds[r.kind]}</td><td>{r.interval===1?'شهر':r.interval+' أشهر'}</td><td>{r.active?formatDate(r.nextDate):'متوقف'}</td><td>{r.endDate?formatDate(r.endDate):'—'}</td><td>{r.autoPost?'نعم':'لا'}</td>
    <td><button className="btn" onClick={()=>setEditing(r)}>{setup.canEdit?'تعديل':'عرض'}</button></td></tr>)}</tbody></table>{!rows.length&&<Empty title="لا توجد قيود متكررة"/>}</div>}
  {editing&&<RecurringEditor setup={setup} initial={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setV(x=>x+1)}}/>}
 </section>;
}
type TLine={accountId:string;label:string;debit:string;credit:string;priceUnit:string;productId:string};
function RecurringEditor({setup,initial,onClose,onSaved}:{setup:AdvSetup;initial:Recurring;onClose:()=>void;onSaved:()=>void}){
 const t=initial.template as {journalId?:string;partnerId?:string;ref?:string;lines?:TLine[]};
 const [r,setR]=useState(initial),[journal,setJournal]=useState(t.journalId||''),[partner,setPartner]=useState(t.partnerId||''),[ref,setRef]=useState(t.ref||''),[busy,setBusy]=useState(false);
 const [lines,setLines]=useState<TLine[]>((t.lines||[]).map(l=>({accountId:l.accountId||'',label:l.label||'',debit:l.debit||'',credit:l.credit||'',priceUnit:l.priceUnit||'',productId:l.productId||''})).concat(t.lines?.length?[]:[{accountId:'',label:'',debit:'',credit:'',priceUnit:'',productId:''},{accountId:'',label:'',debit:'',credit:'',priceUnit:'',productId:''}]));
 const inv=r.kind!=='entry',line=(i:number,p:Partial<TLine>)=>setLines(x=>x.map((l,k)=>k===i?{...l,...p}:l)),accounts=accOptions(setup);
 const journals=setup.journals.filter(j=>j.active&&(r.kind==='entry'?true:j.type===(r.kind==='out_invoice'?'sale':'purchase')));
 const debit=lines.reduce((s,l)=>s+(valid(l.debit)?toFils(l.debit):0),0),credit=lines.reduce((s,l)=>s+(valid(l.credit)?toFils(l.credit):0),0);
 const needs=[!r.name.trim()&&'اكتب الاسم',!journal&&'اختر الدفتر',!r.nextDate&&'اختر الموعد',inv&&!partner?'اختر الشريك':'',!inv&&debit!==credit?'القيد غير متوازن':'',lines.every(l=>!l.accountId)&&'أضف سطراً'];
 const template=inv?{journalId:journal,partnerId:partner,ref,lines:lines.filter(l=>l.accountId||l.productId).map(l=>({productId:l.productId,accountId:l.accountId,label:l.label,quantity:'1',priceUnit:l.priceUnit}))}
  :{journalId:journal,ref,lines:lines.filter(l=>l.accountId).map(l=>({accountId:l.accountId,label:l.label,debit:l.debit,credit:l.credit}))};
 return <EditorDialog title={r.id?r.name:'قيد متكرر جديد'} description="يُنشأ المستند بهذا المحتوى في كل موعد." busy={busy} onClose={onClose}><div className="books-editor">
  <div className="form-grid"><Field label="الاسم" value={r.name} onChange={v=>setR({...r,name:v})}/><OfficeSelect label="النوع" value={r.kind} onChange={v=>{setR({...r,kind:v as Recurring['kind']});setJournal('')}} options={[['entry','قيد يومية'],['out_invoice','فاتورة موكل'],['in_invoice','فاتورة مورد']]}/>
   <FilterSelect label="الدفتر" value={journal} onChange={setJournal} options={journals.map(j=>({value:j.id,label:`${j.code} · ${j.name}`}))}/>{inv&&<FilterSelect label="الشريك" value={partner} onChange={setPartner} options={setup.partners.map(p=>({value:p.id,label:p.name}))}/>}
   <Field label="المرجع" value={ref} onChange={setRef}/><DateField label="الموعد القادم" value={r.nextDate} onChange={v=>setR({...r,nextDate:v})}/><DateField label="ينتهي في (اختياري)" value={r.endDate||''} onChange={v=>setR({...r,endDate:v||null})}/>
   <label className="field"><span>كل (أشهر)</span><input dir="ltr" inputMode="numeric" value={r.interval} onChange={e=>setR({...r,interval:Math.max(1,Math.min(24,Math.floor(Number(e.target.value)||1)))})}/></label>
   <label className="check"><input type="checkbox" checked={r.autoPost} onChange={e=>setR({...r,autoPost:e.target.checked})}/> ترحيل تلقائي (وإلا يُنشأ مسودة للمراجعة)</label>
   {r.id&&<label className="check"><input type="checkbox" checked={r.active} onChange={e=>setR({...r,active:e.target.checked})}/> فعّال</label>}</div>
  <div className="table-wrap"><table className="office-table books-lines"><thead><tr><th>الحساب</th><th>البيان</th>{inv?<th>المبلغ</th>:<><th>مدين</th><th>دائن</th></>}<th></th></tr></thead><tbody>{lines.map((l,i)=><tr key={i}>
   <td><FilterSelect label={`حساب السطر ${i+1}`} value={l.accountId} onChange={v=>line(i,{accountId:v})} options={accounts}/></td><td><input aria-label={`بيان السطر ${i+1}`} value={l.label} onChange={e=>line(i,{label:e.target.value})}/></td>
   {inv?<td><input aria-label={`مبلغ السطر ${i+1}`} dir="ltr" value={l.priceUnit} onChange={e=>line(i,{priceUnit:e.target.value})}/></td>:<><td><input aria-label={`مدين السطر ${i+1}`} dir="ltr" value={l.debit} onChange={e=>line(i,{debit:e.target.value,credit:e.target.value?'':l.credit})}/></td>
    <td><input aria-label={`دائن السطر ${i+1}`} dir="ltr" value={l.credit} onChange={e=>line(i,{credit:e.target.value,debit:e.target.value?'':l.debit})}/></td></>}
   <td><button type="button" className="btn icon" aria-label={`حذف السطر ${i+1}`} onClick={()=>setLines(x=>x.filter((_,k)=>k!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
  <div className="actions"><button type="button" className="btn" onClick={()=>setLines(x=>[...x,{accountId:'',label:'',debit:'',credit:'',priceUnit:'',productId:''}])}><Plus size={15}/> سطر</button></div>
  <Needs items={needs}/>
  <div className="actions">{setup.canEdit&&<><button className="btn primary" disabled={busy||needs.some(Boolean)} onClick={()=>{setBusy(true);booksRequest('save_recurring',{recurring:{...r,id:r.id||undefined,template}}).then(()=>{toast.success('حُفظ');onSaved()},fail).finally(()=>setBusy(false))}}>حفظ</button>
   {r.id&&<button className="btn danger" disabled={busy} onClick={()=>{if(confirm('حذف هذا القيد المتكرر؟')){setBusy(true);booksRequest('delete_recurring',{id:r.id}).then(onSaved,fail).finally(()=>setBusy(false))}}}><Trash2 size={15}/> حذف</button>}</>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </div></EditorDialog>;
}

type BudgetData={id:string;name:string;from:string;to:string;note:string;revision:number;lines:{accountId:string;code:string;account:string;analyticId:string;analytic:string;planned:string;actual:string}[]};
function Budgets({setup,version}:{setup:AdvSetup;version:number}){
 const [rows,setRows]=useState<BudgetData[]|null>(null),[v,setV]=useState(0),[editing,setEditing]=useState<BudgetData|null>(null);
 useEffect(()=>{let live=true;booksRequest<BudgetData[]>('budget_report').then(r=>{if(live)setRows(r)},fail);return()=>{live=false}},[version,v]);
 const y=todayISO().slice(0,4);
 return <section className="panel"><div className="department-toolbar"><h2>الموازنات</h2>{setup.canEdit&&<button className="btn primary" onClick={()=>setEditing({id:'',name:'موازنة '+y,from:y+'-01-01',to:y+'-12-31',note:'',revision:0,lines:[]})}><Plus size={15}/> موازنة جديدة</button>}</div>
  <p className="muted">المخطط لكل حساب (ولكل مركز تكلفة إن أردت) مقابل الفعلي المرحّل في الفترة.</p>
  {rows?.map(b=><div key={b.id} className="books-budget"><div className="department-toolbar"><h3>{b.name} <small className="muted">{formatDate(b.from)} – {formatDate(b.to)}</small></h3>{setup.canEdit&&<button className="btn" onClick={()=>setEditing(b)}>تعديل</button>}</div>
   <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الحساب</th><th>مركز التكلفة</th><th>المخطط</th><th>الفعلي</th><th>الفرق</th><th>نسبة الإنجاز</th></tr></thead>
    <tbody>{b.lines.map((l,i)=>{const p=toFils(l.planned),a=toFils(l.actual),pct=p?Math.round(a*100/p):0;return <tr key={i}><td>{l.code} {l.account}</td><td>{l.analytic||'—'}</td><td dir="ltr">{amount(l.planned)}</td><td dir="ltr">{amount(l.actual)}</td><td dir="ltr">{money(p-a)}</td>
     <td><div className="books-bar" title={pct+'٪'}><span style={{width:Math.min(pct,100)+'%'}} className={pct>100?'over':''}/></div><small>{pct}٪</small></td></tr>})}</tbody></table></div></div>)}
  {rows&&!rows.length&&<Empty title="لا توجد موازنات"/>}
  {editing&&<BudgetEditor setup={setup} initial={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setV(x=>x+1)}}/>}
 </section>;
}
function BudgetEditor({setup,initial,onClose,onSaved}:{setup:AdvSetup;initial:BudgetData;onClose:()=>void;onSaved:()=>void}){
 const [b,setB]=useState(initial),[lines,setLines]=useState(initial.lines.map(l=>({accountId:l.accountId,analyticId:l.analyticId,amount:filsText(toFils(l.planned))}))),[busy,setBusy]=useState(false);
 const accounts=setup.accounts.filter(a=>!a.deprecated&&(a.type.startsWith('income')||a.type.startsWith('expense'))).map(a=>({value:a.id,label:a.code+' '+a.name}));
 const line=(i:number,p:Partial<(typeof lines)[number]>)=>setLines(x=>x.map((l,k)=>k===i?{...l,...p}:l));
 return <EditorDialog title={b.id?b.name:'موازنة جديدة'} description="مبلغ موجب لكل حساب إيراد أو مصروف." busy={busy} onClose={onClose}><div className="books-editor">
  <div className="form-grid"><Field label="الاسم" value={b.name} onChange={v=>setB({...b,name:v})}/><DateField label="من" value={b.from} onChange={v=>setB({...b,from:v})}/><DateField label="إلى" value={b.to} onChange={v=>setB({...b,to:v})}/></div>
  <div className="table-wrap"><table className="office-table books-lines"><thead><tr><th>الحساب</th><th>مركز التكلفة</th><th>المبلغ المخطط</th><th></th></tr></thead><tbody>{lines.map((l,i)=><tr key={i}>
   <td><FilterSelect label={`حساب البند ${i+1}`} value={l.accountId} onChange={v=>line(i,{accountId:v})} options={accounts}/></td>
   <td><FilterSelect label={`مركز تكلفة البند ${i+1}`} value={l.analyticId} onChange={v=>line(i,{analyticId:v})} empty="الكل" options={setup.analytic.map(a=>({value:a.id,label:a.name}))}/></td>
   <td><input aria-label={`مبلغ البند ${i+1}`} dir="ltr" value={l.amount} onChange={e=>line(i,{amount:e.target.value})}/></td><td><button type="button" className="btn icon" aria-label={`حذف البند ${i+1}`} onClick={()=>setLines(x=>x.filter((_,k)=>k!==i))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
  <div className="actions"><button type="button" className="btn" onClick={()=>setLines(x=>[...x,{accountId:'',analyticId:'',amount:''}])}><Plus size={15}/> بند</button></div>
  <Needs items={[!b.name.trim()&&'اكتب الاسم',(!b.from||!b.to||b.to<b.from)&&'اختر الفترة',lines.some(l=>!l.accountId||!valid(l.amount))&&'لكل بند حساب ومبلغ']}/>
  <div className="actions"><button className="btn primary" disabled={busy||!b.name.trim()||!b.from||!b.to||b.to<b.from||lines.some(l=>!l.accountId||!valid(l.amount))} onClick={()=>{setBusy(true);booksRequest('save_budget',{budget:{...b,id:b.id||undefined,lines}}).then(()=>{toast.success('حُفظت الموازنة');onSaved()},fail).finally(()=>setBusy(false))}}>حفظ</button>
   {b.id&&<button className="btn danger" disabled={busy} onClick={()=>{if(confirm('حذف الموازنة؟')){setBusy(true);booksRequest('delete_budget',{id:b.id}).then(onSaved,fail).finally(()=>setBusy(false))}}}><Trash2 size={15}/> حذف</button>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </div></EditorDialog>;
}

function Followups({setup,onOpen,version}:{setup:AdvSetup;onOpen:(id:string)=>void;version:number}){
 const [data,setData]=useState<{levels:FollowupLevel[];partners:FollowupPartner[]}|null>(null),[v,setV]=useState(0),[busy,setBusy]=useState(false),[levels,setLevels]=useState(false);
 useEffect(()=>{let live=true;booksRequest<{levels:FollowupLevel[];partners:FollowupPartner[]}>('followups').then(r=>{if(live)setData(r)},fail);return()=>{live=false}},[version,v]);
 const letter=(p:FollowupPartner)=>{const l=p.level;if(!printHtml(listHtml((l?.name||'تذكير بالسداد')+' — '+p.name,(l?.message||'')+` إجمالي المتأخر: ${amount(p.overdue)} د.ك`,['الفاتورة','التاريخ','الاستحقاق','أيام التأخير','المبلغ المتبقي'],
  p.invoices.map(i=>[i.name,formatDate(i.date),formatDate(i.due),String(i.days),amount(i.amount)]),formatDate(todayISO()),'',[['الإجمالي المتأخر',amount(p.overdue)]])))popupBlocked()};
 const done=(p:FollowupPartner)=>{setBusy(true);booksRequest('followup_done',{partnerId:p.partnerId,levelId:p.level?.id||''}).then(()=>{toast.success('سُجلت المتابعة');setV(x=>x+1)},fail).finally(()=>setBusy(false))};
 return <section className="panel"><div className="department-toolbar"><h2>متابعة التحصيل</h2>{setup.canConfigure&&<button className="btn" onClick={()=>setLevels(true)}>مستويات التذكير</button>}</div>
  <p className="muted">الموكلون الذين تأخرت فواتيرهم، والمستوى المناسب لكل منهم حسب أيام التأخير. اطبع الخطاب ثم سجّل أنه أُرسل.</p>
  {data&&<div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الموكل</th><th>المتأخر</th><th>أقصى تأخير</th><th>المستوى المستحق</th><th>آخر متابعة</th><th></th></tr></thead>
   <tbody>{data.partners.map(p=>{const due=p.level&&(!p.last||p.last.levelDays<p.level.days);return <tr key={p.partnerId}><td>{p.name}{p.phone&&<small dir="ltr"> · {p.phone}</small>}<div className="books-mini">{p.invoices.map(i=><button key={i.moveId} type="button" className="link mono" onClick={()=>onOpen(i.moveId)}>{i.name}</button>)}</div></td>
    <td dir="ltr">{amount(p.overdue)}</td><td>{p.maxDays} يوماً</td><td>{p.level?<span className={'tag '+(due?'amber':'')}>{p.level.name}</span>:'—'}</td><td>{p.last?`${p.last.level||'متابعة'} · ${formatDate(p.last.date)}`:'لم يُتابع'}</td>
    <td><div className="actions"><button className="btn" onClick={()=>letter(p)}><Printer size={14}/> الخطاب</button>{setup.canEdit&&<button className={'btn '+(due?'primary':'')} disabled={busy} onClick={()=>done(p)}><Send size={14}/> سُجّل الإرسال</button>}</div></td></tr>})}</tbody></table>
   {!data.partners.length&&<Empty title="لا يوجد موكلون متأخرون" text="كل الفواتير في مواعيدها."/>}</div>}
  {levels&&data&&<LevelsEditor levels={data.levels} onClose={()=>setLevels(false)} onSaved={()=>setV(x=>x+1)}/>}
 </section>;
}
function LevelsEditor({levels,onClose,onSaved}:{levels:FollowupLevel[];onClose:()=>void;onSaved:()=>void}){
 const [rows,setRows]=useState<FollowupLevel[]>(levels),[busy,setBusy]=useState(false);
 const save=(l:FollowupLevel,del=false)=>{setBusy(true);booksRequest('save_followup_level',{level:{...l,id:l.id||undefined,delete:del}}).then(()=>{toast.success(del?'حُذف المستوى':'حُفظ المستوى');onSaved()},fail).finally(()=>setBusy(false))};
 return <EditorDialog title="مستويات التذكير" description="يُختار لكل موكل أعلى مستوى بلغته أيام تأخيره." busy={busy} onClose={onClose}><div className="books-editor">
  {rows.map((l,i)=><div key={l.id||i} className="books-level"><div className="form-grid"><label className="field"><span>بعد (أيام)</span><input dir="ltr" value={l.days} onChange={e=>setRows(x=>x.map((y,k)=>k===i?{...y,days:Math.floor(Number(e.target.value)||0)}:y))}/></label>
   <Field label="الاسم" value={l.name} onChange={v=>setRows(x=>x.map((y,k)=>k===i?{...y,name:v}:y))}/><Field label="نص الخطاب" value={l.message} onChange={v=>setRows(x=>x.map((y,k)=>k===i?{...y,message:v}:y))} wide multiline/></div>
   <div className="actions"><button className="btn" disabled={busy||!l.name.trim()} onClick={()=>save(l)}>حفظ</button>{l.id&&<button className="btn danger" disabled={busy} onClick={()=>save(l,true)}><Trash2 size={14}/></button>}</div></div>)}
  <div className="actions"><button className="btn" onClick={()=>setRows(x=>[...x,{id:'',days:90,name:'',message:''}])}><Plus size={15}/> مستوى</button><button className="btn" onClick={onClose}>إغلاق</button></div>
 </div></EditorDialog>;
}

function YearEndPanel({setup,onChanged}:{setup:AdvSetup;onChanged:()=>void}){
 const lastEnd=String(Number(todayISO().slice(0,4))-1)+'-'+setup.settings.fiscalYearEnd;
 const [end,setEnd]=useState(setup.settings.fiscalLockDate&&setup.settings.fiscalLockDate>=lastEnd?todayISO().slice(0,4)+'-'+setup.settings.fiscalYearEnd:lastEnd),[check,setCheck]=useState<YearEnd|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;if(end)booksRequest<YearEnd>('year_end',{yearEnd:end}).then(r=>{if(live)setCheck(r)},fail);return()=>{live=false}},[end]);
 const items:[string,number,string][]=check?[['مسودات حتى نهاية السنة',check.drafts,'رحّلها أو ألغها (شرط للإقفال)'],['حركات كشف بنك غير مطابقة',check.statementLines,'طابقها من البنك والنقد'],['أقساط إهلاك أو تأجيل لم تُرحّل',check.schedules,'رحّلها من المحاسبة المتقدمة'],['قيود متكررة مستحقة',check.recurring,'أنشئها من القيود المتكررة']]:[];
 return <section className="panel"><h2><Lock size={18}/> إقفال السنة المالية</h2>
  <p className="muted">قبل الإقفال: راجع القائمة أدناه. الإقفال يمنع أي قيد أو تعديل حتى نهاية السنة لكل المستخدمين، ونتيجة السنة تظهر تلقائياً في الميزانية العمومية ضمن «نتائج سنوات سابقة».</p>
  <div className="form-grid"><DateField label="نهاية السنة المالية" value={end} onChange={setEnd}/></div>
  {check&&<><ul className="books-checklist">{items.map(([label,n,hint])=><li key={label} className={n?'todo':'ok'}><b>{n?n:'✓'}</b> {label}{n?<small> — {hint}</small>:null}</li>)}</ul>
   <dl className="books-totals"><div><dt>نتيجة السنة</dt><dd dir="ltr">{amount(check.profit)}</dd></div><div><dt>ذمم موكلين مفتوحة</dt><dd dir="ltr">{amount(check.openReceivable)}</dd></div><div><dt>مقفل حالياً حتى</dt><dd>{check.fiscalLockDate?formatDate(check.fiscalLockDate):'—'}</dd></div></dl>
   {setup.canConfigure?<div className="actions"><button className="btn danger" disabled={busy||check.drafts>0||!!(check.fiscalLockDate&&check.fiscalLockDate>=end)} title={check.drafts>0?'توجد مسودات':undefined}
    onClick={()=>{if(!confirm(`إقفال السنة حتى ${formatDate(end)}؟ لا يمكن الرجوع عنه.`))return;setBusy(true);booksRequest<YearEnd>('close_year',{yearEnd:end}).then(r=>{setCheck(r);toast.success('أُقفلت السنة');onChanged()},fail).finally(()=>setBusy(false))}}><Lock size={15}/> إقفال السنة</button></div>
    :<p className="muted">إقفال السنة لصاحب صلاحية الإعدادات.</p>}</>}
 </section>;
}

/** Taxes: switched on or off for the office, each tax's rate and account, and the services it applies to by default. */
export function TaxesPanel({setup,onChanged}:{setup:AdvSetup;onChanged:()=>void}){
 const [t,setT]=useState<Tax|null>(null),[busy,setBusy]=useState(false),[products,setProducts]=useState<Record<string,boolean>>({}),ro=!setup.canConfigure;
 const toggle=(on:boolean)=>{setBusy(true);booksRequest('set_taxes',{enabled:on}).then(()=>{toast.success(on?'فُعّلت الضرائب':'أُوقفت الضرائب');onChanged()},fail).finally(()=>setBusy(false))};
 const open=(x:Tax)=>{setT(x);setProducts(Object.fromEntries(setup.products.map(p=>[p.id,(setup.productTaxes[p.id]?.[x.typeUse]||[]).includes(x.id)])))};
 return <div className="books-locks">
  <label className="check books-switch"><input type="checkbox" checked={setup.taxesEnabled} disabled={ro||busy} onChange={e=>toggle(e.target.checked)}/> <Percent size={15}/> تفعيل الضرائب على الفواتير {setup.taxesEnabled?'(مفعّلة)':'(موقوفة — لا تُحتسب أي ضريبة)'}</label>
  <div className="actions"><button className="btn primary" disabled={ro} onClick={()=>open({id:'',name:'',typeUse:'sale',amountType:'percent',amount:'5',priceInclude:false,accountId:accByCode(setup,'216000'),active:true,revision:0})}><Plus size={15}/> ضريبة جديدة</button></div>
  <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الضريبة</th><th>على</th><th>القيمة</th><th>ضمن السعر</th><th>الحساب</th><th></th></tr></thead>
   <tbody>{setup.taxes.map(x=><tr key={x.id} className={x.active?'':'ledger-void'}><td>{x.name}</td><td>{x.typeUse==='sale'?'المبيعات':'المشتريات'}</td><td dir="ltr">{x.amountType==='percent'?Number(x.amount)+'٪':amount(x.amount)}</td><td>{x.priceInclude?'نعم':'لا'}</td>
    <td>{setup.accounts.find(a=>a.id===x.accountId)?.name}</td><td><button className="btn" onClick={()=>open(x)}>{ro?'عرض':'تعديل'}</button></td></tr>)}</tbody></table></div>
  {t&&<EditorDialog title={t.id?t.name:'ضريبة جديدة'} description="الضريبة المضافة تُزاد على السعر، والضريبة ضمن السعر تُستخرج منه." busy={busy} onClose={()=>setT(null)}><div className="form-grid">
   <Field label="الاسم" value={t.name} onChange={v=>ro||setT({...t,name:v})}/><OfficeSelect label="على" value={t.typeUse} onChange={v=>ro||setT({...t,typeUse:v as Tax['typeUse']})} options={[['sale','المبيعات'],['purchase','المشتريات']]}/>
   <OfficeSelect label="النوع" value={t.amountType} onChange={v=>ro||setT({...t,amountType:v as Tax['amountType']})} options={[['percent','نسبة'],['fixed','مبلغ ثابت لكل وحدة']]}/>
   <label className="field"><span>{t.amountType==='percent'?'النسبة ٪':'المبلغ'}</span><input dir="ltr" value={t.amount} readOnly={ro} onChange={e=>setT({...t,amount:e.target.value})}/></label>
   <FilterSelect label="حساب الضريبة" value={t.accountId} onChange={v=>setT({...t,accountId:v})} disabled={ro} options={accOptions(setup)}/>
   <label className="check"><input type="checkbox" checked={t.priceInclude} disabled={ro} onChange={e=>setT({...t,priceInclude:e.target.checked})}/> السعر يشمل الضريبة</label>
   {t.id&&<label className="check"><input type="checkbox" checked={t.active} disabled={ro} onChange={e=>setT({...t,active:e.target.checked})}/> فعّالة</label>}</div>
   <h4>تُطبق تلقائياً على الخدمات:</h4><div className="books-chips">{setup.products.filter(p=>t.typeUse==='sale'?p.incomeAccount:p.expenseAccount).map(p=><label key={p.id} className="check"><input type="checkbox" disabled={ro} checked={!!products[p.id]} onChange={e=>setProducts(x=>({...x,[p.id]:e.target.checked}))}/> {p.name}</label>)}</div>
   <div className="actions">{!ro&&<button className="btn primary" disabled={busy||!t.name.trim()||!t.accountId} onClick={()=>{setBusy(true);booksRequest('save_tax',{tax:{...t,id:t.id||undefined},products}).then(()=>{toast.success('حُفظت الضريبة');setT(null);onChanged()},fail).finally(()=>setBusy(false))}}>حفظ</button>}<button className="btn" onClick={()=>setT(null)}>إغلاق</button></div>
  </EditorDialog>}
 </div>;
}

/** Currencies and their dated rates (dinars for one unit). */
export function CurrenciesPanel({setup,onChanged}:{setup:AdvSetup;onChanged:()=>void}){
 const [cur,setCur]=useState(''),[date,setDate]=useState(todayISO()),[rate,setRate]=useState(''),[busy,setBusy]=useState(false),[history,setHistory]=useState<{date:string;rate:string}[]|null>(null);
 const toggle=(code:string,name:string,active:boolean)=>{setBusy(true);booksRequest('save_currency',{code,name,active}).then(onChanged,fail).finally(()=>setBusy(false))};
 return <div className="books-locks"><p className="muted"><Coins size={15}/> الدفاتر بالدينار الكويتي. الفاتورة بعملة أخرى تُسجل بالدينار بسعر صرف تاريخها، ويُحفظ مبلغها بعملتها. ما يبقى مفتوحاً بعد السداد بسبب تغير السعر يُسوّى من الفاتورة بزر «تسوية فرق العملة».</p>
  <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>العملة</th><th>آخر سعر (د.ك للوحدة)</th><th>بتاريخ</th><th>فعّالة</th><th></th></tr></thead>
   <tbody>{setup.currencies.map(c=><tr key={c.code}><td><b className="mono">{c.code}</b> {c.name}</td><td dir="ltr">{c.rate||'—'}</td><td>{c.rateDate?formatDate(c.rateDate):'—'}</td>
    <td>{c.code==='KWD'?'عملة الدفاتر':<input type="checkbox" aria-label={'تفعيل '+c.code} checked={c.active} disabled={!setup.canConfigure||busy} onChange={e=>toggle(c.code,c.name,e.target.checked)}/>}</td>
    <td>{c.code!=='KWD'&&<button className="btn" onClick={()=>{setCur(c.code);setRate(c.rate)}}>سعر جديد</button>}</td></tr>)}</tbody></table></div>
  {cur&&setup.canEdit&&<section className="books-reverse panel"><h3>سعر صرف {cur}</h3><div className="form-grid"><DateField label="التاريخ" value={date} onChange={setDate}/><label className="field"><span>دينار لكل 1 {cur}</span><input dir="ltr" inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)}/></label></div>
   <div className="actions"><button className="btn primary" disabled={busy||!date||!/^\d+(\.\d{1,8})?$/.test(rate)||Number(rate)<=0} onClick={()=>{setBusy(true);booksRequest<{date:string;rate:string}[]>('save_rate',{currency:cur,date,rate}).then(h=>{setHistory(h);toast.success('حُفظ السعر');onChanged()},fail).finally(()=>setBusy(false))}}>حفظ السعر</button><button className="btn" onClick={()=>{setCur('');setHistory(null)}}>إغلاق</button></div>
   {history&&<p className="muted">الأسعار المسجلة: {history.slice(0,8).map(h=>`${formatDate(h.date)}: ${h.rate}`).join(' · ')}</p>}</section>}
 </div>;
}

/** Cost centres to tag lines with, for the cost centre report and budgets. */
export function AnalyticPanel({setup,onChanged}:{setup:AdvSetup;onChanged:()=>void}){
 const [a,setA]=useState<Analytic|null>(null),[busy,setBusy]=useState(false);
 return <div className="books-locks"><p className="muted"><Layers size={15}/> مراكز التكلفة (مثل الأقسام أو الفروع أو نوع الخدمة) تُختار على سطور القيود والفواتير، فيظهر إيراد ومصروف كل مركز في تقريره وفي الموازنات.</p>
  <div className="actions"><button className="btn primary" disabled={!setup.canEdit} onClick={()=>setA({id:'',code:'',name:'',plan:'مراكز التكلفة',active:true,revision:0})}><Plus size={15}/> مركز تكلفة</button></div>
  <div className="table-wrap"><table className="office-table books-table"><thead><tr><th>الرمز</th><th>المركز</th><th>الخطة</th><th></th></tr></thead>
   <tbody>{setup.analytic.map(x=><tr key={x.id} className={x.active?'':'ledger-void'}><td className="mono">{x.code||'—'}</td><td>{x.name}</td><td>{x.plan}</td><td><button className="btn" onClick={()=>setA(x)}>{setup.canEdit?'تعديل':'عرض'}</button></td></tr>)}</tbody></table>{!setup.analytic.length&&<Empty title="لا توجد مراكز تكلفة"/>}</div>
  {a&&<EditorDialog title={a.id?a.name:'مركز تكلفة جديد'} description="" busy={busy} onClose={()=>setA(null)}><div className="form-grid"><Field label="الاسم" value={a.name} onChange={v=>setA({...a,name:v})}/><Field label="الرمز" value={a.code} onChange={v=>setA({...a,code:v})}/>
   <Field label="الخطة" value={a.plan} onChange={v=>setA({...a,plan:v})}/>{a.id&&<label className="check"><input type="checkbox" checked={a.active} onChange={e=>setA({...a,active:e.target.checked})}/> فعّال</label>}</div>
   <div className="actions">{setup.canEdit&&<button className="btn primary" disabled={busy||!a.name.trim()} onClick={()=>{setBusy(true);booksRequest('save_analytic',{analytic:{...a,id:a.id||undefined}}).then(()=>{toast.success('حُفظ');setA(null);onChanged()},fail).finally(()=>setBusy(false))}}>حفظ</button>}<button className="btn" onClick={()=>setA(null)}>إغلاق</button></div>
  </EditorDialog>}
 </div>;
}
