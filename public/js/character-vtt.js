/* =========================================================================
   FASE 3 & FASE 4: FICHA DE PERSONAGEM AVANÇADA & TABLETOP 2D TÁTICO
   - Ficha: Rolagens clicáveis, Death Saves, Inspiração, Exaustão, Spell Slots,
     Recursos Recarregáveis (Curto/Longo), Calculadora PV Temp e Itens Vinculados.
   - Tabletop: Tokens 1x1..4x4, Régua Tática, Templates AoE, Fog of War e Ping.
   ========================================================================= */

window.tabletopToolMode = 'move'; // 'move' | 'ruler' | 'aoe' | 'fog' | 'ping' | 'calibrate' | 'text' | 'brush'
window.aoeDraftConfig = { shape: 'circle', sizeSquares: 4, color: '#e65100', label: 'Esfera 6m (20ft)' };
window.textBoxDraftConfig = window.textBoxDraftConfig || {
    fontFamily: 'Georgia, serif',
    fontSize: 22,
    color: '#f2cf83',
    bgColor: 'rgba(14, 15, 20, 0.72)',
    bold: false,
    italic: false,
    align: 'center'
};
window.brushDraftConfig = window.brushDraftConfig || {
    color: '#ff5252',
    strokeWidth: 6,
    opacity: 0.92
};
window.fogDrawShape = window.fogDrawShape || 'rect'; // 'rect' | 'polygon'
window.fogPolygonDraft = window.fogPolygonDraft || [];
window.activeRulerDrag = null;
window.selectedShapeId = window.selectedShapeId || null;
window.selectedTextBoxId = window.selectedTextBoxId || null;
window.selectedDrawingId = window.selectedDrawingId || null;
window.selectedFogId = window.selectedFogId || null;
window.selectedFogVertexIdx = (window.selectedFogVertexIdx !== undefined) ? window.selectedFogVertexIdx : null;
window.editingTextBoxId = window.editingTextBoxId || null;
window.ttDrawerOpen = Boolean(window.ttDrawerOpen);
window.ttDrawerTab = window.ttDrawerTab || 'monsters';
window.ttDrawerSearch = window.ttDrawerSearch || '';
window.tabletopCursorShareEnabled = (typeof localStorage !== 'undefined' && localStorage.getItem('compendio_tt_cursor_share') === '0') ? false : true;
window.tabletopCamera = window.tabletopCamera || { x: 40, y: 30, scale: 1, initialized: false, stageWidth: 1600, stageHeight: 1000 };
window._ttMapDimensionsCache = window._ttMapDimensionsCache || {};

function _isVttEffectiveGm(playerObj = null) {
    if (typeof isEffectiveGmUser === 'function') return isEffectiveGmUser(playerObj);
    const p = playerObj || (typeof getActivePlayer === 'function' ? getActivePlayer() : null);
    if (!p || p.isUnauthenticated || !p.id) return false;
    if (window.isHostClient === false) return false;
    if (typeof serverWritable !== 'undefined' && serverWritable && window.isHostClient !== true) return false;
    return p.role === 'gm';
}

function ensureCharacterExtendedFields(c) {
    if (!c || typeof c !== 'object') return c;
    if (c.inspiration === undefined) c.inspiration = false;
    if (c.exhaustion === undefined) c.exhaustion = 0;
    if (c.gold === undefined || isNaN(Number(c.gold))) c.gold = 0;
    else c.gold = Math.max(0, Number(c.gold) || 0);
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

function adjustCharacterGold(charId, delta) {
    const c = charactersData.find(x => x.id === charId);
    if (!c || !canAccessFullCharacterSheet(c)) return;
    ensureCharacterExtendedFields(c);
    c.gold = Math.max(0, (Number(c.gold) || 0) + (Number(delta) || 0));
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.sendDelta) CompendioNetAdapter.sendDelta({ type: 'CHARACTER_UPDATE', character: c });
        else if (CompendioNetAdapter.broadcastCharacters) CompendioNetAdapter.broadcastCharacters();
    }
    renderCharacterModule();
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
    const isGm = _isVttEffectiveGm(player);
    const playerShownName = typeof getPlayerDisplayName === 'function' ? getPlayerDisplayName(player, 'Jogador') : (player ? player.name : 'Jogador');
    const getOwnerShown = (ch) => typeof getPlayerDisplayName === 'function' ? getPlayerDisplayName(ch.ownerId, ch.ownerName || 'Jogador') : (ch.ownerName || 'Jogador');
    const allChars = charactersData;
    const listTitleEl = document.getElementById('dynamic-list-title');
    if (listTitleEl) {
        listTitleEl.textContent = isGm
            ? `Personagens (Todos: ${allChars.length})`
            : `Grupo (${playerShownName})`;
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
            const ownerClr = typeof getPlayerColor === 'function' ? getPlayerColor(c.ownerId) : '#d8b467';
            return `
                <li class="list-item ${isAct}" data-title="${escapeHtmlText(c.name.toLowerCase())}" onclick="selectCharacter('${c.id}')">
                    <span>${isMine ? '🛡️' : '👁️'} ${escapeHtmlText(c.name)}</span>
                    <div class="list-item-right">
                        <span class="list-item-folder-badge" style="border-left:3px solid ${escapeHtmlText(ownerClr)};">${escapeHtmlText(getOwnerShown(c))}</span>
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
                <h2 class="info-title">🛡️ Personagens (${escapeHtmlText(playerShownName)})</h2>
                <p class="info-text">Nenhum personagem cadastrado ainda. Crie uma ficha do zero ou importe um arquivo <strong>.JSON</strong>, <strong>.PDF</strong> ou <strong>.HTML</strong>.</p>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                        <button type="button" class="btn-summon-card" style="padding:10px 18px;" onclick="if(typeof openNewCharacterChoiceModal==='function'){openNewCharacterChoiceModal();}else{createNewCharacterForActivePlayer();}">＋ Criar Ficha de Personagem</button>
                        <button type="button" class="btn-action-bar" style="padding:10px 18px;" onclick="document.getElementById('universal-sheet-import-input').click()">📥 Importar (.JSON / .PDF / .HTML)</button>
                        ${testFilesDropdown}
                    </div>
            </div>
        `;
        return;
    }

    ensureCharacterExtendedFields(activeChar);
    const activeOwnerShown = getOwnerShown(activeChar);

    if (!canAccessFullCharacterSheet(activeChar)) {
        displayArea.innerHTML = `
            <div class="info-container" style="max-width:720px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:2px groove var(--border-color); padding-bottom:10px; margin-bottom:14px;">
                    <div>
                        <h2 class="info-title" style="margin:0; border:none; padding:0;">👁️ ${escapeHtmlText(activeChar.name)} (Visão Pública de Grupo)</h2>
                        <div style="font-size:12px; color:#a0a4b8; margin-top:4px;">
                            Personagem controlado por: <strong>${escapeHtmlText(activeOwnerShown)}</strong>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <button type="button" class="btn-summon-card" onclick="if(typeof openNewCharacterChoiceModal==='function'){openNewCharacterChoiceModal();}else{createNewCharacterForActivePlayer();}">＋ Criar Meu Personagem</button>
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
                        Atributos exatos, pontos de vida numéricos, inventário e anotações pessoais pertencem apenas a <strong>${escapeHtmlText(activeOwnerShown)}</strong> e ao <strong>Mestre (GM)</strong>.
                    </p>
                </div>
            </div>
        `;
        return;
    }

    const effRules = (typeof CompendioRules !== 'undefined' && CompendioRules.getEffectiveRules)
        ? CompendioRules.getEffectiveRules()
        : {};
    const stats = activeChar.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const isDirectMod = effRules.modifierCalculation === 'direct';
    const computeStatMod = (rawVal) => isDirectMod ? (Number(rawVal) || 0) : calcAbilityMod(rawVal);

    const dexMod = computeStatMod(stats.dex);
    const wisMod = computeStatMod(stats.wis);
    const exPen = (typeof CompendioRules !== 'undefined') ? CompendioRules.getExhaustionPenalty(activeChar.exhaustion) : 0;

    let sheetCtx = {
        character: activeChar,
        rules: effRules,
        stats,
        dexMod,
        wisMod,
        totalInit: dexMod + (Number(activeChar.initiativeBonus) || 0),
        passivePerception: 10 + wisMod + (Number(activeChar.passivePerceptionBonus) || 0) + exPen,
        percMod: wisMod + (Number(activeChar.passivePerceptionBonus) || 0),
        bannerExtra: effRules.customSheetBanner || ''
    };
    if (typeof CompendioModAPI !== 'undefined' && CompendioModAPI.runHooks) {
        sheetCtx = CompendioModAPI.runHooks('onCalculateDerived', sheetCtx) || sheetCtx;
    }

    const totalInit = sheetCtx.totalInit;
    const passivePerception = sheetCtx.passivePerception;
    const percMod = sheetCtx.percMod;
    const baseRollExpr = (effRules.defaultDiceFormula && String(effRules.defaultDiceFormula).trim()) || '1d20';
    const modBannerText = sheetCtx.bannerExtra || effRules.customSheetBanner || '';

    const ownerOptions = playersData.map(p => {
        const pShown = typeof getPlayerDisplayName === 'function' ? getPlayerDisplayName(p) : p.name;
        return `<option value="${escapeHtmlText(p.id)}" ${p.id === activeChar.ownerId ? 'selected' : ''}>${escapeHtmlText(pShown)}</option>`;
    }).join('');

    const defaultStatLabels = [
        { key: 'str', label: 'FOR', full: 'Força' },
        { key: 'dex', label: 'DES', full: 'Destreza' },
        { key: 'con', label: 'CON', full: 'Constituição' },
        { key: 'int', label: 'INT', full: 'Inteligência' },
        { key: 'wis', label: 'SAB', full: 'Sabedoria' },
        { key: 'cha', label: 'CAR', full: 'Carisma' }
    ];
    const statLabels = (Array.isArray(effRules.attributeSchema) && effRules.attributeSchema.length > 0)
        ? effRules.attributeSchema.map(s => ({
            key: s.key || 'str',
            label: s.short || s.label || s.key,
            full: s.label || s.full || s.short || s.key
        }))
        : defaultStatLabels;

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
                        Jogador Responsável: <strong>${escapeHtmlText(activeOwnerShown)}</strong>${(typeof isStreamerModeEnabled === 'function' && isStreamerModeEnabled()) ? '' : ` (${escapeHtmlText(activeChar.ownerId)})`}
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

            <!-- Banner de Sistema Alternativo / Mod Ativo -->
            ${modBannerText ? `<div style="background:rgba(147,96,216,0.16); border:1px solid #9360d8; color:#e5cffc; border-radius:6px; padding:7px 12px; margin-bottom:12px; font-size:12px; font-weight:600;">🧩 ${escapeHtmlText(modBannerText)}</div>` : ''}

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
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <select class="form-control" style="flex:1; min-width:140px;" ${isGm ? '' : 'disabled'} onchange="updateCharacterOwner('${activeChar.id}', this.value)">${ownerOptions}</select>
                            ${(typeof openCharacterTransferModal === 'function') ? `<button type="button" class="btn-mini" style="white-space:nowrap;" onclick="openCharacterTransferModal('${activeChar.id}')" title="Transferir ou trocar este personagem com outro jogador (sujeito à aprovação do Host/Mestre)">🤝 ${isGm ? 'Trocar/Transferir' : 'Solicitar Troca'}</button>` : ''}
                        </div>
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

                    ${!effRules.hideDndDeathSaves ? `
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
                    ` : `
                    <div style="background:#18191f; padding:10px; border-radius:6px; border:1px solid #d8b467;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong style="font-size:12px; color:#ffd54f;">🪙 Ouro / Moedas (PO)</strong>
                            <input type="number" min="0" class="card-hp-input" style="width:74px; color:#ffd54f; font-size:13px;" value="${Number(activeChar.gold) || 0}" onchange="updateCharacterField('${activeChar.id}', 'gold', Math.max(0, Number(this.value) || 0))">
                        </div>
                        <div style="display:flex; gap:4px; margin-top:6px;">
                            <button type="button" class="card-mini-btn" onclick="adjustCharacterGold('${activeChar.id}', -10)">-10</button>
                            <button type="button" class="card-mini-btn" onclick="adjustCharacterGold('${activeChar.id}', -1)">-1</button>
                            <button type="button" class="card-mini-btn" onclick="adjustCharacterGold('${activeChar.id}', 1)">+1</button>
                            <button type="button" class="card-mini-btn" onclick="adjustCharacterGold('${activeChar.id}', 10)">+10</button>
                        </div>
                    </div>
                    `}
                </div>
            </div>

            <!-- Atributos Clicáveis para Rolagem -->
            <div class="form-section">
                <h3 class="form-section-title">Atributos / Abordagens (${escapeHtmlText(baseRollExpr)})</h3>
                <div class="form-grid-6">
                    ${statLabels.map(st => {
                        const rawAttr = stats[st.key];
                        const val = rawAttr !== undefined ? Number(rawAttr) : (isDirectMod ? 0 : 10);
                        const mod = computeStatMod(val);
                        const signed = formatSigned(mod);
                        return `
                            <div class="form-group" style="text-align:center; background:#18191f; padding:8px; border-radius:6px; border:1px solid #3c3e4a;">
                                <label style="font-size:12px; color:#f2cf83;" title="${escapeHtmlText(st.full)}">${escapeHtmlText(st.label)} (${signed})</label>
                                <input type="number" class="form-control" style="text-align:center; font-weight:bold;" value="${val}" onchange="updateCharacterStat('${activeChar.id}', '${st.key}', Number(this.value))">
                                <button type="button" class="inline-roll-btn hit-roll" style="margin-top:4px; width:100%; justify-content:center;" onclick="CompendioDice.rollQuick('${escapeHtmlText(baseRollExpr)}${signed}', 'Teste de ${escapeHtmlText(st.full)} (${escapeHtmlText(activeChar.name)})', { charId: '${activeChar.id}' })">🎲 ${signed}</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- Recursos Recarregáveis & Espaços de Magia (Spell Slots) -->
            <div class="form-section">
                <h3 class="form-section-title">Recursos de Classe / Sistema ${effRules.hideDndSpellSlots ? '' : '& Espaços de Magia'} (Recarregam nos Descansos)</h3>
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px; margin-bottom:10px;">
                    ${resourcesHtml}
                </div>
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
                    <input type="text" id="new-res-name-${activeChar.id}" class="form-control" style="flex:2; min-width:160px; padding:4px 8px; font-size:12px;" placeholder="Novo recurso (ex: Surto de Ação, Ki, Pontos de Destino)...">
                    <input type="number" id="new-res-max-${activeChar.id}" class="form-control" style="width:70px; padding:4px 8px; font-size:12px;" value="2" min="1" title="Usos Máximos">
                    <select id="new-res-rec-${activeChar.id}" class="form-control" style="width:auto; padding:4px 8px; font-size:12px;">
                        <option value="short">⛺ Recarrega no Curto</option>
                        <option value="long">🌙 Recarrega no Longo</option>
                    </select>
                    <button type="button" class="btn-action-bar" onclick="addCharacterCustomResource('${activeChar.id}')">＋ Recurso</button>
                </div>

                ${!effRules.hideDndSpellSlots ? `
                    <label style="font-size:11.5px; color:#b8bccf; font-weight:bold; display:block; margin-bottom:6px;">✨ Espaços de Magia (Spell Slots — 1º ao 9º Círculo)</label>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(88px, 1fr)); gap:6px;">
                        ${spellSlotsHtml}
                    </div>
                ` : ''}
            </div>

            <!-- Inventário, Ouro, Armas Clicáveis e Notas -->
            <div class="form-section">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <h3 class="form-section-title" style="margin:0; border:none; padding:0;">Equipamentos, Ouro & Anotações</h3>
                        <span style="display:inline-flex; align-items:center; gap:5px; background:rgba(241,196,15,0.12); border:1px solid #d4ac0d; border-radius:999px; padding:2px 9px; font-size:12px; color:#ffd54f; font-weight:700;">
                            🪙 <input type="number" min="0" value="${Number(activeChar.gold) || 0}" style="width:58px; background:transparent; border:none; color:#ffd54f; font-weight:800; text-align:right; outline:none;" onchange="updateCharacterField('${activeChar.id}', 'gold', Math.max(0, Number(this.value) || 0))"> PO
                            <button type="button" class="card-mini-btn" onclick="adjustCharacterGold('${activeChar.id}', -1)">-1</button>
                            <button type="button" class="card-mini-btn" onclick="adjustCharacterGold('${activeChar.id}', 10)">+10</button>
                        </span>
                    </div>
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
   FASE 4+: TABLETOP 2D GOOGLE-MAPS, CONCORRÊNCIA MULTIPLAYER, GRADIFICAÇÃO,
   FORMAS SVG INTERATIVAS, GAVETA DE TOKENS, BAÚS & OURO + INTEGRACÃO RUNA
   ========================================================================= */

function _cloneVttData(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
}

function getTabletopMapFogKey(mapPath) {
    return String(mapPath || '').trim() || '__blank_grid__';
}

function resolveMapDisplayName(mapPath) {
    const clean = String(mapPath || '').trim();
    if (!clean) return 'Grade Tática Escura';
    try {
        if (typeof getAllCatalogEntities === 'function' && typeof compendioData !== 'undefined') {
            const allMaps = getAllCatalogEntities(['maps']);
            const root = compendioData.maps || {};
            for (const m of allMaps) {
                const entry = m.groupKey ? root[m.groupKey]?.children?.[m.itemKey] : root[m.itemKey];
                if (entry && entry.path === clean && m.title) return String(m.title);
            }
        }
    } catch (e) {}
    const parts = clean.split(/[\\/]/);
    return parts[parts.length - 1] || clean;
}

function ensureTabletopExtendedState() {
    if (!tabletopState || typeof tabletopState !== 'object') return;
    if (!Array.isArray(tabletopState.tokens)) tabletopState.tokens = [];
    if (!Array.isArray(tabletopState.aoeTemplates)) tabletopState.aoeTemplates = [];
    if (!Array.isArray(tabletopState.fogRegions)) tabletopState.fogRegions = [];
    if (Array.isArray(tabletopState.fogRects) && tabletopState.fogRects.length > 0 && tabletopState.fogRegions.length === 0) {
        tabletopState.fogRegions = tabletopState.fogRects.slice();
    }
    tabletopState.fogRects = [];
    if (!Array.isArray(tabletopState.textBoxes)) tabletopState.textBoxes = [];
    if (!Array.isArray(tabletopState.drawings)) tabletopState.drawings = [];
    if (tabletopState.fogEnabled === undefined) tabletopState.fogEnabled = false;
    if (tabletopState.gridEnabled === undefined) tabletopState.gridEnabled = true;
    if (tabletopState.gridSize === undefined) tabletopState.gridSize = 56;
    if (tabletopState.gridSizeY === undefined) tabletopState.gridSizeY = Number(tabletopState.gridSize) || 56;
    if (tabletopState.gridOffsetX === undefined) tabletopState.gridOffsetX = 0;
    if (tabletopState.gridOffsetY === undefined) tabletopState.gridOffsetY = 0;
    if (tabletopState.stageWidth === undefined) tabletopState.stageWidth = 1600;
    if (tabletopState.stageHeight === undefined) tabletopState.stageHeight = 1000;

    if (!tabletopState.savedMapFogs || typeof tabletopState.savedMapFogs !== 'object' || Array.isArray(tabletopState.savedMapFogs)) {
        tabletopState.savedMapFogs = {};
    }
    if (!tabletopState.mapInstances || typeof tabletopState.mapInstances !== 'object' || Array.isArray(tabletopState.mapInstances)) {
        tabletopState.mapInstances = {};
    }
    if (!tabletopState.activeMapInstanceId || !tabletopState.mapInstances[tabletopState.activeMapInstanceId]) {
        const initId = tabletopState.activeMapInstanceId || 'inst-default';
        const initName = tabletopState.activeMapInstanceName || resolveMapDisplayName(tabletopState.mapPath);
        tabletopState.activeMapInstanceId = initId;
        tabletopState.activeMapInstanceName = initName;
        tabletopState.mapInstances[initId] = {
            id: initId,
            name: initName,
            mapPath: tabletopState.mapPath || '',
            mapBg: tabletopState.mapBg || '',
            stageWidth: Number(tabletopState.stageWidth) || 1600,
            stageHeight: Number(tabletopState.stageHeight) || 1000,
            gridEnabled: tabletopState.gridEnabled !== false,
            gridSize: Number(tabletopState.gridSize) || 56,
            gridSizeY: Number(tabletopState.gridSizeY) || 56,
            gridOffsetX: Number(tabletopState.gridOffsetX) || 0,
            gridOffsetY: Number(tabletopState.gridOffsetY) || 0,
            snapToGrid: Boolean(tabletopState.snapToGrid),
            gridSnap: Boolean(tabletopState.snapToGrid),
            fogEnabled: Boolean(tabletopState.fogEnabled),
            tokens: _cloneVttData(tabletopState.tokens),
            aoeTemplates: _cloneVttData(tabletopState.aoeTemplates),
            fogRegions: _cloneVttData(tabletopState.fogRegions),
            textBoxes: _cloneVttData(tabletopState.textBoxes),
            drawings: _cloneVttData(tabletopState.drawings),
            updatedAt: Date.now()
        };
    }
}

function clearAllTabletopSelections(exceptKind = null) {
    if (exceptKind !== 'token') selectedTabletopTokenId = null;
    if (exceptKind !== 'shape') window.selectedShapeId = null;
    if (exceptKind !== 'textbox') window.selectedTextBoxId = null;
    if (exceptKind !== 'drawing') window.selectedDrawingId = null;
    if (exceptKind !== 'fog') {
        window.selectedFogId = null;
        window.selectedFogVertexIdx = null;
    }
}

function getTabletopGridMetrics() {
    ensureTabletopExtendedState();
    const gx = Math.max(10, Number(tabletopState.gridSize) || 56);
    const gy = Math.max(10, Number(tabletopState.gridSizeY) || gx);
    const ox = Math.round(Number(tabletopState.gridOffsetX) || 0);
    const oy = Math.round(Number(tabletopState.gridOffsetY) || 0);
    return {
        gx,
        gy,
        ox,
        oy,
        enabled: tabletopState.gridEnabled !== false,
        snap: Boolean(tabletopState.snapToGrid)
    };
}

function getTabletopStageDimensions() {
    ensureTabletopExtendedState();
    const w = Math.max(800, Number(window.tabletopCamera?.stageWidth) || Number(tabletopState.stageWidth) || 1600);
    const h = Math.max(550, Number(window.tabletopCamera?.stageHeight) || Number(tabletopState.stageHeight) || 1000);
    return { w, h };
}

function applyTabletopCameraTransform() {
    const stage = document.getElementById('tabletop-stage');
    if (stage) {
        const cam = window.tabletopCamera || { x: 0, y: 0, scale: 1 };
        stage.style.transform = `translate3d(${Math.round(cam.x)}px, ${Math.round(cam.y)}px, 0) scale(${cam.scale})`;
    }
    const pctEl = document.getElementById('tt-gmaps-zoom-pct');
    if (pctEl && window.tabletopCamera) {
        pctEl.textContent = `${Math.round(window.tabletopCamera.scale * 100)}%`;
    }
}

function centerTabletopCameraOnWorld(wx, wy) {
    const vp = document.getElementById('tabletop-viewport');
    const cam = window.tabletopCamera;
    if (!cam) return;
    const vw = vp?.clientWidth || 960;
    const vh = vp?.clientHeight || 620;
    cam.x = Math.round(vw / 2 - (Number(wx) || 0) * cam.scale);
    cam.y = Math.round(vh / 2 - (Number(wy) || 0) * cam.scale);
    cam.initialized = true;
    applyTabletopCameraTransform();
}

function centerTabletopCameraReset() {
    const { w, h } = getTabletopStageDimensions();
    if (window.selectedTabletopTokenId && Array.isArray(tabletopState?.tokens)) {
        const tok = tabletopState.tokens.find(t => t.id === selectedTabletopTokenId);
        if (tok) {
            const { gx } = getTabletopGridMetrics();
            const span = (Number(tok.sizeSquares) || 1) * gx;
            centerTabletopCameraOnWorld((Number(tok.x) || 0) + span / 2, (Number(tok.y) || 0) + span / 2);
            return;
        }
    }
    const vp = document.getElementById('tabletop-viewport');
    const vw = vp?.clientWidth || 960;
    const vh = vp?.clientHeight || 620;
    window.tabletopCamera.scale = Math.max(0.35, Math.min(1.0, Math.min((vw - 40) / w, (vh - 40) / h)));
    tabletopState.zoom = Math.round(window.tabletopCamera.scale * 100);
    centerTabletopCameraOnWorld(w / 2, h / 2);
}

function getTabletopCameraCenterWorld() {
    const vp = document.getElementById('tabletop-viewport');
    const cam = window.tabletopCamera || { x: 0, y: 0, scale: 1 };
    const vw = vp?.clientWidth || 960;
    const vh = vp?.clientHeight || 620;
    const { w, h } = getTabletopStageDimensions();
    const wx = Math.round(Math.max(24, Math.min(w - 80, (vw / 2 - cam.x) / (cam.scale || 1))));
    const wy = Math.round(Math.max(24, Math.min(h - 80, (vh / 2 - cam.y) / (cam.scale || 1))));
    return { x: wx, y: wy };
}

function clientToWorldCoords(clientX, clientY) {
    const vp = document.getElementById('tabletop-viewport');
    const cam = window.tabletopCamera || { x: 0, y: 0, scale: 1 };
    if (!vp) {
        return { x: Math.round(clientX), y: Math.round(clientY) };
    }
    const rect = vp.getBoundingClientRect();
    const scale = cam.scale || 1;
    return {
        x: Math.round((clientX - rect.left - cam.x) / scale),
        y: Math.round((clientY - rect.top - cam.y) / scale)
    };
}

function zoomTabletop(factor, reset = false, anchorClientX = null, anchorClientY = null) {
    const cam = window.tabletopCamera || { x: 0, y: 0, scale: 1, initialized: true };
    const oldScale = cam.scale || 1;
    const nextScale = reset ? 1 : Math.max(0.3, Math.min(3.0, Math.round(oldScale * factor * 100) / 100));
    const vp = document.getElementById('tabletop-viewport');
    if (vp) {
        const rect = vp.getBoundingClientRect();
        const mx = (anchorClientX !== null && anchorClientX !== undefined) ? (anchorClientX - rect.left) : (vp.clientWidth / 2);
        const my = (anchorClientY !== null && anchorClientY !== undefined) ? (anchorClientY - rect.top) : (vp.clientHeight / 2);
        const wx = (mx - cam.x) / oldScale;
        const wy = (my - cam.y) / oldScale;
        cam.scale = nextScale;
        cam.x = Math.round(mx - wx * nextScale);
        cam.y = Math.round(my - wy * nextScale);
    } else {
        cam.scale = nextScale;
    }
    cam.initialized = true;
    if (tabletopState) tabletopState.zoom = Math.round(cam.scale * 100);
    applyTabletopCameraTransform();
}

function onTabletopViewportWheel(e) {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1.12 : (1 / 1.12);
    zoomTabletop(dir, false, e.clientX, e.clientY);
}

function syncTabletopStageDimensionsForMap(mapSrc) {
    if (!mapSrc) return;
    const cached = window._ttMapDimensionsCache[mapSrc];
    const applyDims = (natW, natH) => {
        if (!natW || !natH) return;
        const maxSpan = 2200;
        const ratio = Math.min(1, maxSpan / Math.max(natW, natH));
        const w = Math.max(900, Math.round(natW * ratio));
        const h = Math.max(600, Math.round(natH * ratio));
        window._ttMapDimensionsCache[mapSrc] = { w, h };
        window.tabletopCamera.stageWidth = w;
        window.tabletopCamera.stageHeight = h;
        if (tabletopState) {
            tabletopState.stageWidth = w;
            tabletopState.stageHeight = h;
        }
        const stage = document.getElementById('tabletop-stage');
        if (stage) {
            stage.style.width = `${w}px`;
            stage.style.height = `${h}px`;
        }
    };
    if (cached) {
        applyDims(cached.w, cached.h);
        return;
    }
    if (typeof Image !== 'undefined') {
        const img = new Image();
        img.onload = () => {
            applyDims(img.naturalWidth, img.naturalHeight);
            if (!window.tabletopCamera.initialized && activeModule === 'tabletop') {
                centerTabletopCameraReset();
            }
        };
        img.src = mapSrc;
    }
}

function setTabletopToolMode(mode) {
    const p = getActivePlayer();
    const isGm = _isVttEffectiveGm(p);
    if ((mode === 'fog' || mode === 'calibrate') && !isGm) {
        showToast('🔒 Apenas o Mestre pode usar esta ferramenta.');
        return;
    }
    if (mode !== 'fog' && Array.isArray(window.fogPolygonDraft) && window.fogPolygonDraft.length > 0) {
        window.fogPolygonDraft = [];
    }
    window.tabletopToolMode = mode;
    updateTabletopSelectionUI();
    const tb = document.getElementById('tt-toolbar-tools-root');
    if (!tb && activeModule === 'tabletop') {
        renderTabletopModule();
        return;
    }
    if (activeModule === 'tabletop') renderTabletopModule();
}

function toggleTabletopCursorShare() {
    window.tabletopCursorShareEnabled = !window.tabletopCursorShareEnabled;
    try { localStorage.setItem('compendio_tt_cursor_share', window.tabletopCursorShareEnabled ? '1' : '0'); } catch (e) {}
    if (!window.tabletopCursorShareEnabled && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendCursorMove) {
        CompendioNetAdapter.sendCursorMove(0, 0, false);
    }
    renderTabletopModule();
}

function toggleTabletopGridEnabled(forceVal = null) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) {
        showToast('🔒 Apenas o Mestre (GM) pode desabilitar ou habilitar a grade.');
        return false;
    }
    ensureTabletopExtendedState();
    tabletopState.gridEnabled = (forceVal === null) ? (tabletopState.gridEnabled === false) : Boolean(forceVal);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
        CompendioNetAdapter.broadcastTabletopMeta({ gridEnabled: tabletopState.gridEnabled });
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    updateTabletopGridVisualsOnly();
    return true;
}

function toggleTabletopSnap(checked) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) {
        showToast('🔒 Apenas o Mestre (GM) pode alterar o Snap na grade.');
        renderTabletopModule();
        return false;
    }
    tabletopState.snapToGrid = Boolean(checked);
    tabletopState.gridSnap = tabletopState.snapToGrid;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
        CompendioNetAdapter.broadcastTabletopMeta({ snapToGrid: tabletopState.snapToGrid, gridSnap: tabletopState.snapToGrid });
    }
    updateTabletopGridVisualsOnly();
    return true;
}

function nudgeTabletopCalibration(patch = {}) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    ensureTabletopExtendedState();
    if (patch.reset) {
        tabletopState.gridSize = 56;
        tabletopState.gridSizeY = 56;
        tabletopState.gridOffsetX = 0;
        tabletopState.gridOffsetY = 0;
    } else {
        let gx = Number(tabletopState.gridSize) || 56;
        let gy = Number(tabletopState.gridSizeY) || gx;
        let ox = Number(tabletopState.gridOffsetX) || 0;
        let oy = Number(tabletopState.gridOffsetY) || 0;
        if (patch.divFactor) {
            gx = Math.max(12, Math.round(gx / patch.divFactor));
            gy = Math.max(12, Math.round(gy / patch.divFactor));
        }
        if (patch.squareLock) gy = gx;
        if (patch.gxDelta) {
            gx = Math.max(12, Math.round(gx + patch.gxDelta));
            if (patch.bothAxes) gy = Math.max(12, Math.round(gy + patch.gxDelta));
        }
        if (patch.gyDelta) gy = Math.max(12, Math.round(gy + patch.gyDelta));
        if (patch.oxDelta) ox = Math.round(ox + patch.oxDelta);
        if (patch.oyDelta) oy = Math.round(oy + patch.oyDelta);
        tabletopState.gridSize = gx;
        tabletopState.gridSizeY = gy;
        tabletopState.gridOffsetX = ox;
        tabletopState.gridOffsetY = oy;
    }
    tabletopState.gridEnabled = true;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
        CompendioNetAdapter.broadcastTabletopMeta({
            gridEnabled: true,
            gridSize: tabletopState.gridSize,
            gridSizeY: tabletopState.gridSizeY,
            gridOffsetX: tabletopState.gridOffsetX,
            gridOffsetY: tabletopState.gridOffsetY
        });
    }
    updateTabletopGridVisualsOnly();
}

function updateTabletopGridVisualsOnly() {
    const m = getTabletopGridMetrics();
    const overlay = document.getElementById('tabletop-grid-overlay');
    if (overlay) {
        overlay.classList.toggle('is-hidden', !m.enabled);
        overlay.style.backgroundSize = `${m.gx}px ${m.gy}px`;
        overlay.style.backgroundPosition = `${m.ox}px ${m.oy}px`;
    }
    const calReadout = document.getElementById('tt-cal-readout');
    if (calReadout) {
        calReadout.textContent = `${m.gx}×${m.gy}px (off ${m.ox},${m.oy})`;
    }
    const gradeBtn = document.getElementById('tt-btn-grid-toggle');
    if (gradeBtn) {
        gradeBtn.classList.toggle('is-active', m.enabled);
        gradeBtn.textContent = m.enabled ? `🕸️ Grade (${m.gx}px)` : '🕸️ Grade OFF';
    }
}

/* ------------------ PERSISTÊNCIA DE CENAS / INSTÂNCIAS DE MAPA & FOG POR MAPA ------------------ */
function extractCurrentSceneSnapshot(overrideName = null) {
    ensureTabletopExtendedState();
    const id = tabletopState.activeMapInstanceId || 'inst-default';
    const curStored = tabletopState.mapInstances[id];
    const name = String(overrideName || tabletopState.activeMapInstanceName || curStored?.name || resolveMapDisplayName(tabletopState.mapPath)).trim() || 'Cena Atual';
    return {
        id,
        name,
        mapPath: tabletopState.mapPath || '',
        mapBg: tabletopState.mapBg || '',
        stageWidth: Number(tabletopState.stageWidth) || 1600,
        stageHeight: Number(tabletopState.stageHeight) || 1000,
        gridEnabled: tabletopState.gridEnabled !== false,
        gridSize: Number(tabletopState.gridSize) || 56,
        gridSizeY: Number(tabletopState.gridSizeY) || 56,
        gridOffsetX: Number(tabletopState.gridOffsetX) || 0,
        gridOffsetY: Number(tabletopState.gridOffsetY) || 0,
        snapToGrid: Boolean(tabletopState.snapToGrid),
        gridSnap: Boolean(tabletopState.snapToGrid),
        fogEnabled: Boolean(tabletopState.fogEnabled),
        tokens: _cloneVttData(tabletopState.tokens || []),
        aoeTemplates: _cloneVttData(tabletopState.aoeTemplates || []),
        fogRegions: _cloneVttData(tabletopState.fogRegions || []),
        textBoxes: _cloneVttData(tabletopState.textBoxes || []),
        drawings: _cloneVttData(tabletopState.drawings || []),
        updatedAt: Date.now()
    };
}

function buildSceneSyncPayloadFromActive() {
    ensureTabletopExtendedState();
    return {
        activeMapInstanceId: tabletopState.activeMapInstanceId,
        activeMapInstanceName: tabletopState.activeMapInstanceName,
        mapPath: tabletopState.mapPath || '',
        mapBg: tabletopState.mapBg || '',
        stageWidth: Number(tabletopState.stageWidth) || 1600,
        stageHeight: Number(tabletopState.stageHeight) || 1000,
        gridEnabled: tabletopState.gridEnabled !== false,
        gridSize: Number(tabletopState.gridSize) || 56,
        gridSizeY: Number(tabletopState.gridSizeY) || 56,
        gridOffsetX: Number(tabletopState.gridOffsetX) || 0,
        gridOffsetY: Number(tabletopState.gridOffsetY) || 0,
        snapToGrid: Boolean(tabletopState.snapToGrid),
        gridSnap: Boolean(tabletopState.snapToGrid),
        fogEnabled: Boolean(tabletopState.fogEnabled),
        tokens: _cloneVttData(tabletopState.tokens || []),
        aoeTemplates: _cloneVttData(tabletopState.aoeTemplates || []),
        fogRegions: _cloneVttData(tabletopState.fogRegions || []),
        textBoxes: _cloneVttData(tabletopState.textBoxes || []),
        drawings: _cloneVttData(tabletopState.drawings || []),
        mapInstances: tabletopState.mapInstances,
        savedMapFogs: tabletopState.savedMapFogs
    };
}

function saveCurrentMapInstanceState(opts = {}) {
    if (!_isVttEffectiveGm() && !opts.allowLocalOnly) return null;
    ensureTabletopExtendedState();
    const snap = extractCurrentSceneSnapshot(opts.name || null);
    tabletopState.activeMapInstanceId = snap.id;
    tabletopState.activeMapInstanceName = snap.name;
    tabletopState.mapInstances[snap.id] = snap;
    if (opts.persist !== false) saveLocalPersistence();
    if (opts.sync !== false && _isVttEffectiveGm() && typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.broadcastTabletopMeta) {
            CompendioNetAdapter.broadcastTabletopMeta({
                activeMapInstanceId: tabletopState.activeMapInstanceId,
                activeMapInstanceName: tabletopState.activeMapInstanceName,
                mapInstances: tabletopState.mapInstances,
                savedMapFogs: tabletopState.savedMapFogs
            });
        }
    }
    if (opts.notify) showToast(`💾 Instância "${snap.name}" salva!`);
    return snap;
}

function switchToMapInstance(instanceId, opts = {}) {
    if (!_isVttEffectiveGm()) {
        showToast('🔒 Apenas o Mestre pode trocar a instância/cena do mapa.');
        return false;
    }
    ensureTabletopExtendedState();
    if (!opts.skipSaveCurrent && tabletopState.activeMapInstanceId && tabletopState.mapInstances[tabletopState.activeMapInstanceId]) {
        saveCurrentMapInstanceState({ persist: false, sync: false });
    }
    const target = tabletopState.mapInstances[instanceId];
    if (!target) {
        showToast('⚠️ Instância de mapa não encontrada.');
        return false;
    }
    tabletopState.activeMapInstanceId = target.id;
    tabletopState.activeMapInstanceName = target.name;
    tabletopState.mapPath = target.mapPath || '';
    tabletopState.mapBg = target.mapBg || '';
    tabletopState.stageWidth = Number(target.stageWidth) || 1600;
    tabletopState.stageHeight = Number(target.stageHeight) || 1000;
    tabletopState.gridEnabled = target.gridEnabled !== false;
    tabletopState.gridSize = Number(target.gridSize) || 56;
    tabletopState.gridSizeY = Number(target.gridSizeY) || Number(target.gridSize) || 56;
    tabletopState.gridOffsetX = Number(target.gridOffsetX) || 0;
    tabletopState.gridOffsetY = Number(target.gridOffsetY) || 0;
    tabletopState.snapToGrid = Boolean(target.snapToGrid);
    tabletopState.gridSnap = Boolean(target.snapToGrid);
    tabletopState.fogEnabled = Boolean(target.fogEnabled);
    tabletopState.tokens = _cloneVttData(target.tokens || []);
    tabletopState.aoeTemplates = _cloneVttData(target.aoeTemplates || []);
    tabletopState.fogRegions = _cloneVttData(target.fogRegions || []);
    tabletopState.fogRects = [];
    tabletopState.textBoxes = _cloneVttData(target.textBoxes || []);
    tabletopState.drawings = _cloneVttData(target.drawings || []);

    clearAllTabletopSelections();
    window.fogPolygonDraft = [];
    window.editingTextBoxId = null;
    window.tabletopCamera.initialized = false;
    saveLocalPersistence();

    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.broadcastTabletopSceneSync) {
            CompendioNetAdapter.broadcastTabletopSceneSync(buildSceneSyncPayloadFromActive());
        } else {
            CompendioNetAdapter.broadcastTabletop();
        }
    }
    if (activeModule === 'tabletop') renderTabletopModule();
    if (!opts.silent) showToast(`🗺️ Cena ativa: "${target.name}" (${tabletopState.tokens.length} tokens, ${tabletopState.fogRegions.length} fogs)`);
    return true;
}

function createNewMapInstance(params = {}) {
    if (!_isVttEffectiveGm()) {
        showToast('🔒 Apenas o Mestre pode criar instâncias de mapa.');
        return null;
    }
    ensureTabletopExtendedState();
    saveCurrentMapInstanceState({ persist: false, sync: false });

    const mapPath = (params.mapPath !== undefined) ? String(params.mapPath || '') : (tabletopState.mapPath || '');
    const mapKey = getTabletopMapFogKey(mapPath);
    const savedFog = (params.useSavedMapFog !== false) ? tabletopState.savedMapFogs[mapKey] : null;
    const sameMapCount = Object.values(tabletopState.mapInstances).filter(inst => inst && inst.mapPath === mapPath).length;
    const defaultName = sameMapCount > 0
        ? `${resolveMapDisplayName(mapPath)} #${sameMapCount + 1}`
        : resolveMapDisplayName(mapPath);
    const name = String(params.name || defaultName).trim() || defaultName;
    const newId = 'inst-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);

    let initialTokens = [];
    if (params.cloneCurrent) {
        const curSnap = extractCurrentSceneSnapshot(name);
        tabletopState.mapInstances[newId] = Object.assign({}, curSnap, { id: newId, name, updatedAt: Date.now() });
        switchToMapInstance(newId, { skipSaveCurrent: true, silent: true });
        showToast(`📋 Instância duplicada: "${name}"!`);
        return tabletopState.mapInstances[newId];
    }

    if (params.keepPartyTokens) {
        initialTokens = _cloneVttData((tabletopState.tokens || []).filter(t => t && t.type === 'pc'));
    }

    const newInst = {
        id: newId,
        name,
        mapPath,
        mapBg: '',
        stageWidth: 1600,
        stageHeight: 1000,
        gridEnabled: true,
        gridSize: 56,
        gridSizeY: 56,
        gridOffsetX: 0,
        gridOffsetY: 0,
        snapToGrid: tabletopState.snapToGrid !== false,
        gridSnap: tabletopState.snapToGrid !== false,
        fogEnabled: savedFog ? Boolean(savedFog.fogEnabled) : false,
        tokens: initialTokens,
        aoeTemplates: [],
        fogRegions: savedFog ? _cloneVttData(savedFog.fogRegions || []) : [],
        textBoxes: [],
        drawings: [],
        updatedAt: Date.now()
    };
    tabletopState.mapInstances[newId] = newInst;
    switchToMapInstance(newId, { skipSaveCurrent: true, silent: true });
    const fogNote = savedFog && savedFog.fogRegions?.length ? ` + ${savedFog.fogRegions.length} fog salva carregada` : '';
    showToast(`✨ Nova instância criada: "${name}"${fogNote}!`);
    return newInst;
}

function renameMapInstance(instanceId, newName) {
    if (!_isVttEffectiveGm()) return false;
    ensureTabletopExtendedState();
    const inst = tabletopState.mapInstances[instanceId];
    const clean = String(newName || '').trim();
    if (!inst || !clean) return false;
    inst.name = clean;
    inst.updatedAt = Date.now();
    if (tabletopState.activeMapInstanceId === instanceId) {
        tabletopState.activeMapInstanceName = clean;
    }
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
        CompendioNetAdapter.broadcastTabletopMeta({
            activeMapInstanceName: tabletopState.activeMapInstanceName,
            mapInstances: tabletopState.mapInstances
        });
    }
    if (activeModule === 'tabletop') renderTabletopModule();
    return true;
}

