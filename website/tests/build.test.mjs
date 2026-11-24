import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = path.join(import.meta.dirname, '..');
const DIST = fs.mkdtempSync(path.join(os.tmpdir(), 'sengp-site-'));
const LANGS = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8')).site.languages;
const PAGES = ['', 'comment-ca-marche/', 'destinations/', 'a-propos/', 'faq/', 'contact/'];
const LEGAL = ['mentions-legales/', 'confidentialite/', 'conditions/'];
const read = (...p) => fs.readFileSync(path.join(DIST, ...p), 'utf8');

before(() => {
  execFileSync(process.execPath, ['build.mjs'], { cwd: ROOT, env: { ...process.env, SITE_DIST: DIST }, stdio: 'pipe' });
});

test('chaque page existe dans les 5 langues, avec la bonne langue et le bon sens d\'ecriture', () => {
  for (const l of LANGS) for (const p of PAGES) {
    const html = read(l === 'fr' ? '' : l, p, 'index.html');
    assert.ok(html.includes(`<html lang="${l}" dir="${l === 'ar' ? 'rtl' : 'ltr'}">`), `${l}/${p}`);
    assert.equal(html.includes('/css/rtl.css'), l === 'ar', `${l}/${p} rtl.css`);
  }
});

test('hreflang : toutes les variantes + x-default, canonical sur soi-meme, reciproque', () => {
  for (const p of PAGES) {
    const urls = Object.fromEntries(LANGS.map(l => [l, `https://www.sengp.co${l === 'fr' ? '' : '/' + l}/${p}`]));
    for (const l of LANGS) {
      const html = read(l === 'fr' ? '' : l, p, 'index.html');
      assert.ok(html.includes(`<link rel="canonical" href="${urls[l]}">`), `canonical ${l}/${p}`);
      for (const m of LANGS) assert.ok(html.includes(`<link rel="alternate" hreflang="${m}" href="${urls[m]}">`), `hreflang ${m} dans ${l}/${p}`);
      assert.ok(html.includes(`hreflang="x-default" href="${urls.fr}"`), `x-default ${l}/${p}`);
    }
  }
});

test('les pages juridiques n\'existent qu\'en francais, sans hreflang', () => {
  for (const p of LEGAL) {
    assert.ok(fs.existsSync(path.join(DIST, p, 'index.html')));
    assert.ok(!/rel="alternate"/.test(read(p, 'index.html')));
    for (const l of LANGS.slice(1)) assert.ok(!fs.existsSync(path.join(DIST, l, p)), `${l}/${p}`);
  }
});

test('les liens internes restent dans la langue ; les textes juridiques pointent vers le francais', () => {
  for (const l of LANGS.slice(1)) {
    const html = read(l, 'index.html');
    assert.ok(html.includes(`href="/${l}/faq/"`) && html.includes(`href="/${l}/"`));
    assert.ok(!/href="\/(faq|destinations|contact|a-propos|comment-ca-marche)\//.test(html), `lien non localise dans ${l}`);
    assert.ok(/href="\/conditions\/"[^>]*hreflang="fr"/.test(html), `lien juridique ${l}`);
    assert.ok(html.includes('data-lang="fr"') && html.includes(`data-lang="${l}"`), 'menu de langue');
  }
});

test('aucun texte francais restant dans les pages traduites (hors noms propres)', () => {
  const FR = /\b(Comment ça marche|Questions fréquentes|Envoyer un colis|Ouvrir l'application|Découvrir|Tous droits réservés)\b/;
  for (const l of LANGS.slice(1)) for (const p of PAGES) {
    const text = read(l, p, 'index.html').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<div class="draft-bar"[\s\S]*?<\/div>/g, '');
    assert.ok(!FR.test(text), `${l}/${p} : ${FR.exec(text)?.[0]}`);
  }
});

test('aucun marqueur interne ne reste dans le HTML', () => {
  for (const l of LANGS) for (const p of PAGES) {
    const html = read(l === 'fr' ? '' : l, p, 'index.html');
    assert.ok(!/data-no-i18n|data-i18n-split/.test(html), `${l}/${p}`);
    assert.ok(!/<\/?(a|b|i|em|strong|span|small|br|sup|sub)\d+\/?>/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, '')), `balise numerotee dans ${l}/${p}`);
  }
});

