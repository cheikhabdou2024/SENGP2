# Site web SEN GP — plan de travail

Site vitrine de l'entreprise SEN GP (exigé pour la vérification D-U-N-S et les stores). Statique, en français, version anglaise prévue plus tard. Domaine cible : `sengp.co`.

## Règles
1. Rien d'inventé : pas de faux chiffres, témoignages ou équipe. Ce qui manque est marqué `[À COMPLÉTER : …]`.
2. Rien n'est indexable ni publié « en vrai » tant que les informations légales sont vides (`site.config.json` → `live: false`). Le build de production (`npm run build:live`) échoue s'il reste un champ à compléter ou si les textes légaux ne sont pas validés.
3. Aucune action externe (projet Vercel, domaine, publication) sans accord explicite. Commit/push et redéploiement uniquement sur demande.

## Phases
- **0 Fondations** : dossier `website/`, `build.mjs` (gabarits + données), `site.config.json`, design (mêmes couleurs/logo que l'app), assets optimisés.
- **1 Contenu** : Accueil, Comment ça marche, À propos, FAQ, Contact/Support, Mentions légales, Confidentialité, Conditions, 404 — uniquement ce que l'application fait réellement.
- **2 Interface** : en-tête/pied communs, navigation responsive, composants, accessibilité.
- **3 Pages** : fabrication page par page, validée mobile/tablette/bureau.
- **4 SEO / sécurité / perf** : meta, Open Graph, sitemap, robots, JSON-LD Organization, en-têtes de sécurité, favicon, WebP, pas de traceurs.
- **5 Contrôle qualité** : captures 360/768/1280, liens, images, champs à compléter. → **Point d'arrêt 1**.
- **6 Mise en ligne sur lien Vercel standard** (accord requis) : aperçu non indexé.
- **7 Domaine `sengp.co`** (achat par le client dans Vercel) : `sengp.co` + `www`, plus `app.` et `api.` prévus ; email du domaine.
- **8 Finalisation légale** : extrait RCCM, NINEA, statuts → `site.config.json` ; textes légaux validés ; `live: true`. → **Point d'arrêt 2**.
- **9 Plus tard** : version anglaise `/en/`, application sur `app.sengp.co`.

## À fournir par les fondateurs
Raison sociale exacte + forme juridique, RCCM, NINEA, adresse du siège, téléphone et email officiels, réseaux sociaux, équipe (noms/rôles) si une section équipe est souhaitée, textes légaux validés.
