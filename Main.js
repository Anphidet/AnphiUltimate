(function() {
    'use strict';

    const BASE_URL = 'https://anphidet.github.io/AnphiUltimate';
    
    const TABS_CONFIG = [
        { id: 'farm', name: 'Farm', icon: '🌾', script: 'tabs/farm.js' },
        { id: 'build', name: 'Build', icon: '🏗️', script: 'tabs/build.js' },
        { id: 'recruit', name: 'Recruit', icon: '⚔️', script: 'tabs/recruit.js' },
        { id: 'dodge', name: 'Dodge', icon: '🛡️', script: 'tabs/dodge.js', disabled: true },
        { id: 'calage', name: 'Calage', icon: '⏱️', script: 'tabs/calage.js' },
        { id: 'settings', name: 'Parametres', icon: '⚙️', script: 'tabs/settings.js' }
    ];

    var uw = (typeof unsafeWindow == 'undefined') ? window : unsafeWindow;
    const loadedTabs = {};
    let currentTab = 'farm';
    let panelOpen = false;
    let logs = [];

    function getPlayerName() { try { return uw.Game.player_name || 'Inconnu'; } catch(e) { return 'Inconnu'; } }
    function getWorldName() { try { return uw.Game.world_id || window.location.hostname.split('.')[0] || 'Inconnu'; } catch(e) { return 'Inconnu'; } }

    GM_addStyle(`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Philosopher:wght@400;700&display=swap');
        .ultimate-bot-btn{position:fixed;bottom:20px;left:20px;z-index:99999;width:56px;height:56px;border-radius:50%;background:linear-gradient(145deg,#D4AF37 0%,#8B6914 50%,#5D4E37 100%);border:3px solid #FFD700;box-shadow:0 4px 15px rgba(0,0,0,0.5),0 0 25px rgba(212,175,55,0.4);cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:'Cinzel',serif;font-size:10px;font-weight:700;color:#1a1408;text-align:center;line-height:1.1;transition:all 0.3s ease}
        .ultimate-bot-btn:hover{transform:scale(1.1);box-shadow:0 6px 25px rgba(0,0,0,0.6),0 0 35px rgba(212,175,55,0.6)}
        .ultimate-bot-btn.has-active::after{content:'';position:absolute;top:-2px;right:-2px;width:14px;height:14px;background:#4CAF50;border-radius:50%;border:2px solid #2E7D32;animation:pulse-active 1.5s infinite}
        @keyframes pulse-active{0%,100%{box-shadow:0 0 5px #4CAF50}50%{box-shadow:0 0 15px #4CAF50,0 0 25px #4CAF50}}
        .ultimate-panel{display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:750px;max-height:85vh;background:linear-gradient(180deg,rgba(62,47,32,0.98) 0%,rgba(45,34,23,0.98) 50%,rgba(30,23,15,0.98) 100%);border:3px solid #D4AF37;border-radius:12px;box-shadow:0 15px 50px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,215,0,0.2);z-index:100000;font-family:'Philosopher',Georgia,serif;overflow:hidden}
        .ultimate-panel.open{display:flex;flex-direction:column;animation:panel-appear 0.3s ease-out}
        @keyframes panel-appear{from{opacity:0;transform:translate(-50%,-50%) scale(0.9)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        .ultimate-header{background:linear-gradient(180deg,#5D4E37 0%,#3D3225 100%);padding:15px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #D4AF37}
        .ultimate-title{font-family:'Cinzel',serif;font-size:20px;font-weight:700;color:#F5DEB3;text-shadow:0 2px 4px rgba(0,0,0,0.5);display:flex;align-items:center;gap:10px}
        .ultimate-version{font-size:11px;color:#D4AF37;background:rgba(0,0,0,0.3);padding:3px 8px;border-radius:4px}
        .ultimate-close{width:32px;height:32px;border-radius:50%;background:linear-gradient(145deg,#8B4513,#5D3A1A);border:2px solid #D4AF37;color:#F5DEB3;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;transition:all 0.2s}
        .ultimate-close:hover{background:linear-gradient(145deg,#A0522D,#8B4513);transform:scale(1.1)}
        .ultimate-tabs{display:flex;background:linear-gradient(180deg,#3D3225 0%,#2D2419 100%);border-bottom:1px solid rgba(212,175,55,0.3);overflow-x:auto;flex-shrink:0}
        .ultimate-tab{flex:1;min-width:80px;padding:10px 6px;text-align:center;font-family:'Cinzel',serif;font-size:10px;font-weight:600;color:#8B8B83;cursor:pointer;border:none;border-bottom:3px solid transparent;background:transparent;transition:all 0.2s;white-space:nowrap}
        .ultimate-tab:hover{color:#F5DEB3;background:rgba(212,175,55,0.1)}
        .ultimate-tab.active{color:#FFD700;border-bottom-color:#D4AF37;background:rgba(212,175,55,0.15)}
        .ultimate-tab.disabled{color:#555;cursor:not-allowed;opacity:0.6}
        .ultimate-tab .tab-icon{display:block;font-size:16px;margin-bottom:3px}
        .ultimate-main{display:flex;flex:1;overflow:hidden}
        .ultimate-body{padding:15px;flex:1;overflow-y:auto}
        .ultimate-body::-webkit-scrollbar{width:8px}
        .ultimate-body::-webkit-scrollbar-track{background:rgba(0,0,0,0.3);border-radius:4px}
        .ultimate-body::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#D4AF37,#8B6914);border-radius:4px}
        .ultimate-console{width:280px;background:linear-gradient(180deg,rgba(0,0,0,0.4) 0%,rgba(0,0,0,0.6) 100%);border-left:2px solid rgba(212,175,55,0.3);display:flex;flex-direction:column;flex-shrink:0}
        .console-header{padding:12px 15px;background:linear-gradient(180deg,rgba(93,78,55,0.8) 0%,rgba(61,50,37,0.8) 100%);border-bottom:1px solid rgba(212,175,55,0.3);font-family:'Cinzel',serif;font-size:13px;font-weight:600;color:#F5DEB3;display:flex;align-items:center;gap:8px}
        .console-content{flex:1;overflow-y:auto;padding:10px}
        .console-content::-webkit-scrollbar{width:6px}
        .console-content::-webkit-scrollbar-track{background:rgba(0,0,0,0.2)}
        .console-content::-webkit-scrollbar-thumb{background:#8B6914;border-radius:3px}
        .tab-content{display:none}
        .tab-content.active{display:block}
        .gu-loading{text-align:center;padding:60px 20px;color:#8B8B83;font-style:italic}
        .gu-loading-spinner{font-size:40px;margin-bottom:15px;animation:spin 1s linear infinite}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .coming-soon-container{text-align:center;padding:60px 20px}
        .coming-soon-icon{font-size:80px;margin-bottom:20px;opacity:0.5}
        .coming-soon-title{font-family:'Cinzel',serif;font-size:28px;color:#D4AF37;margin-bottom:15px}
        .coming-soon-text{font-size:16px;color:#8B8B83}
        .bot-section{background:rgba(0,0,0,0.25);border:1px solid rgba(212,175,55,0.3);border-radius:8px;margin-bottom:15px;overflow:hidden}
        .section-header{background:linear-gradient(180deg,rgba(93,78,55,0.8) 0%,rgba(61,50,37,0.8) 100%);padding:12px 15px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;border-bottom:1px solid rgba(212,175,55,0.2);transition:background 0.2s}
        .section-header:hover{background:linear-gradient(180deg,rgba(113,98,75,0.8) 0%,rgba(81,70,57,0.8) 100%)}
        .section-title{font-family:'Cinzel',serif;font-size:14px;font-weight:600;color:#F5DEB3;display:flex;align-items:center;gap:10px}
        .section-toggle{color:#D4AF37;font-size:12px;transition:transform 0.3s}
        .section-header.collapsed .section-toggle{transform:rotate(-90deg)}
        .section-content{padding:15px}
        .section-header.collapsed + .section-content{display:none}
        .main-control{display:flex;justify-content:space-between;align-items:center;padding:15px;background:linear-gradient(180deg,rgba(45,80,45,0.4) 0%,rgba(30,60,30,0.4) 100%);border:1px solid rgba(76,175,80,0.3);border-radius:8px;margin-bottom:15px}
        .main-control.inactive{background:linear-gradient(180deg,rgba(80,45,45,0.4) 0%,rgba(60,30,30,0.4) 100%);border-color:rgba(175,76,76,0.3)}
        .control-info .control-label{font-family:'Cinzel',serif;font-size:15px;font-weight:600;color:#F5DEB3}
        .control-info .control-status{font-size:12px;color:#81C784;margin-top:3px}
        .main-control.inactive .control-status{color:#E57373}
        .toggle-switch{position:relative;width:56px;height:28px;cursor:pointer}
        .toggle-switch input{display:none}
        .toggle-slider{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg,#5D3A1A 0%,#3D2510 100%);border:2px solid #8B6914;border-radius:28px;transition:all 0.4s}
        .toggle-slider::before{position:absolute;content:"";height:20px;width:20px;left:2px;bottom:2px;background:linear-gradient(145deg,#D4AF37,#8B6914);border-radius:50%;transition:all 0.4s;box-shadow:0 2px 5px rgba(0,0,0,0.3)}
        .toggle-switch input:checked + .toggle-slider{background:linear-gradient(180deg,#2E7D32 0%,#1B5E20 100%);border-color:#4CAF50}
        .toggle-switch input:checked + .toggle-slider::before{transform:translateX(28px);background:linear-gradient(145deg,#81C784,#4CAF50)}
        .stats-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        .stat-box{background:linear-gradient(180deg,rgba(0,0,0,0.3) 0%,rgba(0,0,0,0.5) 100%);border:1px solid rgba(212,175,55,0.2);border-radius:8px;padding:15px;text-align:center}
        .stat-value{font-family:'Cinzel',serif;font-size:24px;font-weight:700;color:#FFD700;text-shadow:0 0 10px rgba(255,215,0,0.5);display:block}
        .stat-label{font-size:11px;color:#BDB76B;text-transform:uppercase;letter-spacing:1px;margin-top:5px}
        .timer-container{background:linear-gradient(180deg,rgba(0,0,0,0.4) 0%,rgba(0,0,0,0.6) 100%);border:2px solid rgba(212,175,55,0.4);border-radius:8px;padding:18px;text-align:center}
        .timer-label{font-size:12px;color:#BDB76B;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px}
        .timer-value{font-family:'Cinzel',serif;font-size:36px;font-weight:700;color:#00FF88;text-shadow:0 0 20px rgba(0,255,136,0.5);letter-spacing:3px}
        .timer-value.ready{color:#FFD700;animation:timer-pulse 1s infinite}
        @keyframes timer-pulse{0%,100%{opacity:1}50%{opacity:0.7}}
        .options-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        .option-group{display:flex;flex-direction:column;gap:6px}
        .option-label{font-size:11px;color:#BDB76B;text-transform:uppercase;letter-spacing:1px}
        .option-select,.option-input{background:linear-gradient(180deg,#3D3225 0%,#2D2419 100%);border:1px solid #8B6914;border-radius:5px;color:#F5DEB3;padding:10px 12px;font-family:'Philosopher',serif;font-size:13px;cursor:pointer;transition:all 0.2s;width:100%;box-sizing:border-box}
        .option-select:hover,.option-input:hover{border-color:#D4AF37}
        .option-select:focus,.option-input:focus{outline:none;border-color:#FFD700;box-shadow:0 0 10px rgba(255,215,0,0.3)}
        .btn{background:linear-gradient(180deg,#D4AF37 0%,#8B6914 100%);border:2px solid #8B6914;border-radius:6px;color:#1a1408;padding:12px 20px;font-family:'Cinzel',serif;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s}
        .btn:hover{background:linear-gradient(180deg,#FFD700 0%,#D4AF37 100%);transform:translateY(-1px)}
        .btn-full{width:100%}
        .btn-success{background:linear-gradient(180deg,#4CAF50 0%,#2E7D32 100%);border-color:#2E7D32;color:#fff}
        .btn-danger{background:linear-gradient(180deg,#E53935 0%,#B71C1C 100%);border-color:#B71C1C;color:#fff}
        .btn-discord{background:linear-gradient(180deg,#5865F2 0%,#4752C4 100%);border-color:#4752C4;color:#fff}
        .log-entry{background:rgba(0,0,0,0.3);border-left:3px solid #D4AF37;padding:8px 10px;margin-bottom:6px;border-radius:0 4px 4px 0;font-size:11px;color:#F5DEB3}
        .log-entry.success{border-left-color:#4CAF50}
        .log-entry.error{border-left-color:#F44336}
        .log-entry.info{border-left-color:#2196F3}
        .log-entry.warning{border-left-color:#FF9800}
        .log-entry.farm{border-left-color:#8BC34A}
        .log-entry.build{border-left-color:#FF9800}
        .log-entry.recruit{border-left-color:#9C27B0}
        .log-time{color:#8B8B83;font-family:'Courier New',monospace;font-size:9px;display:block;margin-bottom:2px}
        .log-module{font-weight:bold;color:#D4AF37;margin-right:5px}
        .log-message{word-break:break-word}
        .logs-empty{text-align:center;color:#8B8B83;font-style:italic;padding:20px}
    `);

    function log(module, msg, type = 'info') {
        const t = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        logs.unshift({ t, module, msg, type });
        if (logs.length > 100) logs.pop();
        updateConsole();
    }

    function updateConsole() {
        const container = document.getElementById('console-logs');
        if (!container) return;
        if (logs.length === 0) {
            container.innerHTML = '<div class="logs-empty">Aucune activite</div>';
            return;
        }
        container.innerHTML = logs.slice(0, 50).map(l => {
            const moduleClass = l.module.toLowerCase();
            return `<div class="log-entry ${l.type} ${moduleClass}"><span class="log-time">${l.t}</span><span class="log-module">[${l.module}]</span><span class="log-message">${l.msg}</span></div>`;
        }).join('');
    }

    function createUI() {
        const btn = document.createElement('div');
        btn.className = 'ultimate-bot-btn';
        btn.id = 'ultimate-bot-btn';
        btn.innerHTML = 'Ultimate<br>Bot';
        btn.onclick = () => togglePanel();
        document.body.appendChild(btn);

        const panel = document.createElement('div');
        panel.className = 'ultimate-panel';
        panel.id = 'ultimate-panel';
        
        const tabsHtml = TABS_CONFIG.map(tab => 
            `<button class="ultimate-tab${tab.id === 'farm' ? ' active' : ''}${tab.disabled ? ' disabled' : ''}" data-tab="${tab.id}">
                <span class="tab-icon">${tab.icon}</span>${tab.name}
            </button>`
        ).join('');

        const contentsHtml = TABS_CONFIG.map(tab => 
            `<div class="tab-content${tab.id === 'farm' ? ' active' : ''}" id="tab-${tab.id}">
                <div class="gu-loading"><div class="gu-loading-spinner">⏳</div>Chargement...</div>
            </div>`
        ).join('');

        panel.innerHTML = `
            <div class="ultimate-header">
                <div class="ultimate-title"><span>Ultimate Bot</span><span class="ultimate-version">V2.1.0</span></div>
                <button class="ultimate-close" id="ultimate-close">X</button>
            </div>
            <div class="ultimate-tabs">${tabsHtml}</div>
            <div class="ultimate-main">
                <div class="ultimate-body">${contentsHtml}</div>
                <div class="ultimate-console">
                    <div class="console-header"><span>📜</span> Console</div>
                    <div class="console-content" id="console-logs"><div class="logs-empty">Aucune activite</div></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('ultimate-close').onclick = () => togglePanel();
        
        document.querySelectorAll('.ultimate-tab:not(.disabled)').forEach(tab => {
            tab.onclick = () => {
                const tabId = tab.dataset.tab;
                document.querySelectorAll('.ultimate-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
                currentTab = tabId;
                loadTab(TABS_CONFIG.find(t => t.id === tabId));
            };
        });

        loadTab(TABS_CONFIG[0]);
        log('SYSTEM', 'Interface chargee', 'success');
    }

    function togglePanel() {
        panelOpen = !panelOpen;
        document.getElementById('ultimate-panel').classList.toggle('open', panelOpen);
    }

    function loadTab(tab) {
        if (!tab || tab.disabled) return;
        
        const content = document.getElementById(`tab-${tab.id}`);
        if (!content) return;

        if (loadedTabs[tab.id]) {
            if (loadedTabs[tab.id].onActivate) {
                loadedTabs[tab.id].onActivate(content);
            }
            return;
        }

        content.innerHTML = '<div class="gu-loading"><div class="gu-loading-spinner">⏳</div>Chargement...</div>';

        const scriptUrl = `${BASE_URL}/${tab.script}?v=${Date.now()}`;

        GM_xmlhttpRequest({
            method: 'GET',
            url: scriptUrl,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const tabModule = {
                            uw: uw,
                            log: log,
                            getPlayerName: getPlayerName,
                            getWorldName: getWorldName,
                            GM_getValue: GM_getValue,
                            GM_setValue: GM_setValue,
                            GM_addStyle: GM_addStyle,
                            GM_xmlhttpRequest: GM_xmlhttpRequest
                        };
                        
                        const executeTab = new Function(
                            'module',
                            response.responseText
                        );
                        executeTab(tabModule);
                        
                        loadedTabs[tab.id] = tabModule;
                        
                        if (currentTab === tab.id && tabModule.render) {
                            content.innerHTML = '';
                            tabModule.render(content);
                            if (tabModule.init) {
                                tabModule.init();
                            }
                        }
                        log('SYSTEM', `Onglet "${tab.name}" charge`, 'success');
                    } catch (e) {
                        content.innerHTML = `<div class="gu-loading">Erreur: ${e.message}</div>`;
                        log('SYSTEM', `Erreur onglet "${tab.name}": ${e.message}`, 'error');
                        console.error(`[GU] Erreur onglet "${tab.name}":`, e);
                    }
                } else {
                    content.innerHTML = `<div class="coming-soon-container"><div class="coming-soon-icon">🚧</div><div class="coming-soon-title">${tab.name}</div><div class="coming-soon-text">Module non disponible</div></div>`;
                }
            },
            onerror: function() {
                content.innerHTML = `<div class="coming-soon-container"><div class="coming-soon-icon">🚧</div><div class="coming-soon-title">${tab.name}</div><div class="coming-soon-text">Erreur de connexion</div></div>`;
                log('SYSTEM', `Erreur reseau: ${tab.name}`, 'error');
            }
        });
    }

    window.GrepolisUltimate = {
        loadedTabs,
        log,
        uw,
        reloadTab: function(tabId) {
            delete loadedTabs[tabId];
            const tab = TABS_CONFIG.find(t => t.id === tabId);
            if (tab) loadTab(tab);
        },
        getTabModule: function(tabId) {
            return loadedTabs[tabId];
        },
        updateButtonState: function() {
            const btn = document.getElementById('ultimate-bot-btn');
            let hasActive = false;
            for (const tabId in loadedTabs) {
                if (loadedTabs[tabId].isActive && loadedTabs[tabId].isActive()) {
                    hasActive = true;
                    break;
                }
            }
            if (hasActive) btn.classList.add('has-active');
            else btn.classList.remove('has-active');
        }
    };

    const initCheck = setInterval(() => {
        if (typeof uw.Game !== 'undefined' && uw.ITowns && uw.ITowns.getCurrentTown()) {
            clearInterval(initCheck);
            createUI();
        }
    }, 1000);

    console.log('%c[Grepolis Ultimate]%c Main.js charge', 'color: #4caf50; font-weight: bold;', 'color: inherit;');
})();
