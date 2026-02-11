(function(module) {
    const uw = module.uw;
    const log = module.log;
    const GM_getValue = module.GM_getValue;
    const GM_setValue = module.GM_setValue;

    // État du module
    let isActive = false;
    let intervalId = null;
    let captchaActive = false;
    let captchaCheckInterval = null;
    let randomInterval = 0;
    
    // Configuration par ville : { townId: { festival: true, procession: false, ... } }
    let townSettings = {};
    
    let stats = {
        festivalsLaunched: 0,
        processionsLaunched: 0,
        theatersLaunched: 0,
        gamesLaunched: 0,
        lastCelebration: null
    };

    // Obtenir les paramètres d'une ville
    function getTownSettings(townId) {
        if (!townSettings[townId]) {
            townSettings[townId] = {
                festival: false,
                procession: false,
                theater: false,
                games: false
            };
        }
        return townSettings[townId];
    }

    // Définir un paramètre pour une ville
    function setTownSetting(townId, type, enabled) {
        if (!townSettings[townId]) {
            townSettings[townId] = {
                festival: false,
                procession: false,
                theater: false,
                games: false
            };
        }
        townSettings[townId][type] = enabled;
        saveConfig();
    }

    // Vérifier si une ville a des célébrations actives
    function hasTownAnyCelebrationEnabled(townId) {
        const settings = getTownSettings(townId);
        return settings.festival || settings.procession || settings.theater || settings.games;
    }

    // Obtenir toutes les villes du joueur
    function getAllTowns() {
        const towns = [];
        try {
            for (let townId in uw.ITowns.towns) {
                const town = uw.ITowns.towns[townId];
                towns.push({
                    id: parseInt(townId),
                    name: town.getName ? town.getName() : town.name || `Ville ${townId}`
                });
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        return towns;
    }

    // Fonction sleep
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Récupérer les célébrations en cours
    function getCelebrationsList(type) {
        const list = [];
        try {
            const celebrations = uw.MM.getModels().Celebration;
            if (celebrations) {
                for (let id in celebrations) {
                    const celeb = celebrations[id];
                    if (celeb && celeb.attributes) {
                        if (celeb.attributes.celebration_type === type) {
                            list.push(celeb.attributes.town_id);
                        }
                    }
                }
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        return list;
    }

    // Récupérer l'or du joueur
    function getGoldForPlayer() {
        try {
            const domGold = document.getElementById('gold_amount');
            if (domGold) {
                const goldText = domGold.textContent.replace(/[^0-9]/g, '');
                if (goldText) {
                    return parseInt(goldText);
                }
            }
            
            if (uw.MM && uw.MM.getOnlyCollectionByName) {
                const playerGold = uw.MM.getOnlyCollectionByName('PlayerGold');
                if (playerGold && playerGold.models && playerGold.models.length > 0) {
                    const gold = playerGold.models[0].get('gold');
                    if (gold !== undefined) return gold;
                }
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        return 0;
    }

    // Récupérer les points de combat
    function getBattlePointsForPlayer() {
        try {
            const killpoints = uw.MM.getModelByNameAndPlayerId('PlayerKillpoints');
            if (killpoints && killpoints.attributes) {
                return killpoints.attributes.att || 0;
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        return 0;
    }

    // Obtenir le niveau d'un bâtiment
    function getBuildingLevel(townId, buildingId) {
        try {
            const town = uw.ITowns.getTown(townId);
            if (town && town.getBuildings) {
                const buildings = town.getBuildings();
                if (buildings && buildings.attributes) {
                    return buildings.attributes[buildingId] || 0;
                }
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        return 0;
    }

    // Vérifier si une célébration est en cours dans une ville
    function getCelebrationInProgress(townId) {
        try {
            const celebrations = uw.MM.getModels().Celebration;
            if (celebrations) {
                for (let id in celebrations) {
                    const celeb = celebrations[id];
                    if (celeb && celeb.attributes && celeb.attributes.town_id == townId) {
                        return true;
                    }
                }
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        return false;
    }

    // Lancer une célébration
    function makeCelebration(type, townId) {
        try {
            const data = {
                celebration_type: type,
                town_id: townId
            };
            
            uw.gpAjax.ajaxPost('building_place', 'start_celebration', data, null, {
                success: function() {
                    stats.lastCelebration = new Date().toISOString();
                    updateStats(type);
                    saveConfig();
                    updateStatsDisplay();
                },
                error: function(error) {
                    // Ne log que les erreurs importantes (pas "already celebrating")
                    if (error && !error.toString().includes('already')) {
                        log('CULTURE', `Erreur ${type}: ${error}`, 'error');
                    }
                }
            });
        } catch (e) {
            log('CULTURE', `Erreur makeCelebration: ${e.message}`, 'error');
        }
    }

    // Vérifier et lancer les festivals
    async function checkParty() {
        try {
            let max = 10;
            const party = getCelebrationsList('party');
            let launched = 0;
            
            for (let townId in uw.ITowns.towns) {
                if (party.includes(parseInt(townId))) continue;
                
                const settings = getTownSettings(townId);
                if (!settings.festival) continue;
                
                const town = uw.ITowns.towns[townId];
                if (town.getBuildings().attributes.academy < 30) continue;
                
                const { wood, stone, iron } = town.resources();
                if (wood < 15000 || stone < 18000 || iron < 15000) continue;
                
                makeCelebration('party', townId);
                launched++;
                await sleep(750);
                max -= 1;
                
                if (max <= 0) break;
            }
            
            if (launched > 0) {
                log('CULTURE', `${launched} festival(s) lancé(s)`, 'success');
            }
        } catch (e) {
            log('CULTURE', `Erreur checkParty: ${e.message}`, 'error');
        }
    }

    // Vérifier et lancer les processions
    async function checkTriumph() {
        try {
            let max = 10;
            const killpoints = uw.MM.getModelByNameAndPlayerId('PlayerKillpoints').attributes;
            let available = killpoints.att + killpoints.def - killpoints.used;
            
            if (available < 300) return;

            const triumph = getCelebrationsList('triumph');
            let launched = 0;
            
            for (let townId in uw.ITowns.towns) {
                if (triumph.includes(parseInt(townId))) continue;
                
                const settings = getTownSettings(townId);
                if (!settings.procession) continue;
                
                if (available < 300) break;
                
                makeCelebration('triumph', townId);
                launched++;
                available -= 300;
                await sleep(500);
                max -= 1;
                
                if (max <= 0) break;
            }
            
            if (launched > 0) {
                log('CULTURE', `${launched} procession(s) lancée(s)`, 'success');
            }
        } catch (e) {
            log('CULTURE', `Erreur checkTriumph: ${e.message}`, 'error');
        }
    }

    // Vérifier et lancer les théâtres
    async function checkTheater() {
        try {
            let max = 10;
            const theater = getCelebrationsList('theater');
            let launched = 0;
            
            for (let townId in uw.ITowns.towns) {
                if (theater.includes(parseInt(townId))) continue;
                
                const settings = getTownSettings(townId);
                if (!settings.theater) continue;
                
                const town = uw.ITowns.towns[townId];
                if (town.getBuildings().attributes.theater !== 1) continue;
                
                const { wood, stone, iron } = town.resources();
                if (wood < 10000 || stone < 12000 || iron < 10000) continue;
                
                makeCelebration('theater', townId);
                launched++;
                await sleep(500);
                max -= 1;
                
                if (max <= 0) break;
            }
            
            if (launched > 0) {
                log('CULTURE', `${launched} théâtre(s) lancé(s)`, 'success');
            }
        } catch (e) {
            log('CULTURE', `Erreur checkTheater: ${e.message}`, 'error');
        }
    }

    // Vérifier et lancer les Jeux Olympiques
    async function checkGames() {
        try {
            let max = 10;
            const games = getCelebrationsList('games');
            
            const gold = getGoldForPlayer();
            if (gold < 50) return;

            let availableGold = gold;
            const goldPerTown = 50;
            let launched = 0;
            
            for (let townId in uw.ITowns.towns) {
                if (games.includes(parseInt(townId))) continue;
                
                const settings = getTownSettings(townId);
                if (!settings.games) continue;
                
                const town = uw.ITowns.towns[townId];
                if (town.getBuildings().attributes.academy < 30) continue;
                
                if (availableGold < goldPerTown) break;
                
                makeCelebration('games', townId);
                launched++;
                availableGold -= goldPerTown;
                await sleep(750);
                max -= 1;
                
                if (max <= 0) break;
            }
            
            if (launched > 0) {
                log('CULTURE', `${launched} jeux olympique(s) lancé(s)`, 'success');
            }
        } catch (e) {
            log('CULTURE', `Erreur checkGames: ${e.message}`, 'error');
        }
    }

    // Boucle principale
    async function mainLoop() {
        if (!isActive || captchaActive) return;

        try {
            await checkTriumph();
            await checkParty();
            await checkTheater();
            await checkGames();
        } catch (e) {
            log('CULTURE', `Erreur boucle principale: ${e.message}`, 'error');
        }
    }

    // Vérifier la présence d'un captcha
    function checkCaptcha() {
        try {
            const hasCaptcha = uw.$('.botcheck').length > 0 || uw.$('#recaptcha_window').length > 0;
            
            if (hasCaptcha && !captchaActive) {
                captchaActive = true;
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
                log('CULTURE', '⚠️ Captcha détecté - Bot en pause', 'warning');
            } else if (!hasCaptcha && captchaActive) {
                captchaActive = false;
                randomInterval = Math.floor(Math.random() * 45000) + 5000;
                intervalId = setInterval(mainLoop, randomInterval);
                log('CULTURE', '✅ Captcha résolu - Bot redémarré', 'success');
            }
        } catch (e) {
            // Ignorer les erreurs
        }
    }

    // Démarrer le bot
    function start() {
        if (isActive) return;
        
        isActive = true;
        updateStatus();
        
        // Vérifier qu'au moins une ville a une célébration activée
        const towns = getAllTowns();
        let hasAnyCelebration = false;
        for (let town of towns) {
            if (hasTownAnyCelebrationEnabled(town.id)) {
                hasAnyCelebration = true;
                break;
            }
        }
        
        if (!hasAnyCelebration) {
            log('CULTURE', 'Aucune célébration activée. Configurez au moins une ville.', 'warning');
        } else {
            log('CULTURE', 'Bot démarré', 'success');
        }
        
        randomInterval = Math.floor(Math.random() * 45000) + 5000;
        intervalId = setInterval(mainLoop, randomInterval);
        
        if (!captchaCheckInterval) {
            captchaCheckInterval = setInterval(checkCaptcha, 300);
        }
        
        saveConfig();
        
        if (window.GrepolisUltimate) {
            window.GrepolisUltimate.updateButtonState();
        }
    }

    // Arrêter le bot
    function stop() {
        if (!isActive) return;

        isActive = false;
        updateStatus();
        
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        
        if (captchaCheckInterval) {
            clearInterval(captchaCheckInterval);
            captchaCheckInterval = null;
        }

        log('CULTURE', 'Bot arrêté', 'info');
        saveConfig();
        
        if (window.GrepolisUltimate) {
            window.GrepolisUltimate.updateButtonState();
        }
    }

    // Mettre à jour le statut visuel
    function updateStatus() {
        const statusEl = document.getElementById('culture-status');
        if (statusEl) {
            statusEl.textContent = isActive ? 'Actif' : 'Inactif';
            statusEl.style.color = isActive ? '#81C784' : '#E57373';
        }

        const toggleInput = document.getElementById('culture-toggle');
        if (toggleInput) {
            toggleInput.checked = isActive;
        }

        const mainControl = document.querySelector('#tab-culture .main-control');
        if (mainControl) {
            if (isActive) {
                mainControl.classList.remove('inactive');
            } else {
                mainControl.classList.add('inactive');
            }
        }
    }

    // Mettre à jour les statistiques
    function updateStats(type) {
        stats.lastCelebration = new Date().toISOString();
        
        if (type === 'party') {
            stats.festivalsLaunched++;
        } else if (type === 'triumph') {
            stats.processionsLaunched++;
        } else if (type === 'theater') {
            stats.theatersLaunched++;
        } else if (type === 'games') {
            stats.gamesLaunched++;
        }
        
        saveConfig();
        updateStatsDisplay();
    }

    // Réinitialiser les statistiques
    function resetStats() {
        stats = {
            festivalsLaunched: 0,
            processionsLaunched: 0,
            theatersLaunched: 0,
            gamesLaunched: 0,
            lastCelebration: null
        };
        saveConfig();
        updateStatsDisplay();
        log('CULTURE', 'Statistiques réinitialisées', 'info');
    }

    // Mettre à jour l'affichage des statistiques
    function updateStatsDisplay() {
        const festivalsEl = document.getElementById('stat-festivals');
        const processionsEl = document.getElementById('stat-processions');
        const theatersEl = document.getElementById('stat-theaters');
        const gamesEl = document.getElementById('stat-games');
        const lastEl = document.getElementById('stat-last-celebration');

        if (festivalsEl) festivalsEl.textContent = stats.festivalsLaunched.toLocaleString();
        if (processionsEl) processionsEl.textContent = stats.processionsLaunched.toLocaleString();
        if (theatersEl) theatersEl.textContent = stats.theatersLaunched.toLocaleString();
        if (gamesEl) gamesEl.textContent = stats.gamesLaunched.toLocaleString();
        
        if (lastEl) {
            if (stats.lastCelebration) {
                const date = new Date(stats.lastCelebration);
                lastEl.textContent = date.toLocaleTimeString('fr-FR');
            } else {
                lastEl.textContent = 'Jamais';
            }
        }
    }

    // Mettre à jour l'affichage des ressources
    function updateResourcesDisplay() {
        const goldEl = document.getElementById('culture-gold-display');
        const bpEl = document.getElementById('culture-bp-display');
        
        if (goldEl) {
            const gold = getGoldForPlayer();
            goldEl.textContent = gold.toLocaleString();
        }
        
        if (bpEl) {
            const bp = getBattlePointsForPlayer();
            bpEl.textContent = bp.toLocaleString();
        }
    }

    // Mettre à jour la configuration des villes
    function updateTownsConfig() {
        const container = document.getElementById('culture-towns-config');
        if (!container) return;
        
        const towns = getAllTowns();
        if (towns.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #8B8B83; padding: 20px;">Aucune ville trouvée</div>';
            return;
        }
        
        let html = '';
        
        for (let town of towns) {
            const settings = getTownSettings(town.id);
            const inProgress = getCelebrationInProgress(town.id);
            
            // Vérifier les bâtiments disponibles
            const hasAcademy = getBuildingLevel(town.id, 'academy') >= 30;
            const hasTheaterBuilding = getBuildingLevel(town.id, 'theater') >= 1;
            
            html += `
                <div class="culture-town-card">
                    <div class="culture-town-header">
                        <span class="culture-town-name">${town.name}</span>
                        ${inProgress ? '<span style="font-size: 10px; color: #FFB74D;">🎉 En cours</span>' : ''}
                    </div>
                    <div class="culture-celebrations-grid">
                        ${renderCelebToggle(town.id, 'festival', '🎉', 'Festival', settings.festival, hasAcademy)}
                        ${renderCelebToggle(town.id, 'procession', '🏆', 'Procession', settings.procession, true)}
                        ${renderCelebToggle(town.id, 'theater', '🎭', 'Théâtre', settings.theater, hasTheaterBuilding)}
                        ${renderCelebToggle(town.id, 'games', '🏟️', 'Jeux Olympiques', settings.games, hasAcademy)}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Attacher les événements aux checkboxes
        container.querySelectorAll('.culture-celeb-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const townId = parseInt(this.dataset.townId);
                const type = this.dataset.type;
                setTownSetting(townId, type, this.checked);
                
                const toggle = this.closest('.culture-celeb-toggle');
                if (this.checked) {
                    toggle.classList.add('active');
                } else {
                    toggle.classList.remove('active');
                }
            });
        });
    }
    
    function renderCelebToggle(townId, type, icon, name, checked, available) {
        const disabled = !available;
        const activeClass = checked && available ? 'active' : '';
        const disabledClass = disabled ? 'disabled' : '';
        
        return `
            <div class="culture-celeb-toggle ${activeClass} ${disabledClass}">
                <input type="checkbox" 
                       class="culture-celeb-checkbox" 
                       ${checked ? 'checked' : ''}
                       ${disabled ? 'disabled' : ''}
                       data-town-id="${townId}"
                       data-type="${type}">
                <span class="culture-celeb-icon">${icon}</span>
                <span class="culture-celeb-name">${name}</span>
            </div>
        `;
    }

    // Sélectionner/désélectionner toutes les célébrations
    function selectAllCelebrations(enable) {
        const towns = getAllTowns();
        
        for (let town of towns) {
            const townId = town.id;
            
            // Vérifier les bâtiments disponibles
            const hasAcademy = getBuildingLevel(townId, 'academy') >= 30;
            const hasTheaterBuilding = getBuildingLevel(townId, 'theater') >= 1;
            
            // Festival et Jeux Olympiques nécessitent Académie 30+
            if (hasAcademy) {
                setTownSetting(townId, 'festival', enable);
                setTownSetting(townId, 'games', enable);
            }
            
            // Procession toujours disponible
            setTownSetting(townId, 'procession', enable);
            
            // Théâtre nécessite le bâtiment
            if (hasTheaterBuilding) {
                setTownSetting(townId, 'theater', enable);
            }
        }
        
        updateTownsConfig();
        log('CULTURE', enable ? 'Toutes les célébrations activées' : 'Toutes les célébrations désactivées', 'info');
    }

    // Attacher les événements
    function attachEvents() {
        const toggleInput = document.getElementById('culture-toggle');
        if (toggleInput) {
            toggleInput.addEventListener('change', function() {
                if (this.checked) {
                    start();
                } else {
                    stop();
                }
            });
        }

        const selectAllBtn = document.getElementById('culture-select-all');
        const deselectAllBtn = document.getElementById('culture-deselect-all');
        
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => selectAllCelebrations(true));
        }
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', () => selectAllCelebrations(false));
        }

        const resetBtn = document.getElementById('reset-stats-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetStats);
        }

        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', function() {
                this.classList.toggle('collapsed');
            });
        });
        
        // Mettre à jour l'affichage des ressources toutes les 10 secondes
        setInterval(updateResourcesDisplay, 10000);
        updateResourcesDisplay();
    }

    // Sauvegarder la configuration
    function saveConfig() {
        GM_setValue('culture_active', isActive);
        GM_setValue('culture_town_settings', townSettings);
        GM_setValue('culture_stats', JSON.stringify(stats));
    }

    // Charger la configuration
    function loadConfig() {
        isActive = GM_getValue('culture_active', false);
        townSettings = GM_getValue('culture_town_settings', {});
        
        const savedStats = GM_getValue('culture_stats', null);
        if (savedStats) {
            try {
                stats = JSON.parse(savedStats);
            } catch (e) {
                // Ignorer les erreurs
            }
        }
    }

    // Générer le HTML de l'interface
    module.render = function(container) {
        container.innerHTML = `
            <div class="main-control ${isActive ? '' : 'inactive'}">
                <div class="control-info">
                    <div class="control-label">Auto-Culture</div>
                    <div class="control-status" id="culture-status">${isActive ? 'Actif' : 'Inactif'}</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="culture-toggle" ${isActive ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <div class="bot-section">
                <div class="section-header">
                    <div class="section-title">🏛️ Configuration par Ville</div>
                    <div class="section-toggle">▼</div>
                </div>
                <div class="section-content">
                    <div style="margin-bottom: 15px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 11px; color: #BDB76B;">
                        <strong>ℹ️ Instructions:</strong><br>
                        Activez les célébrations que vous souhaitez lancer automatiquement pour chaque ville.<br>
                        Le bot vérifie toutes les 5-50 secondes et lance les célébrations disponibles.
                    </div>
                    
                    <div style="display: flex; gap: 8px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(212,175,55,0.2);">
                        <button class="btn btn-success" style="flex: 1; font-size: 11px;" id="culture-select-all">✅ Tout Activer</button>
                        <button class="btn btn-danger" style="flex: 1; font-size: 11px;" id="culture-deselect-all">❌ Tout Désactiver</button>
                    </div>
                    
                    <div id="culture-towns-config" style="max-height: 500px; overflow-y: auto;"></div>
                </div>
            </div>

            <div class="bot-section">
                <div class="section-header">
                    <div class="section-title">💰 Ressources Disponibles</div>
                    <div class="section-toggle">▼</div>
                </div>
                <div class="section-content">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div style="text-align: center; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                            <div style="font-size: 16px; margin-bottom: 4px;">💰</div>
                            <div style="font-size: 18px; color: #FFD700; font-weight: bold;" id="culture-gold-display">0</div>
                            <div style="font-size: 10px; color: #8B8B83; margin-top: 2px;">Or</div>
                        </div>
                        <div style="text-align: center; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                            <div style="font-size: 16px; margin-bottom: 4px;">⚔️</div>
                            <div style="font-size: 18px; color: #FFD700; font-weight: bold;" id="culture-bp-display">0</div>
                            <div style="font-size: 10px; color: #8B8B83; margin-top: 2px;">Points Combat</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="bot-section">
                <div class="section-header">
                    <div class="section-title">📊 Statistiques</div>
                    <div class="section-toggle">▼</div>
                </div>
                <div class="section-content">
                    <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
                        <div class="stat-box">
                            <span class="stat-value" id="stat-festivals">${stats.festivalsLaunched}</span>
                            <span class="stat-label">Festivals</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="stat-processions">${stats.processionsLaunched}</span>
                            <span class="stat-label">Processions</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="stat-theaters">${stats.theatersLaunched}</span>
                            <span class="stat-label">Théâtres</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="stat-games">${stats.gamesLaunched}</span>
                            <span class="stat-label">Jeux Olympiques</span>
                        </div>
                    </div>
                    <div style="margin-top: 15px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 6px; text-align: center;">
                        <div style="font-size: 11px; color: #BDB76B; margin-bottom: 5px;">DERNIÈRE CÉLÉBRATION</div>
                        <div style="font-size: 16px; color: #FFD700; font-weight: bold;" id="stat-last-celebration">
                            ${stats.lastCelebration ? new Date(stats.lastCelebration).toLocaleTimeString('fr-FR') : 'Jamais'}
                        </div>
                    </div>
                    <button class="btn btn-danger btn-full" id="reset-stats-btn" style="margin-top: 15px;">
                        Réinitialiser les Statistiques
                    </button>
                </div>
            </div>

            <div class="bot-section">
                <div class="section-header">
                    <div class="section-title">ℹ️ Informations</div>
                    <div class="section-toggle">▼</div>
                </div>
                <div class="section-content">
                    <div style="font-size: 12px; color: #F5DEB3; line-height: 1.6;">
                        <strong>📋 Coûts des célébrations:</strong><br>
                        • Festival: 15k bois, 18k pierre, 15k fer (Académie 30+)<br>
                        • Procession: 300 points de combat<br>
                        • Théâtre: 10k bois, 12k pierre, 10k fer (Théâtre requis)<br>
                        • Jeux Olympiques: 50 or (Académie 30+)<br><br>
                        <strong>🛡️ Protection Anti-Captcha:</strong><br>
                        Le bot s'arrête automatiquement si un captcha est détecté et reprend une fois résolu.<br><br>
                        <strong>⏱️ Intervalle Aléatoire:</strong><br>
                        Pour éviter la détection, l'intervalle entre chaque vérification varie entre 5 et 50 secondes.
                    </div>
                </div>
            </div>

            <style>
                .culture-town-card {
                    background: rgba(0,0,0,0.25);
                    border: 1px solid rgba(212,175,55,0.3);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 10px;
                }
                .culture-town-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
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
                .culture-celebrations-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
                .culture-celeb-toggle {
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
                .culture-celeb-toggle:hover:not(.disabled) {
                    border-color: rgba(212,175,55,0.5);
                    background: rgba(0,0,0,0.3);
                }
                .culture-celeb-toggle.active {
                    border-color: rgba(76,175,80,0.6);
                    background: rgba(76,175,80,0.15);
                }
                .culture-celeb-toggle.disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .culture-celeb-checkbox {
                    width: 18px;
                    height: 18px;
                    accent-color: #4CAF50;
                }
                .culture-celeb-icon {
                    font-size: 16px;
                }
                .culture-celeb-name {
                    font-size: 11px;
                    color: #F5DEB3;
                    flex: 1;
                }
            </style>
        `;

        attachEvents();
        updateTownsConfig();
    };

    // Initialiser le module
    module.init = function() {
        loadConfig();
        
        if (isActive) {
            start();
        }
        
        updateStatsDisplay();
        updateResourcesDisplay();
        
        log('CULTURE', 'Module initialisé', 'info');
    };

    // Vérifier si le module est actif
    module.isActive = function() {
        return isActive;
    };

    // Callback quand l'onglet est activé
    module.onActivate = function(container) {
        updateTownsConfig();
        updateStatsDisplay();
        updateResourcesDisplay();
    };

})(module);
