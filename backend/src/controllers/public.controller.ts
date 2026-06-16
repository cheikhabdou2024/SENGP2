import { Request, Response } from 'express';
import { MissionService } from '../services/mission.service';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';

/** Keep only safe characters for a public token used in URLs / HTML. */
function sanitizeToken(t: string): string {
  return String(t || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
}

export class PublicController {
  /**
   * Public JSON tracking by opaque token (no auth).
   * GET /api/v1/public/track/:token
   */
  static async track(req: Request, res: Response): Promise<void> {
    try {
      const token = sanitizeToken(req.params.token);
      if (!token) {
        ResponseUtil.badRequest(res, 'Invalid token');
        return;
      }
      const data = await MissionService.getPublicTracking(token);
      ResponseUtil.success(res, data);
    } catch (e: any) {
      if (e.message === 'Not found') {
        ResponseUtil.notFound(res, 'Envoi introuvable');
        return;
      }
      logger.error('Public track error:', e);
      ResponseUtil.serverError(res, 'Erreur de suivi');
    }
  }

  /**
   * Public delivery info by secret QR token (no auth).
   * GET /api/v1/public/delivery/:token
   */
  static async deliveryInfo(req: Request, res: Response): Promise<void> {
    try {
      const token = sanitizeToken(req.params.token);
      if (!token) { ResponseUtil.badRequest(res, 'Invalid token'); return; }
      const data = await MissionService.getDeliveryInfo(token);
      ResponseUtil.success(res, data);
    } catch (e: any) {
      if (e.message === 'Not found') { ResponseUtil.notFound(res, 'Colis introuvable'); return; }
      logger.error('Delivery info error:', e);
      ResponseUtil.serverError(res, 'Erreur');
    }
  }

  /**
   * Recipient confirms delivery (no auth; possession of the QR token = proof).
   * POST /api/v1/public/delivery/:token/confirm  { lat?, lng? }
   */
  static async confirmDelivery(req: Request, res: Response): Promise<void> {
    try {
      const token = sanitizeToken(req.params.token);
      if (!token) { ResponseUtil.badRequest(res, 'Invalid token'); return; }
      const lat = req.body && req.body.lat != null ? parseFloat(req.body.lat) : undefined;
      const lng = req.body && req.body.lng != null ? parseFloat(req.body.lng) : undefined;
      const r = await MissionService.confirmDeliveryByToken(token, {
        lat: Number.isNaN(lat as number) ? undefined : lat,
        lng: Number.isNaN(lng as number) ? undefined : lng,
      });
      ResponseUtil.success(res, r, r.already ? 'Déjà livré' : 'Réception confirmée');
    } catch (e: any) {
      if (e.message === 'Not found') { ResponseUtil.notFound(res, 'Colis introuvable'); return; }
      logger.error('Confirm delivery error:', e);
      ResponseUtil.badRequest(res, e.message || 'Confirmation échouée');
    }
  }

  /**
   * Public, self-contained HTML delivery-confirmation page (recipient scans the
   * package QR which points here).
   * GET /d/:token
   */
  static deliveryPage(req: Request, res: Response): void {
    const token = sanitizeToken(req.params.token);
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Confirmer la réception - SEN GP</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;min-height:100vh;display:flex;justify-content:center}
  .wrap{width:100%;max-width:440px;padding:22px}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}
  .brand .logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#FF6B6B,#FFE66D);display:flex;align-items:center;justify-content:center;font-size:20px}
  .brand h1{font-size:18px}
  .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:20px;margin-bottom:16px}
  .route{display:flex;align-items:center;gap:10px;margin-top:8px}
  .route .flag{font-size:24px}.route .city{font-weight:700}.route .arrow{color:rgba(255,255,255,.4)}
  .muted{font-size:12px;color:rgba(255,255,255,.55);margin-top:6px}
  .badge{display:inline-block;padding:5px 12px;border-radius:9px;font-size:12px;font-weight:700}
  .b-green{background:rgba(76,175,80,.2);color:#7ee081}.b-blue{background:rgba(78,205,196,.2);color:#4ECDC4}
  .btn{display:block;width:100%;text-align:center;padding:16px;border:none;border-radius:14px;font-weight:800;font-size:16px;cursor:pointer;background:linear-gradient(135deg,#4CAF50,#45a049);color:#fff;margin-top:6px}
  .btn:disabled{opacity:.6}
  .ok{text-align:center;padding:30px 10px}
  .ok .ic{font-size:60px;margin-bottom:12px}
  .loading,.empty{text-align:center;padding:50px 20px;color:rgba(255,255,255,.55)}
  .note{font-size:11px;color:rgba(255,255,255,.4);text-align:center;margin-top:12px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><div class="logo">📦</div><h1>Réception du colis</h1></div>
  <div id="content"><div class="loading">Chargement…</div></div>
  <div class="note">SEN GP · Confirmez uniquement après avoir reçu le colis.</div>
</div>
<script>
  var TOKEN=${JSON.stringify(token)};
  var FLAGS={'Sénégal':'🇸🇳','Senegal':'🇸🇳','France':'🇫🇷','Espagne':'🇪🇸','Italie':'🇮🇹','USA':'🇺🇸','États-Unis':'🇺🇸','Canada':'🇨🇦','Royaume-Uni':'🇬🇧','Allemagne':'🇩🇪','Maroc':'🇲🇦','Mali':'🇲🇱'};
  function flag(c){return FLAGS[c]||'🌍'}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function load(){
    fetch('/api/v1/public/delivery/'+encodeURIComponent(TOKEN)).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(res){
      if(!res.ok||!res.j.success){document.getElementById('content').innerHTML='<div class="empty">📭<br>Code de livraison invalide.</div>';return}
      var m=res.j.data;
      if(String(m.status).toLowerCase()==='delivered'){showDone();return}
      if(String(m.status).toLowerCase()==='cancelled'){document.getElementById('content').innerHTML='<div class="empty">Cet envoi a été annulé.</div>';return}
      document.getElementById('content').innerHTML=
        '<div class="card"><div class="muted">Code de suivi</div><div style="font-weight:700">'+esc(m.tracking_number||m.mission_code||'')+'</div>'
        +'<div class="route"><span class="flag">'+flag(m.arrival_country)+'</span><span class="city">'+esc(m.arrival_city||'')+'</span></div>'
        +'<div class="muted">Poids : '+(parseFloat(m.package_weight)||0)+' kg · '+'<span class="badge b-blue">'+esc(m.status)+'</span></div></div>'
        +'<div class="card"><p style="font-size:14px;margin-bottom:14px">Avez-vous bien reçu ce colis ? En confirmant, la livraison sera marquée comme terminée.</p>'
        +'<button class="btn" id="cbtn" onclick="confirmIt()">✓ Confirmer la réception</button></div>';
    }).catch(function(){document.getElementById('content').innerHTML='<div class="empty">Erreur de connexion.</div>'});
  }
  function showDone(){document.getElementById('content').innerHTML='<div class="card ok"><div class="ic">✅</div><div style="font-size:20px;font-weight:800;margin-bottom:6px">Livraison confirmée</div><div class="muted">Merci ! Le colis a bien été marqué comme livré.</div></div>'}
  function post(coords){
    var btn=document.getElementById('cbtn'); if(btn){btn.disabled=true;btn.textContent='Confirmation…'}
    fetch('/api/v1/public/delivery/'+encodeURIComponent(TOKEN)+'/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(coords||{})})
      .then(function(r){return r.json()}).then(function(j){ if(j.success)showDone(); else {alert('Erreur: '+(j.error||j.message||'')); if(btn){btn.disabled=false;btn.textContent='✓ Confirmer la réception'}} })
      .catch(function(){alert('Erreur de connexion.'); if(btn){btn.disabled=false;btn.textContent='✓ Confirmer la réception'}});
  }
  function confirmIt(){
    if(navigator.geolocation){navigator.geolocation.getCurrentPosition(
      function(p){post({lat:p.coords.latitude,lng:p.coords.longitude})},
      function(){post({})},{timeout:8000});
    } else { post({}); }
  }
  load();
</script>
</body>
</html>`;
    res.status(200).type('html').send(html);
  }

  /**
   * Public, self-contained HTML tracking page (no app/login needed).
   * GET /t/:token
   */
  static trackPage(req: Request, res: Response): void {
    const token = sanitizeToken(req.params.token);
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Suivi du colis - SEN GP</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;min-height:100vh;display:flex;justify-content:center}
  .wrap{width:100%;max-width:480px;padding:20px;padding-bottom:40px}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}
  .brand .logo{width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,#FF6B6B,#FFE66D);display:flex;align-items:center;justify-content:center;font-size:20px}
  .brand h1{font-size:18px}
  .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:18px;margin-bottom:16px}
  .badge{display:inline-block;padding:5px 12px;border-radius:9px;font-size:12px;font-weight:700}
  .b-yellow{background:rgba(255,215,0,.18);color:#FFD700}.b-blue{background:rgba(78,205,196,.2);color:#4ECDC4}
  .b-green{background:rgba(76,175,80,.2);color:#7ee081}.b-red{background:rgba(255,107,107,.2);color:#ff8f8f}
  .route{display:flex;align-items:center;gap:10px;margin-top:14px}
  .route .loc{flex:1}.route .flag{font-size:26px}.route .city{font-weight:700}.route .country{font-size:12px;color:rgba(255,255,255,.6)}
  .route .arrow{color:rgba(255,255,255,.4);font-size:20px}
  .title{font-size:15px;font-weight:700;margin-bottom:12px}
  iframe.map{width:100%;height:210px;border:0;border-radius:12px}
  .map-btn{display:block;text-align:center;padding:12px;border-radius:12px;background:linear-gradient(135deg,#4ECDC4,#44A08D);color:#06302c;font-weight:700;text-decoration:none;margin-top:10px}
  .timeline{position:relative;padding-left:24px}
  .timeline::before{content:'';position:absolute;left:7px;top:4px;bottom:4px;width:2px;background:rgba(255,255,255,.12)}
  .tl{position:relative;padding-bottom:18px}
  .tl::before{content:'';position:absolute;left:-22px;top:3px;width:14px;height:14px;border-radius:50%;background:#4ECDC4;box-shadow:0 0 0 3px rgba(78,205,196,.2)}
  .tl.muted::before{background:rgba(255,255,255,.3);box-shadow:none}
  .tl .s{font-weight:700;font-size:14px}.tl .d{font-size:12px;color:rgba(255,255,255,.7);margin-top:2px}.tl .t{font-size:11px;color:rgba(255,255,255,.45);margin-top:2px}
  .muted-txt{font-size:11px;color:rgba(255,255,255,.5);margin-top:6px}
  .loading,.empty{text-align:center;padding:50px 20px;color:rgba(255,255,255,.55)}
  .foot{text-align:center;font-size:11px;color:rgba(255,255,255,.4);margin-top:20px}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><div class="logo">📦</div><h1>Suivi de votre colis</h1></div>
  <div id="content"><div class="loading">Chargement du suivi…</div></div>
  <div class="foot">SEN GP · Suivi en temps réel</div>
</div>
<script>
  var TOKEN = ${JSON.stringify(token)};
  var FLAGS={'Sénégal':'🇸🇳','Senegal':'🇸🇳','France':'🇫🇷','Espagne':'🇪🇸','Italie':'🇮🇹','USA':'🇺🇸','États-Unis':'🇺🇸','Canada':'🇨🇦','Royaume-Uni':'🇬🇧','Allemagne':'🇩🇪','Maroc':'🇲🇦','Mali':'🇲🇱'};
  function flag(c){return FLAGS[c]||'🌍'}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function dt(d){return d?new Date(d).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'}
  var STATUS={pending:['En attente','b-yellow'],matched:['Pris en charge','b-yellow'],accepted:['Accepté','b-blue'],picked_up:['Récupéré','b-blue'],in_transit:['En transit','b-blue'],in_customs:['En douane','b-blue'],out_for_delivery:['En livraison','b-blue'],delivered:['Livré','b-green'],cancelled:['Annulé','b-red'],disputed:['Litige','b-red'],location:['Position','b-blue']};
  function lab(s){return (STATUS[String(s||'').toLowerCase()]||[s])[0]}
  function badge(s){var m=STATUS[String(s||'').toLowerCase()]||[s,'b-yellow'];return '<span class="badge '+m[1]+'">'+esc(m[0])+'</span>'}
  var ACTIVE=['pending','matched','accepted','picked_up','in_transit','in_customs','out_for_delivery'];

  function load(){
    fetch('/api/v1/public/track/'+encodeURIComponent(TOKEN)).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})}).then(function(res){
      if(!res.ok||!res.j.success){document.getElementById('content').innerHTML='<div class="empty">📭<br>Aucun suivi trouvé pour ce code.</div>';return}
      render(res.j.data.mission,res.j.data.tracking||[]);
    }).catch(function(){document.getElementById('content').innerHTML='<div class="empty">Erreur de connexion. Réessayez.</div>'});
  }

  function render(m,tracking){
    var gps=null;for(var i=0;i<tracking.length;i++){if(tracking[i].latitude&&tracking[i].longitude){gps=tracking[i];break}}
    var mapBlock;
    if(gps){var la=Number(gps.latitude),lo=Number(gps.longitude),d=0.05;
      mapBlock='<iframe class="map" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox='+(lo-d)+'%2C'+(la-d)+'%2C'+(lo+d)+'%2C'+(la+d)+'&layer=mapnik&marker='+la+'%2C'+lo+'"></iframe>'
        +'<div class="muted-txt">📍 Dernière position · '+dt(gps.created_at)+'</div>';
    } else {mapBlock='<div class="muted-txt">Position GPS pas encore disponible. Itinéraire prévu :</div>';}
    var mapsUrl='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent((m.departure_city||'')+', '+(m.departure_country||''))+'&destination='+encodeURIComponent((m.arrival_city||'')+', '+(m.arrival_country||''));
    var events=tracking.filter(function(t){return String(t.status||'').toLowerCase()!=='location'});
    var tl=events.length?events.map(function(t,idx){return '<div class="tl '+(idx>0?'muted':'')+'"><div class="s">'+esc(lab(t.status))+'</div>'+(t.description?'<div class="d">'+esc(t.description)+'</div>':'')+(t.location?'<div class="d">📍 '+esc(t.location)+'</div>':'')+'<div class="t">'+dt(t.created_at)+'</div></div>'}).join(''):'<div class="tl"><div class="s">'+esc(lab(m.status))+'</div><div class="t">'+dt(m.created_at)+'</div></div>';

    document.getElementById('content').innerHTML=
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:12px;color:rgba(255,255,255,.5)">Code de suivi</div><div style="font-weight:700">'+esc(m.tracking_number||m.mission_code||'')+'</div></div>'+badge(m.status)+'</div>'
      +'<div class="route"><div class="loc"><div class="flag">'+flag(m.departure_country)+'</div><div class="city">'+esc(m.departure_city||'—')+'</div><div class="country">'+esc(m.departure_country||'')+'</div></div><div class="arrow">→</div><div class="loc"><div class="flag">'+flag(m.arrival_country)+'</div><div class="city">'+esc(m.arrival_city||'—')+'</div><div class="country">'+esc(m.arrival_country||'')+'</div></div></div>'
      +(m.gp_first_name?'<div class="muted-txt">Transporté par '+esc(m.gp_first_name)+'</div>':'')+'</div>'
      +'<div class="card"><div class="title">🗺️ Suivi en temps réel</div>'+mapBlock+'<a class="map-btn" href="'+mapsUrl+'" target="_blank" rel="noopener">Voir l\\'itinéraire sur la carte</a></div>'
      +'<div class="card"><div class="title">📡 Historique</div><div class="timeline">'+tl+'</div></div>';

    if(ACTIVE.indexOf(String(m.status||'').toLowerCase())>=0){setTimeout(function(){if(!document.hidden)load()},30000)}
  }
  load();
</script>
</body>
</html>`;
    res.status(200).type('html').send(html);
  }
}
