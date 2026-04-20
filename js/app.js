/* ============================================
COURT SIGHT TENNIS - APP.JS
Lógica Principal de la Aplicación
============================================ */

// --- CONFIGURACIÓN ---
const DB_NAME = 'CourtSightDB';
const DB_VERSION = 2;
const STORE_PLAYERS = 'players';
const STORE_META = 'meta';

// --- ESTADO GLOBAL ---
let db = null;
let players = [];

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    initDB();
    initNavigation();
    initSidebarToggle();
    initUseNowButton();
    initBannerToggle();
});

// ============================================
// INDEXEDDB - BASE DE DATOS LOCAL
// ============================================
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            db = e.target.result;
            
            if (!db.objectStoreNames.contains(STORE_PLAYERS)) {
                const playerStore = db.createObjectStore(STORE_PLAYERS, { keyPath: 'id' });
                playerStore.createIndex('ranking', 'ranking', { unique: false });
                playerStore.createIndex('name', 'name', { unique: false });
                playerStore.createIndex('elo', 'elo', { unique: false });
            }
            
            if (!db.objectStoreNames.contains(STORE_META)) {
                db.createObjectStore(STORE_META, { keyPath: 'key' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            console.log('✅ IndexedDB inicializada correctamente');
            loadHomeStats();
            resolve(db);
        };

        request.onerror = (e) => {
            console.error('❌ Error IndexedDB:', e.target.error);
            reject(e.target.error);
        };
    });
}

// ============================================
// METADATOS - GUARDAR CONFIGURACIÓN
// ============================================
function getMeta(key) {
    return new Promise((resolve) => {
        if (!db) { resolve(null); return; }
        const tx = db.transaction([STORE_META], 'readonly');
        const req = tx.objectStore(STORE_META).get(key);
        req.onsuccess = () => resolve(req.result?.value || null);
    });
}

function setMeta(key, value) {
    if (!db) return;
    const tx = db.transaction([STORE_META], 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
}

// ============================================
// JUGADORES - GESTIÓN DE DATOS
// ============================================
function getAllPlayers() {
    return new Promise((resolve) => {
        if (!db) { resolve([]); return; }
        const tx = db.transaction([STORE_PLAYERS], 'readonly');
        const store = tx.objectStore(STORE_PLAYERS);
        const req = store.getAll();
        req.onsuccess = () => {
            players = req.result || [];
            players.sort((a, b) => a.ranking - b.ranking);
            resolve(players);
        };
    });
}

function savePlayersBatch(playersData) {
    return new Promise((resolve) => {
        if (!db) { resolve(false); return; }
        const tx = db.transaction([STORE_PLAYERS], 'readwrite');
        const store = tx.objectStore(STORE_PLAYERS);
        playersData.forEach(p => store.put(p));
        tx.oncomplete = () => resolve(true);
    });
}

function clearAllData() {
    return new Promise((resolve) => {
        if (!db) { resolve(false); return; }
        const tx = db.transaction([STORE_PLAYERS, STORE_META], 'readwrite');
        tx.objectStore(STORE_PLAYERS).clear();
        tx.objectStore(STORE_META).clear();
        tx.oncomplete = () => resolve(true);
    });
}

// ============================================
// 🔹 SIDEBAR TOGGLE - HAMBURGER MENU
// ============================================
// ============================================
// 🔹 SIDEBAR TOGGLE - HAMBURGER MENU (ACTUALIZADO)
// ============================================
function initSidebarToggle() {
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!menuToggle || !sidebar || !overlay) return;

    // Función para verificar si es desktop
    const isDesktop = () => window.innerWidth > 1024;

    function toggleSidebar() {
        // En desktop, no permitir cerrar el sidebar
        if (isDesktop()) return;
        
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
        menuToggle.classList.toggle('active');
        document.body.classList.toggle('sidebar-open');
    }

    // Abrir sidebar por defecto en desktop al cargar
    function handleResize() {
        if (isDesktop()) {
            sidebar.classList.add('open');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        } else {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            menuToggle.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        }
    }

    // Event listeners
    menuToggle.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);
    window.addEventListener('resize', handleResize);
    
    // Ejecutar al inicio
    handleResize();

    // Exponer función globalmente
    window.toggleSidebar = toggleSidebar;
}

// ============================================
// 🔹 BOTÓN "ÚSALO YA" - ABRIR SIDEBAR
// ============================================
function initUseNowButton() {
    const btnUseNow = document.getElementById('btn-use-now');
    
    if (!btnUseNow) return;

    btnUseNow.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.toggleSidebar) {
            window.toggleSidebar();
        }
    });
}

