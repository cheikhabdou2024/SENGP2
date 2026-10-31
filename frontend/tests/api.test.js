'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../api.js');

const BASE = 'https://api.example.test/api/v1';

function fakeWindow({ status, page = 'dashgp.html', token = 'tok-1', ownSession = false }) {
  const store = { authToken: token, userData: '{"id":1}', other: 'keep' };
  const events = [];
  const win = {
    API_BASE_URL: BASE,
    SENGP_OWN_SESSION: ownSession,
    location: { pathname: '/' + page, replaced: null, replace(url) { this.replaced = url; } },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      removeItem: k => { delete store[k]; },
    },
    CustomEvent: class { constructor(type) { this.type = type; } },
    dispatchEvent: e => events.push(e.type),
    fetch: async () => ({ status }),
  };
  return { win, store, events };
}

const authed = { headers: { Authorization: 'Bearer tok-1' } };

test('esc echappe les 5 caracteres dangereux, texte et attributs', () => {
  assert.equal(api.esc(`<img src=x onerror="a()">'&`), '&lt;img src=x onerror=&quot;a()&quot;&gt;&#39;&amp;');
  assert.equal(api.esc(null), '');
  assert.equal(api.esc(undefined), '');
  assert.equal(api.esc(0), '0');
});

test('install expose sengpEsc', () => {
  const { win } = fakeWindow({ status: 200 });
  api.install(win);
  assert.equal(win.sengpEsc('<'), '&lt;');
});

test('401 sur un appel authentifie : session effacee et redirection', async () => {
  const { win, store, events } = fakeWindow({ status: 401 });
  api.install(win);
  const res = await win.fetch(`${BASE}/missions/my-missions`, authed);
  assert.equal(res.status, 401, 'la reponse est rendue telle quelle a la page');
  assert.equal(store.authToken, undefined);
  assert.equal(store.userData, undefined);
  assert.equal(store.other, 'keep');
  assert.equal(win.location.replaced, 'connexion.html?expired=1');
  assert.deepEqual(events, ['sengp:session-expired']);
});

test('401 sur /auth/login (mauvais mot de passe) : rien ne change', async () => {
  const { win, store } = fakeWindow({ status: 401 });
  api.install(win);
  await win.fetch(`${BASE}/auth/login`, authed);
  assert.equal(store.authToken, 'tok-1');
  assert.equal(win.location.replaced, null);
});

test('401 sans jeton envoye : rien ne change', async () => {
  const { win, store } = fakeWindow({ status: 401 });
  api.install(win);
  await win.fetch(`${BASE}/public/stats`);
  assert.equal(store.authToken, 'tok-1');
  assert.equal(win.location.replaced, null);
});

test('401 venant d\'une autre origine : ignore', async () => {
  const { win, store } = fakeWindow({ status: 401 });
  api.install(win);
  await win.fetch('https://autre.example/api', authed);
  assert.equal(store.authToken, 'tok-1');
});

test('401 perimee (un jeton plus recent est stocke) : session conservee', async () => {
  const { win, store } = fakeWindow({ status: 401, token: 'tok-NEW' });
  api.install(win);
  await win.fetch(`${BASE}/missions`, authed);
  assert.equal(store.authToken, 'tok-NEW');
  assert.equal(win.location.replaced, null);
});

test('page publique : session effacee mais pas de redirection', async () => {
  const { win, store } = fakeWindow({ status: 401, page: 'connexion.html' });
  api.install(win);
  await win.fetch(`${BASE}/users/profile`, authed);
  assert.equal(store.authToken, undefined);
  assert.equal(win.location.replaced, null);
});

test('page qui gere sa propre session : evenement seulement', async () => {
  const { win, store, events } = fakeWindow({ status: 401, page: 'admin.html', ownSession: true });
  api.install(win);
  await win.fetch(`${BASE}/admin/users`, authed);
  assert.equal(store.authToken, 'tok-1');
  assert.equal(win.location.replaced, null);
  assert.deepEqual(events, ['sengp:session-expired']);
});

test('reponses non-401 : aucun effet', async () => {
  for (const status of [200, 403, 500]) {
    const { win, store } = fakeWindow({ status });
    api.install(win);
    await win.fetch(`${BASE}/missions`, authed);
    assert.equal(store.authToken, 'tok-1');
    assert.equal(win.location.replaced, null);
  }
});

test('bearerSent lit un objet, des paires, un Headers et un Request', () => {
  assert.equal(api.bearerSent('u', { headers: { authorization: 'Bearer a' } }), 'a');
  assert.equal(api.bearerSent('u', { headers: [['Authorization', 'Bearer b']] }), 'b');
  assert.equal(api.bearerSent('u', { headers: new Headers({ Authorization: 'Bearer c' }) }), 'c');
  assert.equal(api.bearerSent({ url: 'u', headers: new Headers({ Authorization: 'Bearer d' }) }), 'd');
  assert.equal(api.bearerSent('u', {}), null);
});

test('install est idempotent', () => {
  const { win } = fakeWindow({ status: 200 });
  api.install(win);
  const wrapped = win.fetch;
  api.install(win);
  assert.equal(win.fetch, wrapped);
});
