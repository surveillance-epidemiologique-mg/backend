-- La migration précédente enregistrait des liens valables 24 heures.
-- Ajouter six jours aux invitations encore en attente, y compris sur les
-- installations ayant déjà appliqué cette migration. Les nouveaux liens de
-- sept jours ne sont pas concernés par cette correction.
UPDATE "utilisateurs"
SET "invitation_expires_at" = "invitation_expires_at" + INTERVAL '6 days'
WHERE "mot_de_passe_temporaire" = true
  AND "token_reinitialisation" IS NOT NULL
  AND "invitation_expires_at" IS NOT NULL
  AND "invitation_expires_at" <= CURRENT_TIMESTAMP + INTERVAL '24 hours';
