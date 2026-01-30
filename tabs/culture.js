const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;

const STORAGE_KEY = 'gu_culture_data_v1';

const CELEBRATIONS = {
    party: {
        id: 'party',
        name: 'Festival',
        icon: '🎉',
        duration: 5 * 60 * 60,
        cost: { wood: 15000, stone: 18000, iron: 15000 },
        requires: { academy: 30 },
        description: '+200 Culture'
    },
    games: {
        id: 'games',
        name: 'Jeux Olympiques',
        icon: '🏆',
        duration: 12 * 60 * 60,
        cost: { wood: 0, stone: 0, iron: 0, gold: 50 },
        requires: { academy: 30 },
        description: '+400 Culture'
    },
    triumph: {
        id: 'triumph',
        name: 'Marche Triomphale',
        icon: '🎖️',
        duration: 8 * 60 * 60,
        cost: { wood: 0, stone: 0, iron: 0, bp: 300 },
        requires: {},
        description: '+300 Culture'
    },
    theater: {
        id: 'theater',
        name: 'Piece de Theatre',
        icon: '🎭',
        duration: 8 * 60 * 60,
        cost: { wood: 10000, stone: 12000, iron: 10000 },
        requires: { theater: 1 },
        description: '+400 Culture'
    }
};

let cultureData = {
    enabled: false,
    townSettings: {},
    stats: { totalCelebrations: 0, lastCelebration: null },
    nextCheckTime: 0,
    checkInterval: 60
};

const defaultTownSettings = {
    party: true,
    games: true,
    triumph: true,
    theater: true
};

function getCurrentCityId() { 
    try { return uw.ITowns.getCurrentTown().id; } 
    catch(e) { return null; } 
}

function getCurrentTownName() { 
    try { return uw.ITowns.getCurrentTown().getName(); } 
    catch(e) { return 'Ville inconnue'; } 
}

function getTownNameById(townId) {
    try {
        const town = uw.ITowns.getTown(townId);
        if (town) return town.getName ? town.getName() : town.name;
    } catch(e) {}
    return 'Ville ' + townId;
}

function getAllTowns() {
    const towns = [];
    try {
        if (uw.ITowns && uw.ITowns.getTowns) {
            const allTowns = uw.ITowns.getTowns();
            for (let id in allTowns) {
                const town = allTowns[id];
                towns.push({
                    id: parseInt(id),
                    name: town.getName ? town.getName() : town.name
                });
            }
        }
    } catch(e) {}
    return towns;
}

function getResourcesForTown(townId) {
    try {
        const town = uw.MM.getModels().Town[townId];
        return town?.attributes?.resources || { wood: 0, stone: 0, iron: 0 };
    } catch(e) { return { wood: 0, stone: 0, iron: 0 }; }
}

function getGoldForPlayer() {
    try {
        if (uw.MM && uw.MM.getOnlyCollectionByName) {
            const playerGold = uw.MM.getOnlyCollectionByName('PlayerGold');
            if (playerGold && playerGold.models && playerGold.models.length > 0) {
                const gold = playerGold.models[0].get('gold');
                if (gold !== undefined) {
                    console.log('[CULTURE] Gold via PlayerGold collection:', gold);
                    return gold;
                }
            }
        }
        
        if (uw.GameData && uw.GameData.Premium) {
            const gold = uw.GameData.Premium.gold;
            if (gold !== undefined) {
                console.log('[CULTURE] Gold via GameData.Premium:', gold);
                return gold;
            }
        }
        
        if (uw.Game && uw.Game.premium_features) {
            const pf = uw.Game.premium_features;
            if (pf.gold !== undefined) {
                console.log('[CULTURE] Gold via Game.premium_features:', pf.gold);
                return pf.gold;
            }
        }
        
        const models = uw.MM.getModels();
        
        const goldModels = ['PlayerGold', 'PlayerLedger', 'PremiumFeatures', 'PlayerSettings', 'Player'];
        for (let modelName of goldModels) {
            if (models[modelName]) {
                for (let id in models[modelName]) {
                    const obj = models[modelName][id];
                    
                    if (obj && typeof obj.get === 'function') {
                        for (let attr of ['gold', 'premium_gold', 'player_gold']) {
                            const val = obj.get(attr);
                            if (val !== undefined && val !== null && typeof val === 'number') {
                                console.log(`[CULTURE] Gold via ${modelName}.get('${attr}'):`, val);
                                return val;
                            }
                        }
                    }
                    
                    if (obj && obj.attributes) {
                        for (let attr of ['gold', 'premium_gold', 'player_gold']) {
                            if (obj.attributes[attr] !== undefined) {
                                console.log(`[CULTURE] Gold via ${modelName}.attributes.${attr}:`, obj.attributes[attr]);
                                return obj.attributes[attr];
                            }
                        }
                    }
                }
            }
        }
        
        const domGold = document.querySelector('#trainer_trainer_hint_gold .trainer_icon_gold + span, .gold_amount, .ui_gold_amount');
        if (domGold) {
            const goldText = domGold.textContent.replace(/[^0-9]/g, '');
            if (goldText) {
                console.log('[CULTURE] Gold via DOM:', parseInt(goldText));
                return parseInt(goldText);
            }
        }
        
        console.log('[CULTURE] Gold non trouve');
    } catch(e) {
        console.log('[CULTURE] Erreur getGold:', e);
    }
    return 0;
}

