BEGIN;

-- Preserve the existing administrative threshold. The establishment threshold
-- starts at ceil(old threshold / 2), at least 1. Numeric division avoids integer
-- truncation and overflow. Non-positive legacy values are repaired to 1.
-- Some production databases received these columns via db push. Only backfill
-- newly created columns: existing, independently configured thresholds survive.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'maladies' AND column_name = 'seuil_alerte_centre') THEN
    ALTER TABLE maladies ADD COLUMN seuil_alerte_centre INTEGER NOT NULL DEFAULT 1;
    UPDATE maladies SET seuil_alerte_centre = GREATEST(1, CEIL(seuil_alerte::numeric / 2)::integer);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'maladies' AND column_name = 'seuil_alerte_region') THEN
    ALTER TABLE maladies ADD COLUMN seuil_alerte_region INTEGER NOT NULL DEFAULT 1;
    UPDATE maladies SET seuil_alerte_region = GREATEST(1, seuil_alerte);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'maladies'::regclass AND conname = 'maladies_seuil_centre_positive') THEN
    ALTER TABLE maladies ADD CONSTRAINT maladies_seuil_centre_positive CHECK (seuil_alerte_centre >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'maladies'::regclass AND conname = 'maladies_seuil_region_positive') THEN
    ALTER TABLE maladies ADD CONSTRAINT maladies_seuil_region_positive CHECK (seuil_alerte_region >= 1);
  END IF;
END $$;

-- Keep the deprecated column during transition (same strategy as legacy lab
-- columns on cases). New application writes mirror the regional value there.
-- Drop it only in a later migration after all old clients have been retired.
COMMENT ON COLUMN maladies.seuil_alerte IS
  'Deprecated: use seuil_alerte_centre and seuil_alerte_region.';

-- NULL centre means administrative alert; non-NULL means establishment alert.
-- All existing alerts remain administrative alerts, retaining their history.
ALTER TABLE alertes ADD COLUMN IF NOT EXISTS id_centre INTEGER;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'alertes'::regclass AND contype = 'f'
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'alertes'::regclass AND attname = 'id_centre')]::smallint[]) THEN
    ALTER TABLE alertes ADD CONSTRAINT alertes_id_centre_fkey
      FOREIGN KEY (id_centre) REFERENCES centres_sante(id_centre) ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_alertes_centre ON alertes(id_centre);

-- ADM1 includes islands: Polygon cannot hold the actual regional geometry.
ALTER TABLE alertes ALTER COLUMN emprise_spatiale
  TYPE geometry(MultiPolygon, 4326) USING ST_Multi(emprise_spatiale);

-- Retain duplicate legacy rows as closed history before enforcing uniqueness.
WITH ranked AS (
  SELECT id_alerte, ROW_NUMBER() OVER (
    PARTITION BY id_zone, id_maladie
    ORDER BY date_detection DESC, id_alerte DESC
  ) AS position FROM alertes
  WHERE statut_alerte IN ('Active', 'En_investigation') AND id_centre IS NULL
)
UPDATE alertes SET statut_alerte = 'Cloturee'
WHERE id_alerte IN (SELECT id_alerte FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS alertes_open_zone_unique ON alertes(id_zone, id_maladie)
  WHERE id_centre IS NULL AND statut_alerte IN ('Active', 'En_investigation');
-- Existing centre alerts may also have been created before migration tracking.
WITH ranked AS (
  SELECT id_alerte, ROW_NUMBER() OVER (
    PARTITION BY id_centre, id_maladie ORDER BY date_detection DESC, id_alerte DESC
  ) AS position FROM alertes
  WHERE statut_alerte IN ('Active', 'En_investigation') AND id_centre IS NOT NULL
)
UPDATE alertes SET statut_alerte = 'Cloturee'
WHERE id_alerte IN (SELECT id_alerte FROM ranked WHERE position > 1);
CREATE UNIQUE INDEX IF NOT EXISTS alertes_open_centre_unique ON alertes(id_centre, id_maladie)
  WHERE id_centre IS NOT NULL AND statut_alerte IN ('Active', 'En_investigation');

COMMIT;
