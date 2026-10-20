import React from 'react';
import {errorMessage} from './lib/api';
import {Button} from './components/ui/button';
export function ErrorLine({error,retry}:{error:unknown;retry?:()=>unknown}){return error?<div role="alert" className="space-y-2 text-sm text-red-700"><p>{errorMessage(error)}</p>{retry&&<Button type="button" variant="outline" onClick={()=>void retry()}>重试</Button>}</div>:null;}
export function QueryFeedback({query,label='内容',emptyLabel}:{query:{isPending:boolean;error:unknown;refetch:()=>unknown;data?:unknown};label?:string;emptyLabel?:string}){return query.error?<ErrorLine error={query.error} retry={query.refetch}/>:query.isPending?<p role="status" className="text-sm text-slate-600">正在加载{label}…</p>:emptyLabel&&Array.isArray(query.data)&&query.data.length===0?<p role="status" className="text-sm text-slate-600">{emptyLabel}</p>:null;}
export const statusLabel=(status:string)=>({submitted:'待审核',published:'已发布',rejected:'已退回',draft:'草稿',archived:'已下架',active:'启用',disabled:'已禁用',private:'私有',approved:'已审核',pending:'待实现',building:'开发中',completed:'已实现',verified:'已验证'}[status]??'状态待确认');
