const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

let recruitData = {
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

const excludedUnits = ['militia'];
const researchRequirements = { 'slinger': 'slinger', 'archer': 'archer', 'hoplite': 'hoplite', 'rider': 'rider', 'chariot': 'chariot', 'catapult': 'catapult' };
const baseUnits = ['sword'];
const divineUnits = { 'godsent': null, 'minotaur': 'zeus', 'manticore': 'zeus', 'griffin': 'zeus', 'zyklop': 'poseidon', 'sea_monster': 'poseidon', 'siren': 'poseidon', 'harpy': 'hera', 'fury': 'hera', 'ladon': 'hera', 'medusa': 'athena', 'centaur': 'athena', 'pegasus': 'athena', 'cerberus': 'hades', 'calydonian_boar': 'artemis', 'satyr': 'aphrodite', 'spartoi': 'ares' };

function getCurrentCityId() { try { return uw.ITowns.getCurrentTown().id; } catch(e) { return null; } }
function getCurrentTown() { try { return uw.MM.getModels().Town[getCurrentCityId()]; } catch(e) { return null; } }
function getCurrentTownName() { try { return uw.ITowns.getCurrentTown().getName(); } catch(e) { return 'Ville inconnue'; } }
function getResources() { try { const town = getCurrentTown(); return town?.attributes?.resources || { wood: 0, stone: 0, iron: 0 }; } catch(e) { return { wood: 0, stone: 0, iron: 0 }; } }
function getStorageCapacity() { try { const town = getCurrentTown(); return town?.attributes?.storage || 8000; } catch(e) { return 8000; } }
function getCurrentGod() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.god ? ct.god() : getCurrentTown()?.attributes?.god || null; } catch(e) { return null; } }
function getResearches() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.researches ? ct.researches()?.attributes || {} : {}; } catch(e) { return {}; } }
function hasResearch(id) { if (!id) return true; const r = getResearches(); return r[id] === true || r[id] === 1; }
function getUnitsInTown() { try { const ct = uw.ITowns.getCurrentTown(); return ct?.units ? ct.units() : {}; } catch(e) { return {}; } }

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
                    if (attrs.town_id == townId && attrs.kind === 'barracks') {
                        const unitId = attrs.unit_type;
                        const count = attrs.units_left || attrs.count || 1;
                        if (unitId) queued[unitId] = (queued[unitId] || 0) + count;
                    }
                }
            }
        }
    } catch(e) {
        log('RECRUIT', 'Erreur getUnitsInQueue: ' + e.message, 'warning');
    }
    return queued;
}

