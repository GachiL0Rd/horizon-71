import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterObjects,escapeHTML} from '../js/data.js';
const data=JSON.parse(await readFile(new URL('../data/objects.json',import.meta.url),'utf8'));
const state={query:'',scope:'completed',sector:'',district:'',year:''};
test('Archive completeness and usable coordinates',()=>{
  assert.equal(data.objects.length,95);assert.equal(new Set(data.objects.map(o=>o.id)).size,95);
  const completed=filterObjects(data.objects,state);assert.equal(completed.length,53);
  assert.ok(completed.every(o=>o.coordinates?.[0]>35&&o.coordinates?.[1]>52));
  assert.equal(data.objects.filter(o=>o.coordinates).length,58);
  assert.equal(data.objects.filter(o=>o.commissionYear===2025).length,18);
});
test('Combined filters never promote planned or 100% ready objects to commissioned',()=>{
  const result=filterObjects(data.objects,{...state,year:'2022',sector:'Образование'});
  assert.ok(result.length>0);assert.ok(result.every(o=>o.commissioned&&o.commissionYear===2022&&o.sector==='Образование'));
  assert.equal(filterObjects(data.objects,{...state,query:'Суворовский 2'}).length,0);
  assert.equal(filterObjects(data.objects,{...state,scope:'all',query:'Суворовский 2'}).length,1);
});
test('Search handles Cyrillic case and ё',()=>{
  assert.ok(filterObjects(data.objects,{...state,query:'ЩЕКИН'}).length>0);
  assert.equal(filterObjects(data.objects,{...state,query:'несуществующий объект 123'}).length,0);
});
test('Unsafe source text is escaped before rendering',()=>{assert.equal(escapeHTML('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');});
