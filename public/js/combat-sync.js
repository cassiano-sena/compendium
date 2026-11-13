/* =========================================================================
   FASE 2: UNIFICAÇÃO DE COMBATE (RUNA), INICIATIVA, TABLETOP E DADOS DE VIDA
   Sincroniza PV, Iniciativa, Turnos, Condições e Dados de Vida entre
   a Runa de Combate, os Tokens no Tabletop e as Fichas de Personagem.
   ========================================================================= */

window.combatTurnState = {
    activeCardId: null,
    round: 1
};

// Sincroniza PV entre Card da Runa, Token do Tabletop e Ficha de Personagem
function syncCombatEntityHp(cardOrTokenOrCharId, newHp, newMaxHp = null) {
    let targetCard = null;
    let targetToken = null;
    let targetChar = null;

    if (typeof combatCards !== 'undefined') {
        targetCard = combatCards.find(c =>
            String(c.id) === String(cardOrTokenOrCharId) ||
            (c.tokenId && String(c.tokenId) === String(cardOrTokenOrCharId)) ||
            (c.charId && String(c.charId) === String(cardOrTokenOrCharId))
        );
    }

    if (typeof tabletopState !== 'undefined' && Array.isArray(tabletopState.tokens)) {
        targetToken = tabletopState.tokens.find(t =>
            String(t.id) === String(cardOrTokenOrCharId) ||
            (targetCard && targetCard.tokenId && String(t.id) === String(targetCard.tokenId)) ||
            (t.refId && String(t.refId) === String(cardOrTokenOrCharId)) ||
            (targetCard && targetCard.charId && String(t.refId) === String(targetCard.charId))
        );
    }

    if (typeof charactersData !== 'undefined') {
        const charIdCandidate = (targetCard && targetCard.charId) || (targetToken && targetToken.refId) || cardOrTokenOrCharId;
        targetChar = charactersData.find(c => String(c.id) === String(charIdCandidate));
    }

    if (targetCard) {
        if (newMaxHp !== null && !isNaN(Number(newMaxHp))) {
            targetCard.maxHp = Math.max(1, Number(newMaxHp));
        }
        targetCard.hp = Math.max(0, Math.min(targetCard.maxHp, Number(newHp) || 0));
    }

    if (targetToken) {
        if (newMaxHp !== null && !isNaN(Number(newMaxHp))) {
            targetToken.hpMax = Math.max(1, Number(newMaxHp));
        }
        const maxT = Number(targetToken.hpMax) || (targetCard ? targetCard.maxHp : 100);
        targetToken.hpCurrent = Math.max(0, Math.min(maxT, Number(newHp) || 0));
    }

    if (targetChar) {
        if (newMaxHp !== null && !isNaN(Number(newMaxHp))) {
            targetChar.hpMax = Math.max(1, Number(newMaxHp));
        }
        targetChar.hpCurrent = Math.max(0, Math.min(Number(targetChar.hpMax) || 100, Number(newHp) || 0));
    }

    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.broadcastTabletop) CompendioNetAdapter.broadcastTabletop();
        if (CompendioNetAdapter.broadcastCharacters) CompendioNetAdapter.broadcastCharacters();
        if (CompendioNetAdapter.broadcastCombat) CompendioNetAdapter.broadcastCombat();
    }

    if (typeof renderCombatHand === 'function') renderCombatHand();
    if (typeof activeModule !== 'undefined') {
        if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
        if (activeModule === 'character' && typeof renderCharacterModule === 'function') renderCharacterModule();
    }
}

// Sobrescreve spawnMonsterCardFromSheet para também criar/vincular Token no Tabletop e suportar Iniciativa
function spawnMonsterCardFromSheet(mobName, baseHp, acVal) {
    const qtyInput = document.getElementById('spawn-qty-input');
    const minionCheck = document.getElementById('spawn-minion-check');
    const eliteCheck = document.getElementById('spawn-elite-check');
    const qty = Math.min(20, Math.max(1, parseInt(qtyInput?.value) || 1));
    const isMinion = Boolean(minionCheck?.checked);
    const isElite = Boolean(eliteCheck?.checked);

    const sourceRef = (typeof activeItemContext !== 'undefined' && activeItemContext) ? {
        category: activeItemContext.category || currentCategory,
        groupKey: activeItemContext.groupKey || '',
        itemKey: activeItemContext.key || ''
    } : null;

    let initMod = 0;
    let sizeCode = 'M';
    let imgSrc = '';
    if (typeof activeItemContext !== 'undefined' && activeItemContext && activeItemContext.loadedJson) {
        const j = activeItemContext.loadedJson;
        if (j.dex !== undefined) initMod = Math.floor(((Number(j.dex) || 10) - 10) / 2);
        if (Array.isArray(j.size) && j.size[0]) sizeCode = j.size[0];
        else if (typeof j.size === 'string') sizeCode = j.size;
        if (typeof getResourcePaths === 'function') {
            const paths = getResourcePaths(activeItemContext.itemData || {}, j);
            if (j.customToken) imgSrc = virtualFiles[j.customToken] || j.customToken;
            else if (paths.token && paths.token[0]) imgSrc = paths.token[0];
        }
    }

    const existingCount = combatCards.filter(c => c.baseName === mobName).length;

    for (let i = 1; i <= qty; i++) {
        const num = existingCount + i;
        let finalHp = isMinion ? 1 : (parseInt(baseHp) || 30);
        let finalAc = parseInt(acVal) || 14;
        if (isElite && !isMinion) {
            finalHp = Math.round(finalHp * 1.5);
            finalAc += 2;
        }
        const cardId = 'card-' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '-' + i;
        const tokId = 'tok-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000) + '-' + i;
        const displayName = qty > 1 || existingCount > 0 ? `${mobName}${isElite ? ' [Elite]' : ''} #${num}` : `${mobName}${isElite ? ' [Elite]' : ''}`;

        // Também posiciona no Tabletop se o usuário desejar mesa sincronizada
        const gridPx = Number(tabletopState.gridSize) || 56;
        const offset = (tabletopState.tokens.length % 10) * gridPx;
        const footprint = sizeCode === 'G' ? 4 : (sizeCode === 'H' ? 3 : (sizeCode === 'L' ? 2 : 1));

        if (sourceRef) {
            const knowRec = getEntityKnowledgeRecord(sourceRef.category, sourceRef.itemKey);
            if (knowRec.globalLevel === 'hidden') knowRec.globalLevel = 'sighted';
        }

        tabletopState.tokens.push({
            id: tokId,
            cardId,
            refId: sourceRef ? `${sourceRef.category}:${sourceRef.itemKey}` : cardId,
            category: sourceRef ? sourceRef.category : 'monsters',
            groupKey: sourceRef ? sourceRef.groupKey : '',
            itemKey: sourceRef ? sourceRef.itemKey : '',
            name: displayName,
            type: (sourceRef && sourceRef.category === 'npcs') ? 'npc' : 'monster',
            ownerId: 'gm-master',
            x: 224 + offset,
            y: 224 + (Math.floor(tabletopState.tokens.length / 10) * gridPx),
            hpCurrent: finalHp,
            hpMax: finalHp,
            ac: finalAc,
            sizeSquares: footprint,
            imgSrc
        });

        combatCards.push({
            id: cardId,
            tokenId: tokId,
            baseName: mobName,
            name: displayName,
            hp: finalHp,
            maxHp: finalHp,
            ac: finalAc,
            initiative: 0,
            initMod,
            isElite,
            isPc: false,
            collapsed: false,
            calc: '',
            effects: [],
            sourceRef
        });
    }

    dockCollapsed = false;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
        if (CompendioNetAdapter.broadcastCombat) CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    showToast(`🔮 ${qty}x "${mobName}" invocado(s) na Runa e posicionado(s) no Tabletop!`);
}

