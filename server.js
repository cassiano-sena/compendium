const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');
const { exec } = require('child_process');

const PORT = Number(process.env.PORT) || 8080;
const IS_SERVER_MODE = process.argv.includes('--server') || process.argv.includes('--headless') || process.env.COMPENDIO_SERVER_MODE === '1';
const NO_OPEN = IS_SERVER_MODE || Boolean(process.env.NO_OPEN) || process.argv.includes('--no-open');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_STATE_FILE = path.join(PUBLIC_DIR, 'session-state.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg'
};

function safePublicPath(relPath) {
    const cleanRel = String(relPath || '').replace(/^\.?[\\/]+/, '');
    const resolved = path.resolve(PUBLIC_DIR, cleanRel);
    if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
        throw new Error('Caminho inválido fora da pasta public.');
    }
    return resolved;
}

function sendJson(res, status, obj) {
    const payload = JSON.stringify(obj);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(payload);
}

function getClientIp(req) {
    return String(req.socket?.remoteAddress || 'unknown');
}

function isLoopbackIp(ip) {
    const s = String(ip || '').toLowerCase();
    return s === '127.0.0.1' || s === '::1' || s === '::ffff:127.0.0.1' || s.startsWith('127.');
}

function isHostRequest(req) {
    if (!isLoopbackIp(getClientIp(req))) return false;
    const headers = req && req.headers ? req.headers : {};
    if (
        headers['x-forwarded-for'] ||
        headers['forwarded'] ||
        headers['cf-connecting-ip'] ||
        headers['true-client-ip'] ||
        headers['x-real-ip'] ||
        headers['x-forwarded-host'] ||
        headers['via']
    ) {
        return false;
    }
    return true;
}

function hashIdentifier(raw) {
    return crypto.createHash('sha256').update('compendio-rpg-privacy-salt:' + String(raw || '')).digest('hex').slice(0, 24);
}

function getLocalNetworkAddresses() {
    const interfaces = os.networkInterfaces();
    const lan = [];
    const vpn = [];

    for (const [ifaceName, addrs] of Object.entries(interfaces)) {
        if (!Array.isArray(addrs)) continue;
        const lowerName = ifaceName.toLowerCase();
        for (const info of addrs) {
            if (!info || info.family !== 'IPv4' || info.internal) continue;
            const ip = info.address;
            const octets = ip.split('.').map(Number);
            const isCgnat = octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127; // Tailscale
            const isRadmin = octets[0] === 26;
            const isHamachi = octets[0] === 25;
            const isVpnName = /tailscale|radmin|zerotier|hamachi|wireguard|tun|tap|vpn|wg/i.test(lowerName);

            const entry = {
                interfaceName: ifaceName,
                ip,
                url: `http://${ip}:${PORT}`
            };
            if (isCgnat || isRadmin || isHamachi || isVpnName) {
                vpn.push(entry);
            } else {
                lan.push(entry);
            }
        }
    }
    return { port: Number(PORT), lan, vpn };
}

function generateRoomCode() {
    return 'MESA-' + Math.floor(1000 + Math.random() * 9000);
}

let sessionState = {
    sessionId: 'local-session',
    hostInitialized: false,
    players: [],
    characters: [],
    tabletop: null,
    knowledge: {},
    compendioData: null,
    quests: [],
    hitDice: [],
    combatCards: [],
    combatTurn: { activeCardId: null, round: 1 },
    diceLog: [],
    rules: null,
    activeMods: [],
    lastPing: null,
    lastStudyRequest: null,
    roomConfig: {
        isOpen: true,
        isLocked: false,
        roomName: 'Mesa de Campanha',
        roomCode: generateRoomCode(),
        passcode: '',
        maxPlayers: 8,
        blockRemoteGm: true,
        requireApproval: true,
        waitingTimeoutSeconds: 120,
        allowSelfProfileCreate: false,
        bannedEntries: [], // [{ id, deviceId, ipHash, playerId, label, reason, bannedAt }]
        createdAt: Date.now()
    },
    updatedAt: Date.now()
};

function loadDefaultDadosCompendium() {
    try {
        const dadosPath = path.join(PUBLIC_DIR, 'dados.js');
        if (!fs.existsSync(dadosPath)) return null;
        const raw = fs.readFileSync(dadosPath, 'utf8');
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace < 0 || lastBrace <= firstBrace) return null;
        const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        if (parsed && typeof parsed === 'object') return parsed;
    } catch (e) {}
    return null;
}

function loadPersistedSession() {
    try {
        if (fs.existsSync(SESSION_STATE_FILE)) {
            const raw = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                if (parsed.roomConfig && typeof parsed.roomConfig === 'object') {
                    Object.assign(sessionState.roomConfig, parsed.roomConfig);
                    if (!Array.isArray(sessionState.roomConfig.bannedEntries)) {
                        sessionState.roomConfig.bannedEntries = [];
                    }
                    // Nunca permitir mestre remoto mesmo que arquivo antigo tenha blockRemoteGm=false
                    sessionState.roomConfig.blockRemoteGm = true;
                    if (sessionState.roomConfig.requireApproval === undefined) {
                        sessionState.roomConfig.requireApproval = true;
                    }
                    if (!Number(sessionState.roomConfig.waitingTimeoutSeconds)) {
                        sessionState.roomConfig.waitingTimeoutSeconds = 120;
                    }
                }
                if (Array.isArray(parsed.players)) sessionState.players = parsed.players;
                if (Array.isArray(parsed.characters)) sessionState.characters = parsed.characters;
                if (parsed.tabletop && typeof parsed.tabletop === 'object') sessionState.tabletop = parsed.tabletop;
                if (parsed.knowledge && typeof parsed.knowledge === 'object') sessionState.knowledge = parsed.knowledge;
                if (parsed.compendioData && typeof parsed.compendioData === 'object') sessionState.compendioData = parsed.compendioData;
                if (Array.isArray(parsed.quests)) sessionState.quests = parsed.quests;
                if (Array.isArray(parsed.hitDice)) sessionState.hitDice = parsed.hitDice;
                if (Array.isArray(parsed.combatCards)) sessionState.combatCards = parsed.combatCards;
                if (parsed.combatTurn && typeof parsed.combatTurn === 'object') sessionState.combatTurn = parsed.combatTurn;
                if (parsed.rules && typeof parsed.rules === 'object') sessionState.rules = parsed.rules;
                if (Array.isArray(parsed.activeMods)) sessionState.activeMods = parsed.activeMods;
                sessionState.hostInitialized = parsed.hostInitialized !== false;
            }
        }
    } catch (e) {}
    if (!sessionState.compendioData) {
        sessionState.compendioData = loadDefaultDadosCompendium();
    }
}

let persistSessionTimer = null;
function schedulePersistSession() {
    if (persistSessionTimer) clearTimeout(persistSessionTimer);
    persistSessionTimer = setTimeout(() => {
        try {
            const toSave = {
                sessionId: sessionState.sessionId,
                hostInitialized: Boolean(sessionState.hostInitialized),
                roomConfig: sessionState.roomConfig,
                players: sessionState.players,
                characters: sessionState.characters,
                tabletop: sessionState.tabletop,
                knowledge: sessionState.knowledge,
                compendioData: sessionState.compendioData,
                quests: sessionState.quests,
                hitDice: sessionState.hitDice,
                combatCards: sessionState.combatCards,
                combatTurn: sessionState.combatTurn,
                rules: sessionState.rules,
                activeMods: sessionState.activeMods,
                updatedAt: sessionState.updatedAt
            };
            fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(toSave, null, 2), 'utf8');
        } catch (e) {}
    }, 350);
}

loadPersistedSession();

function isEntryVisibleToAnyRemotePlayer(cat, itemKey, knowledge) {
    const k = `${cat}:${itemKey}`;
    const rec = knowledge && typeof knowledge === 'object' ? knowledge[k] : null;
    if (!rec) return cat !== 'session';
    if (rec.globalLevel === 'sighted' || rec.globalLevel === 'studied') return true;
    if (rec.playerLevels && typeof rec.playerLevels === 'object') {
        for (const lvl of Object.values(rec.playerLevels)) {
            if (lvl === 'sighted' || lvl === 'studied') return true;
        }
    }
    return false;
}

function sanitizeCatalogNodeForRemote(cat, nodeObj, knowledge) {
    if (!nodeObj || typeof nodeObj !== 'object') return {};
    const out = {};
    for (const [key, val] of Object.entries(nodeObj)) {
        if (!val) continue;
        if (typeof val === 'object' && val.children && typeof val.children === 'object') {
            const sub = sanitizeCatalogNodeForRemote(cat, val.children, knowledge);
            if (Object.keys(sub).length > 0) {
                out[key] = Object.assign({}, val, { children: sub });
            }
        } else if (isEntryVisibleToAnyRemotePlayer(cat, key, knowledge)) {
            if (typeof val === 'object') {
                const clone = Object.assign({}, val);
                if (typeof clone.inlineContent === 'string' && clone.inlineContent.length > 260000 && clone.path) {
                    delete clone.inlineContent;
                }
                out[key] = clone;
            } else {
                out[key] = val;
            }
        }
    }
    return out;
}

function sanitizeCompendioForRemotePlayers(compendio, knowledge) {
    if (!compendio || typeof compendio !== 'object') return null;
    const out = {};
    for (const [cat, entries] of Object.entries(compendio)) {
        if (!entries || typeof entries !== 'object') continue;
        out[cat] = sanitizeCatalogNodeForRemote(cat, entries, knowledge);
    }
    return out;
}

function sanitizeRoomForClient(isHost = false, isEntryApproved = true) {
    const rc = sessionState.roomConfig;
    const hideRoomSecrets = !isHost && !isEntryApproved;
    const base = {
        isOpen: Boolean(rc.isOpen),
        isLocked: Boolean(rc.isLocked),
        roomName: hideRoomSecrets ? 'Sala Protegida (Aprovação Necessária)' : (rc.roomName || 'Mesa de Campanha'),
        roomCode: hideRoomSecrets ? '' : (rc.roomCode || 'MESA-0000'),
        hasPasscode: Boolean(rc.passcode),
        maxPlayers: Math.max(1, Number(rc.maxPlayers) || 8),
        blockRemoteGm: true,
        requireApproval: rc.requireApproval !== false,
        waitingTimeoutSeconds: Math.max(15, Math.min(900, Number(rc.waitingTimeoutSeconds) || 120)),
        allowSelfProfileCreate: false,
        createdAt: rc.createdAt || Date.now(),
        bannedCount: (rc.bannedEntries || []).length
    };
    if (isHost) {
        base.passcode = rc.passcode || '';
        base.bannedEntries = (rc.bannedEntries || []).map(b => ({
            id: b.id,
            deviceId: b.deviceId,
            playerId: b.playerId,
            label: b.label || 'Jogador Banido',
            reason: b.reason || 'Banido pelo Mestre',
            bannedAt: b.bannedAt
        }));
    }
    return base;
}

function sanitizeTabletopForRemote(tt) {
    if (!tt || typeof tt !== 'object') return tt;
    const rawTokens = Array.isArray(tt.tokens) ? tt.tokens : [];
    const safeTokens = rawTokens
        .filter(t => t && !t.hiddenFromPlayers)
        .map(t => {
            if (t.type !== 'chest') return t;
            const copy = Object.assign({}, t);
            if (!copy.revealItemCountToPlayers && copy.locked) {
                copy.chestItems = [];
            }
            return copy;
        });
    return Object.assign({}, tt, { tokens: safeTokens });
}

function sanitizeCombatCardsForRemote(cards, tabletop) {
    if (!Array.isArray(cards)) return cards;
    const rawTokens = Array.isArray(tabletop?.tokens) ? tabletop.tokens : [];
    const hiddenTokIds = new Set(
        rawTokens.filter(t => t && t.hiddenFromPlayers).map(t => String(t.id))
    );
    if (hiddenTokIds.size === 0) return cards;
    return cards.filter(c => !c || !c.tokenId || !hiddenTokIds.has(String(c.tokenId)));
}

function canPlayerLootTokenServer(tok, senderId, targetCharId = '') {
    if (!tok || tok.hiddenFromPlayers) {
        return { ok: false, status: 403, error: 'Token oculto pelo Mestre.' };
    }
    if (tok.locked) {
        return { ok: false, status: 403, error: tok.type === 'gold' ? 'Este token de ouro está bloqueado pelo Mestre.' : 'Este baú está trancado pelo Mestre.' };
    }
    const policy = tok.lootPolicy || 'all';
    if (policy === 'players') {
        const allowed = Array.isArray(tok.allowedPlayerIds) ? tok.allowedPlayerIds : [];
        if (!senderId || !allowed.includes(senderId)) {
            return { ok: false, status: 403, error: 'Apenas jogadores autorizados pelo Mestre podem coletar este tesouro.' };
        }
    } else if (policy === 'characters') {
        const allowedChars = Array.isArray(tok.allowedCharIds) ? tok.allowedCharIds : [];
        const ownsAllowed = (sessionState.characters || []).some(c =>
            c && c.ownerId === senderId && allowedChars.includes(c.id) && (!targetCharId || c.id === targetCharId)
        );
        if (!ownsAllowed) {
            return { ok: false, status: 403, error: 'Apenas personagens autorizados pelo Mestre podem coletar este tesouro.' };
        }
    }
    return { ok: true };
}

function sanitizeSessionForClient(isHost = false) {
    const compData = isHost
        ? sessionState.compendioData
        : sanitizeCompendioForRemotePlayers(sessionState.compendioData, sessionState.knowledge);
    return {
        sessionId: sessionState.sessionId,
        hostInitialized: Boolean(sessionState.hostInitialized),
        players: isHost
            ? sessionState.players
            : (sessionState.players || []).map(p => ({
                id: p.id,
                name: p.name,
                role: p.role,
                color: p.color,
                avatarEmoji: p.avatarEmoji,
                streamerAlias: p.streamerAlias,
                hasPin: Boolean(p.pin)
            })),
        characters: sessionState.characters,
        tabletop: isHost ? sessionState.tabletop : sanitizeTabletopForRemote(sessionState.tabletop),
        knowledge: sessionState.knowledge,
        compendioData: compData,
        quests: sessionState.quests,
        hitDice: sessionState.hitDice,
        combatCards: isHost ? sessionState.combatCards : sanitizeCombatCardsForRemote(sessionState.combatCards, sessionState.tabletop),
        combatTurn: sessionState.combatTurn,
        diceLog: sessionState.diceLog,
        rules: sessionState.rules,
        activeMods: sessionState.activeMods,
        lastPing: sessionState.lastPing,
        lastStudyRequest: sessionState.lastStudyRequest,
        ephemeralCursors: Array.from(ephemeralCursors.values()),
        ephemeralRulers: Array.from(ephemeralRulers.values()),
        roomConfig: sanitizeRoomForClient(isHost),
        updatedAt: sessionState.updatedAt
    };
}

