const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

let recruitData = {
    enabled: false,
    settings: { checkInterval: 5, recruitMode: 'queue', webhook: '' },
    stats: { totalRecruited: 0, recruitCycles: 0 },
    queues: {},
    plans: [],
    nextCheckTime: 0
};

const excludedUnits = ['militia'];
const researchRequirements = { 'slinger': 'slinger', 'archer': 'archer', 'hoplite': 'hoplite', 'rider': 'rider', 'chariot': 'chariot', 'catapult': 'catapult' };
const baseUnits = ['sword'];
const divineUnits = { 'godsent': null, 'minotaur': 'zeus', 'manticore': 'zeus', 'griffin': 'zeus', 'zyklop': 'poseidon', 'sea_monster': 'poseidon', 'siren': 'poseidon', 'harpy': 'hera', 'fury': 'hera', 'ladon': 'hera', 'medusa': 'athena', 'centaur': 'athena', 'pegasus': 'athena', 'cerberus': 'hades', 'calydonian_boar': 'artemis', 'satyr': 'aphrodite', 'spartoi': 'ares' };

function getCurrentCityId() { try { return uw.ITowns.getCurrentTown().id; } catch(e) { return null; } }
function getCurrentTown() { try { return uw.MM.getModels().Town[getCurrentCityId()]; } catch(e) { return null; } }
function getCurrentTownName() { try { return uw.ITowns.getCurrentTown().getName(); } catch(e) { return 'Ville inconnue'; } }
function getResources() { try { const town = getCurrentTown(); return town?.attributes?.resources || { wood: 0, stone: 0, iron: 0 }; } catch(e) { return { wood: 0, stone: 0, iron: 0 }; } }
function getCurrentGod() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.god ? ct.god() : getCurrentTown()?.attributes?.god || null; } catch(e) { return null; } }
function getResearches() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.researches ? ct.researches()?.attributes || {} : {}; } catch(e) { return {}; } }
function hasResearch(id) { if (!id) return true; const r = getResearches(); return r[id] === true || r[id] === 1; }

function isUnitAvailable(unitId) {
    try {
        const unitData = uw.GameData.units[unitId];
        if (!unitData || excludedUnits.includes(unitId) || unitData.is_naval) return false;
        if (baseUnits.includes(unitId)) return true;
        if (divineUnits.hasOwnProperty(unitId)) {
            const reqGod = divineUnits[unitId];
            return reqGod === null ? getCurrentGod() !== null : getCurrentGod() === reqGod;
        }
        if (researchRequirements[unitId]) return hasResearch(researchRequirements[unitId]);
        if (unitData.god_id) return getCurrentGod() === unitData.god_id;
        return true;
    } catch(e) { return false; }
}

function getAvailableUnits() {
    const units = [];
    try {
        for (let id in uw.GameData.units) {
            if (isUnitAvailable(id)) {
                units.push({ id, name: uw.GameData.units[id].name, resources: uw.GameData.units[id].resources });
            }
        }
    } catch(e) {}
    return units;
}

module.render = function(container) {
    container.innerHTML = `
        <div class="main-control inactive" id="recruit-control">
            <div class="control-info">
                <div class="control-label">Auto Recruit</div>
                <div class="control-status" id="recruit-status">En attente</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-recruit">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(212,175,55,0.3);border-radius:6px;padding:12px;margin-bottom:15px;display:flex;align-items:center;gap:12px;">
            <span style="font-size:22px;">🏛️</span>
            <span id="recruit-city-name" style="font-family:Cinzel,serif;font-size:15px;color:#F5DEB3;">${getCurrentTownName()}</span>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⏱️</span> Prochain Recrutement</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="timer-container">
                    <div class="timer-label">Temps restant</div>
                    <div class="timer-value" id="recruit-timer">--:--</div>
                </div>
                <button class="btn btn-success" style="width:100%;margin-top:12px;" id="recruit-now">Recruter maintenant</button>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>🗡️</span> Unites Disponibles</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="recruit-units-grid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;"></div>
                <button class="btn" style="width:100%;margin-top:12px;" id="recruit-add-queue">Ajouter a la file</button>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📋</span> File d'attente</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="recruit-queue" style="min-height:60px;max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;">
                    <div style="text-align:center;color:#8B8B83;font-style:italic;padding:15px;">File vide</div>
                </div>
                <button class="btn btn-danger" style="margin-top:12px;" id="recruit-clear-queue">Vider la file</button>
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
                        <span class="option-label">Intervalle (min)</span>
                        <select class="option-select" id="recruit-interval">
                            <option value="1">1 min</option>
                            <option value="2">2 min</option>
                            <option value="5">5 min</option>
                            <option value="10">10 min</option>
                        </select>
                    </div>
                    <div class="option-group">
                        <span class="option-label">Mode</span>
                        <select class="option-select" id="recruit-mode">
                            <option value="queue">File d'attente</option>
                            <option value="loop">Boucle infinie</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📊</span> Statistiques</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="stats-grid">
                    <div class="stat-box">
                        <span class="stat-value" id="recruit-stat-total">0</span>
                        <span class="stat-label">Recrutes</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="recruit-stat-cycles">0</span>
                        <span class="stat-label">Cycles</span>
                    </div>
                </div>
            </div>
        </div>
    `;
};

