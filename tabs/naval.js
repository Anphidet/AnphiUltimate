const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

let navalData = {
    enabled: false,
    settings: { 
        checkInterval: 5, 
        recruitMode: 'queue',
        storageThreshold: 80,
        webhook: '' 
    },
    stats: { totalRecruited: 0, recruitCycles: 0 },
    queues: {},
    targets: {},
    plans: [],
    nextCheckTime: 0
};

const NAVAL_UNITS = ['big_transporter', 'bireme', 'attack_ship', 'demolition_ship', 'small_transporter', 'trireme', 'colonize_ship'];
const MYTHICAL_SHIPS = ['sea_monster'];

const shipResearchRequirements = {
    'bireme': 'bireme',
    'attack_ship': 'attack_ship',
    'demolition_ship': 'demolition_ship',
    'small_transporter': 'small_transporter',
    'big_transporter': 'big_transporter',
    'trireme': 'trireme',
    'colonize_ship': 'colonize_ship'
};

const shipBuildingRequirements = {
    'bireme': 1,
    'attack_ship': 1,
    'demolition_ship': 5,
    'small_transporter': 1,
    'big_transporter': 10,
    'trireme': 15,
    'colonize_ship': 20,
    'sea_monster': 1
};

function getCurrentCityId() { try { return uw.ITowns.getCurrentTown().id; } catch(e) { return null; } }
function getCurrentTown() { try { return uw.MM.getModels().Town[getCurrentCityId()]; } catch(e) { return null; } }
function getCurrentTownName() { try { return uw.ITowns.getCurrentTown().getName(); } catch(e) { return 'Ville inconnue'; } }
function getResources() { try { const town = getCurrentTown(); return town?.attributes?.resources || { wood: 0, stone: 0, iron: 0 }; } catch(e) { return { wood: 0, stone: 0, iron: 0 }; } }
function getStorageCapacity() { try { const town = getCurrentTown(); return town?.attributes?.storage || 8000; } catch(e) { return 8000; } }
function getCurrentGod() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.god ? ct.god() : getCurrentTown()?.attributes?.god || null; } catch(e) { return null; } }
function getResearches() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.researches ? ct.researches()?.attributes || {} : {}; } catch(e) { return {}; } }
function hasResearch(id) { if (!id) return true; const r = getResearches(); return r[id] === true || r[id] === 1; }
function getUnitsInTown() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.units ? ct.units() : {}; } catch(e) { return {}; } }

function getDocksLevel() {
    try {
        const townId = getCurrentCityId();
        if (!townId) return -1;
        
        const ct = uw.ITowns.getCurrentTown();
        if (ct) {
            if (typeof ct.getBuildings === 'function') {
                const b = ct.getBuildings();
                if (b && typeof b.get === 'function') {
                    const docks = b.get('docks');
                    if (typeof docks === 'number') return docks;
                }
                if (b && typeof b.docks === 'number') return b.docks;
            }
            
            if (typeof ct.buildings === 'function') {
                const buildings = ct.buildings();
                if (buildings && typeof buildings.get === 'function') {
                    const docks = buildings.get('docks');
                    if (typeof docks === 'number') return docks;
                }
                if (buildings && typeof buildings.docks === 'number') return buildings.docks;
            }
        }
        
        if (uw.MM && uw.MM.getModels) {
            const models = uw.MM.getModels();
            if (models.Town && models.Town[townId]) {
                const townModel = models.Town[townId];
                if (townModel.attributes && townModel.attributes.buildings) {
                    const b = townModel.attributes.buildings;
                    if (typeof b.docks === 'number') return b.docks;
                }
            }
        }
        
        return -1;
    } catch(e) { 
        return -1; 
    }
}

function hasPort() {
    return getDocksLevel() >= 0;
}

function isShipAvailable(unitId) {
    try {
        const unitData = uw.GameData.units[unitId];
        if (!unitData || !unitData.is_naval) return false;
        
        if (MYTHICAL_SHIPS.includes(unitId)) {
            return getCurrentGod() === 'poseidon';
        }
        
        if (shipResearchRequirements[unitId]) {
            if (!hasResearch(shipResearchRequirements[unitId])) return false;
        }
        
        return true;
    } catch(e) { return false; }
}

