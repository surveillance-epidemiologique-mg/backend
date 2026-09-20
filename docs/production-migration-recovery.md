# Reprise des migrations après db push

Le déploiement Render échouait sur `20260920090000_dual_alert_thresholds` avec `current transaction is aborted`. La vérification du schéma Neon a confirmé que `seuil_alerte_centre`, `seuil_alerte_region`, `alertes.id_centre` et `centres_sante.source_id` existaient déjà, alors que les migrations correspondantes n'étaient pas enregistrées comme terminées. La première création de colonne sans garde était donc incompatible avec cet état.

Les migrations corrigées acceptent les colonnes, contraintes et index déjà présents. Les valeurs initiales des seuils ne sont calculées que pour les colonnes nouvellement créées : les seuils configurés en production restent inchangés. Les alertes ouvertes en double sont conservées dans l'historique comme clôturées, en gardant la plus récente ouverte par centre/maladie ou zone/maladie. Les géométries sont converties en MultiPolygon.

Pour une autre base présentant **ce même échec**, après vérification de son schéma et avec ces fichiers corrigés déployés :

```sh
npx prisma migrate resolve --rolled-back 20260920090000_dual_alert_thresholds
npx prisma migrate deploy
npx prisma migrate status
```

`resolve --rolled-back` modifie uniquement le journal Prisma : il ne défait pas les données ni les changements SQL. Ne pas l'ajouter systématiquement au démarrage et ne pas l'exécuter sur une migration réussie. Ne pas utiliser `migrate reset`, `db push` ou `resolve --applied` pour masquer cet échec.

Après réparation, redéployer le backend avec les migrations corrigées. Aucun seed n'est nécessaire pour cette réparation.

## Connexion Neon et verrou Prisma

La réparation a également rencontré un verrou de session Prisma abandonné sur une connexion PgBouncer inactive. `prisma.config.ts` utilise désormais `DIRECT_URL` en priorité ; à défaut, il transforme uniquement les hôtes Neon `-pooler.*.neon.tech` en leur équivalent direct. L'application continue d'utiliser `DATABASE_URL` avec le pool. Les autres fournisseurs restent inchangés.

Un délai d'attente sur `pg_advisory_lock(72707369)` ne doit pas conduire à désactiver les verrous. Vérifier d'abord `pg_locks` et `pg_stat_activity`. Lors de cette intervention, seule la connexion PgBouncer détentrice du verrou, inactive et sans transaction ouverte, a été fermée. Ne pas automatiser cette fermeture au démarrage ni interrompre une migration active.

Recommandation Neon : https://neon.com/docs/connect/connection-pooling

Validation locale : migration complète sur une base vide ; test `test/migration-recovery.integration.js` sur une base locale vide pour simuler les colonnes préexistantes, vérifier la conservation des seuils personnalisés et appliquer les migrations deux fois. Le test exige `TEST_DATABASE_URL` vers une base jetable locale.

Procédure Prisma : https://docs.prisma.io/docs/cli/migrate/resolve
