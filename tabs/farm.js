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

    const nextTime = getNextAvailableCollection();

    if (nextTime > 0) {
        // Aucune île prête, attendre la prochaine
        farmData.nextCheckTime = Date.now() + nextTime + 3000;
        farmData.interval = setTimeout(() => runFarmCycle(), nextTime + 3000);
        updateIslandsStatus();
    } else {
        // Au moins une île prête → récolter
        await executeFarmClaim();

        // Recharger les modèles FarmTownPlayerRelation depuis le serveur
        // OBLIGATOIRE : après claim, lootable_at en mémoire n'est pas encore mis à jour
        // Sans ça, getNextAvailableCollection() retourne 0 en boucle infinie
        await refreshFarmRelations();

        const nextAvailable = getNextAvailableCollection();
        if (nextAvailable === 0) {
            // Fallback de sécurité : si toujours 0 après refresh, attendre 60s
            log('FARM', 'Cooldowns non reçus du serveur, attente 60s', 'warning');
            farmData.nextCheckTime = Date.now() + 60000;
            farmData.interval = setTimeout(() => runFarmCycle(), 60000);
        } else {
            farmData.nextCheckTime = Date.now() + nextAvailable + 3000;
            farmData.interval = setTimeout(() => runFarmCycle(), nextAvailable + 3000);
        }

        updateIslandsStatus();
    }
}

// Forcer le rechargement des relations farm depuis le serveur
// Grepolis met à jour lootable_at uniquement après un appel réseau
async function refreshFarmRelations() {
    return new Promise(resolve => {
        try {
            uw.gpAjax.ajaxGet('farm_town_overviews', 'index', {}, false, () => {
                // Petite pause pour laisser MM mettre à jour ses modèles en mémoire
                setTimeout(resolve, 1500);
            }, () => {
                setTimeout(resolve, 1500);
            });
        } catch(e) {
            setTimeout(resolve, 1500);
        }
    });
}

async function executeFarmClaim() {
    try {
        const islands = getIslandsWithStatus();
        const readyIslands = islands.filter(i => i.isReady);
        
        if (readyIslands.length === 0) {
            // Ne logger qu'une fois toutes les 60 secondes pour éviter le spam
            const now = Date.now();
            if (!farmData.lastNoIslandLog || now - farmData.lastNoIslandLog > 60000) {
                const nextAvailable = getNextAvailableCollection();
                if (nextAvailable > 0) {
                    const mins = Math.floor(nextAvailable / 60000);
                    const secs = Math.floor((nextAvailable % 60000) / 1000);
                    log('FARM', `Aucune île prête. Prochaine dans ${mins}m ${secs}s`, 'info');
                }
                farmData.lastNoIslandLog = now;
            }
            return;
        }
        
        let list = readyIslands;
        
        if (farmData.settings.mode === 'round_robin') {
            const offset = farmData.cycleCount % list.length;
            list = list.slice(offset).concat(list.slice(0, offset));
            farmData.cycleCount++;
        }
        
        const ids = list.map(i => i.id);
        
        const totalVillages = list.reduce((a, i) => a + i.readyCount, 0);
        log('FARM', `Récolte: ${ids.length} île(s), ${totalVillages} village(s) prêt(s)`, 'info');

        // Await le claim pour être sûr que le serveur a bien traité la requête
        // avant que refreshFarmRelations ne récupère les nouveaux cooldowns
        await new Promise((resolve) => {
            uw.gpAjax.ajaxPost('farm_town_overviews', 'claim_loads_multiple', {
                towns: ids,
                time_option_base:  farmData.settings.duration === 1 ? 300  : 1200,
                time_option_booty: farmData.settings.duration === 1 ? 600  : 2400,
                claim_factor: 'normal'
            }, false, () => {
                const gain = ids.length * (farmData.settings.duration === 1 ? 115 : 350);
                farmData.stats.cycles++;
                farmData.stats.totalRes += gain;
                log('FARM', `✅ ${ids.length} île(s) récoltée(s), +${gain} res`, 'success');
                updateStats();
                saveData();
                sendWebhook('Récolte Auto Farm', `${ids.length} îles récoltées\nGain: +${gain.toLocaleString()} ressources`);
                resolve();
            }, () => resolve()); // résoudre aussi en cas d'erreur pour ne pas bloquer
        });
    } catch(e) {
        log('FARM', 'Erreur: ' + e.message, 'error');
    }
}

