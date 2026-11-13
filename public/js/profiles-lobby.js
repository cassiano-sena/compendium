/* =========================================================
   PERFIS DE JOGADOR, LOGIN VISUAL, MODO STREAMER & LOBBY MULTIPLAYER
   ========================================================= */

const STORAGE_KEY_DEVICE_ID = 'compendio_rpg_device_id_v1';
const STORAGE_KEY_STREAMER_MODE = 'compendio_rpg_streamer_mode_v1';

const PLAYER_COLOR_PALETTE = [
    '#d8b467', '#4fc3f7', '#81c784', '#e57373', '#ba68c8',
    '#ffb74d', '#4db6ac', '#f06292', '#9575cd', '#aed581'
];

const PLAYER_AVATAR_EMOJIS = [
    '👑', '🛡️', '⚔️', '🧙', '🏹', '🗡️',
    '🦊', '🐉', '🦉', '🐺', '🌿', '🔥'
];

const STREAMER_SAFE_CODENAMES = [
    'Sentinela Alpha', 'Arcano Bravo', 'Viajante Charlie', 'Lâmina Delta',
    'Guardião Echo', 'Sombra Foxtrot', 'Oráculo Golf', 'Batedor Hotel',
    'Paladino India', 'Bardo Juliet', 'Patrulheiro Kilo', 'Erudito Lima'
];

window.localDeviceId = window.localDeviceId || '';
window.isHostClient = window.isHostClient !== undefined ? window.isHostClient : true;
window.onlineRoomConfig = window.onlineRoomConfig || null;
window.onlinePlayersList = window.onlinePlayersList || [];
window.roomGateBlockState = window.roomGateBlockState || null;
window.streamerModeConfig = window.streamerModeConfig || {
    enabled: false,
    hidePlayerNames: true,
    hideNetworkAddresses: true,
    hideGmSecrets: true,
    aliases: {}
};

function getOrCreateDeviceId() {
    try {
        let id = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
        if (!id) {
            id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(STORAGE_KEY_DEVICE_ID, id);
        }
        window.localDeviceId = id;
        return id;
    } catch (e) {
        if (!window.localDeviceId) {
            window.localDeviceId = 'dev-' + Date.now().toString(36);
        }
        return window.localDeviceId;
    }
}

function getActiveRoomPasscode() {
    try {
        return sessionStorage.getItem('compendio_room_passcode') || '';
    } catch (e) {
        return window._tempRoomPasscode || '';
    }
}

function setActiveRoomPasscode(passcode) {
    const clean = String(passcode || '');
    window._tempRoomPasscode = clean;
    try {
        if (clean) sessionStorage.setItem('compendio_room_passcode', clean);
        else sessionStorage.removeItem('compendio_room_passcode');
    } catch (e) {}
}

function loadStreamerModeState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_STREAMER_MODE);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                Object.assign(window.streamerModeConfig, parsed);
                if (!window.streamerModeConfig.aliases || typeof window.streamerModeConfig.aliases !== 'object') {
                    window.streamerModeConfig.aliases = {};
                }
            }
        }
    } catch (e) {}
    applyStreamerBodyClasses();
}

function saveStreamerModeState() {
    try {
        localStorage.setItem(STORAGE_KEY_STREAMER_MODE, JSON.stringify(window.streamerModeConfig));
    } catch (e) {}
}

function applyStreamerBodyClasses() {
    if (typeof document === 'undefined' || !document.body) return;
    const enabled = Boolean(window.streamerModeConfig.enabled);
    document.body.classList.toggle('streamer-mode', enabled);
    document.body.classList.toggle('streamer-hide-secrets', enabled && window.streamerModeConfig.hideGmSecrets !== false);
}

function isStreamerModeEnabled() {
    return Boolean(window.streamerModeConfig && window.streamerModeConfig.enabled);
}

function ensurePlayerExtendedFields(player, idx = 0) {
    if (!player || typeof player !== 'object') return player;
    if (!player.color) {
        player.color = player.role === 'gm'
            ? '#d8b467'
            : PLAYER_COLOR_PALETTE[(idx + 1) % PLAYER_COLOR_PALETTE.length];
    }
    if (!player.avatarEmoji) {
        player.avatarEmoji = player.role === 'gm' ? '👑' : PLAYER_AVATAR_EMOJIS[(idx % (PLAYER_AVATAR_EMOJIS.length - 1)) + 1];
    }
    return player;
}

function ensureAllPlayersNormalized() {
    if (!Array.isArray(playersData)) return;
    playersData.forEach((p, idx) => ensurePlayerExtendedFields(p, idx));
}

function pickRandomCodename(usedSet) {
    const shuffled = [...STREAMER_SAFE_CODENAMES].sort(() => Math.random() - 0.5);
    for (const candidate of shuffled) {
        if (!usedSet.has(candidate)) return candidate;
    }
    return 'Agente #' + Math.floor(100 + Math.random() * 900);
}

function getStreamerAliasForKey(key, role = 'player') {
    if (!window.streamerModeConfig.aliases) window.streamerModeConfig.aliases = {};
    const map = window.streamerModeConfig.aliases;
    const safeKey = String(key || 'anon');
    if (map[safeKey]) return map[safeKey];

    const used = new Set(Object.values(map));
    const alias = role === 'gm'
        ? (used.has('Mestre Anônimo') ? 'Narrador Oculto' : 'Mestre Anônimo')
        : pickRandomCodename(used);
    map[safeKey] = alias;
    saveStreamerModeState();
    return alias;
}

function rerollStreamerAliases(notify = false) {
    const newMap = {};
    const used = new Set();
    if (Array.isArray(playersData)) {
        playersData.forEach(p => {
            const alias = p.role === 'gm'
                ? 'Mestre Anônimo'
                : pickRandomCodename(used);
            used.add(alias);
            newMap[p.id] = alias;
        });
    }
    if (Array.isArray(window.onlinePlayersList)) {
        window.onlinePlayersList.forEach(op => {
            const key = op.playerId || op.clientId;
            if (!key || newMap[key]) return;
            const alias = op.role === 'gm' ? 'Mestre Anônimo' : pickRandomCodename(used);
            used.add(alias);
            newMap[key] = alias;
        });
    }
    window.streamerModeConfig.aliases = newMap;
    saveStreamerModeState();
    refreshAllIdentityAndTabletopViews();
    if (notify && typeof showToast === 'function') {
        showToast('🎲 Codinomes do Modo Streamer sorteados novamente!');
    }
}

function getPlayerRecordById(playerOrId) {
    if (playerOrId && typeof playerOrId === 'object') return playerOrId;
    if (!playerOrId) return null;
    if (Array.isArray(playersData)) {
        const found = playersData.find(p => p.id === playerOrId);
        if (found) return found;
    }
    if (Array.isArray(window.onlinePlayersList)) {
        const online = window.onlinePlayersList.find(op => op.playerId === playerOrId || op.clientId === playerOrId);
        if (online) {
            return {
                id: online.playerId || online.clientId,
                name: online.playerName,
                role: online.role,
                color: online.color,
                avatarEmoji: online.avatarEmoji
            };
        }
    }
    return null;
}

function getPlayerDisplayName(playerOrId, fallbackName = 'Jogador') {
    const rec = getPlayerRecordById(playerOrId);
    const idKey = rec ? (rec.id || rec.playerId || rec.clientId) : (typeof playerOrId === 'string' ? playerOrId : 'anon');
    const role = rec?.role || 'player';
    const realName = (rec && (rec.name || rec.playerName)) || fallbackName;

    if (isStreamerModeEnabled() && window.streamerModeConfig.hidePlayerNames !== false) {
        return getStreamerAliasForKey(idKey, role);
    }
    return realName;
}

function getPlayerColor(playerOrId) {
    const rec = getPlayerRecordById(playerOrId);
    if (rec && rec.color) return rec.color;
    return '#d8b467';
}

function getPlayerAvatar(playerOrId) {
    const rec = getPlayerRecordById(playerOrId);
    if (rec && rec.avatarEmoji) return rec.avatarEmoji;
    return rec?.role === 'gm' ? '👑' : '🛡️';
}

function maskSensitiveNetworkText(rawText) {
    const text = String(rawText || '');
    if (!text) return '•••.•••.•••.•••';
    const portMatch = text.match(/:(\d{2,5})/);
    const hasProto = /^https?:\/\//i.test(text);
    const portSuffix = portMatch ? `:${portMatch[1]}` : '';
    return (hasProto ? 'http://' : '') + '•••.•••.•••.•••' + portSuffix;
}

function toggleStreamerMode(forceState = null, optionKey = null) {
    if (optionKey) {
        window.streamerModeConfig[optionKey] = forceState !== null ? Boolean(forceState) : !window.streamerModeConfig[optionKey];
    } else {
        const nextVal = forceState !== null ? Boolean(forceState) : !isStreamerModeEnabled();
        window.streamerModeConfig.enabled = nextVal;
        if (nextVal && Object.keys(window.streamerModeConfig.aliases || {}).length === 0) {
            rerollStreamerAliases(false);
        }
    }
    saveStreamerModeState();
    applyStreamerBodyClasses();
    refreshAllIdentityAndTabletopViews();

    if (!optionKey && typeof showToast === 'function') {
        showToast(
            isStreamerModeEnabled()
                ? '📺 Modo Streamer ATIVO — IPs e nomes protegidos!'
                : '👁️ Modo Streamer desativado.'
        );
    }
}

