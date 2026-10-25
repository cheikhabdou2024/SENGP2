(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = function (fn) { return window.requestAnimationFrame(fn); };

  /* ---------- déclenchement des tracés (mission, vision) à l'entrée dans l'écran ---------- */
  var targets = Array.prototype.slice.call(document.querySelectorAll('[data-links], [data-vis]'));
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: 0.3 });
    targets.forEach(function (t) { io.observe(t); });
  } else {
    targets.forEach(function (t) { t.classList.add('is-in'); });
  }

  /* ---------- vision : légère parallaxe de la carte (écrans à souris, sans mouvement réduit) ---------- */
  var map = document.querySelector('[data-layer-v]');
  if (map && !reduce && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var q = false;
    window.addEventListener('scroll', function () {
      if (q) return; q = true;
      raf(function () {
        q = false;
        var r = map.getBoundingClientRect(), p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        map.style.transform = 'translate3d(0,' + (p * -22).toFixed(1) + 'px,0)';
      });
    }, { passive: true });
  }
})();
