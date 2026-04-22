/* ============================================
COURT SIGHT TENNIS - SIMULADOR JS v2.0
✅ Pestañas + Simulador Personalizado ATP/Challenger
✅ Lógica Monte Carlo 10k intacta + seed determinista
✅ Historial simple + parámetros por circuito
============================================ */

// ============================================
// 🔹 CONFIGURACIÓN
// ============================================
const SIM_CONFIG = {
    // Parámetros por circuito
    circuits: {
        atp: {
            uncertainty: 85,
            eloDivisor: 800,
            minProb: 0.12,
            maxProb: 0.90,
            margin: 1.05,
            surfaceVariance: { grass: 0.85, clay: 1.0, hardOut: 1.0, hardIndoor: 0.95 }
        },
        challenger: {
            uncertainty: 55,
            eloDivisor: 650,
            minProb: 0.16,
            maxProb: 0.84,
            margin: 1.09,
            surfaceVariance: { grass: 0.75, clay: 1.0, hardOut: 1.0, hardIndoor: 0.95 },
            motivationBonus: { minRank: 100, maxRank: 200, bonus: 0.05 },
            oddsPenalty: { threshold: 2.20, penalty: -0.02 }
        }
    },
    // UI
    DEBOUNCE_MS: 250,
    MAX_SUGGESTIONS: 10,
    HISTORY_LIMIT: 5
};

// ============================================
// 🔹 ESTADO GLOBAL
// ============================================
let allPlayers = [];
let player1 = null;
let player2 = null;
let currentSurface = 'hardOut';
let currentCircuit = 'atp';
let simulationHistory = [];
let currentSimulationData = null;

const playerAdjustments = {
    1: { total: 0, selections: {} },
    2: { total: 0, selections: {} }
};
let adjustingPlayer = null;
let searchTimeout = null;

// ============================================
// 🔹 INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initCircuitSelector();
    initSimulator();
    loadHistory();
    console.log('🎾 Simulador v2.0 listo: Live (placeholder) + Personalizado (ATP/Challenger)');
});

// ============================================
// 🔹 GESTIÓN DE PESTAÑAS
// ============================================
function initTabs() {
    const tabs = document.querySelectorAll('.sim-tab');
    const panels = document.querySelectorAll('.sim-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.target;
            
            // Actualizar estado de pestañas
            tabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            // Cambiar paneles
            panels.forEach(panel => {
                panel.classList.remove('active');
                panel.hidden = true;
            });

            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.hidden = false;
                requestAnimationFrame(() => {
                    targetPanel.classList.add('active');
                });
            }
        });

        // Accesibilidad teclado
        tab.addEventListener('keydown', (e) => {
            const tabArray = Array.from(tabs);
            const currentIndex = tabArray.indexOf(tab);
            let nextIndex;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                nextIndex = (currentIndex + 1) % tabArray.length;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                nextIndex = (currentIndex - 1 + tabArray.length) % tabArray.length;
            }

            if (nextIndex !== undefined) {
                tabArray[nextIndex].focus();
                tabArray[nextIndex].click();
            }
        });
    });
}

// ============================================
// 🔹 SELECTOR DE CIRCUITO
// ============================================
function initCircuitSelector() {
    document.querySelectorAll('.circuit-option').forEach(opt => {
        opt.addEventListener('click', () => selectCircuit(opt.dataset.circuit));
        opt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectCircuit(opt.dataset.circuit);
            }
        });
    });
}

function selectCircuit(circuit) {
    currentCircuit = circuit;
    
    // Actualizar UI
    document.querySelectorAll('.circuit-option').forEach(opt => {
        const isActive = opt.dataset.circuit === circuit;
        opt.classList.toggle('active', isActive);
        opt.setAttribute('aria-checked', isActive);
    });
    
    // Resetear jugadores si cambiamos de circuito (opcional)
    // player1 = null; player2 = null;
    // updateSimulateButton();
    
    console.log(`🔄 Circuito: ${circuit.toUpperCase()}`);
}

// ============================================
// 🔹 INICIALIZAR SIMULADOR
// ============================================
function initSimulator() {
    // Solo inicializar si estamos en la pestaña activa
    const customPanel = document.getElementById('panel-custom');
    if (!customPanel?.classList.contains('active')) return;
    
    loadPlayers();
    initEventListeners();
}

