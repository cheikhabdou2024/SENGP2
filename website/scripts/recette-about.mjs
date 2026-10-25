/** Recette de la page « À propos » — node scripts/recette-about.mjs [dossier] (serveur :8200 + navigateur :9333) */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.argv[2] || 'recette/about';
fs.mkdirSync(OUT, { recursive: true });
const PAGE_URL = 'http://localhost:8200/a-propos/';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (n, ok, x = '') => { results.push(ok); console.log(ok ? 'OK  ' : 'FAIL', n, x); };

async function open(w, h, reduced = false) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: w < 700 });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', e => errors.push('js: ' + e));
  page.on('requestfailed', r => errors.push('req: ' + r.url()));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
  await wait(800);
  return { page, errors };
}
const shot = async (page, sel, f) => {
  await page.$eval(sel, el => el.scrollIntoView({ block: 'start' }));
  await wait(1200);
  await page.screenshot({ path: `${OUT}/${f}.png` });
};
const scrollAll = async page => {
  await page.evaluate(async () => {
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
    window.scrollTo(0, 0);
  });
  await wait(600);
};

{
  const { page, errors } = await open(1440, 900);
  await page.screenshot({ path: `${OUT}/d1440-hero.png` });
  await scrollAll(page);
  await page.screenshot({ path: `${OUT}/d1440-page.png`, fullPage: true });
  for (const [s, f] of [['#mission', 'mission'], ['.pillars', 'engagements'], ['#vision', 'vision'], ['#entreprise', 'entreprise']]) await shot(page, s, `d1440-${f}`);
  check('mission: les liaisons se dessinent à l\'entrée dans l\'écran', await page.evaluate(() => document.querySelector('[data-links]').classList.contains('is-in')));
  check('vision: les 6 routes se dessinent', await page.evaluate(() => document.querySelector('[data-vis]').classList.contains('is-in') && document.querySelectorAll('[data-vis] .dest__route').length === 6));
  check('entreprise: données issues de la configuration (SENEGAL GP, 22 route de l\'aéroport)', await page.evaluate(() => { const t = document.querySelector('#entreprise').innerText; return /SENEGAL GP/.test(t) && /22 route de l/.test(t) && /contact@sengp\.co/.test(t); }));
  check('destinations affichées = 6 destinations réelles', await page.evaluate(() => [...document.querySelectorAll('.vis__tags li')].map(l => l.textContent).join(',') === 'France,Espagne,Italie,États-Unis,Canada,Algérie'));
  check('hero: titre, 3 engagements et 2 boutons', await page.evaluate(() => /voyagent/.test(document.querySelector('.ab-hero h1').textContent) && document.querySelectorAll('.ab-pledges li').length === 3 && document.querySelectorAll('.ab-hero .hero__cta a').length === 2));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.hover('.nav__link[aria-current="page"]');
  check('navigation: « À propos » est la page active', await page.evaluate(() => document.querySelector('.nav__link[aria-current="page"]').textContent === 'À propos'));
  await page.evaluate(() => window.scrollTo(0, 400)); await wait(500);
  check('en-tête: devient vitré au défilement', await page.evaluate(() => document.querySelector('.site-header').classList.contains('is-solid')));
  const links = await page.evaluate(() => [...document.querySelectorAll('main a[href], .site-footer a[href]')].map(a => a.getAttribute('href')));
  const bad = [];
  for (const h of [...new Set(links)].filter(h => h.startsWith('/'))) { const st = await page.evaluate(u => fetch(u.split('#')[0] || '/').then(r => r.status), h); if (st !== 200) bad.push(h); }
  check('liens internes → 200', bad.length === 0, bad.join(','));
  const miss = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)).filter(id => id && !document.getElementById(id)));
  check('ancres résolues', miss.length === 0, miss.join(','));
  const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => i.src));
  check('images chargées', broken.length === 0, broken.join(','));
  check('pas de débordement horizontal (1440)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('aucune erreur console/réseau (1440)', errors.length === 0, errors.join(' | '));
  await page.close();
}

for (const [w, h, t] of [[320, 640, 'm320'], [390, 844, 'm390'], [768, 1024, 't768'], [1024, 768, 'l1024']]) {
  const { page, errors } = await open(w, h);
  await page.screenshot({ path: `${OUT}/${t}-hero.png` });
  await scrollAll(page);
  await page.screenshot({ path: `${OUT}/${t}-page.png`, fullPage: true });
  check(`pas de débordement horizontal (${w})`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check(`aucune erreur (${w})`, errors.length === 0, errors.join(' | '));
  if (w < 700) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('#burger');
    await wait(500);
    await page.screenshot({ path: `${OUT}/${t}-menu.png` });
    await page.keyboard.press('Escape');
    await wait(300);
    for (const [s, f] of [['#mission', 'mission'], ['.pillars', 'engagements'], ['#vision', 'vision'], ['#entreprise', 'entreprise']]) await shot(page, s, `${t}-${f}`);
    const small = await page.evaluate(() => [...document.querySelectorAll('.btn, .nav__link')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => e.className));
    check('zones tactiles ≥ 40 px', small.length === 0, small.join(','));
  }
  await page.close();
}

{
  const { page, errors } = await open(1440, 900, true);
  await page.screenshot({ path: `${OUT}/reduced-hero.png` });
  const r = await page.evaluate(() => ({
    h1: getComputedStyle(document.querySelector('.ab-hero h1')).opacity,
    line: getComputedStyle(document.querySelector('.ab-route__line')).strokeDashoffset,
    zoom: getComputedStyle(document.querySelector('.hw__bg')).animationName,
    vis: document.querySelector('[data-vis]').classList.contains('is-in')
  }));
  check('mouvement réduit: titre visible, tracé complet, pas de zoom, vision affichée', r.h1 === '1' && parseFloat(r.line) === 0 && r.zoom === 'none' && r.vis, JSON.stringify(r));
  check('mouvement réduit: aucune erreur', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.disconnect();
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
process.exit(failed ? 1 : 0);
