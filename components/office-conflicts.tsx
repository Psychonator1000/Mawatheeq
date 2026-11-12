'use client';
import {useMemo,useState} from 'react';
import {partyMatches} from '@/lib/case-browse';
import {type CaseRecord,formatDate,caseCode} from '@/lib/domain';
import {type ClientEntity,clientName,tidyName} from '@/lib/clients';
import {PulseStrip,PulseTile} from './pulse';
import {Field,Empty} from './shared';
import PageNavigation from './page-navigation';

export default function OfficeConflicts({records,clients,onOpenCase}:{records:CaseRecord[];clients:ClientEntity[];onOpenCase:(record:CaseRecord)=>void}) {
 const [query,setQuery]=useState(''),[role,setRole]=useState(''),[state,setState]=useState(''),[page,setPage]=useState(1);
 const all=useMemo(()=>partyMatches(records,clients,query),[records,clients,query]);
 const roles=[...new Set(all.flatMap(m=>m.matches.map(x=>x.role)))].map(r=>[r,all.filter(m=>m.matches.some(x=>x.role===r)).length] as const).sort((a,b)=>b[1]-a[1]);
 const matches=all.filter(m=>(!role||m.matches.some(x=>x.role===role))&&(!state||(state==='archived')===!!m.record.archived));
 const pages=Math.max(1,Math.ceil(matches.length/20)),current=Math.min(page,pages),reset=()=>setPage(1);
 // Found as an opponent is what a new file must be weighed against; as the client, the office already acts for them.
 const roleTone=(r:string)=>r==='خصم'?'red' as const:r==='موكل'||r==='صيغة أصلية للموكل'?'green' as const:'blue' as const;
 return <><div className="page-head"><div><div className="eyebrow">OFFICE / PARTIES</div><h1>فحص الأطراف</h1><p className="subtitle">ابحث عن اسم قبل قبول ملف جديد، وشاهد ارتباطاته بالقضايا الحالية والمؤرشفة.</p></div></div><section className="panel"><div className="panel-body"><div className="notice">فحص أولي لتشابه الأسماء، وليس قراراً بشأن تعارض المصالح. قد يتشابه اسمان لشخصين مختلفين أو يرد الاسم بصيغة غير مسجلة؛ طابق الهوية والصفة يدوياً. لا تُدمج الجهات بسبب تشابه ممثليها.</div><Field label="اسم الطرف أو الجهة المراد فحصها" value={query} onChange={value=>{setQuery(value);setRole('');setState('');reset()}} placeholder="حرفان على الأقل، ويفضل الاسم الكامل"/><p className="subtitle">يشمل أسماء الخصوم والموكلين وصيغهم السابقة والأشخاص المرتبطين بهم والشخص المعني بكل قضية.</p></div>
 {!!all.length&&<PulseStrip label="ملخص الفحص">
  <PulseTile title="صلة الاسم بالقضايا" value={all.length} sub="قضية فيها الاسم" parts={roles.map(([r,n])=>({label:r,value:n,tone:roleTone(r),on:role===r,onClick:()=>{setRole(role===r?'':r);reset()}}))}/>
  <PulseTile title="حالة القضايا" parts={[{label:'نشطة',value:all.filter(m=>!m.record.archived).length,tone:'amber',on:state==='active',onClick:()=>{setState(state==='active'?'':'active');reset()}},{label:'مؤرشفة',value:all.filter(m=>m.record.archived).length,tone:'grey',on:state==='archived',onClick:()=>{setState(state==='archived'?'':'archived');reset()}}]}/>
 </PulseStrip>}
 {!matches.length?<Empty title={query.trim().length<2?'أدخل اسم الطرف':all.length?'لا قضايا بهذا التصنيف':'لم نعثر على تطابق نصي'} text={query.trim().length<2?'تظهر القضايا والأدوار المرتبطة بالاسم هنا.':all.length?'اضغط التصنيف المختار مرة أخرى لإلغائه.':'جرّب الصيغ الأخرى للاسم. غياب التطابق لا يعني خلو تعارض المصالح.'}/>
 :<ul className="story-list party-lines" aria-label="القضايا المطابقة"><li className="story-head" aria-hidden><span>القضية</span><span>الاسم المطابق وصلته</span><span>الموكل والخصم</span><span>التاريخ</span><span/></li>
  {matches.slice((current-1)*20,current*20).map(({record:c,matches:found})=><li key={c.id}><div className={'story-row e-'+(c.archived?'grey':found.some(m=>m.role==='خصم')?'red':'green')}>
   <span><b className="nowrap">{caseCode(c)||c.autoNumber||'بلا كود'}</b> <small className="muted">{c.archived?'مؤرشفة':'نشطة'}</small></span>
   <span className="party-found">{found.map((m,i)=><span key={i}><b>{m.name}</b> <span className={'tag '+roleTone(m.role)}>{m.role}</span></span>)}</span>
   <span><b>{tidyName(clientName(c))}</b> <small className="muted">ضد {tidyName(c.opponent)||'—'}</small></span>
   <span className="story-num">{formatDate(c.date)||'—'}</span>
   <button className="btn" onClick={()=>onOpenCase(c)}>فتح القضية</button></div></li>)}</ul>}
 <PageNavigation page={current} pages={pages} total={matches.length} onChange={setPage}/></section></>;
}
