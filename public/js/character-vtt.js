/* =========================================================================
   FASE 3 & FASE 4: FICHA DE PERSONAGEM AVANÇADA & TABLETOP 2D TÁTICO
   - Ficha: Rolagens clicáveis, Death Saves, Inspiração, Exaustão, Spell Slots,
     Recursos Recarregáveis (Curto/Longo), Calculadora PV Temp e Itens Vinculados.
   - Tabletop: Tokens 1x1..4x4, Régua Tática, Templates AoE, Fog of War e Ping.
   ========================================================================= */

window.tabletopToolMode = 'move'; // 'move' | 'ruler' | 'aoe' | 'fog' | 'ping'
window.aoeDraftConfig = { shape: 'circle', sizeSquares: 4, color: '#e65100', label: 'Esfera 6m (20ft)' };
window.activeRulerDrag = null;

function ensureCharacterExtendedFields(c) {
    if (!c || typeof c !== 'object') return c;
    if (c.inspiration === undefined) c.inspiration = false;
    if (c.exhaustion === undefined) c.exhaustion = 0;
    if (!c.deathSaves || typeof c.deathSaves !== 'object') {
        c.deathSaves = { successes: 0, failures: 0 };
    }
    if (!Array.isArray(c.customResources)) {
        c.customResources = [];
        // Popula recursos iniciais inteligentes baseados nas notas/classe se vazio
        if (/eldritch knight|fighter|guerreiro/i.test(c.classLevel || '')) {
            c.customResources.push(
                { id: 'res-sw', name: 'Retomar o Fôlego (Second Wind)', current: 2, max: 2, recharge: 'short' },
                { id: 'res-as', name: 'Surto de Ação (Action Surge)', current: 1, max: 1, recharge: 'short' }
            );
        } else if (/barbarian|b[áa]rbaro/i.test(c.classLevel || '')) {
            c.customResources.push(
                { id: 'res-rage', name: 'Fúria (Rage)', current: 4, max: 4, recharge: 'long' }
            );
        } else if (/paladin|cleric|cl[ée]rigo/i.test(c.classLevel || '')) {
            c.customResources.push(
                { id: 'res-cd', name: 'Canalizar Divindade', current: 2, max: 2, recharge: 'short' }
            );
        }
    }
    if (!c.spellSlots || typeof c.spellSlots !== 'object') {
        c.spellSlots = {};
        for (let lvl = 1; lvl <= 9; lvl++) {
            c.spellSlots[lvl] = { current: 0, max: 0 };
        }
        if (/mago|wizard|cleric|cl[ée]rigo|eldritch|paladin|warlock|bruxo/i.test(c.classLevel || '')) {
            c.spellSlots[1] = { current: 4, max: 4 };
            if ((Number(c.level) || 1) >= 3 || /13|20/.test(c.classLevel || '')) {
                c.spellSlots[2] = { current: 3, max: 3 };
                c.spellSlots[3] = { current: 2, max: 2 };
            }
        }
    }
    if (!Array.isArray(c.linkedItems)) {
        c.linkedItems = [];
    }
    return c;
}

function applyCharacterDamageOrHeal(charId, isDamage) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    const inp = document.getElementById(`char-quick-hp-delta-${charId}`);
    const amount = Math.max(0, parseInt(inp?.value || '0', 10) || 0);
    if (!amount) return;

    if (isDamage) {
        let remaining = amount;
        const curTemp = Number(c.hpTemp) || 0;
        if (curTemp > 0) {
            const absorbed = Math.min(curTemp, remaining);
            c.hpTemp = curTemp - absorbed;
            remaining -= absorbed;
        }
        c.hpCurrent = Math.max(0, (Number(c.hpCurrent) || 0) - remaining);
        if (c.hpCurrent > 0) {
            c.deathSaves = { successes: 0, failures: 0 };
        }
    } else {
        c.hpCurrent = Math.min(Number(c.hpMax) || 10, (Number(c.hpCurrent) || 0) + amount);
        if (c.hpCurrent > 0) {
            c.deathSaves = { successes: 0, failures: 0 };
        }
    }

    if (inp) inp.value = '';
    syncCombatEntityHp(charId, c.hpCurrent, c.hpMax);
    showToast(`${isDamage ? '🩸 -' : '💚 +'}${amount} PV aplicado em ${c.name}!`);
}

function toggleCharacterInspiration(charId, checked) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    c.inspiration = Boolean(checked);
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
    showToast(c.inspiration ? `🌟 ${c.name} recebeu Inspiração Heroica!` : `Inspiração Heroica gasta por ${c.name}.`);
}

function adjustCharacterExhaustion(charId, delta) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    const maxEx = (typeof CompendioRules !== 'undefined') ? (Number(CompendioRules.getEffectiveRules().exhaustionMaxLevel) || 6) : 6;
    c.exhaustion = Math.max(0, Math.min(maxEx, (Number(c.exhaustion) || 0) + delta));
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

function setCharacterDeathSave(charId, type, count) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    const current = c.deathSaves[type] || 0;
    c.deathSaves[type] = (current === count) ? count - 1 : count;
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

function rollCharacterDeathSave(charId) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    const res = CompendioDice.rollExpression('1d20', `Salvaguarda contra a Morte (${c.name})`, {
        actorName: c.name,
        charId: c.id
    });
    if (!res) return;

    if (res.isNat20) {
        c.hpCurrent = 1;
        c.deathSaves = { successes: 0, failures: 0 };
        syncCombatEntityHp(c.id, 1, c.hpMax);
        showToast(`🌟 20 NATURAL! ${c.name} recobra a consciência com 1 PV!`);
        return;
    }
    if (res.isNat1) {
        c.deathSaves.failures = Math.min(3, (c.deathSaves.failures || 0) + 2);
    } else if (res.total >= 10) {
        c.deathSaves.successes = Math.min(3, (c.deathSaves.successes || 0) + 1);
    } else {
        c.deathSaves.failures = Math.min(3, (c.deathSaves.failures || 0) + 1);
    }

    if (c.deathSaves.successes >= 3) {
        showToast(`🛡️ ${c.name} alcançou 3 sucessos e está Estabilizado!`);
    } else if (c.deathSaves.failures >= 3) {
        showToast(`💀 ${c.name} acumulou 3 falhas contra a morte!`);
    }
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

function adjustCharacterSpellSlot(charId, level, field, value) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    if (!c.spellSlots[level]) c.spellSlots[level] = { current: 0, max: 0 };
    if (field === 'max') {
        const m = Math.max(0, Math.min(9, parseInt(value, 10) || 0));
        c.spellSlots[level].max = m;
        if (c.spellSlots[level].current > m) c.spellSlots[level].current = m;
    } else {
        const m = c.spellSlots[level].max || 0;
        c.spellSlots[level].current = Math.max(0, Math.min(m, parseInt(value, 10) || 0));
    }
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

function addCharacterCustomResource(charId) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    const nameEl = document.getElementById(`new-res-name-${charId}`);
    const maxEl = document.getElementById(`new-res-max-${charId}`);
    const recEl = document.getElementById(`new-res-rec-${charId}`);
    const name = (nameEl?.value || '').trim();
    if (!name) {
        showToast('Digite o nome do recurso (ex: Surto de Ação, Ki, Feitiçaria)!');
        return;
    }
    const max = Math.max(1, parseInt(maxEl?.value || '1', 10) || 1);
    const recharge = recEl?.value || 'short';
    c.customResources.push({
        id: 'res-' + Date.now().toString(36),
        name,
        current: max,
        max,
        recharge
    });
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

function adjustCharacterCustomResource(charId, resId, delta) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    const r = c.customResources.find(x => x.id === resId);
    if (!r) return;
    r.current = Math.max(0, Math.min(r.max, (Number(r.current) || 0) + delta));
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

function removeCharacterCustomResource(charId, resId) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    c.customResources = c.customResources.filter(x => x.id !== resId);
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

function linkCompendiumItemToCharacter(charId, selectVal) {
    if (!selectVal) return;
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    const [category, groupKey, itemKey, title] = selectVal.split('|');
    if (!c.linkedItems.some(i => i.itemKey === itemKey)) {
        c.linkedItems.push({ category, groupKey, itemKey, title });
        if (!String(c.inventory || '').includes(title)) {
            c.inventory = (c.inventory ? c.inventory + '\n' : '') + `• ${title} (Item do Compêndio)`;
        }
    }
    // Se o Mestre vinculou um item ao jogador, garante pelo menos nível 'studied' para esse jogador
    const knowRec = getEntityKnowledgeRecord(category, itemKey);
    if (!knowRec.playerLevels) knowRec.playerLevels = {};
    knowRec.playerLevels[c.ownerId] = 'studied';

    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    CompendioNetAdapter.broadcastKnowledge();
    renderCharacterModule();
    showToast(`🎒 "${title}" adicionado à mochila de ${c.name}!`);
}