function refreshAllIdentityAndTabletopViews() {
    ensureAllPlayersNormalized();
    if (typeof renderPlayerIdentitySelector === 'function') renderPlayerIdentitySelector();
    if (typeof CompendioDice !== 'undefined' && CompendioDice.renderWidget) CompendioDice.renderWidget();
    if (typeof activeModule !== 'undefined') {
        if (activeModule === 'character' && typeof renderCharacterModule === 'function') renderCharacterModule();
        else if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
        else if (typeof renderCombatHand === 'function') renderCombatHand();
    }
    if (document.getElementById('profiles-lobby-backdrop')?.classList.contains('open')) {
        renderProfileManagerModal(window._activeProfileTab || 'login');
    }
    if (document.getElementById('multiplayer-room-backdrop')?.classList.contains('open')) {
        renderMultiplayerRoomModal(window._activeRoomTab || 'room');
    }
}

function updateSidebarIdentityAndRoomUI() {
    const activeP = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    const colorDot = document.getElementById('active-player-color-dot');
    if (colorDot && activeP) {
        colorDot.style.background = getPlayerColor(activeP);
    }

    const streamerBtn = document.getElementById('streamer-mode-toggle-btn');
    if (streamerBtn) {
        const on = isStreamerModeEnabled();
        streamerBtn.classList.toggle('active', on);
        streamerBtn.innerHTML = on ? '📺 Streamer: ON' : '📺 Modo Streamer';
    }

    const roomBtn = document.getElementById('room-online-pill-btn');
    if (roomBtn) {
        const rc = window.onlineRoomConfig;
        const count = Array.isArray(window.onlinePlayersList) ? window.onlinePlayersList.length : 0;
        const maxP = rc?.maxPlayers || 8;
        let stateIcon = '🟢';
        let label = `Sala (${count}/${maxP})`;
        if (rc && !rc.isOpen) {
            stateIcon = '🔴';
            label = 'Sala Fechada';
        } else if (rc && rc.isLocked) {
            stateIcon = '🔒';
            label = `Trancada (${count}/${maxP})`;
        } else if (!serverWritable) {
            stateIcon = '📡';
            label = 'Entrar / Online';
        }
        roomBtn.innerHTML = `<span>${stateIcon} ${escapeHtmlText(label)}</span><span class="room-pill-sub">${rc?.hasPasscode ? '🔑' : '🌐'}</span>`;
    }
}

function ensureSafeInitialProfileForClient() {
    ensureAllPlayersNormalized();
    const rc = window.onlineRoomConfig;
    if (window.isHostClient) return;
    if (rc && rc.blockRemoteGm === false) return;

    const current = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    if (!current || current.role === 'gm' || current.id === 'gm-master') {
        const nonGm = (playersData || []).find(p => p.role !== 'gm' && !p.pin && !p.hasPin);
        if (nonGm) {
            activePlayerId = nonGm.id;
            if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
        } else {
            const firstPlayer = (playersData || []).find(p => p.role !== 'gm');
            if (firstPlayer) activePlayerId = firstPlayer.id;
        }
        renderPlayerIdentitySelector();
        if (typeof CompendioNetAdapter !== 'undefined' && typeof CompendioNetAdapter.sendPresenceUpdate === 'function') {
            CompendioNetAdapter.sendPresenceUpdate();
        }
        if (typeof refreshCompendiumViewAfterSync === 'function') {
            refreshCompendiumViewAfterSync({ catalogChanged: true, knowledgeChanged: true });
        } else if (typeof activeModule !== 'undefined') {
            if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
            else if (activeModule === 'character' && typeof renderCharacterModule === 'function') renderCharacterModule();
        }
        if (!window._promptedRemoteProfileOnce) {
            window._promptedRemoteProfileOnce = true;
            setTimeout(() => {
                if (!window.roomGateBlockState) openProfileManagerModal('login');
            }, 350);
        }
    }
}

/* =========================================================
   AUTENTICAÇÃO VISUAL & OPERAÇÕES DE PERFIL / PERSONAGEM
   ========================================================= */

function switchProfileImmediately(newPlayerId) {
    const p = (playersData || []).find(x => x.id === newPlayerId);
    if (!p) return false;
    if (!window.isHostClient && (window.onlineRoomConfig?.blockRemoteGm !== false) && p.role === 'gm') {
        showToast('🛡️ Acesso Mestre (GM) bloqueado para dispositivos remotos nesta sala.');
        return false;
    }

    activePlayerId = newPlayerId;
    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    renderPlayerIdentitySelector();

    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.sendPresenceUpdate) {
        CompendioNetAdapter.sendPresenceUpdate();
    }

    if (activeModule === 'character') renderCharacterModule();
    else if (activeModule === 'tabletop') renderTabletopModule();
    else {
        if (currentCategory === 'session' && p.role !== 'gm') {
            currentCategory = 'monsters';
        }
        navigateCategory(currentCategory, document.querySelector(`.sidebar .nav-item[data-cat="${currentCategory}"]`));
    }
    showToast(`👤 Perfil ativo: ${getPlayerDisplayName(p)}`);
    return true;
}

function submitProfilePinLogin(targetPlayerId) {
    const input = document.getElementById('profile-pin-verify-input');
    const errEl = document.getElementById('profile-pin-error-msg');
    if (!input) return;
    const entered = input.value;
    const p = (playersData || []).find(x => x.id === targetPlayerId);
    if (!p) return;

    if (p.pin && entered !== p.pin) {
        if (errEl) {
            errEl.textContent = '❌ PIN incorreto. Tente novamente.';
            errEl.style.display = 'block';
        }
        input.focus();
        return;
    }
    window._pendingPinTargetId = null;
    if (switchProfileImmediately(targetPlayerId)) {
        closeProfileManagerModal();
    }
}

function cancelProfilePinLogin() {
    window._pendingPinTargetId = null;
    renderProfileManagerModal(window._activeProfileTab || 'login');
    renderPlayerIdentitySelector();
}

function requestSwitchToProfile(newPlayerId) {
    const p = (playersData || []).find(x => x.id === newPlayerId);
    if (!p) return;
    if (!window.isHostClient && (window.onlineRoomConfig?.blockRemoteGm !== false) && p.role === 'gm') {
        showToast('🛡️ Perfil de Mestre restrito ao computador Host.');
        renderPlayerIdentitySelector();
        return;
    }

    if (p.pin && p.id !== activePlayerId) {
        window._pendingPinTargetId = p.id;
        openProfileManagerModal('login');
        setTimeout(() => document.getElementById('profile-pin-verify-input')?.focus(), 40);
        return;
    }

    if (!window.isHostClient && p.hasPin && !p.pin) {
        showToast('🔐 Perfil protegido por PIN do Host.');
    }

    if (switchProfileImmediately(newPlayerId)) {
        if (document.getElementById('profiles-lobby-backdrop')?.classList.contains('open')) {
            renderProfileManagerModal(window._activeProfileTab || 'login');
        }
    }
}

function saveEditedPlayerProfile(playerId) {
    const p = (playersData || []).find(x => x.id === playerId);
    if (!p) return;

    const nameEl = document.getElementById('edit-profile-name-input');
    const colorEl = document.getElementById('edit-profile-color-input');
    const avatarEl = document.getElementById('edit-profile-avatar-input');
    const oldPinEl = document.getElementById('edit-profile-old-pin');
    const newPinEl = document.getElementById('edit-profile-new-pin');

    const nextName = (nameEl?.value || '').trim();
    if (!nextName) {
        showToast('❌ O nome do jogador não pode ficar vazio.');
        return;
    }

    const oldPinVal = oldPinEl ? oldPinEl.value : '';
    const newPinVal = newPinEl ? newPinEl.value.trim() : undefined;

    if (p.pin && newPinVal !== undefined && newPinVal !== '' && oldPinVal !== p.pin) {
        showToast('❌ PIN atual incorreto para alterar a senha do perfil.');
        return;
    }
    if (p.pin && newPinVal === '' && oldPinVal !== p.pin) {
        showToast('❌ Digite o PIN atual para remover a proteção por PIN.');
        return;
    }

    const oldName = p.name;
    p.name = nextName.slice(0, 40);
    if (colorEl?.value) p.color = colorEl.value;
    if (avatarEl?.value) p.avatarEmoji = avatarEl.value;
    if (newPinVal !== undefined && (oldPinEl || !p.pin)) {
        p.pin = newPinVal;
    }

    // Propaga novo nome de jogador em todas as fichas e presença online
    if (Array.isArray(charactersData)) {
        charactersData.forEach(c => {
            if (c.ownerId === p.id) c.ownerName = p.name;
        });
    }
    if (Array.isArray(window.onlinePlayersList)) {
        window.onlinePlayersList.forEach(op => {
            if (op.playerId === p.id) {
                op.playerName = p.name;
                op.color = p.color;
                op.avatarEmoji = p.avatarEmoji;
            }
        });
    }

    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.broadcastCharacters) CompendioNetAdapter.broadcastCharacters();
        if (CompendioNetAdapter.sendPresenceUpdate) CompendioNetAdapter.sendPresenceUpdate();
        if (CompendioNetAdapter.syncServerSession) CompendioNetAdapter.syncServerSession();
    }

    refreshAllIdentityAndTabletopViews();
    const labelAfter = isStreamerModeEnabled() ? getPlayerDisplayName(p) : p.name;
    showToast(oldName !== p.name
        ? `✅ Perfil atualizado para "${labelAfter}" (fichas sincronizadas)!`
        : `✅ Aparência e configurações salvas para "${labelAfter}"!`
    );
}

