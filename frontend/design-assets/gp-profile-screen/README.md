# Profil Gros Porteur (profilegp.html)

Même design que le profil expéditeur (`profile-page-screen/`) : hero (fond GP `im/sengp-gp-background.*`), carte identité (initiale ou photo, badge « GP vérifié » / « Email non vérifié »), trois tuiles réelles — **Trajets** (`GET /trips/my-trips`), **En cours** et **Livrées** (`GET /users/me/stats`) —, cartes Compte / Support, Déconnexion, bottom sheets (modifier le profil + pièce d'identité, mot de passe, langue, aide, contact, à propos, déconnexion).

- Compte : Modifier le profil, Mot de passe, **Mes gains** (→ `gains.html`), Langue. Support : Centre d'aide (textes GP), **Réclamations** (→ `reclamationgp.html`), Contacter le support, À propos.
- Les anciens appels `/users/profile`, `/users/change-password` et `PUT /users/profile` n'existent pas côté API : la page utilise `/users/me` et `/auth/change-password` comme le profil expéditeur. Moyens de paiement et faux interrupteurs retirés.

## Barres de navigation
- Onglet **Alertes** supprimé côté expéditeur (5 onglets : Accueil, Envois, Suivi, Notifs, Profil) ; la page Réclamations s'ouvre désormais depuis Profil › Support › « Mes réclamations ».
- Onglet **Gains** supprimé côté GP (accueil, trajets, notifications, missions, profil) ; barre GP des pages redessinées : Accueil, Trajets, Notifs, Profil. Les gains restent accessibles depuis Profil › Compte › Mes gains. `gains.html` et `missions.html` (anciens écrans) gardent leur propre barre.
