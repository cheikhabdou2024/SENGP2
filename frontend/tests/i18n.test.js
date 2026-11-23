'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const i18n = require('../i18n.js');

const LOCALES_DIR = path.resolve(__dirname, '..', 'locales');
const dict = Object.fromEntries(i18n.SUPPORTED.map(l => [l, JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, l + '.json'), 'utf8'))]));

// ---- fausse fenetre / faux DOM minimal ----
function fakeEl(attrs) {
  const a = { ...attrs };
  return { textContent: 'ORIGINAL', getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = v; }, attrs: a };
}
function fakeWindow({ languages = ['fr'], timeZone, saved = null } = {}) {
  const store = saved ? { sengpLang: saved } : {};
  const events = [];
  const html = fakeEl({});
  const nodes = [];
  const win = {
    navigator: { languages },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    document: { readyState: 'complete', documentElement: html, querySelectorAll: sel => (sel.includes('data-i18n-switcher') ? [] : nodes) },
    dispatchEvent: e => events.push(e.type),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
  };
  const fetchJson = url => {
    const lang = /(\w+)\.json$/.exec(url)[1];
    return dict[lang] ? Promise.resolve(structuredClone(dict[lang])) : Promise.reject(new Error('404'));
  };
  return { win, store, events, html, nodes, fetchJson, tz: timeZone };
}
function make(opts) {
  const f = fakeWindow(opts);
  // le fuseau est lu via Intl : on le simule en surchargeant resolveLanguage via detect()
  const inst = i18n.createI18n(f.win, { fetchJson: f.fetchJson });
  if (opts && opts.timeZone) {
    const real = inst.detect;
    inst.detect = () => i18n.resolveLanguage({ saved: f.store.sengpLang, languages: f.win.navigator.languages, timeZone: opts.timeZone });
    void real;
  }
  return { ...f, inst };
}

// ---- choix de la langue ----
test('resolveLanguage : choix memorise > langue de l\'appareil > pays > anglais', () => {
  const r = i18n.resolveLanguage;
  assert.equal(r({ saved: 'ar', languages: ['fr-FR'], timeZone: 'Europe/Paris' }), 'ar');
  assert.equal(r({ saved: 'xx', languages: ['pt-BR'] }), 'pt');
  assert.equal(r({ languages: ['fr-SN'] }), 'fr');
  assert.equal(r({ languages: ['ar-MA', 'fr'] }), 'ar');
  assert.equal(r({ languages: ['EN_us'] }), 'en');
  assert.equal(r({ languages: ['de-DE', 'es-MX'] }), 'es', 'premiere langue prise en charge de la liste');
  assert.equal(r({ languages: ['de-DE'], timeZone: 'Europe/Madrid' }), 'es', 'appareil non pris en charge : pays');
  assert.equal(r({ languages: ['wo'], timeZone: 'Africa/Dakar' }), 'fr');
  assert.equal(r({ languages: ['zh-CN'], timeZone: 'Asia/Shanghai' }), 'en');
  assert.equal(r({}), 'en');
});

test('countryOfTimeZone : fuseaux connus et inconnus', () => {
  assert.equal(i18n.countryOfTimeZone('Africa/Dakar'), 'SN');
  assert.equal(i18n.countryOfTimeZone('America/Sao_Paulo'), 'BR');
  assert.equal(i18n.countryOfTimeZone('Asia/Tokyo'), null);
  assert.equal(i18n.countryOfTimeZone(undefined), null);
});

test('chaque pays de la table pointe vers une langue prise en charge et un fuseau unique', () => {
  const seen = new Set();
  for (const [iso, [lang, zones]] of Object.entries(i18n.COUNTRIES)) {
    assert.ok(i18n.SUPPORTED.includes(lang), `${iso} : langue ${lang}`);
    for (const z of zones) { assert.ok(!seen.has(z), `fuseau en double : ${z}`); seen.add(z); }
  }
});

