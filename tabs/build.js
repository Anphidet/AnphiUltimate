const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;
const GM_xmlhttpRequest = module.GM_xmlhttpRequest;

const NAMES = { main: 'Senat', lumber: 'Scierie', farm: 'Ferme', stoner: 'Carriere', storage: 'Entrepot', ironer: 'Mine', barracks: 'Caserne', temple: 'Temple', market: 'Marche', docks: 'Port', academy: 'Academie', wall: 'Remparts', hide: 'Grotte', thermal: 'Thermes', library: 'Bibliotheque', lighthouse: 'Phare', tower: 'Tour', statue: 'Statue', oracle: 'Oracle', trade_office: 'Comptoir', theater: 'Theatre' };
const SPRITES = { main: [450, 0], storage: [250, 50], farm: [150, 0], academy: [0, 0], temple: [300, 50], barracks: [50, 0], docks: [100, 0], market: [0, 50], hide: [200, 0], lumber: [400, 0], stoner: [200, 50], ironer: [250, 0], wall: [50, 100], theater: [350, 50], thermal: [350, 0], library: [450, 50], lighthouse: [100, 50], tower: [400, 50], statue: [150, 50], oracle: [50, 50], trade_office: [300, 0] };
const FR_TO_ID = { 
    'senat': 'main', 'sénat': 'main',
    'scierie': 'lumber', 
    'ferme': 'farm', 
    'carriere': 'stoner', 'carrière': 'stoner',
    'entrepot': 'storage', 'entrepôt': 'storage',
    'mine': 'ironer', "mine d'argent": 'ironer', 'argent': 'ironer',
    'caserne': 'barracks', 
    'temple': 'temple', 
    'marche': 'market', 'marché': 'market',
    'port': 'docks', 
    'academie': 'academy', 'académie': 'academy',
    'remparts': 'wall', 'muraille': 'wall',
    'grotte': 'hide', 
    'thermes': 'thermal', 
    'bibliotheque': 'library', 'bibliothèque': 'library',
    'phare': 'lighthouse', 
    'tour': 'tower', 
    'statue': 'statue', 'statue divine': 'statue',
    'oracle': 'oracle', 
    'comptoir': 'trade_office', 
    'theatre': 'theater', 'théâtre': 'theater'
};

let buildData = {
    enabled: false,
    gratisEnabled: false,
    settings: { interval: 2, webhook: '' },
    stats: { built: 0, gratisClaimed: 0 },
    queues: {},
    nextCheckTime: 0
};

let senateWatcherInterval = null;
let gratisInterval = null;

module.render = function(container) {
    container.innerHTML = `
        <div class="main-control inactive" id="build-control">
            <div class="control-info">
                <div class="control-label">Auto Build</div>
                <div class="control-status" id="build-status">En attente</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-build">
                <span class="toggle-slider"></span>
            </label>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>⚡</span> Auto Gratis</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div class="main-control inactive" id="gratis-control" style="margin-bottom: 15px;">
                    <div class="control-info">
                        <div class="control-label">Construction Instantanée Gratuite</div>
                        <div class="control-status" id="gratis-status">Inactif</div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="toggle-gratis">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 11px; color: #BDB76B;">
                    <strong>ℹ️ Fonctionnement:</strong><br>
                    • Clique automatiquement sur le bouton "Gratis" toutes les 2.5 secondes<br>
                    • Termine instantanément les constructions de moins de 5 minutes<br>
                    • Fonctionne uniquement quand le bouton est disponible<br>
                    • Gratuit et sans limite d'utilisation
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
                        <span class="stat-value" id="build-stat-built">0</span>
                        <span class="stat-label">Construits</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="build-stat-queued">0</span>
                        <span class="stat-label">En attente</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-value" id="build-stat-gratis">0</span>
                        <span class="stat-label">Gratis utilisés</span>
                    </div>
                </div>
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
                    <div class="timer-value" id="build-timer">--:--</div>
                </div>
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
                    <select class="option-select" id="build-interval">
                        <option value="2">2 minutes</option>
                        <option value="5">5 minutes</option>
                        <option value="10">10 minutes</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="bot-section">
            <div class="section-header">
                <div class="section-title"><span>📋</span> File d'attente</div>
                <span class="section-toggle">▼</span>
            </div>
            <div class="section-content">
                <div id="build-queue-display" style="min-height: 60px; display: flex; flex-wrap: wrap; gap: 6px;">
                    <div style="color: #8B8B83; font-style: italic; padding: 15px; text-align: center; width: 100%;">Ouvrez le Senat pour ajouter des constructions</div>
                </div>
            </div>
        </div>
    `;
};

