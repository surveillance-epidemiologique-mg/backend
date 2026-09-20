"""Extract the pinned CC0 Figshare v1 workbook; requires openpyxl (read only).
Usage: python scripts/extract-national-centres.py path/to/source.xlsx
"""
import hashlib
import json
from pathlib import Path
import sys
import openpyxl

source = Path(sys.argv[1])
if hashlib.md5(source.read_bytes()).hexdigest() != '3bf56fc31081c8fd798789a3d70564b8':
    raise ValueError('Expected Figshare file 14379593, version 1; source checksum differs')
regions = dict(zip(
    ['Analamanga', 'Atsinanana', 'Diana', 'Sava', 'Sofia', 'Boeny', 'Betsiboka', 'Melaky', 'Bongolava', 'Itasy', 'Vakinakaratra', 'Alaotra Mangoro', 'Analanjorofo', 'Menabe', "Amoron'I Mania", 'Haute Matsiatra', 'Vatovavy Fitovinany', 'Atsimo Atsinanana', 'Ihorombe', 'Atsimo Andrefana', 'Anosy', 'Androy'],
    ['MG-T', 'MG-A', 'MG-D', 'MG-SV', 'MG-SO', 'MG-B', 'MG-BE', 'MG-ML', 'MG-BG', 'MG-IT', 'MG-VK', 'MG-AM', 'MG-AF', 'MG-MN', 'MG-MM', 'MG-HM', 'MG-VF', 'MG-AA', 'MG-IH', 'MG-AT', 'MG-AN', 'MG-AD']))
types = {'Health Centre': 'CentreSante', 'Health Post': 'PosteSante', 'Hospital': 'Hopital'}
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
facilities = []
for row_number, row in enumerate(workbook['SSA MFL'].iter_rows(values_only=True), 1):
    country, region, name, kind, ownership, lat, lon, coordinate_source = row
    if country != 'Madagascar':
        continue
    if lat is None or lon is None:
        lat = lon = None
    elif not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError(f'Invalid coordinates at row {row_number}')
    facilities.append(dict(sourceId=f'figshare:7725374:v1:{row_number}', name=name,
        type=types[kind], regionPcode=regions[region], latitude=lat, longitude=lon,
        sourceRegion=region, sourceType=kind, ownership=ownership, coordinateSource=coordinate_source))
workbook.close()
assert len(facilities) == 2677
output = Path(__file__).resolve().parents[1] / 'prisma/data/madagascar-public-health-facilities.json'
output.write_text(json.dumps(dict(source='https://doi.org/10.6084/m9.figshare.7725374.v1',
    fileId=14379593, license='CC0-1.0', facilities=facilities), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(facilities)} facilities written to {output}')