function unlinkCompendiumItemFromCharacter(charId, itemKey) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    c.linkedItems = c.linkedItems.filter(i => i.itemKey !== itemKey);
    saveLocalPersistence();
    CompendioNetAdapter.broadcastCharacters();
    renderCharacterModule();
}

// Sobrescreve shortRestCharacter e longRestCharacter para usar CompendioDice, CompendioRules e recarregar recursos
function shortRestCharacter(charId) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);

    // Recarrega recursos de descanso curto mesmo se não tiver dados de vida
    let rechargedCount = 0;
    c.customResources.forEach(r => {
        if (r.recharge === 'short' && r.current < r.max) {
            r.current = r.max;
            rechargedCount++;
        }
    });

    if ((c.hitDieCurrent || 0) <= 0) {
        saveLocalPersistence();
        CompendioNetAdapter.broadcastCharacters();
        renderCharacterModule();
        showToast(rechargedCount > 0
            ? `⛺ Descanso Curto (${c.name}): ${rechargedCount} recurso(s) recarregado(s) (0 Dados de Vida restantes).`
            : '⚠️ Sem Dados de Vida restantes para gastar no Descanso Curto!');
        return;
    }

    const die = Number(c.hitDieType) || 8;
    const conMod = calcAbilityMod(c.stats?.con || 10);
    const signStr = conMod >= 0 ? `+${conMod}` : `${conMod}`;
    const rollRes = CompendioDice.rollExpression(`1d${die}${signStr}`, `Dado de Vida — Descanso Curto (${c.name})`, {
        actorName: c.name,
        charId: c.id,
        skipExhaustion: true
    });
    const heal = Math.max(1, rollRes ? rollRes.total : (Math.floor(Math.random() * die) + 1 + conMod));

    c.hitDieCurrent = Math.max(0, (c.hitDieCurrent || 1) - 1);
    c.hpCurrent = Math.min(c.hpMax, (Number(c.hpCurrent) || 0) + heal);
    c.lastHitDieRoll = `1d${die} (${formatSigned(conMod)}) = +${heal} PV`;

    if (typeof CompendioModAPI !== 'undefined') {
        CompendioModAPI.runHooks('onShortRest', c);
    }

    syncCombatEntityHp(charId, c.hpCurrent, c.hpMax);
    showToast(`⛺ Descanso Curto (${c.name}): +${heal} PV e recursos de descanso curto restaurados!`);
}

function longRestCharacter(charId, silent = false) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || (!silent && !canAccessFullCharacterSheet(c))) return;
    ensureCharacterExtendedFields(c);

    const rules = (typeof CompendioRules !== 'undefined')
        ? CompendioRules.getEffectiveRules()
        : { longRestHpPercent: 100, longRestHitDicePercent: 100 };

    const hpPct = Number(rules.longRestHpPercent ?? 100) / 100;
    const hdPct = Number(rules.longRestHitDicePercent ?? 100) / 100;

    if (hpPct >= 1) {
        c.hpCurrent = Number(c.hpMax) || 10;
    } else if (hpPct > 0) {
        const healAmt = Math.max(1, Math.floor((Number(c.hpMax) || 10) * hpPct));
        c.hpCurrent = Math.min(Number(c.hpMax) || 10, (Number(c.hpCurrent) || 0) + healAmt);
    }

    c.hpTemp = 0;
    c.deathSaves = { successes: 0, failures: 0 };
    if ((Number(c.exhaustion) || 0) > 0) {
        c.exhaustion = Math.max(0, Number(c.exhaustion) - 1);
    }

    const maxHD = Math.max(1, Number(c.hitDieMax) || 1);
    const recHD = hdPct > 0 ? Math.max(1, Math.floor(maxHD * hdPct)) : 0;
    c.hitDieCurrent = Math.min(maxHD, (Number(c.hitDieCurrent) || 0) + recHD);
    c.lastHitDieRoll = `Descanso Longo (+${recHD} DV)`;

    // Recarrega todos os recursos e espaços de magia
    c.customResources.forEach(r => { r.current = r.max; });
    for (let lvl = 1; lvl <= 9; lvl++) {
        if (c.spellSlots[lvl]) c.spellSlots[lvl].current = c.spellSlots[lvl].max || 0;
    }

    if (typeof CompendioModAPI !== 'undefined') {
        CompendioModAPI.runHooks('onLongRest', c);
    }

    syncCombatEntityHp(charId, c.hpCurrent, c.hpMax);
    if (!silent) {
        showToast(`🌙 Descanso Longo (${c.name}): PV (${rules.longRestHpPercent}%), +${recHD} DV, Magias e Recursos restaurados!`);
    }
}

