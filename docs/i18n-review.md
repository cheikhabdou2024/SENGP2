# Relecture des traductions (phase E)

Toutes les traductions (application, serveur, site) sont **automatiques** : elles n'ont été relues par aucun locuteur natif. Ce document décrit comment les faire relire et ce qui reste à décider.

## 1. Contrôle automatique

```
node scripts/i18n-qa.mjs                # résumé, erreurs (code de sortie 1) et points à examiner
node scripts/i18n-qa.mjs --kit          # écrit aussi les feuilles de relecture dans docs/review/
node scripts/i18n-qa.mjs --json         # sortie JSON
```
Il couvre `frontend/locales/*.json`, `website/src/locales/*.json` et `backend/src/i18n/messages.ts`.

- **Erreurs** (certaines) : traduction manquante, variable `{x}` ou balise différente du français, chiffres arabes-indiens (nous gardons les chiffres latins), texte arabe absent ou caractères arabes dans une autre langue, guillemets français sur le site.
- **Points à examiner** (heuristiques, un humain tranche) : texte identique au français, mots français restants, traduction beaucoup plus longue que la source (risque de débordement), vocabulaire commun (expéditeur, colis, suivi, livraison, paiement, réclamation, trajet, mission) absent de la traduction.

À lancer après toute modification d'un dictionnaire ; la sortie doit afficher **0 erreur**.

## 2. Faire relire par un locuteur natif

1. `node scripts/i18n-qa.mjs --kit` produit `docs/review/releve-<langue>.csv` (UTF-8, séparateur `;`, ouvrable dans Excel ou Google Sheets) : une ligne par texte, avec la surface (application / site / serveur), le français, la traduction et une colonne « à vérifier » qui place les points signalés en premier.
2. Le relecteur remplit `statut` (OK / à corriger), `correction proposée` et `commentaire`.
3. Reporter les corrections dans le dictionnaire concerné (`frontend/locales/<langue>.json`, `website/src/locales/<langue>.json` via `node scripts/i18n-tool.mjs merge`, `backend/src/i18n/messages.ts`), puis relancer le contrôle et les tests.

Priorité de relecture : écrans de paiement et de livraison (QR), messages d'erreur du serveur, notifications, puis le site (accueil, FAQ, destinations et tarifs).

## 3. Décisions de vocabulaire à confirmer

| Sujet | Constat | À décider |
|---|---|---|
| Tutoiement en espagnol | L'application tutoie (« Puedes escribir… »), le site vouvoie (« Usted… »). | Un registre unique, ou deux registres assumés (application familière, site formel). |
| « Suivi » en portugais | L'application dit « Acompanhamento » (menu) et « Seguimento em direto » (suivi en direct) ; le site dit « acompanhamento ». | Un seul terme (recommandation : « acompanhamento »). |
| « Voyageur (GP) » en arabe | Le site emploie « مسافر (GP) » dans les parcours et « ناقل (GP) » dans la définition ; l'application emploie « ناقل (GP) ». | Un seul terme (recommandation : « ناقل (GP) »). |
| « Gros porteur » | Sens de « GP » laissé en français dans la FAQ du site, dans toutes les langues. | Traduire ou garder l'abréviation seule. |
| Noms de villes en arabe | Translittérations (Thiès, Kaolack, Saint-Louis, Ziguinchor…). | Confirmer l'orthographe usuelle. |
| Portugais | Européen (pt-PT) partout. | Confirmer que les marchés visés ne sont pas brésiliens. |
| Espagnol « Costa de Marfil », arabe « ساحل العاج » | Formes courantes. | Confirmer. |

## 4. Limites connues (hors traduction)

- Les captures de l'application sur le site sont en français.
- Les messages de validation détaillés du serveur sont traduits, mais l'application n'affiche que le message général (« Échec de la validation ») : afficher le détail par champ est une évolution de l'interface.
- Les textes juridiques (CGU, confidentialité, mentions légales) restent en français : ne pas les traduire sans validation d'un juriste.
- La console d'administration reste en français.
