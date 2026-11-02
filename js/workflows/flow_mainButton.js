/**
 * ============================================================================
 * WORKFLOW: MAIN BUTTON - v2.6.0 literal
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Workflows = FASTPASS_UI.Workflows || {};

    const getUtils = () => window.FASTPASS_UI.Utils;
    const log = (...args) => getUtils().log(...args);
    const callJSX = (s) => getUtils().callJSX(s);

    /**
     * toManifestItems: Converteix les línies de l'escaleta del bloc
     * (`jsonData.escaleta.liniesEscaleta`) a la forma PERSISTIDA del master
     * `escaletaItems` del manifest v2.0.
     *
     * (2026-10-15 · F6c) ÚNIC lloc on es defineix la forma del master: els tres
     * escriptors de «Muntar» (camí de precisió, camí de fallback i
     * reconstrucció) la compartien copiada-i-engolida; ara tots tres criden
     * aquest helper perquè no divergeixin.
     *
     * Qui consumeix aquest master:
     *   · `SessionManifest.getItems()` → `getEscaletaItems()` (el master mana
     *     sobre el mirall `analysis.escaleta.itemsBloc` i sobre la vista).
     *   · `SessionManifest.save()` → `_rebuild()` →
     *     `AnalysisCenter.composeStructure()`, que reconstrueix la vista
     *     `manifest.structure` a partir d'aquestes línies (finestres, clips,
     *     rètols i gràfics per ítem). Per tant: si s'hi afegeix un camp, la
     *     vista el veurà; si se n'hi treu, la vista el perdrà.
     * @param {Array<Object>} allItems - línies de l'escaleta (JSON del bloc)
     * @returns {Array<Object>} ítems del master `escaletaItems`
     */
    function toManifestItems(allItems) {
        if (!Array.isArray(allItems)) return [];
        return allItems.map(function (l) {
            const it = l || {};
            return {
                sequencia: it.sequencia,
                num: it.num,
                titol: it.titol,
                teVideo: it.teVideo,
                horaEntradaOnAir: it.horaEntradaOnAir,
                horaEntradaPrevista: it.horaEntradaPrevista,
                horaSortidaPrevista: it.horaSortidaPrevista,
                duradaOnAir: it.duradaOnAir,
                durada: it.durada,
                agrupacio: it.agrupacio,
                flotant: it.flotant || false
            };
        });
    }

    FASTPASS_UI.Workflows.MainButton = {

        runMainAction: async function (action, data) {
            getUtils().clearLogFile();
            log(`⏯️ Iniciant workflow: [${action}]`);
            log(`🔧 [DIAG] FASTEPASS v2.6.0+EXTRACT | FlowMainButton carregat | Versió de codi: EXTRACT_2026-07-27`);
            log(`🔧 [DIAG] window.FASTPASS_UI.Logic.FFmpeg existeix? ${!!(window.FASTPASS_UI && window.FASTPASS_UI.Logic && window.FASTPASS_UI.Logic.FFmpeg)}`);
            log(`🔧 [DIAG] FFmpeg.extractClip existeix? ${!!(window.FASTPASS_UI && window.FASTPASS_UI.Logic && window.FASTPASS_UI.Logic.FFmpeg && typeof window.FASTPASS_UI.Logic.FFmpeg.extractClip === 'function')}`);
            getUtils().updateUIState('BUSY');

            // (2026-11-02 · BUG #215) Rellotge d'espera al botó MAIN mentre dura el
            // flux (CREAR/ACTUALITZAR pot dur minuts). Abans, si una crida al motor
            // de Premiere es quedava penjada (diàleg «Import Files»), el botó seguia
            // amb la seua etiqueta i el panell semblava mort.
            const _btnMain = document.getElementById('btnMainAction');
            const _uiApi = (window.FASTPASS_UI && window.FASTPASS_UI.UI) || null;
            if (_uiApi && _uiApi.markBtnBusy && _btnMain) _uiApi.markBtnBusy(_btnMain);

            try {
                switch (action) {
                    case 'NEW': await this._runNew(); break;
                    case 'UPDATE': await this._runUpdate(); break;
                    case 'LOAD': await this._runLoad(data); break;
                    case 'GO': await this._runGo(data); break;
                }
                getUtils().status('Procés completat!', 'exito');
            } catch (e) {
                getUtils().handleError(e, "MainAction");
            } finally {
                if (_uiApi && _uiApi.clearBtnBusy && _btnMain) _uiApi.clearBtnBusy(_btnMain);
                getUtils().updateUIState('READY');
            }
        },

        /**
         * runReset: (2026-10-07, revisat 2026-10-21) RESET GENERAL del bloc seleccionat.
         * Des de la cantonada superior esquerra (sobre INICI, a l'esquerra del
         * semafor ESC) fa, en ordre:
         *   1) Tanca el projecte del bloc seleccionat si esta obert a Premiere i
         *      espera que Windows allibere el .prproj i l'Auto-Save.
         *   2) ESBORRA ABSOLUTAMENT la carpeta del bloc
         *      (<base><prog>_PROJECTES/<data>/<V*>): projecte, escaleta local,
         *      MP4, manifest, snapshots, analisi, subtitols, marcadors, logs...
         *      (2026-10-21) Amb VERIFICACIO: si en queda alguna resta NO es crea
         *      res i s'avisa l'usuari. Abans s'avisava i es continuava, i el flux
         *      NOU treballava sobre material vell (mes problemes que solucions).
         *   3) Buida tambe les copies de marcadors de subtitols que viuen FORA de
         *      la carpeta (respatller C:/temp de l'editor SRT): sobreviuen a
         *      l'esborrat i es podrien re-injectar al projecte nou.
         *   4) Reinicia la sessio (State.reset preservant HOY/AHIR) i torna a crear
         *      el projecte de zero (flux NOU).
         */
        runReset: async function () {
            log('♻️ [RESET] Petició de reset general del bloc seleccionat');
            if (!getUtils().isJsxReady) {
                log('⚠️ [RESET] Motor JSX encara no preparat. Espera un moment.', 'WARN');
                getUtils().status("El motor encara no està llest. Torna-ho a provar.", 'warn');
                return;
            }
            const btn = document.getElementById('btnReset');
            try {
                // ── Context de treball: el MATEIX que la resta de fluxos ────────
                // (2026-10-22 · #180) Ací es feia servir `_targetDateDir()` (sempre
                // HOY) mentres `_runNew` treballa amb `State.dateDir`. Amb un
                // projecte d'una ALTRA data obert, el RESET apuntava a una carpeta
                // diferent de la del projecte: deia «el projecte obert no és el
                // d'aquesta selecció», no el tancava i després no podia esborrar
                // res (el .prproj i l'Auto-Save seguien bloquejats).
                // Ara el context ix d'`_setupContext()`, com CREAR/ACTUALITZAR.
                const ctx = await this._setupContext();
                const config = ctx.config;
                const progData = ctx.progData;
                const idProg = ctx.programa;
                const bloque = ctx.bloque;
                const dateDir = ctx.dateDir;
                const folderSel = getUtils().workFolder(ctx);
                if (!folderSel) {
                    log("⚠️ [RESET] No s'ha pogut resoldre la carpeta del bloc.", 'WARN');
                    getUtils().status('RESET: no es pot resoldre la carpeta del bloc.', 'error');
                    return;
                }

                // ── 1. PROJECTE OBERT: mana la SEUA carpeta ─────────────────────
                // Si el projecte obert és el d'aquest PROGRAMA+BLOC (encara que
                // siga d'una altra data), el RESET treballa sobre la SEUA carpeta:
                // és el directori que l'usuari vol esborrar i el que cal alliberar.
                let openPath = '';
                try {
                    openPath = await callJSX("FASTPASS.Project.path()");
                    if (openPath === '[]' || String(openPath).indexOf('ERR:') === 0) openPath = '';
                } catch (eOpen) { openPath = ''; }
                const openFolder = openPath ? this._parentFolder(openPath) : '';
                const mateixProgBloc = !!(openFolder && this._sameProgramBloc(openFolder, folderSel));
                const folder = mateixProgBloc ? openFolder : folderSel;
                if (mateixProgBloc && this._normPath(openFolder) !== this._normPath(folderSel)) {
                    log("ℹ️ [RESET] El projecte obert és d'una altra data: es reseteja la SEUA carpeta.", 'INFO');
                    log('   · carpeta del projecte obert: ' + openFolder, 'INFO');
                    log('   · carpeta de la selecció:     ' + folderSel, 'INFO');
                }

                // ── GUARDA DE SEGURETAT (2026-10-21) ──────────────────────────────
                // El RESET esborra una CARPETA SENCERA: nomes pot ser la del BLOC
                // (<base>/<programa>/<data>/<Vn>). Si la ruta calculada no es dins
                // de la base de projectes o l'ultim tram no es el bloc seleccionat,
                // s'avorta: mai s'ha d'esborrar una carpeta de data o de programa.
                const baseProj = (config.rutas && config.rutas.destinoBase) || '';
                const lastSeg = String(folder).replace(/[\\/]+$/, '').split(/[\\/]/).pop().toUpperCase();
                const blocSeg = String(bloque || '').toUpperCase().replace(/\s+/g, '');
                if (!blocSeg || lastSeg !== blocSeg || !getUtils().isInsideFolder(folder, baseProj)) {
                    log('⛔ [RESET] Carpeta NO valida per esborrar: ' + folder +
                        ' (base="' + baseProj + '" · bloc="' + bloque + '")', 'ERROR');
                    getUtils().status('RESET avortat: la carpeta no és la del bloc dins la base de projectes.', 'error');
                    return;
                }
                const progNom = (progData && (progData.archivo || progData.nombre)) || idProg;
                const dateSeg = this._folderDateSegment(folder) || dateDir;
                const msg = 'RESET GENERAL\n\n' +
                    "S'esborrarà TOT el contingut de:\n" + folder + '\n\n' +
                    '(projecte de ' + progNom + ' ' + bloque + ' del ' + dateSeg + ')\n\n' +
                    'I es tornarà a crear de zero. Aquesta acció NO es pot desfer.\nContinua?';
                if (!confirm(msg)) {
                    log("↩️ [RESET] Cancel·lat per l'usuari.", 'INFO');
                    return;
                }
                if (btn) { btn.disabled = true; btn.innerText = '⏳'; btn.classList.add('btn-busy'); }
                getUtils().updateUIState('BUSY');

                // ── 2. TANCAR el projecte (VERIFICAT) ─────────────────────────
                // (2026-10-22 · #180) Abans es cridava `Logic.Project.close()` i no
                // se sabia si havia funcionat (eixa funció s'empassava els errors):
                // el RESET continuava, xocava amb els fitxers bloquejats i deia
                // «Esborrat INCOMPLET» sense explicar el motiu real. Ara, si el
                // projecte no es pot tancar, NO s'esborra res i s'avisa.
                if (openPath) {
                    if (this._pathInside(openPath, folder)) {
                        log('🔒 [RESET] Tancant el projecte obert: ' + openPath);
                        const closeRes = await FASTPASS_UI.Logic.Project.close({ refreshContext: false });
                        if (!closeRes || !closeRes.ok) {
                            const why = (closeRes && closeRes.error) ? closeRes.error : 'error desconegut';
                            log("⛔ [RESET] No s'ha pogut tancar el projecte (" + why + "): no s'esborra res.", 'ERROR');
                            getUtils().status("RESET aturat: no s'ha pogut tancar el projecte a Premiere. Tanca'l a mà i torna-ho a provar.", 'error');
                            return;
                        }
                        log('✅ [RESET] Projecte tancat i verificat.');
                    } else {
                        log("ℹ️ [RESET] El projecte obert no és el d'aquesta selecció; no es tanca.", 'INFO');
                    }
                } else {
                    log('ℹ️ [RESET] No hi ha cap projecte obert a Premiere.', 'INFO');
                }

                // Premiere allibera els handles una mica DESPRES de tancar: sense
                // aquesta espera el primer intent xoca amb EPERM/EBUSY i deixa restes.
                await getUtils().delay(700);

                // ── 3. ESBORRAT ABSOLUT + VERIFICACIO ──────────────────────────
                // Més intents que per defecte (6 x 500 ms): a la xarxa, Windows pot
                // trigar un parell de segons a alliberar el .prproj i l'Auto-Save.
                const wipe = await getUtils().wipeFolder(folder, { maxAttempts: 6, waitMs: 500 });
                if (!wipe.ok) {
                    log('⛔ [RESET] Esborrat INCOMPLET: NO es crea cap projecte sobre les restes.', 'ERROR');
                    for (let i = 0; i < wipe.leftovers.length && i < 20; i++) {
                        log('   · resta: ' + wipe.leftovers[i], 'ERROR');
                    }
                    if (wipe.failed && wipe.failed.length) {
                        for (let j = 0; j < wipe.failed.length && j < 20; j++) {
                            log('   · error: ' + wipe.failed[j].path + ' [' + wipe.failed[j].code + ']', 'ERROR');
                        }
                    }
                    getUtils().status("RESET: no s'ha pogut esborrar tot (" + wipe.leftovers.length +
                        ' restes). Tanca Premiere i torna-ho a provar.', 'error');
                    return;
                }
                log('🗑️ [RESET] Carpeta esborrada del tot: ' + folder +
                    ' (' + wipe.files + ' fitxers, ' + wipe.dirs + ' carpetes, intent ' + wipe.attempts + ')');

                // ── 2b. RESTES FORA DE LA CARPETA (marcadors SRT a C:/temp) ────
                // Les copies de marcadors de C:/temp NO s'esborren amb la carpeta i
                // la restauracio nomes comprova projectKey + nom + empremta: podrien
                // re-injectar marques velles al projecte nou.
                try {
                    const ed = window.SrtEditor;
                    if (ed && typeof ed.wipeMarkersForProject === 'function') {
                        const nBk = ed.wipeMarkersForProject(folder);
                        log('🧹 [RESET] Copies de marcadors de subtitols fora del projecte buidades: ' + nBk, 'INFO');
                    }
                } catch (eBk) {
                    log("⚠️ [RESET] No s'han pogut buidar les copies de marcadors: " + eBk.message, 'WARN');
                }

                // ── 3. REINICIAR sessió (preservant el mode HOY/AHIR) i crear de zero ──
                try {
                    const prevWorkTarget = (FASTPASS_UI.State && FASTPASS_UI.State.workTarget) || 'today';
                    if (FASTPASS_UI.State && typeof FASTPASS_UI.State.reset === 'function') {
                        FASTPASS_UI.State.reset();
                        FASTPASS_UI.State.workTarget = prevWorkTarget;
                    }
                    if (window.FASTPASS_UI.State) window.FASTPASS_UI.State.dateDir = dateSeg;
                    if (window.SrtEditor && typeof window.SrtEditor.reset === 'function') {
                        window.SrtEditor.reset();
                    }
                } catch (eReset) {
                    log('⚠️ [RESET] Error reiniciant estat: ' + eReset.message, 'WARN');
                }

                log('🔁 [RESET] Tornant a crear el projecte de zero (flux NOU)...', 'INFO');
                getUtils().status('RESET: esborrat. Tornant a crear el projecte...', 'warn');
                await this._runNew();
            } catch (e) {
                getUtils().handleError(e, 'Reset');
            } finally {
                if (btn) { btn.disabled = false; btn.innerText = '🔄'; btn.classList.remove('btn-busy'); }
                getUtils().updateUIState('READY');
            }
        },

        /**
         * _normPath: ruta normalitzada per comparar (barres invertides, sense barra
         * final). Usa `FsWipe.norm` (que conserva el prefix UNC) si és al bundle.
         * @param {string} p
         * @returns {string}
         */
        _normPath: function (p) {
            var mod = window.FASTPASS_UI && window.FASTPASS_UI.Logic && window.FASTPASS_UI.Logic.FsWipe;
            if (mod && typeof mod.norm === 'function') return mod.norm(p);
            return String(p == null ? '' : p).replace(/\//g, '\\').replace(/\\+$/, '');
        },

        /**
         * _parentFolder: carpeta que conté un fitxer (el .prproj obert).
         * @param {string} filePath
         * @returns {string} '' si no hi ha carpeta
         */
        _parentFolder: function (filePath) {
            var p = this._normPath(filePath);
            var i = p.lastIndexOf('\\');
            return (i > 0) ? p.substring(0, i) : '';
        },

        /**
         * _pathInside: cert si `filePath` està DINS de la carpeta `folder`.
         * @param {string} filePath
         * @param {string} folder
         * @returns {boolean}
         */
        _pathInside: function (filePath, folder) {
            var f = this._normPath(folder).toLowerCase();
            var p = this._normPath(filePath).toLowerCase();
            if (!f || !p) return false;
            return p.indexOf(f + '\\') === 0;
        },

        /**
         * _sameProgramBloc: cert si dos carpetes de projecte són del MATEIX
         * programa i bloc (<base>/<programa>/<data>/<bloc>), encara que la DATA
         * siga diferent. És el criteri per decidir que el projecte obert és "el
         * de la selecció" (#180).
         * @param {string} a
         * @param {string} b
         * @returns {boolean}
         */
        _sameProgramBloc: function (a, b) {
            var segA = this._normPath(a).split('\\');
            var segB = this._normPath(b).split('\\');
            if (segA.length < 3 || segB.length < 3) return false;
            var key = function (s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); };
            var blocA = key(segA[segA.length - 1]);
            var blocB = key(segB[segB.length - 1]);
            var progA = key(segA[segA.length - 3]);
            var progB = key(segB[segB.length - 3]);
            return !!blocA && blocA === blocB && !!progA && progA === progB;
        },

        /**
         * _folderDateSegment: tram de DATA (YYYY_MM_DD) d'una carpeta de bloc.
         * @param {string} folder - <base>/<programa>/<data>/<bloc>
         * @returns {string} '' si el tram no té forma de data
         */
        _folderDateSegment: function (folder) {
            var seg = this._normPath(folder).split('\\');
            var d = (seg.length >= 2) ? String(seg[seg.length - 2]) : '';
            return /^\d{4}_\d{2}_\d{2}$/.test(d) ? d : '';
        },

        /**
         * _photoEscaleta: Genera una escaleta "on demand" via API de digition per al context
         * actual — exactament el mateix que fa el botó FOTO — i la deixa al directori del projecte
         * (escaleta_on_demand_*.json, que MANA sobre les del NAS).
         * (2026-09-22) S'usa com a FALLBACK quan no hi ha escaleta del bloc demanat.
         * @param {Object} ctx - {config, progData, bloque, dateDir}
         * @returns {Promise<{ok:boolean, filename:(string|null), error:(string|null)}>}
         */
        _photoEscaleta: async function (ctx) {
            const reader = window.EscaletaReader || (window.FASTPASS_UI && window.FASTPASS_UI.EscaletaReader);
            if (!reader || typeof reader.fetchNewEscaleta !== 'function') {
                return { ok: false, filename: null, error: 'fetchNewEscaleta no disponible' };
            }
            if (!ctx || !ctx.progData || !ctx.dateDir || !ctx.config) {
                return { ok: false, filename: null, error: 'context incomplet' };
            }
            const folderDest = getUtils().workFolder(ctx);
            try {
                getUtils().status('📷 Escaleta del bloc ' + ctx.bloque + ': fent FOTO…', 'procesando');
                log("📷 [FOTO·auto] Petició a l'API d'escaletes: " + ctx.progData.archivo + ' / ' + ctx.bloque + ' / ' + ctx.dateDir);
                // (2026-10-23) La FOTO vol l'estat del servidor d'ARA: es buida la
                // memòria de la SÈRIE estimada (historial local de projectes) perquè
                // l'escaletaId es torne a deduir amb les dades del dia.
                try { if (typeof reader._invalidateSeries === 'function') reader._invalidateSeries(); } catch (eInv) { }
                // Guarda de temps (igual que el botó FOTO): el handshake TLS amb digition
                // pot trigar ~26 s en aquesta xarxa i es proven 2-3 candidats d'escaletaId.
                const FOTO_TIMEOUT_MS = 180000;
                const res = await Promise.race([
                    reader.fetchNewEscaleta(
                        ctx.progData.escaletaId || null,
                        ctx.dateDir,
                        ctx.progData.archivo,
                        ctx.bloque,
                        folderDest
                    ),
                    new Promise(function (resolve) { setTimeout(function () { resolve('__TIMEOUT__'); }, FOTO_TIMEOUT_MS); })
                ]);
                if (res === '__TIMEOUT__') {
                    return { ok: false, filename: null, error: "l'API no ha respost en " + (FOTO_TIMEOUT_MS / 1000) + 's' };
                }
                if (res && res.filename) {
                    log('✅ [FOTO·auto] Escaleta generada: ' + res.filename);
                    log('   📂 [FOTO·auto] Es guarda al DIRECTORI DEL PROJECTE (no al NAS): ' + folderDest + '\\' + res.filename);
                    getUtils().status('📷 Escaleta nova guardada: ' + res.filename, 'exito');
                    return { ok: true, filename: res.filename, error: null };
                }
                return { ok: false, filename: null, error: "l'API no ha donat escaleta (motiu de digition al log)" };
            } catch (e) {
                return { ok: false, filename: null, error: e.message };
            }
        },

        _runNew: async function () {
            try {
                const ctx = await this._setupContext();

                // ── MECÀNICA D'INICI (2026-09-04) ─────────────────────────────────
                // dateDir ve DECIDIT des de checkContext: HOY per defecte, o AHIR
                // si es va fer Ctrl+clic a MAIN. No es dedueix ni es corregeix aquí
                // (eliminat l'antic D7.1 i el fallback a AHIR de la finestra 22h).
                log('[dateDir] Data de treball: ' + ctx.dateDir + ' (fixada a checkContext)');

                // ─── Extreure el TEMA del primer ítem estructural del bloc ──
                // Mateixa lògica que l'extracció de tema dels chyrons:
                // primer ítem amb teVideo=true o isItemEstructural=true el
                // títol del qual no sigui una paraula reservada.
                var sanitizedTheme = null;
                var jsonData = null;
                var jsonMeta = null;
                var RESERVED_THEMES = [
                    'INTR', 'LÍNIA', 'CHYRON', 'GF', 'PG', 'TD', 'TE',
                    'P2', 'P5', 'P7', 'LEAD', 'BD', 'BON DIA', 'CHYRONS',
                    'GUIO', 'COL.LECCIO', 'OFF', 'CURT', 'INTRO', 'CARETA',
                    'DIFERIT', 'INSERT', 'CONN', 'CONNEXIO', 'IPD', 'DONA PAS', 'MOLINET'
                ];
                try {
                    const reader = window.EscaletaReader || window.FASTPASS_UI.EscaletaReader;
                    if (reader) {
                        var datePrefixJson = ctx.dateDir ? ctx.dateDir.replace(/_/g, '') : null;
                        // ─── ESCALETA LOCAL (DIRECTORI DEL PROJECTE) ──
                        // La extensió treballa SEMPRE amb la còpia de l'escaleta al directori
                        // del projecte (tant si ve del NAS copiada com si la genera el botó Foto).
                        // ensureLocalCopy: busca local i prou. (2026-10-21 · LOCAL-FIRST)
                        // Si no hi ha cap escaleta al directori del projecte NO se'n baixa
                        // cap del NAS: es fa una FOTO nova (més avall) i es treballa amb eixa.
                        jsonMeta = await reader.ensureLocalCopy(ctx, datePrefixJson, { localOnly: true });
                        if (jsonMeta) {
                            jsonData = await reader.load(jsonMeta.path);
                        }

                        // ── GUARDA DE BLOC/DIA + FOTO AUTOMÀTICA (2026-09-22) ──────────────
                        // L'escaleta ha de ser DEL BLOC DEMANAT i del DIA demanat. Si el que hi ha
                        // és d'un altre bloc (p.ex. V2 quan es demana el V3) NO serveix per a res:
                        // el tema s'ha d'inventar des dels chyrons i acaba en una paraula reservada
                        // (INTRO) → avortament. En aquest cas es fa una FOTO automàtica (mateixa via
                        // que el botó FOTO) i es torna a carregar. Si la FOTO tampoc no en dona,
                        // s'avorta amb el motiu real de l'API de digition.
                        // ── RESOLUCIÓ DE L'ESCALETA: ORDRE OFICIAL (2026-10-21 · LOCAL-FIRST) ────
                        //   1) escaleta al DIRECTORI DEL PROJECTE (còpia prèvia o FOTO anterior)
                        //   2) FOTO via API de digition (escaleta_on_demand_*)
                        // (2026-10-21) S'ha eliminat el pas "escaleta d'un bloc POSTERIOR del NAS":
                        // les escaletes que publica el motor a …\ESCALETES ja no es consumeixen.
                        // MAI una escaleta d'un bloc ANTERIOR: no té els nostres ítems, el tema
                        // s'havia d'inventar i acabava en paraula reservada (INTRO) → avortament.
                        var escNom = String((jsonMeta && (jsonMeta.name || jsonMeta.path)) || '');
                        var isOnDemand = escNom.indexOf('escaleta_on_demand') !== -1;   // ja ve de la FOTO
                        var ourNum = parseInt(String(ctx.bloque || '').replace(/\D/g, ''), 10) || 0;
                        var escBid = (reader.extractBlockIdFromFilename && escNom) ? reader.extractBlockIdFromFilename(escNom) : null;
                        var escNum = parseInt(String(escBid || '').replace(/\D/g, ''), 10) || 0;
                        var escDelDia = isOnDemand || !datePrefixJson || escNom.indexOf(datePrefixJson) !== -1;
                        // Serveix si: ve de la FOTO, o és del mateix bloc, o és d'un bloc POSTERIOR del dia.
                        var escaletaOk = !!(jsonData) && (isOnDemand || (escDelDia && escNum > 0 && escNum >= ourNum));

                        if (!escaletaOk) {
                            log('⚠️ [NOU] Escaleta no utilitzable per al bloc ' + ctx.bloque + ' (' +
                                (escNom.split(/[\\\/]/).pop() || 'cap escaleta') + ') → FOTO', 'WARN');
                            // (2026-10-21 · LOCAL-FIRST) S'ha eliminat el pas "bloc POSTERIOR
                            // del NAS": les escaletes que publica el motor ja no es fan servir.
                            // Si la còpia local no és del nostre bloc/dia, es descarta i es fa FOTO.
                            jsonData = null;
                        }

                        if (!escaletaOk || !jsonData) {
                            // ── 2) FOTO via API de digition ──
                            log('📷 [NOU] Cap escaleta del bloc ' + ctx.bloque + ' al directori del projecte → FOTO automàtica', 'WARN');
                            var fotoAuto = await this._photoEscaleta(ctx);
                            if (!fotoAuto.ok) {
                                log('⛔ [NOU] Sense escaleta del bloc ' + ctx.bloque + ' i la FOTO ha fallat: ' + fotoAuto.error, 'ERROR');
                                getUtils().status("Bloc " + ctx.bloque + ": no hi ha escaleta i la FOTO ha fallat (" + fotoAuto.error + ")", "error");
                                return;
                            }
                            jsonMeta = await reader.ensureLocalCopy(ctx, datePrefixJson, { localOnly: true });
                            jsonData = jsonMeta ? await reader.load(jsonMeta.path) : null;
                            if (!jsonData) {
                                log('⛔ [NOU] La FOTO ha generat ' + fotoAuto.filename + ' però no s\'ha pogut carregar.', 'ERROR');
                                getUtils().status("Bloc " + ctx.bloque + ": la FOTO no ha deixat una escaleta carregable", "error");
                                return;
                            }
                            log('📷 [NOU] Escaleta de la FOTO carregada: ' + ((jsonMeta && jsonMeta.name) || fotoAuto.filename));
                            // (2026-09-22) Comprovem que la nova escaleta contingui REALMENT el nostre bloc
                            // (cleanFeed.clips porta una entrada per bloc: V1, V2, V3...).
                            try {
                                const clipsCF = (jsonData && jsonData.cleanFeed && jsonData.cleanFeed.clips) || [];
                                const blocCF = clipsCF.filter(function (c) {
                                    return String(c.id || '').toUpperCase() === String(ctx.bloque).toUpperCase();
                                })[0];
                                if (blocCF) {
                                    log('   ✅ [FOTO·auto] Conté el bloc ' + ctx.bloque + ': ' + blocCF.titol + ' (' + blocCF.in + ' → ' + blocCF.out + ')');
                                } else {
                                    log('   ⚠️ [FOTO·auto] La nova escaleta NO porta el bloc ' + ctx.bloque +
                                        ' (blocs: ' + clipsCF.map(function (c) { return c.id; }).join(', ') + ')', 'WARN');
                                }
                            } catch (eCF) { }
                        }
                        if (jsonMeta && jsonData) {
                            if (jsonData) {
                                var lines = reader.getLinesForBlock(jsonData, ctx.bloque);
                                lines.sort(function (a, b) {
                                    var ta = reader.tcToSeconds(a.horaEntradaOnAir || a.horaEntradaPrevista || '00:00:00');
                                    var tb = reader.tcToSeconds(b.horaEntradaOnAir || b.horaEntradaPrevista || '00:00:00');
                                    return ta - tb;
                                });
                                var firstStructural = null;
                                var firstOffOfd = null;
                                for (var li = 0; li < lines.length; li++) {
                                    var item = lines[li];
                                    if (!item.titol) continue;
                                    if (item.flotant === true) continue;
                                    var isStructural = reader.isItemEstructural(item) || item.teVideo === true;
                                    if (!isStructural) continue;
                                    var upper = item.titol.toUpperCase().trim();
                                    var isReserved = false;
                                    for (var ri = 0; ri < RESERVED_THEMES.length; ri++) {
                                        if (upper.indexOf(RESERVED_THEMES[ri]) !== -1) {
                                            isReserved = true;
                                            break;
                                        }
                                    }
                                    if (!firstStructural) {
                                        firstStructural = { titol: item.titol, num: item.num };
                                    }
                                    var fontU = String(item.font || '').toUpperCase().trim();
                                    if (!firstOffOfd && (fontU === 'OFF' || fontU === 'OFD')) {
                                        firstOffOfd = { titol: item.titol, num: item.num, font: fontU };
                                    }
                                    if (!isReserved && upper.length > 2) {
                                        sanitizedTheme = getUtils().sanitizeName(item.titol).toUpperCase();
                                        log('🏷️ [Theme] Tema extret del JSON: "' + sanitizedTheme + '" (item ' + (item.num || '?') + ')');
                                        break;
                                    }
                                }
                                // ── Reconstrucció de tema (2026-09-07) ─────────────────
                                // Si tots els items estructurals del bloc tenen títol amb
                                // token reservat (ex: V1 = GF/INTRO/DIFERIT/IPD/INSERT),
                                // es prioritza l'item OFF/OFD del bloc; si no n'hi ha,
                                // el primer estructural. En tots dos casos s'elimina del
                                // títol qualsevol PREFIX que sigui paraula reservada.
                                if (!sanitizedTheme && (firstOffOfd || firstStructural)) {
                                    var temaSrc = firstOffOfd || firstStructural;
                                    var cleanT = temaSrc.titol;
                                    for (var pass = 0; pass < 5; pass++) {
                                        var before = cleanT;
                                        cleanT = cleanT.replace(/^[+*\-:\.\s]+/, '').trim();
                                        for (var ri2 = 0; ri2 < RESERVED_THEMES.length; ri2++) {
                                            var patT = RESERVED_THEMES[ri2];
                                            var upT = cleanT.toUpperCase();
                                            if (upT.indexOf(patT.toUpperCase()) === 0) {
                                                var restT = cleanT.substring(patT.length);
                                                if (restT === '' || /^[\s+*\-:.\/]/.test(restT)) {
                                                    cleanT = restT.trim();
                                                    break;
                                                }
                                            }
                                        }
                                        if (cleanT === before) break;
                                    }
                                    cleanT = cleanT.replace(/^[+*\-:\.\s]+/, '').replace(/[+*\-:\s]+$/, '').trim();
                                    if (cleanT.length > 2) {
                                        sanitizedTheme = getUtils().sanitizeName(cleanT).toUpperCase();
                                        log('🏷️ [Theme] Tema reconstruït des del ' + (temaSrc.font || '1r estructural') + ': "' + sanitizedTheme + '" (item ' + (temaSrc.num || '?') + ')');
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    log('⚠️ [Theme] Error extraient tema del JSON: ' + e.message);
                }

                const assets = await this._fullScan(ctx);
                
                // Si no s'ha pogut extraure del JSON, fallback als chyrons
                if (!sanitizedTheme) {
                    sanitizedTheme = getUtils().sanitizeName(assets.wotts.tema).toUpperCase();
                    log('🏷️ [Theme] Tema extret dels chyrons (fallback): "' + sanitizedTheme + '"');
                }
                // --- GUARDA: MAI crear un projecte si el bloc no està emès complet ---
                // Criteri de validesa: tots els ítems del bloc han d'haver estat emesos
                // (hora OnAir + durada). Sense això no hi ha prou informació per muntar
                // l'estructura i NO s'ha de crear cap projecte (evita els projectes
                // genèrics tipus Pruebas_*_INTRO.prproj).
                var readerG = window.EscaletaReader || (window.FASTPASS_UI && window.FASTPASS_UI.EscaletaReader);
                var blockG = null;
                try {
                    if (readerG && readerG.isBlockFullyEmitted && jsonData) {
                        blockG = readerG.isBlockFullyEmitted(jsonData, ctx.bloque);
                    }
                } catch (eG) { blockG = null; }
                if (!jsonData || !blockG || !blockG.ok) {
                    const detallG = blockG ? (blockG.emitted + "/" + blockG.total + " ítems emesos (darrer pendent: " + ((blockG.pending && blockG.pending.num) || "?") + ")") : "sense escaleta carregable";
                    // FIX (2026-09-16): si l'usuari ha fet FOTO (escaleta_on_demand_*.json),
                    // es permet crear el projecte encara que el bloc segueixi en emissió:
                    // es munta amb el que ja hi ha i es completa amb ACTUALITZAR. Sense
                    // FOTO es manté el bloqueig (evita projectes genèrics tipus *_INTRO).
                    var fotoOk = false, fotoFilename = '';
                    try {
                        if (readerG && typeof readerG.lookupLocalStatus === 'function') {
                            const locF = await readerG.lookupLocalStatus(ctx);
                            if (locF && locF.found && /^escaleta_on_demand/i.test(String(locF.filename || ''))) {
                                fotoOk = true;
                                fotoFilename = locF.filename;
                            }
                        }
                    } catch (eFoto) { fotoOk = false; }
                    // FIX (2026-09-16): també es permet crear amb l'ESCALETA DEL SISTEMA
                    // (jsonData carregat del dia) encara que el bloc no estigui emès del
                    // tot; abans calia FOTO local i, si el motor publicava el bloc amb
                    // error o endarrerit, no hi havia manera de començar.
                    const escSistemaOk = !!(jsonData && jsonData.cleanFeed && jsonData.escaleta);
                    if ((!fotoOk && !escSistemaOk) || !jsonData) {
                        log("⛔ [NOU] No es crea el projecte: " + detallG + ". Fes FOTO quan el bloc acabi d'emetre.", "ERROR");
                        getUtils().status("No es crea el projecte: " + detallG, "error");
                        return;
                    }
                    log((fotoOk ? "📷 [NOU] FOTO local (" + fotoFilename + ")" : "📡 [NOU] Escaleta del sistema") +
                        " amb el bloc en emissió (" + detallG + "): es crea el projecte PROVISIONAL. Completa'l amb ACTUALITZAR.", "WARN");
                    getUtils().status("Creant projecte provisional (bloc en emissió)…", "warn");
                }
                // ── FALLBACK DEL TEMA DES DE L'ESCALETA (2026-09-22) ─────────────────────
                // Si el tema surt buit o és una paraula reservada (INTRO, TE, P2...), es
                // recupera del TÍTOL DEL BLOC a l'escaleta (cleanFeed.clips[].titol), que
                // segueix la convenció ..._<BLOC>_<tecla>__intro__<TEMA>, p.ex.
                // TN_COMARQUES_V3_TE_santa_TECLA__intro__PREGONERS_TECLA_I_10_ANYS_DE_GENUINE
                // → "PREGONERS TECLA I 10 ANYS DE GENUINE" (mateix criteri que V1/V2).
                try {
                    const _temaInvalid = (t) => (!t || String(t).trim().length < 3 ||
                        RESERVED_THEMES.indexOf(String(t).toUpperCase().trim()) !== -1);
                    if (_temaInvalid(sanitizedTheme) && jsonData && jsonData.cleanFeed && jsonData.cleanFeed.clips) {
                        const clipBloc = jsonData.cleanFeed.clips.filter(function (c) {
                            return String(c.id || '').toUpperCase() === String(ctx.bloque).toUpperCase();
                        })[0];
                        if (clipBloc && clipBloc.titol) {
                            let t = String(clipBloc.titol).replace(/^[^_]+_[^_]*_/i, '');
                            const parts = t.split('__').filter(function (p) { return p && p.length > 2; });
                            if (parts.length > 0) t = parts[parts.length - 1];
                            t = String(t).replace(/_/g, ' ').trim();
                            const cand = getUtils().sanitizeName(t).toUpperCase();
                            if (!_temaInvalid(cand)) {
                                sanitizedTheme = cand;
                                log('🏷️ [Theme] Tema recuperat del bloc a l\'escaleta: "' + cand + '" (de "' + clipBloc.titol + '")', 'INFO');
                            }
                        }
                    }
                } catch (eTh) {
                    log('⚠️ [Theme] Fallback des de l\'escaleta: ' + eTh.message, 'WARN');
                }

                if (!sanitizedTheme || String(sanitizedTheme).trim().length < 3 || RESERVED_THEMES.indexOf(String(sanitizedTheme).toUpperCase().trim()) !== -1) {
                    log("⛔ [NOU] No es crea el projecte: tema no vàlid (" + (sanitizedTheme || "") + ").", "ERROR");
                    // (2026-09-22) DIAGNÒSTIC EXPLÍCIT: el motiu més habitual d'aquest avortament
                    // és que NO hi hagi escaleta del BLOC demanat al NAS (només d'altres blocs del
                    // mateix programa, com el V1/V2 quan es demana el V3). En aquest cas el tema
                    // s'ha d'inventar des dels chyrons i sol caure en una paraula reservada
                    // (p.ex. "INTRO"). Ho diem clarament en comptes del genèric "falta el tema".
                    var escUsada = (jsonMeta && (jsonMeta.name || jsonMeta.path)) ? String(jsonMeta.name || jsonMeta.path).split(/[\\\/]/).pop() : '';
                    var escEsDelBloc = escUsada ? (escUsada.toUpperCase().indexOf('_' + String(ctx.bloque).toUpperCase() + '_') !== -1) : false;
                    if (escUsada && !escEsDelBloc && escUsada.indexOf('escaleta_on_demand') === -1) {
                        log("⛔ [NOU] L'escaleta trobada és d'un altre bloc (" + escUsada.substring(0, 80) + "): no n'hi ha cap del bloc " + ctx.bloque + ".", "ERROR");
                        getUtils().status("Bloc " + ctx.bloque + ": no hi ha escaleta propia al NAS (nomes d'altres blocs). Demana-la o treballa un altre bloc.", "error");
                    } else {
                        getUtils().status("No es crea el projecte: falta el tema del bloc", "error");
                    }
                    return;
                }

                // ── (#121, 2026-09-30) DURADA REAL DEL CLEANFEED (no el snapshot del JSON) ──
                // El JSON d'escaleta és un SNAPSHOT del moment de publicació: el seu
                // cleanFeed.mediaStop diu fins on havia arribat la ingesta ALEES, no la
                // durada del fitxer. Si el projecte es crea més tard (o en diferit), el MP4
                // ja conté molt més material i el snapshot queda curt → guarda d'ingesta
                // FALSA i fallback al MP4 del bloc (que pot ser un render PREMATUR amb
                // material d'un altre bloc). Cas real TNM V4 29/09/2026: el JSON deia que el
                // fitxer arribava a 15:00:40 (33:40) i el fitxer real durava 68:00 (fins
                // 15:35:21) → el bloc (offset 2123 s) hi era de ple, però el sistema el va
                // donar per "no ingerit" i va importar un MP4 de verticalització escrit 15:00:51
                // (41 s ABANS de l'inici del bloc) amb el material d'un altre bloc.
                // Es mesura amb ffprobe (Logic.FFmpeg.getMediaDuration) i, si el fitxer
                // arriba més enllà del snapshot, s'usa la durada REAL com a límit.
                let cleanFeedMediaStopEff = (jsonData && jsonData.cleanFeed) ? jsonData.cleanFeed.mediaStop : null;
                let cleanFeedRealDurSec = null;
                try {
                    const _ffLogic = window.FASTPASS_UI.Logic && window.FASTPASS_UI.Logic.FFmpeg;
                    const _cfPath = (jsonData && jsonData.cleanFeed) ? jsonData.cleanFeed.mediaPath : null;
                    if (readerG && typeof readerG.tcToSeconds === 'function' && _ffLogic && _ffLogic.getMediaDuration && _cfPath) {
                        const _durRes = await _ffLogic.getMediaDuration(_cfPath);
                        if (_durRes && _durRes.ok) {
                            cleanFeedRealDurSec = _durRes.duration;
                            const _snapStart = readerG.tcToSeconds(jsonData.cleanFeed.mediaStart);
                            const _snapStop  = readerG.tcToSeconds(jsonData.cleanFeed.mediaStop);
                            const _realStop  = _snapStart + cleanFeedRealDurSec;
                            if (_realStop > _snapStop + 1 && typeof readerG.secondsToTC === 'function') {
                                cleanFeedMediaStopEff = readerG.secondsToTC(_realStop);
                                log(`📏 [NOU] Durada REAL del cleanFeed: ${cleanFeedRealDurSec.toFixed(1)}s → final ${cleanFeedMediaStopEff} (snapshot JSON=${jsonData.cleanFeed.mediaStop}, ${(_snapStop - _snapStart).toFixed(1)}s). S'usa la real.`);
                            } else {
                                log(`📏 [NOU] Durada REAL del cleanFeed: ${cleanFeedRealDurSec.toFixed(1)}s ≈ snapshot JSON (${(_snapStop - _snapStart).toFixed(1)}s) → es manté el snapshot.`);
                            }
                        } else {
                            log(`⚠️ [NOU] No s'ha pogut mesurar la durada real del cleanFeed (${(_durRes && _durRes.error) || '?'}) → s'usa el snapshot del JSON (${jsonData.cleanFeed.mediaStop}).`, "WARN");
                        }
                    }
                } catch (eDurCf) {
                    log('⚠️ [NOU] Durada real del cleanFeed: ' + eDurCf.message, "WARN");
                }

                // -- VIDEO DEL PROJECTE (2026-10-23) ----------------------------------
                // L'unica font de video es la captura del cleanFeed (extraccio ffmpeg amb
                // els bounds calculats). Ja NO es busca cap MP4 a la carpeta de
                // VERTICALITZACIO: si el bloc encara no te material (o s'ha emes fora del
                // rang del fitxer), el projecte es crea SENSE VIDEO i es completa amb
                // ACTUALITZAR quan la ingesta arribe.
                let skipVideoIngesta = false;
                let skipVideoIngestaMsg = null;   // motiu, per re-escriure'l al log del projecte

                const shortProg = ctx.progData.wott || "TNV";
                // Determinar hora d'inici del programa (per inserir el MP4 desde l'inici del informatiu)
                // Font única: Config.get().programStartHours (11_Configuracio.js).
                const PROGRAM_START_HOURS = ctx.config.programStartHours
                    || { TNV: 21.0, TNM: 14.5, TNC: 13.8333 };
                const worldProgramStartHour = PROGRAM_START_HOURS[shortProg] || 0;
                const projSlug = `${shortProg}_${ctx.bloque}_${sanitizedTheme}`;
                
                const fileName = `Pruebas_${projSlug}.prproj`;
                const folderPath = getUtils().workFolder(ctx);
                const fullDestPath = (folderPath + "/" + fileName).replace(/\\/g, "/");

                const paths = {
                    plantillaPath: ctx.config.rutas.plantilla_net,
                    fullDestPath: fullDestPath,
                    folderPath: folderPath,
                    sanitizedTheme: sanitizedTheme
                };

                // ─── Inicialitzar fitxer de log per a aquest projecte ──────────────
                getUtils()._setLogPath(folderPath, fileName);

                // (#120, 2026-09-30) La guarda "cleanFeed en ingesta" s'avalua ABANS d'aquest
                // punt i _setLogPath buida FASTPASS.log → el motiu es perdia (run V4 del 29/09:
                // el log no deia per què el projecte sortia sense vídeo). Es re-escriu aquí.
                if (skipVideoIngestaMsg) log(skipVideoIngestaMsg, "WARN");

                // ─── NOU: Inicialitzar Manifest de Sessió ──────────────────────────
                // Registrem l'inici del procés per tenir una font de veritat persistent
                const manifest = await FASTPASS_UI.SessionManifest.save(ctx, {
                    program: {
                        projectFile: fileName,
                        projectFolder: folderPath
                    }
                });

                // ─── NOU: Intentar carregar dades de l'escaleta JSON ──────────────────────
                // Usa el sistema de 3 tiers (calcPrecisionTrimBounds) per obtenir
                // els TCs reals basats en items emesos, no en blocs amb handles.
                let cleanFeedData = null;
                try {
                    const reader = window.EscaletaReader || window.FASTPASS_UI.EscaletaReader;
                    if (reader) {
                        // handles es llegeixen de Config.get().handles (font única: 11_Configuracio.js)
                        // _getHandleSecs() a escaleta_reader.js consulta Config automàticament

                        // jsonMeta i jsonData ja estan carregats (extrets abans per al tema)
                        // Si no es van carregar, tornar-ho a intentar amb la còpia LOCAL.
                        if (!jsonMeta || !jsonData) {
                            var datePrefixJson2 = ctx.dateDir ? ctx.dateDir.replace(/_/g, '') : null;
                            jsonMeta = await reader.ensureLocalCopy(ctx, datePrefixJson2);
                            if (jsonMeta) {
                                jsonData = await reader.load(jsonMeta.path);
                            }
                        }
                        if (jsonMeta && jsonData) {
                            if (jsonData) {
                                // Tots els ítems de l'escaleta (per persistir al manifest)
                                const allItems = jsonData.escaleta?.liniesEscaleta || [];

                                // ─── SISTEMA DE 3 TIERS: Precisió de trim ─────────────────
                                // (#121) mediaStop EFECTIU: si la durada real del fitxer supera el
                                // snapshot del JSON, el límit del MP4 és la durada real (abans el
                                // [OUT-MARGIN] tallava l'OUT al final del snapshot → OUT truncat).
                                const bounds = reader.calcPrecisionTrimBounds(
                                    jsonData,
                                    ctx.bloque,
                                    jsonData.cleanFeed.mediaStart,
                                    cleanFeedMediaStopEff || jsonData.cleanFeed.mediaStop,
                                    ctx.config
                                );

                                if (bounds) {
                                    const lines = reader.getLinesForBlock(jsonData, ctx.bloque);

                                    // ─── BOUNDS FORA DEL RANG DEL CLEANFEED (2026-10-23) ──────────
                                    // Abans, quan el bloc s'emetia fora del rang del cleanFeed (TNM V2 a les
                                    // 15:44 amb un cleanFeed que acaba a 15:29), es buscava el MP4 individual
                                    // del bloc a la carpeta de VERTICALITZACIO del NAS. Eixa carpeta ja no
                                    // existeix al flux: l'UNICA font de video es la captura del cleanFeed.
                                    // Ara, si el tram no hi es, el projecte es crea SENSE VIDEO i es completa
                                    // amb ACTUALITZAR quan la ingesta arribe.
                                    const outOfRangeCheck = reader.isBoundsOutOfCleanFeedRange(
                                        bounds,
                                        jsonData.cleanFeed.mediaStart,
                                        cleanFeedMediaStopEff || jsonData.cleanFeed.mediaStop
                                    );
                                    if (outOfRangeCheck.outOfRange) {
                                        skipVideoIngesta = true;
                                        skipVideoIngestaMsg = "⛔ [NOU] " + outOfRangeCheck.reason +
                                            ": el bloc no te material al cleanFeed → el projecte es creara SENSE VIDEO. Fes ACTUALITZAR quan la ingesta arribe.";
                                        log(skipVideoIngestaMsg, "ERROR");
                                        getUtils().status("Bloc fora del cleanFeed: projecte sense vídeo", "warn");
                                    }

                                    // Calcular el "punt dulce" (sense handles): temps OnAir real relatiu al MP4.
                                    // bounds.mp4ExpandedInPoint = sweetPoint - handles (3s marge previ)
                                    // bounds.mp4ExpandedOutPoint = sweetPoint + handles (3s marge posterior)
                                    // bounds.ref.worldBlockStartSec/worldBlockEndSec són els temps OnAir absoluts.
                                    // Restem worldSecMediaStart per obtindre valors relatius al MP4.
                                    const worldSecMediaStart = bounds.ref.worldSecMediaStart;
                                    let mp4SweetInPoint  = (bounds.ref.worldBlockStartSec != null) ? bounds.ref.worldBlockStartSec - worldSecMediaStart : bounds.mp4ExpandedInPoint;
                                    let mp4SweetOutPoint = (bounds.ref.worldBlockEndSec   != null) ? bounds.ref.worldBlockEndSec   - worldSecMediaStart : bounds.mp4ExpandedOutPoint;
                                    // Guardar el valor pre-offset de mp4SweetInPoint per a tlBlockInPointSecRaw
                                    // (necessitem el valor SENSE offset per al càlcul de offsetSec)
                                    const mp4SweetInPointRaw = mp4SweetInPoint;
                                    // Aplicar offset global de TC als punts dolços per corregir deriva d'ingesta.
                                    // mp4SweetInPoint/mp4SweetOutPoint (amb offset) es guarden a cleanFeedData
                                    // per a referència de debug. El source IN real del clip és mp4ExpandedInPoint
                                    // (amb handle) + offset global, aplicat a 3_Project_Logic.js.
                                    // L'offset desplaça el RANG SOURCE del clip dins del MP4 (on es llegeix
                                    // el contingut). Els delimitadors de seqüència es fixen als sweet points
                                    // (≈handleSecs i clipDuration-handleSecs) via cleanFeedData.handleSecs.
                                    mp4SweetInPoint  = getUtils().applyGlobalOffsetSec(mp4SweetInPoint);
                                    mp4SweetOutPoint = getUtils().applyGlobalOffsetSec(mp4SweetOutPoint);
                                    // Calcular el punt d'inici del MP4 per si es volgués començar des de l'inici
                                    // del programa (actualment no s'usa per a inserció, es guarda com a referència).
                                    // NOTA: Ja NO s'aplica offset global aquí perquè l'offset només es aplica
                                    // als marcadors a flow_assembly.js via applyGlobalOffsetSec().
                                    const worldProgramStartSec = worldProgramStartHour * 3600;
                                    let mp4ProgramInPoint = worldProgramStartSec - worldSecMediaStart;
                                    // No pot ser negatiu (el MP4 comença després de l'hora objectiu)
                                    if (mp4ProgramInPoint < 0) mp4ProgramInPoint = 0;
                                    // No pot ser posterior a l'inPoint calculat (per no perdre el bloc)
                                    if (mp4ProgramInPoint > bounds.mp4ExpandedInPoint) mp4ProgramInPoint = bounds.mp4ExpandedInPoint;
                                    log(`📡 [ProgramStart] ${shortProg}: targetHour=${worldProgramStartHour}h → targetSec=${worldProgramStartSec}s, worldSecMediaStart=${worldSecMediaStart.toFixed(0)}s, mp4ProgramInPoint=${mp4ProgramInPoint.toFixed(2)}s (original mp4ExpandedInPoint=${bounds.mp4ExpandedInPoint.toFixed(2)}s)`);

                                    // NOTA: El clip s'insereix amb mp4ExpandedInPoint (amb handle) + offset global
                                    // com a source IN a 3_Project_Logic.js. L'offset desplaça el RANG SOURCE
                                    // dins del MP4 per corregir deriva d'ingesta. El clip es col·loca a start=0
                                    // al timeline. Els delimitadors de seqüència es fixen als sweet points
                                    // (≈3s i clipDuration-3s) per marcar on comença i acaba el contingut real,
                                    // no als extrems del clip amb handles.
                                    // L'ÚNICA font de vídeo és la captura del cleanFeed.
                                    const effectiveMediaPath = jsonData.cleanFeed.mediaPath;

                                    cleanFeedData = {
                                        mediaPath: effectiveMediaPath,
                                        mp4ProgramInPoint: mp4ProgramInPoint,
                                        mp4ExpandedInPoint: bounds.mp4ExpandedInPoint,    // Inclou -3s handle, SENSE offset global
                                        mp4ExpandedOutPoint: bounds.mp4ExpandedOutPoint,  // Inclou +3s handle, SENSE offset global
                                        mp4SweetInPoint: mp4SweetInPoint,
                                        mp4SweetInPointRaw: mp4SweetInPointRaw,  // sense offset global, per a càlcul de tlBlockInPointSec
                                        mp4SweetOutPoint: mp4SweetOutPoint,
                                        mp4Duration: bounds.mp4Duration,
                                        handleSecs: ctx.config.handles,   // font única de veritat (Config.get().handles)
                                        escaletaLines: lines,
                                        precisionTiers: {
                                            in: bounds.InTier,
                                            out: bounds.OutTier
                                        }
                                    };

                                    // Desar tota la info base al manifest i actualitzar la variable en memòria
                                    // NOTA: tlBlockInPointSec es guarda SENSE offset global (mp4ExpandedInPoint).
                                    // Amb handles=3s, mp4ExpandedInPoint = sweetPoint - 3s. Això és el punt
                                    // d'inici del clip al source MP4 (incloent el marge de handle).
                                    // L'offset global (tcOffset) s'aplica al clip origen via mp4ExpandedInPoint
                                    // + globalOffset com a source IN a 3_Project_Logic.js. El tlBlockInPointSec
                                    // es manté sense offset per al càlcul de offsetSec, que converteix posicions
                                    // source a posicions de timeline: offsetSec = tlClipStartSec - tlBlockInPointSec.
                                    // Com que el clip s'inserta a start=0, offsetSec = -mp4ExpandedInPoint, i els
                                    // marcadors a flow_assembly.js es calculen com (worldSecOnAir - mediaStart) + offsetSec.
                                    // mp4ExpandedInPoint NO porta offset global (s'aplica després a 3_Project_Logic.js).
                                    Object.assign(manifest, await FASTPASS_UI.SessionManifest.save(ctx, {
                                        program: { escaletaFile: jsonMeta.filename },
                                        cleanFeed: jsonData.cleanFeed,
                                        blockBounds: bounds,  // inclou mp4ExpandedInPoint, mp4ExpandedOutPoint, tiers...
                                        ref: {
                                            ...bounds.ref,  // { worldSecMediaStart, mp4ExpandedInPoint, worldBlockStartSec, worldBlockEndSec, InTier, OutTier, tlClipStartSec:null, offsetSec:null }
                                            tlBlockInPointSec: bounds.mp4ExpandedInPoint  // mp4ExpandedInPoint SENSE offset global (sweet - handle)
                                        },
                                        escaletaItems: toManifestItems(allItems),
                                        phases: { boundsCalculated: true }
                                    }));

                                    log(`📡 [PrecisionTrim] cleanFeed: in=${bounds.mp4ExpandedInPoint.toFixed(1)}s out=${bounds.mp4ExpandedOutPoint.toFixed(1)}s (InTier=${bounds.InTier}, OutTier=${bounds.OutTier})`);

                                    // ─── FASE 0: Extracció de clip via ffmpeg (si possible) ──
                                    try {
                                        const ffmpeg = window.FASTPASS_UI.Logic.FFmpeg;
                                        // El clip del bloc s'extreu SEMPRE del cleanFeed amb els bounds
                                        // calculats (no hi ha cap MP4 alternatiu al flux).
                                        if (!skipVideoIngesta && ffmpeg && ffmpeg.extractClip) {
                                            const clipName = `${ctx.progData.wott || "TNV"}_${ctx.bloque}_CLIP.mp4`;
                                            // Destí: DIRECTORI DEL PROJECTE (folderPath = on neix el .prproj a _runNew).
                                            // El clip del bloc, l'AUDIO_REF.bin i el .prproj queden sempre junts
                                            // i la importació es fa des d'aquesta ruta (cleanFeedData.mediaPath).
                                            // NOTA: no usem Context.folder() aquí perquè a _runNew el projecte nou
                                            // encara no existeix (retornaria la carpeta del projecte ANTERIOR).
                                            // ffmpeg/PowerShell necessiten backslashes; Premiere, forward slashes (després).
                                            const projFolder = getUtils().workFolder(ctx);
                                            const clipPath = (projFolder + "\\" + clipName).replace(/\//g, "\\");
                                            log(`🎬 [EXTRACT] Clip del bloc → directori del projecte: ${clipPath}`);

                                            // mp4Duration es necessita per a l'extracció i el recàlcul de bounds
                                            const mp4Duration = bounds.mp4Duration;
                                            // ── COLA EXTRA DEL CLIP (2026-09-16) ─────────────────
                                            // El fitxer extret ha d'incloure clipExtraTailSec (60 s per
                                            // defecte) MÉS ENLLÀ del final del bloc: si una connexió o un
                                            // directe s'allarga, el material ja és al clip i només cal
                                            // ESTIRAR-LO a la timeline. Retallar el que sobra no costa res;
                                            // no tenir-ne, en canvi, fa perdre la peça.
                                            // El clip insertat NO canvia (clipExpandedOutPoint = mp4Duration).
                                            const extraTailSec = (ctx.config && ctx.config.clipExtraTailSec != null)
                                                ? Number(ctx.config.clipExtraTailSec) : 60;
                                            let extractDuration = mp4Duration +
                                                ((isFinite(extraTailSec) && extraTailSec > 0) ? extraTailSec : 0);
                                            let useExtractedClip = false;

                                            // ═══ (2026-09-25c) SNAP A KEYFRAME: conversió source→fitxer ═══════
                                            // `ffmpeg -ss X -i src -c copy` NO pot arrencar fora de keyframe: ho fa
                                            // al keyframe ANTERIOR i, com que amb -c copy no es descarta el pre-roll,
                                            // el 0 del fitxer extret ≠ X. MESURAT (TNC V3 2026-09-25, GOP 1 s):
                                            // -ss 783 → el fitxer arrenca a 782.187 s del source.
                                            // → es mesura el keyframe amb ffprobe i s'extreu DES D'ALLÀ: així
                                            // "0 del fitxer == -ss" és cert per construcció i el pre-roll es compta
                                            // explícitament (fileIn = handleSecs + preRoll).
                                            let extractStartSec = bounds.mp4ExpandedInPoint;
                                            let preRollSec = 0;
                                            let kfOk = false;
                                            try {
                                                const _kf = await ffmpeg.keyframeAtOrBefore(effectiveMediaPath, bounds.mp4ExpandedInPoint, bounds.mp4ExpandedInPoint);
                                                if (_kf && _kf.ok) {
                                                    extractStartSec = _kf.kf;
                                                    preRollSec = _kf.preRoll;
                                                    kfOk = true;
                                                    extractDuration = extractDuration + preRollSec;   // mateix FINAL al source
                                                }
                                            } catch (eKf) {
                                                log(`⚠️ [EXTRACT] keyframeAtOrBefore: ${eKf.message} → extracció sense snap`);
                                            }
                                            cleanFeedData._ffmpeg = {
                                                ss: extractStartSec, t: extractDuration,
                                                requestedIn: bounds.mp4ExpandedInPoint, preRoll: preRollSec, kfOk: kfOk
                                            };

                                            // Estratègia: EXTREURE SEMPRE. Si el clip ja existeix, ffmpeg -y el sobreescriu.
                                            // Si el cleanFeed és massa petit, l'extracció fallarà (timeout a waitForFile).
                                            // Evitem checkSourceDuration perquè IO.executeShell amb pipes/fitxers temporals
                                            // no funciona correctament a ExtendScript (afegeix cometes extra als paths).
                                            log(`🎬 [EXTRACT] Extraient clip: input=${effectiveMediaPath}, start=${extractStartSec.toFixed(2)}s${kfOk ? ` (= keyframe; demanat ${bounds.mp4ExpandedInPoint.toFixed(2)}s + pre-roll ${preRollSec.toFixed(2)}s)` : ' (sense snap keyframe ✗)'}, dur=${extractDuration.toFixed(2)}s (bloc ${mp4Duration.toFixed(2)}s + cola extra ${(extractDuration - mp4Duration - preRollSec).toFixed(0)}s + pre-roll ${preRollSec.toFixed(2)}s), output=${clipPath}`);
                                            getUtils().status("🎬 Extraient clip via ffmpeg...", "info");
                                            const extractResult = await ffmpeg.extractClip(
                                                effectiveMediaPath,
                                                extractStartSec,
                                                extractDuration,
                                                clipPath
                                            );
                                            if (extractResult.ok) {
                                                useExtractedClip = true;
                                                log(`✅ [EXTRACT] Clip extret correctament: ${clipPath}`);
                                            } else {
                                                // NO FALLBACK: si l'extracció falla, error fatal
                                                const errMsg = `Error extraient clip: ${extractResult.error}`;
                                                log(`❌ [EXTRACT] ${errMsg}`);
                                                getUtils().status(errMsg, "error");
                                                throw new Error(errMsg);
                                            }

                                            if (useExtractedClip) {
                                                // ─── RECALCULAR BOUNDS PER AL CLIP EXTRET ────────
                                                // El clip extret comença a 0 (gràcies a -avoid_negative_ts make_zero).
                                                // Per tant, els bounds relatius al clip són:
                                                //   clipExpandedInPoint  = handleSecs   (el contingut real comença a handleSecs)
                                                //   clipExpandedOutPoint = mp4Duration - handleSecs
                                                //   clipDuration         = mp4Duration (el segment extret té exactament mp4Duration)
                                                const h = ctx.config.handles || 0;
                                                // (2026-09-25c) TOTS els temps del FITXER porten el pre-roll del snap
                                                // de keyframe: el contingut del bloc comença a (h + preRoll) del fitxer
                                                // extret, no a h. Sense això el clip queda desplaçat el pre-roll (~1 s).
                                                const clipExpandedInPoint  = h + preRollSec;
                                                const clipExpandedOutPoint = mp4Duration + preRollSec;
                                                const clipDuration         = mp4Duration;

                                                // worldSecMediaStart s'ajusta per al clip extret:
                                                // base REAL = worldSecMediaStart(cleanfeed) + extractStartSec (-ss efectiu).
                                                // Invariant: worldBlockStartSec − fbWorldSecMediaStart == clipExpandedInPoint.
                                                const fbWorldSecMediaStart = (isFinite(Number(worldSecMediaStart)) && isFinite(Number(extractStartSec)))
                                                    ? (Number(worldSecMediaStart) + Number(extractStartSec))
                                                    : ((bounds.ref.worldBlockStartSec != null)
                                                        ? bounds.ref.worldBlockStartSec - h
                                                        : bounds.ref.worldSecMediaStart);

                                                log(`📐 [EXTRACT] Bounds recalculats per al clip extret: IN=${clipExpandedInPoint.toFixed(1)}s OUT=${clipExpandedOutPoint.toFixed(1)}s dur=${clipDuration.toFixed(1)}s | worldSecMediaStart ajustat a ${fbWorldSecMediaStart.toFixed(1)}s | handleSecs=${h}s`);
                                                log(`🔍 [EXTRACT] cleanFeedData PRE-extracció: mediaPath=${cleanFeedData.mediaPath}, mp4ExpandedInPoint=${cleanFeedData.mp4ExpandedInPoint.toFixed(1)}s, mp4ExpandedOutPoint=${cleanFeedData.mp4ExpandedOutPoint.toFixed(1)}s`);

                                                // Actualitzar cleanFeedData amb el clip local i els nous bounds
                                                // NOTA: clipPath té backslashes (per a ffmpeg/PowerShell/Windows UNC).
                                                // Premiere necessita forward slashes per obrir el fitxer correctament.
                                                const premClipPath = clipPath.replace(/\\/g, "/");
                                                cleanFeedData.mediaPath           = premClipPath;
                                                log(`🔍 [EXTRACT] clipPath (backslash, per a ffmpeg)=${clipPath}`);
                                                log(`🔍 [EXTRACT] premClipPath (forward slash, per a Premiere)=${premClipPath}`);
                                                cleanFeedData.mp4ExpandedInPoint  = clipExpandedInPoint;   // ara relativament al clip (comença a 0)
                                                cleanFeedData.mp4ExpandedOutPoint = clipExpandedOutPoint;
                                                cleanFeedData.mp4Duration         = clipDuration;
                                                cleanFeedData._isExtractedClip    = true;  // flag per a diagnòstic
                                                // Actualitzar ref.worldSecMediaStart per a marcadors
                                                cleanFeedData._extractedWorldSecMediaStart = fbWorldSecMediaStart;
                                                // ⚠️ CRÍTIC: Actualitzar mp4SweetInPointRaw per al càlcul d'offsetSec posterior.
                                                // El clip extret comença a 0, per tant el "sweet point" sense offset = handleSecs.
                                                // Això és necessari perquè la fórmula offsetSec = tlClipStartSec - tlBlockInPointSec
                                                // faci servir el valor correcte (handleSecs) en lloc del valor original del cleanFeed.
                                                cleanFeedData.mp4SweetInPointRaw = h + preRollSec;
                                                log(`📐 [EXTRACT] mp4SweetInPointRaw actualitzat a ${(h + preRollSec).toFixed(2)}s (handleSecs ${h.toFixed(2)} + pre-roll ${preRollSec.toFixed(2)}) per al clip extret`);
                                                // (2026-09-25c) [DOMAINS] Dades de DOMINI per al dump d'una sola línia
                                                // de la fase [EXTRACT] (veure _domainsDump).
                                                cleanFeedData._wsmsCleanfeed   = Number(worldSecMediaStart);
                                                cleanFeedData._fileBase        = Number(fbWorldSecMediaStart);
                                                cleanFeedData._srcIn           = Number(bounds.mp4ExpandedInPoint);
                                                cleanFeedData._srcOut          = Number(bounds.mp4ExpandedOutPoint);
                                                cleanFeedData._mediaBlockStart = (bounds.ref && bounds.ref.worldBlockStartSec != null) ? Number(bounds.ref.worldBlockStartSec) : null;
                                                cleanFeedData._mediaBlockEnd   = (bounds.ref && bounds.ref.worldBlockEndSec != null) ? Number(bounds.ref.worldBlockEndSec) : null;
                                                cleanFeedData._clipPath        = clipPath;

                                                // Actualitzar també les referències del manifest (en memòria)
                                                if (manifest && manifest.ref) {
                                                    manifest.ref.worldSecMediaStart = fbWorldSecMediaStart;
                                                    // ⚠️ FIX (2026-09-17): el bloc, dins del CLIP EXTRET, comença a
                                                    // clipExpandedInPoint (handles), NO al valor del cleanFeed.
                                                    // Sense això offsetSec = -168 en lloc de -20 (148 s de desfasament).
                                                    manifest.ref.tlBlockInPointSec = clipExpandedInPoint;
                                                    manifest.ref.mp4ExpandedInPoint = clipExpandedInPoint;
                                                    manifest.ref.mp4ExpandedOutPoint = clipExpandedOutPoint;
                                                    manifest.ref.mp4Duration = clipDuration;
                                                    log(`📐 [EXTRACT] manifest.ref actualitzat: worldSecMediaStart=${fbWorldSecMediaStart.toFixed(2)}s, tlBlockInPointSec=${clipExpandedInPoint.toFixed(2)}s, dur=${clipDuration.toFixed(1)}s`);
                                                }

                                                log(`✅ [EXTRACT] cleanFeedData actualitzat: mediaPath=${cleanFeedData.mediaPath}, mp4ExpandedInPoint=${clipExpandedInPoint.toFixed(1)}s, mp4ExpandedOutPoint=${clipExpandedOutPoint.toFixed(1)}s, dur=${clipDuration.toFixed(1)}s`);
                                                getUtils().status(`✅ Clip extret: ${clipName}`, "exito");

                                                // Guardar al manifest: clipPath + ref actualitzat del clip extret
                                                try {
                                                    await FASTPASS_UI.SessionManifest.save(ctx, {
                                                        extractedClip: {
                                                            path: clipPath,
                                                            name: clipName,
                                                            isExtracted: true,
                                                            extractedWorldSecMediaStart: fbWorldSecMediaStart
                                                        },
                                                        ref: {
                                                            worldSecMediaStart: fbWorldSecMediaStart,
                                                            mp4ExpandedInPoint: clipExpandedInPoint,
                                                            mp4ExpandedOutPoint: clipExpandedOutPoint,
                                                            mp4Duration: clipDuration,
                                                            // ⚠️ FIX (2026-09-17): SENSE això el manifest conservava el
                                                            // tlBlockInPointSec del CLEANFEED (168 s) mentre el clip
                                                            // extret té el bloc a clipExpandedInPoint (20 s) -> offsetSec
                                                            // quedava a -168 en lloc de -20 = 148 s de desfasament a TOT
                                                            // el timeline (marcadors, chyrons i SRT).
                                                            tlBlockInPointSec: clipExpandedInPoint,
                                                            mp4SweetInPointRaw: clipExpandedInPoint
                                                        }
                                                    });
                                                    log(`✅ [EXTRACT] Manifest actualitzat amb ref del clip extret: worldSecMediaStart=${fbWorldSecMediaStart.toFixed(2)}s, mp4ExpandedInPoint=${clipExpandedInPoint.toFixed(2)}s`);

                                                    // ═══ (2026-09-25) SILENCIS A LA IMPORTACIÓ ═══════════════════
                                                    // Dada TRANSVERSAL: els silencis són l'única evidència FÍSICA del
                                                    // contingut (la escaleta pot anar 2 min desviada, com s'ha vist).
                                                    // Es calculen AQUÍ, una sola vegada, sobre l'àudio del CLIP EXTRET
                                                    // (.bin 480Hz) i es guarden al manifest perquè els facin servir:
                                                    //   · el punt de tall IN i OUT (validar/ajustar a fronteres reals)
                                                    //   · totes les capes de marcadors (CAPA 1 i següents)
                                                    // Temps en MEDIA del clip extret (base = clipPath extret).
                                                    try {
                                                        const _wg = window.FASTPASS_UI.Logic.WaveformGenerator;
                                                        if (_wg && _wg.silences) {
                                                            const _sil = (await _wg.silences()) || [];
                                                            if (_sil.length) {
                                                                await FASTPASS_UI.SessionManifest.save(ctx, {
                                                                    ref: {
                                                                        silencesCount: _sil.length,
                                                                        silencesJson: JSON.stringify(_sil),
                                                                        silencesSource: 'extractedClip',
                                                                        silencesThreshold: 0.05,
                                                                        silencesMinDur: 0.4
                                                                    }
                                                                });
                                                                log(`🤫 [SILENCI·IMPORT] ${_sil.length} trams guardats al manifest: ` + _sil.map(function (s) { return s.start.toFixed(2) + '→' + s.end.toFixed(2) + '(' + s.dur.toFixed(2) + 's)'; }).join(', '));
                                                            } else {
                                                                log('🤫 [SILENCI·IMPORT] Sense trams (o .bin encara no generat) → es calcularà més tard.');
                                                            }
                                                        }
                                                    } catch (eSil) {
                                                        log(`⚠️ [SILENCI·IMPORT] No s'han pogut calcular els silencis: ${eSil.message}`);
                                                    }

                                                    // ═══ (2026-09-25) ANCLA D'AUDIO DEL INICI DEL BLOC ═══════════════
                                                    // La escaleta NO pot dir on comença el bloc (no té el tema anterior:
                                                    // prevista 14:00:48 vs real 14:02:31 = 103 s d'error). L'ÀUDIO sí:
                                                    // la junta entre el tema anterior i la intro és el PRIMER silenci
                                                    // (≥0,4s) amb un burst previ ≥30 s (TNC V2 2026-09-25: 124.10→124.60
                                                    // amb burst de 124 s ✓ vs el 2n silenci a 127.00 amb burst de 2,4 s ✗).
                                                    // Regla: IN del bloc = silenci.start − 0,5 s (VALIDADA amb el tall
                                                    // manual de l'operador: 123,5 ✓).
                                                    try {
                                                        const _wg2 = window.FASTPASS_UI.Logic.WaveformGenerator;
                                                        const _ref2 = manifest && manifest.ref ? manifest.ref : null;
                                                        const _base2 = _ref2 ? Number(_ref2.worldSecMediaStart) : NaN;
                                                        if (_wg2 && _wg2.silences && isFinite(_base2)) {
                                                            const _sil2 = (await _wg2.silences()) || [];
                                                            const _estSec = (bounds && bounds.ref && isFinite(Number(bounds.ref.worldBlockStartSec)))
                                                                ? Number(bounds.ref.worldBlockStartSec)
                                                                : NaN;
                                                            const _estFile = isFinite(_estSec) ? (_estSec - _base2) : clipExpandedInPoint;
                                                            let _junc = null;
                                                            for (let _i = 0; _i < _sil2.length; _i++) {
                                                                const _s = _sil2[_i];
                                                                if (!_s || !(_s.dur >= 0.4)) continue;
                                                                if (isFinite(_estFile) && Math.abs(_s.start - _estFile) > 300) continue;
                                                                const _prevEnd = (_i > 0) ? Number(_sil2[_i - 1].end) : 0;
                                                                if ((_s.start - _prevEnd) < 30) continue;   // burst previ suficient
                                                                _junc = _s; break;
                                                            }
                                                            if (_junc) {
                                                                const _newFileIn = Math.max(0, Number(_junc.start) - 0.5);
                                                                log(`🎯 [IN·AUDIO] Junta tema anterior → intro: silenci ${Number(_junc.start).toFixed(2)}→${Number(_junc.end).toFixed(2)}s (dur ${Number(_junc.dur).toFixed(2)}s, burst previ ≥30s) · IN del bloc ${_estFile.toFixed(2)} → ${_newFileIn.toFixed(2)}s (dins el clip) · Δ=${(_newFileIn - _estFile).toFixed(2)}s`);
                                                                // ═══ (2026-09-25) JERARQUIA DE FONTS (regla d'usuari) ═══════════════
                                                                // 1r OnAir (emissió real) — 2n hora de l'ítem (prevista) — el SILENCI
                                                                // només CONFIRMA bounds i markers: dins ±3 s → ✅ confirma; fora o
                                                                // sense silenci → NEUTRE (no decideix mai). Mai al revés.
                                                                if (Math.abs(_newFileIn - _estFile) <= 3.0) {
                                                                    log(`✅ [IN·AUDIO] CONFIRMA l'IN de la escaleta (${_estFile.toFixed(2)}s): hi ha un tall d'àudio a ${_newFileIn.toFixed(2)}s (Δ=${(_newFileIn - _estFile).toFixed(2)}s).`);
                                                                } else {
                                                                    log(`ℹ️ [IN·AUDIO] Neutre: la junta d'àudio (${_newFileIn.toFixed(2)}s) no és a prop de l'IN (${_estFile.toFixed(2)}s, Δ=${(_newFileIn - _estFile).toFixed(2)}s). El silenci NO decideix (la INTRO no té silenci: música/sting continu) → mana l'hora de l'escaleta/OnAir. Dada desada per als marcadors (CAPA 1).`);
                                                                }
                                                            } else {
                                                                log('⚠️ [IN·AUDIO] Sense junta d\'àudio fiable al .bin → es manté l\'IN de la escaleta (revisa el tall a mà).');
                                                            }
                                                        }
                                                    } catch (eInAud) {
                                                        log(`⚠️ [IN·AUDIO] ${eInAud.message}`);
                                                    }
                                                } catch(eManifest) {
                                                    log(`⚠️ [EXTRACT] Error guardant dades del clip al manifest: ${eManifest.message}`);
                                                }
                                            } else {
                                                log(`ℹ️ [EXTRACT] No s'usa clip extret. Es manté el comportament actual (MP4 complet).`);
                                            }
                                        } else {
                                            // Missatge HONEST del motiu pel qual no s'extreu cap clip.
                                            if (skipVideoIngesta) {
                                                log(`⏳ [EXTRACT] Omesa: el bloc no té material al cleanFeed → projecte sense vídeo (ACTUALITZAR després).`);
                                            } else {
                                                log(`ℹ️ [EXTRACT] FFmpegLogic.extractClip no disponible. Usant MP4 complet (fallback).`);
                                            }
                                        }
                                    } catch (eExtract) {
                                        log(`⚠️ [EXTRACT] Error durant extracció de clip: ${eExtract.message}. Continuant sense clip extret.`);
                                    }
                                    // ─── FI FASE 0 ───────────────────────────────────────────

                                    // ─── FASE 1: Volcado de escaleta al JSON de análisis ──────
                                    try {
                                        const contextItems = {};
                                        // Extraer items de contexto (prev/next video item)
                                        const allEscaletaItems = jsonData.escaleta ? (jsonData.escaleta.liniesEscaleta || []) : [];
                                        if (allEscaletaItems.length > 0) {
                                            const sortedAll = allEscaletaItems.slice().filter(function(l) {
                                                return l.horaEntradaOnAir && l.horaEntradaOnAir !== '00:00:00';
                                            }).sort(function(a, b) {
                                                return reader.tcToSeconds(a.horaEntradaOnAir) - reader.tcToSeconds(b.horaEntradaOnAir);
                                            });
                                            if (sortedAll.length > 0) {
                                                // Primer item del bloque actual
                                                const firstBlockLine = lines[0];
                                                const firstBlockIdx = sortedAll.indexOf(firstBlockLine);
                                                if (firstBlockIdx > 0) {
                                                    const prevItem = sortedAll[firstBlockIdx - 1];
                                                    contextItems.prevVideoItem = {
                                                        num: prevItem.num || '',
                                                        titol: prevItem.titol || '',
                                                        agrupacio: prevItem.agrupacio || null,
                                                        horaEntradaOnAir: prevItem.horaEntradaOnAir,
                                                        duradaOnAir: prevItem.duradaOnAir || '0:00'
                                                    };
                                                }
                                                // Último item del bloque actual
                                                const lastBlockLine = lines[lines.length - 1];
                                                const lastBlockIdx = sortedAll.indexOf(lastBlockLine);
                                                if (lastBlockIdx >= 0 && lastBlockIdx < sortedAll.length - 1) {
                                                    const nextItem = sortedAll[lastBlockIdx + 1];
                                                    contextItems.nextVideoItem = {
                                                        num: nextItem.num || '',
                                                        titol: nextItem.titol || '',
                                                        agrupacio: nextItem.agrupacio || null,
                                                        horaEntradaOnAir: nextItem.horaEntradaOnAir,
                                                        duradaOnAir: nextItem.duradaOnAir || '0:00'
                                                    };
                                                }
                                            }
                                        }
                                        await FASTPASS_UI.Logic.Analysis.saveEscaleta(
                                            ctx, jsonMeta.filename, lines, contextItems, bounds
                                        );
                                    } catch (eAnalysis) {
                                        log("⚠️ [Analysis] Error guardant escaleta: " + eAnalysis.message);
                                    }
                                    // ─────────────────────────────────────────────────────────
                                } else {
                                    // Fallback al sistema anterior si el nou no funciona
                                    log(`⚠️ calcPrecisionTrimBounds ha retornat null. Usant calcOnAirBounds com a fallback.`);
                                    const fallbackBounds = reader.calcOnAirBounds(
                                        jsonData,
                                        ctx.bloque,
                                        jsonData.cleanFeed.mediaStart,
                                        cleanFeedMediaStopEff || jsonData.cleanFeed.mediaStop,
                                        ctx.config
                                    );
                                    if (fallbackBounds) {
                                        const lines = reader.getLinesForBlock(jsonData, ctx.bloque);
                                        // Calcular el punt d'inici del MP4 per al fallback
                                        const fbWorldSecMediaStart = fallbackBounds.ref ? fallbackBounds.ref.worldSecMediaStart : 0;
                                        let fbProgramInPoint = worldProgramStartSec - fbWorldSecMediaStart;
                                        // Aplicar offset global de TC per corregir deriva sistemàtica d'ingesta
                                        fbProgramInPoint = getUtils().applyGlobalOffsetSec(fbProgramInPoint);
                                        if (fbProgramInPoint < 0) fbProgramInPoint = 0;
                                        if (fbProgramInPoint > fallbackBounds.mp4ExpandedInPoint) fbProgramInPoint = fallbackBounds.mp4ExpandedInPoint;
                                        log(`📡 [ProgramStart-Fallback] ${shortProg}: mp4ProgramInPoint=${fbProgramInPoint.toFixed(2)}s (original fallbackInPoint=${fallbackBounds.mp4ExpandedInPoint.toFixed(2)}s)`);

                                        const fbHandleSecs = ctx.config.handles || 0;   // font única (Config.get().handles)
                                        cleanFeedData = {
                                            handleSecs: fbHandleSecs,   // font única de veritat (escaleta_reader.js)
                                            mediaPath: jsonData.cleanFeed.mediaPath,
                                            mp4ProgramInPoint: fbProgramInPoint,
                                            mp4ExpandedInPoint: fallbackBounds.mp4ExpandedInPoint,   // expanded (amb handle), SENSE offset
                                            mp4ExpandedOutPoint: fallbackBounds.mp4ExpandedOutPoint, // expanded (amb handle), SENSE offset
                                            mp4Duration: fallbackBounds.mp4Duration,
                                            escaletaLines: lines
                                        };
                                        await FASTPASS_UI.SessionManifest.save(ctx, {
                                            program: { escaletaFile: jsonMeta.filename },
                                            cleanFeed: jsonData.cleanFeed,
                                            blockBounds: fallbackBounds,
                                            ref: {
                                                ...fallbackBounds.ref,
                                                tlBlockInPointSec: fallbackBounds.mp4ExpandedInPoint  // expanded SENSE offset (consistent amb path principal)
                                            },
                                            escaletaItems: toManifestItems(allItems),
                                            phases: { boundsCalculated: true }
                                        });
                                        log(`📡 [Fallback] cleanFeed: in=${fallbackBounds.mp4ExpandedInPoint.toFixed(1)}s out=${fallbackBounds.mp4ExpandedOutPoint.toFixed(1)}s`);

                                        // ─── FASE 1: Volcado de escaleta al JSON de análisis (fallback) ──────
                                        try {
                                            const contextItems = {};
                                            const allEscaletaItems = jsonData.escaleta ? (jsonData.escaleta.liniesEscaleta || []) : [];
                                            if (allEscaletaItems.length > 0) {
                                                const sortedAll = allEscaletaItems.slice().filter(function(l) {
                                                    return l.horaEntradaOnAir && l.horaEntradaOnAir !== '00:00:00';
                                                }).sort(function(a, b) {
                                                    return reader.tcToSeconds(a.horaEntradaOnAir) - reader.tcToSeconds(b.horaEntradaOnAir);
                                                });
                                                if (sortedAll.length > 0) {
                                                    const firstBlockLine = lines[0];
                                                    const firstBlockIdx = sortedAll.indexOf(firstBlockLine);
                                                    if (firstBlockIdx > 0) {
                                                        const prevItem = sortedAll[firstBlockIdx - 1];
                                                        contextItems.prevVideoItem = {
                                                            num: prevItem.num || '',
                                                            titol: prevItem.titol || '',
                                                            agrupacio: prevItem.agrupacio || null,
                                                            horaEntradaOnAir: prevItem.horaEntradaOnAir,
                                                            duradaOnAir: prevItem.duradaOnAir || '0:00'
                                                        };
                                                    }
                                                    const lastBlockLine = lines[lines.length - 1];
                                                    const lastBlockIdx = sortedAll.indexOf(lastBlockLine);
                                                    if (lastBlockIdx >= 0 && lastBlockIdx < sortedAll.length - 1) {
                                                        const nextItem = sortedAll[lastBlockIdx + 1];
                                                        contextItems.nextVideoItem = {
                                                            num: nextItem.num || '',
                                                            titol: nextItem.titol || '',
                                                            agrupacio: nextItem.agrupacio || null,
                                                            horaEntradaOnAir: nextItem.horaEntradaOnAir,
                                                            duradaOnAir: nextItem.duradaOnAir || '0:00'
                                                        };
                                                    }
                                                }
                                            }
                                            await FASTPASS_UI.Logic.Analysis.saveEscaleta(
                                                ctx, jsonMeta.filename, lines, contextItems, fallbackBounds
                                            );
                                        } catch (eAnalysis) {
                                            log("⚠️ [Analysis] Error guardant escaleta (fallback): " + eAnalysis.message);
                                        }
                                        // ─────────────────────────────────────────────────────────────────
                                    }
                                }
                            }
                        } else {
                            log(`⚠️ Cap JSON d'escaleta per a ${ctx.progData.archivo}. Usant mp4 estàndard.`);
                        }
                    }
                } catch (eReader) {
                    log(`⚠️ EscaletaReader: ${eReader.message}. Continuant sense dades OnAir.`);
                }
                // ─────────────────────────────────────────────────────────────────────────

                log(`🏗️ Generant projecte: ${fileName}`);

                // 1. CREACIÓ FÍSICA (Crea seqüència i inserta el clip del cleanFeed amb els bounds calculats)
                await FASTPASS_UI.Logic.Project.create(ctx, assets.wotts, paths, assets.portada, shortProg,
                    // (2026-10-23) Si el bloc no té material al cleanFeed (ingesta curta o
                    // bloc emès fora del rang) es crea SENSE VÍDEO; ACTUALITZAR el col·locarà.
                    skipVideoIngesta ? null : cleanFeedData);

                // 2. FINALITZAR ref (Obtenir tlClipStartSec real post-inserció)
                // (2026-10-23) Sense vídeo (`skipVideoIngesta`) no hi ha clip a V1: no
                // s'ha de finalitzar cap ref ni fer el dump de dominis.
                if (cleanFeedData && !skipVideoIngesta) {
                    log("📐 Finalitzant ref post-inserció...");
                    
                    // Llegir la posició real del clip al timeline via Clips.get()
                    // Usem start.seconds (posició al timeline), NO inPoint.seconds (relatiu al source)
                    const clipDataRaw = await callJSX(`Clips.get(1, 0, 'video')`);
                    let tlClipStartSec = NaN;
                    let _clipInPtReal = null;   // (2026-09-25) inPoint REAL del clip inserit
                    try {
                        const clipData = JSON.parse(clipDataRaw);
                        tlClipStartSec = clipData.start;
                        if (clipData.inPoint !== undefined && clipData.inPoint !== null && isFinite(Number(clipData.inPoint))) {
                            _clipInPtReal = Number(clipData.inPoint);
                        }
                        log(`🔍 [LOG] Clips.get(1,0): start=${clipData.start}, inPoint=${clipData.inPoint}, end=${clipData.end}`);
                    } catch(e) {
                        log(`⚠️ Error parsejant clipData: ${clipDataRaw}`);
                    }
                    // (2026-09-25c) 🔎 DUMP ÚNIC DE DOMINIS (fase [EXTRACT]): totes les escales de cop
                    // (media · fitxer · timeline) + verificació de les invariants en una sola línia.
                    this._domainsDump(cleanFeedData);
                    
                    if (!isNaN(tlClipStartSec)) {
                        // Usar tlBlockInPointSec (inici del bloc en source MP4, SENSE offset global)
                        // per al càlcul de offsetSec. La fórmula dels marcadors
                        // (worldSecOnAir - worldSecMediaStart) + offsetSec espera que
                        // offsetSec = tlClipStartSec - tlBlockInPointSec.
                        // NOTA: El clip s'inserta a start=0 amb source IN = mp4SweetInPoint (AMB offset).
                        // tlBlockInPointSec = mp4SweetInPointRaw (SENSE offset) perquè la fórmula
                        // offsetSec = tlClipStartSec - tlBlockInPointSec = 0 - mp4SweetInPointRaw
                        // ja reflecteix correctament la conversió source→timeline incloent l'offset
                        // (les marques de posicionament de Premiere es cancel·len amb l'offset aplicat al source).
                        // ═══ (2026-09-25) FIX ARREL: el manifest ha de dir la VERITAT del clip ═══
                        // `clipInOffset` (config) fa que el clip s'insereixi amb MENYS IN del
                        // previst (TNC V2: IN real=10.00s vs manifest=20.00s) → 10s d'error
                        // sistemàtic a TOTS els marcadors. Si el clip té un inPoint llegible,
                        // mana AQUEST (és el que hi ha de debò a la línia de temps).
                        const _tlBlockInPtPrevist = (manifest.ref?.tlBlockInPointSec ?? cleanFeedData.mp4SweetInPointRaw) + (ctx.config.tcOffset || 0);
                        const tlBlockInPointSec = (_clipInPtReal !== null && Math.abs(_clipInPtReal - _tlBlockInPtPrevist) > 0.5)
                            ? _clipInPtReal
                            : _tlBlockInPtPrevist;
                        if (_clipInPtReal !== null && Math.abs(_clipInPtReal - _tlBlockInPtPrevist) > 0.5) {
                            log(`⚠️ [REF] IN del clip (${_clipInPtReal.toFixed(3)}s) ≠ previst (${_tlBlockInPtPrevist.toFixed(3)}s) → el manifest s'actualitza amb el REAL (clipInOffset=${(ctx.config.clipInOffset||0)}s). Els marcadors s'alinearan amb el material de la timeline.`);
                        }
                        const offsetSec = tlClipStartSec - tlBlockInPointSec;
                        
                        log(`🔍 [LOG] CÀLCUL ref: tlClipStartSec=${tlClipStartSec.toFixed(4)}s - tlBlockInPointSec=${tlBlockInPointSec.toFixed(4)}s (inclou offset=${(ctx.config.tcOffset||0).toFixed(4)}s) = offsetSec=${offsetSec.toFixed(4)}s (mp4SweetInPoint=${cleanFeedData.mp4SweetInPoint.toFixed(4)}s, raw=${cleanFeedData.mp4SweetInPointRaw.toFixed(4)}s)`);
                        
                        // Actualitzar manifest amb la posició real i sincronitzar en memòria
                        Object.assign(manifest, await FASTPASS_UI.SessionManifest.save(ctx, {
                            ref: {
                                tlClipStartSec: tlClipStartSec,
                                offsetSec: offsetSec
                            },
                            phases: {
                                mp4Imported: true,
                                tcRefEstablished: true
                            }
                        }));
                        log(`📐 ref establert: offsetSec=${offsetSec.toFixed(3)}s (tlClipStartSec=${tlClipStartSec.toFixed(3)}s)`);
                    } else {
                        log("⚠️ No es pot llegir tlClipStartSec de V1. ref quedarà incomplet.");
                    }
                }

                // Registrar como último proyecto abierto
                if (window.FASTPASS_UI && window.FASTPASS_UI.State) {
                    window.FASTPASS_UI.State.lastOpenedProjectName = fileName;
                    window.FASTPASS_UI.State.projectDateDir = ctx.dateDir;
                }

                log("✅ Workflow NOU completat amb èxit.");
                // Actualizar contexto
                if (FASTPASS_UI.Core && FASTPASS_UI.Core.Context) {
                    await FASTPASS_UI.Core.Context.checkContext();
                }
        
            } catch (e) {
                FASTPASS_UI.Utils.log("💥 Error crític a runNew: " + e.message, "ERROR");
            }
        },


        _runUpdate: async function () {
            log("🚀 [FLOW-UPDATE]");
            const ctx = await this._setupContext();
            
            // 1. ESCANEIG I SYNC
            const assets = await this._fullScan(ctx);

            if (!assets.wotts || !assets.wotts.tema) {
                log("⚠️ Encara no hi ha rètols al NAS. Guardant progrés...");
                return await callJSX("Project.save()");
            }

            const currentPath = await callJSX("Project.path()");

            if (currentPath.indexOf("PENDENT") !== -1) {
                log("🧬 Projecte PENDENT detectat. Promocionant...");

                const sanitizedTema = getUtils().sanitizeName(assets.wotts.tema);
                const newProjectName = ctx.config.naming.getProjectName(ctx, sanitizedTema);
                const newPath = getUtils().workFolder(ctx) + "\\" + "Pruebas_" + newProjectName + ".prproj";

                // INGESTA I SYNC
                await this._completeSyncUI(ctx, assets);

                log(`💾 Guardant com a: ${newPath}`);
                const saveRes = await callJSX(`Project.saveAs('${getUtils().escape(newPath)}')`);

                if (saveRes === "OK") {
                    log(`🗑️ Eliminant rastre PENDENT...`);
                    getUtils().deleteFile(currentPath);
                    getUtils().deleteFile(currentPath + ".lock");
                    await FASTPASS_UI.Logic.Project.lock(newPath);
                    log("🟢 Projecte promocionat amb èxit!");
                    // Actualizar contexto para que el botón refleje el estado actual
                    if (FASTPASS_UI.Core && FASTPASS_UI.Core.Context) {
                        await FASTPASS_UI.Core.Context.checkContext();
                    }
                }
            } else {
                // INGESTA I SYNC ESTÀNDARD
                await this._completeSyncUI(ctx, assets);
                await callJSX("Project.save()");
                log("✅ Actualització completada.");
                // Actualizar contexto para que el botón refleje el estado actual
                if (FASTPASS_UI.Core && FASTPASS_UI.Core.Context) {
                    await FASTPASS_UI.Core.Context.checkContext();
                }
            }
        },

        _runGo: async function (data) {
            const projName = data.name;
            log(`🚀 Canviant focus a: ${projName}...`);
            // Intentar cambiar el foco via Context.set
            let setResult = await callJSX(`Context.set('${getUtils().escape(projName)}')`);
            
            // Construir ruta completa del proyecto
            const folderPath = getUtils().workFolder(data);
            const fullPath = (folderPath + "/" + projName).replace(/\\/g, "/");
            
            // Si Context.set falla, intentar con Project.open
            if (setResult !== "OK") {
                log(`⚠️ Context.set falló, intentando Project.open...`);
                const openResult = await callJSX(`FASTPASS.Project.open('${getUtils().escape(fullPath)}')`);
                if (openResult !== "OK") {
                    log(`❌ No se pudo cambiar el foco al proyecto.`);
                    return;
                }
            } else {
                // Aunque Context.set tuvo éxito, forzar apertura para asegurar foco visual
                const openResult = await callJSX(`FASTPASS.Project.open('${getUtils().escape(fullPath)}')`);
            }
            
            // Sincronizar assets (igual que antes)
            // (2026-11-02 · BUG #220) Context de SESSIÓ: la data ha de ser la del
            // .prproj que s'acaba d'obrir, no la de checkContext (HOY).
            const ctx = await this._sessionCtx();
            const assets = await this._fullScan(ctx);
            await this._completeSyncUI(ctx, assets);
            
            if (FASTPASS_UI.Core && FASTPASS_UI.Core.Context) {
                await FASTPASS_UI.Core.Context.checkContext();
            }
        },

        _runLoad: async function (data) {
            log("🚀 [FLOW-LOAD]");
            // Usar el proyecto existente pasado en data
            const projName = data.name; // Nombre completo del archivo .prproj
            const folderPath = getUtils().workFolder(data);
            const destPath = (folderPath + "/" + projName).replace(/\\/g, "/");
            log(`📂 Abriendo proyecto existente: ${destPath}`);

            // ─── Inicialitzar fitxer de log per a aquest projecte ──────────────────
            getUtils()._setLogPath(folderPath, projName);

            const forceOverride = data.forceOverride || false;
            
            // Verificar lock solo si no estamos forzando
            if (!forceOverride) {
                const lockPath = destPath + ".lock";
                // Lock debug comentado para reducir ruido
                // log(`🔍 [FLOW-LOAD] Verificando lock: ${lockPath}`);
                const lockExists = await callJSX(`IO.exists('${getUtils().escape(lockPath)}')`);
                // log(`🔍 [FLOW-LOAD] lockExists = ${lockExists}`);
                let lockOwner = null;
                if (lockExists === "true") {
                    lockOwner = await callJSX(`IO.readTxt('${getUtils().escape(lockPath)}')`);
                    lockOwner = lockOwner.trim();
                    // log(`🔍 [FLOW-LOAD] lockOwner = "${lockOwner}"`);
                }
                const currentUser = data.config.autor;
                // log(`🔍 [FLOW-LOAD] currentUser = "${currentUser}"`);
                if (lockOwner && lockOwner !== currentUser) {
                    log(`⚠️ [FLOW-LOAD] Lock pertenece a otro usuario. Mostrando alerta.`);
                    // Mostrar alerta
                    alert(`${lockOwner} ya está editando ${data.progData.archivo} ${data.bloque}.`);
                    // Cambiar botón a LOCKED
                    if (FASTPASS_UI.Core && FASTPASS_UI.Core.Context) {
                        // Lock debug comentado para reducir ruido
                        // log(`🔍 [FLOW-LOAD] Actualizando botón a LOCKED.`);
                        FASTPASS_UI.Core.Context.updateButton('LOCKED', { ...data, lockOwner });
                    }
                    return;
                } else {
                    // Lock debug comentado para reducir ruido
                    // log(`🔍 [FLOW-LOAD] Lock propio o inexistente, continuando.`);
                }
            }
            
            // Bloquear el proyecto (lock) - sobrescribirá si forceOverride es true
            await FASTPASS_UI.Logic.Project.lock(destPath);
            
            // Abrir proyecto
            const openResult = await callJSX(`FASTPASS.Project.open('${getUtils().escape(destPath)}')`);
            log(`🔍 [FLOW-LOAD] Resultado de Project.open: ${openResult}`);
            
            if (openResult !== "OK") {
                log(`❌ [FLOW-LOAD] No se pudo abrir el proyecto.`);
                return;
            }
            
            // Sincronizar assets (importar solo los faltantes)
            // (2026-11-02 · BUG #220) Context de SESSIÓ: obrir el projecte d'AHIR
            // ha de reconstruir el manifest a la carpeta del PROJECTE, no a la
            // del dia d'avui (`_setupContext` donava `State.dateDir` = HOY).
            const ctx = await this._sessionCtx();
            const assets = await this._fullScan(ctx);
            await this._completeSyncUI(ctx, assets);

            // ─── ESCALETA LOCAL + MANIFEST ──
            // Al obrir un projecte, la extensió treballa amb la còpia local de
            // l'escaleta al directori del projecte. Si no hi és, es baixa del NAS
            // i es copia. El manifest es regenera des de l'últim JSON del directori.
            await this._rebuildManifestFromLocal(ctx);

            // Registrar como último proyecto abierto
            if (window.FASTPASS_UI && window.FASTPASS_UI.State) {
                window.FASTPASS_UI.State.lastOpenedProjectName = projName;
                window.FASTPASS_UI.State.projectDateDir = ctx.dateDir;
            }
            
            log("✅ Projecte obert.");
            // Actualizar contexto para que el botón cambie a UPDATE si el proyecto está abierto
            if (FASTPASS_UI.Core && FASTPASS_UI.Core.Context) {
                await FASTPASS_UI.Core.Context.checkContext();
            }
        },

        // (2026-10-23) RETIRATS `_validateBlockMedia`, `_fileMtimeSecOfDay`, `_secToHHMMSS` i
        // `_guardBlockMedia`: tots validaven el MP4 del bloc que publicava el pipeline de
        // VERTICALITZACIO. Sense eixe flux, el unic video possible es la captura del cleanFeed
        // i la seua coherencia la garanteixen els bounds (isBoundsOutOfCleanFeedRange).

        /**
         * _fullScan: Escaneja rètols i portada, i actualitza flags de Context.
         */
        _fullScan: async function (ctx) {
            log("🔍 [SCAN] Analitzant context i materials...");
            // ── TIMING I SEMÀFOR «OCUPAT» (2026-10-29 · BUG #204) ───────────────
            // En fred, `Scan.wotts` llig la carpeta de rètols per UNC via JSX (1281
            // fitxers datats un a un): el 29/10 van ser 103 s amb el fil del panell
            // BLOQUEJAT i el semàfor WOT en verd intermitent —que significa «ja
            // importable»—, de manera que l'usuari només veia parpadejar un llum.
            // Ara: (1) el WOT es pinta en BLAU mentres dura i (2) cada tram deixa
            // marca FORÇADA al `_boot_timing.log` (abans no en quedava cap, perquè
            // el log es tanca a l'ARRENCADA COMPLETA i estes marques no hi arribaven).
            const _tFS = Date.now();
            const _bFS = (lbl) => {
                try {
                    const B = window.FASTPASS_UI && window.FASTPASS_UI.Boot;
                    if (B && typeof B.mark === 'function') { B.mark('[SCAN] ' + lbl, 'force'); }
                } catch (eB) { }
            };
            const _secFS = (t0) => ((Date.now() - t0) / 1000).toFixed(1) + ' s';
            const _ctxUI = window.FASTPASS_UI && window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.Context;
            if (_ctxUI && typeof _ctxUI.setSemaforOcupat === 'function') {
                _ctxUI.setSemaforOcupat('sem-wot', 'Analitzant els rètols del NAS…' +
                    ' (amb el NAS fred pot trigar un minut o més)');
            }
            try {
                // 1. Materials del NAS: rètols (CHY) i portades (PNG del dia)
                //    (2026-10-23) El vídeo ja no s'escaneja: ix del cleanFeed.
                const _tW = Date.now();
                const wotts = await window.Scan.wotts(ctx);
                _bFS('_fullScan · wotts del NAS (' + _secFS(_tW) + ')');
                const _tP = Date.now();
                const portada = await window.Scan.portadas(ctx);
                _bFS('_fullScan · portades (' + _secFS(_tP) + ')');

                // 2. Actualitzem State global
                // ── F3 (2026-10-01) · una lectura FALLIDA no ha de mentir sobre l'estat ──
                // F1 fa que una lectura fallida sigui `failed`/`null` (i no una llista
                // buida silenciosa). Aquí NO s'ha de publicar aquest buit com si fos real:
                // es conserva l'estat anterior i s'avisa amb ERROR (nivell sempre visible).
                if (wotts.failed) {
                    log('❌ [SCAN] Lectura dels RÈTOLS del NAS FALLIDA → es conserva detectedTheme/' +
                        'structure (' + (window.FASTPASS_UI.State.structure ? window.FASTPASS_UI.State.structure.length : 0) +
                        ' blocs). Torna a prémer el botó.', 'ERROR');
                } else {
                    window.FASTPASS_UI.State.detectedTheme = wotts.tema;
                }
                // Generar estructura de blocs a partir dels Wotts
                // ⚠️ (2026-10-15 · F6c) NO CONFONDRE: aquest `State.structure` és la
                // LLISTA DE BLOCS WOTT (rètols del NAS, via `Parse.files`) — una
                // variable d'àmbit UI. La secció `structure` del manifest v2.0
                // (`.fastpass.json` → `manifest.structure.items[]`) és una ALTRA
                // cosa: la vista MESTRA per ítem d'escaleta, que es llig amb
                // `SessionManifest.getItems()` / `AnalysisCenter.getStructure(m)` i
                // la reconstrueix `AnalysisCenter.composeStructure()`. No barrejar-les.
                if (wotts.list && wotts.list.length > 0) {
                    window.FASTPASS_UI.State.structure = window.Parse.files(wotts.list, ctx.progData.wott, ctx.bloque);
                    window.FASTPASS_UI.State.pieceIndex = 0;
                    log(`🏗️ Estructura generada: ${window.FASTPASS_UI.State.structure.length} blocs`);
                } else if (!wotts.failed) {
                    // Cas real (2026-10-01): amb la lectura fallida NO es buida
                    // `structure`, perquè tots els botons de chyrons quedaven morts
                    // amb "No hi ha estructura carregada" i el símptoma deia
                    // "no s'han importat els wotts" sense cap pista de la causa.
                    window.FASTPASS_UI.State.structure = [];
                    window.FASTPASS_UI.State.pieceIndex = 0;
                    log("⚠️ No hi ha Wotts per generar estructura");
                }

                // 3. Verificació de projecte existent al destí
                const _tD = Date.now();
                const folderDest = getUtils().workFolder(ctx);
                const projectFiles = await getUtils().readFolder(folderDest);
                const existingProj = window.Scan.selectedProject(projectFiles, ctx.progData.wott, ctx.bloque);
                _bFS('_fullScan · carpeta del projecte (' + _secFS(_tD) + ')');

                window.FASTPASS_UI.State.activeProjectName = existingProj;
                window.FASTPASS_UI.State.buttonState = existingProj ? "OPEN" : "NEW";

                // Retornem el paquet d'assets per a ús immediat
                return { wotts, portada };
            } finally {
                _bFS('_fullScan TOTAL (' + _secFS(_tFS) + ')');
                if (_ctxUI && typeof _ctxUI.setSemaforLliure === 'function') {
                    _ctxUI.setSemaforLliure('sem-wot');
                }
            }
        },

        /**
         * _completeSyncUI: Ingesta rètols i portades, i activa targeting.
         */
        _completeSyncUI: async function(ctx, assets) {
            log("🎞️ [SYNC] Ingestant assets i fixant focus...");
            
            // 1. Ingesta (rètols + portades). El vídeo NO s'ingesta ací: el col·loca
            //    `Project.create` (clip del cleanFeed) i, si no n'hi ha, ACTUALITZAR.
            await FASTPASS_UI.Logic.Project.ingestAssets(ctx, assets.wotts, assets.portada);

            // 2. (TO DO UPDATE #2) NO col·locar el SRT a la pista de subtítols aquí.
            // El SRT es gestiona únicament via l'editor SRT (CARREGAR + EXPORTAR),
            // així que UPDATE/GO/LOAD no han de crear cap caption track.


            // 3. Focus i Targeting
            await callJSX("Tracks.target(1, true, 'video')");
            await callJSX("Tracks.target(1, true, 'audio')");
        },

        /**
         * _domainsDump: 🔎 DUMP ÚNIC DE DOMINIS (fase [EXTRACT]).
         *
         * Els 3 dominis que NO es poden barrejar:
         *   (a) MEDIA/món      → wsms (inici del cleanfeed en segons del dia), bloc(media)
         *   (b) FITXER extret  → base-fitxer (= wsms + -ss), fileIn/fileOut del contingut
         *   (c) TIMELINE V1    → clip.inPoint/outPoint reals, corchete IN/OUT (seq)
         *
         * Invariants que s'imprimeixen amb OK/MISMATCH:
         *   1) 0-fitxer == -ss        : la base del fitxer ha de ser el -ss efectiu
         *   2) contingut == fileIn     : (inici del bloc − base) == fileIn del pla (handle+preRoll)
         *   3) clip.inPoint == pla     : el recorte real ha de ser el planejat
         *   4) corchete on contingut   : (inici bloc − base) − clip.inPoint == seqIN
         *
         * Amb aquesta línia es veu en 5 segons a quin domini deixa de quadrar.
         *
         * @param {Object} cfd - cleanFeedData (amb _ffmpeg/_plan/_clipReal/_fileBase...)
         */
        _domainsDump: function (cfd) {
            try {
                if (!cfd) { log('🔎 [DOMAINS] sense cleanFeedData (fase EXTRACT no executada)'); return; }
                const nf = (n) => { const v = Number(n); return isFinite(v) ? v.toFixed(2) : '?'; };
                const ff = cfd._ffmpeg || {};
                const pl = cfd._plan || {};
                const rl = cfd._clipReal || {};
                const base = Number(cfd._fileBase);
                const bStart = Number(cfd._mediaBlockStart);
                const bEnd = Number(cfd._mediaBlockEnd);
                const wsmsC = Number(cfd._wsmsCleanfeed);
                const fileIn = Number(pl.fileIn);
                const realIn = Number(rl.inPoint);
                const seqIn = Number(pl.sweetSeqIn);
                const chk = [];
                if (isFinite(base) && isFinite(wsmsC) && isFinite(Number(ff.ss))) {
                    const d = (base - wsmsC) - Number(ff.ss);
                    chk.push('0-fitxer==-ss ' + (Math.abs(d) <= 0.25 ? 'OK' : 'MISMATCH(' + nf(d) + ')'));
                }
                if (isFinite(bStart) && isFinite(base) && isFinite(fileIn)) {
                    const d = (bStart - base) - fileIn;
                    chk.push('contingut==fileIn ' + (Math.abs(d) <= 0.25 ? 'OK' : 'MISMATCH(' + nf(d) + ')'));
                }
                if (isFinite(realIn) && isFinite(fileIn)) {
                    const d = realIn - fileIn;
                    chk.push('clip.inPoint==pla ' + (Math.abs(d) <= 0.25 ? 'OK' : 'MISMATCH(' + nf(d) + ')'));
                }
                if (isFinite(bStart) && isFinite(base) && isFinite(realIn) && isFinite(seqIn)) {
                    const tlContent = (bStart - base) - realIn;
                    const d = tlContent - seqIn;
                    chk.push('corchete-on-contingut ' + (Math.abs(d) <= 0.5 ? 'OK' : 'MISMATCH(' + nf(d) + ')'));
                }
                log('🔎 [DOMAINS] fase=EXTRACT domini=' + (cfd._isExtractedClip ? 'fitxer-extret' : 'source/bloc') +
                    ' | wsms(cleanfeed)=' + nf(cfd._wsmsCleanfeed) + ' base-fitxer=' + nf(cfd._fileBase) +
                    ' | bloc(media)=' + nf(cfd._mediaBlockStart) + '→' + nf(cfd._mediaBlockEnd) +
                    ' | handles=' + nf(cfd.handleSecs) +
                    ' | in/out(source)=' + nf(cfd._srcIn) + '/' + nf(cfd._srcOut) +
                    ' | ffmpeg -ss ' + nf(ff.ss) + ' -t ' + nf(ff.t) + ' (demanat ' + nf(ff.requestedIn) + ', pre-roll ' + nf(ff.preRoll) + ', keyframe=' + (ff.kfOk ? 'OK' : 'NO') + ')' +
                    ' | in/out(fitxer·pla)=' + nf(pl.fileIn) + '/' + nf(pl.fileOut) + ' dur=' + nf(pl.clipDur) +
                    ' | clip V1 in/out(real)=' + nf(rl.inPoint) + '/' + nf(rl.outPoint) + ' start=' + nf(rl.start) +
                    ' | seq IN/OUT=' + nf(pl.sweetSeqIn) + '/' + nf(pl.sweetSeqOut) +
                    ' | ' + (chk.length ? chk.join(' · ') : 'sense dades'));
            } catch (eDump) {
                log('⚠️ [DOMAINS] ' + eDump.message);
            }
        },

        /**
         * _rebuildManifestFromLocal: Regenera el manifest de sessió a partir de
         * l'última còpia local de l'escaleta al directori del projecte.
         * S'usa al botó FOTO (després de generar una nova escaleta) i a LOAD.
         * @param {Object} ctx - Context del projecte
         * @returns {Promise<{jsonMeta, jsonData, bounds}|null>}
         */
        _rebuildManifestFromLocal: async function (ctx) {
            const reader = window.EscaletaReader || window.FASTPASS_UI.EscaletaReader;
            const datePrefix = ctx.dateDir ? ctx.dateDir.replace(/_/g, '') : null;
            const jsonMeta = await reader.ensureLocalCopy(ctx, datePrefix);
            if (!jsonMeta) {
                log("⚠️ [Manifest] Cap escaleta local per reconstruir el manifest.");
                return null;
            }
            const jsonData = await reader.load(jsonMeta.path);
            if (!jsonData) {
                log("⚠️ [Manifest] Escaleta local no carregable: " + jsonMeta.filename);
                return null;
            }
            try {
                // (#121, 2026-09-30) El snapshot cleanFeed.mediaStop del JSON pot quedar
                // curt si el manifest es reconstrueix més tard (la ingesta va continuar):
                // la durada REAL del fitxer mana, igual que a _runNew. Si no es pot
                // mesurar, es manté el snapshot (comportament anterior).
                let stopEffMf = jsonData.cleanFeed.mediaStop;
                try {
                    const ffMf = window.FASTPASS_UI.Logic && window.FASTPASS_UI.Logic.FFmpeg;
                    const cfPathMf = jsonData.cleanFeed ? jsonData.cleanFeed.mediaPath : null;
                    if (ffMf && ffMf.getMediaDuration && cfPathMf &&
                        typeof reader.tcToSeconds === 'function' && typeof reader.secondsToTC === 'function') {
                        const durMf = await ffMf.getMediaDuration(cfPathMf);
                        if (durMf && durMf.ok) {
                            const stopRealMf = reader.tcToSeconds(jsonData.cleanFeed.mediaStart) + durMf.duration;
                            if (stopRealMf > reader.tcToSeconds(jsonData.cleanFeed.mediaStop) + 1) {
                                stopEffMf = reader.secondsToTC(stopRealMf);
                                log(`📏 [Manifest] Durada REAL del cleanFeed: ${durMf.duration.toFixed(1)}s → final ${stopEffMf} (snapshot ${jsonData.cleanFeed.mediaStop}).`);
                            }
                        }
                    }
                } catch (eDurMf) {
                    log('⚠️ [Manifest] No s\'ha pogut mesurar la durada real: ' + eDurMf.message, 'WARN');
                }
                const bounds = reader.calcPrecisionTrimBounds(
                    jsonData,
                    ctx.bloque,
                    jsonData.cleanFeed.mediaStart,
                    stopEffMf,
                    ctx.config
                );
                if (!bounds) {
                    log("⚠️ [Manifest] Bounds no calculables des de " + jsonMeta.filename);
                    return null;
                }
                const allItems = jsonData.escaleta ? (jsonData.escaleta.liniesEscaleta || []) : [];
                // ═══ (2026-09-25c) NO TREPITJAR LA REF DEL CLIP EXTRET ═══════════════════════════
                // Aquest és un dels 3 escriptors del manifest i l'ÚNIC que tornava a escriure la
                // ref en coords d'ORIGEN (wsms=cleanfeed, tlBlockInPointSec=source) DESPRÉS de
                // l'extracció. Conseqüència mesurada (TNC V1 2026-09-25, manifest final):
                //   wsms=49500 + tlBlockInPointSec=1978 (source) mentre el clip de V1 tenia base
                //   51478 → l'ancoratge depenia del pedaç FIX-C i el material quedava desplaçat.
                // Si el manifest ja ve del clip extret, la ref es CONSERVA i només s'actualitzen
                // blockBounds/escaletaItems.
                const _prevManifest = await FASTPASS_UI.SessionManifest.load(ctx);
                const _keepExtractedRef = !!(_prevManifest && _prevManifest.extractedClip &&
                    _prevManifest.extractedClip.isExtracted === true &&
                    _prevManifest.ref && _prevManifest.ref.worldSecMediaStart != null &&
                    _prevManifest.ref.tlBlockInPointSec != null);
                const _manPatch = {
                    program: { escaletaFile: jsonMeta.filename },
                    cleanFeed: jsonData.cleanFeed,
                    blockBounds: bounds,
                    escaletaItems: toManifestItems(allItems),
                    phases: { boundsCalculated: true }
                };
                if (!_keepExtractedRef) {
                    // Manifest sense clip extret (projecte nou / primera passada) → coords d'ORIGEN,
                    // com fins ara. (Pendent: unificar els 3 escriptors en coords de FITXER.)
                    _manPatch.ref = { ...bounds.ref, tlBlockInPointSec: bounds.mp4ExpandedInPoint };
                } else {
                    log('🧭 [Manifest] Ref del CLIP EXTRET conservada (no es reescriu en coords d\'ORIGEN): wsms=' +
                        Number(_prevManifest.ref.worldSecMediaStart).toFixed(2) + 's, tlBlockInPointSec=' +
                        Number(_prevManifest.ref.tlBlockInPointSec).toFixed(2) + 's');
                }
                await FASTPASS_UI.SessionManifest.save(ctx, _manPatch);
                log(`✅ [Manifest] Manifest regenerat des de: ${jsonMeta.filename}`);
                return { jsonMeta, jsonData, bounds };
            } catch (e) {
                log(`⚠️ [Manifest] Error reconstruint manifest: ${e.message}`);
                return null;
            }
        },

        /** Memòria curta de la data del projecte obert (vegeu `_sessionDateDir`). */
        _sessionDateCache: { at: 0, dir: '' },

        /**
         * _sessionDateDir: (2026-11-02 · BUG #220) DATA DE TREBALL DE SESSIÓ
         * (YYYY_MM_DD) ancorada al PROJECTE OBERT, no al rellotge.
         *
         * PER QUÈ EXISTEIX: `Context.checkContext()` fixa `State.dateDir` a la data
         * d'AVUI en clic normal (#177) encara que damunt hi haja obert el `.prproj`
         * d'AHIR. Els escriptors de SESSIÓ (marcadors, gràfics, rètols, portada,
         * OBRIR/GO) heretaven eixa data i, com que `SessionManifest._writeRaw` fa
         * `cep.fs.makedir` (i el respatller JSX, `f.parent.create()`), **s'inventava
         * el directori del dia d'avui amb un `.fastpass.json` fantasma dins**
         * mentre el manifest del projecte de debò es quedava sense
         * `markers`/`graphics`/`chyrons`.
         *
         * Ordre de resolució:
         *   1) path REAL del `.prproj` obert (`Context._resolveProjectDateDir`)
         *   2) `State.dateDir` (HOY, o la data del projecte en mode correcció)
         *   3) rellotge (últim recurs)
         * El resultat del path real es memoritza 2 s: els fluxos de col·locació
         * demanen el ctx una vegada per fase i no cal un `Project.path()` cada volta.
         * @returns {Promise<string>} 'YYYY_MM_DD'
         */
        _sessionDateDir: async function () {
            const utils = getUtils();
            let dirEstat = '';
            try {
                const St = window.FASTPASS_UI.State;
                dirEstat = (St && St.dateDir) ? String(St.dateDir) : '';
            } catch (eSt) { dirEstat = ''; }
            if (!dirEstat) dirEstat = utils.getFormattedDate().replace(/["\s]/g, '').trim();
            // 1) La data del .prproj obert és la VERITAT (memòria curta de 2 s).
            const now = Date.now();
            if (this._sessionDateCache.dir && (now - this._sessionDateCache.at) < 2000) {
                return this._sessionDateCache.dir;
            }
            try {
                const Ctx = window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.Context;
                if (Ctx && typeof Ctx._resolveProjectDateDir === 'function') {
                    const dProj = await Ctx._resolveProjectDateDir();
                    if (dProj) {
                        this._sessionDateCache = { at: now, dir: dProj };
                        if (dProj !== dirEstat) {
                            utils.log('🗓️ [dateDir] Data de SESSIÓ ancorada al PROJECTE OBERT: ' +
                                dirEstat + ' → ' + dProj, 'WARN');
                        }
                        return dProj;
                    }
                }
            } catch (eD) {
                utils.log('⚠️ [dateDir] No puc llegir la data del projecte obert: ' + eD.message, 'DEBUG');
            }
            return dirEstat;
        },

        /**
         * _sessionCtx: el ctx de SESSIÓ (`_setupContext()`) amb la DATA ancorada al
         * projecte obert (`_sessionDateDir()`, BUG #220).
         *
         * És el ctx que han de fer servir els escriptors del manifest (marcadors,
         * gràfics, rètols) i OBRIR/GO. CREAR i ACTUALITZAR continuen amb
         * `_setupContext()`: treballen el bloc del DIA (HOY, o AHIR en mode correcció).
         * @returns {Promise<Object>} { config, progData, programa, bloque, dateDir }
         */
        _sessionCtx: async function () {
            const ctx = await this._setupContext();
            try {
                const dSessio = await this._sessionDateDir();
                if (dSessio && dSessio !== ctx.dateDir) {
                    log('🗓️ [dateDir] ctx de sessió: ' + ctx.dateDir + ' → ' + dSessio +
                        ' (data del projecte obert)');
                    ctx.dateDir = dSessio;
                }
            } catch (eS) { /* es queda amb la data de checkContext */ }
            return ctx;
        },

        _setupContext: async function () {
            const config = FASTPASS_UI.Config.get();
            const idProg = document.getElementById('programa').value;
            const progData = config.mapeoProgramas[idProg];
            // D7.4: Preservar State.dateDir si ja va ser establert (ex: per _runNew() amb data d'emissió).
            // Això evita que _runUpdate/Load/Go sobrescribin la data d'emissió amb la del sistema.
            // Només s'usa getFormattedDate() com a fallback si State.dateDir no existeix (primera càrrega).
            const stateDateDir = (window.FASTPASS_UI && window.FASTPASS_UI.State && window.FASTPASS_UI.State.dateDir);
            const dateDir = stateDateDir || getUtils().getFormattedDate().replace(/["\s]/g, "").trim();

            return {
                config,
                progData,
                programa: idProg,
                bloque: document.getElementById('bloc').value,
                dateDir
            };
        }
    };

    window.FASTPASS_UI.Workflows.MainButton = FASTPASS_UI.Workflows.MainButton;
})();
