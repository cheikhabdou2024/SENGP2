# Runbook d'exploitation

Production : API sur AWS App Runner (`sengp-backend`), base RDS PostgreSQL (`sengp-db`),
fichiers sur S3 (`sengp-uploads`), images dans ECR, build par CodeBuild (`sengp-build`).
Application web (PWA) sur Vercel (projet `sengp`), site vitrine sur Vercel (`sengp-site`).

Les identifiants AWS ne sont jamais dans le dépôt : ils sont fournis par l'environnement du poste.

## Sondes de santé

| URL | Rôle | Si KO |
|---|---|---|
| `/health` | l'instance répond (sans dépendance) | App Runner redémarre l'instance |
| `/health/ready` | la base de données répond (200 ou 503) | vérifier RDS, groupes de sécurité, identifiants |

## Déployer le backend

```bash
scripts/deploy-backend.sh
```

Le script lance les tests (type-check + unitaires), envoie les sources sur S3, déclenche CodeBuild,
demande à App Runner de redéployer, attend l'état `RUNNING` puis appelle `/health` et `/health/ready`.
Au démarrage, une instance prend un verrou PostgreSQL, applique le schéma de base, les correctifs
idempotents et les migrations numérotées (`src/migrations/NNN_nom.sql`, à partir de 003), puis libère
le verrou. Une migration en échec est annulée et le démarrage s'arrête : App Runner conserve alors
la version précédente en service.

### Ajouter une migration

Créer `backend/src/migrations/003_description.sql`. Chaque fichier s'exécute une seule fois, dans une
transaction. Écrire du SQL rejouable quand c'est possible (`IF NOT EXISTS`). Ne jamais modifier un
fichier déjà déployé : en créer un nouveau.

## Revenir en arrière

```bash
scripts/rollback-backend.sh            # liste les images disponibles (build-<n>)
scripts/rollback-backend.sh build-42   # remet cette image en service
```

Chaque build est conservé sous un tag immuable `build-<numéro>` (voir `backend/buildspec.yml`).
Prérequis (une seule fois) : appliquer le buildspec au projet CodeBuild avec
`scripts/apply-buildspec.sh`. Avant cela, seul le tag `latest` existe et aucun retour arrière n'est possible.

Un retour arrière ne défait pas les migrations déjà appliquées. Les migrations doivent donc rester
compatibles avec la version précédente du code (ajouter des colonnes, ne pas supprimer ni renommer
dans le même déploiement).

## Déployer le frontend

Vercel construit à chaque push sur la branche. Pour promouvoir une prévisualisation en production :

```bash
vercel ls --scope nii-peur-s-projects
vercel redeploy <url-de-previsualisation> --environment production --scope nii-peur-s-projects
```

Retour arrière : `vercel rollback` ou redéployer la prévisualisation précédente.

## Incidents courants

- **L'API répond 5xx après un déploiement** : lire les journaux CloudWatch du service
  (`/aws/apprunner/sengp-backend/.../application`), puis `scripts/rollback-backend.sh`.
- **Les paiements Wave ne se règlent plus** : les webhooks en échec renvoient 500 et Wave réessaie.
  Chercher « Webhook wave » dans les journaux. Un règlement rejoué est sans effet (idempotent).
- **Un utilisateur est déconnecté partout** : normal après changement de mot de passe, suspension,
  suppression ou changement de rôle (`users.token_version`).
- **Navigateur bloqué par CORS** : l'origine n'est pas dans la liste (`backend/src/config/cors.ts`)
  ni dans la variable `FRONTEND_URL` d'App Runner.

## Secrets à faire tourner (actions du propriétaire)

`ADMIN_BOOTSTRAP_SECRET` (en priorité), `JWT_SECRET` (déconnecte tout le monde), mot de passe RDS,
clés Wave et Orange Money. Après changement dans App Runner, redéployer.
