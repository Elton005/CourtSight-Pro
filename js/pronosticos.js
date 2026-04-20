/* ============================================
🔧 CALENDARIO REPARADO - v3.3
✅ Solo muestra "HOY" (sin ayer/mañana)
✅ Marcado correcto de días con partidos
✅ Navegación simplificada
============================================ */

// --- CONFIGURACIÓN ---
const PRON_CONFIG = {
    CACHE_TTL: 6 * 60 * 60 * 1000,
    LOCALES: { 
        days: ['D', 'L', 'M', 'X', 'J', 'V', 'S'], 
        months: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        monthsFull: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
    }
};

// --- ESTADO ---
let matches = [];
let currentDate = new Date();
let calViewDate = new Date();
let availableDates = new Set(); // 🔹 NUEVO: Set de fechas con partidos

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    initDateNav();
    initCalendar();
    initDetailModal();
    loadMatches();
});

// --- CARGA DE DATOS ---
async function loadMatches() {
    showLoading(true);
    try {
        const cached = await getCache('pronosticos');
        if (cached) { 
            matches = cached; 
            console.log('⚡ Pronósticos cargados desde caché');
        } else {
            const res = await fetch('../data/pronosticos.json');
            if (!res.ok) throw new Error('Fetch Error');
            matches = await res.json();
            setCache('pronosticos', matches);
            console.log('📥 Pronósticos cargados desde red');
        }
        
        // 🔹 NUEVO: Extraer fechas disponibles UNA VEZ
        availableDates = new Set(matches.map(m => m.date));
        console.log('📅 Fechas disponibles:', availableDates.size, 'días');
        
        // Cargar HOY por defecto
        renderTournaments();
    } catch (e) {
        console.error('❌ Error cargando pronósticos:', e);
        showEmpty('Error al cargar datos. Verifica tu conexión.');
    } finally { 
        showLoading(false); 
    }
}

// --- NAVEGACIÓN FECHA (SOLO HOY) ---
function initDateNav() {
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnDate = document.getElementById('btn-date');
    
    updateDateDisplay();
    
    // 🔹 CAMBIO: Botones prev/next solo abren calendario
    if (btnPrev) btnPrev.addEventListener('click', () => openCalendar());
    if (btnNext) btnNext.addEventListener('click', () => openCalendar());
    if (btnDate) btnDate.addEventListener('click', () => openCalendar());
}

function changeDate(offset) {
    currentDate.setDate(currentDate.getDate() + offset);
    updateDateDisplay();
    renderTournaments();
}

// 🔹 ACTUALIZADO: Solo muestra "HOY" o fecha numérica
function updateDateDisplay() {
    const txt = document.getElementById('date-text');
    const icon = document.getElementById('date-icon');
    const today = new Date();
    const isToday = currentDate.toDateString() === today.toDateString();
    
    if (isToday) {
        txt.textContent = 'HOY';
        if (icon) icon.innerHTML = '<i class="fas fa-calendar-day"></i>';
    } else {
        // Formato: "15 Ene" o "23 Mar"
        txt.textContent = `${currentDate.getDate()} ${PRON_CONFIG.LOCALES.months[currentDate.getMonth()]}`;
        if (icon) icon.innerHTML = '<i class="fas fa-calendar-alt"></i>';
    }
}

function formatDateKey(date) {
    return date.toISOString().split('T')[0];
}

