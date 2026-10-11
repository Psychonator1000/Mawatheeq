import {useEffect,useState} from 'react';
import {ArrowUp} from 'lucide-react';
import {pointerEffectsOn} from '@/lib/appearance';
import './motion.css';

/**
 * Ambient, pointer-reactive background plus scroll feedback for the whole app.
 * Everything is decorative: pointer-events none, CSS variables only, one rAF per frame,
 * paused for hidden tabs, touch input and reduced-motion preferences.
 */
export default function MotionLayer() {
 const [showTop,setShowTop]=useState(false);
 useEffect(()=>{
  const root=document.documentElement;
  let frame=0,px=.5,py=.5,tilt:HTMLElement|null=null,tx=0,ty=0;
  const resetTilt=(el:HTMLElement|null)=>{if(el){el.style.removeProperty('--tilt-x');el.style.removeProperty('--tilt-y')}};
  const paint=()=>{frame=0;
   root.style.setProperty('--ax',px.toFixed(4));root.style.setProperty('--ay',py.toFixed(4));
   if(tilt){tilt.style.setProperty('--tilt-x',(-ty*7).toFixed(2)+'deg');tilt.style.setProperty('--tilt-y',(tx*7).toFixed(2)+'deg');tilt.style.setProperty('--glare-x',((tx+.5)*100).toFixed(1)+'%');tilt.style.setProperty('--glare-y',((ty+.5)*100).toFixed(1)+'%')}};
  const schedule=()=>{if(!frame&&!document.hidden)frame=requestAnimationFrame(paint)};
  const onMove=(e:PointerEvent)=>{
   if(e.pointerType!=='mouse'||!pointerEffectsOn())return;
   px=e.clientX/innerWidth;py=e.clientY/innerHeight;
   const target=(e.target instanceof Element?e.target.closest('[data-tilt]'):null) as HTMLElement|null;
   if(target!==tilt){resetTilt(tilt);tilt=target}
   if(target){const r=target.getBoundingClientRect();tx=(e.clientX-r.left)/r.width-.5;ty=(e.clientY-r.top)/r.height-.5}
   schedule();
  };
  const onLeave=()=>{resetTilt(tilt);tilt=null};
  const onScroll=()=>{
   const se=document.scrollingElement||root,max=se.scrollHeight-se.clientHeight,y=se.scrollTop;
   root.style.setProperty('--scroll-progress',max>0?Math.min(1,y/max).toFixed(4):'0');
   root.toggleAttribute('data-scrolled',y>12);
   setShowTop(y>700);
  };
  onScroll();
  addEventListener('pointermove',onMove,{passive:true});document.addEventListener('pointerleave',onLeave);
  addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll,{passive:true});
  return()=>{cancelAnimationFrame(frame);removeEventListener('pointermove',onMove);document.removeEventListener('pointerleave',onLeave);removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll);root.removeAttribute('data-scrolled')};
 },[]);
 return <>
  <div className="ambient" aria-hidden="true"><span className="ambient-blob one"/><span className="ambient-blob two"/><span className="ambient-blob three"/><span className="ambient-spot"/><span className="ambient-grain"/></div>
  <div className="scroll-progress" aria-hidden="true"/>
  {showTop&&<button className="back-to-top" aria-label="العودة إلى أعلى الصفحة" onClick={()=>scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}><ArrowUp size={18}/></button>}
 </>;
}
