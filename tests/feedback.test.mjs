import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'tsx/esm/api';
register();
const {api,currentUser,HttpError,copyText,errorMessage}=await import('../apps/web/src/lib/api.ts');
const {createPrivateClient,disposePrivateClient,publicClient}=await import('../apps/web/src/lib/queries.ts');

test('HTTP errors are safe Chinese messages; only /me 401 means signed out',async t=>{
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 for(const status of [400,401,403,404,409,429,500,503]){
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'secret-token /private/database stack'}),{status});
  if(status===401)assert.equal(await currentUser(),null);
  else await assert.rejects(currentUser(),e=>e instanceof HttpError&&e.status===status&&/[\u4e00-\u9fff]/.test(e.message)&&!e.message.includes('secret'));
 }
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch secret');};
 await assert.rejects(currentUser(),TypeError);
 assert.equal(errorMessage(new Error('服务器错误 secret-token')),'网络连接失败，请检查网络后重试。');
 assert.equal(errorMessage(new TypeError('Failed to fetch secret')),'网络连接失败，请检查网络后重试。');
 globalThis.fetch=async()=>new Response('<html>upstream proxy stack</html>',{status:502});
 await assert.rejects(api('/requirements'),e=>e.status===502&&!e.message.includes('stack'));
 globalThis.fetch=async()=>new Response('not json',{status:200});
 await assert.rejects(api('/requirements'),e=>e.status===502);
});

test('failed query can retry to a successful empty result',async t=>{
 const original=globalThis.fetch;const client=createPrivateClient();t.after(()=>{globalThis.fetch=original;disposePrivateClient(client);});
 let requests=0;globalThis.fetch=async()=>++requests===1?new Response('{}',{status:500}):new Response('[]');
 const options={queryKey:['requirements'],queryFn:({signal})=>api('/requirements',{signal})};
 await assert.rejects(client.fetchQuery(options),HttpError);
 assert.equal(client.getQueryState(options.queryKey).status,'error');
 assert.deepEqual(await client.fetchQuery(options),[]);
 assert.equal(client.getQueryState(options.queryKey).status,'success');
 assert.equal(requests,2);
});

test('switching accounts aborts private fetches, removes inactive attachments and cannot repopulate old cache',async()=>{
 const old=createPrivateClient();const next=createPrivateClient();
 publicClient.setQueryData(['categories','/categories'],[{id:'public'}]);
 old.setQueryData(['file-library'],[{id:'private-file',url:'/private/a'}]);
 old.setQueryData(['keys'],[{secretValue:'private-secret'}]);
 let signal,resolve;
 const pending=old.fetchQuery({queryKey:['requirements'],queryFn:context=>{signal=context.signal;return new Promise(done=>{resolve=done;});}}).catch(()=>{});
 disposePrivateClient(old);
 assert.equal(signal.aborted,true);
 assert.equal(old.getQueryCache().getAll().length,0);
 resolve([{id:'private-late-result'}]);await pending;await Promise.resolve();
 assert.equal(old.getQueryCache().getAll().length,0);
 assert.equal(next.getQueryData(['requirements']),undefined);
 assert.equal(next.getQueryData(['file-library']),undefined);
 assert.deepEqual(publicClient.getQueryData(['categories','/categories']),[{id:'public'}]);
 disposePrivateClient(next);publicClient.clear();
});

test('clipboard permission rejection gives recovery guidance without leaking original error',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');t.after(()=>{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw Error('permission denied secret');}}}});
 await assert.rejects(copyText('fixture'),e=>e.message==='复制失败，请允许剪贴板权限，或手动选择文本复制。');
});