function createNewPlayerProfileFromForm() {
    if (!window.isHostClient && window.onlineRoomConfig && window.onlineRoomConfig.allowSelfProfileCreate === false) {
        showToast('🔒 O Mestre desativou a criação de novos perfis por convidados.');
        return;
    }
    const nameEl = document.getElementById('new-profile-name-input');
    const pinEl = document.getElementById('new-profile-pin-input');
    const colorEl = document.getElementById('new-profile-color-input');
    const avatarEl = document.getElementById('new-profile-avatar-input');
    const roleEl = document.getElementById('new-profile-role-select');

    const cleanName = (nameEl?.value || '').trim();
    if (!cleanName) {
        showToast('❌ Informe um nome para criar o perfil.');
        nameEl?.focus();
        return;
    }

    const canCreateGm = window.isHostClient && getActivePlayer()?.role === 'gm';
    const role = (canCreateGm && roleEl?.value === 'gm') ? 'gm' : 'player';
    const id = 'player-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);

    const newPlayer = ensurePlayerExtendedFields({
        id,
        name: cleanName.slice(0, 40),
        role,
        pin: (pinEl?.value || '').trim(),
        color: colorEl?.value || PLAYER_COLOR_PALETTE[playersData.length % PLAYER_COLOR_PALETTE.length],
        avatarEmoji: avatarEl?.value || (role === 'gm' ? '👑' : '🛡️'),
        authKey: 'local-' + id
    }, playersData.length);

    playersData.push(newPlayer);
    activePlayerId = id;

    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.syncServerSession) CompendioNetAdapter.syncServerSession();
        if (CompendioNetAdapter.sendPresenceUpdate) CompendioNetAdapter.sendPresenceUpdate();
    }

    refreshAllIdentityAndTabletopViews();
    window._editingProfileId = id;
    renderProfileManagerModal('edit');
    showToast(`✅ Conta "${getPlayerDisplayName(newPlayer)}" criada e conectada!`);
}

function startDeletePlayerProfile(playerId) {
    const p = (playersData || []).find(x => x.id === playerId);
    if (!p) return;
    if (p.role === 'gm' && playersData.filter(x => x.role === 'gm').length <= 1) {
        showToast('🛡️ Não é possível remover o último perfil de Mestre (GM).');
        return;
    }
    window._confirmDeleteProfileId = playerId;
    renderProfileManagerModal('manage');
}

function confirmDeletePlayerProfile(playerId, charMode = 'reassign_gm') {
    const target = (playersData || []).find(x => x.id === playerId);
    if (!target) return;
    if (target.role === 'gm' && playersData.filter(x => x.role === 'gm').length <= 1) {
        showToast('🛡️ Não é possível excluir o único Mestre da mesa.');
        return;
    }

    const fallbackGm = (playersData || []).find(x => x.id !== playerId && x.role === 'gm')
        || (playersData || []).find(x => x.id !== playerId);

    if (Array.isArray(charactersData)) {
        if (charMode === 'delete_chars') {
            const removedIds = new Set(charactersData.filter(c => c.ownerId === playerId).map(c => c.id));
            charactersData = charactersData.filter(c => c.ownerId !== playerId);
            if (tabletopState && Array.isArray(tabletopState.tokens)) {
                tabletopState.tokens = tabletopState.tokens.filter(t => !removedIds.has(t.itemKey) && t.ownerId !== playerId);
            }
            if (removedIds.has(activeCharacterId)) activeCharacterId = charactersData[0]?.id || null;
        } else if (fallbackGm) {
            charactersData.forEach(c => {
                if (c.ownerId === playerId) {
                    c.ownerId = fallbackGm.id;
                    c.ownerName = fallbackGm.name;
                }
            });
            if (tabletopState && Array.isArray(tabletopState.tokens)) {
                tabletopState.tokens.forEach(t => {
                    if (t.ownerId === playerId) t.ownerId = fallbackGm.id;
                });
            }
        }
    }

    playersData = playersData.filter(x => x.id !== playerId);
    window._confirmDeleteProfileId = null;

    if (activePlayerId === playerId) {
        const nextAllowed = (!window.isHostClient && (window.onlineRoomConfig?.blockRemoteGm !== false))
            ? playersData.find(x => x.role !== 'gm')
            : (fallbackGm || playersData[0]);
        activePlayerId = nextAllowed ? nextAllowed.id : (playersData[0]?.id || 'gm-master');
    }

    if (window._editingProfileId === playerId) {
        window._editingProfileId = activePlayerId;
    }

    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.broadcastCharacters) CompendioNetAdapter.broadcastCharacters();
        if (CompendioNetAdapter.broadcastTabletop) CompendioNetAdapter.broadcastTabletop();
        if (CompendioNetAdapter.sendPresenceUpdate) CompendioNetAdapter.sendPresenceUpdate();
    }

    refreshAllIdentityAndTabletopViews();
    showToast(`🗑️ Perfil "${getPlayerDisplayName(target)}" removido.`);
}

function createQuickCharacterForProfile(playerId) {
    const owner = (playersData || []).find(x => x.id === playerId);
    if (!owner) return;

    const nameEl = document.getElementById('quick-char-name-input');
    const classEl = document.getElementById('quick-char-class-input');
    const raceEl = document.getElementById('quick-char-race-input');

    const charName = (nameEl?.value || '').trim();
    if (!charName) {
        showToast('❌ Digite o nome do personagem.');
        nameEl?.focus();
        return;
    }

    const clsLabel = (classEl?.value || 'Aventureiro').trim();
    const newId = 'char-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
    const newChar = {
        id: newId,
        ownerId: owner.id,
        ownerName: owner.name,
        name: charName,
        classLevel: `${clsLabel} 1`,
        race: (raceEl?.value || 'Humano').trim(),
        hpCurrent: 12,
        hpMax: 12,
        ac: 14,
        speed: '9m / 30ft',
        initiativeBonus: 2,
        hitDieType: 'd10',
        hitDieMax: 1,
        hitDieCurrent: 1,
        stats: { str: 14, dex: 14, con: 13, int: 10, wis: 12, cha: 10 },
        skills: ['Percepção', 'Atletismo'],
        attacks: [{ name: 'Ataque Principal', bonus: '+4', damage: '1d8+2', type: 'Cortante' }],
        inventory: ['Kit de Aventureiro', 'Poção de Cura'],
        notes: ''
    };
    if (typeof ensureCharacterExtendedFields === 'function') ensureCharacterExtendedFields(newChar);
    charactersData.push(newChar);
    activeCharacterId = newId;

    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCharacters) {
        CompendioNetAdapter.broadcastCharacters();
    }
    refreshAllIdentityAndTabletopViews();
    showToast(`🛡️ Ficha "${charName}" criada para ${getPlayerDisplayName(owner)}!`);
}

function removeCharacterFromProfileModal(charId) {
    const ch = (charactersData || []).find(c => c.id === charId);
    if (!ch) return;
    if (typeof CompendioNetAdapter !== 'undefined' && !CompendioNetAdapter.canControlEntity(ch.ownerId)) {
        showToast('🔒 Apenas o dono da ficha ou o Mestre pode removê-la.');
        return;
    }
    charactersData = charactersData.filter(c => c.id !== charId);
    if (tabletopState && Array.isArray(tabletopState.tokens)) {
        tabletopState.tokens = tabletopState.tokens.filter(t => t.itemKey !== charId);
    }
    if (activeCharacterId === charId) {
        const own = charactersData.find(c => c.ownerId === activePlayerId);
        activeCharacterId = own ? own.id : (charactersData[0]?.id || null);
    }
    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.broadcastCharacters) CompendioNetAdapter.broadcastCharacters();
        if (CompendioNetAdapter.broadcastTabletop) CompendioNetAdapter.broadcastTabletop();
    }
    refreshAllIdentityAndTabletopViews();
    showToast(`🗑️ Personagem "${ch.name}" removido.`);
}

function openCharacterFromProfileModal(charId) {
    activeCharacterId = charId;
    closeProfileManagerModal();
    if (typeof switchMainModule === 'function') switchMainModule('character');
}

/* =========================================================
   UI DO MODAL: PERFIS, LOGIN, EDIÇÃO DE NOME E PERSONAGENS
   ========================================================= */

function openProfileManagerModal(tab = 'login') {
    ensureAllPlayersNormalized();
    window._activeProfileTab = tab || 'login';
    if (!window._editingProfileId) window._editingProfileId = activePlayerId;
    const backdrop = document.getElementById('profiles-lobby-backdrop');
    if (backdrop) {
        renderProfileManagerModal(window._activeProfileTab);
        backdrop.classList.add('open');
    }
}

function closeProfileManagerModal() {
    window._pendingPinTargetId = null;
    window._confirmDeleteProfileId = null;
    document.getElementById('profiles-lobby-backdrop')?.classList.remove('open');
}

