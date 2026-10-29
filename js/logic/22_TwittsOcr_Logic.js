/* ============================================================================
 * LOGIC: TWITTS OCR - v2.1.0 (2026-10-29)
 * Col·locació dels grafismes de tuit (XARXES) a partir d'UN frame per clip
 * ----------------------------------------------------------------------------
 * QUÈ RESOL: els movies de tuit (`..._LUCYS VERTICALITZACIÓ_<id>_XARXES-TEXT_
 * tp_<Nom>_<Partit>_@<handle>.<id>.mov`) arriben amb el BLOC A SEQUES (`_V_00_`)
 * → `Parse._esFlotant` (BUG #191) els importa al bin però no els lliga a cap
 * ítem d'escaleta, així que MAI es col·loquen. El tuit, però, ja és a la imatge
 * CREMAT (grafisme propi: fons gris clar + franja naranja amb el nom del titular).
 *
 * COM (spec: docs/specs/TWITTS_OCR.md, decisions D1-D23):
 *   · D22: també SÓN tuit els exports a mà `wott x salvador illa.00666202.mov`
 *     / `wott_v3 x pedro.00666211.mov` (ni `XARXES`, ni `LUCYS`, ni `_V_00_`):
 *     sense això l'emergència no els ensenyava (BUG #208). Sense `_tp_`, el nom
 *     del titular s'extrau de darrere la `x` (`nomNet`) i la semblança amb el
 *     text OCR es mesura amb `semNombre`/`rankPick` (D23).
 *   · D1/D2: UN SOL frame per clip del timeline, el **35 des de l'`in`**
 *     (`clip.start + 35 × frameSec`): el grafisme encara s'està muntant al
 *     primer frame, així que eixe no val.
 *   · D21: el frame s'extrau **de la TIMELINE amb QE** (`Render.snapshot` →
 *     `qeSeq.exportFramePNG`): el frame de `sampleTime` és, per definició, el
 *     d'AQUEST clip. ⛔ El MEDIA amb ffmpeg (`srcTime` = `inPoint` + offset)
 *     queda de RESERVA: traduir un TC del timeline a un segon del fitxer no és
 *     fiable en les V1 d'esta cadena (BUG #207: el frame del clip 36:22 eixia
 *     del contingut del clip 43:08 → el tuit anava a un clip que no era, D19).
 *     ⛔ `Render.frame` NO existix al DOM de PPro 25 (BUG #205).
 *   · D5/D6: del PNG se'n trauen DOS pistes: el text darrere d'un `@`
 *     (`handleOf`, pista forta) i el NOM DEL TITULAR de la franja naranja
 *     (`rankCandidates`, pista de reforç). El nom del fitxer ve TRUNCAT a ~93
 *     caràcters (`@K`, `@N`, `@junqu`), per això el handle es compara per PREFIX.
 *   · D13: els CANDIDATS són els `.mov` que la IMPORTACIÓ ja ha portat al
 *     projecte (`Project.items`), no una carpeta: es compara el clip amb els
 *     movies XARXES que hi ha al bin (`esXarxes`/`flotants`) i es descompten
 *     els que JA estan col·locats (`pendents`).
 *   · D3: `Config.rutas.chyrons` només s'usa per al diàleg d'emergència.
 *
 * AQUEST MÒDUL NO TOCA LA TIMELINE ni obri cap finestra: només mesura, puntua
 * i decidix. El flux viu a `js/workflows/flow_twitts.js`.
 * ==========================================================================*/
