# Création de trajet GP (creetrajet.html)

Étape 1 « Billet » refaite d'après `reference-mockup-trip-step1.png` : hero aéroport (`im/sengp-create-background.*`) avec logo,
retour et titre, stepper 1-2 (vert = terminé), carte « Votre billet d'avion », zone d'import en pointillés avec illustration
de billet (SVG), bouton « Choisir un fichier », ligne « Prendre une photo », mention de confidentialité, pied de page
« Continuer » (désactivé tant qu'aucun billet n'est choisi).

- Formats : image (JPG/PNG…) ou PDF. **5 Mo max** (limite du serveur, `multer` dans `trip.routes.ts`) — la maquette indiquait 10 Mo.
- L'appareil photo a son propre `<input capture>` (l'ancien code laissait `capture` collé sur l'input fichier).
- Après sélection : aperçu de l'image (ou pastille PDF), nom du fichier, bouton « Changer de fichier ».
- Étape 2 « Détails » (`reference-mockup-trip-step2.png`) : cartes **Trajet** (départ ⇄ arrivée, drapeaux SVG, bouton d'inversion), **Dates du voyage** (pastilles calendrier), **Poids disponible** (curseur 1–50 kg avec bulle, valise `im/sengp-suitcase.*`, capacité maximale, conseils). Un clic sur un lieu ouvre une feuille pays → ville ; un clic sur les dates, une feuille avec deux champs date/heure (arrivée obligatoirement après le départ). Même appel `POST /trips` qu'avant.
- Écarts : « Algérie » ajoutée à la liste des pays (présente dans la maquette) ; la section « Informations complémentaires » est omise car le backend n'a aucune colonne pour une note ; départ/arrivée/dates vides par défaut, poids à 15 kg comme sur la maquette.
- Testé Edge headless 320/360/390/430 px : pas de débordement, 0 erreur JS ; fichier .txt et fichier 6 Mo refusés ; payload vérifié.

## Liste « Mes trajets » (trajets.html)
Maquette `reference-mockup-trips-list.png`, fond de l'état vide `sengp-trips-empty.source.png` (→ `im/sengp-trips-empty.*`) + valise `im/sengp-suitcase.*`.
- Hero (logo, retour, bouton « Créer un trajet », titre « Mes Trajets »), onglets En cours / À venir / Terminés avec compteurs (premier onglet non vide ouvert par défaut).
- Cartes de trajet (statut, code, villes + drapeaux SVG, départ/arrivée, capacité, colis acceptés) ; « Détails » ouvre une feuille du bas (plus d'alert) ; « Chercher colis » / « Voir missions » → `missions.html`.
- État vide (illustration + CTA + conseil) et état d'erreur (« Réessayer »).
- Navigation GP identique à l'accueil : Accueil, Trajets, Gains, Notifs (badge réel), Profil — la maquette montrait Accueil / Missions / Trajets / Profil.
- Données : `GET /trips/my-trips` (inchangé). Testé Edge headless 320/360/390/430 px : pas de débordement, 0 erreur JS.

### Liste avec trajets existants (`reference-mockup-trips-filled.png`)
Trois sections « Trajets en cours / à venir / terminés » (2 cartes puis « Voir tout / Réduire »), les onglets font défiler jusqu'à leur section et suivent le défilement. Carte : vignette + badge de statut, villes avec drapeaux, date/heure, poids disponible, progression Billet ✓ → Détails ✓ → Actif / En attente / Terminé / Annulé (déduite du statut du trajet), « Voir détails » (feuille du bas) et menu « … » (≥ 400 px).
- Pas de photos de villes fournies : 3 vignettes aéroport (`im/sengp-trip-thumb1-3.webp`, recadrées des fonds fournis) alternent selon la ville d'arrivée.

## Accepter / décliner une mission (GP)
Une mission assignée par l'admin a le statut `matched` ; seul le GP assigné peut l'accepter (`POST /missions/:id/accept`) ou la décliner (`/decline`, elle retourne au pool). Les boutons **Accepter / Décliner** apparaissent donc sur les cartes « À confirmer » du modal « Mes missions » (`dashgp.html`) et sur la page `detailmissiongp.html` ; ils existaient déjà dans Notifications. Le déclin demande confirmation.
