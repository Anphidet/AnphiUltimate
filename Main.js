/**
 * Main.js - Grepolis Ultimate
 * Récupère l'UI exacte du script 2.0.0
 */

(function(GM_getValue, GM_setValue, GM_addStyle, GM_xmlhttpRequest, unsafeWindow) {
    'use strict';

    const REPO_BASE = "https://raw.githubusercontent.com/Anphidet/AnphiUltimate/main/modules/";

    const UltimateUI = {
        init: function() {
            this.injectLegacyStyles();
            this.buildWindow();
        },

        injectLegacyStyles: function() {
            // Extraction directe des styles visuels du script Ultimate 2.0.0
            GM_addStyle(`
                .ult-main-container { position: absolute; z-index: 1000; background-image: url(https://gpfr.innogamescdn.com/images/game/layout/content_bg.jpg); border: 2px solid #3e2712; color: #000; font-size: 12px; }
                .ult-title-bar { background: url(https://gpfr.innogamescdn.com/images/game/layout/tab_active.png) repeat-x; height: 28px; cursor: move; border-bottom: 1px solid #3e2712; display: flex; align-items: center; padding: 0 10px; font-weight: bold; color: #ffd700; text-shadow: 1px 1px #000; }
                .ult-tabs-wrapper { display: flex; background: #ccb073; border-bottom: 1px solid #3e2712; overflow-x: auto; }
                .ult-tab-btn { padding: 6px 12px; cursor: pointer; border-right: 1px solid #3e2712; background: #e2d1a6; font-weight: bold; font-family: Georgia, serif; text-transform: capitalize; }
                .ult-tab-btn:hover { background: #f1e7c5; }
                .ult-tab-btn.active { background: #f1e7c5; color: #8b4513; border-bottom: 1px solid transparent; }
                .ult-body { padding: 15px; min-height: 350px; width: 600px; background: rgba(241, 231, 197, 0.9); }
                .ult-close-btn { margin-left: auto; cursor: pointer; color: #fff; font-size: 16px; }
            `);
        },

        buildWindow: function() {
            if (document.getElementById('ult-bot-root')) return;

            const root = document.createElement('div');
            root.id = 'ult-bot-root';
            root.className = 'ult-main-container';
            root.style.top = '150px';
            root.style.left = '150px';

            root.innerHTML = `
                <div class="ult-title-bar">
                    <img src="https://gpfr.innogamescdn.com/images/game/res/wood.png" style="width:18px; margin-right:8px;">
                    GREPOLIS ULTIMATE BOT
                    <div class="ult-close-btn" onclick="this.parentElement.parentElement.remove()">✖</div>
                </div>
                <div class="ult-tabs-wrapper" id="ult-tabs">
                    <div class="ult-tab-btn active" data-id="general">Général</div>
                    <div class="ult-tab-btn" data-id="pillage">Pillage</div>
                    <div class="ult-tab-btn" data-id="culture">Culture</div>
                    <div class="ult-tab-btn" data-id="settings">Options</div>
                </div>
                <div class="ult-body" id="ult-main-content">
                    <h2 style="color:#8b4513;">Statut du Bot</h2>
                    <hr>
                    <p>En attente d'activation d'un module...</p>
                </div>
            `;

            document.body.appendChild(root);
            this.makeDraggable(root);
            this.initTabLogic();
        },

        initTabLogic: function() {
            const tabs = document.querySelectorAll('.ult-tab-btn');
            tabs.forEach(tab => {
                tab.onclick = () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.fetchModule(tab.getAttribute('data-id'));
                };
            });
        },

        fetchModule: function(moduleName) {
            const display = document.getElementById('ult-main-content');
            display.innerHTML = '<div class="loader" style="margin: 50px auto;"></div>';

            GM_xmlhttpRequest({
                method: "GET",
                url: `${REPO_BASE}${moduleName}.js?cache=${Date.now()}`,
                onload: (res) => {
                    if (res.status === 200) {
                        display.innerHTML = "";
                        // Exécution du module distant avec injection de l'UI
                        try {
                            const runModule = new Function('container', 'uw', 'GM', res.responseText);
                            runModule(display, unsafeWindow, { getValue: GM_getValue, setValue: GM_setValue });
                        } catch (e) {
                            display.innerHTML = `<p style="color:red">Erreur Module: ${e.message}</p>`;
                        }
                    } else {
                        display.innerHTML = `<p>Le module <b>${moduleName}</b> n'est pas encore prêt sur GitHub.</p>`;
                    }
                }
            });
        },

        makeDraggable: function(el) {
            let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
            const header = el.querySelector('.ult-title-bar');
            header.onmousedown = (e) => {
                p3 = e.clientX; p4 = e.clientY;
                document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
                document.onmousemove = (e) => {
                    p1 = p3 - e.clientX; p2 = p4 - e.clientY;
                    p3 = e.clientX; p4 = e.clientY;
                    el.style.top = (el.offsetTop - p2) + "px";
                    el.style.left = (el.offsetLeft - p1) + "px";
                };
            };
        }
    };

    UltimateUI.init();

})(GM_getValue, GM_setValue, GM_addStyle, GM_xmlhttpRequest, unsafeWindow);
