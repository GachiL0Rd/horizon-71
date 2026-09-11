import {readFile,writeFile} from 'node:fs/promises';
import {setTimeout} from 'node:timers/promises';
// Three demonstration objects only. Never bulk-query the public routing service.
const {objects}=JSON.parse(await readFile('data/objects.json','utf8'));
for(const row of [1,4,55]){
 const object=objects.find(o=>o.sourceRow===row);
 const response=await fetch(`http://localhost:8080/api/isochrone?id=${object.id}&minutes=10`);
 const result=await response.json();
 if(!response.ok)throw new Error(result.error);
 console.log(`Prepared object ${row}: 10 and 15 minute pedestrian contours`);
 await setTimeout(1300);
}
const cache=JSON.parse(await readFile('.local/isochrones.json','utf8'));
const keys=new Set(objects.filter(o=>[1,4,55].includes(o.sourceRow)).map(o=>o.coordinates.join(',')+':pedestrian:reverse:v1'));
await writeFile('data/isochrones.json',JSON.stringify(Object.fromEntries(Object.entries(cache).filter(([key])=>keys.has(key)))));
