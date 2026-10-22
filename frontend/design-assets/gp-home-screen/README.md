# Accueil Gros Porteur (dashgp.html)

Refonte d'après la maquette `reference-mockup-gp-home.png` : hero aéroport (fond `sengp-gp-background.source.png`
recadré en `im/sengp-gp-background.*`), logo, avatar, carte **Mes missions** (À venir / En cours / Terminées),
carte **Créer un trajet**, barre de navigation.

## Mes missions → bottom sheet
Un clic sur la carte (une ligne de statut ou « Voir mes missions ») ouvre un modal qui monte du bas : onglets
Toutes / À venir / En cours / Terminées, puis une carte par mission (statut, code, trajet, poids, date, prix).
Données : `GET /missions/my-missions`. Clic sur une carte → `detailmissiongp.html?id=…`.
- À venir = pending, matched, accepted ; En cours = picked_up, in_transit, in_customs, out_for_delivery ; Terminées = delivered.

## Supprimé
Boutons « Rechercher des missions » et « Colis à livrer », section « Comment ça marche », cartes de stats
(missions actives / gains), listes de missions de l'ancien accueil.

## Conservé
Popup GPS obligatoire, popup « Votre voyage » (étapes de livraison), partage de position (carte discrète sous « Créer un trajet »),
cloche de notifications (badge sur l'onglet Notifs).
Navigation : Accueil, Trajets, Gains, Notifs, Profil (l'onglet « Missions » est remplacé par le modal).

Testé sous Edge headless à 320/360/390/430 px : pas de débordement, 0 erreur JS.
