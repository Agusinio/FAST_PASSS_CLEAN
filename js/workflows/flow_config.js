/**
 * ============================================================================
 * WORKFLOW: CONFIG (CONFIGURACIÓ) - v1.0.0
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Workflows = FASTPASS_UI.Workflows || {};

    FASTPASS_UI.Workflows.Config = {
        /**
         * toggleSetup: Mostra o amaga el dashboard de configuració en un overlay.
         * @param {boolean} show - Cert per mostrar, fals per amagar.
         */
        toggleSetup: function (show) {
            const overlay = document.getElementById('setup-overlay');
            const iframe = document.getElementById('setup-iframe');
            
            if (!overlay || !iframe) {
                console.error("❌ [CONFIG] No s'ha trobat l'overlay o l'iframe de configuració.");
                return;
            }

            if (show) {
                window.FASTPASS_UI.Utils.log("⚙️ Obrint Dashboard de Configuració...", "INFO");
                // (2026-10-21 · #176) `?v=2` perque CEF no servisca una copia vella:
                // acabem de corregir la ruta de `CSInterface.js` a `setup.html`.
                iframe.src = 'setup.html?v=2';
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
                // Netegem el src després de l'animació per fer un "reset" del estat del dashboard
                setTimeout(() => {
                    iframe.src = 'about:blank';
                }, 400); 
            }
        }
    };

    window.FASTPASS_UI.Workflows.Config = FASTPASS_UI.Workflows.Config;
})();
