# Alertes à deux échelles

## Comportement

L'API maladie expose `alertThresholdCentre` et `alertThresholdRegion`, deux entiers de 1 à 2 147 483 647. Les deux sont obligatoires à la création et indépendants à la modification. Aucune règle n'impose que le seuil centre soit inférieur au seuil de zone.

Le moteur compte les cas **Confirme**, selon `date_diagnostic`, dans la fenêtre `ALERTE_WINDOW_DAYS` (7 jours par défaut), jusqu'à la date du calcul incluse. Les cas suspects, probables, invalidés, anciens ou futurs sont exclus. L'égalité au seuil déclenche une alerte (`nombre >= seuil`).

Chaque cas contribue une fois à son centre, une fois à sa zone de rattachement et une fois à chacun des ancêtres administratifs. Ainsi les centres d'une commune contribuent au district et à la région ; deux districts d'une même région peuvent déclencher une alerte régionale ensemble. Le même seuil administratif s'applique à ces niveaux. Les comptes de différentes maladies ne se mélangent pas.

| Ratio cas / seuil applicable | Gravité |
| --- | --- |
| De 1 à moins de 1,5 | Faible |
| De 1,5 à moins de 2 | Modéré |
| De 2 à moins de 3 | Élevé |
| Au moins 3 | Critique |

`alertes.id_centre` distingue les échelles : renseigné pour un centre, NULL pour une zone. Une alerte de centre conserve aussi sa zone de rattachement. Les alertes restent distinctes lorsque les deux seuils sont atteints. Les alertes actives et en investigation sont mises à jour sans perdre leur date de détection ni leur statut ; elles sont clôturées quand le seuil n'est plus atteint. Un nouveau dépassement crée un nouvel épisode et conserve l'historique clôturé.

Un verrou transactionnel PostgreSQL sérialise les calculs concurrents et le seed. Deux index uniques partiels empêchent plusieurs alertes ouvertes pour une même paire centre–maladie ou zone–maladie.

## Migration et transition

`20260920090000_dual_alert_thresholds/migration.sql` ajoute les colonnes puis initialise :

- zone : `GREATEST(1, seuil_alerte)` ; valeur existante conservée si elle est valide ;
- centre : `GREATEST(1, CEIL(seuil_alerte::numeric / 2))` ; par exemple 5 devient 3, 2 devient 1 ;
- ancienne colonne : conservée et documentée comme dépréciée. Le service et le seed y recopient le seuil régional. Le moteur ne la lit plus. Son retrait est réservé à une migration ultérieure après arrêt des anciens clients.

Les alertes existantes restent administratives. Les éventuels doublons ouverts sont clôturés, jamais supprimés. Le type de leur emprise devient `MultiPolygon` pour accepter les régions et leurs îles.

`20260920080000_align_existing_analyses/migration.sql` enregistre le schéma multi-laboratoire déjà présent dans Prisma mais absent de l'historique : enums, analyses, index et analyse de décision. Il est compatible avec une base déjà mise à jour via `db push` et reprend les anciens résultats sans doublon.

Déployer le backend et le frontend ensemble, après la migration : les formulaires envoient désormais les deux champs et les nouveaux DTO n'acceptent plus l'ancien champ unique en entrée.

Depuis `backend`, avec `DATABASE_URL` configuré pour la base visée :

```sh
npm exec prisma migrate deploy
npm exec prisma generate
npm run build
```

La migration et le seed ont été exécutés pour validation dans une base PostgreSQL/PostGIS locale temporaire uniquement. La base configurée dans le projet n'a pas été modifiée.

## Carte

La choroplèthe ADM1 utilise uniquement les alertes administratives portées par la région elle-même, en prenant la gravité maximale entre maladies. Une alerte centre, même critique, ne colore pas toute la région. La couche des limites de districts applique le même principe à son niveau.

Les alertes centre conservent en base leur tampon géographique de 500 mètres et leurs métadonnées. Depuis l'unification des couches, leur couche distincte n'est plus proposée dans cette carte ; l'API reste disponible. Voir [Couches et filtres de la carte](map-layers-and-filters.md) pour le comportement actuel de l'interface.

