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
CREATE INDEX IF NOT EXISTS idx_cas_centre_statut ON cas_epidemiologiques (id_centre, statut_diagnostic);
CREATE INDEX IF NOT EXISTS idx_cas_maladie_date ON cas_epidemiologiques (id_maladie, date_diagnostic);
CREATE INDEX IF NOT EXISTS idx_cas_centre_maladie_date ON cas_epidemiologiques (id_centre, id_maladie, date_diagnostic);
CREATE INDEX IF NOT EXISTS idx_analyses_cas_statut ON analyses (id_cas, statut_analyse);
CREATE INDEX IF NOT EXISTS idx_analyses_laboratoire_statut ON analyses (id_laboratoire, statut_analyse);
CREATE INDEX IF NOT EXISTS idx_alertes_statut_zone_maladie ON alertes (statut_alerte, id_zone, id_maladie);
CREATE INDEX IF NOT EXISTS idx_alertes_statut_centre_maladie ON alertes (statut_alerte, id_centre, id_maladie);
CREATE INDEX IF NOT EXISTS idx_utilisateurs_centre_role ON utilisateurs (id_centre, id_role);
CREATE INDEX IF NOT EXISTS idx_centres_zone ON centres_sante (id_zone);
CREATE INDEX IF NOT EXISTS idx_cas_declaration_date ON cas_epidemiologiques (date_declaration);
CREATE INDEX IF NOT EXISTS idx_zones_parent_type ON zones_administratives (id_zone_parent, type_zone);

-- Recherche insensible à la casse des patients (utilisé par les recherches
-- partielles de code ou de nom). L'extension est idempotente sur PostgreSQL.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm
  ON patients USING GIN (lower(name_patient) gin_trgm_ops)
  WHERE name_patient IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_code_trgm
  ON patients USING GIN (lower(code_anonyme) gin_trgm_ops);
