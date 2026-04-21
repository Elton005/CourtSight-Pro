/* ============================================
COURT SIGHT TENNIS - BIBLIOTECA JS v2.2
🔄 ACTUALIZACIÓN AUTOMÁTICA + CACHE INTELIGENTE
✅ Muestra contenido cacheado al instante
✅ Verifica actualizaciones en segundo plano
✅ Notifica al usuario si hay nueva versión
============================================ */

// --- CONFIGURACIÓN ---
const BIBLIOTECA_CONFIG = {
    CACHE_TTL: 24 * 60 * 60 * 1000, // 24 horas para fallback offline
    DEBOUNCE_MS: 250,
    MAX_RENDER_GUIDES: 50,
    MODAL_ANIMATION_MS: 350,
    // 🔹 VERSIÓN DE DATOS: Cambia esto cuando actualices guides.json
    DATA_VERSION: 'v1.2-2026-04'
};

// --- ESTADO GLOBAL ---
let guides = [];
let filteredGuides = [];
let isLoading = false;
let searchTimeout = null;
let isOnline = navigator.onLine;

// ============================================
// INDEXEDDB - CACHE CON VERSIONADO
// ============================================
const BIBLIOTECA_DB_NAME = 'CourtSightBibliotecaCache';
const BIBLIOTECA_DB_VERSION = 3; // ← Incrementa si cambias la estructura
const BIBLIOTECA_STORE_NAME = 'guidesData';
const METADATA_STORE = 'metadata';

function initCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(BIBLIOTECA_DB_NAME, BIBLIOTECA_DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(BIBLIOTECA_STORE_NAME)) {
                db.createObjectStore(BIBLIOTECA_STORE_NAME, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(METADATA_STORE)) {
                db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
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
            const tx = db.transaction([BIBLIOTECA_STORE_NAME], 'readonly');
            const req = tx.objectStore(BIBLIOTECA_STORE_NAME).get(key);
            req.onsuccess = () => {
                const data = req.result;
                if (data && Date.now() - data.timestamp < BIBLIOTECA_CONFIG.CACHE_TTL) {
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
        const tx = db.transaction([BIBLIOTECA_STORE_NAME], 'readwrite');
        tx.objectStore(BIBLIOTECA_STORE_NAME).put({ key, value, timestamp: Date.now() });
        
        // Guardar metadatos de versión
        const metaTx = db.transaction([METADATA_STORE], 'readwrite');
        metaTx.objectStore(METADATA_STORE).put({ 
            key: 'version', 
            value: BIBLIOTECA_CONFIG.DATA_VERSION,
            timestamp: Date.now()
        });
        
        console.log('💾 Cache SET:', key);
    } catch (e) { console.warn('⚠️ Cache:', e); }
}

async function getCachedVersion() {
    try {
        const db = await initCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction([METADATA_STORE], 'readonly');
            const req = tx.objectStore(METADATA_STORE).get('version');
            req.onsuccess = () => resolve(req.result?.value || null);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
}

// ============================================
// 🌐 DETECCIÓN DE CONEXIÓN + ACTUALIZACIÓN EN BG
// ============================================
window.addEventListener('online', () => {
    isOnline = true;
    console.log('🌐 Conexión restaurada. Verificando actualizaciones...');
    checkForUpdates();
});

window.addEventListener('offline', () => {
    isOnline = false;
    console.log('✈️ Modo offline activado');
});

async function checkForUpdates() {
    if (!isOnline) return;
    
    try {
        // Fetch con cache-busting para forzar respuesta fresca
        const response = await fetch(`../data/guides.json?v=${Date.now()}`);
        if (!response.ok) throw new Error('HTTP Error');
        
        const freshGuides = await response.json();
        
        // Comparar con cache actual
        const cachedVersion = await getCachedVersion();
        const hasChanges = JSON.stringify(freshGuides) !== JSON.stringify(guides);
        const versionChanged = cachedVersion !== BIBLIOTECA_CONFIG.DATA_VERSION;
        
        if (hasChanges || versionChanged) {
            console.log('🔄 Nuevas guías disponibles');
            // Actualizar cache en segundo plano
            await setCachedData('guides', freshGuides);
            
            // Notificar al usuario si ya está viendo la biblioteca
            if (document.visibilityState === 'visible') {
                showUpdateNotification(freshGuides);
            }
        }
    } catch (error) {
        console.log('⚠️ No se pudo verificar actualizaciones:', error);
    }
}

function showUpdateNotification(newGuides) {
    // Crear banner de actualización sutil
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = `
        <i class="fas fa-sync-alt"></i>
        <span>Nuevas guías disponibles</span>
        <button class="btn-update-now">Actualizar ahora</button>
        <button class="btn-dismiss"><i class="fas fa-times"></i></button>
    `;
    banner.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: var(--bg-card); border: 1px solid var(--accent);
        border-radius: var(--radius-md); padding: 0.75rem 1rem;
        display: flex; align-items: center; gap: 0.75rem;
        z-index: 1000; box-shadow: var(--shadow-lg);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(banner);
    
    // Eventos del banner
    banner.querySelector('.btn-update-now').addEventListener('click', () => {
        guides = newGuides;
        filteredGuides = [...guides];
        renderGuides();
        populateCategoryFilter();
        updateBadges();
        banner.remove();
        showToast('✅ Guías actualizadas');
    });
    
    banner.querySelector('.btn-dismiss').addEventListener('click', () => {
        banner.remove();
    });
    
    // Auto-ocultar después de 10 segundos
    setTimeout(() => {
        if (banner.parentNode) {
            banner.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => banner.remove(), 300);
        }
    }, 10000);
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; bottom: 80px; right: 20px;
        background: var(--accent); color: var(--bg-primary);
        padding: 0.5rem 1rem; border-radius: var(--radius-md);
        font-weight: 600; z-index: 1001;
        animation: fadeInUp 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initFilters();
    initUpdateButton(); // 🔹 Botón manual de refresh
    loadGuides();
    
    // Verificar actualizaciones cada 5 minutos si está online
    if (isOnline) {
        setInterval(checkForUpdates, 5 * 60 * 1000);
    }
});

// 🔹 Botón manual para forzar actualización
function initUpdateButton() {
    // Buscar o crear botón en la UI (puedes agregarlo en el HTML)
    let refreshBtn = document.getElementById('btn-refresh-guides');
    
    if (!refreshBtn) {
        // Crear botón dinámicamente si no existe en el HTML
        refreshBtn = document.createElement('button');
        refreshBtn.id = 'btn-refresh-guides';
        refreshBtn.className = 'btn-ghost';
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar guías';
        refreshBtn.style.cssText = 'margin-bottom: 1rem; align-self: flex-end;';
        
        const filtersContainer = document.querySelector('.filters-container');
        if (filtersContainer) {
            filtersContainer.appendChild(refreshBtn);
        }
    }
    
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
        
        try {
            const response = await fetch(`../data/guides.json?v=${Date.now()}`);
            if (!response.ok) throw new Error('HTTP Error');
            
            const freshGuides = await response.json();
            await setCachedData('guides', freshGuides);
            
            guides = freshGuides;
            filteredGuides = [...guides];
            renderGuides();
            populateCategoryFilter();
            updateBadges();
            
            showToast('✅ Guías actualizadas');
        } catch (error) {
            showToast('❌ Error al actualizar');
            console.error('Error:', error);
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar guías';
        }
    });
}

