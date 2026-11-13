/* =========================================================================
   FASE 1: MOTOR UNIVERSAL DE ROLAGEM DE DADOS & BANDEJA / LOG FLUTUANTE
   Suporta expressões complexas (NdX + Mod), Normal/Vantagem/Desvantagem,
   Dano Crítico dinâmico (via CompendioRules), Exaustão e Statblocks Clicáveis.
   ========================================================================= */

const STORAGE_KEY_DICELOG = 'compendio_rpg_dicelog_v1';
const STORAGE_KEY_DICE_MACROS = 'compendio_rpg_dice_macros_v1';

const DICE_TRAY_TYPES = [4, 6, 8, 10, 12, 20, 100];

function createEmptyDiceTrayCounts() {
    return { 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 };
}

function parseDiceFormulaTokens(cleanFormula) {
    const tokenRegex = /([+-]?)(?:(\d*)d(\d+|f)|(\d+))/gi;
    const tokens = [];
    let match;
    while ((match = tokenRegex.exec(cleanFormula)) !== null) {
        if (!match[0]) continue;
        const sign = match[1] === '-' ? -1 : 1;
        if (match[3] !== undefined) {
            const rawFaces = String(match[3]).toLowerCase();
            if (rawFaces === 'f') {
                tokens.push({
                    type: 'die',
                    sign,
                    count: Math.max(1, parseInt(match[2] || '1', 10)),
                    faces: 'F',
                    isFate: true
                });
            } else {
                tokens.push({
                    type: 'die',
                    sign,
                    count: Math.max(1, parseInt(match[2] || '1', 10)),
                    faces: Math.max(1, parseInt(rawFaces, 10))
                });
            }
        } else if (match[4] !== undefined) {
            tokens.push({
                type: 'const',
                sign,
                value: parseInt(match[4], 10) || 0
            });
        }
    }
    return tokens;
}

function rollStandardDieTerm(token, isCrit, rules, prefixStr) {
    if (token.isFate || token.faces === 'F') {
        const rolls = [];
        const symbols = [];
        let sumRolls = 0;
        for (let i = 0; i < token.count; i++) {
            const r = Math.floor(Math.random() * 3) - 1;
            rolls.push(r);
            symbols.push(r === -1 ? '-' : (r === 1 ? '+' : '0'));
            sumRolls += r;
        }
        return {
            signedTotal: token.sign * sumRolls,
            rolls,
            partText: `${prefixStr}${token.count}dF[${symbols.join(',')}]`
        };
    }

    let count = token.count;
    let maxBonus = 0;
    if (isCrit && token.faces !== 20) {
        if (rules.critRule === 'double-dice') {
            count = token.count * 2;
        } else if (rules.critRule === 'max-plus-roll') {
            maxBonus = token.count * token.faces;
        }
    }

    const rolls = [];
    let sumRolls = 0;
    for (let i = 0; i < count; i++) {
        const r = Math.floor(Math.random() * token.faces) + 1;
        rolls.push(r);
        sumRolls += r;
    }

    const termTotal = sumRolls + maxBonus;
    const baseText = `${prefixStr}${count}d${token.faces}[${rolls.join(',')}]`;
    const partText = maxBonus > 0 ? `${baseText} + ${maxBonus}(Máx Crít)` : baseText;
    return {
        signedTotal: token.sign * termTotal,
        rolls,
        partText
    };
}

window.diceLogData = [];
window.diceMacrosData = [];
window.diceTowerOpen = false;
window.diceLogSectionCollapsed = false;
window.diceRollMode = 'normal'; // 'normal' | 'adv' | 'dis'
window.diceCritActive = false;
window.diceSecretGm = false;
window.diceTrayState = {
    counts: createEmptyDiceTrayCounts(),
    mod: 0,
    pin: false
};