// ============================================
// 🔹 CARGAR JUGADORES
// ============================================
async function loadPlayers() {
    const loadingEl = document.getElementById('loading');
    const formEl = document.getElementById('simulate-form');
    
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (formEl) formEl.classList.add('hidden');
    
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const [dbRes, rankRes] = await Promise.all([
            fetch('../data/players_database.json', { signal: controller.signal }),
            fetch('../data/players_rank.json', { signal: controller.signal })
        ]);
        
        clearTimeout(timeout);
        if (!dbRes.ok || !rankRes.ok) throw new Error('Error JSON');
        
        const db = await dbRes.json();
        const rank = await rankRes.json();
        const dbMap = new Map(db.map(p => [p.id, p]));
        
        allPlayers = rank.rankings.map(r => {
            const d = dbMap.get(r.id);
            if (!d) return null;
            return { 
                id: r.id, 
                name: d.name, 
                nationality: d.nationality, 
                flagUrl: d.flagUrl, 
                rank: d.rank, 
                elo: r.elo,
                atpRank: r.atpPoints ? Math.round(10000 / r.atpPoints) : null
            };
        }).filter(p => p !== null);
        
        console.log('✅ Jugadores cargados:', allPlayers.length);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (formEl) formEl.classList.remove('hidden');
        
    } catch (error) {
        console.error('❌ Error:', error);
        if (loadingEl) {
            loadingEl.innerHTML = `<p style="color:var(--danger)">Error al cargar</p><button onclick="location.reload()" class="btn-primary" style="margin-top:1rem">Reintentar</button>`;
        }
    }
}

// ============================================
// 🔹 EVENT LISTENERS
// ============================================
function initEventListeners() {
    // Búsquedas
    ['player1-search', 'player2-search'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', (e) => {
                if (searchTimeout) clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchPlayer(e.target.value, id.includes('1') ? 1 : 2);
                }, SIM_CONFIG.DEBOUNCE_MS);
            });
        }
    });
    
    // Superficie
    const surfaceSelect = document.getElementById('surface-select');
    if (surfaceSelect) {
        surfaceSelect.addEventListener('change', (e) => {
            currentSurface = e.target.value;
            if (player1 && getElo(player1, currentSurface) <= 0) removePlayer(1);
            if (player2 && getElo(player2, currentSurface) <= 0) removePlayer(2);
            updateSimulateButton();
        });
    }
    
    // Clicks globales
    document.addEventListener('click', (e) => {
        if (e.target.closest('.remove-player')) {
            removePlayer(parseInt(e.target.closest('.remove-player').dataset.player));
        }
        if (e.target.closest('.btn-adjust')) {
            openAdjustPanel(parseInt(e.target.closest('.btn-adjust').dataset.player));
        }
        if (!e.target.closest('.search-box')) {
            document.querySelectorAll('.suggestions-list').forEach(el => el.classList.add('hidden'));
        }
    });
    
    // Botones principales
    const btnSimulate = document.getElementById('btn-simulate');
    if (btnSimulate) btnSimulate.addEventListener('click', runSimulation);
    
    const btnNew = document.getElementById('btn-new');
    if (btnNew) btnNew.addEventListener('click', resetSimulation);
    
    // Panel ajustes
    const btnClose = document.querySelector('#adjust-panel .btn-close');
    if (btnClose) btnClose.addEventListener('click', closeAdjustPanel);
    
    const btnApply = document.getElementById('btn-apply-adjustments');
    if (btnApply) btnApply.addEventListener('click', () => { 
        applyContextAdjustments(); 
        closeAdjustPanel(); 
    });
    
    // Cuotas: actualizar botón al cambiar
    ['house1-odds1', 'house1-odds2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateSimulateButton);
    });
}

// ============================================
// 🔹 BÚSQUEDA & SELECCIÓN DE JUGADORES
// ============================================
function searchPlayer(query, playerNum) {
    query = query.toLowerCase().trim();
    if (query.length < 2) { hideSuggestions(playerNum); return; }
    
    const filtered = allPlayers
        .filter(p => {
            const nameMatch = p.name.toLowerCase().includes(query);
            const eloValid = getElo(p, currentSurface) > 0;
            return nameMatch && eloValid;
        })
        .slice(0, SIM_CONFIG.MAX_SUGGESTIONS);
    
    if (filtered.length === 0) { hideSuggestions(playerNum); return; }
    
    const container = document.getElementById(`player${playerNum}-suggestions`);
    if (!container) return;
    
    container.innerHTML = filtered.map(p => `
        <div class="suggestion-item" data-id="${p.id}" role="option">
            <img src="../${p.flagUrl}" class="sugg-flag" onerror="this.src='../pictures/unknown.png'" alt="">
            <div class="sugg-info">
                <div class="sugg-name">${escapeHtml(p.name)}</div>
                <div class="sugg-rank">Rank ${p.rank || '—'} • ${escapeHtml(p.nationality)}</div>
            </div>
        </div>
    `).join('');
    
    container.querySelectorAll('.suggestion-item').forEach(item => 
        item.addEventListener('click', () => selectPlayer(item.dataset.id, playerNum))
    );
    container.classList.remove('hidden');
}

function hideSuggestions(num) { 
    const el = document.getElementById(`player${num}-suggestions`); 
    if (el) el.classList.add('hidden'); 
}

