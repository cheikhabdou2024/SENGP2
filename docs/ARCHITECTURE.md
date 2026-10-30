# Architecture

## Vue d'ensemble

```
 Application (PWA / Capacitor)  ──HTTPS──▶  API Express  ──▶  PostgreSQL (RDS)
 Console d'administration       ──HTTPS──▶  (App Runner)  ──▶  S3 (pièces, preuves)
 Site vitrine (statique)                                  ──▶  Fournisseurs de paiement (Wave, Orange Money)
                                                          ──▶  Notifications (Web Push, e-mail, SMS)
```

Trois types d'utilisateurs : expéditeur, GP (voyageur) et administrateur. Les administrateurs ont des rôles (RBAC) définis dans `migrations/002_admin_rbac.sql`.

## Backend (`backend/src`)

Architecture en couches. Une couche ne dépend que de celles situées en dessous.

| Couche | Dossier | Responsabilité |
|---|---|---|
| Routes | `routes/` | Déclare les chemins, branche authentification, autorisation et validation. |
| Middlewares | `middlewares/` | Authentification JWT, rôles, verrou GP, limitation de débit, validation, erreurs. |
| Contrôleurs | `controllers/` | Traduit HTTP en appels de service et réponses. Aucune règle métier. |
| Services | `services/` | Règles métier et accès aux données (SQL via `pg`). |
| Fournisseurs | `services/providers/` | Adaptateurs de paiement derrière `PaymentProvider`. |
| Config | `config/` | Connexion base de données, Redis, création et correction du schéma. |
| Utilitaires | `utils/` | Logger, réponses normalisées, CSV, S3, audit, permissions. |

Les services d'administration sont découpés par domaine dans `services/admin/` ; `AdminService` les expose sous une façade unique.

### Règles métier clés

- **Paiement séquestre** : le paiement est conservé jusqu'à la livraison, puis le portefeuille du GP est crédité (commission de 15 %).
- **Arrivée validée par l'administration** : le GP ne peut scanner les colis qu'après `confirm-arrival`.
- **Double contrôle QR** : le QR du destinataire et celui du colis sont le même lien `/d/<jeton>`. `POST /missions/verify-pair` confirme la livraison seulement si les deux désignent la même mission.
- **Fin de voyage** : « Scan terminé » verrouille le GP (`gp_profiles.scan_review_pending`, réponse HTTP 423). L'administrateur valide « voyage terminé » : les trajets concernés passent à `completed` et l'accès est rendu.
- **GPS obligatoire** : de la récupération à l'arrivée, l'application GP est bloquée tant que la localisation est coupée (`frontend/gpguard.js`).

## Frontend (`frontend/`)

Application multipage sans framework, volontairement légère pour les réseaux mobiles. Le dossier reste plat car `npm run build` copie `*.html`, `*.js`, `*.css` dans `www/`.

Modules partagés (chargés par les pages) :

| Fichier | Rôle |
|---|---|
| `config.js` | URL de l'API selon l'environnement. |
| `ui.js` | Toasts, boîtes de dialogue, helpers d'interface. |
| `icons.js` | Jeu d'icônes SVG (`SengpIcons.svg('package')` ou `<span data-icon="package">`). Pas d'emojis dans l'interface. |
| `geo-data.js`, `geo.js` | Continents, pays, régions, tarifs par continent ; sélecteur de destination. |
| `gpguard.js` | Garde GP : GPS obligatoire et verrou de validation. |
| `pwa.js`, `sw.js`, `ptr.js` | Installation, cache hors ligne, tirer pour rafraîchir. |
| `theme.css`, `responsive.css` | Styles communs. |

## Site vitrine (`website/`)

Pages sources dans `src/`, assemblées par `build.mjs` avec `site.config.json`. Le site reste en mode relecture (`live: false`, `legalReviewed: false`) tant que les mentions légales ne sont pas validées.

## Données

Le schéma est créé et corrigé de façon idempotente au démarrage (`config/initDatabase.ts`). Les migrations SQL de `migrations/` décrivent l'état initial et le RBAC.

## Déploiement

| Composant | Procédure |
|---|---|
| Frontend | Déploiement Vercel du projet `sengp`, puis promotion en production. |
| Site vitrine | `vercel deploy --prod` depuis `website/`. |
| Backend | Archive des sources dans S3, build CodeBuild `sengp-build` (image ECR), puis `aws apprunner start-deployment`. |

Les secrets (JWT, paiements, base de données) sont des variables d'environnement du service App Runner. Aucun secret n'est versionné.
