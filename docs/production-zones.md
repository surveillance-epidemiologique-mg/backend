# Initialiser les zones en production

Depuis `backend`, avec `DATABASE_URL` pointant vers la base cible :

```sh
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed:zones:prod
```

La commande charge `.env` si présent ; une variable d'environnement déjà définie prévaut. Elle nécessite les dépendances de développement (`ts-node`, TypeScript et Prisma) ainsi que les sources `prisma/` et le GeoJSON versionné. Exécuter depuis le checkout de déploiement, avant un éventuel retrait des dépendances de développement.

Elle crée ou met à jour les **22 régions historiques du GeoJSON ADM1 fourni**, identifiées par leur `code_pcode`, puis importe leurs géométries PostGIS. Ce référentiel ne constitue pas un découpage administratif actualisé ni une liste complète des districts, communes et fokontany.

L'import se fait dans une transaction : si une des 22 géométries manque, est vide ou invalide, toutes les modifications sont annulées. Un verrou sérialise les exécutions avec le seed général. Une relance conserve les identifiants des régions et leurs relations ; elle réapplique les noms, le type régional, l'absence de parent et les géométries du référentiel.

Aucun compte, centre, patient, cas, maladie ou alerte n'est créé. Les zones supplémentaires déjà présentes ne sont pas supprimées. Les régions existantes doivent utiliser les mêmes codes que `zone-administrative.seeder.ts` : les noms seuls ne sont pas utilisés pour fusionner des enregistrements.

Ne pas utiliser `prisma:seed` pour cette opération : il charge aussi les données de démonstration. L'ancienne commande `prisma:prod` n'est pas un alias de cette nouvelle commande.
