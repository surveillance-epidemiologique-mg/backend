-- Performance indexes for the high-frequency dashboard, case, laboratory and
-- alert queries. All indexes are additive and preserve existing behaviour.

-- Combined RBAC/status and disease/date filters used by Cas Clinique,
-- dashboard KPI and the alert detector's sliding window.
CREATE INDEX IF NOT EXISTS idx_cas_centre_statut
  ON cas_epidemiologiques (id_centre, statut_diagnostic);
CREATE INDEX IF NOT EXISTS idx_cas_maladie_date
  ON cas_epidemiologiques (id_maladie, date_diagnostic);
CREATE INDEX IF NOT EXISTS idx_cas_centre_maladie_date
  ON cas_epidemiologiques (id_centre, id_maladie, date_diagnostic);

-- Laboratory tabs and patient detail load analyses by case, laboratory and
-- status in one relation query.
CREATE INDEX IF NOT EXISTS idx_analyses_cas_statut
  ON analyses (id_cas, statut_analyse);
CREATE INDEX IF NOT EXISTS idx_analyses_laboratoire_statut
  ON analyses (id_laboratoire, statut_analyse);

-- Active alert aggregation by administrative zone, centre and disease.
CREATE INDEX IF NOT EXISTS idx_alertes_statut_zone_maladie
  ON alertes (statut_alerte, id_zone, id_maladie);
CREATE INDEX IF NOT EXISTS idx_alertes_statut_centre_maladie
  ON alertes (statut_alerte, id_centre, id_maladie);

-- Resolve the connected user's default centre/role without scanning users.
CREATE INDEX IF NOT EXISTS idx_utilisateurs_centre_role
  ON utilisateurs (id_centre, id_role);
CREATE INDEX IF NOT EXISTS idx_centres_zone
  ON centres_sante (id_zone);
CREATE INDEX IF NOT EXISTS idx_cas_declaration_date
  ON cas_epidemiologiques (date_declaration);

-- Hierarchy and type filters used while building regional GeoJSON and alert
-- summaries.
CREATE INDEX IF NOT EXISTS idx_zones_parent_type
  ON zones_administratives (id_zone_parent, type_zone);

-- Patient search uses case-insensitive partial matching (Prisma `contains`,
-- mode `insensitive`). pg_trgm makes those predicates indexable while the
-- existing unique B-tree index continues to enforce anonymous-code uniqueness.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm
  ON patients USING GIN (lower(name_patient) gin_trgm_ops)
  WHERE name_patient IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_code_trgm
  ON patients USING GIN (lower(code_anonyme) gin_trgm_ops);