// ============================================
// 📥 CARGA DE DATOS CON ESTRATEGIA HÍBRIDA
// ============================================
async function loadGuides() {
    if (isLoading) return;
    isLoading = true;
    showLoadingState();
    
    try {
        // 1. Mostrar cache inmediatamente si existe (UX rápida)
        const cached = await getCachedData('guides');
        if (cached) {
            guides = cached;
            filteredGuides = [...guides];
            populateCategoryFilter();
            updateBadges();
            renderGuides();
            console.log('⚡ Guías cargadas desde cache (inmediato)');
        }
        
        // 2. Si está online, fetchear datos frescos en segundo plano
        if (isOnline) {
            const response = await fetch(`../data/guides.json?v=${Date.now()}`);
            if (!response.ok) throw new Error('HTTP Error');
            
            const freshGuides = await response.json();
            
            // Comparar y actualizar si hay cambios
            const hasChanges = JSON.stringify(freshGuides) !== JSON.stringify(guides);
            const versionChanged = (await getCachedVersion()) !== BIBLIOTECA_CONFIG.DATA_VERSION;
            
            if (hasChanges || versionChanged) {
                await setCachedData('guides', freshGuides);
                guides = freshGuides;
                filteredGuides = [...guides];
                
                // Si ya renderizamos cache, re-renderizar con datos nuevos
                if (cached) {
                    renderGuides();
                    populateCategoryFilter();
                    updateBadges();
                    console.log('🔄 Guías actualizadas con datos frescos');
                }
            }
        }
        
        // 3. Deduplicación + normalización
        const seenIds = new Set();
        guides = guides.filter(g => {
            const id = String(g.id || '').trim().toLowerCase();
            if (seenIds.has(id)) {
                console.warn(`⚠️ Guía duplicada ignorada: ${g.title}`);
                return false;
            }
            seenIds.add(id);
            return true;
        });
        
    } catch (error) {
        console.error('❌ Error biblioteca:', error);
        // Si falló todo y no hay cache, mostrar error
        if (!guides.length) {
            showEmptyState('Error al cargar guías. Revisa conexión o consola.');
        }
    } finally { 
        isLoading = false; 
    }
}

