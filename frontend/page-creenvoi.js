/* Script de creenvoi.html, extrait a l'identique de la page (aucun changement de comportement). */

// Cet ecran ne sert qu'aux expediteurs : l'API refuse la creation d'une mission a un GP ou a un admin (403).
// On le dit des l'ouverture plutot qu'a la derniere etape.
(function guardAccountType() {
    var user = null;
    try { if (localStorage.getItem('authToken')) user = JSON.parse(localStorage.getItem('userData') || 'null'); } catch (e) { /* ignore */ }
    if (!user || !user.user_type || user.user_type === 'expediteur') return;
    var home = user.user_type === 'gp' ? 'dashgp.html' : (user.user_type === 'admin' ? 'admin.html' : 'index.html');
    var go = function () { window.location.replace(home); };
    SengpI18n.ready.then(function () {
        var type = sengpT(user.user_type === 'gp' ? 'roles.gp' : (user.user_type === 'admin' ? 'roles.admin' : 'roles.expediteur'));
        var msg = sengpT('errors.expediteur_only', { type: type });
        if (typeof window.sengpAlert === 'function') window.sengpAlert(msg, sengpT('errors.account_not_allowed')).then(go, go);
        else { alert(msg); go(); }
    });
})();
        let currentStep = 1;
        const totalSteps = 4;

        // Texte d'un element modifie par le script : sa cle est memorisee pour suivre un changement de langue.
        function setI18n(el, key, params) { el.setAttribute('data-i18n', key); el.textContent = sengpT(key, params); }

        const stepDescriptions = {
            1: 'cr.details_du_colis',
            2: 'cr.step2',
            3: 'cr.recapitulatif_de_votre_envoi',
            4: 'cr.step4'
        };

        function updateStep() {
            // Update step description
            setI18n(document.getElementById('stepDescription'), stepDescriptions[currentStep]);

            // Update stepper progress
            document.querySelector('.stepper').dataset.current = currentStep;
            const progress = Math.min(1, ((currentStep - 1) + 0.4) / (totalSteps - 1));
            document.getElementById('stepperProgress').style.width = (75 * progress) + '%';

            // Update step circles
            document.querySelectorAll('.step').forEach((step, index) => {
                const stepNumber = index + 1;
                step.classList.remove('active', 'completed');

                if (stepNumber < currentStep) {
                    step.classList.add('completed');
                    step.querySelector('.step-circle').textContent = '✓';
                } else if (stepNumber === currentStep) {
                    step.classList.add('active');
                    step.querySelector('.step-circle').textContent = stepNumber;
                } else {
                    step.querySelector('.step-circle').textContent = stepNumber;
                }
            });

            // Update content visibility
            document.querySelectorAll('.step-content').forEach(content => {
                content.classList.remove('active');
            });
            document.querySelector(`.step-content[data-step="${currentStep}"]`).classList.add('active');

            // Update buttons
            document.getElementById('prevBtn').style.display = currentStep === 1 ? 'none' : 'flex';
            setNextLabel(currentStep === totalSteps ? 'cr.confirm_pay' : 'cr.suivant');
            document.getElementById('crScroll').scrollTo({ top: 0, behavior: 'smooth' });

            // Recap (step 3) is built from the form; the payment step shows the total and gates the CTA
            if (currentStep === 3) {
                updateOrderSummary();
                updateNextButton(true);
            }
            if (currentStep === 4) {
                updateOrderSummary();
                togglePayButton();
            }

            // Validate current step
            validateForm();
        }

        function updateOrderSummary() {
            const $ = id => document.getElementById(id);

            // Package
            const packageType = $('packageType');
            $('summaryPackageType').textContent = (packageType.options[packageType.selectedIndex] || {}).text || '-';
            const weight = parseFloat($('packageWeight').value) || 0;
            $('summaryWeight').textContent = weight ? `${weight} kg` : '-';
            const description = $('description').value.trim();
            $('summaryDesc').textContent = description || (hasAudioRecording ? sengpT('cr.audio_message') : (uploadedPhotoBlob ? sengpT('cr.photo_of_parcel') : '-'));
            const photo = $('summaryPhoto');
            if (photoPreviewUrl) { photo.src = photoPreviewUrl; photo.classList.add('is-photo'); }
            else { photo.src = 'im/sengp-box-3d.png'; photo.classList.remove('is-photo'); }

            // Route
            const from = selectedDeparture, to = selectedArrival;
            $('summaryRoute').textContent = from && to ? `${from.city} → ${to.city}` : '-';
            $('sumFromFlag').textContent = from ? from.flag : '';
            $('sumFromCity').textContent = from ? from.city : '-';
            $('sumFromCountry').textContent = from ? SengpGeo.displayCountry(from.country) : '';
            $('sumToFlag').textContent = to ? to.flag : '';
            $('sumToCity').textContent = to ? to.city : '-';
            $('sumToCountry').textContent = to ? SengpGeo.displayCountry(to.country) : '';

            // Recipient
            $('summaryName').textContent = $('receiverName').value.trim() || '-';
            const phone = $('receiverPhone').value.trim();
            $('summaryPhone').textContent = phone ? `${$('selectedCode').textContent} ${phone}` : '-';

            // Shipping (no GP step: the mission is open to every GP)
            const date = $('desiredDepartureDate').value;
            $('summaryDate').textContent = date ? date.split('-').reverse().join('/') : '-';
            $('summaryGP').textContent = sengpT('cr.ouvert_a_tous_les');

            // Prix suggéré = tarif de référence de la grille tarifaire SEN GP (FCFA/kg, départ de Dakar),
            // 1 kg minimum facturable ; le client peut le modifier ensuite.
            const priceInput = $('offeredPrice');
            const perKg = referencePricePerKg(to);
            if (!priceInput.value && weight > 0 && perKg) priceInput.value = Math.round(Math.max(weight, 1) * perKg);
            recomputeTotal();
        }

        // Tarif de référence = grille tarifaire par continent (geo-data.js) ; null = pas de tarif défini.
        function referencePricePerKg(to) {
            return (to && SengpGeo.priceFor(to.country)) || null;
        }

        function recomputeTotal() {
            const offered = parseFloat(document.getElementById('offeredPrice').value) || 0;
            const txt = SengpI18n.fmt.currency(offered);
            document.getElementById('summaryTransport').textContent = txt;
            document.getElementById('summaryTotal').textContent = txt;
            document.getElementById('payTotal').textContent = txt;
        }

        function togglePriceEdit() {
            const box = document.getElementById('priceEdit');
            const btn = document.getElementById('priceEditBtn');
            box.hidden = !box.hidden;
            btn.setAttribute('aria-expanded', String(!box.hidden));
            if (!box.hidden) { const i = document.getElementById('offeredPrice'); i.focus({ preventScroll: true }); i.select(); }
        }
        function nextStep() {
            if (currentStep < totalSteps) {
                currentStep++;
                updateStep();
            } else {
                // Final step - Process payment
                if (selectedPaymentMethod && document.getElementById('termsAccepted').checked) {
                    processPayment();
                } else {
                    alert(sengpT('cr.alert_pay_terms'));
                }
            }
        }

        function previousStep() {
            if (currentStep > 1) {
                currentStep--;
                updateStep();
            }
        }

        function goBack() {
            if (currentStep === 1) {
                // Retourner au dashboard expéditeur
                window.location.href = 'dashexpediteur.html';
            } else {
                previousStep();
            }
        }

        function editStep(step) {
            currentStep = step;
            updateStep();
        }

        let selectedPaymentMethod = null;

        // === Audio Recording System ===
        let mediaRecorder = null;
        let audioChunks = [];
        let recordingStream = null;
        let recordingTimer = null;
        let recordingSeconds = 0;
        let isRecordingPaused = false;
        let hasAudioRecording = false;
        let audioBlob = null;
        let audioElement = null;
        let isPlaying = false;
        const MAX_RECORDING_SECONDS = 10;

        // === Media Upload System ===
        let uploadedMedia = null;

        function openAudioControls() {
            const controls = document.getElementById('audioControls');
            controls.classList.add('active');
        }

        function generateWaveformBars() {
            const container = document.getElementById('waveformBars');
            container.innerHTML = '';
            const barCount = 20;
            for (let i = 0; i < barCount; i++) {
                const bar = document.createElement('div');
                bar.className = 'waveform-bar';
                const height = Math.random() * 20 + 8;
                bar.style.height = height + 'px';
                container.appendChild(bar);
            }
        }

        async function startRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                recordingStream = stream;

                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                recordingSeconds = 0;
                isRecordingPaused = false;

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    hasAudioRecording = true;

                    // Stop all tracks
                    if (recordingStream) {
                        recordingStream.getTracks().forEach(track => track.stop());
                    }

                    // Hide recording interface
                    document.getElementById('recordingInterface').style.display = 'none';
                    document.getElementById('startBtn').style.display = 'none';

                    // Show audio bubble
                    showAudioBubble();

                    // Disable voice button
                    document.getElementById('voiceBtn').disabled = true;
                    document.getElementById('voiceBtn').style.opacity = '0.5';

                    validateForm();
                };

                mediaRecorder.start();
                startTimer();

                // Show recording interface
                document.getElementById('startBtn').style.display = 'none';
                document.getElementById('recordingInterface').style.display = 'flex';

            } catch (error) {
                console.error('Erreur microphone:', error);
                alert(sengpT('cr.mic_denied'));
            }
        }

        function pauseRecording() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.pause();
                isRecordingPaused = true;
                clearInterval(recordingTimer);
                document.getElementById('pauseBtn').innerHTML = SengpIcons.svg('play', 20);
            } else if (mediaRecorder && mediaRecorder.state === 'paused') {
                mediaRecorder.resume();
                isRecordingPaused = false;
                startTimer();
                document.getElementById('pauseBtn').innerHTML = SengpIcons.svg('pause', 20);
            }
        }

        function stopRecording() {
            if (mediaRecorder && (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused')) {
                mediaRecorder.stop();
                clearInterval(recordingTimer);
            }
        }

        function showAudioBubble() {
            // Generate waveform
            generateWaveformBars();

            // Set duration
            const duration = formatTime(recordingSeconds);
            document.getElementById('audioDuration').textContent = duration;

            // Create audio element for playback
            audioElement = new Audio(URL.createObjectURL(audioBlob));

            // Show bubble
            document.getElementById('audioMessageBubble').classList.add('active');
        }

        function toggleAudioPlayback() {
            if (!audioElement) return;

            if (isPlaying) {
                audioElement.pause();
                isPlaying = false;
                document.getElementById('playIcon').className = 'play-icon';
            } else {
                audioElement.play();
                isPlaying = true;
                document.getElementById('playIcon').className = 'pause-icon';

                // Update progress
                audioElement.ontimeupdate = () => {
                    const progress = (audioElement.currentTime / audioElement.duration) * 100;
                    document.getElementById('waveformFill').style.width = progress + '%';
                };

                audioElement.onended = () => {
                    isPlaying = false;
                    document.getElementById('playIcon').className = 'play-icon';
                    document.getElementById('waveformFill').style.width = '0%';
                };
            }
        }

        function deleteAudio() {
            // Reset audio
            audioBlob = null;
            hasAudioRecording = false;
            if (audioElement) {
                audioElement.pause();
                audioElement = null;
            }
            isPlaying = false;

            // Hide bubble
            document.getElementById('audioMessageBubble').classList.remove('active');

            // Show start button
            document.getElementById('startBtn').style.display = 'flex';

            // Enable voice button
            document.getElementById('voiceBtn').disabled = false;
            document.getElementById('voiceBtn').style.opacity = '1';

            validateForm();
        }

        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${String(secs).padStart(2, '0')}`;
        }

        function startTimer() {
            recordingTimer = setInterval(() => {
                if (!isRecordingPaused) {
                    recordingSeconds++;

                    const display = formatTime(recordingSeconds);
                    document.getElementById('recordingTimer').textContent = display;

                    // Auto-stop at 10 seconds
                    if (recordingSeconds >= MAX_RECORDING_SECONDS) {
                        stopRecording();
                    }
                }
            }, 1000);
        }

        // === Photo du colis : contrôle de qualité (netteté, luminosité, résolution) ===
        let uploadedPhotoBlob = null;       // JPEG compressé (≤ 1600 px) envoyé à la création de l'envoi
        let photoPreviewUrl = null;

        // Seuils calibrés sur des photos nettes / floutées / assombries / surexposées (voir design-assets/create-screen/README.md)
        const PHOTO_RULES = {
            maxBytes: 50 * 1024 * 1024,
            minSide: 480,                         // px, côté le plus court
            dark: { mean: 50, p95: 90 },          // luminance moyenne ou 95e centile trop bas
            bright: { clip: 0.35, mean: 195 },    // part de pixels brûlés (≥250) et image claire
            flat: { std: 12 },                    // contraste quasi nul : objectif masqué / colis absent
            blur: { minStd: 25, lapVar: 30, lapP99: 30 }  // variance du laplacien : peu de bords nets
        };

        // Refus de photo : textes dans la langue courante (cles cr.photo_<code>_cause / _msg / _tip).
        function photoError(code, params) {
            const base = 'cr.photo_' + code;
            const family = code.startsWith('decode') ? 'cr.photo_decode' : base;
            return { ok: false, code, title: sengpT('cr.photo_refused', { cause: sengpT(family + '_cause') }), message: sengpT(base + '_msg', params), tip: sengpT(code === 'decode_read' ? 'cr.photo_decode_read_tip' : (code.startsWith('decode') ? 'cr.photo_decode_other_tip' : base + '_tip')) };
        }

        async function decodePhoto(file) {
            if (window.createImageBitmap) {
                try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* repli ci-dessous */ }
            }
            return await new Promise((resolve, reject) => {
                const url = URL.createObjectURL(file);
                const img = new Image();
                img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
                img.src = url;
            });
        }

        // Mesures sur une version réduite (≤ 1024 px) : luminance, contraste, bords nets
        function measurePhoto(source, sw, sh) {
            const scale = Math.min(1, 1024 / Math.max(sw, sh));
            const w = Math.max(1, Math.round(sw * scale));
            const h = Math.max(1, Math.round(sh * scale));
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(source, 0, 0, w, h);
            const d = ctx.getImageData(0, 0, w, h).data;
            const n = w * h;
            const g = new Float32Array(n);
            const hist = new Uint32Array(256);
            let sum = 0, sumSq = 0, clip = 0;
            for (let i = 0, p = 0; i < n; i++, p += 4) {
                const v = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
                g[i] = v; sum += v; sumSq += v * v;
                const b = v | 0;
                hist[b > 255 ? 255 : b]++;
                if (v >= 250) clip++;
            }
            const mean = sum / n;
            const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
            let acc = 0, p95 = 255;
            for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= 0.95 * n) { p95 = b; break; } }

            // Laplacien 3×3 : une image nette a beaucoup de bords forts, une image floue presque aucun
            const lh = new Uint32Array(1021);
            let lsum = 0, lsq = 0, cnt = 0;
            for (let y = 1; y < h - 1; y++) {
                let i = y * w + 1;
                for (let x = 1; x < w - 1; x++, i++) {
                    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
                    lsum += l; lsq += l * l; cnt++;
                    const a = Math.abs(l) | 0;
                    lh[a > 1020 ? 1020 : a]++;
                }
            }
            const lmean = cnt ? lsum / cnt : 0;
            const lapVar = cnt ? lsq / cnt - lmean * lmean : 0;
            let lacc = 0, lapP99 = 0;
            for (let b = 0; b <= 1020; b++) { lacc += lh[b]; if (lacc >= 0.99 * cnt) { lapP99 = b; break; } }
            return { mean, std, p95, clip: clip / n, lapVar, lapP99 };
        }

        async function analyzePhoto(file) {
            const R = PHOTO_RULES;
            if (!file.type || !file.type.startsWith('image/')) {
                return photoError('type');
            }
            if (file.size > R.maxBytes) {
                return photoError('size');
            }
            let bmp;
            try { bmp = await decodePhoto(file); }
            catch (e) { return photoError('decode_read'); }

            const sw = bmp.width, sh = bmp.height;
            if (Math.min(sw, sh) < R.minSide) {
                return photoError('small', { w: sw, h: sh });
            }
            const m = measurePhoto(bmp, sw, sh);
            if (m.mean < R.dark.mean || m.p95 < R.dark.p95) {
                return photoError('dark');
            }
            if (m.clip >= R.bright.clip && m.mean >= R.bright.mean) {
                return photoError('bright');
            }
            if (m.std < R.flat.std) {
                return photoError('flat');
            }
            if (m.std >= R.blur.minStd && m.lapVar < R.blur.lapVar && m.lapP99 < R.blur.lapP99) {
                return photoError('blur');
            }
            return { ok: true, metrics: m, bitmap: bmp };
        }

        function compressPhoto(bmp) {
            const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
            const c = document.createElement('canvas');
            c.width = Math.round(bmp.width * scale);
            c.height = Math.round(bmp.height * scale);
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
            return new Promise(resolve => c.toBlob(b => resolve(b), 'image/jpeg', 0.82));
        }

        function setPhotoState(state) {
            const drop = document.getElementById('mediaUploadSection');
            const preview = document.getElementById('mediaPreview');
            drop.classList.toggle('is-analyzing', state === 'analyzing');
            drop.classList.toggle('is-error', state === 'error');
            setI18n(document.getElementById('dropTitle'), state === 'analyzing' ? 'cr.analyzing' : (state === 'error' ? 'cr.retake' : 'cr.prendre_une_photo_du'));
            setI18n(document.getElementById('dropSub'), state === 'analyzing' ? 'cr.analyzing_sub' : 'cr.une_seule_photo_max');
            drop.hidden = state === 'ok';
            preview.hidden = state !== 'ok';
        }

        function showPhotoAlert(res) {
            document.getElementById('photoAlertTitle').textContent = res.title;
            document.getElementById('photoAlertMsg').textContent = res.message;
            document.getElementById('photoAlertTip').textContent = res.tip ? sengpT('cr.photo_tip', { tip: res.tip }) : '';
            const el = document.getElementById('photoAlert');
            el.hidden = false;
            try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
        }
        function hidePhotoAlert() { document.getElementById('photoAlert').hidden = true; }

        function clearPhoto() {
            uploadedMedia = null;
            uploadedPhotoBlob = null;
            if (photoPreviewUrl) { URL.revokeObjectURL(photoPreviewUrl); photoPreviewUrl = null; }
            document.getElementById('previewContent').innerHTML = '';
        }

        async function handleMediaUpload(event) {
            const input = event.target;
            const file = input.files && input.files[0];
            if (!file) return;

            clearPhoto();
            hidePhotoAlert();
            setPhotoState('analyzing');

            let res;
            try { res = await analyzePhoto(file); }
            catch (e) { res = photoError('decode_analyze'); }
            input.value = '';   // permet de re-choisir le même fichier après un refus

            if (!res.ok) {
                setPhotoState('error');
                showPhotoAlert(res);
                validateForm();
                return;
            }

            const blob = await compressPhoto(res.bitmap);
            if (!blob) {
                setPhotoState('error');
                showPhotoAlert(photoError('decode_prepare'));
                validateForm();
                return;
            }

            uploadedMedia = file;
            uploadedPhotoBlob = blob;
            photoPreviewUrl = URL.createObjectURL(blob);
            document.getElementById('previewContent').innerHTML = `<img src="${photoPreviewUrl}" alt="${window.sengpEsc(sengpT('cr.photo_preview_alt'))}" />`;
            setPhotoState('ok');
            validateForm();
        }

        function removeMedia() {
            clearPhoto();
            hidePhotoAlert();
            document.getElementById('mediaInput').value = '';
            setPhotoState('idle');
            validateForm();
        }

        // === Type de colis (grille d'illustrations) ===
        const PACKAGE_TYPES = [
            ['carton', 'Carton'], ['enveloppe', 'Enveloppe'], ['colis-souple', 'Colis souple'], ['caisse', 'Caisse'],
            ['bagage', 'Bagage'], ['palette', 'Palette'], ['tube', 'Tube'], ['autre', 'Autre'],
            ['volumineux', 'Colis volumineux'], ['refrigere', 'Colis réfrigéré'], ['dangereux', 'Colis dangereux'], ['documents', 'Documents'],
            ['electronique', 'Appareil électronique'], ['fragile', 'Objet fragile'], ['textile', 'Textile'], ['materiau', 'Matériau / Pièce']
        ];
        const TYPES_VISIBLE = 8;

        function buildTypeGrid() {
            const grid = document.getElementById('tyGrid');
            const select = document.getElementById('packageType');
            PACKAGE_TYPES.forEach(([id, label], i) => {
                const opt = new Option(sengpT('cr.type_' + id), id); opt.setAttribute('data-i18n', 'cr.type_' + id); select.add(opt);
                const el = document.createElement('label');
                el.className = 'ty';
                if (i >= TYPES_VISIBLE) el.hidden = true;
                el.innerHTML =
                    `<input type="radio" name="pkgType" value="${id}">` +
                    `<span class="ty__in"><span class="ty__ck"><svg class="cr-i" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>` +
                    `<img src="im/types/${id}.webp" alt="" width="200" height="160" loading="lazy" decoding="async">` +
                    `<span class="ty__t" data-i18n="cr.type_${id}">${window.sengpEsc(sengpT('cr.type_' + id))}</span></span>`;
                grid.appendChild(el);
            });
            grid.addEventListener('change', e => { if (e.target.name === 'pkgType') selectType(e.target.value); });
        }

        function selectType(id) {
            document.getElementById('packageType').value = id;
            document.getElementById('dangerNote').hidden = id !== 'dangereux';
            validateForm();
        }

        function toggleMoreTypes() {
            const btn = document.getElementById('tyMore');
            const expand = btn.getAttribute('aria-expanded') !== 'true';
            document.querySelectorAll('#tyGrid .ty').forEach((el, i) => { if (i >= TYPES_VISIBLE) el.hidden = !expand; });
            btn.setAttribute('aria-expanded', String(expand));
            setI18n(document.getElementById('tyMoreLabel'), expand ? 'cr.see_less' : 'cr.voir_tous_les_types');
        }

        // === Poids (− / +) ===
        function syncWeightButtons() {
            const v = parseFloat(document.getElementById('packageWeight').value);
            document.getElementById('wtMinus').disabled = !(v > 0.5);
        }
        function onWeightInput() { syncWeightButtons(); validateForm(); }
        function stepWeight(dir) {
            const el = document.getElementById('packageWeight');
            let v = parseFloat(el.value);
            if (!(v > 0)) v = 0;
            const step = (dir > 0 ? v >= 5 : v > 5) ? 1 : 0.5;
            v = (v === 0 && dir > 0) ? 1 : v + dir * step;
            v = Math.min(100, Math.max(0.5, Math.round(v * 10) / 10));
            el.value = v;
            onWeightInput();
        }

        function setNextLabel(key) { setI18n(document.getElementById('nextLabel'), key); }

        // Réserve la place de la bannière d'installation PWA (pwa.js) sous la barre d'actions
        (function trackInstallBanner() {
            const root = document.documentElement;
            let ro = null;
            const sync = () => {
                const b = document.getElementById('sengp-install-banner');
                root.style.setProperty('--cr-banner-h', b ? (b.offsetHeight + 8) + 'px' : '0px');
                if (b && !ro && window.ResizeObserver) { ro = new ResizeObserver(sync); ro.observe(b); }
                if (!b && ro) { ro.disconnect(); ro = null; }
            };
            new MutationObserver(sync).observe(document.body, { childList: true });
            sync();
        })();

        SengpI18n.ready.then(buildTypeGrid);
        syncWeightButtons();

        // === Country Codes System ===
        let selectedCountryCode = { flag: '🇸🇳', code: '+221', country: 'Sénégal' };

        const countryCodes = [
            // Afrique
            { flag: '🇸🇳', code: '+221', country: 'Sénégal' },
            { flag: '🇲🇦', code: '+212', country: 'Maroc' },
            { flag: '🇩🇿', code: '+213', country: 'Algérie' },
            { flag: '🇹🇳', code: '+216', country: 'Tunisie' },
            { flag: '🇨🇮', code: '+225', country: 'Côte d\'Ivoire' },
            { flag: '🇨🇲', code: '+237', country: 'Cameroun' },
            { flag: '🇬🇭', code: '+233', country: 'Ghana' },
            { flag: '🇳🇬', code: '+234', country: 'Nigeria' },
            { flag: '🇿🇦', code: '+27', country: 'Afrique du Sud' },
            // Europe
            { flag: '🇫🇷', code: '+33', country: 'France' },
            { flag: '🇬🇧', code: '+44', country: 'Royaume-Uni' },
            { flag: '🇪🇸', code: '+34', country: 'Espagne' },
            { flag: '🇮🇹', code: '+39', country: 'Italie' },
            { flag: '🇩🇪', code: '+49', country: 'Allemagne' },
            { flag: '🇧🇪', code: '+32', country: 'Belgique' },
            { flag: '🇨🇭', code: '+41', country: 'Suisse' },
            { flag: '🇵🇹', code: '+351', country: 'Portugal' },
            // Amérique
            { flag: '🇺🇸', code: '+1', country: 'États-Unis' },
            { flag: '🇨🇦', code: '+1', country: 'Canada' },
            { flag: '🇧🇷', code: '+55', country: 'Brésil' },
            { flag: '🇲🇽', code: '+52', country: 'Mexique' },
            // Asie
            { flag: '🇨🇳', code: '+86', country: 'Chine' },
            { flag: '🇯🇵', code: '+81', country: 'Japon' },
            { flag: '🇰🇷', code: '+82', country: 'Corée du Sud' },
            { flag: '🇮🇳', code: '+91', country: 'Inde' },
            { flag: '🇹🇭', code: '+66', country: 'Thaïlande' },
            { flag: '🇦🇪', code: '+971', country: 'Émirats Arabes Unis' },
            { flag: '🇸🇦', code: '+966', country: 'Arabie Saoudite' }
        ];

        function openCountryCodeModal() {
            populateCountryCodes(countryCodes);
            document.getElementById('countryCodeModal').classList.add('active');
        }

        function closeCountryCodeModal(event) {
            if (event && event.target !== event.currentTarget) return;
            document.getElementById('countryCodeModal').classList.remove('active');
            document.getElementById('countryCodeSearch').value = '';
        }

        function populateCountryCodes(codes) {
            const list = document.getElementById('countryCodesList');
            list.innerHTML = '';

            codes.forEach(code => {
                const item = document.createElement('div');
                item.className = 'location-item';
                item.onclick = () => selectCountryCode(code);

                item.innerHTML = `
                    <span class="location-item-flag">${code.flag}</span>
                    <div class="location-item-info">
                        <div class="location-item-country">${window.sengpEsc(SengpGeo.displayCountry(code.country))}</div>
                        <div class="location-item-city">${code.code}</div>
                    </div>
                `;

                list.appendChild(item);
            });
        }

        function filterCountryCodes() {
            const search = document.getElementById('countryCodeSearch').value.toLowerCase();
            const filtered = countryCodes.filter(code =>
                code.country.toLowerCase().includes(search) || SengpGeo.displayCountry(code.country).toLowerCase().includes(search) ||
                code.code.includes(search)
            );
            populateCountryCodes(filtered);
        }

        function selectCountryCode(code) {
            selectedCountryCode = code;
            document.getElementById('selectedFlag').textContent = code.flag;
            document.getElementById('selectedCode').textContent = code.code;
            closeCountryCodeModal();
        }

        // === Location System ===
        let currentModalType = ''; // 'departure' or 'arrival'
        let selectedDeparture = null;
        let selectedArrival = null;

        // Sélecteur continent > pays > région (geo.js)
        function openLocationModal(type) {
            currentModalType = type;
            const cur = type === 'departure' ? selectedDeparture : selectedArrival;
            SengpGeo.open({
                title: sengpT(type === 'departure' ? 'dash.pick_departure' : 'dash.pick_arrival'),
                country: cur && cur.country,
                onPick: sel => selectLocation({ flag: sel.flag, country: sel.country, city: sel.region, continent: sel.continent })
            });
        }

        function selectLocation(location) {
            if (currentModalType === 'departure') {
                selectedDeparture = location;
                document.getElementById('departureFlag').textContent = location.flag;
                document.getElementById('departureName').removeAttribute('data-i18n');
                document.getElementById('departureName').textContent = `${location.city}, ${SengpGeo.displayCountry(location.country)}`;
                document.getElementById('departureLocation').classList.add('is-filled');
            } else {
                selectedArrival = location;
                document.getElementById('arrivalFlag').textContent = location.flag;
                document.getElementById('arrivalName').removeAttribute('data-i18n');
                document.getElementById('arrivalName').textContent = `${location.city}, ${SengpGeo.displayCountry(location.country)}`;
                document.getElementById('arrivalLocation').classList.add('is-filled');
            }

            validateStep2();
        }

        // === Form Validation ===
        function validateForm() {
            if (currentStep === 1) {
                return validateStep1();
            } else if (currentStep === 2) {
                return validateStep2();
            }
            return true;
        }

        function validateStep1() {
            const packageType = document.getElementById('packageType').value;
            const description = document.getElementById('description').value.trim();
            const weight = parseFloat(document.getElementById('packageWeight').value);

            const hasPackageType = packageType !== '';
            const hasWeight = weight > 0;
            const hasDescription = description.length > 0;
            const hasMedia = uploadedMedia !== null;

            const isValid = hasPackageType && hasWeight && (hasDescription || hasAudioRecording || hasMedia);

            updateNextButton(isValid);
            return isValid;
        }

        function validateStep2() {
            const hasDeparture = selectedDeparture !== null;
            const hasArrival = selectedArrival !== null;
            const receiverPhone = document.getElementById('receiverPhone').value.trim();
            const hasPhone = receiverPhone.length >= 8;
            const hasPickup = document.getElementById('pickupAddress').value.trim().length > 0;
            const hasDelivery = document.getElementById('deliveryAddress').value.trim().length > 0;
            const hasDate = !!document.getElementById('desiredDepartureDate').value;

            const isValid = hasDeparture && hasArrival && hasPhone && hasPickup && hasDelivery && hasDate;

            updateNextButton(isValid);
            return isValid;
        }

        function updateNextButton(isValid) {
            const nextBtn = document.getElementById('nextBtn');
            nextBtn.disabled = !isValid;
            nextBtn.style.opacity = isValid ? '1' : '0.5';
            nextBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';
        }

        // L'option carte n'apparaît que si le serveur a Stripe configuré.
        (async function showCardIfAvailable() {
            try {
                const token = localStorage.getItem('authToken');
                const r = await fetch(`${window.API_BASE_URL}/payments/methods`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
                const j = await r.json();
                if (j && j.data && j.data.card) document.getElementById('payCardOpt').hidden = false;
            } catch (e) { /* carte indisponible : on reste sur Wave et paiement à la livraison */ }
        })();

        function selectPaymentMethod(method) {
            selectedPaymentMethod = method;
            togglePayButton();
        }

        function togglePayButton() {
            const termsAccepted = document.getElementById('termsAccepted').checked;
            const nextBtn = document.getElementById('nextBtn');
            const ok = !!(termsAccepted && selectedPaymentMethod);
            nextBtn.disabled = !ok;
            nextBtn.style.opacity = ok ? '1' : '0.5';
            const hint = document.getElementById('payHint');
            if (ok) { hint.hidden = true; }
            else {
                hint.hidden = false;
                setI18n(hint, !selectedPaymentMethod && !termsAccepted ? 'cr.pay_hint_both' : (!selectedPaymentMethod ? 'cr.pay_hint_method' : 'cr.pay_hint_terms'));
            }
        }

        function editStep(stepNumber) {
            currentStep = stepNumber;
            updateStep();
        }

        function showTerms() {
            event.preventDefault();
            alert(sengpT('cr.terms_stub'));
        }

        function showPrivacy() {
            event.preventDefault();
            alert(sengpT('cr.privacy_stub'));
        }

        async function processPayment() {
            const token = localStorage.getItem('authToken');
            if (!token) {
                alert(sengpT('errors.session_expired'));
                window.location.href = 'connexion.html';
                return;
            }

            // Gather + validate the required mission fields.
            const packageType = document.getElementById('packageType');
            const packageTypeText = (PACKAGE_TYPES.find(t => t[0] === packageType.value) || [])[1] || '';   // libelle francais : valeur enregistree
            const description = document.getElementById('description').value.trim();
            const weight = parseFloat(document.getElementById('packageWeight').value);
            const pickup = document.getElementById('pickupAddress').value.trim();
            const delivery = document.getElementById('deliveryAddress').value.trim();
            const date = document.getElementById('desiredDepartureDate').value;
            const offered = parseFloat(document.getElementById('offeredPrice').value);

            if (!selectedDeparture || !selectedArrival) { alert(sengpT('cr.need_route')); return; }
            if (!weight || weight <= 0) { alert(sengpT('cr.need_weight')); return; }
            if (!pickup || !delivery) { alert(sengpT('cr.need_addresses')); return; }
            if (!date) { alert(sengpT('cr.need_date')); return; }
            if (!offered || offered <= 0) { alert(sengpT('cr.need_price')); return; }

            if (!selectedPaymentMethod) { alert(sengpT('cr.need_payment')); return; }

            const nextBtn = document.getElementById('nextBtn');
            nextBtn.disabled = true;
            setNextLabel('cr.processing');

            // Photo du colis (facultative) : envoyée vers le stockage ; en cas d'échec, l'envoi est créé sans photo.
            let photoKey = null;
            if (uploadedPhotoBlob) {
                try {
                    setNextLabel('cr.uploading_photo');
                    const fd = new FormData();
                    fd.append('file', uploadedPhotoBlob, 'colis.jpg');
                    const up = await fetch(`${window.API_BASE_URL}/uploads`, {
                        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd
                    });
                    const uj = await up.json();
                    if (up.ok && uj.success && uj.data && uj.data.key) photoKey = uj.data.key;
                } catch (e) { /* photo facultative */ }
                setNextLabel('cr.processing');
            }

            const recipientName = (document.getElementById('receiverName') ? document.getElementById('receiverName').value.trim() : '') || null;
            const recipientPhone = ((document.getElementById('selectedCode') ? document.getElementById('selectedCode').textContent : '') + ' ' + (document.getElementById('receiverPhone') ? document.getElementById('receiverPhone').value.trim() : '')).trim() || null;

            try {
                // 1. Create the mission (open — any GP can accept it).
                const missionRes = await fetch(`${window.API_BASE_URL}/missions`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        departure_country: selectedDeparture.country,
                        departure_city: selectedDeparture.city,
                        pickup_address: pickup,
                        arrival_country: selectedArrival.country,
                        arrival_city: selectedArrival.city,
                        delivery_address: delivery,
                        package_weight: weight,
                        package_description: description || packageTypeText,
                        ...(photoKey ? { package_photos: [photoKey] } : {}),
                        desired_departure_date: date,
                        offered_price: offered,
                        is_price_negotiable: true,
                        recipient_name: recipientName,
                        recipient_phone: recipientPhone,
                        payment_method: selectedPaymentMethod
                    })
                });
                const missionResult = await missionRes.json();
                if (missionRes.status === 403) {
                    throw new Error(sengpT('cr.not_sender_403'));
                }
                if (!missionRes.ok || !missionResult.success) {
                    throw new Error(missionResult.error || sengpT('cr.mission_failed'));
                }
                const mission = missionResult.data;

                // 2a. Paiement à la livraison : aucun paiement en ligne, récap + dashboard.
                if (selectedPaymentMethod === 'cod') {
                    alert(sengpT('cr.cod_summary', {
                        type: (selectedTypeLabel() || '—'),
                        route: selectedDeparture.city + ' → ' + selectedArrival.city,
                        recipient: (recipientName || '—'),
                        weight: weight,
                        price: SengpI18n.fmt.currency(offered),
                        tracking: (mission.tracking_number || mission.mission_code || '')
                    }));
                    // Ouvre « Mes envois » sur cet envoi (le QR est disponible via la tuile « QR code »).
                    window.location.href = 'envois.html?open=' + encodeURIComponent(mission.id);
                    return;
                }

                // 2b. Paiement en ligne (Wave ou carte bancaire via Stripe).
                const payment_method = selectedPaymentMethod === 'card' ? 'card' : 'wave';
                const payRes = await fetch(`${window.API_BASE_URL}/payments`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mission_id: mission.id, payment_method, return_to: (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) ? 'app' : 'web' })
                });
                const payResult = await payRes.json();
                if (!payRes.ok || !payResult.success) {
                    throw new Error(payResult.error || sengpT('cr.payment_init_failed'));
                }

                // 3. Open the provider's payment page.
                const redirectUrl = payResult.data?.redirect_url;
                const paymentId = payResult.data?.payment?.id;
                // Partage WhatsApp automatique au destinataire : déclenché (une fois le paiement confirmé) à l'ouverture de « Mes envois ».
                try { localStorage.setItem('sg_pending_share', JSON.stringify({ id: mission.id, paymentId })); } catch (e) {}
                if (!redirectUrl) {
                    alert(sengpT('cr.no_payment_url'));
                    nextBtn.disabled = false;
                    setNextLabel('cr.confirm_pay');
                    return;
                }

                const Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
                if (Browser) {
                    // App native : ouvrir Wave dans un navigateur in-app pour rester dans l'app.
                    let handled = false;
                    const onFinish = async () => {
                        if (handled) return; handled = true;
                        try { if (Browser.removeAllListeners) await Browser.removeAllListeners(); } catch (e) {}
                        // Le webhook Wave peut arriver juste après : on vérifie le statut quelques fois.
                        let status = 'pending';
                        for (let i = 0; i < 6 && status !== 'completed'; i++) {
                            try {
                                const r = await fetch(`${window.API_BASE_URL}/payments/${paymentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                                const j = await r.json();
                                status = (j.data && j.data.status) || status;
                            } catch (e) {}
                            if (status !== 'completed') await new Promise(res => setTimeout(res, 2000));
                        }
                        if (status === 'completed') {
                            alert(sengpT('cr.payment_ok', { route: selectedDeparture.city + ' → ' + selectedArrival.city, tracking: (mission.tracking_number || mission.mission_code || '') }));
                        } else {
                            alert(sengpT('cr.payment_pending'));
                        }
                        // Ouvre « Mes envois » sur cet envoi (le QR est disponible via la tuile « QR code »).
                        window.location.href = 'envois.html?open=' + encodeURIComponent(mission.id);
                    };
                    try { await Browser.addListener('browserFinished', onFinish); } catch (e) {}
                    await Browser.open({ url: redirectUrl, presentationStyle: 'popover' });
                } else {
                    // Web : navigation directe.
                    window.location.href = redirectUrl;
                }
            } catch (error) {
                console.error('Payment flow error:', error);
                alert(sengpT('envois.error', { message: error.message }));
                nextBtn.disabled = false;
                setNextLabel('cr.confirm_pay');
            }
        }

        function generateSerialNumber() {
            // Format: SNGP-YYYYMMDD-XXXX
            const date = new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const random = Math.floor(1000 + Math.random() * 9000); // 4 chiffres aléatoires

            const serial = `SNGP-${year}${month}${day}-${random}`;
            document.getElementById('serialNumber').textContent = serial;

            return serial;
        }

        function generateQRCode(serialNumber) {
            // Créer les données pour le QR code
            const qrData = {
                serial: serialNumber,
                type: document.getElementById('packageType').value,
                from: selectedDeparture ? `${selectedDeparture.city}, ${selectedDeparture.country}` : '',
                to: selectedArrival ? `${selectedArrival.city}, ${selectedArrival.country}` : '',
                date: new Date().toISOString(),
                platform: 'SEN GP'
            };

            // Nettoyer le canvas précédent
            const canvas = document.getElementById('qrCodeCanvas');
            const container = canvas.parentElement;
            container.innerHTML = '';

            // Créer un nouveau canvas
            const newCanvas = document.createElement('canvas');
            newCanvas.id = 'qrCodeCanvas';
            newCanvas.className = 'qr-code-canvas';
            container.appendChild(newCanvas);

            // Générer le QR code avec QRCode.js
            const qrcode = new QRCode(newCanvas, {
                text: JSON.stringify(qrData),
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        function downloadQRCode() {
            const canvas = document.getElementById('qrCodeCanvas');
            const serialNumber = document.getElementById('serialNumber').textContent;

            // Créer un canvas temporaire avec le numéro de série
            const tempCanvas = document.createElement('canvas');
            const ctx = tempCanvas.getContext('2d');

            // Taille du canvas final
            tempCanvas.width = 300;
            tempCanvas.height = 350;

            // Fond blanc
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

            // Ajouter le titre
            ctx.fillStyle = '#1a1a2e';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('SEN GP', tempCanvas.width / 2, 30);

            // Dessiner le QR code
            const qrCanvas = canvas.querySelector('canvas') || canvas;
            ctx.drawImage(qrCanvas, 50, 50, 200, 200);

            // Ajouter le numéro de série
            ctx.font = 'bold 14px Courier New';
            ctx.fillText(serialNumber, tempCanvas.width / 2, 280);

            ctx.font = '12px Arial';
            ctx.fillText('Conservez ce code', tempCanvas.width / 2, 310);
            ctx.fillText('pour la livraison', tempCanvas.width / 2, 330);

            // Télécharger l'image
            const link = document.createElement('a');
            link.download = `SENGP-${serialNumber}.png`;
            link.href = tempCanvas.toDataURL('image/png');
            link.click();
        }

        function shareQRCode() {
            const canvas = document.getElementById('qrCodeCanvas');
            const serialNumber = document.getElementById('serialNumber').textContent;

            // Vérifier si l'API Web Share est disponible
            if (navigator.share) {
                canvas.toBlob((blob) => {
                    const file = new File([blob], `SENGP-${serialNumber}.png`, { type: 'image/png' });
                    navigator.share({
                        title: sengpT('cr.share_title'),
                        text: sengpT('cr.serial_text', { serial: serialNumber }),
                        files: [file]
                    }).catch(() => {
                        alert(sengpT('cr.share_cancelled'));
                    });
                });
            } else {
                // Fallback: copier le numéro de série
                navigator.clipboard.writeText(serialNumber).then(() => {
                    alert(sengpT('cr.serial_copied'));
                }).catch(() => {
                    alert(sengpT('cr.share_failed', { serial: serialNumber }));
                });
            }
        }

        function goToDashboard() {
            window.location.href = 'dashexpediteur.html';
        }

        // Old functions removed - using new implementation above

        // Initialize
        SengpI18n.ready.then(updateStep);
        validateForm(); // Initialize form validation

        // Character counter for description
        const descriptionField = document.getElementById('description');
        if (descriptionField) {
            descriptionField.addEventListener('input', function() {
                const count = this.value.length;
                const counter = document.getElementById('charCount');
                if (counter) {
                    counter.textContent = count;
                    
                    // Change color based on usage
                    if (count > 450) {
                        counter.style.color = '#FF6B6B';
                    } else if (count > 350) {
                        counter.style.color = '#FFE66D';
                    } else {
                        counter.style.color = '#4ECDC4';
                    }
                }
            });
        }

// Libelle du type de colis choisi, dans la langue courante (affichage uniquement).
function selectedTypeLabel() {
    const v = document.getElementById('packageType').value;
    return v ? sengpT('cr.type_' + v) : '';
}

// Changement de langue : le recapitulatif et les montants sont recalcules.
window.addEventListener('sengp:languagechange', function () {
    if (typeof updateStep === 'function') updateStep();
    if (typeof recomputeTotal === 'function') recomputeTotal();
});