// Inclui todos os Personagens dos Jogadores na Runa de Combate para controlar Iniciativa e Turnos juntos
function addPartyCharactersToCombatHand() {
    if (typeof charactersData === 'undefined' || !charactersData.length) {
        showToast('Nenhum personagem cadastrado.');
        return;
    }
    const gmIds = new Set((typeof playersData !== 'undefined' && Array.isArray(playersData))
        ? playersData.filter(p => p.role === 'gm').map(p => p.id)
        : ['gm-master']);
    const pcs = charactersData.filter(c => !gmIds.has(c.ownerId));
    const listToUse = pcs.length > 0 ? pcs : charactersData.slice(0, 5);
    let added = 0;

    listToUse.forEach(c => {
        if (combatCards.some(card => card.charId === c.id)) return;
        const dexMod = calcAbilityMod(c.stats?.dex || 10);
        const initMod = dexMod + (Number(c.initiativeBonus) || 0);
        const linkedTok = (tabletopState.tokens || []).find(t => t.refId === c.id || t.itemKey === c.id);
        const cardId = 'card-pc-' + c.id;
        combatCards.push({
            id: cardId,
            charId: c.id,
            ownerId: c.ownerId,
            tokenId: linkedTok ? linkedTok.id : null,
            baseName: c.name,
            name: `🛡️ ${c.name}`,
            hp: Number(c.hpCurrent ?? c.hp?.current) || 10,
            maxHp: Number(c.hpMax ?? c.hp?.max) || 10,
            ac: Number(c.ac) || 14,
            initiative: 0,
            initMod,
            isPc: true,
            collapsed: false,
            calc: '',
            effects: [],
            sourceRef: null
        });
        added++;
    });

    dockCollapsed = false;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    if (typeof activeModule !== 'undefined' && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') {
        renderTabletopModule();
    }
    showToast(added > 0 ? `🛡️ ${added} Personagem(ns) adicionado(s) à fila de Combate!` : 'Todos os PJs já estão na Runa de Combate.');
}

function rollInitiativeForCard(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    const mod = Number(card.initMod) || 0;
    const signStr = mod >= 0 ? `+${mod}` : `${mod}`;
    const res = CompendioDice.rollExpression(`1d20${signStr}`, `Iniciativa (${card.name})`, {
        actorName: card.name,
        charId: card.charId
    });
    if (res) {
        card.initiative = res.total;
        sortCombatCardsByInitiative(false);
        saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
            CompendioNetAdapter.broadcastCombat();
        }
        renderCombatHand();
    }
}

function rollAllCombatInitiatives() {
    if (!combatCards.length) {
        showToast('Adicione combatentes na Runa primeiro!');
        return;
    }
    combatCards.forEach(card => {
        const mod = Number(card.initMod) || 0;
        const r = Math.floor(Math.random() * 20) + 1;
        card.initiative = r + mod;
    });
    sortCombatCardsByInitiative(true);
    if (combatCards.length > 0) {
        window.combatTurnState.activeCardId = combatCards[0].id;
        window.combatTurnState.round = 1;
    }
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    if (typeof activeModule !== 'undefined' && activeModule === 'tabletop') renderTabletopModule();
    showToast('🎲 Iniciativas roladas e fila de combate ordenada!');
}

function sortCombatCardsByInitiative(announce = false) {
    const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { initiativeTieBreaker: 'dex' };
    combatCards.sort((a, b) => {
        const ia = Number(a.initiative) || 0;
        const ib = Number(b.initiative) || 0;
        if (ib !== ia) return ib - ia;
        if (rules.initiativeTieBreaker === 'players-first' && a.isPc !== b.isPc) {
            return a.isPc ? -1 : 1;
        }
        if (rules.initiativeTieBreaker === 'monsters-first' && a.isPc !== b.isPc) {
            return a.isPc ? 1 : -1;
        }
        return (Number(b.initMod) || 0) - (Number(a.initMod) || 0);
    });
    if (announce && typeof showToast === 'function') {
        showToast('⚡ Fila ordenada por Iniciativa!');
    }
}

