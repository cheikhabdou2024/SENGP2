/**
 * Localisation d'une page HTML deja rendue (en francais) : les textes sont remplaces par leur traduction.
 *
 * Le francais reste la source unique : aucune page n'est dupliquee. Chaque « segment » (un bloc de texte,
 * avec ses balises de mise en forme) est cherche dans le dictionnaire de la langue, par son texte francais.
 *
 * Forme d'un segment (la cle du dictionnaire) : le texte du bloc, ou les balises de mise en forme sont
 * numerotees dans l'ordre d'apparition et leurs attributs retires :
 *     Voir <a1>toutes les destinations</a1>, <b2>sans frais</b2>.
 * La traduction garde les memes balises numerotees, dans l'ordre que veut la langue ; les attributs
 * (lien, classe...) sont remis automatiquement. Les attributs alt, title, aria-label, placeholder... sont
 * traduits separement, par leur valeur.
 */
import { attrs, getAttr, mapAttrs, parse, serialize, setAttr, removeAttr, walk } from './html.mjs';

// Elements qui restent dans le fil du texte (tout le reste coupe un segment).
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);
const TRANSLATABLE_ATTRS = new Set(['alt', 'title', 'aria-label', 'placeholder', 'aria-description', 'data-title', 'data-cities', 'data-label-open', 'data-label-close']);
const TODO = '[À COMPLÉTER';

export const collapse = s => String(s).replace(/\s+/g, ' ').trim();
const plain = html => html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;|&#\d+;/gi, ' ');
const hasLetters = html => /\p{L}/u.test(plain(html));

const hasFlag = (el, flag) => getAttr(el.open, flag) !== undefined;
const skipped = el => hasFlag(el, 'data-no-i18n');

function isInline(el) {
  if (el.t !== 'el' || !INLINE.has(el.name.toLowerCase()) || skipped(el)) return false;
  return el.children.every(c => c.t === 'text' || (c.t === 'el' && isInline(c)));
}

/** Forme « gabarit » d'une suite de noeuds, et table des balises numerotees. */
function template(nodes) {
  const markers = [null];
  const rec = list => list.map(n => {
    if (n.t !== 'el') return n.v;
    const idx = markers.length;
    markers.push(n);
    const name = n.name.toLowerCase();
    if (!n.children.length && (n.selfClose || name === 'br' || name === 'wbr')) return `<${name}${idx}/>`;
    return `<${name}${idx}>${rec(n.children)}</${name}${idx}>`;
  }).join('');
  return { tpl: rec(nodes), markers };
}

/** Remet les vraies balises (avec leurs attributs) dans une traduction. Lance une erreur si elle est incoherente. */
function rebuild(translated, markers, key) {
  const seenOpen = new Set();
  const seenClose = new Set();
  const stack = [];
  const out = translated.replace(/<(\/?)([a-z]+)(\d+)(\/?)>/g, (all, slash, name, num, self) => {
    const i = Number(num);
    const m = markers[i];
    const fail = why => { throw new Error(`Balise ${all} ${why} dans la traduction de « ${key} »`); };
    if (!m || m.name.toLowerCase() !== name) fail('inconnue');
    const isVoid = !m.children.length && (m.selfClose || ['br', 'wbr'].includes(name));
    if (self) { if (!isVoid || seenOpen.has(i)) fail('en trop'); seenOpen.add(i); return m.open; }
    if (!slash) { if (seenOpen.has(i)) fail('en double'); seenOpen.add(i); stack.push(i); return m.open; }
    if (stack.pop() !== i) fail('mal imbriquee');
    seenClose.add(i);
    return m.close || `</${m.name}>`;
  });
  if (stack.length) throw new Error(`Balise non fermee dans la traduction de « ${key} »`);
  for (let i = 1; i < markers.length; i++) {
    if (!seenOpen.has(i)) throw new Error(`Balise <${markers[i].name.toLowerCase()}${i}> manquante dans la traduction de « ${key} »`);
  }
  return out;
}

