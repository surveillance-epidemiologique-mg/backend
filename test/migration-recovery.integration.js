// Run only against an EMPTY disposable local database via TEST_DATABASE_URL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const sql = (name) =>
  fs.readFileSync(
    path.join(__dirname, '../prisma/migrations', name, 'migration.sql'),
    'utf8',
  );
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw Error('Disposable local TEST_DATABASE_URL required');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    for (const name of [
      '20260819224558_init',
      '20260908110000_fix_missing_columns',
      '20260920080000_align_existing_analyses',
    ])
      await db.query(sql(name));
    await db.query(`ALTER TABLE maladies ADD COLUMN seuil_alerte_centre integer NOT NULL DEFAULT 1, ADD COLUMN seuil_alerte_region integer NOT NULL DEFAULT 1;
      INSERT INTO maladies(nom_maladie,seuil_alerte,seuil_alerte_centre,seuil_alerte_region) VALUES ('Recovery test',20,3,17);
      ALTER TABLE alertes ADD COLUMN id_centre integer REFERENCES centres_sante(id_centre) ON DELETE RESTRICT ON UPDATE CASCADE;
      CREATE INDEX idx_alertes_centre ON alertes(id_centre);
      ALTER TABLE centres_sante ADD COLUMN source_id varchar(100) UNIQUE;`);
    for (let i = 0; i < 2; i++) {
      await db.query(sql('20260920090000_dual_alert_thresholds'));
      await db.query(sql('20260921090000_national_centres'));
    }
    assert.deepEqual(
      (
        await db.query(
          'SELECT seuil_alerte_centre, seuil_alerte_region FROM maladies',
        )
      ).rows,
      [{ seuil_alerte_centre: 3, seuil_alerte_region: 17 }],
    );
    assert.equal(
      (
        await db.query(
          "SELECT type FROM geometry_columns WHERE f_table_name='alertes'",
        )
      ).rows[0].type,
      'MULTIPOLYGON',
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM pg_indexes WHERE indexname IN ('alertes_open_zone_unique','alertes_open_centre_unique')",
        )
      ).rows[0].n,
      2,
    );
    console.log(
      'PASS: existing columns, retained thresholds, repeated migrations, geometry and unique indexes.',
    );
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
