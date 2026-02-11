// Module AutoCamp pour Grepolis Ultimate Bot
// Basé sur AutoBootcamp de ModernBot, adapté pour Ultimate Bot

(function(module) {
    'use strict';

    const uw = module.uw;
    const log = module.log;
    const GM_getValue = module.GM_getValue;
    const GM_setValue = module.GM_setValue;

    // État du module
    let isActive = false;
    let useDef = false;
    let intervalId = null;
    let stats = {
        totalAttacks: 0,
        rewardsCollected: 0,
        lastAttack: null
    };

    // Charger la configuration
    function loadConfig() {
        isActive = GM_getValue('autocamp_active', false);
        useDef = GM_getValue('autocamp_use_def', false);
        const savedStats = GM_getValue('autocamp_stats', null);
        if (savedStats) {
            try {
                stats = JSON.parse(savedStats);
            } catch (e) {
                // Ignorer les erreurs de parsing
            }
        }
    }

    // Sauvegarder la configuration
    function saveConfig() {
        GM_setValue('autocamp_active', isActive);
        GM_setValue('autocamp_use_def', useDef);
        GM_setValue('autocamp_stats', JSON.stringify(stats));
    }

    // Vérifier si un attaque est possible
    function canAttackBootcamp() {
        try {
            const model = uw.MM.getModelByNameAndPlayerId('PlayerAttackSpot');
            if (!model) return false;

            const cooldown = model.getCooldownDuration();
            if (cooldown > 0) {
                log('AUTOCAMP', `Cooldown actif: ${Math.ceil(cooldown)}s`, 'info');
                return false;
            }

            // Vérifier s'il y a déjà une attaque active
            const { MovementsUnits } = uw.MM.getModels();
            if (MovementsUnits && Object.keys(MovementsUnits).length > 0) {
                const attackList = Object.keys(MovementsUnits);
                for (let i = 0; i < attackList.length; i++) {
                    const movement = MovementsUnits[attackList[i]];
                    if (movement.attributes.destination_is_attack_spot || 
                        movement.attributes.origin_is_attack_spot) {
                        log('AUTOCAMP', 'Attaque déjà en cours', 'info');
                        return false;
                    }
                }
            }

            return true;
        } catch (e) {
            log('AUTOCAMP', `Erreur vérification attaque: ${e.message}`, 'error');
            return false;
        }
    }

    // Obtenir les unités disponibles pour l'attaque
    function getAvailableUnits() {
        try {
            const townId = uw.Game.townId;
            if (!townId) return null;

            const town = uw.ITowns.towns[townId];
            if (!town) return null;

            const units = { ...town.units() };
            
            // Retirer la milice
            delete units.militia;

            // Retirer les unités navales
            for (let unit in units) {
                if (uw.GameData.units[unit].is_naval) {
                    delete units[unit];
                }
            }

            // Retirer les unités défensives si l'option est désactivée
            if (!useDef) {
                delete units.sword;
                delete units.archer;
            }

            // Vérifier s'il y a des unités disponibles
            let hasUnits = false;
            for (let unit in units) {
                if (units[unit] > 0) {
                    hasUnits = true;
                    break;
                }
            }

            return hasUnits ? units : null;
        } catch (e) {
            log('AUTOCAMP', `Erreur récupération unités: ${e.message}`, 'error');
            return null;
        }
    }

    // Envoyer l'attaque au camp
    function attackBootcamp() {
        try {
            if (!canAttackBootcamp()) return false;

            const units = getAvailableUnits();
            if (!units) {
                log('AUTOCAMP', 'Aucune unité disponible pour attaquer', 'warning');
                return false;
            }

            // Envoyer la requête d'attaque
            const data = {
                model_url: `PlayerAttackSpot/${uw.Game.player_id}`,
                action_name: 'attack',
                arguments: units
            };

            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, null, {
                success: function() {
                    stats.totalAttacks++;
                    stats.lastAttack = new Date().toISOString();
                    saveConfig();
                    updateStatsDisplay();
                    log('AUTOCAMP', 'Attaque lancée avec succès', 'success');
                },
                error: function(error) {
                    log('AUTOCAMP', `Erreur lors de l'attaque: ${error}`, 'error');
                }
            });

            return true;
        } catch (e) {
            log('AUTOCAMP', `Erreur attaque bootcamp: ${e.message}`, 'error');
            return false;
        }
    }

    // Vérifier et collecter les récompenses
    function collectReward() {
        try {
            const model = uw.MM.getModelByNameAndPlayerId('PlayerAttackSpot');
            if (!model) return false;

            // Vérifier le niveau
            if (typeof model.getLevel() === 'undefined') {
                log('AUTOCAMP', 'Niveau non trouvé, arrêt du bot', 'warning');
                stop();
                return true;
            }

            // Vérifier s'il y a une récompense
            const hasReward = model.hasReward();
            if (!hasReward) return false;

            const reward = model.getReward();
            
            // Récompense instantanée (sauf faveur)
            if (reward.power_id && reward.power_id.includes('instant') && !reward.power_id.includes('favor')) {
                useReward();
                return true;
            }

            // Récompense stockable
            if (reward.stashable) {
                stashReward();
            } else {
                useReward();
            }

            return true;
        } catch (e) {
            log('AUTOCAMP', `Erreur collecte récompense: ${e.message}`, 'error');
            return false;
        }
    }

    // Utiliser la récompense
    function useReward() {
        try {
            const data = {
                model_url: `PlayerAttackSpot/${uw.Game.player_id}`,
                action_name: 'useReward',
                arguments: {}
            };

            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, null, {
                success: function() {
                    stats.rewardsCollected++;
                    saveConfig();
                    updateStatsDisplay();
                    log('AUTOCAMP', 'Récompense utilisée', 'success');
                },
                error: function(error) {
                    log('AUTOCAMP', `Erreur utilisation récompense: ${error}`, 'error');
                }
            });
        } catch (e) {
            log('AUTOCAMP', `Erreur useReward: ${e.message}`, 'error');
        }
    }

    // Stocker la récompense
    function stashReward() {
        try {
            const data = {
                model_url: `PlayerAttackSpot/${uw.Game.player_id}`,
                action_name: 'stashReward',
                arguments: {}
            };

            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, null, {
                success: function() {
                    stats.rewardsCollected++;
                    saveConfig();
                    updateStatsDisplay();
                    log('AUTOCAMP', 'Récompense stockée', 'success');
                },
                error: function() {
                    // Si le stockage échoue, utiliser la récompense
                    useReward();
                }
            });
        } catch (e) {
            log('AUTOCAMP', `Erreur stashReward: ${e.message}`, 'error');
        }
    }

    // Fonction principale exécutée en boucle
    function mainLoop() {
        if (!isActive) return;

        try {
            // D'abord essayer de collecter les récompenses
            if (collectReward()) return;
            
            // Ensuite essayer d'attaquer
            if (attackBootcamp()) return;
        } catch (e) {
            log('AUTOCAMP', `Erreur boucle principale: ${e.message}`, 'error');
        }
    }

    // Démarrer l'auto-camp
    function start() {
        if (isActive) {
            log('AUTOCAMP', 'Déjà actif', 'warning');
            return;
        }

        isActive = true;
        saveConfig();
        
        // Lancer la boucle principale toutes les 4 secondes
        intervalId = setInterval(mainLoop, 4000);
        
        log('AUTOCAMP', 'Auto-camp démarré', 'success');
        updateUI();
        
        if (window.GrepolisUltimate && window.GrepolisUltimate.updateButtonState) {
            window.GrepolisUltimate.updateButtonState();
        }
    }

    // Arrêter l'auto-camp
    function stop() {
        if (!isActive) return;

        isActive = false;
        saveConfig();
        
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        log('AUTOCAMP', 'Auto-camp arrêté', 'info');
        updateUI();
        
        if (window.GrepolisUltimate && window.GrepolisUltimate.updateButtonState) {
            window.GrepolisUltimate.updateButtonState();
        }
    }

    // Basculer le mode défensif
    function toggleDefMode() {
        useDef = !useDef;
        saveConfig();
        log('AUTOCAMP', `Mode défensif ${useDef ? 'activé' : 'désactivé'}`, 'info');
        updateUI();
    }

    // Réinitialiser les statistiques
    function resetStats() {
        stats = {
            totalAttacks: 0,
            rewardsCollected: 0,
            lastAttack: null
        };
        saveConfig();
        updateStatsDisplay();
        log('AUTOCAMP', 'Statistiques réinitialisées', 'info');
    }

    // Mettre à jour l'interface utilisateur
    function updateUI() {
        const statusEl = document.getElementById('autocamp-status');
        if (statusEl) {
            statusEl.textContent = isActive ? 'Actif' : 'Inactif';
            statusEl.style.color = isActive ? '#81C784' : '#E57373';
        }

        const toggleInput = document.getElementById('autocamp-toggle');
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

        const defOnlyBtn = document.getElementById('autocamp-def-only');
        const defOffBtn = document.getElementById('autocamp-def-off');
        
        if (defOnlyBtn && defOffBtn) {
            if (useDef) {
                defOnlyBtn.classList.remove('btn-success');
                defOnlyBtn.classList.add('btn');
                defOffBtn.classList.remove('btn');
                defOffBtn.classList.add('btn-success');
            } else {
                defOnlyBtn.classList.remove('btn');
                defOnlyBtn.classList.add('btn-success');
                defOffBtn.classList.remove('btn-success');
                defOffBtn.classList.add('btn');
            }
        }

        updateStatsDisplay();
    }

    // Mettre à jour l'affichage des statistiques
    function updateStatsDisplay() {
        const totalEl = document.getElementById('stat-total-attacks');
        const rewardsEl = document.getElementById('stat-rewards-collected');
        const lastEl = document.getElementById('stat-last-attack');

        if (totalEl) totalEl.textContent = stats.totalAttacks.toLocaleString();
        if (rewardsEl) rewardsEl.textContent = stats.rewardsCollected.toLocaleString();
        
        if (lastEl) {
            if (stats.lastAttack) {
                const date = new Date(stats.lastAttack);
                lastEl.textContent = date.toLocaleTimeString('fr-FR');
            } else {
                lastEl.textContent = 'Jamais';
            }
        }
    }

    // Générer le HTML de l'interface
    module.render = function(container) {
        container.innerHTML = `
            <div class="main-control ${isActive ? '' : 'inactive'}">
                <div class="control-info">
                    <div class="control-label">Auto-Camp d'Entraînement</div>
                    <div class="control-status" id="autocamp-status">${isActive ? 'Actif' : 'Inactif'}</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="autocamp-toggle" ${isActive ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>

            <div class="bot-section">
                <div class="section-header">
                    <div class="section-title">⚔️ Configuration</div>
                    <div class="section-toggle">▼</div>
                </div>
                <div class="section-content">
                    <div style="margin-bottom: 15px;">
                        <div class="option-label">Mode d'Attaque</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
                            <button class="btn ${!useDef ? 'btn-success' : ''}" id="autocamp-def-only">
                                Offensif Seulement
                            </button>
                            <button class="btn ${useDef ? 'btn-success' : ''}" id="autocamp-def-off">
                                Off + Déf
                            </button>
                        </div>
                        <div style="margin-top: 10px; font-size: 11px; color: #BDB76B; font-style: italic;">
                            ${useDef ? '✓ Utilise toutes les unités disponibles' : '✓ N\'utilise que les unités offensives'}
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 6px;">
                        <div style="font-size: 12px; color: #F5DEB3; line-height: 1.6;">
                            <strong>ℹ️ Fonctionnement:</strong><br>
                            • Attaque automatiquement le camp d'entraînement<br>
                            • Collecte les récompenses automatiquement<br>
                            • Stocke les récompenses conservables<br>
                            • Utilise les récompenses instantanées<br>
                            • Intervalle de vérification: 4 secondes
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
                    <div class="stats-grid">
                        <div class="stat-box">
                            <span class="stat-value" id="stat-total-attacks">${stats.totalAttacks}</span>
                            <span class="stat-label">Attaques Total</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-value" id="stat-rewards-collected">${stats.rewardsCollected}</span>
                            <span class="stat-label">Récompenses</span>
                        </div>
                    </div>
                    <div style="margin-top: 15px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 6px; text-align: center;">
                        <div style="font-size: 11px; color: #BDB76B; margin-bottom: 5px;">DERNIÈRE ATTAQUE</div>
                        <div style="font-size: 16px; color: #FFD700; font-weight: bold;" id="stat-last-attack">
                            ${stats.lastAttack ? new Date(stats.lastAttack).toLocaleTimeString('fr-FR') : 'Jamais'}
                        </div>
                    </div>
                    <button class="btn btn-danger btn-full" id="reset-stats-btn" style="margin-top: 15px;">
                        Réinitialiser les Statistiques
                    </button>
                </div>
            </div>
        `;

        // Attacher les événements
        attachEvents();
    };

    // Attacher les événements aux éléments
    function attachEvents() {
        // Toggle principal
        const toggleInput = document.getElementById('autocamp-toggle');
        if (toggleInput) {
            toggleInput.addEventListener('change', function() {
                if (this.checked) {
                    start();
                } else {
                    stop();
                }
            });
        }

        // Boutons de mode
        const defOnlyBtn = document.getElementById('autocamp-def-only');
        const defOffBtn = document.getElementById('autocamp-def-off');
        
        if (defOnlyBtn) {
            defOnlyBtn.addEventListener('click', function() {
                if (useDef) {
                    toggleDefMode();
                }
            });
        }

        if (defOffBtn) {
            defOffBtn.addEventListener('click', function() {
                if (!useDef) {
                    toggleDefMode();
                }
            });
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
    }

    // Initialisation du module
    module.init = function() {
        loadConfig();
        
        // Redémarrer si c'était actif
        if (isActive) {
            isActive = false; // Reset pour permettre le redémarrage
            start();
        }
        
        log('AUTOCAMP', 'Module initialisé', 'info');
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
    module.toggleDefMode = toggleDefMode;
    module.resetStats = resetStats;

})(module);
