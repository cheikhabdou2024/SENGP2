/* ============================================================
   SEN GP — Système de popup unifié (design glassmorphism doré)
   Auto-injecte son CSS et expose : sengpModal / sengpAlert / sengpConfirm.
   Remplace aussi window.alert pour que TOUS les popups de l'app
   adoptent automatiquement le même design.
   ============================================================ */
(function () {
    if (window.__sengpUiLoaded) return;
    window.__sengpUiLoaded = true;

    var LOGO = 'im/sengp-logo.jpg';

    // ---- CSS injecté (identique au popup GPS du dashboard GP) ----
    var css = ''
        + '.sengp-modal-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;'
        + 'justify-content:center;padding:24px;background:radial-gradient(130% 120% at 50% 0%,rgba(20,18,46,.86),rgba(8,8,18,.93));'
        + '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);opacity:0;pointer-events:none;transition:opacity .3s ease;}'
        + '.sengp-modal-overlay.show{opacity:1;pointer-events:auto;}'
        + '.sengp-modal{width:100%;max-width:360px;position:relative;text-align:center;padding:54px 22px 22px;'
        + 'border-radius:24px;background:linear-gradient(160deg,rgba(255,255,255,.11),rgba(255,255,255,.04));'
        + 'border:1px solid rgba(255,215,0,.26);box-shadow:0 30px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.12);'
        + 'transform:translateY(16px) scale(.96);transition:transform .4s cubic-bezier(.22,1,.36,1);max-height:84vh;overflow-y:auto;'
        + "font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}"
        + '.sengp-modal-overlay.show .sengp-modal{transform:none;}'
        + '.sengp-modal-logo{position:absolute;top:-34px;left:50%;transform:translateX(-50%);width:68px;height:68px;'
        + 'border-radius:20px;object-fit:cover;background:#0b1a30;border:2px solid rgba(255,215,0,.6);'
        + 'box-shadow:0 10px 26px rgba(0,0,0,.5),0 0 20px rgba(255,215,0,.25);}'
        + '.sengp-modal h3{font-size:19px;font-weight:800;margin:0 0 10px;color:#fff;'
        + 'background:linear-gradient(135deg,#FFD700 0%,#FFA500 55%,#4ECDC4 100%);-webkit-background-clip:text;'
        + 'background-clip:text;-webkit-text-fill-color:transparent;}'
        + '.sengp-modal-msg{font-size:13.5px;line-height:1.6;color:rgba(255,255,255,.8);margin-bottom:4px;}'
        + '.sengp-modal-body{margin-top:6px;}'
        + '.sengp-modal-actions{display:flex;gap:10px;margin-top:18px;}'
        + '.sengp-modal-actions .sengp-btn{flex:1;}'
        + '.sengp-btn{padding:14px 16px;border:none;border-radius:14px;cursor:pointer;font-family:inherit;'
        + 'font-size:14.5px;font-weight:800;transition:transform .18s ease,box-shadow .18s ease;}'
        + '.sengp-btn-primary{color:#1a1a2e;background:linear-gradient(135deg,#FFD700,#FFA500);box-shadow:0 10px 22px rgba(255,184,0,.4);}'
        + '.sengp-btn-ghost{color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);}'
        + '.sengp-btn:active{transform:translateY(1px) scale(.99);}'
        + '.sengp-list{text-align:left;display:flex;flex-direction:column;gap:10px;margin-top:4px;}'
        + '.sengp-list-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;'
        + 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);cursor:pointer;transition:background .2s ease;}'
        + '.sengp-list-item:hover{background:rgba(255,255,255,.1);}'
        + '.sengp-list-empty{padding:26px 10px;text-align:center;color:rgba(255,255,255,.5);font-size:13px;}';

    function injectCss() {
        if (document.getElementById('sengp-ui-css')) return;
        var st = document.createElement('style');
        st.id = 'sengp-ui-css';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
        });
    }

    function root() {
        var r = document.getElementById('sengpModalRoot');
        if (!r) { r = document.createElement('div'); r.id = 'sengpModalRoot'; document.body.appendChild(r); }
        return r;
    }

    function closeOverlay(ov) {
        ov.classList.remove('show');
        setTimeout(function () { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }, 300);
    }

    // opts: { title, message (texte), bodyHTML (HTML brut), logo, actions:[{label,primary,value}], onMount(card,close) }
    window.sengpModal = function (opts) {
        opts = opts || {};
        injectCss();
        return new Promise(function (resolve) {
            var actions = opts.actions || [{ label: 'OK', primary: true, value: true }];
            var ov = document.createElement('div');
            ov.className = 'sengp-modal-overlay';
            ov.setAttribute('role', 'dialog');
            ov.setAttribute('aria-modal', 'true');

            var card = document.createElement('div');
            card.className = 'sengp-modal';
            var html = '<img src="' + (opts.logo || LOGO) + '" class="sengp-modal-logo" alt="SEN GP" '
                + 'onerror="this.style.display=\'none\'">';
            if (opts.title) html += '<h3>' + esc(opts.title) + '</h3>';
            if (opts.message) html += '<div class="sengp-modal-msg">' + esc(opts.message).replace(/\n/g, '<br>') + '</div>';
            if (opts.bodyHTML) html += '<div class="sengp-modal-body">' + opts.bodyHTML + '</div>';
            card.innerHTML = html;

            var act = document.createElement('div');
            act.className = 'sengp-modal-actions';
            actions.forEach(function (a) {
                var b = document.createElement('button');
                b.className = 'sengp-btn ' + (a.primary ? 'sengp-btn-primary' : 'sengp-btn-ghost');
                b.textContent = a.label;
                b.onclick = function () { closeOverlay(ov); resolve(a.value); };
                act.appendChild(b);
            });
            card.appendChild(act);
            ov.appendChild(card);
            root().appendChild(ov);

            if (typeof opts.onMount === 'function') opts.onMount(card, function () { closeOverlay(ov); });
            requestAnimationFrame(function () { ov.classList.add('show'); });
        });
    };

    window.sengpAlert = function (message, title) {
        return window.sengpModal({
            title: title || 'SEN GP',
            message: String(message),
            actions: [{ label: 'OK', primary: true, value: true }]
        });
    };

    window.sengpConfirm = function (message, opts) {
        opts = opts || {};
        return window.sengpModal({
            title: opts.title || 'Confirmation',
            message: String(message),
            actions: [
                { label: opts.cancelLabel || 'Annuler', value: false },
                { label: opts.okLabel || 'OK', primary: true, value: true }
            ]
        });
    };

    // Tous les alert() existants adoptent désormais le design unifié.
    try { window.alert = function (m) { window.sengpAlert(m); }; } catch (e) { /* ignore */ }
})();
