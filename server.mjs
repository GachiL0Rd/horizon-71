import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRouting} from './routing.mjs';
import {createFeedback} from './feedback.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  const env = await readFile(path.join(root, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const data = JSON.parse(await readFile(path.join(root, 'data/objects.json'), 'utf8'));
const route = await createRouting(root);
const feedback = await createFeedback(root,data.objects);
async function readBody(req){
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>12000)throw Object.assign(new Error('Слишком большой запрос.'),{status:413});chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('Некорректный JSON.'),{status:400});}
}
const json = (res, code, body) => {res.writeHead(code, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(body));};
const mime = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.geojson':'application/geo+json', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp'};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if(url.pathname.startsWith('/api/appeals')||url.pathname==='/api/feedback-summary'){
      try{
        const token=req.headers['x-horizon-session'];
        if(req.method==='GET'&&url.pathname==='/api/feedback-summary')return json(res,200,feedback.summary());
        if(req.method==='GET'&&url.pathname==='/api/appeals')return json(res,200,{appeals:feedback.list(token)});
        if(req.method==='POST'){
          const origin=req.headers.origin;
          if(req.headers['sec-fetch-site']==='cross-site'||(origin&&new URL(origin).host!==req.headers.host))return json(res,403,{error:'Запрос разрешён только из приложения.'});
          if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Ожидается JSON.'});
          const body=await readBody(req);
          if(url.pathname==='/api/appeals')return json(res,201,await feedback.create(token,body));
          const match=url.pathname.match(/^\/api\/appeals\/([a-f0-9-]{36})$/);
          if(match)return json(res,200,await feedback.update(token,match[1],body));
        }
        return json(res,405,{error:'Метод не поддерживается'});
      }catch(error){return json(res,error.status||500,{error:error.status?error.message:'Не удалось сохранить обращение. Повторите попытку.'});}
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, {error:'Метод не поддерживается'});
    if (url.pathname === '/api/config') return json(res, 200, {mapKey:process.env.YANDEX_MAPS_KEY || '', isochrone:true, isochroneProvider:'Valhalla · OpenStreetMap'});
    if (url.pathname === '/api/isochrone') {
      const object = data.objects.find(o => o.id === url.searchParams.get('id'));
      const minutes = Number(url.searchParams.get('minutes'));
      if (!object?.coordinates || ![10,15].includes(minutes)) return json(res, 400, {error:'Выберите объект с координатами и время 10 или 15 минут.'});
      try{return json(res, 200, await route(object,minutes));}
      catch(error){return json(res,error.status||502,{error:error.name==='TimeoutError'?'Расчёт занимает слишком много времени. Попробуйте позже.':error.message});}
    }
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (!/^\/(index\.html|(?:styles|feedback)\.css|js\/[\w.-]+\.js|data\/[\w.-]+\.(json|geojson)|assets\/[\w./-]+\.(svg|png|jpg|webp))$/.test(pathname) || pathname.includes('..')) return json(res, 404, {error:'Не найдено'});
    const body = await readFile(path.join(root, pathname.slice(1)));
    res.writeHead(200, {'Content-Type':`${mime[path.extname(pathname)] || 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    json(res, error.code === 'ENOENT' ? 404 : 500, {error:error.code === 'ENOENT' ? 'Не найдено' : 'Не удалось загрузить данные. Повторите попытку.'});
  }
});
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () => console.log(`Горизонт 71: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 8080}`));
