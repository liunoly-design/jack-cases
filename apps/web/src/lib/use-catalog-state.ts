import {useEffect,useState} from 'react';
import {useLocation,useSearchParams} from 'react-router-dom';
import {catalogSearch,parseCatalogState,updateCatalogState,type CatalogOptions,type CatalogState} from './catalog-state';
export function useCatalogState(options:CatalogOptions){
 const location=useLocation();
 const[,setSearch]=useSearchParams();
 const[defaultView]=useState(()=>{try{return localStorage.getItem('jack-catalog-view')??'grid';}catch{return 'grid';}});
 const state=parseCatalogState(location.search,defaultView,options);
 const canonical=catalogSearch(state);
 useEffect(()=>{if(location.search!==canonical)setSearch(canonical,{replace:true});},[location.search,canonical,setSearch]);
 const update=(patch:Partial<CatalogState>,replace=false)=>setSearch(catalogSearch(updateCatalogState(state,patch)),{replace});
 // Associate draft text with the current history entry: POP navigation cancels stale input.
 const[draft,setDraft]=useState({key:location.key,value:state.q});
 const filter=draft.key===location.key?draft.value:state.q;
 useEffect(()=>{
  if(draft.key!==location.key||draft.value===state.q)return;
  const timer=setTimeout(()=>update({q:draft.value}),350);
  return ()=>clearTimeout(timer);
 },[draft,location.key,location.search,state.q]);
 const changeView=(grid:boolean)=>{
  const view=grid?'grid':'list';update({view});
  try{localStorage.setItem('jack-catalog-view',view);}catch{/* URL still works when storage is disabled. */}
 };
 const clear=()=>{setDraft({key:location.key,value:''});update({q:'',categoryId:'',industry:'',difficulty:'',implementationStatus:'',tagIds:[]});};
 return {state,filter,setFilter:(value:string)=>setDraft({key:location.key,value}),update,changeView,clear,returnTo:'/'+canonical};
}
