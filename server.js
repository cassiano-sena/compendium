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

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // API: Status do Servidor Local
    if (req.method === 'GET' && pathname === '/api/status') {
        return sendJson(res, 200, { ok: true, mode: 'node', writable: true });
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