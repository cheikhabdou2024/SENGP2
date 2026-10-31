# Base de données

PostgreSQL (RDS `sengp-db` en production). Le schéma est géré par le code, sans outil externe.

## Création et évolution du schéma

1. Au démarrage, `config/migrate.ts` prend un **verrou consultatif** (`pg_advisory_lock`) : une seule instance App Runner migre à la fois, les autres attendent.
2. `initDatabase` applique `migrations/001_initial_schema.sql` et `002_admin_rbac.sql` (idempotents), puis des corrections par `ALTER TABLE … IF NOT EXISTS` (colonnes ajoutées après coup, index).
3. Les fichiers `migrations/NNN_nom.sql` numérotés **à partir de 003** sont exécutés dans l'ordre par le lanceur et consignés dans la table `schema_migrations`. Un fichier déjà appliqué n'est jamais rejoué.

Pour changer le schéma : ajouter `backend/src/migrations/003_xxx.sql` (idempotent de préférence). Ne jamais modifier un fichier déjà appliqué en production. Les migrations ne sont pas réversibles automatiquement : prévoir un script de retour dans le message de commit ou le runbook.

## Tables

| Table | Contenu |
|---|---|
| `users` | Comptes. `user_type` (expediteur, gp, admin), `status`, `admin_role_id`, `token_version` (révocation des sessions). |
| `expediteur_profiles` | Profil expéditeur, `total_spent`. |
| `gp_profiles` | Profil GP : KYC, note, `scan_review_pending` (verrou de fin de voyage). |
| `trips` | Trajets des GP : villes, dates, poids disponible, `current_packages`, statut. |
| `missions` | Colis : trajet, GP, expéditeur, destinataire, prix (`offered_price`, `final_price`), jetons QR, statut. |
| `mission_tracking` | Historique des positions GPS et des étapes. |
| `payments` | Paiements : fournisseur, montant, statut, `credited_at` (GP déjà crédité). |
| `wallet_balances` | Solde disponible et gains du GP. |
| `withdrawals` | Demandes de retrait. |
| `claims`, `claim_messages` | Réclamations et leur fil de discussion. |
| `reviews` | Avis. |
| `notifications`, `push_subscriptions` | Notifications et abonnements Web Push. |
| `admin_role` | Rôles d'administration et permissions (JSONB). |
| `admin_logs` | Journal d'audit des actions d'administration. |
| `platform_setting` | Réglages clé/valeur modifiables par l'admin. |
| `schema_migrations` | Migrations numérotées déjà appliquées. |

## Types énumérés

| Type | Valeurs |
|---|---|
| `user_type` | expediteur, gp, admin |
| `user_status` | pending, verified, suspended, deleted |
| `trip_status` | draft, published, active, completed, cancelled |
| `mission_status` | pending, matched, accepted, picked_up, in_transit, in_customs, out_for_delivery, delivered, cancelled, disputed |
| `payment_method` | wave, orange_money, free_money, card, bank_transfer |
| `payment_status` | pending, processing, completed, failed, refunded, cancelled |
| `withdrawal_status` | pending, approved, processing, completed, rejected, cancelled |
| `claim_status` | open, in_progress, resolved, rejected, closed |
| `claim_type` | damaged_package, lost_package, delayed_delivery, wrong_delivery, tracking_issue, payment_issue, other |

(Liste complète : `001_initial_schema.sql`.)

## Garde-fous d'intégrité financière

- **Un seul paiement terminé par mission** : index unique partiel `uniq_completed_mission_payment` sur `payments`.
- **Un seul crédit au GP par paiement** : `payments.credited_at` est posé par un `UPDATE … WHERE credited_at IS NULL RETURNING`, dans la même transaction que le crédit du portefeuille.
- **Verrous de ligne** : `missions … FOR UPDATE` à la livraison, au paiement et à l'acceptation.
- **Remboursement** refusé une fois le GP crédité.
- **Webhooks idempotents** : un événement rejoué ne crédite pas deux fois ; le montant reçu doit correspondre au paiement.

## Rôles d'administration (RBAC)

Six rôles système (`admin_role.is_system`), resynchronisés à chaque démarrage : `super_admin` (`*`), `operations`, `finance`, `support`, `verification`, `analyst`. Une permission a la forme `domaine:action` (`missions:assign`, `payments:refund`…). Les routes `/admin/*` exigent la permission correspondante (`utils/permissions.ts`).

## Transactions

Utiliser `withTransaction(async client => …)` (`utils/transaction.ts`) : COMMIT si la fonction réussit, ROLLBACK et relance sinon, libération du client dans tous les cas. Une partie du code utilise encore `BEGIN/COMMIT` à la main (voir `docs/tech-debt.md`).

## Connexion

Choix par ordre de priorité (`config/database.ts`) : variables `RDS_*`, puis `DATABASE_URL`, puis `DB_*`. Le pool est de 20 connexions. Voir `docs/environment.md`.

## Sauvegardes

La base de production est sur RDS : les sauvegardes automatiques et leur durée de rétention se règlent dans la console AWS (non gérées par le code). Avant toute migration risquée, prendre un instantané manuel.
