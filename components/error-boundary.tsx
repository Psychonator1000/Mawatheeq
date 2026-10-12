import {Component,type ReactNode} from 'react';

const RELOAD_KEY='mawatheeq.reloaded-at';
/** True when the error means part of the app could not be downloaded, usually because a newer version was published. */
const isLoadError=(e:unknown)=>/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(String((e as Error)?.message||e));
/** Reload once to pick up a newly published version; never loop if the reload does not help. */
export function reloadForUpdate():boolean{
 try{const last=Number(sessionStorage.getItem(RELOAD_KEY)||0);if(Date.now()-last<30000)return false;sessionStorage.setItem(RELOAD_KEY,String(Date.now()))}catch{return false}
 location.reload();return true;
}

/** Shows a short message with a reload button instead of a blank page if something fails while drawing the app. */
export default class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:unknown){console.error(error);if(isLoadError(error))reloadForUpdate()}
 render(){
  if(!this.state.failed)return this.props.children;
  return <main className="app-error" dir="rtl" role="alert"><h1>تعذر عرض الصفحة</h1><p>حدث خطأ غير متوقع. لم تُفقد بياناتك المحفوظة؛ أعد التحميل للمتابعة.</p>
   <button className="btn primary" onClick={()=>location.reload()}>إعادة التحميل</button></main>;
 }
}
