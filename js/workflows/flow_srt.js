/**
 * ============================================================================
 * WORKFLOW: SRT (SUBTÍTOLS) - v3.1.0
 * Mecanisme de subtítols via .srt → _MOD.srt → reimportació
 *   - PREPARAR: Crea caption track amb el .srt original
 *   - IN: Elimina entrades anteriors al CTI, mou primera al frame 10
 *   - OUT: Elimina entrades posteriors al CTI
 *   - AJUSTAR: Escala proporcionalment totes les entrades
 *   - EXPORT: Diagnòstic / exploració
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Workflows = FASTPASS_UI.Workflows || {};

    const getUtils = () => window.FASTPASS_UI.Utils;
    const log = (m) => getUtils().log(m, "DEBUG");
    const callJSX = (s) => getUtils().callJSX(s);
    const P = () => window.FASTPASS_UI.Logic.SrtParser;
    // FALLBACK de subtítols: cerca relajada a la carpeta de verticalització.
    const getScanner = () => window.FASTPASS_UI.Logic.Scan;

    /**
     * Helper: Escriu _MOD.srt, l'importa al projecte i el reinsereix
     * amb createCaptionTrack.
     */
    async function writeImportAndReinsert(entries, originalSrtPath, projectFolder) {
        // 1. Convertir entries a string SRT
        var srtContent = P().entriesToSrt(entries);
        if (!srtContent) {
            getUtils().status("Error: no entries to write", "error");
            return false;
        }

        // 2. Crear path per _MOD.srt (nom simplificat per evitar errors de path llargs)
        var modName = "fastpass_srt_MOD.srt";
        var modPath = "C:\\temp\\" + modName;

        // 3. Escriure _MOD.srt a C:\temp (local) via JSX amb variable global
        // (IO.writeTxt directe falla per escapes complexos; cep.fs.writeFile escriu incorrecte)
        var writeOk = false;
        try {
            window.__srt_write_content = srtContent;
            var writeResult = await callJSX("(function(){try{var f=new File('" + modPath.replace(/\\/g, '\\\\') + "');f.open('w');f.encoding='UTF-8';f.write(window.__srt_write_content);f.close();return'OK'}catch(e){return'ERR:'+e.message}})()");
            log("📝 SRT: write via global result: " + writeResult);
            if (writeResult === "OK") writeOk = true;
        } catch(e) {
            log("⚠️ SRT: global write error: " + e.message);
        }

        // Fallback: IO.writeTxt directe
        if (!writeOk) {
            try {
                var escaped4jsx = srtContent
                    .replace(/\\/g, '\\\\')
                    .replace(/'/g, "\\'")
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '');
                var writeResult2 = await callJSX("IO.writeTxt('" + modPath.replace(/\\/g, '\\\\') + "','" + escaped4jsx + "')");
                log("📝 SRT: writeTxt result: " + writeResult2);
                if (writeResult2 === "OK") writeOk = true;
            } catch(e) {
                log("⚠️ SRT: writeTxt fallback error: " + e.message);
            }
        }

        if (!writeOk) {
            getUtils().status("Error escrivint _MOD.srt", "error");
            return false;
        }

        // 3.5 Verificar el fitxer escrit
        // (2026-10-02) readTxt → ANSI: reparar perquè el log de verificació mostri el text real.
        var verifyContent = getUtils()._fromMojibake(await callJSX("IO.readTxt('" + modPath.replace(/\\/g, '\\\\') + "')"), 'flow_srt');
        log("📝 SRT: Verificant fitxer escrit - primers 200 chars:\n" + (verifyContent ? verifyContent.substring(0, 200) : "null"));
        log("📝 SRT: Longitud del fitxer: " + (verifyContent ? verifyContent.length : 0) + " chars");

        // 4. Copiar el fitxer al directori del projecte (NAS) i importar des d'allà
        var projectFolder = await callJSX("Context.folder()");
        var nasModPath = (projectFolder || "C:\\temp") + "\\" + modName;
        var nasModPathEscaped = nasModPath.replace(/\\/g, '\\\\');
        
        // Importar usant JSX inline per evitar problemes de parseig JSON
        var normalizedPath = modPath.replace(/\\/g, '/');
        var importResult2 = await callJSX("(function(){try{app.project.importFiles(['" + normalizedPath + "'],true,app.project.rootItem,false);return'OK'}catch(e){return'ERR:'+e.message}})()");
        log("📝 SRT: import result: " + importResult2);
        
        if (!importResult2 || importResult2.indexOf('OK') === -1) {
            // Fallback: usar IO.importFiles amb path normalitzat
            var importResult3 = await callJSX("IO.importFiles('[\"" + normalizedPath + "\"]','')");
            log("📝 SRT: import retry: " + importResult3);
            importResult2 = importResult3.indexOf('OK') >= 0 ? 'OK' : importResult3;
        }
        
        if (!importResult2 || importResult2.indexOf('OK') === -1) {
            getUtils().status("Error important _MOD.srt", "error");
            return false;
        }

        // 5. Esborrar items .srt anteriors del projecte
        await callJSX("(function(){try{var root=app.project.rootItem;for(var i=root.children.numItems-1;i>=0;i--){var c=root.children[i];if(c&&c.name&&c.name.toUpperCase().indexOf('.SRT')>=0){try{c.delete()}catch(e){}}}}catch(e){}})()");

        // 6. Reimportar _MOD.srt
        var importAgainResult = await callJSX("(function(){try{app.project.importFiles(['" + normalizedPath.replace(/\\/g, '/') + "'],true,app.project.rootItem,false);return'OK'}catch(e){return'ERR:'+e.message}})()");

        // 7. Buscar i reinserir
        var escapedModName = encodeURIComponent(modName);
        var findResult = await callJSX("FASTPASS.Project.find(decodeURIComponent('" + escapedModName + "'))");
        if (!findResult || findResult === 'null' || findResult.indexOf('null') >= 0) {
            getUtils().status("No es troba _MOD.srt al projecte", "error");
            return false;
        }

        // 8. Netejar caption tracks antics via PrProjCleaner (JS pur → PowerShell)
        try {
            var cleaner = window.FASTPASS_UI.Logic.PrProjCleaner;
            if (cleaner) {
                var cleanResult = await cleaner.removeOldCaptionTracks();
                log("📝 SRT: Neteja tracks: " + cleanResult.message + " (removed=" + cleanResult.removedTracks + ")");
            }
        } catch(e) {
            log("⚠️ SRT: Error netejant tracks: " + e.message);
        }

        // 9. Crear caption track
        var captionResult = await callJSX("(function(){var s=app.project.activeSequence;if(!s)return'ERR_NO_SEQ';var i=FASTPASS.Project.find(decodeURIComponent('" + encodeURIComponent(modName) + "'));if(!i)return'ERR_ITEM_NOT_FOUND';if(typeof s.createCaptionTrack!=='function')return'ERR_NO_CAPTION_API';return s.createCaptionTrack(i,0)?'OK':'ERR_FAILED'})()");
        log("📝 SRT: createCaptionTrack result: " + captionResult);

        if (captionResult === "OK") {
            // Guardar a state
            var state = FASTPASS_UI.State;
            state.srt = state.srt || {};
            state.srt.modName = modName;
            state.srt.modPath = modPath;
            return true;
        } else {
            getUtils().status("Error createCaptionTrack: " + captionResult, "error");
            return false;
        }
    }

    /**
     * Helper: Flux comú per IN/OUT (llegir, processar, escriure, importar, reinserir)
     */
    async function processSrt(operation, ctiSec) {
        const state = FASTPASS_UI.State;
        if (!state.srt || !state.srt.mediaPath) {
            getUtils().status("Primer has de fer PREPARAR", "warn");
            log("⚠️ SRT: State.srt.mediaPath no trobat.");
            return;
        }

        const originalSrtPath = state.srt.mediaPath;
        const projectFolder = await callJSX("Context.folder()");
        const tempFolderStr = (projectFolder && projectFolder !== "" && projectFolder.indexOf('ERR') !== 0) ? projectFolder : "C:\\temp";

        log("📝 SRT: " + operation + " - CTI=" + ctiSec.toFixed(3) + "s, srt=" + originalSrtPath);

        // 1. Llegir .srt original
        var entries = await P().extractEntriesFromSrtFile(originalSrtPath);
        if (!entries || entries.length === 0) {
            getUtils().status("Error llegint o parsejant .srt", "error");
            log("⚠️ SRT: No entries from " + originalSrtPath);
            return;
        }
        log("📝 SRT: " + entries.length + " entrades parsejades.");

        var resultEntries = null;

        if (operation === "IN") {
            // 2. Trobar target
            var targetIdx = P().findTargetByTime(entries, ctiSec);
            if (targetIdx < 0) {
                // Si no trobem per time, intentem per proporció
                targetIdx = Math.floor((ctiSec / entries[entries.length - 1].endSec) * entries.length);
                if (targetIdx >= entries.length) targetIdx = entries.length - 1;
                log("📝 SRT: IN target per proporció: " + targetIdx);
            } else {
                log("📝 SRT: IN target per time: " + targetIdx);
            }

            // 3. Aplicar trim
            resultEntries = P().applyTrimIn(entries, targetIdx, 0.4);
            log("📝 SRT: IN result: " + resultEntries.length + " entrades.");

        } else if (operation === "OUT") {
            var targetIdx = P().findTargetByTime(entries, ctiSec);
            if (targetIdx < 0) {
                targetIdx = Math.floor((ctiSec / entries[entries.length - 1].endSec) * entries.length);
                if (targetIdx >= entries.length) targetIdx = entries.length - 1;
                log("📝 SRT: OUT target per proporció: " + targetIdx);
            } else {
                log("📝 SRT: OUT target per time: " + targetIdx);
            }

            resultEntries = P().applyTrimOut(entries, targetIdx);
            log("📝 SRT: OUT result: " + resultEntries.length + " entrades.");

        } else if (operation === "AJUSTAR") {
            resultEntries = P().applyTimeAdjust(entries, ctiSec, 0.04);
            log("📝 SRT: AJUSTAR result: " + resultEntries.length + " entrades, ratio=" + (ctiSec - entries[0].startSec) / (entries[entries.length - 1].endSec - entries[0].startSec));
        }

        if (!resultEntries || resultEntries.length === 0) {
            getUtils().status("Error: cap entrada resultant", "error");
            return;
        }

        // 4. Escriure, importar, reinserir
        var success = await writeImportAndReinsert(resultEntries, originalSrtPath, tempFolderStr);
        if (success) {
            getUtils().status(operation + " completat amb èxit (" + resultEntries.length + " entrades)", "exito");
            log("✅ SRT: " + operation + " OK");
        } else {
            getUtils().status(operation + " ha fallat", "error");
            log("❌ SRT: " + operation + " FAILED");
        }
    }

    FASTPASS_UI.Workflows.Srt = {

        /**
         * runPreparar: Busca el fitxer .srt entre els items del projecte
         * i l'insereix a una caption track.
         */
        runPreparar: async function () {
            console.log("🔴🔴 SRT: runPreparar EXECUTAT (DESACTIVAT - usau l'editor SRT) 🔴🔴🔴");
            // DESACTIVAT: la càrrega de .srt al timeline es fa via l'editor SRT (botó CARREGAR + EXPORTAR)
            getUtils().status("Usa CARREGAR i EXPORTAR al panell SRT", "warn");
            return;
            try {
                // 1. Buscar el fitxer .srt entre els items del projecte (root)
                const itemsRaw = await callJSX("FASTPASS.Project.items('')");
                log("📝 SRT: Items rebuts: " + (itemsRaw ? itemsRaw.substring(0, 200) : "null"));

                let items = [];
                try { items = JSON.parse(itemsRaw || "[]"); } catch(e) {
                    log("⚠️ SRT: Error parsejant items: " + e.message);
                    getUtils().status("Error llegint items del projecte", "error");
                    return;
                }

                const srtItem = items.find(i => {
                    if (!i || !i.name) return false;
                    return i.name.toUpperCase().endsWith('.SRT');
                });

                if (!srtItem) {
                    getUtils().status("No s'ha trobat fitxer .srt al projecte", "error");
                    log("⚠️ SRT: Cap fitxer .SRT trobat.");
                    return;
                }

                log("📝 SRT: SRT trobat al projecte: " + srtItem.name);

                // 2. Assignar al State (path + name)
                const state = FASTPASS_UI.State;
                state.srt = state.srt || {};
                state.srt.name = srtItem.name;
                state.srt.path = srtItem.mediaPath || "";

                // Obtenir el path real del SRT
                const srtPathRaw = await callJSX(`(function(){try{var p=app.project.rootItem;for(var i=0;i<p.children.numItems;i++){var c=p.children[i];if(c.name&&c.name.toUpperCase().indexOf('.SRT')>=0&&(c.type===1||c.type===2)){return c.name+'|'+c.getMediaPath()}}return''}catch(e){return'ERR:'+e.message}})()`);
                log("📝 SRT: SRT path from JSX: " + srtPathRaw);
                if (srtPathRaw && srtPathRaw.indexOf('|') > 0) {
                    var parts = srtPathRaw.split('|');
                    state.srt.mediaPath = parts[1];
                    log("📝 SRT: mediaPath desat: " + state.srt.mediaPath);
                }

                // 3. Crear caption track amb el SRT via API nativa Adobe
                const escapedSrtName = encodeURIComponent(srtItem.name);
                log("📝 SRT: Creant caption track via createCaptionTrack natiu...");
                const result = await callJSX(`(function(){var s=app.project.activeSequence;if(!s)return'ERR_NO_SEQ';var i=FASTPASS.Project.find(decodeURIComponent('${escapedSrtName}'));if(!i)return'ERR_ITEM_NOT_FOUND';if(typeof s.createCaptionTrack!=='function')return'ERR_NO_CAPTION_API';return s.createCaptionTrack(i,0)?'OK':'ERR_FAILED'})()`);
                log("📝 SRT: Resultat: " + result);

                if (result === "OK") {
                    getUtils().status("SRT col·locat a caption track", "exito");
                    // Habilitar botons IN/AJUSTAR
                    const btnIn = document.getElementById('btnSrtIn');
                    const btnTimeAdjust = document.getElementById('btnTimeAdjust');
                    if (btnIn) btnIn.disabled = false;
                    if (btnTimeAdjust) btnTimeAdjust.disabled = false;
                    log("✅ SRT: Operació completada amb èxit.");
                } else {
                    getUtils().status("Error al col·locar SRT: " + result, "error");
                    log("❌ SRT: Error: " + result);
                }

            } catch (e) {
                log("💥 SRT: Excepció a runPreparar: " + e.message + " | stack: " + (e.stack || "N/A"));
                getUtils().handleError(e, "SrtPreparar");
            }
        },

        /**
         * _srtCtx: Construeix el context {config, progData, bloque, dateDir} des dels
         * selectors del panell i de l'estat (mateixes fonts que MainButton/SrtEditor).
         *
         * (2026-10-23 · BUG #187) LA DATA ÉS LA DEL PROJECTE OBERT, NO LA DEL RELLOTGE.
         * `State.dateDir` és «avui» quasi sempre (`Context._targetDateDir` només mira el
         * calendari), així que editant el projecte d'AHIR (`2026_10_22/V3`) el SINT es
         * buscava a la carpeta amb data 2026_10_23: allí només hi havia sintètics de
         * MATINS → es va carregar `MATINS_V5_GUIO_LA_PLOMA_…` en un bloc de TN_COMARQUES.
         * Ordre de preferència (font de veritat primer):
         *   1) path real del .prproj obert (`Context._resolveProjectDateDir`)
         *   2) `State.projectDateDir` (data fixada en crear/obrir)
         *   3) `State.dateDir` (data de treball del panell)
         *   4) rellotge (`getFormattedDate`)
         * @returns {Promise<Object|null>}
         */
        _srtCtx: async function () {
            const config = FASTPASS_UI.Config.get();
            const idProg = (document.getElementById('programa') || {}).value;
            const progData = config.mapeoProgramas && config.mapeoProgramas[idProg];
            if (!progData) return null;
            const bloque = (document.getElementById('bloc') || {}).value;
            const St = (window.FASTPASS_UI && window.FASTPASS_UI.State) ? window.FASTPASS_UI.State : {};
            let dateDir = null, dateSrc = '';
            // 1) Data REAL de la carpeta del projecte obert
            try {
                const Ctx = window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.Context;
                if (Ctx && typeof Ctx._resolveProjectDateDir === 'function') {
                    const dReal = await Ctx._resolveProjectDateDir();
                    if (dReal) { dateDir = dReal; dateSrc = 'projecte obert'; }
                }
            } catch (eD) {
                log("⚠️ SRT_CTX: no s'ha pogut resoldre la data del projecte obert: " + eD.message);
            }
            // 2) Data fixada en crear/obrir el projecte
            if (!dateDir && St.projectDateDir) { dateDir = St.projectDateDir; dateSrc = 'State.projectDateDir'; }
            // 3) Data de treball del panell · 4) rellotge
            if (!dateDir && St.dateDir) { dateDir = St.dateDir; dateSrc = 'State.dateDir (panell)'; }
            if (!dateDir) {
                dateDir = getUtils().getFormattedDate().replace(/["\s]/g, "").trim();
                dateSrc = 'rellotge';
            }
            if (St.dateDir && St.dateDir !== dateDir) {
                log("📅 SRT_CTX: data de treball = " + dateDir + " (" + dateSrc + "); el panell deia " +
                    St.dateDir + " → mana el projecte obert", "INFO");
            } else {
                log("📅 SRT_CTX: data de treball = " + dateDir + " (" + dateSrc + ")", "INFO");
            }
            return { config: config, progData: progData, programa: idProg, bloque: bloque, dateDir: dateDir };
        },

        /**
         * _sintInMemoryPath (2026-10-23 · BUG #187): path del .srt SINT que hi ha a
         * l'editor, tant si està VIU (`_kind='SINT'`) com guardat a `_views.SINT`.
         * @returns {string} path o '' si no n'hi ha cap
         */
        _sintInMemoryPath: function (ed) {
            if (!ed) return '';
            if (String(ed._kind || '').toUpperCase() === 'SINT' && ed._srtPath) return String(ed._srtPath);
            const v = ed._views && ed._views['SINT'];
            return (v && v.path) ? String(v.path) : '';
        },

        /**
         * _sintBelongsTo (2026-10-23 · BUG #187): el SINT que hi ha en memòria és del
         * programa del panell? Sense esta guarda, un SINT carregat per error es
         * reutilitzava indefinidament (`hasView('SINT')` → «recuperat de memòria»).
         * @returns {{ok:boolean, name:string, motivo:string}}
         */
        _sintBelongsTo: function (ed, progData) {
            const p = this._sintInMemoryPath(ed);
            if (!p) return { ok: false, name: '', motivo: 'cap SINT en memòria' };
            const name = p.split(/[\\\/]/).pop();
            const scan = getScanner();
            const tok = (scan && typeof scan._sintNameMatchesProg === 'function')
                ? scan._sintNameMatchesProg(name, progData) : null;
            if (tok) return { ok: true, name: name, motivo: 'programa ' + tok };
            return {
                ok: false,
                name: name,
                motivo: 'NO és del programa ' + String((progData && progData.archivo) || '?') + ' (' + name + ')'
            };
        },

        // (2026-10-23) RETIRAT `runSrtFallback`: buscava el .SRT de recanvi a la carpeta
        // de VERTICALITZACIO del NAS. Els subtitols del projecte surten dels blocs de
        // 15 min (`SrtEditor.loadEmergencySrt`) o del .srt que viu al costat del .prproj.


        /**
         * runSrtReset (2026-09-22): Botó ♻️ (RESET / neteja subtítols).
         *   1. Restaura l'estat inicial del SRT que ja hi havia carregat: taula sense
         *      edicions, sense marcadors (esborrats de memòria **i del disc**, #138) i
         *      esborra els clips de subtítols de la seqüència
         *      (comportament de sempre: `SrtEditor.resetToOriginal`).
         *   2. **TORNA A CARREGAR el mateix .srt** (el que viu al costat del .prproj o
         *      l'emergència de 15 min) amb els marcadors del disc buidats; si no n'hi ha
         *      cap, carrega l'emergència (`runSrtLoad`).
         * (2026-10-23) Ja NO es busca cap .SRT a la carpeta de VERTICALITZACIÓ: eixa
         * carpeta ha desaparegut del flux.
         */
        runSrtReset: async function () {
            const ed = window.SrtEditor;
            if (!ed || !ed.resetToOriginal) { getUtils().status("Error: SrtEditor no disponible", "error"); return; }
            log("♻️ SRT_RESET: reiniciant subtítols i recarregant el .srt del projecte...");

            // 1) Estat inicial (taula, marcadors i clips de subtítols de la seqüència)
            try { await ed.resetToOriginal(); } catch (eR) { log("⚠️ SRT_RESET: " + eR.message, "WARN"); }

            // 2) Recarregar el fitxer que ja teníem (o l'emergència si no n'hi ha)
            try {
                const cur = String(ed._srtPath || '');
                if (!cur) {
                    log("ℹ️ SRT_RESET: no hi ha cap .srt carregat → es carrega l'emergència.");
                    await this.runSrtLoad();
                    return;
                }
                if (!ed.loadSrt) { getUtils().status("Error: SrtEditor.loadSrt no disponible", "error"); return; }
                log("♻️ SRT_RESET: recarregant " + cur);
                // (2026-10-02 · BUG #138) Els marcadors s'han d'esborrar TAMBÉ al disc del
                // .srt que es torna a carregar; si no, `loadSrt` els restaura del fitxer
                // persistit i sembla que el RESET no els haja esborrat.
                if (ed._wipeMarkersFile) ed._wipeMarkersFile(cur);
                // (BUG #257 · 2026-11-09) El RESET ha de deixar el projecte SENSE fitxers
                // de marcadors: no només el del .srt carregat (el del SINT queda fora si
                // eixe és el nom actual). Un `fastpass_srt_markers_*.json` orfe torna a
                // interferir en la pròxima càrrega, així que s'esborren tots els del
                // projecte (carpeta del projecte + respatller C:/temp).
                if (ed.wipeMarkersForProject && ed._projectKey) {
                    const nW = ed.wipeMarkersForProject(ed._projectKey);
                    log("♻️ SRT_RESET: fitxers de marcadors del projecte esborrats (" + nW + ")");
                }
                // (BUG #224-b · 2026-11-09) kind explícit: el RESET sempre torna a la
                // vista NORMAL. Si es veia el SINT (o la MOD), `_srtPath` ja no s'hi
                // contamina —el fixa només el NORMAL, vegeu `loadSrt`—, però deixar-ho
                // explícit evita que un canvi futur reobri el forat.
                const ok = await ed.loadSrt(cur, { kind: 'NORMAL', skipMarkerRestore: true });
                if (ok) {
                    getUtils().status("SRT resetejat i recarregat: " + cur.split(/[\\/]/).pop(), "exito");
                    log("✅ SRT_RESET: carregat a l'editor: " + cur);
                } else {
                    getUtils().status("SRT reset · no s'ha pogut carregar " + cur, "error");
                }
            } catch (e) {
                log("💥 SRT_RESET: " + e.message);
                getUtils().handleError(e, "SrtReset");
            }
        },

        /**
         * runSrtLoad: Punt d'entrada del botó ⬇️ (CARREGAR).
         * Carrega els .SRT dels blocs de 15 min que solapen el bloc
         * (`SrtEditor.loadEmergencySrt`, carpeta `rutas.subtitulos`) i els
         * re-temporitza contra l'inici del clip extret. NO importa res al projecte.
         * Si el fitxer carregat és DIFERENT del que hi havia, es buiden al disc els
         * marcadors persistits d'eixe .srt (no arrosseguem marques d'un altre fitxer).
         */
        runSrtLoad: async function () {
            const ed = window.SrtEditor;
            if (!ed || !ed.loadSrt) { getUtils().status("Error: SrtEditor no disponible", "error"); return; }
            // El carregador d'emergència no retorna si ha reeixit → es compara el
            // fitxer carregat ABANS i DESPRÉS (_srtPath el fixa loadSrt).
            const before = String(ed._srtPath || '');
            log("📥 SRT_LOAD: blocs de 15 min...");
            try {
                await ed.loadEmergencySrt();
            } catch (eE) {
                log("⚠️ SRT_LOAD: " + eE.message);
                getUtils().handleError(eE, "SrtLoad");
                return;
            }
            const after = String(ed._srtPath || '');
            if (!after) {
                log("⚠️ SRT_LOAD: no s'ha carregat cap .srt.");
                return;
            }
            if (after !== before) {
                if (ed._wipeMarkersFile) ed._wipeMarkersFile(after);
                log("✅ SRT_LOAD: carregat " + after + " (fitxer nou → marcadors del disc buidats)");
            } else {
                log("ℹ️ SRT_LOAD: el fitxer carregat no ha canviat: " + after);
            }
        },

        /**
         * _sintMissText (2026-10-23 · BUG #190): missatge CURT i concret de per què
         * no hi ha SINT per al bloc. Abans el 🧩 responia «revisa
         * rutas.subtitulosSinteticos» i pareixia que el botó no feia res: el que
         * passava és que eixe dia la carpeta només tenia sintètics d'un ALTRE
         * programa (la guarda de #187 els descarta, i fa bé).
         * El motiu el deixa `Scanner.srtSynthetic` a `_sintMiss`.
         * @param {Object} ctx - { config, progData, bloque, dateDir }
         * @returns {string}
         */
        _sintMissText: function (ctx) {
            const prog = (ctx && ctx.progData && ctx.progData.archivo) ? String(ctx.progData.archivo) : '?';
            const bloc = (ctx && ctx.bloque) ? ' ' + String(ctx.bloque) : '';
            const fecha = (ctx && ctx.dateDir) ? String(ctx.dateDir).replace(/_/g, '-') : '?';
            const sc = getScanner();
            const miss = (sc && sc._sintMiss) ? sc._sintMiss : null;
            let txt = "cap .srt sintètic de " + prog + bloc + " del " + fecha;
            if (miss && miss.reason === 'altres-programes') {
                const otros = (miss.aliens || []).map(function (n) { return String(n).split('_')[0]; })
                    .filter(function (v, i, a) { return v && a.indexOf(v) === i; });
                txt += " · eixe dia només n'hi ha de " + (otros.length ? otros.slice(0, 3).join('/') : 'altres programes');
            } else if (miss && miss.reason === 'cap-del-dia') {
                txt += " · a la carpeta no hi ha cap sintètic d'eixe dia";
            } else if (miss && miss.reason === 'carpeta') {
                txt += " · carpeta de sintètics inaccessible o buida";
            }
            return txt;
        },

        /**
         * runSrtLoadSynthetic (F3.2): Ctrl+clic al botó ⬇️ CARREGAR.
         * Carrega els SRT SINTETICS del dia (`rutas.subtitulosSinteticos`) a
         * l'editor amb marca PROPRIA (taronja, `_kind='SINT'`) i SENSE tocar el
         * SRT normal: la taula que es veia es guarda a l'editor (`_views.NORMAL`)
         * i el segon Ctrl+clic hi torna.
         *
         * (2026-10-23 · BUG #187) El SINT que es carrega és SEMPRE del MATEIX
         * PROGRAMA i de la data del PROJECTE OBERT (`_srtCtx` + 
         * `Scanner._sintNameMatchesProg`). Un SINT d'un altre programa que hi haja
         * en memòria es descarta en comptes de reutilitzar-se.
         * @returns {Promise<boolean>} true si s'ha carregat (o s'ha tornat al NORMAL)
         */
        runSrtLoadSynthetic: async function () {
            const ed = window.SrtEditor;
            if (!ed || !ed.loadSrt) { getUtils().status("Error: SrtEditor no disponible", "error"); return false; }
            try {
                // (2026-10-23 · BUG #187) El context es resol ABANS de decidir res: la
                // data de treball ha de ser la del projecte obert i el SINT que hi haja
                // en memòria ha de ser del MATEIX programa (si no, es descarta).
                const ctx = await this._srtCtx();
                if (!ctx) { getUtils().status("Selecciona un programa", "warn"); return false; }
                const mem = this._sintBelongsTo(ed, ctx.progData);
                if (mem.name && !mem.ok) {
                    log("⚠️ SRT_SINT: el SINT en memòria «" + mem.name + "» " + mem.motivo +
                        " → es descarta i es busca el del programa", "WARN");
                    // Si s'estava veient, es torna al NORMAL (si hi és) i es buida la
                    // instantània: `loadSrt(kind:'SINT')` la tornaria a desar/pitar.
                    try {
                        if (String(ed._kind || '').toUpperCase() === 'SINT' && ed.hasView('NORMAL')) ed.switchView('NORMAL');
                    } catch (eSw) { log("⚠️ SRT_SINT: no s'ha pogut tornar al NORMAL: " + eSw.message); }
                    try { if (ed._views) delete ed._views['SINT']; } catch (eDel) { }
                }
                // Ja s'esta veient el SINT (del programa) → el Ctrl+clic alterna al SRT normal
                if (mem.ok && ed._kind === 'SINT' && typeof ed.hasView === 'function' && ed.hasView('NORMAL')) {
                    if (ed.switchView('NORMAL')) {
                        getUtils().status("SINT ocultat · tornat al SRT normal", "exito");
                        log("📥 SRT_SINT: tornat a la vista NORMAL");
                        return true;
                    }
                }
                // Ja hi ha una taula SINT en memoria (s'hi havia tornat al normal):
                // es recupera TAL QUAL, sense rellegir el fitxer (conserva les edicions)
                if (mem.ok && ed._kind !== 'SINT' && typeof ed.hasView === 'function' && ed.hasView('SINT')) {
                    if (ed.switchView('SINT')) {
                        getUtils().status("SINT recuperat (sense rellegir)", "exito");
                        log("📥 SRT_SINT: vista SINT recuperada de memoria");
                        return true;
                    }
                }
                const cand = await getScanner().srtSynthetic(ctx);
                if (!cand) {
                    const fecha = String(ctx.dateDir || '').replace(/_/g, '-');
                    // (2026-10-23 · BUG #190) El motiu concret: programa + data + què hi
                    // ha eixe dia a la carpeta (no un «revisa les rutes» genèric).
                    getUtils().status("SINT: " + this._sintMissText(ctx), "warn");
                    log("⚠️ SRT_SINT: " + this._sintMissText(ctx) + " (" +
                        (ctx.config.rutas.subtitulosSinteticos || '?') + " · data " + (fecha || '?') + ")", "WARN");
                    return false;
                }
                log("📥 SRT_SINT: N" + cand.level + " (" + cand.reason + ", " + cand.candidates + " candidat(s)) → " + cand.path);
                const ok = await ed.loadSrt(cand.path, { kind: 'SINT' });
                if (ok) {
                    getUtils().status("SINT carregat: " + cand.name, "exito");
                    log("✅ SRT_SINT: carregat a l'editor: " + cand.name + " (s'exporta a S2 per defecte)");
                    return true;
                }
                getUtils().status("SINT: no s'ha pogut carregar " + cand.name, "error");
                log("⚠️ SRT_SINT: loadSrt ha fallat amb '" + cand.path + "' (mira la traça SRT_EDIT anterior)");
                return false;
            } catch (e) {
                log("💥 SRT_SINT: " + e.message);
                getUtils().handleError(e, "SrtSynthetic");
                return false;
            }
        },

        /**
         * runSrtFillGaps (F3.3 · opcio B · BUG #224 2026-11-06): reomple els BUITS
         * del SRT normal amb les entrades sintetiques que hi cauen. El resultat es
         * una vista MOD **dins del mateix editor**: el SRT normal no es modifica, el
         * fitxer original no es toca mai i el TIMELINE queda igual.
         *
         * (BUG #224 · 2026-11-06) QUIN SINT I ON: abans es carregava el PRIMER .srt
         * del programa i de la data (nivell N2 del Scanner, «qualvol bloc») i el 🧩
         * omplia els buits amb eixes frases encara que no hi tocaren (mesurat el
         * 06/11: 0/74 frases en comú → «Querida Xaric…» dins del rotatiu dels EUA).
         * Ara s'envia al editor TOTA la llista de candidats (`Scanner.srtSynthetic`
         * → `all`), el reomplit MESURA cada un contra el SRT carregat i només
         * col·loca el que quadra (`SrtEditor._pickSintForFill`); si cap quadra, no
         * es toca res i el motiu queda al panell i al log.
         *
         * (BUG #188 · 2026-10-23) El 🧩 NO exporta res: deixa la taula MOD a l'editor
         * (els SINT encaixats es pinten amb un to propi) i és l'usuari qui decidix si
         * l'exporta amb 💾. Abans exportava els «clips nous» a una pista de subtítols
         * nova (S2) i el panell s'amagava: al timeline hi quedaven 3 clips solts i
         * semblava que s'hagueren perdut la resta de subtítols («elimina la majoria»).
         *
         * (2026-10-23 · BUG #187) Un SINT d'un ALTRE programa mai és una base
         * valida: si el que hi ha en memòria no és del programa del panell, es
         * descarta i es rellegeix de la carpeta.
         */
        runSrtFillGaps: async function () {
            const ed = window.SrtEditor;
            if (!ed || !ed.mergeSyntheticGaps) { getUtils().status("Error: SrtEditor no disponible", "error"); return false; }
            try {
                const ctx = await this._srtCtx();
                if (!ctx) { getUtils().status("Selecciona un programa", "warn"); return false; }
                // (BUG #187) El SINT que hi haja en memòria ha de ser del MATEIX programa.
                const mem = this._sintBelongsTo(ed, ctx.progData);
                if (mem.name && !mem.ok) {
                    log("⚠️ SRT_FILL: el SINT en memòria «" + mem.name + "» " + mem.motivo +
                        " → es descarta i es busca entre els de la carpeta", "WARN");
                    try {
                        if (String(ed._kind || '').toUpperCase() === 'SINT' && ed.hasView('NORMAL')) ed.switchView('NORMAL');
                    } catch (eSw) { log("⚠️ SRT_FILL: no s'ha pogut tornar al NORMAL: " + eSw.message); }
                    try { if (ed._views) delete ed._views['SINT']; } catch (eDel) { }
                }
                // (BUG #224) CANDIDATS: tots els .srt del programa i de la data (el del
                // bloc primer). El reomplit decidix amb la MESURA de frases en comú.
                const cand = await getScanner().srtSynthetic(ctx);
                const lista = (cand && cand.all && cand.all.length)
                    ? cand.all
                    : (cand ? [{ name: cand.name, path: cand.path, level: cand.level }] : []);
                if (!lista.length) {
                    // (2026-10-23 · BUG #190) El motiu REAL (programa, data i què hi
                    // ha eixe dia) en compte del genèric «revisa les rutes», que feia
                    // pensar que el botó no responia.
                    const motiu = this._sintMissText(ctx);
                    getUtils().status("SINT: " + motiu + " → res a reomplir", "warn");
                    log("⚠️ SRT_FILL: " + motiu + " → no es reomple res (traces [SCAN:srtSynthetic])", "WARN");
                    return false;
                }
                log("🧩 SRT_FILL: " + lista.length + " candidat(s) → " +
                    lista.slice(0, 4).map(function (c) { return 'N' + c.level + ' ' + c.name; }).join(' | ') +
                    (lista.length > 4 ? ' …' : '') + ' (es mesura cada un contra el SRT carregat)');
                log("🧩 SRT_FILL: reomplint buits amb els SINT (només taula, sense tocar el timeline)...");
                const merged = await ed.mergeSyntheticGaps({ candidates: lista });
                if (!merged) return false;
                // (BUG #188) ACÍ S'ACABA: el timeline NO es toca. Els clips entren al
                // timeline només amb 💾 (o 💾+Ctrl = només el que falta, a S2 amb color).
                log("🧩 SRT_FILL: taula MOD a l'editor · el timeline no s'ha tocat (per a exportar: 💾)");
                return true;
            } catch (e) {
                log("💥 SRT_FILL: " + e.message);
                getUtils().handleError(e, "SrtFillGaps");
                return false;
            }
        },

        /**
         * runSrtIn: Elimina entrades ANTERIORS al CTI. Mou primera al frame 10.
         */
        runSrtIn: async function () {
            log("📝 SRT: runSrtIn - INICI");
            try {
                var cti = parseFloat(await callJSX("Timeline.get()") || "0");
                await processSrt("IN", cti);
            } catch (e) {
                log("💥 SRT: Excepció a runSrtIn: " + e.message + " | stack: " + (e.stack || "N/A"));
                getUtils().handleError(e, "SrtIn");
            }
        },

        /**
         * runSrtOut: Elimina entrades POSTERIORS al CTI.
         */
        runSrtOut: async function () {
            log("📝 SRT: runSrtOut - INICI");
            try {
                var cti = parseFloat(await callJSX("Timeline.get()") || "0");
                await processSrt("OUT", cti);
            } catch (e) {
                log("💥 SRT: Excepció a runSrtOut: " + e.message + " | stack: " + (e.stack || "N/A"));
                getUtils().handleError(e, "SrtOut");
            }
        },

        /**
         * runTimeAdjust: Escala proporcionalment TOTES les entrades per quadrar amb el CTI.
         */
        runTimeAdjust: async function () {
            log("⏳ SRT: runTimeAdjust - INICI");
            try {
                var cti = parseFloat(await callJSX("Timeline.get()") || "0");
                await processSrt("AJUSTAR", cti);
            } catch (e) {
                log("💥 SRT: Excepció a runTimeAdjust: " + e.message + " | stack: " + (e.stack || "N/A"));
                getUtils().handleError(e, "SrtTimeAdjust");
            }
        },

        /**
         * exploreSubtitleTracks: Diagnòstic per explorar subtitleTracks.
         * Mantinguda per compatibilitat amb el botó EXPORT.
         */
        exploreSubtitleTracks: async function () {
            log("📝 SRT_EXPLORE: Iniciant exploració...");
            try {
                const apiResult = await callJSX(`(function(){
                    try {
                        var seq = app.project.activeSequence;
                        if (!seq) return "ERR_NO_SEQ";
                        var lines = [];
                        lines.push("--- SUBTITLE TRACKS ---");
                        lines.push("typeof seq.subtitleTracks=" + (typeof seq.subtitleTracks));
                        lines.push("seq.subtitleTracks=" + (seq.subtitleTracks ? "EXISTS" : "UNDEFINED/NULL"));
                        if (seq.subtitleTracks) {
                            try { lines.push("NUM_SUBTRACKS=" + seq.subtitleTracks.numTracks); } catch(e) { lines.push("NUM_SUBTRACKS_ERR=" + e.message); }
                        }
                        var seqProps = [];
                        for (var q in seq) {
                            var ql = q.toLowerCase();
                            if (ql.indexOf('sub') >= 0 || ql.indexOf('cap') >= 0) {
                                try { seqProps.push(q + ":" + typeof seq[q]); } catch(e) {}
                            }
                        }
                        lines.push("SEQ_SUB_CAP=" + seqProps.join(" | "));
                        return lines.join("\\n");
                    } catch(e) { return "ERR: " + e.message + " | line: " + e.line; }
                })()`);
                log("📝 SRT_EXPLORE: " + apiResult);
                getUtils().status("API: subtitleTracks no accessible", "warn");
            } catch (e) {
                log("💥 SRT_EXPLORE: Excepció: " + e.message);
                getUtils().handleError(e, "SrtExplore");
            }
        }
    };

    window.FASTPASS_UI.Workflows.Srt = FASTPASS_UI.Workflows.Srt;
})();
