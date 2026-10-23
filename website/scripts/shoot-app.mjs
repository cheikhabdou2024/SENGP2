/**
 * Capture les écrans réels de l'application (données de démonstration neutres)
 * pour les maquettes de téléphone du site.
 * Prérequis : serveur du dossier frontend/ sur :8123 et Edge/Chrome avec --remote-debugging-port=9333.
 *   node website/scripts/shoot-app.mjs   (puppeteer-core requis)
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = process.argv[2] || 'website/src/assets/app';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const wait = ms => new Promise(r => setTimeout(r, ms));

const mission = (id, st, to, price, w) => ({ id, status: st, mission_code: 'SENGP-00' + id, tracking_number: 'SENGP00' + id, departure_city: 'Dakar', departure_country: 'Sénégal', arrival_city: to[0], arrival_country: to[1], price, package_weight: w, weight: w, departure_date: '2030-11-05T10:30:00Z', recipient_name: 'Destinataire', package_type: 'carton', description: 'Colis' });
const trip = (id, st, to, w) => ({ id, status: st, trip_code: 'TRJ-00' + id, departure_city: 'Dakar', departure_country: 'Sénégal', arrival_city: to[0], arrival_country: to[1], departure_date: '2030-11-05T10:30:00Z', arrival_date: '2030-11-05T18:45:00Z', available_weight: w, current_packages: 1, max_packages: 4 });
const MISSIONS = [mission(1, 'matched', ['Paris', 'France'], 15000, 3), mission(2, 'in_transit', ['Madrid', 'Espagne'], 22000, 5), mission(3, 'delivered', ['Rome', 'Italie'], 12000, 2)];
const TRIPS = [trip(1, 'active', ['Paris', 'France'], 15), trip(2, 'published', ['Alger', 'Algérie'], 20), trip(3, 'completed', ['Montréal', 'Canada'], 30)];

async function shoot(name, path, type, action) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((type, ms, ts) => {
    localStorage.setItem('authToken', 'demo');
    localStorage.setItem('userData', JSON.stringify({ user_type: type, first_name: type === 'gp' ? 'Moussa' : 'Awa', last_name: 'Diop', email: 'demo@example.com', is_email_verified: true }));
    const real = window.fetch;
    const ok = d => Promise.resolve({ ok: true, json: async () => ({ success: true, data: d }) });
    window.fetch = function (u) {
      const url = String(u).replace(/^.*\/api\/v1/, '');
      if (!/^\//.test(url)) return real.apply(this, arguments);
      if (/my-trips/.test(url)) return ok(ts);
      if (/my-missions|\/missions\b|shipments/.test(url)) return ok(ms);
      if (/my-notifications/.test(url)) return ok([]);
      return ok([]);
    };
  }, type, MISSIONS, TRIPS);
  await page.goto('http://localhost:8123/' + path, { waitUntil: 'load' });
  await wait(1800);
  await page.evaluate(() => document.querySelectorAll('#sengp-install-banner,.sengp-modal-overlay,#gpsGate').forEach(e => e.remove()));
  if (action) { await page.evaluate(action); await wait(900); }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
  console.log('ok', name);
}

await shoot('exp-accueil', 'dashexpediteur.html', 'expediteur');
await shoot('exp-envois', 'envois.html', 'expediteur');
await shoot('exp-suivi', 'suivi.html', 'expediteur');
await shoot('gp-accueil', 'dashgp.html', 'gp');
await shoot('gp-missions', 'dashgp.html', 'gp', () => openMissionsSheet('all'));
await shoot('gp-trajets', 'trajets.html', 'gp');
await browser.disconnect();
