const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;

const STORAGE_KEY = 'gu_commerce_data';
const DELAIS_DISPONIBLES = [
    { value: 10000, label: '10 secondes' },
    { value: 30000, label: '30 secondes' },
    { value: 60000, label: '1 minute' },
    { value: 300000, label: '5 minutes' },
    { value: 600000, label: '10 minutes' }
];

let commerceData = {
    plans: [],
    plansActifs: {},
    planEnCours: null,
    intervalCheck: null,
    stats: { totalTrades: 0, resourcesMoved: 0 }
};

let planEnEdition = null;

function genererID() {
    return 'commerce_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getCurrentCityId() { 
    try { return uw.ITowns.getCurrentTown().id; } catch(e) { return null; } 
}

function getCurrentTownName() { 
    try { return uw.ITowns.getCurrentTown().getName(); } catch(e) { return 'Ville inconnue'; } 
}

function getResources(townId) { 
    try { 
        const tid = townId || getCurrentCityId();
        const town = uw.MM.getModels().Town[tid]; 
        return town?.attributes?.resources || { wood: 0, stone: 0, iron: 0 }; 
    } catch(e) { return { wood: 0, stone: 0, iron: 0 }; } 
}

function getStorageCapacity(townId) { 
    try { 
        const tid = townId || getCurrentCityId();
        const town = uw.MM.getModels().Town[tid]; 
        return town?.attributes?.storage || 8000; 
    } catch(e) { return 8000; } 
}

function getMarketplaceLevel(townId) {
    try {
        const tid = townId || getCurrentCityId();
        const town = uw.ITowns.getTown(tid);
        if (town && town.buildings) {
            const buildings = town.buildings();
            return buildings?.market || 1;
        }
        const townModel = uw.MM.getModels().Town[tid];
        if (townModel?.attributes?.buildings) {
            return townModel.attributes.buildings.market || 1;
        }
    } catch(e) {}
    return 1;
}

function getTradeCapacity(townId) {
    const marketLevel = getMarketplaceLevel(townId);
    return marketLevel * 500;
}

function getTradesInProgress(townId) {
    try {
        const tid = townId || getCurrentCityId();
        const movements = uw.MM.getModels().MovementsUnits;
        let usedCapacity = 0;
        
        if (movements) {
            for (let id in movements) {
                const mov = movements[id];
                if (mov?.attributes) {
                    const attrs = mov.attributes;
                    if (attrs.origin_town_id === tid && attrs.type === 'trade') {
                        usedCapacity += (attrs.wood || 0) + (attrs.stone || 0) + (attrs.iron || 0);
                    }
                }
            }
        }
        
        const trades = uw.MM.getModels().Trades;
        if (trades) {
            for (let id in trades) {
                const trade = trades[id];
                if (trade?.attributes && trade.attributes.origin_town_id === tid) {
                    usedCapacity += (trade.attributes.wood || 0) + (trade.attributes.stone || 0) + (trade.attributes.iron || 0);
                }
            }
        }
        
        return usedCapacity;
    } catch(e) { return 0; }
}

function getAvailableTradeCapacity(townId) {
    const maxCapacity = getTradeCapacity(townId);
    const usedCapacity = getTradesInProgress(townId);
    return Math.max(0, maxCapacity - usedCapacity);
}

function getVillesJoueur() {
    const villes = [];
    try {
        if (uw.ITowns && uw.ITowns.getTowns) {
            const towns = uw.ITowns.getTowns();
            for (let id in towns) {
                const town = towns[id];
                villes.push({
                    id: parseInt(id),
                    name: town.getName ? town.getName() : town.name
                });
            }
        }
    } catch(e) {}
    return villes;
}

function getTownName(townId) {
    try {
        const town = uw.ITowns.getTown(townId);
        if (town) return town.getName ? town.getName() : town.name;
    } catch(e) {}
    return 'Ville ' + townId;
}

function formatDelai(ms) {
    if (ms < 60000) return Math.round(ms / 1000) + 's';
    return Math.round(ms / 60000) + 'min';
}

