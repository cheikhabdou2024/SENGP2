# Registre de dette technique

État au 31/10/2026, après les lots 0 à 6 de la transformation. Chaque ligne dit quoi, pourquoi c'est un risque, et l'effort estimé (S < 1 jour, M 1 à 3 jours, L > 3 jours). Les points **à traiter en priorité** sont en tête.

## 1. Constat à corriger

(Vérifié : `GET/PUT /admin/settings` ne manipulent que les quatre réglages de `SETTING_DEFAULTS`. La clé privée VAPID stockée dans `platform_setting` n'est ni lisible ni modifiable par ces routes, ce que `tests/integration/settings.test.ts` garantit.)

| Sujet | Risque | Effort |
|---|---|---|
| La commission réglable dans l'admin (`commission_pct`) n'est pas utilisée par le calcul de paiement, qui lit `PLATFORM_COMMISSION_PERCENTAGE`. | L'écran d'administration laisse croire qu'un changement s'applique. | S |

## 2. Actions du propriétaire (hors code)

| Action | Pourquoi |
|---|---|
| Faire tourner les secrets : `ADMIN_BOOTSTRAP_SECRET` d'abord, puis `JWT_SECRET`, mot de passe RDS, clés Wave et Orange. | Ils ont circulé en dehors d'un coffre. Ordre et effets : `docs/environment.md`. |
| IAM : droits minimaux, MFA, nouvelle clé d'accès, suppression du fichier d'identifiants du Bureau. | La clé actuelle est large et stockée en clair sur un poste. |
| RDS : chiffrement, protection contre la suppression, durée de sauvegarde. | Non gérés par le code. |
| Captures d'écran de `frontend/design-assets/` toujours dans l'historique git. | Alourdit le dépôt ; à purger si besoin. |
| Définir `FRONTEND_URL` dans App Runner si un domaine web supplémentaire est utilisé. | CORS en liste blanche. |

## 3. Backend

| Sujet | Détail | Effort |
|---|---|---|
| Transactions à la main | Restent à convertir vers `withTransaction` : `updateStatus` (mission.service), `mission.admin.service`, `user.admin.service`, `auth.service` (2), création de mission, `withdrawal.service` (3). `updateStatus` est la plus délicate (verrou, crédit, notifications imbriqués). | M |
| Erreurs typées | `AppError` n'est utilisé que pour « déjà payé ». Le reste lève des `Error` génériques dont le statut HTTP est deviné dans les contrôleurs. | M |
| Journal des mouvements d'argent | Le solde GP (`wallet_balances`) est mis à jour directement : pas de grand livre en écriture seule pour rapprocher les paiements, commissions et retraits. | L |
| Réaffectation / acceptation | Garde-fous concurrents partiels : `accept` verrouille la ligne, mais `reassign` et le refus de l'affectation ne sont pas couverts par un test de concurrence. | S |
| Session | JWT de 24 h sans jeton de rafraîchissement ni déconnexion serveur individuelle (seule la révocation globale par `token_version` existe). | M |
| Types | Nombreux `any` dans les contrôleurs et services. | L |
| Dépendances | `nodemailer` (version majeure en retard), `aws-sdk` v2 (fin de vie, migrer vers le SDK v3), `uuid`, `qs` et d'autres avertissements « moderate » de `npm audit`. | M |
| Observabilité | Pas de suivi d'erreurs (Sentry : `SENTRY_DSN` est prévu mais non branché, il faut un compte), pas d'alarmes CloudWatch sur 5xx ni sur `/health/ready`. | M |
| Variables inutilisées | `.env.example` liste des intégrations non branchées (voir `docs/environment.md`). | S |
| Mots de passe | Longueur minimale de 6 caractères pour la réinitialisation par secret, sans règle de complexité. | S |

## 4. Frontend

| Sujet | Détail | Effort |
|---|---|---|
| CSP non appliquée | Elle est en `Report-Only` : les pages contiennent du JavaScript et des `onclick` inline. Passer en mode appliqué suppose de sortir ces scripts, puis de retirer `'unsafe-inline'`. | L |
| Appels réseau dispersés | Environ 80 `fetch` répartis dans les pages ; `api.js` ne traite que le 401 (et expose `sengpEsc`). Un client unique (base d'URL, jeton, erreurs, nouvelle tentative) reste à écrire. | L |
| Pages volumineuses | `creenvoi.html` (≈ 2 050 lignes + 1 120 de script), `admin` (1 670 lignes de script), `index`. Les scripts ont été extraits à l'identique dans `page-*.js` mais pas redécoupés en modules. | L |
| Échappement | `sengpEsc` est unique, mais rien n'empêche d'injecter une donnée sans l'appeler. Une revue de tous les `innerHTML` a été faite par recherche de motifs, non exhaustive ; viser `textContent` ou un petit moteur de gabarits. | M |
| `esc` dans les attributs de gestionnaire | `onclick="f('${esc(id)}')"` : les entités HTML sont décodées avant l'exécution du JavaScript. Sûr tant que les identifiants sont des UUID générés par le serveur ; ne jamais y mettre du texte libre. | S |
| Tests | Pas de test de navigateur. Les tests Node couvrent `api.js` et des contrôles statiques. Un test de bout en bout (Playwright) des parcours inscription, envoi, paiement, scan manque. | L |
| SRI | Les empreintes ont été calculées sur les fichiers servis le jour du lot 6. Si une bibliothèque change de version, recalculer (`openssl dgst -sha384 -binary`). | S |
| Application mobile | Build Android/iOS (Capacitor) non retesté après le lot 6 ; l'URL de l'API est écrite dans `config.js`. | M |

## 5. Exploitation

| Sujet | Détail | Effort |
|---|---|---|
| Environnement de préproduction | Il n'existe qu'une production. Les déploiements passent par les tests et un contrôle `/health/ready`, mais pas par un environnement miroir. | M |
| Migrations non réversibles | Pas de script « down » : le retour arrière d'image ne défait pas le schéma. | M |
| Test de charge | Aucun. Taille du pool (20) et limites App Runner non validées. | M |
| Tests de mutation | Les tests de concurrence (acceptation, paiement, livraison) n'ont pas été vérifiés en retirant volontairement les verrous pour s'assurer qu'ils échouent. | S |

## 6. Produit et juridique (bloquants de mise en ligne du site)

Mentions légales à faire valider par un juriste, boîte mail de contact, passage de `legalReviewed` et `live` à `true` dans `website/site.config.json`, puis `npm run build:live`. Tarif Océanie et classement Amérique centrale / Caraïbes à trancher. Reprise des remarques de `Observations SEN GP.odt`. Test de bout en bout sur appareil réel (affectation, scan, livraison).
