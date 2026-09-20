/**
 * Importe les 22 géométries régionales (ADM1) depuis le GeoJSON statique
 * dans la colonne PostGIS `geometrie` de `zones_administratives`.
 *
 * Usage :  node scripts/import-region-geom.js
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:5002saina@localhost:5432/epidemiologique_mg?schema=public";

const GEOJSON_PATH = path.resolve(
  __dirname,
  "../prisma/data/geoBoundaries-MDG-ADM1.geojson",
);

/** Normalise un nom : retire accents, « Region » suffix, minuscules. */
function normZoneName(dbName) {
  return dbName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+region$/i, "")
    .toLowerCase()
    .trim();
}

function normShapeName(shapeName) {
  return shapeName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function main() {
  if (!fs.existsSync(GEOJSON_PATH)) {
    console.error("GeoJSON introuvable :", GEOJSON_PATH);
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(GEOJSON_PATH, "utf8"));
  const features = geojson.features || [];
  console.log(`GeoJSON chargé : ${features.length} features`);

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // Activer PostGIS si besoin
    await client.query("CREATE EXTENSION IF NOT EXISTS postgis");

    // Récupérer les régions existantes
    const { rows: regions } = await client.query(
      "SELECT id_zone, nom_zone FROM zones_administratives WHERE type_zone = 'Region'",
    );
    console.log(`Zones Region en base : ${regions.length}`);

    // Indexer par nom normalisé
    const regionMap = new Map();
    for (const r of regions) {
      regionMap.set(normZoneName(r.nom_zone), r);
    }

    let matched = 0;
    let updated = 0;
    let skipped = 0;

    for (const f of features) {
      const shapeName = f.properties?.shapeName;
      if (!shapeName) {
        console.log(`  SKIP feature sans shapeName`);
        skipped++;
        continue;
      }

      const key = normShapeName(shapeName);
      const region = regionMap.get(key);

      if (!region) {
        console.log(`  WARN : aucune zone pour "${shapeName}" (norm="${key}")`);
        skipped++;
        continue;
      }

      matched++;

      // Convertir la géométrie GeoJSON → WKT pour PostGIS
      const geomJson = JSON.stringify(f.geometry);

      const { rowCount } = await client.query(
        `UPDATE zones_administratives
         SET geometrie = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
         WHERE id_zone = $2`,
        [geomJson, region.id_zone],
      );

      if (rowCount > 0) {
        updated++;
        console.log(`  OK : ${shapeName} → id=${region.id_zone} (${region.nom_zone})`);
      }
    }

    console.log(`\nRésultat : ${matched} matchés, ${updated} mis à jour, ${skipped} ignorés`);

    // Vérification
    const { rows: check } = await client.query(
      "SELECT count(*) AS n FROM zones_administratives WHERE type_zone='Region' AND geometrie IS NOT NULL",
    );
    console.log(`Zones Region avec géométrie : ${check[0].n}/22`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Erreur fatale :", e);
  process.exit(1);
});
