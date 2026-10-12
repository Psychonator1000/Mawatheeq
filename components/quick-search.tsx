import {useEffect,useMemo,useState,type ElementType} from 'react';
import {Building2,FileText,History,Plus,Search} from 'lucide-react';
import {Command,CommandEmpty,CommandGroup,CommandInput,CommandItem,CommandList} from './ui/command';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {normalizeSearch} from '@/lib/case-browse';
import {allCaseNumbers} from '@/lib/case-stages';
import {clientName,type ClientEntity} from '@/lib/clients';
import type {CaseRecord} from '@/lib/domain';

export type QuickSection={id:string;label:string;icon:ElementType};
export type QuickAction={id:string;label:string;run:()=>void};
const limit=8;
/** Ctrl/⌘+K search over records the user can already open. */
export default function QuickSearch({open,onOpenChange,recent=[],cases,clients,sections,actions,onOpenCase,onOpenClient,onGo}:{open:boolean;onOpenChange:(open:boolean)=>void;recent?:CaseRecord[];cases:CaseRecord[];clients:ClientEntity[];sections:QuickSection[];actions:QuickAction[];onOpenCase:(c:CaseRecord)=>void;onOpenClient:(c:ClientEntity)=>void;onGo:(view:string)=>void}) {
 const [query,setQuery]=useState('');
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();onOpenChange(!open)}};addEventListener('keydown',key);return()=>removeEventListener('keydown',key)},[open,onOpenChange]);
 const term=normalizeSearch(query.trim());
 const caseIndex=useMemo(()=>cases.map(c=>[c,normalizeSearch([c.code,c.autoNumber,clientName(c),c.client,c.opponent,c.clientContactName,c.lawyer,...allCaseNumbers(c)].join(' '))] as const),[cases]);
 const clientIndex=useMemo(()=>clients.map(c=>[c,normalizeSearch([c.name,...c.aliases,...c.contacts.map(p=>p.name)].join(' '))] as const),[clients]);
 const foundCases=term?caseIndex.filter(([,text])=>text.includes(term)).slice(0,limit).map(([c])=>c):[];
 const foundClients=term?clientIndex.filter(([,text])=>text.includes(term)).slice(0,5).map(([c])=>c):[];
 const matches=(label:string)=>!term||normalizeSearch(label).includes(term);
 const close=(run:()=>void)=>{onOpenChange(false);setQuery('');run()};
 return <Dialog open={open} onOpenChange={next=>{onOpenChange(next);if(!next)setQuery('')}}><DialogContent dir="rtl" className="quick-search overflow-hidden p-0"><DialogHeader className="sr-only"><DialogTitle>بحث سريع</DialogTitle><DialogDescription>ابحث عن قضية أو موكل أو قسم أو إجراء.</DialogDescription></DialogHeader>
 <Command shouldFilter={false} loop><CommandInput value={query} onValueChange={setQuery} placeholder="ابحث بالكود، الرقم الآلي، الموكل، الخصم أو اسم القسم…" aria-label="بحث سريع"/><CommandList>
  <CommandEmpty>لا توجد نتائج مطابقة.</CommandEmpty>
  {!term&&recent.length>0&&<CommandGroup heading="فُتحت مؤخراً">{recent.map(c=><CommandItem key={c.id} value={'recent-'+c.id} onSelect={()=>close(()=>onOpenCase(c))}><History/><span className="quick-main">{c.code||c.autoNumber||'بلا كود'} · {clientName(c)}</span><span className="quick-sub">{c.opponent}</span></CommandItem>)}</CommandGroup>}
  {foundCases.length>0&&<CommandGroup heading="القضايا">{foundCases.map(c=><CommandItem key={c.id} value={'case-'+c.id} onSelect={()=>close(()=>onOpenCase(c))}><FileText/><span className="quick-main">{c.code||c.autoNumber||'بلا كود'} · {clientName(c)}</span><span className="quick-sub">{c.opponent}{c.archived?' · مؤرشفة':''}</span></CommandItem>)}</CommandGroup>}
  {foundClients.length>0&&<CommandGroup heading="الموكلون">{foundClients.map(c=><CommandItem key={c.id} value={'client-'+c.id} onSelect={()=>close(()=>onOpenClient(c))}><Building2/><span className="quick-main">{c.name}</span><span className="quick-sub">عرض قضايا الموكل</span></CommandItem>)}</CommandGroup>}
  {actions.some(a=>matches(a.label))&&<CommandGroup heading="إجراءات">{actions.filter(a=>matches(a.label)).map(a=><CommandItem key={a.id} value={'action-'+a.id} onSelect={()=>close(a.run)}><Plus/><span className="quick-main">{a.label}</span></CommandItem>)}</CommandGroup>}
  {sections.some(s=>matches(s.label))&&<CommandGroup heading="الأقسام">{sections.filter(s=>matches(s.label)).map(s=><CommandItem key={s.id} value={'section-'+s.id} onSelect={()=>close(()=>onGo(s.id))}><s.icon/><span className="quick-main">{s.label}</span></CommandItem>)}</CommandGroup>}
 </CommandList></Command><p className="quick-hint"><Search size={13}/> Ctrl + K لفتح البحث من أي صفحة</p></DialogContent></Dialog>;
}