// Sobrescreve renderCharacterModule com todos os recursos da Fase 3
function renderCharacterModule() {
    const player = getActivePlayer();
    const isGm = player && player.role === 'gm';
    const allChars = charactersData;
    const listTitleEl = document.getElementById('dynamic-list-title');
    if (listTitleEl) {
        listTitleEl.textContent = isGm
            ? `Personagens (Todos: ${allChars.length})`
            : `Grupo (${player ? player.name : 'Jogador'})`;
    }

    if (!activeCharacterId || !allChars.some(c => c.id === activeCharacterId)) {
        const ownChar = allChars.find(c => c.ownerId === activePlayerId);
        activeCharacterId = (ownChar || allChars[0])?.id || null;
    }

    const listEl = document.getElementById('dynamic-item-list');
    if (listEl) {
        listEl.innerHTML = allChars.map(c => {
            const isAct = c.id === activeCharacterId ? 'active' : '';
            const isMine = canAccessFullCharacterSheet(c);
            const statusBadge = isMine
                ? `<span class="list-item-folder-badge" style="color:#8df596;">${c.hpCurrent}/${c.hpMax} PV</span>`
                : `<span class="list-item-folder-badge" style="color:#f2cf83;">${describeQualitativeHealth(c.hpCurrent, c.hpMax, 'pc')}</span>`;
            return `
                <li class="list-item ${isAct}" data-title="${escapeHtmlText(c.name.toLowerCase())}" onclick="selectCharacter('${c.id}')">
                    <span>${isMine ? '🛡️' : '👁️'} ${escapeHtmlText(c.name)}</span>
                    <div class="list-item-right">
                        <span class="list-item-folder-badge">${escapeHtmlText(c.ownerName || 'Jogador')}</span>
                        ${statusBadge}
                    </div>
                </li>
            `;
        }).join('') || '<li class="list-item" style="color:#828699;">Nenhum personagem cadastrado</li>';
    }

    const displayArea = document.getElementById('dynamic-display-area');
    const activeChar = allChars.find(c => c.id === activeCharacterId);

    const testFilesDropdown = `
        <select class="form-control" style="width:auto; max-width:215px; padding:4px 8px; font-size:11.5px; border-color:#d8b467;" onchange="if(this.value){importTestFileFromPublic(this.value); this.value='';}" title="Testar importação direta dos arquivos da pasta public/import-tests/">
            <option value="">🧪 Testar Pasta import-tests/...</option>
            <option value="kael-varhen-ek-13-v2.pdf">📄 kael-varhen-ek-13-v2.pdf (EN)</option>
            <option value="kiriton.pdf">📄 kiriton.pdf (PT-BR)</option>
            <option value="character-sheet.pdf">📄 character-sheet.pdf (Auxiz)</option>
            <option value="La Loba.pdf">📄 La Loba.pdf (Lvl 22)</option>
            <option value="DnD_2024_Character-Sheet (PT-BR).pdf">📄 DnD_2024_Character-Sheet (PT-BR).pdf</option>
            <option value="astel.html">🌐 astel.html (Ficha HTML)</option>
            <option value="animated-armor.json">📋 animated-armor.json (5etools)</option>
        </select>
    `;

    if (!activeChar) {
        displayArea.innerHTML = `
            <div class="info-container">
                <h2 class="info-title">🛡️ Personagens (${escapeHtmlText(player ? player.name : '')})</h2>
                <p class="info-text">Nenhum personagem cadastrado ainda. Crie uma ficha do zero ou importe um arquivo <strong>.JSON</strong>, <strong>.PDF</strong> ou <strong>.HTML</strong>.</p>
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <button type="button" class="btn-summon-card" style="padding:10px 18px;" onclick="createNewCharacterForActivePlayer()">＋ Criar Ficha de Personagem</button>
                    <button type="button" class="btn-action-bar" style="padding:10px 18px;" onclick="document.getElementById('universal-sheet-import-input').click()">📥 Importar (.JSON / .PDF / .HTML)</button>
                    ${testFilesDropdown}
                </div>
            </div>
        `;
        return;
    }

    ensureCharacterExtendedFields(activeChar);

    if (!canAccessFullCharacterSheet(activeChar)) {
        displayArea.innerHTML = `
            <div class="info-container" style="max-width:720px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:2px groove var(--border-color); padding-bottom:10px; margin-bottom:14px;">
                    <div>
                        <h2 class="info-title" style="margin:0; border:none; padding:0;">👁️ ${escapeHtmlText(activeChar.name)} (Visão Pública de Grupo)</h2>
                        <div style="font-size:12px; color:#a0a4b8; margin-top:4px;">
                            Personagem controlado por: <strong>${escapeHtmlText(activeChar.ownerName)}</strong>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <button type="button" class="btn-summon-card" onclick="createNewCharacterForActivePlayer()">＋ Criar Meu Personagem</button>
                        <button type="button" class="btn-action-bar" onclick="document.getElementById('universal-sheet-import-input').click()">📥 Importar (.JSON / .PDF / .HTML)</button>
                        ${testFilesDropdown}
                    </div>
                </div>
                <div class="form-section">
                    <p style="font-size:14px; margin:6px 0;"><strong>Raça / Origem:</strong> ${escapeHtmlText(activeChar.race || 'Desconhecido')}</p>
                    <p style="font-size:14px; margin:6px 0;"><strong>Classe / Arquétipo:</strong> ${escapeHtmlText(activeChar.classLevel || 'Aventureiro')}</p>
                    <p style="font-size:14px; margin:6px 0;"><strong>Estado Aparente:</strong> ${describeQualitativeHealth(activeChar.hpCurrent, activeChar.hpMax, 'pc')}</p>
                </div>
                <div class="knowledge-seal-box">
                    <strong>🔒 Ficha Privada de Outro Jogador</strong>
                    <p style="font-size:12.5px; margin:6px 0 0 0; color:#b8b2a6;">
                        Atributos exatos, pontos de vida numéricos, inventário e anotações pessoais pertencem apenas a <strong>${escapeHtmlText(activeChar.ownerName)}</strong> e ao <strong>Mestre (GM)</strong>.
                    </p>
                </div>
            </div>
        `;
        return;
    }

    const stats = activeChar.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const dexMod = calcAbilityMod(stats.dex);
    const wisMod = calcAbilityMod(stats.wis);
    const exPen = (typeof CompendioRules !== 'undefined') ? CompendioRules.getExhaustionPenalty(activeChar.exhaustion) : 0;
    const totalInit = dexMod + (Number(activeChar.initiativeBonus) || 0);
    const passivePerception = 10 + wisMod + (Number(activeChar.passivePerceptionBonus) || 0) + exPen;
    const percMod = wisMod + (Number(activeChar.passivePerceptionBonus) || 0);

    const ownerOptions = playersData.map(p =>
        `<option value="${escapeHtmlText(p.id)}" ${p.id === activeChar.ownerId ? 'selected' : ''}>${escapeHtmlText(p.name)}</option>`
    ).join('');

    const statLabels = [
        { key: 'str', label: 'FOR', full: 'Força' },
        { key: 'dex', label: 'DES', full: 'Destreza' },
        { key: 'con', label: 'CON', full: 'Constituição' },
        { key: 'int', label: 'INT', full: 'Inteligência' },
        { key: 'wis', label: 'SAB', full: 'Sabedoria' },
        { key: 'cha', label: 'CAR', full: 'Carisma' }
    ];

    const compendiumItems = getAllCatalogEntities(['items']);
    const itemSelectOptions = `<option value="">🎒 + Vincular Item do Compêndio...</option>` +
        compendiumItems.map(i => `<option value="${i.category}|${i.groupKey}|${i.itemKey}|${escapeHtmlText(i.title)}">⚔️ ${escapeHtmlText(i.title)}</option>`).join('');

    const linkedItemsChips = (activeChar.linkedItems || []).map(it => `
        <span class="effect-tag" style="background:#263345; border-color:#6389b0; font-size:11.5px; padding:3px 8px; cursor:pointer;" onclick="activeModule='compendium'; updateMainModuleButtonsUI(); jumpToCatalogEntity('${it.category}', '${it.groupKey}', '${it.itemKey}')" title="Clique para abrir a ficha deste item no Compêndio">
            ⚔️ ${escapeHtmlText(it.title)}
            <button type="button" onclick="event.stopPropagation(); unlinkCompendiumItemFromCharacter('${activeChar.id}', '${it.itemKey}')" title="Desvincular item">✕</button>
        </span>
    `).join('');

    // Renderização de Recursos de Classe / Mods
    const resourcesHtml = (activeChar.customResources || []).map(res => {
        const recLabel = res.recharge === 'short' ? '⛺ Curto' : '🌙 Longo';
        return `
            <div style="background:#18191f; border:1px solid #3c3e4a; border-radius:6px; padding:7px 10px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>
                    <strong style="font-size:12px; color:#f2cf83;">${escapeHtmlText(res.name)}</strong>
                    <span class="list-item-folder-badge" style="margin-left:5px; font-size:10px;">${recLabel}</span>
                </div>
                <div style="display:flex; align-items:center; gap:5px;">
                    <span style="font-weight:bold; font-size:13px; color:#8df596;">${res.current} / ${res.max}</span>
                    <button type="button" class="card-mini-btn" onclick="adjustCharacterCustomResource('${activeChar.id}', '${res.id}', -1)">-1</button>
                    <button type="button" class="card-mini-btn" onclick="adjustCharacterCustomResource('${activeChar.id}', '${res.id}', 1)">+1</button>
                    <button type="button" class="card-mini-btn" style="color:#ff8a80;" onclick="removeCharacterCustomResource('${activeChar.id}', '${res.id}')">✕</button>
                </div>
            </div>
        `;
    }).join('');

    // Renderização de Spell Slots (1º ao 9º Círculo)
    const spellSlotsHtml = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(lvl => {
        const sl = activeChar.spellSlots[lvl] || { current: 0, max: 0 };
        return `
            <div style="background:#18191f; border:1px solid ${sl.max > 0 ? '#5a5d6b' : '#2b2d38'}; border-radius:5px; padding:5px; text-align:center; opacity:${sl.max > 0 ? '1' : '0.65'};">
                <div style="font-size:10.5px; color:#d8b467; font-weight:bold; margin-bottom:3px;">${lvl}º Círculo</div>
                <div style="display:flex; justify-content:center; align-items:center; gap:3px;">
                    <input type="number" class="card-hp-input" style="width:28px;" min="0" max="9" value="${sl.current}" title="Espaços disponíveis" onchange="adjustCharacterSpellSlot('${activeChar.id}', ${lvl}, 'current', this.value)">
                    <span style="color:#888;">/</span>
                    <input type="number" class="card-hp-input" style="width:28px;" min="0" max="9" value="${sl.max}" title="Espaços máximos" onchange="adjustCharacterSpellSlot('${activeChar.id}', ${lvl}, 'max', this.value)">
                </div>
            </div>
        `;
    }).join('');

    // Atalhos interativos de rolagens extraídos do inventário (ataques e danos)
    const parsedQuickRollsHtml = (typeof CompendioDice !== 'undefined' && activeChar.inventory)
        ? CompendioDice.enrichTextWithRollButtons(escapeHtmlText(activeChar.inventory)).replace(/\n/g, '<br>')
        : '';

    const exDesc = (typeof CompendioRules !== 'undefined')
        ? CompendioRules.describeExhaustion(activeChar.exhaustion)
        : '';

    displayArea.innerHTML = `
        <div class="info-container" style="max-width:980px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:2px groove var(--border-color); padding-bottom:10px; margin-bottom:14px;">
                <div>
                    <h2 class="info-title" style="margin:0; border:none; padding:0;">🛡️ ${escapeHtmlText(activeChar.name)}</h2>
                    <div style="font-size:11px; color:#a0a4b8; margin-top:2px;">
                        Jogador Responsável: <strong>${escapeHtmlText(activeChar.ownerName)}</strong> (${escapeHtmlText(activeChar.ownerId)})
                    </div>
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                    ${testFilesDropdown}
                    <button type="button" class="btn-action-bar" onclick="document.getElementById('universal-sheet-import-input').click()">📥 Importar (.JSON / .PDF / .HTML)</button>
                    <button type="button" class="btn-action-bar" onclick="exportCharacterJson('${activeChar.id}')">📤 Exportar .JSON</button>
                    <button type="button" class="btn-summon-card" onclick="sendCharacterToTabletop('${activeChar.id}')">🎲 Enviar ao Tabletop</button>
                    <button type="button" class="btn-action-bar" onclick="shortRestCharacter('${activeChar.id}')" title="Gasta 1 Dado de Vida e recarrega recursos de descanso curto">⛺ Descanso Curto</button>
                    <button type="button" class="btn-action-bar" onclick="longRestCharacter('${activeChar.id}')" title="Restaura PV, Dados de Vida, Magias e reduz 1 Exaustão">🌙 Descanso Longo</button>
                    <button type="button" class="btn-action-bar danger" onclick="deleteCharacter('${activeChar.id}')">🗑️ Excluir</button>
                </div>
            </div>

            <!-- Dados Básicos -->
            <div class="form-section">
                <h3 class="form-section-title">Identidade & Características Base</h3>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>Nome do Personagem</label>
                        <input type="text" class="form-control" value="${escapeHtmlText(activeChar.name)}" onchange="updateCharacterField('${activeChar.id}', 'name', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Raça / Origem</label>
                        <input type="text" class="form-control" value="${escapeHtmlText(activeChar.race || '')}" onchange="updateCharacterField('${activeChar.id}', 'race', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Classe & Nível</label>
                        <input type="text" class="form-control" value="${escapeHtmlText(activeChar.classLevel || '')}" onchange="updateCharacterField('${activeChar.id}', 'classLevel', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Jogador Dono (Identidade)</label>
                        <select class="form-control" ${isGm ? '' : 'disabled'} onchange="updateCharacterOwner('${activeChar.id}', this.value)">${ownerOptions}</select>
                    </div>
                    <div class="form-group">
                        <label>Deslocamento</label>
                        <input type="text" class="form-control" value="${escapeHtmlText(activeChar.speed || '9m')}" onchange="updateCharacterField('${activeChar.id}', 'speed', this.value)">
                    </div>
                    <div class="form-group">
                        <label>Classe de Armadura (CA)</label>
                        <input type="number" class="form-control" value="${Number(activeChar.ac) || 10}" onchange="updateCharacterField('${activeChar.id}', 'ac', Number(this.value))">
                    </div>
                </div>
            </div>

            <!-- Vitalidade, Calculadora Rápida de PV, Iniciativa e Percepção -->
            <div class="form-section">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; border-bottom:1px solid #383a45; padding-bottom:6px;">
                    <h3 class="form-section-title" style="margin:0; border:none; padding:0;">Vitalidade, Iniciativa, Percepção & Dados de Vida</h3>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <input type="number" id="char-quick-hp-delta-${activeChar.id}" class="form-control" style="width:75px; padding:3px 6px; font-size:12px;" placeholder="Qtd PV" min="1" onkeydown="if(event.key==='Enter'){applyCharacterDamageOrHeal('${activeChar.id}', true);}">
                        <button type="button" class="btn-card-dmg" style="padding:4px 10px;" onclick="applyCharacterDamageOrHeal('${activeChar.id}', true)">🩸 - Dano</button>
                        <button type="button" class="btn-card-heal" style="padding:4px 10px;" onclick="applyCharacterDamageOrHeal('${activeChar.id}', false)">💚 + Cura</button>
                    </div>
                </div>
                <div class="form-grid-3">
                    <div class="form-group">
                        <label>PV Atual / PV Máximo</label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input type="number" class="form-control" value="${Number(activeChar.hpCurrent) || 0}" onchange="updateCharacterField('${activeChar.id}', 'hpCurrent', Number(this.value))">
                            <span>/</span>
                            <input type="number" class="form-control" value="${Number(activeChar.hpMax) || 1}" onchange="updateCharacterField('${activeChar.id}', 'hpMax', Number(this.value))">
                        </div>
                    </div>
                    <div class="form-group">
                        <label style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Iniciativa: <strong style="color:#f2cf83;">${formatSigned(totalInit)}</strong></span>
                            <button type="button" class="inline-roll-btn hit-roll" onclick="CompendioDice.rollQuick('1d20${formatSigned(totalInit)}', 'Iniciativa (${escapeHtmlText(activeChar.name)})', { charId: '${activeChar.id}' })">🎲 Rolar</button>
                        </label>
                        <input type="number" class="form-control" value="${Number(activeChar.initiativeBonus) || 0}" title="Bônus extra de Iniciativa além de DES" onchange="updateCharacterField('${activeChar.id}', 'initiativeBonus', Number(this.value))">
                    </div>
                    <div class="form-group">
                        <label style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Percepção Passiva: <strong style="color:#8df596;">${passivePerception}</strong></span>
                            <button type="button" class="inline-roll-btn dice-roll" onclick="CompendioDice.rollQuick('1d20${formatSigned(percMod)}', 'Percepção (${escapeHtmlText(activeChar.name)})', { charId: '${activeChar.id}' })">🎲 Rolar</button>
                        </label>
                        <input type="number" class="form-control" value="${Number(activeChar.passivePerceptionBonus) || 0}" title="Bônus de Proficiência/Especialização em Percepção" onchange="updateCharacterField('${activeChar.id}', 'passivePerceptionBonus', Number(this.value))">
                    </div>
                    <div class="form-group">
                        <label>Dados de Vida (Atual / Máx)</label>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <input type="number" class="form-control" value="${Number(activeChar.hitDieCurrent) ?? 1}" onchange="updateCharacterField('${activeChar.id}', 'hitDieCurrent', Number(this.value))">
                            <span>/</span>
                            <input type="number" class="form-control" value="${Number(activeChar.hitDieMax) || 1}" onchange="updateCharacterField('${activeChar.id}', 'hitDieMax', Number(this.value))">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Tipo de Dado de Vida</label>
                        <select class="form-control" onchange="updateCharacterField('${activeChar.id}', 'hitDieType', Number(this.value))">
                            <option value="6" ${Number(activeChar.hitDieType) === 6 ? 'selected' : ''}>d6</option>
                            <option value="8" ${Number(activeChar.hitDieType) === 8 ? 'selected' : ''}>d8</option>
                            <option value="10" ${Number(activeChar.hitDieType) === 10 ? 'selected' : ''}>d10</option>
                            <option value="12" ${Number(activeChar.hitDieType) === 12 ? 'selected' : ''}>d12</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>PV Temporário (absorve dano 1º)</label>
                        <input type="number" class="form-control" value="${Number(activeChar.hpTemp) || 0}" onchange="updateCharacterField('${activeChar.id}', 'hpTemp', Number(this.value))">
                    </div>
                </div>
            </div>

            <!-- Inspiração, Exaustão & Salvaguardas contra a Morte -->
            <div class="form-section">
                <h3 class="form-section-title">Sobrevivência: Inspiração Heroica, Exaustão & Testes contra a Morte</h3>
                <div class="form-grid-3" style="align-items:center;">
                    <div style="background:#18191f; padding:10px; border-radius:6px; border:1px solid ${activeChar.inspiration ? '#d8b467' : '#3c3e4a'};">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:${activeChar.inspiration ? '#f2cf83' : '#e2e4ec'}; font-weight:bold;">
                            <input type="checkbox" ${activeChar.inspiration ? 'checked' : ''} onchange="toggleCharacterInspiration('${activeChar.id}', this.checked)">
                            🌟 Inspiração Heroica ${activeChar.inspiration ? '(ATIVA)' : ''}
                        </label>
                        <div style="font-size:11px; color:#9da2b8; margin-top:4px;">Permite rerrolar qualquer dado ou conceder vantagem.</div>
                    </div>

                    <div style="background:#18191f; padding:10px; border-radius:6px; border:1px solid ${activeChar.exhaustion > 0 ? '#c95b0c' : '#3c3e4a'};">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:12px; color:#f2cf83;">📉 Exaustão: Nível ${activeChar.exhaustion || 0}</strong>
                            <div style="display:flex; gap:4px;">
                                <button type="button" class="card-mini-btn" onclick="adjustCharacterExhaustion('${activeChar.id}', -1)">-</button>
                                <button type="button" class="card-mini-btn" onclick="adjustCharacterExhaustion('${activeChar.id}', 1)">+</button>
                            </div>
                        </div>
                        <div style="font-size:11px; color:${activeChar.exhaustion > 0 ? '#ffb74d' : '#9da2b8'}; margin-top:4px;">
                            ${escapeHtmlText(exDesc)}
                        </div>
                    </div>

                    <div style="background:#18191f; padding:10px; border-radius:6px; border:1px solid ${activeChar.hpCurrent <= 0 ? '#ad4c46' : '#3c3e4a'};">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            <strong style="font-size:12px; color:#ff8a80;">💀 Testes de Morte</strong>
                            <button type="button" class="inline-roll-btn hit-roll" onclick="rollCharacterDeathSave('${activeChar.id}')">🎲 Rolar d20</button>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:11.5px;">
                            <span>Sucessos:
                                ${[1, 2, 3].map(n => `<button type="button" class="card-mini-btn" style="background:${(activeChar.deathSaves.successes || 0) >= n ? '#2e7d32' : '#222'}; color:#fff;" onclick="setCharacterDeathSave('${activeChar.id}', 'successes', ${n})">✓</button>`).join(' ')}
                            </span>
                            <span>Falhas:
                                ${[1, 2, 3].map(n => `<button type="button" class="card-mini-btn" style="background:${(activeChar.deathSaves.failures || 0) >= n ? '#c62828' : '#222'}; color:#fff;" onclick="setCharacterDeathSave('${activeChar.id}', 'failures', ${n})">✕</button>`).join(' ')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Atributos Clicáveis para Rolagem -->
            <div class="form-section">
                <h3 class="form-section-title">Atributos Principais (Clique em 🎲 para Rolar Teste ou Salvaguarda)</h3>
                <div class="form-grid-6">
                    ${statLabels.map(st => {
                        const val = Number(stats[st.key]) || 10;
                        const mod = calcAbilityMod(val);
                        const signed = formatSigned(mod);
                        return `
                            <div class="form-group" style="text-align:center; background:#18191f; padding:8px; border-radius:6px; border:1px solid #3c3e4a;">
                                <label style="font-size:12px; color:#f2cf83;">${st.label} (${signed})</label>
                                <input type="number" class="form-control" style="text-align:center; font-weight:bold;" value="${val}" onchange="updateCharacterStat('${activeChar.id}', '${st.key}', Number(this.value))">
                                <button type="button" class="inline-roll-btn hit-roll" style="margin-top:4px; width:100%; justify-content:center;" onclick="CompendioDice.rollQuick('1d20${signed}', 'Teste de ${st.full} (${escapeHtmlText(activeChar.name)})', { charId: '${activeChar.id}' })">🎲 ${signed}</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Recursos Recarregáveis & Espaços de Magia (Spell Slots) -->
            <div class="form-section">
                <h3 class="form-section-title">Recursos de Classe & Espaços de Magia (Recarregam nos Descansos)</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px; margin-bottom:10px;">
                    ${resourcesHtml}
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
                    <input type="text" id="new-res-name-${activeChar.id}" class="form-control" style="flex:2; min-width:160px; padding:4px 8px; font-size:12px;" placeholder="Novo recurso (ex: Surto de Ação, Ki, Feitiçaria)...">
                    <input type="number" id="new-res-max-${activeChar.id}" class="form-control" style="width:70px; padding:4px 8px; font-size:12px;" value="2" min="1" title="Usos Máximos">
                    <select id="new-res-rec-${activeChar.id}" class="form-control" style="width:auto; padding:4px 8px; font-size:12px;">
                        <option value="short">⛺ Recarrega no Curto</option>
                        <option value="long">🌙 Recarrega no Longo</option>
                    </select>
                    <button type="button" class="btn-action-bar" onclick="addCharacterCustomResource('${activeChar.id}')">＋ Recurso</button>
                </div>

                <label style="font-size:11.5px; color:#b8bccf; font-weight:bold; display:block; margin-bottom:6px;">✨ Espaços de Magia (Spell Slots — 1º ao 9º Círculo)</label>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(88px, 1fr)); gap:6px;">
                    ${spellSlotsHtml}
                </div>
            </div>

            <!-- Inventário, Armas Clicáveis e Notas -->
            <div class="form-section">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                    <h3 class="form-section-title" style="margin:0; border:none; padding:0;">Equipamentos, Armas Clicáveis & Anotações</h3>
                    <select class="form-control" style="width:auto; max-width:260px; padding:4px 8px; font-size:11.5px;" onchange="linkCompendiumItemToCharacter('${activeChar.id}', this.value); this.value='';">
                        ${itemSelectOptions}
                    </select>
                </div>

                ${linkedItemsChips ? `
                    <div style="margin-bottom:10px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <span style="font-size:11px; color:#9da2b8;">🎒 Itens do Compêndio na Mochila:</span>
                        ${linkedItemsChips}
                    </div>
                ` : ''}

                ${parsedQuickRollsHtml ? `
                    <div style="background:#14151a; border:1px solid #3c3e4a; border-radius:6px; padding:8px 12px; margin-bottom:10px; font-size:12px; line-height:1.7;">
                        <div style="font-size:10.5px; color:#d8b467; text-transform:uppercase; font-weight:bold; margin-bottom:4px;">⚡ Rolagens Rápidas de Armas & Magias (Clique nos bônus/dados):</div>
                        ${parsedQuickRollsHtml}
                    </div>
                ` : ''}

                <div class="form-grid">
                    <div class="form-group">
                        <label>Inventário / Ataques (ex: +12 atk, 2d6+7 cria botões de rolagem acima)</label>
                        <textarea class="form-control" style="min-height:110px;" placeholder="Armas, poções, ouro, sintonizações..." onchange="updateCharacterField('${activeChar.id}', 'inventory', this.value)">${escapeHtmlText(activeChar.inventory || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Traços, Talentos & Notas da Sessão</label>
                        <textarea class="form-control" style="min-height:110px;" placeholder="Habilidades de classe, anotações pessoais..." onchange="updateCharacterField('${activeChar.id}', 'notes', this.value)">${escapeHtmlText(activeChar.notes || '')}</textarea>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* =========================================================================
   FASE 4: TABLETOP 2D TÁTICO COMPLETO (TAMANHOS, RÉGUA, AOE, FOG & PING)
   ========================================================================= */

function ensureTabletopExtendedState() {
    if (!tabletopState) return;
    if (!Array.isArray(tabletopState.aoeTemplates)) tabletopState.aoeTemplates = [];
    if (!Array.isArray(tabletopState.fogRegions)) tabletopState.fogRegions = [];
    if (tabletopState.fogEnabled === undefined) tabletopState.fogEnabled = false;
}

function setTabletopToolMode(mode) {
    window.tabletopToolMode = mode;
    renderTabletopModule();
}

function setTokenFootprintSize(tokenId, squares) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok || !CompendioNetAdapter.canControlEntity(tok.ownerId)) return;
    tok.sizeSquares = Math.max(1, Math.min(6, parseInt(squares, 10) || 1));
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
}

