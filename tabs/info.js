const uw = module.uw;
const log = module.log;
const GM_getValue = module.GM_getValue;
const GM_setValue = module.GM_setValue;

const VERSION = '2.2.0';
const CHANGELOG = [
    {
        version: '2.2.0',
        date: '2025-01-30',
        changes: [
            'Ajout de l\'onglet Information',
            'Ajout de l\'onglet Commerce',
            'UI maintenant deplacable (drag & drop)',
            'Prechargement de tous les modules au demarrage',
            'Bot Naval: Affichage couleur des unites (ville/dehors/file)',
            'Bot Recruit: Affichage couleur des unites (ville/dehors/file)',
            'Bot Calage: Bouton contextuel Start/Stop par plan',
            'Bot Calage: Calcul et affichage temps de trajet',
            'Bot Calage: Bouton "Calculer tous" les temps'
        ]
    },
    {
        version: '2.1.0',
        date: '2025-01-28',
        changes: [
            'Bot Naval: Detection amelioree du port',
            'Bot Naval: Intervalles 10s et 30s ajoutes',
            'Bot Naval: Detection file de construction',
            'Bot Recruit: Memes ameliorations que Naval',
            'Bot Calage: Plans individuels avec Start/Stop',
            'Bot Calage: Suppression validation bateaux transport'
        ]
    },
    {
        version: '2.0.0',
        date: '2025-01-25',
        changes: [
            'Refonte complete de l\'interface',
            'Nouveau systeme de modules',
            'Ajout du bot Naval',
            'Ajout du bot Calage',
            'Amelioration du systeme de logs'
        ]
    }
];

const FEATURES = [
    { icon: '🌾', name: 'Farm Bot', desc: 'Pillage automatique des villages de fermiers' },
    { icon: '🏗️', name: 'Build Bot', desc: 'Construction automatique des batiments' },
    { icon: '⚔️', name: 'Recruit Bot', desc: 'Recrutement automatique des troupes terrestres' },
    { icon: '⚓', name: 'Naval Bot', desc: 'Construction automatique de la flotte' },
    { icon: '⏱️', name: 'Calage Bot', desc: 'Planification et envoi d\'attaques calees' },
    { icon: '🏪', name: 'Commerce', desc: 'Gestion du commerce entre villes (bientot)' },
    { icon: '🛡️', name: 'Dodge Bot', desc: 'Esquive automatique des attaques (bientot)' }
];

