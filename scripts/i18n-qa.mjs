#!/usr/bin/env node
/**
 * Controle qualite des traductions, sur les trois surfaces : application (frontend/locales),
 * site vitrine (website/src/locales) et serveur (backend/src/i18n/messages.ts).
 *
 *   node scripts/i18n-qa.mjs                 resume + liste des points a examiner
 *   node scripts/i18n-qa.mjs --kit [dossier] ecrit aussi les feuilles de relecture (CSV, une par langue)
 *   node scripts/i18n-qa.mjs --json          sortie JSON (pour d'autres outils)
 *
 * Les erreurs (code de sortie 1) sont des defauts certains : cle manquante, variable {x} ou balise
 * differente, ecriture inattendue. Les « points a examiner » sont des heuristiques : un humain tranche.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'ar', 'es', 'pt'];
const args = process.argv.slice(2);
const kitDir = args.includes('--kit') ? path.resolve(args[args.indexOf('--kit') + 1] && !args[args.indexOf('--kit') + 1].startsWith('--') ? args[args.indexOf('--kit') + 1] : path.join(ROOT, 'docs', 'review')) : null;

// ---------- chargement : { surface, key, fr, tr: {lang: texte} }
const entries = [];
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const appFr = readJson(path.join(ROOT, 'frontend/locales/fr.json'));
const appLang = Object.fromEntries(LANGS.map(l => [l, readJson(path.join(ROOT, `frontend/locales/${l}.json`))]));
for (const key of Object.keys(appFr)) {
  entries.push({ surface: 'app', key, fr: appFr[key], tr: Object.fromEntries(LANGS.map(l => [l, appLang[l][key]])) });
}
// formes plurielles propres a une langue (ar : zero/two/few/many) : cle absente du francais, controlee a part
const extraPlural = {};
for (const l of LANGS) extraPlural[l] = Object.keys(appLang[l]).filter(k => !(k in appFr));

const siteSeg = readJson(path.join(ROOT, 'website/src/locales/_segments.json'));
const siteLang = Object.fromEntries(LANGS.map(l => [l, readJson(path.join(ROOT, `website/src/locales/${l}.json`))]));
for (const s of siteSeg) entries.push({ surface: 'site', key: s.key, fr: s.key, tr: Object.fromEntries(LANGS.map(l => [l, siteLang[l][s.key]])), where: s.pages.join(', ') });

const dump = `
const m = require('./src/i18n/messages');
const out = [];
for (const [k, r] of Object.entries(m.ERRORS)) out.push({ key: 'error: ' + k, row: r });
for (const p of m.PATTERNS) out.push({ key: 'pattern: ' + String(p.re), row: p.tpl });
for (const [k, t] of Object.entries(m.TEMPLATES)) { out.push({ key: 'notif.' + k + '.title', row: t.title }); out.push({ key: 'notif.' + k + '.message', row: t.message }); }
process.stdout.write(JSON.stringify(out));`;
const backend = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'backend/node_modules/ts-node/dist/bin.js'), '-T', '-e', dump], { cwd: path.join(ROOT, 'backend'), encoding: 'utf8', maxBuffer: 1 << 24 }));
// Row = [fr, en, ar, es, pt]
for (const b of backend) entries.push({ surface: 'server', key: b.key, fr: b.row[0], tr: { en: b.row[1], ar: b.row[2], es: b.row[3], pt: b.row[4] } });

// ---------- outils
const strip = s => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ');
const vars = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const tags = s => [...String(s).matchAll(/<\/?[a-z]+\d*\/?>/g)].map(m => m[0]).sort().join('');
const ARABIC = /[؀-ۿ]/;
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;
const letters = s => (strip(s).match(/\p{L}/gu) || []).length;
const BRANDS = /SEN\s?GP|SENEGAL GP|SENGP|FCFA|WhatsApp|Orange Money|Wave|Visa|Mastercard|QR|GP|Google|Dakar|Paris|PDF|PIN|OTP|SMS|iOS|Android|App Store|Google Play|RCCM|NINEA|DKR|SN|Email|e-mail|CDP/gi;
const nonBrandLetters = s => (strip(s).replace(BRANDS, '').replace(/https?:\/\/\S+|\S+@\S+/g, '').match(/\p{L}/gu) || []).length;
const normAr = s => s.replace(/[ً-ٰٟـ]/g, '');

// vocabulaire commun aux trois surfaces : motif francais -> formes acceptees par langue
const GLOSSARY = [
  ['expéditeur', { en: /sender/i, es: /remitente/i, pt: /remetente/i, ar: /مرسل/ }],
  ['colis', { en: /parcel|package/i, es: /paquete|bulto|envío/i, pt: /encomenda|pacote|volume/i, ar: /طرد|طرود|شحنة/ }],
  ['suivi', { en: /track/i, es: /seguimiento|rastre/i, pt: /acompanha|segui|rastre/i, ar: /تتبع|متابعة/ }],
  ['livraison|livré', { en: /deliver/i, es: /entrega|entregad/i, pt: /entrega|entregue/i, ar: /تسليم|توصيل|سُلّم|تسلّم|سلم/ }],
  ['paiement|payer', { en: /pay|cash/i, es: /pag|efectivo/i, pt: /pag|dinheiro/i, ar: /دفع|سداد|نقد/ }],
  ['réclamation', { en: /claim/i, es: /reclamaci/i, pt: /reclama/i, ar: /شكو|شكا|مطالب/ }],
  ['trajet', { en: /trip|journey|route/i, es: /viaje|trayecto|ruta/i, pt: /viage[mn]|trajeto|percurso|rota/i, ar: /رحل|مسار/ }],
  ['mission', { en: /mission/i, es: /misi/i, pt: /miss/i, ar: /مهم|مهام/ }],
];
const FR_WORDS = /\b(le|la|les|des|du|vous|votre|vos|pour|avec|est|sont|une|dans|sur|par|pas|et)\b/i;

const errors = [];
const review = [];
const add = (list, e, kind, detail) => list.push({ surface: e.surface, key: e.key, kind, detail });

for (const e of entries) {
  for (const l of LANGS) {
    const t = e.tr[l];
    if (typeof t !== 'string' || !t.trim()) { add(errors, e, `${l}: manquant`, ''); continue; }
    const plural = /\.(zero|one|two|few|many)$/.test(e.key);
    const subset = (a, b) => a.split(',').filter(Boolean).every(v => b.split(',').includes(v));
    if (e.surface !== 'site' && (plural ? !subset(vars(t), vars(e.fr)) : vars(e.fr) !== vars(t))) add(errors, e, `${l}: variables`, `${vars(e.fr)} <> ${vars(t)}`);
    if (e.surface === 'site' && tags(e.fr) !== tags(t) && tags(e.fr).replace(/\d+/g, '') !== tags(t).replace(/\d+/g, '')) add(errors, e, `${l}: balises`, `${tags(e.fr)} <> ${tags(t)}`);
    if (ARABIC_INDIC_DIGITS.test(t)) add(errors, e, `${l}: chiffres arabes-indiens`, t.slice(0, 80));
    const nb = nonBrandLetters(t);
    if (l === 'ar' && nb > 3 && !ARABIC.test(t) && nonBrandLetters(e.fr.replace(/\{\w+\}/g, '')) > 3) add(errors, e, 'ar: aucun texte arabe', t.slice(0, 80));
    if (l !== 'ar' && ARABIC.test(t)) add(errors, e, `${l}: caracteres arabes`, t.slice(0, 80));
    if (/[«»]/.test(t) && l !== 'fr' && e.surface === 'site') add(errors, e, `${l}: guillemets francais`, t.slice(0, 80));

    // points a examiner
    if (t === e.fr && nonBrandLetters(e.fr) > 12 && !/@|\d{3}/.test(e.fr)) add(review, e, `${l}: identique au francais`, t.slice(0, 90));
    if (l !== 'ar' && nb > 30 && FR_WORDS.test(strip(t).replace(BRANDS, '')) && l !== 'fr') {
      const m = strip(t).match(/\b(vous|votre|vos|pour|avec|dans|sont|une|des|les|est)\b/gi) || [];
      if (m.length >= 2 && !(l === 'pt' && /\b(para|com|uma|em)\b/i.test(t)) && !(l === 'es' && /\b(para|con|una|en|los)\b/i.test(t))) add(review, e, `${l}: mots francais ?`, t.slice(0, 90));
    }
    const lf = letters(e.fr), lt = letters(t);
    if (lf >= 4 && lf <= 40 && lt > lf * 1.9 + 4 && e.surface !== 'server') add(review, e, `${l}: tres long (${lt} lettres pour ${lf})`, t.slice(0, 90));
    for (const [fr, byLang] of GLOSSARY) {
      if (new RegExp(fr, 'i').test(e.fr) && e.surface !== 'server' || (e.surface === 'server' && new RegExp(fr, 'i').test(e.fr))) {
        const probe = l === 'ar' ? normAr(t) : t;
        if (!byLang[l].test(probe) && letters(e.fr) < 160) add(review, e, `${l}: vocabulaire « ${fr.split('|')[0]} »`, t.slice(0, 90));
      }
    }
  }
}
// formes plurielles propres a une langue : au moins du texte, memes variables que leur forme « other »
for (const l of LANGS) for (const k of extraPlural[l]) {
  const base = k.replace(/\.(zero|one|two|few|many|other)$/, '.other');
  if (!appLang[l][k]?.trim()) errors.push({ surface: 'app', key: k, kind: `${l}: pluriel vide`, detail: '' });
  else if (appLang[l][base] !== undefined && !vars(appLang[l][k]).split(',').filter(Boolean).every(v => vars(appLang[l][base]).split(',').includes(v))) errors.push({ surface: 'app', key: k, kind: `${l}: variables du pluriel`, detail: '' });
}

// ---------- sortie
const count = (list, f) => list.filter(f).length;
const summary = ['app', 'site', 'server'].map(s => `${s}: ${count(entries, e => e.surface === s)} textes`).join(' | ');
if (args.includes('--json')) {
  console.log(JSON.stringify({ summary, errors, review }, null, 2));
} else {
  console.log(summary);
  console.log(`erreurs: ${errors.length} | points a examiner: ${review.length}`);
  const byKind = new Map();
  for (const r of review) byKind.set(r.kind.replace(/\(\d+ lettres pour \d+\)/, ''), (byKind.get(r.kind.replace(/\(\d+ lettres pour \d+\)/, '')) || 0) + 1);
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1]).slice(0, 24)) console.log(`  ${String(n).padStart(4)}  ${k}`);
  errors.slice(0, 40).forEach(e => console.log(`ERREUR [${e.surface}] ${e.kind} — ${e.key.slice(0, 70)} ${e.detail}`));
}

// ---------- feuilles de relecture
if (kitDir) {
  fs.mkdirSync(kitDir, { recursive: true });
  const csv = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const flagged = new Map();
  for (const r of review) { const k = `${r.surface}|${r.key}|${r.kind.split(':')[0]}`; flagged.set(k, (flagged.get(k) ? flagged.get(k) + ' ; ' : '') + r.kind.split(':').slice(1).join(':').trim()); }
  const names = { en: 'anglais', ar: 'arabe', es: 'espagnol', pt: 'portugais' };
  for (const l of LANGS) {
    const rows = [['surface', 'ou', 'cle', 'francais', names[l], 'a_verifier (automatique)', 'statut (OK / a corriger)', 'correction proposee', 'commentaire']];
    // les points signales d'abord, puis le reste, dans l'ordre des surfaces
    const order = entries.map((e, i) => ({ e, i, f: flagged.get(`${e.surface}|${e.key}|${l}`) }));
    order.sort((a, b) => (b.f ? 1 : 0) - (a.f ? 1 : 0) || a.i - b.i);
    for (const { e, f } of order) rows.push([e.surface === 'server' ? 'serveur' : e.surface === 'app' ? 'application' : 'site', e.where || '', e.key, strip(e.fr) === e.fr ? e.fr : e.fr, e.tr[l], f || '', '', '', '']);
    fs.writeFileSync(path.join(kitDir, `releve-${l}.csv`), '﻿' + rows.map(r => r.map(csv).join(';')).join('\r\n') + '\r\n');
  }
  console.log(`Feuilles de relecture ecrites dans ${path.relative(ROOT, kitDir)}`);
}
process.exit(errors.length ? 1 : 0);
