const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

let sessionState = {
    sessionId: 'local-session',
    players: [],
    characters: [],
    tabletop: null,
    knowledge: {},
    combatCards: [],
    combatTurn: { activeCardId: null, round: 1 },
    diceLog: [],
    rules: null,
    activeMods: [],
    lastPing: null,
    updatedAt: Date.now()
};

// Clientes conectados via Server-Sent Events (SSE) para Multiplayer Real-Time (até 8+ jogadores)
const sseClients = new Map();

function getOnlinePlayersList() {
    const list = [];
    for (const c of sseClients.values()) {
        list.push({
            clientId: c.clientId,
            playerId: c.playerId,
            playerName: c.playerName,
            connectedAt: c.connectedAt
        });
    }
    return list;
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

setInterval(() => {
    for (const [cid, client] of sseClients.entries()) {
        try {
            client.res.write(': heartbeat\n\n');
        } catch (e) {
            sseClients.delete(cid);
        }
    }
}, 20000).unref();

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // API: Status do Servidor Local
    if (req.method === 'GET' && pathname === '/api/status') {
        return sendJson(res, 200, {
            ok: true,
            mode: 'node',
            writable: true,
            multiplayerReady: true,
            sseReady: true,
            onlineCount: sseClients.size,
            onlinePlayers: getOnlinePlayersList()
        });
    }

    // API: Stream SSE em Tempo Real para Multiplayer (até 8 jogadores na LAN / Rede)
    if (req.method === 'GET' && pathname === '/api/events') {
        const clientId = parsedUrl.searchParams.get('clientId') || ('c-' + Date.now() + '-' + Math.floor(Math.random() * 1000));
        const playerId = parsedUrl.searchParams.get('playerId') || 'gm-master';
        const playerName = parsedUrl.searchParams.get('playerName') || 'Jogador';

        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });

        sseClients.set(clientId, {
            clientId,
            playerId,
            playerName,
            connectedAt: Date.now(),
            res
        });

        // Envia estado inicial ao conectar
        res.write(`event: init\ndata: ${JSON.stringify({
            session: sessionState,
            onlinePlayers: getOnlinePlayersList()
        })}\n\n`);

        broadcastSseEvent('presence', {
            onlinePlayers: getOnlinePlayersList(),
            updatedAt: Date.now()
        });

        req.on('close', () => {
            sseClients.delete(clientId);
            broadcastSseEvent('presence', {
                onlinePlayers: getOnlinePlayersList(),
                updatedAt: Date.now()
            });
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
                    const content = fs.readFileSync(fullPath, 'utf8');
                    let parsed = null;
                    if (ext === '.json') {
                        try { parsed = JSON.parse(content); } catch (e) {}
                    }
                    mods.push({
                        fileName: ent.name,
                        path: `./mods/${ent.name}`,
                        type: ext.slice(1),
                        manifest: parsed
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
        return sendJson(res, 200, {
            ok: true,
            session: sessionState,
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
                const senderId = incoming.senderId || 'gm-master';

                // Atualiza presença se o cliente informou identidade
                if (senderClientId && sseClients.has(senderClientId)) {
                    const cl = sseClients.get(senderClientId);
                    if (incoming.senderId) cl.playerId = incoming.senderId;
                    if (incoming.senderName) cl.playerName = incoming.senderName;
                }

                // 1. Deltas cirúrgicos (evitam condição de corrida entre múltiplos jogadores)
                if (incoming.delta && typeof incoming.delta === 'object') {
                    const d = incoming.delta;
                    if (d.type === 'TOKEN_MOVE' && d.token && sessionState.tabletop && Array.isArray(sessionState.tabletop.tokens)) {
                        const idx = sessionState.tabletop.tokens.findIndex(t => t.id === d.token.id);
                        if (idx >= 0) {
                            Object.assign(sessionState.tabletop.tokens[idx], d.token);
                        } else {
                            sessionState.tabletop.tokens.push(d.token);
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
                    }
                    sessionState.updatedAt = Date.now();
                    broadcastSseEvent('delta', {
                        senderId,
                        senderClientId,
                        delta: d,
                        updatedAt: sessionState.updatedAt
                    }, senderClientId);
                    return sendJson(res, 200, { ok: true, updatedAt: sessionState.updatedAt });
                }

                // 2. Sincronização de estado de módulos
                if (Array.isArray(incoming.players)) sessionState.players = incoming.players;
                if (Array.isArray(incoming.characters)) sessionState.characters = incoming.characters;
                if (incoming.tabletop && typeof incoming.tabletop === 'object') sessionState.tabletop = incoming.tabletop;
                if (incoming.knowledge && typeof incoming.knowledge === 'object') sessionState.knowledge = incoming.knowledge;
                if (Array.isArray(incoming.combatCards)) sessionState.combatCards = incoming.combatCards;
                if (incoming.combatTurn && typeof incoming.combatTurn === 'object') sessionState.combatTurn = incoming.combatTurn;
                if (Array.isArray(incoming.diceLog)) sessionState.diceLog = incoming.diceLog.slice(-80);
                if (incoming.rules && typeof incoming.rules === 'object') sessionState.rules = incoming.rules;
                if (Array.isArray(incoming.activeMods)) sessionState.activeMods = incoming.activeMods;
                sessionState.updatedAt = Date.now();

                broadcastSseEvent('sync', {
                    senderId,
                    senderClientId,
                    session: sessionState,
                    updatedAt: sessionState.updatedAt
                }, senderClientId);

                return sendJson(res, 200, { ok: true, updatedAt: sessionState.updatedAt });
            } catch (err) {
                return sendJson(res, 400, { ok: false, error: err.message });
            }
        });
        return;
    }

    // API: Salvar arquivos e atualizar dados.js
    if (req.method === 'POST' && pathname === '/api/save') {
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

                // 2. Atualizar public/dados.js se enviado
                if (payload.compendioData && typeof payload.compendioData === 'object') {
                    const dadosPath = safePublicPath('dados.js');
                    const jsContent = `const compendioData = ${JSON.stringify(payload.compendioData, null, 4)};\n`;
                    fs.writeFileSync(dadosPath, jsContent, 'utf8');
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
