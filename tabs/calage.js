const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

const STORAGE_KEY = 'gu_calage_data';
const INTERVALLE_VERIFICATION = 200;
const TIMEOUT_VERIFICATION = 30000;
const AVANCE_LANCEMENT = 20000;
const LIMITE_HORS_TOLERANCE = 10000;
const DELAI_APRES_ANNULATION = 500;

let calageData = {
    attaques: [],
    attaqueEnCours: null,
    botActif: false,
    intervalCheck: null,
    plans: [],
    plansActifs: {},
    settings: { webhook: '' }
};

let notifId = 0;
let notifsContainer = null;
let dernieresNotifs = {};
let dernierLogCheck = 0;
let calculEnCours = {};
let planEnEdition = null;

function genererID() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

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
                    <div class="calage-row">
                        <label>Heros:</label>
                        <select id="calage-edit-hero" class="calage-select">
                            <option value="">-- Aucun heros --</option>
                        </select>
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
                    <h3 style="display:flex;justify-content:space-between;align-items:center;">
                        <span>📋 Attaques du plan (<span id="calage-edit-attaques-count">0</span>)</span>
                        <button class="calage-btn calage-btn-primary calage-btn-sm" id="calage-btn-calc-all" style="font-size:10px;">⏱️ Calculer tous</button>
                    </h3>
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
            .calage-plan-item.calage-plan-actif { 
                border-color: rgba(76,175,80,0.7); 
                background: rgba(76,175,80,0.1);
                box-shadow: 0 0 10px rgba(76,175,80,0.3);
            }
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
            .calage-status-echec { background: #E53935; color: white; }
            
            .calage-attaque-item.echec { border-color: #E53935; background: rgba(229,57,53,0.1); }
            
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

    document.querySelectorAll('.calage-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            changerVue(this.getAttribute('data-view'));
        });
    });

    const btnCreerPlan = document.getElementById('calage-btn-creer-plan');
    if (btnCreerPlan) btnCreerPlan.onclick = creerPlan;

    const btnAjouterAttaque = document.getElementById('calage-btn-ajouter-attaque');
    if (btnAjouterAttaque) btnAjouterAttaque.onclick = ajouterAttaqueAuPlan;

    const btnRetour = document.getElementById('calage-btn-retour');
    if (btnRetour) btnRetour.onclick = function() { changerVue('plans'); };

    const btnSauver = document.getElementById('calage-btn-sauver-plan');
    if (btnSauver) btnSauver.onclick = sauvegarderPlanEdite;

    const btnCalcAll = document.getElementById('calage-btn-calc-all');
    if (btnCalcAll) btnCalcAll.onclick = calculerTousTempsTrajet;

    const btnToggleBot = document.getElementById('calage-btn-toggle-bot');
    if (btnToggleBot) btnToggleBot.onclick = function() { 
        if (planEnEdition !== null) {
            const plan = calageData.plans[planEnEdition];
            if (plan) {
                togglePlan(plan.id);
            }
        } else {
            toggleBot(!calageData.botActif); 
        }
    };

    const editSource = document.getElementById('calage-edit-source');
    if (editSource) editSource.onchange = majUnitsEdition;

    majListePlans();
    updateBotButton();

    uw.$.Observer(uw.GameEvents.town.town_switch).subscribe('gu_calage', function() {
        if (planEnEdition !== null) {
            majUnitsEdition();
        }
    });

    if (calageData.botActif) {
        demarrerBot();
    }

    log('CALAGE', 'Module initialise - ' + calageData.plans.length + ' plans', 'info');
};

module.isActive = function() {
    if (calageData.botActif) return true;
    for (let planId in calageData.plansActifs) {
        if (calageData.plansActifs[planId]) return true;
    }
    return false;
};

module.onActivate = function(container) {
    majListePlans();
    updateBotButton();
};

function changerVue(vue) {
    document.querySelectorAll('.calage-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.calage-view').forEach(function(v) { v.classList.remove('active'); });

    const tab = document.querySelector('.calage-tab[data-view="' + vue + '"]');
    const view = document.getElementById('calage-view-' + vue);

    if (tab) tab.classList.add('active');
    if (view) view.classList.add('active');

    if (vue === 'plans') {
        document.getElementById('calage-tab-edition').style.display = 'none';
        planEnEdition = null;
        majListePlans();
        updateBotButton();
    }
}

