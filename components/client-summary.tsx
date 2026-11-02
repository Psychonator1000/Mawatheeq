'use client';
import {useMemo,useState} from 'react';
import {Printer,Search,Users,Building2} from 'lucide-react';
import {toast} from 'sonner';
import {type CaseRecord,type Rules,formatDate,todayISO} from '@/lib/domain';
import type {ClientEntity} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import {STATUS_COLUMNS,EXTRA_GROUPS,METRIC_LABELS,casesFor,personGroups,summarize,type ExtraGroup,type Metric,type SummaryRow,type StatusKey} from '@/lib/client-summary';
import {lastSitting,nextSitting} from '@/lib/case-desk';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './ui/dialog';
import {judgmentRollHtml,printHtml} from '@/lib/print';
import {clientRollHtml} from '@/lib/client-roll';
import {Empty} from './shared';

const EXTRAS_KEY='mawatheeq.clientSummary.extras';
const readExtras=():ExtraGroup[]=>{try{const v=JSON.parse(localStorage.getItem(EXTRAS_KEY)||'null');return Array.isArray(v)?v.filter(x=>EXTRA_GROUPS.some(([k])=>k===x)):['sessions','judgments']}catch{return ['sessions','judgments']}};
// Each extra group: its columns, with a short label under the group's heading, a kind (number, date, text) and a value.
type Col={label:string;kind:'num'|'date'|'text'|'money';get:(r:SummaryRow)=>string|number;metric?:Metric};
const EXTRA_COLUMNS:Record<ExtraGroup,Col[]>={
 sessions:[{label:'خلال ٧ أيام',kind:'num',get:r=>r.next7,metric:'next7'},{label:'خلال ٣٠ يوماً',kind:'num',get:r=>r.next30,metric:'next30'},{label:'أقرب جلسة',kind:'date',get:r=>r.nextDate?formatDate(r.nextDate):''}],
 judgments:[{label:'لصالحنا',kind:'num',get:r=>r.won,metric:'won'},{label:'ضدنا',kind:'num',get:r=>r.lost,metric:'lost'},{label:'ضمن مهلة الطعن',kind:'num',get:r=>r.appealOpen,metric:'appealOpen'}],
 contracts:[{label:'بلا عقد',kind:'num',get:r=>r.noContract,metric:'noContract'},{label:'الأتعاب (د.ك)',kind:'money',get:r=>r.fees?r.fees.toLocaleString('en-US',{maximumFractionDigits:3}):'',metric:'fees'}],
 lawyers:[{label:'المحامون',kind:'text',get:r=>r.lawyers.slice(0,3).map(([n,c])=>`${n} (${c})`).join('، ')}],
};
// «متداول» heads its three court levels; the other statuses stand alone.
const OPEN_LEVEL:Partial<Record<StatusKey,string>>={open1:'أول درجة',open2:'استئناف',open3:'تمييز'};
const PAGE=40;

/**
 * «ملخص الموكلين»: where each client's cases stand, by file status and court level. People who link several client
 * files (an owner of several companies) head their files with totals; the rest of the clients follow in one table.
 */
