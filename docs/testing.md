# Tests

Le backend a deux niveaux de tests, tous deux lancés par la CI (`.github/workflows/ci.yml`).

| Niveau | Commande (dans `backend/`) | Cible | Base de données |
|---|---|---|---|
| Unitaire | `npm test` | fonctions pures, contrôleurs avec services simulés | aucune |
| Intégration | `npm run test:integration` | application Express réelle (supertest) | PostgreSQL réel |

## Tests d'intégration

Ils démarrent l'application complète (`src/app.ts`), créent le schéma par le même chemin
que le démarrage réel (`initDatabase`), puis vident les données avant chaque test.

```bash
# Postgres jetable, par exemple :
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sengp_test postgres:16

cd backend
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/sengp_test npm run test:integration
```

### Garde-fou

`tests/integration/env.ts` refuse de s'exécuter si `TEST_DATABASE_URL` est absent ou si le nom
de la base ne se termine pas par `_test`. Il neutralise aussi `RDS_HOSTNAME`, qui aurait priorité
sur `DATABASE_URL`. Les tests tronquent les tables : ne jamais les pointer vers une base réelle.

### Couverture actuelle

- `money-flow.test.ts` : webhook Wave (signature invalide, règlement unique, rejeu, référence inconnue,
  échec), crédit du portefeuille GP à la livraison (une seule fois, refus sans confirmation d'arrivée,
  refus pour un autre GP).
- `access-control.test.ts` : régressions du lot 0 (jeton exigé, tiers refusé en lecture/écriture/QR,
  liste blanche de champs, clé SQL forgée, périmètre des listes, vue réduite du GP, secrets admin).

### Ajouter un test

Utiliser les aides de `tests/integration/helpers.ts` (`registerUser`, `createAdmin`, `createMission`,
`postWaveWebhook`, `insertPendingPayment`). Le fournisseur de paiement n'est jamais appelé : le paiement
en attente est inséré directement, puis réglé par un webhook signé.
