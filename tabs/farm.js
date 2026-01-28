const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

let farmData = {
    enabled: false,
    settings: { mode: 'least_resources', duration: 1, webhook: '' },
    stats: { cycles: 0, totalRes: 0 },
    cycleCount: 0,
    interval: null
};

module.render = function(container) {
    container.innerHTML = `
        <div class="main-control inactive" id="farm-control">
            <div class="control-info">
                <div class="control-label">Auto Farm</div>
                <div class="control-status" id="farm-status">En attente</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-farm">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📊</span> Statistiques</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="stat-value" id="farm-stat-cycles">0</span>
                        <span class="stat-label">Passages</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="farm-stat-res">0</span>
                        <span class="stat-label">Ressources</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⏱️</span> Prochaine Recolte</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="timer-container">
                    <div class="timer-label">Temps restant</div>
                    <div class="timer-value" id="farm-timer">--:--</div>
                </div>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⚙️</span> Options</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="options-grid">
                    <div class="option-group">
                        <span class="option-label">Mode de tri</span>
                        <select class="option-select" id="farm-mode">
                            <option value="least_resources">Villes vides</option>
                            <option value="round_robin">Cyclique</option>
                        </select>
                    </div>
                    <div class="option-group">
                        <span class="option-label">Duree</span>
                        <select class="option-select" id="farm-duration">
                            <option value="1">5 minutes</option>
                            <option value="2">20 minutes</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
};

module.init = function() {
    loadData();
    
    document.getElementById('toggle-farm').checked = farmData.enabled;
    document.getElementById('farm-mode').value = farmData.settings.mode;
    document.getElementById('farm-duration').value = farmData.settings.duration;
    updateStats();
    
    document.getElementById('toggle-farm').onchange = (e) => toggleFarm(e.target.checked);
    document.getElementById('farm-mode').onchange = (e) => {
        farmData.settings.mode = e.target.value;
        saveData();
        log('FARM', 'Mode: ' + (e.target.value === 'least_resources' ? 'Villes vides' : 'Cyclique'), 'info');
    };
    document.getElementById('farm-duration').onchange = (e) => {
        farmData.settings.duration = parseInt(e.target.value);
        saveData();
        log('FARM', 'Duree: ' + (e.target.value === '1' ? '5 min' : '20 min'), 'info');
    };

    document.querySelectorAll('#tab-farm .section-header').forEach(h => {
        h.onclick = () => {
            h.classList.toggle('collapsed');
            const c = h.nextElementSibling;
            if (c) c.style.display = h.classList.contains('collapsed') ? 'none' : 'block';
        };
    });

    if (farmData.enabled) {
        toggleFarm(true);
    }

    startTimer();
    log('FARM', 'Module initialise', 'info');
};

module.isActive = function() {
    return farmData.enabled;
};

module.onActivate = function(container) {
    updateStats();
};

function toggleFarm(enabled) {
    farmData.enabled = enabled;
    const ctrl = document.getElementById('farm-control');
    const status = document.getElementById('farm-status');
    
    if (enabled) {
        ctrl.classList.remove('inactive');
        status.textContent = 'Actif';
        log('FARM', 'Bot demarre', 'success');
        runFarmCycle();
    } else {
        ctrl.classList.add('inactive');
        status.textContent = 'En attente';
        log('FARM', 'Bot arrete', 'info');
        clearTimeout(farmData.interval);
    }
    
    saveData();
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

async function runFarmCycle() {
    if (!farmData.enabled) return;
    
    const waitTime = getNextFarmCollection();
    if (waitTime > 0) {
        farmData.interval = setTimeout(() => runFarmCycle(), waitTime + 3000);
    } else {
        await executeFarmClaim();
        farmData.interval = setTimeout(() => runFarmCycle(), 10000);
    }
}

async function executeFarmClaim() {
    try {
        let list = getPolisList();
        if (list.length === 0) {
            log('FARM', 'Aucune ville disponible', 'error');
            return;
        }
        
        if (farmData.settings.mode === 'round_robin') {
            const offset = farmData.cycleCount % list.length;
            list = list.concat(list.splice(0, offset));
            farmData.cycleCount++;
        }
        
        const ids = list.map(p => p.id);
        
        await new Promise(r => uw.gpAjax.ajaxGet('farm_town_overviews', 'index', {}, false, () => r()));
        await new Promise(r => setTimeout(r, 1000));
        
        uw.gpAjax.ajaxPost('farm_town_overviews', 'claim_loads_multiple', {
            towns: ids,
            time_option_base: 300,
            time_option_booty: 600,
            claim_factor: 'normal'
        }, false, () => {
            const gain = ids.length * (farmData.settings.duration === 1 ? 115 : 350);
            farmData.stats.cycles++;
            farmData.stats.totalRes += gain;
            
            log('FARM', `Recolte: ${list.length} villes, +${gain} res`, 'success');
            updateStats();
            saveData();
            
            sendWebhook('Recolte Auto Farm', `${list.length} villes recoltees\nGain: +${gain.toLocaleString()} ressources`);
        });
    } catch(e) {
        log('FARM', 'Erreur: ' + e.message, 'error');
    }
}

function getPolisList() {
    const towns = uw.MM.getOnlyCollectionByName('Town').models;
    const islandMap = new Map();
    
    for (const t of towns) {
        if (t.attributes.on_small_island) continue;
        const islandId = t.attributes.island_id;
        const res = t.attributes.resources;
        const totalRes = (res.wood || 0) + (res.stone || 0) + (res.iron || 0);
        const townData = { id: t.attributes.id, name: t.attributes.name, total: totalRes, islandId };
        
        if (islandMap.has(islandId)) {
            if (farmData.settings.mode === 'least_resources' && townData.total < islandMap.get(islandId).total) {
                islandMap.set(islandId, townData);
            }
        } else {
            islandMap.set(islandId, townData);
        }
    }
    
    return Array.from(islandMap.values());
}

function getNextFarmCollection() {
    const models = uw.MM.getCollections()?.FarmTownPlayerRelation?.[0]?.models || [];
    let max = 0;
    for (const m of models) {
        if (m.attributes.lootable_at > max) max = m.attributes.lootable_at;
    }
    return Math.max(0, (max * 1000) - Date.now());
}

function startTimer() {
    setInterval(() => {
        const farmTimer = document.getElementById('farm-timer');
        if (!farmTimer) return;
        
        if (!farmData.enabled) {
            farmTimer.textContent = '--:--';
            farmTimer.classList.remove('ready');
            return;
        }
        
        const diff = getNextFarmCollection();
        if (diff <= 0) {
            farmTimer.textContent = 'PRET';
            farmTimer.classList.add('ready');
        } else {
            farmTimer.classList.remove('ready');
            const mins = Math.floor(diff / 60000).toString().padStart(2, '0');
            const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            farmTimer.textContent = `${mins}:${secs}`;
        }
    }, 1000);
}

function updateStats() {
    const c = document.getElementById('farm-stat-cycles');
    const r = document.getElementById('farm-stat-res');
    if (c) c.textContent = farmData.stats.cycles;
    if (r) r.textContent = farmData.stats.totalRes.toLocaleString();
}

function sendWebhook(title, desc) {
    if (!farmData.settings.webhook) return;
    GM_xmlhttpRequest({
        method: "POST",
        url: farmData.settings.webhook,
        data: JSON.stringify({
            embeds: [{
                title: title,
                description: desc,
                color: 3066993,
                footer: { text: "Grepolis Ultimate - Auto Farm" },
                timestamp: new Date().toISOString()
            }]
        }),
        headers: { "Content-Type": "application/json" }
    });
}

function saveData() {
    GM_setValue('gu_farm_data', JSON.stringify({
        enabled: farmData.enabled,
        settings: farmData.settings,
        stats: farmData.stats,
        cycleCount: farmData.cycleCount
    }));
}

function loadData() {
    const saved = GM_getValue('gu_farm_data');
    if (saved) {
        try {
            const d = JSON.parse(saved);
            farmData = { ...farmData, ...d, interval: null };
        } catch(e) {}
    }
}
