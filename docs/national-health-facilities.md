# Référentiel national des établissements publics

Le seed inclut les **2 677 lignes Madagascar** du fichier `00 SSA MFL (130219).xlsx`, publié en 2019 par l'équipe de recherche KEMRI/OMS :

- Source : https://doi.org/10.6084/m9.figshare.7725374.v1 (version figée v1).
- Téléchargement : https://ndownloader.figshare.com/files/14379593.
- Licence : CC0-1.0. MD5 du classeur : `3bf56fc31081c8fd798789a3d70564b8`.
- Publication associée : https://pmc.ncbi.nlm.nih.gov/articles/PMC6658526/ (source Madagascar datée de 2012).

Il s'agit d'un inventaire **historique public**, pas d'une liste exhaustive actuelle de tous les établissements publics et privés. Aucune certification d'activité en 2026 n'est implicite.

## Données et limites

Le JSON conserve noms, catégories, région source, propriétaire et provenance des coordonnées. Les 1 642 « Health Centre », 910 « Health Post » et 125 « Hospital » reçoivent des catégories générales : aucune classification CSB1/CSB2/CHRD/CHRR/CHU n'est inventée. Les 13 établissements sans coordonnées sont importés avec latitude, longitude et géométrie nulles.

Les régions sont reliées aux 22 régions historiques du GeoJSON fourni, avec correspondance explicite des variantes `Vakinakaratra` et `Analanjorofo`. La source ne donne pas de district : les établissements sont directement rattachés à leur région. Les subdivisions administratives plus récentes ne sont pas reconstituées.

Contrôle spatial sur le GeoJSON du projet : **102 positions connues sont hors de la géométrie de leur région déclarée**. Ces incohérences historiques sont conservées telles quelles, sans déplacement artificiel ni changement silencieux de région. Il faut les vérifier avant utilisation opérationnelle ; le rattachement administratif source reste la référence pour l'agrégation des cas.

Les 14 centres de démonstration existants sont conservés séparément pour ne pas casser les cas, comptes et alertes de test : une base vide contient donc **2 691 entrées**, et non 2 691 établissements réels distincts certifiés. Des recouvrements avec les centres démo ou des homonymes du référentiel sont possibles ; aucun rapprochement approximatif n'est effectué. Les 14 médecins démo et 3 agents laboratoire ne sont pas multipliés par l'import national.

## Exécution et reproduction

Appliquer les migrations, régénérer Prisma puis lancer le seed habituel :

```sh
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

Le seed utilise le JSON versionné et n'a besoin ni du réseau ni de Python. L'import est transactionnel et effectue un upsert en lot sur `source_id` (version du référentiel + numéro de ligne Excel), sans modifier les identifiants ni les relations existantes. Une relance réapplique les valeurs source aux établissements importés ; les corrections locales de ces champs seraient donc remplacées. Les établissements créés manuellement ne sont pas fusionnés par nom.

Pour reproduire le JSON depuis le classeur original, avec Python et openpyxl installés :

```sh
python scripts/extract-national-centres.py chemin/vers/source.xlsx
```

Le script refuse un classeur dont la somme de contrôle diffère. Un référentiel plus récent doit faire l'objet d'une stratégie explicite de rapprochement, pas d'un remplacement aveugle des identifiants.

Test d'intégration, sur base locale jetable migrée et seedée, avec `TEST_DATABASE_URL` défini :

```sh
node -r ts-node/register test/national-centres.integration.ts
```