/** Chemin interne a localiser : '/faq/#x' -> { path: '/faq/', rest: '#x' }. */
function splitHref(href) {
  if (!href || href[0] !== '/' || href[1] === '/') return null;
  const m = /^([^?#]*)(.*)$/.exec(href);
  return { path: m[1], rest: m[2] };
}

/**
 * options :
 *   lang        langue cible ('fr' = pas de traduction : sert a l'extraction et au nettoyage des marqueurs)
 *   translate   (cle, genre) => traduction | undefined ; genre : 'text' | 'attr'
 *   localizable ensemble des chemins de pages disponibles dans toutes les langues ('/', '/faq/'...)
 *   fixed       ensemble des chemins de pages qui n'existent qu'en francais (textes juridiques)
 */
export function localizeHtml(html, { lang, translate, localizable = new Set(), fixed = new Set() }) {
  const tree = parse(html);
  const prefix = lang === 'fr' ? '' : `/${lang}`;

  // 1. attributs : liens internes et textes d'attributs
  const visit = (node, noI18n) => {
    if (node.t !== 'el') { (node.children || []).forEach(c => visit(c, noI18n)); return; }
    const off = noI18n || skipped(node);
    const lower = node.name.toLowerCase();
    if (!off && (lower === 'a' || lower === 'area')) {
      const h = splitHref(getAttr(node.open, 'href'));
      if (h && prefix && localizable.has(h.path)) {
        node.open = mapAttrs(node.open, (n, v) => (n.toLowerCase() === 'href' ? prefix + (h.path === '/' ? '/' : h.path) + h.rest : undefined));
      } else if (h && prefix && fixed.has(h.path)) {
        node.open = setAttr(setAttr(node.open, 'hreflang', 'fr'), 'lang', 'fr');
      }
    }
    if (!off && prefix) {
      const metaOk = lower === 'meta' && (['description'].includes(getAttr(node.open, 'name')) || ['og:title', 'og:description'].includes(getAttr(node.open, 'property')));
      node.open = mapAttrs(node.open, (n, v) => {
        const name = n.toLowerCase();
        if (v == null || !(TRANSLATABLE_ATTRS.has(name) || (metaOk && name === 'content'))) return undefined;
        if (!hasLetters(v) || v.includes(TODO)) return undefined;
        const t = translate(collapse(v), 'attr');
        return t === undefined ? undefined : t;
      });
    }
    node.children.forEach(c => visit(c, off));
  };
  visit(tree, false);

  // 2. textes : suites de texte et de balises de mise en forme
  const process = parent => {
    const split = parent.t === 'el' && hasFlag(parent, 'data-i18n-split');
    const out = [];
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const { tpl, markers } = template(run);
      const key = collapse(tpl);
      if (prefix && hasLetters(tpl) && !tpl.includes(TODO) && key) {
        const t = translate(key, 'text');
        if (t !== undefined) {
          const lead = /^\s*/.exec(tpl)[0];
          const trail = /\s*$/.exec(tpl)[0];
          out.push({ t: 'raw', v: lead + rebuild(t, markers, key) + (trail === tpl ? '' : trail) });
          run = [];
          return;
        }
      }
      out.push(...run);
      run = [];
    };
    for (const c of parent.children) {
      if (c.t === 'text' || (c.t === 'el' && isInline(c))) { run.push(c); if (split && c.t === 'el') flush(); continue; }
      flush();
      if (c.t === 'el' && !skipped(c)) process(c);
      out.push(c);
    }
    flush();
    parent.children = out;
  };
  process(tree);

  // 3. nettoyage des marqueurs internes
  walk(tree, n => {
    if (n.t === 'el' && (hasFlag(n, 'data-no-i18n') || hasFlag(n, 'data-i18n-split'))) {
      n.open = removeAttr(removeAttr(n.open, 'data-no-i18n'), 'data-i18n-split');
    }
  });
  return serialize(tree);
}

/** Tous les segments d'une page (textes et attributs), dans l'ordre. Sert a l'extraction. */
export function collectSegments(html, options = {}) {
  const found = [];
  localizeHtml(html, {
    ...options,
    lang: 'xx',
    translate: (key, kind) => { found.push({ key, kind }); return undefined; },
  });
  return found;
}

export { attrs };