function selectPlayer(playerId, playerNum) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    // Validar jugadores diferentes
    if ((playerNum === 1 && player2?.id === playerId) || (playerNum === 2 && player1?.id === playerId)) { 
        showError('⚠️ Selecciona jugadores diferentes'); 
        return; 
    }
    
    // Validar ELO en superficie
    const elo = getElo(player, currentSurface);
    if (elo <= 0) { 
        showError(`⚠️ Sin puntos en ${getSurfaceName(currentSurface)}`); 
        return; 
    }
    
    // Asignar jugador
    if (playerNum === 1) player1 = { ...player, elo }; 
    else player2 = { ...player, elo };
    
    playerAdjustments[playerNum] = { total: 0 };
    showSelectedPlayer(playerNum);
    
    // Limpiar búsqueda
    const searchInput = document.getElementById(`player${playerNum}-search`);
    if (searchInput) searchInput.value = '';
    hideSuggestions(playerNum); 
    hideError(); 
    updateSimulateButton();
}

function showSelectedPlayer(num) {
    const player = num === 1 ? player1 : player2;
    if (!player) return;
    
    const container = document.getElementById(`player${num}-selected`);
    const searchBox = document.getElementById(`player${num}-search`)?.parentElement;
    if (!container) return;
    
    const flagEl = container.querySelector('.selected-flag');
    const nameEl = container.querySelector('.selected-name');
    const eloEl = container.querySelector('.selected-elo');
    
    if (flagEl) flagEl.src = `../${player.flagUrl}`;
    if (nameEl) nameEl.textContent = player.name;
    if (eloEl) eloEl.textContent = `ELO: ${player.elo}`;
    
    container.classList.remove('hidden');
    if (searchBox) searchBox.classList.add('hidden');
}

function removePlayer(num) {
    if (num === 1) { player1 = null; playerAdjustments[1] = { total: 0 }; }
    else { player2 = null; playerAdjustments[2] = { total: 0 }; }
    
    const selectedEl = document.getElementById(`player${num}-selected`);
    const searchEl = document.getElementById(`player${num}-search`);
    
    if (selectedEl) selectedEl.classList.add('hidden');
    if (searchEl?.parentElement) searchEl.parentElement.classList.remove('hidden');
    
    updateSimulateButton();
}

function updateSimulateButton() { 
    const btn = document.getElementById('btn-simulate'); 
    if (btn) {
        const hasPlayers = player1 && player2;
        const hasOdds = document.getElementById('house1-odds1')?.value && document.getElementById('house1-odds2')?.value;
        btn.disabled = !(hasPlayers && hasOdds);
        btn.title = hasPlayers && hasOdds ? '' : 'Selecciona jugadores y cuotas';
    }
}

// ============================================
// 🔹 PANEL DE AJUSTES (Bottom Sheet)
// ============================================
function openAdjustPanel(playerNum) {
    const player = playerNum === 1 ? player1 : player2;
    if (!player) { showError('⚠️ Selecciona jugador primero'); return; }
    
    adjustingPlayer = playerNum;
    const panel = document.getElementById('adjust-panel');
    const playerNameEl = document.getElementById('adjust-player-name');
    
    if (panel && playerNameEl) {
        panel.dataset.adjustingPlayer = playerNum;
        playerNameEl.textContent = player.name;
        
        // Restaurar selecciones guardadas
        const saved = playerAdjustments[playerNum]?.selections;
        document.querySelectorAll('#adjust-panel input[type="radio"]').forEach(radio => {
            const name = radio.name;
            if (saved && saved[name] === radio.value) radio.checked = true;
            else if (!saved) {
                const group = document.querySelector(`input[name="${name}"]`);
                if (group && group === radio) radio.checked = true;
            }
        });
        
        panel.classList.remove('hidden');
        void panel.offsetWidth; // Forzar reflow
        panel.classList.add('active');
    }
}

function closeAdjustPanel() {
    const panel = document.getElementById('adjust-panel');
    if (!panel) return;
    
    panel.classList.remove('active');
    setTimeout(() => { 
        panel.classList.add('hidden'); 
        adjustingPlayer = null; 
    }, 300);
}