function deleteMapInstance(instanceId) {
    if (!_isVttEffectiveGm()) return false;
    ensureTabletopExtendedState();
    const allIds = Object.keys(tabletopState.mapInstances || {});
    if (allIds.length <= 1) {
        showToast('⚠️ É necessário manter pelo menos 1 instância de mapa ativa.');
        return false;
    }
    if (!tabletopState.mapInstances[instanceId]) return false;
    const deletedName = tabletopState.mapInstances[instanceId].name;
    delete tabletopState.mapInstances[instanceId];
    if (tabletopState.activeMapInstanceId === instanceId) {
        const nextId = Object.keys(tabletopState.mapInstances)[0];
        switchToMapInstance(nextId, { skipSaveCurrent: true, silent: true });
    } else {
        saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
            CompendioNetAdapter.broadcastTabletopMeta({ mapInstances: tabletopState.mapInstances });
        }
        if (activeModule === 'tabletop') renderTabletopModule();
    }
    showToast(`🗑️ Instância "${deletedName}" excluída.`);
    return true;
}

function saveCurrentFogToMapPreset() {
    if (!_isVttEffectiveGm()) {
        showToast('🔒 Apenas o Mestre pode salvar a Névoa de Guerra no mapa.');
        return null;
    }
    ensureTabletopExtendedState();
    const mapKey = getTabletopMapFogKey(tabletopState.mapPath);
    const regions = _cloneVttData(tabletopState.fogRegions || []);
    const preset = {
        mapPath: tabletopState.mapPath || '',
        mapName: resolveMapDisplayName(tabletopState.mapPath),
        fogEnabled: Boolean(tabletopState.fogEnabled || regions.length > 0),
        fogRegions: regions,
        updatedAt: Date.now()
    };
    tabletopState.savedMapFogs[mapKey] = preset;
    saveCurrentMapInstanceState({ persist: false, sync: false });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
        CompendioNetAdapter.broadcastTabletopMeta({
            savedMapFogs: tabletopState.savedMapFogs,
            mapInstances: tabletopState.mapInstances
        });
    }
    if (activeModule === 'tabletop') renderTabletopModule();
    showToast(`🌫️💾 Névoa (${regions.length} região(ões)) salva no mapa "${preset.mapName}"!`);
    return preset;
}

function loadSavedFogFromMapPreset(overrideMapPath = null) {
    if (!_isVttEffectiveGm()) return false;
    ensureTabletopExtendedState();
    const mapKey = getTabletopMapFogKey(overrideMapPath !== null ? overrideMapPath : tabletopState.mapPath);
    const preset = tabletopState.savedMapFogs[mapKey];
    if (!preset) {
        showToast('ℹ️ Este mapa ainda não possui uma Névoa salva.');
        return false;
    }
    tabletopState.fogRegions = _cloneVttData(preset.fogRegions || []);
    tabletopState.fogRects = [];
    tabletopState.fogEnabled = Boolean(preset.fogEnabled || tabletopState.fogRegions.length > 0);
    window.selectedFogId = null;
    saveCurrentMapInstanceState({ persist: false, sync: false });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopSceneSync) {
        CompendioNetAdapter.broadcastTabletopSceneSync(buildSceneSyncPayloadFromActive());
    }
    if (activeModule === 'tabletop') renderTabletopModule();
    showToast(`🌫️📥 Névoa salva carregada (${tabletopState.fogRegions.length} regiões)!`);
    return true;
}

function openMapInstancesModal() {
    if (!_isVttEffectiveGm()) {
        showToast('🔒 Apenas o Mestre gerencia instâncias e névoa salva de mapas.');
        return;
    }
    ensureTabletopExtendedState();
    saveCurrentMapInstanceState({ persist: false, sync: false });
    const backdrop = document.getElementById('tt-chest-backdrop');
    const panel = document.getElementById('tt-chest-modal-content');
    if (!backdrop || !panel) return;

    const allMaps = typeof getAllCatalogEntities === 'function' ? getAllCatalogEntities(['maps']) : [];
    const root = (typeof compendioData !== 'undefined' && compendioData.maps) ? compendioData.maps : {};
    const mapSelectOpts = `<option value="">🗺️ Grade Tática Escura (Padrão)</option>` + allMaps.map(m => {
        const entry = m.groupKey ? root[m.groupKey]?.children?.[m.itemKey] : root[m.itemKey];
        const path = entry?.path || '';
        if (!path) return '';
        const hasFog = Boolean(tabletopState.savedMapFogs[getTabletopMapFogKey(path)]?.fogRegions?.length);
        return `<option value="${escapeHtmlText(path)}" ${tabletopState.mapPath === path ? 'selected' : ''}>🗺️ ${escapeHtmlText(m.title)}${hasFog ? ' (🌫️ Fog Salva)' : ''}</option>`;
    }).join('');

    const instances = Object.values(tabletopState.mapInstances).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const currentFogKey = getTabletopMapFogKey(tabletopState.mapPath);
    const hasCurrentSavedFog = Boolean(tabletopState.savedMapFogs[currentFogKey]);
    const savedFogList = Object.entries(tabletopState.savedMapFogs);

    panel.innerHTML = `
        <div class="studio-header">
            <h3 style="margin:0; color:#d8b467;">🗺️ Gerenciador de Instâncias & Névoa por Mapa</h3>
            <button type="button" class="btn-mini danger" onclick="closeChestTokenModal()">✕</button>
        </div>
        <div style="padding:14px; overflow-y:auto; max-height:74vh; display:flex; flex-direction:column; gap:14px;">
            <div style="background:#15171e; border:1px solid #3c4257; border-radius:6px; padding:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <strong style="color:#f2cf83; font-size:13px;">Cena Ativa: ${escapeHtmlText(tabletopState.activeMapInstanceName || 'Cena')}</strong>
                        <div style="font-size:11px; color:#9da3b8;">Mapa base: ${escapeHtmlText(resolveMapDisplayName(tabletopState.mapPath))} • ${tabletopState.tokens.length} tokens · ${tabletopState.fogRegions.length} fogs · ${(tabletopState.textBoxes || []).length} textos · ${(tabletopState.drawings || []).length} desenhos</div>
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        <button type="button" class="btn-mini" onclick="saveCurrentMapInstanceState({notify:true}); openMapInstancesModal();">💾 Salvar Estado</button>
                        <button type="button" class="btn-mini" onclick="createNewMapInstance({cloneCurrent:true}); openMapInstancesModal();">📋 Duplicar Cena</button>
                        <button type="button" class="btn-mini" onclick="saveCurrentFogToMapPreset(); openMapInstancesModal();">🌫️💾 Salvar Fog no Mapa</button>
                        ${hasCurrentSavedFog ? `<button type="button" class="btn-mini" onclick="loadSavedFogFromMapPreset(); openMapInstancesModal();">🌫️📥 Aplicar Fog do Mapa</button>` : ''}
                    </div>
                </div>
            </div>

            <div style="background:#15171e; border:1px solid #3c4257; border-radius:6px; padding:10px;">
                <strong style="color:#8df596; font-size:12px; display:block; margin-bottom:8px;">➕ Criar Nova Instância (sem apagar a cena atual)</strong>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">
                    <input type="text" id="tt-new-inst-name" class="form-control" placeholder="Nome da nova cena (ex: Masmo. Sala 2)">
                    <select id="tt-new-inst-map" class="form-control">${mapSelectOpts}</select>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; gap:12px; font-size:11.5px; color:#c8cde0;">
                        <label style="cursor:pointer;"><input type="checkbox" id="tt-new-inst-keep-pcs" checked> Manter tokens de PJs</label>
                        <label style="cursor:pointer;"><input type="checkbox" id="tt-new-inst-load-fog" checked> Usar Fog salva do mapa (se houver)</label>
                    </div>
                    <button type="button" class="btn-save-primary" style="padding:5px 12px; font-size:12px;" onclick="createNewMapInstance({ name: document.getElementById('tt-new-inst-name').value, mapPath: document.getElementById('tt-new-inst-map').value, keepPartyTokens: document.getElementById('tt-new-inst-keep-pcs').checked, useSavedMapFog: document.getElementById('tt-new-inst-load-fog').checked }); openMapInstancesModal();">✨ Criar e Abrir</button>
                </div>
            </div>

            <div>
                <strong style="color:#f2cf83; font-size:12px; display:block; margin-bottom:6px;">📚 Instâncias Salvas (${instances.length})</strong>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${instances.map(inst => {
                        const isCur = inst.id === tabletopState.activeMapInstanceId;
                        const safeId = `'${String(inst.id).replace(/'/g, "\\'")}'`;
                        return `
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:8px 10px; border-radius:6px; background:${isCur ? '#252216' : '#181a22'}; border:1px solid ${isCur ? '#d8b467' : '#303445'};">
                                <div style="min-width:0;">
                                    <div style="font-size:12.5px; font-weight:bold; color:${isCur ? '#ffd54f' : '#e4e7f0'};">${isCur ? '▶ ' : ''}${escapeHtmlText(inst.name)}</div>
                                    <div style="font-size:10.5px; color:#9499ad;">🗺️ ${escapeHtmlText(resolveMapDisplayName(inst.mapPath))} • ${(inst.tokens || []).length} tokens · ${(inst.fogRegions || []).length} fogs · ${(inst.textBoxes || []).length} textos · ${(inst.drawings || []).length} traços</div>
                                </div>
                                <div style="display:flex; gap:5px; flex:0 0 auto;">
                                    ${isCur ? `<span class="vis-pill active-studied">Ativa</span>` : `<button type="button" class="btn-summon-card" style="padding:3px 9px; font-size:11px;" onclick="switchToMapInstance(${safeId}); closeChestTokenModal();">Carregar</button>`}
                                    <button type="button" class="btn-mini" onclick="const nv=prompt('Novo nome da instância:', '${escapeHtmlText(inst.name).replace(/'/g, "\\'")}'); if(nv){ renameMapInstance(${safeId}, nv); openMapInstancesModal(); }" title="Renomear">✏️</button>
                                    ${instances.length > 1 ? `<button type="button" class="btn-mini danger" onclick="deleteMapInstance(${safeId}); openMapInstancesModal();" title="Excluir instância">🗑️</button>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            ${savedFogList.length > 0 ? `
                <div>
                    <strong style="color:#9ecbff; font-size:12px; display:block; margin-bottom:6px;">🌫️ Névoas Salvas por Mapa Base (${savedFogList.length})</strong>
                    <div style="display:flex; flex-direction:column; gap:5px;">
                        ${savedFogList.map(([k, fg]) => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:#14161e; border:1px solid #2b3145; border-radius:5px; font-size:11.5px;">
                                <span>🗺️ ${escapeHtmlText(fg.mapName || resolveMapDisplayName(fg.mapPath))} — <strong>${(fg.fogRegions || []).length}</strong> região(ões)</span>
                                <button type="button" class="btn-mini danger" onclick="delete tabletopState.savedMapFogs['${k.replace(/'/g, "\\'")}']; saveLocalPersistence(); openMapInstancesModal();">🗑️</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    backdrop.classList.add('open');
}

function onTabletopMapChange(newMapPath, opts = {}) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) {
        showToast('🔒 Apenas o Mestre pode trocar o mapa do Tabletop.');
        return;
    }
    ensureTabletopExtendedState();
    const targetPath = newMapPath || '';

    // 1. Sempre salva automaticamente o estado completo da instância atual antes de trocar
    saveCurrentMapInstanceState({ persist: false, sync: false });

    // 2. Se pediu Explicitamente apenas trocar imagem de fundo da instância atual:
    if (opts.replaceBackgroundOnly) {
        tabletopState.mapPath = targetPath;
        saveCurrentMapInstanceState({ persist: false, sync: false });
        saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopSceneSync) {
            CompendioNetAdapter.broadcastTabletopSceneSync(buildSceneSyncPayloadFromActive());
        }
        window.tabletopCamera.initialized = false;
        renderTabletopModule();
        return;
    }

    // 3. Caso contrário: procura instância já salva para o mapa de destino; se não existir, cria uma nova (restaurando fog salva do mapa, se houver!)
    if (!opts.forceNew) {
        const candidates = Object.values(tabletopState.mapInstances)
            .filter(inst => inst && inst.mapPath === targetPath && inst.id !== tabletopState.activeMapInstanceId)
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (candidates.length > 0) {
            switchToMapInstance(candidates[0].id, { skipSaveCurrent: true });
            return;
        }
    }

    createNewMapInstance({
        mapPath: targetPath,
        keepPartyTokens: Boolean(opts.keepPartyTokens),
        useSavedMapFog: true
    });
}

function isTokenMovableByCurrentUser(tok) {
    if (!tok) return false;
    if (tok.locked) return false;
    const p = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    if (!p || p.isUnauthenticated || !p.id) return false;
    if (_isVttEffectiveGm(p)) return true;
    if (!tok.ownerId || tok.ownerId === p.id) return true;
    return Boolean(tok.allowPlayersMove);
}

function isTokenVisibleToCurrentUser(tok, activePl = null) {
    if (!tok) return false;
    const p = activePl || (typeof getActivePlayer === 'function' ? getActivePlayer() : null);
    if (_isVttEffectiveGm(p)) return true;
    return !tok.hiddenFromPlayers;
}

function formatChestSummaryText(tok, isGm, variant = 'badge') {
    const itemsKnown = Boolean(isGm || tok.revealItemCountToPlayers);
    const itemCount = Array.isArray(tok.chestItems) ? tok.chestItems.length : 0;
    const goldVal = Number(tok.chestGold) || 0;
    if (variant === 'list') {
        return itemsKnown ? `${itemCount} itens` : (tok.locked ? '🔒 Trancado' : 'Baú');
    }
    if (variant === 'drawer') {
        const countPart = itemsKnown ? `${itemCount} itens` : 'Itens ocultos';
        return `${countPart} · ${goldVal} PO${tok.locked ? ' 🔒' : ''}`;
    }
    if (variant === 'bar') {
        const countPart = itemsKnown ? `${itemCount} itens · ` : '';
        return `🧰 ${countPart}${goldVal} PO${tok.locked ? ' 🔒' : ''}`;
    }
    return itemsKnown ? `🧰 ${itemCount} itens` : (tok.locked ? '🧰 🔒' : '🧰 Baú');
}

function canCurrentUserLootToken(tok, activePl = null, targetChar = null) {
    const p = activePl || (typeof getActivePlayer === 'function' ? getActivePlayer() : null);
    if (!tok) return false;
    if (_isVttEffectiveGm(p)) return true;
    if (!p || p.isUnauthenticated || !p.id) return false;
    if (tok.hiddenFromPlayers) return false;
    const policy = tok.lootPolicy || 'all';
    if (policy === 'players') {
        return Array.isArray(tok.allowedPlayerIds) && tok.allowedPlayerIds.includes(p.id);
    }
    if (policy === 'characters') {
        const allowedChars = Array.isArray(tok.allowedCharIds) ? tok.allowedCharIds : [];
        if (targetChar) return allowedChars.includes(targetChar.id);
        return (typeof charactersData !== 'undefined' ? charactersData : []).some(c =>
            canAccessFullCharacterSheet(c) && allowedChars.includes(c.id)
        );
    }
    return true;
}

function toggleTabletopTokenVisibility(tokenId) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) {
        showToast('🔒 Apenas o Mestre pode ocultar ou mostrar tokens.');
        return;
    }
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    tok.hiddenFromPlayers = !tok.hiddenFromPlayers;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    updateTabletopSelectionUI();
    showToast(tok.hiddenFromPlayers ? `🙈 "${tok.name}" ocultado dos jogadores.` : `👁️ "${tok.name}" agora visível aos jogadores.`);
}

function toggleTabletopTokenLock(tokenId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    const p = getActivePlayer();
    const isGm = _isVttEffectiveGm(p);
    if (!isGm && (!p || tok.ownerId !== p.id)) {
        showToast('⚠️ Apenas o Mestre ou o dono pode travar/destravar este token.');
        return;
    }
    tok.locked = !tok.locked;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    updateTabletopTokenDom(tok.id);
    updateTabletopSelectionUI();
    showToast(tok.locked ? `🔒 Token "${tok.name}" travado no mapa.` : `🔓 Token "${tok.name}" liberado.`);
}

function setTokenFootprintSize(tokenId, squares) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok || !CompendioNetAdapter.canControlEntity(tok.ownerId)) return;
    tok.sizeSquares = Math.max(1, Math.min(6, parseInt(squares, 10) || 1));
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
    }
    updateTabletopTokenDom(tok.id);
    updateTabletopSelectionUI();
}

function selectTabletopToken(tokenId) {
    clearAllTabletopSelections('token');
    selectedTabletopTokenId = tokenId;
    updateTabletopSelectionUI();
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (tok) {
        const { gx } = getTabletopGridMetrics();
        const span = (Number(tok.sizeSquares) || 1) * gx;
        centerTabletopCameraOnWorld((Number(tok.x) || 0) + span / 2, (Number(tok.y) || 0) + span / 2);
    }
}

function removeTabletopToken(tokenId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    if (!CompendioNetAdapter.canControlEntity(tok.ownerId)) {
        showToast('⚠️ Permissão negada para remover token de outro jogador.');
        return;
    }
    tabletopState.tokens = tabletopState.tokens.filter(t => t.id !== tokenId);
    if (selectedTabletopTokenId === tokenId) selectedTabletopTokenId = null;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('delete', tokenId);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
}

function clearTabletopTokens() {
    if (!confirm('Remover todos os tokens do Tabletop?')) return;
    tabletopState.tokens = [];
    selectedTabletopTokenId = null;
    saveLocalPersistence();
    CompendioNetAdapter.broadcastTabletop();
    renderTabletopModule();
}

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

function snapTokenCoordsToGrid(wx, wy, tok) {
    const m = getTabletopGridMetrics();
    const col = Math.round((wx - m.ox) / m.gx);
    const row = Math.round((wy - m.oy) / m.gy);
    return {
        x: Math.max(0, Math.round(m.ox + col * m.gx + 3)),
        y: Math.max(0, Math.round(m.oy + row * m.gy + 3))
    };
}

function updateTabletopTokenDom(tokenId) {
    const tok = tabletopState?.tokens?.find(t => String(t.id) === String(tokenId));
    const el = document.querySelector(`.tt-token[data-token-id="${CSS?.escape ? CSS.escape(String(tokenId)) : tokenId}"]`);
    if (!tok || !el) return false;
    const p = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    const isGm = _isVttEffectiveGm(p);
    if (!isTokenVisibleToCurrentUser(tok, p)) {
        el.remove();
        return false;
    }
    const { gx } = getTabletopGridMetrics();
    const footprint = Math.max(1, Number(tok.sizeSquares) || 1);
    const sz = Math.max(24, (gx * footprint) - 6);
    el.style.left = `${tok.x}px`;
    el.style.top = `${tok.y}px`;
    el.style.width = `${sz}px`;
    el.style.height = `${sz}px`;
    el.classList.toggle('is-locked-token', Boolean(tok.locked));
    el.classList.toggle('is-hidden-token', Boolean(tok.hiddenFromPlayers));
    el.classList.toggle('selected-token', String(tok.id) === String(selectedTabletopTokenId));
    const hpEl = el.querySelector('.tt-token-hp');
    if (hpEl) {
        if (tok.type === 'gold') hpEl.textContent = `🪙 ${Number(tok.goldAmount) || 0} PO`;
        else if (tok.type === 'chest') hpEl.textContent = formatChestSummaryText(tok, isGm, 'badge');
        else if (tok.type === 'item') hpEl.textContent = '⚔️ Item';
        else {
            const showExact = canSeeTokenExactStats(tok);
            hpEl.textContent = showExact ? `${tok.hpCurrent}/${tok.hpMax}` : describeQualitativeHealth(tok.hpCurrent, tok.hpMax, tok.type);
        }
    }
    const imgEl = el.querySelector('.tt-token-img');
    const initEl = el.querySelector('.tt-token-initials');
    if (imgEl && tok.imgSrc && imgEl.getAttribute('src') !== tok.imgSrc) {
        imgEl.dataset.fallbackIdx = '0';
        imgEl.style.display = '';
        imgEl.src = tok.imgSrc;
        if (initEl) initEl.style.display = 'none';
    }
    return true;
}

function handleTabletopTokenImgLoad(imgEl) {
    if (!imgEl) return;
    imgEl.style.display = '';
    const tokenEl = imgEl.closest('.tt-token');
    const initEl = tokenEl ? tokenEl.querySelector('.tt-token-initials') : null;
    if (initEl) initEl.style.display = 'none';

    const tokId = imgEl.dataset.tokenId;
    const loadedSrc = imgEl.getAttribute('src') || '';
    if (tokId && loadedSrc && typeof tabletopState !== 'undefined' && Array.isArray(tabletopState.tokens)) {
        const tok = tabletopState.tokens.find(t => String(t.id) === String(tokId));
        if (tok && tok.imgSrc !== loadedSrc && !/^data:/i.test(loadedSrc)) {
            tok.imgSrc = loadedSrc;
        }
    }
}

function handleTabletopTokenImgError(imgEl) {
    if (!imgEl) return;
    let paths = [];
    try { paths = JSON.parse(imgEl.dataset.fallbackPaths || '[]'); } catch (e) {}
    const nextIdx = (Number(imgEl.dataset.fallbackIdx) || 0) + 1;
    if (nextIdx < paths.length) {
        imgEl.dataset.fallbackIdx = String(nextIdx);
        imgEl.style.display = '';
        imgEl.src = paths[nextIdx];
        return;
    }
    imgEl.style.display = 'none';
    const tokenEl = imgEl.closest('.tt-token');
    const initEl = tokenEl ? tokenEl.querySelector('.tt-token-initials') : null;
    if (initEl) initEl.style.display = '';
}

function updateTabletopSelectionUI() {
    document.querySelectorAll('.tt-token[data-token-id]').forEach(el => {
        el.classList.toggle('selected-token', String(el.getAttribute('data-token-id')) === String(selectedTabletopTokenId));
    });
    document.querySelectorAll('.tt-aoe-wrapper[data-shape-id]').forEach(el => {
        el.classList.toggle('is-selected', String(el.getAttribute('data-shape-id')) === String(window.selectedShapeId));
    });
    document.querySelectorAll('.tt-textbox-wrapper[data-textbox-id]').forEach(el => {
        el.classList.toggle('is-selected', String(el.getAttribute('data-textbox-id')) === String(window.selectedTextBoxId));
    });
    document.querySelectorAll('.tt-drawing-wrapper[data-drawing-id]').forEach(el => {
        el.classList.toggle('is-selected', String(el.getAttribute('data-drawing-id')) === String(window.selectedDrawingId));
    });
    document.querySelectorAll('.tt-fog-wrapper[data-fog-id]').forEach(el => {
        el.classList.toggle('is-selected', String(el.getAttribute('data-fog-id')) === String(window.selectedFogId));
    });
    document.querySelectorAll('.tt-drawer-card[data-drawer-token-id]').forEach(el => {
        el.classList.toggle('is-selected', String(el.getAttribute('data-drawer-token-id')) === String(selectedTabletopTokenId));
    });
    const barRoot = document.getElementById('tt-selection-bar-root');
    if (barRoot) {
        const p = getActivePlayer();
        const isGm = _isVttEffectiveGm(p);
        barRoot.innerHTML = buildSelectedControlBarHtml(isGm);
    }
}

function startDragTabletopToken(e, tokenId) {
    // Passa cliques especiais (Ping / Régua / Calibração / Pincel / Texto / Desenho de Fog) para a lógica do estágio
    if (e.button === 2 || e.altKey || ['ruler', 'ping', 'calibrate', 'fog', 'text', 'brush'].includes(window.tabletopToolMode)) {
        return; // deixa propagar para onTabletopStageMouseDown
    }
    if (e.button !== 0) return;
    e.stopPropagation();

    clearMyPersistentRuler(true);
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;

    // Regra exata no modo 'move': clicar em um token NÃO selecionado apenas seleciona (sem arrastar já)
    if (String(selectedTabletopTokenId) !== String(tokenId)) {
        clearAllTabletopSelections('token');
        selectedTabletopTokenId = tokenId;
        updateTabletopSelectionUI();
        return;
    }

    // Já está selecionado: só move se for movível pelo usuário atual
    if (!isTokenMovableByCurrentUser(tok)) {
        showToast(tok.locked ? `🔒 Token "${tok.name}" está travado pelo Mestre.` : `🔒 Token pertence a outro jogador.`);
        return;
    }

    const tokenEl = e.currentTarget;
    const { w: stageW, h: stageH } = getTabletopStageDimensions();
    const scale = window.tabletopCamera?.scale || 1;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const origX = Number(tok.x) || 0;
    const origY = Number(tok.y) || 0;
    let movedAny = false;
    let lastDeltaSent = 0;

    window.ttActiveInteraction = { type: 'token', id: tok.id };

    function onMouseMove(moveEv) {
        const dx = (moveEv.clientX - startMouseX) / scale;
        const dy = (moveEv.clientY - startMouseY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedAny = true;
        const nx = Math.max(0, Math.min(stageW - 40, origX + dx));
        const ny = Math.max(0, Math.min(stageH - 40, origY + dy));
        tok.x = Math.round(nx);
        tok.y = Math.round(ny);
        tokenEl.style.left = `${tok.x}px`;
        tokenEl.style.top = `${tok.y}px`;
        const now = Date.now();
        if (movedAny && now - lastDeltaSent > 70 && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
            lastDeltaSent = now;
            CompendioNetAdapter.broadcastTokenDelta('move', { id: tok.id, x: tok.x, y: tok.y });
        }
    }

    function onMouseUp() {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.ttActiveInteraction = null;
        if (movedAny && tabletopState.snapToGrid) {
            const snapped = snapTokenCoordsToGrid(tok.x, tok.y, tok);
            tok.x = snapped.x;
            tok.y = snapped.y;
            tokenEl.style.left = `${tok.x}px`;
            tokenEl.style.top = `${tok.y}px`;
        }
        if (movedAny) {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
                CompendioNetAdapter.broadcastTokenDelta('move', { id: tok.id, x: tok.x, y: tok.y });
            } else if (typeof CompendioNetAdapter !== 'undefined') {
                CompendioNetAdapter.broadcastTabletop();
            }
        }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

/* ------------------ RÉGUA PERSISTENTE & MÃOZINHA (CURSORES) ------------------ */
function clearMyPersistentRuler(broadcast = true) {
    const cid = window.localClientId || 'local';
    if (!window.activeTabletopRulers || !window.activeTabletopRulers[cid]) return false;
    delete window.activeTabletopRulers[cid];
    renderTabletopRulersLayer();
    if (broadcast && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendRulerClear) {
        CompendioNetAdapter.sendRulerClear(cid);
    }
    return true;
}

function renderTabletopRulersLayer() {
    const svgOverlay = document.getElementById('tabletop-ruler-svg');
    const labelsLayer = document.getElementById('tt-ruler-labels-layer');
    if (!svgOverlay) return;
    const entries = Object.values(window.activeTabletopRulers || {});
    svgOverlay.innerHTML = entries.map(r => {
        const clr = escapeHtmlText(r.color || '#f2cf83');
        return `
            <line x1="${r.startX}" y1="${r.startY}" x2="${r.endX}" y2="${r.endY}" stroke="${clr}" stroke-width="3.5" stroke-dasharray="9,5"/>
            <circle cx="${r.startX}" cy="${r.startY}" r="5.5" fill="${clr}"/>
            <circle cx="${r.endX}" cy="${r.endY}" r="5.5" fill="${clr}" stroke="#111" stroke-width="1.5"/>
        `;
    }).join('');
    if (labelsLayer) {
        labelsLayer.innerHTML = entries.map(r => {
            const clr = escapeHtmlText(r.color || '#f2cf83');
            const safeOwner = r.playerId && typeof getPlayerDisplayName === 'function'
                ? getPlayerDisplayName(r.playerId, r.playerName || 'Jogador')
                : (r.playerName || '');
            const labelOwner = safeOwner ? `${escapeHtmlText(safeOwner)}: ` : '';
            return `
                <div class="tt-ruler-pill" style="left:${r.endX + 12}px; top:${r.endY - 14}px; border-color:${clr};">
                    ${labelOwner}📏 ${escapeHtmlText(r.text || '')}
                </div>
            `;
        }).join('');
    }
}

function renderRemoteCursorsLayer() {
    const layer = document.getElementById('tt-remote-cursors-layer');
    if (!layer) return;
    const entries = Object.values(window.remoteTabletopCursors || {});
    layer.innerHTML = entries.map(c => {
        if (!c || c.visible === false || c.clientId === window.localClientId) return '';
        const clr = escapeHtmlText(c.color || '#d8b467');
        const safeName = typeof getPlayerDisplayName === 'function'
            ? getPlayerDisplayName(c.playerId, c.playerName || 'Jogador')
            : (c.playerName || 'Jogador');
        return `
            <div class="tt-remote-cursor" style="transform: translate3d(${Math.round(c.x)}px, ${Math.round(c.y)}px, 0);">
                <svg viewBox="0 0 24 24" width="22" height="22">
                    <path d="M5 3l14 9-6.5 1.8L9 20.5 5 3z" fill="${clr}" stroke="#0d0e13" stroke-width="1.8" stroke-linejoin="round"/>
                </svg>
                <span class="tt-remote-cursor-name" style="border-color:${clr}; color:${clr};">${escapeHtmlText(safeName)}</span>
            </div>
        `;
    }).join('');
}

function onTabletopViewportMouseMove(e) {
    const world = clientToWorldCoords(e.clientX, e.clientY);
    if (window.tabletopToolMode === 'fog' && window.fogDrawShape === 'polygon' && Array.isArray(window.fogPolygonDraft) && window.fogPolygonDraft.length > 0) {
        updateFogPolygonDraftPreview(world);
    }
    if (!window.tabletopCursorShareEnabled) return;
    if (typeof CompendioNetAdapter === 'undefined' || !CompendioNetAdapter.sendCursorMove) return;
    CompendioNetAdapter.sendCursorMove(world.x, world.y, true);
}

function onTabletopViewportMouseLeave() {
    if (!window.tabletopCursorShareEnabled) return;
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendCursorMove) {
        CompendioNetAdapter.sendCursorMove(0, 0, false);
    }
}

/* ------------------ FORMAS POSICIONÁVEIS SVG (RESIZE, ALONGAR, ROTATE, TRIÂNGULO, DELETE) ------------------ */
function normalizeShapeObj(raw, gridPx = 56) {
    if (!raw || typeof raw !== 'object') return raw;
    const shape = raw.shape === 'cube' ? 'square' : (raw.shape || 'circle');
    const basePx = Math.max(28, (Number(raw.sizeSquares) || 4) * gridPx);
    const width = Number(raw.width) || basePx;
    const height = Number(raw.height) || (shape === 'line' ? Math.max(gridPx, Math.round(basePx / 3)) : basePx);
    return Object.assign({}, raw, {
        shape,
        width: Math.max(24, Math.round(width)),
        height: Math.max(24, Math.round(height)),
        rotation: Number(raw.rotation) || 0,
        color: raw.color || '#e65100',
        x: Math.round(Number(raw.x) || 0),
        y: Math.round(Number(raw.y) || 0)
    });
}

function renderShapeSvgMarkup(a) {
    const clr = escapeHtmlText(a.color || '#e65100');
    const fill = `${clr}3b`;
    if (a.shape === 'circle') {
        return `<ellipse cx="50" cy="50" rx="48" ry="48" fill="${fill}" stroke="${clr}" stroke-width="2.6" vector-effect="non-scaling-stroke"/>`;
    }
    if (a.shape === 'triangle') {
        return `<polygon points="50,3 97,96 3,96" fill="${fill}" stroke="${clr}" stroke-width="2.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    }
    if (a.shape === 'cone') {
        return `<polygon points="2,50 97,4 97,96" fill="${fill}" stroke="${clr}" stroke-width="2.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    }
    return `<rect x="2" y="2" width="96" height="96" rx="${a.shape === 'line' ? 3 : 6}" fill="${fill}" stroke="${clr}" stroke-width="2.6" vector-effect="non-scaling-stroke"/>`;
}

function _renderBoxTransformHandlesHtml(fnName, safeId) {
    return `
        <div class="tt-shape-rotate-stem"></div>
        <div class="tt-shape-rotate-handle" onmousedown="${fnName}(event, ${safeId}, 'rotate')" title="Girar">↻</div>
        <div class="tt-shape-handle h-nw" onmousedown="${fnName}(event, ${safeId}, 'nw')" title="Redimensionar"></div>
        <div class="tt-shape-handle h-ne" onmousedown="${fnName}(event, ${safeId}, 'ne')" title="Redimensionar"></div>
        <div class="tt-shape-handle h-sw" onmousedown="${fnName}(event, ${safeId}, 'sw')" title="Redimensionar"></div>
        <div class="tt-shape-handle h-se" onmousedown="${fnName}(event, ${safeId}, 'se')" title="Redimensionar"></div>
        <div class="tt-shape-handle h-n" onmousedown="${fnName}(event, ${safeId}, 'n')" title="Alongar verticalmente"></div>
        <div class="tt-shape-handle h-s" onmousedown="${fnName}(event, ${safeId}, 's')" title="Alongar verticalmente"></div>
        <div class="tt-shape-handle h-e" onmousedown="${fnName}(event, ${safeId}, 'e')" title="Alongar horizontalmente"></div>
        <div class="tt-shape-handle h-w" onmousedown="${fnName}(event, ${safeId}, 'w')" title="Alongar horizontalmente"></div>
    `;
}

function _startBoxTransformDrag(e, cfg) {
    if (e.button !== 0 || !cfg || !cfg.item) return;
    e.stopPropagation();
    e.preventDefault();

    const { item, wrapper, rotator, interType, wProp = 'width', hProp = 'height', minW = 24, minH = 24, handleKind, onSync, onFinish } = cfg;
    window.ttActiveInteraction = { type: interType, id: item.id };

    const scale = window.tabletopCamera?.scale || 1;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const origX = Number(item.x) || 0;
    const origY = Number(item.y) || 0;
    const origW = Math.max(minW, Number(item[wProp]) || minW);
    const origH = Math.max(minH, Number(item[hProp]) || minH);
    const rad = (Number(item.rotation) || 0) * Math.PI / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const centerWorld = { x: origX + origW / 2, y: origY + origH / 2 };
    let lastSent = 0;

    function onMove(mv) {
        if (handleKind === 'rotate') {
            const worldPt = clientToWorldCoords(mv.clientX, mv.clientY);
            const angleDeg = Math.atan2(worldPt.y - centerWorld.y, worldPt.x - centerWorld.x) * 180 / Math.PI + 90;
            item.rotation = Math.round(((angleDeg % 360) + 360) % 360);
            if (rotator) rotator.style.transform = `rotate(${item.rotation}deg)`;
        } else {
            const dxWorld = (mv.clientX - startMouseX) / scale;
            const dyWorld = (mv.clientY - startMouseY) / scale;
            const dxLocal = dxWorld * cosR + dyWorld * sinR;
            const dyLocal = -dxWorld * sinR + dyWorld * cosR;
            let nextX = origX;
            let nextY = origY;
            let nextW = origW;
            let nextH = origH;

            if (handleKind.includes('e')) nextW = Math.max(minW, Math.round(origW + dxLocal));
            if (handleKind.includes('s')) nextH = Math.max(minH, Math.round(origH + dyLocal));
            if (handleKind.includes('w')) {
                nextW = Math.max(minW, Math.round(origW - dxLocal));
                nextX = Math.round(origX + (origW - nextW));
            }
            if (handleKind.includes('n')) {
                nextH = Math.max(minH, Math.round(origH - dyLocal));
                nextY = Math.round(origY + (origH - nextH));
            }
            item.x = nextX;
            item.y = nextY;
            item[wProp] = nextW;
            item[hProp] = nextH;
            if (wrapper) {
                wrapper.style.left = `${item.x}px`;
                wrapper.style.top = `${item.y}px`;
                wrapper.style.width = `${item[wProp]}px`;
                wrapper.style.height = `${item[hProp]}px`;
            }
        }
        if (onSync) {
            const now = Date.now();
            if (now - lastSent > 70) {
                lastSent = now;
                onSync(item);
            }
        }
    }

    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.ttActiveInteraction = null;
        if (onFinish) onFinish(item);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function buildSingleShapeWrapperHtml(rawShape, gridPx) {
    const a = normalizeShapeObj(rawShape, gridPx);
    const isSel = String(window.selectedShapeId) === String(a.id);
    const safeId = `'${String(a.id).replace(/'/g, "\\'")}'`;
    return `
        <div class="tt-aoe-wrapper ${isSel ? 'is-selected' : ''}"
             data-shape-id="${escapeHtmlText(a.id)}"
             style="left:${a.x}px; top:${a.y}px; width:${a.width}px; height:${a.height}px;"
             onmousedown="startDragAoeTemplate(event, ${safeId})"
             title="${escapeHtmlText(a.label || a.shape)} (Clique e arraste para mover • Cantos redimensionam • Alças de borda alongam • ↻ rotaciona)">
            <div class="tt-aoe-rotator" style="transform: rotate(${a.rotation}deg);">
                <svg class="tt-aoe-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${renderShapeSvgMarkup(a)}</svg>
                ${_renderBoxTransformHandlesHtml('startTransformAoeShape', safeId)}
            </div>
            <span class="tt-aoe-label" style="border-color:${escapeHtmlText(a.color)};">
                <span>${escapeHtmlText(a.label || a.shape)}</span>
                <button type="button" onmousedown="event.stopPropagation()" onclick="removeAoeTemplate(${safeId}, event)" title="Remover esta forma">✕</button>
            </span>
        </div>
    `;
}

