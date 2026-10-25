/**
 * Captures réelles des parcours de l'application (données de démonstration neutres) pour la page
 * « Comment ça marche » : création d'envoi (4 étapes) et parcours voyageur.
 * Prérequis : serveur du dossier frontend/ sur :8123, navigateur avec --remote-debugging-port=9333.
 *   node website/scripts/shoot-flow.mjs <photo-colis.png> [dossier-de-sortie]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const PHOTO = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3] || 'website/src/assets/app');
const FRONT = path.resolve('frontend');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(FRONT, '__qa'), { recursive: true });
fs.copyFileSync(PHOTO, path.join(FRONT, '__qa/photo.png'));
fs.writeFileSync(path.join(FRONT, '__create_page.html'), fs.readFileSync(path.join(FRONT, 'creenvoi.html'), 'utf8').replace(/<script src="https:\/\/cdnjs[^>]*qrcode[^>]*><\/script>/, ''));

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const wait = ms => new Promise(r => setTimeout(r, ms));

async function newPage(userType) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((userType) => {
    localStorage.setItem('authToken', 'demo');
    localStorage.setItem('sengp-install-dismissed', String(Date.now()));   // pas de bannière d'installation sur les captures
    localStorage.setItem('userData', JSON.stringify({ user_type: userType, first_name: 'Awa', last_name: 'Diop', email: 'demo@example.com', is_email_verified: true }));
    window.__mission = window.__mission || null;
    const real = window.fetch;
    const ok = d => Promise.resolve({ ok: true, json: async () => ({ success: true, data: d }) });
    window.fetch = function (u, o) {
      const url = String(u).replace(/^.*\/api\/v1/, '');
      if (!/^\//.test(url)) return real.apply(this, arguments);
      if (/my-missions/.test(url)) return ok(window.__mission ? [window.__mission] : []);
      if (/my-notifications|my-trips/.test(url)) return ok([]);
      if (/uploads/.test(url)) return ok({ key: 'demo.jpg' });
      return ok([]);
    };
  }, userType);
  return page;
}
const save = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('ok', name);
};
const clean = page => page.evaluate(() => document.querySelectorAll('#sengp-install-banner, #gpsGate').forEach(e => e.remove()));

// ---------------------------------------------------------------- expéditeur : 4 étapes
{
  const page = await newPage('expediteur');
  await page.goto('http://localhost:8123/__create_page.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.analyzePhoto === 'function', { timeout: 60000 });
  await clean(page);
  await (await page.$('#mediaInput')).uploadFile(path.join(FRONT, '__qa/photo.png'));
  await page.waitForFunction(() => !document.getElementById('mediaPreview').hidden, { timeout: 60000 });
  await page.evaluate(() => {
    document.querySelectorAll('#tyGrid input')[0].click();
    const w = document.getElementById('packageWeight'); w.value = '2'; w.dispatchEvent(new Event('input'));
    const d = document.getElementById('description'); d.value = 'Documents'; d.dispatchEvent(new Event('input'));
  });
  await wait(500); await save(page, 'flow-1');
  await page.evaluate(() => nextStep()); await wait(700);
  await page.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input')); };
    selectedDeparture = locations.find(l => l.city === 'Dakar'); selectLocation(selectedDeparture);
    currentModalType = 'arrival'; selectLocation(locations.find(l => l.city === 'Paris'));
    set('receiverName', 'Awa Ndiaye'); set('receiverPhone', '77 652 34 58'); set('pickupAddress', 'Rue 10, Médina'); set('deliveryAddress', '12 rue de Rivoli'); set('desiredDepartureDate', '2030-10-21');
  });
  await wait(500); await save(page, 'flow-2');
  await page.evaluate(() => nextStep()); await wait(900); await save(page, 'flow-3');
  await page.evaluate(() => nextStep()); await wait(900); await save(page, 'flow-4');
  await page.close();
}

// ---------------------------------------------------------------- voyageur
{
  const page = await newPage('gp');
  await page.goto('http://localhost:8123/creetrajet.html', { waitUntil: 'load' });
  await wait(1200); await clean(page);
  await page.evaluate(() => { uploadedFile = new File(['x'], 'billet.png'); nextStep(); pickCity('dep', 'Sénégal', 'Dakar'); pickCity('arr', 'France', 'Paris'); trip.depDT = '2030-11-05T10:30'; trip.arrDT = '2030-11-05T18:45'; renderDate('Dep', trip.depDT); renderDate('Arr', trip.arrDT); const r = document.getElementById('availableWeight'); r.value = 18; syncWeight(); });
  await wait(700); await save(page, 'gp-trip');
  await page.close();
}
for (const [name, mission] of [
  ['gp-pickup', { id: 'm1', status: 'accepted', mission_code: 'SENGP-001', departure_city: 'Dakar', arrival_city: 'Paris', recipient_name: 'Awa Ndiaye' }],
  ['gp-qr', { id: 'm1', status: 'out_for_delivery', arrival_confirmed: true, mission_code: 'SENGP-001', departure_city: 'Dakar', arrival_city: 'Paris', recipient_name: 'Awa Ndiaye' }]
]) {
  const page = await newPage('gp');
  await page.evaluateOnNewDocument(m => { window.__mission = m; }, mission);
  await page.goto('http://localhost:8123/dashgp.html', { waitUntil: 'load' });
  await wait(1500);
  await page.evaluate(() => { document.getElementById('gpsGate').classList.remove('show'); initJourney(); }); await wait(1500);
  await clean(page);
  await save(page, name);
  await page.close();
}
fs.rmSync(path.join(FRONT, '__qa'), { recursive: true, force: true });
fs.rmSync(path.join(FRONT, '__create_page.html'), { force: true });
await browser.disconnect();
