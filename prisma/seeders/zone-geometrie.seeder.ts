import * as fs from 'fs';
import * as path from 'path';
import { Prisma } from '../../generated/prisma/client';
import { TypeZone } from '../../generated/prisma/enums';
import { normalizeRegionName } from './region-name.util';

interface Adm1Feature {
  properties?: { shapeName?: string; name?: string };
  geometry?: unknown;
}

const GEOJSON_PATH = path.join(
  __dirname,
  '..',
  'data',
  'geoBoundaries-MDG-ADM1.geojson',
);

export async function seedZonesGeometrie(
  prisma: Prisma.TransactionClient,
  zoneIds?: number[],
) {
  if (!fs.existsSync(GEOJSON_PATH)) {
    throw new Error(
      `Fichier GeoJSON introuvable : ${GEOJSON_PATH}. Copiez geoBoundaries-MDG-ADM1.geojson dans prisma/data/.`,
    );
  }

  const collection = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf-8')) as {
    features: Adm1Feature[];
  };

  const regions = await prisma.zoneAdministrative.findMany({
    where: {
      type: TypeZone.Region,
      ...(zoneIds ? { id: { in: zoneIds } } : {}),
    },
    select: { id: true, name: true },
  });
  const regionIdByName = new Map(
    regions.map((region) => [normalizeRegionName(region.name), region.id]),
  );

  let imported = 0;
  const missing: string[] = [];

  for (const feature of collection.features) {
    const shapeName =
      feature.properties?.shapeName ?? feature.properties?.name ?? '';
    if (!shapeName || !feature.geometry) {
      continue;
    }

    const zoneId = regionIdByName.get(normalizeRegionName(shapeName));
    if (!zoneId) {
      missing.push(shapeName);
      continue;
    }

    const geomJson = JSON.stringify(feature.geometry);
    await prisma.$executeRaw`
      UPDATE zones_administratives
      SET geometrie = ST_Multi(
        ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}::text), 4326)
      )
      WHERE id_zone = ${zoneId}
    `;
    imported++;
  }

  if (missing.length > 0) {
    throw new Error(
      `Géométries non associées (${missing.length}) : ${missing.join(', ')}`,
    );
  }

  console.log(
    `Géométries régionales importées : ${imported}/${collection.features.length}.`,
  );
}
