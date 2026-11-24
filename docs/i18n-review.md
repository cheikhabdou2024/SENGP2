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

## 5. Langues ajoutées après la phase E (it, de, nl, ru, zh, hi, ja, ko, tr)

Traduites automatiquement sur les trois surfaces, avec le même vocabulaire imposé (voir le tableau du brief : expéditeur, GP, colis, envoi, mission, trajet, suivi, livraison, paiement à la livraison, réclamation). Registres choisis, identiques sur l'application, le serveur et le site : italien « tu », allemand « Sie », néerlandais « je », russe « вы », turc « siz », chinois « 您 », hindi « आप », japonais です・ます, coréen 합니다체.

À faire relire en priorité :
- **Textes assemblés par morceaux** (l'ordre des mots dépend du code, fragile hors français) : `gp.gate_text`, `gp.my_missions`, `gp.create_trip`, `gp.j.greeting`, `tj.title`, `tj.add_1`/`tj.add_2`, `ms.info_rich`, `ms.published`, `onb.s1_*`, `onb.s2_*`, `login.title_a`/`login.title_b`, `envois.wa_msg`, `pwa.ios_*`. Les afficher dans l'application dans chaque langue.
- **Italien** : « viaggiatore » est utilisé sur le site pour « voyageur » (la consigne disait « trasportatore (GP) »).
- **Chinois, japonais** : glose ajoutée par le traducteur pour « GP (gros porteur) » dans la FAQ du site (`大件携带者`, `大型荷物の運び手`) : à valider ou retirer.
- **Allemand** : « Abgang » pour « Départ » dans quelques libellés courts (préférer « Abreise »).
- **Hindi** : « destinataire » rendu « पाने वाला » (terme non imposé) ; noms de villes transcrits à l'oreille.
- **Coréen** : « 착불 » évité (ambigu) au profit de « 배송 시 결제 » ; particules 이/가, 을/를 sur les variables.
- **Turc, néerlandais** : « Notifs » rendu par le même mot que « Notifications » (plus de gain de place).

Défauts constatés dans les textes **source** (communs aux langues, non corrigés) :
- `prof.copyright` : « © 2025 » dans l'application, « © 2026 » sur le site.
- `ms.published` (« Publiée {ago} ») est suivi d'un `{ago}` qui contient déjà « Publié il y a… » : le français affiche « Publiée Publié il y a 3h ». Les traductions russe et turque évitent le doublon.
- `prof.faq3_a` parle de « l'onglet Alertes » alors que l'onglet s'appelle Notifications.
- `cr.terms_stub`, `cr.privacy_stub`, `pay.download_alert` : textes provisoires de maquette (« Dans la version complète… ») encore affichés.
- `gn.ask_method` : identifiants d'API (`wave`, `orange_money`, `free_money`, `bank_transfer`) dans un texte affiché ; le serveur (E121/E123) n'accepte que `wave` et `orange_money`.
- Message d'erreur serveur « Only expediteurs can create missions » : mot français dans l'anglais.
- Textes à retours à la ligne (alertes, QR, paiement) : les traductions respectent désormais le même nombre de lignes que le français.
