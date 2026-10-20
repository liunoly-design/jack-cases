import test from 'node:test';
import assert from 'node:assert/strict';
import {tsImport} from 'tsx/esm/api';
const {draftKey,readDraft,writeDraft,sanitizeDraft,privatePayload,publicationPayload}=await tsImport('../apps/web/src/lib/draft-storage.ts',import.meta.url);
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('drafts isolate users, records, new/edit/manage scopes and preserve long MD',()=>{
 const s=storage(),md='# 背景\n\n'+('**业务事实**与待确认事项\n'.repeat(1200));
 const keys=[draftKey('alice','new'),draftKey('bob','new'),draftKey('alice','edit:1'),draftKey('alice','edit:2'),draftKey('alice','manage:1')];
 keys.forEach((k,i)=>writeDraft(s,k,{content:md+i}));keys.forEach((k,i)=>assert.equal(readDraft(s,k).content,md+i));assert.equal(readDraft(s,draftKey('other','edit:1')),null);
 s.removeItem(keys[0]);assert.equal(readDraft(s,keys[0]),null);assert.equal(readDraft(s,keys[1]).content,md+1);
});
test('whitelist excludes secrets, File data and server version/identity; retains uploaded metadata',()=>{
 const file={id:'uploaded',url:'/api/files/uploaded/content',name:'资料.md',purpose:'agent',mimeType:'text/markdown',size:5,approved:false,password:'never'};
 const data=sanitizeDraft({title:'需求',content:'正文',apiKey:'secret',session:'cookie',userId:'other',contentVersion:'v99',requirementCode:'fake',materials:[file,{name:'pending',size:2},{id:'invalid',url:'/api/files/invalid'}],photos:[{id:'photo',url:'/api/media/photo/content',rawBytes:'never'}],files:[new Blob(['never'])]});
 assert.deepEqual(Object.keys(data).sort(),['content','materials','photos','title']);assert.deepEqual(data.materials,[Object.fromEntries(Object.entries(file).filter(([k])=>k!=='password'))]);assert.deepEqual(data.photos,[{id:'photo',url:'/api/media/photo/content'}]);
});
test('malformed/old storage is ignored and quota errors surface without replacing existing draft',()=>{
 const s=storage(),key=draftKey('u','edit:1');s.setItem(key,'{');assert.equal(readDraft(s,key),null);s.setItem(key,JSON.stringify({schema:1,data:null}));assert.equal(readDraft(s,key),null);s.setItem(key,JSON.stringify({schema:0,data:{content:'old'}}));assert.equal(readDraft(s,key),null);
 writeDraft(s,key,{content:'recover me'});assert.throws(()=>writeDraft({setItem(){throw Error('quota');}},key,{content:'new'}),/quota/);assert.equal(readDraft(s,key).content,'recover me');
});
test('private save and publication payloads cannot mix raw content or unapproved attachments',()=>{
 const input={title:'私有企业名称',content:'私有原始MD',publicTitle:'公开标题',summary:'人工审核摘要',rprompt:'# 公开正文',bprompt:'搭建提示词',categoryId:'',materials:[{id:'private',approved:false},{id:'approved',approved:true}],photos:[{id:'private-photo'},{id:'approved-photo'}],coverId:'private-photo',approved:['approved-photo'],apiKey:'never',contentVersion:'v99'};
 const priv=privatePayload(input),pub=publicationPayload(input);
 assert.equal(priv.content,'私有原始MD');assert.deepEqual(priv.fileIds,['private','approved']);assert.equal(priv.categoryId,null);assert.deepEqual(priv.mediaIds,['private-photo','approved-photo']);assert.equal(priv.coverMediaId,'private-photo');assert.ok(!('publicTitle' in priv));assert.ok(!('contentVersion' in priv));
 assert.deepEqual(pub,{decision:'approve',title:'公开标题',summary:'人工审核摘要',requirementPrompt:'# 公开正文',buildPrompt:'搭建提示词',approvedMediaIds:['approved-photo'],approvedFileIds:['approved']});assert.ok(!JSON.stringify(pub).includes('私有'));assert.ok(!JSON.stringify(pub).includes('never'));
});
