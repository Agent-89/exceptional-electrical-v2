'use client';
import {createContext,useContext} from 'react';
export type GoogleEvent={id:string;title:string;start:string;end:string;busy:boolean;url:string|null};
export const GoogleCalendarContext=createContext<{show:boolean;events:GoogleEvent[]}>({show:false,events:[]});
export const useGoogleCalendar=()=>useContext(GoogleCalendarContext);
