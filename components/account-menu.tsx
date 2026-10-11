import {createContext,useContext,useState} from 'react';
import {KeyRound,LayoutGrid,LogOut} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';

export type AccountActions={username:string;busy:boolean;onChangePassword:()=>void;onLogout:()=>void;onSwitchWorkspace?:()=>void};
export const AccountContext=createContext<AccountActions|null>(null);

/** Account actions behind the avatar, so no floating controls cover page content. */
export default function AccountMenu() {
 const account=useContext(AccountContext),[open,setOpen]=useState(false);
 if(!account)return <div className="avatar" aria-hidden="true">م</div>;
 const run=(action:()=>void)=>{setOpen(false);action()};
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button className="avatar account-trigger" aria-label={'حساب '+account.username} title={account.username}>{account.username.slice(0,1).toUpperCase()}</button></PopoverTrigger>
 <PopoverContent align="end" dir="rtl" className="account-menu"><div className="account-menu-head"><small>مسجل الدخول باسم</small><b dir="ltr">{account.username}</b></div>
 {account.onSwitchWorkspace&&<button className="account-menu-item" onClick={()=>run(account.onSwitchWorkspace!)}><LayoutGrid size={16}/> تغيير مساحة العمل</button>}
 <button className="account-menu-item" onClick={()=>run(account.onChangePassword)}><KeyRound size={16}/> تغيير كلمة المرور</button>
 <button className="account-menu-item danger" disabled={account.busy} onClick={()=>run(account.onLogout)}><LogOut size={16}/> خروج</button></PopoverContent></Popover>;
}