module.render = function(container) {
    const changelogHtml = CHANGELOG.map(release => `
        <div class="info-release">
            <div class="info-release-header">
                <span class="info-release-version">V${release.version}</span>
                <span class="info-release-date">${release.date}</span>
            </div>
            <ul class="info-release-changes">
                ${release.changes.map(c => `<li>${c}</li>`).join('')}
            </ul>
        </div>
    `).join('');

    const featuresHtml = FEATURES.map(f => `
        <div class="info-feature">
            <div class="info-feature-icon">${f.icon}</div>
            <div class="info-feature-content">
                <div class="info-feature-name">${f.name}</div>
                <div class="info-feature-desc">${f.desc}</div>
            </div>
        </div>
    `).join('');

    container.innerHTML = `
        <style>
            .info-header {
                text-align: center;
                padding: 20px;
                background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 100%);
                border-radius: 10px;
                margin-bottom: 20px;
            }
            .info-title {
                font-family: 'Cinzel', serif;
                font-size: 28px;
                color: #D4AF37;
                margin-bottom: 5px;
                text-shadow: 0 2px 10px rgba(212,175,55,0.3);
            }
            .info-subtitle {
                font-size: 14px;
                color: #BDB76B;
            }
            .info-version-badge {
                display: inline-block;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                font-size: 12px;
                margin-top: 10px;
            }
            .info-section {
                background: rgba(0,0,0,0.25);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 10px;
                margin-bottom: 15px;
                overflow: hidden;
            }
            .info-section-header {
                background: linear-gradient(180deg, rgba(93,78,55,0.8) 0%, rgba(61,50,37,0.8) 100%);
                padding: 12px 15px;
                font-family: 'Cinzel', serif;
                font-size: 14px;
                color: #F5DEB3;
                border-bottom: 1px solid rgba(212,175,55,0.2);
            }
            .info-section-content {
                padding: 15px;
            }
            .info-release {
                background: rgba(0,0,0,0.2);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 10px;
            }
            .info-release:last-child {
                margin-bottom: 0;
            }
            .info-release-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .info-release-version {
                font-family: 'Cinzel', serif;
                font-size: 14px;
                font-weight: bold;
                color: #D4AF37;
            }
            .info-release-date {
                font-size: 11px;
                color: #8B8B83;
            }
            .info-release-changes {
                margin: 0;
                padding-left: 20px;
                font-size: 12px;
                color: #BDB76B;
            }
            .info-release-changes li {
                margin-bottom: 4px;
            }
            .info-features-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }
            .info-feature {
                display: flex;
                align-items: center;
                gap: 12px;
                background: rgba(0,0,0,0.2);
                border-radius: 8px;
                padding: 12px;
            }
            .info-feature-icon {
                font-size: 24px;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(212,175,55,0.1);
                border-radius: 8px;
            }
            .info-feature-name {
                font-family: 'Cinzel', serif;
                font-size: 13px;
                color: #F5DEB3;
                font-weight: bold;
            }
            .info-feature-desc {
                font-size: 11px;
                color: #8B8B83;
                margin-top: 2px;
            }
            .info-discord {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                background: linear-gradient(135deg, #5865F2 0%, #4752C4 100%);
                color: white;
                padding: 15px;
                border-radius: 8px;
                text-decoration: none;
                font-family: 'Cinzel', serif;
                font-size: 14px;
                transition: all 0.2s;
            }
            .info-discord:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 20px rgba(88,101,242,0.4);
            }
            .info-tips {
                font-size: 12px;
                color: #BDB76B;
                line-height: 1.6;
            }
            .info-tips li {
                margin-bottom: 8px;
            }
            .info-tips strong {
                color: #D4AF37;
            }
        </style>

        <div class="info-header">
            <div class="info-title">Ultimate Bot</div>
            <div class="info-subtitle">Le bot ultime pour Grepolis</div>
            <div class="info-version-badge">Version ${VERSION}</div>
        </div>

        <div class="info-section">
            <div class="info-section-header">🎯 Fonctionnalites</div>
            <div class="info-section-content">
                <div class="info-features-grid">
                    ${featuresHtml}
                </div>
            </div>
        </div>

        <div class="info-section">
            <div class="info-section-header">📋 Changelog</div>
            <div class="info-section-content" style="max-height: 250px; overflow-y: auto;">
                ${changelogHtml}
            </div>
        </div>

        <div class="info-section">
            <div class="info-section-header">💡 Conseils</div>
            <div class="info-section-content">
                <ul class="info-tips">
                    <li><strong>Drag & Drop:</strong> Deplacez le panel en maintenant le header</li>
                    <li><strong>Couleurs unites:</strong> <span style="color:#4CAF50;">Vert</span> = en ville, <span style="color:#FF9800;">Orange</span> = dehors, <span style="color:#64B5F6;">Bleu</span> = en file</li>
                    <li><strong>Calage:</strong> Utilisez "Calculer tous" pour pre-calculer les temps de trajet</li>
                    <li><strong>Sauvegarde:</strong> Vos parametres sont sauvegardes automatiquement</li>
                </ul>
            </div>
        </div>

        <div class="info-section">
            <div class="info-section-header">🔗 Liens</div>
            <div class="info-section-content">
                <a href="https://discord.gg/54xUGVpxeb" target="_blank" class="info-discord">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    Rejoindre le Discord
                </a>
            </div>
        </div>
    `;
};

module.init = function() {
    log('INFO', 'Module Information charge', 'info');
};

module.isActive = function() {
    return false;
};

module.onActivate = function(container) {
};
