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

## Structure
- `site.config.json` — **toutes** les informations de l'entreprise (raison sociale, RCCM, NINEA, adresse, téléphone, email, réseaux) + navigation + `live` / `legalReviewed`.
- `src/pages/**/index.html` — une page par dossier ; première ligne `<!--meta {…} -->` (titre, description, clé de navigation).
- `src/partials/` — gabarit (`layout`), en-tête, pied de page. Jetons : `{{company.legalName}}`, `{{{email_link}}}`, `{{{legalNotice}}}`…
- `src/css/site.css`, `src/js/site.js`, `src/assets/` (images WebP/JPG optimisées, captures de l'application dans `assets/app/`).
- `scripts/shoot-app.mjs` régénère les captures de l'application (données de démonstration).
- `vercel.json` — en-têtes de sécurité (CSP, HSTS…), cache des ressources.

## Passer en production (phase 8)
1. Remplir `site.config.json` (company.*) avec les documents officiels (extrait RCCM, NINEA, statuts).
2. Remplacer les textes provisoires (confidentialité, conditions) par les versions validées par un juriste, en supprimant tous les `[À COMPLÉTER …]` des pages.
3. Mettre `legalReviewed: true` et `live: true`.
4. `npm run build:live` doit réussir : le site devient indexable, `robots.txt` autorise l'exploration et `sitemap.xml` est généré.

## Déploiement Vercel (projet séparé de l'application)
Projet Vercel distinct, « Root Directory » = `website`, `vercel.json` déjà prêt. Tant que `live` vaut `false`, le site reste en `noindex` (relecture).
