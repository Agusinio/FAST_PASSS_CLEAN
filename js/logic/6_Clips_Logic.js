/** Logic_Clips.js
 * ============================================================================
 * LOGIC: CLIPS (Orquestació de talls i Ripple Editing) - v2.5.2 literal
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Logic = FASTPASS_UI.Logic || {};

    const utils = {
        callJSX: (s) => window.FASTPASS_UI.Utils.callJSX(s),
        log: (m) => window.FASTPASS_UI.Utils.log(m, "DEBUG"),
        // (2026-10-16) Nivell WARN per a les xarxes de seguretat d'`endCoherent`.
        warn: (m) => window.FASTPASS_UI.Utils.log(m, "WARN")
    };

    FASTPASS_UI.Logic.Clips = {

        /**
         * at: Troba el clip en una pista a un temps determinat (Bridge a JSX).
         */
        at: async function (trackIdx, timeSec, type) {
            console.log('[ClipsLogic.at]', trackIdx, timeSec, type);
            const dataRaw = await utils.callJSX(`Clips.at(${trackIdx}, ${timeSec}, '${type || "video"}')`);
            console.log('[ClipsLogic.at] raw:', dataRaw);
            if (!dataRaw || dataRaw === "null") return null;
            return JSON.parse(dataRaw);
        },

        /**
         * rippleIn: Ajusta l'entrada d'un clip (inPoint) i el mou a zero.
         */
        rippleIn: async function (trackIdx, clipIdx, cutTime, clipData) {
            const diff = parseFloat(cutTime) - clipData.start;
            if (diff <= 0.01) return "NO_DIFF";

            const newIn = clipData.inPoint + diff;
            //utils.log(`[rippleIn] diff=${diff}, newIn=${newIn}, clipData.start=${clipData.start}, clipData.inPoint=${clipData.inPoint}`);

            // 1. Ajustar Clip Principal (Video)
            //utils.log(`[rippleIn] Llamando Clips.inPoint(${trackIdx}, ${clipIdx}, ${newIn}, 'video')`);
            const resInPoint = await utils.callJSX(`Clips.inPoint(${trackIdx}, ${clipIdx}, ${newIn}, 'video')`);
            //utils.log(`[rippleIn] Resultado inPoint: ${resInPoint}`);
            //utils.log(`[rippleIn] Llamando Clips.start(${trackIdx}, ${clipIdx}, 0, 'video')`);
            const resStart = await utils.callJSX(`Clips.start(${trackIdx}, ${clipIdx}, 0, 'video')`);
            //utils.log(`[rippleIn] Resultado start: ${resStart}`);
            // Ajustar el end del clip para reflejar el nuevo inPoint (ripple trim)
            const newEnd = clipData.end - diff;
            //utils.log(`[rippleIn] Llamando Clips.end(${trackIdx}, ${clipIdx}, ${newEnd}, 'video')`);
            const resEnd = await utils.callJSX(`Clips.end(${trackIdx}, ${clipIdx}, ${newEnd}, 'video')`);
            //utils.log(`[rippleIn] Resultado end: ${resEnd}`);

            // 2. Ajustar Audio sincronitzat (A1)
            const audioClip = await this.at(trackIdx, cutTime, "audio");
            if (audioClip) {
                const audioDiff = parseFloat(cutTime) - audioClip.start;
                const newAudioIn = audioClip.inPoint + audioDiff;
                //utils.log(`[rippleIn] Ajustando audio clip ${audioClip.index}, newAudioIn=${newAudioIn}`);
                await utils.callJSX(`Clips.inPoint(${trackIdx}, ${audioClip.index}, ${newAudioIn}, 'audio')`);
                await utils.callJSX(`Clips.start(${trackIdx}, ${audioClip.index}, 0, 'audio')`);
                // Ajustar end del audio
                const audioEnd = audioClip.end - audioDiff;
                await utils.callJSX(`Clips.end(${trackIdx}, ${audioClip.index}, ${audioEnd}, 'audio')`);
            }

            utils.log(`[rippleIn] Trim completado`);
            return "OK_RIPPLE_IN";
        },

        /**
         * rippleOut: Neteja un track eliminant clips a partir d'un temps (Outer trim).
         */
        rippleOut: async function (trackIdx, timeSec, type, extendToTarget = false) {
            const countStr = await utils.callJSX(`Clips.count(${trackIdx}, '${type || "video"}')`);
            const count = parseInt(countStr || 0);
            if (count === 0) return "EMPTY";

            let removed = 0;
            const target = parseFloat(timeSec);
            let lastClipValid = null;

            for (let i = count - 1; i >= 0; i--) {
                const dataRaw = await utils.callJSX(`Clips.get(${trackIdx}, ${i}, '${type}')`);
                if (!dataRaw || dataRaw === "null") continue;

                const clip = JSON.parse(dataRaw);

                // 1. Clips que s'han de treure (Post-target)
                if (clip.start >= target - 0.01) {
                    await utils.callJSX(`Clips.remove(${trackIdx}, ${i}, '${type}')`);
                    removed++;
                }
                // 2. Clips que s'han de retallar (Straddling target)
                else if (clip.start < target && clip.end > target + 0.01) {
                    await utils.callJSX(`Clips.end(${trackIdx}, ${i}, ${target}, '${type}')`);
                }
                // 3. Captura per extreure si cal
                else if (extendToTarget && clip.end < target - 0.01) {
                    if (!lastClipValid || clip.end > lastClipValid.end) {
                        lastClipValid = { index: i, end: clip.end };
                    }
                }
            }

            if (extendToTarget && lastClipValid) {
                await utils.callJSX(`Clips.end(${trackIdx}, ${lastClipValid.index}, ${target}, '${type}')`);
            }

            return "OK_RIPPLE_OUT_" + removed;
        },

        /**
         * rippleAllOut: Purga massiva de pistes després d'un tall.
         */
        rippleAllOut: async function (timeSec, videoTracks = [1], audioTracks = [], extend = false) {
            let total = 0;
            for (let v of videoTracks) {
                const res = await this.rippleOut(v, timeSec, "video", extend);
                if (res.startsWith("OK_RIPPLE_OUT_")) {
                    total += parseInt(res.replace("OK_RIPPLE_OUT_", "") || 0);
                }
                // Si es "EMPTY" o otro, se ignora
            }
            for (let a of audioTracks) {
                const res = await this.rippleOut(a, timeSec, "audio", extend);
                if (res.startsWith("OK_RIPPLE_OUT_")) {
                    total += parseInt(res.replace("OK_RIPPLE_OUT_", "") || 0);
                }
            }
            return total;
        },
        
        /**
         * clearMultipleTracksAfter: Elimina clips después de un tiempo en múltiples pistas, excluyendo algunas.
         */
        clearMultipleTracksAfter: async function (cutTime, trackIndices, excludeTracks, ripple) {
            utils.log(`[clearMultipleTracksAfter] cutTime=${cutTime}, trackIndices=${JSON.stringify(trackIndices)}, excludeTracks=${JSON.stringify(excludeTracks)}, ripple=${ripple}`);
            const videoTracks = trackIndices.filter(t => !excludeTracks.includes(t));
            const audioTracks = [];
            const extend = false; // ripple? no se usa
            const result = await this.rippleAllOut(cutTime, videoTracks, audioTracks, extend);
            return result;
        },

        /**
         * getTrackClips: Obté tots els clips d'una pista en ordre temporal.
         */
        getTrackClips: async function (trackIdx, type = "video") {
            utils.log(`[getTrackClips] Obtenint clips de pista ${trackIdx} (${type})`);
            const countStr = await utils.callJSX(`Clips.count(${trackIdx}, '${type}')`);
            const count = parseInt(countStr || 0);
            if (count === 0) return [];
            
            const clips = [];
            for (let i = 0; i < count; i++) {
                const dataRaw = await utils.callJSX(`Clips.get(${trackIdx}, ${i}, '${type}')`);
                if (!dataRaw || dataRaw === "null") continue;
                const clip = JSON.parse(dataRaw);
                clip.index = i;
                clips.push(clip);
            }
            utils.log(`[getTrackClips] Retornant ${clips.length} clips`);
            return clips;
        },

        /**
         * cleanFlashWhites: Detecta i elimina físicament els clips "flash blanc" del timeline.
         *
         * Un flash blanc és un clip de durada < minDuration amb un gap < maxGap respecte
         * al clip anterior. Per cada flash (clipB) s'elimina clipB i clipC (posterior) i
         * s'estén clipA (anterior) per tapar el forat.
         *
         * Usa operacions per temps (endAt / removeAt) per evitar el desfasament d'índexs
         * que es produïa amb les operacions per posició. Refresca el array des de Premiere
         * després de cada operació per mantenir sincronització perfecta.
         *
         * @param {Array}  clips      - Array de clips (modificat in-place)
         * @param {number} mainTrack  - Índex de pista V principal (1-based, igual que mainTrack)
         * @param {Object} [options]  - { maxGap, minDuration, frameDuration }
         * @returns {Array} clips actualitzat
         */
        cleanFlashWhites: async function (clips, mainTrack, options) {
            const maxGap       = (options && options.maxGap       !== undefined) ? options.maxGap       : 0.2;
            const minDuration  = (options && options.minDuration  !== undefined) ? options.minDuration  : 0.2;
            const frameDuration = (options && options.frameDuration !== undefined) ? options.frameDuration : 0.04;
            const trackIdx     = mainTrack; // JSX _get() converteix 1 → tracks[0] (V1)

            let changed = true;
            while (changed) {
                changed = false;
                for (let i = 1; i < clips.length - 1; i++) {
                    const clipB = clips[i];
                    const clipA = clips[i - 1];
                    const clipC = clips[i + 1];
                    const gapAB     = clipB.start - clipA.end;
                    const durationB = clipB.end   - clipB.start;

                    if (gapAB < maxGap && durationB < minDuration) {
                        // Fins on esteneu clipA? Si clipD existeix i toca clipC, restem 1 frame per evitar solapament
                        const clipD  = (i + 2 < clips.length) ? clips[i + 2] : null;
                        let newEnd   = clipD ? clipD.start : clipC.end;
                        if (clipD && Math.abs(clipC.end - clipD.start) < 0.001) {
                            newEnd -= frameDuration;
                        }

                        utils.log(`      🔧 Flash blanc detectat: [${clipB.start.toFixed(2)}‑${clipB.end.toFixed(2)}] gap=${gapAB.toFixed(2)}s. Estenent anterior fins a ${newEnd.toFixed(2)}s`);

                        try {
                            // Operacions per temps → immunitat a renumeració d'índexs
                            await utils.callJSX(`Clips.endAt(${trackIdx}, ${clipA.start}, ${newEnd})`);
                            await utils.callJSX(`Clips.removeAt(${trackIdx}, ${clipC.start}, 'video')`);
                            await utils.callJSX(`Clips.removeAt(${trackIdx}, ${clipB.start}, 'video')`);

                            // Refrescar el array des de Premiere per resincronitzar índexs
                            const refreshed = await this.getTrackClips(mainTrack, "video");
                            clips.length = 0;
                            refreshed.forEach(c => clips.push(c));

                            utils.log(`      ✅ Flash blanc eliminat. Timeline refrescat: ${clips.length} clips`);
                            changed = true;
                            break; // reiniciar while
                        } catch (err) {
                            utils.log(`      ❌ Error en la fusió física: ${err.message || err}`);
                            break;
                        }
                    }
                }
            }

            utils.log(`      📋 Clips després de la neteja de flash whites: ${clips.length} clips`);
            clips.forEach((clip, idx) => {
                utils.log(`         Clip ${idx}: start=${clip.start.toFixed(2)}, end=${clip.end.toFixed(2)}, duration=${(clip.end - clip.start).toFixed(2)}`);
            });
            return clips;
        },

        /**
         * insert: Bridge per inserir un clip al timeline via overwriteClip (JSX).
         * @param {string} itemName - Nom del project item a inserir
         * @param {number} trackIdx - Índex de pista (1-based)
         * @param {number} startSec - Temps d'inici en segons
         * @param {number|null} [endSec] - Temps final opcional (per retallar durada)
         * @param {string} [type] - Tipus de pista ('video' | 'audio', default 'video')
         * @returns {Promise<string>} Resposta del JSX
         */
        insert: async function (itemName, trackIdx, startSec, endSec, type) {
            const safeName = (itemName || '').replace(/'/g, "\\'");
            const endParam = (endSec !== null && endSec !== undefined) ? `, ${endSec}` : ', null';
            const typeParam = type || 'video';
            return await utils.callJSX(`Clips.insert('${safeName}', ${trackIdx}, ${startSec}${endParam}, '${typeParam}')`);
        },

        /**
         * _clipAtTime: Clip REAL de la pista que ARRENCA a l'instant donat.
         *
         * Usa l'àtom `Clips.at` (una sola crida: retorna el clip que CONTÉ l'instant, amb
         * `index`/`inPoint`/`outPoint`) i, si el resultat no arrenca on esperàvem, escombra
         * la pista clip a clip (mateix patró que `flow_chyrons::_repararClipsV7`).
         *
         * @param {number} trackIdx - Pista (1-based)
         * @param {number} startSec - Instant d'inici esperat del clip
         * @param {string} [type] - 'video' (default) | 'audio'
         * @returns {Promise<Object|null>} {index,name,start,end,inPoint,outPoint,duration} o null
         */
        _clipAtTime: async function (trackIdx, startSec, type) {
            const t = parseInt(trackIdx, 10);
            const s = Number(startSec);
            if (!(t > 0) || !isFinite(s)) return null;
            const kind = type || 'video';
            const TOL = 0.21;   // ~5 frames a 25 fps
            try {
                const raw = await utils.callJSX(`Clips.at(${t}, ${(s + 0.02).toFixed(4)}, '${kind}')`);
                if (raw && raw !== 'null') {
                    const c = JSON.parse(raw);
                    if (c && isFinite(Number(c.start)) && Math.abs(Number(c.start) - s) <= TOL) return c;
                }
            } catch (eAt) { }
            let best = null, bestD = Infinity;
            try {
                const n = parseInt(await utils.callJSX(`Clips.count(${t}, '${kind}')`) || '0', 10) || 0;
                for (let i = 0; i < n; i++) {
                    const raw = await utils.callJSX(`Clips.get(${t}, ${i}, '${kind}')`);
                    if (!raw || raw === 'null') continue;
                    const c = JSON.parse(raw);
                    const d = Math.abs(Number(c.start) - s);
                    if (d < bestD) { bestD = d; best = c; }
                }
            } catch (eSc) { return null; }
            return (best && bestD <= TOL) ? best : null;
        },

        /**
         * endCoherent: Fixa el FINAL del clip que arrenca a `startSec` DEIXANT-LO ESTIRABLE
         * amb el ratolí a la timeline.
         *
         * ── PER QUÈ (mesurat en viu el 2026-10-08 · docs/BUGS_FIXED.md #146) ─────────────
         * `Clips.endAt` (àtom històric) NOMÉS mou `clip.end` del TIMELINE: l'`outPoint` del
         * SOURCE queda on era (al final del mèdia) → l'estat és INCOHERENT
         * (`end − start ≠ outPoint − inPoint`) i Premiere considera el material ESGOTAT →
         * el clip NO es pot estirar amb el ratolí («no es pot estirar més enllà de la
         * inserció feta»), encara que al mèdia li queden segons de sobres.
         * Amb `Clips.retrim` (inPoint → outPoint → end, amb verificació) l'estat queda
         * COHERENT (end − start == outPoint − inPoint) i el clip SÍ que s'estira i
         * s'escurça amb el ratolí, fins on arribe el mèdia.
         *
         * ── GARANTIES ───────────────────────────────────────────────────────────────────
         * · MATEIX resultat visual: la durada al TIMELINE no canvia; només se sincronitza el
         *   rang del source amb ella. Si el mèdia NO dóna per a la durada demanada (Premiere
         *   limita l'`outPoint`), el final es torna a fixar amb `Clips.endAt` (= el
         *   comportament de sempre) i s'escriu un WARN dient que eixe clip només es podrà
         *   escurçar.
         * · NO toca l'àudio d'A1 (a diferència de `Clips.trimBounds`, que també retalla el
         *   clip d'àudio que arrenca al mateix instant).
         * · Idempotent: si el clip JA és coherent, no crida res (una sola lectura).
         *
         * @param {number} trackIdx - Pista (1-based)
         * @param {number} startSec - Inici del clip al timeline
         * @param {number|null} [endSec] - Final volgut (null → el que ja té)
         * @param {string} [type] - 'video' (default) | 'audio'
         * @param {string} [tag] - Etiqueta per als logs
         * @returns {Promise<string>} "OK:ja-coherent …" | "OK:coherent …" | "WARN_MEDIA:…" |
         *   "WARN_COHERENT:…" | "ERR_…"
         */
        endCoherent: async function (trackIdx, startSec, endSec, type, tag) {
            const FRAME = 0.04;          // 1 frame a 25 fps (mateixa reixa que flow_chyrons)
            const t = parseInt(trackIdx, 10);
            const s = Number(startSec);
            const kind = type || 'video';
            const LBL = tag || 'Coherent';
            const f3 = (v) => (isFinite(Number(v)) ? Number(v).toFixed(3) : '?');
            try {
                const clip = await this._clipAtTime(t, s, kind);
                if (!clip) return `ERR_NO_CLIP:V${t}@${isFinite(s) ? s.toFixed(2) : s}s`;
                const start = Number(clip.start);
                const wantEnd = (endSec !== null && endSec !== undefined && isFinite(Number(endSec)) && Number(endSec) > 0)
                    ? Number(endSec) : Number(clip.end);
                const dur = wantEnd - start;
                if (!(dur > 0.02)) return `ERR_NO_SPAN:${LBL} dur=${f3(dur)}`;
                const inPt = (isFinite(Number(clip.inPoint)) && Number(clip.inPoint) >= 0) ? Number(clip.inPoint) : 0;
                const outPt = inPt + dur;
                const tlDur = Number(clip.end) - start;
                const srcDur = Number(clip.outPoint) - Number(clip.inPoint);
                const isStill = /\.(png|jpe?g|tiff?|psd|bmp|gif|eps|ai)$/i.test(String(clip.name || ''));
                const info = `V${t}@${start.toFixed(2)}s dur=${f3(dur)}s source ${f3(inPt)}→${f3(outPt)}` +
                    (isStill ? ' (imatge FIXA: estirable sense límit)' : ` (source sencer ${f3(srcDur)}s)`) +
                    ` "${String(clip.name || '').substring(0, 34)}"`;

                // 1) Ja coherent i amb el final volgut → res a fer.
                if (Math.abs(tlDur - srcDur) <= FRAME / 2 && Math.abs(Number(clip.end) - wantEnd) <= FRAME / 2) {
                    return `OK:ja-coherent ${info}`;
                }

                // 2) Retall COHERENT: inPoint → outPoint → end (`Clips.retrim`, verificat).
                const r = String(await utils.callJSX(
                    `Clips.retrim(${t}, ${clip.index}, ${inPt.toFixed(4)}, ${outPt.toFixed(4)}, ${wantEnd.toFixed(4)}, '${kind}')`) || '');
                const c2 = await this._clipAtTime(t, start, kind);
                const coh = !!c2 && Math.abs((Number(c2.end) - Number(c2.start)) - (Number(c2.outPoint) - Number(c2.inPoint))) <= FRAME / 2;
                const endOk = !!c2 && Math.abs(Number(c2.end) - wantEnd) <= Math.max(FRAME / 2, 0.05);
                if (coh && endOk) return `OK:coherent ${info} [${r}]`;

                // 3) El mèdia no dóna per a `outPt` (Premiere l'ha limitat): es manté el final de
                //    sempre amb `endAt` i s'AVISA que eixe clip només es podrà escurçar.
                if (c2 && !endOk) {
                    const rb = String(await utils.callJSX(
                        `Clips.endAt(${t}, ${start.toFixed(4)}, ${wantEnd.toFixed(4)}, '${kind}')`) || '');
                    utils.warn(`   ⚠️ [${LBL}] ${info} → el source NO accepta ${f3(outPt)}s (source sencer ${f3(srcDur)}s): final fixat amb endAt (${f3(c2.end)}→${f3(wantEnd)}s) [${rb}]; eixe clip només es podrà ESCURÇAR`);
                    return `WARN_MEDIA:${LBL} ${info} endAt=${rb}`;
                }
                utils.warn(`   ⚠️ [${LBL}] ${info} → retrim NO verificat (coherent=${coh} endOk=${endOk}) [${r}]`);
                return `WARN_COHERENT:${LBL} ${info} [${r}]`;
            } catch (e) {
                return 'ERR: ' + e.message;
            }
        },

        /**
         * insertNoAudio: Insereix un clip de VÍDEO i ELIMINA l'àudio que Premiere hi
         * enllaça (grafismes .mov/.mp4 amb so, wotts amb pista d'àudio...).
         *
         * Sense JSX nou: es componen àtoms existents —
         *   1. `Clips.insert` (overwriteClip; ja intenta treure l'àudio fantasma, però
         *      NOMÉS mira A1).
         *   2. `Clips.at` per localitzar l'índex del clip inserit.
         *   3. `Clips.removeLinkedAudio` = desenllaça el clip i elimina l'àudio enllaçat
         *      ALLÀ ON HAGI CAIGUT (A1, A2, A3..., segons el targeting de l'operador).
         *   4. Xarxa de seguretat: si encara queda un clip d'àudio amb el MATEIX NOM al
         *      mateix start, s'elimina per índex amb `Clips.remove(..., 'audio')`.
         *      Mai es toca l'àudio del programa (noms diferents).
         *
         * @param {string} itemName - Nom del project item (com a Clips.insert)
         * @param {number} trackIdx - Pista de VÍDEO (1-based)
         * @param {number} startSec - Posició d'inserció (s)
         * @param {number|null} [endSec] - Final opcional (s)
         * @returns {Promise<{res:string, idx:number|null, audio:string}>}
         */
        insertNoAudio: async function (itemName, trackIdx, startSec, endSec) {
            const t0 = parseFloat(startSec) || 0;
            const safeName = (itemName || '').replace(/'/g, "\\'");
            const endParam = (endSec !== null && endSec !== undefined) ? `, ${endSec}` : ', null';
            const res = await utils.callJSX(`Clips.insert('${safeName}', ${trackIdx}, ${t0.toFixed(4)}${endParam}, 'video')`);

            // 1. Índex del clip inserit
            let idx = null;
            try {
                const atRaw = await utils.callJSX(`Clips.at(${trackIdx}, ${(t0 + 0.05).toFixed(4)}, 'video')`);
                if (atRaw && atRaw !== 'null') idx = JSON.parse(atRaw).index;
            } catch (eAt) { }

            let audio = 'SENSE_CLIP';
            if (idx !== null) {
                // 2. Àtom existent: desenllaçar i eliminar l'àudio enllaçat
                audio = await utils.callJSX(`Clips.removeLinkedAudio(${trackIdx}, ${idx})`);
                // 3. Xarxa de seguretat per NOM (l'àudio del programa no es toca mai).
                //    UN sol àtom de diagnòstic (`Clips.audioAround`) retorna totes les pistes
                //    d'àudio al voltant de t0: molt més barat que escanejar pista a pista.
                try {
                    const base = String(itemName || '').replace(/\.[^.]+$/, '').toLowerCase();
                    const aroundRaw = await utils.callJSX(`Clips.audioAround(${t0.toFixed(4)})`);
                    const around = (aroundRaw && String(aroundRaw).indexOf('ERR') !== 0) ? JSON.parse(aroundRaw) : null;
                    const trks = (around && around.tracks) ? around.tracks : [];
                    for (let ti = 0; ti < trks.length; ti++) {
                        const aNum = ti + 1;   // audioAround llista les pistes en ordre (A1, A2...)
                        const cs = trks[ti].clips || [];
                        for (let ci = cs.length - 1; ci >= 0; ci--) {
                            const c = cs[ci];
                            const sameStart = Math.abs(c.start - t0) < 0.15;
                            const sameName = String(c.name || '').replace(/\.[^.]+$/, '').toLowerCase() === base;
                            if (!sameStart || !sameName) continue;
                            const rm = await utils.callJSX(`Clips.remove(${aNum}, ${c.idx}, 'audio')`);
                            audio += ` +rmA${aNum}[${c.idx}]=${rm}`;
                            utils.log(`🔇 [Clips] àudio sobrant eliminat: A${aNum}[${c.idx}] "${c.name}" → ${rm}`);
                        }
                    }
                } catch (eSw) { utils.log(`⚠️ [Clips] xarxa de seguretat d'àudio: ${eSw.message}`); }
            }
            utils.log(`🔇 [Clips] insert sense àudio → V${trackIdx}@${t0.toFixed(2)}s "${itemName}" ins=${res} idx=${idx} àudio=${audio}`);
            return { res: res, idx: idx, audio: audio };
        }
    };

    // Alias literal global window.Clips
    window.Clips = FASTPASS_UI.Logic.Clips;

    window.FASTPASS_UI = FASTPASS_UI;
})();
