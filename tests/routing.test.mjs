import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRouting} from '../routing.mjs';

test('Real routing adapter requests reverse pedestrian contours, caches both times, and limits calls',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'tula-routing-test-'));
 const originalFetch=globalThis.fetch;
 const geometry={type:'Polygon',coordinates:[[[37,54],[37.01,54],[37,54.01],[37,54]]]};
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;
  const query=JSON.parse(new URL(url).searchParams.get('json'));
  assert.equal(query.reverse,true);assert.equal(query.costing,'pedestrian');assert.equal(query.polygons,true);
  assert.deepEqual(query.contours,[{time:10},{time:15}]);
  assert.ok(options.headers['X-Client-Id']);
  return new Response(JSON.stringify({features:[10,15].map(contour=>({properties:{contour},geometry}))}),{status:200});
 };
 try{
  const route=await createRouting(root);
  const first=await route({coordinates:[37,54]},10);assert.equal(first.direction,'to');assert.equal(first.cached,false);
  const second=await route({coordinates:[37,54]},15);assert.equal(second.cached,true);assert.equal(calls,1);
  await assert.rejects(()=>route({coordinates:[37.1,54]},10),error=>error.status===429);
 }finally{globalThis.fetch=originalFetch;}
});
test('Bundled demo cache works without any upstream request',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'tula-demo-test-'));await mkdir(path.join(root,'data'));
 const geometry={type:'Polygon',coordinates:[[[37,54],[37.01,54],[37,54.01],[37,54]]]};
 await writeFile(path.join(root,'data/isochrones.json'),JSON.stringify({'37,54:pedestrian:reverse:v1':{contours:{10:geometry},direction:'to',calculatedAt:'2026-09-11T00:00:00Z'}}));
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Network should not be called');};
 try{const route=await createRouting(root);const result=await route({coordinates:[37,54]},10);assert.deepEqual(result.geometry,geometry);assert.equal(result.cached,true);}
 finally{globalThis.fetch=originalFetch;}
});
