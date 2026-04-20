/* ============================================
COURT SIGHT TENNIS - RANKING ELO JS v4.2
🔄 ESTRATEGIA: Network-First + Auto-Cleanup
✅ Lógica original 100% preservada
============================================ */

// --- CONFIGURACIÓN ---
const ELO_CONFIG = {
    surfaces: {
        total: { name: 'General', icon: 'fa-globe', class: 'hard' },
        clay: { name: 'Arcilla', icon: 'fa-mound', class: 'clay' },
        hardOut: { name: 'Dura Outdoor', icon: 'fa-circle', class: 'hard' },
        hardIndoor: { name: 'Dura Indoor', icon: 'fa-house-chimney', class: 'hard' },
        grass: { name: 'Hierba', icon: 'fa-seedling', class: 'grass' }
    },
    minElo: 0,
    CACHE_TTL: 24 * 60 * 60 * 1000, // 24 horas
    MAX_RENDER_ROWS: 150,
    SEARCH_DEBOUNCE_MS: 250
};

// 🔹 CONTROL DE VERSIÓN (Cambia esto si editas el JSON)
const DATA_VERSION = 'v2.1-surface-fix';

// --- ESTADO GLOBAL ---
let playersDatabase = [];
let playersRank = [];
let mergedPlayers = [];
let currentSurface = 'total';
let isLoading = false;
let searchTimeout = null;
let visibleCount = ELO_CONFIG.MAX_RENDER_ROWS;

// ============================================
// INDEXEDDB - CACHE LOCAL
// ============================================
const ELO_DB_NAME = 'CourtSightEloCache';
const ELO_DB_VERSION = 1;
const ELO_STORE_NAME = 'eloData';

function initCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(ELO_DB_NAME, ELO_DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(ELO_STORE_NAME)) {
                db.createObjectStore(ELO_STORE_NAME, { keyPath: 'key' });
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
            const tx = db.transaction([ELO_STORE_NAME], 'readonly');
            const req = tx.objectStore(ELO_STORE_NAME).get(key);
            req.onsuccess = () => {
                const data = req.result;
                if (data && Date.now() - data.timestamp < ELO_CONFIG.CACHE_TTL) {
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
        const tx = db.transaction([ELO_STORE_NAME], 'readwrite');
        tx.objectStore(ELO_STORE_NAME).put({ key, value, timestamp: Date.now() });
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
            // cache: 'no-cache' fuerza al navegador a pedir el archivo nuevo
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
            // Fallback a IndexedDB si no hay red o archivo
            const cachedDB = await getCachedData('playersDatabase');
            const cachedRank = await getCachedData('playersRank');
            
            if (cachedDB && cachedRank) {
                playersDatabase = cachedDB;
                playersRank = cachedRank;
                console.log('⚡ Usando cache local (offline)');
            } else {
                throw new Error('Sin datos disponibles (ni red ni cache)');
            }
        }

        updateDateBadge(playersRank.date);
        mergeAndRenderPlayers();

    } catch (error) {
        console.error('❌ Error ELO:', error);
        showEmptyState('Error al cargar datos. Revisa la consola o la conexión.');
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
        
        // Soporte para objeto o número
        const eloRaw = rp.elo;
        const eloBySurface = typeof eloRaw === 'object' && eloRaw !== null ? eloRaw : { total: eloRaw || 0 };
        
        return {
            id: rp.id,
            name: clean(db.name),
            nationality: clean(db.nationality),
            flagCode: flagCode || '?',
            flagUrl: flagUrl,
            elo: eloBySurface,
            atpPoints: rp.atpPoints || 0
        };
    }).filter(Boolean);
    
    console.log(`✅ ELO: ${mergedPlayers.length} jugadores únicos`);
    renderRanking(currentSurface);
}

// ============================================
// 🧮 CÁLCULO ELO + ORDENAMIENTO
// ============================================
function getEloValue(player, surface) {
    if (surface === 'total') {
        return Object.values(player.elo || {}).reduce((sum, val) => sum + (val || 0), 0);
    }
    return player.elo?.[surface] || 0;
}

