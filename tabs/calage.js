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
    settings: { webhook: '' }
};

const UNIT_TYPES = [
    { id: 'sword', name: 'Epee' },
    { id: 'slinger', name: 'Frond' },
    { id: 'archer', name: 'Archer' },
    { id: 'hoplite', name: 'Hopli' },
    { id: 'rider', name: 'Caval' },
    { id: 'chariot', name: 'Char' },
    { id: 'catapult', name: 'Cata' },
    { id: 'minotaur', name: 'Mino' },
    { id: 'manticore', name: 'Manti' },
    { id: 'centaur', name: 'Cent' },
    { id: 'pegasus', name: 'Pega' },
    { id: 'harpy', name: 'Harpie' },
    { id: 'medusa', name: 'Meduse' },
    { id: 'zyklop', name: 'Cyclo' },
    { id: 'cerberus', name: 'Cerb' },
    { id: 'fury', name: 'Furie' },
    { id: 'griffin', name: 'Griff' },
    { id: 'calydonian_boar', name: 'Sangl' },
    { id: 'godsent', name: 'Envoye' },
    { id: 'big_transporter', name: 'GTrans' },
    { id: 'bireme', name: 'Bireme' },
    { id: 'attack_ship', name: 'Brulot' },
    { id: 'demolition_ship', name: 'Demo' },
    { id: 'small_transporter', name: 'PTrans' },
    { id: 'trireme', name: 'Trirem' },
    { id: 'colonize_ship', name: 'Colon' },
    { id: 'sea_monster', name: 'Hydre' }
];

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
                <div style="margin-top: 15px;">
                    <span class="option-label">Unites a envoyer</span>
                    <div class="calage-units-grid" id="calage-units-grid"></div>
                </div>
                <button class="btn btn-full" id="calage-btn-ajouter" style="margin-top: 15px;">+ Ajouter Attaque</button>
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
                gap: 8px;
                margin-top: 10px;
            }
            .calage-unit-input {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .calage-unit-input label {
                font-size: 9px;
                color: #BDB76B;
                margin-bottom: 3px;
                text-align: center;
            }
            .calage-unit-input input {
                width: 50px;
                padding: 4px;
                text-align: center;
                border: 1px solid #8B6914;
                border-radius: 4px;
                background: #2D2419;
                color: #F5DEB3;
                font-size: 11px;
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

    document.getElementById('toggle-calage').onchange = (e) => toggleBot(e.target.checked);
    document.getElementById('calage-btn-ajouter').onclick = ajouterAttaque;
    document.getElementById('calage-btn-clear').onclick = supprimerToutesAttaques;
    document.getElementById('calage-ville-source').onchange = majUnitsGrid;

    document.querySelectorAll('#tab-calage .section-header').forEach(h => {
        h.onclick = () => {
            h.classList.toggle('collapsed');
            const c = h.nextElementSibling;
            if (c) c.style.display = h.classList.contains('collapsed') ? 'none' : 'block';
        };
    });

    uw.$.Observer(uw.GameEvents.town.town_switch).subscribe('gu_calage', function() {
        majUnitsGrid();
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
    const grid = document.getElementById('calage-units-grid');
    if (!grid) return;
    
    const sourceId = parseInt(document.getElementById('calage-ville-source')?.value) || uw.Game.townId;
    const unites = getUnitesDispo(sourceId);

    grid.innerHTML = '';

    UNIT_TYPES.forEach(function(unit) {
        const dispo = unites[unit.id] || 0;
        const div = document.createElement('div');
        div.className = 'calage-unit-input';
        div.innerHTML = '<label>' + unit.name + ' (' + dispo + ')</label>' +
            '<input type="number" id="unit-' + unit.id + '" min="0" max="' + dispo + '" value="0" data-unit="' + unit.id + '">';
        grid.appendChild(div);
    });
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
                <div class="nom">${atk.sourceId} → ${atk.cibleId}</div>
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

    const unites = {};
    const inputs = document.querySelectorAll('#calage-units-grid input');
    let totalUnites = 0;

    inputs.forEach(function(input) {
        const unitId = input.getAttribute('data-unit');
        const count = parseInt(input.value) || 0;
        if (count > 0) {
            unites[unitId] = count;
            totalUnites += count;
        }
    });

    if (totalUnites === 0) {
        log('CALAGE', 'Selectionner au moins une unite!', 'error');
        return;
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

    inputs.forEach(function(input) {
        input.value = 0;
    });

    log('CALAGE', 'Attaque ajoutee: ' + sourceId + ' → ' + cibleId + ' @ ' + heureArrivee, 'success');
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

    log('CALAGE', 'Lancement manuel: ' + atk.sourceId + ' → ' + atk.cibleId, 'info');
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
        log('CALAGE', 'Changement ville: ' + uw.Game.townId + ' → ' + atk.sourceId, 'info');
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
                `**${atk.sourceId} → ${atk.cibleId}**\nArrivee: ${formatTime(arrivalMs)}\nTentatives: ${atk.tentatives}`);
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
            calageData.settings = d.settings || { webhook: '' };
        } catch(e) {}
    }
}