// Obtenir la liste des îles avec leur statut - logique correcte basée sur ModernBot
function getIslandsWithStatus() {
    const now = Math.floor(Date.now() / 1000);
    const islandMap = new Map(); // clé = islandId

    // Récupérer les modèles nécessaires
    let playerTowns, farmTownModels, relationModels;
    try {
        playerTowns    = uw.MM.getOnlyCollectionByName('Town').models;
        farmTownModels = uw.MM.getOnlyCollectionByName('FarmTown').models;
        relationModels = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation').models;
    } catch (e) {
        return [];
    }

    // Pré-indexer les FarmTown par id pour éviter une boucle imbriquée dans la boucle
    const farmTownById = new Map();
    for (const ft of farmTownModels) {
        farmTownById.set(ft.id, ft.attributes);
    }

    // Pour chaque relation conquise, ranger par islandKey (x_y)
    // Un village de farm est "disponible" si TOUTES ces conditions sont vraies :
    //   1. relation_status === 1  (village conquis)
    //   2. lootable_at est null OU lootable_at <= now  (cooldown écoulé ou jamais récolté)
    //   3. Le village a des ressources disponibles (wood + stone + iron > 0)
    //      → si tout est à 0, Grepolis ne mettra pas de cooldown même après claim
    //      → c'est la cause de la boucle infinie quand les villages sont vides
    const islandFarmStatus = new Map(); // islandKey -> { readyCount, totalCount, minNextTime }

    for (const rel of relationModels) {
        const ra = rel.attributes;
        if (!ra) continue;
        if (ra.relation_status !== 1) continue; // pas conquis → ignorer

        const ft = farmTownById.get(ra.farm_town_id);
        if (!ft) continue;

        const islandKey = `${ft.island_x}_${ft.island_y}`;

        if (!islandFarmStatus.has(islandKey)) {
            islandFarmStatus.set(islandKey, { readyCount: 0, totalCount: 0, minNextTime: Infinity });
        }
        const status = islandFarmStatus.get(islandKey);
        status.totalCount++;

        const lootableAt = ra.lootable_at;

        // Vérifier si le village a des ressources disponibles
        // ft.resources peut être { wood, stone, iron } ou ft.available_resources
        const res = ft.resources || ft.available_resources || {};
        const hasResources = (res.wood || 0) + (res.stone || 0) + (res.iron || 0) > 0;

        if (!hasResources) {
            // Village vide : pas de cooldown mais rien à récolter
            // On l'ignore complètement — il ne doit PAS compter comme "prêt"
            status.totalCount--; // annuler l'incrément ci-dessus
            continue;
        }

        if (lootableAt === null || lootableAt <= now) {
            // Village prêt ET a des ressources
            status.readyCount++;
        } else {
            // En cooldown — retenir le prochain dispo
            if (lootableAt < status.minNextTime) {
                status.minNextTime = lootableAt;
            }
        }
    }

    // Construire la liste à partir des villes du joueur
    for (const t of playerTowns) {
        const ta = t.attributes;
        if (ta.on_small_island) continue;

        const townId  = ta.id;
        const islandId = ta.island_id;
        const res     = ta.resources || {};
        const totalRes = (res.wood || 0) + (res.stone || 0) + (res.iron || 0);

        // Récupérer les coordonnées de l'île
        let islandX, islandY;
        try {
            const town = uw.ITowns.getTown(townId);
            islandX = town.getIslandCoordinateX();
            islandY = town.getIslandCoordinateY();
        } catch (e) {
            continue;
        }

        const islandKey = `${islandX}_${islandY}`;
        const farmStatus = islandFarmStatus.get(islandKey);

        // Ignorer les îles sans aucun village conquis avec des ressources
        if (!farmStatus || farmStatus.totalCount === 0) continue;

        const isReady = farmStatus.readyCount > 0;
        const isEmpty = !isReady;

        // Temps en ms avant le premier village disponible
        // Si minNextTime === Infinity : tous les villages avec ressources sont déjà prêts
        // ou il n'y en a aucun → on ne planifie pas de retry automatique pour cette île
        const nextAvailableMs = isReady
            ? 0
            : (farmStatus.minNextTime === Infinity
                ? 0  // aucun cooldown connu → pas de timer pour cette île
                : Math.max(0, (farmStatus.minNextTime - now) * 1000));

        const townData = {
            id:         townId,
            name:       ta.name,
            total:      totalRes,
            islandId,
            islandX,
            islandY,
            isReady,
            isEmpty,
            readyCount:  farmStatus.readyCount,
            totalFarms:  farmStatus.totalCount,
            nextAvailableMs
        };

        // Garder une seule ville par île (la moins remplie en mode least_resources)
        if (islandMap.has(islandId)) {
            const existing = islandMap.get(islandId);
            if (farmData.settings.mode === 'least_resources' && townData.total < existing.total) {
                islandMap.set(islandId, townData);
            }
        } else {
            islandMap.set(islandId, townData);
        }
    }

    return Array.from(islandMap.values());
}

