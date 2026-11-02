'use client';
import {useMemo,useState} from 'react';
import {Printer,Search,Users,Building2} from 'lucide-react';
import {toast} from 'sonner';
import {type CaseRecord,type Rules,formatDate,todayISO} from '@/lib/domain';
import type {ClientEntity} from '@/lib/clients';
import {normalizeSearch} from '@/lib/case-browse';
import {STATUS_COLUMNS,EXTRA_GROUPS,personGroups,summarize,type ExtraGroup,type SummaryRow,type StatusKey} from '@/lib/client-summary';
import {judgmentRollHtml,printHtml} from '@/lib/print';
import {Empty} from './shared';

const EXTRAS_KEY='mawatheeq.clientSummary.extras';
const readExtras=():ExtraGroup[]=>{try{const v=JSON.parse(localStorage.getItem(EXTRAS_KEY)||'null');return Array.isArray(v)?v.filter(x=>EXTRA_GROUPS.some(([k])=>k===x)):['sessions','judgments']}catch{return ['sessions','judgments']}};
const EXTRA_COLUMNS:Record<ExtraGroup,[string,(r:SummaryRow)=>string|number][]>={
 sessions:[['جلسات ٧ أيام',r=>r.next7],['جلسات ٣٠ يوماً',r=>r.next30],['أقرب جلسة',r=>r.nextDate?formatDate(r.nextDate):'']],
 judgments:[['لصالحنا',r=>r.won],['غير صالحنا',r=>r.lost],['ضمن مهلة الطعن',r=>r.appealOpen]],
 contracts:[['بلا عقد',r=>r.noContract],['الأتعاب (د.ك)',r=>r.fees?r.fees.toLocaleString('en-US',{maximumFractionDigits:3}):'']],
 lawyers:[['المحامون',r=>r.lawyers.slice(0,3).map(([n,c])=>`${n} (${c})`).join('، ')]],
};
const PAGE=40;

/**
 * «ملخص الموكلين»: where each client's cases stand, by file status and court level. People who link several client
 * files (an owner of several companies) head their files with totals; the rest of the clients follow in one table.
 */
