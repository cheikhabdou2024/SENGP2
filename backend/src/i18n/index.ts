import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';
import { ERRORS, PATTERNS, TEMPLATES } from './messages';
import loc_it from './locales/it.json';
import loc_de from './locales/de.json';
import loc_nl from './locales/nl.json';
import loc_ru from './locales/ru.json';
import loc_zh from './locales/zh.json';
import loc_hi from './locales/hi.json';
import loc_ja from './locales/ja.json';
import loc_ko from './locales/ko.json';
import loc_tr from './locales/tr.json';

/** Langues prises en charge (meme liste que le frontend : frontend/i18n.js). */
export const LANGS = ['fr', 'en', 'ar', 'es', 'pt', 'it', 'de', 'nl', 'ru', 'zh', 'hi', 'ja', 'ko', 'tr'] as const;
export type Lang = (typeof LANGS)[number];
/** Langues d'origine : colonnes des tableaux de messages.ts [fr, en, ar, es, pt]. */
const CORE: Partial<Record<Lang, number>> = { fr: 0, en: 1, ar: 2, es: 3, pt: 4 };
const LOCALE_TAG: Record<Lang, string> = {
  fr: 'fr-FR', en: 'en-GB', ar: 'ar-u-nu-latn', es: 'es', pt: 'pt',
  it: 'it', de: 'de', nl: 'nl', ru: 'ru', zh: 'zh-CN', hi: 'hi-u-nu-latn', ja: 'ja', ko: 'ko', tr: 'tr',
};

/** Autres langues : fichiers locales/<langue>.json (errors, patterns, templates), remplis avec scripts/i18n-fill.mjs. */
interface Extra {
  errors: Record<string, string>;
  patterns: Record<string, string>;
  templates: Record<string, { title?: string; message?: string }>;
}
const EXTRA: Partial<Record<Lang, Extra>> = { it: loc_it, de: loc_de, nl: loc_nl, ru: loc_ru, zh: loc_zh, hi: loc_hi, ja: loc_ja, ko: loc_ko, tr: loc_tr };
/** Une traduction absente d'une de ces langues retombe sur l'anglais (jamais sur un texte vide). */
const FALLBACK_COLUMN = 1;

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * Langue demandee par l'en-tete Accept-Language ("ar", "pt-BR,fr;q=0.8"...), selon les poids q.
 * null si aucune langue prise en charge n'est demandee : le message d'origine est alors conserve.
 */
export function parseAcceptLanguage(header?: string | string[]): Lang | null {
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (!raw) return null;
  const candidates = raw
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find(p => p.trim().startsWith('q='));
      return { base: tag.trim().toLowerCase().split(/[-_]/)[0], q: qParam ? parseFloat(qParam.split('=')[1]) : 1 };
    })
    .filter(c => c.base && !Number.isNaN(c.q) && c.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const c of candidates) if (isLang(c.base)) return c.base;
  return null;
}

const store = new AsyncLocalStorage<{ lang: Lang | null }>();

/** Middleware : memorise la langue de la requete pour toute la chaine de traitement (reponses, notifications). */
export function languageMiddleware(req: Request, _res: Response, next: NextFunction): void {
  store.run({ lang: parseAcceptLanguage(req.headers['accept-language']) }, () => next());
}

/** Langue de la requete en cours, ou null (pas de traduction demandee). */
export function currentLang(): Lang | null {
  return store.getStore()?.lang ?? null;
}

/** Execute `fn` avec une langue donnee (tests, taches hors requete). */
export function runWithLang<T>(lang: Lang | null, fn: () => T): T {
  return store.run({ lang }, fn);
}

/** Texte d'une ligne de messages.ts dans une langue : colonne d'origine, sinon fichier de la langue, sinon anglais. */
function pick(row: readonly string[], lang: Lang, extra?: string): string {
  const col = CORE[lang];
  if (col !== undefined) return row[col];
  return extra && extra.trim() ? extra : row[FALLBACK_COLUMN];
}

function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

/**
 * Message d'erreur traduit. Sans langue demandee ou sans traduction connue, le message d'origine est renvoye
 * (ne jamais masquer une erreur inconnue).
 */
export function tr(message: string, lang: Lang | null = currentLang()): string {
  if (!lang || typeof message !== 'string') return message;
  const row = ERRORS[message];
  if (row) return pick(row, lang, EXTRA[lang]?.errors[message]);
  for (let i = 0; i < PATTERNS.length; i++) {
    const m = PATTERNS[i].re.exec(message);
    if (m) return pick(PATTERNS[i].tpl, lang, EXTRA[lang]?.patterns[String(i)]).replace('{1}', m[1]);
  }
  return message;
}

/** Montant en FCFA, chiffres latins dans toutes les langues. */
export function money(amount: number, lang: Lang = 'fr'): string {
  return `${new Intl.NumberFormat(LOCALE_TAG[lang]).format(Number(amount) || 0)} FCFA`;
}

export type TemplateKey = keyof typeof TEMPLATES;

/** Titre et message d'une notification dans la langue du destinataire. */
export function renderNotification(
  template: TemplateKey,
  lang: Lang,
  params: Record<string, string | number> = {}
): { title: string; message: string } {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`Unknown notification template: ${String(template)}`);
  const extra = EXTRA[lang]?.templates[template as string];
  return {
    title: fill(pick(t.title, lang, extra?.title), params),
    message: fill(pick(t.message, lang, extra?.message), params),
  };
}