// ============================================
// 🏷️ FILTROS + BÚSQUEDA CON DEBOUNCE
// ============================================
function initFilters() {
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const categoryFilter = document.getElementById('category-filter');
    const difficultyFilter = document.getElementById('difficulty-filter');
    const modalClose = document.getElementById('modal-close');
    const modalBack = document.getElementById('modal-back');
    const modalOverlay = document.querySelector('.modal-backdrop');
    const resetBtn = document.getElementById('empty-reset');
    
    // Búsqueda con debounce
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const term = searchInput.value.trim();
            searchClear?.classList.toggle('hidden', !term);
            
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => applyFilters(), BIBLIOTECA_CONFIG.DEBOUNCE_MS);
        });
        
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchInput.blur();
            }
        });
    }
    
    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.classList.add('hidden');
            applyFilters();
            searchInput.focus();
        });
    }
    
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (difficultyFilter) difficultyFilter.addEventListener('change', applyFilters);
    
    if (modalClose) modalClose.addEventListener('click', closeGuideModal);
    if (modalBack) modalBack.addEventListener('click', closeGuideModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeGuideModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeGuideModal();
    });
    
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (searchClear) searchClear.classList.add('hidden');
            if (categoryFilter) categoryFilter.value = 'all';
            if (difficultyFilter) difficultyFilter.value = 'all';
            applyFilters();
            if (searchInput) searchInput.focus();
        });
    }
}

function applyFilters() {
    const searchInput = document.getElementById('search-input');
    const categoryFilter = document.getElementById('category-filter');
    const difficultyFilter = document.getElementById('difficulty-filter');
    
    const term = (searchInput?.value || '').toLowerCase().trim();
    const category = categoryFilter?.value || 'all';
    const difficulty = difficultyFilter?.value || 'all';
    
    filteredGuides = guides.filter(g => {
        const searchMatch = !term || 
            g.title.toLowerCase().includes(term) ||
            g.excerpt.toLowerCase().includes(term) ||
            g.content.toLowerCase().includes(term);
        const categoryMatch = category === 'all' || g.category === category;
        const difficultyMatch = difficulty === 'all' || g.difficulty === difficulty;
        return searchMatch && categoryMatch && difficultyMatch;
    });
    
    renderGuides(term);
}

function populateCategoryFilter() {
    const select = document.getElementById('category-filter');
    if (!select) return;
    
    const categories = [...new Set(guides.map(g => g.category).filter(Boolean))];
    select.innerHTML = '<option value="all">Todas</option>' + 
        categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    
    document.getElementById('total-categories').textContent = `${categories.length} categorías`;
}

function updateBadges() {
    document.getElementById('total-guides').textContent = `${guides.length} guía${guides.length !== 1 ? 's' : ''}`;
}

// ============================================
// 📊 RENDERIZADO CON HIGHLIGHT + OPTIMIZACIÓN
// ============================================
function renderGuides(searchTerm = '') {
    const grid = document.getElementById('guides-grid');
    const container = document.getElementById('guides-container');
    const empty = document.getElementById('empty-state');
    const loader = document.getElementById('loading-state');
    
    loader?.classList.add('hidden');
    
    if (!filteredGuides.length) { showEmptyState(); return; }
    
    container?.classList.remove('hidden');
    empty?.classList.add('hidden');
    document.getElementById('total-guides').textContent = `${filteredGuides.length} guía${filteredGuides.length !== 1 ? 's' : ''}`;
    
    const fragment = document.createDocumentFragment();
    const limit = Math.min(filteredGuides.length, BIBLIOTECA_CONFIG.MAX_RENDER_GUIDES);
    
    for (let i = 0; i < limit; i++) {
        const g = filteredGuides[i];
        const card = document.createElement('article');
        card.className = 'guide-card';
        card.dataset.guideId = g.id;
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.style.animationDelay = `${Math.min(i * 0.04, 0.25)}s`;
        
        const title = searchTerm ? highlightText(g.title, searchTerm) : escapeHtml(g.title);
        const excerpt = searchTerm ? highlightText(g.excerpt, searchTerm) : escapeHtml(g.excerpt);
        
        card.innerHTML = `
            <div class="guide-card-header">
                <span class="guide-card-category"><i class="fas fa-folder" aria-hidden="true"></i> ${escapeHtml(g.category)}</span>
                <span class="guide-card-difficulty difficulty-${g.difficulty}">
                    <i class="fas fa-signal" aria-hidden="true"></i> ${getDifficultyLabel(g.difficulty)}
                </span>
            </div>
            <h3 class="guide-card-title">${title}</h3>
            <p class="guide-card-excerpt">${excerpt}</p>
            <div class="guide-card-meta">
                <span><i class="fas fa-clock" aria-hidden="true"></i> ${g.readTime} min</span>
                <span class="guide-card-read">Leer más <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
            </div>
        `;
        fragment.appendChild(card);
    }
    
    grid.innerHTML = '';
    grid.appendChild(fragment);
    
    grid.querySelectorAll('.guide-card').forEach(card => {
        card.addEventListener('click', () => openGuideModal(card.dataset.guideId));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openGuideModal(card.dataset.guideId);
            }
        });
    });
    
    if (filteredGuides.length > limit) {
        const more = document.createElement('p');
        more.className = 'text-center text-muted';
        more.style.padding = '1rem';
        more.textContent = `Mostrando ${limit} de ${filteredGuides.length} guías. Refina tu búsqueda.`;
        grid.appendChild(more);
    }
}

