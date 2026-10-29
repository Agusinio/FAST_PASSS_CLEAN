/* ============================================================================
 * LOGIC: GRAF ZONA GRIS - v1.0.0 (2026-10-28)
 * Detecció de la ZONA GRISA del peu d'un grafisme (Paleta 🎨 → flow_mapa.js)
 * ----------------------------------------------------------------------------
 * QUÈ RESOL: a la carpeta del dia hi ha DOS tipus de grafisme:
 *   · els que omplin el frame o porten un fons opac → van a la pista de
 *     grafismes (V3) damunt de tot, com sempre;
 *   · els que porten una ZONA GRISA al peu (la franja de baix del disseny) → han
 *     d'anar a la pista de la MÀSCARA (V2) i la màscara ha de PUJAR una pista
 *     perquè quede PER DAMUNT del grafisme (petició d'usuari 2026-10-28).
 * Aquest mòdul només respon «té zona grisa?»: NO toca la timeline.
 *
 * COM: TRES mostres (t = 2, 3 i 4 s) del MATEIX fitxer que s'importa, en UNA
 * sola crida a ffmpeg (`fps=1` sobre la finestra 2→4,5 s → 3 frames), retallades
 * a la FRANJA INFERIOR (y 0,60→1,00, tot l'ample) i escalades a una graella
 * 64x64 en rgb24 cru (`FFmpeg.extractRoiSeries`, àtom existent). Es compta la
 * cobertura del gris de la placa (#D9D9D9 ±25 — mateix criteri que
 * `TitoletDetect` per a la «placa gris clar» #DCDCDC ±25) i **manem per la
 * MEDIANA** de les tres cobertures contra `minCov` (30 %).
 *
 * PER QUÈ 3 MOSTRES (2026-10-28, mesurat): amb un sol frame a t=3 s n'hi ha prou
 * per als dissenys estables (`ATUR EPA CATALUNYA.mov` i `Vertical_Condicions ús
 * whatsapp i telegram.mp4`: franja y 660→1080 = 39 % de baix, #D9D9D9 uniforme,
 * cobertura ~100 % a 1/2/3/4/6/10 s), però és FRÀGIL: `APP GOOGLE tots SANT
 * GERVASI ESVORANC.mov` (27/10) té un FUNDIT A BLANC just a t=3 s (97 % blanc,
 * mitjana 251) i el disseny real (foto a sang, sense franja) es veu a t≥4 s.
 * Amb la mediana, un frame de transició no canvia el veredicte.
 *
 * CACHÉ: el resultat es desa a `C:\temp\fp_graf_zona_cache.json` amb la CLAU
 * `ruta|mida|data de CREACIÓ|VER`. La data de creació (`File.created` via
 * `IO.fileInfo`, MAI el mtime del NAS) distingix VERSIONS del mateix nom de
 * fitxer: si el grafisme es reexporta, canvia la data → es torna a mesurar.
 * ==========================================================================*/