const CompendioDice = {
    init() {
        if (!window.diceTrayState || !window.diceTrayState.counts) {
            window.diceTrayState = { counts: createEmptyDiceTrayCounts(), mod: 0, pin: false };
        }
        try {
            const saved = localStorage.getItem(STORAGE_KEY_DICELOG);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) window.diceLogData = parsed.slice(-80);
            }
            const savedMacros = localStorage.getItem(STORAGE_KEY_DICE_MACROS);
            if (savedMacros) {
                const parsedM = JSON.parse(savedMacros);
                if (Array.isArray(parsedM)) window.diceMacrosData = parsedM;
            }
        } catch (e) {}
        this.renderWidget();
    },

    getDefaultDieFormula() {
        try {
            if (typeof CompendioRules !== 'undefined' && CompendioRules.getEffectiveRules) {
                const eff = CompendioRules.getEffectiveRules();
                if (eff && eff.defaultDiceFormula) return String(eff.defaultDiceFormula);
            }
        } catch (e) {}
        return '1d20';
    },

    saveMacros() {
        try {
            localStorage.setItem(STORAGE_KEY_DICE_MACROS, JSON.stringify(window.diceMacrosData || []));
        } catch (e) {}
    },

    getAllMacros() {
        const userMacros = (Array.isArray(window.diceMacrosData) ? window.diceMacrosData : []).map(m => Object.assign({}, m, { isModMacro: false }));
        const modMacros = (typeof CompendioRules !== 'undefined' && CompendioRules.getActiveModMacros)
            ? CompendioRules.getActiveModMacros().map((m, idx) => Object.assign({ id: m.id || `mod-macro-${idx}` }, m, { isModMacro: true }))
            : [];
        return [...modMacros, ...userMacros];
    },

    save() {
        try {
            localStorage.setItem(STORAGE_KEY_DICELOG, JSON.stringify(window.diceLogData.slice(-80)));
        } catch (e) {}
    },

    setMode(mode) {
        window.diceRollMode = mode;
        this.renderWidget();
    },

    toggleCrit() {
        window.diceCritActive = !window.diceCritActive;
        this.renderWidget();
    },

    toggleSecretGm() {
        window.diceSecretGm = !window.diceSecretGm;
        this.renderWidget();
    },

    toggleTower() {
        window.diceTowerOpen = !window.diceTowerOpen;
        this.renderWidget();
    },

    toggleLogCollapse() {
        window.diceLogSectionCollapsed = !window.diceLogSectionCollapsed;
        this.renderWidget();
    },

    addTrayDie(faces, delta = 1) {
        const die = Number(faces);
        if (!DICE_TRAY_TYPES.includes(die)) return;
        const counts = window.diceTrayState.counts;
        counts[die] = Math.max(0, (Number(counts[die]) || 0) + (Number(delta) || 0));
        this.renderWidget();
    },

    stepTrayMod(delta) {
        window.diceTrayState.mod = (Number(window.diceTrayState.mod) || 0) + (Number(delta) || 0);
        this.renderWidget();
    },

    setTrayMod(rawVal, skipRender = false) {
        const cleaned = String(rawVal ?? '').trim();
        const parsed = cleaned === '' || cleaned === '-' || cleaned === '+' ? 0 : parseInt(cleaned, 10);
        window.diceTrayState.mod = Number.isFinite(parsed) ? parsed : 0;
        const previewEl = document.getElementById('dice-tray-preview');
        if (previewEl) {
            const formula = this.getTrayFormula(false);
            previewEl.textContent = formula || '1d20 (padrão)';
        }
        if (!skipRender) this.renderWidget();
    },

    toggleTrayPin() {
        window.diceTrayState.pin = !window.diceTrayState.pin;
        this.renderWidget();
    },

    clearTray() {
        window.diceTrayState.counts = createEmptyDiceTrayCounts();
        window.diceTrayState.mod = 0;
        this.renderWidget();
    },

    getTrayFormula(forRoll = false) {
        const counts = window.diceTrayState?.counts || {};
        const mod = Number(window.diceTrayState?.mod) || 0;
        const dieTerms = DICE_TRAY_TYPES
            .filter(d => (Number(counts[d]) || 0) > 0)
            .map(d => `${Number(counts[d])}d${d}`);

        const modStr = mod > 0 ? `+${mod}` : (mod < 0 ? `${mod}` : '');
        const baseDie = this.getDefaultDieFormula();
        if (dieTerms.length === 0) {
            if (!forRoll) return modStr;
            return modStr ? `${baseDie}${modStr}` : baseDie;
        }
        return `${dieTerms.join('+')}${modStr}`;
    },

    rollTray() {
        const baseDie = this.getDefaultDieFormula();
        const previewFormula = this.getTrayFormula(false);
        const expr = this.getTrayFormula(true);
        const label = previewFormula ? `Bandeja (${previewFormula})` : `Bandeja (${baseDie})`;
        if (!window.diceTrayState.pin) {
            window.diceTrayState.counts = createEmptyDiceTrayCounts();
            window.diceTrayState.mod = 0;
        }
        return this.rollExpression(expr, label);
    },

    rerollEntry(rollId) {
        const entry = window.diceLogData.find(r => r && r.id === rollId);
        if (!entry || !entry.formula) return null;
        return this.rollExpression(entry.formula, entry.label || `Rolagem (${entry.formula})`, {
            isDamage: Boolean(entry.isDamage)
        });
    },

    rollQuick(expr, label = 'Rolagem', opts = {}) {
        const baseDie = this.getDefaultDieFormula();
        const cleanExpr = String(expr || baseDie).trim();
        const normalizedExpr = /^[+-]\d+$/.test(cleanExpr) ? `${baseDie}${cleanExpr}` : cleanExpr;
        return this.rollExpression(normalizedExpr, label, opts);
    },

    rollExpression(rawExpr, label = 'Rolagem', options = {}) {
        const baseDie = this.getDefaultDieFormula();
        let expr = String(rawExpr || baseDie).trim();
        if (/^[+-]\d+$/.test(expr)) expr = `${baseDie}${expr}`;

        const player = (typeof getActivePlayer === 'function') ? getActivePlayer() : { id: 'gm-master', name: 'Mestre (GM)', role: 'gm' };
        const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { critRule: 'double-dice', exhaustionMode: '2024-penalty', exhaustionPenaltyPerLevel: -2 };

        const mode = options.mode || window.diceRollMode || 'normal';
        const isCrit = Boolean(options.isCrit ?? false);
        const isSecret = Boolean(options.isSecret ?? (player.role === 'gm' && window.diceSecretGm));
        const isDamage = Boolean(options.isDamage);

        // Verifica se há personagem ativo para aplicar penalidade de Exaustão em testes de d20
        let exhaustionMod = 0;
        const playerDisplay = (typeof getPlayerDisplayName === 'function') ? getPlayerDisplayName(player) : player.name;
        let actorName = options.actorName || playerDisplay;
        let rolledCharName = '';
        if (!options.skipExhaustion && typeof charactersData !== 'undefined') {
            const charObj = options.charId
                ? charactersData.find(c => c.id === options.charId)
                : (player.role !== 'gm' ? charactersData.find(c => c.ownerId === player.id) : null);
            if (charObj) {
                rolledCharName = charObj.name || '';
                if (!options.actorName) actorName = `${charObj.name} (${playerDisplay})`;
                if (/d20/i.test(expr) && (Number(charObj.exhaustion) || 0) > 0 && typeof CompendioRules !== 'undefined') {
                    exhaustionMod = CompendioRules.getExhaustionPenalty(charObj.exhaustion);
                }
            }
        }

        let hookPayload = {
            expr,
            label,
            mode,
            isCrit,
            isSecret,
            isDamage,
            exhaustionMod,
            actorName
        };
        if (typeof CompendioModAPI !== 'undefined') {
            hookPayload = CompendioModAPI.runHooks('onBeforeDiceRoll', hookPayload);
        }

        const cleanFormula = hookPayload.expr.replace(/\s+/g, '');
        const tokens = parseDiceFormulaTokens(cleanFormula);

        if (tokens.length === 0) {
            if (typeof showToast === 'function') showToast('⚠️ Fórmula de dados inválida: ' + rawExpr);
            return null;
        }

        let total = 0;
        const breakdownParts = [];
        let isNat20 = false;
        let isNat1 = false;

        const dieTokens = tokens.filter(t => t.type === 'die');
        const constTokens = tokens.filter(t => t.type === 'const');
        const hasSingleD20 = dieTokens.some(t => t.faces === 20 && t.count === 1);
        const isAdvOrDis = hookPayload.mode === 'adv' || hookPayload.mode === 'dis';

        if (isAdvOrDis && !hasSingleD20 && dieTokens.length > 0) {
            const rollPoolAttempt = () => {
                let sum = 0;
                const parts = [];
                for (const token of dieTokens) {
                    const signStr = token.sign < 0 ? '-' : (parts.length > 0 ? '+' : '');
                    const res = rollStandardDieTerm(token, hookPayload.isCrit, rules, signStr);
                    sum += res.signedTotal;
                    parts.push(res.partText);
                }
                return { sum, text: `${parts.join(' ')} = ${sum}` };
            };

            const attemptA = rollPoolAttempt();
            const attemptB = rollPoolAttempt();
            const useA = hookPayload.mode === 'adv'
                ? (attemptA.sum >= attemptB.sum)
                : (attemptA.sum <= attemptB.sum);
            const chosenDiceSum = useA ? attemptA.sum : attemptB.sum;
            const tag = hookPayload.mode === 'adv' ? 'Vant' : 'Desv';

            total += chosenDiceSum;
            breakdownParts.push(`${tag}: [${attemptA.text}] vs [${attemptB.text}] ➔ ${chosenDiceSum}`);

            for (const token of constTokens) {
                total += token.sign * token.value;
                breakdownParts.push(`${token.sign < 0 ? '-' : '+'}${token.value}`);
            }
        } else {
            for (const token of tokens) {
                const signStr = token.sign < 0 ? '-' : (breakdownParts.length > 0 ? '+' : '');
                if (token.type === 'die') {
                    if (token.faces === 20 && token.count === 1 && isAdvOrDis) {
                        const r1 = Math.floor(Math.random() * 20) + 1;
                        const r2 = Math.floor(Math.random() * 20) + 1;
                        const chosen = hookPayload.mode === 'adv' ? Math.max(r1, r2) : Math.min(r1, r2);
                        if (chosen === 20) isNat20 = true;
                        if (chosen === 1) isNat1 = true;
                        total += token.sign * chosen;
                        const tag = hookPayload.mode === 'adv' ? 'Vant' : 'Desv';
                        breakdownParts.push(`${signStr}2d20(${tag}: ${r1}, ${r2} ➔ ${chosen})`);
                    } else {
                        const res = rollStandardDieTerm(token, hookPayload.isCrit, rules, signStr);
                        if (token.faces === 20 && res.rolls.length === 1) {
                            if (res.rolls[0] === 20) isNat20 = true;
                            if (res.rolls[0] === 1) isNat1 = true;
                        }
                        total += res.signedTotal;
                        breakdownParts.push(res.partText);
                    }
                } else {
                    total += token.sign * token.value;
                    breakdownParts.push(`${signStr}${token.value}`);
                }
            }
        }

        if (hookPayload.exhaustionMod !== 0) {
            total += hookPayload.exhaustionMod;
            breakdownParts.push(`${hookPayload.exhaustionMod > 0 ? '+' : ''}${hookPayload.exhaustionMod}(Exaustão)`);
        }

        if (hookPayload.isCrit && rules.critRule === 'double-total' && !/d20/i.test(cleanFormula)) {
            total *= 2;
            breakdownParts.push(`×2(Crítico Total)`);
        }

        let rollRecord = {
            id: 'roll-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            playerId: player.id,
            charName: rolledCharName,
            actorName: hookPayload.actorName,
            label: hookPayload.label,
            formula: hookPayload.expr,
            breakdown: breakdownParts.join(' '),
            total,
            mode: hookPayload.mode,
            isCrit: hookPayload.isCrit,
            isNat20,
            isNat1,
            isSecret: hookPayload.isSecret,
            isDamage: hookPayload.isDamage
        };

        if (typeof CompendioModAPI !== 'undefined') {
            rollRecord = CompendioModAPI.runHooks('onAfterDiceRoll', rollRecord);
        }

        window.diceLogData.push(rollRecord);
        if (window.diceLogData.length > 80) window.diceLogData = window.diceLogData.slice(-80);
        this.save();

        // Reseta toggle de crítico único após uma rolagem de dano
        if (window.diceCritActive) {
            window.diceCritActive = false;
        }

        this.renderWidget();

        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDiceRoll) {
            CompendioNetAdapter.sendDiceRoll(rollRecord);
        }

        if (typeof showToast === 'function') {
            const critBadge = rollRecord.isNat20 ? ' 🌟 CRÍTICO (20)!' : (rollRecord.isNat1 ? ' 💀 FALHA CRÍTICA (1)!' : (rollRecord.isCrit ? ' 💥 DANO CRÍTICO!' : ''));
            const secBadge = rollRecord.isSecret ? ' 🔒 [OCULTO GM]' : '';
            const actorShown = this.formatRollActorName(rollRecord);
            showToast(`🎲 ${actorShown} — ${rollRecord.label}: ${rollRecord.total} (${rollRecord.breakdown})${critBadge}${secBadge}`);
        }

        return rollRecord;
    },

    formatRollActorName(rollRecord) {
        if (!rollRecord) return 'Jogador';
        if (typeof isStreamerModeEnabled === 'function' && isStreamerModeEnabled() && typeof getPlayerDisplayName === 'function') {
            const safePlayer = getPlayerDisplayName(rollRecord.playerId, 'Jogador');
            return rollRecord.charName ? `${rollRecord.charName} (${safePlayer})` : safePlayer;
        }
        return rollRecord.actorName || 'Jogador';
    },

    applyRollToTarget(amount, isHeal = false) {
        const val = Math.max(0, Number(amount) || 0);
        if (!val) return;
        const delta = isHeal ? val : -val;

        // 1. Se houver um token selecionado no Tabletop, aplica nele (e sincroniza com Card/Ficha)
        if (typeof selectedTabletopTokenId !== 'undefined' && selectedTabletopTokenId && typeof adjustTabletopTokenHp === 'function') {
            adjustTabletopTokenHp(selectedTabletopTokenId, delta);
            showToast(`${isHeal ? '💚 +' : '🩸 -'}${val} PV aplicado ao Token selecionado!`);
            return;
        }

        // 2. Se houver um card de turno ativo na Runa de Combate, aplica nele
        if (typeof combatCards !== 'undefined' && combatCards.length > 0) {
            const targetCard = combatCards.find(c => c.id === window.activeCombatTurnCardId) || combatCards[0];
            if (targetCard && typeof syncCombatEntityHp === 'function') {
                syncCombatEntityHp(targetCard.id, (Number(targetCard.hp) || 0) + delta);
                showToast(`${isHeal ? '💚 +' : '🩸 -'}${val} PV aplicado em "${targetCard.name}"!`);
                return;
            }
        }

        showToast('Selecione um Token no Tabletop ou invoque um Card na Runa para aplicar dano/cura direto.');
    },

    clearLog() {
        window.diceLogData = [];
        this.save();
        this.renderWidget();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.clearDiceLog) {
            CompendioNetAdapter.clearDiceLog();
        }
    },

    renderWidget() {
        const container = document.getElementById('dice-tower-floating-root');
        if (!container) return;

        const activePl = (typeof getActivePlayer === 'function') ? getActivePlayer() : { role: 'gm' };
        const isGm = activePl && activePl.role === 'gm';

        const prevCustomFormula = document.getElementById('custom-dice-formula-input')?.value || '';
        const visibleLogs = window.diceLogData.slice().reverse().slice(0, 30);
        const logsHtml = visibleLogs.map(r => {
            if (r.isSecret && !isGm && r.playerId !== activePl?.id) {
                return `
                    <div class="dice-log-item secret-roll">
                        <div style="display:flex; justify-content:space-between; font-size:10.5px; color:#9da2b8;">
                            <span>🔒 <strong>Mestre (GM)</strong></span>
                            <span>${escapeHtmlText(r.timestamp || '')}</span>
                        </div>
                        <div style="font-style:italic; color:#b8b2a6; font-size:11.5px; margin-top:2px;">
                            Rolagem oculta atrás do escudo do Mestre...
                        </div>
                    </div>
                `;
            }

            const natCls = r.isNat20 ? 'nat-20' : (r.isNat1 ? 'nat-1' : (r.isCrit ? 'crit-dmg' : ''));
            const badge = r.isNat20 ? '🌟 20 NATURAL' : (r.isNat1 ? '💀 1 NATURAL' : (r.isCrit ? '💥 CRÍTICO' : ''));
            const actorShown = this.formatRollActorName(r);
            const pColor = (typeof getPlayerColor === 'function' && r.playerId) ? getPlayerColor(r.playerId) : '#d8b467';
            return `
                <div class="dice-log-item ${natCls}">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:10.5px; color:#a0a4b8;">
                        <span><span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${escapeHtmlText(pColor)}; margin-right:4px;"></span><strong>${escapeHtmlText(actorShown)}</strong> ${r.isSecret ? '🔒' : ''}</span>
                        <span>${escapeHtmlText(r.timestamp || '')}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:3px; gap:6px;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:bold; color:#f2cf83; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${escapeHtmlText(r.label)} ${badge ? `<span class="dice-crit-pill">${badge}</span>` : ''}
                            </div>
                            <div style="font-size:11px; color:#c2c6d6; font-family:Consolas, monospace; word-break:break-all;">
                                ${escapeHtmlText(r.breakdown)}
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                            <span class="dice-total-badge">${r.total}</span>
                            <div style="display:flex; gap:2px;">
                                <button type="button" class="card-mini-btn" style="font-size:9.5px; padding:1px 4px; color:#d7dbe8;" onclick="CompendioDice.rerollEntry('${escapeHtmlText(r.id)}')" title="Rolar novamente esta expressão">🔁</button>
                                <button type="button" class="card-mini-btn" style="font-size:9.5px; padding:1px 4px; color:#ff9999;" onclick="CompendioDice.applyRollToTarget(${r.total}, false)" title="Aplicar este valor como DANO no Token selecionado ou Card atual">-Dano</button>
                                <button type="button" class="card-mini-btn" style="font-size:9.5px; padding:1px 4px; color:#8df596;" onclick="CompendioDice.applyRollToTarget(${r.total}, true)" title="Aplicar este valor como CURA no Token selecionado ou Card atual">+Cura</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || `<div style="color:#828699; font-size:11.5px; text-align:center; padding:14px;">Nenhuma rolagem ainda. Monte sua bandeja ou clique nos bônus das fichas!</div>`;

        const lastRoll = visibleLogs[0];
        const lastBadge = lastRoll
            ? ((lastRoll.isSecret && !isGm && lastRoll.playerId !== activePl?.id) ? '🔒' : `${lastRoll.total}`)
            : 'd20';

        const trayCounts = window.diceTrayState?.counts || {};
        const trayMod = Number(window.diceTrayState?.mod) || 0;
        const trayModDisplay = trayMod > 0 ? `+${trayMod}` : String(trayMod);
        const rawTrayFormula = this.getTrayFormula(false);
        const previewText = rawTrayFormula || '1d20 (clique nos dados)';

        let spotlightHtml = '';
        if (lastRoll) {
            if (lastRoll.isSecret && !isGm && lastRoll.playerId !== activePl?.id) {
                spotlightHtml = `
                    <div class="dice-last-spotlight">
                        <span style="font-size:11px; color:#b8b2a6; font-style:italic;">🔒 Última rolagem oculta pelo Mestre</span>
                        <span class="dice-total-badge">🔒</span>
                    </div>
                `;
            } else {
                spotlightHtml = `
                    <div class="dice-last-spotlight">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:10.5px; font-weight:700; color:#f2cf83; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                Último: ${escapeHtmlText(lastRoll.label)}
                            </div>
                            <div style="font-size:10.5px; color:#c2c6d6; font-family:Consolas, monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtmlText(lastRoll.breakdown)}">
                                ${escapeHtmlText(lastRoll.breakdown)}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                            <span class="dice-total-badge">${lastRoll.total}</span>
                            <button type="button" class="card-mini-btn" style="font-size:10px; padding:2px 5px;" onclick="CompendioDice.rerollEntry('${escapeHtmlText(lastRoll.id)}')" title="Rolar novamente">🔁</button>
                        </div>
                    </div>
                `;
            }
        }

        container.innerHTML = `
            <div class="dice-tower-panel ${window.diceTowerOpen ? 'open' : ''}" style="display:${window.diceTowerOpen ? 'flex' : 'none'};">
                <div class="dice-tower-header" onclick="CompendioDice.toggleTower()" title="Clique para minimizar o painel de dados">
                    <span>🎲 Rolador & Log de Dados</span>
                    <div style="display:flex; gap:4px;">
                        <button type="button" class="card-mini-btn" onclick="event.stopPropagation(); CompendioDice.clearLog()" title="Limpar histórico de rolagens">🗑️</button>
                        <button type="button" class="card-mini-btn" onclick="event.stopPropagation(); CompendioDice.toggleTower()" title="Minimizar">▼</button>
                    </div>
                </div>

                <!-- Modos de Rolagem (Normal / Vantagem / Desvantagem / Oculto GM) -->
                <div class="dice-modes-bar">
                    <button type="button" class="vis-pill ${window.diceRollMode === 'normal' ? 'active-studied' : ''}" onclick="CompendioDice.setMode('normal')">Normal</button>
                    <button type="button" class="vis-pill ${window.diceRollMode === 'adv' ? 'active-studied' : ''}" onclick="CompendioDice.setMode('adv')" title="Rola com Vantagem (2× e escolhe o maior resultado)">🟢 Vantagem</button>
                    <button type="button" class="vis-pill ${window.diceRollMode === 'dis' ? 'active-hidden' : ''}" onclick="CompendioDice.setMode('dis')" title="Rola com Desvantagem (2× e escolhe o menor resultado)">🔴 Desvant.</button>
                    ${isGm ? `<button type="button" class="vis-pill ${window.diceSecretGm ? 'active-hidden' : ''}" onclick="CompendioDice.toggleSecretGm()" title="Oculta o resultado desta rolagem para os jogadores">🔒 GM</button>` : ''}
                </div>

                <!-- Bandeja de Dados Clicáveis (Esquerdo: +1 dado | Direito: -1 dado) -->
                <div class="dice-quick-grid">
                    ${DICE_TRAY_TYPES.map(d => {
                        const qty = Number(trayCounts[d]) || 0;
                        return `
                            <button type="button"
                                class="calc-btn dice-die-btn ${qty > 0 ? 'has-qty' : ''}"
                                onclick="CompendioDice.addTrayDie(${d}, 1)"
                                oncontextmenu="event.preventDefault(); CompendioDice.addTrayDie(${d}, -1)"
                                title="Clique para +1d${d} • Clique direito para remover 1">
                                d${d}${qty > 0 ? `<span class="dice-qty-pill">${qty}×</span>` : ''}
                            </button>
                        `;
                    }).join('')}
                </div>

                <!-- Modificador Numérico + Ações da Bandeja -->
                <div class="dice-tray-controls">
                    <div class="dice-mod-row">
                        <span class="dice-mod-label">Modificador:</span>
                        <div class="dice-mod-stepper">
                            <button type="button" class="dice-mod-btn" onclick="CompendioDice.stepTrayMod(-5)" title="Subtrair 5">-5</button>
                            <button type="button" class="dice-mod-btn" onclick="CompendioDice.stepTrayMod(-1)" title="Subtrair 1">-</button>
                            <input type="text" inputmode="numeric" id="dice-tray-mod-input" class="dice-mod-input" value="${escapeHtmlText(trayModDisplay)}" oninput="CompendioDice.setTrayMod(this.value, true)" onchange="CompendioDice.setTrayMod(this.value, false)" onkeydown="if(event.key==='Enter'){CompendioDice.rollTray();}" title="Valor do modificador (+5, -2, etc.)">
                            <button type="button" class="dice-mod-btn" onclick="CompendioDice.stepTrayMod(1)" title="Somar 1">+</button>
                            <button type="button" class="dice-mod-btn" onclick="CompendioDice.stepTrayMod(5)" title="Somar 5">+5</button>
                        </div>
                    </div>
                    <div class="dice-tray-actions">
                        <span id="dice-tray-preview" class="dice-preview-chip" title="Fórmula montada na bandeja">${escapeHtmlText(rawTrayFormula || `${this.getDefaultDieFormula()} (clique nos dados)`)}</span>
                        <button type="button" class="card-mini-btn dice-tray-icon-btn ${window.diceTrayState?.pin ? 'active' : ''}" onclick="CompendioDice.toggleTrayPin()" title="Fixar bandeja (mantém dados selecionados após rolar)">📌</button>
                        <button type="button" class="card-mini-btn" onclick="CompendioDice.saveTrayAsMacro()" title="Salvar fórmula atual da bandeja como Macro">💾</button>
                        <button type="button" class="card-mini-btn" onclick="CompendioDice.clearTray()" title="Limpar bandeja">🧹</button>
                        <button type="button" class="btn-summon-card dice-tray-roll-btn" onclick="CompendioDice.rollTray()">🎲 Rolar</button>
                    </div>
                </div>

                <!-- Barra de Macros Rápidos de Rolagem -->
                <div class="dice-macro-bar">
                    ${this.getAllMacros().map(m => `
                        <button type="button" class="dice-macro-chip ${m.isModMacro ? 'mod-macro' : ''}" onclick="CompendioDice.runDiceMacro('${escapeHtmlText(m.id)}')" title="${escapeHtmlText((m.description || m.name) + ' (' + (m.steps || []).map(s => s.formula).join(', ') + ')')}">
                            ⚡ ${escapeHtmlText(m.name)}
                        </button>
                    `).join('')}
                    <button type="button" class="dice-macro-chip" style="border-style:dashed; color:#9da2b8;" onclick="CompendioDice.openDiceMacroModal()" title="Gerenciar, criar, importar ou exportar Macros de ataque e magia">⚙️ Macros</button>
                </div>

                <!-- Fórmula Customizada Livre -->
                <div class="dice-custom-row">
                    <input type="text" id="custom-dice-formula-input" class="form-control" value="${escapeHtmlText(prevCustomFormula)}" style="flex:1; padding:4px 7px; font-size:11.5px;" placeholder="Fórmula livre (ex: 2d6+1d8+5 ou 4dF+2)" onkeydown="if(event.key==='Enter'){CompendioDice.rollFromCustomInput();}">
                    <button type="button" class="btn-summon-card" style="padding:4px 10px; font-size:11.5px;" onclick="CompendioDice.rollFromCustomInput()">Rolar</button>
                </div>

                ${spotlightHtml}

                <!-- Barra Retrátil do Histórico -->
                <div class="dice-log-collapse-bar" onclick="CompendioDice.toggleLogCollapse()" title="Mostrar ou minimizar histórico de rolagens">
                    <span>📜 Histórico (${visibleLogs.length})</span>
                    <span>${window.diceLogSectionCollapsed ? '▶ Mostrar' : '▼ Ocultar'}</span>
                </div>

                <!-- Histórico / Feed de Rolagens -->
                <div class="dice-log-scroll ${window.diceLogSectionCollapsed ? 'collapsed' : ''}" style="display:${window.diceLogSectionCollapsed ? 'none' : 'flex'};">
                    ${logsHtml}
                </div>
            </div>

            <button type="button" class="rune-stone-trigger dice-tower-trigger" aria-expanded="${window.diceTowerOpen ? 'true' : 'false'}" onclick="CompendioDice.toggleTower()" title="Abrir/Minimizar Bandeja e Histórico de Dados">
                <span>🎲 Dados ${window.diceTowerOpen ? '▼' : '▲'}</span>
                <span class="rune-count-badge">${escapeHtmlText(String(lastBadge))}</span>
            </button>
        `;
    },

    rollFromCustomInput() {
        const inp = document.getElementById('custom-dice-formula-input');
        if (!inp) return;
        const val = inp.value.trim() || this.getDefaultDieFormula();
        this.rollQuick(val, `Fórmula (${val})`);
    },

    runDiceMacro(macroId) {
        const macro = this.getAllMacros().find(m => m.id === macroId);
        if (!macro || !Array.isArray(macro.steps) || macro.steps.length === 0) {
            if (typeof showToast === 'function') showToast('⚠️ Macro vazio ou não encontrado.');
            return [];
        }
        const results = [];
        for (const step of macro.steps) {
            if (!step || !step.formula) continue;
            const res = this.rollExpression(
                step.formula,
                `${macro.name} • ${step.label || step.formula}`,
                {
                    mode: step.mode || 'normal',
                    isDamage: Boolean(step.isDamage)
                }
            );
            if (res) results.push(res);
        }
        if (results.length > 1 && typeof showToast === 'function') {
            const sumAll = results.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
            showToast(`⚡ Macro "${macro.name}": ${results.length} rolagens executadas (Soma geral: ${sumAll})`);
        }
        return results;
    },

    _nextMacroId() {
        window._diceMacroSeq = (Number(window._diceMacroSeq) || 0) + 1;
        return `macro-${Date.now().toString(36)}-${window._diceMacroSeq}-${Math.floor(Math.random() * 1000)}`;
    },

    saveTrayAsMacro(customName = null) {
        const formula = this.getTrayFormula(true);
        const name = (customName && String(customName).trim()) || (typeof prompt === 'function' ? prompt('Nome do novo Macro rápido:', `Combo ${formula}`) : `Combo ${formula}`);
        if (!name || !name.trim()) return null;
        const macro = {
            id: this._nextMacroId(),
            name: name.trim(),
            description: `Salvo da bandeja (${formula})`,
            steps: [{
                label: 'Rolagem',
                formula,
                mode: window.diceRollMode || 'normal'
            }]
        };
        if (!Array.isArray(window.diceMacrosData)) window.diceMacrosData = [];
        window.diceMacrosData.push(macro);
        this.saveMacros();
        this.renderWidget();
        if (typeof showToast === 'function') showToast(`⚡ Macro "${macro.name}" salvo!`);
        return macro;
    },

    saveMacroObject(macroInput) {
        if (!macroInput || !macroInput.name) throw new Error('Macro precisa de um nome.');
        const steps = Array.isArray(macroInput.steps)
            ? macroInput.steps.filter(s => s && String(s.formula || '').trim()).map(s => ({
                label: String(s.label || 'Etapa').trim(),
                formula: String(s.formula).trim(),
                mode: s.mode || 'normal',
                isDamage: Boolean(s.isDamage)
            }))
            : [];
        if (steps.length === 0) throw new Error('Adicione pelo menos 1 etapa com fórmula válida.');
        if (!Array.isArray(window.diceMacrosData)) window.diceMacrosData = [];
        const id = macroInput.id || this._nextMacroId();
        const normalized = {
            id,
            name: String(macroInput.name).trim(),
            description: String(macroInput.description || '').trim(),
            steps
        };
        const idx = window.diceMacrosData.findIndex(m => m.id === id);
        if (idx >= 0) window.diceMacrosData[idx] = normalized;
        else window.diceMacrosData.push(normalized);
        this.saveMacros();
        this.renderWidget();
        return normalized;
    },

    deleteDiceMacro(macroId) {
        window.diceMacrosData = (window.diceMacrosData || []).filter(m => m.id !== macroId);
        this.saveMacros();
        this.renderWidget();
        const backdrop = document.getElementById('dice-macro-backdrop');
        if (backdrop && backdrop.classList && backdrop.classList.contains('open')) {
            this.renderDiceMacroModal(null);
        }
    },

    exportDiceMacrosJson(singleId = null) {
        const list = singleId
            ? (window.diceMacrosData || []).filter(m => m.id === singleId)
            : (window.diceMacrosData || []);
        const payload = singleId && list[0] ? list[0] : { format: 'compendio-dice-macros-v1', macros: list };
        const jsonStr = JSON.stringify(payload, null, 2);
        if (typeof Blob !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function') {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = singleId ? `${singleId}.json` : 'compendio-macros-dados.json';
            a.click();
        }
        return jsonStr;
    },

    importDiceMacrosFromJsonText(rawText) {
        const clean = String(rawText || '').replace(/^\uFEFF/, '').trim();
        if (!clean) throw new Error('Cole um JSON ou escolha um arquivo .json válido.');
        const parsed = JSON.parse(clean);
        let items = [];
        if (Array.isArray(parsed)) items = parsed;
        else if (parsed && Array.isArray(parsed.macros)) items = parsed.macros;
        else if (parsed && typeof parsed === 'object') items = [parsed];
        if (items.length === 0) throw new Error('Nenhum macro encontrado no JSON.');
        const imported = items.map(item => this.saveMacroObject(Object.assign({}, item, {
            id: item.id || this._nextMacroId()
        })));
        return imported;
    },

    async handleMacroFileImport(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const imported = this.importDiceMacrosFromJsonText(text);
            if (typeof showToast === 'function') showToast(`⚡ ${imported.length} Macro(s) importado(s) com sucesso!`);
            this.renderDiceMacroModal(null);
        } catch (err) {
            if (typeof showToast === 'function') showToast('⚠️ Erro ao importar macros: ' + err.message);
        } finally {
            event.target.value = '';
        }
    },

    openDiceMacroModal(editId = null) {
        const backdrop = document.getElementById('dice-macro-backdrop');
        if (!backdrop) return;
        this.renderDiceMacroModal(editId);
        backdrop.classList.add('open');
    },

    closeDiceMacroModal() {
        const backdrop = document.getElementById('dice-macro-backdrop');
        if (backdrop) backdrop.classList.remove('open');
    },

    addMacroBuilderStepRow(step = { label: 'Ataque', formula: '1d20+5', mode: 'normal' }) {
        const container = document.getElementById('macro-steps-builder-list');
        if (!container || typeof document.createElement !== 'function') return;
        const row = document.createElement('div');
        row.className = 'macro-step-row';
        row.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px; flex-wrap:wrap;';
        row.innerHTML = `
            <input type="text" class="form-control macro-step-label" value="${escapeHtmlText(step.label || '')}" placeholder="Etapa (ex: Golpe 1)" style="flex:1; min-width:110px; padding:5px 7px; font-size:12px;">
            <input type="text" class="form-control macro-step-formula" value="${escapeHtmlText(step.formula || '')}" placeholder="Fórmula (ex: 1d20+7)" style="flex:1; min-width:110px; padding:5px 7px; font-size:12px;">
            <select class="form-control macro-step-mode" style="width:110px; padding:5px; font-size:12px;">
                <option value="normal" ${step.mode === 'normal' ? 'selected' : ''}>Normal</option>
                <option value="adv" ${step.mode === 'adv' ? 'selected' : ''}>Vantagem</option>
                <option value="dis" ${step.mode === 'dis' ? 'selected' : ''}>Desvantagem</option>
            </select>
            <button type="button" class="btn-mini danger" onclick="this.parentElement.remove()" title="Remover etapa">✕</button>
        `;
        container.appendChild(row);
    },

    saveMacroFromModalForm() {
        const idVal = (document.getElementById('macro-edit-id')?.value || '').trim();
        const nameVal = (document.getElementById('macro-name-input')?.value || '').trim();
        const descVal = (document.getElementById('macro-desc-input')?.value || '').trim();
        const rows = document.querySelectorAll('#macro-steps-builder-list .macro-step-row');
        const steps = [];
        rows.forEach(r => {
            const l = (r.querySelector('.macro-step-label')?.value || '').trim();
            const f = (r.querySelector('.macro-step-formula')?.value || '').trim();
            const m = r.querySelector('.macro-step-mode')?.value || 'normal';
            if (f) steps.push({ label: l || f, formula: f, mode: m });
        });
        try {
            const saved = this.saveMacroObject({ id: idVal || null, name: nameVal, description: descVal, steps });
            if (typeof showToast === 'function') showToast(`⚡ Macro "${saved.name}" salvo!`);
            this.renderDiceMacroModal(null);
        } catch (err) {
            if (typeof showToast === 'function') showToast('⚠️ ' + err.message);
        }
    },

    renderDiceMacroModal(editId = null) {
        const container = document.getElementById('dice-macro-modal-content');
        if (!container) return;
        const allMacros = this.getAllMacros();
        const editObj = editId ? (window.diceMacrosData || []).find(m => m.id === editId) : null;
        const initialSteps = editObj?.steps?.length
            ? editObj.steps
            : [{ label: 'Ataque', formula: '1d20+6', mode: 'normal' }, { label: 'Dano', formula: '1d8+4', mode: 'normal' }];

        const listHtml = allMacros.map(m => {
            const safeId = escapeHtmlText(m.id);
            const stepsDesc = (m.steps || []).map(s => `${s.label}: ${s.formula}`).join(' • ');
            return `
                <div class="form-section" style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 12px; margin-bottom:8px;">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <strong style="color:#f2cf83; font-size:13.5px;">⚡ ${escapeHtmlText(m.name)}</strong>
                            ${m.isModMacro ? `<span class="list-item-folder-badge">🧩 Mod: ${escapeHtmlText(m.fromMod || '')}</span>` : ''}
                        </div>
                        <div style="font-size:11.5px; color:#c2c6d6; margin-top:2px;">${escapeHtmlText(m.description || stepsDesc)}</div>
                        <div style="font-size:11px; color:#9da2b8; font-family:Consolas, monospace; margin-top:2px;">${escapeHtmlText(stepsDesc)}</div>
                    </div>
                    <div style="display:flex; gap:5px; flex-shrink:0;">
                        <button type="button" class="btn-summon-card" style="padding:4px 8px; font-size:11px;" onclick="CompendioDice.runDiceMacro('${safeId}')">▶ Rolar</button>
                        ${!m.isModMacro ? `<button type="button" class="btn-mini" onclick="CompendioDice.renderDiceMacroModal('${safeId}')" title="Editar">✏️</button>` : ''}
                        <button type="button" class="btn-mini" onclick="CompendioDice.exportDiceMacrosJson('${safeId}')" title="Exportar JSON">📤</button>
                        ${!m.isModMacro ? `<button type="button" class="btn-mini danger" onclick="CompendioDice.deleteDiceMacro('${safeId}')" title="Excluir">✕</button>` : ''}
                    </div>
                </div>
            `;
        }).join('') || `<div class="info-container"><p class="info-text">Nenhum macro criado ainda. Monte um macro para magias ou ataques múltiplos abaixo!</p></div>`;

        container.innerHTML = `
            <div class="studio-header">
                <h2>⚡ Macros de Rolagem (Magias, Ataques Múltiplos & Combos)</h2>
                <button class="btn-close-modal" type="button" onclick="CompendioDice.closeDiceMacroModal()">✕</button>
            </div>
            <div class="studio-form-pane" style="border-right:none; max-height:78vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                    <span style="font-size:12px; color:#b8b2a6;">Execute várias rolagens em sequência com 1 clique.</span>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" class="btn-mini" onclick="CompendioDice.exportDiceMacrosJson()">📤 Exportar Todos (.JSON)</button>
                        <button type="button" class="btn-mini" onclick="document.getElementById('dice-macro-import-file').click()">📂 Importar (.JSON)</button>
                        <input type="file" id="dice-macro-import-file" accept=".json" style="display:none" onchange="CompendioDice.handleMacroFileImport(event)">
                    </div>
                </div>

                ${listHtml}

                <div class="form-section">
                    <h3 class="form-section-title">${editObj ? '✏️ Editar Macro' : '➕ Criar Novo Macro de Rolagem'}</h3>
                    <input type="hidden" id="macro-edit-id" value="${escapeHtmlText(editObj?.id || '')}">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Nome do Macro</label>
                            <input type="text" id="macro-name-input" class="form-control" value="${escapeHtmlText(editObj?.name || '')}" placeholder="Ex: Bola de Fogo / Ataque Múltiplo">
                        </div>
                        <div class="form-group">
                            <label>Descrição Curta (Opcional)</label>
                            <input type="text" id="macro-desc-input" class="form-control" value="${escapeHtmlText(editObj?.description || '')}" placeholder="Ex: 2 golpes + dano extra de fogo">
                        </div>
                    </div>
                    <div style="margin-top:8px;">
                        <label style="font-size:12px; color:#d8b467; font-weight:bold; display:block; margin-bottom:6px;">Etapas da Rolagem:</label>
                        <div id="macro-steps-builder-list"></div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; flex-wrap:wrap; gap:8px;">
                            <button type="button" class="btn-mini" onclick="CompendioDice.addMacroBuilderStepRow({ label: 'Extra', formula: '1d6', mode: 'normal' })">➕ Adicionar Etapa</button>
                            <div style="display:flex; gap:6px;">
                                ${editObj ? `<button type="button" class="btn-mini" onclick="CompendioDice.renderDiceMacroModal(null)">Cancelar Edição</button>` : ''}
                                <button type="button" class="btn-save-primary" onclick="CompendioDice.saveMacroFromModalForm()">💾 Salvar Macro</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h3 class="form-section-title">📥 Colar JSON de Macro para Importar</h3>
                    <textarea id="macro-import-json-raw" class="form-control code-area" style="min-height:70px; font-family:monospace; font-size:12px;" placeholder='{"name":"Rajada Mística","steps":[{"label":"Raio 1","formula":"1d20+7"},{"label":"Dano 1","formula":"1d10+4"}]}'></textarea>
                    <div style="display:flex; justify-content:flex-end; margin-top:6px;">
                        <button type="button" class="btn-mini" onclick="try{ const imp = CompendioDice.importDiceMacrosFromJsonText(document.getElementById('macro-import-json-raw').value); showToast('⚡ ' + imp.length + ' Macro(s) importado(s)!'); CompendioDice.renderDiceMacroModal(null); }catch(e){ showToast('⚠️ ' + e.message); }">📥 Importar JSON Colado</button>
                    </div>
                </div>
            </div>
        `;
        initialSteps.forEach(st => this.addMacroBuilderStepRow(st));
    },

    // Transforma texto livre de inventário/notas (ex: "+12 atk", "2d6+7") em botões clicáveis de rolagem
    enrichTextWithRollButtons(escapedHtmlText) {
        if (!escapedHtmlText) return '';
        let out = String(escapedHtmlText);
        // 1. Expressões de dados NdX (+M)
        out = out.replace(/\b(\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?)\b/gi, (full, expr) => {
            const clean = expr.replace(/\s+/g, '');
            return `<button type="button" class="inline-roll-btn dmg-roll" onclick="event.stopPropagation(); CompendioDice.rollQuick('${clean}', 'Dano/Dado (${clean})', { isDamage: true })">🎲 ${expr}</button>`;
        });
        // 2. Bônus de ataque tipo "+12 atk" ou "+8 para atingir"
        out = out.replace(/([+-]\d{1,2})\s*(atk|to hit|para atingir)/gi, (full, bonus, suffix) => {
            return `<button type="button" class="inline-roll-btn hit-roll" onclick="event.stopPropagation(); CompendioDice.rollQuick('1d20${bonus}', 'Ataque (${bonus})')">🎯 ${bonus}</button> ${suffix}`;
        });
        return out;
    }
};

window.enrichTextWithRollButtons = (text) => CompendioDice.enrichTextWithRollButtons(text);