function setCardInitiativeManual(cardId, val) {
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    card.initiative = parseInt(val, 10) || 0;
    sortCombatCardsByInitiative(false);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function toggleCardEliteMode(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    card.isElite = !card.isElite;
    if (card.isElite) {
        card.maxHp = Math.round(card.maxHp * 1.5);
        card.hp = Math.min(card.maxHp, Math.round(card.hp * 1.5));
        card.ac = (parseInt(card.ac) || 14) + 2;
        if (!card.name.includes('[Elite]')) card.name += ' [Elite]';
    } else {
        card.maxHp = Math.max(1, Math.round(card.maxHp / 1.5));
        card.hp = Math.min(card.maxHp, card.hp);
        card.ac = Math.max(1, (parseInt(card.ac) || 14) - 2);
        card.name = card.name.replace(/\s*\[Elite\]/g, '');
    }
    syncCombatEntityHp(card.id, card.hp, card.maxHp);
    showToast(card.isElite ? `👑 "${card.name}" promovido ao Template Elite (+50% PV, +2 CA)!` : `Template Elite removido de "${card.name}".`);
}

function _commitTurnAdvance(activeCard, stepEffects = true) {
    if (!activeCard) return;
    window.combatTurnState.activeCardId = activeCard.id;

    if (stepEffects && Array.isArray(activeCard.effects) && activeCard.effects.length > 0) {
        activeCard.effects.forEach(eff => eff.turns -= 1);
        activeCard.effects = activeCard.effects.filter(eff => eff.turns > 0);
    }

    if (stepEffects && typeof CompendioModAPI !== 'undefined') {
        CompendioModAPI.runHooks('onTurnAdvance', {
            activeCard,
            round: window.combatTurnState.round
        });
    }

    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    if (typeof activeModule !== 'undefined' && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') {
        renderTabletopModule();
    }
    showToast(`⏭️ Rodada ${window.combatTurnState.round} — Turno de: ${activeCard.name}`);
}

function nextCombatTurn() {
    if (!combatCards.length) return;
    const aliveCards = combatCards.filter(c => c.hp > 0 || c.isPc);
    if (!aliveCards.length) return;

    let currentIdx = aliveCards.findIndex(c => String(c.id) === String(window.combatTurnState.activeCardId));
    if (currentIdx === -1) {
        currentIdx = 0;
        window.combatTurnState.round = 1;
    } else {
        currentIdx = (currentIdx + 1) % aliveCards.length;
        if (currentIdx === 0) {
            window.combatTurnState.round = (Number(window.combatTurnState.round) || 1) + 1;
        }
    }

    _commitTurnAdvance(aliveCards[currentIdx], true);
}

function prevCombatTurn() {
    if (!combatCards.length) return;
    const aliveCards = combatCards.filter(c => c.hp > 0 || c.isPc);
    if (!aliveCards.length) return;

    let currentIdx = aliveCards.findIndex(c => String(c.id) === String(window.combatTurnState.activeCardId));
    if (currentIdx === -1) {
        currentIdx = aliveCards.length - 1;
        window.combatTurnState.round = Math.max(1, Number(window.combatTurnState.round) || 1);
    } else {
        currentIdx -= 1;
        if (currentIdx < 0) {
            currentIdx = aliveCards.length - 1;
            window.combatTurnState.round = Math.max(1, (Number(window.combatTurnState.round) || 1) - 1);
        }
    }

    _commitTurnAdvance(aliveCards[currentIdx], false);
}

window.combatIndividualMode = typeof window.combatIndividualMode === 'boolean' ? window.combatIndividualMode : false;
window.combatFocusedCardId = window.combatFocusedCardId || null;

function toggleCombatIndividualMode(force = null) {
    window.combatIndividualMode = (force === null) ? !window.combatIndividualMode : Boolean(force);
    if (window.combatIndividualMode && (!window.combatFocusedCardId || !combatCards.some(c => String(c.id) === String(window.combatFocusedCardId)))) {
        window.combatFocusedCardId = window.combatTurnState?.activeCardId || (combatCards[0]?.id || null);
    }
    renderCombatHand();
}

function selectCombatFocusedCard(cardId) {
    window.combatFocusedCardId = cardId;
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (card && card.tokenId && typeof tabletopState !== 'undefined' && Array.isArray(tabletopState.tokens)) {
        const tok = tabletopState.tokens.find(t => String(t.id) === String(card.tokenId));
        if (tok) {
            selectedTabletopTokenId = tok.id;
            if (typeof activeModule !== 'undefined' && activeModule === 'tabletop' && typeof updateTabletopSelectionUI === 'function') {
                updateTabletopSelectionUI();
            }
        }
    }
    renderCombatHand();
}

function stepFocusedCombatCard(dir = 1) {
    if (!combatCards.length) return;
    let idx = combatCards.findIndex(c => String(c.id) === String(window.combatFocusedCardId));
    if (idx < 0) idx = 0;
    const nextIdx = (idx + dir + combatCards.length) % combatCards.length;
    selectCombatFocusedCard(combatCards[nextIdx].id);
}

function openCombatRuneForToken(tokenId) {
    if (typeof tabletopState === 'undefined' || !Array.isArray(tabletopState.tokens)) return;
    const tok = tabletopState.tokens.find(t => String(t.id) === String(tokenId));
    if (!tok) return;

    if (tok.type === 'gold' || tok.type === 'chest') {
        if (typeof openInteractiveTokenModal === 'function') openInteractiveTokenModal(tok.id);
        return;
    }

    const isPcTok = (tok.type === 'pc' || tok.type === 'character' || tok.category === 'character');
    let card = combatCards.find(c =>
        (c.tokenId && String(c.tokenId) === String(tok.id)) ||
        (tok.cardId && String(c.id) === String(tok.cardId)) ||
        (isPcTok && c.charId && String(c.charId) === String(tok.itemKey || tok.refId))
    );

    if (!card) {
        let linkedChar = null;
        if (isPcTok && typeof charactersData !== 'undefined') {
            linkedChar = charactersData.find(ch => String(ch.id) === String(tok.refId || tok.itemKey));
        }
        const initMod = linkedChar ? Math.floor(((Number(linkedChar.dex) || 10) - 10) / 2) : (Number(tok.initMod) || 0);
        const hpMax = Math.max(1, Number(tok.hpMax) || Number(linkedChar?.hpMax) || Number(tok.hpCurrent) || 20);
        const hpCur = Math.max(0, Number(tok.hpCurrent ?? linkedChar?.hpCurrent ?? hpMax));
        const cardId = 'card-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
        card = {
            id: cardId,
            tokenId: tok.id,
            charId: linkedChar ? linkedChar.id : (isPcTok ? (tok.refId || tok.itemKey) : null),
            ownerId: tok.ownerId || linkedChar?.ownerId || 'gm-master',
            baseName: tok.name || 'Combatente',
            name: tok.name || 'Combatente',
            hp: hpCur,
            maxHp: hpMax,
            ac: Number(tok.ac) || Number(linkedChar?.ac) || 12,
            initiative: 0,
            initMod,
            isPc: isPcTok,
            isElite: false,
            collapsed: false,
            calc: '',
            effects: [],
            sourceRef: (tok.category && tok.itemKey && tok.type !== 'character') ? {
                category: tok.category,
                groupKey: tok.groupKey || '',
                itemKey: tok.itemKey
            } : null
        };
        tok.cardId = cardId;
        combatCards.push(card);
        if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined') {
            if (CompendioNetAdapter.broadcastCombatPatch) CompendioNetAdapter.broadcastCombatPatch({ card });
            if (CompendioNetAdapter.broadcastTokenDelta) CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
        }
    }

    dockCollapsed = false;
    window.combatIndividualMode = true;
    window.combatFocusedCardId = card.id;
    renderCombatHand();
}

