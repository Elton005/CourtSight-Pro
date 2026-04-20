/* ============================================
COURT SIGHT TENNIS - RANKING ATP JS v2.2
🔄 ESTRATEGIA: Network-First + Auto-Cleanup
✅ Comparativa ATP vs ELO incluida
============================================ */

// --- CONFIGURACIÓN ---
const ATP_CONFIG = {
    surfaces: {
        clay: { name: 'Arcilla', icon: 'fa-mound', class: 'clay' },
        hardOut: { name: 'Dura Outdoor', icon: 'fa-circle', class: 'hard' },
        hardIndoor: { name: 'Dura Indoor', icon: 'fa-house-chimney', class: 'hard' },
        grass: { name: 'Hierba', icon: 'fa-seedling', class: 'grass' },
        carpet: { name: 'Moqueta', icon: 'fa-border-all', class: 'hard' }
    },
    minPoints: 0,
    CACHE_TTL: 24 * 60 * 60 * 1000, // 24 horas
    MAX_RENDER_ROWS: 150,
    SEARCH_DEBOUNCE_MS: 250
};

// 🔹 CONTROL DE VERSIÓN (Sincronizado con ELO)
const DATA_VERSION = 'v2.1-surface-fix';

// --- ESTADO GLOBAL ---
let playersDatabase = [];
let playersRank = [];
let mergedPlayers = [];
let isLoading = false;
let searchTimeout = null;
let visibleCount = ATP_CONFIG.MAX_RENDER_ROWS;

// ============================================
// INDEXEDDB - CACHE LOCAL
// ============================================
const ATP_DB_NAME = 'CourtSightATPCache';
const ATP_DB_VERSION = 1;
const ATP_STORE_NAME = 'atpData';

function initCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(ATP_DB_NAME, ATP_DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(ATP_STORE_NAME)) {
                db.createObjectStore(ATP_STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getCachedData(key) {
    try {
        const db = await initCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction([ATP_STORE_NAME], 'readonly');
            const req = tx.objectStore(ATP_STORE_NAME).get(key);
            req.onsuccess = () => {
                const data = req.result;
                if (data && Date.now() - data.timestamp < ATP_CONFIG.CACHE_TTL) {
                    console.log('📦 Cache HIT:', key);
                    resolve(data.value);
                } else resolve(null);
            };
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
}

async function setCachedData(key, value) {
    try {
        const db = await initCacheDB();
        const tx = db.transaction([ATP_STORE_NAME], 'readwrite');
        tx.objectStore(ATP_STORE_NAME).put({ key, value, timestamp: Date.now() });
    } catch {}
}

// ============================================
// 📥 CARGA DE DATOS (NETWORK-FIRST + CLEANUP)
// ============================================
async function loadRankingData() {
    if (isLoading) return;
    isLoading = true;
    showLoadingState();

    try {
        // 1. Verificar Versión y Limpiar Cache Viejo
        const storedVersion = localStorage.getItem('cs_data_version');
        if (storedVersion !== DATA_VERSION) {
            console.log('🔄 Estructura actualizada. Limpiando cache...');
            const dbNames = ['CourtSightEloCache', 'CourtSightATPCache'];
            for (const name of dbNames) {
                try { await indexedDB.deleteDatabase(name); } catch(e) {}
            }
            localStorage.setItem('cs_data_version', DATA_VERSION);
        }

        // 2. Intentar Red (Network-First)
        let freshData = null;
        try {
            const [dbRes, rankRes] = await Promise.all([
                fetch('../data/players_database.json', { cache: 'no-cache' }),
                fetch('../data/players_rank.json', { cache: 'no-cache' })
            ]);

            if (dbRes.ok && rankRes.ok) {
                freshData = { db: await dbRes.json(), rank: await rankRes.json() };
                console.log('📥 Datos frescos cargados desde red');
            }
        } catch (netErr) {
            console.log('📡 Red no disponible, usando cache...');
        }

        // 3. Aplicar Datos o Fallback
        if (freshData) {
            playersDatabase = freshData.db;
            playersRank = freshData.rank;
            // Actualizar cache en segundo plano
            await setCachedData('playersDatabase', freshData.db);
            await setCachedData('playersRank', freshData.rank);
        } else {
            // Fallback a IndexedDB
            const cachedDB = await getCachedData('playersDatabase');
            const cachedRank = await getCachedData('playersRank');
            
            if (cachedDB && cachedRank) {
                playersDatabase = cachedDB;
                playersRank = cachedRank;
                console.log('⚡ Usando cache local (offline)');
            } else {
                throw new Error('Sin datos disponibles');
            }
        }

        updateDateBadge(playersRank.date);
        mergeAndRenderPlayers();

    } catch (error) {
        console.error('❌ Error ATP:', error);
        showEmptyState('Error al cargar datos. Verifica conexión o JSON.');
    } finally { 
        isLoading = false; 
    }
}

function mergeAndRenderPlayers() {
    const seenIds = new Set();
    
    mergedPlayers = (playersRank.rankings || []).map(rp => {
        const db = playersDatabase.find(p => 
            String(p.id || '').trim().toLowerCase() === String(rp.id || '').trim().toLowerCase()
        );
        if (!db) return null;
        
        const cleanId = String(db.id || '').trim().toLowerCase();
        if (seenIds.has(cleanId)) return null;
        seenIds.add(cleanId);
        
        const clean = (str) => String(str || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').normalize('NFC');
        let flagCode = clean(db.flagCode).toLowerCase();
        let flagUrl = clean(db.flagUrl || '').replace(/^flags\//i, 'pictures/');
        
        flagUrl = flagUrl.replace(/\.(jpg|jpeg|gif|webp)$/i, '.png');
        if (!flagUrl || flagUrl === 'pictures/' || flagUrl.includes('undefined')) {
            flagUrl = flagCode ? `pictures/${flagCode}.png` : 'pictures/unknown.png';
        }
        
        const atpRaw = rp.atpPoints;
        const atpBySurface = typeof atpRaw === 'object' && atpRaw !== null ? atpRaw : { total: atpRaw || 0 };
        
        return {
            id: rp.id,
            name: clean(db.name),
            nationality: clean(db.nationality),
            flagCode: flagCode || '?',
            flagUrl: flagUrl,
            atpPoints: atpBySurface.total || 0,
            atpBySurface: atpBySurface,
            // ✅ Asegurar que elo se guarda como objeto
            elo: typeof rp.elo === 'object' && rp.elo !== null ? rp.elo : { total: rp.elo || 0 }
        };
    }).filter(Boolean);
    
    console.log(`✅ ATP: ${mergedPlayers.length} jugadores únicos`);
    renderRanking();
}

// ============================================
// 🎯 ORDENAMIENTO + COMPARATIVA
// ============================================
function sortPlayersByAtp() {
    return mergedPlayers
        .filter(p => p.atpPoints > ATP_CONFIG.minPoints)
        .sort((a, b) => b.atpPoints - a.atpPoints)
        .map((p, i) => ({ ...p, realPosition: i + 1 }));
}

function getEloRankForSurface(playerId, surface) {
    const validPlayers = mergedPlayers.filter(p => {
        const eloVal = p.elo?.[surface];
        return eloVal && eloVal > 0;
    });
    
    const playerElo = mergedPlayers.find(p => p.id === playerId)?.elo?.[surface];
    if (!playerElo) return null;
    
    const rank = validPlayers.filter(p => p.elo[surface] > playerElo).length + 1;
    return rank;
}

function getCompareIndicator(atpRank, eloRank) {
    if (!eloRank) return { class: 'compare-equal', icon: '=', text: 'Sin datos ELO', title: 'No hay datos ELO' };
    
    const diff = atpRank - eloRank;
    
    if (diff > 0) {
        // ATP rank mayor (peor) -> ELO mejor -> Verde arriba
        return { class: 'compare-up', icon: '↑', text: `+${diff}`, title: `Mejor en ELO: #${eloRank}` };
    } else if (diff < 0) {
        // ATP rank menor (mejor) -> ATP mejor -> Rojo abajo
        return { class: 'compare-down', icon: '↓', text: `${diff}`, title: `Mejor en ATP: #${atpRank}` };
    } else {
        return { class: 'compare-equal', icon: '=', text: '', title: `Igual: #${atpRank}` };
    }
}

// ============================================
// 📊 RENDERIZADO
// ============================================
function renderRanking() {
    const searchInput = document.getElementById('player-search');
    if (searchInput?.value.trim()) {
        renderSearchResults(filterPlayersBySearch(searchInput.value.trim()), searchInput.value.trim());
        return;
    }
    
    const players = sortPlayersByAtp();
    const rankingBody = document.getElementById('ranking-body');
    const container = document.getElementById('ranking-container');
    const empty = document.getElementById('empty-state');
    const loader = document.getElementById('loading-state');
    
    loader?.classList.add('hidden');
    if (!players.length) { showEmptyState(); return; }
    
    container?.classList.remove('hidden');
    empty?.classList.add('hidden');
    updatePlayerCountBadge(players.length);
    
    const fragment = document.createDocumentFragment();
    const limit = Math.min(players.length, visibleCount);
    
    for (let i = 0; i < limit; i++) {
        const p = players[i];
        const pos = p.realPosition;
        const rankClass = pos <= 3 ? `rank-${pos}` : '';
        const trophy = pos <= 3 ? '<i class="fas fa-trophy rank-trophy" aria-hidden="true"></i>' : '';
        
        // 🔹 Comparativa ATP vs ELO
        const eloTotal = typeof p.elo.total === 'number' ? p.elo.total : Object.values(p.elo).reduce((a, b) => a + (b || 0), 0);
        const eloRank = eloTotal > 0 
            ? mergedPlayers.filter(x => {
                const xElo = typeof x.elo.total === 'number' ? x.elo.total : Object.values(x.elo).reduce((a, b) => a + (b || 0), 0);
                return xElo > eloTotal;
            }).length + 1 
            : null;
        
        const compare = getCompareIndicator(pos, eloRank);
        const compareHtml = `<span class="${compare.class}" title="${compare.title}">${compare.icon}${compare.text}</span>`;
        
        const tr = document.createElement('tr');
        tr.className = rankClass;
        tr.dataset.playerId = p.id;
        tr.setAttribute('role', 'row');
        tr.setAttribute('tabindex', '0');
        tr.innerHTML = `
            <td class="col-pos" role="cell">${pos}${trophy}</td>
            <td class="col-player" role="cell">
                <div class="player-info">
                    <img src="../${p.flagUrl}" alt="${p.nationality}" 
                         loading="lazy" decoding="async"
                         class="player-flag" 
                         data-code="${p.flagCode || '?'}"
                         onerror="this.onerror=null; this.src='../pictures/unknown.png'; this.classList.add('flag-fallback');"
                         onload="this.classList.remove('flag-fallback');">
                    <span class="player-name">${escapeHtml(p.name)}</span>
                </div>
            </td>
            <td class="col-country" role="cell"><span class="player-country-code">${p.nationality}</span></td>
            <td class="col-atp" role="cell" data-atp-tooltip="${p.atpPoints} pts">${p.atpPoints.toLocaleString('es-ES')}</td>
            <td class="col-elo-compare" role="cell">${compareHtml}</td>
        `;
        fragment.appendChild(tr);
    }
    
    rankingBody.innerHTML = '';
    rankingBody.appendChild(fragment);
    
    document.querySelectorAll('.ranking-table tbody tr[data-player-id]').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (!e.target.closest('a')) {
                const id = row.dataset.playerId;
                const player = mergedPlayers.find(p => p.id === id);
                if (player) showSurfaceModal(player);
            }
        });
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const id = row.dataset.playerId;
                const player = mergedPlayers.find(p => p.id === id);
                if (player) showSurfaceModal(player);
            }
        });
    });
    
    if (players.length > visibleCount) ensureLoadMoreTrigger();
}

