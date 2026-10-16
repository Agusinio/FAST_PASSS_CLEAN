/* ============================================================================
 * PROVA #172 (2026-10-16) · PORTADA — captura del FRAME CORRECTE
 * ----------------------------------------------------------------------------
 * SIMPTOMA (report d'usuari): la portada (el PNG de la capçalera) s'exportava amb
 * el frame d'un altre moment de la timeline (no el del cabezal) i l'exportació
 * trigava molt sense cap senyal al botó.
 *
 * CAUSA ARREL (dues):
 *  1) BRETXA AL PONT (jsx/main.jsx): el flux cridava `Timeline.outPoint(...)`, que NO
 *     existeix al pont (l'àtom correcte és `Timeline.out(v)` → `FASTPASS.Timeline.outPoint`
 *     → seq.setOutPoint) → `EvalScript error` que `callJSX` empassa com 'ERR:...' i que
 *     ningú mirava → l'Out point NO s'ampliava i `Render.snapshot` →
 *     `Render.exportFrameQE(tcSec,path)` → `qeSeq.exportFramePNG(tc,path)` rebia un TC
 *     FORA del rang de la seqüència → QE exportava el frame que volia (equivocat) enlloc
 *     de fallar. La mateixa bretxa amagava el rang d'exportació (`Render.exportRange`).
 *  2) ÀREA DE TREBALL: encara amb l'Out ampliat, l'àrea de treball (el rang amb què
 *     exporta QE si està activada) només se sincronitza amb IN/OUT cridant
 *     `Timeline.zoomToSelection()`.
 *
 * Aquesta prova fa dos treballs:
 *  A) CONTRACTE DEL PONT (estàtic, amb els fitxers REALS llegits per fetch de file:///):
 *     per a cada `Espai.metode(` escrit DINS d'una crida `callJSX(...)` a tot
 *     al `js/` (tots els arxius `.js`), comprova que el mètode estiga declarat dins del bloc
 *     `$.global.Espai` de `jsx/main.jsx`. És la guarda que hauria caçat el #172 el
 *     primer dia (i que ha destapat `Render.exportRange`).
 *  B) MOTOR REAL (`Chyrons._capturePng`, ja al bundle) amb un MODEL de la seqüència al
 *     pont: amb l'Out curt ha de cridar `Timeline.out` (NO `outPoint`), ha de deixar
 *     l'Out cobrint el TC de captura i ha de RESTAURAR-lo; amb Out absent (0) NO pot
 *     fixar-lo a 0. El TC que rep `Render.snapshot` ha de ser EXACTAMENT el demanat
 *     (és el frame que s'exporta) i la via ha de ser la QE (`exportFramePNG`).
 *     NOTA: `flow_render.js` (l'altre camí del #172, la portada) NO s'inclou al bundle
 *     perquè arrossega mig projecte; el seu costat es valida estàticament amb els
 *     àtoms EXACTES i el mecanisme compartit (`_capturePng`) en viu.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '19-portada';

        var REPO = window.__REPO || '';
        var FILES = window.__TEXT_FILES || [];

        /** noComments: treu comentaris (bloc i línia) per no confondre doc amb codi. */
        function noComments(src) {
            return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        }

        /** jsxArgs: arguments de cada `callJSX(...)`, amb parèntesis/strings balancejats. */
        function jsxArgs(src) {
            var res = [], idx = 0, tag = 'callJSX(';
            while ((idx = src.indexOf(tag, idx)) !== -1) {
                var i = idx + tag.length, d = 1, j = i, q = null, ch;
                while (j < src.length && d > 0) {
                    ch = src.charAt(j);
                    if (q) {
                        if (ch === '\\') { j += 2; continue; }
                        if (ch === q) { q = null; }
                    } else if (ch === '"' || ch === "'" || ch === '`') { q = ch; }
                    else if (ch === '(') { d++; }
                    else if (ch === ')') { d--; if (d === 0) { break; } }
                    j++;
                }
                res.push(src.slice(i, j));
                idx = i;
            }
            return res;
        }

        /** parseBridge: taula del PONT { Espai: { metode: 1 } } llegida de jsx/main.jsx. */
        function parseBridge(src) {
            var out = {}, rx = /^\$\.global\.(\w+)\s*=\s*\{([\s\S]*?)^\};/gm, m;
            while ((m = rx.exec(src)) !== null) {
                var set = {}, rxm = /^\s*"?([A-Za-z_$][\w$]*)"?\s*:/gm, mm;
                while ((mm = rxm.exec(m[2])) !== null) { set[mm[1]] = 1; }
                out[m[1]] = set;
            }
            return out;
        }

        /** readRepo: llig un fitxer del repo (file:/// + ruta relativa). */
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            var t = await r.text();
            if (!t) { throw new Error('buit: ' + rel); }
            return t;
        }

        var SRCS = {};
        var savedCallJSX = UI.Utils.callJSX;
        var savedCep = window.cep;
        try {
            ok('#172 harness amb accés als fitxers del repo (--allow-file-access-from-files)',
                !!(REPO && FILES.length), 'REPO=' + (REPO || '(buit)') + ' · FILES=' + FILES.length);
            if (!REPO || !FILES.length) { return; }

            // Lectura EN PARALL EL dels fitxers del repo (fetch de file:///): són locals i
            // així la prova no consumeix el pressupost de temps del harness.
            var resFetch = await Promise.all(FILES.map(function (rel) {
                return readRepo(rel).then(
                    function (t) { return { rel: rel, txt: t }; },
                    function () { return { rel: rel, txt: null }; }
                );
            }));
            resFetch.forEach(function (o) { SRCS[o.rel] = o.txt; });
            var reads = resFetch.filter(function (o) { return !!o.txt; }).length;
            var noLlegits = FILES.filter(function (f) { return !SRCS[f]; });
            ok('#172 lectures del repo (' + reads + '/' + FILES.length + ')',
                noLlegits.length === 0, 'no llegits: ' + noLlegits.slice(0, 8).join(', '));

            // ── A) CONTRACTE DEL PONT (js/**/*.js → jsx/main.jsx) ────────────────
            var BRIDGE = parseBridge(SRCS['jsx/main.jsx'] || '');
            var espais = Object.keys(BRIDGE);
            ok('#172 taula del pont llegida de jsx/main.jsx (' + espais.length + ' espais)',
                espais.length >= 10, espais.join(', '));
            var alt = espais.join('|');
            var missing = [], uses = 0;
            for (var f in SRCS) {
                if (!SRCS[f] || !/^js\//.test(f)) { continue; }
                var args = jsxArgs(noComments(SRCS[f]));
                for (var a = 0; a < args.length; a++) {
                    // El prefix `[^\w$.]` evita caure en `FASTPASS.Clips.x()` (accés directe
                    // al mòdul JSX: NO passa pel pont i no necessita àtom).
                    var rxUse = new RegExp('(^|[^\\w$.])(' + alt + ')\\.(\\w+)\\s*\\(', 'g'), m2;
                    while ((m2 = rxUse.exec(args[a])) !== null) {
                        uses++;
                        if (!(BRIDGE[m2[2]] && BRIDGE[m2[2]][m2[3]])) {
                            missing.push(f + ' :: ' + m2[2] + '.' + m2[3]);
                        }
                    }
                }
            }
            var uniq = missing.filter(function (v, j) { return missing.indexOf(v) === j; });
            ok('#172 cap crida callJSX a un mètode INEXISTENT del pont (' + uses + ' crides revisades)',
                uniq.length === 0, uniq.join(' | '));
            ok('#172 el pont exposa els àtoms que el #172 necessitava (`Timeline.out` + `Render.exportRange`)',
                !!(BRIDGE.Timeline && BRIDGE.Timeline.out) && !!(BRIDGE.Render && BRIDGE.Render.exportRange) &&
                !(BRIDGE.Timeline && (BRIDGE.Timeline.inPoint || BRIDGE.Timeline.outPoint)),
                'Timeline.out=' + !!(BRIDGE.Timeline && BRIDGE.Timeline.out) +
                ' Render.exportRange=' + !!(BRIDGE.Render && BRIDGE.Render.exportRange));

            // ── B) BRETXES CONCRETES DEL #172 (àtoms EXACTES als fluxos) ────────
            var fr = noComments(SRCS['js/workflows/flow_render.js'] || '');
            var ch = noComments(SRCS['js/workflows/flow_chyrons.js'] || '');
            var gr = noComments(SRCS['js/workflows/flow_graphics.js'] || '');
            var cu = noComments(SRCS['js/workflows/flow_cut.js'] || '');
            ok('#172 flow_render: l\'Out s\'amplia amb `Timeline.out(${needOut})` i MAI amb `Timeline.outPoint`',
                /Timeline\.out\(\$\{needOut\}\)/.test(fr) && !/Timeline\.(in|out)Point\(/.test(fr),
                'out=' + /Timeline\.out\(\$\{needOut\}\)/.test(fr));
            ok('#172 flow_render: llig IN/OUT originals, SINCRONITZA l\'àrea de treball (zoomToSelection) i es fa servir `Render.snapshot`',
                /Timeline\.getIn\(\)/.test(fr) && /Timeline\.getOut\(\)/.test(fr) &&
                /Timeline\.zoomToSelection\(\)/.test(fr) && /Render\.snapshot\(/.test(fr));
            ok('#172 flow_render: l\'Out original es RESTAURA (out + range + zoomToSelection)',
                /Timeline\.out\(\$\{outRestore\}\)/.test(fr) && /Timeline\.range\(\$\{in0\}, \$\{outRestore\}\)/.test(fr));
            ok('#172 flow_render: guarda de RANG (Out que no cobreix el frame) i TC de captura verificat',
                /isFinite\(outCap\) && outCap > 0 && outCap < tcCap \+ FRAME_TOL/.test(fr) &&
                /await seekCti\(tcCap/.test(fr));
            ok('#172 flow_render: un PNG VELL del mateix nom s\'esborra abans de capturar (frame d\'un altre moment)',
                /window\.cep\.fs\.stat\(destExt\)/.test(fr) && /deleteFile\(destExt\)/.test(fr));
            ok('#172 cap flux crida `Timeline.inPoint`/`Timeline.outPoint` (inexistents al pont)',
                !/Timeline\.(in|out)Point\(/.test(fr + ch + gr + cu));
            ok('#172 flow_chyrons: el congelat amplia amb `Timeline.out` i MAI deixa l\'Out a 0',
                /Timeline\.out\(\$\{\(tc \+ 2\)\.toFixed\(3\)\}\)/.test(ch) &&
                /outRestore = \(isFinite\(out0\) && out0 > 0\) \? out0 : 0/.test(ch) &&
                /outRestore !== null && outRestore > 0/.test(ch) && /outRestore === 0/.test(ch));

            // ── C) ESTAT OCUPAT DEL BOTÓ + CACHE-BUST ───────────────────────────
            var mj = noComments(SRCS['js/main.js'] || '');
            var css = String(SRCS['style.css'] || '');
            ok('#172 main.js: `markBtnBusy`/`clearBtnBusy` existeixen i embolcallen el botó de portada',
                /function markBtnBusy\(/.test(mj) && /function clearBtnBusy\(/.test(mj) &&
                /markBtnBusy\(btnRenderPortada/.test(mj) && /clearBtnBusy\(btnRenderPortada\)/.test(mj));
            ok('#172 style.css: `.btn-busy` + `@keyframes fpBtnBusyPulse`',
                /button\.btn-busy/.test(css) && /@keyframes fpBtnBusyPulse/.test(css));
            var html = String(SRCS['index.html'] || '');
            var verOf = function (rel) {
                var m3 = new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=(\\d+)').exec(html);
                return m3 ? parseInt(m3[1], 10) : -1;
            };
            var vR = verOf('js/workflows/flow_render.js'), vM = verOf('js/main.js'), vS = verOf('style.css');
            ok('#172 index.html: cache-bust del #172 (flow_render ' + vR + ', main ' + vM + ', style ' + vS + ')',
                vR >= 33 && vM >= 82 && vS >= 61);

            // ── D) MOTOR REAL (`Chyrons._capturePng`) amb un MODEL de seqüència ──
            var CHY = UI.Workflows.Chyrons;
            ok('#172 motor: `Chyrons._capturePng` carregat (flow_chyrons real al bundle)',
                !!(CHY && typeof CHY._capturePng === 'function' && typeof CHY._waitFile === 'function'));
            if (CHY && typeof CHY._capturePng === 'function') {
                function modelBridge() {
                    var BR = {
                        'Timeline.getOut': function () { return String(MODEL.out); },
                        'Timeline.getIn': function () { return String(MODEL.in); },
                        'Timeline.get': function () { return String(MODEL.cti); },
                        'Timeline.set': function (v) { MODEL.cti = Number(v); return 'OK'; },
                        'Timeline.out': function (v) {
                            MODEL.out = Number(v);
                            if (MODEL.out > MODEL.maxOut) { MODEL.maxOut = MODEL.out; }
                            return 'OK';
                        },
                        'Timeline.range': function (i2, o2) { MODEL.in = Number(i2); MODEL.out = Number(o2); return 'OK'; },
                        'Timeline.zoomToSelection': function () { MODEL.zooms++; return 'OK'; },
                        'Render.snapshot': function () { MODEL.qe++; return 'OK'; },
                        // Segona via del mòdul: al DOM actual NO existeix (mateix error que el log del 2026-10-06).
                        'Render.frame': function () { return 'ERR: seq.exportFrame is not a function'; }
                    };
                    // Pont de mentida: NOMÉS els àtoms REALS (jsx/main.jsx). Qualsevol altre
                    // retorna l'error que Premiere dóna per un global inexistent — així una
                    // bretxa com la del #172 es veu com a 'ERR:...' i no com un èxit.
                    UI.Utils.callJSX = async function (expr) {
                        var s = String(expr).split('\n')[0].trim();
                        CALLS.push(s);
                        var m4 = /^([A-Za-z_$][\w$]*)\.(\w+)\(/.exec(s);
                        if (!m4) { return 'OK'; }
                        var key = m4[1] + '.' + m4[2];
                        if (!BR[key]) { return 'ERR:' + key + ' is not a function'; }
                        var av = [], rxA = /'((?:\\.|[^'])*)'|(-?\d+(?:\.\d+)?)/g, ma;
                        while ((ma = rxA.exec(s.slice(key.length + 1))) !== null) {
                            av.push(ma[2] !== undefined ? Number(ma[2]) : window.__unesc(ma[1]));
                        }
                        return BR[key].apply(null, av);
                    };
                }
                var MODEL = null, CALLS = null;
                modelBridge();
                // `cep.fs.readFile`: el PNG "apareix" quan QE (`Render.snapshot`) ha estat cridat.
                window.cep = {
                    fs: {
                        readFile: function () { return (MODEL && MODEL.qe > 0) ? { err: 0, data: new Array(65).join('x') } : { err: 1 }; },
                        stat: function () { return { err: 1 }; }
                    }
                };
                function runModel(scenari, out0, tc) {
                    MODEL = { out: out0, in: 0, cti: tc, maxOut: out0, zooms: 0, qe: 0 };
                    CALLS = [];
                    return CHY._capturePng('C:/TMP/fp_portada_' + scenari, tc);
                }
                var TC = 40.0, res1 = null, res2 = null;
                var callsOut = function () {
                    return CALLS.filter(function (c) { return /^Timeline\.out\(/.test(c); });
                };
                var snapTC = function () {
                    for (var k = 0; k < CALLS.length; k++) {
                        var m5 = /^Render\.snapshot\('[^']*',\s*(-?[\d.]+)\)/.exec(CALLS[k]);
                        if (m5) { return Number(m5[1]); }
                    }
                    return NaN;
                };

                // Escenari 1: la seqüència TÉ Out, però és ABANS del frame de la portada.
                res1 = await runModel('curt', 30.0, TC);
                ok('#172 _capturePng (Out 30 s < TC 40 s): amplia l\'Out amb `Timeline.out` (cap `outPoint`)',
                    callsOut().length >= 1 && MODEL.maxOut >= TC + 1 - 0.001 &&
                    CALLS.filter(function (c) { return /^Timeline\.outPoint\(/.test(c); }).length === 0,
                    'calls=' + callsOut().join(' | ') + ' · maxOut=' + MODEL.maxOut);
                ok('#172 _capturePng: el frame s\'exporta EXACTAMENT al TC demanat (' + TC + ' s) via QE',
                    res1 && res1.ok === true && res1.via === 'QE' && snapTC() === TC,
                    'ok=' + (res1 && res1.ok) + ' via=' + (res1 && res1.via) + ' tc=' + snapTC());
                ok('#172 _capturePng (Out 30 s): RESTAURA l\'Out original (30 s) al final',
                    MODEL.out === 30.0, 'out final=' + MODEL.out);
                ok('#172 _capturePng: cap error de pont empassat (cap crida ha tornat ERR)',
                    CALLS.join(' | ').indexOf('outPoint') === -1);

                // Escenari 2: la seqüència NO tenia Out (0) — el cas que quedava a 0 i deixava
                // el frame fora de rang.
                res2 = await runModel('absent', 0, TC);
                ok('#172 _capturePng (Out ABSENT = 0): amplia l\'Out i NO el torna a fixar a 0',
                    res2 && res2.ok === true && MODEL.out >= TC + 1 - 0.001 && MODEL.maxOut >= TC + 1 - 0.001 &&
                    CALLS.filter(function (c) { return /^Timeline\.out\(0(?:\.0*)?\)$/.test(c); }).length === 0,
                    'out final=' + MODEL.out + ' · maxOut=' + MODEL.maxOut + ' · calls=' + callsOut().join(' | '));
                ok('#172 _capturePng (Out ABSENT = 0): el frame també és el demanat (' + TC + ' s) via QE',
                    res2 && res2.via === 'QE' && snapTC() === TC, 'via=' + (res2 && res2.via) + ' tc=' + snapTC());
            }
        } catch (e172) {
            ok('#172 la prova no ha llançat cap excepció', false, e172 && (e172.message + ' | ' + e172.stack));
        } finally {
            // El pont ha de quedar EXACTAMENT com estava (per a les altres fases).
            UI.Utils.callJSX = savedCallJSX;
            if (savedCep === undefined) { delete window.cep; } else { window.cep = savedCep; }
        }
    };
})();
