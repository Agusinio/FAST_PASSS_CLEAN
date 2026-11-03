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
    // BUG #206: helpers de reparació de la pista de grafismes, compartits per
    // `_fixPlacement` i `_restaura` (abans vivien DINS de `_fixPlacement`).
    function key(n) { return String(n || '').toLowerCase().replace(/\.[^.]+$/, ''); }
    function findIn(list, n, s) {
        var k = key(n), best = null, bd = 0.061;
        for (var i = 0; i < (list || []).length; i++) {
            var c = list[i];
            if (!c || key(c.name) !== k) continue;
            var d = Math.abs((Number(c.start) || 0) - (Number(s) || 0));
            if (d <= bd) { bd = d; best = c; }
        }
        return best;
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
            var T = L().TwittsOcr;
            var iguals = (T && typeof T.mateixNom === 'function')
                ? function (a, b) { return T.mateixNom(a, b); }
                : function (a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); };
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                if (!c || !iguals(c.name, name)) continue;
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
            // (2026-10-30) Durada REAL del movie: ffprobe del FICHERO (exacta) i, si no
            // es pot, el DOM del projecte i l'estimació per mida (avisada). Abans es
            // preguntava només al DOM (0 en estos projectes) i s'acabava estirant el
            // tuit més enllà del mèdia (mesurat en viu: 16 frames de més).
            var mediaDur = await this._mediaDur(name, cand.full);
            // 🧊 (2026-10-30 · petició d'usuari) Si el clip de V1 és MÉS LLARG que el
            // movie del tuit, la part viva va a la seua durada REAL i la cua es
            // CONGELA (últim frame estirat) fins al final del clip de V1 — abans es
            // col·locava estirat (Premiere repetia/estirava la imatge sense control).
            var minFreeze = 0.12;
            if (mediaDur > 0.1 && (dur - mediaDur) >= minFreeze) {
                var fz = await this._placeAmbCongelat(cand, clip, mediaDur);
                if (fz.ok) return fz;
                log('⚠️ [TWITTS] «' + String(name).substring(0, 40) + '…» sense congelat: ' +
                    fz.why, 'WARN');
                // Si `_freezeTemaTitol` ja ha inserit el clip viu, NO es torna a
                // inserir (quedaria duplicat): es dóna per col·locat i s'avisa.
                if (fz.placed) return { ok: true, why: '' };
            }
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
         * _snapDur: alinea una durada a la REJILLA DE FRAMES (25 fps, convenció del
         * repo: `TwittsOcr.opts().frameSec = 0.04`), al frame més pròxim.
         *
         * Premiere col·loca el clip a frames sencers: passar-li una durada amb
         * decimals fa que `Clips.endCoherent` arredonisca a un altre frame i el
         * clip viu queda 1 frame estirat o escurçat. Amb la durada ja alineada, el
         * final del clip viu coincidix amb el final del mèdia (ni estira ni talla).
         *
         * @param {number} sec
         * @returns {number} segons alineats a frame
         */
        _snapDur: function (sec) {
            var T = L().TwittsOcr;
            var fr = 0.04;
            try { fr = Number(T.opts({}).frameSec) || 0.04; } catch (eF) { fr = 0.04; }
            var n = Math.round((Number(sec) || 0) / fr);
            if (!(n > 0)) n = 1;
            return Math.round(n * fr * 10000) / 10000;
        },

        /**
         * _mediaDur: durada REAL (s) del movie del tuit — 0 si no es pot resoldre.
         *
         * ── PER QUÈ (2026-10-30 · petició d'usuari) ───────────────────────────────
         * `Project.itemDuration` pot tornar 0 (en estos projectes el DOM no dóna
         * durades de footage: «Bin CHY: N fitxers, 0 amb durada del DOM»), i la 2a
         * xarxa era l'ESTIMACIÓ per mida de fitxer de la TRADUCCIÓ
         * (`Chyrons._tradMediaDur`, calibrada a 45,56 MB/s: els ProRes 422 HQ
         * OPACS del canal). Els movies de tuit són ProRes **amb ALPHA** i una
         * altra taxa → l'estimació sobreestimava ~9 %: mesurat per l'usuari
         * (30/10), la part viva quedava **16 frames més llarga** que el mèdia.
         *
         * ── ORDE DE FONTS (de exacta a aproximada) ────────────────────────────────
         *   1. **ffprobe del FICHERO** (`Logic.FFmpeg.getMediaDuration`, la mateixa
         *      dada que usa `Titol·Petit` per al revers): EXACTA, ±1 frame. És el
         *      que fa servir Premiere al inserir sense `endSec`.
         *   2. `Project.itemDuration` (DOM del projecte).
         *   3. Estimació per mida (`Chyrons._tradMediaDur`) — ÚLTIM recurs, i
         *      s'AVISA al log que és estimada.
         *
         * @param {string} name - Nom del movie al projecte
         * @param {string} [full] - Ruta del fichero (ffprobe). Si falta, s'estima.
         * @returns {Promise<number>} segons alineats a frame, o 0 si no se sap
         */
        _mediaDur: async function (name, full) {
            var short = String(name || '').substring(0, 42);
            var LG = (window.FASTPASS_UI && window.FASTPASS_UI.Logic) ? window.FASTPASS_UI.Logic : null;
            // 1) ffprobe del fitxer: EXACTE.
            var path = String(full || '');
            var ff = (LG && LG.FFmpeg) ? LG.FFmpeg : null;
            if (path && ff && typeof ff.getMediaDuration === 'function') {
                try {
                    var rp = await ff.getMediaDuration(path);
                    if (rp && rp.ok && Number(rp.duration) > 0.05) {
                        var dReal = this._snapDur(Number(rp.duration));
                        log('📏 [XARXES] durada REAL (ffprobe) de «' + short + '…» = ' +
                            Number(rp.duration).toFixed(3) + 's → ' + dReal.toFixed(2) + 's', 'INFO');
                        return dReal;
                    }
                    log('⚠️ [XARXES] ffprobe sense durada de «' + short + '…» (' +
                        String((rp && rp.error) || '?').substring(0, 60) + ')', 'WARN');
                } catch (eP) { /* es prova la resta de xarxes */ }
            } else if (!path) {
                log('⚠️ [XARXES] «' + short + '…» sense ruta de fitxer → la durada s\'haurà d\'estimar',
                    'WARN');
            }
            // 2) DOM del projecte.
            var d = 0;
            try {
                d = Number(await U().callJSX('Project.itemDuration(' + JSON.stringify(name) + ')')) || 0;
            } catch (e1) { d = 0; }
            if (d > 0.1) return this._snapDur(d);
            // 3) Estimació per mida (ÚLTIM recurs, avisada).
            var WF = window.FASTPASS_UI ? window.FASTPASS_UI.Workflows : null;
            var CF = (WF && WF.Chyrons) ? WF.Chyrons : null;
            if (CF && typeof CF._tradMediaDur === 'function') {
                try { d = Number(await CF._tradMediaDur({ name: String(name) }, null)) || 0; }
                catch (e2) { d = 0; }
            }
            if (d > 0.1) {
                var dEst = this._snapDur(d);
                log('📏 [XARXES] durada ESTIMADA per mida de fitxer de «' + short + '…» = ' +
                    dEst.toFixed(2) + 's (ni ffprobe ni el DOM no la donen; pot desviar-se uns ' +
                    'frames)', 'WARN');
                return dEst;
            }
            return 0;
        },

        /**
         * _cobert: fracció [0..1] del tram `start→end` coberta pels clips del nom
         * donat (SUMA de tots: el tuit pot ser part viva + congelat).
         * @param {Array} grafClips - `_grafClips()`
         * @param {string} name
         * @param {number} start
         * @param {number} end
         * @returns {number}
         */
        _cobert: function (grafClips, name, start, end) {
            var list = Array.isArray(grafClips) ? grafClips : [];
            if (!name) return 0;
            var T = L().TwittsOcr;
            var iguals = (T && typeof T.mateixNom === 'function')
                ? function (a, b) { return T.mateixNom(a, b); }
                : function (a, b) { return String(a || '').toLowerCase() === String(b || '').toLowerCase(); };
            var a0 = Number(start) || 0;
            var b0 = Number(end) || 0;
            var dur = Math.max(0.001, b0 - a0);
            var cob = 0;
            for (var i = 0; i < list.length; i++) {
                var c = list[i];
                if (!c || !iguals(c.name, name)) continue;
                var a = Math.max(Number(c.start) || 0, a0);
                var b = Math.min(Number(c.end) || 0, b0);
                if (b > a) cob += (b - a);
            }
            return Math.min(1, cob / dur);
        },

        /**
         * _placeAmbCongelat: col·loca el tuit a la seua durada REAL i CONGELA el
         * seu últim frame fins al final del clip de V1 (petició d'usuari 30/10).
         *
         * Reutilitza la mecànica verificada del Tema-Títol/Traducció
         * (`Chyrons._freezeZone` + `Chyrons._freezeTemaTitol`): zona de programa
         * BUIDA validada (per a l'ALPHA del grafisme) + clip temporal + captura del
         * frame + PNG importat al bin CHY estirat fins a `end`. Zero JSX nou.
         *
         * @param {Object} cand - { name, full? }
         * @param {Object} clip - { start, end, name }
         * @param {number} mediaDur - durada real del movie (s)
         * @returns {Promise<{ok:boolean, placed?:boolean, why:string}>}
         *   · `ok:true` → col·locat i cobrix el clip.
         *   · `ok:false, placed:true` → col·locat (clip viu) però el congelat no ha
         *     cobert el tram: NO s'ha de tornar a inserir.
         *   · `ok:false` sense `placed` → no s'ha inserit res: el cridador pot fer
         *     l'insert de sempre.
         */
        _placeAmbCongelat: async function (cand, clip, mediaDur) {
            var T = L().TwittsOcr;
            var name = String(cand && cand.name);
            var start = Number(clip.start);
            var end = Number(clip.end);
            var freezeSec = Math.max(0, end - start - mediaDur);
            var short = name.substring(0, 42);
            var WF = window.FASTPASS_UI ? window.FASTPASS_UI.Workflows : null;
            var CF = (WF && WF.Chyrons) ? WF.Chyrons : null;
            if (!CF || typeof CF._freezeTemaTitol !== 'function' || typeof CF._freezeZone !== 'function') {
                return { ok: false, why: 'el flux de chyrons no és carregat (no es pot congelar)' };
            }
            var zone = null;
            try { zone = await CF._freezeZone(Math.max(2, mediaDur + 1)); } catch (eZ) { zone = null; }
            if (!zone || !zone.ok) {
                return { ok: false, why: 'no hi ha cap zona de programa BUIDA per capturar el congelat' };
            }
            log('🧊 [XARXES] «' + short + '…» dura ' + mediaDur.toFixed(2) + 's i el clip ' +
                (end - start).toFixed(2) + 's → congelat del final (' + freezeSec.toFixed(2) + 's)', 'INFO');
            // BUG #206: el congelat fa VARIS `Clips.insert` (temporal, clip viu i
            // PNG) i el JSX retalla l'ÚLTIM clip de la pista en cada un → es
            // fotografia la pista abans i es restauren els finals després.
            var before = await this._grafClips();
            var fr = null;
            try {
                fr = await CF._freezeTemaTitol(name, start, end, 'XARXES', {
                    track: trackGraf(),
                    animSec: mediaDur,
                    tempTC: zone.tc,
                    freezeSec: freezeSec,
                    frameMid: true,
                    alpha: true,
                    zoneOk: true
                });
            } catch (eF) { fr = null; }
            if (!fr || !fr.success) return { ok: false, why: 'el clip viu no s\'ha pogut inserir' };
            // 🧷 GUARDA (2026-10-30): la part VIVA no pot passar-se del seu mèdia. Abans
            // eixa comprovació no existia i, amb una durada ESTIMADA (mida de fitxer),
            // la part viva quedava 16 frames més llarga que el movie. Ara la durada és
            // exacta (ffprobe) i ací es MESURA el que ha quedat a la pista per a deixar
            // constància (no es retalla: el PNG del congelat ja arrenca on acaba el clip
            // viu; retallar-lo deixaria un forat sense imatge).
            try {
                var viu = findIn(await this._grafClips(), name, start);
                if (viu) {
                    var endViu = Number(viu.end) || 0;
                    var endTeoric = start + mediaDur;
                    var desvF = Math.round((endViu - endTeoric) / 0.04);
                    if (Math.abs(endViu - endTeoric) > 0.041) {
                        log('🧷 [XARXES] part viva «' + short + '…» acaba a ' + endViu.toFixed(2) +
                            's i el mèdia a ' + endTeoric.toFixed(2) + 's (' + (desvF > 0 ? '+' : '') +
                            desvF + ' frame/s → el congelat ho absorbix)', 'WARN');
                    } else {
                        log('🧷 [XARXES] part viva «' + short + '…» exacta: ' + mediaDur.toFixed(2) +
                            's (final al mèdia, ' + (desvF > 0 ? '+' : '') + desvF + ' frame/s)', 'INFO');
                    }
                }
            } catch (eViu) { }
            var notes = [];
            var rest = await this._restaura(before, name, start, notes);
            if (rest) {
                log('↩️ [XARXES] ' + rest + ' clip(s) de V' + trackGraf() +
                    ' restaurat(s) al final que tenien', 'INFO');
            }
            if (notes.length) log('⚠️ [XARXES] reparació de V' + trackGraf() + ': ' + notes.join(' · '), 'WARN');
            var cob = this._cobert(await this._grafClips(), name, start, end);
            if (cob < 0.95) {
                log('⚠️ [XARXES] «' + short + '…» col·locat però només cobrix el ' +
                    (cob * 100).toFixed(0) + ' % del clip de V' + trackV1() + ' (' +
                    T.tcStr(start) + '→' + T.tcStr(end) + ')', 'WARN');
                return { ok: false, placed: true, why: 'el congelat no cobrix tot el clip' };
            }
            log('✅ [XARXES] col·locat «' + short + '…» a V' + trackGraf() + ' ' +
                T.tcStr(start) + '→' + T.tcStr(end) + ' (viu ' + mediaDur.toFixed(2) +
                's + congelat ' + freezeSec.toFixed(2) + 's)', 'INFO');
            return { ok: true, why: '' };
        },

        /**
         * _restaura: torna al FINAL que tenien els clips de la pista de grafismes
         * que `Clips.insert` (JSX) haja pogut retallar.
         *
         * BUG #206: l'insert retalla `clips[numItems-1]`, és a dir l'ÚLTIM clip de
         * la pista i NO el que s'acaba d'inserir. Es fotografia la pista ABANS i
         * ací es repararen els finals.
         *
         * @param {Array} before - `_grafClips()` llegit ABANS de la inserció
         * @param {string} name - nom inserit (se salten els clips propis a `s0`)
         * @param {number} s0 - inici on s'ha inserit (s)
         * @param {Array} notes - acumulador de notes per al log del cridador
         * @returns {Promise<number>} quants clips s'han restaurat
         */
        _restaura: async function (before, name, s0, notes) {
            var u = U();
            var t = trackGraf();
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
            return rest;
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
            var rest = await this._restaura(before, name, s0, notes);
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
         * runAuto: PASSADA AUTOMÀTICA dels grafismes que es localitzen a la
         * IMATGE. Es dispara al final de la col·locació de chyrons (🎯 COLOCAR,
         * `runPlaceAllChyrons` a `js/main.js`).
         *
         * ── ÀRBRE (petició d'usuari, 30/10/2026 · D24/D25) ─────────────────
         *   Hi ha cap CONVERSA / XARXES-TEXT al BIN?
         *     NO → res a fer.
         *     SÍ → per a cada ítem que NO és al timeline:
         *       · amb bloc i TC de fiar → es col·loca pel TC, com qualsevol
         *                                 wott (`_placeByTc`)
         *       · amb bloc, sense TC    → OCR dels clips del timeline
         *                                 (`_scanTimeline`)
         *       · sense bloc (és V)     → rastreig de GRIS del bloc amb ffmpeg
         *                                 → OCR dels clips amb la placa
         *                                 → emparellament pel nom (`_rastreigBloc`)
         *   El que no casa queda PENDENT (log + `status` groc) i es resol amb
         *   Ctrl+clic 🎯 (`runGris`).
         *
         * @returns {Promise<{ok:boolean, placed:number, pendents:number, why:string}>}
         */
        runAuto: async function () {
            var res = { ok: false, placed: 0, pendents: 0, why: '' };
            if (_running) { log('⏭️ [XARXES] ja hi ha una passada en marxa', 'WARN'); res.why = 'ocupat'; return res; }
            _running = true;
            log('▶️ [XARXES] passada automàtica (final de la col·locació de chyrons)', 'INFO');
            try {
                var T = L().TwittsOcr;
                var c = T.opts({});

                // ── 1. CONVERSA / XARXES-TEXT al BIN? ────────────────────────
                var placedNames = await T.placedNames();
                var it = await T.ocrItems({ placed: placedNames });
                if (!it.ok) {
                    res.why = it.why;
                    log('⚠️ [XARXES] no s\'ha pogut llegir el BIN del projecte: ' + it.why, 'WARN');
                    return res;
                }
                if (!it.files.length) {
                    log('➖ [XARXES] cap ítem CONVERSA/XARXES-TEXT al BIN → res a fer', 'INFO');
                    res.ok = true; return res;
                }
                if (!it.pendents.length) {
                    log('➖ [XARXES] els ' + it.files.length +
                        ' ítem(s) CONVERSA/XARXES-TEXT ja són al timeline', 'INFO');
                    res.ok = true; return res;
                }
                // ── 2. Classificar pel nom: TC de fiar / bloc sense TC / és V ──
                var directes = [], ambBloc = [], esV = [];
                for (var i = 0; i < it.pendents.length; i++) {
                    var f = it.pendents[i];
                    var inf = f.info || {};
                    if (inf.teBloc && inf.tcFiable) directes.push(f);
                    else if (inf.teBloc) ambBloc.push(f);
                    else esV.push(f);
                }
                log('🧭 [XARXES] ' + it.pendents.length + '/' + it.files.length +
                    ' per col·locar · ' + directes.length + ' amb TC (directe) · ' +
                    ambBloc.length + ' amb bloc sense TC (gris+OCR) · ' +
                    esV.length + ' sense bloc «V» (gris+OCR)', 'INFO');
                status('XARXES: ' + it.pendents.length + ' per col·locar', 'warn');

                var fet = { placed: 0, pendents: 0 };

                // ── 3. Amb TC → igual que qualsevol wott ─────────────────────
                if (directes.length) await this._placeByTc(directes, fet);

                // ── 4. Amb bloc sense TC i sense bloc «V» → GRIS primer (ffmpeg) ─────
                // (2026-10-30 · petició d'usuari) ABANS, els «amb bloc» anaven directes
                // a l'OCR de TOTS els clips lliures: un PNG exportat + un OCR per clip
                // (17 clips → 17 PNG + 17 tesseract) per a un sol tuit. Ara es mesura
                // PRIMER la placa grisa amb ffmpeg (`GrafZonaGris`: 1 crida per clip,
                // 3 frames de 64x64, cap PNG) i només s'exporta el frame dels clips que
                // la tenen → cas real TNV V1 30/10: **1 PNG en compte de 17**. Si el
                // gris no decidix, `_rastreigBloc` fa l'OCR de reserva de la resta
                // (comportament antic: mai es perd un tuit per no vore la placa).
                var perRastrejar = ambBloc.concat(esV);
                if (perRastrejar.length) {
                    await this._rastreigBloc(perRastrejar, it.paths, c, fet, true);
                }

                var col = fet.placed, pend = fet.pendents;
                res.ok = true; res.placed = col; res.pendents = pend;
                log('🏁 [XARXES] ' + col + ' col·locat(s) · ' + pend + ' pendent(s) · ' +
                    (it.pendents.length - col) + ' ítem(s) sense col·locar', col ? 'INFO' : 'WARN');
                status('XARXES: ' + col + ' col·locat(s)' + (pend ? ' · ' + pend + ' pendent(s)' : ''),
                    col ? 'exito' : 'warn');
                if (pend || col < it.pendents.length) {
                    log('ℹ️ [XARXES] per als que queden: Ctrl+clic a la DIANA 🎯 ' +
                        '(rastreig de gris; si no, finestra de selecció del grafisme)', 'INFO');
                }
                return res;
            } catch (e) {
                res.why = e.message;
                log('💥 [XARXES] runAuto: ' + e.message, 'ERROR');
                return res;
            } finally {
                _running = false;
            }
        },

        /**
         * _clipsLliures: clips de V1 que poden portar un tuit cremat: durada
         * mínima (`minDur`, D14) i CAP grafisme de tuit damunt (`_covered`).
         * @param {Object} [c] - recepta de TwittsOcr (`opts`)
         * @returns {Promise<Array>} clips de `Clips.getTrackClips`
         */
        _clipsLliures: async function (c) {
            var T = L().TwittsOcr;
            var cfg = c || T.opts({});
            var v1 = [];
            try { v1 = await L().Clips.getTrackClips(trackV1(), 'video'); } catch (eV) { v1 = []; }
            var graf = await this._grafClips();
            var out = [];
            for (var i = 0; i < (v1 || []).length; i++) {
                var cl = v1[i];
                if (!cl) continue;
                if ((Number(cl.end) - Number(cl.start)) < cfg.minDur) continue;
                if (this._covered(graf, cl)) continue;
                out.push(cl);
            }
            log('🔎 [XARXES] clips de V' + trackV1() + ': ' + (v1 || []).length +
                ' · lliures (≥' + cfg.minDur + 's i sense grafisme): ' + out.length, 'INFO');
            return out;
        },

        /**
         * _placeByTc: col·loca els ítems que porten TC de fiar (D24) pel TC del
         * nom, **igual que qualsevol wott**: de l'instant del TC fins al final
         * natural del mèdia, a la pista de grafismes.
         * @param {Array}  cands - de `ocrItems().pendents` amb `info.tc`
         * @param {Object} acc   - comptadors { placed, pendents }
         */
        _placeByTc: async function (cands, acc) {
            var T = L().TwittsOcr;
            var a = acc || { placed: 0, pendents: 0 };
            var list = Array.isArray(cands) ? cands : [];
            var graf = await this._grafClips();
            for (var i = 0; i < list.length; i++) {
                var f = list[i];
                if (!f || !f.name) continue;
                var tc = String((f.info || {}).tc || '');
                var sec = T.tcToSec(tc);
                var dur = Number(f.dur) || 0;
                if (!(dur > 0)) {
                    // (2026-10-30) Si el DOM no dóna durada, s'usa la del MEDI (ffprobe):
                    // abans es deixava en 1 s i el tuit es col·locava tallat a 1 s.
                    try { dur = await this._mediaDur(f.name, f.full); } catch (eD) { dur = 0; }
                }
                if (!(dur > 0)) dur = 1;
                if (this._isPlaced(graf, f.name, sec, sec + dur)) {
                    a.pendents = (a.pendents || 0) + 1;
                    log('🛡️ [XARXES] «' + String(f.name).substring(0, 50) +
                        '…» ja és a V' + trackGraf() + ' al TC ' + tc + ' → no es duplica', 'INFO');
                    continue;
                }
                var r = await this._place(f, { start: sec, end: sec + dur, name: 'TC ' + tc });
                if (!r.ok) {
                    a.pendents = (a.pendents || 0) + 1;
                    log('❌ [XARXES] TC ' + tc + ': ' + r.why, 'ERROR');
                    continue;
                }
                a.placed = (a.placed || 0) + 1;
            }
            return a;
        },

        /**
         * _scanTimeline: UN frame per clip (D1/D2) → OCR → emparellament pel
         * nom amb els movies que falten (D13) → col·locació sobre el clip on ha
         * casat (D15). La col·locació que funciona es memoritza (D10) i el
         * movie ix del pòsit.
         * @param {Array}  clips - clips (ja filtrats) on buscar
         * @param {Array}  cands - movies pendents (`ocrItems().pendents`)
         * @param {Object} paths - nom → ruta del media (ffmpeg)
         * @param {Object} acc   - comptadors { placed, pendents }
         */
        _scanTimeline: async function (clips, cands, paths, acc) {
            var T = L().TwittsOcr;
            var a = acc || { placed: 0, pendents: 0 };
            var falten = (Array.isArray(cands) ? cands : []).slice();
            if (!falten.length || !(clips || []).length) return a;
            var c = T.opts({});
            var self = this;
            var col = 0, pend = 0;
            await T.scanClips(clips, falten, c, {
                paths: paths || null,
                onHit: async function (e) {
                    if (!e.tria) {
                        pend++;
                        log('⚠️ [XARXES] ' + T.tcStr(e.clip.start) + ' tuit @' + (e.handle || '—') +
                            ' SENSE movie clar (millor ' + e.score + ') → queda PENDENT', 'WARN');
                        return true;
                    }
                    var r = await self._place({
                        name: e.tria.name,
                        // (2026-10-30) Ruta del FICHERO per a ffprobe: si el candidat no la
                        // porta, es pren del mapa `paths` (nom → ruta) del mateix scan.
                        full: e.tria.full || (paths && paths[e.tria.name]) || ''
                    }, e.clip);
                    if (!r.ok) {
                        pend++;
                        log('❌ [XARXES] ' + T.tcStr(e.clip.start) + ': ' + r.why, 'ERROR');
                        return true;
                    }
                    col++;
                    // D10: la tria que ha funcionat es memoritza (si no venia ja
                    // de la caché) → la pròxima volta casa sense puntuar.
                    if (!e.apres) { try { T.learn(e.text, e.tria); } catch (eL) { } }
                    for (var k = 0; k < falten.length; k++) {
                        if (falten[k].name === e.tria.name) { falten.splice(k, 1); break; }
                    }
                    // Sense movies per col·locar, no es gasta cap OCR més.
                    return falten.length > 0;
                }
            });
            a.placed = (a.placed || 0) + col;
            a.pendents = (a.pendents || 0) + pend;
            return a;
        },

        /**
         * _rastreigBloc: (D26) rastreig de GRIS del bloc amb ffmpeg.
         *
         * Els ítems sense bloc (és V) NO porten TC ni línia d'escaleta: l'única
         * manera de saber on van és BUSCAR LA FIRMA VISUAL del tuit cremat (la
         * placa grisa de la franja inferior, `Logic.GrafZonaGris`) en els clips
         * de V1 del bloc. Els que la tenen es passen a l'OCR (`_scanTimeline`),
         * que emparella el text de la imatge amb el NOM del movie del BIN.
         *
         * @param {Array}  cands - movies pendents
         * @param {Object} paths - nom → ruta del media
         * @param {Object} c     - recepta de TwittsOcr (`minDur`, `maxClips`…)
         * @param {Object} acc   - comptadors { placed, pendents }
         * @param {boolean} [fallback] - (2026-10-30) `true` = si la placa grisa no
         *   decidix (cap clip la té, o cap tuit s'hi ha col·locat), es fa l'OCR de
         *   RESERVA dels clips sense placa, com es feia abans de filtrar pel gris.
         *   El 🎯 (`runGris`) no el passa: allà el gris és el criteri de l'usuari.
         */
        _rastreigBloc: async function (cands, paths, c, acc, fallback) {
            var T = L().TwittsOcr;
            var G = L().GrafZonaGris;
            var a = acc || { placed: 0, pendents: 0 };
            var lliures = await this._clipsLliures(c);
            if (!lliures.length) {
                log('➖ [XARXES] cap clip de V' + trackV1() + ' lliure per al rastreig de gris', 'INFO');
                return a;
            }
            if (!G || typeof G.detect !== 'function') {
                log('⚠️ [XARXES] Logic.GrafZonaGris no disponible → no es pot rastrejar el ' +
                    'gris (es fa OCR de tots els clips lliures)', 'WARN');
                return this._scanTimeline(lliures, cands, paths, a);
            }
            var grisos = [], senseRuta = 0;
            // ⏳ (2026-11-02 · #219) TESTIMONI DEL RASTREIG: `GrafZonaGris.detect` és UNA
            // crida de ffmpeg per clip i pot dur desenes de segons; el detall de cada clip
            // va a nivell DEBUG, així que a ull d'usuari el panell semblava penjat. Es diu
            // QUÈ s'està fent i quants clips falten, i el rellotge d'arena del 🎯
            // (`markBtnBusy`, js/main.js) seguix girant mentres dura.
            log('⏳ [XARXES] rastreig de gris amb ffmpeg: ' + lliures.length + ' clip(s) de V' +
                trackV1() + ' → 1 mesura per clip (pot tardar; no cal tocar res)', 'INFO');
            status('XARXES: rastrejant el gris (' + lliures.length + ' clip(s))…', 'warn');
            for (var i = 0; i < lliures.length; i++) {
                var cl = lliures[i];
                var ruta = T.pathOf(paths, cl.name);
                if (!ruta) { senseRuta++; continue; }
                // El tuit ja està muntat a partir de l'1,40 s del clip (D2).
                var t0 = T.srcTime(cl, Number(cl.start) + 1.4);
                var det = null;
                try {
                    det = await G.detect(ruta, { tStart: t0, tDur: 2, fps: 1, force: true });
                } catch (eG) { det = null; }
                if (det && det.ok && det.hasGrey) {
                    grisos.push(cl);
                    log('🎨 [XARXES] ' + T.tcStr(cl.start) + ' «' +
                        String(cl.name || '').substring(0, 40) + '» TÉ placa grisa (' +
                        (det.cov === null ? '?' : Number(det.cov).toFixed(1)) + ' %)', 'INFO');
                } else if (det && det.ok === false) {
                    log('⚠️ [XARXES] no s\'ha pogut mesurar el gris de «' +
                        String(cl.name || '').substring(0, 40) + '»: ' + (det.err || '?'), 'WARN');
                }
            }
            if (senseRuta) {
                log('⚠️ [XARXES] ' + senseRuta + ' clip(s) sense ruta de media coneguda → ' +
                    'no es poden mesurar', 'WARN');
            }
            if (!grisos.length) {
                log('➖ [XARXES] cap clip amb placa grisa a V' + trackV1(), 'INFO');
                if (fallback === true) {
                    log('↩️ [XARXES] sense placa grisa → OCR de reserva dels ' +
                        lliures.length + ' clip(s) lliures (1 PNG per clip)', 'WARN');
                    return this._scanTimeline(lliures, cands, paths, a);
                }
                return a;
            }
            log('🔎 [XARXES] ' + grisos.length + ' clip(s) amb placa grisa → OCR i ' +
                'emparellament pel nom amb el BIN', 'INFO');
            var abans = Number(a.placed) || 0;
            a = await this._scanTimeline(grisos, cands, paths, a);
            // XARXA (2026-10-30): si la placa NO ha resolt cap tuit, el tuit pot ser
            // en un clip que no dona gris (fons clar, placa tapada…) → es fa l'OCR
            // de reserva NOMÉS de la resta. Sense això, filtrar pel gris podria
            // deixar el tuit pendent per sempre.
            if (fallback === true && (Number(a.placed) || 0) === abans) {
                var resta = [];
                for (var j = 0; j < lliures.length; j++) {
                    if (grisos.indexOf(lliures[j]) === -1) resta.push(lliures[j]);
                }
                if (resta.length) {
                    log('↩️ [XARXES] la placa grisa no ha resolt cap tuit → OCR de reserva ' +
                        'dels ' + resta.length + ' clip(s) sense placa (1 PNG per clip)', 'WARN');
                    a = await this._scanTimeline(resta, cands, paths, a);
                }
            }
            return a;
        },

        /**
         * runGris: Ctrl+clic a la DIANA 🎯 (D26).
         *   1. Rastreig de GRIS del bloc (`_rastreigBloc`) amb els ítems
         *      CONVERSA/XARXES-TEXT que falten del BIN.
         *   2. Si el clip del cabezal continua sense grafisme → `runEmergency`
         *      (OCR del clip i, si no decidix, la FINESTRA DE SELECCIÓ del
         *      grafisme a importar), que el col·loca sobre eixe clip.
         *
         * @returns {Promise<{ok:boolean, placed?:number, pendents?:number, why?:string}>}
         */
        runGris: async function () {
            var res = { ok: false, placed: 0, pendents: 0, why: '' };
            if (_running) {
                log('⏭️ [XARXES] ja hi ha una passada en marxa', 'WARN');
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
                    log('⚠️ [XARXES] cap clip de V' + trackV1() + ' davall del cabezal', 'WARN');
                    status('XARXES: cap clip', 'error');
                    res.why = 'cap clip';
                    return res;
                }
                log('🎨 [XARXES] rastreig de gris (Ctrl+🎯) des de ' +
                    T.tcStr(clip.start) + ' → ' + T.tcStr(clip.end), 'INFO');
                var placed = await T.placedNames();
                var it = await T.ocrItems({ placed: placed });
                if (it.ok && it.pendents.length) {
                    await this._rastreigBloc(it.pendents, it.paths, T.opts({}), res);
                } else if (it.ok) {
                    log('➖ [XARXES] cap ítem CONVERSA/XARXES-TEXT sense col·locar → ' +
                        'no cal rastreig', 'INFO');
                }
                // El clip del cabezal, ja té grafisme?
                if (this._covered(await this._grafClips(), clip)) {
                    log('✅ [XARXES] el clip del cabezal ja té grafisme (' +
                        (res.placed || 0) + ' col·locat(s) en esta passada)', 'INFO');
                    status('XARXES: ' + (res.placed || 0) + ' col·locat(s)', 'exito');
                    res.ok = true;
                    return res;
                }
                log('🆘 [XARXES] el clip del cabezal continua sense grafisme → ' +
                    'finestra de selecció del grafisme', 'WARN');
            } catch (e) {
                log('💥 [XARXES] runGris: ' + e.message, 'ERROR');
                status('XARXES: error', 'error');
                res.why = e.message;
                return res;
            } finally {
                _running = false;
            }
            // 2. Finestra de selecció / OCR del clip del cabezal (D9).
            return this.runEmergency();
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
         * _ymdToMs: (PURA) 'YYYYMMDD' (o 'YYYY_MM_DD') → ms a mitjanit LOCAL.
         * null si no és una data.
         */
        _ymdToMs: function (v) {
            var s = String(v == null ? '' : v).replace(/[_\-\/\s]/g, '');
            if (!/^\d{8}$/.test(s)) return null;
            var y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
            if (m < 1 || m > 12 || d < 1 || d > 31) return null;
            var t = new Date(y, m - 1, d).getTime();
            return isNaN(t) ? null : t;
        },

        /**
         * _diesEntre: (PURA) dies de diferència (`b` − `a`) entre dos 'YYYYMMDD'.
         * null si alguna de les dos no és una data.
         * (2026-11-03 · BUG #232) Servix per a decidir si un movie és «del dia»
         * de la data de treball o d'un dia VEÍ (la finestra del Ctrl+🎯 ha de
         * ser congruent amb la data que ensenya a la capçalera).
         */
        _diesEntre: function (a, b) {
            var d1 = this._ymdToMs(a), d2 = this._ymdToMs(b);
            if (d1 === null || d2 === null) return null;
            return Math.round((d2 - d1) / 86400000);
        },

        /**
         * _dayMovies: els `.mov` de TUIT (XARXES) de la CARPETA DEL DIA DEL
         * PROJECTE (29/10: la finestra d'emergència ja no ensenya la carpeta
         * sencera).
         *
         * (2026-11-03 · BUG #232) CONGRUÈNCIA DATA ↔ CONTINGUT:
         *   · la data de cada movie es decidix pel NOM (`Scan._fileDateYYYYMMDD`
         *     → `_extractDateFromFileName`: el MATEIX criteri que
         *     `filterByWorkDate` a tota l'extensió) i només si el nom no en duu
         *     cap, pel stat del fitxer (`_dateWotts`). Abans només es mirava el
         *     stat: un mateix fitxer podia ser «del dia» al scanner i «d'un
         *     altre dia» en esta finestra (dos criteris, dos resultats).
         *   · la cua de reserva (`other`) es limita als **dies veïns** de la data
         *     de treball (± 1 dia): l'export de les 00:30 que la regla nocturna
         *     deixa al dia anterior i el reexportat de matinada (D23). La resta
         *     va a `far` (només al disc, per la finestra de «Buscar al disc…»):
         *     així la llista mai no barreja dies llunys amb la data de la
         *     capçalera.
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
            var out = { ok: false, files: [], other: [], far: 0, day: String(dateDir || ''), why: '' };
            var T = L().TwittsOcr;
            var S = L().Scan;
            if (!T || typeof T.esOcrItem !== 'function') { out.why = 'sense Logic.TwittsOcr'; return out; }
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
                    if (!T.esOcrItem(n)) continue;
                    movs.push(n);
                }
                // ── 2. Datació: caché del Scanner + només els que falten.
                var dates = {};
                try {
                    if (typeof S._loadDateCache === 'function') S._loadDateCache();
                    dates = S._wottDateCache || {};
                } catch (eD) { dates = {}; }
                // (2026-11-03 · #232) El NOM mana: si el fitxer duu la data al
                // nom (`…_20261102_…`), eixa és la seua data i NO es pregunta al
                // NAS. El stat (`_dateWotts`) queda només per als noms sense data
                // — així el criteri és el mateix que `Scan.filterByWorkDate`.
                var nameDate = {};
                var pend = [];
                for (var j = 0; j < movs.length; j++) {
                    var kj = String(movs[j]).toUpperCase();
                    var dNom = null;
                    try {
                        dNom = (typeof S._fileDateYYYYMMDD === 'function')
                            ? S._fileDateYYYYMMDD({ name: movs[j] }) : null;
                    } catch (eFN) { dNom = null; }
                    if (dNom && typeof S._validDate8 === 'function' && !S._validDate8(dNom)) dNom = null;
                    if (dNom) nameDate[kj] = dNom;
                    else if (!dates[kj]) pend.push(movs[j]);
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
                // fitxer que no es pot datar NO entra a «del dia»). A `other`
                // només entren els DIES VEÏNS (± 1: export de les 00:30 deixat
                // al dia anterior per la regla nocturna i reexportat de matinada
                // — D23); la resta ES COMPTA a `far` i no es mostra, perquè la
                // capçalera de la finestra diu una única data.
                for (var k = 0; k < movs.length; k++) {
                    var kk = String(movs[k]).toUpperCase();
                    var d8 = nameDate[kk] || dates[kk];
                    var it = { name: movs[k], full: base + movs[k], d8: String(d8 || '') };
                    if (String(d8 || '') === target) { out.files.push(it); continue; }
                    var dif = d8 ? this._diesEntre(d8, target) : null;
                    if (dif !== null && Math.abs(dif) <= 1) { out.other.push(it); continue; }
                    out.far++;
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
                        // (03/11 · #232) Mateixa regla: a la cua només els dies
                        // veïns de la data de treball.
                        var d8b = null;
                        try { d8b = S._fileDateYYYYMMDD(oth[q2]); } catch (eF2) { d8b = null; }
                        var difB = d8b ? this._diesEntre(d8b, target) : null;
                        if (difB === null || Math.abs(difB) > 1) { out.far++; continue; }
                        out.other.push({
                            name: oth[q2].name, full: base + oth[q2].name, d8: String(d8b)
                        });
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
                                ' ni dels seus dies veïns.' +
                                " Pots buscar-lo al disc (movie d'un altre dia, reexportat…).");
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
         *      pendents que ja són al projecte + una cua dels seus DIES VEÏNS
         *      (± 1: un tuit exportat a les 00:30 cau al dia anterior — D23).
         *      (2026-11-03 · #232) La capçalera diu la DATA del projecte i el
         *      contingut ha de ser congruent: res d'altres dies dins la llista
         *      (per a això està «Buscar al disc…»).
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

                // ── 1. Match automàtic (1 frame + OCR) amb els que falten (D24).
                var pend = [];
                var fl = null;
                try {
                    var placed = await T.placedNames();
                    fl = await T.ocrItems({ placed: placed });
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
                        var r1 = await this._place({
                            name: oc.best.name,
                            // (2026-10-30) Ruta del fichero (ffprobe) si el match no la porta.
                            full: oc.best.full || (fl && fl.paths && fl.paths[oc.best.name]) || ''
                        }, clip);
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
                    (day || '?') + ' · ' + altres.length + ' de dies veïns' +
                    (dm.far ? ' · ' + dm.far + " d'altres dies només al disc" : '') +
                    (dm.why ? ' · ' + dm.why : '') + ')', 'INFO');

                var sub = 'OCR: «' +
                    String((oc && oc.text) || '(sense text)').replace(/\s+/g, ' ').substring(0, 90) + '»' +
                    (oc && oc.best ? ' · millor candidat ' + oc.score + ' punts' : '');
                // (03/11 · #232) RECOMPTE VISIBLE: la capçalera diu UNA data i
                // ací s'explica d'on ix cada movie (cap barreja silenciosa).
                sub += ' · ' + items.length + ' movie(s): ' +
                    (dm.files || []).length + ' del dia ' + (day || '?') + ' · ' +
                    pend.length + ' al projecte · ' + altres.length + ' de dies veïns' +
                    (dm.far ? ' (' + dm.far + " d'altres dies fora de la finestra)" : '');
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