function applyContextAdjustments() {
    if (!adjustingPlayer) return;
    
    const selections = {
        'form-5matches': document.querySelector('input[name="form-5matches"]:checked')?.value,
        'form-quality': document.querySelector('input[name="form-quality"]:checked')?.value,
        'form-rivals': document.querySelector('input[name="form-rivals"]:checked')?.value,
        'context-participation': document.querySelector('input[name="context-participation"]:checked')?.value,
        'context-best': document.querySelector('input[name="context-best"]:checked')?.value
    };
    
    const form5 = parseInt(selections['form-5matches'] || 5);
    const quality = parseInt(selections['form-quality'] || 3);
    const rivals = parseInt(selections['form-rivals'] || 4);
    const ctxPart = parseInt(selections['context-participation'] || 10);
    const ctxBest = parseInt(selections['context-best'] || 8);
    
    const formaAjuste = (form5 + quality + rivals) * 0.6;
    const contextoAjuste = (ctxPart + ctxBest) * 0.4;
    const totalAdjust = Math.max(-35, Math.min(35, formaAjuste + contextoAjuste));
    
    playerAdjustments[adjustingPlayer] = { total: totalAdjust, selections: selections };
    showError(`✓ Ajustes: ${totalAdjust > 0 ? '+' : ''}${totalAdjust.toFixed(1)}%`);
}

// ============================================
// 🔹 SIMULACIÓN MONTE CARLO
// ============================================
async function runSimulation() {
    if (!player1 || !player2) return;
    
    // Validar cuotas
    const odds1 = parseFloat(document.getElementById('house1-odds1')?.value);
    const odds2 = parseFloat(document.getElementById('house1-odds2')?.value);
    if (!odds1 || !odds2 || odds1 < 1 || odds2 < 1) {
        showError('⚠️ Ingresa cuotas válidas (≥1.00)');
        return;
    }
    
    const formEl = document.getElementById('simulate-form');
    const simEl = document.getElementById('simulating');
    
    if (formEl) formEl.classList.add('hidden');
    if (simEl) simEl.classList.remove('hidden');
    
    // Barra de progreso simulada
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress = Math.min(90, progress + 2);
        const fillEl = document.getElementById('progress-fill');
        const textEl = document.getElementById('progress-text');
        if (fillEl) fillEl.style.width = `${progress}%`;
        if (textEl) textEl.textContent = `${Math.round(progress)}%`;
    }, 50);
    
    // Ejecutar simulación después de delay visual
    setTimeout(() => {
        clearInterval(progressInterval);
        const results = calculateSimulation();
        currentSimulationData = results;
        
        // Completar barra
        const fillEl = document.getElementById('progress-fill');
        const textEl = document.getElementById('progress-text');
        if (fillEl) fillEl.style.width = '100%';
        if (textEl) textEl.textContent = '100%';
        
        // Mostrar resultados
        setTimeout(() => {
            displayResults(results);
            saveToHistory(results);
            
            if (simEl) simEl.classList.add('hidden');
            const resultsEl = document.getElementById('results');
            if (resultsEl) {
                resultsEl.classList.remove('hidden');
                resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
    }, 1500);
}

function calculateSimulation() {
    const config = SIM_CONFIG.circuits[currentCircuit];
    const elo1 = player1.elo;
    const elo2 = player2.elo;
    
    // Ajuste por superficie (varianza)
    const surfaceFactor = config.surfaceVariance[currentSurface] || 1.0;
    const adjustedUncertainty = config.uncertainty * surfaceFactor;
    
    const eloDiff = elo1 - elo2;
    const adjustedDiff = eloDiff / Math.sqrt(1 + Math.pow(adjustedUncertainty / 400, 2));
    
    // Probabilidad base ELO
    let baseProb1 = 1 / (1 + Math.pow(10, -adjustedDiff / config.eloDivisor));
    baseProb1 = Math.max(config.minProb, Math.min(config.maxProb, baseProb1));
    
    // Ajustes de contexto
    const adj1 = playerAdjustments[1]?.total || 0;
    const adj2 = playerAdjustments[2]?.total || 0;
    let netAdjust = (adj1 - adj2) / 100;
    
    // Bonus motivación Challenger (rank 100-200)
    if (currentCircuit === 'challenger') {
        const p1Rank = player1.atpRank;
        const p2Rank = player2.atpRank;
        if (p1Rank && p1Rank >= config.motivationBonus.minRank && p1Rank <= config.motivationBonus.maxRank) {
            netAdjust += config.motivationBonus.bonus;
        }
        if (p2Rank && p2Rank >= config.motivationBonus.minRank && p2Rank <= config.motivationBonus.maxRank) {
            netAdjust -= config.motivationBonus.bonus;
        }
    }
    
    let finalProb1 = baseProb1 + netAdjust;
    finalProb1 = Math.max(config.minProb, Math.min(config.maxProb, finalProb1));
    
    // Seed determinista para reproducibilidad
    const seed = Math.abs(`${player1.id}_${player2.id}_${currentSurface}_${currentCircuit}`
        .split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) & b, 0));
    
    // Monte Carlo 10,000 iteraciones
    let wins1 = 0;
    for (let i = 0; i < 10000; i++) {
        const x = Math.sin(seed + i) * 10000;
        if ((x - Math.floor(x)) < finalProb1) wins1++;
    }
    
    const simProb1 = (wins1 / 10000) * 100;
    const simProb2 = 100 - simProb1;
    
    // Cuotas modelo con margen del circuito
    const odds1 = 1 / ((simProb1 / 100) * config.margin);
    const odds2 = 1 / ((simProb2 / 100) * config.margin);
    
    // Penalización Challenger si odds > 2.20
    let adjustedProb1 = simProb1;
    if (currentCircuit === 'challenger') {
        const marketOdds1 = parseFloat(document.getElementById('house1-odds1')?.value) || 0;
        const marketOdds2 = parseFloat(document.getElementById('house1-odds2')?.value) || 0;
        if (marketOdds1 > config.oddsPenalty.threshold) {
            adjustedProb1 = Math.max(config.minProb * 100, simProb1 + (config.oddsPenalty.penalty * 100));
        }
    }
    
    return {
        player1: { ...player1, prob: adjustedProb1, odds: odds1, wins: wins1 },
        player2: { ...player2, prob: 100 - adjustedProb1, odds: odds2, wins: 10000 - wins1 },
        eloDiff: Math.abs(elo1 - elo2), 
        adjustedEloDiff: Math.abs(adjustedDiff),
        surface: currentSurface, 
        circuit: currentCircuit,
        timestamp: new Date().toISOString(),
        adjustments: { player1: adj1, player2: adj2 },
        marketOdds: {
            player1: parseFloat(document.getElementById('house1-odds1')?.value) || 0,
            player2: parseFloat(document.getElementById('house1-odds2')?.value) || 0
        }
    };
}