function renderSearchResults(players, term) {
    const rankingBody = document.getElementById('ranking-body');
    const container = document.getElementById('ranking-container');
    const empty = document.getElementById('empty-state');
    document.getElementById('loading-state')?.classList.add('hidden');
    
    if (!players.length) { showEmptyState(`No se encontraron jugadores con "${term}"`); return; }
    
    container?.classList.remove('hidden');
    empty?.classList.add('hidden');
    rankingBody.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    const limit = Math.min(players.length, 100);
    
    for (let i = 0; i < limit; i++) {
        const p = players[i];
        const pos = p.realPosition;
        const rankClass = pos <= 3 ? `rank-${pos}` : '';
        const trophy = pos <= 3 ? '<i class="fas fa-trophy rank-trophy" aria-hidden="true"></i>' : '';
        const indicator = '<span class="search-indicator" title="Posición real" aria-hidden="true"><i class="fas fa-search"></i></span>';
        
        // 🔹 Comparativa también en búsqueda
        const eloTotal = typeof p.elo.total === 'number' ? p.elo.total : Object.values(p.elo).reduce((a, b) => a + (b || 0), 0);
        const eloRank = eloTotal > 0 
            ? mergedPlayers.filter(x => {
                const xElo = typeof x.elo.total === 'number' ? x.elo.total : Object.values(x.elo).reduce((a, b) => a + (b || 0), 0);
                return xElo > eloTotal;
            }).length + 1 
            : null;
        
        const compare = getCompareIndicator(pos, eloRank);
        const compareHtml = `<span class="${compare.class}" title="${compare.title}">${compare.icon}${compare.text}</span>`;
        
        const tr = document.createElement('tr');
        tr.className = rankClass;
        tr.dataset.playerId = p.id;
        tr.setAttribute('role', 'row');
        tr.innerHTML = `
            <td class="col-pos" role="cell">${pos}${trophy}${indicator}</td>
            <td class="col-player" role="cell">
                <div class="player-info">
                    <img src="../${p.flagUrl}" alt="${p.nationality}" 
                         loading="lazy" decoding="async"
                         class="player-flag"
                         data-code="${p.flagCode || '?'}"
                         onerror="this.onerror=null; this.src='../pictures/unknown.png'; this.classList.add('flag-fallback');"
                         onload="this.classList.remove('flag-fallback');">
                    <span class="player-name">${highlightText(p.name, term)}</span>
                </div>
            </td>
            <td class="col-country" role="cell"><span class="player-country-code">${highlightText(p.nationality, term)}</span></td>
            <td class="col-atp" role="cell" data-atp-tooltip="${p.atpPoints} pts">${p.atpPoints.toLocaleString('es-ES')}</td>
            <td class="col-elo-compare" role="cell">${compareHtml}</td>
        `;
        fragment.appendChild(tr);
    }
    rankingBody.appendChild(fragment);
    
    document.querySelectorAll('.ranking-table tbody tr[data-player-id]').forEach(row => {
        row.style.cursor = 'pointer';
        row.addEventListener('click', (e) => {
            if (!e.target.closest('a')) {
                const id = row.dataset.playerId;
                const player = mergedPlayers.find(p => p.id === id);
                if (player) showSurfaceModal(player);
            }
        });
    });
}

