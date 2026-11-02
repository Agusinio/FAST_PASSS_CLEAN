/* ============================================================================
 * flow_mapa.js — Botó 🎨 "Gráfica" (grup GRF): importador MAPA
 *
 * (2026-10-08) PUNT D'ENTRADA = el CABEZAL. El grafisme arrenca ON ÉS EL CABEZAL i
 * l'espai hàbil el marca el CLIP SELECCIONAT al timeline (o, si no n'hi ha, el clip
 * de la pista MP4 que conté el cabezal). El MARCADOR de l'ítem NOMÉS serveix per
 * triar l'ÍTEM d'escaleta (coincidència de nom amb el fitxer de ZZZ_GRAFISME).
 * (2026-09-18) Amb el clip a substituir SELECCIONAT al timeline, aquest workflow ofereix 3 opcions:
 *   1) Importar el(s) fitxer(s) de la carpeta del dia que coincideixin amb el nom
 *      de l'ÍTEM D'ESCALETA on és el cabezal.
 *   2) Obrir el navegador de fitxers perquè l'usuari triï.
 *   3) Importar el coincident i, si no n'hi ha cap, obrir el navegador.
 *
 * Carpeta del dia: ...\ZZZ_GRAFISME\<DD MES>  (les subcarpetes són "17 SETEMBRE",
 * NO "2026_09_17" → cal traduir la data del projecte).
 * El material s'importa al BIN "GRAF" i es col·loca a la pista de grafismes, en ordre
 * d'escaleta, des del CABEZAL. Si no hi cap tot, es retallen els clips.
 * Ítem de referència (només per al match del fitxer): el marcador anterior al cabezal.
 *
 * (2026-10-28 · ZONA GRISA · 2a volta) LA MÀSCARA VA SEMPRE PER DAMUNT:
 *   · es PUJA el troç de màscara de l'ÍTEM d'escaleta (Intro / Donapàs / Off) de la pista
 *     de la MÀSCARA (V2) a la de grafismes (V3) i el grafisme es col·loca a V2, per davall;
 *   · primer es corta i es mou la màscara i DESPRÉS es col·loca el grafisme;
 *   · si no es pot moure (sense rang d'ítem, sense màscara a V2, V3 ocupada) es col·loca
 *     com sempre a V3: mai no bloqueja la col·locació.
 *   (1a volta: només es feia amb zona grisa al peu #D9D9D9; provat en viu amb un grafisme
 *   a SANG sense gris que tapava la màscara → ara és SEMPRE. La mesura del gris queda com
 *   a INFO al log: `js/logic/21_GrafZonaGris_Logic.js`. Spec: `docs/specs/GRAF_ZONA_GRIS.md`.)
 * ========================================================================== */