function getBattlePointsForPlayer() {
    try {
        const models = uw.MM.getModels();
        
        if (models.PlayerKillpoints) {
            for (let id in models.PlayerKillpoints) {
                const obj = models.PlayerKillpoints[id];
                if (obj && typeof obj.get === 'function') {
                    const att = obj.get('att');
                    if (att !== undefined && att !== null && typeof att === 'number') {
                        console.log('[CULTURE] BP via PlayerKillpoints.get(att):', att);
                        return att;
                    }
                }
                if (obj && obj.attributes && obj.attributes.att !== undefined) {
                    console.log('[CULTURE] BP via PlayerKillpoints.attributes.att:', obj.attributes.att);
                    return obj.attributes.att;
                }
            }
        }
        
        if (uw.MM && uw.MM.getOnlyCollectionByName) {
            const killpoints = uw.MM.getOnlyCollectionByName('PlayerKillpoints');
            if (killpoints && killpoints.models && killpoints.models.length > 0) {
                const model = killpoints.models[0];
                const att = model.get('att');
                if (att !== undefined && att !== null) {
                    console.log('[CULTURE] BP via PlayerKillpoints collection.get(att):', att);
                    return att;
                }
            }
        }
        
        const bpModels = ['PlayerLedger', 'Player', 'Killpoints'];
        for (let modelName of bpModels) {
            if (models[modelName]) {
                for (let id in models[modelName]) {
                    const obj = models[modelName][id];
                    
                    if (obj && typeof obj.get === 'function') {
                        for (let attr of ['att', 'battle_points', 'battlepoints', 'bp', 'kill_points', 'killpoints']) {
                            const val = obj.get(attr);
                            if (val !== undefined && val !== null && typeof val === 'number') {
                                console.log(`[CULTURE] BP via ${modelName}.get('${attr}'):`, val);
                                return val;
                            }
                        }
                    }
                }
            }
        }
        
        if (uw.Game && uw.Game.player_killpoints !== undefined) {
            console.log('[CULTURE] BP via Game.player_killpoints:', uw.Game.player_killpoints);
            return uw.Game.player_killpoints;
        }
        
        console.log('[CULTURE] BP non trouve');
    } catch(e) {
        console.log('[CULTURE] Erreur getBattlePoints:', e);
    }
    return 0;
}

