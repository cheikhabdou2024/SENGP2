#!/usr/bin/env node
/**
 * Génère le site statique dans dist/ à partir de src/ et site.config.json.
 * Sans dépendance : Node 18+ uniquement.
 *
 *   node build.mjs            → build « brouillon » (non indexable, champs manquants surlignés)
 *   node build.mjs --live     → build de production : échoue s'il reste un champ « À COMPLÉTER »
 *                               ou si les textes légaux ne sont pas validés (legalReviewed)
 *   node build.mjs --report   → liste les champs encore à compléter
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collapse, localizeHtml, collectSegments } from './lib/localize.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = process.env.SITE_DIST ? path.resolve(process.env.SITE_DIST) : path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const cfg = JSON.parse(fs.readFileSync(process.env.SITE_CONFIG ? path.resolve(process.env.SITE_CONFIG) : path.join(ROOT, 'site.config.json'), 'utf8'));
const LIVE = args.has('--live') || process.env.SITE_LIVE === '1';
const TODO = '[À COMPLÉTER';
const isTodo = v => typeof v === 'string' && v.includes(TODO);

const read = p => fs.readFileSync(p, 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mark = v => (isTodo(v) && !LIVE ? `<mark class="todo">${esc(v)}</mark>` : esc(v));

const partials = {};
for (const f of fs.readdirSync(path.join(SRC, 'partials'))) partials[f.replace(/\.html$/, '')] = read(path.join(SRC, 'partials', f));

// ---------- jetons {{…}}
function lookup(key, ctx) {
  const parts = key.split('.');
  let v = ctx;
  for (const p of parts) { v = v?.[p]; if (v === undefined) return undefined; }
  return v;
}
function helperValue(name) {
  const c = cfg.company;
  if (name === 'email_link') {
    return isTodo(c.email) ? mark(c.email) : `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`;
  }
  if (name === 'phone_link') {
    return isTodo(c.phone) ? mark(c.phone) : `<a href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}" dir="ltr">${esc(c.phone)}</a>`;
  }
  if (name === 'year') return String(new Date().getFullYear());
  return undefined;
}
function render(tpl, ctx, depth = 0) {
  if (depth > 6) throw new Error('Inclusions trop profondes');
  let out = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => {
    if (!(n in partials)) throw new Error(`Partiel introuvable : ${n}`);
    return render(partials[n], ctx, depth + 1);
  });
  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => {          // brut (HTML déjà sûr)
    const h = helperValue(k); if (h !== undefined) return h;
    const v = lookup(k, ctx); return v === undefined ? '' : String(v);
  });
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {              // échappé
    const h = helperValue(k); if (h !== undefined) return h;
    const v = lookup(k, ctx);
    if (v === undefined) throw new Error(`Jeton inconnu : {{${k}}}`);
    return k.startsWith('company.') ? mark(v) : esc(v);
  });
  return out;
}

// ---------- pages
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function parsePage(file) {
  const raw = read(file);
  const m = raw.match(/^<!--meta\s*([\s\S]*?)\s*-->\s*/);
  if (!m) throw new Error(`Métadonnées manquantes : ${file}`);
  return { meta: JSON.parse(m[1]), body: raw.slice(m[0].length) };
}

