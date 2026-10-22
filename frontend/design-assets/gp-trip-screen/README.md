# Création de trajet GP (creetrajet.html)

Étape 1 « Billet » refaite d'après `reference-mockup-trip-step1.png` : hero aéroport (`im/sengp-create-background.*`) avec logo,
retour et titre, stepper 1-2 (vert = terminé), carte « Votre billet d'avion », zone d'import en pointillés avec illustration
de billet (SVG), bouton « Choisir un fichier », ligne « Prendre une photo », mention de confidentialité, pied de page
« Continuer » (désactivé tant qu'aucun billet n'est choisi).

- Formats : image (JPG/PNG…) ou PDF. **5 Mo max** (limite du serveur, `multer` dans `trip.routes.ts`) — la maquette indiquait 10 Mo.
- L'appareil photo a son propre `<input capture>` (l'ancien code laissait `capture` collé sur l'input fichier).
- Après sélection : aperçu de l'image (ou pastille PDF), nom du fichier, bouton « Changer de fichier ».
- Étape 2 « Détails » : mêmes champs et même appel `POST /trips` (multipart `flight_ticket_photo`…), regroupés en cartes Départ / Arrivée / Capacité dans le nouveau style.
- Testé Edge headless 320/360/390/430 px : pas de débordement, 0 erreur JS ; fichier .txt et fichier 6 Mo refusés ; payload vérifié.
