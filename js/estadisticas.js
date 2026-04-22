/* ============================================
COURT SIGHT TENNIS - ESTADÍSTICAS JS v1.0
📊 Cálculo de Yield, WinRate, ROI + Gráficos Canvas
💰 Parámetros: Bank 2000€, Validaciones 200€, Inversiones/Discrepancias 100€ @1.50
✅ Offline-first: gráficos con Canvas nativo (sin dependencias)
============================================ */

// ============================================
// 🔹 CONFIGURACIÓN
// ============================================
const STATS_CONFIG = {
    // Parámetros de apuestas
    BANK_INITIAL: 2000,
    STAKE_VALIDACION: 200,
    STAKE_INVERSION: 100,
    STAKE_DISCREPANCIA: 100,
    ODDS_DISCREPANCIA: 1.50, // Cuota fija para discrepancias
    
    // Fuentes de datos
    PRONOSTICOS_URL: '../data/pronosticos.json',
    
    // Gráficos
    CHART_COLORS: {
        validacion: '#10b981',
        inversion: '#38bdf8',
        discrepancia: '#f59e0b',
        bank: '#b8d432'
    },
    CHART_GRID: 'rgba(51, 65, 85, 0.4)',
    CHART_TEXT: '#94a3b8'
};

// ============================================
// 🔹 ESTADO GLOBAL
// ============================================
let pronosticos = [];
let stats = {
    general: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 },
    validacion: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 },
    inversion: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 },
    discrepancia: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 }
};

// ============================================
// 🔹 INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadPronosticos();
});

// ============================================
// 📥 CARGA DE DATOS
// ============================================
async function loadPronosticos() {
    try {
        const response = await fetch(STATS_CONFIG.PRONOSTICOS_URL);
        if (!response.ok) throw new Error('HTTP Error');
        pronosticos = await response.json();
        console.log(`📥 ${pronosticos.length} pronósticos cargados`);
        
        calculateStats();
        renderKPIs();
        renderCharts();
        renderSummaryTable();
        
        // Mostrar/ocultar estado sin datos
        const hasData = stats.general.total > 0;
        document.getElementById('no-data-state').classList.toggle('hidden', hasData);
        document.querySelector('.kpi-grid').classList.toggle('hidden', !hasData);
        document.querySelector('.chart-section').classList.toggle('hidden', !hasData);
        document.querySelector('.scenarios-grid').classList.toggle('hidden', !hasData);
        document.querySelector('.summary-section').classList.toggle('hidden', !hasData);
        
    } catch (error) {
        console.error('❌ Error cargando estadísticas:', error);
        document.getElementById('no-data-state').classList.remove('hidden');
    }
}

