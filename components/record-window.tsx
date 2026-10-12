'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from '@/components/ui/sheet';
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import {takeCaseOrigin} from '@/lib/case-origin';

export type Enter='origin'|'prev'|'next';
export type WindowNav={index:number;total:number;hasPrev:boolean;hasNext:boolean};

/** The window grows out of the row or card it was opened from. */
export function useWindowOrigin(ref:RefObject<HTMLElement|null>){
 useLayoutEffect(()=>{const el=ref.current,o=takeCaseOrigin();if(!el||!o)return;const r=el.getBoundingClientRect();el.style.setProperty('--dx',`${o.x-(r.left+r.width/2)}px`);el.style.setProperty('--dy',`${o.y-(r.top+r.height/2)}px`)},[ref]);
}
/** Ctrl+S saves and Alt+→ / Alt+← move through the list, only in the window on top (a client file opened from a case keeps the keys to itself). */
export function useWindowKeys(ref:RefObject<HTMLElement|null>,{save,go}:{save?:()=>void;go?:(dir:'prev'|'next')=>void}){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  const windows=document.querySelectorAll('[data-record-window]');if(!ref.current||windows[windows.length-1]!==ref.current||document.querySelector('[role=alertdialog]'))return;
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();save?.();return}
  if(e.altKey&&!e.ctrlKey&&(e.key==='ArrowRight'||e.key==='ArrowLeft')&&go){e.preventDefault();go(e.key==='ArrowRight'?'prev':'next')}};
  addEventListener('keydown',key);return()=>removeEventListener('keydown',key)});
}
/** Previous / next through the list the window was opened from; opening a record from the list starts with the zoom again. */
export function useListNav<T extends {id:string}>(list:T[],current:T|null,open:(item:T|null)=>void){
 const [enter,setEnter]=useState<Enter>('origin');
 const i=current?list.findIndex(x=>x.id===current.id):-1;
 const nav:WindowNav|undefined=i<0?undefined:{index:i,total:list.length,hasPrev:i>0,hasNext:i<list.length-1};
 return {enter,nav,
  openItem:(item:T|null)=>{setEnter('origin');open(item)},
  step:(dir:'prev'|'next')=>{const t=i<0?undefined:list[i+(dir==='next'?1:-1)];if(t){setEnter(dir);open(t)}}};
}

export function NavButtons({nav,go,unit='السجل'}:{nav:WindowNav;go:(dir:'prev'|'next')=>void;unit?:string}){
 return <div className="case-nav"><button type="button" className="btn" disabled={!nav.hasPrev} onClick={()=>go('prev')} aria-keyshortcuts="Alt+ArrowRight" aria-label={unit+' السابق'}><ChevronRight/> السابق</button><span>{nav.index+1} / {nav.total}</span><button type="button" className="btn" disabled={!nav.hasNext} onClick={()=>go('next')} aria-keyshortcuts="Alt+ArrowLeft" aria-label={unit+' التالي'}>التالي <ChevronLeft/></button></div>;
}
export function Facts({items}:{items:[string,ReactNode][]}){
 return <dl className="case-facts">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd className={value===''||value==null?'muted':''}>{value===''||value==null?'غير مسجل':value}</dd></div>)}</dl>;
}

type Props={eyebrow?:string;title:ReactNode;subtitle?:ReactNode;badges?:ReactNode;facts?:[string,ReactNode][];pin?:ReactNode;quick?:ReactNode;
 nav?:WindowNav;onNavigate?:(dir:'prev'|'next')=>void;unit?:string;enter?:Enter;size?:'wide'|'compact';
 dirty?:boolean;busy?:boolean;onSave?:()=>void;onClose:()=>void;footer?:ReactNode;children:ReactNode;className?:string};
/**
 * The record window shared by cases, clients, tasks and department files: the essentials stay pinned on the side
 * while the rest scrolls, with quick actions, previous/next through the list, Ctrl+S and a guard for unsaved edits.
 */
export default function RecordWindow({eyebrow,title,subtitle,badges,facts,pin,quick,nav,onNavigate,unit,enter='origin',size='wide',dirty=false,busy=false,onSave,onClose,footer,children,className=''}:Props){
 const ref=useRef<HTMLDivElement>(null),[pending,setPending]=useState<{label:string;run:()=>void}|null>(null);
 const guarded=(label:string,run:()=>void)=>{if(dirty)setPending({label,run});else run()};
 const go=(dir:'prev'|'next')=>{if(onNavigate&&nav&&(dir==='prev'?nav.hasPrev:nav.hasNext))guarded('الانتقال دون حفظ',()=>onNavigate(dir))};
 useWindowOrigin(ref);
 useWindowKeys(ref,{save:onSave&&(()=>{if(!busy)onSave()}),go:onNavigate&&go});
 return <><AlertDialog open={!!pending} onOpenChange={v=>{if(!v)setPending(null)}}><AlertDialogContent dir="rtl"><AlertDialogHeader><AlertDialogTitle>تغييرات غير محفوظة</AlertDialogTitle><AlertDialogDescription>عدّلت بيانات هذا الملف ولم تحفظها بعد. هل تريد المتابعة دون حفظ؟</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>متابعة التعديل</AlertDialogCancel><AlertDialogAction onClick={()=>{const p=pending;setPending(null);p?.run()}}>{pending?.label||'متابعة دون حفظ'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <Sheet open onOpenChange={v=>{if(!v&&!busy)guarded('إغلاق دون حفظ',onClose)}}><SheetContent side="left" className={'detail-sheet case-window record-window '+className} data-size={size} data-enter={enter} data-record-window ref={ref} dir="rtl"><SheetHeader className="case-pin">
  <div className="case-pin-top"><div className="case-pin-names">{eyebrow&&<small className="record-eyebrow">{eyebrow}</small>}<SheetTitle>{title}</SheetTitle>{subtitle?<SheetDescription>{subtitle}</SheetDescription>:<SheetDescription className="sr-only">ملف السجل</SheetDescription>}</div>
   {badges&&<div className="case-pin-id">{badges}</div>}</div>
  {facts&&facts.length>0&&<Facts items={facts}/>}
  {pin}
  {quick&&<div className="case-quick" role="group" aria-label="إجراءات سريعة">{quick}</div>}
  {nav&&nav.total>1&&onNavigate&&<NavButtons nav={nav} go={go} unit={unit}/>}
  <p className="case-keys">{onSave&&<><kbd>Ctrl S</kbd> حفظ · </>}{nav&&nav.total>1&&onNavigate&&<><kbd>Alt ←→</kbd> السابق/التالي · </>}<kbd>Esc</kbd> إغلاق</p>
 </SheetHeader>
 <div className="case-main">{children}</div>
 {footer&&<div className="detail-actions">{footer}</div>}
 </SheetContent></Sheet></>;
}
