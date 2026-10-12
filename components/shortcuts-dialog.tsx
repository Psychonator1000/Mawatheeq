import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';
import {SHORTCUTS} from './tips';

/** Keyboard shortcuts available in the legal workspace. */
export default function ShortcutsDialog({sections,onClose}:{sections:{label:string}[];onClose:()=>void}) {
 const rows:[string,string][]=[...SHORTCUTS.filter(([k])=>!k.startsWith('Alt')),...sections.slice(0,9).map((s,i)=>[`Alt + ${i+1}`,'الانتقال إلى '+s.label] as [string,string])];
 return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent dir="rtl" className="office-dialog shortcuts-dialog"><DialogHeader><DialogTitle>اختصارات لوحة المفاتيح</DialogTitle><DialogDescription>تعمل الاختصارات عندما لا تكون داخل خانة كتابة.</DialogDescription></DialogHeader>
  <table className="office-table"><tbody>{rows.map(([keys,label])=><tr key={keys}><td><kbd dir="ltr">{keys}</kbd></td><td>{label}</td></tr>)}</tbody></table></DialogContent></Dialog>;
}
