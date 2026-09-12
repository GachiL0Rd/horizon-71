import {sectorStyle,escapeHTML as e} from './data.js';

const latlon=point=>[point[1],point[0]];
const rings=coordinates=>coordinates.map(ring=>ring.map(latlon));

export class ObjectMap {
  constructor(onSelect){this.onSelect=onSelect;this.objects=[];this.selected=null;this.polygons=[];}
  async init(){
    if(!window.ymaps) await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/api/yandex-maps.js';
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
    if(!this.map)return;this.cluster.removeAll();
    this.cluster.add(this.objects.map(o=>{
      const style=sectorStyle(o.sector);
      const marker=new ymaps.Placemark(latlon(o.coordinates),{objectId:o.id,safeName:e(o.name),selected:o.id===this.selected?'selected':'',color:style.color,symbol:style.icon,hintContent:e(o.name),balloonContentHeader:e(o.name),balloonContentBody:`<button class="secondary" data-object="${o.id}">Открыть карточку ↗</button>`},{iconLayout:this.markerLayout,iconShape:{type:'Rectangle',coordinates:[[-20,-43],[24,3]]},openBalloonOnClick:false,zIndex:o.id===this.selected?1000:100});
      marker.events.add('click',()=>this.onSelect(o.id));return marker;
    }));
  }
  focus(object){if(this.map&&object.coordinates){this.map.balloon.close();const [lon,lat]=object.coordinates;this.map.setBounds([[lat-.003,lon-.005],[lat+.003,lon+.005]],{checkZoomRange:true,duration:350,zoomMargin:this.margins()});}}
  margins(){return innerWidth>800?[80,Math.min(420,document.querySelector('#map').clientWidth*.48),60,35]:[35,35,35,35];}
  fit(){this.map?.setCenter([54.12,37.62],8,{duration:350});}
  zoom(delta){if(this.map)this.map.setZoom(Math.max(5,Math.min(19,this.map.getZoom()+delta)),{duration:200});}
  satellite(enabled){this.map?.setType(enabled?'yandex#hybrid':'yandex#map');}
  clearGeometry(){if(this.map)this.polygons.forEach(p=>this.map.geoObjects.remove(p));this.polygons=[];}
  showGeometry(geometry){
    if(!this.map)throw new Error('Сначала подключите основную карту.');this.clearGeometry();
    const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
    for(const coordinates of polygons){const feature=new ymaps.Polygon(rings(coordinates),{},{fillColor:'#4f7eb1',fillOpacity:.23,strokeColor:'#527cad',strokeWidth:2});this.map.geoObjects.add(feature);this.polygons.push(feature);}
    const points=polygons.flat(2),lons=points.map(p=>p[0]),lats=points.map(p=>p[1]);
    this.map.setBounds([[Math.min(...lats),Math.min(...lons)],[Math.max(...lats),Math.max(...lons)]],{checkZoomRange:true,duration:350,zoomMargin:this.margins()});
  }
}