function filterAndSortPlayers(surface) {
    return mergedPlayers
        .map(p => ({ ...p, calculatedElo: getEloValue(p, surface) }))
        .filter(p => p.calculatedElo > ELO_CONFIG.minElo)
        .sort((a, b) => b.calculatedElo - a.calculatedElo)
        .map((p, i) => ({ ...p, realPosition: i + 1 }));
}

// ============================================
// 📊 RENDERIZADO
// ============================================
function renderRanking(surface) {
    const searchInput = document.getElementById('player-search');
    if (searchInput?.value.trim()) {
        renderSearchResults(filterPlayersBySearch(searchInput.value.trim()), searchInput.value.trim());
        return;
    }
    
    const players = filterAndSortPlayers(surface);
    const rankingBody = document.getElementById('ranking-body');
    const container = document.getElementById('ranking-container');
    const empty = document.getElementById('empty-state');
    const loader = document.getElementById('loading-state');
    
    loader?.classList.add('hidden');
    if (!players.length) { showEmptyState(); return; }
    
    container?.classList.remove('hidden');
    empty?.classList.add('hidden');
    updatePlayerCountBadge(players.length);
    updateSurfaceBadge(surface);
    
    const fragment = document.createDocumentFragment();
    const limit = Math.min(players.length, visibleCount);
    
    for (let i = 0; i < limit; i++) {
        const p = players[i];
        const pos = p.realPosition;
        const rankClass = pos <= 3 ? `rank-${pos}` : '';
        const trophy = pos <= 3 ? '<i class="fas fa-trophy rank-trophy" aria-hidden="true"></i>' : '';
        
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
            <td class="col-elo" role="cell" data-elo-tooltip="${p.calculatedElo} pts">${p.calculatedElo.toLocaleString('es-ES')}</td>
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
                if (player) showSurfaceModal(player, surface);
            }
        });
        row.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const id = row.dataset.playerId;
                const player = mergedPlayers.find(p => p.id === id);
                if (player) showSurfaceModal(player, surface);
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
        const indicator = '<span class="search-indicator" title="Posición real en ranking" aria-hidden="true"><i class="fas fa-search"></i></span>';
        
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
            <td class="col-elo" role="cell" data-elo-tooltip="${p.calculatedElo} pts">${p.calculatedElo.toLocaleString('es-ES')}</td>
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
                if (player) showSurfaceModal(player, currentSurface);
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

function getEloRank(playerId, surface) {
    const sorted = [...mergedPlayers].sort((a, b) => getEloValue(b, surface) - getEloValue(a, surface));
    const index = sorted.findIndex(p => p.id === playerId);
    return index !== -1 ? index + 1 : null;
}

