/* ==========================================================================
   CASA VARHEN — O SANTUÁRIO DA FOME: PAINEL INTERATIVO DO MESTRE
   Sincroniza progresso (0/15 etapas), Medidor do Arauto (0–6),
   Emblemas encontrados (0/4), Destruição da Dimensão (1–5) e Marcos da Mesa
   entre todos os capítulos da aventura via localStorage.
   ========================================================================== */

(function() {
    const STORAGE_KEY_VARHEN = 'compendio_varhen_tracker_v1';

    const VARHEN_STEPS = [
        'Apresentar o balde e as pistas do desaparecimento',
        'Encontrar o mendigo lobisomem',
        'Chegar à Vila Varhen',
        'Conhecer Lyra Bloodseeker',
        'Apresentar o sino e a primeira aparição do Arauto',
        'Entrar na Mansão Varhen',
        'Encontrar os quatro emblemas',
        'Abrir a passagem secreta',
        'Encontrar Connor e seus registros',
        'Conversar com Astel',
        'Decidir sobre a Bênção de Hadar',
        'Receber o fragmento do cajado de Vecna',
        'Despertar do Tarrasque',
        'Concluir a batalha kaiju',
        'Atravessar o portal de volta'
    ];

    const VARHEN_EMBLEMS = [
        { key: 'sacrificio', label: 'Sacrifício', room: 'Sala dos Troféus' },
        { key: 'conquista', label: 'Conquista', room: 'Galeria dos Inimigos' },
        { key: 'conhecimento', label: 'Conhecimento', room: 'Biblioteca' },
        { key: 'autoridade', label: 'Autoridade', room: 'Escritório do Chefe' }
    ];

    const ARAUTO_LABELS = [
        '0 — Distante (Silêncio)',
        '1 — Distante (Sons e sinais)',
        '2 — Presença próxima (Rastros)',
        '3 — Presença próxima (Paredes danificadas)',
        '4 — Encontro iminente (Entra na área)',
        '5 — Encontro iminente (Prestes a atacar)',
        '6 — Perseguição direta / Bloqueio da rota'
    ];

    const DESTRUCTION_LABELS = {
        1: '1 — Estável · Montanha começa a rachar',
        2: '2 — Vila sofre os primeiros impactos',
        3: '3 — Mansão começa a desmoronar',
        4: '4 — Dimensão começa a perder estabilidade',
        5: '5 — Colapso · Portal é a única saída segura'
    };

    const EXTRA_FLAGS = [
        { key: 'bucketCarried', label: '🪣 Balde de Kael c/ o Grupo' },
        { key: 'fragAlexander', label: '☀️ Chiaroscuro (Alexander)' },
        { key: 'fragElijah', label: '🩸 Animositas (Elijah)' },
        { key: 'fragJester', label: '🎲 Simplicitas (Jester)' },
        { key: 'vecnaShard', label: '🪵 Frag. Cajado de Vecna' }
    ];

    function createDefaultState() {
        return {
            steps: new Array(VARHEN_STEPS.length).fill(false),
            arautoMeter: 0,
            destructionMeter: 1,
            emblems: {
                sacrificio: false,
                conquista: false,
                conhecimento: false,
                autoridade: false
            },
            extras: {
                bucketCarried: true,
                fragAlexander: false,
                fragElijah: false,
                fragJester: false,
                vecnaShard: false
            },
            astelStance: 'pendente'
        };
    }

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeState(raw) {
        const def = createDefaultState();
        if (!raw || typeof raw !== 'object') return def;
        if (Array.isArray(raw.steps)) {
            def.steps = VARHEN_STEPS.map((_, idx) => Boolean(raw.steps[idx]));
        }
        const arauto = Number(raw.arautoMeter);
        def.arautoMeter = Number.isFinite(arauto) ? Math.max(0, Math.min(6, Math.round(arauto))) : 0;

        const destr = Number(raw.destructionMeter);
        def.destructionMeter = Number.isFinite(destr) ? Math.max(1, Math.min(5, Math.round(destr))) : 1;

        if (raw.emblems && typeof raw.emblems === 'object') {
            for (const em of VARHEN_EMBLEMS) {
                def.emblems[em.key] = Boolean(raw.emblems[em.key]);
            }
        }
        if (raw.extras && typeof raw.extras === 'object') {
            for (const ex of EXTRA_FLAGS) {
                if (raw.extras[ex.key] !== undefined) {
                    def.extras[ex.key] = Boolean(raw.extras[ex.key]);
                }
            }
        }
        if (['pendente', 'aliado', 'negociacao', 'hostil'].includes(raw.astelStance)) {
            def.astelStance = raw.astelStance;
        }
        return def;
    }

    let cachedState = null;

    function loadState() {
        if (cachedState) return cachedState;
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(STORAGE_KEY_VARHEN);
                if (raw) {
                    cachedState = normalizeState(JSON.parse(raw));
                    return cachedState;
                }
            }
        } catch (e) {}
        cachedState = createDefaultState();
        return cachedState;
    }

    function saveState() {
        try {
            if (typeof localStorage !== 'undefined' && cachedState) {
                localStorage.setItem(STORAGE_KEY_VARHEN, JSON.stringify(cachedState));
            }
        } catch (e) {}
    }

    function countCompletedSteps(st) {
        return st.steps.filter(Boolean).length;
    }

    function countEmblems(st) {
        return VARHEN_EMBLEMS.filter(em => st.emblems[em.key]).length;
    }

    function renderCompactStripHtml(st) {
        const doneCount = countCompletedSteps(st);
        const embCount = countEmblems(st);
        const arautoTone = st.arautoMeter >= 5 ? 'is-danger' : (st.arautoMeter >= 3 ? 'is-warn' : '');
        const destrTone = st.destructionMeter >= 4 ? 'is-danger' : (st.destructionMeter >= 2 ? 'is-warn' : '');

        const embPills = VARHEN_EMBLEMS.map(em => {
            const active = st.emblems[em.key];
            return `<button type="button" class="cv-emblem-mini ${active ? 'is-found' : ''}" onclick="CompendioVarhenTracker.toggleEmblem('${em.key}')" title="${escapeHtml(em.label)} — ${escapeHtml(em.room)}">${active ? '✦' : '✧'} ${escapeHtml(em.label)}</button>`;
        }).join('');

        return `
            <div class="cv-tracker-strip">
                <div class="cv-strip-metric">
                    <span class="cv-strip-label">Etapas</span>
                    <strong>${doneCount}/15</strong>
                    <button type="button" class="cv-tiny-btn" onclick="CompendioVarhenTracker.openChapter('prologo')" title="Abrir painel completo de etapas no Guia do Mestre">Painel</button>
                </div>
                <div class="cv-strip-metric ${arautoTone}">
                    <span class="cv-strip-label">Arauto</span>
                    <button type="button" class="cv-tiny-btn" onclick="CompendioVarhenTracker.adjustArauto(-1)" title="Diminuir Medidor do Arauto">−</button>
                    <strong>${st.arautoMeter}/6</strong>
                    <button type="button" class="cv-tiny-btn" onclick="CompendioVarhenTracker.adjustArauto(1)" title="Aumentar Medidor do Arauto">+</button>
                </div>
                <div class="cv-strip-emblems">
                    <span class="cv-strip-label">Emblemas (${embCount}/4)</span>
                    <div class="cv-emblem-mini-list">${embPills}</div>
                </div>
                <div class="cv-strip-metric ${destrTone}">
                    <span class="cv-strip-label">Colapso</span>
                    <button type="button" class="cv-tiny-btn" onclick="CompendioVarhenTracker.adjustDestruction(-1)" title="Diminuir Destruição da Dimensão">−</button>
                    <strong>${st.destructionMeter}/5</strong>
                    <button type="button" class="cv-tiny-btn" onclick="CompendioVarhenTracker.adjustDestruction(1)" title="Aumentar Destruição da Dimensão">+</button>
                </div>
            </div>
        `;
    }

    function renderFullBoardHtml(st) {
        const doneCount = countCompletedSteps(st);
        const pctSteps = Math.round((doneCount / VARHEN_STEPS.length) * 100);
        const embCount = countEmblems(st);

        const arautoPips = [0, 1, 2, 3, 4, 5, 6].map(val => {
            const cls = val <= st.arautoMeter ? (val >= 5 ? 'is-danger' : (val >= 3 ? 'is-warn' : 'is-active')) : '';
            return `<button type="button" class="cv-pip ${cls}" onclick="CompendioVarhenTracker.setArauto(${val})" title="${escapeHtml(ARAUTO_LABELS[val])}">${val}</button>`;
        }).join('');

        const destrPips = [1, 2, 3, 4, 5].map(val => {
            const cls = val <= st.destructionMeter ? (val >= 4 ? 'is-danger' : (val >= 2 ? 'is-warn' : 'is-active')) : '';
            return `<button type="button" class="cv-pip ${cls}" onclick="CompendioVarhenTracker.setDestruction(${val})" title="${escapeHtml(DESTRUCTION_LABELS[val])}">${val}</button>`;
        }).join('');

        const emblemBtns = VARHEN_EMBLEMS.map(em => {
            const on = st.emblems[em.key];
            return `
                <button type="button" class="cv-emblem-btn ${on ? 'is-found' : ''}" onclick="CompendioVarhenTracker.toggleEmblem('${em.key}')">
                    <span class="cv-emblem-icon">${on ? '✦' : '✧'}</span>
                    <span>
                        <strong>${escapeHtml(em.label)}</strong>
                        <small>${escapeHtml(em.room)}</small>
                    </span>
                </button>
            `;
        }).join('');

        const stepsHtml = VARHEN_STEPS.map((label, idx) => {
            const checked = st.steps[idx];
            return `
                <label class="cv-step-item ${checked ? 'is-done' : ''}">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="CompendioVarhenTracker.toggleStep(${idx})">
                    <span class="cv-step-num">${idx + 1}.</span>
                    <span>${escapeHtml(label)}</span>
                </label>
            `;
        }).join('');

        const extrasHtml = EXTRA_FLAGS.map(ex => {
            const on = st.extras[ex.key];
            return `<button type="button" class="cv-flag-pill ${on ? 'is-on' : ''}" onclick="CompendioVarhenTracker.toggleExtra('${ex.key}')">${escapeHtml(ex.label)}</button>`;
        }).join('');

        const stanceOpts = [
            { id: 'pendente', label: '⏳ Pendente' },
            { id: 'aliado', label: '🤝 Aliado (Balde entregue)' },
            { id: 'negociacao', label: '⚖️ Negociação' },
            { id: 'hostil', label: '⚔️ Hostil' }
        ].map(opt => `<button type="button" class="cv-flag-pill ${st.astelStance === opt.id ? 'is-on' : ''}" onclick="CompendioVarhenTracker.setAstelStance('${opt.id}')">${escapeHtml(opt.label)}</button>`).join('');

        return `
            <div class="cv-tracker-full">
                <div class="cv-tracker-head">
                    <div>
                        <h3>Controle Rápido da Sessão — Casa Varhen</h3>
                        <p class="cv-tracker-sub">Sincronizado automaticamente entre todos os capítulos da aventura.</p>
                    </div>
                    <button type="button" class="cv-ctrl-btn danger" onclick="CompendioVarhenTracker.resetAll()">Resetar Tudo</button>
                </div>

                <div class="cv-meters-grid">
                    <div class="cv-meter-box">
                        <div class="cv-meter-title">
                            <span>Medidor do Arauto</span>
                            <strong>${st.arautoMeter}/6</strong>
                        </div>
                        <div class="cv-meter-state">${escapeHtml(ARAUTO_LABELS[st.arautoMeter] || '')}</div>
                        <div class="cv-pips-row">${arautoPips}</div>
                        <div class="cv-meter-actions">
                            <button type="button" class="cv-ctrl-btn" onclick="CompendioVarhenTracker.adjustArauto(-1)">Diminuir</button>
                            <button type="button" class="cv-ctrl-btn" onclick="CompendioVarhenTracker.resetArauto()">Resetar</button>
                            <button type="button" class="cv-ctrl-btn accent" onclick="CompendioVarhenTracker.adjustArauto(1)">Aumentar</button>
                        </div>
                    </div>

                    <div class="cv-meter-box">
                        <div class="cv-meter-title">
                            <span>Destruição da Dimensão</span>
                            <strong>${st.destructionMeter}/5</strong>
                        </div>
                        <div class="cv-meter-state">${escapeHtml(DESTRUCTION_LABELS[st.destructionMeter] || '')}</div>
                        <div class="cv-pips-row">${destrPips}</div>
                        <div class="cv-meter-actions">
                            <button type="button" class="cv-ctrl-btn" onclick="CompendioVarhenTracker.adjustDestruction(-1)">Diminuir</button>
                            <button type="button" class="cv-ctrl-btn" onclick="CompendioVarhenTracker.resetDestruction()">Resetar</button>
                            <button type="button" class="cv-ctrl-btn accent" onclick="CompendioVarhenTracker.adjustDestruction(1)">Aumentar</button>
                        </div>
                    </div>

                    <div class="cv-meter-box wide">
                        <div class="cv-meter-title">
                            <span>Emblemas Encontrados</span>
                            <strong>${embCount}/4 emblemas ${embCount >= 3 ? '· Pronto p/ modo curto (3+)' : ''}</strong>
                        </div>
                        <div class="cv-emblems-grid">${emblemBtns}</div>
                    </div>
                </div>

                <div class="cv-steps-section">
                    <div class="cv-meter-title">
                        <span>Controle do Mestre — Etapas da Campanha</span>
                        <strong>${doneCount}/15 etapas (${pctSteps}%)</strong>
                    </div>
                    <div class="cv-progress-bar"><div class="cv-progress-fill" style="width:${pctSteps}%;"></div></div>
                    <div class="cv-steps-grid">${stepsHtml}</div>
                </div>

                <div class="cv-extras-section">
                    <div class="cv-extras-group">
                        <span class="cv-strip-label">Artefatos &amp; Fragmentos de Hadar</span>
                        <div class="cv-flag-row">${extrasHtml}</div>
                    </div>
                    <div class="cv-extras-group">
                        <span class="cv-strip-label">Decisão com Astel Vhalzar Varhen</span>
                        <div class="cv-flag-row">${stanceOpts}</div>
                    </div>
                </div>
            </div>
        `;
    }

    const CompendioVarhenTracker = {
        STEPS: VARHEN_STEPS,
        EMBLEMS: VARHEN_EMBLEMS,

        getState() {
            return normalizeState(loadState());
        },

        hydrate(rootEl = null) {
            const scope = rootEl || (typeof document !== 'undefined' ? document : null);
            if (!scope || typeof scope.querySelectorAll !== 'function') return 0;
            const slots = scope.querySelectorAll('.cv-tracker-slot');
            if (slots && slots.length > 0) {
                const st = loadState();
                slots.forEach(slot => {
                    const mode = slot.getAttribute('data-cv-mode') === 'full' ? 'full' : 'compact';
                    slot.innerHTML = mode === 'full' ? renderFullBoardHtml(st) : renderCompactStripHtml(st);
                });
            }
            if (typeof CompendioVarhenLoot !== 'undefined' && typeof CompendioVarhenLoot.hydrate === 'function') {
                CompendioVarhenLoot.hydrate(scope);
            }
            return slots ? slots.length : 0;
        },

        _commitAndRefresh() {
            saveState();
            this.hydrate(typeof document !== 'undefined' ? document : null);
        },

        toggleStep(index) {
            const st = loadState();
            const idx = Number(index);
            if (idx >= 0 && idx < st.steps.length) {
                st.steps[idx] = !st.steps[idx];
                this._commitAndRefresh();
            }
            return st.steps[idx];
        },

        toggleEmblem(key) {
            const st = loadState();
            if (Object.prototype.hasOwnProperty.call(st.emblems, key)) {
                st.emblems[key] = !st.emblems[key];
                this._commitAndRefresh();
            }
            return st.emblems[key];
        },

        setArauto(value) {
            const st = loadState();
            st.arautoMeter = Math.max(0, Math.min(6, Math.round(Number(value) || 0)));
            this._commitAndRefresh();
            return st.arautoMeter;
        },

        adjustArauto(delta) {
            const st = loadState();
            return this.setArauto(st.arautoMeter + (Number(delta) || 0));
        },

        resetArauto() {
            return this.setArauto(0);
        },

        setDestruction(value) {
            const st = loadState();
            st.destructionMeter = Math.max(1, Math.min(5, Math.round(Number(value) || 1)));
            this._commitAndRefresh();
            return st.destructionMeter;
        },

        adjustDestruction(delta) {
            const st = loadState();
            return this.setDestruction(st.destructionMeter + (Number(delta) || 0));
        },

        resetDestruction() {
            return this.setDestruction(1);
        },

        toggleExtra(key) {
            const st = loadState();
            if (Object.prototype.hasOwnProperty.call(st.extras, key)) {
                st.extras[key] = !st.extras[key];
                this._commitAndRefresh();
            }
            return st.extras[key];
        },

        setAstelStance(stance) {
            const st = loadState();
            if (['pendente', 'aliado', 'negociacao', 'hostil'].includes(stance)) {
                st.astelStance = stance;
                this._commitAndRefresh();
            }
            return st.astelStance;
        },

        resetAll() {
            cachedState = createDefaultState();
            this._commitAndRefresh();
            return cachedState;
        },

        openChapter(chapterKey) {
            try {
                if (typeof jumpToCatalogEntity === 'function') {
                    jumpToCatalogEntity('session', 'casa-varhen', chapterKey);
                    return true;
                }
            } catch (e) {}
            return false;
        },

        openEntry(category, groupKey, itemKey) {
            try {
                if (typeof compendioData === 'object' && compendioData && compendioData[category] && typeof jumpToCatalogEntity === 'function') {
                    const root = compendioData[category];
                    if (groupKey && root[groupKey] && root[groupKey].children && root[groupKey].children[itemKey]) {
                        jumpToCatalogEntity(category, groupKey, itemKey);
                        return true;
                    }
                    if (root[itemKey] && !root[itemKey].children) {
                        jumpToCatalogEntity(category, '', itemKey);
                        return true;
                    }
                    for (const [gk, gv] of Object.entries(root)) {
                        if (gv && gv.children && gv.children[itemKey]) {
                            jumpToCatalogEntity(category, gk, itemKey);
                            return true;
                        }
                    }
                }
                if (typeof showToast === 'function') {
                    showToast('Registro não encontrado no catálogo atual.');
                }
            } catch (e) {}
            return false;
        },

        sendMapToTabletop(mapPath) {
            try {
                if (typeof onTabletopMapChange === 'function' && typeof switchMainModule === 'function') {
                    onTabletopMapChange(mapPath);
                    switchMainModule('tabletop');
                    return true;
                }
            } catch (e) {}
            return false;
        }
    };

    window.CompendioVarhenTracker = CompendioVarhenTracker;
})();
