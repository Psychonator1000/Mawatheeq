import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from './ui/dialog';

/** Bump when adding tips so the account menu shows its dot again. */
export const TIPS_VERSION='2026-10-12';
const KEY='mawatheeq.tips.seen';
export const tipsUnseen=()=>{try{return localStorage.getItem(KEY)!==TIPS_VERSION}catch{return false}};
export const markTipsSeen=()=>{try{localStorage.setItem(KEY,TIPS_VERSION)}catch{/* Still shown next time. */}};

/** Every keyboard shortcut in the app. They work when the cursor is not inside a text field. */
export const SHORTCUTS:[string,string][]=[
 ['Ctrl + K','بحث سريع عن قضية أو موكل أو قسم (⌘ + K على Mac)'],
 ['?','عرض اختصارات لوحة المفاتيح'],
 ['Alt + 1 … 9','الانتقال إلى أقسام القائمة الجانبية بالترتيب (في صفحة القضايا)'],
 ['Ctrl + B','إخفاء القائمة الجانبية أو إظهارها (وضع التركيز)'],
 ['Shift + T','العودة إلى أعلى الصفحة'],
 ['Esc','إغلاق النافذة أو الملف المفتوح'],
 ['↑ ↓ ثم Enter','التنقل بين نتائج البحث السريع وفتح النتيجة'],
];
const TIPS:[string,string,string][]=[
 ['🔎','ابحث من أي مكان','اكتب في البحث السريع كود المكتب أو الرقم الآلي أو اسم الموكل أو الخصم للوصول إلى القضية مباشرة.'],
 ['📋','نسخ الأرقام بنقرة','انقر على كود المكتب أو الرقم الآلي في ملف القضية لنسخه.'],
 ['🗓️','السنة والشهر منفصلان','اختر سنة الحكم وحدها أو الشهر وحده أو الاثنين معاً. روابط الأشهر في اللوحة تحدد الاثنين.'],
 ['🧭','شريط الأقسام الجانبي','عند التمرير في صفحة طويلة يظهر شريط صغير على الجانب؛ انقر على أي علامة للانتقال إلى قسمها.'],
 ['🖨️','طباعة جماعية','في التحصيل ← «طباعة جماعية» حدد الملفات الجاهزة، فتحصل على صحف الدعوى أو حوافظ المستندات في ملف Word واحد.'],
 ['👤','صفحات كل موظف','من «فريق المكتب والصلاحيات» اختر قالباً مثل «السكرتارية فقط». من له صفحة واحدة تفتح له مباشرة.'],
 ['🔤','حجم الخط والكثافة','من «المظهر والحركة»: كبّر الخط أو اعرض صفوفاً أكثر، أو اختر الحركة الهادئة.'],
 ['📶','حالة الاتصال','يظهر تنبيه إذا انقطعت الشبكة؛ انتظر عودته قبل الحفظ حتى لا تضيع التغييرات.'],
 ['🎨','سمات مخفية','بعض السمات لا تظهر في القائمة. اكتب كلمتها السرية في أي مكان خارج خانات الكتابة، واكتبها مرة أخرى للعودة.'],
];
export default function TipsDialog({onClose}:{onClose:()=>void}){
 return <Dialog open onOpenChange={open=>!open&&onClose()}><DialogContent dir="rtl" className="office-dialog tips-dialog"><DialogHeader><DialogTitle>نصائح مواثيق</DialogTitle><DialogDescription>كل اختصارات لوحة المفاتيح، وطرق أسرع لإنجاز العمل.</DialogDescription></DialogHeader>
  <h3 className="tips-heading">اختصارات لوحة المفاتيح</h3>
  <table className="office-table shortcuts-table"><tbody>{SHORTCUTS.map(([keys,label])=><tr key={keys}><td><kbd dir="ltr">{keys}</kbd></td><td>{label}</td></tr>)}</tbody></table>
  <h3 className="tips-heading">نصائح</h3>
  <ul className="tips-list">{TIPS.map(([icon,title,text])=><li key={title}><span aria-hidden>{icon}</span><div><b>{title}</b>{text}</div></li>)}</ul>
  <button className="btn primary" onClick={onClose}>فهمت</button></DialogContent></Dialog>;
}
