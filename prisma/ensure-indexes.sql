-- =====================================================================
-- Index de maintenance (PostGIS / B-Tree)
-- ---------------------------------------------------------------------
-- ATTENTION : `prisma db push` supprime les index non déclarés dans le
-- schéma Prisma (dérive détectée). Les index GiST sur colonnes
-- géométriques `Unsupported` ne peuvent PAS être déclarés dans Prisma.
-- => Réexécuter ce script après chaque `prisma db push`.
-- =====================================================================

-- Index GiST spatiaux (requêtes de la carte)
CREATE INDEX IF NOT EXISTS idx_zones_geom ON zones_administratives USING GIST (geometrie);
CREATE INDEX IF NOT EXISTS idx_centres_loc ON centres_sante USING GIST (localisation);
CREATE INDEX IF NOT EXISTS idx_cas_loc ON cas_epidemiologiques USING GIST (localisation_cas);
CREATE INDEX IF NOT EXISTS idx_alertes_geom ON alertes USING GIST (emprise_spatiale);

-- Index B-Tree complémentaires
CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs (email);