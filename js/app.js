import {SECTORS,sectorStyle,escapeHTML as e,filterObjects,coverage,getJSON} from './data.js';
import {ObjectMap} from './map.js';
import {scene} from './media.js';
import {FeedbackUI} from './feedback.js';

const $=selector=>document.querySelector(selector);
const params=new URLSearchParams(location.search);
const state={query:params.get('q')||'',sector:params.get('sector')||'',district:params.get('district')||'',year:params.get('year')||'',scope:params.get('scope')==='all'?'all':'completed',selected:params.get('object'),tab:'overview',stage:0};
let data,config={},filtered=[],timer,toastTimer,isoController=0,districtsGeo,feedback;
const map=new ObjectMap(selectObject);
const labels={'Образование':'Образование','Здравоохранение':'Медицина','Физическая культура и спорт':'Спорт','Культура':'Культура','Жилищно-коммунальное хозяйство':'ЖКХ','Энергетика':'Энергетика'};
const fmt=value=>Number(value).toLocaleString('ru-RU');
const value=text=>text===null||text===undefined||text===''?'Не указано':e(text);
const fact=(label,text)=>`<div class="fact"><dt>${e(label)}</dt><dd>${value(text)}</dd></div>`;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
function stopPlayback(){clearInterval(timer);timer=null;}
function syncURL(){
  const p=new URLSearchParams();
  for(const [key,val] of Object.entries({q:state.query,sector:state.sector,district:state.district,year:state.year,scope:state.scope==='all'?'all':'',object:state.selected}))if(val)p.set(key,val);
  history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);
}
function render(){
  filtered=filterObjects(data.objects,state);
  if(state.selected && !filtered.some(o=>o.id===state.selected)){state.selected=null;$('#detail').hidden=true;map.clearGeometry();isoController++;stopPlayback();}
  const mapped=filtered.filter(o=>o.coordinates).length;
  $('#result-count').textContent=`Объекты · ${filtered.length}`;
  $('#map-summary').textContent=`${mapped} на карте${mapped<filtered.length?' · '+(filtered.length-mapped)+' без координат в списке':''}`;
  $('#results').innerHTML=filtered.length?filtered.map(o=>`<button class="object-card ${o.id===state.selected?'selected':''}" data-object="${o.id}" aria-pressed="${o.id===state.selected}"><div class="card-top"><span class="sector-icon" style="--sector:${sectorStyle(o.sector).color}">${sectorStyle(o.sector).icon}</span><span>${e(labels[o.sector]||o.sector||'Отрасль не указана')}</span><span class="year">${o.commissionYear||e(o.status)}</span></div><h3>${e(o.name)}</h3><div class="card-bottom">⌖ ${e(o.district||'Муниципалитет не указан')}${!o.coordinates?' · Без координат':''}</div><span class="card-arrow">↗</span></button>`).join(''):'<div class="empty-result"><strong>Пока ничего не найдено</strong>Попробуйте другой запрос или сбросьте фильтры.</div>';
  document.querySelectorAll('[data-scope]').forEach(b=>{b.classList.toggle('active',b.dataset.scope===state.scope);b.setAttribute('aria-pressed',b.dataset.scope===state.scope);});
  document.querySelectorAll('[data-sector]').forEach(b=>{b.classList.toggle('active',b.dataset.sector===state.sector);b.setAttribute('aria-pressed',b.dataset.sector===state.sector);});
  map.setObjects(filtered,state.selected);syncURL();
}
function reset(){state.query='';state.sector='';state.district='';state.year='';$('#search').value='';$('#district').value='';$('#year').value='';render();}
function selectObject(id){
  feedback?.hide();
  if(!data.objects.some(o=>o.id===id))return;
  stopPlayback();isoController++;map.clearGeometry();state.selected=id;state.tab='overview';state.stage=0;
  $('#social-panel').hidden=true;$('#analytics').hidden=true;activateView('objects');activateLayer('objects');
  render();renderDetail();map.focus(data.objects.find(o=>o.id===id));
  if(innerWidth<=800)window.scrollTo({top:0});
}
function closeDetail(){activateLayer('objects');state.selected=null;$('#detail').hidden=true;stopPlayback();map.clearGeometry();isoController++;render();}
function renderDetail(){
  const o=data.objects.find(o=>o.id===state.selected);if(!o)return;
  $('#detail').hidden=false;
  $('#detail').classList.remove('map-peek');
  const tabs=[['overview','Об объекте'],['history','История'],['access','Доступность'],['contract','Контракт']];
  $('#detail').innerHTML=`<div class="detail-header"><button class="close" data-action="close-detail" aria-label="Закрыть карточку">×</button><div class="eyebrow">${e(o.sector||'ОБЪЕКТ СТРОИТЕЛЬСТВА')}</div><h2>${e(o.name)}</h2><div class="detail-address">⌖ ${value(o.address)}</div><span class="badge ${o.commissioned?'':'pending'}">${o.commissioned?'✓ ':''}${e(o.status)}${o.commissionYear?' · '+o.commissionYear:''}</span></div><div class="detail-tabs" role="tablist" aria-label="Информация об объекте">${tabs.map(([id,label])=>`<button role="tab" id="tab-${id}" aria-selected="${state.tab===id}" aria-controls="detail-tabpanel" data-tab="${id}" class="${state.tab===id?'active':''}">${label}</button>`).join('')}</div><div class="detail-body" role="tabpanel" id="detail-tabpanel" aria-labelledby="tab-${state.tab}">${detailBody(o)}<div class="source">Источник: ${e(o.source)}.<br>Дата актуальности исходного архива не указана. Данные могут отличаться от текущего состояния объекта.</div></div>`;
  $('#detail').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{const message=document.createElement('div');message.className='empty-result';message.textContent='Фотография недоступна. Откройте публикацию по ссылке ниже.';img.replaceWith(message);}));
  $('.detail-body').insertAdjacentHTML('afterbegin','<button class="text-button expand-card" data-action="expand-detail">Развернуть карточку ↑</button>');
  if(state.tab==='overview')$('.detail-body .detail-actions').insertAdjacentHTML('beforeend','<button class="secondary report-problem" data-action="report-problem">Сообщить о проблеме</button>');
  if(state.tab==='contract'&&o.reportedCost){
    const cost=o.reportedCost;
    $('.detail-body .facts').insertAdjacentHTML('afterend',`<div class="note" style="margin-top:15px"><div class="metric">${fmt(cost.amount/1e9)} млрд ₽</div>${e(cost.kind)}. Публикация ${e(cost.date)}.<br><a href="${e(cost.sourceUrl)}" target="_blank" rel="noopener noreferrer">${e(cost.source)} ↗</a></div>`);
  }
}
function detailBody(o){
  if(state.tab==='overview')return `<div class="two-facts"><div><div class="muted">Год ввода</div><div class="metric">${o.commissionYear||'—'}</div></div><div><div class="muted">Площадь, м²</div><div class="metric">${o.area?fmt(o.area):'—'}</div></div></div>${o.progress!==null?`<div class="muted">Строительная готовность по архиву · ${fmt(o.progress)}%</div><div class="progress"><span style="width:${Math.max(0,Math.min(100,o.progress))}%"></span></div>`:''}<dl class="facts">${fact('Муниципалитет',o.district)}${fact('Мощность — в единицах исходного архива',o.capacity)}${fact('Этап строительства',o.stage)}${fact('Собственность',o.ownership)}${fact('Заказчик',o.customer)}${fact('Подрядчик',o.contractor)}${fact('Начало / плановое окончание',`${o.startYear||'не указано'} / ${o.endYear||'не указано'}`)}${fact('Национальная / государственная программа',o.program)}${fact('Акт ввода',o.commissionNumber)}</dl><div class="detail-actions"><button class="secondary" data-action="share">Скопировать ссылку ↗</button>${o.coordinates?`<a class="secondary" target="_blank" rel="noopener noreferrer" href="https://yandex.ru/maps/?rtext=~${o.coordinates[1]},${o.coordinates[0]}&rtt=pd">Маршрут пешком ↗</a>`:''}</div>${!o.coordinates?'<div class="note warning">В архиве нет координат. Объект доступен в каталоге; точку на карте нужно уточнить.</div>':''}`;
  if(state.tab==='history')return historyBody(o);
  if(state.tab==='access')return `<h3>Что находится в пешей доступности?</h3><p class="muted">Область, откуда можно дойти до объекта за выбранное время по пешеходным путям OpenStreetMap.</p><div class="detail-actions"><button class="primary" data-minutes="10" ${!o.coordinates?'disabled':''}>10 минут</button><button class="secondary" data-minutes="15" ${!o.coordinates?'disabled':''}>15 минут</button><button class="text-button" data-action="clear-iso">Убрать слой</button></div><div id="iso-status" class="note" role="status">${!o.coordinates?'Для расчёта сначала нужны координаты объекта.':config.isochrone?'Расчёт выполняет Valhalla по данным OpenStreetMap. Нажмите кнопку, чтобы построить область.':'Запустите локальный сервер командой npm start для расчёта доступности.'}</div><p class="muted">Расчёт выполняется от координаты из архива, которая может отличаться от входа. Направление расчёта — к объекту. Это оценка, а не гарантия свободного прохода. Данные: © OpenStreetMap contributors.</p>${o.coordinates?`<a class="secondary" target="_blank" rel="noopener noreferrer" href="https://yandex.ru/maps/?rtext=~${o.coordinates[1]},${o.coordinates[0]}&rtt=pd">Проверить маршрут до объекта ↗</a>`:''}`;
  return `<h3>Сведения о строительном контракте</h3><div class="note">Даты и участники — из архива организаторов. Текущий статус исполнения и стоимость в ЕИС не подтверждены.</div><dl class="facts">${fact('Заказчик',o.customer)}${fact('Подрядчик',o.contractor)}${fact('Дата заключения по архиву',o.contractDate)}${fact('Сроки контракта по архиву',o.contractPeriod)}${fact('Стоимость контракта',o.contract?.price?fmt(o.contract.price)+' ₽':null)}${fact('Статус исполнения в ЕИС',o.contract?.status)}</dl>${o.procurement?`<div class="note" style="margin-top:14px">Найдена закупка с совпадающим названием: № ${e(o.procurement.notice)}. Связь с конкретным контрактом требует проверки в ЕИС.</div><div class="detail-actions"><a class="secondary" href="${e(o.procurement.url)}" target="_blank" rel="noopener noreferrer">Открыть извещение ЕИС ↗</a></div>`:''}<div class="detail-actions"><a class="primary" target="_blank" rel="noopener noreferrer" href="https://zakupki.gov.ru/epz/contract/search/results.html?searchString=${encodeURIComponent(o.name)}">Найти контракт в ЕИС ↗</a><button class="secondary" data-action="copy-name">Скопировать название</button></div><p class="muted">Поиск по названию помогает найти источник, но сам по себе не подтверждает соответствие контракта объекту. Автоматической синхронизации с ЕИС пока нет.</p>`;
}
function historyBody(o){
  const real=o.media?.length>0;
  const stage=state.stage;
  const material=o.media?.find(m=>m.stage===['before','during','after'][stage]);
  const captions=['Участок до начала работ. Здесь можно показать историю места и архивный снимок.','Ход строительства. Здесь можно разместить датированные фото или разрешённый видеопоток.','Завершённый объект. Здесь можно сравнить результат с проектным рендером.'];
  return `<h3>Место меняется со временем</h3><div class="note ${real?'':'warning'}">${real?'Фотографии из публикаций об объекте. Исторические спутниковые снимки и камеры не подключены.':'Демонстрация механики: ниже условные схемы, а не фотографии этого объекта. Исторические снимки и камеры не подключены.'}</div><div class="timeline">${['До','В процессе','После'].map((label,i)=>`<button data-stage="${i}" class="${stage===i?'active':''}" aria-pressed="${stage===i}">${label}</button>`).join('')}</div><div class="scene">${material?`<img src="${e(material.url)}" alt="${e(material.caption)}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover">`:real?'<div class="empty-result"><strong>Историю ещё предстоит найти</strong>Фотографии этого этапа отсутствуют.<br>Другие этапы доступны в переключателе.</div>':scene(stage)}</div><p class="media-caption">${material?e(material.caption):real?'Материал этого этапа не найден.':captions[stage]}</p>${material?`<p class="source">Фото: ${e(material.credit)}.<br><a href="${e(material.sourceUrl)}" target="_blank" rel="noopener noreferrer">Публикация и источник ↗</a></p>`:''}<button class="secondary" data-action="play">${timer?'Ⅱ Остановить':'▷ Воспроизвести историю'}</button>${o.historyNote?`<p class="muted">${e(o.historyNote)}</p>`:''}${o.news?.length?`<h3 style="margin-top:20px">Публикации об объекте</h3>${o.news.map(n=>`<p class="muted">${e(n.date)} · ${e(n.text)}<br><a href="${e(n.url)}" target="_blank" rel="noopener noreferrer">${e(n.source)} ↗</a></p>`).join('')}`:''}<dl class="facts" style="margin-top:15px">${fact('Начало строительства по архиву',o.startYear)}${fact(o.commissioned?'Ввод в эксплуатацию по архиву':'Плановое окончание по архиву',o.commissioned?o.commissionYear:o.endYear)}</dl>`;
}
async function calculateIso(minutes){
  const target=$('#iso-status');const id=state.selected;const request=++isoController;
  if(!map.map){target.textContent='Сначала подключите основную карту в настройках.';return;}
  target.textContent='Строим область пешей доступности…';
  document.querySelectorAll('[data-minutes]').forEach(b=>b.disabled=true);
  try{
    const result=await getJSON(`/api/isochrone?id=${encodeURIComponent(id)}&minutes=${minutes}`);
    if(request!==isoController||state.selected!==id||state.tab!=='access')return;
    map.showGeometry(result.geometry);target.textContent=`Показана область, откуда можно дойти до объекта за ${minutes} минут. Источник: ${result.provider}. Расчёт: ${new Date(result.calculatedAt).toLocaleString('ru-RU')}.${result.cached?' Сохранённый результат.':''}`;
    $('#map-legend').innerHTML='<span class="legend-dot" style="background:#527cad"></span> Пешая доступность · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
    if(innerWidth<=800){$('#detail').classList.add('map-peek');window.scrollTo({top:0});}
  }catch(error){if(request===isoController&&target.isConnected)target.textContent=error.message;}
  finally{if(request===isoController)document.querySelectorAll('[data-minutes]').forEach(b=>b.disabled=false);}
}
function activateView(view){document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('#appeals-button').classList.remove('active');}
function activateLayer(layer){
  document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('active',b.dataset.layer===layer));
  $('#map-legend').innerHTML=layer==='social'?'<span class="legend-dot" style="background:#ce826d"></span> Учебный расчёт · серый — нет оценки · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OSM</a>':'<span class="legend-dot"></span> Цвет метки — отрасль объекта';
  if(layer==='objects')map.clearGeometry();
}
function openSocial(){
  feedback?.hide();
  closeDetail();$('#analytics').hidden=true;activateView('objects');activateLayer('social');$('#social-panel').hidden=false;
  $('#social-panel').innerHTML=`<button class="close" data-action="close-social" aria-label="Закрыть слой">×</button><div class="eyebrow">ОБЕСПЕЧЕННОСТЬ ТЕРРИТОРИИ</div><h2>Хватает ли мест<br>рядом с домом?</h2><div class="note warning">Сценарный калькулятор. Значения ниже учебные, не статистика Тульской области.</div><label class="field">Муниципалитет<select id="social-district">${[...new Set(data.objects.map(o=>o.district).filter(Boolean))].sort().map(d=>`<option>${e(d)}</option>`).join('')}</select></label><label class="field">Социальная сфера<select id="social-sector"><option>Образование</option><option>Здравоохранение</option><option>Физическая культура и спорт</option><option>Культура</option><option>Энергетика</option></select></label><p class="muted" id="social-unit">Задайте мощность и норму в сопоставимых единицах выбранной сферы. Калькулятор не подбирает норматив автоматически.</p><label class="field">Население территории, человек<input type="number" id="population" value="10000" min="1" step="1"></label><div class="two-facts"><label class="field">Имеющаяся мощность<input type="number" id="capacity" value="700" min="0"></label><label class="field">Норма на 1000 жителей<input type="number" id="norm" value="100" min="0.01" step="0.01"></label></div><div id="social-result" aria-live="polite"></div><div class="note"><strong>Как считается</strong><br>Обеспеченность = мощность ÷ (население × норма / 1000).<br>Менее 90% — пониженная; 90–110% — нормальная; более 110% — повышенная. Пороги демонстрационные, не нормативные.</div><p id="district-archive" class="muted"></p><p class="source">Для реального слоя нужны геометрия муниципалитетов, население, весь реестр учреждений, мощности и согласованные нормативы. Архив новых строек не заменяет этот реестр.</p>`;
  const warning=$('#social-panel .note.warning');
  warning.textContent='Учебный сценарий: цвет выбранного района отражает введённые вами числа, не реальную обеспеченность. Остальные районы без оценки. Границы OSM из версии 2020 года требуют сверки.';
  if(districtsGeo){$('#social-district').innerHTML=districtsGeo.features.map(f=>`<option>${e(f.properties.district)}</option>`).join('');$('#social-district').value='Тула';}
  $('#social-panel .source').innerHTML='Границы: <a href="https://github.com/timurkanaz/Russia_geojson_OSM" target="_blank" rel="noopener noreferrer">Russia_geojson_OSM, версия 08.11.2020</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors, ODbL</a>. Административные территории могут отличаться от современных муниципалитетов. Для реального расчёта нужны актуальные границы, население, весь реестр учреждений и нормативы.';
  $('#social-panel').addEventListener('input',updateSocial,{signal:socialSignal()});map.fit();updateSocial();
}
let socialAbort;
function socialSignal(){socialAbort?.abort();socialAbort=new AbortController();return socialAbort.signal;}
function updateSocial(){
  const result=coverage(Number($('#capacity').value),Number($('#population').value),Number($('#norm').value));
  const names={low:'Пониженная обеспеченность',normal:'Нормальная обеспеченность',high:'Повышенная обеспеченность'};
  if(districtsGeo)map.showDistricts(districtsGeo,$('#social-district').value,result?.level,name=>{$('#social-district').value=name;updateSocial();});
  $('#social-result').innerHTML=result?`<div class="social-result ${result.level}"><strong>${result.percent}%</strong><span>${names[result.level]} · учебный сценарий</span></div>`:'<div class="note warning">Введите корректные значения: население и норма больше нуля, мощность неотрицательная.</div>';
  const selectedDistrict=$('#social-district').value;
  const count=data.objects.filter(o=>(o.district===selectedDistrict||o.district==='г. '+selectedDistrict)&&o.sector===$('#social-sector').value&&o.commissioned).length;
  $('#district-archive').textContent=`В исходном архиве: ${count} введённых объектов выбранной сферы в этом муниципалитете. Это справочная информация, в расчёте выше она не используется.`;
}
function showAnalytics(){
  feedback?.hide();
  closeDetail();$('#social-panel').hidden=true;activateLayer('objects');activateView('analytics');$('#analytics').hidden=false;
  const complete=data.objects.filter(o=>o.commissioned);
  const counts=Object.entries(Object.groupBy(complete,o=>o.sector||'Не указана')).map(([name,list])=>[name,list.length]).sort((a,b)=>b[1]-a[1]);
  const bar=(name,n,max)=>`<div class="bar-row"><span>${e(name)}</span><div class="bar-track"><span style="width:${n/max*100}%"></span></div><strong>${n}</strong></div>`;
  $('#analytics').innerHTML=`<button class="close" data-action="close-analytics" aria-label="Закрыть аналитику">×</button><div class="eyebrow">АРХИВ В ЦИФРАХ</div><h2>Как меняется Тульская область</h2><p class="muted">Сводка по всему предоставленному архиву. Не зависит от фильтров каталога и не отражает все стройки региона.</p><div class="analytics-grid"><div class="analytics-tile"><strong>${complete.length}</strong><span>введённых объектов</span></div><div class="analytics-tile"><strong>${data.report.mapped}</strong><span>объектов с координатами</span></div><div class="analytics-tile"><strong>${new Set(complete.map(o=>o.district).filter(Boolean)).size}</strong><span>муниципалитетов с вводом</span></div></div><h3>Введено по годам</h3>${[2022,2023,2024,2025].map(y=>bar(String(y),complete.filter(o=>o.commissionYear===y).length,18)).join('')}<h3>Введено по отраслям</h3>${counts.map(([n,c])=>bar(n,c,Math.max(...counts.map(x=>x[1])))).join('')}<div class="note" style="margin-top:24px">${data.report.total-data.report.mapped} записей без координат · ${data.report.missingAddress} без адреса · ${data.report.missingDistrict} без муниципалитета. Неизвестные значения не подменены нулём.</div><div class="detail-actions"><button class="secondary" data-action="export">Скачать текущую выборку JSON ↓</button><button class="secondary" data-action="quality">О качестве данных ↗</button></div>`;
}
function showInfo(type){
  $('#info-content').innerHTML=type==='quality'?`<div class="eyebrow">ПРОЗРАЧНОСТЬ ДАННЫХ</div><h2>Что известно об архиве</h2><p>В исходном CSV ${data.report.total} записей. ${data.report.commissioned} введённых объектов имеют координаты. Всего координаты есть у ${data.report.mapped} объектов.</p><ul><li>У ${data.report.missingAddress} записей нет адреса, у ${data.report.missingDistrict} — муниципалитета.</li><li>Справочники очищены от лишних пробелов; объединены варианты написания отраслей и районов.</li><li>Плановый год окончания не считается годом ввода. Готовность 100% сама по себе не означает ввод.</li><li>Мощности в разных единицах не суммируются.</li><li>Две пары объектов имеют одинаковые координаты. Записи сохранены отдельно.</li><li>Дата актуальности архива не указана. Фотографий, населения и стоимости контрактов в нём нет.</li></ul><p>Повторный импорт: <code>python scripts/import.py</code>. Нормализованный набор: <a href="data/objects.json" target="_blank">objects.json ↗</a>.</p>`:`<div class="eyebrow">ТУЛЬСКАЯ ОБЛАСТЬ · MVP</div><h2>Горизонт 71</h2><p>Интерактивный портал объектов капитального строительства. Помогает найти объект, узнать участников строительства и сроки, проверить пешую доступность.</p><h3>Что работает</h3><p>Каталог на реальных данных, фильтры, карта Яндекса при подключённом ключе, карточки, аналитика и ссылки на закупки. Пешая доступность рассчитывается бесплатным движком Valhalla по OpenStreetMap.</p><h3>Что показано как прототип</h3><p>История — фотографии двух этапов для детсада в Заокском; для остальных объектов условные схемы. Социальная обеспеченность — сценарный калькулятор, с окраской территории по учебному расчёту, без оценки реальных районов. Камеры, спутниковый архив, синхронизация ЕИС и обращения пока не подключены.</p><h3>Дальнейшее развитие</h3><p>Обновление ведомственного реестра через импорт; подключение медиаматериалов и показателей; затем API, база данных и кабинет оператора.</p>`;
  $('#info').showModal();
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Скопировано');}catch{toast('Не удалось скопировать автоматически. Ссылку можно взять из адресной строки.');}}
function settings(){try{$('#map-key').value=localStorage.getItem('tula-map-key')||config.mapKey||'';}catch{$('#map-key').value=config.mapKey||'';}$('#iso-config').textContent=config.isochrone?'Подключён Valhalla / OpenStreetMap. Платный API и отдельный ключ не нужны.':'Для расчёта нужен локальный сервер приложения.';$('#settings').showModal();}
async function connect(key){
  try{if(await map.init(key))toast('Яндекс Карты подключены');}
  catch(error){$('#map-message').textContent=error.message;toast(error.message);}
}
$('#settings-button').onclick=settings;$('#connect-map').onclick=settings;
$('#save-key').onclick=async()=>{const key=$('#map-key').value.trim();try{localStorage.setItem('tula-map-key',key);}catch{}$('#settings').close();if(map.map||window.ymaps)location.reload();else if(key)await connect(key);};
$('#search').oninput=event=>{state.query=event.target.value;render();};
$('#district').onchange=event=>{state.district=event.target.value;render();};
$('#year').onchange=event=>{state.year=event.target.value;render();};
$('#reset').onclick=reset;$('#fit-map').onclick=()=>map.fit();$('#zoom-in').onclick=()=>map.zoom(1);$('#zoom-out').onclick=()=>map.zoom(-1);
$('#satellite').onclick=()=>{const enabled=$('#satellite').getAttribute('aria-pressed')!=='true';$('#satellite').setAttribute('aria-pressed',enabled);map.satellite(enabled);if(enabled)toast('Спутниковая подложка Яндекса. Это не исторический снимок выбранного года.');};
$('#about-button').onclick=()=>showInfo('about');$('#quality-button').onclick=()=>showInfo('quality');
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!document.querySelector('dialog[open]'))feedback?.hide();
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('.marker[data-object]')){event.preventDefault();selectObject(event.target.dataset.object);}
  if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){event.preventDefault();$('#search').focus();}
  if(event.key==='Escape'&&!document.querySelector('dialog[open]')){closeDetail();$('#social-panel').hidden=true;$('#analytics').hidden=true;activateLayer('objects');activateView('objects');}
});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||!data)return;
  if(b.dataset.object)selectObject(b.dataset.object);
  if(b.hasAttribute('data-sector')){state.sector=b.dataset.sector;render();}
  if(b.dataset.scope){state.scope=b.dataset.scope;render();}
  if(b.dataset.tab){stopPlayback();isoController++;state.tab=b.dataset.tab;if(state.tab==='history'&&data.objects.find(o=>o.id===state.selected)?.media?.length)state.stage=1;renderDetail();$('#tab-'+state.tab)?.focus();}
  if(b.dataset.minutes)calculateIso(Number(b.dataset.minutes));
  if(b.dataset.stage){state.stage=Number(b.dataset.stage);renderDetail();}
  if(b.dataset.layer==='social')openSocial();
  if(b.dataset.layer==='objects'){$('#social-panel').hidden=true;activateLayer('objects');}
  if(b.dataset.layer==='objects')feedback?.hide();
  if(b.dataset.layer==='feedback')feedback?.showSummary();
  if(b.dataset.view==='analytics')showAnalytics();
  if(b.dataset.view==='objects'){$('#analytics').hidden=true;activateView('objects');}
  if(b.dataset.view==='objects')feedback?.hide();
  const action=b.dataset.action;
  if(action==='report-problem')feedback.compose(data.objects.find(o=>o.id===state.selected));
  if(action==='close-detail')closeDetail();
  if(action==='share')copy(location.href);
  if(action==='copy-name')copy(data.objects.find(o=>o.id===state.selected).name);
  if(action==='clear-iso'){isoController++;activateLayer('objects');$('#iso-status').textContent='Слой доступности убран.';document.querySelectorAll('[data-minutes]').forEach(x=>x.disabled=false);}
  if(action==='expand-detail')$('#detail').classList.remove('map-peek');
  if(action==='play'){if(timer){stopPlayback();renderDetail();}else{timer=setInterval(()=>{state.stage=(state.stage+1)%3;renderDetail();},2200);renderDetail();}}
  if(action==='close-social'){$('#social-panel').hidden=true;activateLayer('objects');}
  if(action==='close-analytics'){$('#analytics').hidden=true;activateView('objects');}
  if(action==='quality')showInfo('quality');
  if(action==='export'){const blob=new Blob([JSON.stringify({source:data.sourceFile,filters:state,objects:filtered},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='tula-objects.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
});

try{
  [data,config]=await Promise.all([getJSON('data/objects.json'),getJSON('/api/config').catch(()=>({}))]);
  feedback=new FeedbackUI({objects:data.objects,map,notify:toast,onOpen:()=>{closeDetail();$('#social-panel').hidden=true;$('#analytics').hidden=true;activateView('');$('#appeals-button').classList.add('active');activateLayer('feedback');},onClose:()=>{activateLayer('objects');activateView('objects');},onSelect:id=>{state.scope='all';reset();selectObject(id);}});
  const feedbackLayer=document.createElement('button');feedbackLayer.dataset.layer='feedback';feedbackLayer.textContent='◉ Оценки';$('.map-tabs').append(feedbackLayer);
  districtsGeo=await getJSON('data/districts.geojson').catch(()=>null);
  $('#stat-completed').textContent=data.report.commissioned;$('#stat-total').textContent=data.report.total;
  const districts=[...new Set(data.objects.map(o=>o.district).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  $('#district').insertAdjacentHTML('beforeend',districts.map(d=>`<option value="${e(d)}">${e(d)}</option>`).join(''));
  $('#year').insertAdjacentHTML('beforeend',[2025,2024,2023,2022].map(y=>`<option>${y}</option>`).join(''));
  if(!districts.includes(state.district))state.district='';if(!['','2022','2023','2024','2025'].includes(state.year))state.year='';
  const sectors=[...new Set(data.objects.map(o=>o.sector).filter(Boolean))];
  if(!sectors.includes(state.sector))state.sector='';
  $('#sector-filters').innerHTML=[['','Все отрасли'],...sectors.map(s=>[s,labels[s]||s])].map(([s,label])=>`<button class="chip ${s===state.sector?'active':''}" data-sector="${e(s)}">${s?`<span class="chip-dot" style="--sector:${sectorStyle(s).color}"></span>`:''}${e(label)}</button>`).join('');
  $('#search').value=state.query;$('#district').value=state.district;$('#year').value=state.year;
  const selected=state.selected;if(selected&&data.objects.find(o=>o.id===selected&&!o.commissioned))state.scope='all';
  render();if(state.selected)renderDetail();
  let key=config.mapKey;try{key=localStorage.getItem('tula-map-key')||key;}catch{}
  if(key)await connect(key);
}catch(error){$('#results').innerHTML='<div class="empty-result"><strong>Не удалось загрузить архив</strong>Запустите приложение командой npm start и обновите страницу.</div>';toast(error.message);}



