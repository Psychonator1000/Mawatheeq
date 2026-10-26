'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Undo2,X,Search} from 'lucide-react';
import {toast} from 'sonner';
import {departmentRequest} from '@/lib/local-auth';
import {PAPER_FILES_EVENT,contentItems,daysBetween,type DeskFile,type HeldFile,type MyPaperFiles,type MyRequest} from '@/lib/archive';
import {normalizeSearch} from '@/lib/case-browse';
import {formatDate,todayISO} from '@/lib/domain';
import {officeTime} from './office-shared';
import {Empty} from './shared';

type Step={id:string;type:string;date:string;holder:string;toState:string;purpose:string;notes:string;at:string;by:string;location:string;returnCheck?:string;missing?:string;missingResolvedAt?:string;missingResolution?:string};
type Handout=HeldFile&{current:boolean;steps:Step[];contents?:string;pages?:string;receivedMissing?:string;rejections?:{at:string;by:string;reason:string;claimedAt:string}[]};
type Req=MyRequest&{removed?:boolean;movementId?:string|null};
type Journeys={handouts:Handout[];requests:Req[]};
type Stage='requested'|'ready'|'marked'|'declined'|'awaiting'|'with'|'reported'|'away'|'short'|'complete';
type Journey={key:string;file:DeskFile;request:Req|null;handout:Handout|null;stage:Stage;last:string};
type Point={label:string;when:string;detail?:string;state:'done'|'now'|'next'|'warn'};
type Filter='open'|'mine'|'complete'|'all';

const desk=<T,>(action:string,data:Record<string,unknown>={})=>departmentRequest<T>(action,{...data,workspace:'archive'});
const STAGES:Record<Stage,[string,string]>={requested:['طلبتَه · بانتظار الأرشيف','amber'],ready:['جاهز للتسليم','green'],marked:['عُلّم «سُلّم» · أكّد الاستلام','red'],declined:['اعتذر الأرشيف','red'],
 awaiting:['بانتظار استلامك','amber'],short:['عاد ناقصاً · بانتظار التسوية','red'],with:['معك','green'],reported:['أبلغت بإرجاعه · بانتظار الأرشيف','amber'],away:['خارج الأرشيف','wine'],complete:['اكتملت · الملف في الأرشيف','']};
const OPEN:Stage[]=['requested','ready','marked','awaiting','with','reported','away','short'];
const caseLine=(f:DeskFile)=>[f.caseCode&&'كود '+f.caseCode,[f.client,f.opponent].filter(Boolean).join(' ضد ')].filter(Boolean).join(' · ');
const ON:Record<string,string>={court:'أُرسل إلى',client:'سُلّم للموكل',move:'نُقل إلى موقع آخر',checkout:'سُلّم إلى',audit:'جُرد'};

/** A file's journey with you: one card from your request until the file is back on the archive's shelf, every step dated. */
function journeysOf(d:Journeys):Journey[]{
 const out:Journey[]=[];
 for(const h of d.handouts){const r=d.requests.find(x=>x.movementId===h.movementId)||null,back=h.steps.find(s=>s.toState==='in');
  const stage:Stage=back?(back.returnCheck==='missing'&&!back.missingResolvedAt?'short':'complete'):!h.current?'away':h.receipt==='pending'?'awaiting':h.returnClaimedAt?'reported':'with';
  out.push({key:h.movementId,file:h,request:r,handout:h,stage,last:back?.at||h.steps.at(-1)?.at||h.returnClaimedAt||h.receivedAt||h.sentAt})}
 for(const r of d.requests)if(!r.movementId&&!r.removed){const stage:Stage=r.status==='pending'?'requested':r.status==='ready'?'ready':r.status==='declined'?'declined':'marked';
  out.push({key:r.id,file:r,request:r,handout:null,stage,last:r.updatedAt})}
 return out.sort((a,b)=>Number(OPEN.includes(b.stage))-Number(OPEN.includes(a.stage))||b.last.localeCompare(a.last));
}

