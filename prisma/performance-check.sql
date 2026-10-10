-- Requêtes de contrôle à exécuter sur une base de staging/production après
-- application de la migration 20260929100000_performance_indexes.
-- Elles permettent de vérifier l'utilisation des index avec les vraies
-- cardinalités de la base (EXPLAIN ANALYZE BUFFERS doit être lu avant/après).

EXPLAIN (ANALYZE, BUFFERS)
SELECT c.id_cas
FROM cas_epidemiologiques c
WHERE c.id_centre = 1
  AND c.statut_diagnostic = 'Confirme'
  AND c.id_maladie = 1;

EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id_cas
FROM analyses a
WHERE a.id_laboratoire = 1
  AND a.statut_analyse IN ('Demandee', 'Realisee');

EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id_alerte
FROM alertes a
WHERE a.statut_alerte = 'Active'
  AND a.id_zone = 1
  AND a.id_maladie = 1;

EXPLAIN (ANALYZE, BUFFERS)
SELECT p.id_patient
FROM patients p
WHERE lower(p.name_patient) LIKE '%rana%'
   OR lower(p.code_anonyme) LIKE '%pat-2026%';
