import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';

/** Bump when adding entries so the account menu shows its dot again. */
export const WHATS_NEW_VERSION='2026-10-11';
const KEY='mawatheeq.whats-new.seen';
export const whatsNewUnseen=()=>{try{return localStorage.getItem(KEY)!==WHATS_NEW_VERSION}catch{return false}};
export const markWhatsNewSeen=()=>{try{localStorage.setItem(KEY,WHATS_NEW_VERSION)}catch{/* Still shown next time. */}};

const ITEMS:[string,string,string][]=[
 ['🖨️','طباعة جماعية للتحصيل','تُدخل بيانات أمر الأداء مرة واحدة، ثم تطبع السكرتارية صحف الدعوى وحوافظ المستندات لعدة ملفات في ملف Word واحد. أُزيلت صفحة رفع PDF.'],
 ['🖥️','خادم المكتب','يمكن تشغيل مواثيق كاملاً على جهاز داخل المكتب، مع نسخ احتياطي يومي.'],
 ['🚪','أجهزة الأبواب','فتح الأبواب عن بعد، وتعديل الأجهزة وحذفها، وبطاقات المستخدمين من صفحة الأجهزة.'],
 ['🕒','الحضور والرواتب','سجل البصمات الشهري، والأعذار، وتقدير الرواتب مع التنبيهات في المحاسبة.'],
 ['🎨','سمات جديدة','أسود وذهبي، أبيض وذهبي، أزرق وذهبي، أصفر مشمس، وAero بالأزرق السماوي… وسمات مخفية.'],
 ['🔤','حجم الخط والكثافة','من «المظهر والحركة»: كبّر الخط أو اعرض صفوفاً أكثر في الصفحة.'],
 ['📋','نسخ الأرقام بنقرة','انسخ كود المكتب أو الرقم الآلي من ملف القضية مباشرة.'],
 ['📶','حالة الاتصال','تنبيه واضح إذا انقطعت الشبكة حتى لا تضيع التغييرات.'],
 ['⌨️','اختصارات','Ctrl + B لوضع التركيز، Shift + T للعودة إلى الأعلى، و? لعرض كل الاختصارات.'],
];
export default function WhatsNewDialog({onClose}:{onClose:()=>void}){
 return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent dir="rtl" className="office-dialog whats-new-dialog"><DialogHeader><DialogTitle>ما الجديد في مواثيق</DialogTitle><DialogDescription>آخر التحسينات على مساحة العمل.</DialogDescription></DialogHeader>
  <ul className="whats-new-list">{ITEMS.map(([icon,title,text])=><li key={title}><span aria-hidden>{icon}</span><div><b>{title}</b>{text}</div></li>)}</ul>
  <button className="btn primary" onClick={onClose}>رائع</button></DialogContent></Dialog>;
}
