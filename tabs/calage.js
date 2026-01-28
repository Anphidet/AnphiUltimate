const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

const STORAGE_KEY = 'gu_calage_data';
const INTERVALLE_VERIFICATION = 200;
const TIMEOUT_VERIFICATION = 10000;

let calageData = {
    attaques: [],
    attaqueEnCours: null,
    botActif: false,
    intervalCheck: null,
    plans: [],
    settings: { webhook: '' }
};

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

function needsBoats(units) {
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

module.render = function(container) {
    container.innerHTML = `
        <div class="main-control inactive" id="calage-control">
            <div class="control-info">
                <div class="control-label">Calage Attaque</div>
                <div class="control-status" id="calage-status">En attente</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-calage">
                <span class="toggle-slider"></span>
            </label>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📝</span> Nouvelle Attaque</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="options-grid">
                    <div class="option-group">
                        <span class="option-label">Ville source</span>
                        <select class="option-select" id="calage-ville-source"></select>
                    </div>
                    <div class="option-group">
                        <span class="option-label">ID Cible</span>
                        <input type="number" class="option-input" id="calage-ville-cible" placeholder="Ex: 6149">
                    </div>
                    <div class="option-group">
                        <span class="option-label">Heure arrivee</span>
                        <input type="time" class="option-input" id="calage-heure-arrivee" step="1">
                    </div>
                    <div class="option-group">
                        <span class="option-label">Type</span>
                        <select class="option-select" id="calage-type-attaque">
                            <option value="attack">Attaque</option>
                            <option value="support">Soutien</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top: 12px;">
                    <span class="option-label">Tolerance</span>
                    <div style="display: flex; gap: 15px; margin-top: 6px;">
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; color: #BDB76B; font-size: 12px;">
                            <input type="checkbox" id="calage-tolerance-moins"> -1s
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; color: #BDB76B; font-size: 12px;">
                            <input type="checkbox" id="calage-tolerance-plus"> +1s
                        </label>
                    </div>
                </div>
                
                <div id="calage-boat-indicator" style="margin-top: 15px; display: none;">
                    <span class="option-label">Transport des troupes</span>
                    <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px; margin-top: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-size: 11px; color: #BDB76B;">Capacite bateaux</span>
                            <span id="calage-boat-text" style="font-size: 11px; color: #F5DEB3;">0 / 0 pop</span>
                        </div>
                        <div style="background: rgba(0,0,0,0.4); border-radius: 4px; height: 12px; overflow: hidden;">
                            <div id="calage-boat-bar" style="height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); width: 0%; transition: width 0.3s;"></div>
                        </div>
                        <div id="calage-boat-warning" style="margin-top: 6px; font-size: 10px; color: #FF9800; display: none;">
                            Ajoutez des bateaux de transport!
                        </div>
                        <div id="calage-research-info" style="margin-top: 4px; font-size: 9px; color: #8B8B83;"></div>
                    </div>
                </div>
                
                <div style="margin-top: 15px;">
                    <span class="option-label">Troupes terrestres</span>
                    <div class="calage-units-grid" id="calage-ground-units"></div>
                </div>
                
                <div style="margin-top: 15px;">
                    <span class="option-label">Flotte</span>
                    <div class="calage-units-grid" id="calage-naval-units"></div>
                </div>
                
                <button class="btn btn-full" id="calage-btn-ajouter" style="margin-top: 15px;">+ Ajouter Attaque</button>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📅</span> Planificateur</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <p style="font-size: 11px; color: #BDB76B; margin-bottom: 12px;">Planifiez plusieurs attaques sur la meme cible avec des heures differentes.</p>
                <div class="options-grid" style="margin-bottom: 12px;">
                    <div class="option-group">
                        <span class="option-label">Nombre d'attaques</span>
                        <input type="number" class="option-input" id="calage-plan-count" value="1" min="1" max="50">
                    </div>
                    <div class="option-group">
                        <span class="option-label">Intervalle (sec)</span>
                        <input type="number" class="option-input" id="calage-plan-interval" value="1" min="1" max="60">
                    </div>
                </div>
                <button class="btn btn-full" id="calage-btn-planifier">Planifier attaques</button>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>💾</span> Sauvegarder / Charger</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                    <input type="text" class="option-input" id="calage-plan-name" placeholder="Nom du plan" style="flex: 1;">
                    <button class="btn" id="calage-save-plan">Sauver</button>
                </div>
                <div id="calage-plans-list" style="max-height: 120px; overflow-y: auto; margin-bottom: 12px;"></div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn" style="flex: 1;" id="calage-export-plans">Exporter</button>
                    <button class="btn" style="flex: 1;" id="calage-import-plans">Importer</button>
                </div>
                <input type="file" id="calage-import-file" style="display: none;" accept=".json">
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📋</span> Attaques Planifiees (<span id="calage-count">0</span>)</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="calage-liste-attaques"></div>
                <div style="display: flex; justify-content: space-between; margin-top: 12px;">
                    <button class="btn btn-danger" id="calage-btn-clear" style="font-size: 11px; padding: 8px 12px;">Tout supprimer</button>
                </div>
            </div>
        </div>

        <style>
            .calage-units-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
                margin-top: 8px;
            }
            .calage-unit-input {
                display: flex;
                flex-direction: column;
                align-items: center;
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 4px;
                padding: 6px;
            }
            .calage-unit-input .unit-icon {
                width: 40px;
                height: 40px;
                margin-bottom: 2px;
            }
            .calage-unit-input label {
                font-size: 8px;
                color: #BDB76B;
                margin-bottom: 2px;
                text-align: center;
            }
            .calage-unit-input .unit-count {
                font-size: 9px;
                color: #8BC34A;
                margin-bottom: 3px;
            }
            .calage-unit-input input {
                width: 45px;
                padding: 3px;
                text-align: center;
                border: 1px solid #8B6914;
                border-radius: 3px;
                background: #2D2419;
                color: #F5DEB3;
                font-size: 10px;
            }
            .attaque-item {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .attaque-item.en-cours {
                border-color: #ffc107;
                background: rgba(255, 193, 7, 0.1);
            }
            .attaque-item.terminee {
                border-color: #4CAF50;
                background: rgba(76, 175, 80, 0.1);
            }
            .attaque-info .nom {
                font-weight: bold;
                color: #F5DEB3;
                font-size: 12px;
            }
            .attaque-info .details {
                font-size: 10px;
                color: #BDB76B;
                margin-top: 3px;
            }
            .attaque-status {
                padding: 3px 8px;
                border-radius: 10px;
                font-size: 10px;
                font-weight: bold;
                margin-right: 8px;
            }
            .status-attente { background: #6c757d; color: white; }
            .status-encours { background: #ffc107; color: black; }
            .status-succes { background: #4CAF50; color: white; }
            .calage-actions { display: flex; gap: 4px; }
            .calage-actions button {
                padding: 4px 8px;
                font-size: 10px;
                border-radius: 4px;
                cursor: pointer;
                border: none;
            }
            .btn-lancer { background: #ffc107; color: black; }
            .btn-suppr { background: #dc3545; color: white; }
            #calage-liste-attaques {
                max-height: 200px;
                overflow-y: auto;
            }
        </style>
    `;
};

module.init = function() {
    loadData();

    document.getElementById('toggle-calage').checked = calageData.botActif;
    updateControlState();
    majVillesSelect();
    majUnitsGrid();
    majListeAttaques();
    updatePlansList();

    document.getElementById('toggle-calage').onchange = (e) => toggleBot(e.target.checked);
    document.getElementById('calage-btn-ajouter').onclick = ajouterAttaque;
    document.getElementById('calage-btn-clear').onclick = supprimerToutesAttaques;
    document.getElementById('calage-ville-source').onchange = () => { majUnitsGrid(); updateBoatIndicator(); };
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
        updateBoatIndicator();
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
    log('CALAGE', 'Bot demarre', 'success');
    majStatus('Surveillance...');

    calageData.intervalCheck = setInterval(function() {
        if (!calageData.botActif) return;
        verifierEtLancerAttaque();
    }, 1000);
}

function arreterBot() {
    log('CALAGE', 'Bot arrete', 'info');
    majStatus('En attente');

    if (calageData.intervalCheck) {
        clearInterval(calageData.intervalCheck);
        calageData.intervalCheck = null;
    }
    calageData.attaqueEnCours = null;
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
                <input type="number" id="unit-${u.id}" min="0" max="${u.count}" value="0" data-unit="${u.id}" data-pop="${u.pop}" onchange="updateBoatIndicator && updateBoatIndicator()">
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
                <input type="number" id="unit-${u.id}" min="0" max="${u.count}" value="0" data-unit="${u.id}" data-transport="${u.isTransport}" onchange="updateBoatIndicator && updateBoatIndicator()">
            </div>
        `).join('');
    }
    
    document.querySelectorAll('#calage-ground-units input, #calage-naval-units input').forEach(inp => {
        inp.addEventListener('input', updateBoatIndicator);
    });
    
    updateBoatIndicator();
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
    
    if (!needsBoats(units)) {
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
        log('CALAGE', 'Remplir cible et heure!', 'error');
        return;
    }

    const unites = getSelectedUnits();
    let totalUnites = Object.values(unites).reduce((a, b) => a + b, 0);

    if (totalUnites === 0) {
        log('CALAGE', 'Selectionner au moins une unite!', 'error');
        return;
    }

    if (needsBoats(unites) && !hasBoatsSelected(unites)) {
        log('CALAGE', 'Ajoutez des bateaux pour transporter vos troupes!', 'error');
        return;
    }
    
    if (needsBoats(unites)) {
        const boatInfo = calculateRequiredBoats(unites, sourceId);
        if (!boatInfo.hasEnoughBoats) {
            log('CALAGE', `Capacite insuffisante! (${boatInfo.totalCapacity}/${boatInfo.totalPop})`, 'error');
            return;
        }
    }

    const nouvelleAttaque = {
        id: 'atk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        sourceId: sourceId,
        cibleId: cibleId,
        heureArrivee: heureArrivee,
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

    log('CALAGE', 'Attaque ajoutee: ' + sourceId + ' -> ' + cibleId + ' @ ' + heureArrivee, 'success');
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
    
    if (needsBoats(unites) && !hasBoatsSelected(unites)) {
        log('CALAGE', 'Ajoutez des bateaux!', 'error');
        return;
    }
    
    if (needsBoats(unites)) {
        const boatInfo = calculateRequiredBoats(unites, sourceId);
        if (!boatInfo.hasEnoughBoats) {
            log('CALAGE', `Capacite insuffisante!`, 'error');
            return;
        }
    }
    
    const [hours, minutes, seconds] = heureArrivee.split(':').map(Number);
    let baseTime = new Date();
    baseTime.setHours(hours, minutes, seconds || 0, 0);
    
    for (let i = 0; i < count; i++) {
        const attackTime = new Date(baseTime.getTime() + (i * interval * 1000));
        const timeStr = attackTime.toTimeString().split(' ')[0];
        
        const nouvelleAttaque = {
            id: 'atk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + i,
            sourceId: sourceId,
            cibleId: cibleId,
            heureArrivee: timeStr,
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
    
    log('CALAGE', `${count} attaques planifiees (intervalle ${interval}s)`, 'success');
}

function savePlan() {
    const nameInput = document.getElementById('calage-plan-name');
    const planName = nameInput.value.trim();
    
    if (!planName) {
        log('CALAGE', 'Entrez un nom de plan', 'warning');
        return;
    }
    
    const plan = {
        name: planName,
        date: new Date().toISOString(),
        attaques: calageData.attaques.map(a => ({ ...a, status: 'attente', tentatives: 0 }))
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
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;font-style:italic;padding:15px;">Aucun plan sauvegarde</div>';
        return;
    }
    
    container.innerHTML = calageData.plans.map((plan, i) => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.3);border:1px solid rgba(212,175,55,0.3);padding:8px 12px;margin-bottom:6px;border-radius:4px;">
            <div>
                <div style="font-size:12px;color:#F5DEB3;font-weight:bold;">${plan.name}</div>
                <div style="font-size:10px;color:#8B8B83;">${plan.attaques.length} attaques</div>
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
            
            if (importData.attaques && Array.isArray(importData.attaques)) {
                importData.attaques.forEach(atk => {
                    atk.status = 'attente';
                    atk.tentatives = 0;
                    atk.id = 'atk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                    calageData.attaques.push(atk);
                });
                log('CALAGE', `${importData.attaques.length} attaque(s) importee(s)`, 'success');
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
            <div class="attaque-info">
                <div class="nom">${atk.sourceId} -> ${atk.cibleId}</div>
                <div class="details">${atk.heureArrivee} | ${atk.type} | ${unitsList.slice(0, 3).join(', ')}${unitsList.length > 3 ? '...' : ''}</div>
            </div>
            <span class="attaque-status ${statusClass}">${statusText}</span>
            <div class="calage-actions">
                <button class="btn-lancer" data-index="${index}" title="Lancer">▶</button>
                <button class="btn-suppr" data-index="${index}" title="Supprimer">✕</button>
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

function getTimeInMs(timeStr) {
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    const second = parseInt(parts[2] || '0', 10);
    const date = new Date();
    date.setHours(hour, minute, second, 0);
    return date.getTime();
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

function verifierEtLancerAttaque() {
    if (calageData.attaqueEnCours) return;

    const maintenant = Date.now();

    for (let i = 0; i < calageData.attaques.length; i++) {
        const atk = calageData.attaques[i];

        if (atk.status === 'attente') {
            let heureArriveeMs = getTimeInMs(atk.heureArrivee);
            let tempsRestant = heureArriveeMs - maintenant;

            if (tempsRestant < -60000) {
                tempsRestant += 24 * 60 * 60 * 1000;
            }

            const minutesRestantes = Math.floor(tempsRestant / 60000);
            const secondesRestantes = Math.floor((tempsRestant % 60000) / 1000);

            if (tempsRestant > 0 && tempsRestant < 120000) {
                majStatus('Dans ' + minutesRestantes + 'm ' + secondesRestantes + 's...');
            }

            if (tempsRestant > 0 && tempsRestant < 45000) {
                log('CALAGE', 'Lancement auto (T-' + Math.round(tempsRestant/1000) + 's)', 'info');
                lancerAttaque(atk);
                return;
            }
        }
    }
}

function lancerAttaque(atk) {
    calageData.attaqueEnCours = atk;
    atk.status = 'encours';
    atk.tentatives = 1;
    saveData();
    majListeAttaques();
    majStatus('Envoi vers ' + atk.cibleId + '...');

    if (uw.Game.townId !== atk.sourceId) {
        log('CALAGE', 'Changement ville: ' + uw.Game.townId + ' -> ' + atk.sourceId, 'info');
        majStatus('Changement ville...');

        try {
            if (uw.TownSwitch && uw.TownSwitch.switchTown) {
                uw.TownSwitch.switchTown(atk.sourceId);
            } else if (uw.ITowns && uw.ITowns.setCurrentTown) {
                uw.ITowns.setCurrentTown(atk.sourceId);
            }
        } catch (e) {
            log('CALAGE', 'Erreur changement: ' + e.message, 'error');
        }

        setTimeout(function() {
            envoyerAttaque(atk);
        }, 1500);
        return;
    }

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

    majStatus('Tentative #' + atk.tentatives + '...');

    uw.$.ajax({
        url: url,
        type: 'POST',
        data: { json: JSON.stringify(jsonData) },
        dataType: 'json',
        success: function(response) {
            traiterReponseAttaque(response, atk);
        },
        error: function(xhr, status, err) {
            log('CALAGE', 'Erreur AJAX: ' + err, 'error');
            majStatus('Erreur: ' + err);

            setTimeout(function() {
                if (calageData.attaqueEnCours === atk) {
                    atk.tentatives++;
                    envoyerAttaque(atk);
                }
            }, 1000);
        }
    });
}

function traiterReponseAttaque(response, atk) {
    if (response.json && response.json.error) {
        if (response.json.error.indexOf('unit') !== -1 || response.json.error.indexOf('Pas assez') !== -1) {
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
        log('CALAGE', 'Pas de MovementsUnits', 'error');
        calageData.attaqueEnCours = null;
        return;
    }

    try {
        const paramStr = notifs[mvIndex].param_str;
        const movementData = JSON.parse(paramStr).MovementsUnits;
        const arrivalAt = movementData.arrival_at;
        const commandId = movementData.command_id;

        const calageMs = getTimeInMs(atk.heureArrivee);
        const arrivalMs = arrivalAt * 1000;
        const diff = arrivalMs - calageMs;

        const toleranceMin = atk.toleranceMoins ? -1000 : 0;
        const toleranceMax = atk.tolerancePlus ? 1000 : 0;

        const diffSec = Math.round(diff / 1000);
        const signe = diffSec > 0 ? '+' : '';

        if (diff >= toleranceMin && diff <= toleranceMax) {
            log('CALAGE', 'SUCCES! Arrivee: ' + formatTime(arrivalMs) + ' (' + atk.tentatives + ' essais)', 'success');
            atk.status = 'succes';
            saveData();
            majListeAttaques();
            majStatus('SUCCES! ' + formatTime(arrivalMs));
            calageData.attaqueEnCours = null;

            sendWebhook('Calage Reussi!', 
                `**${atk.sourceId} -> ${atk.cibleId}**\nArrivee: ${formatTime(arrivalMs)}\nTentatives: ${atk.tentatives}`);
            return;
        }

        log('CALAGE', 'Hors tolerance (' + signe + diffSec + 's), annulation...', 'warning');
        majStatus('Calage ' + signe + diffSec + 's - Retry...');

        annulerCommande(commandId).then(function() {
            atk.tentatives++;
            saveData();
            majListeAttaques();

            majStatus('Attente troupes... (#' + atk.tentatives + ')');

            verifierTroupesRevenues(atk.unites).then(function() {
                envoyerAttaque(atk);
            }).catch(function() {
                setTimeout(function() {
                    envoyerAttaque(atk);
                }, 1500);
            });

        }).catch(function(err) {
            log('CALAGE', 'Erreur annulation: ' + err, 'error');
            majStatus('Erreur annulation');
            calageData.attaqueEnCours = null;
        });

    } catch (e) {
        log('CALAGE', 'Erreur parsing: ' + e.message, 'error');
        calageData.attaqueEnCours = null;
    }
}

function annulerCommande(commandId) {
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
                resolve(response);
            },
            error: function(xhr, status, error) {
                reject(error);
            }
        });
    });
}

function verifierTroupesRevenues(unitesEnvoyees) {
    return new Promise(function(resolve, reject) {
        const startTime = Date.now();
        let checkCount = 0;

        const interval = setInterval(function() {
            checkCount++;

            if (Date.now() - startTime > TIMEOUT_VERIFICATION) {
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
