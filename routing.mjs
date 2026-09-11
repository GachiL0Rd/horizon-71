import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';

export async function createRouting(root){
  let cache={};
  for(const file of ['data/isochrones.json','.local/isochrones.json']){
    try{Object.assign(cache,JSON.parse(await readFile(path.join(root,file),'utf8')));}catch(error){if(error.code!=='ENOENT')console.warn('Could not read isochrone cache:',file);}
  }
  let nextRequest=0,writeQueue=Promise.resolve();
  return async function route(object,minutes){
    const key=object.coordinates.join(',')+':pedestrian:reverse:v1';
    if(cache[key]?.contours?.[minutes])return {...cache[key],geometry:cache[key].contours[minutes],contours:undefined,minutes,cached:true};
    if(Date.now()<nextRequest){const error=new Error('Сервис занят. Повторите запрос через секунду.');error.status=429;throw error;}
    nextRequest=Date.now()+1200;
    const upstream=new URL('/isochrone',process.env.VALHALLA_URL||'https://valhalla1.openstreetmap.de');
    const [lon,lat]=object.coordinates;
    upstream.searchParams.set('json',JSON.stringify({locations:[{lon,lat}],costing:'pedestrian',contours:[{time:10},{time:15}],polygons:true,reverse:true,denoise:.5}));
    const response=await fetch(upstream,{headers:{'User-Agent':'Horizon71Hackathon/1.0 (local MVP)','X-Client-Id':'horizon71-hackathon-local-mvp'},signal:AbortSignal.timeout(20000)});
    if(!response.ok){const error=new Error(`Сервис пешеходного расчёта временно недоступен (код ${response.status}). Попробуйте позже.`);error.status=502;throw error;}
    const result=await response.json();
    const contours={};
    for(const feature of result.features||[]){
      const time=Number(feature.properties?.contour);
      if([10,15].includes(time)&&['Polygon','MultiPolygon'].includes(feature.geometry?.type))contours[time]=feature.geometry;
    }
    if(!contours[minutes])throw new Error('Сервис не смог построить область для этого объекта.');
    cache[key]={contours,coordinates:object.coordinates,provider:'Valhalla · OpenStreetMap',providerUrl:'https://valhalla.openstreetmap.de',direction:'to',calculatedAt:new Date().toISOString()};
    writeQueue=writeQueue.then(async()=>{await mkdir(path.join(root,'.local'),{recursive:true});await writeFile(path.join(root,'.local/isochrones.json'),JSON.stringify(cache));}).catch(()=>console.warn('Isochrone cache could not be saved'));
    return {...cache[key],geometry:contours[minutes],contours:undefined,minutes,cached:false};
  };
}