function jumpFromTokenToSheet(tokenId) {
    if (typeof tabletopState === 'undefined' || !Array.isArray(tabletopState.tokens)) return;
    const tok = tabletopState.tokens.find(t => String(t.id) === String(tokenId));
    if (!tok) {
        if (typeof showToast === 'function') showToast('Token não encontrado.');
        return;
    }
    if (tok.type === 'gold' || tok.type === 'chest') {
        if (typeof openInteractiveTokenModal === 'function') openInteractiveTokenModal(tok.id);
        return;
    }
    const charId = (tok.type === 'pc' || tok.type === 'character' || tok.category === 'character') ? (tok.refId || tok.itemKey) : null;
    if (charId && typeof charactersData !== 'undefined' && charactersData.some(c => String(c.id) === String(charId))) {
        activeCharacterId = charId;
        if (typeof switchMainModule === 'function') switchMainModule('character');
        return;
    }
    if (tok.category && tok.itemKey && typeof jumpToCatalogEntity === 'function') {
        jumpToCatalogEntity(tok.category, tok.groupKey || '', tok.itemKey);
        return;
    }
    const linkedCard = combatCards.find(c => String(c.tokenId) === String(tok.id) || String(c.id) === String(tok.cardId));
    if (linkedCard) {
        jumpFromCardToMonsterSheet(linkedCard.id);
        return;
    }
    if (typeof showToast === 'function') showToast('ℹ️ Este token não tem ficha vinculada.');
}

function focusCombatantTokenOnTabletop(cardId) {
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card || typeof tabletopState === 'undefined' || !Array.isArray(tabletopState.tokens)) return;
    window.combatFocusedCardId = card.id;

    const tok = tabletopState.tokens.find(t =>
        (card.tokenId && String(t.id) === String(card.tokenId)) ||
        (card.charId && (t.itemKey === card.charId || t.refId === card.charId))
    );
    if (!tok) {
        showToast(`📍 "${card.name}" ainda não tem token posicionado no Tabletop.`);
        return;
    }

    selectedTabletopTokenId = tok.id;
    const needSwitch = (typeof activeModule !== 'undefined' && activeModule !== 'tabletop');
    if (needSwitch && typeof switchMainModule === 'function') {
        switchMainModule('tabletop');
    } else if (typeof renderTabletopModule === 'function') {
        renderTabletopModule();
    }

    setTimeout(() => {
        if (typeof centerTabletopCameraOnWorld === 'function') {
            const gs = Number(tabletopState.gridSize) || 50;
            const span = (Number(tok.sizeSquares) || 1) * gs;
            centerTabletopCameraOnWorld((Number(tok.x) || 0) + span / 2, (Number(tok.y) || 0) + span / 2);
        }
    }, needSwitch ? 80 : 20);
}

function toggleTabletopInitiativeCollapsed() {
    window.ttInitiativeCollapsed = !window.ttInitiativeCollapsed;
    refreshTabletopInitiativeWidget();
}