// ============================================
// 🎴 MODAL
// ============================================
function initModal() {
    const modal = document.getElementById('surface-modal');
    const closeBtn = document.getElementById('modal-close');
    const backdrop = document.querySelector('.modal-backdrop');
    
    if (!modal) return;
    
    const closeModal = () => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    };
    
    closeBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });
}

function showSurfaceModal(player) {
    const modal = document.getElementById('surface-modal');
    const nameEl = document.getElementById('modal-name');
    const flagEl = document.getElementById('modal-flag');
    const totalsEl = document.getElementById('modal-totals');
    const surfacesEl = document.getElementById('modal-surfaces');
    
    if (!modal) return;
    
    nameEl.textContent = player.name;
    flagEl.src = `../${player.flagUrl}`;
    flagEl.alt = player.nationality;
    flagEl.onerror = () => { flagEl.src = '../pictures/unknown.png'; };
    
    const atpTotal = player.atpPoints.toLocaleString('es-ES');
    const eloTotal = (typeof player.elo.total === 'number' ? player.elo.total : Object.values(player.elo).reduce((a, b) => a + (b || 0), 0)).toLocaleString('es-ES');
    totalsEl.innerHTML = `<span class="atp-points">${atpTotal} pts ATP</span> • <span class="elo-points">${eloTotal} pts ELO</span>`;
    
    const surfaceRows = [];
    const surfaces = ['clay', 'hardOut', 'hardIndoor', 'grass'];
    
    for (const key of surfaces) {
        const atpVal = player.atpBySurface?.[key];
        const eloVal = player.elo?.[key];
        
        if ((atpVal && atpVal > 0) || (eloVal && eloVal > 0)) {
            const surfaceInfo = ATP_CONFIG.surfaces[key] || { name: key, icon: 'fa-circle', class: 'hard' };
            
            const atpRank = atpVal > 0 
                ? mergedPlayers.filter(p => (p.atpBySurface?.[key] || 0) > atpVal).length + 1 
                : null;
            
            const eloRank = eloVal > 0 
                ? mergedPlayers.filter(p => (p.elo?.[key] || 0) > eloVal).length + 1 
                : null;
            
            let diffHtml = '';
            if (atpRank && eloRank) {
                const diff = atpRank - eloRank;
                if (diff > 0) {
                    diffHtml = `<span class="surface-diff up" title="Mejor en ELO">↑</span>`;
                } else if (diff < 0) {
                    diffHtml = `<span class="surface-diff down" title="Mejor en ATP">↓</span>`;
                } else {
                    diffHtml = `<span class="surface-diff equal" title="Misma posición">=</span>`;
                }
            } else {
                diffHtml = `<span class="surface-diff equal" title="Sin comparativa">–</span>`;
            }
            
            surfaceRows.push({
                name: surfaceInfo.name,
                icon: surfaceInfo.icon,
                class: surfaceInfo.class,
                atpRank: atpRank ? `#${atpRank}` : '–',
                eloRank: eloRank ? `#${eloRank}` : '–',
                diff: diffHtml
            });
        }
    }
    
    const order = ['clay', 'hardOut', 'hardIndoor', 'grass'];
    surfaceRows.sort((a, b) => {
        const aKey = Object.keys(ATP_CONFIG.surfaces).find(k => ATP_CONFIG.surfaces[k].name === a.name);
        const bKey = Object.keys(ATP_CONFIG.surfaces).find(k => ATP_CONFIG.surfaces[k].name === b.name);
        return order.indexOf(aKey) - order.indexOf(bKey);
    });
    
    surfacesEl.innerHTML = surfaceRows.length > 0
        ? surfaceRows.map(s => `
            <div class="surface-compare-row ${s.class}" role="listitem">
                <span class="surface-name"><i class="fas ${s.icon}" aria-hidden="true"></i> ${s.name}</span>
                <span class="surface-rank-atp" title="Posición ATP">${s.atpRank}</span>
                <span class="surface-rank-elo" title="Posición ELO">${s.eloRank}</span>
                ${s.diff}
            </div>
        `).join('')
        : `<p style="text-align:center;color:var(--text-muted);padding:1rem">Sin datos por superficie</p>`;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        surfacesEl.querySelectorAll('.surface-compare-row').forEach((row, i) => {
            row.style.opacity = '0';
            row.style.transform = 'translateX(-10px)';
            row.style.transition = `opacity 0.2s ease ${i * 0.05}s, transform 0.2s ease ${i * 0.05}s`;
            requestAnimationFrame(() => {
                row.style.opacity = '1';
                row.style.transform = 'translateX(0)';
            });
        });
    }, 100);
}

