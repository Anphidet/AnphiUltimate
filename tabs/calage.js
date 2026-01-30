const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

const STORAGE_KEY = 'gu_calage_data';
const INTERVALLE_VERIFICATION = 200;
const TIMEOUT_VERIFICATION = 10000;
const AVANCE_LANCEMENT = 15000;

let calageData = {
    attaques: [],
    attaqueEnCours: null,
    botActif: false,
    intervalCheck: null,
    plans: [],
    settings: { webhook: '' }
};

let notifId = 0;
let notifsContainer = null;
let dernieresNotifs = {};
let dernierLogCheck = 0;
let calculEnCours = {};

const GROUND_UNITS = ['sword', 'slinger', 'archer', 'hoplite', 'rider', 'chariot', 'catapult', 'minotaur', 'manticore', 'centaur', 'pegasus', 'harpy', 'medusa', 'zyklop', 'cerberus', 'fury', 'griffin', 'calydonian_boar', 'godsent', 'satyr', 'spartoi', 'ladon', 'siren'];
const NAVAL_UNITS = ['big_transporter', 'bireme', 'attack_ship', 'demolition_ship', 'small_transporter', 'trireme', 'colonize_ship', 'sea_monster'];
const TRANSPORT_SHIPS = ['big_transporter', 'small_transporter'];

function getCurrentCityId() { try { return uw.ITowns.getCurrentTown().id; } catch(e) { return null; } }
function getResearches(townId) { 
    try { 
        const town = uw.ITowns.getTown(townId || uw.Game.townId);
        return town?.researches ? town.researches()?.attributes || {} : {}; 
    } catch(e) { return {}; } 
}
function hasResearch(townId, researchId) {
    const r = getResearches(townId);
    return r[researchId] === true || r[researchId] === 1;
}

function getUnitPopulation(unitId) {
    try {
        const unitData = uw.GameData.units[unitId];
        return unitData?.population || 1;
    } catch(e) { return 1; }
}

function getTransportCapacity(townId) {
    const hasBoatExpansion = hasResearch(townId, 'ship_transport');
    return {
        big_transporter: hasBoatExpansion ? 26 : 20,
        small_transporter: hasBoatExpansion ? 13 : 10
    };
}

function calculateRequiredBoats(units, townId) {
    let totalPop = 0;
    for (const unitId in units) {
        if (units.hasOwnProperty(unitId) && units[unitId] > 0) {
            if (GROUND_UNITS.includes(unitId)) {
                totalPop += getUnitPopulation(unitId) * units[unitId];
            }
        }
    }
    
    if (totalPop === 0) {
        return {
            totalPop: 0,
            totalCapacity: 0,
            hasEnoughBoats: true,
            neededCapacity: 0,
            percentage: 100
        };
    }
    
    const capacity = getTransportCapacity(townId);
    const bigCap = capacity.big_transporter;
    const smallCap = capacity.small_transporter;
    
    const bigBoats = units['big_transporter'] || 0;
    const smallBoats = units['small_transporter'] || 0;
    const totalCapacity = (bigBoats * bigCap) + (smallBoats * smallCap);
    
    return {
        totalPop,
        totalCapacity,
        bigBoatCap: bigCap,
        smallBoatCap: smallCap,
        hasEnoughBoats: totalCapacity >= totalPop,
        neededCapacity: Math.max(0, totalPop - totalCapacity),
        percentage: totalPop > 0 ? Math.min(100, Math.round((totalCapacity / totalPop) * 100)) : 100
    };
}

function getUnitesDispo(townId) {
    try {
        if (uw.ITowns && uw.ITowns.getTown) {
            const town = uw.ITowns.getTown(townId || uw.Game.townId);
            if (town && town.units) {
                return town.units();
            }
        }
    } catch (e) {}
    return {};
}

function getAvailableUnitsForTown(townId) {
    const units = getUnitesDispo(townId);
    const available = [];
    
    for (const unitId in units) {
        if (units.hasOwnProperty(unitId) && units[unitId] > 0) {
            const unitData = uw.GameData.units[unitId];
            if (unitData && unitId !== 'militia') {
                available.push({
                    id: unitId,
                    name: unitData.name,
                    count: units[unitId],
                    isNaval: NAVAL_UNITS.includes(unitId),
                    isTransport: TRANSPORT_SHIPS.includes(unitId),
                    pop: unitData.population || 1
                });
            }
        }
    }
    
    available.sort((a, b) => {
        if (a.isNaval !== b.isNaval) return a.isNaval ? 1 : -1;
        return a.name.localeCompare(b.name);
    });
    
    return available;
}

function hasGroundUnits(units) {
    for (const unitId in units) {
        if (units.hasOwnProperty(unitId) && units[unitId] > 0) {
            if (GROUND_UNITS.includes(unitId)) {
                return true;
            }
        }
    }
    return false;
}

function hasBoatsSelected(units) {
    return (units['big_transporter'] || 0) > 0 || (units['small_transporter'] || 0) > 0;
}

function getSlowestUnit(units) {
    let slowestSpeed = Infinity;
    let slowestUnit = null;
    
    for (const unitId in units) {
        if (units[unitId] > 0) {
            const unitData = uw.GameData.units[unitId];
            if (unitData && unitData.speed) {
                if (unitData.speed < slowestSpeed) {
                    slowestSpeed = unitData.speed;
                    slowestUnit = unitId;
                }
            }
        }
    }
    
    return slowestUnit;
}

function getUnitSpeed(unitId) {
    try {
        return uw.GameData.units[unitId]?.speed || 1;
    } catch(e) { return 1; }
}

function getTownCoords(townId) {
    try {
        const town = uw.ITowns.getTown(townId);
        if (town) {
            const x = town.getIslandCoordinateX ? town.getIslandCoordinateX() : town.attributes?.island_x;
            const y = town.getIslandCoordinateY ? town.getIslandCoordinateY() : town.attributes?.island_y;
            return { x, y };
        }
    } catch(e) {}
    return null;
}

