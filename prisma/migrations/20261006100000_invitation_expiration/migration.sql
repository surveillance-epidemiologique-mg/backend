-- Les anciennes invitations conservent leur date d'envoi initiale : un lien
-- déjà vieux de plus de 24 heures sera expiré dès cette migration appliquée.
ALTER TABLE "utilisateurs"
  ADD COLUMN IF NOT EXISTS "invitation_expires_at" TIMESTAMP(3);

UPDATE "utilisateurs"
SET "invitation_expires_at" = "created_at" + INTERVAL '24 hours'
WHERE "mot_de_passe_temporaire" = true
  AND "token_reinitialisation" IS NOT NULL
  AND "invitation_expires_at" IS NULL;
