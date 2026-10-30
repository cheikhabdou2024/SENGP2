/* Console admin : affectation des missions aux GP et centre d'alertes.
 * Dépend des fonctions globales de admin.html : api, esc, toast, fcfa, timeAgo, can,
 * confirmDialog, state, switchView. */
(function () {
  var ALERT_POLL_MS = 15000;
  var seen = null;            // ids déjà vus (null avant le premier chargement : pas de toast)
  var timer = null;

  var KIND_ACTION = {
    trip_created: { label: 'Affecter des missions', view: 'matching' },
    mission_created: { label: 'Affecter cette mission', view: 'matching' },
    mission_declined: { label: 'Réaffecter', view: 'matching' },
    mission_accepted: { label: 'Voir les missions', view: 'missions' },
    mission_picked_up: { label: 'Voir les missions', view: 'missions' },
    mission_in_transit: { label: 'Voir les missions', view: 'missions' },
    mission_in_customs: { label: 'Voir les missions', view: 'missions' }
  };

  function meta(n) {
    var m = n.metadata;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
    return m || {};
  }

  // ---------- Alertes ----------
  async function fetchAlerts(limit) {
    var r = await api('/notifications/my-notifications?limit=' + (limit || 30));
    return r.ok ? (r.json.data || []) : null;
  }

  function setBadge(unread) {
    var dot = document.getElementById('bellDot');
    if (dot) dot.style.display = unread ? 'block' : 'none';
    var cnt = document.getElementById('navAlertCount');
    if (cnt) { cnt.textContent = unread; cnt.style.display = unread ? 'inline-flex' : 'none'; }
  }

  async function pollAlerts() {
    var list = await fetchAlerts(30);
    if (!list) return;
    var unread = list.filter(function (n) { return !n.is_read; });
    setBadge(unread.length);
    if (seen) {
      unread.filter(function (n) { return !seen.has(n.id); }).slice(0, 4).forEach(function (n) {
        toast(n.title + ' — ' + n.message, 'info');
      });
      if (state.view === 'matching' && unread.some(function (n) { return !seen.has(n.id) && /^(trip|mission)_(created|declined)$/.test(meta(n).kind || ''); })) renderMatching(document.getElementById('main'));
    }
    seen = new Set(list.map(function (n) { return n.id; }));
  }

  window.startAlertWatch = function () {
    if (timer) clearInterval(timer);
    seen = null;
    pollAlerts();
    timer = setInterval(function () { if (!document.hidden) pollAlerts(); }, ALERT_POLL_MS);
  };

  window.renderAlerts = async function (main) {
    main.innerHTML = '<div class="empty">Chargement…</div>';
    var list = await fetchAlerts(60);
    if (!list) { main.innerHTML = '<div class="empty">Alertes indisponibles.</div>'; return; }
    var rows = list.map(function (n) {
      var act = KIND_ACTION[meta(n).kind];
      var btn = act ? '<button class="act act-ok" onclick="alertGo(\'' + act.view + '\')">' + act.label + '</button>' : '';
      return '<div class="feed-item"' + (n.is_read ? ' style="opacity:.6"' : '') + '>'
        + '<div class="feed-ico" style="background:#38bdf820;color:#38bdf8"><span data-icon="bell" data-size="18"></span></div>'
        + '<div class="feed-main"><div class="feed-title">' + esc(n.title) + '</div><div class="feed-sub">' + esc(n.message) + '</div></div>'
        + '<div class="feed-time">' + timeAgo(n.created_at) + '</div>' + btn + '</div>';
    }).join('') || '<div class="empty">Aucune alerte.</div>';
    main.innerHTML = '<div class="head-tools" style="padding:0 0 12px"><h2 style="margin:0">Alertes</h2>'
      + '<button class="pill-btn" style="margin-left:auto" onclick="markAlertsRead()">Tout marquer comme lu</button></div>'
      + '<div class="card" style="padding:8px 14px">' + rows + '</div>';
  };

  window.alertGo = function (view) {
    switchView(view, document.querySelector('.nav-link[data-view=' + view + ']'));
  };

  window.markAlertsRead = async function () {
    await api('/notifications/mark-all-read', { method: 'PUT' });
    setBadge(0);
    renderAlerts(document.getElementById('main'));
  };

  // ---------- Affectations ----------
  var matchData = { missions: [], open_trips: 0 };

  function candLabel(c) {
    return c.gp_name + ' · ' + c.departure_city + ' → ' + c.arrival_city + ' · ' + new Date(c.departure_date).toLocaleDateString('fr-FR')
      + ' · ' + Math.max(0, c.free_weight) + ' kg libres · ' + c.free_slots + ' place(s)';
  }

  function missionCard(m) {
    var opts = m.candidates.map(function (c) {
      return '<option value="' + esc(c.gp_id) + '|' + esc(c.trip_id) + '">' + (c.same_city ? '[même ville] ' : '') + esc(candLabel(c)) + '</option>';
    }).join('');
    var has = m.candidates.length > 0;
    return '<div class="arr-item" data-mid="' + esc(m.id) + '">'
      + '<div class="arr-info">'
      + '<b>' + esc(m.mission_code) + '</b> · ' + esc(m.departure_city) + ' → ' + esc(m.arrival_city) + ' (' + esc(m.arrival_country || '') + ')'
      + '<br><span class="hint">' + esc(m.expediteur_name || '') + ' · ' + (Number(m.package_weight) || 0) + ' kg · ' + fcfa(m.final_price || m.offered_price) + ' · ' + timeAgo(m.created_at) + '</span></div>'
      + (has
        ? '<div class="arr-btns"><select class="match-sel">' + opts + '</select>'
          + '<label class="hint" style="white-space:nowrap"><input type="checkbox" class="match-chk"> Grouper</label>'
          + '<button class="arr-ok" onclick="assignOne(\'' + esc(m.id) + '\')">Affecter</button></div>'
        : '<div class="hint" style="color:#fbbf24">Aucun trajet compatible pour le moment (même pays, place et poids suffisants).</div>')
      + '</div>';
  }

  window.renderMatching = async function (main) {
    if (!main) return;
    main.innerHTML = '<div class="empty">Chargement…</div>';
    var r = await api('/admin/matching');
    if (!r.ok) { main.innerHTML = '<div class="empty">Affectations indisponibles.</div>'; return; }
    matchData = r.json.data || matchData;
    var ms = matchData.missions;
    var ready = ms.filter(function (m) { return m.candidates.length; });
    var cnt = document.getElementById('navMatchCount');
    if (cnt) { cnt.textContent = ms.length; cnt.style.display = ms.length ? 'inline-flex' : 'none'; }
    var byCountry = {};
    ms.forEach(function (m) { var k = m.arrival_country || 'Autre'; (byCountry[k] = byCountry[k] || []).push(m); });
    var groups = Object.keys(byCountry).sort().map(function (k) {
      return '<div class="arr-card" style="margin-top:12px"><div class="arr-head"><span class="pulse"></span><b>' + esc(k) + '</b> · ' + byCountry[k].length + ' mission(s) à affecter</div>'
        + '<div class="arr-list">' + byCountry[k].map(missionCard).join('') + '</div></div>';
    }).join('');
    main.innerHTML = '<div class="head-tools" style="padding:0 0 4px"><h2 style="margin:0">Affectations</h2>'
      + '<span class="hint" style="margin-left:12px">' + ms.length + ' mission(s) en attente · ' + matchData.open_trips + ' trajet(s) ouvert(s)</span>'
      + (ready.length ? '<button class="pill-btn" style="margin-left:auto" onclick="assignGrouped()">Affecter les missions cochées</button>' : '') + '</div>'
      + (groups || '<div class="empty">Aucune mission en attente d’affectation.</div>');
  };

  async function submit(items) {
    if (!items.length) { toast('Aucune mission sélectionnée.', 'err'); return; }
    var r = await api('/admin/assignments', { method: 'POST', body: JSON.stringify({ assignments: items }) });
    if (!r.ok) { toast((r.json && (r.json.error || r.json.message)) || 'Affectation impossible.', 'err'); return; }
    var res = r.json.data || [];
    var ok = res.filter(function (x) { return x.ok; }).length;
    var ko = res.filter(function (x) { return !x.ok; });
    toast(ok + ' mission(s) affectée(s) — les GP ont été notifiés.' + (ko.length ? ' ' + ko.length + ' échec(s) : ' + ko[0].error : ''), ko.length ? 'err' : 'ok');
    renderMatching(document.getElementById('main'));
  }

  function pick(card) {
    var sel = card.querySelector('.match-sel');
    if (!sel || !sel.value) return null;
    var p = sel.value.split('|');
    return { mission_id: card.getAttribute('data-mid'), gp_id: p[0], trip_id: p[1] };
  }

  window.assignOne = async function (id) {
    var card = document.querySelector('.arr-item[data-mid="' + id + '"]');
    var it = card && pick(card);
    if (!it) return;
    if (!(await confirmDialog('Affecter cette mission à ce GP ? Il pourra l’accepter ou la refuser.', { title: 'Affecter la mission', confirmLabel: 'Affecter' }))) return;
    submit([it]);
  };

  window.assignGrouped = async function () {
    var items = [];
    document.querySelectorAll('.arr-item').forEach(function (card) {
      var chk = card.querySelector('.match-chk');
      if (chk && chk.checked) { var it = pick(card); if (it) items.push(it); }
    });
    if (!items.length) { toast('Cochez au moins une mission (« Grouper »).', 'err'); return; }
    if (!(await confirmDialog('Affecter ' + items.length + ' mission(s) aux GP choisis ?', { title: 'Affectation groupée', confirmLabel: 'Affecter' }))) return;
    submit(items);
  };
})();
