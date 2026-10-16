/**
 * ============================================================================
 * LOGIC: ANALYSIS - v2.0.0
 * Anàlisi d'estructura de projecte. Les 4 fases (escaleta, crudo, cocinado,
 * usuario) viuen a la secció `analysis` del manifest de sessió
 * (.fastpass.json → FASTPASS_UI.Core.AnalysisCenter, FONT ÚNICA).
 * Cada fase usa MERGE per acumular sub-dades (inout + marks).
 *
 * (2026-10-15) CENTRALITZACIÓ: aquest mòdul ja NO és la font de les dades.
 *   · _load(ctx)  → llegeix `manifest.analysis` (abans: analisis_estructura/*.json)
 *   · saveEscaleta/appendPhase → escriuen la secció `analysis` del manifest
 *   · _save(path) → només el MIRALL .json llegible (decoració per a humans)
 * ============================================================================
 */
(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Logic = FASTPASS_UI.Logic || {};

    const callJSX = (s) => window.FASTPASS_UI.Utils.callJSX(s);
    const log = (m) => window.FASTPASS_UI.Utils.log(m, 'DEBUG');
    /** AC: AnalysisCenter (font única). SM: SessionManifest. Es resolen a cada crida. */
    const AC = () => window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.AnalysisCenter;
    const SM = () => window.FASTPASS_UI.SessionManifest;

    FASTPASS_UI.Logic.Analysis = {

        /**
         * Genera la ruta del archivo JSON de análisis.
         * Formato: <carpeta del BLOC>/analisis_estructura/[DD_MM]_[PROG]_[BLOC].json
         * (2026-09-24) Ruta ABSOLUTA dins la carpeta del bloc: abans era relativa i
         * el fitxer podia acabar en qualsevol directori de treball de Premiere.
         */
        _getPath: function (ctx) {
            const dd_mm = ctx.dateDir.substring(0, 5);
            const base  = window.FASTPASS_UI.Utils.workFolder(ctx);
            return base + '/analisis_estructura/' + dd_mm + '_' + ctx.progData.archivo + '_' + ctx.bloque + '.json';
        },

        /**
         * _load: Llegeix les fases d'anàlisi.
         *   · _load(ctx)  → secció `analysis` del manifest de sessió (PREFERENT)
         *   · _load(path) → llegat: llegeix el mirall .json del disc
         * @param {Object|string} ctxOrPath
         * @returns {Promise<Object>} { meta, escaleta, crudo, cocinado, usuario }
         */
        _load: async function (ctxOrPath) {
            if (ctxOrPath && typeof ctxOrPath === 'object') {
                const m = await SM().load(ctxOrPath);
                return (m && m.analysis) ? m.analysis : {};
            }
            // (2026-10-02) IO.readTxt llegeix amb ANSI: els títols amb accents de l'anàlisi
            // tornaven malmesos (i el re-desar els fixava definitivament).
            const raw = window.FASTPASS_UI.Utils._fromMojibake(await callJSX("IO.readTxt('" + ctxOrPath + "')"), 'analisi');
            if (!raw || raw.startsWith('ERR') || raw === '') return {};
            try { return JSON.parse(raw); } catch (e) { return {}; }
        },

        /**
         * _mirror: Reesriu el mirall .json (només humans) a partir del manifest.
         * @param {Object} ctx
         */
        _mirror: async function (ctx) {
            try {
                const m = await SM().load(ctx);
                await this._save(this._getPath(ctx), (m && m.analysis) || {});
            } catch (eM) { log("⚠️ [Analysis] mirall: " + eM.message); }
        },

        /**
         * _save: Escriu un MIRALL .json llegible (només per a humans). La font de
         * dades és la secció `analysis` del manifest; això no la substitueix.
         */
        _save: async function (path, data) {
            const json    = JSON.stringify(data, null, 2);
            // (2026-10-13) El payload viaja DENTRO de un literal de cadena JSX: los saltos
            // de línea del pretty-print (indent 2) rompen el literal → evalScript falla y
            // el fichero NO se escribe nunca (todas las carpetas analisis_estructura del
            // NAS estaban creadas y vacías, del 2026-09-29 al 2026-10-13). Misma receta
            // que flow_markers.js:3288 / Utils.escape.
            const escaped = json.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
            // (2026-09-24) La carpeta del bloc (o la seva subcarpeta analisis_estructura)
            // pot no existir encara al primer run → la creem ABANS d'escriure.
            try {
                const dir = path.substring(0, path.lastIndexOf('/'));
                if (dir) await window.FASTPASS_UI.Utils.ensureFolders(dir);
            } catch (eF) { /* noop */ }
            const wRes = await callJSX("IO.writeTxt('" + path + "', '" + escaped + "')");
            if (typeof wRes === 'string' && wRes.indexOf('ERR') === 0) {
                log("⚠️ [Analysis] IO.writeTxt ha fallat: " + wRes + " → " + path);
            }
        },

        /**
         * Fase 1: Guarda los datos de escaleta al final de _runNew().
         * @param {Object} ctx - Contexto del workflow
         * @param {string} escaletaFile - Nombre del archivo JSON de escaleta
         * @param {Array} lines - Líneas del bloque (getLinesForBlock)
         * @param {Object} contextItems - Items de contexto (prevVideoItem, nextVideoItem)
         * @param {Object} trimBounds - Resultado de calcPrecisionTrimBounds
         */
        saveEscaleta: async function (ctx, escaletaFile, lines, contextItems, trimBounds) {
            const path = this._getPath(ctx);
            const ex   = await this._load(ctx);
            const now  = new Date().toISOString();
            const ac   = AC();
            if (!ac || !ac.writeAnalysis) {
                log("⚠️ [Analysis] AnalysisCenter no disponible: la fase escaleta NO es desa");
                return;
            }

            // Construir itemsBloc a partir de lines
            var itemsBloc = [];
            for (var i = 0; i < lines.length; i++) {
                var l = lines[i];
                itemsBloc.push({
                    sequencia: l.sequencia,
                    num: l.num || '',
                    titol: l.titol || '',
                    agrupacio: l.agrupacio || null,
                    durada: l.durada || '0:00',
                    duradaOnAir: l.duradaOnAir || null,
                    horaEntradaPrevista: l.horaEntradaPrevista || null,
                    horaSortidaPrevista: l.horaSortidaPrevista || null,
                    horaEntradaOnAir: l.horaEntradaOnAir || null,
                    teVideo: l.teVideo || false,
                    flotant: l.flotant || false
                });
            }

            // (2026-10-15) FONT ÚNICA: la fase va al manifest (`analysis.escaleta`);
            // el .json d'analisis_estructura només és el mirall llegible.
            await ac.writeAnalysis(ctx, {
                meta: {
                    prog: ctx.progData.archivo,
                    bloc: ctx.bloque,
                    data: ctx.dateDir.substring(0, 5),
                    escaletaFile: escaletaFile,
                    generatedAt: (ex.meta && ex.meta.generatedAt) || now,
                    lastUpdatedAt: now,
                    phases: { escaleta: true }
                },
                escaleta: {
                    itemsBloc: itemsBloc,
                    itemsContexte: contextItems || {},
                    trimBounds: trimBounds || null
                }
            }, { reason: 'escaleta' });
            await this._mirror(ctx);
            log("📊 [Analysis] escaleta → manifest (mirall: " + path + ")");
        },

        /**
         * Fases 2-4: Añade datos a una fase del JSON de análisis con merge.
         * Las 4 fases son: escaleta, crudo, cocinado, usuario.
         * Cada una acumula sub-datos (inout + marks) mediante Object.assign.
         * @param {Object} ctx - Contexto del workflow
         * @param {string} phaseName - Nombre de la fase (crudo, cocinado, usuario)
         * @param {Object} phaseData - Sub-datos de la fase
         */
        appendPhase: async function (ctx, phaseName, phaseData) {
            const now = new Date().toISOString();
            const ac  = AC();
            if (!ac || !ac.writeAnalysis) {
                log("⚠️ [Analysis] AnalysisCenter no disponible: la fase " + phaseName + " NO es desa");
                return;
            }

            // (2026-10-15) FONT ÚNICA: la fase va al manifest (`analysis.<fase>`).
            // El merge profund del manifest (SessionManifest._deepMerge) fa que
            // afegir-hi sub-dades (inout, marks) NO trepitgi les anteriors: mateix
            // comportament que l'antic `{ ...ex[fase], ...phaseData }`.
            const patch = {
                meta: { lastUpdatedAt: now, phases: {} },
                // Clau dinàmica: la fase que arriba (crudo/cocinado/usuario/escaleta)
                [phaseName]: phaseData || {}
            };
            patch.meta.phases[phaseName] = true;

            await ac.writeAnalysis(ctx, patch, { reason: phaseName });
            await this._mirror(ctx);
            log("📊 [Analysis] " + phaseName + " → manifest (mirall: " + this._getPath(ctx) + ")");
        }
    };

    window.FASTPASS_UI.Logic.Analysis = FASTPASS_UI.Logic.Analysis;
})();