export default function ClientSummary({records,clients,rules,printedBy,canExport,onOpen}:{records:CaseRecord[];clients:ClientEntity[];rules:Rules;printedBy:string;canExport:boolean;onOpen?:(c:CaseRecord)=>void}){
 const [drill,setDrill]=useState<{title:string;cases:CaseRecord[]}|null>(null),[picked,setPicked]=useState<Set<string>>(()=>new Set()),[mode,setMode]=useState<'people'|'all'>('people'),[q,setQ]=useState(''),[extras,setExtrasRaw]=useState<ExtraGroup[]>(readExtras),[shown,setShown]=useState(PAGE);
 const setExtras=(next:ExtraGroup[])=>{setExtrasRaw(next);try{localStorage.setItem(EXTRAS_KEY,JSON.stringify(next))}catch{/* the choice still holds for this visit */}};
 const today=todayISO();
 const byClient=useMemo(()=>{const m=new Map<string,CaseRecord[]>();for(const c of records){const id=c.clientEntityId;if(!id)continue;const l=m.get(id);if(l)l.push(c);else m.set(id,[c])}return m},[records]);
 const rowOf=useMemo(()=>{const cache=new Map<string,SummaryRow>();return (ids:string[])=>{const k=ids.join(',');let r=cache.get(k);if(!r){r=summarize(ids.flatMap(id=>byClient.get(id)||[]),rules,today);cache.set(k,r)}return r}},[byClient,rules,today]);
 const withCases=useMemo(()=>clients.filter(c=>byClient.has(c.id)),[clients,byClient]);
 const term=normalizeSearch(q);
 const groups=useMemo(()=>personGroups(withCases).map(g=>({...g,row:rowOf(g.clients.map(c=>c.id))}))
  .filter(g=>!term||normalizeSearch(g.person+' '+g.clients.map(c=>c.name).join(' ')).includes(term)).sort((a,b)=>b.row.total-a.row.total),[withCases,rowOf,term]);
 const all=useMemo(()=>withCases.map(c=>({c,row:rowOf([c.id])})).filter(x=>!term||normalizeSearch([x.c.name,...x.c.aliases,...x.c.contacts.map(p=>p.name)].join(' ')).includes(term)).sort((a,b)=>b.row.total-a.row.total||a.c.name.localeCompare(b.c.name,'ar')),[withCases,rowOf,term]);
 // Only the statuses some client in view has, so the table stays narrow.
 const viewRows=mode==='people'?groups.map(g=>g.row):all.map(x=>x.row);
 const cols=STATUS_COLUMNS.filter(([k])=>viewRows.some(r=>r.counts[k]));
 const extraGroups=EXTRA_GROUPS.filter(([k])=>extras.includes(k)).map(([k,l])=>({key:k,label:l,cols:EXTRA_COLUMNS[k]}));
 const extraCols=extraGroups.flatMap(g=>g.cols);
 const grand=rowOf(all.map(x=>x.c.id));
 const openCols=cols.filter(([k])=>OPEN_LEVEL[k]),firstOpen=cols.findIndex(([k])=>OPEN_LEVEL[k]);
 const show=(v:string|number)=>v===0||v===''?'':v;
 // A number opens the cases it counts: `ids` are the client files of the row (one file, or a person's files for a total).
 const open=(ids:string[],name:string,metric:Metric)=>setDrill({title:`${name} · ${METRIC_LABELS[metric]}`,cases:casesFor(ids.flatMap(id=>byClient.get(id)||[]),metric,rules,today)});
 const num=(v:string|number,ids:string[],name:string,metric?:Metric)=>metric&&v&&v!==0?<button type="button" className="sum-num" onClick={()=>open(ids,name,metric)} title={'عرض القضايا: '+(METRIC_LABELS[metric])}>{v}</button>:show(v);
 const cells=(r:SummaryRow,ids:string[],name:string)=><>{cols.map(([k])=><td key={k} className="num">{num(r.counts[k],ids,name,k)}</td>)}
  <td className="num total">{num(r.total,ids,name,'total')}</td>{extraGroups.map(g=>g.cols.map((c,i)=><td key={g.key+c.label} className={(c.kind==='text'?'text':'num')+(i===0?' group-start':'')}>{num(c.get(r),ids,name,c.metric)}</td>))}</>;
 // Two heading rows: groups above (حالة القضايا، متداول، each extra group), their columns below; a lone column spans both.
 const head=(select:React.ReactNode)=><>
  <tr><th rowSpan={2} className="pick">{select}</th><th rowSpan={2} className="name">الموكل</th>
   {cols.map(([k,l],i)=>OPEN_LEVEL[k]?(i===firstOpen?<th key="open" colSpan={openCols.length} className="grp"><span className="dot s-open1"/>متداول</th>:null):<th key={k} rowSpan={2} className="num"><span className={'dot s-'+k}/>{l}</th>)}
   <th rowSpan={2} className="num total">الإجمالي</th>
   {extraGroups.map(g=>g.cols.length===1?<th key={g.key} rowSpan={2} className="grp group-start">{g.label}</th>:<th key={g.key} colSpan={g.cols.length} className="grp group-start">{g.label}</th>)}</tr>
  <tr>{openCols.map(([k])=><th key={k} className="num sub"><span className={'dot s-'+k}/>{OPEN_LEVEL[k]}</th>)}
   {extraGroups.filter(g=>g.cols.length>1).map(g=>g.cols.map((c,i)=><th key={g.key+c.label} className={'num sub'+(i===0?' group-start':'')}>{c.label}</th>))}</tr></>;
 // Fits the screen: the numbers share what the name, date and lawyers leave, so the table never scrolls sideways.
 const SHARE={date:'7%',money:'6.5%',text:'13%'} as const;
 const colgroup=<colgroup><col style={{width:30}}/><col style={{width:'17%'}}/>{cols.map(([k])=><col key={k}/>)}<col/>{extraCols.map(c=><col key={c.label} style={c.kind==='num'?undefined:{width:SHARE[c.kind]}}/>)}</colgroup>;
 // The cases in what is printed, each once: the ticked clients, the people's files, or every client.
 const printedCases=()=>rowOf([...new Set(picked.size?[...picked]:mode==='people'?groups.flatMap(g=>g.clients.map(c=>c.id)):all.map(x=>x.c.id))]).total;
 function print(){
  if(!canExport)return;
  const headers=['الموكل',...cols.map(([k,l])=>OPEN_LEVEL[k]?'متداول · '+OPEN_LEVEL[k]:l),'الإجمالي',...extraGroups.flatMap(g=>g.cols.map(c=>g.cols.length>1?`${g.label}: ${c.label}`:c.label))];
  const line=(name:string,r:SummaryRow)=>[name,...cols.map(([k])=>String(r.counts[k]||'')),String(r.total),...extraCols.map(c=>String(show(c.get(r))))].map(v=>[v||'—',''] as [string,string]);
  // Ticked clients only, when some are ticked; otherwise the whole view.
  const only=picked.size?(id:string)=>picked.has(id):()=>true;
  const body:[string,[string,string][][]][]=picked.size?[['',(()=>{const ids=[...new Set([...groups.flatMap(g=>g.clients.map(c=>c.id)),...all.map(x=>x.c.id)])].filter(only);const list=ids.map(id=>clients.find(c=>c.id===id)!).filter(Boolean);return [...list.map(c=>line(c.name,rowOf([c.id]))),...(list.length>1?[line('الإجمالي',rowOf(ids))]:[])]})()]]
   :mode==='people'?groups.map(g=>[`${g.person} · ${g.row.total} قضية`,[...g.clients.map(c=>line(c.name,rowOf([c.id]))),line('الإجمالي',g.row)]]):[['',[...all.map(x=>line(x.c.name,x.row)),line('الإجمالي',grand)]]];
  if(!printHtml(judgmentRollHtml('ملخص الموكلين',`${picked.size?`الموكلون المحددون: ${picked.size}`:mode==='people'?'حسب الأشخاص المرتبطين بأكثر من ملف':`عدد الموكلين: ${all.length}`} · ${printedCases()} قضية`,headers,body,formatDate(today),printedBy,[16,...cols.map(()=>5),5,...extraCols.map(c=>c.kind==='text'?14:6)],false)))toast.error('اسمح بالنوافذ المنبثقة للطباعة.');
 }
 // One client's full case roll: every case with its numbers, court, sessions and judgment.
 const printClient=(c:ClientEntity)=>{if(!canExport)return;const r=rowOf([c.id]);
  const counts=[...STATUS_COLUMNS.filter(([k])=>r.counts[k]).map(([k,l])=>`${l}: ${r.counts[k]}`),`الإجمالي: ${r.total}`].join('، ');
  if(!printHtml(clientRollHtml(c.name,byClient.get(c.id)||[],false,printedBy,counts)))toast.error('اسمح بالنوافذ المنبثقة للطباعة.')};
 const toggle=(ids:string[],on:boolean)=>setPicked(old=>{const next=new Set(old);for(const id of ids){if(on)next.add(id);else next.delete(id)}return next});
 const table=(rows:{key:string;client:ClientEntity;sub?:string;row:SummaryRow}[],total?:SummaryRow,totalName?:string)=>{const ids=rows.map(x=>x.client.id),every=ids.length>0&&ids.every(id=>picked.has(id));
  return <div className="table-wrap sum-table-wrap"><table className="sum-table">{colgroup}<thead>{head(<input type="checkbox" aria-label="تحديد كل موكلي الجدول" checked={every} onChange={e=>toggle(ids,e.target.checked)}/>)}</thead><tbody>
  {rows.map(x=><tr key={x.key} className={picked.has(x.client.id)?'picked':undefined}><td className="pick"><input type="checkbox" aria-label={'تحديد '+x.client.name} checked={picked.has(x.client.id)} onChange={e=>toggle([x.client.id],e.target.checked)}/></td>
   <th className="name" scope="row"><div className="sum-name"><span title={x.client.name}>{x.client.name}</span>{canExport&&<button type="button" className="sum-row-print" title={'طباعة رول قضايا '+x.client.name} aria-label={'طباعة رول قضايا '+x.client.name} onClick={()=>printClient(x.client)}><Printer size={13}/> طباعة</button>}</div>{x.sub&&<small>{x.sub}</small>}</th>{cells(x.row,[x.client.id],x.client.name)}</tr>)}
  {total&&<tr className="sum-total"><td className="pick"/><th className="name" scope="row">الإجمالي</th>{cells(total,ids,totalName||'الإجمالي')}</tr>}</tbody></table></div>};
 return <section className="panel desk-panel client-summary">
  <div className="sum-toolbar">
   <div className="sum-mode" role="group" aria-label="طريقة العرض"><button type="button" aria-pressed={mode==='people'} onClick={()=>setMode('people')}><Users size={15}/> حسب الأشخاص</button><button type="button" aria-pressed={mode==='all'} onClick={()=>setMode('all')}><Building2 size={15}/> كل الموكلين</button></div>
   <label className="searchbox sum-search"><Search size={16}/><input aria-label="بحث في الملخص" placeholder="ابحث باسم شخص أو موكل…" value={q} onChange={e=>{setQ(e.target.value);setShown(PAGE)}}/></label>
   {canExport&&<div className="sum-print">{picked.size>0&&<button type="button" className="btn" onClick={()=>setPicked(new Set())}>إلغاء التحديد</button>}
    <button type="button" className={'btn'+(picked.size?' primary':'')} onClick={print}><Printer size={15}/> {picked.size?`طباعة المحدد (${picked.size})`:'طباعة الملخص'}</button></div>}
  </div>
  <div className="sum-extras" role="group" aria-label="معلومات إضافية في الجدول"><span>أعمدة إضافية:</span>{EXTRA_GROUPS.map(([k,l])=><button type="button" key={k} className="chip" aria-pressed={extras.includes(k)} onClick={()=>setExtras(extras.includes(k)?extras.filter(x=>x!==k):[...extras,k])}>{l}</button>)}</div>
  <div className="sum-legend" aria-hidden>{STATUS_COLUMNS.map(([k,l])=><span key={k}><i className={'dot s-'+k}/>{l}</span>)}</div>
  {mode==='people'?(groups.length?groups.map(g=><article className="sum-group" key={g.person}>
    <header><div><h3>{g.person}</h3><small>ملفات الموكلين: {g.clients.length}</small></div>
     <dl className="sum-kpis"><div><dt>القضايا</dt><dd>{g.row.total}</dd></div><div><dt>مفتوحة</dt><dd>{g.row.open}</dd></div><div><dt>جلسات ٣٠ يوماً</dt><dd>{g.row.next30}</dd></div><div><dt>ضمن مهلة الطعن</dt><dd>{g.row.appealOpen}</dd></div></dl></header>
    <StatusBar row={g.row}/>
    {table(g.clients.map(c=>({key:c.id,client:c,sub:c.contacts.filter(p=>p.name).length?`الأشخاص المرتبطون: ${c.contacts.filter(p=>p.name).length}`:undefined,row:rowOf([c.id])})),g.row,g.person)}
   </article>):<Empty title="لا أشخاص مرتبطون بأكثر من ملف" text="أضف الأشخاص في ملف كل موكل (الملاك، الممثلون)؛ من يظهر في أكثر من ملف يُجمع هنا تحت اسمه. أو اعرض كل الموكلين."/>)
  :(all.length?<article className="sum-group"><header><div><h3>كل الموكلين</h3><small>عدد الموكلين: {all.length}</small></div>
     <dl className="sum-kpis"><div><dt>القضايا</dt><dd>{grand.total}</dd></div><div><dt>مفتوحة</dt><dd>{grand.open}</dd></div><div><dt>جلسات ٣٠ يوماً</dt><dd>{grand.next30}</dd></div><div><dt>ضمن مهلة الطعن</dt><dd>{grand.appealOpen}</dd></div></dl></header>
    <StatusBar row={grand}/>
    {table(all.slice(0,shown).map(x=>({key:x.c.id,client:x.c,row:x.row})),grand,'كل الموكلين')}
    {all.length>shown&&<button type="button" className="btn sum-more" onClick={()=>setShown(s=>s+PAGE)}>عرض المزيد ({all.length-shown} متبقٍ)</button>}
   </article>:<Empty/>)}
 {drill&&<Dialog open onOpenChange={o=>{if(!o)setDrill(null)}}><DialogContent dir="rtl" className="office-dialog roll-dialog sum-drill">
   <DialogHeader><DialogTitle>{drill.title}</DialogTitle><DialogDescription>{drill.cases.length} قضية · اضغط القضية لفتحها.</DialogDescription></DialogHeader>
   {canExport&&!!drill.cases.length&&<div className="actions"><button type="button" className="btn" onClick={()=>{if(!printHtml(clientRollHtml(drill.title,drill.cases,false,printedBy)))toast.error('اسمح بالنوافذ المنبثقة للطباعة.')}}><Printer size={15}/> طباعة هذه القضايا</button></div>}
   {drill.cases.length?<div className="table-wrap sum-drill-list"><table className="office-table"><thead><tr><th>الكود</th><th>الرقم الآلي</th><th>الموكل / الخصم</th><th>المحكمة</th><th>آخر قرار</th><th>الجلسة القادمة</th><th>حالة الملف</th></tr></thead>
    <tbody>{drill.cases.map(c=>{const l=lastSitting(c),n=nextSitting(c);return <tr key={c.id} className={onOpen?'clickable':undefined} onClick={()=>{if(onOpen){setDrill(null);onOpen(c)}}}>
     <td className="mono"><b>{c.code||'—'}</b></td><td className="mono">{c.autoNumber||'—'}</td><td>{c.clientEntityName||c.client||'—'}<small className="muted" style={{display:'block'}}>ضد {c.opponent||'—'}</small></td>
     <td>{String(l?.court||c.court||'—')}</td><td>{String(l?.decision||l?.text||'—')}</td><td className="mono">{n?formatDate(n):'—'}</td><td>{String(c.legacyStatus||(c.archived?'مؤرشف':'—'))}</td></tr>})}</tbody></table></div>:<Empty/>}
  </DialogContent></Dialog>}
 </section>;
}

function StatusBar({row}:{row:SummaryRow}){
 if(!row.total)return null;
 return <div className="sum-bar" role="img" aria-label={STATUS_COLUMNS.filter(([k])=>row.counts[k]).map(([k,l])=>`${l}: ${row.counts[k]}`).join('، ')}>
  {STATUS_COLUMNS.filter(([k])=>row.counts[k]).map(([k,l])=><span key={k} className={'s-'+k} style={{flexGrow:row.counts[k]}} title={`${l}: ${row.counts[k]}`}>{row.counts[k]/row.total>0.07?row.counts[k]:''}</span>)}</div>;
}
