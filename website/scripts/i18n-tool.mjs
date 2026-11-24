#!/usr/bin/env node
/**
 * Aide a la traduction des segments du site.
 *   node scripts/i18n-tool.mjs list [debut [fin]]      liste numerotee des segments francais (indices a partir de 0)
 *   node scripts/i18n-tool.mjs merge <langue> <fichier.json>
 *        fichier.json : { "12": "traduction du segment 12", ... } ; fusionne dans src/locales/<langue>.json
 *        (les cles francaises exactes sont retrouvees par l'indice : pas de recopie du francais).
 * Les indices viennent de src/locales/_segments.json (node build.mjs --extract) : ne pas regenerer ce
 * fichier pendant une traduction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCALES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const segments = JSON.parse(fs.readFileSync(path.join(LOCALES, '_segments.json'), 'utf8'));
const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'list') {
  const from = Number(a || 0), to = Number(b || segments.length);
  segments.slice(from, to).forEach((s, k) => {
    console.log(`${from + k}\t${s.kind === 'attr' ? '[attr] ' : ''}${s.key}\t(${s.pages.map(p => p.replace(/\/?index\.html$/, '') || 'accueil').join(', ')})`);
  });
} else if (cmd === 'merge') {
  const file = path.join(LOCALES, `${a}.json`);
  const dict = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const input = JSON.parse(fs.readFileSync(b, 'utf8'));
  let n = 0;
  for (const [idx, text] of Object.entries(input)) {
    const s = segments[Number(idx)];
    if (!s) { console.error(`indice inconnu : ${idx}`); process.exit(1); }
    if (typeof text !== 'string' || !text.trim()) { console.error(`traduction vide pour ${idx}`); process.exit(1); }
    dict[s.key] = text;
    n++;
  }
  const ordered = Object.fromEntries(segments.filter(s => s.key in dict).map(s => [s.key, dict[s.key]]));
  fs.writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n');
  console.log(`${n} traduction(s) fusionnee(s) -> ${a}.json (${Object.keys(ordered).length}/${segments.length})`);
} else {
  console.error('usage : list [debut [fin]] | merge <langue> <fichier.json>');
  process.exit(1);
}
