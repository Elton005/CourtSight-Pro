/* ============================================
COURT SIGHT TENNIS - SIMULADOR JS v1.0
🎨 TEMA: PRO CIRCUIT DARK | UI PREMIUM
✅ Lógica de pestañas + Hooks listos para motores
============================================ */

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    // 🔮 Hooks para futuro desarrollo:
    // initLiveSimEngine();
    // initCustomSimEngine();
    console.log('🎾 Simulador JS v1.0 ✅ UI lista. Motores en standby.');
});

/* ============================================
🔹 GESTIÓN DE PESTAÑAS
============================================ */
function initTabs() {
    const tabs = document.querySelectorAll('.sim-tab');
    const panels = document.querySelectorAll('.sim-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.target;
            
            // 1. Actualizar estado de pestañas
            tabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            // 2. Cambiar paneles con transición
            panels.forEach(panel => {
                panel.classList.remove('active');
                panel.hidden = true;
            });

            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.hidden = false;
                // Pequeño delay para permitir que el navegador procese el hidden=false antes de añadir active
                requestAnimationFrame(() => {
                    targetPanel.classList.add('active');
                });
            }
        });

        // Accesibilidad: navegación por teclado
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

/* ============================================
🔮 HOOKS PARA MOTORES FUTUROS
============================================ */
// function initLiveSimEngine() {
//     console.log('⚡ Iniciando Motor Live...');
//     // 1. Cargar partido desde pronósticos.json
//     // 2. Aplicar condicionales (breaks, games, superficie)
//     // 3. Calcular movimiento de cuotas esperado
//     // 4. Renderizar gráfico en tiempo real
// }

// function initCustomSimEngine() {
//     console.log('🧪 Iniciando Laboratorio Challenger...');
//     // 1. Formulario de selección de jugadores
//     // 2. Inputs para ELO manual y peso de superficie
//     // 3. Motor Monte Carlo (10k iteraciones)
//     // 4. Exportar resultados a JSON/CSV
// }