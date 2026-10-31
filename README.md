# SEN GP

Plateforme de mise en relation entre expéditeurs de colis et voyageurs (GP) entre le Sénégal et le reste du monde. Le paiement est conservé jusqu'à la remise du colis, vérifiée par un double contrôle de QR code.

| Dossier | Contenu | Hébergement |
|---|---|---|
| [`backend/`](backend) | API REST Node.js / TypeScript / PostgreSQL | AWS App Runner (image ECR), RDS, S3 |
| [`frontend/`](frontend) | Application web progressive (HTML/JS) empaquetée avec Capacitor (Android, iOS) | Vercel |
| [`website/`](website) | Site vitrine statique, généré par `build.mjs` | Vercel |
| [`docs/`](docs) | Architecture, guides de mise en production | |

L'architecture est décrite dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Démarrage en local

Prérequis : Node.js 18 ou plus, PostgreSQL 14 ou plus.

```bash
cd backend
cp .env.example .env        # renseigner la base de données et les secrets JWT
npm ci
npm run dev                 # API sur http://localhost:5000, schéma créé au démarrage

cd ../frontend
npm run ionic:serve         # application sur http://localhost:8100 (après `npm run build`)
```

## Qualité

```bash
cd backend
npm run lint                # ESLint
npm run typecheck           # tsc --noEmit
npm test                    # tests unitaires (Jest)
npm run test:integration    # PostgreSQL requis, voir docs/testing.md

cd ../frontend
npm test                    # api.js et contrôles des pages
```

Ces trois commandes sont exécutées à chaque push par GitHub Actions (`.github/workflows/ci.yml`).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API](docs/api.md)
- [Base de données](docs/database.md)
- [Variables d'environnement](docs/environment.md)
- [Tests](docs/testing.md)
- [Exploitation (déploiement, retour arrière, incidents)](docs/runbook.md)
- [Dette technique](docs/tech-debt.md)
- [Mise en production des paiements](docs/go-live-payments.md)
- [Build iOS](docs/ios-build.md)