function getGlobalUnits() {
    const globalUnits = {};
    try {
        const townId = getCurrentCityId();
        const ct = uw.ITowns.getCurrentTown();
        
        const inTown = getUnitsInTown();
        for (let unitId in inTown) {
            if (inTown[unitId] > 0) {
                globalUnits[unitId] = (globalUnits[unitId] || 0) + inTown[unitId];
            }
        }
        
        if (ct && typeof ct.unitsOuter === 'function') {
            const outer = ct.unitsOuter();
            if (outer) {
                for (let unitId in outer) {
                    if (outer[unitId] > 0) {
                        globalUnits[unitId] = (globalUnits[unitId] || 0) + outer[unitId];
                    }
                }
            }
        }
        
        if (ct && typeof ct.unitsOuterTown === 'function') {
            const outerTown = ct.unitsOuterTown();
            if (outerTown) {
                for (let unitId in outerTown) {
                    if (outerTown[unitId] > 0) {
                        globalUnits[unitId] = (globalUnits[unitId] || 0) + outerTown[unitId];
                    }
                }
            }
        }
        
        if (ct && typeof ct.unitsSupport === 'function') {
            const support = ct.unitsSupport();
            if (support) {
                for (let unitId in support) {
                    if (support[unitId] > 0) {
                        globalUnits[unitId] = (globalUnits[unitId] || 0) + support[unitId];
                    }
                }
            }
        }
        
        if (uw.MM && uw.MM.getModels) {
            const models = uw.MM.getModels();
            
            if (models.Movements || models.Commands) {
                const mvModel = models.Movements || models.Commands;
                for (let id in mvModel) {
                    const mv = mvModel[id];
                    const attrs = mv.attributes || mv;
                    if ((attrs.origin_town_id == townId || attrs.home_town_id == townId) && attrs.units) {
                        const units = attrs.units;
                        for (let unitId in units) {
                            const unitData = uw.GameData.units[unitId];
                            if (units[unitId] > 0 && unitData && !unitData.is_naval) {
                                globalUnits[unitId] = (globalUnits[unitId] || 0) + units[unitId];
                            }
                        }
                    }
                }
            }
        }
        
    } catch(e) {
        log('RECRUIT', 'Erreur getGlobalUnits: ' + e.message, 'warning');
    }
    return globalUnits;
}

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
                <div id="recruit-units-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;"></div>
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
                <div class="section-title"><span>🎯</span> Mode Objectif (Maintien)</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <p style="font-size:11px;color:#BDB76B;margin-bottom:12px;">Definir un objectif de troupes a maintenir. Le bot recrute automatiquement quand le seuil d'entrepot est atteint.</p>
                <div class="options-grid" style="margin-bottom:12px;">
                    <div class="option-group">
                        <span class="option-label">Seuil entrepot</span>
                        <select class="option-select" id="recruit-threshold">
                            <option value="25">25%</option>
                            <option value="50">50%</option>
                            <option value="75">75%</option>
                            <option value="80">80%</option>
                            <option value="90">90%</option>
                        </select>
                    </div>
                </div>
                <div id="recruit-targets-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;"></div>
                <button class="btn" style="width:100%;" id="recruit-save-targets">Sauvegarder objectifs</button>
            </div>
        </div>
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>💾</span> Plans de recrutement</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <input type="text" class="option-input" id="recruit-plan-name" placeholder="Nom du plan" style="flex:1;">
                    <button class="btn" id="recruit-save-plan">Sauver</button>
                </div>
                <div id="recruit-plans-list" style="max-height:120px;overflow-y:auto;margin-bottom:12px;"></div>
                <div style="display:flex;gap:8px;">
                    <button class="btn" style="flex:1;" id="recruit-export-plans">Exporter</button>
                    <button class="btn" style="flex:1;" id="recruit-import-plans">Importer</button>
                </div>
                <input type="file" id="recruit-import-file" style="display:none;" accept=".json">
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
                        <span class="option-label">Intervalle</span>
                        <select class="option-select" id="recruit-interval">
                            <option value="0.16">10 sec</option>
                            <option value="0.5">30 sec</option>
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
    document.getElementById('recruit-threshold').value = recruitData.settings.storageThreshold;
    updateStats();
    updateUnitsGrid();
    updateTargetsGrid();
    updateQueueDisplay();
    updatePlansList();
    
    document.getElementById('toggle-recruit').onchange = (e) => toggleRecruit(e.target.checked);
    document.getElementById('recruit-interval').onchange = (e) => {
        recruitData.settings.checkInterval = parseFloat(e.target.value);
        recruitData.nextCheckTime = Date.now() + recruitData.settings.checkInterval * 60000;
        saveData();
        const val = parseFloat(e.target.value);
        const label = val < 1 ? (val * 60) + ' sec' : val + ' min';
        log('RECRUIT', 'Intervalle: ' + label, 'info');
    };
    document.getElementById('recruit-mode').onchange = (e) => {
        recruitData.settings.recruitMode = e.target.value;
        saveData();
        const modes = { queue: 'File', loop: 'Boucle', target: 'Objectif' };
        log('RECRUIT', 'Mode: ' + modes[e.target.value], 'info');
    };
    document.getElementById('recruit-threshold').onchange = (e) => {
        recruitData.settings.storageThreshold = parseInt(e.target.value);
        saveData();
        log('RECRUIT', 'Seuil entrepot: ' + e.target.value + '%', 'info');
    };
    document.getElementById('recruit-now').onclick = () => runRecruitCycle();
    document.getElementById('recruit-add-queue').onclick = () => addToQueue();
    document.getElementById('recruit-clear-queue').onclick = () => clearQueue();
    document.getElementById('recruit-save-targets').onclick = () => saveTargets();
    document.getElementById('recruit-save-plan').onclick = () => savePlan();
    document.getElementById('recruit-export-plans').onclick = () => exportPlans();
    document.getElementById('recruit-import-plans').onclick = () => document.getElementById('recruit-import-file').click();
    document.getElementById('recruit-import-file').onchange = (e) => importPlans(e);

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
    updateTargetsGrid();
    updateQueueDisplay();
    updatePlansList();
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
    const unitsInTown = getUnitsInTown();
    const globalUnits = getGlobalUnits();
    const unitsInQueue = getUnitsInQueue();
    
    if (!units.length) {
        grid.innerHTML = '<div style="grid-column:span 4;text-align:center;color:#8B8B83;font-style:italic;padding:20px;">Aucune unite disponible</div>';
        return;
    }
    
    grid.innerHTML = units.map(u => {
        const inTown = unitsInTown[u.id] || 0;
        const total = globalUnits[u.id] || 0;
        const outside = total - inTown;
        const queued = unitsInQueue[u.id] || 0;
        return `
        <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(212,175,55,0.3);border-radius:6px;padding:8px;text-align:center;">
            <div class="unit_icon50x50 ${u.id}" style="width:50px;height:50px;margin:0 auto 4px;transform:scale(0.8);"></div>
            <div style="font-size:9px;color:#BDB76B;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.name}</div>
            <div style="font-size:10px;margin-bottom:4px;">
                <span style="color:#4CAF50;">${inTown}</span>${outside > 0 ? ` + <span style="color:#FF9800;">${outside}</span>` : ''}${queued > 0 ? ` + <span style="color:#64B5F6;">${queued}</span>` : ''}
            </div>
            <input type="number" class="recruit-unit-input option-input" data-unit="${u.id}" value="0" min="0" style="width:100%;text-align:center;padding:4px;font-size:11px;">
        </div>
    `}).join('');
}

