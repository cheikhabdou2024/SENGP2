/** Recette de la page « Comment ça marche » — node scripts/recette-how.mjs [dossier] (serveur :8200 + navigateur :9333) */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.argv[2] || 'recette/how';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8200', PAGE_URL = BASE + '/comment-ca-marche/';
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
const shot = async (page, sel, f, block = 'start') => {
  await page.$eval(sel, (el, b) => el.scrollIntoView({ block: b }), block);
  await wait(900);
  await page.screenshot({ path: `${OUT}/${f}.png` });
};
const scrollAll = async page => {
  await page.evaluate(async () => {
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
    window.scrollTo(0, 0);
  });
  await wait(500);
};

{
  const { page, errors } = await open(1440, 900);
  await page.screenshot({ path: `${OUT}/d1440-hero.png` });
  await scrollAll(page);
  await page.screenshot({ path: `${OUT}/d1440-page.png`, fullPage: true });

  const active = () => page.evaluate(() => {
    const r = document.querySelector('#expediteurs');
    return [...r.querySelectorAll('.phone3d__shot')].findIndex(s => s.classList.contains('is-on')) + '/' + [...r.querySelectorAll('[data-step]')].findIndex(s => s.classList.contains('is-active'));
  });
  const seen = [];
  for (const k of [0, 1, 2, 3]) {
    await page.evaluate(k => {
      const it = document.querySelectorAll('#expediteurs [data-step]')[k];
      const r = it.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top + r.height / 2 - innerHeight * 0.5);
    }, k);
    await wait(700);
    seen.push(await active());
    await page.screenshot({ path: `${OUT}/d1440-expediteur-${k + 1}.png` });
  }
  check("expéditeur: l'écran du téléphone suit l'étape lue au défilement", seen.join(',') === '0/0,1/1,2/2,3/3', seen.join(','));

  await page.evaluate(() => document.querySelectorAll('#voyageurs [data-step]')[2].click());
  await wait(700);
  check("voyageur: clic sur une étape change l'écran", await page.evaluate(() => [...document.querySelectorAll('#voyageurs .phone3d__shot')].findIndex(s => s.classList.contains('is-on')) === 2));
  await shot(page, '#voyageurs', 'd1440-voyageur');

  const trk = await page.evaluate(async () => {
    const t = document.querySelector('[data-track]');
    const out = [];
    for (const f of [0.0, 0.5, 1.0]) {
      window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - innerHeight * 0.85 + (t.offsetHeight * 0.9 + innerHeight * 0.1) * f);
      await new Promise(r => setTimeout(r, 450));
      out.push([+getComputedStyle(t).getPropertyValue('--tp'), t.querySelectorAll('.tcard.is-on').length]);
    }
    return out;
  });
  check('suivi: le tracé et les cartes progressent avec le défilement', trk[0][0] < trk[1][0] && trk[1][0] < trk[2][0] && trk[0][1] <= trk[1][1] && trk[1][1] < trk[2][1] && trk[2][1] === 4, JSON.stringify(trk));
  await shot(page, '[data-track]', 'd1440-suivi', 'center');

  await shot(page, '#paiement', 'd1440-paiement');
  check('paiement: Visa / Mastercard non annoncés', await page.evaluate(() => !/visa|mastercard/i.test(document.querySelector('#paiement').innerText)));

  await shot(page, '#questions', 'd1440-faq');
  await page.click('#fq3');
  await wait(500);
  const faq = await page.evaluate(() => ({ open: [...document.querySelectorAll('.faqx__q')].map(q => q.getAttribute('aria-expanded') === 'true' ? '1' : '0').join(''), h: document.getElementById('fa3').getBoundingClientRect().height }));
  check('FAQ: une seule réponse ouverte, la 3e', faq.open === '00100' && faq.h > 20, JSON.stringify(faq));
  await page.click('#fq3');
  await wait(400);
  check('FAQ: la réponse se referme', await page.evaluate(() => [...document.querySelectorAll('.faqx__q')].every(q => q.getAttribute('aria-expanded') === 'false')));
  await page.focus('#fq1');
  await page.keyboard.press('ArrowDown');
  check('FAQ: flèche bas déplace le focus', await page.evaluate(() => document.activeElement.id === 'fq2'));
  await page.screenshot({ path: `${OUT}/d1440-faq-focus.png` });

  const links = await page.evaluate(() => [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')));
  const bad = [];
  for (const h of [...new Set(links)].filter(h => h.startsWith('/'))) {
    const st = await page.evaluate(u => fetch(u.split('#')[0] || '/').then(r => r.status), h);
    if (st !== 200) bad.push(h);
  }
  check('liens internes → 200', bad.length === 0, bad.join(','));
  const miss = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute('href').slice(1)).filter(id => id && !document.getElementById(id)));
  check('ancres résolues', miss.length === 0, miss.join(','));
  check('pas de débordement horizontal (1440)', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('aucune erreur console/réseau (1440)', errors.length === 0, errors.join(' | '));
  await page.close();
}

for (const [w, h, t] of [[360, 740, 'm360'], [390, 844, 'm390'], [768, 1024, 't768'], [1024, 768, 'l1024']]) {
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
    for (const [s, f] of [['#expediteurs', 'expediteur'], ['#suivi', 'suivi'], ['#voyageurs', 'voyageur'], ['#paiement', 'paiement'], ['#questions', 'faq']]) await shot(page, s, `${t}-${f}`);
    const small = await page.evaluate(() => [...document.querySelectorAll('.btn, .faqx__q, .nav__link')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => e.className));
    check('zones tactiles ≥ 40 px', small.length === 0, small.join(','));
  }
  await page.close();
}

{
  const { page, errors } = await open(1440, 900, true);
  await page.screenshot({ path: `${OUT}/reduced-hero.png` });
  const r = await page.evaluate(() => ({
    h1: getComputedStyle(document.querySelector('.hw h1')).opacity,
    anim: getComputedStyle(document.querySelector('.hw__bg')).animationName,
    tp: document.querySelector('[data-track]').style.getPropertyValue('--tp'),
    cards: document.querySelectorAll('.tcard.is-on').length
  }));
  check('mouvement réduit: titre visible, pas de zoom, suivi affiché en entier', r.h1 === '1' && r.anim === 'none' && +r.tp === 1 && r.cards === 4, JSON.stringify(r));
  check('mouvement réduit: aucune erreur', errors.length === 0, errors.join(' | '));
  await page.close();
}

await browser.disconnect();
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} vérifications réussies`);
process.exit(failed ? 1 : 0);
