import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, serialize, mapAttrs, getAttr, setAttr } from '../lib/html.mjs';
import { localizeHtml, collectSegments } from '../lib/localize.mjs';

const opts = (dict, extra = {}) => ({
  lang: 'en',
  translate: key => dict[key],
  localizable: new Set(['/', '/faq/']),
  fixed: new Set(['/conditions/']),
  ...extra,
});

test('parse puis serialize redonne exactement la source (toutes les pages)', () => {
  const dir = path.join(import.meta.dirname, '..', 'src');
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : /\.html$/.test(p) && files.push(p); } })(path.join(dir, 'pages'));
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : /\.html$/.test(p) && files.push(p); } })(path.join(dir, 'partials'));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8').replace(/^<!--meta[\s\S]*?-->\s*/, '').replace(/\{\{[^}]*\}\}/g, 'x');
    if (/<html|<head/.test(s)) continue; // gabarit complet : jetons dans les attributs
    assert.equal(serialize(parse(s)), s, f);
  }
});

test('balise mal fermee : erreur claire', () => {
  assert.throws(() => parse('<div><p>a</div>'), /inattendue/);
  assert.throws(() => parse('<div>'), /non ferm/);
});

test('attributs : lecture, remplacement, ajout', () => {
  const o = '<a href="/faq/" class="x" data-k=\'v\' hidden>';
  assert.equal(getAttr(o, 'href'), '/faq/');
  assert.equal(getAttr(o, 'hidden'), null);
  assert.equal(getAttr(o, 'nope'), undefined);
  assert.equal(mapAttrs(o, (n, v) => (n === 'href' ? '/en/faq/' : undefined)), '<a href="/en/faq/" class="x" data-k=\'v\' hidden>');
  assert.equal(setAttr('<a href="/x/">', 'hreflang', 'fr'), '<a href="/x/" hreflang="fr">');
});

test('traduit un bloc de texte et conserve ses balises et leurs attributs', () => {
  const html = '<p class="lead">Voir <a href="/faq/" class="u">la FAQ</a>, <b>sans frais</b>.</p>';
  const out = localizeHtml(html, opts({ 'Voir <a1>la FAQ</a1>, <b2>sans frais</b2>.': '<b2>Free</b2>: see <a1>the FAQ</a1>.' }));
  assert.equal(out, '<p class="lead"><b>Free</b>: see <a href="/en/faq/" class="u">the FAQ</a>.</p>');
});

test('segments independants entre elements de bloc, espaces de bord conserves', () => {
  const out = localizeHtml('<ul>\n  <li>Un</li>\n  <li> Deux </li>\n</ul>', opts({ Un: 'One', Deux: 'Two' }));
  assert.equal(out, '<ul>\n  <li>One</li>\n  <li> Two </li>\n</ul>');
});

test('une traduction manquante laisse le francais en place', () => {
  const html = '<p>Bonjour</p>';
  assert.equal(localizeHtml(html, opts({})), html);
});

test('le francais (langue source) ne change jamais', () => {
  const html = '<nav><a href="/">Accueil</a><a href="/faq/">FAQ</a></nav><p>Salut <b>toi</b></p>';
  assert.equal(localizeHtml(html, { lang: 'fr', translate: () => 'X', localizable: new Set(['/', '/faq/']) }), html);
});

test('attributs traduisables : alt, title, aria-label, meta description', () => {
  const html = '<head><meta name="description" content="Colis"><meta name="robots" content="Colis"></head><img src="/a.jpg" alt="Un avion" width="3"><button aria-label="Ouvrir">x</button>';
  const out = localizeHtml(html, opts({ Colis: 'Parcels', 'Un avion': 'A plane', Ouvrir: 'Open' }));
  assert.ok(out.includes('<meta name="description" content="Parcels">'));
  assert.ok(out.includes('<meta name="robots" content="Colis">'), 'robots n\'est pas traduit');
  assert.ok(out.includes('alt="A plane"') && out.includes('aria-label="Open"'));
});

test('liens : accueil, page localisee, page juridique (reste en francais), ancre, ressources', () => {
  const html = '<a href="/">A</a><a href="/faq/#q">B</a><a href="/conditions/">C</a><a href="#x">D</a><a href="/assets/a.pdf">E</a><a href="https://ex.test/faq/">F</a>';
  const out = localizeHtml(html, opts({}));
  assert.ok(out.includes('<a href="/en/">A</a>'));
  assert.ok(out.includes('<a href="/en/faq/#q">B</a>'));
  assert.ok(out.includes('<a href="/conditions/" hreflang="fr" lang="fr">C</a>'));
  assert.ok(out.includes('<a href="#x">D</a><a href="/assets/a.pdf">E</a><a href="https://ex.test/faq/">F</a>'));
});

test('data-no-i18n : ni texte ni liens retraduits, marqueur retire', () => {
  const html = '<div data-no-i18n><a href="/">Français</a></div><nav data-i18n-split><a href="/">Accueil</a><a href="/faq/">FAQ</a></nav>';
  const out = localizeHtml(html, opts({ '<a1>Accueil</a1>': '<a1>Home</a1>', '<a1>FAQ</a1>': '<a1>FAQ</a1>' }));
  assert.ok(out.startsWith('<div><a href="/">Français</a></div>'), out);
  assert.ok(out.includes('<nav><a href="/en/">Home</a><a href="/en/faq/">FAQ</a></nav>'), out);
});

test('traduction incoherente : balise manquante, en trop, mal imbriquee', () => {
  const html = '<p>A <b>x</b> <i>y</i></p>';
  const key = 'A <b1>x</b1> <i2>y</i2>';
  assert.throws(() => localizeHtml(html, opts({ [key]: 'A <b1>x</b1> y' })), /manquante/);
  assert.throws(() => localizeHtml(html, opts({ [key]: 'A <b1>x</b1> <i2>y</i2> <b3>z</b3>' })), /inconnue/);
  assert.throws(() => localizeHtml(html, opts({ [key]: '<b1>A <i2>x</b1> y</i2>' })), /imbriqu/);
});

test('les segments sans lettres ou a completer sont ignores ; extraction', () => {
  const html = '<p>12 345</p><p>[À COMPLÉTER : RCCM]</p><p>Vrai texte</p><svg><text>Dakar</text></svg>';
  const keys = collectSegments(html, opts({})).map(s => s.key);
  assert.deepEqual(keys, ['Vrai texte', 'Dakar']);
});

test('script et style ne sont jamais traduits', () => {
  const html = '<script>var a = "Bonjour";</script><style>.a{content:"Bonjour"}</style><p>Bonjour</p>';
  const out = localizeHtml(html, opts({ Bonjour: 'Hello' }));
  assert.equal(out, '<script>var a = "Bonjour";</script><style>.a{content:"Bonjour"}</style><p>Hello</p>');
});