// ============================================
// 🔹 MOSTRAR RESULTADOS
// ============================================
function displayResults(data) {
    const { player1: p1, player2: p2, eloDiff, surface, circuit, timestamp } = data;
    const isP1Favorite = p1.prob > p2.prob;
    
    // ============================================
    // 🔹 ACTUALIZAR TARJETAS DE JUGADORES
    // ============================================
    
    // Jugador 1
    const card1 = document.getElementById('player-card-1');
    const flag1 = document.getElementById('player1-flag');
    const name1 = document.getElementById('player1-name');
    const elo1 = document.getElementById('player1-elo-display');
    const prob1 = document.getElementById('player1-prob');
    const probBar1 = document.getElementById('player1-prob-bar');
    const odds1 = document.getElementById('player1-odds');
    const fav1 = document.getElementById('player1-favorite');
    
    // Jugador 2
    const card2 = document.getElementById('player-card-2');
    const flag2 = document.getElementById('player2-flag');
    const name2 = document.getElementById('player2-name');
    const elo2 = document.getElementById('player2-elo-display');
    const prob2 = document.getElementById('player2-prob');
    const probBar2 = document.getElementById('player2-prob-bar');
    const odds2 = document.getElementById('player2-odds');
    const fav2 = document.getElementById('player2-favorite');
    
    // Actualizar Jugador 1
    if (flag1) flag1.src = `../${p1.flagUrl}`;
    if (name1) name1.textContent = p1.name;
    if (elo1) elo1.textContent = `ELO: ${p1.elo}`;
    if (prob1) prob1.textContent = p1.prob.toFixed(1);
    
    // 🔹 ANIMACIÓN DE BARRA DE PROBABILIDAD - JUGADOR 1
    if (probBar1) {
        // Resetear a 0% primero
        probBar1.style.transition = 'none';
        probBar1.style.width = '0%';
        
        // Forzar reflow para que el navegador registre el cambio
        void probBar1.offsetWidth;
        
        // Restaurar transición y animar al valor real
        probBar1.style.transition = 'width 1s cubic-bezier(0.22, 1, 0.36, 1)';
        probBar1.style.width = `${p1.prob}%`;
    }
    
    if (odds1) odds1.textContent = p1.odds.toFixed(2);
    
    // Actualizar Jugador 2
    if (flag2) flag2.src = `../${p2.flagUrl}`;
    if (name2) name2.textContent = p2.name;
    if (elo2) elo2.textContent = `ELO: ${p2.elo}`;
    if (prob2) prob2.textContent = p2.prob.toFixed(1);
    
    // 🔹 ANIMACIÓN DE BARRA DE PROBABILIDAD - JUGADOR 2
    if (probBar2) {
        // Resetear a 0% primero
        probBar2.style.transition = 'none';
        probBar2.style.width = '0%';
        
        // Forzar reflow para que el navegador registre el cambio
        void probBar2.offsetWidth;
        
        // Restaurar transición y animar al valor real
        probBar2.style.transition = 'width 1s cubic-bezier(0.22, 1, 0.36, 1)';
        probBar2.style.width = `${p2.prob}%`;
    }
    
    if (odds2) odds2.textContent = p2.odds.toFixed(2);
    
    // Indicar favorito
    if (card1) {
        card1.classList.toggle('is-favorite', isP1Favorite);
    }
    if (card2) {
        card2.classList.toggle('is-favorite', !isP1Favorite);
    }
    
    if (fav1) {
        fav1.classList.toggle('is-favorite', isP1Favorite);
    }
    if (fav2) {
        fav2.classList.toggle('is-favorite', !isP1Favorite);
    }
    
    // ============================================
    // 🔹 ACTUALIZAR STATS
    // ============================================
    const statElo = document.getElementById('stat-elo-diff');
    const statConf = document.getElementById('stat-confidence');
    const statSurf = document.getElementById('stat-surface');
    const statTime = document.getElementById('stat-time');
    
    if (statElo) statElo.textContent = `+${eloDiff.toFixed(0)}`;
    if (statConf) statConf.textContent = getConfidence(eloDiff);
    if (statSurf) statSurf.textContent = `${getSurfaceName(surface)} • ${circuit.toUpperCase()}`;
    if (statTime) statTime.textContent = new Date(timestamp).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'});
    
    // ============================================
    // 🔹 ACTUALIZAR BADGE DE CIRCUITO
    // ============================================
    const circuitBadge = document.getElementById('results-circuit-badge');
    if (circuitBadge) circuitBadge.textContent = circuit.toUpperCase();
    
    // ============================================
    // 🔹 GENERAR RECOMENDACIÓN
    // ============================================
    generateRecommendation(data);
}