// ============================================
// 📖 MODAL DE GUÍA + CONTENIDO SEGURO
// ============================================
function openGuideModal(guideId) {
    const guide = guides.find(g => String(g.id).trim().toLowerCase() === String(guideId).trim().toLowerCase());
    if (!guide) return;
    
    const modal = document.getElementById('guide-modal');
    const modalCategory = document.getElementById('modal-category');
    const modalDifficulty = document.getElementById('modal-difficulty');
    const modalTitle = document.getElementById('modal-title');
    const modalMeta = document.getElementById('modal-meta');
    const modalBody = document.getElementById('modal-body');
    
    modalCategory.textContent = guide.category;
    modalDifficulty.textContent = getDifficultyLabel(guide.difficulty);
    modalDifficulty.className = `modal-badge modal-difficulty difficulty-${guide.difficulty}`;
    modalTitle.textContent = guide.title;
    
    modalMeta.innerHTML = `
        <span><i class="fas fa-clock" aria-hidden="true"></i> ${guide.readTime} min lectura</span>
        <span><i class="fas fa-calendar" aria-hidden="true"></i> ${guide.updatedAt || guide.date || '2026'}</span>
        <span><i class="fas fa-user" aria-hidden="true"></i> ${guide.author || 'CourtSight'}</span>
    `;
    
    modalBody.innerHTML = sanitizeAndFormatContent(guide.content);
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        modalBody.querySelectorAll('p, h3, ul, ol').forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(8px)';
            el.style.transition = `opacity 0.2s ease ${i * 0.03}s, transform 0.2s ease ${i * 0.03}s`;
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            });
        });
    }, BIBLIOTECA_CONFIG.MODAL_ANIMATION_MS);
}

function closeGuideModal() {
    const modal = document.getElementById('guide-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

function sanitizeAndFormatContent(content) {
    if (!content) return '<p>Sin contenido disponible</p>';
    
    const allowed = ['p', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'a', 'code', 'pre', 'blockquote'];
    let safe = String(content)
        .replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/&lt;(\/?(p|h3|ul|ol|li|strong|em|br|a|code|pre|blockquote)[^&]*)&gt;/gi, '<$1>');
    
    safe = safe.replace(/\n\n/g, '</p><p>');
    if (!safe.startsWith('<p>')) safe = `<p>${safe}`;
    if (!safe.endsWith('</p>')) safe = `${safe}</p>`;
    
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/^- (.+)$/gm, '<li>$1</li>');
    safe = safe.replace(/(<li>.+?<\/li>\s*)+/g, '<ul>$&</ul>');
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    return safe;
}

// ============================================
// 🔍 UTILIDADES
// ============================================
function highlightText(text, term) {
    if (!term) return escapeHtml(text);
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(regex, '<span class="highlight-match">$1</span>');
}

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div'); d.textContent = text; return d.innerHTML;
}

function getDifficultyLabel(d) {
    return { 
        beginner: 'Principiante', 
        intermediate: 'Intermedio', 
        advanced: 'Avanzado', 
        expert: 'Experto' 
    }[d] || d;
}

function showLoadingState() {
    document.getElementById('loading-state')?.classList.remove('hidden');
    document.getElementById('guides-container')?.classList.add('hidden');
    document.getElementById('empty-state')?.classList.add('hidden');
}

function showEmptyState(msg = 'No se encontraron guías con los filtros seleccionados') {
    document.getElementById('loading-state')?.classList.add('hidden');
    document.getElementById('guides-container')?.classList.add('hidden');
    const el = document.getElementById('empty-state');
    if (el) { 
        el.classList.remove('hidden'); 
        el.querySelector('p').textContent = msg; 
    }
}

// ============================================
// 🧹 LIMPIEZA
// ============================================
window.addEventListener('beforeunload', () => {
    if (searchTimeout) clearTimeout(searchTimeout);
});

// Animaciones para notificaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
`;
document.head.appendChild(style);

console.log('📚 Biblioteca JS v2.2 ✅ Actualización automática + Cache inteligente');