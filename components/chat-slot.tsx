import {useSyncExternalStore} from 'react';

// Headers mark where the chat button sits, beside the mail and notification icons. The chat itself is loaded later
// and lives outside the page, so it finds the slot here rather than through props. The paper files button has its own slot.
function headerSlot(className:string){
 let slots:HTMLElement[]=[];
 const listeners=new Set<()=>void>();
 const changed=()=>{for(const l of listeners)l()};
 function Slot(){
  return <span className={className} ref={el=>{if(!el)return;slots=[...slots,el];changed();return()=>{slots=slots.filter(s=>s!==el);changed()}}}/>;
 }
 /** The most recently shown header slot, or null on a page without one. */
 const useSlot=()=>useSyncExternalStore(l=>{listeners.add(l);return()=>{listeners.delete(l)}},()=>slots[slots.length-1]??null,()=>null);
 return [Slot,useSlot] as const;
}

export const [ChatSlot,useChatSlot]=headerSlot('chat-slot');
export const [PaperSlot,usePaperSlot]=headerSlot('chat-slot paper-slot');
