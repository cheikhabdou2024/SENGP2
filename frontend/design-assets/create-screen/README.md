# Création d'envoi (creenvoi.html)

- Maquette : `reference-mockup-create-step1.png` (étape 1 « Colis » uniquement). Sources : `sengp-create-background.source.png`, `package-types-sheet.source.png` (15 illustrations).
- Assets servis : `../../im/sengp-create-background.{webp,jpg}`, `../../im/sengp-box-3d.{webp,png}` (recadré dans la maquette), `../../im/types/<type>.webp` (15 découpes de la planche + « Autre » recadré dans la maquette ; fonds blanchis pour s'intégrer aux tuiles).
- Nouveau : en-tête photo + stepper, carte photo, grille de 16 types (8 visibles + « Voir tous les types »), poids avec − / +, description texte/audio conservée.
- Étape 2 (maquette `reference-mockup-create-step2.png`) : carte « Destinataire » (pays/ville, nom, indicatif + téléphone, adresse de livraison) et carte « Retrait et départ » (pays/ville de départ, adresse de ramassage, date). Les champs que la maquette ne montre pas (villes, adresses, date) restent obligatoires car l'API les exige. Stepper : vert = terminé, orange = en cours. Les listes de lieux et d'indicatifs sont des feuilles claires qui montent du bas.
- Étapes 3 et 4 : logique inchangée, affichées dans un panneau sombre en attendant leurs maquettes.
- Photo : analyse locale avant acceptation (voir `PHOTO_RULES` dans la page). Refus avec la cause : trop floue (variance du laplacien + bords nets), trop sombre (luminance moyenne < 50 ou 95e centile < 90), surexposée (≥ 35 % de pixels brûlés et luminance ≥ 195), image uniforme (écart-type < 12), résolution < 480 px, fichier non image, illisible, > 50 Mo. Seuils calibrés sur des variantes floutées / assombries / surexposées d'une photo ; à ajuster avec de vraies photos de colis.
- Envoi : la photo (JPEG ≤ 1600 px) est téléversée par `POST /uploads` puis `package_photos: [clé]` est envoyé à la création ; si le téléversement échoue, l'envoi est créé sans photo.
- La bannière d'installation PWA (`pwa.js`) est compactée et la barre « Suivant » remonte au-dessus d'elle.
