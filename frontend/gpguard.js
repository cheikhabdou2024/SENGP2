/* Garde GP (pages GP uniquement) :
 *  1) GPS obligatoire de la récupération du colis jusqu'à l'arrivée confirmée : tant que la
 *     localisation est coupée, un écran bloquant couvre l'application (aucun bouton accessible).
 *  2) Verrou « scan terminé » : après « Scan terminé », l'accès est suspendu jusqu'à la
 *     validation de l'administration. */
(function () {
  var user = {};
  try { user = JSON.parse(localStorage.getItem('userData') || '{}'); } catch (e) {}
  var token = localStorage.getItem('authToken');
  if (!token || user.user_type !== 'gp' || !window.API_BASE_URL) return;

  var API = window.API_BASE_URL;
  var TRACKED = ['picked_up', 'in_transit'];      // + out_for_delivery tant que l'arrivée n'est pas confirmée
  var needGps = false, gpsOk = true, lastPush = 0, lastMissions = [];
  var gpsEl = null, lockEl = null, busy = false;

  function css() {
    if (document.getElementById('gpg-css')) return;
    var s = document.createElement('style'); s.id = 'gpg-css';
    s.textContent = '.gpg-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,6,20,.97);color:#fff;font-family:inherit;text-align:center;touch-action:none}'
      + '.gpg-box{max-width:340px}.gpg-ic{font-size:56px;margin-bottom:12px}.gpg-box h2{font-size:21px;margin:0 0 10px}'
      + '.gpg-box p{font-size:14px;line-height:1.55;color:rgba(255,255,255,.78);margin:0 0 18px}'
      + '.gpg-btn{display:block;width:100%;border:0;border-radius:14px;padding:14px;font:800 15px inherit;cursor:pointer;background:linear-gradient(135deg,#FFD700,#FFA500);color:#1a1a2e;margin-top:10px}'
      + '.gpg-btn.ghost{background:rgba(255,255,255,.12);color:#fff;font-weight:700}.gpg-st{min-height:20px;font-size:13px;color:#ffb4b4;margin-top:6px}';
    document.head.appendChild(s);
  }
  function overlay(id, html) {
    css();
    var d = document.createElement('div'); d.className = 'gpg-ov'; d.id = id; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = '<div class="gpg-box">' + html + '</div>';
    document.body.appendChild(d); return d;
  }
  function authFetch(path, opts) {
    opts = opts || {}; opts.headers = Object.assign({ 'Authorization': 'Bearer ' + token }, opts.headers || {});
    return fetch(API + path, opts);
  }

  // ---------- GPS ----------
  function geoPlugin() { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation; }
  function readPosition(timeout) {
    var Geo = geoPlugin();
    if (Geo && Geo.getCurrentPosition) {
      return Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: timeout, maximumAge: 15000 })
        .then(function (p) { return { lat: p.coords.latitude, lng: p.coords.longitude }; });
    }
    return new Promise(function (res, rej) {
      if (!navigator.geolocation) return rej(new Error('Géolocalisation indisponible'));
      navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function (e) { rej(e); }, { enableHighAccuracy: true, timeout: timeout, maximumAge: 15000 });
    });
  }
  function askPermission() {
    var Geo = geoPlugin();
    if (Geo && Geo.requestPermissions) return Geo.requestPermissions().catch(function () {});
    return Promise.resolve();
  }
  function showGpsOverlay(msg) {
    if (!gpsEl) {
      gpsEl = overlay('gpgGps', '<div class="gpg-ic">📍</div><h2>Le GPS doit rester allumé</h2>'
        + '<p>Pendant le transport du colis, votre position est suivie en continu. Réactivez la localisation de votre téléphone pour continuer : tant qu\'elle est coupée, l\'application est bloquée.</p>'
        + '<button type="button" class="gpg-btn" id="gpgRetry">Activer le GPS</button><div class="gpg-st" id="gpgSt"></div>');
      gpsEl.querySelector('#gpgRetry').onclick = function () {
        var st = gpsEl.querySelector('#gpgSt'); st.textContent = 'Vérification…';
        askPermission().then(function () { return checkGps(); }).then(function () { if (!gpsOk) st.textContent = 'Le GPS est toujours désactivé. Activez la localisation dans les réglages du téléphone.'; });
      };
    }
    if (msg) gpsEl.querySelector('#gpgSt').textContent = msg;
  }
  function hideGpsOverlay() { if (gpsEl) { gpsEl.remove(); gpsEl = null; } }

  function pushLocation(pos) {
    if (window.SENGP_GPS_PUSH_BY_PAGE) return;           // dashgp envoie déjà la position
    var now = Date.now(); if (now - lastPush < 45000) return; lastPush = now;
    lastMissions.forEach(function (m) {
      authFetch('/missions/' + encodeURIComponent(m.id) + '/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: pos.lat, lng: pos.lng }) }).catch(function () {});
    });
  }
  function checkGps() {
    if (!needGps) { gpsOk = true; hideGpsOverlay(); return Promise.resolve(); }
    return readPosition(8000).then(function (pos) { gpsOk = true; hideGpsOverlay(); pushLocation(pos); },
      function () { gpsOk = false; showGpsOverlay(); });
  }

  // ---------- missions suivies ----------
  function refreshMissions() {
    if (busy) return Promise.resolve(); busy = true;
    return authFetch('/missions/my-missions?limit=200').then(function (r) {
      if (r.status === 423) { showLock(); return null; }
      return r.ok ? r.json() : null;
    }).then(function (j) {
      if (!j) return;
      var list = (j.data || []).filter(function (m) {
        var s = String(m.status || '').toLowerCase();
        return TRACKED.indexOf(s) > -1 || (s === 'out_for_delivery' && !m.arrival_confirmed);
      });
      lastMissions = list; needGps = list.length > 0;
      return checkGps();
    }).catch(function () {}).then(function () { busy = false; });
  }

  // ---------- verrou admin ----------
  function showLock() {
    if (lockEl) return;
    lockEl = overlay('gpgLock', '<div class="gpg-ic">⏳</div><h2>Validation en cours</h2>'
      + '<p>Vous avez terminé votre scan. L\'administration doit le valider avant que vous puissiez de nouveau utiliser l\'application (créer un trajet, voir vos missions…). Cet écran se débloquera automatiquement.</p>'
      + '<button type="button" class="gpg-btn ghost" id="gpgOut">Se déconnecter</button>');
    lockEl.querySelector('#gpgOut').onclick = function () {
      localStorage.removeItem('authToken'); localStorage.removeItem('userData'); location.href = 'connexion.html';
    };
  }
  function checkLock() {
    return authFetch('/missions/gp-lock').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.data) return;
      if (j.data.locked) showLock();
      else if (lockEl) { lockEl.remove(); lockEl = null; location.reload(); }
    }).catch(function () {});
  }

  function tick() { checkLock(); refreshMissions(); }
  window.SengpGpGuard = { refresh: tick, locked: function () { return !!lockEl; } };

  function start() {
    tick();
    setInterval(function () { if (!document.hidden) checkGps(); }, 8000);
    setInterval(function () { if (!document.hidden) { checkLock(); refreshMissions(); } }, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    window.addEventListener('focus', tick);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
