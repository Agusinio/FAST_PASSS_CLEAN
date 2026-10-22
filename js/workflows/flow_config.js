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
                // `?v=4`: estils compactes (setup.css, lletra d'11px com el panell).
                // `?v=7` (2026-10-22 · #178): el botó 📁 obri l'Explorador modern.
                // `?v=8` (2026-10-22 · #178b): cascada de Node també des del marc
                // pare (setup.html viu en un iframe) + traça a _pick_debug.log.
                // `?v=9` (2026-10-22 · #178b 3a): el transport que NO necessita
                // Node (`cep.process`), traça al log del panell i -OutFile al .ps1.
                // `?v=10` (2026-10-22 · #179): en guardar, el dashboard es tanca
                // (`closeSetup`) i es refresca el perfil en memòria.
                iframe.src = 'setup.html?v=10';
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
                // Netegem el src després de l'animació per fer un "reset" del estat del dashboard
                setTimeout(() => {
                    iframe.src = 'about:blank';
                }, 400); 
            }
        },

        /**
         * closeSetup: tanca el dashboard i torna al panell.
         *
         * (2026-10-22 · #179) Punt ÚNIC de tancament per a `setup.html`. Abans,
         * en guardar, el dashboard cridava `toggleSetup(false)` DESPRÉS de
         * `new CSXSEvent(...)`, i eixa classe no existix en el `CSInterface.js`
         * carregat → ReferenceError → la finestra es quedava oberta amb la
         * sensació que el desat no havia acabat.
         *
         * També REFRESCA el perfil en memòria: el panell llig `Profile.json` a
         * l'arrencada (`FASTPASS_UI.Config.loadProfile`), i sense este refresc
         * les rutes/programes acabats de desar no entraven fins a reiniciar.
         */
        closeSetup: function () {
            try {
                const C = window.FASTPASS_UI && window.FASTPASS_UI.Config;
                if (C && typeof C.loadProfile === 'function') C.loadProfile();
            } catch (eL) {
                console.warn('⚠️ [CONFIG] no s\'ha pogut refrescar Profile.json: ' +
                    ((eL && eL.message) || eL));
            }
            FASTPASS_UI.Workflows.Config.toggleSetup(false);
        }
    };

    window.FASTPASS_UI.Workflows.Config = FASTPASS_UI.Workflows.Config;
})();
