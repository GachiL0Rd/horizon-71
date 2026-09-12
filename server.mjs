import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRouting} from './routing.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
try {
  const env=await readFile(path.join(root,'.env'),'utf8');
  for(const line of env.split(/\r?\n/)){
    const match=line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
} catch(error) { if(error.code!=='ENOENT')throw error; }

const data=JSON.parse(await readFile(path.join(root,'data/objects.json'),'utf8'));
const route=await createRouting(root);
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.geojson':'application/geo+json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};

const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Метод не поддерживается'});
    if(url.pathname==='/api/config')return json(res,200,{mapAvailable:Boolean(process.env.YANDEX_MAPS_KEY),isochrone:true,isochroneProvider:'Valhalla · OpenStreetMap'});
    if(url.pathname==='/api/yandex-maps.js'){
      if(!process.env.YANDEX_MAPS_KEY)return json(res,503,{error:'На сервере не задан ключ Яндекс Карт.'});
      const upstream=new URL('https://api-maps.yandex.ru/2.1/');
      upstream.searchParams.set('apikey',process.env.YANDEX_MAPS_KEY);upstream.searchParams.set('lang','ru_RU');
      const response=await fetch(upstream,{headers:{'User-Agent':'Horizon71/1.0'},signal:AbortSignal.timeout(20000)});
      if(!response.ok)return json(res,502,{error:'Не удалось загрузить JavaScript API Яндекс Карт.'});
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(req.method==='HEAD'?undefined:await response.text());
    }
    if(url.pathname==='/api/isochrone'){
      const object=data.objects.find(o=>o.id===url.searchParams.get('id'));
      const minutes=Number(url.searchParams.get('minutes'));
      if(!object?.coordinates||![10,15].includes(minutes))return json(res,400,{error:'Выберите объект с координатами и время 10 или 15 минут.'});
      try{return json(res,200,await route(object,minutes));}
      catch(error){return json(res,error.status||502,{error:error.name==='TimeoutError'?'Расчёт занимает слишком много времени. Попробуйте позже.':error.message});}
    }
    const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    if(!/^\/(index\.html|styles\.css|js\/[\w.-]+\.js|data\/[\w.-]+\.(json|geojson)|assets\/[\w./-]+\.(svg|png|jpg|webp))$/.test(pathname)||pathname.includes('..'))return json(res,404,{error:'Не найдено'});
    const body=await readFile(path.join(root,pathname.slice(1)));
    res.writeHead(200,{'Content-Type':`${mime[path.extname(pathname)]||'application/octet-stream'}; charset=utf-8`,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:body);
  } catch(error) { json(res,error.code==='ENOENT'?404:500,{error:error.code==='ENOENT'?'Не найдено':'Не удалось загрузить данные. Повторите попытку.'}); }
});

server.listen(Number(process.env.PORT||8080),process.env.HOST||'127.0.0.1',()=>console.log(`Горизонт 71: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||8080}`));
