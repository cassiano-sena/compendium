/* =========================================================================
   BANDEJA 3D DE DADOS (ESTILO OWLBEAR) — OFFLINE / ZERO DEPENDÊNCIAS
   - Frame de madeira escura chanfrada + feltro preto fosco no canto esquerdo
   - Sólidos platônicos/poliédricos 3D reais: d4, d6, d8, d10/d100, d12, d20, dF
   - Física de colisão nas bordas + quique vertical + pouso exato na face sorteada
   ========================================================================= */

(function() {
    const STORAGE_KEY_DICE_3D = 'compendio_dice_3d_enabled_v1';
    if (window.dice3dEnabled === undefined) {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_DICE_3D);
            window.dice3dEnabled = saved === null ? true : saved === '1';
        } catch (e) {
            window.dice3dEnabled = true;
        }
    }

    // --- Matemática 3D enxuta (Vetores, Quatérnions e Matrizes 3x3) ---
    function vSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function vAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function vScale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
    function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function vCross(a, b) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]
        ];
    }
    function vNorm(a) {
        const len = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / len, a[1] / len, a[2] / len];
    }

    function qMul(a, b) {
        return [
            a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
        ];
    }
    function qNorm(q) {
        const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
    }
    function qFromAxisAngle(axis, angle) {
        const half = angle * 0.5;
        const s = Math.sin(half);
        const u = vNorm(axis);
        return [u[0] * s, u[1] * s, u[2] * s, Math.cos(half)];
    }
    function qSlerp(qa, qb, t) {
        let a = qa, b = qb;
        let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
        if (dot < 0) {
            b = [-b[0], -b[1], -b[2], -b[3]];
            dot = -dot;
        }
        if (dot > 0.9995) {
            return qNorm([
                a[0] + t * (b[0] - a[0]),
                a[1] + t * (b[1] - a[1]),
                a[2] + t * (b[2] - a[2]),
                a[3] + t * (b[3] - a[3])
            ]);
        }
        const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)));
        const theta = theta0 * t;
        const sinTheta = Math.sin(theta);
        const sinTheta0 = Math.sin(theta0);
        const s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
        const s1 = sinTheta / sinTheta0;
        return [
            s0 * a[0] + s1 * b[0],
            s0 * a[1] + s1 * b[1],
            s0 * a[2] + s1 * b[2],
            s0 * a[3] + s1 * b[3]
        ];
    }
    function qFromMatrix3(m) {
        // m é array 3x3 row-major [[r00,r01,r02],[r10,r11,r12],[r20,r21,r22]]
        const trace = m[0][0] + m[1][1] + m[2][2];
        let x, y, z, w;
        if (trace > 0) {
            const s = Math.sqrt(trace + 1.0) * 2;
            w = 0.25 * s;
            x = (m[2][1] - m[1][2]) / s;
            y = (m[0][2] - m[2][0]) / s;
            z = (m[1][0] - m[0][1]) / s;
        } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
            const s = Math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2;
            w = (m[2][1] - m[1][2]) / s;
            x = 0.25 * s;
            y = (m[0][1] + m[1][0]) / s;
            z = (m[0][2] + m[2][0]) / s;
        } else if (m[1][1] > m[2][2]) {
            const s = Math.sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2;
            w = (m[0][2] - m[2][0]) / s;
            x = (m[0][1] + m[1][0]) / s;
            y = 0.25 * s;
            z = (m[1][2] + m[2][1]) / s;
        } else {
            const s = Math.sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2;
            w = (m[1][0] - m[0][1]) / s;
            x = (m[0][2] + m[2][0]) / s;
            y = (m[1][2] + m[2][1]) / s;
            z = 0.25 * s;
        }
        return qNorm([x, y, z, w]);
    }
    function qRotateVec(q, v) {
        const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        const vx = v[0], vy = v[1], vz = v[2];
        const tx = 2 * (qy * vz - qz * vy);
        const ty = 2 * (qz * vx - qx * vz);
        const tz = 2 * (qx * vy - qy * vx);
        return [
            vx + qw * tx + (qy * tz - qz * ty),
            vy + qw * ty + (qz * tx - qx * tz),
            vz + qw * tz + (qx * ty - qy * tx)
        ];
    }

    // Ordena os vértices de uma face no sentido anti-horário visto de fora
    function ensureOutwardFace(verts, idxList) {
        let center = [0, 0, 0];
        idxList.forEach(i => { center = vAdd(center, verts[i]); });
        center = vScale(center, 1 / idxList.length);
        const nApprox = vNorm(center);
        const e1 = vSub(verts[idxList[1]], verts[idxList[0]]);
        const e2 = vSub(verts[idxList[2]], verts[idxList[0]]);
        const cross = vCross(e1, e2);
        const ordered = vDot(cross, nApprox) >= 0 ? idxList.slice() : idxList.slice().reverse();

        // Ordena radialmente no plano tangente para faces > 3 vértices (garante polígono convexo)
        if (ordered.length > 3) {
            const normal = nApprox;
            const ref = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            const tU = vNorm(vCross(ref, normal));
            const tV = vCross(normal, tU);
            ordered.sort((ia, ib) => {
                const da = vSub(verts[ia], center);
                const db = vSub(verts[ib], center);
                return Math.atan2(vDot(da, tV), vDot(da, tU)) - Math.atan2(vDot(db, tV), vDot(db, tU));
            });
        }
        return ordered;
    }

    function buildFaceRecord(verts, idxList, label) {
        const indices = ensureOutwardFace(verts, idxList);
        let center = [0, 0, 0];
        indices.forEach(i => { center = vAdd(center, verts[i]); });
        center = vScale(center, 1 / indices.length);
        const e1 = vSub(verts[indices[1]], verts[indices[0]]);
        const e2 = vSub(verts[indices[2]], verts[indices[0]]);
        let normal = vNorm(vCross(e1, e2));
        if (vDot(normal, center) < 0) normal = vScale(normal, -1);

        // Vetor local "para cima" na face (para o dígito ficar legível e alinhado)
        let up = vSub(verts[indices[0]], center);
        up = vSub(up, vScale(normal, vDot(up, normal)));
        if (Math.hypot(up[0], up[1], up[2]) < 1e-4) {
            up = vCross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
        }
        up = vNorm(up);
        const right = vNorm(vCross(up, normal));
        return { indices, center, normal, right, up, label: String(label) };
    }

    // Constrói geometria cacheada para cada tipo de dado
    const GEOM_CACHE = {};

    function getPolyhedronGeometry(kind) {
        if (GEOM_CACHE[kind]) return GEOM_CACHE[kind];

        let verts = [];
        let faceGroups = [];
        let labels = [];

        if (kind === 'd4') {
            verts = [
                vNorm([1, 1, 1]),
                vNorm([1, -1, -1]),
                vNorm([-1, 1, -1]),
                vNorm([-1, -1, 1])
            ];
            faceGroups = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];
            labels = ['1', '2', '3', '4'];
        } else if (kind === 'd6' || kind === 'dF') {
            const s = 1 / Math.sqrt(3);
            verts = [
                [-s, -s,  s], [ s, -s,  s], [ s,  s,  s], [-s,  s,  s],
                [-s, -s, -s], [ s, -s, -s], [ s,  s, -s], [-s,  s, -s]
            ];
            faceGroups = [
                [0, 1, 2, 3], // frente (+Z)
                [5, 4, 7, 6], // trás (-Z)
                [4, 5, 1, 0], // baixo (-Y)
                [3, 2, 6, 7], // cima (+Y)
                [1, 5, 6, 2], // direita (+X)
                [4, 0, 3, 7]  // esquerda (-X)
            ];
            labels = kind === 'dF'
                ? ['+', '-', ' ', '+', '-', ' ']
                : ['1', '6', '2', '5', '3', '4'];
        } else if (kind === 'd8') {
            verts = [
                [ 1,  0,  0], [-1,  0,  0],
                [ 0,  1,  0], [ 0, -1,  0],
                [ 0,  0,  1], [ 0,  0, -1]
            ];
            faceGroups = [
                [4, 0, 2], [4, 2, 1], [4, 1, 3], [4, 3, 0],
                [5, 2, 0], [5, 1, 2], [5, 3, 1], [5, 0, 3]
            ];
            labels = ['1', '8', '2', '7', '3', '6', '4', '5'];
        } else if (kind === 'd10' || kind === 'd100') {
            // Trapezoedro pentagonal (10 pipas simétricas)
            const topApex = [0, 0, 1.05];
            const botApex = [0, 0, -1.05];
            const eq = [];
            const r = 0.94;
            const zBand = 0.22;
            for (let i = 0; i < 10; i++) {
                const ang = (i * Math.PI) / 5;
                const z = (i % 2 === 0) ? zBand : -zBand;
                eq.push([r * Math.cos(ang), r * Math.sin(ang), z]);
            }
            verts = [topApex, botApex, ...eq];
            // 5 pipas superiores + 5 inferiores
            for (let i = 0; i < 5; i++) {
                const k0 = 2 + (2 * i);
                const k1 = 2 + ((2 * i + 1) % 10);
                const k2 = 2 + ((2 * i + 2) % 10);
                faceGroups.push([0, k0, k1, k2]);
            }
            for (let i = 0; i < 5; i++) {
                const k0 = 2 + ((2 * i + 1) % 10);
                const k1 = 2 + ((2 * i + 2) % 10);
                const k2 = 2 + ((2 * i + 3) % 10);
                faceGroups.push([1, k2, k1, k0]);
            }
            labels = kind === 'd100'
                ? ['00', '20', '40', '60', '80', '10', '30', '50', '70', '90']
                : ['0', '2', '4', '6', '8', '1', '3', '5', '7', '9'];
        } else if (kind === 'd12') {
            const phi = (1 + Math.sqrt(5)) / 2;
            const inv = 1 / phi;
            const raw = [
                [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
                [ 1, -1, -1], [ 1, -1, 1], [ 1, 1, -1], [ 1, 1, 1],
                [0, -inv, -phi], [0, -inv, phi], [0, inv, -phi], [0, inv, phi],
                [-inv, -phi, 0], [-inv, phi, 0], [inv, -phi, 0], [inv, phi, 0],
                [-phi, 0, -inv], [phi, 0, -inv], [-phi, 0, inv], [phi, 0, inv]
            ];
            verts = raw.map(vNorm);
            faceGroups = [
                [9, 11, 7, 19, 5], [9, 5, 14, 12, 1], [9, 1, 18, 3, 11],
                [11, 3, 13, 15, 7], [7, 15, 6, 17, 19], [5, 19, 17, 4, 14],
                [8, 10, 2, 16, 0], [8, 0, 12, 14, 4], [8, 4, 17, 6, 10],
                [10, 6, 15, 13, 2], [2, 13, 3, 18, 16], [1, 12, 0, 16, 18]
            ];
            labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
        } else {
            // d20 Icosaedro Regular (também serve de base elegante para dados atípicos)
            const phi = (1 + Math.sqrt(5)) / 2;
            const raw = [
                [-1,  phi, 0], [ 1,  phi, 0], [-1, -phi, 0], [ 1, -phi, 0],
                [0, -1,  phi], [0,  1,  phi], [0, -1, -phi], [0,  1, -phi],
                [ phi, 0, -1], [ phi, 0,  1], [-phi, 0, -1], [-phi, 0,  1]
            ];
            verts = raw.map(vNorm);
            faceGroups = [
                [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
            ];
            // Distribuição clássica estilo d20 (19/11 vizinhos ao redor de faces médias, como no Owlbear)
            labels = ['20', '2', '12', '18', '8', '14', '6', '16', '4', '10', '1', '19', '9', '11', '3', '17', '7', '15', '5', '13'];
        }

        const faces = faceGroups.map((g, i) => buildFaceRecord(verts, g, labels[i] ?? String(i + 1)));
        const geom = { kind, verts, faces };
        GEOM_CACHE[kind] = geom;
        return geom;
    }

    function targetQuaternionForFace(face, spinRollRad = 0) {
        // Queremos que face.normal aponte para (0,0,1) (para cima rumo à câmera)
        // e face.up aponte para cima da tela (0,-1,0) rotacionado opcionalmente no plano Z
        const n = face.normal;
        const u = face.up;
        const r = face.right;
        const ca = Math.cos(spinRollRad);
        const sa = Math.sin(spinRollRad);
        // R * r = (ca, -sa, 0), R * u = (sa, ca, 0), R * n = (0, 0, 1) -> det = +1, +u aponta para cima na tela
        const m = [
            [ ca * r[0] + sa * u[0],  ca * r[1] + sa * u[1],  ca * r[2] + sa * u[2]],
            [-sa * r[0] + ca * u[0], -sa * r[1] + ca * u[1], -sa * r[2] + ca * u[2]],
            [n[0], n[1], n[2]]
        ];
        // Garante det > 0
        const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
                  - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                  + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        if (det < 0) {
            m[0][0] = -m[0][0]; m[0][1] = -m[0][1]; m[0][2] = -m[0][2];
        }
        return qFromMatrix3(m);
    }

    function resolveGeometryKind(dieSpec) {
        if (dieSpec.isFudge) return 'dF';
        const f = Number(dieSpec.faces) || 20;
        if (f === 4) return 'd4';
        if (f === 6) return 'd6';
        if (f === 8) return 'd8';
        if (f === 10) return 'd10';
        if (f === 100) return 'd100';
        if (f === 12) return 'd12';
        return 'd20';
    }

    function formatDieFaceDisplay(dieSpec) {
        if (dieSpec.isFudge) {
            return Number(dieSpec.value) > 0 ? '+' : (Number(dieSpec.value) < 0 ? '−' : ' ');
        }
        if (Number(dieSpec.faces) === 10) {
            const v = Number(dieSpec.value);
            return v === 10 ? '0' : String(v);
        }
        if (Number(dieSpec.faces) === 100) {
            const v = Number(dieSpec.value);
            if (v === 100) return '00';
            return String(Math.floor(v / 10) * 10).padStart(2, '0');
        }
        return String(dieSpec.value);
    }

    const LIGHT_DIR = vNorm([-0.38, -0.52, 0.76]);

    window.CompendioDice3D = {
        isOpen: false,
        lastRoll: null,
        bodies: [],
        animFrameId: null,
        animStartAt: 0,
        animDurationMs: 1050,
        settledShown: false,

        isEnabled() {
            return window.dice3dEnabled !== false;
        },

        toggleEnabled() {
            window.dice3dEnabled = !this.isEnabled();
            try { localStorage.setItem(STORAGE_KEY_DICE_3D, window.dice3dEnabled ? '1' : '0'); } catch (e) {}
            if (!window.dice3dEnabled) this.hide();
            if (typeof CompendioDice !== 'undefined' && CompendioDice.renderWidget) {
                CompendioDice.renderWidget();
            }
            return window.dice3dEnabled;
        },

        shouldShowLocal(rollRecord) {
            return Boolean(this.isEnabled() && rollRecord && Array.isArray(rollRecord.diceResults) && rollRecord.diceResults.length > 0);
        },

        shouldShowRemote() {
            return this.isEnabled();
        },

        _ensureRootDom() {
            let root = document.getElementById('dice-3d-tray-root');
            if (!root && typeof document !== 'undefined' && document.body) {
                root = document.createElement('div');
                root.id = 'dice-3d-tray-root';
                document.body.appendChild(root);
            }
            return root;
        },

        _buildShellDom(rollRecord) {
            const root = this._ensureRootDom();
            if (!root) return null;
            const safeFormula = typeof escapeHtmlText === 'function'
                ? escapeHtmlText(rollRecord.formula || '')
                : String(rollRecord.formula || '');
            const safeActor = typeof CompendioDice !== 'undefined' && CompendioDice.formatRollActorName
                ? CompendioDice.formatRollActorName(rollRecord)
                : (rollRecord.actorName || 'Rolagem');
            const escapedActor = typeof escapeHtmlText === 'function' ? escapeHtmlText(safeActor) : String(safeActor);
            const secLock = rollRecord.isSecret ? ' 🔒' : '';

            root.className = 'dice-3d-tray-root is-open';
            root.innerHTML = `
                <div class="dice-3d-wood-frame" title="Clique na bandeja para pular animação">
                    <div class="dice-3d-felt-tray" id="dice-3d-felt-surface">
                        <div class="dice-3d-topbar">
                            <button type="button" class="dice-3d-icon-btn" id="dice-3d-reroll-btn" onclick="event.stopPropagation(); CompendioDice3D.rerollCurrent()" title="Rolar novamente (${safeFormula})">↻</button>
                            <div class="dice-3d-total-readout ${rollRecord.isNat20 ? 'is-crit' : (rollRecord.isNat1 ? 'is-fumble' : '')}" id="dice-3d-tray-total" data-roll-total="${rollRecord.total}">
                                <span class="dice-3d-total-val">${rollRecord.total}</span>
                            </div>
                            <button type="button" class="dice-3d-icon-btn" id="dice-3d-close-btn" onclick="event.stopPropagation(); CompendioDice3D.hide()" title="Fechar bandeja 3D">✕</button>
                        </div>
                        <canvas id="dice-3d-canvas" class="dice-3d-canvas" width="214" height="278" onclick="CompendioDice3D.finishNow()"></canvas>
                        <div class="dice-3d-footer-meta">
                            <span title="${escapedActor}">${escapedActor}${secLock} · <strong>${safeFormula}</strong></span>
                        </div>
                    </div>
                </div>
            `;
            return root;
        },

        showRoll(rollRecord, opts = {}) {
            if (!rollRecord) return;
            this.lastRoll = rollRecord;
            this.isOpen = true;
            this.settledShown = false;

            const rawDice = Array.isArray(rollRecord.diceResults) && rollRecord.diceResults.length > 0
                ? rollRecord.diceResults.slice(0, 14)
                : [{ faces: 20, value: Number(rollRecord.total) || 20, isDropped: false, isCrit: Boolean(rollRecord.isNat20) }];

            this._buildShellDom(rollRecord);

            const totalEl = document.getElementById('dice-3d-tray-total');
            if (totalEl) {
                totalEl.classList.add('is-rolling');
                totalEl.classList.remove('is-settled');
            }

            const canvas = document.getElementById('dice-3d-canvas');
            const w = canvas ? canvas.width : 214;
            const h = canvas ? canvas.height : 278;

            // Prepara corpos físicos 3D dentro do feltro
            const count = rawDice.length;
            const radius = count <= 2 ? 27 : (count <= 5 ? 23 : (count <= 9 ? 19 : 16));
            const cols = count === 1 ? 1 : (count <= 4 ? 2 : 3);
            const cellW = (w - 40) / cols;

            this.bodies = rawDice.map((spec, idx) => {
                const kind = resolveGeometryKind(spec);
                const geom = getPolyhedronGeometry(kind);
                const wantLabel = formatDieFaceDisplay(spec);
                let targetFace = geom.faces.find(f => f.label === wantLabel) || geom.faces[0];
                // Se o número não existir nativamente no poliedro (ex: d3 ou d100 parcial), usa face 0 e estampa o rótulo exato
                const customTopLabel = (targetFace.label !== wantLabel) ? wantLabel : null;

                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const targetX = count === 1
                    ? (w * 0.5 + (Math.random() - 0.5) * 28)
                    : Math.max(radius + 14, Math.min(w - radius - 14, 24 + cellW * (col + 0.5) + (Math.random() - 0.5) * 14));
                const targetY = count === 1
                    ? (h * 0.34 + (Math.random() - 0.5) * 26)
                    : Math.max(radius + 18, Math.min(h - radius - 18, 42 + row * (radius * 2.25) + (Math.random() - 0.5) * 12));

                // Lançamento vindo de baixo/lateral com ricochete nas bordas
                const startX = w * (0.25 + Math.random() * 0.5);
                const startY = h - radius - 12;
                const startAxis = vNorm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
                const targetQ = targetQuaternionForFace(targetFace, (Math.random() - 0.5) * 0.35);

                return {
                    spec,
                    kind,
                    geom,
                    targetFace,
                    customTopLabel,
                    radius,
                    startX,
                    startY,
                    targetX,
                    targetY,
                    x: startX,
                    y: startY,
                    z: 0,
                    q: qFromAxisAngle(startAxis, Math.random() * Math.PI * 2),
                    spinAxis: vNorm([0.8 - Math.random() * 1.6, 0.9 - Math.random() * 1.8, (Math.random() - 0.5) * 1.4]),
                    spinSpeed: 8.5 + Math.random() * 5.5,
                    targetQ,
                    bounces: 2 + Math.floor(Math.random() * 2),
                    wallKickX: (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 22)
                };
            });

            if (this.animFrameId && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }

            const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
            if (!ctx || typeof requestAnimationFrame !== 'function') {
                this.finishNow();
                return;
            }

            this.animStartAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const tick = (now) => {
                if (!this.isOpen) return;
                const elapsed = Math.max(0, now - this.animStartAt);
                const progress = Math.min(1, elapsed / this.animDurationMs);
                this._stepPhysics(progress, w, h);
                this._drawTrayCanvas(ctx, w, h);
                if (progress < 1) {
                    this.animFrameId = requestAnimationFrame(tick);
                } else {
                    this.animFrameId = null;
                    this._markSettled();
                }
            };
            this.animFrameId = requestAnimationFrame(tick);
        },

        _stepPhysics(t, w, h) {
            // t in [0, 1]
            const moveEase = 1 - Math.pow(1 - t, 3);
            const settleBlend = t <= 0.45 ? 0 : Math.pow((t - 0.45) / 0.55, 2.2);
            const hopDecay = Math.pow(1 - t, 1.4);

            for (const b of this.bodies) {
                // Trajetória curva com quique suave de parede no início do arremesso
                const archX = Math.sin(t * Math.PI) * b.wallKickX * (1 - t);
                let px = b.startX + (b.targetX - b.startX) * moveEase + archX;
                let py = b.startY + (b.targetY - b.startY) * moveEase - Math.sin(t * Math.PI) * 28 * (1 - t);
                px = Math.max(b.radius + 6, Math.min(w - b.radius - 6, px));
                py = Math.max(b.radius + 8, Math.min(h - b.radius - 8, py));
                b.x = px;
                b.y = py;
                b.z = Math.abs(Math.sin(t * Math.PI * b.bounces)) * 18 * hopDecay;

                const freeAngle = b.spinSpeed * (t * (1 - t * 0.38));
                const freeQ = qNorm(qMul(qFromAxisAngle(b.spinAxis, freeAngle), b.q));
                b.renderQ = qSlerp(freeQ, b.targetQ, Math.min(1, settleBlend));
            }
        },

        _drawTrayCanvas(ctx, w, h) {
            ctx.clearRect(0, 0, w, h);
            // Ordena dados por z (mais alto por cima)
            const sortedBodies = this.bodies.slice().sort((a, b) => a.z - b.z);
            for (const b of sortedBodies) {
                this._drawSingleDie(ctx, b);
            }
        },

        _drawSingleDie(ctx, b) {
            const q = b.renderQ || b.targetQ;
            const scalePx = b.radius * (1 + b.z * 0.012);
            const cx = b.x;
            const cy = b.y - b.z * 0.45;
            const isDropped = Boolean(b.spec.isDropped);
            const isCrit = Boolean(b.spec.isCrit) && !isDropped;
            const isFumble = Boolean(b.spec.isFumble) && !isDropped;

            // Sombra suave no feltro
            ctx.save();
            ctx.globalAlpha = isDropped ? 0.28 : 0.52;
            ctx.fillStyle = '#050507';
            ctx.beginPath();
            ctx.ellipse(b.x + 3 + b.z * 0.4, b.y + b.radius * 0.22 + b.z * 0.35, b.radius * 0.94, b.radius * 0.66, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = isDropped ? 0.48 : 1.0;

            // Transforma todos vértices pelo quatérnion atual
            const camDist = 4.2;
            const rotVerts = b.geom.verts.map(v => qRotateVec(q, v));
            const projVerts = rotVerts.map(v => {
                const p = camDist / (camDist - v[2] * 0.85);
                return [cx + v[0] * scalePx * p, cy - v[1] * scalePx * p, v[2]];
            });

            // Seleciona faces visíveis (normZ > -0.08) e ordena por profundidade (pintor)
            const visibleFaces = [];
            for (let fi = 0; fi < b.geom.faces.length; fi++) {
                const f = b.geom.faces[fi];
                const rn = qRotateVec(q, f.normal);
                if (rn[2] <= -0.05) continue;
                let avgZ = 0;
                f.indices.forEach(vi => { avgZ += rotVerts[vi][2]; });
                avgZ /= f.indices.length;
                visibleFaces.push({ f, rn, avgZ });
            }
            visibleFaces.sort((a, c) => a.avgZ - c.avgZ);

            for (const item of visibleFaces) {
                const { f, rn } = item;
                const pts = f.indices.map(vi => projVerts[vi]);
                const ndotl = Math.max(0, vDot(rn, LIGHT_DIR));
                const rim = Math.pow(1 - Math.max(0, rn[2]), 2.1) * 0.35;

                // Paleta estilo dado grafite/obsidiana fosca com brilho sutil nas arestas
                let baseR = 34, baseG = 37, baseB = 45;
                if (isCrit) {
                    baseR = 62; baseG = 48; baseB = 22;
                } else if (isFumble) {
                    baseR = 58; baseG = 24; baseB = 26;
                }
                const shade = 0.56 + ndotl * 0.68 + rim;
                const rr = Math.min(255, Math.round(baseR * shade));
                const gg = Math.min(255, Math.round(baseG * shade));
                const bb = Math.min(255, Math.round(baseB * shade));

                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
                ctx.closePath();

                ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
                ctx.fill();

                ctx.strokeStyle = isCrit
                    ? `rgba(246, 212, 118, ${0.42 + ndotl * 0.4})`
                    : (isFumble ? 'rgba(239, 108, 108, 0.45)' : `rgba(192, 202, 224, ${0.14 + ndotl * 0.28})`);
                ctx.lineWidth = rn[2] > 0.72 ? 1.25 : 0.9;
                ctx.lineJoin = 'round';
                ctx.stroke();

                // Desenha número da face alinhado em 3D se a face estiver minimamente voltada para a câmera
                if (rn[2] > 0.24) {
                    const rc = qRotateVec(q, f.center);
                    const rrVec = qRotateVec(q, f.right);
                    const ruVec = qRotateVec(q, f.up);
                    const pScale = camDist / (camDist - rc[2] * 0.85);
                    const fcx = cx + rc[0] * scalePx * pScale;
                    const fcy = cy - rc[1] * scalePx * pScale;

                    const faceTxt = (b.customTopLabel && f === b.targetFace) ? b.customTopLabel : f.label;
                    const fontSize = b.kind === 'd20' || b.kind === 'd12' ? scalePx * 0.44
                        : (b.kind === 'd4' ? scalePx * 0.52 : scalePx * 0.56);

                    ctx.save();
                    ctx.translate(fcx, fcy);
                    // Transformação afim tangente 3D para o número acompanhar a perspectiva da face
                    ctx.transform(rrVec[0], -rrVec[1], -ruVec[0], ruVec[1], 0, 0);
                    ctx.globalAlpha *= Math.min(1, (rn[2] - 0.15) * 1.45);
                    ctx.font = `700 ${Math.max(8, Math.round(fontSize))}px "Trebuchet MS", Verdana, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = isCrit ? '#ffe082' : (isFumble ? '#ff8a80' : '#f4f6fc');
                    ctx.fillText(faceTxt, 0, 0);
                    // Tracinho embaixo de 6 e 9
                    if (faceTxt === '6' || faceTxt === '9') {
                        const uw = fontSize * 0.36;
                        ctx.fillRect(-uw / 2, fontSize * 0.42, uw, Math.max(1, fontSize * 0.09));
                    }
                    ctx.restore();
                }
            }
            ctx.restore();
        },

        _markSettled() {
            this.settledShown = true;
            const totalEl = document.getElementById('dice-3d-tray-total');
            if (totalEl) {
                totalEl.classList.remove('is-rolling');
                totalEl.classList.add('is-settled');
            }
        },

        finishNow() {
            if (!this.isOpen) return;
            if (this.animFrameId && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
            const canvas = document.getElementById('dice-3d-canvas');
            const w = canvas ? canvas.width : 214;
            const h = canvas ? canvas.height : 278;
            this._stepPhysics(1, w, h);
            const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
            if (ctx) this._drawTrayCanvas(ctx, w, h);
            this._markSettled();
        },

        rerollCurrent() {
            if (!this.lastRoll || typeof CompendioDice === 'undefined') return;
            if (this.lastRoll.id && CompendioDice.rerollEntry && (window.diceLogData || []).some(r => r.id === this.lastRoll.id)) {
                return CompendioDice.rerollEntry(this.lastRoll.id);
            }
            return CompendioDice.rollExpression(
                this.lastRoll.formula || '1d20',
                this.lastRoll.label || 'Rolagem',
                { isDamage: Boolean(this.lastRoll.isDamage), mode: this.lastRoll.mode || 'normal' }
            );
        },

        hide() {
            this.isOpen = false;
            if (this.animFrameId && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
            const root = document.getElementById('dice-3d-tray-root');
            if (root) {
                root.classList.remove('is-open');
                root.innerHTML = '';
            }
        }
    };
})();