test('direction : seul l\'arabe est de droite a gauche', () => {
  assert.equal(i18n.direction('ar'), 'rtl');
  for (const l of ['fr', 'en', 'es', 'pt']) assert.equal(i18n.direction(l), 'ltr');
});

// ---- traduction ----
test('init : langue de l\'appareil, lang/dir sur <html>, textes traduits', async () => {
  const { inst, html } = make({ languages: ['ar-MA'] });
  assert.equal(await inst.init(), 'ar');
  assert.equal(html.attrs.lang, 'ar');
  assert.equal(html.attrs.dir, 'rtl');
  assert.equal(inst.t('common.cancel'), 'إلغاء');
});

test('t : interpolation, cle absente => anglais puis francais puis la cle', async () => {
  const { inst } = make({ languages: ['es'] });
  await inst.init();
  assert.match(inst.t('errors.expediteur_only', { type: 'GP' }), /«GP»/);
  assert.equal(inst.t('errors.expediteur_only', {}).includes('{type}'), true, 'variable absente laissee telle quelle');
  inst._dictionaries.es['only.in.en'] = undefined;
  inst._dictionaries.en['only.in.en'] = 'English only';
  inst._dictionaries.fr['only.in.fr'] = 'Seulement fr';
  assert.equal(inst.t('only.in.en'), 'English only');
  assert.equal(inst.t('only.in.fr'), 'Seulement fr');
  assert.equal(inst.t('nope.nope'), 'nope.nope');
  assert.deepEqual(inst.missing, ['nope.nope']);
});

test('t : pluriels (fr, en, ar a six formes)', async () => {
  const cases = {
    fr: { 0: '0 envoi', 1: '1 envoi', 2: '2 envois' },
    en: { 0: '0 shipments', 1: '1 shipment', 5: '5 shipments' },
    ar: { 0: 'لا توجد شحنات', 1: 'شحنة واحدة', 2: 'شحنتان', 3: '3 شحنات', 11: '11 شحنة', 100: '100 شحنة' },
  };
  for (const [lang, rows] of Object.entries(cases)) {
    const { inst } = make({ languages: [lang] });
    await inst.init();
    for (const [n, expected] of Object.entries(rows)) {
      assert.equal(inst.t('mission.count', { count: Number(n) }), expected, `${lang} ${n}`);
    }
  }
});

test('setLanguage : memorise, change lang/dir, emet l\'evenement, refuse une langue inconnue', async () => {
  const { inst, store, events, html } = make({ languages: ['fr'] });
  await inst.init();
  await inst.setLanguage('pt');
  assert.equal(store.sengpLang, 'pt');
  assert.equal(html.attrs.lang, 'pt');
  assert.equal(inst.t('common.back'), 'Voltar');
  assert.ok(events.includes('sengp:languagechange'));
  await assert.rejects(() => inst.setLanguage('de'));
  assert.equal(store.sengpLang, 'pt');
});

test('un choix memorise l\'emporte au demarrage suivant', async () => {
  const { inst } = make({ languages: ['fr'], saved: 'en' });
  assert.equal(await inst.init(), 'en');
});

test('hors ligne : dictionnaires introuvables => le texte de la page est conserve', async () => {
  const f = fakeWindow({ languages: ['en'] });
  const inst = i18n.createI18n(f.win, { fetchJson: () => Promise.reject(new Error('offline')) });
  const el = fakeEl({ 'data-i18n': 'common.cancel', 'data-i18n-attr': 'title:common.close' });
  f.nodes.push(el);
  await inst.init();
  assert.equal(el.textContent, 'ORIGINAL');
  assert.equal(el.attrs.title, undefined);
});

test('applyDom : data-i18n et data-i18n-attr, texte seulement (jamais de HTML)', async () => {
  const f = make({ languages: ['en'] });
  const a = fakeEl({ 'data-i18n': 'common.cancel' });
  const b = fakeEl({ 'data-i18n-attr': 'placeholder:common.search; title : common.close' });
  const c = fakeEl({ 'data-i18n': 'cle.inconnue' });
  f.nodes.push(a, b, c);
  await f.inst.init();
  assert.equal(a.textContent, 'Cancel');
  assert.equal(b.attrs.placeholder, 'Search');
  assert.equal(b.attrs.title, 'Close');
  assert.equal(c.textContent, 'ORIGINAL', 'cle inconnue : texte de la page conserve');
});