// ============================================
// 🧮 CÁLCULO DE ESTADÍSTICAS
// ============================================
function calculateStats() {
    // Resetear stats
    stats = {
        general: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 },
        validacion: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 },
        inversion: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 },
        discrepancia: { total: 0, aciertos: 0, stake: 0, retorno: 0, beneficio: 0 }
    };
    
    // Procesar cada pronóstico con resultado conocido
    pronosticos.forEach(p => {
        // Solo considerar partidos finalizados con predictionCorrect definido
        if (!p.result?.winner || p.predictionCorrect === undefined) return;
        
        const scenario = p.betting_recommendation?.type;
        if (!scenario || !['validacion', 'inversion', 'discrepancia', 'neutro'].includes(scenario)) return;
        
        // Determinar stake y cuota según escenario
        let stake, odds;
        if (scenario === 'validacion') {
            stake = STATS_CONFIG.STAKE_VALIDACION;
            odds = p.market?.odds || 1;
        } else if (scenario === 'inversion') {
            stake = STATS_CONFIG.STAKE_INVERSION;
            odds = p.market?.odds || 1;
        } else if (scenario === 'discrepancia') {
            stake = STATS_CONFIG.STAKE_DISCREPANCIA;
            odds = STATS_CONFIG.ODDS_DISCREPANCIA; // Cuota fija
        } else {
            return; // Neutro no se apuesta
        }
        
        const isWinner = p.predictionCorrect === true;
        const retorno = isWinner ? stake * odds : 0;
        const beneficio = retorno - stake;
        
        // Actualizar stats generales
        stats.general.total++;
        stats.general.stake += stake;
        stats.general.retorno += retorno;
        stats.general.beneficio += beneficio;
        if (isWinner) stats.general.aciertos++;
        
        // Actualizar stats por escenario
        const s = stats[scenario];
        s.total++;
        s.stake += stake;
        s.retorno += retorno;
        s.beneficio += beneficio;
        if (isWinner) s.aciertos++;
    });
    
    // Calcular métricas derivadas
    ['general', 'validacion', 'inversion', 'discrepancia'].forEach(key => {
        const s = stats[key];
        s.winRate = s.total > 0 ? (s.aciertos / s.total) * 100 : 0;
        s.yield = s.stake > 0 ? (s.beneficio / s.stake) * 100 : 0;
        s.roi = s.stake > 0 ? (s.beneficio / s.stake) * 100 : 0;
    });
    
    console.log('📊 Estadísticas calculadas:', stats);
}

// ============================================
// 📊 RENDERIZAR KPIs
// ============================================
function renderKPIs() {
    const g = stats.general;
    const bankActual = STATS_CONFIG.BANK_INITIAL + g.beneficio;
    
    // Bank
    document.getElementById('kpi-bank').textContent = formatMoney(bankActual);
    const bankDelta = document.getElementById('kpi-bank-delta');
    bankDelta.textContent = (g.beneficio >= 0 ? '+' : '') + formatMoney(g.beneficio);
    bankDelta.className = `kpi-delta ${g.beneficio >= 0 ? 'positive' : 'negative'}`;
    
    // Yield
    document.getElementById('kpi-yield').textContent = g.yield.toFixed(1) + '%';
    document.getElementById('kpi-yield-delta').textContent = g.yield >= 0 ? '▲' : '▼';
    
    // Win Rate
    document.getElementById('kpi-winrate').textContent = g.winRate.toFixed(1) + '%';
    document.getElementById('kpi-winrate-detail').textContent = `${g.aciertos}/${g.total} aciertos`;
    
    // ROI
    document.getElementById('kpi-roi').textContent = g.roi.toFixed(1) + '%';
    document.getElementById('kpi-roi-detail').textContent = formatMoney(g.stake) + ' invertidos';
}

// ============================================
// 📈 RENDERIZAR GRÁFICOS (Canvas nativo)
// ============================================
function renderCharts() {
    renderBankEvolutionChart();
    renderScenarioChart('validacion', 'chart-validaciones');
    renderScenarioChart('inversion', 'chart-inversiones');
    renderScenarioChart('discrepancia', 'chart-discrepancias');
}

