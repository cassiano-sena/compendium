/* =========================================================================
   FASE 5: MULTIPLAYER REAL-TIME PARA ATÉ 8 JOGADORES (SSE + POLLING + DELTAS)
   Sincroniza Tabletop, Fichas, Runa de Combate, Rolagens de Dados, Pings,
   Névoa de Guerra, Conhecimento Assimétrico e Regras entre dispositivos.
   ========================================================================= */

window.onlinePlayersList = window.onlinePlayersList || [];
window.localClientId = 'cl-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000);

(function upgradeNetAdapter() {
    if (typeof CompendioNetAdapter === 'undefined') return;

    CompendioNetAdapter.sse = null;
    CompendioNetAdapter.lastServerUpdatedAt = 0;
    CompendioNetAdapter.pollTimer = null;

    const origInit = CompendioNetAdapter.init.bind(CompendioNetAdapter);

    CompendioNetAdapter.init = function() {
        origInit();

        // Estende o listener do BroadcastChannel para Combate, Dados, Ping e Regras
        if (this.channel) {
            const prevOnMessage = this.channel.onmessage;
            this.channel.onmessage = (ev) => {
                if (prevOnMessage) prevOnMessage(ev);
                const msg = ev.data;
                if (!msg || !msg.type) return;
                this.handleIncomingRealtimeMessage(msg);
            };
        }

        this.connectRealtimeServer();
    };

    CompendioNetAdapter._getClientMeta = function() {
        const p = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
        const deviceId = typeof getOrCreateDeviceId === 'function'
            ? getOrCreateDeviceId()
            : (window.localDeviceId || window.localClientId);
        const passcode = typeof getActiveRoomPasscode === 'function' ? getActiveRoomPasscode() : '';
        return {
            clientId: window.localClientId,
            deviceId,
            senderId: (typeof activePlayerId !== 'undefined' && activePlayerId) ? activePlayerId : (p?.id || 'gm-master'),
            senderName: p ? p.name : 'Jogador',
            senderRole: p ? p.role : 'player',
            senderColor: p?.color || '#d8b467',
            senderAvatar: p?.avatarEmoji || (p?.role === 'gm' ? '👑' : '🛡️'),
            passcode
        };
    };

    CompendioNetAdapter._handleServerRejection = function(status, data) {
        if (!data || typeof showRoomGateModal !== 'function') return;
        if (data.banned) showRoomGateModal('banned', data.error || 'Acesso bloqueado pelo Mestre.');
        else if (data.kicked) showRoomGateModal('kicked', data.error || 'Você foi desconectado da sala.');
        else if (data.closed) showRoomGateModal('room_closed', data.error || 'A sala foi encerrada pelo Mestre.');
        else if (status === 401 || data.authRequired) showRoomGateModal('auth_required', data.error || 'Digite a senha da sala.');
    };

    CompendioNetAdapter.postSessionPayload = async function(extraBody) {
        if (!serverWritable) return null;
        try {
            const meta = this._getClientMeta();
            const res = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign(meta, extraBody))
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
                this._handleServerRejection(res.status, data);
                return null;
            }
            if (data && data.updatedAt) this.lastServerUpdatedAt = data.updatedAt;
            return data;
        } catch (e) {
            return null;
        }
    };

    CompendioNetAdapter.handleIncomingRealtimeMessage = function(msg) {
        if (!msg) return;
        const isTyping = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

        if (msg.type === 'COMBAT_SYNC') {
            if (Array.isArray(msg.combatCards)) {
                combatCards = msg.combatCards;
                localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(combatCards));
            }
            if (msg.combatTurn) {
                window.combatTurnState = msg.combatTurn;
            }
            if (!isTyping && typeof renderCombatHand === 'function') renderCombatHand();
            if (!isTyping && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
        } else if (msg.type === 'DICE_ROLL' && msg.roll) {
            if (!window.diceLogData.some(r => r.id === msg.roll.id)) {
                window.diceLogData.push(msg.roll);
                if (typeof CompendioDice !== 'undefined') {
                    CompendioDice.save();
                    CompendioDice.renderWidget();
                }
                const activePl = getActivePlayer();
                const isGm = activePl && activePl.role === 'gm';
                if (!msg.roll.isSecret || isGm) {
                    const actorShown = typeof getPlayerDisplayName === 'function'
                        ? getPlayerDisplayName(msg.roll.actorId || msg.senderId, msg.roll.actorName)
                        : msg.roll.actorName;
                    showToast(`🎲 ${actorShown} rolou ${msg.roll.label}: ${msg.roll.total}`);
                }
            }
        } else if (msg.type === 'DICE_CLEAR') {
            window.diceLogData = [];
            if (typeof CompendioDice !== 'undefined') {
                CompendioDice.save();
                CompendioDice.renderWidget();
            }
        } else if (msg.type === 'MAP_PING' && msg.ping) {
            if (activeModule === 'tabletop' && typeof triggerTabletopPingAt === 'function') {
                const pingSender = typeof getPlayerDisplayName === 'function'
                    ? getPlayerDisplayName(msg.ping.senderId, msg.ping.senderName)
                    : msg.ping.senderName;
                triggerTabletopPingAt(msg.ping.x, msg.ping.y, pingSender, false, msg.ping.color);
            }
        } else if (msg.type === 'RULES_SYNC') {
            if (msg.rules) window.activeRulesConfig = msg.rules;
            if (Array.isArray(msg.activeMods)) window.installedMods = msg.activeMods;
            if (typeof CompendioRules !== 'undefined') CompendioRules.refreshAllScreens();
        }
    };

    CompendioNetAdapter.applyServerSessionSnapshot = function(sess) {
        if (!sess || typeof sess !== 'object') return;
        const isTyping = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

        if (sess.roomConfig && typeof sess.roomConfig === 'object') {
            window.onlineRoomConfig = sess.roomConfig;
        }
        if (Array.isArray(sess.players) && sess.players.length > 0) {
            const localPinMap = new Map((playersData || []).map(p => [p.id, p.pin || '']));
            playersData = sess.players.map(p => {
                const merged = (p.pin === undefined && window.isHostClient && localPinMap.has(p.id))
                    ? Object.assign({}, p, { pin: localPinMap.get(p.id) })
                    : Object.assign({}, p);
                return typeof ensurePlayerExtendedFields === 'function' ? ensurePlayerExtendedFields(merged) : merged;
            });
            if (!isTyping) renderPlayerIdentitySelector();
        }
        if (Array.isArray(sess.characters) && sess.characters.length > 0) {
            charactersData = sess.characters;
            if (!isTyping && activeModule === 'character') renderCharacterModule();
        }
        if (sess.tabletop && typeof sess.tabletop === 'object' && Array.isArray(sess.tabletop.tokens)) {
            tabletopState = sess.tabletop;
            if (!isTyping && activeModule === 'tabletop') renderTabletopModule();
        }
        if (sess.knowledge && typeof sess.knowledge === 'object' && Object.keys(sess.knowledge).length > 0) {
            entityKnowledge = sess.knowledge;
        }
        if (Array.isArray(sess.combatCards)) {
            combatCards = sess.combatCards;
            if (sess.combatTurn) window.combatTurnState = sess.combatTurn;
            if (!isTyping && typeof renderCombatHand === 'function') renderCombatHand();
            if (!isTyping && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
        }
        if (Array.isArray(sess.diceLog) && sess.diceLog.length > window.diceLogData.length) {
            window.diceLogData = sess.diceLog;
            if (typeof CompendioDice !== 'undefined') CompendioDice.renderWidget();
        }
        if (sess.rules && typeof sess.rules === 'object') {
            window.activeRulesConfig = sess.rules;
            if (typeof CompendioRules !== 'undefined') CompendioRules.updateRulesSidebarBadge();
        }
        if (typeof ensureSafeInitialProfileForClient === 'function') ensureSafeInitialProfileForClient();
        if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
    };

    CompendioNetAdapter.connectRealtimeServer = async function() {
        try {
            const stRes = await fetch('/api/status', { cache: 'no-store' });
            if (!stRes.ok) return;
            const stData = await stRes.json();
            if (!stData || !stData.multiplayerReady) return;

            if (typeof stData.isHostClient === 'boolean') window.isHostClient = stData.isHostClient;
            if (stData.room) window.onlineRoomConfig = stData.room;
            if (Array.isArray(stData.onlinePlayers)) window.onlinePlayersList = stData.onlinePlayers;
            if (typeof ensureSafeInitialProfileForClient === 'function') ensureSafeInitialProfileForClient();
            if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();

            tabletopState.networkMode = stData.sseReady ? 'lan-sse' : 'lan-poll';
            const meta = this._getClientMeta();

            if (stData.sseReady && typeof EventSource !== 'undefined') {
                if (this.sse) this.sse.close();
                const params = new URLSearchParams({
                    clientId: meta.clientId,
                    deviceId: meta.deviceId,
                    playerId: meta.senderId,
                    playerName: meta.senderName,
                    role: meta.senderRole,
                    color: meta.senderColor,
                    avatarEmoji: meta.senderAvatar,
                    passcode: meta.passcode
                });
                const es = new EventSource(`/api/events?${params.toString()}`);
                this.sse = es;

                es.addEventListener('init', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (typeof data.isHostClient === 'boolean') window.isHostClient = data.isHostClient;
                        if (data.room) window.onlineRoomConfig = data.room;
                        if (Array.isArray(data.onlinePlayers)) window.onlinePlayersList = data.onlinePlayers;
                        window.roomGateBlockState = null;

                        if (data.session) {
                            const serverHasPlayers = Array.isArray(data.session.players) && data.session.players.length > 0;
                            const serverHasChars = Array.isArray(data.session.characters) && data.session.characters.length > 0;
                            if (!serverHasPlayers && !serverHasChars && window.isHostClient) {
                                this.syncServerSession();
                            } else {
                                this.applyServerSessionSnapshot(data.session);
                            }
                        }
                        if (typeof ensureSafeInitialProfileForClient === 'function') ensureSafeInitialProfileForClient();
                        if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                        if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
                    } catch (e) {}
                });

                es.addEventListener('presence', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (Array.isArray(data.onlinePlayers)) {
                            window.onlinePlayersList = data.onlinePlayers;
                            if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                            if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
                            if (document.getElementById('multiplayer-room-backdrop')?.classList.contains('open') && typeof renderMultiplayerRoomModal === 'function') {
                                renderMultiplayerRoomModal(window._activeRoomTab || 'room');
                            }
                        }
                    } catch (e) {}
                });

                es.addEventListener('room_update', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (data.room) window.onlineRoomConfig = data.room;
                        if (Array.isArray(data.onlinePlayers)) window.onlinePlayersList = data.onlinePlayers;
                        if (typeof ensureSafeInitialProfileForClient === 'function') ensureSafeInitialProfileForClient();
                        if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                        if (document.getElementById('multiplayer-room-backdrop')?.classList.contains('open') && typeof renderMultiplayerRoomModal === 'function') {
                            renderMultiplayerRoomModal(window._activeRoomTab || 'room');
                        }
                    } catch (e) {}
                });

                ['kicked', 'banned', 'room_closed', 'room_locked', 'room_full', 'auth_required'].forEach(evtName => {
                    es.addEventListener(evtName, (ev) => {
                        try {
                            const data = JSON.parse(ev.data || '{}');
                            es.close();
                            if (this.sse === es) this.sse = null;
                            if (evtName === 'room_closed' && window.onlineRoomConfig) {
                                window.onlineRoomConfig.isOpen = false;
                            }
                            if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                            if (typeof showRoomGateModal === 'function') {
                                showRoomGateModal(evtName, data.reason || '');
                            }
                        } catch (e) {}
                    });
                });

                es.addEventListener('delta', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (!data || data.senderClientId === window.localClientId) return;
                        const d = data.delta;
                        if (!d) return;
                        if (d.type === 'DICE_ROLL' && d.roll) {
                            this.handleIncomingRealtimeMessage({ type: 'DICE_ROLL', senderId: data.senderId, roll: d.roll });
                        } else if (d.type === 'DICE_CLEAR') {
                            this.handleIncomingRealtimeMessage({ type: 'DICE_CLEAR' });
                        } else if (d.type === 'MAP_PING' && d.ping) {
                            this.handleIncomingRealtimeMessage({ type: 'MAP_PING', ping: d.ping });
                        } else if (d.type === 'TOKEN_MOVE' && d.token && tabletopState && Array.isArray(tabletopState.tokens)) {
                            const idx = tabletopState.tokens.findIndex(t => t.id === d.token.id);
                            if (idx >= 0) Object.assign(tabletopState.tokens[idx], d.token);
                            else tabletopState.tokens.push(d.token);
                            if (activeModule === 'tabletop') renderTabletopModule();
                        }
                    } catch (e) {}
                });

                es.addEventListener('sync', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (!data || data.senderClientId === window.localClientId) return;
                        if (data.session) this.applyServerSessionSnapshot(data.session);
                    } catch (e) {}
                });
            } else {
                // Fallback de Polling para server.ps1
                if (this.pollTimer) clearInterval(this.pollTimer);
                this.pollTimer = setInterval(async () => {
                    try {
                        const m = this._getClientMeta();
                        const qs = new URLSearchParams({
                            clientId: m.clientId,
                            deviceId: m.deviceId,
                            playerId: m.senderId,
                            playerName: m.senderName,
                            role: m.senderRole,
                            color: m.senderColor,
                            avatarEmoji: m.senderAvatar,
                            passcode: m.passcode
                        });
                        const r = await fetch(`/api/session?${qs.toString()}`, { cache: 'no-store' });
                        const d = await r.json().catch(() => null);
                        if (!r.ok) {
                            this._handleServerRejection(r.status, d);
                            return;
                        }
                        if (d && typeof d.isHostClient === 'boolean') window.isHostClient = d.isHostClient;
                        if (d && d.room) window.onlineRoomConfig = d.room;
                        if (d && Array.isArray(d.onlinePlayers)) window.onlinePlayersList = d.onlinePlayers;
                        if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                        if (d && d.session && d.session.updatedAt > this.lastServerUpdatedAt) {
                            this.lastServerUpdatedAt = d.session.updatedAt;
                            this.applyServerSessionSnapshot(d.session);
                        }
                    } catch (e) {}
                }, 2500);
            }
        } catch (e) {}
    };

    CompendioNetAdapter.sendPresenceUpdate = async function() {
        await this.postSessionPayload({ delta: { type: 'PRESENCE_UPDATE' } });
        // Atualiza URL da conexão SSE para refletir novo perfil/cor caso reconecte
        if (this.sse && tabletopState.networkMode === 'lan-sse') {
            this.connectRealtimeServer();
        }
    };

    CompendioNetAdapter.broadcastCombat = function() {
        if (this.channel) {
            this.channel.postMessage({
                type: 'COMBAT_SYNC',
                senderId: activePlayerId,
                combatCards,
                combatTurn: window.combatTurnState
            });
        }
        this.syncServerSession();
    };

    CompendioNetAdapter.broadcastRules = function() {
        if (this.channel) {
            this.channel.postMessage({
                type: 'RULES_SYNC',
                senderId: activePlayerId,
                rules: window.activeRulesConfig,
                activeMods: window.installedMods
            });
        }
        this.syncServerSession();
    };

    CompendioNetAdapter.sendDiceRoll = async function(rollRecord) {
        if (this.channel) {
            this.channel.postMessage({ type: 'DICE_ROLL', senderId: activePlayerId, roll: rollRecord });
        }
        await this.postSessionPayload({ delta: { type: 'DICE_ROLL', roll: rollRecord } });
    };

    CompendioNetAdapter.clearDiceLog = async function() {
        if (this.channel) {
            this.channel.postMessage({ type: 'DICE_CLEAR', senderId: activePlayerId });
        }
        await this.postSessionPayload({ delta: { type: 'DICE_CLEAR' } });
    };

    CompendioNetAdapter.sendMapPing = async function(pingObj) {
        if (this.channel) {
            this.channel.postMessage({ type: 'MAP_PING', senderId: activePlayerId, ping: pingObj });
        }
        await this.postSessionPayload({ delta: { type: 'MAP_PING', ping: pingObj } });
    };

    CompendioNetAdapter.syncServerSession = async function() {
        await this.postSessionPayload({
            players: window.isHostClient
                ? playersData
                : (playersData || []).map(p => ({
                    id: p.id,
                    name: p.name,
                    role: p.role,
                    color: p.color,
                    avatarEmoji: p.avatarEmoji,
                    hasPin: Boolean(p.pin || p.hasPin)
                })),
            characters: charactersData,
            tabletop: tabletopState,
            knowledge: entityKnowledge,
            combatCards,
            combatTurn: window.combatTurnState,
            diceLog: window.diceLogData,
            rules: window.activeRulesConfig,
            activeMods: window.installedMods
        });
    };
})();
