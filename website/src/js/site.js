(function () {
  'use strict';

  // Menu mobile
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    var close = function () { nav.classList.remove('is-open'); if (document.querySelector('.site-header')) document.querySelector('.site-header').classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', burger.getAttribute('data-label-open') || 'Ouvrir le menu'); };
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', (open ? burger.getAttribute('data-label-close') : burger.getAttribute('data-label-open')) || (open ? 'Fermer le menu' : 'Ouvrir le menu'));
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 880) close(); });
  }

  // Menu replie automatiquement quand les libelles de la langue (russe, allemand...) ne tiennent pas sur une ligne
  var barIn = document.querySelector('.site-header__in');
  if (barIn) {
    var tagline = document.querySelector('.brand__txt small');
    var fit = function () {
      var root = document.documentElement;
      var over = function () { return barIn.scrollWidth > barIn.clientWidth + 1; };
      // la devise sous le logo est coupee en plusieurs lignes quand la place manque (langues aux libelles longs)
      var wrapped = function () { return tagline && tagline.getBoundingClientRect().height > 1.6 * (parseFloat(getComputedStyle(tagline).lineHeight) || 14); };
      root.classList.remove('is-compact', 'no-tagline');
      if (window.innerWidth <= 880) return;
      if (over() || wrapped()) root.classList.add('no-tagline');   // 1) on retire d'abord la devise sous le logo
      if (over()) root.classList.add('is-compact');                // 2) sinon le menu passe en burger
    };
    fit();
    window.addEventListener('resize', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener('load', fit);
  }

  // Menu de langue : se ferme au clic ailleurs et avec Echap
  var langBox = document.querySelector('.lang__d');
  if (langBox) {
    document.addEventListener('click', function (e) { if (!langBox.contains(e.target)) langBox.removeAttribute('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') langBox.removeAttribute('open'); });
  }

  // En-tête : transparent sur les photos, vitré dès qu'on défile
  var header = document.querySelector('.site-header');
  if (header) {
    var solid = function () { header.classList.toggle('is-solid', window.scrollY > 24); };
    solid(); window.addEventListener('scroll', solid, { passive: true });
    if (burger) burger.addEventListener('click', function () { header.classList.toggle('is-open', nav.classList.contains('is-open')); });
  }

  // Apparition douce au défilement
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-in'); });
  }
})();
