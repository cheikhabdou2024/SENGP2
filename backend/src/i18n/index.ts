import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';
import { ERRORS, PATTERNS, TEMPLATES } from './messages';

/** Langues prises en charge (meme liste que le frontend : frontend/i18n.js). */
export const LANGS = ['fr', 'en', 'ar', 'es', 'pt'] as const;
export type Lang = (typeof LANGS)[number];
const INDEX: Record<Lang, number> = { fr: 0, en: 1, ar: 2, es: 3, pt: 4 };
const LOCALE_TAG: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-u-nu-latn', es: 'es', pt: 'pt' };

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
  if (row) return row[INDEX[lang]];
  for (const p of PATTERNS) {
    const m = p.re.exec(message);
    if (m) return p.tpl[INDEX[lang]].replace('{1}', m[1]);
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
  return { title: fill(t.title[INDEX[lang]], params), message: fill(t.message[INDEX[lang]], params) };
}