Les alertes administratives utilisent exactement `zones_administratives.geometrie`. Le GeoJSON fourni ne contient que les régions ADM1 : les districts sans géométrie conservent leurs alertes dans la base et les listes, mais n'ont pas d'emprise inventée. Le cache de la carte reste de 30 secondes ; recharger après un calcul pour actualiser les données chargées par le navigateur.

## Seed et scénarios attendus

Configurer `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` et `DEMO_PASSWORD`, puis lancer `npm run prisma:seed` sur une base de démonstration. `BCRYPT_ROUNDS` est facultatif. Aucun mot de passe de démo n'est codé en dur. Les seuils du seed sont **des paramètres de simulation**, pas des recommandations sanitaires.

Le seed crée/met à jour 14 centres, un médecin par centre et 3 agents laboratoire. Leurs emails sont `medecin.<nom-du-centre-normalisé>@demo.surveillance.test` et `labo1@demo.surveillance.test` à `labo3@demo.surveillance.test`. Le compte Admin provient des variables d'environnement.

Les 75 cas de cette démonstration ont des patients identifiés par `DEMO-DUAL-*` et 225 analyses. Les résultats réalisés portent de vrais utilisateurs de rôle Laboratoire ; deux agents distincts interviennent sur chaque cas ayant des résultats réalisés, avec une troisième analyse demandée. L'analyse de décision pointe vers l'analyse de confirmation. Les médecins déclarants appartiennent au centre du cas. Les dates sont rafraîchies à chaque seed pour garder la démonstration dans la fenêtre glissante.

| Région / maladie | Cas récents confirmés | Seuil centre / zone | Résultat attendu |
| --- | --- | --- | --- |
| Vakinankaratra / Rougeole, CHRR Antsirabe | 4 dans un centre | 3 / 8 | Centre Faible, aucune coloration régionale |
| Atsinanana / Choléra | 6 + 6 dans deux centres de Toamasina | 1 / 4 | Centres Critiques + district et région Critiques |
| Boeny / Dengue | 15 | 4 / 10 | Centre Critique, région Modérée |
| Haute Matsiatra / Tuberculose | 24 | 4 / 12 | Centre Critique, région Élevée |
| Diana / Mpox | 3 | 1 / 3 | Centre Critique, région Faible |
| Analamanga / Autres | 4 + 4 dans deux districts | 5 / 8 | Région Faible, aucun centre ni district en alerte |

Sur une base vierge et une fenêtre de 7 jours : **15 alertes actives**, dont 6 centres, 4 districts et 5 régions. Les cas anciens, suspects, probables et invalidés servent de témoins négatifs. Les alertes sont calculées pendant le seed par le même moteur que le job, donc elles sont immédiatement disponibles sans attendre sa prochaine exécution.

Les 22 régions du fichier `prisma/data/geoBoundaries-MDG-ADM1.geojson` sont associées ; l'alias Matsiatra Ambony ↔ Haute Matsiatra est géré. Les centres sont contrôlés avec `ST_Covers` contre la géométrie de leur région. Les coordonnées de démonstration sont approximatives, mais se trouvent dans la bonne région ; elles ne constituent pas un relevé topographique des établissements.

Le seed est transactionnel et réexécutable : clés de patients et emails stables, recherche des cas par patient et maladie, analyses par cas et libellé, alertes par échelle et maladie. Il complète une base partiellement initialisée sans utiliser l'ancien raccourci « table non vide = ne rien faire ». Les autres cas existants ne sont pas supprimés ; ils peuvent naturellement modifier les résultats du moteur. Les anciennes alertes fictives sont clôturées si les cas réels ne justifient plus leur seuil.

## Fichiers modifiés ou ajoutés

Chemins backend relatifs à ce dossier projet :

