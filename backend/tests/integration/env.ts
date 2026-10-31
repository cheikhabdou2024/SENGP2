/**
 * Exécuté avant tout import de l'application. Redirige l'appli vers la base de test
 * et refuse de démarrer si la cible n'est pas explicitement une base `_test`.
 */
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    'TEST_DATABASE_URL est requis pour les tests d\'intégration (ex. postgres://user:pw@localhost:5432/sengp_test).'
  );
}

const dbName = new URL(url).pathname.replace(/^\//, '');
if (!/_test$/.test(dbName)) {
  throw new Error(
    `Refus d'exécuter les tests d'intégration sur la base "${dbName}" : le nom doit se terminer par "_test".`
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
// Un RDS_HOSTNAME hérité de l'environnement prendrait le pas sur DATABASE_URL.
process.env.RDS_HOSTNAME = '';
process.env.JWT_SECRET = 'integration-test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.WAVE_API_SECRET = 'whsec_integration_test';
process.env.RATE_LIMIT_MAX_REQUESTS = '100000';
process.env.RATE_LIMIT_AUTH_MAX = '100000';
