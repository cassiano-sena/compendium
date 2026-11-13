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
        if (typeof CompendioModAPI !== 'undefined' && CompendioModAPI.rebuildActiveModHooks) {
            CompendioModAPI.rebuildActiveModHooks();
        }
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
        if (!Array.isArray(eff.diceMacros)) eff.diceMacros = [];
        for (const mod of window.installedMods) {
            if (!mod || !mod.enabled) continue;
            const p = mod.rulesPatch || {};
            for (const [k, v] of Object.entries(p)) {
                if (k === 'extraConditions' && Array.isArray(v)) {
                    v.forEach(c => {
                        if (!eff.extraConditions.includes(c)) eff.extraConditions.push(c);
                    });
                } else if (k === 'baseConditions' && Array.isArray(v)) {
                    eff.baseConditions = [...v];
                } else if (k === 'attributeSchema' && Array.isArray(v)) {
                    eff.attributeSchema = JSON.parse(JSON.stringify(v));
                } else if (k === 'diceMacros' && Array.isArray(v)) {
                    v.forEach(m => {
                        if (m && m.name) eff.diceMacros.push(Object.assign({}, m, { fromMod: mod.name }));
                    });
                } else if (v !== undefined) {
                    eff[k] = v;
                }
            }
            if (Array.isArray(mod.diceMacros)) {
                mod.diceMacros.forEach(m => {
                    if (m && m.name) eff.diceMacros.push(Object.assign({}, m, { fromMod: mod.name }));
                });
            }
        }
        return eff;
    },

    getActiveModMacros() {
        const eff = this.getEffectiveRules();
        return Array.isArray(eff.diceMacros) ? eff.diceMacros : [];
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
                    } else if (exists.sourcePath && exists.sourcePath === m.path && !exists.userEdited) {
                        const wasEnabled = Boolean(exists.enabled);
                        Object.assign(exists, m.manifest, { enabled: wasEnabled, sourcePath: m.path });
                    }
                }
            }
            if (typeof CompendioModAPI !== 'undefined' && CompendioModAPI.rebuildActiveModHooks) {
                CompendioModAPI.rebuildActiveModHooks();
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
        if (typeof CompendioDice !== 'undefined' && typeof CompendioDice.renderWidget === 'function') {
            CompendioDice.renderWidget();
        }
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
    _activeLoadingModId: null,

    registerHook(hookName, callback, explicitModId = null) {
        if (!this.hooks[hookName]) this.hooks[hookName] = [];
        if (typeof callback === 'function') {
            this.hooks[hookName].push({
                fn: callback,
                modId: explicitModId || this._activeLoadingModId || 'global'
            });
        }
    },

    unregisterModHooks(modId) {
        if (!modId) return;
        for (const hookName of Object.keys(this.hooks)) {
            this.hooks[hookName] = (this.hooks[hookName] || []).filter(entry => {
                if (typeof entry === 'function') return true;
                return entry && entry.modId !== modId;
            });
        }
    },

    clearAllModHooks() {
        for (const hookName of Object.keys(this.hooks)) {
            this.hooks[hookName] = (this.hooks[hookName] || []).filter(entry => {
                if (typeof entry === 'function') return true;
                return entry && entry.modId === 'global';
            });
        }
    },

    rebuildActiveModHooks() {
        this.clearAllModHooks();
        for (const mod of (window.installedMods || [])) {
            if (!mod) continue;
            mod.lastError = null;
            if (!mod.enabled) continue;
            if (Array.isArray(mod.customResources) && typeof charactersData !== 'undefined') {
                this.syncModResourcesToCharacters(mod);
            }
            if (mod.scriptCode) {
                this.executeModScript(mod);
            }
        }
    },

    syncModResourcesToCharacters(mod) {
        if (!mod || !Array.isArray(mod.customResources) || typeof charactersData === 'undefined') return;
        let touched = false;
        charactersData.forEach(c => {
            if (!Array.isArray(c.customResources)) c.customResources = [];
            mod.customResources.forEach(cr => {
                if (cr && cr.name && !c.customResources.some(x => x.name === cr.name)) {
                    c.customResources.push({
                        id: 'res-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
                        name: cr.name,
                        current: cr.max || 1,
                        max: cr.max || 1,
                        recharge: cr.recharge || 'long'
                    });
                    touched = true;
                }
            });
        });
        if (touched && typeof saveLocalPersistence === 'function') saveLocalPersistence();
    },

    runHooks(hookName, payload) {
        const list = this.hooks[hookName] || [];
        let current = payload;
        const effRules = CompendioRules.getEffectiveRules();
        for (const entry of list) {
            const fn = typeof entry === 'function' ? entry : entry?.fn;
            const modId = typeof entry === 'object' ? entry?.modId : null;
            if (typeof fn !== 'function') continue;
            try {
                const res = fn(current, effRules);
                if (res !== undefined) current = res;
            } catch (e) {
                console.warn(`Erro no hook ${hookName}:`, e);
                if (modId && modId !== 'global') {
                    const m = (window.installedMods || []).find(x => x.id === modId);
                    if (m) m.lastError = `[${hookName}] ${e.message}`;
                }
            }
        }
        return current;
    },

    installMod(modObject, enableImmediately = true) {
        if (!modObject || typeof modObject !== 'object' || Array.isArray(modObject)) {
            throw new Error('O Mod precisa ser um objeto JSON válido com "id" ou "name".');
        }
        const id = modObject.id || ('mod-' + Date.now().toString(36));
        const existingIdx = window.installedMods.findIndex(m => m.id === id);
        const normalized = Object.assign({
            id,
            name: modObject.name || id,
            version: modObject.version || '1.0.0',
            author: modObject.author || 'Comunidade',
            description: modObject.description || '',
            rulesPatch: modObject.rulesPatch || {},
            customResources: modObject.customResources || [],
            diceMacros: modObject.diceMacros || [],
            scriptCode: modObject.scriptCode || '',
            lastError: null
        }, modObject);
        normalized.id = id;
        normalized.enabled = Boolean(enableImmediately);

        if (existingIdx >= 0) {
            window.installedMods[existingIdx] = normalized;
        } else {
            window.installedMods.push(normalized);
        }

        this.rebuildActiveModHooks();
        CompendioRules.save();
        CompendioRules.refreshAllScreens();
        return normalized;
    },

    installModInput(parsedInput, enableImmediately = true) {
        if (Array.isArray(parsedInput)) {
            if (parsedInput.length === 0) throw new Error('Lista de mods vazia.');
            return parsedInput.map(m => this.installMod(m, enableImmediately));
        }
        if (parsedInput && Array.isArray(parsedInput.mods)) {
            if (parsedInput.mods.length === 0) throw new Error('Pacote sem nenhum mod em "mods".');
            return parsedInput.mods.map(m => this.installMod(m, enableImmediately));
        }
        return [this.installMod(parsedInput, enableImmediately)];
    },

    executeModScript(mod) {
        if (!mod || !mod.scriptCode) return;
        const prevLoadingId = this._activeLoadingModId;
        this._activeLoadingModId = mod.id;
        mod.lastError = null;
        try {
            const fn = new Function('CompendioModAPI', 'CompendioRules', mod.scriptCode);
            fn(window.CompendioModAPI, CompendioRules);
        } catch (err) {
            mod.lastError = err.message || String(err);
            console.warn(`Erro ao executar script do Mod "${mod.name}":`, err);
        } finally {
            this._activeLoadingModId = prevLoadingId;
        }
    },

    toggleMod(modId, enabled) {
        const mod = window.installedMods.find(m => m.id === modId);
        if (!mod) return;
        mod.enabled = Boolean(enabled);
        this.rebuildActiveModHooks();
        CompendioRules.save();
        CompendioRules.refreshAllScreens();
        renderRulesAndModsModalBody();
    },

    removeMod(modId) {
        window.installedMods = window.installedMods.filter(m => m.id !== modId);
        this.unregisterModHooks(modId);
        this.rebuildActiveModHooks();
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
        const badges = [];
        if (m.scriptCode) badges.push('⚡ Script JS');
        if (m.rulesPatch?.attributeSchema) badges.push('📋 Atributos Custom');
        if (m.rulesPatch?.defaultDiceFormula) badges.push(`🎲 ${escapeHtmlText(m.rulesPatch.defaultDiceFormula)}`);
        if (Array.isArray(m.customResources) && m.customResources.length) badges.push(`🔋 ${m.customResources.length} Recurso(s)`);
        if ((Array.isArray(m.diceMacros) && m.diceMacros.length) || (Array.isArray(m.rulesPatch?.diceMacros) && m.rulesPatch.diceMacros.length)) badges.push('⚡ Macros');
        const badgesHtml = badges.map(b => `<span class="list-item-folder-badge" style="background:rgba(216,180,103,0.14); color:#f2cf83;">${b}</span>`).join('');
        const errHtml = m.lastError ? `<div style="margin-top:6px; font-size:11.5px; color:#ff9e9e; background:rgba(166,40,40,0.22); border:1px solid #a62828; border-radius:4px; padding:4px 8px;">⚠️ Erro no script/hook: ${escapeHtmlText(m.lastError)}</div>` : '';

        return `
            <div class="form-section" style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; border-color:${m.lastError ? '#c94040' : (m.enabled ? '#d8b467' : '#3c3e4a')};">
                <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <strong style="font-size:14px; color:${m.enabled ? '#f2cf83' : '#e2e4ec'};">${escapeHtmlText(m.name)}</strong>
                        <span class="list-item-folder-badge">v${escapeHtmlText(m.version || '1.0')}</span>
                        <span style="font-size:11px; color:#9da2b8;">por ${escapeHtmlText(m.author || 'Comunidade')}</span>
                        ${badgesHtml}
                    </div>
                    <p style="margin:5px 0 0 0; font-size:12px; color:#c2c6d6;">${escapeHtmlText(m.description || 'Sem descrição.')}</p>
                    ${errHtml}
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer; font-weight:bold; color:${m.enabled ? '#8df596' : '#a0a4b8'};">
                        <input type="checkbox" ${m.enabled ? 'checked' : ''} onchange="CompendioModAPI.toggleMod('${safeId}', this.checked)">
                        ${m.enabled ? 'ATIVO' : 'Inativo'}
                    </label>
                    <button type="button" class="btn-mini" onclick="editInstalledMod('${safeId}')" title="Editar JSON / Script deste Mod">✏️</button>
                    <button type="button" class="btn-mini" onclick="exportSingleModJson('${safeId}')" title="Exportar Mod .json">📤</button>
                    <button type="button" class="btn-mini danger" onclick="CompendioModAPI.removeMod('${safeId}')" title="Remover Mod">✕</button>
                </div>
            </div>
        `;
    }).join('') || `<div class="info-container"><p class="info-text">Nenhum Mod instalado ainda. Importe um arquivo <code>.json</code> / <code>.js</code> abaixo ou crie seu próprio Mod!</p></div>`;

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
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn-mini" onclick="loadFateStarterModTemplate()" title="Carrega modelo declarativo completo de outro sistema (Fate 4dF)">🧩 Modelo Fate (4dF)</button>
                <button type="button" class="btn-mini" onclick="document.getElementById('mod-file-upload-input').click()">📂 Importar Mod (.JSON / .JS)</button>
                <input type="file" id="mod-file-upload-input" accept=".json,.js" style="display:none" onchange="handleModFileUpload(event)">
            </div>
        </div>

        ${modsListHtml}

        <div class="form-section">
            <h3 class="form-section-title" id="mod-editor-heading">➕ Criar, Editar ou Colar Mod (JSON / Sistema Alternativo / Script Hook)</h3>
            <input type="hidden" id="editing-mod-id" value="">
            <div class="form-grid">
                <div class="form-group">
                    <label>Nome do Mod (criação rápida)</label>
                    <input type="text" id="new-mod-name" class="form-control" placeholder="Ex: Regras de Sanidade de Baróvia">
                </div>
                <div class="form-group">
                    <label>Recurso Extra p/ Ficha (Opcional)</label>
                    <input type="text" id="new-mod-resource" class="form-control" placeholder="Ex: Pontos de Sanidade (Máx 10)">
                </div>
                <div class="form-group full">
                    <label>Descrição / Efeito do Mod</label>
                    <input type="text" id="new-mod-desc" class="form-control" placeholder="Ex: Adiciona contador de Sanidade nas fichas e condição Enlouquecido">
                </div>
                <div class="form-group full">
                    <label>Manifesto JSON completo do Mod (suporta <code>attributeSchema</code>, <code>defaultDiceFormula</code>, <code>baseConditions</code>, <code>diceMacros</code>, <code>scriptCode</code>):</label>
                    <textarea id="new-mod-json-raw" class="form-control code-area" style="min-height:135px; font-family:monospace; font-size:12px;" placeholder='{"id":"meu-mod","name":"Meu Mod","rulesPatch":{"critRule":"max-plus-roll","extraConditions":["Congelado"]}}'></textarea>
                </div>
            </div>
            <div style="margin-top:10px; display:flex; justify-content:flex-end; gap:8px;">
                <button type="button" class="btn-mini" onclick="clearModEditorForm()">Limpar Editor</button>
                <button type="button" class="btn-save-primary" onclick="createOrImportModFromModal()">🧩 Salvar / Instalar e Ativar Mod</button>
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

