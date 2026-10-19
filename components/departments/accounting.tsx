import {useState,type ReactNode,useMemo} from 'react';
import {suggestions} from '@/lib/choices';
import {Plus,Printer} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {type CaseSummary,type LedgerData,type LedgerRecord,type Currency,CURRENCIES,ENTRY_TYPES,newDepartmentRecord,moneyText,ledgerTotals} from '@/lib/departments';
import type {Permissions} from '@/lib/permissions';
import {todayISO,formatDate} from '@/lib/domain';
import {normalizeSearch} from '@/lib/case-browse';
import {Field,DateField,Empty} from '../shared';
import {OfficeSelect} from '../office-shared';
import PageNavigation from '../page-navigation';
import {CasePicker,DepartmentHistory,StatusMessage,useRecords,exportCsv} from './shared';
import RecordWindow,{useListNav,type WindowNav,type Enter} from '../record-window';
import CopyChip from '../copy-chip';
import {amountInWords} from '@/lib/document-fields';
import {printHtml,statementHtml,voucherHtml} from '@/lib/print';
import Books,{useBooksAvailable} from './books';
import {AttendanceSettingsPanel,AttendanceUnavailable,PayrollPanel,ProfilesPanel,useAttendanceEnabled} from './attendance';
const caseCode=(cases:CaseSummary[],id:string)=>{const c=cases.find(x=>x.id===id);return c?c.code||c.autoNumber||c.id:'مكتبي'};
const decimal=(minor:string,places:number)=>{const s=minor.padStart(places+1,'0');return s.slice(0,-places)+'.'+s.slice(-places)};
const popupBlocked=()=>toast.error('اسمح بالنوافذ المنبثقة في المتصفح للطباعة.');
export default function Accounting({cases,access}:{cases:CaseSummary[];access:Permissions}) {
 const attendance=useAttendanceEnabled(),books=useBooksAvailable(),[chosen,setView]=useState<'books'|'ledger'|'payroll'|'pay'|'settings'|null>(null);
 // The double-entry books open first once they are available; the simple ledger stays beside them.
 const view=chosen??(books?'books':'ledger');
 const tabs=([['books','الدفاتر المحاسبية'],['ledger','دفتر الحركات'],['payroll','الرواتب والحضور'],['pay','رواتب الموظفين'],['settings','إعدادات الدوام']] as const).filter(([k])=>k==='ledger'||(k==='books'?books:attendance!==false));
 const views=<><h2>المحاسبة</h2>{tabs.length>1&&<div className="work-chips" role="group" aria-label="أقسام المحاسبة">{tabs.map(([k,label])=><button key={k} className={'work-chip'+(view===k?' on':'')} aria-pressed={view===k} onClick={()=>setView(k)}>{label}</button>)}</div>}</>;
 if(view==='books')return <Books cases={cases} access={access} views={views}/>;
 // One screen: the section's header and its content scrolling inside one panel.
 if(view!=='ledger')return <section className="panel work-desk desk-full"><div className="work-desk-head">{views}</div><div className="work-desk-body"><div className="att-section">{attendance===false?<AttendanceUnavailable/>:view==='payroll'?<PayrollPanel canExport={access.canExport}/>:view==='pay'?<ProfilesPanel/>:<AttendanceSettingsPanel/>}</div></div></section>;
 return <LedgerView cases={cases} access={access} views={views}/>;
}
function LedgerView({cases,access,views}:{cases:CaseSummary[];access:Permissions;views:ReactNode}) {
 const {rows,loading,error,reload}=useRecords<LedgerData>('accounting');
 // Payers and payees already used, then the clients and opponents of visible cases.
 const parties=useMemo(()=>suggestions(rows,r=>r.payload.party,[],300).concat(suggestions(cases.flatMap(c=>[c.clientEntityName||c.client,c.opponent]),v=>v,[],300)).filter((v,i,a)=>a.indexOf(v)===i),[rows,cases]);
 const [search,setSearch]=useState(''),[currency,setCurrency]=useState<Currency>('KWD'),[type,setType]=useState(''),[status,setStatus]=useState('posted'),[from,setFrom]=useState(''),[to,setTo]=useState(''),[caseId,setCaseId]=useState(''),[page,setPage]=useState(1),[editing,setEditingRaw]=useState<LedgerRecord|null>(null);
 const filtered=rows.filter(r=>r.payload.currency===currency&&(!type||r.payload.type===type)&&(!status||r.payload.status===status)&&(!caseId||r.caseId===caseId)&&(!from||r.payload.date>=from)&&(!to||r.payload.date<=to)&&normalizeSearch([r.payload.reference,r.payload.party,r.payload.notes,cases.find(c=>c.id===r.caseId)?.code].join(' ')).includes(normalizeSearch(search))).sort((a,b)=>b.payload.date.localeCompare(a.payload.date)||b.createdAt.localeCompare(a.createdAt));
 const totals=ledgerTotals(filtered,currency),pages=Math.max(1,Math.ceil(filtered.length/25)),current=Math.min(page,pages);
 const {nav,step,enter,openItem:setEditing}=useListNav(filtered,editing,setEditingRaw);
 async function printStatement(){try{await departmentRequest('check_export',{workspace:'accounting'});const scope=[caseId?'القضية '+caseCode(cases,caseId):'جميع القضايا',from&&'من '+formatDate(from),to&&'إلى '+formatDate(to),type&&ENTRY_TYPES[type as keyof typeof ENTRY_TYPES],search&&'بحث: '+search].filter(Boolean).join(' · ');if(!printHtml(statementHtml(filtered,currency,scope,id=>caseCode(cases,id),(m,c)=>moneyText(m,c as Currency),formatDate(todayISO()),'')))popupBlocked()}catch(e){toast.error((e as Error).message)}}
 const add=()=>setEditing(newDepartmentRecord('accounting','entry',{type:'fee',date:todayISO(),currency,amount:'',amountMinor:'0',reference:'',party:'',notes:'',status:'posted',voidReason:''}));
 // One screen: the balances beside the entries, the list scrolling inside its panel.
 return <><div className="work-desk-grid">
 <div className="work-desk-aside"><section className="panel sec-agenda" aria-label="الأرصدة">
  <div className="sec-agenda-head"><div><h2>الأرصدة</h2><small>{currency} · حسب التصفية الحالية</small></div></div>
  <div className="ledger-balance desk-balance"><span>الأتعاب المتبقية ضمن التصفية</span><b dir="ltr">{moneyText(totals.outstanding,currency)}</b><small>الأتعاب − المقبوضات</small></div>
  <div className="desk-stats ledger-totals">{(['fee','receipt','expense','net'] as const).map(k=><div key={k}><span>{k==='net'?'صافي المقبوضات بعد المصروفات':ENTRY_TYPES[k]}</span><b dir="ltr">{moneyText(totals[k],currency)}</b></div>)}</div>
  <p className="muted desk-note">القيود الملغاة محفوظة ولا تدخل الأرصدة.</p>
 </section></div>
 <section className="panel work-desk">
  <div className="work-desk-head">{views}<div className="actions">{access.canExport&&<button className="btn" onClick={()=>void exportCsv('accounting','Mawatheeq-ledger',[['التاريخ','النوع','المرجع','الطرف','القضية','المبلغ','العملة','الحالة','سبب الإلغاء'],...filtered.map(r=>[r.payload.date,ENTRY_TYPES[r.payload.type],r.payload.reference,r.payload.party,cases.find(c=>c.id===r.caseId)?.code||r.caseId,moneyText(r.payload.amountMinor,r.payload.currency),r.payload.currency,r.payload.status==='void'?'ملغى':'مرحّل',r.payload.voidReason])]).catch(e=>toast.error(e.message))}>تصدير الحركات</button>}{access.canExport&&<button className="btn" onClick={()=>void printStatement()}>طباعة كشف حساب</button>}{access.canEdit&&<button className="btn primary" onClick={add}><Plus size={17}/> قيد جديد</button>}</div></div>
  <div className="work-desk-filters"><Field label="بحث الحركات" value={search} onChange={v=>{setSearch(v);setPage(1)}}/><OfficeSelect label="العملة" value={currency} onChange={v=>{setCurrency(v as Currency);setPage(1)}} options={Object.keys(CURRENCIES).map(k=>[k,k])}/><OfficeSelect label="نوع الحركة" value={type} onChange={v=>{setType(v);setPage(1)}} options={Object.entries(ENTRY_TYPES)} empty="جميع الأنواع"/><OfficeSelect label="حالة القيد" value={status} onChange={v=>{setStatus(v);setPage(1)}} options={[['posted','القيود المرحلة'],['void','القيود الملغاة']]} empty="جميع الحالات"/><DateField label="من تاريخ" value={from} onChange={v=>{setFrom(v);setPage(1)}}/><DateField label="إلى تاريخ" value={to} onChange={v=>{setTo(v);setPage(1)}}/><OfficeSelect label="تصفية بالقضية" value={caseId} onChange={v=>{setCaseId(v);setPage(1)}} options={cases.map(c=>[c.id,c.code||c.autoNumber||c.id])} empty="جميع القضايا"/></div>
  {from&&to&&from>to&&<p role="alert">تاريخ البداية بعد تاريخ النهاية.</p>}
  <div className="work-desk-body"><StatusMessage loading={loading} error={error}/>{!loading&&!error&&<>{filtered.length?<table className="office-table ledger-table"><thead><tr><th>التاريخ / المرجع</th><th>الحركة</th><th>الطرف</th><th>القضية</th><th>المبلغ</th><th>الحالة</th><th>التفاصيل</th></tr></thead><tbody>{filtered.slice((current-1)*25,current*25).map(r=><tr key={r.id} className={r.payload.status==='void'?'ledger-void':''}><td>{formatDate(r.payload.date)}<small>{r.payload.reference}</small></td><td>{ENTRY_TYPES[r.payload.type]}</td><td>{r.payload.party}</td><td>{cases.find(c=>c.id===r.caseId)?.code||'مكتبي'}</td><td className="ledger-value" dir="ltr">{moneyText(r.payload.amountMinor,r.payload.currency)}</td><td>{r.payload.status==='void'?'ملغى':'مرحّل'}</td><td><button className="btn" onClick={()=>setEditing(r)}>فتح القيد</button></td></tr>)}</tbody></table>:<Empty text="لا توجد حركات مطابقة. أضف قيداً أو غيّر التصفية."/>}<PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></>}</div>
 </section></div>
 {editing&&<LedgerEditor parties={parties} key={editing.id} nav={nav} onNavigate={step} enter={enter} initial={editing} cases={cases} access={access} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);reload()}}/>}</>;
}
function LedgerEditor({parties=[],initial,cases,access,onClose,onSaved,nav,onNavigate,enter}:{parties?:string[];initial:LedgerRecord;cases:CaseSummary[];access:Permissions;onClose:()=>void;onSaved:()=>void;nav?:WindowNav;onNavigate?:(dir:'prev'|'next')=>void;enter?:Enter}) {
 const [draft,setDraft]=useState(initial),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(key:string,value:string)=>setDraft(r=>({...r,payload:{...r.payload,[key]:value}}));
 async function save(action:string){setBusy(true);setError('');try{await departmentRequest(action,{workspace:'accounting',record:draft,id:draft.id,revision:draft.revision,reason});toast.success(action==='void_record'?'حُفظ الإلغاء مع أصل القيد':'حُفظ القيد المالي');onSaved()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 const p=draft.payload,isNew=!draft.revision,ready=!!p.amount&&!!p.reference&&!!p.party&&!!p.date&&(access.caseScope==='all'||!!draft.caseId);
 const dirty=isNew?JSON.stringify(draft)!==JSON.stringify(initial):!!reason.trim();
 const print=()=>{if(!printHtml(voucherHtml(draft,caseCode(cases,draft.caseId),(m,c)=>moneyText(m,c as Currency),p.currency==='KWD'?amountInWords(decimal(p.amountMinor,3)):'',formatDate(todayISO()),'')))popupBlocked()};
 return <RecordWindow size="compact" eyebrow={isNew?'قيد مالي جديد':'قيد مالي'} title={isNew?(ENTRY_TYPES[p.type]+(p.amount?' · '+p.amount+' '+p.currency:'')):<span dir="ltr">{moneyText(p.amountMinor,p.currency)}</span>} subtitle={isNew?(p.party||'الدافع / المستفيد غير مسجل'):`${ENTRY_TYPES[p.type]} · ${p.party}`}
  badges={<>{p.reference&&<CopyChip label="المرجع" value={p.reference}/>}<span className={'tag '+(p.status==='void'?'amber':'green')}>{isNew?'غير مرحّل':p.status==='void'?'ملغى':'مرحّل'}</span></>}
  facts={[['التاريخ',p.date?formatDate(p.date):''],['النوع',ENTRY_TYPES[p.type]],['العملة',p.currency],['القضية',draft.caseId?caseCode(cases,draft.caseId):'مكتبي'],['الطرف',p.party]]}
  pin={p.status==='void'?<p className="notice">سبب الإلغاء: {p.voidReason}</p>:undefined}
  quick={!isNew?<button type="button" className="btn" onClick={print}><Printer size={16}/> طباعة السند</button>:undefined}
  nav={nav} onNavigate={onNavigate} unit="القيد" enter={enter} dirty={dirty&&access.canEdit} busy={busy} onSave={isNew&&access.canEdit?()=>{if(ready)void save('save_record')}:undefined} onClose={onClose}
  needs={isNew&&access.canEdit?[!p.date&&'اختر «تاريخ القيد»',!p.amount&&'أدخل «المبلغ»',!p.reference&&'أدخل «مرجع القيد / رقم الإيصال»',!p.party&&'أدخل «الدافع / المستفيد»',access.caseScope!=='all'&&!draft.caseId&&'اربط القيد بقضية؛ حسابك يرى قضايا محددة فقط']:[]}
  footer={<>{isNew&&access.canEdit&&<button type="submit" form="ledger-form" className="btn primary" disabled={busy||!ready}>ترحيل القيد</button>}<button className="btn" disabled={busy} onClick={onClose}>إغلاق القيد</button></>}>
 <p className="subtitle">القيد المرحّل ثابت. لتصحيحه، ألغِه مع سبب واضح ثم أضف القيد الصحيح.</p>
 <form id="ledger-form" onSubmit={e=>{e.preventDefault();void save('save_record')}}><fieldset disabled={busy||!access.canEdit||!isNew}><CasePicker cases={cases} value={draft.caseId} onChange={v=>setDraft(r=>({...r,caseId:v}))} optional={access.caseScope==='all'}/><div className="form-grid"><OfficeSelect label="نوع القيد" value={p.type} onChange={v=>set('type',v)} options={Object.entries(ENTRY_TYPES)}/><DateField label="تاريخ القيد" value={p.date} onChange={v=>set('date',v)}/><OfficeSelect label="عملة القيد" value={p.currency} onChange={v=>set('currency',v)} options={Object.keys(CURRENCIES).map(k=>[k,k])}/><Field label="المبلغ" type="text" placeholder="0.000" value={p.amount} onChange={v=>set('amount',v)}/><Field label="مرجع القيد / رقم الإيصال" value={p.reference} onChange={v=>set('reference',v)}/><Field label="الدافع / المستفيد" suggestions={parties} value={p.party} onChange={v=>set('party',v)}/><Field label="ملاحظات القيد" value={p.notes} onChange={v=>set('notes',v)} multiline wide/></div><p className="subtitle">حتى {CURRENCIES[p.currency]} خانات عشرية. لا تُجمع عملات مختلفة.</p></fieldset></form>
 {!isNew&&access.canEdit&&p.status==='posted'&&<section className="void-entry"><h3>إلغاء القيد</h3><Field label="سبب إلغاء القيد" value={reason} onChange={setReason} multiline/><button className="btn" disabled={busy||!reason.trim()} onClick={()=>void save('void_record')}>تأكيد إلغاء القيد</button></section>}
 {error&&<p className="notice" role="alert">{error}</p>}{!isNew&&<DepartmentHistory workspace="accounting" id={draft.id} revision={draft.revision}/>}</RecordWindow>;
}