// ============================================
// 🔹 BANNER "QUIÉNES SOMOS" - EXPANDIR
// ============================================
function initBannerToggle() {
    const bannerToggle = document.getElementById('about-banner-toggle');
    const bannerContent = document.getElementById('about-banner-content');
    const bannerArrow = document.getElementById('about-banner-arrow');

    if (!bannerToggle || !bannerContent || !bannerArrow) return;

    bannerToggle.addEventListener('click', () => {
        const isOpen = bannerContent.classList.toggle('open');
        bannerArrow.classList.toggle('active', isOpen);
        bannerArrow.textContent = isOpen ? '▲' : '▼';
        bannerArrow.setAttribute('aria-label', isOpen ? 'Contraer' : 'Expandir');
    });
}

// ============================================
// NAVEGACIÓN DEL SIDEBAR (ACTUALIZADO)
// ============================================
function initNavigation() {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    const sections = document.querySelectorAll('.content-section');
    
    // Highlight active item based on current page
    highlightActiveSidebar();
    
    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const href = item.getAttribute('href');
            const dataSection = item.getAttribute('data-section');
            
            // Si es enlace externo (href con página .html)
            if (href && href.includes('.html')) {
                // No prevenir default, dejar que navegue
                return;
            }
            
            // Si es navegación interna (data-section)
            if (dataSection) {
                e.preventDefault();
                
                // Remover clase active de todos
                sidebarItems.forEach(i => i.classList.remove('active'));
                sections.forEach(s => s.classList.remove('active'));
                
                // Activar el seleccionado
                item.classList.add('active');
                const targetSection = document.getElementById(dataSection);
                
                if (targetSection) {
                    targetSection.classList.add('active');
                    
                    // Cargar estadísticas solo en Inicio
                    if (dataSection === 'inicio') {
                        loadHomeStats();
                    }
                }
                
                // Cerrar sidebar en móvil
                if (window.innerWidth <= 1024) {
                    const sidebar = document.getElementById('sidebar');
                    const overlay = document.getElementById('sidebar-overlay');
                    const menuToggle = document.getElementById('menu-toggle');
                    
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                    if (menuToggle) menuToggle.classList.remove('active');
                    document.body.classList.remove('sidebar-open');
                }
            }
        });
    });
}

// ============================================
// HIGHLIGHT ACTIVE SIDEBAR ITEM
// ============================================
function highlightActiveSidebar() {
    const currentPath = window.location.pathname;
    const currentFile = currentPath.split('/').pop() || 'index.html';
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    
    sidebarItems.forEach(item => {
        const href = item.getAttribute('href');
        const dataSection = item.getAttribute('data-section');
        
        // Resetear todos
        item.classList.remove('active');
        
        // Si es página externa
        if (href && href.includes('.html')) {
            if (currentPath.includes(href) || currentFile === href) {
                item.classList.add('active');
            }
        }
        // Si es sección interna (solo en index.html)
        else if (dataSection && currentFile === 'index.html') {
            if (dataSection === 'inicio') {
                item.classList.add('active');
            }
        }
    });
}

// ============================================
// ESTADO DE CONEXIÓN - ONLINE/OFFLINE
// ============================================
function initConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (!statusEl) return;

    function update() {
        const isOnline = navigator.onLine;
        statusEl.classList.toggle('online', isOnline);
        statusEl.querySelector('.status-text').textContent = isOnline ? 'Online' : 'Offline';
    }

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

