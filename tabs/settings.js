const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

const STORAGE_KEY = 'gu_settings_data';

let settingsData = {
    discord: {
        webhookFarm: '',
        webhookBuild: '',
        webhookRecruit: '',
        webhookCalage: '',
        webhookGlobal: '',
        notifyOnSuccess: true,
        notifyOnError: true
    },
    general: {
        autoStart: false,
        soundEnabled: false,
        compactMode: false
    }
};

module.render = function(container) {
    container.innerHTML = `
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>🔔</span> Webhooks Discord</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <p style="font-size: 11px; color: #BDB76B; margin-bottom: 15px;">
                    Configurez les webhooks Discord pour recevoir des notifications. 
                    Le webhook global est utilise si aucun webhook specifique n'est defini.
                </p>
                
                <div class="settings-group">
                    <div class="option-group" style="margin-bottom: 12px;">
                        <span class="option-label">Webhook Global</span>
                        <input type="text" class="option-input" id="settings-webhook-global" 
                            placeholder="https://discord.com/api/webhooks/...">
                    </div>
                </div>

                <div style="border-top: 1px solid rgba(212,175,55,0.2); padding-top: 12px; margin-top: 12px;">
                    <span class="option-label" style="display: block; margin-bottom: 10px;">Webhooks par module (optionnel)</span>
                    
                    <div class="options-grid">
                        <div class="option-group">
                            <span class="option-label">Farm</span>
                            <input type="text" class="option-input" id="settings-webhook-farm" placeholder="Webhook Farm">
                        </div>
                        <div class="option-group">
                            <span class="option-label">Build</span>
                            <input type="text" class="option-input" id="settings-webhook-build" placeholder="Webhook Build">
                        </div>
                        <div class="option-group">
                            <span class="option-label">Recruit</span>
                            <input type="text" class="option-input" id="settings-webhook-recruit" placeholder="Webhook Recruit">
                        </div>
                        <div class="option-group">
                            <span class="option-label">Calage</span>
                            <input type="text" class="option-input" id="settings-webhook-calage" placeholder="Webhook Calage">
                        </div>
                    </div>
                </div>

                <div style="margin-top: 15px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #BDB76B; font-size: 12px; margin-bottom: 8px;">
                        <input type="checkbox" id="settings-notify-success"> Notifier les succes
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #BDB76B; font-size: 12px;">
                        <input type="checkbox" id="settings-notify-error"> Notifier les erreurs
                    </label>
                </div>

                <button class="btn btn-discord" id="settings-test-webhook" style="margin-top: 15px;">
                    Tester le Webhook Global
                </button>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⚙️</span> Options Generales</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #BDB76B; font-size: 12px; margin-bottom: 10px;">
                    <input type="checkbox" id="settings-auto-start"> Demarrer automatiquement les bots actifs
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #BDB76B; font-size: 12px; margin-bottom: 10px;">
                    <input type="checkbox" id="settings-sound"> Activer les sons de notification
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #BDB76B; font-size: 12px;">
                    <input type="checkbox" id="settings-compact"> Mode compact (UI reduite)
                </label>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>💾</span> Donnees</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="stat-value" id="settings-stat-farm">0</span>
                        <span class="stat-label">Recoltes Farm</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="settings-stat-build">0</span>
                        <span class="stat-label">Constructions</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="settings-stat-recruit">0</span>
                        <span class="stat-label">Recrutements</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="settings-stat-calage">0</span>
                        <span class="stat-label">Attaques Calees</span>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 15px;">
                    <button class="btn btn-full" id="settings-export">Exporter Config</button>
                    <button class="btn btn-full" id="settings-import">Importer Config</button>
                </div>
                
                <button class="btn btn-danger btn-full" id="settings-reset" style="margin-top: 10px;">
                    Reinitialiser toutes les donnees
                </button>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>ℹ️</span> Informations</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div style="font-size: 12px; color: #BDB76B; line-height: 1.6;">
                    <p><strong style="color: #F5DEB3;">Grepolis Ultimate Bot</strong></p>
                    <p>Version: 2.1.0</p>
                    <p>Joueur: <span id="settings-player-name">-</span></p>
                    <p>Monde: <span id="settings-world-name">-</span></p>
                    <p style="margin-top: 10px; font-size: 11px; color: #8B8B83;">
                        Developpe par Anphidet<br>
                        Usage personnel uniquement
                    </p>
                </div>
            </div>
        </div>

        <input type="file" id="settings-import-file" style="display: none;" accept=".json">
    `;
};

