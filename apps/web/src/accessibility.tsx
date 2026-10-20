import React, {useEffect, useId, useRef} from 'react';
import {useLocation} from 'react-router-dom';

/** A disclosure keeps native Enter/Space behavior and restores focus on Escape. */
export function MobileNavigation({label,children}:{label:string;children:React.ReactNode}) {
 const ref=useRef<HTMLDetailsElement>(null);
 const location=useLocation();
 useEffect(()=>{if(ref.current)ref.current.open=false;},[location]);
 return <details ref={ref} className="relative w-full md:hidden" onKeyDown={event=>{
  if(event.key==='Escape'&&ref.current?.open){event.preventDefault();ref.current.open=false;ref.current.querySelector('summary')?.focus();}
 }}><summary className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg border bg-white px-3 text-sm font-medium">{label}</summary><nav aria-label={label} className="mt-2 space-y-1 rounded-lg border bg-white p-2" onClick={event=>{
  if((event.target as HTMLElement).closest('a,button')&&ref.current){ref.current.open=false;ref.current.querySelector('summary')?.focus();}
 }}>{children}</nav></details>;
}

export function Tabs({label,items,value,onChange,children,hideTabs=false}:{hideTabs?:boolean;label:string;items:{value:string;label:string}[];value:string;onChange:(value:string)=>void;children:React.ReactNode}) {
 const id=useId();
 const refs=useRef<(HTMLButtonElement|null)[]>([]);
 if(hideTabs)return <>{children}</>;
 return <><div role="tablist" aria-label={label} className="flex flex-wrap gap-2 border-b border-slate-200">{items.map((item,index)=><button key={item.value} ref={element=>{refs.current[index]=element;}} type="button" role="tab" id={`${id}-tab-${item.value}`} aria-controls={`${id}-panel-${item.value}`} aria-selected={value===item.value} tabIndex={value===item.value?0:-1} className={'rounded-t-lg px-4 py-3 text-sm font-medium '+(value===item.value?'border-b-2 border-orange-500 text-orange-700':'text-slate-600 hover:text-slate-800')} onClick={()=>onChange(item.value)} onKeyDown={event=>{
  let next=index;
  if(event.key==='ArrowRight')next=(index+1)%items.length;
  else if(event.key==='ArrowLeft')next=(index-1+items.length)%items.length;
  else if(event.key==='Home')next=0;
  else if(event.key==='End')next=items.length-1;
  else return;
  event.preventDefault();onChange(items[next].value);refs.current[next]?.focus();
 }}>{item.label}</button>)}</div>{items.map(item=><div key={item.value} role="tabpanel" id={`${id}-panel-${item.value}`} aria-labelledby={`${id}-tab-${item.value}`} hidden={value!==item.value} tabIndex={0}>{value===item.value?children:null}</div>)}</>;
}