(function () {
    'use strict';

    window.FASTPASS_UI = window.FASTPASS_UI || {};
    var W = window.FASTPASS_UI.Workflows = window.FASTPASS_UI.Workflows || {};

    // ── Configuració ──────────────────────────────────────────────────────
    // (F2 · 2026-10-21) La carpeta arrel dels grafismes del dia JA NO es una
    // constant: ve de `Profile.json` -> rutas.grafismos (setup.html). Es llig en
    // cada us perque un canvi de configuracio s'aplique sense reiniciar.
    var GRAF_BIN = 'GRAF';
    // (2026-09-22) Mapa FINAL de pistes: GRAF/grafismes = fondos = V3 (v_graf/v_graficos),
    // congelat del tema-títol = V6 (v_tema). Es resolen des de la CONFIG a _flow()
    // (aquí només són el fallback si la configuració no respon).
    var TRACK_GRAF = 3;
    var TRACK_FREEZE = 6;
    // (2026-10-28 · ZONA GRISA) Pista de la MÀSCARA (config `v_mascara`, V2). Els
    // grafismes AMB zona grisa al peu es col·loquen ACÍ i el troç de màscara de
    // l'ítem puja a la pista de dalt perquè quede per damunt del grafisme.
    var TRACK_MASCARA = 2;
    var VIDEO_EXT = ['mov', 'mp4', 'mxf', 'm4v', 'avi', 'mts', 'm2t', 'wmv', 'r3d'];
    var MESOS = ['GENER', 'FEBRER', 'MARÇ', 'ABRIL', 'MAIG', 'JUNY',
        'JULIOL', 'AGOST', 'SETEMBRE', 'OCTUBRE', 'NOVEMBRE', 'DESEMBRE'];

    // ── Helpers de la casa: ressolts via FASTPASS_UI.Utils (com flow_chyrons.js).
    // OJO: callJSX / log / getClipsLogic NO existeixen com a globals → si s'usen
    // directament peta amb "callJSX is not defined".
    function U() { return window.FASTPASS_UI.Utils; }
    function L(msg, lvl) {
        try { U().log(msg, lvl || 'DEBUG'); }
        catch (e) { try { console.log(msg); } catch (e2) { } }
    }
    function callJSX(script) { return U().callJSX(script); }
    function getClipsLogic() { return window.FASTPASS_UI.Logic.Clips; }
    function stripExt(name) { return String(name || '').replace(/\.[^.]+$/, ''); }

    /**
     * _grafRoot (F2): carpeta arrel dels grafismes del dia, de la configuracio.
     * '' si l'usuari encara no l'ha configurada (els qui la usen avisen i surten).
     */
    function _grafRoot() {
        try {
            var cfg = window.FASTPASS_UI.Config && window.FASTPASS_UI.Config.get();
            var p = (cfg && cfg.rutas && cfg.rutas.grafismos) ? cfg.rutas.grafismos : '';
            // Sense separador final: davall s'hi concatena '\\' + dia.
            return String(p).replace(/[\\/]+$/, '');
        } catch (e) { return ''; }
    }

    W.Mapa = {

        // ═══════════════════════════════════════════════════════════════
        // ENTRADA: comportament únic = OPCIÓ 3 (decidida amb l'usuari 18/09)
        //   Automàtic per coincidència de nom amb l'ítem del cabezal i, si no
        //   n'hi ha cap, obrir el navegador de fitxers. Sense cap finestra prèvia.
        // ═══════════════════════════════════════════════════════════════
        run: async function () {
            try {
                if (U() && U().validateActiveSequence && !(await U().validateActiveSequence())) return;
            } catch (e) { }
            await this._flow();
        },

        // ═══════════════════════════════════════════════════════════════
        // (2026-09-23) ENTRADA AUTOMÀTICA PER MARCADORS GROCS (F6·GF)
        // Repassa els marcadors GRÀFICS (color 4) del timeline, tria els que porten
        // GRAFISME ASSOCIAT (paraula clau al títol) i col·loca el fitxer corresponent de
        // la carpeta del dia AL TC DEL MATEIX MARCADOR (mateix criteri que el botó 🎨).
        // Si no hi ha coincidència de nom, obre el navegador de fitxers.
        // S'executa al FINAL del botó COLOCAR (després dels chyrons i de l'IPD).
        // ═══════════════════════════════════════════════════════════════

        /**
         * GRAF_KEYWORDS: paraules clau del títol del marcador que indiquen que aquell
         * marcador GROC porta un GRAFISME associat a la carpeta ZZZ_GRAFISME del dia.
         * (2026-09-23) Ampliable: afegir aquí els casos nous (p. ex. 'GF', 'INFOGRAFIA',
         * 'EVOLUCIO', 'PANORAMICA'…). La comparació és sense accents i en majúscules.
         * (2026-10-30 · petició d'usuari) `GOOGLE` també: els grafismes de Google
         * (`app google tots sant gervasi esvoranc.mov`) es guien pels marcadors amb
         * «GOOGLE» al títol, igual que els MAPA. La pregunta deixa de ser «és MAPA?»
         * i passa a ser «és MAPA o GOOGLE?».
         */
        GRAF_KEYWORDS: ['MAPA', 'GOOGLE'],

        /**
         * MATCH_MIN: llindar (0-1) de la coincidència RELATIVA de nom per a ancorar el
         * grafisme al marcador del seu ítem (`_anchorMarker`). 0,60 vol dir «60 % del
         * nom del marcador es reconeix al nom del fitxer»; per davall, la paleta es
         * queda amb el cabezal de sempre.
         * (2026-10-28 · 3a volta) Cas viu: `app google tots sant gervasi esvoranc.mov`
         * contra «01p22 - P2 PAS 1 GOOGLE tots SANT GERVASI ESVORANC» → 0,91.
         */
        MATCH_MIN: 0.60,

        /**
         * ANCHOR_LINE: si true, l'àncora del grafisme és l'INICI DE LA LÍNIA del
         * marcador coincident (l'ítem sencer: «01i»), no el sub-ítem («01p22»). Així
         * el grafisme, la màscara i el rang de l'ítem parlen sempre del mateix tram.
         */
        ANCHOR_LINE: true,

        runFromMarkers: async function () {
            try {
                if (U() && U().validateActiveSequence && !(await U().validateActiveSequence())) return;
            } catch (e) { }

            var cand = await this._grafCandidates();
            if (!cand.length) {
                L('➖ [MAPA·MARKS] Cap marcador amb grafisme associat (paraula clau: ' +
                    this.GRAF_KEYWORDS.join(', ') + ') → res a fer.');
                return;
            }
            L('🎨 [MAPA·MARKS] ' + cand.length + ' marcador(s) amb grafisme associat: ' +
                cand.map(function (c) { return c.num + '@' + c.time.toFixed(2) + 's'; }).join(', '));

            var folder = this._folderForDate(await this._resolveDateDir());
            if (!folder) {
                L('⚠️ [MAPA·MARKS] No puc resoldre la carpeta del dia', 'WARN');
                U().status('MAPA: carpeta del dia no resolta', 'error');
                return;
            }
            this._applyTrackConfig();
            var files = await this._filesIn(folder);
            L('🎨 [MAPA·MARKS] Carpeta: ' + folder + ' · ' + files.length + ' fitxer(s) de vídeo');
            await this._runCandidates(cand, folder, files);
        },

        /**
         * _runCandidates: bucle de col·locació per a cada marcador candidat.
         * @param {Array}  cand   - [{ num, nombre, time, kw }]
         * @param {string} folder - carpeta del dia
         * @param {Array}  files  - fitxers de vídeo de la carpeta del dia
         */
        _runCandidates: async function (cand, folder, files) {
            var ok = 0, ko = 0;
            for (var i = 0; i < cand.length; i++) {
                var c = cand[i];
                try {
                    L('🎨 [MAPA·MARKS] ' + (i + 1) + '/' + cand.length + ' · ' + c.num + ' @ ' +
                        c.time.toFixed(2) + 's · "' + c.nombre + '" (clau ' + c.kw + ')');
                    var picked = this._match({ num: c.num, nombre: c.nombre }, files);
                    if (picked.length) {
                        L('   🎨 [MAPA·MARKS] Coincidències (' + picked.length + '): ' +
                            picked.map(function (f) { return f.name; }).join(', '));
                    } else {
                        L('   ⚠️ [MAPA·MARKS] Cap coincidència de nom → navegador de fitxers', 'WARN');
                        U().status('MAPA: tria el grafisme de ' + c.num, 'warn');
                        picked = await this._askFiles(folder);
                    }
                    if (!picked.length) { L('   ⏭️ [MAPA·MARKS] ' + c.num + ': sense fitxer → saltat', 'WARN'); ko++; continue; }

                    var items = await this._import(picked);
                    if (!items.length) { L('   ⏭️ [MAPA·MARKS] ' + c.num + ': importació fallida', 'ERROR'); ko++; continue; }

                    var ref = await this._refClipAt(c.time);
                    var freeze = await this._freezeUnderCti(c.time);
                    await this._placeClips(items, c.time, freeze, ref, { picked: picked });
                    ok++;
                } catch (eC) {
                    L('   ⚠️ [MAPA·MARKS] ' + c.num + ' ha llançat: ' + eC.message, 'ERROR');
                    ko++;
                }
                await U().delay(200);
            }
            U().status('MAPA: ' + ok + ' grafisme(s) col·locat(s)' + (ko ? ' · ' + ko + ' sense fitxer' : ''),
                ok ? 'exito' : 'warn');
            try { await U().targetOnlyV1('MAPA·MARKS'); await U().focusV1('MAPA·MARKS'); } catch (eF) { }
        },

        /**
         * _grafCandidates: marcadors GROCS (color 4) amb paraula clau de grafisme al títol.
         * @returns {Promise<Array>} [{ num, nombre, time, kw, comments }]
         */
        _grafCandidates: async function () {
            var out = [];
            var mk = [];
            try {
                var raw = await callJSX('Markers.get()');
                mk = raw ? JSON.parse(raw) : [];
            } catch (eM) {
                L('⚠️ [MAPA·MARKS] No puc llegir els marcadors: ' + eM.message, 'WARN');
                return out;
            }
            for (var i = 0; i < mk.length; i++) {
                var m = mk[i];
                var cmt = String(m.comments || m.comment || '');
                var idx = cmt.indexOf(' -');
                if (idx <= 0) continue;                       // només "NN - Nom"
                var kw = this._keywordOf(cmt);
                if (!kw) continue;                            // sense paraula clau → no porta grafisme
                var t = (typeof m.time === 'number') ? m.time : parseFloat(m.time);
                if (!isFinite(t)) continue;
                // (2026-09-23) El COLOR NO és fiable al llegir-lo: en aquesta versió de
                // Premiere, Markers.get() retorna color = -1 (v. 8_Markers.jsx: `current.color`
                // peta i queda -1) tot i que el marcador s'hagi creat amb color=4. Per això el
                // filtre REAL és la PARAULA CLAU; el color només s'informa al log. Només es
                // descarta si el color és CONEGUT i no és el groc (4).
                if (m.color !== 4 && m.color !== -1 && m.color !== undefined && m.color !== null) {
                    L('   ⏭️ [MAPA·MARKS] "' + cmt.substring(0, 60) + '": clau ' + kw +
                        ' però color=' + m.color + ' (no GROC) → saltat', 'WARN');
                    continue;
                }
                if (m.color !== 4) {
                    L('   ℹ️ [MAPA·MARKS] "' + cmt.substring(0, 60) + '": color no disponible (' +
                        m.color + ') → es fa servir la paraula clau ' + kw);
                }
                out.push({
                    num: cmt.substring(0, idx).replace(/^\s+|\s+$/g, ''),
                    nombre: stripExt(cmt.substring(idx + 2).replace(/^\s+|\s+$/g, '')),
                    time: t, kw: kw, comments: cmt
                });
            }
            return out;
        },

        /**
         * _keywordOf: primera paraula clau de GRAF_KEYWORDS present al text (normalitzat).
         * @returns {string|null}
         */
        _keywordOf: function (text) {
            var norm = this._norm(text);
            for (var k = 0; k < this.GRAF_KEYWORDS.length; k++) {
                if (norm.indexOf(this.GRAF_KEYWORDS[k]) !== -1) return this.GRAF_KEYWORDS[k];
            }
            return null;
        },

        /**
         * _applyTrackConfig: llegeix de la CONFIG les pistes de grafismes i de congelat
         * i actualitza les variables del mòdul (TRACK_GRAF / TRACK_FREEZE).
         */
        _applyTrackConfig: function () {
            try {
                var cv = window.FASTPASS_UI.Config.get().tracks.video;
                if (cv && cv.graficos) TRACK_GRAF = cv.graficos;
                else if (cv && cv.graf) TRACK_GRAF = cv.graf;
                if (cv && cv.tematitol) TRACK_FREEZE = cv.tematitol;
                if (cv && cv.mascara != null) TRACK_MASCARA = cv.mascara;
                L('🗺️ [MAPA] Pistes de la config → GRAF=V' + TRACK_GRAF + ' · congelat=V' + TRACK_FREEZE +
                    ' · màscara=V' + TRACK_MASCARA);
            } catch (eCfg) {
                L('⚠️ [MAPA] no s\'ha pogut llegir la config de pistes: ' + eCfg.message, 'WARN');
            }
        },


        // (2026-09-18) _menu eliminat: comportament únic = OPCIÓ 3 (automàtic → navegador).

        // ═══════════════════════════════════════════════════════════════
        // FLUX PRINCIPAL
        // ═══════════════════════════════════════════════════════════════
        _flow: async function () {
            try {
                var cti = parseFloat(await callJSX('Timeline.get()') || '0');
                L('🗺️ [MAPA] Inici · CTI=' + cti.toFixed(2) + 's');

                // (2026-10-08) PUNT D'ENTRADA = el CABEZAL (petició d'usuari). El grafisme
                // arrenca ON ÉS EL CABEZAL i l'ESPAI HÀBIL el marca el CLIP SELECCIONAT
                // (o el clip de la pista MP4 que conté el cabezal si la selecció s'ha perdut).
                // ABANS (2026-09-23) l'entrada era el TC del MARCADOR de l'ítem: si el cabezal
                // anava més enllà del marcador, el grafisme apareixia desplaçat enrere i
                // retallat a l'espai del clip d'aquell marcador (cas real 08/10: cabezal a
                // 38.84s → col·locat a 27.84s amb espai de només 3.24s). El MARCADOR ara
                // NOMÉS tria l'ÍTEM d'escaleta (coincidència de nom), no mou el grafisme.
                var ref = await this._resolveRefClip(cti);
                if (!ref) {
                    L('⚠️ [MAPA] Cap clip de referència (ni seleccionat ni sota el cabezal a ' +
                        cti.toFixed(2) + 's) → no es col·loca res. Posa el cabezal damunt del clip o selecciona\'l.', 'WARN');
                    U().status('MAPA: posa el cabezal damunt del clip', 'warn');
                    return;
                }
                // Ancoratge: el cabezal. Si la SELECCIÓ és en un altre lloc (no conté el
                // cabezal), mana el clip de la pista MP4 que SÍ que el conté (l'espai hàbil
                // ha de ser on s'està treballant); si no n'hi ha cap (forat entre clips),
                // s'ancora a l'IN del clip de referència.
                var refSec = cti;
                var dins = (cti >= ref.start - 0.001 && cti < ref.end - 0.001);
                if (!dins) {
                    var at = await this._refClipAt(cti);
                    if (at) {
                        L('🗺️ [MAPA] El clip de referència V' + ref.track + '[' + ref.index + '] no conté el cabezal → ' +
                            'mana el clip de V1 sota el cabezal (V' + at.track + '[' + at.index + '])');
                        ref = at;
                        dins = true;
                    }
                }
                if (!dins) {
                    refSec = ref.start;
                    L('🗺️ [MAPA] El cabezal (' + cti.toFixed(2) + 's) és fora del clip de referència V' +
                        ref.track + '[' + ref.index + '] (' + ref.start.toFixed(2) + 's→' + ref.end.toFixed(2) +
                        's) → entrada a l\'IN del clip', 'WARN');
                }
                L('🗺️ [MAPA] Referència = ' + ref.src + ' V' + ref.track + '[' + ref.index + '] "' + ref.name +
                    '" (' + ref.start.toFixed(2) + 's→' + ref.end.toFixed(2) + 's) · entrada a ' +
                    refSec.toFixed(2) + 's · espai hàbil fins ' + ref.end.toFixed(2) + 's');

                var dateDir = await this._resolveDateDir();
                var folder = this._folderForDate(dateDir);
                if (!folder) {
                    L('⚠️ [MAPA] No puc resoldre la carpeta del dia (data projecte: "' + dateDir + '")', 'WARN');
                    U().status('MAPA: carpeta del dia no resolta', 'error');
                    return;
                }
                L('🗺️ [MAPA] Carpeta: ' + folder);

                // (2026-09-23) Pistes segons la CONFIG activa (mapa final de pistes):
                // grafismes → tracks.video.graficos (V3) · congelat → tracks.video.tematitol (V6).
                this._applyTrackConfig();

                // Ítem d'escaleta (NOMÉS per a la coincidència de nom del fitxer): el marcador
                // anterior a la posició d'entrada. No mou el grafisme.
                var item = await this._itemAtCti(refSec);
                if (!item || !item.nombre) {
                    L('⚠️ [MAPA] Cap ítem d\'escaleta associat al punt d\'entrada (marcador anterior a ' +
                        refSec.toFixed(2) + 's)', 'WARN');
                } else {
                    L('🗺️ [MAPA] Ítem de referència: "' + item.num + ' - ' + item.nombre + '"');
                }

                var files = await this._filesIn(folder);
                L('🗺️ [MAPA] ' + files.length + ' fitxer(s) de vídeo a la carpeta');

                // OPCIÓ 3 (única): automàtic i, si no hi ha cap coincidència, navegador.
                var picked = this._match(item, files);
                if (picked.length) {
                    L('🗺️ [MAPA] Coincidències (' + picked.length + '): ' +
                        picked.map(function (f) { return f.name; }).join(', '));
                } else {
                    L('🗺️ [MAPA] Cap coincidència de nom amb l\'ítem → navegador de fitxers', 'WARN');
                    picked = await this._askFiles(folder);
                }
                if (!picked.length) {
                    U().status('MAPA: res a importar', 'warn');
                    return;
                }

                // (2026-10-28 · 3a volta) EL GRAFISME VA AL MARCADOR DEL SEU ÍTEM, NO AL
                // CABEZAL NI AL MARCADOR SELECCIONAT. Cas viu: amb un altre marcador
                // seleccionat al panell, l'insert eixia a la seua posició. Ara, un cop
                // triats els fitxers, es busca el marcador amb coincidència RELATIVA de
                // nom (`_anchorMarker`) i s'ancora ahí; si no n'hi ha cap, es manté el
                // cabezal de sempre (res canvia respecte d'abans).
                try {
                    var anc = await this._anchorMarker(picked, cti);
                    if (anc && Math.abs(anc.time - refSec) > 0.05) {
                        var refA = await this._refClipAt(anc.time);
                        if (refA) {
                            L('🗺️ [MAPA] Entrada MOVIDA al marcador ' + anc.num + ' (' + anc.time.toFixed(2) +
                                's): abans el cabezal/selecció la posava a ' + refSec.toFixed(2) + 's');
                            ref = refA;
                            refSec = anc.time;
                            item = await this._itemAtCti(refSec);
                            L('🗺️ [MAPA] Referència = V' + ref.track + '[' + ref.index + '] "' + ref.name +
                                '" (' + ref.start.toFixed(2) + 's→' + ref.end.toFixed(2) + 's) · espai hàbil fins ' +
                                ref.end.toFixed(2) + 's');
                        } else {
                            L('⚠️ [MAPA·àncora] El marcador ' + anc.num + ' (' + anc.time.toFixed(2) +
                                's) no té cap clip de V1 → es manté el cabezal', 'WARN');
                        }
                    }
                } catch (eA) {
                    L('⚠️ [MAPA·àncora] ' + eA.message + ' → es manté el cabezal', 'WARN');
                }

                var items = await this._import(picked);
                if (!items.length) { U().status('MAPA: importació fallida', 'error'); return; }

                // (18/09) ABANS de tocar la pista de grafismes: capturar el CONGELAT (PNG del
                // tema-títol) que hi ha sota el clip de referència. Després es replica a la
                // pista de congelat fins al final d'aquest clip.
                var freeze = await this._freezeUnderCti(refSec);

                await this._placeClips(items, refSec, freeze, ref, { picked: picked });
                U().status('MAPA: ' + items.length + ' clip(s) a V' + TRACK_GRAF, 'exito');

                // (2026-09-21) Tornar la auto-selecció a V1: targeting només V1/A1 + clip de V1.
                try {
                    await U().targetOnlyV1('MAPA-GRAF');
                    await U().focusV1('MAPA-GRAF');
                } catch (eF) { L('⚠️ [MAPA] focus V1: ' + eF.message, 'WARN'); }
            } catch (e) {
                L('💥 [MAPA] ' + e.message, 'ERROR');
                try { U().handleError(e, 'Mapa'); } catch (e2) { }
            }
        },

        /**
         * _resolveDateDir: Data de treball (YYYY_MM_DD) amb fallbacks.
         *
         * (2026-10-28 · BUG #196, causa raíz corregida) LA DATA HA DE SER LA DEL
         * PROJECTE OBERT, NO LA DEL RELLOTGE. Evidència real (FASTPASS.log del
         * 27/10 14:53:35): amb `Pruebas_TNC_V1_….prproj` obert («✅ Projecte obert»),
         * el poll d'estat va desancorar `State.projectDateDir` a null al segon cicle
         * sense `Registry.activeProjectName` («🔓 [dateDir] Desancorant…»). En eixe
         * moment este mètode queia al RELLOTGE: en sessió nocturna (després de
         * mitjanit) el navegador de GRÀFICS obria la carpeta del DIA SEGÜENT al del
         * projecte. Mateix criteri que `flow_srt.js::_srtCtx` (BUG #187):
         *   1) path REAL del .prproj obert (`Context._resolveProjectDateDir`) ← veritat
         *   2) State.projectDateDir (projecte obert / fixada en crear-lo)
         *   3) manifest carregat (NOMÉS si totes les claus són del mateix dia)
         *   4) State.workTarget === 'yesterday' → dia natural anterior
         *   5) rellotge (últim recurs, amb avís)
         * @returns {Promise<string>}
         */
        _resolveDateDir: async function () {
            var St = (window.FASTPASS_UI && window.FASTPASS_UI.State) ? window.FASTPASS_UI.State : null;
            // 1) Data REAL de la carpeta del projecte obert (font de veritat)
            try {
                var Ctx = window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.Context;
                if (Ctx && typeof Ctx._resolveProjectDateDir === 'function') {
                    var dReal = await Ctx._resolveProjectDateDir();
                    if (dReal) {
                        L('🗺️ [MAPA] Data del projecte obert: ' + dReal);
                        return dReal;
                    }
                }
            } catch (eR) {
                L('⚠️ [MAPA] No puc resoldre la data del .prproj obert: ' + eR.message, 'WARN');
            }
            // 2) Data ancorada a l'estat (s'ancora en crear/obrir el projecte)
            if (St && St.projectDateDir) {
                L('🗺️ [MAPA] Data del projecte (via State.projectDateDir): ' + St.projectDateDir);
                return St.projectDateDir;
            }
            // 3) Manifest carregat: només si NO és ambigu (un sol dia al cache).
            // Abans s'agafava la PRIMERA clau amb data → podia ser el dia d'un altre
            // manifest carregat a la sessió.
            try {
                var cache = (window.FASTPASS_UI.SessionManifest && window.FASTPASS_UI.SessionManifest._cache) || {};
                var keys = Object.keys(cache);
                var dies = {}, nDies = 0;
                for (var i = 0; i < keys.length; i++) {
                    var m = String(keys[i]).match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
                    if (m && !dies[m[0]]) { dies[m[0]] = 1; nDies++; }
                }
                if (nDies === 1) {
                    var unic = Object.keys(dies)[0];
                    L('🗺️ [MAPA] Data del projecte (via manifest): ' + unic);
                    return unic;
                }
                if (nDies > 1) {
                    L('⚠️ [MAPA] Manifest ambigu (' + nDies + ' dies al cache: ' +
                        Object.keys(dies).join(', ') + ') → no l\'use per a la data', 'WARN');
                }
            } catch (eM) {
                L('⚠️ [MAPA] No puc traure la data del manifest: ' + eM.message, 'WARN');
            }
            // 4/5) Rellotge: últim recurs (pot ser el DIA SEGÜENT al del projecte!)
            var d = new Date();
            if (St && St.workTarget === 'yesterday') d.setDate(d.getDate() - 1);
            var dd = ('0' + d.getDate()).slice(-2);
            var mm = ('0' + (d.getMonth() + 1)).slice(-2);
            var fb = d.getFullYear() + '_' + mm + '_' + dd;
            L('⚠️ [MAPA] Data del projecte DESCONEGUDA → fallback rellotge: ' + fb +
                (St && St.workTarget === 'yesterday' ? ' (mode correcció)' : ''), 'WARN');
            return fb;
        },

        // ═══════════════════════════════════════════════════════════════
        // CARPETA DEL DIA: 2026_09_17 → "17 SETEMBRE"
        // ═══════════════════════════════════════════════════════════════
        _folderForDate: function (dateDir) {
            var m = String(dateDir || '').match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
            if (!m) return null;
            var day = parseInt(m[3], 10);
            var month = parseInt(m[2], 10);
            if (day < 1 || day > 31 || month < 1 || month > 12) return null;
            var root = _grafRoot();
            if (!root) {
                L('⚠️ [MAPA] Falta la ruta de GRAFISMES a la configuracio (Config Gral → Grafismes)', 'WARN');
                return null;
            }
            return root + '\\' + day + ' ' + MESOS[month - 1];
        },

        /**
         * _folderExists: la carpeta existix de debò? (àtom JSX `IO.exists`).
         * Serveix per a no passar mai a `cep.fs.showOpenDialog` una ruta inicial
         * inexistent (en eixe cas el diàleg obri a l'últim directori recordat).
         * @param {string} folder
         * @returns {Promise<boolean>}
         */
        _folderExists: async function (folder) {
            if (!folder) return false;
            try {
                var r = await callJSX("IO.exists('" + U().escape(String(folder)) + "')");
                return String(r).trim() === 'true';
            } catch (e) {
                L('⚠️ [MAPA] No puc comprovar la carpeta "' + folder + '": ' + e.message, 'WARN');
                return false;
            }
        },

        /**
         * _dialogFolder: directori on HA D'ARRANCAR el navegador de fitxers.
         * (2026-10-28 · BUG #196) Regla d'usuari: el navegador de GRÀFICS arranca
         * SEMPRE a la carpeta del dia del bloc (la de l'escaleta), no a l'últim
         * directori recordat de Windows. Ordre:
         *   1) la carpeta del dia (si existix)
         *   2) l'arrel de grafismes de la config (si existix)
         *   3) null → CEP decidix (últim recurs, amb avís al log)
         * @param {string} folder - carpeta del dia ja calculada (`_folderForDate`).
         * @returns {Promise<string|null>}
         */
        _dialogFolder: async function (folder) {
            if (folder && await this._folderExists(folder)) return folder;
            L('⚠️ [MAPA] La carpeta del dia NO existix: ' + (folder || '(no resolta)'), 'WARN');
            var root = _grafRoot();
            if (root && await this._folderExists(root)) {
                L('🗺️ [MAPA] Navegador → arrel de grafismes (la carpeta del dia no hi és): ' + root);
                return root;
            }
            L('⚠️ [MAPA] Tampoc no existix l\'arrel de grafismes (' +
                (root || 'sense config a rutas.grafismos') +
                '): el navegador arrancarà on recorde Windows', 'WARN');
            return null;
        },

        // ═══════════════════════════════════════════════════════════════
        // CLIP DE REFERÈNCIA: el clip a SUBSTITUIR pel grafisme
        // (2026-09-22) El grafisme substitueix AQUEST clip: comença a la seva IN i ocupa
        // tot el seu rang. El cabezal sol (CTI) NO és la referència (era erroni).
        // ═══════════════════════════════════════════════════════════════
        /**
         * _selectedClip: Clip de VÍDEO seleccionat al timeline (àtom Clips.getSelectedVideo).
         * @returns {Promise<Object|null>} { track, index, name, start, end } o null
         */
        _selectedClip: async function () {
            try {
                var raw = await callJSX('Clips.getSelectedVideo()');
                if (!raw || raw === 'null' || String(raw).indexOf('ERR') === 0) return null;
                var s = JSON.parse(raw);
                if (typeof s.start !== 'number' || typeof s.end !== 'number') return null;
                return s;
            } catch (e) {
                L('⚠️ [MAPA] No puc llegir el clip seleccionat: ' + e.message, 'WARN');
                return null;
            }
        },

        /**
         * _resolveRefClip: resol el CLIP DE REFERÈNCIA (el que el grafisme substitueix).
         * (2026-09-22) Ordre de prioritat:
         *   1. Clip SELECCIONAT a la pista MP4 (`tracks.video.mp4`, V1) — el cas habitual:
         *      és el clip que l'operador té seleccionat a la posició del cabezal.
         *   2. Clip de la pista MP4 (V1) que CONTÉ el cabezal (si la selecció s'ha perdut).
         *   3. Qualsevol altre clip de vídeo seleccionat (altres pistes).
         * @param {number} cti - Posició del cabezal (s)
         * @returns {Promise<Object|null>} { track, index, name, start, end, src } o null
         */
        _resolveRefClip: async function (cti) {
            var tMp4 = 1;
            try { tMp4 = window.FASTPASS_UI.Config.get().tracks.video.mp4 || 1; } catch (eCfg) { }
            var sel = await this._selectedClip();

            // 1. Seleccionat a V1 (pista MP4)
            if (sel && sel.track === tMp4) { sel.src = 'clip SELECCIONAT a V' + tMp4; return sel; }

            // 2. Clip de V1 que conté el cabezal
            try {
                var clips = await getClipsLogic().getTrackClips(tMp4, 'video');
                for (var i = 0; i < clips.length; i++) {
                    var c = clips[i];
                    if (cti >= c.start - 0.001 && cti < c.end - 0.001) {
                        return {
                            track: tMp4, index: c.index, name: c.name, start: c.start, end: c.end,
                            src: 'V' + tMp4 + ' a la posició del cabezal (' + cti.toFixed(2) + 's)'
                        };
                    }
                }
                L('⚠️ [MAPA] Cap clip a V' + tMp4 + ' a la posició del cabezal (' + cti.toFixed(2) + 's)', 'WARN');
            } catch (e) {
                L('⚠️ [MAPA] No puc llegir V' + tMp4 + ': ' + e.message, 'WARN');
            }

            // 3. Qualsevol altra selecció de vídeo
            if (sel) { sel.src = 'clip SELECCIONAT a V' + sel.track + ' (no V' + tMp4 + ')'; return sel; }

            return null;
        },

        /**
         * _refClipAt: Clip de V1 (pista MP4) que CONTÉ la posició donada. Serveix per saber
         * el final de l'espai disponible del grafisme (no ha d'invair el clip següent) i
         * per limitar el congelat final.
         * @param {number} sec - posició al timeline (s)
         * @returns {Promise<Object|null>} { track, index, name, start, end, src } o null
         */
        _refClipAt: async function (sec) {
            var tMp4 = 1;
            try { tMp4 = window.FASTPASS_UI.Config.get().tracks.video.mp4 || 1; } catch (eCfg) { }
            try {
                var clips = await getClipsLogic().getTrackClips(tMp4, 'video');
                for (var i = 0; i < clips.length; i++) {
                    var c = clips[i];
                    if (sec >= c.start - 0.001 && sec < c.end - 0.001) {
                        return {
                            track: tMp4, index: c.index, name: c.name, start: c.start, end: c.end,
                            src: 'V' + tMp4 + ' a ' + sec.toFixed(2) + 's'
                        };
                    }
                }
                L('⚠️ [MAPA] Cap clip a V' + tMp4 + ' a ' + sec.toFixed(2) + 's', 'WARN');
            } catch (e) {
                L('⚠️ [MAPA] No puc llegir V' + tMp4 + ': ' + e.message, 'WARN');
            }
            return null;
        },

        // ═══════════════════════════════════════════════════════════════
        // ÍTEM D'ESCALETA A LA POSICIÓ DE REFERÈNCIA (marcador anterior o la posició)
        // ═══════════════════════════════════════════════════════════════
        _itemAtCti: async function (refSec) {
            var raw = await callJSX('Markers.get()');
            var markers = [];
            try { markers = raw ? JSON.parse(raw) : []; } catch (e) { }
            var best = null;
            for (var i = 0; i < markers.length; i++) {
                var m = markers[i];
                var t = (typeof m.time === 'number') ? m.time : parseFloat(m.time);
                if (!isFinite(t)) continue;
                var cmt = String(m.comments || '');
                var idx = cmt.indexOf(' -');
                if (idx <= 0) continue;                        // només "NN - Nom"
                var prefix = cmt.substring(0, idx).replace(/^\s+|\s+$/g, '');
                if (!/^\d/.test(prefix)) continue;
                if (t > refSec + 0.001) continue;              // només anteriors o a la posició de referència
                if (!best || t > best.time) {
                    best = { num: prefix, nombre: cmt.substring(idx + 2).replace(/^\s+|\s+$/g, ''), time: t };
                }
            }
            if (!best) return null;
            best.nombre = stripExt(best.nombre);
            return best;
        },

        // ═══════════════════════════════════════════════════════════════
        // NORMALITZACIÓ I COINCIDÈNCIA DE NOMS
        // ═══════════════════════════════════════════════════════════════
        _norm: function (s) {
            return String(s || '')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // sense accents
                .toUpperCase()
                .replace(/\.[a-z0-9]{2,4}$/i, '')                    // sense extensió
                .replace(/[^A-Z0-9]+/g, ' ')                         // separadors → espai
                .replace(/^\s+|\s+$/g, '');
        },

        _filesIn: async function (folder) {
            var out = [];
            try {
                var utils = U();
                // F1 (2026-10-01): readFolder pot retornar null (lectura FALLIDA ≠ buit)
                var list = (await utils.readFolder(folder)) || [];    // UNC → via JSX
                for (var i = 0; i < list.length; i++) {
                    var n = list[i].name;
                    if (/^\./.test(n)) continue;                      // ocults
                    var ext = (n.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
                    if (VIDEO_EXT.indexOf(ext) === -1) continue;
                    out.push({ name: n, full: folder.replace(/[\\/]+$/, '') + '\\' + n, norm: this._norm(n) });
                }
            } catch (e) {
                L('⚠️ [MAPA] Error llegint la carpeta: ' + e.message, 'WARN');
            }
            return out;
        },

        /**
         * _match: files coincidents amb l'ítem del cabezal, en ordre d'escaleta.
         * Coincidència per contenció de tokens normalitzats (en tots dos sentits).
         */
        _match: function (item, files) {
            if (!item || !item.nombre || !files || !files.length) return [];
            var itemNorm = this._norm(item.nombre);
            if (itemNorm.length < 3) return [];
            var itemTokens = itemNorm.split(' ').filter(function (t) { return t.length > 2; });

            var hits = [];
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                var hit = false;
                if (f.norm.indexOf(itemNorm) !== -1 || itemNorm.indexOf(f.norm) !== -1) {
                    hit = true;
                } else if (itemTokens.length) {
                    // tots els tokens significatius de l'ítem són al nom del fitxer
                    var all = true;
                    for (var t = 0; t < itemTokens.length; t++) {
                        if (f.norm.indexOf(itemTokens[t]) === -1) { all = false; break; }
                    }
                    hit = all;
                }
                if (hit) hits.push(f);
            }
            return hits;
        },

        // ═══════════════════════════════════════════════════════════════
        // ANCRATGE AL MARCADOR PER NOM RELATIU (2026-10-28 · 3a volta)
        // ═══════════════════════════════════════════════════════════════
        /**
         * _normFon: normalització FONÈTICA suau, damunt de `_norm`, per a comparar noms
         * catalans escrits de maneres distintes (B/V, S/SS, Y/I, plural en -S).
         * Exemples reals: «ESBORANC»/«ESVORANC», «VEÏNS»/«VEINS», «GERVASY»/«GERVASI».
         * @param {string} s
         * @returns {string}
         */
        _normFon: function (s) {
            var n = this._norm(s);
            n = n.replace(/B/g, 'V')            // ESBORANC / ESVORANC
                .replace(/Y/g, 'I')             // GERVASY / GERVASI
                .replace(/QU/g, 'K')
                .replace(/C([EI])/g, 'S$1')     // CERVASI / SERVASI
                .replace(/SS/g, 'S');
            // Plural català: fora la S final de les paraules llargues (VEINS → VEIN).
            n = n.split(' ').map(function (t) {
                return (t.length > 4 && /S$/.test(t)) ? t.substring(0, t.length - 1) : t;
            }).join(' ');
            return n;
        },

        /**
         * _dice: coeficient de Dice per BIGRAMES (0-1) entre dos tokens. 1 = iguals.
         * És la mesura de «s'assemblen» que fa servir `_scoreNombre`, sense cap
         * llibreria externa.
         * @param {string} a
         * @param {string} b
         * @returns {number}
         */
        _dice: function (a, b) {
            if (a === b) return 1;
            if (!a || !b) return 0;
            if (a.length < 2 || b.length < 2) return (a.charAt(0) === b.charAt(0)) ? 0.5 : 0;
            var m = {}, i, n = 0;
            for (i = 0; i < a.length - 1; i++) {
                var g = a.substr(i, 2);
                m[g] = (m[g] || 0) + 1;
            }
            for (i = 0; i < b.length - 1; i++) {
                var h = b.substr(i, 2);
                if (m[h]) { m[h]--; n++; }
            }
            return (2 * n) / (a.length - 1 + b.length - 1);
        },

        /**
         * _scoreNombre: coincidència RELATIVA (0-1) entre el nom d'un FITXER i el nom
         * d'un MARCADOR d'escaleta. Mesura quina part del nom del marcador es reconeix
         * al nom del fitxer (el fitxer pot dur paraules de més: client, data,
         * «app», «google»…). Cada token del marcador es compara amb el MILLOR token del
         * fitxer (`_dice`), ponderat per la seua llargada.
         *
         *   · contenció completa en qualsevol sentit → 1
         *   · «ESBORANC SANT GERVASI» vs «app google tots sant gervasi esvoranc» → 0,91
         *   · «DONAPAS» vs «app google tots sant gervasi esvoranc» → 0
         *
         * @param {string} nomFitxer - nom del fitxer (amb o sense extensió)
         * @param {string} nomMarcador - nom de l'ítem del marcador
         * @returns {number} 0-1
         */
        _scoreNombre: function (nomFitxer, nomMarcador) {
            var f = this._normFon(nomFitxer);
            var m = this._normFon(nomMarcador);
            if (!f || !m) return 0;
            if (f.indexOf(m) !== -1 || m.indexOf(f) !== -1) return 1;
            var mt = m.split(' ').filter(function (t) { return t.length > 2; });
            var ft = f.split(' ').filter(function (t) { return t.length > 2; });
            if (!mt.length || !ft.length) return 0;
            var num = 0, den = 0;
            for (var i = 0; i < mt.length; i++) {
                var best = 0;
                for (var j = 0; j < ft.length; j++) {
                    var d = this._dice(mt[i], ft[j]);
                    if (d > best) best = d;
                }
                num += best * mt[i].length;
                den += mt[i].length;
            }
            return den ? num / den : 0;
        },

        /**
         * _anchorMarker: TC del MARCADOR on va el grafisme, triat per coincidència
         * RELATIVA de nom amb els fitxers triats (MAI pel cabezal ni per la selecció:
         * amb un marcador seleccionat al panell, l'insert eixia al lloc equivocat).
         *
         * Regla: es puntua el nom de cada fitxer contra els marcadors NUMERATS
         * («NN… - Nom», sub-ítems inclosos) i es pren el millor; si guanya un sub-ítem
         * («01p22»), l'àncora és l'INICI DE LA SEUA LÍNIA («01i») perquè el grafisme i
         * el rang de la màscara parlen del mateix ítem. Sense cap coincidència per
         * damunt de `MATCH_MIN` retorna null i la paleta fa el de sempre (cabezal).
         *
         * @param {Array} picked - [{ name, full }] fitxers triats
         * @param {number} cti - cabezal (desempat: guanya el marcador més pròxim)
         * @returns {Promise<Object|null>} { time, num, nombre, score, file, mk, line }
         */
        _anchorMarker: async function (picked, cti) {
            var markers = [];
            try {
                var raw = await callJSX('Markers.get()');
                markers = raw ? JSON.parse(raw) : [];
            } catch (eM) {
                L('⚠️ [MAPA·àncora] No puc llegir els marcadors: ' + eM.message, 'WARN');
                return null;
            }
            var tot = this._lineMarkers(markers, false);      // ítems + sub-ítems
            if (!tot.length) return null;
            var linies = this._lineMarkers(markers, true);    // només fronteres de línia
            var best = null;
            for (var i = 0; i < (picked || []).length; i++) {
                if (!picked[i] || !picked[i].name) continue;
                for (var j = 0; j < tot.length; j++) {
                    var sc = this._scoreNombre(picked[i].name, tot[j].nombre);
                    var millor = !best || sc > best.score + 1e-9;
                    // Empat: guanya el marcador més pròxim al cabezal.
                    if (!millor && best && Math.abs(sc - best.score) < 1e-9 && isFinite(cti)) {
                        if (Math.abs(tot[j].time - cti) < Math.abs(best.mk.time - cti)) millor = true;
                    }
                    if (millor) best = { score: sc, mk: tot[j], file: picked[i].name };
                }
            }
            if (!best || best.score < this.MATCH_MIN) {
                L('🗺️ [MAPA·àncora] Cap marcador coincident per nom (millor: ' +
                    (best ? '"' + best.mk.num + ' - ' + best.mk.nombre + '" ' + best.score.toFixed(2) : 'cap') +
                    ' < ' + this.MATCH_MIN + ') → el grafisme va al cabezal de sempre');
                return null;
            }
            var ancla = best.mk;
            if (this.ANCHOR_LINE) {
                for (var k = 0; k < linies.length; k++) {
                    if (linies[k].time <= best.mk.time + 0.001) ancla = linies[k];
                }
            }
            var esLinia = (ancla.time === best.mk.time);
            L('🗺️ [MAPA·àncora] "' + best.file + '" ≈ "' + best.mk.num + ' - ' + best.mk.nombre +
                '" (' + best.score.toFixed(2) + ') → àncora a ' + ancla.time.toFixed(2) + 's (' +
                (esLinia ? 'mateix marcador' :
                    'inici de l\'ítem "' + ancla.num + (ancla.nombre ? ' - ' + ancla.nombre : '') + '"') + ')');
            return {
                time: ancla.time, num: ancla.num, nombre: ancla.nombre,
                score: best.score, file: best.file, mk: best.mk, line: esLinia
            };
        },

        /**
         * _askFiles: navegador de fitxers (CEP) apuntant a la carpeta del dia.
         */
        _askFiles: async function (folder) {
            var picked = [];
            try {
                if (!(window.cep && window.cep.fs && window.cep.fs.showOpenDialog)) {
                    L('⚠️ [MAPA] showOpenDialog no disponible', 'WARN');
                    return picked;
                }
                // (2026-10-28 · BUG #196) El navegador ha d'arrancar SEMPRE a la carpeta
                // del dia del projecte. Abans se li passava la ruta calculada sense
                // comprovar-la: si eixa carpeta no existia (dia sense material, mes amb
                // un altre nom…), el diàleg de CEP ignorava la ruta inicial i obria a
                // l'ÚLTIM DIRECTORI RECORDAT. Ara es valida abans i, si no hi és, arranca
                // a l'arrel de grafismes (mai a una ruta inexistent).
                var startDir = await this._dialogFolder(folder);
                L('🗺️ [MAPA] Navegador de fitxers → "' + (startDir || '(últim recordat)') + '"' +
                    (startDir && startDir !== folder ? ' · (la carpeta del dia no existix: ' + folder + ')' : ''));
                var r = window.cep.fs.showOpenDialog(true, false, 'MAPA — tria fitxers per importar',
                    startDir, VIDEO_EXT);
                if (!r || r.err !== 0 || !r.data || !r.data.length) {
                    L('🗺️ [MAPA] Selecció cancel·lada');
                    return picked;
                }
                for (var i = 0; i < r.data.length; i++) {
                    var full = r.data[i];
                    var name = full.replace(/^.*[\\/]/, '');
                    picked.push({ name: name, full: full, norm: this._norm(name) });
                }
                L('🗺️ [MAPA] Triats manualment: ' + picked.length);
            } catch (e) {
                L('⚠️ [MAPA] Error al navegador de fitxers: ' + e.message, 'WARN');
            }
            return picked;
        },

        /**
         * _isStill: Cert si el NOM del mèdia és una IMATGE FIXA (PNG/JPG/TIFF/PSD/BMP/GIF/
         * EPS/AI). Mateixa regla que `flow_chyrons.js::_isStillMedia` (si el mòdul de
         * Chyrons hi és, es reutilitza el seu; si no, s'aplica la mateixa expressió).
         * (2026-10-16 · BUG #169) El «congelat» que es REPLICA a la pista del tema-títol
         * NOMÉS pot ser una imatge fixa: un grafisme de vídeo (mov/mp4) no és cap congelat.
         * @param {string} name
         * @returns {boolean}
         */
        _isStill: function (name) {
            var chy = W.Chyrons;
            if (chy && typeof chy._isStillMedia === 'function') return chy._isStillMedia(name);
            return /\.(png|jpe?g|tiff?|psd|bmp|gif|eps|ai)$/i.test(String(name || ''));
        },

        /**
         * _freezeUnderCti: CONGELAT que hi ha sota el CLIP DE REFERÈNCIA (el PNG/frame del
         * tema-títol de la pista de grafismes). Retorna { name, start, end } o null.
         * S'ha de llegir ABANS d'insertar el gràfic (després el clip que hi hauria sota la
         * referència seria el gràfic inserit).
         * El PNG de congelat s'ha d'estirar fins al FINAL D'AQUEST clip (no fins al final del
         * gràfic ni del clip del programa).
         *
         * (2026-10-16 · BUG #169) NOMÉS s'accepta com a congelat una IMATGE FIXA. ABANS
         * qualsevol clip de V3 servia: si sota el cabezal hi havia un GRAFISME (el que acaba
         * de col·locar aquest mateix flux, el d'un ítem anterior amb marcador, o el clip
         * SELECCIONAT a V3) el seu NOM es replicava a la pista del tema-títol (V6) →
         * «APP MAPA REVOLTES» apareixia a V3 I a V6 i, com que l'insert de V6 és una
         * sobreescriptura ESTIRADA fins al final del gràfic, també TALLAVA el contingut
         * que hi hagués a V6.
         */
        _freezeUnderCti: async function (refSec) {
            try {
                var clips = await getClipsLogic().getTrackClips(TRACK_GRAF, 'video');
                for (var i = 0; i < clips.length; i++) {
                    var c = clips[i];
                    if (refSec >= c.start - 0.001 && refSec < c.end - 0.001) {
                        var nm = c.name || c.mediaName || stripExt(c.mediaPath || '');
                        if (!this._isStill(nm)) {
                            L('   ⏭️ [MAPA] V' + TRACK_GRAF + ' sota la referència: "' +
                                String(nm).substring(0, 50) + '" NO és cap congelat (no és una ' +
                                'imatge fixa) → no es replica a V' + TRACK_FREEZE, 'WARN');
                            continue;
                        }
                        L('🗺️ [MAPA] Congelat a V' + TRACK_GRAF + ': "' + nm + '" @ ' +
                            c.start.toFixed(2) + '-' + c.end.toFixed(2) + 's');
                        return { name: nm, start: c.start, end: c.end };
                    }
                }
                L('⚠️ [MAPA] Cap clip a V' + TRACK_GRAF + ' sota el clip de referència → sense congelat a V' + TRACK_FREEZE, 'WARN');
            } catch (e) {
                L('⚠️ [MAPA] No puc llegir V' + TRACK_GRAF + ': ' + e.message, 'WARN');
            }
            return null;
        },

        // ═══════════════════════════════════════════════════════════════
        // IMPORTAR AL BIN "GRAF"
        // ═══════════════════════════════════════════════════════════════
        /**
         * _freezeGrafEnd: (2026-09-23) CONGELAT al final del clip de grafisme, amb la
         * mateixa mecànica que el congelat del Tema-Títol (_freezeTemaTitol, flow_chyrons.js):
         *   1. Insereix el grafisme en un TC temporal buit (10:00) per fer un snapshot NET.
         *   2. Mesura la seva durada i captura el SEU ÚLTIM FRAME (Chyrons._capturePng · via
         *      Render.snapshot/QE, amb Render.frame de reserva).
         *   3. Esborra el clip temporal, importa el PNG al bin GRAF i l'insereix estirat des
         *      del final del grafisme: 3 s com a màxim, o menys si el clip de V1 acaba abans.
         * Així l'usuari pot estirar/retallar el congelat còmodament al timeline.
         * @param {string} gName - Nom del media del grafisme (al projecte)
         * @param {number} grafEnd - Final real del grafisme col·locat (s)
         * @param {number|null} endLimit - Final de l'espai hàbil (final del clip de V1) o null
         * @param {number} [trackIdx] - Pista on va el congelat (per defecte TRACK_GRAF).
         *   (2026-10-28 · ZONA GRISA) Amb grafisme de zona grisa la pista és V2.
         * @returns {Promise<Object>} { success, duration }
         */
        _freezeGrafEnd: async function (gName, grafEnd, endLimit, trackIdx) {
            var tG = (trackIdx != null) ? trackIdx : TRACK_GRAF;
            var TEMP_TC = 600;        // 10:00:00 (mateixa tècnica que _freezeTemaTitol)
            var MAX_DUR = 3.0;        // (2026-09-23) congelat de 3 s per defecte
            var FRAME = 1 / 25;
            var utils = U();
            // (2026-09-23) Cabezal original: el snapshot del frame l'ha de moure al TC temporal
            // del grafisme, i al final s'ha de tornar exactament on era (petició d'usuari).
            var ctiOriginal = null;
            try {
                ctiOriginal = parseFloat(await callJSX('Timeline.get()') || '0');
            } catch (eCti) { L('⚠️ [MAPA·freeze] No puc llegir el cabezal: ' + eCti.message, 'WARN'); }
            try {
                // Durada: 3 s, o menys si el clip de V1 s'acaba abans.
                var dur = MAX_DUR;
                if (endLimit !== null && endLimit !== undefined) dur = Math.min(dur, endLimit - grafEnd);
                if (dur < 0.5) {
                    L('🗺️ [MAPA·freeze] Sense espai per al congelat (' + grafEnd.toFixed(2) + 's → ' +
                        (endLimit === null || endLimit === undefined ? '?' : endLimit.toFixed(2)) + 's) → no es col·loca');
                    return { success: false, duration: 0 };
                }

                // 1. Grafisme temporal a TC 10:00 (zona buida) per fer el snapshot net
                await callJSX("Clips.insert('" + utils.escape(gName) + "', " + tG + ", " + TEMP_TC + ", null, 'video')");
                await utils.delay(300);

                // 2. Últim frame del grafisme (final real del clip temporal − 1 frame)
                var tmpEnd = await this._clipEndAt(tG, TEMP_TC);
                if (tmpEnd === null) {
                    L('⚠️ [MAPA·freeze] No puc mesurar el grafisme temporal → sense congelat', 'WARN');
                    return { success: false, duration: 0 };
                }
                var snapTC = Math.max(TEMP_TC, tmpEnd - FRAME);
                await callJSX('Timeline.set(' + snapTC.toFixed(4) + ')');
                await utils.delay(400);

                var folder = await callJSX('Context.folder()');
                var snapPath = folder + '\\Snapshots\\freeze_graf_' + Date.now() + '.png';
                // (2026-10-06) La captura va pel mecanisme ÚNIC del projecte:
                // `Chyrons._capturePng` → `Render.snapshot` (QE `exportFramePNG`; rep la ruta
                // SENSE extensió) amb `Render.frame` de reserva, ampliació/restauració de
                // l'Out point i verificació del PNG. (La nota del 2026-10-05 que donava per
                // morta la via QE era ERRÒNIA: vegeu #142 i `bin/check_js_v8.ps1`.)
                var capFz = await W.Chyrons._capturePng(snapPath.replace(/\.png$/i, ''), snapTC);
                var snapRes = capFz.res, snapOk = capFz.ok;
                L('   📸 [MAPA·freeze] Captura via ' + (capFz.via || '?') + ' → ' + snapRes + ' · PNG ' +
                    (snapOk ? 'OK (' + Math.round(capFz.bytes / 1024) + ' KB)' : 'NO escrit'));

                // 3. Treure el clip temporal de la pista de grafismes
                try {
                    var clipsT = await getClipsLogic().getTrackClips(tG, 'video');
                    for (var i = 0; i < clipsT.length; i++) {
                        if (Math.abs(clipsT[i].start - TEMP_TC) < 0.5) {
                            await callJSX("Clips.removeAt(" + tG + ", " + clipsT[i].start.toFixed(4) + ", 'video')");
                            L('   🗑️ [MAPA·freeze] Grafisme temporal eliminat (start=' + clipsT[i].start.toFixed(2) + 's)');
                            break;
                        }
                    }
                } catch (eRT) {
                    L('   ⚠️ [MAPA·freeze] No he pogut treure el temporal: ' + eRT.message, 'WARN');
                }

                if (!snapOk) {
                    L('   ❌ [MAPA·freeze] Snapshot fallit: el PNG no s\'ha escrit (' + snapRes + ')', 'ERROR');
                    return { success: false, duration: 0 };
                }

                // 4. Importar el PNG (al bin GRAF) i inserir-lo estirat des del final del grafisme.
                //    Premiere pot conservar o canviar l'extensió al nom de l'ítem → s'empareja
                //    pel nom normalitzat a la raïl del bin (mateix criteri que _import).
                var fileName = snapPath.split('\\').pop();
                await callJSX("IO.importFiles('" + utils.escape(JSON.stringify([snapPath])) + "', '" + GRAF_BIN + "')");
                var pngName = fileName;
                try {
                    var rawG = await callJSX("FASTPASS.Project.items('" + GRAF_BIN + "')");
                    var listG = rawG ? JSON.parse(rawG) : [];
                    var wantN = this._norm(stripExt(fileName));
                    for (var g2 = 0; g2 < listG.length; g2++) {
                        if (this._norm(listG[g2].name) === wantN) { pngName = listG[g2].name; break; }
                    }
                } catch (eG2) { }
                L('   📥 [MAPA·freeze] PNG al bin ' + GRAF_BIN + ': "' + pngName + '"');
                var fzEsc = utils.escape(pngName);
                await callJSX("Clips.insert('" + fzEsc + "', " + tG + ", " + grafEnd.toFixed(4) + ", null, 'video')");
                // (2026-10-08) Retall COHERENT (inPoint 0 → outPoint dur): `Clips.endAt` deixava
                // l'outPoint del source al final del mèdia i el congelat tampoc es podia estirar.
                await callJSX("Clips.trimBounds(" + grafEnd.toFixed(4) + ", 0, " + dur.toFixed(4) +
                    ", " + tG + ", 'video')");
                L('   🧊 [MAPA·freeze] Congelat "' + pngName + '" a V' + tG + ' @ ' + grafEnd.toFixed(2) +
                    's → ' + (grafEnd + dur).toFixed(2) + 's (dur ' + dur.toFixed(2) + 's' +
                    (dur < MAX_DUR ? ' · limitat pel clip de V1' : '') + ')');
                return { success: true, duration: dur };
            } catch (eFz) {
                L('⚠️ [MAPA·freeze] ' + eFz.message, 'WARN');
                return { success: false, duration: 0 };
            } finally {
                // (2026-09-23) Retornar el cabezal a la seua posició ORIGINAL: el snapshot l'ha
                // hagut de moure al TC temporal del grafisme (10:00). Es fa sempre, també si el
                // congelat ha fallat, perquè l'usuari no perdi la vista on treballava.
                if (ctiOriginal !== null && isFinite(ctiOriginal)) {
                    try {
                        await callJSX('Timeline.set(' + ctiOriginal.toFixed(4) + ')');
                        L('   📍 [MAPA·freeze] Cabezal retornat a ' + ctiOriginal.toFixed(2) + 's');
                    } catch (eRC) {
                        L('   ⚠️ [MAPA·freeze] No he pogut tornar el cabezal: ' + eRC.message, 'WARN');
                    }
                }
            }
        },
        _import: async function (picked) {
            var out = [];   // [{ name: nom real al projecte, dur: segons (0 = desconegut) }]
            try {
                var utils = U();
                var paths = picked.map(function (f) { return f.full; });
                // 1. Bin GRAF (el crea si no existeix)
                await callJSX("FASTPASS.Project.bin('" + GRAF_BIN + "')");
                // 2. Ingesta amb el helper del projecte: escapa el payload i crida
                //    FASTPASS.IO.importFiles (el namespace correcte; NO és Project.*).
                await utils.importList(paths, GRAF_BIN);
                // 3. importFiles importa a l'ARREL del projecte. Premiere pot conservar
                //    l'extensió al nom de l'ítem, així que NO es pot suposar el nom:
                //    cal llegir la raíl i emparellar pel nom normalitzat.
                var rootItems = [];
                try {
                    var rawRoot = await callJSX("FASTPASS.Project.items('')");
                    rootItems = rawRoot ? JSON.parse(rawRoot) : [];
                } catch (eR) { rootItems = []; }
                for (var i = 0; i < picked.length; i++) {
                    var want = this._norm(stripExt(picked[i].name));
                    var real = null;
                    for (var k = 0; k < rootItems.length; k++) {
                        if (this._norm(rootItems[k].name) === want) { real = rootItems[k]; break; }
                    }
                    var realName = real ? real.name : stripExt(picked[i].name);
                    var dur = (real && real.duration > 0) ? real.duration : 0;
                    var mv = await callJSX("FASTPASS.Project.move('" + encodeURIComponent(realName) +
                        "', '" + encodeURIComponent(GRAF_BIN) + "')");
                    L('🗺️ [MAPA] "' + realName + '" → bin ' + GRAF_BIN + ' · ' + mv +
                        ' · dur=' + dur.toFixed(2) + 's');
                    out.push({ name: realName, dur: dur });
                }
            } catch (e) {
                L('⚠️ [MAPA] Error important: ' + e.message, 'WARN');
            }
            return out;
        },

        // ═══════════════════════════════════════════════════════════════
        // COL·LOCAR A V6 DES DEL CTI (amb retall proporcional si cal)
        // ═══════════════════════════════════════════════════════════════
        /**
         * _cleanupTrack: Elimina de una pista els clips el media dels quals coincideixi amb
         * algun dels noms donats (normalitzats). Imprescindible perquè cada execució del MAPA
         * hi deixava un joc nou de clips → al timeline es veiem "2 estats" alhora.
         */
        _cleanupTrack: async function (trackIdx, names) {
            var set = {};
            var n = 0;
            for (var i = 0; i < (names || []).length; i++) {
                if (names[i]) { set[this._norm(names[i])] = true; n++; }
            }
            if (n === 0) return 0;
            var removed = 0;
            try {
                var clips = await getClipsLogic().getTrackClips(trackIdx, 'video');
                for (var k = clips.length - 1; k >= 0; k--) {   // enrere → no renumerar
                    var c = clips[k];
                    var cn = c.name || c.mediaName || stripExt(c.mediaPath || '');
                    if (!set[this._norm(cn)]) continue;
                    var r = await callJSX("Clips.removeAt(" + trackIdx + ", " + c.start.toFixed(4) + ", 'video')");
                    L('🗺️ [MAPA] Neteja V' + trackIdx + ': "' + cn + '" @ ' + c.start.toFixed(2) + 's · ' + r);
                    removed++;
                }
            } catch (e) {
                L('⚠️ [MAPA] Error netejant V' + trackIdx + ': ' + e.message, 'WARN');
            }
            return removed;
        },

        /**
         * _clipEndAt: Final real (segons) del clip de la pista que comença a startSec.
         * Serveix per mesurar la durada natural del media inserit, perquè Premiere no
         * sempre reporta la durada mentre està ingesta.
         */
        _clipEndAt: async function (trackIdx, startSec) {
            try {
                var clips = await getClipsLogic().getTrackClips(trackIdx, 'video');
                for (var i = 0; i < clips.length; i++) {
                    if (Math.abs(clips[i].start - startSec) < 0.05) return clips[i].end;
                }
            } catch (e) { }
            return null;
        },

        /**
         * _clipBoundsAt: inPoint/outPoint del SOURCE d'un clip (per índex) via l'àtom
         * `Clips.get`. Cal per retallar amb `Clips.trimBounds` sense moure l'entrada del
         * mèdia (els grafismes entren amb inPoint 0, però un ProjectItem amb marques al bin
         * pot entrar desplaçat). Retorna null si no es pot llegir.
         * @param {number} trackIdx - Pista (1-based)
         * @param {number|null} idx - Índex del clip (el que retorna insertNoAudio)
         * @returns {Promise<Object|null>} { inPoint, outPoint, start, end } o null
         */
        _clipBoundsAt: async function (trackIdx, idx) {
            if (idx === null || idx === undefined || idx < 0) return null;
            try {
                var raw = await callJSX("Clips.get(" + trackIdx + ", " + idx + ", 'video')");
                if (!raw || raw === 'null' || String(raw).indexOf('ERR') === 0) return null;
                var c = JSON.parse(raw);
                return (typeof c.inPoint === 'number') ? c : null;
            } catch (e) {
                L('⚠️ [MAPA] No puc llegir in/out del clip V' + trackIdx + '[' + idx + ']: ' + e.message, 'WARN');
                return null;
            }
        },

        // ═══════════════════════════════════════════════════════════════
        // ZONA GRISA (2026-10-28) · detecció + pujada del troç de MÀSCARA
        // ═══════════════════════════════════════════════════════════════
        /**
         * _lineMarkers: marcadors de la seqüència amb NÚMERO, en segons i ordenats.
         *
         * El número és el PRIMER TESTIMONI del comentari (tall per espai, «·» o «-»),
         * la mateixa convenció que `numParts` de `analysis_center`:
         *   · "01i - intro"                 → "01i"
         *   · "01 - ELS VEÏNS DE..."        → "01"
         *   · "01 TE-1 - TE ALDARULLS"      → "01"
         *   · "01p22 - P2 PAS 1 GOOGLE..."  → "01p22"
         *
         * (2026-10-28 · 3a volta, cas viu) Amb `solsLinies` només passen els números
         * de LÍNIA d'escaleta (dígits + lletres opcionals: "01", "01i", "01dir",
         * "02dp", "19C"). Els SUB-ÍTEMS que porten dígits DESPRÉS de lletres
         * ("01p21", "01p22"…) són comentaris interns de la línia i NO fan de
         * frontera: era el que fallava en viu (grafisme sobre "01p22" → el tall es
         * feia 01p22→01p23, 5,88s→11,08s, en lloc de «intro (01i) → 01», el rang
         * sencer de l'ítem).
         *
         * @param {Array}   markers    - el que retorna `Markers.get()` [{ time, comments }]
         * @param {boolean} solsLinies - true → només marcadors de línia d'escaleta
         * @returns {Array} [{ num, nombre, time, linia }]
         */
        _lineMarkers: function (markers, solsLinies) {
            var est = [];
            for (var i = 0; i < (markers || []).length; i++) {
                var m = markers[i] || {};
                var cmt = String(m.comments || m.comment || '').replace(/^\s+|\s+$/g, '');
                if (!cmt) continue;
                var tok = cmt.split(/[\s·\-]+/)[0] || '';
                if (!/^\d/.test(tok)) continue;
                var linia = /^\d+[A-Za-zÀ-ÿ]*$/.test(tok);
                if (solsLinies && !linia) continue;
                var t = (typeof m.time === 'number') ? m.time : parseFloat(m.time);
                if (!isFinite(t)) continue;
                var nombre = cmt;
                var dash = cmt.indexOf(' -');
                if (dash > 0) nombre = cmt.substring(dash + 2).replace(/^\s+|\s+$/g, '');
                est.push({ num: tok, nombre: stripExt(nombre), time: t, linia: linia });
            }
            est.sort(function (x, y) { return x.time - y.time; });
            return est;
        },

        /**
         * _itemRangeAt: RANG de l'ÍTEM d'escaleta on cau `refSec`: del MARCADOR de la
         * seua LÍNIA (el darrer número de línia a o abans de refSec) fins al SEGÜENT
         * número de línia (o, si no n'hi ha, el corxet OUT / el final del programa).
         * SENSE marges: el marcador següent ÉS l'inici de l'ítem de després, i és
         * exactament ahí on la màscara ha de tornar a la seua pista.
         *
         * (2026-10-28 · petició d'usuari) El tall és de MARCADOR a MARCADOR: la INTRO
         * ("01i") → el següent marcador estructural ("01 - ELS VEÏNS…"), o siga el
         * rang SENCER de l'ítem, no el tros entre dos sub-ítems seus ("01p22" →
         * "01p23"). Així el troç de màscara que puja a V3 ocupa tot l'ítem.
         *
         * L'ítem pot ser la INTRO del bloc ("01i"), un DONAPÀS ("02dp") o un OFF
         * ("03off"): el que mana és el marcador, no el nom. El grafisme es pot eixir
         * d'aquest rang (la col·locació automàtica és un punt de partida i l'usuari
         * l'ajustarà), però la MÀSCARA només puja el troç que coincidix amb l'ítem.
         *
         * @param {number} refSec - posició d'entrada del grafisme (el cabezal)
         * @returns {Promise<Object|null>} { a, b, num, nombre, label, next, linia } o null
         */
        _itemRangeAt: async function (refSec) {
            var out = { a: null, b: null, num: '', nombre: '', label: '', next: null, linia: true };
            var markers = [];
            try {
                var raw = await callJSX('Markers.get()');
                markers = raw ? JSON.parse(raw) : [];
            } catch (e) {
                L('⚠️ [MAPA·gris] No puc llegir els marcadors: ' + e.message, 'WARN');
                return null;
            }
            // 1a passada: fronteres de LÍNIA. 2a: qualsevol número (una seqüència sense
            // cap línia reconeixible no s'ha de quedar sense rang).
            var est = this._lineMarkers(markers, true);
            if (!est.length) {
                est = this._lineMarkers(markers, false);
                out.linia = false;
                if (est.length) {
                    L('⚠️ [MAPA·gris] Cap marcador de LÍNIA ("NN - Nom") → el rang es fa amb qualsevol número', 'WARN');
                }
            }
            if (!est.length) {
                L('⚠️ [MAPA·gris] Cap marcador amb número a la seqüència → sense rang d\'ítem', 'WARN');
                return null;
            }
            var prev = null;
            for (var k = 0; k < est.length; k++) {
                if (est[k].time <= refSec + 0.001) prev = est[k];
            }
            if (!prev) {
                L('⚠️ [MAPA·gris] El cabezal (' + refSec.toFixed(2) + 's) va ABANS del primer marcador → sense rang d\'ítem', 'WARN');
                return null;
            }
            out.a = prev.time;
            out.num = prev.num;
            out.nombre = prev.nombre;
            for (var n = 0; n < est.length; n++) {
                if (est[n].time > prev.time + 0.001) { out.next = est[n]; break; }
            }
            if (out.next) {
                out.b = out.next.time;
                out.label = 'fins al marcador ' + out.next.num + ' (' + out.b.toFixed(2) + 's)';
            } else {
                try {
                    var eo = parseFloat(await callJSX('Timeline.getOut()') || '0');
                    if (eo > out.a + 0.5) { out.b = eo; out.label = 'corxet OUT (' + eo.toFixed(2) + 's)'; }
                } catch (eO) { }
                if (out.b === null) {
                    try {
                        var du = parseFloat(await callJSX('Timeline.duration()') || '0');
                        if (du > out.a + 0.5) { out.b = du; out.label = 'final del programa (' + du.toFixed(2) + 's)'; }
                    } catch (eD) { }
                }
            }
            if (out.b === null || out.b <= out.a + 0.05) {
                L('⚠️ [MAPA·gris] Rang d\'ítem sense espai (' + out.a.toFixed(2) + 's→' + String(out.b) + ')', 'WARN');
                return null;
            }
            L('🗺️ [MAPA·gris] Ítem d\'escaleta: "' + out.num + (out.nombre ? ' - ' + out.nombre : '') +
                '" → rang ' + out.a.toFixed(2) + 's→' + out.b.toFixed(2) + 's (' + out.label + ')');
            return out;
        },

        /** _idxAt: índex del clip de la pista que CONTÉ el segon indicat (o null). */
        _idxAt: async function (trackIdx, tSec) {
            try {
                var raw = await callJSX('Clips.at(' + trackIdx + ', ' + Number(tSec).toFixed(4) + ', \'video\')');
                if (!raw || raw === 'null' || String(raw).indexOf('ERR') === 0) return null;
                var c = JSON.parse(raw);
                return (c && typeof c.index === 'number') ? c.index : null;
            } catch (e) { return null; }
        },

        /**
         * _pathFor: ruta ORIGINAL (NAS) del fitxer que hi ha darrere un media ja
         * importat. La detecció de la zona grisa es fa sobre el FITXER, no sobre el
         * clip: `picked` porta { name, full } del navegador/`_filesIn`.
         * @param {string} mediaName - nom del media al projecte (pot dur extensió)
         * @param {Array}  picked    - [{ name, full }]
         * @returns {string|null}
         */
        _pathFor: function (mediaName, picked) {
            var want = this._norm(mediaName);
            var list = picked || [];
            for (var i = 0; i < list.length; i++) {
                if (!list[i] || !list[i].full) continue;
                if (this._norm(list[i].name) === want) return list[i].full;
            }
            for (var j = 0; j < list.length; j++) {
                if (!list[j] || !list[j].full) continue;
                var n = this._norm(list[j].name);
                if (n && want && (n.indexOf(want) === 0 || want.indexOf(n) === 0)) return list[j].full;
            }
            return null;
        },

        /**
         * _zonaGris: pregunta al mòdul LOGIC (`21_GrafZonaGris_Logic.js`) si el
         * grafisme té la ZONA GRISA al peu. Es mira TOTS els items de la tongada:
         * si un en té, tots es col·loquen igual (petició d'usuari: «tot el
         * grafisme va al mateix track»).
         *
         * (2026-10-28 · 2a volta) És **NOMÉS INFORMATIU** (una línia al log): la
         * màscara puja a V3 i el grafisme va a V2 SEMPRE, tinga zona grisa o no
         * (petició d'usuari en provar un grafisme a SANG que tapava la màscara).
         *
         * @param {Array} items - [{ name, dur }] media importats
         * @param {Object} ctx  - { picked:[{name,full}], detectOpts }
         * @returns {Promise<Object|null>} { hasGrey, cov, name, path } o null (sense mesura)
         */
        _zonaGris: async function (items, ctx) {
            var LG = window.FASTPASS_UI && window.FASTPASS_UI.Logic;
            var G = LG && LG.GrafZonaGris;
            if (!G || typeof G.detect !== 'function') {
                L('⚠️ [MAPA·gris] Mòdul 21_GrafZonaGris_Logic.js no carregat → col·locació de sempre', 'WARN');
                return null;
            }
            var picked = (ctx && ctx.picked) || [];
            var mesurats = 0;
            for (var i = 0; i < (items || []).length; i++) {
                var path = this._pathFor(items[i].name, picked);
                if (!path) {
                    L('⚠️ [MAPA·gris] No sé la ruta original de "' + items[i].name + '" → no el puc mesurar', 'WARN');
                    continue;
                }
                var r = await G.detect(path, (ctx && ctx.detectOpts) || null);
                if (!r || !r.ok) {
                    L('⚠️ [MAPA·gris] "' + items[i].name + '": ' + ((r && r.err) || 'mesura fallida') +
                        ' → es tracta com a SENSE zona grisa', 'WARN');
                    return null;
                }
                mesurats++;
                if (r.hasGrey) {
                    return { hasGrey: true, cov: r.cov, name: items[i].name, path: path, cached: r.cached };
                }
            }
            if (!mesurats) return null;
            return { hasGrey: false, cov: null, name: null, path: null, cached: false };
        },

        /**
         * _ajustarFiAlMarcador: assegura que el troç pujat a la pista de dalt acaba
         * EXACTAMENT al marcador `b`, no un pèl abans.
         *
         * (2026-10-28 · 3a volta) En viu el tall «quasi» arribava al marcador següent:
         * `retrim` fixa in/out/end però Premiere arredoniX al frame i, si el mèdia de la
         * màscara s'acaba just ahí, el clip es queda 1-2 frames curt. Ací es reintenta
         * ALLARGANT el troç fins a `b` i es verifica el `end` REAL amb `Clips.get`; si el
         * mèdia no en dóna més (WARN_INVALID) es RESTAURA el clip com estava i es diu
         * quants segons falten — mai no es deixa un clip trencat.
         *
         * @param {number} trackIdx - pista del troç (1-based)
         * @param {number} idx - índex del clip del troç
         * @param {number} eActual - final actual del troç (s)
         * @param {number} b - TC del marcador on HA d'acabar (s)
         * @returns {Promise<number>} final REAL del clip després de l'ajust (s)
         */
        _ajustarFiAlMarcador: async function (trackIdx, idx, eActual, b) {
            var EPS = 0.012;                       // mig frame a 25 fps
            var cur = await this._clipBoundsAt(trackIdx, idx);
            if (!cur) return eActual;
            // MANA el `end` REAL del clip: `e` és el final TEÒRIC que s'ha demanat a
            // retrim, i Premiere pot haver-lo deixat 1-2 frames curt.
            var real = (typeof cur.end === 'number') ? cur.end : eActual;
            if (!(b > real + EPS)) return real;    // ja hi arriba
            if (b - real > 30) {                   // ni ho intenta: no és un redondeig
                L('⚠️ [MAPA·gris] La màscara s\'acaba a ' + real.toFixed(2) +
                    's i el marcador és a ' + b.toFixed(2) + 's (falten ' +
                    (b - real).toFixed(2) + 's): el tall no hi pot arribar', 'WARN');
                return real;
            }
            var target = b, res = '';
            for (var i = 0; i < 3; i++) {
                var wantOut = cur.inPoint + (target - cur.start);
                res = String(await callJSX('Clips.retrim(' + trackIdx + ', ' + idx + ', ' +
                    cur.inPoint.toFixed(4) + ', ' + wantOut.toFixed(4) + ', ' + target.toFixed(4) +
                    ", 'video')") || '');
                var now = await this._clipBoundsAt(trackIdx, idx);
                if (now && now.end >= target - EPS) {
                    L('🗺️ [MAPA·gris] Tall AJUSTAT al marcador: V' + trackIdx + '[' + idx + '] ' +
                        real.toFixed(2) + 's→' + now.end.toFixed(2) + 's (marcador ' +
                        b.toFixed(2) + 's)');
                    return now.end;
                }
                if (res.indexOf('WARN_INVALID') === 0 || res.indexOf('ERR') === 0) break;
                target += 0.06;                    // el frame que cobrix el TC
            }
            // No s'ha pogut: RESTAURAR el clip tal com estava.
            var back = String(await callJSX('Clips.retrim(' + trackIdx + ', ' + idx + ', ' +
                cur.inPoint.toFixed(4) + ', ' + cur.outPoint.toFixed(4) + ', ' + cur.end.toFixed(4) +
                ", 'video')") || '');
            L('⚠️ [MAPA·gris] No puc allargar el troç fins al marcador ' + b.toFixed(2) +
                's: es queda a ' + real.toFixed(2) + 's · ' + res + ' · restauració: ' + back, 'WARN');
            return real;
        },

        /**
         * _mascaraAParking: PUJA el troç de MÀSCARA de l'ítem de `tMasc` a `tPark`.
         *
         * (2026-10-28 · petició d'usuari) Quan el grafisme té zona grisa, va a la
         * pista de la màscara i la MÀSCARA ha d'anar PER DAMUNT → es mou a la pista
         * de dalt NOMÉS el troç que coincidix amb l'ítem d'escaleta [rng.a, rng.b];
         * la resta de la màscara es queda a la seua pista. L'ordre MANA: primer es
         * talla i es mou la màscara i DESPRÉS es col·loca el grafisme (si es fera al
         * revés, l'insert del grafisme passaria per damunt del troç de màscara).
         *
         * ÀTOMS: reutilitza la maquinària d'IPD+ de `flow_graphics.js`
         * (`_ipdPlusPoner` = insertClipFrom + retrim amb devolució de la cua,
         * `_ipdPlusLlegirMotion`/`_ipdPlusHeredarMotion` = el Motion viu a la
         * instància de pista i NO viatja amb l'insert) i `Clips.retrim` /
         * `Clips.removeAt`. Cap fitxer `.jsx` tocat.
         *
         * @param {Object} rng   - { a, b } rang de l'ítem (segons)
         * @param {number} tMasc - pista de la màscara (V2)
         * @param {number} tPark - pista de dalt (V3)
         * @returns {Promise<Object>} { ok, n, err, detall:[], clash:[] }
         */
        _mascaraAParking: async function (rng, tMasc, tPark) {
            var out = { ok: false, n: 0, err: null, detall: [], clash: [], cov: null };
            var G = W.Graphics;
            if (!G || typeof G._ipdPlusPoner !== 'function' || typeof G._ipdPlusHeredarMotion !== 'function') {
                out.err = 'flow_graphics (IPD+) no carregat';
                return out;
            }
            try {
                var clips = await getClipsLogic().getTrackClips(tMasc, 'video');
                var hits = [];
                for (var i = 0; i < clips.length; i++) {
                    var c = clips[i];
                    if (c.end > rng.a + 0.02 && c.start < rng.b - 0.02) hits.push(c);
                }
                if (!hits.length) { out.err = 'CAP_MASCARA'; return out; }
                // Cobertura EFECTIVA del troç que puja: serveix per avisar si la màscara
                // de V2 no arriba a cobrir tot el rang de l'ítem (marcador→marcador).
                var covA = null, covB = null;

                // La pista de dalt ha d'estar LLIURE a tot el rang: si hi ha
                // grafismes d'altres ítems, no es toca res (no es pisa ningú).
                var occ = await getClipsLogic().getTrackClips(tPark, 'video');
                for (var j = 0; j < occ.length; j++) {
                    var o = occ[j];
                    if (o.end > rng.a + 0.02 && o.start < rng.b - 0.02) {
                        out.clash.push('V' + tPark + ' "' + (o.name || '?') + '" @ ' + o.start.toFixed(2) + 's');
                    }
                }
                if (out.clash.length) { out.err = 'DESTI_OCUPAT'; return out; }

                // De DRETA a ESQUERRA: els índexs dels clips de l'esquerra no canvien.
                hits.sort(function (x, y) { return y.start - x.start; });
                for (var k = 0; k < hits.length; k++) {
                    var hit = hits[k];
                    var s = Math.max(hit.start, rng.a);
                    var e = Math.min(hit.end, rng.b);
                    if (e - s < 0.10) { out.detall.push('tros massa curt (' + s.toFixed(2) + 's)'); continue; }

                    var idx = await this._idxAt(tMasc, s + 0.02);
                    if (idx === null) { out.detall.push('no trobe el clip a ' + s.toFixed(2) + 's'); continue; }
                    var live = await this._clipBoundsAt(tMasc, idx);
                    if (!live) { out.detall.push('no puc llegir V' + tMasc + '[' + idx + ']'); continue; }

                    var ip0 = (typeof live.inPoint === 'number') ? live.inPoint : 0;
                    var nom = hit.name || hit.mediaName || '?';
                    var mv = await G._ipdPlusLlegirMotion(tMasc, idx, 'MASCARA');

                    // 1) El troç [s,e] puja a la pista de dalt (amb el SEU Motion).
                    var put = await G._ipdPlusPoner(tMasc, idx, tPark, s,
                        ip0 + (s - live.start), ip0 + (e - live.start), e);
                    if (!put || !put.ok) {
                        out.err = 'PUGAR: ' + ((put && put.res) || 'desconegut');
                        return out;
                    }
                    // (2026-10-28 · 3a volta) El tall ha d'arribar EXACTE al marcador
                    // següent, no un pèl abans: `retrim` hi arredoniX al frame i en viu
                    // el troç es quedava 1-2 frames curt. Es verifica el `end` REAL.
                    e = await this._ajustarFiAlMarcador(tPark, put.idx, e, rng.b);
                    await G._ipdPlusHeredarMotion(tPark, put.idx, mv, 'MASCARA');
                    out.detall.push('V' + tMasc + ' "' + nom + '" ' + s.toFixed(2) + 's→' +
                        e.toFixed(2) + 's → V' + tPark + '[' + put.idx + ']');
                    if (covA === null || s < covA) covA = s;
                    if (covB === null || e > covB) covB = e;

                    // 2) El troç POSTERIOR es queda a la pista de la màscara.
                    if (live.end > e + 0.02) {
                        var putB = await G._ipdPlusPoner(tMasc, idx, tMasc, e,
                            ip0 + (e - live.start), ip0 + (live.end - live.start), live.end);
                        if (putB && putB.ok) {
                            await G._ipdPlusHeredarMotion(tMasc, putB.idx, mv, 'MASCARA-COA');
                            out.detall.push('V' + tMasc + ' coa ' + e.toFixed(2) + 's→' +
                                live.end.toFixed(2) + 's → V' + tMasc + '[' + putB.idx + ']');
                        } else {
                            L('⚠️ [MAPA·gris] No he pogut reposar la coa de la màscara (' +
                                ((putB && putB.res) || '?') + ')', 'WARN');
                        }
                    }

                    // 3) L'original es queda NOMÉS amb el tros ANTERIOR (o s'esborra).
                    var idx2 = await this._idxAt(tMasc, Math.max(0.02, Math.min(s + 0.02, e - 0.01)));
                    if (idx2 !== null) {
                        if (live.start < s - 0.02) {
                            var rT = await callJSX('Clips.retrim(' + tMasc + ', ' + idx2 + ', ' +
                                ip0.toFixed(4) + ', ' + (ip0 + (s - live.start)).toFixed(4) + ', ' +
                                s.toFixed(4) + ', \'video\')');
                            out.detall.push('V' + tMasc + '[' + idx2 + '] retallat a ' +
                                live.start.toFixed(2) + 's→' + s.toFixed(2) + 's · ' + rT);
                        } else {
                            var rR = await callJSX('Clips.removeAt(' + tMasc + ', ' +
                                live.start.toFixed(4) + ', \'video\', false)');
                            out.detall.push('V' + tMasc + ' original eliminat (' +
                                live.start.toFixed(2) + 's→' + live.end.toFixed(2) + 's) · ' + rR);
                        }
                    }
                    out.n++;
                    await U().delay(150);
                }
                out.ok = (out.n > 0);
                if (covA !== null) out.cov = { a: covA, b: covB };
                // El troç de V3 ha d'OCUPAR TOT l'ítem (marcador→marcador). Si la
                // màscara de V2 no hi arriba (clip més curt), es diu al log: no
                // s'inventa mitja que no existisca.
                if (out.cov && (out.cov.a > rng.a + 0.05 || out.cov.b < rng.b - 0.05)) {
                    L('⚠️ [MAPA·gris] La màscara de V' + tMasc + ' només cobrix ' +
                        out.cov.a.toFixed(2) + 's→' + out.cov.b.toFixed(2) + 's de l\'ítem (' +
                        rng.a.toFixed(2) + 's→' + rng.b.toFixed(2) + 's): a V' + tPark +
                        ' puja el que hi ha', 'WARN');
                }
                if (!out.ok && !out.err) out.err = 'cap troç mogut';
                return out;
            } catch (e) {
                out.err = e.message;
                L('❌ [MAPA·gris] _mascaraAParking: ' + e.message, 'ERROR');
                return out;
            }
        },

        /**
         * _placeClips: Insereix els grafismes a la pista GRAF des de la posició d'entrada.
         * (2026-10-08) `refSec` és el CABEZAL i l'espai hàbil el marca el CLIP DE REFERÈNCIA
         * (el SELECCIONAT, o el de V1 sota el cabezal): el grafisme no ha d'invair el clip
         * següent. (2026-09-22) Abans la referència era sempre el clip seleccionat.
         *
         * @param {Array}  items  - [{ name, dur }] grafismes importats
         * @param {number} refSec - Posició d'entrada (el CABEZAL) en segons
         * @param {Object} freeze - congelat { name, start, end } o null
         * @param {Object} ref    - clip de referència { track, index, name, start, end } o null
         * @param {Object} [ctx]  - { picked:[{name,full}], detectOpts } (ZONA GRISA 2026-10-28)
         */
        _placeClips: async function (items, refSec, freeze, ref, ctx) {
            // 0. (2026-10-28 · ZONA GRISA · 2a volta) La MÀSCARA va SEMPRE per damunt del
            //    grafisme: es PUJA el troç de màscara de l'ÍTEM de la pista de la màscara
            //    (V2) a la de grafismes (V3) i el grafisme es col·loca a V2, per davall.
            //    (1a volta: només es feia si el grafisme tenia zona grisa al peu; provat en
            //    viu amb `app google tots sant gervasi esvoranc.mov` — foto a SANG, 3,1 % de
            //    gris a tot el clip —, eixia a V3 i tapava la màscara → petició d'usuari:
            //    SEMPRE així, tinga zona grisa o no. La mesura del gris queda com a INFO
            //    al log, amb la caché per ruta+mida+data de creació.)
            //    ORDRE: primer la màscara, després el grafisme (al revés, l'insert del
            //    grafisme passaria per damunt del troç de màscara). Si no es pot moure la
            //    màscara (sense rang d'ítem, sense màscara a V2, V3 ocupada o error) es
            //    col·loca com sempre a V3: mai no bloqueja la col·locació.
            //    Tot el grafisme va al MATEIX track encara que tinga diversos trams.
            var tGraf = TRACK_GRAF;
            var rngGris = null;
            var gNums0 = [];
            for (var g0 = 0; g0 < items.length; g0++) gNums0.push(items[g0].name);
            // Restes d'execucions anteriors d'AQUEST bloc a les dos pistes: si no es netegen
            // abans, o tapen V3 (la màscara no pot pujar) o es confonen amb la màscara a V2
            // (es pujaria el grafisme en lloc de la màscara). `_cleanupTrack` només esborra
            // clips el media dels quals és d'aquest bloc.
            var netM = await this._cleanupTrack(TRACK_MASCARA, gNums0);
            var netG = await this._cleanupTrack(TRACK_GRAF, gNums0);
            if (netM || netG) {
                L('🎨 [MAPA·gris] Netejades restes del bloc (V' + TRACK_MASCARA + ': ' + netM +
                    ' · V' + TRACK_GRAF + ': ' + netG + ') abans de moure la màscara');
            }
            var zona = await this._zonaGris(items, ctx);   // només INFO al log
            if (zona && zona.hasGrey) {
                L('🎨 [MAPA·gris] El grafisme TÉ zona grisa al peu (' + (zona.cov !== null ?
                    zona.cov.toFixed(1) + ' %' : '?') + ' · "' + zona.name + '")');
            } else if (zona && zona.hasGrey === false) {
                L('🎨 [MAPA·gris] El grafisme NO té zona grisa al peu → igualment màscara a V' +
                    TRACK_GRAF + ' i grafisme a V' + TRACK_MASCARA);
            }
            var rng = await this._itemRangeAt(refSec);
            if (!rng) {
                L('⚠️ [MAPA·gris] Sense rang d\'ítem → col·locació de sempre a V' +
                    TRACK_GRAF, 'WARN');
            } else {
                var mov = await this._mascaraAParking(rng, TRACK_MASCARA, TRACK_GRAF);
                if (mov && mov.ok) {
                    tGraf = TRACK_MASCARA;
                    rngGris = rng;
                    L('🎨 [MAPA·gris] Màscara de l\'ítem pujada a V' + TRACK_GRAF + ' (' + mov.n +
                        ' troç/os) → el grafisme va a V' + tGraf + ' (per davall de la màscara)');
                    for (var d = 0; d < mov.detall.length; d++) L('   · ' + mov.detall[d]);
                } else {
                    L('⚠️ [MAPA·gris] No s\'ha pogut moure la màscara (' + ((mov && mov.err) || '?') +
                        ((mov && mov.clash && mov.clash.length) ? ': ' + mov.clash.join(' · ') : '') +
                        ') → col·locació de sempre a V' + TRACK_GRAF, 'WARN');
                    U().status('MAPA: no s\'ha pogut moure la màscara', 'warn');
                }
            }

            // 1. Espai hàbil: del punt d'entrada (el cabezal) fins al final del CLIP DE
            //    REFERÈNCIA (el seleccionat, o el de la pista MP4 sota el cabezal).
            var endLimit = null;
            if (ref && typeof ref.end === 'number') {
                endLimit = ref.end;
                L('🗺️ [MAPA] Espai hàbil = clip de referència V' + ref.track + '[' + ref.index + '] → ' +
                    refSec.toFixed(2) + 's→' + endLimit.toFixed(2) + 's');
            } else {
                try {
                    var clips = await getClipsLogic().getTrackClips(1, 'video');
                    for (var c = 0; c < clips.length; c++) {
                        if (refSec >= clips[c].start - 0.001 && refSec < clips[c].end - 0.001) { endLimit = clips[c].end; break; }
                    }
                } catch (e) { }
            }
            var space = (endLimit !== null) ? Math.max(0, endLimit - refSec) : null;
            L('🗺️ [MAPA] Espai hàbil: ' + (space === null ? 'desconegut' : space.toFixed(2) + 's'));

            // 1b. (2026-10-28 · ZONA GRISA) Si el grafisme va a la pista de la MÀSCARA, el
            //     seu final NO pot passar del final de l'ÍTEM: la màscara torna a V2 al
            //     marcador següent i l'insert del grafisme (que és una SOBREESCRIPTURA)
            //     la pisaria. El retall deixa el clip ESTIRABLE, així que l'usuari el pot
            //     allargar després (petició d'usuari: la col·locació és un punt de partida).
            if (tGraf === TRACK_MASCARA && rngGris && rngGris.b != null) {
                if (endLimit === null || endLimit > rngGris.b + 0.01) {
                    L('🎨 [MAPA·gris] Final acotat al de l\'ítem (' + rngGris.b.toFixed(2) +
                        's) per no pisar la màscara que torna a V' + TRACK_MASCARA);
                    endLimit = rngGris.b;
                    space = Math.max(0, endLimit - refSec);
                }
            }

            // 2. Netejar restes d'execucions anteriors: cada clic hi deixava un joc nou de
            //    clips i al timeline es veien "2 estats" alhora (gràfic i PNG duplicats).
            var gNums = [];
            for (var g = 0; g < items.length; g++) gNums.push(items[g].name);
            await this._cleanupTrack(tGraf, gNums);
            if (freeze && freeze.name) await this._cleanupTrack(TRACK_FREEZE, [freeze.name]);

            // 3. Inserir en ordre des del PUNT D'ENTRADA (el cabezal) A DURADA NATURAL del
            //    media: NO forcem un endSec calculat (estirar-lo més enllà de la durada real
            //    dona clips falsos). Es mesura el clip inserit i, només si no cap a l'espai
            //    hàbil (el rang del clip de referència), es retalla amb `Clips.trimBounds`
            //    perquè el clip quedi ESTIRABLE (vegeu el comentari del retall).
            var t = refSec;
            var grafEnd = refSec;
            for (var p = 0; p < items.length; p++) {
                // (2026-09-22) insert NO-AUDIO: els grafismes (.mov/.mp4) porten pista
                // d'àudio i Premiere la col·locava enllaçada → sonava damunt del programa.
                var ins = await getClipsLogic().insertNoAudio(items[p].name, tGraf, t, null);
                var res = ins.res;
                var realEnd = await this._clipEndAt(tGraf, t);
                if (realEnd === null) {
                    L('⚠️ [MAPA] No puc mesurar el clip inserit a V' + tGraf + ' → aturo', 'WARN');
                    break;
                }
                var clamped = false;
                if (space !== null && endLimit !== null && realEnd > endLimit + 0.01) {
                    // (2026-10-08) EL RETALL HA DE DEIXAR EL CLIP ESTIRABLE. `Clips.endAt`
                    // només movia el final del TIMELINE i deixava l'outPoint del SOURCE al
                    // final del mèdia (comprovat en viu 08/10: end=50.12 amb dur=11.28 però
                    // outPoint=50.6 = els 50,62 s sencers) → Premiere considerava el material
                    // esgotat i NO deixava allargar el clip («no es pot estirar més enllà de la
                    // inserció»). `Clips.trimBounds` (àtom existent) fixa inPoint/outPoint i el
                    // final de manera coherent, i deixa material per estirar a la timeline.
                    var cb = await this._clipBoundsAt(tGraf, ins.idx);
                    var inPt = (cb && typeof cb.inPoint === 'number') ? cb.inPoint : 0;
                    var outPt = inPt + (endLimit - t);
                    var rE = await callJSX("Clips.trimBounds(" + t.toFixed(4) + ", " + inPt.toFixed(4) +
                        ", " + outPt.toFixed(4) + ", " + tGraf + ", 'video')");
                    L('🗺️ [MAPA] V' + tGraf + ' retallat a l\'espai hàbil (' + realEnd.toFixed(2) +
                        ' → ' + endLimit.toFixed(2) + 's · source ' + inPt.toFixed(2) + '→' + outPt.toFixed(2) +
                        's, estirable) [' + rE + ']');
                    realEnd = endLimit;
                    clamped = true;
                }
                L('🗺️ [MAPA] V' + tGraf + ': "' + items[p].name + '" @ ' + t.toFixed(2) + 's → ' +
                    realEnd.toFixed(2) + 's (dur ' + (realEnd - t).toFixed(2) + 's)' +
                    (clamped ? ' [retallat]' : '') + ' [' + res + ']');
                t = realEnd;
                grafEnd = realEnd;
            }

            if (grafEnd <= refSec + 0.01) {
                L('⚠️ [MAPA] No s\'ha pogut inserir cap gràfic → no col·loco congelat', 'WARN');
                return;
            }

            // 4. CONGELAT (PNG del tema-títol) a la pista de congelat, entre l'inici del clip
            //    de referència i el final del GRÀFIC real inserit (no fins al final del clip
            //    del gràfic ni del clip del programa).
            //    (2026-10-16 · BUG #169) NOMÉS si el congelat és una IMATGE FIXA (vegeu
            //    `_freezeUnderCti`): un grafisme NO es replica a V6.
            if (freeze && freeze.name && this._isStill(freeze.name)) {
                var fzEsc = U().escape(freeze.name);
                var fzEnd = grafEnd;
                var resF = await callJSX("Clips.insert('" + fzEsc + "', " + TRACK_FREEZE + ", " +
                    refSec.toFixed(4) + ", null, 'video')");
                // (2026-10-08) Retall COHERENT via `Clips.trimBounds` (inPoint 0 → outPoint =
                // durada volguda): amb `Clips.endAt` l'outPoint quedava al final del mèdia i el
                // congelat no es podia estirar (mateix defecte que el clip de V3).
                var resFE = await callJSX("Clips.trimBounds(" + refSec.toFixed(4) + ", 0, " +
                    Math.max(0, fzEnd - refSec).toFixed(4) + ", " + TRACK_FREEZE + ", 'video')");
                L('🗺️ [MAPA] V' + TRACK_FREEZE + ' (congelat): "' + freeze.name + '" @ ' +
                    refSec.toFixed(2) + 's → ' + fzEnd.toFixed(2) + 's (final del gràfic de V' +
                    tGraf + ') [insert=' + resF + ' · endAt=' + resFE + ']');
            } else if (freeze && freeze.name) {
                // (2026-10-16 · BUG #169) Xarxa de seguretat: un «congelat» que NO siga una
                // imatge fixa (p. ex. un grafisme) no s'ha de replicar MAI a V6: duplicaria
                // el gràfic (V3+V6) i tallaria el contingut del tema-títol.
                L('⚠️ [MAPA] El congelat de referència "' + String(freeze.name).substring(0, 50) +
                    '" no és una imatge fixa → V' + TRACK_FREEZE + ' no es replica', 'WARN');
            } else if (!freeze) {
                L('⚠️ [MAPA] Sense congelat de referència → V' + TRACK_FREEZE + ' no es replica', 'WARN');
            }

            // 5. (2026-09-23) CONGELAT AL FINAL DEL GRAFISME: PNG de l'últim frame del
            //    grafisme (màxim 3 s, o menys si el clip de V1 acaba abans) perquè l'usuari
            //    el pugui estirar/retallar còmodament. Mateixa mecànica que el congelat del
            //    Tema-Títol (_freezeTemaTitol a flow_chyrons.js).
            try {
                var lastItem = items[items.length - 1];
                if (lastItem && lastItem.name) {
                    await this._freezeGrafEnd(lastItem.name, grafEnd, endLimit, tGraf);
                }
            } catch (eFz) {
                L('⚠️ [MAPA] Congelat final del grafisme: ' + eFz.message, 'WARN');
            }
        }
    };

    L('🗺️ [Mapa] Mòdul inicialitzat (importador GRAF → pista de grafismes)');
})();



