/* =========================================================================
   FASE 2: UNIFICAÇÃO DE COMBATE (RUNA), INICIATIVA, TABLETOP E DADOS DE VIDA
   Sincroniza PV, Iniciativa, Turnos, Condições e Dados de Vida entre
   a Runa de Combate, os Tokens no Tabletop e as Fichas de Personagem.
   ========================================================================= */

window.combatTurnState = {
    activeCardId: null,
    round: 1
};

// Sincroniza PV entre Card da Runa, Token do Tabletop e Ficha de Personagem
function syncCombatEntityHp(cardOrTokenOrCharId, newHp, newMaxHp = null) {
    let targetCard = null;
    let targetToken = null;
    let targetChar = null;

    if (typeof combatCards !== 'undefined') {
        targetCard = combatCards.find(c =>
            String(c.id) === String(cardOrTokenOrCharId) ||
            (c.tokenId && String(c.tokenId) === String(cardOrTokenOrCharId)) ||
            (c.charId && String(c.charId) === String(cardOrTokenOrCharId))
        );
    }

    if (typeof tabletopState !== 'undefined' && Array.isArray(tabletopState.tokens)) {
        targetToken = tabletopState.tokens.find(t =>
            String(t.id) === String(cardOrTokenOrCharId) ||
            (targetCard && targetCard.tokenId && String(t.id) === String(targetCard.tokenId)) ||
            (t.refId && String(t.refId) === String(cardOrTokenOrCharId)) ||
            (targetCard && targetCard.charId && String(t.refId) === String(targetCard.charId))
        );
    }

    if (typeof charactersData !== 'undefined') {
        const charIdCandidate = (targetCard && targetCard.charId) || (targetToken && targetToken.refId) || cardOrTokenOrCharId;
        targetChar = charactersData.find(c => String(c.id) === String(charIdCandidate));
    }

    if (targetCard) {
        if (newMaxHp !== null && !isNaN(Number(newMaxHp))) {
            targetCard.maxHp = Math.max(1, Number(newMaxHp));
        }
        targetCard.hp = Math.max(0, Math.min(targetCard.maxHp, Number(newHp) || 0));
    }

    if (targetToken) {
        if (newMaxHp !== null && !isNaN(Number(newMaxHp))) {
            targetToken.hpMax = Math.max(1, Number(newMaxHp));
        }
        const maxT = Number(targetToken.hpMax) || (targetCard ? targetCard.maxHp : 100);
        targetToken.hpCurrent = Math.max(0, Math.min(maxT, Number(newHp) || 0));
    }

    if (targetChar) {
        if (newMaxHp !== null && !isNaN(Number(newMaxHp))) {
            targetChar.hpMax = Math.max(1, Number(newMaxHp));
        }
        targetChar.hpCurrent = Math.max(0, Math.min(Number(targetChar.hpMax) || 100, Number(newHp) || 0));
    }

    if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        if (CompendioNetAdapter.broadcastTabletop) CompendioNetAdapter.broadcastTabletop();
        if (CompendioNetAdapter.broadcastCharacters) CompendioNetAdapter.broadcastCharacters();
        if (CompendioNetAdapter.broadcastCombat) CompendioNetAdapter.broadcastCombat();
    }

    if (typeof renderCombatHand === 'function') renderCombatHand();
    if (typeof activeModule !== 'undefined') {
        if (activeModule === 'tabletop' && typeof renderTabletopModule === 'function') renderTabletopModule();
        if (activeModule === 'character' && typeof renderCharacterModule === 'function') renderCharacterModule();
    }
}

/* =========================================================================
   EXTRATOR UNIFICADO DE ESTATÍSTICAS & RESOLVEDOR DE IMAGENS DE TOKENS
   Suporta fichas JSON (5etools/Homebrew) e HTML, pastas legadas (./data/...),
   manifesto local /api/local-assets e fallback de imagens no Tabletop.
   ========================================================================= */

window.compendiumLocalAssets = window.compendiumLocalAssets || {
    loaded: false,
    loadingPromise: null,
    images: [],
    byPath: new Map(),
    byFolder: new Map()
};
window._tokenImgProbeCache = window._tokenImgProbeCache || new Map();

