/**
 * Contrôles qualité sur dist/ (sans dépendance) : liens internes, images, ancres,
 * titres, métadonnées, accessibilité de base.   node scripts/check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIST = process.env.SITE_DIST ? path.resolve(process.env.SITE_DIST) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const htmls = walk(DIST).filter(f => f.endsWith('.html'));
const problems = [];
const warn = (f, m) => problems.push(`${path.relative(DIST, f)}: ${m}`);
const exists = u => {
  const clean = u.split('#')[0].split('?')[0];
  const p = path.join(DIST, clean);
  return fs.existsSync(p) && (!fs.statSync(p).isDirectory() || fs.existsSync(path.join(p, 'index.html')));
};
const idsOf = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const pageHtml = {};
for (const f of htmls) pageHtml[f] = fs.readFileSync(f, 'utf8');
const urlToFile = u => {
  const clean = u.split('#')[0] || '/';
  let p = path.join(DIST, clean);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  return p;
};
let links = 0;
for (const f of htmls) {
  const h = pageHtml[f];
  const rel = path.relative(DIST, f);
  if (rel !== '404.html' && (h.match(/<h1[\s>]/g) || []).length !== 1) warn(f, 'il doit y avoir exactement un <h1>');
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  if (!title || title.length > 70) warn(f, `titre vide ou trop long (${title.length})`);
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  if (desc.length < 50 || desc.length > 200) warn(f, `description hors 50–200 caractères (${desc.length})`);
  for (const m of h.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt=/.test(m[0])) warn(f, 'image sans attribut alt : ' + m[0].slice(0, 80));
    if (!/\swidth=/.test(m[0]) || !/\sheight=/.test(m[0])) warn(f, 'image sans width/height : ' + m[0].slice(0, 80));
  }
  const ids = idsOf(h);
  if (ids.size !== [...h.matchAll(/\sid="([^"]+)"/g)].length) warn(f, 'identifiants (id) en double');
  for (const m of h.matchAll(/\s(?:href|src|srcset)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(u)) continue;
    links++;
    if (u.startsWith('#')) { if (u.length > 1 && !ids.has(u.slice(1))) warn(f, 'ancre introuvable ' + u); continue; }
    if (!u.startsWith('/')) { warn(f, 'lien relatif à éviter : ' + u); continue; }
    if (!exists(u)) { warn(f, 'cible introuvable : ' + u); continue; }
    const [, anchor] = u.split('#');
    if (anchor) { const tf = urlToFile(u); if (!idsOf(pageHtml[tf] || fs.readFileSync(tf, 'utf8')).has(anchor)) warn(f, 'ancre introuvable dans la cible : ' + u); }
  }
  // hiérarchie des titres
  const levels = [...h.matchAll(/<h([1-6])[\s>]/g)].map(m => +m[1]);
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) { warn(f, `saut de niveau de titre h${levels[i - 1]} → h${levels[i]}`); break; }
}
for (const f of ['robots.txt']) if (!fs.existsSync(path.join(DIST, f))) problems.push('robots.txt manquant');
console.log(`${htmls.length} pages, ${links} liens/ressources internes vérifiés.`);
if (problems.length) { console.log('\nPoints à corriger :\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('Aucun problème détecté.');
