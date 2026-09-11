"""Deterministic CSV import. Run: python scripts/import.py"""
import csv
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
source = next(ROOT.glob('*.csv'))
rows = list(csv.reader(source.open(encoding='utf-8-sig', newline=''), delimiter=';'))

def clean(value):
    value = re.sub(r'\s+', ' ', value).strip()
    return None if value in ('', '-', '0', '0,00') else value

def year(value):
    match = re.search(r'\b(20\d{2})\b', value)
    return int(match[1]) if match else None

def number(value):
    try:
        return float(value.replace('\xa0', '').replace(' ', '').replace(',', '.'))
    except ValueError:
        return None

objects = []
for row in rows[3:]:
    if not any(row):
        continue
    if len(row) != 35:
        raise ValueError(f'Invalid column count: {row[0]}')
    lat, lon = number(row[5]), number(row[6])
    coordinates = [lon, lat] if lat is not None and lon is not None else None
    if coordinates and not (52.8 < lat < 55 and 35.8 < lon < 39):
        raise ValueError(f'Coordinates outside expected region: {row[0]}')
    district = clean(row[10])
    if district:
        district = district.replace('Арсеньевского района', 'Арсеньевский район').replace('Каменского района', 'Каменский район').replace('Киреевского района', 'Киреевский район').replace('Щекинского района', 'Щекинский район').replace('Узловского района', 'Узловский район')
        district = district.removeprefix('АМО ')
    sector = clean(row[7])
    if sector == 'Жилищно коммунальное хозяйство':
        sector = 'Жилищно-коммунальное хозяйство'
    objects.append(dict(
        id='oks-' + hashlib.sha256(row[2].strip().encode()).hexdigest()[:12],
        sourceRow=int(row[0]), name=clean(row[2]), sector=sector,
        stage=clean(row[3]), status=clean(row[8]), commissioned=row[8].strip() == 'Введен в эксплуатацию',
        address=clean(row[4]), coordinates=coordinates, district=district,
        ownership=clean(row[9]), customer=clean(row[11]), contractor=clean(row[25]),
        program=clean(row[12]), federalProject=clean(row[13]),
        area=number(row[15]) or None, capacity=clean(row[16]),
        startYear=year(row[18]), endYear=year(row[19]), commissionYear=year(row[33]),
        contractDate=clean(row[23]), contractPeriod=clean(row[24]),
        progress=number(row[26]), commissionDate=clean(row[31]), commissionNumber=clean(row[32]),
        source='Архив социальных объектов — данные организаторов',
        media=[], contract=None,
    ))

enrichment_path = ROOT / 'data/enrichment.json'
if enrichment_path.exists():
    enrichment = json.loads(enrichment_path.read_text(encoding='utf-8'))['objects']
    allowed = {'media', 'historyNote', 'news', 'reportedCost', 'procurement'}
    for obj in objects:
        extra = enrichment.get(str(obj['sourceRow']), {})
        if set(extra) - allowed:
            raise ValueError('Enrichment must not override archive fields')
        obj.update(extra)

report = dict(total=len(objects), mapped=sum(o['coordinates'] is not None for o in objects),
              commissioned=sum(o['commissioned'] for o in objects),
              missingAddress=sum(o['address'] is None for o in objects),
              missingDistrict=sum(o['district'] is None for o in objects))
(ROOT / 'data').mkdir(exist_ok=True)
(ROOT / 'data/objects.json').write_text(json.dumps(dict(schemaVersion=1, sourceFile=source.name, sourceDate=None, report=report, objects=objects), ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report))