function majListePlans() {
    const container = document.getElementById('calage-plans-liste');
    if (!container) return;

    if (calageData.plans.length === 0) {
        container.innerHTML = '<div class="calage-empty">' +
            '<div class="calage-empty-icon">📋</div>' +
            '<div class="calage-empty-text">Aucun plan cree</div>' +
            '<div class="calage-empty-hint">Cliquez sur "Nouveau Plan" pour commencer</div>' +
        '</div>';
        return;
    }

    container.innerHTML = '';

    calageData.plans.forEach(function(plan, index) {
        const attaquesEnAttente = plan.attaques.filter(function(a) { return a.status === 'attente'; }).length;
        const attaquesSucces = plan.attaques.filter(function(a) { return a.status === 'succes'; }).length;
        const attaquesEchec = plan.attaques.filter(function(a) { return a.status === 'echec'; }).length;
        const planActif = calageData.plansActifs[plan.id] === true;
        const statusClass = planActif ? 'calage-plan-actif' : '';
        const btnToggleClass = planActif ? 'calage-btn-danger' : 'calage-btn-success';
        const btnToggleText = planActif ? '⏹️ Stop' : '▶️ Start';

        const div = document.createElement('div');
        div.className = 'calage-plan-item ' + statusClass;
        div.innerHTML = 
            '<div class="calage-plan-header">' +
                '<div>' +
                    '<div class="calage-plan-name">' + (plan.type === 'attack' ? '⚔️' : '🛡️') + ' ' + plan.nom + 
                        (planActif ? ' <span style="color:#4CAF50;font-size:10px;">(ACTIF)</span>' : '') + '</div>' +
                    '<div class="calage-plan-target">Cible: ' + plan.cibleId + '</div>' +
                '</div>' +
                '<div class="calage-plan-actions">' +
                    '<button class="calage-btn ' + btnToggleClass + ' calage-btn-sm btn-toggle" data-index="' + index + '" data-id="' + plan.id + '">' + btnToggleText + '</button>' +
                    '<button class="calage-btn calage-btn-primary calage-btn-sm btn-edit" data-index="' + index + '">✏️</button>' +
                    '<button class="calage-btn calage-btn-danger calage-btn-sm btn-suppr" data-index="' + index + '">🗑️</button>' +
                '</div>' +
            '</div>' +
            '<div class="calage-plan-stats">' +
                '<span>📊 ' + plan.attaques.length + ' attaques</span>' +
                '<span>⏳ ' + attaquesEnAttente + ' en attente</span>' +
                '<span>✅ ' + attaquesSucces + ' reussies</span>' +
                (attaquesEchec > 0 ? '<span style="color:#E53935;">❌ ' + attaquesEchec + ' echecs</span>' : '') +
            '</div>';
        container.appendChild(div);
    });

    container.querySelectorAll('.btn-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const planId = this.getAttribute('data-id');
            togglePlan(planId);
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
            const plan = calageData.plans[idx];
            if (calageData.plansActifs[plan.id]) {
                afficherNotification('Erreur', 'Arretez le plan avant de le supprimer', 'warning');
                return;
            }
            if (confirm('Supprimer le plan "' + plan.nom + '" ?')) {
                delete calageData.plansActifs[plan.id];
                calageData.plans.splice(idx, 1);
                saveData();
                majListePlans();
                afficherNotification('Plan supprime', 'Le plan a ete supprime', 'info');
            }
        });
    });
}

