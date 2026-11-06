/* ============================================================================
 * LOGIC: GRAF ZONA GRIS - v1.1.1 (2026-11-05)
 * Detecció del TIPUS de terç inferior d'un grafisme (Paleta 🎨 → flow_mapa.js)
 * ----------------------------------------------------------------------------
 * (2026-11-05 · GRAF_TERCIO_TIPUS) El mòdul ja no respon només «té zona grisa?»:
 * classifica el grafisme en TRES tipus i el flux decidix la pista de cada un:
 *   · `gris`  → el terç inferior és la franja grisa de la placa (CLARA #D9D9D9
 *               o FOSCA #333–#808080) → el grafisme va a V4 (`graficos`+1), PER
 *               DAMUNT de la màscara, que es queda a V2 sense moure's;
 *   · `color` → el terç inferior porta FOTO o altres colors → la màscara puja de
 *               V2 a V3 i el grafisme va a V2 (comportament des del 28/10);
 *   · `buit`  → el terç inferior no té res (ALFA transparent o negre de vídeo) →
 *               el grafisme va a V4 i davall mateix s'hi posa el PNG de fons a V3.
 * Les receptes (`detect` rgb24 i `detectKind` rgba) són independents i tenen
 * caché pròpia: `detect` continua sent el que fa servir el flux de TWITTS.
 *
 * (2026-11-05 · #222 · petició d'usuari) El GRIS del peu pot ser **CLAR**
 * (`#D9D9D9`, la recepta de sempre) o **FOSC** (`#333`–`#808080`): hi ha dissenys
 * del canal amb la placa fosca. La recepta del TIPUS compta les DOS com a placa
 * (`covGris` = `covGrisClar` + `covGrisFosc`). El gris fosc NO es busca per color
 * fix sinó per **neutre + banda de lluminositat** (`esGrisFosc`): una foto a
 * fosques té milers de píxels al voltant de `#4D4D4D` i un color fix se la
 * menjaria sencera.
 *
 * NOTA DE CAMP (05/11, confirmada per l'usuari): SÍ que hi ha grafismes amb
 * transparència de veritat — QuickTime **Animation (qtrle) amb canal alfa**
 * (`bgra`). Per això la recepta del TIPUS demana `rgba` a `extractRoiSeries`
 * (`pixFmt:'rgba'`): mesurat amb un Animation sintètic, la franja inferior dóna
 * **alfa 0 = 100 % → `buit`**, mentres que el MATEIX clip exportat sense alfa
 * (`rgb24`, alfa opaca) dóna **alfa 0 = 0 % · altres 100 % → `color`** (cap fals
 * positiu). El desglòs «alfa 0 / negre» ix al log de cada mesura.
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

    // ── (2026-11-05 · GRAF_TERCIO_TIPUS) Classificació per TIPUS de terç inferior ──
    // Recepta PRÒPIA (rgba, per a vore l'alfa) i caché PRÒPIA: així `detect`
    // (rgb24, el que fa servir el flux de TWITTS) no canvia gens ni mica.
    // (2026-11-05 · #222) k2: la placa pot ser CLARA o FOSCA → la caché de k1
    // (que només coneixia el gris clar) queda invalidada per la clau.
    var KIND_VER = 'k2';
    var KIND_CACHE_FILE = 'C:\\temp\\fp_graf_tipus_cache.json';
    var KIND = { GRIS: 'gris', COLOR: 'color', BUIT: 'buit' };

    var DEFAULTS = {
        tSec: 3,            // instant CENTRAL de la finestra (només per als logs)
        tStart: 2,          // inici de la finestra de mostres (intro ja acabada)
        tDur: 2.5,          // 2 → 4,5 s
        fps: 1,             // 1 mostra per segon → 3 frames (t = 2, 3 i 4 s)
        roiY: [0.60, 1.00], // FRANJA INFERIOR del frame
        roiX: null,         // null = tot l'ample
        color: '#D9D9D9',   // gris CLAR de la placa (mesurat)
        tol: 25,            // ±25 per canal (igual que TitoletDetect)
        // ── (#222 · 2026-11-05) PLACA FOSCA: la placa també pot ser grisa FOSCA ──
        // No es busca per color fix (una foto a fosques és tota ella #4D4D4D) sinó
        // per NEUTRE (desviació entre canals ≤ `foscSpread`) + BANDA de lluminositat
        // [`foscLo`, `foscHi`]. `foscLo` va per damunt de `negreMax` perquè el negre
        // de vídeo ja compta com a BUIT; `foscHi` es queda per davall del gris clar.
        foscLo: 36,         // lluminositat mínima del gris fosc (#333333 ≈ 51)
        foscHi: 128,        // lluminositat màxima del gris fosc (#808080 = 128)
        foscSpread: 20,     // desviació MÀXIMA entre canals per dir «gris neutre»
        minCov: 30,         // % mínim de la franja per dir «té zona grisa»
        minBuit: 50,        // % mínim de franja BUIDA (alfa 0 o negre) per dir «terç buit»
        negreMax: 20,       // canal ≤ este valor (0-255) = negre de vídeo (alfa opaca)
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

    // ════════════════════════════════════════════════════════════════════════
    // TIPUS DE TERÇ INFERIOR (2026-11-05 · GRAF_TERCIO_TIPUS) — PURES
    // ════════════════════════════════════════════════════════════════════════
    /**
     * median: (PURA) mediana d'una llista de nombres; amb un nombre PARE de
     * mostres es pren la BAIXA (conservador, igual que `decideSeries`).
     */
    function median(list) {
        var v = [];
        for (var i = 0; i < ((list && list.length) || 0); i++) {
            if (isFinite(list[i])) v.push(Number(list[i]));
        }
        if (!v.length) return null;
        v.sort(function (a, b) { return a - b; });
        return v[Math.floor((v.length - 1) / 2)];
    }

    /**
     * llum: (PURA) lluminositat 0-255 d'un píxel (promig dels tres canals; per als
     * grisos neutres coincidix amb qualsevol ponderació, que és el cas que ens
     * interessa).
     */
    function llum(r, g, b) {
        return (Number(r) + Number(g) + Number(b)) / 3;
    }

    /**
     * esGrisFosc: (PURA) este píxel és la PLACA GRISA FOSCA del terç inferior?
     *
     * (2026-11-05 · #222 · petició d'usuari: «el gris del tercio inferior puede ser
     * claro o oscuro») El peu del grafisme pot dur la placa CLARA (#D9D9D9, la
     * recepta de sempre a `analyseRGBA`) o FOSCA (#333–#808080). El gris fosc no
     * es pot buscar amb una tolerància a un color fix: una foto nocturna té
     * milers de píxels al voltant de #4D4D4D i se la menjaria. Per això es demanen
     * DUES coses alhora:
     *   1. NEUTRE → `max(r,g,b) − min(r,g,b) ≤ spread`: un gris no té to; una foto
     *      (encara que siga fosca) sí (un roig fosc 100/20/20 té 80 de desviació);
     *   2. BANDA → `foscLo ≤ lluminositat ≤ foscHi`: per damunt del NEGRE de vídeo
     *      (`negreMax`, que ja compta com a BUIT) i per davall del gris clar.
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {Object} [f] - { lo, hi, spread } (`DEFAULTS` si falta)
     * @returns {boolean}
     */
    function esGrisFosc(r, g, b, f) {
        if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return false;
        var c = f || {};
        var lo = isFinite(c.lo) ? Number(c.lo) : DEFAULTS.foscLo;
        var hi = isFinite(c.hi) ? Number(c.hi) : DEFAULTS.foscHi;
        var sp = isFinite(c.spread) ? Number(c.spread) : DEFAULTS.foscSpread;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx - mn > sp) return false;                 // té to → no és gris
        var y = llum(r, g, b);
        return (y >= lo && y <= hi);
    }

    /**
     * analyseRGBA: (PURA) mesura d'UN frame en rgba cru (4 bytes per píxel).
     * Reparteix la graella en tres sacs EXCLOUENTS:
     *   · `covGris`   → píxels OPACS de la placa: CLARA (color `rgb` ±`tol` per
     *                   canal) o FOSCA (`esGrisFosc`, #222 2026-11-05). Es
     *                   desglossa en `covGrisClar` i `covGrisFosc` (diagnòstic);
     *   · `covBuit`   → píxels BUIDS: alfa < 16 (grafisme exportat amb alpha) o
     *                   negre de vídeo (les tres components ≤ `negreMax`), que és
     *                   com queda un terç transparent quan l'export NO duu alfa;
     *   · `covAltres` → la resta: foto, colors, text… (ni placa ni buit).
     * Els tres percentatges sumen 100 (llevat d'arrodoniment).
     *
     * @param {Uint8Array|Array} buf - bytes RGBA (w*h*4)
     * @param {Object} [fosc] - { lo, hi, spread } de la placa fosca (per defecte `DEFAULTS`)
     * @returns {Object|null} { covGris, covGrisClar, covGrisFosc, covBuit, covAltres,
     *                          buitAlpha, buitNegre, total }
     */
    function analyseRGBA(buf, w, h, rgb, tol, negreMax, fosc) {
        if (!buf || !w || !h || !rgb) return null;
        var need = w * h * 4;
        if (buf.length < need) return null;
        var nm = isFinite(negreMax) ? Number(negreMax) : DEFAULTS.negreMax;
        var g = 0, gf = 0, b = 0, o = 0, a0 = 0, k0 = 0;
        var total = w * h;
        for (var p = 0; p < need; p += 4) {
            var r = buf[p], gg = buf[p + 1], bb = buf[p + 2], al = buf[p + 3];
            if (al < 16) { b++; a0++; continue; }                          // transparent
            if (r <= nm && gg <= nm && bb <= nm) { b++; k0++; continue; }   // negre de vídeo
            if (Math.abs(r - rgb.r) <= tol && Math.abs(gg - rgb.g) <= tol &&
                Math.abs(bb - rgb.b) <= tol) { g++; continue; }             // placa CLARA
            if (esGrisFosc(r, gg, bb, fosc)) { g++; gf++; continue; }       // placa FOSCA (#222)
            o++;                                                           // foto / colors
        }
        return {
            covGris: (g * 100) / total,
            covGrisClar: ((g - gf) * 100) / total,
            covGrisFosc: (gf * 100) / total,
            covBuit: (b * 100) / total,
            covAltres: (o * 100) / total,
            buitAlpha: (a0 * 100) / total,
            buitNegre: (k0 * 100) / total,
            total: total
        };
    }

    /**
     * analyseSeriesRGBA: (PURA) `analyseRGBA` per a CADA frame del .raw rgba
     * (diverses mostres encadenades). Els bytes que no completen un frame
     * s'ignoren: mai es mesura mig frame.
     * @returns {Array|null} [{ covGris, covGrisClar, covGrisFosc, covBuit, covAltres,
     *                         buitAlpha, buitNegre }]
     */
    function analyseSeriesRGBA(buf, w, h, rgb, tol, negreMax, fosc) {
        if (!buf || !w || !h || !rgb) return null;
        var need = w * h * 4;
        if (!need || buf.length < need) return null;
        var n = Math.floor(buf.length / need);
        var out = [];
        for (var f = 0; f < n; f++) {
            var from = f * need;
            var part = (typeof buf.subarray === 'function')
                ? buf.subarray(from, from + need)
                : Array.prototype.slice.call(buf, from, from + need);
            var a = analyseRGBA(part, w, h, rgb, tol, negreMax, fosc);
            if (a) out.push(a);
        }
        return out.length ? out : null;
    }

    /**
     * decideKind: (PURA) UN mostreig → tipus de terç inferior.
     * ORDE DE PRIORITAT: gris → buit → color. El gris mana perquè la placa duu
     * el text del disseny (si n'hi ha, el peu té contingut); i `color` és el
     * destí per defecte (la col·locació de sempre, la més segura).
     */
    function decideKind(s, cfg) {
        var c = cfg || DEFAULTS;
        var minG = isFinite(c.minCov) ? Number(c.minCov) : DEFAULTS.minCov;
        var minB = isFinite(c.minBuit) ? Number(c.minBuit) : DEFAULTS.minBuit;
        var o = s || {};
        var cg = Number(o.covGris) || 0;
        var cb = Number(o.covBuit) || 0;
        var co = Number(o.covAltres) || 0;
        var kind = KIND.COLOR;
        if (cg >= minG) kind = KIND.GRIS;
        else if (cb >= minB) kind = KIND.BUIT;
        return { kind: kind, covGris: cg, covBuit: cb, covAltres: co, minGris: minG, minBuit: minB };
    }

    /**
     * decideKindSeries: (PURA) tipus de CADA mostra → tipus de la tongada.
     * Mana la MAJORIA de les mostres (un frame de transició —un fundit— no canvia
     * el veredicte). Si no hi ha majoria estricta, decidixen les MEDIANES de les
     * tres cobertures, que és com mirar «el frame típic».
     * @returns {Object} { kind, n, votes, medGris, medBuit, medAltres, samples }
     */
    function decideKindSeries(samples, cfg) {
        var list = [];
        for (var i = 0; i < ((samples && samples.length) || 0); i++) {
            if (samples[i]) list.push(decideKind(samples[i], cfg));
        }
        if (!list.length) {
            return { kind: null, n: 0, votes: {}, medGris: null, medBuit: null, medAltres: null, samples: [] };
        }
        var medGris = median(list.map(function (x) { return x.covGris; }));
        var medBuit = median(list.map(function (x) { return x.covBuit; }));
        var medAltres = median(list.map(function (x) { return x.covAltres; }));
        var votes = { gris: 0, buit: 0, color: 0 };
        for (var k = 0; k < list.length; k++) votes[list[k].kind]++;
        var best = null, bestN = 0, kk;
        for (kk in votes) {
            if (!votes.hasOwnProperty(kk)) continue;
            if (votes[kk] > bestN) { best = kk; bestN = votes[kk]; }
        }
        var kind;
        if (bestN * 2 > list.length) kind = best;          // majoria estricta
        else kind = decideKind({ covGris: medGris, covBuit: medBuit, covAltres: medAltres }, cfg).kind;
        return {
            kind: kind, n: list.length, votes: votes,
            medGris: medGris, medBuit: medBuit, medAltres: medAltres, samples: list
        };
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

    /** logKind: una línia de log amb el veredicte de TIPUS (gris/buit/altres). */
    function logKind(sourcePath, cfg, out, cached) {
        var f = function (v) { return (isFinite(v) ? Number(v).toFixed(1) : '—'); };
        var t0 = (cfg.tStart != null ? cfg.tStart : cfg.tSec);
        // (2026-11-05) El «buit» pot vindre de l'ALFA (Animation/ProRes 4444 amb canal)
        // o del NEGRE (un terç transparent exportat sense alfa). En viu cal saber-ho:
        // si ix «buit» per negre en un grafisme que NO és transparent, el llindar
        // `negreMax` s'ha de baixar. Es mostra el desglòs de la mostra TÍPICA.
        var spl = '', sg = '';
        try {
            var ss = out.samples || [];
            if (ss.length) {
                var mid = ss[Math.floor((ss.length - 1) / 2)] || {};
                spl = ' (alfa 0: ' + f(mid.buitAlpha) + ' % · negre: ' + f(mid.buitNegre) + ' %)';
                // (2026-11-05 · #222) La placa pot ser CLARA (#D9D9D9) o FOSCA
                // (#333–#808080): en viu cal vore de quina és, perquè si un grafisme
                // amb placa fosca ix «altres» el que s'ha de tocar és `foscLo/Hi`.
                if (isFinite(mid.covGrisFosc) && Number(mid.covGrisFosc) > 0) {
                    sg = ' (clar: ' + f(mid.covGrisClar) + ' % · fosc: ' + f(mid.covGrisFosc) + ' %)';
                }
            }
        } catch (eS) { spl = ''; sg = ''; }
        log('🎨 [GRAF·tipus] «' + _base(sourcePath) + '» finestra ' + t0 + '→' + (t0 + cfg.tDur) +
            's · franja y' + cfg.roiY[0].toFixed(2) + '→' + cfg.roiY[1].toFixed(2) +
            ' · gris ' + f(out.covGris) + ' %' + sg + ' · buit ' + f(out.covBuit) + ' %' + spl +
            ' · altres ' + f(out.covAltres) + ' %' +
            ' → TIPUS ' + String(out.kind).toUpperCase() +
            ' (gris≥' + cfg.minCov + ' · buit≥' + cfg.minBuit + ')' + (cached ? ' · caché' : ''));
    }

    /** kindCacheGet: entrada de la caché de TIPUS per a la clau donada (o null). */
    async function kindCacheGet(key) {
        var cTxt = null;
        try { cTxt = await utils().callJSX('IO.readTxt(' + JSON.stringify(KIND_CACHE_FILE) + ')'); } catch (eC) { cTxt = null; }
        var hit = cacheRead(cTxt)[key];
        return (hit && typeof hit === 'object' && typeof hit.kind === 'string') ? hit : null;
    }

    /** kindCacheSave: desa el veredicte de TIPUS a la caché pròpia (best-effort). */
    async function kindCacheSave(key, dec, cfg, info) {
        if (cfg.force) return;
        try {
            var cTxt = await utils().callJSX('IO.readTxt(' + JSON.stringify(KIND_CACHE_FILE) + ')');
            var txt = cachePut(cacheRead(cTxt), key, {
                kind: dec.kind, covGris: dec.medGris, covBuit: dec.medBuit, covAltres: dec.medAltres,
                n: dec.n, t: cfg.tSec, ver: KIND_VER,
                size: (info && info.size), created: (info && info.created)
            });
            if (txt) await utils().callJSX('IO.writeTxt(' + JSON.stringify(KIND_CACHE_FILE) + ', ' + JSON.stringify(txt) + ')');
        } catch (eW) {
            log('⚠️ [GRAF·tipus] No puc desar la caché: ' + eW.message, 'WARN');
        }
    }

    /**
     * detectKind: QUIN TIPUS de terç inferior té el grafisme? 'gris' | 'color' | 'buit'
     *
     * (2026-11-05 · GRAF_TERCIO_TIPUS) Mesura la MATEIXA franja que `detect`, però en
     * `rgba` (cal l'alfa) i repartint els píxels en tres sacs: placa grisa, buit i
     * altres. Recepta i caché PRÒPIES: `detect` (rgb24, TWITTS) no canvia gens.
     *
     * @param {string} sourcePath - fitxer del grafisme (UNC o local)
     * @param {Object} [o] - { tStart, tDur, fps, roiY, roiX, color, tol, minCov,
     *                        minBuit, negreMax, w, h, force }
     * @returns {Promise<{ok:boolean, kind:string|null, hasGrey:boolean, covGris:number|null,
     *                    covBuit:number|null, covAltres:number|null, samples:Array,
     *                    n:number, cached:boolean, key:string, err:string|null}>}
     *   `ok:false` = no s'ha pogut MESURAR (no és el mateix que «és de color»).
     */
    async function detectKind(sourcePath, o) {
        var cfg = opts(o);
        var out = {
            ok: false, kind: null, hasGrey: false,
            covGris: null, covBuit: null, covAltres: null,
            samples: [], n: 0, cached: false, key: '', err: null, t: cfg.tSec
        };
        if (!sourcePath) { out.err = 'sourcePath buit'; return out; }
        try {
            var info = await fileInfo(sourcePath);
            if (!info.exists) {
                out.err = 'fitxer no trobat';
                log('⚠️ [GRAF·tipus] No trobo el fitxer: ' + sourcePath, 'WARN');
                return out;
            }
            var fosc = { lo: cfg.foscLo, hi: cfg.foscHi, spread: cfg.foscSpread };
            var key = cacheKey(sourcePath, info,
                KIND_VER + '|g' + cfg.minCov + '|b' + cfg.minBuit + '|n' + cfg.negreMax + '|' + cfg.color +
                '|f' + cfg.foscLo + '-' + cfg.foscHi + '/' + cfg.foscSpread);
            out.key = key;

            // ── 1. CACHÉ pròpia (ruta|mida|creació|recepta de TIPUS) ─────
            if (!cfg.force) {
                var hit = await kindCacheGet(key);
                if (hit) {
                    out.ok = true; out.cached = true;
                    out.kind = hit.kind;
                    out.hasGrey = (hit.kind === KIND.GRIS);
                    out.covGris = (isFinite(hit.covGris) ? Number(hit.covGris) : null);
                    out.covBuit = (isFinite(hit.covBuit) ? Number(hit.covBuit) : null);
                    out.covAltres = (isFinite(hit.covAltres) ? Number(hit.covAltres) : null);
                    logKind(sourcePath, cfg, out, true);
                    return out;
                }
            }

            // ── 2. MESURA rgba (l'alfa és el que delata el terç transparent) ──
            var ff = ffmpegLogic();
            if (!ff || typeof ff.extractRoiSeries !== 'function') {
                out.err = 'FFmpeg.extractRoiSeries no disponible';
                return out;
            }
            var raw = 'C:\\temp\\fp_graf_tipus_' + Date.now() + '.raw';
            var res = await ff.extractRoiSeries(sourcePath, {
                tStart: (cfg.tStart != null ? cfg.tStart : cfg.tSec),
                tDur: cfg.tDur, fps: cfg.fps,
                roiY: cfg.roiY, roiX: cfg.roiX,
                w: cfg.w, h: cfg.h, outPath: raw, pixFmt: 'rgba'
            });
            if (!res || !res.ok) {
                out.err = 'ffmpeg: ' + ((res && res.error) || 'extracció fallida');
                log('⚠️ [GRAF·tipus] No puc extraure el frame de «' + _base(sourcePath) + '»: ' + out.err, 'WARN');
                return out;
            }
            var buf = readBinary(raw);
            try { await utils().callJSX('IO.remove(' + JSON.stringify(raw) + ')'); } catch (eR) { }
            if (!buf) { out.err = 'no puc llegir el frame extret'; return out; }

            var covs = analyseSeriesRGBA(buf, cfg.w, cfg.h, cfg.rgb, cfg.tol, cfg.negreMax, fosc);
            if (!covs) { out.err = 'frame massa curt per a la graella ' + cfg.w + 'x' + cfg.h; return out; }

            // ── 3. VEREDICTE (majoria de mostres) + CACHÉ ───────────────
            var dec = decideKindSeries(covs, cfg);
            out.ok = true;
            out.kind = dec.kind;
            out.hasGrey = (dec.kind === KIND.GRIS);
            out.covGris = dec.medGris;
            out.covBuit = dec.medBuit;
            out.covAltres = dec.medAltres;
            out.samples = covs;
            out.n = dec.n;
            logKind(sourcePath, cfg, out, false);
            await kindCacheSave(key, dec, cfg, info);
            return out;
        } catch (e) {
            out.err = e.message;
            log('❌ [GRAF·tipus] detectKind: ' + e.message, 'ERROR');
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
        // ── tipus de terç inferior (2026-11-05) ──
        median: median,
        llum: llum,
        esGrisFosc: esGrisFosc,
        analyseRGBA: analyseRGBA,
        analyseSeriesRGBA: analyseSeriesRGBA,
        decideKind: decideKind,
        decideKindSeries: decideKindSeries,
        // ── orquestració (CEP: ffmpeg + IO) ──
        fileInfo: fileInfo,
        detect: detect,
        detectKind: detectKind,
        // ── constants (diagnòstic) ──
        VER: VER,
        CACHE_FILE: CACHE_FILE,
        KIND: KIND,
        KIND_VER: KIND_VER,
        KIND_CACHE_FILE: KIND_CACHE_FILE,
        DEFAULTS: DEFAULTS
    };
})();
