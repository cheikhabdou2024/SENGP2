/**
 * Pull-to-refresh (tirer vers le bas pour actualiser).
 *
 * S'attache automatiquement au conteneur défilable de la page (le premier
 * élément `.content` s'il existe, sinon le document). Quand l'utilisateur est
 * tout en haut et tire vers le bas au-delà du seuil puis relâche, la page se
 * rafraîchit : on appelle `window.onPullRefresh()` si défini (rechargement des
 * données sans recharger la page), sinon `location.reload()`.
 *
 * Inclure simplement <script src="ptr.js"></script> sur la page.
 */
(function () {
  if (window.__ptrInstalled) return;
  window.__ptrInstalled = true;

  var THRESHOLD = 70;   // distance à tirer pour déclencher
  var MAX = 110;        // distance visuelle max

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var scroller = document.querySelector('.content') || document.scrollingElement || document.body;

    // Indicateur visuel
    var ind = document.createElement('div');
    ind.setAttribute('aria-hidden', 'true');
    ind.style.cssText = [
      'position:fixed', 'top:0', 'left:50%', 'transform:translate(-50%,-60px)',
      'width:40px', 'height:40px', 'border-radius:50%',
      'background:rgba(20,18,40,0.95)', 'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'z-index:9999', 'transition:opacity .2s', 'opacity:0', 'color:#FFD700', 'font-size:20px'
    ].join(';');
    ind.innerHTML = '<span id="__ptrSpin" style="display:inline-block">↻</span>';
    document.body.appendChild(ind);

    var startY = 0, pulling = false, dist = 0, refreshing = false;

    function atTop() {
      return (scroller.scrollTop || 0) <= 0;
    }

    document.addEventListener('touchstart', function (e) {
      if (refreshing) return;
      if (!atTop()) { pulling = false; return; }
      startY = e.touches[0].clientY;
      pulling = true; dist = 0;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!pulling || refreshing) return;
      var dy = e.touches[0].clientY - startY;
      if (dy <= 0 || !atTop()) { pulling = false; setIndicator(0); return; }
      dist = Math.min(dy * 0.5, MAX);
      // empêcher le scroll élastique natif pendant le tirage
      if (e.cancelable) e.preventDefault();
      setIndicator(dist);
    }, { passive: false });

    document.addEventListener('touchend', function () {
      if (!pulling || refreshing) return;
      pulling = false;
      if (dist >= THRESHOLD) doRefresh();
      else setIndicator(0);
    });

    function setIndicator(d) {
      if (d <= 0) { ind.style.opacity = '0'; ind.style.transform = 'translate(-50%,-60px)'; return; }
      ind.style.opacity = '1';
      var y = Math.min(d, MAX) - 50;
      ind.style.transform = 'translate(-50%,' + y + 'px) rotate(' + (d * 3) + 'deg)';
    }

    function doRefresh() {
      refreshing = true;
      ind.style.opacity = '1';
      ind.style.transform = 'translate(-50%,20px)';
      var spin = document.getElementById('__ptrSpin');
      if (spin) { spin.style.animation = 'ptrspin 0.8s linear infinite'; }
      var style = document.createElement('style');
      style.textContent = '@keyframes ptrspin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);

      Promise.resolve()
        .then(function () {
          if (typeof window.onPullRefresh === 'function') return window.onPullRefresh();
          return null;
        })
        .then(function (handled) {
          if (handled === true) {
            // La page a rechargé ses données elle-même.
            setTimeout(function () { refreshing = false; setIndicator(0); }, 400);
          } else {
            location.reload();
          }
        })
        .catch(function () { location.reload(); });
    }
  });
})();