function togglePlan(planId) {
    const plan = calageData.plans.find(function(p) { return p.id === planId; });
    if (!plan) return;

    if (calageData.plansActifs[planId]) {
        calageData.plansActifs[planId] = false;
        
        if (calageData.attaqueEnCours && calageData.attaqueEnCours._planId === planId) {
            log('CALAGE', 'Arret de l\'attaque en cours du plan', 'warning');
            calageData.attaqueEnCours = null;
        }
        
        log('CALAGE', 'Plan "' + plan.nom + '" arrete', 'info');
        afficherNotification('Plan arrete', plan.nom, 'info');
    } else {
        calageData.plansActifs[planId] = true;
        log('CALAGE', 'Plan "' + plan.nom + '" demarre', 'success');
        afficherNotification('Plan demarre', plan.nom + ' - ' + plan.attaques.filter(function(a) { return a.status === 'attente'; }).length + ' attaques en attente', 'success');
        
        if (!calageData.intervalCheck) {
            demarrerBot();
        }
    }

    saveData();
    majListePlans();
    updateBotButton();
    
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function creerPlan() {
    const nom = document.getElementById('calage-new-nom').value.trim();
    const type = document.getElementById('calage-new-type').value;
    const cible = parseInt(document.getElementById('calage-new-cible').value);
    const tolMoins = parseInt(document.getElementById('calage-new-tol-moins').value) || 0;
    const tolPlus = parseInt(document.getElementById('calage-new-tol-plus').value) || 0;

    if (!nom || !cible) {
        afficherNotification('Erreur', 'Veuillez remplir le nom et la ville cible', 'warning');
        return;
    }

    const plan = {
        id: genererID(),
        nom: nom,
        type: type,
        cibleId: cible,
        toleranceMoins: tolMoins,
        tolerancePlus: tolPlus,
        attaques: [],
        dateCreation: Date.now()
    };

    calageData.plans.push(plan);
    saveData();

    document.getElementById('calage-new-nom').value = '';
    document.getElementById('calage-new-cible').value = '';

    editerPlan(calageData.plans.length - 1);

    afficherNotification('Plan cree', 'Le plan "' + nom + '" a ete cree', 'success');
}

function editerPlan(index) {
    const plan = calageData.plans[index];
    if (!plan) return;

    planEnEdition = index;

    document.getElementById('calage-tab-edition').style.display = 'block';
    document.getElementById('calage-edit-plan-id').value = plan.id;
    document.getElementById('calage-edit-plan-nom').textContent = plan.nom;
    document.getElementById('calage-edit-nom').value = plan.nom;
    document.getElementById('calage-edit-cible').value = plan.cibleId;
    document.getElementById('calage-edit-tol-moins').value = plan.toleranceMoins || 0;
    document.getElementById('calage-edit-tol-plus').value = plan.tolerancePlus || 0;

    const select = document.getElementById('calage-edit-source');
    const villes = getVillesJoueur();
    select.innerHTML = '';
    villes.forEach(function(v) {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name + ' (' + v.id + ')';
        if (v.id === uw.Game.townId) opt.selected = true;
        select.appendChild(opt);
    });

    majUnitsEdition();
    majAttaquesPlan();
    updateBotButton();

    changerVue('edition');
}

function getHeroInTown(townId) {
    try {
        const town = uw.ITowns.getTown(townId || uw.Game.townId);
        if (town && typeof town.getHero === 'function') {
            const hero = town.getHero();
            if (hero) {
                return {
                    id: hero.getId ? hero.getId() : hero.id,
                    name: hero.getName ? hero.getName() : hero.name,
                    type: hero.getType ? hero.getType() : hero.type
                };
            }
        }
        
        if (uw.MM && uw.MM.getModels) {
            const models = uw.MM.getModels();
            if (models.Heroes) {
                for (let heroId in models.Heroes) {
                    const hero = models.Heroes[heroId];
                    const attrs = hero.attributes || hero;
                    if (attrs.home_town_id == townId || attrs.town_id == townId) {
                        if (!attrs.is_traveling && attrs.current_town_id == townId) {
                            return {
                                id: attrs.id || heroId,
                                name: attrs.name || getHeroDisplayName(attrs.type),
                                type: attrs.type
                            };
                        }
                    }
                }
            }
            
            if (models.PlayerHero) {
                for (let heroId in models.PlayerHero) {
                    const hero = models.PlayerHero[heroId];
                    const attrs = hero.attributes || hero;
                    if ((attrs.home_town_id == townId || attrs.town_id == townId) && 
                        !attrs.is_traveling && attrs.current_town_id == townId) {
                        return {
                            id: attrs.id || heroId,
                            name: attrs.name || getHeroDisplayName(attrs.type),
                            type: attrs.type
                        };
                    }
                }
            }
        }
    } catch (e) {
        log('CALAGE', 'Erreur getHeroInTown: ' + e.message, 'warning');
    }
    return null;
}

function getHeroDisplayName(heroType) {
    const heroNames = {
        'andromeda': 'Andromede',
        'odysseus': 'Ulysse',
        'hercules': 'Hercule',
        'helen': 'Helene',
        'ferkyon': 'Ferkyon',
        'leonidas': 'Leonidas',
        'urephon': 'Urephon',
        'zuretha': 'Zuretha',
        'rekonos': 'Rekonos',
        'jason': 'Jason',
        'deimos': 'Deimos',
        'pariphaistes': 'Pariphaistes',
        'chiron': 'Chiron',
        'democritos': 'Democritos',
        'apheledes': 'Apheledes',
        'atalanta': 'Atalante',
        'iason': 'Iason',
        'themistocles': 'Themistocle',
        'orpheus': 'Orphee',
        'telemachos': 'Telemaque',
        'daidalos': 'Dedale',
        'agamemnon': 'Agamemnon',
        'aristophanes': 'Aristophane',
        'pelops': 'Pelops',
        'hector': 'Hector',
        'myrmidon': 'Myrmidon',
        'christopholus': 'Christopholus',
        'medea': 'Medee'
    };
    return heroNames[heroType] || heroType || 'Heros';
}

function majHeroSelect(townId) {
    const heroSelect = document.getElementById('calage-edit-hero');
    if (!heroSelect) return;
    
    heroSelect.innerHTML = '<option value="">-- Aucun heros --</option>';
    
    const hero = getHeroInTown(townId);
    if (hero) {
        const opt = document.createElement('option');
        opt.value = hero.id;
        opt.textContent = '⚔️ ' + hero.name + (hero.type ? ' (' + hero.type + ')' : '');
        heroSelect.appendChild(opt);
        log('CALAGE', 'Heros disponible: ' + hero.name, 'info');
    } else {
        log('CALAGE', 'Aucun heros dans cette ville', 'info');
    }
}

function majUnitsEdition() {
    const sourceId = parseInt(document.getElementById('calage-edit-source').value);
    const unitesDispo = getUnitesDispo(sourceId);

    const gridTerre = document.getElementById('calage-edit-units-terre');
    const gridNaval = document.getElementById('calage-edit-units-naval');

    gridTerre.innerHTML = '';
    gridNaval.innerHTML = '';

    GROUND_UNITS.forEach(function(unitId) {
        const dispo = unitesDispo[unitId] || 0;
        if (dispo > 0) {
            gridTerre.appendChild(creerCarteUnite(unitId, dispo));
        }
    });

    NAVAL_UNITS.forEach(function(unitId) {
        const dispo = unitesDispo[unitId] || 0;
        if (dispo > 0) {
            gridNaval.appendChild(creerCarteUnite(unitId, dispo));
        }
    });

    if (gridTerre.children.length === 0) {
        gridTerre.innerHTML = '<div style="grid-column: span 5; text-align:center; color:#8B8B83; padding:20px; font-style:italic;">Aucune unite terrestre</div>';
    }
    if (gridNaval.children.length === 0) {
        gridNaval.innerHTML = '<div style="grid-column: span 5; text-align:center; color:#8B8B83; padding:20px; font-style:italic;">Aucune unite navale</div>';
    }

    majHeroSelect(sourceId);
    majCapacite();
}

function creerCarteUnite(unitId, dispo) {
    const unitData = uw.GameData.units[unitId] || {};
    const unitName = unitData.name || unitId;
    
    const div = document.createElement('div');
    div.className = 'calage-unit-card';
    div.innerHTML = 
        '<div class="unit_icon40x40 ' + unitId + '" style="margin:0 auto 4px;"></div>' +
        '<div class="unit-name">' + unitName + '</div>' +
        '<div class="unit-dispo">Dispo: ' + dispo + '</div>' +
        '<input type="number" min="0" max="' + dispo + '" value="0" data-unit="' + unitId + '" data-max="' + dispo + '">';

    const input = div.querySelector('input');
    input.addEventListener('input', function() {
        let val = parseInt(this.value) || 0;
        const max = parseInt(this.getAttribute('data-max'));

        if (val > max) {
            this.value = max;
            val = max;
        } else if (val < 0) {
            this.value = 0;
            val = 0;
        }

        div.classList.toggle('has-units', val > 0);
        majCapacite();
    });

    return div;
}

function majCapacite() {
    const container = document.getElementById('calage-capacity-container');
    const fill = document.getElementById('calage-capacity-fill');
    const text = document.getElementById('calage-capacity-text');
    
    if (!container) return;

    const units = recupererUnitesEdition();
    const sourceId = parseInt(document.getElementById('calage-edit-source').value) || uw.Game.townId;
    
    if (!hasGroundUnits(units)) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    const boatInfo = calculateRequiredBoats(units, sourceId);
    
    text.textContent = boatInfo.totalCapacity + ' / ' + boatInfo.totalPop + ' pop';
    fill.style.width = Math.min(100, boatInfo.percentage) + '%';
    
    fill.classList.remove('warning', 'error');
    if (boatInfo.percentage >= 100) {
        fill.classList.remove('warning', 'error');
    } else if (boatInfo.percentage >= 50) {
        fill.classList.add('warning');
    } else {
        fill.classList.add('error');
    }
}

function recupererUnitesEdition() {
    const units = {};
    document.querySelectorAll('#calage-edit-units-terre input, #calage-edit-units-naval input').forEach(function(input) {
        const unitId = input.getAttribute('data-unit');
        const val = parseInt(input.value) || 0;
        if (val > 0) {
            units[unitId] = val;
        }
    });
    return units;
}

function ajouterAttaqueAuPlan() {
    if (planEnEdition === null) return;

    const plan = calageData.plans[planEnEdition];
    if (!plan) return;

    const sourceId = parseInt(document.getElementById('calage-edit-source').value);
    const heure = document.getElementById('calage-edit-heure').value;
    const heroSelect = document.getElementById('calage-edit-hero');
    const heroId = heroSelect ? heroSelect.value : '';
    const heroName = heroSelect && heroSelect.selectedIndex > 0 ? heroSelect.options[heroSelect.selectedIndex].text : '';
    const units = recupererUnitesEdition();

    if (!sourceId || !heure) {
        afficherNotification('Erreur', 'Veuillez selectionner une ville et une heure', 'warning');
        return;
    }

    if (Object.keys(units).length === 0) {
        afficherNotification('Erreur', 'Veuillez selectionner des unites', 'warning');
        return;
    }

    const villes = getVillesJoueur();
    const ville = villes.find(function(v) { return v.id === sourceId; });
    const villeNom = ville ? ville.name : ('Ville ' + sourceId);

    const attaque = {
        id: genererID(),
        sourceId: sourceId,
        sourceNom: villeNom + ' (' + sourceId + ')',
        heureArrivee: heure,
        heureEnvoi: null,
        travelTime: null,
        unites: units,
        heroId: heroId || null,
        heroName: heroName || null,
        status: 'attente',
        tentatives: 0
    };

    plan.attaques.push(attaque);
    saveData();

    document.querySelectorAll('#calage-edit-units-terre input, #calage-edit-units-naval input').forEach(function(input) {
        input.value = 0;
        input.parentElement.classList.remove('has-units');
    });
    if (heroSelect) heroSelect.selectedIndex = 0;
    majCapacite();

    majAttaquesPlan();

    const heroInfo = heroId ? ' avec ' + heroName : '';
    afficherNotification('Attaque ajoutee', villeNom + ' -> ' + plan.cibleId + ' @ ' + heure + heroInfo, 'success');
}

function majAttaquesPlan() {
    if (planEnEdition === null) return;

    const plan = calageData.plans[planEnEdition];
    if (!plan) return;

    const container = document.getElementById('calage-edit-attaques-liste');
    const countEl = document.getElementById('calage-edit-attaques-count');

    countEl.textContent = plan.attaques.length;

    if (plan.attaques.length === 0) {
        container.innerHTML = '<div class="calage-empty" style="padding:20px;">' +
            '<div class="calage-empty-text">Aucune attaque dans ce plan</div>' +
        '</div>';
        return;
    }

    container.innerHTML = '';

    plan.attaques.forEach(function(atk, idx) {
        const unitsList = Object.keys(atk.unites).map(function(u) { 
            return u + ':' + atk.unites[u]; 
        }).join(', ');

        const heroInfo = atk.heroId && atk.heroName ? ' | ⚔️ ' + atk.heroName : '';

        const statusClass = atk.status === 'succes' ? 'succes' : (atk.status === 'echec' ? 'echec' : (atk.status === 'encours' ? 'encours' : ''));
        const statusLabel = atk.status === 'succes' ? 'Succes' : (atk.status === 'echec' ? 'Echec' : (atk.status === 'encours' ? 'En cours' : 'En attente'));
        const statusBadgeClass = atk.status === 'succes' ? 'calage-status-succes' : (atk.status === 'echec' ? 'calage-status-echec' : (atk.status === 'encours' ? 'calage-status-encours' : 'calage-status-attente'));

        const travelTimeStr = atk.travelTime ? formatDuration(atk.travelTime) : '--';
        const heureEnvoiStr = atk.heureEnvoi || '--:--:--';
        const hasCalc = atk.travelTime ? true : false;
        const isCalculating = calculEnCours[atk.id] === true;

        const div = document.createElement('div');
        div.className = 'calage-attaque-item ' + statusClass;
        div.innerHTML = 
            '<div class="calage-attaque-ville">' +
                '<div class="calage-attaque-ville-name">' + atk.sourceNom + heroInfo + '</div>' +
                '<div class="calage-attaque-ville-units">' + unitsList + '</div>' +
                '<div class="calage-attaque-trajet" style="font-size:10px;margin-top:4px;color:' + (hasCalc ? '#4CAF50' : '#FF9800') + ';">' +
                    '⏱️ Trajet: ' + travelTimeStr + ' | 🚀 Depart: ' + heureEnvoiStr +
                    (isCalculating ? ' <span style="color:#64B5F6;">(calcul...)</span>' : '') +
                '</div>' +
            '</div>' +
            '<div class="calage-attaque-heure">' +
                atk.heureArrivee +
                '<small>Arrivee</small>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:4px;align-items:center;">' +
                '<span class="calage-attaque-status ' + statusBadgeClass + '">' + statusLabel + '</span>' +
                (atk.tentatives > 0 ? '<span style="font-size:9px;color:#8B8B83;">' + atk.tentatives + ' essai(s)</span>' : '') +
                (atk.status === 'echec' && atk.erreur ? '<span style="font-size:9px;color:#E53935;max-width:100px;text-align:center;">' + atk.erreur + '</span>' : '') +
                (atk.status === 'attente' && !hasCalc && !isCalculating ? 
                    '<button class="calage-btn calage-btn-primary calage-btn-sm btn-calc-trajet" data-idx="' + idx + '" style="font-size:9px;padding:3px 6px;">⏱️ Calculer</button>' : '') +
            '</div>' +
            '<button class="calage-btn calage-btn-danger calage-btn-sm btn-suppr-atk" data-idx="' + idx + '">🗑️</button>';
        container.appendChild(div);
    });

    container.querySelectorAll('.btn-suppr-atk').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            plan.attaques.splice(idx, 1);
            saveData();
            majAttaquesPlan();
            afficherNotification('Attaque supprimee', '', 'info');
        });
    });

    container.querySelectorAll('.btn-calc-trajet').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.getAttribute('data-idx'));
            calculerTempsTrajetAttaque(idx);
        });
    });
}

