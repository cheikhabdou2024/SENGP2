# Audit de la console d'administration (25 novembre 2026)

Périmètre : `frontend/admin.html`, `page-admin.js` (1 669 lignes), `admin-dispatch.js` (169 lignes), côté serveur `routes/admin.routes.ts`, `controllers/admin.controller.ts`, `services/admin/*`, `utils/permissions.ts`, `middlewares/auth.middleware.ts`, `services/auth.service.ts`, migration `002_admin_rbac.sql`.

**Méthode et limites.** Audit de lecture du code et des routes. Je n'ai **pas** ouvert la console à l'écran (pas de compte admin local ni de données) : les constats d'ergonomie visuelle (responsive, lisibilité) restent à confirmer. Chaque constat sécurité ou exactitude cite le fichier où je l'ai lu ; aucun n'a été exécuté contre la production.

Gravité : **A** = à corriger avant toute extension (sécurité ou chiffres faux), **B** = important, **C** = confort ou dette.

---

## 1. Ce que contient la console aujourd'hui

| Groupe du menu | Entrées | Permission du menu | Remarque |
|---|---|---|---|
| (sans titre) | Overview, Analytics | Overview : aucune ; Analytics : `analytics:read` | |
| Opérations | Utilisateurs, Missions, Affectations, Alertes, Trajets, Vérification KYC | `users:read`, `missions:read`, `missions:assign`, **aucune**, `trips:read`, `users:verify` | Six entrées de natures différentes |
| Finances | Paiements, Retraits, Revenus & Comm. | `payments:read`, `withdrawals:read`, `analytics:read` | « Revenus & Comm. » ouvre **la même vue** qu'Analytics |
| Confiance | Réclamations, Avis | `claims:read`, `reviews:read` | |
| Administration | Rôles & Admins, Journal d'audit, Broadcast, Paramètres | `roles:read`, `audit:read`, `broadcast:send`, `settings:read` | |

Rôles prévus : super_admin, operations, finance, support, verification, analyst (+ rôles personnalisés). 28 permissions de la forme `ressource:action`.

---

## 2. Sécurité et droits d'accès

| # | Gr. | Constat | Où |
|---|---|---|---|
| S1 | **A** | **Escalade de privilèges.** La permission `users:write` suffit pour créer un compte `admin` (`createUser` accepte `user_type: 'admin'`) ou promouvoir un utilisateur (`updateUser` autorise `user_type`). Ce compte n'a pas de rôle ; son jeton ne porte alors aucune liste de permissions et le « repli historique » du serveur lui donne **tous les droits**. Contourne `roles:manage`. Aucun des six rôles système n'a `users:write`, mais un rôle personnalisé peut l'avoir. | `user.admin.service.ts` (champs autorisés, création), `auth.service.ts` (`resolvePermissions` renvoie `undefined`), `auth.middleware.ts:152-160` |
| S2 | **A** | **Le repli « jeton sans permissions = accès total » est dangereux en soi** : il vaut pour tout admin sans rôle (rôle supprimé, création directe en base, S1). Un défaut sûr serait « aucun droit ». | idem |
| S3 | **B** | **Droits figés dans le jeton (24 h).** Changer ou retirer un rôle n'agit qu'à la reconnexion : `setUserRole` ne révoque pas la session (le compteur `token_version` n'est incrémenté que par le changement de mot de passe). Un admin rétrogradé garde ses anciens droits jusqu'à 24 h. | `role.admin.service.ts` (`setUserRole`), `auth.service.ts` (`JWT_EXPIRES_IN` 24 h) |
| S4 | **B** | **Aucun garde-fou sur le dernier super admin** : on peut le suspendre, le rétrograder ou changer son rôle. Seule l'auto-suppression est bloquée. `roles:manage` permet aussi de se donner `*`. | `admin.controller.ts` (`deleteUser`), `role.admin.service.ts` |
| S5 | **B** | **Pas de 2FA, pas de verrouillage dédié** pour les comptes qui peuvent rembourser, valider des retraits et lire des pièces d'identité. La session admin est dans `localStorage` sous la clé `authToken`, **la même que l'application**, sur la même origine ; la politique CSP est en mode « rapport seulement » et autorise `unsafe-inline`. Une faille XSS dans n'importe quelle page de l'application donnerait la session admin. | `page-admin.js:10`, en-têtes de `/admin.html` |
| S6 | **B** | **Vue d'ensemble sans permission** : `GET /admin/stats` et `/admin/activity` sont ouverts à tout admin. Un rôle « Vérification KYC » voit le volume brut, les commissions et le fil d'activité des paiements. | `admin.routes.ts` (commentaire « no extra permission ») |
| S7 | **B** | **Journal d'audit incomplet.** Les modifications sont tracées (≈ 30 actions) ; pas les **connexions admin**, ni la **consultation** de données sensibles (fiche utilisateur, pièces KYC, fil d'une réclamation), ni les refus de droits. L'écriture est « au mieux » (`void`, erreurs avalées). Pas de valeurs avant/après, pas de filtre par date, par admin ou par action, pas d'export. Rien ne garantit que les lignes sont non modifiables. | `utils/audit.ts`, `system.admin.service.ts` (`listAudit` : recherche texte seule) |
| S8 | **B** | **Diffusion trop largement accordée** : `broadcast:send` est dans Opérations et Support, pas seulement chez l'administrateur. Un message part **immédiatement** à tous (« Tous les utilisateurs »), sans aperçu du nombre de destinataires, sans historique des diffusions, sans validation par un second admin. | `002_admin_rbac.sql`, `renderBroadcast` |
| S9 | C | En local (`localhost`, `file://`), la console **parle à l'API de production**. Un développeur qui teste en local agit sur les vraies données. | `page-admin.js:5-9` |
| S10 | C | Routes publiques `/admin/bootstrap` et `/admin/reset-password` protégées par un secret partagé (limitées en débit). Le secret a circulé hors coffre (voir `docs/tech-debt.md`) : à faire tourner. | `admin.routes.ts` |

