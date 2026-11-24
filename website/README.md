# Site web SEN GP

Site vitrine statique (HTML/CSS/JS, aucune dépendance) généré par `build.mjs` à partir de `src/` et de `site.config.json`. Voir `PLAN.md` pour le plan complet.

## Commandes
```
npm run build        # build « brouillon » : non indexable, champs manquants surlignés en jaune
npm run report       # liste les champs encore à compléter
node scripts/check.mjs   # contrôle des liens, images, ancres, titres, métadonnées
npm run preview      # sert dist/ sur http://localhost:8200
npm run build:live   # build de production — REFUSÉ tant qu'il reste un champ « À COMPLÉTER »
```

## Recette (accueil)
```
node scripts/serve.mjs 8200                      # serveur de dist/
msedge --headless=new --remote-debugging-port=9333   # ou Chrome
node scripts/recette.mjs                         # 31 vérifications + captures dans recette/ (non versionné)
```
`node scripts/recette-how.mjs` : 23 vérifications de la page « Comment ça marche » (captures dans `recette/how/`). `node scripts/recette-about.mjs` : 24 vérifications de la page « À propos ». `scripts/shoot-flow.mjs` régénère les captures de l'application utilisées par cette page.
La carte des destinations est générée par `scripts/make-map.py` (Natural Earth, domaine public).

## Langues
Le site est généré en 14 langues : français (`/`), puis `/en/`, `/ar/` (de droite à gauche), `/es/`, `/pt/`, `/it/`, `/de/`, `/nl/`, `/ru/`, `/zh/`, `/hi/`, `/ja/`, `/ko/`, `/tr/`, à partir des mêmes pages françaises : traductions dans `src/locales/<langue>.json`. Procédure et limites : `docs/i18n.md` (« Phase D »).
```
npm run extract      # liste les textes français à traduire (src/locales/_segments.json)
npm run i18n:check   # contrôle des dictionnaires (complétude, balises)
npm test             # tests : localisation, build, hreflang, choix de la langue
```
Les pages juridiques restent en français uniquement.

## Structure
- `site.config.json` — **toutes** les informations de l'entreprise (raison sociale, RCCM, NINEA, adresse, téléphone, email, réseaux) + navigation + `live` / `legalReviewed`.
- `src/pages/**/index.html` — une page par dossier ; première ligne `<!--meta {…} -->` (titre, description, clé de navigation).
- `src/partials/` — gabarit (`layout`), en-tête, pied de page. Jetons : `{{company.legalName}}`, `{{{email_link}}}`, `{{{legalNotice}}}`…
- `src/css/site.css` (+ `home.css` accueil), `src/js/site.js` (+ `home.js` accueil), `src/assets/` (images WebP/JPG optimisées, captures de l'application dans `assets/app/`).
- `scripts/shoot-app.mjs` régénère les captures de l'application (données de démonstration).
- `vercel.json` — en-têtes de sécurité (CSP, HSTS…), cache des ressources.

## Passer en production (phase 8)
1. Remplir `site.config.json` (company.*) avec les documents officiels (extrait RCCM, NINEA, statuts).
2. Remplacer les textes provisoires (confidentialité, conditions) par les versions validées par un juriste, en supprimant tous les `[À COMPLÉTER …]` des pages.
3. Mettre `legalReviewed: true` et `live: true`.
4. `npm run build:live` doit réussir : le site devient indexable, `robots.txt` autorise l'exploration et `sitemap.xml` est généré.

## Déploiement Vercel (projet séparé de l'application)
Projet Vercel distinct, « Root Directory » = `website`, `vercel.json` déjà prêt. Tant que `live` vaut `false`, le site reste en `noindex` (relecture).
