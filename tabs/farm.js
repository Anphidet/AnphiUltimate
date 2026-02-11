const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

let farmData = {
    enabled: false,
    settings: { 
        mode: 'least_resources', 
        duration: 1, 
        webhook: '',
        skipEmptyIslands: true 
    },
    stats: { 
        cycles: 0, 
        totalRes: 0,
        skippedIslands: 0
    },
    cycleCount: 0,
    interval: null,
    nextCheckTime: 0,
    lastNoIslandLog: 0
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
                    <div class="stat-box">
                        <span class="stat-value" id="farm-stat-skipped">0</span>
                        <span class="stat-label">Îles ignorées</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⏱️</span> Prochaine Récolte</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="timer-container">
                    <div class="timer-label">Temps restant</div>
                    <div class="timer-value" id="farm-timer">--:--</div>
                </div>
                <div style="margin-top: 10px; font-size: 11px; color: #BDB76B; text-align: center;">
                    <span id="farm-islands-ready">0</span> île(s) prête(s)
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
                        <span class="option-label">Durée</span>
                        <select class="option-select" id="farm-duration">
                            <option value="1">5 minutes</option>
                            <option value="2">20 minutes</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top: 12px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; color: #F5DEB3;">
                        <input type="checkbox" id="farm-skip-empty" style="width: 18px; height: 18px; accent-color: #4CAF50;">
                        <span>Ignorer les îles sans ressources disponibles</span>
                    </label>
                </div>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>🏝️</span> État des Îles</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="farm-islands-status" style="max-height: 300px; overflow-y: auto; font-size: 11px;">
                    <div style="text-align: center; color: #8B8B83; padding: 15px;">Démarrez le bot pour voir l'état des îles</div>
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
    document.getElementById('farm-skip-empty').checked = farmData.settings.skipEmptyIslands;
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
        log('FARM', 'Durée: ' + (e.target.value === '1' ? '5 min' : '20 min'), 'info');
    };
    document.getElementById('farm-skip-empty').onchange = (e) => {
        farmData.settings.skipEmptyIslands = e.target.checked;
        saveData();
        log('FARM', 'Ignorer îles vides: ' + (e.target.checked ? 'Activé' : 'Désactivé'), 'info');
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
    log('FARM', 'Module initialisé', 'info');
};

module.isActive = function() {
    return farmData.enabled;
};

module.onActivate = function(container) {
    updateStats();
    updateIslandsStatus();
};

