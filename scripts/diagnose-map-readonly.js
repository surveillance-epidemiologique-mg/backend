// Diagnostic sûr pour Neon : agrégats uniquement, transaction en lecture seule.
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL absente');
  const url = new URL(process.env.DATABASE_URL);
  const sslMode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: sslMode ? true : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '20000ms'");
    const queries = {
      regions: `SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE geometrie IS NOT NULL)::int AS avec_geometrie,
        COUNT(DISTINCT nom_zone)::int AS noms_distincts
        FROM zones_administratives WHERE type_zone = 'Region'`,
      cas: `SELECT COUNT(*)::int AS confirmes_total,
        MIN(date_diagnostic) AS premier_diagnostic,
        MAX(date_diagnostic) AS dernier_diagnostic
        FROM cas_epidemiologiques WHERE statut_diagnostic = 'Confirme'
          AND date_diagnostic <= CURRENT_DATE`,
      alertes: `SELECT statut_alerte, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE id_centre IS NULL)::int AS zones,
        COUNT(*) FILTER (WHERE id_centre IS NULL AND z.type_zone = 'Region')::int AS regions
        FROM alertes a JOIN zones_administratives z ON z.id_zone = a.id_zone
        GROUP BY statut_alerte ORDER BY statut_alerte`,
      rattachements: `SELECT COUNT(*)::int AS centres,
        COUNT(*) FILTER (WHERE c.localisation IS NOT NULL OR (c.latitude IS NOT NULL AND c.longitude IS NOT NULL))::int AS centres_localisables,
        COUNT(*) FILTER (WHERE z.type_zone = 'Region')::int AS centres_directement_region
        FROM centres_sante c JOIN zones_administratives z ON z.id_zone = c.id_zone`,
      seuils: `SELECT m.nom_maladie AS maladie, m.seuil_alerte_region AS seuil_region,
        m.seuil_alerte_centre AS seuil_centre,
        COUNT(c.id_cas) FILTER (WHERE c.statut_diagnostic = 'Confirme'
          AND c.date_diagnostic <= CURRENT_DATE)::int AS confirmes_total
        FROM maladies m LEFT JOIN cas_epidemiologiques c ON c.id_maladie = m.id_maladie
        GROUP BY m.id_maladie ORDER BY confirmes_total DESC, m.nom_maladie LIMIT 30`,
      regions_alertees: `SELECT z.nom_zone AS region, m.nom_maladie AS maladie,
        m.seuil_alerte_region AS seuil, a.nombre_cas_detectes AS cas_detectes,
        a.niveau_gravite AS gravite, a.statut_alerte AS statut,
        (z.geometrie IS NOT NULL) AS geometrie
        FROM alertes a JOIN zones_administratives z ON z.id_zone = a.id_zone
        JOIN maladies m ON m.id_maladie = a.id_maladie
        WHERE a.id_centre IS NULL AND z.type_zone = 'Region'
        ORDER BY a.date_detection DESC LIMIT 30`,
      alertes_actives: `SELECT z.nom_zone AS zone, m.nom_maladie AS maladie,
        a.nombre_cas_detectes AS cas_detectes, a.niveau_gravite AS gravite,
        CASE WHEN a.id_centre IS NULL THEN 'Region ou district' ELSE 'Centre' END AS echelle
        FROM alertes a JOIN zones_administratives z ON z.id_zone = a.id_zone
        JOIN maladies m ON m.id_maladie = a.id_maladie
        WHERE a.statut_alerte = 'Active' ORDER BY a.date_detection DESC LIMIT 30`,
    };
    for (const [name, sql] of Object.entries(queries)) {
      const result = await client.query(sql);
      console.log(JSON.stringify({ name, rows: result.rows }));
    }
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Diagnostic impossible : ${error.message}`);
  process.exitCode = 1;
});
