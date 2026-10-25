(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var raf = function (fn) { return window.requestAnimationFrame(fn); };

  /* ---------- onglets accessibles (parcours, aperçus de l'application) ---------- */
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    function show(i, focus) {
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        var p = panels[k];
        if (!p) return;
        p.hidden = !on;
        p.classList.toggle('is-on', on);
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i, false); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, k = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') k = (i + 1) % n;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') k = (i - 1 + n) % n;
        else if (e.key === 'Home') k = 0;
        else if (e.key === 'End') k = n - 1;
        if (k !== null) { e.preventDefault(); show(k, true); }
      });
    });
    var start = tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; });
    show(start < 0 ? 0 : start, false);
  });

  /* ---------- hero : parallaxe douce (souris + défilement) ---------- */
  var hero = document.querySelector('[data-hero]');
  if (hero && !reduce) {
    var layers = Array.prototype.slice.call(hero.querySelectorAll('[data-layer]'));
    var mx = 0, my = 0, sy = 0, queued = false, visible = true;
    var apply = function () {
      queued = false;
      layers.forEach(function (el) {
        var d = parseFloat(el.getAttribute('data-layer')) || 0;
        el.style.transform = 'translate3d(' + (mx * d * -60).toFixed(1) + 'px,' + (sy * 0.18 * (d >= 0 ? 1 : -0.5) + my * d * -40).toFixed(1) + 'px,0)';
      });
    };
    var queue = function () { if (!queued && visible) { queued = true; raf(apply); } };
    if (fine) hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5; my = (e.clientY - r.top) / r.height - 0.5; queue();
    }, { passive: true });
    window.addEventListener('scroll', function () { sy = Math.min(window.scrollY, hero.offsetHeight); queue(); }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        var s = visible ? 'running' : 'paused';
        hero.querySelectorAll('.route__plane, .route__pt .pulse, .hx__prog i, .hx__scroll svg').forEach(function (el) { el.style.animationPlayState = s; });
      }, { threshold: 0 }).observe(hero);
    }
  }

  /* ---------- fonctionnement : ligne d'itinéraire liée au défilement ---------- */
  var journey = document.querySelector('[data-journey]');
  if (journey) {
    var steps = Array.prototype.slice.call(journey.querySelectorAll('[data-step]'));
    var rail = journey.querySelector('.journey__rail');
    var tick = function () {
      var jr = journey.getBoundingClientRect();
      var line = window.innerHeight * 0.55;                       // ligne de lecture
      var railTop = jr.top + rail.offsetTop;
      var p = (line - railTop) / rail.offsetHeight;
      p = Math.max(0, Math.min(1, p));
      journey.style.setProperty('--p', p.toFixed(4));
      steps.forEach(function (s) {
        var r = s.getBoundingClientRect();
        s.classList.toggle('is-on', r.top + r.height / 2 < line + 10);
      });
    };
    var pending = false;
    var onScroll = function () { if (!pending) { pending = true; raf(function () { pending = false; tick(); }); } };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    tick();
  }

  /* ---------- destinations : carte + liste ---------- */
  var dest = document.querySelector('[data-dest]');
  if (dest) {
    var DATA = {
      'france': ['Sénégal → France', 'Paris, Lyon, Marseille, Toulouse, Nice'],
      'espagne': ['Sénégal → Espagne', 'Madrid, Barcelone, Valence, Séville, Bilbao'],
      'italie': ['Sénégal → Italie', 'Rome, Milan, Naples, Turin, Florence'],
      'etats-unis': ['Sénégal → États-Unis', 'New York, Los Angeles, Chicago, Houston, Miami'],
      'canada': ['Sénégal → Canada', 'Toronto, Montréal, Vancouver, Calgary, Ottawa'],
      'algerie': ['Sénégal → Algérie', 'Alger, Oran, Constantine, Annaba, Tlemcen']
    };
    var btns = Array.prototype.slice.call(dest.querySelectorAll('[data-dest-btn]'));
    var title = document.getElementById('destTitle'), cities = document.getElementById('destCities');
    var select = function (key) {
      btns.forEach(function (b) { var on = b.getAttribute('data-dest-btn') === key; b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      dest.querySelectorAll('[data-route]').forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('data-route') === key); });
      dest.querySelectorAll('[data-pt]').forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('data-pt') === key); });
      title.textContent = DATA[key][0]; cities.textContent = DATA[key][1];
    };
    btns.forEach(function (b) {
      var k = b.getAttribute('data-dest-btn');
      b.addEventListener('click', function () { select(k); });
      b.addEventListener('mouseenter', function () { if (fine) select(k); });
      b.addEventListener('focus', function () { select(k); });
    });
    select('france');
    if ('IntersectionObserver' in window && !reduce) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { dest.classList.add('is-in'); io.disconnect(); } }, { threshold: 0.25 });
      io.observe(dest);
    } else { dest.classList.add('is-in'); }
  }

  /* ---------- téléphone : inclinaison au survol (souris uniquement) ---------- */
  var tilt = document.querySelector('[data-tilt]');
  if (tilt && fine && !reduce) {
    var frame = tilt.querySelector('.phone3d__frame');
    var stage = tilt.closest('.appdemo__stage') || tilt;
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      frame.style.setProperty('--ry', (x * 16 - 4).toFixed(1) + 'deg');
      frame.style.setProperty('--rx', (y * -10 + 3).toFixed(1) + 'deg');
    }, { passive: true });
    stage.addEventListener('pointerleave', function () { frame.style.removeProperty('--ry'); frame.style.removeProperty('--rx'); });
  }
})();
