import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('tabs expose unique linked panels and exactly one sequential focus stop',()=>{
 const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {Tabs} from './apps/web/src/accessibility.tsx';
 const items=[{value:'first',label:'第一项'},{value:'second',label:'第二项'}];
 console.log(renderToStaticMarkup(React.createElement(Tabs,{label:'测试页签',items,value:'second',onChange:()=>{}},'当前内容')));
 `],{encoding:'utf8'});
 assert.match(output,/role="tablist" aria-label="测试页签"/);
 assert.equal((output.match(/role="tab"/g)??[]).length,2);
 assert.equal((output.match(/aria-selected="true" tabindex="0"/g)??[]).length,1);
 assert.match(output,/aria-selected="false" tabindex="-1"/);
 const tabs=[...output.matchAll(/role="tab" id="([^"]+)" aria-controls="([^"]+)"/g)];
 for(const [,tab,panel] of tabs){assert.ok(output.includes(`role="tabpanel" id="${panel}" aria-labelledby="${tab}"`));}
 assert.match(output,/hidden="" tabindex="0"><\/div>/);
 assert.equal((output.match(/当前内容/g)??[]).length,1);
});
