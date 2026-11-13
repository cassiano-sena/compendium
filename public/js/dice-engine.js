/* =========================================================================
   FASE 1: MOTOR UNIVERSAL DE ROLAGEM DE DADOS & BANDEJA / LOG FLUTUANTE
   Suporta expressões complexas (NdX + Mod), Normal/Vantagem/Desvantagem,
   Dano Crítico dinâmico (via CompendioRules), Exaustão e Statblocks Clicáveis.
   ========================================================================= */

const STORAGE_KEY_DICELOG = 'compendio_rpg_dicelog_v1';

window.diceLogData = [];
window.diceTowerOpen = false;
window.diceRollMode = 'normal'; // 'normal' | 'adv' | 'dis'
window.diceCritActive = false;
window.diceSecretGm = false;

const CompendioDice = {
    init() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_DICELOG);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) window.diceLogData = parsed.slice(-80);
            }
        } catch (e) {}
        this.renderWidget();
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

    rollQuick(expr, label = 'Rolagem', opts = {}) {
        const cleanExpr = String(expr || '1d20').trim();
        const normalizedExpr = /^[+-]\d+$/.test(cleanExpr) ? `1d20${cleanExpr}` : cleanExpr;
        return this.rollExpression(normalizedExpr, label, opts);
    },

    rollExpression(rawExpr, label = 'Rolagem', options = {}) {
        let expr = String(rawExpr || '1d20').trim();
        if (/^[+-]\d+$/.test(expr)) expr = `1d20${expr}`;

        const player = (typeof getActivePlayer === 'function') ? getActivePlayer() : { id: 'gm-master', name: 'Mestre (GM)', role: 'gm' };
        const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { critRule: 'double-dice', exhaustionMode: '2024-penalty', exhaustionPenaltyPerLevel: -2 };

        const mode = options.mode || window.diceRollMode || 'normal';
        const isCrit = Boolean(options.isCrit ?? window.diceCritActive);
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
        const tokenRegex = /([+-]?)(?:(\d*)d(\d+)|(\d+))/gi;
        let match;
        let total = 0;
        const breakdownParts = [];
        let isNat20 = false;
        let isNat1 = false;
        let hasAnyMatch = false;

        while ((match = tokenRegex.exec(cleanFormula)) !== null) {
            if (!match[0]) continue;
            hasAnyMatch = true;
            const sign = match[1] === '-' ? -1 : 1;
            const signStr = sign < 0 ? '-' : (breakdownParts.length > 0 ? '+' : '');

            if (match[3] !== undefined) {
                // Termo de dado: NdX
                const baseCount = Math.max(1, parseInt(match[2] || '1', 10));
                const faces = Math.max(1, parseInt(match[3], 10));

                if (faces === 20 && baseCount === 1 && (hookPayload.mode === 'adv' || hookPayload.mode === 'dis')) {
                    const r1 = Math.floor(Math.random() * 20) + 1;
                    const r2 = Math.floor(Math.random() * 20) + 1;
                    const chosen = hookPayload.mode === 'adv' ? Math.max(r1, r2) : Math.min(r1, r2);
                    if (chosen === 20) isNat20 = true;
                    if (chosen === 1) isNat1 = true;
                    total += sign * chosen;
                    const tag = hookPayload.mode === 'adv' ? 'Vant' : 'Desv';
                    breakdownParts.push(`${signStr}2d20(${tag}: ${r1}, ${r2} ➔ ${chosen})`);
                } else {
                    let count = baseCount;
                    let maxBonus = 0;
                    if (hookPayload.isCrit && faces !== 20) {
                        if (rules.critRule === 'double-dice') {
                            count = baseCount * 2;
                        } else if (rules.critRule === 'max-plus-roll') {
                            maxBonus = baseCount * faces;
                        }
                    }

                    const rolls = [];
                    let sumRolls = 0;
                    for (let i = 0; i < count; i++) {
                        const r = Math.floor(Math.random() * faces) + 1;
                        rolls.push(r);
                        sumRolls += r;
                    }
                    if (faces === 20 && count === 1) {
                        if (rolls[0] === 20) isNat20 = true;
                        if (rolls[0] === 1) isNat1 = true;
                    }

                    const termTotal = sumRolls + maxBonus;
                    total += sign * termTotal;
                    if (maxBonus > 0) {
                        breakdownParts.push(`${signStr}${count}d${faces}[${rolls.join(',')}] + ${maxBonus}(Máx Crít)`);
                    } else {
                        breakdownParts.push(`${signStr}${count}d${faces}[${rolls.join(',')}]`);
                    }
                }
            } else if (match[4] !== undefined) {
                const modVal = parseInt(match[4], 10) || 0;
                total += sign * modVal;
                breakdownParts.push(`${signStr}${modVal}`);
            }
        }

        if (!hasAnyMatch) {
            if (typeof showToast === 'function') showToast('⚠️ Fórmula de dados inválida: ' + rawExpr);
            return null;
        }

        if (hookPayload.exhaustionMod !== 0) {
            total += hookPayload.exhaustionMod;
            breakdownParts.push(`${hookPayload.exhaustionMod}(Exaustão)`);
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
                                <button type="button" class="card-mini-btn" style="font-size:9.5px; padding:1px 4px; color:#ff9999;" onclick="CompendioDice.applyRollToTarget(${r.total}, false)" title="Aplicar este valor como DANO no Token selecionado ou Card atual">-Dano</button>
                                <button type="button" class="card-mini-btn" style="font-size:9.5px; padding:1px 4px; color:#8df596;" onclick="CompendioDice.applyRollToTarget(${r.total}, true)" title="Aplicar este valor como CURA no Token selecionado ou Card atual">+Cura</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || `<div style="color:#828699; font-size:11.5px; text-align:center; padding:14px;">Nenhuma rolagem ainda. Clique nos dados acima ou nos bônus das fichas!</div>`;

        const lastRoll = visibleLogs[0];
        const lastBadge = lastRoll
            ? ((lastRoll.isSecret && !isGm) ? '🔒' : `${lastRoll.total}`)
            : 'd20';

        container.innerHTML = `
            <div class="dice-tower-panel ${window.diceTowerOpen ? 'open' : ''}">
                <div class="dice-tower-header">
                    <span>🎲 Rolador & Log de Dados</span>
                    <div style="display:flex; gap:4px;">
                        <button type="button" class="card-mini-btn" onclick="CompendioDice.clearLog()" title="Limpar histórico de rolagens">🗑️</button>
                        <button type="button" class="card-mini-btn" onclick="CompendioDice.toggleTower()" title="Recolher">▼</button>
                    </div>
                </div>

                <!-- Modos de Rolagem (Normal / Vantagem / Desvantagem / Crítico / Oculto GM) -->
                <div class="dice-modes-bar">
                    <button type="button" class="vis-pill ${window.diceRollMode === 'normal' ? 'active-studied' : ''}" onclick="CompendioDice.setMode('normal')">Normal</button>
                    <button type="button" class="vis-pill ${window.diceRollMode === 'adv' ? 'active-studied' : ''}" onclick="CompendioDice.setMode('adv')" title="Rola 2d20 e escolhe o maior">🟢 Vantagem</button>
                    <button type="button" class="vis-pill ${window.diceRollMode === 'dis' ? 'active-hidden' : ''}" onclick="CompendioDice.setMode('dis')" title="Rola 2d20 e escolhe o menor">🔴 Desvant.</button>
                    <button type="button" class="vis-pill ${window.diceCritActive ? 'active-sighted' : ''}" onclick="CompendioDice.toggleCrit()" title="Aplica a regra de Dano Crítico ativa no próximo dado de dano">💥 Crítico</button>
                    ${isGm ? `<button type="button" class="vis-pill ${window.diceSecretGm ? 'active-hidden' : ''}" onclick="CompendioDice.toggleSecretGm()" title="Oculta o resultado desta rolagem para os jogadores">🔒 GM</button>` : ''}
                </div>

                <!-- Dados Rápidos -->
                <div class="dice-quick-grid">
                    ${[4, 6, 8, 10, 12, 20, 100].map(d => `
                        <button type="button" class="calc-btn dice-die-btn" onclick="CompendioDice.rollQuick('1d${d}', 'Dado d${d}')">d${d}</button>
                    `).join('')}
                </div>

                <!-- Fórmula Customizada -->
                <div style="display:flex; gap:4px; padding:0 8px 6px 8px;">
                    <input type="text" id="custom-dice-formula-input" class="form-control" style="flex:1; padding:4px 7px; font-size:11.5px;" placeholder="Ex: 2d6+4 ou 1d20+8" onkeydown="if(event.key==='Enter'){CompendioDice.rollFromCustomInput();}">
                    <button type="button" class="btn-summon-card" style="padding:4px 10px; font-size:11.5px;" onclick="CompendioDice.rollFromCustomInput()">Rolar</button>
                </div>

                <!-- Histórico / Feed de Rolagens -->
                <div class="dice-log-scroll">
                    ${logsHtml}
                </div>
            </div>

            <button type="button" class="rune-stone-trigger dice-tower-trigger" onclick="CompendioDice.toggleTower()" title="Abrir/Fechar Bandeja e Histórico de Dados">
                <span>🎲 Dados</span>
                <span class="rune-count-badge">${escapeHtmlText(String(lastBadge))}</span>
            </button>
        `;
    },

    rollFromCustomInput() {
        const inp = document.getElementById('custom-dice-formula-input');
        if (!inp) return;
        const val = inp.value.trim() || '1d20';
        this.rollQuick(val, `Fórmula (${val})`);
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