function editInstalledMod(modId) {
    const mod = window.installedMods.find(m => m.id === modId);
    if (!mod) return;
    const rawBox = document.getElementById('new-mod-json-raw');
    const idInput = document.getElementById('editing-mod-id');
    const heading = document.getElementById('mod-editor-heading');
    if (idInput) idInput.value = mod.id;
    if (heading) heading.textContent = `✏️ Editando Mod: ${mod.name}`;
    if (rawBox) {
        const cleanCopy = Object.assign({}, mod);
        delete cleanCopy.lastError;
        rawBox.value = JSON.stringify(cleanCopy, null, 2);
        rawBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearModEditorForm() {
    const idInput = document.getElementById('editing-mod-id');
    const rawBox = document.getElementById('new-mod-json-raw');
    const heading = document.getElementById('mod-editor-heading');
    if (idInput) idInput.value = '';
    if (rawBox) rawBox.value = '';
    if (heading) heading.textContent = '➕ Criar, Editar ou Colar Mod (JSON / Sistema Alternativo / Script Hook)';
}

function loadFateStarterModTemplate() {
    const fateSample = {
        id: 'mod-sistema-fate-4df',
        name: '🎲 Fate Acelerado (4dF + Abordagens)',
        version: '1.0.0',
        author: 'Comunidade / Sistema Alternativo',
        description: 'Converte a ficha para Fate Acelerado com 6 Abordagens diretas, 4dF padrão, Pontos de Destino, Consequências e Macro de Ataque Fate.',
        rulesPatch: {
            presetName: 'Fate Acelerado (Mod)',
            defaultDiceFormula: '4dF',
            modifierCalculation: 'direct',
            hideDndSpellSlots: true,
            hideDndDeathSaves: true,
            customSheetBanner: 'Modo Sistema Alternativo: Fate Acelerado (4dF + Abordagem Direta)',
            attributeSchema: [
                { key: 'str', label: 'Poderoso', short: 'POD' },
                { key: 'dex', label: 'Ágil', short: 'AGI' },
                { key: 'con', label: 'Cuidadoso', short: 'CUI' },
                { key: 'int', label: 'Esperto', short: 'ESP' },
                { key: 'wis', label: 'Estiloso', short: 'EST' },
                { key: 'cha', label: 'Sorrateiro', short: 'SOR' }
            ],
            baseConditions: [
                'Estresse 1', 'Estresse 2', 'Estresse 3',
                'Consequência Leve (-2)', 'Consequência Moderada (-4)', 'Consequência Severa (-6)',
                'Impulso (+2)', 'Concedido / Fora de Cena'
            ]
        },
        customResources: [
            { name: 'Pontos de Destino (Fate)', max: 3, recharge: 'long' }
        ],
        diceMacros: [
            { id: 'macro-fate-4df', name: '🎲 Ação Fate (+2)', steps: [{ label: 'Teste Fate Base', formula: '4dF+2', mode: 'normal' }] }
        ],
        scriptCode: 'CompendioModAPI.registerHook("onCalculateDerived", (ctx) => { if (ctx && ctx.character) { ctx.bannerExtra = "Destino ativo na mesa"; } return ctx; });'
    };
    const rawBox = document.getElementById('new-mod-json-raw');
    if (rawBox) {
        rawBox.value = JSON.stringify(fateSample, null, 2);
        rawBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof showToast === 'function') showToast('🧩 Modelo Fate (4dF) carregado no editor! Clique em Salvar / Instalar para aplicar.');
    }
}

function createOrImportModFromModal() {
    const rawJson = (document.getElementById('new-mod-json-raw')?.value || '').replace(/^\uFEFF/, '').trim();
    const editingId = (document.getElementById('editing-mod-id')?.value || '').trim();
    try {
        if (rawJson) {
            const parsed = JSON.parse(rawJson);
            if (editingId && parsed && !Array.isArray(parsed) && !parsed.id) parsed.id = editingId;
            if (parsed && !Array.isArray(parsed) && !Array.isArray(parsed.mods)) parsed.userEdited = true;
            const installed = CompendioModAPI.installModInput(parsed, true);
            const names = installed.map(m => m.name).join(', ');
            showToast(`🧩 Mod "${names}" instalado e ativado!`);
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
            id: editingId || ('mod-' + slugify(name)),
            name,
            description: desc || 'Mod criado pelo usuário no Compêndio.',
            customResources,
            rulesPatch: {},
            userEdited: true
        }, true);
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
        const rawText = await file.text();
        const text = rawText.replace(/^\uFEFF/, '');
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
            const installed = CompendioModAPI.installModInput(parsed, true);
            showToast(`🧩 Mod "${installed.map(m => m.name).join(', ')}" importado com sucesso!`);
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