export default function ClientSummary({records,clients,rules,printedBy,canExport}:{records:CaseRecord[];clients:ClientEntity[];rules:Rules;printedBy:string;canExport:boolean}){
 const [mode,setMode]=useState<'people'|'all'>('people'),[q,setQ]=useState(''),[extras,setExtrasRaw]=useState<ExtraGroup[]>(readExtras),[shown,setShown]=useState(PAGE);
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
 const extraCols=EXTRA_GROUPS.filter(([k])=>extras.includes(k)).flatMap(([k])=>EXTRA_COLUMNS[k]);
 const grand=rowOf(all.map(x=>x.c.id));
 // Shade each count against the largest in its column, so the heavy files stand out.
 const max=Object.fromEntries(STATUS_COLUMNS.map(([k])=>[k,Math.max(1,...all.map(x=>x.row.counts[k]))])) as Record<StatusKey,number>;
 const cells=(r:SummaryRow,strong=false)=><>{cols.map(([k])=>{const v=r.counts[k];return <td key={k} className={'num'+(v?'':' zero')} style={v&&!strong?{['--heat' as string]:String(Math.min(1,v/max[k]))}:undefined}>{v||'·'}</td>})}
  <td className="num total">{r.total}</td>{extraCols.map(([label,get])=>{const v=get(r);return <td key={label} className={typeof v==='number'?'num'+(v?'':' zero'):'text'}>{v===0?'·':v||'—'}</td>})}</>;
 const head=<tr><th className="name">الموكل</th>{cols.map(([k,l])=><th key={k} className="num"><span className={'dot s-'+k}/>{l}</th>)}<th className="num">الإجمالي</th>{extraCols.map(([l])=><th key={l} className="num">{l}</th>)}</tr>;
 function print(){
  if(!canExport)return;
  const headers=['الموكل',...cols.map(([,l])=>l),'الإجمالي',...extraCols.map(([l])=>l)];
  const line=(name:string,r:SummaryRow)=>[name,...cols.map(([k])=>String(r.counts[k]||'')),String(r.total),...extraCols.map(([,g])=>String(g(r)||''))].map(v=>[v||'—',''] as [string,string]);
  const body:[string,[string,string][][]][]=mode==='people'?groups.map(g=>[`${g.person} · ${g.row.total} قضية`,[...g.clients.map(c=>line(c.name,rowOf([c.id]))),line('الإجمالي',g.row)]]):[['',[...all.map(x=>line(x.c.name,x.row)),line('الإجمالي',grand)]]];
  if(!printHtml(judgmentRollHtml('ملخص الموكلين',mode==='people'?'حسب الأشخاص المرتبطين بأكثر من ملف':`عدد الموكلين: ${all.length}`,headers,body,formatDate(today),printedBy,[16,...cols.map(()=>5),5,...extraCols.map(([l])=>l==='المحامون'?14:6)])))toast.error('اسمح بالنوافذ المنبثقة للطباعة.');
 }
 const table=(rows:{key:string;name:string;sub?:string;row:SummaryRow}[],total?:SummaryRow)=><div className="table-wrap sum-table-wrap"><table className="sum-table"><thead>{head}</thead><tbody>
  {rows.map(x=><tr key={x.key}><th className="name" scope="row">{x.name}{x.sub&&<small>{x.sub}</small>}</th>{cells(x.row)}</tr>)}
  {total&&<tr className="sum-total"><th className="name" scope="row">الإجمالي</th>{cells(total,true)}</tr>}</tbody></table></div>;
 return <section className="panel desk-panel client-summary">
  <div className="sum-toolbar">
   <div className="sum-mode" role="group" aria-label="طريقة العرض"><button type="button" aria-pressed={mode==='people'} onClick={()=>setMode('people')}><Users size={15}/> حسب الأشخاص</button><button type="button" aria-pressed={mode==='all'} onClick={()=>setMode('all')}><Building2 size={15}/> كل الموكلين</button></div>
   <label className="searchbox sum-search"><Search size={16}/><input aria-label="بحث في الملخص" placeholder="ابحث باسم شخص أو موكل…" value={q} onChange={e=>{setQ(e.target.value);setShown(PAGE)}}/></label>
   {canExport&&<button type="button" className="btn" onClick={print}><Printer size={15}/> طباعة الملخص</button>}
  </div>
  <div className="sum-extras" role="group" aria-label="معلومات إضافية في الجدول"><span>أعمدة إضافية:</span>{EXTRA_GROUPS.map(([k,l])=><button type="button" key={k} className="chip" aria-pressed={extras.includes(k)} onClick={()=>setExtras(extras.includes(k)?extras.filter(x=>x!==k):[...extras,k])}>{l}</button>)}</div>
  <div className="sum-legend" aria-hidden>{STATUS_COLUMNS.map(([k,l])=><span key={k}><i className={'dot s-'+k}/>{l}</span>)}</div>
  {mode==='people'?(groups.length?groups.map(g=><article className="sum-group" key={g.person}>
    <header><div><h3>{g.person}</h3><small>ملفات الموكلين: {g.clients.length}</small></div>
     <dl className="sum-kpis"><div><dt>القضايا</dt><dd>{g.row.total}</dd></div><div><dt>مفتوحة</dt><dd>{g.row.open}</dd></div><div><dt>جلسات ٣٠ يوماً</dt><dd>{g.row.next30}</dd></div><div><dt>ضمن مهلة الطعن</dt><dd>{g.row.appealOpen}</dd></div></dl></header>
    <StatusBar row={g.row}/>
    {table(g.clients.map(c=>({key:c.id,name:c.name,sub:c.contacts.filter(p=>p.name).length?`الأشخاص المرتبطون: ${c.contacts.filter(p=>p.name).length}`:undefined,row:rowOf([c.id])})),g.row)}
   </article>):<Empty title="لا أشخاص مرتبطون بأكثر من ملف" text="أضف الأشخاص في ملف كل موكل (الملاك، الممثلون)؛ من يظهر في أكثر من ملف يُجمع هنا تحت اسمه. أو اعرض كل الموكلين."/>)
  :(all.length?<article className="sum-group"><header><div><h3>كل الموكلين</h3><small>عدد الموكلين: {all.length}</small></div>
     <dl className="sum-kpis"><div><dt>القضايا</dt><dd>{grand.total}</dd></div><div><dt>مفتوحة</dt><dd>{grand.open}</dd></div><div><dt>جلسات ٣٠ يوماً</dt><dd>{grand.next30}</dd></div><div><dt>ضمن مهلة الطعن</dt><dd>{grand.appealOpen}</dd></div></dl></header>
    <StatusBar row={grand}/>
    {table(all.slice(0,shown).map(x=>({key:x.c.id,name:x.c.name,row:x.row})),grand)}
    {all.length>shown&&<button type="button" className="btn sum-more" onClick={()=>setShown(s=>s+PAGE)}>عرض المزيد ({all.length-shown} متبقٍ)</button>}
   </article>:<Empty/>)}
 </section>;
}

function StatusBar({row}:{row:SummaryRow}){
 if(!row.total)return null;
 return <div className="sum-bar" role="img" aria-label={STATUS_COLUMNS.filter(([k])=>row.counts[k]).map(([k,l])=>`${l}: ${row.counts[k]}`).join('، ')}>
  {STATUS_COLUMNS.filter(([k])=>row.counts[k]).map(([k,l])=><span key={k} className={'s-'+k} style={{flexGrow:row.counts[k]}} title={`${l}: ${row.counts[k]}`}>{row.counts[k]/row.total>0.07?row.counts[k]:''}</span>)}</div>;
}