// Gráfico principal: Evolución del Bank
function renderBankEvolutionChart() {
    const canvas = document.getElementById('bank-evolution-chart');
    const empty = document.getElementById('chart-empty');
    
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    
    // Limpiar canvas
    ctx.clearRect(0, 0, w, h);
    
    // Si no hay datos, mostrar mensaje
    if (stats.general.total === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');
    
    // Calcular puntos del gráfico (evolución acumulada)
    const points = [];
    let bank = STATS_CONFIG.BANK_INITIAL;
    
    // Ordenar pronósticos por fecha para evolución temporal
    const sorted = [...pronosticos]
        .filter(p => p.result?.winner && p.predictionCorrect !== undefined)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    sorted.forEach(p => {
        const scenario = p.betting_recommendation?.type;
        if (!['validacion', 'inversion', 'discrepancia'].includes(scenario)) return;
        
        let stake, odds;
        if (scenario === 'validacion') { stake = STATS_CONFIG.STAKE_VALIDACION; odds = p.market?.odds || 1; }
        else if (scenario === 'inversion') { stake = STATS_CONFIG.STAKE_INVERSION; odds = p.market?.odds || 1; }
        else { stake = STATS_CONFIG.STAKE_DISCREPANCIA; odds = STATS_CONFIG.ODDS_DISCREPANCIA; }
        
        if (p.predictionCorrect) bank += stake * (odds - 1);
        else bank -= stake;
        
        points.push({ date: p.date, bank });
    });
    
    if (points.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    
    // Escalas
    const banks = points.map(p => p.bank);
    const minBank = Math.min(...banks, STATS_CONFIG.BANK_INITIAL);
    const maxBank = Math.max(...banks, STATS_CONFIG.BANK_INITIAL);
    const range = maxBank - minBank || 1;
    
    // Dibujar grid
    ctx.strokeStyle = STATS_CONFIG.CHART_GRID;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    // Líneas horizontales
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH * i / 4);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        
        // Etiquetas Y
        const value = maxBank - (range * i / 4);
        ctx.fillStyle = STATS_CONFIG.CHART_TEXT;
        ctx.font = '10px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(formatMoneyCompact(value), padding.left - 10, y + 3);
    }
    
    ctx.setLineDash([]);
    
    // Dibujar línea de bank inicial
    const yInitial = padding.top + chartH - ((STATS_CONFIG.BANK_INITIAL - minBank) / range * chartH);
    ctx.strokeStyle = 'rgba(184, 212, 50, 0.3)';
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, yInitial);
    ctx.lineTo(w - padding.right, yInitial);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Dibujar línea de evolución
    ctx.strokeStyle = STATS_CONFIG.CHART_COLORS.bank;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    points.forEach((p, i) => {
        const x = padding.left + (chartW * i / Math.max(points.length - 1, 1));
        const y = padding.top + chartH - ((p.bank - minBank) / range * chartH);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Rellenar área bajo la línea
    ctx.lineTo(w - padding.right, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = STATS_CONFIG.CHART_COLORS.bank.replace(')', ', 0.1)').replace('rgb', 'rgba');
    ctx.fill();
    
    // Puntos finales
    ctx.fillStyle = STATS_CONFIG.CHART_COLORS.bank;
    points.forEach((p, i) => {
        const x = padding.left + (chartW * i / Math.max(points.length - 1, 1));
        const y = padding.top + chartH - ((p.bank - minBank) / range * chartH);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Eje X: etiquetas de fecha (simplificado)
    ctx.fillStyle = STATS_CONFIG.CHART_TEXT;
    ctx.font = '9px Inter';
    ctx.textAlign = 'center';
    if (points.length > 0) {
        ctx.fillText('Inicio', padding.left, h - 10);
        ctx.fillText('Actual', w - padding.right, h - 10);
    }
}

// Gráficos por escenario (barras simples)
function renderScenarioChart(scenario, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    const w = rect.width;
    const h = rect.height;
    const s = stats[scenario];
    
    // Limpiar
    ctx.clearRect(0, 0, w, h);
    
    // Si no hay datos
    if (s.total === 0) {
        ctx.fillStyle = STATS_CONFIG.CHART_TEXT;
        ctx.font = '12px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos', w / 2, h / 2);
        return;
    }
    
    // Parámetros del gráfico de barras
    const barWidth = 40;
    const gap = 20;
    const totalWidth = barWidth * 2 + gap;
    const startX = (w - totalWidth) / 2;
    const maxHeight = h - 40;
    
    // Calcular alturas normalizadas
    const maxVal = Math.max(s.stake, s.retorno, 1);
    const stakeHeight = (s.stake / maxVal) * maxHeight;
    const retornoHeight = (s.retorno / maxVal) * maxHeight;
    
    // Dibujar barra de stake (invertido)
    const color = STATS_CONFIG.CHART_COLORS[scenario];
    ctx.fillStyle = color.replace(')', ', 0.3)').replace('rgb', 'rgba');
    ctx.fillRect(startX, h - 20 - stakeHeight, barWidth, stakeHeight);
    
    // Borde de stake
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, h - 20 - stakeHeight, barWidth, stakeHeight);
    
    // Dibujar barra de retorno
    ctx.fillStyle = color.replace(')', ', 0.6)').replace('rgb', 'rgba');
    ctx.fillRect(startX + barWidth + gap, h - 20 - retornoHeight, barWidth, retornoHeight);
    ctx.strokeStyle = color;
    ctx.strokeRect(startX + barWidth + gap, h - 20 - retornoHeight, barWidth, retornoHeight);
    
    // Etiquetas
    ctx.fillStyle = STATS_CONFIG.CHART_TEXT;
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Stake', startX + barWidth/2, h - 5);
    ctx.fillText('Retorno', startX + barWidth + gap + barWidth/2, h - 5);
    
    // Valores sobre barras
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Inter';
    ctx.fillText(formatMoneyCompact(s.stake), startX + barWidth/2, h - 25 - stakeHeight);
    ctx.fillText(formatMoneyCompact(s.retorno), startX + barWidth + gap + barWidth/2, h - 25 - retornoHeight);
}

// ============================================
// 📋 RENDERIZAR TABLA RESUMEN
// ============================================
function renderSummaryTable() {
    const tbody = document.getElementById('summary-body');
    if (!tbody) return;
    
    const rows = [
        { 
            name: 'Validaciones', 
            key: 'validacion', 
            color: 'var(--scenario-validacion)',
            stakeLabel: '200€'
        },
        { 
            name: 'Inversiones', 
            key: 'inversion', 
            color: 'var(--scenario-inversion)',
            stakeLabel: '100€'
        },
        { 
            name: 'Discrepancias', 
            key: 'discrepancia', 
            color: 'var(--scenario-discrepancia)',
            stakeLabel: '100€ @1.50'
        }
    ];
    
    tbody.innerHTML = rows.map(r => {
        const s = stats[r.key];
        const yieldClass = s.yield >= 0 ? 'positive' : 'negative';
        
        return `
            <tr>
                <td><span style="color:${r.color}">●</span> ${r.name}<br><small style="color:var(--text-muted)">${r.stakeLabel}</small></td>
                <td class="mono">${s.total}</td>
                <td class="mono">${s.aciertos}</td>
                <td class="mono">${s.winRate.toFixed(1)}%</td>
                <td class="mono">${formatMoney(s.stake)}</td>
                <td class="mono">${formatMoney(s.retorno)}</td>
                <td class="mono ${s.beneficio >= 0 ? 'positive' : 'negative'}">${(s.beneficio >= 0 ? '+' : '') + formatMoney(s.beneficio)}</td>
                <td class="mono ${yieldClass}">${s.yield.toFixed(1)}%</td>
            </tr>
        `;
    }).join('');
}

// ============================================
// 🔧 UTILIDADES
// ============================================
function formatMoney(amount) {
    return new Intl.NumberFormat('es-ES', { 
        style: 'currency', 
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatMoneyCompact(amount) {
    if (Math.abs(amount) >= 1000) {
        return (amount / 1000).toFixed(1) + 'k€';
    }
    return Math.round(amount) + '€';
}

// ============================================
// 🔄 ACTUALIZACIÓN EN TIEMPO REAL (Opcional)
// ============================================
// Para actualizar stats cuando se complete un nuevo partido:
// window.updateStats = (newPronostico) => {
//     if (newPronostico.result?.winner && newPronostico.predictionCorrect !== undefined) {
//         calculateStats();
//         renderKPIs();
//         renderCharts();
//         renderSummaryTable();
//     }
// };

console.log('📊 Estadísticas JS v1.0 ✅ Cálculos + Gráficos Canvas nativo');