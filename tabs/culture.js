// Module Culture pour Grepolis Ultimate Bot
// Basé sur AutoParty de ModernBot, adapté pour Ultimate Bot

(function(module) {
    'use strict';

    const uw = module.uw;
    const log = module.log;
    const GM_getValue = module.GM_getValue;
    const GM_setValue = module.GM_setValue;

    // État du module
    let isActive = false;
    let activeTypes = {
        festival: false,
        procession: false,
        theater: false,
        games: false
    };
    let singleMode = true; // true = toutes les villes, false = ville par ville
    let intervalId = null;
    let captchaActive = false;
    let captchaCheckInterval = null;
    let randomInterval = 0;
    
    let stats = {
        festivalsLaunched: 0,
        processionsLaunched: 0,
        theatersLaunched: 0,
        gamesLaunched: 0,
        lastCelebration: null
    };

    // Charger la configuration
    function loadConfig() {
        isActive = GM_getValue('culture_active', false);
        activeTypes = GM_getValue('culture_types', { festival: false, procession: false, theater: false, games: false });
        singleMode = GM_getValue('culture_single', true);
        
        const savedStats = GM_getValue('culture_stats', null);
        if (savedStats) {
            try {
                stats = JSON.parse(savedStats);
            } catch (e) {
                // Ignorer les erreurs
            }
        }
    }

    // Sauvegarder la configuration
    function saveConfig() {
        GM_setValue('culture_active', isActive);
        GM_setValue('culture_types', activeTypes);
        GM_setValue('culture_single', singleMode);
        GM_setValue('culture_stats', JSON.stringify(stats));
    }

    // Fonction sleep
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Obtenir la liste des célébrations actives
    function getCelebrationsList(type) {
        try {
            const celebrationModels = uw.MM.getModels().Celebration;
            if (typeof celebrationModels === 'undefined') return [];
            
            const celebrations = Object.values(celebrationModels)
                .filter(celebration => celebration.attributes.celebration_type === type)
                .map(celebration => celebration.attributes.town_id);
            
            return celebrations;
        } catch (e) {
            log('CULTURE', `Erreur récupération célébrations: ${e.message}`, 'error');
            return [];
        }
    }

    // Lancer une célébration
    function makeCelebration(type, townId) {
        try {
            if (typeof townId === 'undefined') {
                const data = {
                    celebration_type: type
                };
                uw.gpAjax.ajaxPost('town_overviews', 'start_all_celebrations', data, null, {
                    success: function() {
                        log('CULTURE', `Célébration ${type} lancée dans toutes les villes`, 'success');
                        updateStats(type);
                    },
                    error: function(error) {
                        log('CULTURE', `Erreur lancement ${type}: ${error}`, 'error');
                    }
                });
            } else {
                const data = {
                    celebration_type: type,
                    town_id: townId
                };
                uw.gpAjax.ajaxPost('building_place', 'start_celebration', data, null, {
                    success: function() {
                        log('CULTURE', `Célébration ${type} lancée dans ville ${townId}`, 'success');
                        updateStats(type);
                    },
                    error: function(error) {
                        log('CULTURE', `Erreur lancement ${type} ville ${townId}: ${error}`, 'error');
                    }
                });
            }
        } catch (e) {
            log('CULTURE', `Erreur makeCelebration: ${e.message}`, 'error');
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

    // Vérifier et lancer les festivals
    async function checkParty() {
        try {
            let max = 10;
            const party = getCelebrationsList('party');
            
            if (singleMode) {
                // Mode "Toutes les villes"
                for (let townId in uw.ITowns.towns) {
                    if (party.includes(parseInt(townId))) continue;
                    
                    const town = uw.ITowns.towns[townId];
                    if (town.getBuildings().attributes.academy < 30) continue;
                    
                    const { wood, stone, iron } = town.resources();
                    if (wood < 15000 || stone < 18000 || iron < 15000) continue;
                    
                    makeCelebration('party', townId);
                    await sleep(750);
                    max -= 1;
                    
                    if (max <= 0) return;
                }
            } else {
                // Mode "Une seule ville"
                if (party.length > 1) return;
                makeCelebration('party');
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
            
            if (available < 300) {
                log('CULTURE', 'Pas assez de points de conquête (< 300)', 'info');
                return;
            }

            const triumph = getCelebrationsList('triumph');
            
            if (!singleMode) {
                // Mode "Ville par ville" (inversé dans le code original)
                for (let townId in uw.ITowns.towns) {
                    if (triumph.includes(parseInt(townId))) continue;
                    
                    makeCelebration('triumph', townId);
                    await sleep(500);
                    available -= 300;
                    
                    if (available < 300) return;
                    max -= 1;
                    
                    if (max <= 0) return;
                }
            } else {
                // Mode "Toutes les villes"
                if (triumph.length > 1) return;
                makeCelebration('triumph');
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
            
            if (singleMode) {
                // Mode "Toutes les villes"
                for (let townId in uw.ITowns.towns) {
                    if (theater.includes(parseInt(townId))) continue;
                    
                    const town = uw.ITowns.towns[townId];
                    if (town.getBuildings().attributes.theater !== 1) continue;
                    
                    const { wood, stone, iron } = town.resources();
                    if (wood < 10000 || stone < 12000 || iron < 10000) continue;
                    
                    makeCelebration('theater', townId);
                    await sleep(500);
                    max -= 1;
                    
                    if (max <= 0) return;
                }
            } else {
                // Mode "Une seule ville"
                if (theater.length > 1) return;
                makeCelebration('theater');
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
            
            // Vérifier l'or disponible
            const gold = getGoldForPlayer();
            if (gold < 50) {
                log('CULTURE', 'Pas assez d\'or pour les Jeux Olympiques (< 50)', 'info');
                return;
            }

            if (singleMode) {
                // Mode "Toutes les villes"
                const goldPerTown = 50;
                let availableGold = gold;
                
                for (let townId in uw.ITowns.towns) {
                    if (games.includes(parseInt(townId))) continue;
                    
                    const town = uw.ITowns.towns[townId];
                    if (town.getBuildings().attributes.academy < 30) continue;
                    
                    if (availableGold < goldPerTown) {
                        log('CULTURE', 'Or insuffisant pour continuer les Jeux Olympiques', 'warning');
                        break;
                    }
                    
                    makeCelebration('games', townId);
                    availableGold -= goldPerTown;
                    await sleep(750);
                    max -= 1;
                    
                    if (max <= 0) return;
                }
            } else {
                // Mode "Une seule ville"
                if (games.length > 1) return;
                makeCelebration('games');
            }
        } catch (e) {
            log('CULTURE', `Erreur checkGames: ${e.message}`, 'error');
        }
    }

    // Fonction pour récupérer l'or du joueur
    function getGoldForPlayer() {
        try {
            // Méthode 1 : DOM #gold_amount
            const domGold = document.getElementById('gold_amount');
            if (domGold) {
                const goldText = domGold.textContent.replace(/[^0-9]/g, '');
                if (goldText) {
                    return parseInt(goldText);
                }
            }
            
            // Méthode 2 : MM collections
            if (uw.MM && uw.MM.getOnlyCollectionByName) {
                const playerGold = uw.MM.getOnlyCollectionByName('PlayerGold');
                if (playerGold && playerGold.models && playerGold.models.length > 0) {
                    const gold = playerGold.models[0].get('gold');
                    if (gold !== undefined) return gold;
                }
            }
            
            // Méthode 3 : MM modèles
            const models = uw.MM.getModels();
            const goldModels = ['PlayerGold', 'PlayerLedger', 'PremiumFeatures', 'Player'];
            for (let modelName of goldModels) {
                if (models[modelName]) {
                    for (let id in models[modelName]) {
                        const obj = models[modelName][id];
                        if (obj && typeof obj.get === 'function') {
                            for (let attr of ['gold', 'premium_gold', 'player_gold']) {
                                const val = obj.get(attr);
                                if (val !== undefined && val !== null && typeof val === 'number') return val;
                            }
                        }
                        if (obj && obj.attributes) {
                            for (let attr of ['gold', 'premium_gold', 'player_gold']) {
                                if (obj.attributes[attr] !== undefined) return obj.attributes[attr];
                            }
                        }
                    }
                }
            }
        } catch (e) {
            log('CULTURE', `Erreur getGoldForPlayer: ${e.message}`, 'error');
        }
        return 0;
    }

    // Fonction principale exécutée en boucle
    async function mainLoop() {
        if (!isActive || captchaActive) return;

        try {
            if (activeTypes.procession) await checkTriumph();
            if (activeTypes.festival) await checkParty();
            if (activeTypes.theater) await checkTheater();
            if (activeTypes.games) await checkGames();
        } catch (e) {
            log('CULTURE', `Erreur boucle principale: ${e.message}`, 'error');
        }
    }

    // Vérifier la présence de captcha
    function checkCaptcha() {
        try {
            const hasCaptcha = uw.$('.botcheck').length > 0 || uw.$('#recaptcha_window').length > 0;
            
            if (hasCaptcha && !captchaActive) {
                captchaActive = true;
                log('CULTURE', 'Captcha détecté, arrêt temporaire', 'warning');
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            } else if (!hasCaptcha && captchaActive) {
                captchaActive = false;
                log('CULTURE', 'Captcha résolu, redémarrage', 'success');
                if (isActive) {
                    startInterval();
                }
            }
        } catch (e) {
            // Ignorer les erreurs de vérification captcha
        }
    }

    // Démarrer l'intervalle avec un délai aléatoire
    function startInterval() {
        if (intervalId) {
            clearInterval(intervalId);
        }
        
        randomInterval = Math.floor(Math.random() * (50000 - 5000 + 1)) + 5000;
        intervalId = setInterval(mainLoop, randomInterval);
        
        log('CULTURE', `Intervalle démarré: ${Math.round(randomInterval / 1000)}s`, 'info');
    }

    // Démarrer le module
    function start() {
        if (isActive) {
            log('CULTURE', 'Déjà actif', 'warning');
            return;
        }

        isActive = true;
        saveConfig();
        
        // Démarrer l'intervalle
        startInterval();
        
        // Démarrer la vérification du captcha
        if (!captchaCheckInterval) {
            captchaCheckInterval = setInterval(checkCaptcha, 300);
        }
        
        log('CULTURE', 'Auto-culture démarré', 'success');
        updateUI();
        
        if (window.GrepolisUltimate && window.GrepolisUltimate.updateButtonState) {
            window.GrepolisUltimate.updateButtonState();
        }
    }

    // Arrêter le module
    function stop() {
        if (!isActive) return;

        isActive = false;
        saveConfig();
        
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        
        if (captchaCheckInterval) {
            clearInterval(captchaCheckInterval);
            captchaCheckInterval = null;
        }

        log('CULTURE', 'Auto-culture arrêté', 'info');
        updateUI();
        
        if (window.GrepolisUltimate && window.GrepolisUltimate.updateButtonState) {
            window.GrepolisUltimate.updateButtonState();
        }
    }

    // Basculer un type de célébration
    function toggleType(type) {
        activeTypes[type] = !activeTypes[type];
        saveConfig();
        log('CULTURE', `${type} ${activeTypes[type] ? 'activé' : 'désactivé'}`, 'info');
        updateUI();
    }

    // Basculer le mode single/multiple
    function toggleMode() {
        singleMode = !singleMode;
        saveConfig();
        log('CULTURE', `Mode ${singleMode ? 'toutes les villes' : 'ville par ville'}`, 'info');
        updateUI();
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

    // Mettre à jour l'interface utilisateur
    function updateUI() {
        const statusEl = document.getElementById('culture-status');
        if (statusEl) {
            statusEl.textContent = isActive ? 'Actif' : 'Inactif';
            statusEl.style.color = isActive ? '#81C784' : '#E57373';
        }

        const toggleInput = document.getElementById('culture-toggle');
        if (toggleInput) {
            toggleInput.checked = isActive;
        }

        const mainControl = document.querySelector('.main-control');
        if (mainControl) {
            if (isActive) {
                mainControl.classList.remove('inactive');
            } else {
                mainControl.classList.add('inactive');
            }
        }

        // Mettre à jour les boutons de type
        const festivalBtn = document.getElementById('culture-festival');
        const processionBtn = document.getElementById('culture-procession');
        const theaterBtn = document.getElementById('culture-theater');
        const gamesBtn = document.getElementById('culture-games');

        if (festivalBtn) {
            festivalBtn.className = activeTypes.festival ? 'btn btn-success' : 'btn';
        }
        if (processionBtn) {
            processionBtn.className = activeTypes.procession ? 'btn btn-success' : 'btn';
        }
        if (theaterBtn) {
            theaterBtn.className = activeTypes.theater ? 'btn btn-success' : 'btn';
        }
        if (gamesBtn) {
            gamesBtn.className = activeTypes.games ? 'btn btn-success' : 'btn';
        }

        // Mettre à jour les boutons de mode
        const singleBtn = document.getElementById('culture-single');
        const multipleBtn = document.getElementById('culture-multiple');

        if (singleBtn && multipleBtn) {
            if (singleMode) {
                singleBtn.className = 'btn btn-success';
                multipleBtn.className = 'btn';
            } else {
                singleBtn.className = 'btn';
                multipleBtn.className = 'btn btn-success';
            }
        }

        // Afficher l'intervalle
        const intervalEl = document.getElementById('culture-interval');
        if (intervalEl) {
            intervalEl.textContent = randomInterval > 0 ? `${Math.round(randomInterval / 1000)}s` : 'N/A';
        }

        updateStatsDisplay();
        updateGoldDisplay();
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

    // Mettre à jour l'affichage de l'or
    function updateGoldDisplay() {
        const goldEl = document.getElementById('culture-gold-display');
        if (goldEl) {
            const gold = getGoldForPlayer();
            goldEl.textContent = `${gold} 💰`;
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
                    <div class="section-title">🎭 Types de Célébrations</div>
                    <div class="section-toggle">▼</div>
                </div>
                <div class="section-content">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px;">
                        <button class="btn ${activeTypes.festival ? 'btn-success' : ''}" id="culture-festival">
                            🎉 Festival
                        </button>
                        <button class="btn ${activeTypes.procession ? 'btn-success' : ''}" id="culture-procession">
                            🏆 Procession
                        </button>
                        <button class="btn ${activeTypes.theater ? 'btn-success' : ''}" id="culture-theater">
                            🎭 Théâtre
                        </button>
                        <button class="btn ${activeTypes.games ? 'btn-success' : ''}" id="culture-games">
                            🏟️ Jeux Olympiques
                        </button>
                    </div>

                    <div style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 11px; color: #BDB76B;">
                        <strong>📋 Coûts:</strong><br>
                        • Festival: 15k bois, 18k pierre, 15k fer (Académie 30+)<br>
                        • Procession: 300 points de conquête<br>
                        • Théâtre: 10k bois, 12k pierre, 10k fer (Théâtre requis)<br>
                        • Jeux Olympiques: 50 or (Académie 30+)
                    </div>

                    <div style="margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 6px; text-align: center;">
                        <div style="font-size: 11px; color: #BDB76B; margin-bottom: 5px;">OR DISPONIBLE</div>
                        <div style="font-size: 20px; color: #FFD700; font-weight: bold;" id="culture-gold-display">
                            0 💰
                        </div>
                    </div>
                </div>
            </div>

            <div class="bot-section">
                <div class="section-header">
                    <div class="section-title">⚙️ Mode de Lancement</div>
                    <div class="section-toggle">▼</div>
                </div>
                <div class="section-content">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                        <button class="btn ${singleMode ? 'btn-success' : ''}" id="culture-single">
                            🏘️ Toutes les Villes
                        </button>
                        <button class="btn ${!singleMode ? 'btn-success' : ''}" id="culture-multiple">
                            🏛️ Ville par Ville
                        </button>
                    </div>

                    <div style="padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px; font-size: 11px; color: #BDB76B; font-style: italic;">
                        ${singleMode ? 
                            '✓ Lance les célébrations dans toutes les villes éligibles automatiquement' : 
                            '✓ Lance une seule célébration à la fois'}
                    </div>

                    <div style="margin-top: 15px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 6px; text-align: center;">
                        <div style="font-size: 11px; color: #BDB76B; margin-bottom: 5px;">INTERVALLE ALÉATOIRE</div>
                        <div style="font-size: 18px; color: #FFD700; font-weight: bold;" id="culture-interval">
                            ${randomInterval > 0 ? Math.round(randomInterval / 1000) + 's' : 'N/A'}
                        </div>
                        <div style="font-size: 10px; color: #8B8B83; margin-top: 3px;">Entre 5s et 50s</div>
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
                        <strong>🛡️ Protection Anti-Captcha:</strong><br>
                        Le bot s'arrête automatiquement si un captcha est détecté et reprend une fois résolu.<br><br>
                        <strong>⏱️ Intervalle Aléatoire:</strong><br>
                        Pour éviter la détection, l'intervalle entre chaque vérification varie entre 5 et 50 secondes.<br><br>
                        <strong>✅ Conditions de Lancement:</strong><br>
                        Les célébrations ne sont lancées que si les ressources et bâtiments nécessaires sont disponibles.
                    </div>
                </div>
            </div>
        `;

        // Attacher les événements
        attachEvents();
    };

    // Attacher les événements aux éléments
    function attachEvents() {
        // Toggle principal
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

        // Boutons de type
        const festivalBtn = document.getElementById('culture-festival');
        const processionBtn = document.getElementById('culture-procession');
        const theaterBtn = document.getElementById('culture-theater');
        const gamesBtn = document.getElementById('culture-games');

        if (festivalBtn) {
            festivalBtn.addEventListener('click', () => toggleType('festival'));
        }
        if (processionBtn) {
            processionBtn.addEventListener('click', () => toggleType('procession'));
        }
        if (theaterBtn) {
            theaterBtn.addEventListener('click', () => toggleType('theater'));
        }
        if (gamesBtn) {
            gamesBtn.addEventListener('click', () => toggleType('games'));
        }

        // Boutons de mode
        const singleBtn = document.getElementById('culture-single');
        const multipleBtn = document.getElementById('culture-multiple');

        if (singleBtn) {
            singleBtn.addEventListener('click', toggleMode);
        }
        if (multipleBtn) {
            multipleBtn.addEventListener('click', toggleMode);
        }

        // Bouton reset stats
        const resetBtn = document.getElementById('reset-stats-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', resetStats);
        }

        // Sections pliables
        document.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', function() {
                this.classList.toggle('collapsed');
            });
        });
        
        // Mettre à jour l'affichage de l'or toutes les 5 secondes
        setInterval(updateGoldDisplay, 5000);
        updateGoldDisplay();
    }

    // Initialisation du module
    module.init = function() {
        loadConfig();
        
        // Redémarrer si c'était actif
        if (isActive) {
            isActive = false; // Reset pour permettre le redémarrage
            start();
        }
        
        log('CULTURE', 'Module initialisé', 'info');
    };

    // Fonction pour vérifier si le module est actif
    module.isActive = function() {
        return isActive;
    };

    // Appelé quand l'onglet est activé
    module.onActivate = function(container) {
        updateUI();
    };

    // Export des fonctions pour debug
    module.start = start;
    module.stop = stop;
    module.toggleType = toggleType;
    module.toggleMode = toggleMode;
    module.resetStats = resetStats;

})(module);