function addAoeTemplateToTabletop(shape = 'circle', sizeSquares = 4, color = '#e65100', label = '') {
    ensureTabletopExtendedState();
    const shapeNames = { circle: 'Esfera', cube: 'Cubo', square: 'Quadrado', triangle: 'Triângulo', cone: 'Cone', line: 'Linha' };
    const { gx } = getTabletopGridMetrics();
    const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { gridMetersPerSquare: 1.5 };
    const meters = sizeSquares * (Number(rules.gridMetersPerSquare) || 1.5);
    const center = getTabletopCameraCenterWorld();
    const normShape = shape === 'cube' ? 'square' : shape;
    const w = Math.max(gx, Math.round((Number(sizeSquares) || 4) * gx));
    const h = normShape === 'line' ? Math.max(gx, Math.round(w / 3)) : w;
    const tpl = {
        id: 'aoe-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100),
        shape: normShape,
        sizeSquares: Number(sizeSquares) || 4,
        width: w,
        height: h,
        rotation: 0,
        color,
        label: label || `${shapeNames[normShape] || 'Área'} ${meters}m`,
        x: Math.max(20, Math.round(center.x - w / 2)),
        y: Math.max(20, Math.round(center.y - h / 2)),
        ownerId: activePlayerId
    };
    tabletopState.aoeTemplates.push(tpl);
    clearAllTabletopSelections('shape');
    window.selectedShapeId = tpl.id;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastShapeDelta) {
        CompendioNetAdapter.broadcastShapeDelta('upsert', tpl);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    showToast(`📐 Forma "${tpl.label}" adicionada! Arraste para mover ou use as alças para redimensionar/alongar/girar.`);
}

function updateTabletopShapeDom(shapeId) {
    const raw = tabletopState?.aoeTemplates?.find(a => String(a.id) === String(shapeId));
    const el = document.querySelector(`.tt-aoe-wrapper[data-shape-id="${CSS?.escape ? CSS.escape(String(shapeId)) : shapeId}"]`);
    if (!raw || !el) return false;
    const { gx } = getTabletopGridMetrics();
    const a = normalizeShapeObj(raw, gx);
    el.style.left = `${a.x}px`;
    el.style.top = `${a.y}px`;
    el.style.width = `${a.width}px`;
    el.style.height = `${a.height}px`;
    const rotEl = el.querySelector('.tt-aoe-rotator');
    if (rotEl) rotEl.style.transform = `rotate(${a.rotation}deg)`;
    const svg = el.querySelector('.tt-aoe-svg');
    if (svg) svg.innerHTML = renderShapeSvgMarkup(a);
    const lblSpan = el.querySelector('.tt-aoe-label > span');
    if (lblSpan) lblSpan.textContent = a.label || a.shape;
    return true;
}

function updateAoeShapeField(aoeId, field, value) {
    ensureTabletopExtendedState();
    const tpl = tabletopState.aoeTemplates.find(a => String(a.id) === String(aoeId));
    if (!tpl) return;
    tpl[field] = value;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastShapeDelta) {
        CompendioNetAdapter.broadcastShapeDelta('upsert', tpl);
    }
    if (!updateTabletopShapeDom(tpl.id)) renderTabletopModule();
}

function removeAoeTemplate(aoeId, ev) {
    if (ev) ev.stopPropagation();
    ensureTabletopExtendedState();
    tabletopState.aoeTemplates = tabletopState.aoeTemplates.filter(a => String(a.id) !== String(aoeId));
    if (String(window.selectedShapeId) === String(aoeId)) window.selectedShapeId = null;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastShapeDelta) {
        CompendioNetAdapter.broadcastShapeDelta('delete', aoeId);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
}

function startDragAoeTemplate(e, aoeId) {
    if (e.button === 2 || e.altKey || ['ruler', 'ping', 'calibrate', 'fog', 'text', 'brush'].includes(window.tabletopToolMode)) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    clearMyPersistentRuler(true);
    ensureTabletopExtendedState();
    const tpl = tabletopState.aoeTemplates.find(a => String(a.id) === String(aoeId));
    if (!tpl) return;
    const { gx } = getTabletopGridMetrics();
    Object.assign(tpl, normalizeShapeObj(tpl, gx));

    clearAllTabletopSelections('shape');
    window.selectedShapeId = tpl.id;
    updateTabletopSelectionUI();

    const el = e.currentTarget;
    const scale = window.tabletopCamera?.scale || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = Number(tpl.x) || 0;
    const origY = Number(tpl.y) || 0;
    let moved = false;
    let lastSent = 0;

    window.ttActiveInteraction = { type: 'shape', id: tpl.id };

    function onMove(mv) {
        const dx = (mv.clientX - startX) / scale;
        const dy = (mv.clientY - startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        tpl.x = Math.round(origX + dx);
        tpl.y = Math.round(origY + dy);
        el.style.left = `${tpl.x}px`;
        el.style.top = `${tpl.y}px`;
        const now = Date.now();
        if (moved && now - lastSent > 70 && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastShapeDelta) {
            lastSent = now;
            CompendioNetAdapter.broadcastShapeDelta('upsert', tpl);
        }
    }
    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.ttActiveInteraction = null;
        if (moved) {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastShapeDelta) {
                CompendioNetAdapter.broadcastShapeDelta('upsert', tpl);
            }
            updateTabletopSelectionUI();
        }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function startTransformAoeShape(e, aoeId, handleKind) {
    ensureTabletopExtendedState();
    const tpl = tabletopState.aoeTemplates.find(a => String(a.id) === String(aoeId));
    if (!tpl) return;
    const { gx } = getTabletopGridMetrics();
    Object.assign(tpl, normalizeShapeObj(tpl, gx));
    clearAllTabletopSelections('shape');
    window.selectedShapeId = tpl.id;
    const wrapper = e.currentTarget.closest('.tt-aoe-wrapper');
    _startBoxTransformDrag(e, {
        item: tpl,
        wrapper,
        rotator: wrapper?.querySelector('.tt-aoe-rotator'),
        interType: 'shape',
        handleKind,
        onSync: (it) => {
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastShapeDelta) {
                CompendioNetAdapter.broadcastShapeDelta('upsert', it);
            }
        },
        onFinish: (it) => {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastShapeDelta) {
                CompendioNetAdapter.broadcastShapeDelta('upsert', it);
            }
            updateTabletopSelectionUI();
        }
    });
}

/* ------------------ CAIXAS DE TEXTO NO TABLETOP ------------------ */
const VTT_TEXT_FONTS = [
    { label: 'Serif Clássica', value: 'Georgia, serif' },
    { label: 'Cinzel / Medieval', value: '"Palatino Linotype", "Book Antiqua", Georgia, serif' },
    { label: 'Sans Limpa', value: 'Verdana, sans-serif' },
    { label: 'Trebuchet', value: '"Trebuchet MS", sans-serif' },
    { label: 'Monospace', value: '"Courier New", monospace' }
];

function normalizeTextBoxObj(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    return Object.assign({}, raw, {
        x: Math.round(Number(raw.x) || 0),
        y: Math.round(Number(raw.y) || 0),
        width: Math.max(60, Math.round(Number(raw.width) || 220)),
        height: Math.max(36, Math.round(Number(raw.height) || 74)),
        rotation: Number(raw.rotation) || 0,
        text: raw.text !== undefined ? String(raw.text) : 'Texto',
        fontFamily: raw.fontFamily || 'Georgia, serif',
        fontSize: Math.max(10, Math.min(120, Number(raw.fontSize) || 22)),
        color: raw.color || '#f2cf83',
        bgColor: raw.bgColor || 'rgba(14, 15, 20, 0.72)',
        bold: Boolean(raw.bold),
        italic: Boolean(raw.italic),
        align: raw.align || 'center',
        hiddenFromPlayers: Boolean(raw.hiddenFromPlayers),
        ownerId: raw.ownerId || ''
    });
}

function canEditVttAnnotation(obj, activePl = null) {
    if (!obj) return false;
    const p = activePl || (typeof getActivePlayer === 'function' ? getActivePlayer() : null);
    if (_isVttEffectiveGm(p)) return true;
    if (!p || p.isUnauthenticated || !p.id) return false;
    if (obj.hiddenFromPlayers) return false;
    return !obj.ownerId || obj.ownerId === p.id;
}

function buildSingleTextBoxWrapperHtml(rawTb, isGm) {
    const tb = normalizeTextBoxObj(rawTb);
    if (!isGm && tb.hiddenFromPlayers) return '';
    const isSel = String(window.selectedTextBoxId) === String(tb.id);
    const isEditing = String(window.editingTextBoxId) === String(tb.id);
    const safeId = `'${String(tb.id).replace(/'/g, "\\'")}'`;
    const styleBg = tb.bgColor === 'transparent' ? 'transparent' : (tb.bgColor || 'rgba(14, 15, 20, 0.72)');
    const textHtml = escapeHtmlText(tb.text || '').replace(/\n/g, '<br>');
    const textStyle = `font-family:${escapeHtmlText(tb.fontFamily)}; font-size:${tb.fontSize}px; color:${escapeHtmlText(tb.color)}; font-weight:${tb.bold ? '700' : '400'}; font-style:${tb.italic ? 'italic' : 'normal'}; text-align:${escapeHtmlText(tb.align)};`;

    return `
        <div class="tt-textbox-wrapper ${isSel ? 'is-selected' : ''} ${tb.hiddenFromPlayers ? 'is-hidden-overlay' : ''}"
             data-textbox-id="${escapeHtmlText(tb.id)}"
             style="left:${tb.x}px; top:${tb.y}px; width:${tb.width}px; height:${tb.height}px;"
             onmousedown="startDragTextBox(event, ${safeId})"
             ondblclick="startInlineEditTextBox(event, ${safeId})"
             title="Caixa de Texto (Clique p/ selecionar/arrastar • Duplo-clique p/ editar)">
            <div class="tt-aoe-rotator" style="transform: rotate(${tb.rotation}deg);">
                <div class="tt-textbox-surface" style="background:${escapeHtmlText(styleBg)}; ${textStyle}">
                    ${(isGm && tb.hiddenFromPlayers) ? `<span class="tt-overlay-hidden-pill" title="Oculto dos jogadores">🙈</span>` : ''}
                    ${isEditing
                        ? `<textarea id="tt-tb-inline-editor" class="tt-textbox-inline-editor" style="${textStyle}" onmousedown="event.stopPropagation()" onkeydown="if(event.key==='Enter' && !event.shiftKey){ event.preventDefault(); this.blur(); } else if(event.key==='Escape'){ window.editingTextBoxId=null; window.ttActiveInteraction=null; renderTabletopModule(); }" onblur="commitInlineTextBoxEdit(${safeId}, this.value)">${escapeHtmlText(tb.text || '')}</textarea>`
                        : `<div class="tt-textbox-content">${textHtml || '<span style="opacity:0.45;">(Vazio)</span>'}</div>`}
                </div>
                ${isEditing ? '' : _renderBoxTransformHandlesHtml('startTransformTextBox', safeId)}
            </div>
        </div>
    `;
}

function addTextBoxToTabletop(wx = null, wy = null, customOpts = {}) {
    ensureTabletopExtendedState();
    const draft = Object.assign({}, window.textBoxDraftConfig || {}, customOpts || {});
    const center = getTabletopCameraCenterWorld();
    const w = Math.max(80, Math.round(Number(draft.width) || 220));
    const h = Math.max(40, Math.round(Number(draft.height) || 74));
    const posX = wx !== null ? Math.round(wx - w / 2) : Math.max(12, Math.round(center.x - w / 2));
    const posY = wy !== null ? Math.round(wy - h / 2) : Math.max(12, Math.round(center.y - h / 2));

    const tb = normalizeTextBoxObj({
        id: 'txt-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
        x: Math.max(4, posX),
        y: Math.max(4, posY),
        width: w,
        height: h,
        rotation: Number(draft.rotation) || 0,
        text: draft.text !== undefined ? draft.text : 'Nova Nota',
        fontFamily: draft.fontFamily || 'Georgia, serif',
        fontSize: Number(draft.fontSize) || 22,
        color: draft.color || '#f2cf83',
        bgColor: draft.bgColor || 'rgba(14, 15, 20, 0.72)',
        bold: Boolean(draft.bold),
        italic: Boolean(draft.italic),
        align: draft.align || 'center',
        hiddenFromPlayers: Boolean(_isVttEffectiveGm() && draft.hiddenFromPlayers),
        ownerId: activePlayerId || ''
    });

    tabletopState.textBoxes.push(tb);
    clearAllTabletopSelections('textbox');
    window.selectedTextBoxId = tb.id;
    if (window.tabletopToolMode === 'text') window.tabletopToolMode = 'move';
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
        CompendioNetAdapter.broadcastTextBoxDelta('upsert', tb);
    }
    renderTabletopModule();
    return tb;
}

function updateTabletopTextBoxDom(tbId) {
    const raw = tabletopState?.textBoxes?.find(t => String(t.id) === String(tbId));
    const el = document.querySelector(`.tt-textbox-wrapper[data-textbox-id="${CSS?.escape ? CSS.escape(String(tbId)) : tbId}"]`);
    if (!raw || !el) return false;
    const isGm = _isVttEffectiveGm();
    if (!isGm && raw.hiddenFromPlayers) {
        el.remove();
        return true;
    }
    const tb = normalizeTextBoxObj(raw);
    el.style.left = `${tb.x}px`;
    el.style.top = `${tb.y}px`;
    el.style.width = `${tb.width}px`;
    el.style.height = `${tb.height}px`;
    el.classList.toggle('is-hidden-overlay', Boolean(tb.hiddenFromPlayers));
    const rotEl = el.querySelector('.tt-aoe-rotator');
    if (rotEl) rotEl.style.transform = `rotate(${tb.rotation}deg)`;
    const surf = el.querySelector('.tt-textbox-surface');
    if (surf) {
        surf.style.background = tb.bgColor === 'transparent' ? 'transparent' : tb.bgColor;
        surf.style.fontFamily = tb.fontFamily;
        surf.style.fontSize = `${tb.fontSize}px`;
        surf.style.color = tb.color;
        surf.style.fontWeight = tb.bold ? '700' : '400';
        surf.style.fontStyle = tb.italic ? 'italic' : 'normal';
        surf.style.textAlign = tb.align;
    }
    const contentEl = el.querySelector('.tt-textbox-content');
    if (contentEl) {
        contentEl.innerHTML = escapeHtmlText(tb.text || '').replace(/\n/g, '<br>') || '<span style="opacity:0.45;">(Vazio)</span>';
        contentEl.style.fontFamily = tb.fontFamily;
        contentEl.style.fontSize = `${tb.fontSize}px`;
        contentEl.style.color = tb.color;
        contentEl.style.fontWeight = tb.bold ? '700' : '400';
        contentEl.style.fontStyle = tb.italic ? 'italic' : 'normal';
        contentEl.style.textAlign = tb.align;
    }
    return true;
}

function updateTextBoxField(tbId, field, value) {
    ensureTabletopExtendedState();
    const tb = tabletopState.textBoxes.find(t => String(t.id) === String(tbId));
    if (!tb || !canEditVttAnnotation(tb)) return;
    if (field === 'hiddenFromPlayers' && !_isVttEffectiveGm()) return;
    tb[field] = value;
    if (['fontFamily', 'fontSize', 'color', 'bgColor', 'bold', 'italic', 'align'].includes(field) && window.textBoxDraftConfig) {
        window.textBoxDraftConfig[field] = value;
    }
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
        CompendioNetAdapter.broadcastTextBoxDelta('upsert', tb);
    }
    if (!updateTabletopTextBoxDom(tb.id)) renderTabletopModule();
    else updateTabletopSelectionUI();
}

