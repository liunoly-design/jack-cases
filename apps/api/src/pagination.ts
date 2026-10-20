import { z } from 'zod';

const integerParameter=(max:number)=>z.string().regex(/^[1-9]\d*$/, 'Expected a positive integer').transform(Number).refine(n=>Number.isSafeInteger(n)&&n<=max,`Must be at most ${max}`);
export const paginationShape={
  page:integerParameter(1_000_000).optional(),
  pageSize:integerParameter(100).optional(),
  sort:z.enum(['newest','oldest']).default('newest'),
};
export function pagination(query:{page?:number;pageSize?:number;sort:string}){
  const explicit=query.page!==undefined||query.pageSize!==undefined;
  const page=query.page??1,pageSize=query.pageSize??(explicit?20:200);
  return {explicit,page,pageSize,offset:(page-1)*pageSize};
}
export function pageResponse<T>(items:T[],total:number,p:ReturnType<typeof pagination>){
  return p.explicit?{items,total,page:p.page,pageSize:p.pageSize}:items;
}