// ---- formats ----
test('formats : chiffres latins dans toutes les langues, FCFA conserve', async () => {
  for (const lang of i18n.SUPPORTED) {
    const { inst } = make({ languages: [lang] });
    await inst.init();
    const out = inst.fmt.currency(1234567);
    assert.match(out, /^[\d\s.,  ٬]+FCFA$/, `${lang} : ${out}`);
    assert.ok(/1.?234.?567/.test(out), `${lang} : ${out}`);
    assert.ok(/[0-9]/.test(inst.fmt.date('2026-11-23T10:00:00Z')), `${lang} : date`);
  }
  const { inst } = make({ languages: ['fr'] });
  await inst.init();
  assert.equal(inst.fmt.date('pas une date'), '');
  assert.equal(inst.fmt.number(undefined), '0');
});

// ---- fichiers de langue ----
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const baseKey = k => k.replace(/\.(zero|one|two|few|many|other)$/, '');

test('locales : toutes les valeurs sont des textes non vides, sans balise HTML', () => {
  for (const [lang, d] of Object.entries(dict)) {
    for (const [k, v] of Object.entries(d)) {
      assert.equal(typeof v, 'string', `${lang}:${k}`);
      assert.ok(v.trim().length > 0, `${lang}:${k} vide`);
      assert.ok(!/[<>]/.test(v), `${lang}:${k} contient du HTML`);
    }
  }
});

test('locales : les cinq langues ont les memes cles, hors formes de pluriel propres a chaque langue', () => {
  const groups = d => new Set(Object.keys(d).map(baseKey));
  const ref = groups(dict.fr);
  for (const lang of i18n.SUPPORTED) {
    const g = groups(dict[lang]);
    assert.deepEqual([...ref].filter(k => !g.has(k)), [], `${lang} : cles manquantes`);
    assert.deepEqual([...g].filter(k => !ref.has(k)), [], `${lang} : cles en trop`);
  }
});

test('locales : chaque pluriel couvre toutes les formes que la langue utilise (0 a 200)', () => {
  for (const lang of i18n.SUPPORTED) {
    const rules = new Intl.PluralRules(i18n.LOCALE_TAGS[lang]);
    const needed = new Set();
    for (let n = 0; n <= 200; n++) needed.add(rules.select(n));
    const pluralBases = new Set(Object.keys(dict.fr).filter(k => /\.(one|other)$/.test(k)).map(baseKey));
    for (const base of pluralBases) {
      for (const cat of needed) {
        assert.ok(`${base}.${cat}` in dict[lang] || `${base}.other` in dict[lang], `${lang} : ${base}.${cat}`);
      }
      assert.ok(`${base}.other` in dict[lang], `${lang} : ${base}.other obligatoire`);
    }
  }
  // l'arabe distingue vraiment six formes : on exige qu'elles soient toutes ecrites
  for (const cat of ['zero', 'one', 'two', 'few', 'many', 'other']) assert.ok(`mission.count.${cat}` in dict.ar, `ar : ${cat}`);
});

test('locales : variables {x} identiques (formes de pluriel : seulement des variables connues)', () => {
  const isPlural = k => /\.(zero|one|two|few|many|other)$/.test(k);
  const names = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  for (const lang of i18n.SUPPORTED) {
    for (const [k, v] of Object.entries(dict[lang])) {
      if (isPlural(k)) {
        const source = dict.fr[baseKey(k) + '.other'];
        for (const n of names(v)) assert.ok(names(source).includes(n), `${lang}:${k} variable inconnue {${n}}`);
      } else {
        assert.equal(placeholders(v), placeholders(dict.fr[k]), `${lang}:${k}`);
      }
    }
  }
  assert.equal(placeholders(dict.ar['errors.expediteur_only']), 'type');
});