function showSurfaceModal(player, currentSurface) {
    const modal = document.getElementById('surface-modal');
    const nameEl = document.getElementById('modal-name');
    const flagEl = document.getElementById('modal-flag');
    const totalEl = document.getElementById('modal-total');
    const surfacesEl = document.getElementById('modal-surfaces');
    
    if (!modal) return;
    
    nameEl.textContent = player.name;
    flagEl.src = `../${player.flagUrl}`;
    flagEl.alt = player.nationality;
    flagEl.onerror = () => { flagEl.src = '../pictures/unknown.png'; };
    
    const totalElo = Object.values(player.elo || {}).reduce((s, v) => s + (v || 0), 0);
    totalEl.textContent = `${totalElo.toLocaleString('es-ES')} pts ELO totales`;
    
    const rows = [];
    for (const [key, info] of Object.entries(ELO_CONFIG.surfaces)) {
        const eloVal = getEloValue(player, key);
        if (eloVal > 0) {
            const rank = getEloRank(player.id, key);
            rows.push({
                name: info.name,
                icon: info.icon,
                class: info.class,
                rank: rank ? `${rank}°` : 'N/A',
                elo: eloVal
            });
        }
    }
    
    const order = ['clay', 'hardOut', 'hardIndoor', 'grass'];
    rows.sort((a, b) => {
        const aKey = Object.keys(ELO_CONFIG.surfaces).find(k => ELO_CONFIG.surfaces[k].name === a.name);
        const bKey = Object.keys(ELO_CONFIG.surfaces).find(k => ELO_CONFIG.surfaces[k].name === b.name);
        return order.indexOf(aKey) - order.indexOf(bKey);
    });
    
    surfacesEl.innerHTML = rows.length > 0
        ? rows.map(r => `
            <div class="surface-row ${r.class}" role="listitem">
                <span class="surface-name"><i class="fas ${r.icon}" aria-hidden="true"></i> ${r.name}</span>
                <span class="surface-rank" title="ELO: ${r.elo}">${r.rank}</span>
            </div>
        `).join('')
        : `<p style="text-align:center;color:var(--text-muted);padding:1rem">Sin datos ELO por superficie</p>`;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// ============================================
// 🔍 UTILIDADES Y BÚSQUEDA
// ============================================
function filterPlayersBySearch(term) {
    const t = term.toLowerCase();
    return filterAndSortPlayers(currentSurface).filter(p => 
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
function updateSurfaceBadge(s) { const el = document.getElementById('surface-name'); if (el) el.textContent = ELO_CONFIG.surfaces[s]?.name || 'Desconocida'; }

function showLoadingState() {
    document.getElementById('loading-state')?.classList.remove('hidden');
    document.getElementById('ranking-container')?.classList.add('hidden');
    document.getElementById('empty-state')?.classList.add('hidden');
}
function showEmptyState(msg = 'No hay jugadores con puntos ELO en esta superficie') {
    document.getElementById('loading-state')?.classList.add('hidden');
    document.getElementById('ranking-container')?.classList.add('hidden');
    const el = document.getElementById('empty-state');
    if (el) { el.classList.remove('hidden'); el.querySelector('p').textContent = msg; }
    updatePlayerCountBadge(0);
}

function initSurfaceSelector() {
    const sel = document.getElementById('surface-select');
    if (!sel) return;
    sel.addEventListener('change', () => {
        const s = sel.value;
        if (!s || s === currentSurface) return;
        currentSurface = s;
        visibleCount = ELO_CONFIG.MAX_RENDER_ROWS;
        updateBodySurfaceClass(s);
        updateSurfaceBadge(s);
        
        const searchInput = document.getElementById('player-search');
        if (searchInput?.value.trim()) {
            renderSearchResults(filterPlayersBySearch(searchInput.value.trim()), searchInput.value.trim());
        } else {
            renderRanking(s);
        }
    });
}

function updateBodySurfaceClass(surface) {
    const body = document.body;
    Object.values(ELO_CONFIG.surfaces).forEach(s => body.classList.remove(s.class));
    body.classList.add('surface-transition', ELO_CONFIG.surfaces[surface].class);
    setTimeout(() => body.classList.remove('surface-transition'), 300);
}

function initScrollLoader() {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoading) {
            const searchInput = document.getElementById('player-search');
            if (!searchInput?.value.trim()) {
                visibleCount += 100;
                renderRanking(currentSurface);
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
                visibleCount = ELO_CONFIG.MAX_RENDER_ROWS; 
                renderRanking(currentSurface); 
                return; 
            }
            const res = filterPlayersBySearch(t);
            if (count) { 
                count.textContent = `${res.length} resultado${res.length !== 1 ? 's' : ''}`; 
                count.classList.remove('hidden'); 
            }
            renderSearchResults(res, t);
        }, ELO_CONFIG.SEARCH_DEBOUNCE_MS);
    });
    
    clear?.addEventListener('click', () => {
        input.value = ''; 
        clear.classList.add('hidden'); 
        count?.classList.add('hidden');
        visibleCount = ELO_CONFIG.MAX_RENDER_ROWS; 
        renderRanking(currentSurface);
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
            visibleCount = ELO_CONFIG.MAX_RENDER_ROWS;
            renderRanking(currentSurface);
            input.focus();
        });
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    initSurfaceSelector();
    initSearch();
    initScrollLoader();
    initModal();
    loadRankingData();
});

console.log('🎾 Ranking ELO JS v4.2 ✅ Network-First + Cache Control');