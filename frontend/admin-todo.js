/* Console admin : file « À traiter ».
 * Réunit en une page ce qui attend une décision (arrivées à confirmer, missions à affecter,
 * identités à vérifier, retraits, réclamations, litiges), avec un compteur par file et un lien
 * vers la liste déjà filtrée. Dépend des globales de admin.html : api, can, esc, fcfa, switchView, state. */
(function () {
  var POLL_MS = 60000;
  var timer = null;
  var last = null;   // dernier résultat, pour réafficher sans refaire les appels

  function total(r) { var m = r && r.json && (r.json.meta || r.json.pagination); return m && m.total != null ? Number(m.total) : (r && r.json && r.json.data ? r.json.data.length : 0); }
  async function safe(path) { try { var r = await api(path); return r.ok ? r : null; } catch (e) { return null; } }

  /** Compte chaque file que le rôle de l'admin lui permet de voir. */
  async function fetchQueues() {
    var jobs = {};
    if (can('missions:write')) {
      jobs.arrivals = safe('/admin/missions?status=out_for_delivery&limit=50').then(function (r) { return r ? (r.json.data || []).filter(function (m) { return !m.arrival_confirmed; }).length : null; });
      jobs.scans = safe('/admin/scan-reviews').then(function (r) { return r ? (r.json.data || []).length : null; });
    }
    if (can('missions:assign')) jobs.assign = safe('/admin/matching').then(function (r) { return r ? ((r.json.data || {}).missions || []).length : null; });
    if (can('users:verify')) jobs.kyc = safe('/admin/kyc/queue?page=1&limit=1').then(function (r) { return r ? total(r) : null; });
    if (can('missions:read')) jobs.disputes = safe('/admin/missions?status=disputed&limit=1').then(function (r) { return r ? total(r) : null; });
    if (can('withdrawals:read') || can('claims:read')) {
      jobs.stats = safe('/admin/stats').then(function (r) { return r ? r.json.data : null; });
    }
    var keys = Object.keys(jobs), vals = await Promise.all(keys.map(function (k) { return jobs[k]; }));
    var res = {};
    keys.forEach(function (k, i) { res[k] = vals[i]; });
    var st = res.stats || {};
    var q = [];
    function add(key, label, hint, count, view, preset, extra) {
      if (count == null) return;
      q.push({ key: key, label: label, hint: hint, count: Number(count) || 0, view: view, preset: preset || null, extra: extra || '' });
    }
    add('arrivals', 'Arrivées à confirmer', 'Le GP dit être arrivé : appeler, puis confirmer pour qu\'il puisse scanner.',
      (res.arrivals == null ? null : res.arrivals), 'missions', { status: 'out_for_delivery' });
    add('scans', 'Scans à valider', 'GP ayant terminé leur scan : valider pour leur rendre l\'accès.',
      (res.scans == null ? null : res.scans), 'missions', { status: 'out_for_delivery' });
    add('assign', 'Missions à affecter', 'Missions sans GP, avec les trajets compatibles.', res.assign, 'matching');
    add('kyc', 'Identités à vérifier', 'Pièces d\'identité en attente d\'approbation.', res.kyc, 'kyc');
    if (st.withdrawals) add('withdrawals', 'Retraits à valider', 'Demandes de retrait des GP.', st.withdrawals.pending, 'withdrawals', { status: 'pending' },
      Number(st.withdrawals.pending_amount) ? fcfa(st.withdrawals.pending_amount) : '');
    if (st.claims) add('claims', 'Réclamations ouvertes', 'Réclamations non encore prises en charge.', st.claims.open, 'claims', { status: 'open' });
    add('disputes', 'Missions en litige', 'Missions marquées en litige.', res.disputes, 'missions', { status: 'disputed' });
    return q;
  }

  function setBadge(queues) {
    var n = queues.reduce(function (a, x) { return a + x.count; }, 0);
    var el = document.getElementById('navTodoCount');
    if (el) { el.textContent = n; el.style.display = n ? 'inline-flex' : 'none'; }
  }

  function tile(x) {
    var hot = x.count > 0;
    var color = hot ? '#fbbf24' : '#34d399';
    var go = x.preset ? "switchView('" + x.view + "',null," + esc(JSON.stringify(x.preset)) + ")" : "switchView('" + x.view + "',null)";
    return '<div class="kpi" style="cursor:pointer;border-left:3px solid ' + color + '" role="link" tabindex="0" onclick="' + go + '" onkeydown="if(event.key===\'Enter\')this.click()">'
      + '<div class="kpi-top"><div class="kpi-label">' + esc(x.label) + '</div></div>'
      + '<div class="kpi-val">' + x.count + '</div>'
      + '<div class="kpi-bottom"><span style="font-size:12px;color:var(--faint)">' + esc(x.hint) + (x.extra ? ' · ' + esc(x.extra) : '') + '</span></div></div>';
  }

  function draw(main, queues) {
    var open = queues.filter(function (x) { return x.count > 0; });
    var sum = open.reduce(function (a, x) { return a + x.count; }, 0);
    main.innerHTML = '<div class="page-head"><div><h1>À traiter</h1><p>'
      + (queues.length ? (sum ? sum + ' élément(s) attendent une décision.' : 'Tout est à jour.') : 'Aucune file ne correspond à votre rôle.')
      + '</p></div><div class="head-tools"><button class="pill-btn" onclick="renderTodo(document.getElementById(\'main\'))">Actualiser</button></div></div>'
      + (queues.length ? '<div class="kpi-grid">' + open.concat(queues.filter(function (x) { return x.count === 0; })).map(tile).join('') + '</div>' : '');
  }

  window.renderTodo = async function (main) {
    if (!main) return;
    main.innerHTML = '<div class="loading">Chargement…</div>';
    var queues = await fetchQueues();
    last = queues;
    setBadge(queues);
    if (state.view === 'todo') draw(main, queues);
  };

  async function poll() {
    if (document.hidden || !token) return;
    var queues = await fetchQueues();
    last = queues;
    setBadge(queues);
    if (state.view === 'todo' && !document.getElementById('modalOv')) draw(document.getElementById('main'), queues);
  }

  window.startTodoWatch = function () {
    window.stopTodoWatch();
    timer = setInterval(poll, POLL_MS);
    if (state.view !== 'todo') poll();
  };
  window.stopTodoWatch = function () { if (timer) { clearInterval(timer); timer = null; } last = null; };
})();
