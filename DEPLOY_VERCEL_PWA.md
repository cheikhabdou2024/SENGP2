# Déploiement Vercel + PWA (iOS)

## Ce qui a été mis en place

- **`frontend/manifest.json`** — manifeste PWA (nom, couleurs, icônes, mode `standalone`)
- **`frontend/icons/`** — icônes générées (192, 512, maskable, + `icon-180.png` pour iOS)
- **`frontend/sw.js`** — service worker : réseau d'abord, cache en secours (offline minimal), API jamais mise en cache
- **`frontend/config.js`** — source unique de l'URL de l'API :
  - PWA sur Vercel → `/api/v1` (proxifié vers AWS, voir ci-dessous)
  - dev local → `http://localhost:5000/api/v1`
  - app native Capacitor → URL complète du backend (`BACKEND_URL` dans ce fichier)
- **Toutes les pages HTML** — balises PWA + meta iOS injectées, URLs `localhost:5000` remplacées par `window.API_BASE_URL`
- **`frontend/vercel.json`** — build + **proxy `/api/* → backend AWS`**
- **`frontend/.vercelignore`** — exclut `node_modules`, les fichiers « - Copie », etc.

## Backend

Backend actif : **`https://2txjgdd3cj.us-east-1.awsapprunner.com`** (AWS App Runner, HTTPS ✅).
Vérifié le 11/07/2026 — l'API répond (`/`, `/api/v1/auth/login`).

> L'ancienne URL Elastic Beanstalk (`sengp-backend-prod.eba-tby9x9hd...`) présente
> dans les docs du repo ne résout plus — environnement supprimé.

## Pourquoi un proxy ?

Le rewrite `/api/* → App Runner` dans `vercel.json` fait transiter les appels API
par Vercel côté serveur : la PWA appelle `/api/v1/...` en même origine, donc
**aucune configuration CORS n'est nécessaire** sur le backend.

Si l'URL du backend change un jour, la mettre à jour dans :
1. `frontend/vercel.json` → `rewrites[0].destination`
2. `frontend/config.js` → `BACKEND_URL` (utilisé par l'app native Capacitor uniquement)

## Déployer

```bash
cd frontend
npx vercel          # premier déploiement (preview)
npx vercel --prod   # production
```

Ou via GitHub : importer le repo sur vercel.com et définir **Root Directory = `frontend`**.

## Installation sur iOS

Une fois déployé (ex. `https://sengp.vercel.app`) :
1. Ouvrir l'URL dans **Safari** (obligatoire — pas Chrome iOS)
2. Bouton **Partager** → **« Sur l'écran d'accueil »**
3. L'app s'installe avec l'icône SEN GP et s'ouvre en plein écran (sans barre Safari)

## Limites PWA sur iOS

- Pas de notifications push sauf via l'API Web Push (iOS 16.4+, uniquement après installation sur l'écran d'accueil)
- Installation manuelle via Safari (pas de prompt automatique comme Android)
- Pour un vrai déploiement App Store, utiliser la config Capacitor déjà présente (`npm run cap:ios`)
