/**
 * SEN GP — internationalisation (langues : fr, en, ar, es, pt).
 *
 * Choix de la langue, dans cet ordre :
 *   1. le choix de l'utilisateur (localStorage 'sengpLang') ;
 *   2. la langue de l'appareil (navigator.languages), si elle est prise en charge ;
 *   3. sinon la langue du pays deduit du fuseau horaire (aucune adresse IP n'est utilisee) ;
 *   4. sinon l'anglais.
 * Le francais est la langue source : le texte ecrit dans les pages reste le francais, et une
 * cle absente d'une langue retombe sur l'anglais puis sur le francais.
 *
 * Utilisation dans une page (apres api.js) :
 *   <script src="i18n.js"></script>
 *   <h1 data-i18n="home.title">Bienvenue</h1>
 *   <input data-i18n-attr="placeholder:common.search" placeholder="Rechercher">
 *   sengpT('errors.generic')                 // texte brut
 *   sengpT('mission.count', { count: 3 })    // pluriel : mission.count.one / .other / ...
 *   SengpI18n.fmt.currency(15000)            // "15 000 FCFA", chiffres latins dans toutes les langues
 *
 * Les valeurs sont toujours inserees comme TEXTE (textContent), jamais comme HTML.
 * Dictionnaires : locales/<langue>.json, a plat ("section.cle": "texte"). Voir docs/i18n.md.
 */
