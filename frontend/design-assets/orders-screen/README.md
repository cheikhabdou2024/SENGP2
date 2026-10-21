# Mes envois (envois.html)

Maquette de référence actuelle : `reference-mockup-orders-actions.png` (cartes dépliables + 4 actions). Les trois maquettes précédentes (`reference-mockup-orders-all/active/delivered.png`) sont conservées pour l'historique.

- Assets servis : `../../im/sengp-plane.{webp,png}` (avion détouré depuis `sengp-plane-icon.source.png`), fond réutilisé `../../im/sengp-home-background.*`, vignette `../../im/sengp-package-thumb.*`.
- Logique conservée : `GET /missions/my-missions?limit=200`, onglets Tous / En cours / Livrés (`?status=active|delivered`), retour vers `dashexpediteur.html`, pull-to-refresh, pastille de notifications.
- Cartes dépliables (une seule ouverte, la première par défaut) : suivi en 4 étapes (dates/heures : `actual_pickup_date`, dernière mise à jour, `actual_delivery_date` ; « — » sinon) + « Voir sur la carte » (itinéraire Google Maps) + 4 tuiles :
  - **Partager le suivi** : fenêtre du bas, lien public `/t/<numéro de suivi>` ; WhatsApp, Telegram, Facebook, X, SMS, Email, Copier, Plus (partage natif Capacitor / Web Share).
  - **QR code** : `POST /missions/:id/qr-code` (même QR que `detailenvoi.html`, mis en cache) + « Partager via WhatsApp » (image du QR : plugin natif, Web Share avec fichier, puis repli).
  - **Détails du colis** : poids, dimensions, valeur, assurance, description.
  - **Plus de détails** : enlèvement, livraison, départ souhaité, numéro de suivi, GP (+ appel), date de création, et lien vers la fiche complète `detailenvoi.html`.
- Fenêtres : fermeture par ✕, tap sur le fond, Échap ou glissement vers le bas ; défilement de la page verrouillé pendant l'ouverture.
- Retiré par rapport à la version précédente (absents de la nouvelle maquette) : recherche et tri.
- Navigation : Accueil · Mes envois · Suivi · Notifications · Profil.
