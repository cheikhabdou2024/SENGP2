#!/usr/bin/env node
/**
 * Outil de traduction pour l'application et le serveur (le site a le sien : website/scripts/i18n-tool.mjs).
 *
 *   node scripts/i18n-fill.mjs needs <app|server> <langue> [nombre]   textes qui manquent (defaut : 80), avec le francais et l'anglais
 *   node scripts/i18n-fill.mjs merge <app|server> <langue> <fichier>  fusionne { "identifiant": "traduction", ... }
 *   node scripts/i18n-fill.mjs status [<langue>]                          avancement
 *
 * - app    : frontend/locales/<langue>.json, identifiants = cles du dictionnaire (ex. "claim.page_title").
 *            Formes de pluriel : une cle « base.<categorie> » par categorie de la langue (Intl.PluralRules) ;
 *            `needs` liste aussi les categories manquantes (ex. « mission.count.few » en russe).
 * - server : backend/src/i18n/locales/<langue>.json, identifiants E1, E2... (messages d'erreur),
 *            P1... (messages a variable, {1}), N1... (notifications, titre/message).
 * Les variables {x} doivent etre identiques a celles du francais (un pluriel peut en omettre : « un seul »).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, surface, lang, third] = process.argv.slice(2);
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]);
const sameSet = (a, b) => [...new Set(a)].sort().join() === [...new Set(b)].sort().join();
const subset = (a, b) => a.every(v => b.includes(v));
const die = m => { console.error(m); process.exit(1); };

// ---- categories de pluriel requises pour une langue
function pluralCategories(l) {
  const tag = { zh: 'zh-CN' }[l] || l;
  const cats = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
  // « many » n'existe en pratique (nombres entiers) qu'en russe et en arabe ; ailleurs il ne concerne que les millions
  return cats.filter(c => c !== 'many' || ['ru', 'ar'].includes(l));
}

// ---- surface « app »
function appModel(l) {
  const fr = readJson(path.join(ROOT, 'frontend/locales/fr.json'));
  const en = readJson(path.join(ROOT, 'frontend/locales/en.json'));
  const file = path.join(ROOT, `frontend/locales/${l}.json`);
  const dict = fs.existsSync(file) ? readJson(file) : {};
  const cats = pluralCategories(l);
  const bases = new Set(Object.keys(fr).filter(k => k.endsWith('.other')).map(k => k.slice(0, -6)));
  const wanted = []; // { id, fr, en, varsFrom }
  for (const k of Object.keys(fr)) {
    const m = /^(.*)\.(zero|one|two|few|many|other)$/.exec(k);
    if (m && bases.has(m[1])) {
      if (m[2] !== 'other') continue; // les formes sont regenerees ci-dessous, selon la langue
      for (const c of cats) wanted.push({ id: `${m[1]}.${c}`, fr: fr[`${m[1]}.${c}`] ?? fr[k], en: en[`${m[1]}.${c}`] ?? en[k], plural: true, base: k, cat: c });
    } else wanted.push({ id: k, fr: fr[k], en: en[k], base: k });
  }
  return { fr, en, file, dict, wanted };
}

// ---- surface « server »
function serverModel(l) {
  const dump = `
const m = require('./src/i18n/messages');
const out = [];
let e = 0, p = 0;
for (const [k, r] of Object.entries(m.ERRORS)) out.push({ id: 'E' + (++e), path: ['errors', k], fr: r[0], en: r[1] });
for (const t of m.PATTERNS) out.push({ id: 'P' + (++p), path: ['patterns', String(p - 1)], fr: t.tpl[0], en: t.tpl[1] });
for (const [k, t] of Object.entries(m.TEMPLATES)) { out.push({ id: 'N-' + k + '-title', path: ['templates', k, 'title'], fr: t.title[0], en: t.title[1] }); out.push({ id: 'N-' + k + '-message', path: ['templates', k, 'message'], fr: t.message[0], en: t.message[1] }); }
process.stdout.write(JSON.stringify(out));`;
  const wanted = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'backend/node_modules/ts-node/dist/bin.js'), '-T', '-e', dump], { cwd: path.join(ROOT, 'backend'), encoding: 'utf8', maxBuffer: 1 << 24 }));
  const file = path.join(ROOT, `backend/src/i18n/locales/${l}.json`);
  const store = fs.existsSync(file) ? readJson(file) : { errors: {}, patterns: {}, templates: {} };
  const get = w => w.path.reduce((o, k) => (o == null ? o : o[k]), store);
  const set = (w, text) => {
    let o = store;
    w.path.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; });
    o[w.path[w.path.length - 1]] = text;
  };
  return { wanted, file, store, get, set };
}

function show(w, get) {
  const prefix = w.plural ? `[${w.cat}] ` : '';
  const vis = t => String(t ?? '').split('\r').join('').split('\n').join('\\n').split('\t').join(' ');
  console.log(`${w.id}\t${prefix}${vis(w.fr)}\t| EN: ${vis(w.en)}`);
}

if (cmd === 'needs' || cmd === 'merge') {
  if (!['app', 'server'].includes(surface) || !lang) die('usage : <needs|merge|status> <app|server> <langue> ...');
}

if (cmd === 'needs') {
  const limit = Number(third) || 80;
  let missing;
  if (surface === 'app') {
    const m = appModel(lang);
    missing = m.wanted.filter(w => typeof m.dict[w.id] !== 'string' || !m.dict[w.id].trim());
  } else {
    const m = serverModel(lang);
    missing = m.wanted.filter(w => { const v = m.get(w); return typeof v !== 'string' || !v.trim(); });
  }
  console.error(`# ${missing.length} texte(s) manquant(s) en ${lang} (${surface}) ; ${Math.min(limit, missing.length)} affiches`);
  missing.slice(0, limit).forEach(w => show(w));
} else if (cmd === 'merge') {
  const input = readJson(third);
  if (surface === 'app') {
    const m = appModel(lang);
    const ids = new Map(m.wanted.map(w => [w.id, w]));
    let n = 0;
    for (const [id, text] of Object.entries(input)) {
      const w = ids.get(id);
      if (!w) die(`identifiant inconnu : ${id}`);
      if (typeof text !== 'string' || !text.trim()) die(`traduction vide : ${id}`);
      const ref = vars(m.fr[w.plural ? w.base : id]);
      const got = vars(text);
      if (w.plural ? !subset(got, ref) : !sameSet(got, ref)) die(`variables differentes pour ${id} : francais {${ref}} / traduction {${got}}`);
      const nl = x => String(x).split('\n').length - 1;
      const refText = m.fr[w.plural ? w.base : id];
      if (nl(refText) !== nl(text)) die(`sauts de ligne differents pour ${id} : le francais en a ${nl(refText)} (ecrits \n dans la liste), la traduction ${nl(text)}. Ecris de vrais retours a la ligne (\n dans le JSON).`);
      m.dict[id] = text;
      n++;
    }
    const ordered = {};
    for (const w of m.wanted) if (w.id in m.dict) ordered[w.id] = m.dict[w.id];
    fs.writeFileSync(m.file, JSON.stringify(ordered, null, 2) + '\n');
    console.log(`${n} fusionnee(s) -> ${path.relative(ROOT, m.file)} (${Object.keys(ordered).length}/${m.wanted.length})`);
  } else {
    const m = serverModel(lang);
    const ids = new Map(m.wanted.map(w => [w.id, w]));
    let n = 0;
    for (const [id, text] of Object.entries(input)) {
      const w = ids.get(id);
      if (!w) die(`identifiant inconnu : ${id}`);
      if (typeof text !== 'string' || !text.trim()) die(`traduction vide : ${id}`);
      const a = [...String(w.fr).matchAll(/\{(\w+)\}/g)].map(x => x[1]);
      if (!sameSet(a, vars(text))) die(`variables differentes pour ${id} : francais {${a}} / traduction {${vars(text)}}`);
      m.set(w, text);
      n++;
    }
    fs.mkdirSync(path.dirname(m.file), { recursive: true });
    fs.writeFileSync(m.file, JSON.stringify(m.store, null, 2) + '\n');
    const done = m.wanted.filter(w => typeof m.get(w) === 'string').length;
    console.log(`${n} fusionnee(s) -> ${path.relative(ROOT, m.file)} (${done}/${m.wanted.length})`);
  }
} else if (cmd === 'multiline') {
  // textes multilignes du francais : montre la source et la traduction actuelle (sauts de ligne visibles)
  const m = appModel(surface);
  const vis = t => String(t ?? '').split('\r').join('').split('\n').join('\\n');
  const nl = x => String(x).split('\n').length - 1;
  const bad = m.wanted.filter(w => nl(m.fr[w.plural ? w.base : w.id]) > 0 && nl(m.dict[w.id] ?? '') !== nl(m.fr[w.plural ? w.base : w.id]));
  console.error(`# ${bad.length} texte(s) multiligne(s) a corriger en ${surface}`);
  for (const w of bad) console.log(`${w.id}	${vis(m.fr[w.plural ? w.base : w.id])}	| ACTUEL: ${vis(m.dict[w.id])}`);
} else if (cmd === 'status') {
  const langs = surface ? [surface] : ['it', 'de', 'nl', 'ru', 'zh', 'hi', 'ja', 'ko', 'tr'];
  for (const l of langs) {
    const a = appModel(l); const s = serverModel(l);
    const nlc = x => String(x).split('\n').length - 1;
    const flat = a.wanted.filter(w => nlc(a.fr[w.plural ? w.base : w.id]) > 0 && nlc(a.dict[w.id] ?? '') !== nlc(a.fr[w.plural ? w.base : w.id])).length;
    console.log(`${l} : ${flat ? `[${flat} sauts de ligne a corriger] ` : ''}application ${a.wanted.filter(w => typeof a.dict[w.id] === 'string' && a.dict[w.id].trim()).length}/${a.wanted.length} | serveur ${s.wanted.filter(w => typeof s.get(w) === 'string' && s.get(w).trim()).length}/${s.wanted.length}`);
  }
} else {
  die('usage : needs <app|server> <langue> [n] | merge <app|server> <langue> <fichier.json> | status [<langue>]');
}