| Fichier | Changement |
| --- | --- |
| `prisma/migrations/20260920080000_align_existing_analyses/migration.sql` | Prérequis multi-laboratoire pour les installations neuves. |
| `prisma/migrations/20260920090000_dual_alert_thresholds/migration.sql` | Migration des seuils, échelle centre, géométries et unicité. |
| `prisma/models/maladie.prisma` | Deux nouveaux seuils et ancienne valeur dépréciée. |
| `prisma/models/alerte.prisma` | Centre facultatif et emprise MultiPolygon. |
| `prisma/models/centre-sante.prisma` | Relation inverse des alertes. |
| `src/modules/maladies/dto/create-maladie.dto.ts` | Validation des deux seuils obligatoires. |
| `src/modules/maladies/dto/update-maladie.dto.ts` | Modification indépendante ; rejette NULL, fractions et valeurs hors limites. |
| `src/modules/maladies/maladies.service.ts` | Persistance des deux seuils, miroir régional déprécié et typage du cache. |
| `src/modules/alertes/alert-detection.ts` | Comptages, gravité, synchronisation transactionnelle et emprises. |
| `src/modules/alertes/alertes.service.ts` | Job utilisant le moteur commun ; centre inclus dans la liste d'alertes. |
| `src/modules/carte/carte.service.ts` | Séparation des couleurs administratives et des alertes centre ; métadonnées d'échelle. |
| `prisma/seed.ts` | Orchestration transactionnelle, verrou et délai adapté au seed complet. |
| `prisma/seeders/maladie.seeder.ts` | Seuils de simulation différenciés. |
| `prisma/seeders/zone-administrative.seeder.ts` | District d'Ambohidratrimo correctement rattaché. |
| `prisma/seeders/region-name.util.ts` | Alias Haute Matsiatra. |
| `prisma/seeders/zone-geometrie.seeder.ts` | Import ADM1 et échec explicite si une géométrie n'est pas associée. |
| `prisma/seeders/centre-sante.seeder.ts` | Deuxième centre à Toamasina, coordonnées et contrôle spatial. |
| `prisma/seeders/utilisateur.seeder.ts` | Médecins par centre et trois laboratoires. |
| `prisma/seeders/cas-epidemiologique.seeder.ts` | Scénarios stables, analyses multi-agents et cas témoins. |
| `prisma/seeders/alerte.seeder.ts` | Alertes calculées depuis les cas. |
| `prisma/seeders/alerte-carte-regions.seeder.ts` | Ancien point d'entrée redirigé vers le calcul cohérent. |
| `src/modules/alertes/alert-detection.spec.ts` | Tests des échelles, agrégations et gravités. |
| `src/modules/maladies/dto/maladie.dto.spec.ts` | Tests de validation des seuils. |
| `test/dual-alerts.integration.ts` | Tests PostGIS, concurrence, cycle de vie, couleurs et traçabilité. |
| `docs/dual-alert-thresholds.md` | Documentation et résultats attendus. |

Chemins frontend :

| Fichier | Changement |
| --- | --- |
| `src/features/settings/types.ts` | Types API et formulaire à deux seuils. |
| `src/features/settings/components/maladie-form-modal.tsx` | Deux champs numériques, aides et disposition responsive. |
| `src/features/settings/components/maladies-tab.tsx` | Deux colonnes distinctes. |
| `src/features/zones/components/epidemic-map-inner.tsx` | Bordure centre distincte et échelle dans le popup. |

Les modifications préexistantes de la carte et de l'import GeoJSON ont été conservées. Le client Prisma généré n'est pas versionné : le régénérer lors du déploiement.

## Validation reproductible

```sh
# Depuis backend
npm test -- --runInBand
# Après migrations et seed sur une base locale dédiée, définir TEST_DATABASE_URL
node -r ts-node/register test/dual-alerts.integration.ts
```

Le test d'intégration exige une URL localhost/127.0.0.1. Ses mutations métier sont annulées par rollback. Le jeu de référence suppose une fenêtre de 7 jours et aucun autre cas métier ajouté. Les tests vérifient les seuils exacts, les cumuls entre districts, l'exclusion des cas hors fenêtre, les analyses multi-agents, l'absence de doublons lors de calculs concurrents, la persistance des dates de détection, la clôture/réouverture et les géométries effectivement retournées par la carte.
# Référentiel national ajouté

Le seed charge désormais 2 677 établissements publics historiques en plus des 14 centres de démonstration décrits ci-dessous. Voir [la provenance et les limites du référentiel](national-health-facilities.md).
