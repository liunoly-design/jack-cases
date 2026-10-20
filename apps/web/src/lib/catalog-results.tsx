import {useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {usePage} from './pagination';
import {catalogApiSearch,type CatalogState} from './catalog-state';
/** URL-controlled adapter to the shared server pagination controls. */
export function useCatalogResults<T>(state:CatalogState,update:(patch:Partial<CatalogState>,replace?:boolean)=>void){
 const filters=Object.fromEntries(new URLSearchParams(catalogApiSearch(state)));
 delete filters.page;delete filters.pageSize;delete filters.sort;
 const query=usePage<T>('cases','/cases',filters,true,{page:state.page,pageSize:state.pageSize,sort:state.sort,onChange:update});
 const facets=useQuery<{industries:string[];total:number}>({queryKey:['cases','/cases/facets'],queryFn:()=>api('/cases/facets')});
 const industries=facets.data?.industries;
 useEffect(()=>{if(industries&&state.industry&&!industries.includes(state.industry))update({industry:''},true);},[industries,state.industry]);
 return {...query,error:query.error??facets.error,industries:industries??[],allTotal:facets.data?.total??0};
}