function pointsOf(j:Journey,today:string):Point[]{
 const p:Point[]=[],r=j.request,h=j.handout;
 if(r)p.push({label:'طلبتَ الملف',when:officeTime(r.createdAt),detail:[r.purpose,r.neededBy&&'مطلوب '+formatDate(r.neededBy)].filter(Boolean).join(' · '),state:'done'});
 if(!h){
  if(r?.status==='declined')p.push({label:r.decisionNote==='ألغاه مقدّم الطلب'?'ألغيتَ الطلب':'اعتذر الأرشيف',when:officeTime(r.updatedAt),detail:r.decisionNote===  'ألغاه مقدّم الطلب'?'':r.decisionNote,state:'warn'});
  else if(r?.status==='done'){p.push({label:'علّمه الأرشيف «سُلّم»',when:officeTime(r.updatedAt),detail:'إن كانت الأوراق معك فاضغط «استلمت» لتبدأ عهدتها باسمك.',state:'warn'});p.push({label:'تستلمه',when:'',state:'now'},{label:'يعود إلى الأرشيف',when:'',state:'next'})}
  else{p.push({label:r?.status==='ready'?'جهّزه الأرشيف':'بانتظار تجهيز الأرشيف',when:r?.status==='ready'?officeTime(r.updatedAt):'',state:r?.status==='ready'?'done':'now'});
   p.push({label:'يرسله الأرشيف إليك',when:'',state:'next'},{label:'تستلمه',when:'',state:'next'},{label:'يعود إلى الأرشيف',when:'',state:'next'})}
  return p;
 }
 const late=!!h.dueDate&&h.dueDate<today&&j.stage!=='complete';
 p.push({label:'أرسله الأرشيف إليك',when:formatDate(h.date),detail:['من '+h.sentBy,h.purpose,h.dueDate&&(late?`متأخر ${daysBetween(h.dueDate,today)} يوم عن موعد الإعادة`:'الإعادة '+formatDate(h.dueDate))].filter(Boolean).join(' · '),state:'done'});
 const sent=[h.pages&&h.pages+' ورقة',contentItems(h.contents).join('، ')].filter(Boolean).join(' · ');
 p.push(h.receivedAt?{label:'استلمتَه',when:officeTime(h.receivedAt),detail:[sent&&'مع: '+sent,h.receivedMissing&&'أفدت بنقص: '+h.receivedMissing].filter(Boolean).join(' · '),state:h.receivedMissing?'warn':'done'}
  :h.receipt==='pending'&&h.current?{label:'بانتظار استلامك',when:'',detail:(sent?'خرج مع: '+sent+'. ':'')+'اضغط «استلمت» عند تسلّم الأوراق، أو «ناقص شيء؟» إن نقص منها شيء.',state:'now'}:{label:'استلمتَه',when:'سُلّم دون تأكيد',state:'done'});
 const back=h.steps.find(s=>s.toState==='in');
 for(const s of h.steps)if(s!==back)p.push({label:(ON[s.type]||'حركة')+(s.type==='court'||s.type==='checkout'?' '+s.holder:''),when:formatDate(s.date),detail:['سجّلها '+s.by,s.purpose].filter(Boolean).join(' · '),state:'done'});
 for(const r of h.rejections||[])p.push({label:'رفض الأرشيف إرجاعك',when:officeTime(r.at),detail:[r.reason,'رفضه '+r.by,'كنت أبلغت '+officeTime(r.claimedAt)].join(' · '),state:'warn'});
 if(h.returnClaimedAt)p.push({label:'أبلغتَ بإرجاعه',when:officeTime(h.returnClaimedAt),state:'done'});
 else if(!back&&j.stage==='with')p.push({label:'تُرجعه للأرشيف',when:'',detail:'اضغط «أرجعت الملف» عند تسليم الأوراق.',state:'next'});
 p.push(back?{label:back.returnCheck==='missing'?'عاد ناقصاً: '+back.missing:back.returnCheck==='complete'?'عاد إلى الأرشيف كاملاً':'عاد إلى الأرشيف',when:formatDate(back.date),
  detail:['استلمه '+back.by,back.location,back.returnCheck==='missing'?(back.missingResolvedAt?'سُوّيت: '+back.missingResolution:'تبقى النواقص عليك حتى تُسوّى مع الأرشيف'):''].filter(Boolean).join(' · '),state:back.returnCheck==='missing'&&!back.missingResolvedAt?'warn':'done'}
  :{label:'يعود إلى الأرشيف',when:'',detail:j.stage==='reported'?'بانتظار تأكيد الأرشيف لعودة الأوراق.':'',state:j.stage==='reported'?'now':'next'});
 return p;
}