function renderDynamicInitiativeTrackerHtml() {
    const roundNum = window.combatTurnState?.round || 1;
    const activeId = window.combatTurnState?.activeCardId;
    const isCollapsed = Boolean(window.ttInitiativeCollapsed);
    const activePl = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    const isGm = typeof isEffectiveGmUser === 'function'
        ? isEffectiveGmUser(activePl)
        : Boolean(activePl && !activePl.isUnauthenticated && activePl.role === 'gm' && window.isHostClient !== false);
    const visibleCards = isGm
        ? combatCards
        : combatCards.filter(card => {
            if (!card || !card.tokenId || typeof tabletopState === 'undefined' || !Array.isArray(tabletopState?.tokens)) return true;
            const tok = tabletopState.tokens.find(t => String(t.id) === String(card.tokenId));
            return !tok || !tok.hiddenFromPlayers;
        });

    if (isCollapsed) {
        const activeCard = visibleCards.find(c => String(c.id) === String(activeId));
        return `
            <div class="tt-initiative-hud is-collapsed">
                <button type="button" class="btn-mini" style="border-color:#d8b467; color:#f2cf83;" onclick="toggleTabletopInitiativeCollapsed()" title="Expandir Mostrador de Iniciativa">
                    ⚡ Iniciativa • Rd ${roundNum} (${visibleCards.length})${activeCard ? ` — ▶ ${escapeHtmlText(activeCard.name)}` : ''}
                </button>
            </div>
        `;
    }

    const rowsHtml = visibleCards.length === 0
        ? `<div class="tt-init-empty">Sem combatentes na fila. Use <strong>+PJ</strong> ou invoque tokens pela <strong>🔮 Runa</strong>.</div>`
        : visibleCards.map((card, index) => {
            const isCurrent = String(card.id) === String(activeId);
            const isDead = Number(card.hp) <= 0;
            const safeId = `'${String(card.id).replace(/'/g, "\\'")}'`;

            let ownerId = card.ownerId || null;
            if (!ownerId && card.charId && typeof charactersData !== 'undefined') {
                ownerId = charactersData.find(ch => ch.id === card.charId)?.ownerId || null;
            }
            const dotColor = card.isPc
                ? (typeof getPlayerColor === 'function' && ownerId ? getPlayerColor(ownerId) : '#4fc3f7')
                : '#e57373';

            const canSeeExactHp = isGm || card.isPc || (ownerId && ownerId === activePl?.id);
            const hpPct = Math.max(0, Math.min(100, Math.round(((Number(card.hp) || 0) / Math.max(1, Number(card.maxHp) || 1)) * 100)));
            const hpBarColor = hpPct > 50 ? '#66bb6a' : (hpPct > 20 ? '#ffa726' : '#ef5350');
            const qualLabel = typeof describeQualitativeHealth === 'function'
                ? describeQualitativeHealth(card.hp, card.maxHp, card.isPc ? 'pc' : 'monster')
                : (isDead ? 'Derrotado' : 'Em Combate');

            const effTags = (card.effects || []).slice(0, 3).map(e =>
                `<span class="tt-init-cond">${escapeHtmlText(e.name)} (${e.turns}t)</span>`
            ).join('');

            return `
                <div class="tt-init-row ${isCurrent ? 'is-active-turn' : ''} ${isDead ? 'is-down' : ''}" onclick="focusCombatantTokenOnTabletop(${safeId})" title="Clique para centralizar a câmera no Token deste combatente">
                    <div class="tt-init-order">
                        ${isCurrent ? '<span class="tt-init-arrow">▶</span>' : `<span style="opacity:0.6;">#${index + 1}</span>`}
                    </div>
                    <div class="tt-init-main">
                        <div style="display:flex; align-items:center; gap:5px; min-width:0;">
                            <span class="player-color-dot" style="background:${escapeHtmlText(dotColor)};"></span>
                            <span class="tt-init-name">${escapeHtmlText(card.name)}</span>
                        </div>
                        <div class="tt-init-hp-wrap">
                            <div class="tt-init-hp-bar"><div class="tt-init-hp-fill" style="width:${hpPct}%; background:${hpBarColor};"></div></div>
                            <span class="tt-init-hp-text">${canSeeExactHp ? `${card.hp}/${card.maxHp} PV • CA ${card.ac || 10}` : qualLabel}</span>
                        </div>
                        ${effTags ? `<div class="tt-init-conds">${effTags}</div>` : ''}
                    </div>
                    <div class="tt-init-score" onclick="event.stopPropagation(); dockCollapsed=false; window.combatIndividualMode=true; selectCombatFocusedCard(${safeId});" title="Abrir este combatente na Runa de Combate">
                        <span class="tt-init-val-pill">${Number(card.initiative) || 0}</span>
                    </div>
                </div>
            `;
        }).join('');

    return `
        <div class="tt-initiative-hud">
            <div class="tt-init-header">
                <div style="display:flex; align-items:center; gap:6px;">
                    <strong style="color:var(--accent-gold); font-size:12.5px;">⚡ Iniciativa</strong>
                    <span class="tt-init-round-pill">Rd ${roundNum}</span>
                </div>
                <div style="display:flex; gap:3px; align-items:center;">
                    <button type="button" class="card-mini-btn" onclick="prevCombatTurn()" title="Turno Anterior">⏮️</button>
                    <button type="button" class="card-mini-btn" style="background:#54421d; color:#f6d98e;" onclick="nextCombatTurn()" title="Avançar Turno">⏭️</button>
                    <button type="button" class="card-mini-btn" onclick="dockCollapsed=false; renderCombatHand();" title="Abrir Runa de Combate (iniciativas e fichas)">🔮</button>
                    <button type="button" class="card-mini-btn" onclick="addPartyCharactersToCombatHand()" title="Adicionar Personagens do Grupo">+PJ</button>
                    <button type="button" class="card-mini-btn" onclick="toggleTabletopInitiativeCollapsed()" title="Recolher Mostrador">🗕</button>
                </div>
            </div>
            <div class="tt-init-list">
                ${rowsHtml}
            </div>
        </div>
    `;
}

function refreshTabletopInitiativeWidget() {
    const root = document.getElementById('tt-initiative-hud-root');
    if (root) {
        root.innerHTML = renderDynamicInitiativeTrackerHtml();
    }
}

function renderCombatHand() {
    const dock = document.getElementById('combat-dock');
    const countSpan = document.getElementById('combat-hand-count');
    const hand = document.getElementById('combat-cards-hand');
    if (!hand || !dock) {
        refreshTabletopInitiativeWidget();
        return;
    }

    countSpan.textContent = combatCards.length;
    dock.classList.toggle('dock-collapsed', dockCollapsed);

    // Atualiza barra de ferramentas da Runa
    const toolbar = dock.querySelector('.rune-popup-toolbar');
    if (toolbar) {
        const roundNum = window.combatTurnState?.round || 1;
        toolbar.innerHTML = `
            <span class="list-item-folder-badge" style="background:#3d2d14; color:#f2cf83; border:1px solid #d8b467;">🔥 Rodada ${roundNum}</span>
            <button type="button" class="btn-mini ${window.combatIndividualMode ? 'is-active' : ''}" id="btn-combat-mode-toggle" style="flex:0 0 auto;" onclick="toggleCombatIndividualMode()" title="Alternar entre Foco Individual (1 combatente ampliado) e todos os Cards">
                ${window.combatIndividualMode ? '🎯 Individual (ON)' : '🗂️ Todos'}
            </button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="addPartyCharactersToCombatHand()" title="Adicionar Personagens dos Jogadores à fila de Iniciativa">🛡️ + PJs</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="rollAllCombatInitiatives()" title="Rolar 1d20 + Mod de Iniciativa para todos e ordenar a fila">🎲 Rolar Iniciativas</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="prevCombatTurn()" title="Voltar para o Turno Anterior">⏮️ Anterior</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto; background:#454857; border-color:#d8b467; color:#fff;" id="btn-advance-turn" onclick="nextCombatTurn()">⏭️ Avançar Turno</button>
            ${!window.combatIndividualMode ? `
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="setAllCardsCollapsed(true)" title="Compactar todos os cards">🗕</button>
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="setAllCardsCollapsed(false)" title="Expandir todos os cards">🗖</button>
            ` : `
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="stepFocusedCombatCard(-1)" title="Combatente anterior">◀ Ant.</button>
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="stepFocusedCombatCard(1)" title="Próximo combatente">Próx. ▶</button>
            `}
            <button type="button" class="btn-mini danger" style="flex:0 0 auto;" onclick="clearAllCombatCards()">🗑️</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="toggleCombatDock()" title="Recolher para a Pedra Rúnica">▼</button>
        `;
    }

    if (combatCards.length === 0) {
        hand.innerHTML = `<div style="color:#a0a4b8; font-size:12px; font-style:italic; padding:6px 12px;">Nenhum card ativo. Clique em "⚔️ Invocar Card" no topo da ficha de um monstro, "🛡️ + PJs" acima ou selecione um Token no Tabletop → "🔮 Runa".</div>`;
        refreshTabletopInitiativeWidget();
        return;
    }

    if (!window.combatFocusedCardId || !combatCards.some(c => String(c.id) === String(window.combatFocusedCardId))) {
        window.combatFocusedCardId = window.combatTurnState?.activeCardId || combatCards[0].id;
    }

    const selectorStripHtml = `
        <div class="rune-individual-selector">
            ${combatCards.map(c => {
                const isFocus = String(c.id) === String(window.combatFocusedCardId);
                const isTurn = String(window.combatTurnState?.activeCardId) === String(c.id);
                const isDown = Number(c.hp) <= 0;
                const sId = `'${String(c.id).replace(/'/g, "\\'")}'`;
                return `
                    <button type="button" class="rune-selector-pill ${isFocus ? 'active-focus' : ''} ${isTurn ? 'is-turn' : ''} ${isDown ? 'is-dead' : ''}" onclick="selectCombatFocusedCard(${sId})" title="Selecionar ${escapeHtmlText(c.name)} (${c.hp}/${c.maxHp} PV • Init ${c.initiative || 0})">
                        ${isTurn ? '⚔️' : ''} ${escapeHtmlText(c.name)} · <span style="opacity:0.85;">${c.hp}/${c.maxHp}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;

    const allConds = (typeof CompendioRules !== 'undefined')
        ? CompendioRules.getAllConditions()
        : ['Cego', 'Envenenado', 'Paralisado', 'Caído', 'Impedido', 'Concentração'];
    const effectOptions = allConds.map(c => `<option value="${escapeHtmlText(c)}">${escapeHtmlText(c)}</option>`).join('') + `<option value="Custom">+ Custom...</option>`;

    const cardsToRender = window.combatIndividualMode
        ? [combatCards.find(c => String(c.id) === String(window.combatFocusedCardId)) || combatCards[0]]
        : combatCards;

    const cardsHtml = cardsToRender.map(mob => {
        if (!mob.effects) mob.effects = [];
        const isDead = mob.hp <= 0;
        const isBloodied = !isDead && mob.maxHp > 1 && mob.hp <= Math.floor(mob.maxHp / 2);
        const isCurrentTurn = String(window.combatTurnState?.activeCardId) === String(mob.id);
        const isFocused = String(mob.id) === String(window.combatFocusedCardId);
        const stateClass = isDead ? 'dead' : (isBloodied ? 'bloodied' : '');
        const collapseClass = (!window.combatIndividualMode && mob.collapsed) ? 'card-collapsed' : '';
        const turnClass = isCurrentTurn ? 'active-turn-card' : '';
        const focusClass = window.combatIndividualMode && isFocused ? 'focused-card' : '';
        const safeId = `'${String(mob.id).replace(/'/g, "\\'")}'`;

        const effectsHtml = mob.effects.map((eff, index) =>
            `<span class="effect-tag">${escapeHtmlText(eff.name)} (${eff.turns}t) <button onclick="removeCardEffect(${safeId}, ${index})">x</button></span>`
        ).join('');

        return `
            <div class="playing-card ${stateClass} ${collapseClass} ${turnClass} ${focusClass}">
                <div class="card-header-bar" onclick="${window.combatIndividualMode ? `focusCombatantTokenOnTabletop(${safeId})` : `toggleCardCollapse(${safeId}, event)`}" title="${window.combatIndividualMode ? 'Clique para focar token no Tabletop' : 'Clique para retrair ou expandir este card'}">
                    <span class="card-mob-name" title="${escapeHtmlText(mob.name)}">${isCurrentTurn ? '⚔️ ' : (mob.collapsed && !window.combatIndividualMode ? '▶ ' : '▼ ')}${escapeHtmlText(mob.name)}</span>
                    <div class="card-header-btns">
                        ${!mob.isPc ? `<button type="button" class="card-mini-btn" style="${mob.isElite ? 'background:#6b201b; color:#ffd584;' : ''}" onclick="toggleCardEliteMode(${safeId}, event)" title="Alternar Template Elite (+50% PV, +2 CA)">👑</button>` : ''}
                        <button type="button" class="card-mini-btn" onclick="event.stopPropagation(); focusCombatantTokenOnTabletop(${safeId})" title="Centralizar no Token do Tabletop">📍</button>
                        <button type="button" class="card-mini-btn" onclick="jumpFromCardToMonsterSheet(${safeId}, event)" title="Abrir a Ficha deste combatente">📖</button>
                        <button type="button" class="card-mini-btn" style="color:#ff8a80;" onclick="removeCombatCard(${safeId}, event)" title="Descartar Card">✕</button>
                    </div>
                </div>

                <div class="card-vitals-bar">
                    <span class="card-hp-num">
                        <input type="number" class="card-hp-input" value="${mob.hp}" title="PV atuais" onclick="event.stopPropagation()" onchange="setCardHp(${safeId}, 'hp', this.value)">
                        <span style="font-size:11px; color:#aaa;">/</span>
                        <input type="number" class="card-hp-input" value="${mob.maxHp}" min="1" title="PV máximos" onclick="event.stopPropagation()" onchange="setCardHp(${safeId}, 'max', this.value)">
                    </span>
                    <span style="font-size:11px; color:#d8b467;">🛡️ ${mob.ac || 14}</span>
                    <span style="display:inline-flex; align-items:center; gap:2px; font-size:11px; color:#8df596;" title="Iniciativa (Clique no dado para rolar)">
                        ⚡<input type="number" class="card-hp-input" style="width:30px; color:#8df596;" value="${mob.initiative || 0}" onclick="event.stopPropagation()" onchange="setCardInitiativeManual(${safeId}, this.value)">
                        <button type="button" class="card-mini-btn" style="padding:1px 3px;" onclick="rollInitiativeForCard(${safeId}, event)">🎲</button>
                    </span>
                </div>

                <div class="card-retractable-body">
                    <div class="card-effects-list">${effectsHtml || '<span style="font-size:10px; color:#666;">Sem condições</span>'}</div>
                    <div class="card-add-eff-row">
                        <select id="eff-name-${mob.id}">${effectOptions}</select>
                        <input type="number" id="eff-turns-${mob.id}" value="1" min="1" title="Turnos">
                        <button type="button" class="card-mini-btn" onclick="addCardEffect(${safeId})">＋</button>
                    </div>

                    <div class="calc-display" id="calc-disp-${mob.id}">${mob.calc || "0"}</div>

                    <div class="calc-grid">
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '7')">7</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '8')">8</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '9')">9</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '/')">/</button>
                        
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '4')">4</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '5')">5</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '6')">6</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '*')">x</button>
                        
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '1')">1</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '2')">2</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '3')">3</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '-')">-</button>
                        
                        <button type="button" class="calc-btn calc-op" onclick="clearCardCalc(${safeId})">C</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '0')">0</button>
                        <button type="button" class="calc-btn calc-op" style="background:#d8b467; color:#000;" onclick="evaluateCardCalc(${safeId})">=</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '+')">+</button>
                    </div>

                    <div class="card-dmg-heal-row">
                        <button type="button" class="btn-card-dmg" onclick="applyCardMath(${safeId}, true)">- DANO</button>
                        <button type="button" class="btn-card-heal" onclick="applyCardMath(${safeId}, false)">+ CURA</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    hand.innerHTML = `<div style="display:flex; flex-direction:column; width:100%;">${selectorStripHtml}<div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:nowrap; overflow-x:auto; padding-bottom:2px;">${cardsHtml}</div></div>`;

    refreshTabletopInitiativeWidget();
}

// Sobrescreve funções de manipulação de Card para suportar IDs string/number e sincronizar com Tabletop/Personagem
function jumpFromCardToMonsterSheet(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    if (card.charId) {
        activeCharacterId = card.charId;
        switchMainModule('character');
        return;
    }
    if (card.sourceRef && card.sourceRef.itemKey) {
        const { category, groupKey, itemKey } = card.sourceRef;
        jumpToCatalogEntity(category, groupKey, itemKey);
        return;
    }
    if (card.tokenId && typeof tabletopState !== 'undefined' && Array.isArray(tabletopState.tokens)) {
        const tok = tabletopState.tokens.find(t => String(t.id) === String(card.tokenId));
        if (tok && tok.category && tok.itemKey) {
            jumpToCatalogEntity(tok.category, tok.groupKey || '', tok.itemKey);
            return;
        }
    }
    showToast('Ficha vinculada não encontrada.');
}

function toggleCardCollapse(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    card.collapsed = !card.collapsed;
    saveLocalPersistence();
    renderCombatHand();
}

function removeCombatCard(cardId, event) {
    if (event) event.stopPropagation();
    combatCards = combatCards.filter(c => String(c.id) !== String(cardId));
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function appendCardCalc(id, val) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    mob.calc = String(mob.calc || '') + val;
    saveLocalPersistence();
    const disp = document.getElementById(`calc-disp-${mob.id}`);
    if (disp) disp.innerText = mob.calc || "0";
}

function clearCardCalc(id) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    mob.calc = "";
    saveLocalPersistence();
    const disp = document.getElementById(`calc-disp-${mob.id}`);
    if (disp) disp.innerText = "0";
}

function evaluateCardCalc(id) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob || !mob.calc) return;
    try {
        const clean = String(mob.calc).replace(/[^0-9+\-*/.()]/g, '');
        const total = Math.floor(Function('return (' + clean + ')')());
        mob.calc = String(total);
        saveLocalPersistence();
        const disp = document.getElementById(`calc-disp-${mob.id}`);
        if (disp) disp.innerText = mob.calc;
    } catch (e) {
        const disp = document.getElementById(`calc-disp-${mob.id}`);
        if (disp) disp.innerText = "Erro";
        mob.calc = "";
    }
}

