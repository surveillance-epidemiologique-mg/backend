/** Requires the migrated demo seed in a dedicated local TEST_DATABASE_URL. */
import assert from 'node:assert/strict';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { CarteService } from '../src/modules/carte/carte.service';
import { PrismaService } from '../src/core/prisma/prisma.service';
import type { AuthenticatedUser } from '../src/common/decorators/current-user.decorator';

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname))
    throw new Error('Local TEST_DATABASE_URL required.');
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    const carte = new CarteService(db as unknown as PrismaService);
    const toAuth = (u: {
      id: number;
      roleId: number;
      email: string;
      role: { name: string };
    }): AuthenticatedUser => ({
      id: u.id,
      id_role: u.roleId,
      role: u.role.name,
      email: u.email,
      tempPassword: false,
    });
    const admin = toAuth(
      await db.utilisateur.findFirstOrThrow({
        where: { role: { name: 'Administrateur' } },
        include: { role: true },
      }),
    );
    const labo = toAuth(
      await db.utilisateur.findFirstOrThrow({
        where: { role: { name: 'Laboratoire' } },
        include: { role: true },
      }),
    );
    const doctor = await db.utilisateur.findFirstOrThrow({
      where: { role: { name: 'Medecin' }, centre: { name: 'CHRD Toamasina' } },
      include: { role: true },
    });
    const doctor2 = await db.utilisateur.findFirstOrThrow({
      where: { role: { name: 'Medecin' }, centre: { name: 'CSB2 Toamasina' } },
      include: { role: true },
    });
    const cholera = await db.maladie.findFirstOrThrow({
      where: { name: 'Choléra' },
    });
    const dengue = await db.maladie.findFirstOrThrow({
      where: { name: 'La dengue' },
    });
    const rougeole = await db.maladie.findFirstOrThrow({
      where: { name: 'Rougeole' },
    });
    for (const user of [admin, labo, toAuth(doctor)]) {
      assert.equal((await carte.casGeoJson(user)).features.length, 0);
      assert.equal((await carte.clustersGeoJson(user)).features.length, 0);
    }
    const globalCases = await carte.casGeoJson(admin, undefined, cholera.id);
    assert.equal(globalCases.features.length, 13); // 12 confirmed + 1 invalidated
    assert.ok(
      globalCases.features.every((f) => f.properties.maladieId === cholera.id),
    );
    assert.equal(
      (await carte.casGeoJson(labo, undefined, cholera.id)).features.length,
      13,
    );
    const centreCases = await carte.casGeoJson(
      toAuth(doctor),
      undefined,
      cholera.id,
    );
    assert.equal(centreCases.features.length, 6);
    assert.ok(
      centreCases.features.every(
        (f) => f.properties.centreId === doctor.centreId,
      ),
    );
    const sum = (data: Awaited<ReturnType<CarteService['clustersGeoJson']>>) =>
      data.features.reduce((n, f) => n + Number(f.properties.nb), 0);
    // Global cache is primed first: restricted requests must not reuse it.
    assert.equal(sum(await carte.clustersGeoJson(admin, cholera.id)), 12);
    assert.equal(
      sum(await carte.clustersGeoJson(toAuth(doctor), cholera.id)),
      6,
    );
    assert.equal(
      sum(await carte.clustersGeoJson(toAuth(doctor2), cholera.id)),
      6,
    );
    assert.equal(sum(await carte.clustersGeoJson(labo, cholera.id)), 12);
    assert.equal(sum(await carte.clustersGeoJson(admin, dengue.id)), 15);
    assert.equal(
      sum(await carte.clustersGeoJson(toAuth(doctor), dengue.id)),
      0,
    );
    const severity = (
      data: Awaited<ReturnType<CarteService['regionsGeoJson']>>,
      name: string,
    ) =>
      data.features.find((f) => f.properties.nom === name)?.properties.gravite;
    const all = await carte.regionsGeoJson();
    assert.equal(severity(all, 'Atsinanana'), 'Critique');
    assert.equal(severity(all, 'Boeny'), 'Modere');
    const dengueRegions = await carte.regionsGeoJson(dengue.id);
    assert.equal(severity(dengueRegions, 'Atsinanana'), null);
    assert.equal(severity(dengueRegions, 'Boeny'), 'Modere');
    assert.equal(
      severity(await carte.regionsGeoJson(cholera.id), 'Atsinanana'),
      'Critique',
    );
    assert.equal(severity(await carte.regionsGeoJson(), 'Boeny'), 'Modere'); // aggregate cache preserved
    assert.ok(
      (await carte.regionsGeoJson(rougeole.id)).features.every(
        (f) => f.properties.gravite == null,
      ),
    ); // centre-only alert excluded
    assert.ok(
      (await carte.regionsGeoJson(2147483647)).features.every(
        (f) => f.properties.gravite == null,
      ),
    );
    assert.equal(
      (await carte.casGeoJson(admin, undefined, 2147483647)).features.length,
      0,
    );
    assert.equal(sum(await carte.clustersGeoJson(admin, 2147483647)), 0);
    const region = await db.zoneAdministrative.findFirstOrThrow({
      where: { name: 'Atsinanana' },
    });
    const summary = await carte.zoneSummary(
      region.id,
      toAuth(doctor),
      cholera.id,
    );
    assert.equal(summary.casTotal, 6);
    assert.equal(summary.centres.length, 1);
    assert.equal(summary.alerte?.gravite, 'Critique'); // administrative alert stays global
    assert.equal(
      (await carte.zoneSummary(region.id, admin, dengue.id)).casTotal,
      0,
    );
    // Several diseases in one region: aggregate=max, filtered=selected disease.
    const rollback = new Error('ROLLBACK_TEST');
    await db
      .$transaction(async (tx) => {
        await tx.alerte.create({
          data: {
            zoneId: region.id,
            maladieId: dengue.id,
            centreId: null,
            niveauGravite: 'Faible',
            statutAlerte: 'Active',
            detectedCaseCount: 10,
          },
        });
        const isolated = new CarteService(tx as unknown as PrismaService);
        assert.equal(
          severity(await isolated.regionsGeoJson(), 'Atsinanana'),
          'Critique',
        );
        assert.equal(
          severity(await isolated.regionsGeoJson(dengue.id), 'Atsinanana'),
          'Faible',
        );
        assert.equal(
          severity(await isolated.regionsGeoJson(cholera.id), 'Atsinanana'),
          'Critique',
        );
        await tx.utilisateur.update({
          where: { id: doctor.id },
          data: { centreId: null },
        });
        assert.equal(
          (await isolated.casGeoJson(toAuth(doctor), undefined, cholera.id))
            .features.length,
          0,
        );
        assert.equal(
          sum(await isolated.clustersGeoJson(toAuth(doctor), cholera.id)),
          0,
        );
        throw rollback;
      })
      .catch((error: unknown) => {
        if (error !== rollback) throw error;
      });
    console.log(
      'PASS: required disease, disease-isolated DBSCAN, role visibility, cache isolation, aggregate/filtered severity and region summaries.',
    );
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