(function () {
    'use strict';

    window.FASTPASS_UI = window.FASTPASS_UI || {};
    var Logic = window.FASTPASS_UI.Logic = window.FASTPASS_UI.Logic || {};

    // Versió de la RECEPTA: si canvien els llindars, puja-la (invalida la caché).
    var VER = 'v2';

    var CACHE_FILE = 'C:\\temp\\fp_twitts_cache.json';
    var CACHE_MAX = 500;

    var DEFAULTS = {
        sampleFrame: 35,        // D2: frame 35 des de l'in del clip
        frameSec: 0.04,         // 25 fps (convenció del repo: FRAME_TOL)
        umbral: 80,             // ≥ → col·locació automàtica
        umbralDubte: 40,        // ≥ → pareix tuit encara que no case (D4)
        minTitular: 0.60,       // similitud mínima del nom del titular (D5)
        minDur: 3.0,            // D14: un clip més curt no és cap tuit
        maxClips: 80,           // D14: sostre de seguretat d'OCR per passada
        ocrLangs: ['es-ES', 'en-US'],  // no hi ha ca-ES a Windows OCR
        // D21: la mostra ix SEMPRE de la timeline (QE = `Render.snapshot`); este
        // permís només habilita ffmpeg SOBRE EL MEDIA com a reserva si el QE falla
        // (D19). `false` = si el QE falla, el clip es queda sense mostra.
        frameFromMedia: true
    };

    function utils() {
        return (window.FASTPASS_UI && window.FASTPASS_UI.Utils) ? window.FASTPASS_UI.Utils : null;
    }
    function log(msg, lvl) {
        try { utils().log(msg, lvl || 'DEBUG'); }
        catch (e) { try { console.log(msg); } catch (e2) { } }
    }

    // ════════════════════════════════════════════════════════════════════════
    // PURES (prova headless, sense CEP)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * normTxt: normalitza text per comparar (OCR vs nom de fitxer): majúscules,
     * sense accents ni diacrítics, sense puntuació i amb espais simples.
     * (Windows OCR no té català i torna accents i guions baixos de qualsevol manera.)
     */
    function normTxt(s) {
        var t = String(s == null ? '' : s);
        try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
        catch (e) {
            t = t.replace(/[ÀÁÂÃÄÅ]/g, 'A').replace(/[ÈÉÊË]/g, 'E')
                 .replace(/[ÌÍÎÏ]/g, 'I').replace(/[ÒÓÔÕÖ]/g, 'O')
                 .replace(/[ÙÚÛÜ]/g, 'U').replace(/Ç/g, 'C');
        }
        return t.toUpperCase().replace(/[^A-Z0-9@]+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    /**
     * handlesOf: tots els handles del text (sense '@', sense '_'/'.', en
     * minúscules), del més llarg al més curt. `@Nunez_Feijoo` → 'nunezfeijoo'.
     * D6: és la pista FORTA; el nom del movie pot dur-la truncada (`@junqu`).
     */
    function handlesOf(text) {
        var out = [];
        var re = /@[A-Za-z0-9_.]{1,30}/g;
        var m;
        var s = String(text == null ? '' : text);
        while ((m = re.exec(s)) !== null) {
            var h = m[0].substring(1).replace(/[_.]+/g, '').toLowerCase();
            if (!h) continue;
            if (out.indexOf(h) === -1) out.push(h);
        }
        out.sort(function (a, b) { return b.length - a.length; });
        return out;
    }

    /** handleOf: el handle més llarg del text, o '' (el que es mostra a la finestra). */
    function handleOf(text) {
        var h = handlesOf(text);
        return h.length ? h[0] : '';
    }


    /**
     * wottFields: parts útils del NOM d'un movie de tuit.
     *   `Wott_TNM_V_00_00.00_LUCYS VERTICALITZACIÓ_665892_XARXES-TEXT_tp_`
     *   `Oriol Junqueras_ERC_@junqu.00665945.mov`
     *     → { nom: 'Oriol Junqueras', partit: 'ERC', handle: 'junqu' }
     * Si el nom no duu `_tp_`, el nom queda buit (encara pot casar pel handle).
     */
    function wottFields(name) {
        var base = String(name == null ? '' : name).replace(/\.(mov|mp4|png|jpe?g)$/i, '');
        var out = { nom: '', partit: '', handle: '', rol: '' };
        var m = /_tp_([^_]+)(?:_([^_]+))?(?:_(@?[A-Za-z0-9]*))?/.exec(base);
        if (m) {
            out.nom = String(m[1] || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
            out.partit = String(m[2] || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
            // El 3r camp és el handle, PERÒ quan el movie no en duu (p. ex.
            // `_president de_00658364`) el que hi ha és l'ID numèric → no és handle.
            var h = String(m[3] || '').replace(/^@/, '').replace(/[_.]+/g, '');
            if (!/[A-Za-z]/.test(h)) h = '';
            out.handle = h.toLowerCase();
        }
        var r = /_(XARXES[^_]*)_/i.exec(base);
        if (r) out.rol = r[1];
        return out;
    }

    /**
     * similitud: proporció (0..1) de paraules del NOM del titular (≥3 lletres)
     * que apareixen al text OCR. `ORIOL JUNQUERAS` dins del text → 1.
     * És el que mesura D5 (la franja naranja amb el nom del titular).
     */
    function similitud(textOcr, nom) {
        var t = ' ' + normTxt(textOcr) + ' ';
        var parts = normTxt(nom).split(' ').filter(function (w) { return w.length >= 3; });
        if (!parts.length) return 0;
        var hit = 0;
        for (var i = 0; i < parts.length; i++) {
            if (t.indexOf(' ' + parts[i] + ' ') !== -1) hit += 1;
            else if (t.indexOf(parts[i]) !== -1) hit += 0.5;   // tros (OCR tallat)
        }
        return hit / parts.length;
    }

    /**
     * scoreCandidat: (PURA) punts d'UN movie per al text OCR d'un clip.
     *
     * El nom del fitxer ve TRUNCAT a ~93 caràcters, així que el handle del movie
     * pot ser només `@K` o `@N` → mai decidix sol si té menys de 3 lletres: en
     * eixe cas qui mana és el NOM DEL TITULAR (D5).
     *
     * @returns {{score:number, handle:string, titular:number, partit:boolean}}
     */
    function scoreCandidat(textOcr, fileName) {
        var f = wottFields(fileName);
        var ocrH = handlesOf(textOcr);
        var score = 0;
        var hHit = '';
        if (f.handle) {
            for (var i = 0; i < ocrH.length; i++) {
                var h = ocrH[i];
                var pre = (f.handle.length < h.length) ? f.handle : h;   // prefix comú
                if (f.handle === h) { score += 100; hHit = f.handle; break; }
                if (f.handle.length >= 3 && pre.length >= 3 &&
                    (h.indexOf(f.handle) === 0 || f.handle.indexOf(h) === 0)) {
                    score += 100; hHit = f.handle; break;
                }
                if (f.handle.length >= 1 && h.indexOf(f.handle) === 0) { score += 40; hHit = f.handle; }
            }
        }
        var sim = similitud(textOcr, f.nom);
        if (sim >= 0.60) score += 50;
        else if (sim >= 0.40) score += 20;
        var hasPartit = false;
        if (f.partit && f.partit.length >= 2) {
            hasPartit = (' ' + normTxt(textOcr) + ' ').indexOf(' ' + normTxt(f.partit)) !== -1;
            if (hasPartit) score += 15;
        }
        return { score: score, handle: hHit, titular: sim, partit: hasPartit };
    }


    /**
     * rankCandidates: (PURA) ordena els candidats pel text OCR d'un clip.
     * Desempate: data de creació MÉS RECENT primer (un rexut del mateix tuit
     * guanya l'antic). Els de 0 punts queden al final, també per data.
     *
     * @param {string} textOcr
     * @param {Array<Object>} files - [{name, full, created, size}]
     * @returns {Array} còpia amb {…file, score, handle, titular, partit}
     */
    function rankCandidates(textOcr, files) {
        var out = [];
        var list = Array.isArray(files) ? files : [];
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            if (!f || !f.name) continue;
            var s = scoreCandidat(textOcr, f.name);
            out.push({
                name: f.name, full: f.full || '', created: f.created || 0, size: f.size || 0,
                score: s.score, handle: s.handle, titular: s.titular, partit: s.partit
            });
        }
        out.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            return (b.created || 0) - (a.created || 0);
        });
        return out;
    }

    /**
     * isTuit: (PURA) el frame del clip pareix un tuit cremat?
     * Sí si hi ha cap `@handle` al text O si el millor candidat arriba a
     * `umbralDubte`. Així no s'obri res en clips sense tuit (D4).
     */
    function isTuit(textOcr, ranked, cfg) {
        var c = cfg || {};
        var min = isFinite(c.umbralDubte) ? Number(c.umbralDubte) : DEFAULTS.umbralDubte;
        if (handlesOf(textOcr).length > 0) return true;
        if (ranked && ranked.length && ranked[0].score >= min) return true;
        return false;
    }

    /**
     * esXarxes: (PURA) el nom d'un ítem/fitxer és un GRAFISME DE TUIT (XARXES)?
     * D13: el que la importació ha portat al projecte com a movie de tuit és
     *   · el bloc A SEQUES (`Wott_<PROG>_V_00_00.00_…`, mateix criteri que
     *     `Parse._esFlotant` — BUG #191), o
     *   · el que porta el rol `XARXES` o la marca `LUCYS` al nom.
     * Només es mira el NOM: estos ítems ja són al bin del projecte.
     */
    function esXarxes(name) {
        var n = String(name == null ? '' : name);
        if (!n) return false;
        if (/XARXES/i.test(n)) return true;
        if (/LUCYS/i.test(n)) return true;
        // D22 (BUG #208): els tuit que s'exporten A MÀ es diuen
        //   `wott x salvador illa.00666202.mov` · `wott_v3 x pedro.00666211.mov`
        // No porten ni el rol `XARXES`, ni `LUCYS`, ni el bloc a seques: fins ara
        // esta família sencera quedava fora del pòsit i l'emergència no la
        // ensenyava. La forma és `wott` + (`_vN`/` vN` opcional) + `x` SEPARADA:
        // `Wott_TNM_V4_082_00.35_INSERTS …` no hi entra (després de `Wott` ve
        // un guió baix i el programa, no una `x` solta).
        if (/^wott(?:[_ ]v\d+)?\s+x\s+\S/i.test(n)) return true;
        var p = n.split('_');
        if (p.length < 5) return false;
        var bloc = p[2] || '';
        var lini = p[3] || '';
        return /^[A-Za-z]+$/.test(bloc) && /^\d+$/.test(lini) && Number(lini) === 0;
    }

    /**
     * nomNet: (PURA) el NOM que hi ha darrere del nom d'un movie de tuit, sense
     * la pell del nom (`wott`, `_vN`, la `x`, el número d'export ni l'extensió).
     *   `wott x salvador illa1.00666204.mov` → 'salvador illa1'
     *   `wott_v3 x pedro.00666211.mov`      → 'pedro'
     *   `Wott_TNM_V_00_00.00_…_Oriol Junqueras_ERC_@junqu.00665945.mov`
     *     → 'Wott TNM V 00 00.00 … Oriol Junqueras ERC @junqu'
     * (Per als movies amb `_tp_`, `wottFields().nom` és millor: això només és la
     * xarxa de seguretat per a les famílies sense camps — D22/D23.)
     */
    function nomNet(name) {
        var b = String(name == null ? '' : name).replace(/\.(mov|mp4|mxf|png|jpe?g)$/i, '');
        b = b.replace(/[\s._]*\d{5,}$/, '');                    // número d'export
        var m = /^\s*wott(?:[_ ]v\d+)?\s*x\s+(.+)$/i.exec(b);
        if (m) b = m[1];
        return b.replace(/_+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
    }

    /**
     * fileSuffix: (PURA) número d'export de Premiere del nom
     * (`…illa.00666204.mov` → 666204), o 0.
     * Dins d'un mateix dia créix amb cada export: servix per a ordenar per hora
     * d'export sense cap `stat` al NAS (que en fred costa ~100 s — D23).
     */
    function fileSuffix(name) {
        var m = /(\d{5,})\.(mov|mp4|mxf)$/i.exec(String(name == null ? '' : name));
        return m ? Number(m[1]) : 0;
    }

    /**
     * semNombre: (PURA) punts de SEMBLANÇA entre el text OCR d'un clip i el NOM
     * d'un movie (D23). És el que fa que, sense `_tp_` ni handle, `Salvador
     * Illa` detectat a l'OCR puge damunt de `wott x salvador illa.00666202.mov`:
     *   · +3 si el nom sencer (sense digits ni espais) ix dins del text
     *   · +1 per cada paraula del nom (≥3 lletres) que ix al text (+0,5 si
     *     només n'ix un tros: l'OCR sol tallar)
     *   · +2 si un @handle del text ix dins del nom (pista forta de D6)
     * @param {string} name - nom del movie
     * @param {string} textOcr - text detectat al clip
     * @returns {number} punts (0 = cap semblança)
     */
    function semNombre(name, textOcr) {
        var tSp = ' ' + normTxt(textOcr) + ' ';
        var tNS = tSp.replace(/ /g, '');
        if (!tNS) return 0;
        var nom = nomNet(name);
        var pts = 0;
        var base = normTxt(nom).replace(/[0-9]/g, '').replace(/ /g, '');
        if (base.length >= 6 && tNS.indexOf(base) !== -1) pts += 3;
        var ws = normTxt(nom).replace(/[0-9]+/g, ' ').split(' ');
        for (var i = 0; i < ws.length; i++) {
            var w = ws[i];
            if (w.length < 3) continue;
            if (tSp.indexOf(' ' + w + ' ') !== -1) pts += 1;
            else if (tNS.indexOf(w) !== -1) pts += 0.5;
        }
        var hs = handlesOf(textOcr);
        var nLow = String(name == null ? '' : name).toLowerCase().replace(/[^a-z0-9]/g, '');
        for (var j = 0; j < hs.length; j++) {
            if (hs[j].length >= 4 && nLow.indexOf(hs[j]) !== -1) { pts += 2; break; }
        }
        return pts;
    }

    /**
     * rankPick: (PURA) ordena la llista de l'emergència per a la finestra de
     * tria (D23): primer el que s'assembla al text del clip, després el que ja
     * és al projecte (+2), després l'export més recent (només desempata).
     * No lleva res: tots els ítems tornen, amb `pts` per a ensenyar-ho.
     * @param {Array<{name,full,tag}>} items
     * @param {string} textOcr
     * @returns {Array<{name,full,tag,pts,suf}>}
     */
    function rankPick(items, textOcr) {
        var list = Array.isArray(items) ? items : [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            if (!it || !it.name) continue;
            var p = semNombre(it.name, textOcr);
            if (String(it.tag || '') === 'al projecte') p += 2;
            out.push({
                name: it.name, full: it.full || '', tag: it.tag || '',
                pts: Math.round(p * 10) / 10, suf: fileSuffix(it.name)
            });
        }
        out.sort(function (a, b) {
            if (b.pts !== a.pts) return b.pts - a.pts;
            if (b.suf !== a.suf) return b.suf - a.suf;
            return String(a.name).toLowerCase() < String(b.name).toLowerCase() ? -1 : 1;
        });
        return out;
    }

    /**
     * pendents: (PURA) movies que encara NO són a la timeline.
     * `placed` és la llista de NOMS ja col·locats (qualsevol pista de vídeo):
     * així una segona passada no torna a inserir el mateix movie.
     */
    function pendents(files, placed) {
        var list = Array.isArray(files) ? files : [];
        var names = Array.isArray(placed) ? placed : [];
        var set = {};
        for (var j = 0; j < names.length; j++) {
            var nm = String(names[j] == null ? '' : names[j]);
            if (nm) set[nm] = true;
        }
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            if (!f || !f.name) continue;
            if (set[String(f.name)]) continue;
            out.push(f);
        }
        return out;
    }

    /**
     * sampleTime: (PURA) segon del timeline on s'exporta el frame del clip:
     * `clip.start + sampleFrame × frameSec` (D2: el 35, mai el primer).
     */
    function sampleTime(clip, cfg) {
        var c = cfg || {};
        var fs = isFinite(c.frameSec) ? Number(c.frameSec) : DEFAULTS.frameSec;
        var fr = isFinite(c.sampleFrame) ? Number(c.sampleFrame) : DEFAULTS.sampleFrame;
        var st = Number(clip && clip.start);
        if (!isFinite(st)) st = 0;
        return st + fr * fs;
    }

    /**
     * srcTime: (PURA) TC dins del MATERIAL que correspon a un instant del timeline.
     *
     * `Clips.get` dóna `start`/`end` (timeline) i `inPoint`/`outPoint` (material).
     * Si el clip no està re-timed les dos durades coincidixen i l'offset és directe;
     * si està accelerat/alentit (o invertit) no, i l'offset s'ha d'escalar amb la
     * relació `(outPoint − inPoint) / (end − start)` (D19).
     *
     * @param {Object} clip - { start, end, inPoint, outPoint }
     * @param {number} tSec - instant del timeline
     * @returns {number} segon dins del fitxer (mai negatiu)
     */
    function srcTime(clip, tSec) {
        if (!clip) return 0;
        var st = Number(clip.start);
        var ip = Number(clip && clip.inPoint);
        var t = Number(tSec);
        if (!isFinite(st)) st = 0;
        if (!isFinite(ip)) ip = 0;
        if (!isFinite(t)) t = st;
        var off = t - st;
        if (off < 0) off = 0;
        var dur = Number(clip && clip.end) - st;
        var mat = Number(clip && clip.outPoint) - ip;
        var speed = (dur > 0.001 && isFinite(mat) && mat > 0.001) ? (mat / dur) : 1;
        return ip + off * speed;
    }

    /** pad2: 7 → '07' (per a tcStr). */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    /** tcStr: 72.44 → '00:01:12:11' (25 fps per defecte; només per a logs/finestra). */
    function tcStr(sec, fps) {
        var f = (isFinite(fps) && Number(fps) > 0) ? Number(fps) : 25;
        var s = Number(sec);
        if (!isFinite(s) || s < 0) s = 0;
        var total = Math.round(s * f);
        var ff = total % Math.round(f);
        var t = Math.floor(total / f);
        return pad2(Math.floor(t / 3600)) + ':' + pad2(Math.floor(t / 60) % 60) + ':' +
            pad2(t % 60) + ':' + pad2(ff);
    }

    /**
     * opts: recepta efectiva = DEFAULTS + les opcions rebudes (només les que
     * tenen valor; així un `undefined` no trenca cap llindar).
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
        return out;
    }

    // ════════════════════════════════════════════════════════════════════════
    // CACHÉ de la TRIA MANUAL (D10): `C:\temp\fp_twitts_cache.json`
    // ════════════════════════════════════════════════════════════════════════

    /**
     * cacheKeyOf: (PURA) clau del que veu l'OCR (el que és estable entre
     * execucions): el handle si n'hi ha; si no, el començament del text.
     */
    function cacheKeyOf(textOcr) {
        var h = handleOf(textOcr);
        if (h) return 'h:' + h;
        return 't:' + normTxt(textOcr).substring(0, 60);
    }

    /**
     * cacheLookup: (PURA) entrada apresa per a eixe text, VALIDADA contra la
     * llista de candidats: si el fitxer ja no hi és (o ha canviat de mida/data)
     * l'entrada es descarta — un movie reexportat amb el mateix nom es torna a
     * preguntar (mateix criteri que GRAF_ZONA_GRIS, decisió D8 d'allà).
     *
     * @returns {Object|null} el candidat ({name, full, created, size}) o null
     */
    function cacheLookup(map, textOcr, files) {
        var m = map || {};
        var e = m[cacheKeyOf(textOcr)];
        if (!e || !e.file) return null;
        var list = Array.isArray(files) ? files : [];
        for (var i = 0; i < list.length; i++) {
            var f = list[i];
            if (!f || f.name !== e.file) continue;
            if (e.size && f.size && Number(e.size) !== Number(f.size)) break;   // reexportat
            return f;
        }
        return null;
    }

    /** cachePut: (PURA) desa la tria manual i retorna el TEXT del JSON a escriure. */
    function cachePut(map, textOcr, file) {
        var m = map || {};
        m['|VER'] = VER;
        m[cacheKeyOf(textOcr)] = {
            file: file && file.name ? file.name : '',
            size: file && file.size ? Number(file.size) : 0,
            created: file && file.created ? Number(file.created) : 0,
            at: Date.now()
        };
        var keys = [];
        for (var k in m) { if (m.hasOwnProperty(k)) keys.push(k); }
        if (keys.length > CACHE_MAX) {
            m = {};
            m['|VER'] = VER;
            m[cacheKeyOf(textOcr)] = { file: file.name, size: file.size || 0, created: file.created || 0, at: Date.now() };
        }
        try { return JSON.stringify(m); } catch (e) { return ''; }
    }

    /** cacheRead: (PURA) text del JSON → mapa (buit si està trencat). */
    function cacheRead(txt) {
        if (!txt) return { '|VER': VER };
        try {
            var o = JSON.parse(String(txt));
            if (!o || typeof o !== 'object' || o.length !== undefined) return { '|VER': VER };
            return o;
        } catch (e) { return { '|VER': VER }; }
    }

    /** readCache: llig el JSON de caché del disc ('' si no hi és). */
    function readCache() {
        try {
            var fs = window.cep && window.cep.fs;
            if (!fs || !fs.readFile) return '';
            var r = fs.readFile(CACHE_FILE);
            if (!r || r.err !== 0 || !r.data) return '';
            return String(r.data).replace(/^\uFEFF/, '');
        } catch (e) { return ''; }
    }

    /** writeCache: desa el JSON de caché al disc (silenciós si falla). */
    function writeCache(txt) {
        try {
            var fs = window.cep && window.cep.fs;
            if (!fs || !fs.writeFile || !txt) return false;
            var r = fs.writeFile(CACHE_FILE, txt);
            return !!(r && r.err === 0);
        } catch (e) { return false; }
    }

    // ════════════════════════════════════════════════════════════════════════
    // ORQUESTRACIÓ (mesura: NO toca timeline ni obri finestres)
    // ════════════════════════════════════════════════════════════════════════

    /** config: config viva del panell (mai es codifica cap ruta). */
    function config() {
        try {
            var CFG = window.FASTPASS_UI && window.FASTPASS_UI.Config;
            return (CFG && typeof CFG.get === 'function') ? (CFG.get() || {}) : {};
        } catch (e) { return {}; }
    }

    /**
     * folder: carpeta dels movies de tuit, de la CONFIG (D3).
     * `rutas.chyrons` és l'única font: si falta, es retorna '' i el flux avisa.
     */
    function folder() {
        var r = (config() && config().rutas) ? config().rutas : {};
        var p = String(r.chyrons || '');
        if (!p) return '';
        return p.replace(/\//g, '\\').replace(/\\+$/, '') + '\\';
    }

    /**
     * placedNames: noms dels clips que JA hi ha a la timeline (totes les pistes
     * de vídeo). El flux automàtic només ha de casar els movies que FALTEN
     * (D13): un XARXES ja col·locat no es torna a inserir.
     */
    async function placedNames() {
        var u = utils();
        var out = [];
        if (!u) return out;
        var total = 0;
        try { total = Number(await u.callJSX("Tracks.count('video')")) || 0; } catch (e) { total = 0; }
        var CL = Logic.Clips;
        if (!CL || typeof CL.getTrackClips !== 'function') return out;
        for (var t = 1; t <= total; t++) {
            var list = [];
            try { list = await CL.getTrackClips(t, 'video'); } catch (eT) { list = []; }
            list = list || [];
            for (var i = 0; i < list.length; i++) {
                var nm = String((list[i] && list[i].name) || '');
                if (nm) out.push(nm);
            }
        }
        return out;
    }

    /**
     * binsDe: (PURA) noms dels BINS de primer nivell d'una llista d'ítems del
     * projecte (`Project.items` posa `type: 2` als bins).
     *
     * PER QUÈ CAL: la importació deixa els movies a l'ARREL i tot seguit els
     * MOU a un bin (`Project.move(…, 'CHY')`, `3_Project_Logic.js:572`), i
     * `FASTPASS.Project.items('')` llig NOMÉS l'arrel (no és recursiu). Sense
     * mirar els bins, els XARXES no es veien mai i la passada automàtica
     * acabava en «cap movie de tuit al projecte» sense fer cap OCR.
     */
    function binsDe(items) {
        var list = Array.isArray(items) ? items : [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            if (!it || !it.name) continue;
            if (Number(it.type) !== 2) continue;
            out.push(String(it.name));
        }
        return out;
    }

    /** uniqItems: (PURA) lleva els ítems repetits (mateix nom + ruta). */
    function uniqItems(items) {
        var list = Array.isArray(items) ? items : [];
        var out = [], seen = {};
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            if (!it || !it.name) continue;
            var k = String(it.name) + '|' + String(it.mediaPath || '');
            if (seen[k]) continue;
            seen[k] = true;
            out.push(it);
        }
        return out;
    }

    /**
     * projectItems: TOTS els ítems del projecte que poden ser movies de tuit:
     * l'ARREL + els bins de primer nivell (`Project.items('')` no és recursiu).
     *
     * @returns {Promise<{ok:boolean, items:Array, bins:Array, why:string}>}
     */
    async function projectItems() {
        var u = utils();
        if (!u || typeof u.callJSX !== 'function') {
            return { ok: false, items: [], bins: [], why: 'sense Utils.callJSX' };
        }
        var root = [];
        try {
            var raw = await u.callJSX("FASTPASS.Project.items('')");
            root = JSON.parse(String(raw == null ? '[]' : raw));
        } catch (e) {
            return { ok: false, items: [], bins: [], why: 'Project.items: ' + e.message };
        }
        if (!Array.isArray(root)) root = [];
        var bins = binsDe(root);
        var all = root.slice();
        for (var i = 0; i < bins.length; i++) {
            var list = [];
            try {
                var rawB = await u.callJSX('FASTPASS.Project.items(' + JSON.stringify(bins[i]) + ')');
                list = JSON.parse(String(rawB == null ? '[]' : rawB));
            } catch (eB) { list = []; }
            if (!Array.isArray(list)) list = [];
            for (var k = 0; k < list.length; k++) all.push(list[k]);
        }
        return { ok: true, items: uniqItems(all), bins: bins, why: '' };
    }

    /**
     * flotants: els movies de TUIT (XARXES) que hi ha al PROJECTE perquè la
     * IMPORTACIÓ ja els ha portat (D13) — mai una carpeta ni una data.
     * `FASTPASS.Project.items('')` torna [{name, type, mediaPath, duration, size}].
     *
     * @param {Object} [o] - { placed: [noms ja col·locats] }
     * @returns {Promise<{ok:boolean, files:Array, pendents:Array, placed:Array, why:string}>}
     */
    async function flotants(o) {
        var buit = { ok: false, files: [], pendents: [], placed: [], paths: {}, why: '' };
        // ARREL + BINS: els movies de tuit viuen al bin CHY (la importació els
        // hi mou), no a l'arrel del projecte (vegeu `binsDe`).
        var pi = await projectItems();
        if (!pi.ok) { buit.why = pi.why; return buit; }
        var items = pi.items;
        var files = [];
        // `paths`: nom de l'ítem → ruta del media. És el que permet a `samplePng`
        // traure el frame amb ffmpeg (via ràpida, D19) sense tocar la timeline.
        var paths = {};
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it || !it.name) continue;
            if (it.mediaPath) paths[String(it.name)] = String(it.mediaPath);
            if (!esXarxes(it.name)) continue;
            files.push({
                name: String(it.name),
                full: String(it.mediaPath || ''),
                size: Number(it.size) || 0,
                dur: Number(it.duration) || 0
            });
        }
        var placed = Array.isArray(o && o.placed) ? o.placed : [];
        var queden = pendents(files, placed);
        log('🐦 [TWITTS] ' + items.length + ' ítem(s) al projecte (' + pi.bins.length +
            ' bin(s): ' + (pi.bins.join(', ') || '—') + ') · movies de tuit (XARXES): ' +
            files.length + ' · sense col·locar: ' + queden.length, 'INFO');
        return { ok: true, files: files, pendents: queden, placed: placed, paths: paths, why: '' };
    }


    /**
     * pathOf: (PURA) ruta del media d'un clip dins del mapa `paths` (nom→ruta).
     *
     * El nom del clip i el de l'ítem del projecte solen coincidir, però no sempre
     * (extensió, majúscules). Ordre: exacte → sense distingir majúscules →
     * sense extensió. Buit si no hi és (llavors `samplePng` cau a la via QE).
     */
    function pathOf(paths, name) {
        if (!paths || !name) return '';
        var n = String(name);
        if (paths[n]) return String(paths[n]);
        var low = n.toLowerCase();
        var keys = Object.keys(paths);
        var i;
        for (i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase() === low) return String(paths[keys[i]]);
        }
        var base = low.replace(/\.[a-z0-9]{2,5}$/, '');
        for (i = 0; i < keys.length; i++) {
            if (keys[i].toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '') === base) {
                return String(paths[keys[i]]);
            }
        }
        return '';
    }

    /** pngPathOf: ruta del PNG de mostra d'un clip (a C:\temp). */
    function pngPathOf(n) {
        var u = utils();
        if (u && typeof u.tempPath === 'function') {
            try {
                var p = u.tempPath('fp_twitts_' + n + '.png');
                if (p) return p;
            } catch (e) { }
        }
        return 'C:\\temp\\fp_twitts_' + n + '.png';
    }

    /**
     * samplePng: aconseguix el frame de mostra del clip (D2) en un PNG.
     *
     * D21 (2026-10-29): DUES vies, i la primera és la de la TIMELINE.
     *   1. **QE des de la timeline** (`Render.snapshot` = `exportFrameQE` →
     *      `qeSeq.exportFramePNG`, el MATEIX mecanisme de `flow_chyrons.
     *      _capturePng`, en producció): el frame de `sampleTime` és el del clip
     *      que s'està mirant, sense traduir cap TC del timeline a un segon del
     *      fitxer. Amplia l'Out point si cal i el restaura SEMPRE.
     *   2. **ffmpeg sobre el MEDIA del clip** (`FFmpeg.extractFramePng`, el mateix
     *      àtom del OCR de títols: `-ss` davant de `-i`, ~0,3 s/frame), només de
     *      RESERVA: no toca la timeline ni porta chyrons al damunt, però depén de
     *      `srcTime` (`inPoint` + offset escalat) i eixe mapeig NO és fiable en
     *      les V1 d'esta cadena (BUG #207: el frame del clip 36:22 eixia del
     *      contingut del clip 43:08 → el tuit anava a un clip que no era).
     *
     * ⛔ `Render.frame` (= `seq.exportFrame`) NO existeix al DOM de Premiere 25
     * («seq.exportFrame is not a function»): era l'única via que hi havia ací
     * fins al 29/10 i feia que TOTA la passada acabara en «0 col·locat(s) ·
     * 0 pendent(s)» sense dir per què (BUG #205).
     *
     * @param {Object} clip - { start, end, inPoint, outPoint, name } de `Clips.get`
     * @param {Object} [o] - { index, cfg, paths } · `paths` = mapa nom→ruta del media
     * @returns {Promise<{ok:boolean, png:string, t:number, via:string, why:string}>}
     */
    async function samplePng(clip, o) {
        var c = opts(o && o.cfg);
        var u = utils();
        var t = sampleTime(clip, c);
        var png = pngPathOf((o && o.index) || 1);
        try { await u.callJSX('IO.remove(' + JSON.stringify(png) + ')'); } catch (eR) { }
        // El QE pot escriure la ruta SENSE extensió (ho contempla `_frameFromTimeline`):
        // si quedara el PNG d'una passada anterior, `_waitForPath` el donaria per bo i
        // s'OCR-ejaria un frame que no és d'este clip.
        var pngBase = String(png).replace(/\.png$/i, '');
        try { await u.callJSX('IO.remove(' + JSON.stringify(pngBase) + ')'); } catch (eR2) { }
        // 🥇 1) QE des de la TIMELINE (D21): el frame de `t` és, per definició, el
        //    d'AQUEST clip. És l'única via que no ha de traduir un TC del timeline
        //    a un segon del fitxer: eixa traducció és la que va trencar la
        //    col·locació (BUG #207: frame del clip 36:22 = contingut del 43:08).
        var rq = await _frameFromTimeline(png, t);
        if (rq.ok) return { ok: true, png: rq.png, t: t, via: 'QE', why: '' };
        var whyQe = rq.why || 'QE sense frame';
        // 🥈 2) ffmpeg sobre el MEDIA (D19 · només de reserva).
        var src = pathOf((o && o.paths) || null, (clip && clip.name) || '');
        if (c.frameFromMedia && src) {
            var rm = await _frameFromMedia(src, srcTime(clip, t), png);
            if (rm.ok) return { ok: true, png: png, t: t, via: 'ffmpeg', why: 'QE: ' + whyQe };
            return { ok: false, png: png, t: t, via: 'ffmpeg', why: 'QE: ' + whyQe + ' · ffmpeg: ' + rm.why };
        }
        return { ok: false, png: png, t: t, via: 'QE', why: whyQe };
    }

    /**
     * _frameFromMedia: frame del FITXER del clip amb ffmpeg (RESERVA, D19).
     * Només s'usa si el QE (`Render.snapshot`) no ha donat cap frame.
     * Frame COMPLET (`roiY: [0,1]`): el tuit pot estar en qualsevol franja.
     */
    async function _frameFromMedia(src, tSec, png) {
        var F = (Logic && Logic.FFmpeg) ? Logic.FFmpeg : null;
        if (!F || typeof F.extractFramePng !== 'function') {
            return { ok: false, why: 'sense Logic.FFmpeg.extractFramePng' };
        }
        var r = null;
        try { r = await F.extractFramePng(src, tSec, png, { roiY: [0, 1], roiX: null }); }
        catch (e) { return { ok: false, why: 'extractFramePng: ' + e.message }; }
        if (!r || !r.ok) return { ok: false, why: 'extractFramePng: ' + ((r && r.error) || 'error') };
        var ready = false;
        try { ready = await _waitForPath(png, 200, 20000); } catch (eW) { ready = false; }
        if (!ready) return { ok: false, why: 'el PNG de mostra no ha aparegut (ffmpeg)' };
        return { ok: true, why: '' };
    }

    /**
     * _frameFromTimeline: frame del PROGRAMA amb QE (`Render.snapshot`, D21 · via
     * PRINCIPAL): el frame és el del clip per construcció, no hi ha traducció
     * TC→segon del fitxer.
     * Mateix patró que `flow_chyrons._capturePng`: si l'Out point queda abans de
     * l'instant, QE no escriu res → s'amplia i es restaura SEMPRE.
     */
    async function _frameFromTimeline(png, tSec) {
        var u = utils();
        var base = String(png).replace(/\.png$/i, '');
        var t = Number(tSec);
        if (!isFinite(t)) t = 0;
        var outRestore = null;
        try {
            var out0 = Number(await u.callJSX('Timeline.getOut()')) || 0;
            if (!(out0 >= t + 1 - 0.02)) {
                outRestore = (isFinite(out0) && out0 > 0) ? out0 : 0;
                await u.callJSX('Timeline.out(' + (t + 2).toFixed(3) + ')');
            }
        } catch (eOut) { outRestore = null; }
        var why = '';
        try {
            var r = await u.callJSX('Render.snapshot(' + JSON.stringify(base) + ', ' + t.toFixed(4) + ')',
                { rawError: true });
            var txt = String(r == null ? '' : r);
            if (txt && txt.indexOf('OK') !== 0) why = 'Render.snapshot: ' + txt;
        } catch (e) { why = 'Render.snapshot: ' + e.message; }
        var pngReal = png;
        if (!why) {
            var ready = false;
            try { ready = await _waitForPath(png, 200, 15000); } catch (eW) { ready = false; }
            if (!ready) {
                // QE pot escriure la ruta SENSE extensió (flow_chyrons ho contempla).
                try { ready = await _waitForPath(base, 200, 2000); } catch (eB) { ready = false; }
                if (ready) pngReal = base;
            }
            if (!ready) why = 'el PNG de mostra no ha aparegut (QE)';
        }
        if (outRestore !== null && outRestore > 0) {
            try { await u.callJSX('Timeline.out(' + outRestore.toFixed(3) + ')'); } catch (eR) { }
        }
        if (why) return { ok: false, png: png, t: t, via: 'QE', why: why };
        return { ok: true, png: pngReal, t: t, via: 'QE', why: '' };
    }

    /**
     * _waitForPath: espera (sense bloquejar) que un fitxer existisca. Mateix
     * patró que `17_TitoletDetect_Logic.js:841` (polling: no hi ha watchers).
     */
    function _waitForPath(path, intervalMs, timeoutMs) {
        var u = utils();
        var step = Math.max(50, Number(intervalMs) || 200);
        var limit = Math.max(step, Number(timeoutMs) || 20000);
        var t0 = Date.now();
        return new Promise(function (resolve) {
            async function poll() {
                var ex = false;
                try {
                    var raw = await u.callJSX('IO.exists(' + JSON.stringify(path) + ')');
                    ex = (String(raw).indexOf('true') === 0 || String(raw) === '1');
                } catch (e) { ex = false; }
                if (ex) return resolve(true);
                if (Date.now() - t0 >= limit) return resolve(false);
                setTimeout(poll, step);
            }
            poll();
        });
    }


    /**
     * ocrClip: UNA mostra d'un clip → text OCR. És el pas car (≈0,3 s d'exportar
     * el frame + ≈1,9 s d'OCR), per això D1: un sol frame per clip i prou.
     *
     * @param {Object} clip - { start, end, name, … }
     * @param {Object} [o]  - { index, cfg, files, paths } · `paths` = nom→ruta del media
     * @returns {Promise<{ok, clip, text, handle, ranked, best, score, isTuit, via, why}>}
     */
    async function ocrClip(clip, o) {
        var c = opts(o && o.cfg);
        var out = {
            ok: false, clip: clip, text: '', handle: '', ranked: [], best: null,
            score: 0, isTuit: false, via: '', why: '', t: sampleTime(clip, c)
        };
        var td = Logic.TitoletDetect;
        if (!td || typeof td.ocrText !== 'function') { out.why = 'sense TitoletDetect.ocrText'; return out; }
        var sp = await samplePng(clip, {
            index: (o && o.index) || 1, cfg: c, paths: (o && o.paths) || null
        });
        // ⛔ MAI en silenci (BUG #205): si no hi ha mostra, el motiu ha de quedar
        // al FASTPASS.log del projecte (abans este return no deixava rastre i la
        // passada acabava en «0 col·locat(s) · 0 pendent(s)» sense explicació).
        if (!sp.ok) {
            out.why = sp.why;
            log('⚠️ [TWITTS] ' + tcStr(clip.start) + ' «' +
                String(clip.name || '').substring(0, 40) + '» sense mostra per a l\'OCR: ' + sp.why, 'WARN');
            return out;
        }
        out.via = sp.via || '';
        out.t = sp.t;
        var txt = '';
        try { txt = await td.ocrText(sp.png, { ocrLangs: c.ocrLangs }); }
        catch (e) { out.why = 'OCR: ' + e.message; return out; }
        out.text = String(txt == null ? '' : txt);
        out.handle = handleOf(out.text);
        out.ranked = rankCandidates(out.text, (o && o.files) || []);
        out.best = out.ranked.length ? out.ranked[0] : null;
        out.score = out.best ? out.best.score : 0;
        out.isTuit = isTuit(out.text, out.ranked, c);
        out.ok = true;
        log('🐦 [TWITTS] ' + tcStr(clip.start) + ' «' + String(clip.name || '').substring(0, 40) + '» · ' +
            (out.isTuit ? 'TUIT' : 'sense tuit') + ' · @' + (out.handle || '—') +
            ' · millor ' + out.score + (out.best ? ' («' + out.best.name.substring(0, 40) + '…»)' : '') +
            ' · ' + (out.via || '?'),
            out.isTuit ? 'INFO' : 'DEBUG');
        return out;
    }

    /**
     * scanClips: recorre els clips (ja filtrats pel flux) i torna NOMÉS els que
     * pareixen tuit (D4), amb el seu candidat:
     *   · `tria` → el movie de la llista de candidats que hi casa (o la tria
     *     apresa a la caché, D10), o null si la puntuació no arriba a `umbral`.
     * `o.onHit(entry)` deixa que el flux decidisca en calent; si torna `false`
     * s'atura la passada (el flux ho fa servir per a parar quan ja no queden
     * movies per col·locar: D13).
     *
     * @param {Array} clips - de `Clips.get`/`getTrackClips`
     * @param {Array} files - candidats (de `flotants().pendents`)
     * @param {Object} [cfg]
     * @param {Object} [o]  - { onHit: function(entry) → boolean, paths: nom→ruta media }
     * @returns {Promise<Array>}
     */
    async function scanClips(clips, files, cfg, o) {
        var c = opts(cfg);
        var out = [];
        var list = Array.isArray(clips) ? clips : [];
        var cache = cacheRead(readCache());
        var fets = 0;
        for (var i = 0; i < list.length; i++) {
            var clip = list[i];
            if (!clip) continue;
            var dur = Number(clip.end) - Number(clip.start);
            if (!(dur >= c.minDur)) continue;
            if (fets >= c.maxClips) {
                log('🐦 [TWITTS] aturat al sostre de ' + c.maxClips + ' clips (maxClips)', 'WARN');
                break;
            }
            fets++;
            var r = await ocrClip(clip, {
                index: i + 1, cfg: c, files: files, paths: (o && o.paths) || null
            });
            if (!r.ok || !r.isTuit) continue;
            var apres = cacheLookup(cache, r.text, files);
            var tria = apres || ((r.score >= c.umbral && r.best) ? r.best : null);
            var entry = {
                clip: clip, text: r.text, handle: r.handle, ranked: r.ranked,
                best: r.best, score: r.score, t: r.t,
                tria: tria, apres: !!apres, auto: !!tria
            };
            out.push(entry);
            if (o && typeof o.onHit === 'function') {
                var seguir = await o.onHit(entry);
                if (seguir === false) break;
            }
        }
        return out;
    }

    /**
     * learn: desa al disc la tria manual (D10) perquè la pròxima volta case sola.
     * @returns {boolean} cert si s'ha pogut escriure
     */
    function learn(textOcr, file) {
        if (!file || !file.name) return false;
        var map = cacheRead(readCache());
        var txt = cachePut(map, textOcr, file);
        var ok = writeCache(txt);
        log('🐦 [TWITTS] apresa la tria @' + (handleOf(textOcr) || '—') + ' → «' +
            file.name + '»' + (ok ? '' : ' (NO s\'ha pogut desar la caché)'), ok ? 'INFO' : 'WARN');
        return ok;
    }

    // ════════════════════════════════════════════════════════════════════════
    // EXPORT
    // ════════════════════════════════════════════════════════════════════════
    Logic.TwittsOcr = {
        VER: VER,
        DEFAULTS: DEFAULTS,
        // pures
        opts: opts,
        normTxt: normTxt,
        handlesOf: handlesOf,
        handleOf: handleOf,
        wottFields: wottFields,
        nomNet: nomNet,
        fileSuffix: fileSuffix,
        semNombre: semNombre,
        rankPick: rankPick,
        similitud: similitud,
        scoreCandidat: scoreCandidat,
        rankCandidates: rankCandidates,
        isTuit: isTuit,
        esXarxes: esXarxes,
        pendents: pendents,
        binsDe: binsDe,
        uniqItems: uniqItems,
        sampleTime: sampleTime,
        srcTime: srcTime,
        tcStr: tcStr,
        cacheKeyOf: cacheKeyOf,
        cacheLookup: cacheLookup,
        cachePut: cachePut,
        cacheRead: cacheRead,
        // IO / orquestració
        folder: folder,
        placedNames: placedNames,
        flotants: flotants,
        pngPathOf: pngPathOf,
        pathOf: pathOf,
        samplePng: samplePng,
        ocrClip: ocrClip,
        scanClips: scanClips,
        readCache: readCache,
        writeCache: writeCache,
        learn: learn
    };
})();

