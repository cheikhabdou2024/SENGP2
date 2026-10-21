# Écran de connexion (connexion.html)

- Sources originales : `sengp-logo-square.source.png`, `sengp-auth-background.source.png`, `reference-mockup-login.png`.
- Assets servis : `../../im/sengp-auth-background.{webp,jpg}` (fond, réutilisable pour l'inscription) et `../../im/sengp-logo-square.{webp,png}` (logo carré recadré, coins arrondis transparents).
- Logique conservée : `#loginForm`, `#identifier`, `#password`, `expected_type` (`?type=sender|carrier`), Google (plugin natif + `gauth.js` qui remplace `.social-btn-google` sur le web), routes `oublie.html` / `inscrire.html` / dashboards.
- Corrections : le bouton « œil » affichait du code SVG en texte (corrigé, `aria-pressed`); le bouton de connexion garde sa flèche pendant le chargement; « Se souvenir de moi » est une vraie case à cocher (elle n'a aucun effet métier, comme avant).
