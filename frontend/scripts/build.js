#!/usr/bin/env node
/**
 * Build statique : copie les pages, scripts, styles et images dans www/ (Vercel + Capacitor).
 * Remplace l'ancien `mkdir -p www && cp ...` qui ne fonctionnait pas sous Windows.
 *
 * Etape en plus : le service worker recoit un identifiant de build, de sorte que chaque
 * deploiement invalide l'ancien cache (sw.js : `sengp-__BUILD_ID__`).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'www');

function buildId() {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv.slice(0, 8);
  try {
    return execSync('git rev-parse --short=8 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) {
    return 'dev' + Date.now().toString(36);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const files = fs.readdirSync(root).filter(f => /\.(html|js|css)$/.test(f) || f === 'manifest.json');
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const dir of ['im', 'icons']) fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });

const id = buildId();
const swPath = path.join(out, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('__BUILD_ID__')) throw new Error('sw.js: placeholder __BUILD_ID__ introuvable');
fs.writeFileSync(swPath, sw.replace(/__BUILD_ID__/g, id));

console.log(`build ok : ${files.length} fichiers, service worker sengp-${id}`);
