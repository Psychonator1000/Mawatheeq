import {useEffect,useState} from 'react';
import {Clock} from 'lucide-react';

/** Office date and a live minute clock (Kuwait time) in the top bar. */
export default function TopbarClock(){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{let timer=0;const tick=()=>setNow(new Date());const align=window.setTimeout(()=>{tick();timer=window.setInterval(tick,60000)},60000-Date.now()%60000);return()=>{clearTimeout(align);clearInterval(timer)}},[]);
 const date=new Intl.DateTimeFormat('ar-KW',{weekday:'long',day:'numeric',month:'long',timeZone:'Asia/Kuwait'}).format(now);
 const time=new Intl.DateTimeFormat('ar-KW-u-nu-latn',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Kuwait'}).format(now);
 return <span className="topbar-clock date-display"><Clock size={13}/>{date} · <b dir="ltr">{time}</b></span>;
}