function debugModels() {
    try {
        console.log('[CULTURE DEBUG] ======================================');
        console.log('[CULTURE DEBUG] === EXPLORATION COMPLETE DES MODELES ===');
        console.log('[CULTURE DEBUG] ======================================');
        
        console.log('[CULTURE DEBUG] === MM.getOnlyCollectionByName ===');
        if (uw.MM && uw.MM.getOnlyCollectionByName) {
            const collections = ['PlayerLedger', 'PlayerGold', 'Player', 'Killpoints', 'PremiumFeatures'];
            for (let collName of collections) {
                try {
                    const coll = uw.MM.getOnlyCollectionByName(collName);
                    if (coll) {
                        console.log(`[CULTURE DEBUG] Collection ${collName}:`, coll);
                        if (coll.models && coll.models.length > 0) {
                            const model = coll.models[0];
                            console.log(`[CULTURE DEBUG] ${collName}.models[0]:`, model);
                            if (model && model.attributes) {
                                console.log(`[CULTURE DEBUG] ${collName}.models[0].attributes:`, JSON.stringify(model.attributes));
                            }
                        }
                    } else {
                        console.log(`[CULTURE DEBUG] Collection ${collName}: null`);
                    }
                } catch(e) {
                    console.log(`[CULTURE DEBUG] Collection ${collName}: erreur`, e.message);
                }
            }
        } else {
            console.log('[CULTURE DEBUG] MM.getOnlyCollectionByName non disponible');
        }
        
        console.log('[CULTURE DEBUG] === MM.getModels() ===');
        const models = uw.MM.getModels();
        console.log('[CULTURE DEBUG] Tous les modeles disponibles:', Object.keys(models));
        
        const importantModels = ['PlayerLedger', 'PlayerSettings', 'PremiumFeatures', 'Player', 'PlayerGold', 'PlayerKillpoints', 'Killpoints'];
        
        for (let modelName of importantModels) {
            if (models[modelName]) {
                console.log(`[CULTURE DEBUG] --- ${modelName} ---`);
                for (let id in models[modelName]) {
                    const obj = models[modelName][id];
                    console.log(`[CULTURE DEBUG] ${modelName}[${id}] type:`, typeof obj);
                    
                    if (obj && typeof obj.get === 'function') {
                        const testAttrs = ['gold', 'battle_points', 'battlepoints', 'bp', 'kill_points', 'killpoints', 'att', 'def', 'premium_gold'];
                        for (let attr of testAttrs) {
                            const val = obj.get(attr);
                            if (val !== undefined) {
                                console.log(`[CULTURE DEBUG] ${modelName}.get('${attr}'):`, val);
                            }
                        }
                    }
                    
                    if (obj && obj.attributes) {
                        console.log(`[CULTURE DEBUG] ${modelName}.attributes:`, JSON.stringify(obj.attributes));
                    }
                    
                    if (obj && !obj.attributes && typeof obj !== 'function') {
                        console.log(`[CULTURE DEBUG] ${modelName} raw keys:`, Object.keys(obj));
                    }
                    break;
                }
            } else {
                console.log(`[CULTURE DEBUG] ${modelName}: NON PRESENT`);
            }
        }
        
        console.log('[CULTURE DEBUG] === uw.Game ===');
        if (uw.Game) {
            console.log('[CULTURE DEBUG] Game.battle_points:', uw.Game.battle_points);
            console.log('[CULTURE DEBUG] Game.player_killpoints:', uw.Game.player_killpoints);
            console.log('[CULTURE DEBUG] Game.premium_features:', uw.Game.premium_features);
            const gameKeys = Object.keys(uw.Game).filter(k => 
                k.toLowerCase().includes('gold') || 
                k.toLowerCase().includes('battle') || 
                k.toLowerCase().includes('kill') ||
                k.toLowerCase().includes('point')
            );
            console.log('[CULTURE DEBUG] Game keys (gold/battle/kill/point):', gameKeys);
            for (let k of gameKeys) {
                console.log(`[CULTURE DEBUG] Game.${k}:`, uw.Game[k]);
            }
        }
        
        console.log('[CULTURE DEBUG] === uw.GameData ===');
        if (uw.GameData) {
            console.log('[CULTURE DEBUG] GameData.Premium:', uw.GameData.Premium);
            const gdKeys = Object.keys(uw.GameData).filter(k => 
                k.toLowerCase().includes('gold') || 
                k.toLowerCase().includes('battle') || 
                k.toLowerCase().includes('premium')
            );
            console.log('[CULTURE DEBUG] GameData keys (gold/battle/premium):', gdKeys);
        }
        
        console.log('[CULTURE DEBUG] === DOM Elements ===');
        const goldSelectors = [
            '#trainer_trainer_hint_gold',
            '.gold_amount',
            '.ui_gold_amount',
            '[data-gold]',
            '.premium_gold'
        ];
        for (let sel of goldSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                console.log(`[CULTURE DEBUG] DOM ${sel}:`, el.textContent || el.getAttribute('data-gold'));
            }
        }
        
        const bpSelectors = [
            '.battle_points_amount',
            '.killpoints_amount',
            '#battle_points_count',
            '[data-battle-points]',
            '.points_indicator'
        ];
        for (let sel of bpSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                console.log(`[CULTURE DEBUG] DOM ${sel}:`, el.textContent || el.getAttribute('data-battle-points'));
            }
        }
        
        console.log('[CULTURE DEBUG] === TEST FINAL ===');
        const bp = getBattlePointsForPlayer();
        const gold = getGoldForPlayer();
        console.log('[CULTURE DEBUG] Resultat final BP:', bp);
        console.log('[CULTURE DEBUG] Resultat final Gold:', gold);
        console.log('[CULTURE DEBUG] ======================================');
        
    } catch(e) {
        console.log('[CULTURE DEBUG] Erreur globale:', e);
    }
}

function getBuildingLevel(townId, buildingId) {
    try {
        const buildings = uw.MM.getModels().Buildings;
        if (buildings && buildings[townId]) {
            const townBuildings = buildings[townId];
            if (townBuildings.attributes && townBuildings.attributes[buildingId] !== undefined) {
                return townBuildings.attributes[buildingId];
            }
            if (townBuildings[buildingId] !== undefined) {
                return townBuildings[buildingId];
            }
        }
        
        const town = uw.ITowns.getTown(townId);
        if (town) {
            if (typeof town.buildings === 'function') {
                const b = town.buildings();
                if (b && b[buildingId] !== undefined) return b[buildingId];
            }
            if (typeof town.getBuildings === 'function') {
                const b = town.getBuildings();
                if (b && b[buildingId] !== undefined) return b[buildingId];
            }
            if (town.buildings && typeof town.buildings !== 'function') {
                if (town.buildings[buildingId] !== undefined) return town.buildings[buildingId];
            }
        }
    } catch(e) { 
        console.log('[CULTURE] Erreur getBuildingLevel:', e);
    }
    return 0;
}

function hasAcademyLevel30(townId) {
    return getBuildingLevel(townId, 'academy') >= 30;
}

function hasTheater(townId) {
    return getBuildingLevel(townId, 'theater') >= 1;
}

