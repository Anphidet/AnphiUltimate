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
const DELAI_APRES_ANNULATION = 800;
const MAX_TENTATIVES = 50; // Nombre maximum de tentatives avant annulation définitive

let calageData = {
    attaques: [],
    attaqueEnCours: null,
    botActif: false,
    intervalCheck: null,
    plans: [],
    plansActifs: {},
    settings: { webhook: '', annulerSiEchec: true }
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

// NOUVELLE FONCTION: Ouvrir le planificateur d'attaque natif
function ouvrirPlanificateurAttaque(targetId, callback) {
    try {
        log('CALAGE', 'Ouverture du planificateur pour cible: ' + targetId, 'info');
        
        // Méthode 1: Via WMap
        if (uw.WMap && uw.WMap.openAttackPlannerWindow) {
            uw.WMap.openAttackPlannerWindow(targetId);
            if (callback) setTimeout(callback, 500);
            return true;
        }
        
        // Méthode 2: Via Layout
        if (uw.Layout && uw.Layout.showAttackPlannerWindow) {
            uw.Layout.showAttackPlannerWindow(targetId);
            if (callback) setTimeout(callback, 500);
            return true;
        }
        
        // Méthode 3: Via GPWindowMgr
        if (uw.GPWindowMgr) {
            const wnd = uw.GPWindowMgr.getOpenFirst(uw.GPWindowMgr.TYPE_ATTACK_PLANNER);
            if (wnd) {
                wnd.setTarget(targetId);
                if (callback) setTimeout(callback, 500);
                return true;
            }
            
            // Créer une nouvelle fenêtre
            uw.GPWindowMgr.Create(uw.GPWindowMgr.TYPE_ATTACK_PLANNER, '', {target: targetId});
            if (callback) setTimeout(callback, 500);
            return true;
        }
        
        log('CALAGE', 'Impossible d\'ouvrir le planificateur', 'error');
        return false;
    } catch (e) {
        log('CALAGE', 'Erreur ouverture planificateur: ' + e.message, 'error');
        return false;
    }
}

// NOUVELLE FONCTION: Récupérer les héros disponibles
function getAvailableHeroes(townId) {
    try {
        const heroes = [];
        const town = uw.ITowns.getTown(townId || uw.Game.townId);
        
        if (!town) return heroes;
        
        // Méthode 1: Via le modèle de la ville
        if (town.getHeroes) {
            const townHeroes = town.getHeroes();
            if (townHeroes && townHeroes.models) {
                townHeroes.models.forEach(function(hero) {
                    if (hero && hero.attributes) {
                        const attr = hero.attributes;
                        // Vérifier que le héros est dans la ville et disponible
                        if (attr.home_town_id == townId && !attr.wounded && attr.level > 0) {
                            heroes.push({
                                id: attr.id,
                                name: attr.name,
                                level: attr.level,
                                type: attr.type || 'unknown'
                            });
                        }
                    }
                });
            }
        }
        
        // Méthode 2: Via MM.getModels (fallback)
        if (heroes.length === 0 && uw.MM && uw.MM.getModels) {
            const models = uw.MM.getModels();
            if (models.Hero) {
                for (const heroId in models.Hero) {
                    const hero = models.Hero[heroId];
                    if (hero && hero.attributes) {
                        const attr = hero.attributes;
                        if (attr.home_town_id == townId && !attr.wounded && attr.level > 0) {
                            heroes.push({
                                id: attr.id,
                                name: attr.name,
                                level: attr.level,
                                type: attr.type || 'unknown'
                            });
                        }
                    }
                }
            }
        }
        
        return heroes;
    } catch (e) {
        console.error('[CALAGE] Erreur récupération héros:', e);
        return [];
    }
}

// NOUVELLE FONCTION: Planifier une attaque via le planificateur natif
function planifierAttaqueNative(atk, callback) {
    try {
        log('CALAGE', 'Planification attaque native pour ' + atk.cibleId, 'info');
        
        // Ouvrir le planificateur
        if (!ouvrirPlanificateurAttaque(atk.cibleId)) {
            if (callback) callback(new Error('Impossible d\'ouvrir le planificateur'));
            return;
        }
        
        // Attendre que le planificateur soit chargé
        setTimeout(function() {
            try {
                const planner = getPlannerWindow();
                if (!planner) {
                    if (callback) callback(new Error('Planificateur non trouvé'));
                    return;
                }
                
                // Sélectionner les unités
                for (const unitId in atk.unites) {
                    if (atk.unites[unitId] > 0) {
                        setUnitCount(planner, unitId, atk.unites[unitId]);
                    }
                }
                
                // Sélectionner le héros si présent
                if (atk.heroId) {
                    setHero(planner, atk.heroId);
                }
                
                // Définir l'heure d'arrivée
                const arrivalTime = getTimeInMs(atk.heureArrivee);
                setArrivalTime(planner, arrivalTime);
                
                // Définir le type d'attaque
                setAttackType(planner, atk.type);
                
                if (callback) callback(null, planner);
                
            } catch (e) {
                if (callback) callback(e);
            }
        }, 800);
        
    } catch (e) {
        log('CALAGE', 'Erreur planification: ' + e.message, 'error');
        if (callback) callback(e);
    }
}

function getPlannerWindow() {
    try {
        if (uw.GPWindowMgr) {
            return uw.GPWindowMgr.getOpenFirst(uw.GPWindowMgr.TYPE_ATTACK_PLANNER);
        }
        return null;
    } catch (e) {
        return null;
    }
}

function setUnitCount(planner, unitId, count) {
    try {
        if (planner && planner.getController) {
            const ctrl = planner.getController();
            if (ctrl && ctrl.setUnitCount) {
                ctrl.setUnitCount(unitId, count);
                return true;
            }
        }
        
        // Fallback: manipulation directe du DOM
        const input = document.querySelector('#attack_planner input[name="' + unitId + '"]');
        if (input) {
            input.value = count;
            const event = new Event('change', { bubbles: true });
            input.dispatchEvent(event);
            return true;
        }
        
        return false;
    } catch (e) {
        console.error('[CALAGE] Erreur setUnitCount:', e);
        return false;
    }
}

function setHero(planner, heroId) {
    try {
        if (planner && planner.getController) {
            const ctrl = planner.getController();
            if (ctrl && ctrl.setHero) {
                ctrl.setHero(heroId);
                return true;
            }
        }
        
        // Fallback: manipulation directe du DOM
        const heroSelect = document.querySelector('#attack_planner select[name="hero"]');
        if (heroSelect) {
            heroSelect.value = heroId;
            const event = new Event('change', { bubbles: true });
            heroSelect.dispatchEvent(event);
            return true;
        }
        
        return false;
    } catch (e) {
        console.error('[CALAGE] Erreur setHero:', e);
        return false;
    }
}

function setArrivalTime(planner, arrivalTimeMs) {
    try {
        const arrivalDate = new Date(arrivalTimeMs);
        
        if (planner && planner.getController) {
            const ctrl = planner.getController();
            if (ctrl && ctrl.setArrivalTime) {
                ctrl.setArrivalTime(arrivalDate);
                return true;
            }
        }
        
        // Fallback: manipulation directe des champs de temps
        const hourInput = document.querySelector('#attack_planner input[name="hour"]');
        const minuteInput = document.querySelector('#attack_planner input[name="minute"]');
        const secondInput = document.querySelector('#attack_planner input[name="second"]');
        
        if (hourInput && minuteInput && secondInput) {
            hourInput.value = arrivalDate.getHours().toString().padStart(2, '0');
            minuteInput.value = arrivalDate.getMinutes().toString().padStart(2, '0');
            secondInput.value = arrivalDate.getSeconds().toString().padStart(2, '0');
            
            [hourInput, minuteInput, secondInput].forEach(function(input) {
                const event = new Event('change', { bubbles: true });
                input.dispatchEvent(event);
            });
            
            return true;
        }
        
        return false;
    } catch (e) {
        console.error('[CALAGE] Erreur setArrivalTime:', e);
        return false;
    }
}

function setAttackType(planner, attackType) {
    try {
        if (planner && planner.getController) {
            const ctrl = planner.getController();
            if (ctrl && ctrl.setAttackType) {
                ctrl.setAttackType(attackType);
                return true;
            }
        }
        
        // Fallback: clic sur le bon bouton
        const typeButton = document.querySelector('#attack_planner .attack_type[data-type="' + attackType + '"]');
        if (typeButton) {
            typeButton.click();
            return true;
        }
        
        return false;
    } catch (e) {
        console.error('[CALAGE] Erreur setAttackType:', e);
        return false;
    }
}

// NOUVELLE FONCTION: Envoyer l'attaque via le planificateur
function envoyerDepuisPlanificateur(planner, callback) {
    try {
        if (planner && planner.getController) {
            const ctrl = planner.getController();
            if (ctrl && ctrl.sendAttack) {
                ctrl.sendAttack();
                if (callback) setTimeout(function() { callback(null); }, 100);
                return true;
            }
        }
        
        // Fallback: clic sur le bouton d'envoi
        const sendButton = document.querySelector('#attack_planner .button_send');
        if (sendButton) {
            sendButton.click();
            if (callback) setTimeout(function() { callback(null); }, 100);
            return true;
        }
        
        if (callback) callback(new Error('Bouton d\'envoi non trouvé'));
        return false;
    } catch (e) {
        if (callback) callback(e);
        return false;
    }
}

function getCurrentCityId() { try { return uw.ITowns.getCurrentTown().id; } catch(e) { return null; } }

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

function getTownName(townId) {
    try {
        const town = uw.ITowns.getTown(townId);
        return town ? town.getName() : townId;
    } catch(e) {
        return townId;
    }
}

function lancerAttaque(atk) {
    log('CALAGE', 'Preparation attaque...', 'info');
    calageData.attaqueEnCours = atk;
    atk.status = 'encours';
    atk.tentatives = atk.tentatives || 0;
    
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
    
    console.log('[CALAGE] [ATTAQUE] === LANCEMENT ATTAQUE VIA PLANIFICATEUR ===');
    console.log('[CALAGE] [ATTAQUE] Source:', atk.sourceId, '-> Cible:', atk.cibleId);
    console.log('[CALAGE] [ATTAQUE] Type:', atk.type);
    console.log('[CALAGE] [ATTAQUE] Unites:', JSON.stringify(atk.unites));
    console.log('[CALAGE] [ATTAQUE] Héros:', atk.heroId || 'Aucun');
    console.log('[CALAGE] [ATTAQUE] Heure arrivée:', atk.heureArrivee);

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
            envoyerAttaqueViaPlanificateur(atk);
        }, 1500);
        return;
    }

    console.log('[CALAGE] [ATTAQUE] Ville source deja active, envoi direct');
    envoyerAttaqueViaPlanificateur(atk);
}