// ---- choix de la langue (src/js/lang.js)
function run({ lang = 'fr', languages = ['fr-FR'], tz = 'Europe/Paris', saved = null, ua = 'Mozilla/5.0', nav = 'navigate', webdriver = false }) {
  const calls = { replaced: null, stored: {} };
  const links = Object.fromEntries(LANGS.map(l => [l, l === 'fr' ? '/faq/' : `/${l}/faq/`]));
  const listeners = {};
  const ctx = {
    document: {
      documentElement: { lang },
      querySelector: sel => { const m = /hreflang="(\w+)"/.exec(sel); return m && links[m[1]] ? { getAttribute: () => 'https://www.sengp.co' + links[m[1]] } : null; },
      addEventListener: (t, fn) => { listeners[t] = fn; },
    },
    navigator: { languages, language: languages[0], userAgent: ua, webdriver },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) },
    performance: { getEntriesByType: () => [{ type: nav }] },
    localStorage: { getItem: () => saved, setItem: (k, v) => { calls.stored[k] = v; } },
    location: { replace: u => { calls.replaced = u; }, search: '', hash: '' },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/js/lang.js'), 'utf8'), ctx);
  return { calls, listeners };
}

test('langue : appareil en anglais -> page anglaise, choix memorise', () => {
  const { calls } = run({ languages: ['en-US', 'fr'] });
  assert.equal(calls.replaced, '/en/faq/');
  assert.equal(calls.stored['sengp.site.lang'], 'en');
});
test('langue : langue non geree -> pays du fuseau horaire ; sinon anglais', () => {
  assert.equal(run({ languages: ['sv-SE'], tz: 'Asia/Dubai' }).calls.replaced, '/ar/faq/');
  assert.equal(run({ languages: ['sv-SE'], tz: 'America/Sao_Paulo' }).calls.replaced, '/pt/faq/');
  assert.equal(run({ languages: ['sv-SE'], tz: 'Africa/Dakar' }).calls.replaced, null);
  assert.equal(run({ languages: ['sv-SE'], tz: 'Asia/Tokyo' }).calls.replaced, '/ja/faq/');
  assert.equal(run({ languages: ['sv-SE'], tz: 'Asia/Bangkok' }).calls.replaced, '/en/faq/');
  assert.equal(run({ languages: ['zh-CN'] }).calls.replaced, '/zh/faq/');
});
test('langue : choix memorise prioritaire ; francais choisi -> pas de redirection', () => {
  assert.equal(run({ languages: ['en'], saved: 'fr' }).calls.replaced, null);
  assert.equal(run({ languages: ['fr'], saved: 'es' }).calls.replaced, '/es/faq/');
});
test('langue : jamais de redirection depuis une page deja localisee, au retour arriere, ni pour un robot', () => {
  assert.equal(run({ lang: 'en', languages: ['es'] }).calls.replaced, null);
  assert.equal(run({ languages: ['en'], nav: 'back_forward' }).calls.replaced, null);
  assert.equal(run({ languages: ['en'], ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }).calls.replaced, null);
  assert.equal(run({ languages: ['en'], webdriver: true }).calls.replaced, null);
});
test('langue : un clic sur le menu memorise la langue choisie', () => {
  const { calls, listeners } = run({ lang: 'en', languages: ['en'] });
  listeners.click({ target: { closest: () => ({ getAttribute: () => 'pt' }) } });
  assert.equal(calls.stored['sengp.site.lang'], 'pt');
});
