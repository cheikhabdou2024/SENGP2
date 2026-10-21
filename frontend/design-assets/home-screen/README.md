# Accueil Expéditeur (dashexpediteur.html)

- Sources : `reference-mockup-home.png`, `sengp-home-background.source.png`.
- Assets servis : `../../im/sengp-home-background.{webp,jpg}`, `../../im/sengp-package-thumb.{webp,png}` (vignette recadrée dans la maquette), logo réutilisé `../../im/sengp-logo.{webp,png}`.
- Logique conservée : profil/initiales/photo, nom, notifications non lues, missions + statistiques (désormais une seule requête `/missions/my-missions`), sélecteur de pays, navigation à 5 onglets, pull-to-refresh (`.content`).
- Changements assumés : cartes Dépenses/Économies retirées (absentes de la maquette), seul le dernier envoi est affiché, bouton ⇄ pour inverser départ/arrivée, l'avatar ouvre `profile.html` (c'était une alerte), plus d'alerte après le choix d'un pays, textes API échappés, logs du jeton retirés.