function envoyerAttaqueViaPlanificateur(atk) {
    if (!doitContinuerAttaque(atk)) {
        log('CALAGE', 'Attaque annulee (plan arrete ou attaque terminee)', 'warning');
        return;
    }

    atk.tentatives++;
    console.log('[CALAGE] [ENVOI] Tentative #' + atk.tentatives);
    majStatus('Tentative #' + atk.tentatives + '...');

    // Vérifier le nombre maximum de tentatives
    if (atk.tentatives > MAX_TENTATIVES) {
        const raison = 'Nombre maximum de tentatives atteint (' + MAX_TENTATIVES + ')';
        log('CALAGE', raison, 'error');
        marquerAttaqueEchec(atk, raison);
        return;
    }

    // Planifier l'attaque via le planificateur natif
    planifierAttaqueNative(atk, function(err, planner) {
        if (err) {
            log('CALAGE', 'Erreur planification: ' + err.message, 'error');
            setTimeout(function() {
                if (doitContinuerAttaque(atk)) {
                    envoyerAttaqueViaPlanificateur(atk);
                }
            }, 1000);
            return;
        }

        // Envoyer l'attaque
        envoyerDepuisPlanificateur(planner, function(err) {
            if (err) {
                log('CALAGE', 'Erreur envoi: ' + err.message, 'error');
                setTimeout(function() {
                    if (doitContinuerAttaque(atk)) {
                        envoyerAttaqueViaPlanificateur(atk);
                    }
                }, 1000);
                return;
            }

            // Vérifier le résultat
            setTimeout(function() {
                verifierResultatEnvoi(atk);
            }, 500);
        });
    });
}

