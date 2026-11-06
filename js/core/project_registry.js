/**
 * ============================================================================
 * PROJECTE REGISTRY (js/core/project_registry.js)
 * Detecta canvis de projecte actiu a Premiere i adapta l'UI del panell.
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};

    const POLL_KEY = "fp_last_project";

    FASTPASS_UI.Registry = {

        // Taula de projectes compatibles detectats: { projectName: true }
        table: {},

        // Nom del projecte ancorat actualment
        activeProjectName: null,

        /**
         * _nameOf: (2026-11-05 · #244) Nom d'un element de `Context.list()`.
         *
         * PER QUÈ EXISTIX: `Context.list()` (pont JSX → `Context.getOpenNames`)
         * retorna un ARRAY DE STRINGS ('["Pruebas_TNC_V1_….prproj", …]'), però este
         * mòdul llegia `p.name` i `projects[0].name` com si foren OBJECTES. Amb
         * `p.name` = undefined, `_isCompatible(undefined)` petava a `.toLowerCase()`
         * DINS del `try` del poll i el cicle moria **en silenci** cada 2 s:
         *   · el projecte no s'ancorava mai (`activeProjectName` sempre null → el
         *     guardià de 15 s de `main.js` desancorava `State.projectDateDir` i
         *     `lastOpenedProjectName` just després d'obrir un projecte),
         *   · els botons de flux no s'habilitaven (`_setWorkflowEnabled`),
         *   · el botó MAIN no es repintava en canviar de projecte.
         * S'accepten les dos formes (string o `{name}`) perquè el contracte el fixa
         * el pont i no volem que torne a trencar-se en silenci.
         */
        _nameOf: function (p) {
            if (!p) return null;
            if (typeof p === 'string') return p;
            return p.name || null;
        },

        /**
         * Comprova si un nom de projecte de Premiere és compatible.
         * "Compatible" = el nom conté el keyword de algun programa definit a config.
         */
        _isCompatible: function (projectName) {
            const cfg = FASTPASS_UI.Config.get();
            if (!cfg || !cfg.mapeoProgramas) return false;
            // (#244) Guarda: un nom buit o no-string no pot arribar a `.toLowerCase()`.
            if (typeof projectName !== 'string' || !projectName) return false;
            for (var key in cfg.mapeoProgramas) {
                var prog = cfg.mapeoProgramas[key];
                var tokenArchivo = prog.archivo.toLowerCase();
                var tokenWott = prog.wott.toLowerCase();
                var name = projectName.toLowerCase();
                if (name && (name.indexOf(tokenArchivo) !== -1 || name.indexOf(tokenWott) !== -1)) {
                    console.log('✅ [Registry] Proyecto compatible:', projectName, 'tokenArchivo:', tokenArchivo, 'tokenWott:', tokenWott);
                    return true;
                }
            }
            console.log('❌ [Registry] Proyecto NO compatible:', projectName);
            return false;
        },

        // ── OPTIMITZACIÓ DEL POLL ──────────────────────────────────────────
        // El poll fa una crida JSX (Context.list()) per detectar canvis de projecte.
        // main.js l'invoca cada 500 ms, però detectar un canvi de projecte no
        // necessita aquesta freqüència: es limita a un cicle cada POLL_MIN_MS i
        // s'evita el solapament (mai dues crides JSX vives alhora).
        POLL_MIN_MS: 2000,
        _lastPollAt: 0,
        _pollInFlight: false,

        /**
         * Cicle de poll principal: cridat cada 500ms des del setInterval de main.js.
         * Internament limitat a un cicle cada POLL_MIN_MS (2 s).
         */
        poll: async function () {
            var now = Date.now();
            if (this._pollInFlight) return;
            if (now - this._lastPollAt < this.POLL_MIN_MS) return;
            this._lastPollAt = now;
            this._pollInFlight = true;
            try {
                // Verificación de seguridad: si el motor JSX no está listo, saltamos este ciclo
                if (!FASTPASS_UI.Utils || !FASTPASS_UI.Utils.isJsxReady) return;

                const raw = await FASTPASS_UI.Utils.callJSX("Context.list()");
                if (!raw || raw === "[]") {
                    // Si no hay proyectos abiertos, reseteamos el estado interno
                    if (this.activeProjectName !== null) {
                        this.activeProjectName = null;
                        this._onProjectChange(null);
                    }
                    return;
                }

                const projects = JSON.parse(raw);

                // 1. Actualitzar la taula de projectes compatibles
                this.table = {};
                for (const p of projects) {
                    const pName = this._nameOf(p);   // (#244) string o {name}
                    if (pName && this._isCompatible(pName)) {
                        this.table[pName] = p;
                    }
                }

                // 2. Detectar quin és l'actiu de Premiere (el primer de la llista des de l'API)
                // Premiere retorna els projectes en l'ordre en que l'usuari hi ha fet focus
                const currentPremiereFocusName = this._nameOf(projects[0]);

                // 3. Si el projecte en focus no ha canviat, no fem res
                if (currentPremiereFocusName === this.activeProjectName) return;

                this.activeProjectName = currentPremiereFocusName;
                this._onProjectChange(currentPremiereFocusName);

            } catch (e) {
                // Silent fail: el polling no ha d'interrompre l'usuari
            } finally {
                this._pollInFlight = false;
            }
        },

        /**
         * Reacció al canvi de projecte actiu.
         */
        _onProjectChange: async function (projectName) {
            const utils = FASTPASS_UI.Utils;
            const isCompat = this._isCompatible(projectName);

            if (isCompat) {
                // Ancorar el projecte al motor JSX
                await utils.callJSX(`Context.set('${utils.escape(projectName)}')`);

                // Actualitzar la barra d'estat
                utils.status(`🟢 Actiu: ${projectName.substring(0, 25)}`, "exito");
                // utils.log(`🔄 [Registry] Canvi de projecte -> ${projectName} (COMPATIBLE)`, "INFO");

                // Habilitar tots els botons de workflow
                this._setWorkflowEnabled(true);

                // 📍 REACTIVITAT: Forçar el recalculo del botó principal
                if (FASTPASS_UI.Core && FASTPASS_UI.Core.Context) {
                    FASTPASS_UI.Core.Context.checkContext();
                }

            } else {
                // Desancorar: en qualsevol operació el guard del JSX protegirà
                utils.status("⚫ Projecte no compatible", "debug");
                // utils.log(`⚫ [Registry] Canvi de projecte -> ${projectName} (INACTIU)`, "INFO");

                // Inhabilitaem els botons de workflow
                this._setWorkflowEnabled(false);
            }
        },

        /**
         * Habilita o inhabilita els botons de workflow (tot excepte selectors i btnMain).
         */
        _setWorkflowEnabled: function (enabled) {
            console.log('🔄 [Registry] _setWorkflowEnabled:', enabled);
            const workflowButtonIds = [
                'btnIn', 'btnOut', 'btnScene',
                'btnPrevClip', 'btnNextClip', 'btnCenter', 'btnKey',
                'btnPlaceChyrons', 'btnPlaceGraph169', 'btnBg', 'btnDiag',
                'btnSrtWork', 'btnSrtIn', 'btnSrtOut', 'btnTimeAdjust',
                'btnRenderVideo', 'btnRenderPortada',
                'slider-move'
            ];
            for (const id of workflowButtonIds) {
                const el = document.getElementById(id);
                if (el) {
                    el.disabled = !enabled;
                    // Opcional: añadir clase visual para feedback
                    if (!enabled) el.classList.add('registry-disabled');
                    else el.classList.remove('registry-disabled');
                }
            }
            // 📍 NUNCA tocamos el 'btnMainAction' aquí, ya que su estado lo gestiona Core.Context
        }
    };

    window.FASTPASS_UI = FASTPASS_UI;
})();