module.render = function(container) {
    container.innerHTML = `
        <div class="commerce-tabs">
            <button class="commerce-tab active" data-view="plans">📋 Mes Plans</button>
            <button class="commerce-tab" data-view="nouveau">+ Nouveau Plan</button>
            <button class="commerce-tab" data-view="edition" id="commerce-tab-edition" style="display:none;">✏️ Edition</button>
            <button class="commerce-tab" data-view="manuel">📦 Envoi Manuel</button>
        </div>
        
        <div class="commerce-content">
            <!-- Vue Mes Plans -->
            <div class="commerce-view active" id="commerce-view-plans">
                <div id="commerce-plans-liste"></div>
            </div>
            
            <!-- Vue Nouveau Plan -->
            <div class="commerce-view" id="commerce-view-nouveau">
                <div class="commerce-section">
                    <h3>📝 Creer un nouveau plan de commerce</h3>
                    <div class="commerce-row">
                        <label>Nom du plan:</label>
                        <input type="text" id="commerce-new-nom" class="commerce-input" placeholder="Ex: Ravitaillement Colo">
                    </div>
                    <div class="commerce-row">
                        <label>Ville destination:</label>
                        <select id="commerce-new-dest" class="commerce-select"></select>
                    </div>
                    <div class="commerce-row">
                        <label>Delai entre envois:</label>
                        <select id="commerce-new-delai" class="commerce-select">
                            ${DELAIS_DISPONIBLES.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="commerce-row">
                        <label>Mode:</label>
                        <select id="commerce-new-mode" class="commerce-select">
                            <option value="loop">🔄 Boucle infinie</option>
                            <option value="once">1️⃣ Envoi unique</option>
                        </select>
                    </div>
                    <div class="commerce-row commerce-row-right">
                        <button class="commerce-btn commerce-btn-primary" id="commerce-btn-creer-plan">Creer le plan</button>
                    </div>
                </div>
            </div>
            
            <!-- Vue Edition Plan -->
            <div class="commerce-view" id="commerce-view-edition">
                <div class="commerce-section">
                    <h3>✏️ Editer le plan: <span id="commerce-edit-plan-nom"></span></h3>
                    <input type="hidden" id="commerce-edit-plan-id">
                    <div class="commerce-row">
                        <label>Nom:</label>
                        <input type="text" id="commerce-edit-nom" class="commerce-input">
                    </div>
                    <div class="commerce-row">
                        <label>Ville destination:</label>
                        <select id="commerce-edit-dest" class="commerce-select"></select>
                    </div>
                    <div class="commerce-row">
                        <label>Delai entre envois:</label>
                        <select id="commerce-edit-delai" class="commerce-select">
                            ${DELAIS_DISPONIBLES.map(d => `<option value="${d.value}">${d.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="commerce-row">
                        <label>Mode:</label>
                        <select id="commerce-edit-mode" class="commerce-select">
                            <option value="loop">🔄 Boucle infinie</option>
                            <option value="once">1️⃣ Envoi unique</option>
                        </select>
                    </div>
                </div>
                
                <div class="commerce-section">
                    <h3>🏰 Ajouter une ville source</h3>
                    <div class="commerce-row">
                        <label>Ville source:</label>
                        <select id="commerce-edit-source" class="commerce-select"></select>
                    </div>
                    
                    <div id="commerce-capacity-info" class="commerce-capacity-info"></div>
                    
                    <div class="commerce-resources-input">
                        <div class="commerce-res-row">
                            <span class="commerce-res-icon">🪵</span>
                            <label>Bois:</label>
                            <input type="number" id="commerce-edit-wood" class="commerce-input commerce-input-sm" value="0" min="0">
                        </div>
                        <div class="commerce-res-row">
                            <span class="commerce-res-icon">🪨</span>
                            <label>Pierre:</label>
                            <input type="number" id="commerce-edit-stone" class="commerce-input commerce-input-sm" value="0" min="0">
                        </div>
                        <div class="commerce-res-row">
                            <span class="commerce-res-icon">⛏️</span>
                            <label>Argent:</label>
                            <input type="number" id="commerce-edit-iron" class="commerce-input commerce-input-sm" value="0" min="0">
                        </div>
                    </div>
                    
                    <div id="commerce-total-validation" class="commerce-total-validation"></div>
                    
                    <div class="commerce-row commerce-row-right">
                        <button class="commerce-btn commerce-btn-success" id="commerce-btn-ajouter-source">+ Ajouter cette source</button>
                    </div>
                </div>
                
                <div class="commerce-section">
                    <h3>📋 Sources du plan (<span id="commerce-edit-sources-count">0</span>)</h3>
                    <div id="commerce-edit-sources-liste"></div>
                </div>
                
                <div class="commerce-row commerce-row-between">
                    <button class="commerce-btn commerce-btn-secondary" id="commerce-btn-retour">← Retour</button>
                    <button class="commerce-btn commerce-btn-primary" id="commerce-btn-sauver-plan">💾 Sauvegarder</button>
                </div>
            </div>
            
            <!-- Vue Envoi Manuel -->
            <div class="commerce-view" id="commerce-view-manuel">
                <div class="commerce-section">
                    <div class="commerce-header">
                        <div class="commerce-header-icon">🏪</div>
                        <div class="commerce-header-info">
                            <div class="commerce-header-title" id="commerce-manuel-ville">${getCurrentTownName()}</div>
                            <div class="commerce-header-subtitle" id="commerce-manuel-capacity"></div>
                        </div>
                    </div>
                    
                    <div id="commerce-manuel-capacity-bar" class="commerce-capacity-bar-container"></div>
                    
                    <div class="commerce-resources">
                        <div class="commerce-resource">
                            <div class="commerce-resource-icon">🪵</div>
                            <div class="commerce-resource-value" id="commerce-res-wood">0</div>
                            <div class="commerce-resource-label">Bois</div>
                        </div>
                        <div class="commerce-resource">
                            <div class="commerce-resource-icon">🪨</div>
                            <div class="commerce-resource-value" id="commerce-res-stone">0</div>
                            <div class="commerce-resource-label">Pierre</div>
                        </div>
                        <div class="commerce-resource">
                            <div class="commerce-resource-icon">⛏️</div>
                            <div class="commerce-resource-value" id="commerce-res-iron">0</div>
                            <div class="commerce-resource-label">Argent</div>
                        </div>
                    </div>
                </div>
                
                <div class="commerce-section">
                    <h3>📦 Envoi Manuel</h3>
                    <div class="commerce-row">
                        <label>Destination:</label>
                        <select class="commerce-select" id="commerce-dest"></select>
                    </div>
                    <div class="commerce-row">
                        <label>🪵 Bois:</label>
                        <input type="number" class="commerce-input" id="commerce-wood" value="0" min="0">
                    </div>
                    <div class="commerce-row">
                        <label>🪨 Pierre:</label>
                        <input type="number" class="commerce-input" id="commerce-stone" value="0" min="0">
                    </div>
                    <div class="commerce-row">
                        <label>⛏️ Argent:</label>
                        <input type="number" class="commerce-input" id="commerce-iron" value="0" min="0">
                    </div>
                    
                    <div id="commerce-manuel-validation" class="commerce-total-validation"></div>
                    
                    <div style="display:flex;gap:10px;margin-top:15px;">
                        <button class="commerce-btn commerce-btn-success" id="commerce-send" style="flex:1;">📤 Envoyer</button>
                        <button class="commerce-btn commerce-btn-primary" id="commerce-max" style="flex:1;">📊 Maximum</button>
                    </div>
                </div>
                
                <div class="commerce-section">
                    <h3>📊 Statistiques</h3>
                    <div class="stats-grid">
                        <div class="stat-box">
                            <span class="stat-value" id="commerce-stat-trades">${commerceData.stats.totalTrades}</span>
                            <span class="stat-label">Echanges</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="commerce-stat-resources">${commerceData.stats.resourcesMoved}</span>
                            <span class="stat-label">Ressources</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="commerce-status-bar">
            <span id="commerce-status">Status: En attente</span>
        </div>

        <style>
            .commerce-tabs {
                display: flex;
                gap: 5px;
                padding: 10px 0;
                margin-bottom: 15px;
                border-bottom: 1px solid rgba(212,175,55,0.3);
            }
            .commerce-tab {
                padding: 8px 16px;
                background: rgba(255,255,255,0.1);
                border: none;
                border-radius: 6px;
                color: #8B8B83;
                cursor: pointer;
                font-size: 12px;
                font-family: 'Cinzel', serif;
                transition: all 0.2s;
            }
            .commerce-tab:hover { background: rgba(212,175,55,0.2); color: #F5DEB3; }
            .commerce-tab.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; }
            
            .commerce-content { min-height: 300px; }
            .commerce-view { display: none; }
            .commerce-view.active { display: block; }
            
            .commerce-section {
                background: rgba(0,0,0,0.25);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 10px;
                padding: 15px;
                margin-bottom: 15px;
            }
            .commerce-section h3 {
                margin: 0 0 15px 0;
                font-size: 14px;
                color: #D4AF37;
                font-family: 'Cinzel', serif;
                border-bottom: 1px solid rgba(212,175,55,0.2);
                padding-bottom: 10px;
            }
            
            .commerce-row {
                display: flex;
                gap: 10px;
                margin-bottom: 12px;
                align-items: center;
            }
            .commerce-row label {
                width: 140px;
                font-size: 12px;
                color: #BDB76B;
                flex-shrink: 0;
            }
            .commerce-row-right { justify-content: flex-end; margin-top: 15px; }
            .commerce-row-between { justify-content: space-between; margin-top: 15px; }
            
            .commerce-input, .commerce-select {
                flex: 1;
                padding: 10px 12px;
                border: 1px solid #8B6914;
                border-radius: 6px;
                background: linear-gradient(180deg, #3D3225 0%, #2D2419 100%);
                color: #F5DEB3;
                font-size: 13px;
                font-family: 'Philosopher', serif;
            }
            .commerce-input:focus, .commerce-select:focus {
                outline: none;
                border-color: #D4AF37;
                box-shadow: 0 0 10px rgba(212,175,55,0.3);
            }
            .commerce-input-sm { max-width: 100px; }
            
            .commerce-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                font-family: 'Cinzel', serif;
                transition: all 0.2s;
            }
            .commerce-btn:hover { transform: translateY(-2px); }
            .commerce-btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
            .commerce-btn-success { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; }
            .commerce-btn-danger { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; }
            .commerce-btn-secondary { background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%); color: white; }
            .commerce-btn-warning { background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%); color: black; }
            .commerce-btn-sm { padding: 6px 12px; font-size: 11px; }
            
            .commerce-status-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 15px;
                background: rgba(0,0,0,0.4);
                border-radius: 8px;
                margin-top: 15px;
            }
            #commerce-status { font-size: 12px; color: #BDB76B; }
            
            .commerce-header {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 15px;
            }
            .commerce-header-icon { font-size: 32px; }
            .commerce-header-info { flex: 1; }
            .commerce-header-title {
                font-family: 'Cinzel', serif;
                font-size: 16px;
                color: #F5DEB3;
            }
            .commerce-header-subtitle {
                font-size: 12px;
                color: #8B8B83;
                margin-top: 3px;
            }
            
            .commerce-resources {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                margin-top: 15px;
            }
            .commerce-resource {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 8px;
                padding: 12px;
                text-align: center;
            }
            .commerce-resource-icon { font-size: 20px; margin-bottom: 5px; }
            .commerce-resource-value {
                font-family: 'Cinzel', serif;
                font-size: 16px;
                color: #FFD700;
            }
            .commerce-resource-label {
                font-size: 10px;
                color: #8B8B83;
                text-transform: uppercase;
            }
            
            .commerce-capacity-bar-container {
                background: rgba(0,0,0,0.3);
                border-radius: 8px;
                padding: 10px;
                margin-bottom: 10px;
            }
            .commerce-capacity-label {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                color: #BDB76B;
                margin-bottom: 5px;
            }
            .commerce-capacity-bar {
                height: 20px;
                background: rgba(0,0,0,0.4);
                border-radius: 10px;
                overflow: hidden;
                position: relative;
            }
            .commerce-capacity-fill {
                height: 100%;
                background: linear-gradient(90deg, #4CAF50, #8BC34A);
                transition: width 0.3s;
                border-radius: 10px;
            }
            .commerce-capacity-fill.warning { background: linear-gradient(90deg, #ffc107, #ffdb4d); }
            .commerce-capacity-fill.error { background: linear-gradient(90deg, #dc3545, #ff6b6b); }
            .commerce-capacity-text {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 11px;
                font-weight: bold;
                color: white;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }
            
            .commerce-capacity-info {
                background: rgba(0,0,0,0.3);
                border-radius: 8px;
                padding: 12px;
                margin: 10px 0;
            }
            
            .commerce-resources-input {
                display: flex;
                gap: 15px;
                margin: 15px 0;
            }
            .commerce-res-row {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .commerce-res-row label {
                font-size: 11px;
                color: #BDB76B;
                width: auto;
            }
            .commerce-res-icon { font-size: 16px; }
            
            .commerce-total-validation {
                padding: 10px;
                border-radius: 6px;
                margin: 10px 0;
                font-size: 12px;
                text-align: center;
            }
            .commerce-total-validation.valid {
                background: rgba(76,175,80,0.2);
                border: 1px solid rgba(76,175,80,0.5);
                color: #81C784;
            }
            .commerce-total-validation.invalid {
                background: rgba(229,57,53,0.2);
                border: 1px solid rgba(229,57,53,0.5);
                color: #E57373;
            }
            
            .commerce-plan-item {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 10px;
            }
            .commerce-plan-item:hover { border-color: rgba(212,175,55,0.5); }
            .commerce-plan-item.commerce-plan-actif { 
                border-color: rgba(76,175,80,0.7); 
                background: rgba(76,175,80,0.1);
                box-shadow: 0 0 10px rgba(76,175,80,0.3);
            }
            .commerce-plan-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .commerce-plan-name { 
                font-size: 15px; 
                font-weight: bold; 
                color: #F5DEB3; 
                font-family: 'Cinzel', serif; 
            }
            .commerce-plan-target { font-size: 11px; color: #8B8B83; margin-top: 3px; }
            .commerce-plan-stats { display: flex; gap: 15px; font-size: 11px; color: #BDB76B; }
            .commerce-plan-actions { display: flex; gap: 5px; }
            
            .commerce-source-item {
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .commerce-source-ville { flex: 1; }
            .commerce-source-ville-name { font-weight: bold; font-size: 12px; color: #F5DEB3; }
            .commerce-source-ville-res { font-size: 10px; color: #8B8B83; margin-top: 2px; }
            .commerce-source-status {
                padding: 3px 8px;
                border-radius: 10px;
                font-size: 10px;
                font-weight: bold;
            }
            .commerce-status-attente { background: #6c757d; color: white; }
            .commerce-status-envoye { background: #4CAF50; color: white; }
            .commerce-status-erreur { background: #E53935; color: white; }
            
            .commerce-empty {
                text-align: center;
                padding: 40px 20px;
                color: #8B8B83;
            }
            .commerce-empty-icon { font-size: 40px; margin-bottom: 10px; opacity: 0.5; }
            .commerce-empty-text { font-size: 13px; }
            .commerce-empty-hint { font-size: 11px; margin-top: 8px; color: #666; }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }
            .stat-box {
                background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 8px;
                padding: 15px;
                text-align: center;
            }
            .stat-value {
                font-family: 'Cinzel', serif;
                font-size: 24px;
                font-weight: 700;
                color: #FFD700;
                display: block;
            }
            .stat-label {
                font-size: 11px;
                color: #BDB76B;
                text-transform: uppercase;
                margin-top: 5px;
            }
        </style>
    `;
};

module.init = function() {
    loadData();
    
    document.querySelectorAll('.commerce-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            changerVue(this.getAttribute('data-view'));
        });
    });
    
    const btnCreerPlan = document.getElementById('commerce-btn-creer-plan');
    if (btnCreerPlan) btnCreerPlan.onclick = creerPlan;
    
    const btnAjouterSource = document.getElementById('commerce-btn-ajouter-source');
    if (btnAjouterSource) btnAjouterSource.onclick = ajouterSourceAuPlan;
    
    const btnRetour = document.getElementById('commerce-btn-retour');
    if (btnRetour) btnRetour.onclick = function() { changerVue('plans'); };
    
    const btnSauver = document.getElementById('commerce-btn-sauver-plan');
    if (btnSauver) btnSauver.onclick = sauvegarderPlanEdite;
    
    const btnSend = document.getElementById('commerce-send');
    if (btnSend) btnSend.onclick = sendResources;
    
    const btnMax = document.getElementById('commerce-max');
    if (btnMax) btnMax.onclick = fillMaxResources;
    
    const editSource = document.getElementById('commerce-edit-source');
    if (editSource) editSource.onchange = majCapaciteEdition;
    
    ['commerce-edit-wood', 'commerce-edit-stone', 'commerce-edit-iron'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.oninput = validerTotalEdition;
    });
    
    ['commerce-wood', 'commerce-stone', 'commerce-iron'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.oninput = validerTotalManuel;
    });
    
    majListePlans();
    setupTownChangeObserver();
    
    for (let planId in commerceData.plansActifs) {
        if (commerceData.plansActifs[planId]) {
            demarrerPlan(planId);
            break;
        }
    }
    
    log('COMMERCE', 'Module initialise - ' + commerceData.plans.length + ' plans', 'info');
};

module.isActive = function() {
    for (let planId in commerceData.plansActifs) {
        if (commerceData.plansActifs[planId]) return true;
    }
    return false;
};

module.onActivate = function(container) {
    majListePlans();
    if (document.getElementById('commerce-view-manuel')?.classList.contains('active')) {
        majVueManuelle();
    }
};

function changerVue(vue) {
    document.querySelectorAll('.commerce-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.commerce-view').forEach(function(v) { v.classList.remove('active'); });
    
    const tab = document.querySelector('.commerce-tab[data-view="' + vue + '"]');
    const view = document.getElementById('commerce-view-' + vue);
    
    if (tab) tab.classList.add('active');
    if (view) view.classList.add('active');
    
    if (vue === 'plans') {
        document.getElementById('commerce-tab-edition').style.display = 'none';
        planEnEdition = null;
        majListePlans();
    } else if (vue === 'nouveau') {
        remplirSelectVilles('commerce-new-dest');
    } else if (vue === 'manuel') {
        majVueManuelle();
    }
}

function majVueManuelle() {
    const villes = getVillesJoueur();
    const currentId = getCurrentCityId();
    
    const select = document.getElementById('commerce-dest');
    if (select) {
        select.innerHTML = villes.filter(v => v.id !== currentId)
            .map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    }
    
    const res = getResources();
    document.getElementById('commerce-res-wood').textContent = res.wood;
    document.getElementById('commerce-res-stone').textContent = res.stone;
    document.getElementById('commerce-res-iron').textContent = res.iron;
    
    document.getElementById('commerce-manuel-ville').textContent = getCurrentTownName();
    
    const maxCap = getTradeCapacity();
    const usedCap = getTradesInProgress();
    const availCap = maxCap - usedCap;
    const pct = Math.round((usedCap / maxCap) * 100);
    
    document.getElementById('commerce-manuel-capacity').textContent = 
        `Marche Niv.${getMarketplaceLevel()} - Capacite: ${availCap}/${maxCap}`;
    
    const barContainer = document.getElementById('commerce-manuel-capacity-bar');
    let fillClass = pct < 70 ? '' : (pct < 90 ? 'warning' : 'error');
    barContainer.innerHTML = `
        <div class="commerce-capacity-label">
            <span>Capacite d'echange utilisee</span>
            <span>${usedCap} / ${maxCap}</span>
        </div>
        <div class="commerce-capacity-bar">
            <div class="commerce-capacity-fill ${fillClass}" style="width: ${pct}%"></div>
            <span class="commerce-capacity-text">${pct}% utilise - ${availCap} disponible</span>
        </div>
    `;
    
    validerTotalManuel();
}

function validerTotalManuel() {
    const wood = parseInt(document.getElementById('commerce-wood')?.value) || 0;
    const stone = parseInt(document.getElementById('commerce-stone')?.value) || 0;
    const iron = parseInt(document.getElementById('commerce-iron')?.value) || 0;
    const total = wood + stone + iron;
    
    const availCap = getAvailableTradeCapacity();
    const validation = document.getElementById('commerce-manuel-validation');
    
    if (!validation) return;
    
    if (total === 0) {
        validation.innerHTML = '';
        validation.className = 'commerce-total-validation';
    } else if (total <= availCap) {
        validation.innerHTML = `✅ Total: ${total} ressources (capacite disponible: ${availCap})`;
        validation.className = 'commerce-total-validation valid';
    } else {
        validation.innerHTML = `❌ Total: ${total} ressources - Depasse la capacite de ${total - availCap}!`;
        validation.className = 'commerce-total-validation invalid';
    }
}

function remplirSelectVilles(selectId, excludeId) {
    const villes = getVillesJoueur();
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = villes
        .filter(v => !excludeId || v.id !== excludeId)
        .map(v => `<option value="${v.id}">${v.name}</option>`).join('');
}

function majListePlans() {
    const container = document.getElementById('commerce-plans-liste');
    if (!container) return;
    
    if (commerceData.plans.length === 0) {
        container.innerHTML = '<div class="commerce-empty">' +
            '<div class="commerce-empty-icon">📋</div>' +
            '<div class="commerce-empty-text">Aucun plan de commerce</div>' +
            '<div class="commerce-empty-hint">Cliquez sur "Nouveau Plan" pour commencer</div>' +
        '</div>';
        return;
    }
    
    container.innerHTML = '';
    
    commerceData.plans.forEach(function(plan, index) {
        const planActif = commerceData.plansActifs[plan.id] === true;
        const statusClass = planActif ? 'commerce-plan-actif' : '';
        const btnToggleClass = planActif ? 'commerce-btn-danger' : 'commerce-btn-success';
        const btnToggleText = planActif ? '⏹️ Stop' : '▶️ Start';
        const modeIcon = plan.mode === 'loop' ? '🔄' : '1️⃣';
        const modeText = plan.mode === 'loop' ? 'Boucle' : 'Unique';
        
        const div = document.createElement('div');
        div.className = 'commerce-plan-item ' + statusClass;
        div.innerHTML = 
            '<div class="commerce-plan-header">' +
                '<div>' +
                    '<div class="commerce-plan-name">' + modeIcon + ' ' + plan.nom + 
                        (planActif ? ' <span style="color:#4CAF50;font-size:10px;">(ACTIF)</span>' : '') + '</div>' +
                    '<div class="commerce-plan-target">Destination: ' + getTownName(plan.destinationId) + '</div>' +
                '</div>' +
                '<div class="commerce-plan-actions">' +
                    '<button class="commerce-btn ' + btnToggleClass + ' commerce-btn-sm btn-toggle" data-id="' + plan.id + '">' + btnToggleText + '</button>' +
                    '<button class="commerce-btn commerce-btn-primary commerce-btn-sm btn-edit" data-index="' + index + '">✏️</button>' +
                    '<button class="commerce-btn commerce-btn-danger commerce-btn-sm btn-suppr" data-index="' + index + '">🗑️</button>' +
                '</div>' +
            '</div>' +
            '<div class="commerce-plan-stats">' +
                '<span>🏰 ' + plan.sources.length + ' sources</span>' +
                '<span>⏱️ Delai: ' + formatDelai(plan.delai) + '</span>' +
                '<span>📦 Mode: ' + modeText + '</span>' +
            '</div>';
        container.appendChild(div);
    });
    
    container.querySelectorAll('.btn-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            togglePlan(this.getAttribute('data-id'));
        });
    });
    
    container.querySelectorAll('.btn-edit').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editerPlan(parseInt(this.getAttribute('data-index')));
        });
    });
    
    container.querySelectorAll('.btn-suppr').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-index'));
            const plan = commerceData.plans[idx];
            if (commerceData.plansActifs[plan.id]) {
                log('COMMERCE', 'Arretez le plan avant de le supprimer', 'warning');
                return;
            }
            if (confirm('Supprimer le plan "' + plan.nom + '" ?')) {
                delete commerceData.plansActifs[plan.id];
                commerceData.plans.splice(idx, 1);
                saveData();
                majListePlans();
                log('COMMERCE', 'Plan supprime', 'info');
            }
        });
    });
}

function togglePlan(planId) {
    const plan = commerceData.plans.find(function(p) { return p.id === planId; });
    if (!plan) return;
    
    if (commerceData.plansActifs[planId]) {
        commerceData.plansActifs[planId] = false;
        arreterPlan(planId);
        log('COMMERCE', 'Plan "' + plan.nom + '" arrete', 'info');
        majStatus('Plan arrete');
    } else {
        for (let id in commerceData.plansActifs) {
            if (commerceData.plansActifs[id]) {
                commerceData.plansActifs[id] = false;
                arreterPlan(id);
            }
        }
        
        commerceData.plansActifs[planId] = true;
        plan.sources.forEach(function(s) { s.status = 'attente'; });
        demarrerPlan(planId);
        log('COMMERCE', 'Plan "' + plan.nom + '" demarre', 'success');
        majStatus('Plan en cours: ' + plan.nom);
    }
    
    saveData();
    majListePlans();
    
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function demarrerPlan(planId) {
    const plan = commerceData.plans.find(function(p) { return p.id === planId; });
    if (!plan) return;
    
    commerceData.planEnCours = {
        planId: planId,
        sourceIndex: 0,
        cycleCount: 0
    };
    
    executerProchainEnvoi();
}

function arreterPlan(planId) {
    if (commerceData.planEnCours && commerceData.planEnCours.planId === planId) {
        if (commerceData.planEnCours.timeout) {
            clearTimeout(commerceData.planEnCours.timeout);
        }
        commerceData.planEnCours = null;
    }
}

function executerProchainEnvoi() {
    if (!commerceData.planEnCours) return;
    
    const plan = commerceData.plans.find(function(p) { return p.id === commerceData.planEnCours.planId; });
    if (!plan || !commerceData.plansActifs[plan.id]) {
        commerceData.planEnCours = null;
        return;
    }
    
    if (plan.sources.length === 0) {
        log('COMMERCE', 'Aucune source dans le plan', 'warning');
        commerceData.plansActifs[plan.id] = false;
        commerceData.planEnCours = null;
        saveData();
        majListePlans();
        return;
    }
    
    const sourceIndex = commerceData.planEnCours.sourceIndex;
    const source = plan.sources[sourceIndex];
    
    if (!source) {
        if (plan.mode === 'once') {
            log('COMMERCE', 'Plan termine (mode unique)', 'success');
            commerceData.plansActifs[plan.id] = false;
            commerceData.planEnCours = null;
            majStatus('Plan termine');
        } else {
            commerceData.planEnCours.sourceIndex = 0;
            commerceData.planEnCours.cycleCount++;
            log('COMMERCE', 'Nouveau cycle #' + commerceData.planEnCours.cycleCount, 'info');
        }
        saveData();
        majListePlans();
        
        if (commerceData.planEnCours) {
            commerceData.planEnCours.timeout = setTimeout(executerProchainEnvoi, plan.delai);
        }
        return;
    }
    
    majStatus('Envoi depuis ' + getTownName(source.sourceId) + '...');
    
    envoyerRessources(source.sourceId, plan.destinationId, source.wood, source.stone, source.iron, function(success) {
        if (success) {
            source.status = 'envoye';
            commerceData.stats.totalTrades++;
            commerceData.stats.resourcesMoved += source.wood + source.stone + source.iron;
            log('COMMERCE', 'Envoi reussi: ' + getTownName(source.sourceId) + ' -> ' + getTownName(plan.destinationId), 'success');
        } else {
            source.status = 'erreur';
            log('COMMERCE', 'Erreur envoi: ' + getTownName(source.sourceId), 'error');
        }
        
        commerceData.planEnCours.sourceIndex++;
        saveData();
        updateStats();
        
        if (commerceData.plansActifs[plan.id]) {
            commerceData.planEnCours.timeout = setTimeout(executerProchainEnvoi, plan.delai);
            majStatus('Prochain envoi dans ' + formatDelai(plan.delai));
        }
    });
}

function envoyerRessources(sourceId, destId, wood, stone, iron, callback) {
    const availCap = getAvailableTradeCapacity(sourceId);
    const total = wood + stone + iron;
    
    if (total > availCap) {
        log('COMMERCE', 'Capacite insuffisante: ' + total + ' > ' + availCap, 'warning');
        callback(false);
        return;
    }
    
    const res = getResources(sourceId);
    const actualWood = Math.min(wood, res.wood);
    const actualStone = Math.min(stone, res.stone);
    const actualIron = Math.min(iron, res.iron);
    
    if (actualWood + actualStone + actualIron === 0) {
        log('COMMERCE', 'Pas assez de ressources dans ' + getTownName(sourceId), 'warning');
        callback(false);
        return;
    }
    
    const csrfToken = uw.Game.csrfToken;
    const data = {
        id: destId,
        wood: actualWood,
        stone: actualStone,
        iron: actualIron
    };
    
    uw.$.ajax({
        type: 'POST',
        url: '/game/town_overviews?town_id=' + sourceId + '&action=trade&h=' + csrfToken,
        data: { json: JSON.stringify(data) },
        dataType: 'json',
        success: function(response) {
            if (response?.json?.error) {
                log('COMMERCE', 'Erreur serveur: ' + response.json.error, 'error');
                callback(false);
                return;
            }
            callback(true);
        },
        error: function() {
            log('COMMERCE', 'Erreur AJAX', 'error');
            callback(false);
        }
    });
}

function creerPlan() {
    const nom = document.getElementById('commerce-new-nom').value.trim();
    const destId = parseInt(document.getElementById('commerce-new-dest').value);
    const delai = parseInt(document.getElementById('commerce-new-delai').value);
    const mode = document.getElementById('commerce-new-mode').value;
    
    if (!nom) {
        log('COMMERCE', 'Entrez un nom pour le plan', 'warning');
        return;
    }
    if (!destId) {
        log('COMMERCE', 'Selectionnez une destination', 'warning');
        return;
    }
    
    const plan = {
        id: genererID(),
        nom: nom,
        destinationId: destId,
        delai: delai,
        mode: mode,
        sources: [],
        dateCreation: Date.now()
    };
    
    commerceData.plans.push(plan);
    saveData();
    
    document.getElementById('commerce-new-nom').value = '';
    
    editerPlan(commerceData.plans.length - 1);
    log('COMMERCE', 'Plan "' + nom + '" cree', 'success');
}

function editerPlan(index) {
    const plan = commerceData.plans[index];
    if (!plan) return;
    
    planEnEdition = index;
    
    document.getElementById('commerce-tab-edition').style.display = 'block';
    document.getElementById('commerce-edit-plan-id').value = plan.id;
    document.getElementById('commerce-edit-plan-nom').textContent = plan.nom;
    document.getElementById('commerce-edit-nom').value = plan.nom;
    document.getElementById('commerce-edit-delai').value = plan.delai;
    document.getElementById('commerce-edit-mode').value = plan.mode;
    
    remplirSelectVilles('commerce-edit-dest');
    document.getElementById('commerce-edit-dest').value = plan.destinationId;
    
    remplirSelectVilles('commerce-edit-source', plan.destinationId);
    
    majCapaciteEdition();
    majSourcesPlan();
    
    changerVue('edition');
}

function majCapaciteEdition() {
    const sourceId = parseInt(document.getElementById('commerce-edit-source')?.value);
    if (!sourceId) return;
    
    const maxCap = getTradeCapacity(sourceId);
    const usedCap = getTradesInProgress(sourceId);
    const availCap = maxCap - usedCap;
    const res = getResources(sourceId);
    const pct = Math.round((usedCap / maxCap) * 100);
    
    let fillClass = pct < 70 ? '' : (pct < 90 ? 'warning' : 'error');
    
    const container = document.getElementById('commerce-capacity-info');
    container.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#F5DEB3;">${getTownName(sourceId)}</span>
            <span style="color:#8B8B83;">Marche Niv.${getMarketplaceLevel(sourceId)}</span>
        </div>
        <div class="commerce-capacity-label">
            <span>Capacite d'echange</span>
            <span>${availCap} / ${maxCap} disponible</span>
        </div>
        <div class="commerce-capacity-bar">
            <div class="commerce-capacity-fill ${fillClass}" style="width: ${pct}%"></div>
            <span class="commerce-capacity-text">${pct}% utilise</span>
        </div>
        <div style="display:flex;justify-content:space-around;margin-top:10px;font-size:11px;">
            <span>🪵 ${res.wood}</span>
            <span>🪨 ${res.stone}</span>
            <span>⛏️ ${res.iron}</span>
        </div>
    `;
    
    validerTotalEdition();
}

function validerTotalEdition() {
    const sourceId = parseInt(document.getElementById('commerce-edit-source')?.value);
    const wood = parseInt(document.getElementById('commerce-edit-wood')?.value) || 0;
    const stone = parseInt(document.getElementById('commerce-edit-stone')?.value) || 0;
    const iron = parseInt(document.getElementById('commerce-edit-iron')?.value) || 0;
    const total = wood + stone + iron;
    
    const availCap = sourceId ? getAvailableTradeCapacity(sourceId) : 0;
    const validation = document.getElementById('commerce-total-validation');
    
    if (!validation) return;
    
    if (total === 0) {
        validation.innerHTML = '';
        validation.className = 'commerce-total-validation';
    } else if (total <= availCap) {
        validation.innerHTML = `✅ Total: ${total} ressources (capacite: ${availCap})`;
        validation.className = 'commerce-total-validation valid';
    } else {
        validation.innerHTML = `❌ Total: ${total} - Depasse la capacite de ${total - availCap}!`;
        validation.className = 'commerce-total-validation invalid';
    }
}

function ajouterSourceAuPlan() {
    if (planEnEdition === null) return;
    
    const plan = commerceData.plans[planEnEdition];
    if (!plan) return;
    
    const sourceId = parseInt(document.getElementById('commerce-edit-source').value);
    const wood = parseInt(document.getElementById('commerce-edit-wood').value) || 0;
    const stone = parseInt(document.getElementById('commerce-edit-stone').value) || 0;
    const iron = parseInt(document.getElementById('commerce-edit-iron').value) || 0;
    const total = wood + stone + iron;
    
    if (!sourceId) {
        log('COMMERCE', 'Selectionnez une ville source', 'warning');
        return;
    }
    
    if (total === 0) {
        log('COMMERCE', 'Entrez des ressources a envoyer', 'warning');
        return;
    }
    
    const availCap = getAvailableTradeCapacity(sourceId);
    if (total > availCap) {
        log('COMMERCE', 'Total depasse la capacite d\'echange!', 'error');
        return;
    }
    
    if (sourceId === plan.destinationId) {
        log('COMMERCE', 'La source ne peut pas etre la destination', 'warning');
        return;
    }
    
    const existing = plan.sources.find(function(s) { return s.sourceId === sourceId; });
    if (existing) {
        existing.wood = wood;
        existing.stone = stone;
        existing.iron = iron;
        existing.status = 'attente';
        log('COMMERCE', 'Source mise a jour: ' + getTownName(sourceId), 'info');
    } else {
        plan.sources.push({
            sourceId: sourceId,
            wood: wood,
            stone: stone,
            iron: iron,
            status: 'attente'
        });
        log('COMMERCE', 'Source ajoutee: ' + getTownName(sourceId), 'success');
    }
    
    document.getElementById('commerce-edit-wood').value = 0;
    document.getElementById('commerce-edit-stone').value = 0;
    document.getElementById('commerce-edit-iron').value = 0;
    
    saveData();
    majSourcesPlan();
    validerTotalEdition();
}

function majSourcesPlan() {
    if (planEnEdition === null) return;
    
    const plan = commerceData.plans[planEnEdition];
    if (!plan) return;
    
    document.getElementById('commerce-edit-sources-count').textContent = plan.sources.length;
    
    const container = document.getElementById('commerce-edit-sources-liste');
    if (!container) return;
    
    if (plan.sources.length === 0) {
        container.innerHTML = '<div class="commerce-empty">' +
            '<div class="commerce-empty-icon">🏰</div>' +
            '<div class="commerce-empty-text">Aucune source</div>' +
            '<div class="commerce-empty-hint">Ajoutez des villes sources ci-dessus</div>' +
        '</div>';
        return;
    }
    
    container.innerHTML = '';
    
    plan.sources.forEach(function(source, index) {
        const statusClass = source.status === 'envoye' ? 'commerce-status-envoye' : 
                           (source.status === 'erreur' ? 'commerce-status-erreur' : 'commerce-status-attente');
        const statusText = source.status === 'envoye' ? 'Envoye' : 
                          (source.status === 'erreur' ? 'Erreur' : 'En attente');
        
        const div = document.createElement('div');
        div.className = 'commerce-source-item';
        div.innerHTML = 
            '<div class="commerce-source-ville">' +
                '<div class="commerce-source-ville-name">🏰 ' + getTownName(source.sourceId) + '</div>' +
                '<div class="commerce-source-ville-res">🪵 ' + source.wood + ' | 🪨 ' + source.stone + ' | ⛏️ ' + source.iron + '</div>' +
            '</div>' +
            '<span class="commerce-source-status ' + statusClass + '">' + statusText + '</span>' +
            '<button class="commerce-btn commerce-btn-danger commerce-btn-sm btn-suppr-source" data-index="' + index + '">🗑️</button>';
        container.appendChild(div);
    });
    
    container.querySelectorAll('.btn-suppr-source').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-index'));
            plan.sources.splice(idx, 1);
            saveData();
            majSourcesPlan();
            log('COMMERCE', 'Source supprimee', 'info');
        });
    });
}

function sauvegarderPlanEdite() {
    if (planEnEdition === null) return;
    
    const plan = commerceData.plans[planEnEdition];
    if (!plan) return;
    
    plan.nom = document.getElementById('commerce-edit-nom').value.trim() || plan.nom;
    plan.destinationId = parseInt(document.getElementById('commerce-edit-dest').value);
    plan.delai = parseInt(document.getElementById('commerce-edit-delai').value);
    plan.mode = document.getElementById('commerce-edit-mode').value;
    
    saveData();
    log('COMMERCE', 'Plan "' + plan.nom + '" sauvegarde', 'success');
    changerVue('plans');
}

function sendResources() {
    const destId = parseInt(document.getElementById('commerce-dest').value);
    const wood = parseInt(document.getElementById('commerce-wood').value) || 0;
    const stone = parseInt(document.getElementById('commerce-stone').value) || 0;
    const iron = parseInt(document.getElementById('commerce-iron').value) || 0;
    const total = wood + stone + iron;
    
    if (!destId) {
        log('COMMERCE', 'Selectionnez une destination', 'warning');
        return;
    }
    
    if (total === 0) {
        log('COMMERCE', 'Entrez des ressources a envoyer', 'warning');
        return;
    }
    
    const sourceId = getCurrentCityId();
    const availCap = getAvailableTradeCapacity(sourceId);
    
    if (total > availCap) {
        log('COMMERCE', 'Depasse la capacite! Max: ' + availCap, 'error');
        return;
    }
    
    envoyerRessources(sourceId, destId, wood, stone, iron, function(success) {
        if (success) {
            log('COMMERCE', 'Envoi reussi: ' + wood + ' bois, ' + stone + ' pierre, ' + iron + ' argent', 'success');
            document.getElementById('commerce-wood').value = 0;
            document.getElementById('commerce-stone').value = 0;
            document.getElementById('commerce-iron').value = 0;
            updateStats();
            majVueManuelle();
        }
    });
}

function fillMaxResources() {
    const sourceId = getCurrentCityId();
    const res = getResources(sourceId);
    const availCap = getAvailableTradeCapacity(sourceId);
    const minKeep = Math.floor(getStorageCapacity(sourceId) * 0.1);
    
    let wood = Math.max(0, res.wood - minKeep);
    let stone = Math.max(0, res.stone - minKeep);
    let iron = Math.max(0, res.iron - minKeep);
    
    let total = wood + stone + iron;
    if (total > availCap) {
        const ratio = availCap / total;
        wood = Math.floor(wood * ratio);
        stone = Math.floor(stone * ratio);
        iron = Math.floor(iron * ratio);
    }
    
    document.getElementById('commerce-wood').value = wood;
    document.getElementById('commerce-stone').value = stone;
    document.getElementById('commerce-iron').value = iron;
    
    validerTotalManuel();
    log('COMMERCE', 'Maximum calcule (capacite: ' + availCap + ')', 'info');
}

function updateStats() {
    const trades = document.getElementById('commerce-stat-trades');
    const resources = document.getElementById('commerce-stat-resources');
    if (trades) trades.textContent = commerceData.stats.totalTrades;
    if (resources) resources.textContent = commerceData.stats.resourcesMoved;
}

function majStatus(text) {
    const el = document.getElementById('commerce-status');
    if (el) el.textContent = 'Status: ' + text;
}

function setupTownChangeObserver() {
    if (uw.$?.Observer && uw.GameEvents) {
        uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(function() {
            setTimeout(function() {
                if (document.getElementById('commerce-view-manuel')?.classList.contains('active')) {
                    majVueManuelle();
                }
                if (planEnEdition !== null) {
                    majCapaciteEdition();
                }
            }, 500);
        });
    }
}

function saveData() {
    GM_setValue(STORAGE_KEY, JSON.stringify(commerceData));
}

function loadData() {
    const saved = GM_getValue(STORAGE_KEY);
    if (saved) {
        try {
            const d = JSON.parse(saved);
            commerceData = { ...commerceData, ...d };
            commerceData.planEnCours = null;
        } catch(e) {}
    }
}
