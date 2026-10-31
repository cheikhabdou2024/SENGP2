# API

Référence des routes de l'API REST. Source de vérité : `backend/src/routes/*.ts` (montage dans `backend/src/app.ts`).

- Base : `https://2txjgdd3cj.us-east-1.awsapprunner.com/api/v1` (production). En local : `http://localhost:5000/api/v1`.
- Format JSON. Réponse de succès : `{ "success": true, "data": …, "message": …, "meta": … }`. Erreur : `{ "success": false, "error": "…", "errors": […] }`.
- Authentification : en-tête `Authorization: Bearer <jeton JWT>` (durée 24 h, `JWT_EXPIRES_IN`).
- Sessions révocables : le jeton porte `tv` (version de session). À chaque requête, la base est consultée : compte supprimé ou suspendu, rôle modifié ou version différente (`users.token_version`, incrémentée au changement de mot de passe) donnent **401**.

## Codes d'erreur courants

| Code | Sens |
|---|---|
| 400 | Données invalides (validateurs), règle métier non respectée. |
| 401 | Jeton absent, expiré ou session révoquée. Le frontend (`api.js`) déconnecte l'utilisateur. |
| 403 | Rôle ou permission insuffisant. |
| 404 | Ressource inconnue. |
| 409 | Conflit métier, par exemple mission déjà payée. |
| 423 | GP verrouillé en attente de validation de fin de voyage (`requireGpUnlocked`). |
| 429 | Limitation de débit dépassée. |

## Limitation de débit

| Limiteur | Portée | Valeur par défaut |
|---|---|---|
| `general` | `/api/*` | 100 requêtes / 15 min (`RATE_LIMIT_*`) |
| `auth` | inscription, connexion… | 20 / 15 min (`RATE_LIMIT_AUTH_*`) |
| `secretGate` | `/admin/bootstrap`, `/admin/reset-password` | 5 / 15 min |
| `publicTracking` | `/public/*` | 300 / 5 min (`RATE_LIMIT_PUBLIC_*`) |
| `upload` | `/uploads` | 10 / heure |

## Santé (hors `/api`)

| Route | Rôle |
|---|---|
| `GET /health` | Vivacité : le processus répond. Utilisé par App Runner. |
| `GET /health/ready` | Disponibilité : 200 si la base répond (`database: up`), sinon 503. |

