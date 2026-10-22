# Écran « Mon Profil » (profile.html)

Refonte de `profile.html` (expéditeur) d'après la maquette : hero aéroport, carte identité (avatar + badge),
3 tuiles de stats, cartes **Compte** et **Support**, bouton Déconnexion, barre de navigation à 6 onglets.

## Données réelles (écarts avec la maquette)
- Tuiles : **Envois / En cours / Livrés** via `GET /users/me/stats` (la maquette montrait Note 4.8 et Avis 12, qui n'existent pas côté API).
- Badge : « Client vérifié » si `is_email_verified`, sinon « Email non vérifié ».
- Avatar : photo `profile_photo_url` si présente, sinon initiale ; l'appareil photo est un placeholder (toast « bientôt disponible »).
- Entrées retirées car non fonctionnelles : Moyens de paiement, interrupteurs factices. « Mot de passe » (fonctionnel) est conservé.

## Logique conservée
`GET/PUT /users/me` (nom, prénom, téléphone, CNI recto/verso via `POST /uploads`), `POST /auth/change-password`
(min. 8 caractères + confirmation), déconnexion → `index.html?choice=1`.
Édition, mot de passe, langue, aide, contact, à propos et déconnexion s'ouvrent dans une bottom sheet.

## Tests
Edge headless 320/360/390/430 px : aucun débordement horizontal, 0 erreur JS, sauvegarde profil et mot de passe vérifiés avec un `fetch` simulé.
