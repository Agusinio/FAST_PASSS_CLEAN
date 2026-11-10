/**
 * ============================================================================
 * LOGIC: SUB (Subtítols) - v3.1.0
 * SrtParser + WaveformGenerator (WAV .bin) + PrProjCleaner
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Logic = FASTPASS_UI.Logic || {};

    FASTPASS_UI.Logic.SrtParser = {

        srtToEntries: function (srtContent) {
            if (!srtContent || typeof srtContent !== 'string') return [];
            var lines = srtContent.split('\n');
            var entries = [];
            var current = null;
            for (var li = 0; li < lines.length; li++) {
                var trimmed = lines[li].trim();
                if (!trimmed) { if (current) { entries.push(current); current = null; } continue; }
                var numMatch = trimmed.match(/^\d+$/);
                if (numMatch) {
                    if (current) entries.push(current);
                    current = { index: parseInt(trimmed, 10), timeStr: '', texts: [], startSec: 0, endSec: 0 };
                    continue;
                }
                var timeMatch = trimmed.match(/^(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
                if (timeMatch && current) { current.timeStr = trimmed; current.startSec = this.srtTimeToSec(timeMatch[1]); current.endSec = this.srtTimeToSec(timeMatch[2]); continue; }
                if (current) current.texts.push(trimmed);
            }
            if (current) entries.push(current);
            return entries;
        },

        entriesToSrt: function (entries) {
            if (!entries || entries.length === 0) return '';
            var lines = [];
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                lines.push(String(i + 1));
                lines.push(this.secToSrtTime(e.startSec) + ' --> ' + this.secToSrtTime(e.endSec));
                for (var t = 0; t < e.texts.length; t++) lines.push(e.texts[t]);
                // Separador DESPRÉS de cada bloc, també del darrer: sense la línia
                // buida final, Premiere (i altres parsers) descarten l'últim subtítol.
                lines.push('');
            }
            // Doble salt final (bloc + línia buida), com el SRT de referència.
            return lines.join('\n') + '\n';
        },

        srtTimeToSec: function (timeStr) {
            if (!timeStr) return 0;
            var normalized = timeStr.replace(',', '.');
            var parts = normalized.split(':');
            if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
            return 0;
        },

        secToSrtTime: function (sec) {
            if (typeof sec !== 'number' || isNaN(sec)) sec = 0;
            if (sec < 0) sec = 0;
            var hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000);
            // Carry de redondeo: 0.9999s → 1000ms s'ha de convertir a +1s (evita "00,1000")
            if (ms >= 1000) { ms = 0; ss += 1; }
            if (ss >= 60) { ss = 0; mm += 1; }
            if (mm >= 60) { mm = 0; hh += 1; }
            var pad2 = function (v) { return v < 10 ? '0' + v : String(v); };
            var pad3 = function (v) { return v < 100 ? (v < 10 ? '00' + v : '0' + v) : String(v); };
            return pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss) + ',' + pad3(ms);
        },

        findTargetByTime: function (entries, ctiSec) {
            if (!entries || entries.length === 0) return -1;
            for (var i = 0; i < entries.length; i++) { if (ctiSec >= entries[i].startSec && ctiSec < entries[i].endSec) return i; }
            var best = -1, bestDist = Infinity;
            for (var j = 0; j < entries.length; j++) { var dist = ctiSec - entries[j].startSec; if (dist >= 0 && dist < bestDist) { bestDist = dist; best = j; } }
            return best;
        },

        applyTrimIn: function (entries, targetIdx, frame10Sec) {
            if (!entries || entries.length === 0) return [];
            if (targetIdx < 0 || targetIdx >= entries.length) return entries.slice();
            var result = entries.slice(targetIdx);
            if (result.length === 0) return [];
            var first = result[0], firstDur = first.endSec - first.startSec, originalStart = first.startSec;
            result[0] = { index: 1, timeStr: '', texts: first.texts.slice(), startSec: frame10Sec, endSec: frame10Sec + firstDur };
            // (BUG #260 · 2026-11-10) La marca d'origen `sint` viatja amb l'entrada:
            // si no, els clips SINT perdien el roig (i l'origen) en editar.
            if (first.sint) result[0].sint = true;
            var offset = frame10Sec - originalStart;
            for (var i = 1; i < result.length; i++) {
                var r = result[i];
                result[i] = { index: i + 1, timeStr: '', texts: r.texts.slice(), startSec: r.startSec + offset, endSec: r.endSec + offset };
                if (r.sint) result[i].sint = true;
            }
            return result;
        },

        applyTrimOut: function (entries, targetIdx) {
            if (!entries || entries.length === 0) return [];
            if (targetIdx < 0 || targetIdx >= entries.length) return [];
            var result = entries.slice(0, targetIdx + 1);
            for (var i = 0; i < result.length; i++) {
                var rs = result[i];
                result[i] = { index: i + 1, timeStr: '', texts: rs.texts.slice(), startSec: rs.startSec, endSec: rs.endSec };
                if (rs.sint) result[i].sint = true;   // (BUG #260) marca d'origen
            }
            return result;
        },

        applyTimeAdjust: function (entries, ctiSec, paddingSec) {
            if (!entries || entries.length === 0) return [];
            paddingSec = paddingSec || 0.04;
            var firstIn = entries[0].startSec, lastOut = entries[entries.length - 1].endSec, currentDur = lastOut - firstIn;
            if (currentDur <= 0) return entries.slice();
            var durIdeal = ctiSec - firstIn;
            if (durIdeal <= 0) return entries.slice();
            var ratio = durIdeal / currentDur, result = [];
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i], oldDur = e.endSec - e.startSec, newStart = firstIn + (e.startSec - firstIn) * ratio;
                var na = { index: i + 1, timeStr: '', texts: e.texts.slice(), startSec: newStart, endSec: newStart + oldDur * ratio };
                if (e.sint) na.sint = true;   // (BUG #260) marca d'origen
                result.push(na);
            }
            return result;
        },

        /**
         * scaleSegmentWithGaps: Re-escala un segment de clips (contigus) mantenint
         * la separació base de 3 frames i escalant només durades + pauses.
         * @param {Array} clips - clips del segment en ordre (startSec/endSec originals)
         * @param {Array} boundaryGaps - gaps en ordre [lead, g1..g(n-1), trail] (longitud = clips.length+1)
         * @param {number} newStart - nou IN del primer clip
         * @param {number} newEnd   - nou límit dret (després del trail)
         * @returns {Array} clips re-posicionats (index re-numerat 1..n)
         */
        scaleSegmentWithGaps: function (clips, boundaryGaps, newStart, newEnd) {
            if (!clips || clips.length === 0) return [];
            if (!isFinite(newStart) || !isFinite(newEnd) || newEnd <= newStart) {
                // Rang degenerat: retornar els clips sense canvis (clonats) per no col·lapsar
                // (BUG #260 · 2026-11-10) La marca d'origen `sint` es CONSERVA: si no, el
                // clip sintetic passava a comptar com a oficial despres d'una edicio.
                return clips.map(function (c) {
                    var o = { index: c.index, timeStr: c.timeStr, texts: c.texts.slice(), startSec: c.startSec, endSec: c.endSec };
                    if (c.sint) o.sint = true;
                    return o;
                });
            }
            var FPS = 25;
            var GAP = 3 / FPS;      // 0.12s = 3 frames
            var EPS = 1 / FPS;      // 0.04s (umbral gap base vs pausa)
            var MIN_DUR = 1 / FPS;  // 0.04s (durada mínima d'un clip)
            var n = clips.length;

            var durs = [];
            for (var d0 = 0; d0 < n; d0++) durs.push(Math.max(0, clips[d0].endSec - clips[d0].startSec));

            // Classificar cada gap: contigu (0) / base (3 frames) / pausa (excés escalable)
            var base = [], excess = [];
            for (var j = 0; j < boundaryGaps.length; j++) {
                var g = boundaryGaps[j];
                if (g <= EPS) { base.push(0); excess.push(0); }
                else if (g <= GAP + EPS) { base.push(GAP); excess.push(0); }
                else { base.push(GAP); excess.push(g - GAP); }
            }

            var fixed = 0;
            for (var f0 = 0; f0 < base.length; f0++) fixed += base[f0];

            // Water-filling: les durades que caurien sota el mínim es fixen a MIN_DUR
            var frozen = [];
            for (var fr = 0; fr < n; fr++) frozen.push(false);
            var factor = 1;
            for (var iter = 0; iter <= n; iter++) {
                var scalable = 0;
                for (var s0 = 0; s0 < n; s0++) if (!frozen[s0]) scalable += durs[s0];
                for (var e0 = 0; e0 < excess.length; e0++) scalable += excess[e0];
                var fixedNow = fixed;
                for (var fz = 0; fz < n; fz++) if (frozen[fz]) fixedNow += MIN_DUR;
                var f = 1;
                if (scalable > 0) f = (newEnd - newStart - fixedNow) / scalable;
                var changed = false;
                for (var w = 0; w < n; w++) {
                    if (!frozen[w] && durs[w] * f < MIN_DUR) { frozen[w] = true; changed = true; }
                }
                factor = f;
                if (!changed) break;
            }

            // Durades i gaps finals
            var newDurs = [];
            for (var i0 = 0; i0 < n; i0++) newDurs.push(frozen[i0] ? MIN_DUR : Math.max(MIN_DUR, durs[i0] * factor));
            var newGaps = [];
            for (var j0 = 0; j0 < excess.length; j0++) newGaps.push(base[j0] + excess[j0] * factor);

            // Reensamblar: lead → clip → gap → clip → ... → trail
            var result = [];
            var t = newStart + newGaps[0];
            for (var i = 0; i < n; i++) {
                var s = t;
                var e = t + newDurs[i];
                // (BUG #260 · 2026-11-10) Es conserva la marca d'origen `sint` (fusio
                // dels SINT): l'editor la fa servir per a pintar el clip de roig sempre.
                var nc = { index: i + 1, timeStr: '', texts: clips[i].texts.slice(), startSec: s, endSec: e };
                if (clips[i].sint) nc.sint = true;
                result.push(nc);
                t = e + newGaps[i + 1];
            }
            return result;
        },

        // ════════════════════════════════════════════════════════════════════
        // F3 (2026-10-21) · SUBTITOLS SINTETICS I REOMLIMENT DE BUITS
        // --------------------------------------------------------------------
        // Tota la decisio viu aci (PUR: sense DOM, sense CEP, sense IO) perque
        // es puga provar a bin/smoke/fp_probe_srt.js. L'editor nomes pinta i
        // crida aquestes funcions.
        // CRITERI DUR: les entrades EXISTENTS del SRT normal no es toquen MAI
        // (ni start, ni end, ni text): la fusio nomes AFEGEIX les entrades
        // sintetiques que cauen dins d'un buit.
        // ════════════════════════════════════════════════════════════════════

        /** cloneEntries: copia PROFUNDA d'una taula (texts inclosos). */
        cloneEntries: function (entries) {
            if (!entries || entries.length === 0) return [];
            var out = [];
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                var c = {
                    index: (e.index != null) ? e.index : (i + 1),
                    timeStr: e.timeStr || '',
                    texts: (e.texts || []).slice(),
                    startSec: Number(e.startSec) || 0,
                    endSec: Number(e.endSec) || 0
                };
                // (BUG #188) Marca d'origen: entrada que ve del SINT (fusió 🧩).
                if (e.sint) c.sint = true;
                out.push(c);
            }
            return out;
        },

        /**
         * _overlaps: dos intervals [aS,aE] i [bS,bE] es toquen o se solapen,
         * amb tolerancia en SEGONS per cada costat.
         */
        _overlaps: function (aS, aE, bS, bE, tolSec) {
            var tol = Number(tolSec) || 0;
            return (aS < bE + tol) && (bS < aE + tol);
        },

        /**
         * findGaps: buits ENTRE entrades (no el cap ni la cua).
         * @param {Array} entries
         * @returns {{gaps:Array<{startSec:number,endSec:number,durSec:number}>, firstSec:number, lastSec:number}}
         */
        findGaps: function (entries) {
            var list = this.cloneEntries(entries).sort(function (a, b) { return a.startSec - b.startSec; });
            var gaps = [];
            if (list.length === 0) return { gaps: gaps, firstSec: null, lastSec: null };
            var lastEnd = list[0].endSec;
            for (var i = 1; i < list.length; i++) {
                var e = list[i];
                if (e.startSec > lastEnd) {
                    gaps.push({ startSec: lastEnd, endSec: e.startSec, durSec: e.startSec - lastEnd });
                }
                if (e.endSec > lastEnd) lastEnd = e.endSec;
            }
            return { gaps: gaps, firstSec: list[0].startSec, lastSec: lastEnd };
        },

        /**
         * _normText: clau de comparació de textos (minúscules, sense accents ni
         * puntuació). Serveix per a reconèixer el MATEIX subtítol quan el TC dels dos
         * sistemes no quadra (el .srt sintètic i el normal no surten del mateix motor).
         * @param {string} s
         * @returns {string}
         */
        _normText: function (s) {
            var t = String(s || '').toLowerCase();
            try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { }
            return t.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
        },

        /**
         * textOverlap: quantes entrades del SINT tenen la seua frase JA al SRT normal
         * (sense mirar cap TC). Servix de GUARDA DE PERTINENÇA: els .srt sintètics no
         * porten el bloc al nom (`MATINS_V5_GUIO_LA_PLOMA_…`), així que es pot carregar
         * el d'un altre bloc del mateix programa; si el % és molt baix, hi ha risc.
         * @param {Array} baseEntries - SRT normal
         * @param {Array} sintEntries - SRT sintetic
         * @returns {{hits:number,total:number,pct:number}}
         */
        textOverlap: function (baseEntries, sintEntries) {
            var base = baseEntries || [], sint = sintEntries || [];
            var set = {}, i;
            for (i = 0; i < base.length; i++) {
                var k = this._normText((base[i].texts || []).join(' '));
                if (k) set[k] = 1;
            }
            var hits = 0;
            for (i = 0; i < sint.length; i++) {
                var k2 = this._normText((sint[i].texts || []).join(' '));
                if (k2 && set[k2]) hits++;
            }
            return { hits: hits, total: sint.length, pct: sint.length ? Math.round(100 * hits / sint.length) : 0 };
        },

        /** _median: mediana d'una llista de numeros (no muta l'original). */
        _median: function (list) {
            var a = (list || []).slice().sort(function (x, y) { return x - y; });
            if (a.length === 0) return 0;
            var h = Math.floor(a.length / 2);
            return (a.length % 2) ? a[h] : (a[h - 1] + a[h]) / 2;
        },

        /**
         * estimateOffsetSec (BUG #189 · 2026-10-23): DESFASAMENT d'eix entre el SRT
         * NORMAL i el SINT, mesurat amb les frases que els dos tenen en comu.
         *
         * PER QUE CAL: els `.srt` sintetics NO comencen al media 0 del clip. El seu
         * 00:00:00 es l'inici del material amb que s'han generat (la peca, o un tros
         * de programa que la conte), que en un extracte amb handles cau molt mes
         * endins: mesurat en viu el 22/10, -16,97 s al TN_COMARQUES V3 i -39,55 s al
         * V1 (ELS_DIPOSTIS). El SRT NORMAL si que viu en temps de MEDIA del clip, aixi
         * sense ajust cada sintetic eixia eixa diferencia ABANS del lloc on tocava
         * (l'usuari ho veu com «el subtitol es d'un moment anterior»).
         *
         * NO s'endevina cap constant: per a cada frase que apareix EXACTAMENT als dos
         * (text normalitzat, sense accents ni puntuacio) es calcula
         * `base.startSec - sint.startSec`; el desfasament es la MEDIANA (robusta a
         * frases repetides o mal aparellades) i despres es refina quedant-se nomes
         * les mostres a +-`keepSec` de la mediana.
         *
         * @param {Array} baseEntries - SRT normal (eix de MEDIA)
         * @param {Array} sintEntries - SRT sintetic (el seu propi eix)
         * @param {Object} [opts] - { keepSec: 2.5, maxAbsSec: 900 }
         * @returns {{offsetSec:number, offsetSecRaw:number, pairs:number, used:number,
         *   spreadSec:number, method:string}}
         *   `offsetSec` = el que cal SUMAR a les entrades SINT per a portar-les a
         *   l'eix del NORMAL (0 si no s'ha pogut mesurar o si el resultat no es creible,
         *   `method` = 'cap' | 'text' | 'text-febol' | 'fora-de-rang').
         */
        estimateOffsetSec: function (baseEntries, sintEntries, opts) {
            var o = opts || {};
            var keep = (o.keepSec != null && isFinite(Number(o.keepSec))) ? Number(o.keepSec) : 2.5;
            var maxAbs = (o.maxAbsSec != null && isFinite(Number(o.maxAbsSec))) ? Number(o.maxAbsSec) : 900;
            var out = { offsetSec: 0, offsetSecRaw: 0, pairs: 0, used: 0, spreadSec: 0, method: 'cap' };
            var base = baseEntries || [], sint = sintEntries || [], i;
            if (base.length === 0 || sint.length === 0) return out;
            // Index de la taula NORMAL per text (la primera aparicio mana).
            var idx = {};
            for (i = 0; i < base.length; i++) {
                var kb = this._normText((base[i].texts || []).join(' '));
                if (kb && idx[kb] == null) idx[kb] = Number(base[i].startSec) || 0;
            }
            var deltas = [];
            for (i = 0; i < sint.length; i++) {
                var ks = this._normText((sint[i].texts || []).join(' '));
                if (!ks || idx[ks] == null) continue;
                deltas.push(idx[ks] - (Number(sint[i].startSec) || 0));
            }
            out.pairs = deltas.length;
            if (deltas.length === 0) return out;
            var med = this._median(deltas);
            var kept = [];
            for (i = 0; i < deltas.length; i++) {
                if (Math.abs(deltas[i] - med) <= keep) kept.push(deltas[i]);
            }
            if (kept.length === 0) kept = deltas.slice();
            var off = this._median(kept);
            // Dispersio = pitjor desviacio de les mostres que s'han usat.
            var spread = 0;
            for (i = 0; i < kept.length; i++) spread = Math.max(spread, Math.abs(kept[i] - off));
            out.used = kept.length;
            out.spreadSec = Math.round(spread * 1000) / 1000;
            out.offsetSecRaw = Math.round(off * 1000) / 1000;
            out.method = (kept.length >= 3) ? 'text' : 'text-febol';
            if (Math.abs(off) > maxAbs) {
                out.method = 'fora-de-rang';
                out.offsetSec = 0;
                return out;
            }
            out.offsetSec = out.offsetSecRaw;
            return out;
        },

        /**
         * mapAnchors (BUG #224-b · 2026-11-09): MAPA MONOTON SINT → NORMAL fet amb
         * els ANCLES de text de les dos taules.
         *
         * PER QUE NO UNA CONSTANT: mesurat al NAS (11 parells SINT↔oficial,
         * 07-09/11, 126 mostres) el desfasament GLOBAL no existix. Dins d'un mateix
         * parell el Δ va de -135 s a +799 s segons el tram: cada sintetic porta el
         * seu propi zero i, a mes, el motor que els genera allarga o acurça les
         * frases. Una sola constant (el que fa `estimateOffsetSec`, BUG #189)
         * encerta quan hi ha sort i el residu eixia com a «subtitol d'un altre
         * moment». L'ORDRE de les frases SI que es conserva (0 inversions en 10/11
         * parells), i per aixo el que funciona es un mapa per TRAMS:
         *
         *   1. S'emparellen les frases que els dos tenen EXACTAMENT iguals (text
         *      normalitzat) en ORDRE i sense creuar-se mai: la monotonia queda
         *      garantida per construccio (primera aparicio LLIURE que no va cap
         *      enrere).
         *   2. Cada parell es un ANCLE (eix SINT → eix NORMAL). Entre dos ancles
         *      el desfasament s'INTERPOLA; fora del tram d'ancles es pren el delta
         *      de l'ancla extrem (no s'extrapola: no hi ha informacio).
         *
         * Validacio objectiva (leave-one-out sobre les 126 mostres): Δ global
         * MAE 3,54 s / p90 3,47 s / pitjor 249 s → ancles interpolats MAE 0,71 s /
         * p90 1,99 s / pitjor 5,23 s.
         *
         * @param {Array} baseEntries - SRT normal (eix de MEDIA)
         * @param {Array} sintEntries - SRT sintetic (el seu propi eix)
         * @param {Object} [opts] - { maxAbsSec: 900, minAnchors: 3 }
         * @returns {{map:function, anchors:Array, pairs:number, used:number,
         *   method:string, spreadSec:number, deltaMin:number, deltaMax:number,
         *   slopeMin:number, slopeMax:number}}
         *   `map(tSec)` → porta un temps SINT a l'eix del NORMAL.
         *   `method` = 'ancles' (>= minAnchors) | 'ancles-febol' (1-2) | 'cap';
         *   amb 'cap' el `map` es la IDENTITAT.
         */
        mapAnchors: function (baseEntries, sintEntries, opts) {
            var o = opts || {};
            var maxAbs = (o.maxAbsSec != null && isFinite(Number(o.maxAbsSec))) ? Number(o.maxAbsSec) : 900;
            var minAnchors = (o.minAnchors != null && isFinite(Number(o.minAnchors))) ? Number(o.minAnchors) : 3;
            var base = baseEntries || [], sint = sintEntries || [], i, j, key;
            var out = {
                map: function (t) { return t; }, anchors: [], pairs: 0, used: 0, method: 'cap',
                spreadSec: 0, deltaMin: 0, deltaMax: 0, slopeMin: 1, slopeMax: 1
            };
            if (base.length === 0 || sint.length === 0) return out;
            // 1) Posicions del SINT per text (ascendents): una frase repetida pot
            //    servir d'ancla una sola vegada.
            var posByKey = {};
            for (j = 0; j < sint.length; j++) {
                key = this._normText((sint[j].texts || []).join(' '));
                if (!key) continue;
                if (!posByKey[key]) posByKey[key] = [];
                posByKey[key].push(j);
            }
            // 2) Recorregut en ORDRE del NORMAL: primera aparicio LLIURE del mateix
            //    text que no complica la monotonia (mai cap enrere).
            var ptr = {}, lastSintStart = -Infinity, anchors = [];
            for (i = 0; i < base.length; i++) {
                key = this._normText((base[i].texts || []).join(' '));
                if (!key || !posByKey[key]) continue;
                var arr = posByKey[key], p = ptr[key] || 0;
                while (p < arr.length && (Number(sint[arr[p]].startSec) || 0) < lastSintStart - 0.001) p++;
                if (p >= arr.length) continue;
                j = arr[p];
                ptr[key] = p + 1;
                var sSec = Number(sint[j].startSec) || 0;
                var bSec = Number(base[i].startSec) || 0;
                if (Math.abs(bSec - sSec) > maxAbs) continue;   // ancla absurda: fora
                anchors.push({ sSec: sSec, bSec: bSec, deltaSec: bSec - sSec, baseIdx: i, sintIdx: j });
                lastSintStart = sSec;
            }
            out.pairs = anchors.length;
            out.anchors = anchors;
            if (anchors.length === 0) return out;
            // 3) Dispersio respecte al Δ GLOBAL (informatiu: si es gran, el mapa per
            //    trams es IMPRESCINDIBLE) i rang dels deltes dels ancles.
            var dMin = Infinity, dMax = -Infinity;
            for (i = 0; i < anchors.length; i++) {
                if (anchors[i].deltaSec < dMin) dMin = anchors[i].deltaSec;
                if (anchors[i].deltaSec > dMax) dMax = anchors[i].deltaSec;
            }
            var dMed = this._median(anchors.map(function (a) { return a.deltaSec; }));
            var dGr = 0;
            for (i = 0; i < anchors.length; i++) dGr = Math.max(dGr, Math.abs(anchors[i].deltaSec - dMed));
            out.used = anchors.length;
            out.spreadSec = Math.round(dGr * 1000) / 1000;
            out.deltaMin = Math.round(dMin * 1000) / 1000;
            out.deltaMax = Math.round(dMax * 1000) / 1000;
            out.method = (anchors.length >= minAnchors) ? 'ancles' : 'ancles-febol';
            // 4) Pendent entre ancles consecutius (diagnostic: ~1 = mateix ritme).
            var sMin = 1, sMax = 1;
            for (i = 1; i < anchors.length; i++) {
                var ds = anchors[i].sSec - anchors[i - 1].sSec;
                if (ds <= 0.001) continue;
                var sl = (anchors[i].bSec - anchors[i - 1].bSec) / ds;
                if (sl < sMin) sMin = sl;
                if (sl > sMax) sMax = sl;
            }
            out.slopeMin = Math.round(sMin * 1000) / 1000;
            out.slopeMax = Math.round(sMax * 1000) / 1000;
            // 5) El mapa: interpolacio lineal entre ancles; fora del rang, el delta de
            //    l'ancla extrem (ni extrapolar ni inventar pendent).
            var list = anchors;
            out.map = function (tSec) {
                var t = Number(tSec) || 0;
                if (list.length === 0) return t;
                if (t <= list[0].sSec) return t + list[0].deltaSec;
                var last = list[list.length - 1];
                if (t >= last.sSec) return t + last.deltaSec;
                for (var k = 1; k < list.length; k++) {
                    if (t <= list[k].sSec) {
                        var a0 = list[k - 1], a1 = list[k];
                        var span = a1.sSec - a0.sSec;
                        if (span <= 0.0001) return t + a1.deltaSec;
                        var r = (t - a0.sSec) / span;
                        return t + (a0.deltaSec + r * (a1.deltaSec - a0.deltaSec));
                    }
                }
                return t + last.deltaSec;
            };
            return out;
        },

        /**
         * shiftEntries (BUG #189): copia la taula desplacant TOTS els temps
         * `deltaSec` (positiu = mes tard). No muta l'original i conserva la marca
         * `sint` de cada entrada.
         * Les entrades que queden TOTALMENT abans del 0 (fora del clip) es
         * descarten i el que queda es RETALLA a 0: un .srt amb temps negatius no es
         * valid ni per a Premiere ni per a l'exportador.
         * @param {Array} entries
         * @param {number} deltaSec
         * @returns {Array}
         */
        shiftEntries: function (entries, deltaSec) {
            var d = Number(deltaSec) || 0;
            var src = this.cloneEntries(entries);
            var out = [], i;
            for (i = 0; i < src.length; i++) {
                var e = src[i];
                var s = (Number(e.startSec) || 0) + d;
                var en = (Number(e.endSec) || 0) + d;
                if (en <= 0.0005) continue;      // cau abans del 0 → fora del clip
                if (s < 0) s = 0;
                if (en < s) en = s;
                e.startSec = s;
                e.endSec = en;
                out.push(e);
            }
            for (i = 0; i < out.length; i++) {
                out[i].index = i + 1;
                out[i].timeStr = '';
            }
            return out;
        },

        /**
         * alignmentCredible (BUG #224 · 2026-11-06): la mesura d'eix entre el SRT
         * NORMAL i el SINT és prou bona per a fusionar-los?
         *
         * PER QUE CAL: `estimateOffsetSec` ja mesurava el desfasament, pero si no
         * hi havia CAP frase en comú (SINT d'un ALTRE bloc del mateix programa) el
         * 🧩 continuava fusionant amb eix 0 i omplia els buits amb frases que no hi
         * tocaven: mesurat el 06/11 amb TN_MIGDIA, `TN_MIGDIA_V3_*` tenia 0/74
         * frases en comú amb el SRT del bloc V4 i eixien «Querida Xaric…» dins d'un
         * buit del rotatiu dels Estats Units. Amb esta guarda el REOMLIR no
         * col·loca RES si no pot demostrar que el SINT és d'eixos buits.
         *
         * @param {Object} est - resultat de `estimateOffsetSec`
         * @param {number} [minPairs=3] - frases en comú que s'exigixen
         * @returns {{ok:boolean, reason:string, pairs:number, used:number}}
         */
        alignmentCredible: function (est, minPairs) {
            var min = (minPairs != null && isFinite(Number(minPairs))) ? Number(minPairs) : 3;
            if (!est) return { ok: false, reason: 'sense-mesura', pairs: 0, used: 0 };
            var pairs = Number(est.pairs) || 0;
            var used = Number(est.used) || 0;
            if (est.method === 'fora-de-rang') return { ok: false, reason: 'fora-de-rang', pairs: pairs, used: used };
            if (pairs < min || used < min) {
                return { ok: false, reason: (pairs === 0 ? 'cap-frase' : 'poques-frases'), pairs: pairs, used: used };
            }
            return { ok: true, reason: 'ok', pairs: pairs, used: used };
        },

        /**
         * fitClipsToGap (BUG #224 · 2026-11-06): col·loca una llista de clips dins
         * d'un buit amb els MATEIXOS criteris que el SRT OFICIAL.
         *
         * MESURAT EN VIU (06/11) als SRT oficials del NAS: entre dos clips
         * consecutius sempre hi ha 3 frames = 0,12 s (63/68, 62/79 i 51/64 mostres
         * a tres SRT de blocs distints). El 🧩 antic no ho feia: deixava cada frase
         * al TC que li tocava i RETALLAVA la que eixia del buit (0,8 s màxim) o la
         * llençava («no-cab») → el buit quedava mig ple, amb forats a dins i el text
         * desquadrat. Ara el segment SINT del buit s'ESTIRA (o s'arrangona) fins a
         * omplir-lo, deixant eixa separació de 3 frames també amb els veïns.
         *
         * @param {Array} clips - {startSec,endSec} del segment, en ordre cronològic
         * @param {number} gapStartSec - vora esquerra del buit (fi del clip anterior)
         * @param {number} gapEndSec - vora dreta del buit (inici del clip seguent)
         * @param {Object} [opts] { gapSec=0.12, minDurSec=0.4, maxStretch=2 }
         * @returns {{clips:Array<{startSec:number,endSec:number}>, factor:number,
         *            dropped:number, total:number, reason:string}}
         *   reason: 'buit' (omplit sencer) · 'no-omplit' (factor topat a
         *   `maxStretch`: la cua del buit queda buida) · 'retallat' (no hi cabien
         *   tots els clips) · 'massa-curt' (el buit no dona ni per a un clip) ·
         *   'cap-clip'
         */
        fitClipsToGap: function (clips, gapStartSec, gapEndSec, opts) {
            var o = opts || {};
            var GAP = (o.gapSec != null && isFinite(Number(o.gapSec))) ? Number(o.gapSec) : 0.12;
            var minDur = (o.minDurSec != null && isFinite(Number(o.minDurSec))) ? Number(o.minDurSec) : 0.4;
            var maxStretch = (o.maxStretch != null && isFinite(Number(o.maxStretch))) ? Number(o.maxStretch) : 2;
            if (GAP < 0) GAP = 0;
            if (minDur < 0) minDur = 0;
            if (maxStretch < 1) maxStretch = 1;
            var src = [], i;
            for (i = 0; i < (clips || []).length; i++) {
                var d0 = (Number(clips[i].endSec) || 0) - (Number(clips[i].startSec) || 0);
                src.push(d0 > 0 ? d0 : 0);
            }
            var out = { clips: [], factor: 0, dropped: 0, total: src.length, reason: 'cap-clip' };
            if (src.length === 0) return out;
            var gs = Number(gapStartSec) || 0, ge = Number(gapEndSec) || 0;
            var dur = ge - gs;
            // (BUG #261 · 2026-11-10) `squeezeDurSec`: si hi ha MÉS clips que espai
            // amb la durada mínima, s'ARRANGONEN tots fins a eixe terra (mai no es
            // perd el darrer: perdre un clip del buit és molt pitjor que vore'l
            // apretat; l'usuari ja el retocarà).
            var floorDur = minDur;
            if (o.squeezeDurSec != null && isFinite(Number(o.squeezeDurSec))) {
                var sq = Number(o.squeezeDurSec);
                if (sq >= 0.04 && sq < floorDur) floorDur = sq;
            }
            // Quants clips hi caben amb la durada MÍNIMA i la separació de cada vora:
            //   n*minDur + (n+1)*GAP <= dur
            var maxN = Math.floor((dur - GAP) / (minDur + GAP) + 0.000001);
            if (src.length > maxN && floorDur < minDur) {
                // Amb el terra dur, caben TOTS si `available/n >= floorDur`; si no,
                // es repartixen igualment i el water-filling ja els apreta.
                var needAll = (dur - (src.length + 1) * GAP) / src.length;
                if (needAll >= floorDur) {
                    floorDur = Math.max(floorDur, Math.min(minDur, needAll));
                    maxN = src.length;
                }
            }
            if (maxN < 1) {
                out.reason = 'massa-curt';
                out.dropped = src.length;
                return out;
            }
            if (src.length > maxN) {
                out.dropped = src.length - maxN;
                src = src.slice(0, maxN);
            }
            var n = src.length;
            var available = dur - (n + 1) * GAP;   // espai per a les DURADES
            var sum = 0;
            for (i = 0; i < n; i++) sum += src[i];
            if (!(sum > 0)) {
                out.reason = 'massa-curt';
                out.dropped = n;
                return out;
            }
            var f = available / sum;
            var capped = false;
            var frozen = [];
            for (i = 0; i < n; i++) frozen.push(false);
            if (f > maxStretch) { f = maxStretch; capped = true; }
            if (!capped) {
                // Water-filling: les durades que caurien per davall del mínim es
                // fixen a `floorDur` i el que queda es repartix entre les altres.
                for (var iter = 0; iter <= n; iter++) {
                    var fixed = 0, freeSum = 0;
                    for (i = 0; i < n; i++) { if (frozen[i]) fixed += floorDur; else freeSum += src[i]; }
                    if (freeSum <= 0) break;
                    f = (available - fixed) / freeSum;
                    if (f > maxStretch) { f = maxStretch; capped = true; break; }
                    var changed = false;
                    for (i = 0; i < n; i++) {
                        if (!frozen[i] && src[i] * f < floorDur) { frozen[i] = true; changed = true; }
                    }
                    if (!changed) break;
                }
            }
            var durs = [];
            for (i = 0; i < n; i++) durs.push(frozen[i] ? floorDur : Math.max(floorDur, src[i] * f));
            // Col·locació: separació GAP també amb els veïns OFICIALS (cap i cua).
            var t = gs + GAP, res = [];
            for (i = 0; i < n; i++) {
                res.push({ startSec: t, endSec: t + durs[i] });
                t = t + durs[i] + GAP;
            }
            out.clips = res;
            out.factor = Math.round(f * 1000) / 1000;
            out.reason = capped ? 'no-omplit' : (out.dropped ? 'retallat' : 'buit');
            return out;
        },

        /**
         * _sintIdxByText (BUG #261 · 2026-11-10): índex dins del SINT de la frase
         * que coincidix amb `texts` (mateix text normalitzat) i que cau més a prop
         * de `nearSec`. Serveix per a ANCORAR els vores d'un buit als clips que
         * l'usuari encara té al timeline: el primer sintetic que s'hi ha de
         * col·locar és el SEGUENT a l'ancla esquerra i l'últim l'ANTERIOR a la
         * dreta (així no en falta cap encara que el TC vaja desquadrat).
         * `maxDistSec` evita confondre una frase REPETIDA lluny (una altra
         * repetició legítima del mateix text) amb l'ancla del veí.
         * @param {Array} sint - taula SINT
         * @param {Array<string>} texts - textos del clip oficial (ancla)
         * @param {number} nearSec - TC on hauria de caure (desempat de frases repetides)
         * @param {number} [maxDistSec=10] - distància màxima a `nearSec`
         * @returns {number} índex (>=0) o -1 si el text no hi és (o és massa lluny)
         */
        _sintIdxByText: function (sint, texts, nearSec, maxDistSec) {
            var key = this._normText((texts || []).join(' '));
            if (!key) return -1;
            var lim = (maxDistSec != null && isFinite(Number(maxDistSec))) ? Number(maxDistSec) : 10;
            var best = -1, bestD = Infinity, near = Number(nearSec) || 0;
            for (var i = 0; i < (sint || []).length; i++) {
                if (this._normText((sint[i].texts || []).join(' ')) !== key) continue;
                var d = Math.abs((Number(sint[i].startSec) || 0) - near);
                if (d < bestD - 0.0001) { bestD = d; best = i; }
            }
            return (bestD <= lim) ? best : -1;
        },

        /**
         * mergeSyntheticGaps: fusiona el SRT normal amb els SINTETICS.
         * Nomes AFEGEIX; les entrades existents MAI es toquen (start/end/text).
         *
         * (2026-11-06 · BUG #224) ENCAIX AL BUIT: abans cada sintetic anava al TC
         * que li tocava i, si no hi cabia, es retallava (0,8 s) o es descartava
         * («no-cab»): el buit quedava a mitges i el text desquadrat. Ara, per a
         * cada buit, es prenen els sintetics que hi cauen i es RE-COL·LOQUEN amb
         * `fitClipsToGap` (separació de 3 frames com els oficials + estirament per
         * a omplir-lo). Els que cauen damunt d'un subtitol existent es descarten
         * («solapa») i els que ja hi són amb el mateix text («duplicat-text»).
         *
         * (2026-11-09 · BUG #224-b) EIXOS: `opts.anchorMap` (el que torna
         * `mapAnchors`) porta cada entrada SINT a l'eix de MEDIA del NORMAL ABANS
         * de seleccionar. Amb mapa, una frase només entra al buit si hi cau al
         * manco a MITGES (`opts.minOverlapRatio`=0,5); la que només toca la vora és
         * del subtitol veí. Sense mapa (o si no en queda cap a mitges) es manté el
         * criteri llis de solapament per a no deixar el buit buit.
         *
         * (2026-11-10 · BUG #261) VORES ANCORATS: el buit va del FINAL del clip
         * anterior a l'INICI del següent. Amb `opts.anchorEdges` (per defecte sí)
         * es busca al SINT la frase que coincidix amb EIXOS dos veïns i es col·loca
         * EXACTAMENT el rang d'entrades que hi ha ENTRE les dos (exclusiu), caiguen
         * on caiguen en el temps: abans, el clip del vore que queia mig dins del
         * subtitol veí es descartava («solapa») i el buit quedava amb un forat a
         * cada cap. Si d'una vora no hi ha ancla, es pren el veí més pròxim a
         * `opts.edgeGraceSec` (només si el SINT compartix alguna frase amb el
         * normal: si no, és d'un altre bloc i no s'inventa res).
         * `opts.squeezeDurSec` passa a `fitClipsToGap` perquè no es descarte la
         * cua del rang si el buit és just.
         *
         * @param {Array} baseEntries - SRT normal
         * @param {Array} sintEntries - SRT sintetic (font de les entrades noves)
         * @param {Object} [opts] { tolSec=0.2, minDurSec=0.4, gapSec=0.12,
         *                         maxStretchSec=2, textNearSec=10,
         *                         anchorMap=null, minOverlapRatio=0.5,
         *                         anchorEdges=true, edgeGraceSec=2,
         *                         squeezeDurSec=null }
         * @returns {{entries:Array, added:Array, rejected:Array, gaps:Array,
         *            tolSec:number, minDurSec:number, gapSec:number,
         *            maxStretchSec:number, trimmed:number, sintCount:number,
         *            filledGaps:number, dropped:number, mapped:boolean,
         *            anchorUsed:number}}
         *   added:    {startSec,endSec,texts,reason:'buit'|'buit-ajustada',trimSec,
         *              factor,gapStartSec,gapEndSec}
         *   rejected: {startSec,endSec,texts,reason:'solapa'|'duplicat-text'|
         *              'fora-del-tram'|'massa-curt'|'no-cab'}
         */
        mergeSyntheticGaps: function (baseEntries, sintEntries, opts) {
            var o = opts || {};
            var tol = (o.tolSec != null && isFinite(Number(o.tolSec))) ? Number(o.tolSec) : 0.2;
            if (tol < 0) tol = 0;
            // Durada MÍNIMA llegible d'un subtitol i SEPARACIÓ entre clips: els SRT
            // oficials del NAS porten sempre 3 frames (0,12 s a 25 fps) entre dos
            // clips consecutius → el reomplit ha de deixar la mateixa separació.
            var minDur = (o.minDurSec != null && isFinite(Number(o.minDurSec))) ? Number(o.minDurSec) : 0.4;
            var GAP = (o.gapSec != null && isFinite(Number(o.gapSec))) ? Number(o.gapSec) : 0.12;
            var maxStretch = (o.maxStretchSec != null && isFinite(Number(o.maxStretchSec))) ? Number(o.maxStretchSec) : 2;
            // (BUG #261) Anclatge dels vores del buit als clips veïns del timeline.
            var anchorEdges = (o.anchorEdges == null) ? true : !!o.anchorEdges;
            var graceSec = (o.edgeGraceSec != null && isFinite(Number(o.edgeGraceSec))) ? Number(o.edgeGraceSec) : 2;
            if (graceSec < 0) graceSec = 0;
            var squeezeMin = (o.squeezeDurSec != null && isFinite(Number(o.squeezeDurSec))) ? Number(o.squeezeDurSec) : null;
            if (minDur < 0) minDur = 0;
            if (GAP < 0) GAP = 0;
            if (maxStretch < 1) maxStretch = 1;
            var base = this.cloneEntries(baseEntries).sort(function (a, b) { return a.startSec - b.startSec; });
            var sint = this.cloneEntries(sintEntries).sort(function (a, b) { return a.startSec - b.startSec; });
            // (BUG #224-b · 2026-11-09) EIXOS: si el cridador porta el mapa per
            // ANCLES (`SrtParser.mapAnchors`), el SINT es porta a l'eix del NORMAL
            // ABANS de mirar res mes. Es un mapa per TRAMS —cada sintetic pot tindre
            // el seu propi zero i un ritme distint— i no una constant: el Δ global
            // (BUG #189) encertava de sort i fallava fins a 249 s en algun tram.
            var anchorMap = (o.anchorMap && typeof o.anchorMap.map === 'function') ? o.anchorMap : null;
            // Solapament MINIM (fraccio de la frase) per a acceptar-la dins del buit.
            var ratio = (o.minOverlapRatio != null && isFinite(Number(o.minOverlapRatio))) ? Number(o.minOverlapRatio) : 0.5;
            if (ratio < 0) ratio = 0;
            if (ratio > 1) ratio = 1;
            if (anchorMap) {
                for (var mi = 0; mi < sint.length; mi++) {
                    var mS = anchorMap.map(Number(sint[mi].startSec) || 0);
                    var mE = anchorMap.map(Number(sint[mi].endSec) || 0);
                    sint[mi].startSec = mS;
                    sint[mi].endSec = Math.max(mS, mE);
                }
            }
            var info = this.findGaps(base);
            var out = {
                entries: base, added: [], rejected: [], gaps: info.gaps, tolSec: tol,
                minDurSec: minDur, gapSec: GAP, maxStretchSec: maxStretch,
                trimmed: 0, sintCount: sint.length, filledGaps: 0, dropped: 0,
                mapped: !!anchorMap, anchorUsed: anchorMap ? (Number(anchorMap.used) || 0) : 0
            };
            if (sint.length === 0) return out;
            if (base.length === 0) return out;   // sense SRT normal no hi ha res a reomplir

            var fromSec = (o.includeEdges) ? -Infinity : info.firstSec;
            var toSec = (o.includeEdges) ? Infinity : info.lastSec;

            // (2026-10-23) INDEX de TEXTOS del SRT normal: el sintètic que ja hi és
            // (mateix text, TC a ±textNearSec) no s'afegeix encara que els TC no
            // solapen. Comparar només TC duplicava subtítols quan els dos motors
            // no quadraven al frame.
            var near = (o.textNearSec != null && isFinite(Number(o.textNearSec))) ? Number(o.textNearSec) : 10;
            if (near < 0) near = 0;
            var baseTextIdx = {};
            for (var bt = 0; bt < base.length; bt++) {
                var kb = this._normText((base[bt].texts || []).join(' '));
                if (!kb) continue;
                if (!baseTextIdx[kb]) baseTextIdx[kb] = [];
                baseTextIdx[kb].push(base[bt]);
            }

            // 1) FILTRE previ: fora del tram amb contingut real i frases que ja hi
            //    són (mateix text a prop) → no són candidates.
            var cands = [];
            for (var i0 = 0; i0 < sint.length; i0++) {
                var s0 = sint[i0];
                var rec0 = {
                    startSec: s0.startSec, endSec: s0.endSec, texts: s0.texts.slice(),
                    reason: '', trimSec: 0, sintIdx: i0, offTram: false,
                    srcDurSec: (Number(s0.endSec) || 0) - (Number(s0.startSec) || 0)
                };
                // (BUG #261) Fora del tram NO es descarta encara: pot ser el clip del
                // vore d'un buit que s'ancora als veïns. Es decidix al final, si no
                // s'ha col·locat enlloc.
                if (s0.startSec < fromSec - tol || s0.endSec > toSec + tol) rec0.offTram = true;
                var kS = this._normText((s0.texts || []).join(' '));
                var hits = kS ? baseTextIdx[kS] : null;
                if (hits) {
                    var dupText = false;
                    for (var hh = 0; hh < hits.length; hh++) {
                        if (Math.abs(hits[hh].startSec - s0.startSec) <= near ||
                            Math.abs(hits[hh].endSec - s0.endSec) <= near) { dupText = true; break; }
                    }
                    if (dupText) {
                        rec0.reason = 'duplicat-text';
                        out.rejected.push(rec0);
                        continue;
                    }
                }
                cands.push(rec0);
            }
            if (cands.length === 0) return out;
            // 2) BUITS a omplir. Els de 0,12 s (3 frames) són la SEPARACIÓ oficial
            //    entre dos subtítols: no es toquen mai — si no, s'ompliria cada
            //    juntura del SRT oficial amb una frase sintètica.
            var minGap = minDur + 2 * GAP;
            var gapsToFill = [];
            for (var gi = 0; gi < info.gaps.length; gi++) {
                if (info.gaps[gi].durSec >= minGap - 0.0001) gapsToFill.push(info.gaps[gi]);
            }
            // 2-bis) (BUG #261 · 2026-11-10) ANCLES DELS VORES: per a cada buit, quin
            //    és el clip oficial ANTERIOR (pot acabar DINS del buit) i el SEGÜENT
            //    (pot començar abans del seu inici), i quina frase del SINT coincidix
            //    amb cadascun. El reompliment és el rang (ancla esquerra, ancla dreta)
            //    EXCLUSIU: el primer que s'hi col·loca és el SEGUENT al clip que ja
            //    hi ha i l'últim és l'ANTERIOR al següent. Si d'una vora no hi ha
            //    ancla es recorre a la gràcia temporal (`edgeGraceSec`).
            var idxBySint = {};   // sintIdx → índex dins de `cands`
            for (var ci0 = 0; ci0 < cands.length; ci0++) idxBySint[cands[ci0].sintIdx] = ci0;
            var edgeAnchors = [], anyAnchor = false, gx, px, nx;
            for (gx = 0; gx < gapsToFill.length; gx++) {
                var gA = gapsToFill[gx], prevEnt = null, nextEnt = null;
                for (px = 0; px < base.length; px++) {
                    if (base[px].endSec >= gA.startSec - 0.0001) { prevEnt = base[px]; break; }
                }
                for (nx = base.length - 1; nx >= 0; nx--) {
                    if (base[nx].startSec <= gA.endSec + 0.0001) { nextEnt = base[nx]; break; }
                }
                var ia = prevEnt ? this._sintIdxByText(sint, prevEnt.texts, prevEnt.startSec, near) : -1;
                var ib = nextEnt ? this._sintIdxByText(sint, nextEnt.texts, nextEnt.startSec, near) : -1;
                if (ia >= 0 || ib >= 0) anyAnchor = true;
                edgeAnchors.push({ prevIdx: ia, nextIdx: ib });
            }
            var usedFlags = [];   // candidates ja col·locades (o descartades) per un buit
            for (var g0 = 0; g0 < gapsToFill.length; g0++) {
                var gap = gapsToFill[g0];
                var ea = edgeAnchors[g0] || { prevIdx: -1, nextIdx: -1 };
                // (BUG #261 · 2026-11-10) El contingut del buit és el RANG de frases
                // del SINT que hi ha ENTRE el clip que ja hi ha abans i el que ja hi
                // ha després (exclusiu), caiguen on caiguen en el temps: així no es
                // perd la del vore per un desquadre de TC ni pel mapa d'eixos.
                var sel = [], selToc = [];
                // a) Criteri temporal de sempre (BUG #224-b): els sintetics que hi
                //    cauen al manco a MITGES. Si no n'hi ha cap a mitges, els que
                //    només toquen la vora (per a no deixar el buit buit).
                for (var ci = 0; ci < cands.length; ci++) {
                    if (usedFlags[ci]) continue;
                    var ov = Math.min(cands[ci].endSec, gap.endSec) - Math.max(cands[ci].startSec, gap.startSec);
                    if (ov <= Math.max(tol, 0.0001)) continue;
                    var cDur = Math.max(0.001, (Number(cands[ci].endSec) || 0) - (Number(cands[ci].startSec) || 0));
                    if (!anchorMap || ov >= ratio * cDur - 0.0001) sel.push(ci);
                    else selToc.push(ci);
                }
                if (sel.length === 0 && selToc.length > 0) sel = selToc;
                // b) (BUG #261 · 2026-11-10) UNIÓ del RANG ENTRE ANCLES: el que falta
                //    al buit és el que el SINT té ENTRE el clip que ja hi ha abans i
                //    el que ja hi ha després (exclusiu), caiga on caiga en el temps.
                //    És el que garantix que no es perda el clip del vore quan el mapa
                //    el deixa just fora del buit (símptoma: «en falta un al principi i
                //    un al final»). Si d'una vora no hi ha ancla, eixa vora es tanca
                //    per TEMPS amb `edgeGraceSec` de marge. Només s'usa este camí si
                //    el SINT compartix alguna frase amb el normal (`anyAnchor`): si
                //    no, és d'un altre bloc i no s'inventa res.
                if (anchorEdges && anyAnchor) {
                    var lo = -1, hi = -1, qi;
                    if (ea.prevIdx >= 0) lo = ea.prevIdx + 1;
                    else {
                        for (qi = 0; qi < sint.length; qi++) {
                            if (sint[qi].endSec > gap.startSec - graceSec - 0.0001) { lo = qi; break; }
                        }
                    }
                    if (ea.nextIdx >= 0) hi = ea.nextIdx - 1;
                    else {
                        for (qi = sint.length - 1; qi >= 0; qi--) {
                            if (sint[qi].endSec <= gap.endSec + graceSec + 0.0001) { hi = qi; break; }
                        }
                    }
                    for (qi = lo; lo >= 0 && qi <= hi; qi++) {
                        var cQi = idxBySint[qi];
                        if (cQi != null && !usedFlags[cQi] && sel.indexOf(cQi) < 0) sel.push(cQi);
                    }
                }
                if (sel.length === 0) continue;
                sel.sort(function (a, b) { return cands[a].sintIdx - cands[b].sintIdx; });
                // Dins del MATEIX buit, dos sintetics que se solapen són la mateixa
                // frase comptada dos voltes: es queda el primer.
                // (BUG #259 · 2026-11-10) ABANS es preguntava amb
                // `_overlaps(..., tol)` i eixa tolerància de 0,2 s convertia en
                // «duplicat» dos subtítols CONSECUTIUS normals (van PEGATS o a 3
                // frames = 0,12 s, que també cau dins de la tolerància): dins d'un
                // buit es descartava UN CLIP DE CADA DOS. Ara només és duplicat si
                // es solapen DE DEBÒ (solapament majoritari) o si el text és el
                // mateix; dos clips que només es toquen són dues frases i
                // `fitClipsToGap` ja els deixa la separació de 3 frames.
                var selOk = [];
                for (var so = 0; so < sel.length; so++) {
                    var candRec = cands[sel[so]];
                    var candDur = Math.max(0.001, (Number(candRec.endSec) || 0) - (Number(candRec.startSec) || 0));
                    var candKey = this._normText((candRec.texts || []).join(' '));
                    var dupSel = false;
                    for (var sd = 0; sd < selOk.length; sd++) {
                        var prevRec = cands[selOk[sd]];
                        var prevDur = Math.max(0.001, (Number(prevRec.endSec) || 0) - (Number(prevRec.startSec) || 0));
                        var ovSel = Math.min(Number(candRec.endSec) || 0, Number(prevRec.endSec) || 0) -
                                    Math.max(Number(candRec.startSec) || 0, Number(prevRec.startSec) || 0);
                        if (ovSel <= 0) continue;   // només es toquen → dues frases distintes
                        var sameText = !!(candKey && candKey === this._normText((prevRec.texts || []).join(' ')));
                        if (sameText || ovSel >= 0.5 * Math.min(candDur, prevDur)) { dupSel = true; break; }
                    }
                    if (dupSel) {
                        candRec.reason = 'duplicat';
                        out.rejected.push(candRec);
                        usedFlags[sel[so]] = true;
                        continue;
                    }
                    selOk.push(sel[so]);
                }
                if (selOk.length === 0) continue;
                sel = selOk;
                var segs = sel.map(function (ix) {
                    return { startSec: cands[ix].startSec, endSec: cands[ix].endSec };
                });
                // 3) ENCAIX: el segment s'estira (o s'arrangona) per a omplir el
                //    buit amb la separació de 3 frames, com qualsevol clip oficial.
                var fit = this.fitClipsToGap(segs, gap.startSec, gap.endSec,
                    { gapSec: GAP, minDurSec: minDur, maxStretch: maxStretch, squeezeDurSec: squeezeMin });
                for (var q = 0; q < sel.length; q++) {
                    var rec = cands[sel[q]];
                    usedFlags[sel[q]] = true;
                    if (fit.clips.length === 0 || q >= fit.clips.length) {
                        // El buit no dona per a tants clips (o per a cap).
                        rec.reason = (fit.reason === 'massa-curt') ? 'massa-curt' : 'no-cab';
                        out.rejected.push(rec);
                        continue;
                    }
                    var nc = fit.clips[q];
                    var newDur = nc.endSec - nc.startSec;
                    rec.startSec = nc.startSec;
                    rec.endSec = nc.endSec;
                    rec.trimSec = Math.round(Math.abs(rec.srcDurSec - newDur) * 1000) / 1000;
                    rec.factor = fit.factor;
                    rec.gapStartSec = gap.startSec;
                    rec.gapEndSec = gap.endSec;
                    rec.reason = (Math.abs(fit.factor - 1) > 0.005) ? 'buit-ajustada' : 'buit';
                    if (rec.trimSec > 0.005) out.trimmed++;
                    out.added.push(rec);
                }
                if (fit.clips.length > 0) out.filledGaps++;
                out.dropped += fit.dropped;
            }
            // 4) Les que no han caigut en cap buit: van damunt d'un subtitol
            //    existent (o entre dos que ja es toquen) → no s'hi posen.
            for (var nx = 0; nx < cands.length; nx++) {
                if (usedFlags[nx]) continue;
                // (BUG #261) Fora del tram de contingut real → eixe és el motiu.
                cands[nx].reason = cands[nx].offTram ? 'fora-del-tram' : 'solapa';
                out.rejected.push(cands[nx]);
            }

            if (out.added.length === 0) return out;

            // 5) Fusionar i reindexar (les existents conserven start/end/texts).
            //    `sint: true` marca les que venen del SINT per poder-les pintar
            //    diferents a l'editor (marcades d'origen, no modificables per error).
            var merged = base.concat(out.added.map(function (r) {
                return { index: 0, timeStr: '', texts: r.texts.slice(), startSec: r.startSec, endSec: r.endSec, sint: true };
            }));
            merged.sort(function (a, b) { return a.startSec - b.startSec; });
            for (var m = 0; m < merged.length; m++) merged[m].index = m + 1;
            out.entries = merged;
            return out;
        },

        /** removeEntryAt: taula sense l'entrada `idx`, reindexada. Mai muta l'original. */
        removeEntryAt: function (entries, idx) {
            var list = this.cloneEntries(entries);
            if (!isFinite(idx) || idx < 0 || idx >= list.length) return list;
            list.splice(idx, 1);
            for (var i = 0; i < list.length; i++) list[i].index = i + 1;
            return list;
        },

        extractEntriesFromSrtFile: async function (srtPath) {
            var escapedPath = srtPath.replace(/\\/g, '\\\\');
            // (2026-10-02) IO.readTxt llegeix amb ANSI i els .srt del projecte són UTF-8
            // → reparar el mojibake dels accents abans de parsejar.
            var srtContent = window.FASTPASS_UI.Utils._fromMojibake(
                await window.FASTPASS_UI.Utils.callJSX("IO.readTxt('" + escapedPath + "')"), 'srt_logic');
            if (!srtContent || srtContent.indexOf('ERR') === 0) return [];
            return this.srtToEntries(srtContent);
        }
    };

    /**
     * WaveformGenerator: Llegeix fitxer WAV (.bin) amb mostra d'àudio de referència
     * Format: WAV, 480Hz, 8-bit, mono (1 byte = 1 mostra = 1/480s exactes)
     */
    FASTPASS_UI.Logic.WaveformGenerator = {

        /**
         * Obté el path del fitxer .bin al directori del projecte
         * @param {string} projectFolder - Directori del projecte
         * @returns {string} Path complet al .bin o ''
         */
        getBinPath: async function (projectFolder) {
            // NORMA ESTRICTA: només el .bin del BLOC actual (<PROG>_<BLOC>_CLIP_AUDIO_REF.bin).
            // Sense cap fallback a altres .bin de la carpeta: millor cap WF que una WF equivocada.
            if (!projectFolder || projectFolder.indexOf('ERR') === 0) return '';

            var expected = '';
            try {
                var st = window.FASTPASS_UI.State;
                if (st && st.progData && st.progData.wott && st.bloque) {
                    expected = (st.progData.wott + '_' + st.bloque + '_CLIP_AUDIO_REF.bin').toUpperCase();
                }
            } catch(e0) {}
            if (!expected) return ''; // sense bloc conegut → no carreguem res

            try {
                // 1. Escaneig de directori: coincidència exacta de nom
                var scanResult = await window.FASTPASS_UI.Utils.callJSX("IO.scanDirectory('" + projectFolder.replace(/\\/g, '\\\\') + "')");
                if (scanResult && scanResult.indexOf('ERR') !== 0 && scanResult !== '[]') {
                    var files = JSON.parse(scanResult);
                    for (var i = 0; i < files.length; i++) {
                        var f = files[i];
                        if (f && f.name && f.name.toUpperCase() === expected && f.path) return f.path;
                    }
                }
            } catch(e) {}

            // 2. Comprovació directa per si l'escaneig falla (IO.exists és case-insensitive a Windows)
            try {
                var testPath = projectFolder + "\\" + expected;
                var exists = await window.FASTPASS_UI.Utils.callJSX("IO.exists('" + testPath.replace(/\\/g, '\\\\') + "')");
                if (exists === "true") return testPath;
            } catch(e2) {}

            return '';
        },

        /**
         * silences: (2026-09-24) Detecta els SILENCIS d'àudio del bloc a partir del .bin de
         * referència (<PROG>_<BLOC>_CLIP_AUDIO_REF.bin, 480Hz, 1 byte = 1 peak).
         * DAT TRANSVERSAL del pla de marcadors per capes: les fronteres de silenci són molt més
         * definitòries que els cortes (n'hi ha molts menys) i serveixen per:
         *   - CAPA 1 (OnAir): primer silenci, i després un corte a prop del silenci.
         *   - CAPES 1.5 / 2 / 3: ancla de posicionament.
         *   - BOUNDS: final real del contingut anterior (IN del bloc).
         * Els temps retornats són de MEDIA (la base del .bin = el clip del bloc).
         * @param {Object} [opts] { threshold=0.05, minDur=0.4, winSec=0.1, pps=240 }
         * @returns {Promise<Array<{start:number,end:number,dur:number}>>}
         */
        silences: async function (opts) {
            var U = window.FASTPASS_UI.Utils;
            var o = opts || {};
            var thr = (typeof o.threshold === 'number') ? o.threshold : 0.05;
            var minDur = (typeof o.minDur === 'number') ? o.minDur : 0.4;
            var winSec = (typeof o.winSec === 'number') ? o.winSec : 0.1;
            // (2026-09-25) pps NATIU (480 Hz): el .bin és 480Hz i demanar 240 fa que el lector
            // re-mostregi → els pics s'inflen i amb llindar 5% només sobreviuen 7 valls dels 153
            // reals (i troceats: app 124.10→124.60 vs real 124.00→125.10). Amb 480 les finestres
            // de 0,1s (=48 mostres) i el llindar 5% donen el mapa verificat (153 trams).
            var ppsWanted = (typeof o.pps === 'number') ? o.pps : 480;

            var folder = '';
            try { folder = U.workFolder(window.FASTPASS_UI.State) || ''; } catch (e0) { folder = ''; }
            var bin = '';
            try { bin = await this.getBinPath(folder); } catch (eB) { bin = ''; }
            if (!bin) {
                U.log('🤫 [SILENCI] Sense .bin de referència del bloc → no es poden detectar silencis');
                return [];
            }
            var wf = await this.loadPeaksFromBin(bin, ppsWanted);
            if (!wf || !wf.peaks || wf.peaks.length === 0) {
                U.log('🤫 [SILENCI] .bin sense peaks llegibles: ' + bin);
                return [];
            }
            // (2026-09-25) DIAGNÒSTIC: el detector de l'app trobava 7 trams i un mini-detector
            // extern (mateixa lògica) en troba 153 → cal veure QUÈ carrega realment.
            U.log('🤫 [SILENCI·DBG] bin=' + bin + ' · peaks=' + wf.peaks.length + ' · pps=' + wf.peaksPerSec + ' · dur=' + (wf.durSec !== undefined ? Number(wf.durSec).toFixed(2) : '?') + 's · demanat pps=' + ppsWanted);
            var pps = wf.peaksPerSec || ppsWanted;
            var winN = Math.max(1, Math.round(pps * winSec));
            // ═══ (2026-09-25) LLINDAR ADAPTATIU ═════════════════════════════════════════════
            // Un llindar FIX del 5% només veu silenci digital. El tall real (TNC V2 121-122s) té
            // un MÀXIM de 0,10-0,16 amb el parlant del voltant a 0,42-0,53 → és un valle clar
            // però mai baixa del 5% ✗. Criteri: silenci si la finestra ≤ 40% del nivell LOCAL
            // (màxim dels buckets de 5s a ±15s), amb el llindar absolut com a terra (5%) per no
            // perdre els silencis de debò. El silenci només CONFIRMA (cap decisió sola).
            var BUCKET_SEC = 5;
            var bucketN = Math.max(1, Math.round(pps * BUCKET_SEC));
            var buckets = [];
            for (var b0 = 0; b0 < wf.peaks.length; b0 += bucketN) {
                var bMax0 = 0;
                for (var b1 = b0; b1 < Math.min(wf.peaks.length, b0 + bucketN); b1++) {
                    if (wf.peaks[b1] > bMax0) bMax0 = wf.peaks[b1];
                }
                buckets.push(bMax0);
            }
            var ratioRel = (typeof o.ratio === 'number') ? o.ratio : 0.40;
            var _thrAt = function (tSec) {
                var bc = Math.floor(tSec / BUCKET_SEC);
                var i0 = Math.max(0, bc - 3), i1 = Math.min(buckets.length - 1, bc + 3);
                var ref = 0;
                for (var bi = i0; bi <= i1; bi++) { if (buckets[bi] > ref) ref = buckets[bi]; }
                return Math.max(thr, ratioRel * ref);
            };
            var _adaptius = 0;
            var out = [], curStart = null;
            for (var i = 0; i < wf.peaks.length; i += winN) {
                var mx = 0;
                for (var j = i; j < Math.min(wf.peaks.length, i + winN); j++) {
                    if (wf.peaks[j] > mx) mx = wf.peaks[j];
                }
                var t0 = i / pps;
                var _lim = _thrAt(t0);
                if (_lim > thr) _adaptius++;
                if (mx <= _lim) {
                    if (curStart === null) curStart = t0;
                } else if (curStart !== null) {
                    var dur = t0 - curStart;
                    if (dur >= minDur) out.push({ start: curStart, end: t0, dur: dur });
                    curStart = null;
                }
            }
            if (curStart !== null) {
                var tEnd = wf.peaks.length / pps;
                if ((tEnd - curStart) >= minDur) out.push({ start: curStart, end: tEnd, dur: tEnd - curStart });
            }
            U.log('🤫 [SILENCI] ' + out.length + ' trams · umbral=' + thr + ' (adaptatiu ' + ratioRel + ' del nivell local a ' + _adaptius + ' finestres) · min=' + minDur + 's · ' +
                (out.length ? out.map(function (s) { return s.start.toFixed(2) + '→' + s.end.toFixed(2) + '(' + s.dur.toFixed(2) + 's)'; }).join(', ') : '(cap)'));
            return out;
        },

        /**
         * Llegeix fitxer .bin (WAV PCM 8-bit unsigned, mono, 480Hz) i retorna peaks 0..1
         * Lectura robusta:
         *   1) Demana Base64 (cep.encoding.Base64) + atob → bytes exactes (evita corrupció UTF-8)
         *   2) Autodetecció: "UklGR" = Base64 de "RIFF" → atob; "RIFF" → bytes crus; sinó → crues
         *   3) Localitza el chunk "data" recorrent els chunks RIFF (fallback: offset 44)
         *   4) v = |byte-128|/maxAbs del bin (normalització fidel, sense saturació)
         *   5) Redueix a densitat fixa (peaksPerSec) amb màxim per grup → zoom solidari
         * @param {string} binPath - Path complet al .bin
         * @param {number} peaksPerSec - Densitat de peaks per segon (defecte 100)
         * @returns {Promise<{peaks:number[], peaksPerSec:number, durSec:number}|null>}
         */
        loadPeaksFromBin: async function (binPath, peaksPerSec) {
            if (!binPath) return null;
            peaksPerSec = peaksPerSec || 100;

            // Cache per path: evita rellegir el mateix .bin (NAS lent) en recàrregues
            var self = FASTPASS_UI.Logic.WaveformGenerator;
            if (!self._peaksCache) self._peaksCache = {};
            if (self._peaksCache[binPath]) return self._peaksCache[binPath];

            try {
                var cepFs = window.cep.fs;
                if (!cepFs || !cepFs.readFile) return null;

                // 1. Llegir demanant Base64 (bytes exactes, sense corrupció UTF-8)
                var enc = (window.cep.encoding && window.cep.encoding.Base64) ? window.cep.encoding.Base64 : "Base64";
                var result = cepFs.readFile(binPath, enc);
                if (result.err !== 0 || !result.data || result.data.length < 4) {
                    // Fallback: sense encoding
                    result = cepFs.readFile(binPath);
                    if (result.err !== 0 || !result.data || result.data.length < 4) return null;
                }

                var data = result.data;

                // 2. Autodetecció del format de dades → obtenir array de bytes
                var bytes = null;
                var i;
                if (data.substring(0, 5) === "UklGR") {
                    // Base64 d'un WAV (RIFF) → decodificar
                    var binStr = atob(data.replace(/\s/g, ''));
                    bytes = new Uint8Array(binStr.length);
                    for (i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                } else if (data.substring(0, 4) === "RIFF") {
                    // String crua del WAV
                    bytes = new Uint8Array(data.length);
                    for (i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xFF;
                } else {
                    // Provar Base64 genèric; si falla, tractar com a bytes crus
                    try {
                        var binStr2 = atob(data.replace(/\s/g, ''));
                        if (binStr2.length > 44) {
                            bytes = new Uint8Array(binStr2.length);
                            for (i = 0; i < binStr2.length; i++) bytes[i] = binStr2.charCodeAt(i);
                        }
                    } catch (eB) { /* no era Base64 */ }
                    if (!bytes) {
                        bytes = new Uint8Array(data.length);
                        for (i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xFF;
                    }
                }

                if (!bytes || bytes.length < 4) return null;

                // 3. Localitzar el chunk "data" del WAV (+ sample rate del fmt)
                var dataOff = 0;
                var dataLen = bytes.length;
                var sampleRate = 480;
                if (bytes.length > 44 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
                    sampleRate = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24)) >>> 0;
                    if (sampleRate < 100 || sampleRate > 192000) sampleRate = 480;
                    var pos = 12;
                    var found = false;
                    while (pos + 8 <= bytes.length) {
                        var id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
                        var size = (bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)) >>> 0;
                        if (id === "data") {
                            dataOff = pos + 8;
                            dataLen = Math.min(size, bytes.length - dataOff);
                            found = true;
                            break;
                        }
                        pos += 8 + size + (size % 2); // chunks alineats a 2
                    }
                    if (!found) { dataOff = 44; dataLen = bytes.length - 44; } // fallback WAV estàndard
                }
                if (dataLen <= 0) return null;

                // 4. Convertir mostres unsigned 8-bit → peaks
                // Normalització FIDEL al perfil real: v = |b-128| / maxAbs del bin.
                // Sense guany x3 ni saturació → el perfil (siluetes/pauses) coincideix
                // amb la forma de la WF del timeline de Premiere (que normalitza pel
                // seu propi màxim).
                var maxAbs = 0;
                for (var b0 = dataOff; b0 < dataOff + dataLen; b0++) {
                    var av0 = Math.abs(bytes[b0] - 128);
                    if (av0 > maxAbs) maxAbs = av0;
                }
                if (maxAbs < 1) maxAbs = 1;
                var rawPeaks = [];
                for (var b = dataOff; b < dataOff + dataLen; b++) {
                    var v = Math.abs(bytes[b] - 128) / maxAbs;
                    if (v > 1) v = 1;
                    rawPeaks.push(v);
                }

                // 5. Reduir a densitat fixa de peaks/segon (màxim de cada grup)
                var step = Math.max(1, Math.floor(sampleRate / peaksPerSec));
                var peaks = [];
                for (var pi = 0; pi * step < rawPeaks.length; pi++) {
                    var maxVal = 0;
                    for (var si = 0; si < step && pi * step + si < rawPeaks.length; si++) {
                        if (rawPeaks[pi * step + si] > maxVal) maxVal = rawPeaks[pi * step + si];
                    }
                    peaks.push(maxVal);
                }

                var out = {
                    peaks: peaks,
                    peaksPerSec: Math.round(sampleRate / step),
                    durSec: rawPeaks.length / sampleRate
                };
                self._peaksCache[binPath] = out;
                return out;

            } catch(e) {
                return null;
            }
        }
    };

    FASTPASS_UI.Logic.PrProjCleaner = {
        getProjectPath: async function () {
            return await window.FASTPASS_UI.Utils.callJSX("(function(){try{return app.project.path}catch(e){return''}})()");
        },
        saveProject: async function () {
            var result = await window.FASTPASS_UI.Utils.callJSX("(function(){try{app.project.save();return'OK'}catch(e){return'ERR:'+e.message}})()");
            return result === "OK";
        },
        removeOldCaptionTracks: async function () {
            var saved = await this.saveProject();
            if (!saved) return { success: false, message: "No s'ha pogut desar el projecte", removedTracks: 0 };
            var projPath = await this.getProjectPath();
            if (!projPath || projPath.indexOf('ERR') === 0 || projPath === "") return { success: false, message: "No s'ha pogut obtenir el path del projecte", removedTracks: 0 };
            return new Promise(function(resolve) {
                try {
                    var cep = window.cep || window.__adobe_cep__;
                    if (!cep || !cep.process) { resolve({ success: false, message: "cep.process no disponible", removedTracks: 0 }); return; }
                    var psArgs = "-ExecutionPolicy Bypass -File \"C:\\temp\\manage_prproj.ps1\" -prprojPath \"" + projPath + "\" -action remove_old_tracks";
                    // (2026-11-02 · #213) ABANS: `cep.process.createProcess("powershell.exe", psArgs)`
                    // amb tots els arguments en UNA cadena (CEP els passa com UN sol
                    // argument → la comanda no s'executava) i amb la finestra de
                    // PowerShell A LA VISTA damunt de Premiere. I el resultat era un
                    // `setTimeout` de 10 s que deia «executat» sense mirar res.
                    var U = window.FASTPASS_UI && window.FASTPASS_UI.Utils;
                    if (!U || typeof U.execHidden !== 'function') {
                        resolve({ success: false, message: "execHidden no disponible", removedTracks: 0 });
                        return;
                    }
                    U.execHidden('powershell -NoProfile ' + psArgs, { timeoutMs: 120000 }).then(function(r) {
                        if (!r || !r.started) { resolve({ success: false, message: "No s'ha pogut llançar PowerShell: " + ((r && r.err) || '?'), removedTracks: 0 }); return; }
                        if (!r.ok) { resolve({ success: false, message: "PowerShell ha fallat (" + (r.err || '?') + "): revisa " + psArgs.split('"')[1], removedTracks: 0 }); return; }
                        resolve({ success: true, message: "PowerShell executat (ocult via " + (r.via || '?') + ")", removedTracks: -1 });
                    }, function(eR) {
                        resolve({ success: false, message: "Excepció: " + ((eR && eR.message) || eR), removedTracks: 0 });
                    });
                } catch(e) { resolve({ success: false, message: "Excepció: " + e.message, removedTracks: 0 }); }
            });
        }
    };

    window.FASTPASS_UI.Logic.SrtParser = FASTPASS_UI.Logic.SrtParser;
    window.SrtParser = FASTPASS_UI.Logic.SrtParser;
    window.FASTPASS_UI.Logic.PrProjCleaner = FASTPASS_UI.Logic.PrProjCleaner;
    window.PrProjCleaner = FASTPASS_UI.Logic.PrProjCleaner;
    window.FASTPASS_UI.Logic.WaveformGenerator = FASTPASS_UI.Logic.WaveformGenerator;
    window.WaveformGenerator = FASTPASS_UI.Logic.WaveformGenerator;
    window.FASTPASS_UI = FASTPASS_UI;
})();