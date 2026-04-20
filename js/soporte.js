/* ============================================
COURT SIGHT TENNIS - SOPORTE JS v1.0
🎨 TEMA: PRO CIRCUIT DARK | UI PREMIUM
✅ Interacciones básicas + accesibilidad
============================================ */

document.addEventListener('DOMContentLoaded', () => {
    initFAQ();
    initContactButtons();
    console.log('🛠️ Soporte JS v1.0 ✅ UI lista. Funcionalidades activas.');
});

/* ============================================
🔹 FAQ: ACORDEÓN CON ANIMACIÓN
============================================ */
function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const summary = item.querySelector('summary');
        
        summary.addEventListener('click', (e) => {
            // Prevenir comportamiento por defecto para controlar animación
            e.preventDefault();
            
            // Cerrar otros items abiertos (opcional: comportamiento de acordeón único)
            faqItems.forEach(other => {
                if (other !== item && other.open) {
                    other.open = false;
                }
            });
            
            // Toggle del item actual
            item.open = !item.open;
            
            // Animación suave del contenido
            const content = item.querySelector('p');
            if (content) {
                content.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                if (item.open) {
                    content.style.opacity = '0';
                    content.style.transform = 'translateY(-8px)';
                    requestAnimationFrame(() => {
                        content.style.opacity = '1';
                        content.style.transform = 'translateY(0)';
                    });
                }
            }
        });
        
        // Accesibilidad: navegación por teclado
        summary.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                summary.click();
            }
        });
    });
}

/* ============================================
🔹 BOTONES DE CONTACTO: TRACKING (Opcional)
============================================ */
function initContactButtons() {
    const contactLinks = document.querySelectorAll('a[href*="t.me/EltonAli05"]');
    
    contactLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // 🔹 Aquí podrías agregar analytics o logging
            console.log('📬 Contacto Telegram iniciado');
            
            // En producción, podrías guardar en localStorage:
            // localStorage.setItem('cs_support_contacted', Date.now().toString());
        });
    });
}

/* ============================================
🔹 UTILIDADES: COPY TO CLIPBOARD (Opcional)
============================================ */
// function copyTelegramHandle() {
//     navigator.clipboard.writeText('@EltonAli05').then(() => {
//         // Mostrar toast de confirmación
//         showToast('✅ @EltonAli05 copiado al portapapeles');
//     }).catch(err => {
//         console.error('❌ Error al copiar:', err);
//     });
// }

// function showToast(message) {
//     const toast = document.createElement('div');
//     toast.className = 'toast';
//     toast.textContent = message;
//     toast.style.cssText = `
//         position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
//         background: var(--bg-card); border: 1px solid var(--border);
//         padding: 0.75rem 1.5rem; border-radius: var(--radius-md);
//         color: var(--text-primary); font-size: 0.9rem; z-index: 2000;
//         box-shadow: var(--shadow-lg); animation: fadeInUp 0.3s ease;
//     `;
//     document.body.appendChild(toast);
//     setTimeout(() => toast.remove(), 3000);
// }