import {Eye,EyeOff,Lock,MousePointerClick,UserRound,Briefcase,Scale,BookOpenCheck} from 'lucide-react';
import {ACCOUNT_KINDS,DEFAULT_TEMPLATE,VIEW_ITEMS,VIEW_TEMPLATES,cycleMode,itemMode,viewMode,withItemMode,type AccountKind,type ViewItem,type ViewMode,type ViewSettings} from '@/lib/view-map';
import type {Permissions} from '@/lib/permissions';
type Section=Permissions['sections'][number];
import type {CaseRecord} from '@/lib/domain';
import {useEffect,useMemo,useRef,useState} from 'react';
import {normalizeSearch} from '@/lib/case-browse';

const KIND_ICONS:Record<AccountKind,typeof Eye>={staff:Briefcase,lawyer:Scale,counsel:BookOpenCheck,client:UserRound};
const MODE_LABEL:Record<ViewMode,string>={show:'ظاهر',read:'اطلاع فقط',hide:'مخفي'};
const pages=VIEW_ITEMS.filter(i=>i.kind==='page'),spaces=VIEW_ITEMS.filter(i=>i.kind==='workspace'&&i.section),tools=VIEW_ITEMS.filter(i=>i.kind==='workspace'&&!i.section),tabs=VIEW_ITEMS.filter(i=>i.kind==='tab');
const cards=VIEW_ITEMS.filter(i=>i.kind==='card'),fieldsOf=(card:string)=>VIEW_ITEMS.filter(i=>i.parent===card);
const groups=[...new Set(pages.map(p=>p.group||''))];

/**
 * «ما يراه في البرنامج»: the account's screen as it will look, live. Each page, tab, card and field is a button: a
 * click turns it from shown to read-only to hidden and back. Hidden items stay in place, greyed, so they can be turned
 * back on. A page whose section is not granted is shown off; a click grants it (see `toggle`).
 */