// --- CALENDARIO REPARADO ---
function initCalendar() {
    const modal = document.getElementById('calendar-modal');
    const overlay = document.querySelector('.calendar-overlay');
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-title');
    const prev = document.getElementById('cal-prev');
    const next = document.getElementById('cal-next');
    const todayBtn = document.getElementById('cal-today');
    const closeBtn = document.getElementById('cal-close');
    const dateBtn = document.getElementById('btn-date');
    
    function renderCal() {
        title.textContent = `${PRON_CONFIG.LOCALES.monthsFull[calViewDate.getMonth()]} ${calViewDate.getFullYear()}`;
        grid.innerHTML = '';
        
        const firstDay = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), 1).getDay();
        const daysInMonth = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 0).getDate();
        const startIdx = firstDay === 0 ? 6 : firstDay - 1; // Lunes inicio
        
        // Días vacíos antes del primer día del mes
        for (let i = 0; i < startIdx; i++) {
            grid.innerHTML += `<div class="cal-day empty"></div>`;
        }
        
        // Días del mes
        for (let d = 1; d <= daysInMonth; d++) {
            const dObj = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), d);
            const isToday = dObj.toDateString() === new Date().toDateString();
            const isActive = dObj.toDateString() === currentDate.toDateString();
            const key = formatDateKey(dObj);
            
            // 🔹 REPARADO: Usa availableDates (Set) en lugar de buscar en matches cada vez
            const hasMatch = availableDates.has(key);
            
            const el = document.createElement('div');
            el.className = `cal-day ${isActive ? 'active' : ''} ${isToday ? 'today' : ''} ${hasMatch ? 'has-match' : ''}`;
            el.textContent = d;
            el.setAttribute('role', 'button');
            el.setAttribute('tabindex', hasMatch ? '0' : '-1');
            el.setAttribute('aria-label', `${d} de ${PRON_CONFIG.LOCALES.monthsFull[calViewDate.getMonth()]}, ${hasMatch ? 'con partidos' : 'sin partidos'}`);
            
            if (hasMatch) {
                el.addEventListener('click', () => selectDate(dObj));
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectDate(dObj);
                    }
                });
            } else {
                el.style.cursor = 'not-allowed';
                el.style.opacity = '0.4';
            }
            
            grid.appendChild(el);
        }
    }
    
    function selectDate(dateObj) {
        currentDate = new Date(dateObj);
        updateDateDisplay();
        renderTournaments();
        modal.classList.add('hidden');
        
        // Actualizar botón de fecha
        if (dateBtn) {
            dateBtn.setAttribute('aria-expanded', 'false');
        }
    }
    
    // Abrir calendario
    function openCalendar() {
        calViewDate = new Date(currentDate);
        renderCal();
        modal.classList.remove('hidden');
        
        // Focus en el día activo o hoy
        setTimeout(() => {
            const activeDay = grid.querySelector('.cal-day.active, .cal-day.today');
            if (activeDay) activeDay.focus();
        }, 100);
        
        if (dateBtn) {
            dateBtn.setAttribute('aria-expanded', 'true');
        }
    }
    
    // Event listeners
    if (dateBtn) dateBtn.addEventListener('click', openCalendar);
    if (overlay) overlay.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (dateBtn) dateBtn.setAttribute('aria-expanded', 'false');
    });
    if (closeBtn) closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (dateBtn) dateBtn.setAttribute('aria-expanded', 'false');
    });
    if (todayBtn) todayBtn.addEventListener('click', () => {
        currentDate = new Date();
        calViewDate = new Date();
        updateDateDisplay();
        renderTournaments();
        modal.classList.add('hidden');
        if (dateBtn) dateBtn.setAttribute('aria-expanded', 'false');
    });
    
    if (prev) prev.addEventListener('click', () => { 
        calViewDate.setMonth(calViewDate.getMonth() - 1); 
        renderCal(); 
    });
    if (next) next.addEventListener('click', () => { 
        calViewDate.setMonth(calViewDate.getMonth() + 1); 
        renderCal(); 
    });
    
    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
            if (dateBtn) dateBtn.setAttribute('aria-expanded', 'false');
        }
    });
}

