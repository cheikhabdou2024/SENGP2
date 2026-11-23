'use strict';
// Controles statiques : les pages traduites utilisent des cles qui existent, et le francais ecrit
// dans la page est identique a celui de locales/fr.json (pas de derive entre les deux).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const LANGS = ['fr', 'en', 'ar', 'es', 'pt'];
const dict = Object.fromEntries(LANGS.map(l => [l, JSON.parse(fs.readFileSync(path.join(root, 'locales', l + '.json'), 'utf8'))]));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html') && /src="i18n\.js"/.test(read(f)));

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&laquo;/g, '«').replace(/&raquo;/g, '»');
const norm = s => decode(s).replace(/\s+/g, ' ').trim();
const hasKey = (lang, key) => key in dict[lang] || (key + '.other') in dict[lang];

test('au moins une page est branchee sur i18n.js', () => {
  assert.ok(pages.length >= 1);
});

test('i18n.js est charge apres api.js et avant les scripts de la page', () => {
  for (const page of pages) {
    const srcs = [...read(page).matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
    assert.ok(srcs.indexOf('api.js') < srcs.indexOf('i18n.js'), `${page} : api.js avant i18n.js`);
    assert.ok(/href="i18n\.css"/.test(read(page)), `${page} : i18n.css manquant`);
  }
});

test('chaque data-i18n existe dans les cinq langues, et le texte francais de la page est celui de fr.json', () => {
  for (const page of pages) {
    const html = read(page);
    for (const m of html.matchAll(/<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([^<]*)<\/\1>/g)) {
      const [, , key, inner] = m;
      for (const l of LANGS) assert.ok(hasKey(l, key), `${page} : ${key} absent de ${l}`);
      assert.equal(norm(inner), norm(dict.fr[key]), `${page} : texte de ${key} different de fr.json`);
    }
    for (const m of html.matchAll(/\bdata-i18n(?:-rich)?="([^"]+)"/g)) {
      for (const l of LANGS) assert.ok(hasKey(l, m[1]), `${page} : ${m[1]} absent de ${l}`);
    }
  }
});

test('data-i18n-attr : cles presentes et valeur francaise identique a l\'attribut de la page', () => {
  for (const page of pages) {
    const html = read(page);
    for (const tag of html.match(/<[^>]*\bdata-i18n-attr="[^"]+"[^>]*>/g) || []) {
      const spec = /data-i18n-attr="([^"]+)"/.exec(tag)[1];
      for (const pair of spec.split(';')) {
        const [name, key] = pair.split(':').map(x => x.trim());
        for (const l of LANGS) assert.ok(hasKey(l, key), `${page} : ${key} absent de ${l}`);
        const current = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
        if (current) assert.equal(norm(current[1]), norm(dict.fr[key]), `${page} : ${name} (${key}) different de fr.json`);
      }
    }
  }
});

test('les cles utilisees dans les scripts (sengpT) existent dans les cinq langues', () => {
  const files = [...pages, 'pwa.js', ...fs.readdirSync(root).filter(f => /^page-.*\.js$/.test(f))];
  let checked = 0;
  for (const f of files) {
    for (const line of read(f).split('\n')) {
      if (!/sengpT\(|i18nText\(|i18nHtml\(|data-i18n-attr/.test(line)) continue;
      for (const m of line.matchAll(/'((?:[a-z0-9_]+\.)+[a-z0-9_]+)'/g)) {
        if (/\.(html|js|css|json|png|jpg|webp|svg)$/.test(m[1])) continue; // chemin de fichier, pas une cle
        for (const l of LANGS) assert.ok(hasKey(l, m[1]), `${f} : ${m[1]} absent de ${l}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 0);
});

test('les pages traduites ne laissent plus de texte francais dans les alert() du script', () => {
  for (const page of pages) {
    const script = read(page).split(/<script>/).slice(1).join('');
    for (const m of script.matchAll(/\balert\(\s*(['"`])([^'"`]*[À-ÿ][^'"`]*)\1/g)) {
      assert.fail(`${page} : alert() en francais en dur : ${m[2].slice(0, 60)}`);
    }
  }
});

test('les scripts integres des pages traduites ont une syntaxe valide', () => {
  const vm = require('node:vm');
  for (const page of pages) {
    const blocks = [...read(page).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    blocks.forEach((code, i) => {
      assert.doesNotThrow(() => new vm.Script(code, { filename: `${page}#script${i}` }), `${page} : script integre ${i}`);
    });
  }
});
