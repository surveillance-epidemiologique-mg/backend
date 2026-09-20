import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '../../generated/prisma/client';

interface NationalCentre {
  sourceId: string;
  name: string;
  type: string;
  regionPcode: string;
  latitude: number | null;
  longitude: number | null;
}

export async function seedNationalCentres(prisma: Prisma.TransactionClient) {
  const { facilities } = JSON.parse(
    readFileSync(
      join(__dirname, '../data/madagascar-public-health-facilities.json'),
      'utf8',
    ),
  ) as { facilities: NationalCentre[] };
  const regions = await prisma.zoneAdministrative.findMany({
    where: { type: 'Region' },
    select: { id: true, pcode: true },
  });
  const ids = new Map(regions.map((region) => [region.pcode, region.id]));
  const seen = new Set<string>();
  const records = facilities.map((centre) => {
    if (
      !ids.has(centre.regionPcode) ||
      seen.has(centre.sourceId) ||
      !['CentreSante', 'PosteSante', 'Hopital'].includes(centre.type) ||
      !centre.name ||
      centre.name.length > 150 ||
      (centre.latitude === null) !== (centre.longitude === null)
    ) {
      throw new Error(`Référentiel national invalide : ${centre.sourceId}`);
    }
    seen.add(centre.sourceId);
    return { ...centre, zoneId: ids.get(centre.regionPcode) };
  });
  // One parameterized bulk upsert, keeping IDs and all user/case relationships.
  await prisma.$executeRaw`
    INSERT INTO centres_sante (source_id, nom_centre, type_centre, id_zone, latitude, longitude, localisation)
    SELECT r."sourceId", r.name, r.type::type_centre_enum, r."zoneId", r.latitude, r.longitude,
      CASE WHEN r.latitude IS NULL OR r.longitude IS NULL THEN NULL
        ELSE ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326) END
    FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS r(
      "sourceId" text, name text, type text, "zoneId" integer, latitude double precision, longitude double precision)
    ON CONFLICT (source_id) DO UPDATE SET
      nom_centre = EXCLUDED.nom_centre, type_centre = EXCLUDED.type_centre,
      id_zone = EXCLUDED.id_zone, latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude, localisation = EXCLUDED.localisation
  `;
  console.log(
    `Référentiel public historique : ${records.length} centres (${records.filter((r) => r.latitude === null).length} sans coordonnées).`,
  );
}