function _normalizeAssetSlug(raw) {
    return String(raw || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function _normalizeRelImagePath(rawPath) {
    let p = String(rawPath || '').trim().replace(/\\/g, '/');
    if (!p) return '';
    if (/^(data:|https?:|blob:|\/)/i.test(p)) return p;
    if (!p.startsWith('./') && !p.startsWith('../')) p = './' + p.replace(/^\.?\//, '');
    return p;
}

function _scoreTokenFilename(filePath) {
    const fileName = String(filePath || '').split('/').pop().toLowerCase();
    const stem = fileName.replace(/\.[^.]+$/, '');
    let score = 10;
    if (/[-_]token$/.test(stem)) score += 40;
    if (/(?:^|[-_])(art|fluff|full|map|scene|banner)(?:[-_]|$)/.test(stem)) score -= 25;
    if (/(?:^|[-_])big(?:[-_]?v\d+)?$/.test(stem)) score -= 18;
    if (/\.png$/i.test(fileName)) score += 3;
    else if (/\.webp$/i.test(fileName)) score += 2;
    else if (/\.jpe?g$/i.test(fileName)) score += 1;
    return score;
}

/** Registra lista de caminhos de imagens locais conhecidas para resolução instantânea de tokens. */
function setCompendiumLocalAssetList(imageList = []) {
    const byPath = new Map();
    const byFolder = new Map();
    const cleanImages = [];

    for (const raw of (imageList || [])) {
        const rel = _normalizeRelImagePath(raw);
        if (!rel) continue;
        const lower = rel.toLowerCase();
        if (byPath.has(lower)) continue;
        byPath.set(lower, rel);
        cleanImages.push(rel);

        const parts = rel.replace(/^\.\//, '').split('/');
        parts.pop(); // remove nome do arquivo
        const rootCat = (parts[0] || '').toLowerCase();
        const folderKeys = new Set();
        parts.forEach((seg, idx) => {
            if (idx === 0 && ['monster', 'npc', 'item', 'map', 'curio', 'data'].includes(seg.toLowerCase())) return;
            const slug = _normalizeAssetSlug(seg);
            if (!slug || slug === 'data') return;
            folderKeys.add(slug);
            if (rootCat) folderKeys.add(`${rootCat}:${slug}`);
        });
        const stemSlug = _normalizeAssetSlug(rel.split('/').pop());
        if (stemSlug) {
            folderKeys.add(`file:${stemSlug}`);
            if (rootCat) folderKeys.add(`${rootCat}:file:${stemSlug}`);
        }
        folderKeys.forEach(fk => {
            if (!byFolder.has(fk)) byFolder.set(fk, []);
            byFolder.get(fk).push(rel);
        });
    }

    for (const [k, arr] of byFolder.entries()) {
        arr.sort((a, b) => _scoreTokenFilename(b) - _scoreTokenFilename(a));
        byFolder.set(k, arr);
    }

    window.compendiumLocalAssets.loaded = true;
    window.compendiumLocalAssets.images = cleanImages;
    window.compendiumLocalAssets.byPath = byPath;
    window.compendiumLocalAssets.byFolder = byFolder;
    return window.compendiumLocalAssets;
}

/** Busca o manifesto /api/local-assets uma única vez quando o servidor Node está ativo. */
async function fetchCompendiumLocalAssets(force = false) {
    const cache = window.compendiumLocalAssets;
    if (cache.loaded && !force) return cache;
    if (cache.loadingPromise && !force) return cache.loadingPromise;
    if (typeof fetch !== 'function' || (typeof window !== 'undefined' && window.location?.protocol === 'file:')) {
        return cache;
    }

    cache.loadingPromise = (async () => {
        try {
            const devId = (typeof getOrCreateDeviceId === 'function')
                ? getOrCreateDeviceId()
                : (typeof window !== 'undefined' ? (window.localDeviceId || window.localClientId || '') : '');
            const url = devId ? `/api/local-assets?deviceId=${encodeURIComponent(devId)}` : '/api/local-assets';
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json().catch(() => null);
                if (data && data.ok && Array.isArray(data.images)) {
                    setCompendiumLocalAssetList(data.images);
                }
            }
        } catch (e) {
            // Modo offline / estático: segue normalmente com candidatos por caminho
        } finally {
            cache.loadingPromise = null;
        }
        return cache;
    })();
    return cache.loadingPromise;
}

/** Converte fórmulas como "34d20 + 340" para sua média inteira estática (sem rolagem aleatória). */
function computeDiceFormulaAverage(formula) {
    const raw = String(formula || '').trim();
    if (!raw) return null;
    const m = raw.match(/(\d+)\s*d\s*(\d+)(?:\s*([+\-])\s*(\d+))?/i);
    if (!m) {
        const plain = raw.match(/^(\d{1,6})$/);
        return plain ? Number(plain[1]) : null;
    }
    const count = parseInt(m[1], 10) || 0;
    const sides = parseInt(m[2], 10) || 0;
    const sign = m[3] === '-' ? -1 : 1;
    const bonus = m[4] ? (parseInt(m[4], 10) || 0) * sign : 0;
    if (count <= 0 || sides <= 0) return null;
    return Math.max(1, Math.floor(count * ((sides + 1) / 2) + bonus));
}

function parseCrToProfBonus(crVal) {
    const raw = (crVal && typeof crVal === 'object') ? (crVal.cr ?? '') : crVal;
    const s = String(raw || '').trim();
    if (!s) return 2;
    let numCr = 0;
    if (/^\d+\s*\/\s*\d+$/.test(s)) {
        const [a, b] = s.split('/').map(Number);
        numCr = b ? (a / b) : 0;
    } else {
        numCr = parseFloat(s) || 0;
    }
    if (numCr < 5) return 2;
    return Math.max(2, 2 + Math.floor((Math.ceil(numCr) - 1) / 4));
}

function normalizeCreatureSizeCode(rawSize) {
    const raw = Array.isArray(rawSize) ? (rawSize[0] || 'M') : (rawSize || 'M');
    const s = String(raw).trim().toUpperCase();
    if (s === 'T' || s.startsWith('TINY') || s.startsWith('MIN')) return 'T';
    if (s === 'S' || s.startsWith('SMALL') || s.startsWith('PEQ')) return 'S';
    if (s === 'L' || s.startsWith('LARGE') || s.startsWith('GRAND')) return 'L';
    if (s === 'H' || s.startsWith('HUGE') || s.startsWith('ENORM')) return 'H';
    if (s === 'G' || s.startsWith('GARGANT') || s.startsWith('IMENS') || s.startsWith('COLOSS')) return 'G';
    return 'M';
}

function _footprintFromSizeCode(sizeCode) {
    if (typeof CompendioRules !== 'undefined' && typeof CompendioRules.getCreatureFootprintSquares === 'function') {
        return CompendioRules.getCreatureFootprintSquares(sizeCode);
    }
    const map = { G: 4, H: 3, L: 2 };
    return map[sizeCode] || 1;
}

/** Extrai estatísticas exatas de um statblock JSON (5etools / Homebrew). */
function extractCreatureStatsFromJson(j) {
    if (!j || typeof j !== 'object') return null;
    let hp = null;
    const rawHp = j.hp;
    if (typeof rawHp === 'number' && Number.isFinite(rawHp) && rawHp > 0) {
        hp = Math.round(rawHp);
    } else if (typeof rawHp === 'string') {
        const lm = rawHp.match(/(\d{1,6})/);
        hp = lm ? parseInt(lm[1], 10) : computeDiceFormulaAverage(rawHp);
    } else if (rawHp && typeof rawHp === 'object') {
        if (rawHp.average !== undefined && rawHp.average !== null && !isNaN(Number(rawHp.average))) {
            hp = Math.round(Number(rawHp.average));
        } else if (rawHp.max !== undefined && rawHp.max !== null && !isNaN(Number(rawHp.max))) {
            hp = Math.round(Number(rawHp.max));
        } else if (typeof rawHp.special === 'string') {
            const sm = rawHp.special.match(/(\d{1,6})/);
            hp = sm ? parseInt(sm[1], 10) : computeDiceFormulaAverage(rawHp.special);
        } else if (typeof rawHp.formula === 'string') {
            hp = computeDiceFormulaAverage(rawHp.formula);
        }
    }
    if ((!hp || hp <= 0) && j.hpMax !== undefined && !isNaN(Number(j.hpMax))) {
        hp = Math.round(Number(j.hpMax));
    }

    let ac = null;
    if (Array.isArray(j.ac) && j.ac.length > 0) {
        const firstAc = j.ac[0];
        if (typeof firstAc === 'number') ac = firstAc;
        else if (firstAc && typeof firstAc === 'object' && firstAc.ac !== undefined) ac = Number(firstAc.ac);
        else {
            const acM = String(firstAc).match(/(\d{1,3})/);
            if (acM) ac = parseInt(acM[1], 10);
        }
    } else if (typeof j.ac === 'number') {
        ac = j.ac;
    } else if (j.ac && typeof j.ac === 'object' && j.ac.ac !== undefined) {
        ac = Number(j.ac.ac);
    } else if (typeof j.ac === 'string') {
        const acM = j.ac.match(/(\d{1,3})/);
        if (acM) ac = parseInt(acM[1], 10);
    }

    const sizeCode = normalizeCreatureSizeCode(j.size);
    const sizeSquares = _footprintFromSizeCode(sizeCode);
    const dexScore = j.dex !== undefined && !isNaN(Number(j.dex)) ? Number(j.dex) : 10;
    const dexMod = Math.floor((dexScore - 10) / 2);

    let initMod = dexMod;
    if (typeof j.initiative === 'number' && Number.isFinite(j.initiative)) {
        initMod = j.initiative;
    } else if (j.initiative && typeof j.initiative === 'object') {
        if (typeof j.initiative.initiative === 'number' && Number.isFinite(j.initiative.initiative)) {
            initMod = j.initiative.initiative;
        } else if (typeof j.initiative.proficiency === 'number' && Number.isFinite(j.initiative.proficiency)) {
            initMod = dexMod + Math.round(j.initiative.proficiency * parseCrToProfBonus(j.cr));
        }
    }

    return {
        title: String(j.name || j.title || '').trim(),
        hp: (hp && hp > 0) ? hp : null,
        ac: (ac !== null && Number.isFinite(ac)) ? ac : null,
        sizeCode,
        sizeSquares,
        dex: dexScore,
        initMod,
        customToken: String(j.customToken || '').trim()
    };
}

function _stripHtmlTagsClean(s) {
    return String(s || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:div|p|tr|li|h\d)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

/** Extrai PV, CA, tamanho, iniciativa, DEX e caminhos de imagem de ficha HTML. */
function extractCreatureStatsFromHtml(htmlText, entry = null) {
    const raw = String(htmlText || '');
    if (!raw || !/<[a-z]/i.test(raw)) return null;

    const h1Match = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = h1Match ? _stripHtmlTagsClean(h1Match[1]) : String(entry?.title || '').trim();

    let sizeCode = 'M';
    const subMatch = raw.match(/<div[^>]*class=["'][^"']*\bsubtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const subText = subMatch ? _stripHtmlTagsClean(subMatch[1]) : '';
    const sizeMatch = (subText || raw.slice(0, 1500)).match(/\b(Tiny|Small|Medium|Large|Huge|Gargantuan|Min[úu]scul[oa]|Pequen[oa]|M[ée]di[oa]|Grande|Enorme|Imensur[áa]vel)\b/i);
    if (sizeMatch) {
        sizeCode = normalizeCreatureSizeCode(sizeMatch[1]);
    }
    const sizeSquares = _footprintFromSizeCode(sizeCode);

    // Restringe parsing textual de fallback à seção de cabeçalho antes das ações/traços
    const cleanText = _stripHtmlTagsClean(raw);
    const headerCutIdx = cleanText.search(/\n\s*(?:Actions|A[çc][õo]es|Reactions|Rea[çc][õo]es|Legendary Actions)\b/i);
    const headerText = headerCutIdx > 0 ? cleanText.slice(0, headerCutIdx) : cleanText.slice(0, 1200);

    let hp = null;
    const hpTagMatch = raw.match(/<(?:span|strong|b|td|th)\b[^>]*>\s*(?:Hit\s*Points|Pontos\s*de\s*Vida|PV(?:\s*M[áa]x(?:imos?)?)?|HP)\s*:?\s*<\/(?:span|strong|b|td|th)>\s*[:\-]?\s*(\d{1,6})/i);
    if (hpTagMatch) {
        hp = parseInt(hpTagMatch[1], 10);
    } else {
        const hpLineMatch = headerText.match(/(?:^|\n)\s*(?:Hit\s*Points|Pontos\s*de\s*Vida|HP|PV)\s*[:\-]?\s*(\d{1,6})/i);
        if (hpLineMatch) {
            hp = parseInt(hpLineMatch[1], 10);
        } else {
            const hpFormulaTag = raw.match(/<(?:span|strong|b)[^>]*>\s*(?:Hit\s*Points|Pontos\s*de\s*Vida|HP|PV)\s*:?\s*<\/(?:span|strong|b)>\s*[:\-]?\s*\(?(\d+\s*d\s*\d+(?:\s*[+\-]\s*\d+)?)/i);
            if (hpFormulaTag) hp = computeDiceFormulaAverage(hpFormulaTag[1]);
        }
    }

    let ac = null;
    const acTagMatch = raw.match(/<(?:span|strong|b|td|th)\b[^>]*>\s*(?:Armor\s*Class|Classe\s*de\s*Armadura|CA|AC)\s*:?\s*<\/(?:span|strong|b|td|th)>\s*[:\-]?\s*(\d{1,3})/i);
    if (acTagMatch) {
        ac = parseInt(acTagMatch[1], 10);
    } else {
        const acLineMatch = headerText.match(/(?:^|\n)\s*(?:Armor\s*Class|Classe\s*de\s*Armadura|CA|AC)\s*[:\-]?\s*(\d{1,3})/i);
        if (acLineMatch) ac = parseInt(acLineMatch[1], 10);
    }

    let dex = 10;
    const abTableMatch = raw.match(/<table[^>]*class=["'][^"']*\babilities\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
    if (abTableMatch) {
        const ths = [...abTableMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => _stripHtmlTagsClean(m[1]).toUpperCase());
        const tds = [...abTableMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => _stripHtmlTagsClean(m[1]));
        const dexIdx = ths.findIndex(h => h === 'DEX' || h === 'DES');
        if (dexIdx >= 0 && tds[dexIdx]) {
            const dm = tds[dexIdx].match(/(\d{1,2})/);
            if (dm) dex = parseInt(dm[1], 10);
        }
    }
    const dexMod = Math.floor((dex - 10) / 2);

    let initMod = dexMod;
    const initTagMatch = raw.match(/<(?:span|strong|b|td|th)\b[^>]*>\s*(?:Initiative|Iniciativa)\s*:?\s*<\/(?:span|strong|b|td|th)>\s*[:\-]?\s*([+\-]?\d+)/i);
    if (initTagMatch) {
        initMod = parseInt(initTagMatch[1], 10);
    } else {
        const initLineMatch = headerText.match(/(?:^|\n)\s*(?:Initiative|Iniciativa)\s*[:\-]?\s*([+\-]?\d+)/i);
        if (initLineMatch) initMod = parseInt(initLineMatch[1], 10);
    }

    const htmlTokenSrcs = [];
    const htmlArtSrcs = [];
    const imgTags = [...raw.matchAll(/<img\b([^>]*)>/gi)];
    for (const m of imgTags) {
        const attrs = m[1] || '';
        const srcM = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
        if (!srcM || !srcM[1]) continue;
        const srcVal = srcM[1].trim();
        const isTokenImg = /\btoken-image\b/i.test(attrs) || /token/i.test(attrs);
        const isArtImg = /\bfull-artwork\b/i.test(attrs) || /(?:[-_](?:art|fluff|big)(?:[-_.]|$))/i.test(srcVal);
        if (isTokenImg) htmlTokenSrcs.unshift(srcVal);
        else if (isArtImg) htmlArtSrcs.push(srcVal);
        else htmlTokenSrcs.push(srcVal);
    }

    return {
        title,
        hp: (hp && hp > 0) ? hp : null,
        ac: (ac !== null && Number.isFinite(ac)) ? ac : null,
        sizeCode,
        sizeSquares,
        dex,
        initMod: Number.isFinite(initMod) ? initMod : 0,
        htmlTokenSrcs,
        htmlArtSrcs
    };
}

function _mapCatToDirPrefix(category) {
    const c = String(category || '').toLowerCase();
    if (c === 'monsters' || c === 'monster') return 'monster';
    if (c === 'npcs' || c === 'npc') return 'npc';
    if (c === 'items' || c === 'item') return 'item';
    if (c === 'curio') return 'curio';
    if (c === 'maps' || c === 'map') return 'map';
    return '';
}

/** Resolve possíveis caminhos de imagens reais no manifesto local a partir de dicas/slugs/caminhos. */
function findLocalManifestImagesForHints(hints = [], category = '', brokenPath = '') {
    const cache = window.compendiumLocalAssets;
    if (!cache || !cache.loaded || !cache.byFolder) return [];
    const results = [];
    const seen = new Set();
    const catPrefix = _mapCatToDirPrefix(category);

    const addRel = (rel) => {
        if (!rel || seen.has(rel)) return;
        seen.add(rel);
        results.push(rel);
    };

    if (brokenPath) {
        const normBroken = _normalizeRelImagePath(brokenPath).toLowerCase();
        if (cache.byPath.has(normBroken)) addRel(cache.byPath.get(normBroken));
        const bParts = brokenPath.replace(/^\.\//, '').split('/').filter(Boolean);
        bParts.forEach(p => {
            const slug = _normalizeAssetSlug(p);
            if (slug && !['data', 'monster', 'npc', 'item', 'curio', 'map'].includes(slug)) {
                hints = [...hints, slug];
            }
        });
    }

    const cleanSlugs = [];
    const seenSlugs = new Set();
    for (const h of hints) {
        const s = _normalizeAssetSlug(h);
        if (!s || seenSlugs.has(s) || s === 'data') continue;
        seenSlugs.add(s);
        cleanSlugs.push(s);
    }

    // 1. Prioriza match na pasta da mesma categoria; depois qualquer pasta com mesmo slug; por fim match por nome do arquivo
    const lookupKeys = [];
    cleanSlugs.forEach(s => { if (catPrefix) lookupKeys.push(`${catPrefix}:${s}`); });
    cleanSlugs.forEach(s => lookupKeys.push(s));
    cleanSlugs.forEach(s => { if (catPrefix) lookupKeys.push(`${catPrefix}:file:${s}`); });
    cleanSlugs.forEach(s => lookupKeys.push(`file:${s}`));

    for (const lk of lookupKeys) {
        const arr = cache.byFolder.get(lk);
        if (Array.isArray(arr)) arr.forEach(addRel);
    }

    return results;
}

/** Constrói lista ordenada de caminhos candidatos para Token/Arte de qualquer entrada (JSON ou HTML). */
function buildCompendiumTokenImageCandidates(itemData = {}, json = null, opts = {}) {
    const tokenList = [];
    const fluffList = [];
    const seenTok = new Set();
    const seenFluff = new Set();
    const vFiles = (typeof virtualFiles !== 'undefined' && virtualFiles) ? virtualFiles : {};

    const pushTok = (p) => {
        if (!p) return;
        const resolved = vFiles[p] || _normalizeRelImagePath(p);
        if (!resolved || seenTok.has(resolved)) return;
        seenTok.add(resolved);
        tokenList.push(resolved);
    };
    const pushFluff = (p) => {
        if (!p) return;
        const resolved = vFiles[p] || _normalizeRelImagePath(p);
        if (!resolved || seenFluff.has(resolved)) return;
        seenFluff.add(resolved);
        fluffList.push(resolved);
    };

    const htmlMeta = opts.htmlContent ? extractCreatureStatsFromHtml(opts.htmlContent, itemData) : null;
    const rawCustom = json?.customToken || itemData?.customToken;
    if (rawCustom) pushTok(rawCustom);

    const hintSlugs = [];
    if (opts.itemKey) hintSlugs.push(opts.itemKey);
    if (opts.groupKey) hintSlugs.push(opts.groupKey);
    if (itemData?.title) hintSlugs.push(itemData.title);
    if (opts.title) hintSlugs.push(opts.title);
    if (json?.name) hintSlugs.push(json.name);
    if (htmlMeta?.title) hintSlugs.push(htmlMeta.title);
    let pathDir = '';
    let pathStem = '';
    if (itemData?.path) {
        const parts = String(itemData.path).split('/');
        pathStem = (parts.pop() || '').replace(/\.(json|html?|txt|md)$/i, '');
        pathDir = parts.join('/');
        if (pathStem) hintSlugs.push(pathStem);
    }

    // 1. Se HTML tiver <img src="..."> explícito e existir no manifesto (ou não estiver em ./data/), prioriza
    const manifestCache = window.compendiumLocalAssets;
    if (htmlMeta) {
        for (const src of (htmlMeta.htmlTokenSrcs || [])) {
            const norm = _normalizeRelImagePath(src);
            if (!manifestCache?.loaded || manifestCache.byPath.has(norm.toLowerCase())) {
                pushTok(norm);
            } else {
                // Caminho no HTML quebrado (ex: ./npc/data/astel/astel.png) -> busca equivalente real no manifesto antes
                findLocalManifestImagesForHints(hintSlugs, opts.category, norm).forEach(pushTok);
                pushTok(norm);
            }
        }
        (htmlMeta.htmlArtSrcs || []).forEach(pushFluff);
    }

    // 2. Caminhos confirmados no manifesto local (/api/local-assets) têm prioridade sobre chutes 404
    findLocalManifestImagesForHints(hintSlugs, opts.category, itemData?.path || '').forEach(rel => {
        if (/(?:^|[-_])(art|fluff|big)(?:[-_.]|$)/i.test(rel) && !/(?:^|[-_])token/i.test(rel)) pushFluff(rel);
        else pushTok(rel);
    });

    // 3. Candidatos determinísticos no diretório real da entrada (quando path NÃO é só o legado "./data/...")
    const extensions = ['png', 'webp', 'jpg', 'jpeg'];
    const isDummyDataDir = /^\.?\/?data$/i.test(pathDir);
    if (pathDir && pathStem && !isDummyDataDir) {
        ['', '-token', '_token'].forEach(sfx => {
            extensions.forEach(ext => pushTok(`${pathDir}/${pathStem}${sfx}.${ext}`));
        });
        ['-art', '_art', '-fluff', '_fluff', '-big', '_big'].forEach(sfx => {
            extensions.forEach(ext => pushFluff(`${pathDir}/${pathStem}${sfx}.${ext}`));
        });
    }

    // 4. Candidatos determinísticos locais nas pastas padrão (para modo estático/offline sem /api/local-assets)
    const cleanStemSet = new Set();
    const rawSlugCandidates = [pathStem, opts.itemKey, opts.groupKey, _normalizeAssetSlug(opts.title || itemData?.title || json?.name)].filter(Boolean);
    rawSlugCandidates.forEach(s => {
        const norm = _normalizeAssetSlug(s);
        if (norm && norm !== 'data') {
            cleanStemSet.add(norm);
            cleanStemSet.add(norm.replace(/-/g, '_'));
        }
    });

    const catDirs = (() => {
        const c = _mapCatToDirPrefix(opts.category);
        if (c === 'monster') return ['./monster/data', './monster'];
        if (c === 'npc') return ['./npc', './npc/data', './monster/data'];
        if (c === 'item') return ['./item', './curio'];
        if (c === 'curio') return ['./curio', './item'];
        return ['./monster/data', './monster', './npc', './item'];
    })();

    for (const dirBase of catDirs) {
        for (const folderSlug of cleanStemSet) {
            ['', '-token', '_token'].forEach(sfx => {
                extensions.forEach(ext => pushTok(`${dirBase}/${folderSlug}/${folderSlug}${sfx}.${ext}`));
            });
            ['-art', '_art'].forEach(sfx => {
                extensions.forEach(ext => pushFluff(`${dirBase}/${folderSlug}/${folderSlug}${sfx}.${ext}`));
            });
        }
    }

    // Mesmo caminhos ./data/... ficam atrás dos caminhos reais locais (compatibilidade caso exista algo em ./data/)
    if (isDummyDataDir && pathStem) {
        ['', '-token', '_token'].forEach(sfx => {
            extensions.forEach(ext => pushTok(`${pathDir}/${pathStem}${sfx}.${ext}`));
        });
    }

    // 5. Fallback remoto (5etools) por último para não bloquear ou atrasar carregamentos locais
    if (json && json.name) {
        const cleanName = String(json.name).replace(/\s*\([^)]*\)\s*$/g, '').trim();
        const encName = encodeURIComponent(cleanName);
        const sources = json.source ? [String(json.source), 'MM', 'MPMM', 'VRGR', 'CoS', 'XMM'] : ['MM', 'MPMM', 'VRGR', 'CoS', 'XMM'];
        [...new Set(sources)].forEach(s => {
            const src = encodeURIComponent(s);
            pushTok(`https://5e.tools/img/bestiary/tokens/${src}/${encName}.webp`);
            pushTok(`https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/bestiary/tokens/${src}/${encName}.webp`);
            pushFluff(`https://5e.tools/img/bestiary/${src}/${encName}.webp`);
            pushFluff(`https://raw.githubusercontent.com/5etools-mirror-3/5etools-img/main/bestiary/${src}/${encName}.webp`);
        });
    }

    return { token: tokenList, fluff: fluffList };
}

/** Retorna rapidamente o melhor caminho síncrono (já confirmado via manifesto ou virtualFiles). */
function resolveBestTokenImageSrcSync(candidates = []) {
    const vFiles = (typeof virtualFiles !== 'undefined' && virtualFiles) ? virtualFiles : {};
    const manifest = window.compendiumLocalAssets;
    const probeCache = window._tokenImgProbeCache;

    for (const c of candidates) {
        if (!c) continue;
        if (vFiles[c]) return vFiles[c];
        if (/^(data:image\/|blob:)/i.test(c)) return c;
        if (probeCache && probeCache.get(c) === true) return c;
        if (manifest && manifest.loaded && !/^https?:/i.test(c)) {
            const norm = _normalizeRelImagePath(c).toLowerCase();
            if (manifest.byPath.has(norm)) return manifest.byPath.get(norm);
        }
    }
    return '';
}

async function _probeSingleImageUrl(url, timeoutMs = 1500) {
    if (!url) return false;
    const cache = window._tokenImgProbeCache;
    if (cache.has(url)) return cache.get(url);

    const vFiles = (typeof virtualFiles !== 'undefined' && virtualFiles) ? virtualFiles : {};
    if (vFiles[url] || /^(data:image\/|blob:)/i.test(url)) {
        cache.set(url, true);
        return true;
    }

    const isRemote = /^https?:\/\//i.test(url);
    const isFileProto = typeof window !== 'undefined' && window.location?.protocol === 'file:';

    if (!isRemote && !isFileProto && typeof fetch === 'function') {
        try {
            const res = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
            const ok = Boolean(res && res.ok);
            cache.set(url, ok);
            return ok;
        } catch (e) {
            cache.set(url, false);
            return false;
        }
    }

    if (typeof Image !== 'undefined') {
        const ok = await new Promise(resolve => {
            let done = false;
            const finish = (val) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                resolve(val);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            const img = new Image();
            img.onload = () => finish(true);
            img.onerror = () => finish(false);
            img.src = url;
        });
        cache.set(url, ok);
        return ok;
    }
    return false;
}

/** Verifica assincronamente os candidatos locais (e depois remotos) e retorna o primeiro carregável. */
async function resolveBestTokenImageSrc(candidates = [], allowRemote = true) {
    if (!Array.isArray(candidates) || !candidates.length) return '';
    await fetchCompendiumLocalAssets();
    const syncHit = resolveBestTokenImageSrcSync(candidates);
    if (syncHit) return syncHit;

    const manifest = window.compendiumLocalAssets;
    for (const c of candidates) {
        if (!c) continue;
        const isRemote = /^https?:\/\//i.test(c);
        if (isRemote && !allowRemote) continue;
        // Se manifesto carregou do servidor Node e este caminho local não está no manifesto, pula direto sem 404
        if (!isRemote && manifest.loaded && !/^(data:|blob:)/i.test(c)) {
            const norm = _normalizeRelImagePath(c).toLowerCase();
            if (!manifest.byPath.has(norm)) continue;
        }
        const ok = await _probeSingleImageUrl(c, isRemote ? 1200 : 1500);
        if (ok) return c;
    }
    return '';
}

/** Retorna candidatos de fallback em tempo de renderização para tokens existentes/novos. */
function getTokenRenderImageCandidates(tok) {
    if (!tok || typeof tok !== 'object') return [];
    const list = [];
    const seen = new Set();
    const push = (val) => {
        const s = String(val || '').trim();
        if (!s || seen.has(s)) return;
        seen.add(s);
        list.push(s);
    };

    const isStaleDataPath = (p) => /^\.?\/?data\/[^/]+$/i.test(String(p || '').trim())
        && !(typeof virtualFiles !== 'undefined' && virtualFiles && virtualFiles[p]);

    if (tok.imgSrc && !isStaleDataPath(tok.imgSrc)) push(tok.imgSrc);

    const cat = tok.category || (tok.type === 'npc' ? 'npcs' : (tok.type === 'item' ? 'items' : 'monsters'));
    if (cat && cat !== 'character' && (tok.itemKey || tok.name)) {
        const root = (typeof compendioData !== 'undefined' && compendioData) ? (compendioData[cat] || {}) : {};
        let entry = tok.groupKey ? root[tok.groupKey]?.children?.[tok.itemKey] : root[tok.itemKey];
        if (!entry && tok.itemKey && typeof findEntryInCatalog === 'function') {
            const found = findEntryInCatalog(cat, tok.itemKey);
            if (found) entry = found.entry || found;
        }
        const inlineHtml = (entry?.inlineContent && /<[a-z]/i.test(entry.inlineContent)) ? entry.inlineContent : '';
        const paths = buildCompendiumTokenImageCandidates(entry || {}, null, {
            category: cat,
            groupKey: tok.groupKey || '',
            itemKey: tok.itemKey || '',
            title: tok.name || '',
            htmlContent: inlineHtml
        });
        paths.token.forEach(push);
    }

    if (tok.imgSrc) push(tok.imgSrc);
    return list;
}

/** Carrega texto bruto de entrada usando inlineContent, entry.path e fallbacks locais de pasta. */
async function loadCompendiumEntryRawText(entry, category = '', itemKey = '') {
    if (!entry) return '';
    if (entry.inlineContent) return entry.inlineContent;

    const tryUrls = [];
    if (entry.path) tryUrls.push(entry.path);
    const baseFile = entry.path ? String(entry.path).split('/').pop() : '';
    const slug = _normalizeAssetSlug(itemKey || baseFile);
    if (baseFile && slug && /^\.?\/?data\//i.test(String(entry.path || ''))) {
        const cDir = _mapCatToDirPrefix(category) || 'monster';
        if (cDir === 'monster') {
            tryUrls.push(`./monster/data/${slug}/${baseFile}`, `./monster/${slug}/${baseFile}`, `./monster/${baseFile}`);
        } else if (cDir === 'npc') {
            tryUrls.push(`./npc/${slug}/${baseFile}`, `./npc/data/${slug}/${baseFile}`);
        } else {
            tryUrls.push(`./${cDir}/${slug}/${baseFile}`, `./${cDir}/${baseFile}`);
        }
    }

    const fetcher = typeof fetchWithRetry === 'function' ? fetchWithRetry : fetch;
    for (const u of [...new Set(tryUrls)]) {
        try {
            const res = await fetcher(u);
            if (res && res.ok) return await res.text();
        } catch (e) {}
    }
    return '';
}

/** Resolve metadados unificados (PV, CA, Iniciativa, Footprint e Imagens) para entrada JSON ou HTML. */
function resolveCreatureEntryMeta(entry = {}, opts = {}) {
    const titleFallback = String(opts.fallbackTitle || entry?.title || opts.itemKey || 'Criatura').trim();
    let jsonObj = opts.loadedJson || null;
    let htmlText = opts.loadedHtml || '';

    const rawText = opts.rawText || entry?.inlineContent || '';
    if (!jsonObj && entry && typeof isJsonPath === 'function' && isJsonPath(entry.path, entry.tipo) && rawText) {
        try {
            jsonObj = typeof parseJsonWithFallback === 'function'
                ? parseJsonWithFallback(rawText, entry.path || opts.itemKey)
                : JSON.parse(rawText);
        } catch (e) {}
    }
    if (!htmlText && !jsonObj && rawText && /<[a-z]/i.test(rawText)) {
        htmlText = rawText;
    }

    const jMeta = jsonObj ? extractCreatureStatsFromJson(jsonObj) : null;
    const hMeta = htmlText ? extractCreatureStatsFromHtml(htmlText, entry) : null;
    const stats = jMeta || hMeta || {};

    const hp = (stats.hp && stats.hp > 0) ? stats.hp : 30;
    const ac = (stats.ac !== null && stats.ac !== undefined && Number.isFinite(stats.ac)) ? stats.ac : 14;
    const sizeCode = stats.sizeCode || 'M';
    const sizeSquares = stats.sizeSquares || _footprintFromSizeCode(sizeCode);
    const initMod = Number.isFinite(stats.initMod) ? stats.initMod : 0;
    const title = stats.title || titleFallback;

    const cand = buildCompendiumTokenImageCandidates(entry, jsonObj, {
        category: opts.category || '',
        groupKey: opts.groupKey || '',
        itemKey: opts.itemKey || '',
        title,
        htmlContent: htmlText
    });

    return {
        title,
        hp,
        ac,
        sizeCode,
        sizeSquares,
        initMod,
        loadedJson: jsonObj,
        loadedHtml: htmlText,
        tokenCandidates: cand.token,
        fluffCandidates: cand.fluff
    };
}

// Sobrescreve spawnMonsterCardFromSheet para também criar/vincular Token no Tabletop e suportar Iniciativa
function spawnMonsterCardFromSheet(mobName, baseHp, acVal) {
    const qtyInput = document.getElementById('spawn-qty-input');
    const minionCheck = document.getElementById('spawn-minion-check');
    const eliteCheck = document.getElementById('spawn-elite-check');
    const qty = Math.min(20, Math.max(1, parseInt(qtyInput?.value, 10) || 1));
    const isMinion = Boolean(minionCheck?.checked);
    const isElite = Boolean(eliteCheck?.checked);

    const ctx = (typeof activeItemContext !== 'undefined' && activeItemContext) ? activeItemContext : null;
    const sourceRef = ctx ? {
        category: ctx.category || currentCategory,
        groupKey: ctx.groupKey || '',
        itemKey: ctx.key || ''
    } : null;

    const meta = ctx
        ? resolveCreatureEntryMeta(ctx.itemData || {}, {
            category: sourceRef?.category || '',
            groupKey: sourceRef?.groupKey || '',
            itemKey: sourceRef?.itemKey || '',
            fallbackTitle: mobName,
            loadedJson: ctx.loadedJson || null,
            loadedHtml: ctx.loadedHtml || '',
            rawText: ctx.loadedText || ''
        })
        : { hp: 30, ac: 14, sizeCode: 'M', sizeSquares: 1, initMod: 0, tokenCandidates: [] };

    const initMod = Number.isFinite(meta.initMod) ? meta.initMod : 0;
    const footprint = Math.max(1, Number(meta.sizeSquares) || 1);
    const parsedBaseHp = parseInt(baseHp, 10);
    const resolvedBaseHp = (Number.isFinite(parsedBaseHp) && parsedBaseHp > 0) ? parsedBaseHp : meta.hp;
    const parsedAc = parseInt(acVal, 10);
    const resolvedBaseAc = (Number.isFinite(parsedAc) && parsedAc > 0) ? parsedAc : meta.ac;

    let imgSrc = resolveBestTokenImageSrcSync(meta.tokenCandidates);
    if (!imgSrc && meta.tokenCandidates.length > 0) {
        const firstLocal = meta.tokenCandidates.find(c => !/^https?:\/\//i.test(c) && !/^\.?\/?data\//i.test(c));
        imgSrc = firstLocal || '';
    }

    const existingCount = combatCards.filter(c => c.baseName === mobName).length;
    const spawnedTokenIds = [];

    for (let i = 1; i <= qty; i++) {
        const num = existingCount + i;
        let finalHp = isMinion ? 1 : resolvedBaseHp;
        let finalAc = resolvedBaseAc;
        if (isElite && !isMinion) {
            finalHp = Math.round(finalHp * 1.5);
            finalAc += 2;
        }
        const cardId = 'card-' + Date.now() + '-' + Math.floor(Math.random() * 10000) + '-' + i;
        const tokId = 'tok-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000) + '-' + i;
        const displayName = qty > 1 || existingCount > 0 ? `${mobName}${isElite ? ' [Elite]' : ''} #${num}` : `${mobName}${isElite ? ' [Elite]' : ''}`;

        // Também posiciona no Tabletop se o usuário desejar mesa sincronizada
        const gridPx = Number(tabletopState.gridSize) || 56;
        const offset = (tabletopState.tokens.length % 10) * gridPx;

        if (sourceRef) {
            const knowRec = getEntityKnowledgeRecord(sourceRef.category, sourceRef.itemKey);
            if (knowRec.globalLevel === 'hidden') knowRec.globalLevel = 'sighted';
        }

        tabletopState.tokens.push({
            id: tokId,
            cardId,
            refId: sourceRef ? `${sourceRef.category}:${sourceRef.itemKey}` : cardId,
            category: sourceRef ? sourceRef.category : 'monsters',
            groupKey: sourceRef ? sourceRef.groupKey : '',
            itemKey: sourceRef ? sourceRef.itemKey : '',
            name: displayName,
            type: (sourceRef && sourceRef.category === 'npcs') ? 'npc' : 'monster',
            ownerId: 'gm-master',
            x: 224 + offset,
            y: 224 + (Math.floor(tabletopState.tokens.length / 10) * gridPx),
            hpCurrent: finalHp,
            hpMax: finalHp,
            ac: finalAc,
            initMod,
            sizeSquares: footprint,
            imgSrc
        });
        spawnedTokenIds.push(tokId);

        combatCards.push({
            id: cardId,
            tokenId: tokId,
            baseName: mobName,
            name: displayName,
            hp: finalHp,
            maxHp: finalHp,
            ac: finalAc,
            initiative: 0,
            initMod,
            isElite,
            isPc: false,
            collapsed: false,
            calc: '',
            effects: [],
            sourceRef
        });
    }

    if (meta.tokenCandidates.length > 0 && spawnedTokenIds.length > 0) {
        resolveBestTokenImageSrc(meta.tokenCandidates).then(verifiedImg => {
            if (!verifiedImg || verifiedImg === imgSrc) return;
            let updated = false;
            spawnedTokenIds.forEach(tId => {
                const tk = tabletopState.tokens.find(t => String(t.id) === String(tId));
                if (tk) {
                    tk.imgSrc = verifiedImg;
                    updated = true;
                    if (typeof updateTabletopTokenDom === 'function') updateTabletopTokenDom(tId);
                }
            });
            if (updated) {
                if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
                if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastTabletop) {
                    CompendioNetAdapter.broadcastTabletop();
                }
            }
        }).catch(() => {});
    }

    dockCollapsed = false;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined') {
        CompendioNetAdapter.broadcastTabletop();
        if (CompendioNetAdapter.broadcastCombat) CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    if (typeof activeModule !== 'undefined' && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') {
        renderTabletopModule();
    }
    showToast(`🔮 ${qty}x "${mobName}" invocado(s) na Runa e posicionado(s) no Tabletop!`);
}

// Inclui todos os Personagens dos Jogadores na Runa de Combate para controlar Iniciativa e Turnos juntos
function addPartyCharactersToCombatHand() {
    if (typeof charactersData === 'undefined' || !charactersData.length) {
        showToast('Nenhum personagem cadastrado.');
        return;
    }
    const gmIds = new Set((typeof playersData !== 'undefined' && Array.isArray(playersData))
        ? playersData.filter(p => p.role === 'gm').map(p => p.id)
        : ['gm-master']);
    const pcs = charactersData.filter(c => !gmIds.has(c.ownerId));
    const listToUse = pcs.length > 0 ? pcs : charactersData.slice(0, 5);
    let added = 0;

    listToUse.forEach(c => {
        if (combatCards.some(card => card.charId === c.id)) return;
        const dexMod = calcAbilityMod(c.stats?.dex || 10);
        const initMod = dexMod + (Number(c.initiativeBonus) || 0);
        const linkedTok = (tabletopState.tokens || []).find(t => t.refId === c.id || t.itemKey === c.id);
        const cardId = 'card-pc-' + c.id;
        combatCards.push({
            id: cardId,
            charId: c.id,
            ownerId: c.ownerId,
            tokenId: linkedTok ? linkedTok.id : null,
            baseName: c.name,
            name: `🛡️ ${c.name}`,
            hp: Number(c.hpCurrent ?? c.hp?.current) || 10,
            maxHp: Number(c.hpMax ?? c.hp?.max) || 10,
            ac: Number(c.ac) || 14,
            initiative: 0,
            initMod,
            isPc: true,
            collapsed: false,
            calc: '',
            effects: [],
            sourceRef: null
        });
        added++;
    });

    dockCollapsed = false;
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    if (typeof activeModule !== 'undefined' && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') {
        renderTabletopModule();
    }
    showToast(added > 0 ? `🛡️ ${added} Personagem(ns) adicionado(s) à fila de Combate!` : 'Todos os PJs já estão na Runa de Combate.');
}

function rollInitiativeForCard(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    const mod = Number(card.initMod) || 0;
    const signStr = mod >= 0 ? `+${mod}` : `${mod}`;
    const res = CompendioDice.rollExpression(`1d20${signStr}`, `Iniciativa (${card.name})`, {
        actorName: card.name,
        charId: card.charId
    });
    if (res) {
        card.initiative = res.total;
        sortCombatCardsByInitiative(false);
        saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
            CompendioNetAdapter.broadcastCombat();
        }
        renderCombatHand();
    }
}

function rollAllCombatInitiatives() {
    if (!combatCards.length) {
        showToast('Adicione combatentes na Runa primeiro!');
        return;
    }
    combatCards.forEach(card => {
        const mod = Number(card.initMod) || 0;
        const r = Math.floor(Math.random() * 20) + 1;
        card.initiative = r + mod;
    });
    sortCombatCardsByInitiative(true);
    if (combatCards.length > 0) {
        window.combatTurnState.activeCardId = combatCards[0].id;
        window.combatTurnState.round = 1;
    }
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    if (typeof activeModule !== 'undefined' && activeModule === 'tabletop') renderTabletopModule();
    showToast('🎲 Iniciativas roladas e fila de combate ordenada!');
}

function sortCombatCardsByInitiative(announce = false) {
    const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { initiativeTieBreaker: 'dex' };
    combatCards.sort((a, b) => {
        const ia = Number(a.initiative) || 0;
        const ib = Number(b.initiative) || 0;
        if (ib !== ia) return ib - ia;
        if (rules.initiativeTieBreaker === 'players-first' && a.isPc !== b.isPc) {
            return a.isPc ? -1 : 1;
        }
        if (rules.initiativeTieBreaker === 'monsters-first' && a.isPc !== b.isPc) {
            return a.isPc ? 1 : -1;
        }
        return (Number(b.initMod) || 0) - (Number(a.initMod) || 0);
    });
    if (announce && typeof showToast === 'function') {
        showToast('⚡ Fila ordenada por Iniciativa!');
    }
}

function setCardInitiativeManual(cardId, val) {
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    card.initiative = parseInt(val, 10) || 0;
    sortCombatCardsByInitiative(false);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function toggleCardEliteMode(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    card.isElite = !card.isElite;
    if (card.isElite) {
        card.maxHp = Math.round(card.maxHp * 1.5);
        card.hp = Math.min(card.maxHp, Math.round(card.hp * 1.5));
        card.ac = (parseInt(card.ac) || 14) + 2;
        if (!card.name.includes('[Elite]')) card.name += ' [Elite]';
    } else {
        card.maxHp = Math.max(1, Math.round(card.maxHp / 1.5));
        card.hp = Math.min(card.maxHp, card.hp);
        card.ac = Math.max(1, (parseInt(card.ac) || 14) - 2);
        card.name = card.name.replace(/\s*\[Elite\]/g, '');
    }
    syncCombatEntityHp(card.id, card.hp, card.maxHp);
    showToast(card.isElite ? `👑 "${card.name}" promovido ao Template Elite (+50% PV, +2 CA)!` : `Template Elite removido de "${card.name}".`);
}

function _commitTurnAdvance(activeCard, stepEffects = true) {
    if (!activeCard) return;
    window.combatTurnState.activeCardId = activeCard.id;

    if (stepEffects && Array.isArray(activeCard.effects) && activeCard.effects.length > 0) {
        activeCard.effects.forEach(eff => eff.turns -= 1);
        activeCard.effects = activeCard.effects.filter(eff => eff.turns > 0);
    }

    if (stepEffects && typeof CompendioModAPI !== 'undefined') {
        CompendioModAPI.runHooks('onTurnAdvance', {
            activeCard,
            round: window.combatTurnState.round
        });
    }

    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
    if (typeof activeModule !== 'undefined' && activeModule === 'tabletop' && typeof renderTabletopModule === 'function') {
        renderTabletopModule();
    }
    showToast(`⏭️ Rodada ${window.combatTurnState.round} — Turno de: ${activeCard.name}`);
}

function nextCombatTurn() {
    if (!combatCards.length) return;
    const aliveCards = combatCards.filter(c => c.hp > 0 || c.isPc);
    if (!aliveCards.length) return;

    let currentIdx = aliveCards.findIndex(c => String(c.id) === String(window.combatTurnState.activeCardId));
    if (currentIdx === -1) {
        currentIdx = 0;
        window.combatTurnState.round = 1;
    } else {
        currentIdx = (currentIdx + 1) % aliveCards.length;
        if (currentIdx === 0) {
            window.combatTurnState.round = (Number(window.combatTurnState.round) || 1) + 1;
        }
    }

    _commitTurnAdvance(aliveCards[currentIdx], true);
}

function prevCombatTurn() {
    if (!combatCards.length) return;
    const aliveCards = combatCards.filter(c => c.hp > 0 || c.isPc);
    if (!aliveCards.length) return;

    let currentIdx = aliveCards.findIndex(c => String(c.id) === String(window.combatTurnState.activeCardId));
    if (currentIdx === -1) {
        currentIdx = aliveCards.length - 1;
        window.combatTurnState.round = Math.max(1, Number(window.combatTurnState.round) || 1);
    } else {
        currentIdx -= 1;
        if (currentIdx < 0) {
            currentIdx = aliveCards.length - 1;
            window.combatTurnState.round = Math.max(1, (Number(window.combatTurnState.round) || 1) - 1);
        }
    }

    _commitTurnAdvance(aliveCards[currentIdx], false);
}

window.combatIndividualMode = typeof window.combatIndividualMode === 'boolean' ? window.combatIndividualMode : false;
window.combatFocusedCardId = window.combatFocusedCardId || null;

function toggleCombatIndividualMode(force = null) {
    window.combatIndividualMode = (force === null) ? !window.combatIndividualMode : Boolean(force);
    if (window.combatIndividualMode && (!window.combatFocusedCardId || !combatCards.some(c => String(c.id) === String(window.combatFocusedCardId)))) {
        window.combatFocusedCardId = window.combatTurnState?.activeCardId || (combatCards[0]?.id || null);
    }
    renderCombatHand();
}

function selectCombatFocusedCard(cardId) {
    window.combatFocusedCardId = cardId;
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (card && card.tokenId && typeof tabletopState !== 'undefined' && Array.isArray(tabletopState.tokens)) {
        const tok = tabletopState.tokens.find(t => String(t.id) === String(card.tokenId));
        if (tok) {
            selectedTabletopTokenId = tok.id;
            if (typeof activeModule !== 'undefined' && activeModule === 'tabletop' && typeof updateTabletopSelectionUI === 'function') {
                updateTabletopSelectionUI();
            }
        }
    }
    renderCombatHand();
}

function stepFocusedCombatCard(dir = 1) {
    if (!combatCards.length) return;
    let idx = combatCards.findIndex(c => String(c.id) === String(window.combatFocusedCardId));
    if (idx < 0) idx = 0;
    const nextIdx = (idx + dir + combatCards.length) % combatCards.length;
    selectCombatFocusedCard(combatCards[nextIdx].id);
}

function openCombatRuneForToken(tokenId) {
    if (typeof tabletopState === 'undefined' || !Array.isArray(tabletopState.tokens)) return;
    const tok = tabletopState.tokens.find(t => String(t.id) === String(tokenId));
    if (!tok) return;

    if (tok.type === 'gold' || tok.type === 'chest') {
        if (typeof openInteractiveTokenModal === 'function') openInteractiveTokenModal(tok.id);
        return;
    }

    const isPcTok = (tok.type === 'pc' || tok.type === 'character' || tok.category === 'character');
    let card = combatCards.find(c =>
        (c.tokenId && String(c.tokenId) === String(tok.id)) ||
        (tok.cardId && String(c.id) === String(tok.cardId)) ||
        (isPcTok && c.charId && String(c.charId) === String(tok.itemKey || tok.refId))
    );

    if (!card) {
        let linkedChar = null;
        if (isPcTok && typeof charactersData !== 'undefined') {
            linkedChar = charactersData.find(ch => String(ch.id) === String(tok.refId || tok.itemKey));
        }
        const initMod = linkedChar ? Math.floor(((Number(linkedChar.dex) || 10) - 10) / 2) : (Number(tok.initMod) || 0);
        const hpMax = Math.max(1, Number(tok.hpMax) || Number(linkedChar?.hpMax) || Number(tok.hpCurrent) || 20);
        const hpCur = Math.max(0, Number(tok.hpCurrent ?? linkedChar?.hpCurrent ?? hpMax));
        const cardId = 'card-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000);
        card = {
            id: cardId,
            tokenId: tok.id,
            charId: linkedChar ? linkedChar.id : (isPcTok ? (tok.refId || tok.itemKey) : null),
            ownerId: tok.ownerId || linkedChar?.ownerId || 'gm-master',
            baseName: tok.name || 'Combatente',
            name: tok.name || 'Combatente',
            hp: hpCur,
            maxHp: hpMax,
            ac: Number(tok.ac) || Number(linkedChar?.ac) || 12,
            initiative: 0,
            initMod,
            isPc: isPcTok,
            isElite: false,
            collapsed: false,
            calc: '',
            effects: [],
            sourceRef: (tok.category && tok.itemKey && tok.type !== 'character') ? {
                category: tok.category,
                groupKey: tok.groupKey || '',
                itemKey: tok.itemKey
            } : null
        };
        tok.cardId = cardId;
        combatCards.push(card);
        if (typeof saveLocalPersistence === 'function') saveLocalPersistence();
        if (typeof CompendioNetAdapter !== 'undefined') {
            if (CompendioNetAdapter.broadcastCombatPatch) CompendioNetAdapter.broadcastCombatPatch({ card });
            if (CompendioNetAdapter.broadcastTokenDelta) CompendioNetAdapter.broadcastTokenDelta('upsert', tok);
        }
    }

    dockCollapsed = false;
    window.combatIndividualMode = true;
    window.combatFocusedCardId = card.id;
    renderCombatHand();
}

function jumpFromTokenToSheet(tokenId) {
    if (typeof tabletopState === 'undefined' || !Array.isArray(tabletopState.tokens)) return;
    const tok = tabletopState.tokens.find(t => String(t.id) === String(tokenId));
    if (!tok) {
        if (typeof showToast === 'function') showToast('Token não encontrado.');
        return;
    }
    if (tok.type === 'gold' || tok.type === 'chest') {
        if (typeof openInteractiveTokenModal === 'function') openInteractiveTokenModal(tok.id);
        return;
    }
    const charId = (tok.type === 'pc' || tok.type === 'character' || tok.category === 'character') ? (tok.refId || tok.itemKey) : null;
    if (charId && typeof charactersData !== 'undefined' && charactersData.some(c => String(c.id) === String(charId))) {
        activeCharacterId = charId;
        if (typeof switchMainModule === 'function') switchMainModule('character');
        return;
    }
    if (tok.category && tok.itemKey && typeof jumpToCatalogEntity === 'function') {
        jumpToCatalogEntity(tok.category, tok.groupKey || '', tok.itemKey);
        return;
    }
    const linkedCard = combatCards.find(c => String(c.tokenId) === String(tok.id) || String(c.id) === String(tok.cardId));
    if (linkedCard) {
        jumpFromCardToMonsterSheet(linkedCard.id);
        return;
    }
    if (typeof showToast === 'function') showToast('ℹ️ Este token não tem ficha vinculada.');
}

function focusCombatantTokenOnTabletop(cardId) {
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card || typeof tabletopState === 'undefined' || !Array.isArray(tabletopState.tokens)) return;
    window.combatFocusedCardId = card.id;

    const tok = tabletopState.tokens.find(t =>
        (card.tokenId && String(t.id) === String(card.tokenId)) ||
        (card.charId && (t.itemKey === card.charId || t.refId === card.charId))
    );
    if (!tok) {
        showToast(`📍 "${card.name}" ainda não tem token posicionado no Tabletop.`);
        return;
    }

    selectedTabletopTokenId = tok.id;
    const needSwitch = (typeof activeModule !== 'undefined' && activeModule !== 'tabletop');
    if (needSwitch && typeof switchMainModule === 'function') {
        switchMainModule('tabletop');
    } else if (typeof renderTabletopModule === 'function') {
        renderTabletopModule();
    }

    setTimeout(() => {
        if (typeof centerTabletopCameraOnWorld === 'function') {
            const gs = Number(tabletopState.gridSize) || 50;
            const span = (Number(tok.sizeSquares) || 1) * gs;
            centerTabletopCameraOnWorld((Number(tok.x) || 0) + span / 2, (Number(tok.y) || 0) + span / 2);
        }
    }, needSwitch ? 80 : 20);
}

function toggleTabletopInitiativeCollapsed() {
    window.ttInitiativeCollapsed = !window.ttInitiativeCollapsed;
    refreshTabletopInitiativeWidget();
}

function renderDynamicInitiativeTrackerHtml() {
    const roundNum = window.combatTurnState?.round || 1;
    const activeId = window.combatTurnState?.activeCardId;
    const isCollapsed = Boolean(window.ttInitiativeCollapsed);
    const activePl = typeof getActivePlayer === 'function' ? getActivePlayer() : null;
    const isGm = typeof isEffectiveGmUser === 'function'
        ? isEffectiveGmUser(activePl)
        : Boolean(activePl && !activePl.isUnauthenticated && activePl.role === 'gm' && window.isHostClient !== false);
    const visibleCards = isGm
        ? combatCards
        : combatCards.filter(card => {
            if (!card || !card.tokenId || typeof tabletopState === 'undefined' || !Array.isArray(tabletopState?.tokens)) return true;
            const tok = tabletopState.tokens.find(t => String(t.id) === String(card.tokenId));
            return !tok || !tok.hiddenFromPlayers;
        });

    if (isCollapsed) {
        const activeCard = visibleCards.find(c => String(c.id) === String(activeId));
        return `
            <div class="tt-initiative-hud is-collapsed">
                <button type="button" class="btn-mini" style="border-color:#d8b467; color:#f2cf83;" onclick="toggleTabletopInitiativeCollapsed()" title="Expandir Mostrador de Iniciativa">
                    ⚡ Iniciativa • Rd ${roundNum} (${visibleCards.length})${activeCard ? ` — ▶ ${escapeHtmlText(activeCard.name)}` : ''}
                </button>
            </div>
        `;
    }

    const rowsHtml = visibleCards.length === 0
        ? `<div class="tt-init-empty">Sem combatentes na fila. Use <strong>+PJ</strong> ou invoque tokens pela <strong>🔮 Runa</strong>.</div>`
        : visibleCards.map((card, index) => {
            const isCurrent = String(card.id) === String(activeId);
            const isDead = Number(card.hp) <= 0;
            const safeId = `'${String(card.id).replace(/'/g, "\\'")}'`;

            let ownerId = card.ownerId || null;
            if (!ownerId && card.charId && typeof charactersData !== 'undefined') {
                ownerId = charactersData.find(ch => ch.id === card.charId)?.ownerId || null;
            }
            const dotColor = card.isPc
                ? (typeof getPlayerColor === 'function' && ownerId ? getPlayerColor(ownerId) : '#4fc3f7')
                : '#e57373';

            const canSeeExactHp = isGm || card.isPc || (ownerId && ownerId === activePl?.id);
            const hpPct = Math.max(0, Math.min(100, Math.round(((Number(card.hp) || 0) / Math.max(1, Number(card.maxHp) || 1)) * 100)));
            const hpBarColor = hpPct > 50 ? '#66bb6a' : (hpPct > 20 ? '#ffa726' : '#ef5350');
            const qualLabel = typeof describeQualitativeHealth === 'function'
                ? describeQualitativeHealth(card.hp, card.maxHp, card.isPc ? 'pc' : 'monster')
                : (isDead ? 'Derrotado' : 'Em Combate');

            const effTags = (card.effects || []).slice(0, 3).map(e =>
                `<span class="tt-init-cond">${escapeHtmlText(e.name)} (${e.turns}t)</span>`
            ).join('');

            return `
                <div class="tt-init-row ${isCurrent ? 'is-active-turn' : ''} ${isDead ? 'is-down' : ''}" onclick="focusCombatantTokenOnTabletop(${safeId})" title="Clique para centralizar a câmera no Token deste combatente">
                    <div class="tt-init-order">
                        ${isCurrent ? '<span class="tt-init-arrow">▶</span>' : `<span style="opacity:0.6;">#${index + 1}</span>`}
                    </div>
                    <div class="tt-init-main">
                        <div style="display:flex; align-items:center; gap:5px; min-width:0;">
                            <span class="player-color-dot" style="background:${escapeHtmlText(dotColor)};"></span>
                            <span class="tt-init-name">${escapeHtmlText(card.name)}</span>
                        </div>
                        <div class="tt-init-hp-wrap">
                            <div class="tt-init-hp-bar"><div class="tt-init-hp-fill" style="width:${hpPct}%; background:${hpBarColor};"></div></div>
                            <span class="tt-init-hp-text">${canSeeExactHp ? `${card.hp}/${card.maxHp} PV • CA ${card.ac || 10}` : qualLabel}</span>
                        </div>
                        ${effTags ? `<div class="tt-init-conds">${effTags}</div>` : ''}
                    </div>
                    <div class="tt-init-score" onclick="event.stopPropagation(); dockCollapsed=false; window.combatIndividualMode=true; selectCombatFocusedCard(${safeId});" title="Abrir este combatente na Runa de Combate">
                        <span class="tt-init-val-pill">${Number(card.initiative) || 0}</span>
                    </div>
                </div>
            `;
        }).join('');

    return `
        <div class="tt-initiative-hud">
            <div class="tt-init-header">
                <div style="display:flex; align-items:center; gap:6px;">
                    <strong style="color:var(--accent-gold); font-size:12.5px;">⚡ Iniciativa</strong>
                    <span class="tt-init-round-pill">Rd ${roundNum}</span>
                </div>
                <div style="display:flex; gap:3px; align-items:center;">
                    <button type="button" class="card-mini-btn" onclick="prevCombatTurn()" title="Turno Anterior">⏮️</button>
                    <button type="button" class="card-mini-btn" style="background:#54421d; color:#f6d98e;" onclick="nextCombatTurn()" title="Avançar Turno">⏭️</button>
                    <button type="button" class="card-mini-btn" onclick="dockCollapsed=false; renderCombatHand();" title="Abrir Runa de Combate (iniciativas e fichas)">🔮</button>
                    <button type="button" class="card-mini-btn" onclick="addPartyCharactersToCombatHand()" title="Adicionar Personagens do Grupo">+PJ</button>
                    <button type="button" class="card-mini-btn" onclick="toggleTabletopInitiativeCollapsed()" title="Recolher Mostrador">🗕</button>
                </div>
            </div>
            <div class="tt-init-list">
                ${rowsHtml}
            </div>
        </div>
    `;
}

function refreshTabletopInitiativeWidget() {
    const root = document.getElementById('tt-initiative-hud-root');
    if (root) {
        root.innerHTML = renderDynamicInitiativeTrackerHtml();
    }
}

function renderCombatHand() {
    const dock = document.getElementById('combat-dock');
    const countSpan = document.getElementById('combat-hand-count');
    const hand = document.getElementById('combat-cards-hand');
    if (!hand || !dock) {
        refreshTabletopInitiativeWidget();
        return;
    }

    countSpan.textContent = combatCards.length;
    dock.classList.toggle('dock-collapsed', dockCollapsed);

    // Atualiza barra de ferramentas da Runa
    const toolbar = dock.querySelector('.rune-popup-toolbar');
    if (toolbar) {
        const roundNum = window.combatTurnState?.round || 1;
        toolbar.innerHTML = `
            <span class="list-item-folder-badge" style="background:#3d2d14; color:#f2cf83; border:1px solid #d8b467;">🔥 Rodada ${roundNum}</span>
            <button type="button" class="btn-mini ${window.combatIndividualMode ? 'is-active' : ''}" id="btn-combat-mode-toggle" style="flex:0 0 auto;" onclick="toggleCombatIndividualMode()" title="Alternar entre Foco Individual (1 combatente ampliado) e todos os Cards">
                ${window.combatIndividualMode ? '🎯 Individual (ON)' : '🗂️ Todos'}
            </button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="addPartyCharactersToCombatHand()" title="Adicionar Personagens dos Jogadores à fila de Iniciativa">🛡️ + PJs</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="rollAllCombatInitiatives()" title="Rolar 1d20 + Mod de Iniciativa para todos e ordenar a fila">🎲 Rolar Iniciativas</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="prevCombatTurn()" title="Voltar para o Turno Anterior">⏮️ Anterior</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto; background:#454857; border-color:#d8b467; color:#fff;" id="btn-advance-turn" onclick="nextCombatTurn()">⏭️ Avançar Turno</button>
            ${!window.combatIndividualMode ? `
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="setAllCardsCollapsed(true)" title="Compactar todos os cards">🗕</button>
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="setAllCardsCollapsed(false)" title="Expandir todos os cards">🗖</button>
            ` : `
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="stepFocusedCombatCard(-1)" title="Combatente anterior">◀ Ant.</button>
                <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="stepFocusedCombatCard(1)" title="Próximo combatente">Próx. ▶</button>
            `}
            <button type="button" class="btn-mini danger" style="flex:0 0 auto;" onclick="clearAllCombatCards()">🗑️</button>
            <button type="button" class="btn-mini" style="flex:0 0 auto;" onclick="toggleCombatDock()" title="Recolher para a Pedra Rúnica">▼</button>
        `;
    }

    if (combatCards.length === 0) {
        hand.innerHTML = `<div style="color:#a0a4b8; font-size:12px; font-style:italic; padding:6px 12px;">Nenhum card ativo. Clique em "⚔️ Invocar Card" no topo da ficha de um monstro, "🛡️ + PJs" acima ou selecione um Token no Tabletop → "🔮 Runa".</div>`;
        refreshTabletopInitiativeWidget();
        return;
    }

    if (!window.combatFocusedCardId || !combatCards.some(c => String(c.id) === String(window.combatFocusedCardId))) {
        window.combatFocusedCardId = window.combatTurnState?.activeCardId || combatCards[0].id;
    }

    const selectorStripHtml = `
        <div class="rune-individual-selector">
            ${combatCards.map(c => {
                const isFocus = String(c.id) === String(window.combatFocusedCardId);
                const isTurn = String(window.combatTurnState?.activeCardId) === String(c.id);
                const isDown = Number(c.hp) <= 0;
                const sId = `'${String(c.id).replace(/'/g, "\\'")}'`;
                return `
                    <button type="button" class="rune-selector-pill ${isFocus ? 'active-focus' : ''} ${isTurn ? 'is-turn' : ''} ${isDown ? 'is-dead' : ''}" onclick="selectCombatFocusedCard(${sId})" title="Selecionar ${escapeHtmlText(c.name)} (${c.hp}/${c.maxHp} PV • Init ${c.initiative || 0})">
                        ${isTurn ? '⚔️' : ''} ${escapeHtmlText(c.name)} · <span style="opacity:0.85;">${c.hp}/${c.maxHp}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;

    const allConds = (typeof CompendioRules !== 'undefined')
        ? CompendioRules.getAllConditions()
        : ['Cego', 'Envenenado', 'Paralisado', 'Caído', 'Impedido', 'Concentração'];
    const effectOptions = allConds.map(c => `<option value="${escapeHtmlText(c)}">${escapeHtmlText(c)}</option>`).join('') + `<option value="Custom">+ Custom...</option>`;

    const cardsToRender = window.combatIndividualMode
        ? [combatCards.find(c => String(c.id) === String(window.combatFocusedCardId)) || combatCards[0]]
        : combatCards;

    const cardsHtml = cardsToRender.map(mob => {
        if (!mob.effects) mob.effects = [];
        const isDead = mob.hp <= 0;
        const isBloodied = !isDead && mob.maxHp > 1 && mob.hp <= Math.floor(mob.maxHp / 2);
        const isCurrentTurn = String(window.combatTurnState?.activeCardId) === String(mob.id);
        const isFocused = String(mob.id) === String(window.combatFocusedCardId);
        const stateClass = isDead ? 'dead' : (isBloodied ? 'bloodied' : '');
        const collapseClass = (!window.combatIndividualMode && mob.collapsed) ? 'card-collapsed' : '';
        const turnClass = isCurrentTurn ? 'active-turn-card' : '';
        const focusClass = window.combatIndividualMode && isFocused ? 'focused-card' : '';
        const safeId = `'${String(mob.id).replace(/'/g, "\\'")}'`;

        const effectsHtml = mob.effects.map((eff, index) =>
            `<span class="effect-tag">${escapeHtmlText(eff.name)} (${eff.turns}t) <button onclick="removeCardEffect(${safeId}, ${index})">x</button></span>`
        ).join('');

        return `
            <div class="playing-card ${stateClass} ${collapseClass} ${turnClass} ${focusClass}">
                <div class="card-header-bar" onclick="${window.combatIndividualMode ? `focusCombatantTokenOnTabletop(${safeId})` : `toggleCardCollapse(${safeId}, event)`}" title="${window.combatIndividualMode ? 'Clique para focar token no Tabletop' : 'Clique para retrair ou expandir este card'}">
                    <span class="card-mob-name" title="${escapeHtmlText(mob.name)}">${isCurrentTurn ? '⚔️ ' : (mob.collapsed && !window.combatIndividualMode ? '▶ ' : '▼ ')}${escapeHtmlText(mob.name)}</span>
                    <div class="card-header-btns">
                        ${!mob.isPc ? `<button type="button" class="card-mini-btn" style="${mob.isElite ? 'background:#6b201b; color:#ffd584;' : ''}" onclick="toggleCardEliteMode(${safeId}, event)" title="Alternar Template Elite (+50% PV, +2 CA)">👑</button>` : ''}
                        <button type="button" class="card-mini-btn" onclick="event.stopPropagation(); focusCombatantTokenOnTabletop(${safeId})" title="Centralizar no Token do Tabletop">📍</button>
                        <button type="button" class="card-mini-btn" onclick="jumpFromCardToMonsterSheet(${safeId}, event)" title="Abrir a Ficha deste combatente">📖</button>
                        <button type="button" class="card-mini-btn" style="color:#ff8a80;" onclick="removeCombatCard(${safeId}, event)" title="Descartar Card">✕</button>
                    </div>
                </div>

                <div class="card-vitals-bar">
                    <span class="card-hp-num">
                        <input type="number" class="card-hp-input" value="${mob.hp}" title="PV atuais" onclick="event.stopPropagation()" onchange="setCardHp(${safeId}, 'hp', this.value)">
                        <span style="font-size:11px; color:#aaa;">/</span>
                        <input type="number" class="card-hp-input" value="${mob.maxHp}" min="1" title="PV máximos" onclick="event.stopPropagation()" onchange="setCardHp(${safeId}, 'max', this.value)">
                    </span>
                    <span style="font-size:11px; color:#d8b467;">🛡️ ${mob.ac || 14}</span>
                    <span style="display:inline-flex; align-items:center; gap:2px; font-size:11px; color:#8df596;" title="Iniciativa (Clique no dado para rolar)">
                        ⚡<input type="number" class="card-hp-input" style="width:30px; color:#8df596;" value="${mob.initiative || 0}" onclick="event.stopPropagation()" onchange="setCardInitiativeManual(${safeId}, this.value)">
                        <button type="button" class="card-mini-btn" style="padding:1px 3px;" onclick="rollInitiativeForCard(${safeId}, event)">🎲</button>
                    </span>
                </div>

                <div class="card-retractable-body">
                    <div class="card-effects-list">${effectsHtml || '<span style="font-size:10px; color:#666;">Sem condições</span>'}</div>
                    <div class="card-add-eff-row">
                        <select id="eff-name-${mob.id}">${effectOptions}</select>
                        <input type="number" id="eff-turns-${mob.id}" value="1" min="1" title="Turnos">
                        <button type="button" class="card-mini-btn" onclick="addCardEffect(${safeId})">＋</button>
                    </div>

                    <div class="calc-display" id="calc-disp-${mob.id}">${mob.calc || "0"}</div>

                    <div class="calc-grid">
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '7')">7</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '8')">8</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '9')">9</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '/')">/</button>
                        
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '4')">4</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '5')">5</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '6')">6</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '*')">x</button>
                        
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '1')">1</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '2')">2</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '3')">3</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '-')">-</button>
                        
                        <button type="button" class="calc-btn calc-op" onclick="clearCardCalc(${safeId})">C</button>
                        <button type="button" class="calc-btn" onclick="appendCardCalc(${safeId}, '0')">0</button>
                        <button type="button" class="calc-btn calc-op" style="background:#d8b467; color:#000;" onclick="evaluateCardCalc(${safeId})">=</button>
                        <button type="button" class="calc-btn calc-op" onclick="appendCardCalc(${safeId}, '+')">+</button>
                    </div>

                    <div class="card-dmg-heal-row">
                        <button type="button" class="btn-card-dmg" onclick="applyCardMath(${safeId}, true)">- DANO</button>
                        <button type="button" class="btn-card-heal" onclick="applyCardMath(${safeId}, false)">+ CURA</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    hand.innerHTML = `<div style="display:flex; flex-direction:column; width:100%;">${selectorStripHtml}<div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:nowrap; overflow-x:auto; padding-bottom:2px;">${cardsHtml}</div></div>`;

    refreshTabletopInitiativeWidget();
}

// Sobrescreve funções de manipulação de Card para suportar IDs string/number e sincronizar com Tabletop/Personagem
function jumpFromCardToMonsterSheet(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    if (card.charId) {
        activeCharacterId = card.charId;
        switchMainModule('character');
        return;
    }
    if (card.sourceRef && card.sourceRef.itemKey) {
        const { category, groupKey, itemKey } = card.sourceRef;
        jumpToCatalogEntity(category, groupKey, itemKey);
        return;
    }
    if (card.tokenId && typeof tabletopState !== 'undefined' && Array.isArray(tabletopState.tokens)) {
        const tok = tabletopState.tokens.find(t => String(t.id) === String(card.tokenId));
        if (tok && tok.category && tok.itemKey) {
            jumpToCatalogEntity(tok.category, tok.groupKey || '', tok.itemKey);
            return;
        }
    }
    showToast('Ficha vinculada não encontrada.');
}

function toggleCardCollapse(cardId, event) {
    if (event) event.stopPropagation();
    const card = combatCards.find(c => String(c.id) === String(cardId));
    if (!card) return;
    card.collapsed = !card.collapsed;
    saveLocalPersistence();
    renderCombatHand();
}

function removeCombatCard(cardId, event) {
    if (event) event.stopPropagation();
    combatCards = combatCards.filter(c => String(c.id) !== String(cardId));
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function appendCardCalc(id, val) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    mob.calc = String(mob.calc || '') + val;
    saveLocalPersistence();
    const disp = document.getElementById(`calc-disp-${mob.id}`);
    if (disp) disp.innerText = mob.calc || "0";
}

function clearCardCalc(id) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    mob.calc = "";
    saveLocalPersistence();
    const disp = document.getElementById(`calc-disp-${mob.id}`);
    if (disp) disp.innerText = "0";
}

function evaluateCardCalc(id) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob || !mob.calc) return;
    try {
        const clean = String(mob.calc).replace(/[^0-9+\-*/.()]/g, '');
        const total = Math.floor(Function('return (' + clean + ')')());
        mob.calc = String(total);
        saveLocalPersistence();
        const disp = document.getElementById(`calc-disp-${mob.id}`);
        if (disp) disp.innerText = mob.calc;
    } catch (e) {
        const disp = document.getElementById(`calc-disp-${mob.id}`);
        if (disp) disp.innerText = "Erro";
        mob.calc = "";
    }
}

function applyCardMath(id, isDamage) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (mob && mob.calc !== "") {
        try {
            const clean = String(mob.calc).replace(/[^0-9+\-*/.()]/g, '');
            let total = Math.floor(Function('return (' + clean + ')')());
            if (isNaN(total)) return;

            if (typeof CompendioModAPI !== 'undefined') {
                const modRes = CompendioModAPI.runHooks('onApplyDamage', { target: mob, amount: total, isDamage });
                if (modRes && typeof modRes.amount === 'number') total = modRes.amount;
            }

            const newHp = isDamage ? (mob.hp - total) : Math.min(mob.maxHp, mob.hp + total);
            mob.calc = "";
            syncCombatEntityHp(mob.id, newHp, mob.maxHp);
        } catch (e) {
            const disp = document.getElementById(`calc-disp-${mob.id}`);
            if (disp) disp.innerText = "Erro";
            mob.calc = "";
            saveLocalPersistence();
        }
    }
}

function addCardEffect(id) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    const effSelect = document.getElementById(`eff-name-${mob.id}`);
    const turnsInput = document.getElementById(`eff-turns-${mob.id}`);
    let name = effSelect ? effSelect.value : '';
    const turns = parseInt(turnsInput ? turnsInput.value : '1', 10);
    if (!name || isNaN(turns) || turns <= 0) return;
    if (name === "Custom") {
        name = prompt("Nome do efeito / condição:") || "Buff/Debuff";
    }
    if (!mob.effects) mob.effects = [];
    mob.effects.push({ name, turns });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function removeCardEffect(mobId, effIndex) {
    const mob = combatCards.find(m => String(m.id) === String(mobId));
    if (!mob) return;
    mob.effects.splice(effIndex, 1);
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCombat) {
        CompendioNetAdapter.broadcastCombat();
    }
    renderCombatHand();
}

function setCardHp(id, field, value) {
    const mob = combatCards.find(m => String(m.id) === String(id));
    if (!mob) return;
    const n = parseInt(value, 10);
    if (isNaN(n)) { renderCombatHand(); return; }
    if (field === 'max') {
        const newMax = Math.max(1, n);
        syncCombatEntityHp(mob.id, Math.min(mob.hp, newMax), newMax);
    } else {
        syncCombatEntityHp(mob.id, n, mob.maxHp);
    }
}

/* =========================================================================
   UNIFICAÇÃO DA TELA DE DADOS DE VIDA COM CHARACTERSDATA
   ========================================================================= */
function renderHitDiceScreen() {
    const listEl = document.getElementById('dynamic-item-list');
    const chars = (typeof charactersData !== 'undefined') ? charactersData : [];

    listEl.innerHTML = chars.map(c => {
        const hdCur = Number(c.hitDieCurrent ?? c.hitDieMax ?? 1);
        const hdMax = Number(c.hitDieMax || 1);
        const hdType = Number(c.hitDieType || 8);
        return `
            <li class="list-item" data-title="${escapeHtmlText(c.name.toLowerCase())}" onclick="focusHitDieCard('${c.id}')" title="Clique para saltar até este personagem">
                <span>🎲 ${escapeHtmlText(c.name)}</span>
                <span class="list-item-folder-badge">${hdCur}/${hdMax} d${hdType}</span>
            </li>
        `;
    }).join('') || '<li class="list-item" style="color:#828699;">Sem personagens</li>';

    const rules = (typeof CompendioRules !== 'undefined') ? CompendioRules.getEffectiveRules() : { longRestHpPercent: 100, longRestHitDicePercent: 100 };

    const displayArea = document.getElementById('dynamic-display-area');
    displayArea.innerHTML = `
        <div class="info-container">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom:2px groove var(--border-color); padding-bottom:10px; margin-bottom:14px;">
                <div>
                    <h2 class="info-title" style="margin:0; border:none; padding:0;">🎲 Controle Unificado de Dados de Vida & Descansos</h2>
                    <div style="font-size:11.5px; color:#a0a4b8; margin-top:3px;">
                        Sincronizado em tempo real com as Fichas de Personagem, Tokens do Tabletop e Regras Ativas (${rules.longRestHpPercent}% PV / +${rules.longRestHitDicePercent}% DV no Descanso Longo).
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="btn-summon-card" onclick="longRestAllCharacters()">🌙 Descanso Longo para o Grupo</button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;">
                ${chars.map(c => {
                    const hdCur = Number(c.hitDieCurrent ?? c.hitDieMax ?? 1);
                    const hdMax = Number(c.hitDieMax || 1);
                    const hdType = Number(c.hitDieType || 8);
                    const conMod = calcAbilityMod(c.stats?.con || 10);
                    const lastRoll = c.lastHitDieRoll || 'Nenhuma rolagem recente';
                    return `
                        <div class="monster-card" id="hd-card-${c.id}" style="padding:14px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #7a2c26; padding-bottom:4px;">
                                <strong style="color:#6e1813; font-size:15px; cursor:pointer;" onclick="activeCharacterId='${c.id}'; switchMainModule('character');" title="Abrir Ficha Completa">${escapeHtmlText(c.name)} 🔗</strong>
                                <span style="font-weight:bold; font-size:12px;">d${hdType} (CON ${formatSigned(conMod)})</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin:8px 0;">
                                <span style="font-size:15px; font-weight:bold; color:#1f4d23;">
                                    DV: ${hdCur} / ${hdMax}
                                </span>
                                <span style="font-size:14px; font-weight:bold; color:#7a1f18;">
                                    ❤️ PV: ${c.hpCurrent} / ${c.hpMax}
                                </span>
                            </div>
                            <div style="font-size:12px; background:rgba(0,0,0,0.08); border-radius:4px; padding:5px; margin-bottom:8px;">
                                Último Descanso: <strong>${escapeHtmlText(lastRoll)}</strong>
                            </div>
                            <div style="display:flex; gap:4px;">
                                <button type="button" class="btn-summon-card" style="flex:2;" onclick="shortRestCharacter('${c.id}'); renderHitDiceScreen();">⛺ Gastar 1d${hdType}</button>
                                <button type="button" class="btn-action-bar" onclick="adjustCharacterHitDieCount('${c.id}', 1)" title="+1 Dado de Vida">+1</button>
                                <button type="button" class="btn-action-bar" onclick="adjustCharacterHitDieCount('${c.id}', -1)" title="-1 Dado de Vida">-1</button>
                                <button type="button" class="btn-action-bar" onclick="longRestCharacter('${c.id}'); renderHitDiceScreen();" title="Descanso Longo Individual">🌙</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function adjustCharacterHitDieCount(charId, delta) {
    const c = charactersData.find(x => x.id === charId);
    if (!c) return;
    const max = Math.max(1, Number(c.hitDieMax) || 1);
    const cur = Number(c.hitDieCurrent ?? max);
    c.hitDieCurrent = Math.min(max, Math.max(0, cur + delta));
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCharacters) {
        CompendioNetAdapter.broadcastCharacters();
    }
    renderHitDiceScreen();
}

function longRestAllCharacters() {
    if (typeof charactersData === 'undefined') return;
    charactersData.forEach(c => {
        longRestCharacter(c.id, true);
    });
    saveLocalPersistence();
    if (typeof CompendioNetAdapter !== 'undefined' && CompendioNetAdapter.broadcastCharacters) {
        CompendioNetAdapter.broadcastCharacters();
    }
    renderHitDiceScreen();
    showToast('🌙 Descanso Longo aplicado a todo o grupo!');
}