---

## 3. Exactitude et fonctionnement

| # | Gr. | Constat | Où |
|---|---|---|---|
| F1 | **A** | **Les Paramètres ne règlent rien.** Commission, assurance, retrait minimum et pays sont enregistrés (« Paramètres enregistrés ») mais le calcul de paiement lit `PLATFORM_COMMISSION_PERCENTAGE`, le retrait lit `MIN_WITHDRAWAL_AMOUNT`, et les pays ne sont lus par personne. Un administrateur croit avoir changé la commission. | `payment.service.ts:74`, `withdrawal.service.ts:9`, `system.admin.service.ts` |
| F2 | **A** | **Le paiement à la livraison est invisible.** Il ne crée aucune ligne de paiement et la mission ne garde pas son mode de paiement. Paiements, Revenus et commissions l'ignorent ; l'argent encaissé en espèces par les GP ne peut pas être rapproché. | `grep` : aucune trace côté serveur ; seul `page-creenvoi.js` connaît « cod » |
| F3 | **A** | **Filtres de statut faux ou incomplets.** Réclamations : « investigating » **n'existe pas** (la base a `in_progress`), donc ce filtre produit une erreur PostgreSQL ; `rejected` est absent. Missions : manquent `matched`, `picked_up`, `in_customs`, `out_for_delivery`, `disputed`. Paiements : manquent `processing`, `refunded`, `cancelled`. Retraits : manquent `processing`, `cancelled`. Les valeurs sont affichées en anglais brut dans les listes. | `page-admin.js:378-390`, `001_initial_schema.sql:12-14`, `types/index.ts` |
| F4 | B | **Un remboursement n'est qu'une écriture interne** : le statut passe à `refunded` sans appeler Wave, Orange ou Stripe (le code le dit). Un admin peut croire que le client est remboursé. | `payment.admin.service.ts:38-42` |
| F5 | B | **« Rôles & Admins » ne liste pas les admins.** Le tableau montre les rôles ; la colonne « Statut » affiche « Actif » en dur ; pour savoir qui a quel rôle il faut filtrer la liste des utilisateurs. | `renderRolesTable` |
| F6 | B | **Missions « disputed » sans vue dédiée** : aucune file de litiges, alors que la réclamation et la mission sont liées. | `renderMissions` |
| F7 | C | « ＋ Créer un trajet » n'affiche qu'un message. La recherche en haut ne cherche que des utilisateurs. | `renderTrips`, `globalSearchGo` |
| F8 | C | « Alertes » n'est **pas** une file opérationnelle : c'est le fil de notifications personnel de l'admin (interrogé toutes les 15 s), mélangé aux événements de dispatch. | `admin-dispatch.js` |

