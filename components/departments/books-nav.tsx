import {useEffect,useMemo,useRef,useState} from 'react';
import {Search,ChevronLeft,Plus,FileText,CheckCircle2,type LucideIcon} from 'lucide-react';
import {booksRequest} from '@/lib/local-auth';
import {normalize,formatDate} from '@/lib/domain';
import {money,toFils} from '@/lib/books';

export type NavItem={id:string;label:string;hint:string;badge?:number;alert?:boolean;words?:string};
export type NavGroup={id:string;title:string;icon:LucideIcon;items:NavItem[]};
export type NavAction={id:string;label:string;words?:string;run:()=>void};
export type Attention={id:string;label:string;count:number;amount?:string;page:string;alert?:boolean};
type DocHit={id:string;name:string;partnerId:string;amount:string;date:string;state:string;ref:string};
type Hit={key:string;kind:'page'|'action'|'doc';label:string;sub:string;run:()=>void};

const closedKey='mawatheeq.books-nav-closed';
const readClosed=():string[]=>{try{const v=JSON.parse(localStorage.getItem(closedKey)||'[]');return Array.isArray(v)?v:[]}catch{return []}};
const matches=(q:string,text:string)=>{const words=normalize(q).toLowerCase().split(' ').filter(Boolean),t=normalize(text).toLowerCase();return words.length>0&&words.every(w=>t.includes(w))};

/**
 * The accounting menu: every page in groups an accountant thinks in, with counts where something waits, and one box
 * («/» from anywhere) to jump to a page, start a document or open one by its number, reference or partner.
 */