/** Every paper file you asked for or the archive handed you, as journeys that end only when the file is back in the archive. */
export default function PaperFilesPage(){
 const [data,setData]=useState<Journeys|null>(null),[partial,setPartial]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [filter,setFilter]=useState<Filter>('open'),[search,setSearch]=useState(''),[shortOf,setShortOf]=useState(''),[shortText,setShortText]=useState('');
 // Before the journeys update is installed, the page shows what «ملفاتي الورقية» already knows: files held now and recent requests.
 const load=useCallback(()=>desk<Journeys>('desk_journeys').then(d=>{setData(d);setPartial(false);setError('')}).catch(()=>desk<MyPaperFiles>('desk_mine')
  .then(m=>{setData({handouts:m.holding.map(h=>({...h,current:true,steps:[]})),requests:m.requests.map(r=>({...r,movementId:null}))});setPartial(true);setError('')})
  .catch(e=>setError((e as Error).message))),[]);
 useEffect(()=>{void load();addEventListener(PAPER_FILES_EVENT,load);addEventListener('focus',load);return()=>{removeEventListener(PAPER_FILES_EVENT,load);removeEventListener('focus',load)}},[load]);
 async function act(key:string,run:()=>Promise<unknown>,done:string){setBusy(key);try{await run();toast.success(done);dispatchEvent(new Event(PAPER_FILES_EVENT))}catch(e){toast.error((e as Error).message)}finally{setBusy('')}}
 const today=todayISO(),all=useMemo(()=>data?journeysOf(data):[],[data]);
 const inFilter=(j:Journey)=>filter==='all'||(filter==='open'?OPEN.includes(j.stage):filter==='complete'?j.stage==='complete'||j.stage==='declined':['awaiting','with','reported'].includes(j.stage));
 const list=all.filter(j=>inFilter(j)&&normalizeSearch([j.file.number,j.file.title,j.file.caseCode,j.file.client,j.file.opponent,j.handout?.purpose,j.request?.purpose].join(' ')).includes(normalizeSearch(search)));
 const count=(f:Filter)=>all.filter(j=>f==='all'||(f==='open'?OPEN.includes(j.stage):f==='complete'?j.stage==='complete'||j.stage==='declined':['awaiting','with','reported'].includes(j.stage))).length;
 const chips:[Filter,string][]=[['open','الجارية'],['mine','معي الآن'],['complete','المكتملة'],['all','الكل']];
 return <section className="panel paper-page"><div className="paper-page-head"><div><h2>ملفاتي الورقية</h2><p className="panel-note">رحلة كل ملف ورقي معك: من طلبه، إلى إرساله واستلامه، وأين ذهب، حتى يعود إلى الأرشيف. لا تكتمل الرحلة إلا بعودة الملف.</p></div></div>
  {error&&<p className="notice" role="alert">{error}</p>}
  {partial&&<p className="notice">يظهر هنا الآن ما معك وطلباتك الأخيرة فقط؛ يكتمل السجل الكامل بعد تحديث قاعدة البيانات.</p>}
  {!data&&!error?<p role="status">جارٍ التحميل…</p>:<>
  <div className="paper-toolbar"><div className="status-chips" role="group" aria-label="الرحلات">{chips.map(([id,label])=><button key={id} type="button" className={'chip'+(filter===id?' on':'')} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label} <b>{count(id)}</b></button>)}</div>
   <label className="paper-search"><Search size={16} aria-hidden/><input aria-label="بحث في ملفاتي الورقية" value={search} onChange={e=>setSearch(e.target.value)} placeholder="رقم الأرشيف، الكود، الموكل أو الخصم"/></label></div>
  {!list.length?<Empty title={all.length?'لا يوجد ملف في هذا التصنيف':'لا توجد ملفات ورقية بعد'} text={all.length?'جرّب «الكل» أو امسح البحث.':'اطلب ملف القضية من نافذة القضية، أو انتظر ما يرسله لك الأرشيف؛ تظهر رحلته هنا.'}/>
  :<ol className="journeys">{list.map(j=>{const [label,tone]=STAGES[j.stage],h=j.handout,points=pointsOf(j,today);return <li key={j.key} className={'journey '+j.stage}>
   <div className="journey-head"><div><b><span dir="ltr">{j.file.number}</span> · {j.file.title}</b><small>{caseLine(j.file)}</small></div><span className={'tag '+tone}>{label}</span>
    <div className="journey-actions">{h?.current&&h.receipt==='pending'&&shortOf!==h.movementId&&<button type="button" className="btn" disabled={!!busy} onClick={()=>{setShortOf(h.movementId);setShortText('')}}>ناقص شيء؟</button>}
     {h?.current&&h.receipt==='pending'&&shortOf===h.movementId&&<span className="journey-short"><input aria-label="ما الناقص" value={shortText} onChange={e=>setShortText(e.target.value)} placeholder="ما الناقص؟"/><button type="button" className="btn primary" disabled={!!busy||!shortText.trim()} onClick={()=>void act(h.movementId,()=>desk('desk_receive',{movementId:h.movementId,missing:shortText}),'أكدت الاستلام مع النقص')}>استلمت مع النقص</button></span>}
     {h?.current&&h.receipt==='pending'&&shortOf!==h.movementId&&<button type="button" className="btn primary" disabled={!!busy} onClick={()=>void act(h.movementId,()=>desk('desk_receive',{movementId:h.movementId}),'أكدت استلام '+h.number)}><CheckCircle2 size={15}/> استلمت</button>}
     {h?.current&&h.receipt!=='pending'&&!h.returnClaimedAt&&<button type="button" className="btn" disabled={!!busy} onClick={()=>void act(h.movementId,()=>desk('desk_return',{movementId:h.movementId}),'أبلغت الأرشيف بإرجاع '+h.number)}><Undo2 size={15}/> أرجعت الملف</button>}
     {!h&&j.stage==='marked'&&<button type="button" className="btn primary" disabled={!!busy} onClick={()=>void act(j.request!.id,()=>desk('desk_accept_marked',{requestId:j.request!.id}),'سُجّل استلامك لـ '+j.file.number)}><CheckCircle2 size={15}/> استلمت</button>}
     {!h&&j.request?.status==='pending'&&<button type="button" className="btn" disabled={!!busy} onClick={()=>void act(j.request!.id,()=>desk('desk_cancel',{id:j.request!.id}),'أُلغي طلب '+j.file.number)}><X size={15}/> إلغاء الطلب</button>}</div></div>
   <ol className="journey-steps">{points.map((pt,i)=><li key={i} className={pt.state}><i aria-hidden/><b>{pt.label}</b>{pt.when&&<small>{pt.when}</small>}{pt.detail&&<small>{pt.detail}</small>}</li>)}</ol>
  </li>})}</ol>}</>}
 </section>;
}