---

## 4. Organisation et ergonomie

| # | Gr. | Constat |
|---|---|---|
| O1 | B | **Pas de file « À traiter ».** Le travail du jour est dispersé : arrivées à confirmer (bandeau au-dessus de toutes les vues), affectations (pastille), KYC, retraits en attente, réclamations ouvertes, litiges. Seules deux entrées ont une pastille ; les compteurs de retraits, réclamations et KYC n'existent que dans la vue d'ensemble. |
| O2 | B | **Menu incohérent** : KYC est classé en Opérations alors qu'il appartient à la confiance ou à la fiche utilisateur ; Affectations est séparée de Missions alors que c'est le même flux ; Analytics apparaît deux fois (« Revenus & Comm. ») ; « Alertes » est ambigu ; la diffusion est rangée avec les réglages. |
| O3 | B | **Aucun lien profond.** L'état (vue, filtres, page) n'est pas dans l'adresse : un rechargement ramène à la vue d'ensemble, on ne peut pas envoyer le lien d'une mission ou d'un utilisateur, le bouton Précédent du navigateur ne sert à rien. Les détails s'ouvrent en fenêtre modale uniquement. |
| O4 | C | Tableaux : pas de tri, pas de choix de colonnes, filtres appliqués par bouton, une seule action groupée (affectation). |
| O5 | C | Aucune dimension « langue » ni « pays » dans les statistiques, alors que l'application est désormais en 14 langues et que `users.language` est enregistré. La diffusion n'est pas traduite : un seul texte pour tous. |
| O6 | C | Console en français uniquement (choix assumé), avec formats `fr-FR` fixes. |
| O7 | C | Responsive non vérifié à l'écran : le menu se réduit à 66 px sous 860 px, mais les tableaux larges n'ont pas de variante mobile visible dans le code. |

## 5. Code et tests