function calculerTempsTrajetAttaque(idx) {
    if (planEnEdition === null) return;
    
    const plan = calageData.plans[planEnEdition];
    if (!plan || !plan.attaques[idx]) return;
    
    const atk = plan.attaques[idx];
    
    if (calculEnCours[atk.id]) {
        log('CALAGE', 'Calcul deja en cours pour cette attaque', 'warning');
        return;
    }
    
    calculEnCours[atk.id] = true;
    log('CALAGE', 'Calcul temps trajet: ' + atk.sourceId + ' -> ' + plan.cibleId, 'info');
    majAttaquesPlan();
    
    const atkForCalc = {
        sourceId: atk.sourceId,
        cibleId: plan.cibleId,
        type: plan.type,
        unites: atk.unites
    };
    
    calculerTempsTrajetPourAttaque(atkForCalc).then(function(tempsTrajetMs) {
        if (tempsTrajetMs) {
            atk.travelTime = tempsTrajetMs;
            const heureArriveeMs = getTimeInMs(atk.heureArrivee);
            const heureEnvoiMs = heureArriveeMs - tempsTrajetMs;
            atk.heureEnvoi = formatTime(heureEnvoiMs);
            saveData();
            
            log('CALAGE', 'Temps trajet: ' + formatDuration(tempsTrajetMs) + ' | Depart: ' + atk.heureEnvoi, 'success');
            afficherNotification(
                'Temps de trajet calcule',
                atk.sourceNom + ' -> ' + plan.cibleId + ': ' + formatDuration(tempsTrajetMs),
                'info'
            );
        }
        delete calculEnCours[atk.id];
        majAttaquesPlan();
    }).catch(function(err) {
        const errMsg = err && err.message ? err.message : String(err);
        log('CALAGE', 'ERREUR calcul temps trajet: ' + errMsg, 'error');
        delete calculEnCours[atk.id];
        majAttaquesPlan();
    });
}