function removeTextBox(tbId, ev) {
    if (ev) ev.stopPropagation();
    ensureTabletopExtendedState();
    const tb = tabletopState.textBoxes.find(t => String(t.id) === String(tbId));
    if (tb && !canEditVttAnnotation(tb)) {
        showToast('🔒 Sem permissão para remover este texto.');
        return;
    }
    tabletopState.textBoxes = tabletopState.textBoxes.filter(t => String(t.id) !== String(tbId));
    if (String(window.selectedTextBoxId) === String(tbId)) window.selectedTextBoxId = null;
    if (String(window.editingTextBoxId) === String(tbId)) window.editingTextBoxId = null;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
        CompendioNetAdapter.broadcastTextBoxDelta('delete', tbId);
    }
    renderTabletopModule();
}

function startInlineEditTextBox(e, tbId) {
    if (e) e.stopPropagation();
    ensureTabletopExtendedState();
    const tb = tabletopState.textBoxes.find(t => String(t.id) === String(tbId));
    if (!tb || !canEditVttAnnotation(tb)) return;
    clearAllTabletopSelections('textbox');
    window.selectedTextBoxId = tb.id;
    window.editingTextBoxId = tb.id;
    window.ttActiveInteraction = { type: 'textbox', id: tb.id };
    renderTabletopModule();
    setTimeout(() => {
        const ed = document.getElementById('tt-tb-inline-editor');
        if (ed) {
            ed.focus();
            ed.select();
        }
    }, 10);
}

function commitInlineTextBoxEdit(tbId, newValue) {
    ensureTabletopExtendedState();
    const tb = tabletopState.textBoxes.find(t => String(t.id) === String(tbId));
    window.editingTextBoxId = null;
    window.ttActiveInteraction = null;
    if (tb && canEditVttAnnotation(tb)) {
        tb.text = String(newValue ?? '');
        saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
            CompendioNetAdapter.broadcastTextBoxDelta('upsert', tb);
        }
    }
    if (activeModule === 'tabletop') renderTabletopModule();
}

function startDragTextBox(e, tbId) {
    if (e.button === 2 || e.altKey || ['ruler', 'ping', 'calibrate', 'fog', 'text', 'brush'].includes(window.tabletopToolMode)) return;
    if (e.button !== 0 || String(window.editingTextBoxId) === String(tbId)) return;
    e.stopPropagation();
    clearMyPersistentRuler(true);
    ensureTabletopExtendedState();
    const tb = tabletopState.textBoxes.find(t => String(t.id) === String(tbId));
    if (!tb) return;
    Object.assign(tb, normalizeTextBoxObj(tb));

    clearAllTabletopSelections('textbox');
    window.selectedTextBoxId = tb.id;
    updateTabletopSelectionUI();

    if (!canEditVttAnnotation(tb)) return;
    const el = e.currentTarget;
    const scale = window.tabletopCamera?.scale || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = tb.x;
    const origY = tb.y;
    let moved = false;
    let lastSent = 0;
    window.ttActiveInteraction = { type: 'textbox', id: tb.id };

    function onMove(mv) {
        const dx = (mv.clientX - startX) / scale;
        const dy = (mv.clientY - startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        tb.x = Math.round(origX + dx);
        tb.y = Math.round(origY + dy);
        el.style.left = `${tb.x}px`;
        el.style.top = `${tb.y}px`;
        const now = Date.now();
        if (moved && now - lastSent > 70 && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
            lastSent = now;
            CompendioNetAdapter.broadcastTextBoxDelta('upsert', tb);
        }
    }
    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.ttActiveInteraction = null;
        if (moved) {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
                CompendioNetAdapter.broadcastTextBoxDelta('upsert', tb);
            }
            updateTabletopSelectionUI();
        }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function startTransformTextBox(e, tbId, handleKind) {
    ensureTabletopExtendedState();
    const tb = tabletopState.textBoxes.find(t => String(t.id) === String(tbId));
    if (!tb || !canEditVttAnnotation(tb)) return;
    Object.assign(tb, normalizeTextBoxObj(tb));
    clearAllTabletopSelections('textbox');
    window.selectedTextBoxId = tb.id;
    const wrapper = e.currentTarget.closest('.tt-textbox-wrapper');
    _startBoxTransformDrag(e, {
        item: tb,
        wrapper,
        rotator: wrapper?.querySelector('.tt-aoe-rotator'),
        interType: 'textbox',
        minW: 60,
        minH: 36,
        handleKind,
        onSync: (it) => {
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
                CompendioNetAdapter.broadcastTextBoxDelta('upsert', it);
            }
        },
        onFinish: (it) => {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTextBoxDelta) {
                CompendioNetAdapter.broadcastTextBoxDelta('upsert', it);
            }
            updateTabletopSelectionUI();
        }
    });
}

/* ------------------ PINCEL / DESENHO LIVRE NO TABLETOP ------------------ */
function normalizeDrawingObj(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const pts = Array.isArray(raw.points)
        ? raw.points.filter(p => p && isFinite(p.x) && isFinite(p.y)).map(p => ({ x: Number(p.x), y: Number(p.y) }))
        : [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }];
    return Object.assign({}, raw, {
        x: Math.round(Number(raw.x) || 0),
        y: Math.round(Number(raw.y) || 0),
        width: Math.max(16, Math.round(Number(raw.width) || 60)),
        height: Math.max(16, Math.round(Number(raw.height) || 60)),
        rotation: Number(raw.rotation) || 0,
        color: raw.color || '#ff5252',
        strokeWidth: Math.max(2, Math.min(48, Number(raw.strokeWidth) || 6)),
        opacity: Math.max(0.15, Math.min(1, Number(raw.opacity) || 0.92)),
        points: pts.length >= 2 ? pts : [{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.51 }],
        hiddenFromPlayers: Boolean(raw.hiddenFromPlayers),
        ownerId: raw.ownerId || ''
    });
}

function buildSmoothSvgPathFromNormPoints(points, vw = 100, vh = 100) {
    if (!Array.isArray(points) || points.length === 0) return '';
    const scaled = points.map(p => ({ x: (Number(p.x) || 0) * vw, y: (Number(p.y) || 0) * vh }));
    if (scaled.length === 1) return `M ${scaled[0].x.toFixed(2)} ${scaled[0].y.toFixed(2)} l 0.1 0.1`;
    let d = `M ${scaled[0].x.toFixed(2)} ${scaled[0].y.toFixed(2)}`;
    for (let i = 1; i < scaled.length - 1; i++) {
        const mx = ((scaled[i].x + scaled[i + 1].x) / 2).toFixed(2);
        const my = ((scaled[i].y + scaled[i + 1].y) / 2).toFixed(2);
        d += ` Q ${scaled[i].x.toFixed(2)} ${scaled[i].y.toFixed(2)} ${mx} ${my}`;
    }
    const last = scaled[scaled.length - 1];
    d += ` L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
    return d;
}

function buildSingleDrawingWrapperHtml(rawDr, isGm) {
    const dr = normalizeDrawingObj(rawDr);
    if (!isGm && dr.hiddenFromPlayers) return '';
    const isSel = String(window.selectedDrawingId) === String(dr.id);
    const safeId = `'${String(dr.id).replace(/'/g, "\\'")}'`;
    const pathD = buildSmoothSvgPathFromNormPoints(dr.points, 100, 100);
    const hitStrokeW = Math.max(16, dr.strokeWidth + 10);

    return `
        <div class="tt-drawing-wrapper ${isSel ? 'is-selected' : ''} ${dr.hiddenFromPlayers ? 'is-hidden-overlay' : ''}"
             data-drawing-id="${escapeHtmlText(dr.id)}"
             style="left:${dr.x}px; top:${dr.y}px; width:${dr.width}px; height:${dr.height}px;"
             onmousedown="startDragDrawing(event, ${safeId})"
             title="Traço de Pincel (Clique p/ selecionar • Arraste p/ mover)">
            <div class="tt-aoe-rotator" style="transform: rotate(${dr.rotation}deg);">
                <svg class="tt-drawing-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="${pathD}" fill="none" stroke="transparent" stroke-width="${hitStrokeW}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="tt-drawing-hitpath"/>
                    <path d="${pathD}" fill="none" stroke="${escapeHtmlText(dr.color)}" stroke-width="${dr.strokeWidth}" stroke-opacity="${dr.opacity}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" class="tt-drawing-vispath"/>
                </svg>
                ${(isGm && dr.hiddenFromPlayers) ? `<span class="tt-overlay-hidden-pill" title="Oculto dos jogadores">🙈</span>` : ''}
                ${_renderBoxTransformHandlesHtml('startTransformDrawing', safeId)}
            </div>
        </div>
    `;
}

function updateTabletopDrawingDom(drId) {
    const raw = tabletopState?.drawings?.find(d => String(d.id) === String(drId));
    const el = document.querySelector(`.tt-drawing-wrapper[data-drawing-id="${CSS?.escape ? CSS.escape(String(drId)) : drId}"]`);
    if (!raw || !el) return false;
    const isGm = _isVttEffectiveGm();
    if (!isGm && raw.hiddenFromPlayers) {
        el.remove();
        return true;
    }
    const dr = normalizeDrawingObj(raw);
    el.style.left = `${dr.x}px`;
    el.style.top = `${dr.y}px`;
    el.style.width = `${dr.width}px`;
    el.style.height = `${dr.height}px`;
    el.classList.toggle('is-hidden-overlay', Boolean(dr.hiddenFromPlayers));
    const rotEl = el.querySelector('.tt-aoe-rotator');
    if (rotEl) rotEl.style.transform = `rotate(${dr.rotation}deg)`;
    const vis = el.querySelector('.tt-drawing-vispath');
    if (vis) {
        const dStr = buildSmoothSvgPathFromNormPoints(dr.points, 100, 100);
        vis.setAttribute('d', dStr);
        vis.setAttribute('stroke', dr.color);
        vis.setAttribute('stroke-width', String(dr.strokeWidth));
        vis.setAttribute('stroke-opacity', String(dr.opacity));
        const hit = el.querySelector('.tt-drawing-hitpath');
        if (hit) hit.setAttribute('d', dStr);
    }
    return true;
}

function updateDrawingField(drId, field, value) {
    ensureTabletopExtendedState();
    const dr = tabletopState.drawings.find(d => String(d.id) === String(drId));
    if (!dr || !canEditVttAnnotation(dr)) return;
    if (field === 'hiddenFromPlayers' && !_isVttEffectiveGm()) return;
    dr[field] = value;
    if (['color', 'strokeWidth', 'opacity'].includes(field) && window.brushDraftConfig) {
        window.brushDraftConfig[field] = value;
    }
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastDrawingDelta) {
        CompendioNetAdapter.broadcastDrawingDelta('upsert', dr);
    }
    if (!updateTabletopDrawingDom(dr.id)) renderTabletopModule();
    else updateTabletopSelectionUI();
}

function removeDrawing(drId, ev) {
    if (ev) ev.stopPropagation();
    ensureTabletopExtendedState();
    const dr = tabletopState.drawings.find(d => String(d.id) === String(drId));
    if (dr && !canEditVttAnnotation(dr)) {
        showToast('🔒 Sem permissão para remover este traço.');
        return;
    }
    tabletopState.drawings = tabletopState.drawings.filter(d => String(d.id) !== String(drId));
    if (String(window.selectedDrawingId) === String(drId)) window.selectedDrawingId = null;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastDrawingDelta) {
        CompendioNetAdapter.broadcastDrawingDelta('delete', drId);
    }
    renderTabletopModule();
}

function undoLastTabletopDrawing() {
    ensureTabletopExtendedState();
    const p = getActivePlayer();
    const isGm = _isVttEffectiveGm(p);
    for (let i = tabletopState.drawings.length - 1; i >= 0; i--) {
        const d = tabletopState.drawings[i];
        if (isGm || !d.ownerId || (p && d.ownerId === p.id)) {
            removeDrawing(d.id);
            return true;
        }
    }
    showToast('ℹ️ Nenhum traço recente para desfazer.');
    return false;
}

function startDragDrawing(e, drId) {
    if (e.button === 2 || e.altKey || ['ruler', 'ping', 'calibrate', 'fog', 'text', 'brush'].includes(window.tabletopToolMode)) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    clearMyPersistentRuler(true);
    ensureTabletopExtendedState();
    const dr = tabletopState.drawings.find(d => String(d.id) === String(drId));
    if (!dr) return;
    Object.assign(dr, normalizeDrawingObj(dr));

    clearAllTabletopSelections('drawing');
    window.selectedDrawingId = dr.id;
    updateTabletopSelectionUI();

    if (!canEditVttAnnotation(dr)) return;
    const el = e.currentTarget;
    const scale = window.tabletopCamera?.scale || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = dr.x;
    const origY = dr.y;
    let moved = false;
    let lastSent = 0;
    window.ttActiveInteraction = { type: 'drawing', id: dr.id };

    function onMove(mv) {
        const dx = (mv.clientX - startX) / scale;
        const dy = (mv.clientY - startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        dr.x = Math.round(origX + dx);
        dr.y = Math.round(origY + dy);
        el.style.left = `${dr.x}px`;
        el.style.top = `${dr.y}px`;
        const now = Date.now();
        if (moved && now - lastSent > 70 && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastDrawingDelta) {
            lastSent = now;
            CompendioNetAdapter.broadcastDrawingDelta('upsert', dr);
        }
    }
    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.ttActiveInteraction = null;
        if (moved) {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastDrawingDelta) {
                CompendioNetAdapter.broadcastDrawingDelta('upsert', dr);
            }
            updateTabletopSelectionUI();
        }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function startTransformDrawing(e, drId, handleKind) {
    ensureTabletopExtendedState();
    const dr = tabletopState.drawings.find(d => String(d.id) === String(drId));
    if (!dr || !canEditVttAnnotation(dr)) return;
    Object.assign(dr, normalizeDrawingObj(dr));
    clearAllTabletopSelections('drawing');
    window.selectedDrawingId = dr.id;
    const wrapper = e.currentTarget.closest('.tt-drawing-wrapper');
    _startBoxTransformDrag(e, {
        item: dr,
        wrapper,
        rotator: wrapper?.querySelector('.tt-aoe-rotator'),
        interType: 'drawing',
        minW: 16,
        minH: 16,
        handleKind,
        onSync: (it) => {
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastDrawingDelta) {
                CompendioNetAdapter.broadcastDrawingDelta('upsert', it);
            }
        },
        onFinish: (it) => {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastDrawingDelta) {
                CompendioNetAdapter.broadcastDrawingDelta('upsert', it);
            }
            updateTabletopSelectionUI();
        }
    });
}

/* ------------------ NÉVOA DE GUERRA AVANÇADA (POLÍGONO, SELECIONAR+REMOVER, RESIZE, ROTAÇÃO, +/- PONTOS) ------------------ */
function normalizeFogObj(raw) {
    if (!raw || typeof raw !== 'object') return raw;
    const hasPolyPts = Array.isArray(raw.points) && raw.points.length >= 3;
    const shape = (raw.shape === 'polygon' || hasPolyPts) ? 'polygon' : 'rect';
    const w = Math.max(16, Math.round(Number(raw.w ?? raw.width) || 80));
    const h = Math.max(16, Math.round(Number(raw.h ?? raw.height) || 80));
    const points = shape === 'polygon'
        ? (hasPolyPts ? raw.points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])
        : null;
    return Object.assign({}, raw, {
        shape,
        x: Math.round(Number(raw.x) || 0),
        y: Math.round(Number(raw.y) || 0),
        w,
        h,
        rotation: Number(raw.rotation) || 0,
        points
    });
}

function _fogPolygonSvgPointsAttr(points) {
    return (points || []).map(p => `${((Number(p.x) || 0) * 100).toFixed(2)},${((Number(p.y) || 0) * 100).toFixed(2)}`).join(' ');
}

function buildSingleFogRegionHtml(rawFog, isGm) {
    const f = normalizeFogObj(rawFog);
    const safeId = `'${String(f.id).replace(/'/g, "\\'")}'`;
    const isSel = isGm && String(window.selectedFogId) === String(f.id);
    const fill = isGm ? 'rgba(8, 10, 16, 0.56)' : '#07080d';
    const stroke = isGm ? (isSel ? '#ffd54f' : '#d8b467') : 'none';
    const strokeW = isGm ? (isSel ? '2.5' : '1.6') : '0';
    const dash = isGm ? (isSel ? '6,3' : '5,4') : '0';

    const shapeMarkup = f.shape === 'polygon' && Array.isArray(f.points)
        ? `<polygon points="${_fogPolygonSvgPointsAttr(f.points)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke" style="pointer-events:${isGm ? 'visiblePainted' : 'none'};"/>`
        : `<rect x="0" y="0" width="100" height="100" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}" stroke-dasharray="${dash}" vector-effect="non-scaling-stroke" style="pointer-events:${isGm ? 'visiblePainted' : 'none'};"/>`;

    if (!isGm) {
        return `
            <div class="tt-fog-wrapper tt-fog-player"
                 data-fog-id="${escapeHtmlText(f.id)}"
                 style="left:${f.x}px; top:${f.y}px; width:${f.w}px; height:${f.h}px; pointer-events:none;">
                <div class="tt-aoe-rotator" style="transform: rotate(${f.rotation}deg);">
                    <svg class="tt-fog-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${shapeMarkup}</svg>
                </div>
            </div>
        `;
    }

    const vertexHandlesHtml = (f.shape === 'polygon' && Array.isArray(f.points))
        ? f.points.map((pt, idx) => {
            const isActiveV = Number(window.selectedFogVertexIdx) === idx;
            return `<div class="tt-fog-vertex-handle ${isActiveV ? 'is-active' : ''}" style="left:${(pt.x * 100).toFixed(2)}%; top:${(pt.y * 100).toFixed(2)}%;" onmousedown="startDragFogVertex(event, ${safeId}, ${idx})" title="Ponto ${idx + 1} (Arraste para ajustar polígono)"></div>`;
        }).join('')
        : '';

    const ptsLabel = f.shape === 'polygon' && Array.isArray(f.points) ? `⬟ ${f.points.length} pts` : '▭ Ret.';
    return `
        <div class="tt-fog-wrapper ${isSel ? 'is-selected' : ''}"
             data-fog-id="${escapeHtmlText(f.id)}"
             style="left:${f.x}px; top:${f.y}px; width:${f.w}px; height:${f.h}px;"
             onmousedown="startDragFogRegion(event, ${safeId})"
             title="Névoa de Guerra (Clique p/ selecionar • Arraste p/ mover • Use alças p/ redimensionar/rotacionar/editar pontos)">
            <div class="tt-aoe-rotator" style="transform: rotate(${f.rotation}deg);">
                <svg class="tt-fog-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${shapeMarkup}</svg>
                ${_renderBoxTransformHandlesHtml('startTransformFogRegion', safeId)}
                ${vertexHandlesHtml}
            </div>
            <span class="tt-fog-badge">${ptsLabel}</span>
        </div>
    `;
}

function updateTabletopFogDom(fogId) {
    const raw = tabletopState?.fogRegions?.find(f => String(f.id) === String(fogId));
    const el = document.querySelector(`.tt-fog-wrapper[data-fog-id="${CSS?.escape ? CSS.escape(String(fogId)) : fogId}"]`);
    if (!raw || !el) return false;
    const f = normalizeFogObj(raw);
    const isGm = _isVttEffectiveGm();
    el.style.left = `${f.x}px`;
    el.style.top = `${f.y}px`;
    el.style.width = `${f.w}px`;
    el.style.height = `${f.h}px`;
    const rotEl = el.querySelector('.tt-aoe-rotator');
    if (rotEl) rotEl.style.transform = `rotate(${f.rotation}deg)`;
    const svg = el.querySelector('.tt-fog-svg');
    if (svg) {
        const poly = svg.querySelector('polygon');
        if (f.shape === 'polygon' && poly && Array.isArray(f.points)) {
            poly.setAttribute('points', _fogPolygonSvgPointsAttr(f.points));
        } else if (f.shape === 'polygon') {
            return false; // precisa re-render para trocar rect -> polygon e montar vértices
        }
    }
    if (isGm && f.shape === 'polygon' && Array.isArray(f.points)) {
        const vEls = el.querySelectorAll('.tt-fog-vertex-handle');
        if (vEls.length === f.points.length) {
            f.points.forEach((pt, idx) => {
                vEls[idx].style.left = `${(pt.x * 100).toFixed(2)}%`;
                vEls[idx].style.top = `${(pt.y * 100).toFixed(2)}%`;
            });
        } else {
            return false;
        }
    }
    return true;
}

function startDragFogRegion(e, fogId) {
    if (e.button === 2 || e.altKey || ['ruler', 'ping', 'calibrate', 'text', 'brush'].includes(window.tabletopToolMode)) return;
    // Se estiver no modo desenho de Névoa (Retângulo ou Polígono), deixa clique iniciar novo desenho no stage
    if (window.tabletopToolMode === 'fog') return;
    if (e.button !== 0 || !_isVttEffectiveGm()) return;
    e.stopPropagation();
    clearMyPersistentRuler(true);
    ensureTabletopExtendedState();
    const fog = tabletopState.fogRegions.find(f => String(f.id) === String(fogId));
    if (!fog) return;
    Object.assign(fog, normalizeFogObj(fog));

    if (String(window.selectedFogId) !== String(fog.id)) {
        clearAllTabletopSelections('fog');
        window.selectedFogId = fog.id;
        window.selectedFogVertexIdx = null;
        updateTabletopSelectionUI();
        return;
    }

    const el = e.currentTarget;
    const scale = window.tabletopCamera?.scale || 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = fog.x;
    const origY = fog.y;
    let moved = false;
    let lastSent = 0;
    window.ttActiveInteraction = { type: 'fog', id: fog.id };

    function onMove(mv) {
        const dx = (mv.clientX - startX) / scale;
        const dy = (mv.clientY - startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        fog.x = Math.round(origX + dx);
        fog.y = Math.round(origY + dy);
        el.style.left = `${fog.x}px`;
        el.style.top = `${fog.y}px`;
        const now = Date.now();
        if (moved && now - lastSent > 70 && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
            lastSent = now;
            CompendioNetAdapter.broadcastFogDelta('upsert', fog);
        }
    }
    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.ttActiveInteraction = null;
        if (moved) {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
                CompendioNetAdapter.broadcastFogDelta('upsert', fog);
            }
            updateTabletopSelectionUI();
        }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function startTransformFogRegion(e, fogId, handleKind) {
    if (!_isVttEffectiveGm()) return;
    ensureTabletopExtendedState();
    const fog = tabletopState.fogRegions.find(f => String(f.id) === String(fogId));
    if (!fog) return;
    Object.assign(fog, normalizeFogObj(fog));
    clearAllTabletopSelections('fog');
    window.selectedFogId = fog.id;
    const wrapper = e.currentTarget.closest('.tt-fog-wrapper');
    _startBoxTransformDrag(e, {
        item: fog,
        wrapper,
        rotator: wrapper?.querySelector('.tt-aoe-rotator'),
        interType: 'fog',
        wProp: 'w',
        hProp: 'h',
        minW: 16,
        minH: 16,
        handleKind,
        onSync: (it) => {
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
                CompendioNetAdapter.broadcastFogDelta('upsert', it);
            }
        },
        onFinish: (it) => {
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
                CompendioNetAdapter.broadcastFogDelta('upsert', it);
            }
            updateTabletopSelectionUI();
        }
    });
}

function startDragFogVertex(e, fogId, ptIdx) {
    if (e.button !== 0 || !_isVttEffectiveGm()) return;
    e.stopPropagation();
    e.preventDefault();
    ensureTabletopExtendedState();
    const fog = tabletopState.fogRegions.find(f => String(f.id) === String(fogId));
    if (!fog) return;
    Object.assign(fog, normalizeFogObj(fog));
    if (fog.shape !== 'polygon' || !Array.isArray(fog.points) || !fog.points[ptIdx]) return;

    clearAllTabletopSelections('fog');
    window.selectedFogId = fog.id;
    window.selectedFogVertexIdx = ptIdx;
    window.ttActiveInteraction = { type: 'fog', id: fog.id };

    const rad = (Number(fog.rotation) || 0) * Math.PI / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);
    const oldCx = fog.x + fog.w / 2;
    const oldCy = fog.y + fog.h / 2;

    // Captura posições mundiais iniciais de todos os vértices para mantê-los imóveis enquanto 1 é arrastado
    const worldPts = fog.points.map(pt => {
        const lx = (pt.x - 0.5) * fog.w;
        const ly = (pt.y - 0.5) * fog.h;
        return {
            x: oldCx + lx * cosR - ly * sinR,
            y: oldCy + lx * sinR + ly * cosR
        };
    });
    let lastSent = 0;

    function recomputeBoundsFromWorldPts() {
        const localPts = worldPts.map(wp => {
            const dx = wp.x - oldCx;
            const dy = wp.y - oldCy;
            return {
                u: dx * cosR + dy * sinR,
                v: -dx * sinR + dy * cosR
            };
        });
        let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
        localPts.forEach(lp => {
            if (lp.u < minU) minU = lp.u;
            if (lp.u > maxU) maxU = lp.u;
            if (lp.v < minV) minV = lp.v;
            if (lp.v > maxV) maxV = lp.v;
        });
        const spanU = Math.max(16, maxU - minU);
        const spanV = Math.max(16, maxV - minV);
        const dcx = (minU + maxU) / 2;
        const dcy = (minV + maxV) / 2;
        const newCx = oldCx + dcx * cosR - dcy * sinR;
        const newCy = oldCy + dcx * sinR + dcy * cosR;
        fog.w = Math.round(spanU);
        fog.h = Math.round(spanV);
        fog.x = Math.round(newCx - fog.w / 2);
        fog.y = Math.round(newCy - fog.h / 2);
        fog.points = localPts.map(lp => ({
            x: Math.max(0, Math.min(1, (lp.u - minU) / spanU)),
            y: Math.max(0, Math.min(1, (lp.v - minV) / spanV))
        }));
    }

    function onMove(mv) {
        const pt = clientToWorldCoords(mv.clientX, mv.clientY);
        worldPts[ptIdx] = { x: pt.x, y: pt.y };
        recomputeBoundsFromWorldPts();
        updateTabletopFogDom(fog.id);
        const now = Date.now();
        if (now - lastSent > 70 && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
            lastSent = now;
            CompendioNetAdapter.broadcastFogDelta('upsert', fog);
        }
    }

    function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.ttActiveInteraction = null;
        saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
            CompendioNetAdapter.broadcastFogDelta('upsert', fog);
        }
        renderTabletopModule();
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
}

function adjustFogRegionPoints(fogId, delta) {
    if (!_isVttEffectiveGm()) return false;
    ensureTabletopExtendedState();
    const fog = tabletopState.fogRegions.find(f => String(f.id) === String(fogId));
    if (!fog) return false;
    Object.assign(fog, normalizeFogObj(fog));
    if (fog.shape !== 'polygon' || !Array.isArray(fog.points)) {
        fog.shape = 'polygon';
        fog.points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    }

    if (delta > 0) {
        for (let step = 0; step < delta; step++) {
            // Encontra a maior aresta em pixels do mundo e insere ponto médio nela
            let bestEdgeIdx = 0;
            let bestLen = -1;
            const n = fog.points.length;
            for (let i = 0; i < n; i++) {
                const a = fog.points[i];
                const b = fog.points[(i + 1) % n];
                const len = Math.hypot((b.x - a.x) * fog.w, (b.y - a.y) * fog.h);
                if (len > bestLen) {
                    bestLen = len;
                    bestEdgeIdx = i;
                }
            }
            const pA = fog.points[bestEdgeIdx];
            const pB = fog.points[(bestEdgeIdx + 1) % n];
            const mid = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
            fog.points.splice(bestEdgeIdx + 1, 0, mid);
            window.selectedFogVertexIdx = bestEdgeIdx + 1;
        }
    } else if (delta < 0) {
        const steps = Math.abs(delta);
        for (let step = 0; step < steps; step++) {
            if (fog.points.length <= 3) {
                showToast('⚠️ O polígono de Névoa precisa de pelo menos 3 pontos.');
                break;
            }
            const rmIdx = (window.selectedFogVertexIdx !== null && window.selectedFogVertexIdx >= 0 && window.selectedFogVertexIdx < fog.points.length)
                ? window.selectedFogVertexIdx
                : (fog.points.length - 1);
            fog.points.splice(rmIdx, 1);
            window.selectedFogVertexIdx = Math.min(rmIdx, fog.points.length - 1);
        }
    }

    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
        CompendioNetAdapter.broadcastFogDelta('upsert', fog);
    }
    renderTabletopModule();
    return true;
}

function updateFogField(fogId, field, value) {
    if (!_isVttEffectiveGm()) return;
    ensureTabletopExtendedState();
    const fog = tabletopState.fogRegions.find(f => String(f.id) === String(fogId));
    if (!fog) return;
    Object.assign(fog, normalizeFogObj(fog));
    fog[field] = value;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
        CompendioNetAdapter.broadcastFogDelta('upsert', fog);
    }
    if (!updateTabletopFogDom(fog.id)) renderTabletopModule();
}

function setFogDrawShape(shapeMode) {
    if (!_isVttEffectiveGm()) return;
    window.fogDrawShape = shapeMode === 'polygon' ? 'polygon' : 'rect';
    window.fogPolygonDraft = [];
    window.tabletopToolMode = 'fog';
    if (activeModule === 'tabletop') renderTabletopModule();
}

function updateFogPolygonDraftPreview(cursorWorld = null) {
    const svg = document.getElementById('tt-fog-poly-draft-svg');
    const pts = window.fogPolygonDraft || [];
    if (!svg) return;
    if (pts.length === 0) {
        svg.innerHTML = '';
        return;
    }
    const all = cursorWorld ? [...pts, cursorWorld] : pts;
    const polyAttr = all.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
    const circles = pts.map((p, idx) =>
        `<circle cx="${Math.round(p.x)}" cy="${Math.round(p.y)}" r="${idx === 0 && pts.length >= 3 ? 8 : 5}" fill="${idx === 0 && pts.length >= 3 ? '#8df596' : '#ffd54f'}" stroke="#0d0e13" stroke-width="2"/>`
    ).join('');
    svg.innerHTML = `
        <polyline points="${polyAttr}" fill="rgba(10,12,18,0.45)" stroke="#ffd54f" stroke-width="2.5" stroke-dasharray="7,4"/>
        ${circles}
    `;
}

function cancelFogPolygonDraft() {
    window.fogPolygonDraft = [];
    const svg = document.getElementById('tt-fog-poly-draft-svg');
    if (svg) svg.innerHTML = '';
    if (activeModule === 'tabletop') renderTabletopModule();
}

function commitFogPolygonDraft() {
    if (!_isVttEffectiveGm()) return null;
    ensureTabletopExtendedState();
    const pts = window.fogPolygonDraft || [];
    if (pts.length < 3) {
        showToast('⚠️ Marque pelo menos 3 pontos para fechar o polígono de Névoa.');
        return null;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    pts.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    });
    const w = Math.max(20, Math.round(maxX - minX));
    const h = Math.max(20, Math.round(maxY - minY));
    const normPts = pts.map(p => ({
        x: (p.x - minX) / w,
        y: (p.y - minY) / h
    }));
    const fogObj = normalizeFogObj({
        id: 'fog-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100),
        shape: 'polygon',
        x: Math.round(minX),
        y: Math.round(minY),
        w,
        h,
        rotation: 0,
        points: normPts
    });

    tabletopState.fogEnabled = true;
    tabletopState.fogRegions.push(fogObj);
    window.fogPolygonDraft = [];
    clearAllTabletopSelections('fog');
    window.selectedFogId = fogObj.id;
    window.tabletopToolMode = 'move';
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
        CompendioNetAdapter.broadcastFogDelta('toggle', true);
        CompendioNetAdapter.broadcastFogDelta('upsert', fogObj);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    showToast(`🌫️ Polígono de Névoa criado (${normPts.length} pontos)! Use ✋ Mover para redimensionar, girar, +/- pontos ou remover.`);
    return fogObj;
}

/* ------------------ NÉVOA DE GUERRA BASE & PING ------------------ */
function toggleTabletopFogBase() {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    ensureTabletopExtendedState();
    tabletopState.fogEnabled = !tabletopState.fogEnabled;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
        CompendioNetAdapter.broadcastFogDelta('toggle', tabletopState.fogEnabled);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    showToast(tabletopState.fogEnabled ? '🌫️ Névoa de Guerra ATIVADA!' : '☀️ Névoa de Guerra desativada.');
}

