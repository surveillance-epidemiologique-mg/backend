-- =====================================================================
-- Suppression des colonnes DÉPRÉCIÉES de `cas_epidemiologiques`
-- ---------------------------------------------------------------------
-- Colonnes : resultat_labo, date_analyse, id_laboratoire
-- Remplacées depuis Tâche 1 par la table `analyses`.
-- ATTENTION : opération DESTRUCTIVE — à exécuter manuellement sur un
-- environnement de recette d'abord, après validation de la bascule
-- (aucun code applicatif ne lit/écrit plus ces colonnes).
-- Nécessite l'accord explicite avant exécution (prisma db push
-- refusera sinon, ou devra passer par --accept-data-loss).
-- =====================================================================

ALTER TABLE cas_epidemiologiques DROP COLUMN IF EXISTS resultat_labo;
ALTER TABLE cas_epidemiologiques DROP COLUMN IF EXISTS date_analyse;
ALTER TABLE cas_epidemiologiques DROP COLUMN IF EXISTS id_laboratoire;