module.init = function() {
    loadData();
    
    document.getElementById('toggle-build').checked = buildData.enabled;
    document.getElementById('toggle-gratis').checked = buildData.gratisEnabled;
    document.getElementById('build-interval').value = buildData.settings.interval;
    updateStats();
    updateQueueDisplay();
    
    document.getElementById('toggle-build').onchange = (e) => toggleBuild(e.target.checked);
    document.getElementById('toggle-gratis').onchange = (e) => toggleGratis(e.target.checked);
    document.getElementById('build-interval').onchange = (e) => {
        buildData.settings.interval = parseInt(e.target.value);
        saveData();
        log('BUILD', 'Intervalle: ' + e.target.value + ' min', 'info');
        if (buildData.enabled) {
            buildData.nextCheckTime = Date.now() + buildData.settings.interval * 60000;
        }
    };

    document.querySelectorAll('#tab-build .section-header').forEach(h => {
        h.onclick = () => {
            h.classList.toggle('collapsed');
            const c = h.nextElementSibling;
            if (c) c.style.display = h.classList.contains('collapsed') ? 'none' : 'block';
        };
    });

    if (buildData.enabled) {
        toggleBuild(true);
    }

    if (buildData.gratisEnabled) {
        toggleGratis(true);
    }

    startSenateWatcher();
    startTimer();
    
    window.GU_Build = {
        add: (bid, lvl) => addToQueue(bid, lvl),
        remove: (idx) => removeFromQueue(idx)
    };

    log('BUILD', 'Module initialise', 'info');
};

module.isActive = function() {
    return buildData.enabled || buildData.gratisEnabled;
};

module.onActivate = function(container) {
    updateStats();
    updateQueueDisplay();
};