function updateTargetsGrid() {
    const grid = document.getElementById('recruit-targets-grid');
    if (!grid) return;
    
    const units = getAvailableUnits();
    const cityId = getCurrentCityId();
    const targets = recruitData.targets[cityId] || {};
    const unitsInTown = getUnitsInTown();
    const unitsInQueue = getUnitsInQueue();
    const globalUnits = getGlobalUnits();
    
    if (!units.length) {
        grid.innerHTML = '<div style="grid-column:span 4;text-align:center;color:#8B8B83;font-style:italic;padding:20px;">Aucune unite disponible</div>';
        return;
    }
    
    grid.innerHTML = units.map(u => {
        const inTown = unitsInTown[u.id] || 0;
        const queued = unitsInQueue[u.id] || 0;
        const totalGlobal = globalUnits[u.id] || 0;
        const outside = totalGlobal - inTown;
        const grandTotal = totalGlobal + queued;
        const target = targets[u.id] || 0;
        const isComplete = grandTotal >= target && target > 0;
        const targetColor = target === 0 ? '#8B8B83' : (isComplete ? '#4CAF50' : '#FF9800');
        return `
        <div style="background:rgba(0,0,0,0.3);border:1px solid ${isComplete ? 'rgba(76,175,80,0.5)' : 'rgba(212,175,55,0.3)'};border-radius:6px;padding:8px;text-align:center;">
            <div class="unit_icon50x50 ${u.id}" style="width:50px;height:50px;margin:0 auto 4px;transform:scale(0.8);"></div>
            <div style="font-size:9px;color:#BDB76B;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.name}</div>
            <div style="font-size:9px;margin-bottom:2px;">
                <span style="color:#4CAF50;">${inTown}</span>${outside > 0 ? ` + <span style="color:#FF9800;">${outside}</span>` : ''}${queued > 0 ? ` + <span style="color:#64B5F6;">${queued}</span>` : ''}
            </div>
            <div style="font-size:10px;color:${targetColor};margin-bottom:4px;">Total: ${grandTotal} / ${target}</div>
            <input type="number" class="recruit-target-input option-input" data-unit="${u.id}" value="${target}" min="0" style="width:100%;text-align:center;padding:4px;font-size:11px;">
        </div>
    `}).join('');
}

function saveTargets() {
    const cityId = getCurrentCityId();
    if (!cityId) return;
    
    recruitData.targets[cityId] = {};
    document.querySelectorAll('.recruit-target-input').forEach(inp => {
        const count = parseInt(inp.value) || 0;
        if (count > 0) {
            recruitData.targets[cityId][inp.dataset.unit] = count;
        }
    });
    
    saveData();
    updateTargetsGrid();
    log('RECRUIT', 'Objectifs sauvegardes', 'success');
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
    const mode = recruitData.settings.recruitMode;
    
    if (mode === 'target') {
        runTargetMode();
    } else {
        runQueueMode();
    }
}

function runTargetMode() {
    const cityId = getCurrentCityId();
    const cityName = getCurrentTownName();
    
    if (!cityId) {
        log('RECRUIT', 'Ville non trouvee', 'error');
        return;
    }
    
    const targets = recruitData.targets[cityId];
    if (!targets || Object.keys(targets).length === 0) {
        log('RECRUIT', 'Aucun objectif defini', 'warning');
        return;
    }
    
    const res = getResources();
    const storage = getStorageCapacity();
    const threshold = recruitData.settings.storageThreshold / 100;
    const totalRes = res.wood + res.stone + res.iron;
    const fillRate = totalRes / (storage * 3);
    
    if (fillRate < threshold) {
        log('RECRUIT', `Entrepot: ${Math.round(fillRate * 100)}% < ${recruitData.settings.storageThreshold}%`, 'info');
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
        
        recruitUnits(cityId, unitId, toRecruit, unitData.name);
        recruited = true;
        break;
    }
    
    if (!recruited) {
        log('RECRUIT', 'Objectifs atteints ou ressources insuffisantes', 'info');
    }
}

