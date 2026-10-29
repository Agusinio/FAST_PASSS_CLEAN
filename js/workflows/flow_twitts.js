/* ============================================================================
 * WORKFLOW: TWITTS - v2.2.0 (2026-10-29)
 * Col·locació dels grafismes de tuit (XARXES) cremats a la imatge
 * ----------------------------------------------------------------------------
 * Spec: `docs/specs/TWITTS_OCR.md` (D1-D21). La MESURA i el MATCH viuen a
 * `js/logic/22_TwittsOcr_Logic.js`; ací només hi ha TIMELINE.
 *
 * NO HI HA CAP BOTÓ NOU. Estes són les dos entrades:
 *   1. `runAuto()`  AUTOMÀTICA (petició d'usuari 2026-10-29): la crida el 🎯
 *      COLOCAR en acabar de col·locar tots els chyrons (`js/main.js` →
 *      `runPlaceAllChyrons`). Si la IMPORTACIÓ ha portat movies de tuit
 *      (XARXES / `LUCYS VERTICALITZACIÓ`, els del bloc a seques `_V_00_`) i
 *      algun NO s'ha inserit al timeline, es miren els clips de V1 que no
 *      tenen cap grafisme damunt: UN frame per clip (el 35 des de l'in), es
 *      compara amb els movies que FALTEN i el que casa (puntuació ≥ `umbral`)
 *      es col·loca COBRINT el clip. S'atura quan ja no queda cap movie per
 *      col·locar.
 *   2. `runEmergency()`  Ctrl+clic a la DIANA 🎯: ÚNIC mecanisme manual. Primer
 *      prova de resoldre'l SOL (1 frame del clip del cabezal + OCR contra els
 *      tuit PENDENTS, igual que la passada automàtica). Si no casa, ensenya una
 *      LLISTA CURTA amb els `.mov` de tuit del DIA DEL PROJECTE (mana el
 *      .prproj obert: pot ser ahir) + els pendents que ja són al projecte, i
 *      «Buscar al disc…» obri el navegador natiu (movie d'un altre dia).
 *
 * COL·LOCACIÓ (les dos vies): pista de grafismes de la CONFIG, de `clip.start` a
 * `clip.end` — el clip on l'OCR ha casat, mai el cabezal ni la selecció. Si el movie
 * és més curt que el clip, s'avisa: no s'inventa cap congelat. Com que `Clips.insert`
 * (JSX) ajusta la duració amb `clips[numItems-1]` (l'ÚLTIM clip de la pista, no el
 * inserit), després de cada insert `_fixPlacement` RETALLA el tuit al final volgut,
 * RESTAURA els clips preexistents i VERIFICA el resultat (BUG #206 · D20).
 *
 * ZERO JSX nou: frame amb `Render.snapshot` (QE de la timeline, D21) o
 * `FFmpeg.extractFramePng` (media del clip, D19 · reserva) + `bin\ocr.ps1`
 * (via `TitoletDetect.ocrText`) + `Clips.insert` + `IO.importFiles` +
 * `FASTPASS.Project.items`.
 * ==========================================================================*/