// ---------- langues
const LANG_META = {
  fr: { name: 'Français', dir: 'ltr', og: 'fr_FR' },
  en: { name: 'English', dir: 'ltr', og: 'en_GB' },
  ar: { name: 'العربية', dir: 'rtl', og: 'ar_AR' },
  es: { name: 'Español', dir: 'ltr', og: 'es_ES' },
  pt: { name: 'Português', dir: 'ltr', og: 'pt_PT' },
  it: { name: 'Italiano', dir: 'ltr', og: 'it_IT' },
  de: { name: 'Deutsch', dir: 'ltr', og: 'de_DE' },
  nl: { name: 'Nederlands', dir: 'ltr', og: 'nl_NL' },
  ru: { name: 'Русский', dir: 'ltr', og: 'ru_RU' },
  zh: { name: '简体中文', dir: 'ltr', og: 'zh_CN' },
  hi: { name: 'हिन्दी', dir: 'ltr', og: 'hi_IN' },
  ja: { name: '日本語', dir: 'ltr', og: 'ja_JP' },
  ko: { name: '한국어', dir: 'ltr', og: 'ko_KR' },
  tr: { name: 'Türkçe', dir: 'ltr', og: 'tr_TR' },
};
const LANGS = cfg.site.languages || ['fr'];
const DEFAULT_LANG = cfg.site.locale;
const langPrefix = l => (l === DEFAULT_LANG ? '' : `/${l}`);
const dictionaries = {};
const missing = Object.fromEntries(LANGS.map(l => [l, new Set()]));
const usedKeys = Object.fromEntries(LANGS.map(l => [l, new Set()]));
for (const l of LANGS) {
  const f = path.join(SRC, 'locales', `${l}.json`);
  dictionaries[l] = l !== DEFAULT_LANG && fs.existsSync(f) ? JSON.parse(read(f)) : {};
}
// Segments qui ne contiennent que des noms propres ou des chiffres : identiques dans toutes les langues.
const invariant = key => !/\p{L}/u.test(key.replace(/<[^>]*>/g, '').replace(/SEN GP|FCFA|WhatsApp|Orange Money|Wave|Visa|Mastercard|Dakar/g, ''));
function translator(lang) {
  return (key) => {
    const d = dictionaries[lang];
    if (Object.prototype.hasOwnProperty.call(d, key) && d[key] !== '') { usedKeys[lang].add(key); return d[key]; }
    if (invariant(key)) return key;
    missing[lang].add(key);
    return undefined;
  };
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const sitemap = [];          // { url, alternates: [{lang, url}] }
const todos = new Map();
const extracted = new Map(); // cle francaise -> pages
const pagesDir = path.join(SRC, 'pages');

const pageList = walk(pagesDir).map(file => {
  const rel = path.relative(pagesDir, file).replace(/\\/g, '/');
  const { meta, body } = parsePage(file);
  const slug = rel.replace(/\.html$/, '');
  const urlPath = slug === 'index' ? '/' : slug === '404' ? '/404.html' : `/${slug.replace(/\/index$/, '')}/`;
  return { file, rel, meta, body, slug, urlPath, localized: meta.i18n !== false && slug !== '404' };
});
const localizable = new Set(pageList.filter(p => p.localized).map(p => p.urlPath));
const fixed = new Set(pageList.filter(p => !p.localized && p.slug !== '404').map(p => p.urlPath));
// Adresse publique d'une page dans une langue ('/en/faq/') ; les pages juridiques n'existent qu'en francais.
const pathFor = (p, lang) => (p.urlPath === '/404.html' ? '/' : (p.localized ? langPrefix(lang) : '') + p.urlPath);
const urlFor = (p, lang) => cfg.site.url + pathFor(p, lang);

function langMenu(page, lang) {
  const items = LANGS.map(l => {
    const href = page.localized ? pathFor(page, l) : (l === DEFAULT_LANG ? '/' : `/${l}/`);
    return `<li><a href="${href}" lang="${l}" hreflang="${l}" data-lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${esc(LANG_META[l].name)}</a></li>`;
  }).join('');
  return `<nav class="lang" aria-label="Langue" data-lang-menu><details class="lang__d"><summary class="lang__btn" data-no-i18n><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg><span translate="no">${lang.toUpperCase()}</span></summary><ul class="lang__list" data-no-i18n>${items}</ul></details></nav>`;
}

for (const page of pageList) {
  const { meta, body, urlPath, slug } = page;
  const outRel = slug === '404' ? '404.html' : slug === 'index' ? 'index.html' : path.join(slug.replace(/\/index$/, ''), 'index.html');
  for (const lang of page.localized ? LANGS : [DEFAULT_LANG]) {
    const lm = LANG_META[lang];
    const outFile = path.join(DIST, lang === DEFAULT_LANG || !page.localized ? '' : lang, outRel);
    const canonical = urlFor(page, lang);
    const tr = translator(lang);
    const alternates = page.localized ? LANGS.map(l => ({ lang: l, url: urlFor(page, l) })) : [];
    const ctx = {
      ...cfg,
      lang, dir: lm.dir,
      page: { title: meta.title, description: meta.description || cfg.site.description, key: meta.key || '', path: urlPath, canonical, robots: meta.noindex || !LIVE ? 'noindex,nofollow' : 'index,follow', ogImage: cfg.site.url + (meta.ogImage || '/assets/og-cover.jpg'), ogLocale: lm.og },
      draft: !LIVE,
    };
    ctx.page.bodyClass = (meta.hero ? 'has-hero' : 'no-hero') + (lm.dir === 'rtl' ? ' is-rtl' : '');
    ctx.extraHead = meta.css ? meta.css.split(/\s+/).map(n => `<link rel="stylesheet" href="/css/${n}.css">`).join('') : '';
    if (lm.dir === 'rtl') ctx.extraHead += '<link rel="stylesheet" href="/css/rtl.css">';
    ctx.extraScripts = meta.js ? meta.js.split(/\s+/).map(n => `<script src="/js/${n}.js" defer></script>`).join('') : '';
    ctx.navHtml = cfg.nav.map(n => `<a class="nav__link" href="${n.path}"${n.key === ctx.page.key ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
    ctx.draftBanner = LIVE ? '' : '<div class="draft-bar" role="note" data-no-i18n><strong>Version de relecture</strong> — site non publié et non indexé. Les zones surlignées sont à compléter.</div>';
    ctx.legalNotice = cfg.legalReviewed ? '' : '<div class="notice" role="note"><strong>Projet de texte — non validé juridiquement.</strong> Ce document doit être relu et validé par un juriste avant la publication du site.</div>';
    ctx.alternatesHtml = alternates.map(a => `<link rel="alternate" hreflang="${a.lang}" href="${a.url}">`).join('')
      + (alternates.length ? `<link rel="alternate" hreflang="x-default" href="${urlFor(page, DEFAULT_LANG)}">` : '');
    ctx.ogAlternates = alternates.filter(a => a.lang !== lang).map(a => `<meta property="og:locale:alternate" content="${LANG_META[a.lang].og}">`).join('');
    ctx.langMenu = slug === '404' ? '' : langMenu(page, lang);
    const description = lang === DEFAULT_LANG ? cfg.site.description : (tr(cfg.site.description) || cfg.site.description);
    const org = { '@context': 'https://schema.org', '@type': 'Organization', name: cfg.site.name, url: cfg.site.url, logo: cfg.site.url + '/assets/icon-512.png', description };
    if (!isTodo(cfg.company.legalName)) org.legalName = cfg.company.legalName;
    if (!isTodo(cfg.company.email)) org.email = cfg.company.email;
    if (!isTodo(cfg.company.phone)) org.telephone = cfg.company.phone;
    if (!isTodo(cfg.company.address)) org.address = { '@type': 'PostalAddress', streetAddress: cfg.company.address };
    const sameAs = Object.values(cfg.social).filter(Boolean);
    if (sameAs.length) org.sameAs = sameAs;
    ctx.jsonld = JSON.stringify(org).replace(/</g, '\\u003c');
    ctx.pageTitle = meta.title === cfg.site.name ? `${cfg.site.name} — ${cfg.site.tagline}` : `${meta.title} · ${cfg.site.name}`;
    let content = render(body, ctx);
    if (!LIVE) content = content.replace(/(?<!<mark class="todo">)\[À COMPLÉTER[^\]]*\]/g, m => `<mark class="todo">${m}</mark>`);
    let html = render(partials.layout.replace('{{{content}}}', () => content), { ...ctx, nav: cfg.nav });
    if (args.has('--extract') && lang === DEFAULT_LANG && page.localized) {
      for (const s of collectSegments(html, { localizable, fixed })) {
        if (!extracted.has(s.key)) extracted.set(s.key, { kind: s.kind, pages: new Set() });
        extracted.get(s.key).pages.add(page.rel);
      }
    }
    html = localizeHtml(html, { lang, translate: tr, localizable, fixed });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
  }
  if (!meta.noindex) {
    sitemap.push({ url: urlFor(page, DEFAULT_LANG), alternates: page.localized ? LANGS.map(l => ({ lang: l, url: urlFor(page, l) })) : [] });
  }
}

// ---------- statiques
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}
copyDir(path.join(SRC, 'css'), path.join(DIST, 'css'));
copyDir(path.join(SRC, 'js'), path.join(DIST, 'js'));
copyDir(path.join(SRC, 'assets'), path.join(DIST, 'assets'));

fs.writeFileSync(path.join(DIST, 'robots.txt'), LIVE
  ? `User-agent: *\nAllow: /\n\nSitemap: ${cfg.site.url}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n');
if (LIVE) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = (loc, alts) => `  <url><loc>${loc}</loc><lastmod>${today}</lastmod>${alts.map(a => `<xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.url}"/>`).join('')}</url>`;
  const urls = sitemap.flatMap(e => e.alternates.length ? e.alternates.map(a => entry(a.url, e.alternates)) : [entry(e.url, [])]);
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
}

// ---------- contrôles
for (const f of walk(DIST).filter(f => /\.(html|xml|txt)$/.test(f))) {
  const t = read(f);
  const found = t.match(/\[À COMPLÉTER[^\]]*\]/g);
  if (found) for (const s of found) todos.set(s, (todos.get(s) || 0) + 1);
}
const problems = [];
if (args.has('--extract')) {
  extracted.set(cfg.site.description, { kind: 'text', pages: new Set(['site.config.json']) });
  const out = [...extracted].map(([key, v]) => ({ key, kind: v.kind, pages: [...v.pages].sort() }));
  fs.mkdirSync(path.join(SRC, 'locales'), { recursive: true });
  fs.writeFileSync(path.join(SRC, 'locales', '_segments.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`${out.length} segments extraits dans src/locales/_segments.json`);
}
for (const l of LANGS) {
  if (l === DEFAULT_LANG) continue;
  if (missing[l].size) {
    const list = [...missing[l]];
    console.log(`Traductions manquantes (${l}) : ${list.length}`);
    if (LIVE) problems.push(`${list.length} traduction(s) manquante(s) en ${l} :\n  - ${list.slice(0, 10).join('\n  - ')}${list.length > 10 ? '\n  - …' : ''}`);
  }
}
if (LIVE && todos.size) problems.push(`${todos.size} champ(s) « À COMPLÉTER » restants :\n  - ${[...todos.keys()].join('\n  - ')}`);
if (LIVE && !cfg.legalReviewed) problems.push('Les textes légaux ne sont pas validés (legalReviewed: false dans site.config.json).');
if (LIVE && !cfg.live) problems.push('Le site n\'est pas marqué comme prêt (live: false dans site.config.json).');

console.log(`${LIVE ? 'PRODUCTION' : 'BROUILLON'} — ${walk(DIST).filter(f => f.endsWith('.html')).length} pages générées dans dist/ (${LANGS.length} langues)`);
if (args.has('--report') || !LIVE) {
  console.log(todos.size ? `Champs à compléter (${todos.size}) :\n  - ${[...todos.keys()].join('\n  - ')}` : 'Aucun champ à compléter.');
}
if (problems.length) { fs.rmSync(DIST, { recursive: true, force: true }); console.error('\nBUILD DE PRODUCTION REFUSÉ :\n' + problems.join('\n')); process.exit(1); }
