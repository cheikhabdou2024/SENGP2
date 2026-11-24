/**
 * Petit analyseur HTML sans dependance, suffisant pour les pages du site (HTML ecrit a la main, balises
 * toutes fermees). Il sert a la localisation : parse() puis serialize() redonnent exactement le texte d'origine.
 *
 * Noeuds : { t: 'text', v }, { t: 'raw', v } (commentaire, doctype, contenu de script/style, ou HTML deja pret),
 *          { t: 'el', name, open, selfClose, children, close }.
 *   - name  : nom de balise tel qu'ecrit (la casse compte pour le SVG : linearGradient) ;
 *   - open  : balise ouvrante exacte, attributs compris ; close : balise fermante exacte ('' si absente).
 */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style']);

const OPEN_TAG = /<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/y;

export function parse(html) {
  const root = { t: 'root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  let textStart = 0;
  const flushText = end => {
    if (end > textStart) top().children.push({ t: 'text', v: html.slice(textStart, end) });
  };
  while (i < html.length) {
    if (html[i] !== '<') { i++; continue; }
    if (html.startsWith('<!--', i)) {
      const e = html.indexOf('-->', i + 4);
      if (e === -1) throw new Error('Commentaire non ferme');
      flushText(i);
      top().children.push({ t: 'raw', v: html.slice(i, e + 3) });
      i = textStart = e + 3;
      continue;
    }
    if (html.startsWith('<!', i)) {
      const e = html.indexOf('>', i);
      flushText(i);
      top().children.push({ t: 'raw', v: html.slice(i, e + 1) });
      i = textStart = e + 1;
      continue;
    }
    if (html[i + 1] === '/') {
      const m = /<\/([a-zA-Z][\w:-]*)\s*>/y;
      m.lastIndex = i;
      const r = m.exec(html);
      if (!r) { i++; continue; }
      flushText(i);
      const node = top();
      if (node.t !== 'el' || node.name.toLowerCase() !== r[1].toLowerCase()) {
        throw new Error(`Balise fermante inattendue </${r[1]}> (ouverte : ${node.name || 'racine'}) pres de « ${html.slice(Math.max(0, i - 40), i)} »`);
      }
      node.close = r[0];
      stack.pop();
      i = textStart = i + r[0].length;
      continue;
    }
    OPEN_TAG.lastIndex = i;
    const r = OPEN_TAG.exec(html);
    if (!r) { i++; continue; }
    flushText(i);
    const name = r[1];
    const lower = name.toLowerCase();
    const selfClose = r[2].trimEnd().endsWith('/');
    const el = { t: 'el', name, open: r[0], selfClose, children: [], close: '' };
    top().children.push(el);
    i += r[0].length;
    if (selfClose || VOID.has(lower)) { textStart = i; continue; }
    if (RAW_TEXT.has(lower)) {
      const re = new RegExp(`</${lower}\\s*>`, 'i');
      const m = re.exec(html.slice(i));
      if (!m) throw new Error(`<${name}> non ferme`);
      if (m.index) el.children.push({ t: 'raw', v: html.slice(i, i + m.index) });
      el.close = m[0];
      i += m.index + m[0].length;
      textStart = i;
      continue;
    }
    stack.push(el);
    textStart = i;
  }
  flushText(html.length);
  if (stack.length !== 1) throw new Error(`Balise non fermee : <${top().name}>`);
  return root;
}

export function serialize(node) {
  if (node.t === 'text' || node.t === 'raw') return node.v;
  const inner = node.children.map(serialize).join('');
  if (node.t === 'root') return inner;
  return node.open + inner + node.close;
}

// ---------- attributs

const ATTR = /([^\s"'<>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Liste des attributs d'une balise ouvrante : [{ name, value }] (value = null pour un attribut sans valeur). */
export function attrs(open) {
  const body = open.replace(/^<[^\s/>]+/, '').replace(/\/?>$/, '');
  const out = [];
  for (const m of body.matchAll(ATTR)) out.push({ name: m[1], value: m[3] ?? m[4] ?? m[5] ?? null });
  return out;
}

export function getAttr(open, name) {
  const a = attrs(open).find(x => x.name.toLowerCase() === name.toLowerCase());
  return a ? a.value : undefined;
}

const escAttr = v => String(v).replace(/"/g, '&quot;');

/**
 * Reecrit les attributs d'une balise ouvrante. fn(name, value) renvoie la nouvelle valeur (chaine),
 * null pour supprimer l'attribut, ou undefined pour le laisser tel quel.
 */
export function mapAttrs(open, fn) {
  const head = /^<[^\s/>]+/.exec(open)[0];
  const tail = /\/?>$/.exec(open)[0];
  const body = open.slice(head.length, open.length - tail.length);
  let changed = false;
  const rebuilt = body.replace(ATTR, (all, name, eq, dq, sq, bare) => {
    const value = dq ?? sq ?? bare ?? null;
    const next = fn(name, value);
    if (next === undefined || (next !== null && next === value)) return all;
    changed = true;
    if (next === null) return '';
    return `${name}="${escAttr(next)}"`;
  });
  return changed ? head + rebuilt + tail : open;
}

/** Ajoute (ou remplace) un attribut dans une balise ouvrante. */
export function setAttr(open, name, value) {
  let found = false;
  const out = mapAttrs(open, (n) => { if (n.toLowerCase() === name.toLowerCase()) { found = true; return value; } return undefined; });
  if (found) return out;
  const tail = /\/?>$/.exec(out)[0];
  return `${out.slice(0, out.length - tail.length)} ${name}="${escAttr(value)}"${tail}`;
}

export function removeAttr(open, name) {
  return mapAttrs(open, n => (n.toLowerCase() === name.toLowerCase() ? null : undefined)).replace(/\s+(\/?>)$/, '$1');
}

// ---------- parcours

export function walk(node, fn) {
  fn(node);
  if (node.children) node.children.forEach(c => walk(c, fn));
}
