/* ==========================================================================
   COMPÊNDIO: SINCRONIZAÇÃO DE CATÁLOGO / VISIBILIDADE & IMPORTAÇÃO EM LOTE
   ========================================================================== */

(function() {
    const COMPENDIUM_CAT_META = [
        { key: 'monsters', dir: 'monster', icon: '👹', label: 'Monstros' },
        { key: 'npcs', dir: 'npc', icon: '🗣️', label: 'NPCs' },
        { key: 'items', dir: 'item', icon: '🎒', label: 'Itens' },
        { key: 'maps', dir: 'map', icon: '🗺️', label: 'Mapas' },
        { key: 'curio', dir: 'curio', icon: '📜', label: 'Curiosidades' },
        { key: 'session', dir: 'session', icon: '📅', label: 'Planos de Sessão' }
    ];

    const COMPENDIUM_TITLES_BY_KEY = {
        monsters: 'Monstros',
        npcs: 'NPCs',
        maps: 'Mapas',
        items: 'Itens',
        curio: 'Curiosidades',
        session: 'Planos de Sessão'
    };

    const DIR_ALIAS_TO_CAT = {
        monster: 'monsters', monsters: 'monsters', monstros: 'monsters',
        npc: 'npcs', npcs: 'npcs',
        item: 'items', items: 'items', itens: 'items',
        map: 'maps', maps: 'maps', mapa: 'maps', mapas: 'maps',
        curio: 'curio', curios: 'curio', curiosidade: 'curio', curiosidades: 'curio',
        session: 'session', sessions: 'session', sessao: 'session', sessoes: 'session'
    };

    const folderModalState = {
        activeTab: 'server',
        loadingScan: false,
        importing: false,
        scanError: '',
        counts: null,
        selectedCats: new Set(COMPENDIUM_CAT_META.map(c => c.key)),
        serverMode: 'merge',
        serverVisibility: 'auto',
        pcTargetCategory: 'auto',
        pcFallbackCategory: 'monsters',
        pcGroupOverride: '',
        pcMode: 'merge',
        pcVisibility: 'auto',
        pcSelectedFiles: [],
        pcSummary: null
    };

    function isServerWritable() {
        return typeof serverWritable !== 'undefined' && Boolean(serverWritable);
    }

    function naturalSortStr(a, b) {
        return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
    }

    function prettifyFolderTitle(rawName) {
        return String(rawName || '')
            .replace(/\.[^.]+$/, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, c => c.toUpperCase()) || 'Sem Título';
    }

    function _isImportEffectiveGm() {
        if (typeof isEffectiveGmUser === 'function') return isEffectiveGmUser();
        const p = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
        if (!p || p.isUnauthenticated || !p.id) return false;
        if (window.isHostClient === false) return false;
        return p.role === 'gm';
    }

    function hasVisibleEntryInSubtree(cat, nodeObj) {
        if (!nodeObj || typeof nodeObj !== 'object') return false;
        const isGm = _isImportEffectiveGm();
        for (const [k, v] of Object.entries(nodeObj)) {
            if (!v) continue;
            if (v.children && typeof v.children === 'object') {
                if (hasVisibleEntryInSubtree(cat, v.children)) return true;
            } else if (isGm) {
                return true;
            } else if (typeof getEffectiveKnowledgeLevel === 'function') {
                if (getEffectiveKnowledgeLevel(cat, k) !== 'hidden') return true;
            } else {
                return true;
            }
        }
        return false;
    }

    window.hasVisibleEntryInSubtree = hasVisibleEntryInSubtree;

    window.refreshCompendiumViewAfterSync = function(opts = {}) {
        const {
            catalogChanged = false,
            knowledgeChanged = false,
            questsChanged = false,
            hitDiceChanged = false,
            preserveKey = null
        } = opts || {};

        if (typeof updateMainModuleButtonsUI === 'function') updateMainModuleButtonsUI();

        if (typeof activeModule !== 'undefined' && activeModule === 'tabletop') {
            if ((catalogChanged || knowledgeChanged) && typeof renderTabletopModule === 'function') {
                renderTabletopModule();
            }
            return;
        }
        if (typeof activeModule !== 'undefined' && activeModule === 'character') {
            if ((catalogChanged || knowledgeChanged) && typeof renderCharacterModule === 'function') {
                renderCharacterModule();
            }
            return;
        }
        if (typeof activeModule !== 'undefined' && activeModule === 'curio_rules') {
            if ((catalogChanged || knowledgeChanged) && typeof renderCurioRulesModule === 'function') {
                renderCurioRulesModule(window._curioRulesTab || null);
            }
            return;
        }
        if (typeof activeModule !== 'undefined' && activeModule !== 'compendium') return;

        const isGm = _isImportEffectiveGm();
        if (!isGm && currentCategory === 'session') {
            const mNav = document.querySelector('.sidebar .nav-item[data-cat="monsters"]');
            if (typeof navigateCategory === 'function') navigateCategory('monsters', mNav);
            return;
        }

        if (currentCategory === 'quests') {
            if (typeof renderQuestsScreen === 'function') renderQuestsScreen();
            return;
        }
        if (currentCategory === 'hitdice') {
            if (typeof renderHitDiceScreen === 'function') renderHitDiceScreen();
            return;
        }

        if (!compendioData[currentCategory]) compendioData[currentCategory] = {};
        const rootItems = compendioData[currentCategory];
        const rootTitle = COMPENDIUM_TITLES_BY_KEY[currentCategory] || ('Lista de ' + currentCategory);

        const activeWasInCurrentCat = typeof activeItemContext !== 'undefined' && activeItemContext && activeItemContext.category === currentCategory;
        const wantedKey = preserveKey || (activeWasInCurrentCat ? activeItemContext.key : null);

        // Verifica se o item ativo deixou de existir ou ficou oculto para este jogador
        if (activeWasInCurrentCat && wantedKey) {
            const existsNow = (typeof findEntryInCatalog === 'function')
                ? Boolean(findEntryInCatalog(currentCategory, wantedKey))
                : Boolean(rootItems[wantedKey] || (currentListView?.collection && currentListView.collection[wantedKey]));
            const effLvl = (typeof getEffectiveKnowledgeLevel === 'function')
                ? getEffectiveKnowledgeLevel(currentCategory, wantedKey)
                : 'gm';
            if (!existsNow || (!isGm && effLvl === 'hidden')) {
                activeItemContext = null;
            }
        }

        if (!rootItems || Object.keys(rootItems).length === 0) {
            activeItemContext = null;
            const navEl = document.querySelector(`.sidebar .nav-item[data-cat="${currentCategory}"]`);
            if (typeof navigateCategory === 'function') navigateCategory(currentCategory, navEl);
            return;
        }

        const rootView = { items: rootItems, listTitle: rootTitle, collection: rootItems, parentView: null, groupKey: '' };
        const gKey = (typeof currentListView !== 'undefined' && currentListView && currentListView.groupKey) ? currentListView.groupKey : '';

        if (gKey && rootItems[gKey] && rootItems[gKey].children && (isGm || hasVisibleEntryInSubtree(currentCategory, rootItems[gKey].children))) {
            const subItems = rootItems[gKey].children;
            renderList(subItems, rootItems[gKey].title || gKey, subItems, false, rootView, gKey, wantedKey || '__PRESERVE_OR_FIRST__');
        } else {
            renderList(rootItems, rootTitle, rootItems, false, null, '', wantedKey || '__PRESERVE_OR_FIRST__');
        }
    };

    window.openFolderImportModal = function(initialTab) {
        if (!_isImportEffectiveGm()) {
            if (typeof showToast === 'function') showToast('🔒 Apenas o Mestre pode importar pastas para o Compêndio.');
            return;
        }
        folderModalState.activeTab = initialTab || (isServerWritable() ? 'server' : 'pc');
        folderModalState.scanError = '';
        folderModalState.pcSelectedFiles = [];
        folderModalState.pcSummary = null;
        if (COMPENDIUM_CAT_META.some(c => c.key === currentCategory)) {
            folderModalState.pcFallbackCategory = currentCategory;
        }
        const backdrop = document.getElementById('folder-scan-backdrop');
        if (backdrop) backdrop.classList.add('open');
        renderFolderImportModal();
        if (folderModalState.activeTab === 'server' && isServerWritable()) {
            previewServerFolderScan();
        }
    };

    window.closeFolderImportModal = function() {
        const backdrop = document.getElementById('folder-scan-backdrop');
        if (backdrop) backdrop.classList.remove('open');
    };

    window.switchFolderImportTab = function(tab) {
        folderModalState.activeTab = tab === 'pc' ? 'pc' : 'server';
        renderFolderImportModal();
        if (folderModalState.activeTab === 'server' && isServerWritable() && !folderModalState.counts && !folderModalState.loadingScan) {
            previewServerFolderScan();
        }
    };

    window.previewServerFolderScan = async function() {
        if (!isServerWritable()) {
            folderModalState.scanError = 'Modo estático / somente leitura detectado. Use a aba "Pasta do PC" ou inicie o servidor local.';
            renderFolderImportModal();
            return;
        }
        folderModalState.loadingScan = true;
        folderModalState.scanError = '';
        renderFolderImportModal();
        try {
            const res = await fetch('/api/scan-compendium', { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json.error || `HTTP ${res.status}`);
            }
            folderModalState.counts = json.counts || {};
        } catch (err) {
            folderModalState.scanError = err.message || 'Falha ao escanear pastas.';
        } finally {
            folderModalState.loadingScan = false;
            renderFolderImportModal();
        }
    };

    window.toggleFolderImportCategory = function(catKey, checked) {
        if (checked) folderModalState.selectedCats.add(catKey);
        else folderModalState.selectedCats.delete(catKey);
    };

    window.toggleAllFolderImportCategories = function(selectAll) {
        if (selectAll) COMPENDIUM_CAT_META.forEach(c => folderModalState.selectedCats.add(c.key));
        else folderModalState.selectedCats.clear();
        renderFolderImportModal();
    };

    window.executeServerFolderScanImport = async function() {
        if (!isServerWritable()) return;
        const cats = Array.from(folderModalState.selectedCats);
        if (cats.length === 0) {
            if (typeof showToast === 'function') showToast('⚠️ Selecione pelo menos uma categoria.');
            return;
        }
        folderModalState.importing = true;
        renderFolderImportModal();
        try {
            const payload = {
                mode: folderModalState.serverMode,
                categories: cats,
                defaultVisibility: folderModalState.serverVisibility === 'auto' ? null : folderModalState.serverVisibility
            };
            const res = await fetch('/api/scan-compendium', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json.error || `HTTP ${res.status}`);
            }
            if (json.compendioData && typeof json.compendioData === 'object') {
                compendioData = json.compendioData;
            }
            if (json.knowledge && typeof json.knowledge === 'object') {
                entityKnowledge = json.knowledge;
            }
            window._compendioReplacedAll = (folderModalState.serverMode === 'replace');
            if (typeof saveLocalPersistence === 'function') {
                saveLocalPersistence(window._compendioReplacedAll);
            }
            if (typeof CompendioNetAdapter !== 'undefined') {
                if (typeof CompendioNetAdapter.broadcastCompendium === 'function') CompendioNetAdapter.broadcastCompendium();
                else CompendioNetAdapter.syncServerSession();
            }
            const totalImported = cats.reduce((acc, k) => acc + (Number(json.counts?.[k]) || 0), 0);
            closeFolderImportModal();
            window.refreshCompendiumViewAfterSync({ catalogChanged: true, knowledgeChanged: true });
            if (typeof showToast === 'function') showToast(`📂 ${totalImported} registro(s) carregado(s) das pastas e sincronizado(s)!`);
        } catch (err) {
            folderModalState.scanError = err.message || 'Erro ao importar pastas do servidor.';
            renderFolderImportModal();
        } finally {
            folderModalState.importing = false;
        }
    };

    function classifySelectedPcFiles(files) {
        const list = Array.from(files || []).sort((a, b) => naturalSortStr(a.webkitRelativePath || a.name, b.webkitRelativePath || b.name));
        const ignored = [];
        const accepted = [];
        const byCat = {};
        COMPENDIUM_CAT_META.forEach(c => { byCat[c.key] = 0; });

        for (const f of list) {
            const name = f.name || '';
            if (!name || name.startsWith('.')) {
                ignored.push(name);
                continue;
            }
            const ext = (name.includes('.') ? '.' + name.split('.').pop().toLowerCase() : '');
            const isDoc = ['.json', '.html', '.htm', '.txt', '.md'].includes(ext);
            const isImg = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.avif'].includes(ext);
            if (!isDoc && !isImg) {
                ignored.push(name);
                continue;
            }
            const rawRel = (f.webkitRelativePath || name).replace(/\\/g, '/');
            const parts = rawRel.split('/').filter(Boolean);

            let detectedCat = folderModalState.pcTargetCategory === 'auto' ? null : folderModalState.pcTargetCategory;
            let subParts = parts.slice();

            if (folderModalState.pcTargetCategory === 'auto') {
                const matchIdx = parts.findIndex((seg, i) => i < parts.length - 1 && DIR_ALIAS_TO_CAT[seg.toLowerCase()]);
                if (matchIdx >= 0) {
                    detectedCat = DIR_ALIAS_TO_CAT[parts[matchIdx].toLowerCase()];
                    subParts = parts.slice(matchIdx + 1);
                } else {
                    detectedCat = folderModalState.pcFallbackCategory || 'monsters';
                    if (parts.length > 1) subParts = parts.slice(1);
                }
            } else if (parts.length > 1) {
                const matchIdx = parts.findIndex((seg, i) => i < parts.length - 1 && DIR_ALIAS_TO_CAT[seg.toLowerCase()]);
                subParts = matchIdx >= 0 ? parts.slice(matchIdx + 1) : parts.slice(1);
            }

            if (!COMPENDIUM_CAT_META.some(c => c.key === detectedCat)) detectedCat = 'monsters';
            accepted.push({ file: f, ext, isDoc, isImg, cat: detectedCat, subParts });
            if (isDoc || detectedCat === 'maps' || isImg) byCat[detectedCat] = (byCat[detectedCat] || 0) + 1;
        }

        return { accepted, ignored, byCat };
    }

    window.handleBatchPcFileSelection = function(fileList) {
        const files = Array.from(fileList || []);
        folderModalState.pcSelectedFiles = files;
        folderModalState.pcSummary = files.length > 0 ? classifySelectedPcFiles(files) : null;
        renderFolderImportModal();
    };

    function readFileAsTextAsync(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Falha ao ler arquivo texto'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    function readFileAsDataUrlAsync(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Falha ao ler arquivo binário'));
            reader.readAsDataURL(file);
        });
    }

    function extractTitleFromTextContent(fileName, ext, rawText) {
        let title = prettifyFolderTitle(fileName);
        if (ext === '.json') {
            try {
                const parsed = JSON.parse(rawText.replace(/^\uFEFF/, '').trim());
                const first = Array.isArray(parsed) ? parsed[0] : (parsed?.monster?.[0] || parsed?.item?.[0] || parsed?.npc?.[0] || parsed);
                if (first && typeof first === 'object' && (first.name || first.title)) {
                    title = String(first.name || first.title).trim();
                }
            } catch (e) {}
        } else if (ext === '.html' || ext === '.htm') {
            const m = rawText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
            if (m) {
                const clean = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                if (clean && clean.length <= 100) title = clean;
            }
        }
        return title;
    }

    function sanitizeSubpathSegment(seg) {
        return String(seg || '').replace(/[\\:*?"<>|]/g, '').trim() || 'arquivo';
    }

    window.executeBatchPcFilesImport = async function() {
        if (!folderModalState.pcSummary || folderModalState.pcSummary.accepted.length === 0) {
            if (typeof showToast === 'function') showToast('⚠️ Selecione uma pasta ou arquivos válidos primeiro.');
            return;
        }
        folderModalState.importing = true;
        renderFolderImportModal();

        try {
            const accepted = folderModalState.pcSummary.accepted;
            const customGroupTitle = (folderModalState.pcGroupOverride || '').trim();
            const customGroupSlug = customGroupTitle ? slugify(customGroupTitle) : '';
            const mode = folderModalState.pcMode === 'replace' ? 'replace' : 'merge';
            const visChoice = folderModalState.pcVisibility;
            const touchedCats = new Set(accepted.map(a => a.cat));

            if (mode === 'replace') {
                for (const c of touchedCats) compendioData[c] = {};
            }

            // Agrupa para colapsar subpasta de entidade única (ex: Beholder/beholder.json + beholder.png)
            const dirGroups = new Map();
            const filesToWrite = [];

            for (const item of accepted) {
                const dirParts = item.subParts.slice(0, -1).map(sanitizeSubpathSegment);
                const fileName = sanitizeSubpathSegment(item.subParts[item.subParts.length - 1]);
                const dirKey = `${item.cat}::${dirParts.join('/')}`;
                if (!dirGroups.has(dirKey)) dirGroups.set(dirKey, { cat: item.cat, dirParts, docs: [], imgs: [] });
                const grp = dirGroups.get(dirKey);
                if (item.isDoc) grp.docs.push({ ...item, fileName });
                else grp.imgs.push({ ...item, fileName });

                // Prepara gravação no disco se servidor local estiver ativo
                if (isServerWritable()) {
                    const meta = COMPENDIUM_CAT_META.find(c => c.key === item.cat);
                    const catDir = meta ? meta.dir : 'monster';
                    const diskRelParts = [...dirParts];
                    if (diskRelParts.length === 0 && customGroupSlug) diskRelParts.push(customGroupSlug);
                    const diskPath = `./${catDir}/${diskRelParts.length ? diskRelParts.join('/') + '/' : ''}${fileName}`;
                    if (item.isDoc || item.ext === '.svg') {
                        const txt = await readFileAsTextAsync(item.file);
                        item._cachedText = txt;
                        filesToWrite.push({ path: diskPath, content: txt });
                    } else {
                        const dataUrl = await readFileAsDataUrlAsync(item.file);
                        item._cachedDataUrl = dataUrl;
                        filesToWrite.push({ path: diskPath, base64: dataUrl });
                    }
                    item._diskPath = diskPath;
                }
            }

            let importedCount = 0;
            for (const grp of dirGroups.values()) {
                const { cat, dirParts, docs, imgs } = grp;
                if (!compendioData[cat]) compendioData[cat] = {};

                let targetFolderKey = '';
                let targetFolderTitle = '';
                let collapseSingleEntityKey = '';

                if (dirParts.length >= 2 && (cat === 'monsters' || cat === 'npcs' || cat === 'items')) {
                    const distinctDocSlugs = new Set(docs.map(d => slugify(d.fileName.replace(/\.[^.]+$/, ''))));
                    if (distinctDocSlugs.size === 1 || (docs.length === 0 && imgs.length >= 1)) {
                        targetFolderTitle = prettifyFolderTitle(dirParts[0]);
                        targetFolderKey = slugify(dirParts[0]);
                        collapseSingleEntityKey = slugify(dirParts[dirParts.length - 1]);
                    }
                }

                if (!collapseSingleEntityKey) {
                    if (dirParts.length >= 1) {
                        targetFolderTitle = prettifyFolderTitle(dirParts[0]);
                        targetFolderKey = slugify(dirParts[0]);
                    } else if (customGroupSlug) {
                        targetFolderTitle = customGroupTitle;
                        targetFolderKey = customGroupSlug;
                    }
                }

                let targetCollection = compendioData[cat];
                if (targetFolderKey) {
                    if (!compendioData[cat][targetFolderKey] || !compendioData[cat][targetFolderKey].children) {
                        compendioData[cat][targetFolderKey] = { title: targetFolderTitle, children: {} };
                    }
                    targetCollection = compendioData[cat][targetFolderKey].children;
                }

                let candidates = [];
                if (collapseSingleEntityKey) {
                    const chosen = docs.find(d => d.ext === '.json') || docs[0] || imgs.find(i => !/-art\./i.test(i.fileName)) || imgs[0];
                    if (chosen) candidates = [{ ...chosen, _forcedKey: collapseSingleEntityKey }];
                } else {
                    const basePool = (cat === 'maps') ? [...docs, ...imgs] : (docs.length > 0 ? docs : imgs);
                    candidates = basePool.filter(c => {
                        if (c.ext === '.json') return true;
                        const k = slugify(c.fileName.replace(/\.[^.]+$/, ''));
                        return !basePool.some(o => o.ext === '.json' && slugify(o.fileName.replace(/\.[^.]+$/, '')) === k);
                    });
                }

                for (const cand of candidates) {
                    const entryKey = cand._forcedKey || slugify(cand.fileName.replace(/\.[^.]+$/, ''));
                    let title = prettifyFolderTitle(cand.fileName);
                    const tipo = cand.ext === '.htm' ? 'html' : cand.ext.replace('.', '');
                    let inlineContent = null;
                    let entryPath = cand._diskPath || `./data/${entryKey}${cand.ext}`;

                    if (cand.isDoc || cand.ext === '.svg') {
                        const rawText = cand._cachedText !== undefined ? cand._cachedText : await readFileAsTextAsync(cand.file);
                        title = extractTitleFromTextContent(cand.fileName, cand.ext, rawText);
                        if (rawText.length <= 260000) inlineContent = rawText;
                    } else if (!cand._diskPath && cand.file.size <= 2 * 1024 * 1024) {
                        const dataUrl = cand._cachedDataUrl || await readFileAsDataUrlAsync(cand.file);
                        entryPath = dataUrl;
                        inlineContent = dataUrl;
                    }

                    const entryObj = { title, tipo, path: entryPath };
                    if (inlineContent) entryObj.inlineContent = inlineContent;
                    targetCollection[entryKey] = entryObj;

                    const knowKey = `${cat}:${entryKey}`;
                    if (visChoice !== 'auto') {
                        entityKnowledge[knowKey] = { globalLevel: visChoice, playerLevels: {} };
                    } else if (!entityKnowledge[knowKey]) {
                        entityKnowledge[knowKey] = { globalLevel: cat === 'session' ? 'hidden' : 'sighted', playerLevels: {} };
                    }
                    importedCount++;
                }
            }

            window._compendioReplacedAll = (mode === 'replace');
            if (typeof persistToDiskIfAvailable === 'function') {
                await persistToDiskIfAvailable(filesToWrite);
            } else if (typeof saveLocalPersistence === 'function') {
                saveLocalPersistence(window._compendioReplacedAll);
            }
            if (typeof CompendioNetAdapter !== 'undefined' && typeof CompendioNetAdapter.broadcastCompendium === 'function') {
                CompendioNetAdapter.broadcastCompendium();
            }

            const firstCat = Array.from(touchedCats)[0];
            closeFolderImportModal();
            if (firstCat && COMPENDIUM_CAT_META.some(c => c.key === firstCat)) {
                const navEl = document.querySelector(`.sidebar .nav-item[data-cat="${firstCat}"]`);
                if (typeof navigateCategory === 'function') navigateCategory(firstCat, navEl);
            } else {
                window.refreshCompendiumViewAfterSync({ catalogChanged: true, knowledgeChanged: true });
            }
            if (typeof showToast === 'function') showToast(`✅ ${importedCount} arquivo(s) importado(s) em lote para o Compêndio!`);
        } catch (err) {
            if (typeof showToast === 'function') showToast(`❌ Erro na importação em lote: ${err.message || err}`);
        } finally {
            folderModalState.importing = false;
            renderFolderImportModal();
        }
    };

    function renderFolderImportModal() {
        const container = document.getElementById('folder-scan-modal-content');
        if (!container) return;

        const tabServerActive = folderModalState.activeTab === 'server';
        const counts = folderModalState.counts || {};
        const totalOnDisk = COMPENDIUM_CAT_META.reduce((acc, c) => acc + (Number(counts[c.key]) || 0), 0);

        let bodyHtml = '';
        if (tabServerActive) {
            const catCardsHtml = COMPENDIUM_CAT_META.map(c => {
                const checked = folderModalState.selectedCats.has(c.key) ? 'checked' : '';
                const cnt = folderModalState.counts ? `${Number(counts[c.key]) || 0} arq.` : '...';
                return `
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; background:#14151e; border:1px solid #2b2e3d; border-radius:8px; cursor:pointer;">
                        <span style="display:flex; align-items:center; gap:8px; font-size:13px; color:#ece8df;">
                            <input type="checkbox" ${checked} onchange="toggleFolderImportCategory('${c.key}', this.checked)">
                            <span>${c.icon} ${c.label}</span>
                        </span>
                        <span style="font-size:11px; color:#d8b467; font-family:monospace;">public/${c.dir}/ (${cnt})</span>
                    </label>`;
            }).join('');

            bodyHtml = `
                <div style="font-size:13px; color:#c8c9d4; line-height:1.5; margin-bottom:14px;">
                    Varre dinamicamente as subpastas reais de <code style="color:#d8b467;">public/</code> no Host (útil após usar <strong>💀 Expurgar</strong> ou colocar arquivos novos direto nas pastas).
                </div>
                ${!isServerWritable() ? `
                    <div style="padding:12px; background:rgba(217,119,6,0.12); border:1px solid rgba(217,119,6,0.35); border-radius:8px; color:#fbbf24; font-size:12px; margin-bottom:14px;">
                        ⚠️ Servidor local em modo somente-leitura. Inicie com Node/PowerShell para varrer <code>public/</code> ou use a aba <strong>💻 Pasta do PC</strong> ao lado.
                    </div>` : ''}
                ${folderModalState.scanError ? `
                    <div style="padding:10px 12px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.4); border-radius:8px; color:#fca5a5; font-size:12px; margin-bottom:12px;">
                        ❌ ${escapeHtmlText(folderModalState.scanError)}
                    </div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-size:12px; font-weight:bold; color:#d8b467;">Pastas Detectadas (${folderModalState.loadingScan ? 'escaneando...' : totalOnDisk + ' registros encontrados'})</span>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="btn-mini" onclick="previewServerFolderScan()">🔄 Re-escanear</button>
                        <button type="button" class="btn-mini" onclick="toggleAllFolderImportCategories(true)">Marcar Tudo</button>
                        <button type="button" class="btn-mini" onclick="toggleAllFolderImportCategories(false)">Limpar</button>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px;">
                    ${catCardsHtml}
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label style="font-size:12px; color:#b8bac8; display:block; margin-bottom:4px;">Modo de Importação</label>
                        <select class="form-control" onchange="window._setFolderScanOpt('serverMode', this.value)">
                            <option value="merge" ${folderModalState.serverMode === 'merge' ? 'selected' : ''}>🔀 Mesclar (adiciona novos mantendo atuais)</option>
                            <option value="replace" ${folderModalState.serverMode === 'replace' ? 'selected' : ''}>♻️ Substituir categorias marcadas pelas pastas</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-size:12px; color:#b8bac8; display:block; margin-bottom:4px;">Visibilidade Inicial (novos itens)</label>
                        <select class="form-control" onchange="window._setFolderScanOpt('serverVisibility', this.value)">
                            <option value="auto" ${folderModalState.serverVisibility === 'auto' ? 'selected' : ''}>⚖️ Padrão (Sessão Oculta / Demais Vistos)</option>
                            <option value="hidden" ${folderModalState.serverVisibility === 'hidden' ? 'selected' : ''}>🔒 Tudo Oculto (Mestre revela na hora)</option>
                            <option value="sighted" ${folderModalState.serverVisibility === 'sighted' ? 'selected' : ''}>👁️ Tudo Visto (Nome/Aparência)</option>
                            <option value="studied" ${folderModalState.serverVisibility === 'studied' ? 'selected' : ''}>📖 Tudo Estudado (Ficha completa)</option>
                        </select>
                    </div>
                </div>`;
        } else {
            const sum = folderModalState.pcSummary;
            const summaryHtml = sum ? `
                <div style="padding:12px; background:#14151e; border:1px solid #2b2e3d; border-radius:8px; margin-top:12px;">
                    <div style="font-size:12px; font-weight:bold; color:#86efac; margin-bottom:6px;">
                        ✅ ${sum.accepted.length} arquivo(s) compatível(is) prontos para importação (${sum.ignored.length} ignorado(s)):
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        ${COMPENDIUM_CAT_META.filter(c => sum.byCat[c.key] > 0).map(c =>
                            `<span style="font-size:11px; padding:3px 8px; border-radius:12px; background:#232638; color:#ece8df;">${c.icon} ${c.label}: ${sum.byCat[c.key]}</span>`
                        ).join('') || '<span style="font-size:12px; color:#9ca3af;">Nenhum arquivo válido encontrado.</span>'}
                    </div>
                </div>` : `
                <div style="padding:14px; background:#14151e; border:1px dashed #3a3e52; border-radius:8px; text-align:center; color:#9da2b8; font-size:12px; margin-top:12px;">
                    Nenhuma pasta ou lote selecionado ainda. Escolha abaixo uma pasta inteira (inclui subpastas como grupos!) ou múltiplos arquivos JSON, HTML, TXT, MD, SVG e imagens.
                </div>`;

            bodyHtml = `
                <div style="font-size:13px; color:#c8c9d4; line-height:1.5; margin-bottom:14px;">
                    Importe qualquer pasta do seu computador diretamente para o Compêndio ${isServerWritable() ? '(também salva os arquivos no servidor para acesso dos jogadores)' : '(salvo em cache local e sincronizado com a sala)'}.
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px;">
                    <div class="form-group">
                        <label style="font-size:12px; color:#b8bac8; display:block; margin-bottom:4px;">Detecção de Categoria</label>
                        <select class="form-control" onchange="window._setFolderScanOpt('pcTargetCategory', this.value, true)">
                            <option value="auto" ${folderModalState.pcTargetCategory === 'auto' ? 'selected' : ''}>🤖 Auto-detectar subpastas (monster, npc, item...)</option>
                            ${COMPENDIUM_CAT_META.map(c => `<option value="${c.key}" ${folderModalState.pcTargetCategory === c.key ? 'selected' : ''}>${c.icon} Forçar tudo em ${c.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-size:12px; color:#b8bac8; display:block; margin-bottom:4px;">Categoria Padrão (se sem prefixo)</label>
                        <select class="form-control" onchange="window._setFolderScanOpt('pcFallbackCategory', this.value, true)">
                            ${COMPENDIUM_CAT_META.map(c => `<option value="${c.key}" ${folderModalState.pcFallbackCategory === c.key ? 'selected' : ''}>${c.icon} ${c.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-size:12px; color:#b8bac8; display:block; margin-bottom:4px;">Pasta/Grupo Destino (opcional p/ arquivos soltos)</label>
                        <input type="text" class="form-control" value="${escapeHtmlText(folderModalState.pcGroupOverride)}" oninput="folderModalState_setGroup(this.value)" placeholder="Ex: Bestiário Custom, Ato 2...">
                    </div>
                    <div class="form-group">
                        <label style="font-size:12px; color:#b8bac8; display:block; margin-bottom:4px;">Visibilidade & Modo</label>
                        <div style="display:flex; gap:6px;">
                            <select class="form-control" style="flex:1;" onchange="window._setFolderScanOpt('pcMode', this.value)">
                                <option value="merge" ${folderModalState.pcMode === 'merge' ? 'selected' : ''}>Mesclar</option>
                                <option value="replace" ${folderModalState.pcMode === 'replace' ? 'selected' : ''}>Substituir</option>
                            </select>
                            <select class="form-control" style="flex:1;" onchange="window._setFolderScanOpt('pcVisibility', this.value)">
                                <option value="auto" ${folderModalState.pcVisibility === 'auto' ? 'selected' : ''}>⚖️ Padrão</option>
                                <option value="hidden" ${folderModalState.pcVisibility === 'hidden' ? 'selected' : ''}>🔒 Oculto</option>
                                <option value="sighted" ${folderModalState.pcVisibility === 'sighted' ? 'selected' : ''}>👁️ Visto</option>
                                <option value="studied" ${folderModalState.pcVisibility === 'studied' ? 'selected' : ''}>📖 Estudado</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <label class="btn-save-primary" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                        📂 Selecionar Pasta Completa do PC
                        <input type="file" webkitdirectory directory multiple style="display:none;" onchange="handleBatchPcFileSelection(this.files)">
                    </label>
                    <label class="btn-action-bar" style="cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                        📄 Selecionar Múltiplos Arquivos
                        <input type="file" multiple accept=".json,.html,.htm,.txt,.md,.svg,.png,.jpg,.jpeg,.webp,.gif" style="display:none;" onchange="handleBatchPcFileSelection(this.files)">
                    </label>
                </div>
                ${summaryHtml}`;
        }

        container.innerHTML = `
            <div class="studio-header">
                <h2>📂 Importar Pastas e Arquivos em Lote</h2>
                <button class="btn-close-modal" type="button" onclick="closeFolderImportModal()">✕</button>
            </div>
            <div style="padding:18px 22px; overflow-y:auto; flex:1;">
                <div style="display:flex; gap:8px; border-bottom:1px solid #2b2e3d; padding-bottom:12px; margin-bottom:16px;">
                    <button type="button" class="${tabServerActive ? 'btn-save-primary' : 'btn-action-bar'}" onclick="switchFolderImportTab('server')">
                        📁 Pastas do Servidor (public/)
                    </button>
                    <button type="button" class="${!tabServerActive ? 'btn-save-primary' : 'btn-action-bar'}" onclick="switchFolderImportTab('pc')">
                        💻 Pasta ou Arquivos do PC
                    </button>
                </div>
                ${bodyHtml}
            </div>
            <div class="studio-footer">
                <div style="font-size:12px; color:#9da2b8;">
                    ${tabServerActive ? 'Reconstruirá o catálogo diretamente a partir dos arquivos em disco e atualizará todos os jogadores online.' : 'Importa tudo de uma vez preservando pastas e títulos de JSON/HTML.'}
                </div>
                <div style="display:flex; gap:10px;">
                    <button type="button" class="btn-action-bar" onclick="closeFolderImportModal()">Cancelar</button>
                    ${tabServerActive
                        ? `<button type="button" class="btn-save-primary" ${(!isServerWritable() || folderModalState.importing) ? 'disabled' : ''} onclick="executeServerFolderScanImport()">${folderModalState.importing ? '⏳ Importando...' : '🚀 Carregar Pastas Selecionadas'}</button>`
                        : `<button type="button" class="btn-save-primary" ${(!folderModalState.pcSummary || folderModalState.pcSummary.accepted.length === 0 || folderModalState.importing) ? 'disabled' : ''} onclick="executeBatchPcFilesImport()">${folderModalState.importing ? '⏳ Importando...' : '✅ Importar Lote para o Compêndio'}</button>`}
                </div>
            </div>`;
    }

    window._setFolderScanOpt = function(field, val, reclassify = false) {
        folderModalState[field] = val;
        if (reclassify && folderModalState.pcSelectedFiles.length > 0) {
            folderModalState.pcSummary = classifySelectedPcFiles(folderModalState.pcSelectedFiles);
            renderFolderImportModal();
        }
    };

    window.folderModalState_setGroup = function(val) {
        folderModalState.pcGroupOverride = val;
    };
})();