// ============================================
// 🔹 GENERAR RECOMENDACIÓN CON LÓGICA RATIO + UI PREMIUM
// ============================================
function generateRecommendation(data) {
    const { player1: p1, player2: p2, marketOdds, circuit } = data;
    
    // Elementos del DOM (versión simplificada)
    const recContainer = document.querySelector('.recommendation-premium');
    const recTypeBadge = document.getElementById('rec-type-badge');
    const recIcon = document.getElementById('rec-icon');
    const recTypeLabel = document.getElementById('rec-type-label');
    const recRatio = document.getElementById('rec-ratio');
    const ratioMarker = document.getElementById('ratio-marker');
    const markerLabel = document.getElementById('marker-label');
    const recTitle = document.getElementById('rec-title');
    const recDescription = document.getElementById('rec-description');
    
    // Nuevos elementos simplificados
    const recPickSimple = document.getElementById('rec-pick-simple');
    const recBetTextSimple = document.getElementById('rec-bet-text-simple');
    
    const btnCopy = document.getElementById('btn-copy-rec');
    
    if (!recContainer) return;
    
    // ============================================
    // 🔹 LÓGICA DE RATIO (Sin cambios)
    // ============================================
    const elo = { favorite: p1.prob > p2.prob ? p1.name : p2.name, odds: p1.prob > p2.prob ? p1.odds : p2.odds };
    const market = { favorite: marketOdds.player1 < marketOdds.player2 ? p1.name : p2.name, odds: marketOdds.player1 < marketOdds.player2 ? marketOdds.player1 : marketOdds.player2 };
    
    const eloFav = elo.favorite;
    const marketFav = market.favorite;
    const eloOdds = elo.odds;
    const marketOddsValue = market.odds;
    
    const underdog = eloFav === p1.name ? p2.name : p1.name;
    
    let recommendation;
    
    if (eloFav !== marketFav) {
        const ratio = marketOddsValue / eloOdds || 1.0;
        recommendation = {
            type: "inversion",
            label: "INVERSIÓN DE MERCADO",
            bet: "moneyline",
            pick: marketFav,
            line: null,
            ratio: ratio.toFixed(2),
            betText: `Victoria de ${marketFav}`,
            explanation: `El mercado favorece a ${marketFav} mientras que nuestro modelo ELO ve a ${eloFav} como favorito. Esta divergencia crea una oportunidad de inversión.`
        };
    } else {
        const ratio = marketOddsValue / eloOdds || 1.0;
        
        if (ratio >= 1.50) {
            const betType = circuit === 'challenger' ? 'over_games' : 'handicap';
            const line = circuit === 'challenger' ? 'Over 21.5' : '+2.5';
            const pick = circuit === 'challenger' ? 'Total Games' : underdog;
            
            recommendation = {
                type: "discrepancia",
                label: "DISCREPANCIA FUERTE",
                bet: betType,
                pick: pick,
                line: line,
                ratio: ratio.toFixed(2),
                betText: circuit === 'challenger' ? `Over 21.5 games` : `Handicap +2.5 para ${underdog}`,
                explanation: `Ratio muy alto (${ratio.toFixed(2)}x): el mercado subestima significativamente. ${circuit === 'challenger' ? 'Recomendamos Over 21.5 games.' : 'Recomendamos cubrir el underdog con handicap.'}`
            };
        } else if (ratio >= 1.25) {
            const betType = circuit === 'challenger' ? 'over_games' : 'handicap';
            const line = circuit === 'challenger' ? 'Over 21.5' : '+3.5';
            const pick = circuit === 'challenger' ? 'Total Games' : underdog;
            
            recommendation = {
                type: "discrepancia",
                label: "DISCREPANCIA",
                bet: betType,
                pick: pick,
                line: line,
                ratio: ratio.toFixed(2),
                betText: circuit === 'challenger' ? `Over 21.5 games` : `Handicap +3.5 para ${underdog}`,
                explanation: `Ratio moderado (${ratio.toFixed(2)}x): hay una ligera discrepancia. ${circuit === 'challenger' ? 'Partidos más competitivos esperados.' : 'Línea de handicap conservadora.'}`
            };
        } else if (ratio <= 0.85) {
            recommendation = {
                type: "validacion",
                label: "VALIDACIÓN DE MERCADO",
                bet: "moneyline",
                pick: marketFav,
                line: null,
                ratio: ratio.toFixed(2),
                betText: `Victoria de ${marketFav}`,
                explanation: `Ratio bajo (${ratio.toFixed(2)}x): mercado y ELO coinciden. Validación cruzada aumenta la confianza.`
            };
        } else {
            recommendation = {
                type: "neutro",
                label: "NEUTRO",
                bet: "espera",
                pick: null,
                line: null,
                ratio: ratio.toFixed(2),
                betText: "Neutro: Sin factores externos influyendo",
                explanation: `Ratio equilibrado (${ratio.toFixed(2)}x): sin divergencia significativa. Recomendamos esperar.`
            };
        }
    }
    
    // ============================================
    // 🔹 ACTUALIZAR UI (Elementos simplificados)
    // ============================================
    
    recContainer.setAttribute('data-type', recommendation.type);
    recTypeBadge.className = `rec-type-badge ${recommendation.type}`;
    
    const icons = {
        inversion: 'fa-exchange-alt',
        discrepancia: 'fa-exclamation-triangle',
        validacion: 'fa-check-circle',
        neutro: 'fa-pause-circle'
    };
    recIcon.className = `rec-icon fas ${icons[recommendation.type]}`;
    
    recTypeLabel.textContent = recommendation.label;
    recRatio.textContent = recommendation.ratio;
    recTitle.textContent = recommendation.label;
    recDescription.textContent = recommendation.explanation;
    
    // Actualizar elementos simplificados
    if (recPickSimple) recPickSimple.textContent = recommendation.pick || '—';
    if (recBetTextSimple) recBetTextSimple.textContent = recommendation.betText;
    
    // Posicionar marcador
    const ratioValue = parseFloat(recommendation.ratio);
    let markerPosition = 50;
    
    if (ratioValue <= 0.85) markerPosition = 10;
    else if (ratioValue < 1.25) markerPosition = 40;
    else if (ratioValue < 1.50) markerPosition = 70;
    else markerPosition = 95;
    
    ratioMarker.style.left = `${markerPosition}%`;
    markerLabel.textContent = recommendation.ratio;
    
    btnCopy.disabled = false;
    btnCopy.onclick = () => copyRecommendation(recommendation);
    
    recContainer.classList.add('updating');
    setTimeout(() => recContainer.classList.remove('updating'), 300);
}
    
    // ============================================
    // 🔹 ACTUALIZAR UI PREMIUM
    // ============================================
    
    // 1. Actualizar atributos y clases del contenedor
    recContainer.setAttribute('data-type', recommendation.type);
    recTypeBadge.className = `rec-type-badge ${recommendation.type}`;
    
    // 2. Icono por tipo
    const icons = {
        inversion: 'fa-exchange-alt',
        discrepancia: 'fa-exclamation-triangle',
        validacion: 'fa-check-circle',
        neutro: 'fa-pause-circle'
    };
    recIcon.className = `rec-icon fas ${icons[recommendation.type]}`;
    
    // 3. Labels y texto
    recTypeLabel.textContent = recommendation.label;
    recRatio.textContent = recommendation.ratio;
    recTitle.textContent = recommendation.label;
    recDescription.textContent = recommendation.explanation;
    recBetType.textContent = recommendation.bet === 'moneyline' ? 'Moneyline' : 
                            recommendation.bet === 'handicap' ? 'Handicap' : 
                            recommendation.bet === 'over_games' ? 'Over/Under Games' : 'Espera';
    recPick.textContent = recommendation.pick || '—';
    recBetText.textContent = recommendation.betText;
    
    // Línea (ocultar si es null)
    if (recommendation.line) {
        recLineRow.classList.remove('hidden');
        recLine.textContent = recommendation.line;
    } else {
        recLineRow.classList.add('hidden');
    }
    
    // 4. Posicionar marcador en barra visual
    const ratioValue = parseFloat(recommendation.ratio);
    let markerPosition = 50; // Default centro
    
    if (ratioValue <= 0.85) {
        markerPosition = 10; // Zona validación
    } else if (ratioValue < 1.25) {
        markerPosition = 40; // Zona neutro
    } else if (ratioValue < 1.50) {
        markerPosition = 70; // Zona discrepancia
    } else {
        markerPosition = 95; // Zona inversión
    }
    
    // Animar marcador
    ratioMarker.style.left = `${markerPosition}%`;
    markerLabel.textContent = recommendation.ratio;
    
    // 5. Habilitar botón copiar
    btnCopy.disabled = false;
    btnCopy.onclick = () => copyRecommendation(recommendation);
    
    // 6. Efecto de actualización
    recContainer.classList.add('updating');
    setTimeout(() => recContainer.classList.remove('updating'), 300);


