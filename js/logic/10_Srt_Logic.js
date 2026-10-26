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
            var offset = frame10Sec - originalStart;
            for (var i = 1; i < result.length; i++) {
                var r = result[i];
                result[i] = { index: i + 1, timeStr: '', texts: r.texts.slice(), startSec: r.startSec + offset, endSec: r.endSec + offset };
            }
            return result;
        },

        applyTrimOut: function (entries, targetIdx) {
            if (!entries || entries.length === 0) return [];
            if (targetIdx < 0 || targetIdx >= entries.length) return [];
            var result = entries.slice(0, targetIdx + 1);
            for (var i = 0; i < result.length; i++) result[i] = { index: i + 1, timeStr: '', texts: result[i].texts.slice(), startSec: result[i].startSec, endSec: result[i].endSec };
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
                result.push({ index: i + 1, timeStr: '', texts: e.texts.slice(), startSec: newStart, endSec: newStart + oldDur * ratio });
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
                return clips.map(function (c) { return { index: c.index, timeStr: c.timeStr, texts: c.texts.slice(), startSec: c.startSec, endSec: c.endSec }; });
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
                result.push({ index: i + 1, timeStr: '', texts: clips[i].texts.slice(), startSec: s, endSec: e });
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
         * mergeSyntheticGaps: fusiona el SRT normal amb els SINTETICS.
         * Nomes AFEGEIX; les entrades existents MAI es toquen (start/end/text).
         *
         * (2026-10-23 · BUG #188) RETALL: un sintetic que no cap EXACTE dins del
         * buit no es descarta — s'ENCOGEIX fins a la vora del buit (com fa un
         * subtitulador a ma), sempre que el retall no passe de `maxTrimSec` ni la
         * durada final quede per davall de `minDurSec`. Els que se solapen de ple
         * amb un subtitol existent (o que no hi caben) es descarten amb el motiu.
         *
         * @param {Array} baseEntries - SRT normal
         * @param {Array} sintEntries - SRT sintetic (font de les entrades noves)
         * @param {Object} [opts] { tolSec=0.2, minDurSec=0.4, maxTrimSec=0.8,
         *                         includeEdges=false, textNearSec=10 }
         * @returns {{entries:Array, added:Array, rejected:Array, gaps:Array,
         *            tolSec:number, minDurSec:number, maxTrimSec:number,
         *            trimmed:number, sintCount:number}}
         *   added:    {startSec,endSec,texts,reason:'buit'|'buit-ajustada',trimSec}
         *   rejected: {startSec,endSec,texts,reason:'solapa'|'duplicat'|'duplicat-text'|
         *              'fora-del-tram'|'massa-curt'|'no-cab'}
         */
        mergeSyntheticGaps: function (baseEntries, sintEntries, opts) {
            var o = opts || {};
            var tol = (o.tolSec != null && isFinite(Number(o.tolSec))) ? Number(o.tolSec) : 0.2;
            if (tol < 0) tol = 0;
            // (BUG #188) Quants segons pot ENCOGIR-SE un sintetic per encabir-lo al
            // buit i quina durada minima ha de conservar despres del retall.
            var minDur = (o.minDurSec != null && isFinite(Number(o.minDurSec))) ? Number(o.minDurSec) : 0.4;
            var maxTrim = (o.maxTrimSec != null && isFinite(Number(o.maxTrimSec))) ? Number(o.maxTrimSec) : 0.8;
            if (minDur < 0) minDur = 0;
            if (maxTrim < 0) maxTrim = 0;
            var base = this.cloneEntries(baseEntries).sort(function (a, b) { return a.startSec - b.startSec; });
            var sint = this.cloneEntries(sintEntries).sort(function (a, b) { return a.startSec - b.startSec; });
            var info = this.findGaps(base);
            var out = {
                entries: base, added: [], rejected: [], gaps: info.gaps, tolSec: tol,
                minDurSec: minDur, maxTrimSec: maxTrim, trimmed: 0, sintCount: sint.length
            };
            if (sint.length === 0) return out;
            if (base.length === 0) return out;   // sense SRT normal no hi ha res a reomplir

            var fromSec = (o.includeEdges) ? -Infinity : info.firstSec;
            var toSec = (o.includeEdges) ? Infinity : info.lastSec;

            // (BUG #188) BUITS LLIURES: els que hi ha entre les entrades existents.
            // Es van retallant a mesura que s'hi col·loca un sintetic, aixi el
            // seguent ja no pot envair el que s'acaba d'afegir.
            var free = info.gaps.map(function (g) { return { startSec: g.startSec, endSec: g.endSec }; });
            if (o.includeEdges && info.firstSec != null) {
                free.unshift({ startSec: info.firstSec - 36000, endSec: info.firstSec });
                free.push({ startSec: info.lastSec, endSec: info.lastSec + 36000 });
            }

            var accepted = [];   // intervals ja afegits (anti-duplicat)
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
            for (var i = 0; i < sint.length; i++) {
                var s = sint[i];
                var rec = { startSec: s.startSec, endSec: s.endSec, texts: s.texts.slice(), reason: '', trimSec: 0 };
                // 1) Fora del tram amb contingut real
                if (s.startSec < fromSec - tol || s.endSec > toSec + tol) {
                    rec.reason = 'fora-del-tram';
                    out.rejected.push(rec);
                    continue;
                }
                // 2) El MATEIX TEXT ja existeix al SRT normal (TC a ±`near` s) → és el
                //     mateix subtítol dit d'una altra manera de comptar → no s'afegeix.
                var kS = this._normText((s.texts || []).join(' '));
                var hits = kS ? baseTextIdx[kS] : null;
                if (hits) {
                    var dupText = false;
                    for (var hh = 0; hh < hits.length; hh++) {
                        if (Math.abs(hits[hh].startSec - s.startSec) <= near ||
                            Math.abs(hits[hh].endSec - s.endSec) <= near) { dupText = true; break; }
                    }
                    if (dupText) {
                        rec.reason = 'duplicat-text';
                        out.rejected.push(rec);
                        continue;
                    }
                }
                // 3) Duplicat respecte d'una altra sintetica ja acceptada (els .srt
                //    sintetics no se solapen entre ells: si ho fan, és la mateixa frase).
                var clash = false;
                for (var a = 0; a < accepted.length; a++) {
                    if (this._overlaps(s.startSec, s.endSec, accepted[a].startSec, accepted[a].endSec, tol)) { clash = true; break; }
                }
                if (clash) {
                    rec.reason = 'duplicat';
                    out.rejected.push(rec);
                    continue;
                }
                // 4) (BUG #188) QUIN BUIT HI HA DAVALL: el buit lliure que més hi
                //    encaixa. Si el sintetic el sobreïx una mica, s'ENCOGEIX fins a
                //    la vora (mai més de `maxTrimSec`) en lloc de llençar-lo.
                var best = null, bestOv = 0, bestIdx = -1;
                for (var f = 0; f < free.length; f++) {
                    var ov = Math.min(s.endSec, free[f].endSec) - Math.max(s.startSec, free[f].startSec);
                    if (ov > bestOv) { bestOv = ov; best = free[f]; bestIdx = f; }
                }
                if (!best || bestOv <= 0.0001) {
                    rec.reason = 'solapa';
                    out.rejected.push(rec);
                    continue;
                }
                var cs = Math.max(s.startSec, best.startSec);
                var ce = Math.min(s.endSec, best.endSec);
                var durOk = (ce - cs);
                var trim = (s.endSec - s.startSec) - durOk;
                if (durOk + 0.0001 < minDur) {
                    rec.reason = 'massa-curt';
                    rec.freeSec = durOk;
                    out.rejected.push(rec);
                    continue;
                }
                if (trim > maxTrim + 0.0001) {
                    rec.reason = 'no-cab';
                    rec.trimSec = trim;
                    out.rejected.push(rec);
                    continue;
                }
                // 5) Acceptada: es queda amb els temps RETALLATS al buit
                rec.startSec = cs;
                rec.endSec = ce;
                rec.trimSec = (trim > 0.0005) ? trim : 0;
                rec.reason = rec.trimSec > 0 ? 'buit-ajustada' : 'buit';
                if (rec.trimSec > 0) out.trimmed++;
                // El buit queda partit (o esgotat) pel que s'acaba de col·locar.
                // Es reemplaça el buit TRIAT (bestIdx), no el darrer del bucle.
                free.splice(bestIdx, 1, { startSec: best.startSec, endSec: cs }, { startSec: ce, endSec: best.endSec });
                var free2 = [];
                for (var f2 = 0; f2 < free.length; f2++) {
                    if (free[f2].endSec - free[f2].startSec > 0.0001) free2.push(free[f2]);
                }
                free = free2;
                accepted.push({ startSec: cs, endSec: ce });
                out.added.push(rec);
            }

            if (out.added.length === 0) return out;

            // 6) Fusionar i reindexar (les existents conserven start/end/texts).
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
                    cep.process.createProcess("powershell.exe", psArgs);
                    setTimeout(function() { resolve({ success: true, message: "PowerShell executat", removedTracks: -1 }); }, 10000);
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