function addAoeTemplateToTabletop(shape = 'circle', sizeSquares = 4, color = '#e65100', label = '') {
    ensureTabletopExtendedState();
    const shapeNames = { circle: 'Esfera', cube: 'Cubo', cone: 'Cone', line: 'Linha' };
    const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { gridMetersPerSquare: 1.5 };
    const meters = sizeSquares * (Number(rules.gridMetersPerSquare) || 1.5);
    const tpl = {
        id: 'aoe-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100),
        shape,
        sizeSquares: Number(sizeSquares) || 4,
        color,
        label: label || `${shapeNames[shape] || 'Área'} ${meters}m`,
        x: 280,
        y: 224,
        ownerId: activePlayerId
    };
    tabletopState.aoeTemplates.push(tpl);
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
    showToast(`🔥 Template AoE (${tpl.label}) adicionado ao mapa! Arraste-o para posicionar.`);
}

function removeAoeTemplate(aoeId, ev) {
    if (ev) ev.stopPropagation();
    ensureTabletopExtendedState();
    tabletopState.aoeTemplates = tabletopState.aoeTemplates.filter(a => a.id !== aoeId);
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
}

function toggleTabletopFogBase() {
    ensureTabletopExtendedState();
    tabletopState.fogEnabled = !tabletopState.fogEnabled;
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
    showToast(tabletopState.fogEnabled
        ? '🌫️ Névoa de Guerra ATIVADA! Use a ferramenta "🌫️ Névoa" para desenhar áreas cobertas.'
        : '☀️ Névoa de Guerra desativada.');
}