// ============================================
// 🔹 COPIAR RECOMENDACIÓN AL PORTAPAPELES
// ============================================
function copyRecommendation(rec) {
    const text = `🎾 CourtSight Tennis\n\n${rec.label}\n📊 Ratio: ${rec.ratio}\n🎯 Apuesta: ${rec.betText}${rec.line ? `\n📏 Línea: ${rec.line}` : ''}\n💡 ${rec.explanation}`;
    
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btn-copy-rec');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> ¡Copiado!';
        btn.style.borderColor = 'var(--success)';
        btn.style.color = 'var(--success)';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.borderColor = '';
            btn.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('❌ Error al copiar:', err);
        showError('No se pudo copiar. Selecciona el texto manualmente.');
    });
}

function getConfidence(diff) { 
    if (diff >= 300) return 'Muy Alta'; 
    if (diff >= 200) return 'Alta'; 
    if (diff >= 100) return 'Media'; 
    return 'Baja'; 
}

function getSurfaceName(surface) { 
    return { hardOut: 'Dura', hardIndoor: 'Dura Indoor', clay: 'Arcilla', grass: 'Hierba' }[surface] || surface; 
}

// ============================================
// 🔹 HISTORIAL SIMPLE
// ============================================
function saveToHistory(data) {
    const item = {
        id: Date.now(),
        p1: data.player1.name,
        p2: data.player2.name,
        winner: data.player1.prob > data.player2.prob ? data.player1.name : data.player2.name,
        prob: Math.max(data.player1.prob, data.player2.prob),
        surface: currentSurface,
        circuit: currentCircuit,
        date: new Date(data.timestamp).toLocaleDateString('es-ES')
    };
    
    simulationHistory.unshift(item);
    if (simulationHistory.length > SIM_CONFIG.HISTORY_LIMIT) simulationHistory.pop();
    
    localStorage.setItem('courtSight_sim_history', JSON.stringify(simulationHistory));
    loadHistory();
}

