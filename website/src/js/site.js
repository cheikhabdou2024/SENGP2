(function () {
  'use strict';

  // Menu mobile
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  if (burger && nav) {
    var close = function () { nav.classList.remove('is-open'); if (document.querySelector('.site-header')) document.querySelector('.site-header').classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); burger.setAttribute('aria-label', 'Ouvrir le menu'); };
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 880) close(); });
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