// ============================================
// 🔍 UTILIDADES
// ============================================
function filterPlayersBySearch(term) {
    const t = term.toLowerCase();
    return sortPlayersByAtp().filter(p => 
        p.name.toLowerCase().includes(t) || p.nationality.toLowerCase().includes(t)
    );
}

function highlightText(text, term) {
    if (!term) return escapeHtml(text);
    return escapeHtml(text).replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<span class="highlight-match">$1</span>');
}

function escapeHtml(t) { if (!t) return ''; const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function updateDateBadge(d) { const el = document.getElementById('update-date'); if (el && d) el.textContent = new Date(d).toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' }); }
function updatePlayerCountBadge(c) { const el = document.getElementById('player-count'); if (el) el.textContent = `${c} jugador${c !== 1 ? 'es' : ''}`; }

function showLoadingState() {
    document.getElementById('loading-state')?.classList.remove('hidden');
    document.getElementById('ranking-container')?.classList.add('hidden');
    document.getElementById('empty-state')?.classList.add('hidden');
}
function showEmptyState(msg = 'No hay jugadores con puntos ATP disponibles') {
    document.getElementById('loading-state')?.classList.add('hidden');
    document.getElementById('ranking-container')?.classList.add('hidden');
    const el = document.getElementById('empty-state');
    if (el) { el.classList.remove('hidden'); el.querySelector('p').textContent = msg; }
    updatePlayerCountBadge(0);
}

function initScrollLoader() {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading) {
            const searchInput = document.getElementById('player-search');
            if (!searchInput?.value.trim()) {
                visibleCount += 100;
                renderRanking();
            }
        }
    }, { rootMargin: '200px' });
    
    const trigger = document.createElement('div');
    trigger.id = 'load-more-trigger';
    trigger.style.height = '1px';
    document.querySelector('.ranking-container')?.appendChild(trigger);
    observer.observe(trigger);
}