function calculerTousTempsTrajet() {
    if (planEnEdition === null) return;
    
    const plan = calageData.plans[planEnEdition];
    if (!plan || plan.attaques.length === 0) {
        log('CALAGE', 'Aucune attaque a calculer', 'warning');
        return;
    }
    
    let toCalculate = [];
    plan.attaques.forEach(function(atk, idx) {
        if (!atk.travelTime && !calculEnCours[atk.id] && atk.status === 'attente') {
            toCalculate.push(idx);
        }
    });
    
    if (toCalculate.length === 0) {
        log('CALAGE', 'Tous les temps de trajet sont deja calcules', 'info');
        afficherNotification('Info', 'Tous les temps de trajet sont deja calcules', 'info');
        return;
    }
    
    log('CALAGE', 'Calcul de ' + toCalculate.length + ' temps de trajet...', 'info');
    afficherNotification('Calcul en cours', toCalculate.length + ' attaque(s) a calculer', 'info');
    
    let currentIndex = 0;
    
    function calculerProchain() {
        if (currentIndex >= toCalculate.length) {
            log('CALAGE', 'Tous les calculs termines', 'success');
            afficherNotification('Calculs termines', toCalculate.length + ' temps de trajet calcules', 'success');
            return;
        }
        
        const idx = toCalculate[currentIndex];
        currentIndex++;
        
        calculerTempsTrajetAttaque(idx);
        
        setTimeout(calculerProchain, 3000);
    }
    
    calculerProchain();
}

function sauvegarderPlanEdite() {
    if (planEnEdition === null) return;

    const plan = calageData.plans[planEnEdition];
    if (!plan) return;

    plan.nom = document.getElementById('calage-edit-nom').value.trim() || plan.nom;
    plan.cibleId = parseInt(document.getElementById('calage-edit-cible').value) || plan.cibleId;
    plan.toleranceMoins = parseInt(document.getElementById('calage-edit-tol-moins').value) || 0;
    plan.tolerancePlus = parseInt(document.getElementById('calage-edit-tol-plus').value) || 0;

    saveData();

    afficherNotification('Plan sauvegarde', 'Le plan "' + plan.nom + '" a ete sauvegarde', 'success');
}

function updateBotButton() {
    const btn = document.getElementById('calage-btn-toggle-bot');
    const status = document.getElementById('calage-status');
    
    let plansActifsCount = 0;
    for (let planId in calageData.plansActifs) {
        if (calageData.plansActifs[planId]) plansActifsCount++;
    }
    
    if (planEnEdition !== null) {
        const plan = calageData.plans[planEnEdition];
        if (plan) {
            const planActif = calageData.plansActifs[plan.id] === true;
            if (planActif) {
                if (btn) {
                    btn.textContent = '⏹️ Arreter ce plan';
                    btn.className = 'calage-btn calage-btn-danger calage-btn-sm';
                }
                if (status) {
                    status.textContent = 'Status: Plan "' + plan.nom + '" actif';
                }
            } else {
                if (btn) {
                    btn.textContent = '▶️ Demarrer ce plan';
                    btn.className = 'calage-btn calage-btn-success calage-btn-sm';
                }
                if (status) {
                    status.textContent = 'Status: Plan "' + plan.nom + '" en attente';
                }
            }
            return;
        }
    }
    
    if (calageData.botActif || plansActifsCount > 0) {
        if (btn) {
            btn.textContent = '⏹️ Tout arreter';
            btn.className = 'calage-btn calage-btn-danger calage-btn-sm';
        }
        if (status) {
            status.textContent = 'Status: ' + plansActifsCount + ' plan(s) actif(s)';
        }
    } else {
        if (btn) {
            btn.textContent = '▶️ Demarrer';
            btn.className = 'calage-btn calage-btn-success calage-btn-sm';
        }
        if (status) status.textContent = 'Status: En attente';
    }
}

