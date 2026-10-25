/**
 * Recette visuelle et fonctionnelle de la page d'accueil (Edge/Chrome via puppeteer-core).
 *   node scripts/serve.mjs 8200   puis   chrome --remote-debugging-port=9333
 *   node scripts/recette.mjs [dossier]       → captures dans recette/ (non versionné)
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.argv[2] || 'recette';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8200';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const results = [];
const check = (name, ok, extra = '') => { results.push([name, ok]); log(ok ? 'OK  ' : 'FAIL', name, extra); };

async function open(w, h, { reduced = false, mobile } = {}) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  const isMobile = mobile ?? w < 700;
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile, hasTouch: isMobile });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', e => errors.push('js: ' + e));
  page.on('requestfailed', r => errors.push('req: ' + r.url()));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' }); // défilements instantanés pendant les tests
  await wait(900);
  return { page, errors };
}
const scrollToAll = async page => {
  await page.evaluate(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); } window.scrollTo(0, 0); });
  await wait(500);
};
const sectionShot = async (page, sel, file, pad = 0) => {
  const h = await page.$(sel);
  await h.evaluate(el => el.scrollIntoView({ block: 'start' }));
  await wait(900);
  await page.screenshot({ path: `${OUT}/${file}.png` });
};

// ------------------------------------------------------------ ordinateur 1440
{
  const { page, errors } = await open(1440, 900);
  await page.screenshot({ path: `${OUT}/d1440-hero.png` });
  await scrollToAll(page);
  await page.screenshot({ path: `${OUT}/d1440-page.png`, fullPage: true });
  for (const [sel, f] of [['#parcours', 'd1440-parcours'], ['#fonctionnement', 'd1440-fonctionnement'], ['#application', 'd1440-application'], ['#destinations', 'd1440-destinations'], ['#engagements', 'd1440-engagements']]) await sectionShot(page, sel, f);

  // parcours : clic + clavier
  await page.evaluate(() => document.getElementById('parcours').scrollIntoView());
  await page.click('#tab-gp'); await wait(600);
  check('parcours: clic sur GP affiche le panneau GP', await page.evaluate(() => !document.getElementById('panel-gp').hidden && document.getElementById('panel-exp').hidden));
  await page.screenshot({ path: `${OUT}/d1440-parcours-gp.png` });
  await page.focus('#tab-gp'); await page.keyboard.press('ArrowLeft'); await wait(300);
  check('parcours: flèche gauche revient à Expéditeur', await page.evaluate(() => document.getElementById('tab-exp').getAttribute('aria-selected') === 'true'));

  // application : onglets
  await page.evaluate(() => document.getElementById('application').scrollIntoView());
  await page.click('#atab-suivi'); await wait(800);
  check('application: onglet Suivi change la capture', await page.evaluate(() => document.getElementById('apanel-suivi').classList.contains('is-on') && !document.getElementById('apanel-exp').classList.contains('is-on')));
  await page.screenshot({ path: `${OUT}/d1440-application-suivi.png` });
  await page.click('#atab-gp'); await wait(800);
  check('application: onglet GP change la capture', await page.evaluate(() => document.getElementById('apanel-gp').classList.contains('is-on')));
  await page.screenshot({ path: `${OUT}/d1440-application-gp.png` });

  // destinations
  await page.evaluate(() => document.getElementById('destinations').scrollIntoView());
  await wait(1500);
  await page.click('[data-dest-btn="canada"]'); await wait(500);
  check('destinations: Canada active la liaison et le texte', await page.evaluate(() => document.querySelector('[data-route="canada"]').classList.contains('is-active') && /Canada/.test(document.getElementById('destTitle').textContent) && /Montréal/.test(document.getElementById('destCities').textContent)));
  await page.screenshot({ path: `${OUT}/d1440-destinations-canada.png` });

  // parcours du fil d'itinéraire
  const prog = await page.evaluate(async () => {
    const j = document.querySelector('[data-journey]'); const out = [];
    for (const y of [0.1, 0.5, 0.9]) { window.scrollTo(0, j.getBoundingClientRect().top + scrollY + j.offsetHeight * y - innerHeight * 0.5); await new Promise(r => setTimeout(r, 400)); out.push([parseFloat(getComputedStyle(j).getPropertyValue('--p')), j.querySelectorAll('.is-on').length]); }
    return out;
  });
  check('fonctionnement: la progression augmente avec le défilement', prog[0][0] < prog[1][0] && prog[1][0] < prog[2][0] + 0.001 && prog[0][1] <= prog[1][1] && prog[1][1] <= prog[2][1], JSON.stringify(prog));

  // liens
  const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/')));
  let bad = [];
  for (const href of [...new Set(links.map(h => h.split('#')[0] || '/'))]) { const r = await page.evaluate(u => fetch(u).then(x => x.status), href); if (r !== 200) bad.push(href + ' ' + r); }
  check('liens internes → 200', bad.length === 0, bad.join(','));
  const anchors = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"], a[href^="/#"]')].map(a => a.getAttribute('href').split('#')[1]).filter(Boolean).filter(id => !document.getElementById(id)));
  check('ancres de la page résolues', anchors.length === 0, anchors.join(','));
  check('pas de débordement horizontal (1440)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('aucune erreur console/réseau (1440)', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ------------------------------------------------------------------ tailles
for (const [w, h, tag] of [[360, 740, 'm360'], [390, 844, 'm390'], [768, 1024, 't768'], [1024, 768, 'l1024']]) {
  const { page, errors } = await open(w, h);
  await page.screenshot({ path: `${OUT}/${tag}-hero.png` });
  await scrollToAll(page);
  await page.screenshot({ path: `${OUT}/${tag}-page.png`, fullPage: true });
  check(`pas de débordement horizontal (${w})`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check(`aucune erreur (${w})`, errors.length === 0, errors.join(' | '));
  if (w < 700) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#burger'); await wait(500);
    await page.screenshot({ path: `${OUT}/${tag}-menu.png` });
    check('menu mobile: ouvert', await page.evaluate(() => document.getElementById('nav').classList.contains('is-open') && document.getElementById('burger').getAttribute('aria-expanded') === 'true'));
    await page.keyboard.press('Escape'); await wait(300);
    check('menu mobile: Échap le ferme', await page.evaluate(() => !document.getElementById('nav').classList.contains('is-open')));
    for (const [sel, f] of [['#parcours', 'parcours'], ['#fonctionnement', 'fonctionnement'], ['#application', 'application'], ['#destinations', 'destinations']]) await sectionShot(page, sel, `${tag}-${f}`);
    const tap = await page.evaluate(() => [...document.querySelectorAll('.btn, .parc__tab, .appdemo__tab, .dest__btn, .nav__link')].filter(e => e.offsetParent && (e.getBoundingClientRect().height < 40)).map(e => e.className));
    check('zones tactiles ≥ 40 px', tap.length === 0, tap.join(','));
  }
  await page.close();
}

// ----------------------------------------------------------- mouvement réduit
{
  const { page, errors } = await open(1440, 900, { reduced: true });
  await page.screenshot({ path: `${OUT}/reduced-hero.png` });
  const st = await page.evaluate(() => ({
    h1: getComputedStyle(document.querySelector('.hx h1')).opacity,
    line: getComputedStyle(document.querySelector('.route__line')).strokeDashoffset,
    anim: getComputedStyle(document.querySelector('.route__plane')).animationName,
    reveal: [...document.querySelectorAll('.reveal')].every(e => getComputedStyle(e).opacity === '1')
  }));
  check('mouvement réduit: titre visible, tracé complet, pas d\'animation d\'avion, sections visibles', st.h1 === '1' && parseFloat(st.line) === 0 && (st.anim === 'none') && st.reveal, JSON.stringify(st));
  check('mouvement réduit: aucune erreur', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ------------------------------------------------------------ pages internes
for (const p of ['/comment-ca-marche/', '/a-propos/', '/faq/', '/contact/', '/mentions-legales/']) {
  const page = await browser.newPage(); await page.setCacheEnabled(false);
  await page.setViewport({ width: 1280, height: 800 });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('requestfailed', r => errors.push(r.url()));
  await page.goto(BASE + p, { waitUntil: 'networkidle0' }); await wait(400);
  const name = p.replace(/\//g, '') || 'x';
  await page.screenshot({ path: `${OUT}/inner-${name}.png` });
  const hdr = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.site-header')).backgroundColor; return c; });
  check(`page ${p}: rendue sans erreur`, errors.length === 0, errors.join(',') + ' header=' + hdr);
  await page.close();
}

await browser.disconnect();
const failed = results.filter(r => !r[1]);
log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
