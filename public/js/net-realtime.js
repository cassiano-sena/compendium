/* =========================================================================
   FASE 5: MULTIPLAYER REAL-TIME PARA ATÉ 8 JOGADORES (SSE + POLLING + DELTAS)
   Sincroniza Tabletop, Fichas, Runa de Combate, Rolagens de Dados, Pings,
   Névoa de Guerra, Conhecimento Assimétrico e Regras entre dispositivos.
   ========================================================================= */

window.onlinePlayersList = window.onlinePlayersList || [];
window.localClientId = window.localClientId || ('cl-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 10000));
window.ttActiveInteraction = window.ttActiveInteraction || null;
window.remoteTabletopCursors = window.remoteTabletopCursors || {};
window.activeTabletopRulers = window.activeTabletopRulers || {};

(function upgradeNetAdapter() {
    if (typeof CompendioNetAdapter === 'undefined') return;

    CompendioNetAdapter.sse = null;
    CompendioNetAdapter.lastServerUpdatedAt = 0;
    CompendioNetAdapter.pollTimer = null;
    CompendioNetAdapter._cursorLastSentAt = 0;
    CompendioNetAdapter._rulerLastSentAt = 0;

    const origInit = CompendioNetAdapter.init.bind(CompendioNetAdapter);

    CompendioNetAdapter.init = function() {
        origInit();
        this._lastStudyReqId = '';
        this._lastCatalogJson = '';
        this._lastKnowledgeJson = '';
        this._lastQuestsJson = '';
        this._lastHitDiceJson = '';

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
        const isHost = window.isHostClient === true;
        const resolvedId = isHost
            ? ((typeof activePlayerId !== 'undefined' && activePlayerId) ? activePlayerId : (p?.id || 'gm-master'))
            : ((typeof activePlayerId !== 'undefined' && activePlayerId && activePlayerId !== 'gm-master' && p && !p.isUnauthenticated && p.role !== 'gm') ? activePlayerId : '');
        const resolvedRole = (isHost && p && p.role === 'gm') ? 'gm' : 'player';
        return {
            clientId: window.localClientId,
            deviceId,
            senderId: resolvedId,
            senderName: p && !p.isUnauthenticated ? p.name : 'Não autenticado',
            senderRole: resolvedRole,
            senderColor: p?.color || '#d8b467',
            senderAvatar: p?.avatarEmoji || (resolvedRole === 'gm' ? '👑' : '🛡️'),
            passcode
        };
    };

    CompendioNetAdapter._handleServerRejection = function(status, data) {
        if (!data) return;
        if (data.approvalRequired || data.waiting) {
            window.entryApproved = false;
            if (this.sse) {
                try { this.sse.close(); } catch (e) {}
                this.sse = null;
            }
            if (typeof enterWaitingRoomFlow === 'function') enterWaitingRoomFlow(data);
            return;
        }
        if (data.gmBlocked || data.accountRequired) {
            if (typeof activePlayerId !== 'undefined') activePlayerId = '';
            if (typeof document !== 'undefined' && document.body && window.isHostClient !== true) {
                document.body.classList.add('remote-locked-preauth');
            }
            if (typeof openProfileManagerModal === 'function') openProfileManagerModal('login');
            if (typeof showToast === 'function' && data.error) showToast('🔒 ' + data.error);
            return;
        }
        if (typeof showRoomGateModal !== 'function') return;
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
                if (extraBody && extraBody.returnErrorObject) {
                    return Object.assign({ ok: false, status: res.status }, data || {});
                }
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

        if (msg.type === 'DELTA' && msg.delta) {
            if (msg.clientId && msg.clientId === window.localClientId) return;
            this.applyIncomingDelta(msg.delta, msg);
            return;
        }

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
                const isGm = (typeof isEffectiveGmUser === 'function')
                    ? isEffectiveGmUser(activePl)
                    : Boolean(activePl && !activePl.isUnauthenticated && activePl.role === 'gm' && window.isHostClient !== false);
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
            if (typeof CompendioModAPI !== 'undefined' && CompendioModAPI.rebuildActiveModHooks) {
                CompendioModAPI.rebuildActiveModHooks();
            }
            if (typeof CompendioRules !== 'undefined') CompendioRules.refreshAllScreens();
        } else if (msg.type === 'STUDY_REQUEST') {
            const isGmNow = typeof isEffectiveGmUser === 'function'
                ? isEffectiveGmUser()
                : Boolean(getActivePlayer()?.role === 'gm' && window.isHostClient !== false);
            if (isGmNow && typeof showToast === 'function') {
                showToast(`🖐️ ${msg.playerName || 'Jogador'} pediu para ESTUDAR: "${msg.entityTitle || msg.entityKey}"`);
            }
        }
    };

    CompendioNetAdapter.applyServerSessionSnapshot = function(sess) {
        if (!sess || typeof sess !== 'object') return;
        if (window.isHostClient === true && sess.hostInitialized === false && typeof this._hasLocalHostCampaignData === 'function' && this._hasLocalHostCampaignData()) {
            window.hasReceivedHostSessionSnapshot = true;
            if (sess.roomConfig && typeof sess.roomConfig === 'object') {
                window.onlineRoomConfig = sess.roomConfig;
            }
            this.syncServerSession();
            return;
        }
        const isTyping = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
        const studioOpen = document.getElementById('studio-modal-backdrop')?.classList.contains('open');
        const roleBefore = typeof getActivePlayer === 'function' ? getActivePlayer()?.role : null;

        let catalogChanged = false;
        let knowledgeChanged = false;
        let questsChanged = false;
        let hitDiceChanged = false;

        if (sess.roomConfig && typeof sess.roomConfig === 'object') {
            window.onlineRoomConfig = sess.roomConfig;
        }
        window.hasReceivedHostSessionSnapshot = true;
        if (Array.isArray(sess.players) && (!window.isHostClient || sess.players.length > 0)) {
            const localPinMap = new Map((playersData || []).map(p => [p.id, p.pin || '']));
            playersData = sess.players.map(p => {
                const merged = (p.pin === undefined && window.isHostClient && localPinMap.has(p.id))
                    ? Object.assign({}, p, { pin: localPinMap.get(p.id) })
                    : Object.assign({}, p);
                return typeof ensurePlayerExtendedFields === 'function' ? ensurePlayerExtendedFields(merged) : merged;
            });
            if (window.isHostClient === true && !playersData.some(p => p && p.role === 'gm')) {
                playersData.unshift({ id: 'gm-master', name: 'Mestre (GM)', role: 'gm', pin: '', color: '#d8b467', avatarEmoji: '👑' });
            }
            if (window._autoSelectApprovedPlayerId && playersData.some(p => p.id === window._autoSelectApprovedPlayerId && p.role !== 'gm')) {
                const autoId = window._autoSelectApprovedPlayerId;
                window._autoSelectApprovedPlayerId = null;
                if (typeof switchProfileImmediately === 'function') switchProfileImmediately(autoId);
                if (typeof closeProfileManagerModal === 'function') closeProfileManagerModal(true);
            } else if (!isTyping && typeof renderPlayerIdentitySelector === 'function') {
                renderPlayerIdentitySelector();
            }
        }
        if (Array.isArray(sess.characters) && (!window.isHostClient || sess.hostInitialized !== false || sess.characters.length > 0)) {
            charactersData = sess.characters;
            if (!isTyping && activeModule === 'character') renderCharacterModule();
        }
        if (sess.tabletop && typeof sess.tabletop === 'object' && Array.isArray(sess.tabletop.tokens)) {
            const inter = window.ttActiveInteraction;
            const prevLocalTokens = (tabletopState && Array.isArray(tabletopState.tokens)) ? tabletopState.tokens : [];
            const prevLocalShapes = (tabletopState && Array.isArray(tabletopState.aoeTemplates)) ? tabletopState.aoeTemplates : [];
            tabletopState = sess.tabletop;
            if (tabletopState.gridSnap !== undefined && tabletopState.snapToGrid === undefined) {
                tabletopState.snapToGrid = Boolean(tabletopState.gridSnap);
            }
            // Preserva objeto sendo arrastado/editado localmente para nunca cancelar ações simultâneas
            if (inter && inter.type === 'token' && inter.id) {
                const mine = prevLocalTokens.find(t => t.id === inter.id);
                const idx = tabletopState.tokens.findIndex(t => t.id === inter.id);
                if (mine && idx >= 0) tabletopState.tokens[idx] = mine;
            } else if (inter && inter.type === 'shape' && inter.id && Array.isArray(tabletopState.aoeTemplates)) {
                const mine = prevLocalShapes.find(s => s.id === inter.id);
                const idx = tabletopState.aoeTemplates.findIndex(s => s.id === inter.id);
                if (mine && idx >= 0) tabletopState.aoeTemplates[idx] = mine;
            }
            if (!isTyping && !inter && activeModule === 'tabletop') renderTabletopModule();
        }

        if (Array.isArray(sess.ephemeralCursors)) {
            const nextCursors = {};
            sess.ephemeralCursors.forEach(c => {
                if (c && c.clientId && c.clientId !== window.localClientId) {
                    nextCursors[c.clientId] = c;
                }
            });
            window.remoteTabletopCursors = nextCursors;
            if (typeof renderRemoteCursorsLayer === 'function') renderRemoteCursorsLayer();
        }
        if (Array.isArray(sess.ephemeralRulers)) {
            const myRuler = window.activeTabletopRulers[window.localClientId];
            const nextRulers = {};
            if (myRuler) nextRulers[window.localClientId] = myRuler;
            sess.ephemeralRulers.forEach(r => {
                if (r && r.clientId && r.clientId !== window.localClientId) {
                    nextRulers[r.clientId] = r;
                }
            });
            window.activeTabletopRulers = nextRulers;
            if (typeof renderTabletopRulersLayer === 'function') renderTabletopRulersLayer();
        }

        if (sess.knowledge && typeof sess.knowledge === 'object') {
            const nextKnowJson = JSON.stringify(sess.knowledge);
            const curKnowJson = this._lastKnowledgeJson || (typeof entityKnowledge !== 'undefined' ? JSON.stringify(entityKnowledge) : '');
            if (nextKnowJson !== curKnowJson || (Object.keys(sess.knowledge).length === 0 && typeof entityKnowledge !== 'undefined' && Object.keys(entityKnowledge).length > 0)) {
                this._lastKnowledgeJson = nextKnowJson;
                entityKnowledge = sess.knowledge;
                knowledgeChanged = true;
            } else {
                this._lastKnowledgeJson = nextKnowJson;
            }
        }

        if (sess.compendioData && typeof sess.compendioData === 'object') {
            const nextCatJson = JSON.stringify(sess.compendioData);
            const curCatJson = this._lastCatalogJson || (typeof compendioData !== 'undefined' ? JSON.stringify(compendioData) : '');
            if (nextCatJson !== curCatJson) {
                this._lastCatalogJson = nextCatJson;
                compendioData = sess.compendioData;
                catalogChanged = true;
            } else {
                this._lastCatalogJson = nextCatJson;
            }
        }

        if (Array.isArray(sess.quests)) {
            const nextQuestsJson = JSON.stringify(sess.quests);
            const curQuestsJson = this._lastQuestsJson || (typeof questsData !== 'undefined' ? JSON.stringify(questsData) : '');
            if (nextQuestsJson !== curQuestsJson) {
                this._lastQuestsJson = nextQuestsJson;
                questsData = sess.quests;
                questsChanged = true;
            } else {
                this._lastQuestsJson = nextQuestsJson;
            }
        }

        if (Array.isArray(sess.hitDice)) {
            const nextHdJson = JSON.stringify(sess.hitDice);
            const curHdJson = this._lastHitDiceJson || (typeof hitDiceData !== 'undefined' ? JSON.stringify(hitDiceData) : '');
            if (nextHdJson !== curHdJson) {
                this._lastHitDiceJson = nextHdJson;
                hitDiceData = sess.hitDice;
                hitDiceChanged = true;
            } else {
                this._lastHitDiceJson = nextHdJson;
            }
        }

        if (sess.lastStudyRequest && sess.lastStudyRequest.id && sess.lastStudyRequest.id !== this._lastStudyReqId) {
            this._lastStudyReqId = sess.lastStudyRequest.id;
            const isGmNow = typeof isEffectiveGmUser === 'function'
                ? isEffectiveGmUser()
                : Boolean(getActivePlayer()?.role === 'gm' && window.isHostClient !== false);
            if (isGmNow && typeof showToast === 'function') {
                showToast(`🖐️ ${sess.lastStudyRequest.playerName || 'Jogador'} pediu para ESTUDAR: "${sess.lastStudyRequest.entityTitle || sess.lastStudyRequest.entityKey}"`);
            }
        }

        if (Array.isArray(sess.combatCards)) {
            combatCards = sess.combatCards;
            if (sess.combatTurn) window.combatTurnState = sess.combatTurn;
            if (!isTyping && typeof renderCombatHand === 'function') renderCombatHand();
            if (!isTyping && !window.ttActiveInteraction && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
        }
        if (Array.isArray(sess.diceLog) && sess.diceLog.length > window.diceLogData.length) {
            window.diceLogData = sess.diceLog;
            if (typeof CompendioDice !== 'undefined') CompendioDice.renderWidget();
        }
        let rulesOrModsChanged = false;
        if (sess.rules && typeof sess.rules === 'object') {
            const nextRJson = JSON.stringify(sess.rules);
            if (nextRJson !== this._lastRulesJson) {
                this._lastRulesJson = nextRJson;
                window.activeRulesConfig = sess.rules;
                rulesOrModsChanged = true;
            }
        }
        if (Array.isArray(sess.activeMods)) {
            const nextMJson = JSON.stringify(sess.activeMods.map(m => ({ id: m.id, enabled: m.enabled, version: m.version, scriptCode: m.scriptCode, rulesPatch: m.rulesPatch })));
            if (nextMJson !== this._lastModsJson) {
                this._lastModsJson = nextMJson;
                window.installedMods = sess.activeMods;
                if (typeof CompendioModAPI !== 'undefined' && CompendioModAPI.rebuildActiveModHooks) {
                    CompendioModAPI.rebuildActiveModHooks();
                }
                rulesOrModsChanged = true;
            }
        }
        if (rulesOrModsChanged && typeof CompendioRules !== 'undefined') {
            CompendioRules.updateRulesSidebarBadge();
            if (!isTyping && !window.ttActiveInteraction && CompendioRules.refreshAllScreens) CompendioRules.refreshAllScreens();
        }

        if (typeof ensureSafeInitialProfileForClient === 'function') ensureSafeInitialProfileForClient();
        if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
        if (document.getElementById('profiles-lobby-backdrop')?.classList.contains('open') && typeof renderProfileManagerModal === 'function') {
            renderProfileManagerModal(window._activeProfileTab || 'login');
        }
        if (typeof renderPlayerIdentitySelector === 'function') {
            renderPlayerIdentitySelector();
        }

        const roleAfter = typeof getActivePlayer === 'function' ? getActivePlayer()?.role : null;
        const roleChanged = roleBefore !== roleAfter;

        if ((catalogChanged || knowledgeChanged || questsChanged || hitDiceChanged) && window.isHostClient && typeof saveLocalPersistence === 'function') {
            saveLocalPersistence();
        }

        if ((catalogChanged || knowledgeChanged || questsChanged || hitDiceChanged || roleChanged) && !studioOpen && typeof refreshCompendiumViewAfterSync === 'function') {
            refreshCompendiumViewAfterSync({
                catalogChanged: catalogChanged || roleChanged,
                knowledgeChanged: knowledgeChanged || roleChanged,
                questsChanged,
                hitDiceChanged
            });
        }
    };

    CompendioNetAdapter.connectRealtimeServer = async function(options = {}) {
        const forceReconnect = Boolean(options && options.forceReconnect);
        if (this._connectingRealtime && !forceReconnect) return;
        if (!forceReconnect && this.sse && this.sse.readyState !== 2 && tabletopState.networkMode === 'lan-sse') {
            return;
        }
        this._connectingRealtime = true;
        try {
            const devId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : (window.localDeviceId || window.localClientId);
            const stRes = await fetch(`/api/status?deviceId=${encodeURIComponent(devId)}`, { cache: 'no-store' });
            if (!stRes.ok) return;
            const stData = await stRes.json();
            if (!stData || !stData.multiplayerReady) return;

            if (typeof stData.isHostClient === 'boolean') window.isHostClient = stData.isHostClient;
            window.entryApproved = stData.isHostClient === true || stData.entryApproved !== false;
            if (stData.room) window.onlineRoomConfig = stData.room;
            if (Array.isArray(stData.onlinePlayers)) window.onlinePlayersList = stData.onlinePlayers;
            if (Array.isArray(stData.waitingRoom)) window.waitingRoomList = stData.waitingRoom;
            if (Array.isArray(stData.pendingApprovals)) window.pendingApprovalsList = stData.pendingApprovals;

            if (!stData.isHostClient && stData.entryApproved === false) {
                if (this.sse) {
                    try { this.sse.close(); } catch (e) {}
                    this.sse = null;
                }
                if (typeof enterWaitingRoomFlow === 'function') enterWaitingRoomFlow(stData);
                return;
            }

            if ((window.isHostClient || window.hasReceivedHostSessionSnapshot) && typeof ensureSafeInitialProfileForClient === 'function') {
                ensureSafeInitialProfileForClient();
            }
            if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();

            tabletopState.networkMode = stData.sseReady ? 'lan-sse' : 'lan-poll';
            const meta = this._getClientMeta();

            if (stData.sseReady && typeof EventSource !== 'undefined') {
                if (!forceReconnect && this.sse && this.sse.readyState !== 2) return;
                if (this.sse) {
                    try { this.sse.close(); } catch (e) {}
                    this.sse = null;
                }
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
                        window.entryApproved = data.isHostClient === true || data.entryApproved !== false;
                        if (data.room) window.onlineRoomConfig = data.room;
                        if (Array.isArray(data.onlinePlayers)) window.onlinePlayersList = data.onlinePlayers;
                        if (Array.isArray(data.waitingRoom)) window.waitingRoomList = data.waitingRoom;
                        if (Array.isArray(data.pendingApprovals)) window.pendingApprovalsList = data.pendingApprovals;
                        window.roomGateBlockState = null;

                        if (data.session) {
                            const hasHostLocalData = typeof this._hasLocalHostCampaignData === 'function' && this._hasLocalHostCampaignData();
                            if (window.isHostClient && data.session.hostInitialized === false) {
                                window.hasReceivedHostSessionSnapshot = true;
                                if (!hasHostLocalData) {
                                    this.applyServerSessionSnapshot(data.session);
                                }
                                this.syncServerSession();
                            } else {
                                this.applyServerSessionSnapshot(data.session);
                            }
                        } else if (typeof ensureSafeInitialProfileForClient === 'function') {
                            ensureSafeInitialProfileForClient();
                        }
                        if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                        if (typeof updateConnectedPlayersPresenceUI === 'function') updateConnectedPlayersPresenceUI();
                        if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
                        else if (activeModule === 'character' && typeof renderCharacterModule === 'function') renderCharacterModule();
                        else if (activeModule === 'compendium' && !window.isHostClient && typeof refreshCompendiumViewAfterSync === 'function') {
                            refreshCompendiumViewAfterSync({ catalogChanged: true, knowledgeChanged: true });
                        }
                    } catch (e) {}
                });

                es.addEventListener('waiting_room_update', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (Array.isArray(data.waitingRoom)) {
                            const prevCount = Array.isArray(window.waitingRoomList) ? window.waitingRoomList.length : 0;
                            window.waitingRoomList = data.waitingRoom;
                            if (window.isHostClient && data.waitingRoom.length > prevCount && typeof showToast === 'function') {
                                const latest = data.waitingRoom[data.waitingRoom.length - 1];
                                showToast(`⏳ Sala de Espera: "${latest?.requestedName || 'Visitante'}" aguarda aprovação para entrar!`);
                            }
                            if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                            if (document.getElementById('multiplayer-room-backdrop')?.classList.contains('open') && typeof renderMultiplayerRoomModal === 'function') {
                                renderMultiplayerRoomModal(window._activeRoomTab || 'room');
                            }
                        }
                    } catch (e) {}
                });

                es.addEventListener('approval_queue_update', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (Array.isArray(data.pendingApprovals)) {
                            const prevPending = (window.pendingApprovalsList || []).filter(a => a.status === 'pending').length;
                            window.pendingApprovalsList = data.pendingApprovals;
                            const nextPending = data.pendingApprovals.filter(a => a.status === 'pending').length;
                            if (window.isHostClient && nextPending > prevPending && typeof showToast === 'function') {
                                showToast(`📋 Nova solicitação (${nextPending} pendente) em 🌐 Sala / 👥 Contas!`);
                            }
                            if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                            if (document.getElementById('multiplayer-room-backdrop')?.classList.contains('open') && typeof renderMultiplayerRoomModal === 'function') {
                                renderMultiplayerRoomModal(window._activeRoomTab || 'room');
                            }
                            if (document.getElementById('profiles-lobby-backdrop')?.classList.contains('open') && typeof renderProfileManagerModal === 'function') {
                                renderProfileManagerModal(window._activeProfileTab || 'login');
                            }
                        }
                    } catch (e) {}
                });

                es.addEventListener('approval_resolved', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        const myDev = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : '';
                        if (data.requestedByDeviceId && data.requestedByDeviceId === myDev) {
                            const req = data.request || {};
                            if (req.status === 'approved') {
                                if (req.type === 'player_create' && data.createdPlayerId) {
                                    window._autoSelectApprovedPlayerId = data.createdPlayerId;
                                    if (playersData.some(p => p.id === data.createdPlayerId)) {
                                        if (typeof switchProfileImmediately === 'function') switchProfileImmediately(data.createdPlayerId);
                                        if (typeof closeProfileManagerModal === 'function') closeProfileManagerModal(true);
                                    }
                                }
                                if (typeof showToast === 'function') showToast('✅ Solicitação aprovada pelo Host/Mestre!');
                            } else if (req.status === 'rejected') {
                                if (typeof showToast === 'function') showToast(`❌ Solicitação recusada: ${req.reason || 'Negada pelo Host.'}`);
                            }
                        }
                    } catch (e) {}
                });

                es.addEventListener('presence', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (Array.isArray(data.onlinePlayers)) {
                            window.onlinePlayersList = data.onlinePlayers;
                            if (typeof updateSidebarIdentityAndRoomUI === 'function') updateSidebarIdentityAndRoomUI();
                            if (typeof updateConnectedPlayersPresenceUI === 'function') {
                                updateConnectedPlayersPresenceUI();
                            } else if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') {
                                renderTabletopModule();
                            }
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

                ['kicked', 'banned', 'room_closed', 'room_locked', 'room_full', 'auth_required', 'approval_required'].forEach(evtName => {
                    es.addEventListener(evtName, (ev) => {
                        try {
                            const data = JSON.parse(ev.data || '{}');
                            es.close();
                            if (this.sse === es) this.sse = null;
                            if (evtName === 'room_closed' && window.onlineRoomConfig) {
                                window.onlineRoomConfig.isOpen = false;
                            }
                            if (evtName === 'approval_required') {
                                window.entryApproved = false;
                                if (typeof enterWaitingRoomFlow === 'function') enterWaitingRoomFlow(data);
                                return;
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
                        this.applyIncomingDelta(d, data);
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
                        if (d && d.session) {
                            const isFirstPoll = this.lastServerUpdatedAt === 0;
                            const hasHostLocalData = typeof this._hasLocalHostCampaignData === 'function' && this._hasLocalHostCampaignData();
                            if (isFirstPoll && window.isHostClient && d.session.hostInitialized === false) {
                                window.hasReceivedHostSessionSnapshot = true;
                                this.lastServerUpdatedAt = d.session.updatedAt || Date.now();
                                if (!hasHostLocalData) {
                                    this.applyServerSessionSnapshot(d.session);
                                }
                                this.syncServerSession();
                            } else if (d.session.updatedAt > this.lastServerUpdatedAt) {
                                this.lastServerUpdatedAt = d.session.updatedAt;
                                this.applyServerSessionSnapshot(d.session);
                            }
                        }
                    } catch (e) {}
                }, 2500);
            }
        } catch (e) {}
    };

    CompendioNetAdapter.sendPresenceUpdate = async function() {
        await this.postSessionPayload({ delta: { type: 'PRESENCE_UPDATE' } });
    };

    CompendioNetAdapter.applyIncomingDelta = function(d, data = {}) {
        if (!d || typeof d !== 'object') return;
        const inter = window.ttActiveInteraction;

        if (d.type === 'DICE_ROLL' && d.roll) {
            this.handleIncomingRealtimeMessage({ type: 'DICE_ROLL', senderId: data.senderId, roll: d.roll });
            return;
        }
        if (d.type === 'DICE_CLEAR') {
            this.handleIncomingRealtimeMessage({ type: 'DICE_CLEAR' });
            return;
        }
        if (d.type === 'MAP_PING' && d.ping) {
            this.handleIncomingRealtimeMessage({ type: 'MAP_PING', ping: d.ping });
            return;
        }
        if (d.type === 'STUDY_REQUEST') {
            if (d.id) this._lastStudyReqId = d.id;
            this.handleIncomingRealtimeMessage({
                type: 'STUDY_REQUEST',
                entityKey: d.entityKey,
                entityTitle: d.entityTitle,
                playerId: d.playerId || data.senderId,
                playerName: d.playerName || data.senderName
            });
            return;
        }
        if (d.type === 'CURSOR_MOVE') {
            const cid = d.clientId || data.senderClientId || data.senderId;
            if (!cid || cid === window.localClientId) return;
            if (d.visible === false) delete window.remoteTabletopCursors[cid];
            else window.remoteTabletopCursors[cid] = Object.assign({ clientId: cid }, d);
            if (typeof renderRemoteCursorsLayer === 'function') renderRemoteCursorsLayer();
            return;
        }
        if (d.type === 'RULER_UPDATE' && d.ruler) {
            const cid = d.clientId || d.ruler.clientId || data.senderClientId || data.senderId;
            if (!cid || cid === window.localClientId) return;
            window.activeTabletopRulers[cid] = Object.assign({ clientId: cid }, d.ruler);
            if (typeof renderTabletopRulersLayer === 'function') renderTabletopRulersLayer();
            return;
        }
        if (d.type === 'RULER_CLEAR') {
            const cid = d.clientId || data.senderClientId || data.senderId;
            if (!cid || cid === window.localClientId) return;
            delete window.activeTabletopRulers[cid];
            if (typeof renderTabletopRulersLayer === 'function') renderTabletopRulersLayer();
            return;
        }
        if (d.type === 'CLIENT_EPHEMERAL_CLEAR') {
            const cid = d.clientId;
            if (!cid) return;
            delete window.remoteTabletopCursors[cid];
            delete window.activeTabletopRulers[cid];
            if (typeof renderRemoteCursorsLayer === 'function') renderRemoteCursorsLayer();
            if (typeof renderTabletopRulersLayer === 'function') renderTabletopRulersLayer();
            return;
        }

        if (!tabletopState || typeof tabletopState !== 'object') return;
        if (!Array.isArray(tabletopState.tokens)) tabletopState.tokens = [];
        if (!Array.isArray(tabletopState.aoeTemplates)) tabletopState.aoeTemplates = [];
        if (!Array.isArray(tabletopState.fogRects)) tabletopState.fogRects = [];

        if (d.type === 'TOKEN_MOVE' && d.token) {
            if (inter && inter.type === 'token' && inter.id === d.token.id) return;
            const localIsGm = typeof isEffectiveGmUser === 'function' ? isEffectiveGmUser() : (window.isHostClient === true);
            if (!localIsGm && d.token.hiddenFromPlayers) {
                tabletopState.tokens = tabletopState.tokens.filter(t => t.id !== d.token.id);
                if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
                return;
            }
            const idx = tabletopState.tokens.findIndex(t => t.id === d.token.id);
            if (idx >= 0) Object.assign(tabletopState.tokens[idx], d.token);
            else tabletopState.tokens.push(d.token);
            if (activeModule === 'tabletop') {
                if (typeof updateTabletopTokenDom === 'function' && updateTabletopTokenDom(d.token.id)) return;
                if (!inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            }
            return;
        }
        if (d.type === 'TOKEN_UPSERT' && d.token) {
            if (inter && inter.type === 'token' && inter.id === d.token.id) return;
            const localIsGm = typeof isEffectiveGmUser === 'function' ? isEffectiveGmUser() : (window.isHostClient === true);
            if (!localIsGm && d.token.hiddenFromPlayers) {
                tabletopState.tokens = tabletopState.tokens.filter(t => t.id !== d.token.id);
                if (typeof window !== 'undefined' && window.selectedTabletopTokenId === d.token.id) window.selectedTabletopTokenId = null;
                if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
                return;
            }
            const idx = tabletopState.tokens.findIndex(t => t.id === d.token.id);
            if (idx >= 0) tabletopState.tokens[idx] = Object.assign({}, tabletopState.tokens[idx], d.token);
            else tabletopState.tokens.push(d.token);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'TOKEN_DELETE' && d.tokenId) {
            tabletopState.tokens = tabletopState.tokens.filter(t => t.id !== d.tokenId);
            if (typeof window !== 'undefined' && window.selectedTabletopTokenId === d.tokenId) window.selectedTabletopTokenId = null;
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'SHAPE_UPSERT' && d.shape) {
            if (inter && inter.type === 'shape' && inter.id === d.shape.id) return;
            const idx = tabletopState.aoeTemplates.findIndex(s => s.id === d.shape.id);
            if (idx >= 0) tabletopState.aoeTemplates[idx] = Object.assign({}, tabletopState.aoeTemplates[idx], d.shape);
            else tabletopState.aoeTemplates.push(d.shape);
            if (activeModule === 'tabletop') {
                if (typeof updateTabletopShapeDom === 'function' && updateTabletopShapeDom(d.shape.id)) return;
                if (!inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            }
            return;
        }
        if (d.type === 'SHAPE_DELETE' && d.shapeId) {
            tabletopState.aoeTemplates = tabletopState.aoeTemplates.filter(s => s.id !== d.shapeId);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'FOG_UPSERT' && d.fog) {
            const idx = tabletopState.fogRects.findIndex(f => f.id === d.fog.id);
            if (idx >= 0) tabletopState.fogRects[idx] = Object.assign({}, tabletopState.fogRects[idx], d.fog);
            else tabletopState.fogRects.push(d.fog);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'FOG_DELETE' && d.fogId) {
            tabletopState.fogRects = tabletopState.fogRects.filter(f => f.id !== d.fogId);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'FOG_TOGGLE') {
            tabletopState.fogEnabled = Boolean(d.fogEnabled);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'TABLETOP_META' && d.meta) {
            Object.assign(tabletopState, d.meta);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if ((d.type === 'CHEST_UPDATE' || d.type === 'CHEST_LOOT') && d.tokenId) {
            const tok = tabletopState.tokens.find(t => t.id === d.tokenId);
            if (tok) {
                if (d.patch && typeof d.patch === 'object') Object.assign(tok, d.patch);
                if (d.updatedToken && typeof d.updatedToken === 'object') Object.assign(tok, d.updatedToken);
            }
            if (typeof refreshOpenChestOrGoldModal === 'function') refreshOpenChestOrGoldModal(d.tokenId);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'GOLD_COLLECT' && d.tokenId) {
            if (d.removed) {
                tabletopState.tokens = tabletopState.tokens.filter(t => t.id !== d.tokenId);
            } else {
                const tok = tabletopState.tokens.find(t => t.id === d.tokenId);
                if (tok && d.remainingGold !== undefined) tok.goldAmount = d.remainingGold;
            }
            if (typeof refreshOpenChestOrGoldModal === 'function') refreshOpenChestOrGoldModal(d.tokenId);
            if (activeModule === 'tabletop' && !inter && typeof renderTabletopModule === 'function') renderTabletopModule();
            return;
        }
        if (d.type === 'COMBAT_PATCH') {
            if (!Array.isArray(combatCards)) combatCards = [];
            if (d.card && d.card.id) {
                const idx = combatCards.findIndex(c => c.id === d.card.id);
                if (idx >= 0) combatCards[idx] = Object.assign({}, combatCards[idx], d.card);
                else combatCards.push(d.card);
            }
            if (d.removeCardId) combatCards = combatCards.filter(c => c.id !== d.removeCardId);
            if (d.combatTurn && typeof d.combatTurn === 'object') {
                window.combatTurnState = Object.assign({}, window.combatTurnState || {}, d.combatTurn);
            }
            try { localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(combatCards)); } catch (e) {}
            if (typeof renderCombatHand === 'function') renderCombatHand();
            if (activeModule === 'tabletop') {
                const initHud = document.querySelector('.tt-init-tracker');
                if (initHud && typeof renderDynamicInitiativeTrackerHtml === 'function') {
                    initHud.outerHTML = renderDynamicInitiativeTrackerHtml();
                }
            }
        }
    };

    CompendioNetAdapter.sendDelta = async function(deltaObj, opts = {}) {
        if (!deltaObj || !deltaObj.type) return null;
        if (this.channel && !opts.skipChannel) {
            const fallbackId = window.isHostClient ? 'gm-master' : '';
            this.channel.postMessage({
                type: 'DELTA',
                clientId: window.localClientId,
                senderId: (typeof activePlayerId !== 'undefined' && activePlayerId) ? activePlayerId : fallbackId,
                delta: deltaObj
            });
        }
        if (!serverWritable) return { ok: true, localOnly: true };
        return await this.postSessionPayload({
            delta: deltaObj,
            returnErrorObject: Boolean(opts.returnErrorObject)
        });
    };

    CompendioNetAdapter.sendCursorMove = function(x, y, visible = true) {
        const now = Date.now();
        if (visible && now - (this._cursorLastSentAt || 0) < 55) return;
        this._cursorLastSentAt = now;
        const p = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
        if (!p || p.isUnauthenticated || !p.id) return;
        const pName = typeof getPlayerDisplayName === 'function' ? getPlayerDisplayName(p) : (p.name || 'Jogador');
        this.sendDelta({
            type: 'CURSOR_MOVE',
            clientId: window.localClientId,
            playerId: p.id,
            playerName: pName,
            color: p.color || '#4fc3f7',
            x: Math.round(x),
            y: Math.round(y),
            visible
        });
    };

    CompendioNetAdapter.sendRulerUpdate = function(rulerObj, force = false) {
        const now = Date.now();
        if (!force && now - (this._rulerLastSentAt || 0) < 55) return;
        this._rulerLastSentAt = now;
        this.sendDelta({
            type: 'RULER_UPDATE',
            clientId: window.localClientId,
            ruler: Object.assign({}, rulerObj, { clientId: window.localClientId })
        });
    };

    CompendioNetAdapter.sendRulerClear = function(cid = null) {
        this.sendDelta({
            type: 'RULER_CLEAR',
            clientId: cid || window.localClientId
        });
    };

    CompendioNetAdapter.broadcastTokenDelta = function(action, tokenOrId) {
        if (action === 'delete') return this.sendDelta({ type: 'TOKEN_DELETE', tokenId: tokenOrId });
        if (action === 'move') return this.sendDelta({ type: 'TOKEN_MOVE', token: tokenOrId });
        return this.sendDelta({ type: 'TOKEN_UPSERT', token: tokenOrId });
    };

    CompendioNetAdapter.broadcastShapeDelta = function(action, shapeOrId) {
        if (action === 'delete') return this.sendDelta({ type: 'SHAPE_DELETE', shapeId: shapeOrId });
        return this.sendDelta({ type: 'SHAPE_UPSERT', shape: shapeOrId });
    };

    CompendioNetAdapter.broadcastFogDelta = function(action, fogOrFlag) {
        if (action === 'toggle') return this.sendDelta({ type: 'FOG_TOGGLE', fogEnabled: Boolean(fogOrFlag) });
        if (action === 'delete') return this.sendDelta({ type: 'FOG_DELETE', fogId: fogOrFlag });
        return this.sendDelta({ type: 'FOG_UPSERT', fog: fogOrFlag });
    };

    CompendioNetAdapter.broadcastTabletopMeta = function(metaObj) {
        return this.sendDelta({ type: 'TABLETOP_META', meta: metaObj });
    };

    CompendioNetAdapter.broadcastChestLoot = async function(payload) {
        if (!serverWritable) return { ok: true, localOnly: true };
        return await this.sendDelta(Object.assign({ type: 'CHEST_LOOT' }, payload), { returnErrorObject: true });
    };

    CompendioNetAdapter.broadcastGoldCollect = async function(payload) {
        if (!serverWritable) return { ok: true, localOnly: true };
        return await this.sendDelta(Object.assign({ type: 'GOLD_COLLECT' }, payload), { returnErrorObject: true });
    };

    CompendioNetAdapter.broadcastCombatPatch = function(patch) {
        return this.sendDelta(Object.assign({ type: 'COMBAT_PATCH' }, patch));
    };

    CompendioNetAdapter.broadcastCombat = function() {
        const isHostGm = (window.isHostClient === true) && (typeof isEffectiveGmUser === 'function' ? isEffectiveGmUser() : true);
        if (this.channel && isHostGm) {
            this.channel.postMessage({
                type: 'COMBAT_SYNC',
                senderId: activePlayerId,
                combatCards,
                combatTurn: window.combatTurnState
            });
        }
        if (!isHostGm) return;
        this.postSessionPayload({
            combatCards,
            combatTurn: window.combatTurnState
        });
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
        this.postSessionPayload({
            rules: window.activeRulesConfig,
            activeMods: window.installedMods
        });
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

    CompendioNetAdapter._hasLocalHostCampaignData = function() {
        try {
            if (Array.isArray(charactersData) && charactersData.length > 0) return true;
            if (Array.isArray(playersData) && playersData.some(p => p && p.id !== 'gm-master' && p.role !== 'gm')) return true;
            if (typeof tabletopState === 'object' && tabletopState) {
                if ((tabletopState.tokens && tabletopState.tokens.length > 0) || Boolean(tabletopState.mapPath)) return true;
                if ((tabletopState.aoeTemplates && tabletopState.aoeTemplates.length > 0) || (tabletopState.fogRegions && tabletopState.fogRegions.length > 0)) return true;
            }
            if (Array.isArray(questsData) && questsData.length > 0) return true;
            if (Array.isArray(hitDiceData) && hitDiceData.length > 0) return true;
            if (Array.isArray(combatCards) && combatCards.length > 0) return true;
            if (typeof entityKnowledge === 'object' && entityKnowledge && Object.keys(entityKnowledge).length > 0) return true;
        } catch (e) {}
        return false;
    };

    CompendioNetAdapter.syncServerSession = async function() {
        const activeP = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
        if (window.isHostClient !== true) {
            if (!window.hasReceivedHostSessionSnapshot) return;
            if (!activeP || activeP.isUnauthenticated || !activeP.id || activeP.role === 'gm') return;
            const ownChars = Array.isArray(charactersData) ? charactersData.filter(c => c && c.ownerId === activeP.id) : [];
            await this.postSessionPayload({ characters: ownChars });
            return;
        }
        const senderIsGm = (window.isHostClient === true) && activeP && activeP.role === 'gm';
        const payload = {
            players: playersData,
            characters: charactersData,
            tabletop: tabletopState,
            combatCards,
            combatTurn: window.combatTurnState,
            diceLog: window.diceLogData,
            rules: window.activeRulesConfig,
            activeMods: window.installedMods
        };
        if (senderIsGm) {
            payload.knowledge = entityKnowledge;
            if (typeof compendioData !== 'undefined') payload.compendioData = compendioData;
            if (typeof questsData !== 'undefined') payload.quests = questsData;
            if (typeof hitDiceData !== 'undefined') payload.hitDice = hitDiceData;
        }
        await this.postSessionPayload(payload);
    };
})();