function toggleBot(enabled) {
    if (enabled) {
        calageData.botActif = true;
        demarrerBot();
    } else {
        calageData.botActif = false;
        for (let planId in calageData.plansActifs) {
            calageData.plansActifs[planId] = false;
        }
        arreterBot();
        log('CALAGE', 'Tous les plans arretes', 'info');
    }
    
    updateBotButton();
    majListePlans();
    saveData();
    
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function demarrerBot() {
    let totalAttaques = 0;
    let attaquesEnAttente = 0;
    let plansActifs = 0;
    
    calageData.plans.forEach(function(plan) {
        if (calageData.plansActifs[plan.id]) {
            plansActifs++;
            totalAttaques += plan.attaques.length;
            attaquesEnAttente += plan.attaques.filter(function(a) { return a.status === 'attente'; }).length;
        }
    });
    
    log('CALAGE', 'Bot demarre - ' + plansActifs + ' plans actifs, ' + attaquesEnAttente + ' attaques en attente', 'success');
    majStatus(plansActifs + ' plan(s) actif(s)');
    
    if (plansActifs > 0) {
        afficherNotification('Bot demarre', plansActifs + ' plan(s) actif(s), ' + attaquesEnAttente + ' attaque(s) en attente', 'info');
    }

    if (!calageData.intervalCheck) {
        calageData.intervalCheck = setInterval(function() {
            let hasActivePlan = false;
            for (let planId in calageData.plansActifs) {
                if (calageData.plansActifs[planId]) {
                    hasActivePlan = true;
                    break;
                }
            }
            if (!hasActivePlan && !calageData.botActif) return;
            verifierEtLancerAttaque();
        }, 500);
    }
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

function verifierEtLancerAttaque() {
    if (calageData.attaqueEnCours) {
        return;
    }

    const maintenant = Date.now();
    let attaqueALancer = null;
    let planDeLAttaque = null;
    
    const doLog = (maintenant - dernierLogCheck) >= 10000;
    if (doLog) {
        dernierLogCheck = maintenant;
        log('CALAGE', 'Verification des attaques a ' + formatTime(maintenant), 'info');
    }

    for (let p = 0; p < calageData.plans.length; p++) {
        const plan = calageData.plans[p];
        
        if (!calageData.plansActifs[plan.id]) {
            continue;
        }
        
        for (let i = 0; i < plan.attaques.length; i++) {
            const atk = plan.attaques[i];

            if (atk.status !== 'attente') continue;
            
            const heureArriveeMs = getTimeInMs(atk.heureArrivee);
            let tempsAvantArrivee = heureArriveeMs - maintenant;
            
            if (tempsAvantArrivee < -60000) {
                tempsAvantArrivee += 24 * 60 * 60 * 1000;
            }
            
            const notifKey = 'atk_' + atk.id;
            
            if (!atk.travelTime && !calculEnCours[atk.id]) {
                if (tempsAvantArrivee > 0 && tempsAvantArrivee < 2 * 60 * 60 * 1000) {
                    log('CALAGE', 'Calcul temps trajet: ' + atk.sourceId + ' -> ' + plan.cibleId, 'info');
                    calculEnCours[atk.id] = true;
                    
                    const atkForCalc = {
                        sourceId: atk.sourceId,
                        cibleId: plan.cibleId,
                        type: plan.type,
                        unites: atk.unites
                    };
                    
                    calculerTempsTrajetPourAttaque(atkForCalc).then(function(tempsTrajetMs) {
                        if (tempsTrajetMs) {
                            atk.travelTime = tempsTrajetMs;
                            const heureEnvoiMs = heureArriveeMs - tempsTrajetMs;
                            atk.heureEnvoi = formatTime(heureEnvoiMs);
                            saveData();
                            if (planEnEdition !== null) majAttaquesPlan();
                            
                            log('CALAGE', 'Temps trajet: ' + formatDuration(tempsTrajetMs) + ' | Depart: ' + atk.heureEnvoi, 'success');
                            
                            afficherNotification(
                                'Temps de trajet calcule',
                                atk.sourceNom + ' -> ' + plan.cibleId + ': ' + formatDuration(tempsTrajetMs) + ' | Depart: ' + atk.heureEnvoi,
                                'info'
                            );
                        }
                        delete calculEnCours[atk.id];
                    }).catch(function(err) {
                        const errMsg = err && err.message ? err.message : String(err);
                        log('CALAGE', 'ERREUR calcul temps trajet: ' + errMsg, 'error');
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
                log('CALAGE', '[' + plan.nom + '] ' + atk.sourceId + ' -> ' + plan.cibleId + ' | Depart dans ' + minDepart + 'm ' + secDepart + 's', 'info');
            }
            
            if (tempsAvantDepart > 0 && tempsAvantDepart < 120000) {
                majStatus('[' + plan.nom + '] Envoi dans ' + minDepart + 'm ' + secDepart + 's');
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
                    console.log('[CALAGE] [NOTIF] Alerte:', alerte.msg, 'avant le depart', atk.sourceId, '->', plan.cibleId);
                    afficherNotification(
                        'Depart dans ' + alerte.msg,
                        atk.sourceNom + ' -> ' + plan.cibleId + ' | Arrivee ' + atk.heureArrivee,
                        'warning'
                    );
                }
            }

            if (tempsAvantDepart > 0 && tempsAvantDepart < AVANCE_LANCEMENT) {
                console.log('[CALAGE] [TRIGGER] Temps avant depart < 15s (' + tempsAvantDepart + 'ms) - Declenchement !');
                attaqueALancer = atk;
                planDeLAttaque = plan;
                break;
            }
        }
        
        if (attaqueALancer) break;
    }
    
    if (attaqueALancer && planDeLAttaque) {
        console.log('[CALAGE] ========================================');
        console.log('[CALAGE] [LANCEMENT] Attaque trouvee a lancer !');
        console.log('[CALAGE] [LANCEMENT] Source:', attaqueALancer.sourceId);
        console.log('[CALAGE] [LANCEMENT] Cible:', planDeLAttaque.cibleId);
        console.log('[CALAGE] [LANCEMENT] Heure depart:', attaqueALancer.heureEnvoi);
        console.log('[CALAGE] [LANCEMENT] Heure arrivee:', attaqueALancer.heureArrivee);
        console.log('[CALAGE] ========================================');
        
        afficherNotification(
            'Calage automatique',
            attaqueALancer.sourceNom + ' -> ' + planDeLAttaque.cibleId + ' - Lancement !',
            'attack'
        );
        
        const atkComplete = {
            id: attaqueALancer.id,
            sourceId: attaqueALancer.sourceId,
            sourceNom: attaqueALancer.sourceNom,
            cibleId: planDeLAttaque.cibleId,
            type: planDeLAttaque.type,
            heureArrivee: attaqueALancer.heureArrivee,
            heureEnvoi: attaqueALancer.heureEnvoi,
            travelTime: attaqueALancer.travelTime,
            unites: attaqueALancer.unites,
            heroId: attaqueALancer.heroId,
            heroName: attaqueALancer.heroName,
            toleranceMoins: planDeLAttaque.toleranceMoins || 0,
            tolerancePlus: planDeLAttaque.tolerancePlus || 0,
            status: attaqueALancer.status,
            tentatives: attaqueALancer.tentatives || 0,
            _planId: planDeLAttaque.id,
            _planIndex: calageData.plans.indexOf(planDeLAttaque),
            _atkIndex: planDeLAttaque.attaques.indexOf(attaqueALancer)
        };
        
        lancerAttaque(atkComplete);
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
    
    if (atk._planIndex !== undefined && atk._atkIndex !== undefined) {
        const planAtk = calageData.plans[atk._planIndex]?.attaques[atk._atkIndex];
        if (planAtk) {
            planAtk.status = 'encours';
            planAtk.tentatives = 1;
        }
    }
    
    saveData();
    if (planEnEdition !== null) majAttaquesPlan();
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
    if (!doitContinuerAttaque(atk)) {
        log('CALAGE', 'Attaque annulee (plan arrete ou attaque terminee)', 'warning');
        return;
    }

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
                if (doitContinuerAttaque(atk)) {
                    atk.tentatives++;
                    console.log('[CALAGE] [ENVOI] Retry apres erreur, tentative #' + atk.tentatives);
                    envoyerAttaque(atk);
                }
            }, 1000);
        }
    });
}