function addDefaultFogCoverAll() {
    ensureTabletopExtendedState();
    tabletopState.fogEnabled = true;
    tabletopState.fogRegions.push({
        id: 'fog-' + Date.now(),
        x: 0,
        y: 0,
        w: 1600,
        h: 1000
    });
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
    showToast('🌫️ Mapa coberto com Névoa! Clique em um bloco de névoa para removê-lo/revelar a sala.');
}

function removeFogRegion(fogId, ev) {
    if (ev) ev.stopPropagation();
    const p = getActivePlayer();
    if (!p || p.role !== 'gm') return;
    ensureTabletopExtendedState();
    tabletopState.fogRegions = tabletopState.fogRegions.filter(f => f.id !== fogId);
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
}

function clearAllTabletopTacticalOverlays() {
    ensureTabletopExtendedState();
    tabletopState.aoeTemplates = [];
    tabletopState.fogRegions = [];
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
    showToast('🧹 Áreas AoE e regiões de Névoa limpas.');
}

function triggerTabletopPingAt(x, y, senderName = null, broadcast = true) {
    const stage = document.getElementById('tabletop-stage');
    if (stage) {
        const pingEl = document.createElement('div');
        pingEl.className = 'tt-map-ping';
        pingEl.style.left = `${x}px`;
        pingEl.style.top = `${y}px`;
        const lbl = senderName || (getActivePlayer()?.name || 'Ping');
        pingEl.innerHTML = `<span class="tt-map-ping-label">📍 ${escapeHtmlText(lbl)}</span>`;
        stage.appendChild(pingEl);
        setTimeout(() => pingEl.remove(), 2600);
    }
    if (broadcast && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendMapPing) {
        CompendioNetAdapter.sendMapPing({
            id: 'ping-' + Date.now(),
            x,
            y,
            senderName: senderName || (getActivePlayer()?.name || 'Jogador')
        });
    }
}

