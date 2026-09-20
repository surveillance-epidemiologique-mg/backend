-- Record the already implemented multi-laboratory schema in migration history.
-- Earlier installations created it through db push; a fresh migrate deploy did
-- not create analyses or id_analyse_decision, preventing the current seed.
-- This migration is compatible with databases where those objects already exist.
BEGIN;
DO $$ BEGIN
  CREATE TYPE type_resultat_attendu_enum AS ENUM ('Numerique', 'Choix_Positif_Negatif', 'Texte_libre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE statut_analyse_enum AS ENUM ('Demandee', 'Realisee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS analyses (
  id_analyse SERIAL PRIMARY KEY,
  id_cas INTEGER NOT NULL REFERENCES cas_epidemiologiques(id_cas) ON DELETE CASCADE ON UPDATE CASCADE,
  label_analyse VARCHAR(150) NOT NULL,
  type_resultat_attendu type_resultat_attendu_enum NOT NULL,
  resultat TEXT,
  statut_analyse statut_analyse_enum NOT NULL DEFAULT 'Demandee',
  id_laboratoire INTEGER REFERENCES utilisateurs(id_utilisateur) ON DELETE SET NULL ON UPDATE CASCADE,
  date_analyse TIMESTAMPTZ(3),
  date_demande TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analyses_cas ON analyses(id_cas);
CREATE INDEX IF NOT EXISTS idx_analyses_laboratoire ON analyses(id_laboratoire);
CREATE INDEX IF NOT EXISTS idx_analyses_statut ON analyses(statut_analyse);

ALTER TABLE cas_epidemiologiques ADD COLUMN IF NOT EXISTS id_analyse_decision INTEGER;
DO $$ BEGIN
  ALTER TABLE cas_epidemiologiques ADD CONSTRAINT cas_epidemiologiques_id_analyse_decision_fkey
    FOREIGN KEY (id_analyse_decision) REFERENCES analyses(id_analyse) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same idempotent backfill as prisma/analyses-migration.sql; retain legacy data.
INSERT INTO analyses (id_cas, label_analyse, type_resultat_attendu, resultat,
  statut_analyse, id_laboratoire, date_analyse, date_demande)
SELECT c.id_cas, 'Analyse initiale', 'Texte_libre', c.resultat_labo,
  'Realisee', c.id_laboratoire, c.date_analyse, COALESCE(c.date_analyse, NOW())
FROM cas_epidemiologiques c
WHERE (c.resultat_labo IS NOT NULL OR c.id_laboratoire IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM analyses a WHERE a.id_cas=c.id_cas AND a.label_analyse='Analyse initiale');
COMMIT;