- `page-admin.js` : 1 669 lignes, fonctions globales appelées par `onclick`, un `render()` en cascade de `if`, un `renderTable` unique pour huit vues, trois chargeurs de KPI quasi identiques (`loadUserKpis`, `loadMissionKpis`, `loadTripKpis`). `admin.html` embarque ≈ 200 lignes de CSS en ligne. Déjà noté dans `docs/tech-debt.md`.
- **Aucun test de l'interface admin.** Côté serveur, le contrôle d'accès, le dispatch, les réglages et la sécurité de session sont testés ; pas le cas S1 (création d'un admin par `users:write`), ni les filtres de statut (F3).
- Le serveur est plus propre que l'interface : routes fines, une permission par route, journalisation systématique des mutations, exports tracés.

---

## 6. Organisation cible proposée

**Principe : un menu par métier, une file « À traiter » en page d'accueil, tout état dans l'adresse.**

| Groupe | Entrées | Contenu |
|---|---|---|
| **Pilotage** | À traiter · Vue d'ensemble · Analyses | « À traiter » : files avec compteurs (arrivées à confirmer, missions à affecter, KYC à vérifier, retraits à valider, réclamations ouvertes, litiges). « Analyses » absorbe « Revenus & Comm. » avec onglets Revenus, Itinéraires, GP, Langues et pays. |
| **Opérations** | Missions · Trajets · Utilisateurs | Missions : onglets Toutes / À affecter / En cours / Litiges (l'affectation devient une action de la mission, plus une page séparée). Utilisateurs : onglets Tous / À vérifier (KYC) / Admins ; la fiche devient une page avec adresse propre. |
| **Finances** | Paiements · Retraits · Portefeuilles | Portefeuilles : solde par GP et grand livre des commissions ; mode de paiement visible, dont le paiement à la livraison. |
| **Confiance** | Réclamations · Avis | Les litiges de mission rejoignent les réclamations. |
| **Équipe & système** | Équipe et rôles · Journal d'audit · Diffusions · Paramètres | « Équipe et rôles » liste les admins avec leur rôle ; « Diffusions » garde l'historique, l'aperçu du nombre de destinataires et le ciblage par langue. |

Cloche en haut à droite = notifications personnelles (remplace l'entrée « Alertes »).

---

## 7. Plan proposé

| Lot | Contenu | Effort |
|---|---|---|
| **1. Sécurité** (A) | S1 + S2 : un admin sans rôle n'a aucun droit ; `users:write` ne peut plus créer ni promouvoir un admin (seulement `roles:manage` via l'attribution d'un rôle) ; S3 : changer le rôle révoque la session ; S4 : garde-fou « dernier super admin » ; S6 : permission sur stats et activité ; tests dédiés. | S |
| **2. Exactitude** (A) | F3 filtres corrects et libellés en français ; F1 brancher commission, retrait minimum (et assurance si utilisée) sur les réglages, ou retirer les champs inertes ; F2 enregistrer le mode de paiement de la mission, y compris « à la livraison », et l'afficher. | M |
| **3. Organisation** (B) | Nouveau menu, file « À traiter », adresses d'état (lien profond, Précédent), liste des admins, fiche utilisateur en page. | M à L |
| **4. Audit et durcissement** (B) | Journal : connexions, consultation de données sensibles, filtres et export ; 2FA pour les rôles financiers ; diffusion avec aperçu, historique, ciblage par langue ; passage de la CSP en mode bloquant. | M à L |
| **5. Code** (C) | Découper `page-admin.js` en modules par vue, sortir le CSS, tests de l'interface. À faire **avec** le lot 3 plutôt qu'avant. | L |

## 8. Suivi

**Lots 1 et 2 réalisés (25 novembre 2026, non déployés).** S1, S2, S3, S4 et S6 corrigés ; F1 (commission, assurance, retrait minimum branchés ; champs « pays » retirés), F2 (mode de paiement enregistré sur la mission, affiché, compté dans la ventilation) et F3 (filtres et libellés) corrigés. Tests : `admin-security.test.ts` et `admin-accuracy.test.ts`.

**Lot 3 réalisé (25 novembre 2026, non déployé).** Interface seule, aucun changement serveur.
- Menu regroupé par métier : Pilotage (À traiter, Vue d'ensemble, Analyses), Opérations (Missions, Affectations, Trajets, Utilisateurs), Finances (Paiements, Retraits), Confiance (Vérification d'identité, Réclamations, Avis), Équipe & système (Équipe et rôles, Journal d'audit, Diffusions, Paramètres). Le doublon « Revenus & Comm. » et l'entrée « Alertes » sont retirés du menu (la cloche en haut à droite reste). Un groupe sans entrée autorisée est masqué.
- Page d'accueil « À traiter » (`frontend/admin-todo.js`) : compteurs des arrivées à confirmer, scans à valider, missions à affecter, identités à vérifier, retraits en attente (avec le montant), réclamations ouvertes et litiges, chacun ne s'affichant que si le rôle y a droit, avec un lien vers la liste déjà filtrée. Total en pastille dans le menu, actualisé toutes les 60 s.
- Adresse = état : `#/missions?status=disputed&q=…&page=2`, `#/users?type=admin`, `#/missions/<id>`, `#/users/<id>`, `#/trips/<id>`. Rechargement, bouton Précédent et partage de lien fonctionnent ; une vue interdite ou inconnue retombe sur « À traiter ». Les filtres Type, Expéditeur et GP, qui n'étaient jamais remis à zéro en changeant de vue, le sont désormais.
- Équipe et rôles : bouton « Voir les comptes admin » (liste des utilisateurs filtrée sur les admins).
- Écart avec la cible : les fiches mission, utilisateur et trajet restent des fenêtres, mais avec leur propre adresse ; les onglets Missions (Toutes / À affecter / En cours / Litiges) et Utilisateurs (Tous / À vérifier / Admins) ne sont pas faits, les tuiles « À traiter » en tiennent lieu.

Restent hors périmètre de ces lots : suivi du reversement des espèces par les GP (F2, seconde moitié), remboursement réel chez le fournisseur (F4), lots 3 à 5.