test('locales : les statuts de mission couvrent toute l\'enumeration de la base', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'backend', 'src', 'migrations', '001_initial_schema.sql'), 'utf8');
  const m = /CREATE TYPE mission_status AS ENUM \(([^)]*)\)/.exec(sql);
  assert.ok(m, 'enumeration mission_status introuvable');
  const statuses = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
  assert.ok(statuses.length >= 10);
  for (const lang of i18n.SUPPORTED) {
    for (const s of statuses) assert.ok(`mission.status.${s}` in dict[lang], `${lang} : statut ${s}`);
  }
});

// ---- phrases avec elements integres + selecteur automatique ----
class FNode {
  constructor(tag, attrs = {}) { this.tag = tag; this.attrs = { ...attrs }; this.kids = []; this._text = ''; }
  get children() { return this.kids.filter(k => k instanceof FNode); }
  get textContent() { return this.kids.length ? this.kids.map(k => (k instanceof FNode ? k.textContent : k.text)).join('') : this._text; }
  set textContent(v) { this.kids = []; this._text = v; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(n) { this._text = ''; this.kids.push(n); return n; }
  addEventListener() {}
}

test('data-i18n-rich : l\'ordre des mots change, les liens restent les memes elements', async () => {
  const f = fakeWindow({ languages: ['en'] });
  f.win.document.createTextNode = text => ({ text });
  f.win.document.createElement = tag => new FNode(tag);
  const terms = new FNode('a', { 'data-slot': 'terms', 'data-i18n': 'legal.terms' });
  terms.textContent = 'conditions';
  const privacy = new FNode('a', { 'data-slot': 'privacy', 'data-i18n': 'legal.privacy' });
  privacy.textContent = 'confidentialité';
  const label = new FNode('label', { 'data-i18n-rich': 'signup.terms' });
  label.appendChild({ text: "J'accepte les " }); label.appendChild(terms); label.appendChild({ text: ' et la ' }); label.appendChild(privacy);
  f.nodes.push(label, terms, privacy);

  const inst = i18n.createI18n(f.win, { fetchJson: () => Promise.resolve({
    'signup.terms': 'I agree to the {terms} and the {privacy}', 'legal.terms': 'Terms of use', 'legal.privacy': 'Privacy policy',
  }) });
  await inst.init();
  assert.equal(label.textContent, 'I agree to the Terms of use and the Privacy policy');
  assert.deepEqual(label.children, [terms, privacy], 'memes elements, memes ecouteurs');

  await inst.setLanguage('en'); // second passage : les enfants sont retrouves
  assert.equal(label.textContent, 'I agree to the Terms of use and the Privacy policy');
});

test('selecteur de langue : monte une seule fois dans [data-i18n-switcher], change la langue', async () => {
  const f = fakeWindow({ languages: ['fr'] });
  const host = new FNode('div', { 'data-i18n-switcher': '' });
  f.win.document.createElement = tag => new FNode(tag);
  f.win.document.querySelectorAll = sel => (sel === '[data-i18n-switcher]' ? [host] : []);
  const inst = i18n.createI18n(f.win, { fetchJson: url => Promise.resolve(dict[/(\w+)\.json$/.exec(url)[1]]) });
  await inst.init();
  await inst.setLanguage('es');
  assert.equal(host.children.length, 1, 'un seul selecteur malgre deux chargements');
  const select = host.children[0];
  assert.deepEqual(select.children.map(o => o.value), ['fr', 'en', 'ar', 'es', 'pt']);
  assert.deepEqual(select.children.map(o => o.textContent), ['Français', 'English', 'العربية', 'Español', 'Português']);
});

test('l\'instance expose les langues et leurs noms (feuille « Langue » du profil)', () => {
  const { inst } = make({ languages: ['fr'] });
  assert.deepEqual(inst.supported, ['fr', 'en', 'ar', 'es', 'pt']);
  assert.equal(inst.nativeNames.ar, 'العربية');
  assert.equal(inst.fmt.localeTag(), 'fr-FR');
});