function applyCardMath(id, isDamage) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (mob && mob.calc !== "") {
        try {
            const clean = String(mob.calc).replace(/[^0-9+\-*/.()]/g, '');
            let total = Math.floor(Function('return (' + clean + ')')());
            if (isNaN(total)) return;

            if (typeof CompendioModAPI !== 'undefined') {
                const modRes = CompendioModAPI.runHooks('onApplyDamage', { target: mob, amount: total, isDamage });
                if (modRes && typeof modRes.amount === 'number') total = modRes.amount;
            }

            const newHp = isDamage ? (mob.hp - total) : Math.min(mob.maxHp, mob.hp + total);
            mob.calc = "";
            syncCombatEntityHp(mob.id, newHp, mob.maxHp);
        } catch (e) {
            const disp = document.getElementById(`calc-disp-${mob.id}`);
            if (disp) disp.innerText = "Erro";
            mob.calc = "";
            saveLocalPersistence();
        }
    }
}

function addCardEffect(id) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    const effSelect = document.getElementById(`eff-name-${mob.id}`);
    const turnsInput = document.getElementById(`eff-turns-${mob.id}`);
    let name = effSelect ? effSelect.value : '';
    const turns = parseInt(turnsInput ? turnsInput.value : '1', 10);
    if (!name || isNaN(turns) || turns <= 0) return;
    if (name === "Custom") {
        name = prompt("Nome do efeito / condição:") || "Buff/Debuff";
    }
    if (!mob.effects) mob.effects = [];
    mob.effects.push({ name, turns });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function removeCardEffect(mobId, effIndex) {
    const mob = combatCards.find(m => String(m.id) === String(mobId));
    if (!mob) return;
    mob.effects.splice(effIndex, 1);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function setCardHp(id, field, value) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    const n = parseInt(value, 10);
    if (isNaN(n)) { renderCombatHand(); return; }
    if (field === 'max') {
        const newMax = Math.max(1, n);
        syncCombatEntityHp(mob.id, Math.min(mob.hp, newMax), newMax);
    } else {
        syncCombatEntityHp(mob.id, n, mob.maxHp);
    }
}

