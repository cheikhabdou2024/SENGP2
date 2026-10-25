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
    return isTodo(c.phone) ? mark(c.phone) : `<a href="tel:${esc(c.phone.replace(/[^+\d]/g, ''))}">${esc(c.phone)}</a>`;
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

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const sitemap = [];
const todos = new Map();
const pagesDir = path.join(SRC, 'pages');
for (const file of walk(pagesDir)) {
  const rel = path.relative(pagesDir, file).replace(/\\/g, '/');
  const { meta, body } = parsePage(file);
  const slug = rel.replace(/\.html$/, '');
  const urlPath = slug === 'index' ? '/' : slug === '404' ? '/404.html' : `/${slug.replace(/\/index$/, '')}/`;
  const outFile = slug === '404' ? path.join(DIST, '404.html') : path.join(DIST, slug === 'index' ? 'index.html' : slug.replace(/\/index$/, ''), slug === 'index' ? '' : 'index.html');
  const canonical = cfg.site.url + (urlPath === '/404.html' ? '/' : urlPath);
  const ctx = {
    ...cfg,
    page: { title: meta.title, description: meta.description || cfg.site.description, key: meta.key || '', path: urlPath, canonical, robots: meta.noindex || !LIVE ? 'noindex,nofollow' : 'index,follow', ogImage: cfg.site.url + (meta.ogImage || '/assets/og-cover.jpg') },
    draft: !LIVE,
  };
  ctx.page.bodyClass = meta.hero ? 'has-hero' : 'no-hero';
  ctx.extraHead = meta.css ? meta.css.split(/\s+/).map(n => `<link rel="stylesheet" href="/css/${n}.css">`).join('') : '';
  ctx.extraScripts = meta.js ? meta.js.split(/\s+/).map(n => `<script src="/js/${n}.js" defer></script>`).join('') : '';
  ctx.navHtml = cfg.nav.map(n => `<a class="nav__link" href="${n.path}"${n.key === ctx.page.key ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('');
  ctx.draftBanner = LIVE ? '' : '<div class="draft-bar" role="note"><strong>Version de relecture</strong> — site non publié et non indexé. Les zones surlignées sont à compléter.</div>';
  ctx.legalNotice = cfg.legalReviewed ? '' : '<div class="notice" role="note"><strong>Projet de texte — non validé juridiquement.</strong> Ce document doit être relu et validé par un juriste avant la publication du site.</div>';
  const org = { '@context': 'https://schema.org', '@type': 'Organization', name: cfg.site.name, url: cfg.site.url, logo: cfg.site.url + '/assets/icon-512.png', description: cfg.site.description };
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
  const html = render(partials.layout.replace('{{{content}}}', () => content), { ...ctx, nav: cfg.nav });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  if (!meta.noindex) sitemap.push(canonical);
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
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemap.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');
}

// ---------- contrôles
for (const f of walk(DIST).filter(f => /\.(html|xml|txt)$/.test(f))) {
  const t = read(f);
  const found = t.match(/\[À COMPLÉTER[^\]]*\]/g);
  if (found) for (const s of found) todos.set(s, (todos.get(s) || 0) + 1);
}
const problems = [];
if (LIVE && todos.size) problems.push(`${todos.size} champ(s) « À COMPLÉTER » restants :\n  - ${[...todos.keys()].join('\n  - ')}`);
if (LIVE && !cfg.legalReviewed) problems.push('Les textes légaux ne sont pas validés (legalReviewed: false dans site.config.json).');
if (LIVE && !cfg.live) problems.push('Le site n\'est pas marqué comme prêt (live: false dans site.config.json).');

console.log(`${LIVE ? 'PRODUCTION' : 'BROUILLON'} — ${sitemap.length + 1} pages générées dans dist/`);
if (args.has('--report') || !LIVE) {
  console.log(todos.size ? `Champs à compléter (${todos.size}) :\n  - ${[...todos.keys()].join('\n  - ')}` : 'Aucun champ à compléter.');
}
if (problems.length) { fs.rmSync(DIST, { recursive: true, force: true }); console.error('\nBUILD DE PRODUCTION REFUSÉ :\n' + problems.join('\n')); process.exit(1); }
