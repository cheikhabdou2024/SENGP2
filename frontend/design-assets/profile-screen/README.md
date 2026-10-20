# Écran de choix du profil (index.html, écran 4)

- Sources originales : `sengp-logo.source.png`, `sengp-profile-background.source.png`, `reference-mockup.png` (non copiées dans `www/`).
- Assets optimisés servis par l'app : `../../im/sengp-logo.{webp,png}` (recadré avant le slogan, qui est dessiné en vrai texte car il était sombre sur fond transparent), `../../im/sengp-profile-background.{webp,jpg}`.
- Icône Gros Porteur : `sengp-gp-icon.source.png` (damier retiré, recadrée) → `../../im/sengp-gp-icon.{webp,png}`.
- Mise en page sans défilement (logo, 2 cartes, bouton) : tailles liées à la hauteur d'écran (`dvh`), cartes épurées (icône + titre + badge, sans descriptions ni avantages), bannière PWA compactée sur cet écran.
- Cartes = `<label>` + `<input type="radio" name="accountType">` (clavier/lecteur d'écran natifs, une seule sélection possible).
- Comportement conservé (branche `deploy/aws-android-prep`) : bouton désactivé tant qu'aucun profil, puis `connexion.html?type=sender|carrier`; deep link `index.html?choice=1` inchangé. Le bouton réserve la hauteur de la bannière d'installation PWA (`pwa.js`) via `--pf-banner-h`.
- `screenshots/` (non versionné, trop lourd) : captures de recette (320, 360, 390, 430, paysage, desktop) générées avec Edge headless + puppeteer-core.

Limites : pas de suite de tests/lint dans `frontend/`. L'erreur console `scheduleSplashAdvance is not defined` (attribut `onload` du splash avant la définition de la fonction) existait déjà.