function runQueueMode() {
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
    
    recruitUnits(cityId, order.id, order.count, unitData.name, () => {
        if (recruitData.settings.recruitMode === 'loop') {
            queue.push(queue.shift());
        } else {
            queue.shift();
        }
        saveData();
        updateQueueDisplay();
    });
}

function recruitUnits(cityId, unitId, count, unitName, callback) {
    const csrfToken = uw.Game.csrfToken;
    
    uw.$.ajax({
        type: 'POST',
        url: `/game/building_barracks?town_id=${cityId}&action=build&h=${csrfToken}`,
        data: { json: JSON.stringify({ unit_id: unitId, amount: count, town_id: cityId, nl_init: true }) },
        dataType: 'json',
        success: function(response) {
            if (response?.json?.error) {
                log('RECRUIT', 'Erreur: ' + response.json.error, 'error');
                return;
            }
            
            log('RECRUIT', `${count}x ${unitName} recrutes`, 'success');
            recruitData.stats.totalRecruited += count;
            recruitData.stats.recruitCycles++;
            updateStats();
            updateTargetsGrid();
            saveData();
            
            if (callback) callback();
        },
        error: function() {
            log('RECRUIT', 'Erreur AJAX', 'error');
        }
    });
}

function savePlan() {
    const nameInput = document.getElementById('recruit-plan-name');
    const planName = nameInput.value.trim();
    
    if (!planName) {
        log('RECRUIT', 'Entrez un nom de plan', 'warning');
        return;
    }
    
    const cityId = getCurrentCityId();
    const queue = recruitData.queues[cityId] || [];
    const targets = recruitData.targets[cityId] || {};
    
    const plan = {
        name: planName,
        date: new Date().toISOString(),
        queue: [...queue],
        targets: { ...targets },
        settings: {
            mode: recruitData.settings.recruitMode,
            threshold: recruitData.settings.storageThreshold
        }
    };
    
    const existingIndex = recruitData.plans.findIndex(p => p.name === planName);
    if (existingIndex >= 0) {
        recruitData.plans[existingIndex] = plan;
        log('RECRUIT', `Plan "${planName}" mis a jour`, 'success');
    } else {
        recruitData.plans.push(plan);
        log('RECRUIT', `Plan "${planName}" sauvegarde`, 'success');
    }
    
    nameInput.value = '';
    saveData();
    updatePlansList();
}

function loadPlan(index) {
    const plan = recruitData.plans[index];
    if (!plan) return;
    
    const cityId = getCurrentCityId();
    if (!cityId) return;
    
    recruitData.queues[cityId] = [...plan.queue];
    recruitData.targets[cityId] = { ...plan.targets };
    
    if (plan.settings) {
        recruitData.settings.recruitMode = plan.settings.mode || 'queue';
        recruitData.settings.storageThreshold = plan.settings.threshold || 80;
        document.getElementById('recruit-mode').value = recruitData.settings.recruitMode;
        document.getElementById('recruit-threshold').value = recruitData.settings.storageThreshold;
    }
    
    saveData();
    updateQueueDisplay();
    updateTargetsGrid();
    log('RECRUIT', `Plan "${plan.name}" charge`, 'success');
}

function deletePlan(index) {
    const plan = recruitData.plans[index];
    if (!plan) return;
    
    recruitData.plans.splice(index, 1);
    saveData();
    updatePlansList();
    log('RECRUIT', `Plan "${plan.name}" supprime`, 'info');
}

function updatePlansList() {
    const container = document.getElementById('recruit-plans-list');
    if (!container) return;
    
    if (!recruitData.plans.length) {
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;font-style:italic;padding:15px;">Aucun plan sauvegarde</div>';
        return;
    }
    
    container.innerHTML = recruitData.plans.map((plan, i) => `
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
        version: '2.1.0',
        exportDate: new Date().toISOString(),
        plans: recruitData.plans
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grepolis-recruit-plans-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    log('RECRUIT', 'Plans exportes', 'success');
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
                        const existingIndex = recruitData.plans.findIndex(p => p.name === plan.name);
                        if (existingIndex >= 0) {
                            recruitData.plans[existingIndex] = plan;
                        } else {
                            recruitData.plans.push(plan);
                        }
                        imported++;
                    }
                });
                
                saveData();
                updatePlansList();
                log('RECRUIT', `${imported} plan(s) importe(s)`, 'success');
            } else {
                log('RECRUIT', 'Format de fichier invalide', 'error');
            }
        } catch(err) {
            log('RECRUIT', 'Erreur import: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function setupTownChangeObserver() {
    if (uw.$?.Observer && uw.GameEvents) {
        uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(() => {
            setTimeout(() => {
                const nameEl = document.getElementById('recruit-city-name');
                if (nameEl) nameEl.textContent = getCurrentTownName();
                updateUnitsGrid();
                updateTargetsGrid();
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
        targets: recruitData.targets,
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
