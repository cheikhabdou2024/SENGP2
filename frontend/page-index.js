/* Script de index.html, extrait a l'identique de la page (aucun changement de comportement). */
        let currentScreen = 0;
        const totalScreens = 4;
        let selectedAccountType = null;

        // Splash → onboarding handoff. The branded logo (with the glass shimmer)
        // shows for 5s, then we advance to the first onboarding screen. Guarded so
        // it only fires once (img onload/onerror + a hard fallback all funnel through
        // here) and so a ?choice=1 deep-link to the account screen is never overridden.
        let _splashAdvanced = false;
        function scheduleSplashAdvance(delay) {
            if (_splashAdvanced) return;
            setTimeout(() => {
                if (_splashAdvanced) return;
                _splashAdvanced = true;
                goToScreen(1);
            }, delay === undefined ? 5000 : delay);
        }

        // Text rotation for screen 1
        const texts = [
            "nos meilleurs GP",
            "des voyageurs vérifiés",
            "nos transporteurs fiables"
        ];
        let currentIndex = 0;
        let isAnimating = false;

        function changeText() {
            if (isAnimating) return;
            
            isAnimating = true;
            const textElement = document.getElementById('changingText');
            
            if (textElement) {
                textElement.style.opacity = '0';
                textElement.style.transform = 'translateY(-30px)';
                
                setTimeout(() => {
                    currentIndex = (currentIndex + 1) % texts.length;
                    textElement.textContent = texts[currentIndex];
                    
                    textElement.style.opacity = '1';
                    textElement.style.transform = 'translateY(0)';
                    
                    setTimeout(() => {
                        isAnimating = false;
                    }, 600);
                }, 400);
            }
        }

        setInterval(changeText, 3000);

        function nextScreen() {
            if (currentScreen < totalScreens) {
                goToScreen(currentScreen + 1);
            }
        }

        function previousScreen() {
            if (currentScreen > 1) {
                goToScreen(currentScreen - 1);
            }
        }

        function handleGlobalLeft() {
            if (currentScreen === 1) {
                skipOnboarding();
            } else {
                previousScreen();
            }
        }

        function handleGlobalRight() {
            nextScreen();
        }

        function updateGlobalNav(screenNumber) {
            const globalNav = document.getElementById('globalNav');
            const btnLeft = document.getElementById('btnGlobalLeft');
            const btnRight = document.getElementById('btnGlobalRight');
            
            if (screenNumber >= 1 && screenNumber <= 3) {
                globalNav.style.display = 'flex';
                
                // Update Left Button
                if (screenNumber === 1) {
                    btnLeft.textContent = 'Passer';
                    btnLeft.className = 'btn btn-skip';
                } else {
                    btnLeft.textContent = 'Retour';
                    btnLeft.className = 'btn btn-back';
                }
                
                // Update Right Button
                if (screenNumber === 3) {
                    btnRight.textContent = 'Commencer';
                    btnRight.className = 'btn btn-start';
                } else {
                    btnRight.textContent = 'Suivant';
                    btnRight.className = 'btn btn-next';
                }
                
                // Update dots
                const dots = document.getElementById('globalPagination').querySelectorAll('.dot');
                dots.forEach((dot, idx) => {
                    dot.classList.toggle('active', idx === screenNumber - 1);
                    if (idx === 2 && screenNumber === 3) {
                        dot.style.background = 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
                        dot.style.boxShadow = '0 2px 8px rgba(255, 215, 0, 0.6)';
                    } else {
                        dot.style.background = '';
                        dot.style.boxShadow = '';
                    }
                });
            } else {
                globalNav.style.display = 'none';
            }
        }

        function goToScreen(screenNumber) {
            const currentScreenEl = document.querySelector(`.screen${currentScreen}`);
            const nextScreenEl = document.querySelector(`.screen${screenNumber}`);

            if (currentScreenEl && nextScreenEl) {
                // Remove active class from current screen
                currentScreenEl.classList.remove('active');
                
                // Add prev class if going forward, remove if going back
                if (screenNumber > currentScreen) {
                    currentScreenEl.classList.add('prev');
                } else {
                    currentScreenEl.classList.remove('prev');
                }

                // Add active class to next screen
                nextScreenEl.classList.add('active');
                nextScreenEl.classList.remove('prev');

                currentScreen = screenNumber;

                // Update pagination dots
                updatePagination();
                updateGlobalNav(screenNumber);
            }
        }

        function updatePagination() {
            document.querySelectorAll('.screen').forEach((screen, index) => {
                const dots = screen.querySelectorAll('.pagination .dot');
                dots.forEach((dot, dotIndex) => {
                    if (dotIndex === currentScreen - 1) {
                        dot.classList.add('active');
                    } else {
                        dot.classList.remove('active');
                    }
                });
            });
        }

        function skipOnboarding() {
            goToScreen(4);
        }

        let isNavigating = false;

        // Called when a profile radio changes; the visual state comes from :checked in CSS.
        function selectAccount(type) {
            selectedAccountType = type;
            document.getElementById('continueBtn').disabled = false;
        }

        function syncAccountSelection() {
            const checked = document.querySelector('input[name="accountType"]:checked');
            if (checked) selectAccount(checked.value);
            isNavigating = false;
        }

        document.querySelectorAll('input[name="accountType"]').forEach(radio => {
            radio.addEventListener('change', () => selectAccount(radio.value));
        });
        // Restores state when the browser re-shows the page (back button / bfcache)
        window.addEventListener('pageshow', syncAccountSelection);

        // Reserve room under the CTA for the PWA install banner (pwa.js), whatever its height
        (function trackInstallBanner() {
            const root = document.documentElement;
            let ro = null;
            const sync = () => {
                const b = document.getElementById('sengp-install-banner');
                root.style.setProperty('--pf-banner-h', b ? b.offsetHeight + 8 + 'px' : '0px');
                if (b && !ro && window.ResizeObserver) { ro = new ResizeObserver(sync); ro.observe(b); }
                if (!b && ro) { ro.disconnect(); ro = null; }
            };
            new MutationObserver(sync).observe(document.body, { childList: true });
            sync();
        })();

        function continueToSignup() {
            if (selectedAccountType && !isNavigating) {
                isNavigating = true;
                // Rediriger vers la page de connexion avec le type de compte choisi
                window.location.href = `connexion.html?type=${selectedAccountType}`;
            }
        }

        function goToLogin() {
            event.preventDefault();
            // Rediriger vers la page de connexion
            window.location.href = 'connexion.html';
        }

        // Animation on load
        window.addEventListener('load', () => {
            updatePagination();

            // Accès direct à l'écran de choix du compte (ex. après déconnexion).
            const _p = new URLSearchParams(location.search);
            if (_p.get('choice') === '1') {
                _splashAdvanced = true; // ne pas laisser le splash écraser cet écran
                goToScreen(4);
            } else {
                // Filet de sécurité : si onload/onerror de l'image ne se déclenchent
                // pas (décodage lent, cache), on quitte quand même le splash.
                scheduleSplashAdvance(6500);
            }

            // Swipe navigation between onboarding screens (left = next, right = previous)
            const sc = document.querySelector('.screens-container');
            if (sc) {
                let startX = null;
                sc.addEventListener('touchstart', (e) => {
                    startX = e.changedTouches[0].clientX;
                }, { passive: true });
                sc.addEventListener('touchend', (e) => {
                    if (startX === null) return;
                    const dx = e.changedTouches[0].clientX - startX;
                    if (Math.abs(dx) > 50) {
                        if (dx < 0) { nextScreen(); } else { previousScreen(); }
                    }
                    startX = null;
                }, { passive: true });
            }
        });
