import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';

export const CATEGORIES=['Строительный мусор','Разбитая дорога','Грязь со стройплощадки','Шумные работы','Перевозка без тента','Нет паспорта объекта','Состояние объекта','Другое'];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=token=>createHash('sha256').update(token).digest('hex');
export async function createFeedback(root,objects){
  const directory=path.join(root,'.local');const file=path.join(directory,'appeals.json');
  await mkdir(directory,{recursive:true});let records=[];
  try{records=JSON.parse(await readFile(file,'utf8'));if(!Array.isArray(records))throw new Error('Invalid appeals storage');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  let queue=Promise.resolve();
  const identify=token=>{if(!/^[a-f0-9]{64}$/.test(token||''))throw fail('Не удалось определить локальную сессию. Обновите страницу.',401);return hash(token);};
  const publicRecord=({owner,...record})=>record;
  const change=fn=>{
    const task=queue.then(async()=>{
      const next=structuredClone(records);const result=fn(next);
      await writeFile(file+'.tmp',JSON.stringify(next,null,2),'utf8');await rename(file+'.tmp',file);records=next;return result;
    });queue=task.catch(()=>{});return task;
  };
  return {
    list(token){const owner=identify(token);return records.filter(r=>r.owner===owner).map(publicRecord).reverse();},
    create(token,body){
      const owner=identify(token);
      if(!body||typeof body!=='object')throw fail('Некорректное обращение.');
      const object=objects.find(o=>o.id===body.objectId);
      if(!object)throw fail('Объект не найден.');
      if(!CATEGORIES.includes(body.category))throw fail('Выберите категорию проблемы.');
      if(typeof body.description!=='string'||body.description.trim().length<15||body.description.trim().length>2000)throw fail('Описание должно содержать от 15 до 2000 символов.');
      if(body.localOnly!==true)throw fail('Подтвердите сохранение обращения в прототипе.');
      if(!/^[a-f0-9]{64}$/.test(body.requestId||''))throw fail('Некорректный идентификатор запроса.');
      return change(next=>{
        const existing=next.find(r=>r.owner===owner&&r.requestId===body.requestId);if(existing)return publicRecord(existing);
        if(next.length>=5000)throw fail('Хранилище прототипа заполнено.',507);
        const record={id:randomUUID(),owner,requestId:body.requestId,objectId:object.id,category:body.category,description:body.description.trim(),createdAt:new Date().toISOString(),status:'local',response:null,rating:null,demo:true};
        next.push(record);return publicRecord(record);
      });
    },
    update(token,id,body){
      const owner=identify(token);
      return change(next=>{
        const record=next.find(r=>r.id===id&&r.owner===owner);if(!record)throw fail('Обращение не найдено.',404);
        if(body.action==='demo-answer'){
          if(!record.response){record.response='Тестовый ответ: сообщение привязано к объекту и категории. В промышленной версии здесь появится ответ ответственного ведомства. Никакие работы по этому сообщению не подтверждены.';record.answeredAt=new Date().toISOString();record.status='demo_answered';}
        }else if(body.action==='rate'){
          if(!record.response)throw fail('Оценить можно только полученный ответ.',409);
          if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5)throw fail('Выберите оценку от 1 до 5.');
          record.rating=body.rating;record.ratedAt=new Date().toISOString();
        }else throw fail('Неизвестное действие.');
        return publicRecord(record);
      });
    },
    summary(){
      const groups=new Map();
      for(const record of records){
        if(!groups.has(record.objectId))groups.set(record.objectId,{objectId:record.objectId,appeals:0,answered:0,rated:0,positive:0,total:0});
        const group=groups.get(record.objectId);group.appeals++;if(record.response)group.answered++;
        if(record.rating!==null){group.rated++;group.total+=record.rating;if(record.rating>=4)group.positive++;}
      }
      return {demo:true,updatedAt:new Date().toISOString(),objects:[...groups.values()].map(({total,...group})=>({...group,average:group.rated?Math.round(total/group.rated*10)/10:null,satisfaction:group.rated?Math.round(group.positive/group.rated*100):null}))};
    },
  };
}