function formatDuration(ms) {
    const totalSec = Math.floor(Math.abs(ms) / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatTime(date) {
    if (typeof date === 'number') {
        date = new Date(date);
    }
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return h + ':' + m + ':' + s;
}

function getTimeInMs(timeStr) {
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    const second = parseInt(parts[2] || '0', 10);
    const date = new Date();
    date.setHours(hour, minute, second, 0);
    return date.getTime();
}

module.render = function(container) {
    container.innerHTML = `
        <div class="calage-tabs">
            <button class="calage-tab active" data-view="plans">📋 Mes Plans</button>
            <button class="calage-tab" data-view="nouveau">+ Nouveau Plan</button>
            <button class="calage-tab" data-view="edition" id="calage-tab-edition" style="display:none;">✏️ Edition</button>
        </div>
        
        <div class="calage-content">
            <!-- Vue Mes Plans -->
            <div class="calage-view active" id="calage-view-plans">
                <div id="calage-plans-liste"></div>
            </div>
            
            <!-- Vue Nouveau Plan -->
            <div class="calage-view" id="calage-view-nouveau">
                <div class="calage-section">
                    <h3>📝 Creer un nouveau plan</h3>
                    <div class="calage-row">
                        <label>Nom du plan:</label>
                        <input type="text" id="calage-new-nom" class="calage-input" placeholder="Ex: Colo joueur X">
                    </div>
                    <div class="calage-row">
                        <label>Type:</label>
                        <select id="calage-new-type" class="calage-select">
                            <option value="attack">⚔️ Attaque</option>
                            <option value="support">🛡️ Soutien</option>
                        </select>
                    </div>
                    <div class="calage-row">
                        <label>Ville cible (ID):</label>
                        <input type="number" id="calage-new-cible" class="calage-input" placeholder="ID de la ville cible">
                    </div>
                    <div class="calage-row">
                        <label>Tolerance:</label>
                        <div class="calage-tolerance">
                            <select id="calage-new-tol-moins" class="calage-select calage-select-small">
                                <option value="0">0s</option>
                                <option value="-1">-1s</option>
                                <option value="-2">-2s</option>
                                <option value="-3">-3s</option>
                            </select>
                            <span>a</span>
                            <select id="calage-new-tol-plus" class="calage-select calage-select-small">
                                <option value="0">0s</option>
                                <option value="1">+1s</option>
                                <option value="2">+2s</option>
                                <option value="3">+3s</option>
                            </select>
                        </div>
                    </div>
                    <div class="calage-row calage-row-right">
                        <button class="calage-btn calage-btn-primary" id="calage-btn-creer-plan">Creer le plan</button>
                    </div>
                </div>
            </div>
            
            <!-- Vue Edition Plan -->
            <div class="calage-view" id="calage-view-edition">
                <div class="calage-section">
                    <h3>✏️ Editer le plan: <span id="calage-edit-plan-nom"></span></h3>
                    <input type="hidden" id="calage-edit-plan-id">
                    <div class="calage-row">
                        <label>Nom:</label>
                        <input type="text" id="calage-edit-nom" class="calage-input">
                    </div>
                    <div class="calage-row">
                        <label>Ville cible (ID):</label>
                        <input type="number" id="calage-edit-cible" class="calage-input">
                    </div>
                    <div class="calage-row">
                        <label>Tolerance:</label>
                        <div class="calage-tolerance">
                            <select id="calage-edit-tol-moins" class="calage-select calage-select-small">
                                <option value="0">0s</option>
                                <option value="-1">-1s</option>
                                <option value="-2">-2s</option>
                                <option value="-3">-3s</option>
                            </select>
                            <span>a</span>
                            <select id="calage-edit-tol-plus" class="calage-select calage-select-small">
                                <option value="0">0s</option>
                                <option value="1">+1s</option>
                                <option value="2">+2s</option>
                                <option value="3">+3s</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="calage-section">
                    <h3>🏰 Ajouter une attaque</h3>
                    <div class="calage-row">
                        <label>Ville source:</label>
                        <select id="calage-edit-source" class="calage-select"></select>
                    </div>
                    <div class="calage-row">
                        <label>Heure d'arrivee:</label>
                        <input type="time" id="calage-edit-heure" class="calage-input" step="1">
                    </div>
                    
                    <div class="calage-units-title">🗡️ Unites terrestres</div>
                    <div class="calage-units-grid" id="calage-edit-units-terre"></div>
                    
                    <div class="calage-units-title">⚓ Unites navales</div>
                    <div class="calage-units-grid" id="calage-edit-units-naval"></div>
                    
                    <div id="calage-capacity-container" class="calage-capacity" style="display:none;">
                        <div class="calage-capacity-label">
                            <span>Capacite de transport</span>
                            <span id="calage-capacity-text">0 / 0</span>
                        </div>
                        <div class="calage-capacity-bar">
                            <div class="calage-capacity-fill" id="calage-capacity-fill" style="width: 0%"></div>
                        </div>
                    </div>
                    
                    <div class="calage-row calage-row-right">
                        <button class="calage-btn calage-btn-success" id="calage-btn-ajouter-attaque">+ Ajouter cette attaque</button>
                    </div>
                </div>
                
                <div class="calage-section">
                    <h3>📋 Attaques du plan (<span id="calage-edit-attaques-count">0</span>)</h3>
                    <div id="calage-edit-attaques-liste"></div>
                </div>
                
                <div class="calage-row calage-row-between">
                    <button class="calage-btn calage-btn-secondary" id="calage-btn-retour">← Retour</button>
                    <button class="calage-btn calage-btn-primary" id="calage-btn-sauver-plan">💾 Sauvegarder</button>
                </div>
            </div>
        </div>
        
        <div class="calage-status-bar">
            <span id="calage-status">Status: En attente</span>
            <button class="calage-btn calage-btn-success calage-btn-sm" id="calage-btn-toggle-bot">▶️ Demarrer</button>
        </div>

        <style>
            .calage-tabs {
                display: flex;
                gap: 5px;
                padding: 10px 0;
                margin-bottom: 15px;
                border-bottom: 1px solid rgba(212,175,55,0.3);
            }
            .calage-tab {
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
            .calage-tab:hover { background: rgba(212,175,55,0.2); color: #F5DEB3; }
            .calage-tab.active { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; }
            
            .calage-content { min-height: 300px; }
            .calage-view { display: none; }
            .calage-view.active { display: block; }
            
            .calage-section {
                background: rgba(0,0,0,0.25);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 10px;
                padding: 15px;
                margin-bottom: 15px;
            }
            .calage-section h3 {
                margin: 0 0 15px 0;
                font-size: 14px;
                color: #D4AF37;
                font-family: 'Cinzel', serif;
                border-bottom: 1px solid rgba(212,175,55,0.2);
                padding-bottom: 10px;
            }
            
            .calage-row {
                display: flex;
                gap: 10px;
                margin-bottom: 12px;
                align-items: center;
            }
            .calage-row label {
                width: 140px;
                font-size: 12px;
                color: #BDB76B;
                flex-shrink: 0;
            }
            .calage-row-right { justify-content: flex-end; margin-top: 15px; }
            .calage-row-between { justify-content: space-between; margin-top: 15px; }
            
            .calage-input, .calage-select {
                flex: 1;
                padding: 10px 12px;
                border: 1px solid #8B6914;
                border-radius: 6px;
                background: linear-gradient(180deg, #3D3225 0%, #2D2419 100%);
                color: #F5DEB3;
                font-size: 13px;
                font-family: 'Philosopher', serif;
            }
            .calage-input:focus, .calage-select:focus {
                outline: none;
                border-color: #D4AF37;
                box-shadow: 0 0 10px rgba(212,175,55,0.3);
            }
            .calage-select-small { width: 80px; flex: none; }
            
            .calage-tolerance {
                display: flex;
                gap: 10px;
                align-items: center;
                flex: 1;
            }
            .calage-tolerance span { color: #BDB76B; }
            
            .calage-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                font-family: 'Cinzel', serif;
                transition: all 0.2s;
            }
            .calage-btn:hover { transform: translateY(-2px); }
            .calage-btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
            .calage-btn-success { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; }
            .calage-btn-danger { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; }
            .calage-btn-secondary { background: linear-gradient(135deg, #6c757d 0%, #5a6268 100%); color: white; }
            .calage-btn-warning { background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%); color: black; }
            .calage-btn-sm { padding: 6px 12px; font-size: 11px; }
            
            .calage-status-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 15px;
                background: rgba(0,0,0,0.4);
                border-radius: 8px;
                margin-top: 15px;
            }
            #calage-status { font-size: 12px; color: #BDB76B; }
            
            /* Plans list */
            .calage-plan-item {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 10px;
            }
            .calage-plan-item:hover { border-color: rgba(212,175,55,0.5); }
            .calage-plan-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .calage-plan-name { font-size: 15px; font-weight: bold; color: #F5DEB3; font-family: 'Cinzel', serif; }
            .calage-plan-target { font-size: 11px; color: #8B8B83; margin-top: 3px; }
            .calage-plan-stats { display: flex; gap: 15px; font-size: 11px; color: #BDB76B; }
            .calage-plan-actions { display: flex; gap: 5px; }
            
            /* Units grid */
            .calage-units-title {
                font-size: 12px;
                color: #D4AF37;
                margin: 15px 0 10px 0;
                padding-bottom: 5px;
                border-bottom: 1px solid rgba(212,175,55,0.2);
            }
            .calage-units-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 8px;
            }
            .calage-unit-card {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 6px;
                padding: 8px;
                text-align: center;
                transition: all 0.2s;
            }
            .calage-unit-card:hover { border-color: #D4AF37; }
            .calage-unit-card.has-units { border-color: #4CAF50; background: rgba(76,175,80,0.1); }
            .calage-unit-card .unit-icon {
                width: 36px;
                height: 36px;
                margin: 0 auto 4px;
            }
            .calage-unit-card .unit-name {
                font-size: 9px;
                color: #BDB76B;
                margin-bottom: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .calage-unit-card .unit-dispo {
                font-size: 9px;
                color: #8B8B83;
                margin-bottom: 4px;
            }
            .calage-unit-card input {
                width: 100%;
                padding: 4px;
                text-align: center;
                border: 1px solid #8B6914;
                border-radius: 4px;
                background: #2D2419;
                color: #F5DEB3;
                font-size: 11px;
            }
            
            /* Capacity bar */
            .calage-capacity {
                margin: 15px 0;
                padding: 10px;
                background: rgba(0,0,0,0.3);
                border-radius: 8px;
            }
            .calage-capacity-label {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                color: #BDB76B;
                margin-bottom: 5px;
            }
            .calage-capacity-bar {
                height: 16px;
                background: rgba(0,0,0,0.4);
                border-radius: 8px;
                overflow: hidden;
            }
            .calage-capacity-fill {
                height: 100%;
                background: linear-gradient(90deg, #4CAF50, #8BC34A);
                transition: width 0.3s;
                border-radius: 8px;
            }
            .calage-capacity-fill.warning { background: linear-gradient(90deg, #ffc107, #ffdb4d); }
            .calage-capacity-fill.error { background: linear-gradient(90deg, #dc3545, #ff6b6b); }
            
            /* Attaques list */
            .calage-attaque-item {
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .calage-attaque-item.encours { border-color: #ffc107; background: rgba(255,193,7,0.1); }
            .calage-attaque-item.succes { border-color: #4CAF50; background: rgba(76,175,80,0.1); }
            .calage-attaque-ville { flex: 1; }
            .calage-attaque-ville-name { font-weight: bold; font-size: 12px; color: #F5DEB3; }
            .calage-attaque-ville-units { font-size: 10px; color: #8B8B83; margin-top: 2px; }
            .calage-attaque-heure { font-size: 14px; font-weight: bold; color: #D4AF37; text-align: center; }
            .calage-attaque-heure small { display: block; font-size: 9px; color: #8B8B83; font-weight: normal; }
            .calage-attaque-status {
                padding: 3px 8px;
                border-radius: 10px;
                font-size: 10px;
                font-weight: bold;
            }
            .calage-status-attente { background: #6c757d; color: white; }
            .calage-status-encours { background: #ffc107; color: black; }
            .calage-status-succes { background: #4CAF50; color: white; }
            
            .calage-empty {
                text-align: center;
                padding: 40px 20px;
                color: #8B8B83;
            }
            .calage-empty-icon { font-size: 40px; margin-bottom: 10px; opacity: 0.5; }
            .calage-empty-text { font-size: 13px; }
            .calage-empty-hint { font-size: 11px; margin-top: 8px; color: #666; }
            
            #calage-notifs {
                position: fixed;
                bottom: 80px;
                left: 15px;
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 350px;
                pointer-events: auto;
            }
            .calage-notif {
                background: linear-gradient(135deg, rgba(45,34,23,0.95), rgba(30,23,15,0.95));
                border: 2px solid #D4AF37;
                border-radius: 10px;
                padding: 12px 15px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                cursor: pointer;
                animation: calageSlideIn 0.3s ease;
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: 'Philosopher', Georgia, serif;
            }
            .calage-notif:hover { border-color: #FFD700; transform: scale(1.02); }
            .calage-notif.warning { border-color: #ffc107; background: linear-gradient(135deg, rgba(60,50,20,0.95), rgba(40,35,15,0.95)); }
            .calage-notif.success { border-color: #4CAF50; background: linear-gradient(135deg, rgba(30,50,30,0.95), rgba(20,40,20,0.95)); }
            .calage-notif.info { border-color: #2196F3; background: linear-gradient(135deg, rgba(20,35,50,0.95), rgba(15,25,40,0.95)); }
            .calage-notif.attack { border-color: #E53935; background: linear-gradient(135deg, rgba(50,20,20,0.95), rgba(40,15,15,0.95)); }
            .calage-notif-icon { font-size: 20px; }
            .calage-notif-content { flex: 1; }
            .calage-notif-title { font-weight: bold; font-size: 13px; color: #F5DEB3; }
            .calage-notif-text { font-size: 11px; color: #BDB76B; margin-top: 3px; }
            .calage-notif-time { font-size: 10px; color: #D4AF37; }
            @keyframes calageSlideIn {
                from { transform: translateX(-100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes calageSlideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(-100%); opacity: 0; }
            }
        </style>
    `;
};

function initNotifications() {
    if (notifsContainer) return;
    
    notifsContainer = document.createElement('div');
    notifsContainer.id = 'calage-notifs';
    document.body.appendChild(notifsContainer);
}

function afficherNotification(titre, texte, type, duree) {
    if (!notifsContainer) initNotifications();
    
    type = type || 'info';
    duree = duree || 10000;
    
    const id = ++notifId;
    const icons = {
        info: 'ℹ️',
        warning: '⚠️',
        success: '✅',
        attack: '⚔️'
    };
    
    const notif = document.createElement('div');
    notif.className = 'calage-notif ' + type;
    notif.setAttribute('data-id', id);
    notif.innerHTML = `
        <div class="calage-notif-icon">${icons[type] || '📢'}</div>
        <div class="calage-notif-content">
            <div class="calage-notif-title">${titre}</div>
            <div class="calage-notif-text">${texte}</div>
        </div>
        <div class="calage-notif-time">${formatTime(Date.now())}</div>
    `;
    
    notif.addEventListener('click', function() {
        fermerNotification(id);
    });
    
    notifsContainer.appendChild(notif);
    
    log('CALAGE', `[NOTIF] ${titre}: ${texte}`, type === 'success' ? 'success' : (type === 'warning' ? 'warning' : 'info'));
    
    setTimeout(function() {
        fermerNotification(id);
    }, duree);
    
    return id;
}

function fermerNotification(id) {
    if (!notifsContainer) return;
    
    const notif = notifsContainer.querySelector('[data-id="' + id + '"]');
    if (notif) {
        notif.style.animation = 'calageSlideOut 0.3s ease forwards';
        setTimeout(function() {
            if (notif.parentNode) {
                notif.parentNode.removeChild(notif);
            }
        }, 300);
    }
}

module.init = function() {
    loadData();
    initNotifications();

    document.getElementById('toggle-calage').checked = calageData.botActif;
    updateControlState();
    majVillesSelect();
    majUnitsGrid();
    majListeAttaques();
    updatePlansList();

    document.getElementById('toggle-calage').onchange = (e) => toggleBot(e.target.checked);
    document.getElementById('calage-btn-ajouter').onclick = ajouterAttaque;
    document.getElementById('calage-btn-clear').onclick = supprimerToutesAttaques;
    document.getElementById('calage-ville-source').onchange = () => { majUnitsGrid(); };
    document.getElementById('calage-ville-cible').onchange = () => updateTravelInfo();
    document.getElementById('calage-heure-arrivee').onchange = () => updateTravelInfo();
    document.getElementById('calage-btn-planifier').onclick = planifierAttaques;
    document.getElementById('calage-save-plan').onclick = savePlan;
    document.getElementById('calage-export-plans').onclick = exportPlans;
    document.getElementById('calage-import-plans').onclick = () => document.getElementById('calage-import-file').click();
    document.getElementById('calage-import-file').onchange = (e) => importPlans(e);

    document.querySelectorAll('#tab-calage .section-header').forEach(h => {
        h.onclick = () => {
            h.classList.toggle('collapsed');
            const c = h.nextElementSibling;
            if (c) c.style.display = h.classList.contains('collapsed') ? 'none' : 'block';
        };
    });

    uw.$.Observer(uw.GameEvents.town.town_switch).subscribe('gu_calage', function() {
        majUnitsGrid();
    });

    if (calageData.botActif) {
        demarrerBot();
    }

    log('CALAGE', 'Module initialise - ' + calageData.attaques.length + ' attaques', 'info');
};

module.isActive = function() {
    return calageData.botActif;
};

module.onActivate = function(container) {
    majVillesSelect();
    majUnitsGrid();
    majListeAttaques();
    updatePlansList();
};

function toggleBot(enabled) {
    calageData.botActif = enabled;
    
    if (enabled) {
        demarrerBot();
    } else {
        arreterBot();
    }
    
    updateControlState();
    saveData();
    
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function updateControlState() {
    const ctrl = document.getElementById('calage-control');
    const status = document.getElementById('calage-status');
    
    if (calageData.botActif) {
        ctrl.classList.remove('inactive');
        status.textContent = 'Surveillance...';
    } else {
        ctrl.classList.add('inactive');
        status.textContent = 'En attente';
    }
}

function demarrerBot() {
    console.log('[CALAGE] ========================================');
    console.log('[CALAGE] BOT DEMARRE !');
    console.log('[CALAGE] Attaques en memoire:', calageData.attaques.length);
    const attaquesEnAttente = calageData.attaques.filter(a => a.status === 'attente').length;
    console.log('[CALAGE] Attaques en attente:', attaquesEnAttente);
    console.log('[CALAGE] Intervalle de verification: 500ms');
    console.log('[CALAGE] ========================================');
    
    log('CALAGE', 'Bot demarre', 'success');
    majStatus('Surveillance...');
    
    afficherNotification('Bot demarre', 'Surveillance de ' + calageData.attaques.length + ' attaque(s)', 'info');

    calageData.intervalCheck = setInterval(function() {
        if (!calageData.botActif) return;
        verifierEtLancerAttaque();
    }, 500);
}

function arreterBot() {
    console.log('[CALAGE] ========================================');
    console.log('[CALAGE] BOT ARRETE !');
    console.log('[CALAGE] ========================================');
    
    log('CALAGE', 'Bot arrete', 'info');
    majStatus('En attente');

    if (calageData.intervalCheck) {
        clearInterval(calageData.intervalCheck);
        calageData.intervalCheck = null;
    }
    calageData.attaqueEnCours = null;
    dernieresNotifs = {};
}

function majStatus(message) {
    const status = document.getElementById('calage-status');
    if (status) status.textContent = message;
}

function getVillesJoueur() {
    const villes = [];
    try {
        if (uw.ITowns && uw.ITowns.getTowns) {
            const towns = uw.ITowns.getTowns();
            for (const id in towns) {
                if (towns.hasOwnProperty(id)) {
                    const town = towns[id];
                    villes.push({
                        id: parseInt(id),
                        name: town.getName ? town.getName() : ('Ville ' + id)
                    });
                }
            }
        }
    } catch (e) {
        log('CALAGE', 'Erreur recup villes: ' + e.message, 'error');
    }

    if (villes.length === 0 && uw.Game && uw.Game.townId) {
        villes.push({ id: uw.Game.townId, name: 'Ville actuelle' });
    }

    return villes;
}

function majVillesSelect() {
    const select = document.getElementById('calage-ville-source');
    if (!select) return;
    
    const villes = getVillesJoueur();
    select.innerHTML = '';

    villes.forEach(function(ville) {
        const opt = document.createElement('option');
        opt.value = ville.id;
        opt.textContent = ville.name + ' (' + ville.id + ')';
        if (ville.id === uw.Game.townId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function majUnitsGrid() {
    const groundGrid = document.getElementById('calage-ground-units');
    const navalGrid = document.getElementById('calage-naval-units');
    if (!groundGrid || !navalGrid) return;
    
    const sourceId = parseInt(document.getElementById('calage-ville-source')?.value) || uw.Game.townId;
    const availableUnits = getAvailableUnitsForTown(sourceId);
    
    const groundUnits = availableUnits.filter(u => !u.isNaval);
    const navalUnits = availableUnits.filter(u => u.isNaval);
    
    if (groundUnits.length === 0) {
        groundGrid.innerHTML = '<div style="grid-column: span 4; text-align: center; color: #8B8B83; padding: 15px; font-style: italic;">Aucune troupe terrestre</div>';
    } else {
        groundGrid.innerHTML = groundUnits.map(u => `
            <div class="calage-unit-input">
                <div class="unit_icon40x40 ${u.id} unit-icon"></div>
                <label>${u.name}</label>
                <span class="unit-count">(${u.count})</span>
                <input type="number" id="unit-${u.id}" min="0" max="${u.count}" value="0" data-unit="${u.id}" data-pop="${u.pop}">
            </div>
        `).join('');
    }
    
    if (navalUnits.length === 0) {
        navalGrid.innerHTML = '<div style="grid-column: span 4; text-align: center; color: #8B8B83; padding: 15px; font-style: italic;">Aucune flotte</div>';
    } else {
        navalGrid.innerHTML = navalUnits.map(u => `
            <div class="calage-unit-input" style="${u.isTransport ? 'border-color: #4CAF50;' : ''}">
                <div class="unit_icon40x40 ${u.id} unit-icon"></div>
                <label>${u.name}</label>
                <span class="unit-count">(${u.count})</span>
                <input type="number" id="unit-${u.id}" min="0" max="${u.count}" value="0" data-unit="${u.id}" data-transport="${u.isTransport}">
            </div>
        `).join('');
    }
    
    document.querySelectorAll('#calage-ground-units input, #calage-naval-units input').forEach(inp => {
        inp.addEventListener('input', () => {
            updateBoatIndicator();
            updateTravelInfo();
        });
    });
    
    updateBoatIndicator();
    updateTravelInfo();
}

function updateBoatIndicator() {
    const indicator = document.getElementById('calage-boat-indicator');
    const bar = document.getElementById('calage-boat-bar');
    const text = document.getElementById('calage-boat-text');
    const warning = document.getElementById('calage-boat-warning');
    const researchInfo = document.getElementById('calage-research-info');
    
    if (!indicator) return;
    
    const units = getSelectedUnits();
    const sourceId = parseInt(document.getElementById('calage-ville-source')?.value) || uw.Game.townId;
    
    if (!hasGroundUnits(units)) {
        indicator.style.display = 'none';
        return;
    }
    
    indicator.style.display = 'block';
    
    const boatInfo = calculateRequiredBoats(units, sourceId);
    const hasBoatResearch = hasResearch(sourceId, 'ship_transport');
    
    text.textContent = `${boatInfo.totalCapacity} / ${boatInfo.totalPop} pop`;
    bar.style.width = boatInfo.percentage + '%';
    
    if (boatInfo.percentage >= 100) {
        bar.style.background = 'linear-gradient(90deg, #4CAF50, #8BC34A)';
        warning.style.display = 'none';
    } else if (boatInfo.percentage >= 50) {
        bar.style.background = 'linear-gradient(90deg, #FF9800, #FFC107)';
        warning.style.display = 'block';
        warning.textContent = `Manque ${boatInfo.neededCapacity} places!`;
    } else {
        bar.style.background = 'linear-gradient(90deg, #F44336, #E53935)';
        warning.style.display = 'block';
        warning.textContent = `Ajoutez des bateaux! (${boatInfo.neededCapacity} places manquantes)`;
    }
    
    researchInfo.textContent = hasBoatResearch 
        ? `Extension navale: GTrans=${boatInfo.bigBoatCap} pop, PTrans=${boatInfo.smallBoatCap} pop`
        : `Sans extension: GTrans=${boatInfo.bigBoatCap} pop, PTrans=${boatInfo.smallBoatCap} pop`;
}

function updateTravelInfo() {
    const travelInfo = document.getElementById('calage-travel-info');
    const travelTimeEl = document.getElementById('calage-travel-time');
    const sendTimeEl = document.getElementById('calage-send-time');
    const statusEl = document.getElementById('calage-travel-status');
    
    if (!travelInfo) return;
    
    const cibleId = parseInt(document.getElementById('calage-ville-cible')?.value);
    const heureArrivee = document.getElementById('calage-heure-arrivee')?.value;
    const units = getSelectedUnits();
    
    if (!cibleId || Object.keys(units).length === 0) {
        travelInfo.style.display = 'none';
        return;
    }
    
    travelInfo.style.display = 'block';
    travelTimeEl.textContent = 'Calcul...';
    sendTimeEl.textContent = '--:--:--';
    statusEl.textContent = 'Calcul du temps de trajet...';
    
    calculerTempsTrajetAuto(cibleId, units, function(travelTimeMs) {
        if (travelTimeMs) {
            travelTimeEl.textContent = formatDuration(travelTimeMs);
            statusEl.textContent = 'Temps calcule depuis serveur';
            statusEl.style.color = '#4CAF50';
            
            if (heureArrivee) {
                const arrivalMs = getTimeInMs(heureArrivee);
                const sendMs = arrivalMs - travelTimeMs;
                sendTimeEl.textContent = formatTime(sendMs);
            }
        } else {
            travelTimeEl.textContent = 'Erreur';
            statusEl.textContent = 'Impossible de calculer';
            statusEl.style.color = '#E53935';
        }
    });
}

let calculationTimeout = null;
let lastCalculation = { sourceId: null, cibleId: null, units: null, result: null };

function calculerTempsTrajetAuto(cibleId, units, callback) {
    const sourceId = parseInt(document.getElementById('calage-ville-source')?.value) || uw.Game.townId;
    const typeAttaque = document.getElementById('calage-type-attaque')?.value || 'attack';
    
    const unitsKey = JSON.stringify(units);
    if (lastCalculation.sourceId === sourceId && 
        lastCalculation.cibleId === cibleId && 
        lastCalculation.units === unitsKey &&
        lastCalculation.result) {
        callback(lastCalculation.result);
        return;
    }
    
    if (calculationTimeout) {
        clearTimeout(calculationTimeout);
    }
    
    calculationTimeout = setTimeout(function() {
        const townId = sourceId;
        const csrfToken = uw.Game.csrfToken;
        const url = '/game/town_info?town_id=' + townId + '&action=send_units&h=' + csrfToken;

        const jsonData = {
            id: cibleId,
            type: typeAttaque,
            town_id: townId,
            nl_init: true
        };

        for (const unitId in units) {
            if (units.hasOwnProperty(unitId)) {
                jsonData[unitId] = units[unitId];
            }
        }

        uw.$.ajax({
            url: url,
            type: 'POST',
            data: { json: JSON.stringify(jsonData) },
            dataType: 'json',
            success: function(response) {
                if (response.json && response.json.error) {
                    log('CALAGE', 'Trajet impossible: ' + response.json.error, 'error');
                    callback(null);
                    return;
                }
                
                const notifs = response.json && response.json.notifications;
                if (!notifs) {
                    log('CALAGE', 'Trajet impossible: pas de reponse serveur', 'error');
                    callback(null);
                    return;
                }

                let mvIndex = -1;
                for (let i = 0; i < notifs.length; i++) {
                    if (notifs[i].subject === 'MovementsUnits') {
                        mvIndex = i;
                        break;
                    }
                }

                if (mvIndex === -1) {
                    log('CALAGE', 'Trajet impossible: mouvement non cree', 'error');
                    callback(null);
                    return;
                }

                try {
                    const paramStr = notifs[mvIndex].param_str;
                    const movementData = JSON.parse(paramStr).MovementsUnits;
                    const arrivalAt = movementData.arrival_at;
                    const commandId = movementData.command_id;
                    
                    const now = Math.floor(Date.now() / 1000);
                    const travelTimeSec = arrivalAt - now;
                    const travelTimeMs = travelTimeSec * 1000;
                    
                    lastCalculation = {
                        sourceId: sourceId,
                        cibleId: cibleId,
                        units: unitsKey,
                        result: travelTimeMs
                    };
                    
                    annulerCommande(commandId).then(function() {
                        callback(travelTimeMs);
                    }).catch(function() {
                        callback(travelTimeMs);
                    });
                    
                } catch (e) {
                    callback(null);
                }
            },
            error: function() {
                callback(null);
            }
        });
    }, 500);
}

function getSelectedUnits() {
    const units = {};
    document.querySelectorAll('#calage-ground-units input, #calage-naval-units input').forEach(inp => {
        const unitId = inp.getAttribute('data-unit');
        const count = parseInt(inp.value) || 0;
        if (count > 0) {
            units[unitId] = count;
        }
    });
    return units;
}

function ajouterAttaque() {
    const sourceId = parseInt(document.getElementById('calage-ville-source').value);
    const cibleId = parseInt(document.getElementById('calage-ville-cible').value);
    const heureArrivee = document.getElementById('calage-heure-arrivee').value;
    const typeAttaque = document.getElementById('calage-type-attaque').value;
    const toleranceMoins = document.getElementById('calage-tolerance-moins').checked;
    const tolerancePlus = document.getElementById('calage-tolerance-plus').checked;

    if (!cibleId || !heureArrivee) {
        log('CALAGE', 'Remplir cible et heure d\'arrivee!', 'error');
        return;
    }

    const unites = getSelectedUnits();
    let totalUnites = Object.values(unites).reduce((a, b) => a + b, 0);

    if (totalUnites === 0) {
        log('CALAGE', 'Selectionner au moins une unite!', 'error');
        return;
    }

    if (hasGroundUnits(unites) && !hasBoatsSelected(unites)) {
        log('CALAGE', 'Attention: troupes terrestres sans bateaux!', 'warning');
    }

    const travelTimeEl = document.getElementById('calage-travel-time');
    const travelText = travelTimeEl?.textContent;
    
    if (!travelText || travelText === 'Calcul...' || travelText === '--:--') {
        log('CALAGE', 'Attendez le calcul du temps de trajet...', 'warning');
        return;
    }
    
    if (travelText === 'Erreur') {
        log('CALAGE', 'Trajet impossible! Verifiez la cible et les unites.', 'error');
        return;
    }
    
    const travelTimeMs = lastCalculation.result;
    if (!travelTimeMs) {
        log('CALAGE', 'Temps de trajet non disponible - trajet impossible?', 'error');
        return;
    }
    
    const heureArriveeMs = getTimeInMs(heureArrivee);
    const heureEnvoiMs = heureArriveeMs - travelTimeMs;

    const nouvelleAttaque = {
        id: 'atk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        sourceId: sourceId,
        cibleId: cibleId,
        heureArrivee: heureArrivee,
        heureEnvoi: formatTime(heureEnvoiMs),
        travelTime: travelTimeMs,
        type: typeAttaque,
        unites: unites,
        toleranceMoins: toleranceMoins,
        tolerancePlus: tolerancePlus,
        status: 'attente',
        tentatives: 0,
        dateCreation: Date.now()
    };

    calageData.attaques.push(nouvelleAttaque);
    saveData();
    majListeAttaques();

    document.querySelectorAll('#calage-ground-units input, #calage-naval-units input').forEach(inp => {
        inp.value = 0;
    });
    updateBoatIndicator();
    updateTravelInfo();

    log('CALAGE', `Attaque ajoutee: envoi ${nouvelleAttaque.heureEnvoi} -> arrivee ${heureArrivee}`, 'success');
}

function planifierAttaques() {
    const count = parseInt(document.getElementById('calage-plan-count').value) || 1;
    const interval = parseInt(document.getElementById('calage-plan-interval').value) || 1;
    
    const sourceId = parseInt(document.getElementById('calage-ville-source').value);
    const cibleId = parseInt(document.getElementById('calage-ville-cible').value);
    const heureArrivee = document.getElementById('calage-heure-arrivee').value;
    const typeAttaque = document.getElementById('calage-type-attaque').value;
    const toleranceMoins = document.getElementById('calage-tolerance-moins').checked;
    const tolerancePlus = document.getElementById('calage-tolerance-plus').checked;
    
    if (!cibleId || !heureArrivee) {
        log('CALAGE', 'Remplir cible et heure!', 'error');
        return;
    }
    
    const unites = getSelectedUnits();
    let totalUnites = Object.values(unites).reduce((a, b) => a + b, 0);
    
    if (totalUnites === 0) {
        log('CALAGE', 'Selectionner au moins une unite!', 'error');
        return;
    }
    
    if (hasGroundUnits(unites) && !hasBoatsSelected(unites)) {
        log('CALAGE', 'Attention: troupes terrestres sans bateaux!', 'warning');
    }
    
    const travelTimeMs = lastCalculation.result;
    if (!travelTimeMs) {
        log('CALAGE', 'Trajet impossible ou calcul en cours', 'error');
        return;
    }
    
    const [hours, minutes, seconds] = heureArrivee.split(':').map(Number);
    let baseArrivalTime = new Date();
    baseArrivalTime.setHours(hours, minutes, seconds || 0, 0);
    
    for (let i = 0; i < count; i++) {
        const arrivalTime = new Date(baseArrivalTime.getTime() + (i * interval * 1000));
        const arrivalStr = arrivalTime.toTimeString().split(' ')[0];
        const sendTimeMs = arrivalTime.getTime() - travelTimeMs;
        
        const nouvelleAttaque = {
            id: 'atk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + i,
            sourceId: sourceId,
            cibleId: cibleId,
            heureArrivee: arrivalStr,
            heureEnvoi: formatTime(sendTimeMs),
            travelTime: travelTimeMs,
            type: typeAttaque,
            unites: { ...unites },
            toleranceMoins: toleranceMoins,
            tolerancePlus: tolerancePlus,
            status: 'attente',
            tentatives: 0,
            dateCreation: Date.now()
        };
        
        calageData.attaques.push(nouvelleAttaque);
    }
    
    saveData();
    majListeAttaques();
    
    document.querySelectorAll('#calage-ground-units input, #calage-naval-units input').forEach(inp => {
        inp.value = 0;
    });
    updateBoatIndicator();
    updateTravelInfo();
    
    log('CALAGE', `${count} attaques planifiees (intervalle ${interval}s)`, 'success');
}

function savePlan() {
    const nameInput = document.getElementById('calage-plan-name');
    const planName = nameInput.value.trim();
    
    if (!planName) {
        log('CALAGE', 'Entrez un nom de plan', 'warning');
        return;
    }
    
    if (calageData.attaques.length === 0) {
        log('CALAGE', 'Aucune attaque a sauvegarder', 'warning');
        return;
    }
    
    const sourceId = calageData.attaques[0].sourceId;
    const cibleId = calageData.attaques[0].cibleId;
    const sourceName = getVillesJoueur().find(v => v.id === sourceId)?.name || sourceId;
    
    const plan = {
        name: planName,
        date: new Date().toISOString(),
        sourceId: sourceId,
        sourceName: sourceName,
        cibleId: cibleId,
        attackCount: calageData.attaques.length,
        attaques: calageData.attaques.map(a => ({ 
            ...a, 
            status: 'attente', 
            tentatives: 0 
        }))
    };
    
    const existingIndex = calageData.plans.findIndex(p => p.name === planName);
    if (existingIndex >= 0) {
        calageData.plans[existingIndex] = plan;
        log('CALAGE', `Plan "${planName}" mis a jour`, 'success');
    } else {
        calageData.plans.push(plan);
        log('CALAGE', `Plan "${planName}" sauvegarde`, 'success');
    }
    
    nameInput.value = '';
    saveData();
    updatePlansList();
}

function loadPlan(index) {
    const plan = calageData.plans[index];
    if (!plan) return;
    
    calageData.attaques = plan.attaques.map(a => ({ 
        ...a, 
        id: 'atk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        status: 'attente', 
        tentatives: 0 
    }));
    
    saveData();
    majListeAttaques();
    log('CALAGE', `Plan "${plan.name}" charge (${plan.attaques.length} attaques)`, 'success');
}

function deletePlan(index) {
    const plan = calageData.plans[index];
    if (!plan) return;
    
    calageData.plans.splice(index, 1);
    saveData();
    updatePlansList();
    log('CALAGE', `Plan "${plan.name}" supprime`, 'info');
}

function updatePlansList() {
    const container = document.getElementById('calage-plans-list');
    if (!container) return;
    
    if (!calageData.plans.length) {
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;font-style:italic;padding:20px;">Aucun plan sauvegarde</div>';
        return;
    }
    
    container.innerHTML = calageData.plans.map((plan, i) => {
        const date = new Date(plan.date).toLocaleDateString('fr-FR');
        return `
        <div class="plan-item">
            <div class="plan-name">${plan.name}</div>
            <div class="plan-meta">
                ${plan.sourceName || plan.sourceId} -> ${plan.cibleId} | ${plan.attackCount || plan.attaques.length} attaques | ${date}
            </div>
            <div class="plan-actions">
                <button class="plan-load-btn" data-index="${i}" style="background:#4CAF50;color:#fff;">Charger</button>
                <button class="plan-delete-btn" data-index="${i}" style="background:#E53935;color:#fff;">Supprimer</button>
            </div>
        </div>
    `}).join('');
    
    container.querySelectorAll('.plan-load-btn').forEach(b => {
        b.onclick = () => loadPlan(parseInt(b.dataset.index));
    });
    container.querySelectorAll('.plan-delete-btn').forEach(b => {
        b.onclick = () => deletePlan(parseInt(b.dataset.index));
    });
}

function exportPlans() {
    const exportData = {
        version: '2.2.0',
        exportDate: new Date().toISOString(),
        plans: calageData.plans,
        attaques: calageData.attaques
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grepolis-calage-plans-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    log('CALAGE', 'Plans exportes', 'success');
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
                        const existingIndex = calageData.plans.findIndex(p => p.name === plan.name);
                        if (existingIndex >= 0) {
                            calageData.plans[existingIndex] = plan;
                        } else {
                            calageData.plans.push(plan);
                        }
                        imported++;
                    }
                });
                
                log('CALAGE', `${imported} plan(s) importe(s)`, 'success');
            }
            
            saveData();
            updatePlansList();
            majListeAttaques();
        } catch(err) {
            log('CALAGE', 'Erreur import: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function majListeAttaques() {
    const liste = document.getElementById('calage-liste-attaques');
    const count = document.getElementById('calage-count');
    if (!liste) return;

    count.textContent = calageData.attaques.length;

    if (calageData.attaques.length === 0) {
        liste.innerHTML = '<div style="text-align:center; color:#8B8B83; padding:20px; font-style:italic;">Aucune attaque planifiee</div>';
        return;
    }

    liste.innerHTML = '';

    calageData.attaques.forEach(function(atk, index) {
        let statusClass = 'status-attente';
        let statusText = 'Attente';
        let itemClass = '';

        if (atk.status === 'encours') {
            statusClass = 'status-encours';
            statusText = 'En cours (' + (atk.tentatives || 0) + ')';
            itemClass = 'en-cours';
        } else if (atk.status === 'succes') {
            statusClass = 'status-succes';
            statusText = 'Succes';
            itemClass = 'terminee';
        }

        const unitsList = [];
        for (const u in atk.unites) {
            if (atk.unites.hasOwnProperty(u) && atk.unites[u] > 0) {
                unitsList.push(u + ':' + atk.unites[u]);
            }
        }

        const div = document.createElement('div');
        div.className = 'attaque-item ' + itemClass;
        div.innerHTML = `
            <div class="attaque-header">
                <div class="attaque-info">
                    <div class="nom">${atk.sourceId} -> ${atk.cibleId}</div>
                    <div class="details">${atk.type} | ${unitsList.slice(0, 3).join(', ')}${unitsList.length > 3 ? '...' : ''}</div>
                </div>
                <span class="attaque-status ${statusClass}">${statusText}</span>
            </div>
            <div class="attaque-times">
                <span>Envoi: <span class="send">${atk.heureEnvoi || '??:??:??'}</span></span>
                <span>Arrivee: <span class="arrival">${atk.heureArrivee}</span></span>
                <span>Trajet: ${atk.travelTime ? formatDuration(atk.travelTime) : '??'}</span>
            </div>
            <div class="calage-actions">
                <button class="btn-lancer" data-index="${index}">Lancer</button>
                <button class="btn-suppr" data-index="${index}">Supprimer</button>
            </div>
        `;
        liste.appendChild(div);
    });

    liste.querySelectorAll('.btn-suppr').forEach(function(btn) {
        btn.onclick = function() {
            const idx = parseInt(this.getAttribute('data-index'));
            supprimerAttaque(idx);
        };
    });

    liste.querySelectorAll('.btn-lancer').forEach(function(btn) {
        btn.onclick = function() {
            const idx = parseInt(this.getAttribute('data-index'));
            lancerAttaqueMaintenant(idx);
        };
    });
}

function supprimerAttaque(index) {
    calageData.attaques.splice(index, 1);
    saveData();
    majListeAttaques();
    log('CALAGE', 'Attaque supprimee', 'info');
}

function supprimerToutesAttaques() {
    if (calageData.attaques.length === 0) return;
    calageData.attaques = [];
    saveData();
    majListeAttaques();
    log('CALAGE', 'Toutes les attaques supprimees', 'info');
}

function lancerAttaqueMaintenant(index) {
    const atk = calageData.attaques[index];
    if (!atk) return;

    if (calageData.attaqueEnCours) {
        log('CALAGE', 'Une attaque est deja en cours!', 'error');
        return;
    }

    log('CALAGE', 'Lancement manuel: ' + atk.sourceId + ' -> ' + atk.cibleId, 'info');
    lancerAttaque(atk);
}

function verifierEtLancerAttaque() {
    if (calageData.attaqueEnCours) {
        return;
    }

    const maintenant = Date.now();
    let attaqueALancer = null;
    
    const doLog = (maintenant - dernierLogCheck) >= 10000;
    if (doLog) {
        dernierLogCheck = maintenant;
        console.log('[CALAGE] [CHECK] Verification des attaques a', formatTime(maintenant));
    }

    for (let i = 0; i < calageData.attaques.length; i++) {
        const atk = calageData.attaques[i];

        if (atk.status !== 'attente') continue;
        
        const heureArriveeMs = getTimeInMs(atk.heureArrivee);
        let tempsAvantArrivee = heureArriveeMs - maintenant;
        
        if (tempsAvantArrivee < -60000) {
            tempsAvantArrivee += 24 * 60 * 60 * 1000;
        }
        
        const notifKey = 'atk_' + atk.id;
        
        if (!atk.travelTime && !calculEnCours[atk.id]) {
            if (tempsAvantArrivee > 0 && tempsAvantArrivee < 2 * 60 * 60 * 1000) {
                console.log('[CALAGE] [CHECK] Calcul du temps de trajet necessaire pour:', atk.sourceId, '->', atk.cibleId);
                calculEnCours[atk.id] = true;
                
                calculerTempsTrajetPourAttaque(atk).then(function(tempsTrajetMs) {
                    if (tempsTrajetMs) {
                        atk.travelTime = tempsTrajetMs;
                        const heureEnvoiMs = heureArriveeMs - tempsTrajetMs;
                        atk.heureEnvoi = formatTime(heureEnvoiMs);
                        saveData();
                        majListeAttaques();
                        
                        console.log('[CALAGE] [CALCUL] Temps de trajet sauvegarde:', Math.round(tempsTrajetMs/1000), 's');
                        console.log('[CALAGE] [CALCUL] Heure de depart calculee:', atk.heureEnvoi);
                        
                        afficherNotification(
                            'Temps de trajet calcule',
                            atk.sourceId + ' -> ' + atk.cibleId + ': ' + formatDuration(tempsTrajetMs) + ' | Depart: ' + atk.heureEnvoi,
                            'info'
                        );
                    }
                    delete calculEnCours[atk.id];
                }).catch(function(err) {
                    console.error('[CALAGE] [CALCUL] Erreur calcul temps trajet:', err);
                    delete calculEnCours[atk.id];
                });
            }
            continue;
        }
        
        if (!atk.heureEnvoi || !atk.travelTime) continue;
        
        let heureEnvoiMs = getTimeInMs(atk.heureEnvoi);
        let tempsAvantDepart = heureEnvoiMs - maintenant;
        
        if (tempsAvantDepart < -60000) {
            tempsAvantDepart += 24 * 60 * 60 * 1000;
        }
        
        const minDepart = Math.floor(tempsAvantDepart / 60000);
        const secDepart = Math.floor((tempsAvantDepart % 60000) / 1000);
        
        if (doLog && tempsAvantDepart > 0 && tempsAvantDepart < 2 * 60 * 60 * 1000) {
            console.log('[CALAGE] [CHECK] Attaque:', atk.sourceId, '->', atk.cibleId);
            console.log('[CALAGE] [CHECK]   Heure ARRIVEE souhaitee:', atk.heureArrivee);
            console.log('[CALAGE] [CHECK]   Heure DEPART calculee:', atk.heureEnvoi);
            console.log('[CALAGE] [CHECK]   Temps de trajet:', formatDuration(atk.travelTime));
            console.log('[CALAGE] [CHECK]   Temps avant DEPART:', minDepart + 'm ' + secDepart + 's');
        }
        
        if (tempsAvantDepart > 0 && tempsAvantDepart < 120000) {
            majStatus('Envoi dans ' + minDepart + 'm ' + secDepart + 's (arr: ' + atk.heureArrivee + ')');
        }
        
        const alertes = [
            { temps: 60, msg: '1 heure' },
            { temps: 30, msg: '30 minutes' },
            { temps: 15, msg: '15 minutes' },
            { temps: 10, msg: '10 minutes' },
            { temps: 5, msg: '5 minutes' }
        ];
        
        for (let j = 0; j < alertes.length; j++) {
            const alerte = alertes[j];
            const key = notifKey + '_' + alerte.temps;
            if (minDepart === alerte.temps && !dernieresNotifs[key]) {
                dernieresNotifs[key] = true;
                console.log('[CALAGE] [NOTIF] Alerte:', alerte.msg, 'avant le depart', atk.sourceId, '->', atk.cibleId);
                afficherNotification(
                    'Depart dans ' + alerte.msg,
                    atk.sourceId + ' -> ' + atk.cibleId + ' | Arrivee ' + atk.heureArrivee,
                    'warning'
                );
            }
        }

        if (tempsAvantDepart > 0 && tempsAvantDepart < AVANCE_LANCEMENT) {
            console.log('[CALAGE] [TRIGGER] Temps avant depart < 15s (' + tempsAvantDepart + 'ms) - Declenchement !');
            attaqueALancer = atk;
            break;
        }
    }
    
    if (attaqueALancer) {
        console.log('[CALAGE] ========================================');
        console.log('[CALAGE] [LANCEMENT] Attaque trouvee a lancer !');
        console.log('[CALAGE] [LANCEMENT] Source:', attaqueALancer.sourceId);
        console.log('[CALAGE] [LANCEMENT] Cible:', attaqueALancer.cibleId);
        console.log('[CALAGE] [LANCEMENT] Heure depart:', attaqueALancer.heureEnvoi);
        console.log('[CALAGE] [LANCEMENT] Heure arrivee:', attaqueALancer.heureArrivee);
        console.log('[CALAGE] ========================================');
        
        afficherNotification(
            'Calage automatique',
            attaqueALancer.sourceId + ' -> ' + attaqueALancer.cibleId + ' - Lancement !',
            'attack'
        );
        
        lancerAttaque(attaqueALancer);
    }
}

function calculerTempsTrajetPourAttaque(atk) {
    return new Promise(function(resolve, reject) {
        const townId = atk.sourceId;
        const csrfToken = uw.Game.csrfToken;
        const url = '/game/town_info?town_id=' + townId + '&action=send_units&h=' + csrfToken;
        
        const jsonData = {
            id: atk.cibleId,
            type: atk.type,
            town_id: townId,
            nl_init: true
        };
        
        for (const unitId in atk.unites) {
            if (atk.unites.hasOwnProperty(unitId)) {
                jsonData[unitId] = atk.unites[unitId];
            }
        }
        
        console.log('[CALAGE] [CALCUL] Envoi test pour calculer temps de trajet...');
        
        uw.$.ajax({
            url: url,
            type: 'POST',
            data: { json: JSON.stringify(jsonData) },
            dataType: 'json',
            success: function(response) {
                if (response.json && response.json.error) {
                    console.error('[CALAGE] [CALCUL] Erreur:', response.json.error);
                    reject(response.json.error);
                    return;
                }
                
                const notifs = response.json && response.json.notifications;
                if (!notifs) {
                    reject('Pas de notifications');
                    return;
                }
                
                let mvIndex = -1;
                for (let i = 0; i < notifs.length; i++) {
                    if (notifs[i].subject === 'MovementsUnits') {
                        mvIndex = i;
                        break;
                    }
                }
                
                if (mvIndex === -1) {
                    reject('Pas de MovementsUnits');
                    return;
                }
                
                try {
                    const paramStr = notifs[mvIndex].param_str;
                    const movementData = JSON.parse(paramStr).MovementsUnits;
                    const arrivalAt = movementData.arrival_at;
                    const commandId = movementData.command_id;
                    
                    const now = Math.floor(Date.now() / 1000);
                    const travelTimeSec = arrivalAt - now;
                    const travelTimeMs = travelTimeSec * 1000;
                    
                    console.log('[CALAGE] [CALCUL] Temps de trajet calcule:', travelTimeSec, 'secondes');
                    console.log('[CALAGE] [CALCUL] Annulation de la commande test...');
                    
                    annulerCommande(commandId).then(function() {
                        console.log('[CALAGE] [CALCUL] Commande test annulee');
                        resolve(travelTimeMs);
                    }).catch(function(err) {
                        console.error('[CALAGE] [CALCUL] Erreur annulation:', err);
                        resolve(travelTimeMs);
                    });
                    
                } catch (e) {
                    console.error('[CALAGE] [CALCUL] Erreur parsing:', e);
                    reject(e);
                }
            },
            error: function(xhr, status, err) {
                console.error('[CALAGE] [CALCUL] Erreur AJAX:', err);
                reject(err);
            }
        });
    });
}

function lancerAttaque(atk) {
    calageData.attaqueEnCours = atk;
    atk.status = 'encours';
    atk.tentatives = 1;
    saveData();
    majListeAttaques();
    majStatus('Envoi vers ' + atk.cibleId + '...');
    
    console.log('[CALAGE] [ATTAQUE] === LANCEMENT ATTAQUE ===');
    console.log('[CALAGE] [ATTAQUE] Source:', atk.sourceId, '-> Cible:', atk.cibleId);
    console.log('[CALAGE] [ATTAQUE] Type:', atk.type);
    console.log('[CALAGE] [ATTAQUE] Unites:', JSON.stringify(atk.unites));
    console.log('[CALAGE] [ATTAQUE] Tolerance: [', atk.toleranceMoins ? '-1s' : '0', ',', atk.tolerancePlus ? '+1s' : '0', ']');

    if (uw.Game.townId !== atk.sourceId) {
        console.log('[CALAGE] [ATTAQUE] Changement de ville necessaire:', uw.Game.townId, '->', atk.sourceId);
        log('CALAGE', 'Changement ville: ' + uw.Game.townId + ' -> ' + atk.sourceId, 'info');
        majStatus('Changement ville...');

        try {
            if (uw.TownSwitch && uw.TownSwitch.switchTown) {
                uw.TownSwitch.switchTown(atk.sourceId);
            } else if (uw.ITowns && uw.ITowns.setCurrentTown) {
                uw.ITowns.setCurrentTown(atk.sourceId);
            }
            console.log('[CALAGE] [ATTAQUE] Changement de ville effectue');
        } catch (e) {
            console.error('[CALAGE] [ATTAQUE] Erreur changement ville:', e);
            log('CALAGE', 'Erreur changement: ' + e.message, 'error');
        }

        setTimeout(function() {
            envoyerAttaque(atk);
        }, 1500);
        return;
    }

    console.log('[CALAGE] [ATTAQUE] Ville source deja active, envoi direct');
    envoyerAttaque(atk);
}

function envoyerAttaque(atk) {
    const townId = atk.sourceId;
    const csrfToken = uw.Game.csrfToken;
    const url = '/game/town_info?town_id=' + townId + '&action=send_units&h=' + csrfToken;

    const jsonData = {
        id: atk.cibleId,
        type: atk.type,
        town_id: townId,
        nl_init: true
    };

    for (const unitId in atk.unites) {
        if (atk.unites.hasOwnProperty(unitId)) {
            jsonData[unitId] = atk.unites[unitId];
        }
    }

    console.log('[CALAGE] [ENVOI] Tentative #' + atk.tentatives);
    majStatus('Tentative #' + atk.tentatives + '...');

    uw.$.ajax({
        url: url,
        type: 'POST',
        data: { json: JSON.stringify(jsonData) },
        dataType: 'json',
        success: function(response) {
            console.log('[CALAGE] [ENVOI] Reponse recue');
            traiterReponseAttaque(response, atk);
        },
        error: function(xhr, status, err) {
            console.error('[CALAGE] [ENVOI] Erreur AJAX:', err);
            log('CALAGE', 'Erreur AJAX: ' + err, 'error');
            majStatus('Erreur: ' + err);

            setTimeout(function() {
                if (calageData.attaqueEnCours === atk) {
                    atk.tentatives++;
                    console.log('[CALAGE] [ENVOI] Retry apres erreur, tentative #' + atk.tentatives);
                    envoyerAttaque(atk);
                }
            }, 1000);
        }
    });
}

function traiterReponseAttaque(response, atk) {
    console.log('[CALAGE] [REPONSE] Traitement de la reponse...');
    
    if (response.json && response.json.error) {
        console.log('[CALAGE] [REPONSE] Erreur serveur:', response.json.error);
        if (response.json.error.indexOf('unit') !== -1 || response.json.error.indexOf('Pas assez') !== -1) {
            console.log('[CALAGE] [REPONSE] Pas assez d\'unites, retry dans 500ms...');
            majStatus('Attente unites...');
            setTimeout(function() {
                if (calageData.attaqueEnCours === atk) {
                    envoyerAttaque(atk);
                }
            }, 500);
            return;
        }

        log('CALAGE', 'Erreur: ' + response.json.error, 'error');
        majStatus('Erreur: ' + response.json.error);
        calageData.attaqueEnCours = null;
        return;
    }

    const notifs = response.json && response.json.notifications;
    if (!notifs) {
        console.log('[CALAGE] [REPONSE] Pas de notifications dans la reponse');
        log('CALAGE', 'Pas de notifications', 'error');
        calageData.attaqueEnCours = null;
        return;
    }

    let mvIndex = -1;
    for (let i = 0; i < notifs.length; i++) {
        if (notifs[i].subject === 'MovementsUnits') {
            mvIndex = i;
            break;
        }
    }

    if (mvIndex === -1) {
        console.log('[CALAGE] [REPONSE] Pas de MovementsUnits trouve');
        log('CALAGE', 'Pas de MovementsUnits', 'error');
        calageData.attaqueEnCours = null;
        return;
    }

    try {
        const paramStr = notifs[mvIndex].param_str;
        const movementData = JSON.parse(paramStr).MovementsUnits;
        const arrivalAt = movementData.arrival_at;
        const commandId = movementData.command_id;

        console.log('[CALAGE] [REPONSE] MovementsUnits trouve:');
        console.log('[CALAGE] [REPONSE]   command_id:', commandId);
        console.log('[CALAGE] [REPONSE]   arrival_at:', arrivalAt, '(', formatTime(arrivalAt * 1000), ')');

        const calageMs = getTimeInMs(atk.heureArrivee);
        const arrivalMs = arrivalAt * 1000;
        const diff = arrivalMs - calageMs;

        const toleranceMin = atk.toleranceMoins ? -1000 : 0;
        const toleranceMax = atk.tolerancePlus ? 1000 : 0;

        const diffSec = Math.round(diff / 1000);
        const signe = diffSec > 0 ? '+' : '';

        console.log('[CALAGE] [REPONSE] Heure cible:', atk.heureArrivee, '(', calageMs, 'ms)');
        console.log('[CALAGE] [REPONSE] Heure arrivee:', formatTime(arrivalMs), '(', arrivalMs, 'ms)');
        console.log('[CALAGE] [REPONSE] Difference:', signe + diffSec + 's');
        console.log('[CALAGE] [REPONSE] Tolerance: [', toleranceMin/1000, 's,', toleranceMax/1000, 's ]');

        if (diff >= toleranceMin && diff <= toleranceMax) {
            console.log('[CALAGE] [SUCCES] ========================================');
            console.log('[CALAGE] [SUCCES] CALAGE REUSSI !');
            console.log('[CALAGE] [SUCCES] Tentatives:', atk.tentatives);
            console.log('[CALAGE] [SUCCES] Arrivee:', formatTime(arrivalMs));
            console.log('[CALAGE] [SUCCES] ========================================');
            
            log('CALAGE', 'SUCCES! Arrivee: ' + formatTime(arrivalMs) + ' (' + atk.tentatives + ' essais)', 'success');
            atk.status = 'succes';
            saveData();
            majListeAttaques();
            majStatus('SUCCES! ' + formatTime(arrivalMs));
            calageData.attaqueEnCours = null;
            
            afficherNotification(
                'Calage reussi !',
                atk.sourceId + ' -> ' + atk.cibleId + ' | Arrivee: ' + formatTime(arrivalMs) + ' (' + atk.tentatives + ' essais)',
                'success'
            );

            sendWebhook('Calage Reussi!', 
                `**${atk.sourceId} -> ${atk.cibleId}**\nArrivee: ${formatTime(arrivalMs)}\nTentatives: ${atk.tentatives}`);
            return;
        }

        console.log('[CALAGE] [CALAGE] Hors tolerance (' + signe + diffSec + 's), annulation...');
        log('CALAGE', 'Hors tolerance (' + signe + diffSec + 's), annulation...', 'warning');
        majStatus('Calage ' + signe + diffSec + 's - Retry...');

        annulerCommande(commandId).then(function() {
            console.log('[CALAGE] [ANNULATION] Commande annulee avec succes');
            atk.tentatives++;
            saveData();
            majListeAttaques();

            console.log('[CALAGE] [ATTENTE] Attente retour des troupes...');
            majStatus('Attente troupes... (#' + atk.tentatives + ')');

            verifierTroupesRevenues(atk.unites).then(function() {
                console.log('[CALAGE] [ATTENTE] Troupes revenues, renvoi !');
                envoyerAttaque(atk);
            }).catch(function() {
                console.log('[CALAGE] [ATTENTE] Timeout troupes, renvoi quand meme...');
                setTimeout(function() {
                    envoyerAttaque(atk);
                }, 1500);
            });

        }).catch(function(err) {
            console.error('[CALAGE] [ANNULATION] Erreur:', err);
            log('CALAGE', 'Erreur annulation: ' + err, 'error');
            majStatus('Erreur annulation');
            calageData.attaqueEnCours = null;
        });

    } catch (e) {
        console.error('[CALAGE] [REPONSE] Erreur parsing:', e);
        log('CALAGE', 'Erreur parsing: ' + e.message, 'error');
        calageData.attaqueEnCours = null;
    }
}

function annulerCommande(commandId) {
    console.log('[CALAGE] [ANNULATION] Annulation de la commande:', commandId);
    return new Promise(function(resolve, reject) {
        const townId = uw.Game.townId;
        const csrfToken = uw.Game.csrfToken;

        const jsonPayload = JSON.stringify({
            model_url: 'Commands',
            action_name: 'cancelCommand',
            captcha: null,
            arguments: {
                id: commandId,
                town_id: townId,
                nl_init: true
            }
        });

        const url = '/game/frontend_bridge?town_id=' + townId + '&action=execute&h=' + csrfToken;

        uw.$.ajax({
            url: url,
            type: 'POST',
            data: { json: jsonPayload },
            success: function(response) {
                console.log('[CALAGE] [ANNULATION] Reponse OK');
                resolve(response);
            },
            error: function(xhr, status, error) {
                console.error('[CALAGE] [ANNULATION] Erreur:', error);
                reject(error);
            }
        });
    });
}

function verifierTroupesRevenues(unitesEnvoyees) {
    console.log('[CALAGE] [TROUPES] Verification retour des troupes');
    return new Promise(function(resolve, reject) {
        const startTime = Date.now();
        let checkCount = 0;

        const interval = setInterval(function() {
            checkCount++;

            if (Date.now() - startTime > TIMEOUT_VERIFICATION) {
                console.log('[CALAGE] [TROUPES] Timeout apres', checkCount, 'verifications');
                clearInterval(interval);
                reject('Timeout');
                return;
            }

            majStatus('Attente troupes... (' + checkCount + ')');

            try {
                if (uw.ITowns && uw.ITowns.getTown) {
                    const town = uw.ITowns.getTown(uw.Game.townId);
                    if (town && town.units) {
                        const unitsInTown = town.units();
                        let toutesRevenues = true;

                        for (const unitType in unitesEnvoyees) {
                            if (unitesEnvoyees.hasOwnProperty(unitType)) {
                                const countEnvoye = unitesEnvoyees[unitType];
                                const countDispo = unitsInTown[unitType] || 0;
                                if (countDispo < countEnvoye) {
                                    toutesRevenues = false;
                                    break;
                                }
                            }
                        }

                        if (toutesRevenues) {
                            console.log('[CALAGE] [TROUPES] Troupes revenues apres', checkCount, 'verifications');
                            clearInterval(interval);
                            resolve(true);
                            return;
                        }
                    }
                }
            } catch (e) {}

        }, INTERVALLE_VERIFICATION);
    });
}

function sendWebhook(title, desc) {
    if (!calageData.settings.webhook) return;
    GM_xmlhttpRequest({
        method: 'POST',
        url: calageData.settings.webhook,
        data: JSON.stringify({
            embeds: [{
                title: title,
                description: desc,
                color: 15844367,
                footer: { text: 'Grepolis Ultimate - Calage Attaque' },
                timestamp: new Date().toISOString()
            }]
        }),
        headers: { 'Content-Type': 'application/json' }
    });
}

function saveData() {
    GM_setValue(STORAGE_KEY, JSON.stringify({
        attaques: calageData.attaques,
        botActif: calageData.botActif,
        plans: calageData.plans,
        settings: calageData.settings
    }));
}

function loadData() {
    const saved = GM_getValue(STORAGE_KEY);
    if (saved) {
        try {
            const d = JSON.parse(saved);
            calageData.attaques = d.attaques || [];
            calageData.botActif = d.botActif || false;
            calageData.plans = d.plans || [];
            calageData.settings = d.settings || { webhook: '' };
        } catch(e) {}
    }
}