module.init = function() {
    loadData();
    
    document.getElementById('toggle-recruit').checked = recruitData.enabled;
    document.getElementById('recruit-interval').value = recruitData.settings.checkInterval;
    document.getElementById('recruit-mode').value = recruitData.settings.recruitMode;
    updateStats();
    updateUnitsGrid();
    updateQueueDisplay();
    
    document.getElementById('toggle-recruit').onchange = (e) => toggleRecruit(e.target.checked);
    document.getElementById('recruit-interval').onchange = (e) => {
        recruitData.settings.checkInterval = parseInt(e.target.value);
        recruitData.nextCheckTime = Date.now() + recruitData.settings.checkInterval * 60000;
        saveData();
        log('RECRUIT', 'Intervalle: ' + e.target.value + ' min', 'info');
    };
    document.getElementById('recruit-mode').onchange = (e) => {
        recruitData.settings.recruitMode = e.target.value;
        saveData();
        log('RECRUIT', 'Mode: ' + (e.target.value === 'loop' ? 'Boucle' : 'File'), 'info');
    };
    document.getElementById('recruit-now').onclick = () => runRecruitCycle();
    document.getElementById('recruit-add-queue').onclick = () => addToQueue();
    document.getElementById('recruit-clear-queue').onclick = () => clearQueue();

    document.querySelectorAll('#tab-recruit .section-header').forEach(h => {
        h.onclick = () => {
            h.classList.toggle('collapsed');
            const c = h.nextElementSibling;
            if (c) c.style.display = h.classList.contains('collapsed') ? 'none' : 'block';
        };
    });

    if (recruitData.enabled) {
        toggleRecruit(true);
    }

    setupTownChangeObserver();
    startTimer();
    log('RECRUIT', 'Module initialise', 'info');
};

module.isActive = function() {
    return recruitData.enabled;
};

module.onActivate = function(container) {
    updateUnitsGrid();
    updateQueueDisplay();
    updateStats();
    const nameEl = document.getElementById('recruit-city-name');
    if (nameEl) nameEl.textContent = getCurrentTownName();
};

