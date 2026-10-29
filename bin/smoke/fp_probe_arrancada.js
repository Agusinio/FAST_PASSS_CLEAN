/* ============================================================================
 * PROVA ARRENCADA / ESCALETA LOCAL (2026-10-23)
 * ----------------------------------------------------------------------------
 * CANVI DE MODEL (2026-10-23): l'escaleta es treballa SEMPRE al DIRECTORI DEL
 * PROJECTE (còpia prèvia del NAS o «foto» del botó FOTO). La carpeta central
 * d'escaletes del NAS i tota la maquinària que la llistava han desaparegut:
 *   · escaleta_io.js: fora `_listEscaletas`, `_listEscaletasNow`, `warmList`,
 *     `_invalidateEscaletas`, la memòria de 8 s, `findLatest` i `getStatus`.
 *   · `ensureLocalCopy(ctx)` NOMÉS mira el directori del projecte.
 *   · `escaleta_fetch.js` estima la sèrie d'escaletaIds amb l'HISTORIAL LOCAL
 *     (`_estimateEscaletaIdFromLocal`) en compte del llistat del NAS.
 *
 * Aquesta prova fixa:
 *  A) `_listProjectFiles` (CEP natiu → ExtendScript) i el seu format.
 *  B) `findInFolder` / `ensureLocalCopy` (només local).
 *  C) `load` amb els separadors normalitzats per a `cep.fs.readFile`.
 *  D) GUARDES: cap ruta d'escaletes del NAS al codi ni a l'arrencada.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '22-arrancada';

        var ER = UI && UI.EscaletaReader;
        ok('#BOOT/1 EscaletaReader carregat amb el model local-first',
            !!ER && typeof ER.findInFolder === 'function' && typeof ER.ensureLocalCopy === 'function' &&
            typeof ER.lookupLocalStatus === 'function' && typeof ER._listProjectFiles === 'function',
            'ER=' + !!ER);
        ok('#BOOT/2 API del NAS retirada (_listEscaletas/findLatest/getStatus/warmList)',
            !!ER && ER._listEscaletas === undefined && ER.findLatest === undefined &&
            ER.getStatus === undefined && ER.warmList === undefined,
            '_listEscaletas=' + !!(ER && ER._listEscaletas) + ' findLatest=' + !!(ER && ER.findLatest) +
            ' getStatus=' + !!(ER && ER.getStatus) + ' warmList=' + !!(ER && ER.warmList));
        if (!ER) return;

        var BS = String.fromCharCode(92);
        var DIR = 'X:' + BS + 'PROVES' + BS + '02_COMARQUES_PROJECTES' + BS + '2026_10_21' + BS + 'V1';

        // ── STUBS DE PLATAFORMA ──────────────────────────────────────────────
        // (2026-10-29) El motor REAL és `cep.fs`: el manifest no declara
        // `--enable-nodejs`, així que ací no es pot simular cap `cep_node`.
        var cepCalls = [];
        var jsxCalls = [];
        var cepMode = 'ok';         // 'ok' | 'ko'
        var cepNames = {};          // directori → [noms]
        var cepStat = {};           // nom → { modified, size, isDir }
        var statMtime = 0;

        UI.Utils = UI.Utils || {};
        UI.State = UI.State || {};
        var readPaths = [];
        var escaletaFake = JSON.stringify({
            cleanFeed: { mediaStart: '12:00:00:00', mediaStop: '13:00:00:00' },
            escaleta: { id: 'PRO1440', liniesEscaleta: [] }
        });

        window.cep = {
            fs: {
                readdir: function (p) {
                    cepCalls.push(p);
                    if (cepMode === 'ko') return { err: 9, data: null };
                    var names = cepNames[p];
                    if (names === undefined) return { err: 3, data: null };
                    return { err: 0, data: names };
                },
                readFile: function (p) { readPaths.push(p); return { err: 0, data: escaletaFake }; },
                stat: function (p) {
                    var n = String(p).split(BS).pop();
                    var s = cepStat[n];
                    if (!s) return { err: 3, data: null };
                    return { err: 0, data: s };
                }
            }
        };
        UI.Utils.callJSX = function (s) { jsxCalls.push(s); return Promise.resolve('[]'); };

        // ── A. LLISTAT DEL DIRECTORI DEL PROJECTE (CEP natiu) ────────────────
        var FOTO = 'escaleta_on_demand_1761123456789.json';
        var NAS1 = '20261021_120000_TN_COMARQUES_V1_a.json';
        var NAS2 = '20261021_130000_TN_COMARQUES_V1_b.json';
        cepNames[DIR] = [FOTO, NAS1, NAS2, 'llegeix-me.txt'];
        statMtime = 1761123456789;
        cepStat[FOTO] = { modified: statMtime, size: 1234, isDir: false };

        var files = await ER._listProjectFiles(DIR);
        ok('#BOOT/3 llistat per CEP: només .json (fora .txt)', !!files && files.length === 3,
            'n=' + (files ? files.length : '-'));
        ok('#BOOT/4 format del llistat (name/path/isDir/modified)',
            !!files && files[0].name === FOTO && files[0].path === DIR + BS + FOTO &&
            files[0].isDir === false && files[0].modified === statMtime,
            JSON.stringify(files && files[0] ? { n: files[0].name, m: files[0].modified } : {}));
        ok('#BOOT/5 readdir rep el directori SENSE separador final',
            cepCalls.length === 1 && cepCalls[0] === DIR, cepCalls[0] || '(cap)');

        // ── B. RESPATLLER: CEP KO → ExtendScript (IO.listFolder) ─────────────
        cepMode = 'ko';
        var savedCallJSX = UI.Utils.callJSX;
        var iJsx0 = jsxCalls.length;
        UI.Utils.callJSX = function (s) {
            jsxCalls.push(s);
            return Promise.resolve(JSON.stringify([
                { name: NAS1, path: DIR + BS + NAS1, isDir: false, modified: 5, created: 0, size: 9 }
            ]));
        };
        var filesJsx = await ER._listProjectFiles(DIR);
        ok('#BOOT/6 sense CEP natiu cau a ExtendScript (IO.listFolder)',
            !!filesJsx && filesJsx.length === 1 && filesJsx[0].name === NAS1 &&
            jsxCalls.length > iJsx0 && jsxCalls[iJsx0].indexOf('IO.listFolder') === 0,
            'n=' + (filesJsx ? filesJsx.length : '-'));

        // ── C. RESPATLLER FINAL: ExtendScript ────────────────────────────────
        cepMode = 'ko';
        UI.Utils.callJSX = function (s) { jsxCalls.push(s); return Promise.resolve('ERR:KO'); };
        var filesNull = await ER._listProjectFiles(DIR);
        ok('#BOOT/7 sense CEP ni ExtendScript retorna null (no inventa res)',
            filesNull === null,
            'res=' + (filesNull === null ? 'null' : '-'));
        UI.Utils.callJSX = savedCallJSX;
        cepMode = 'ok';
        cepNames[DIR] = [FOTO, NAS1, NAS2];

        // ── D. findInFolder / ensureLocalCopy (NOMÉS local) ──────────────────
        UI.Utils.workFolder = function () { return DIR; };
        var ctx = {
            config: { rutas: { destinoBase: 'X:' + BS + 'PROVES' + BS } },
            progData: { archivo: 'TN_COMARQUES', directorio: '02_COMARQUES_PROJECTES' },
            dateDir: '2026_10_21',
            bloque: 'V1'
        };
        var meta = await ER.ensureLocalCopy(ctx);
        ok('#BOOT/8 ensureLocalCopy retorna la FOTO del directori del projecte',
            !!meta && meta.filename === FOTO && meta.path === DIR + BS + FOTO,
            'file=' + (meta && meta.filename));
        ok('#BOOT/9 ensureLocalCopy no consulta cap ruta del NAS (només el directori)',
            cepCalls.indexOf(DIR) >= 0 && cepCalls.every(function (p) { return p === DIR; }),
            cepCalls.join(' | '));

        cepNames[DIR] = [];
        var metaBuit = await ER.ensureLocalCopy(ctx);
        ok('#BOOT/10 sense escaleta local retorna null (el flux farà FOTO)',
            metaBuit === null, 'res=' + (metaBuit === null ? 'null' : '?'));

        cepNames[DIR] = ['escaleta_invalida.json'];
        window.cep.fs.readFile = function () { return { err: 0, data: '{"missatge":"Error"}' }; };
        var metaDolent = await ER.ensureLocalCopy(ctx);
        ok('#BOOT/11 un JSON d error no compta com a escaleta', metaDolent === null,
            'res=' + (metaDolent === null ? 'null' : '?'));
        window.cep.fs.readFile = function (p) { readPaths.push(p); return { err: 0, data: escaletaFake }; };

        // ── E. load: separadors normalitzats per al natiu ────────────────────
        var mixed = 'C:' + BS + 'P' + BS + 'PROVES' + BS + '02_COMARQUES_PROJECTES/2026_10_20/V1' + BS + 'a.json';
        readPaths = [];
        var d1 = await ER.load(mixed, true);
        ok('#BOOT/12 load llig amb el camí normalitzat (sense /)',
            !!d1 && readPaths.length === 1 && readPaths[0].indexOf('/') === -1 &&
            readPaths[0].indexOf('PROVES') > 0, readPaths[0] || '(cap lectura)');

        // ── F. GUARDES sobre els fitxers REALS ───────────────────────────────
        var REPO = window.__REPO || '';
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            return await r.text();
        }
        var ioSrc = await readRepo('js/core/escaleta_io.js');
        ok('#BOOT/13 escaleta_io: cap ruta ni llistat de la carpeta central del NAS',
            ioSrc.indexOf('ESCALETES_PATH') === -1 && ioSrc.indexOf('_listEscaletas') === -1 &&
            ioSrc.indexOf('findLatest') === -1 && ioSrc.indexOf('getStatus') === -1 &&
            ioSrc.indexOf('LOCAL-FIRST') > 0);
        var mainSrc = await readRepo('js/main.js');
        ok('#BOOT/14 arrencada sense escalfar el llistat d escaletes (warmList)',
            mainSrc.indexOf('warmList') === -1 && mainSrc.indexOf('_listEscaletas') === -1);
        var fetchSrc = await readRepo('js/core/escaleta_fetch.js');
        ok('#BOOT/15 escaleta_fetch: sèrie estimada amb l HISTORIAL LOCAL',
            fetchSrc.indexOf('_estimateEscaletaIdFromLocal') > 0 &&
            fetchSrc.indexOf('_estimateEscaletaIdFromHistory') === -1 &&
            fetchSrc.indexOf('_invalidateSeries') > 0 &&
            fetchSrc.indexOf('ESCALETES_PATH') === -1);
        var idx = await readRepo('index.html');
        ok('#BOOT/16 cache-busts presents a index.html',
            /escaleta_io\.js\?v=\d+/.test(idx) && /escaleta_fetch\.js\?v=\d+/.test(idx),
            'io=' + /escaleta_io\.js\?v=\d+/.test(idx) + ' fetch=' + /escaleta_fetch\.js\?v=\d+/.test(idx));
        // (2026-10-27) El timing d'arrencada començava a js/main.js, que és l'ÚLTIM
        // dels 48 <script>: el tram navegació + càrrega de mòduls quedava fora del
        // _boot_timing.log (l'usuari veia ~1 min i el log resumia 146 ms). Ara
        // index.html deixa una marca al <head> (window.__FP_PAGE) ABANS de cap
        // recurs i main.js la bolca al log amb ms negatives.
        var posMarca = idx.indexOf('window.__FP_PAGE');
        var posPrimer = idx.indexOf('<script src=');
        ok('#BOOT/17 marca de pàgina al <head> i abocada al log (tram previ a main.js)',
            posMarca > 0 && posPrimer > 0 && posMarca < posPrimer &&
            /getEntriesByType\('resource'\)/.test(idx) &&
            /__FP_PAGE/.test(mainSrc) &&
            /page:\s*function\s*\(\s*\)/.test(mainSrc) &&
            /pageLoad:\s*function\s*\(\s*\)/.test(mainSrc),
            'marca=' + posMarca + ' primerScript=' + posPrimer);
        // (2026-10-28 · #113) `_boot_timing.log` es REESCRIVIA a cada arrencada → la
        // mesura en FRED es perdia si el panell es reobria. Ara cada arrencada deixa
        // UNA línia en `_boot_timing_hist.log` (total + nav→main + DCL + «1R DEL DIA»)
        // i es marca el PRIMER PINTAT (rAF×2), que és l'últim tram mesurable des del
        // panell: el tram host CEP → WebView (~12 s en fred) queda fora del JS.
        ok('#BOOT/18 històric d arrencades (_boot_timing_hist.log) i marca de primer pintat',
            /_boot_timing_hist\.log/.test(mainSrc) &&
            /_bootHist\s*=\s*function/.test(mainSrc) &&
            /_bootHistDone/.test(mainSrc) &&
            /1R DEL DIA/.test(mainSrc) &&
            /requestAnimationFrame/.test(mainSrc) &&
            /primer pintat/.test(mainSrc) &&
            /histPath:/.test(mainSrc),
            'hist=' + /_boot_timing_hist\.log/.test(mainSrc) + ' raf=' + /requestAnimationFrame/.test(mainSrc));
        // #BOOT/19 · COMPORTAMENT (no només text): s'extrau el bloc REAL del
        // `_bootHist` de js/main.js i s'executa contra un `window.cep.fs` simulat.
        // Ha de deixar UNA sola línia per arrencada (idempotent), conservar les
        // anteriors del fitxer i marcar «1R DEL DIA» quan no n'hi ha cap de hui.
        try {
            var iH = mainSrc.indexOf('var _bootHistFile');
            var iM = mainSrc.indexOf('var _bootMark = function');
            var srcHist = (iH > 0 && iM > iH) ? mainSrc.substring(iH, iM) : '';
            var tB = Date.parse('2026-10-28T09:25:11');
            var writes = [];
            var fakeWin = {
                __FP_PAGE: { navStart: tB - 548, dcl: tB - 548 + 562 },
                cep: {
                    fs: {
                        readFile: function (p) {
                            return { err: 0, data: '2026-10-27 08:00:00 | arrencada 999 ms' };
                        },
                        writeFile: function (p, t) { writes.push({ p: p, t: t }); return { err: 0 }; }
                    }
                }
            };
            var padF = function (n, w) { return ('        ' + n).slice(-(w || 7)); };
            var linesB = ['+     4 ms  (Δ      4 ms)  main.js: arrencada',
                          '+   335 ms  (Δ    331 ms)  ARRENCADA COMPLETA',
                          '+   340 ms  (Δ      5 ms)  primer pintat'];
            var fHist = new Function('window', '_bootRoot', '_bootLines', '_tBoot', '_bootPad',
                srcHist + '\nreturn { h: _bootHist, s: _bootHistSafe };');
            var apiHist = fHist(fakeWin, 'C:\\EXT', linesB, tB, padF);
            apiHist.s();
            apiHist.s();   // 2a crida: NO ha d'afegir res (idempotent)
            var wHist = writes.filter(function (w) { return w.p.indexOf('EXT') > 0; });
            var tHist = wHist.length ? wHist[wHist.length - 1].t : '';
            ok('#BOOT/19 històric: UNA línia per arrencada (idempotent), conserva les anteriors i marca «1R DEL DIA»',
                wHist.length === 1 &&
                /2026-10-28 09:25:11/.test(tHist) &&
                /arrencada +335 ms/.test(tHist) &&
                /total +340 ms/.test(tHist) &&
                /nav→main +548 ms/.test(tHist) &&
                /DCL +562 ms/.test(tHist) &&
                tHist.indexOf('2026-10-27 08:00:00') >= 0 &&
                tHist.indexOf('1R DEL DIA') >= 0,
                'writes=' + wHist.length + ' · ' + tHist.replace(/\n/g, ' ⏎ '));
        } catch (eHist) {
            ok('#BOOT/19 històric: UNA línia per arrencada (idempotent)', false, String(eHist && eHist.message));
        }
        // #BOOT/20 · COMPORTAMENT (BUG #204): el log s'ha de quedar amb les ESPERES
        // llargues posteriors a l'ARRENCADA COMPLETA. El 29/10 l'arrencada va ser de
        // 330 ms, però el panell va estar 103 s bloquejat dins `_fullScan` i al
        // `_boot_timing.log` no n'hi havia ni una línia: `_bootClosed` descartava
        // tot el que no fos 'force'. Ara les marques lentes (Δ >= _bootPostSlowMs)
        // entren amb el prefix [post] i la primera deixa rastre a l'històric.
        try {
            var iMk = mainSrc.indexOf('var _bootMark = function');
            var iMkSafe = mainSrc.indexOf('var _bootMarkSafe');
            var srcMark = (iMk > 0 && iMkSafe > iMk) ? mainSrc.substring(iMk, iMkSafe) : '';
            var mkRun = function (closed, dtMs, lvl) {
                var linesP = [], histW = [], flushes = 0;
                var now = Date.now();
                var f = new Function('window', '_tBoot', '_bootLast', '_bootLines', '_bootClosed',
                    '_bootPostMs', '_bootPostSlowMs', '_bootPostUntil', '_bootPad', '_bootFlush',
                    '_bootHistWrite', '_bootPostLogged', 'utils',
                    srcMark + '\nreturn _bootMark;');
                var mk = f({}, now - 5000, now - dtMs, linesP, closed, 180000, 400,
                    now + 180000, padF,
                    function () { flushes++; }, function (l) { histW.push(l); }, false,
                    { log: function () { } });
                mk('prova lenta', lvl);
                return { lines: linesP, hist: histW, flushes: flushes };
            };
            var rRapida = mkRun(true, 20);      // tancada + marca ràpida → fora
            var rLenta = mkRun(true, 2500);     // tancada + marca lenta  → [post]
            var rOberta = mkRun(false, 2500);   // arrencada en curs       → sense prefix
            ok('#BOOT/20 post-arrencada: només les marques LENTES es desen (amb [post]) i la 1a va a l historíc',
                rRapida.lines.length === 0 && rRapida.hist.length === 0 &&
                rLenta.lines.length === 1 && /\[post\] prova lenta/.test(rLenta.lines[0]) &&
                rLenta.flushes === 1 && rLenta.hist.length === 1 &&
                /1a espera post-arrencada/.test(rLenta.hist[0]) &&
                rOberta.lines.length === 1 && rOberta.lines[0].indexOf('[post]') === -1,
                'rapida=' + rRapida.lines.length + ' lenta=' + rLenta.lines.length +
                ' hist=' + rLenta.hist.length + ' oberta=' + rOberta.lines.length);
        } catch (ePost) {
            ok('#BOOT/20 post-arrencada: només les marques lentes es desen', false, String(ePost && ePost.message));
        }
    };
})();

