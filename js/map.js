import {sectorStyle,escapeHTML as e} from './data.js';

// GeoJSON uses [longitude, latitude]; Yandex 2.1 uses [latitude, longitude].
const latlon=point=>[point[1],point[0]];
const rings=coordinates=>coordinates.map(ring=>ring.map(latlon));
export class ObjectMap {
  constructor(onSelect){this.onSelect=onSelect;this.objects=[];this.selected=null;this.polygons=[];}
  async init(key){
    if(!key)return false;
    if(!window.ymaps)await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=`https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
      const timeout=setTimeout(()=>reject(new Error('Яндекс Карты не ответили. Проверьте сеть и ограничения ключа.')),20000);
      script.onload=()=>{clearTimeout(timeout);resolve();};
      script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('Не удалось загрузить Яндекс Карты. Проверьте ключ и соединение.'));};
      document.head.append(script);
    });
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Карта не готова. Проверьте ограничения ключа.')),20000);ymaps.ready(()=>{clearTimeout(timeout);resolve();});});
    this.map=new ymaps.Map('map',{center:[54.12,37.62],zoom:8,controls:[]},{suppressMapOpenBlock:true,autoFitToViewport:'always'});
    this.cluster=new ymaps.Clusterer({clusterIcons:[{href:'/assets/cluster.svg',size:[44,44],offset:[-22,-22]}],groupByCoordinates:false,gridSize:58,clusterDisableClickZoom:false,clusterOpenBalloonOnClick:true,clusterBalloonContentLayout:'cluster#balloonCarousel',clusterBalloonPanelMaxMapArea:0});
    this.map.geoObjects.add(this.cluster);
    this.markerLayout=ymaps.templateLayoutFactory.createClass('<div class="marker $[properties.selected]" style="--sector:$[properties.color]" role="button" tabindex="0" aria-label="$[properties.safeName]" data-object="$[properties.objectId]"><span>$[properties.symbol]</span></div>');
    document.querySelector('#map-empty').hidden=true;this.drawMarkers();return true;
  }
  setObjects(objects,selected){this.objects=objects.filter(o=>o.coordinates);this.selected=selected;this.drawMarkers();}
  drawMarkers(){
    if(!this.map)return;
    this.cluster.removeAll();
    const markers=this.objects.map(o=>{
      const style=sectorStyle(o.sector);
      const marker=new ymaps.Placemark(latlon(o.coordinates),{
        objectId:o.id,safeName:e(o.name),selected:o.id===this.selected?'selected':'',color:style.color,symbol:style.icon,
        hintContent:e(o.name),balloonContentHeader:e(o.name),balloonContentBody:`<button class="secondary" data-object="${o.id}">Открыть карточку ↗</button>`,
      },{iconLayout:this.markerLayout,iconShape:{type:'Rectangle',coordinates:[[-20,-43],[24,3]]},openBalloonOnClick:false,zIndex:o.id===this.selected?1000:100});
      marker.events.add('click',()=>this.onSelect(o.id));return marker;
    });
    this.cluster.add(markers);
  }
  focus(object){if(this.map&&object.coordinates){this.map.balloon.close();const [lon,lat]=object.coordinates;this.map.setBounds([[lat-.003,lon-.005],[lat+.003,lon+.005]],{checkZoomRange:true,duration:350,zoomMargin:this.margins()});}}
  margins(){return innerWidth>800?[80,Math.min(420,document.querySelector('#map').clientWidth*.48),60,35]:[35,35,35,35];}
  fit(){this.map?.setCenter([54.12,37.62],8,{duration:350});}
  zoom(delta){if(this.map)this.map.setZoom(Math.max(5,Math.min(19,this.map.getZoom()+delta)),{duration:200});}
  satellite(enabled){this.map?.setType(enabled?'yandex#hybrid':'yandex#map');}
  clearGeometry(){if(this.map)this.polygons.forEach(p=>this.map.geoObjects.remove(p));this.polygons=[];}
  showFeedback(rows){
    if(!this.map)return;this.clearGeometry();
    for(const row of rows){
      if(row.satisfaction===null||!row.object.coordinates)continue;
      const color=row.satisfaction<40?'#c87360':row.satisfaction<70?'#c5a354':'#769e65';
      const circle=new ymaps.Circle([latlon(row.object.coordinates),2400],{hintContent:`${e(row.object.name)}: ${row.satisfaction}% оценок 4–5 · ${row.rated} ответов · прототип`},{fillColor:color,fillOpacity:.27,strokeColor:color,strokeOpacity:.65,strokeWidth:2,zIndex:1});
      circle.events.add('click',()=>this.onSelect(row.objectId));this.map.geoObjects.add(circle);this.polygons.push(circle);
    }
  }
  showDistricts(collection,selected,level,onSelect){
    if(!this.map)return;this.clearGeometry();
    const colors={low:'#cf6d5b',normal:'#7ba366',high:'#598db9'};
    for(const feature of collection.features){
      const active=feature.properties.district===selected;
      const geometries=feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[feature.geometry.coordinates];
      for(const coordinates of geometries){
        const polygon=new ymaps.Polygon(rings(coordinates),{hintContent:e(feature.properties.district)+(active?' · учебный сценарий':' · нет оценки')},{fillColor:active?(colors[level]||'#999f94'):'#91988b',fillOpacity:active?.35:.08,strokeColor:active?'#6b7f5e':'#9ba58e',strokeWidth:active?2:1});
        polygon.events.add('click',()=>onSelect(feature.properties.district));this.map.geoObjects.add(polygon);this.polygons.push(polygon);
      }
    }
  }
  showGeometry(geometry){
    if(!this.map)throw new Error('Сначала подключите основную карту.');
    this.clearGeometry();
    const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
    for(const coordinates of polygons){
      const feature=new ymaps.Polygon(rings(coordinates),{},{fillColor:'#4f7eb1',fillOpacity:.23,strokeColor:'#527cad',strokeWidth:2});
      this.map.geoObjects.add(feature);this.polygons.push(feature);
    }
    const points=polygons.flat(2);const lons=points.map(p=>p[0]),lats=points.map(p=>p[1]);
    this.map.setBounds([[Math.min(...lats),Math.min(...lons)],[Math.max(...lats),Math.max(...lons)]],{checkZoomRange:true,duration:350,zoomMargin:this.margins()});
  }
}