function getAllNavalUnits() {
    const ships = [];
    try {
        const allShips = [...NAVAL_UNITS, ...MYTHICAL_SHIPS];
        for (let id of allShips) {
            const unitData = uw.GameData.units[id];
            if (unitData && unitData.is_naval) {
                ships.push({ id, name: unitData.name, resources: unitData.resources });
            }
        }
    } catch(e) {}
    return ships;
}

function getUnitsInQueue() {
    const queued = {};
    try {
        const townId = getCurrentCityId();
        
        if (uw.MM && uw.MM.getModels) {
            const models = uw.MM.getModels();
            
            if (models.UnitOrder) {
                for (let id in models.UnitOrder) {
                    const order = models.UnitOrder[id];
                    const attrs = order.attributes || order;
                    if (attrs.town_id == townId && attrs.kind === 'naval') {
                        const unitId = attrs.unit_type;
                        const count = attrs.units_left || attrs.count || 1;
                        if (unitId) queued[unitId] = (queued[unitId] || 0) + count;
                    }
                }
            }
        }
    } catch(e) {
        log('NAVAL', 'Erreur getUnitsInQueue: ' + e.message, 'warning');
    }
    return queued;
}

function getAvailableShips() {
    const ships = [];
    try {
        for (let id of NAVAL_UNITS) {
            if (isShipAvailable(id)) {
                const unitData = uw.GameData.units[id];
                if (unitData) {
                    ships.push({ id, name: unitData.name, resources: unitData.resources });
                }
            }
        }
        for (let id of MYTHICAL_SHIPS) {
            if (isShipAvailable(id)) {
                const unitData = uw.GameData.units[id];
                if (unitData) {
                    ships.push({ id, name: unitData.name, resources: unitData.resources });
                }
            }
        }
    } catch(e) {}
    return ships;
}

module.render = function(container) {
    container.innerHTML = `
        <div class="main-control inactive" id="naval-control">
            <div class="control-info">
                <div class="control-label">Auto Naval</div>
                <div class="control-status" id="naval-status">En attente</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-naval">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(212,175,55,0.3);border-radius:6px;padding:12px;margin-bottom:15px;display:flex;align-items:center;gap:12px;">
            <span style="font-size:22px;">⚓</span>
            <span id="naval-city-name" style="font-family:Cinzel,serif;font-size:15px;color:#F5DEB3;">${getCurrentTownName()}</span>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⏱️</span> Prochain Recrutement</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="timer-container">
                    <div class="timer-label">Temps restant</div>
                    <div class="timer-value" id="naval-timer">--:--</div>
                </div>
                <button class="btn btn-success" style="width:100%;margin-top:12px;" id="naval-now">Recruter maintenant</button>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⛵</span> Bateaux Disponibles</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="naval-units-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;"></div>
                <button class="btn" style="width:100%;margin-top:12px;" id="naval-add-queue">Ajouter a la file</button>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📋</span> File d'attente</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="naval-queue" style="min-height:60px;max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:12px;">
                    <div style="text-align:center;color:#8B8B83;font-style:italic;padding:15px;">File vide</div>
                </div>
                <button class="btn btn-danger" style="margin-top:12px;" id="naval-clear-queue">Vider la file</button>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>🎯</span> Mode Objectif (Maintien)</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <p style="font-size:11px;color:#BDB76B;margin-bottom:12px;">Definir un objectif de flotte a maintenir. Le bot recrute automatiquement quand le seuil d'entrepot est atteint.</p>
                <div class="options-grid" style="margin-bottom:12px;">
                    <div class="option-group">
                        <span class="option-label">Seuil entrepot</span>
                        <select class="option-select" id="naval-threshold">
                            <option value="25">25%</option>
                            <option value="50">50%</option>
                            <option value="75">75%</option>
                            <option value="80">80%</option>
                            <option value="90">90%</option>
                        </select>
                    </div>
                </div>
                <div id="naval-targets-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;"></div>
                <button class="btn" style="width:100%;" id="naval-save-targets">Sauvegarder objectifs</button>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>💾</span> Plans de flotte</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <input type="text" class="option-input" id="naval-plan-name" placeholder="Nom du plan" style="flex:1;">
                    <button class="btn" id="naval-save-plan">Sauver</button>
                </div>
                <div id="naval-plans-list" style="max-height:120px;overflow-y:auto;margin-bottom:12px;"></div>
                <div style="display:flex;gap:8px;">
                    <button class="btn" style="flex:1;" id="naval-export-plans">Exporter</button>
                    <button class="btn" style="flex:1;" id="naval-import-plans">Importer</button>
                </div>
                <input type="file" id="naval-import-file" style="display:none;" accept=".json">
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
                        <select class="option-select" id="naval-interval">
                            <option value="1">1 min</option>
                            <option value="2">2 min</option>
                            <option value="5">5 min</option>
                            <option value="10">10 min</option>
                        </select>
                    </div>
                    <div class="option-group">
                        <span class="option-label">Mode</span>
                        <select class="option-select" id="naval-mode">
                            <option value="queue">File d'attente</option>
                            <option value="loop">Boucle infinie</option>
                            <option value="target">Objectif (maintien)</option>
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
                        <span class="stat-value" id="naval-stat-total">0</span>
                        <span class="stat-label">Recrutes</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="naval-stat-cycles">0</span>
                        <span class="stat-label">Cycles</span>
                    </div>
                </div>
                <button class="btn" style="width:100%;margin-top:12px;background:linear-gradient(135deg,#6c757d,#495057);" id="naval-debug">Debug Info</button>
            </div>
        </div>
    `;
};