function startDragAoeTemplate(e, aoeId) {
    if (e.button !== 0) return;
    e.stopPropagation();
    ensureTabletopExtendedState();
    const tpl = tabletopState.aoeTemplates.find(a => a.id === aoeId);
    if (!tpl) return;
    const el = e.currentTarget;
    const scale = (Number(tabletopState.zoom) || 100) / 100;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = Number(tpl.x) || 0;
    const origY = Number(tpl.y) || 0;

    function onMove(mv) {
        const dx = (mv.clientX - startX) / scale;
        const dy = (mv.clientY - startY) / scale;
        tpl.x = Math.round(Math.max(0, Math.min(1540, origX + dx)));
        tpl.y = Math.round(Math.max(0, Math.min(940, origY + dy)));
        el.style.left = tpl.x + 'px';
        el.style.top = tpl.y + 'px';
    }
    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        saveLocalPersistence();
        CompendioNetAdapter.broadcastTabletop();
        renderTabletopModule();
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function onTabletopStageMouseDown(e) {
    const stage = document.getElementById('tabletop-stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const scale = (Number(tabletopState.zoom) || 100) / 100;
    const startX = Math.round((e.clientX - rect.left) / scale);
    const startY = Math.round((e.clientY - rect.top) / scale);

    // Alt + Clique ou Modo Ping -> Emite Ping Visual Sincronizado
    if (e.altKey || window.tabletopToolMode === 'ping') {
        e.preventDefault();
        triggerTabletopPingAt(startX, startY, null, true);
        return;
    }

    // Botão Direito ou Modo Régua -> Régua de Medição Tática em Tempo Real
    if (e.button === 2 || window.tabletopToolMode === 'ruler') {
        e.preventDefault();
        const svgOverlay = document.getElementById('tabletop-ruler-svg');
        const badgeEl = document.getElementById('tabletop-ruler-badge');
        if (!svgOverlay || !badgeEl) return;

        const gridPx = Number(tabletopState.gridSize) || 56;
        svgOverlay.innerHTML = `<line id="tt-ruler-line" x1="${startX}" y1="${startY}" x2="${startX}" y2="${startY}" stroke="#f2cf83" stroke-width="3" stroke-dasharray="8,5"/><circle cx="${startX}" cy="${startY}" r="5" fill="#f2cf83"/>`;
        badgeEl.style.display = 'block';
        badgeEl.style.left = `${startX + 12}px`;
        badgeEl.style.top = `${startY - 12}px`;
        badgeEl.textContent = '0m (0ft)';

        function onRulerMove(mv) {
            const curX = Math.round((mv.clientX - rect.left) / scale);
            const curY = Math.round((mv.clientY - rect.top) / scale);
            const line = document.getElementById('tt-ruler-line');
            if (line) {
                line.setAttribute('x2', curX);
                line.setAttribute('y2', curY);
            }
            const dxSq = (curX - startX) / gridPx;
            const dySq = (curY - startY) / gridPx;
            const dist = (typeof CompendioRules !== 'undefined')
                ? CompendioRules.calculateGridDistance(dxSq, dySq)
                : { squares: Math.round(Math.hypot(dxSq, dySq) * 10) / 10, meters: Math.round(Math.hypot(dxSq, dySq) * 1.5 * 10) / 10, feet: Math.round(Math.hypot(dxSq, dySq) * 5) };

            badgeEl.style.left = `${curX + 14}px`;
            badgeEl.style.top = `${curY - 14}px`;
            badgeEl.textContent = `📏 ${dist.meters}m · ${dist.feet}ft (${dist.squares} sq)`;
        }

        function onRulerUp() {
            window.removeEventListener('mousemove', onRulerMove);
            window.removeEventListener('mouseup', onRulerUp);
            setTimeout(() => {
                if (svgOverlay) svgOverlay.innerHTML = '';
                if (badgeEl) badgeEl.style.display = 'none';
            }, 1400);
        }

        window.addEventListener('mousemove', onRulerMove);
        window.addEventListener('mouseup', onRulerUp);
        return;
    }

    // Modo Névoa de Guerra (GM arrasta retângulo de névoa para esconder uma sala)
    const isGm = getActivePlayer()?.role === 'gm';
    if (isGm && window.tabletopToolMode === 'fog' && e.button === 0) {
        e.preventDefault();
        ensureTabletopExtendedState();
        tabletopState.fogEnabled = true;
        const draftBox = document.createElement('div');
        draftBox.style.cssText = `position:absolute; left:${startX}px; top:${startY}px; width:0px; height:0px; background:rgba(10,12,18,0.65); border:2px dashed #d8b467; pointer-events:none; z-index:35;`;
        stage.appendChild(draftBox);

        let lastX = startX;
        let lastY = startY;
        function onFogMove(mv) {
            lastX = Math.round((mv.clientX - rect.left) / scale);
            lastY = Math.round((mv.clientY - rect.top) / scale);
            const rx = Math.min(startX, lastX);
            const ry = Math.min(startY, lastY);
            const rw = Math.abs(lastX - startX);
            const rh = Math.abs(lastY - startY);
            draftBox.style.left = rx + 'px';
            draftBox.style.top = ry + 'px';
            draftBox.style.width = rw + 'px';
            draftBox.style.height = rh + 'px';
        }
        function onFogUp() {
            window.removeEventListener('mousemove', onFogMove);
            window.removeEventListener('mouseup', onFogUp);
            draftBox.remove();
            const rw = Math.abs(lastX - startX);
            const rh = Math.abs(lastY - startY);
            if (rw > 20 && rh > 20) {
                tabletopState.fogRegions.push({
                    id: 'fog-' + Date.now() + '-' + Math.floor(Math.random() * 100),
                    x: Math.min(startX, lastX),
                    y: Math.min(startY, lastY),
                    w: rw,
                    h: rh
                });
                saveLocalPersistence();
                CompendioNetAdapter.broadcastTabletop();
                renderTabletopModule();
            }
        }
        window.addEventListener('mousemove', onFogMove);
        window.addEventListener('mouseup', onFogUp);
    }
}

// Sobrescreve adjustTabletopTokenHp para sincronizar com Card da Runa e Ficha de Personagem
function adjustTabletopTokenHp(tokenId, delta) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    if (!CompendioNetAdapter.canControlEntity(tok.ownerId)) {
        showToast('⚠️ Apenas o jogador dono ou o Mestre pode alterar este token.');
        return;
    }
    const nextHp = Math.max(0, Math.min(tok.hpMax, (Number(tok.hpCurrent) || 0) + delta));
    syncCombatEntityHp(tok.id, nextHp, tok.hpMax);
}

// Sobrescreve renderTabletopModule para incluir Tamanhos 1x1..4x4, Régua, AoE, Fog of War, Ping e Turno Atual
function renderTabletopModule() {
    ensureTabletopExtendedState();
    const player = getActivePlayer();
    const isGm = player && player.role === 'gm';
    const listTitleEl = document.getElementById('dynamic-list-title');
    if (listTitleEl) {
        listTitleEl.textContent = `Tokens na Mesa (${tabletopState.tokens.length})`;
    }

    const activeTurnCard = (typeof combatCards !== 'undefined' && window.combatTurnState?.activeCardId)
        ? combatCards.find(c => String(c.id) === String(window.combatTurnState.activeCardId))
        : null;

    const listEl = document.getElementById('dynamic-item-list');
    if (listEl) {
        listEl.innerHTML = tabletopState.tokens.map(t => {
            const isSel = t.id === selectedTabletopTokenId ? 'active' : '';
            const icon = t.type === 'pc' ? '🛡️' : (t.type === 'item' ? '⚔️' : (t.type === 'npc' ? '🧙‍♂️' : '🐉'));
            const showExact = canSeeTokenExactStats(t);
            const statusText = t.type === 'item'
                ? 'Item'
                : (showExact ? `${t.hpCurrent}/${t.hpMax}` : describeQualitativeHealth(t.hpCurrent, t.hpMax, t.type));
            const canDel = CompendioNetAdapter.canControlEntity(t.ownerId);
            return `
                <li class="list-item ${isSel}" data-title="${escapeHtmlText(t.name.toLowerCase())}" onclick="selectTabletopToken('${t.id}')">
                    <span>${icon} ${escapeHtmlText(t.name)}</span>
                    <div class="list-item-right">
                        <span class="list-item-folder-badge" style="color:#8df596;">${statusText}</span>
                        ${canDel ? `<button type="button" class="btn-quick-del" onclick="event.stopPropagation(); removeTabletopToken('${t.id}')" title="Remover token">✕</button>` : ''}
                    </div>
                </li>
            `;
        }).join('') || '<li class="list-item" style="color:#828699;">Mesa vazia (adicione tokens)</li>';
    }

    const allMaps = getAllCatalogEntities(['maps']);
    const mapOptions = `<option value="">🗺️ Grade Tática Escura (Padrão)</option>` +
        allMaps.map(m => {
            const root = compendioData.maps || {};
            const entry = m.groupKey ? root[m.groupKey]?.children?.[m.itemKey] : root[m.itemKey];
            const path = entry?.path || '';
            if (!path) return '';
            return `<option value="${escapeHtmlText(path)}" ${tabletopState.mapPath === path ? 'selected' : ''}>🗺️ ${escapeHtmlText(m.title)}</option>`;
        }).join('');

    const monsterEntities = getAllCatalogEntities(['monsters', 'npcs']);
    const monsterOptions = `<option value="">＋ Monstro / NPC...</option>` +
        monsterEntities.map(m => `<option value="${m.category}|${m.groupKey}|${m.itemKey}|${escapeHtmlText(m.title)}">🐉 ${escapeHtmlText(m.title)}</option>`).join('');

    const itemEntities = getAllCatalogEntities(['items', 'curio']);
    const itemOptions = `<option value="">＋ Item / Objeto...</option>` +
        itemEntities.map(i => `<option value="${i.category}|${i.groupKey}|${i.itemKey}|${escapeHtmlText(i.title)}">⚔️ ${escapeHtmlText(i.title)}</option>`).join('');

    const gridPx = Number(tabletopState.gridSize) || 56;
    const zoomPct = Number(tabletopState.zoom) || 100;
    const resolvedMapBg = tabletopState.mapPath ? resolveRenderableImageSrc(tabletopState.mapPath) : '';
    const stageBgStyle = resolvedMapBg ? `background-image: url('${resolvedMapBg.replace(/'/g, "\\'")}');` : '';

    const selectedTok = tabletopState.tokens.find(t => t.id === selectedTabletopTokenId);
    let selectedTokBar = '';
    if (selectedTok) {
        const showExact = canSeeTokenExactStats(selectedTok);
        const canCtrl = CompendioNetAdapter.canControlEntity(selectedTok.ownerId);
        const sq = Number(selectedTok.sizeSquares) || 1;
        const hpDisplay = selectedTok.type === 'item'
            ? '📦 Objeto/Item'
            : (showExact ? `${selectedTok.hpCurrent}/${selectedTok.hpMax} PV (CA ${selectedTok.ac || '?'})` : describeQualitativeHealth(selectedTok.hpCurrent, selectedTok.hpMax, selectedTok.type));
        const gmRevealBtn = (isGm && selectedTok.category && selectedTok.itemKey)
            ? `<button type="button" class="btn-mini" onclick="setEntityGlobalKnowledge('${selectedTok.category}', '${selectedTok.itemKey}', 'studied')" title="Revelar PV exato e Ficha completa para os jogadores">📖 Revelar</button>`
            : '';
        const playerStudyBtn = (!isGm && !showExact && selectedTok.category && selectedTok.itemKey)
            ? `<button type="button" class="btn-mini" onclick="CompendioNetAdapter.sendStudyRequest('${selectedTok.category}:${selectedTok.itemKey}', '${escapeHtmlText(selectedTok.name)}')">🔍 Estudar</button>`
            : '';

        selectedTokBar = `
            <div style="display:flex; align-items:center; gap:5px; background:#18191f; padding:4px 8px; border-radius:5px; border:1px solid #5a5d6b; flex-wrap:wrap;">
                <strong style="color:#f2cf83; font-size:12px;">${escapeHtmlText(selectedTok.name)}: ${hpDisplay}</strong>
                <button type="button" class="btn-mini" onclick="openSheetFromTabletopToken('${selectedTok.id}')">📄 Ficha</button>
                ${gmRevealBtn}
                ${playerStudyBtn}
                ${canCtrl ? `
                    <select class="form-control" style="width:auto; padding:2px 4px; font-size:11px;" onchange="setTokenFootprintSize('${selectedTok.id}', this.value)" title="Tamanho do Token no Grid">
                        <option value="1" ${sq === 1 ? 'selected' : ''}>1x1 (M)</option>
                        <option value="2" ${sq === 2 ? 'selected' : ''}>2x2 (G)</option>
                        <option value="3" ${sq === 3 ? 'selected' : ''}>3x3 (E)</option>
                        <option value="4" ${sq === 4 ? 'selected' : ''}>4x4 (I)</option>
                    </select>
                ` : ''}
                ${(canCtrl && selectedTok.type !== 'item') ? `
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', -5)">-5</button>
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', -1)">-1</button>
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', 1)">+1</button>
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', 5)">+5</button>
                ` : ''}
                ${canCtrl ? `<button type="button" class="btn-mini danger" onclick="removeTabletopToken('${selectedTok.id}')">✕</button>` : ''}
            </div>
        `;
    }

    // Renderização dos Templates AoE
    const aoeHtml = (tabletopState.aoeTemplates || []).map(a => {
        const pxSize = (Number(a.sizeSquares) || 4) * gridPx;
        const radiusStyle = a.shape === 'circle' ? 'border-radius:50%;' : (a.shape === 'cone' ? 'clip-path: polygon(0% 50%, 100% 0%, 100% 100%);' : 'border-radius:6px;');
        const hSize = a.shape === 'line' ? Math.max(gridPx, Math.round(pxSize / 3)) : pxSize;
        return `
            <div class="tt-aoe-template"
                 style="left:${a.x}px; top:${a.y}px; width:${pxSize}px; height:${hSize}px; border-color:${a.color}; background:${a.color}38; ${radiusStyle}"
                 onmousedown="startDragAoeTemplate(event, '${a.id}')"
                 title="${escapeHtmlText(a.label)} (Arraste para mover)">
                <span class="tt-aoe-label">${escapeHtmlText(a.label)} <button type="button" onclick="removeAoeTemplate('${a.id}', event)">✕</button></span>
            </div>
        `;
    }).join('');

    // Renderização da Névoa de Guerra (Fog of War)
    const fogHtml = tabletopState.fogEnabled
        ? (tabletopState.fogRegions || []).map(f => {
            const bg = isGm ? 'rgba(8, 10, 16, 0.52)' : '#07080d';
            const border = isGm ? '2px dashed #d8b467' : 'none';
            const clickAction = isGm ? `onclick="removeFogRegion('${f.id}', event)" title="Clique para revelar esta sala/área aos jogadores"` : '';
            return `
                <div class="tt-fog-region" style="left:${f.x}px; top:${f.y}px; width:${f.w}px; height:${f.h}px; background:${bg}; border:${border}; cursor:${isGm ? 'pointer' : 'default'};" ${clickAction}>
                    ${isGm ? `<span style="font-size:11px; color:#f2cf83; background:rgba(0,0,0,0.7); padding:2px 6px; border-radius:4px;">🌫️ Névoa (Clique p/ Revelar)</span>` : ''}
                </div>
            `;
        }).join('')
        : '';

    const tokensHtml = tabletopState.tokens.map(t => {
        const isSel = t.id === selectedTabletopTokenId ? 'selected-token' : '';
        const isTurnActive = activeTurnCard && (
            String(activeTurnCard.tokenId) === String(t.id) ||
            (activeTurnCard.charId && String(activeTurnCard.charId) === String(t.refId))
        );
        const turnCls = isTurnActive ? 'tt-token-active-turn' : '';
        const typeCls = t.type === 'monster' ? 'monster-token' : (t.type === 'npc' ? 'npc-token' : (t.type === 'item' ? 'item-token' : ''));
        const initials = String(t.name || '?').trim().slice(0, 2).toUpperCase();
        const footprint = Math.max(1, Number(t.sizeSquares) || 1);
        const sz = (gridPx * footprint) - 6;
        const canMove = CompendioNetAdapter.canControlEntity(t.ownerId);
        const showExact = canSeeTokenExactStats(t);
        const badgeText = t.type === 'item'
            ? '⚔️ Item'
            : (showExact ? `${t.hpCurrent}/${t.hpMax}` : describeQualitativeHealth(t.hpCurrent, t.hpMax, t.type));
        const bgImgStyle = t.imgSrc ? `background-image:url('${t.imgSrc.replace(/'/g, "\\'")}');` : '';
        return `
            <div class="tt-token ${typeCls} ${isSel} ${turnCls}"
                 style="left:${t.x}px; top:${t.y}px; width:${sz}px; height:${sz}px; opacity:${canMove ? '1' : '0.92'}; ${bgImgStyle}"
                 onmousedown="startDragTabletopToken(event, '${t.id}')"
                 ondblclick="openSheetFromTabletopToken('${t.id}')"
                 title="${escapeHtmlText(t.name)} (Duplo-clique abre a Ficha)">
                <span class="tt-token-hp">${badgeText}</span>
                ${t.imgSrc ? '' : `<span>${escapeHtmlText(initials)}</span>`}
                <span class="tt-token-label">${isTurnActive ? '⚔️ ' : ''}${escapeHtmlText(t.name)}</span>
            </div>
        `;
    }).join('');

    const onlineCount = (window.onlinePlayersList && window.onlinePlayersList.length) ? window.onlinePlayersList.length : 1;

    const displayArea = document.getElementById('dynamic-display-area');
    displayArea.innerHTML = `
        <div class="tabletop-wrap">
            <div class="tabletop-toolbar">
                <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                    ${isGm ? `<select class="form-control" style="width:auto; min-width:155px; padding:4px 8px;" onchange="onTabletopMapChange(this.value)">${mapOptions}</select>` : ''}
                    <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="addActiveCharacterToTabletop()">🛡️ + Meu PJ</button>
                    ${isGm ? `
                        <select class="form-control" style="width:auto; max-width:150px; padding:4px 8px;" onchange="addCatalogEntityToTabletop(this.value); this.value='';">${monsterOptions}</select>
                        <select class="form-control" style="width:auto; max-width:140px; padding:4px 8px;" onchange="addCatalogEntityToTabletop(this.value); this.value='';">${itemOptions}</select>
                    ` : ''}

                    <!-- Ferramentas Táticas de VTT -->
                    <div style="display:flex; gap:3px; background:#18191f; padding:3px; border-radius:5px; border:1px solid #3c3e4a;">
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'move' ? 'active-studied' : ''}" onclick="setTabletopToolMode('move')" title="Mover Tokens (Arrastar com botão direito usa a Régua!)">✋ Mover</button>
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'ruler' ? 'active-studied' : ''}" onclick="setTabletopToolMode('ruler')" title="Régua de Medição Tática (ou arraste com o botão direito)">📏 Régua</button>
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'ping' ? 'active-sighted' : ''}" onclick="setTabletopToolMode('ping')" title="Sinalizar Ponto no Mapa para todos (ou Alt + Clique)">📍 Ping</button>
                        <select class="form-control" style="width:auto; padding:2px 6px; font-size:11px;" onchange="if(this.value){const [sh,sz,col,lbl]=this.value.split('|'); addAoeTemplateToTabletop(sh,Number(sz),col,lbl); this.value='';}" title="Inserir Marcador de Área de Efeito (AoE)">
                            <option value="">🔥 + Área (AoE)...</option>
                            <option value="circle|4|#e65100|Bola de Fogo (6m)">🔥 Esfera 6m (Bola de Fogo)</option>
                            <option value="circle|2|#29b6f6|Esfera 3m (10ft)">❄️ Esfera 3m (10ft)</option>
                            <option value="cone|3|#ab47bc|Cone 4,5m (15ft)">⚡ Cone 4,5m (15ft)</option>
                            <option value="cone|6|#ef5350|Sopro 9m (30ft)">🐉 Cone 9m (30ft)</option>
                            <option value="cube|3|#66bb6a|Cubo 4,5m (15ft)">🟩 Cubo 4,5m (15ft)</option>
                            <option value="line|6|#ffa726|Linha 9m (30ft)">⚡ Linha 9m (30ft)</option>
                        </select>
                        ${isGm ? `
                            <button type="button" class="vis-pill ${window.tabletopToolMode === 'fog' ? 'active-hidden' : ''}" onclick="setTabletopToolMode('fog')" title="Arraste no mapa para desenhar regiões de Névoa de Guerra">🌫️ Desenhar Névoa</button>
                            <button type="button" class="vis-pill" onclick="addDefaultFogCoverAll()" title="Cobrir o mapa todo com Névoa">🌑 Cobrir Tudo</button>
                        ` : ''}
                    </div>

                    <label style="display:flex; align-items:center; gap:4px; font-size:11px; color:#c2c6d6; cursor:pointer;">
                        <input type="checkbox" ${tabletopState.snapToGrid ? 'checked' : ''} onchange="toggleTabletopSnap(this.checked)"> Grade
                    </label>
                </div>
                ${selectedTokBar}
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <span style="font-size:11px; color:#8df596; background:#162419; border:1px solid #3c6e43; padding:3px 7px; border-radius:4px;" title="Jogadores sincronizados em tempo real">
                        📡 ${onlineCount}/8 Online | 👤 ${escapeHtmlText(player ? player.name : '')}
                    </span>
                    <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="zoomTabletop(0.85)">➖</button>
                    <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="zoomTabletop(1, true)">${zoomPct}%</button>
                    <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="zoomTabletop(1.15)">➕</button>
                    ${isGm ? `<button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="clearAllTabletopTacticalOverlays()" title="Limpar Áreas AoE e Névoa">🧹 Limpar AoE/Névoa</button>` : ''}
                    ${isGm ? `<button type="button" class="btn-mini danger" style="flex:0 0 auto;" onclick="clearTabletopTokens()" title="Limpar todos os tokens da mesa">🗑️</button>` : ''}
                </div>
            </div>

            <div class="tabletop-board-viewport" id="tabletop-viewport" oncontextmenu="return false;">
                <div class="tabletop-stage" id="tabletop-stage" style="${stageBgStyle} transform: scale(${zoomPct / 100});" onmousedown="onTabletopStageMouseDown(event)">
                    <div class="tabletop-grid-overlay" style="background-size: ${gridPx}px ${gridPx}px;"></div>
                    ${aoeHtml}
                    ${tokensHtml}
                    ${fogHtml}
                    <svg id="tabletop-ruler-svg" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:40;"></svg>
                    <div id="tabletop-ruler-badge" style="display:none; position:absolute; background:#18191f; color:#f2cf83; border:2px solid #d8b467; border-radius:6px; padding:3px 8px; font-weight:bold; font-size:12px; pointer-events:none; z-index:45; box-shadow:0 4px 10px rgba(0,0,0,0.85);"></div>
                </div>
            </div>
        </div>
    `;
}