function verifierResultatEnvoi(atk) {
    if (!doitContinuerAttaque(atk)) {
        log('CALAGE', 'Attaque annulee pendant verification', 'warning');
        return;
    }

    try {
        // Récupérer la dernière commande envoyée
        const lastCommand = getDerniereCommande(atk.sourceId);
        
        if (!lastCommand) {
            log('CALAGE', 'Aucune commande trouvée, retry...', 'warning');
            setTimeout(function() {
                if (doitContinuerAttaque(atk)) {
                    envoyerAttaqueViaPlanificateur(atk);
                }
            }, 500);
            return;
        }

        const arrivalAt = lastCommand.arrival_at;
        const commandId = lastCommand.id;

        log('CALAGE', 'Commande trouvée: ' + commandId + ' arrivee=' + formatTime(arrivalAt * 1000), 'info');

        const calageMs = getTimeInMs(atk.heureArrivee);
        const arrivalMs = arrivalAt * 1000;
        const diff = arrivalMs - calageMs;

        const toleranceMin = atk.toleranceMoins ? -1000 : 0;
        const toleranceMax = atk.tolerancePlus ? 1000 : 0;

        const diffSec = Math.round(diff / 1000);
        const signe = diffSec > 0 ? '+' : '';

        log('CALAGE', 'Cible: ' + atk.heureArrivee + ' | Arrivee: ' + formatTime(arrivalMs) + ' | Diff: ' + signe + diffSec + 's', 'info');

        if (diff >= toleranceMin && diff <= toleranceMax) {
            // SUCCÈS !
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
                'Attaque envoyée',
                getTownName(atk.sourceId) + ' -> ' + atk.cibleId + ' | Arrivée: ' + formatTime(arrivalMs),
                'attack'
            );

            sendWebhook(
                'Attaque envoyée avec succès',
                '**Source:** ' + getTownName(atk.sourceId) + '\n' +
                '**Cible:** ' + atk.cibleId + '\n' +
                '**Arrivée:** ' + formatTime(arrivalMs) + '\n' +
                '**Tentatives:** ' + atk.tentatives
            );

        } else if (Math.abs(diff) > LIMITE_HORS_TOLERANCE) {
            // Trop hors tolérance, on annule et on réessaye
            log('CALAGE', 'Hors tolerance (' + signe + diffSec + 's), annulation...', 'warning');
            majStatus('Calage ' + signe + diffSec + 's - Retry...');

            annulerCommande(commandId).then(function() {
                if (!doitContinuerAttaque(atk)) {
                    log('CALAGE', 'Attaque annulee apres annulation commande', 'warning');
                    return;
                }
                
                log('CALAGE', 'Commande annulee, nouvelle tentative...', 'info');
                
                if (atk._planIndex !== undefined && atk._atkIndex !== undefined) {
                    const planAtk = calageData.plans[atk._planIndex]?.attaques[atk._atkIndex];
                    if (planAtk) {
                        planAtk.tentatives = atk.tentatives;
                    }
                }
                
                saveData();
                if (planEnEdition !== null) majAttaquesPlan();

                majStatus('Attente... (#' + atk.tentatives + ')');

                setTimeout(function() {
                    if (!doitContinuerAttaque(atk)) {
                        log('CALAGE', 'Attaque annulee pendant attente', 'warning');
                        return;
                    }
                    
                    log('CALAGE', 'Renvoi apres ' + DELAI_APRES_ANNULATION + 'ms', 'info');
                    envoyerAttaqueViaPlanificateur(atk);
                }, DELAI_APRES_ANNULATION);

            }).catch(function(err) {
                const errMsg = err && err.message ? err.message : String(err);
                log('CALAGE', 'Erreur annulation: ' + errMsg, 'error');
                marquerAttaqueEchec(atk, 'Erreur annulation: ' + errMsg);
            });

        } else {
            // Dans la tolérance étendue, on garde
            log('CALAGE', 'SUCCES (tolérance étendue)! Arrivee: ' + formatTime(arrivalMs), 'success');
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
        }

    } catch (e) {
        log('CALAGE', 'Erreur verification: ' + e.message, 'error');
        marquerAttaqueEchec(atk, 'Erreur verification: ' + e.message);
    }
}