// ============================================
// CARGAR ESTADÍSTICAS DEL HOME
// ============================================
async function loadHomeStats() {
    await getAllPlayers();

    // --- Simulaciones Exitosas ---
    const totalSims = parseInt(localStorage.getItem('courtSight_simulations') || '0');
    const successfulSims = parseInt(localStorage.getItem('courtSight_successful_simulations') || '0');
    const successRate = totalSims > 0 ? Math.round((successfulSims / totalSims) * 100) : 0;

    const percentageEl = document.getElementById('simulation-percentage');
    const progressEl = document.getElementById('simulation-progress');
    const totalEl = document.getElementById('total-simulations');

    if (percentageEl && progressEl && totalEl) {
        // VALOR DE DEMOSTRACIÓN: 98%
        const displayRate = 98; // ← Cambia esto a 'successRate' para usar el valor real
        
        percentageEl.textContent = `${displayRate}%`;
        totalEl.textContent = totalSims > 0 ? totalSims : '0';
        
        // Actualizar gráfico circular
        progressEl.setAttribute('stroke-dasharray', `${displayRate}, 100`);
        
        // Color según porcentaje
        if (displayRate >= 80) {
            progressEl.style.stroke = 'var(--accent)';
        } else if (displayRate >= 50) {
            progressEl.style.stroke = 'var(--warning)';
        } else {
            progressEl.style.stroke = 'var(--danger)';
        }
    }

    // --- Última Actualización ---
    const lastUpdateEl = document.getElementById('last-update-date');
    const lastUpdateTimeEl = document.getElementById('last-update-time');
    const versionEl = document.getElementById('data-version'); 
    const versionBadgeEl = document.getElementById('data-version-badge');

    if (lastUpdateEl) {
        // VALOR DE DEMOSTRACIÓN: 12 de marzo de 2026
        const demoDate = new Date('2026-03-12'); // ← Fecha de demo
        const lastUpdate = await getMeta('last_update_date');
        const dateToUse = lastUpdate ? new Date(lastUpdate) : demoDate;
        
        // Fecha formateada 
        lastUpdateEl.textContent = dateToUse.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
        
        // Label de tiempo
        if (lastUpdateTimeEl) {
            if (lastUpdate) {
                const now = new Date();
                const diffDays = Math.ceil(Math.abs(now - dateToUse) / (1000 * 60 * 60 * 24));
                if (diffDays === 0) {
                    lastUpdateTimeEl.textContent = 'Hoy';
                } else if (diffDays === 1) {
                    lastUpdateTimeEl.textContent = 'Ayer';
                } else {
                    lastUpdateTimeEl.textContent = `Hace ${diffDays} días`;
                }
            } else {
                lastUpdateTimeEl.textContent = 'Datos de demostración';
            }
        }
    }

    if (versionEl) {
        const version = await getMeta('version');
        versionEl.textContent = version || '1.0';
        
        if (versionBadgeEl && !version) {
            versionBadgeEl.style.display = 'none';
        }
    }

    // Inicializar estado de conexión
    initConnectionStatus();
}

// ============================================
// GUARDAR SIMULACIÓN - TRACKING
// ============================================
function saveSimulation(successful = true) {
    const current = parseInt(localStorage.getItem('courtSight_simulations') || '0');
    localStorage.setItem('courtSight_simulations', current + 1);
    
    if (successful) {
        const successfulCurrent = parseInt(localStorage.getItem('courtSight_successful_simulations') || '0');
        localStorage.setItem('courtSight_successful_simulations', successfulCurrent + 1);
    }
}

// ============================================
// SERVICE WORKER - PWA OFFLINE
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('✅ Service Worker registrado:', registration.scope);
            })
            .catch(error => {
                console.log('❌ Error Service Worker:', error);
            });
    });
}

// ============================================
// EXPORTAR FUNCIONES GLOBALES
// ============================================
window.CourtSight = {
    db: () => db,
    getPlayers: getAllPlayers,
    savePlayers: savePlayersBatch,
    clearData: clearAllData,
    getMeta,
    setMeta,
    initConnectionStatus,
    saveSimulation,
    loadHomeStats,
    toggleSidebar: window.toggleSidebar || null
};

// ============================================
// MENSAJE DE CONSOLA - DEBUG
// ============================================
console.log('🎾 CourtSight Tennis v1.0.0 - Cargado correctamente');
console.log('⚡ Modo Offline disponible');
console.log('📊 Secciones activas: Inicio, Ranking ELO, Simular, Ranking ATP, Biblioteca, Actualizaciones');

async function loadPlayersData() {
    if (isLoading) return;
    
    isLoading = true;
    showLoadingState();
    
    try {
        console.log('📥 Cargando datos desde JSON...');
        
        const [dbResponse, rankResponse] = await Promise.all([
            fetch('../data/players_database.json'),
            fetch('../data/players_rank.json')
        ]);
        
        console.log('📄 DB Status:', dbResponse.status);
        console.log('📄 Rank Status:', rankResponse.status);
        
        if (!dbResponse.ok || !rankResponse.ok) {
            throw new Error('Error al cargar los datos');
        }
        
        playersDatabase = await dbResponse.json();
        playersRank = await rankResponse.json();
        
        console.log('✅ JSON cargados:', {
            db: playersDatabase.length,
            rank: playersRank.rankings?.length || 0
        });
        
        // Fusionar datos
        mergePlayers();
        
        console.log('✅ Jugadores fusionados:', mergedPlayers.length);
        
        // Ocultar loading, mostrar formulario
        hideLoadingState();
        showSimulationForm();
        
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        showError('Error al cargar los jugadores. Verifica tu conexión.');
        
        // FORZAR MOSTRAR FORMULARIO AUNQUE FALLE INDEXEDDB
        hideLoadingState();
        showSimulationForm();
    } finally {
        isLoading = false;
    }
}