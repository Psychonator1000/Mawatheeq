import {createContext,useContext,useState} from 'react';
import {KeyRound,LayoutGrid,LogOut,Palette,Sparkles} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import AppearanceDialog from './appearance-dialog';
import WhatsNewDialog,{markWhatsNewSeen,whatsNewUnseen} from './whats-new';

export type AccountActions={username:string;busy:boolean;onChangePassword:()=>void;onLogout:()=>void;onSwitchWorkspace?:()=>void};
export const AccountContext=createContext<AccountActions|null>(null);

/** Account actions behind the avatar, so no floating controls cover page content. */
export default function AccountMenu() {
 const account=useContext(AccountContext),[open,setOpen]=useState(false),[appearance,setAppearance]=useState(false),[news,setNews]=useState(false),[unseen,setUnseen]=useState(whatsNewUnseen);
 if(!account)return <div className="avatar" aria-hidden="true">م</div>;
 const run=(action:()=>void)=>{setOpen(false);action()};
 return <>{appearance&&<AppearanceDialog onClose={()=>setAppearance(false)}/>}{news&&<WhatsNewDialog onClose={()=>setNews(false)}/>}<Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button className="avatar account-trigger" aria-label={'حساب '+account.username} title={account.username}>{account.username.slice(0,1).toUpperCase()}{unseen&&<span className="avatar-dot" aria-hidden/>}</button></PopoverTrigger>
 <PopoverContent align="end" dir="rtl" className="account-menu"><div className="account-menu-head"><small>مسجل الدخول باسم</small><b dir="ltr">{account.username}</b></div>
 {account.onSwitchWorkspace&&<button className="account-menu-item" onClick={()=>run(account.onSwitchWorkspace!)}><LayoutGrid size={16}/> تغيير مساحة العمل</button>}
 <button className="account-menu-item" onClick={()=>run(()=>setAppearance(true))}><Palette size={16}/> المظهر والحركة</button>
 <button className="account-menu-item" onClick={()=>run(()=>{setNews(true);markWhatsNewSeen();setUnseen(false)})}><Sparkles size={16}/> ما الجديد{unseen&&<span className="whats-new-dot" aria-label="جديد"/>}</button>
 <button className="account-menu-item" onClick={()=>run(account.onChangePassword)}><KeyRound size={16}/> تغيير كلمة المرور</button>
 <button className="account-menu-item danger" disabled={account.busy} onClick={()=>run(account.onLogout)}><LogOut size={16}/> خروج</button></PopoverContent></Popover></>;
}
