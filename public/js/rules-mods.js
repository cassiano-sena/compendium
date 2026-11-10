/* =========================================================================
   FASE 0: MOTOR DE REGRAS CONFIGURÁVEL & SISTEMA DE MODS (CompendioModAPI)
   Permite alternar entre edições (D&D 2024, D&D 2014, Modo Fatal, 3.5e/OSR)
   ou carregar Mods customizados (.json / .js) sem engessar o código-fonte.
   ========================================================================= */

const STORAGE_KEY_RULES = 'compendio_rpg_rules_v1';
const STORAGE_KEY_MODS = 'compendio_rpg_mods_v1';

const RULESET_PRESETS = {
    dnd2024: {
        presetId: 'dnd2024',
        presetName: 'D&D 2024 (5.5e Oficial)',
        critRule: 'double-dice', // 'double-dice' | 'max-plus-roll' | 'double-total'
        exhaustionMode: '2024-penalty', // '2024-penalty' | '2014-classic' | 'disabled'
        exhaustionPenaltyPerLevel: -2,
        exhaustionMaxLevel: 6,
        longRestHpPercent: 100,
        longRestHitDicePercent: 100,
        shortRestAllowHitDice: true,
        gridMetersPerSquare: 1.5,
        gridFeetPerSquare: 5,
        diagonalRule: 'equidistant', // 'equidistant' (1-1-1) | 'alternating' (1-2-1 / 5-10-5) | 'euclidean'
        initiativeTieBreaker: 'dex',
        baseConditions: [
            'Agarrado', 'Amedrontado', 'Atordoado', 'Caído', 'Cego',
            'Enfeitiçado', 'Envenenado', 'Impedido', 'Incapacitado',
            'Inconsciente', 'Invisível', 'Paralisado', 'Petrificado',
            'Surdo', 'Concentração', ' Sangrando'
        ],
        extraConditions: []
    },
    dnd2014: {
        presetId: 'dnd2014',
        presetName: 'D&D 2014 (5e Clássico)',
        critRule: 'double-dice',
        exhaustionMode: '2014-classic',
        exhaustionPenaltyPerLevel: 0,
        exhaustionMaxLevel: 6,
        longRestHpPercent: 100,
        longRestHitDicePercent: 50,
        shortRestAllowHitDice: true,
        gridMetersPerSquare: 1.5,
        gridFeetPerSquare: 5,
        diagonalRule: 'equidistant',
        initiativeTieBreaker: 'dex',
        baseConditions: [
            'Agarrado', 'Amedrontado', 'Atordoado', 'Caído', 'Cego',
            'Enfeitiçado', 'Envenenado', 'Impedido', 'Incapacitado',
            'Inconsciente', 'Invisível', 'Paralisado', 'Petrificado',
            'Surdo', 'Concentração'
        ],
        extraConditions: []
    },
    fatal55e: {
        presetId: 'fatal55e',
        presetName: '🩸 Modo Fatal 5.5e (Baróvia / Osybus)',
        critRule: 'max-plus-roll',
        exhaustionMode: '2024-penalty',
        exhaustionPenaltyPerLevel: -2,
        exhaustionMaxLevel: 6,
        longRestHpPercent: 100,
        longRestHitDicePercent: 50,
        shortRestAllowHitDice: true,
        gridMetersPerSquare: 1.5,
        gridFeetPerSquare: 5,
        diagonalRule: 'alternating',
        initiativeTieBreaker: 'dex',
        baseConditions: [
            'Agarrado', 'Amedrontado', 'Atordoado', 'Caído', 'Cego',
            'Enfeitiçado', 'Envenenado', 'Impedido', 'Incapacitado',
            'Inconsciente', 'Invisível', 'Paralisado', 'Petrificado',
            'Surdo', 'Concentração'
        ],
        extraConditions: [
            'Sangrando', 'Marca de Osybus', 'Assombrado (Brumas)', 'Frenesi Elite'
        ]
    },
    osr35e: {
        presetId: 'osr35e',
        presetName: '⚔️ Old-School / 3.5e / Tático Clássico',
        critRule: 'double-total',
        exhaustionMode: '2024-penalty',
        exhaustionPenaltyPerLevel: -1,
        exhaustionMaxLevel: 10,
        longRestHpPercent: 25,
        longRestHitDicePercent: 50,
        shortRestAllowHitDice: true,
        gridMetersPerSquare: 1.5,
        gridFeetPerSquare: 5,
        diagonalRule: 'alternating',
        initiativeTieBreaker: 'dex',
        baseConditions: [
            'Agarrado', 'Abalado', 'Atordoado', 'Caído', 'Cego',
            'Enjoado', 'Enredado', 'Exausto', 'Fatigado', 'Inconsciente',
            'Paralisado', 'Surdo', 'Concentração'
        ],
        extraConditions: ['Ferimento Grave', 'Flanqueado']
    }
};