// Clientes conectados via Server-Sent Events (SSE) para Multiplayer Real-Time (até 8+ jogadores)
const sseClients = new Map();
// Estado efêmero por cliente conectado (cursor "Mãozinha" + régua persistente por cliente)
const ephemeralCursors = new Map();
const ephemeralRulers = new Map();

// Sala de espera completamente isolada + fila de aprovações do Host/Mestre
const approvedDevices = new Map(); // deviceId -> { deviceId, ipHash, label, approvedAt }
const waitingRoomQueue = new Map(); // deviceId -> { id, deviceId, ipHash, clientId, requestedName, note, joinedAt, expiresAt, lastSeenAt, status, reason, resolvedAt }
const waitingSseClients = new Map(); // deviceId -> Set<{ clientId, res }>
const pendingApprovals = []; // [{ id, type, status, requestedByDeviceId, requestedByClientId, requestedByPlayerId, requestedByName, summary, payload, _rawPin, createdAt, resolvedAt, resolvedBy, reason }]

function ensureDefaultPlayersIfEmpty() {
    if (!Array.isArray(sessionState.players)) {
        sessionState.players = [];
    }
    if (!sessionState.players.some(p => p && p.role === 'gm')) {
        sessionState.players.unshift(
            { id: 'gm-master', name: 'Mestre (GM)', role: 'gm', pin: '', color: '#d8b467', avatarEmoji: '👑' }
        );
    }
}
ensureDefaultPlayersIfEmpty();

function ensureTabletopContainer() {
    if (!sessionState.tabletop || typeof sessionState.tabletop !== 'object') {
        sessionState.tabletop = {
            tokens: [],
            aoeTemplates: [],
            fogRects: [],
            fogRegions: [],
            gridSize: 56,
            gridSizeY: 56,
            gridOffsetX: 0,
            gridOffsetY: 0,
            gridEnabled: true,
            gridSnap: true,
            snapToGrid: true,
            fogEnabled: false,
            mapBg: '',
            mapPath: ''
        };
    }
    if (!Array.isArray(sessionState.tabletop.tokens)) sessionState.tabletop.tokens = [];
    if (!Array.isArray(sessionState.tabletop.aoeTemplates)) sessionState.tabletop.aoeTemplates = [];
    if (!Array.isArray(sessionState.tabletop.fogRects)) sessionState.tabletop.fogRects = [];
    if (!Array.isArray(sessionState.tabletop.fogRegions)) sessionState.tabletop.fogRegions = [];
    return sessionState.tabletop;
}

function isEffectiveGmSender(isHost, incoming) {
    // Segurança crítica: clientes remotos nunca podem atuar como Mestre (GM).
    return Boolean(isHost && incoming?.senderRole !== 'player');
}

function isDeviceApproved(deviceId) {
    if (!deviceId) return false;
    return approvedDevices.has(String(deviceId));
}

function isClientEntryApproved(req, deviceId) {
    if (isHostRequest(req)) return true;
    if (sessionState.roomConfig.requireApproval === false) return true;
    return isDeviceApproved(deviceId);
}

function broadcastHostSseEvent(eventType, dataObj) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(dataObj)}\n\n`;
    for (const [cid, client] of sseClients.entries()) {
        if (!client.isHost) continue;
        try {
            client.res.write(payload);
        } catch (err) {
            sseClients.delete(cid);
        }
    }
}

function notifyWaitingDevice(deviceId, eventType, dataObj, closeAfter = false) {
    const set = waitingSseClients.get(String(deviceId));
    if (!set || set.size === 0) return;
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(dataObj)}\n\n`;
    for (const item of Array.from(set)) {
        try {
            item.res.write(payload);
            if (closeAfter) item.res.end();
        } catch (e) {
            set.delete(item);
        }
    }
    if (closeAfter) waitingSseClients.delete(String(deviceId));
}

function getSanitizedWaitingRoomList(now = Date.now()) {
    const list = [];
    for (const entry of waitingRoomQueue.values()) {
        if (entry.status !== 'waiting') continue;
        list.push({
            id: entry.id,
            deviceId: entry.deviceId,
            requestedName: entry.requestedName || 'Visitante',
            note: entry.note || '',
            joinedAt: entry.joinedAt,
            expiresAt: entry.expiresAt,
            remainingMs: Math.max(0, entry.expiresAt - now),
            status: entry.status
        });
    }
    return list.sort((a, b) => a.joinedAt - b.joinedAt);
}

function getSanitizedPendingApprovals(isHost = false, requesterDeviceId = '') {
    return pendingApprovals
        .filter(item => isHost || (requesterDeviceId && item.requestedByDeviceId === requesterDeviceId))
        .slice(-50)
        .map(item => ({
            id: item.id,
            type: item.type,
            status: item.status,
            requestedByDeviceId: item.requestedByDeviceId,
            requestedByClientId: item.requestedByClientId,
            requestedByPlayerId: item.requestedByPlayerId,
            requestedByName: item.requestedByName,
            summary: item.summary,
            payload: item.payload,
            createdPlayerId: item.createdPlayerId || null,
            createdAt: item.createdAt,
            resolvedAt: item.resolvedAt,
            resolvedBy: item.resolvedBy,
            reason: item.reason || ''
        }));
}

function broadcastApprovalQueueState() {
    broadcastHostSseEvent('approval_queue_update', {
        pendingApprovals: getSanitizedPendingApprovals(true),
        updatedAt: Date.now()
    });
    for (const [cid, client] of sseClients.entries()) {
        if (client.isHost) continue;
        try {
            client.res.write(`event: approval_queue_update\ndata: ${JSON.stringify({
                pendingApprovals: getSanitizedPendingApprovals(false, client.deviceId),
                updatedAt: Date.now()
            })}\n\n`);
        } catch (e) {
            sseClients.delete(cid);
        }
    }
}

function sweepWaitingRoomTimeouts(now = Date.now()) {
    let changed = false;
    for (const [devId, entry] of waitingRoomQueue.entries()) {
        if (entry.status === 'waiting' && now >= entry.expiresAt) {
            entry.status = 'expired';
            entry.reason = 'Tempo limite de espera sem aprovação do Host esgotado. Você foi desconectado.';
            entry.resolvedAt = now;
            changed = true;
            notifyWaitingDevice(devId, 'waiting_expired', {
                status: 'expired',
                reason: entry.reason,
                expiredAt: now
            }, true);
        } else if (entry.status !== 'waiting' && entry.resolvedAt && (now - entry.resolvedAt > 120000)) {
            waitingRoomQueue.delete(devId);
        }
    }
    if (changed) {
        broadcastHostSseEvent('waiting_room_update', {
            waitingRoom: getSanitizedWaitingRoomList(now),
            updatedAt: now
        });
    }
}

function approveWaitingDevice(targetDeviceId, resolvedBy = 'host') {
    const devId = String(targetDeviceId || '').trim();
    if (!devId) return { ok: false, error: 'deviceId obrigatório.' };
    const existing = waitingRoomQueue.get(devId);
    const now = Date.now();
    approvedDevices.set(devId, {
        deviceId: devId,
        ipHash: existing?.ipHash || '',
        label: existing?.requestedName || 'Jogador Aprovado',
        approvedAt: now,
        approvedBy: resolvedBy
    });
    if (existing) {
        existing.status = 'approved';
        existing.resolvedAt = now;
        waitingRoomQueue.delete(devId);
    }
    notifyWaitingDevice(devId, 'waiting_approved', {
        status: 'approved',
        deviceId: devId,
        approvedAt: now
    }, true);
    broadcastHostSseEvent('waiting_room_update', {
        waitingRoom: getSanitizedWaitingRoomList(now),
        updatedAt: now
    });
    return { ok: true, deviceId: devId };
}

function rejectWaitingDevice(targetDeviceId, reason = '', resolvedBy = 'host') {
    const devId = String(targetDeviceId || '').trim();
    if (!devId) return { ok: false, error: 'deviceId obrigatório.' };
    const now = Date.now();
    const finalReason = reason || 'Entrada recusada pelo Host da sala.';
    approvedDevices.delete(devId);
    const existing = waitingRoomQueue.get(devId);
    if (existing) {
        existing.status = 'rejected';
        existing.reason = finalReason;
        existing.resolvedAt = now;
    } else {
        waitingRoomQueue.set(devId, {
            id: 'wait-' + now.toString(36),
            deviceId: devId,
            status: 'rejected',
            reason: finalReason,
            joinedAt: now,
            expiresAt: now,
            resolvedAt: now
        });
    }
    notifyWaitingDevice(devId, 'waiting_rejected', {
        status: 'rejected',
        reason: finalReason,
        rejectedAt: now
    }, true);
    broadcastHostSseEvent('waiting_room_update', {
        waitingRoom: getSanitizedWaitingRoomList(now),
        updatedAt: now
    });
    return { ok: true, deviceId: devId };
}

