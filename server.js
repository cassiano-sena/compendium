const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;
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
    return isLoopbackIp(getClientIp(req));
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
        allowSelfProfileCreate: true,
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

function sanitizeRoomForClient(isHost = false) {
    const rc = sessionState.roomConfig;
    const base = {
        isOpen: Boolean(rc.isOpen),
        isLocked: Boolean(rc.isLocked),
        roomName: rc.roomName || 'Mesa de Campanha',
        roomCode: rc.roomCode || 'MESA-0000',
        hasPasscode: Boolean(rc.passcode),
        maxPlayers: Math.max(1, Number(rc.maxPlayers) || 8),
        blockRemoteGm: rc.blockRemoteGm !== false,
        allowSelfProfileCreate: rc.allowSelfProfileCreate !== false,
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

function sanitizeSessionForClient(isHost = false) {
    const compData = isHost
        ? sessionState.compendioData
        : sanitizeCompendioForRemotePlayers(sessionState.compendioData, sessionState.knowledge);
    return {
        sessionId: sessionState.sessionId,
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
        tabletop: sessionState.tabletop,
        knowledge: sessionState.knowledge,
        compendioData: compData,
        quests: sessionState.quests,
        hitDice: sessionState.hitDice,
        combatCards: sessionState.combatCards,
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

function ensureTabletopContainer() {
    if (!sessionState.tabletop || typeof sessionState.tabletop !== 'object') {
        sessionState.tabletop = {
            tokens: [],
            aoeTemplates: [],
            fogRects: [],
            gridSize: 50,
            gridSizeY: 50,
            gridOffsetX: 0,
            gridOffsetY: 0,
            gridEnabled: true,
            gridSnap: true,
            fogEnabled: false,
            mapBg: ''
        };
    }
    if (!Array.isArray(sessionState.tabletop.tokens)) sessionState.tabletop.tokens = [];
    if (!Array.isArray(sessionState.tabletop.aoeTemplates)) sessionState.tabletop.aoeTemplates = [];
    if (!Array.isArray(sessionState.tabletop.fogRects)) sessionState.tabletop.fogRects = [];
    return sessionState.tabletop;
}

function isEffectiveGmSender(isHost, incoming) {
    if (isHost) return incoming?.senderRole !== 'player';
    return !sessionState.roomConfig.blockRemoteGm && incoming?.senderRole === 'gm';
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
    for (const [cid, client] of sseClients.entries()) {
        try {
            client.res.write(': heartbeat\n\n');
        } catch (e) {
            sseClients.delete(cid);
        }
    }
}, 20000).unref();

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

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const isHost = isHostRequest(req);

    // API: Status do Servidor Local e Sala
    if (req.method === 'GET' && pathname === '/api/status') {
        return sendJson(res, 200, {
            ok: true,
            mode: 'node',
            writable: true,
            multiplayerReady: true,
            sseReady: true,
            isHostClient: isHost,
            port: Number(PORT),
            room: sanitizeRoomForClient(isHost),
            onlineCount: sseClients.size,
            onlinePlayers: getOnlinePlayersList()
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
                return sendJson(res, 200, { ok: true, room: sanitizeRoomForClient(isHost) });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // API: Gestão Completa da Sala Online (Criar/Editar, Trancar, Fechar, Kick, Ban, Desbanir)
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
                    if (incoming.blockRemoteGm !== undefined) {
                        rc.blockRemoteGm = Boolean(incoming.blockRemoteGm);
                    }
                    if (incoming.allowSelfProfileCreate !== undefined) {
                        rc.allowSelfProfileCreate = Boolean(incoming.allowSelfProfileCreate);
                    }
                    if (incoming.regenerateCode) {
                        rc.roomCode = generateRoomCode();
                    }
                    rc.createdAt = rc.createdAt || Date.now();
                    broadcastSseEvent('room_update', {
                        room: sanitizeRoomForClient(false),
                        onlinePlayers: getOnlinePlayersList()
                    });
                } else if (action === 'toggle_lock') {
                    rc.isLocked = incoming.locked !== undefined ? Boolean(incoming.locked) : !rc.isLocked;
                    broadcastSseEvent('room_update', {
                        room: sanitizeRoomForClient(false),
                        onlinePlayers: getOnlinePlayersList()
                    });
                } else if (action === 'close') {
                    rc.isOpen = false;
                    for (const client of Array.from(sseClients.values())) {
                        if (!client.isHost) {
                            closeClientWithEvent(client, 'room_closed', {
                                reason: incoming.reason || 'A sala online foi fechada pelo Mestre.'
                            });
                        }
                    }
                    broadcastSseEvent('room_update', {
                        room: sanitizeRoomForClient(false),
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
                    for (const client of Array.from(sseClients.values())) {
                        if (client.isHost) continue;
                        if ((targetCid && client.clientId === targetCid) || (targetDid && client.deviceId === targetDid)) {
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
                    room: sanitizeRoomForClient(true),
                    onlinePlayers: getOnlinePlayersList()
                });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // API: Stream SSE em Tempo Real para Multiplayer (até 8 jogadores na LAN / VPN)
    if (req.method === 'GET' && pathname === '/api/events') {
        const clientId = parsedUrl.searchParams.get('clientId') || ('c-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
        const deviceId = parsedUrl.searchParams.get('deviceId') || clientId;
        let playerId = parsedUrl.searchParams.get('playerId') || (isHost ? 'gm-master' : 'player-1');
        let playerName = parsedUrl.searchParams.get('playerName') || (isHost ? 'Mestre (GM)' : 'Jogador');
        let role = parsedUrl.searchParams.get('role') || (playerId === 'gm-master' ? 'gm' : 'player');
        const color = parsedUrl.searchParams.get('color') || '#d8b467';
        const avatarEmoji = parsedUrl.searchParams.get('avatarEmoji') || (role === 'gm' ? '👑' : '🛡️');
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

        if (sessionState.roomConfig.isLocked && !isHost && !isDeviceConnected(deviceId)) {
            return sendOneShotSseRejection('room_locked', { reason: 'A sala está trancada para novos jogadores no momento.' });
        }

        const currentDevices = countConnectedUniqueDevices(deviceId);
        if (!isHost && currentDevices >= (Number(sessionState.roomConfig.maxPlayers) || 8)) {
            return sendOneShotSseRejection('room_full', { reason: `A sala atingiu o limite máximo de ${sessionState.roomConfig.maxPlayers} jogadores.` });
        }

        if (!isHost && sessionState.roomConfig.blockRemoteGm && role === 'gm') {
            role = 'player';
            if (playerId === 'gm-master') playerId = 'guest-' + deviceId.slice(-6);
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        sseClients.set(clientId, {
            clientId,
            deviceId,
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
        res.write(`event: init\ndata: ${JSON.stringify({
            isHostClient: isHost,
            session: sanitizeSessionForClient(isHost),
            room: sanitizeRoomForClient(isHost),
            onlinePlayers: getOnlinePlayersList()
        })}\n\n`);

        broadcastSseEvent('presence', {
            onlinePlayers: getOnlinePlayersList(),
            updatedAt: Date.now()
        });

        req.on('close', () => {
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
        return sendJson(res, 200, {
            ok: true,
            isHostClient: isHost,
            session: sanitizeSessionForClient(isHost),
            room: sanitizeRoomForClient(isHost),
            onlinePlayers: getOnlinePlayersList()
        });
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
                const senderId = incoming.senderId || 'gm-master';
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

                // Atualiza presença se o cliente informou identidade/cor/avatar
                if (senderClientId && sseClients.has(senderClientId)) {
                    const cl = sseClients.get(senderClientId);
                    if (incoming.senderId) cl.playerId = incoming.senderId;
                    if (incoming.senderName) cl.playerName = incoming.senderName;
                    if (incoming.senderRole) {
                        cl.role = (!isHost && sessionState.roomConfig.blockRemoteGm && incoming.senderRole === 'gm') ? 'player' : incoming.senderRole;
                    }
                    if (incoming.senderColor) cl.color = incoming.senderColor;
                    if (incoming.senderAvatar) cl.avatarEmoji = incoming.senderAvatar;
                }

                const isEffectiveGm = isEffectiveGmSender(isHost, incoming);

                // 1. Deltas cirúrgicos (evitam condição de corrida entre múltiplos jogadores)
                if (incoming.delta && typeof incoming.delta === 'object') {
                    const d = incoming.delta;
                    const now = Date.now();

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
                            if (!isEffectiveGm && (curTok.locked || (curTok.ownerId && curTok.ownerId !== senderId && !curTok.allowPlayersMove))) {
                                return sendJson(res, 403, { ok: false, error: 'Token travado ou pertence a outro jogador.' });
                            }
                            Object.assign(curTok, d.token);
                        } else {
                            tt.tokens.push(d.token);
                        }
                    } else if (d.type === 'TOKEN_UPSERT' && d.token) {
                        const idx = tt.tokens.findIndex(t => t.id === d.token.id);
                        if (idx >= 0) {
                            const curTok = tt.tokens[idx];
                            if (!isEffectiveGm && (curTok.locked || (curTok.ownerId && curTok.ownerId !== senderId && !curTok.allowPlayersMove))) {
                                return sendJson(res, 403, { ok: false, error: 'Sem permissão para alterar este token.' });
                            }
                            tt.tokens[idx] = Object.assign({}, curTok, d.token);
                        } else {
                            tt.tokens.push(d.token);
                        }
                    } else if (d.type === 'TOKEN_DELETE' && d.tokenId) {
                        const idx = tt.tokens.findIndex(t => t.id === d.tokenId);
                        if (idx >= 0) {
                            const curTok = tt.tokens[idx];
                            if (!isEffectiveGm && (curTok.locked || (curTok.ownerId && curTok.ownerId !== senderId))) {
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
                            return sendJson(res, 403, { ok: false, error: 'Apenas o Mestre pode alterar grade, calibração ou mapa do Tabletop.' });
                        }
                        const allowedKeys = ['gridEnabled', 'gridSize', 'gridSizeY', 'gridOffsetX', 'gridOffsetY', 'gridSnap', 'fogEnabled', 'mapBg', 'activeMapKey', 'activeMapName', 'stageWidth', 'stageHeight'];
                        for (const k of allowedKeys) {
                            if (d.meta[k] !== undefined) tt[k] = d.meta[k];
                        }
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
                        if (tok.locked && !isEffectiveGm) {
                            return sendJson(res, 403, { ok: false, error: 'Este baú está trancado pelo Mestre.' });
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
                        if (tok.locked && !isEffectiveGm) {
                            return sendJson(res, 403, { ok: false, error: 'Este token de ouro está bloqueado pelo Mestre.' });
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
                    sessionState.updatedAt = now;
                    schedulePersistSession();
                    broadcastSseEvent('delta', {
                        senderId,
                        senderClientId,
                        delta: d,
                        updatedAt: sessionState.updatedAt
                    }, senderClientId);
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
                    // Preserva PINs originais caso um cliente remoto envie versão sanitizada sem PIN
                    const existingPinMap = new Map((sessionState.players || []).map(p => [p.id, p.pin || '']));
                    sessionState.players = incoming.players.map(p => {
                        if (!isHost && p.pin === undefined && existingPinMap.has(p.id)) {
                            return Object.assign({}, p, { pin: existingPinMap.get(p.id) });
                        }
                        return p;
                    });
                }
                if (Array.isArray(incoming.characters)) sessionState.characters = incoming.characters;
                if (incoming.tabletop && typeof incoming.tabletop === 'object') {
                    if (isEffectiveGm) {
                        sessionState.tabletop = incoming.tabletop;
                    } else if (sessionState.tabletop) {
                        // Jogadores não podem desativar grade, alterar calibração, mapa ou névoa em sync completo
                        const prev = sessionState.tabletop;
                        sessionState.tabletop = Object.assign({}, incoming.tabletop, {
                            gridEnabled: prev.gridEnabled,
                            gridSize: prev.gridSize,
                            gridSizeY: prev.gridSizeY,
                            gridOffsetX: prev.gridOffsetX,
                            gridOffsetY: prev.gridOffsetY,
                            gridSnap: prev.gridSnap,
                            fogEnabled: prev.fogEnabled,
                            fogRects: prev.fogRects,
                            mapBg: prev.mapBg
                        });
                    } else {
                        sessionState.tabletop = incoming.tabletop;
                    }
                }
                if (isAuthorizedHostGm) {
                    if (incoming.knowledge && typeof incoming.knowledge === 'object') sessionState.knowledge = incoming.knowledge;
                    if (incoming.compendioData && typeof incoming.compendioData === 'object') sessionState.compendioData = incoming.compendioData;
                    if (Array.isArray(incoming.quests)) sessionState.quests = incoming.quests;
                    if (Array.isArray(incoming.hitDice)) sessionState.hitDice = incoming.hitDice;
                }
                if (Array.isArray(incoming.combatCards)) sessionState.combatCards = incoming.combatCards;
                if (incoming.combatTurn && typeof incoming.combatTurn === 'object') sessionState.combatTurn = incoming.combatTurn;
                if (Array.isArray(incoming.diceLog)) sessionState.diceLog = incoming.diceLog.slice(-80);
                if (incoming.rules && typeof incoming.rules === 'object') sessionState.rules = incoming.rules;
                if (Array.isArray(incoming.activeMods)) sessionState.activeMods = incoming.activeMods;
                sessionState.updatedAt = Date.now();
                schedulePersistSession();

                broadcastSessionSync(senderClientId, senderId);
                broadcastSseEvent('presence', {
                    onlinePlayers: getOnlinePlayersList(),
                    updatedAt: sessionState.updatedAt
                });

                return sendJson(res, 200, { ok: true, updatedAt: sessionState.updatedAt });
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

server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log('====================================================');
    console.log('   COMPENDIO RPG - SERVIDOR LOCAL INICIADO!         ');
    console.log('====================================================');
    console.log(`Acesse no navegador: ${url}`);
    console.log('Mantenha esta janela aberta enquanto usa o Compêndio.');
    console.log('Pressione Ctrl + C ou feche a janela para encerrar.');
    console.log('====================================================');

    if (!process.env.NO_OPEN) {
        const startCmd = process.platform === 'win32' ? `start "" "${url}"`
            : process.platform === 'darwin' ? `open "${url}"`
            : `xdg-open "${url}"`;
        exec(startCmd, () => {});
    }
});