function getDerniereCommande(townId) {
    try {
        if (uw.MM && uw.MM.getOnlyCollectionByName) {
            const commands = uw.MM.getOnlyCollectionByName('Command');
            if (commands && commands.models && commands.models.length > 0) {
                // Trouver la commande la plus récente de cette ville
                let derniere = null;
                let dernierTime = 0;
                
                commands.models.forEach(function(cmd) {
                    if (cmd && cmd.attributes) {
                        const attr = cmd.attributes;
                        if (attr.home_town_id == townId && attr.arrival_at > dernierTime) {
                            derniere = attr;
                            dernierTime = attr.arrival_at;
                        }
                    }
                });
                
                return derniere;
            }
        }
        return null;
    } catch (e) {
        console.error('[CALAGE] Erreur getDerniereCommande:', e);
        return null;
    }
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

    // NOUVEAU: Annuler les commandes en cours si l'option est activée
    if (calageData.settings.annulerSiEchec) {
        annulerCommandesEnCours(atk.sourceId);
    }
}

// NOUVELLE FONCTION: Annuler toutes les commandes en cours de la ville
function annulerCommandesEnCours(townId) {
    try {
        log('CALAGE', 'Annulation des commandes en cours pour ville ' + townId, 'warning');
        
        if (uw.MM && uw.MM.getOnlyCollectionByName) {
            const commands = uw.MM.getOnlyCollectionByName('Command');
            if (commands && commands.models) {
                commands.models.forEach(function(cmd) {
                    if (cmd && cmd.attributes) {
                        const attr = cmd.attributes;
                        // Annuler seulement les commandes de cette ville qui ne sont pas encore arrivées
                        if (attr.home_town_id == townId && attr.arrival_at * 1000 > Date.now()) {
                            log('CALAGE', 'Annulation commande: ' + attr.id, 'info');
                            annulerCommande(attr.id).catch(function(err) {
                                console.error('[CALAGE] Erreur annulation commande ' + attr.id + ':', err);
                            });
                        }
                    }
                });
            }
        }
    } catch (e) {
        console.error('[CALAGE] Erreur annulerCommandesEnCours:', e);
    }
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

function afficherNotification(titre, message, type) {
    // ... (à implémenter selon votre système de notifications existant)
}

function majStatus(status) {
    // ... (à implémenter selon votre interface existante)
}

function majAttaquesPlan() {
    // ... (à implémenter selon votre interface existante)
}

function majListePlans() {
    // ... (à implémenter selon votre interface existante)
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
            calageData.settings = d.settings || { webhook: '', annulerSiEchec: true };
        } catch(e) {}
    }
}

module.render = function(container) {
    loadData();
    // ... reste du code d'interface
};
