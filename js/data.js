export const SECTORS = {
  'Образование': {color:'#496bc6', icon:'▤'},
  'Здравоохранение': {color:'#d76a77', icon:'+'},
  'Физическая культура и спорт': {color:'#dd9141', icon:'◈'},
  'Культура': {color:'#956abc', icon:'♧'},
  'Жилищно-коммунальное хозяйство': {color:'#448e8a', icon:'⌂'},
  'Энергетика': {color:'#b59a37', icon:'ϟ'},
};
export const sectorStyle = sector => SECTORS[sector] || {color:'#738379', icon:'◇'};
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function filterObjects(objects, state) {
  const query = state.query.trim().toLocaleLowerCase('ru').replaceAll('ё','е');
  return objects.filter(o => (state.scope !== 'completed' || o.commissioned)
    && (!state.sector || o.sector === state.sector)
    && (!state.district || o.district === state.district)
    && (!state.year || o.commissionYear === Number(state.year))
    && (!query || [o.name,o.address,o.district,o.contractor].join(' ').toLocaleLowerCase('ru').replaceAll('ё','е').includes(query)));
}
export function coverage(capacity, population, norm) {
  if (![capacity,population,norm].every(Number.isFinite) || capacity < 0 || population <= 0 || norm <= 0) return null;
  const ratio = capacity / (population * norm / 1000);
  return {percent: Math.round(ratio*100), level: ratio < .9 ? 'low' : ratio > 1.1 ? 'high' : 'normal'};
}
export async function getJSON(url) {
  const res = await fetch(url, {signal:AbortSignal.timeout(25000)});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Не удалось загрузить данные');
  return data;
}