function ensureLoadMoreTrigger() {
    let trigger = document.getElementById('load-more-trigger');
    if (!trigger) {
        trigger = document.createElement('div');
        trigger.id = 'load-more-trigger';
        trigger.style.height = '1px';
        document.querySelector('.ranking-container')?.appendChild(trigger);
    }
}

function initSearch() {
    const input = document.getElementById('player-search');
    const clear = document.getElementById('search-clear');
    const count = document.getElementById('search-results-count');
    const resetBtn = document.getElementById('empty-reset');
    
    if (!input) return;
    
    input.addEventListener('input', () => {
        const t = input.value.trim();
        clear?.classList.toggle('hidden', !t);
        
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            if (!t) { 
                count?.classList.add('hidden'); 
                visibleCount = ATP_CONFIG.MAX_RENDER_ROWS; 
                renderRanking(); 
                return; 
            }
            const res = filterPlayersBySearch(t);
            if (count) { 
                count.textContent = `${res.length} resultado${res.length !== 1 ? 's' : ''}`; 
                count.classList.remove('hidden'); 
            }
            renderSearchResults(res, t);
        }, ATP_CONFIG.SEARCH_DEBOUNCE_MS);
    });
    
    clear?.addEventListener('click', () => {
        input.value = ''; 
        clear.classList.add('hidden'); 
        count?.classList.add('hidden');
        visibleCount = ATP_CONFIG.MAX_RENDER_ROWS; 
        renderRanking();
        input.focus();
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
    });
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            input.value = '';
            clear?.classList.add('hidden');
            count?.classList.add('hidden');
            visibleCount = ATP_CONFIG.MAX_RENDER_ROWS;
            renderRanking();
            input.focus();
        });
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    initSearch();
    initScrollLoader();
    initModal();
    loadRankingData();
});

console.log('🎾 Ranking ATP JS v2.2 ✅ Network-First + Comparativa');