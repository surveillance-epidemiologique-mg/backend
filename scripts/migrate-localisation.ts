import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log('--- Migration: Localisation Centres de Santé ---');

  const result = await pool.query(`
    UPDATE centres_sante
    SET localisation = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND localisation IS NULL;
  `);

  console.log(`Migration terminée avec succès.`);
  console.log(`${result.rowCount} centre(s) de santé mis à jour.`);
}

main()
  .catch((e) => {
    console.error('Erreur lors de la migration :', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
