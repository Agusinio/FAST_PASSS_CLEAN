/**
 * ============================================================================
 * FASTPASS_UI.Core.AnalysisCenter — FONT ÚNICA de l'anàlisi de projecte
 * ============================================================================
 * Centralitza TOTES les dades d'anàlisi del projecte dins el manifest de
 * sessió (`.fastpass.json`, SessionManifest v2.0) i en deriva la VISTA MESTRA
 * per ítem (`structure.items[]`).
 *
 * Seccions que escriu (vegeu docs/specs/FASTPASS_JSON_SPEC.md):
 *
 *   media.clipsV1   ← clips de la pista V1 en el moment del càlcul
 *   markers.list    ← marcadors de la seqüència (snapshot CRU, no derivat)
 *   chyrons         ← rètols importats al bin + col·locats
 *   graphics.list   ← grafismes col·locats (TITOLET, Tema-Títol, fons…)
 *   analysis.*      ← mirall del JSON d'anàlisi (crudo/cocinado/usuario/meta)
 *   structure.items ← TAULA MESTRA: ítem + TC + marker + clips + rètols + grafismes
 *
 * REGLA D'OR: cap flux no ha de derivar l'anàlisi pel seu compte. Els fluxos
 * escriuen passant per aquí i TOTS els consumidors llegeixen del manifest; els
 * fitxers derivats (MARCADORS_*.txt/.json, analisis_estructura/*.json) són
 * NOMÉS MIRALLS llegibles per a humans.
 *
 * Depèn de: Utils (log), SessionManifest (load/update/saveSection/flush).
 *           Opcionalment: EscaletaReader (parseDurada/tcToSeconds) i
 *           Workflows.Markers (isIpdLine) per no duplicar regles.
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Core = FASTPASS_UI.Core || {};

    var SM = function () { return window.FASTPASS_UI.SessionManifest; };
    var U = function () { return window.FASTPASS_UI.Utils; };
    var log = function (m, lvl) { try { U().log(m, lvl || 'DEBUG'); } catch (e) { /* Utils no carregat */ } };

    /** Classes d'ítem (docs/specs/ITEM_CLASSIFICATION.md §3) */
    var CLASSE = { ESTRUCTURAL: 'ESTRUCTURAL', IPD: 'IPD', GRAFIC: 'GRAFIC' };

    /** Colors de marcador de Premiere (docs/specs/MARKER_COLORS.md) */
    var COLOR = { VERMELL: 1, GROC: 4, BLAU: 6, TURQUESA: 7 };

    var DEFAULT_FPS = 25;

    // ────────────────────────────────────────────────────────────────────────
    // 1. UTILITATS TEMPORALS I DE CLASSIFICACIÓ
    // ────────────────────────────────────────────────────────────────────────

    /** parseDur: "M:SS" | "MM:SS" | "H:MM:SS" | "SS" → segons (0 si no es pot) */
    function parseDur(str) {
        if (str === null || str === undefined || str === '') return 0;
        if (typeof str === 'number') return isFinite(str) ? str : 0;
        try {
            var ER = window.FASTPASS_UI.EscaletaReader;
            if (ER && typeof ER.parseDurada === 'function') {
                var v = ER.parseDurada(str);
                if (typeof v === 'number' && !isNaN(v)) return v;
            }
        } catch (e) { /* cau al parser local */ }
        var parts = String(str).trim().split(':');
        var sec = 0;
        for (var i = 0; i < parts.length; i++) {
            var n = parseFloat(parts[i]);
            if (isNaN(n)) return 0;
            sec = sec * 60 + n;
        }
        return sec;
    }

    /** tcToSec: "HH:MM:SS" → segons (null si no és una hora vàlida) */
    function tcToSec(str) {
        if (!str) return null;
        try {
            var ER = window.FASTPASS_UI.EscaletaReader;
            if (ER && typeof ER.tcToSeconds === 'function') {
                var v = ER.tcToSeconds(str);
                if (typeof v === 'number' && !isNaN(v)) return v;
            }
        } catch (e) { /* cau al parser local */ }
        var p = String(str).trim().split(':');
        if (p.length < 2) return null;
        var s = 0;
        for (var i = 0; i < p.length; i++) {
            var n = parseFloat(p[i]);
            if (isNaN(n)) return null;
            s = s * 60 + n;
        }
        return s;
    }

    /** secToTc: segons → "HH:MM:SS:FF" (fps per defecte 25) */
    function secToTc(sec, f) {
        var rate = (typeof f === 'number' && f > 0) ? f : DEFAULT_FPS;
        var pad = function (n, w) { var t = String(n); while (t.length < w) t = '0' + t; return t; };
        var s = Math.max(0, Number(sec) || 0);
        var h = Math.floor(s / 3600);
        var m = Math.floor((s % 3600) / 60);
        var ss = Math.floor(s % 60);
        var ff = Math.floor((s - Math.floor(s)) * rate + 0.0001);
        if (ff >= rate) ff = rate - 1;
        return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(ss, 2) + ':' + pad(ff, 2);
    }

    /**
     * numParts: "02DP" → {num:'02DP', digits:'02', digitsKey:'2', suffix:'DP'}
     *   · num       → la cadena tal com consta ("02DP")
     *   · digits    → els dígits TAL COM consten ("02"): és el que es desa i es mostra.
     *   · digitsKey → els dígits SENSE zeros de davant ("2"): clau de COMPARACIÓ, per
     *                 tal que «02DP», «02» i «2» lliguin entre escaleta, marcadors i
     *                 registres de rètols/grafismes.
     *   · suffix    → el sufix alfabètic en majúscules ("DP")
     */
    function numParts(raw) {
        var s = String(raw === null || raw === undefined ? '' : raw).trim();
        var m = s.match(/^(0*\d+)\s*([A-Za-z\u00C0-\u017F]*)$/);
        if (!m) return { num: s, digits: '', digitsKey: '', suffix: '' };
        return { num: s, digits: m[1], digitsKey: (m[1].replace(/^0+/, '') || '0'),
                 suffix: (m[2] || '').toUpperCase() };
    }

    /** isIpd: delega a Workflows.Markers.isIpdLine si existeix (font única de la regla) */
    function isIpd(item) {
        try {
            var MK = window.FASTPASS_UI.Workflows && window.FASTPASS_UI.Workflows.Markers;
            if (MK && typeof MK.isIpdLine === 'function') return !!MK.isIpdLine(item);
        } catch (e) { /* cau a la regla local */ }
        return /IPD/i.test(String((item && item.num) || '') + ' ' + String((item && item.titol) || ''));
    }

    /** fpsOf: fps del manifest (media.fps → ref.fps → 25) */
    function fpsOf(manifest) {
        var f = manifest && manifest.media && manifest.media.fps;
        if (typeof f === 'number' && f > 0) return f;
        if (manifest && manifest.ref && typeof manifest.ref.fps === 'number' && manifest.ref.fps > 0) return manifest.ref.fps;
        return DEFAULT_FPS;
    }



    // ────────────────────────────────────────────────────────────────────────
    // 2. MÒDUL
    // ────────────────────────────────────────────────────────────────────────

    FASTPASS_UI.Core.AnalysisCenter = {

        VERSION: '1.0',
        CLASSE: CLASSE,
        COLOR: COLOR,
        DEFAULT_FPS: DEFAULT_FPS,

        parseDur: parseDur,
        tcToSec: tcToSec,
        secToTc: secToTc,
        numParts: numParts,
        fpsOf: fpsOf,

        /**
         * classifyItem: Classifica un ítem d'escaleta segons
         * docs/specs/ITEM_CLASSIFICATION.md §3 i en resol el color de marcador
         * segons docs/specs/MARKER_COLORS.md.
         * @param {Object} item - línia d'escaleta
         * @returns {Object} { classe, isIpd, ungrouped, colorIdx, duradaSec, duradaOnAirSec, duradaEfectivaSec, agrupacio, teVideo }
         */
        classifyItem: function (item) {
            var it = item || {};
            var dSec = parseDur(it.durada);
            var dOnAir = (it.duradaOnAir === null || it.duradaOnAir === undefined || it.duradaOnAir === '')
                ? null : parseDur(it.duradaOnAir);
            var agrupacio = (it.agrupacio === null || it.agrupacio === undefined || it.agrupacio === '')
                ? null : it.agrupacio;
            var ipd = isIpd(it);

            var classe;
            if (ipd) classe = CLASSE.IPD;
            else if (dSec > 0) classe = CLASSE.ESTRUCTURAL;
            else if (agrupacio !== null && dOnAir !== null) classe = CLASSE.IPD;
            else classe = CLASSE.GRAFIC;

            // Color (MARKER_COLORS.md): IPD → turquesa · amb agrupacio → blau ·
            // sense grup → vermell si té durada, groc si no.
            var colorIdx;
            if (ipd) colorIdx = COLOR.TURQUESA;
            else if (agrupacio !== null) colorIdx = COLOR.BLAU;
            else colorIdx = parseDur(it.durada || it.duradaOnAir || '0:00') > 0 ? COLOR.VERMELL : COLOR.GROC;

            return {
                classe: classe,
                isIpd: ipd,
                ungrouped: (agrupacio === null && classe === CLASSE.ESTRUCTURAL),
                colorIdx: colorIdx,
                agrupacio: agrupacio,
                duradaSec: dSec,
                duradaOnAirSec: dOnAir,
                duradaEfectivaSec: (dSec > 0 ? dSec : (dOnAir || 0)),
                teVideo: it.teVideo === true
            };
        },

        /** _key: clau de deduplicació d'un registre (num|nom|pista)
         *  (2026-10-15) Si el registre porta `key` EXPLÍCITA, mana aquesta. Així els
         *  grafismes (F5) poden tenir identitat AMB temps (`fons|4|123.45`) i no es
         *  col·lapsen dues col·locacions del MATEIX fitxer a la MATEIXA pista, sense
         *  tocar la semàntica dels rètols (`num|name|track`, vegeu F4/F5). */
        _key: function (rec) {
            var r = rec || {};
            if (r.key !== undefined && r.key !== null && String(r.key) !== '') return String(r.key);
            return [r.num || '', r.name || (r.tipus || ''), r.track === undefined ? '' : r.track].join('|');
        },

        /** _mergeList: fusiona `records` dins de `list` amb clau `_key` (els nous substitueixen els vells) */
        _mergeList: function (list, records) {
            var self = this;
            var out = Array.isArray(list) ? list.slice() : [];
            var recs = Array.isArray(records) ? records : [records];
            for (var i = 0; i < recs.length; i++) {
                var rec = recs[i];
                if (!rec) continue;
                var k = self._key(rec);
                var found = -1;
                for (var j = 0; j < out.length; j++) {
                    if (self._key(out[j]) === k) { found = j; break; }
                }
                if (found >= 0) out[found] = rec; else out.push(rec);
            }
            return out;
        },

        /** _now: ISO timestamp de l'instant actual */
        _now: function () { return new Date().toISOString(); },

        // ────────────────────────────────────────────────────────────────
        // 3. ESCRIPTURA DE SECCIONS AL MANIFEST
        // ────────────────────────────────────────────────────────────────

        /**
         * record: Construeix un registre homogeni (clip / rètol / gràfic).
         * @param {string} name - nom del clip al projecte
         * @param {number} track - índex de pista (1-based, com a Premiere)
         * @param {number} startSec
         * @param {number} [endSec]
         * @param {Object} [extra] - camps addicionals (num, tipus, itemNum…)
         * @returns {Object}
         */
        record: function (name, track, startSec, endSec, extra) {
            var rec = {
                name: String(name === null || name === undefined ? '' : name),
                track: (track === null || track === undefined) ? null : track,
                startSec: Number(startSec) || 0
            };
            if (endSec !== null && endSec !== undefined && !isNaN(Number(endSec))) {
                rec.endSec = Number(endSec);
                rec.durSec = Math.max(0, Number(endSec) - rec.startSec);
            }
            var e = extra || {};
            for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k) && e[k] !== undefined) rec[k] = e[k]; }
            return rec;
        },

        /**
         * writeMany: Aplica un pedaç de seccions al manifest, recalcula
         * `structure` i l'escriu (una sola escriptura per a tot el pedaç).
         * @param {Object} ctx
         * @param {Object} patch - { section: valor, … }
         * @param {Object} [opts] - { rebuild:false, write:false, reason }
         * @returns {Promise<Object|null>} manifest actualitzat
         */
        writeMany: async function (ctx, patch, opts) {
            var sm = SM();
            if (!ctx || !sm) return null;
            var o = opts || {};
            var m = await sm.update(ctx, function (man) {
                for (var k in patch) {
                    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
                    var v = patch[k];
                    if (Array.isArray(v)) man[k] = v;
                    else if (v && typeof v === 'object') man[k] = sm._deepMerge(man[k] || {}, v);
                    else man[k] = v;
                }
            });
            if (o.rebuild !== false) sm._rebuild(m, o.reason || 'analysis');
            if (o.write !== false) await sm.flush(ctx);
            return m;
        },

        /**
         * writeMedia: Registra els clips de V1 (veritat física de la seqüència).
         * @param {Object} ctx
         * @param {Array} clips - sortida de Clips.getTrackClips
         * @param {Object} [opts] - { track:1, label:'', fps, write:true }
         */
        writeMedia: async function (ctx, clips, opts) {
            var o = opts || {};
            var list = [];
            var arr = Array.isArray(clips) ? clips : [];
            for (var i = 0; i < arr.length; i++) {
                var c = arr[i] || {};
                var rec = this.record(c.name || c.fileName || '', (o.track === undefined ? 1 : o.track), c.start, c.end);
                rec.index = i;
                rec.inPointSec = (c.inPoint !== undefined) ? c.inPoint : (c.inPointSec !== undefined ? c.inPointSec : null);
                list.push(rec);
            }
            var first = list.length ? list[0].startSec : null;
            var last = list.length ? (list[list.length - 1].endSec !== undefined ? list[list.length - 1].endSec : null) : null;
            return await this.writeMany(ctx, {
                media: {
                    updatedAt: this._now(),
                    source: o.label || 'Clips.getTrackClips',
                    track: (o.track === undefined ? 1 : o.track),
                    fps: (o.fps || fpsOf(await SM().load(ctx))),
                    clipCount: list.length,
                    firstStartSec: first,
                    lastEndSec: last,
                    clipsV1: list
                }
            }, o);
        },

        /**
         * writeMarkers: Desa el snapshot CRU dels marcadors de la seqüència
         * (posició, comentari, color). És la font dels TCs de la vista mestra.
         * @param {Object} ctx
         * @param {Array} list - sortida de Markers.get()
         * @param {Object} [opts] - { source, write }
         */
        writeMarkers: async function (ctx, list, opts) {
            var o = opts || {};
            var rate = fpsOf(await SM().load(ctx));
            var arr = Array.isArray(list) ? list : [];
            var out = [];
            for (var i = 0; i < arr.length; i++) {
                var m = arr[i] || {};
                var t = Number((typeof m.time === 'number') ? m.time : parseFloat(m.time));
                if (isNaN(t)) t = 0;
                var cmt = String(m.comments || m.comment || '').replace(/\r?\n/g, ' ');
                var p = numParts(cmt.split(/\s|·|-/)[0] || '');
                out.push({
                    index: i,
                    timeSec: t,
                    tc: secToTc(t, rate),
                    color: (m.color === undefined || m.color === null) ? -1 : m.color,
                    comment: cmt,
                    name: (m.name || ''),
                    num: p.num,
                    numDigits: p.digits
                });
            }
            return await this.writeMany(ctx, {
                markers: { updatedAt: this._now(), source: o.source || 'Markers.get()', count: out.length, list: out }
            }, o);
        },

        /**
         * writeChyronsPlaced: Afegeix/actualitza rètols COL·LOCATS a la línia de
         * temps (secció `chyrons.placed`). La clau de deduplicació és
         * `num|name|track`: tornar a col·locar el mateix rètol actualitza el registre.
         * @param {Object} ctx
         * @param {Array} records - registres de `record()` amb num/tipus/rol/startSec
         * @param {Object} [opts] - { bin, write, rebuild }
         */
        writeChyronsPlaced: async function (ctx, records, opts) {
            var o = opts || {};
            var sm = SM();
            if (!ctx) return null;
            var m = await sm.load(ctx);
            var cur = (m.chyrons && m.chyrons.placed) || [];
            var nowIso = this._now();
            var recs = (Array.isArray(records) ? records : [records]).filter(Boolean).map(function (r) {
                var copy = {};
                for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) copy[k] = r[k]; }
                if (!copy.at) copy.at = nowIso;
                return copy;
            });
            var merged = this._mergeList(cur, recs);
            var patch = {
                chyrons: {
                    updatedAt: nowIso,
                    countPlaced: merged.length,
                    placed: merged
                }
            };
            if (o.bin) patch.chyrons.bin = o.bin;
            return await this.writeMany(ctx, patch, o);
        },

        /**
         * writeChyronsImported: Registra els rètols IMPORTATS al projecte
         * (secció `chyrons.imported`). Deduplicació per `name`.
         * @param {Object} ctx
         * @param {Array} records - [{ name, bin, nasPath, ok }]
         * @param {Object} [opts] - { bin, write, rebuild }
         */
        writeChyronsImported: async function (ctx, records, opts) {
            var o = opts || {};
            var sm = SM();
            if (!ctx) return null;
            var m = await sm.load(ctx);
            var cur = (m.chyrons && m.chyrons.imported) || [];
            var nowIso = this._now();
            var recs = (Array.isArray(records) ? records : [records]).filter(Boolean);
            for (var i = 0; i < recs.length; i++) {
                if (!recs[i].at) recs[i].at = nowIso;
                var found = -1;
                for (var j = 0; j < cur.length; j++) {
                    if ((cur[j] && cur[j].name) === recs[i].name) { found = j; break; }
                }
                if (found >= 0) cur[found] = recs[i]; else cur.push(recs[i]);
            }
            var patch = {
                chyrons: { updatedAt: nowIso, countImported: cur.length, imported: cur }
            };
            if (o.bin) patch.chyrons.bin = o.bin;
            return await this.writeMany(ctx, patch, o);
        },

        /**
         * writeGraphics: Afegeix/actualitza GRAFISMES col·locats (TITOLET,
         * Tema-Títol, fons…). Deduplicació per `tipus|name|track|start`.
         * @param {Object} ctx
         * @param {Array} records - registres de `record()` + { tipus, itemNum }
         * @param {Object} [opts] - { write, rebuild }
         */
        writeGraphics: async function (ctx, records, opts) {
            var o = opts || {};
            var sm = SM();
            if (!ctx) return null;
            var m = await sm.load(ctx);
            var cur = (m.graphics && m.graphics.list) || [];
            var nowIso = this._now();
            var recs = (Array.isArray(records) ? records : [records]).filter(Boolean).map(function (r) {
                var copy = {};
                for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) copy[k] = r[k]; }
                if (!copy.at) copy.at = nowIso;
                return copy;
            });
            var merged = this._mergeList(cur, recs);
            return await this.writeMany(ctx, {
                graphics: { updatedAt: nowIso, count: merged.length, list: merged }
            }, o);
        },

        /**
         * writeAnalysis: MIRALL de les fases del JSON d'anàlisi dins del manifest
         * (secció `analysis`). Només sobreescriu les claus que arriben.
         * @param {Object} ctx
         * @param {Object} data - { file, meta, escaleta, crudo, cocinado, usuario }
         * @param {Object} [opts] - { file, write, rebuild }
         */
        writeAnalysis: async function (ctx, data, opts) {
            var o = opts || {};
            if (!ctx || !data || typeof data !== 'object') return null;
            var sec = { updatedAt: this._now() };
            if (o.file) sec.file = o.file;
            var keys = ['meta', 'escaleta', 'crudo', 'cocinado', 'usuario'];
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (data[k] !== undefined && data[k] !== null) sec[k] = data[k];
            }
            return await this.writeMany(ctx, { analysis: sec }, o);
        },

        /**
         * markPhase: Marca una fase del manifest com a feta (`phases.*`).
         * @param {Object} ctx
         * @param {string} key - p.ex. 'markersPlaced'
         * @param {*} [value] - per defecte true
         * @param {Object} [opts]
         */
        markPhase: async function (ctx, key, value, opts) {
            var o = opts || {};
            if (!ctx || !key) return null;
            var patch = { phases: {} };
            patch.phases[key] = (value === undefined ? true : value);
            return await this.writeMany(ctx, patch, o);
        },

        // ────────────────────────────────────────────────────────────────
        // 4. VISTA MESTRA: structure.items[]
        // ────────────────────────────────────────────────────────────────

        /** getStructure: ítems de la vista mestra del manifest */
        getStructure: function (manifest) {
            return (manifest && manifest.structure && manifest.structure.items) || [];
        },

        /** findItem: cerca un ítem de `structure.items` pel seu num ("02" o "02DP") */
        findItem: function (manifest, num) {
            var items = this.getStructure(manifest);
            var want = numParts(num);
            for (var i = 0; i < items.length; i++) {
                var it = numParts(items[i].num);
                if (items[i].num === num) return items[i];
                if (want.num && it.num === want.num) return items[i];
                if (want.digitsKey && it.digitsKey === want.digitsKey) return items[i];
            }
            return null;
        },

        /** _clipsInWindow: clips de V1 que solapen la finestra [wIn, wOut] */
        _clipsInWindow: function (list, wIn, wOut) {
            var out = [];
            if (!Array.isArray(list)) return out;
            for (var i = 0; i < list.length; i++) {
                var c = list[i] || {};
                var cs = Number(c.startSec);
                var ce = (c.endSec === undefined || c.endSec === null) ? cs : Number(c.endSec);
                if (!isFinite(cs) || !isFinite(ce)) continue;
                if (ce <= wIn || cs >= wOut) continue;
                out.push({
                    index: c.index,
                    name: c.name,
                    startSec: cs,
                    endSec: ce,
                    durSec: Math.max(0, ce - cs),
                    inPointSec: (c.inPointSec === undefined ? null : c.inPointSec),
                    overlapSec: Math.max(0, Math.min(ce, wOut) - Math.max(cs, wIn))
                });
            }
            return out;
        },

        /**
         * _insideWindow: registres (rètols/grafismes) d'un ítem: els que cauen
         * dins la finestra temporal o els que duen el mateix número d'ítem.
         */
        _insideWindow: function (list, wIn, wOut, itemNum) {
            var out = [];
            if (!Array.isArray(list)) return out;
            var want = numParts(itemNum);
            var seen = {};
            for (var i = 0; i < list.length; i++) {
                var r = list[i] || {};
                var t = Number(r.startSec);
                var byTime = (isFinite(t) && wIn !== null && wOut !== null && t >= (wIn - 0.5) && t <= (wOut + 0.5));
                var byNum = false;
                if (!byTime && r.num && itemNum && want.digitsKey) {
                    var rp = numParts(r.num);
                    byNum = !!(rp.digitsKey && rp.digitsKey === want.digitsKey);
                }
                if (!byTime && !byNum) continue;
                var k = String(r.name) + '|' + (isFinite(t) ? t.toFixed(2) : '');
                if (seen[k]) continue;
                seen[k] = true;
                out.push(r);
            }
            return out;
        },

        /** _normalizeMark: normalitza un marcador d'una fase d'anàlisi (in/out) */
        _normalizeMark: function (raw) {
            if (!raw || typeof raw !== 'object') return null;
            var pick = function (numKeys, tcKeys) {
                var i, v;
                for (i = 0; i < numKeys.length; i++) {
                    v = raw[numKeys[i]];
                    if (typeof v === 'number' && isFinite(v)) return v;
                }
                for (i = 0; i < tcKeys.length; i++) {
                    v = tcToSec(raw[tcKeys[i]]);
                    if (v !== null) return v;
                }
                return null;
            };
            var inSec = pick(['inSec', 'in', 'inPoint', 'inPointSec'], ['inTc', 'inTC', 'inTimecode']);
            var outSec = pick(['outSec', 'out', 'outPoint', 'outPointSec'], ['outTc', 'outTC', 'outTimecode']);
            return {
                num: raw.num || raw.item || '',
                inSec: inSec,
                outSec: outSec,
                durSec: (inSec !== null && outSec !== null) ? Math.max(0, outSec - inSec) : null,
                color: (raw.color === undefined ? null : raw.color),
                raw: raw
            };
        },

        /** _marksOf: marcadors de les fases d'anàlisi (crudo/cocinado/usuario) d'un ítem */
        _marksOf: function (manifest, num) {
            var out = { crudo: null, cocinado: null, usuario: null };
            if (!num) return out;
            var phases = ['crudo', 'cocinado', 'usuario'];
            var want = numParts(num);
            for (var i = 0; i < phases.length; i++) {
                var ph = (manifest.analysis && manifest.analysis[phases[i]]) || {};
                var list = [];
                if (Array.isArray(ph.marks)) list = ph.marks;
                else if (ph.marks && Array.isArray(ph.marks.list)) list = ph.marks.list;
                for (var j = 0; j < list.length; j++) {
                    var rp = numParts(list[j] && list[j].num);
                    if (rp.num === want.num || (want.digitsKey && rp.digitsKey === want.digitsKey)) {
                        out[phases[i]] = this._normalizeMark(list[j]);
                        break;
                    }
                }
            }
            return out;
        },

        /**
         * composeStructure: Construeix la VISTA MESTRA per ítem i l'assigna a
         * `manifest.structure`. Funció SÍNCRONA (el hook `_rebuild` del manifest
         * també ho és): només llegeix el manifest, mai la línia de temps.
         *
         * (2026-10-15 · v2.0) L'ENTRADA és `SM.getEscaletaItems()` (master
         * `escaletaItems` → mirall `analysis.escaleta.itemsBloc` → vista
         * `structure`), NO `SM.getItems()`. Per què: `getItems()` preferiria la
         * PRÒPIA vista `structure` i la recomposició es realimentaria amb la
         * vista VELLA — en tornar a prémer «Muntar» (que reescriu
         * `escaletaItems`) o en desar el mirall de l'anàlisi, la vista es
         * quedava clavada amb les hores/clips antics. La vista sempre s'ha de
         * derivar de l'escaleta mare; només si no n'hi ha cap (ni master ni
         * mirall) s'accepta recompondre des de la vista existent (idempotent).
         * @param {Object} manifest
         * @param {Object} [opts] - { reason, fps }
         * @returns {Object} secció `structure`
         */
        composeStructure: function (manifest, opts) {
            var self = this;
            var o = opts || {};
            if (!manifest) return null;
            var rate = o.fps || fpsOf(manifest);
            var items = (SM().getEscaletaItems(manifest) || []);
            var mList = (manifest.markers && manifest.markers.list) || [];
            var clipsV1 = (manifest.media && manifest.media.clipsV1) || [];
            var placed = (manifest.chyrons && manifest.chyrons.placed) || [];
            var gfx = (manifest.graphics && manifest.graphics.list) || [];

            // Índex de marcadors de timeline: per num sencer i per dígits.
            var mkByNum = {};
            for (var mi = 0; mi < mList.length; mi++) {
                var mk = mList[mi] || {};
                var mp = numParts(mk.num || mk.comment);
                if (mp.num) mkByNum[mp.num.toUpperCase()] = mk;
                if (mp.digitsKey && mkByNum['#' + mp.digitsKey] === undefined) mkByNum['#' + mp.digitsKey] = mk;
            }

            var out = [];
            var cursorEnd = null;   // per ítems sense hora: encadenar amb l'anterior
            for (var k = 0; k < items.length; k++) {
                var it = items[k] || {};
                var c = self.classifyItem(it);
                var np = numParts(it.num);
                var effective = c.duradaEfectivaSec;

                var inPrev = tcToSec(it.horaEntradaPrevista);
                var outPrev = tcToSec(it.horaSortidaPrevista);
                var inOnAir = tcToSec(it.horaEntradaOnAir);
                var outOnAir = tcToSec(it.horaSortidaOnAir);
                if (outPrev === null && inPrev !== null && effective > 0) outPrev = inPrev + effective;
                if (outOnAir === null && inOnAir !== null && effective > 0) outOnAir = inOnAir + effective;

                // Finestra al timeline: OnAir > Prevista > deduïda (encadenada)
                var wIn = (inOnAir !== null) ? inOnAir : inPrev;
                var wOut = (outOnAir !== null) ? outOnAir : outPrev;
                var wSrc = (inOnAir !== null) ? 'onAir' : (inPrev !== null ? 'prevista' : 'cap');
                if (wIn === null && cursorEnd !== null) { wIn = cursorEnd; wSrc = 'deduida'; }
                if (wOut === null && wIn !== null) wOut = wIn + effective;
                if (wOut !== null) cursorEnd = wOut;

                var marker = mkByNum[np.num.toUpperCase()] ||
                    (np.digitsKey ? mkByNum['#' + np.digitsKey] : null) || null;
                var itemTimeSec = marker ? marker.timeSec
                    : (inOnAir !== null ? inOnAir : (inPrev !== null ? inPrev : null));

                out.push({
                    index: k,
                    lineId: (it.lineID || it.lineId || null),
                    sequencia: (it.sequencia === undefined ? null : it.sequencia),
                    num: it.num || '',
                    numDigits: np.digits,
                    titol: it.titol || '',
                    agrupacio: c.agrupacio,
                    flotant: it.flotant === true,
                    classe: c.classe,
                    isIpd: c.isIpd,
                    ungrouped: c.ungrouped,
                    teVideo: c.teVideo,
                    colorIdx: c.colorIdx,
                    durada: it.durada || '0:00',
                    duradaOnAir: it.duradaOnAir || null,
                    window: {
                        inSec: wIn,
                        outSec: wOut,
                        source: wSrc,
                        inTc: (wIn === null ? '' : secToTc(wIn, rate)),
                        outTc: (wOut === null ? '' : secToTc(wOut, rate))
                    },
                    times: {
                        entradaPrevistaSec: inPrev,
                        sortidaPrevistaSec: outPrev,
                        entradaOnAirSec: inOnAir,
                        sortidaOnAirSec: outOnAir,
                        duradaSec: c.duradaSec,
                        duradaOnAirSec: c.duradaOnAirSec,
                        duradaEfectivaSec: effective
                    },
                    itemTimeSec: itemTimeSec,
                    tc: (itemTimeSec === null ? '' : secToTc(itemTimeSec, rate)),
                    marker: marker ? {
                        timeSec: marker.timeSec,
                        tc: marker.tc || secToTc(marker.timeSec, rate),
                        color: marker.color,
                        comment: marker.comment || '',
                        source: 'timeline'
                    } : null,
                    // Si encara no hi ha marcador posat, es deixa el previst (per
                    // comparar on HAURIA de caure segons l'escaleta).
                    markerPrevist: (marker || itemTimeSec === null) ? null : {
                        timeSec: itemTimeSec,
                        tc: (itemTimeSec === null ? '' : secToTc(itemTimeSec, rate)),
                        colorIdx: c.colorIdx,
                        comment: String(it.num || '') + ' ' + String(it.titol || '')
                    },
                    clips: (wIn !== null && wOut !== null && wOut > wIn) ? self._clipsInWindow(clipsV1, wIn, wOut) : [],
                    chyrons: (wIn !== null && wOut !== null) ? self._insideWindow(placed, wIn, wOut, it.num) : [],
                    graphics: (wIn !== null && wOut !== null) ? self._insideWindow(gfx, wIn, wOut, it.num) : [],
                    marks: self._marksOf(manifest, it.num),
                    escaleta: it
                });
            }

            var structure = {
                updatedAt: self._now(),
                reason: o.reason || '',
                count: out.length,
                fps: rate,
                source: {
                    escaletaItems: items.length,
                    itemsFrom: (SM() && SM().getItemsSource) ? SM().getItemsSource(manifest) : '',
                    markers: mList.length,
                    clipsV1: clipsV1.length,
                    chyronsPlaced: placed.length,
                    graphics: gfx.length
                },
                items: out
            };
            manifest.structure = structure;
            return structure;
        },

        /**
         * rebuild: Hook cridat per `SessionManifest._rebuild` després de cada
         * escriptura de secció. Manté `structure` coherent amb la resta.
         * @param {Object} manifest
         * @param {Object} [opts]
         * @returns {Object} secció `structure`
         */
        rebuild: function (manifest, opts) {
            return this.composeStructure(manifest, opts || {});
        },

        // ────────────────────────────────────────────────────────────────
        // 5. MIRALLS LLEGIBLES (derivats del manifest, mai font de dades)
        // ────────────────────────────────────────────────────────────────

        /**
         * mirrorMarkersTxt: Text llegible amb els marcadors + la vista per ítem.
         * @param {Object} manifest
         * @returns {string}
         */
        mirrorMarkersTxt: function (manifest) {
            var sec = (manifest && manifest.markers) || {};
            var list = sec.list || [];
            var t = 'SNAPSHOT MARCADORS (manifest) · ' + (sec.updatedAt || '') + '\n' +
                'Marcadors a la seqüència: ' + list.length + '\n' +
                '------------------------------------------------------------\n' +
                '#    segons      TC                color  comentari\n';
            for (var i = 0; i < list.length; i++) {
                var m = list[i] || {};
                t += (i + 1) + '.\t' + Number(m.timeSec || 0).toFixed(3) + '\t' + (m.tc || '') + '\t' +
                    (m.color === undefined ? '-' : m.color) + '\t' + (m.comment || '') + '\n';
            }
            return t;
        },

        /**
         * mirrorAllTxt: Mirall complet en un sol text (marcadors + vista per ítem).
         * Substitueix els antics fitxers derivats que duien totes dues coses.
         * @param {Object} manifest
         * @returns {string}
         */
        mirrorAllTxt: function (manifest) {
            return this.mirrorMarkersTxt(manifest) + '\n' + this.mirrorStructureTxt(manifest);
        },

        /**
         * mirrorStructureTxt: Taula per ítem: classe, TC, finestra, clip, rètol.
         * @param {Object} manifest
         * @returns {string}
         */
        mirrorStructureTxt: function (manifest) {
            var st = (manifest && manifest.structure) || {};
            var items = st.items || [];
            var t = 'VISTA PER ÍTEM (structure.items) · ' + (st.updatedAt || '') + '\n' +
                'Ítems: ' + items.length + ' · fps: ' + (st.fps || '') + '\n' +
                '-----------------------------------------------------------------------------------\n' +
                '#    ítem      classe       TC                in      out     clips  rètols  gràfics\n';
            var f = function (v) { return (v === null || v === undefined) ? '-' : (typeof v === 'number' ? v.toFixed(2) : String(v)); };
            for (var i = 0; i < items.length; i++) {
                var it = items[i] || {};
                var w = it.window || {};
                t += (i + 1) + '.\t' + (it.num || '-') + '\t' + (it.classe || '') + '\t' +
                    (it.tc || '') + '\t' + f(w.inSec) + '\t' + f(w.outSec) + '\t' +
                    ((it.clips || []).length) + '\t' + ((it.chyrons || []).length) + '\t' +
                    ((it.graphics || []).length) + '\t' + String(it.titol || '').substring(0, 40) + '\n';
            }
            return t;
        }
    };

    window.FASTPASS_UI = FASTPASS_UI;
})();