## Public (sans authentification) — `/public`

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/public/track/:token` | Suivi d'un colis par jeton. |
| GET | `/public/delivery/:token` | Informations de livraison pour le destinataire. |
| POST | `/public/delivery/:token/confirm` | Confirmation de livraison par le destinataire. |

## Authentification — `/auth`

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/auth/register` | Inscription (expéditeur ou GP). |
| POST | `/auth/login` | Connexion, renvoie le jeton. |
| POST | `/auth/google` | Connexion Google (jeton d'identité). |
| POST | `/auth/forgot-password` | Demande de réinitialisation. |
| POST | `/auth/verify-email`, `/auth/verify-phone` | Vérifications. |
| POST | `/auth/change-password` | Change le mot de passe et révoque les autres sessions. |

## Utilisateur — `/users` (authentifié)

`GET /users/me`, `PUT /users/me`, `GET /users/me/stats`.

## Missions — `/missions` (authentifié)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/missions` | Liste. |
| GET | `/missions/my-missions` | Missions de l'utilisateur (GP : refusé en 423 si verrouillé). |
| GET | `/missions/gp-lock` | État du verrou GP. |
| GET | `/missions/track/:trackingNumber` | Suivi par numéro. |
| GET | `/missions/:id`, `/missions/:id/tracking` | Détail, historique de position. |
| POST | `/missions` | Création (expéditeur). Le prix est calculé côté serveur. |
| PUT | `/missions/:id` | Mise à jour. |
| POST | `/missions/:id/accept` | Le GP confirme une mission que l'admin lui a affectée (GP). |
| POST | `/missions/:id/decline` | Le GP décline l'affectation (GP). |
| POST | `/missions/:id/location` | Position GPS (GP). |
| POST | `/missions/:id/status` | Changement de statut (voir ci-dessous). |
| POST | `/missions/:id/delivery-qr`, `/missions/:id/recipient`, `/missions/:id/qr-code` | QR de livraison, destinataire, QR du colis. |
| POST | `/missions/verify-pair` | Double contrôle QR destinataire + colis (GP). |
| POST | `/missions/scan-complete` | Fin de session de scan, verrouille le GP (GP). |
| POST | `/missions/verify-qr` | Vérification d'un QR (GP). |

**Machine à états** (`mission.service.updateStatus`) : le GP fait avancer `accepted → picked_up → in_transit → in_customs → out_for_delivery → delivered` (certains sauts sont permis, par exemple vers `delivered`). L'expéditeur ne peut qu'annuler (`pending` ou `matched` → `cancelled`). `delivered` et `cancelled` sont définitifs. La livraison crédite le portefeuille du GP une seule fois.

## Trajets — `/trips` (authentifié)

`GET /trips`, `GET /trips/search`, `GET /trips/my-trips`, `GET /trips/:id` ; GP uniquement : `POST /trips`, `PUT /trips/:id`, `POST /trips/:id/status`, `DELETE /trips/:id`.

## Paiements — `/payments`

| Méthode | Route | Rôle |
|---|---|---|
| POST | `/payments/webhook/wave` | Webhook Wave (signature HMAC `t=…,v1=…`). Sans authentification. Répond 500 sur erreur transitoire pour que Wave réessaie. |
| POST | `/payments/webhook/orange` | Webhook Orange Money. |
| POST | `/payments` | Crée un paiement (expéditeur). 409 si la mission est déjà payée. |
| GET | `/payments/my-payments`, `/payments/:id` | Historique et détail. |

## Portefeuille et retraits

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/wallet/me`, `/wallet/transactions` | Solde et transactions. |
| POST | `/withdrawals` | Demande de retrait (minimum `MIN_WITHDRAWAL_AMOUNT`). |
| GET | `/withdrawals/my-withdrawals` | Mes retraits. |
| GET, PUT | `/withdrawals`, `/withdrawals/:id/approve`, `/withdrawals/:id/reject` | Admin. |

## Réclamations — `/claims`

`GET /claims/my-claims`, `GET /claims/:id`, `POST /claims`, `PUT /claims/:id` ; admin : `GET /claims`, `POST /claims/:id/resolve`.

## Notifications — `/notifications`

`GET /notifications/vapid-public-key` (public) ; ensuite authentifié : `POST /subscribe`, `POST /unsubscribe`, `GET /` et `/my-notifications`, `GET /unread-count`, `PUT /mark-all-read` (ou `/read-all`), `PUT /:id/read`, `DELETE /:id` ; admin : `POST /` (envoi).

## Fichiers — `/uploads`

`POST /uploads` (authentifié, champ `file`, 8 Mo). Le type est contrôlé par la signature binaire du fichier, pas par l'extension.

## Administration — `/admin`

Hors amorçage, tout exige le rôle `admin` **et** une permission (RBAC, voir `docs/database.md`).

| Domaine | Routes (permission) |
|---|---|
| Amorçage | `POST /admin/bootstrap`, `POST /admin/reset-password` (protégés par `ADMIN_BOOTSTRAP_SECRET`) |
| Moi | `GET /admin/me/permissions` |
| Tableau de bord | `GET /admin/stats`, `/admin/activity` |
| Analytique (`analytics:read`) | `GET /admin/analytics/timeseries`, `/top-routes`, `/gp-performance`, `/payment-methods` |
| Utilisateurs | `GET/POST /admin/users`, `GET /users/export`, `/users/status-series`, `GET/PUT/DELETE /users/:id` (`users:read/write/delete`), `PUT /users/:id/role` (`roles:manage`) |
| KYC (`users:verify`) | `GET /admin/kyc/queue`, `POST /kyc/:id/approve`, `/kyc/:id/reject` |
| Missions | `GET /admin/missions`, `/export`, `/status-series`, `GET/PUT/DELETE /missions/:id`, `POST /missions/:id/assign` (corps `gp_id`, `trip_id` optionnel), `/reassign`, `/confirm-arrival` |
| Répartition (`missions:assign`) | `GET /admin/matching`, `POST /admin/assignments` (affectation groupée) |
| Fin de voyage | `GET /admin/scan-reviews`, `POST /admin/gps/:id/release` |
| Trajets | `GET /admin/trips`, `/export`, `/status-series`, `GET/PUT/DELETE /trips/:id` |
| Paiements | `GET /admin/payments`, `/export`, `POST /payments/:id/refund` (`payments:refund`, refusé une fois le GP crédité) |
| Retraits | `GET /admin/withdrawals`, `/export`, `PUT /:id/approve`, `/reject`, `/paid` |
| Réclamations | `GET /admin/claims`, `/claims/:id/thread`, `POST /reply`, `/compensate`, `PUT /claims/:id` |
| Avis | `GET /admin/reviews`, `DELETE /reviews/:id` |
| Rôles | `GET/POST /admin/roles`, `PUT/DELETE /roles/:id` |
| Audit, diffusion, réglages | `GET /admin/audit`, `POST /admin/broadcast`, `GET/PUT /admin/settings` |

> Les réglages `commission_pct` de l'administration ne sont pas encore reliés au calcul de paiement : la commission vient de `PLATFORM_COMMISSION_PERCENTAGE` (voir `docs/tech-debt.md`).
