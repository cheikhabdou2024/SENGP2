(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var raf = function (fn) { return window.requestAnimationFrame(fn); };

  /* ---------- hero : parallaxe légère sur la photo ---------- */
  var hero = document.querySelector('[data-hero]');
  if (hero && !reduce) {
    var bg = hero.querySelector('.hw__bg'), q = false;
    window.addEventListener('scroll', function () {
      if (q) return; q = true;
      raf(function () { q = false; var y = Math.min(window.scrollY, hero.offsetHeight); bg.style.translate = '0 ' + (y * 0.16).toFixed(1) + 'px'; });
    }, { passive: true });
  }

  /* ---------- étapes + téléphone : l'étape lue pilote l'écran affiché ---------- */
  document.querySelectorAll('[data-steps-scroll]').forEach(function (root) {
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-step]'));
    var shots = Array.prototype.slice.call(root.querySelectorAll('.phone3d__shot'));
    var list = root.querySelector('.steps2__list');
    var current = -1;
    function set(i) {
      if (i === current) return; current = i;
      items.forEach(function (it, k) { it.classList.toggle('is-active', k === i); it.classList.toggle('is-done', k < i); });
      shots.forEach(function (s, k) { s.classList.toggle('is-on', k === i); });
      list.style.setProperty('--sp', items.length > 1 ? (i / (items.length - 1)).toFixed(3) : 1);
    }
    function pick() {
      var line = window.innerHeight * 0.5, best = 0, bestD = Infinity;
      items.forEach(function (it, k) {
        var r = it.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - line);
        if (d < bestD) { bestD = d; best = k; }
      });
      set(best);
    }
    var pending = false;
    var on = function () { if (!pending) { pending = true; raf(function () { pending = false; pick(); }); } };
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    items.forEach(function (it, k) {
      it.addEventListener('click', function () { set(k); });
      it.addEventListener('focus', function () { set(k); });
      it.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(k); } });
    });
    set(0); pick();
    // tilt léger du téléphone (souris uniquement)
    var phone = root.querySelector('.phone3d__frame'), stage = root.querySelector('.steps2__stage');
    if (phone && stage && fine && !reduce) {
      stage.addEventListener('pointermove', function (e) {
        var r = stage.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        phone.style.setProperty('--ry', (x * 16 - 4).toFixed(1) + 'deg'); phone.style.setProperty('--rx', (y * -10 + 3).toFixed(1) + 'deg');
      }, { passive: true });
      stage.addEventListener('pointerleave', function () { phone.style.removeProperty('--ry'); phone.style.removeProperty('--rx'); });
    }
  });

  /* ---------- suivi : le tracé se dessine avec le défilement ---------- */
  var track = document.querySelector('[data-track]');
  if (track) {
    var path = document.getElementById('trkPath'), plane = document.getElementById('trkPlane');
    var pts = Array.prototype.slice.call(track.querySelectorAll('[data-pt]'));
    var cards = Array.prototype.slice.call(track.querySelectorAll('[data-card]'));
    var len = path.getTotalLength();
    // position (0..1) de chaque point de passage sur la courbe : le plus proche de ses coordonnées
    var marks = pts.map(function (g) {
      var m = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(g.getAttribute('transform')), x = +m[1], y = +m[2], best = 0, bd = Infinity;
      for (var t = 0; t <= 1.0001; t += 0.005) { var p = path.getPointAtLength(len * t), d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = t; } }
      return best;
    });
    var place = function (p) {
      track.style.setProperty('--tp', p.toFixed(4));
      var pt = path.getPointAtLength(len * p), pt2 = path.getPointAtLength(len * Math.min(1, p + 0.004));
      plane.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ') rotate(' + (Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI).toFixed(1) + ')');
      var reached = -1;
      marks.forEach(function (m, k) { if (p >= m - 0.001) reached = k; });
      pts.forEach(function (g, k) { g.classList.toggle('is-on', k <= reached); g.classList.toggle('is-now', k === reached && p < 0.999); });
      cards.forEach(function (c, k) { c.classList.toggle('is-on', k <= reached); c.classList.toggle('is-now', k === reached); });
    };
    var tick = function () {
      var r = track.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.85 - r.top) / (r.height * 0.9 + vh * 0.1);
      place(reduce ? 1 : Math.max(0, Math.min(1, p)));
    };
    var wait = false;
    var onS = function () { if (!wait) { wait = true; raf(function () { wait = false; tick(); }); } };
    window.addEventListener('scroll', onS, { passive: true }); window.addEventListener('resize', onS);
    tick();
  }

  /* ---------- FAQ : accordéon accessible, une réponse ouverte à la fois ---------- */
  document.querySelectorAll('[data-accordion]').forEach(function (acc) {
    var qs = Array.prototype.slice.call(acc.querySelectorAll('.faqx__q'));
    qs.forEach(function (q, i) {
      q.addEventListener('click', function () {
        var open = q.getAttribute('aria-expanded') === 'true';
        qs.forEach(function (o) { o.setAttribute('aria-expanded', 'false'); });
        q.setAttribute('aria-expanded', open ? 'false' : 'true');
      });
      q.addEventListener('keydown', function (e) {
        var k = null;
        if (e.key === 'ArrowDown') k = (i + 1) % qs.length; else if (e.key === 'ArrowUp') k = (i - 1 + qs.length) % qs.length;
        else if (e.key === 'Home') k = 0; else if (e.key === 'End') k = qs.length - 1;
        if (k !== null) { e.preventDefault(); qs[k].focus(); }
      });
    });
  });
})();
