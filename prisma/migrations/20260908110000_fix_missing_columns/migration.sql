-- Migration corrective : colonnes et tables manquantes
-- Appliquée manuellement car la connexion directe psql depuis la machine locale est bloquée par Neon

-- 1. Ajouter les colonnes de réinitialisation de mot de passe manquantes dans utilisateurs
ALTER TABLE "utilisateurs"
  ADD COLUMN IF NOT EXISTS "code_reinitialisation" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "code_reinitialisation_expire" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tentatives_reinitialisation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "jeton_reinitialisation" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "jeton_reinitialisation_expire" TIMESTAMP(3);

-- 2. Ajouter latitude/longitude dans cas_epidemiologiques
ALTER TABLE "cas_epidemiologiques"
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- 3. Ajouter latitude/longitude dans centres_sante
ALTER TABLE "centres_sante"
  ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- 4. Ajouter name_patient dans patients
ALTER TABLE "patients"
  ADD COLUMN IF NOT EXISTS "name_patient" VARCHAR(150);

-- 5. Ajouter la valeur 'Probable' dans l'enum statut_diag_enum si elle n'existe pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'statut_diag_enum'::regtype
    AND enumlabel = 'Probable'
  ) THEN
    ALTER TYPE "statut_diag_enum" ADD VALUE 'Probable' BEFORE 'Confirme';
  END IF;
END$$;

-- 6. Créer la table notifications si elle n'existe pas
CREATE TABLE IF NOT EXISTS "notifications" (
    "id_notification" SERIAL NOT NULL,
    "id_utilisateur" INTEGER NOT NULL,
    "id_cas" INTEGER,
    "message" VARCHAR(255) NOT NULL,
    "lue" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id_notification")
);

-- 7. Ajouter les foreign keys pour notifications si elles n'existent pas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_id_utilisateur_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_id_utilisateur_fkey"
      FOREIGN KEY ("id_utilisateur")
      REFERENCES "utilisateurs"("id_utilisateur")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_id_cas_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_id_cas_fkey"
      FOREIGN KEY ("id_cas")
      REFERENCES "cas_epidemiologiques"("id_cas")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- 8. Créer l'index sur notifications si il n'existe pas
CREATE INDEX IF NOT EXISTS "idx_notification_user_lue" ON "notifications"("id_utilisateur", "lue");