function canCelebrate(townId, celebrationId) {
    const celebration = CELEBRATIONS[celebrationId];
    if (!celebration) return { can: false, reason: 'Celebration inconnue' };
    
    for (let building in celebration.requires) {
        const requiredLevel = celebration.requires[building];
        const currentLevel = getBuildingLevel(townId, building);
        if (currentLevel < requiredLevel) {
            return { 
                can: false, 
                reason: `${building === 'academy' ? 'Academie' : 'Theatre'} niveau ${requiredLevel} requis (actuel: ${currentLevel})`
            };
        }
    }
    
    const resources = getResourcesForTown(townId);
    const cost = celebration.cost;
    
    if (cost.wood && resources.wood < cost.wood) {
        return { can: false, reason: `Bois insuffisant (${resources.wood}/${cost.wood})` };
    }
    if (cost.stone && resources.stone < cost.stone) {
        return { can: false, reason: `Pierre insuffisante (${resources.stone}/${cost.stone})` };
    }
    if (cost.iron && resources.iron < cost.iron) {
        return { can: false, reason: `Argent insuffisant (${resources.iron}/${cost.iron})` };
    }
    
    if (cost.gold) {
        const gold = getGoldForPlayer();
        if (gold < cost.gold) {
            return { can: false, reason: `Or insuffisant (${gold}/${cost.gold})` };
        }
    }
    
    if (cost.bp) {
        const bp = getBattlePointsForPlayer();
        if (bp < cost.bp) {
            return { can: false, reason: `Points de combat insuffisants (${bp}/${cost.bp})` };
        }
    }
    
    return { can: true, reason: 'OK' };
}

function getCelebrationInProgress(townId) {
    try {
        const celebrations = uw.MM.getModels().Celebration;
        if (celebrations) {
            for (let id in celebrations) {
                const celeb = celebrations[id];
                const attrs = celeb?.attributes || celeb;
                if (attrs?.town_id == townId) {
                    return {
                        type: attrs.celebration_type || attrs.type,
                        finishTime: attrs.finished_at
                    };
                }
            }
        }
        
        const town = uw.ITowns.getTown(townId);
        if (town) {
            if (typeof town.getCelebration === 'function') {
                const c = town.getCelebration();
                if (c) return { type: c.type || c.celebration_type, finishTime: c.finished_at };
            }
            if (typeof town.celebration === 'function') {
                const c = town.celebration();
                if (c) return { type: c.type || c.celebration_type, finishTime: c.finished_at };
            }
        }
    } catch(e) {
        console.log('[CULTURE] Erreur getCelebrationInProgress:', e);
    }
    return null;
}

function startCelebration(townId, celebrationId, callback) {
    const celebration = CELEBRATIONS[celebrationId];
    if (!celebration) {
        log('CULTURE', 'Celebration inconnue: ' + celebrationId, 'error');
        if (callback) callback(false);
        return;
    }
    
    const checkResult = canCelebrate(townId, celebrationId);
    if (!checkResult.can) {
        log('CULTURE', `[${getTownNameById(townId)}] ${celebration.name}: ${checkResult.reason}`, 'warning');
        if (callback) callback(false);
        return;
    }
    
    const csrfToken = uw.Game.csrfToken;
    
    log('CULTURE', `[${getTownNameById(townId)}] Lancement ${celebration.name}...`, 'info');
    
    if (uw.gpAjax && typeof uw.gpAjax.ajaxPost === 'function') {
        console.log('[CULTURE] Methode gpAjax...');
        try {
            uw.gpAjax.ajaxPost(
                'building_place',
                'start_trainer',
                {
                    trainer_id: celebrationId,
                    town_id: townId
                },
                true,
                function(response) {
                    console.log('[CULTURE] gpAjax Response:', response);
                    handleCelebrationResponse(response, townId, celebration, callback);
                },
                { town_id: townId }
            );
            return;
        } catch(e) {
            console.log('[CULTURE] gpAjax erreur:', e);
        }
    }
    
    console.log('[CULTURE] Methode Ajax directe...');
    uw.$.ajax({
        type: 'POST',
        url: `/game/building_place?town_id=${townId}&action=start_trainer&h=${csrfToken}`,
        data: { 
            json: JSON.stringify({ 
                trainer_id: celebrationId,
                town_id: townId,
                nl_init: true 
            }) 
        },
        dataType: 'json',
        success: function(response) {
            console.log('[CULTURE] Ajax Response:', response);
            handleCelebrationResponse(response, townId, celebration, callback);
        },
        error: function(xhr, status, error) {
            console.log('[CULTURE] Ajax Error:', xhr.responseText, status, error);
            
            console.log('[CULTURE] Tentative methode alternative...');
            uw.$.ajax({
                type: 'POST',
                url: `/game/building_place?town_id=${townId}&action=culture&h=${csrfToken}`,
                data: { 
                    json: JSON.stringify({ 
                        celebration_type: celebrationId,
                        town_id: townId,
                        nl_init: true 
                    }) 
                },
                dataType: 'json',
                success: function(response2) {
                    console.log('[CULTURE] Alt Response:', response2);
                    handleCelebrationResponse(response2, townId, celebration, callback);
                },
                error: function(xhr2, status2, error2) {
                    console.log('[CULTURE] Alt Error:', xhr2.responseText, status2, error2);
                    log('CULTURE', `[${getTownNameById(townId)}] Erreur reseau: ${error2}`, 'error');
                    if (callback) callback(false);
                }
            });
        }
    });
}