module.init = function() {
    loadData();
    
    document.getElementById('toggle-naval').checked = navalData.enabled;
    document.getElementById('naval-interval').value = navalData.settings.checkInterval;
    document.getElementById('naval-mode').value = navalData.settings.recruitMode;
    document.getElementById('naval-threshold').value = navalData.settings.storageThreshold;
    updateStats();
    updateShipsGrid();
    updateTargetsGrid();
    updateQueueDisplay();
    updatePlansList();
    
    document.getElementById('toggle-naval').onchange = (e) => toggleNaval(e.target.checked);
    document.getElementById('naval-interval').onchange = (e) => {
        navalData.settings.checkInterval = parseInt(e.target.value);
        navalData.nextCheckTime = Date.now() + navalData.settings.checkInterval * 60000;
        saveData();
        log('NAVAL', 'Intervalle: ' + e.target.value + ' min', 'info');
    };
    document.getElementById('naval-mode').onchange = (e) => {
        navalData.settings.recruitMode = e.target.value;
        saveData();
        const modes = { queue: 'File', loop: 'Boucle', target: 'Objectif' };
        log('NAVAL', 'Mode: ' + modes[e.target.value], 'info');
    };
    document.getElementById('naval-threshold').onchange = (e) => {
        navalData.settings.storageThreshold = parseInt(e.target.value);
        saveData();
        log('NAVAL', 'Seuil entrepot: ' + e.target.value + '%', 'info');
    };
    document.getElementById('naval-now').onclick = () => runNavalCycle();
    document.getElementById('naval-add-queue').onclick = () => addToQueue();
    document.getElementById('naval-clear-queue').onclick = () => clearQueue();
    document.getElementById('naval-save-targets').onclick = () => saveTargets();
    document.getElementById('naval-save-plan').onclick = () => savePlan();
    document.getElementById('naval-export-plans').onclick = () => exportPlans();
    document.getElementById('naval-import-plans').onclick = () => document.getElementById('naval-import-file').click();
    document.getElementById('naval-import-file').onchange = (e) => importPlans(e);
    document.getElementById('naval-debug').onclick = () => debugNavalInfo();

    document.querySelectorAll('#tab-naval .section-header').forEach(h => {
        h.onclick = () => {
            h.classList.toggle('collapsed');
            const c = h.nextElementSibling;
            if (c) c.style.display = h.classList.contains('collapsed') ? 'none' : 'block';
        };
    });

    if (navalData.enabled) {
        toggleNaval(true);
    }

    setupTownChangeObserver();
    startTimer();
    log('NAVAL', 'Module initialise', 'info');
};

