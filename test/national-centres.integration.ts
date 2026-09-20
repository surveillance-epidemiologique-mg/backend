/** Run after migrations and seed against a disposable local database. */
import assert from 'node:assert/strict';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedNationalCentres } from '../prisma/seeders/national-centres.seeder';

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('A disposable local TEST_DATABASE_URL is required');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const snapshot = () =>
      db.centreSante.findMany({
        where: { sourceId: { startsWith: 'figshare:7725374:v1:' } },
        orderBy: { sourceId: 'asc' },
      });
    const before = await snapshot();
    const users = await db.utilisateur.count();
    assert.equal(before.length, 2677);
    assert.equal(new Set(before.map((c) => c.zoneId)).size, 22);
    assert.equal(
      before.filter((c) => c.latitude === null && c.longitude === null).length,
      13,
    );
    for (const unused of [1, 2]) {
      void unused;
      await db.$transaction(seedNationalCentres);
      assert.deepEqual(
        await snapshot(),
        before,
        'IDs and source data must remain stable',
      );
    }
    assert.equal(await db.utilisateur.count(), users);
    const [geometry] = await db.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM centres_sante
      WHERE source_id LIKE 'figshare:7725374:v1:%' AND (
        (latitude IS NULL AND localisation IS NOT NULL) OR
        (latitude IS NOT NULL AND (localisation IS NULL OR
          ST_X(localisation) != longitude OR ST_Y(localisation) != latitude)))`;
    assert.equal(geometry.count, 0);
    console.log(
      'PASS: 2677 facilities, 22 regions, 13 missing coordinates, stable IDs, geometry and repeated import.',
    );
  } finally {
    await db.$disconnect();
  }
}
void main();