function renderProfileManagerModal(tab = 'login') {
    window._activeProfileTab = tab;
    const container = document.getElementById('profiles-lobby-modal-content');
    if (!container) return;

    ensureAllPlayersNormalized();
    const activeP = typeof getActivePlayer === 'function' ? getActivePlayer() : playersData[0];
    const streamerOn = isStreamerModeEnabled();
    const remoteGmBlocked = !window.isHostClient && (window.onlineRoomConfig?.blockRemoteGm !== false);
    const canSelfCreate = window.isHostClient || !window.onlineRoomConfig || window.onlineRoomConfig.allowSelfProfileCreate !== false;

    const tabsHtml = `
        <div class="rules-modal-tabs">
            <button type="button" class="rules-tab-btn ${tab === 'login' ? 'active' : ''}" onclick="renderProfileManagerModal('login')">🔐 Entrar / Trocar Perfil</button>
            <button type="button" class="rules-tab-btn ${tab === 'edit' ? 'active' : ''}" onclick="window._editingProfileId=activePlayerId; renderProfileManagerModal('edit')">✏️ Editar Perfil & Fichas</button>
            <button type="button" class="rules-tab-btn ${tab === 'manage' ? 'active' : ''}" onclick="renderProfileManagerModal('manage')">👥 Criar / Remover Contas</button>
        </div>
    `;

    let bodyHtml = '';

    if (tab === 'login') {
        const onlineIds = new Set((window.onlinePlayersList || []).map(op => op.playerId));
        const pinPromptHtml = window._pendingPinTargetId ? (() => {
            const target = (playersData || []).find(x => x.id === window._pendingPinTargetId);
            if (!target) return '';
            return `
                <div class="pin-login-gate-box">
                    <div style="font-weight:bold; color:var(--accent-gold); margin-bottom:6px;">
                        🔐 Digite o PIN de "${escapeHtmlText(getPlayerDisplayName(target))}"
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <input type="password" id="profile-pin-verify-input" class="form-input" style="max-width:220px;" placeholder="PIN de acesso..." onkeydown="if(event.key==='Enter') submitProfilePinLogin('${escapeHtmlText(target.id)}')">
                        <button type="button" class="btn-summon-card" style="padding:7px 14px;" onclick="submitProfilePinLogin('${escapeHtmlText(target.id)}')">Entrar</button>
                        <button type="button" class="btn-mini" onclick="cancelProfilePinLogin()">Cancelar</button>
                    </div>
                    <div id="profile-pin-error-msg" style="color:#ff7b7b; font-size:12px; margin-top:6px; display:none;"></div>
                </div>
            `;
        })() : '';

        bodyHtml = `
            ${streamerOn ? `<div class="streamer-warning-banner">📺 <strong>Modo Streamer Ativo:</strong> nomes reais dos jogadores aparecem como codinomes aleatórios na interface.</div>` : ''}
            ${pinPromptHtml}
            <div class="profile-cards-grid">
                ${(playersData || []).map(p => {
                    const isActive = p.id === activePlayerId;
                    const isOnline = onlineIds.has(p.id);
                    const isLockedGm = remoteGmBlocked && p.role === 'gm';
                    const charCount = (charactersData || []).filter(c => c.ownerId === p.id).length;
                    const pColor = getPlayerColor(p);
                    const displayName = getPlayerDisplayName(p);
                    return `
                        <div class="profile-select-card ${isActive ? 'is-active' : ''} ${isLockedGm ? 'is-disabled' : ''}" style="border-left:4px solid ${escapeHtmlText(pColor)};">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                                <div style="display:flex; align-items:center; gap:9px;">
                                    <div class="profile-avatar-badge" style="background:${escapeHtmlText(pColor)}22; border-color:${escapeHtmlText(pColor)};">${escapeHtmlText(getPlayerAvatar(p))}</div>
                                    <div>
                                        <div style="font-weight:bold; font-size:14px; color:#f0e6d2;">${escapeHtmlText(displayName)}</div>
                                        <div style="font-size:11px; color:#9da3b8; display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
                                            <span>${p.role === 'gm' ? '👑 Mestre (GM)' : '🎮 Jogador'}</span>
                                            <span>• ${charCount} ficha(s)</span>
                                            ${p.pin || p.hasPin ? '<span>🔒 PIN</span>' : ''}
                                            ${isOnline ? '<span style="color:#66d98e;">● Online</span>' : ''}
                                        </div>
                                    </div>
                                </div>
                                ${isActive ? '<span class="profile-active-chip">Ativo</span>' : ''}
                            </div>
                            <div style="display:flex; gap:6px; margin-top:10px;">
                                ${isLockedGm
                                    ? `<button type="button" class="btn-mini" style="flex:1; opacity:0.65; cursor:not-allowed;" disabled title="Por segurança, o Mestre só entra no computador Host.">🛡️ Restrito ao Host</button>`
                                    : `<button type="button" class="${isActive ? 'btn-mini' : 'btn-summon-card'}" style="flex:1; padding:6px 10px; font-size:12px;" onclick="requestSwitchToProfile('${escapeHtmlText(p.id)}')">${isActive ? '✓ Selecionado' : (p.pin ? '🔐 Desbloquear & Entrar' : 'Entrar neste Perfil')}</button>`
                                }
                                ${!isLockedGm ? `<button type="button" class="btn-mini" onclick="window._editingProfileId='${escapeHtmlText(p.id)}'; renderProfileManagerModal('edit')" title="Editar nome, cor e fichas">✏️</button>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            ${canSelfCreate ? `
                <div style="margin-top:14px; padding-top:12px; border-top:1px solid #303445; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:12px; color:#9da3b8;">Novo na mesa? Crie sua conta de jogador com cor própria em segundos.</span>
                    <button type="button" class="btn-summon-card" style="padding:7px 14px;" onclick="renderProfileManagerModal('manage')">＋ Criar Minha Conta de Jogador</button>
                </div>
            ` : ''}
        `;
    } else if (tab === 'edit') {
        const editId = window._editingProfileId || activePlayerId;
        const target = (playersData || []).find(x => x.id === editId) || activeP;
        const canEditTarget = target && (window.isHostClient || !remoteGmBlocked || target.role !== 'gm') && (activeP?.role === 'gm' || target.id === activePlayerId);
        const ownedChars = (charactersData || []).filter(c => c.ownerId === target.id);
        const pColor = getPlayerColor(target);

        bodyHtml = `
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
                <span style="font-size:12px; color:#a0a4b8;">Editando perfil:</span>
                <select class="identity-select" style="max-width:260px;" onchange="window._editingProfileId=this.value; renderProfileManagerModal('edit')">
                    ${(playersData || []).filter(p => !remoteGmBlocked || p.role !== 'gm').map(p => `
                        <option value="${escapeHtmlText(p.id)}" ${p.id === target.id ? 'selected' : ''}>${escapeHtmlText(getPlayerAvatar(p))} ${escapeHtmlText(getPlayerDisplayName(p))}</option>
                    `).join('')}
                </select>
            </div>
            ${!canEditTarget ? `<div class="streamer-warning-banner">🔒 Você só pode editar seu próprio perfil (ou qualquer jogador se estiver como Mestre).</div>` : `
                <div class="lobby-section-card">
                    <div class="lobby-form-grid">
                        <div>
                            <label class="lobby-label">Nome do Jogador ${streamerOn ? '(oculto no Modo Streamer)' : ''}</label>
                            <input type="${streamerOn ? 'password' : 'text'}" id="edit-profile-name-input" class="form-input" value="${escapeHtmlText(target.name || '')}" maxlength="40" placeholder="Seu nome ou apelido na mesa">
                        </div>
                        <div>
                            <label class="lobby-label">Cor Indicativa (Tabletop & Pings)</label>
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <input type="color" id="edit-profile-color-input" value="${escapeHtmlText(pColor)}" style="width:38px; height:32px; border:1px solid #444960; background:#15161c; border-radius:4px; cursor:pointer;">
                                ${PLAYER_COLOR_PALETTE.map(hex => `
                                    <button type="button" class="color-swatch-btn ${pColor.toLowerCase() === hex ? 'selected' : ''}" style="background:${hex};" onclick="document.getElementById('edit-profile-color-input').value='${hex}'"></button>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="lobby-form-grid" style="margin-top:10px;">
                        <div>
                            <label class="lobby-label">Ícone / Avatar</label>
                            <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
                                <input type="hidden" id="edit-profile-avatar-input" value="${escapeHtmlText(getPlayerAvatar(target))}">
                                ${PLAYER_AVATAR_EMOJIS.map(em => `
                                    <button type="button" class="emoji-pick-btn ${getPlayerAvatar(target) === em ? 'selected' : ''}" onclick="document.getElementById('edit-profile-avatar-input').value='${em}'; this.parentElement.querySelectorAll('.emoji-pick-btn').forEach(b=>b.classList.remove('selected')); this.classList.add('selected');">${em}</button>
                                `).join('')}
                            </div>
                        </div>
                        <div>
                            <label class="lobby-label">PIN de Segurança ${target.pin ? '(🔒 Ativo)' : '(Sem PIN)'}</label>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                ${target.pin ? `<input type="password" id="edit-profile-old-pin" class="form-input" style="flex:1; min-width:110px;" placeholder="PIN atual...">` : ''}
                                <input type="password" id="edit-profile-new-pin" class="form-input" style="flex:1; min-width:120px;" placeholder="${target.pin ? 'Novo PIN (vazio remove)' : 'Definir novo PIN (opcional)'}">
                            </div>
                        </div>
                    </div>

                    <div style="margin-top:12px; display:flex; justify-content:flex-end;">
                        <button type="button" class="btn-summon-card" style="padding:8px 16px;" onclick="saveEditedPlayerProfile('${escapeHtmlText(target.id)}')">💾 Salvar Alterações do Perfil</button>
                    </div>
                </div>
            `}

            <div class="lobby-section-card" style="margin-top:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <h4 style="margin:0; color:var(--accent-gold); font-size:13px;">🛡️ Personagens de ${escapeHtmlText(getPlayerDisplayName(target))} (${ownedChars.length})</h4>
                    <button type="button" class="btn-mini" onclick="document.getElementById('universal-sheet-import-input')?.click()">📥 Importar JSON / PDF</button>
                </div>
                ${ownedChars.length === 0
                    ? `<div style="font-size:12px; color:#8b90a8; margin-bottom:10px;">Nenhum personagem vinculado a este perfil ainda.</div>`
                    : `<div class="profile-char-list">
                        ${ownedChars.map(c => `
                            <div class="profile-char-row">
                                <div>
                                    <strong style="color:#f0e6d2;">${escapeHtmlText(c.name)}</strong>
                                    <span style="font-size:11px; color:#9da3b8; margin-left:6px;">${escapeHtmlText(c.classLevel || c.className || 'Aventureiro')} • PV ${c.hpCurrent ?? c.hp?.current ?? 0}/${c.hpMax ?? c.hp?.max ?? 0}</span>
                                </div>
                                <div style="display:flex; gap:5px;">
                                    <button type="button" class="btn-mini" onclick="openCharacterFromProfileModal('${escapeHtmlText(c.id)}')">📜 Abrir Ficha</button>
                                    <button type="button" class="btn-mini btn-danger" onclick="removeCharacterFromProfileModal('${escapeHtmlText(c.id)}')" title="Excluir ficha">🗑️</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>`
                }
                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:10px; padding-top:10px; border-top:1px solid #2b2f3f;">
                    <input type="text" id="quick-char-name-input" class="form-input" style="flex:2; min-width:140px;" placeholder="Nome do novo personagem...">
                    <input type="text" id="quick-char-class-input" class="form-input" style="flex:1; min-width:100px;" placeholder="Classe (ex: Mago)">
                    <input type="text" id="quick-char-race-input" class="form-input" style="flex:1; min-width:90px;" placeholder="Raça (ex: Elfo)">
                    <button type="button" class="btn-summon-card" style="padding:7px 12px;" onclick="createQuickCharacterForProfile('${escapeHtmlText(target.id)}')">＋ Criar Ficha</button>
                </div>
            </div>
        `;
    } else {
        const canCreateGm = window.isHostClient && activeP?.role === 'gm';
        bodyHtml = `
            <div class="lobby-section-card">
                <h4 style="margin:0 0 10px 0; color:var(--accent-gold); font-size:13px;">＋ Cadastrar Novo Perfil / Jogador</h4>
                ${!canSelfCreate ? `<div class="streamer-warning-banner">🔒 Criação livre de perfis desativada pelo Mestre nesta sala.</div>` : `
                    <div class="lobby-form-grid">
                        <div>
                            <label class="lobby-label">Nome do Jogador</label>
                            <input type="text" id="new-profile-name-input" class="form-input" placeholder="Ex: Bruno, Sofia, Kael..." maxlength="40">
                        </div>
                        <div>
                            <label class="lobby-label">PIN de Acesso (Opcional)</label>
                            <input type="password" id="new-profile-pin-input" class="form-input" placeholder="Deixe vazio para sem PIN" maxlength="32">
                        </div>
                        <div>
                            <label class="lobby-label">Cor no Tabletop</label>
                            <input type="color" id="new-profile-color-input" value="${PLAYER_COLOR_PALETTE[playersData.length % PLAYER_COLOR_PALETTE.length]}" style="width:100%; height:34px; border:1px solid #444960; background:#15161c; border-radius:4px; cursor:pointer;">
                        </div>
                        <div>
                            <label class="lobby-label">Avatar & Papel</label>
                            <div style="display:flex; gap:6px;">
                                <select id="new-profile-avatar-input" class="identity-select" style="width:70px;">
                                    ${PLAYER_AVATAR_EMOJIS.map((em, i) => `<option value="${em}" ${i === 1 ? 'selected' : ''}>${em}</option>`).join('')}
                                </select>
                                <select id="new-profile-role-select" class="identity-select" style="flex:1;">
                                    <option value="player">🎮 Jogador</option>
                                    ${canCreateGm ? `<option value="gm">👑 Mestre (GM)</option>` : ''}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div style="margin-top:10px; display:flex; justify-content:flex-end;">
                        <button type="button" class="btn-summon-card" style="padding:8px 16px;" onclick="createNewPlayerProfileFromForm()">＋ Criar Conta & Entrar</button>
                    </div>
                `}
            </div>

            <div class="lobby-section-card" style="margin-top:12px;">
                <h4 style="margin:0 0 10px 0; color:#f0e6d2; font-size:13px;">👥 Contas Cadastradas na Mesa (${(playersData || []).length})</h4>
                <div class="profile-char-list">
                    ${(playersData || []).map(p => {
                        const charCount = (charactersData || []).filter(c => c.ownerId === p.id).length;
                        const isLastGm = p.role === 'gm' && playersData.filter(x => x.role === 'gm').length <= 1;
                        const canDeleteThis = (window.isHostClient || activeP?.id === p.id) && !isLastGm;
                        const isConfirming = window._confirmDeleteProfileId === p.id;
                        const pColor = getPlayerColor(p);
                        return `
                            <div class="profile-char-row" style="flex-direction:column; align-items:stretch; gap:8px; border-left:3px solid ${escapeHtmlText(pColor)};">
                                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span>${escapeHtmlText(getPlayerAvatar(p))}</span>
                                        <div>
                                            <strong style="color:#f0e6d2;">${escapeHtmlText(getPlayerDisplayName(p))}</strong>
                                            <div style="font-size:11px; color:#9da3b8;">${p.role === 'gm' ? '👑 Mestre' : '🎮 Jogador'} • ${charCount} ficha(s) ${p.pin ? '• 🔒 PIN' : ''}</div>
                                        </div>
                                    </div>
                                    <div style="display:flex; gap:5px;">
                                        <button type="button" class="btn-mini" onclick="requestSwitchToProfile('${escapeHtmlText(p.id)}')">Entrar</button>
                                        <button type="button" class="btn-mini" onclick="window._editingProfileId='${escapeHtmlText(p.id)}'; renderProfileManagerModal('edit')">✏️ Editar</button>
                                        ${canDeleteThis ? `<button type="button" class="btn-mini btn-danger" onclick="startDeletePlayerProfile('${escapeHtmlText(p.id)}')">🗑️ Excluir</button>` : ''}
                                    </div>
                                </div>
                                ${isConfirming ? `
                                    <div style="background:#261a1e; border:1px solid #8f3e4b; border-radius:6px; padding:8px; font-size:12px;">
                                        <div style="margin-bottom:6px; color:#ff9ea8;">Confirmar exclusão de <strong>${escapeHtmlText(getPlayerDisplayName(p))}</strong>? ${charCount > 0 ? `Este perfil possui ${charCount} ficha(s).` : ''}</div>
                                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                            <button type="button" class="btn-mini btn-danger" onclick="confirmDeletePlayerProfile('${escapeHtmlText(p.id)}', 'reassign_gm')">${charCount > 0 ? 'Transferir fichas p/ Mestre & Excluir' : 'Confirmar Exclusão'}</button>
                                            ${charCount > 0 ? `<button type="button" class="btn-mini btn-danger" onclick="confirmDeletePlayerProfile('${escapeHtmlText(p.id)}', 'delete_chars')">Excluir Perfil + Fichas</button>` : ''}
                                            <button type="button" class="btn-mini" onclick="window._confirmDeleteProfileId=null; renderProfileManagerModal('manage')">Cancelar</button>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="studio-header">
            <h2 style="margin:0; font-family:var(--font-title); color:var(--accent-gold); font-size:18px;">👤 Perfis, Login & Personagens</h2>
            <button type="button" class="btn-mini" onclick="closeProfileManagerModal()">✖ Fechar</button>
        </div>
        ${tabsHtml}
        <div class="rules-modal-body">${bodyHtml}</div>
    `;
}

/* =========================================================
   SALA ONLINE: IP OCULTO, KICK, BAN, ENTRADA & TUTORIAL
   ========================================================= */

window._hostNetworkCache = window._hostNetworkCache || null;
window._revealHostIpsInUi = false;

async function fetchHostNetworkInfo() {
    if (!window.isHostClient) return null;
    try {
        const res = await fetch('/api/host-network', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data && data.ok && data.network) {
                window._hostNetworkCache = data.network;
                return data.network;
            }
        }
    } catch (e) {}
    return null;
}

function toggleRevealHostIps() {
    window._revealHostIpsInUi = !window._revealHostIpsInUi;
    renderMultiplayerRoomModal(window._activeRoomTab || 'room');
}

async function copyTextSilently(textToCopy, okMsg) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
        } else {
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        showToast(okMsg || '📋 Copiado para a área de transferência sem exibir na tela!');
    } catch (e) {
        showToast('⚠️ Não foi possível copiar automaticamente neste navegador.');
    }
}

async function copyInviteBundleStealth(preferredUrl) {
    const rc = window.onlineRoomConfig || {};
    const lines = [
        `🎲 Convite — ${rc.roomName || 'Mesa de Campanha'}`,
        `🔗 Link da Sala: ${preferredUrl}`,
        rc.roomCode ? `🏷️ Código: ${rc.roomCode}` : '',
        rc.passcode ? `🔑 Senha da Sala: ${rc.passcode}` : ''
    ].filter(Boolean);
    await copyTextSilently(lines.join('\n'), '🤫 Convite completo copiado sem expor IP na tela!');
}

async function callRoomManageApi(payload, successMsg = null) {
    try {
        const res = await fetch('/api/room/manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            showToast('❌ ' + (data?.error || 'Não foi possível gerenciar a sala.'));
            return null;
        }
        if (data.room) window.onlineRoomConfig = data.room;
        if (Array.isArray(data.onlinePlayers)) window.onlinePlayersList = data.onlinePlayers;
        updateSidebarIdentityAndRoomUI();
        if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
        if (document.getElementById('multiplayer-room-backdrop')?.classList.contains('open')) {
            renderMultiplayerRoomModal(window._activeRoomTab || 'room');
        }
        if (successMsg) showToast(successMsg);
        return data;
    } catch (e) {
        showToast('⚠️ Erro de conexão com o servidor local.');
        return null;
    }
}

async function submitRoomConfigForm() {
    const nameEl = document.getElementById('room-cfg-name');
    const passEl = document.getElementById('room-cfg-passcode');
    const maxEl = document.getElementById('room-cfg-maxplayers');
    const blockGmEl = document.getElementById('room-cfg-blockgm');
    const selfCreateEl = document.getElementById('room-cfg-selfcreate');

    await callRoomManageApi({
        action: 'create_or_update',
        roomName: nameEl?.value || 'Mesa de Campanha',
        passcode: passEl ? passEl.value : '',
        maxPlayers: Number(maxEl?.value) || 8,
        blockRemoteGm: blockGmEl ? blockGmEl.checked : true,
        allowSelfProfileCreate: selfCreateEl ? selfCreateEl.checked : true
    }, '✅ Configurações da sala online atualizadas e abertas!');
}

function _resolveOnlineClientTarget(clientId) {
    const op = (window.onlinePlayersList || []).find(x => x.clientId === clientId) || null;
    const label = op
        ? getPlayerDisplayName({ id: op.playerId || op.clientId, name: op.playerName, role: op.role }, 'Jogador')
        : 'Jogador';
    return { op, label };
}

function kickOnlinePlayer(clientId) {
    const { op, label } = _resolveOnlineClientTarget(clientId);
    callRoomManageApi({
        action: 'kick',
        targetClientId: clientId,
        targetDeviceId: op?.deviceId || '',
        reason: 'Desconectado da sala pelo Mestre.'
    }, `👢 ${label} foi desconectado(a) da sala.`);
}

function banOnlinePlayer(clientId) {
    const { op, label } = _resolveOnlineClientTarget(clientId);
    callRoomManageApi({
        action: 'ban',
        targetClientId: clientId,
        targetDeviceId: op?.deviceId || '',
        targetPlayerId: op?.playerId || '',
        label: op?.playerName || label,
        reason: 'Você foi banido desta sala pelo Mestre.'
    }, `🚫 ${label} foi banido(a) da sala.`);
}

function unbanEntryFromRoom(banId) {
    callRoomManageApi({
        action: 'unban',
        banId
    }, '✅ Banimento removido.');
}

async function joinTargetRoomFromForm() {
    const urlInput = document.getElementById('join-room-url-input');
    const passInput = document.getElementById('join-room-passcode-input');
    const statusBox = document.getElementById('join-room-feedback');
    let raw = (urlInput?.value || '').trim();
    const pass = (passInput?.value || '').trim();

    if (!raw) {
        if (statusBox) {
            statusBox.style.color = '#ff8a8a';
            statusBox.textContent = '❌ Cole o IP ou Link passado pelo Mestre (ex: http://192.168.1.25:8080).';
        }
        return;
    }

    if (!/^https?:\/\//i.test(raw)) {
        raw = 'http://' + raw;
    }
    if (!/:\d+(\/|$)/.test(raw.replace(/^https?:\/\//i, ''))) {
        const cleanUrl = raw.replace(/\/+$/, '');
        raw = cleanUrl + ':8080';
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(raw);
    } catch (e) {
        if (statusBox) {
            statusBox.style.color = '#ff8a8a';
            statusBox.textContent = '❌ Endereço inválido. Use o formato IP:PORTA (ex: 192.168.1.10:8080).';
        }
        return;
    }

    if (pass) setActiveRoomPasscode(pass);

    const sameOrigin = parsedUrl.origin === window.location.origin;
    if (sameOrigin) {
        if (statusBox) {
            statusBox.style.color = '#a5d6a7';
            statusBox.textContent = '🔄 Verificando senha e reconectando à sala atual...';
        }
        try {
            const res = await fetch('/api/room/verify-passcode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passcode: pass, deviceId: getOrCreateDeviceId() })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                if (statusBox) {
                    statusBox.style.color = '#ff8a8a';
                    statusBox.textContent = '❌ ' + (data?.error || 'Falha ao validar acesso.');
                }
                return;
            }
            window.roomGateBlockState = null;
            document.getElementById('room-gate-backdrop')?.classList.remove('open');
            if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.connectRealtimeServer) {
                CompendioNetAdapter.connectRealtimeServer();
            }
            closeMultiplayerRoomModal();
            showToast('🟢 Conectado à sala com sucesso!');
        } catch (err) {
            if (statusBox) {
                statusBox.style.color = '#ff8a8a';
                statusBox.textContent = '⚠️ Não foi possível alcançar a sala neste endereço.';
            }
        }
        return;
    }

    if (pass) {
        parsedUrl.searchParams.set('roomPasscode', pass);
    }
    window.location.href = parsedUrl.toString();
}

async function openMultiplayerRoomModal(tab = 'room') {
    window._activeRoomTab = tab || 'room';
    const backdrop = document.getElementById('multiplayer-room-backdrop');
    if (backdrop) {
        renderMultiplayerRoomModal(window._activeRoomTab);
        backdrop.classList.add('open');
        if (window.isHostClient && !window._hostNetworkCache) {
            await fetchHostNetworkInfo();
            if (backdrop.classList.contains('open')) {
                renderMultiplayerRoomModal(window._activeRoomTab);
            }
        }
    }
}

function closeMultiplayerRoomModal() {
    window._revealHostIpsInUi = false;
    document.getElementById('multiplayer-room-backdrop')?.classList.remove('open');
}

function renderIpAddressRowHtml(item, badgeLabel) {
    const revealed = Boolean(window._revealHostIpsInUi) && !isStreamerModeEnabled();
    const shownUrl = revealed ? item.url : maskSensitiveNetworkText(item.url);
    return `
        <div class="ip-invite-row">
            <div>
                <div style="font-size:11px; color:#9da3b8;">${escapeHtmlText(badgeLabel)} • <span>${escapeHtmlText(item.interfaceName)}</span></div>
                <div style="font-family:var(--font-mono); font-size:13px; color:#f0e6d2; margin-top:2px;">${escapeHtmlText(shownUrl)}</div>
            </div>
            <div style="display:flex; gap:5px; flex-wrap:wrap;">
                <button type="button" class="btn-mini" onclick="copyTextSilently('${escapeHtmlText(item.url)}', '📋 Link copiado sem exibir IP!')">📋 Link</button>
                <button type="button" class="btn-summon-card" style="padding:5px 10px; font-size:11px;" onclick="copyInviteBundleStealth('${escapeHtmlText(item.url)}')">🤫 Copiar Convite</button>
            </div>
        </div>
    `;
}

function renderMultiplayerRoomModal(tab = 'room') {
    window._activeRoomTab = tab;
    const container = document.getElementById('multiplayer-room-modal-content');
    if (!container) return;

    const rc = window.onlineRoomConfig || {
        isOpen: true, isLocked: false, roomName: 'Mesa de Campanha', roomCode: 'MESA-LOCAL',
        hasPasscode: false, maxPlayers: 8, blockRemoteGm: true, allowSelfProfileCreate: true, bannedEntries: []
    };
    const online = Array.isArray(window.onlinePlayersList) ? window.onlinePlayersList : [];
    const streamerOn = isStreamerModeEnabled();
    const isHost = Boolean(window.isHostClient);

    const tabsHtml = `
        <div class="rules-modal-tabs">
            <button type="button" class="rules-tab-btn ${tab === 'room' ? 'active' : ''}" onclick="renderMultiplayerRoomModal('room')">🌐 Gestão da Sala (${online.length}/${rc.maxPlayers || 8})</button>
            <button type="button" class="rules-tab-btn ${tab === 'join' ? 'active' : ''}" onclick="renderMultiplayerRoomModal('join')">🚪 Entrar em Sala</button>
            <button type="button" class="rules-tab-btn ${tab === 'tutorial' ? 'active' : ''}" onclick="renderMultiplayerRoomModal('tutorial')">📖 Tutorial LAN / VPN / Stream</button>
        </div>
    `;

    let bodyHtml = '';

    if (tab === 'room') {
        const net = window._hostNetworkCache;
        const lanList = net?.lan || [];
        const vpnList = net?.vpn || [];
        const banList = Array.isArray(rc.bannedEntries) ? rc.bannedEntries : [];

        const ipCardHtml = !serverWritable ? `
            <div class="lobby-section-card" style="border-color:#694a2d;">
                <h4 style="margin:0 0 6px 0; color:#ffb74d; font-size:13px;">⚠️ Servidor Local Offline (Modo Navegador)</h4>
                <p style="margin:0; font-size:12px; color:#c8ccdc;">Para abrir uma sala na LAN ou VPN com até 8 jogadores em tempo real, execute <code>iniciar-compendio.bat</code> (Node.js) na pasta do projeto e abra <code>http://localhost:8080</code>.</p>
            </div>
        ` : !isHost ? `
            <div class="lobby-section-card">
                <div style="font-size:12px; color:#c8ccdc;">
                    Você está conectado como <strong>Dispositivo Remoto</strong> na sala <strong>${escapeHtmlText(rc.roomName || 'Mesa')}</strong>.
                    ${streamerOn ? '<div>📺 <em>Endereços e códigos permanecem ocultos no Modo Streamer.</em></div>' : ''}
                </div>
            </div>
        ` : `
            <div class="lobby-section-card">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <div>
                        <h4 style="margin:0; color:var(--accent-gold); font-size:13px;">🔗 Card de Convite & Endereços (Ocultos por Padrão)</h4>
                        <div style="font-size:11px; color:#9da3b8;">Código da Sala: <code style="color:#f0e6d2;">${streamerOn && !window._revealHostIpsInUi ? 'MESA-••••' : escapeHtmlText(rc.roomCode || 'MESA')}</code></div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="btn-mini" onclick="fetchHostNetworkInfo().then(()=>renderMultiplayerRoomModal('room'))">🔄 Atualizar Rede</button>
                        <button type="button" class="btn-mini" ${streamerOn ? 'disabled title="Desative o Modo Streamer para exibir IPs na tela"' : ''} onclick="toggleRevealHostIps()">
                            ${window._revealHostIpsInUi && !streamerOn ? '🙈 Ocultar IPs' : '👁️ Revelar IPs na Tela'}
                        </button>
                    </div>
                </div>
                ${streamerOn ? `<div class="streamer-warning-banner">📺 <strong>Streamer Mode ON:</strong> os botões <em>Copiar Link / Copiar Convite</em> continuam funcionando 100% no clipboard sem nunca revelar seu IP na tela!</div>` : ''}
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${lanList.map(item => renderIpAddressRowHtml(item, '🏠 Wi-Fi / Cabo (Rede Local LAN)')).join('')}
                    ${vpnList.map(item => renderIpAddressRowHtml(item, '🛡️ VPN / Internet (Tailscale / Radmin / ZeroTier)')).join('')}
                    ${(!lanList.length && !vpnList.length) ? `<div style="font-size:12px; color:#8b90a8;">Nenhuma interface de rede externa detectada além de <code>localhost:${net?.port || 8080}</code>.</div>` : ''}
                </div>
            </div>
        `;

        const hostControlsHtml = isHost && serverWritable ? `
            <div class="lobby-section-card" style="margin-top:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <h4 style="margin:0; color:#f0e6d2; font-size:13px;">⚙️ Controle da Sala (Host)</h4>
                    <span class="room-status-badge ${!rc.isOpen ? 'closed' : rc.isLocked ? 'locked' : 'open'}">
                        ${!rc.isOpen ? '🔴 Sala Fechada' : rc.isLocked ? '🔒 Trancada p/ Novos' : '🟢 Aberta p/ Jogadores'}
                    </span>
                </div>
                <div class="lobby-form-grid">
                    <div>
                        <label class="lobby-label">Nome da Mesa / Sala</label>
                        <input type="text" id="room-cfg-name" class="form-input" value="${escapeHtmlText(rc.roomName || 'Mesa de Campanha')}" maxlength="80">
                    </div>
                    <div>
                        <label class="lobby-label">Senha da Sala (Opcional)</label>
                        <input type="password" id="room-cfg-passcode" class="form-input" value="${escapeHtmlText(rc.passcode || '')}" placeholder="Deixe vazio para entrada livre" maxlength="40">
                    </div>
                    <div>
                        <label class="lobby-label">Máximo de Jogadores</label>
                        <input type="number" id="room-cfg-maxplayers" class="form-input" min="1" max="16" value="${Number(rc.maxPlayers) || 8}">
                    </div>
                    <div style="display:flex; flex-direction:column; justify-content:center; gap:5px; font-size:12px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="room-cfg-blockgm" ${rc.blockRemoteGm !== false ? 'checked' : ''}> Bloquear acesso Mestre (GM) remoto
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                            <input type="checkbox" id="room-cfg-selfcreate" ${rc.allowSelfProfileCreate !== false ? 'checked' : ''}> Jogadores podem criar conta própria
                        </label>
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
                    <button type="button" class="btn-summon-card" style="padding:7px 14px;" onclick="submitRoomConfigForm()">💾 Salvar & Abrir Sala</button>
                    <button type="button" class="btn-mini" onclick="callRoomManageApi({action:'toggle_lock'}, rcLockedFeedback())">${rc.isLocked ? '🔓 Destrancar Entrada' : '🔒 Trancar Entrada'}</button>
                    ${rc.isOpen
                        ? `<button type="button" class="btn-mini btn-danger" onclick="callRoomManageApi({action:'close'}, '🔴 Sala fechada e remotos desconectados.')">⏹️ Fechar Sala</button>`
                        : `<button type="button" class="btn-mini" style="border-color:#4caf50; color:#81c784;" onclick="callRoomManageApi({action:'open'}, '🟢 Sala reaberta!')">▶️ Reabrir Sala</button>`
                    }
                    <button type="button" class="btn-mini" onclick="callRoomManageApi({action:'create_or_update', regenerateCode:true}, '🎲 Novo código de sala gerado!')">🎲 Novo Código</button>
                </div>
            </div>
        ` : '';

        const connectedListHtml = `
            <div class="lobby-section-card" style="margin-top:12px;">
                <h4 style="margin:0 0 10px 0; color:var(--accent-gold); font-size:13px;">👥 Jogadores Conectados na Sala (${online.length})</h4>
                ${online.length === 0
                    ? `<div style="font-size:12px; color:#8b90a8;">Nenhuma conexão SSE ativa no momento.</div>`
                    : `<div class="profile-char-list">
                        ${online.map(op => {
                            const pColor = op.color || getPlayerColor(op.playerId);
                            const displayName = getPlayerDisplayName({ id: op.playerId || op.clientId, name: op.playerName, role: op.role }, 'Jogador');
                            return `
                                <div class="profile-char-row" style="border-left:4px solid ${escapeHtmlText(pColor)};">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span class="player-color-dot" style="background:${escapeHtmlText(pColor)};"></span>
                                        <span>${escapeHtmlText(op.avatarEmoji || (op.role === 'gm' ? '👑' : '🎮'))}</span>
                                        <div>
                                            <strong style="color:#f0e6d2;">${escapeHtmlText(displayName)}</strong>
                                            <span style="font-size:11px; color:#9da3b8; margin-left:6px;">${op.role === 'gm' ? '👑 Mestre' : '🎮 Jogador'} ${op.isHost ? '• 💻 Host' : '• 🌐 Remoto'}</span>
                                        </div>
                                    </div>
                                    ${isHost && !op.isHost ? `
                                        <div style="display:flex; gap:5px;">
                                            <button type="button" class="btn-mini" onclick="kickOnlinePlayer('${escapeHtmlText(op.clientId)}')">👢 Kick</button>
                                            <button type="button" class="btn-mini btn-danger" onclick="banOnlinePlayer('${escapeHtmlText(op.clientId)}')">🚫 Banir</button>
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>`
                }
                ${isHost && banList.length > 0 ? `
                    <div style="margin-top:12px; padding-top:10px; border-top:1px solid #303445;">
                        <div style="font-size:12px; font-weight:bold; color:#ff9ea8; margin-bottom:6px;">🚫 Dispositivos Banidos (${banList.length})</div>
                        <div class="profile-char-list">
                            ${banList.map(b => `
                                <div class="profile-char-row">
                                    <div style="font-size:12px;">
                                        <strong>${escapeHtmlText(streamerOn ? 'Dispositivo Bloqueado' : (b.label || 'Banido'))}</strong>
                                        <span style="color:#9da3b8; margin-left:6px;">(${escapeHtmlText(b.reason || 'Banido')})</span>
                                    </div>
                                    <button type="button" class="btn-mini" onclick="unbanEntryFromRoom('${escapeHtmlText(b.id)}')">✅ Desbanir</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        bodyHtml = `${ipCardHtml}${hostControlsHtml}${connectedListHtml}`;
    } else if (tab === 'join') {
        bodyHtml = `
            <div class="lobby-section-card">
                <h4 style="margin:0 0 8px 0; color:var(--accent-gold); font-size:13px;">🚪 Conectar em uma Sala Online do Mestre</h4>
                <p style="margin:0 0 12px 0; font-size:12px; color:#b8bdd0;">
                    Peça ao Mestre o link do card de convite (LAN Wi-Fi ou VPN) e, se a sala tiver senha, digite abaixo.
                </p>
                ${streamerOn ? `<div class="streamer-warning-banner">📺 Campo de endereço mascarado automaticamente para proteger IPs durante a live.</div>` : ''}
                <div class="lobby-form-grid">
                    <div>
                        <label class="lobby-label">IP ou Link da Sala</label>
                        <input type="${streamerOn ? 'password' : 'text'}" id="join-room-url-input" class="form-input" placeholder="Ex: 192.168.1.25:8080 ou http://26.x.x.x:8080" onkeydown="if(event.key==='Enter') joinTargetRoomFromForm()">
                    </div>
                    <div>
                        <label class="lobby-label">Senha da Sala (se exigida)</label>
                        <input type="password" id="join-room-passcode-input" class="form-input" value="${escapeHtmlText(getActiveRoomPasscode())}" placeholder="Opcional" onkeydown="if(event.key==='Enter') joinTargetRoomFromForm()">
                    </div>
                </div>
                <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div id="join-room-feedback" style="font-size:12px; color:#9da3b8;">
                        Endereço atual: <code>${streamerOn ? maskSensitiveNetworkText(window.location?.origin || 'http://localhost:8080') : escapeHtmlText(window.location?.origin || 'http://localhost:8080')}</code>
                    </div>
                    <button type="button" class="btn-summon-card" style="padding:8px 16px;" onclick="joinTargetRoomFromForm()">🔌 Entrar na Sala</button>
                </div>
            </div>
        `;
    } else {
        bodyHtml = `
            <div class="lobby-tutorial-grid">
                <div class="lobby-section-card">
                    <h4 style="margin:0 0 8px 0; color:var(--accent-gold); font-size:13px;">1️⃣ Mesmo Wi-Fi / Cabo (Rede Local - LAN)</h4>
                    <ol class="tutorial-step-list">
                        <li>O <strong>Mestre (Host)</strong> inicia o app pelo arquivo <code>iniciar-compendio.bat</code> (Node.js) e mantém a janela preta aberta.</li>
                        <li>Na primeira execução, o Windows pode pedir permissão de Firewall para <em>Node.js</em> — marque <strong>Redes Privadas</strong> e clique em Permitir.</li>
                        <li>O Mestre abre <strong>🌐 Sala Online → Card de Convite</strong> e clica em <strong>🤫 Copiar Convite</strong> na opção <em>Wi-Fi / LAN</em>.</li>
                        <li>Os jogadores no mesmo Wi-Fi abrem o link no navegador ou colam na aba <strong>🚪 Entrar em Sala</strong>.</li>
                    </ol>
                </div>
                <div class="lobby-section-card">
                    <h4 style="margin:0 0 8px 0; color:#4fc3f7; font-size:13px;">2️⃣ Pela Internet com Amigos (Sem Mexer no Roteador)</h4>
                    <ol class="tutorial-step-list">
                        <li>Mestre e jogadores instalam uma rede privada virtual gratuita como <strong>Tailscale</strong>, <strong>Radmin VPN</strong> ou <strong>ZeroTier</strong> e entram na mesma sala da VPN.</li>
                        <li>O Compêndio detecta automaticamente o IP da VPN na seção <strong>🛡️ VPN / Internet</strong> do Card de Convite.</li>
                        <li>O Mestre copia esse link da VPN (opcionalmente define uma <strong>Senha da Sala</strong>) e envia no Discord/WhatsApp da mesa.</li>
                        <li>Assim todos jogam juntos com baixa latência, mapa, dados, combate e fichas sincronizadas!</li>
                    </ol>
                </div>
                <div class="lobby-section-card">
                    <h4 style="margin:0 0 8px 0; color:#ba68c8; font-size:13px;">3️⃣ Dicas para Streamers & Criadores de Conteúdo</h4>
                    <ul class="tutorial-step-list">
                        <li>Ative <strong>📺 Modo Streamer</strong> no menu lateral <em>antes</em> de capturar a tela no OBS.</li>
                        <li>Todos os IPs de rede, códigos de sala e nomes reais dos jogadores são trocados automaticamente por codinomes aleatórios.</li>
                        <li>Use <strong>🎲 Sortear Codinomes</strong> se quiser trocar os apelidos temporários a qualquer momento, e use sempre <strong>🤫 Copiar Convite</strong> em vez de revelar o IP na tela.</li>
                        <li>Mantenha <strong>Bloquear acesso Mestre remoto</strong> ativado para que nenhum jogador entre por engano como GM.</li>
                    </ul>
                    ${streamerOn ? `<button type="button" class="btn-mini" style="margin-top:8px;" onclick="rerollStreamerAliases(true)">🎲 Sortear Novos Codinomes Agora</button>` : ''}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="studio-header">
            <h2 style="margin:0; font-family:var(--font-title); color:var(--accent-gold); font-size:18px;">🌐 Multiplayer Online, Sala & Streamer</h2>
            <div style="display:flex; gap:8px; align-items:center;">
                <button type="button" class="btn-mini ${streamerOn ? 'active-streamer' : ''}" onclick="toggleStreamerMode()">${streamerOn ? '📺 Streamer: ON' : '📺 Ativar Streamer'}</button>
                <button type="button" class="btn-mini" onclick="closeMultiplayerRoomModal()">✖ Fechar</button>
            </div>
        </div>
        ${tabsHtml}
        <div class="rules-modal-body">${bodyHtml}</div>
    `;
}

function rcLockedFeedback() {
    return window.onlineRoomConfig?.isLocked ? '🔓 Entrada da sala destrancada!' : '🔒 Entrada da sala trancada para novos jogadores.';
}

/* =========================================================
   ROOM GATE OVERLAY (SENHA, KICK, BAN, SALA FECHADA/LOTADA)
   ========================================================= */

function showRoomGateModal(gateType, detailMessage = '') {
    window.roomGateBlockState = { type: gateType, message: detailMessage };
    const backdrop = document.getElementById('room-gate-backdrop');
    const content = document.getElementById('room-gate-modal-content');
    if (!backdrop || !content) return;

    const titles = {
        auth_required: '🔑 Sala Protegida por Senha',
        kicked: '👢 Desconectado pelo Mestre',
        banned: '🚫 Acesso Bloqueado na Sala',
        room_closed: '🔴 Sala Online Fechada',
        room_locked: '🔒 Sala Trancada',
        room_full: '👥 Sala Lotada'
    };

    const canEnterPass = gateType === 'auth_required';
    const canRetry = gateType !== 'banned';

    content.innerHTML = `
        <div class="studio-header">
            <h2 style="margin:0; font-family:var(--font-title); color:var(--accent-gold); font-size:18px;">${titles[gateType] || '🌐 Aviso da Sala'}</h2>
        </div>
        <div class="rules-modal-body">
            <p style="margin:0 0 14px 0; color:#e0e2ee; font-size:13px;">${escapeHtmlText(detailMessage || 'É necessária ação para continuar conectado a esta sala.')}</p>
            ${canEnterPass ? `
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                    <input type="password" id="room-gate-passcode-input" class="form-input" style="flex:1; min-width:180px;" placeholder="Digite a senha da sala..." onkeydown="if(event.key==='Enter') submitRoomGatePasscode()">
                    <button type="button" class="btn-summon-card" style="padding:8px 16px;" onclick="submitRoomGatePasscode()">🔓 Entrar</button>
                </div>
                <div id="room-gate-error-msg" style="color:#ff8a8a; font-size:12px;"></div>
            ` : `
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${canRetry ? `<button type="button" class="btn-summon-card" style="padding:8px 16px;" onclick="retryRoomConnectionFromGate()">🔄 Tentar Reconectar</button>` : ''}
                    <button type="button" class="btn-mini" onclick="dismissRoomGateToLocalMode()">Modo Offline Local</button>
                </div>
            `}
        </div>
    `;
    backdrop.classList.add('open');
    if (canEnterPass) {
        setTimeout(() => document.getElementById('room-gate-passcode-input')?.focus(), 50);
    }
}

async function submitRoomGatePasscode() {
    const input = document.getElementById('room-gate-passcode-input');
    const errEl = document.getElementById('room-gate-error-msg');
    const code = (input?.value || '').trim();
    if (!code) {
        if (errEl) errEl.textContent = '❌ Digite a senha informada pelo Mestre.';
        return;
    }

    try {
        const res = await fetch('/api/room/verify-passcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passcode: code, deviceId: getOrCreateDeviceId() })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
            if (errEl) errEl.textContent = '❌ ' + (data?.error || 'Senha incorreta.');
            return;
        }
        setActiveRoomPasscode(code);
        window.roomGateBlockState = null;
        document.getElementById('room-gate-backdrop')?.classList.remove('open');
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.connectRealtimeServer) {
            CompendioNetAdapter.connectRealtimeServer();
        }
        showToast('🔓 Acesso liberado à sala!');
    } catch (e) {
        if (errEl) errEl.textContent = '⚠️ Falha de conexão ao verificar senha.';
    }
}

function retryRoomConnectionFromGate() {
    window.roomGateBlockState = null;
    document.getElementById('room-gate-backdrop')?.classList.remove('open');
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.connectRealtimeServer) {
        CompendioNetAdapter.connectRealtimeServer();
    }
}

function dismissRoomGateToLocalMode() {
    window.roomGateBlockState = null;
    document.getElementById('room-gate-backdrop')?.classList.remove('open');
    showToast('📡 Permanecendo com dados locais do navegador.');
}

/* =========================================================
   SOBRESCRITA LIMPA DOS HOOKS LEGADOS DE IDENTIDADE
   ========================================================= */

window.CompendioProfiles = {
    init() {
        getOrCreateDeviceId();
        loadStreamerModeState();
        ensureAllPlayersNormalized();
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const qpPass = urlParams.get('roomPasscode');
            if (qpPass) {
                setActiveRoomPasscode(qpPass);
                urlParams.delete('roomPasscode');
                const nextUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '') + window.location.hash;
                window.history.replaceState({}, '', nextUrl);
            }
        } catch (e) {}
        renderPlayerIdentitySelector();
    }
};

window.renderPlayerIdentitySelector = function() {
    ensureAllPlayersNormalized();
    const sel = document.getElementById('active-player-select');
    const remoteGmBlocked = !window.isHostClient && (window.onlineRoomConfig?.blockRemoteGm !== false);
    if (sel && Array.isArray(playersData)) {
        sel.innerHTML = playersData.map(p => {
            const avatar = getPlayerAvatar(p);
            const name = getPlayerDisplayName(p);
            const lock = (p.pin || p.hasPin) ? ' 🔒' : '';
            const gmDisabled = (remoteGmBlocked && p.role === 'gm') ? ' disabled' : '';
            return `<option value="${escapeHtmlText(p.id)}" ${p.id === activePlayerId ? 'selected' : ''}${gmDisabled}>${escapeHtmlText(avatar)} ${escapeHtmlText(name)}${lock}</option>`;
        }).join('');
    }
    if (typeof updateMainModuleButtonsUI === 'function') updateMainModuleButtonsUI();
    updateSidebarIdentityAndRoomUI();
};

window.onPlayerIdentityChange = function(newPlayerId) {
    requestSwitchToProfile(newPlayerId);
};

window.configureActivePlayerPin = function() {
    window._editingProfileId = activePlayerId;
    openProfileManagerModal('edit');
};

window.promptAddPlayerIdentity = function() {
    openProfileManagerModal('manage');
};