function toggleBuild(enabled) {
    buildData.enabled = enabled;
    const ctrl = document.getElementById('build-control');
    const status = document.getElementById('build-status');
    
    if (enabled) {
        ctrl.classList.remove('inactive');
        status.textContent = 'Actif';
        log('BUILD', 'Bot demarre', 'success');
        buildData.nextCheckTime = Date.now() + buildData.settings.interval * 60000;
        processAllQueues();
    } else {
        ctrl.classList.add('inactive');
        status.textContent = 'En attente';
        log('BUILD', 'Bot arrete', 'info');
    }
    
    saveData();
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function toggleGratis(enabled) {
    buildData.gratisEnabled = enabled;
    const ctrl = document.getElementById('gratis-control');
    const status = document.getElementById('gratis-status');
    
    if (enabled) {
        ctrl.classList.remove('inactive');
        status.textContent = 'Actif';
        status.style.color = '#81C784';
        log('BUILD', 'Auto Gratis activé', 'success');
        
        // Démarrer l'intervalle de vérification du bouton Gratis
        if (gratisInterval) clearInterval(gratisInterval);
        gratisInterval = setInterval(checkGratis, 2500);
    } else {
        ctrl.classList.add('inactive');
        status.textContent = 'Inactif';
        status.style.color = '#E57373';
        log('BUILD', 'Auto Gratis désactivé', 'info');
        
        // Arrêter l'intervalle
        if (gratisInterval) {
            clearInterval(gratisInterval);
            gratisInterval = null;
        }
    }
    
    saveData();
    if (window.GrepolisUltimate) {
        window.GrepolisUltimate.updateButtonState();
    }
}

function checkGratis() {
    try {
        // Chercher le bouton Gratis disponible (pas désactivé)
        const gratisButton = uw.$('.type_building_queue.type_free').not('.disabled');
        
        if (gratisButton.length > 0) {
            // Cliquer sur le bouton
            gratisButton.click();
            
            // Récupérer les informations de la ville actuelle
            const town = uw.ITowns.getCurrentTown();
            if (!town) return;
            
            // Chercher une construction de moins de 5 minutes (300 secondes)
            const buildingOrders = town.buildingOrders();
            if (!buildingOrders || !buildingOrders.models) return;
            
            for (let model of buildingOrders.models) {
                if (model.attributes && model.attributes.building_time < 300) {
                    callGratis(town.id, model.id);
                    return;
                }
            }
        }
    } catch (e) {
        log('BUILD', `Erreur Auto Gratis: ${e.message}`, 'error');
    }
}

function callGratis(townId, orderId) {
    try {
        const data = {
            model_url: `BuildingOrder/${orderId}`,
            action_name: 'buyInstant',
            arguments: { order_id: orderId },
            town_id: townId
        };
        
        const townName = uw.ITowns.getTown(townId)?.getName() || `Ville ${townId}`;
        
        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, null, {
            success: function() {
                buildData.stats.gratisClaimed++;
                saveData();
                updateStats();
                log('BUILD', `${townName}: Gratis utilisé (Order ${orderId})`, 'success');
            },
            error: function(error) {
                log('BUILD', `${townName}: Erreur Gratis: ${error}`, 'error');
            }
        });
    } catch (e) {
        log('BUILD', `Erreur callGratis: ${e.message}`, 'error');
    }
}

async function processAllQueues() {
    for (const tid in buildData.queues) {
        if (buildData.queues.hasOwnProperty(tid)) {
            await processTownQueue(tid);
        }
    }
}

async function processTownQueue(tid) {
    const q = buildData.queues[tid] || [];
    if (q.length === 0) return;

    const town = uw.ITowns.getTown(tid);
    if (!town) return;

    const max = uw.GameDataPremium.isAdvisorActivated('curator') ? 7 : 2;
    const currentOrders = town.buildingOrders().length;

    if (currentOrders >= max) return;

    const item = q[0];
    const name = NAMES[item.buildingId] || item.buildingId;

    uw.gpAjax.ajaxPost('frontend_bridge', 'execute', {
        model_url: 'BuildingOrder', action_name: 'buildUp',
        arguments: { building_id: item.buildingId }, town_id: tid
    }, false, () => {
        log('BUILD', `${town.getName()}: ${name} niv.${item.level}`, 'success');
        buildData.queues[tid].shift();
        buildData.stats.built++;
        saveData();
        updateStats();
        updateQueueDisplay();
        
        if (tid == uw.Game.townId) {
            refreshSenateQueue();
            uw.$('.ab-btn').remove();
        }

        setTimeout(() => processTownQueue(tid), 1000);
    }, () => {});
}

function addToQueue(bid, lvl) {
    const tid = uw.Game.townId;
    if (!buildData.queues[tid]) buildData.queues[tid] = [];
    buildData.queues[tid].push({ buildingId: bid, level: lvl });
    saveData();
    log('BUILD', `+ ${NAMES[bid]} niv.${lvl}`, 'success');
    refreshSenateQueue();
    updateStats();
    updateQueueDisplay();
    uw.$('.ab-btn').remove();
}

function removeFromQueue(idx) {
    const tid = uw.Game.townId;
    if (buildData.queues[tid]) {
        buildData.queues[tid].splice(idx, 1);
        saveData();
        refreshSenateQueue();
        updateStats();
        updateQueueDisplay();
        uw.$('.ab-btn').remove();
    }
}

function startSenateWatcher() {
    if (senateWatcherInterval) clearInterval(senateWatcherInterval);
    senateWatcherInterval = setInterval(() => {
        injectSenateQueue();
        addBuildButtons();
    }, 1000);
}

