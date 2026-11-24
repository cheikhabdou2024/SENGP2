/**
 * SEN GP — choix de la langue du site.
 *
 *  - Un clic sur le menu de langue memorise le choix (localStorage 'sengp.site.lang').
 *  - Sur une page en francais (langue par defaut) sans choix memorise, la langue de l'appareil
 *    (navigator.languages) puis celle du pays deduit du fuseau horaire servent a rediriger une seule fois
 *    vers la meme page dans la bonne langue. Aucune adresse IP n'est utilisee.
 *  - Jamais de redirection : sur une page deja localisee (l'adresse demandee fait foi), au retour
 *    en arriere, ni pour les robots d'indexation.
 * Les pages portent <link rel="alternate" hreflang> : c'est l'unique source des adresses.
 * La table fuseau -> langue est la meme que celle de l'application (frontend/i18n.js).
 */
(function () {
  'use strict';
  var KEY = 'sengp.site.lang';
  var SUPPORTED = ['fr', 'en', 'ar', 'es', 'pt', 'it', 'de', 'nl', 'ru', 'zh', 'hi', 'ja', 'ko', 'tr'];
  var ZONES = {
    fr: 'Europe/Paris Europe/Brussels Europe/Luxembourg Europe/Monaco Africa/Dakar Africa/Bamako Africa/Abidjan Africa/Ouagadougou Africa/Conakry Africa/Niamey Africa/Lome Africa/Porto-Novo Africa/Douala Africa/Libreville Africa/Brazzaville Africa/Kinshasa Africa/Lubumbashi Indian/Antananarivo Africa/Djibouti Africa/Bangui Africa/Ndjamena America/Port-au-Prince Indian/Reunion America/Martinique America/Guadeloupe America/Cayenne Pacific/Tahiti Pacific/Noumea',
    ar: 'Africa/Casablanca Africa/Algiers Africa/Tunis Africa/Cairo Africa/Tripoli Asia/Riyadh Asia/Dubai Asia/Qatar Asia/Kuwait Asia/Bahrain Asia/Muscat Asia/Amman Asia/Beirut Asia/Baghdad Asia/Damascus Asia/Aden Africa/Khartoum Africa/Nouakchott',
    es: 'Europe/Madrid America/Mexico_City America/Argentina/Buenos_Aires America/Bogota America/Santiago America/Lima America/Caracas America/Guayaquil America/Guatemala America/Havana America/Santo_Domingo America/La_Paz America/Tegucigalpa America/Asuncion America/El_Salvador America/Managua America/Costa_Rica America/Panama America/Montevideo Africa/Malabo',
    pt: 'Europe/Lisbon America/Sao_Paulo Africa/Luanda Africa/Maputo Atlantic/Cape_Verde Africa/Bissau Africa/Sao_Tome',
    it: 'Europe/Rome Europe/San_Marino Europe/Vatican',
    de: 'Europe/Berlin Europe/Busingen Europe/Vienna Europe/Zurich Europe/Vaduz',
    nl: 'Europe/Amsterdam America/Paramaribo',
    ru: 'Europe/Moscow Europe/Kaliningrad Europe/Samara Europe/Volgograd Europe/Kirov Europe/Saratov Europe/Ulyanovsk Europe/Astrakhan Asia/Yekaterinburg Asia/Omsk Asia/Novosibirsk Asia/Barnaul Asia/Tomsk Asia/Krasnoyarsk Asia/Irkutsk Asia/Chita Asia/Yakutsk Asia/Vladivostok Asia/Sakhalin Asia/Magadan Asia/Kamchatka Europe/Minsk',
    zh: 'Asia/Shanghai Asia/Urumqi',
    hi: 'Asia/Kolkata Asia/Calcutta',
    ja: 'Asia/Tokyo',
    ko: 'Asia/Seoul',
    tr: 'Europe/Istanbul Asia/Istanbul'
  };
  var zoneLang = {};
  Object.keys(ZONES).forEach(function (l) { ZONES[l].split(' ').forEach(function (z) { zoneLang[z] = l; }); });

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(l) { try { localStorage.setItem(KEY, l); } catch (e) { /* mode prive : tant pis */ } }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[data-lang]') : null;
    if (a) write(a.getAttribute('data-lang'));
  });

  function detect() {
    var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < langs.length; i++) {
      var base = String(langs[i] || '').toLowerCase().split(/[-_]/)[0];
      if (SUPPORTED.indexOf(base) !== -1) return base;
    }
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
    return zoneLang[tz] || 'en';
  }

  var here = document.documentElement.lang;
  if (here !== 'fr') return;
  if (/bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(navigator.userAgent || '') || navigator.webdriver) return;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (nav && nav.type === 'back_forward') return;
  } catch (e) { /* ignore */ }

  var saved = read();
  var target = SUPPORTED.indexOf(saved) !== -1 ? saved : detect();
  if (target === 'fr') return;
  var link = document.querySelector('link[rel="alternate"][hreflang="' + target + '"]');
  if (!link) return;
  if (SUPPORTED.indexOf(saved) === -1) write(target);
  var to = link.getAttribute('href').replace(/^https?:\/\/[^/]+/, '');
  location.replace(to + location.search + location.hash);
})();