/** `part` splits the editor so the dialog can keep the preview still beside the scrolling controls. */
export default function ViewEditor({value,onChange,records=[],part='all'}:{value:Permissions;onChange:(v:Permissions)=>void;records?:CaseRecord[];part?:'all'|'controls'|'preview'}){
 // The client files on the cases, with how many cases each has: a client account sees the cases of the files ticked here.
 const files=useMemo(()=>{const m=new Map<string,{name:string;n:number}>();for(const c of records){const id=String(c.clientEntityId||'');if(!id)continue;const f=m.get(id)||{name:String(c.clientEntityName||c.client||''),n:0};f.n++;m.set(id,f)}
  return [...m].map(([id,f])=>({id,...f})).sort((a,b)=>b.n-a.n)},[records]);
 const [fileSearch,setFileSearch]=useState('');
 const view:ViewSettings=value.view||{},kind:AccountKind=value.accountKind||'staff';
 const set=(next:ViewSettings)=>onChange({...value,view:next});
 const granted=(i:ViewItem)=>!i.section||value.sections.includes(i.section as Section);
 // A click on an item that is not granted grants its section and shows that item alone (the section's other pages in
 // the side list stay hidden until clicked); hiding the last shown page of a section takes the section away, so the
 // server refuses it too, not only the menu. Pressing and dragging gives every item passed over the same setting.
 const latest=useRef(value);useEffect(()=>{latest.current=value});
 const commit=(v:Permissions)=>{latest.current=v;onChange(v)};
 const modeOf=(v:Permissions,i:ViewItem):ViewMode=>itemMode(v,i);
 const withMode=(v:Permissions,i:ViewItem,mode:ViewMode):Permissions=>withItemMode(v,i,mode);
 const nextMode=(v:Permissions,i:ViewItem,readable:boolean):ViewMode=>i.section&&!v.sections.includes(i.section as Section)?'show':cycleMode((v.view||{})[i.id]||'show',readable);
 const paint=useRef<{mode:ViewMode;seen:Set<string>}|null>(null);
 const startPaint=(e:React.PointerEvent,i:ViewItem,readable:boolean)=>{
  if(e.button!==0)return;e.preventDefault();
  const mode=nextMode(latest.current,i,readable);commit(withMode(latest.current,i,mode));
  paint.current={mode,seen:new Set([i.id])};
  const move=(ev:PointerEvent)=>{const el=(document.elementFromPoint(ev.clientX,ev.clientY) as HTMLElement|null)?.closest<HTMLElement>('[data-ve]'),p=paint.current;
   if(!el||!p||p.seen.has(el.dataset.ve!))return;p.seen.add(el.dataset.ve!);const it=VIEW_ITEMS.find(x=>x.id===el.dataset.ve);if(!it)return;
   const m=p.mode==='read'&&el.dataset.readable!=='1'?'show':p.mode;if(modeOf(latest.current,it)!==m)commit(withMode(latest.current,it,m))};
  const up=()=>{paint.current=null;removeEventListener('pointermove',move);removeEventListener('pointerup',up);removeEventListener('pointercancel',up)};
  addEventListener('pointermove',move);addEventListener('pointerup',up);addEventListener('pointercancel',up);
 };
 const item=(i:ViewItem,cls='',readable=true)=>{
  const own=view[i.id]||'show',mode=granted(i)?viewMode(view,i.id):'hide',off=!granted(i);
  const inherited=mode!==own&&!off;
  return <button type="button" key={i.id} data-ve={i.id} data-readable={readable?'1':undefined} className={'ve-item ve-'+mode+(inherited?' ve-inherited':'')+(off?' ve-off':'')+' '+cls}
   title={off?`${i.label}: غير ممنوح. اضغط لمنحه`:`${i.label}: ${MODE_LABEL[mode]}${inherited?' (من الأعلى)':''}. اضغط للتغيير، أو اضغط واسحب لتغيير عدة عناصر معاً`}
   aria-label={`${i.label}: ${off?'غير ممنوح':MODE_LABEL[mode]}`} onPointerDown={e=>startPaint(e,i,readable)}
   // A press with the mouse or a finger is handled above; Enter or Space on the keyboard arrives here alone.
   onClick={e=>{if(e.detail===0)commit(withMode(latest.current,i,nextMode(latest.current,i,readable)))}}>
   <span>{i.label}</span>{mode==='read'?<Lock aria-hidden size={12}/>:mode==='hide'?<EyeOff aria-hidden size={12}/>:null}</button>};
 const applyKind=(k:AccountKind)=>{const t=VIEW_TEMPLATES.find(x=>x.id===DEFAULT_TEMPLATE[k]);onChange({...value,accountKind:k,view:t?{...t.view}:view,...(k==='client'?{canEdit:false,canExport:false,caseScope:'selected' as const}:{})})};
 const same=(a:ViewSettings,b:ViewSettings)=>{const ka=Object.keys(a),kb=Object.keys(b);return ka.length===kb.length&&ka.every(k=>a[k]===b[k])};
 const controls=<>
  <div className="ve-head"><div><h3>ما يراه في البرنامج</h3><p className="subtitle"><MousePointerClick size={14} aria-hidden/> اضغط أي صفحة أو تبويب أو حقل لتغييره: ظاهر ← اطلاع فقط ← مخفي. ما تراه هنا هو ما سيراه صاحب الحساب.</p></div>
</div>
  <div className="ve-row" role="group" aria-label="نوع الحساب">{(Object.keys(ACCOUNT_KINDS) as AccountKind[]).map(k=>{const Icon=KIND_ICONS[k];return <button type="button" key={k} title={ACCOUNT_KINDS[k].hint} className={'btn ve-choice'+(kind===k?' primary':'')} aria-pressed={kind===k} onClick={()=>applyKind(k)}><Icon size={14}/> {ACCOUNT_KINDS[k].label}</button>})}</div>
  <div className="ve-row" role="group" aria-label="قوالب العرض"><small>قوالب:</small>{VIEW_TEMPLATES.map(t=><button type="button" key={t.id} title={t.hint} className={'btn ve-choice'+(same(view,t.view)?' primary':'')} onClick={()=>set({...t.view})}>{t.label}</button>)}</div>
  {kind==='client'&&<div className="ve-client">
   <p className="notice">حساب الموكل للاطلاع فقط، ويرى قضايا ملفات الموكل المختارة هنا فقط، وتنضم إليه قضاياها الجديدة تلقائياً. ما تخفيه أعلاه لا يُرسل إلى جهازه أصلاً.</p>
   <label className="field"><span>ملف الموكل الذي يرى قضاياه</span><input value={fileSearch} onChange={e=>setFileSearch(e.target.value)} placeholder="ابحث باسم الموكل"/></label>
   <div className="ve-files">{files.filter(f=>!fileSearch||normalizeSearch(f.name).includes(normalizeSearch(fileSearch))||(value.clientEntityIds||[]).includes(f.id)).slice(0,40).map(f=>{const on=(value.clientEntityIds||[]).includes(f.id);
    return <label key={f.id} className={'checkbox-line'+(on?' on':'')}><input type="checkbox" checked={on} onChange={e=>onChange({...value,clientEntityIds:e.target.checked?[...(value.clientEntityIds||[]),f.id]:(value.clientEntityIds||[]).filter(x=>x!==f.id)})}/> {f.name} <small>({f.n} قضية)</small></label>})}</div>
   {!(value.clientEntityIds||[]).length&&<p className="notice">اختر ملف موكل واحداً على الأقل قبل الحفظ.</p>}
  </div>}
 </>;
 const preview=<>
  <div className="ve-preview-head"><b>معاينة حيّة لما يراه</b>
<div className="ve-legend"><span className="ve-item ve-show">ظاهر</span><span className="ve-item ve-read">اطلاع فقط <Lock size={12}/></span><span className="ve-item ve-hide">مخفي <EyeOff size={12}/></span></div></div>
  <div className="ve-preview">
   <aside className="ve-side" aria-label="القائمة الجانبية"><div className="ve-side-scroll">{groups.map(g=><div key={g||'top'} className="ve-group">{g&&<small>{g}</small>}{pages.filter(p=>(p.group||'')===g).map(p=>item(p,'ve-page'))}</div>)}
    <div className="ve-group"><small>مساحات العمل الأخرى</small>{spaces.map(s=>item(s,'ve-page',false))}</div>
    <div className="ve-group"><small>التواصل</small>{tools.map(s=>item(s,'ve-page',false))}</div></div></aside>
   <div className="ve-case" aria-label="نافذة القضية">
    <div className="ve-tabs">{tabs.map(t=>item(t,'ve-tab'))}</div>
    <div className="ve-cards">{cards.map(c=>{const mode=viewMode(view,c.id);return <div key={c.id} className={'ve-card ve-'+mode}>
     {item(c,'ve-card-title')}<div className="ve-fields">{fieldsOf(c.id).map(f=>item(f,'ve-field'))}</div></div>})}</div>
   </div>
  </div>
 </>;
 if(part==='controls')return <section className="view-editor-controls" aria-label="إعداد ما يراه في البرنامج">{controls}</section>;
 if(part==='preview')return <section className="view-editor" aria-label="ما يراه في البرنامج">{preview}</section>;
 return <section className="view-editor" aria-label="ما يراه في البرنامج">{controls}{preview}</section>;
}
