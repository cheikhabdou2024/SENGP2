# Notifications (notifications.html)

- Maquette : `reference-mockup-notifications.png`. Fond réutilisé `../../im/sengp-create-background.*`, avion `../../im/sengp-plane.*`.
- Page partagée expéditeur / Gros Porteur (détection via `userData.user_type`) : API inchangée (`GET /notifications/my-notifications`, `PUT /:id/read`, `PUT /mark-all-read`, `DELETE /:id`, `POST /missions/:id/accept|decline`).
- Icônes colorées par type (`notification_type`) : transit (avion vert), prise en charge / assignée (camion bleu), récupéré (colis violet), livré (coche bleue), paiement (pièces cyan), réclamation (bulle orange), avis (étoile), alerte système (triangle orange) ; mots-clés « problème / échec / refus… » → triangle rouge, « document / facture » → document orange.
- Carte : titre, message, « Il y a 2 h », point bleu si non lue, chevron, corbeille ; bandeau de route (drapeaux + avion) si `metadata` contient départ/arrivée. Un clic marque lue et ouvre `action_url` (`detailenvoi.html?id=X` est redirigé vers `envois.html?open=X`).
- GP : la carte « Mission assignée » (date, heure, poids, rémunération, Accepter / Décliner) est redessinée ; barre du bas GP conservée (Accueil, Missions, Trajets, Notifs, Profil). Elle n'apparaît plus que pour un GP (avant, un expéditeur recevant `mission_matched` aurait vu les boutons Accepter/Décliner).
- Barre du bas expéditeur à 6 onglets (Accueil, Envois, Alertes, Suivi, Notifications, Profil), appliquée aussi à `dashexpediteur.html`, `envois.html` et `suivi.html` : « Alertes » rouvre `reclamation.html`. Libellé court « Notifs » sous 460 px.
