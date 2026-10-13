import {toast} from 'sonner';

/** What still blocks an action, as short Arabic phrases that say what to fill and where. Empty entries are dropped. */
export type NeedList=(string|false|null|undefined|0)[];
const clean=(items:NeedList)=>items.filter((x):x is string=>typeof x==='string'&&!!x.trim());

/** The reason line shown next to a disabled button; nothing when the action is ready. */
export default function Needs({items,className=''}:{items:NeedList;className?:string}){
 const list=clean(items);
 if(!list.length)return null;
 return <p className={'needs '+className} role="status">لا يمكن المتابعة بعد: {list.length===1?list[0]:<span className="needs-list">{list.map(x=><span key={x}>{x}</span>)}</span>}</p>;
}
/** For keyboard saves (Ctrl+S) that cannot go ahead: say why instead of doing nothing. Returns true when blocked. */
export function blockedToast(items:NeedList){
 const list=clean(items);
 if(list.length)toast.error('لا يمكن الحفظ بعد',{description:list.join(' · ')});
 return list.length>0;
}
