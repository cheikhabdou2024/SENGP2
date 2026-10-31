# Variables d'environnement

Backend uniquement (le frontend n'a pas de secret : l'URL de l'API est dans `frontend/config.js`). Modèle : `backend/.env.example`. En production, ces valeurs sont des variables du service App Runner `sengp-backend`. **Aucun secret ne doit être versionné ni recopié dans une documentation.**

Les valeurs lues par le code sont listées ci-dessous. `.env.example` contient en plus des entrées que le code n'utilise pas encore (voir la dernière section).

## Serveur

| Variable | Défaut | Rôle |
|---|---|---|
| `NODE_ENV` | `development` | `production` active le SSL base de données et le mode strict. `test` pour les tests. |
| `PORT` | `5000` | Port d'écoute. |
| `API_VERSION` | `v1` | Préfixe `/api/<version>`. |
| `LOG_LEVEL` | `info` | Niveau du logger. |
| `FRONTEND_URL` | — | Origine autorisée en plus de la liste blanche CORS (`config/cors.ts`). |

## Base de données (priorité décroissante)

| Variable | Rôle |
|---|---|
| `RDS_HOSTNAME`, `RDS_PORT`, `RDS_DB_NAME`, `RDS_USERNAME`, `RDS_PASSWORD` | Utilisées en production sur AWS. Si `RDS_HOSTNAME` est défini, elles l'emportent. |
| `DATABASE_URL` | URL de connexion complète. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Développement local. |

Tests d'intégration : `TEST_DATABASE_URL` (le nom de base doit se terminer par `_test`, sinon les tests refusent de démarrer).

## Sécurité

| Variable | Défaut | Rôle |
|---|---|---|
| `JWT_SECRET` | — (obligatoire) | Signature des jetons. Le changer déconnecte tout le monde. |
| `JWT_EXPIRES_IN` | `24h` | Durée de vie des jetons. |
| `BCRYPT_ROUNDS` | `12` | Coût du hachage des mots de passe. |
| `ADMIN_BOOTSTRAP_SECRET` | — | Protège `POST /admin/bootstrap` et `/admin/reset-password`. Sans lui, ces routes sont fermées. |
| `GOOGLE_CLIENT_ID` | — | Client OAuth Web pour vérifier les jetons Google. |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` | 900000, 100 | Limiteur général. |
| `RATE_LIMIT_AUTH_WINDOW_MS`, `RATE_LIMIT_AUTH_MAX` | 900000, 20 | Authentification. |
| `RATE_LIMIT_PUBLIC_WINDOW_MS`, `RATE_LIMIT_PUBLIC_MAX` | 300000, 300 | Suivi public. |

## Paiement et règles métier

| Variable | Défaut | Rôle |
|---|---|---|
| `PLATFORM_COMMISSION_PERCENTAGE` | `15` | Commission prélevée sur chaque paiement (lue via `config/env.ts`). |
| `PAYMENT_CURRENCY` | `XOF` | Devise enregistrée. |
| `INSURANCE_FEE_PERCENTAGE` | — | Frais d'assurance. |
| `MIN_WITHDRAWAL_AMOUNT` | — | Montant minimal de retrait. |
| `DELIVERY_GEOFENCE_KM` | — | Rayon de validation GPS à la livraison. |
| `PAYMENT_SUCCESS_URL`, `PAYMENT_ERROR_URL` | — | Pages de retour après paiement. |
| `WAVE_API_KEY`, `WAVE_API_SECRET`, `WAVE_API_BASE` | — | Wave : clé d'API, secret de signature des webhooks (HMAC-SHA256), URL de base. |
| `ORANGE_MONEY_CLIENT_ID`, `ORANGE_MONEY_CLIENT_SECRET`, `ORANGE_MONEY_MERCHANT_KEY`, `ORANGE_TOKEN_URL`, `ORANGE_WEBPAY_URL`, `ORANGE_MONEY_CALLBACK_URL` | — | Orange Money. |

Procédure de mise en production des paiements : `docs/go-live-payments.md`.

## Stockage et notifications

| Variable | Rôle |
|---|---|
| `AWS_REGION`, `AWS_S3_BUCKET` | Bucket S3 des pièces et preuves (`sengp-uploads`). Les droits viennent du rôle IAM du service, pas de clés dans l'environnement. |
| `VAPID_SUBJECT` | Contact des notifications Web Push (défaut `mailto:support@sengp.com`). Les clés VAPID n'ont pas de variable : elles sont générées au premier usage et stockées dans `platform_setting` (clé `vapid_keys`). |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Lues par `config/redis.ts`. Redis n'est pas indispensable au fonctionnement actuel. |

## Présentes dans `.env.example` mais non lues par le code

`JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` (pas de jeton de rafraîchissement), `DB_SSL`, `CLOUDINARY_*`, `SENDGRID_API_KEY`, `FROM_EMAIL`, `FROM_NAME`, `TWILIO_*`, `FREE_MONEY_*`, `GOOGLE_MAPS_API_KEY`, `FCM_*`, `ADMIN_URL`, `API_URL`, `MAX_FILE_SIZE`, `MAX_FILES_PER_UPLOAD`, `ALLOWED_FILE_TYPES`, `SENTRY_DSN`, `WAVE_MERCHANT_ID`, `WAVE_CALLBACK_URL`. Elles décrivent des intégrations prévues ; les renseigner n'a aujourd'hui aucun effet.

## Rotation des secrets

Ordre conseillé : `ADMIN_BOOTSTRAP_SECRET`, `JWT_SECRET` (déconnecte les utilisateurs), mot de passe RDS (à changer dans RDS **et** dans App Runner, dans la foulée), clés Wave et Orange (en coordination avec le fournisseur). Après chaque changement, redéployer et vérifier `/health/ready`.