// Obtenir le temps en ms avant la prochaine récolte possible (0 = disponible maintenant)
function getNextAvailableCollection() {
    const islands = getIslandsWithStatus();

    // Îles avec au moins un village prêt ET avec des ressources
    const readyIslands = islands.filter(i => i.isReady);
    if (readyIslands.length > 0) return 0;

    // Aucune île prête : chercher les cooldowns connus
    const times = islands
        .filter(i => i.nextAvailableMs > 0)
        .map(i => i.nextAvailableMs);

    if (times.length === 0) {
        // Tous les villages sont vides (resources=0) ou sans cooldown connu
        // Attendre 5 minutes — les ressources vont se régénérer chez les PNJ
        return 5 * 60 * 1000;
    }
    return Math.min(...times);
}

// Obtenir le nombre d'îles prêtes
function getReadyIslandsCount() {
    return getIslandsWithStatus().filter(i => i.isReady).length;
}

function updateIslandsStatus() {
    const container = document.getElementById('farm-islands-status');
    if (!container) return;
    
    const islands = getIslandsWithStatus();
    
    if (islands.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #8B8B83; padding: 15px;">Aucune île trouvée</div>';
        return;
    }
    
    // Trier : prêtes d'abord, puis par temps restant
    islands.sort((a, b) => {
        if (a.isReady && !b.isReady) return -1;
        if (!a.isReady && b.isReady) return 1;
        return a.nextAvailableMs - b.nextAvailableMs;
    });
    
    let html = '';
    for (const island of islands) {
        let statusText, statusColor;
        
        if (island.isReady) {
            statusText = `✅ Prête (${island.readyCount}/${island.totalFarms})`;
            statusColor = '#81C784';
        } else {
            const ms   = island.nextAvailableMs;
            const mins = Math.floor(ms / 60000);
            const secs = Math.floor((ms % 60000) / 1000);
            statusText = `⏱️ ${mins}:${secs.toString().padStart(2, '0')} (0/${island.totalFarms})`;
            statusColor = '#FFB74D';
        }
        
        html += `
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:8px 12px;margin-bottom:4px;background:rgba(0,0,0,0.2);
                        border-radius:4px;border-left:3px solid ${statusColor};">
                <div>
                    <div style="color:#F5DEB3;font-weight:600;">${island.name}</div>
                    <div style="color:#8B8B83;font-size:10px;">${island.totalFarms} village(s) de farm</div>
                </div>
                <div style="color:${statusColor};font-weight:600;text-align:right;font-size:11px;">
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
        const islandsReadyEl = document.getElementById('farm-islands-ready');
        
        if (!farmTimer) return;
        
        if (!farmData.enabled) {
            farmTimer.textContent = '--:--';
            farmTimer.classList.remove('ready');
            if (islandsReadyEl) islandsReadyEl.textContent = '0';
            return;
        }
        
        const readyCount = getReadyIslandsCount();
        
        if (islandsReadyEl) islandsReadyEl.textContent = readyCount;
        
        if (readyCount > 0) {
            farmTimer.textContent = 'PRÊT';
            farmTimer.classList.add('ready');
        } else {
            farmTimer.classList.remove('ready');
            // Afficher le temps avant la prochaine île
            const nextMs = getNextAvailableCollection();
            if (nextMs > 0) {
                const mins = Math.floor(nextMs / 60000).toString().padStart(2, '0');
                const secs = Math.floor((nextMs % 60000) / 1000).toString().padStart(2, '0');
                farmTimer.textContent = `${mins}:${secs}`;
            } else {
                farmTimer.textContent = '--:--';
            }
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
    if (s) s.textContent = farmData.stats.skippedIslands || 0;
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