window.activeRulesConfig = Object.assign({}, RULESET_PRESETS.dnd2024);
window.installedMods = [];

const CompendioRules = {
    init() {
        try {
            const savedR = localStorage.getItem(STORAGE_KEY_RULES);
            if (savedR) {
                const parsed = JSON.parse(savedR);
                if (parsed && typeof parsed === 'object') {
                    window.activeRulesConfig = Object.assign({}, RULESET_PRESETS.dnd2024, parsed);
                }
            }
            const savedM = localStorage.getItem(STORAGE_KEY_MODS);
            if (savedM) {
                const parsedM = JSON.parse(savedM);
                if (Array.isArray(parsedM)) {
                    window.installedMods = parsedM;
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar regras/mods locais:', e);
        }
        this.discoverServerMods();
        this.updateRulesSidebarBadge();
    },

    save() {
        try {
            localStorage.setItem(STORAGE_KEY_RULES, JSON.stringify(window.activeRulesConfig));
            localStorage.setItem(STORAGE_KEY_MODS, JSON.stringify(window.installedMods));
        } catch (e) {}
        this.updateRulesSidebarBadge();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastRules) {
            CompendioNetAdapter.broadcastRules();
        }
    },

    getEffectiveRules() {
        const eff = JSON.parse(JSON.stringify(window.activeRulesConfig || RULESET_PRESETS.dnd2024));
        if (!Array.isArray(eff.extraConditions)) eff.extraConditions = [];
        for (const mod of window.installedMods) {
            if (!mod || !mod.enabled || !mod.rulesPatch) continue;
            const p = mod.rulesPatch;
            for (const [k, v] of Object.entries(p)) {
                if (k === 'extraConditions' && Array.isArray(v)) {
                    v.forEach(c => {
                        if (!eff.extraConditions.includes(c)) eff.extraConditions.push(c);
                    });
                } else if (v !== undefined) {
                    eff[k] = v;
                }
            }
        }
        return eff;
    },

    applyPreset(presetKey) {
        const preset = RULESET_PRESETS[presetKey];
        if (!preset) return;
        window.activeRulesConfig = JSON.parse(JSON.stringify(preset));
        this.save();
        this.refreshAllScreens();
        if (typeof showToast === 'function') {
            showToast(`⚙️ Sistema de Regras alterado para: ${preset.presetName}`);
        }
    },

    getExhaustionPenalty(level) {
        const lvl = Math.max(0, Number(level) || 0);
        if (lvl === 0) return 0;
        const r = this.getEffectiveRules();
        if (r.exhaustionMode === '2024-penalty') {
            return lvl * (Number(r.exhaustionPenaltyPerLevel) || -2);
        }
        return 0;
    },

    describeExhaustion(level) {
        const lvl = Math.max(0, Number(level) || 0);
        const r = this.getEffectiveRules();
        if (r.exhaustionMode === 'disabled') return 'Exaustão desativada nas regras atuais.';
        if (lvl === 0) return 'Sem penalidades de exaustão.';
        if (lvl >= (Number(r.exhaustionMaxLevel) || 6)) {
            return `💀 Nível Máximo (${lvl}): Morte iminente por exaustão!`;
        }
        if (r.exhaustionMode === '2024-penalty') {
            const pen = this.getExhaustionPenalty(lvl);
            const spdPen = lvl * 1.5;
            return `Nível ${lvl}/${r.exhaustionMaxLevel}: ${pen} em todas as rolagens de d20, CDs e Percepção Passiva (-${spdPen}m deslocamento).`;
        }
        const classicTable = {
            1: 'Nível 1: Desvantagem em testes de atributo.',
            2: 'Nível 2: Deslocamento reduzido à metade.',
            3: 'Nível 3: Desvantagem em jogadas de ataque e salvaguardas.',
            4: 'Nível 4: Pontos de Vida máximos reduzidos à metade.',
            5: 'Nível 5: Deslocamento reduzido a 0.'
        };
        return classicTable[lvl] || `Nível ${lvl} de Exaustão.`;
    },

    getAllConditions() {
        const r = this.getEffectiveRules();
        const combined = [...(r.baseConditions || []), ...(r.extraConditions || [])]
            .map(s => String(s || '').trim())
            .filter(Boolean);
        return [...new Set(combined)];
    },

    calculateGridDistance(dxSq, dySq) {
        const r = this.getEffectiveRules();
        const ax = Math.abs(dxSq);
        const ay = Math.abs(dySq);
        let squares = 0;

        if (r.diagonalRule === 'euclidean') {
            squares = Math.hypot(ax, ay);
        } else if (r.diagonalRule === 'alternating') {
            const diag = Math.min(ax, ay);
            const straight = Math.max(ax, ay) - diag;
            squares = straight + Math.floor(diag * 1.5);
        } else {
            // Equidistante (1-1-1)
            squares = Math.max(ax, ay);
        }

        const sqRounded = Math.round(squares * 10) / 10;
        const meters = Math.round(sqRounded * (Number(r.gridMetersPerSquare) || 1.5) * 10) / 10;
        const feet = Math.round(sqRounded * (Number(r.gridFeetPerSquare) || 5));
        return { squares: sqRounded, meters, feet };
    },

    getCreatureFootprintSquares(sizeCode) {
        const s = String(sizeCode || 'M').trim().toUpperCase();
        if (s.startsWith('G') || s === 'GARGANTUAN' || s === 'IMENSO') return 4;
        if (s.startsWith('H') || s === 'HUGE' || s === 'ENORME') return 3;
        if (s.startsWith('L') || s === 'LARGE' || s === 'GRANDE') return 2;
        return 1;
    },

    async discoverServerMods() {
        try {
            const res = await fetch('/api/mods', { cache: 'no-store' });
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !Array.isArray(data.mods)) return;
            let changed = false;
            for (const m of data.mods) {
                if (m.manifest && m.manifest.id) {
                    const exists = window.installedMods.find(x => x.id === m.manifest.id);
                    if (!exists) {
                        window.installedMods.push(Object.assign({
                            enabled: false,
                            sourcePath: m.path
                        }, m.manifest));
                        changed = true;
                    }
                }
            }
            if (changed) this.save();
        } catch (e) {}
    },

    updateRulesSidebarBadge() {
        const badgeEl = document.getElementById('active-ruleset-badge');
        if (!badgeEl) return;
        const r = this.getEffectiveRules();
        const activeModsCount = window.installedMods.filter(m => m && m.enabled).length;
        badgeEl.textContent = `${r.presetName || 'Regras Custom'}${activeModsCount > 0 ? ` (+${activeModsCount} Mod)` : ''}`;
    },

    refreshAllScreens() {
        this.updateRulesSidebarBadge();
        if (typeof renderCombatHand === 'function') renderCombatHand();
        if (typeof activeModule !== 'undefined') {
            if (activeModule === 'character' && typeof renderCharacterModule === 'function') renderCharacterModule();
            else if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
            else if (typeof currentCategory !== 'undefined' && currentCategory === 'hitdice' && typeof renderHitDiceScreen === 'function') renderHitDiceScreen();
        }
    }
};

