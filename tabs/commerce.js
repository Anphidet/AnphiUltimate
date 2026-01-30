const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;

let commerceData = {
    enabled: false,
    settings: {
        autoTrade: false,
        minStorage: 50,
        maxStorage: 90
    },
    routes: [],
    stats: { totalTrades: 0, resourcesMoved: 0 }
};

function getCurrentCityId() { try { return uw.ITowns.getCurrentTown().id; } catch(e) { return null; } }
function getCurrentTownName() { try { return uw.ITowns.getCurrentTown().getName(); } catch(e) { return 'Ville inconnue'; } }
function getResources() { try { const town = uw.MM.getModels().Town[getCurrentCityId()]; return town?.attributes?.resources || { wood: 0, stone: 0, iron: 0 }; } catch(e) { return { wood: 0, stone: 0, iron: 0 }; } }
function getStorageCapacity() { try { const town = uw.MM.getModels().Town[getCurrentCityId()]; return town?.attributes?.storage || 8000; } catch(e) { return 8000; } }

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

module.render = function(container) {
    const villes = getVillesJoueur();
    const villesOptions = villes.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    const res = getResources();
    const storage = getStorageCapacity();

    container.innerHTML = `
        <style>
            .commerce-header {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 10px;
                padding: 15px;
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                gap: 15px;
            }
            .commerce-header-icon {
                font-size: 32px;
            }
            .commerce-header-info {
                flex: 1;
            }
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
                margin-bottom: 15px;
            }
            .commerce-resource {
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 8px;
                padding: 12px;
                text-align: center;
            }
            .commerce-resource-icon {
                font-size: 20px;
                margin-bottom: 5px;
            }
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
            .commerce-section {
                background: rgba(0,0,0,0.25);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 10px;
                margin-bottom: 15px;
                overflow: hidden;
            }
            .commerce-section-header {
                background: linear-gradient(180deg, rgba(93,78,55,0.8) 0%, rgba(61,50,37,0.8) 100%);
                padding: 12px 15px;
                font-family: 'Cinzel', serif;
                font-size: 14px;
                color: #F5DEB3;
                border-bottom: 1px solid rgba(212,175,55,0.2);
            }
            .commerce-section-content {
                padding: 15px;
            }
            .commerce-form-row {
                display: flex;
                gap: 10px;
                margin-bottom: 12px;
                align-items: center;
            }
            .commerce-form-row label {
                width: 100px;
                font-size: 12px;
                color: #BDB76B;
                flex-shrink: 0;
            }
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
            .commerce-btn:hover {
                transform: translateY(-2px);
            }
            .commerce-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            .commerce-btn-success {
                background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
                color: white;
            }
            .commerce-btn-danger {
                background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                color: white;
            }
            .commerce-routes-list {
                max-height: 200px;
                overflow-y: auto;
            }
            .commerce-route-item {
                display: flex;
                align-items: center;
                gap: 10px;
                background: rgba(0,0,0,0.2);
                border: 1px solid rgba(212,175,55,0.2);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 8px;
            }
            .commerce-route-info {
                flex: 1;
            }
            .commerce-route-cities {
                font-size: 12px;
                color: #F5DEB3;
            }
            .commerce-route-resources {
                font-size: 11px;
                color: #8B8B83;
                margin-top: 3px;
            }
            .commerce-coming-soon {
                text-align: center;
                padding: 40px 20px;
                color: #8B8B83;
            }
            .commerce-coming-soon-icon {
                font-size: 60px;
                margin-bottom: 15px;
                opacity: 0.5;
            }
            .commerce-coming-soon-title {
                font-family: 'Cinzel', serif;
                font-size: 20px;
                color: #D4AF37;
                margin-bottom: 10px;
            }
            .commerce-coming-soon-text {
                font-size: 14px;
            }
        </style>

        <div class="commerce-header">
            <div class="commerce-header-icon">🏪</div>
            <div class="commerce-header-info">
                <div class="commerce-header-title">${getCurrentTownName()}</div>
                <div class="commerce-header-subtitle">Entrepot: ${storage} unites</div>
            </div>
        </div>

        <div class="commerce-resources">
            <div class="commerce-resource">
                <div class="commerce-resource-icon">🪵</div>
                <div class="commerce-resource-value">${res.wood}</div>
                <div class="commerce-resource-label">Bois</div>
            </div>
            <div class="commerce-resource">
                <div class="commerce-resource-icon">🪨</div>
                <div class="commerce-resource-value">${res.stone}</div>
                <div class="commerce-resource-label">Pierre</div>
            </div>
            <div class="commerce-resource">
                <div class="commerce-resource-icon">⛏️</div>
                <div class="commerce-resource-value">${res.iron}</div>
                <div class="commerce-resource-label">Argent</div>
            </div>
        </div>

        <div class="commerce-section">
            <div class="commerce-section-header">📦 Envoi Manuel</div>
            <div class="commerce-section-content">
                <div class="commerce-form-row">
                    <label>Destination:</label>
                    <select class="commerce-select" id="commerce-dest">${villesOptions}</select>
                </div>
                <div class="commerce-form-row">
                    <label>🪵 Bois:</label>
                    <input type="number" class="commerce-input" id="commerce-wood" value="0" min="0">
                </div>
                <div class="commerce-form-row">
                    <label>🪨 Pierre:</label>
                    <input type="number" class="commerce-input" id="commerce-stone" value="0" min="0">
                </div>
                <div class="commerce-form-row">
                    <label>⛏️ Argent:</label>
                    <input type="number" class="commerce-input" id="commerce-iron" value="0" min="0">
                </div>
                <div style="display:flex;gap:10px;margin-top:15px;">
                    <button class="commerce-btn commerce-btn-success" id="commerce-send" style="flex:1;">📤 Envoyer</button>
                    <button class="commerce-btn commerce-btn-primary" id="commerce-max" style="flex:1;">📊 Maximum</button>
                </div>
            </div>
        </div>

        <div class="commerce-section">
            <div class="commerce-section-header">🔄 Routes Automatiques</div>
            <div class="commerce-section-content">
                <div class="commerce-coming-soon">
                    <div class="commerce-coming-soon-icon">🚧</div>
                    <div class="commerce-coming-soon-title">Bientot disponible</div>
                    <div class="commerce-coming-soon-text">
                        Les routes commerciales automatiques seront disponibles dans une prochaine mise a jour.
                    </div>
                </div>
            </div>
        </div>

        <div class="commerce-section">
            <div class="commerce-section-header">📊 Statistiques</div>
            <div class="commerce-section-content">
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
    `;
};

