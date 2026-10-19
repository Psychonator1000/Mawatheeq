import {Children,Fragment,isValidElement,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type ReactElement,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown} from 'lucide-react';
import {normalizeSearch} from '@/lib/case-browse';

export type FilterOption = { value: string; label: string; hint?: string };

/**
 * Every list in the app: a box you can type into, where typing only narrows the list and the value is always one of
 * the options (or empty when `empty` is given). A saved value that is not on the list shows as written until another
 * one is picked. The input carries the chosen value in `data-value`.
 */
export function FilterBox({label,value,onChange,options,empty,placeholder='اكتب للبحث أو اختر',disabled=false,className='',id}:{label:string;value:string;onChange:(v:string)=>void;options:FilterOption[];empty?:string;placeholder?:string;disabled?:boolean;className?:string;id?:string}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const listId=useId(),input=useRef<HTMLInputElement>(null),list=useRef<HTMLUListElement>(null),closing=useRef<ReturnType<typeof setTimeout>>(undefined);
 // The open list is drawn in the window, dialog or page that holds the box, not inside it, so table scroll areas and the
 // layers of animated rows and panels cannot clip or cover it. It follows the box while anything scrolls.
 const [host,setHost]=useState<HTMLElement|null>(null);
 const show=()=>{if(!open)setHost((input.current?.closest('[role=dialog],[data-record-window]') as HTMLElement|null)||document.body);setOpen(true)};
 useLayoutEffect(()=>{if(!open||!host)return;
  const place=()=>{const el=input.current,ul=list.current;if(!el||!ul)return;
   const r=el.getBoundingClientRect(),body=host===document.body,h=body?{top:-scrollY,left:-scrollX}:host.getBoundingClientRect();
   const offTop=body?0:host.scrollTop-host.clientTop,offLeft=body?0:host.scrollLeft-host.clientLeft;
   const below=innerHeight-r.bottom,height=Math.min(ul.scrollHeight,260),up=below<height+12&&r.top>below;
   Object.assign(ul.style,{position:'absolute',insetInline:'auto',left:r.left-h.left+offLeft+'px',width:Math.max(r.width,200)+'px',
    top:(up?r.top-h.top+offTop-height-4:r.bottom-h.top+offTop+4)+'px',zIndex:'1000'})};
  place();addEventListener('scroll',place,true);addEventListener('resize',place);
  return()=>{removeEventListener('scroll',place,true);removeEventListener('resize',place)}},[open,host,query]);
 // Escape closes only the open list. Dialogs listen for Escape on the document while capturing, so this listens earlier, on the window.
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&e.target===input.current){e.stopPropagation();e.preventDefault();setOpen(false);setQuery('')}};
  window.addEventListener('keydown',close,true);return()=>window.removeEventListener('keydown',close,true)},[open]);
 const current=options.find(o=>o.value===value)??(value===''&&empty!==undefined?{value:'',label:empty}:undefined);
 const shown=useMemo(()=>{const q=normalizeSearch(query);const list=q?options.filter(o=>normalizeSearch(o.label+' '+(o.hint||'')).includes(q)):options;
  return [...(empty!==undefined&&!q&&!options.some(o=>o.value==='')?[{value:'',label:empty}]:[]),...list].slice(0,300)},[options,query,empty]);
 const pick=(o:FilterOption)=>{if(o.value!==value)onChange(o.value);setOpen(false);setQuery('')};
 function onKey(e:React.KeyboardEvent<HTMLInputElement>){
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open){show();return}setActive(a=>(a+(e.key==='ArrowDown'?1:shown.length-1))%Math.max(shown.length,1));return}
  if(e.key==='Enter'&&open){e.preventDefault();if(shown[active])pick(shown[active]);return}
  if(e.key==='Tab'&&open){setOpen(false);setQuery('')}
 }
 const text=open?query:current?.label??(value?value+' (كما أُدخل)':'');
 return <span className={'filter-select-box '+className}>
  <input ref={input} id={id} role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-autocomplete="list" data-value={value} value={text} disabled={disabled} autoComplete="off"
   placeholder={open?(current?.label||placeholder):placeholder} onFocus={()=>{clearTimeout(closing.current);show();setQuery('');setActive(0)}} onClick={show}
   onChange={e=>{setQuery(e.target.value);show();setActive(0)}} onKeyDown={onKey} onBlur={()=>{closing.current=setTimeout(()=>{setOpen(false);setQuery('')},120)}}/>
  <ChevronDown size={15} aria-hidden className="filter-select-chevron"/>
  {open&&host&&createPortal(<ul ref={list} id={listId} role="listbox" className="filter-select-list" dir="rtl">{shown.length?shown.map((o,i)=><li key={o.value+'|'+i} role="option" data-value={o.value} aria-selected={o.value===value} className={i===active?'active':''}
    onMouseDown={e=>{e.preventDefault();pick(o)}} onMouseEnter={()=>setActive(i)}><b>{o.label}</b>{o.hint&&<small>{o.hint}</small>}</li>)
   :<li className="filter-select-none">لا توجد نتيجة مطابقة في القائمة</li>}</ul>,host)}
 </span>;
}

/** A labelled list field. */
export default function FilterSelect(props:{label:string;value:string;onChange:(v:string)=>void;options:FilterOption[];empty?:string;placeholder?:string;disabled?:boolean;className?:string}) {
 return <label className={'field filter-select '+(props.className||'')}><span>{props.label}</span><FilterBox {...props} className=""/></label>;
}

/** The options of a plain `<select>` written as `<option>` children (arrays and fragments included). */
function optionsOf(children:ReactNode):FilterOption[]{
 const out:FilterOption[]=[];
 const text=(n:ReactNode):string=>Children.toArray(n).map(c=>typeof c==='string'||typeof c==='number'?String(c):isValidElement(c)?text((c as ReactElement<{children?:ReactNode}>).props.children):'').join('');
 const walk=(n:ReactNode)=>Children.forEach(n,c=>{if(!isValidElement(c))return;const el=c as ReactElement<{value?:string|number;children?:ReactNode;disabled?:boolean}>;
  if(el.type===Fragment||el.type==='optgroup'){walk(el.props.children);return}
  if(el.type==='option'){const label=text(el.props.children);out.push({value:el.props.value===undefined?label:String(el.props.value),label})}});
 walk(children);return out;
}
/**
 * A drop-in for `<select>`: the same `value`, `onChange(e)` and `<option>` children, shown as a list you can type
 * into to narrow it down.
 */
export function SelectList({value,onChange,children,disabled,className,id,...rest}:{value:string|number;onChange?:(e:{target:{value:string}})=>void;children:ReactNode;disabled?:boolean;className?:string;id?:string;dir?:string;'aria-label'?:string;'aria-labelledby'?:string;title?:string}){
 const options=optionsOf(children),label=rest['aria-label']||rest.title||'اختيار';
 const emptyOption=options.find(o=>o.value==='');
 return <FilterBox id={id} label={label} value={String(value??'')} disabled={disabled} className={className} options={options.filter(o=>o.value!=='')} empty={emptyOption?.label} onChange={v=>onChange?.({target:{value:v}})}/>;
}
