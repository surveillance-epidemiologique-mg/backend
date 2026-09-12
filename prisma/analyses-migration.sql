-- Migration : cas_epidemiologiques.resultat_labo / date_analyse / id_laboratoire
--             -> nouvelles lignes dans la table `analyses`
-- Pour chaque cas ayant déjà un résultat ou un laboratoire, on crée une analyse
-- « Analyse initiale » déjà réalisée, en reprenant les anciennes valeurs.
-- Idempotent : ne recrée pas une « Analyse initiale » déjà existante pour un cas.

INSERT INTO analyses (
  id_cas,
  label_analyse,
  type_resultat_attendu,
  resultat,
  statut_analyse,
  id_laboratoire,
  date_analyse,
  date_demande
)
SELECT
  c.id_cas,
  'Analyse initiale',
  'Texte_libre',
  c.resultat_labo,
  'Realisee',
  c.id_laboratoire,
  c.date_analyse,
  COALESCE(c.date_analyse, NOW())
FROM cas_epidemiologiques c
WHERE (c.resultat_labo IS NOT NULL OR c.id_laboratoire IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM analyses a
    WHERE a.id_cas = c.id_cas AND a.label_analyse = 'Analyse initiale'
  );