function toggleRecruit(enabled) {
    recruitData.enabled = enabled;
    const ctrl = document.getElementById('recruit-control');
    const status = document.getElementById('recruit-status');
    
    if (enabled) {
        ctrl.classList.remove('inactive');
        status.textContent = 'Actif';
        log('RECRUIT', 'Bot demarre', 'success');
        recruitData.nextCheckTime = Date.now() + recruitData.settings.checkInterval * 60000;
    } else {
        ctrl.classList.add('inactive');
        status.textContent = 'En attente';
        log('RECRUIT', 'Bot arrete', 'info');
    }
    
    saveData();
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function updateUnitsGrid() {
    const grid = document.getElementById('recruit-units-grid');
    if (!grid) return;
    
    const units = getAvailableUnits();
    if (!units.length) {
        grid.innerHTML = '<div style="grid-column:span 5;text-align:center;color:#8B8B83;font-style:italic;padding:20px;">Aucune unite disponible</div>';
        return;
    }
    
    grid.innerHTML = units.map(u => `
        <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(212,175,55,0.3);border-radius:6px;padding:10px;text-align:center;">
            <div class="unit_icon50x50 ${u.id}" style="width:50px;height:50px;margin:0 auto 6px;"></div>
            <div style="font-size:10px;color:#BDB76B;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.name}</div>
            <input type="number" class="recruit-unit-input option-input" data-unit="${u.id}" value="0" min="0" style="width:100%;text-align:center;padding:6px;">
        </div>
    `).join('');
}

function addToQueue() {
    const cityId = getCurrentCityId();
    if (!cityId) return;
    
    if (!recruitData.queues[cityId]) recruitData.queues[cityId] = [];
    let added = 0;
    
    document.querySelectorAll('.recruit-unit-input').forEach(inp => {
        const count = parseInt(inp.value);
        if (count > 0) {
            recruitData.queues[cityId].push({ id: inp.dataset.unit, count });
            log('RECRUIT', `+ ${count}x ${uw.GameData.units[inp.dataset.unit]?.name}`, 'success');
            inp.value = 0;
            added++;
        }
    });
    
    if (added > 0) {
        saveData();
        updateQueueDisplay();
    } else {
        log('RECRUIT', 'Selectionnez des unites', 'warning');
    }
}

function updateQueueDisplay() {
    const cityId = getCurrentCityId();
    const queue = recruitData.queues[cityId] || [];
    const container = document.getElementById('recruit-queue');
    if (!container) return;
    
    if (!queue.length) {
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;font-style:italic;padding:15px;">File vide</div>';
        return;
    }
    
    container.innerHTML = queue.map((item, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);border-left:3px solid #D4AF37;padding:10px 12px;margin-bottom:8px;border-radius:0 4px 4px 0;font-size:13px;color:#F5DEB3;">
            <span>${item.count}x ${uw.GameData.units[item.id]?.name || item.id}</span>
            <span style="color:#E57373;cursor:pointer;font-weight:bold;padding:3px 8px;" data-index="${i}" class="recruit-remove-btn">X</span>
        </div>
    `).join('');
    
    container.querySelectorAll('.recruit-remove-btn').forEach(b => {
        b.onclick = () => {
            recruitData.queues[cityId].splice(parseInt(b.dataset.index), 1);
            saveData();
            updateQueueDisplay();
        };
    });
}

function clearQueue() {
    const cityId = getCurrentCityId();
    if (cityId) {
        recruitData.queues[cityId] = [];
        saveData();
        updateQueueDisplay();
        log('RECRUIT', 'File videe', 'info');
    }
}

function runRecruitCycle() {
    const cityId = getCurrentCityId();
    const cityName = getCurrentTownName();
    
    if (!cityId) {
        log('RECRUIT', 'Ville non trouvee', 'error');
        return;
    }
    
    const queue = recruitData.queues[cityId];
    if (!queue?.length) {
        log('RECRUIT', 'File vide', 'warning');
        return;
    }
    
    const order = queue[0];
    const unitData = uw.GameData.units[order.id];
    
    if (!unitData) {
        queue.shift();
        saveData();
        updateQueueDisplay();
        return;
    }
    
    const cost = unitData.resources;
    const res = getResources();
    
    if (res.wood < cost.wood * order.count || res.stone < cost.stone * order.count || res.iron < cost.iron * order.count) {
        log('RECRUIT', 'Ressources insuffisantes pour ' + unitData.name, 'warning');
        return;
    }
    
    const csrfToken = uw.Game.csrfToken;
    
    uw.$.ajax({
        type: 'POST',
        url: `/game/building_barracks?town_id=${cityId}&action=build&h=${csrfToken}`,
        data: { json: JSON.stringify({ unit_id: order.id, amount: order.count, town_id: cityId, nl_init: true }) },
        dataType: 'json',
        success: function(response) {
            if (response?.json?.error) {
                log('RECRUIT', 'Erreur: ' + response.json.error, 'error');
                return;
            }
            
            log('RECRUIT', `${order.count}x ${unitData.name} recrutes`, 'success');
            recruitData.stats.totalRecruited += order.count;
            recruitData.stats.recruitCycles++;
            updateStats();
            
            if (recruitData.settings.recruitMode === 'loop') {
                queue.push(queue.shift());
            } else {
                queue.shift();
            }
            
            saveData();
            updateQueueDisplay();
        },
        error: function() {
            log('RECRUIT', 'Erreur AJAX', 'error');
        }
    });
}

function setupTownChangeObserver() {
    if (uw.$?.Observer && uw.GameEvents) {
        uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(() => {
            setTimeout(() => {
                const nameEl = document.getElementById('recruit-city-name');
                if (nameEl) nameEl.textContent = getCurrentTownName();
                updateUnitsGrid();
                updateQueueDisplay();
            }, 500);
        });
    }
}

function startTimer() {
    setInterval(() => {
        const el = document.getElementById('recruit-timer');
        if (!el) return;
        
        if (!recruitData.enabled) {
            el.textContent = '--:--';
            el.classList.remove('ready');
            return;
        }
        
        const diff = recruitData.nextCheckTime - Date.now();
        if (diff <= 0) {
            runRecruitCycle();
            recruitData.nextCheckTime = Date.now() + recruitData.settings.checkInterval * 60000;
        }
        
        el.classList.remove('ready');
        const m = Math.max(0, Math.floor(diff / 60000)).toString().padStart(2, '0');
        const s = Math.max(0, Math.floor((diff % 60000) / 1000)).toString().padStart(2, '0');
        el.textContent = `${m}:${s}`;
    }, 1000);
}

function updateStats() {
    const t = document.getElementById('recruit-stat-total');
    const c = document.getElementById('recruit-stat-cycles');
    if (t) t.textContent = recruitData.stats.totalRecruited;
    if (c) c.textContent = recruitData.stats.recruitCycles;
}

function saveData() {
    GM_setValue('gu_recruit_data', JSON.stringify({
        enabled: recruitData.enabled,
        settings: recruitData.settings,
        stats: recruitData.stats,
        queues: recruitData.queues,
        plans: recruitData.plans
    }));
}

function loadData() {
    const saved = GM_getValue('gu_recruit_data');
    if (saved) {
        try {
            const d = JSON.parse(saved);
            recruitData = { ...recruitData, ...d };
        } catch(e) {}
    }
}