/* =========================================================================
   UNIFICAÇÃO DA TELA DE DADOS DE VIDA COM CHARACTERSDATA
   ========================================================================= */
function renderHitDiceScreen() {
    const listEl = document.getElementById('dynamic-item-list');
    const chars = (typeof charactersData !== 'undefined') ? charactersData : [];

    listEl.innerHTML = chars.map(c => {
        const hdCur = Number(c.hitDieCurrent ?? c.hitDieMax ?? 1);
        const hdMax = Number(c.hitDieMax || 1);
        const hdType = Number(c.hitDieType || 8);
        return `
            <li class="list-item" data-title="${escapeHtmlText(c.name.toLowerCase())}" onclick="focusHitDieCard('${c.id}')" title="Clique para saltar até este personagem">
                <span>🎲 ${escapeHtmlText(c.name)}</span>
                <span class="list-item-folder-badge">${hdCur}/${hdMax} d${hdType}</span>
            </li>
        `;
    }).join('') || '<li class="list-item" style="color:#828699;">Sem personagens</li>';

    const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { longRestHpPercent: 100, longRestHitDicePercent: 100 };

    const displayArea = document.getElementById('dynamic-display-area');
    displayArea.innerHTML = `
        <div class="info-container">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:2px groove var(--border-color); padding-bottom:10px; margin-bottom:14px;">
                <div>
                    <h2 class="info-title" style="margin:0; border:none; padding:0;">🎲 Controle Unificado de Dados de Vida & Descansos</h2>
                    <div style="font-size:11.5px; color:#a0a4b8; margin-top:3px;">
                        Sincronizado em tempo real com as Fichas de Personagem, Tokens do Tabletop e Regras Ativas (${rules.longRestHpPercent}% PV / +${rules.longRestHitDicePercent}% DV no Descanso Longo).
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="btn-summon-card" onclick="longRestAllCharacters()">🌙 Descanso Longo para o Grupo</button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                ${chars.map(c => {
                    const hdCur = Number(c.hitDieCurrent ?? c.hitDieMax ?? 1);
                    const hdMax = Number(c.hitDieMax || 1);
                    const hdType = Number(c.hitDieType || 8);
                    const conMod = calcAbilityMod(c.stats?.con || 10);
                    const lastRoll = c.lastHitDieRoll || 'Nenhuma rolagem recente';
                    return `
                        <div class="monster-card" id="hd-card-${c.id}" style="padding:14px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #7a2c26; padding-bottom:4px;">
                                <strong style="color:#6e1813; font-size:15px; cursor:pointer;" onclick="activeCharacterId='${c.id}'; switchMainModule('character');" title="Abrir Ficha Completa">${escapeHtmlText(c.name)} 🔗</strong>
                                <span style="font-weight:bold; font-size:12px;">d${hdType} (CON ${formatSigned(conMod)})</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin:8px 0;">
                                <span style="font-size:15px; font-weight:bold; color:#1f4d23;">
                                    DV: ${hdCur} / ${hdMax}
                                </span>
                                <span style="font-size:14px; font-weight:bold; color:#7a1f18;">
                                    ❤️ PV: ${c.hpCurrent} / ${c.hpMax}
                                </span>
                            </div>
                            <div style="font-size:12px; background:rgba(0,0,0,0.08); border-radius:4px; padding:5px; margin-bottom:8px;">
                                Último Descanso: <strong>${escapeHtmlText(lastRoll)}</strong>
                            </div>
                            <div style="display:flex; gap:4px;">
                                <button type="button" class="btn-summon-card" style="flex:2;" onclick="shortRestCharacter('${c.id}'); renderHitDiceScreen();">⛺ Gastar 1d${hdType}</button>
                                <button type="button" class="btn-action-bar" onclick="adjustCharacterHitDieCount('${c.id}', 1)" title="+1 Dado de Vida">+1</button>
                                <button type="button" class="btn-action-bar" onclick="adjustCharacterHitDieCount('${c.id}', -1)" title="-1 Dado de Vida">-1</button>
                                <button type="button" class="btn-action-bar" onclick="longRestCharacter('${c.id}'); renderHitDiceScreen();" title="Descanso Longo Individual">🌙</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function adjustCharacterHitDieCount(charId, delta) {
    const c = charactersData.find(x => x.id === charId);
    if (!c) return;
    const max = Math.max(1, Number(c.hitDieMax) || 1);
    const cur = Number(c.hitDieCurrent ?? max);
    c.hitDieCurrent = Math.min(max, Math.max(0, cur + delta));
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCharacters) {
        CompendioNetAdapter.broadcastCharacters();
    }
    renderHitDiceScreen();
}

function longRestAllCharacters() {
    if (typeof charactersData === 'undefined') return;
    charactersData.forEach(c => {
        longRestCharacter(c.id, true);
    });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCharacters) {
        CompendioNetAdapter.broadcastCharacters();
    }
    renderHitDiceScreen();
    showToast('🌙 Descanso Longo aplicado a todo o grupo!');
}
