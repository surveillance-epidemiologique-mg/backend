/** Run against a dedicated, migrated and seeded LOCAL test database only.
 * TEST_DATABASE_URL=... node -r ts-node/register test/dual-alerts.integration.ts
 * All mutation checks roll back, preserving the supplied seed. */
import assert from 'node:assert/strict';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { syncAlerts } from '../src/modules/alertes/alert-detection';
import { CarteService } from '../src/modules/carte/carte.service';
import { PrismaService } from '../src/core/prisma/prisma.service';

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('A dedicated local TEST_DATABASE_URL is required.');
  }
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const demoWhere = {
      patient: { anonymousCode: { startsWith: 'DEMO-DUAL-' } },
    };
    assert.equal(await db.casEpidemiologique.count({ where: demoWhere }), 75);
    assert.equal(await db.analyse.count({ where: { cas: demoWhere } }), 225);
    const before = await db.alerte.findMany({
      where: { statutAlerte: 'Active' },
      orderBy: { id: 'asc' },
    });
    assert.equal(before.length, 15);
    const runs = await Promise.all(
      [1, 2].map(() =>
        db.$transaction((tx) => syncAlerts(tx), { timeout: 30000 }),
      ),
    );
    for (const run of runs)
      assert.deepEqual(run, {
        created: 0,
        updated: 15,
        closed: 0,
        windowDays: 7,
      });
    const after = await db.alerte.findMany({
      where: { statutAlerte: 'Active' },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(
      after.map((a) => [a.id, a.detectionDate]),
      before.map((a) => [a.id, a.detectionDate]),
    );

    const [multiLab] = await db.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT a.id_cas FROM analyses a JOIN cas_epidemiologiques c ON c.id_cas=a.id_cas
        JOIN patients p ON p.id_patient=c.id_patient WHERE p.code_anonyme LIKE 'DEMO-DUAL-%'
        GROUP BY a.id_cas HAVING COUNT(DISTINCT a.id_laboratoire) >= 2
      ) cases`;
    assert.ok(multiLab.count > 0);
    const carte = new CarteService(db as unknown as PrismaService);
    const regions = await carte.regionsGeoJson();
    assert.equal(regions.features.length, 22);
    const properties = (name: string) =>
      regions.features.find((f) => f.properties.nom === name)?.properties;
    assert.equal(properties('Vakinankaratra')?.gravite, null); // centre-only Rougeole
    assert.equal(properties('Atsinanana')?.gravite, 'Critique');
    assert.equal(properties('Boeny')?.gravite, 'Modere');
    assert.equal(properties('Haute Matsiatra')?.gravite, 'Eleve');
    assert.equal(properties('Diana')?.gravite, 'Faible');
    assert.equal(properties('Analamanga')?.gravite, 'Faible'); // region only, across districts
    const geoAlerts = await carte.alertesGeoJson();
    assert.equal(
      geoAlerts.features.filter((f) => f.properties.scope === 'Centre').length,
      6,
    );
    const [geometry] = await db.$queryRaw<
      { regions: number; centres: number }[]
    >`
      SELECT COUNT(*) FILTER (WHERE a.id_centre IS NULL AND z.type_zone='Region'
        AND ST_Equals(a.emprise_spatiale,z.geometrie))::int AS regions,
        COUNT(*) FILTER (WHERE a.id_centre IS NOT NULL
          AND ST_Area(a.emprise_spatiale::geography) BETWEEN 700000 AND 850000)::int AS centres
      FROM alertes a JOIN zones_administratives z USING(id_zone) WHERE a.statut_alerte='Active'`;
    assert.equal(geometry.regions, 5);
    assert.equal(geometry.centres, 6);

    const rollback = new Error('ROLLBACK_TEST');
    await db
      .$transaction(
        async (tx) => {
          const rougeole = await tx.maladie.findFirstOrThrow({
            where: { name: 'Rougeole' },
          });
          const centreAlert = await tx.alerte.findFirstOrThrow({
            where: { maladieId: rougeole.id, statutAlerte: 'Active' },
          });
          assert.equal(centreAlert.detectedCaseCount, 4); // excludes old, probable and suspect cases
          await tx.casEpidemiologique.updateMany({
            where: {
              patient: { anonymousCode: { startsWith: 'DEMO-DUAL-old-' } },
            },
            data: { diagnosisDate: new Date(Date.now() + 2 * 86400000) },
          });
          assert.equal((await syncAlerts(tx)).created, 0); // future diagnoses are not counted
          await tx.maladie.update({
            where: { id: rougeole.id },
            data: { alertThresholdCentre: 100 },
          });
          assert.equal((await syncAlerts(tx)).closed, 1);
          await tx.maladie.update({
            where: { id: rougeole.id },
            data: { alertThresholdCentre: 3 },
          });
          assert.equal((await syncAlerts(tx)).created, 1);
          assert.equal(
            await tx.alerte.count({
              where: { maladieId: rougeole.id, statutAlerte: 'Active' },
            }),
            1,
          );
          assert.equal(
            (
              await tx.alerte.findUniqueOrThrow({
                where: { id: centreAlert.id },
              })
            ).statutAlerte,
            'Cloturee',
          );
          // The same counts now reach the regional threshold: retain the centre too.
          await tx.maladie.update({
            where: { id: rougeole.id },
            data: { alertThresholdRegion: 4 },
          });
          assert.equal((await syncAlerts(tx)).created, 2); // district and region
          assert.equal(
            await tx.alerte.count({
              where: { maladieId: rougeole.id, statutAlerte: 'Active' },
            }),
            3,
          );
          // Moving all confirmed cases outside the rolling window closes both scales.
          await tx.casEpidemiologique.updateMany({
            where: { maladieId: rougeole.id, diagnosticStatus: 'Confirme' },
            data: { diagnosisDate: new Date('2000-01-01') },
          });
          assert.equal((await syncAlerts(tx)).closed, 3);
          throw rollback;
        },
        { timeout: 30000 },
      )
      .catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
    console.log(
      'PASS: idempotence, concurrent detection, both scales, severities, geometry, multi-lab traceability and close/reopen lifecycle.',
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