/* =========================================================================
   API PÚBLICA PARA MODS E EXTENSÕES (window.CompendioModAPI)
   ========================================================================= */
window.CompendioModAPI = {
    hooks: {
        onBeforeDiceRoll: [],
        onAfterDiceRoll: [],
        onCalculateDerived: [],
        onShortRest: [],
        onLongRest: [],
        onApplyDamage: [],
        onTurnAdvance: []
    },

    registerHook(hookName, callback) {
        if (!this.hooks[hookName]) this.hooks[hookName] = [];
        if (typeof callback === 'function') {
            this.hooks[hookName].push(callback);
        }
    },

    runHooks(hookName, payload) {
        const list = this.hooks[hookName] || [];
        let current = payload;
        for (const fn of list) {
            try {
                const res = fn(current, CompendioRules.getEffectiveRules());
                if (res !== undefined) current = res;
            } catch (e) {
                console.warn(`Erro no hook ${hookName}:`, e);
            }
        }
        return current;
    },

    installMod(modObject, enableImmediately = true) {
        if (!modObject || typeof modObject !== 'object') {
            throw new Error('O Mod precisa ser um objeto JSON válido.');
        }
        const id = modObject.id || ('mod-' + Date.now().toString(36));
        const existingIdx = window.installedMods.findIndex(m => m.id === id);
        const normalized = Object.assign({
            id,
            name: modObject.name || id,
            version: modObject.version || '1.0.0',
            author: modObject.author || 'Comunidade',
            description: modObject.description || '',
            enabled: enableImmediately,
            rulesPatch: modObject.rulesPatch || {},
            customResources: modObject.customResources || [],
            scriptCode: modObject.scriptCode || ''
        }, modObject);

        if (existingIdx >= 0) {
            window.installedMods[existingIdx] = normalized;
        } else {
            window.installedMods.push(normalized);
        }

        if (normalized.enabled && normalized.scriptCode) {
            this.executeModScript(normalized);
        }

        CompendioRules.save();
        CompendioRules.refreshAllScreens();
        return normalized;
    },

    executeModScript(mod) {
        if (!mod || !mod.scriptCode) return;
        try {
            const fn = new Function('CompendioModAPI', 'CompendioRules', mod.scriptCode);
            fn(window.CompendioModAPI, CompendioRules);
        } catch (err) {
            console.warn(`Erro ao executar script do Mod "${mod.name}":`, err);
        }
    },

    toggleMod(modId, enabled) {
        const mod = window.installedMods.find(m => m.id === modId);
        if (!mod) return;
        mod.enabled = Boolean(enabled);
        if (mod.enabled && mod.scriptCode) {
            this.executeModScript(mod);
        }
        // Se o mod possui customResources e foi ativado, adiciona aos personagens que ainda não têm
        if (mod.enabled && Array.isArray(mod.customResources) && typeof charactersData !== 'undefined') {
            charactersData.forEach(c => {
                if (!Array.isArray(c.customResources)) c.customResources = [];
                mod.customResources.forEach(cr => {
                    if (!c.customResources.some(x => x.name === cr.name)) {
                        c.customResources.push({
                            id: 'res-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
                            name: cr.name,
                            current: cr.max || 1,
                            max: cr.max || 1,
                            recharge: cr.recharge || 'long'
                        });
                    }
                });
            });
            if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
        }
        CompendioRules.save();
        CompendioRules.refreshAllScreens();
        renderRulesAndModsModalBody();
    },

    removeMod(modId) {
        window.installedMods = window.installedMods.filter(m => m.id !== modId);
        CompendioRules.save();
        CompendioRules.refreshAllScreens();
        renderRulesAndModsModalBody();
    }
};