function resolvePendingApproval(requestId, decision, reason = '', resolvedBy = 'host') {
    const item = pendingApprovals.find(a => a.id === requestId);
    if (!item) return { ok: false, statusCode: 404, error: 'Solicitação não encontrada.' };
    if (item.status !== 'pending') {
        return { ok: false, statusCode: 409, error: 'Solicitação já foi resolvida anteriormente.' };
    }

    const now = Date.now();
    const approved = decision === 'approve';
    item.status = approved ? 'approved' : 'rejected';
    item.resolvedAt = now;
    item.resolvedBy = resolvedBy;
    item.reason = reason || (approved ? 'Aprovado pelo Host.' : 'Solicitação recusada pelo Host.');

    let mutatedSession = false;
    if (approved) {
        if (!Array.isArray(sessionState.players)) sessionState.players = [];
        if (!Array.isArray(sessionState.characters)) sessionState.characters = [];
        const p = item.payload || {};

        if (item.type === 'player_create') {
            const newId = 'player-' + now.toString(36) + '-' + Math.floor(Math.random() * 100);
            const safeName = String(p.name || 'Novo Jogador').trim().slice(0, 40) || 'Novo Jogador';
            const newPlayer = {
                id: newId,
                name: safeName,
                role: 'player', // Nunca permitir criação remota de GM
                color: /^#[0-9a-f]{3,6}$/i.test(String(p.color || '')) ? p.color : '#4fc3f7',
                avatarEmoji: String(p.avatarEmoji || '🛡️').slice(0, 6),
                pin: String(item._rawPin || '').slice(0, 20)
            };
            sessionState.players.push(newPlayer);
            item.createdPlayerId = newId;
            mutatedSession = true;
        } else if (item.type === 'player_edit') {
            const target = sessionState.players.find(pl => pl.id === p.playerId);
            if (!target || target.role === 'gm' || target.id === 'gm-master') {
                item.status = 'rejected';
                item.reason = 'Perfil alvo inválido ou protegido (GM).';
                broadcastApprovalQueueState();
                return { ok: false, statusCode: 400, error: item.reason };
            }
            if (typeof p.name === 'string' && p.name.trim()) target.name = p.name.trim().slice(0, 40);
            if (typeof p.color === 'string' && /^#[0-9a-f]{3,6}$/i.test(p.color)) target.color = p.color;
            if (typeof p.avatarEmoji === 'string' && p.avatarEmoji.trim()) target.avatarEmoji = p.avatarEmoji.trim().slice(0, 6);
            if (item._rawPin !== undefined && item._rawPin !== null && p.updatePin) {
                target.pin = String(item._rawPin).slice(0, 20);
            }
            sessionState.characters.forEach(c => {
                if (c.ownerId === target.id) c.ownerName = target.name;
            });
            for (const c of sseClients.values()) {
                if (c.playerId === target.id) {
                    c.playerName = target.name;
                    c.color = target.color;
                    c.avatarEmoji = target.avatarEmoji;
                }
            }
            mutatedSession = true;
        } else if (item.type === 'player_delete') {
            const targetIdx = sessionState.players.findIndex(pl => pl.id === p.playerId);
            const target = targetIdx >= 0 ? sessionState.players[targetIdx] : null;
            if (!target || target.role === 'gm' || target.id === 'gm-master') {
                item.status = 'rejected';
                item.reason = 'Não é possível remover o perfil do Mestre (GM) ou perfil inexistente.';
                broadcastApprovalQueueState();
                return { ok: false, statusCode: 400, error: item.reason };
            }
            sessionState.players.splice(targetIdx, 1);
            const reassignMode = p.reassignMode === 'delete' ? 'delete' : 'reassign_gm';
            const gmOwner = sessionState.players.find(pl => pl.role === 'gm') || { id: 'gm-master', name: 'Mestre (GM)' };
            if (reassignMode === 'delete') {
                sessionState.characters = sessionState.characters.filter(c => c.ownerId !== target.id);
                if (sessionState.tabletop && Array.isArray(sessionState.tabletop.tokens)) {
                    sessionState.tabletop.tokens = sessionState.tabletop.tokens.filter(t => t.ownerId !== target.id);
                }
            } else {
                sessionState.characters.forEach(c => {
                    if (c.ownerId === target.id) {
                        c.ownerId = gmOwner.id;
                        c.ownerName = gmOwner.name;
                    }
                });
                if (sessionState.tabletop && Array.isArray(sessionState.tabletop.tokens)) {
                    sessionState.tabletop.tokens.forEach(t => {
                        if (t.ownerId === target.id) t.ownerId = gmOwner.id;
                    });
                }
            }
            for (const client of Array.from(sseClients.values())) {
                if (!client.isHost && client.playerId === target.id) {
                    closeClientWithEvent(client, 'kicked', { reason: 'Seu perfil foi removido após aprovação do Host.' });
                }
            }
            mutatedSession = true;
        } else if (item.type === 'character_create') {
            const rawChar = p.character && typeof p.character === 'object' ? Object.assign({}, p.character) : null;
            if (!rawChar) {
                item.status = 'rejected';
                item.reason = 'Dados de personagem inválidos.';
                broadcastApprovalQueueState();
                return { ok: false, statusCode: 400, error: item.reason };
            }
            const reqOwner = sessionState.players.find(pl => pl.id === rawChar.ownerId && pl.role !== 'gm')
                || sessionState.players.find(pl => pl.id === item.requestedByPlayerId && pl.role !== 'gm')
                || sessionState.players[0];
            rawChar.id = rawChar.id && !sessionState.characters.some(c => c.id === rawChar.id)
                ? String(rawChar.id)
                : ('char-' + now.toString(36) + '-' + Math.floor(Math.random() * 1000));
            if (reqOwner) {
                rawChar.ownerId = reqOwner.id;
                rawChar.ownerName = reqOwner.name;
            }
            sessionState.characters.push(rawChar);
            item.createdCharId = rawChar.id;
            mutatedSession = true;
        } else if (item.type === 'character_transfer') {
            const mode = p.mode === 'swap' ? 'swap' : 'transfer';
            const charA = sessionState.characters.find(c => c.id === p.charId);
            if (!charA) {
                item.status = 'rejected';
                item.reason = 'Personagem não encontrado para transferência.';
                broadcastApprovalQueueState();
                return { ok: false, statusCode: 404, error: item.reason };
            }
            const tt = ensureTabletopContainer();
            if (mode === 'swap' && p.swapCharId) {
                const charB = sessionState.characters.find(c => c.id === p.swapCharId);
                if (!charB || charA.id === charB.id) {
                    item.status = 'rejected';
                    item.reason = 'Segundo personagem inválido para troca.';
                    broadcastApprovalQueueState();
                    return { ok: false, statusCode: 404, error: item.reason };
                }
                const oldOwnerA = charA.ownerId;
                const oldOwnerNameA = charA.ownerName || '';
                charA.ownerId = charB.ownerId;
                charA.ownerName = charB.ownerName || '';
                charB.ownerId = oldOwnerA;
                charB.ownerName = oldOwnerNameA;
                tt.tokens.forEach(t => {
                    if (t.refId === charA.id) t.ownerId = charA.ownerId;
                    else if (t.refId === charB.id) t.ownerId = charB.ownerId;
                });
            } else {
                const targetPlayer = sessionState.players.find(pl => pl.id === p.targetPlayerId);
                if (!targetPlayer) {
                    item.status = 'rejected';
                    item.reason = 'Jogador de destino não encontrado.';
                    broadcastApprovalQueueState();
                    return { ok: false, statusCode: 404, error: item.reason };
                }
                charA.ownerId = targetPlayer.id;
                charA.ownerName = targetPlayer.name;
                tt.tokens.forEach(t => {
                    if (t.refId === charA.id) t.ownerId = targetPlayer.id;
                });
            }
            mutatedSession = true;
        }
    }

    if (mutatedSession) {
        sessionState.updatedAt = now;
        schedulePersistSession();
        broadcastSessionSync(null, 'host-approval');
        broadcastSseEvent('presence', {
            onlinePlayers: getOnlinePlayersList(),
            updatedAt: now
        });
    }

    // Notifica clientes sobre resolução para atualização imediata (inclusive auto-login do solicitante)
    broadcastSseEvent('approval_resolved', {
        request: getSanitizedPendingApprovals(true).find(x => x.id === item.id) || { id: item.id, status: item.status, type: item.type },
        createdPlayerId: item.createdPlayerId || null,
        createdCharId: item.createdCharId || null,
        requestedByDeviceId: item.requestedByDeviceId,
        requestedByClientId: item.requestedByClientId,
        updatedAt: now
    });
    broadcastApprovalQueueState();
    return { ok: true, item: getSanitizedPendingApprovals(true).find(x => x.id === item.id) };
}

function getOnlinePlayersList() {
    const list = [];
    for (const c of sseClients.values()) {
        list.push({
            clientId: c.clientId,
            deviceId: c.deviceId,
            playerId: c.playerId,
            playerName: c.playerName,
            role: c.role || 'player',
            color: c.color || '#d8b467',
            avatarEmoji: c.avatarEmoji || '🎮',
            isHost: Boolean(c.isHost),
            connectedAt: c.connectedAt
        });
    }
    return list;
}

function countConnectedUniqueDevices(excludeDeviceId = null) {
    const seen = new Set();
    for (const c of sseClients.values()) {
        const key = c.deviceId || c.clientId;
        if (excludeDeviceId && key === excludeDeviceId) continue;
        seen.add(key);
    }
    return seen.size;
}

function isDeviceConnected(deviceId) {
    if (!deviceId) return false;
    for (const c of sseClients.values()) {
        if (c.deviceId === deviceId) return true;
    }
    return false;
}

function isClientBanned(req, deviceId, playerId = null) {
    const rc = sessionState.roomConfig;
    if (!rc || !Array.isArray(rc.bannedEntries) || rc.bannedEntries.length === 0) return null;
    if (isHostRequest(req)) return null; // Host físico nunca se auto-bloqueia
    const ipHash = hashIdentifier(getClientIp(req));
    return rc.bannedEntries.find(b =>
        (deviceId && b.deviceId && b.deviceId === deviceId) ||
        (b.ipHash && b.ipHash === ipHash) ||
        (playerId && playerId !== 'gm-master' && b.playerId && b.playerId === playerId)
    ) || null;
}

function verifyRoomPasscode(req, providedPasscode = '') {
    if (isHostRequest(req)) return true;
    const rc = sessionState.roomConfig;
    if (!rc || !rc.passcode) return true;
    return String(providedPasscode || '') === String(rc.passcode);
}

function broadcastSseEvent(eventType, dataObj, excludeSenderClientId = null) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(dataObj)}\n\n`;
    for (const [cid, client] of sseClients.entries()) {
        if (excludeSenderClientId && cid === excludeSenderClientId) continue;
        try {
            client.res.write(payload);
        } catch (err) {
            sseClients.delete(cid);
        }
    }
}

function broadcastDeltaEvent(delta, senderId, excludeSenderClientId = null) {
    const ttTokens = Array.isArray(sessionState.tabletop?.tokens) ? sessionState.tabletop.tokens : [];
    for (const [cid, client] of sseClients.entries()) {
        if (excludeSenderClientId && cid === excludeSenderClientId) continue;
        let outDelta = delta;
        if (!client.isHost && delta && typeof delta === 'object') {
            if ((delta.type === 'TOKEN_UPSERT' || delta.type === 'TOKEN_MOVE') && delta.token) {
                if (delta.token.hiddenFromPlayers) {
                    outDelta = { type: 'TOKEN_DELETE', tokenId: delta.token.id };
                } else if (delta.token.type === 'chest' && delta.token.locked && !delta.token.revealItemCountToPlayers) {
                    outDelta = Object.assign({}, delta, {
                        token: Object.assign({}, delta.token, { chestItems: [] })
                    });
                }
            } else if (delta.type === 'CHEST_UPDATE' && delta.tokenId) {
                const tok = ttTokens.find(t => t && t.id === delta.tokenId);
                if (tok && tok.hiddenFromPlayers) continue;
                if (tok && tok.locked && !tok.revealItemCountToPlayers && delta.patch && delta.patch.chestItems) {
                    outDelta = Object.assign({}, delta, {
                        patch: Object.assign({}, delta.patch, { chestItems: [] })
                    });
                }
            }
        }
        try {
            const payload = `event: delta\ndata: ${JSON.stringify({
                senderId,
                senderClientId: excludeSenderClientId,
                delta: outDelta,
                updatedAt: sessionState.updatedAt
            })}\n\n`;
            client.res.write(payload);
        } catch (err) {
            sseClients.delete(cid);
        }
    }
}

function broadcastSessionSync(excludeSenderClientId = null, senderId = 'server') {
    for (const [cid, client] of sseClients.entries()) {
        if (excludeSenderClientId && cid === excludeSenderClientId) continue;
        try {
            const payload = `event: sync\ndata: ${JSON.stringify({
                senderId,
                senderClientId: excludeSenderClientId || null,
                session: sanitizeSessionForClient(Boolean(client.isHost)),
                updatedAt: sessionState.updatedAt
            })}\n\n`;
            client.res.write(payload);
        } catch (err) {
            sseClients.delete(cid);
        }
    }
}

function closeClientWithEvent(client, eventType, dataObj) {
    try {
        client.res.write(`event: ${eventType}\ndata: ${JSON.stringify(dataObj)}\n\n`);
        client.res.end();
    } catch (e) {}
    sseClients.delete(client.clientId);
}

setInterval(() => {
    sweepWaitingRoomTimeouts();
    for (const [cid, client] of sseClients.entries()) {
        try {
            client.res.write(': heartbeat\n\n');
        } catch (e) {
            sseClients.delete(cid);
        }
    }
    for (const [did, set] of waitingSseClients.entries()) {
        for (const item of Array.from(set)) {
            try {
                item.res.write(': heartbeat\n\n');
            } catch (e) {
                set.delete(item);
            }
        }
        if (set.size === 0) waitingSseClients.delete(did);
    }
}, 20000).unref();

setInterval(() => {
    sweepWaitingRoomTimeouts();
}, 2000).unref();

const COMPENDIUM_DIR_MAP = {
    monster: 'monsters',
    npc: 'npcs',
    item: 'items',
    map: 'maps',
    curio: 'curio',
    session: 'session'
};

function naturalCompareNames(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function prettifyCatalogTitle(rawName) {
    return String(rawName || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, c => c.toUpperCase()) || 'Sem Título';
}

function slugKeyFromName(name, isDir = false) {
    const clean = isDir ? String(name || '') : String(name || '').replace(/\.[^.]+$/, '');
    return clean
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-') || ('item-' + Date.now());
}

function extractTitleAndInlineFromFile(fullPath, relWebPath) {
    const ext = path.extname(fullPath).toLowerCase();
    const baseName = path.basename(fullPath, ext);
    let title = prettifyCatalogTitle(baseName);
    let inlineContent = null;
    try {
        const stat = fs.statSync(fullPath);
        if (ext === '.json') {
            if (stat.size <= 2 * 1024 * 1024) {
                const raw = fs.readFileSync(fullPath, 'utf8');
                try {
                    const parsed = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
                    const itemObj = Array.isArray(parsed) ? parsed[0]
                        : (parsed?.monster?.[0] || parsed?.item?.[0] || parsed?.npc?.[0] || parsed);
                    if (itemObj && typeof itemObj === 'object' && (itemObj.name || itemObj.title)) {
                        title = String(itemObj.name || itemObj.title).trim();
                    }
                } catch (e) {}
                if (raw.length <= 260000) inlineContent = raw;
            }
            return { title, tipo: 'json', path: relWebPath, ...(inlineContent ? { inlineContent } : {}) };
        }
        if (ext === '.html' || ext === '.htm') {
            if (stat.size <= 2 * 1024 * 1024) {
                const raw = fs.readFileSync(fullPath, 'utf8');
                const h1Match = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                if (h1Match) {
                    const stripped = h1Match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                    if (stripped && stripped.length <= 100) title = stripped;
                }
                if (raw.length <= 260000) inlineContent = raw;
            }
            return { title, tipo: 'html', path: relWebPath, ...(inlineContent ? { inlineContent } : {}) };
        }
        if (ext === '.txt' || ext === '.md' || ext === '.svg') {
            if (stat.size <= 260000) {
                inlineContent = fs.readFileSync(fullPath, 'utf8');
            }
            return { title, tipo: ext.slice(1), path: relWebPath, ...(inlineContent ? { inlineContent } : {}) };
        }
    } catch (e) {}
    return { title, tipo: ext.slice(1) || 'file', path: relWebPath };
}

function isDocExt(ext) {
    return ['.json', '.html', '.htm', '.txt', '.md'].includes(ext);
}

function isImgExt(ext) {
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.avif'].includes(ext);
}

function flattenNestedLeaves(targetObj, nodeObj) {
    for (const [k, v] of Object.entries(nodeObj || {})) {
        if (!v) continue;
        if (v.children && typeof v.children === 'object') {
            flattenNestedLeaves(targetObj, v.children);
        } else if (!targetObj[k]) {
            targetObj[k] = v;
        }
    }
}

function walkCompendiumFolder(cat, dirAbsPath, dirWebRelPath, isCategoryRoot = false) {
    if (!fs.existsSync(dirAbsPath)) return {};
    const entries = fs.readdirSync(dirAbsPath, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.'))
        .sort((a, b) => naturalCompareNames(a.name, b.name));

    const subdirs = entries.filter(e => e.isDirectory());
    const files = entries.filter(e => e.isFile());
    const docFiles = files.filter(f => isDocExt(path.extname(f.name).toLowerCase()));
    const imgFiles = files.filter(f => isImgExt(path.extname(f.name).toLowerCase()));

    // Colapsa pasta de entidade única (ex: monster/data/tarrasque/tarrasque.json + tarrasque.png)
    if (!isCategoryRoot && subdirs.length === 0) {
        if (cat === 'monsters' || cat === 'npcs' || cat === 'items') {
            const distinctDocSlugs = new Set(docFiles.map(f => slugKeyFromName(f.name)));
            if (distinctDocSlugs.size === 1 || (docFiles.length === 0 && imgFiles.length >= 1)) {
                const chosen =
                    docFiles.find(f => path.extname(f.name).toLowerCase() === '.json') ||
                    docFiles.find(f => ['.html', '.htm'].includes(path.extname(f.name).toLowerCase())) ||
                    docFiles[0] ||
                    imgFiles.find(f => !/-art\./i.test(f.name)) ||
                    imgFiles[0];
                if (chosen) {
                    const key = slugKeyFromName(path.basename(dirAbsPath), true);
                    const full = path.join(dirAbsPath, chosen.name);
                    const rel = `${dirWebRelPath}/${chosen.name}`;
                    return { __singleEntity: true, key, entry: extractTitleAndInlineFromFile(full, rel) };
                }
            }
        } else if (cat === 'maps' && (docFiles.length + imgFiles.length) === 1) {
            const chosen = docFiles[0] || imgFiles[0];
            if (chosen) {
                const key = slugKeyFromName(path.basename(dirAbsPath), true);
                const full = path.join(dirAbsPath, chosen.name);
                const rel = `${dirWebRelPath}/${chosen.name}`;
                return { __singleEntity: true, key, entry: extractTitleAndInlineFromFile(full, rel) };
            }
        }
    }

    const collection = {};
    for (const sd of subdirs) {
        const subAbs = path.join(dirAbsPath, sd.name);
        const subWeb = `${dirWebRelPath}/${sd.name}`;
        const res = walkCompendiumFolder(cat, subAbs, subWeb, false);
        if (res && res.__singleEntity) {
            collection[res.key] = res.entry;
        } else if (res && Object.keys(res).length > 0) {
            if (isCategoryRoot) {
                const fKey = slugKeyFromName(sd.name, true);
                collection[fKey] = {
                    title: prettifyCatalogTitle(sd.name),
                    children: res
                };
            } else {
                // UI suporta 1 nível de pasta; achata subníveis extras preservando entradas
                flattenNestedLeaves(collection, res);
            }
        }
    }

    const leafCandidates = (cat === 'maps')
        ? [...docFiles, ...imgFiles]
        : (cat === 'curio' || cat === 'session' ? docFiles : (docFiles.length ? docFiles : imgFiles));

    for (const lf of leafCandidates) {
        const ext = path.extname(lf.name).toLowerCase();
        const k = slugKeyFromName(lf.name);
        if (ext !== '.json' && leafCandidates.some(other => slugKeyFromName(other.name) === k && path.extname(other.name).toLowerCase() === '.json')) {
            continue;
        }
        const full = path.join(dirAbsPath, lf.name);
        const rel = `${dirWebRelPath}/${lf.name}`;
        if (!collection[k]) {
            collection[k] = extractTitleAndInlineFromFile(full, rel);
        }
    }
    return collection;
}

function countLeafEntries(nodeObj) {
    if (!nodeObj || typeof nodeObj !== 'object') return 0;
    let total = 0;
    for (const v of Object.values(nodeObj)) {
        if (!v) continue;
        if (v.children && typeof v.children === 'object') total += countLeafEntries(v.children);
        else total++;
    }
    return total;
}

function scanCompendiumDirectories() {
    const scanned = { monsters: {}, npcs: {}, maps: {}, items: {}, curio: {}, session: {} };
    const counts = { monsters: 0, npcs: 0, maps: 0, items: 0, curio: 0, session: 0 };
    for (const [folderName, catKey] of Object.entries(COMPENDIUM_DIR_MAP)) {
        const absDir = path.join(PUBLIC_DIR, folderName);
        if (fs.existsSync(absDir)) {
            scanned[catKey] = walkCompendiumFolder(catKey, absDir, `./${folderName}`, true);
            counts[catKey] = countLeafEntries(scanned[catKey]);
        }
    }
    return { scanned, counts };
}

function mergeCatalogCollections(targetCatObj, scannedCatObj) {
    const result = Object.assign({}, targetCatObj || {});
    for (const [k, v] of Object.entries(scannedCatObj || {})) {
        if (v && v.children && result[k] && result[k].children) {
            result[k] = {
                title: result[k].title || v.title,
                children: mergeCatalogCollections(result[k].children, v.children)
            };
        } else if (!result[k]) {
            result[k] = v;
        }
    }
    return result;
}

function applyScannedVisibility(catKey, nodeObj, knowledge, visLevel) {
    if (!nodeObj || typeof nodeObj !== 'object' || !visLevel) return;
    for (const [k, v] of Object.entries(nodeObj)) {
        if (!v) continue;
        if (v.children && typeof v.children === 'object') {
            applyScannedVisibility(catKey, v.children, knowledge, visLevel);
        } else {
            const knowKey = `${catKey}:${k}`;
            if (!knowledge[knowKey]) {
                knowledge[knowKey] = { globalLevel: visLevel, playerLevels: {} };
            }
        }
    }
}

function readJsonBody(req, res, maxBytes = 256 * 1024, handler) {
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
        if (aborted) return;
        body += chunk;
        if (body.length > maxBytes) {
            aborted = true;
            req.destroy();
            sendJson(res, 413, { ok: false, error: 'Payload excedeu o limite permitido.' });
        }
    });
    req.on('end', () => {
        if (aborted) return;
        try {
            const parsed = JSON.parse(body || '{}');
            handler(parsed);
        } catch (err) {
            sendJson(res, 400, { ok: false, error: 'JSON inválido: ' + err.message });
        }
    });
}

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const isHost = isHostRequest(req);
    const reqDeviceId = parsedUrl.searchParams.get('deviceId') || req.headers['x-device-id'] || '';

    // API: Status do Servidor Local e Sala
    if (req.method === 'GET' && pathname === '/api/status') {
        sweepWaitingRoomTimeouts();
        const entryApproved = isClientEntryApproved(req, reqDeviceId);
        const waitRec = (!isHost && reqDeviceId) ? waitingRoomQueue.get(String(reqDeviceId)) : null;
        const payload = {
            ok: true,
            mode: 'node',
            writable: true,
            multiplayerReady: true,
            sseReady: true,
            isHostClient: isHost,
            entryApproved,
            port: Number(PORT),
            room: sanitizeRoomForClient(isHost, entryApproved),
            onlineCount: entryApproved ? sseClients.size : 0,
            onlinePlayers: entryApproved ? getOnlinePlayersList() : []
        };
        if (isHost) {
            payload.waitingRoom = getSanitizedWaitingRoomList();
            payload.pendingApprovals = getSanitizedPendingApprovals(true);
            payload.serverMode = IS_SERVER_MODE;
            payload.hostInitialized = Boolean(sessionState.hostInitialized);
        } else if (waitRec) {
            payload.waitingStatus = {
                status: waitRec.status,
                expiresAt: waitRec.expiresAt,
                remainingMs: waitRec.status === 'waiting' ? Math.max(0, waitRec.expiresAt - Date.now()) : 0,
                reason: waitRec.reason || ''
            };
        }
        return sendJson(res, 200, payload);
    }

    // API ISOLADA: Sala de Espera (Zero acesso a dados da campanha antes da aprovação do Host)
    if (req.method === 'POST' && pathname === '/api/waiting-room/join') {
        return readJsonBody(req, res, 64 * 1024, (incoming) => {
            sweepWaitingRoomTimeouts();
            const devId = String(incoming.deviceId || reqDeviceId || '').trim().slice(0, 80);
            if (!devId) {
                return sendJson(res, 400, { ok: false, error: 'Identificador de dispositivo ausente.' });
            }
            const banned = isClientBanned(req, devId);
            if (banned) {
                return sendJson(res, 403, { ok: false, banned: true, error: banned.reason || 'Acesso bloqueado nesta sala.' });
            }
            if (!sessionState.roomConfig.isOpen && !isHost) {
                return sendJson(res, 403, { ok: false, closed: true, error: 'A sala online foi encerrada pelo Mestre.' });
            }
            if (!verifyRoomPasscode(req, incoming.passcode)) {
                return sendJson(res, 401, { ok: false, authRequired: true, error: 'Senha ou código da sala incorreto.' });
            }
            if (isClientEntryApproved(req, devId)) {
                return sendJson(res, 200, { ok: true, status: 'approved', entryApproved: true, deviceId: devId });
            }
            if (sessionState.roomConfig.isLocked && !isHost) {
                return sendJson(res, 403, { ok: false, roomLocked: true, error: 'A sala está trancada pelo Mestre para novas entradas.' });
            }

            const now = Date.now();
            const timeoutSec = Math.max(15, Math.min(900, Number(sessionState.roomConfig.waitingTimeoutSeconds) || 120));
            const reqName = String(incoming.requestedName || 'Jogador Visitante').trim().slice(0, 40) || 'Jogador Visitante';
            const note = String(incoming.note || '').trim().slice(0, 120);
            const existing = waitingRoomQueue.get(devId);

            if (existing && existing.status === 'waiting' && now < existing.expiresAt) {
                existing.requestedName = reqName;
                if (note) existing.note = note;
                if (incoming.clientId) existing.clientId = String(incoming.clientId);
                existing.lastSeenAt = now;
            } else if (existing && (existing.status === 'expired' || existing.status === 'rejected') && !incoming.retry) {
                return sendJson(res, 403, {
                    ok: false,
                    status: existing.status,
                    error: existing.reason || 'Acesso não aprovado.',
                    canRetry: existing.status === 'expired'
                });
            } else {
                waitingRoomQueue.set(devId, {
                    id: 'wait-' + now.toString(36) + '-' + Math.floor(Math.random() * 100),
                    deviceId: devId,
                    ipHash: hashIdentifier(getClientIp(req)),
                    clientId: String(incoming.clientId || ''),
                    requestedName: reqName,
                    note,
                    joinedAt: now,
                    expiresAt: now + timeoutSec * 1000,
                    lastSeenAt: now,
                    status: 'waiting',
                    reason: '',
                    resolvedAt: null
                });
            }

            const entry = waitingRoomQueue.get(devId);
            broadcastHostSseEvent('waiting_room_update', {
                waitingRoom: getSanitizedWaitingRoomList(now),
                updatedAt: now
            });

            return sendJson(res, 200, {
                ok: true,
                status: entry.status,
                deviceId: devId,
                joinedAt: entry.joinedAt,
                expiresAt: entry.expiresAt,
                remainingMs: Math.max(0, entry.expiresAt - now),
                timeoutSeconds: timeoutSec,
                serverNow: now
            });
        });
    }

    if (req.method === 'GET' && pathname === '/api/waiting-room/status') {
        sweepWaitingRoomTimeouts();
        const devId = String(parsedUrl.searchParams.get('deviceId') || reqDeviceId || '').trim();
        if (!devId) return sendJson(res, 400, { ok: false, error: 'deviceId obrigatório.' });
        if (isClientEntryApproved(req, devId)) {
            return sendJson(res, 200, { ok: true, status: 'approved', entryApproved: true, remainingMs: 0 });
        }
        const entry = waitingRoomQueue.get(devId);
        if (!entry) {
            return sendJson(res, 200, { ok: true, status: 'none', entryApproved: false, remainingMs: 0 });
        }
        entry.lastSeenAt = Date.now();
        return sendJson(res, 200, {
            ok: true,
            status: entry.status,
            entryApproved: false,
            joinedAt: entry.joinedAt,
            expiresAt: entry.expiresAt,
            remainingMs: entry.status === 'waiting' ? Math.max(0, entry.expiresAt - Date.now()) : 0,
            reason: entry.reason || '',
            serverNow: Date.now()
        });
    }

    if (req.method === 'GET' && pathname === '/api/waiting-room/events') {
        sweepWaitingRoomTimeouts();
        const devId = String(parsedUrl.searchParams.get('deviceId') || reqDeviceId || '').trim();
        const cid = String(parsedUrl.searchParams.get('clientId') || ('w-' + Date.now()));
        if (!devId) {
            res.writeHead(400);
            return res.end('deviceId obrigatorio');
        }
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        if (isClientEntryApproved(req, devId)) {
            res.write(`event: waiting_approved\ndata: ${JSON.stringify({ status: 'approved', deviceId: devId })}\n\n`);
            return res.end();
        }
        const entry = waitingRoomQueue.get(devId);
        if (!entry) {
            res.write(`event: waiting_state\ndata: ${JSON.stringify({ status: 'none' })}\n\n`);
            return res.end();
        }
        if (entry.status === 'expired') {
            res.write(`event: waiting_expired\ndata: ${JSON.stringify({ status: 'expired', reason: entry.reason })}\n\n`);
            return res.end();
        }
        if (entry.status === 'rejected') {
            res.write(`event: waiting_rejected\ndata: ${JSON.stringify({ status: 'rejected', reason: entry.reason })}\n\n`);
            return res.end();
        }

        if (!waitingSseClients.has(devId)) waitingSseClients.set(devId, new Set());
        const item = { clientId: cid, res };
        waitingSseClients.get(devId).add(item);

        res.write(`event: waiting_state\ndata: ${JSON.stringify({
            status: 'waiting',
            deviceId: devId,
            joinedAt: entry.joinedAt,
            expiresAt: entry.expiresAt,
            remainingMs: Math.max(0, entry.expiresAt - Date.now()),
            serverNow: Date.now()
        })}\n\n`);

        req.on('close', () => {
            const set = waitingSseClients.get(devId);
            if (set) {
                set.delete(item);
                if (set.size === 0) waitingSseClients.delete(devId);
            }
        });
        return;
    }

    // API: Fila de Aprovações (Contas de Jogadores e Criação/Troca de Personagens)
    if (req.method === 'GET' && pathname === '/api/approvals') {
        if (!isHost && !isClientEntryApproved(req, reqDeviceId)) {
            return sendJson(res, 403, { ok: false, approvalRequired: true, error: 'Aguardando aprovação de entrada na sala.' });
        }
        return sendJson(res, 200, {
            ok: true,
            pendingApprovals: getSanitizedPendingApprovals(isHost, String(reqDeviceId))
        });
    }

    if (req.method === 'POST' && pathname === '/api/approvals/request') {
        return readJsonBody(req, res, 2 * 1024 * 1024, (incoming) => {
            const devId = String(incoming.deviceId || reqDeviceId || '').trim().slice(0, 80);
            const cid = String(incoming.clientId || '').trim();
            const passcode = incoming.passcode || req.headers['x-room-passcode'] || '';
            const banned = isClientBanned(req, devId, incoming.senderId);
            if (banned) {
                return sendJson(res, 403, { ok: false, banned: true, error: banned.reason || 'Acesso bloqueado.' });
            }
            if (!sessionState.roomConfig.isOpen && !isHost) {
                return sendJson(res, 403, { ok: false, closed: true, error: 'Sala fechada.' });
            }
            if (!verifyRoomPasscode(req, passcode)) {
                return sendJson(res, 401, { ok: false, authRequired: true, error: 'Senha necessária.' });
            }
            if (!isHost && !isClientEntryApproved(req, devId)) {
                return sendJson(res, 403, { ok: false, approvalRequired: true, error: 'Você precisa ser aprovado na Sala de Espera antes.' });
            }

            const type = String(incoming.type || '');
            const allowedTypes = ['player_create', 'player_edit', 'player_delete', 'character_create', 'character_transfer'];
            if (!allowedTypes.includes(type)) {
                return sendJson(res, 400, { ok: false, error: 'Tipo de solicitação inválido.' });
            }

            const p = incoming.payload && typeof incoming.payload === 'object' ? incoming.payload : {};
            const reqPid = (!isHost && (incoming.senderId === 'gm-master' || (sessionState.players || []).some(pl => pl.id === incoming.senderId && pl.role === 'gm')))
                ? ''
                : String(incoming.senderId || '').slice(0, 60);
            const senderProfile = (sessionState.players || []).find(pl => pl.id === reqPid && pl.role !== 'gm');
            const reqName = String(incoming.senderName || senderProfile?.name || 'Jogador').trim().slice(0, 40) || 'Jogador';

            // Validações de integridade por tipo antes de enfileirar
            let summary = '';
            let cleanPayload = {};
            let rawPin = null;

            if (type === 'player_create') {
                const name = String(p.name || '').trim().slice(0, 40);
                if (!name) return sendJson(res, 400, { ok: false, error: 'Nome do jogador é obrigatório.' });
                cleanPayload = {
                    name,
                    color: p.color || '#4fc3f7',
                    avatarEmoji: String(p.avatarEmoji || '🛡️').slice(0, 6),
                    hasPin: Boolean(p.pin)
                };
                rawPin = String(p.pin || '').slice(0, 20);
                summary = `Criar nova conta de jogador: "${name}"`;
            } else if (type === 'player_edit') {
                const target = (sessionState.players || []).find(pl => pl.id === p.playerId);
                if (!target || target.role === 'gm' || target.id === 'gm-master') {
                    return sendJson(res, 403, { ok: false, error: 'Não é permitido editar o perfil do Mestre.' });
                }
                const newName = String(p.name || target.name).trim().slice(0, 40) || target.name;
                cleanPayload = {
                    playerId: target.id,
                    oldName: target.name,
                    name: newName,
                    color: p.color || target.color,
                    avatarEmoji: String(p.avatarEmoji || target.avatarEmoji || '🛡️').slice(0, 6),
                    updatePin: Boolean(p.updatePin)
                };
                if (p.updatePin) rawPin = String(p.pin || '').slice(0, 20);
                summary = `Editar jogador "${target.name}" → "${newName}"`;
            } else if (type === 'player_delete') {
                const target = (sessionState.players || []).find(pl => pl.id === p.playerId);
                if (!target || target.role === 'gm' || target.id === 'gm-master') {
                    return sendJson(res, 403, { ok: false, error: 'Não é permitido remover o perfil do Mestre.' });
                }
                cleanPayload = {
                    playerId: target.id,
                    targetName: target.name,
                    reassignMode: p.reassignMode === 'delete' ? 'delete' : 'reassign_gm'
                };
                summary = `Remover jogador "${target.name}"`;
            } else if (type === 'character_create') {
                if (!senderProfile && !isHost) {
                    return sendJson(res, 403, { ok: false, accountRequired: true, error: 'Faça login em uma conta de jogador antes de solicitar criação de personagem.' });
                }
                const ch = p.character && typeof p.character === 'object' ? Object.assign({}, p.character) : null;
                if (!ch || !String(ch.name || '').trim()) {
                    return sendJson(res, 400, { ok: false, error: 'Dados do personagem inválidos.' });
                }
                if (!isHost && senderProfile) {
                    ch.ownerId = senderProfile.id;
                    ch.ownerName = senderProfile.name;
                }
                cleanPayload = { character: ch };
                summary = `Criar personagem "${String(ch.name).trim().slice(0, 50)}" para ${ch.ownerName || reqName}`;
            } else if (type === 'character_transfer') {
                if (!senderProfile && !isHost) {
                    return sendJson(res, 403, { ok: false, accountRequired: true, error: 'Faça login em uma conta de jogador antes de solicitar troca de personagem.' });
                }
                const charA = (sessionState.characters || []).find(c => c.id === p.charId);
                if (!charA) return sendJson(res, 404, { ok: false, error: 'Personagem de origem não encontrado.' });
                if (!isHost && charA.ownerId !== senderProfile.id) {
                    return sendJson(res, 403, { ok: false, error: 'Você só pode solicitar transferência de um personagem que controla.' });
                }
                const mode = p.mode === 'swap' ? 'swap' : 'transfer';
                if (mode === 'swap') {
                    const charB = (sessionState.characters || []).find(c => c.id === p.swapCharId);
                    if (!charB || charB.id === charA.id) {
                        return sendJson(res, 400, { ok: false, error: 'Selecione um segundo personagem válido para trocar.' });
                    }
                    cleanPayload = {
                        mode: 'swap',
                        charId: charA.id,
                        charName: charA.name,
                        fromOwnerName: charA.ownerName || '',
                        swapCharId: charB.id,
                        swapCharName: charB.name,
                        toOwnerId: charB.ownerId,
                        toOwnerName: charB.ownerName || ''
                    };
                    summary = `Trocar donos: "${charA.name}" (${charA.ownerName || '?'}) ↔ "${charB.name}" (${charB.ownerName || '?'})`;
                } else {
                    const targetPl = (sessionState.players || []).find(pl => pl.id === p.targetPlayerId);
                    if (!targetPl) return sendJson(res, 404, { ok: false, error: 'Jogador de destino não encontrado.' });
                    cleanPayload = {
                        mode: 'transfer',
                        charId: charA.id,
                        charName: charA.name,
                        fromOwnerId: charA.ownerId,
                        fromOwnerName: charA.ownerName || '',
                        targetPlayerId: targetPl.id,
                        targetPlayerName: targetPl.name
                    };
                    summary = `Transferir personagem "${charA.name}" → ${targetPl.name}`;
                }
            }

            const now = Date.now();
            const requestObj = {
                id: 'apr-' + now.toString(36) + '-' + Math.floor(Math.random() * 1000),
                type,
                status: 'pending',
                requestedByDeviceId: devId,
                requestedByClientId: cid,
                requestedByPlayerId: reqPid,
                requestedByName: reqName,
                summary,
                payload: cleanPayload,
                _rawPin: rawPin,
                createdAt: now,
                resolvedAt: null,
                resolvedBy: null,
                reason: ''
            };
            pendingApprovals.push(requestObj);
            if (pendingApprovals.length > 80) pendingApprovals.splice(0, pendingApprovals.length - 80);

            broadcastApprovalQueueState();
            return sendJson(res, 200, {
                ok: true,
                queued: true,
                request: getSanitizedPendingApprovals(true).find(x => x.id === requestObj.id)
            });
        });
    }

    if (req.method === 'POST' && pathname === '/api/approvals/resolve') {
        if (!isHost) {
            return sendJson(res, 403, { ok: false, error: 'Apenas o Host/Mestre pode aprovar ou recusar solicitações.' });
        }
        return readJsonBody(req, res, 64 * 1024, (incoming) => {
            const decision = incoming.decision === 'reject' ? 'reject' : 'approve';
            const result = resolvePendingApproval(incoming.requestId, decision, incoming.reason || '', 'host');
            if (!result.ok) {
                return sendJson(res, result.statusCode || 400, { ok: false, error: result.error });
            }
            sessionState.hostInitialized = true;
            schedulePersistSession();
            return sendJson(res, 200, {
                ok: true,
                item: result.item,
                pendingApprovals: getSanitizedPendingApprovals(true)
            });
        });
    }

    // API: Endereços de Rede do Host (ESTRITAMENTE RESTRITO AO HOST LOCALHOST — anti-vazamento de IP para clientes)
    if (req.method === 'GET' && pathname === '/api/host-network') {
        if (!isHost) {
            return sendJson(res, 403, { ok: false, error: 'Apenas o computador Host pode consultar seus endereços de rede.' });
        }
        return sendJson(res, 200, { ok: true, network: getLocalNetworkAddresses() });
    }

    // API: Verificar Senha da Sala antes de conectar SSE
    if (req.method === 'POST' && pathname === '/api/room/verify-passcode') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 64 * 1024) req.destroy();
        });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body || '{}');
                const deviceId = incoming.deviceId || '';
                const banned = isClientBanned(req, deviceId);
                if (banned) {
                    return sendJson(res, 403, { ok: false, banned: true, error: banned.reason || 'Acesso bloqueado nesta sala.' });
                }
                if (!sessionState.roomConfig.isOpen && !isHost) {
                    return sendJson(res, 403, { ok: false, closed: true, error: 'A sala online foi encerrada pelo Mestre.' });
                }
                if (!verifyRoomPasscode(req, incoming.passcode)) {
                    return sendJson(res, 401, { ok: false, error: 'Senha ou código de acesso da sala incorreto.' });
                }
                const entryApproved = isClientEntryApproved(req, deviceId);
                return sendJson(res, 200, {
                    ok: true,
                    entryApproved,
                    room: sanitizeRoomForClient(isHost, entryApproved)
                });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // API: Gestão Completa da Sala Online (Criar/Editar, Trancar, Fechar, Kick, Ban, Desbanir, Aprovar Sala de Espera)
    if (req.method === 'POST' && pathname === '/api/room/manage') {
        if (!isHost) {
            return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre no computador Host pode gerenciar a sala online.' });
        }
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 256 * 1024) req.destroy();
        });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body || '{}');
                const action = incoming.action;
                const rc = sessionState.roomConfig;

                if (action === 'open' || action === 'create_or_update') {
                    rc.isOpen = true;
                    if (typeof incoming.roomName === 'string' && incoming.roomName.trim()) {
                        rc.roomName = incoming.roomName.trim().slice(0, 80);
                    }
                    if (typeof incoming.passcode === 'string') {
                        rc.passcode = incoming.passcode.trim().slice(0, 40);
                    }
                    if (incoming.maxPlayers !== undefined) {
                        rc.maxPlayers = Math.max(1, Math.min(16, Number(incoming.maxPlayers) || 8));
                    }
                    if (incoming.isLocked !== undefined) {
                        rc.isLocked = Boolean(incoming.isLocked);
                    }
                    // Política fixa: clientes remotos nunca podem se tornar GM
                    rc.blockRemoteGm = true;
                    if (incoming.requireApproval !== undefined) {
                        rc.requireApproval = Boolean(incoming.requireApproval);
                    }
                    if (incoming.waitingTimeoutSeconds !== undefined) {
                        rc.waitingTimeoutSeconds = Math.max(15, Math.min(900, Number(incoming.waitingTimeoutSeconds) || 120));
                    }
                    rc.allowSelfProfileCreate = false;
                    if (incoming.regenerateCode) {
                        rc.roomCode = generateRoomCode();
                    }
                    rc.createdAt = rc.createdAt || Date.now();
                    broadcastSseEvent('room_update', {
                        room: sanitizeRoomForClient(false, true),
                        onlinePlayers: getOnlinePlayersList()
                    });
                } else if (action === 'approve_join') {
                    const resApprove = approveWaitingDevice(incoming.targetDeviceId || incoming.deviceId, 'host');
                    if (!resApprove.ok) return sendJson(res, 400, resApprove);
                } else if (action === 'reject_join') {
                    const resReject = rejectWaitingDevice(incoming.targetDeviceId || incoming.deviceId, incoming.reason || '', 'host');
                    if (!resReject.ok) return sendJson(res, 400, resReject);
                } else if (action === 'revoke_approval') {
                    const did = String(incoming.targetDeviceId || incoming.deviceId || '').trim();
                    if (did) approvedDevices.delete(did);
                } else if (action === 'toggle_lock') {
                    rc.isLocked = incoming.locked !== undefined ? Boolean(incoming.locked) : !rc.isLocked;
                    broadcastSseEvent('room_update', {
                        room: sanitizeRoomForClient(false, true),
                        onlinePlayers: getOnlinePlayersList()
                    });
                } else if (action === 'close') {
                    rc.isOpen = false;
                    approvedDevices.clear();
                    for (const [did] of waitingRoomQueue.entries()) {
                        notifyWaitingDevice(did, 'waiting_rejected', { status: 'rejected', reason: 'A sala online foi encerrada pelo Host.' }, true);
                    }
                    waitingRoomQueue.clear();
                    for (const client of Array.from(sseClients.values())) {
                        if (!client.isHost) {
                            closeClientWithEvent(client, 'room_closed', {
                                reason: incoming.reason || 'A sala online foi fechada pelo Mestre.'
                            });
                        }
                    }
                    broadcastSseEvent('room_update', {
                        room: sanitizeRoomForClient(false, true),
                        onlinePlayers: getOnlinePlayersList()
                    });
                    broadcastSseEvent('presence', {
                        onlinePlayers: getOnlinePlayersList(),
                        updatedAt: Date.now()
                    });
                } else if (action === 'kick') {
                    const targetCid = incoming.targetClientId;
                    const targetDid = incoming.targetDeviceId;
                    const reason = incoming.reason || 'Você foi desconectado da sala pelo Mestre.';
                    if (targetDid) approvedDevices.delete(String(targetDid));
                    for (const client of Array.from(sseClients.values())) {
                        if (client.isHost) continue;
                        if ((targetCid && client.clientId === targetCid) || (targetDid && client.deviceId === targetDid)) {
                            if (client.deviceId) approvedDevices.delete(String(client.deviceId));
                            closeClientWithEvent(client, 'kicked', { reason });
                        }
                    }
                    broadcastSseEvent('presence', {
                        onlinePlayers: getOnlinePlayersList(),
                        updatedAt: Date.now()
                    });
                } else if (action === 'ban') {
                    const targetCid = incoming.targetClientId;
                    const targetDid = incoming.targetDeviceId;
                    const targetPid = incoming.targetPlayerId;
                    const reason = incoming.reason || 'Acesso bloqueado pelo Mestre da sala.';
                    let matchedClient = null;
                    for (const client of sseClients.values()) {
                        if (client.isHost) continue;
                        if ((targetCid && client.clientId === targetCid) || (targetDid && client.deviceId === targetDid)) {
                            matchedClient = client;
                            break;
                        }
                    }
                    const banRecord = {
                        id: 'ban-' + Date.now().toString(36),
                        deviceId: (matchedClient?.deviceId || targetDid || ''),
                        ipHash: matchedClient?.ipHash || '',
                        playerId: (matchedClient?.playerId && matchedClient.playerId !== 'gm-master') ? matchedClient.playerId : (targetPid && targetPid !== 'gm-master' ? targetPid : ''),
                        label: incoming.label || matchedClient?.playerName || 'Jogador Banido',
                        reason,
                        bannedAt: Date.now()
                    };
                    rc.bannedEntries.push(banRecord);
                    if (banRecord.deviceId) {
                        approvedDevices.delete(String(banRecord.deviceId));
                        notifyWaitingDevice(banRecord.deviceId, 'waiting_rejected', { status: 'rejected', reason }, true);
                        waitingRoomQueue.delete(String(banRecord.deviceId));
                    }
                    for (const client of Array.from(sseClients.values())) {
                        if (client.isHost) continue;
                        const matches =
                            (banRecord.deviceId && client.deviceId === banRecord.deviceId) ||
                            (banRecord.ipHash && client.ipHash === banRecord.ipHash) ||
                            (banRecord.playerId && client.playerId === banRecord.playerId);
                        if (matches) {
                            closeClientWithEvent(client, 'banned', { reason });
                        }
                    }
                    broadcastSseEvent('presence', {
                        onlinePlayers: getOnlinePlayersList(),
                        updatedAt: Date.now()
                    });
                } else if (action === 'unban') {
                    const banId = incoming.banId;
                    rc.bannedEntries = (rc.bannedEntries || []).filter(b => b.id !== banId);
                }

                sessionState.updatedAt = Date.now();
                schedulePersistSession();
                return sendJson(res, 200, {
                    ok: true,
                    room: sanitizeRoomForClient(true, true),
                    onlinePlayers: getOnlinePlayersList(),
                    waitingRoom: getSanitizedWaitingRoomList(),
                    pendingApprovals: getSanitizedPendingApprovals(true)
                });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // API: Stream SSE em Tempo Real para Multiplayer (até 8 jogadores na LAN / VPN)
    if (req.method === 'GET' && pathname === '/api/events') {
        sweepWaitingRoomTimeouts();
        const clientId = parsedUrl.searchParams.get('clientId') || ('c-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
        const deviceId = parsedUrl.searchParams.get('deviceId') || '';
        let playerId = parsedUrl.searchParams.get('playerId') || (isHost ? 'gm-master' : '');
        let playerName = parsedUrl.searchParams.get('playerName') || (isHost ? 'Mestre (GM)' : 'Aguardando Login');
        let role = parsedUrl.searchParams.get('role') || (isHost ? 'gm' : 'player');
        const color = parsedUrl.searchParams.get('color') || '#d8b467';
        const avatarEmoji = parsedUrl.searchParams.get('avatarEmoji') || (role === 'gm' && isHost ? '👑' : '🛡️');
        const passcode = parsedUrl.searchParams.get('passcode') || '';

        const sendOneShotSseRejection = (eventType, dataObj) => {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'close'
            });
            res.write(`event: ${eventType}\ndata: ${JSON.stringify(dataObj)}\n\n`);
            res.end();
        };

        const banned = isClientBanned(req, deviceId, playerId);
        if (banned) {
            return sendOneShotSseRejection('banned', { reason: banned.reason || 'Você foi banido desta sala.' });
        }

        if (!sessionState.roomConfig.isOpen && !isHost) {
            return sendOneShotSseRejection('room_closed', { reason: 'A sala online foi encerrada pelo Mestre.' });
        }

        if (!verifyRoomPasscode(req, passcode)) {
            return sendOneShotSseRejection('auth_required', { reason: 'Senha da sala necessária.' });
        }

        if (!isClientEntryApproved(req, deviceId)) {
            return sendOneShotSseRejection('approval_required', {
                reason: 'Aguardando aprovação do Host na Sala de Espera.',
                waiting: true
            });
        }

        if (sessionState.roomConfig.isLocked && !isHost && !isDeviceConnected(deviceId)) {
            return sendOneShotSseRejection('room_locked', { reason: 'A sala está trancada para novos jogadores no momento.' });
        }

        const currentDevices = countConnectedUniqueDevices(deviceId);
        if (!isHost && currentDevices >= (Number(sessionState.roomConfig.maxPlayers) || 8)) {
            return sendOneShotSseRejection('room_full', { reason: `A sala atingiu o limite máximo de ${sessionState.roomConfig.maxPlayers} jogadores.` });
        }

        // Segurança crítica: não-hosts nunca podem entrar como Mestre (GM) ou usar gm-master
        if (!isHost) {
            role = 'player';
            const matchedPl = (sessionState.players || []).find(p => p.id === playerId);
            if (!playerId || playerId === 'gm-master' || (matchedPl && matchedPl.role === 'gm')) {
                playerId = '';
                playerName = 'Aguardando Login';
            }
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        const prevClient = sseClients.get(clientId);
        if (prevClient && prevClient.res && prevClient.res !== res) {
            try { prevClient.res.end(); } catch (e) {}
        }

        sseClients.set(clientId, {
            clientId,
            deviceId: deviceId || clientId,
            ipHash: hashIdentifier(getClientIp(req)),
            isHost,
            playerId,
            playerName,
            role,
            color,
            avatarEmoji,
            connectedAt: Date.now(),
            res
        });

        // Envia estado inicial ao conectar (sanitizando secrets para não-hosts)
        const initPayload = {
            isHostClient: isHost,
            entryApproved: true,
            session: sanitizeSessionForClient(isHost),
            room: sanitizeRoomForClient(isHost, true),
            onlinePlayers: getOnlinePlayersList(),
            pendingApprovals: getSanitizedPendingApprovals(isHost, deviceId)
        };
        if (isHost) {
            initPayload.waitingRoom = getSanitizedWaitingRoomList();
        }
        res.write(`event: init\ndata: ${JSON.stringify(initPayload)}\n\n`);

        broadcastSseEvent('presence', {
            onlinePlayers: getOnlinePlayersList(),
            updatedAt: Date.now()
        });

        req.on('close', () => {
            const activeEntry = sseClients.get(clientId);
            if (!activeEntry || activeEntry.res !== res) return;
            sseClients.delete(clientId);
            const hadCursor = ephemeralCursors.delete(clientId);
            const hadRuler = ephemeralRulers.delete(clientId);
            if (hadCursor || hadRuler) {
                broadcastSseEvent('delta', {
                    senderId: 'server',
                    senderClientId: clientId,
                    delta: { type: 'CLIENT_EPHEMERAL_CLEAR', clientId },
                    updatedAt: Date.now()
                });
            }
            broadcastSseEvent('presence', {
                onlinePlayers: getOnlinePlayersList(),
                updatedAt: Date.now()
            });
        });
        return;
    }

    // API: Escanear dinamicamente pastas existentes em public/ (monster, npc, item, map, curio, session)
    if (pathname === '/api/scan-compendium' && req.method === 'GET') {
        if (!isHost) {
            return sendJson(res, 403, { ok: false, error: 'Apenas o Host pode escanear pastas do computador.' });
        }
        try {
            const { scanned, counts } = scanCompendiumDirectories();
            return sendJson(res, 200, { ok: true, counts, scanned });
        } catch (err) {
            return sendJson(res, 500, { ok: false, error: err.message });
        }
    }

    if (pathname === '/api/scan-compendium' && req.method === 'POST') {
        if (!isHost) {
            return sendJson(res, 403, { ok: false, error: 'Apenas o Host pode importar pastas do servidor.' });
        }
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 256 * 1024) req.destroy();
        });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body || '{}');
                const mode = incoming.mode === 'replace' ? 'replace' : 'merge';
                const targetCats = Array.isArray(incoming.categories) && incoming.categories.length > 0
                    ? incoming.categories
                    : ['monsters', 'npcs', 'maps', 'items', 'curio', 'session'];
                const defaultVis = ['hidden', 'sighted', 'studied'].includes(incoming.defaultVisibility)
                    ? incoming.defaultVisibility
                    : null;

                const { scanned, counts } = scanCompendiumDirectories();
                const current = Object.assign({ monsters: {}, npcs: {}, maps: {}, items: {}, curio: {}, session: {} }, sessionState.compendioData || {});

                for (const catKey of targetCats) {
                    if (!scanned[catKey]) continue;
                    current[catKey] = (mode === 'replace')
                        ? scanned[catKey]
                        : mergeCatalogCollections(current[catKey], scanned[catKey]);
                    if (defaultVis) {
                        applyScannedVisibility(catKey, scanned[catKey], sessionState.knowledge, defaultVis);
                    }
                }

                sessionState.compendioData = current;
                sessionState.hostInitialized = true;
                sessionState.updatedAt = Date.now();
                const dadosPath = safePublicPath('dados.js');
                fs.writeFileSync(dadosPath, `const compendioData = ${JSON.stringify(current, null, 4)};\n`, 'utf8');
                schedulePersistSession();
                broadcastSessionSync(null, 'host-scan');

                return sendJson(res, 200, {
                    ok: true,
                    counts,
                    compendioData: current,
                    knowledge: sessionState.knowledge,
                    updatedAt: sessionState.updatedAt
                });
            } catch (err) {
                return sendJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    // API: Listar Mods instalados na pasta public/mods/
    if (req.method === 'GET' && pathname === '/api/mods') {
        try {
            const modsDir = safePublicPath('mods');
            if (!fs.existsSync(modsDir)) {
                fs.mkdirSync(modsDir, { recursive: true });
            }
            const entries = fs.readdirSync(modsDir, { withFileTypes: true });
            const mods = [];
            for (const ent of entries) {
                if (!ent.isFile()) continue;
                const ext = path.extname(ent.name).toLowerCase();
                if (ext === '.json' || ext === '.js') {
                    const fullPath = path.join(modsDir, ent.name);
                    const rawContent = fs.readFileSync(fullPath, 'utf8');
                    const content = rawContent.replace(/^\uFEFF/, '');
                    let parsed = null;
                    let parseError = null;
                    if (ext === '.json') {
                        try {
                            parsed = JSON.parse(content);
                            if (parsed && Array.isArray(parsed.mods)) {
                                parsed.mods.forEach((subMod, idx) => {
                                    mods.push({
                                        fileName: `${ent.name}#${idx + 1}`,
                                        path: `./mods/${ent.name}`,
                                        type: 'json',
                                        manifest: subMod
                                    });
                                });
                                continue;
                            }
                            if (Array.isArray(parsed)) {
                                parsed.forEach((subMod, idx) => {
                                    mods.push({
                                        fileName: `${ent.name}#${idx + 1}`,
                                        path: `./mods/${ent.name}`,
                                        type: 'json',
                                        manifest: subMod
                                    });
                                });
                                continue;
                            }
                        } catch (e) {
                            parseError = e.message;
                        }
                    } else if (ext === '.js') {
                        const baseName = ent.name.replace(/\.js$/i, '');
                        parsed = {
                            id: 'mod-script-' + baseName.toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
                            name: baseName.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                            version: '1.0',
                            description: `Script JS carregado de ${ent.name}`,
                            scriptCode: content,
                            sourceFile: ent.name
                        };
                    }
                    mods.push({
                        fileName: ent.name,
                        path: `./mods/${ent.name}`,
                        type: ext.slice(1),
                        manifest: parsed,
                        error: parseError
                    });
                }
            }
            return sendJson(res, 200, { ok: true, mods });
        } catch (err) {
            return sendJson(res, 500, { ok: false, error: err.message });
        }
    }

    // API Base para Sessão Multiplayer Local / LAN (Identidade, Personagens, Tabletop, Combate, Dados e Regras)
    if (req.method === 'GET' && pathname === '/api/session') {
        const deviceId = parsedUrl.searchParams.get('deviceId') || '';
        const passcode = parsedUrl.searchParams.get('passcode') || req.headers['x-room-passcode'] || '';
        const banned = isClientBanned(req, deviceId);
        if (banned) {
            return sendJson(res, 403, { ok: false, banned: true, error: banned.reason || 'Banido da sala.' });
        }
        if (!sessionState.roomConfig.isOpen && !isHost) {
            return sendJson(res, 403, { ok: false, closed: true, error: 'Sala fechada.' });
        }
        if (!verifyRoomPasscode(req, passcode)) {
            return sendJson(res, 401, { ok: false, authRequired: true, error: 'Senha necessária.' });
        }
        if (!isClientEntryApproved(req, deviceId)) {
            return sendJson(res, 403, {
                ok: false,
                approvalRequired: true,
                waiting: true,
                error: 'Sua entrada aguarda aprovação do Host na Sala de Espera.'
            });
        }
        const getPayload = {
            ok: true,
            isHostClient: isHost,
            entryApproved: true,
            session: sanitizeSessionForClient(isHost),
            room: sanitizeRoomForClient(isHost, true),
            onlinePlayers: getOnlinePlayersList(),
            pendingApprovals: getSanitizedPendingApprovals(isHost, deviceId)
        };
        if (isHost) getPayload.waitingRoom = getSanitizedWaitingRoomList();
        return sendJson(res, 200, getPayload);
    }

    if (req.method === 'POST' && pathname === '/api/session') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 15 * 1024 * 1024) req.destroy();
        });
        req.on('end', () => {
            try {
                const incoming = JSON.parse(body);
                const senderClientId = incoming.clientId || null;
                const deviceId = incoming.deviceId || senderClientId || '';
                const senderId = incoming.senderId || (isHost ? 'gm-master' : '');
                const passcode = incoming.passcode || req.headers['x-room-passcode'] || '';

                const banned = isClientBanned(req, deviceId, senderId);
                if (banned) {
                    return sendJson(res, 403, { ok: false, banned: true, error: banned.reason || 'Acesso bloqueado nesta sala.' });
                }
                if (!sessionState.roomConfig.isOpen && !isHost) {
                    return sendJson(res, 403, { ok: false, closed: true, error: 'A sala está fechada pelo Mestre.' });
                }
                if (!verifyRoomPasscode(req, passcode)) {
                    return sendJson(res, 401, { ok: false, authRequired: true, error: 'Senha incorreta.' });
                }
                if (!isClientEntryApproved(req, deviceId)) {
                    return sendJson(res, 403, {
                        ok: false,
                        approvalRequired: true,
                        waiting: true,
                        error: 'Sua entrada aguarda aprovação do Host antes de interagir com a sala.'
                    });
                }

                // Segurança crítica: não-hosts nunca podem entrar/agir como Mestre nem sem conta aprovada
                if (!isHost) {
                    if (incoming.senderRole === 'gm' || senderId === 'gm-master') {
                        return sendJson(res, 403, {
                            ok: false,
                            gmBlocked: true,
                            error: 'Apenas o Host pode entrar ou atuar como Mestre (GM).'
                        });
                    }
                    const senderPlayer = (sessionState.players || []).find(p => p.id === senderId);
                    if (!senderId || !senderPlayer || senderPlayer.role === 'gm') {
                        return sendJson(res, 403, {
                            ok: false,
                            accountRequired: true,
                            error: 'Selecione ou solicite uma conta de jogador válida antes de interagir com a sala.'
                        });
                    }
                }

                // Atualiza presença se o cliente informou identidade/cor/avatar
                if (senderClientId && sseClients.has(senderClientId)) {
                    const cl = sseClients.get(senderClientId);
                    if (incoming.senderId) cl.playerId = isHost ? incoming.senderId : senderId;
                    if (incoming.senderName) cl.playerName = incoming.senderName;
                    if (incoming.senderRole) {
                        cl.role = isHost ? incoming.senderRole : 'player';
                    }
                    if (incoming.senderColor) cl.color = incoming.senderColor;
                    if (incoming.senderAvatar) cl.avatarEmoji = incoming.senderAvatar;
                }

                const isEffectiveGm = isEffectiveGmSender(isHost, incoming);

                // 1. Deltas cirúrgicos (evitam condição de corrida entre múltiplos jogadores)
                if (incoming.delta && typeof incoming.delta === 'object') {
                    const d = incoming.delta;
                    const now = Date.now();

                    if (!isHost && (d.type === 'PLAYER_CREATE' || d.type === 'PLAYER_UPDATE' || d.type === 'PLAYER_DELETE')) {
                        return sendJson(res, 403, {
                            ok: false,
                            approvalRequired: true,
                            error: 'Criação, edição ou remoção de jogadores exige aprovação do Host.'
                        });
                    }

                    // Deltas efêmeros de altíssima frequência (cursor "Mãozinha" + régua por cliente): não persistem em disco
                    if (d.type === 'CURSOR_MOVE' || d.type === 'RULER_UPDATE' || d.type === 'RULER_CLEAR' || d.type === 'CLIENT_EPHEMERAL_CLEAR') {
                        const cid = d.clientId || senderClientId || senderId;
                        if (d.type === 'CURSOR_MOVE') {
                            if (d.visible === false) {
                                ephemeralCursors.delete(cid);
                            } else {
                                ephemeralCursors.set(cid, {
                                    clientId: cid,
                                    playerId: d.playerId || senderId,
                                    playerName: d.playerName || incoming.senderName || 'Jogador',
                                    color: d.color || incoming.senderColor || '#d8b467',
                                    x: Number(d.x) || 0,
                                    y: Number(d.y) || 0,
                                    visible: true,
                                    updatedAt: now
                                });
                            }
                            d.clientId = cid;
                        } else if (d.type === 'RULER_UPDATE' && d.ruler) {
                            const rObj = Object.assign({}, d.ruler, { clientId: cid, updatedAt: now });
                            ephemeralRulers.set(cid, rObj);
                            d.clientId = cid;
                            d.ruler = rObj;
                        } else if (d.type === 'RULER_CLEAR' || d.type === 'CLIENT_EPHEMERAL_CLEAR') {
                            ephemeralRulers.delete(cid);
                            if (d.type === 'CLIENT_EPHEMERAL_CLEAR') ephemeralCursors.delete(cid);
                            d.clientId = cid;
                        }
                        broadcastSseEvent('delta', {
                            senderId,
                            senderClientId,
                            delta: d,
                            updatedAt: now
                        }, senderClientId);
                        return sendJson(res, 200, { ok: true, ephemeral: true, updatedAt: now });
                    }

                    const tt = ensureTabletopContainer();

                    if (d.type === 'TOKEN_MOVE' && d.token) {
                        const idx = tt.tokens.findIndex(t => t.id === d.token.id);
                        if (idx >= 0) {
                            const curTok = tt.tokens[idx];
                            if (!isEffectiveGm && (curTok.hiddenFromPlayers || curTok.locked || (curTok.ownerId && curTok.ownerId !== senderId && !curTok.allowPlayersMove))) {
                                return sendJson(res, 403, { ok: false, error: 'Token travado, oculto ou pertence a outro jogador.' });
                            }
                            const movePatch = isEffectiveGm ? d.token : {
                                x: d.token.x,
                                y: d.token.y
                            };
                            Object.assign(curTok, movePatch);
                        } else {
                            if (!isEffectiveGm && d.token.hiddenFromPlayers) {
                                return sendJson(res, 403, { ok: false, error: 'Sem permissão para posicionar token oculto.' });
                            }
                            tt.tokens.push(d.token);
                        }
                    } else if (d.type === 'TOKEN_UPSERT' && d.token) {
                        const idx = tt.tokens.findIndex(t => t.id === d.token.id);
                        if (idx >= 0) {
                            const curTok = tt.tokens[idx];
                            if (!isEffectiveGm && (curTok.hiddenFromPlayers || curTok.locked || (curTok.ownerId && curTok.ownerId !== senderId && !curTok.allowPlayersMove))) {
                                return sendJson(res, 403, { ok: false, error: 'Sem permissão para alterar este token.' });
                            }
                            const incomingTok = Object.assign({}, d.token);
                            if (!isEffectiveGm) {
                                delete incomingTok.hiddenFromPlayers;
                                delete incomingTok.revealItemCountToPlayers;
                                delete incomingTok.lootPolicy;
                                delete incomingTok.allowedPlayerIds;
                                delete incomingTok.allowedCharIds;
                            }
                            tt.tokens[idx] = Object.assign({}, curTok, incomingTok);
                        } else {
                            const incomingTok = Object.assign({}, d.token);
                            if (!isEffectiveGm) {
                                delete incomingTok.hiddenFromPlayers;
                                delete incomingTok.revealItemCountToPlayers;
                            }
                            tt.tokens.push(incomingTok);
                        }
                    } else if (d.type === 'TOKEN_DELETE' && d.tokenId) {
                        const idx = tt.tokens.findIndex(t => t.id === d.tokenId);
                        if (idx >= 0) {
                            const curTok = tt.tokens[idx];
                            if (!isEffectiveGm && (curTok.hiddenFromPlayers || curTok.locked || (curTok.ownerId && curTok.ownerId !== senderId))) {
                                return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre ou o dono pode remover este token.' });
                            }
                            tt.tokens.splice(idx, 1);
                        }
                    } else if (d.type === 'SHAPE_UPSERT' && d.shape) {
                        const idx = tt.aoeTemplates.findIndex(s => s.id === d.shape.id);
                        if (idx >= 0) {
                            tt.aoeTemplates[idx] = Object.assign({}, tt.aoeTemplates[idx], d.shape);
                        } else {
                            tt.aoeTemplates.push(d.shape);
                        }
                    } else if (d.type === 'SHAPE_DELETE' && d.shapeId) {
                        tt.aoeTemplates = tt.aoeTemplates.filter(s => s.id !== d.shapeId);
                    } else if (d.type === 'FOG_UPSERT' && d.fog) {
                        if (!isEffectiveGm) return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre pode editar a Névoa de Guerra.' });
                        const idx = tt.fogRects.findIndex(f => f.id === d.fog.id);
                        if (idx >= 0) tt.fogRects[idx] = Object.assign({}, tt.fogRects[idx], d.fog);
                        else tt.fogRects.push(d.fog);
                    } else if (d.type === 'FOG_DELETE' && d.fogId) {
                        if (!isEffectiveGm) return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre pode remover a Névoa de Guerra.' });
                        tt.fogRects = tt.fogRects.filter(f => f.id !== d.fogId);
                    } else if (d.type === 'FOG_TOGGLE') {
                        if (!isEffectiveGm) return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre pode alternar a Névoa de Guerra.' });
                        tt.fogEnabled = Boolean(d.fogEnabled);
                    } else if (d.type === 'TABLETOP_META' && d.meta && typeof d.meta === 'object') {
                        if (!isEffectiveGm) {
                            return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre pode alterar grade, snap, calibração ou mapa do Tabletop.' });
                        }
                        const allowedKeys = ['gridEnabled', 'gridSize', 'gridSizeY', 'gridOffsetX', 'gridOffsetY', 'gridSnap', 'snapToGrid', 'fogEnabled', 'mapBg', 'mapPath', 'fogRegions', 'activeMapKey', 'activeMapName', 'stageWidth', 'stageHeight'];
                        for (const k of allowedKeys) {
                            if (d.meta[k] !== undefined) tt[k] = d.meta[k];
                        }
                        if (d.meta.snapToGrid !== undefined) tt.gridSnap = Boolean(d.meta.snapToGrid);
                        else if (d.meta.gridSnap !== undefined) tt.snapToGrid = Boolean(d.meta.gridSnap);
                    } else if (d.type === 'CHEST_UPDATE' && d.tokenId) {
                        if (!isEffectiveGm) {
                            return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre pode editar o conteúdo ou tranca do baú.' });
                        }
                        const tok = tt.tokens.find(t => t.id === d.tokenId);
                        if (!tok) return sendJson(res, 404, { ok: false, error: 'Baú não encontrado no tabletop.' });
                        if (d.patch && typeof d.patch === 'object') Object.assign(tok, d.patch);
                    } else if (d.type === 'CHEST_LOOT' && d.tokenId) {
                        const tok = tt.tokens.find(t => t.id === d.tokenId);
                        if (!tok) return sendJson(res, 404, { ok: false, error: 'Baú não encontrado no tabletop.' });
                        if (!isEffectiveGm) {
                            const permCheck = canPlayerLootTokenServer(tok, senderId, d.targetCharId || '');
                            if (!permCheck.ok) {
                                return sendJson(res, permCheck.status || 403, { ok: false, error: permCheck.error });
                            }
                        }
                        if (!Array.isArray(tok.chestItems)) tok.chestItems = [];
                        tok.chestGold = Math.max(0, Number(tok.chestGold) || 0);

                        if (d.lootGold) {
                            const reqAmt = d.amount === 'all' ? tok.chestGold : Math.max(0, Math.floor(Number(d.amount) || 0));
                            if (tok.chestGold <= 0 || reqAmt <= 0) {
                                return sendJson(res, 409, { ok: false, error: 'Não há mais ouro disponível neste baú.' });
                            }
                            const takenGold = Math.min(tok.chestGold, reqAmt);
                            tok.chestGold -= takenGold;
                            d.takenGold = takenGold;
                            d.remainingGold = tok.chestGold;
                        } else {
                            let itemIdx = -1;
                            if (d.takeItemId) {
                                itemIdx = tok.chestItems.findIndex(it => it && it.id === d.takeItemId);
                            } else if (typeof d.takeItemIdx === 'number' && d.takeItemIdx >= 0 && d.takeItemIdx < tok.chestItems.length) {
                                itemIdx = d.takeItemIdx;
                            }
                            if (itemIdx < 0) {
                                return sendJson(res, 409, { ok: false, error: 'Este item já foi saqueado por outro jogador.' });
                            }
                            const [taken] = tok.chestItems.splice(itemIdx, 1);
                            d.takenItem = taken;
                        }
                        d.updatedToken = { id: tok.id, chestItems: tok.chestItems, chestGold: tok.chestGold, locked: Boolean(tok.locked) };
                    } else if (d.type === 'GOLD_COLLECT' && d.tokenId) {
                        const idx = tt.tokens.findIndex(t => t.id === d.tokenId);
                        if (idx < 0) {
                            return sendJson(res, 409, { ok: false, error: 'Este ouro já foi recolhido!' });
                        }
                        const tok = tt.tokens[idx];
                        if (!isEffectiveGm) {
                            const permCheck = canPlayerLootTokenServer(tok, senderId, d.targetCharId || '');
                            if (!permCheck.ok) {
                                return sendJson(res, permCheck.status || 403, { ok: false, error: permCheck.error });
                            }
                        }
                        const avail = Math.max(0, Number(tok.goldAmount) || 0);
                        if (avail <= 0) {
                            return sendJson(res, 409, { ok: false, error: 'Este ouro já está zerado!' });
                        }
                        const wanted = (d.amount === 'all' || !d.amount) ? avail : Math.max(1, Math.floor(Number(d.amount) || 0));
                        const collected = Math.min(avail, wanted);
                        tok.goldAmount = avail - collected;
                        d.collectedAmount = collected;
                        d.remainingGold = tok.goldAmount;
                        if (tok.goldAmount <= 0 && d.removeIfEmpty !== false) {
                            tt.tokens.splice(idx, 1);
                            d.removed = true;
                        }
                    } else if (d.type === 'COMBAT_PATCH') {
                        if (!Array.isArray(sessionState.combatCards)) sessionState.combatCards = [];
                        if (d.card && d.card.id) {
                            const cidx = sessionState.combatCards.findIndex(c => c.id === d.card.id);
                            if (cidx >= 0) sessionState.combatCards[cidx] = Object.assign({}, sessionState.combatCards[cidx], d.card);
                            else sessionState.combatCards.push(d.card);
                        }
                        if (d.removeCardId) {
                            sessionState.combatCards = sessionState.combatCards.filter(c => c.id !== d.removeCardId);
                        }
                        if (d.combatTurn && typeof d.combatTurn === 'object') {
                            sessionState.combatTurn = Object.assign({}, sessionState.combatTurn || {}, d.combatTurn);
                        }
                    } else if (d.type === 'CHARACTER_UPDATE' && d.character && Array.isArray(sessionState.characters)) {
                        const idx = sessionState.characters.findIndex(c => c.id === d.character.id);
                        if (!isEffectiveGm) {
                            if (idx < 0) {
                                return sendJson(res, 403, {
                                    ok: false,
                                    approvalRequired: true,
                                    error: 'Criação de novos personagens exige aprovação do Host/Mestre.'
                                });
                            }
                            const existingChar = sessionState.characters[idx];
                            if (existingChar.ownerId && existingChar.ownerId !== senderId) {
                                return sendJson(res, 403, { ok: false, error: 'Sem permissão para alterar a ficha de outro jogador.' });
                            }
                            if (d.character.ownerId && d.character.ownerId !== existingChar.ownerId) {
                                return sendJson(res, 403, {
                                    ok: false,
                                    approvalRequired: true,
                                    error: 'Troca de dono de personagem exige aprovação do Host/Mestre.'
                                });
                            }
                        }
                        if (idx >= 0) {
                            sessionState.characters[idx] = d.character;
                        } else {
                            sessionState.characters.push(d.character);
                        }
                    } else if (d.type === 'DICE_ROLL' && d.roll) {
                        sessionState.diceLog.push(d.roll);
                        if (sessionState.diceLog.length > 80) {
                            sessionState.diceLog = sessionState.diceLog.slice(-80);
                        }
                    } else if (d.type === 'DICE_CLEAR') {
                        sessionState.diceLog = [];
                    } else if (d.type === 'MAP_PING' && d.ping) {
                        sessionState.lastPing = d.ping;
                    } else if (d.type === 'STUDY_REQUEST') {
                        sessionState.lastStudyRequest = Object.assign({ id: 'study-' + now, at: now }, d);
                    } else if (d.type === 'PRESENCE_UPDATE') {
                        broadcastSseEvent('presence', {
                            onlinePlayers: getOnlinePlayersList(),
                            updatedAt: now
                        });
                        return sendJson(res, 200, { ok: true, updatedAt: now });
                    }
                    if (isHost) sessionState.hostInitialized = true;
                    sessionState.updatedAt = now;
                    schedulePersistSession();
                    broadcastDeltaEvent(d, senderId, senderClientId);
                    return sendJson(res, 200, {
                        ok: true,
                        updatedAt: sessionState.updatedAt,
                        takenItem: d.takenItem || null,
                        takenGold: d.takenGold || 0,
                        collectedAmount: d.collectedAmount || 0,
                        remainingGold: d.remainingGold !== undefined ? d.remainingGold : null,
                        removed: Boolean(d.removed),
                        token: d.updatedToken || null
                    });
                }

                // 2. Sincronização de estado de módulos
                const isAuthorizedHostGm = isHost && incoming.senderRole !== 'player';
                if (Array.isArray(incoming.players)) {
                    if (!isHost) {
                        const stripPl = (arr) => (arr || []).map(p => ({
                            id: p.id, name: p.name, role: p.role, color: p.color, avatarEmoji: p.avatarEmoji
                        }));
                        if (JSON.stringify(stripPl(incoming.players)) !== JSON.stringify(stripPl(sessionState.players))) {
                            return sendJson(res, 403, {
                                ok: false,
                                approvalRequired: true,
                                error: 'Criação, edição ou remoção de jogadores exige aprovação do Host.'
                            });
                        }
                    } else {
                        const existingPinMap = new Map((sessionState.players || []).map(p => [p.id, p.pin || '']));
                        sessionState.players = incoming.players.map(p => {
                            if (p.pin === undefined && existingPinMap.has(p.id)) {
                                return Object.assign({}, p, { pin: existingPinMap.get(p.id) });
                            }
                            return p;
                        });
                        ensureDefaultPlayersIfEmpty();
                    }
                }
                if (Array.isArray(incoming.characters)) {
                    if (isEffectiveGm) {
                        sessionState.characters = incoming.characters;
                    } else {
                        const existingById = new Map((sessionState.characters || []).map(c => [c.id, c]));
                        for (const incChar of incoming.characters) {
                            if (!incChar || !incChar.id) continue;
                            const cur = existingById.get(incChar.id);
                            if (!cur) {
                                return sendJson(res, 403, {
                                    ok: false,
                                    approvalRequired: true,
                                    error: 'Criação de novos personagens exige aprovação do Host/Mestre.'
                                });
                            }
                            if (incChar.ownerId && cur.ownerId && incChar.ownerId !== cur.ownerId) {
                                return sendJson(res, 403, {
                                    ok: false,
                                    approvalRequired: true,
                                    error: 'Troca de dono de personagem exige aprovação do Host/Mestre.'
                                });
                            }
                        }
                        // Aplica somente atualizações feitas pelo dono nas fichas existentes que ele controla
                        const incMap = new Map(incoming.characters.map(c => [c.id, c]));
                        sessionState.characters = (sessionState.characters || []).map(cur => {
                            if (cur.ownerId === senderId && incMap.has(cur.id)) {
                                const nxt = incMap.get(cur.id);
                                return Object.assign({}, nxt, { ownerId: cur.ownerId, ownerName: cur.ownerName });
                            }
                            return cur;
                        });
                    }
                }
                if (isEffectiveGm && incoming.tabletop && typeof incoming.tabletop === 'object') {
                    sessionState.tabletop = incoming.tabletop;
                    if (sessionState.tabletop.snapToGrid !== undefined) {
                        sessionState.tabletop.gridSnap = Boolean(sessionState.tabletop.snapToGrid);
                    } else if (sessionState.tabletop.gridSnap !== undefined) {
                        sessionState.tabletop.snapToGrid = Boolean(sessionState.tabletop.gridSnap);
                    }
                }
                if (isAuthorizedHostGm) {
                    if (incoming.knowledge && typeof incoming.knowledge === 'object') sessionState.knowledge = incoming.knowledge;
                    if (incoming.compendioData && typeof incoming.compendioData === 'object') sessionState.compendioData = incoming.compendioData;
                    if (Array.isArray(incoming.quests)) sessionState.quests = incoming.quests;
                    if (Array.isArray(incoming.hitDice)) sessionState.hitDice = incoming.hitDice;
                    if (incoming.rules && typeof incoming.rules === 'object') sessionState.rules = incoming.rules;
                    if (Array.isArray(incoming.activeMods)) sessionState.activeMods = incoming.activeMods;
                }
                if (isEffectiveGm) {
                    if (Array.isArray(incoming.combatCards)) sessionState.combatCards = incoming.combatCards;
                    if (incoming.combatTurn && typeof incoming.combatTurn === 'object') sessionState.combatTurn = incoming.combatTurn;
                    if (Array.isArray(incoming.diceLog)) sessionState.diceLog = incoming.diceLog.slice(-80);
                }
                if (isHost) sessionState.hostInitialized = true;
                sessionState.updatedAt = Date.now();
                schedulePersistSession();

                broadcastSessionSync(senderClientId, senderId);
                broadcastSseEvent('presence', {
                    onlinePlayers: getOnlinePlayersList(),
                    updatedAt: sessionState.updatedAt
                });

                return sendJson(res, 200, {
                    ok: true,
                    updatedAt: sessionState.updatedAt,
                    hostInitialized: Boolean(sessionState.hostInitialized)
                });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // API: Salvar arquivos e atualizar dados.js (restrito ao Host para segurança de escrita em disco)
    if (req.method === 'POST' && pathname === '/api/save') {
        if (!isHost) {
            return sendJson(res, 403, { ok: false, error: 'Apenas o computador Host pode gravar arquivos permanentes no disco.' });
        }
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 50 * 1024 * 1024) {
                req.destroy();
            }
        });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);

                // 0. Remover arquivos excluídos pelo usuário (se informados em deletePaths)
                if (Array.isArray(payload.deletePaths)) {
                    for (const delRel of payload.deletePaths) {
                        if (!delRel) continue;
                        try {
                            const delTarget = safePublicPath(delRel);
                            if (fs.existsSync(delTarget) && fs.statSync(delTarget).isFile()) {
                                fs.unlinkSync(delTarget);
                            }
                        } catch (e) {}
                    }
                }

                // 1. Gravar arquivos enviados (JSON, HTML, Imagens em base64)
                if (Array.isArray(payload.files)) {
                    for (const file of payload.files) {
                        if (!file || !file.path) continue;
                        const targetPath = safePublicPath(file.path);
                        fs.mkdirSync(path.dirname(targetPath), { recursive: true });

                        if (typeof file.base64 === 'string') {
                            const base64Data = file.base64.replace(/^data:[^;]+;base64,/, '');
                            fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
                        } else if (typeof file.content === 'string') {
                            fs.writeFileSync(targetPath, file.content, 'utf8');
                        }
                    }
                }

                // 2. Atualizar public/dados.js e propagar em tempo real na sessão online
                if (payload.compendioData && typeof payload.compendioData === 'object') {
                    const dadosPath = safePublicPath('dados.js');
                    const jsContent = `const compendioData = ${JSON.stringify(payload.compendioData, null, 4)};\n`;
                    fs.writeFileSync(dadosPath, jsContent, 'utf8');
                    sessionState.compendioData = payload.compendioData;
                }
                if (payload.knowledge && typeof payload.knowledge === 'object') {
                    sessionState.knowledge = payload.knowledge;
                }
                if (payload.compendioData || payload.knowledge) {
                    sessionState.hostInitialized = true;
                    sessionState.updatedAt = Date.now();
                    schedulePersistSession();
                    broadcastSessionSync(null, 'host-save');
                }

                return sendJson(res, 200, { ok: true, message: 'Salvo com sucesso nos arquivos do projeto!' });
            } catch (err) {
                console.error('Erro ao salvar:', err);
                return sendJson(res, 500, { ok: false, error: err.message });
            }
        });
        return;
    }

    // Servir arquivos estáticos da pasta public/
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    let filePath;
    try {
        filePath = safePublicPath(reqPath);
    } catch (e) {
        res.writeHead(403);
        return res.end('Acesso negado');
    }

    // Nunca servir session-state.json diretamente como arquivo estático (contém PINs e estado da sala)
    if (path.resolve(filePath) === path.resolve(SESSION_STATE_FILE)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Acesso restrito');
    }

    // Não servir dados.js bruto do disco para clientes remotos (evita vazar conteúdo oculto antes da aprovação/filtro)
    if (!isHost && path.resolve(filePath) === path.resolve(path.join(PUBLIC_DIR, 'dados.js'))) {
        res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        return res.end('const compendioData = { monsters: {}, npcs: {}, maps: {}, items: {}, curio: {}, session: {} };\n');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Arquivo não encontrado');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

function executeServerCliCommand(rawLine) {
    const line = String(rawLine || '').trim();
    if (!line) return '';
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg1 = parts[1] || '';
    const rest = parts.slice(2).join(' ');
    const rc = sessionState.roomConfig;

    if (cmd === 'help' || cmd === '?') {
        return [
            'Comandos do Servidor Terminal:',
            '  status                - Exibe resumo da sala, online, espera e aprovações pendentes',
            '  waiting               - Lista dispositivos aguardando aprovação na Sala de Espera',
            '  approvals             - Lista solicitações pendentes (contas / personagens)',
            '  approve <id|all>      - Aprova entrada na Sala de Espera (deviceId/id) ou solicitação (apr-...)',
            '  reject <id> [motivo]  - Recusa entrada na Sala de Espera ou solicitação (apr-...)',
            '  kick <client|device>  - Desconecta um cliente online',
            '  open / close          - Abre ou fecha a sala online',
            '  lock / unlock         - Tranca ou destranca a sala para novas entradas',
            '  timeout <seg>         - Define tempo limite (15-900s) da Sala de Espera',
            '  quit / exit           - Encerra o servidor'
        ].join('\n');
    }

    if (cmd === 'status') {
        sweepWaitingRoomTimeouts();
        const online = getOnlinePlayersList();
        const waiting = getSanitizedWaitingRoomList();
        const pending = getSanitizedPendingApprovals(true).filter(a => a.status === 'pending');
        return [
            `Sala: "${rc.roomName}" | Código: ${rc.roomCode} | Aberta: ${rc.isOpen ? 'SIM' : 'NÃO'} | Trancada: ${rc.isLocked ? 'SIM' : 'NÃO'}`,
            `Política: Aprovação Obrigatória=${rc.requireApproval !== false ? 'SIM' : 'NÃO'} (${rc.waitingTimeoutSeconds || 120}s) | Bloquear Mestre Remoto=SIM`,
            `Online (${online.length}): ${online.map(o => `${o.playerName || 'Sem Conta'}[${o.clientId}]`).join(', ') || 'nenhum'}`,
            `Sala de Espera (${waiting.length}): ${waiting.map(w => `${w.requestedName}(${w.deviceId}, ${Math.ceil(w.remainingMs / 1000)}s)`).join(', ') || 'vazia'}`,
            `Solicitações Pendentes (${pending.length}): ${pending.map(p => `${p.id}: ${p.summary}`).join(' | ') || 'nenhuma'}`
        ].join('\n');
    }

    if (cmd === 'waiting') {
        sweepWaitingRoomTimeouts();
        const waiting = getSanitizedWaitingRoomList();
        if (!waiting.length) return 'Nenhum dispositivo aguardando na Sala de Espera.';
        return waiting.map((w, i) => `${i + 1}. [${w.deviceId}] "${w.requestedName}" — resta ${Math.ceil(w.remainingMs / 1000)}s`).join('\n');
    }

    if (cmd === 'approvals') {
        const pending = getSanitizedPendingApprovals(true).filter(a => a.status === 'pending');
        if (!pending.length) return 'Nenhuma solicitação pendente de contas ou personagens.';
        return pending.map(p => `- [${p.id}] (${p.type}) por ${p.requestedByName}: ${p.summary}`).join('\n');
    }

    if (cmd === 'approve') {
        if (!arg1) return 'Uso: approve <deviceId | apr-id | all>';
        if (arg1.toLowerCase() === 'all') {
            let count = 0;
            for (const w of getSanitizedWaitingRoomList()) {
                if (approveWaitingDevice(w.deviceId, 'terminal').ok) count++;
            }
            for (const p of getSanitizedPendingApprovals(true).filter(a => a.status === 'pending')) {
                if (resolvePendingApproval(p.id, 'approve', '', 'terminal').ok) count++;
            }
            return `Aprovadas ${count} pendência(s).`;
        }
        if (arg1.startsWith('apr-')) {
            const r = resolvePendingApproval(arg1, 'approve', rest, 'terminal');
            return r.ok ? `Solicitação ${arg1} aprovada.` : `Erro: ${r.error}`;
        }
        const matchWait = getSanitizedWaitingRoomList().find(w => w.deviceId === arg1 || w.id === arg1 || w.deviceId.endsWith(arg1));
        const targetDev = matchWait ? matchWait.deviceId : arg1;
        const r = approveWaitingDevice(targetDev, 'terminal');
        return r.ok ? `Entrada aprovada para dispositivo ${targetDev}.` : `Erro: ${r.error}`;
    }

    if (cmd === 'reject') {
        if (!arg1) return 'Uso: reject <deviceId | apr-id> [motivo]';
        if (arg1.startsWith('apr-')) {
            const r = resolvePendingApproval(arg1, 'reject', rest, 'terminal');
            return r.ok ? `Solicitação ${arg1} recusada.` : `Erro: ${r.error}`;
        }
        const matchWait = getSanitizedWaitingRoomList().find(w => w.deviceId === arg1 || w.id === arg1 || w.deviceId.endsWith(arg1));
        const targetDev = matchWait ? matchWait.deviceId : arg1;
        const r = rejectWaitingDevice(targetDev, rest, 'terminal');
        return r.ok ? `Entrada recusada para dispositivo ${targetDev}.` : `Erro: ${r.error}`;
    }

    if (cmd === 'kick') {
        if (!arg1) return 'Uso: kick <clientId|deviceId>';
        let kicked = 0;
        for (const client of Array.from(sseClients.values())) {
            if (client.isHost) continue;
            if (client.clientId === arg1 || client.deviceId === arg1) {
                approvedDevices.delete(client.deviceId);
                closeClientWithEvent(client, 'kicked', { reason: rest || 'Desconectado via console do servidor.' });
                kicked++;
            }
        }
        if (kicked > 0) {
            broadcastSseEvent('presence', { onlinePlayers: getOnlinePlayersList(), updatedAt: Date.now() });
        }
        return kicked > 0 ? `${kicked} cliente(s) desconectado(s).` : 'Nenhum cliente correspondente encontrado.';
    }

    if (cmd === 'open') {
        rc.isOpen = true;
        schedulePersistSession();
        broadcastSseEvent('room_update', { room: sanitizeRoomForClient(false, true), onlinePlayers: getOnlinePlayersList() });
        return 'Sala online ABERTA.';
    }
    if (cmd === 'close') {
        rc.isOpen = false;
        approvedDevices.clear();
        for (const client of Array.from(sseClients.values())) {
            if (!client.isHost) closeClientWithEvent(client, 'room_closed', { reason: 'Sala fechada pelo servidor.' });
        }
        schedulePersistSession();
        return 'Sala online FECHADA.';
    }
    if (cmd === 'lock' || cmd === 'unlock') {
        rc.isLocked = (cmd === 'lock');
        schedulePersistSession();
        broadcastSseEvent('room_update', { room: sanitizeRoomForClient(false, true), onlinePlayers: getOnlinePlayersList() });
        return `Sala ${rc.isLocked ? 'TRANCADA' : 'DESTRANCADA'}.`;
    }
    if (cmd === 'timeout') {
        const sec = Math.max(15, Math.min(900, Number(arg1) || 120));
        rc.waitingTimeoutSeconds = sec;
        schedulePersistSession();
        return `Tempo limite da Sala de Espera ajustado para ${sec}s.`;
    }
    if (cmd === 'quit' || cmd === 'exit') {
        return '__QUIT__';
    }
    return `Comando desconhecido: "${cmd}". Digite "help" para ver os comandos.`;
}

server.listen(PORT, '0.0.0.0', () => {
    const url = `http://localhost:${PORT}`;
    const netInfo = getLocalNetworkAddresses();
    console.log('====================================================');
    console.log(IS_SERVER_MODE
        ? '   COMPENDIO RPG - MODO SERVIDOR TERMINAL (--server)'
        : '   COMPENDIO RPG - SERVIDOR LOCAL INICIADO!         ');
    console.log('====================================================');
    console.log(`Local Host : ${url}`);
    netInfo.lan.forEach(n => console.log(`Rede LAN   : ${n.url} (${n.interfaceName})`));
    netInfo.vpn.forEach(n => console.log(`VPN/Túnel  : ${n.url} (${n.interfaceName})`));
    console.log(`Sala       : "${sessionState.roomConfig.roomName}" | Código: ${sessionState.roomConfig.roomCode}`);
    console.log(`Segurança  : Aprovação Obrigatória=${sessionState.roomConfig.requireApproval !== false ? 'SIM' : 'NÃO'} (${sessionState.roomConfig.waitingTimeoutSeconds}s) | Bloquear Mestre Remoto=SIM`);
    console.log('----------------------------------------------------');

    if (IS_SERVER_MODE) {
        console.log('Modo servidor ativo: janela desktop desativada.');
        console.log('Digite "help" no terminal para gerenciar sala, espera e aprovações.');
        console.log('Pressione Ctrl + C para encerrar.');
        console.log('====================================================');
        if (process.stdin && process.stdin.isTTY) {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
                prompt: 'compendio-server> '
            });
            rl.prompt();
            rl.on('line', (line) => {
                const out = executeServerCliCommand(line);
                if (out === '__QUIT__') {
                    console.log('Encerrando servidor...');
                    rl.close();
                    server.close(() => process.exit(0));
                    setTimeout(() => process.exit(0), 500).unref();
                    return;
                }
                if (out) console.log(out);
                rl.prompt();
            });
        }
    } else {
        console.log('Mantenha esta janela aberta enquanto usa o Compêndio.');
        console.log('Pressione Ctrl + C ou feche a janela para encerrar.');
        console.log('====================================================');
        if (!NO_OPEN) {
            const startCmd = process.platform === 'win32' ? `start "" "${url}"`
                : process.platform === 'darwin' ? `open "${url}"`
                : `xdg-open "${url}"`;
            exec(startCmd, () => {});
        }
    }
});