function addDefaultFogCoverAll() {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    ensureTabletopExtendedState();
    const { w, h } = getTabletopStageDimensions();
    tabletopState.fogEnabled = true;
    const fogObj = normalizeFogObj({ id: 'fog-' + Date.now(), shape: 'rect', x: 0, y: 0, w, h, rotation: 0 });
    tabletopState.fogRegions.push(fogObj);
    clearAllTabletopSelections('fog');
    window.selectedFogId = fogObj.id;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
        CompendioNetAdapter.broadcastFogDelta('toggle', true);
        CompendioNetAdapter.broadcastFogDelta('upsert', fogObj);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    showToast('🌫️ Mapa coberto com Névoa! Selecione a névoa no mapa para editar ou remover.');
}

function removeFogRegion(fogId, ev) {
    if (ev) ev.stopPropagation();
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    ensureTabletopExtendedState();
    tabletopState.fogRegions = tabletopState.fogRegions.filter(f => String(f.id) !== String(fogId));
    tabletopState.fogRects = [];
    if (String(window.selectedFogId) === String(fogId)) {
        window.selectedFogId = null;
        window.selectedFogVertexIdx = null;
    }
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
        CompendioNetAdapter.broadcastFogDelta('delete', fogId);
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
}

function clearAllTabletopTacticalOverlays() {
    if (!_isVttEffectiveGm()) {
        showToast('🔒 Apenas o Mestre pode limpar formas táticas, textos, traços e névoa da mesa.');
        return;
    }
    ensureTabletopExtendedState();
    tabletopState.aoeTemplates = [];
    tabletopState.fogRegions = [];
    tabletopState.fogRects = [];
    tabletopState.textBoxes = [];
    tabletopState.drawings = [];
    clearAllTabletopSelections();
    window.fogPolygonDraft = [];
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopSceneSync) {
        CompendioNetAdapter.broadcastTabletopSceneSync(buildSceneSyncPayloadFromActive());
    } else if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    showToast('🧹 Formas AoE, Textos, Pincel e Névoa da cena atual limpos.');
}

function triggerTabletopPingAt(x, y, senderName = null, broadcast = true, pingColor = null) {
    const activePl = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    const resolvedColor = pingColor || (typeof getPlayerColor === 'function' && activePl ? getPlayerColor(activePl) : '#f1c40f');
    const resolvedLabel = senderName || (typeof getPlayerDisplayName === 'function' && activePl ? getPlayerDisplayName(activePl) : (activePl?.name || 'Ping'));
    const stage = document.getElementById('tabletop-stage');
    if (stage) {
        const pingEl = document.createElement('div');
        pingEl.className = 'tt-map-ping';
        pingEl.style.left = `${x}px`;
        pingEl.style.top = `${y}px`;
        pingEl.style.borderColor = resolvedColor;
        pingEl.style.boxShadow = `0 0 18px ${resolvedColor}`;
        pingEl.innerHTML = `<span class="tt-map-ping-label" style="border-color:${escapeHtmlText(resolvedColor)}; color:${escapeHtmlText(resolvedColor)};">📍 ${escapeHtmlText(resolvedLabel)}</span>`;
        stage.appendChild(pingEl);
        setTimeout(() => pingEl.remove(), 2600);
    }
    if (broadcast && typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendMapPing) {
        CompendioNetAdapter.sendMapPing({
            id: 'ping-' + Date.now(),
            x,
            y,
            senderId: (activePl && !activePl.isUnauthenticated && activePl.id) ? activePl.id : '',
            senderName: activePl?.name || 'Jogador',
            color: resolvedColor
        });
    }
}

/* ------------------ CLICK/DRAG UNIFICADO NO STAGE (PAN, RÉGUA CLIENT-PERSIST, 1-SHOT PING, GRADIFICAR, NÉVOA) ------------------ */
function onTabletopStageMouseDown(e) {
    const stage = document.getElementById('tabletop-stage');
    if (!stage) return;

    // Toda nova interação do usuário encerra a régua anterior deste client (até próximo clique)
    clearMyPersistentRuler(true);

    const worldStart = clientToWorldCoords(e.clientX, e.clientY);
    const startX = worldStart.x;
    const startY = worldStart.y;
    const activePl = getActivePlayer();
    const isGm = _isVttEffectiveGm(activePl);

    // 1. Ping (1-shot quando vindo do modo 'ping' -> retorna ao modo 'move' logo após)
    if (e.altKey || (window.tabletopToolMode === 'ping' && e.button === 0)) {
        e.preventDefault();
        triggerTabletopPingAt(startX, startY, null, true);
        if (window.tabletopToolMode === 'ping') {
            setTabletopToolMode('move');
        }
        return;
    }

    // 2. Régua Tática Persistente por Cliente (dura após soltar até o próximo clique deste client!)
    if (e.button === 2 || window.tabletopToolMode === 'ruler') {
        e.preventDefault();
        const { gx } = getTabletopGridMetrics();
        const cid = window.localClientId || 'local';
        const pColor = (typeof getPlayerColor === 'function' && activePl) ? getPlayerColor(activePl) : '#f2cf83';
        const pName = (typeof getPlayerDisplayName === 'function' && activePl) ? getPlayerDisplayName(activePl) : (activePl?.name || 'Jogador');

        window.ttActiveInteraction = { type: 'ruler', id: cid };
        const rulerObj = {
            clientId: cid,
            playerId: (activePl && !activePl.isUnauthenticated && activePl.id) ? activePl.id : '',
            playerName: pName,
            color: pColor,
            startX,
            startY,
            endX: startX,
            endY: startY,
            text: '0m (0ft)'
        };
        window.activeTabletopRulers[cid] = rulerObj;
        renderTabletopRulersLayer();

        function onRulerMove(mv) {
            const pt = clientToWorldCoords(mv.clientX, mv.clientY);
            rulerObj.endX = pt.x;
            rulerObj.endY = pt.y;
            const dxSq = (pt.x - startX) / gx;
            const dySq = (pt.y - startY) / gx;
            const dist = (typeof CompendioRules !== 'undefined')
                ? CompendioRules.calculateGridDistance(dxSq, dySq)
                : { squares: Math.round(Math.hypot(dxSq, dySq) * 10) / 10, meters: Math.round(Math.hypot(dxSq, dySq) * 1.5 * 10) / 10, feet: Math.round(Math.hypot(dxSq, dySq) * 5) };
            rulerObj.text = `${dist.meters}m · ${dist.feet}ft (${dist.squares} sq)`;
            renderTabletopRulersLayer();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendRulerUpdate) {
                CompendioNetAdapter.sendRulerUpdate(rulerObj, false);
            }
        }

        function onRulerUp() {
            window.removeEventListener('mousemove', onRulerMove);
            window.removeEventListener('mouseup', onRulerUp);
            window.ttActiveInteraction = null;
            // Se arrastou > 5px, mantém visível até o próximo clique deste client e envia update final!
            const movedDist = Math.hypot(rulerObj.endX - startX, rulerObj.endY - startY);
            if (movedDist < 4) {
                delete window.activeTabletopRulers[cid];
                renderTabletopRulersLayer();
                if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendRulerClear) {
                    CompendioNetAdapter.sendRulerClear(cid);
                }
            } else if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendRulerUpdate) {
                CompendioNetAdapter.sendRulerUpdate(rulerObj, true);
            }
        }

        window.addEventListener('mousemove', onRulerMove);
        window.addEventListener('mouseup', onRulerUp);
        return;
    }

    // 3. Modo de Gradificação (Apenas GM: mede 1 quadrado do mapa de exemplo)
    if (isGm && window.tabletopToolMode === 'calibrate' && e.button === 0) {
        e.preventDefault();
        window.ttActiveInteraction = { type: 'calibrate' };
        const calBox = document.createElement('div');
        calBox.style.cssText = `position:absolute; left:${startX}px; top:${startY}px; width:0px; height:0px; background:rgba(216,180,103,0.22); border:2px dashed #ffd54f; pointer-events:none; z-index:48; display:flex; align-items:flex-end; justify-content:center;`;
        const readout = document.createElement('span');
        readout.style.cssText = 'background:#111; color:#ffd54f; font-size:11px; font-weight:bold; padding:1px 6px; border-radius:4px; margin-bottom:-20px; white-space:nowrap;';
        calBox.appendChild(readout);
        stage.appendChild(calBox);

        let lastPt = { x: startX, y: startY };
        function onCalMove(mv) {
            lastPt = clientToWorldCoords(mv.clientX, mv.clientY);
            const rx = Math.min(startX, lastPt.x);
            const ry = Math.min(startY, lastPt.y);
            const rw = Math.abs(lastPt.x - startX);
            const rh = Math.abs(lastPt.y - startY);
            calBox.style.left = `${rx}px`;
            calBox.style.top = `${ry}px`;
            calBox.style.width = `${rw}px`;
            calBox.style.height = `${rh}px`;
            readout.textContent = `${rw} × ${rh} px`;
        }
        function onCalUp() {
            window.removeEventListener('mousemove', onCalMove);
            window.removeEventListener('mouseup', onCalUp);
            calBox.remove();
            window.ttActiveInteraction = null;
            const rw = Math.round(Math.abs(lastPt.x - startX));
            const rh = Math.round(Math.abs(lastPt.y - startY));
            if (rw >= 12 && rh >= 12) {
                const rx = Math.min(startX, lastPt.x);
                const ry = Math.min(startY, lastPt.y);
                tabletopState.gridSize = rw;
                tabletopState.gridSizeY = rh;
                tabletopState.gridOffsetX = Math.round(rx % rw);
                tabletopState.gridOffsetY = Math.round(ry % rh);
                tabletopState.gridEnabled = true;
                saveLocalPersistence();
                if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
                    CompendioNetAdapter.broadcastTabletopMeta({
                        gridEnabled: true,
                        gridSize: rw,
                        gridSizeY: rh,
                        gridOffsetX: tabletopState.gridOffsetX,
                        gridOffsetY: tabletopState.gridOffsetY
                    });
                }
                updateTabletopGridVisualsOnly();
                showToast(`📐 Grade calibrada pelo quadrado de exemplo: ${rw}×${rh}px!`);
            }
        }
        window.addEventListener('mousemove', onCalMove);
        window.addEventListener('mouseup', onCalUp);
        return;
    }

    // 4. Modo Caixa de Texto (clique insere caixa de texto e seleciona)
    if (window.tabletopToolMode === 'text' && e.button === 0) {
        e.preventDefault();
        const created = addTextBoxToTabletop(startX, startY);
        if (created) startInlineEditTextBox(null, created.id);
        return;
    }

    // 5. Modo Pincel / Desenho Livre (arraste grava traço suave no mapa)
    if (window.tabletopToolMode === 'brush' && e.button === 0) {
        e.preventDefault();
        ensureTabletopExtendedState();
        const cfg = window.brushDraftConfig || { color: '#ff5252', strokeWidth: 6, opacity: 0.92 };
        const scale = window.tabletopCamera?.scale || 1;
        const pts = [{ x: startX, y: startY }];
        const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgOverlay.id = 'tt-brush-draft-svg';
        svgOverlay.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:48;';
        const previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        previewPath.setAttribute('fill', 'none');
        previewPath.setAttribute('stroke', cfg.color || '#ff5252');
        previewPath.setAttribute('stroke-width', String(Number(cfg.strokeWidth) || 6));
        previewPath.setAttribute('stroke-opacity', String(Number(cfg.opacity) || 0.92));
        previewPath.setAttribute('stroke-linecap', 'round');
        previewPath.setAttribute('stroke-linejoin', 'round');
        svgOverlay.appendChild(previewPath);
        stage.appendChild(svgOverlay);

        window.ttActiveInteraction = { type: 'brush-draw' };

        function updatePreview() {
            let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
            for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
            previewPath.setAttribute('d', d);
        }
        updatePreview();

        function onBrushMove(mv) {
            const pt = clientToWorldCoords(mv.clientX, mv.clientY);
            const last = pts[pts.length - 1];
            const minStep = Math.max(2.5, 4 / (scale || 1));
            if (Math.hypot(pt.x - last.x, pt.y - last.y) >= minStep) {
                pts.push({ x: pt.x, y: pt.y });
                updatePreview();
            }
        }

        function onBrushUp() {
            window.removeEventListener('mousemove', onBrushMove);
            window.removeEventListener('mouseup', onBrushUp);
            svgOverlay.remove();
            window.ttActiveInteraction = null;
            if (pts.length === 1) {
                pts.push({ x: pts[0].x + 2, y: pts[0].y + 2 });
            }
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            pts.forEach(p => {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
            });
            const strokeW = Math.max(2, Number(cfg.strokeWidth) || 6);
            const pad = Math.round(strokeW * 0.75 + 6);
            minX -= pad; minY -= pad; maxX += pad; maxY += pad;
            const w = Math.max(20, Math.round(maxX - minX));
            const h = Math.max(20, Math.round(maxY - minY));
            const normPts = pts.map(p => ({ x: (p.x - minX) / w, y: (p.y - minY) / h }));
            const drObj = normalizeDrawingObj({
                id: 'drw-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
                x: Math.round(minX),
                y: Math.round(minY),
                width: w,
                height: h,
                rotation: 0,
                color: cfg.color || '#ff5252',
                strokeWidth: strokeW,
                opacity: Number(cfg.opacity) || 0.92,
                points: normPts,
                hiddenFromPlayers: false,
                ownerId: activePlayerId || ''
            });
            tabletopState.drawings.push(drObj);
            clearAllTabletopSelections('drawing');
            window.selectedDrawingId = drObj.id;
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastDrawingDelta) {
                CompendioNetAdapter.broadcastDrawingDelta('upsert', drObj);
            }
            renderTabletopModule();
        }
        window.addEventListener('mousemove', onBrushMove);
        window.addEventListener('mouseup', onBrushUp);
        return;
    }

    // 6. Modo Névoa de Guerra (GM: Retângulo arrastando OU Polígono ponto-a-ponto)
    if (isGm && window.tabletopToolMode === 'fog' && e.button === 0) {
        e.preventDefault();
        ensureTabletopExtendedState();
        if (window.fogDrawShape === 'polygon') {
            const pts = Array.isArray(window.fogPolygonDraft) ? window.fogPolygonDraft : (window.fogPolygonDraft = []);
            const scale = window.tabletopCamera?.scale || 1;
            const snapRadius = 15 / (scale || 1);
            if (pts.length >= 3 && Math.hypot(startX - pts[0].x, startY - pts[0].y) <= snapRadius) {
                commitFogPolygonDraft();
                return;
            }
            pts.push({ x: Math.round(startX), y: Math.round(startY) });
            const cntEl = document.getElementById('tt-fog-poly-count');
            if (cntEl) cntEl.textContent = `${pts.length} ponto(s)`;
            updateFogPolygonDraftPreview({ x: startX, y: startY });
            return;
        }

        tabletopState.fogEnabled = true;
        window.ttActiveInteraction = { type: 'fog' };
        const draftBox = document.createElement('div');
        draftBox.style.cssText = `position:absolute; left:${startX}px; top:${startY}px; width:0px; height:0px; background:rgba(10,12,18,0.65); border:2px dashed #d8b467; pointer-events:none; z-index:35;`;
        stage.appendChild(draftBox);

        let lastPt = { x: startX, y: startY };
        function onFogMove(mv) {
            lastPt = clientToWorldCoords(mv.clientX, mv.clientY);
            const rx = Math.min(startX, lastPt.x);
            const ry = Math.min(startY, lastPt.y);
            const rw = Math.abs(lastPt.x - startX);
            const rh = Math.abs(lastPt.y - startY);
            draftBox.style.left = rx + 'px';
            draftBox.style.top = ry + 'px';
            draftBox.style.width = rw + 'px';
            draftBox.style.height = rh + 'px';
        }
        function onFogUp() {
            window.removeEventListener('mousemove', onFogMove);
            window.removeEventListener('mouseup', onFogUp);
            draftBox.remove();
            window.ttActiveInteraction = null;
            const rw = Math.abs(lastPt.x - startX);
            const rh = Math.abs(lastPt.y - startY);
            if (rw > 20 && rh > 20) {
                const fogObj = normalizeFogObj({
                    id: 'fog-' + Date.now() + '-' + Math.floor(Math.random() * 100),
                    shape: 'rect',
                    x: Math.min(startX, lastPt.x),
                    y: Math.min(startY, lastPt.y),
                    w: rw,
                    h: rh,
                    rotation: 0
                });
                tabletopState.fogRegions.push(fogObj);
                clearAllTabletopSelections('fog');
                window.selectedFogId = fogObj.id;
                saveLocalPersistence();
                if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastFogDelta) {
                    CompendioNetAdapter.broadcastFogDelta('toggle', true);
                    CompendioNetAdapter.broadcastFogDelta('upsert', fogObj);
                } else if (typeof CompendioNetAdapter !== 'undefined') {
                    CompendioNetAdapter.broadcastTabletop();
                }
                renderTabletopModule();
            }
        }
        window.addEventListener('mousemove', onFogMove);
        window.addEventListener('mouseup', onFogUp);
        return;
    }

    // 7. Modo Mover Câmera (Google Maps Pan) — qualquer clique/arrasto no mapa livre
    if (e.button === 0) {
        e.preventDefault();
        const vp = document.getElementById('tabletop-viewport');
        if (vp) vp.classList.add('is-panning');
        const cam = window.tabletopCamera;
        const startClientX = e.clientX;
        const startClientY = e.clientY;
        const origCamX = cam.x;
        const origCamY = cam.y;
        let panned = false;

        window.ttActiveInteraction = { type: 'pan' };

        function onPanMove(mv) {
            const dx = mv.clientX - startClientX;
            const dy = mv.clientY - startClientY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panned = true;
            cam.x = Math.round(origCamX + dx);
            cam.y = Math.round(origCamY + dy);
            applyTabletopCameraTransform();
        }
        function onPanUp() {
            window.removeEventListener('mousemove', onPanMove);
            window.removeEventListener('mouseup', onPanUp);
            if (vp) vp.classList.remove('is-panning');
            window.ttActiveInteraction = null;
            if (!panned && (selectedTabletopTokenId || window.selectedShapeId || window.selectedTextBoxId || window.selectedDrawingId || window.selectedFogId)) {
                clearAllTabletopSelections();
                updateTabletopSelectionUI();
            }
        }
        window.addEventListener('mousemove', onPanMove);
        window.addEventListener('mouseup', onPanUp);
    }
}

/* ------------------ GAVETA SCROLLÁVEL DE TOKENS, OURO & BAÚ ------------------ */
function updateTokenDrawerUI() {
    const isGm = _isVttEffectiveGm();
    const drawerRoot = document.getElementById('tt-token-drawer-root');
    const drawerBtn = document.getElementById('tt-btn-drawer-toggle');
    if (drawerBtn) {
        drawerBtn.classList.toggle('is-active', Boolean(window.ttDrawerOpen));
        drawerBtn.textContent = `📦 Gaveta (${tabletopState.tokens.length})`;
    }
    if (drawerRoot) {
        drawerRoot.innerHTML = renderTokenDrawerPanelHtml(isGm);
        return true;
    }
    return false;
}

function toggleTokenDrawer(force = null) {
    window.ttDrawerOpen = (force === null) ? !window.ttDrawerOpen : Boolean(force);
    if (window.ttDrawerOpen && !_isVttEffectiveGm() && !['pcs', 'placed'].includes(window.ttDrawerTab)) {
        window.ttDrawerTab = 'pcs';
    }
    if (!updateTokenDrawerUI()) renderTabletopModule();
}

function setTokenDrawerTab(tab) {
    const isGm = _isVttEffectiveGm();
    if (!isGm && !['pcs', 'placed'].includes(tab)) {
        window.ttDrawerTab = 'pcs';
    } else {
        window.ttDrawerTab = tab;
    }
    if (!updateTokenDrawerUI()) renderTabletopModule();
}

function filterTokenDrawerCards(query) {
    window.ttDrawerSearch = String(query || '').toLowerCase();
    const list = document.getElementById('tt-drawer-items-grid');
    if (!list) return;
    let visibleCount = 0;
    list.querySelectorAll('.tt-drawer-card[data-drawer-title]').forEach(card => {
        const title = card.getAttribute('data-drawer-title') || '';
        const match = !window.ttDrawerSearch || title.includes(window.ttDrawerSearch);
        card.style.display = match ? 'flex' : 'none';
        if (match) visibleCount++;
    });
    const emptyEl = document.getElementById('tt-drawer-search-empty');
    if (emptyEl) {
        emptyEl.style.display = (visibleCount === 0 && window.ttDrawerSearch) ? 'block' : 'none';
    }
}

function sendCharacterToTabletop(charId) {
    const c = charactersData.find(x => x.id === charId);
    if (!c) return;
    if (!_isVttEffectiveGm() && typeof canAccessFullCharacterSheet === 'function' && !canAccessFullCharacterSheet(c)) {
        showToast('🔒 Você só pode posicionar seus próprios personagens no Tabletop.');
        return;
    }
    let existing = tabletopState.tokens.find(t => t.refId === c.id);
    if (!existing) {
        const center = getTabletopCameraCenterWorld();
        const { gx } = getTabletopGridMetrics();
        const spread = (tabletopState.tokens.length % 5) * Math.round(gx * 0.45);
        const tok = {
            id: 'tok-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100),
            refId: c.id,
            name: c.name,
            type: 'pc',
            category: 'character',
            itemKey: c.id,
            groupKey: '',
            ownerId: c.ownerId,
            locked: false,
            x: Math.max(12, center.x - Math.round(gx / 2) + spread),
            y: Math.max(12, center.y - Math.round(gx / 2)),
            hpCurrent: c.hpCurrent,
            hpMax: c.hpMax,
            ac: c.ac,
            imgSrc: c.tokenImg || ''
        };
        tabletopState.tokens.push(tok);
        selectedTabletopTokenId = tok.id;
        saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
            CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
        } else if (typeof CompendioNetAdapter !== 'undefined') {
            CompendioNetAdapter.broadcastTabletop();
        }
    } else {
        selectTabletopToken(existing.id);
    }
    if (activeModule !== 'tabletop') switchMainModule('tabletop');
    else renderTabletopModule();
    showToast(`🎲 "${c.name}" posicionado no Tabletop!`);
}

async function spawnCompendiumEntityToken(cat, groupKey, itemKey, fallbackTitle = '') {
    if (!_isVttEffectiveGm()) {
        showToast('🔒 Apenas o Mestre pode posicionar criaturas, mapas ou itens do Compêndio no Tabletop.');
        return;
    }
    if (cat === 'maps') {
        const root = compendioData.maps || {};
        const entry = groupKey ? root[groupKey]?.children?.[itemKey] : root[itemKey];
        if (entry?.path || entry?.inlineContent) {
            const mapSrc = (entry.path && !/^data:/i.test(entry.path) && entry.inlineContent && isRawSvgMarkup(entry.inlineContent))
                ? entry.path
                : resolveRenderableImageSrc(entry.path || '', entry.inlineContent || '');
            tabletopState.mapPath = mapSrc || entry.path;
            window.tabletopCamera.initialized = false;
            saveLocalPersistence();
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletopMeta) {
                CompendioNetAdapter.broadcastTabletopMeta({ mapPath: tabletopState.mapPath });
            } else {
                CompendioNetAdapter.broadcastTabletop();
            }
            switchMainModule('tabletop');
            showToast(`🗺️ Mapa "${entry.title || itemKey}" carregado no Tabletop!`);
            return;
        }
    }

    const root = compendioData[cat] || {};
    const entry = groupKey ? root[groupKey]?.children?.[itemKey] : root[itemKey];
    const title = entry?.title || fallbackTitle || itemKey;

    if (typeof fetchCompendiumLocalAssets === 'function') {
        await fetchCompendiumLocalAssets();
    }

    const activeMatches = activeItemContext && activeItemContext.key === itemKey
        && (!activeItemContext.category || activeItemContext.category === cat);
    let loadedJson = (activeMatches && activeItemContext.loadedJson) ? activeItemContext.loadedJson : null;
    let loadedHtml = (activeMatches && activeItemContext.loadedHtml) ? activeItemContext.loadedHtml : '';
    let rawText = entry?.inlineContent || '';

    if (!loadedJson && !loadedHtml && !rawText && entry) {
        if (typeof loadCompendiumEntryRawText === 'function') {
            rawText = await loadCompendiumEntryRawText(entry, cat, itemKey);
        } else if (entry.path) {
            try { rawText = await (await fetchWithRetry(entry.path)).text(); } catch (e) {}
        }
    }

    const isItemCat = (cat === 'items' || cat === 'curio');
    const meta = (typeof resolveCreatureEntryMeta === 'function')
        ? resolveCreatureEntryMeta(entry || {}, {
            category: cat,
            groupKey: groupKey || '',
            itemKey,
            fallbackTitle: title,
            loadedJson,
            loadedHtml,
            rawText
        })
        : { title, hp: 30, ac: 14, sizeSquares: 1, initMod: 0, tokenCandidates: [] };

    const hp = isItemCat ? 10 : meta.hp;
    const ac = isItemCat ? 10 : meta.ac;
    const sizeSquares = isItemCat ? 1 : meta.sizeSquares;
    const initMod = isItemCat ? 0 : meta.initMod;

    let imgSrc = '';
    if (typeof resolveBestTokenImageSrc === 'function' && meta.tokenCandidates.length) {
        imgSrc = await resolveBestTokenImageSrc(meta.tokenCandidates);
    }
    if (!imgSrc && entry?.path && isImagePath(entry.path, entry.tipo)) {
        imgSrc = resolveRenderableImageSrc(entry.path, entry.inlineContent);
    }

    const tokenType = isItemCat ? 'item' : (cat === 'npcs' ? 'npc' : 'monster');
    const center = getTabletopCameraCenterWorld();
    const { gx } = getTabletopGridMetrics();
    const spread = (tabletopState.tokens.length % 5) * Math.round(gx * 0.45);

    const knowRec = getEntityKnowledgeRecord(cat, itemKey);
    if (knowRec.globalLevel === 'hidden') knowRec.globalLevel = 'sighted';

    const resolvedName = meta.title || title;
    const tok = {
        id: 'tok-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100),
        refId: `${cat}:${itemKey}`,
        category: cat,
        groupKey: groupKey || '',
        itemKey,
        name: resolvedName,
        type: tokenType,
        ownerId: 'gm-master',
        locked: false,
        x: Math.max(12, center.x - Math.round((gx * sizeSquares) / 2) + spread),
        y: Math.max(12, center.y - Math.round((gx * sizeSquares) / 2)),
        hpCurrent: hp,
        hpMax: hp,
        ac,
        initMod,
        sizeSquares,
        imgSrc
    };
    tabletopState.tokens.push(tok);
    selectedTabletopTokenId = tok.id;
    saveLocalPersistence();
    CompendioNetAdapter.broadcastKnowledge();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
    } else {
        CompendioNetAdapter.broadcastTabletop();
    }
    if (activeModule !== 'tabletop') switchMainModule('tabletop');
    else renderTabletopModule();
    showToast(`🎲 Token "${title}" posicionado no Tabletop!`);
}

function spawnGoldTokenOnTabletop(amount = 50, locked = false, label = 'Saco de Ouro', opts = {}) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) {
        showToast('🔒 Apenas o Mestre pode criar tokens de Ouro.');
        return null;
    }
    ensureTabletopExtendedState();
    const center = getTabletopCameraCenterWorld();
    const { gx } = getTabletopGridMetrics();
    const goldVal = Math.max(1, Math.floor(Number(amount) || 50));
    const tok = {
        id: 'tok-gold-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100),
        refId: 'gold',
        name: (label && String(label).trim()) || `${goldVal} PO`,
        type: 'gold',
        ownerId: 'gm-master',
        locked: Boolean(locked),
        hiddenFromPlayers: Boolean(opts && opts.hiddenFromPlayers),
        lootPolicy: (opts && ['all', 'players', 'characters'].includes(opts.lootPolicy)) ? opts.lootPolicy : 'all',
        allowedPlayerIds: Array.isArray(opts?.allowedPlayerIds) ? opts.allowedPlayerIds.slice() : [],
        allowedCharIds: Array.isArray(opts?.allowedCharIds) ? opts.allowedCharIds.slice() : [],
        goldAmount: goldVal,
        x: Math.max(12, center.x - Math.round(gx / 2)),
        y: Math.max(12, center.y - Math.round(gx / 2)),
        hpCurrent: 1,
        hpMax: 1,
        ac: 10,
        sizeSquares: 1
    };
    tabletopState.tokens.push(tok);
    selectedTabletopTokenId = tok.id;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
    } else {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    showToast(`🪙 Token de Ouro (${goldVal} PO) posicionado!`);
    return tok;
}

function spawnChestTokenOnTabletop(labelOrCfg = 'Baú de Tesouro', gold = 25, items = [], locked = false, opts = {}) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) {
        showToast('🔒 Apenas o Mestre pode criar Baús.');
        return null;
    }
    ensureTabletopExtendedState();
    const cfg = (labelOrCfg && typeof labelOrCfg === 'object' && !Array.isArray(labelOrCfg))
        ? labelOrCfg
        : Object.assign({
            name: labelOrCfg,
            chestGold: gold,
            chestItems: items,
            locked: Boolean(locked)
        }, opts || {});

    const center = getTabletopCameraCenterWorld();
    const { gx } = getTabletopGridMetrics();
    const tok = {
        id: 'tok-chest-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 100),
        refId: 'chest',
        name: (cfg.name && String(cfg.name).trim()) || 'Baú de Tesouro',
        type: 'chest',
        ownerId: 'gm-master',
        locked: Boolean(cfg.locked),
        hiddenFromPlayers: Boolean(cfg.hiddenFromPlayers),
        revealItemCountToPlayers: Boolean(cfg.revealItemCountToPlayers),
        lootPolicy: ['all', 'players', 'characters'].includes(cfg.lootPolicy) ? cfg.lootPolicy : 'all',
        allowedPlayerIds: Array.isArray(cfg.allowedPlayerIds) ? cfg.allowedPlayerIds.slice() : [],
        allowedCharIds: Array.isArray(cfg.allowedCharIds) ? cfg.allowedCharIds.slice() : [],
        chestGold: Math.max(0, Math.floor(Number(cfg.chestGold) || 0)),
        chestItems: Array.isArray(cfg.chestItems) ? cfg.chestItems.map(it => Object.assign({}, it)) : [],
        x: Math.max(12, center.x - Math.round(gx / 2)),
        y: Math.max(12, center.y - Math.round(gx / 2)),
        hpCurrent: 10,
        hpMax: 10,
        ac: 15,
        sizeSquares: 1
    };
    tabletopState.tokens.push(tok);
    selectedTabletopTokenId = tok.id;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
    } else {
        CompendioNetAdapter.broadcastTabletop();
    }
    renderTabletopModule();
    if (!cfg.skipOpenAfterSpawn) openChestTokenModal(tok.id);
    else showToast(`🧰 "${tok.name}" posicionado no Tabletop!`);
    return tok;
}