/* =========================================================================
   INTERFACE DO MODAL "⚙️ REGRAS DA CAMPANHA & MODS"
   ========================================================================= */
let activeRulesModalTab = 'rules';

function openRulesAndModsModal(tab = 'rules') {
    activeRulesModalTab = tab;
    const backdrop = document.getElementById('rules-mods-backdrop');
    if (!backdrop) return;
    renderRulesAndModsModalBody();
    backdrop.classList.add('open');
}

function closeRulesAndModsModal() {
    const backdrop = document.getElementById('rules-mods-backdrop');
    if (backdrop) backdrop.classList.remove('open');
}

function switchRulesModalTab(tab) {
    activeRulesModalTab = tab;
    renderRulesAndModsModalBody();
}

function renderRulesAndModsModalBody() {
    const container = document.getElementById('rules-mods-modal-content');
    if (!container) return;

    const r = window.activeRulesConfig || RULESET_PRESETS.dnd2024;
    const eff = CompendioRules.getEffectiveRules();

    if (activeRulesModalTab === 'rules') {
        const presetCards = Object.values(RULESET_PRESETS).map(p => {
            const isAct = r.presetId === p.presetId ? 'active' : '';
            return `
                <div class="mode-card ${isAct}" onclick="CompendioRules.applyPreset('${p.presetId}'); renderRulesAndModsModalBody();">
                    ${p.presetName}
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="studio-header">
                <h2>⚙️ Motor de Regras & Mods da Campanha</h2>
                <button class="btn-close-modal" type="button" onclick="closeRulesAndModsModal()">✕</button>
            </div>
            <div class="studio-form-pane" style="border-right:none; max-height:78vh; overflow-y:auto;">
            <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
                <button type="button" class="btn-save-primary" onclick="switchRulesModalTab('rules')">⚙️ Sistema & Regras Base</button>
                <button type="button" class="btn-action-bar" onclick="switchRulesModalTab('mods')">🧩 Mods & Pacotes (${window.installedMods.filter(m => m.enabled).length}/${window.installedMods.length})</button>
                <button type="button" class="btn-action-bar" onclick="switchRulesModalTab('legal')">🛡️ Privacidade & Licenças</button>
            </div>

            <div class="form-section">
                <h3 class="form-section-title">1. Presets Rápidos de Edição / Sistema</h3>
                <div class="mode-selector" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                    ${presetCards}
                </div>
                <div style="font-size:11.5px; color:#a0a4b8;">
                    Selecione um preset acima para carregar os padrões da edição, ou personalize livremente cada regra abaixo para criar seu próprio sistema.
                </div>
            </div>

            <div class="form-section">
                <h3 class="form-section-title">2. Regras de Combate, Crítico e Exaustão</h3>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Nome do Sistema / Conjunto de Regras</label>
                        <input type="text" class="form-control" value="${escapeHtmlText(r.presetName || 'Customizado')}" onchange="updateSingleRuleField('presetName', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Regra de Acerto Crítico (20 Natural)</label>
                        <select class="form-control" onchange="updateSingleRuleField('critRule', this.value)">
                            <option value="double-dice" ${r.critRule === 'double-dice' ? 'selected' : ''}>🎲 Dobrar Dados (Padrão 5e / 2024)</option>
                            <option value="max-plus-roll" ${r.critRule === 'max-plus-roll' ? 'selected' : ''}>🩸 Brutal: Dano Máximo + Rolagem (Modo Fatal)</option>
                            <option value="double-total" ${r.critRule === 'double-total' ? 'selected' : ''}>⚔️ Multiplicar Total x2 (Old-School / 3.5e)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Modelo de Exaustão</label>
                        <select class="form-control" onchange="updateSingleRuleField('exhaustionMode', this.value)">
                            <option value="2024-penalty" ${r.exhaustionMode === '2024-penalty' ? 'selected' : ''}>📉 Penalidade Numérica por Nível (D&D 2024)</option>
                            <option value="2014-classic" ${r.exhaustionMode === '2014-classic' ? 'selected' : ''}>📜 6 Níveis Descritivos Clássicos (D&D 2014)</option>
                            <option value="disabled" ${r.exhaustionMode === 'disabled' ? 'selected' : ''}>🚫 Desativado</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Penalidade por Nível de Exaustão (em d20/CD)</label>
                        <input type="number" class="form-control" value="${Number(r.exhaustionPenaltyPerLevel) ?? -2}" max="0" min="-10" onchange="updateSingleRuleField('exhaustionPenaltyPerLevel', Number(this.value))">
                    </div>
                    <div class="form-group">
                        <label>Limite Máximo de Exaustão (Morte)</label>
                        <input type="number" class="form-control" value="${Number(r.exhaustionMaxLevel) || 6}" min="1" max="20" onchange="updateSingleRuleField('exhaustionMaxLevel', Number(this.value))">
                    </div>
                    <div class="form-group">
                        <label>Desempate de Iniciativa</label>
                        <select class="form-control" onchange="updateSingleRuleField('initiativeTieBreaker', this.value)">
                            <option value="dex" ${r.initiativeTieBreaker === 'dex' ? 'selected' : ''}>Maior Destreza (Padrão)</option>
                            <option value="players-first" ${r.initiativeTieBreaker === 'players-first' ? 'selected' : ''}>Jogadores Sempre Primeiro</option>
                            <option value="monsters-first" ${r.initiativeTieBreaker === 'monsters-first' ? 'selected' : ''}>Monstros Sempre Primeiro</option>
                        </select>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h3 class="form-section-title">3. Regras de Descanso & Recuperação</h3>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>PV Recuperados no Descanso Longo (%)</label>
                        <input type="number" class="form-control" value="${Number(r.longRestHpPercent) ?? 100}" min="0" max="100" step="25" onchange="updateSingleRuleField('longRestHpPercent', Number(this.value))">
                    </div>
                    <div class="form-group">
                        <label>Dados de Vida Recuperados no Descanso Longo (%)</label>
                        <input type="number" class="form-control" value="${Number(r.longRestHitDicePercent) ?? 100}" min="0" max="100" step="25" onchange="updateSingleRuleField('longRestHitDicePercent', Number(this.value))">
                    </div>
                    <div class="form-group">
                        <label>Unidade por Quadrado no Tabletop</label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input type="number" class="form-control" value="${Number(r.gridMetersPerSquare) || 1.5}" step="0.5" min="0.5" title="Metros por quadrado" onchange="updateSingleRuleField('gridMetersPerSquare', Number(this.value))">
                            <span>m /</span>
                            <input type="number" class="form-control" value="${Number(r.gridFeetPerSquare) || 5}" step="1" min="1" title="Pés (ft) por quadrado" onchange="updateSingleRuleField('gridFeetPerSquare', Number(this.value))">
                            <span>ft</span>
                        </div>
                    </div>
                </div>
                <div class="form-grid" style="margin-top:10px;">
                    <div class="form-group">
                        <label>Regra de Distância Diagonal (Régua / Movimento no Tabletop)</label>
                        <select class="form-control" onchange="updateSingleRuleField('diagonalRule', this.value)">
                            <option value="equidistant" ${r.diagonalRule === 'equidistant' ? 'selected' : ''}>📐 Equidistante 1-1-1 (Padrão D&D 5e: 1,5m por diagonal)</option>
                            <option value="alternating" ${r.diagonalRule === 'alternating' ? 'selected' : ''}>♟️ Tática Alternada 1-2-1 / 5-10-5 (DMG Opcional / 3.5e / PF)</option>
                            <option value="euclidean" ${r.diagonalRule === 'euclidean' ? 'selected' : ''}>📏 Euclidiana Real (Wargame sem grade)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Condições Extras da Campanha (separadas por vírgula)</label>
                        <input type="text" class="form-control" value="${escapeHtmlText((r.extraConditions || []).join(', '))}" placeholder="Ex: Sangrando, Marca de Osybus, Assombrado" onchange="updateSingleRuleField('extraConditions', this.value.split(',').map(s=>s.trim()).filter(Boolean))">
                    </div>
                </div>
            </div>

            <div style="font-size:12px; color:#8df596; background:#162419; border:1px solid #3c6e43; padding:8px 12px; border-radius:6px;">
                ✅ <strong>Regras Efetivas em Uso (com Mods ativos):</strong> Crítico = <code>${eff.critRule}</code> | Exaustão = <code>${eff.exhaustionMode} (${eff.exhaustionPenaltyPerLevel}/nível)</code> | Descanso Longo = <code>${eff.longRestHpPercent}% PV / ${eff.longRestHitDicePercent}% DV</code> | Condições = <code>${CompendioRules.getAllConditions().length} disponíveis</code>
            </div>
            </div>
        `;
        return;
    }

    if (activeRulesModalTab === 'legal') {
        container.innerHTML = `
            <div class="studio-header">
                <h2>🛡️ Privacidade, Soberania de Dados & Licenças Open Source</h2>
                <button class="btn-close-modal" type="button" onclick="closeRulesAndModsModal()">✕</button>
            </div>
            <div class="studio-form-pane" style="border-right:none; max-height:78vh; overflow-y:auto;">
                <div style="display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap;">
                    <button type="button" class="btn-action-bar" onclick="switchRulesModalTab('rules')">⚙️ Sistema & Regras Base</button>
                    <button type="button" class="btn-action-bar" onclick="switchRulesModalTab('mods')">🧩 Mods & Pacotes (${window.installedMods.filter(m => m.enabled).length}/${window.installedMods.length})</button>
                    <button type="button" class="btn-save-primary" onclick="switchRulesModalTab('legal')">🛡️ Privacidade & Licenças</button>
                </div>

                <div class="form-section">
                    <h3 class="form-section-title">1. Política de Privacidade (100% Local-First & Zero Telemetria)</h3>
                    <p style="font-size:12.5px; color:#c2c6d6; margin:6px 0;">
                        • <strong>Zero Coleta de Dados:</strong> Este aplicativo não possui servidores na nuvem, banco de dados externo, Google Analytics, cookies de rastreamento, anúncios ou telemetria.<br>
                        • <strong>Soberania Total do Usuário (LGPD / GDPR):</strong> Todas as fichas, mapas, PINs locais, rolagens e notas da sua campanha ficam armazenados exclusivamente no seu dispositivo (<code>localStorage</code>, pasta <code>public/</code> e <code>perfil-app/</code>).<br>
                        • <strong>Multiplayer Direto (LAN / VPN):</strong> Em sessões com até 8 jogadores, os dados trafegam apenas entre os navegadores dos jogadores e o computador do Mestre (GM) que hospeda a partida.<br>
                        • <strong>Controle e Exclusão Imediata:</strong> Você pode exportar seus dados em formato aberto (<code>⬇ Backup</code>) ou apagar permanentemente todos os registros locais a qualquer momento clicando em <code>💀 Expurgar</code>.
                    </p>
                </div>

                <div class="form-section">
                    <h3 class="form-section-title">2. Autoria Coletiva, Copyright & Licença Open Source (MIT)</h3>
                    <p style="font-size:12.5px; color:#c2c6d6; margin:6px 0;">
                        <code>Copyright (c) 2026 RPG Compendium Contributors (Autores e Colaboradores do Projeto Compêndio RPG)</code><br><br>
                        • O motor de software, código-fonte, interface, motor de dados e sistema de Tabletop são softwares livres licenciados sob a <strong>Licença MIT</strong> (fornecidos <em>"COMO ESTÃO" / "AS IS"</em>, sem garantias).<br>
                        • <strong>Proteção de Identidade de Autores e Colaboradores:</strong> Este projeto adota autoria coletiva e pseudônima (<em>Privacy-First Authorship</em>), garantindo que criadores, mantenedores e colaboradores nunca precisem expor dados civis (PII) para criar ou contribuir.
                    </p>
                </div>

                <div class="form-section">
                    <h3 class="form-section-title">3. Propriedade Intelectual de RPG, SRD 5.1 (CC-BY-4.0) & Conteúdo do Usuário</h3>
                    <p style="font-size:12px; color:#c2c6d6; margin:6px 0;">
                        • <strong>Atribuição SRD 5.1 (CC-BY-4.0):</strong> As mecânicas base compatíveis com D&D 5e utilizam material do <em>System Reference Document 5.1 ("SRD 5.1")</em>, de autoria da Wizards of the Coast LLC, licenciado sob a <em>Creative Commons Attribution 4.0 International License (CC-BY-4.0)</em>.<br>
                        • <strong>Política de Conteúdo de Fãs (Fan Content Policy):</strong> Ferramenta independente e não oficial. Não aprovada, patrocinada ou endossada pela Wizards of the Coast.<br>
                        • <strong>Conteúdo Importado pelo Usuário:</strong> O aplicativo atua como um leitor e editor local neutro de arquivos (<code>.json</code>, <code>.pdf</code>, <code>.html</code>, <code>.svg</code>, <code>.png</code>). Todo conteúdo importado pelo usuário permanece estritamente em sua máquina local para uso privado e doméstico em sua mesa de RPG.
                    </p>
                </div>

                <div style="font-size:11.5px; color:#8df596; background:#162419; border:1px solid #3c6e43; padding:8px 12px; border-radius:6px;">
                    📄 Documentação jurídica e técnica completa disponível na raiz do projeto: <code>LICENSE</code>, <code>PRIVACY.md</code>, <code>NOTICE.md</code>, <code>AUTHORS.md</code>, <code>CONTRIBUTING.md</code> e <code>SECURITY.md</code>.
                </div>
            </div>
        `;
        return;
    }

    // ABA DE MODS
    const modsListHtml = window.installedMods.map(m => {
        const safeId = escapeHtmlText(m.id);
        return `
            <div class="form-section" style="display:flex; justify-content:space-between; align-items:center; gap:12px; border-color:${m.enabled ? '#d8b467' : '#3c3e4a'};">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <strong style="font-size:14px; color:${m.enabled ? '#f2cf83' : '#e2e4ec'};">${escapeHtmlText(m.name)}</strong>
                        <span class="list-item-folder-badge">v${escapeHtmlText(m.version || '1.0')}</span>
                        <span style="font-size:11px; color:#9da2b8;">por ${escapeHtmlText(m.author || 'Comunidade')}</span>
                    </div>
                    <p style="margin:5px 0 0 0; font-size:12px; color:#c2c6d6;">${escapeHtmlText(m.description || 'Sem descrição.')}</p>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-weight:bold; color:${m.enabled ? '#8df596' : '#a0a4b8'};">
                        <input type="checkbox" ${m.enabled ? 'checked' : ''} onchange="CompendioModAPI.toggleMod('${safeId}', this.checked)">
                        ${m.enabled ? 'ATIVO' : 'Inativo'}
                    </label>
                    <button type="button" class="btn-mini" onclick="exportSingleModJson('${safeId}')" title="Exportar Mod .json">📤</button>
                    <button type="button" class="btn-mini danger" onclick="CompendioModAPI.removeMod('${safeId}')" title="Remover Mod">✕</button>
                </div>
            </div>
        `;
    }).join('') || `<div class="info-container"><p class="info-text">Nenhum Mod instalado ainda. Importe um arquivo <code>.json</code> abaixo ou crie seu próprio Mod!</p></div>`;

    container.innerHTML = `
        <div class="studio-header">
            <h2>⚙️ Motor de Regras & Mods da Campanha</h2>
            <button class="btn-close-modal" type="button" onclick="closeRulesAndModsModal()">✕</button>
        </div>
        <div class="studio-form-pane" style="border-right:none; max-height:78vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" class="btn-action-bar" onclick="switchRulesModalTab('rules')">⚙️ Sistema & Regras Base</button>
                <button type="button" class="btn-save-primary" onclick="switchRulesModalTab('mods')">🧩 Mods & Pacotes (${window.installedMods.filter(m => m.enabled).length}/${window.installedMods.length})</button>
                <button type="button" class="btn-action-bar" onclick="switchRulesModalTab('legal')">🛡️ Privacidade & Licenças</button>
            </div>
            <div style="display:flex; gap:6px;">
                <button type="button" class="btn-mini" onclick="document.getElementById('mod-file-upload-input').click()">📂 Importar Mod (.JSON / .JS)</button>
                <input type="file" id="mod-file-upload-input" accept=".json,.js" style="display:none" onchange="handleModFileUpload(event)">
            </div>
        </div>

        ${modsListHtml}

        <div class="form-section">
            <h3 class="form-section-title">➕ Criar ou Colar Novo Mod (JSON / Script Hook)</h3>
            <div class="form-grid">
                <div class="form-group">
                    <label>Nome do Mod</label>
                    <input type="text" id="new-mod-name" class="form-control" placeholder="Ex: Regras de Sanidade de Baróvia">
                </div>
                <div class="form-group">
                    <label>Recurso Extra p/ Ficha de Personagem (Opcional)</label>
                    <input type="text" id="new-mod-resource" class="form-control" placeholder="Ex: Pontos de Sanidade (Máx 10)">
                </div>
                <div class="form-group full">
                    <label>Descrição / Efeito do Mod</label>
                    <input type="text" id="new-mod-desc" class="form-control" placeholder="Ex: Adiciona contador de Sanidade nas fichas e condição Enlouquecido">
                </div>
                <div class="form-group full">
                    <label>Ou cole um Manifesto JSON completo de Mod (opcional):</label>
                    <textarea id="new-mod-json-raw" class="form-control code-area" style="min-height:95px;" placeholder='{"id":"meu-mod","name":"Meu Mod","rulesPatch":{"critRule":"max-plus-roll","extraConditions":["Congelado"]}}'></textarea>
                </div>
            </div>
            <div style="margin-top:10px; display:flex; justify-content:flex-end;">
                <button type="button" class="btn-save-primary" onclick="createOrImportModFromModal()">🧩 Instalar e Ativar Mod</button>
            </div>
        </div>
        </div>
    `;
}

function updateSingleRuleField(field, value) {
    window.activeRulesConfig[field] = value;
    if (field !== 'presetId' && field !== 'presetName') {
        window.activeRulesConfig.presetId = 'custom';
    }
    CompendioRules.save();
    CompendioRules.refreshAllScreens();
    renderRulesAndModsModalBody();
}

function createOrImportModFromModal() {
    const rawJson = (document.getElementById('new-mod-json-raw')?.value || '').trim();
    try {
        if (rawJson) {
            const parsed = JSON.parse(rawJson);
            const mod = CompendioModAPI.installMod(parsed, true);
            showToast(`🧩 Mod "${mod.name}" instalado e ativado!`);
            renderRulesAndModsModalBody();
            return;
        }
        const name = (document.getElementById('new-mod-name')?.value || '').trim();
        if (!name) {
            showToast('Digite um nome para o Mod ou cole um JSON!');
            return;
        }
        const desc = (document.getElementById('new-mod-desc')?.value || '').trim();
        const resRaw = (document.getElementById('new-mod-resource')?.value || '').trim();
        const customResources = [];
        if (resRaw) {
            const maxMatch = resRaw.match(/(\d+)/);
            const cleanResName = resRaw.replace(/\([^)]*\)/g, '').trim();
            customResources.push({
                name: cleanResName || resRaw,
                max: maxMatch ? parseInt(maxMatch[1]) : 5,
                recharge: 'long'
            });
        }
        const mod = CompendioModAPI.installMod({
            id: 'mod-' + slugify(name),
            name,
            description: desc || 'Mod criado pelo usuário no Compêndio.',
            customResources,
            rulesPatch: {}
        }, true);
        CompendioModAPI.toggleMod(mod.id, true);
        showToast(`🧩 Mod "${mod.name}" criado e ativado!`);
        renderRulesAndModsModalBody();
    } catch (e) {
        showToast('⚠️ Erro ao instalar Mod: ' + e.message);
    }
}

async function handleModFileUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith('.js')) {
            const modName = file.name.replace(/\.js$/i, '');
            const mod = CompendioModAPI.installMod({
                id: 'mod-' + slugify(modName),
                name: modName,
                description: `Script JS importado de ${file.name}`,
                scriptCode: text
            }, true);
            showToast(`🧩 Script Mod "${mod.name}" ativado!`);
        } else {
            const parsed = JSON.parse(text);
            const mod = CompendioModAPI.installMod(parsed, true);
            showToast(`🧩 Mod "${mod.name}" importado com sucesso!`);
        }
        renderRulesAndModsModalBody();
    } catch (err) {
        showToast('⚠️ Arquivo de Mod inválido: ' + err.message);
    } finally {
        event.target.value = '';
    }
}

function exportSingleModJson(modId) {
    const mod = window.installedMods.find(m => m.id === modId);
    if (!mod) return;
    const blob = new Blob([JSON.stringify(mod, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${mod.id || 'mod'}.json`;
    a.click();
}
