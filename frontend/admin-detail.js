/* Console admin : fiches détaillées (mission, trajet, utilisateur).
 * Chaque fiche réunit tout ce qu'il faut pour décider sans changer de page : acteurs, colis (photos),
 * QR code de remise, paiement (mobile money ou espèces), billet d'avion à valider et suivi.
 * Chargé après page-admin.js : ces fonctions remplacent les versions simples (même nom global).
 * Dépend des globales : api, esc, fcfa, dt, can, badgeFor, stFr, payLabel, ticketFr, ticketBadge,
 * openModal, closeModal, toast, notify, formModal, confirmDialog, routeDetail, routeDetailFailed. */
(function () {
  var LIVE_MS = 15000;
  var liveTimer = null;

  // ---------- Petits utilitaires ----------
  function kv(label, value) { return '<div class="kv"><span>' + esc(label) + '</span><span>' + (value == null || value === '' ? '—' : value) + '</span></div>'; }
  function sec(title, body, right) { return '<div class="dsec"><h4>' + esc(title) + (right ? '<span style="margin-left:auto;text-transform:none;letter-spacing:0">' + right + '</span>' : '') + '</h4>' + body + '</div>'; }
  function lnk(view, id, text) { return id ? '<a class="lnk" href="#/' + view + '/' + esc(id) + '">' + esc(text || '—') + '</a>' : esc(text || '—'); }
  function tel(p) { return p ? '<a class="lnk" href="tel:' + esc(p) + '">' + esc(p) + '</a>' : '—'; }
  function dtt(d) { return d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; }
  function ago(d, now) {
    if (!d) return '—';
    var s = Math.max(0, Math.round(((now ? new Date(now).getTime() : Date.now()) - new Date(d).getTime()) / 1000));
    if (s < 90) return 'il y a ' + s + ' s';
    if (s < 5400) return 'il y a ' + Math.round(s / 60) + ' min';
    if (s < 129600) return 'il y a ' + Math.round(s / 3600) + ' h';
    return 'il y a ' + Math.round(s / 86400) + ' j';
  }
  function wide(html) { var ov = openModal(html); var m = ov && ov.firstChild; if (m) m.classList.add('wide'); return ov; }
  function toList(v) { if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = []; } } return Array.isArray(v) ? v : []; }
  function payBadge(m) {
    if (m.payment_method === 'cod') return '<span class="badge b-yellow">À la livraison</span>';
    return (m.payment_method ? '<span class="badge b-blue">' + esc(payLabel(m.payment_method)) + '</span> ' : '') + (m.paid ? '<span class="badge b-green">Payé</span>' : '<span class="badge b-gray">Non payé</span>');
  }
  window.zoomPhoto = function (src) {
    var d = document.createElement('div');
    d.className = 'lightbox';
    d.innerHTML = '<img alt="">';
    d.firstChild.src = src;
    d.onclick = function () { d.remove(); };
    document.body.appendChild(d);
  };
  function gallery(urls, empty) {
    if (!urls.length) return '<div style="color:rgba(255,255,255,.45);font-size:13px">' + esc(empty) + '</div>';
    return '<div class="gallery">' + urls.map(function (u, i) { return '<img data-zoom="' + i + '" alt="Photo ' + (i + 1) + '" src="' + esc(u) + '">'; }).join('') + '</div>';
  }
  function bindZoom(root, urls) {
    (root || document).querySelectorAll('[data-zoom]').forEach(function (img) { img.onclick = function () { window.zoomPhoto(urls[+img.getAttribute('data-zoom')]); }; });
  }

  // ---------- Carte (Leaflet) avec repli sans bibliothèque ----------
  var maps = {};
  function drawMap(id, points, line) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!points.length) { el.innerHTML = '<div style="padding:24px;color:rgba(255,255,255,.5);font-size:13px">Aucune position GPS reçue pour le moment.</div>'; return; }
    if (!window.L) {
      el.innerHTML = '<div style="padding:16px;font-size:13px">Carte indisponible. ' + points.map(function (p) { return '<a class="lnk" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + p.lat + ',' + p.lng + '">' + esc(p.label) + '</a>'; }).join(' · ') + '</div>';
      return;
    }
    var m = maps[id];
    if (!m || m._container !== el) {
      el.innerHTML = '';
      m = L.map(el, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m);
      m._layer = L.layerGroup().addTo(m);
      maps[id] = m;
    }
    m._layer.clearLayers();
    var ll = points.map(function (p) { return [p.lat, p.lng]; });
    if (line && ll.length > 1) L.polyline(ll, { color: '#818cf8', weight: 3, opacity: .8 }).addTo(m._layer);
    points.forEach(function (p, i) {
      var mk = L.circleMarker([p.lat, p.lng], { radius: p.last === false ? 4 : 9, color: '#fff', weight: 2, fillColor: p.last === false ? '#818cf8' : '#34d399', fillOpacity: 1 }).addTo(m._layer);
      if (p.label) mk.bindTooltip(p.label, { permanent: points.length <= 3 && p.last !== false, direction: 'top' });
    });
    m.fitBounds(L.latLngBounds(ll).pad(0.4), { maxZoom: 9 });
    setTimeout(function () { m.invalidateSize(); }, 80);
  }

  // =====================================================================
  //  MISSION
  // =====================================================================
  window.showMissionDetail = async function (id) {
    var r = await api('/admin/missions/' + id);
    if (!r.ok) { routeDetailFailed(); toast('Erreur chargement de la mission', 'err'); return; }
    routeDetail('missions', id);
    var d = r.json.data, m = d.mission;
    var photos = toList(m.package_photos);
    var price = m.final_price || m.offered_price;
    var pts = (d.tracking || []).filter(function (t) { return t.latitude && t.longitude; });

    var tl = (d.tracking || []).slice().reverse().map(function (t) {
      var gps = (t.latitude && t.longitude) ? ' · <a class="lnk" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + t.latitude + ',' + t.longitude + '">' + (+t.latitude).toFixed(4) + ', ' + (+t.longitude).toFixed(4) + '</a>' : '';
      return '<div style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06)"><div style="display:flex;justify-content:space-between;gap:8px"><span class="badge ' + badgeFor(t.status) + '">' + esc(stFr(t.status)) + '</span>'
        + '<span style="font-size:11px;color:rgba(255,255,255,.5)">' + esc(dtt(t.created_at)) + (t.by_name ? ' · ' + esc(t.by_name) : '') + '</span></div>'
        + '<div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:3px">' + esc(t.location || '') + esc(t.description ? ' — ' + t.description : '') + gps + '</div></div>';
    }).join('') || '<div style="color:rgba(255,255,255,.45);font-size:13px">Aucun événement de suivi.</div>';

    var payRows = (d.payments || []).map(function (p) {
      return '<tr><td>' + esc(p.payment_code) + '</td><td>' + fcfa(p.amount) + '</td><td>' + fcfa(p.commission) + '</td><td>' + fcfa(p.net_amount) + '</td><td>' + esc(payLabel(p.payment_method)) + '</td><td><span class="badge ' + badgeFor(p.status) + '">' + esc(stFr(p.status)) + '</span></td></tr>';
    }).join('');
    var payBody = kv('Mode choisi par l\'expéditeur', esc(payLabel(m.payment_method)))
      + kv('Prix de la mission', '<b>' + fcfa(price) + '</b>')
      + (m.is_insured && Number(m.insurance_cost) > 0 ? kv('Assurance', fcfa(m.insurance_cost) + ' (valeur déclarée ' + fcfa(m.package_value || 0) + ')') : kv('Assurance', 'Non souscrite'));
    if (m.payment_method === 'cod') {
      payBody += '<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,.8);background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.35);border-radius:10px;padding:10px">'
        + 'Paiement en espèces : le GP encaisse <b>' + fcfa(price) + '</b> à la remise. Aucun paiement en ligne n\'est créé, la commission est à récupérer auprès du GP.'
        + (m.status === 'delivered' ? ' <b>Mission livrée : encaissement à confirmer avec le GP.</b>' : '') + '</div>';
    } else if (payRows) {
      payBody += '<div class="table-wrap" style="margin-top:10px"><table style="min-width:auto"><thead><tr><th>Code</th><th>Montant</th><th>Commission</th><th>Net GP</th><th>Mode</th><th>Statut</th></tr></thead><tbody>' + payRows + '</tbody></table></div>';
    } else {
      payBody += '<div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,.55)">Aucun paiement enregistré pour cette mission.</div>';
    }

    var qr = m.delivery_qr_url
      ? '<div class="qrbox"><img alt="QR code de remise" src="' + esc(m.delivery_qr_url) + '"><div style="font-size:12px;color:rgba(255,255,255,.65)">QR unique de cet envoi : celui que l\'expéditeur voit dans son application. Le destinataire le présente au GP pour confirmer la livraison.<br><a class="lnk" target="_blank" rel="noopener" href="' + esc(m.delivery_confirm_url) + '">Lien de confirmation</a></div></div>'
      : '<div style="color:rgba(255,255,255,.5);font-size:13px">Pas encore généré : le QR est créé quand l\'expéditeur ouvre son envoi dans l\'application.</div>';

    var claims = (d.claims || []).map(function (c) { return '<span class="badge ' + badgeFor(c.status) + '">' + esc(c.claim_code) + ' · ' + esc(c.claim_type) + ' (' + esc(stFr(c.status)) + ')</span>'; }).join(' ') || '<span style="color:rgba(255,255,255,.45);font-size:13px">Aucune</span>';

    var btns = '<button class="btn-cancel" onclick="closeModal()">Fermer</button>';
    if (can('missions:write') && m.status === 'out_for_delivery' && !m.arrival_confirmed) btns += '<button class="btn-confirm" onclick="closeModal();confirmArrival(\'' + m.id + '\',\'' + esc(m.mission_code) + '\')">Confirmer l\'arrivée</button>';
    if (m.gp_id && can('missions:assign')) btns += '<button class="btn-confirm" onclick="closeModal();reassignMissionUI(\'' + m.id + '\',\'' + esc(m.mission_code) + '\')">Réassigner</button>';

    var ov = wide(
      '<h3>' + esc(m.mission_code) + ' <span class="badge ' + badgeFor(m.status) + '">' + esc(stFr(m.status)) + '</span> ' + payBadge(Object.assign({ paid: (d.payments || []).some(function (p) { return p.status === 'completed'; }) }, m)) + '</h3>'
      + '<p class="hint">' + esc((m.departure_city || '?') + ' → ' + (m.arrival_city || '?')) + ' · ' + fcfa(price) + ' · ' + esc(String(m.package_weight || '?')) + ' kg' + (m.arrival_confirmed ? ' · arrivée confirmée' : '') + (m.tracking_number ? ' · suivi ' + esc(m.tracking_number) : '') + '</p>'
      + '<div class="dg"><div>'
      + sec('Acteurs',
          kv('Expéditeur', lnk('users', m.expediteur_id, m.expediteur_name) + '<br><small>' + tel(m.expediteur_phone) + ' · ' + esc(m.expediteur_email || '') + '</small>')
        + kv('Gros porteur', m.gp_id ? lnk('users', m.gp_id, m.gp_name) + '<br><small>' + tel(m.gp_phone) + ' · ' + esc(m.gp_email || '') + '</small>' : 'Non affecté')
        + kv('Destinataire', esc(m.recipient_name || '—') + '<br><small>' + tel(m.recipient_phone) + '</small>')
        + kv('Trajet du GP', m.trip_id ? lnk('trips', m.trip_id, m.trip_code) + (m.flight_number ? ' · ' + esc(m.flight_number) : '') + (m.airline ? ' · ' + esc(m.airline) : '') : '—'))
      + sec('Itinéraire',
          kv('Départ', esc((m.departure_city || '—') + ', ' + (m.departure_country || '—')))
        + kv('Enlèvement', esc(m.pickup_address || '—'))
        + kv('Arrivée', esc((m.arrival_city || '—') + ', ' + (m.arrival_country || '—')))
        + kv('Livraison', esc(m.delivery_address || '—'))
        + kv('Départ souhaité', dt(m.desired_departure_date)) + kv('Récupéré le', dtt(m.actual_pickup_date)) + kv('Livré le', dtt(m.actual_delivery_date)))
      + sec('Colis (' + photos.length + ' photo' + (photos.length > 1 ? 's' : '') + ')',
          kv('Description', esc(m.package_description || '—'))
        + kv('Poids', esc(String(m.package_weight || '—')) + ' kg')
        + kv('Dimensions', (m.package_length || m.package_width || m.package_height) ? esc([m.package_length, m.package_width, m.package_height].map(function (x) { return x || '?'; }).join(' × ')) + ' cm' : '—')
        + kv('Valeur déclarée', m.package_value ? fcfa(m.package_value) : '—')
        + '<div style="margin-top:10px">' + gallery(photos, 'Aucune photo téléversée par l\'expéditeur.') + '</div>')
      + '</div><div>'
      + sec('QR code de remise', qr)
      + sec('Paiement', payBody)
      + sec('Position', '<div class="mapbox" id="mMap"></div>', pts.length ? '<span class="badge b-gray">' + pts.length + ' point(s)</span>' : '')
      + sec('Réclamations', claims)
      + '</div></div>'
      + sec('Historique de suivi', tl)
      + '<div class="modal-actions">' + btns + '</div>');
    bindZoom(ov, photos);
    drawMap('mMap', pts.map(function (p, i) { return { lat: +p.latitude, lng: +p.longitude, label: p.location || stFr(p.status), last: i === pts.length - 1 }; }), true);
  };

  // =====================================================================
  //  TRAJET : billet d'avion + suivi en direct
  // =====================================================================
  function tripLiveHtml(d) {
    var ms = d.missions || [];
    var rows = ms.map(function (m) {
      return '<tr><td>' + lnk('missions', m.id, m.mission_code) + '</td><td>' + esc(m.expediteur_name || '—') + '</td><td>' + esc(String(m.weight || '?')) + ' kg</td><td>' + fcfa(m.price) + '</td><td>' + payBadge(m) + '</td>'
        + '<td><span class="badge ' + badgeFor(m.status) + '">' + esc(stFr(m.status)) + '</span></td><td style="white-space:normal">' + (m.last_position_at ? esc(m.last_location || 'GPS') + '<br><small style="color:rgba(255,255,255,.5)">' + esc(ago(m.last_position_at, d.server_time)) + '</small>' : '<small style="color:rgba(255,255,255,.4)">pas de GPS</small>') + '</td></tr>';
    }).join('') || '<tr><td colspan="7" style="color:rgba(255,255,255,.45)">Aucune mission sur ce trajet.</td></tr>';
    var ev = (d.events || []).map(function (e) {
      return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px"><span class="badge ' + badgeFor(e.status) + '">' + esc(stFr(e.status)) + '</span> <b>' + esc(e.mission_code) + '</b> ' + esc(e.location || '') + esc(e.description ? ' — ' + e.description : '')
        + ' <small style="color:rgba(255,255,255,.5)">' + esc(ago(e.created_at, d.server_time)) + '</small></div>';
    }).join('') || '<div style="color:rgba(255,255,255,.45);font-size:13px">Aucun événement de suivi.</div>';
    return { table: '<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>Mission</th><th>Expéditeur</th><th>Poids</th><th>Prix</th><th>Paiement</th><th>Statut</th><th>Dernière position</th></tr></thead><tbody>' + rows + '</tbody></table></div>', events: ev };
  }
  function tripPoints(d) {
    return (d.missions || []).filter(function (m) { return m.last_lat != null && m.last_lng != null; })
      .map(function (m) { return { lat: +m.last_lat, lng: +m.last_lng, label: m.mission_code + ' · ' + (m.last_location || '') + ' (' + ago(m.last_position_at, d.server_time) + ')' }; });
  }
  function stopLive() { if (liveTimer) { clearInterval(liveTimer); liveTimer = null; } }

  function ticketBlock(t) {
    var body;
    if (!t.flight_ticket_url) {
      body = '<div style="color:rgba(255,255,255,.55);font-size:13px">Aucun billet reçu. Le GP doit en téléverser un en recréant le trajet.</div>';
    } else if (t.ticket_is_pdf) {
      body = '<div class="ticketbox"><iframe title="Billet" src="' + esc(t.flight_ticket_url) + '"></iframe><div style="margin-top:6px"><a class="lnk" target="_blank" rel="noopener" href="' + esc(t.flight_ticket_url) + '">Ouvrir le PDF</a></div></div>';
    } else {
      body = '<div class="ticketbox"><img id="tkImg" alt="Billet d\'avion" src="' + esc(t.flight_ticket_url) + '"></div>';
    }
    var meta = t.ticket_reviewed_at ? kv('Contrôlé', esc(dtt(t.ticket_reviewed_at)) + (t.ticket_reviewed_by_name ? ' par ' + esc(t.ticket_reviewed_by_name) : '')) : '';
    meta += t.ticket_review_note ? kv('Motif', esc(t.ticket_review_note)) : '';
    var acts = '';
    if (can('trips:write') && t.flight_ticket_url) {
      acts = '<div style="display:flex;gap:8px;margin-top:10px">'
        + (t.ticket_status !== 'approved' ? '<button class="btn-confirm" onclick="reviewTicket(\'' + t.id + '\',\'approved\')">Valider le billet</button>' : '')
        + (t.ticket_status !== 'rejected' ? '<button class="btn-danger" onclick="reviewTicket(\'' + t.id + '\',\'rejected\')">Refuser</button>' : '') + '</div>';
    }
    return sec('Billet d\'avion', '<div style="margin-bottom:8px"><span class="badge ' + ticketBadge(t.ticket_status) + '">' + esc(ticketFr(t.ticket_status)) + '</span></div>' + body + meta + acts);
  }

  window.reviewTicket = async function (id, decision) {
    var note = '';
    if (decision === 'rejected') {
      var v = await formModal({ title: 'Refuser le billet', hint: 'Le GP en est informé avec ce motif et doit recréer son trajet.', fields: [{ name: 'note', label: 'Motif', type: 'textarea', placeholder: 'Ex. photo floue, nom différent du compte, vol passé…' }], confirmLabel: 'Refuser' });
      if (!v) { window.showTripDetail(id); return; }
      note = (v.note || '').trim();
      if (!note) { toast('Un motif est obligatoire.', 'err'); window.showTripDetail(id); return; }
    } else if (!await confirmDialog('Le billet est lisible, le nom et le vol correspondent au trajet ?', { title: 'Valider le billet', confirmLabel: 'Valider' })) { window.showTripDetail(id); return; }
    var r = await api('/admin/trips/' + id + '/ticket-review', { method: 'POST', body: JSON.stringify({ decision: decision, note: note }) });
    notify(r.ok, decision === 'approved' ? 'Billet validé — le GP est prévenu.' : 'Billet refusé — le GP est prévenu.', r.json);
    if (window.pollTodoNow) window.pollTodoNow();
    window.showTripDetail(id);
    if (state.view === 'trips' && typeof loadList === 'function') loadList();
  };

  window.showTripDetail = async function (id) {
    stopLive();
    var r = await api('/admin/trips/' + id);
    if (!r.ok) { routeDetailFailed(); toast('Erreur chargement du trajet', 'err'); return; }
    routeDetail('trips', id);
    var d = r.json.data, t = d.trip;
    var live = tripLiveHtml(d);
    var rating = Number(t.gp_rating) > 0 ? Number(t.gp_rating).toFixed(1) + ' / 5 (' + (t.gp_reviews || 0) + ' avis)' : 'Pas encore noté';
    var ov = wide(
      '<h3>' + esc(t.trip_code) + ' <span class="badge ' + badgeFor(t.status) + '">' + esc(stFr(t.status)) + '</span> <span class="badge ' + ticketBadge(t.ticket_status) + '">Billet : ' + esc(ticketFr(t.ticket_status)) + '</span></h3>'
      + '<p class="hint">' + esc((t.departure_city || '?') + ' → ' + (t.arrival_city || '?')) + ' · ' + esc(dtt(t.departure_date)) + ' → ' + esc(dtt(t.arrival_date)) + '</p>'
      + '<div class="dg"><div>'
      + sec('Gros porteur',
          kv('Nom', lnk('users', t.gp_id, t.gp_name)) + kv('Téléphone', tel(t.gp_phone)) + kv('Email', esc(t.gp_email || '—'))
        + kv('Note', esc(rating))
        + kv('Identité', t.gp_identity_verified_at ? '<span class="badge b-green">Vérifiée</span>' : '<span class="badge b-yellow">Non vérifiée</span>'))
      + sec('Vol',
          kv('Numéro', esc(t.flight_number || '—')) + kv('Compagnie', esc(t.airline || '—'))
        + kv('Départ', esc((t.departure_city || '—') + ', ' + (t.departure_country || '—') + (t.departure_airport_code ? ' (' + t.departure_airport_code + ')' : '')) + '<br><small>' + esc(dtt(t.departure_date)) + '</small>')
        + kv('Arrivée', esc((t.arrival_city || '—') + ', ' + (t.arrival_country || '—') + (t.arrival_airport_code ? ' (' + t.arrival_airport_code + ')' : '')) + '<br><small>' + esc(dtt(t.arrival_date)) + '</small>')
        + kv('Capacité', (t.current_packages || 0) + ' / ' + (t.max_packages || 0) + ' colis · ' + esc(String(t.available_weight || '?')) + ' kg disponibles')
        + kv('Créé le', esc(dtt(t.created_at))))
      + ticketBlock(t)
      + '</div><div>'
      + sec('Suivi en direct', '<div class="mapbox" id="tMap"></div><div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.55)" id="tLiveInfo"></div>', '<span class="live">EN DIRECT</span>')
      + sec('Derniers événements', '<div id="tEvents">' + live.events + '</div>')
      + '</div></div>'
      + sec('Colis à bord (' + (d.missions || []).length + ')', '<div id="tMissions">' + live.table + '</div>')
      + '<div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Fermer</button>'
      + (can('trips:write') ? '<button class="btn-confirm" onclick="closeModal();moderateTrip(\'' + t.id + '\',\'' + esc(t.status) + '\')">Modérer</button>' : '') + '</div>');
    var tk = ov.querySelector('#tkImg');
    if (tk) tk.onclick = function () { window.zoomPhoto(t.flight_ticket_url); };
    var paint = function (data) {
      drawMap('tMap', tripPoints(data), false);
      var info = document.getElementById('tLiveInfo');
      if (info) info.textContent = tripPoints(data).length ? 'Mise à jour : ' + new Date().toLocaleTimeString('fr-FR') + ' · actualisation toutes les ' + (LIVE_MS / 1000) + ' s' : 'Aucune position GPS pour le moment · actualisation toutes les ' + (LIVE_MS / 1000) + ' s';
    };
    paint(d);
    liveTimer = setInterval(async function () {
      if (!document.getElementById('tMap')) { stopLive(); return; }   // la fiche a été fermée
      if (document.hidden) return;
      var rr = await api('/admin/trips/' + id);
      if (!rr.ok || !document.getElementById('tMap')) return;
      var lv = tripLiveHtml(rr.json.data);
      var a = document.getElementById('tMissions'), b = document.getElementById('tEvents');
      if (a) a.innerHTML = lv.table;
      if (b) b.innerHTML = lv.events;
      paint(rr.json.data);
    }, LIVE_MS);
  };

  // =====================================================================
  //  UTILISATEUR : profil, pièce d'identité, envois (photos + QR) ou trajets
  // =====================================================================
  window.showUserDetail = async function (id) {
    var r = await api('/admin/users/' + id);
    if (!r.ok) { routeDetailFailed(); toast('Erreur chargement du profil', 'err'); return; }
    routeDetail('users', id);
    var d = r.json.data, u = d.user, s = d.stats || {};
    var isGp = u.user_type === 'gp';
    var docs = [u.identity_document_url, u.identity_document_url_back].filter(Boolean);
    var kyc = u.identity_verified_at ? '<span class="badge b-green">Identité vérifiée</span>' : (docs.length ? '<span class="badge b-yellow">Pièce à vérifier</span>' : '<span class="badge b-gray">Aucune pièce</span>');
    var allPhotos = [];
    var missions = (d.recent_missions || []).map(function (m) {
      var ph = toList(m.package_photos);
      var photoIdx = allPhotos.length;
      if (ph.length) allPhotos.push(ph[0]);
      var thumb = ph.length ? '<img data-zoom="' + photoIdx + '" alt="Colis" src="' + esc(ph[0]) + '" style="width:64px;height:48px;object-fit:cover;border-radius:6px;cursor:zoom-in">' : '<span style="color:rgba(255,255,255,.3);font-size:11px">sans photo</span>';
      var qrIdx = allPhotos.length;
      if (m.qr_code_url) allPhotos.push(m.qr_code_url);
      var qr = m.qr_code_url ? '<img data-zoom="' + qrIdx + '" alt="QR" src="' + esc(m.qr_code_url) + '" style="width:48px;height:48px;background:#fff;border-radius:4px;padding:2px;cursor:zoom-in">' : '<span style="color:rgba(255,255,255,.3);font-size:11px">pas de QR</span>';
      return '<tr><td>' + thumb + '</td><td>' + lnk('missions', m.id, m.mission_code) + '<br><small style="color:rgba(255,255,255,.5)">' + esc((m.departure_city || '?') + ' → ' + (m.arrival_city || '?')) + '</small></td>'
        + '<td>' + fcfa(m.price) + '</td><td>' + payBadge(m) + '</td><td><span class="badge ' + badgeFor(m.status) + '">' + esc(stFr(m.status)) + '</span></td>'
        + (isGp ? '' : '<td>' + qr + '</td>') + '<td>' + dt(m.created_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" style="color:rgba(255,255,255,.45)">Aucune mission.</td></tr>';

    var tripsHtml = '';
    if (isGp && can('trips:read')) {
      var tr = await api('/admin/trips?gp_id=' + encodeURIComponent(id) + '&limit=8');
      var trips = tr.ok ? (tr.json.data || []) : [];
      tripsHtml = sec('Trajets (' + trips.length + ')', '<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>Code</th><th>Trajet</th><th>Départ</th><th>Statut</th><th>Billet</th></tr></thead><tbody>'
        + (trips.map(function (t) { return '<tr><td>' + lnk('trips', t.id, t.trip_code) + '</td><td>' + esc((t.departure_city || '?') + ' → ' + (t.arrival_city || '?')) + '</td><td>' + dt(t.departure_date) + '</td><td><span class="badge ' + badgeFor(t.status) + '">' + esc(stFr(t.status)) + '</span></td><td><span class="badge ' + ticketBadge(t.ticket_status) + '">' + esc(ticketFr(t.ticket_status)) + '</span></td></tr>'; }).join('') || '<tr><td colspan="5" style="color:rgba(255,255,255,.45)">Aucun trajet.</td></tr>') + '</tbody></table></div>');
    }
    var docIdx = allPhotos.length;
    docs.forEach(function (x) { allPhotos.push(x); });

    var ov = wide(
      '<h3>' + esc(u.first_name + ' ' + u.last_name) + '</h3>'
      + '<p class="hint">' + esc(u.email) + ' · ' + esc(u.phone || '—') + ' · <span class="badge b-blue">' + esc({ expediteur: 'Expéditeur', gp: 'GP', admin: 'Admin' }[u.user_type] || u.user_type) + '</span> <span class="badge ' + badgeFor(u.status) + '">' + esc(stFr(u.status)) + '</span> ' + kyc + '</p>'
      + '<div class="dg"><div>'
      + sec('Profil', kv('Localisation', esc((u.city || '—') + ', ' + (u.country || '—'))) + kv('Inscrit le', dt(u.created_at)) + kv('Dernière connexion', esc(dtt(u.last_login_at)))
          + kv('Note', Number(u.average_rating) > 0 ? esc(Number(u.average_rating).toFixed(1)) + ' / 5 (' + (u.total_reviews || 0) + ' avis)' : '—'))
      + '</div><div>'
      + sec('Activité', kv('Envois (expéditeur)', esc(String(s.missions_as_expediteur || 0))) + kv('Missions (GP)', esc(String(s.missions_as_gp || 0))) + kv('Total payé', fcfa(s.total_paid)) + kv('Réclamations', esc(String(s.claims || 0))))
      + '</div></div>'
      + (docs.length ? sec('Pièce d\'identité', '<div class="gallery">' + docs.map(function (x, i) { return '<img data-zoom="' + (docIdx + i) + '" alt="Pièce" src="' + esc(x) + '">'; }).join('') + '</div>') : '')
      + tripsHtml
      + sec(isGp ? 'Missions confiées' : 'Envois', '<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>Photo</th><th>Mission</th><th>Prix</th><th>Paiement</th><th>Statut</th>' + (isGp ? '' : '<th>QR code</th>') + '<th>Créée le</th></tr></thead><tbody>' + missions + '</tbody></table></div>'
          + (isGp ? '' : '<div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:8px">Le QR est celui que l\'expéditeur voit dans son application ; il est créé à la première ouverture de l\'envoi.</div>'))
      + '<div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">Fermer</button></div>');
    bindZoom(ov, allPhotos);
  };

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var lb = document.querySelector('.lightbox'); if (lb) lb.remove(); } });
  // Quand la fiche se ferme, l'actualisation en direct s'arrête d'elle-même (contrôle du DOM à chaque tour).
})();