function injectSenateQueue() {
    if (uw.$('#autobuild-senate-queue').length) {
        refreshSenateQueue();
        return;
    }

    const $bt = uw.$('#building_tasks_main');
    if (!$bt.length) return;

    const queue = buildData.queues[uw.Game.townId] || [];
    
    const $parent = $bt.closest('.gpwindow_content');
    if ($parent.length && $parent.css('overflow') !== 'auto') {
        $parent.css({ 'overflow-y': 'auto', 'overflow-x': 'hidden' });
    }
    
    $bt.after(`<div id="autobuild-senate-queue" style="background:linear-gradient(180deg,rgba(45,34,23,0.95),rgba(30,23,15,0.95));border:2px solid #D4AF37;border-radius:6px;margin:10px;padding:10px;flex-shrink:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;margin-bottom:8px;border-bottom:1px solid rgba(212,175,55,0.3);">
            <span style="font-family:Cinzel,serif;font-size:12px;color:#F5DEB3;">File Auto Build</span>
            <span style="background:rgba(212,175,55,0.3);color:#FFD700;padding:2px 8px;border-radius:10px;font-size:10px;">${queue.length}</span>
        </div>
        <div class="queue-items" style="display:flex;flex-wrap:wrap;gap:4px;max-height:120px;overflow-y:auto;"></div>
    </div>`);
    refreshSenateQueue();
}

function refreshSenateQueue() {
    const queue = buildData.queues[uw.Game.townId] || [];
    const $items = uw.$('#autobuild-senate-queue .queue-items');
    const $count = uw.$('#autobuild-senate-queue').find('span:last');
    
    if ($count.length) $count.text(queue.length);
    
    if ($items.length) {
        if (queue.length === 0) {
            $items.html('<div style="color:#8B8B83;font-style:italic;text-align:center;padding:15px;">File vide - Utilisez les boutons "+ FILE"</div>');
        } else {
            $items.html(queue.map((it, i) => {
                const sp = SPRITES[it.buildingId] || [0, 0];
                return `<div style="width:50px;height:50px;background:#1a1a14;border:2px solid #8B6914;border-radius:4px;position:relative;display:inline-block;margin:3px;cursor:pointer;" title="${NAMES[it.buildingId]} niv.${it.level}">
                    <div style="width:100%;height:100%;background:url(https://gpit.innogamescdn.com/images/game/main/buildings_sprite_50x50.png) no-repeat -${sp[0]}px -${sp[1]}px;background-size:500px 150px;"></div>
                    <span style="position:absolute;bottom:2px;right:2px;background:linear-gradient(145deg,#D4AF37,#8B6914);color:#1a1408;font-weight:bold;font-size:10px;padding:1px 4px;border-radius:3px;">${it.level}</span>
                    <div onclick="event.stopPropagation();GU_Build.remove(${i})" style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;background:#E53935;color:#fff;border:2px solid #FFCDD2;border-radius:50%;font-size:10px;line-height:12px;text-align:center;cursor:pointer;display:none;">x</div>
                </div>`;
            }).join(''));
            $items.find('div[title]').hover(function(){ uw.$(this).find('div:last').show(); }, function(){ uw.$(this).find('div:last').hide(); });
        }
    }
}