module.isActive = function() {
    return navalData.enabled;
};

module.onActivate = function(container) {
    setTimeout(function() {
        updateShipsGrid();
        updateTargetsGrid();
        updateQueueDisplay();
        updatePlansList();
        updateStats();
        const nameEl = document.getElementById('naval-city-name');
        if (nameEl) nameEl.textContent = getCurrentTownName();
    }, 100);
};

function toggleNaval(enabled) {
    navalData.enabled = enabled;
    const ctrl = document.getElementById('naval-control');
    const status = document.getElementById('naval-status');
    
    if (enabled) {
        ctrl.classList.remove('inactive');
        status.textContent = 'Actif';
        log('NAVAL', 'Bot demarre', 'success');
        navalData.nextCheckTime = Date.now() + navalData.settings.checkInterval * 60000;
    } else {
        ctrl.classList.add('inactive');
        status.textContent = 'En attente';
        log('NAVAL', 'Bot arrete', 'info');
    }
    
    saveData();
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function updateShipsGrid() {
    const grid = document.getElementById('naval-units-grid');
    if (!grid) return;
    
    const ships = getAllNavalUnits();
    const unitsInTown = getUnitsInTown();
    
    if (!ships.length) {
        grid.innerHTML = '<div style="grid-column:span 4;text-align:center;color:#8B8B83;font-style:italic;padding:20px;">Aucun bateau disponible</div>';
        return;
    }
    
    grid.innerHTML = ships.map(u => {
        const count = unitsInTown[u.id] || 0;
        return `
        <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(212,175,55,0.3);border-radius:6px;padding:8px;text-align:center;">
            <div class="unit_icon50x50 ${u.id}" style="width:50px;height:50px;margin:0 auto 4px;transform:scale(0.8);"></div>
            <div style="font-size:9px;color:#BDB76B;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.name}</div>
            <div style="font-size:11px;color:#4CAF50;margin-bottom:4px;">${count}</div>
            <input type="number" class="naval-unit-input option-input" data-unit="${u.id}" value="0" min="0" style="width:100%;text-align:center;padding:4px;font-size:11px;">
        </div>
    `}).join('');
}

function updateTargetsGrid() {
    const grid = document.getElementById('naval-targets-grid');
    if (!grid) return;
    
    const ships = getAllNavalUnits();
    const cityId = getCurrentCityId();
    const targets = navalData.targets[cityId] || {};
    const unitsInTown = getUnitsInTown();
    const unitsInQueue = getUnitsInQueue();
    
    if (!ships.length) {
        grid.innerHTML = '<div style="grid-column:span 4;text-align:center;color:#8B8B83;font-style:italic;padding:20px;">Aucun bateau disponible</div>';
        return;
    }
    
    grid.innerHTML = ships.map(u => {
        const current = unitsInTown[u.id] || 0;
        const queued = unitsInQueue[u.id] || 0;
        const total = current + queued;
        const target = targets[u.id] || 0;
        const isComplete = total >= target && target > 0;
        const color = target === 0 ? '#8B8B83' : (isComplete ? '#4CAF50' : '#FF9800');
        const queueText = queued > 0 ? ` <span style="color:#64B5F6;">(+${queued})</span>` : '';
        return `
        <div style="background:rgba(0,0,0,0.3);border:1px solid ${isComplete ? 'rgba(76,175,80,0.5)' : 'rgba(212,175,55,0.3)'};border-radius:6px;padding:8px;text-align:center;">
            <div class="unit_icon50x50 ${u.id}" style="width:50px;height:50px;margin:0 auto 4px;transform:scale(0.8);"></div>
            <div style="font-size:9px;color:#BDB76B;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.name}</div>
            <div style="font-size:10px;color:${color};margin-bottom:4px;">${current}${queueText} / <span class="target-display" data-unit="${u.id}">${target}</span></div>
            <input type="number" class="naval-target-input option-input" data-unit="${u.id}" value="${target}" min="0" style="width:100%;text-align:center;padding:4px;font-size:11px;">
        </div>
    `}).join('');
}

function saveTargets() {
    const cityId = getCurrentCityId();
    if (!cityId) return;
    
    navalData.targets[cityId] = {};
    document.querySelectorAll('.naval-target-input').forEach(inp => {
        const count = parseInt(inp.value) || 0;
        if (count > 0) {
            navalData.targets[cityId][inp.dataset.unit] = count;
        }
    });
    
    saveData();
    updateTargetsGrid();
    log('NAVAL', 'Objectifs sauvegardes', 'success');
}

function addToQueue() {
    const cityId = getCurrentCityId();
    if (!cityId) return;
    
    if (!navalData.queues[cityId]) navalData.queues[cityId] = [];
    let added = 0;
    
    document.querySelectorAll('.naval-unit-input').forEach(inp => {
        const count = parseInt(inp.value);
        if (count > 0) {
            navalData.queues[cityId].push({ id: inp.dataset.unit, count });
            log('NAVAL', `+ ${count}x ${uw.GameData.units[inp.dataset.unit]?.name}`, 'success');
            inp.value = 0;
            added++;
        }
    });
    
    if (added > 0) {
        saveData();
        updateQueueDisplay();
    } else {
        log('NAVAL', 'Selectionnez des bateaux', 'warning');
    }
}

function updateQueueDisplay() {
    const cityId = getCurrentCityId();
    const queue = navalData.queues[cityId] || [];
    const container = document.getElementById('naval-queue');
    if (!container) return;
    
    if (!queue.length) {
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;font-style:italic;padding:15px;">File vide</div>';
        return;
    }
    
    container.innerHTML = queue.map((item, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);border-left:3px solid #2196F3;padding:10px 12px;margin-bottom:8px;border-radius:0 4px 4px 0;font-size:13px;color:#F5DEB3;">
            <span>${item.count}x ${uw.GameData.units[item.id]?.name || item.id}</span>
            <span style="color:#E57373;cursor:pointer;font-weight:bold;padding:3px 8px;" data-index="${i}" class="naval-remove-btn">X</span>
        </div>
    `).join('');
    
    container.querySelectorAll('.naval-remove-btn').forEach(b => {
        b.onclick = () => {
            navalData.queues[cityId].splice(parseInt(b.dataset.index), 1);
            saveData();
            updateQueueDisplay();
        };
    });
}

function clearQueue() {
    const cityId = getCurrentCityId();
    if (cityId) {
        navalData.queues[cityId] = [];
        saveData();
        updateQueueDisplay();
        log('NAVAL', 'File videe', 'info');
    }
}

function runNavalCycle() {
    const mode = navalData.settings.recruitMode;
    
    if (mode === 'target') {
        runTargetMode();
    } else {
        runQueueMode();
    }
}

function runTargetMode() {
    const cityId = getCurrentCityId();
    
    if (!cityId) {
        log('NAVAL', 'Ville non trouvee', 'error');
        return;
    }
    
    const targets = navalData.targets[cityId];
    if (!targets || Object.keys(targets).length === 0) {
        log('NAVAL', 'Aucun objectif defini', 'warning');
        return;
    }
    
    const res = getResources();
    const storage = getStorageCapacity();
    const threshold = navalData.settings.storageThreshold / 100;
    const totalRes = res.wood + res.stone + res.iron;
    const fillRate = totalRes / (storage * 3);
    
    if (fillRate < threshold) {
        log('NAVAL', `Entrepot: ${Math.round(fillRate * 100)}% < ${navalData.settings.storageThreshold}%`, 'info');
        return;
    }
    
    const unitsInTown = getUnitsInTown();
    let recruited = false;
    
    for (const unitId in targets) {
        const targetCount = targets[unitId];
        const currentCount = unitsInTown[unitId] || 0;
        const needed = targetCount - currentCount;
        
        if (needed <= 0) continue;
        
        const unitData = uw.GameData.units[unitId];
        if (!unitData) continue;
        
        const cost = unitData.resources;
        const maxAffordable = Math.min(
            Math.floor(res.wood / cost.wood),
            Math.floor(res.stone / cost.stone),
            Math.floor(res.iron / cost.iron)
        );
        
        const toRecruit = Math.min(needed, maxAffordable);
        if (toRecruit <= 0) continue;
        
        recruitShips(cityId, unitId, toRecruit, unitData.name);
        recruited = true;
        break;
    }
    
    if (!recruited) {
        log('NAVAL', 'Objectifs atteints ou ressources insuffisantes', 'info');
    }
}

function runQueueMode() {
    const cityId = getCurrentCityId();
    
    if (!cityId) {
        log('NAVAL', 'Ville non trouvee', 'error');
        return;
    }
    
    const queue = navalData.queues[cityId];
    if (!queue?.length) {
        log('NAVAL', 'File vide', 'warning');
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
        log('NAVAL', 'Ressources insuffisantes pour ' + unitData.name, 'warning');
        return;
    }
    
    recruitShips(cityId, order.id, order.count, unitData.name, () => {
        if (navalData.settings.recruitMode === 'loop') {
            queue.push(queue.shift());
        } else {
            queue.shift();
        }
        saveData();
        updateQueueDisplay();
    });
}

function recruitShips(cityId, unitId, count, unitName, callback) {
    const csrfToken = uw.Game.csrfToken;
    
    uw.$.ajax({
        type: 'POST',
        url: `/game/building_docks?town_id=${cityId}&action=build&h=${csrfToken}`,
        data: { json: JSON.stringify({ unit_id: unitId, amount: count, town_id: cityId, nl_init: true }) },
        dataType: 'json',
        success: function(response) {
            if (response?.json?.error) {
                log('NAVAL', 'Erreur: ' + response.json.error, 'error');
                return;
            }
            
            log('NAVAL', `${count}x ${unitName} lances`, 'success');
            navalData.stats.totalRecruited += count;
            navalData.stats.recruitCycles++;
            updateStats();
            updateTargetsGrid();
            saveData();
            
            if (callback) callback();
        },
        error: function() {
            log('NAVAL', 'Erreur AJAX', 'error');
        }
    });
}

function savePlan() {
    const nameInput = document.getElementById('naval-plan-name');
    const planName = nameInput.value.trim();
    
    if (!planName) {
        log('NAVAL', 'Entrez un nom de plan', 'warning');
        return;
    }
    
    const cityId = getCurrentCityId();
    const queue = navalData.queues[cityId] || [];
    const targets = navalData.targets[cityId] || {};
    
    const plan = {
        name: planName,
        date: new Date().toISOString(),
        queue: [...queue],
        targets: { ...targets },
        settings: {
            mode: navalData.settings.recruitMode,
            threshold: navalData.settings.storageThreshold
        }
    };
    
    const existingIndex = navalData.plans.findIndex(p => p.name === planName);
    if (existingIndex >= 0) {
        navalData.plans[existingIndex] = plan;
        log('NAVAL', `Plan "${planName}" mis a jour`, 'success');
    } else {
        navalData.plans.push(plan);
        log('NAVAL', `Plan "${planName}" sauvegarde`, 'success');
    }
    
    nameInput.value = '';
    saveData();
    updatePlansList();
}

function loadPlan(index) {
    const plan = navalData.plans[index];
    if (!plan) return;
    
    const cityId = getCurrentCityId();
    if (!cityId) return;
    
    navalData.queues[cityId] = [...plan.queue];
    navalData.targets[cityId] = { ...plan.targets };
    
    if (plan.settings) {
        navalData.settings.recruitMode = plan.settings.mode || 'queue';
        navalData.settings.storageThreshold = plan.settings.threshold || 80;
        document.getElementById('naval-mode').value = navalData.settings.recruitMode;
        document.getElementById('naval-threshold').value = navalData.settings.storageThreshold;
    }
    
    saveData();
    updateQueueDisplay();
    updateTargetsGrid();
    log('NAVAL', `Plan "${plan.name}" charge`, 'success');
}

function deletePlan(index) {
    const plan = navalData.plans[index];
    if (!plan) return;
    
    navalData.plans.splice(index, 1);
    saveData();
    updatePlansList();
    log('NAVAL', `Plan "${plan.name}" supprime`, 'info');
}

function updatePlansList() {
    const container = document.getElementById('naval-plans-list');
    if (!container) return;
    
    if (!navalData.plans.length) {
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;font-style:italic;padding:15px;">Aucun plan sauvegarde</div>';
        return;
    }
    
    container.innerHTML = navalData.plans.map((plan, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);border:1px solid rgba(212,175,55,0.3);padding:8px 12px;margin-bottom:6px;border-radius:4px;">
            <div>
                <div style="font-size:12px;color:#F5DEB3;font-weight:bold;">${plan.name}</div>
                <div style="font-size:10px;color:#8B8B83;">${Object.keys(plan.targets || {}).length} objectifs, ${(plan.queue || []).length} en file</div>
            </div>
            <div style="display:flex;gap:4px;">
                <button class="plan-load-btn" data-index="${i}" style="background:#4CAF50;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:10px;">Charger</button>
                <button class="plan-delete-btn" data-index="${i}" style="background:#E53935;color:#fff;border:none;padding:4px 8px;border-radius:3px;cursor:pointer;font-size:10px;">X</button>
            </div>
        </div>
    `).join('');
    
    container.querySelectorAll('.plan-load-btn').forEach(b => {
        b.onclick = () => loadPlan(parseInt(b.dataset.index));
    });
    container.querySelectorAll('.plan-delete-btn').forEach(b => {
        b.onclick = () => deletePlan(parseInt(b.dataset.index));
    });
}

function exportPlans() {
    const exportData = {
        version: '1.0.0',
        type: 'naval',
        exportDate: new Date().toISOString(),
        plans: navalData.plans
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grepolis-naval-plans-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    log('NAVAL', 'Plans exportes', 'success');
}

function importPlans(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importData = JSON.parse(e.target.result);
            
            if (importData.plans && Array.isArray(importData.plans)) {
                let imported = 0;
                importData.plans.forEach(plan => {
                    if (plan.name) {
                        const existingIndex = navalData.plans.findIndex(p => p.name === plan.name);
                        if (existingIndex >= 0) {
                            navalData.plans[existingIndex] = plan;
                        } else {
                            navalData.plans.push(plan);
                        }
                        imported++;
                    }
                });
                
                saveData();
                updatePlansList();
                log('NAVAL', `${imported} plan(s) importe(s)`, 'success');
            } else {
                log('NAVAL', 'Format de fichier invalide', 'error');
            }
        } catch(err) {
            log('NAVAL', 'Erreur import: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function debugNavalInfo() {
    log('NAVAL', '=== DEBUG INFO ===', 'info');
    
    try {
        const ct = uw.ITowns.getCurrentTown();
        const townId = getCurrentCityId();
        
        log('NAVAL', 'Town ID: ' + townId, 'info');
        log('NAVAL', 'Town Name: ' + getCurrentTownName(), 'info');
        
        log('NAVAL', '--- Methods disponibles sur CurrentTown ---', 'info');
        const methods = [];
        for (let key in ct) {
            if (typeof ct[key] === 'function' && (key.includes('dock') || key.includes('Dock') || key.includes('order') || key.includes('Order') || key.includes('unit') || key.includes('Unit'))) {
                methods.push(key);
            }
        }
        log('NAVAL', 'Methods: ' + methods.join(', '), 'info');
        
        log('NAVAL', '--- docksOrders ---', 'info');
        if (typeof ct.docksOrders === 'function') {
            const orders = ct.docksOrders();
            log('NAVAL', 'docksOrders() type: ' + typeof orders, 'info');
            if (orders) {
                log('NAVAL', 'docksOrders() keys: ' + Object.keys(orders).join(', '), 'info');
                if (orders.models) {
                    log('NAVAL', 'docksOrders().models.length: ' + orders.models.length, 'info');
                    if (orders.models.length > 0) {
                        log('NAVAL', 'Premier ordre: ' + JSON.stringify(orders.models[0].attributes || orders.models[0]), 'info');
                    }
                } else if (orders.length !== undefined) {
                    log('NAVAL', 'docksOrders().length: ' + orders.length, 'info');
                    if (orders.length > 0) {
                        log('NAVAL', 'Premier ordre: ' + JSON.stringify(orders[0].attributes || orders[0]), 'info');
                    }
                }
            }
        } else {
            log('NAVAL', 'docksOrders non disponible', 'warning');
        }
        
        log('NAVAL', '--- MM.getModels ---', 'info');
        if (uw.MM && uw.MM.getModels) {
            const models = uw.MM.getModels();
            const modelKeys = Object.keys(models);
            const orderModels = modelKeys.filter(k => k.includes('Order') || k.includes('order'));
            log('NAVAL', 'Models avec Order: ' + orderModels.join(', '), 'info');
            
            orderModels.forEach(modelName => {
                const model = models[modelName];
                const count = Object.keys(model).length;
                log('NAVAL', modelName + ': ' + count + ' entrees', 'info');
                if (count > 0) {
                    const firstKey = Object.keys(model)[0];
                    const first = model[firstKey];
                    if (first && first.attributes) {
                        log('NAVAL', modelName + ' exemple: ' + JSON.stringify(first.attributes), 'info');
                    }
                }
            });
        }
        
        log('NAVAL', '--- Units in town ---', 'info');
        const units = getUnitsInTown();
        const navalUnits = {};
        NAVAL_UNITS.forEach(id => {
            if (units[id]) navalUnits[id] = units[id];
        });
        MYTHICAL_SHIPS.forEach(id => {
            if (units[id]) navalUnits[id] = units[id];
        });
        log('NAVAL', 'Naval units: ' + JSON.stringify(navalUnits), 'info');
        
        log('NAVAL', '--- Queue detection result ---', 'info');
        const queued = getUnitsInQueue();
        log('NAVAL', 'Queued units: ' + JSON.stringify(queued), 'info');
        
        log('NAVAL', '=== FIN DEBUG ===', 'info');
        
    } catch(e) {
        log('NAVAL', 'Erreur debug: ' + e.message, 'error');
    }
}

function setupTownChangeObserver() {
    if (uw.$?.Observer && uw.GameEvents) {
        uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(() => {
            setTimeout(() => {
                const nameEl = document.getElementById('naval-city-name');
                if (nameEl) nameEl.textContent = getCurrentTownName();
                updateShipsGrid();
                updateTargetsGrid();
                updateQueueDisplay();
            }, 500);
        });
    }
}

function startTimer() {
    setInterval(() => {
        const el = document.getElementById('naval-timer');
        if (!el) return;
        
        if (!navalData.enabled) {
            el.textContent = '--:--';
            el.classList.remove('ready');
            return;
        }
        
        const diff = navalData.nextCheckTime - Date.now();
        if (diff <= 0) {
            runNavalCycle();
            navalData.nextCheckTime = Date.now() + navalData.settings.checkInterval * 60000;
        }
        
        el.classList.remove('ready');
        const m = Math.max(0, Math.floor(diff / 60000)).toString().padStart(2, '0');
        const s = Math.max(0, Math.floor((diff % 60000) / 1000)).toString().padStart(2, '0');
        el.textContent = `${m}:${s}`;
    }, 1000);
}

function updateStats() {
    const t = document.getElementById('naval-stat-total');
    const c = document.getElementById('naval-stat-cycles');
    if (t) t.textContent = navalData.stats.totalRecruited;
    if (c) c.textContent = navalData.stats.recruitCycles;
}

function saveData() {
    GM_setValue('gu_naval_data', JSON.stringify({
        enabled: navalData.enabled,
        settings: navalData.settings,
        stats: navalData.stats,
        queues: navalData.queues,
        targets: navalData.targets,
        plans: navalData.plans
    }));
}

function loadData() {
    const saved = GM_getValue('gu_naval_data');
    if (saved) {
        try {
            const d = JSON.parse(saved);
            navalData = { ...navalData, ...d };
        } catch(e) {}
    }
}
