/**
 * ============================================================================
 * CORE: 4_Context (Sintetitzador de Context) - REVISAT v2.4.2
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Core = FASTPASS_UI.Core || {};

    const log = (...args) => FASTPASS_UI.Utils.log(...args);
    const getUtils = () => window.FASTPASS_UI.Utils;

    let _lastCheckAt = 0; // Guard de debounce

    // ── SINGLE-FLIGHT de checkContext (2026-10-22 · #113) ──────────────────
    // El sintetitzador es podia executar DUES o TRES vegades alhora: la crida
    // d'`init()` (que espera el resultat), el `callContextAudit()` del final de
    // `initPanel`, el poll de 15 s de main.js i `Registry._onProjectChange`.
    // Cada execució fa el SEU `readFolder(workFolder)` i la SEUA sonda de
    // wotts/MP4 al NAS. Amb el NAS FRED (primera obertura del dia) això no és
    // només treball duplicat: les lectures s'encuen darrere la primera i el
    // log del 22/10 va mostrar TRES llistats de 70 s i una arrencada de 92,7 s.
    // Ara només hi ha UNA execució en vol; les peticions que arriben mentrestant
    // s'hi enganxen i, si cal recalcular, es fa UN sol recàlcul en acabar.
    let _ccInFlight = null;
    let _ccAgain = false;

    // ── TIMING D'ARRENCADA (2026-09-29) ─────────────────────────────────────
    // Marca fites al _boot_timing.log (infraestructura a main.js → FASTPASS_UI.Boot)
    // per saber QUINA fase de la càrrega inicial es menja el temps (escaneig NAS,
    // escaleta, crides JSX de projecte…). Silenciós si l'API encara no hi és.
    const _bmark = (lbl) => {
        try {
            const B = window.FASTPASS_UI && window.FASTPASS_UI.Boot;
            if (B && typeof B.mark === 'function') B.mark('[Context] ' + lbl);
        } catch (eBM) { }
    };
    // Durada llegible: 812 → "812 ms"; 108568 → "108,6 s".
    const _bsec = (ms) => (ms >= 10000 ? (Math.round(ms / 100) / 10) + ' s' : ms + ' ms');

    // ─── MECÀNICA D'INICI (2026-09-04 · revisada 2026-10-21 #177) ─────────────
    // La data de treball NO es dedueix de l'hora del programa ni dels repositoris.
    //   - Defecte: HOY (data del sistema) SEMPRE. Un projecte d'un altre dia obert
    //     NO arrossega la sessió: si el panell queda obert de la nit abans amb el
    //     projecte d'AHIR, un clic sense Ctrl treballa amb el dia d'AVUI.
    //   - Mode correcció: AHIR (Ctrl+clic a MAIN) → dia natural anterior (o la data
    //     del projecte obert, si és d'un altre dia).
    // S'ha eliminat el TimeGuard (PROGRAM_START_HOURS / PRE_EMISSION_GUARD_HOURS).

    FASTPASS_UI.Core.Context = {
        
        // Reporte de activos para UI "externa"
        missing: { wotts: false, media: false, srt: false, portada: false },

        // Últim estat calculat per checkContext (per al Ctrl+clic de MAIN)
        _lastConclusion: null,
        _lastButtonData: null,
        // F4/D (2026-10-01): token del scan de fons en curs (evita que un scan
        // vell repinti per sobre d'un checkContext més nou).
        _bgProbeToken: 0,

        /**
         * _targetDateDir: Retorna la data de treball (YYYY_MM_DD).
         * @returns {string} Data del sistema (HOY) — SEMPRE, si no hi ha Ctrl+clic —
         *                   o la del dia anterior (AHIR) en mode correcció.
         */
        _targetDateDir: function () {
            const St = (window.FASTPASS_UI && window.FASTPASS_UI.State) ? window.FASTPASS_UI.State : null;
            const useYesterday = !!(St && St.workTarget === 'yesterday');
            const d = new Date();
            const dd = ('0' + d.getDate()).slice(-2);
            const mm = ('0' + (d.getMonth() + 1)).slice(-2);
            const todayYmd = '' + d.getFullYear() + '_' + mm + '_' + dd;

            // ── SENSE Ctrl: LA DATA ÉS LA D'AVUI, SEMPRE (2026-10-21 · #177) ────
            // Abans, `State.projectDateDir` (el projecte obert) manava també en un
            // clic normal: amb el projecte d'AHIR encara obert (panell obert des de
            // la sessió anterior), un clic sense Ctrl carregava/actualitzava el
            // projecte d'AHIR. Ara un projecte d'un altre dia NOMÉS s'agafa amb
            // Ctrl+clic (mode correcció explícit).
            if (!useYesterday) return todayYmd;

            // ── MODO CORRECCIÓ (Ctrl+clic) → AHIR ───────────────────────────────
            // 1) Si el projecte obert és d'un ALTRE dia, mana la SEUA data: tota la
            //    sessió (escaleta, MP4/SRT, wotts, portades, portada) s'ha de datar
            //    amb la data del projecte que s'està corregint.
            if (St && St.projectDateDir && St.projectDateDir !== todayYmd) return St.projectDateDir;
            // 2) Si no, el dia natural anterior.
            const dY = new Date();
            dY.setDate(dY.getDate() - 1);
            const ddY = ('0' + dY.getDate()).slice(-2);
            const mmY = ('0' + (dY.getMonth() + 1)).slice(-2);
            return '' + dY.getFullYear() + '_' + mmY + '_' + ddY;
        },

        /**
         * _resolveProjectDateDir: (2026-10-14 · BUG #156) Data REAL del PROJECTE OBERT
         * (YYYY_MM_DD) derivada de la ruta del .prproj amb l'àtom JSX ja existent
         * `FASTPASS.Project.path()` — mateix criteri que Core.AssemblyContext
         * (assembly_context.js:74-109).
         *
         * PER QUÈ EXISTEIX: `State.projectDateDir` es pot perdre a mig sessió (el poll
         * d'estat el desancorava amb UNA sola lectura buida de Registry.activeProjectName)
         * i aleshores `_targetDateDir()` cau a la data del SISTEMA. Cas real
         * (2026-10-14 09:22): amb el projecte de 13/10 obert, la FOTO va demanar a
         * digition l'escaleta de HOY → "No s'ha localitzat cap clean feed amb títol
         * [TN VESPRE [senyal net]] per la data/hora [2026-10-14 21:00:00]" → cap
         * snapshot nou (les V3/V4 del 13/10 amb 022f agrupat no van arribar mai).
         *
         * @returns {Promise<string|null>} 'YYYY_MM_DD' del projecte obert, o null si no es pot resoldre.
         */
        _resolveProjectDateDir: async function () {
            const u = getUtils();
            try {
                const raw = await u.callJSX("FASTPASS.Project.path()");
                if (!raw || String(raw).toLowerCase().indexOf('.prproj') === -1) return null;
                const normPath = String(raw).replace(/\\/g, '/');
                let cfg = null;
                try { cfg = FASTPASS_UI.Config.get(); } catch (eCfg) { cfg = null; }
                if (cfg && cfg.rutas && cfg.rutas.destinoBase) {
                    const baseNorm = String(cfg.rutas.destinoBase).replace(/\\/g, '/').replace(/\/+$/, '');
                    // Projecte fora de l'arbre de treball (PROVES): no s'hi pot ancorar res.
                    if (normPath.indexOf(baseNorm) !== 0) return null;
                }
                const parts = normPath.split('/');
                for (let i = 0; i < parts.length; i++) {
                    if (/^\d{4}_\d{2}_\d{2}$/.test(parts[i])) return parts[i];
                }
                return null;
            } catch (e) {
                u.log('⚠️ [dateDir] Data del projecte obert no resoluble: ' + e.message, 'DEBUG');
                return null;
            }
        },

        /**
         * _onMainClick: Handler central del botó MAIN.
         *   - Clic normal → executa l'acció de l'estat visible (CREAR/ACTUALITZAR...).
         *   - Ctrl+clic (mode correcció) → recalcula l'estat per AHIR i executa.
         * @param {Event|null} ev
         * @param {string|null} action - 'NEW' | 'UPDATE' | 'GO' | 'LOAD' | null
         * @param {Object|null} data
         */
        async _onMainClick(ev, action, data) {
            const u = getUtils();
            const useYesterday = !!(ev && (ev.ctrlKey || ev.metaKey));
            try {
                if (!useYesterday) {
                    if (!action) {
                        const st = this._lastConclusion;
                        if (st === 'MASSA') {
                            // (2026-10-21 · #177) Ni MP4 origen ni wotts: el bloc encara no s'ha emés.
                            u.status("MASSA D'HORA: no hi ha ni el MP4 origen ni els wotts del bloc (encara no s'ha emés). S'actualitza sol cada 15 s. Ctrl+clic = AHIR.", 'warn');
                        } else if (st === 'ESPERANT') {
                            // (2026-10-21 · #177) MP4 origen sí, wotts encara no.
                            u.status("ESPERA: ja hi ha el MP4 origen però encara falten els wotts del bloc. Quan isquen, el botó passarà a CREA tot sol. Ctrl+clic = AHIR.", 'warn');
                        }
                        // (2026-10-21 · #177) "Pull": el clic força un repintat IMMEDIAT de
                        // l'estat (el poll automàtic és de 15 s), per si el material acaba
                        // d'arribar al NAS.
                        if (st === 'MASSA' || st === 'ESPERANT') {
                            try { await this.checkContext({ force: true }); } catch (ePull) { }
                        }
                        return;
                    }
                    // R6: la data de treball es fixa EN EL MOMENT DEL CLIC. Si l'estat
                    // visible ha quedat obsolet (p. ex. ha passat la mitjanit) es recalcula.
                    let act = action;
                    let dt = data;
                    const targetNow = this._targetDateDir();
                    if (!dt || !dt.dateDir || dt.dateDir !== targetNow) {
                        u.log('[MAIN] Data de treball canviada. Recalculant estat...', 'DEBUG');
                        await this.checkContext({ force: true });
                        const stR = this._lastConclusion;
                        const dtR = this._lastButtonData;
                        if (!(stR === 'NEW' || stR === 'UPDATE' || stR === 'GO' || stR === 'LOAD')) {
                            u.status('Estat del dia canviat (' + stR + '). Reintenta-ho.', 'warn');
                            return;
                        }
                        act = (stR === 'NEW') ? 'NEW' : stR;
                        dt = dtR;
                    }
                    await FASTPASS_UI.Workflows.MainButton.runMainAction(act, dt);
                    return;
                }
                // ── MODO CORRECCIÓN: Ctrl+clic → AYER ──
                // (2026-10-21) Mateix mecanisme que HOY, amb la data canviada: TOT el
                // flux (gate de wotts, escaleta local, FOTO i `_runNew`) va amb
                // ctx.dateDir = AHIR. Els wotts d'AHIR es daten amb el MATEIX
                // `birthtime` (la carpeta en conserva ~7 dies) i la memòria curta de
                // `wottsToday` té el dia a la clau → AHIR no contamina HOY ni al revés.
                // `finally`: es torna SEMPRE a HOY, també si `runMainAction` peta;
                // abans, en aquell cas `workTarget` quedava en 'yesterday' i el poll
                // de 15 s repintava l'AHIR indefinidament.
                const St = window.FASTPASS_UI.State;
                u.log('🔄 [MAIN] Ctrl+clic → mode correcció (AHIR).', 'INFO');
                St.workTarget = 'yesterday';
                try {
                    await this.checkContext({ force: true });
                    const stA = this._lastConclusion;
                    const dataA = this._lastButtonData;
                    if (stA === 'NEW' || stA === 'UPDATE' || stA === 'GO' || stA === 'LOAD') {
                        const actA = (stA === 'NEW') ? 'NEW' : stA;
                        u.log('🔄 [MAIN] Correcció AHIR → ' + stA + (dataA && dataA.name ? ' · ' + dataA.name : ''), 'INFO');
                        await FASTPASS_UI.Workflows.MainButton.runMainAction(actA, dataA);
                    } else {
                        u.log('⚠️ [MAIN] Mode correcció: AHIR sense material útil (estat ' + stA + ')', 'WARN');
                        u.status('AHIR: sense material per corregir', 'warn');
                    }
                } finally {
                    St.workTarget = 'today';
                    // Repintat de HOY (si `runMainAction` ha petat, el panell no es
                    // queda ensenyant l'estat d'AHIR ni un botó desactivat).
                    try { await this.checkContext({ force: true }); } catch (eRep) { }
                }
            } catch (e) {
                u.handleError(e, 'onMainClick');
            }
        },


        /**
         * _wottsToday (2026-10-21): sonda de wotts del BLOC d'avui, sense mai llançar.
         * Delega a Scan.wottsToday (Node `birthtime` + caché per nom). `ok:false`
         * vol dir que no s'ha pogut llegir → NO s'ha de canviar d'estat.
         *
         * ⏱️ (2026-10-22 · #113) ESPERA LIMITADA. Amb el NAS FRED la primera
         * lectura del dia pot quedar-se 70-90 s (log real del 22/10: 84 s) i
         * arrossegava TOTA l'arrencada. La sonda NO es cancel·la: segueix corrent
         * en segon pla (Scanner en deduplica l'execució i va omplint la caché),
         * però el panell deixa d'esperar-la i el poll de 15 s en recull el
         * resultat quan estiga. Mentrestant l'estat cau a ESPERA (mai MASSA).
         */
        PROBE_TIMEOUT_MS: 8000,
        _wottsToday: async function (ctx) {
            const sc = (window.FASTPASS_UI && window.FASTPASS_UI.Logic) ? window.FASTPASS_UI.Logic.Scan : null;
            if (!sc || typeof sc.wottsToday !== 'function') return { ok: false, found: false, count: 0 };
            const _tW = Date.now();
            try {
                const res = await this._withTimeout(sc.wottsToday(ctx), this.PROBE_TIMEOUT_MS, 'sonda wotts');
                _bmark('checkContext · sonda wotts (' + _bsec(Date.now() - _tW) + ')');
                return res;
            } catch (e) {
                _bmark('checkContext · sonda wotts TIMEOUT/ERROR (' + _bsec(Date.now() - _tW) + ')');
                getUtils().log('⚠️ [checkContext] wottsToday: ' + e.message +
                    ' → no es bloqueja el botó (el poll ho reintenta)', 'WARN');
                return { ok: false, found: false, count: 0 };
            }
        },

        /**
         * _mediaToday (2026-10-21 · #177): sonda del MP4 ORIGEN del bloc d'avui.
         * Delega a Scan.mp4Today (noms per Node + birthtime només dels candidats),
         * mai a `Scan.mediaAssets` (escaneig ExtendScript de tota la carpeta en UNC).
         * `ok:false` vol dir que no s'ha pogut llegir → no es pot afirmar res.
         * ⏱️ (2026-10-22 · #113) Mateixa espera limitada que la sonda de wotts.
         */
        _mediaToday: async function (ctx) {
            const sc = (window.FASTPASS_UI && window.FASTPASS_UI.Logic) ? window.FASTPASS_UI.Logic.Scan : null;
            if (!sc || typeof sc.mp4Today !== 'function') return { ok: false, found: false };
            const _tM = Date.now();
            try {
                const res = await this._withTimeout(sc.mp4Today(ctx), this.PROBE_TIMEOUT_MS, 'sonda MP4');
                _bmark('checkContext · sonda MP4 (' + _bsec(Date.now() - _tM) + ')');
                return res;
            } catch (e) {
                _bmark('checkContext · sonda MP4 TIMEOUT/ERROR (' + _bsec(Date.now() - _tM) + ')');
                getUtils().log('⚠️ [checkContext] mp4Today: ' + e.message +
                    ' → no es pot afirmar MASSA D\'HORA (el poll ho reintenta)', 'WARN');
                return { ok: false, found: false };
            }
        },

        /**
         * checkContext: porta d'entrada ÚNICA al sintetitzador (single-flight).
         * Vegeu `_ccInFlight` a dalt: les crides simultànies comparteixen UNA
         * execució i, com a molt, se'n programa UNA de nova en acabar.
         */
        async checkContext(_opts) {
            if (!getUtils().isJsxReady) return;
            if (_ccInFlight) {
                // Només un recàlcul EXPLÍCIT (force) justifica repetir l'escaneig
                // en acabar; una crida passiva (poll) ja queda servida per
                // l'execució en curs, que llegeix l'estat fresc igualment.
                if (_opts && _opts.force) _ccAgain = true;
                getUtils().log('⏳ [checkContext] Ja hi ha un escaneig en curs: la crida s\'hi enganxa ' +
                    '(no se\'n llança cap altre)', 'DEBUG');
                return await _ccInFlight;
            }
            _ccInFlight = this._runCheckContext(_opts);
            try {
                return await _ccInFlight;
            } finally {
                _ccInFlight = null;
                if (_ccAgain) {
                    _ccAgain = false;
                    const self = this;
                    setTimeout(function () { try { self.checkContext({ force: true }); } catch (eC) { } }, 0);
                }
            }
        },

        async _runCheckContext(_opts) {
            if (!getUtils().isJsxReady) return; 
        
            // 📍 Capturamos los elementos del DOM al inicio
            const elProg = document.getElementById('programa');
            const elBloc = document.getElementById('bloc');
        
            // 📍 DEBOUNCE
            const now = Date.now();
            if (!(_opts && _opts.force) && now - _lastCheckAt < 1000) return;
            _lastCheckAt = now;
        
            const _tCC0 = Date.now();
            try {
                // Ahora ya puedes validar si existen
                if (!elProg || !elBloc || !elProg.value || elBloc.value === "---") {
                    console.log("⚠️ Selectores incompletos o no encontrados.");
                    this.updateButton('DISABLED');
                    return;
                }
        
                const config = FASTPASS_UI.Config.get();
                // D7.2: Preservar State.dateDir si ja va ser corregit per _runNew().
                // La data d'emissió de l'escaleta és la font única de veritat.
                // Només s'usa getFormattedDate() com a fallback si State.dateDir no existeix.
                // BUG #1 FIX (2026-06-09): Resetear dateDir si el programa ha canviat.
                // Evita contaminació creuada entre programes (ex: TNCOMARQUES → TN_VESPRE).
                const progId = (config.mapeoProgramas[elProg.value] && config.mapeoProgramas[elProg.value].archivo) || '';
                const lastProg = (window.FASTPASS_UI && window.FASTPASS_UI.State && window.FASTPASS_UI.State.lastProgram);
                if (progId && lastProg && progId !== lastProg) {
                    getUtils().log('🔄 [checkContext] Programa canviat (' + lastProg + ' → ' + progId + '). Resetejant dateDir.', 'DEBUG');
                    if (window.FASTPASS_UI && window.FASTPASS_UI.State) {
                        window.FASTPASS_UI.State.dateDir = null;
                        window.FASTPASS_UI.State.projectDateDir = null;
                        window.FASTPASS_UI.State.workTarget = 'today';
                    }
                }
                // Resetear dateDir també si canvia el bloc dins del mateix programa.
                // Evita que un dateDir heretat d'un workflow anterior falli el scan
                // i mostri erròniament "NOU PROJECTE" quan el projecte ja existeix.
                const lastBloc = (window.FASTPASS_UI && window.FASTPASS_UI.State && window.FASTPASS_UI.State.lastBloc);
                if (elBloc.value && lastBloc && elBloc.value !== lastBloc) {
                    getUtils().log('🔄 [checkContext] Bloc canviat (' + lastBloc + ' → ' + elBloc.value + '). Resetejant dateDir.', 'DEBUG');
                    if (window.FASTPASS_UI && window.FASTPASS_UI.State) {
                        window.FASTPASS_UI.State.dateDir = null;
                        window.FASTPASS_UI.State.projectDateDir = null;
                        window.FASTPASS_UI.State.workTarget = 'today';
                    }
                }
                // Guardar programa actual per a la següent comparació
                if (window.FASTPASS_UI && window.FASTPASS_UI.State && progId) {
                    window.FASTPASS_UI.State.lastProgram = progId;
                }
                // Guardar bloc actual per a la següent comparació
                if (window.FASTPASS_UI && window.FASTPASS_UI.State && elBloc.value) {
                    window.FASTPASS_UI.State.lastBloc = elBloc.value;
                }
                const ctx = {
                    config: config,
                    progData: config.mapeoProgramas[elProg.value],
                    bloque: elBloc.value,
                    dateDir: this._targetDateDir()
                };

                // MECÀNICA D'INICI (2026-09-04): data explícita HOY (o AHIR amb Ctrl+clic).
                getUtils().log('[dateDir] Data de treball: ' + ctx.dateDir + ((window.FASTPASS_UI.State && window.FASTPASS_UI.State.workTarget === 'yesterday') ? ' (AHIR, mode correcció)' : ' (HOY)'), 'DEBUG');

                // Actualizar estado global
                if (window.FASTPASS_UI && window.FASTPASS_UI.State) {
                    Object.assign(window.FASTPASS_UI.State, ctx);
                }
            
                // 1. RUTA DE RECERCA — (2026-09-24) carpeta del BLOC: <base><prog>_PROJECTES/<data>/<V*>
                let folderPath = getUtils().workFolder(ctx) + "/";
                
                // 2. ESCANEIG GENÈRIC (Usant Utils.readFolder a través de Scanner)
                const _tRF = Date.now();
                let projectFiles = await getUtils().readFolder(folderPath);
                _bmark('checkContext · readFolder NAS (' + _bsec(Date.now() - _tRF) + ', ' + (projectFiles ? projectFiles.length : 0) + ' fitxers)');

                if (!projectFiles || projectFiles.length === 0) {
                    getUtils().log("ℹ️ Carpeta buida o inexistent. Conclusió: NEW", "DEBUG");
                }
            
                // 3. LÒGICA DE NEGOCI (Usant el teu Scanner.js)
                const progKey = ctx.progData.wott || ctx.progData.archivo;
                let existingProjectName = FASTPASS_UI.Logic.Scan.selectedProject(
                    projectFiles,
                    progKey,
                    ctx.bloque
                );

                // ── MECÀNICA D'INICI (2026-10-21 · 3 ESTATS, #177) ────────────────
                // Amb el projecte del dia ja fet (o d'un altre dia obert) no canvia res:
                // ACTUALITZAR / OBRIR. Si NO hi ha projecte del dia, el botó només pot
                // estar en un d'estos TRES estats (per ordre de material disponible):
                //   · CREA          → hi ha WOTTS del bloc (el bloc ja s'ha emés).
                //   · ESPERA        → hi ha el MP4 ORIGEN però encara no els wotts.
                //   · MASSA D'HORA  → no hi ha ni MP4 origen ni wotts (res a fer).
                // Les dos sondes són BARATES (noms + birthtime; cap escaneig ExtendScript)
                // i el poll de 15 s de main.js repinta el botó tot sol.
                // (2026-10-21) Fora `getStatus` sobre …\ESCALETES: era el 96% de
                // l'arrencada (5,2 s) i, amb el projecte ja fet (ACTUALITZAR), no servia de res.
                let semaforoData = {
                    esc: { found: false, ready: false },
                    mp4: false, wot: false, srt: false
                };
                let earlyState = null;
                const readerE = window.EscaletaReader || window.FASTPASS_UI.EscaletaReader;

                // ── 1. ESCALETA: NOMÉS el directori del projecte (còpia prèvia o FOTO)
                if (readerE && typeof readerE.lookupLocalStatus === 'function') {
                    const _tLoc = Date.now();
                    try {
                        const escLocal = await readerE.lookupLocalStatus(ctx);
                        if (escLocal && escLocal.found) {
                            semaforoData.esc = escLocal;
                            getUtils().log('📷 [checkContext] Escaleta local (' + escLocal.filename + ')' +
                                (escLocal.ready ? ' [bloc complet]' : ' [bloc en emissió]'), 'INFO');
                        }
                    } catch (eLoc) {
                        getUtils().log('⚠️ [checkContext] Error buscant escaleta local: ' + eLoc.message, 'DEBUG');
                    }
                    _bmark('checkContext · escaleta local (' + _bsec(Date.now() - _tLoc) + ')');
                } else {
                    _bmark('checkContext · SENSE EscaletaReader');
                }

                if (!existingProjectName) {
                    // ── 2. MATERIAL DEL BLOC D'AVUI: wotts + MP4 origen ───────────
                    // Fets FÍSICS (els wotts es generen en acabar l'emissió i el MP4
                    // origen es publica amb el bloc), mai un horari.
                    // (2026-10-22 · #113) Les dos sondes són INDEPENDENTS i es fan en
                    // paral·lel: amb el NAS fred cadascuna pot costar segons i en
                    // sèrie l'espera es doblava. Cap de les dos llança (retornen
                    // `ok:false`), així que el Promise.all no pot fallar.
                    const probe = await Promise.all([this._wottsToday(ctx), this._mediaToday(ctx)]);
                    const wots = probe[0] || { ok: false, found: false, count: 0 };
                    const mp4 = probe[1] || { ok: false, found: false };
                    if (wots.ok) {
                        semaforoData.wot = wots.found ? 'blink' : 'pending';
                        semaforoData.wotDetail = String(wots.count);
                    }
                    if (mp4 && mp4.ok) semaforoData.mp4 = mp4.found ? 'blink' : 'error';

                    const escFound = !!(semaforoData.esc && semaforoData.esc.found);
                    if (wots.found) {
                        // CREA: el bloc ja s'ha emés (hi ha wotts).
                        getUtils().log('✅ [checkContext] CREA: wotts del bloc (' + wots.count + ')' +
                            (mp4.found ? ' + MP4 origen' : '') + ' (' + (wots.via || '?') + ')', 'INFO');
                    } else if (!wots.ok) {
                        // El NAS no ha respost: NO es bloqueja el botó per un error
                        // transitori (el CREAR farà la FOTO i, si tampoc no pot, avortarà).
                        getUtils().log('⚠️ [checkContext] Sonda de wotts KO → no es bloqueja el botó', 'WARN');
                    } else if (mp4.found) {
                        // ESPERA: hi ha el MP4 origen però encara falten els wotts.
                        earlyState = 'ESPERANT';
                        _bmark('checkContext · ESPERA (MP4 origen sí, wotts encara no)');
                    } else if (mp4.ok) {
                        // MASSA D'HORA: ni MP4 origen ni wotts (el bloc ni s'ha emés).
                        // (2026-10-21 · #177) Semàfors en ROIG: no hi ha res a importar.
                        earlyState = 'MASSA';
                        semaforoData.wot = 'error';
                        _bmark('checkContext · MASSA D\'HORA (sense MP4 origen ni wotts)');
                    } else {
                        // No es pot llegir el repositori de verticalització: no se sap si
                        // hi ha MP4 → ESPERA (no s'aventura un MASSA D'HORA fals).
                        earlyState = 'ESPERANT';
                        getUtils().log('⚠️ [checkContext] Sonda d\'MP4 KO → ESPERA (no es pot afirmar MASSA D\'HORA)', 'WARN');
                    }
                    if (earlyState) {
                        getUtils().log('⏳ [checkContext] ' + (earlyState === 'ESPERANT' ? 'ESPERA' : "MASSA D'HORA") +
                            ': MP4 origen=' + (mp4.ok ? (mp4.found ? 'sí' : 'no') : '?') +
                            ' · wotts=' + (wots.ok ? wots.count : '?') +
                            (escFound ? ' · escaleta local=' + semaforoData.esc.filename : ''), 'INFO');
                    }
                }

                if (earlyState) {
                    const data = { ...ctx, name: earlyState };
                    data.motiu = (earlyState === 'MASSA') ? 'sense_mp4_ni_wotts' : 'sense_wotts';
                    data.semaforo = semaforoData;
                    this._lastConclusion = earlyState;
                    this._lastButtonData = data;
                    _bmark('checkContext · TOTAL (' + _bsec(Date.now() - _tCC0) + ') → ' + earlyState + ' [early]');
                    this.updateLights(elProg.value, ctx.bloque, null, false, semaforoData);
                    this.updateButton(earlyState, data);
                    return;
                }

                let conclusion = 'NEW';
                let lockOwner = null;
                let lockFile = null;
                let isLockOwned = true;
                const _tPj = Date.now(); // timing de les consultes JSX de projecte obert + lock
            
                if (existingProjectName) {
                    // Obtener lista de proyectos abiertos en Premiere
                    let openProjects = [];
                    try {
                        const openProjectsRaw = await getUtils().callJSX("Context.list()");
                        openProjects = JSON.parse(openProjectsRaw || "[]");
                    } catch (e) {
                        // Ignorar error
                    }
                    let isProjectOpen = false;
                    let isProjectActive = false;
                    let activeProjectName = '';
                    // Obtener proyecto activo (vía Project.path o Context.activeProj)
                    try {
                        const activeProjectPath = await getUtils().callJSX("FASTPASS.Project.path()");
                        if (activeProjectPath) {
                            const parts = activeProjectPath.split(/[\\/]/);
                            activeProjectName = parts[parts.length - 1];
                        }
                    } catch (e) {
                        // Ignorar error
                    }
                    // Si no se pudo obtener ruta, intentar con Context.activeProj()
                    if (!activeProjectName) {
                        try {
                            activeProjectName = await getUtils().callJSX("Context.activeProj()");
                        } catch (e) {
                            // Ignorar
                        }
                    }
                    
                    if (openProjects.length > 0) {
                        // openProjects es array de strings (nombres de proyecto con extensión)
                        isProjectOpen = openProjects.includes(existingProjectName);
                        // Determinar si el proyecto activo coincide con existingProjectName
                        isProjectActive = activeProjectName === existingProjectName;
                        // Si no hay activeProjectName, asumir que el primer proyecto de la lista es el activo (fallback)
                        if (!activeProjectName && openProjects.length > 0) {
                            isProjectActive = openProjects[0] === existingProjectName;
                        }
                    } else {
                        // Fallback a Project.path() para determinar si el proyecto está abierto y activo
                        if (activeProjectName) {
                            isProjectOpen = activeProjectName === existingProjectName;
                            isProjectActive = isProjectOpen;
                        }
                    }

                    // Fallback: si el proyecto no aparece en openProjects pero fue el último abierto por nosotros, asumir que está abierto
                    if (!isProjectOpen && window.FASTPASS_UI && window.FASTPASS_UI.State && window.FASTPASS_UI.State.lastOpenedProjectName === existingProjectName) {
                        isProjectOpen = true;
                    }

                    // Mirem si hi ha lock (Lògica JS pura sobre la llista ja descarregada)
                    lockFile = projectFiles.find(f => f.name === existingProjectName + ".lock");
                    const currentUser = config.autor;
                    
                    if (lockFile) {
                        // Hi ha bloqueig: llegim el contingut (qui és l'amo)
                        const lockPath = folderPath + lockFile.name;
                        const safeLockPath = lockPath.replace(/\\/g, '/').replace(/'/g, "\\'");
                        lockOwner = await getUtils().callJSX(`IO.readTxt('${safeLockPath}')`);
                        // Si el lock está vacío, asumir que es nuestro (puede ser un lock recién creado)
                        if (lockOwner.trim() === "") {
                            lockOwner = currentUser;
                        }
                    }
                    
                    // Determinar si el lock es nuestro (si no hay lock, se considera nuestro)
                    isLockOwned = lockFile ? lockOwner.trim() === currentUser.trim() : true;
                    
                    // Usamos isProjectOpen e isProjectActive ya calculadas
                    if (isProjectActive) {
                        conclusion = 'UPDATE';
                    } else if (isProjectOpen && !isProjectActive) {
                        conclusion = 'GO';
                    } else {
                        conclusion = 'LOAD';
                    }
                }
            
                _bmark('checkContext · projecte obert+lock (JSX) (' + _bsec(Date.now() - _tPj) + ', ' +
                    (existingProjectName || 'sense projecte') + ')');
                getUtils().log("🔍 Conclusión contexto: " + conclusion + (existingProjectName ? " (projecte: " + existingProjectName + ")" : ""), "DEBUG");
                
                // [NOU] SEMAFOR: completar estats d'assets (esc ja avaluat a la fase anterior)
                try {
                    // 2. Assets al projecte (nomes si el projecte esta obert o en UPDATE)
                    if (conclusion === 'UPDATE' || conclusion === 'GO') {
                        const _tSem = Date.now();
                        const [hasMp4, chyItemsRaw, hasSrt, mediaFiles] = await Promise.all([
                            getUtils().callJSX("hasClips(1, 'video')"),
                            getUtils().callJSX("FASTPASS.Project.items('CHY')"),
                            getUtils().callJSX("hasClips(1, 'subtitle')"),
                            getUtils().readFolder(ctx.config.rutas.verticalitzacio) // Per al SRT físic
                        ]);
                        _bmark('checkContext · semàfor assets (4 crides) (' + _bsec(Date.now() - _tSem) + ')');

                        // MP4
                        const mp4Present = (hasMp4 === "true");
                        if (!mp4Present) {
                            semaforoData.mp4 = 'error';
                        } else if (semaforoData.esc.mediaStop && semaforoData.esc.blockOut) {
                            const reader = window.EscaletaReader || window.FASTPASS_UI.EscaletaReader;
                            const stopSecs = reader.tcToSeconds(semaforoData.esc.mediaStop);
                            const outSecs = reader.tcToSeconds(semaforoData.esc.blockOut);
                            semaforoData.mp4 = (stopSecs < outSecs) ? 'pending' : 'ready';
                        } else {
                            semaforoData.mp4 = 'ready';
                        }

                        // WOT
                        let chyItems = [];
                        try { chyItems = JSON.parse(chyItemsRaw || "[]"); } catch(e) {}
                        const wottCount = chyItems.length;
                        const expected = semaforoData.esc.totalExpected || 0;
                        
                        if (wottCount === 0) semaforoData.wot = 'error';
                        else if (expected > 0 && wottCount < expected) semaforoData.wot = 'pending';
                        else semaforoData.wot = 'ready';
                        semaforoData.wotDetail = `${wottCount}/${expected}`;

                        // SRT
                        const srtPresent = (hasSrt === "true");
                        if (srtPresent) {
                            semaforoData.srt = 'ready';
                        } else {
                            // Mirem si existeix el fitxer SRT al NAS per decidir si Error o Gris
                            const prefix = `${ctx.progData.archivo}_${ctx.bloque}_`.toUpperCase();
                            const srtOnDisk = (mediaFiles || []).find(f => f.name.toUpperCase().includes(prefix) && f.name.toUpperCase().endsWith('.SRT'));
                            semaforoData.srt = srtOnDisk ? 'error' : 'off';
                        }
                    }
                } catch (e) {
                    getUtils().log("⚠️ Error recollint dades del semàfor: " + e.message, "DEBUG");
                }

                // --- Semàfor per al cas SENSE projecte (escaleta de FOTO/local) ---
                // Informa de què ja és al NAS perquè l'usuari sàpiga quan pot crear o
                // actualitzar. MP4/Rètols en VERD INTERMITENT = ja importables.
                if (!existingProjectName && semaforoData.esc && semaforoData.esc.found) {
                    const _tSN = Date.now();
                    try {
                        const scN = (window.FASTPASS_UI && window.FASTPASS_UI.Logic && window.FASTPASS_UI.Logic.Scan);
                        if (scN && scN.mediaAssets) {
                            // (2026-09-17) El MP4 del cleanFeed viu a la ruta que diu el JSON
                            // (mediaPath, p.ex. \\DSMEDIA10\...), NO a config.rutas.verticalitzacio:
                            // el SCAN mediaAssets no el trobava mai i el semafor quedava en
                            // AMARILLO per sempre tot i haver-se emes el bloc.
                            // Criteri correcte (el mateix que amb projecte obert): la ingesta
                            // ha arribat al final del bloc → mediaStop >= blockOut.
                            var _escN = semaforoData.esc;
                            var _mStop = _escN.mediaStop, _bOut = _escN.blockOut;
                            if (_mStop && _bOut) {
                                var _rdN = window.EscaletaReader || window.FASTPASS_UI.EscaletaReader;
                                var _stopS = _rdN.tcToSeconds(_mStop);
                                var _outS = _rdN.tcToSeconds(_bOut);
                                semaforoData.mp4 = (_stopS < _outS) ? 'pending' : 'blink';
                                getUtils().log('🎬 [sem-mp4] cleanFeed mediaStop=' + _mStop + ' (' + _stopS + 's) vs blockOut=' + _bOut + ' (' + _outS + 's) → ' + semaforoData.mp4, 'DEBUG');
                            } else {
                                const mediaN = await scN.mediaAssets(ctx);
                                semaforoData.mp4 = (mediaN && mediaN.mp4) ? 'blink' : 'pending';
                            }
                            semaforoData.srt = (mediaN && mediaN.srt) ? 'error' : 'off';
                        }
                        // (2026-10-21) wottsToday (Node `birthtime` + caché) en comptes de
                        // Scanner.wotts: este llegia 963 fitxers per JSX (~4 s) cada repintat.
                        if (typeof this._wottsToday === 'function') {
                            const wN = await this._wottsToday(ctx);
                            if (wN.ok) {
                                const nW = wN.count;
                                const expN = semaforoData.esc.totalExpected || 0;
                                semaforoData.wot = (nW === 0) ? 'pending' : ((expN > 0 && nW < expN) ? 'pending' : 'blink');
                                semaforoData.wotDetail = nW + '/' + expN;
                            }
                        }
                    } catch (eSN) {
                        getUtils().log('⚠️ [checkContext] Error calculant semàfor NEW: ' + eSN.message, 'DEBUG');
                    }
                    _bmark('checkContext · semàfor NEW (' + _bsec(Date.now() - _tSN) + ')');
                }

                // 4. FEEDBACK UI
                const finalName = existingProjectName || `Pruebas_${ctx.progData.archivo}_${ctx.bloque}_PENDENT.prproj`;
                const data = { ...ctx, name: finalName };
                if (lockFile) {
                    data.lockExists = true;
                    data.lockOwner = lockOwner;
                    data.isLockOwned = lockOwner.trim() === ctx.config.autor.trim();
                }
                
                _bmark('checkContext · TOTAL (' + _bsec(Date.now() - _tCC0) + ') → ' + conclusion);
                this.updateLights(elProg.value, ctx.bloque, null, (conclusion === 'UPDATE'), semaforoData);
                this._lastConclusion = conclusion;
                this._lastButtonData = data;
                this.updateButton(conclusion, data);
            
            } catch (e) {
                getUtils().log("💥 Error checkContext: " + e.message, "ERROR");
                _bmark('checkContext · ERROR (' + _bsec(Date.now() - _tCC0) + '): ' + e.message);
                // FIX A3: No mantenir 'NEW' per defecte en cas d'error.
                // Un error de xarxa/permisos es pot interpretar erròniament com
                // "carpeta buida". Forcem WAITING per evitar que l'usuari premi
                // "NOU PROJECTE" i sobrescrigui un projecte existent.
                this.updateButton('WAITING', {
                    msg: "Error de xarxa o permisos. Reintentant...",
                    config: {},
                    progData: {},
                    bloque: '---',
                    dateDir: '',
                    name: 'ERROR'
                });
            }
        },

        updateLights(prog, bloc, theme, active, semaforoData) {
            const set = (id, state, title) => {
                const el = document.getElementById(id);
                if (el) {
                    let className = "light off";
                    if (state === 'ready') className = "light ready";
                    else if (state === 'pending') className = "light pending";
                    else if (state === 'error') className = "light error";
                    else if (state === true || state === 'on') className = "light ready";
                    else if (state === 'blink') className = "light blink"; 
                    
                    el.className = className;
                    if (title) el.parentElement.title = title;
                }
            };

            // Luces clásicas
            set('light-prog', !!prog);
            set('light-bloc', !!bloc && bloc !== "---");
            set('light-tema', !!theme && theme !== "PENDENT");
            set('light-seq', !!active);

            // 🚦 Luces nuevas (Semáforo)
            if (semaforoData) {
                // (2026-09-17) Motiu real quan no hi ha escaleta valida: el fixa
                // escaleta_io (ER._lastReject) llegint el JSON d'error del motor.
                const escMotiu = (semaforoData.esc && semaforoData.esc.reason) ? (' | Motiu: ' + semaforoData.esc.reason) : '';
                // ESC: Escaleta
                // (2026-10-21) Sense escaleta NO és un error: el directori del projecte
                // encara no existeix i la FOTO es farà al clic de CREAR.
                if (!semaforoData.esc.found) set('sem-esc', 'pending', "Encara no hi ha escaleta al directori del projecte (es baixarà amb la FOTO de CREAR)" + escMotiu);
                else if (semaforoData.esc.local) {
                    // FIX (2026-09-16): amb FOTO local es pot COMENÇAR a treballar encara
                    // que el bloc segueixi en emissió → semàfor en VERD. Si la foto és
                    // provisional s'indica al tooltip (N/M ítems emesos) i es recorda fer
                    // ACTUALITZAR després.
                    const cc = semaforoData.esc.complete;
                    set('sem-esc', 'ready', semaforoData.esc.ready
                        ? ('Escaleta OK (FOTO local: ' + semaforoData.esc.filename + ')')
                        : ('FOTO local (bloc en emissió' + (cc && cc.total ? ': ' + cc.emitted + '/' + cc.total + ' ítems' : '') + ') — pots CREAR i fer ACTUALITZAR després'));
                }
                else if (!semaforoData.esc.ready) {
                    const cc = semaforoData.esc.complete;
                    const w = semaforoData.esc.waitSec;
                    set('sem-esc', 'pending', ((cc && cc.total)
                        ? ('Escaleta trobada: bloc en emissió (' + cc.emitted + '/' + cc.total + ' ítems)')
                        : ('Escaleta trobada però BLOC NO READY')) +
                        (w ? ' — espera ~' + Math.ceil(w / 60) + ' min' : '') + escMotiu);
                }
                else set('sem-esc', 'ready', `Escaleta OK (${semaforoData.esc.timestamp})`);

                // MP4: CleanFeed
                const mp4Title = semaforoData.mp4 === 'pending' ? 'El stream encara no està disponible (ingesta en curs)' : (semaforoData.mp4 === 'error' ? 'Pista V1 buida' : (semaforoData.mp4 === 'blink' ? 'CleanFeed llest per importar' : 'CleanFeed OK'));
                set('sem-mp4', semaforoData.mp4, mp4Title);

                // WOT: Rètols
                const wotTitle = semaforoData.wot === 'pending' ? `Falten rètols: ${semaforoData.wotDetail}` : (semaforoData.wot === 'error' ? 'No hi ha rètols al Bin CHY' : `Tots importats: ${semaforoData.wotDetail}`);
                set('sem-wot', semaforoData.wot, wotTitle);

                // SRT: Subtítols
                const srtTitle = semaforoData.srt === 'ready' ? 'SRT ja importat' : (semaforoData.srt === 'error' ? 'SRT trobat al NAS (falta importar)' : 'No hi ha fitxer SRT al NAS');
                set('sem-srt', semaforoData.srt, srtTitle);
            }
        },

        /**
         * initMainHoverHint (2026-09-18): feedback visual del "Ctrl+clic = AHIR".
         * Si el cursor està SOBRE el botó MAIN i es manté CONTROL premut, el botó
         * mostra "AHIR" (que és exactament el que farà el clic en aquest mode).
         * En deixar anar CONTROL o sortir del botó, es restaura el text d'estat.
         * Idempotent (es pot cridar a cada updateButton).
         */
        initMainHoverHint: function () {
            const btn = document.getElementById('btnMainAction');
            if (!btn || btn._hoverHintInstalled) return;
            btn._hoverHintInstalled = true;

            let baseLabel = null;
            let hovering = false;
            let ctrlDown = false;
            let showing = false;

            const apply = (on) => {
                if (on && !showing) {
                    baseLabel = btn.innerText;          // text real d'aquest moment
                    btn.innerText = 'AHIR';
                    showing = true;
                } else if (!on && showing) {
                    btn.innerText = (baseLabel !== null) ? baseLabel : btn.innerText;
                    showing = false;
                }
            };
            const sync = () => apply(ctrlDown && hovering);

            btn.addEventListener('mouseenter', () => {
                hovering = true;
                // (2026-09-24) DEMANAR FOCUS al panell en entrar al botó MAIN: així els
                // keydown/keyup de CONTROL arriben a la pàgina i el canvi a "AHIR" és IMMEDIAT,
                // sense haver de moure el ratolí (queixa d'usuari 2026-09-24). Si Premiere té el
                // focus i la petició no prospera, es manté el workaround del mousemove.
                try { window.focus(); } catch (eF) { }
                try { if (document.body && document.body.focus) document.body.focus(); } catch (eB) { }
                try { getUtils().log('🖱 [FOCUS] mouseenter MAIN → hasFocus=' + (document.hasFocus ? document.hasFocus() : '?'), 'DEBUG'); } catch (eL) { }
                sync();
            });
            btn.addEventListener('mouseleave', () => { hovering = false; sync(); });
            // mousemove: detecta Ctrl encara que el focus no sigui al panell CEP
            btn.addEventListener('mousemove', (e) => { ctrlDown = !!e.ctrlKey || !!e.metaKey; sync(); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Control') { ctrlDown = true; sync(); } });
            document.addEventListener('keyup', (e) => { if (e.key === 'Control') { ctrlDown = false; sync(); } });
            // Si la finestra perd el focus amb Ctrl premut, evitem quedar-nos amb "AHIR"
            window.addEventListener('blur', () => { ctrlDown = false; hovering = false; sync(); });
        },

        /**
         * setMainBusy / _mainBusy (2026-09-22): Estat d'espera del botó MAIN mentre el panell
         * arrenca (motor JSX + primer checkContext). Evita que es vegi "NOU" abans d'hora
         * (i que l'usuari cliqui amb el sistema a mig carregar).
         * Es desactiva sol quan updateButton() pinta un estat real.
         * @param {string} [text] - Text del botó (per defecte "⏳ ARRENCANT...")
         * @param {string} [title] - Tooltip explicatiu
         */
        setMainBusy: function (text, title) {
            this._mainBusy = true;
            const btn = document.getElementById('btnMainAction');
            if (!btn) return;
            btn.innerText = text || 'ESPERA';
            btn.title = title || "El panell s'està inicialitzant (motor JSX + primer escaneig). Espera un moment…";
            btn.disabled = true;
            // (2026-09-22) NO es toca cap classe: el botó ha de mantenir SEMPRE la forma
            // quadrada (`btn-big-sq`, fixada pel CSS). Abans s'hi posava `square-large`
            // (classe inexistent) → el botó s'ajustava al text en arrencar el panell.
        },
        _mainBusy: false,

        updateButton(state, data) {
            const btn = document.getElementById('btnMainAction');
            if (!btn) return;
            this._mainBusy = false;   // ja hi ha un estat real: fora l'estat d'espera

            // Feedback "AHIR" en passar el cursor amb Ctrl premut (una sola instal·lació)
            this.initMainHoverHint();

            // (2026-09-22) La FORMA del botó la fixa SEMPRE el CSS (`btn-big-sq`/`#btnMainAction`
            // = 60×60 amb min/max i !important). Aquí s'hi forçava `minHeight=60px` i
            // `width:100%` inline → el botó deixava de ser quadrat i s'ajustava al text.
            // 🔍 [CORRECCIÓN] No deshabilitar el botón si estamos en modo LOAD/NEW/GO/UPDATE 
            // solo por el Registry, a menos que el estado sea explícitamente DISABLED o WAITING.
            // Si el Registry lo puso en disabled, este updateButton debe prevalecer si el contexto es válido.
            btn.disabled = (state === 'DISABLED' || state === 'WAITING');
            // El color/borde vermell de l'estat LOCKED no s'ha de quedar enganxat en els altres
            if (state !== 'LOCKED') { btn.style.border = 'none'; btn.style.color = ''; }
            
            // Si el Registry ha deshabilitado el flujo pero nosotros queremos crear uno nuevo, 
            // permitimos que el botón principal siga funcionando.

            switch (state) {
                case 'NEW':
                    // (2026-10-21 · #177) Els tres estats d'inici es diuen com les
                    // opcions: CREA · ESPERA · MASSA D'HORA.
                    btn.innerText = "CREA";
                    btn.title = "Ja hi ha wotts del bloc (s'ha emés): crea el projecte del dia. Ctrl+clic = AHIR.";
                    btn.onclick = function (ev) {
                        FASTPASS_UI.Core.Context._onMainClick(ev, 'NEW', data);
                    };
                    break;
                case 'UPDATE':
                case 'GO':
                case 'LOAD':
                    btn.innerText = "ACTUAL.";
                    btn.onclick = function (ev) {
                        FASTPASS_UI.Core.Context._onMainClick(ev, state, data);
                    };
                    break;
                case 'MASSA':
                    btn.innerText = "MASSA D'HORA";
                    // (2026-10-21 · #177) Ni MP4 origen ni wotts del bloc.
                    // El poll de 15 s (main.js) repinta el botó sol quan arriba material.
                    btn.title = "No hi ha ni el MP4 origen ni els wotts del bloc (encara no s'ha emés). S'actualitza sol cada 15 s. Ctrl+clic = treballar amb AHIR.";
                    btn.onclick = function (ev) {
                        FASTPASS_UI.Core.Context._onMainClick(ev, null, data);
                    };
                    break;
                case 'ESPERANT':
                    // (2026-10-21 · #177) Hi ha el MP4 origen però encara no els wotts.
                    btn.innerText = "ESPERA";
                    btn.title = "Ja hi ha el MP4 origen però encara falten els wotts del bloc. Passarà a CREA tot sol. Ctrl+clic = treballar amb AHIR.";
                    btn.onclick = function (ev) {
                        FASTPASS_UI.Core.Context._onMainClick(ev, null, data);
                    };
                    break;
                case 'WAITING':
                    btn.innerText = data.msg || "ESPERANT...";
                    break;
                case 'LOCKED':
                    btn.innerText = "BLOQUEJAT: " + (data.lockOwner || data.user || "ALTRE");
                    btn.disabled = false;
                    btn.style.border = "1px solid #dc3545";
                    btn.style.color = "#dc3545";
                    btn.onclick = function(ev) {
                        const forceData = { ...data, forceOverride: true };
                        FASTPASS_UI.Workflows.MainButton.runMainAction('LOAD', forceData);
                    };
                    break;
                default:
                    btn.innerText = "ESPERANT";
            }
        },

        renderStructure(pieces) {
            const container = document.getElementById('structure-table');
            if (!container) return;

            if (!pieces || pieces.length === 0) {
                container.innerHTML = '<div class="structure-msg">Esperant anàlisi de guion...</div>';
                return;
            }

            let html = '';
            for (let p of pieces) {
                html += `
                    <div class="piece-row">
                        <div class="piece-id">${p.id}</div>
                        <div class="piece-title">${p.theme}</div>
                        <div class="piece-status"><span></span></div>
                    </div>
                `;
            }
            container.innerHTML = html;
        },

        async init() {
            const _tInit0 = Date.now();
            const p = document.getElementById('programa');
            const b = document.getElementById('bloc');
            const config = FASTPASS_UI.Config.get();
        
            if (!p || !b) {
                console.error("❌ [CONTEXT] No se han encontrado los selects en el HTML");
                return;
            }
        
            // 1. Rellenar programas
            if (config.mapeoProgramas) {
                p.innerHTML = "";
                for (let id in config.mapeoProgramas) {
                    const opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = id;
                    p.appendChild(opt);
                }
                console.log("✅ [CONTEXT] Programas cargados en el select");
                // Seleccionar el primer programa si no hay valor
                if (p.options.length > 0 && !p.value) {
                    p.selectedIndex = 0;
                    console.log("✅ [CONTEXT] Seleccionado primer programa por defecto:", p.value);
                }
            }
        
            // 2. IMPORTANTE: Rellenar bloques si están vacíos (V1...V5)
            if (b.options.length <= 1) {
                const blocs = ["V1", "V2", "V3", "V4", "V5"];
                b.innerHTML = ""; // Limpiar el "---"
                blocs.forEach(val => {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    b.appendChild(opt);
                });
                console.log("✅ [CONTEXT] Bloques V1-V5 inyectados");
                // Seleccionar el primer bloque si no hay valor
                if (b.options.length > 0 && !b.value) {
                    b.selectedIndex = 0;
                    console.log("✅ [CONTEXT] Seleccionado primer bloque por defecto:", b.value);
                }
            }
        
            // 3. Cargar lo que había guardado el usuario
            if (FASTPASS_UI.Config.loadSelection) {
                FASTPASS_UI.Config.loadSelection();
                console.log("💾 [CONTEXT] Selección recuperada:", p.value, b.value);
            }
        
            _bmark('init · selectors PROG/BLOC (' + _bsec(Date.now() - _tInit0) + ')');

            // 4. Definir el Trigger con LOGS
            const trigger = async () => {
                console.log("🔄 [EVENT] Cambio en selectores detectado");
                FASTPASS_UI.Config.saveSelection(p);
                FASTPASS_UI.Config.saveSelection(b);
                
                // Ejecutamos la lógica de actualización
                try {
                    await this.checkContext();
                    await this.syncConductorUI();
                } catch (e) {
                    console.error("💥 Error en trigger de contexto:", e);
                }
            };
        
            // 5. Vincular eventos
            p.onchange = trigger; // Usamos onchange directo para asegurar que no hay duplicados
            b.onchange = trigger;
        
            // 6. Arrencada inicial forzada
            console.log("🚀 [CONTEXT] Forzando primer check...");
            try {
                const _tChk = Date.now();
                await this.checkContext();
                _bmark('init · checkContext (' + _bsec(Date.now() - _tChk) + ')');
                const _tCond = Date.now();
                await this.syncConductorUI();
                _bmark('init · syncConductorUI/COND (' + _bsec(Date.now() - _tCond) + ')');
            } catch (e) {
                console.error("💥 Error en inicialización de contexto:", e);
                _bmark('init · ERROR: ' + e.message);
            }
            _bmark('init · TOTAL (' + _bsec(Date.now() - _tInit0) + ')');
        },

        // ── CACHÉ DE LA LLISTA DE CONDUCTORES ──────────────────────────────
        // El directori de conductores és al NAS (22 .mov). El listat via JSX
        // (IO.scanDirectory) obre CADA vídeo per xarxa per obtenir-ne la mida
        // (File.length torna 0 en UNC → f.open/f.eof/f.close), i això triga
        // desenes de segons. Aquí NOMÉS calen els noms dels fitxers.
        _conductorsCache: null,
        _conductorsCacheAt: 0,
        _conductorUIRendered: null,
        CONDUCTORS_TTL_MS: 10 * 60 * 1000,

        /**
         * _listConductorNames: Retorna NOMÉS els noms dels .mov de conductores.
         * Via ràpida: window.cep.fs.readdir (sense stats ni obertura de fitxers).
         * Fallback: Utils.readFolder (JSX) si CEP no pot llistar la carpeta.
         * El resultat es cacheja 10 minuts (la carpeta gairebé no canvia).
         * @param {string} dir - Ruta UNC de la biblioteca de conductores
         * @returns {Promise<string[]>}
         */
        async _listConductorNames(dir, allowJsxFallback) {
            const utils = FASTPASS_UI.Utils;
            const t0 = Date.now();
            const isConductorFile = (n) => n.includes('Conduct_') && n.includes('.mov');

            if (this._conductorsCache && (t0 - this._conductorsCacheAt) < this.CONDUCTORS_TTL_MS) {
                return this._conductorsCache;
            }

            let names = null;
            try {
                const res = window.cep.fs.readdir(dir);
                if (res && res.err === 0 && res.data) {
                    names = res.data.map(function (n) { return utils._decodeName(n); }).filter(isConductorFile);
                } else {
                    utils.log('⚠️ [COND] cep.fs.readdir err=' + (res ? res.err : 'null'), 'WARN');
                }
            } catch (eR) {
                utils.log('⚠️ [COND] cep.fs.readdir excepcio: ' + eR.message, 'WARN');
            }

            // FIX (2026-09-16): el fallback JSX (readFolder → obre CADA .mov per xarxa)
            // triga decenes de segons i, com que el motor ExtendScript és MONO-FIL,
            // bloquejava TOTA la resta del panell (FOTO inclosa). Només es fa quan no
            // hi ha cap conductor del programa, que és l'únic cas en què cal.
            if (!names && allowJsxFallback) {
                utils.log('🔁 [COND] Fallback JSX per a la llista del NAS...', 'DEBUG');
                const nasFiles = await utils.readFolder(dir);
                names = (nasFiles || [])
                    .map(f => utils._decodeName((f.name || f).toString()))
                    .filter(isConductorFile);
            }

            if (!names) {
                names = [];
                utils.log('⚠️ [COND] Sense llista del NAS (no es fa el fallback JSX per no bloquejar el motor)', 'WARN');
            }

            names.sort();
            this._conductorsCache = names;
            this._conductorsCacheAt = Date.now();
            utils.log(`🎤 [COND] Llista conductores: ${names.length} fitxers en ${Date.now() - t0} ms`, 'INFO');
            return names;
        },

        /**
         * updateConductorSelector: Repintat forçat del selector COND.
         * El crida main.js al canviar de programa.
         */
        updateConductorSelector(programKey) {
            this._conductorUIRendered = null;
            return this.syncConductorUI();
        },
        /** _withTimeout: limita l'espera d'una promesa (evita bloquejar el panell). */
        _withTimeout(promise, ms, label) {
            return Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => {
                    reject(new Error('timeout ' + (ms / 1000) + 's' + (label ? ' (' + label + ')' : '')));
                }, ms))
            ]);
        },

        /**
         * syncConductorUI: Omple el selector COND.
         * FIX (2026-09-16): abans es pintava NOMÉS després d'esperar el listat del NAS
         * (cep.fs.readdir sobre UNC + fallback JSX, que obre cada .mov per xarxa): si el
         * NAS trigava o el motor JSX estava ocupat (p. ex. una crida de FOTO), el
         * selector quedava BUIT. Ara:
         *   1. es pinten ELS CONDUCTORS DEL PROGRAMA a l'instant (Profile.json),
         *   2. el grup "ALTRES (NAS)" s'afegeix quan el llistat arriba, amb un límit de
         *      8 s perquè mai no bloquegi el panell.
         */
        async syncConductorUI() {
            const config = FASTPASS_UI.Config.get();
            const select = document.getElementById('conductor');
            const programKey = document.getElementById('programa').value;

            if (!select || !programKey) return;

            // Ja pintat per a aquest programa → no repetir. Els triggers es disparen
            // a l'arrencada (main.js + Context.init) i a cada canvi de bloc.
            if (this._conductorUIRendered === programKey && select.options.length > 0) return;

            // 1. Titulars i substituts del programa (Profile.json)
            const progData = config.mapeoProgramas[programKey];
            let defaults = [];
            if (progData && progData.conductors) {
                defaults = [].concat(progData.conductors.titular, progData.conductors.substituts).filter(Boolean);
            }

            _bmark('syncConductorUI · inici (programa=' + programKey + ', defaults=' + defaults.length + ')');

            const mountOptions = (parent, list) => {
                list.forEach(fileName => {
                    const opt = document.createElement('option');
                    opt.value = fileName;
                    opt.textContent = fileName.replace('Conduct_', '').replace('.mov', '');
                    parent.appendChild(opt);
                });
            };

            const buildList = (nasList) => {
                select.innerHTML = "";
                if (defaults.length > 0) {
                    const groupDefault = document.createElement('optgroup');
                    groupDefault.label = "⭐ CONDUCTORS PROGRAMA";
                    mountOptions(groupDefault, defaults);
                    select.appendChild(groupDefault);
                }
                const others = (nasList || []).filter(n => !defaults.includes(n));
                if (others.length > 0) {
                    const groupOthers = document.createElement('optgroup');
                    groupOthers.label = "🌐 ALTRES (NAS)";
                    mountOptions(groupOthers, others);
                    select.appendChild(groupOthers);
                }
                if (select.options.length > 0) select.selectedIndex = 0;
            };

            // 2. Pintat IMMEDIAT amb els defaults del programa (mai selector buit)
            if (defaults.length > 0) {
                buildList(null);
                this._conductorUIRendered = programKey;
            }

            // 3. Noms del NAS amb límit de temps (via ràpida cep.fs.readdir + caché 10 min)
            let nasNames = [];
            const _tNas = Date.now();
            try {
                nasNames = await this._withTimeout(
                    this._listConductorNames(config.rutas.conductors, defaults.length === 0), 8000, 'conductors');
                _bmark('syncConductorUI · NAS conductors (' + _bsec(Date.now() - _tNas) + ', ' + (nasNames ? nasNames.length : 0) + ' noms)');
            } catch (eCond) {
                FASTPASS_UI.Utils.log('⚠️ [COND] Llistat del NAS no disponible (' + eCond.message + '): es mantenen els del programa', 'WARN');
                _bmark('syncConductorUI · NAS conductors TIMEOUT/ERROR (' + _bsec(Date.now() - _tNas) + ')');
                this._conductorUIRendered = programKey;
                return;
            }

            this._conductorUIRendered = programKey;
            if (!nasNames || nasNames.length === 0) {
                if (defaults.length === 0) {
                    FASTPASS_UI.Utils.log('⚠️ [COND] Sense conductors (ni del programa ni del NAS)', 'WARN');
                }
                return;
            }
            buildList(nasNames);
        },

        _extractThemeFromFiles(fileList) {
            if (!fileList || fileList.length === 0) return null;
            
            // Busquem el primer fitxer que tingui el patró de Tema-Titol
            for (let i = 0; i < fileList.length; i++) {
                const f = fileList[i];
                const fileName = (f.name || f).toString();
                
                // Regex actualitzada: busca el text entre 'Tema-Titol_' i el següent punt/codi
                const match = fileName.match(/Tema-Titol_(.*?)\.\d+/i);
                if (match && match[1]) return match[1];
            }
            return null;
        }
    };

    window.FASTPASS_UI = FASTPASS_UI;
})();
