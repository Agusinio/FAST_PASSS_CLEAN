/* ============================================================================
 * PROVA #199 (2026-10-28) · PALETA amb ZONA GRISA → grafisme a V2 + màscara a V3
 * ----------------------------------------------------------------------------
 * QUÈ ES PROVA
 *   A) El mòdul `js/logic/21_GrafZonaGris_Logic.js` (pures): color de la placa,
 *      recepta (no trenca llindars posats a 0), veredicte, clau de caché que
 *      DISTINGIX VERSIONS (data de creació), lectura del JSON de caché i la
 *      cobertura d'un buffer rgb24 sintètic.
 *   B) El flux de la paleta (`js/workflows/flow_mapa.js`):
 *      · `_itemRangeAt` = rang de l'ÍTEM d'escaleta (marcador de la LÍNIA → següent
 *        número de línia, o siga marcador a marcador; si no n'hi ha, corxet OUT);
 *      · `_mascaraAParking` = corta el troç de màscara de l'ítem i el puja, DEIXANT
 *        un forat net a la pista de la màscara per al grafisme i SENSE tocar cap
 *        altre clip (ni de V2 ni de V3);
 *      · la connexió real `_placeClips` → `_zonaGris` → `_mascaraAParking`.
 *
 * MODEL: un `Utils.callJSX` de joguina amb dues pistes de vídeo (V2 màscara, V3
 * grafismes) i `Clips.at/get/retrim/removeAt`; IPD+ (`_ipdPlusPoner` i companyia)
 * se substitueix per un insert+retrim SIMULAT de la mateixa durada, que és el que
 * fa el flux real.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        var GZ = UI.Logic.GrafZonaGris;
        window.__PHASE = '25-graf-zona-gris';

        // ── A. PURES DEL MÒDUL DE DETECCIÓ ─────────────────────────────────
        ok('#199 mòdul 21_GrafZonaGris_Logic carregat (Logic.GrafZonaGris)',
            !!(GZ && typeof GZ.detect === 'function' && typeof GZ.decide === 'function' &&
                typeof GZ.decideSeries === 'function' && typeof GZ.analyseSeries === 'function'),
            'GrafZonaGris=' + typeof GZ);
        if (!GZ) { return; }

        var c = GZ.hexToRgb('#D9D9D9');
        ok('#199 hexToRgb("#D9D9D9") = 217/217/217 (gris mesurat de la placa)',
            !!c && c.r === 217 && c.g === 217 && c.b === 217, JSON.stringify(c));
        ok('#199 hexToRgb tolera sense "#" i minúscules',
            JSON.stringify(GZ.hexToRgb('d9d9d9')) === JSON.stringify(c) &&
            JSON.stringify(GZ.hexToRgb(' D9D9D9 ')) === JSON.stringify(c));
        ok('#199 hexToRgb retorna null si el text no és un hex de 6 dígits',
            GZ.hexToRgb('#D9D') === null && GZ.hexToRgb('gris') === null && GZ.hexToRgb(null) === null);

        var d0 = GZ.opts({});
        ok('#199 recepta per defecte: t=3s · franja y0,60→1,00 · #D9D9D9 ±25 · minCov 30',
            d0.tSec === 3 && d0.roiY[0] === 0.60 && d0.roiY[1] === 1.00 &&
            d0.color === '#D9D9D9' && d0.tol === 25 && d0.minCov === 30 && d0.rgb.r === 217,
            JSON.stringify({ t: d0.tSec, roiY: d0.roiY, tol: d0.tol, min: d0.minCov }));
        ok('#199 recepta: minCov=0 es RESPECTA (no el substituïx pel defecte)',
            GZ.opts({ minCov: 0 }).minCov === 0 && GZ.opts({ minCov: null }).minCov === 30);
        ok('#199 recepta: un color invàlid cau al gris de la placa',
            GZ.opts({ color: 'no-hex' }).rgb.r === 217);

        ok('#199 decide: cov alta → AMB zona grisa',
            GZ.decide(100, d0).hasGrey === true && GZ.decide(30, d0).hasGrey === true);
        ok('#199 decide: cov baixa → SENSE zona grisa (llindar 30 %)',
            GZ.decide(29.9, d0).hasGrey === false && GZ.decide(0, d0).hasGrey === false);
        ok('#199 decide: una cov no numèrica compta com a 0 (no peta)',
            GZ.decide(NaN, d0).hasGrey === false && GZ.decide(null, d0).cov === 0);

        var base = { size: 1234, created: 1700000000000, modified: 1800000000000 };
        var RUTA = '\\\\nas\\ZZZ_GRAFISME\\27 OCTUBRE\\ATUR EPA.mov';
        var k1 = GZ.cacheKey(RUTA, base, 'v1');
        ok('#199 cacheKey: mateixa ruta+mida+creació → mateixa clau (caché efectiva)',
            k1 === GZ.cacheKey(RUTA, base, 'v1'), k1);
        ok('#199 cacheKey: una DATA DE CREACIÓ nova (altra versió del mateix nom) → clau nova',
            k1 !== GZ.cacheKey(RUTA, { size: 1234, created: 1700000009999, modified: 1800000000000 }, 'v1'));
        ok('#199 cacheKey: una MIDA nova → clau nova',
            k1 !== GZ.cacheKey(RUTA, { size: 4321, created: 1700000000000, modified: 1800000000000 }, 'v1'));
        ok('#199 cacheKey: canvi de VER (recepta) → clau nova',
            k1 !== GZ.cacheKey(RUTA, base, 'v2'));
        ok('#199 cacheKey: sense data de creació cau al modified (caché no desactivada)',
            GZ.cacheKey('c:\\x.mov', { size: 1, created: 0, modified: 777 }, 'v1').indexOf('|777|') !== -1);

        ok('#199 cacheRead: buit / trencat / array → caché buida',
            JSON.stringify(GZ.cacheRead('')) === '{}' &&
            JSON.stringify(GZ.cacheRead('no és json')) === '{}' &&
            JSON.stringify(GZ.cacheRead('[]')) === '{}');
        ok('#199 cacheRead: JSON vàlid → mapa', GZ.cacheRead('{"a":1}').a === 1);
        var putTxt = GZ.cachePut({}, 'k', { hasGrey: true, cov: 99 });
        ok('#199 cachePut: desa l\'entrada i el JSON es pot tornar a llegir',
            GZ.cacheRead(putTxt).k.hasGrey === true && GZ.cacheRead(putTxt).k.cov === 99);

        // Buffer sintètic 4x4: meitat de dalt gris 217, meitat de baix negre.
        var W2 = 4, H2 = 4, buf = new Uint8Array(W2 * H2 * 3);
        for (var y = 0; y < H2; y++) {
            for (var x = 0; x < W2; x++) {
                var pp = (y * W2 + x) * 3;
                var v = (y < 2) ? 217 : 0;
                buf[pp] = v; buf[pp + 1] = v; buf[pp + 2] = v;
            }
        }
        var an = GZ.analyse(buf, W2, H2, c, 25);
        ok('#199 analyse: mig gris exacte → cov 50 %',
            !!an && Math.abs(an.cov - 50) < 0.001, JSON.stringify(an));
        var bufBlanc = new Uint8Array(W2 * H2 * 3);
        for (var q = 0; q < bufBlanc.length; q++) bufBlanc[q] = 250;
        ok('#199 analyse: un blanc de 250 NO compta com a gris de placa (±25 arriba a 242)',
            GZ.analyse(bufBlanc, W2, H2, c, 25).cov === 0);
        ok('#199 analyse: buffer massa curt → null (no inventa cap cobertura)',
            GZ.analyse(new Uint8Array(10), W2, H2, c, 25) === null);

        // ── A2. MOSTRES MÚLTIPLES (2026-10-28: t=3 s va caure en un FUNDIT A BLANC) ──
        ok('#199 recepta per defecte: FINESTRA de 3 mostres (t=2,3,4 s: tStart 2 · tDur 2,5 · fps 1)',
            d0.tStart === 2 && d0.tDur === 2.5 && d0.fps === 1,
            JSON.stringify({ tStart: d0.tStart, tDur: d0.tDur, fps: d0.fps }));

        var need = W2 * H2 * 3;                       // 48 bytes per frame
        var serie = new Uint8Array(need * 3);
        serie.set(buf, 0);                            // t=2: 50 % gris
        serie.set(bufBlanc, need);                    // t=3: blanc (fundit)
        serie.set(buf, need * 2);                     // t=4: 50 % gris
        var covs = GZ.analyseSeries(serie, W2, H2, c, 25);
        ok('#199 analyseSeries: 3 frames encadenats → 3 cobertures (50/0/50)',
            !!covs && covs.length === 3 && Math.abs(covs[0] - 50) < 0.001 &&
            covs[1] === 0 && Math.abs(covs[2] - 50) < 0.001, JSON.stringify(covs));
        ok('#199 analyseSeries: els bytes que no completen un frame queden fora (mai mig frame)',
            (GZ.analyseSeries(new Uint8Array(need * 3 + 10), W2, H2, c, 25) || []).length === 3);
        ok('#199 analyseSeries: buffer massa curt → null',
            GZ.analyseSeries(new Uint8Array(10), W2, H2, c, 25) === null);

        ok('#199 decideSeries: un frame de transició NO canvia el veredicte (mediana 50 → AMB gris)',
            GZ.decideSeries([50, 0, 50], d0).hasGrey === true &&
            GZ.decideSeries([50, 0, 50], d0).med === 50);
        ok('#199 decideSeries: dues mostres sense gris i una amb gris → SENSE gris (mediana 0)',
            GZ.decideSeries([0, 50, 0], d0).hasGrey === false &&
            GZ.decideSeries([0, 50, 0], d0).med === 0);
        ok('#199 decideSeries: nombre parell de mostres → es pren la BAIXA (conservador)',
            GZ.decideSeries([80, 10], d0).med === 10 && GZ.decideSeries([80, 10], d0).hasGrey === false);
        ok('#199 decideSeries: sense mostres → SENSE gris, n=0 (no peta)',
            GZ.decideSeries([], d0).hasGrey === false && GZ.decideSeries(null, d0).n === 0);
        ok('#199 decideSeries: els valors no numerics queden fora del recompte',
            GZ.decideSeries([NaN, 100, 100], d0).n === 2 && GZ.decideSeries([NaN, 100, 100], d0).hasGrey === true);

        // ── B. FLUX DE LA PALETA (flow_mapa) ───────────────────────────────
        var MAPA = UI.Workflows.Mapa;
        var GRA = UI.Workflows.Graphics;
        ok('#199 flow_mapa carregat amb _itemRangeAt + _mascaraAParking + _zonaGris',
            !!(MAPA && MAPA._itemRangeAt && MAPA._mascaraAParking && MAPA._zonaGris && MAPA._pathFor),
            'Mapa=' + typeof MAPA);
        if (!MAPA) { return; }

        // ── MODEL DE TIMELINE (dues pistes) + PONT JSX ─────────────────────
        var savedCallJSX = UI.Utils.callJSX;
        var savedConfigGet = UI.Config.get;
        var savedPoner = GRA && GRA._ipdPlusPoner;
        var savedHeredar = GRA && GRA._ipdPlusHeredarMotion;
        var savedLlegir = GRA && GRA._ipdPlusLlegirMotion;
        var TL = {};                 // TL[pista] = [{ name, start, end, inPoint, outPoint }]
        var MARKERS = [];
        var OUT = 0;

        function setTrack(t, arr) {
            TL[t] = arr.map(function (x) {
                var ip = (x.inPoint || 0);
                // `mediaDur`: fins on arriba el MÈDIA (el clip usa tot el que li queda).
                // El `retrim` del model el respecta i respon WARN_INVALID si se li demana
                // més: és el que fa Premiere amb un clip de vídeo.
                return { name: x.name || 'MASCARA', start: x.start, end: x.end,
                         inPoint: ip, outPoint: ip + (x.end - x.start),
                         mediaDur: ip + (x.end - x.start) };
            });
        }
        function segs(t) {
            return (TL[t] || []).slice().sort(function (a, b) { return a.start - b.start; })
                .map(function (x) { return [Math.round(x.start * 100) / 100, Math.round(x.end * 100) / 100]; });
        }
        function solapa(t, a, b) {
            var arr = TL[t] || [];
            for (var i = 0; i < arr.length; i++) {
                if (arr[i].end > a + 0.01 && arr[i].start < b - 0.01) return true;
            }
            return false;
        }

        UI.Utils.callJSX = async function (expr) {
            var s = String(expr), m;
            if ((m = /^Markers\.get\(\)$/.exec(s))) return JSON.stringify(MARKERS);
            if ((m = /^Timeline\.getOut\(\)$/.exec(s))) return String(OUT);
            if ((m = /^Timeline\.duration\(\)$/.exec(s))) return String(OUT);
            if ((m = /^Clips\.count\((-?\d+), 'video'\)$/.exec(s))) {
                return String((TL[parseInt(m[1], 10)] || []).length);
            }
            if ((m = /^Clips\.get\((-?\d+), (\d+), 'video'\)$/.exec(s))) {
                var tr = parseInt(m[1], 10), ix = parseInt(m[2], 10);
                var arr = (TL[tr] || []).slice().sort(function (a, b) { return a.start - b.start; });
                if (!arr[ix]) return 'null';
                return JSON.stringify(arr[ix]);
            }
            if ((m = /^Clips\.at\((-?\d+), (-?[\d.]+), 'video'\)$/.exec(s))) {
                var tr2 = parseInt(m[1], 10), tt = parseFloat(m[2]);
                var arr2 = (TL[tr2] || []).slice().sort(function (a, b) { return a.start - b.start; });
                for (var i2 = 0; i2 < arr2.length; i2++) {
                    if (tt >= arr2[i2].start - 1e-6 && tt < arr2[i2].end - 1e-6) {
                        var o2 = arr2[i2];
                        return JSON.stringify({ index: i2, name: o2.name, start: o2.start, end: o2.end,
                            inPoint: o2.inPoint, outPoint: o2.outPoint });
                    }
                }
                return 'null';
            }
            if ((m = /^Clips\.retrim\((-?\d+), (\d+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+), 'video'\)$/.exec(s))) {
                var tr3 = parseInt(m[1], 10);
                var arr3 = (TL[tr3] || []).slice().sort(function (a, b) { return a.start - b.start; });
                var cl = arr3[parseInt(m[2], 10)];
                if (!cl) return 'ERR_NO_CLIP';
                // El model no deixa demanar més mèdia del que hi ha (Premiere: WARN_INVALID).
                if (parseFloat(m[4]) > (cl.mediaDur || 1e9) + 1e-6) {
                    return 'WARN_INVALID:out=' + m[4] + ' > mèdia=' + cl.mediaDur;
                }
                cl.inPoint = parseFloat(m[3]);
                cl.outPoint = parseFloat(m[4]);
                cl.end = parseFloat(m[5]);
                cl.start = cl.end - (cl.outPoint - cl.inPoint);
                return 'OK';
            }
            if ((m = /^Clips\.removeAt\((-?\d+), (-?[\d.]+), 'video', false\)$/.exec(s))) {
                var tr4 = parseInt(m[1], 10), at = parseFloat(m[2]);
                var arr4 = TL[tr4] || [];
                for (var i4 = 0; i4 < arr4.length; i4++) {
                    if (Math.abs(arr4[i4].start - at) < 0.06) { arr4.splice(i4, 1); return 'OK'; }
                }
                return 'ERR_NO_CLIP';
            }
            return 'OK';
        };
        UI.Config.get = function () {
            return { tracks: { video: { mp4: 1, mascara: 2, graficos: 3, graf: 3, temattitol: 6 } },
                     rutas: { destinoBase: 'C:/TMP/NAS/' } };
        };
        // IPD+ simulat: insert+retrim del troç demanat (mateixa durada, sense àudio).
        if (GRA) {
            GRA._ipdPlusPoner = async function (srcT, srcIdx, dstT, start, inPt, outPt, end) {
                var arrD = TL[dstT] || (TL[dstT] = []);
                arrD.push({ name: 'MASCARA', start: start, end: end, inPoint: inPt, outPoint: outPt,
                            mediaDur: outPt });
                return { ok: true, idx: arrD.length - 1, res: 'OK_TEST', audio: 'cap' };
            };
            GRA._ipdPlusHeredarMotion = async function () { return true; };
            GRA._ipdPlusLlegirMotion = async function () { return { position: [0, 0], scale: 100 }; };
        }

        try {
            // ── B1. Rang de l'ÍTEM d'escaleta ─────────────────────────────
            MARKERS = [
                { time: 10, comments: '01f - PG INTRO' },
                { time: 40, comments: '02dp - DONAPAS' },
                { time: 70, comments: '03 - CRÒNICA' },
                { time: 55, comments: 'sense prefix numeric' }
            ];
            var r1 = await MAPA._itemRangeAt(25);
            ok('#199 _itemRangeAt: cabezal a la intro → del marcador 01f al SEGÜENT estructural (02dp)',
                !!r1 && Math.abs(r1.a - 10) < 1e-6 && Math.abs(r1.b - 40) < 1e-6 && r1.num === '01f',
                JSON.stringify(r1));
            ok('#199 _itemRangeAt: el comentari sense "NN -" NO és cap marcador estructural',
                !!r1 && r1.b === 40);
            var r2 = await MAPA._itemRangeAt(5);
            ok('#199 _itemRangeAt: cabezal abans del primer marcador → null (no inventa rang)', r2 === null);
            OUT = 100;
            var r3 = await MAPA._itemRangeAt(75);
            ok('#199 _itemRangeAt: últim ítem sense marcador següent → corxet OUT',
                !!r3 && Math.abs(r3.a - 70) < 1e-6 && Math.abs(r3.b - 100) < 1e-6, JSON.stringify(r3));
            MARKERS = []; OUT = 0;
            ok('#199 _itemRangeAt: sense marcadors estructurals → null',
                (await MAPA._itemRangeAt(25)) === null);

            // ── B1b. Sub-ítems de la INTRO (cas viu 2026-10-28) ───────────
            // Seqüència real: "01i - intro" → sub-ítems 01p21…01p24 → "01 - ELS VEÏNS".
            // El tall ha de ser INTRO→01 (rang sencer de l'ítem), no 01p22→01p23.
            MARKERS = [
                { time: 0, comments: '01i - intro' },
                { time: 1.4, comments: '01p21 - P2 foto FAÇANA esvoranc' },
                { time: 5.88, comments: '01p22 - P2 PAS 1 GOOGLE tots SANT GERVASI ESVORANC' },
                { time: 11.08, comments: '01p23 - P2 PAS 2 GOOGLE ja han tornat SANT GERVASI ESVORANC' },
                { time: 16.24, comments: '01p24 - P2 PAS 3 GOOGLE aqta set + pendents SANT GERVASI ESVORANC' },
                { time: 31.08, comments: "01 - ELS VEÏNS DE L'ESVORANC DE SANT GERVASI" }
            ];
            var r4 = await MAPA._itemRangeAt(6.5);
            ok('#202 _itemRangeAt: cabezal en un SUB-ÍTEM (01p22) → del marcador de LÍNIA (01i) al SEGÜENT de línia (01)',
                !!r4 && Math.abs(r4.a - 0) < 1e-6 && Math.abs(r4.b - 31.08) < 1e-6 && r4.num === '01i',
                JSON.stringify(r4));
            var r5 = await MAPA._itemRangeAt(20);
            ok('#202 _itemRangeAt: un altre sub-ítem (01p24) → MATEIX rang d\'intro (no 01p24→01p23)',
                !!r5 && Math.abs(r5.a - 0) < 1e-6 && Math.abs(r5.b - 31.08) < 1e-6, JSON.stringify(r5));
            MARKERS = [
                { time: 0, comments: '01p22 - P2 PAS 1' },
                { time: 5, comments: '01p23 - P2 PAS 2' }
            ];
            var r6 = await MAPA._itemRangeAt(1);
            ok('#202 _itemRangeAt: sense cap marcador de LÍNIA → cau a qualsevol número (no es queda sense rang)',
                !!r6 && Math.abs(r6.a - 0) < 1e-6 && Math.abs(r6.b - 5) < 1e-6, JSON.stringify(r6));

            // ── B1c. El grafisme va al MARCADOR del seu ítem (#203) ───────
            // Cas viu: fitxer «app google tots sant gervasi esvoranc.mov» i escaleta
            // amb la intro partida en sub-ítems. La coincidència no és exacta (B/V,
            // paraules de més, orde distint): ha de trobar-la igualment.
            MARKERS = [
                { time: 0, comments: '01i - intro' },
                { time: 5.88, comments: '01p22 - P2 PAS 1 GOOGLE tots SANT GERVASI ESVORANC' },
                { time: 31.08, comments: "01 - ELS VEÏNS DE L'ESVORANC DE SANT GERVASI" },
                { time: 60, comments: '02dp - DONAPAS' }
            ];
            var sc1 = MAPA._scoreNombre('app google tots sant gervasi esvoranc.mov',
                'P2 PAS 1 GOOGLE tots SANT GERVASI ESBORANC');
            ok('#203 _scoreNombre: B/V, accents i paraules de més → coincidència ALTA (> 0,7)',
                sc1 > 0.7, 'score=' + sc1.toFixed(3));
            var sc2 = MAPA._scoreNombre('app google tots sant gervasi esvoranc.mov', 'DONAPAS');
            ok('#203 _scoreNombre: noms sense relació → coincidència BAIXA (< 0,4)',
                sc2 < 0.4, 'score=' + sc2.toFixed(3));
            ok('#203 _scoreNombre: el mateix nom → 1 (contenció completa)',
                MAPA._scoreNombre('02dp - DONAPAS', 'DONAPAS') === 1);
            var an1 = await MAPA._anchorMarker(
                [{ name: 'app google tots sant gervasi esvoranc.mov', full: 'X' }], 20);
            ok('#203 _anchorMarker: coincidència amb un SUB-ÍTEM → àncora a l\'INICI de l\'ÍTEM (01i)',
                !!an1 && Math.abs(an1.time - 0) < 1e-6 && an1.num === '01i' && an1.score > 0.7,
                JSON.stringify(an1));
            var an2 = await MAPA._anchorMarker(
                [{ name: "els veins de l'esboranc de sant gervasi.mov", full: 'X' }], 5);
            ok('#203 _anchorMarker: coincidència amb la LÍNIA → àncora al TC d\'eixa línia',
                !!an2 && Math.abs(an2.time - 31.08) < 1e-6 && an2.num === '01',
                JSON.stringify(an2));
            var an3 = await MAPA._anchorMarker([{ name: 'logo corporatiu.mov', full: 'X' }], 20);
            ok('#203 _anchorMarker: cap coincidència → null (la paleta manté el cabezal de sempre)',
                an3 === null, JSON.stringify(an3));
            var an4 = await MAPA._anchorMarker([{ name: '02dp donapas.mov', full: 'X' }], 20);
            ok('#203 _anchorMarker: el desempat no depén del cabezal si el nom és clar',
                !!an4 && Math.abs(an4.time - 60) < 1e-6, JSON.stringify(an4));
            MARKERS = []; OUT = 0;

            // ── B2. Cortar i pujar el troç de MÀSCARA ──────────────────────
            async function scen(v2, v3, a, b) {
                setTrack(2, v2); setTrack(3, v3);
                var res = await MAPA._mascaraAParking({ a: a, b: b }, 2, 3);
                return { res: res, v2: segs(2), v3: segs(3) };
            }

            // (1) Màscara que cobrix tot el bloc → es queda el davant i la coa.
            var s1 = await scen([{ start: 0, end: 100 }], [], 10, 40);
            ok('#199 màscara que cobrix el bloc: el troç de l\'ítem PUJA a V3',
                s1.res.ok === true && s1.v3.length === 1 &&
                Math.abs(s1.v3[0][0] - 10) < 0.02 && Math.abs(s1.v3[0][1] - 40) < 0.02,
                JSON.stringify(s1));
            ok('#199 màscara que cobrix el bloc: V2 es queda el davant [0→10] i la coa [40→100]',
                s1.v2.length === 2 &&
                Math.abs(s1.v2[0][0]) < 0.02 && Math.abs(s1.v2[0][1] - 10) < 0.02 &&
                Math.abs(s1.v2[1][0] - 40) < 0.02 && Math.abs(s1.v2[1][1] - 100) < 0.02,
                JSON.stringify(s1.v2));
            ok('#199 màscara que cobrix el bloc: el FORAT [10→40] de V2 queda lliure per al grafisme',
                !solapa(2, 10, 40));

            // (2) Màscara que comença DINS del rang → només coa a V2.
            var s2 = await scen([{ start: 20, end: 60 }], [], 10, 40);
            ok('#199 màscara que comença dins: V2 es queda només la coa [40→60]',
                s2.res.ok === true && s2.v2.length === 1 &&
                Math.abs(s2.v2[0][0] - 40) < 0.02 && Math.abs(s2.v2[0][1] - 60) < 0.02,
                JSON.stringify(s2));
            ok('#199 màscara que comença dins: V3 rep [20→40] i el forat no es toca',
                s2.v3.length === 1 && Math.abs(s2.v3[0][0] - 20) < 0.02 && !solapa(2, 10, 40),
                JSON.stringify(s2.v3));

            // (3) Màscara sencera DINS del rang → V2 queda buida.
            var s3 = await scen([{ start: 15, end: 35 }], [], 10, 40);
            ok('#199 màscara dins del rang: s\'elimina de V2 (el grafisme ocupa el forat)',
                s3.res.ok === true && s3.v2.length === 0 && s3.v3.length === 1 &&
                Math.abs(s3.v3[0][0] - 15) < 0.02 && Math.abs(s3.v3[0][1] - 35) < 0.02,
                JSON.stringify(s3));

            // (4) La pista de dalt OCUPADA → no es toca res.
            var s4 = await scen([{ start: 0, end: 100 }], [{ start: 5, end: 20, name: 'GRAF' }], 10, 40);
            ok('#199 V3 ocupada a l\'ítem → es rebutja (DESTI_OCUPAT) i V2 queda INTACTA',
                s4.res.ok === false && s4.res.err === 'DESTI_OCUPAT' &&
                s4.v2.length === 1 && Math.abs(s4.v2[0][0]) < 0.02 && Math.abs(s4.v2[0][1] - 100) < 0.02,
                JSON.stringify(s4));

            // (5) Sense màscara a l'ítem → no s'inventa res.
            var s5 = await scen([], [], 10, 40);
            ok('#199 sense màscara a l\'ítem → CAP_MASCARA (el flux ho avisa i col·loca com sempre)',
                s5.res.ok === false && s5.res.err === 'CAP_MASCARA', JSON.stringify(s5.res));

            // (6) El tall ha d'arribar EXACTE al marcador (#203, 3a volta): es simula
            //     un insert que es queda 1 frame curt (0,04 s) i s'ha de corregir.
            var ponerExacte = GRA._ipdPlusPoner;
            GRA._ipdPlusPoner = async function (srcT, srcIdx, dstT, start, inPt, outPt, end) {
                var arrD = TL[dstT] || (TL[dstT] = []);
                arrD.push({ name: 'MASCARA', start: start, end: end - 0.04, inPoint: inPt,
                            outPoint: outPt, mediaDur: outPt });
                return { ok: true, idx: arrD.length - 1, res: 'OK_TEST', audio: 'cap' };
            };
            var s6 = await scen([{ start: 0, end: 100 }], [], 10, 40);
            GRA._ipdPlusPoner = ponerExacte;
            ok('#203 el troç de V3 acaba EXACTE al marcador encara que l\'insert es quede 1 frame curt',
                s6.res.ok === true && s6.v3.length === 1 && Math.abs(s6.v3[0][1] - 40) < 0.02,
                JSON.stringify(s6.v3));
            ok('#203 la coa de V2 comença al marcador (no al final curt del troç)',
                s6.v2.length === 2 && Math.abs(s6.v2[1][0] - 40) < 0.02,
                JSON.stringify(s6.v2));

            // ── B3. Connexió amb la decisió de la paleta ───────────────────
            var src = String(MAPA._placeClips);
            ok('#199 _placeClips: la MÀSCARA es mou ABANS de col·locar el grafisme',
                src.indexOf('_mascaraAParking') !== -1 &&
                src.indexOf('_mascaraAParking') < src.indexOf('insertNoAudio'),
                'ordre màscara/insert');
            ok('#199 _placeClips: amb zona grisa el grafisme va a la pista de la MÀSCARA',
                /tGraf\s*=\s*TRACK_MASCARA/.test(src) &&
                /_mascaraAParking\(rng, TRACK_MASCARA, TRACK_GRAF\)/.test(src));
            ok('#202 _placeClips: el moviment de la màscara NO està dins de la branca de la zona grisa',
                !/if \(zona && zona\.hasGrey\) \{\s*var rng/.test(src) &&
                /\} else \{\s*var mov = await this\._mascaraAParking\(rng, TRACK_MASCARA, TRACK_GRAF\);/.test(src),
                'la pista es decidix només per si s\'ha pogut moure la màscara');
            ok('#202 _placeClips: abans de moure la màscara neteja les restes del bloc a V2 i V3',
                /_cleanupTrack\(TRACK_MASCARA, gNums0\)/.test(src) &&
                /_cleanupTrack\(TRACK_GRAF, gNums0\)/.test(src) &&
                src.indexOf('_cleanupTrack(TRACK_GRAF, gNums0)') < src.indexOf('_mascaraAParking'));
            ok('#199 _freezeGrafEnd accepta la pista del grafisme (el congelat no cau sempre a V3)',
                /var tG = \(trackIdx != null\) \? trackIdx : TRACK_GRAF;/.test(String(MAPA._freezeGrafEnd)) &&
                /_freezeGrafEnd\(lastItem\.name, grafEnd, endLimit, tGraf\)/.test(src));
            ok('#199 _placeClips: el final del grafisme s\'acota al de l\'ÍTEM (no ha de pisar la màscara reposta)',
                /tGraf === TRACK_MASCARA && rngGris && rngGris\.b != null/.test(src) &&
                /endLimit = rngGris\.b;/.test(src) && /space = Math\.max\(0, endLimit - refSec\);/.test(src));

            var savedDetect = GZ.detect;
            GZ.detect = async function (p) {
                return { ok: true, hasGrey: String(p).indexOf('ATUR') !== -1, cov: 99, cached: false };
            };
            var z1 = await MAPA._zonaGris([{ name: 'ATUR EPA CATALUNYA.mov' }],
                { picked: [{ name: 'ATUR EPA CATALUNYA.mov', full: '\\\\nas\\27 OCTUBRE\\ATUR EPA CATALUNYA.mov' }] });
            ok('#199 _zonaGris: mesura el FITXER original (ruta del picked) → AMB zona grisa',
                !!z1 && z1.hasGrey === true, JSON.stringify(z1));
            var z2 = await MAPA._zonaGris([{ name: 'ALTRE GRAFISME.mov' }],
                { picked: [{ name: 'ALTRE GRAFISME.mov', full: '\\\\nas\\27 OCTUBRE\\ALTRE GRAFISME.mov' }] });
            ok('#199 _zonaGris: sense zona grisa → hasGrey=false (ara només INFO al log)',
                !!z2 && z2.hasGrey === false, JSON.stringify(z2));
            var z3 = await MAPA._zonaGris([{ name: 'RAR.mov' }], { picked: [] });
            ok('#199 _zonaGris: si no sap la ruta original → null (no inventa cap veredicte)', z3 === null);
            GZ.detect = savedDetect;

            // ── C. PALETA: CABEZAL + CARPETA DEL DIA (2026-11-03 · #233) ──────
            // (1) El flux manual ja NO ancora el grafisme a cap marcador: mana el cabezal.
            var srcFlow = String(MAPA._flow);
            ok('#233 _flow: el grafisme entra al CABEZAL (ja no crida _anchorMarker)',
                !/_anchorMarker\(/.test(srcFlow) && /_placeClips\(items, refSec/.test(srcFlow),
                'crida=' + /_anchorMarker\(/.test(srcFlow));
            ok('#233 _flow i runFromMarkers resolen la carpeta amb _dayFolder',
                /_dayFolder\(dateDir\)/.test(srcFlow) &&
                /_dayFolder\(await this\._resolveDateDir\(\)\)/.test(String(MAPA.runFromMarkers)));

            var vars1 = MAPA._dayFolderNames(1, 11);
            ok('#233 _dayFolderNames(1,11): «1 NOVEMBRE», «01 NOVEMBRE» i les dos amb «DE»',
                vars1.indexOf('1 NOVEMBRE') !== -1 && vars1.indexOf('01 NOVEMBRE') !== -1 &&
                vars1.indexOf('1 DE NOVEMBRE') !== -1 && vars1.indexOf('01 DE NOVEMBRE') !== -1,
                JSON.stringify(vars1));
            ok('#233 _dayFolderNames: dies de dos dígits sense duplicats',
                JSON.stringify(MAPA._dayFolderNames(15, 11)) ===
                JSON.stringify(['15 NOVEMBRE', '15 DE NOVEMBRE']),
                JSON.stringify(MAPA._dayFolderNames(15, 11)));
            ok('#233 _dayFolderNames: mes fora de rang → [] (no inventa noms)',
                MAPA._dayFolderNames(3, 13).length === 0 && MAPA._dayFolderNames(0, 11).length === 0);

            var NOMS = ['28 OCTUBRE', '01 NOVEMBRE', '2 NOVEMBRE', 'GRAF.lnk'];
            ok('#233 _pickDayFolder: dia 1 → «01 NOVEMBRE» (al disc el zero davant)',
                MAPA._pickDayFolder(NOMS, 1, 11) === '01 NOVEMBRE', MAPA._pickDayFolder(NOMS, 1, 11));
            ok('#233 _pickDayFolder: dia 2 → «2 NOVEMBRE» (i no el 28 d\'octubre)',
                MAPA._pickDayFolder(NOMS, 2, 11) === '2 NOVEMBRE', MAPA._pickDayFolder(NOMS, 2, 11));
            ok('#233 _pickDayFolder: un dia sense carpeta → null (no agafa el veí)',
                MAPA._pickDayFolder(NOMS, 5, 11) === null, MAPA._pickDayFolder(NOMS, 5, 11));
            ok('#233 _pickDayFolder: «3 NOVEMBRE 2026» també val (any al nom)',
                MAPA._pickDayFolder(['3 NOVEMBRE 2026'], 3, 11) === '3 NOVEMBRE 2026');
            ok('#233 _pickDayFolder: el número sol no basta si el MES no hi és',
                MAPA._pickDayFolder(['3 DESEMBRE'], 3, 11) === null && MAPA._pickDayFolder([], 3, 11) === null);

            var T3 = new Date(2026, 10, 3, 12, 0, 0).getTime();
            var T2 = new Date(2026, 10, 2, 9, 0, 0).getTime();
            ok('#233 _pickFolderByCreated: tria la carpeta creada el dia de treball',
                MAPA._pickFolderByCreated([{ name: 'A', created: T2 }, { name: 'B', created: T3 }], '2026_11_03') === 'B');
            ok('#233 _pickFolderByCreated: sense creació (UNC) val la modificació',
                MAPA._pickFolderByCreated([{ name: 'A', created: 0, modified: T3 }], '2026_11_03') === 'A');
            ok('#233 _pickFolderByCreated: cap carpeta d\'eixe dia → null',
                MAPA._pickFolderByCreated([{ name: 'A', created: T2 }], '2026_11_03') === null &&
                MAPA._pickFolderByCreated([{ name: 'A', created: T3 }], 'avui') === null);

            // (2) _folderExists preguntava a `IO.exists` (new File → només FITXERS) i deia
            //     «false» per a qualsevol carpeta. Amb un CEP SIMULAT es comprova el nou camí.
            var savedCep = window.cep;
            var CARPETES = {
                '\\\\nas\\ZZZ_GRAFISME': ['28 OCTUBRE', '01 NOVEMBRE', '2 NOVEMBRE', 'GRAF.lnk'],
                '\\\\nas\\ZZZ_GRAFISME\\01 NOVEMBRE': ['a.mov'],
                '\\\\nas\\ZZZ_GRAFISME\\2 NOVEMBRE': ['b.mov']
            };
            window.cep = { fs: {
                readdir: function (p) {
                    var k = String(p);
                    return CARPETES[k] ? { err: 0, data: CARPETES[k] } : { err: 13, data: [] };
                },
                stat: function () { return { err: 0, data: { creationTime: 0, mtime: 0 } }; }
            } };
            UI.Config.get = function () { return { rutas: { grafismos: '\\\\nas\\ZZZ_GRAFISME' } }; };
            ok('#233 _folderExists: una CARPETA existent → true (abans deia false)',
                (await MAPA._folderExists('\\\\nas\\ZZZ_GRAFISME')) === true);
            ok('#233 _folderExists: ruta inexistent → false',
                (await MAPA._folderExists('\\\\nas\\NO_HI_ES')) === false);
            var df1 = await MAPA._dayFolder('2026_11_01');
            ok('#233 _dayFolder: 2026_11_01 → «01 NOVEMBRE» (el nom canònic «1 NOVEMBRE» no hi és)',
                String(df1).toUpperCase().indexOf('01 NOVEMBRE') !== -1, String(df1));
            var df2 = await MAPA._dayFolder('2026_11_02');
            ok('#233 _dayFolder: 2026_11_02 → «2 NOVEMBRE» (cas normal, nom canònic)',
                String(df2).toUpperCase().indexOf('2 NOVEMBRE') !== -1, String(df2));
            var df3 = await MAPA._dayFolder('2026_10_28');
            ok('#233 _dayFolder: un dia sense carpeta → null, sense petar',
                df3 === null, String(df3));
            var df4 = await MAPA._dayFolder('sense-data');
            ok('#233 _dayFolder: data de treball il·legible → null',
                df4 === null, String(df4));
            window.cep = savedCep;
            UI.Config.get = function () {
                return { tracks: { video: { mp4: 1, mascara: 2, graficos: 3, graf: 3, temattitol: 6 } },
                         rutas: { destinoBase: 'C:/TMP/NAS/' } };
            };
        } catch (e199) {
            ok('#199 la prova no ha llançat cap excepció', false, e199 && (e199.message + ' | ' + e199.stack));
        } finally {
            UI.Utils.callJSX = savedCallJSX;
            if (savedConfigGet === undefined) { delete UI.Config.get; } else { UI.Config.get = savedConfigGet; }
            if (GRA) {
                if (savedPoner) GRA._ipdPlusPoner = savedPoner;
                if (savedHeredar) GRA._ipdPlusHeredarMotion = savedHeredar;
                if (savedLlegir) GRA._ipdPlusLlegirMotion = savedLlegir;
            }
        }
    };
})();