module.init = function() {
    loadData();
    populateFields();
    updateStats();

    document.getElementById('settings-webhook-global').oninput = saveWebhooks;
    document.getElementById('settings-webhook-farm').oninput = saveWebhooks;
    document.getElementById('settings-webhook-build').oninput = saveWebhooks;
    document.getElementById('settings-webhook-recruit').oninput = saveWebhooks;
    document.getElementById('settings-webhook-calage').oninput = saveWebhooks;
    document.getElementById('settings-notify-success').onchange = saveWebhooks;
    document.getElementById('settings-notify-error').onchange = saveWebhooks;

    document.getElementById('settings-auto-start').onchange = saveGeneral;
    document.getElementById('settings-sound').onchange = saveGeneral;
    document.getElementById('settings-compact').onchange = saveGeneral;

    document.getElementById('settings-test-webhook').onclick = testWebhook;
    document.getElementById('settings-export').onclick = exportConfig;
    document.getElementById('settings-import').onclick = () => document.getElementById('settings-import-file').click();
    document.getElementById('settings-import-file').onchange = importConfig;
    document.getElementById('settings-reset').onclick = resetAllData;

    document.querySelectorAll('#tab-settings .section-header').forEach(h => {
        h.onclick = () => {
            h.classList.toggle('collapsed');
            const c = h.nextElementSibling;
            if (c) c.style.display = h.classList.contains('collapsed') ? 'none' : 'block';
        };
    });

    const playerName = document.getElementById('settings-player-name');
    const worldName = document.getElementById('settings-world-name');
    if (playerName) playerName.textContent = module.getPlayerName();
    if (worldName) worldName.textContent = module.getWorldName();

    log('SETTINGS', 'Module initialise', 'info');
};

module.isActive = function() {
    return false;
};

module.onActivate = function(container) {
    updateStats();
};

function populateFields() {
    document.getElementById('settings-webhook-global').value = settingsData.discord.webhookGlobal || '';
    document.getElementById('settings-webhook-farm').value = settingsData.discord.webhookFarm || '';
    document.getElementById('settings-webhook-build').value = settingsData.discord.webhookBuild || '';
    document.getElementById('settings-webhook-recruit').value = settingsData.discord.webhookRecruit || '';
    document.getElementById('settings-webhook-calage').value = settingsData.discord.webhookCalage || '';
    document.getElementById('settings-notify-success').checked = settingsData.discord.notifyOnSuccess;
    document.getElementById('settings-notify-error').checked = settingsData.discord.notifyOnError;

    document.getElementById('settings-auto-start').checked = settingsData.general.autoStart;
    document.getElementById('settings-sound').checked = settingsData.general.soundEnabled;
    document.getElementById('settings-compact').checked = settingsData.general.compactMode;
}

function saveWebhooks() {
    settingsData.discord.webhookGlobal = document.getElementById('settings-webhook-global').value.trim();
    settingsData.discord.webhookFarm = document.getElementById('settings-webhook-farm').value.trim();
    settingsData.discord.webhookBuild = document.getElementById('settings-webhook-build').value.trim();
    settingsData.discord.webhookRecruit = document.getElementById('settings-webhook-recruit').value.trim();
    settingsData.discord.webhookCalage = document.getElementById('settings-webhook-calage').value.trim();
    settingsData.discord.notifyOnSuccess = document.getElementById('settings-notify-success').checked;
    settingsData.discord.notifyOnError = document.getElementById('settings-notify-error').checked;
    
    saveData();
    updateModuleWebhooks();
}

function saveGeneral() {
    settingsData.general.autoStart = document.getElementById('settings-auto-start').checked;
    settingsData.general.soundEnabled = document.getElementById('settings-sound').checked;
    settingsData.general.compactMode = document.getElementById('settings-compact').checked;
    
    saveData();
}

function updateModuleWebhooks() {
    const GU = window.GrepolisUltimate;
    if (!GU || !GU.loadedTabs) return;

    const farmModule = GU.getTabModule('farm');
    if (farmModule && farmModule.farmData) {
        farmModule.farmData.settings.webhook = settingsData.discord.webhookFarm || settingsData.discord.webhookGlobal;
    }

    const buildModule = GU.getTabModule('build');
    if (buildModule && buildModule.buildData) {
        buildModule.buildData.settings.webhook = settingsData.discord.webhookBuild || settingsData.discord.webhookGlobal;
    }

    const recruitModule = GU.getTabModule('recruit');
    if (recruitModule && recruitModule.recruitData) {
        recruitModule.recruitData.settings.webhook = settingsData.discord.webhookRecruit || settingsData.discord.webhookGlobal;
    }

    const calageModule = GU.getTabModule('calage');
    if (calageModule && calageModule.calageData) {
        calageModule.calageData.settings.webhook = settingsData.discord.webhookCalage || settingsData.discord.webhookGlobal;
    }
}

