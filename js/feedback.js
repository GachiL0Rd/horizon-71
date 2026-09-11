import {escapeHTML as e} from './data.js';

const CATEGORIES=['Строительный мусор','Разбитая дорога','Грязь со стройплощадки','Шумные работы','Перевозка без тента','Нет паспорта объекта','Состояние объекта','Другое'];
const $=selector=>document.querySelector(selector);
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const date=value=>new Date(value).toLocaleString('ru-RU');
export class FeedbackUI {
  constructor({objects,map,onOpen,onClose,onSelect,notify}){
    Object.assign(this,{objects,map,onOpen,onClose,onSelect,notify});this.version=0;
    $('#appeals-button').onclick=()=>this.showMine();
    $('#feedback-panel').addEventListener('click',event=>this.handle(event).catch(error=>notify(error.message)));
    $('#appeal-dialog').addEventListener('click',event=>this.handle(event).catch(error=>notify(error.message)));
  }
  session(){
    let token=localStorage.getItem('horizon71-session');
    if(!/^[a-f0-9]{64}$/.test(token||'')){token=random();localStorage.setItem('horizon71-session',token);}
    return token;
  }
  async request(path,body){
    const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Horizon-Session':this.session()},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось сохранить данные');return data;
  }
  hide(){this.version++;$('#feedback-panel').hidden=true;}
  shell(title,eyebrow){
    this.onOpen();$('#feedback-panel').hidden=false;
    $('#feedback-panel').innerHTML=`<button class="close" data-feedback="close" aria-label="Закрыть обратную связь">×</button><div class="eyebrow">${e(eyebrow)}</div><h2>${e(title)}</h2>`;
  }
  async showMine(){
    this.shell('Мои обращения','ЛОКАЛЬНЫЙ ПРОТОТИП');const version=++this.version;
    $('#feedback-panel').insertAdjacentHTML('beforeend','<p class="muted">Загружаем обращения…</p>');
    try{
      const {appeals}=await this.request('/api/appeals');if(version!==this.version)return;
      this.appeals=appeals;
      $('#feedback-panel .muted').remove();
      $('#feedback-panel').insertAdjacentHTML('beforeend',`<div class="note warning">Сохранено в «Горизонт 71», не отправлено в ведомство. Здесь только обращения этой сессии браузера. Для официальной подачи перейдите в ПОС.</div><div class="detail-actions"><button class="secondary" data-feedback="summary">Карта оценок ответов ↗</button><a class="secondary" href="https://pos.gosuslugi.ru/landing/" target="_blank" rel="noopener noreferrer">Официальная ПОС ↗</a></div>${appeals.length?appeals.map(r=>this.receipt(r)).join(''):'<div class="empty-result"><strong>Пока нет обращений</strong>Откройте карточку объекта и нажмите «Сообщить о проблеме».</div>'}`);
    }catch(error){if(version===this.version)$('#feedback-panel .muted').textContent=error.message;}
  }
  receipt(r){
    const object=this.objects.find(o=>o.id===r.objectId);
    return `<article class="appeal-card"><div class="card-top">№ ${e(r.id.slice(0,8))}<span class="year">${date(r.createdAt)}</span></div><h3>${e(r.category)}</h3><button class="appeal-object" data-feedback="object" data-id="${r.objectId}">${e(object?.name||'Объект из архива')} ↗</button><p class="appeal-description">${e(r.description)}</p><span class="badge pending">${r.response?'Тестовый ответ получен':'Сохранено локально'}</span>${r.response?`<div class="demo-response"><strong>Тестовый ответ · не ответ ведомства</strong><p>${e(r.response)}</p></div><fieldset class="rating"><legend>Оцените тестовый ответ</legend><div>${[1,2,3,4,5].map(n=>`<button type="button" data-feedback="rate" data-id="${r.id}" data-rating="${n}" aria-label="Оценка ${n} из 5" aria-pressed="${r.rating===n}" class="${r.rating===n?'selected':''}">${n} ★</button>`).join('')}</div><small>${r.rating?'Ваша оценка: '+r.rating+' из 5. Можно изменить.':'1 — совсем не удовлетворён, 5 — полностью удовлетворён'}</small></fieldset>`:`<div class="detail-actions"><button class="secondary" data-feedback="answer" data-id="${r.id}">Смоделировать ответ</button></div><p class="source">Кнопка создаёт учебный ответ для показа оценки. Никакие работы или действия ведомства не имитируются как реальные.</p>`}<div class="detail-actions"><button class="text-button" data-feedback="download" data-id="${r.id}">Скачать текст обращения ↓</button><button class="text-button" data-feedback="copy" data-id="${r.id}">Скопировать для ПОС</button></div></article>`;
  }
  compose(object){
    this.currentObject=object;let draft={};
    try{draft=JSON.parse(sessionStorage.getItem('horizon71-draft-'+object.id)||'{}');}catch{}
    this.requestId=draft.requestId||random();
    $('#appeal-dialog').innerHTML=`<button class="close" data-feedback="close-dialog" aria-label="Закрыть форму">×</button><div class="eyebrow">ОБРАТНАЯ СВЯЗЬ</div><h2 id="appeal-title">Сообщить о проблеме</h2><p class="appeal-target">${e(object.name)}</p><p class="muted">${e(object.address||'Адрес в архиве не указан')}</p><div class="note warning">Это локальный прототип. Обращение сохранится на сервере проекта, но не будет отправлено в органы власти. Не указывайте ФИО, телефон и другие личные данные.</div><form id="appeal-form"><label class="field">Что произошло?<select name="category" required>${CATEGORIES.map(c=>`<option ${draft.category===c?'selected':''}>${e(c)}</option>`).join('')}</select></label><label class="field">Описание проблемы<textarea name="description" rows="5" minlength="15" maxlength="2000" required placeholder="Где находится проблема, что произошло и когда вы это заметили">${e(draft.description||'')}</textarea></label><div class="form-helper"><span>Черновик сохраняется в этой вкладке</span><span id="description-count">${(draft.description||'').length}/2000</span></div><label class="check-label"><input type="checkbox" name="localOnly" required> Понимаю, что это сохранение в прототипе, без отправки в ведомство</label><p id="appeal-error" role="alert" class="form-error" hidden></p><button class="primary" type="submit">Сохранить обращение локально</button></form><div class="official-path"><strong>Нужна официальная подача?</strong><p>Можно скопировать подготовленный текст и самостоятельно отправить его через платформу обратной связи.</p><button class="text-button" data-feedback="copy-draft">Скопировать текст</button> · <a href="https://pos.gosuslugi.ru/landing/" target="_blank" rel="noopener noreferrer">Перейти в ПОС ↗</a></div>`;
    const form=$('#appeal-form');
    form.addEventListener('input',()=>{
      const fields=new FormData(form);const description=fields.get('description');
      $('#description-count').textContent=description.length+'/2000';
      try{sessionStorage.setItem('horizon71-draft-'+object.id,JSON.stringify({description,category:fields.get('category'),requestId:this.requestId}));}catch{}
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;$('#appeal-error').hidden=true;
      const fields=new FormData(form);
      try{
        await this.request('/api/appeals',{objectId:object.id,category:fields.get('category'),description:fields.get('description'),localOnly:fields.get('localOnly')==='on',requestId:this.requestId});
        try{sessionStorage.removeItem('horizon71-draft-'+object.id);}catch{}
        $('#appeal-dialog').close();this.notify('Обращение сохранено локально. В ведомство не отправлено.');await this.showMine();
      }catch(error){$('#appeal-error').textContent=error.message;$('#appeal-error').hidden=false;button.disabled=false;}
    });
    $('#appeal-dialog').showModal();
  }
  text(r){const object=this.objects.find(o=>o.id===r.objectId);return `Горизонт 71 — текст для самостоятельной подачи\n\nОбъект: ${object?.name||r.objectId}\nАдрес: ${object?.address||'Не указан'}\nКатегория: ${r.category}\n\n${r.description}\n\nПодготовлено в локальном прототипе. В ведомство не отправлено.`;}
  async showSummary(){
    this.shell('Как оценивают ответы','ОБРАТНАЯ СВЯЗЬ НА КАРТЕ');const version=++this.version;
    $('#feedback-panel').insertAdjacentHTML('beforeend','<p class="muted">Загружаем оценки…</p>');
    try{
      const [summary,demo]=await Promise.all([this.request('/api/feedback-summary'),fetch('data/feedback-demo.json').then(r=>r.json())]);
      if(version!==this.version)return;
      this.summary=summary;this.demo=demo;
      $('#feedback-panel .muted').remove();
      $('#feedback-panel').insertAdjacentHTML('beforeend',`<div class="note warning">Показатели прототипа: оценки тестовых ответов, не статистика удовлетворённости жителей области. Тексты обращений на карту не попадают.</div><div class="segmented" style="margin-top:15px"><button class="active" data-feedback="local-source">Из прототипа</button><button data-feedback="demo-source">Учебный пример</button></div><label class="field">Отрасль<select id="feedback-sector"><option value="">Все отрасли</option>${[...new Set(this.objects.map(o=>o.sector).filter(Boolean))].sort().map(s=>`<option>${e(s)}</option>`).join('')}</select></label><div id="feedback-summary-content" aria-live="polite"></div><div class="note"><strong>Методика</strong><br>Доля оценок 4–5 среди оценённых ответов. Менее 40% — красный, 40–69% — жёлтый, от 70% — зелёный. Нет оценок — нет цвета. Малые выборки помечены; это не репрезентативный опрос.</div><p class="source">Цвет относится к объекту, не ко всему району. Контуры подсветки условные и не показывают территорию обслуживания. Изменение оценки обновляет существующий голос.</p><button class="secondary" data-feedback="mine">Мои обращения</button>`);
      this.source='local';$('#feedback-sector').onchange=()=>this.renderSummary();this.renderSummary();
    }catch(error){if(version===this.version)$('#feedback-panel .muted').textContent=error.message;}
  }
  renderSummary(){
    const rows=this.source==='local'?this.summary.objects:this.demo.objects.map(row=>({...row,objectId:this.objects.find(o=>o.sourceRow===row.sourceRow)?.id}));
    const sector=$('#feedback-sector').value;
    const selected=rows.map(row=>({...row,object:this.objects.find(o=>o.id===row.objectId)})).filter(r=>r.object&&(!sector||r.object.sector===sector));
    const total=selected.reduce((a,r)=>({appeals:a.appeals+r.appeals,rated:a.rated+r.rated,positive:a.positive+r.positive}),{appeals:0,rated:0,positive:0});
    document.querySelector('[data-feedback="local-source"]').classList.toggle('active',this.source==='local');document.querySelector('[data-feedback="demo-source"]').classList.toggle('active',this.source==='demo');
    $('#feedback-summary-content').innerHTML=`<p class="muted">${this.source==='local'?'Источник: обращения, сохранённые в этом прототипе.':'Источник: вымышленный учебный набор для демонстрации карты.'}</p><div class="feedback-metrics"><div><strong>${total.appeals}</strong><span>обращений</span></div><div><strong>${total.rated}</strong><span>оценок ответа</span></div><div><strong>${total.rated?Math.round(total.positive/total.rated*100)+'%':'—'}</strong><span>оценок 4–5</span></div></div>${selected.length?selected.map(r=>`<button class="feedback-object" data-feedback="object" data-id="${r.objectId}"><span class="score-dot" style="background:${scoreColor(r.satisfaction)}"></span><span>${e(r.object.name)}<small>${r.rated?r.rated+' оценок · средняя '+r.average+'/5':'Ответы ещё не оценены'}${r.rated>0&&r.rated<5?' · малая выборка':''}${!r.object.coordinates?' · без координат':''}</small></span><strong>${r.satisfaction===null?'—':r.satisfaction+'%'}</strong></button>`).join(''):'<div class="empty-result"><strong>Оценок пока нет</strong>Создайте обращение и оцените тестовый ответ или включите учебный пример.</div>'}`;
    this.map.showFeedback(selected);this.map.fit();
    $('#map-legend').innerHTML='<span class="legend-dot" style="background:#81a76d"></span> Оценки тестовых ответов · 4–5 из 5';
  }
  async handle(event){
    const button=event.target.closest('[data-feedback]');if(!button)return;const action=button.dataset.feedback;
    if(action==='close'){this.hide();this.onClose();}
    if(action==='close-dialog')$('#appeal-dialog').close();
    if(action==='mine')await this.showMine();
    if(action==='summary')await this.showSummary();
    if(action==='object'){this.hide();this.onSelect(button.dataset.id);}
    if(action==='local-source'||action==='demo-source'){this.source=action==='local-source'?'local':'demo';this.renderSummary();}
    if(action==='answer'||action==='rate'){
      button.disabled=true;
      try{await this.request('/api/appeals/'+button.dataset.id,action==='answer'?{action:'demo-answer'}:{action:'rate',rating:Number(button.dataset.rating)});await this.showMine();}
      finally{button.disabled=false;}
    }
    if(action==='copy-draft'){
      const fields=new FormData($('#appeal-form'));await navigator.clipboard.writeText(this.text({objectId:this.currentObject.id,category:fields.get('category'),description:fields.get('description')}));this.notify('Текст скопирован. Отправьте его самостоятельно через ПОС.');
    }
    if(action==='download'||action==='copy'){
      const record=this.appeals.find(r=>r.id===button.dataset.id);const text=this.text(record);
      if(action==='copy'){await navigator.clipboard.writeText(text);this.notify('Текст скопирован для самостоятельной подачи.');}
      else{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='horizon71-appeal-'+record.id.slice(0,8)+'.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }
  }
}
export function scoreColor(score){return score===null?'#a5aea2':score<40?'#c87360':score<70?'#c5a354':'#769e65';}
