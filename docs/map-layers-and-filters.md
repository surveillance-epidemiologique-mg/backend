# Carte épidémique : couches unifiées et filtre maladie

## Comportement livré

| Couche | Toutes maladies | Maladie sélectionnée |
| --- | --- | --- |
| Alertes par région | Maximum de gravité des alertes régionales actives, toutes maladies confondues | Maximum restreint à cette maladie |
| Limites administratives | Même agrégation à l'échelle de chaque zone | Même filtre maladie |
| Cas | Couche désactivée, message invitant à sélectionner une maladie | Marqueurs de cette maladie, puis filtre de statut éventuel |
| Clusters de cas | Couche désactivée, aucun calcul DBSCAN demandé | DBSCAN calculé uniquement sur les cas confirmés de cette maladie |
| Centres de santé | Inchangé | Inchangé |

Le filtre Maladie reste accessible en haut du panneau même si la couche Cas est inactive. Sa valeur est l'identifiant de la maladie ; son libellé affiche le nom. Le retour à « Toutes les maladies » désactive les interrupteurs Cas et Clusters. La légende et le nom de la couche régionale indiquent « Toutes maladies » ou « Filtré : nom de la maladie ».

La couche technique distincte a été retirée du type des couches, des interrupteurs, de la légende, du chargement réseau et du rendu Leaflet. Le backend `/carte/alertes` et les alertes centre restent disponibles pour les autres usages métier ; leurs géométries ne sont plus superposées en tant que couche séparée dans cette carte.

## Couleurs : source unique

La propriété API `gravite` et les constantes `GRAVITE_FILL`, `GRAVITE_STROKE`, `GRAVITE_LABEL`, `GRAVITES_LEGEND` pilotent les cartes et leurs légendes. La fonction partagée `alertStyle()` reprend le style de l'ancienne couche détaillée : opacité 0,75 et bordure de 1,5 px.

| Niveau | Remplissage |
| --- | --- |
| Aucune alerte | `#8BC34A` |
| Faible | `#FDD835` |
| Modéré | `#FB8C00` |
| Élevé | `#E53935` |
| Critique | `#B71C1C` |

L'ancienne palette anglaise de risque a été supprimée du frontend, y compris de la carte régionale secondaire. Le champ backend `risk_level` reste renvoyé pour compatibilité, mais n'est plus utilisé pour choisir une couleur ou un libellé dans l'interface.

Les alertes centre ne colorent toujours pas toute la région : seuls les dépassements administratifs alimentent la choroplèthe, conformément à la séparation des seuils centre/région.

## API

| Route GET | `id_maladie` absent | `id_maladie=12` |
| --- | --- | --- |
| `/carte/regions` | Gravité régionale maximale toutes maladies | Gravité régionale de la maladie 12 |
| `/carte/alertes-regions` | Agrégat de compatibilité toutes maladies | Agrégat de compatibilité filtré |
| `/carte/zones` | Zones administratives toutes maladies | Zones filtrées |
| `/carte/cas` | FeatureCollection vide | Cas de la maladie 12, selon le rôle et le statut éventuel |
| `/carte/clusters` | FeatureCollection vide | Clusters des cas confirmés de la maladie 12, selon le rôle |
| `/carte/zone/:id` | Résumé de la zone toutes maladies | Résumé restreint à la maladie 12 |

Le DTO valide un entier compris entre 1 et 2 147 483 647. Valeur vide, fraction, zéro, valeur négative, texte et paramètres multiples invalides produisent une erreur 400. Un identifiant valide mais inexistant donne une carte sans alerte pour cette maladie et aucun cas/cluster. L'ancien alias `maladieId` est conservé ; `id_maladie` prévaut si les deux sont présents. `statut` reste facultatif et concerne uniquement les marqueurs Cas ; les clusters comptent toujours les cas confirmés.