function testWebhook() {
    const webhookUrl = settingsData.discord.webhookGlobal;
    
    if (!webhookUrl) {
        log('SETTINGS', 'Aucun webhook global configure', 'error');
        return;
    }

    log('SETTINGS', 'Test webhook en cours...', 'info');

    GM_xmlhttpRequest({
        method: 'POST',
        url: webhookUrl,
        data: JSON.stringify({
            embeds: [{
                title: 'Test Webhook Reussi!',
                description: 'Votre webhook Discord est correctement configure.',
                color: 3066993,
                fields: [
                    { name: 'Joueur', value: module.getPlayerName(), inline: true },
                    { name: 'Monde', value: module.getWorldName(), inline: true }
                ],
                footer: { text: 'Grepolis Ultimate Bot' },
                timestamp: new Date().toISOString()
            }]
        }),
        headers: { 'Content-Type': 'application/json' },
        onload: function(response) {
            if (response.status >= 200 && response.status < 300) {
                log('SETTINGS', 'Webhook test OK!', 'success');
            } else {
                log('SETTINGS', 'Erreur webhook: ' + response.status, 'error');
            }
        },
        onerror: function() {
            log('SETTINGS', 'Erreur connexion webhook', 'error');
        }
    });
}

function updateStats() {
    try {
        const farmData = GM_getValue('gu_farm_data');
        if (farmData) {
            const fd = JSON.parse(farmData);
            document.getElementById('settings-stat-farm').textContent = fd.stats?.cycles || 0;
        }
    } catch(e) {}

    try {
        const buildData = GM_getValue('gu_build_data');
        if (buildData) {
            const bd = JSON.parse(buildData);
            document.getElementById('settings-stat-build').textContent = bd.stats?.built || 0;
        }
    } catch(e) {}

    try {
        const recruitData = GM_getValue('gu_recruit_data');
        if (recruitData) {
            const rd = JSON.parse(recruitData);
            document.getElementById('settings-stat-recruit').textContent = rd.stats?.totalRecruited || 0;
        }
    } catch(e) {}

    try {
        const calageData = GM_getValue('gu_calage_data');
        if (calageData) {
            const cd = JSON.parse(calageData);
            const successes = cd.attaques?.filter(a => a.status === 'succes').length || 0;
            document.getElementById('settings-stat-calage').textContent = successes;
        }
    } catch(e) {}
}

function exportConfig() {
    const exportData = {
        version: '2.1.0',
        exportDate: new Date().toISOString(),
        settings: settingsData,
        farmData: GM_getValue('gu_farm_data'),
        buildData: GM_getValue('gu_build_data'),
        recruitData: GM_getValue('gu_recruit_data'),
        calageData: GM_getValue('gu_calage_data')
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grepolis-ultimate-config-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);

    log('SETTINGS', 'Configuration exportee', 'success');
}

function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            if (importData.settings) {
                settingsData = { ...settingsData, ...importData.settings };
                saveData();
                populateFields();
            }
            
            if (importData.farmData) {
                GM_setValue('gu_farm_data', importData.farmData);
            }
            if (importData.buildData) {
                GM_setValue('gu_build_data', importData.buildData);
            }
            if (importData.recruitData) {
                GM_setValue('gu_recruit_data', importData.recruitData);
            }
            if (importData.calageData) {
                GM_setValue('gu_calage_data', importData.calageData);
            }

            updateStats();
            log('SETTINGS', 'Configuration importee avec succes', 'success');
        } catch(err) {
            log('SETTINGS', 'Erreur import: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function resetAllData() {
    log('SETTINGS', 'Reinitialisation des donnees...', 'warning');
    
    GM_setValue('gu_farm_data', '');
    GM_setValue('gu_build_data', '');
    GM_setValue('gu_recruit_data', '');
    GM_setValue('gu_calage_data', '');
    GM_setValue(STORAGE_KEY, '');

    settingsData = {
        discord: {
            webhookFarm: '',
            webhookBuild: '',
            webhookRecruit: '',
            webhookCalage: '',
            webhookGlobal: '',
            notifyOnSuccess: true,
            notifyOnError: true
        },
        general: {
            autoStart: false,
            soundEnabled: false,
            compactMode: false
        }
    };

    populateFields();
    updateStats();
    log('SETTINGS', 'Toutes les donnees reinitialises', 'success');
}

function saveData() {
    GM_setValue(STORAGE_KEY, JSON.stringify(settingsData));
}

function loadData() {
    const saved = GM_getValue(STORAGE_KEY);
    if (saved) {
        try {
            const d = JSON.parse(saved);
            settingsData = { ...settingsData, ...d };
        } catch(e) {}
    }
}

window.GrepolisUltimateSettings = {
    getWebhook: function(module) {
        const specific = settingsData.discord['webhook' + module.charAt(0).toUpperCase() + module.slice(1)];
        return specific || settingsData.discord.webhookGlobal || '';
    },
    shouldNotify: function(type) {
        if (type === 'success') return settingsData.discord.notifyOnSuccess;
        if (type === 'error') return settingsData.discord.notifyOnError;
        return true;
    },
    getSettings: function() {
        return settingsData;
    }
};