(function () {
    'use strict';

    window.FASTPASS_UI = window.FASTPASS_UI || {};
    var Logic = window.FASTPASS_UI.Logic = window.FASTPASS_UI.Logic || {};

    // Versió de la RECEPTA: si canvien els llindars, puja-la i la caché queda
    // invalidada per la clau (no cal esborrar cap fitxer a mà).
    var VER = 'v2';

    var CACHE_FILE = 'C:\\temp\\fp_graf_zona_cache.json';
    var CACHE_MAX = 400;                       // entrades; en passar-ne, es buida

    var DEFAULTS = {
        tSec: 3,            // instant CENTRAL de la finestra (només per als logs)
        tStart: 2,          // inici de la finestra de mostres (intro ja acabada)
        tDur: 2.5,          // 2 → 4,5 s
        fps: 1,             // 1 mostra per segon → 3 frames (t = 2, 3 i 4 s)
        roiY: [0.60, 1.00], // FRANJA INFERIOR del frame
        roiX: null,         // null = tot l'ample
        color: '#D9D9D9',   // gris de la placa (mesurat)
        tol: 25,            // ±25 per canal (igual que TitoletDetect)
        minCov: 30,         // % mínim de la franja per dir «té zona grisa»
        w: 64, h: 64        // graella de mostreig
    };

    function utils() {
        return (window.FASTPASS_UI && window.FASTPASS_UI.Utils) ? window.FASTPASS_UI.Utils : null;
    }
    function log(msg, lvl) {
        try { utils().log(msg, lvl || 'DEBUG'); }
        catch (e) { try { console.log(msg); } catch (e2) { } }
    }
    function ffmpegLogic() {
        var L = window.FASTPASS_UI && window.FASTPASS_UI.Logic;
        return (L && L.FFmpeg) ? L.FFmpeg : null;
    }

    // ════════════════════════════════════════════════════════════════════════
    // PURES (prova headless, sense CEP)
    // ════════════════════════════════════════════════════════════════════════
    /**
     * hexToRgb: '#D9D9D9' → { r:217, g:217, b:217 }. Tolera el '#' absent i les
     * minúscules; si el text no és un hex de 6 dígits, retorna null.
     */
    function hexToRgb(hex) {
        var s = String(hex == null ? '' : hex)
            .replace(/^\s+/, '').replace(/\s+$/, '')     // espais (també ' #D9D9D9 ')
            .replace(/^#/, '');
        if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
        return {
            r: parseInt(s.substring(0, 2), 16),
            g: parseInt(s.substring(2, 4), 16),
            b: parseInt(s.substring(4, 6), 16)
        };
    }

    /**
     * opts: recepta efectiva = DEFAULTS + les opcions rebudes (només les que
     * tenen valor; així un `undefined` no trenca cap llindar). `rgb` sempre hi és.
     */
    function opts(o) {
        var out = {};
        var k;
        for (k in DEFAULTS) { if (DEFAULTS.hasOwnProperty(k)) out[k] = DEFAULTS[k]; }
        for (k in (o || {})) {
            if (!o.hasOwnProperty(k)) continue;
            if (o[k] === undefined || o[k] === null) continue;
            out[k] = o[k];
        }
        out.rgb = hexToRgb(out.color) || hexToRgb(DEFAULTS.color);
        return out;
    }

    /**
     * decide: (PURA) cobertura de la franja → veredicte.
     * `hasGrey` és el que fa servir el flux; `cov` es desa a la caché i al log.
     */
    function decide(cov, cfg) {
        var c = (isFinite(cov) ? Number(cov) : 0);
        var min = (cfg && isFinite(cfg.minCov)) ? Number(cfg.minCov) : DEFAULTS.minCov;
        return { hasGrey: (c >= min), cov: c, minCov: min };
    }

    /**
     * decideSeries: (PURA) cobertures de les MOSTRES → veredicte.
     * Mana la MEDIANA (no la mitjana ni el màxim): un frame de transició —un
     * fundit a blanc, una cortineta— no canvia el veredicte, i tampoc no cal que
     * totes les mostres coincidisquen. Amb un nombre parell de mostres es pren la
     * BAIXA (conservador: mai no inventa una zona grisa).
     */
    function decideSeries(covs, cfg) {
        var list = [];
        for (var i = 0; i < ((covs && covs.length) || 0); i++) {
            if (isFinite(covs[i])) list.push(Number(covs[i]));
        }
        if (!list.length) {
            var v0 = decide(0, cfg);
            return { hasGrey: v0.hasGrey, cov: v0.cov, med: v0.cov, n: 0, covs: [], minCov: v0.minCov };
        }
        list.sort(function (a, b) { return a - b; });
        var med = list[Math.floor((list.length - 1) / 2)];
        var d = decide(med, cfg);
        return { hasGrey: d.hasGrey, cov: d.cov, med: med, n: list.length, covs: list, minCov: d.minCov };
    }

    /**
     * cacheKey: (PURA) clau d'una entrada de caché. Porta la MIDA i la DATA DE
     * CREACIÓ: un fitxer reexportat amb el MATEIX nom té una altra data → clau
     * nova → es torna a mesurar (petició d'usuari: «que distingisca versions»).
     * Si no hi ha data de creació (ruta estranya), cau al `modified` per no
     * desactivar la caché del tot.
     */
    function cacheKey(path, info, ver) {
        var p = String(path == null ? '' : path).toLowerCase();
        var created = (info && info.created) ? info.created : 0;
        var modified = (info && info.modified) ? info.modified : 0;
        var size = (info && info.size) ? info.size : 0;
        var stamp = created || modified || 0;
        return p + '|' + size + '|' + stamp + '|' + (ver || VER);
    }

    /**
     * cacheRead: (PURA) text del JSON de caché → mapa. Qualsevol cosa rara
     * (buit, JSON trencat, un array) es tracta com a caché buida.
     */
    function cacheRead(txt) {
        if (!txt) return {};
        try {
            var o = JSON.parse(String(txt));
            if (!o || typeof o !== 'object' || o.length !== undefined) return {};
            return o;
        } catch (e) { return {}; }
    }

    /**
     * cachePut: (PURA) desa una entrada al mapa i retorna el TEXT a escriure.
     * Fa neteja quan el mapa creix massa (una entrada per fitxer i dia; 400
     * cobreixen de sobres un any de grafismes).
     */
    function cachePut(map, key, val) {
        var m = map || {};
        m[key] = val;
        var keys = [];
        var k;
        for (k in m) { if (m.hasOwnProperty(k)) keys.push(k); }
        if (keys.length > CACHE_MAX) {
            m = {};
            m[key] = val;                       // es buida i es queda l'última
        }
        try { return JSON.stringify(m); } catch (e) { return ''; }
    }

    // ════════════════════════════════════════════════════════════════════════
    // IO (CEP + pont JSX)
    // ════════════════════════════════════════════════════════════════════════
    /**
     * fileInfo: { exists, size, created, modified } d'UN fitxer. Es llig pel
     * pont (`IO.fileInfo` → `File.created`), que és l'únic que dóna la data de
     * CREACIÓ de forma fiable a les rutes UNC del NAS (`cep.fs.stat` no sempre
     * la torna). Si el pont falla, s'intenta `cep.fs.stat` i, si tampoc, es
     * retorna el que es puga (la caché queda menys fina, però no peta).
     */
    async function fileInfo(path) {
        var out = { exists: false, size: 0, created: 0, modified: 0 };
        try {
            var u = utils();
            if (u && u.callJSX) {
                var raw = await u.callJSX('IO.fileInfo(' + JSON.stringify(String(path)) + ')');
                if (raw && String(raw).indexOf('ERR') !== 0) {
                    var o = JSON.parse(raw);
                    if (o && typeof o === 'object') {
                        return {
                            exists: !!o.exists,
                            size: Number(o.size) || 0,
                            created: Number(o.created) || 0,
                            modified: Number(o.modified) || 0
                        };
                    }
                }
            }
        } catch (e) { /* es prova cep.fs */ }
        try {
            var fs = window.cep && window.cep.fs;
            if (fs && fs.stat) {
                var st = fs.stat(String(path));
                if (st && st.err === 0 && st.data) {
                    out.exists = true;
                    out.size = Number(st.data.size) || 0;
                    out.created = Number(st.data.creationTime) || 0;
                    out.modified = Number(st.data.mtime) || 0;
                }
            }
        } catch (e2) { }
        return out;
    }

    /**
     * readBinary: bytes EXACTES d'un .raw rgb24.
     * ⚠️ `cep.fs.readFile(path)` SENSE encoding descodifica com a UTF-8 i
     * destrossa els bytes >= 0x80 (mesurat a TitoletDetect: la cobertura passava
     * de 17,44 % a 7,97 %). Per això es demana Base64 i es decodifica amb
     * `atob`, amb la lectura crua només com a últim recurs.
     */
    function readBinary(path) {
        try {
            var fs = window.cep && window.cep.fs;
            if (!fs || !fs.readFile) return null;
            var enc = (window.cep.encoding && window.cep.encoding.Base64) ? window.cep.encoding.Base64 : 'Base64';
            var r = null;
            try { r = fs.readFile(path, enc); } catch (eB) { r = null; }
            if (r && r.err === 0 && r.data) {
                var b64 = String(r.data).replace(/\s/g, '');
                if (b64.length > 4) {
                    try {
                        var bin = atob(b64);
                        if (bin.length > 4) {
                            var u = new Uint8Array(bin.length);
                            for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
                            return u;
                        }
                    } catch (eA) { /* no era Base64 → lectura crua */ }
                }
            }
            r = fs.readFile(path);
            if (!r || r.err !== 0 || !r.data) return null;
            var d = String(r.data);
            var u2 = new Uint8Array(d.length);
            for (var j = 0; j < d.length; j++) u2[j] = d.charCodeAt(j) & 0xff;
            return u2;
        } catch (e) { return null; }
    }

    /**
     * analyse: (PURA) cobertura del color sobre la graella w×h del buffer rgb24.
     * Reutilitza `TitoletDetect.analyzeRect` (mateixa semàntica de ±tol per
     * canal); si el mòdul no està carregat, compta-ho ací (idèntic).
     */
    function analyse(buf, w, h, rgb, tol) {
        if (!buf || !w || !h || !rgb) return null;
        var need = w * h * 3;
        if (buf.length < need) return null;
        var td = Logic.TitoletDetect;
        if (td && typeof td.analyzeRect === 'function') {
            var r = td.analyzeRect(buf, 0, w, h, rgb, tol, 0, 'none', null);
            return { cov: r.cov, count: Math.round(r.cov * w * h / 100), total: w * h };
        }
        var count = 0;
        for (var p = 0; p < need; p += 3) {
            if (Math.abs(buf[p] - rgb.r) <= tol &&
                Math.abs(buf[p + 1] - rgb.g) <= tol &&
                Math.abs(buf[p + 2] - rgb.b) <= tol) count++;
        }
        return { cov: (count * 100) / (w * h), count: count, total: w * h };
    }

    /**
     * analyseSeries: (PURA) cobertura de CADA frame del .raw (un .raw pot dur
     * diverses mostres encadenades: `fps=1` sobre 2,5 s → 3 frames). Cada frame
     * es mesura amb `analyse` (mateixa semàntica). Els bytes que no completen un
     * frame s'ignoren (mai es mesura mig frame).
     * @returns {number[]|null} cobertures en % (una per frame) o null
     */
    function analyseSeries(buf, w, h, rgb, tol) {
        if (!buf || !w || !h || !rgb) return null;
        var need = w * h * 3;
        if (!need || buf.length < need) return null;
        var n = Math.floor(buf.length / need);
        var out = [];
        for (var f = 0; f < n; f++) {
            var from = f * need;
            var part = (typeof buf.subarray === 'function')
                ? buf.subarray(from, from + need)
                : Array.prototype.slice.call(buf, from, from + need);
            var a = analyse(part, w, h, rgb, tol);
            if (a) out.push(a.cov);
        }
        return out.length ? out : null;
    }

    /** _base: nom del fitxer d'una ruta (només per als logs). */
    function _base(p) {
        var s = String(p || '');
        var i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
        return (i >= 0) ? s.substring(i + 1) : s;
    }

    // ════════════════════════════════════════════════════════════════════════
    // DETECCIÓ (orquestració: ffmpeg + caché + IO)
    // ════════════════════════════════════════════════════════════════════════
    /**
     * detect: té ZONA GRISA el grafisme?
     *
     * @param {string} sourcePath - fitxer del grafisme (UNC o local)
     * @param {Object} [o] - { tStart, tDur, fps, roiY, roiX, color, tol, minCov, w, h, force }
     * @returns {Promise<{ok:boolean, hasGrey:boolean, cov:number, t:number,
     *                    cached:boolean, key:string, err:string|null}>}
     *   `ok:false` = no s'ha pogut MESURAR (no és el mateix que «no té gris»):
     *   el flux ho ha de dir i decidir (es tracta com a «sense zona grisa»).
     */
    async function detect(sourcePath, o) {
        var cfg = opts(o);
        var out = { ok: false, hasGrey: false, cov: null, covs: [], n: 0, t: cfg.tSec, cached: false, key: '', err: null };
        if (!sourcePath) { out.err = 'sourcePath buit'; return out; }
        try {
            var info = await fileInfo(sourcePath);
            if (!info.exists) {
                out.err = 'fitxer no trobat';
                log('⚠️ [GRAF·gris] No trobo el fitxer: ' + sourcePath, 'WARN');
                return out;
            }
            var key = cacheKey(sourcePath, info, VER);
            out.key = key;

            // ── 1. CACHÉ (clau = ruta|mida|creació|versió de la recepta) ──
            if (!cfg.force) {
                var cTxt = null;
                try { cTxt = await utils().callJSX('IO.readTxt(' + JSON.stringify(CACHE_FILE) + ')'); } catch (eC) { cTxt = null; }
                var map = cacheRead(cTxt);
                var hit = map[key];
                if (hit && typeof hit === 'object' && typeof hit.hasGrey === 'boolean') {
                    out.ok = true; out.cached = true;
                    out.hasGrey = hit.hasGrey; out.cov = hit.cov;
                    log('🎨 [GRAF·gris] «' + _base(sourcePath) + '» → ' +
                        (out.hasGrey ? 'AMB zona grisa' : 'SENSE zona grisa') +
                        ' (cov ' + Number(hit.cov).toFixed(1) + ' %, caché)');
                    return out;
                }
            }

            // ── 2. MESURA (mostres de la finestra, franja inferior) ────────
            var ff = ffmpegLogic();
            if (!ff || typeof ff.extractRoiSeries !== 'function') {
                out.err = 'FFmpeg.extractRoiSeries no disponible';
                return out;
            }
            var raw = 'C:\\temp\\fp_graf_zona_' + Date.now() + '.raw';
            var res = await ff.extractRoiSeries(sourcePath, {
                tStart: (cfg.tStart != null ? cfg.tStart : cfg.tSec),
                tDur: cfg.tDur, fps: cfg.fps,
                roiY: cfg.roiY, roiX: cfg.roiX,
                w: cfg.w, h: cfg.h, outPath: raw
            });
            if (!res || !res.ok) {
                out.err = 'ffmpeg: ' + ((res && res.error) || 'extracció fallida');
                log('⚠️ [GRAF·gris] No puc extraure el frame de «' + _base(sourcePath) + '»: ' + out.err, 'WARN');
                return out;
            }
            var buf = readBinary(raw);
            try { await utils().callJSX('IO.remove(' + JSON.stringify(raw) + ')'); } catch (eR) { }
            if (!buf) { out.err = 'no puc llegir el frame extret'; return out; }

            var covs = analyseSeries(buf, cfg.w, cfg.h, cfg.rgb, cfg.tol);
            if (!covs) { out.err = 'frame massa curt per a la graella ' + cfg.w + 'x' + cfg.h; return out; }

            // ── 3. VEREDICTE (mediana de les mostres) + CACHÉ ─────────────
            var dec = decideSeries(covs, cfg);
            out.ok = true;
            out.hasGrey = dec.hasGrey;
            out.cov = dec.cov;
            out.covs = dec.covs;
            out.n = dec.n;
            var detall = [];
            for (var s = 0; s < dec.covs.length; s++) detall.push(Number(dec.covs[s]).toFixed(1));
            log('🎨 [GRAF·gris] «' + _base(sourcePath) + '» finestra ' +
                (cfg.tStart != null ? cfg.tStart : cfg.tSec) + '→' +
                ((cfg.tStart != null ? cfg.tStart : cfg.tSec) + cfg.tDur) + 's · franja y' +
                cfg.roiY[0].toFixed(2) + '→' + cfg.roiY[1].toFixed(2) + ' · cov gris x' +
                dec.n + ' = [' + detall.join(', ') + '] % → mediana ' +
                dec.cov.toFixed(1) + ' % (llindar ' + dec.minCov + ' %) → ' +
                (dec.hasGrey ? 'AMB ZONA GRISA' : 'SENSE zona grisa'));

            if (!cfg.force) {
                try {
                    var cTxt2 = await utils().callJSX('IO.readTxt(' + JSON.stringify(CACHE_FILE) + ')');
                    var map2 = cacheRead(cTxt2);
                    var txt = cachePut(map2, key, {
                        hasGrey: dec.hasGrey, cov: dec.cov, covs: dec.covs, n: dec.n,
                        t: cfg.tSec, ver: VER, size: info.size, created: info.created
                    });
                    if (txt) await utils().callJSX('IO.writeTxt(' + JSON.stringify(CACHE_FILE) + ', ' + JSON.stringify(txt) + ')');
                } catch (eW) {
                    log('⚠️ [GRAF·gris] No puc desar la caché: ' + eW.message, 'WARN');
                }
            }
            return out;
        } catch (e) {
            out.err = e.message;
            log('❌ [GRAF·gris] detect: ' + e.message, 'ERROR');
            return out;
        }
    }

    Logic.GrafZonaGris = {
        // ── pures (prova headless) ──
        hexToRgb: hexToRgb,
        opts: opts,
        decide: decide,
        decideSeries: decideSeries,
        cacheKey: cacheKey,
        cacheRead: cacheRead,
        cachePut: cachePut,
        analyse: analyse,
        analyseSeries: analyseSeries,
        // ── orquestració (CEP: ffmpeg + IO) ──
        fileInfo: fileInfo,
        detect: detect,
        // ── constants (diagnòstic) ──
        VER: VER,
        CACHE_FILE: CACHE_FILE,
        DEFAULTS: DEFAULTS
    };
})();
