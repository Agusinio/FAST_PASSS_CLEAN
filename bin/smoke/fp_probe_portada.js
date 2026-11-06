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
 *
 * (2026-10-21 · BUG #174) PART E — FINESTRA DE CAPTURA DE LA PORTADA:
 *     El PNG de portada sortia fins a 2 s (52 frames a 25 fps) ABANS del frame triat
 *     quan el frame era CAP AL FINAL del clip: `flow_render` movia el FRAME
 *     (`mediaIn = mediaEnd − 2,08`) perquè la còpia temporal tinguera prou material.
 *     Ara el càlcul viu a `js/logic/18_Portada_Window.js` (`PortadaWindow.plan`), és PUR
 *     i MAI mou el frame: s'escurça la CUA de la finestra. La part E prova el cas
 *     reportat (frame a 1,08 s del final → abans 1,00 s = 25 frames de desviació),
 *     l'últim frame del clip, el frame fora del media, el pre-roll del primer frame i
 *     dues guardes ESTÀTIQUES (el flux no pot tornar a moure el frame; el timecode de
 *     QE no pot tornar a ser de 25 fps fixos).
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
            // ── #214 (2026-11-02) · MENTRE OCUPAT, NOMÉS EL RELLOTGE D'ARENA ────
            // L'etiqueta i la icona s'amaguen i el marcatge es restaura SENCER: abans
            // es desava `innerText` (perdia les icones) i l'anella es pintava DAMUNT.
            ok('#214 main.js: `markBtnBusy` desa/restaura `innerHTML` (no `innerText`)',
                /btn\.dataset\.busyHtml = btn\.innerHTML/.test(mj) &&
                /btn\.innerHTML = btn\.dataset\.busyHtml/.test(mj) &&
                !/busyLabel/.test(mj) && !/btn\.innerText = text/.test(mj));
            ok('#214 style.css: ocupat = només el rellotge (text i fills amagats)',
                /button\.btn-busy[^{]*\{[^}]*font-size: 0 !important/.test(css) &&
                /button\.btn-busy > \*\s*\{[^}]*display: none !important/.test(css) &&
                /content: "\\23F3";/.test(css) &&
                /button\.btn-busy\.icon-only/.test(css));

            // ── C1b) #243 / #244 (2026-11-05) · EL BOTÓ DIU LA VERITAT ───────────
            // Dos defectes que es van vore junts en obrir un projecte del NAS
            // (TNC V1, log del 05/11 14:28: el log deia UPDATE i el botó, OBRIR):
            //  · #243: `checkContext` repinta el botó MAIN a mig flux (`updateButton`
            //    → «ACTUAL.») i el `clearBtnBusy` de tancament li tornava a posar
            //    l'etiqueta VELLA («OBRIR», la del moment del clic) → el panell i el
            //    log en desacord, i el clic següent tornava a obrir el projecte.
            //  · #244: `Context.list()` (pont JSX `getOpenNames`) retorna un ARRAY
            //    DE STRINGS; `project_registry.js` llegia `.name` → `_isCompatible
            //    (undefined)` petava DINS del `try` del poll i el cicle moria en
            //    silenci: mai ancorava el projecte (`activeProjectName` null → el
            //    guardià de 15 s desancorava `State.projectDateDir`) i mai habilitava
            //    els botons de flux.
            ok('#243 main.js: `clearBtnBusy` NO trepitja un repintat fet mentres durava la tasca',
                /repainted/.test(mj) && /if \(!repainted\) btn\.innerHTML = btn\.dataset\.busyHtml/.test(mj) &&
                /btn\.dataset\.busyOff === '0' && !repainted/.test(mj));
            var pr = noComments(SRCS['js/core/project_registry.js'] || '');
            ok('#244 project_registry: llig els noms de `Context.list()` siguen STRINGS o objectes (`_nameOf`)',
                /_nameOf: function/.test(pr) && /typeof p === 'string'/.test(pr) &&
                /this\._nameOf\(p\)/.test(pr) && /this\._nameOf\(projects\[0\]\)/.test(pr) &&
                !/_isCompatible\(p\.name\)/.test(pr) && !/projects\[0\]\.name/.test(pr));
            ok('#244 project_registry: `_isCompatible` no pot petar amb un nom buit o no-string',
                /typeof projectName !== 'string' \|\| !projectName/.test(pr));
            var html = String(SRCS['index.html'] || '');
            var verOf = function (rel) {
                var m3 = new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=(\\d+)').exec(html);
                return m3 ? parseInt(m3[1], 10) : -1;
            };
            var vR = verOf('js/workflows/flow_render.js'), vM = verOf('js/main.js'), vS = verOf('style.css');
            ok('#172 index.html: cache-bust del #172 (flow_render ' + vR + ', main ' + vM + ', style ' + vS + ')',
                vR >= 33 && vM >= 82 && vS >= 61);

            // ── C2) LENTITUD DE LA PORTADA (2026-10-21) ─────────────────────────
            // El log del 21/10/2026 14:51:16 va deixar 93,52 s al Promise.all de
            // lectures perquè `Scan.portadas` escanejava el NAS sencer (1.028 fitxers)
            // per una portada que JA és al bin PORTADES. I la captura QE es donava per
            // perduda perquè `waitPng` llegia el PNG amb `cep.fs.readFile` (falla a UNC)
            // i el fallback `seq.exportFrame` no existeix a Premiere.
            var scn = noComments(SRCS['js/logic/Scanner.js'] || '');
            var prj = noComments(SRCS['jsx/modules/3_Project.jsx'] || '');
            var io2 = noComments(SRCS['jsx/modules/2_IO.jsx'] || '');
            var iPort = scn.indexOf('portadas: async function');
            var iFast = scn.indexOf('portadasFromProject(ctx)', iPort);
            var iNas = scn.indexOf('readFolder(pathNAS)', iFast > -1 ? iFast : iPort);
            ok('#175 Scanner: `portadas` consulta el BIN PORTADES ABANS d\'escanejar el NAS',
                /portadasFromProject: async function/.test(scn) &&
                /FASTPASS\.Project\.pngItems\('PORTADES'\)/.test(scn) &&
                iFast !== -1 && iNas !== -1 && iFast < iNas,
                'iPort=' + iPort + ' bin=' + iFast + ' nas=' + iNas);
            ok('#175 Project.pngItems: llig els PNG de PORTADA del projecte (nom + mediaPath + dates)',
                /pngItems: function\(binName\)/.test(prj) && /getMediaPath\(\)/.test(prj) &&
                /PORTADA/.test(prj) && /f\.created/.test(prj));
            ok('#175 IO.fileInfo: exists/size/modified sense llegir el fitxer sencer',
                /fileInfo: function\(path\)/.test(io2) && /f\.exists/.test(io2) && /f\.eof/.test(io2));
            ok('#175 flow_render: `waitPng` es basa en `IO.fileInfo` i ja NO crida `Render.frame`',
                /typeof IO\.fileInfo/.test(fr) && /IO\.fileInfo\(\$\{JSON\.stringify\(target\)\}\)/.test(fr) &&
                !/Render\.frame\(/.test(fr) && /QE-retry/.test(fr),
                'render.frame=' + /Render\.frame\(/.test(fr) + ' retry=' + /QE-retry/.test(fr));
            ok('#175 flow_render: cada lectura del Promise.all té el SEU cronòmetre',
                /tP0/.test(fr) && /tV0/.test(fr) && /tA0/.test(fr) && /Scan\.portades:/.test(fr));
            ok('#175 index.html: cache-bust del #175 (flow_render ' + vR + ', Scanner ' + verOf('js/logic/Scanner.js') + ')',
                vR >= 35 && verOf('js/logic/Scanner.js') >= 15);
            var pl = noComments(SRCS['js/logic/3_Project_Logic.js'] || '');
            ok('#175 ingesta: la data de la portada del BIN no es perduda (st.created || p.created)',
                /created: st\.created \|\| p\.created/.test(pl));

            // ── C3) MOTOR REAL: `portadas` amb el BIN PORTADES (2026-10-21) ─────
            // El 21/10 el Promise.all de la portada va fer 93,52 s perquè escanejava
            // el NAS (1.028 fitxers) tot i que el PNG ja era al projecte. Es prova el
            // motor real amb un pont SIMULAT: ha de tornar la portada del dia des del
            // bin i NO ha de tocar `readFolder` (NAS). Si el bin és buit, fallback.
            var SCAN = UI.Logic.Scan;
            var savedCall = UI.Utils.callJSX, savedRead = UI.Utils.readFolder, savedLog = UI.Utils.log;
            try {
                UI.Utils.log = function () { };
                var dNow = new Date();
                var dateDir = dNow.getFullYear() + '_' + ('0' + (dNow.getMonth() + 1)).slice(-2) + '_' + ('0' + dNow.getDate()).slice(-2);
                var reads = 0;
                UI.Utils.readFolder = async function () { reads++; return []; };
                UI.Utils.callJSX = async function (s) {
                    return /FASTPASS\.Project\.pngItems\('PORTADES'\)/.test(s) ? JSON.stringify([
                        { name: 'TNC_V1_PORTADA_AVUI.png', mediaPath: '\\\\nas\\avui.png', created: Date.now(), modified: Date.now() },
                        { name: 'TNC_V1_PORTADA_AHIR.png', mediaPath: '\\\\nas\\ahir.png', created: Date.now() - 86400000, modified: Date.now() - 86400000 }
                        ,
                        { name: 'TNC_V1_Tema-Titol_sense_res.png', mediaPath: 'Z:/nas/sense.png', created: Date.now(), modified: Date.now() },
                        { name: 'TNC_V2_PORTADA_ALTRE_BLOC.png', mediaPath: 'Z:/nas/altre.png', created: Date.now(), modified: Date.now() }
                    ]) : '[]';
                };
                var ctxBin = { progData: { wott: 'TNC' }, bloque: 'V1', dateDir: dateDir, config: { rutas: { chyrons: '\\\\nas\\chyrons\\' } } };
                var resBin = await SCAN.portadas(ctxBin);
                ok('#175/1 motor: `portadas` resol la portada del BIN (1 del dia) SENSE llegir el NAS',
                    resBin.length === 1 && /AVUI/.test(resBin[0].name) && reads === 0,
                    'n=' + resBin.length + ' nas=' + reads + ' nom=' + (resBin[0] && resBin[0].name));
                ok('#175/2 motor: el path retornat és el `mediaPath` de l\'ítem del projecte',
                    resBin.length === 1 && resBin[0].path === '\\\\nas\\avui.png',
                    resBin[0] && resBin[0].path);

                // Sense res al bin → s'ha de mantenir el camí antic (NAS), sense trencar-se.
                UI.Utils.callJSX = async function () { return '[]'; };
                reads = 0;
                await SCAN.portadas(ctxBin);
                ok('#175/3 motor: si el bin és buit es manté el camí del NAS (fallback intacte)',
                    reads >= 1, 'nas=' + reads);

                // El bin pot tindre la portada SENSE el prefix PROG_BLOC al nom: val
                // igualment (el bin és del PROJECTE OBERT); el que no pot és no portar
                // `PORTADA` (mirar `TEMA-TITOL` era el fals negatiu del 21/10).
                UI.Utils.callJSX = async function (s) {
                    return /FASTPASS\.Project\.pngItems\('PORTADES'\)/.test(s) ? JSON.stringify([
                        { name: 'PORTADA_sense_prefix.png', mediaPath: 'Z:/nas/sp.png', created: Date.now(), modified: Date.now() }
                    ]) : '[]';
                };
                reads = 0;
                var resNoPref = await SCAN.portadas(ctxBin);
                ok('#175/4 motor: sense prefix PROG_BLOC, la portada del bin es troba igualment (0 lectures NAS)',
                    resNoPref.length === 1 && /PORTADA_sense_prefix/.test(resNoPref[0].name) && reads === 0,
                    'n=' + resNoPref.length + ' nas=' + reads);

                // Cap dels dos camins pot tornar a filtrar per `TEMA-TITOL`.
                var scSrc = noComments(SRCS['js/logic/Scanner.js'] || '');
                ok('#175/5 Scanner: BIN i NAS filtren pel literal PORTADA (ja no per TEMA-TITOL)',
                    scSrc.indexOf("indexOf('PORTADA')") > 0 &&
                    (scSrc.match(/indexOf\('PORTADA'\)/g) || []).length >= 2 &&
                    scSrc.indexOf('TEMA-TITOL') === -1,
                    'portada=' + (scSrc.match(/indexOf\('PORTADA'\)/g) || []).length +
                    ' temaTitol=' + scSrc.indexOf('TEMA-TITOL'));
            } finally {
                UI.Utils.callJSX = savedCall;
                UI.Utils.readFolder = savedRead;
                UI.Utils.log = savedLog;
            }

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

            // ── E) FINESTRA DE CAPTURA: EL FRAME TRIAT NO ES MOU MAI (BUG #174) ──
            // (2026-10-21) Report d'usuari: el PNG de la portada sortia ~25 frames ABANS del
            // frame triat quan el clip era llarg i el frame era CAP AL FINAL. Causa: la guarda
            // d'espai de `flow_render` movia el FRAME (`mediaIn = mediaEnd − 2,08`) quan el
            // cabezal era a menys de PORTADA_DUR+PORTADA_GUARD del final del clip → error
            // `2,08 − d` (d = distància al final): amb d = 1,08 s, 1,00 s = 25 frames a 25 fps.
            // Ara s'escurça la FINESTRA (la cua de la còpia) i el frame es queda quiet.
            var PW = UI.Logic && UI.Logic.PortadaWindow;
            ok('#174 `PortadaWindow.plan` carregat (js/logic/18_Portada_Window.js al bundle)',
                !!(PW && typeof PW.plan === 'function' && typeof PW.frameError === 'function'));
            if (PW && typeof PW.plan === 'function') {
                var planOf = function (mIn, mEnd) {
                    return PW.plan({ mediaIn: mIn, mediaEnd: mEnd, dur: 2, guard: 0.08, frameSec: 0.04 });
                };
                // (1) EL CAS REPORTAT: clip llarg, frame a 1,08 s del final.
                var p1 = planOf(120.00, 121.08), e1 = PW.frameError(p1, 120.00, 0.04);
                ok('#174 frame a 1,08 s del final del clip: es captura EXACTAMENT el frame triat (abans: 1,00 s = 25 frames ABANS)',
                    p1.mediaIn === 120.00 && e1.frames === 0 && p1.movedBy === 0,
                    'mediaIn=' + p1.mediaIn + ' · error=' + e1.frames + ' frames');
                ok('#174 frame a 1,08 s del final: s\'escurça la CUA (1,08 s) i es conserva el pre-roll de 2 frames',
                    p1.limited === true && p1.reason === 'cua-escurcada' &&
                    Math.abs(p1.tail - 1.08) < 1e-9 && Math.abs(p1.preRoll - 0.08) < 1e-9 &&
                    Math.abs(p1.windowDur - 1.16) < 1e-9,
                    'tail=' + p1.tail + ' · preRoll=' + p1.preRoll + ' · windowDur=' + p1.windowDur);
                // (2) Frame lluny del final → finestra sencera (comportament del #160 intacte).
                var p2 = planOf(120.00, 130.00);
                ok('#174 frame lluny del final: finestra SENCERA de 2 s (cap canvi respecte al #160)',
                    p2.limited === false && p2.reason === 'ok' && p2.mediaIn === 120.00 &&
                    Math.abs(p2.windowDur - 2) < 1e-9,
                    'windowDur=' + p2.windowDur + ' · limited=' + p2.limited);
                // (3) Últim frame del clip: queda 1 frame de cua i el frame NO es mou.
                var p3 = planOf(121.04, 121.08), e3 = PW.frameError(p3, 121.04, 0.04);
                ok('#174 ÚLTIM frame del clip: es manté el frame i la cua baixa a 1 frame',
                    e3.frames === 0 && Math.abs(p3.tail - 0.04) < 1e-9 &&
                    Math.abs(p3.windowDur - 0.12) < 1e-9,
                    'tail=' + p3.tail + ' · windowDur=' + p3.windowDur + ' · error=' + e3.frames);
                // (4) Frame FORA del media (no hauria de passar): correcció MÍNIMA i marcada.
                var p4 = planOf(121.08, 121.08), e4 = PW.frameError(p4, 121.08, 0.04);
                ok('#174 frame FORA del media: només es corregeix 1 frame i queda marcat (`fora-del-media`)',
                    p4.reason === 'fora-del-media' && e4.frames === -1 &&
                    Math.abs(p4.movedBy + 0.04) < 1e-6,
                    'reason=' + p4.reason + ' · movedBy=' + p4.movedBy + ' · error=' + e4.frames);
                // (5) Final del clip desconegut → finestra sencera (no es mou res).
                var p5 = planOf(120.00, NaN);
                ok('#174 final del clip desconegut (NaN): finestra sencera i frame intacte',
                    p5.limited === false && p5.mediaIn === 120.00 && Math.abs(p5.windowDur - 2) < 1e-9);
                // (6) Frame 0 del media: no hi cap pre-roll, però el frame tampoc no es mou.
                var p6 = planOf(0, 30);
                ok('#174 frame 0 del media: el frame NO es mou i s\'avisa que no hi cap pre-roll',
                    p6.mediaIn === 0 && p6.preRoll === 0 && p6.preRollLimited === true && !!p6.warn);
                // (7) ESTÀTIC: el flux fa servir el planificador i NO pot retrocedir el frame.
                var fw = noComments(SRCS['js/workflows/flow_render.js'] || '');
                ok('#174 flow_render: la finestra ve de `PortadaWindow.plan` (cap `mediaIn = safeIn`)',
                    /getPortadaWindow\(\)\.plan\(/.test(fw) && /PortadaWindow/.test(fw) &&
                    !/mediaIn\s*=\s*safeIn/.test(fw) && !/mediaEnd\s*-\s*need/.test(fw),
                    'plan=' + /getPortadaWindow\(\)\.plan\(/.test(fw) + ' · safeIn=' + /mediaIn\s*=\s*safeIn/.test(fw));
                // (8) ESTÀTIC: el timecode de QE es construeix amb el fps REAL de la seqüència.
                var jsx9 = noComments(SRCS['jsx/modules/9_Render.jsx'] || '');
                ok('#174 9_Render.exportFrameQE: TC amb el timebase REAL (`seqFrameSec`), no 25 fps fixos',
                    /seqFrameSec\(/.test(jsx9) && !/Math\.round\(sec\s*\*\s*25\)/.test(jsx9) &&
                    /totalFrames % nominal/.test(jsx9));
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
