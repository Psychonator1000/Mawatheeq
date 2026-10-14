'use client';
import {useMemo,useState} from 'react';
import {Printer,Filter,Columns3,RotateCcw} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {judgmentRollHtml,printHtml} from '@/lib/print';
import {ROLL_COLUMNS,DEFAULT_ROLL_COLUMNS,ROLL_GROUPS,ROLL_SORTS,EMPTY_ROLL_FILTER,filterRoll,sortRoll,groupRoll,rollCell,type RollCase,type RollColumn,type RollFilter,type RollGroupKey,type RollSort} from '@/lib/judgment-roll';
import {MONTH_NAMES} from '@/lib/case-browse';
import {formatDate,todayISO,type CaseRecord} from '@/lib/domain';
import {Field,DateField} from './shared';
import {SelectList} from './filter-select';

type Scope='shown'|'selected'|'all';
const COLUMNS_KEY='mawatheeq.roll-columns.v1';
const savedColumns=():RollColumn[]=>{try{const v=JSON.parse(localStorage.getItem(COLUMNS_KEY)||'null');return Array.isArray(v)&&v.length?v.filter((c:string)=>ROLL_COLUMNS.some(x=>x[0]===c)):DEFAULT_ROLL_COLUMNS}catch{return DEFAULT_ROLL_COLUMNS}};
const distinct=(rows:RollCase[],get:(r:RollCase)=>string)=>[...new Set(rows.map(get).map(v=>v.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));

/** «رول الأحكام»: choose the cases (shown, ticked or all), narrow them with filters, pick columns, then preview and print. */
export default function JudgmentRoll({shown,selected,all,shownLabel,toRow,printedBy,canPrint,onClose}:{shown:CaseRecord[];selected:CaseRecord[];all:CaseRecord[];shownLabel:string;toRow:(c:CaseRecord)=>RollCase;printedBy:string;canPrint:boolean;onClose:()=>void}) {
 const [scope,setScope]=useState<Scope>(selected.length?'selected':'shown'),[title,setTitle]=useState('رول الأحكام');
 const [filter,setFilter]=useState<RollFilter>(EMPTY_ROLL_FILTER),[sort,setSort]=useState<RollSort>('date-desc'),[group,setGroup]=useState<RollGroupKey>('');
 const [columns,setColumns]=useState<RollColumn[]>(savedColumns),[panel,setPanel]=useState<'filters'|'columns'|''>('filters');
 const rowsOf=useMemo(()=>({shown:shown.map(toRow),selected:selected.map(toRow),all:all.map(toRow)}),[shown,selected,all]);// eslint-disable-line react-hooks/exhaustive-deps
 const base=rowsOf[scope];
 const options=useMemo(()=>({years:distinct(base,r=>r.date.slice(0,4)).sort().reverse(),clients:distinct(base,r=>r.client),lawyers:distinct(base,r=>r.lawyer),outcomes:distinct(base,r=>r.outcome),statuses:distinct(base,r=>r.status),levels:distinct(base,r=>r.level),courts:distinct(base,r=>r.court)}),[base]);
 const rows=useMemo(()=>sortRoll(filterRoll(base,filter),sort),[base,filter,sort]);
 const active=Object.entries(filter).filter(([,v])=>v).length;
 const setF=(k:keyof RollFilter,v:string)=>setFilter(f=>({...f,[k]:v}));
 const pickColumns=(next:RollColumn[])=>{const ordered=ROLL_COLUMNS.map(c=>c[0]).filter(c=>next.includes(c));setColumns(ordered);try{localStorage.setItem(COLUMNS_KEY,JSON.stringify(ordered))}catch{/* the choice is only kept for this visit */}};
 const describe=()=>{const parts=[({shown:shownLabel,selected:'القضايا المحددة',all:'كل القضايا غير المؤرشفة'})[scope]];
  if(filter.from||filter.to)parts.push(`أحكام ${filter.from?'من '+formatDate(filter.from):''} ${filter.to?'إلى '+formatDate(filter.to):''}`.trim());
  if(filter.year||filter.month)parts.push(`${filter.month?MONTH_NAMES[Number(filter.month)-1]:''} ${filter.year}`.trim());
  if(filter.hearingFrom||filter.hearingTo)parts.push(`جلسات ${filter.hearingFrom?'من '+formatDate(filter.hearingFrom):''} ${filter.hearingTo?'إلى '+formatDate(filter.hearingTo):''}`.trim());
  for(const k of ['client','lawyer','court','outcome','status','level'] as const)if(filter[k])parts.push(filter[k]);
  if(filter.category)parts.push({execution:'التنفيذ',insurance:'التأمين',telecom:'الاتصالات'}[filter.category]||filter.category);
  if(group)parts.push('مجمّعة حسب '+ROLL_GROUPS.find(g=>g[0]===group)![1]);return parts.join(' · ')};
 const html=useMemo(()=>judgmentRollHtml(title.trim()||'رول الأحكام',describe(),columns.map(c=>ROLL_COLUMNS.find(x=>x[0]===c)![1]),groupRoll(rows,group).map(([g,list])=>[g,list.map(r=>columns.map(c=>rollCell(r,c)))]),formatDate(todayISO()),printedBy,columns.map(c=>ROLL_COLUMNS.find(x=>x[0]===c)![3])),[rows,group,columns,title,scope,filter]);// eslint-disable-line react-hooks/exhaustive-deps
 const select=(label:string,k:keyof RollFilter,list:string[]|[string,string][],all='الكل')=><label className="field"><span>{label}</span><SelectList aria-label={label} value={filter[k]} onChange={e=>setF(k,e.target.value)}><option value="">{all}</option>{list.map(o=>Array.isArray(o)?<option key={o[0]} value={o[0]}>{o[1]}</option>:<option key={o} value={o}>{o}</option>)}</SelectList></label>;
 return <Dialog open onOpenChange={v=>{if(!v)onClose()}}><DialogContent dir="rtl" className="office-dialog roll-dialog"><DialogHeader><DialogTitle>رول الأحكام</DialogTitle><DialogDescription>اختر القضايا وصفِّها وحدد الأعمدة، وراجع الرول قبل الطباعة. يُطبع أفقياً دون عنوان الموقع.</DialogDescription></DialogHeader>
  <div className="roll-top">
   <fieldset className="roll-scope"><legend>القضايا</legend>{([['shown',shownLabel,rowsOf.shown.length],['selected','القضايا المحددة',rowsOf.selected.length],['all','كل القضايا غير المؤرشفة',rowsOf.all.length]] as [Scope,string,number][]).map(([id,label,n])=><label key={id} className={'roll-choice'+(scope===id?' on':'')}><input type="radio" name="roll-scope" checked={scope===id} disabled={!n} onChange={()=>setScope(id)}/><span>{label}</span><b>{n}</b></label>)}</fieldset>
   <div className="roll-count" role="status"><b>{rows.length}</b><span>قضية ستُطبع</span></div>
  </div>
  <div className="roll-arrange">
   <label className="field"><span>الترتيب</span><SelectList aria-label="الترتيب" value={sort} onChange={e=>setSort(e.target.value as RollSort)}>{ROLL_SORTS.map(([id,l])=><option key={id} value={id}>{l}</option>)}</SelectList></label>
   <label className="field"><span>التجميع</span><SelectList aria-label="التجميع" value={group} onChange={e=>setGroup(e.target.value as RollGroupKey)}>{ROLL_GROUPS.map(([id,l])=><option key={id} value={id}>{l}</option>)}</SelectList></label>
   <Field label="عنوان الرول" value={title} onChange={setTitle}/>
   <div className="roll-toggles"><button type="button" className={'btn'+(panel==='filters'?' primary':'')} aria-expanded={panel==='filters'} onClick={()=>setPanel(p=>p==='filters'?'':'filters')}><Filter size={15}/> التصفية{active?` (${active})`:''}</button><button type="button" className={'btn'+(panel==='columns'?' primary':'')} aria-expanded={panel==='columns'} onClick={()=>setPanel(p=>p==='columns'?'':'columns')}><Columns3 size={15}/> الأعمدة ({columns.length})</button></div>
  </div>
  {panel==='filters'&&<section className="roll-panel" aria-label="تصفية الرول">
   <div className="roll-filter-grid">
    <DateField label="أحكام من تاريخ" value={filter.from} onChange={v=>setF('from',v)}/><DateField label="أحكام إلى تاريخ" value={filter.to} onChange={v=>setF('to',v)}/>
    {select('سنة الحكم','year',options.years,'كل السنوات')}{select('شهر الحكم','month',MONTH_NAMES.map((m,i)=>[String(i+1).padStart(2,'0'),m] as [string,string]),'كل الأشهر')}
    <DateField label="جلسات من تاريخ" value={filter.hearingFrom} onChange={v=>setF('hearingFrom',v)}/><DateField label="جلسات إلى تاريخ" value={filter.hearingTo} onChange={v=>setF('hearingTo',v)}/>
    {select('الموكل','client',options.clients,'كل الموكلين')}{select('المحامي','lawyer',options.lawyers,'كل المحامين')}
    {select('المحكمة','court',options.courts,'كل المحاكم')}{select('التصنيف','category',[['execution','التنفيذ'],['insurance','التأمين'],['telecom','الاتصالات']],'كل التصنيفات')}
    {select('نتيجة الحكم','outcome',options.outcomes)}{select('حالة الملف','status',options.statuses)}{select('درجة التقاضي','level',options.levels)}
   </div>
   {active>0&&<button type="button" className="btn" onClick={()=>setFilter(EMPTY_ROLL_FILTER)}><RotateCcw size={14}/> مسح التصفية</button>}
  </section>}
  {panel==='columns'&&<section className="roll-panel" aria-label="أعمدة الرول">
   <div className="roll-columns">{ROLL_COLUMNS.map(([id,label])=><label key={id} className={'roll-choice'+(columns.includes(id)?' on':'')}><input type="checkbox" checked={columns.includes(id)} onChange={e=>pickColumns(e.target.checked?[...columns,id]:columns.filter(c=>c!==id))}/><span>{label}</span></label>)}</div>
   <div className="actions"><button type="button" className="btn" onClick={()=>pickColumns(ROLL_COLUMNS.map(c=>c[0]))}>كل الأعمدة</button><button type="button" className="btn" onClick={()=>pickColumns(DEFAULT_ROLL_COLUMNS)}>الأعمدة المعتادة</button></div>
  </section>}
  <iframe className="roll-preview" title="معاينة رول الأحكام" sandbox="" srcDoc={html}/>
  <div className="actions">{canPrint?<button className="btn primary" disabled={!rows.length||!columns.length} onClick={()=>{if(!printHtml(html))toast.error('تعذر فتح نافذة الطباعة.')}}><Printer/> طباعة الرول ({rows.length})</button>:<p className="subtitle">الطباعة غير متاحة لحسابك؛ اطلبها من مسؤول المكتب.</p>}<button className="btn" onClick={onClose}>إغلاق</button></div>
 </DialogContent></Dialog>;
}
