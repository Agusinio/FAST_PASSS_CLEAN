/**
 * 18_Portada_Window.js
 * ============================================================================
 * LOGIC: FINESTRA DE CAPTURA DE LA PORTADA (càlcul PUR · BUG #174)
 * ============================================================================
 * La portada (PNG de la capçalera) NO es captura al timeline real: es fa una
 * CÒPIA temporal del clip de V1 a la "zona neta" (més enllà del final del
 * projecte), amb la portada al damunt, i es fotografia allí. Aqueixa còpia
 * necessita:
 *   · un PRE-ROLL (`guard`) ABANS del frame triat → el frame no cau mai al PRIMER
 *     frame del clip (el borde és ambigu: Premiere pot capturar-hi NEGRE);
 *   · una CUA (`tail`) DESPRÉS del frame.
 *
 * ⚠️ REGLA D'OR (2026-10-21 · BUG #174): el frame triat per l'usuari NO ES MOU
 * MAI. Si el clip s'acaba abans que hi haja prou material per a la cua, el que
 * s'escurça és la FINESTRA, no el frame.
 *
 * MESURA DEL DEFECTE (fins al 2026-10-20): quan el cabezal era a menys de
 * `dur + guard` (= 2,08 s) del FINAL del clip, `flow_render` feia
 * `mediaIn = mediaEnd − 2,08` perquè la còpia tinguera prou material → el PNG
 * sortia `2,08 − d` segons ABANS del frame triat (d = distància al final del
 * clip), o siga fins a 52 frames a 25 fps:
 *   d = 2,00 s →   2 frames  («sembla que funciona»)
 *   d = 1,08 s →  25 frames  ← el cas que va reportar l'usuari
 *   d = 0,10 s →  50 frames
 * Amb el frame allunyat del final del clip no passava mai («en ocasions funciona
 * bé»). El desplaçament era SEMPRE cap arrere i mai no donava cap error visible.
 *
 * Aquest mòdul és PUR (sense DOM ni pont): el fa servir `flow_render.js
 * (_runPortadaBody)` i el prova `bin/smoke/fp_probe_portada.js` part E.
 * ============================================================================
 */
(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Logic = FASTPASS_UI.Logic || {};

    /** num: número finit o el valor per defecte (evita NaN/Infinity cap avall). */
    function num(v, def) {
        var n = parseFloat(v);
        return (typeof n === 'number' && isFinite(n)) ? n : def;
    }

    FASTPASS_UI.Logic.PortadaWindow = {

        /**
         * plan: Decideix la FINESTRA de captura de la portada SENSE moure el frame
         * triat. L'únic moviment permès és quan el frame cau FORA del media (el
         * final és exclusiu) i aleshores és el mínim possible (≤ 1 frame).
         *
         * @param {Object} o
         * @param {number} o.mediaIn   - instant del MEDIA del frame triat (s)
         * @param {number} o.mediaEnd  - instant del MEDIA del FINAL del clip (s);
         *                               NaN/Infinity = desconegut → finestra sencera
         * @param {number} [o.dur]     - durada total de la finestra (PORTADA_DUR, 2 s)
         * @param {number} [o.guard]   - pre-roll abans del frame (PORTADA_GUARD, 0,08 s)
         * @param {number} [o.frameSec]- durada d'un frame (FRAME_TOL, 0,04 s a 25 fps)
         * @returns {{mediaIn:number, preRoll:number, tail:number, windowDur:number,
         *            availAfter:number, limited:boolean, preRollLimited:boolean,
         *            movedBy:number, reason:string, warn:string|null}}
         *          · mediaIn  : frame a capturar (només canvia si és fora del media)
         *          · preRoll  : segons de còpia ABANS del frame
         *          · tail     : segons de còpia DESPRÉS del frame (≥ 1 frame)
         *          · windowDur: preRoll + tail = durada de la còpia temporal
         *          · movedBy  : desplaçament aplicat al frame (0 = intacte)
         *          · reason   : 'ok' | 'cua-escurcada' | 'fora-del-media'
         */
        plan: function (o) {
            o = o || {};
            var dur = Math.max(0, num(o.dur, 2));
            var guard = Math.max(0, num(o.guard, 0.08));
            var frameSec = Math.max(0.001, num(o.frameSec, 0.04));
            var mediaEnd = num(o.mediaEnd, NaN);
            var asked = num(o.mediaIn, 0);
            var hasEnd = isFinite(mediaEnd);

            var mediaIn = asked;
            var movedBy = 0;
            var reason = 'ok';
            var notes = [];

            // 1) El frame ha d'existir dins del media (el final és EXCLUSIU): si cau just
            //    al final (o més enllà) s'agafa l'ÚLTIM frame. És l'ÚNIC moviment permès.
            if (hasEnd && mediaIn >= mediaEnd - 1e-6) {
                mediaIn = Math.max(0, mediaEnd - frameSec);
                movedBy = mediaIn - asked;
                reason = 'fora-del-media';
                notes.push('El frame triat (' + asked.toFixed(2) + 's) cau FORA del media (final ' +
                    mediaEnd.toFixed(2) + 's) → s\'agafa l\'últim frame (' + mediaIn.toFixed(2) + 's)');
            }

            // 2) PRE-ROLL: mai més enllà de l'inici del media (no hi ha material abans).
            var preRoll = Math.min(guard, Math.max(0, mediaIn));
            var preRollLimited = preRoll < guard - 1e-9;
            if (preRollLimited && reason === 'ok') {
                notes.push('El frame és al PRIMER frame del media: no hi cap pre-roll de ' +
                    guard.toFixed(2) + 's (la captura pot quedar al borde del clip)');
            }

            // 3) CUA: la demanada, ESCURÇADA al material que queda dins del clip.
            //    Mai per davall d'1 frame: el frame triat ha de quedar DINS de la còpia.
            var tailFull = Math.max(frameSec, dur - guard);
            var tail = tailFull;
            var limited = false;
            if (hasEnd) {
                var avail = mediaEnd - mediaIn;                 // material després del frame
                if (avail < tailFull) {
                    limited = true;
                    tail = Math.max(frameSec, avail);
                    if (reason === 'ok') { reason = 'cua-escurcada'; }
                    notes.push('Finestra ESCURÇADA a ' + (preRoll + tail).toFixed(2) + 's: només queden ' +
                        Math.max(0, avail).toFixed(2) + 's de media després del frame (' +
                        (dur - guard).toFixed(2) + 's demanats) · el FRAME NO es mou');
                }
            }

            return {
                mediaIn: mediaIn,
                preRoll: preRoll,
                tail: tail,
                windowDur: preRoll + tail,
                availAfter: hasEnd ? (mediaEnd - mediaIn) : NaN,
                limited: limited,
                preRollLimited: preRollLimited,
                movedBy: movedBy,
                reason: reason,
                warn: notes.length ? notes.join(' · ') : null
            };
        },

        /**
         * frameError: quant desvia la captura del frame triat (segons i frames).
         * Serveix per als logs i per a les proves: ha de ser 0 sempre que el frame
         * existisca dins del media.
         * @param {Object} plan - resultat de `plan()`
         * @param {number} asked - frame triat original (s)
         * @param {number} [frameSec] - durada d'un frame
         * @returns {{sec:number, frames:number}}
         */
        frameError: function (plan, asked, frameSec) {
            var fs = Math.max(0.001, num(frameSec, 0.04));
            var a = num(asked, 0);
            var m = (plan && isFinite(plan.mediaIn)) ? plan.mediaIn : a;
            var sec = m - a;
            return { sec: sec, frames: Math.round(sec / fs) };
        }
    };
})();
