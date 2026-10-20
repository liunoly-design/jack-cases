/** Only public catalog controls are serialised; arbitrary query data is discarded. */
export type CatalogState={q:string;categoryId:string;industry:string;difficulty:string;implementationStatus:string;tagIds:string[];view:'grid'|'list';page:number;pageSize:number;sort:'newest'|'oldest'};
export type CatalogOptions={categoryIds?:string[];industries?:string[];tagIds?:string[]};
const choice=(value:string|null,values:readonly string[],fallback='')=>value&&values.includes(value)?value:fallback;
const text=(value:string|null,max:number)=>(value??'').trim().slice(0,max);
export function parseCatalogState(search:string,defaultView='grid',options:CatalogOptions={}):CatalogState{
 const p=new URLSearchParams(search);
 const allowed=(value:string,values?:string[])=>!values||values.includes(value)?value:'';
 const page=p.get('page')??'';
 return {q:text(p.get('q'),500),categoryId:allowed(text(p.get('categoryId'),100),options.categoryIds),industry:allowed(text(p.get('industry'),200),options.industries),difficulty:choice(p.get('difficulty'),['easy','medium','hard']),implementationStatus:choice(p.get('implementationStatus'),['pending','building','completed','verified']),tagIds:[...new Set((p.get('tagIds')??'').split(',').map(v=>v.trim()).filter(v=>v&&v.length<=100&&(!options.tagIds||options.tagIds.includes(v))))].slice(0,12),view:choice(p.get('view'),['grid','list'],defaultView==='list'?'list':'grid') as CatalogState['view'],page:/^[1-9]\d*$/.test(page)&&Number.isSafeInteger(Number(page))?Number(page):1,pageSize:Number(choice(p.get('pageSize'),['20','50','100'],'20')),sort:choice(p.get('sort'),['newest','oldest'],'newest') as CatalogState['sort']};
}
export function catalogSearch(state:CatalogState):string{
 const p=new URLSearchParams();
 for(const key of ['q','categoryId','industry','difficulty','implementationStatus'] as const)if(state[key])p.set(key,state[key]);
 if(state.tagIds.length)p.set('tagIds',state.tagIds.join(','));
 // Always make the view explicit so shared links override the recipient's preference.
 p.set('view',state.view);
 if(state.page!==1)p.set('page',String(state.page));
 if(state.pageSize!==20)p.set('pageSize',String(state.pageSize));
 if(state.sort!=='newest')p.set('sort',state.sort);
 return '?'+p.toString();
}
export function updateCatalogState(state:CatalogState,patch:Partial<CatalogState>):CatalogState{
 const resetsPage=['q','categoryId','industry','difficulty','implementationStatus','tagIds','pageSize','sort'].some(key=>key in patch);
 return {...state,...patch,...(resetsPage?{page:1}:{})};
}
/** Details may return only to this app's root catalog, never an arbitrary redirect. */
export function catalogReturnPath(value:string|null):string{
 if(!value||!(value==='/'||value.startsWith('/?')))return '/';
 return '/'+catalogSearch(parseCatalogState(value.slice(1)));
}