export function BooksNav({groups,page,onPage,actions,partnerName,onOpenDoc}:{groups:NavGroup[];page:string;onPage:(id:string)=>void;actions:NavAction[];partnerName:(id:string)=>string;onOpenDoc:(id:string)=>void}){
 const [q,setQ]=useState(''),[active,setActive]=useState(0),[docs,setDocs]=useState<{q:string;rows:DocHit[]}>({q:'',rows:[]}),[closed,setClosed]=useState<string[]>(readClosed),input=useRef<HTMLInputElement>(null);
 // «/» puts the cursor in the box from anywhere on the page, except while typing or with a window open.
 useEffect(()=>{const key=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;
  if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!t?.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('[role=dialog]')){e.preventDefault();input.current?.focus();input.current?.select()}};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[]);
 const term=q.trim();
 useEffect(()=>{if(term.length<2)return;let live=true;const t=setTimeout(()=>{booksRequest<{moves:DocHit[]}>('list_moves',{q:term}).then(r=>{if(live)setDocs({q:term,rows:r.moves.slice(0,6)})}).catch(()=>{if(live)setDocs({q:term,rows:[]})})},220);return()=>{live=false;clearTimeout(t)}},[term]);
 const hits=useMemo<Hit[]>(()=>{if(!term)return [];
  const pages=groups.flatMap(g=>g.items.filter(i=>matches(term,i.label+' '+g.title+' '+i.hint+' '+(i.words||''))).map(i=>({key:'p:'+i.id,kind:'page' as const,label:i.label,sub:g.title,run:()=>onPage(i.id)}))).slice(0,7);
  const acts=actions.filter(a=>matches(term,a.label+' '+(a.words||''))).map(a=>({key:'a:'+a.id,kind:'action' as const,label:a.label,sub:'إنشاء',run:a.run})).slice(0,4);
  const found=docs.q===term?docs.rows.map(d=>({key:'d:'+d.id,kind:'doc' as const,label:d.name==='/'?'مسودة':d.name,sub:[partnerName(d.partnerId),d.ref,formatDate(d.date),money(toFils(d.amount))].filter(Boolean).join(' · '),run:()=>onOpenDoc(d.id)})):[];
  return [...pages,...acts,...found]},[term,groups,actions,docs,partnerName,onPage,onOpenDoc]);
 const pick=(h:Hit)=>{h.run();setQ('');(document.activeElement as HTMLElement|null)?.blur()};
 function onKey(e:React.KeyboardEvent<HTMLInputElement>){
  if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(a+1,hits.length-1))}
  else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0))}
  else if(e.key==='Enter'&&hits[active]){e.preventDefault();pick(hits[active])}
  else if(e.key==='Escape'){setQ('');input.current?.blur()}
 }
 const toggle=(id:string)=>setClosed(c=>{const next=c.includes(id)?c.filter(x=>x!==id):[...c,id];try{localStorage.setItem(closedKey,JSON.stringify(next))}catch{/* this visit only */}return next});
 const icon={page:ChevronLeft,action:Plus,doc:FileText};
 return <nav className="books-nav" aria-label="أقسام المحاسبة">
  <label className="books-go"><Search size={15} aria-hidden/><input ref={input} value={q} onChange={e=>{setQ(e.target.value);setActive(0)}} onKeyDown={onKey} aria-label="اذهب إلى صفحة أو ابحث عن مستند"
   placeholder="اذهب إلى… أو رقم مستند" role="combobox" aria-expanded={!!term} aria-controls="books-go-results" autoComplete="off"/><kbd>/</kbd></label>
  {/* Phones: the same pages as one list. */}
  <label className="books-nav-select"><span className="sr-only">الصفحة</span><select value={page} onChange={e=>onPage(e.target.value)} aria-label="صفحة المحاسبة">
   {groups.map(g=><optgroup key={g.id} label={g.title}>{g.items.map(i=><option key={i.id} value={i.id}>{i.label}{i.badge?` (${i.badge})`:''}</option>)}</optgroup>)}</select></label>
  {term?<ul className="books-go-results" id="books-go-results" role="listbox" aria-label="النتائج">{hits.length?hits.map((h,i)=>{const Icon=icon[h.kind];return <li key={h.key} role="option" aria-selected={i===active}>
   <button type="button" className={i===active?'active':''} onMouseEnter={()=>setActive(i)} onClick={()=>pick(h)}><Icon size={14} aria-hidden/><span><b>{h.label}</b><small>{h.sub}</small></span></button></li>})
   :<li className="muted books-go-none">{term.length<2?'اكتب حرفين على الأقل':'لا توجد نتيجة'}</li>}</ul>
  :<div className="books-nav-groups">{groups.map(g=>{const open=!closed.includes(g.id)||g.items.some(i=>i.id===page),Icon=g.icon,count=g.items.reduce((n,i)=>n+(i.badge||0),0);
   return <section key={g.id} className="books-nav-group"><button type="button" className="books-nav-title" aria-expanded={open} onClick={()=>toggle(g.id)}><Icon size={15} aria-hidden/><span>{g.title}</span>{!open&&count>0&&<i aria-hidden className="books-badge">{count}</i>}</button>
    {open&&<ul>{g.items.map(i=><li key={i.id}><button type="button" className="books-nav-item" aria-current={i.id===page?'page':undefined} title={i.badge?`${i.hint} (${i.badge})`:i.hint} onClick={()=>onPage(i.id)}>
     <span>{i.label}</span>{!!i.badge&&<i aria-hidden className={'books-badge'+(i.alert?' alert':'')}>{i.badge>99?'99+':i.badge}</i>}</button></li>)}</ul>}</section>})}</div>}
  <p className="books-keys"><kbd>/</kbd> بحث · <kbd>Ctrl</kbd>+<kbd>S</kbd> حفظ · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> ترحيل</p>
 </nav>;
}

/** Where you are and what the page is for, so the page explains itself at a glance. */
export function PageHeader({group,item}:{group?:NavGroup;item?:NavItem}){
 if(!item)return null;
 return <header className="books-page-head"><p className="books-crumb">{group?.title}<ChevronLeft size={13} aria-hidden/></p><h2>{item.label}</h2><p className="muted">{item.hint}</p></header>;
}

/** What waits for the accountant today, each line opening the page where it is done. */
export function AttentionList({items,onPage}:{items:Attention[];onPage:(id:string)=>void}){
 const open=items.filter(i=>i.count>0);
 return <section className="panel books-attention"><div className="department-toolbar"><h2>ما يحتاج انتباهك</h2></div>
  {!open.length?<p className="books-all-clear"><CheckCircle2 size={18} aria-hidden/> لا شيء ينتظرك الآن.</p>
  :<ul>{open.map(i=><li key={i.id}><button type="button" className={'books-attention-item'+(i.alert?' alert':'')} onClick={()=>onPage(i.page)}>
   <b className="mono">{i.count}</b><span>{i.label}</span>{i.amount&&<small className="mono" dir="ltr">{money(toFils(i.amount))}</small>}<ChevronLeft size={15} aria-hidden/></button></li>)}</ul>}
 </section>;
}
