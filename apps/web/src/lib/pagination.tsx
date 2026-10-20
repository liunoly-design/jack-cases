import React,{useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {Button} from '../components/ui/button';
function ErrorLine({error}:{error:unknown}){return error?<p role="alert" className="text-sm text-red-600">{String((error as Error).message)}</p>:null;}
type Page<T>={items:T[];total:number;page:number;pageSize:number};
export function usePage<T>(key:string,path:string,filters:Record<string,string>={},enabled=true){
 const[sort,setSort]=useState('newest'),[pageSize,setPageSize]=useState(20);
 const signature=JSON.stringify([path,filters,sort,pageSize]);
 const[position,setPosition]=useState({signature,page:1});
 const page=position.signature===signature?position.page:1;
 const setPage=(next:number)=>setPosition({signature,page:next});
 const params=new URLSearchParams({...filters,page:String(page),pageSize:String(pageSize),sort});
 const url=path+(path.includes('?')?'&':'?')+params;
 const query=useQuery<Page<T>>({queryKey:[key,url],queryFn:()=>api(url),enabled});
 const total=query.data?.total??0,last=Math.max(1,Math.ceil(total/pageSize));
 useEffect(()=>{if(position.signature!==signature)setPosition({signature,page:1});else if(query.data&&page>last)setPosition({signature,page:last});},[query.data,page,last,signature,position.signature]);
 const controls=<div className="space-y-2"><ErrorLine error={query.error}/>{query.error&&<Button variant="outline" onClick={()=>query.refetch()}>重新载入</Button>}<nav aria-label="列表分页" className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 text-sm"><p role="status" className="mr-auto tabular-nums">{query.isFetching?'正在载入…':`共 ${total} 条 · 第 ${page} / ${last} 页`}</p><select aria-label="列表排序" className="min-h-11 rounded-md border px-2" value={sort} onChange={e=>setSort(e.target.value)}><option value="newest">最新优先</option><option value="oldest">最早优先</option></select><select aria-label="每页条数" className="min-h-11 rounded-md border px-2" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[20,50,100].map(n=><option key={n} value={n}>每页 {n} 条</option>)}</select><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={page===1||query.isFetching} onClick={()=>setPage(1)}>首页</Button><Button variant="outline" disabled={page===1||query.isFetching} onClick={()=>setPage(page-1)}>上一页</Button><Button variant="outline" disabled={!query.data||page>=last||query.isFetching} onClick={()=>setPage(page+1)}>下一页</Button><Button variant="outline" disabled={!query.data||page>=last||query.isFetching} onClick={()=>setPage(last)}>末页</Button></div></nav></div>;
 return {...query,items:query.data?.items??[],total,controls};
}