Admin et Laboratoire ont accès à tous les centres pour la maladie choisie. Médecin est limité à son centre pour les cas, les clusters et les comptages du résumé ; un médecin sans centre reçoit des résultats vides. Les alertes administratives et les limites restent globales comme auparavant.

Le cache des régions et des zones est séparé par maladie ou par mode agrégé. Le cache DBSCAN est séparé par maladie **et centre autorisé**. Les réponses Cas, Clusters et résumé de zone utilisent `Cache-Control: private, no-store` pour éviter un partage HTTP entre utilisateurs.

## Navigation et chargement

Les changements de maladie rechargent les couches avec le nouveau paramètre. Les réponses de requêtes devenues obsolètes sont ignorées. Les données d'une ancienne maladie sont masquées pendant le chargement de la suivante ; les couches GeoJSON sont remontées avec une clé liée au filtre, car Leaflet ne remplace pas ses données automatiquement.

Les bornes de Madagascar, les popups et le panneau restent en place. Un clic sur une région ouvre son résumé et zoome sur ses limites. Le résumé inclut les centres de ses districts descendants. Les marqueurs Cas et Centres respectent cette sélection ; les clusters restent masqués pendant le focus sur une zone, comme dans le comportement précédent. Le filtre maladie actualise aussi le résumé ouvert.

## Fichiers modifiés et ajoutés

Chemins relatifs à `backend` :

| Fichier | Modification |
| --- | --- |
| `src/modules/carte/dto/carte-query.dto.ts` | Nouveau DTO pour `id_maladie`, alias et statut. |
| `src/modules/carte/carte.controller.ts` | Paramètres des routes et contexte utilisateur des clusters/résumés ; cache HTTP privé. |
| `src/modules/carte/carte.service.ts` | Agrégations filtrables, maladie obligatoire pour cas/clusters, RBAC avant DBSCAN, caches séparés et résumé des zones descendantes. |
| `src/modules/carte/dto/carte-query.dto.spec.ts` | Validation des paramètres API. |
| `test/map-filters.integration.ts` | Tests PostgreSQL/PostGIS des maladies, rôles, caches, gravités et résumés. |
| `docs/map-layers-and-filters.md` | Cette documentation. |
| `docs/dual-alert-thresholds.md` | Mise à jour de la description des couches visibles. |

Chemins relatifs à `frontend` :

| Fichier | Modification |
| --- | --- |
| `src/features/zones/types/map.types.ts` | Palette/style partagés ; suppression de la couche distincte et de l'ancienne palette de risque. |
| `src/features/zones/services/map.service.ts` | Paramètres API ; aucun chargement Cas/Clusters sans maladie ; retrait du chargement de la couche distincte. |
| `src/features/zones/components/epidemic-map-inner.tsx` | Rechargement et protection contre les réponses obsolètes, filtres par ID, styles communs, clic région et résumé synchronisé. |
| `src/features/zones/components/map-controls-panel.tsx` | Filtre toujours accessible, interrupteurs conditionnels, messages et légende dynamique unique. |
| `src/features/zones/components/risk-region-map-inner.tsx` | Carte secondaire alignée sur la palette et les libellés communs ; appel API authentifié. |

## Vérification

Sur une base locale dédiée, après les migrations et le seed de démonstration :

```sh
# Depuis backend, avec TEST_DATABASE_URL configuré vers cette base locale
npm test -- --runInBand
node -r ts-node/register test/map-filters.integration.ts
```

Le test d'intégration refuse les bases distantes. Il vérifie l'absence de points sans maladie, la séparation entre maladies avant DBSCAN, la visibilité Admin/Laboratoire/Médecin, le cache global suivi d'une requête médecin, un médecin sans centre, les filtres inexistants, le maximum entre plusieurs maladies sur une même région et les résumés régionaux. Les données de test additionnelles sont annulées par rollback.

Aucune migration de données supplémentaire n'est nécessaire pour cette évolution. Les tests utilisent uniquement une base temporaire : la base configurée dans le projet n'a pas été modifiée.
