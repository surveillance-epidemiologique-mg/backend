import { Prisma } from '../../generated/prisma/client';
import { seedZonesAdministratives } from './zone-administrative.seeder';
import { seedZonesGeometrie } from './zone-geometrie.seeder';

/** Call inside a transaction: any missing/invalid geometry rolls back the import. */
export async function seedProductionZones(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(20260920, 1)`;
  const zones = await seedZonesAdministratives(tx, { regionsOnly: true });
  const ids = [...zones.values()].map(Number);
  await seedZonesGeometrie(tx, ids);
  const [check] = await tx.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM zones_administratives
    WHERE id_zone IN (${Prisma.join(ids)}) AND type_zone = 'Region'
      AND geometrie IS NOT NULL AND NOT ST_IsEmpty(geometrie)
      AND ST_IsValid(geometrie) AND ST_SRID(geometrie) = 4326`;
  if (check?.count !== 22 || ids.length !== 22)
    throw new Error(
      'Import annulé : les 22 régions doivent avoir une géométrie valide.',
    );
}
