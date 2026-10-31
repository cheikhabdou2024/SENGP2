# Tests

Le backend a deux niveaux de tests et le frontend un troisième, tous lancés par la CI (`.github/workflows/ci.yml`).

| Niveau | Commande (dans `backend/`) | Cible | Base de données |
|---|---|---|---|
| Unitaire | `npm test` | fonctions pures, contrôleurs avec services simulés | aucune |
| Intégration | `npm run test:integration` | application Express réelle (supertest) | PostgreSQL réel |
| Frontend | `npm test` (dans `frontend/`) | `api.js` (401, `esc`) et contrôles statiques des pages | aucune |

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
- `payment-integrity.test.ts` : prix fixé par le serveur, un seul paiement terminé par mission, montant du
  webhook vérifié, remboursement refusé une fois le GP crédité.
- `session-security.test.ts` : sessions révoquées (suppression, suspension, changement de rôle ou de mot de passe).
- `operations.test.ts` : `/health/ready`, lanceur de migrations, verrou consultatif, rejeu sans effet.
- `dispatch.test.ts` : affectation, acceptation (y compris deux acceptations simultanées), refus pour un autre GP,
  409 « déjà payé », `withTransaction` (validation et annulation).

Limite connue : les tests de concurrence n'ont pas été vérifiés en retirant volontairement les verrous.

## Tests unitaires du backend

`tests/*.test.ts` : liste blanche CORS, détection du type de fichier par signature binaire, contrôleurs avec
services simulés (`missionController` simule `mission.service` et `mission-delivery.service`).

## Tests du frontend

```bash
cd frontend
npm test        # node --test tests/
```

- `tests/api.test.js` : échappement HTML, et gestion du 401 par `api.js` (session effacée et redirection,
  exceptions pour `/auth/*`, appels sans jeton, autre origine, jeton plus récent, pages publiques, `admin.html`).
- `tests/pages.test.js` : scripts locaux existants, ordre de chargement de `api.js`, aucune copie locale de `esc()`,
  SRI sur les scripts de CDN, en-têtes de sécurité de `vercel.json` (CSP en rapport seulement), cache du service worker versionné.

Aucun navigateur n'est lancé : l'affichage des pages se vérifie à la main (connexion, envoi, tableau de bord GP, admin, scan).

### Ajouter un test d'intégration

Utiliser les aides de `tests/integration/helpers.ts` (`registerUser`, `createAdmin`, `createMission`,
`postWaveWebhook`, `insertPendingPayment`). Le fournisseur de paiement n'est jamais appelé : le paiement
en attente est inséré directement, puis réglé par un webhook signé.
