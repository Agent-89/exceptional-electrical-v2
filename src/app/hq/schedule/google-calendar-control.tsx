'use client';
import {useState} from 'react';
import {EyeOff,Settings2} from 'lucide-react';
export default function GoogleCalendarControl({connected,email,error,show,onToggle,canManage}:{connected:boolean;email:string|null;error:boolean;show:boolean;onToggle:()=>void;canManage:boolean}){
 const [settings,setSettings]=useState(false);
 return <div className="ee-google-control">
  {connected?<button type="button" onClick={onToggle} aria-pressed={show} aria-label={show?'Hide Google Calendar events':'Show Google Calendar events'} title={show?'Hide Google Calendar events':'Show Google Calendar events'} className={'ee-google-toggle'+(show?' is-on':'')}><span className="ee-google-g">G</span>{!show&&<span className="ee-google-off" aria-hidden="true"/>}</button>:canManage?<a className="ee-google-connect" href="/hq/google-calendar/connect" title="Connect Google Calendar"><span className="ee-google-g">G</span><span>Connect</span></a>:null}
  {connected&&canManage&&<button type="button" className="ee-google-settings" title="Google Calendar connection settings" aria-label="Google Calendar settings" onClick={()=>setSettings(v=>!v)}><Settings2 size={17}/></button>}
  {settings&&<div className="ee-google-popover"><strong>Google Calendar</strong><p>{email??'Connected account'} · {error?'Refresh failed':'Connected'}</p><p>External events affect Neil only. Hiding events does not change his availability.</p><form action="/api/integrations/google-calendar/disconnect" method="post"><button type="submit">Disconnect account</button></form></div>}
  {error&&<span className="ee-google-error" title="Google events could not be refreshed" role="status">!</span>}
  <style jsx global>{`
   .ee-google-control{display:flex;align-items:center;gap:5px;margin-left:auto;position:relative}
   .ee-google-toggle,.ee-google-connect,.ee-google-settings{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;min-width:38px;border:1px solid #d7e3ed;background:white;border-radius:9px;cursor:pointer;color:#28465c;text-decoration:none;padding:0 9px}
   .ee-google-toggle.is-on{border-color:#b7d5ef;background:#f1f8ff}
   .ee-google-g{font-family:Arial,sans-serif;font-weight:800;font-size:23px;line-height:1;letter-spacing:-2px;color:#4285f4}
   .ee-google-toggle{position:relative}.ee-google-off{position:absolute;width:29px;height:2px;background:#db4545;transform:rotate(-42deg);box-shadow:0 0 0 2px white}
   .ee-google-connect span:last-child{font-size:12px;font-weight:700}.ee-google-settings{min-width:32px;padding:0 7px}
   .ee-google-popover{position:absolute;right:0;top:44px;width:min(300px,85vw);z-index:30;background:white;border:1px solid #d7e3ed;box-shadow:0 12px 30px #14354a22;border-radius:12px;padding:14px;font-size:12px}
   .ee-google-popover p{margin:7px 0;color:#64748b;line-height:1.5}.ee-google-popover button{padding:8px 10px;border:1px solid #d7e3ed;border-radius:7px;background:#fff;cursor:pointer}
   .ee-google-error{color:#b45309;font-weight:900}
   @media(max-width:760px){.ee-google-control{margin-left:auto}.ee-google-toggle,.ee-google-connect{height:40px}}
  `}</style>
 </div>;
}
