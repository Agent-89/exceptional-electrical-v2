'use client';
import {useGoogleCalendar} from './google-calendar-context';
const keyFor=(iso:string)=>new Date(iso).toLocaleDateString('sv-SE',{timeZone:'Australia/Perth',year:'numeric',month:'2-digit',day:'2-digit'});
const timeFor=(iso:string)=>new Date(iso).toLocaleTimeString('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit'});
export default function NeilGoogleEvents({day,compact=false}:{day:string;compact?:boolean}){
 const {show,events}=useGoogleCalendar();
 if(!show)return null;
 const start=new Date(day+'T00:00:00+08:00').getTime(),end=start+86400000;
 const matching=events.filter(e=>new Date(e.start).getTime()<end&&new Date(e.end).getTime()>start);
 return <>{matching.map(e=><div className={'ee-neil-google-event'+(compact?' is-compact':'')} key={e.id} title={'Neil · '+e.title+' · '+timeFor(e.start)+' – '+timeFor(e.end)}><span className="ee-neil-google-mark">G</span><div><strong>{e.title||'Google event'}</strong><small>Neil · {keyFor(e.start)===day?timeFor(e.start):'Earlier'} – {keyFor(e.end)===day?timeFor(e.end):'Later'}</small></div></div>)}
 <style jsx global>{`
.ee-neil-google-event{display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:9px;border:1px solid #f0b8bd;border-left:3px solid #e35b68;border-radius:8px;background:#fff2f3;color:#7b2b34;min-width:0}
.ee-neil-google-event strong{display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ee-neil-google-event small{display:block;font-size:11px;margin-top:3px}
.ee-neil-google-mark{font-weight:800;color:#4285f4;font-size:15px}
.ee-neil-google-event.is-compact{padding:5px;gap:5px}.ee-neil-google-event.is-compact strong{font-size:11px}
`}</style></>;
}