function toggleFarm(enabled) {
    farmData.enabled = enabled;
    const ctrl = document.getElementById('farm-control');
    const status = document.getElementById('farm-status');
    
    if (enabled) {
        ctrl.classList.remove('inactive');
        status.textContent = 'Actif';
        log('FARM', 'Bot démarré', 'success');
        runFarmCycle();
    } else {
        ctrl.classList.add('inactive');
        status.textContent = 'En attente';
        log('FARM', 'Bot arrêté', 'info');
        clearTimeout(farmData.interval);
    }
    
    saveData();
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

async function runFarmCycle() {
    if (!farmData.enabled) return;
    
    // Obtenir le temps avant la prochaine récolte disponible
    const nextTime = getNextAvailableCollection();
    
    if (nextTime > 0) {
        // Il faut attendre avant la prochaine récolte
        farmData.nextCheckTime = Date.now() + nextTime + 3000;
        farmData.interval = setTimeout(() => runFarmCycle(), nextTime + 3000);
        updateIslandsStatus();
    } else {
        // Au moins une île est prête
        await executeFarmClaim();
        
        // Vérifier s'il reste des îles à récolter
        const nextAvailable = getNextAvailableCollection();
        if (nextAvailable === 0) {
            // Il y a encore des îles prêtes, réessayer rapidement
            farmData.interval = setTimeout(() => runFarmCycle(), 2000);
        } else {
            // Programmer le prochain cycle
            farmData.nextCheckTime = Date.now() + nextAvailable + 3000;
            farmData.interval = setTimeout(() => runFarmCycle(), nextAvailable + 3000);
        }
        
        updateIslandsStatus();
    }
}

async function executeFarmClaim() {
    try {
        const islandsInfo = getIslandsWithStatus();
        const readyIslands = islandsInfo.filter(island => island.isReady && !island.isEmpty);
        
        if (readyIslands.length === 0) {
            // Ne logger qu'une fois toutes les 60 secondes pour éviter le spam
            const now = Date.now();
            if (!farmData.lastNoIslandLog || now - farmData.lastNoIslandLog > 60000) {
                const nextAvailable = getNextAvailableCollection();
                const mins = Math.floor(nextAvailable / 60000);
                const secs = Math.floor((nextAvailable % 60000) / 1000);
                log('FARM', `Aucune île prête. Prochaine dans ${mins}m ${secs}s`, 'info');
                farmData.lastNoIslandLog = now;
            }
            return;
        }
        
        let list = readyIslands.map(island => island.town);
        
        if (farmData.settings.mode === 'round_robin') {
            const offset = farmData.cycleCount % list.length;
            list = list.concat(list.splice(0, offset));
            farmData.cycleCount++;
        }
        
        const ids = list.map(p => p.id);
        const skippedCount = islandsInfo.filter(i => i.isReady && i.isEmpty).length;
        
        log('FARM', `Récolte de ${ids.length} île(s)${skippedCount > 0 ? ` (${skippedCount} ignorée(s))` : ''}...`, 'info');
        
        await new Promise(r => uw.gpAjax.ajaxGet('farm_town_overviews', 'index', {}, false, () => r()));
        await new Promise(r => setTimeout(r, 1000));
        
        uw.gpAjax.ajaxPost('farm_town_overviews', 'claim_loads_multiple', {
            towns: ids,
            time_option_base: farmData.settings.duration === 1 ? 300 : 1200,
            time_option_booty: farmData.settings.duration === 1 ? 600 : 2400,
            claim_factor: 'normal'
        }, false, () => {
            const gain = ids.length * (farmData.settings.duration === 1 ? 115 : 350);
            farmData.stats.cycles++;
            farmData.stats.totalRes += gain;
            farmData.stats.skippedIslands += skippedCount;
            
            log('FARM', `✅ ${ids.length} île(s) récoltée(s), +${gain} res`, 'success');
            updateStats();
            saveData();
            
            sendWebhook('Récolte Auto Farm', `${ids.length} îles récoltées\nGain: +${gain.toLocaleString()} ressources\n${skippedCount > 0 ? `Îles ignorées: ${skippedCount}` : ''}`);
        });
    } catch(e) {
        log('FARM', 'Erreur: ' + e.message, 'error');
    }
}

// Obtenir la liste des îles avec leur statut
function getIslandsWithStatus() {
    const towns = uw.MM.getOnlyCollectionByName('Town').models;
    const islandMap = new Map();
    const relations = uw.MM.getCollections()?.FarmTownPlayerRelation?.[0]?.models || [];
    const now = Math.floor(Date.now() / 1000);
    
    // Créer une map des temps de loot par île (basé sur island_x et island_y)
    const islandLootTimes = new Map();
    
    for (const rel of relations) {
        if (!rel.attributes) continue;
        
        const farmTownId = rel.attributes.farm_town_id;
        const lootableAt = rel.attributes.lootable_at || 0;
        const relationStatus = rel.attributes.relation_status;
        
        // Ignorer les villages de farm non conquis (relation_status !== 1)
        if (relationStatus !== 1) continue;
        
        // Trouver la ville de farm correspondante pour obtenir ses coordonnées
        try {
            const farmTowns = uw.MM.getOnlyCollectionByName('FarmTown').models;
            const farmTown = farmTowns.find(ft => ft.id === farmTownId);
            
            if (farmTown && farmTown.attributes) {
                const islandKey = `${farmTown.attributes.island_x}_${farmTown.attributes.island_y}`;
                
                if (!islandLootTimes.has(islandKey)) {
                    islandLootTimes.set(islandKey, []);
                }
                islandLootTimes.get(islandKey).push(lootableAt);
            }
        } catch (e) {
            // Ignorer les erreurs
        }
    }
    
    for (const t of towns) {
        if (t.attributes.on_small_island) continue;
        
        const townId = t.attributes.id;
        const res = t.attributes.resources;
        const totalRes = (res.wood || 0) + (res.stone || 0) + (res.iron || 0);
        
        // Obtenir les coordonnées de l'île de cette ville
        let islandX, islandY;
        try {
            const town = uw.ITowns.getTown(townId);
            islandX = town.getIslandCoordinateX();
            islandY = town.getIslandCoordinateY();
        } catch (e) {
            continue;
        }
        
        const islandKey = `${islandX}_${islandY}`;
        const islandId = t.attributes.island_id;
        
        // Obtenir les temps de loot pour cette île
        const lootTimes = islandLootTimes.get(islandKey) || [];
        
        if (lootTimes.length === 0) {
            // Pas de villages de farm sur cette île
            continue;
        }
        
        // Trouver le temps minimum (premier village disponible)
        const minLootTime = Math.min(...lootTimes);
        const maxLootTime = Math.max(...lootTimes);
        
        // Vérifier si au moins un village est prêt
        const isReady = minLootTime <= now;
        
        // Vérifier si TOUS les villages sont en cooldown
        const allOnCooldown = lootTimes.every(time => time > now);
        const isEmpty = farmData.settings.skipEmptyIslands && allOnCooldown;
        
        const townData = { 
            id: townId, 
            name: t.attributes.name, 
            total: totalRes, 
            islandId,
            islandX,
            islandY,
            minLootTime,
            maxLootTime,
            isReady,
            isEmpty,
            farmCount: lootTimes.length
        };
        
        // Sélectionner la ville avec le moins de ressources par île
        if (islandMap.has(islandId)) {
            const existing = islandMap.get(islandId);
            if (farmData.settings.mode === 'least_resources' && townData.total < existing.total) {
                islandMap.set(islandId, townData);
            }
        } else {
            islandMap.set(islandId, townData);
        }
    }
    
    return Array.from(islandMap.values()).map(town => ({
        town,
        isReady: town.isReady,
        isEmpty: town.isEmpty,
        nextAvailable: Math.max(0, (town.minLootTime - now) * 1000),
        farmCount: town.farmCount
    }));
}

// Obtenir le temps avant la prochaine récolte disponible
function getNextAvailableCollection() {
    const islandsInfo = getIslandsWithStatus();
    
    // Filtrer les îles non vides si l'option est activée
    let validIslands = islandsInfo;
    if (farmData.settings.skipEmptyIslands) {
        validIslands = islandsInfo.filter(island => !island.isEmpty);
    }
    
    if (validIslands.length === 0) {
        // Si aucune île valide, attendre la plus proche
        const allTimes = islandsInfo.map(i => i.nextAvailable);
        return allTimes.length > 0 ? Math.min(...allTimes) : 60000;
    }
    
    // Trouver le temps minimum parmi les îles valides
    const minTime = Math.min(...validIslands.map(island => island.nextAvailable));
    return minTime;
}

// Obtenir le nombre d'îles prêtes
function getReadyIslandsCount() {
    const islandsInfo = getIslandsWithStatus();
    return islandsInfo.filter(island => island.isReady && !island.isEmpty).length;
}

function updateIslandsStatus() {
    const container = document.getElementById('farm-islands-status');
    if (!container) return;
    
    const islandsInfo = getIslandsWithStatus();
    const now = Date.now();
    
    if (islandsInfo.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #8B8B83; padding: 15px;">Aucune île trouvée</div>';
        return;
    }
    
    // Trier par temps restant
    islandsInfo.sort((a, b) => a.nextAvailable - b.nextAvailable);
    
    let html = '';
    for (const info of islandsInfo) {
        const timeLeft = info.nextAvailable;
        const isReady = timeLeft === 0;
        const isEmpty = info.isEmpty;
        
        let statusText = '';
        let statusColor = '';
        
        if (isEmpty) {
            statusText = '🚫 Aucune ressource';
            statusColor = '#E57373';
        } else if (isReady) {
            statusText = '✅ Prête';
            statusColor = '#81C784';
        } else {
            const mins = Math.floor(timeLeft / 60000);
            const secs = Math.floor((timeLeft % 60000) / 1000);
            statusText = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;
            statusColor = '#FFB74D';
        }
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; margin-bottom: 4px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid ${statusColor};">
                <div>
                    <div style="color: #F5DEB3; font-weight: 600;">${info.town.name}</div>
                    <div style="color: #8B8B83; font-size: 10px;">${info.farmCount} village(s) de farm</div>
                </div>
                <div style="color: ${statusColor}; font-weight: 600; text-align: right;">
                    ${statusText}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

function startTimer() {
    setInterval(() => {
        const farmTimer = document.getElementById('farm-timer');
        const islandsReady = document.getElementById('farm-islands-ready');
        
        if (!farmTimer) return;
        
        if (!farmData.enabled) {
            farmTimer.textContent = '--:--';
            farmTimer.classList.remove('ready');
            if (islandsReady) islandsReady.textContent = '0';
            return;
        }
        
        const diff = Math.max(0, farmData.nextCheckTime - Date.now());
        const readyCount = getReadyIslandsCount();
        
        if (islandsReady) {
            islandsReady.textContent = readyCount;
        }
        
        if (diff <= 0 || readyCount > 0) {
            farmTimer.textContent = 'PRÊT';
            farmTimer.classList.add('ready');
        } else {
            farmTimer.classList.remove('ready');
            const mins = Math.floor(diff / 60000).toString().padStart(2, '0');
            const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            farmTimer.textContent = `${mins}:${secs}`;
        }
        
        // Mettre à jour l'état des îles toutes les 5 secondes
        if (Date.now() % 5000 < 1000) {
            updateIslandsStatus();
        }
    }, 1000);
}

function updateStats() {
    const c = document.getElementById('farm-stat-cycles');
    const r = document.getElementById('farm-stat-res');
    const s = document.getElementById('farm-stat-skipped');
    
    if (c) c.textContent = farmData.stats.cycles;
    if (r) r.textContent = farmData.stats.totalRes.toLocaleString();
    if (s) s.textContent = farmData.stats.skippedIslands;
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
            farmData = { ...farmData, ...d, interval: null, nextCheckTime: 0 };
        } catch(e) {}
    }
}
