'use strict';
// Controles statiques sur les pages : pas de navigateur necessaire.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const scriptTags = html => [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
const srcOf = tag => (/\bsrc="([^"]+)"/.exec(tag) || [])[1];

test('chaque script local reference par une page existe', () => {
  for (const page of pages) {
    for (const tag of scriptTags(read(page))) {
      const src = srcOf(tag);
      if (!src || /^https?:/.test(src)) continue;
      assert.ok(fs.existsSync(path.join(root, src)), `${page} : ${src} introuvable`);
    }
  }
});

test('api.js est charge avant ui.js, geo.js et tout script de page', () => {
  for (const page of pages) {
    const srcs = scriptTags(read(page)).map(srcOf).filter(Boolean);
    const needsApi = srcs.includes('ui.js') || srcs.includes('geo.js') || /sengpEsc/.test(read(page));
    if (!needsApi) continue;
    const apiAt = srcs.indexOf('api.js');
    assert.ok(apiAt >= 0, `${page} : api.js manquant`);
    for (const dependent of ['ui.js', 'geo.js', 'config.js']) {
      const at = srcs.indexOf(dependent);
      if (at >= 0) assert.ok(apiAt < at, `${page} : api.js doit preceder ${dependent}`);
    }
  }
});

test('plus aucune copie locale de esc() : une seule definition, dans api.js', () => {
  const files = [...pages, ...fs.readdirSync(root).filter(f => f.endsWith('.js'))];
  for (const f of files) {
    if (f === 'api.js') continue;
    const src = read(f);
    const own = src.match(/(function\s+esc\s*\([^)]*\)\s*\{[^\n]*\}|const\s+esc\s*=\s*[^\n]+)/g) || [];
    for (const line of own) {
      assert.ok(/sengpEsc/.test(line), `${f} : definition locale de esc() : ${line.slice(0, 80)}`);
    }
  }
});

test('tout script charge depuis un CDN porte une empreinte SRI', () => {
  for (const page of pages) {
    for (const tag of scriptTags(read(page))) {
      const src = srcOf(tag);
      if (src && /^https?:/.test(src)) assert.match(tag, /integrity="sha384-/, `${page} : ${src} sans SRI`);
    }
  }
  // Chargement dynamique (jsQR) : integrity obligatoire a cote de l'URL.
  const dyn = read('alivrer.html');
  assert.match(dyn, /jsQR\.js';\s*s\.integrity = 'sha384-/);
});

test('vercel.json : en-tetes de securite presents et CSP en rapport seulement', () => {
  const cfg = JSON.parse(read('vercel.json'));
  const all = cfg.headers.find(h => h.source === '/(.*)');
  assert.ok(all, 'regle globale manquante');
  const keys = all.headers.map(h => h.key);
  for (const k of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options', 'Permissions-Policy', 'Content-Security-Policy-Report-Only']) {
    assert.ok(keys.includes(k), `${k} manquant`);
  }
  assert.ok(!keys.includes('Content-Security-Policy'), 'la CSP ne doit pas etre appliquee tant que les scripts inline existent');
});

test('le service worker est versionne au build', () => {
  const sw = read('sw.js');
  assert.match(sw, /const CACHE_NAME = 'sengp-__BUILD_ID__';/);
  assert.ok(!/sengp-v\d+/.test(sw), 'ancien nom de cache fixe');
  assert.match(sw, /'api\.js'/);
});