// --- RENDER AGRUPADO POR TORNEO ---
function renderTournaments() {
    const container = document.getElementById('tournaments-container');
    const empty = document.getElementById('empty-state');
    const key = formatDateKey(currentDate);
    const dayMatches = matches.filter(m => m.date === key);
    
    document.getElementById('loading-state').classList.add('hidden');
    
    if (!dayMatches.length) {
        container.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    
    const grouped = dayMatches.reduce((acc, m) => {
        const tKey = m.tournament || 'Sin Torneo';
        if (!acc[tKey]) acc[tKey] = { tournament: tKey, surface: m.surface, matches: [] };
        acc[tKey].matches.push(m);
        return acc;
    }, {});
    
    const sortedTournaments = Object.values(grouped).sort((a, b) => a.tournament.localeCompare(b.tournament));
    
    container.innerHTML = sortedTournaments.map(group => {
        const matchCount = group.matches.length;
        return `
        <div class="tournament-group">
            <div class="tournament-header">
                <div class="tournament-icon">
                    ${group.tournament.toLowerCase().includes('atp') 
                        ? `<img src="../pictures/atp-logo.jpg" class="tournament-logo" alt="ATP" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-trophy\\'></i>'">` 
                        : `<i class="fas fa-trophy"></i>`}
                </div>
                <div class="tournament-info">
                    <h3 class="tournament-name">${escapeHtml(group.tournament)}</h3>
                    <p class="tournament-meta">
                        <span class="tournament-surface" data-surface="${escapeHtml(group.surface)}">${escapeHtml(group.surface)}</span>
                        <span class="tournament-count">${matchCount} partido${matchCount !== 1 ? 's' : ''}</span>
                    </p>
                </div>
            </div>
            <div class="tournament-matches">
                ${group.matches.map(m => renderMatchCard(m)).join('')}
            </div>
        </div>`;
    }).join('');
    
    container.querySelectorAll('.match-card').forEach(card => {
        card.addEventListener('click', () => openDetail(card.dataset.id));
    });
}

// --- RENDERIZAR TARJETA DE PARTIDO ---
function renderMatchCard(m) {
    let bgClass = '';
    if (m.predictionCorrect === true) bgClass = 'correct';
    else if (m.predictionCorrect === false) bgClass = 'incorrect';
    
    let setsHtml = '';
    if (m.result && m.result.sets && m.result.sets.length > 0) {
        setsHtml = '<div class="match-sets">' + m.result.sets.map(s => {
            const setWinner = s.a > s.b ? 'a' : (s.b > s.a ? 'b' : 'tie');
            let aClass = setWinner === 'a' ? 'winner-set' : '';
            let bClass = setWinner === 'b' ? 'winner-set' : '';
            let score = `${s.a}-${s.b}`;
            if (s.tbA && s.tbB) score += `(${s.tbA})`;
            return `<span class="set-score ${aClass}">${score}</span>`;
        }).join('') + '</div>';
    } else {
        setsHtml = '<div class="match-sets" style="opacity:0.3">—</div>';
    }
    
    let statusClass = 'upc';
    let statusText = 'PRÓXIMO';
    if (m.status === 'live') { statusClass = 'live'; statusText = 'LIVE'; }
    else if (m.status === 'finished') { statusClass = 'ft'; statusText = 'FT'; }
    
    let timeHtml = `<div class="match-time"><span class="match-time-value">${m.startTime || '--:--'}</span><span class="status ${statusClass}">${statusText}</span></div>`;
    
    let winnerA = m.result?.winner === m.playerA.name ? 'winner' : '';
    let winnerB = m.result?.winner === m.playerB.name ? 'winner' : '';
    
    return `
    <div class="match-card ${bgClass}" data-id="${m.id}">
        ${timeHtml}
        <div class="match-players">
            <div class="player-row ${winnerA}">
                <img src="../pictures/${m.playerA.flagCode}.png" class="flag-sm" alt="${m.playerA.name}" onerror="this.style.display='none'">
                <span class="player-name">${escapeHtml(m.playerA.name)}</span>
            </div>
            <div class="player-row ${winnerB}">
                <img src="../pictures/${m.playerB.flagCode}.png" class="flag-sm" alt="${m.playerB.name}" onerror="this.style.display='none'">
                <span class="player-name">${escapeHtml(m.playerB.name)}</span>
            </div>
        </div>
        ${setsHtml}
    </div>`;
}

// --- MODAL DETALLE ---
function initDetailModal() {
    const modal = document.getElementById('detail-modal');
    const close = document.getElementById('detail-close');
    const backdrop = document.querySelector('.modal-backdrop');
    
    close.addEventListener('click', () => modal.classList.add('hidden'));
    backdrop.addEventListener('click', () => modal.classList.add('hidden'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modal.classList.add('hidden'); });
}

function openDetail(id) {
    const m = matches.find(x => x.id === id);
    if (!m) return;
    
    const surfEl = document.getElementById('detail-surface');
    surfEl.textContent = m.surface;
    surfEl.setAttribute('data-surface', m.surface);
    
    const statEl = document.getElementById('detail-status');
    const statusMap = { 'live': 'EN VIVO', 'finished': 'FINALIZADO', 'upcoming': 'PRÓXIMO' };
    statEl.textContent = statusMap[m.status] || m.status.toUpperCase();
    statEl.setAttribute('data-status', m.status);
    
    document.getElementById('detail-name-a').textContent = m.playerA.name;
    document.getElementById('detail-name-b').textContent = m.playerB.name;
    document.getElementById('detail-flag-a').src = `../pictures/${m.playerA.flagCode}.png`;
    document.getElementById('detail-flag-b').src = `../pictures/${m.playerB.flagCode}.png`;
    
    document.getElementById('elo-fav').textContent = m.elo.favorite;
    document.getElementById('elo-odds').textContent = m.elo.odds.toFixed(2);
    document.getElementById('elo-prob').textContent = m.elo.probability.toFixed(1) + '%';
    document.getElementById('elo-bar-fill').style.width = '0%';
    
    document.getElementById('mkt-fav').textContent = m.market.favorite;
    document.getElementById('mkt-odds').textContent = m.market.odds.toFixed(2);
    document.getElementById('mkt-prob').textContent = m.market.probability.toFixed(1) + '%';
    document.getElementById('mkt-bar-fill').style.width = '0%';
    
    const rec = m.betting_recommendation;
    const scEl = document.getElementById('detail-scenario');
    if (rec && rec.type) {
        scEl.innerHTML = `<span class="scenario-text">${rec.label}</span>`;
        scEl.className = `scenario-pill ${rec.type}`;
        document.getElementById('detail-rec').textContent = rec.betText.toUpperCase();
    } else {
        scEl.textContent = 'Sin datos';
        scEl.className = 'scenario-pill neutro';
        document.getElementById('detail-rec').textContent = 'N/A';
    }
    
    document.getElementById('detail-analysis').textContent = m.analysis || "Análisis no disponible.";
    
    const eloDiff = (m.elo.probability - m.market.probability).toFixed(1);
    const diffEl = document.getElementById('value-diff');
    diffEl.textContent = (eloDiff > 0 ? '+' : '') + eloDiff + '%';
    diffEl.className = `diff-value mono ${parseFloat(eloDiff) >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('detail-modal').classList.remove('hidden');
    setTimeout(() => {
        document.getElementById('elo-bar-fill').style.width = `${m.elo.probability}%`;
        document.getElementById('mkt-bar-fill').style.width = `${m.market.probability}%`;
    }, 150);
}

// --- UTILIDADES ---
function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div'); 
    d.textContent = text; 
    return d.innerHTML;
}

function showLoading(v) { 
    document.getElementById('loading-state').classList.toggle('hidden', !v); 
    document.getElementById('tournaments-container').classList.toggle('hidden', v);
}

function showEmpty(msg) { 
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('tournaments-container').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden'); 
    document.getElementById('empty-state').querySelector('p').textContent = msg || 'No hay pronósticos disponibles.'; 
}

const CACHE_STORE = {};
async function getCache(key) { 
    if (CACHE_STORE[key] && Date.now() - CACHE_STORE[key].timestamp < PRON_CONFIG.CACHE_TTL) {
        return CACHE_STORE[key].data;
    }
    return null; 
}
async function setCache(key, data) { 
    CACHE_STORE[key] = { data, timestamp: Date.now() }; 
}