function handleCelebrationResponse(response, townId, celebration, callback) {
    if (response?.json?.error || response?.error) {
        const errorMsg = response?.json?.error || response?.error;
        log('CULTURE', `[${getTownNameById(townId)}] Erreur ${celebration.name}: ${errorMsg}`, 'error');
        if (callback) callback(false);
        return;
    }
    
    cultureData.stats.totalCelebrations++;
    cultureData.stats.lastCelebration = {
        town: getTownNameById(townId),
        type: celebration.name,
        time: Date.now()
    };
    saveData();
    updateStats();
    
    log('CULTURE', `[${getTownNameById(townId)}] ${celebration.icon} ${celebration.name} lance!`, 'success');
    if (callback) callback(true);
}

function getTownSettings(townId) {
    const tid = townId || getCurrentCityId();
    if (!cultureData.townSettings[tid]) {
        cultureData.townSettings[tid] = { ...defaultTownSettings };
    }
    return cultureData.townSettings[tid];
}

function setTownCelebrationEnabled(townId, celebrationId, enabled) {
    if (!cultureData.townSettings[townId]) {
        cultureData.townSettings[townId] = { ...defaultTownSettings };
    }
    cultureData.townSettings[townId][celebrationId] = enabled;
    saveData();
}

function isCelebrationAvailable(townId, celebrationId) {
    const celebration = CELEBRATIONS[celebrationId];
    if (!celebration) return false;
    
    for (let building in celebration.requires) {
        const requiredLevel = celebration.requires[building];
        const currentLevel = getBuildingLevel(townId, building);
        if (currentLevel < requiredLevel) {
            return false;
        }
    }
    return true;
}

