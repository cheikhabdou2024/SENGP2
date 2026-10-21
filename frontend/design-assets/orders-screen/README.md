# Mes envois (envois.html)

- Sources : trois maquettes (`reference-mockup-orders-*.png`), `sengp-plane-icon.source.png` (avion néon sur fond noir), `sengp-orders-background.source.png`.
- Assets servis : `../../im/sengp-plane.{webp,png}` (avion détouré : le halo sur fond noir a été converti en transparence, silhouette seule), fond réutilisé `../../im/sengp-home-background.*`, vignette `../../im/sengp-package-thumb.*`.
- Logique conservée : `GET /missions/my-missions?limit=200`, onglets Tous / En cours / Livrés (`?status=active|delivered`), lien vers `detailenvoi.html?id=…`, retour vers `dashexpediteur.html`, pull-to-refresh.
- Ajouts : compteurs sur les onglets, recherche (insensible aux accents), tri (récents / anciens / prix), suivi en 4 étapes sur l'onglet « En cours » (dates : `actual_pickup_date`, dernière mise à jour ; « — » sinon), ligne « Livré le … à … » sur l'onglet Livrés, pastille de notifications non lues.
- Navigation : Accueil · Mes envois · Suivi · Notifications · Profil (« Réclamation » remplacée par « Mes envois », comme sur les maquettes ; aussi appliqué à l'accueil Expéditeur).