function renderTokenDrawerPanelHtml(isGm) {
    if (!window.ttDrawerOpen) return '';
    const p = getActivePlayer();
    const visibleTokens = tabletopState.tokens.filter(t => isTokenVisibleToCurrentUser(t, p));
    const tabs = [
        { id: 'pcs', label: `🛡️ PJs (${charactersData.length})` },
        ...(isGm ? [
            { id: 'monsters', label: '🐉 Monstros' },
            { id: 'npcs', label: '🧙‍♂️ NPCs' },
            { id: 'items', label: '⚔️ Itens' },
            { id: 'loot', label: '🪙 Ouro & 🧰 Baú' }
        ] : []),
        { id: 'placed', label: `📍 Na Mesa (${visibleTokens.length})` }
    ];
    const requestedTab = window.ttDrawerTab || (isGm ? 'monsters' : 'pcs');
    const activeTab = tabs.some(tb => tb.id === requestedTab) ? requestedTab : tabs[0].id;
    window.ttDrawerTab = activeTab;
    const searchVal = window.ttDrawerSearch || '';
    const searchLower = searchVal.toLowerCase();
    const matchesSearch = (titleStr) => !searchLower || String(titleStr || '').toLowerCase().includes(searchLower);

    let bodyHtml = '';
    if (activeTab === 'pcs') {
        const visibleChars = isGm
            ? charactersData
            : charactersData.filter(c => typeof canAccessFullCharacterSheet === 'function' ? canAccessFullCharacterSheet(c) : true);
        let matchCount = 0;
        const cardsHtml = visibleChars.map(c => {
            const titleLower = escapeHtmlText((c.name || '').toLowerCase());
            const isVis = matchesSearch(c.name);
            if (isVis) matchCount++;
            const ownerShown = typeof getPlayerDisplayName === 'function' ? getPlayerDisplayName(c.ownerId, c.ownerName || '') : (c.ownerName || '');
            return `
                <div class="tt-drawer-card" style="display:${isVis ? 'flex' : 'none'};" data-drawer-title="${titleLower}" onclick="sendCharacterToTabletop('${c.id}')">
                    <div class="tt-drawer-card-info">
                        <strong>🛡️ ${escapeHtmlText(c.name)}</strong>
                        <span>${c.hpCurrent}/${c.hpMax} PV · CA ${c.ac || 10}${ownerShown ? ` · ${escapeHtmlText(ownerShown)}` : ''}</span>
                    </div>
                    <span class="btn-mini" style="flex:0 0 auto;">＋ Mesa</span>
                </div>
            `;
        }).join('');
        bodyHtml = `<div class="tt-drawer-grid" id="tt-drawer-items-grid">` +
            (cardsHtml || `<div class="tt-drawer-empty">Nenhum personagem disponível ainda.</div>`) +
            `<div id="tt-drawer-search-empty" class="tt-drawer-empty" style="display:${visibleChars.length > 0 && matchCount === 0 ? 'block' : 'none'};">Nenhum personagem encontrado para "${escapeHtmlText(searchVal)}".</div>` +
            `</div>`;
    } else if (activeTab === 'loot' && isGm) {
        bodyHtml = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="tt-drawer-loot-box" style="border-color:#d4ac0d;">
                    <div style="font-size:12px; font-weight:700; color:#ffd54f;">🪙 Posicionar Token de Ouro</div>
                    <input type="text" id="drawer-gold-label" class="form-control" style="padding:5px 8px; font-size:12px;" value="Saco de Ouro" placeholder="Nome">
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                        <input type="number" id="drawer-gold-amount" class="form-control" style="width:92px; padding:5px 8px; font-size:12px;" value="50" min="1" title="Quantidade de PO">
                        <span style="font-size:11px; color:#9da3b8;">PO</span>
                        <label style="font-size:11px; color:#ccc; display:flex; align-items:center; gap:3px; cursor:pointer;" title="Posicionar inicialmente oculto para jogadores"><input type="checkbox" id="drawer-gold-hidden"> 🙈 Oculto</label>
                        <button type="button" class="btn-summon-card" style="flex:1; padding:6px 10px;" onclick="spawnGoldTokenOnTabletop(document.getElementById('drawer-gold-amount').value, false, document.getElementById('drawer-gold-label').value, { hiddenFromPlayers: Boolean(document.getElementById('drawer-gold-hidden')?.checked) })">＋ Posicionar Ouro</button>
                    </div>
                </div>
                <div class="tt-drawer-loot-box" style="border-color:#d8b467;">
                    <div style="font-size:12px; font-weight:700; color:#f2cf83;">🧰 Configurar e Posicionar Baú</div>
                    <input type="text" id="drawer-chest-label" class="form-control" style="padding:5px 8px; font-size:12px;" value="Baú de Tesouro" placeholder="Nome do Baú">
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                        <input type="number" id="drawer-chest-gold" class="form-control" style="width:76px; padding:5px 8px; font-size:12px;" value="25" min="0" title="Ouro inicial (PO)">
                        <span style="font-size:11px; color:#9da3b8;">PO</span>
                        <label style="font-size:11px; color:#ccc; display:flex; align-items:center; gap:3px; cursor:pointer;"><input type="checkbox" id="drawer-chest-locked"> 🔒 Trancado</label>
                        <button type="button" class="btn-summon-card" style="flex:1; padding:6px 10px;" onclick="openChestCreateModal({ name: document.getElementById('drawer-chest-label')?.value, chestGold: document.getElementById('drawer-chest-gold')?.value, locked: Boolean(document.getElementById('drawer-chest-locked')?.checked) })">⚙️ Configurar &amp; Criar Baú...</button>
                    </div>
                    <div style="font-size:10.5px; color:#9da3b8; margin-top:4px;">Abre o assistente para definir itens, visibilidade e quem pode saquear antes de colocar na mesa.</div>
                </div>
            </div>
        `;
    } else if (activeTab === 'placed') {
        let matchCount = 0;
        const cardsHtml = visibleTokens.map(t => {
            const icon = t.type === 'pc' ? '🛡️' : (t.type === 'gold' ? '🪙' : (t.type === 'chest' ? '🧰' : (t.type === 'item' ? '⚔️' : (t.type === 'npc' ? '🧙‍♂️' : '🐉'))));
            const showExact = typeof canSeeTokenExactStats === 'function' ? canSeeTokenExactStats(t) : isGm;
            const sub = t.type === 'gold'
                ? `${Number(t.goldAmount) || 0} PO${t.locked ? ' 🔒' : ''}`
                : (t.type === 'chest'
                    ? formatChestSummaryText(t, isGm, 'drawer')
                    : (t.type === 'item'
                        ? '📦 Objeto/Item'
                        : (showExact ? `${t.hpCurrent}/${t.hpMax} PV · CA ${t.ac || '?'}` : describeQualitativeHealth(t.hpCurrent, t.hpMax, t.type))));
            const canDel = CompendioNetAdapter.canControlEntity(t.ownerId);
            const isVis = matchesSearch(t.name);
            if (isVis) matchCount++;
            return `
                <div class="tt-drawer-card ${String(t.id) === String(selectedTabletopTokenId) ? 'is-selected' : ''} ${t.hiddenFromPlayers ? 'is-hidden-card' : ''}" style="display:${isVis ? 'flex' : 'none'};" data-drawer-token-id="${escapeHtmlText(t.id)}" data-drawer-title="${escapeHtmlText((t.name || '').toLowerCase())}" onclick="selectTabletopToken('${t.id}')">
                    <div class="tt-drawer-card-info">
                        <strong>${icon} ${t.hiddenFromPlayers && isGm ? '🙈 ' : ''}${escapeHtmlText(t.name)}</strong>
                        <span>${escapeHtmlText(sub)}</span>
                    </div>
                    <div style="display:flex; gap:4px; flex-shrink:0;">
                        ${isGm ? `<button type="button" class="btn-mini ${t.hiddenFromPlayers ? 'is-active' : ''}" style="padding:2px 6px;" onclick="event.stopPropagation(); toggleTabletopTokenVisibility('${t.id}')" title="${t.hiddenFromPlayers ? 'Mostrar token aos jogadores' : 'Ocultar token dos jogadores'}">${t.hiddenFromPlayers ? '🙈' : '👁️'}</button>` : ''}
                        ${(t.type === 'gold' || t.type === 'chest') ? `<button type="button" class="btn-mini" style="padding:2px 6px;" onclick="event.stopPropagation(); openInteractiveTokenModal('${t.id}')" title="Abrir / Saquear">🎒</button>` : ''}
                        ${canDel ? `<button type="button" class="btn-mini danger" style="padding:2px 6px;" onclick="event.stopPropagation(); removeTabletopToken('${t.id}')" title="Remover">✕</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        bodyHtml = `<div class="tt-drawer-grid" id="tt-drawer-items-grid">` +
            (cardsHtml || `<div class="tt-drawer-empty">Nenhum token visível na mesa ainda.</div>`) +
            `<div id="tt-drawer-search-empty" class="tt-drawer-empty" style="display:${visibleTokens.length > 0 && matchCount === 0 ? 'block' : 'none'};">Nenhum token na mesa para "${escapeHtmlText(searchVal)}".</div>` +
            `</div>`;
    } else if (isGm) {
        const cats = activeTab === 'items' ? ['items', 'curio'] : (activeTab === 'npcs' ? ['npcs'] : ['monsters']);
        const ents = typeof getAllCatalogEntities === 'function' ? getAllCatalogEntities(cats) : [];
        let matchCount = 0;
        const cardsHtml = ents.map(e => {
            const titleLower = escapeHtmlText((e.title || '').toLowerCase());
            const isVis = matchesSearch(e.title);
            if (isVis) matchCount++;
            const args = `'${e.category}', '${String(e.groupKey || '').replace(/'/g, "\\'")}', '${String(e.itemKey || '').replace(/'/g, "\\'")}', '${escapeHtmlText(e.title).replace(/'/g, "\\'")}'`;
            return `
                <div class="tt-drawer-card" style="display:${isVis ? 'flex' : 'none'};" data-drawer-title="${titleLower}" onclick="spawnCompendiumEntityToken(${args})">
                    <div class="tt-drawer-card-info">
                        <strong>${escapeHtmlText(e.title)}</strong>
                        <span>${escapeHtmlText(e.category)}</span>
                    </div>
                    <span class="btn-mini" style="flex:0 0 auto;">＋ Mesa</span>
                </div>
            `;
        }).join('');
        bodyHtml = `<div class="tt-drawer-grid" id="tt-drawer-items-grid">` +
            (cardsHtml || `<div class="tt-drawer-empty">Nenhuma entrada encontrada nesta categoria do Compêndio.</div>`) +
            `<div id="tt-drawer-search-empty" class="tt-drawer-empty" style="display:${ents.length > 0 && matchCount === 0 ? 'block' : 'none'};">Nenhum resultado para "${escapeHtmlText(searchVal)}".</div>` +
            `</div>`;
    }

    const showSearch = activeTab !== 'loot';
    return `
        <div id="tt-token-drawer" class="tt-token-drawer open">
            <div class="tt-token-drawer-header">
                <div class="tt-token-drawer-top">
                    <span>📦 Gaveta de Tokens</span>
                    <button type="button" class="btn-mini" style="padding:2px 7px;" onclick="toggleTokenDrawer(false)" title="Fechar gaveta">✕</button>
                </div>
                <div class="tt-token-drawer-tabs">
                    ${tabs.map(tb => `<button type="button" class="btn-mini ${activeTab === tb.id ? 'is-active' : ''}" onclick="setTokenDrawerTab('${tb.id}')">${tb.label}</button>`).join('')}
                </div>
                ${showSearch ? `<input type="text" id="tt-drawer-search" class="form-control" style="width:100%; padding:4px 8px; font-size:11.5px;" value="${escapeHtmlText(searchVal)}" placeholder="🔍 Filtrar..." oninput="filterTokenDrawerCards(this.value)">` : ''}
            </div>
            <div class="tt-token-drawer-body">${bodyHtml}</div>
        </div>
    `;
}

/* ------------------ MODAIS INTERATIVOS DE OURO & BAÚ + LOOT ATÔMICO ------------------ */
window._activeChestOrGoldTokenId = null;

function _resolveTargetLootCharacterForCurrentUser() {
    const p = getActivePlayer();
    const own = charactersData.find(c => c.id === activeCharacterId && canAccessFullCharacterSheet(c))
        || charactersData.find(c => p && c.ownerId === p.id)
        || (_isVttEffectiveGm(p) ? charactersData[0] : null);
    return own || null;
}

function openInteractiveTokenModal(tokenId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    if (!isTokenVisibleToCurrentUser(tok)) {
        showToast('🙈 Este token está oculto pelo Mestre.');
        return;
    }
    if (tok.type === 'gold') openGoldTokenModal(tokenId);
    else if (tok.type === 'chest') openChestTokenModal(tokenId);
}

function openSheetFromTabletopToken(tokenId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    if (!isTokenVisibleToCurrentUser(tok)) {
        showToast('🙈 Este token está oculto pelo Mestre.');
        return;
    }
    if (tok.type === 'gold' || tok.type === 'chest') {
        openInteractiveTokenModal(tokenId);
        return;
    }
    if (typeof jumpFromTokenToSheet === 'function') {
        jumpFromTokenToSheet(tokenId);
        return;
    }
    if (tok.type === 'pc' || tok.category === 'character') {
        activeCharacterId = tok.refId;
        switchMainModule('character');
        return;
    }
    if (tok.category && tok.itemKey) {
        activeModule = 'compendium';
        updateMainModuleButtonsUI();
        jumpToCatalogEntity(tok.category, tok.groupKey || '', tok.itemKey);
    }
}

function closeGoldTokenModal() {
    window._activeChestOrGoldTokenId = null;
    document.getElementById('tt-gold-backdrop')?.classList.remove('open');
}

function _renderLootPermissionsEditorHtml(cfg, kind = 'chest-token', tokenId = '') {
    const policy = ['all', 'players', 'characters'].includes(cfg.lootPolicy) ? cfg.lootPolicy : 'all';
    const allowedP = new Set(Array.isArray(cfg.allowedPlayerIds) ? cfg.allowedPlayerIds : []);
    const allowedC = new Set(Array.isArray(cfg.allowedCharIds) ? cfg.allowedCharIds : []);
    const nonGmPlayers = (typeof playersData !== 'undefined' ? playersData : []).filter(pl => pl && pl.role !== 'gm');
    const allChars = (typeof charactersData !== 'undefined' ? charactersData : []);

    const safeTokArg = `'${String(tokenId || '').replace(/'/g, "\\'")}'`;
    const onPolicyChange = (val) => `onLootPermissionPolicyChange('${kind}', ${safeTokArg}, '${val}')`;
    const onToggleId = (field, itemId) => `onLootPermissionIdToggle('${kind}', ${safeTokArg}, '${field}', '${String(itemId).replace(/'/g, "\\'")}', this.checked)`;

    let detailHtml = '';
    if (policy === 'players') {
        detailHtml = nonGmPlayers.length
            ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">` + nonGmPlayers.map(pl => `
                <label style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; background:#15161c; border:1px solid ${allowedP.has(pl.id) ? '#d8b467' : '#3c3e4a'}; padding:4px 8px; border-radius:5px; cursor:pointer;">
                    <input type="checkbox" ${allowedP.has(pl.id) ? 'checked' : ''} onchange="${onToggleId('allowedPlayerIds', pl.id)}">
                    <span>${escapeHtmlText(pl.avatarEmoji || '🎮')} ${escapeHtmlText(pl.name)}</span>
                </label>
            `).join('') + `</div>`
            : `<div style="font-size:11px; color:#9da3b8; margin-top:6px;">Nenhum jogador cadastrado ainda — crie contas de jogador ou use "Todos os jogadores".</div>`;
    } else if (policy === 'characters') {
        detailHtml = allChars.length
            ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">` + allChars.map(c => `
                <label style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; background:#15161c; border:1px solid ${allowedC.has(c.id) ? '#d8b467' : '#3c3e4a'}; padding:4px 8px; border-radius:5px; cursor:pointer;">
                    <input type="checkbox" ${allowedC.has(c.id) ? 'checked' : ''} onchange="${onToggleId('allowedCharIds', c.id)}">
                    <span>🛡️ ${escapeHtmlText(c.name)} <em style="color:#8f95ab;">(${escapeHtmlText(c.ownerName || 'Jogador')})</em></span>
                </label>
            `).join('') + `</div>`
            : `<div style="font-size:11px; color:#9da3b8; margin-top:6px;">Nenhum personagem criado ainda.</div>`;
    }

    return `
        <div style="margin-top:10px; padding:8px 10px; background:#171820; border:1px solid #3c3e4a; border-radius:6px;">
            <div style="font-size:11.5px; font-weight:700; color:#f2cf83; margin-bottom:6px;">🔐 Quem pode coletar este tesouro?</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <label style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; cursor:pointer;">
                    <input type="radio" name="loot-pol-${kind}-${escapeHtmlText(tokenId || 'draft')}" ${policy === 'all' ? 'checked' : ''} onchange="${onPolicyChange('all')}"> 🌍 Todos os jogadores
                </label>
                <label style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; cursor:pointer;">
                    <input type="radio" name="loot-pol-${kind}-${escapeHtmlText(tokenId || 'draft')}" ${policy === 'players' ? 'checked' : ''} onchange="${onPolicyChange('players')}"> 👥 Selecionar jogadores
                </label>
                <label style="display:inline-flex; align-items:center; gap:4px; font-size:11.5px; cursor:pointer;">
                    <input type="radio" name="loot-pol-${kind}-${escapeHtmlText(tokenId || 'draft')}" ${policy === 'characters' ? 'checked' : ''} onchange="${onPolicyChange('characters')}"> 🛡️ Selecionar personagens
                </label>
            </div>
            ${detailHtml}
        </div>
    `;
}

function onLootPermissionPolicyChange(kind, tokenId, nextPolicy) {
    if (kind === 'chest-draft') {
        if (!window._pendingChestCreateDraft) return;
        window._pendingChestCreateDraft.lootPolicy = nextPolicy;
        renderChestCreateModalBody();
    } else if (kind === 'gold-token') {
        updateGoldTokenSettings(tokenId, { lootPolicy: nextPolicy });
    } else {
        updateChestSettings(tokenId, { lootPolicy: nextPolicy });
    }
}

function onLootPermissionIdToggle(kind, tokenId, field, itemId, checked) {
    const applyArr = (obj) => {
        const set = new Set(Array.isArray(obj?.[field]) ? obj[field] : []);
        if (checked) set.add(itemId);
        else set.delete(itemId);
        return Array.from(set);
    };
    if (kind === 'chest-draft') {
        if (!window._pendingChestCreateDraft) return;
        window._pendingChestCreateDraft[field] = applyArr(window._pendingChestCreateDraft);
        renderChestCreateModalBody();
    } else if (kind === 'gold-token') {
        const tok = tabletopState.tokens.find(t => t.id === tokenId);
        if (tok) updateGoldTokenSettings(tokenId, { [field]: applyArr(tok) });
    } else {
        const tok = tabletopState.tokens.find(t => t.id === tokenId);
        if (tok) updateChestSettings(tokenId, { [field]: applyArr(tok) });
    }
}

function openGoldTokenModal(tokenId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    const backdrop = document.getElementById('tt-gold-backdrop');
    const container = document.getElementById('tt-gold-modal-content');
    if (!tok || !backdrop || !container) return;
    if (!isTokenVisibleToCurrentUser(tok)) {
        showToast('🙈 Este token está oculto pelo Mestre.');
        return;
    }
    window._activeChestOrGoldTokenId = tok.id;

    const p = getActivePlayer();
    const isGm = _isVttEffectiveGm(p);
    const canLoot = canCurrentUserLootToken(tok, p);
    const allowedC = Array.isArray(tok.allowedCharIds) ? tok.allowedCharIds : [];
    const eligibleChars = charactersData.filter(c => {
        if (!canAccessFullCharacterSheet(c)) return false;
        if (!isGm && tok.lootPolicy === 'characters') return allowedC.includes(c.id);
        return true;
    });
    const targetChar = eligibleChars.find(c => c.id === activeCharacterId) || eligibleChars[0] || _resolveTargetLootCharacterForCurrentUser();
    const charOptions = eligibleChars
        .map(c => `<option value="${c.id}" ${targetChar && c.id === targetChar.id ? 'selected' : ''}>🛡️ ${escapeHtmlText(c.name)} (${Number(c.gold) || 0} PO)</option>`)
        .join('');
    const goldAmt = Math.max(0, Number(tok.goldAmount) || 0);

    container.innerHTML = `
        <div class="studio-header">
            <h2>🪙 ${escapeHtmlText(tok.name)} (${goldAmt} PO)${tok.hiddenFromPlayers && isGm ? ' 🙈' : ''}</h2>
            <button class="btn-close-modal" type="button" onclick="closeGoldTokenModal()">✕</button>
        </div>
        <div class="studio-form-pane" style="border-right:none; max-height:76vh; overflow-y:auto;">
            ${tok.locked ? `<div style="background:rgba(198,40,40,0.2); border:1px solid #c62828; color:#ff9e9e; padding:8px 10px; border-radius:6px; margin-bottom:12px; font-size:12px;">🔒 Este token de ouro está bloqueado pelo Mestre.</div>` : ''}
            ${(!isGm && !canLoot) ? `<div style="background:rgba(198,40,40,0.18); border:1px solid #8b6b35; color:#f2cf83; padding:8px 10px; border-radius:6px; margin-bottom:12px; font-size:12px;">🚫 O Mestre restringiu a coleta deste ouro a jogadores ou personagens específicos.</div>` : ''}

            ${isGm ? `
                <div class="form-section" style="margin-bottom:12px;">
                    <h3 class="form-section-title">👑 Controles do Mestre</h3>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Rótulo</label>
                            <input type="text" id="gm-gold-name" class="form-control" value="${escapeHtmlText(tok.name)}" onchange="updateGoldTokenSettings('${tok.id}', { name: this.value })">
                        </div>
                        <div class="form-group">
                            <label>Quantidade de Ouro (PO)</label>
                            <input type="number" id="gm-gold-amt" class="form-control" min="0" value="${goldAmt}" onchange="updateGoldTokenSettings('${tok.id}', { goldAmount: Math.max(0, Number(this.value) || 0) })">
                        </div>
                    </div>
                    <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:8px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                            <input type="checkbox" ${tok.locked ? 'checked' : ''} onchange="updateGoldTokenSettings('${tok.id}', { locked: this.checked })"> 🔒 Bloquear coleta por jogadores
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                            <input type="checkbox" ${tok.hiddenFromPlayers ? 'checked' : ''} onchange="updateGoldTokenSettings('${tok.id}', { hiddenFromPlayers: this.checked })"> 🙈 Ocultar dos jogadores
                        </label>
                    </div>
                    ${_renderLootPermissionsEditorHtml(tok, 'gold-token', tok.id)}
                </div>
            ` : ''}

            ${((!tok.locked && canLoot) || isGm) && goldAmt > 0 ? `
                <div class="form-section">
                    <h3 class="form-section-title">🎒 Recolher para Ficha de Personagem</h3>
                    ${charOptions ? `
                        <div class="form-group" style="margin-bottom:8px;">
                            <label>Personagem receptor</label>
                            <select id="gold-loot-target-char" class="form-control">${charOptions}</select>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <input type="number" id="gold-loot-partial-amt" class="form-control" style="width:110px;" min="1" max="${goldAmt}" value="${goldAmt}">
                            <button type="button" class="btn-action-bar" onclick="collectGoldTokenAmount('${tok.id}', document.getElementById('gold-loot-partial-amt').value)">🪙 Pegar Quantia</button>
                            <button type="button" class="btn-save-primary" onclick="collectGoldTokenAmount('${tok.id}', 'all')">✨ Pegar Tudo (${goldAmt} PO)</button>
                        </div>
                    ` : `<p style="font-size:12px; color:#b8b2a6;">Crie ou selecione uma ficha de personagem elegível antes de recolher moedas.</p>`}
                </div>
            ` : (goldAmt <= 0 ? `<div class="info-text">Não restam mais moedas neste ponto.</div>` : '')}
        </div>
    `;
    backdrop.classList.add('open');
}

function updateGoldTokenSettings(tokenId, patch) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    const prevHidden = Boolean(tok.hiddenFromPlayers);
    Object.assign(tok, patch);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTokenDelta) {
        CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
    }
    if (prevHidden !== Boolean(tok.hiddenFromPlayers)) renderTabletopModule();
    else updateTabletopTokenDom(tok.id);
    openGoldTokenModal(tok.id);
}

async function collectGoldTokenAmount(tokenId, amountOrAll = 'all') {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    const isGm = _isVttEffectiveGm();
    if (tok.locked && !isGm) {
        showToast('🔒 Este token de ouro está bloqueado pelo Mestre.');
        return;
    }
    const targetCharId = document.getElementById('gold-loot-target-char')?.value || _resolveTargetLootCharacterForCurrentUser()?.id;
    const targetChar = charactersData.find(c => c.id === targetCharId);
    if (!targetChar) {
        showToast('Selecione um personagem para receber o ouro.');
        return;
    }
    if (!canCurrentUserLootToken(tok, getActivePlayer(), targetChar)) {
        showToast('🚫 Você ou este personagem não tem permissão para coletar este ouro.');
        return;
    }

    const avail = Math.max(0, Number(tok.goldAmount) || 0);
    const wanted = amountOrAll === 'all' ? avail : Math.max(1, Math.min(avail, Math.floor(Number(amountOrAll) || 0)));
    if (wanted <= 0) return;

    let collected = wanted;
    let remaining = avail - collected;
    let removed = remaining <= 0;

    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastGoldCollect) {
        const res = await CompendioNetAdapter.broadcastGoldCollect({
            tokenId: tok.id,
            amount: wanted,
            targetCharId: targetChar.id,
            removeIfEmpty: true
        });
        if (!res || res.ok === false) {
            showToast(`⚠️ ${res?.error || 'Este ouro já foi recolhido ou está bloqueado.'}`);
            renderTabletopModule();
            closeGoldTokenModal();
            return;
        }
        if (!res.localOnly) {
            collected = Number(res.collectedAmount) || 0;
            remaining = Number(res.remainingGold) || 0;
            removed = Boolean(res.removed);
        }
    }

    tok.goldAmount = remaining;
    if (removed) {
        tabletopState.tokens = tabletopState.tokens.filter(t => t.id !== tok.id);
        if (selectedTabletopTokenId === tok.id) selectedTabletopTokenId = null;
        closeGoldTokenModal();
    } else {
        openGoldTokenModal(tok.id);
    }

    ensureCharacterExtendedFields(targetChar);
    targetChar.gold = (Number(targetChar.gold) || 0) + collected;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDelta) {
        CompendioNetAdapter.sendDelta({ type: 'CHARACTER_UPDATE', character: targetChar });
    }
    renderTabletopModule();
    showToast(`🪙 +${collected} PO adicionados à ficha de "${targetChar.name}"!`);
}

window._pendingChestCreateDraft = null;

function closeChestTokenModal() {
    window._activeChestOrGoldTokenId = null;
    window._pendingChestCreateDraft = null;
    document.getElementById('tt-chest-backdrop')?.classList.remove('open');
}

function openChestCreateModal(prefill = {}) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) {
        showToast('🔒 Apenas o Mestre pode criar Baús.');
        return;
    }
    const backdrop = document.getElementById('tt-chest-backdrop');
    if (!backdrop) return;
    window._activeChestOrGoldTokenId = null;
    window._pendingChestCreateDraft = {
        name: (prefill?.name && String(prefill.name).trim()) || 'Baú de Tesouro',
        chestGold: Math.max(0, Math.floor(Number(prefill?.chestGold ?? 25) || 0)),
        locked: Boolean(prefill?.locked),
        hiddenFromPlayers: Boolean(prefill?.hiddenFromPlayers),
        revealItemCountToPlayers: Boolean(prefill?.revealItemCountToPlayers),
        lootPolicy: 'all',
        allowedPlayerIds: [],
        allowedCharIds: [],
        chestItems: Array.isArray(prefill?.chestItems) ? prefill.chestItems.slice() : []
    };
    renderChestCreateModalBody();
    backdrop.classList.add('open');
}

