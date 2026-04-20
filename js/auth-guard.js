/* ============================================
🔒 AUTH GUARD - SIN REDIRECCIONES
✅ Valida token contra JSON local
✅ Controla visibilidad del Overlay y la App
============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('login-overlay');
    const appRoot = document.getElementById('app-root');
    const input = document.getElementById('token-input');
    const btn = document.getElementById('btn-access');
    const errorMsg = document.getElementById('login-error');
    
    // Inicializar estado
    checkSession();

    // Eventos del Login
    if (btn) btn.addEventListener('click', handleLogin);
    if (input) input.addEventListener('keypress', (e) => { if(e.key === 'Enter') handleLogin(); });

    async function checkSession() {
        const token = localStorage.getItem('courtSightToken');

        if (!token) {
            showLogin();
            return;
        }

        // Si hay token, validar que siga siendo válido en el JSON
        const isValid = await verifyTokenInJSON(token);

        if (isValid) {
            unlockApp();
        } else {
            // Token revocado
            localStorage.removeItem('courtSightToken');
            showLogin("Tu código ha sido revocado.");
        }
    }

    async function handleLogin() {
        const userToken = input.value.trim().toUpperCase();
        if (!userToken) return;

        setLoading(true);
        errorMsg.classList.add('hidden');

        const isValid = await verifyTokenInJSON(userToken);

        if (isValid) {
            localStorage.setItem('courtSightToken', userToken);
            unlockApp();
        } else {
            setLoading(false);
            input.value = '';
            errorMsg.textContent = "Código inválido";
            errorMsg.classList.remove('hidden');
            input.focus();
            // Efecto de vibración
            input.parentElement.animate([
                { transform: 'translateX(0)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(0)' }
            ], { duration: 300 });
        }
    }

    async function verifyTokenInJSON(token) {
        try {
            // Fetch al JSON. No usamos cache para verificar revocaciones al instante.
            const response = await fetch('data/a34r56.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('Error cargando tokens');
            
            const tokens = await response.json();
            return tokens.includes(token);
        } catch (error) {
            console.warn('⚠️ No se pudo validar online. Asumiendo sesión local si existe.');
            // Fallback: Si no hay internet, permitimos pasar si hay token guardado (Offline Mode)
            return localStorage.getItem('courtSightToken') === token;
        }
    }

    function showLogin(msg) {
        if (msg) {
            errorMsg.textContent = msg;
            errorMsg.classList.remove('hidden');
        }
        overlay.classList.remove('unlock');
        overlay.style.display = 'flex';
        appRoot.classList.add('hidden');
    }

    function unlockApp() {
        overlay.classList.add('unlock');
        appRoot.classList.remove('hidden');
        
        // Iniciar lógica de la app una vez visible
        if (window.CourtSight && typeof window.CourtSight.initConnectionStatus === 'function') {
            window.CourtSight.initConnectionStatus();
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            btn.disabled = true;
            btn.querySelector('.btn-text').textContent = "VALIDANDO...";
        } else {
            btn.disabled = false;
            btn.querySelector('.btn-text').textContent = "ACCEDER";
        }
    }
});