function runCultureCycle() {
    if (!cultureData.enabled) {
        log('CULTURE', 'Bot non actif, cycle ignore', 'info');
        return;
    }
    
    log('CULTURE', 'Verification des celebrations...', 'info');
    
    const towns = getAllTowns();
    let celebrationStarted = false;
    let townsChecked = 0;
    let townsWithCelebration = 0;
    
    for (let town of towns) {
        const townId = town.id;
        const settings = getTownSettings(townId);
        
        const inProgress = getCelebrationInProgress(townId);
        if (inProgress) {
            townsWithCelebration++;
            log('CULTURE', `[${town.name}] Celebration en cours: ${CELEBRATIONS[inProgress.type]?.name || inProgress.type}`, 'info');
            continue;
        }
        
        townsChecked++;
        
        const celebrationOrder = ['party', 'games', 'triumph', 'theater'];
        
        for (let celebId of celebrationOrder) {
            if (!settings[celebId]) continue;
            if (!isCelebrationAvailable(townId, celebId)) continue;
            
            const checkResult = canCelebrate(townId, celebId);
            if (checkResult.can) {
                startCelebration(townId, celebId, function(success) {
                    if (success) {
                        celebrationStarted = true;
                        updateStatusList();
                        updateTownsGrid();
                    }
                });
                break;
            } else {
                log('CULTURE', `[${town.name}] ${CELEBRATIONS[celebId].name}: ${checkResult.reason}`, 'warning');
            }
        }
    }
    
    log('CULTURE', `Verification terminee: ${townsChecked} villes verifiees, ${townsWithCelebration} en cours`, 'info');
    
    cultureData.nextCheckTime = Date.now() + cultureData.checkInterval * 1000;
    saveData();
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function formatCost(cost) {
    const parts = [];
    if (cost.wood) parts.push(`🪵${cost.wood}`);
    if (cost.stone) parts.push(`🪨${cost.stone}`);
    if (cost.iron) parts.push(`⛏️${cost.iron}`);
    if (cost.gold) parts.push(`💰${cost.gold}`);
    if (cost.bp) parts.push(`⚔️${cost.bp}BP`);
    return parts.join(' ');
}

module.render = function(container) {
    container.innerHTML = `
        <div class="main-control inactive" id="culture-control">
            <div class="control-info">
                <div class="control-label">Auto Culture</div>
                <div class="control-status" id="culture-status">En attente</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-culture">
                <span class="toggle-slider"></span>
            </label>
        </div>
        
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📊</span> Ressources Joueur</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div style="display:flex;gap:15px;justify-content:center;flex-wrap:wrap;">
                    <div style="text-align:center;">
                        <div style="font-size:18px;">⚔️</div>
                        <div style="font-size:16px;color:#FFD700;font-weight:bold;" id="culture-bp-display">0</div>
                        <div style="font-size:10px;color:#8B8B83;">Points Combat</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:18px;">💰</div>
                        <div style="font-size:16px;color:#FFD700;font-weight:bold;" id="culture-gold-display">0</div>
                        <div style="font-size:10px;color:#8B8B83;">Or</div>
                    </div>
                </div>
                <button class="btn" style="width:100%;margin-top:12px;" id="culture-debug-btn">🔍 Debug (voir console F12)</button>
            </div>
        </div>
        
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⏱️</span> Prochain Check</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="timer-container">
                    <div class="timer-label">Temps restant</div>
                    <div class="timer-value" id="culture-timer">--:--</div>
                </div>
                <button class="btn btn-success" style="width:100%;margin-top:12px;" id="culture-check-now">Verifier maintenant</button>
            </div>
        </div>
        
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⚙️</span> Options</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="option-group">
                    <span class="option-label">Intervalle de verification</span>
                    <select class="option-select" id="culture-interval">
                        <option value="30">30 secondes</option>
                        <option value="60">1 minute</option>
                        <option value="120">2 minutes</option>
                        <option value="300">5 minutes</option>
                        <option value="600">10 minutes</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>🏛️</span> Configuration des Villes</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <p style="font-size:11px;color:#BDB76B;margin-bottom:12px;">Selectionnez les celebrations a activer pour chaque ville. Les options grisees ne sont pas disponibles (batiment manquant).</p>
                <div id="culture-towns-grid"></div>
            </div>
        </div>
        
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📋</span> Status des Villes</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="culture-status-list"></div>
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
                        <span class="stat-value" id="culture-stat-total">0</span>
                        <span class="stat-label">Celebrations</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="culture-stat-last">-</span>
                        <span class="stat-label">Derniere</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>ℹ️</span> Info Celebrations</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content" id="culture-info-content">
                <div class="culture-info-grid">
                    ${Object.values(CELEBRATIONS).map(c => `
                        <div class="culture-info-item">
                            <div class="culture-info-header">
                                <span class="culture-info-icon">${c.icon}</span>
                                <span class="culture-info-name">${c.name}</span>
                            </div>
                            <div class="culture-info-details">
                                <div class="culture-info-cost">${formatCost(c.cost)}</div>
                                <div class="culture-info-duration">⏱️ ${formatDuration(c.duration)}</div>
                                <div class="culture-info-desc">${c.description}</div>
                                ${Object.keys(c.requires).length > 0 ? `<div class="culture-info-req">Requis: ${Object.entries(c.requires).map(([b,l]) => `${b === 'academy' ? 'Academie' : 'Theatre'} niv.${l}`).join(', ')}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <style>
            #culture-towns-grid {
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-height: 400px;
                overflow-y: auto;
            }
            .culture-town-card {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 8px;
                padding: 12px;
            }
            .culture-town-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(212,175,55,0.2);
            }
            .culture-town-name {
                font-family: 'Cinzel', serif;
                font-size: 13px;
                font-weight: 600;
                color: #F5DEB3;
            }
            .culture-town-status {
                font-size: 10px;
                padding: 3px 8px;
                border-radius: 10px;
                background: rgba(76,175,80,0.3);
                color: #81C784;
            }
            .culture-town-status.busy {
                background: rgba(255,152,0,0.3);
                color: #FFB74D;
            }
            .culture-celebrations {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }
            .culture-celebration-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .culture-celebration-item:hover:not(.disabled) {
                border-color: rgba(212,175,55,0.5);
                background: rgba(0,0,0,0.3);
            }
            .culture-celebration-item.disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            .culture-celebration-item.active {
                border-color: rgba(76,175,80,0.6);
                background: rgba(76,175,80,0.15);
            }
            .culture-celebration-checkbox {
                width: 18px;
                height: 18px;
                accent-color: #4CAF50;
                cursor: pointer;
            }
            .culture-celebration-checkbox:disabled {
                cursor: not-allowed;
            }
            .culture-celebration-icon {
                font-size: 16px;
            }
            .culture-celebration-name {
                font-size: 11px;
                color: #F5DEB3;
                flex: 1;
            }
            .culture-celebration-item.disabled .culture-celebration-name {
                color: #666;
            }
            
            #culture-status-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
                max-height: 200px;
                overflow-y: auto;
            }
            .culture-status-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                background: rgba(0,0,0,0.2);
                border-radius: 6px;
                font-size: 11px;
            }
            .culture-status-town {
                color: #F5DEB3;
                font-weight: 600;
            }
            .culture-status-state {
                padding: 3px 8px;
                border-radius: 10px;
                font-size: 10px;
            }
            .culture-status-state.idle {
                background: rgba(139,139,131,0.3);
                color: #8B8B83;
            }
            .culture-status-state.celebrating {
                background: rgba(76,175,80,0.3);
                color: #81C784;
            }
            .culture-status-state.waiting {
                background: rgba(255,152,0,0.3);
                color: #FFB74D;
            }
            
            .culture-info-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }
            .culture-info-item {
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 6px;
                padding: 10px;
            }
            .culture-info-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                padding-bottom: 6px;
                border-bottom: 1px solid rgba(212,175,55,0.15);
            }
            .culture-info-icon {
                font-size: 18px;
            }
            .culture-info-name {
                font-family: 'Cinzel', serif;
                font-size: 12px;
                font-weight: 600;
                color: #D4AF37;
            }
            .culture-info-details {
                font-size: 10px;
                color: #BDB76B;
            }
            .culture-info-cost {
                margin-bottom: 4px;
            }
            .culture-info-duration {
                color: #8B8B83;
                margin-bottom: 4px;
            }
            .culture-info-desc {
                color: #81C784;
                margin-bottom: 4px;
            }
            .culture-info-req {
                color: #E57373;
                font-style: italic;
            }
            
            .culture-select-all-row {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(212,175,55,0.2);
            }
            .culture-select-all-btn {
                flex: 1;
                padding: 8px 12px;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 6px;
                color: #BDB76B;
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .culture-select-all-btn:hover {
                background: rgba(212,175,55,0.2);
                color: #F5DEB3;
            }
        </style>
    `;
};

module.init = function() {
    loadData();
    
    debugModels();
    
    const bp = getBattlePointsForPlayer();
    log('CULTURE', 'Points de combat actuels: ' + bp, 'info');
    
    const toggleEl = document.getElementById('toggle-culture');
    const intervalEl = document.getElementById('culture-interval');
    const ctrlEl = document.getElementById('culture-control');
    const statusEl = document.getElementById('culture-status');
    
    if (toggleEl) {
        toggleEl.checked = cultureData.enabled;
        if (cultureData.enabled) {
            ctrlEl?.classList.remove('inactive');
            if (statusEl) statusEl.textContent = 'Actif';
        }
    }
    
    if (intervalEl) {
        intervalEl.value = cultureData.checkInterval;
    }
    
    if (toggleEl) {
        toggleEl.onchange = (e) => toggleCulture(e.target.checked);
    }
    
    if (intervalEl) {
        intervalEl.onchange = (e) => {
            cultureData.checkInterval = parseInt(e.target.value);
            saveData();
            log('CULTURE', 'Intervalle: ' + cultureData.checkInterval + 's', 'info');
        };
    }
    
    const checkNowBtn = document.getElementById('culture-check-now');
    if (checkNowBtn) {
        checkNowBtn.onclick = () => {
            log('CULTURE', 'Verification manuelle...', 'info');
            runCultureCycle();
            updateStatusList();
            updateTownsGrid();
        };
    }
    
    const debugBtn = document.getElementById('culture-debug-btn');
    if (debugBtn) {
        debugBtn.onclick = () => {
            debugModels();
            updateResourcesDisplay();
            log('CULTURE', 'Debug lance - voir console F12', 'info');
        };
    }
    
    document.querySelectorAll('.section-header').forEach(header => {
        header.onclick = () => header.classList.toggle('collapsed');
    });
    
    updateTownsGrid();
    updateStatusList();
    updateStats();
    updateResourcesDisplay();
    startTimer();
    
    setupTownChangeObserver();
    
    log('CULTURE', 'Module initialise', 'info');
};

function updateResourcesDisplay() {
    const bpEl = document.getElementById('culture-bp-display');
    const goldEl = document.getElementById('culture-gold-display');
    
    if (bpEl) {
        const bp = getBattlePointsForPlayer();
        bpEl.textContent = bp;
    }
    if (goldEl) {
        const gold = getGoldForPlayer();
        goldEl.textContent = gold;
    }
}

module.isActive = function() {
    return cultureData.enabled;
};

module.onActivate = function(container) {
    updateTownsGrid();
    updateStatusList();
    updateStats();
};

function toggleCulture(enabled) {
    cultureData.enabled = enabled;
    
    const ctrl = document.getElementById('culture-control');
    const status = document.getElementById('culture-status');
    
    if (enabled) {
        if (ctrl) ctrl.classList.remove('inactive');
        if (status) status.textContent = 'Actif';
        log('CULTURE', 'Auto Culture active', 'success');
        cultureData.nextCheckTime = Date.now() + 5000;
        saveData();
    } else {
        if (ctrl) ctrl.classList.add('inactive');
        if (status) status.textContent = 'En attente';
        log('CULTURE', 'Auto Culture desactive', 'info');
    }
    
    saveData();
    
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function updateTownsGrid() {
    const container = document.getElementById('culture-towns-grid');
    if (!container) return;
    
    const towns = getAllTowns();
    
    if (towns.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;padding:20px;">Aucune ville trouvee</div>';
        return;
    }
    
    let html = `
        <div class="culture-select-all-row">
            <button class="culture-select-all-btn" id="culture-select-all">✅ Tout activer</button>
            <button class="culture-select-all-btn" id="culture-deselect-all">❌ Tout desactiver</button>
        </div>
    `;
    
    for (let town of towns) {
        const townId = town.id;
        const settings = getTownSettings(townId);
        const inProgress = getCelebrationInProgress(townId);
        
        const hasAcademy30 = hasAcademyLevel30(townId);
        const hasTheaterBuilding = hasTheater(townId);
        
        html += `
            <div class="culture-town-card" data-town-id="${townId}">
                <div class="culture-town-header">
                    <span class="culture-town-name">${town.name}</span>
                    <span class="culture-town-status ${inProgress ? 'busy' : ''}">${inProgress ? '🎉 En cours' : '✅ Disponible'}</span>
                </div>
                <div class="culture-celebrations">
                    ${Object.values(CELEBRATIONS).map(celeb => {
                        let available = true;
                        let tooltip = '';
                        
                        if (celeb.requires.academy && !hasAcademy30) {
                            available = false;
                            tooltip = 'Academie niveau 30 requise';
                        }
                        if (celeb.requires.theater && !hasTheaterBuilding) {
                            available = false;
                            tooltip = 'Theatre requis';
                        }
                        
                        const isChecked = settings[celeb.id] === true;
                        const isActive = isChecked && available;
                        
                        return `
                            <div class="culture-celebration-item ${!available ? 'disabled' : ''} ${isActive ? 'active' : ''}" 
                                 data-town="${townId}" 
                                 data-celebration="${celeb.id}"
                                 title="${tooltip}">
                                <input type="checkbox" 
                                       class="culture-celebration-checkbox"
                                       ${isChecked ? 'checked' : ''}
                                       ${!available ? 'disabled' : ''}
                                       data-town="${townId}"
                                       data-celebration="${celeb.id}">
                                <span class="culture-celebration-icon">${celeb.icon}</span>
                                <span class="culture-celebration-name">${celeb.name}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    container.querySelectorAll('.culture-celebration-checkbox').forEach(checkbox => {
        checkbox.onchange = function() {
            const townId = parseInt(this.dataset.town);
            const celebId = this.dataset.celebration;
            setTownCelebrationEnabled(townId, celebId, this.checked);
            
            const item = this.closest('.culture-celebration-item');
            if (this.checked) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        };
    });
    
    const selectAllBtn = document.getElementById('culture-select-all');
    if (selectAllBtn) {
        selectAllBtn.onclick = () => selectAllCelebrations(true);
    }
    
    const deselectAllBtn = document.getElementById('culture-deselect-all');
    if (deselectAllBtn) {
        deselectAllBtn.onclick = () => selectAllCelebrations(false);
    }
}

function selectAllCelebrations(enable) {
    const towns = getAllTowns();
    
    for (let town of towns) {
        const townId = town.id;
        
        for (let celebId of Object.keys(CELEBRATIONS)) {
            if (isCelebrationAvailable(townId, celebId)) {
                setTownCelebrationEnabled(townId, celebId, enable);
            }
        }
    }
    
    updateTownsGrid();
    log('CULTURE', enable ? 'Toutes les celebrations activees' : 'Toutes les celebrations desactivees', 'info');
}

function updateStatusList() {
    const container = document.getElementById('culture-status-list');
    if (!container) return;
    
    const towns = getAllTowns();
    
    if (towns.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#8B8B83;padding:10px;">Aucune ville</div>';
        return;
    }
    
    let html = '';
    
    for (let town of towns) {
        const townId = town.id;
        const inProgress = getCelebrationInProgress(townId);
        const settings = getTownSettings(townId);
        
        const hasAnyCelebEnabled = Object.keys(CELEBRATIONS).some(c => 
            settings[c] && isCelebrationAvailable(townId, c)
        );
        
        let stateClass = 'idle';
        let stateText = 'Inactif';
        
        if (inProgress) {
            stateClass = 'celebrating';
            const celebName = CELEBRATIONS[inProgress.type]?.name || inProgress.type;
            const finishTime = inProgress.finishTime ? new Date(inProgress.finishTime * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
            stateText = `${celebName} ${finishTime ? '(fin ' + finishTime + ')' : ''}`;
        } else if (hasAnyCelebEnabled) {
            stateClass = 'waiting';
            stateText = 'En attente';
        }
        
        html += `
            <div class="culture-status-item">
                <span class="culture-status-town">${town.name}</span>
                <span class="culture-status-state ${stateClass}">${stateText}</span>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function updateStats() {
    const totalEl = document.getElementById('culture-stat-total');
    const lastEl = document.getElementById('culture-stat-last');
    
    if (totalEl) totalEl.textContent = cultureData.stats.totalCelebrations;
    if (lastEl) {
        if (cultureData.stats.lastCelebration) {
            lastEl.textContent = cultureData.stats.lastCelebration.type || '-';
        } else {
            lastEl.textContent = '-';
        }
    }
}

let timerInterval = null;

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const el = document.getElementById('culture-timer');
        if (!el) return;
        
        if (!cultureData.enabled) {
            el.textContent = '--:--';
            el.classList.remove('ready');
            return;
        }
        
        const now = Date.now();
        const diff = cultureData.nextCheckTime - now;
        
        if (diff <= 0) {
            el.textContent = '00:00';
            el.classList.add('ready');
            
            runCultureCycle();
            updateStatusList();
            updateTownsGrid();
            
            cultureData.nextCheckTime = now + cultureData.checkInterval * 1000;
            saveData();
            return;
        }
        
        el.classList.remove('ready');
        const m = Math.floor(diff / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        el.textContent = `${m}:${s}`;
        
    }, 1000);
}

function setupTownChangeObserver() {
    try {
        if (uw.$.Observer) {
            uw.$.Observer(uw.GameEvents.town.town_switch).subscribe('gu_culture_town_switch', function() {
                setTimeout(() => {
                    updateStatusList();
                }, 500);
            });
        }
    } catch(e) {}
}

function saveData() {
    GM_setValue(STORAGE_KEY, JSON.stringify({
        enabled: cultureData.enabled,
        townSettings: cultureData.townSettings,
        stats: cultureData.stats,
        checkInterval: cultureData.checkInterval,
        nextCheckTime: cultureData.nextCheckTime
    }));
}

function loadData() {
    const saved = GM_getValue(STORAGE_KEY);
    if (saved) {
        try {
            const d = JSON.parse(saved);
            cultureData.enabled = d.enabled || false;
            cultureData.townSettings = d.townSettings || {};
            cultureData.stats = d.stats || cultureData.stats;
            cultureData.checkInterval = d.checkInterval || 60;
            cultureData.nextCheckTime = d.nextCheckTime || 0;
        } catch(e) {}
    }
}