function renderChestCreateModalBody() {
    const draft = window._pendingChestCreateDraft;
    const container = document.getElementById('tt-chest-modal-content');
    if (!draft || !container) return;

    const compItems = getAllCatalogEntities(['items', 'curio']);
    const compItemOpts = `<option value="">🎒 + Adicionar Item do Compêndio...</option>` +
        compItems.map(i => `<option value="${i.category}|${i.groupKey}|${i.itemKey}|${escapeHtmlText(i.title)}">⚔️ ${escapeHtmlText(i.title)}</option>`).join('');

    const itemsHtml = draft.chestItems.map(it => {
        const sItemId = `'${String(it.id).replace(/'/g, "\\'")}'`;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:#15161c; border:1px solid #3c3e4a; border-radius:6px; padding:6px 10px; margin-bottom:5px;">
                <strong style="color:#f2cf83; font-size:12.5px;">${it.category ? '⚔️' : '📦'} ${escapeHtmlText(it.title || it.name)} ${Number(it.qty) > 1 ? `(${it.qty}x)` : ''}</strong>
                <button type="button" class="btn-mini danger" onclick="removeDraftChestItem(${sItemId})" title="Remover">✕</button>
            </div>
        `;
    }).join('') || `<div style="color:#8e92a8; font-size:12px; font-style:italic;">Nenhum item adicionado ainda (você pode adicionar antes ou depois).</div>`;

    container.innerHTML = `
        <div class="studio-header">
            <h2>🧰 Configurar Novo Baú antes de Posicionar</h2>
            <button class="btn-close-modal" type="button" onclick="closeChestTokenModal()">✕</button>
        </div>
        <div class="studio-form-pane" style="border-right:none; max-height:76vh; overflow-y:auto;">
            <div class="form-section">
                <h3 class="form-section-title">1. Conteúdo, Visibilidade &amp; Segurança</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Nome do Baú</label>
                        <input type="text" class="form-control" value="${escapeHtmlText(draft.name)}" oninput="if(window._pendingChestCreateDraft) window._pendingChestCreateDraft.name = this.value">
                    </div>
                    <div class="form-group">
                        <label>Ouro Guardado (PO)</label>
                        <input type="number" class="form-control" min="0" value="${draft.chestGold}" oninput="if(window._pendingChestCreateDraft) window._pendingChestCreateDraft.chestGold = Math.max(0, Math.floor(Number(this.value)||0))">
                    </div>
                </div>
                <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:10px;">
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                        <input type="checkbox" ${draft.locked ? 'checked' : ''} onchange="if(window._pendingChestCreateDraft) window._pendingChestCreateDraft.locked = this.checked"> 🔒 Baú Trancado
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                        <input type="checkbox" ${draft.hiddenFromPlayers ? 'checked' : ''} onchange="if(window._pendingChestCreateDraft) window._pendingChestCreateDraft.hiddenFromPlayers = this.checked"> 🙈 Ocultar baú dos jogadores
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;" title="Por padrão o número de itens fica oculto para não-mestres">
                        <input type="checkbox" ${draft.revealItemCountToPlayers ? 'checked' : ''} onchange="if(window._pendingChestCreateDraft) window._pendingChestCreateDraft.revealItemCountToPlayers = this.checked"> 🔢 Mostrar nº de itens aos jogadores
                    </label>
                </div>
                ${_renderLootPermissionsEditorHtml(draft, 'chest-draft', 'draft')}
            </div>

            <div class="form-section">
                <h3 class="form-section-title">2. Itens Dentro do Baú (${draft.chestItems.length})</h3>
                <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
                    <select class="form-control" style="flex:1; min-width:190px; padding:5px 8px; font-size:12px;" onchange="addDraftChestItemFromCompendium(this.value); this.value='';">${compItemOpts}</select>
                    <input type="text" id="draft-chest-custom-name" class="form-control" style="flex:1; min-width:140px; padding:5px 8px; font-size:12px;" placeholder="Item custom (ex: Chave de Obsidiana)">
                    <input type="number" id="draft-chest-custom-qty" class="form-control" style="width:62px; padding:5px; font-size:12px;" min="1" value="1" title="Qtd">
                    <button type="button" class="btn-action-bar" onclick="addDraftCustomChestItem()">＋ Item</button>
                </div>
                ${itemsHtml}
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                <button type="button" class="btn-mini" onclick="closeChestTokenModal()">Cancelar</button>
                <button type="button" class="btn-save-primary" onclick="confirmCreateChestTokenOnTabletop()">🧰 Posicionar Baú na Mesa</button>
            </div>
        </div>
    `;
}

function addDraftChestItemFromCompendium(selectVal) {
    if (!selectVal || !window._pendingChestCreateDraft) return;
    const [cat, groupKey, itemKey, title] = selectVal.split('|');
    window._pendingChestCreateDraft.chestItems.push({
        id: 'ci-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
        title: title || itemKey,
        qty: 1,
        category: cat,
        groupKey: groupKey || '',
        itemKey
    });
    renderChestCreateModalBody();
}

function addDraftCustomChestItem() {
    if (!window._pendingChestCreateDraft) return;
    const title = (document.getElementById('draft-chest-custom-name')?.value || '').trim();
    const qty = Math.max(1, Math.floor(Number(document.getElementById('draft-chest-custom-qty')?.value) || 1));
    if (!title) return;
    window._pendingChestCreateDraft.chestItems.push({
        id: 'ci-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
        title,
        qty
    });
    renderChestCreateModalBody();
}

function removeDraftChestItem(itemId) {
    if (!window._pendingChestCreateDraft) return;
    window._pendingChestCreateDraft.chestItems = window._pendingChestCreateDraft.chestItems.filter(i => i.id !== itemId);
    renderChestCreateModalBody();
}

function confirmCreateChestTokenOnTabletop() {
    const draft = window._pendingChestCreateDraft;
    if (!draft) return;
    const cfg = Object.assign({}, draft, { skipOpenAfterSpawn: true });
    closeChestTokenModal();
    spawnChestTokenOnTabletop(cfg);
}

function openChestTokenModal(tokenId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    const backdrop = document.getElementById('tt-chest-backdrop');
    const container = document.getElementById('tt-chest-modal-content');
    if (!tok || !backdrop || !container) return;
    if (!isTokenVisibleToCurrentUser(tok)) {
        showToast('🙈 Este baú está oculto pelo Mestre.');
        return;
    }
    window._pendingChestCreateDraft = null;
    window._activeChestOrGoldTokenId = tok.id;
    if (!Array.isArray(tok.chestItems)) tok.chestItems = [];
    tok.chestGold = Math.max(0, Number(tok.chestGold) || 0);

    const p = getActivePlayer();
    const isGm = _isVttEffectiveGm(p);
    const canLoot = canCurrentUserLootToken(tok, p);
    const allowedC = Array.isArray(tok.allowedCharIds) ? tok.allowedCharIds : [];
    const eligibleChars = charactersData.filter(c => {
        if (!canAccessFullCharacterSheet(c)) return false;
        if (!isGm && tok.lootPolicy === 'characters') return allowedC.includes(c.id);
        return true;
    });
    const targetChar = eligibleChars.find(c => c.id === activeCharacterId) || eligibleChars[0] || _resolveTargetLootCharacterForCurrentUser();
    const charOptions = eligibleChars
        .map(c => `<option value="${c.id}" ${targetChar && c.id === targetChar.id ? 'selected' : ''}>🛡️ ${escapeHtmlText(c.name)}</option>`)
        .join('');

    const compItems = getAllCatalogEntities(['items', 'curio']);
    const compItemOpts = `<option value="">🎒 + Adicionar Item do Compêndio...</option>` +
        compItems.map(i => `<option value="${i.category}|${i.groupKey}|${i.itemKey}|${escapeHtmlText(i.title)}">⚔️ ${escapeHtmlText(i.title)}</option>`).join('');

    const canOpenContents = isGm || (!tok.locked && canLoot);
    const itemsKnown = Boolean(isGm || tok.revealItemCountToPlayers);
    const itemsHtml = tok.chestItems.map(it => {
        const sItemId = `'${String(it.id).replace(/'/g, "\\'")}'`;
        return `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; background:#15161c; border:1px solid #3c3e4a; border-radius:6px; padding:7px 10px; margin-bottom:6px;">
                <div style="flex:1; min-width:0;">
                    <strong style="color:#f2cf83; font-size:13px;">${it.category ? '⚔️' : '📦'} ${escapeHtmlText(it.title || it.name)} ${Number(it.qty) > 1 ? `(${it.qty}x)` : ''}</strong>
                    ${it.notes ? `<div style="font-size:11px; color:#a0a4b8;">${escapeHtmlText(it.notes)}</div>` : ''}
                </div>
                <div style="display:flex; gap:5px; flex-shrink:0;">
                    ${(canOpenContents && charOptions) ? `<button type="button" class="btn-save-primary" style="padding:4px 9px; font-size:11px;" onclick="lootChestItem('${tok.id}', ${sItemId})">🎒 Pegar p/ Ficha</button>` : ''}
                    ${isGm ? `<button type="button" class="btn-mini danger" onclick="removeChestItemById('${tok.id}', ${sItemId})" title="Remover do baú">✕</button>` : ''}
                </div>
            </div>
        `;
    }).join('') || `<div style="color:#8e92a8; font-size:12px; font-style:italic;">Baú sem itens no momento.</div>`;

    container.innerHTML = `
        <div class="studio-header">
            <h2>🧰 ${escapeHtmlText(tok.name)} ${tok.locked ? '🔒' : '🔓'}${itemsKnown ? ` (${tok.chestItems.length} itens)` : ''}${tok.hiddenFromPlayers && isGm ? ' 🙈' : ''}</h2>
            <button class="btn-close-modal" type="button" onclick="closeChestTokenModal()">✕</button>
        </div>
        <div class="studio-form-pane" style="border-right:none; max-height:76vh; overflow-y:auto;">
            ${tok.locked ? `<div style="background:rgba(198,40,40,0.2); border:1px solid #c62828; color:#ff9e9e; padding:8px 10px; border-radius:6px; margin-bottom:12px; font-size:12px;">🔒 Baú trancado! ${isGm ? 'Como Mestre, você ainda pode editar ou destrancar abaixo.' : 'Apenas o Mestre pode destrancá-lo.'}</div>` : ''}
            ${(!isGm && !tok.locked && !canLoot) ? `<div style="background:rgba(198,40,40,0.18); border:1px solid #8b6b35; color:#f2cf83; padding:8px 10px; border-radius:6px; margin-bottom:12px; font-size:12px;">🚫 O Mestre restringiu a coleta deste baú a jogadores ou personagens específicos.</div>` : ''}

            ${isGm ? `
                <div class="form-section">
                    <h3 class="form-section-title">👑 Configuração do Baú (Mestre)</h3>
                    <div class="form-grid-3">
                        <div class="form-group">
                            <label>Nome do Baú</label>
                            <input type="text" class="form-control" value="${escapeHtmlText(tok.name)}" onchange="updateChestSettings('${tok.id}', { name: this.value })">
                        </div>
                        <div class="form-group">
                            <label>Ouro Guardado (PO)</label>
                            <input type="number" class="form-control" min="0" value="${tok.chestGold}" onchange="updateChestSettings('${tok.id}', { chestGold: Math.max(0, Number(this.value) || 0) })">
                        </div>
                        <div class="form-group" style="display:flex; align-items:flex-end;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12.5px; padding-bottom:6px;">
                                <input type="checkbox" ${tok.locked ? 'checked' : ''} onchange="updateChestSettings('${tok.id}', { locked: this.checked })"> 🔒 Baú Trancado
                            </label>
                        </div>
                    </div>
                    <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:6px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                            <input type="checkbox" ${tok.hiddenFromPlayers ? 'checked' : ''} onchange="updateChestSettings('${tok.id}', { hiddenFromPlayers: this.checked })"> 🙈 Ocultar dos jogadores
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                            <input type="checkbox" ${tok.revealItemCountToPlayers ? 'checked' : ''} onchange="updateChestSettings('${tok.id}', { revealItemCountToPlayers: this.checked })"> 🔢 Mostrar nº de itens aos jogadores
                        </label>
                    </div>
                    ${_renderLootPermissionsEditorHtml(tok, 'chest-token', tok.id)}
                    <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <select class="form-control" style="flex:1; min-width:190px; padding:5px 8px; font-size:12px;" onchange="addChestItemFromCompendium('${tok.id}', this.value); this.value='';">${compItemOpts}</select>
                        <input type="text" id="chest-custom-item-name" class="form-control" style="flex:1; min-width:140px; padding:5px 8px; font-size:12px;" placeholder="Item custom (ex: Poção de Cura)">
                        <input type="number" id="chest-custom-item-qty" class="form-control" style="width:62px; padding:5px; font-size:12px;" min="1" value="1" title="Qtd">
                        <button type="button" class="btn-action-bar" onclick="addCustomChestItem('${tok.id}')">＋ Item</button>
                    </div>
                </div>
            ` : ''}

            ${canOpenContents ? `
                <div class="form-section">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                        <h3 class="form-section-title" style="margin:0; border:none; padding:0;">💰 Conteúdo &amp; Saque</h3>
                        ${charOptions ? `<div style="display:flex; align-items:center; gap:6px;"><span style="font-size:11.5px; color:#b8b2a6;">Entregar para:</span><select id="chest-loot-target-char" class="form-control" style="width:auto; padding:4px 8px; font-size:12px;">${charOptions}</select></div>` : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#1c1a11; border:1px solid #d4ac0d; border-radius:6px; padding:8px 12px; margin-bottom:10px;">
                        <strong style="color:#ffd54f; font-size:13px;">🪙 Ouro no Baú: ${tok.chestGold} PO</strong>
                        ${(tok.chestGold > 0 && charOptions) ? `<button type="button" class="btn-summon-card" onclick="lootChestGold('${tok.id}')">🪙 Pegar ${tok.chestGold} PO</button>` : ''}
                    </div>
                    ${itemsHtml}
                </div>
            ` : ''}
        </div>
    `;
    backdrop.classList.add('open');
}

function refreshOpenChestOrGoldModal(tokenId) {
    if (!window._activeChestOrGoldTokenId || String(window._activeChestOrGoldTokenId) !== String(tokenId)) return;
    const tok = tabletopState.tokens.find(t => String(t.id) === String(tokenId));
    if (!tok) {
        closeGoldTokenModal();
        closeChestTokenModal();
        return;
    }
    if (tok.type === 'gold' && document.getElementById('tt-gold-backdrop')?.classList.contains('open')) openGoldTokenModal(tok.id);
    if (tok.type === 'chest' && document.getElementById('tt-chest-backdrop')?.classList.contains('open')) openChestTokenModal(tok.id);
}

function updateChestSettings(tokenId, patch) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    const prevHidden = Boolean(tok.hiddenFromPlayers);
    const prevReveal = Boolean(tok.revealItemCountToPlayers);
    Object.assign(tok, patch);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDelta) {
        if (prevHidden !== Boolean(tok.hiddenFromPlayers) || prevReveal !== Boolean(tok.revealItemCountToPlayers)) {
            CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
        } else {
            CompendioNetAdapter.sendDelta({ type: 'CHEST_UPDATE', tokenId: tok.id, patch });
        }
    }
    if (prevHidden !== Boolean(tok.hiddenFromPlayers)) renderTabletopModule();
    else updateTabletopTokenDom(tok.id);
    openChestTokenModal(tok.id);
}

function addChestItemFromCompendium(tokenId, selectVal) {
    if (!selectVal) return;
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    const [cat, groupKey, itemKey, title] = selectVal.split('|');
    if (!Array.isArray(tok.chestItems)) tok.chestItems = [];
    tok.chestItems.push({
        id: 'ci-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
        title: title || itemKey,
        qty: 1,
        category: cat,
        groupKey: groupKey || '',
        itemKey
    });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDelta) {
        CompendioNetAdapter.sendDelta({ type: 'CHEST_UPDATE', tokenId: tok.id, patch: { chestItems: tok.chestItems } });
    }
    updateTabletopTokenDom(tok.id);
    openChestTokenModal(tok.id);
}

function addCustomChestItem(tokenId) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    const nameEl = document.getElementById('chest-custom-item-name');
    const qtyEl = document.getElementById('chest-custom-item-qty');
    const title = (nameEl?.value || '').trim();
    if (!tok || !title) return;
    const qty = Math.max(1, Math.floor(Number(qtyEl?.value) || 1));
    if (!Array.isArray(tok.chestItems)) tok.chestItems = [];
    tok.chestItems.push({
        id: 'ci-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000),
        title,
        qty
    });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDelta) {
        CompendioNetAdapter.sendDelta({ type: 'CHEST_UPDATE', tokenId: tok.id, patch: { chestItems: tok.chestItems } });
    }
    updateTabletopTokenDom(tok.id);
    openChestTokenModal(tok.id);
}

function removeChestItemById(tokenId, itemId) {
    const p = getActivePlayer();
    if (!_isVttEffectiveGm(p)) return;
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok) return;
    tok.chestItems = (tok.chestItems || []).filter(i => i.id !== itemId);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDelta) {
        CompendioNetAdapter.sendDelta({ type: 'CHEST_UPDATE', tokenId: tok.id, patch: { chestItems: tok.chestItems } });
    }
    updateTabletopTokenDom(tok.id);
    openChestTokenModal(tok.id);
}

async function lootChestGold(tokenId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok || (Number(tok.chestGold) || 0) <= 0) return;
    const isGm = _isVttEffectiveGm();
    if (tok.locked && !isGm) {
        showToast('🔒 Este baú está trancado pelo Mestre.');
        return;
    }
    const targetCharId = document.getElementById('chest-loot-target-char')?.value || _resolveTargetLootCharacterForCurrentUser()?.id;
    const targetChar = charactersData.find(c => c.id === targetCharId);
    if (!targetChar) return showToast('Selecione um personagem para receber o ouro.');
    if (!canCurrentUserLootToken(tok, getActivePlayer(), targetChar)) {
        return showToast('🚫 Você ou este personagem não tem permissão para saquear este baú.');
    }

    let takenGold = Number(tok.chestGold) || 0;
    let remainingGold = 0;
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastChestLoot) {
        const res = await CompendioNetAdapter.broadcastChestLoot({ tokenId: tok.id, lootGold: true, amount: 'all', targetCharId: targetChar.id });
        if (!res || res.ok === false) {
            showToast(`⚠️ ${res?.error || 'Não foi possível saquear ouro deste baú.'}`);
            openChestTokenModal(tok.id);
            return;
        }
        if (!res.localOnly) {
            takenGold = Number(res.takenGold) || 0;
            remainingGold = Number(res.remainingGold) || 0;
        }
    }
    tok.chestGold = remainingGold;
    ensureCharacterExtendedFields(targetChar);
    targetChar.gold = (Number(targetChar.gold) || 0) + takenGold;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDelta) {
        CompendioNetAdapter.sendDelta({ type: 'CHARACTER_UPDATE', character: targetChar });
    }
    updateTabletopTokenDom(tok.id);
    openChestTokenModal(tok.id);
    showToast(`🪙 +${takenGold} PO saqueados para "${targetChar.name}"!`);
}

async function lootChestItem(tokenId, itemId) {
    const tok = tabletopState.tokens.find(t => t.id === tokenId);
    if (!tok || !Array.isArray(tok.chestItems)) return;
    const isGm = _isVttEffectiveGm();
    if (tok.locked && !isGm) {
        showToast('🔒 Este baú está trancado pelo Mestre.');
        return;
    }
    const targetCharId = document.getElementById('chest-loot-target-char')?.value || _resolveTargetLootCharacterForCurrentUser()?.id;
    const targetChar = charactersData.find(c => c.id === targetCharId);
    if (!targetChar) return showToast('Selecione um personagem para receber o item.');
    if (!canCurrentUserLootToken(tok, getActivePlayer(), targetChar)) {
        return showToast('🚫 Você ou este personagem não tem permissão para saquear este baú.');
    }

    const idx = tok.chestItems.findIndex(it => it.id === itemId);
    if (idx < 0) return showToast('Item já foi saqueado!');
    let takenItem = tok.chestItems[idx];

    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastChestLoot) {
        const res = await CompendioNetAdapter.broadcastChestLoot({ tokenId: tok.id, takeItemId: itemId, targetCharId: targetChar.id });
        if (!res || res.ok === false) {
            showToast(`⚠️ ${res?.error || 'Este item já foi saqueado ou o baú está trancado.'}`);
            openChestTokenModal(tok.id);
            return;
        }
        if (!res.localOnly && res.takenItem) {
            takenItem = res.takenItem;
            if (res.token && Array.isArray(res.token.chestItems)) tok.chestItems = res.token.chestItems;
            else tok.chestItems.splice(idx, 1);
        } else {
            tok.chestItems.splice(idx, 1);
        }
    } else {
        tok.chestItems.splice(idx, 1);
    }

    ensureCharacterExtendedFields(targetChar);
    if (takenItem.category && takenItem.itemKey) {
        if (!targetChar.linkedItems.some(x => x.itemKey === takenItem.itemKey && x.category === takenItem.category)) {
            targetChar.linkedItems.push({
                category: takenItem.category,
                groupKey: takenItem.groupKey || '',
                itemKey: takenItem.itemKey,
                title: takenItem.title || takenItem.itemKey
            });
        }
    }
    const line = `- ${takenItem.qty > 1 ? `${takenItem.qty}x ` : ''}${takenItem.title || takenItem.name} (de ${tok.name})`;
    targetChar.inventory = targetChar.inventory ? `${targetChar.inventory}\n${line}` : line;

    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendDelta) {
        CompendioNetAdapter.sendDelta({ type: 'CHARACTER_UPDATE', character: targetChar });
    }
    updateTabletopTokenDom(tok.id);
    openChestTokenModal(tok.id);
    showToast(`🎒 "${takenItem.title || takenItem.name}" adicionado à ficha de "${targetChar.name}"!`);
}

/* ------------------ BARRA DE CONTROLE DE TOKEN/FORMA SELECIONADA & PLAYERS ------------------ */
function buildSelectedControlBarHtml(isGm) {
    const selectedTok = tabletopState.tokens.find(t => String(t.id) === String(selectedTabletopTokenId));
    if (selectedTok && isTokenVisibleToCurrentUser(selectedTok)) {
        const showExact = canSeeTokenExactStats(selectedTok);
        const canCtrl = CompendioNetAdapter.canControlEntity(selectedTok.ownerId);
        const sq = Number(selectedTok.sizeSquares) || 1;
        const hpDisplay = selectedTok.type === 'gold'
            ? `🪙 ${Number(selectedTok.goldAmount) || 0} PO`
            : (selectedTok.type === 'chest'
                ? formatChestSummaryText(selectedTok, isGm, 'bar')
                : (selectedTok.type === 'item'
                    ? '📦 Objeto/Item'
                    : (showExact ? `${selectedTok.hpCurrent}/${selectedTok.hpMax} PV (CA ${selectedTok.ac || '?'})` : describeQualitativeHealth(selectedTok.hpCurrent, selectedTok.hpMax, selectedTok.type))));
        const gmRevealBtn = (isGm && selectedTok.category && selectedTok.itemKey)
            ? `<button type="button" class="btn-mini" onclick="setEntityGlobalKnowledge('${selectedTok.category}', '${selectedTok.itemKey}', 'studied')" title="Revelar PV exato e Ficha completa para os jogadores">📖 Revelar</button>`
            : '';
        const playerStudyBtn = (!isGm && !showExact && selectedTok.category && selectedTok.itemKey)
            ? `<button type="button" class="btn-mini" onclick="CompendioNetAdapter.sendStudyRequest('${selectedTok.category}:${selectedTok.itemKey}', '${escapeHtmlText(selectedTok.name)}')">🔍 Estudar</button>`
            : '';
        const visBtn = isGm
            ? `<button type="button" class="btn-mini ${selectedTok.hiddenFromPlayers ? 'is-active' : ''}" onclick="toggleTabletopTokenVisibility('${selectedTok.id}')" title="Ocultar ou mostrar este token para jogadores">${selectedTok.hiddenFromPlayers ? '🙈 Oculto' : '👁️ Visível'}</button>`
            : '';
        const lockBtn = (isGm || canCtrl)
            ? `<button type="button" class="btn-mini ${selectedTok.locked ? 'is-active' : ''}" onclick="toggleTabletopTokenLock('${selectedTok.id}')" title="Travar/Destravar token no mapa">${selectedTok.locked ? '🔒 Travado' : '🔓 Livre'}</button>`
            : '';
        const isCombatant = selectedTok.type !== 'item' && selectedTok.type !== 'gold' && selectedTok.type !== 'chest';

        return `
            <div style="display:flex; align-items:center; gap:5px; background:#18191f; padding:4px 8px; border-radius:5px; border:1px solid #d8b467; flex-wrap:wrap;">
                <strong style="color:#f2cf83; font-size:12px;">${escapeHtmlText(selectedTok.name)}: ${hpDisplay}</strong>
                ${(selectedTok.type === 'gold' || selectedTok.type === 'chest')
                    ? `<button type="button" class="btn-summon-card" style="padding:3px 8px; font-size:11px;" onclick="openInteractiveTokenModal('${selectedTok.id}')">${selectedTok.type === 'gold' ? '🪙 Coletar/Editar' : '🧰 Abrir Baú'}</button>`
                    : `<button type="button" class="btn-mini" onclick="openSheetFromTabletopToken('${selectedTok.id}')" title="Abrir Ficha deste token">📄 Ficha</button>`}
                ${isCombatant ? `<button type="button" class="btn-mini" onclick="if(typeof openCombatRuneForToken==='function') openCombatRuneForToken('${selectedTok.id}')" title="Abrir/focar este combatente na Runa de Combate">🔮 Runa</button>` : ''}
                ${gmRevealBtn}
                ${playerStudyBtn}
                ${visBtn}
                ${lockBtn}
                ${(canCtrl && isCombatant) ? `
                    <select class="form-control" style="width:auto; padding:2px 4px; font-size:11px;" onchange="setTokenFootprintSize('${selectedTok.id}', this.value)" title="Tamanho do Token no Grid">
                        <option value="1" ${sq === 1 ? 'selected' : ''}>1x1 (M)</option>
                        <option value="2" ${sq === 2 ? 'selected' : ''}>2x2 (G)</option>
                        <option value="3" ${sq === 3 ? 'selected' : ''}>3x3 (E)</option>
                        <option value="4" ${sq === 4 ? 'selected' : ''}>4x4 (I)</option>
                    </select>
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', -5)">-5</button>
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', -1)">-1</button>
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', 1)">+1</button>
                    <button type="button" class="btn-mini" onclick="adjustTabletopTokenHp('${selectedTok.id}', 5)">+5</button>
                ` : ''}
                ${canCtrl ? `<button type="button" class="btn-mini danger" onclick="removeTabletopToken('${selectedTok.id}')">✕</button>` : ''}
            </div>
        `;
    }

    const { gx } = getTabletopGridMetrics();
    const rawShape = window.selectedShapeId ? (tabletopState.aoeTemplates || []).find(a => String(a.id) === String(window.selectedShapeId)) : null;
    if (rawShape) {
        const sh = normalizeShapeObj(rawShape, gx);
        const sId = `'${String(sh.id).replace(/'/g, "\\'")}'`;
        return `
            <div style="display:flex; align-items:center; gap:6px; background:#18191f; padding:4px 8px; border-radius:5px; border:1px solid #d8b467; flex-wrap:wrap;">
                <strong style="color:#f2cf83; font-size:12px;">📐 ${escapeHtmlText(sh.label || sh.shape)}</strong>
                <input type="color" value="${escapeHtmlText(sh.color)}" style="width:26px; height:22px; padding:0; border:none; background:none; cursor:pointer;" onchange="updateAoeShapeField(${sId}, 'color', this.value)" title="Cor da forma">
                <label style="font-size:11px; color:#ccc;">L:<input type="number" class="card-hp-input" style="width:48px;" min="24" value="${sh.width}" onchange="updateAoeShapeField(${sId}, 'width', Math.max(24, Number(this.value)||60))"></label>
                <label style="font-size:11px; color:#ccc;">A:<input type="number" class="card-hp-input" style="width:48px;" min="24" value="${sh.height}" onchange="updateAoeShapeField(${sId}, 'height', Math.max(24, Number(this.value)||60))"></label>
                <label style="font-size:11px; color:#ccc;">°:<input type="number" class="card-hp-input" style="width:44px;" value="${sh.rotation}" onchange="updateAoeShapeField(${sId}, 'rotation', Number(this.value)||0)"></label>
                <button type="button" class="btn-mini danger" onclick="removeAoeTemplate(${sId}, event)">🗑️ Remover Forma</button>
            </div>
        `;
    }

    const rawTb = window.selectedTextBoxId ? (tabletopState.textBoxes || []).find(t => String(t.id) === String(window.selectedTextBoxId)) : null;
    if (rawTb && (isGm || !rawTb.hiddenFromPlayers)) {
        const tb = normalizeTextBoxObj(rawTb);
        const tId = `'${String(tb.id).replace(/'/g, "\\'")}'`;
        const canEdit = canEditVttAnnotation(tb);
        const fontOpts = VTT_TEXT_FONTS.map(f => `<option value="${escapeHtmlText(f.value)}" ${tb.fontFamily === f.value ? 'selected' : ''}>${escapeHtmlText(f.label)}</option>`).join('');
        const isTransparentBg = tb.bgColor === 'transparent';
        return `
            <div style="display:flex; align-items:center; gap:5px; background:#18191f; padding:4px 8px; border-radius:5px; border:1px solid #d8b467; flex-wrap:wrap;">
                <strong style="color:#f2cf83; font-size:12px;">🔤 Texto</strong>
                ${canEdit ? `
                    <input type="text" class="form-control" style="width:140px; padding:2px 6px; font-size:11px;" value="${escapeHtmlText(tb.text)}" oninput="updateTextBoxField(${tId}, 'text', this.value)" title="Conteúdo do texto (ou duplo-clique no mapa)">
                    <select class="form-control" style="width:auto; padding:2px 4px; font-size:11px;" onchange="updateTextBoxField(${tId}, 'fontFamily', this.value)" title="Fonte">${fontOpts}</select>
                    <label style="font-size:11px; color:#ccc;">Tam:<input type="number" class="card-hp-input" style="width:44px;" min="10" max="120" value="${tb.fontSize}" onchange="updateTextBoxField(${tId}, 'fontSize', Math.max(10, Math.min(120, Number(this.value)||20)))"></label>
                    <input type="color" value="${escapeHtmlText(tb.color)}" style="width:24px; height:22px; padding:0; border:none; background:none; cursor:pointer;" onchange="updateTextBoxField(${tId}, 'color', this.value)" title="Cor do texto">
                    <button type="button" class="btn-mini ${tb.bold ? 'is-active' : ''}" onclick="updateTextBoxField(${tId}, 'bold', ${!tb.bold})" title="Negrito"><strong>B</strong></button>
                    <button type="button" class="btn-mini ${!isTransparentBg ? 'is-active' : ''}" onclick="updateTextBoxField(${tId}, 'bgColor', '${isTransparentBg ? 'rgba(14, 15, 20, 0.72)' : 'transparent'}')" title="Alternar fundo escuro/transparente">🖼️ Fundo</button>
                    <label style="font-size:11px; color:#ccc;">°:<input type="number" class="card-hp-input" style="width:42px;" value="${tb.rotation}" onchange="updateTextBoxField(${tId}, 'rotation', Number(this.value)||0)"></label>
                    ${isGm ? `<button type="button" class="btn-mini ${tb.hiddenFromPlayers ? 'is-active' : ''}" onclick="updateTextBoxField(${tId}, 'hiddenFromPlayers', ${!tb.hiddenFromPlayers})" title="Ocultar ou mostrar texto aos jogadores">${tb.hiddenFromPlayers ? '🙈 Oculto' : '👁️ Visível'}</button>` : ''}
                    <button type="button" class="btn-mini danger" onclick="removeTextBox(${tId}, event)" title="Remover Texto">🗑️</button>
                ` : '<span style="font-size:11px; color:#9da3b8;">Somente leitura</span>'}
            </div>
        `;
    }

    const rawDr = window.selectedDrawingId ? (tabletopState.drawings || []).find(d => String(d.id) === String(window.selectedDrawingId)) : null;
    if (rawDr && (isGm || !rawDr.hiddenFromPlayers)) {
        const dr = normalizeDrawingObj(rawDr);
        const dId = `'${String(dr.id).replace(/'/g, "\\'")}'`;
        const canEdit = canEditVttAnnotation(dr);
        return `
            <div style="display:flex; align-items:center; gap:6px; background:#18191f; padding:4px 8px; border-radius:5px; border:1px solid #d8b467; flex-wrap:wrap;">
                <strong style="color:#f2cf83; font-size:12px;">🖌️ Traço</strong>
                ${canEdit ? `
                    <input type="color" value="${escapeHtmlText(dr.color)}" style="width:24px; height:22px; padding:0; border:none; background:none; cursor:pointer;" onchange="updateDrawingField(${dId}, 'color', this.value)" title="Cor do traço">
                    <label style="font-size:11px; color:#ccc;">Esp:<input type="number" class="card-hp-input" style="width:42px;" min="2" max="48" value="${dr.strokeWidth}" onchange="updateDrawingField(${dId}, 'strokeWidth', Math.max(2, Math.min(48, Number(this.value)||6)))"></label>
                    <label style="font-size:11px; color:#ccc;">Opac%:<input type="number" class="card-hp-input" style="width:46px;" min="15" max="100" value="${Math.round(dr.opacity * 100)}" onchange="updateDrawingField(${dId}, 'opacity', Math.max(0.15, Math.min(1, (Number(this.value)||92)/100)))"></label>
                    <label style="font-size:11px; color:#ccc;">°:<input type="number" class="card-hp-input" style="width:44px;" value="${dr.rotation}" onchange="updateDrawingField(${dId}, 'rotation', Number(this.value)||0)"></label>
                    ${isGm ? `<button type="button" class="btn-mini ${dr.hiddenFromPlayers ? 'is-active' : ''}" onclick="updateDrawingField(${dId}, 'hiddenFromPlayers', ${!dr.hiddenFromPlayers})" title="Ocultar ou mostrar traço aos jogadores">${dr.hiddenFromPlayers ? '🙈 Oculto' : '👁️ Visível'}</button>` : ''}
                    <button type="button" class="btn-mini danger" onclick="removeDrawing(${dId}, event)" title="Remover Traço">🗑️</button>
                ` : '<span style="font-size:11px; color:#9da3b8;">Somente leitura</span>'}
            </div>
        `;
    }

    const rawFog = (isGm && window.selectedFogId) ? (tabletopState.fogRegions || []).find(f => String(f.id) === String(window.selectedFogId)) : null;
    if (rawFog) {
        const fg = normalizeFogObj(rawFog);
        const fId = `'${String(fg.id).replace(/'/g, "\\'")}'`;
        const ptCount = fg.shape === 'polygon' && Array.isArray(fg.points) ? fg.points.length : 4;
        return `
            <div style="display:flex; align-items:center; gap:5px; background:#18191f; padding:4px 8px; border-radius:5px; border:1px solid #d8b467; flex-wrap:wrap;">
                <strong style="color:#f2cf83; font-size:12px;">🌫️ Névoa (${ptCount} pts)</strong>
                <button type="button" class="btn-mini" onclick="adjustFogRegionPoints(${fId}, 1)" title="Incrementar +1 vértice na maior aresta">➕ Ponto</button>
                <button type="button" class="btn-mini" onclick="adjustFogRegionPoints(${fId}, -1)" title="Decrementar -1 vértice (mín. 3)">➖ Ponto</button>
                <label style="font-size:11px; color:#ccc;">L:<input type="number" class="card-hp-input" style="width:48px;" min="16" value="${fg.w}" onchange="updateFogField(${fId}, 'w', Math.max(16, Number(this.value)||60))"></label>
                <label style="font-size:11px; color:#ccc;">A:<input type="number" class="card-hp-input" style="width:48px;" min="16" value="${fg.h}" onchange="updateFogField(${fId}, 'h', Math.max(16, Number(this.value)||60))"></label>
                <label style="font-size:11px; color:#ccc;">°:<input type="number" class="card-hp-input" style="width:44px;" value="${fg.rotation}" onchange="updateFogField(${fId}, 'rotation', Number(this.value)||0)"></label>
                <button type="button" class="btn-mini danger" onclick="removeFogRegion(${fId}, event)" title="Remover esta área de Névoa">🗑️ Remover Fog</button>
            </div>
        `;
    }
    return '';
}

function _resolveVttPresenceSummary() {
    const activePl = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    const rc = window.onlineRoomConfig || {};
    const maxP = rc.maxPlayers || 8;
    const playerShownName = typeof getPlayerDisplayName === 'function'
        ? getPlayerDisplayName(activePl, activePl?.isUnauthenticated ? 'Visitante' : 'Jogador')
        : (activePl?.name || 'Jogador');
    const onlineCount = (typeof serverWritable !== 'undefined' && serverWritable && Array.isArray(window.onlinePlayersList))
        ? window.onlinePlayersList.length
        : ((Array.isArray(window.onlinePlayersList) && window.onlinePlayersList.length) ? window.onlinePlayersList.length : (activePl && !activePl.isUnauthenticated && activePl.id ? 1 : 0));
    return { activePl, rc, maxP, playerShownName, onlineCount };
}

function updateConnectedPlayersPresenceUI() {
    const barRoot = document.getElementById('tt-connected-players-root');
    if (barRoot) {
        barRoot.innerHTML = renderTabletopConnectedPlayersBarHtml();
    }
    const badgeEl = document.getElementById('tt-online-count-badge');
    if (badgeEl) {
        const { maxP, playerShownName, onlineCount } = _resolveVttPresenceSummary();
        badgeEl.textContent = `📡 ${onlineCount}/${maxP} Online | 👤 ${playerShownName}`;
    }
}

