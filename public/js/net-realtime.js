/* =========================================================================
   FASE 5: MULTIPLAYER REAL-TIME PARA ATÉ 8 JOGADORES (SSE + POLLING + DELTAS)
   Sincroniza Tabletop, Fichas, Runa de Combate, Rolagens de Dados, Pings,
   Névoa de Guerra, Conhecimento Assimétrico e Regras entre dispositivos.
   ========================================================================= */

window.onlinePlayersList = [];
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
                    showToast(`🎲 ${msg.roll.actorName} rolou ${msg.roll.label}: ${msg.roll.total}`);
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
                triggerTabletopPingAt(msg.ping.x, msg.ping.y, msg.ping.senderName, false);
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

        if (Array.isArray(sess.players) && sess.players.length > 0) {
            playersData = sess.players;
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
        }
        if (Array.isArray(sess.diceLog) && sess.diceLog.length > window.diceLogData.length) {
            window.diceLogData = sess.diceLog;
            if (typeof CompendioDice !== 'undefined') CompendioDice.renderWidget();
        }
        if (sess.rules && typeof sess.rules === 'object') {
            window.activeRulesConfig = sess.rules;
            if (typeof CompendioRules !== 'undefined') CompendioRules.updateRulesSidebarBadge();
        }
    };

    CompendioNetAdapter.connectRealtimeServer = async function() {
        try {
            const stRes = await fetch('/api/status', { cache: 'no-store' });
            if (!stRes.ok) return;
            const stData = await stRes.json();
            if (!stData || !stData.multiplayerReady) return;

            tabletopState.networkMode = stData.sseReady ? 'lan-sse' : 'lan-poll';
            const player = getActivePlayer();

            if (stData.sseReady && typeof EventSource !== 'undefined') {
                if (this.sse) this.sse.close();
                const url = `/api/events?clientId=${encodeURIComponent(window.localClientId)}&playerId=${encodeURIComponent(player?.id || 'gm-master')}&playerName=${encodeURIComponent(player?.name || 'Jogador')}`;
                const es = new EventSource(url);
                this.sse = es;

                es.addEventListener('init', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (Array.isArray(data.onlinePlayers)) {
                            window.onlinePlayersList = data.onlinePlayers;
                        }
                        if (data.session) {
                            // Se o servidor acabou de iniciar (sem personagens na memória), o primeiro cliente sobe o estado atual
                            if (!data.session.characters || data.session.characters.length === 0) {
                                this.syncServerSession();
                            } else {
                                this.applyServerSessionSnapshot(data.session);
                            }
                        }
                    } catch (e) {}
                });

                es.addEventListener('presence', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (Array.isArray(data.onlinePlayers)) {
                            window.onlinePlayersList = data.onlinePlayers;
                            if (activeModule === 'tabletop') renderTabletopModule();
                        }
                    } catch (e) {}
                });

                es.addEventListener('delta', (ev) => {
                    try {
                        const data = JSON.parse(ev.data);
                        if (!data || data.senderClientId === window.localClientId) return;
                        const d = data.delta;
                        if (!d) return;
                        if (d.type === 'DICE_ROLL' && d.roll) {
                            this.handleIncomingRealtimeMessage({ type: 'DICE_ROLL', roll: d.roll });
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
                        const r = await fetch('/api/session', { cache: 'no-store' });
                        if (!r.ok) return;
                        const d = await r.json();
                        if (d && d.session && d.session.updatedAt > this.lastServerUpdatedAt) {
                            this.lastServerUpdatedAt = d.session.updatedAt;
                            this.applyServerSessionSnapshot(d.session);
                        }
                    } catch (e) {}
                }, 2500);
            }
        } catch (e) {}
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
        if (!serverWritable) return;
        try {
            await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: window.localClientId,
                    senderId: activePlayerId,
                    delta: { type: 'DICE_ROLL', roll: rollRecord }
                })
            });
        } catch (e) {}
    };

    CompendioNetAdapter.clearDiceLog = async function() {
        if (this.channel) {
            this.channel.postMessage({ type: 'DICE_CLEAR', senderId: activePlayerId });
        }
        if (!serverWritable) return;
        try {
            await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: window.localClientId,
                    senderId: activePlayerId,
                    delta: { type: 'DICE_CLEAR' }
                })
            });
        } catch (e) {}
    };

    CompendioNetAdapter.sendMapPing = async function(pingObj) {
        if (this.channel) {
            this.channel.postMessage({ type: 'MAP_PING', senderId: activePlayerId, ping: pingObj });
        }
        if (!serverWritable) return;
        try {
            await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: window.localClientId,
                    senderId: activePlayerId,
                    delta: { type: 'MAP_PING', ping: pingObj }
                })
            });
        } catch (e) {}
    };

    CompendioNetAdapter.syncServerSession = async function() {
        if (!serverWritable) return;
        try {
            const p = getActivePlayer();
            const res = await fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: window.localClientId,
                    senderId: activePlayerId,
                    senderName: p ? p.name : 'Jogador',
                    players: playersData,
                    characters: charactersData,
                    tabletop: tabletopState,
                    knowledge: entityKnowledge,
                    combatCards,
                    combatTurn: window.combatTurnState,
                    diceLog: window.diceLogData,
                    rules: window.activeRulesConfig,
                    activeMods: window.installedMods
                })
            });
            const data = await res.json();
            if (data && data.updatedAt) this.lastServerUpdatedAt = data.updatedAt;
        } catch (e) {}
    };
})();
