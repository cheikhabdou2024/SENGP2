import fs from 'node:fs';
import path from 'node:path';
import { LANGS, money, parseAcceptLanguage, renderNotification, runWithLang, tr } from '../src/i18n';
import { ERRORS, PATTERNS, TEMPLATES } from '../src/i18n/messages';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

describe('parseAcceptLanguage', () => {
  it('prend la premiere langue prise en charge, selon les poids', () => {
    expect(parseAcceptLanguage('ar')).toBe('ar');
    expect(parseAcceptLanguage('pt-BR,fr;q=0.8')).toBe('pt');
    expect(parseAcceptLanguage('sv-SE,sv;q=0.9,es;q=0.5')).toBe('es');
    expect(parseAcceptLanguage('en;q=0.4, fr;q=0.9')).toBe('fr');
    expect(parseAcceptLanguage('EN_gb')).toBe('en');
    expect(parseAcceptLanguage('zh-CN,zh;q=0.9')).toBe('zh');
    expect(parseAcceptLanguage('ja,en;q=0.5')).toBe('ja');
  });
  it('renvoie null si rien n\'est pris en charge ou si l\'en-tete est absent', () => {
    expect(parseAcceptLanguage(undefined)).toBeNull();
    expect(parseAcceptLanguage('')).toBeNull();
    expect(parseAcceptLanguage('sv-SE,pl;q=0.5')).toBeNull();
    expect(parseAcceptLanguage('*')).toBeNull();
    expect(parseAcceptLanguage('fr;q=0')).toBeNull();
  });
});

describe('tr (messages d\'erreur)', () => {
  it('traduit un message connu dans chaque langue', () => {
    expect(tr('Invalid credentials', 'fr')).toBe('Identifiants invalides');
    expect(tr('Invalid credentials', 'ar')).toBe('بيانات الدخول غير صحيحة');
    expect(tr('Invalid credentials', 'es')).toBe('Credenciales no válidas');
    expect(tr('Invalid credentials', 'pt')).toBe('Credenciais inválidas');
    expect(tr('Invalid credentials', 'en')).toBe('Invalid credentials');
  });
  it('sans langue demandee ou message inconnu : le message d\'origine est conserve', () => {
    expect(tr('Invalid credentials', null)).toBe('Invalid credentials');
    expect(tr('Quelque chose d\'inattendu', 'ar')).toBe('Quelque chose d\'inattendu');
  });
  it('messages a variable', () => {
    expect(tr('Minimum withdrawal is 5 000 FCFA', 'en')).toBe('Minimum withdrawal is 5 000 FCFA');
    expect(tr('Minimum withdrawal is 5 000 FCFA', 'es')).toBe('El retiro mínimo es de 5 000 FCFA');
    expect(tr('Minimum withdrawal is 5 000 FCFA', 'ar')).toContain('5 000 FCFA');
  });
  it('utilise la langue de la requete en cours', () => {
    expect(runWithLang('pt', () => tr('Invalid token'))).toBe('Token inválido');
    expect(tr('Invalid token')).toBe('Invalid token');
  });
});

describe('catalogues complets', () => {
  it('chaque message d\'erreur a un texte non vide dans les cinq langues', () => {
    for (const [original, row] of Object.entries(ERRORS)) {
      expect(row).toHaveLength(5);
      row.forEach(text => expect(text.trim().length).toBeGreaterThan(0));
      expect(original.length).toBeGreaterThan(0);
    }
  });
  it('le message d\'origine existe dans le catalogue sous sa forme exacte, en anglais ou en francais', () => {
    for (const [original, row] of Object.entries(ERRORS)) {
      expect([row[0], row[1]]).toContain(original);
    }
  });
  it('les modeles de messages a variable ont leur variable dans les cinq langues', () => {
    for (const p of PATTERNS) for (const text of p.tpl) expect(text).toContain('{1}');
  });
  it('chaque modele de notification a titre et message dans les cinq langues, avec les memes variables', () => {
    for (const [key, t] of Object.entries(TEMPLATES)) {
      for (const part of ['title', 'message'] as const) {
        const row = t[part];
        expect(row).toHaveLength(5);
        row.forEach(text => expect(text.trim().length).toBeGreaterThan(0));
        const ref = vars(row[0]);
        row.forEach((text, i) => expect({ key, part, lang: LANGS[i], vars: vars(text) }).toEqual({ key, part, lang: LANGS[i], vars: ref }));
      }
    }
  });
});

describe('renderNotification', () => {
  it('remplit les variables dans la langue du destinataire', () => {
    const fr = renderNotification('payment_confirmed', 'fr', { amount: money(15000, 'fr') });
    expect(fr.title).toBe('Paiement confirmé');
    expect(fr.message).toContain('FCFA');
    const ar = renderNotification('mission_assigned', 'ar', { route: 'Dakar → Paris', code: 'MSN-1' });
    expect(ar.title).toContain('Dakar → Paris');
    expect(ar.message).toContain('MSN-1');
  });
  it('les montants gardent des chiffres latins, meme en arabe', () => {
    expect(money(15000, 'ar')).toMatch(/^[0-9,.\s]+FCFA$/);
    expect(money(15000, 'ar')).toMatch(/15/);
  });
  it('un modele inconnu est refuse', () => {
    expect(() => renderNotification('inconnu' as any, 'fr')).toThrow();
  });
});

const EXTRA_LANGS = LANGS.filter(l => !['fr', 'en', 'ar', 'es', 'pt'].includes(l));

describe('langues supplementaires (fichiers locales/*.json)', () => {
  const load = (l: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'i18n', 'locales', `${l}.json`), 'utf8'));

  it('chaque langue a un fichier complet : toutes les erreurs, tous les messages a variable, toutes les notifications', () => {
    expect(EXTRA_LANGS.length).toBeGreaterThanOrEqual(9);
    for (const l of EXTRA_LANGS) {
      const d = load(l);
      for (const k of Object.keys(ERRORS)) {
        expect({ l, k, ok: typeof d.errors[k] === 'string' && d.errors[k].trim().length > 0 }).toEqual({ l, k, ok: true });
        expect({ l, k, vars: vars(d.errors[k]) }).toEqual({ l, k, vars: vars(ERRORS[k][0]) });
      }
      PATTERNS.forEach((p, i) => expect({ l, i, ok: String(d.patterns[String(i)]).includes('{1}') }).toEqual({ l, i, ok: true }));
      for (const [key, t] of Object.entries(TEMPLATES)) {
        for (const part of ['title', 'message'] as const) {
          const text = d.templates[key]?.[part];
          expect({ l, key, part, ok: typeof text === 'string' && text.trim().length > 0 }).toEqual({ l, key, part, ok: true });
          expect({ l, key, part, vars: vars(text) }).toEqual({ l, key, part, vars: vars(t[part][0]) });
        }
      }
    }
  });

  it('un message est traduit dans chaque langue supplementaire, avec repli sur l anglais', () => {
    for (const l of EXTRA_LANGS) {
      expect(tr('Invalid credentials', l)).not.toBe('');
      expect(runWithLang(l, () => tr('Invalid token'))).not.toBe('Invalid token');
    }
    expect(renderNotification('payment_confirmed', 'ja', { amount: money(15000, 'ja') }).message).toContain('FCFA');
  });
});
