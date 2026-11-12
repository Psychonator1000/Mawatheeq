'use client';
import {useEffect,useMemo,useState} from 'react';
import {type CaseRecord,formatDate,todayISO,caseCode} from '@/lib/domain';
import {clientName,tidyName} from '@/lib/clients';
import {daysAr} from '@/lib/case-line';
import {PulseStrip,PulseTile} from './pulse';
import {normalizeSearch} from '@/lib/case-browse';
import {type OfficeData,type Review,type ReviewScope,type ReviewStatus,SCOPE_LABELS,REVIEW_LABELS,reviewStatus,workBucket} from '@/lib/office';
import {OfficeSelect,ReviewBadge,officeTime} from './office-shared';
import {Field,Empty} from './shared';
import PageNavigation from './page-navigation';

export type ReviewSelection={scope:ReviewScope;status:ReviewStatus|''};
export function OfficeSummary({records,data,onReview,onWork}:{records:CaseRecord[];data:OfficeData;onReview:(selection:ReviewSelection)=>void;onWork:()=>void}) {
 const active=records.filter(c=>!c.archived),approved=active.filter(c=>reviewStatus(c,data.reviews,'judgment')==='verified').length,announced=active.filter(c=>reviewStatus(c,data.reviews,'announcement')==='verified').length;
 const today=todayISO(),attention=data.work.filter(w=>['overdue','today'].includes(workBucket(w,today))).length;
 const verification=data.context.permissions.sections.includes('verification'),work=data.context.permissions.sections.includes('work');
 if(!verification&&!work)return null;
 return <section className="office-summary" aria-label="التحقق وأعمال المكتب"><div><h2>وضوح البيانات والمتابعة</h2><p>الأعداد تخص السجلات النشطة المتاحة لك. الاعتماد أدناه مراجعة بشرية موثقة بالمصدر، ولا ينشأ من إدخال تاريخ أو ملاحظة.</p></div><div className="office-cards">{verification&&<><button className="office-card" onClick={()=>onReview({scope:'judgment',status:'verified'})}><span>بيانات أحكام معتمدة بالمراجعة</span><b>{approved}<small> من {active.length}</small></b></button><button className="office-card" onClick={()=>onReview({scope:'judgment',status:''})}><span>مركز التحقق من القضايا</span><b>{active.length-approved}<small> لم تعتمد حالياً</small></b></button><button className="office-card" onClick={()=>onReview({scope:'announcement',status:'verified'})}><span>إعلانات تنفيذ معتمدة بالمراجعة</span><b>{announced}</b></button></>}{work&&<button className="office-card" onClick={onWork}><span>أعمال اليوم والمتأخرة</span><b>{attention}</b></button>}</div><small className="muted">آخر تحديث للمراجعات: {officeTime(data.loadedAt)}</small></section>;
}
export default function OfficeVerification({records,data,initial,onOpenCase}:{records:CaseRecord[];data:OfficeData;initial:ReviewSelection;onOpenCase:(record:CaseRecord)=>void}) {
 const [scope,setScope]=useState<ReviewScope>(initial.scope),[status,setStatus]=useState<string>(initial.status),[search,setSearch]=useState(''),[recorded,setRecorded]=useState(''),[who,setWho]=useState(''),[page,setPage]=useState(1),today=todayISO();
 // The latest review of each case in this scope: who decided what, and when.
 const latest=useMemo(()=>{const m=new Map<string,Review>();for(const r of data.reviews)if(r.scope===scope){const p=m.get(r.caseId);if(!p||r.id>p.id)m.set(r.caseId,r)}return m},[data.reviews,scope]);
 const active=useMemo(()=>records.filter(c=>!c.archived).map(record=>({record,status:reviewStatus(record,data.reviews,scope)})),[records,data.reviews,scope]);
 const hasDate=(c:CaseRecord)=>!!String(c.notificationDate||'').trim();
 const filtered=active.filter(x=>(!status||x.status===status)&&(!recorded||((recorded==='yes')===hasDate(x.record)))&&(!who||latest.get(x.record.id)?.reviewer===who)&&normalizeSearch([x.record.code,x.record.autoNumber,clientName(x.record),x.record.opponent].join(' ')).includes(normalizeSearch(search)));
 // eslint-disable-next-line react-hooks/set-state-in-effect -- back to the first page when the filters change
 useEffect(()=>setPage(1),[scope,status,search,recorded,who]);
 const pages=Math.max(1,Math.ceil(filtered.length/20)),current=Math.min(page,pages);
 const tone:Record<ReviewStatus,'green'|'amber'|'red'|'grey'>={verified:'green',outdated:'amber',needs_review:'red',unreviewed:'grey'};
 const reviewers=[...new Set([...latest.values()].map(r=>r.reviewer))].map(r=>[r,[...latest.values()].filter(x=>x.reviewer===r).length] as const).sort((a,b)=>b[1]-a[1]),tones=['brand','blue','amber','green'] as const;
 const age=(d:string)=>d?Math.round((Date.parse(today)-Date.parse(d))/864e5):-1;
 const story=(c:CaseRecord,s:ReviewStatus)=>{const r=latest.get(c.id),d=scope==='judgment'?c.date:c.notificationDate,n=age(d);
  return [r?(s==='verified'?'اعتمدها ':s==='needs_review'?'طلب مراجعتها ':'تغيّر السجل بعد اعتماد ')+r.reviewer+' في '+formatDate(r.createdAt.slice(0,10)):'لم يراجعها أحد بعد',
   r?.details.notes&&s!=='verified'?r.details.notes:'',
   scope==='announcement'?(hasDate(c)?'تاريخ الإعلان مسجل':'لا تاريخ إعلان مسجل'):n>=0?'الحكم منذ '+daysAr(n,true):'بلا تاريخ حكم'].filter(Boolean).join(' · ')};
 const stat=(k:ReviewStatus)=>({label:REVIEW_LABELS[k],value:active.filter(x=>x.status===k).length,tone:tone[k],on:status===k,onClick:()=>{setStatus(status===k?'':k)}});
 return <div className="list-desk"><div className="page-head"><div><div className="eyebrow">CASE / VERIFICATION</div><h1>التحقق من القضايا</h1><p className="subtitle">راجع مصدر كل سجل من داخل ملفه. اعتماد بيانات الحكم واعتماد إعلان التنفيذ قراران مستقلان.</p></div></div><div className="notice">المراجعة مسؤولية المراجع الذي يطابق المصدر. هذه الحالة لا تعني اتصالاً تلقائياً بالمحكمة أو تأكيداً آلياً لصحة الإعلان قانوناً. رفع PDF اختياري.</div><div className="office-toolbar"><OfficeSelect label="ما الذي نتحقق منه؟" value={scope} onChange={v=>{setScope(v as ReviewScope);setRecorded('');setStatus('');setWho('')}} options={Object.entries(SCOPE_LABELS)}/><Field label="البحث عن سجل للمراجعة" value={search} onChange={setSearch}/></div>
 <PulseStrip label="ملخص التحقق">
  <PulseTile title={SCOPE_LABELS[scope]} value={active.length?Math.round(active.filter(x=>x.status==='verified').length/active.length*100)+'%':'—'} sub="معتمدة بالمراجعة" parts={(['verified','outdated','needs_review','unreviewed'] as ReviewStatus[]).map(stat)}/>
  {scope==='announcement'?<PulseTile title="تاريخ الإعلان في القضية" parts={[{label:'يوجد تاريخ مسجل',value:active.filter(x=>hasDate(x.record)).length,tone:'green',on:recorded==='yes',onClick:()=>setRecorded(recorded==='yes'?'':'yes')},{label:'لا يوجد تاريخ مسجل',value:active.filter(x=>!hasDate(x.record)).length,tone:'grey',on:recorded==='no',onClick:()=>setRecorded(recorded==='no'?'':'no')}]}/>
   :<PulseTile title="عمر الحكم" parts={[{label:'خلال 30 يوماً',value:active.filter(x=>{const n=age(x.record.date);return n>=0&&n<=30}).length,tone:'red'},{label:'حتى 90 يوماً',value:active.filter(x=>{const n=age(x.record.date);return n>30&&n<=90}).length,tone:'amber'},{label:'أقدم',value:active.filter(x=>age(x.record.date)>90).length,tone:'green'},{label:'بلا تاريخ',value:active.filter(x=>age(x.record.date)<0).length,tone:'grey'}]}/>}
  {!!reviewers.length&&<PulseTile title="المراجِعون" parts={reviewers.slice(0,4).map(([r,n],k)=>({label:r||'—',value:n,tone:tones[k],on:who===r,onClick:()=>setWho(who===r?'':r)}))}/>}
 </PulseStrip>
 <section className="panel list-desk-panel"><div className="panel-head"><h2>{SCOPE_LABELS[scope]} · {filtered.length.toLocaleString('en')} سجل</h2><p className="panel-note">يشمل السجلات النشطة؛ افتح الأرشيف من سجل الأحكام لمراجعة تاريخه. وجود تاريخ الإعلان وحده لا يمنحه حالة الاعتماد.</p></div>
 {!filtered.length?<Empty/>:<ul className="story-list verify-lines" aria-label={SCOPE_LABELS[scope]}><li className="story-head" aria-hidden><span>الكود / الرقم الآلي</span><span>الموكل والخصم</span><span>{scope==='judgment'?'تاريخ الحكم':'إعلان الصيغة'}</span><span>التحقق</span><span>باختصار</span><span/></li>
  {filtered.slice((current-1)*20,current*20).map(({record:c,status:s})=><li key={c.id}><div className={'story-row e-'+tone[s]}>
   <span><b className="nowrap">{caseCode(c)||'—'}</b> <small className="muted nowrap">{c.autoNumber||'بلا رقم آلي'}</small></span>
   <span><b>{tidyName(clientName(c))}</b> <small className="muted">ضد {tidyName(c.opponent)||'—'}</small></span>
   <span className="story-num">{formatDate(scope==='judgment'?c.date:c.notificationDate)||'—'}</span>
   <span><ReviewBadge status={s}/></span>
   <span className="line-story">{story(c,s)}</span>
   <button className="btn" onClick={()=>onOpenCase(c)}>فتح التحقق</button></div></li>)}</ul>}
 <PageNavigation page={current} pages={pages} total={filtered.length} onChange={setPage}/></section></div>;
}
