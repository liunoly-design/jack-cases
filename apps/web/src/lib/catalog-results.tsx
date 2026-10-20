import React,{useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {Button} from '../components/ui/button';
import {catalogApiSearch,type CatalogState} from './catalog-state';
type CatalogItem={title:string;summary:string;categoryId?:string;industry?:string;difficulty?:string;implementationStatus?:string;tags?:{id:string}[]};
type CatalogPage<T>={items:T[];total:number;page:number;pageSize:number};
/** Bridge to #20's paginated contract without importing its commits or pagination state. */
export function useCatalogResults<T extends CatalogItem>(state:CatalogState,categories:{id:string;parentId:string|null}[],update:(patch:Partial<CatalogState>,replace?:boolean)=>void){
 const url='/cases'+catalogApiSearch(state);
 const query=useQuery<CatalogPage<T>|T[]>({queryKey:['cases',url],queryFn:()=>api(url)});
 const legacy=Array.isArray(query.data),data=query.data;
 const facets=useQuery<{industries:string[];total:number}>({queryKey:['cases','/cases/facets'],queryFn:()=>api('/cases/facets'),enabled:!!data&&!legacy});
 // Main before #20 returns an array and ignores pagination parameters. Preserve its UI
 // until the server contract is present; never locally filter a paginated response.
 const rows=Array.isArray(data)?data:[];
 const industries=legacy?[...new Set(rows.map(c=>c.industry).filter((v):v is string=>!!v))]:facets.data?.industries;
 const items=Array.isArray(data)?rows.filter(c=>(!state.industry||c.industry===state.industry)&&(!state.difficulty||c.difficulty===state.difficulty)&&(!state.implementationStatus||c.implementationStatus===state.implementationStatus)&&(!state.tagIds.length||state.tagIds.some(t=>c.tags?.some(x=>x.id===t)))&&(!state.categoryId||c.categoryId===state.categoryId||categories.some(x=>x.parentId===state.categoryId&&x.id===c.categoryId))&&(c.title+' '+c.summary).toLowerCase().includes(state.q.toLowerCase())):data?.items??[];
 const total=Array.isArray(data)?items.length:data?.total??0,last=Math.max(1,Math.ceil(total/state.pageSize));
 const industrySignature=industries?.join('\0');
 useEffect(()=>{if(industries&&state.industry&&!industries.includes(state.industry))update({industry:''},true);},[industrySignature,state.industry]);
 useEffect(()=>{if(data&&!Array.isArray(data)&&state.page>last)update({page:last},true);},[data,state.page,last]);
 const controls=!data||legacy?null:<nav aria-label="列表分页" className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 text-sm"><p role="status" className="mr-auto tabular-nums">{query.isFetching?'正在载入…':`共 ${total} 条 · 第 ${state.page} / ${last} 页`}</p><select aria-label="列表排序" className="min-h-11 rounded-md border px-2" value={state.sort} onChange={e=>update({sort:e.target.value as CatalogState['sort']})}><option value="newest">最新优先</option><option value="oldest">最早优先</option></select><select aria-label="每页条数" className="min-h-11 rounded-md border px-2" value={state.pageSize} onChange={e=>update({pageSize:Number(e.target.value)})}>{[20,50,100].map(n=><option key={n} value={n}>每页 {n} 条</option>)}</select><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={state.page===1||query.isFetching} onClick={()=>update({page:1})}>首页</Button><Button variant="outline" disabled={state.page===1||query.isFetching} onClick={()=>update({page:state.page-1})}>上一页</Button><Button variant="outline" disabled={state.page>=last||query.isFetching} onClick={()=>update({page:state.page+1})}>下一页</Button><Button variant="outline" disabled={state.page>=last||query.isFetching} onClick={()=>update({page:last})}>末页</Button></div></nav>;
 return {items,total,controls,isLoading:query.isLoading,error:query.error??facets.error,industries:industries??[],allTotal:legacy?rows.length:facets.data?.total??0};
}