function doitContinuerAttaque(atk) {
    if (calageData.attaqueEnCours !== atk) {
        return false;
    }
    
    if (atk.status === 'succes' || atk.status === 'echec') {
        return false;
    }
    
    if (atk._planId) {
        if (!calageData.plansActifs[atk._planId]) {
            log('CALAGE', 'Plan arrete, abandon de l\'attaque', 'warning');
            calageData.attaqueEnCours = null;
            return false;
        }
    }
    
    return true;
}

function traiterReponseAttaque(response, atk) {
    log('CALAGE', 'Traitement reponse...', 'info');
    
    if (!doitContinuerAttaque(atk)) {
        log('CALAGE', 'Attaque annulee pendant traitement', 'warning');
        return;
    }
    
    if (response.json && response.json.error) {
        const erreur = response.json.error;
        log('CALAGE', 'Erreur serveur: ' + erreur, 'error');
        
        if (erreur.indexOf('unit') !== -1 || erreur.indexOf('Pas assez') !== -1) {
            log('CALAGE', 'Pas assez d\'unites, retry...', 'warning');
            majStatus('Attente unites...');
            setTimeout(function() {
                if (doitContinuerAttaque(atk)) {
                    envoyerAttaque(atk);
                }
            }, 500);
            return;
        }

        marquerAttaqueEchec(atk, 'Erreur: ' + erreur);
        return;
    }

    const notifs = response.json && response.json.notifications;
    if (!notifs) {
        log('CALAGE', 'Pas de notifications dans la reponse', 'error');
        marquerAttaqueEchec(atk, 'Pas de notifications');
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
        log('CALAGE', 'Pas de MovementsUnits trouve', 'error');
        marquerAttaqueEchec(atk, 'Pas de MovementsUnits');
        return;
    }

    try {
        const paramStr = notifs[mvIndex].param_str;
        const movementData = JSON.parse(paramStr).MovementsUnits;
        const arrivalAt = movementData.arrival_at;
        const commandId = movementData.command_id;

        log('CALAGE', 'MovementsUnits: cmd=' + commandId + ' arrivee=' + formatTime(arrivalAt * 1000), 'info');

        const calageMs = getTimeInMs(atk.heureArrivee);
        const arrivalMs = arrivalAt * 1000;
        const diff = arrivalMs - calageMs;

        const toleranceMin = atk.toleranceMoins ? -1000 : 0;
        const toleranceMax = atk.tolerancePlus ? 1000 : 0;

        const diffSec = Math.round(diff / 1000);
        const signe = diffSec > 0 ? '+' : '';

        log('CALAGE', 'Cible: ' + atk.heureArrivee + ' | Arrivee: ' + formatTime(arrivalMs) + ' | Diff: ' + signe + diffSec + 's', 'info');

        if (diff >= toleranceMin && diff <= toleranceMax) {
            log('CALAGE', 'SUCCES! Arrivee: ' + formatTime(arrivalMs) + ' (' + atk.tentatives + ' essais)', 'success');
            atk.status = 'succes';
            
            if (atk._planIndex !== undefined && atk._atkIndex !== undefined) {
                const planAtk = calageData.plans[atk._planIndex]?.attaques[atk._atkIndex];
                if (planAtk) {
                    planAtk.status = 'succes';
                    planAtk.tentatives = atk.tentatives;
                }
            }
            
            saveData();
            if (planEnEdition !== null) majAttaquesPlan();
            majListePlans();
            majStatus('SUCCES! ' + formatTime(arrivalMs));
            calageData.attaqueEnCours = null;
            
            afficherNotification(
                'Calage reussi !',
                (atk.sourceNom || atk.sourceId) + ' -> ' + atk.cibleId + ' | Arrivee: ' + formatTime(arrivalMs) + ' (' + atk.tentatives + ' essais)',
                'success'
            );

            sendWebhook('Calage Reussi!', 
                `**${atk.sourceNom || atk.sourceId} -> ${atk.cibleId}**\nArrivee: ${formatTime(arrivalMs)}\nTentatives: ${atk.tentatives}`);
            return;
        }

        if (diff > toleranceMax + LIMITE_HORS_TOLERANCE) {
            log('CALAGE', 'ABANDON: Hors tolerance de +' + Math.round(diff/1000) + 's (limite: +' + Math.round((toleranceMax + LIMITE_HORS_TOLERANCE)/1000) + 's)', 'error');
            marquerAttaqueEchec(atk, 'Hors tolerance: ' + signe + diffSec + 's (trop tard, abandon)');
            
            afficherNotification(
                'Calage abandonne',
                (atk.sourceNom || atk.sourceId) + ' -> ' + atk.cibleId + ' | Trop tard: ' + signe + diffSec + 's',
                'attack'
            );
            return;
        }

        log('CALAGE', 'Hors tolerance (' + signe + diffSec + 's), annulation...', 'warning');
        majStatus('Calage ' + signe + diffSec + 's - Retry...');

        annulerCommande(commandId).then(function() {
            if (!doitContinuerAttaque(atk)) {
                log('CALAGE', 'Attaque annulee apres annulation commande', 'warning');
                return;
            }
            
            log('CALAGE', 'Commande annulee, attente troupes...', 'info');
            atk.tentatives++;
            
            if (atk._planIndex !== undefined && atk._atkIndex !== undefined) {
                const planAtk = calageData.plans[atk._planIndex]?.attaques[atk._atkIndex];
                if (planAtk) {
                    planAtk.tentatives = atk.tentatives;
                }
            }
            
            saveData();
            if (planEnEdition !== null) majAttaquesPlan();

            majStatus('Attente rapide... (#' + atk.tentatives + ')');

            setTimeout(function() {
                if (!doitContinuerAttaque(atk)) {
                    log('CALAGE', 'Attaque annulee pendant attente', 'warning');
                    return;
                }
                
                log('CALAGE', 'Renvoi apres ' + DELAI_APRES_ANNULATION + 'ms', 'info');
                envoyerAttaque(atk);
            }, DELAI_APRES_ANNULATION);

        }).catch(function(err) {
            const errMsg = err && err.message ? err.message : String(err);
            log('CALAGE', 'Erreur annulation: ' + errMsg, 'error');
            marquerAttaqueEchec(atk, 'Erreur annulation: ' + errMsg);
        });

    } catch (e) {
        log('CALAGE', 'Erreur parsing: ' + e.message, 'error');
        marquerAttaqueEchec(atk, 'Erreur parsing: ' + e.message);
    }
}

