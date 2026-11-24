#!/usr/bin/env node
/**
 * Controle des dictionnaires du site : node scripts/i18n-check.mjs [langue ...]
 *   - JSON valide, objet plat ;
 *   - chaque segment de src/locales/_segments.json (genere par `node build.mjs --extract`) a une traduction ;
 *   - memes balises numerotees que la source (<a1>, <b2>, <br3/>), bien imbriquees ;
 *   - pas de texte francais laisse tel quel (hors noms propres), pas de cle inutilisee.
 * Code de sortie 1 s'il reste une erreur.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = path.join(ROOT, 'src', 'locales');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const langs = process.argv.slice(2).length ? process.argv.slice(2) : cfg.site.languages.filter(l => l !== cfg.site.locale);
const segments = JSON.parse(fs.readFileSync(path.join(LOCALES, '_segments.json'), 'utf8'));
const MARK = /<(\/?)([a-z]+)(\d+)(\/?)>/g;

function markers(text) {
  return [...text.matchAll(MARK)].map(m => ({ close: !!m[1], name: m[2], n: Number(m[3]), self: !!m[4] }));
}
function balanced(list) {
  const stack = [];
  for (const m of list) {
    if (m.self) continue;
    if (!m.close) stack.push(m.n);
    else if (stack.pop() !== m.n) return false;
  }
  return stack.length === 0;
}
const sig = list => list.filter(m => !m.close).map(m => `${m.name}${m.n}${m.self ? '/' : ''}`).sort().join(',');

let failed = false;
for (const lang of langs) {
  const file = path.join(LOCALES, `${lang}.json`);
  const problems = [];
  let dict = {};
  try { dict = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { problems.push(`${lang}.json illisible : ${e.message}`); }
  const keys = new Set(segments.map(s => s.key));
  let ok = 0;
  for (const s of segments) {
    const t = dict[s.key];
    if (typeof t !== 'string' || !t.trim()) { problems.push(`manquant : ${s.key}`); continue; }
    const a = markers(s.key), b = markers(t);
    if (sig(a) !== sig(b) || !balanced(b)) { problems.push(`balises differentes : ${s.key}\n      -> ${t}`); continue; }
    if (/["]/.test(t) && s.kind === 'attr') problems.push(`guillemet droit interdit dans un attribut : ${t}`);
    if (t === s.key && s.key.length > 25 && /\s/.test(s.key) && !/[@\d]/.test(s.key) && (s.key.match(/,/g) || []).length < 3) problems.push(`identique au francais : ${s.key}`);
    if (/[«»]/.test(t) && lang !== 'fr') problems.push(`guillemets francais : ${t}`);
    ok++;
  }
  for (const k of Object.keys(dict)) if (!keys.has(k)) problems.push(`cle inutilisee (texte francais modifie ?) : ${k}`);
  console.log(`${lang} : ${ok}/${segments.length} segments valides${problems.length ? `, ${problems.length} probleme(s)` : ''}`);
  problems.slice(0, 40).forEach(p => console.log('  - ' + p));
  if (problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