(function (root, factory) {
  var lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  if (typeof window !== 'undefined' && root === window) lib.install(window);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SUPPORTED = ['fr', 'en', 'ar', 'es', 'pt', 'it', 'de', 'nl', 'ru', 'zh', 'hi', 'ja', 'ko', 'tr'];
  var SOURCE = 'fr';
  var FALLBACK = 'en';
  var RTL = ['ar'];
  var STORAGE_KEY = 'sengpLang';
  var NATIVE_NAMES = {
    fr: 'Français', en: 'English', ar: 'العربية', es: 'Español', pt: 'Português',
    it: 'Italiano', de: 'Deutsch', nl: 'Nederlands', ru: 'Русский', zh: '简体中文', hi: 'हिन्दी', ja: '日本語', ko: '한국어', tr: 'Türkçe'
  };
  // Chiffres latins partout (y compris en arabe) : les montants restent lisibles et identiques a l'ecran de paiement.
  var LOCALE_TAGS = {
    fr: 'fr-FR', en: 'en-GB', ar: 'ar-u-nu-latn', es: 'es', pt: 'pt',
    it: 'it', de: 'de', nl: 'nl', ru: 'ru', zh: 'zh-CN', hi: 'hi-u-nu-latn', ja: 'ja', ko: 'ko', tr: 'tr'
  };

  // Pays dont la langue est prise en charge : { ISO: [langue, fuseaux horaires principaux] }.
  var COUNTRIES = {
    FR: ['fr', ['Europe/Paris']], BE: ['fr', ['Europe/Brussels']], LU: ['fr', ['Europe/Luxembourg']], MC: ['fr', ['Europe/Monaco']],
    SN: ['fr', ['Africa/Dakar']], ML: ['fr', ['Africa/Bamako']], CI: ['fr', ['Africa/Abidjan']], BF: ['fr', ['Africa/Ouagadougou']],
    GN: ['fr', ['Africa/Conakry']], NE: ['fr', ['Africa/Niamey']], TG: ['fr', ['Africa/Lome']], BJ: ['fr', ['Africa/Porto-Novo']],
    CM: ['fr', ['Africa/Douala']], GA: ['fr', ['Africa/Libreville']], CG: ['fr', ['Africa/Brazzaville']], CD: ['fr', ['Africa/Kinshasa', 'Africa/Lubumbashi']],
    MG: ['fr', ['Indian/Antananarivo']], DJ: ['fr', ['Africa/Djibouti']], CF: ['fr', ['Africa/Bangui']], TD: ['fr', ['Africa/Ndjamena']],
    HT: ['fr', ['America/Port-au-Prince']], RE: ['fr', ['Indian/Reunion']], MQ: ['fr', ['America/Martinique']], GP: ['fr', ['America/Guadeloupe']],
    GF: ['fr', ['America/Cayenne']], PF: ['fr', ['Pacific/Tahiti']], NC: ['fr', ['Pacific/Noumea']],
    MA: ['ar', ['Africa/Casablanca']], DZ: ['ar', ['Africa/Algiers']], TN: ['ar', ['Africa/Tunis']], EG: ['ar', ['Africa/Cairo']],
    LY: ['ar', ['Africa/Tripoli']], SA: ['ar', ['Asia/Riyadh']], AE: ['ar', ['Asia/Dubai']], QA: ['ar', ['Asia/Qatar']],
    KW: ['ar', ['Asia/Kuwait']], BH: ['ar', ['Asia/Bahrain']], OM: ['ar', ['Asia/Muscat']], JO: ['ar', ['Asia/Amman']],
    LB: ['ar', ['Asia/Beirut']], IQ: ['ar', ['Asia/Baghdad']], SY: ['ar', ['Asia/Damascus']], YE: ['ar', ['Asia/Aden']],
    SD: ['ar', ['Africa/Khartoum']], MR: ['ar', ['Africa/Nouakchott']],
    ES: ['es', ['Europe/Madrid']], MX: ['es', ['America/Mexico_City']], AR: ['es', ['America/Argentina/Buenos_Aires']], CO: ['es', ['America/Bogota']],
    CL: ['es', ['America/Santiago']], PE: ['es', ['America/Lima']], VE: ['es', ['America/Caracas']], EC: ['es', ['America/Guayaquil']],
    GT: ['es', ['America/Guatemala']], CU: ['es', ['America/Havana']], DO: ['es', ['America/Santo_Domingo']], BO: ['es', ['America/La_Paz']],
    HN: ['es', ['America/Tegucigalpa']], PY: ['es', ['America/Asuncion']], SV: ['es', ['America/El_Salvador']], NI: ['es', ['America/Managua']],
    CR: ['es', ['America/Costa_Rica']], PA: ['es', ['America/Panama']], UY: ['es', ['America/Montevideo']], GQ: ['es', ['Africa/Malabo']],
    PT: ['pt', ['Europe/Lisbon']], BR: ['pt', ['America/Sao_Paulo']], AO: ['pt', ['Africa/Luanda']], MZ: ['pt', ['Africa/Maputo']],
    CV: ['pt', ['Atlantic/Cape_Verde']], GW: ['pt', ['Africa/Bissau']], ST: ['pt', ['Africa/Sao_Tome']],
    IT: ['it', ['Europe/Rome']], SM: ['it', ['Europe/San_Marino']], VA: ['it', ['Europe/Vatican']],
    DE: ['de', ['Europe/Berlin', 'Europe/Busingen']], AT: ['de', ['Europe/Vienna']], CH: ['de', ['Europe/Zurich']], LI: ['de', ['Europe/Vaduz']],
    NL: ['nl', ['Europe/Amsterdam']], SR: ['nl', ['America/Paramaribo']],
    RU: ['ru', ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Kirov', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Europe/Astrakhan', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Chita', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Kamchatka']],
    BY: ['ru', ['Europe/Minsk']],
    CN: ['zh', ['Asia/Shanghai', 'Asia/Urumqi']],
    IN: ['hi', ['Asia/Kolkata', 'Asia/Calcutta']],
    JP: ['ja', ['Asia/Tokyo']], KR: ['ko', ['Asia/Seoul']],
    TR: ['tr', ['Europe/Istanbul', 'Asia/Istanbul']]
  };

  var ZONE_COUNTRY = {};
  Object.keys(COUNTRIES).forEach(function (iso) {
    COUNTRIES[iso][1].forEach(function (zone) { ZONE_COUNTRY[zone] = iso; });
  });

  function isSupported(lang) { return SUPPORTED.indexOf(lang) !== -1; }

  /** Pays (code ISO) deduit d'un fuseau horaire, ou null s'il n'est pas dans la table. */
  function countryOfTimeZone(timeZone) { return (timeZone && ZONE_COUNTRY[timeZone]) || null; }

  /**
   * Langue a utiliser. `saved` : choix memorise ; `languages` : navigator.languages ;
   * `timeZone` : fuseau IANA de l'appareil.
   */
  function resolveLanguage(input) {
    input = input || {};
    if (isSupported(input.saved)) return input.saved;
    var langs = input.languages || [];
    for (var i = 0; i < langs.length; i++) {
      var base = String(langs[i] || '').toLowerCase().split(/[-_]/)[0];
      if (isSupported(base)) return base;
    }
    var iso = countryOfTimeZone(input.timeZone);
    if (iso) return COUNTRIES[iso][0];
    return FALLBACK;
  }

  function direction(lang) { return RTL.indexOf(lang) !== -1 ? 'rtl' : 'ltr'; }

  function interpolate(text, params) {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(params, name) && params[name] != null ? String(params[name]) : m;
    });
  }

  function createI18n(win, options) {
    options = options || {};
    var dictionaries = {};
    var state = { lang: SOURCE };
    var missing = [];
    var fetchJson = options.fetchJson || function (url) {
      return win.fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); });
    };
    var baseUrl = options.baseUrl || 'locales/';

    function lookup(lang, key) {
      var d = dictionaries[lang];
      return d && Object.prototype.hasOwnProperty.call(d, key) && typeof d[key] === 'string' ? d[key] : undefined;
    }

    function chain() {
      var order = [state.lang, FALLBACK, SOURCE];
      return order.filter(function (l, i) { return order.indexOf(l) === i; });
    }

    /** Texte brut traduit. `params.count` choisit la forme de pluriel (cle.one, cle.few, ..., cle.other). */
    function t(key, params) {
      var langs = chain();
      for (var i = 0; i < langs.length; i++) {
        var lang = langs[i];
        var text;
        if (params && typeof params.count === 'number') {
          var cat = 'other';
          try { cat = new Intl.PluralRules(LOCALE_TAGS[lang]).select(params.count); } catch (e) { /* ignore */ }
          text = lookup(lang, key + '.' + cat);
          if (text === undefined) text = lookup(lang, key + '.other');
        }
        if (text === undefined) text = lookup(lang, key);
        if (text !== undefined) return interpolate(text, params);
      }
      if (missing.indexOf(key) === -1) missing.push(key);
      return key;
    }

    function has(key) {
      return chain().some(function (l) { return lookup(l, key) !== undefined || lookup(l, key + '.other') !== undefined; });
    }

    function load(lang) {
      if (dictionaries[lang]) return Promise.resolve();
      return fetchJson(baseUrl + lang + '.json').then(function (d) { dictionaries[lang] = d; }, function () { /* hors ligne : on continue */ });
    }

    /**
     * Phrase avec elements integres (liens...) dont l'ordre varie selon la langue.
     * Modele : "J'accepte les {terms} et la {privacy}" ; les elements a inserer sont les enfants
     * portant data-slot="terms" / data-slot="privacy" (leur propre texte vient de leur data-i18n).
     */
    function applyRich(el, key) {
      var doc = win.document;
      var slots = {};
      Array.prototype.slice.call(el.children || []).forEach(function (c) {
        var name = c.getAttribute && c.getAttribute('data-slot');
        if (name) slots[name] = c;
      });
      var parts = t(key).split(/(\{\w+\})/);
      el.textContent = '';
      parts.forEach(function (part) {
        var m = /^\{(\w+)\}$/.exec(part);
        if (m && slots[m[1]]) el.appendChild(slots[m[1]]);
        else if (part) el.appendChild(doc.createTextNode(part));
      });
    }

    /** Applique les traductions aux elements portant data-i18n / data-i18n-attr. Texte seulement. */
    function applyDom(rootEl) {
      var scope = rootEl || (win.document && win.document);
      if (!scope || !scope.querySelectorAll) return;
      var nodes = scope.querySelectorAll('[data-i18n],[data-i18n-attr],[data-i18n-rich]');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var key = el.getAttribute('data-i18n');
        if (key && has(key)) el.textContent = t(key);
        var richKey = el.getAttribute('data-i18n-rich');
        if (richKey && has(richKey)) applyRich(el, richKey);
        var attrs = el.getAttribute('data-i18n-attr');
        if (attrs) {
          attrs.split(';').forEach(function (pair) {
            var idx = pair.indexOf(':');
            if (idx < 1) return;
            var name = pair.slice(0, idx).trim();
            var k = pair.slice(idx + 1).trim();
            if (name && k && has(k)) el.setAttribute(name, t(k));
          });
        }
      }
    }

    function applyDocument() {
      var doc = win.document;
      if (!doc || !doc.documentElement) return;
      doc.documentElement.setAttribute('lang', state.lang);
      doc.documentElement.setAttribute('dir', direction(state.lang));
    }

    function tag() { return LOCALE_TAGS[state.lang] || LOCALE_TAGS[SOURCE]; }
    var fmt = {
      /** Etiquette de langue pour Intl (ex. 'fr-FR'). */
      localeTag: function () { return tag(); },
      number: function (n, opts) { return new Intl.NumberFormat(tag(), opts).format(Number(n) || 0); },
      currency: function (n) { return fmt.number(n) + ' FCFA'; },
      date: function (d, opts) {
        var x = d instanceof Date ? d : new Date(d);
        if (isNaN(x)) return '';
        return new Intl.DateTimeFormat(tag(), opts || { day: 'numeric', month: 'long', year: 'numeric' }).format(x);
      },
      dateTime: function (d) {
        return fmt.date(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    };

    function readSaved() { try { return win.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }

    function detect() {
      var tz = null;
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* ignore */ }
      var nav = win.navigator || {};
      return resolveLanguage({ saved: readSaved(), languages: nav.languages && nav.languages.length ? nav.languages : [nav.language], timeZone: tz });
    }

    function event(name, detail) {
      if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent(name, { detail: detail }));
    }

    function use(lang, persist) {
      if (!isSupported(lang)) return Promise.reject(new Error('Langue non prise en charge : ' + lang));
      state.lang = lang;
      if (persist) { try { win.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ } }
      applyDocument();
      return Promise.all(chain().map(load)).then(function () {
        applyDom();
        mountSwitchers();
        event('sengp:languagechange', { lang: lang, explicit: !!persist });
        return lang;
      });
    }

    /** Choix explicite de l'utilisateur : memorise et applique. */
    function setLanguage(lang) { return use(lang, true); }

    /** Demarrage : detecte la langue, charge les dictionnaires, traduit la page. */
    function init() {
      var lang = detect();
      state.lang = lang;
      applyDocument(); // lang et dir tout de suite, avant le chargement des textes
      var run = function () { return use(lang, false); };
      var doc = win.document;
      if (doc && doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
        return new Promise(function (resolve) { doc.addEventListener('DOMContentLoaded', function () { resolve(run()); }); });
      }
      return run();
    }

    /** Selecteur de langue (liste deroulante accessible) dans `container`. */
    function mountSwitcher(container) {
      var doc = win.document;
      if (!container || !doc) return null;
      var select = doc.createElement('select');
      select.className = 'sengp-lang-switcher';
      select.setAttribute('aria-label', t('common.language'));
      SUPPORTED.forEach(function (l) {
        var o = doc.createElement('option');
        o.value = l;
        o.textContent = NATIVE_NAMES[l];
        if (l === state.lang) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', function () { setLanguage(select.value); });
      container.appendChild(select);
      if (typeof win.addEventListener === 'function') {
        win.addEventListener('sengp:languagechange', function () {
          select.value = state.lang;
          select.setAttribute('aria-label', t('common.language'));
        });
      }
      return select;
    }

    var switchersMounted = false;
    /** Place un selecteur dans chaque element [data-i18n-switcher] (une seule fois). */
    function mountSwitchers() {
      if (switchersMounted || !win.document || !win.document.querySelectorAll) return;
      var hosts = win.document.querySelectorAll('[data-i18n-switcher]');
      if (hosts.length) switchersMounted = true;
      for (var i = 0; i < hosts.length; i++) mountSwitcher(hosts[i]);
    }

    return {
      t: t, has: has, fmt: fmt, applyDom: applyDom, init: init, setLanguage: setLanguage, mountSwitcher: mountSwitcher,
      detect: detect,
      supported: SUPPORTED,
      nativeNames: NATIVE_NAMES,
      get lang() { return state.lang; },
      get dir() { return direction(state.lang); },
      get missing() { return missing.slice(); },
      _dictionaries: dictionaries
    };
  }

  function install(win) {
    if (!win || win.SengpI18n) return;
    var i18n = createI18n(win);
    win.SengpI18n = i18n;
    win.sengpT = i18n.t;
    i18n.ready = i18n.init();
  }

  return {
    install: install, createI18n: createI18n, resolveLanguage: resolveLanguage, countryOfTimeZone: countryOfTimeZone,
    direction: direction, interpolate: interpolate,
    SUPPORTED: SUPPORTED, SOURCE: SOURCE, FALLBACK: FALLBACK, COUNTRIES: COUNTRIES, NATIVE_NAMES: NATIVE_NAMES, LOCALE_TAGS: LOCALE_TAGS
  };
});