(function () {
    'use strict';

    window.FASTPASS_UI = window.FASTPASS_UI || {};
    var W = window.FASTPASS_UI.Workflows = window.FASTPASS_UI.Workflows || {};

    // Una sola passada alhora (automàtica o d'emergència).
    var _running = false;

    // Tipus de fitxer que accepta el navegador d'emergència.
    var VIDEO_EXT = ['mov', 'mp4'];

    function U() { return window.FASTPASS_UI.Utils; }
    function L() { return window.FASTPASS_UI.Logic; }
    function log(msg, lvl) {
        try { U().log(msg, lvl || 'DEBUG'); }
        catch (e) { try { console.log(msg); } catch (e2) { } }
    }
    function status(msg, kind) {
        try { U().status(msg, kind); } catch (e) { }
    }
    function cfg() {
        try {
            var C = window.FASTPASS_UI.Config;
            return (C && typeof C.get === 'function') ? (C.get() || {}) : {};
        } catch (e) { return {}; }
    }
    function trackV1() {
        var t = cfg().tracks || {};
        return (t.video && t.video.mp4) ? Number(t.video.mp4) : 1;
    }
    function trackGraf() {
        var t = cfg().tracks || {};
        return (t.video && t.video.graficos) ? Number(t.video.graficos) : 3;
    }

    W.Twitts = {
        /** _grafClips: clips que JA hi ha a la pista de grafismes (idempotència). */
        _grafClips: async function () {
            try { return await L().Clips.getTrackClips(trackGraf(), 'video'); }
            catch (e) { return []; }
        },

        /**
         * _covered: el clip de V1 ja té un TUIT damunt?
         * Només compten els grafismes que SÓN movies de tuit (`esXarxes`): els
         * chyrons que acaba de col·locar el 🎯 COLOCAR no impedixen posar-hi el
         * tuit (conviuen, i el tuit va CREMAT a la imatge). Solapament temporal
         * ≥50 % del clip de V1.
         */
        _covered: function (grafClips, clip) {
            var list = Array.isArray(grafClips) ? grafClips : [];
            var T = L().TwittsOcr;
            var a0 = Number(clip && clip.start) || 0;
            var b0 = Number(clip && clip.end) || 0;
            var dur = Math.max(0.001, b0 - a0);
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                if (!c) continue;
                // Qualsevol grafisme que NO siga un movie de tuit no compta.
                if (T && typeof T.esXarxes === 'function' && !T.esXarxes(c.name)) continue;
                var a = Math.max(Number(c.start) || 0, a0);
                var b = Math.min(Number(c.end) || 0, b0);
                if ((b - a) / dur >= 0.5) return true;
            }
            return false;
        },

        /**
         * _isPlaced: el movie ja està col·locat damunt d'eixe clip de V1?
         * Mateix NOM i solapament temporal ≥50 % del clip de V1.
         */
        _isPlaced: function (grafClips, name, start, end) {
            var list = Array.isArray(grafClips) ? grafClips : [];
            if (!name) return false;
            var ref = String(name).toLowerCase();
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                if (!c || String(c.name || '').toLowerCase() !== ref) continue;
                var a = Math.max(Number(c.start) || 0, Number(start) || 0);
                var b = Math.min(Number(c.end) || 0, Number(end) || 0);
                var dur = Math.max(0.001, Number(end) - Number(start));
                if ((b - a) / dur >= 0.5) return true;
            }
            return false;
        },

        /**
         * _place: importa (si cal) el movie i el col·loca COBRINT el clip de V1.
         * @param {{name:string, full?:string}} cand
         * @param {Object} clip - { start, end, name }
         * @returns {Promise<{ok:boolean, why:string}>}
         */
        _place: async function (cand, clip) {
            var u = U();
            var cl = L().Clips;
            var T = L().TwittsOcr;
            var start = Number(clip.start);
            var end = Number(clip.end);
            var dur = end - start;
            if (!cand || !cand.name) return { ok: false, why: 'sense fitxer' };
            var name = String(cand.name);
            var mediaDur = 0;
            try { mediaDur = Number(await u.callJSX('Project.itemDuration(' + JSON.stringify(name) + ')')) || 0; }
            catch (eD) { mediaDur = 0; }
            var endIns = end;
            if (mediaDur > 0 && mediaDur < dur) {
                endIns = start + mediaDur;
                log('⚠️ [TWITTS] «' + name + '» dura ' + mediaDur.toFixed(2) + 's i el clip ' +
                    dur.toFixed(2) + 's → NO el cobrix del tot (es col·loca igualment)', 'WARN');
            }
            // BUG #206: `Clips.insert` (JSX) retalla `clips[numItems-1]`, és a dir
            // l'ÚLTIM clip de la pista i NO el que acaba d'inserir. Amb chyrons ja a
            // V3, el tuit es quedava amb la DURADA SENCERA del mèdia (tapant el clip
            // següent i el tuit bo) i, a més, es retallava el chyron més tardà.
            // Es fotografia la pista ABANS i es repara DESPRÉS (`_fixPlacement`).
            var before = await this._grafClips();
            var r = await cl.insert(name, trackGraf(), start, endIns, 'video');
            if (String(r).indexOf('ERR_ITEM_NOT_FOUND') === 0) {
                log('📥 [TWITTS] «' + name + '» no és al projecte → s\'importa', 'INFO');
                try {
                    await u.callJSX('IO.importFiles(' + JSON.stringify(JSON.stringify([cand.full || name])) + ', null)');
                } catch (eI) { return { ok: false, why: 'import: ' + eI.message }; }
                await u.delay(600);
                before = await this._grafClips();
                r = await cl.insert(name, trackGraf(), start, endIns, 'video');
            }
            var txt = String(r == null ? '' : r);
            if (txt.indexOf('OK') !== 0) return { ok: false, why: 'insert: ' + txt };

            // El que conta és el que ha quedat REALMENT a la timeline, no l'OK de l'insert.
            var fix = await this._fixPlacement(name, start, endIns, before);
            if (!fix.ok) {
                log('❌ [TWITTS] «' + name + '» inserit però NO verificat a V' + trackGraf() +
                    ': ' + fix.why, 'ERROR');
                return { ok: false, why: 'no verificat: ' + fix.why };
            }
            log('✅ [TWITTS] col·locat «' + name + '» a V' + trackGraf() + ' (' +
                T.tcStr(fix.start) + ' → ' + T.tcStr(fix.end) + ') sobre el clip de V' +
                trackV1() + ' ' + T.tcStr(start) + '→' + T.tcStr(end) +
                ' «' + String(clip.name || '') + '»', 'INFO');
            return { ok: true, why: '' };
        },

        /**
         * _fixPlacement: deixa el tuit inserit amb el FINAL demanat i torna els clips
         * que JA hi havia a la pista al seu estat previ.
         *
         * ── PER QUÈ (en viu el 2026-10-29 · BUGS.md #206) ────────────────────────
         * `Clips.insert` (JSX, `6_Clips.jsx`) ajusta la duració amb
         * `clips[numItems-1]`, és a dir l'ÚLTIM clip de la pista i NO el que acaba
         * d'inserir. Si V3 ja té chyrons i el tuit entra enmig, el tuit es queda
         * amb la duració SENCERA del mèdia (tapa els clips de V1 següents, amb el
         * tuit bo inclòs) i el chyron més tardà es retalla.
         *
         * ── COM ─────────────────────────────────────────────────────────────────
         * · El clip es localitza per NOM + `start` (mai per instant: un chyron pot
         *   arrencar exactament al mateix TC).
         * · Es retalla COHERENT (inPoint → outPoint → end) amb `Clips.retrim` i, si
         *   el mèdia no dóna per a eixa duració, es fixa el final amb `Clips.endAt`
         *   (WARN: eixe clip només es podrà escurçar).
         * · Els preexistents que hagen canviat de final es RESTAUREN.
         *
         * @param {string} name - Nom del project item inserit
         * @param {number} start - Inici on s'ha inserit (s)
         * @param {number} endWant - Final volgut (s)
         * @param {Array} before - `_grafClips()` llegit ABANS de la inserció
         * @returns {Promise<{ok:boolean, start:number, end:number, why:string}>}
         */
        _fixPlacement: async function (name, start, endWant, before) {
            var u = U();
            var t = trackGraf();
            var s0 = Number(start) || 0;
            var key = function (n) { return String(n || '').toLowerCase().replace(/\.[^.]+$/, ''); };
            var findIn = function (list, n, s) {
                var k = key(n), best = null, bd = 0.061;
                for (var i = 0; i < (list || []).length; i++) {
                    var c = list[i];
                    if (!c || key(c.name) !== k) continue;
                    var d = Math.abs((Number(c.start) || 0) - (Number(s) || 0));
                    if (d <= bd) { bd = d; best = c; }
                }
                return best;
            };
            var notes = [];
            var c = findIn(await this._grafClips(), name, s0);
            if (!c) {
                return { ok: false, start: s0, end: 0, why: 'el movie no apareix a V' + t + '@' + s0.toFixed(2) + 's' };
            }

            // 1. El tuit ha d'acabar a `endWant`, no on acaba el mèdia.
            var want = Number(endWant) || (Number(c.end) || 0);
            if (Math.abs((Number(c.end) || 0) - want) > 0.06) {
                var inPt = (isFinite(Number(c.inPoint)) && Number(c.inPoint) >= 0) ? Number(c.inPoint) : 0;
                var outPt = inPt + Math.max(0.04, want - (Number(c.start) || s0));
                var r = '';
                try {
                    r = String(await u.callJSX('Clips.retrim(' + t + ', ' + c.index + ', ' +
                        inPt.toFixed(4) + ', ' + outPt.toFixed(4) + ', ' + want.toFixed(4) + ", 'video')") || '');
                } catch (e) { r = 'ERR: ' + e.message; }
                notes.push('final [' + r + ']');
                var c2 = findIn(await this._grafClips(), name, s0);
                if (!c2 || Math.abs((Number(c2.end) || 0) - want) > 0.06) {
                    var rb = '';
                    try {
                        rb = String(await u.callJSX('Clips.endAt(' + t + ', ' + s0.toFixed(4) + ', ' +
                            want.toFixed(4) + ", 'video')") || '');
                    } catch (e2) { rb = 'ERR: ' + e2.message; }
                    notes.push('endAt [' + rb + '] (el mèdia no dóna per al retall coherent)');
                }
            }
            // 2. Restaurar els clips que ja hi eren i que el JSX haja pogut retallar.
            var now = await this._grafClips();
            var rest = 0;
            for (var i = 0; i < (before || []).length; i++) {
                var b = before[i];
                if (!b) continue;
                if (key(b.name) === key(name) && Math.abs((Number(b.start) || 0) - s0) <= 0.061) continue;
                var bc = findIn(now, b.name, b.start);
                if (!bc) {
                    notes.push('ha desaparegut «' + String(b.name || '').substring(0, 26) + '» @' +
                        (Number(b.start) || 0).toFixed(2) + 's');
                    continue;
                }
                if (Math.abs((Number(bc.end) || 0) - (Number(b.end) || 0)) <= 0.06) continue;
                var rin = (isFinite(Number(bc.inPoint)) && Number(bc.inPoint) >= 0) ? Number(bc.inPoint) : 0;
                var rout = rin + Math.max(0.04, (Number(b.end) || 0) - (Number(bc.start) || 0));
                try {
                    await u.callJSX('Clips.retrim(' + t + ', ' + bc.index + ', ' + rin.toFixed(4) + ', ' +
                        rout.toFixed(4) + ', ' + (Number(b.end) || 0).toFixed(4) + ", 'video')");
                    rest++;
                } catch (e3) {
                    notes.push('restauració «' + String(b.name || '').substring(0, 26) + '»: ' + e3.message);
                }
            }
            if (rest) log('↩️ [TWITTS] ' + rest + ' clip(s) de V' + t + ' restaurat(s) al final que tenien', 'INFO');
            if (notes.length) log('⚠️ [TWITTS] reparació de V' + t + ': ' + notes.join(' · '), 'WARN');

            // 3. Verificació final sobre la pista REAL.
            var fin = findIn(await this._grafClips(), name, s0);
            if (!fin) {
                return { ok: false, start: s0, end: 0, why: 'no hi ha cap «' + String(name).substring(0, 26) + '» a V' + t + '@' + s0.toFixed(2) + 's' };
            }
            var fs = Number(fin.start) || s0;
            var fe = Number(fin.end) || 0;
            if (Math.abs(fe - want) > 0.06) {
                return { ok: false, start: fs, end: fe, why: 'queda de ' + fs.toFixed(2) + 's a ' + fe.toFixed(2) + 's i es volia fins a ' + want.toFixed(2) + 's' };
            }
            return { ok: true, start: fs, end: fe, why: '' };
        },

        /**
         * runAuto: PASSADA AUTOMÀTICA (sense cap finestra ni botó).
         *
         * S'ha de disparar NOMÉS des del final de la col·locació automàtica de
         * chyrons (`runPlaceAllChyrons` a `js/main.js`): si la importació ha
         * portat movies de tuit i algun no ha entrat al timeline, eixe és el
         * senyal que el generador no els ha lligat a cap ítem (BUG #191).
         *
         * @returns {Promise<{ok:boolean, placed:number, pendents:number, why:string}>}
         */
        runAuto: async function () {
            var res = { ok: false, placed: 0, pendents: 0, why: '' };
            if (_running) { log('⏭️ [TWITTS] ja hi ha una passada en marxa', 'WARN'); res.why = 'ocupat'; return res; }
            _running = true;
            log('▶️ [TWITTS] passada automàtica (final de la col·locació de chyrons)', 'INFO');
            try {
                var T = L().TwittsOcr;
                var CL = L().Clips;
                var c = T.opts({});

                // 1. Movies de tuit: els que la IMPORTACIÓ ha deixat al projecte.
                var placedNames = await T.placedNames();
                var fl = await T.flotants({ placed: placedNames });
                if (!fl.ok) {
                    res.why = fl.why;
                    log('⚠️ [TWITTS] no s\'han pogut llegir els movies del projecte: ' + fl.why, 'WARN');
                    return res;
                }
                if (!fl.files.length) {
                    log('➖ [TWITTS] cap movie de tuit al projecte → res a fer', 'INFO');
                    res.ok = true; return res;
                }
                var falten = fl.pendents.slice();
                if (!falten.length) {
                    log('➖ [TWITTS] els ' + fl.files.length + ' movie(s) de tuit ja són al timeline', 'INFO');
                    res.ok = true; return res;
                }
                log('🐦 [TWITTS] ' + falten.length + '/' + fl.files.length +
                    ' movie(s) de tuit SENSE col·locar → es busquen els clips de V' + trackV1(), 'INFO');
                status('TWITTS: ' + falten.length + ' tuit(s) per casar', 'warn');

                // 2. Clips de V1 que no tenen cap grafisme damunt.
                var v1 = [];
                try { v1 = await CL.getTrackClips(trackV1(), 'video'); } catch (eV) { v1 = []; }
                var graf = await this._grafClips();
                var lliures = [];
                for (var i = 0; i < (v1 || []).length; i++) {
                    var cl = v1[i];
                    if (!cl) continue;
                    if ((Number(cl.end) - Number(cl.start)) < c.minDur) continue;
                    if (this._covered(graf, cl)) continue;
                    lliures.push(cl);
                }
                if (!lliures.length) {
                    log('➖ [TWITTS] cap clip de V' + trackV1() + ' lliure per casar (tots ja tenen tuit o són curts)', 'INFO');
                    res.ok = true; return res;
                }
                log('🔎 [TWITTS] clips de V' + trackV1() + ': ' + (v1 || []).length +
                    ' · sense tuit damunt i ≥' + c.minDur + 's: ' + lliures.length, 'INFO');

                // 3. UN frame per clip; el que casa es col·loca i ix del pòsit.
                var self = this;
                var col = 0, pend = 0;
                await T.scanClips(lliures, falten, c, {
                    // D19: el frame ix del MEDIA del clip (ffmpeg), no de la timeline.
                    paths: fl.paths,
                    onHit: async function (e) {
                        if (!e.tria) {
                            pend++;
                            log('⚠️ [TWITTS] ' + T.tcStr(e.clip.start) + ' tuit @' + (e.handle || '—') +
                                ' SENSE movie clar (millor ' + e.score + ') → queda PENDENT', 'WARN');
                            return true;
                        }
                        var r = await self._place(e.tria, e.clip);
                        if (!r.ok) {
                            pend++;
                            log('❌ [TWITTS] ' + T.tcStr(e.clip.start) + ': ' + r.why, 'ERROR');
                            return true;
                        }
                        col++;
                        // D10: la tria que ha funcionat es memoritza (si no venia
                        // ja de la caché) → la pròxima volta casa sense puntuar.
                        if (!e.apres) { try { T.learn(e.text, e.tria); } catch (eL) { } }
                        for (var k = 0; k < falten.length; k++) {
                            if (falten[k].name === e.tria.name) { falten.splice(k, 1); break; }
                        }
                        // Sense movies per col·locar, no es gasta cap OCR més.
                        return falten.length > 0;
                    }
                });

                res.ok = true; res.placed = col; res.pendents = pend;
                log('🏁 [TWITTS] ' + col + ' col·locat(s) · ' + pend + ' pendent(s) · ' +
                    falten.length + ' movie(s) sense ús', col ? 'INFO' : 'WARN');
                status('TWITTS: ' + col + ' tuit(s) col·locat(s)' + (pend ? ' · ' + pend + ' pendent(s)' : ''),
                    col ? 'exito' : 'warn');
                if (pend || falten.length) {
                    log('ℹ️ [TWITTS] per als que queden: Ctrl+clic a la DIANA 🎯 ' +
                        '(primer prova OCR; si no, llista dels tuit del dia del projecte)', 'INFO');
                }
                return res;
            } catch (e) {
                res.why = e.message;
                log('💥 [TWITTS] runAuto: ' + e.message, 'ERROR');
                return res;
            } finally {
                _running = false;
            }
        },
        /**
         * _dayDir: DATA DE TREBALL, amb el PROJECTE OBERT com a font de veritat.
         * Mateix orde que `flow_srt.js::_srtCtx` (BUG #187) i
         * `flow_mapa.js::_resolveDateDir` (BUG #196): si s'edita el projecte
         * d'AHIR, la llista de l'emergència ha de ser la d'AHIR, no la del
         * rellotge.
         *   1) `Mapa._resolveDateDir` (path del .prproj → State.projectDateDir → …)
         *   2) `Context._resolveProjectDateDir`
         *   3) `State.projectDateDir` · 4) `State.dateDir` · 5) rellotge
         * @returns {Promise<string>} 'YYYY_MM_DD'
         */
        _dayDir: async function () {
            var M = W.Mapa;
            try {
                if (M && typeof M._resolveDateDir === 'function') {
                    var d1 = await M._resolveDateDir();
                    if (d1) return String(d1);
                }
            } catch (e1) { }
            try {
                var Ctx = window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.Context;
                if (Ctx && typeof Ctx._resolveProjectDateDir === 'function') {
                    var d2 = await Ctx._resolveProjectDateDir();
                    if (d2) return String(d2);
                }
            } catch (e2) { }
            var St = window.FASTPASS_UI.State || {};
            if (St.projectDateDir) return String(St.projectDateDir);
            if (St.dateDir) return String(St.dateDir);
            try { return U().getFormattedDate().replace(/["\s]/g, '').trim(); }
            catch (e3) { return ''; }
        },

        /**
         * _dayMovies: els `.mov` de TUIT (XARXES) de la CARPETA DEL DIA DEL
         * PROJECTE (29/10: la finestra d'emergència ja no ensenya la carpeta
         * sencera).
         *
         * NO es fa cap llistat car: s'aprofita la datació del Scanner
         * (`_listNamesNative` → noms en ms; `_dateWotts` → data per fitxer, amb
         * la seua caché persistent a localStorage). Només es daten els XARXES
         * que encara no estaven datats. Si el Scanner no hi és, es cau a
         * `Utils.readFolder` + `Scan.filterByWorkDate` (el mateix criteri).
         *
         * @param {string} dateDir - 'YYYY_MM_DD' del projecte obert
         * @returns {Promise<{ok:boolean, files:Array<{name,full}>, day:string, why:string}>}
         */
        _dayMovies: async function (dateDir) {
            var out = { ok: false, files: [], other: [], day: String(dateDir || ''), why: '' };
            var T = L().TwittsOcr;
            var S = L().Scan;
            if (!T || typeof T.esXarxes !== 'function') { out.why = 'sense Logic.TwittsOcr'; return out; }
            var folder = T.folder();                        // rutas.chyrons + '\'
            if (!folder) { out.why = 'falta Config.rutas.chyrons'; return out; }
            var target = String(dateDir || '').replace(/_/g, '');
            if (!/^\d{8}$/.test(target)) { out.why = 'sense data del projecte'; return out; }
            var base = folder.replace(/[\\/]+$/, '') + '\\';

            // ── 1. Només NOMS (CEP natiu). Sense stats: el NAS triga 100 s en fred.
            var names = null;
            try {
                if (S && typeof S._listNamesNative === 'function') names = S._listNamesNative(folder);
            } catch (eN) { names = null; }

            if (names && names.length) {
                var movs = [];
                for (var i = 0; i < names.length; i++) {
                    var n = String(names[i] || '');
                    if (!/\.mov$/i.test(n)) continue;
                    if (!T.esXarxes(n)) continue;
                    movs.push(n);
                }
                // ── 2. Datació: caché del Scanner + només els que falten.
                var dates = {};
                try {
                    if (typeof S._loadDateCache === 'function') S._loadDateCache();
                    dates = S._wottDateCache || {};
                } catch (eD) { dates = {}; }
                var pend = [];
                for (var j = 0; j < movs.length; j++) {
                    if (!dates[String(movs[j]).toUpperCase()]) pend.push(movs[j]);
                }
                if (pend.length && typeof S._dateWotts === 'function') {
                    try {
                        log('📅 [TWITTS] datant ' + pend.length +
                            ' movie(s) de tuit (al NAS només se li pregunta una volta)…');
                        await S._dateWotts(folder, pend);
                        dates = S._wottDateCache || {};
                    } catch (eW) { }
                }
                // ── 3. Filtre per la data del projecte (anti-contaminació: un
                // fitxer que no es pot datar NO entra a «del dia»), però es
                // GUARDA a `other` per a la cua curta de l'emergència: un tuit
                // exportat a les 00:30 cau al dia anterior (regla nocturna) i
                // seria invisible tot i ser el bo (D23).
                for (var k = 0; k < movs.length; k++) {
                    var d8 = dates[String(movs[k]).toUpperCase()];
                    var it = { name: movs[k], full: base + movs[k], d8: String(d8 || '') };
                    if (String(d8 || '') === target) { out.files.push(it); continue; }
                    out.other.push(it);
                }
                out.ok = true;
                out.why = '';
                return out;
            }

            // ── 4. Fallback: llistat complet + filterByWorkDate (mateix criteri).
            try {
                var all = await U().readFolder(folder);
                if (Array.isArray(all)) {
                    var f2 = [];
                    for (var m = 0; m < all.length; m++) {
                        if (!/\.mov$/i.test(String(all[m].name || ''))) continue;
                        if (!T.esXarxes(all[m].name)) continue;
                        f2.push(all[m]);
                    }
                    var resD = (S && typeof S.filterByWorkDate === 'function')
                        ? S.filterByWorkDate(f2, dateDir) : { keep: f2, dropped: [], noDate: [] };
                    var keep = resD.keep || f2;
                    for (var q = 0; q < keep.length; q++) {
                        out.files.push({ name: keep[q].name, full: base + keep[q].name });
                    }
                    var oth = (resD.dropped || []).concat(resD.noDate || []);
                    for (var q2 = 0; q2 < oth.length; q2++) {
                        if (!oth[q2] || !oth[q2].name) continue;
                        out.other.push({ name: oth[q2].name, full: base + oth[q2].name });
                    }
                    out.ok = true;
                } else {
                    out.why = "no s'ha pogut llegir " + folder;
                }
            } catch (eR) { out.why = 'readFolder: ' + eR.message; }
            return out;
        },

        /**
         * _mergeList: (PURA) llista de l'emergència = els tuits PENDENTS que ja
         * són al projecte primer, i darrere els `.mov` del dia del projecte,
         * sense repetir cap nom (case-insensitive).
         * @param {Array<{name,full}>} pend  - pendents del projecte
         * @param {Array<{name,full}>} dayFiles - movies del dia (disc)
         * @returns {Array<{name,full,tag}>}
         */
        _mergeList: function (pend, dayFiles) {
            var out = [], vist = {};
            var a = Array.isArray(pend) ? pend : [];
            var b = Array.isArray(dayFiles) ? dayFiles : [];
            var i, n, k;
            for (i = 0; i < a.length; i++) {
                n = String((a[i] && a[i].name) || '');
                if (!n) continue;
                k = n.toLowerCase();
                if (vist[k]) continue;
                vist[k] = true;
                out.push({ name: n, full: (a[i] && a[i].full) || '', tag: 'al projecte' });
            }
            for (i = 0; i < b.length; i++) {
                n = String((b[i] && b[i].name) || '');
                if (!n) continue;
                k = n.toLowerCase();
                if (vist[k]) continue;
                vist[k] = true;
                out.push({ name: n, full: (b[i] && b[i].full) || '', tag: 'del dia' });
            }
            return out;
        },

        /**
         * _recentOf: (PURA) els `n` exports MÉS RECENTS d'una llista de movies,
         * pel número d'export del nom (`…00666204.mov`), etiquetats «altre dia»
         * (D23). Servix perquè un tuit que la datació ha deixat en un altre dia
         * (exportat a les 00:30 → regla nocturna, reexportat…) no desaparega de
         * l'emergència.
         * @param {Array<{name,full}>} list
         * @param {number} n
         * @returns {Array<{name,full,tag}>}
         */
        _recentOf: function (list, n) {
            var T = L().TwittsOcr;
            var max = Number(n) > 0 ? Number(n) : 20;
            var a = Array.isArray(list) ? list : [];
            var vist = {}, out = [];
            for (var i = 0; i < a.length; i++) {
                if (!a[i] || !a[i].name) continue;
                var k = String(a[i].name).toLowerCase();
                if (vist[k]) continue;
                vist[k] = true;
                out.push({
                    name: a[i].name, full: a[i].full || '',
                    tag: 'altre dia' + (a[i].d8 ? ' ' + String(a[i].d8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$3/$2') : '')
                });
            }
            out.sort(function (x, y) {
                var sx = (T && typeof T.fileSuffix === 'function') ? T.fileSuffix(x.name) : 0;
                var sy = (T && typeof T.fileSuffix === 'function') ? T.fileSuffix(y.name) : 0;
                return sy - sx;
            });
            return out.slice(0, max);
        },

        /**
         * _pick: finestra de tria (overlay `#twitts-pick`). NOMÉS s'obri quan el
         * match automàtic no ha decidit.
         * (2026-10-29 · D22/D23) Dins de la finestra:
         *   · la llista s'ORDENA per semblança amb el text OCR del clip
         *     (`rankPick`: «Salvador Illa» → `wott x salvador illa…` al cap) i,
         *     a igualtat, per l'export més recent;
         *   · hi ha un CERCADOR (`#tw-pick-q`) que filtra en viu pel nom;
         *   · ↑/↓ mouen el focus per la llista i ⏎ col·loca (sense ratolí).
         * @param {Array<{name,full,tag}>} items
         * @param {{day:string, sub:string, text:string}} info
         * @returns {Promise<{name,full}|{disc:true}|null>} null = cancel·lat
         */
        _pick: function (items, info) {
            return new Promise(function (resolve) {
                var box = document.getElementById('twitts-pick');
                var list = document.getElementById('tw-pick-list');
                var sub = document.getElementById('tw-pick-sub');
                var dayEl = document.getElementById('tw-pick-day');
                var qEl = document.getElementById('tw-pick-q');
                var cntEl = document.getElementById('tw-pick-count');
                var bDisc = document.getElementById('tw-pick-disc');
                var bCanc = document.getElementById('tw-pick-cancel');
                if (!box || !list) { resolve(null); return; }

                var T = L().TwittsOcr;
                var done = false;
                function close(val) {
                    if (done) return;
                    done = true;
                    box.classList.remove('active');
                    document.removeEventListener('keydown', onKey, true);
                    if (qEl) { qEl.removeEventListener('input', onQ); qEl.removeEventListener('keydown', onQKey, true); }
                    bDisc.removeEventListener('click', onDisc);
                    bCanc.removeEventListener('click', onCanc);
                    box.removeEventListener('click', onBg);
                    resolve(val);
                }
                function onKey(ev) {
                    if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
                }
                function onDisc() { close({ disc: true }); }
                function onCanc() { close(null); }
                function onBg(ev) { if (ev.target === box) close(null); }
                function onQ() { render(); }
                /** onQKey: ↑/↓ mouen el focus per la llista (⏎ el col·loca). */
                function onQKey(ev) {
                    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
                    var bs = list.querySelectorAll('.tw-pick-item');
                    if (!bs.length) return;
                    ev.preventDefault();
                    var cur = -1;
                    for (var i = 0; i < bs.length; i++) { if (bs[i] === document.activeElement) cur = i; }
                    var nx = (ev.key === 'ArrowDown')
                        ? (cur < 0 ? 0 : Math.min(bs.length - 1, cur + 1))
                        : (cur < 0 ? bs.length - 1 : Math.max(0, cur - 1));
                    try { bs[nx].focus(); } catch (eF) { }
                }

                var L0 = Array.isArray(items) ? items : [];
                var txtOcr = (info && info.text) ? String(info.text) : '';
                var ranked = (T && typeof T.rankPick === 'function') ? T.rankPick(L0, txtOcr) : L0;
                if (dayEl) dayEl.textContent = (info && info.day) ? '(' + info.day + ')' : '';
                if (sub) sub.textContent = (info && info.sub) ? info.sub : '';
                if (qEl) qEl.value = '';

                /** render: pinta els ítems que passen el filtre del cercador. */
                function render() {
                    var q = qEl ? String(qEl.value || '') : '';
                    var qn = (T && typeof T.normTxt === 'function')
                        ? T.normTxt(q).replace(/ /g, '') : String(q).replace(/\s+/g, '');
                    list.innerHTML = '';
                    var n = 0;
                    for (var i = 0; i < ranked.length; i++) {
                        var it = ranked[i];
                        var nomN = (T && typeof T.normTxt === 'function')
                            ? T.normTxt(it.name).replace(/ /g, '') : String(it.name).toLowerCase();
                        if (qn && nomN.indexOf(qn) === -1) continue;
                        n++;
                        var b = document.createElement('button');
                        b.type = 'button';
                        b.className = 'tw-pick-item';
                        var f = (T && typeof T.wottFields === 'function') ? T.wottFields(it.name) : {};
                        var net = (T && typeof T.nomNet === 'function') ? T.nomNet(it.name) : '';
                        var who = document.createElement('span');
                        who.className = 'tw-pick-who';
                        who.textContent = (f.nom || net || it.name) +
                            (f.partit ? ' · ' + f.partit : '') +
                            (f.handle ? ' · @' + f.handle : '');
                        var meta = document.createElement('span');
                        meta.className = 'tw-pick-meta';
                        meta.textContent = '  ' + String(it.name).substring(0, 70);
                        b.appendChild(who);
                        b.appendChild(meta);
                        if (it.tag) {
                            var tg = document.createElement('span');
                            tg.className = 'tw-pick-tag';
                            tg.textContent = '  [' + it.tag + ']';
                            b.appendChild(tg);
                        }
                        if (it.pts > 0) {
                            var sc = document.createElement('span');
                            sc.className = 'tw-pick-tag';
                            sc.textContent = '  ★' + it.pts;
                            b.appendChild(sc);
                        }
                        (function (ref) {
                            b.addEventListener('click', function () {
                                close({ name: ref.name, full: ref.full });
                            });
                        })(it);
                        list.appendChild(b);
                    }
                    if (!n) {
                        var e = document.createElement('div');
                        e.className = 'tw-pick-empty';
                        e.textContent = q
                            ? 'Cap movie coincideix amb «' + q + '».'
                            : ('Cap .mov de tuit datat el ' + ((info && info.day) || '?') +
                                ". Pots buscar-lo al disc (movie d'un altre dia, reexportat…).");
                        list.appendChild(e);
                    }
                    if (cntEl) {
                        cntEl.textContent = (qn || n !== ranked.length)
                            ? n + ' / ' + ranked.length
                            : String(ranked.length);
                    }
                }
                render();

                document.addEventListener('keydown', onKey, true);
                if (qEl) {
                    qEl.addEventListener('input', onQ);
                    qEl.addEventListener('keydown', onQKey, true);
                }
                bDisc.addEventListener('click', onDisc);
                bCanc.addEventListener('click', onCanc);
                box.addEventListener('click', onBg);
                box.classList.add('active');
                try {
                    if (qEl) qEl.focus();
                    else if (list.firstChild && list.firstChild.focus) list.firstChild.focus();
                } catch (eF2) { }
            });
        },

        /**
         * runEmergency: Ctrl+clic a la DIANA 🎯 → ÚNIC mecanisme manual (D9).
         * (2026-10-29, decisió d'usuari) ORDE:
         *   1. clip de V1 davall del cabezal
         *   2. MATCH primer: 1 frame del clip → OCR → el tuit PENDENT que case
         *      (≥ `umbral`) es col·loca sol, igual que la passada automàtica, i
         *      la tria s'aprén a la caché
         *   3. si no casa: LLISTA CURTA amb els .mov de tuit del DIA DEL
         *      PROJECTE (pot ser ahir: mana el .prproj, no el rellotge) + els
         *      pendents que ja són al projecte + una cua d'exports d'ALTRES
         *      dies (un tuit exportat a les 00:30 cau al dia anterior: D23).
         *      La llista va ORDENADA per semblança amb el text OCR del clip
         *      (`rankPick`) i té un CERCADOR (`#tw-pick-q`); ↑/↓ + ⏎ per triar.
         *   4. «Buscar al disc…» → navegador natiu (movie d'un altre dia,
         *      reexportat…). Mai s'ensenya la carpeta sencera sense demanar-ho.
         */
        runEmergency: async function () {
            var res = { ok: false, why: '' };
            if (_running) {
                log('⏭️ [TWITTS] ja hi ha una passada en marxa', 'WARN');
                res.why = 'ocupat';
                return res;
            }
            _running = true;
            try {
                var u = U();
                var T = L().TwittsOcr;
                try {
                    if (u && u.validateActiveSequence && !(await u.validateActiveSequence())) return res;
                } catch (eV) { }
                var clip = await this._clipAtPlayhead();
                if (!clip) {
                    log('⚠️ [TWITTS] cap clip de V' + trackV1() + ' davall del cabezal', 'WARN');
                    status('TWITTS: cap clip', 'error');
                    res.why = 'cap clip';
                    return res;
                }
                var day = await this._dayDir();
                log('🆘 [TWITTS] emergència: ' + T.tcStr(clip.start) + ' → ' + T.tcStr(clip.end) +
                    ' «' + String(clip.name || '').substring(0, 50) + '» · dia del projecte ' +
                    (day || '?'), 'INFO');

                // ── 1. Match automàtic (1 frame + OCR) amb els XARXES PENDENTS.
                var pend = [];
                var fl = null;
                try {
                    var placed = await T.placedNames();
                    fl = await T.flotants({ placed: placed });
                    if (fl && fl.ok) pend = fl.pendents || [];
                } catch (eF) { pend = []; }
                var oc = null;
                if (pend.length) {
                    try {
                        oc = await T.ocrClip(clip, {
                            files: pend, index: 1, paths: (fl && fl.paths) || null
                        });
                    } catch (eO) { oc = null; }
                    if (oc && oc.ok && oc.isTuit && oc.best) {
                        var r1 = await this._place({ name: oc.best.name, full: oc.best.full || '' }, clip);
                        if (r1.ok) {
                            try {
                                T.learn(oc.text, {
                                    name: oc.best.name, full: oc.best.full || '',
                                    created: 0, size: 0
                                });
                            } catch (eL) { }
                            log('✅ [TWITTS] emergència resolta per OCR: «' +
                                String(oc.best.name).substring(0, 60) + '…» (' + oc.score + ' punts)', 'INFO');
                            status('TWITTS: col·locat per OCR', 'exito');
                            res.ok = true;
                            return res;
                        }
                        log("⚠️ [TWITTS] el match era bo però no s'ha pogut col·locar: " + r1.why, 'WARN');
                    }
                    log("🔎 [TWITTS] l'OCR no decidix (millor " + ((oc && oc.score) || 0) +
                        ' punts) → llista del dia del projecte', 'WARN');
                } else {
                    log('🔎 [TWITTS] no queden movies de tuit al projecte → llista del dia', 'WARN');
                }

                // ── 2. Llista curta: pendents del projecte + movies del dia + una
                // cua d'altres dies (D23: tuit exportat a les 00:30 → dia anterior,
                // reexportat…). Mai la carpeta sencera.
                var dm = await this._dayMovies(day);
                var items = this._mergeList(pend, dm.files || []);
                var altres = this._recentOf(dm.other || [], 20);
                for (var ia = 0; ia < altres.length; ia++) items.push(altres[ia]);
                log("📋 [TWITTS] llista d'emergència: " + items.length + ' movie(s) (' +
                    pend.length + ' al projecte · ' + (dm.files || []).length + ' del dia ' +
                    (day || '?') + ' · ' + altres.length + " d'altres dies" +
                    (dm.why ? ' · ' + dm.why : '') + ')', 'INFO');

                var sub = 'OCR: «' +
                    String((oc && oc.text) || '(sense text)').replace(/\s+/g, ' ').substring(0, 90) + '»' +
                    (oc && oc.best ? ' · millor candidat ' + oc.score + ' punts' : '');
                var picked = await this._pick(items, {
                    day: day, sub: sub, text: (oc && oc.text) || ''
                });
                if (!picked) {
                    log('⏹️ [TWITTS] tria cancel·lada', 'WARN');
                    res.why = 'cancel·lat';
                    return res;
                }
                var tria = picked;
                if (picked.disc) {
                    var nav = await this._dialog(T.folder());
                    if (!nav || !nav.length) {
                        log('⏹️ [TWITTS] navegador cancel·lat', 'WARN');
                        res.why = 'cancel·lat';
                        return res;
                    }
                    tria = { name: nav[0].name, full: nav[0].full };
                }
                var r2 = await this._place({ name: tria.name, full: tria.full }, clip);
                if (r2.ok) {
                    // La tria manual s'aprén (D10) per al pròxim tuit igual.
                    try {
                        if (oc && oc.text) {
                            T.learn(oc.text, { name: tria.name, full: tria.full, created: 0, size: 0 });
                        }
                    } catch (eL2) { }
                    status('TWITTS: col·locat', 'exito');
                    res.ok = true;
                    return res;
                }
                log('❌ [TWITTS] ' + r2.why, 'ERROR');
                status('TWITTS: error', 'error');
                res.why = r2.why;
                return res;
            } catch (e) {
                log('💥 [TWITTS] runEmergency: ' + e.message, 'ERROR');
                status('TWITTS: error', 'error');
                res.why = e.message;
                return res;
            } finally {
                _running = false;
            }
        },

        /** _clipAtPlayhead: clip de V1 davall del cabezal (null si no n'hi ha). */
        _clipAtPlayhead: async function () {
            var raw = '';
            try { raw = await U().callJSX('Clips.at(' + trackV1() + ', -1, \'video\')'); }
            catch (e) { raw = ''; }
            if (!raw || String(raw) === 'null') return null;
            try { return JSON.parse(String(raw)); } catch (e2) { return null; }
        },

        /**
         * _dialog: navegador NATIU de fitxers a la carpeta de chyrons.
         * Primer es prova `Mapa._askFiles` (valida la carpeta d'arrancada,
         * BUG #196); si no hi és, es crida `cep.fs.showOpenDialog` directament.
         * @returns {Promise<Array<{name:string, full:string}>>}
         */
        _dialog: async function (folder) {
            var M = W.Mapa;
            if (M && typeof M._askFiles === 'function') {
                try { return (await M._askFiles(folder)) || []; } catch (e) { }
            }
            var out = [];
            try {
                if (!(window.cep && window.cep.fs && window.cep.fs.showOpenDialog)) {
                    log('⚠️ [TWITTS] showOpenDialog no disponible', 'WARN');
                    return out;
                }
                var r = window.cep.fs.showOpenDialog(false, false,
                    'TWITTS — tria el movie del tuit', folder || '', VIDEO_EXT);
                if (!r || r.err !== 0 || !r.data || !r.data.length) return out;
                var full = String(r.data[0]);
                out.push({ name: full.replace(/^.*[\\/]/, ''), full: full });
            } catch (e2) { }
            return out;
        }
    };
})();
