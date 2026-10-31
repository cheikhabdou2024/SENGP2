/* Sélecteur de destination partagé : continent > pays > région/État.
 * Données : geo-data.js (window.SENGP_GEODATA). Tarifs par continent = grille SEN GP.
 * Usage : SengpGeo.open({ title, onPick: sel => … })
 *   sel = { continent, continentId, iso, country, region, flag, price }  (price en FCFA/kg, ou null) */
(function () {
  var DATA = window.SENGP_GEODATA || [];

  function flagOf(iso) {
    return String.fromCodePoint.apply(null, iso.toUpperCase().split('').map(function (c) { return 127397 + c.charCodeAt(0); }));
  }
  function esc(s) { return window.sengpEsc(s); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  function fcfa(n) { return n == null ? 'Tarif à définir' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA/kg'; }

  // Index pays (nom normalisé → entrée) pour retrouver le drapeau / tarif d'un pays déjà enregistré.
  var byName = {};
  DATA.forEach(function (c) { c.countries.forEach(function (p) { byName[norm(p[1])] = { continent: c, c: p }; }); });
  var ALIAS = { usa: 'etats-unis', 'etats unis': 'etats-unis', 'etats-unis': 'etats-unis', 'royaume uni': 'royaume-uni', uk: 'royaume-uni', senegal: 'senegal', 'emirats arabes': 'emirats arabes unis' };

  function find(name) {
    var k = norm(name); return byName[k] || byName[ALIAS[k]] || null;
  }
  function priceFor(country) { var f = find(country); return f ? f.continent.price : null; }
  function flag(name) { var f = find(name); return f ? flagOf(f.c[0]) : ''; }

  var css = '.sg-ov{position:fixed;inset:0;z-index:3000;display:flex;align-items:flex-end;justify-content:center;background:rgba(7,20,47,.55);opacity:0;pointer-events:none;transition:opacity .2s}'
    + '.sg-ov.show{opacity:1;pointer-events:auto}'
    + '.sg-sheet{width:100%;max-width:480px;max-height:86dvh;display:flex;flex-direction:column;background:#fff;color:#0B1D3A;border-radius:26px 26px 0 0;padding-bottom:env(safe-area-inset-bottom);transform:translateY(24px);transition:transform .25s;font-family:inherit}'
    + '.sg-ov.show .sg-sheet{transform:none}'
    + '.sg-head{display:flex;align-items:center;gap:10px;padding:16px 16px 6px 20px}'
    + '.sg-head h3{flex:1;margin:0;font-size:20px;font-weight:800;line-height:1.2}'
    + '.sg-head small{display:block;font-size:13px;font-weight:500;color:#6B7A93;margin-top:2px}'
    + '.sg-x,.sg-back{border:0;background:#EEF2F8;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px;color:#0B1D3A;line-height:1}'
    + '.sg-back[hidden]{display:none}'
    + '.sg-search{margin:8px 16px 4px;display:block;width:calc(100% - 32px);box-sizing:border-box;padding:12px 14px;border:1.5px solid #DDE4EF;border-radius:14px;font:500 15px inherit;color:#0B1D3A;background:#F7F9FC}'
    + '.sg-search:focus{outline:2px solid #2F6BFF;outline-offset:1px;background:#fff}'
    + '.sg-list{overflow-y:auto;padding:6px 10px 14px;-webkit-overflow-scrolling:touch}'
    + '.sg-row{width:100%;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 10px;border:0;border-radius:14px;background:none;text-align:left;cursor:pointer;font:inherit;color:inherit}'
    + '.sg-row:hover,.sg-row:active{background:#F1F5FA}'
    + '.sg-ic{flex:0 0 auto;width:42px;height:42px;border-radius:12px;background:#EAF1FF;display:flex;align-items:center;justify-content:center;font-size:24px}'
    + '.sg-main{flex:1;min-width:0}.sg-main b{display:block;font-size:16px;font-weight:700}'
    + '.sg-main span{display:block;font-size:13px;color:#6B7A93;margin-top:1px}'
    + '.sg-price{font-size:13px;font-weight:800;color:#1F9D55;white-space:nowrap}.sg-price.na{color:#9AA7BC;font-weight:600}'
    + '.sg-chev{color:#9AA7BC;font-size:18px}'
    + '.sg-empty{padding:28px 16px;text-align:center;color:#6B7A93;font-size:14px}'
    + '@media (prefers-reduced-motion:reduce){.sg-ov,.sg-sheet{transition:none}}';

  var ov, st;
  function ensure() {
    if (ov) return;
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    ov = document.createElement('div'); ov.className = 'sg-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="sg-sheet"><div class="sg-head"><button type="button" class="sg-back" aria-label="Retour" hidden>‹</button>'
      + '<h3 id="sgTitle"></h3><button type="button" class="sg-x" aria-label="Fermer">✕</button></div>'
      + '<input class="sg-search" type="search" autocomplete="off" aria-label="Rechercher">'
      + '<div class="sg-list" id="sgList"></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.sg-x').onclick = close;
    ov.querySelector('.sg-back').onclick = back;
    ov.querySelector('.sg-search').addEventListener('input', render);
    ov.querySelector('#sgList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var a = b.getAttribute('data-a'), ci = +b.getAttribute('data-ci'), pi = +b.getAttribute('data-pi'), ri = +b.getAttribute('data-ri');
      if (a === 'cont') { st.cont = ci; st.country = null; reset(); }
      else if (a === 'country') { st.cont = ci; st.country = pi; reset(); }
      else if (a === 'region') pick(ci, pi, ri);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('show')) close(); });
  }
  function reset() { ov.querySelector('.sg-search').value = ''; render(); ov.querySelector('#sgList').scrollTop = 0; }
  function back() { if (st.country != null) st.country = null; else st.cont = null; reset(); }
  function close() { ov.classList.remove('show'); }

  function pick(ci, pi, ri) {
    var c = DATA[ci], p = c.countries[pi];
    var sel = { continent: c.name, continentId: c.id, iso: p[0], country: p[1], region: p[2][ri], flag: flagOf(p[0]), price: c.price };
    close();
    if (st.onPick) st.onPick(sel);
  }

  function row(a, ci, pi, ri, icon, title, sub, right) {
    return '<button type="button" class="sg-row" data-a="' + a + '" data-ci="' + ci + '" data-pi="' + pi + '" data-ri="' + ri + '">'
      + '<span class="sg-ic">' + icon + '</span><span class="sg-main"><b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span>' + (right || '<span class="sg-chev">›</span>') + '</button>';
  }
  function priceTag(n) { return '<span class="sg-price' + (n == null ? ' na' : '') + '">' + fcfa(n) + '</span>'; }
  var GLOBE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>';

  function render() {
    var q = norm(ov.querySelector('.sg-search').value), out = '', head = ov.querySelector('#sgTitle'), bk = ov.querySelector('.sg-back'), inp = ov.querySelector('.sg-search');
    bk.hidden = st.cont == null;
    if (st.cont == null) {
      head.innerHTML = esc(st.title || 'Destination') + '<small>Choisissez un continent</small>';
      inp.placeholder = 'Rechercher un pays ou une région…';
      if (!q) {
        DATA.forEach(function (c, ci) { out += row('cont', ci, 0, 0, GLOBE, c.name, c.countries.length + ' pays', priceTag(c.price)); });
      } else {
        var n = 0;
        DATA.forEach(function (c, ci) {
          c.countries.forEach(function (p, pi) {
            if (n > 60) return;
            if (norm(p[1]).indexOf(q) > -1) { out += row('country', ci, pi, 0, flagOf(p[0]), p[1], c.name + ' · ' + p[2].length + ' région' + (p[2].length > 1 ? 's' : ''), priceTag(c.price)); n++; }
            else {
              var ri = p[2].findIndex(function (r) { return norm(r).indexOf(q) > -1; });
              if (ri > -1) { out += row('region', ci, pi, ri, flagOf(p[0]), p[2][ri], p[1] + ' · ' + c.name, priceTag(c.price)); n++; }
            }
          });
        });
      }
    } else if (st.country == null) {
      var c = DATA[st.cont];
      head.innerHTML = esc(c.name) + '<small>' + fcfa(c.price) + ' · choisissez un pays</small>';
      inp.placeholder = 'Rechercher un pays…';
      c.countries.forEach(function (p, pi) {
        if (!q || norm(p[1]).indexOf(q) > -1) out += row('country', st.cont, pi, 0, flagOf(p[0]), p[1], p[2].length + ' région' + (p[2].length > 1 ? 's' : ''));
      });
    } else {
      var cc = DATA[st.cont], p2 = cc.countries[st.country];
      head.innerHTML = flagOf(p2[0]) + ' ' + esc(p2[1]) + '<small>Choisissez la région / l’État</small>';
      inp.placeholder = 'Rechercher une région…';
      p2[2].forEach(function (r, ri) {
        if (!q || norm(r).indexOf(q) > -1) out += row('region', st.cont, st.country, ri, '', r, '', '<span class="sg-chev"></span>');
      });
    }
    ov.querySelector('#sgList').innerHTML = out || '<div class="sg-empty">Aucun résultat</div>';
  }

  window.SengpGeo = {
    data: DATA, find: find, flag: flag, priceFor: priceFor, flagOf: flagOf, fcfa: fcfa,
    open: function (opts) {
      ensure();
      st = { title: (opts && opts.title) || 'Destination', onPick: opts && opts.onPick, cont: null, country: null };
      if (opts && opts.country) { var f = find(opts.country); if (f) { st.cont = DATA.indexOf(f.continent); st.country = f.continent.countries.indexOf(f.c); } }
      ov.querySelector('.sg-search').value = '';
      render(); ov.classList.add('show');
    }
  };
})();