function marquerAttaqueEchec(atk, raison) {
    log('CALAGE', 'ECHEC attaque: ' + raison, 'error');
    atk.status = 'echec';
    atk.erreur = raison;
    
    if (atk._planIndex !== undefined && atk._atkIndex !== undefined) {
        const planAtk = calageData.plans[atk._planIndex]?.attaques[atk._atkIndex];
        if (planAtk) {
            planAtk.status = 'echec';
            planAtk.erreur = raison;
        }
    }
    
    saveData();
    if (planEnEdition !== null) majAttaquesPlan();
    majListePlans();
    majStatus('ECHEC: ' + raison);
    calageData.attaqueEnCours = null;
    
    afficherNotification(
        'Echec attaque',
        (atk.sourceNom || atk.sourceId) + ' -> ' + atk.cibleId + ' | ' + raison,
        'attack'
    );
}

function annulerCommande(commandId) {
    log('CALAGE', 'Annulation commande: ' + commandId, 'info');
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

function verifierTroupesRevenues(unitesEnvoyees, sourceId) {
    console.log('[CALAGE] [TROUPES] Verification retour des troupes pour ville', sourceId || uw.Game.townId);
    return new Promise(function(resolve, reject) {
        const startTime = Date.now();
        let checkCount = 0;
        const townIdToCheck = sourceId || uw.Game.townId;

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
                let unitsInTown = null;
                
                if (uw.ITowns && uw.ITowns.getTown) {
                    const town = uw.ITowns.getTown(townIdToCheck);
                    if (town) {
                        if (typeof town.units === 'function') {
                            unitsInTown = town.units();
                        }
                        
                        if (typeof town.unitsOuter === 'function') {
                            const outer = town.unitsOuter();
                            if (outer && unitsInTown) {
                                for (let u in outer) {
                                    unitsInTown[u] = (unitsInTown[u] || 0) + (outer[u] || 0);
                                }
                            }
                        }
                    }
                }
                
                if (!unitsInTown && uw.MM && uw.MM.getModels) {
                    const models = uw.MM.getModels();
                    if (models.Town && models.Town[townIdToCheck]) {
                        const townModel = models.Town[townIdToCheck];
                        if (townModel.attributes && townModel.attributes.units) {
                            unitsInTown = townModel.attributes.units;
                        }
                    }
                }
                
                if (unitsInTown) {
                    let toutesRevenues = true;

                    for (const unitType in unitesEnvoyees) {
                        if (unitesEnvoyees.hasOwnProperty(unitType)) {
                            const countEnvoye = unitesEnvoyees[unitType];
                            const countDispo = unitsInTown[unitType] || 0;
                            
                            if (checkCount === 1 || checkCount % 25 === 0) {
                                console.log('[CALAGE] [TROUPES] ' + unitType + ': ' + countDispo + '/' + countEnvoye);
                            }
                            
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
            } catch (e) {
                console.log('[CALAGE] [TROUPES] Erreur verification:', e.message);
            }

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