function loadHistory() {
    try { 
        simulationHistory = JSON.parse(localStorage.getItem('courtSight_sim_history') || '[]'); 
    } catch { 
        simulationHistory = []; 
    }
    
    const list = document.getElementById('history-list');
    if (!list) return;
    
    if (simulationHistory.length === 0) { 
        list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Sin simulaciones recientes</p>';
        return; 
    }
    
    list.innerHTML = simulationHistory.map(item => `
        <div class="history-item">
            <div>
                <div class="players">${escapeHtml(item.p1)} vs ${escapeHtml(item.p2)}</div>
                <div class="meta">${item.circuit.toUpperCase()} • ${getSurfaceName(item.surface)} • ${item.date}</div>
            </div>
            <div class="winner">${escapeHtml(item.winner)} <span style="color:var(--accent)">(${item.prob.toFixed(1)}%)</span></div>
        </div>
    `).join('');
}

function resetSimulation() {
    player1 = null; 
    player2 = null;
    playerAdjustments[1] = { total: 0 }; 
    playerAdjustments[2] = { total: 0 };
    currentSimulationData = null;
    
    ['player1-selected', 'player2-selected'].forEach(id => 
        document.getElementById(id)?.classList.add('hidden')
    );
    ['player1-search', 'player2-search'].forEach(id => 
        document.getElementById(id)?.parentElement?.classList.remove('hidden')
    );
    
    document.getElementById('results')?.classList.add('hidden');
    document.getElementById('simulate-form')?.classList.remove('hidden');
    updateSimulateButton();
    
    // Resetear cuotas
    ['house1-odds1', 'house1-odds2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ============================================
// 🔹 UTILIDADES
// ============================================
function getElo(player, surface) { 
    return player?.elo?.[surface] || 0; 
}

function escapeHtml(text) { 
    if (!text) return ''; 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
}

function showError(msg) { 
    const el = document.getElementById('error-msg'); 
    if (!el) return; 
    el.textContent = msg; 
    el.classList.remove('hidden'); 
    setTimeout(() => el.classList.add('hidden'), 3000); 
}

function hideError() { 
    document.getElementById('error-msg')?.classList.add('hidden'); 
}