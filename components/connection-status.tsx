import {useEffect,useState} from 'react';
import {Wifi,WifiOff} from 'lucide-react';

/** A clear banner when the network drops (changes cannot be saved) and a short one when it returns. */
export default function ConnectionStatus(){
 const [state,setState]=useState<'online'|'offline'|'back'>(()=>typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'online');
 useEffect(()=>{let timer=0;
  const off=()=>{clearTimeout(timer);setState('offline')};
  const on=()=>{setState(s=>s==='offline'?'back':s);clearTimeout(timer);timer=window.setTimeout(()=>setState('online'),3500)};
  addEventListener('offline',off);addEventListener('online',on);
  return()=>{clearTimeout(timer);removeEventListener('offline',off);removeEventListener('online',on)};
 },[]);
 if(state==='online')return null;
 return state==='offline'
  ?<div className="connection-banner offline" role="alert"><WifiOff size={16}/> انقطع الاتصال بالشبكة. لن تُحفظ التغييرات حتى يعود الاتصال.<span className="pulse" aria-hidden/></div>
  :<div className="connection-banner online" role="status"><Wifi size={16}/> عاد الاتصال. يمكنك المتابعة.</div>;
}