module.init = function() {
    loadData();

    document.getElementById('commerce-send').onclick = sendResources;
    document.getElementById('commerce-max').onclick = fillMaxResources;

    setupTownChangeObserver();
    log('COMMERCE', 'Module initialise', 'info');
};

module.isActive = function() {
    return commerceData.enabled;
};

module.onActivate = function(container) {
    const res = getResources();
    updateResourceDisplay(res);
};

function sendResources() {
    const destId = parseInt(document.getElementById('commerce-dest').value);
    const wood = parseInt(document.getElementById('commerce-wood').value) || 0;
    const stone = parseInt(document.getElementById('commerce-stone').value) || 0;
    const iron = parseInt(document.getElementById('commerce-iron').value) || 0;

    if (!destId) {
        log('COMMERCE', 'Selectionnez une destination', 'warning');
        return;
    }

    if (wood === 0 && stone === 0 && iron === 0) {
        log('COMMERCE', 'Selectionnez des ressources a envoyer', 'warning');
        return;
    }

    const sourceId = getCurrentCityId();
    if (sourceId === destId) {
        log('COMMERCE', 'La destination doit etre differente de la source', 'warning');
        return;
    }

    const csrfToken = uw.Game.csrfToken;
    const data = {
        id: destId,
        wood: wood,
        stone: stone,
        iron: iron
    };

    uw.$.ajax({
        type: 'POST',
        url: `/game/town_overviews?town_id=${sourceId}&action=trade&h=${csrfToken}`,
        data: { json: JSON.stringify(data) },
        dataType: 'json',
        success: function(response) {
            if (response?.json?.error) {
                log('COMMERCE', 'Erreur: ' + response.json.error, 'error');
                return;
            }

            log('COMMERCE', `Envoi: ${wood} bois, ${stone} pierre, ${iron} argent`, 'success');
            commerceData.stats.totalTrades++;
            commerceData.stats.resourcesMoved += wood + stone + iron;
            updateStats();
            saveData();

            document.getElementById('commerce-wood').value = 0;
            document.getElementById('commerce-stone').value = 0;
            document.getElementById('commerce-iron').value = 0;
        },
        error: function() {
            log('COMMERCE', 'Erreur AJAX', 'error');
        }
    });
}

function fillMaxResources() {
    const res = getResources();
    const storage = getStorageCapacity();
    const minKeep = Math.floor(storage * 0.1);

    document.getElementById('commerce-wood').value = Math.max(0, res.wood - minKeep);
    document.getElementById('commerce-stone').value = Math.max(0, res.stone - minKeep);
    document.getElementById('commerce-iron').value = Math.max(0, res.iron - minKeep);

    log('COMMERCE', 'Ressources max selectionnees (garde 10%)', 'info');
}

function updateResourceDisplay(res) {
    const woodEl = document.querySelector('.commerce-resource:nth-child(1) .commerce-resource-value');
    const stoneEl = document.querySelector('.commerce-resource:nth-child(2) .commerce-resource-value');
    const ironEl = document.querySelector('.commerce-resource:nth-child(3) .commerce-resource-value');

    if (woodEl) woodEl.textContent = res.wood;
    if (stoneEl) stoneEl.textContent = res.stone;
    if (ironEl) ironEl.textContent = res.iron;
}

function updateStats() {
    const trades = document.getElementById('commerce-stat-trades');
    const resources = document.getElementById('commerce-stat-resources');
    if (trades) trades.textContent = commerceData.stats.totalTrades;
    if (resources) resources.textContent = commerceData.stats.resourcesMoved;
}

function setupTownChangeObserver() {
    if (uw.$?.Observer && uw.GameEvents) {
        uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(() => {
            setTimeout(() => {
                const headerTitle = document.querySelector('.commerce-header-title');
                if (headerTitle) headerTitle.textContent = getCurrentTownName();
                updateResourceDisplay(getResources());
            }, 500);
        });
    }
}

function saveData() {
    GM_setValue('gu_commerce_data', JSON.stringify(commerceData));
}

function loadData() {
    const saved = GM_getValue('gu_commerce_data');
    if (saved) {
        try {
            const d = JSON.parse(saved);
            commerceData = { ...commerceData, ...d };
        } catch(e) {}
    }
}