function addBuildButtons() {
    const $w = uw.$('.gpwindow_content:visible');
    if (!$w.length) return;

    $w.find('.building').each(function() {
        const $b = uw.$(this);
        if ($b.find('.ab-btn').length) return;

        const $name = $b.find('.name').first();
        let nameStr = $name.text().trim().toLowerCase();
        nameStr = nameStr.replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        let bid = FR_TO_ID[nameStr];

        if (!bid) {
            const nameNorm = nameStr.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            for (const [k, v] of Object.entries(FR_TO_ID)) {
                const kNorm = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (nameNorm.includes(kNorm) || kNorm.includes(nameNorm)) { 
                    bid = v; 
                    break; 
                }
            }
        }
        
        if (!bid) {
            const buildingClasses = $b.attr('class') || '';
            const classMatch = buildingClasses.match(/building_([a-z_]+)/);
            if (classMatch && classMatch[1]) {
                bid = classMatch[1];
            }
        }
        
        if (!bid) return;

        const currentLvl = parseInt($b.find('.level').first().text()) || 0;
        const town = uw.ITowns.getTown(uw.Game.townId);
        const inRealQueue = town.buildingOrders().filter(o => o.getBuildingId() === bid).length;
        const inAutoQueue = (buildData.queues[uw.Game.townId] || []).filter(it => it.buildingId === bid).length;
        const nextLvl = currentLvl + inRealQueue + inAutoQueue + 1;

        $name.append(`<span class="ab-btn" onclick="event.stopPropagation();GU_Build.add('${bid}',${nextLvl})" style="background:linear-gradient(145deg,#D4AF37,#8B6914);border:1px solid #FFD700;color:#1a1408;font-size:8px;font-weight:bold;padding:2px 5px;margin-left:4px;cursor:pointer;border-radius:3px;">+ FILE</span>`);
    });
}

function updateQueueDisplay() {
    const container = document.getElementById('build-queue-display');
    if (!container) return;
    
    const queue = buildData.queues[uw.Game.townId] || [];
    if (queue.length === 0) {
        container.innerHTML = '<div style="color: #8B8B83; font-style: italic; padding: 15px; text-align: center; width: 100%;">Ouvrez le Senat pour ajouter des constructions</div>';
    } else {
        container.innerHTML = queue.map((it, i) => {
            const sp = SPRITES[it.buildingId] || [0, 0];
            return `<div style="width:50px;height:50px;background:#1a1a14;border:2px solid #8B6914;border-radius:4px;position:relative;cursor:pointer;" title="${NAMES[it.buildingId]} niv.${it.level}">
                <div style="width:100%;height:100%;background:url(https://gpit.innogamescdn.com/images/game/main/buildings_sprite_50x50.png) no-repeat -${sp[0]}px -${sp[1]}px;background-size:500px 150px;"></div>
                <span style="position:absolute;bottom:2px;right:2px;background:linear-gradient(145deg,#D4AF37,#8B6914);color:#1a1408;font-weight:bold;font-size:10px;padding:1px 4px;border-radius:3px;">${it.level}</span>
            </div>`;
        }).join('');
    }
}

function startTimer() {
    setInterval(() => {
        const el = document.getElementById('build-timer');
        if (!el) return;
        
        if (!buildData.enabled) {
            el.textContent = 'PAUSE';
            return;
        }

        const diff = buildData.nextCheckTime - Date.now();
        if (diff <= 0) {
            processAllQueues();
            buildData.nextCheckTime = Date.now() + buildData.settings.interval * 60000;
        }
        
        const m = Math.max(0, Math.floor(diff / 60000)).toString().padStart(2, '0');
        const s = Math.max(0, Math.floor((diff % 60000) / 1000)).toString().padStart(2, '0');
        el.textContent = `${m}:${s}`;
    }, 1000);
}

function updateStats() {
    const b = document.getElementById('build-stat-built');
    const q = document.getElementById('build-stat-queued');
    const g = document.getElementById('build-stat-gratis');
    
    if (b) b.textContent = buildData.stats.built;
    if (q) q.textContent = Object.values(buildData.queues).reduce((a, queue) => a + queue.length, 0);
    if (g) g.textContent = buildData.stats.gratisClaimed;
}

function saveData() {
    GM_setValue('gu_build_data', JSON.stringify({
        enabled: buildData.enabled,
        gratisEnabled: buildData.gratisEnabled,
        settings: buildData.settings,
        stats: buildData.stats,
        queues: buildData.queues
    }));
}

function loadData() {
    const saved = GM_getValue('gu_build_data');
    if (saved) {
        try {
            const d = JSON.parse(saved);
            buildData = { ...buildData, ...d };
        } catch(e) {}
    }
}
