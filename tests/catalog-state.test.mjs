import test from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'tsx/esm/api';
register();
const {parseCatalogState,catalogSearch,updateCatalogState,catalogReturnPath}=await import('../apps/web/src/lib/catalog-state.ts');
test('shared URL roundtrips every catalog control independently of local view preference',()=>{
 const s=parseCatalogState('?q=临期&categoryId=c&industry=医药流通&difficulty=hard&implementationStatus=building&tagIds=a,b,a&view=list&page=3&pageSize=50&sort=oldest');
 assert.deepEqual(s.tagIds,['a','b']);assert.equal(s.page,3);
 assert.deepEqual(parseCatalogState(catalogSearch(s),'grid'),s);
 assert.equal(parseCatalogState('','list').view,'list');
 assert.equal(parseCatalogState('?view=grid','list').view,'grid');
});
test('invalid values and unknown loaded options fall back without leaking arbitrary query data',()=>{
 const s=parseCatalogState('?page=2.3&pageSize=200&sort=bad&view=bad&difficulty=no&implementationStatus=no&categoryId=missing&industry=missing&tagIds=known,missing&apiKey=secret','list',{categoryIds:['c'],industries:['医院'],tagIds:['known']});
 assert.equal(s.page,1);assert.equal(s.pageSize,20);assert.equal(s.view,'list');assert.equal(s.sort,'newest');assert.equal(s.categoryId,'');assert.equal(s.industry,'');assert.deepEqual(s.tagIds,['known']);assert.ok(!catalogSearch(s).includes('secret'));
 for(const page of ['-1','0','Infinity','1e3','9999999999999999999'])assert.equal(parseCatalogState('?page='+page).page,1);
 // Pending option requests must not discard valid deep links.
 assert.equal(parseCatalogState('?categoryId=c').categoryId,'c');
});
test('filter, sort and size changes reset page; view and page navigation preserve conditions',()=>{
 const s=parseCatalogState('?q=医疗&industry=医院&page=4');
 for(const patch of [{q:'库存'},{categoryId:'c'},{industry:''},{difficulty:'easy'},{implementationStatus:'completed'},{tagIds:['t']},{sort:'oldest'},{pageSize:50}])assert.equal(updateCatalogState(s,patch).page,1);
 assert.equal(updateCatalogState(s,{view:'list'}).page,4);
 assert.equal(updateCatalogState(s,{page:2}).industry,'医院');
});
test('detail return accepts only root catalog and sanitises nested state',()=>{
 for(const url of [null,'https://evil.test','//evil.test','/cases/x','/\\evil.test','/?returnTo=https://evil.test'])assert.equal(catalogReturnPath(url),url?.startsWith('/?')?'/?view=grid':'/');
 assert.equal(catalogReturnPath('/?q=医疗&page=2&view=list'),'/'+catalogSearch(parseCatalogState('?q=医疗&page=2&view=list')));
});