function renderTabletopConnectedPlayersBarHtml() {
    const { activePl, rc, maxP: maxPlayers } = _resolveVttPresenceSummary();
    const rawOnline = (typeof serverWritable !== 'undefined' && serverWritable && Array.isArray(window.onlinePlayersList))
        ? window.onlinePlayersList
        : ((Array.isArray(window.onlinePlayersList) && window.onlinePlayersList.length > 0)
            ? window.onlinePlayersList
            : ((activePl && !activePl.isUnauthenticated && activePl.id) ? [{
                clientId: window.localClientId || 'local',
                playerId: activePl.id,
                playerName: activePl.name,
                role: activePl.role,
                color: typeof getPlayerColor === 'function' ? getPlayerColor(activePl) : '#d8b467',
                avatarEmoji: typeof getPlayerAvatar === 'function' ? getPlayerAvatar(activePl) : '🎮',
                isHost: Boolean(window.isHostClient)
            }] : []));

    const streamerOn = typeof isStreamerModeEnabled === 'function' && isStreamerModeEnabled();
    const roomBadge = !serverWritable
        ? '📡 Offline/Local'
        : (!rc.isOpen ? '🔴 Sala Fechada' : (rc.isLocked ? '🔒 Trancada' : `🟢 Aberta (${rawOnline.length}/${maxPlayers})`));

    const chipsHtml = rawOnline.map(op => {
        const pColor = op.color || (typeof getPlayerColor === 'function' ? getPlayerColor(op.playerId) : '#d8b467');
        const pAvatar = op.avatarEmoji || (op.role === 'gm' ? '👑' : '🎮');
        const shownName = typeof getPlayerDisplayName === 'function'
            ? getPlayerDisplayName({ id: op.playerId || op.clientId, name: op.playerName, role: op.role }, 'Jogador')
            : (op.playerName || 'Jogador');
        const isSelf = (op.clientId && op.clientId === window.localClientId) || (!window.onlinePlayersList?.length && activePl && op.playerId === activePl.id);
        return `
            <span class="tt-player-chip ${isSelf ? 'is-self' : ''}" style="border-color:${escapeHtmlText(pColor)};" onclick="openMultiplayerRoomModal('room')" title="Clique para gerenciar sala / jogadores">
                <span class="player-color-dot" style="background:${escapeHtmlText(pColor)};"></span>
                <span>${escapeHtmlText(pAvatar)}</span>
                <strong>${escapeHtmlText(shownName)}</strong>
                ${isSelf ? '<em style="font-size:10px; opacity:0.8;">(Você)</em>' : ''}
            </span>
        `;
    }).join('');

    return `
        <div class="tt-connected-players-bar">
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <button type="button" class="btn-mini" style="flex:0 0 auto; border-color:#5a617a;" onclick="openMultiplayerRoomModal('room')" title="Gerenciar Sala, IP e Kick/Ban">${roomBadge}</button>
                ${streamerOn ? `<button type="button" class="btn-mini active-streamer" style="flex:0 0 auto;" onclick="toggleStreamerMode()">📺 Streamer ON</button>` : ''}
                <span style="font-size:11px; color:#9da3b8;">Conectados:</span>
                ${chipsHtml || '<span style="font-size:11px; color:#828699;">Aguardando conexões...</span>'}
            </div>
        </div>
    `;
}

/* ------------------ RENDERIZADOR PRINCIPAL DO TABLETOP VTT ------------------ */
function renderTabletopModule() {
    ensureTabletopExtendedState();
    if (typeof fetchCompendiumLocalAssets === 'function' && window.compendiumLocalAssets && !window.compendiumLocalAssets.loaded && !window.compendiumLocalAssets._reRenderQueued) {
        window.compendiumLocalAssets._reRenderQueued = true;
        fetchCompendiumLocalAssets().then(c => {
            if (c && c.loaded && typeof activeModule !== 'undefined' && activeModule === 'tabletop') {
                renderTabletopModule();
            }
        }).catch(() => {});
    }
    const player = getActivePlayer();
    const isGm = _isVttEffectiveGm(player);
    const playerShownName = typeof getPlayerDisplayName === 'function' ? getPlayerDisplayName(player, 'Jogador') : (player ? player.name : 'Jogador');
    const gmMetrics = getTabletopGridMetrics();

    const visibleTokens = tabletopState.tokens.filter(t => isTokenVisibleToCurrentUser(t, player));
    const listTitleEl = document.getElementById('dynamic-list-title');
    if (listTitleEl) {
        listTitleEl.textContent = `Tokens na Mesa (${visibleTokens.length})`;
    }

    const activeTurnCard = (typeof combatCards !== 'undefined' && window.combatTurnState?.activeCardId)
        ? combatCards.find(c => String(c.id) === String(window.combatTurnState.activeCardId))
        : null;

    const listEl = document.getElementById('dynamic-item-list');
    if (listEl) {
        listEl.innerHTML = visibleTokens.map(t => {
            const isSel = t.id === selectedTabletopTokenId ? 'active' : '';
            const icon = t.type === 'pc' ? '🛡️' : (t.type === 'gold' ? '🪙' : (t.type === 'chest' ? '🧰' : (t.type === 'item' ? '⚔️' : (t.type === 'npc' ? '🧙‍♂️' : '🐉'))));
            const showExact = canSeeTokenExactStats(t);
            const statusText = t.type === 'gold'
                ? `${Number(t.goldAmount) || 0} PO`
                : (t.type === 'chest'
                    ? formatChestSummaryText(t, isGm, 'list')
                    : (t.type === 'item' ? 'Item' : (showExact ? `${t.hpCurrent}/${t.hpMax}` : describeQualitativeHealth(t.hpCurrent, t.hpMax, t.type))));
            const canDel = CompendioNetAdapter.canControlEntity(t.ownerId);
            return `
                <li class="list-item ${isSel}" data-title="${escapeHtmlText(t.name.toLowerCase())}" onclick="selectTabletopToken('${t.id}')">
                    <span>${icon} ${t.hiddenFromPlayers && isGm ? '🙈 ' : ''}${t.locked ? '🔒 ' : ''}${escapeHtmlText(t.name)}</span>
                    <div class="list-item-right">
                        <span class="list-item-folder-badge" style="color:#8df596;">${statusText}</span>
                        ${isGm ? `<button type="button" class="btn-quick-del" style="color:${t.hiddenFromPlayers ? '#ffd54f' : '#9da3b8'};" onclick="event.stopPropagation(); toggleTabletopTokenVisibility('${t.id}')" title="${t.hiddenFromPlayers ? 'Mostrar token' : 'Ocultar token'}">${t.hiddenFromPlayers ? '🙈' : '👁️'}</button>` : ''}
                        ${canDel ? `<button type="button" class="btn-quick-del" onclick="event.stopPropagation(); removeTabletopToken('${t.id}')" title="Remover token">✕</button>` : ''}
                    </div>
                </li>
            `;
        }).join('') || '<li class="list-item" style="color:#828699;">Mesa vazia (use a Gaveta de Tokens)</li>';
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

    const resolvedMapBg = tabletopState.mapPath ? resolveRenderableImageSrc(tabletopState.mapPath) : '';
    if (resolvedMapBg) syncTabletopStageDimensionsForMap(resolvedMapBg);
    else {
        window.tabletopCamera.stageWidth = 1600;
        window.tabletopCamera.stageHeight = 1000;
    }
    const { w: stageW, h: stageH } = getTabletopStageDimensions();
    const stageBgStyle = resolvedMapBg ? `background-image: url('${resolvedMapBg.replace(/'/g, "\\'")}');` : '';

    const aoeHtml = (tabletopState.aoeTemplates || []).map(a => buildSingleShapeWrapperHtml(a, gmMetrics.gx)).join('');
    const drawingsHtml = (tabletopState.drawings || []).map(d => buildSingleDrawingWrapperHtml(d, isGm)).join('');
    const textBoxesHtml = (tabletopState.textBoxes || []).map(t => buildSingleTextBoxWrapperHtml(t, isGm)).join('');

    const fogHtml = tabletopState.fogEnabled
        ? (tabletopState.fogRegions || []).map(f => buildSingleFogRegionHtml(f, isGm)).join('')
        : '';

    const tokensHtml = visibleTokens.map(t => {
        const isSel = String(t.id) === String(selectedTabletopTokenId) ? 'selected-token' : '';
        const isTurnActive = activeTurnCard && (
            String(activeTurnCard.tokenId) === String(t.id) ||
            (activeTurnCard.charId && String(activeTurnCard.charId) === String(t.refId))
        );
        const turnCls = isTurnActive ? 'tt-token-active-turn' : '';
        const typeCls = t.type === 'monster' ? 'monster-token' : (t.type === 'npc' ? 'npc-token' : (t.type === 'item' ? 'item-token' : (t.type === 'gold' ? 'gold-token' : (t.type === 'chest' ? 'chest-token' : ''))));
        const lockCls = t.locked ? 'is-locked-token' : '';
        const hiddenCls = t.hiddenFromPlayers ? 'is-hidden-token' : '';
        const initials = t.type === 'gold' ? '🪙' : (t.type === 'chest' ? '🧰' : String(t.name || '?').trim().slice(0, 2).toUpperCase());
        const footprint = Math.max(1, Number(t.sizeSquares) || 1);
        const sz = Math.max(24, (gmMetrics.gx * footprint) - 6);
        const canMove = isTokenMovableByCurrentUser(t);
        const showExact = canSeeTokenExactStats(t);
        const badgeText = t.type === 'gold'
            ? `🪙 ${Number(t.goldAmount) || 0} PO`
            : (t.type === 'chest'
                ? formatChestSummaryText(t, isGm, 'badge')
                : (t.type === 'item'
                    ? '⚔️ Item'
                    : (showExact ? `${t.hpCurrent}/${t.hpMax}` : describeQualitativeHealth(t.hpCurrent, t.hpMax, t.type))));
        const isLootTok = (t.type === 'gold' || t.type === 'chest');
        const imgCandidates = isLootTok
            ? (t.imgSrc ? [t.imgSrc] : [])
            : (typeof getTokenRenderImageCandidates === 'function' ? getTokenRenderImageCandidates(t) : (t.imgSrc ? [t.imgSrc] : []));
        const primaryImg = imgCandidates[0] || '';
        const escapedFallbacks = escapeHtmlText(JSON.stringify(imgCandidates));
        const ownerColor = (t.type === 'pc' && t.ownerId && typeof getPlayerColor === 'function') ? getPlayerColor(t.ownerId) : '';
        const ownerBorderStyle = ownerColor && !isTurnActive ? `border-color:${ownerColor}; box-shadow:0 0 10px ${ownerColor}66;` : '';
        const ownerDotHtml = ownerColor ? `<span class="tt-token-owner-dot" style="background:${escapeHtmlText(ownerColor)};"></span>` : '';
        const lockBadgeHtml = t.locked ? `<span class="tt-token-lock-badge" title="Travado pelo Mestre">🔒</span>` : '';
        const hiddenBadgeHtml = (isGm && t.hiddenFromPlayers) ? `<span class="tt-token-hidden-badge" title="Oculto dos jogadores">🙈</span>` : '';
        return `
            <div class="tt-token ${typeCls} ${isSel} ${turnCls} ${lockCls} ${hiddenCls}"
                 data-token-id="${escapeHtmlText(t.id)}"
                 style="left:${t.x}px; top:${t.y}px; width:${sz}px; height:${sz}px; opacity:${t.hiddenFromPlayers ? '0.48' : (canMove ? '1' : '0.94')}; ${ownerBorderStyle}"
                 onmousedown="startDragTabletopToken(event, '${t.id}')"
                 ondblclick="openSheetFromTabletopToken('${t.id}')"
                 title="${escapeHtmlText(t.name)} (Clique seleciona • 2º clique arrasta • Duplo-clique abre)">
                ${ownerDotHtml}
                ${lockBadgeHtml}
                ${hiddenBadgeHtml}
                <span class="tt-token-hp">${badgeText}</span>
                ${primaryImg ? `<img class="tt-token-img" src="${escapeHtmlText(primaryImg)}" alt="" data-token-id="${escapeHtmlText(t.id)}" data-fallback-paths="${escapedFallbacks}" data-fallback-idx="0" onload="handleTabletopTokenImgLoad(this)" onerror="handleTabletopTokenImgError(this)">` : ''}
                <span class="tt-token-initials" style="${primaryImg ? 'display:none;' : ''}">${escapeHtmlText(initials)}</span>
                <span class="tt-token-label">${isTurnActive ? '⚔️ ' : ''}${escapeHtmlText(t.name)}</span>
            </div>
        `;
    }).join('');

    const { maxP, onlineCount } = _resolveVttPresenceSummary();
    const initiativeHudHtml = typeof renderDynamicInitiativeTrackerHtml === 'function' ? renderDynamicInitiativeTrackerHtml() : '';
    const zoomPct = Math.round((window.tabletopCamera?.scale || 1) * 100);

    const instancesList = Object.values(tabletopState.mapInstances || {}).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const instanceOptions = instancesList.map(inst =>
        `<option value="${escapeHtmlText(inst.id)}" ${inst.id === tabletopState.activeMapInstanceId ? 'selected' : ''}>🎬 ${escapeHtmlText(inst.name)}</option>`
    ).join('');
    const curFogSaved = Boolean(tabletopState.savedMapFogs?.[getTabletopMapFogKey(tabletopState.mapPath)]);

    let contextSubBarHtml = '';
    if (isGm && window.tabletopToolMode === 'calibrate') {
        contextSubBarHtml = `
            <div class="tt-calibrate-bar">
                <strong style="color:#ffd54f;">📐 Modo de Gradificação:</strong>
                <span>Arraste sobre <strong>1 quadrado</strong> do mapa ou ajuste fino:</span>
                <span id="tt-cal-readout" style="font-family:monospace; color:#8df596;">${gmMetrics.gx}×${gmMetrics.gy}px (off ${gmMetrics.ox},${gmMetrics.oy})</span>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ divFactor: 2 })" title="Dividir tamanho medido por 2 (se mediu 2x2)">÷2</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ divFactor: 3 })" title="Dividir tamanho medido por 3 (se mediu 3x3)">÷3</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ squareLock: true })">Quad. Único</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ gxDelta: -1, bothAxes: true })">-1px</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ gxDelta: 1, bothAxes: true })">+1px</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ oxDelta: -2 })">◀ OffX</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ oxDelta: 2 })">OffX ▶</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ oyDelta: -2 })">▲ OffY</button>
                <button type="button" class="btn-mini" onclick="nudgeTabletopCalibration({ oyDelta: 2 })">OffY ▼</button>
                <button type="button" class="btn-save-primary" style="padding:3px 9px; font-size:11px;" onclick="setTabletopToolMode('move')">✓ Concluir</button>
            </div>
        `;
    } else if (isGm && window.tabletopToolMode === 'fog') {
        const draftPts = (window.fogPolygonDraft || []).length;
        contextSubBarHtml = `
            <div class="tt-calibrate-bar">
                <strong style="color:#ffd54f;">🌫️ Modo Névoa:</strong>
                <button type="button" class="vis-pill ${window.fogDrawShape !== 'polygon' ? 'active-studied' : ''}" onclick="setFogDrawShape('rect')" title="Arraste para criar bloco retangular">▭ Retângulo</button>
                <button type="button" class="vis-pill ${window.fogDrawShape === 'polygon' ? 'active-studied' : ''}" onclick="setFogDrawShape('polygon')" title="Clique ponto a ponto no mapa para desenhar polígono">⬟ Polígono</button>
                ${window.fogDrawShape === 'polygon' ? `
                    <span id="tt-fog-poly-count" style="font-size:11px; color:#8df596;">${draftPts} ponto(s)</span>
                    <button type="button" class="btn-save-primary" style="padding:3px 8px; font-size:11px;" onclick="commitFogPolygonDraft()">✓ Fechar Polígono</button>
                    <button type="button" class="btn-mini" onclick="cancelFogPolygonDraft()">✕ Limpar Pontos</button>
                ` : '<span style="font-size:11px; color:#c8cde0;">Arraste para desenhar retângulo. Use ✋ Mover para selecionar, redimensionar, girar, +/- pontos ou remover.</span>'}
                <button type="button" class="btn-mini ${tabletopState.fogEnabled ? 'is-active' : ''}" onclick="toggleTabletopFogBase()">${tabletopState.fogEnabled ? '🌫️ Névoa ON' : '☀️ Névoa OFF'}</button>
                <button type="button" class="btn-mini" onclick="saveCurrentFogToMapPreset()" title="Salvar todas as áreas de névoa atuais associadas a este mapa base">🌫️💾 Salvar Fog no Mapa</button>
                ${curFogSaved ? `<button type="button" class="btn-mini" onclick="loadSavedFogFromMapPreset()" title="Restaurar névoa salva para este mapa">🌫️📥 Carregar Fog Salva</button>` : ''}
                <button type="button" class="btn-save-primary" style="padding:3px 9px; font-size:11px;" onclick="setTabletopToolMode('move')">✋ Selecionar/Editar</button>
            </div>
        `;
    } else if (window.tabletopToolMode === 'text') {
        const tbDraft = window.textBoxDraftConfig || {};
        const fontOpts = VTT_TEXT_FONTS.map(f => `<option value="${escapeHtmlText(f.value)}" ${tbDraft.fontFamily === f.value ? 'selected' : ''}>${escapeHtmlText(f.label)}</option>`).join('');
        contextSubBarHtml = `
            <div class="tt-calibrate-bar">
                <strong style="color:#ffd54f;">🔤 Caixa de Texto:</strong>
                <span style="font-size:11px; color:#c8cde0;">Clique no mapa para posicionar texto:</span>
                <select class="form-control" style="width:auto; padding:2px 6px; font-size:11px;" onchange="window.textBoxDraftConfig.fontFamily=this.value">${fontOpts}</select>
                <label style="font-size:11px;">Tam:<input type="number" class="card-hp-input" style="width:44px;" min="10" max="120" value="${Number(tbDraft.fontSize) || 22}" onchange="window.textBoxDraftConfig.fontSize=Math.max(10,Math.min(120,Number(this.value)||22))"></label>
                <input type="color" value="${escapeHtmlText(tbDraft.color || '#f2cf83')}" style="width:24px; height:22px; padding:0; border:none; background:none;" onchange="window.textBoxDraftConfig.color=this.value" title="Cor padrão do texto">
                ${isGm ? `<label style="font-size:11px; cursor:pointer;"><input type="checkbox" ${tbDraft.hiddenFromPlayers ? 'checked' : ''} onchange="window.textBoxDraftConfig.hiddenFromPlayers=this.checked"> 🙈 Oculto GM</label>` : ''}
                <button type="button" class="btn-save-primary" style="padding:3px 9px; font-size:11px;" onclick="setTabletopToolMode('move')">✓ Concluir</button>
            </div>
        `;
    } else if (window.tabletopToolMode === 'brush') {
        const brDraft = window.brushDraftConfig || {};
        contextSubBarHtml = `
            <div class="tt-calibrate-bar">
                <strong style="color:#ffd54f;">🖌️ Pincel Livre:</strong>
                <span style="font-size:11px; color:#c8cde0;">Arraste no mapa para desenhar:</span>
                <input type="color" value="${escapeHtmlText(brDraft.color || '#ff5252')}" style="width:24px; height:22px; padding:0; border:none; background:none;" onchange="window.brushDraftConfig.color=this.value" title="Cor do pincel">
                <label style="font-size:11px;">Espessura:<input type="number" class="card-hp-input" style="width:44px;" min="2" max="48" value="${Number(brDraft.strokeWidth) || 6}" onchange="window.brushDraftConfig.strokeWidth=Math.max(2,Math.min(48,Number(this.value)||6))"></label>
                <label style="font-size:11px;">Opac%:<input type="number" class="card-hp-input" style="width:46px;" min="15" max="100" value="${Math.round((Number(brDraft.opacity) || 0.92) * 100)}" onchange="window.brushDraftConfig.opacity=Math.max(0.15,Math.min(1,(Number(this.value)||92)/100))"></label>
                <button type="button" class="btn-mini" onclick="undoLastTabletopDrawing()" title="Desfazer último traço">↩️ Desfazer</button>
                <button type="button" class="btn-save-primary" style="padding:3px 9px; font-size:11px;" onclick="setTabletopToolMode('move')">✋ Selecionar</button>
            </div>
        `;
    }

    const displayArea = document.getElementById('dynamic-display-area');
    displayArea.innerHTML = `
        <div class="tabletop-wrap">
            <div class="tabletop-toolbar">
                <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;" id="tt-toolbar-tools-root">
                    ${isGm ? `
                        <div style="display:flex; gap:3px; align-items:center; background:#18191f; padding:2px 4px; border-radius:5px; border:1px solid #3c3e4a;">
                            <select id="tt-map-instance-select" class="form-control" style="width:auto; min-width:125px; max-width:175px; padding:3px 6px; font-size:11px;" onchange="switchToMapInstance(this.value)" title="Trocar instância/cena salva (preserva tokens, fog, textos e pincel de cada cena)">${instanceOptions}</select>
                            <button type="button" class="btn-mini" onclick="saveCurrentMapInstanceState({notify:true})" title="Salvar estado da instância atual">💾</button>
                            <button type="button" class="btn-mini" onclick="openMapInstancesModal()" title="Criar nova instância, gerenciar cenas e névoas salvas por mapa">🎬 Cenas</button>
                            <select class="form-control" style="width:auto; min-width:130px; max-width:180px; padding:3px 6px; font-size:11px;" onchange="onTabletopMapChange(this.value)" title="Selecionar mapa base (salva a instância atual e carrega/cria instância do mapa escolhido)">${mapOptions}</select>
                            <button type="button" class="btn-mini ${curFogSaved ? 'is-active' : ''}" onclick="saveCurrentFogToMapPreset()" title="Salvar Névoa de Guerra atual neste mapa">🌫️💾</button>
                        </div>
                    ` : ''}
                    <button type="button" id="tt-btn-drawer-toggle" class="btn-mini ${window.ttDrawerOpen ? 'is-active' : ''}" style="flex:0 0 auto; border-color:#d8b467;" onclick="toggleTokenDrawer()" title="Abrir gaveta scrollável de PJs, Monstros, NPCs, Itens, Ouro e Baús">📦 Gaveta (${visibleTokens.length})</button>
                    <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="addActiveCharacterToTabletop()">🛡️ + Meu PJ</button>

                    <!-- Ferramentas Táticas de VTT -->
                    <div style="display:flex; gap:3px; background:#18191f; padding:3px; border-radius:5px; border:1px solid #3c3e4a; flex-wrap:wrap;">
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'move' ? 'active-studied' : ''}" onclick="setTabletopToolMode('move')" title="Selecionar/Mover Tokens, Formas, Textos, Pincel ou Fog, ou Arrastar Câmera do Mapa">✋ Mover</button>
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'ruler' ? 'active-studied' : ''}" onclick="setTabletopToolMode('ruler')" title="Régua Persistente (dura até seu próximo clique)">📏 Régua</button>
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'ping' ? 'active-sighted' : ''}" onclick="setTabletopToolMode('ping')" title="Sinalizar Ponto 1 vez no mapa e voltar ao normal">📍 Ping</button>
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'text' ? 'active-studied' : ''}" onclick="setTabletopToolMode(window.tabletopToolMode==='text'?'move':'text')" title="Inserir Caixa de Texto no mapa (fonte, tamanho, cor, rotacionar e visibilidade)">🔤 Texto</button>
                        <button type="button" class="vis-pill ${window.tabletopToolMode === 'brush' ? 'active-studied' : ''}" onclick="setTabletopToolMode(window.tabletopToolMode==='brush'?'move':'brush')" title="Desenhar livremente no mapa com Pincel (redimensionar, girar e visibilidade)">🖌️ Pincel</button>
                        <select class="form-control" style="width:auto; padding:2px 6px; font-size:11px;" onchange="if(this.value){const [sh,sz,col,lbl]=this.value.split('|'); addAoeTemplateToTabletop(sh,Number(sz),col,lbl); this.value='';}" title="Inserir Forma SVG Interativa (mover, redimensionar, alongar, rotacionar)">
                            <option value="">📐 + Forma (AoE)...</option>
                            <option value="circle|4|#e65100|Esfera 6m (Bola de Fogo)">🔥 Círculo / Esfera 6m</option>
                            <option value="square|3|#66bb6a|Quadrado 4,5m">🟩 Quadrado 4,5m</option>
                            <option value="triangle|3|#4fc3f7|Triângulo 4,5m">🔺 Triângulo 4,5m</option>
                            <option value="cone|4|#ab47bc|Cone 6m">⚡ Cone 6m</option>
                            <option value="line|6|#ffa726|Linha 9m">📏 Linha 9m</option>
                        </select>
                        ${isGm ? `
                            <button type="button" class="vis-pill ${window.tabletopToolMode === 'calibrate' ? 'active-sighted' : ''}" onclick="setTabletopToolMode(window.tabletopToolMode==='calibrate'?'move':'calibrate')" title="Medir 1 quadrado do mapa para calibrar a grade">📐 Gradificar</button>
                            <button type="button" class="vis-pill ${window.tabletopToolMode === 'fog' ? 'active-hidden' : ''}" onclick="setTabletopToolMode(window.tabletopToolMode==='fog'?'move':'fog')" title="Desenhar Névoa de Guerra (Retângulo ou Polígono)">🌫️ Névoa</button>
                            <button type="button" class="vis-pill" onclick="addDefaultFogCoverAll()" title="Cobrir mapa com Névoa">🌑 Cobrir</button>
                        ` : ''}
                    </div>

                    <button type="button" id="tt-btn-grid-toggle" class="btn-mini ${gmMetrics.enabled ? 'is-active' : ''}" ${isGm ? '' : 'disabled'} onclick="toggleTabletopGridEnabled()" title="${isGm ? 'Mestre: Ativar/Desativar exibição da Grade' : 'Apenas o Mestre pode desabilitar a grade'}">
                        ${gmMetrics.enabled ? `🕸️ Grade (${gmMetrics.gx}px)` : '🕸️ Grade OFF'}
                    </button>
                    <label style="display:flex; align-items:center; gap:4px; font-size:11px; color:#c2c6d6; cursor:${isGm ? 'pointer' : 'not-allowed'}; opacity:${isGm ? '1' : '0.55'};" title="${isGm ? 'Mestre: Grudar tokens nos quadrados da grade ao soltar' : 'Apenas o Mestre pode alterar o Snap da grade'}">
                        <input type="checkbox" id="tt-snap-checkbox" ${gmMetrics.snap ? 'checked' : ''} ${isGm ? '' : 'disabled'} onchange="toggleTabletopSnap(this.checked)"> Snap
                    </label>
                    <button type="button" class="vis-pill ${window.tabletopCursorShareEnabled ? 'active-studied' : ''}" onclick="toggleTabletopCursorShare()" title="Mostrar sua mãozinha colorida no mapa para os outros jogadores">🖐️ Mãozinha</button>
                </div>
                <div id="tt-selection-bar-root">${buildSelectedControlBarHtml(isGm)}</div>
                <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                    <span id="tt-online-count-badge" style="font-size:11px; color:#8df596; background:#162419; border:1px solid #3c6e43; padding:3px 7px; border-radius:4px; cursor:pointer;" onclick="openMultiplayerRoomModal('room')" title="Jogadores sincronizados em tempo real">
                        📡 ${onlineCount}/${maxP} Online | 👤 ${escapeHtmlText(playerShownName)}
                    </span>
                    ${isGm ? `<button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="clearAllTabletopTacticalOverlays()" title="Limpar Formas, Textos, Pincel e Névoa">🧹 Overlays</button>` : ''}
                    ${isGm ? `<button type="button" class="btn-mini danger" style="flex:0 0 auto;" onclick="clearTabletopTokens()" title="Limpar todos os tokens da mesa">🗑️</button>` : ''}
                </div>
            </div>

            ${contextSubBarHtml}
            <div id="tt-connected-players-root">${renderTabletopConnectedPlayersBarHtml()}</div>

            <div class="tabletop-stage-shell">
                <div class="tabletop-board-viewport" id="tabletop-viewport"
                     onwheel="onTabletopViewportWheel(event)"
                     onmousemove="onTabletopViewportMouseMove(event)"
                     onmouseleave="onTabletopViewportMouseLeave()"
                     oncontextmenu="return false;">
                    <div class="tabletop-stage" id="tabletop-stage"
                         style="width:${stageW}px; height:${stageH}px; ${stageBgStyle}"
                         onmousedown="onTabletopStageMouseDown(event)"
                         ondblclick="if(window.tabletopToolMode==='fog' && window.fogDrawShape==='polygon' && (window.fogPolygonDraft||[]).length>=3){ event.preventDefault(); commitFogPolygonDraft(); }">
                        <div id="tabletop-grid-overlay" class="tabletop-grid-overlay ${gmMetrics.enabled ? '' : 'is-hidden'}"
                             style="background-size:${gmMetrics.gx}px ${gmMetrics.gy}px; background-position:${gmMetrics.ox}px ${gmMetrics.oy}px;"></div>
                        ${aoeHtml}
                        ${drawingsHtml}
                        ${tokensHtml}
                        ${textBoxesHtml}
                        ${fogHtml}
                        <svg id="tt-fog-poly-draft-svg" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:47;"></svg>
                        <svg id="tabletop-ruler-svg" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:40;"></svg>
                        <div id="tt-ruler-labels-layer" style="position:absolute; inset:0; pointer-events:none; z-index:45;"></div>
                        <div id="tt-remote-cursors-layer" class="tt-remote-cursors-layer"></div>
                    </div>
                </div>
                <div id="tt-token-drawer-root">${renderTokenDrawerPanelHtml(isGm)}</div>
                <div class="tt-gmaps-nav-cluster" title="Controles de câmera (ou use o scroll do mouse e arraste o mapa)">
                    <button type="button" class="tt-gmaps-nav-btn" onclick="zoomTabletop(1.18)" title="Aproximar Zoom">＋</button>
                    <button type="button" id="tt-gmaps-zoom-pct" class="tt-gmaps-zoom-pill" onclick="zoomTabletop(1, true)" title="Resetar Zoom para 100%">${zoomPct}%</button>
                    <button type="button" class="tt-gmaps-nav-btn" onclick="zoomTabletop(0.85)" title="Afastar Zoom">－</button>
                    <button type="button" class="tt-gmaps-nav-btn" onclick="centerTabletopCameraReset()" title="Centralizar Câmera no Mapa / Token">⌖</button>
                </div>
                <div id="tt-initiative-hud-root" class="tt-initiative-hud-root">${initiativeHudHtml}</div>
            </div>
        </div>
    `;

    if (!window.tabletopCamera.initialized) {
        centerTabletopCameraReset();
    } else {
        applyTabletopCameraTransform();
    }
    renderTabletopRulersLayer();
    renderRemoteCursorsLayer();
    if (window.tabletopToolMode === 'fog' && window.fogDrawShape === 'polygon' && Array.isArray(window.fogPolygonDraft) && window.fogPolygonDraft.length > 0) {
        updateFogPolygonDraftPreview();
    }
}

// Atalhos globais seguros no Tabletop (Esc cancela régua/ferramenta • Enter fecha polígono • Delete remove seleção)
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !window._ttGlobalKeysBound) {
    window._ttGlobalKeysBound = true;
    document.addEventListener('keydown', (ev) => {
        if (typeof activeModule === 'undefined' || activeModule !== 'tabletop') return;
        const activeTag = document.activeElement?.tagName;
        if (activeTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
        if (ev.key === 'Escape') {
            clearMyPersistentRuler(true);
            if (Array.isArray(window.fogPolygonDraft) && window.fogPolygonDraft.length > 0) {
                cancelFogPolygonDraft();
            } else if (window.tabletopToolMode !== 'move') {
                setTabletopToolMode('move');
            }
        } else if (ev.key === 'Enter' && window.tabletopToolMode === 'fog' && window.fogDrawShape === 'polygon' && (window.fogPolygonDraft || []).length >= 3) {
            ev.preventDefault();
            commitFogPolygonDraft();
        } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
            if (window.selectedShapeId) {
                ev.preventDefault();
                removeAoeTemplate(window.selectedShapeId, ev);
            } else if (window.selectedTextBoxId) {
                ev.preventDefault();
                removeTextBox(window.selectedTextBoxId, ev);
            } else if (window.selectedDrawingId) {
                ev.preventDefault();
                removeDrawing(window.selectedDrawingId, ev);
            } else if (window.selectedFogId && _isVttEffectiveGm()) {
                ev.preventDefault();
                removeFogRegion(window.selectedFogId, ev);
            }
        }
    });
}
