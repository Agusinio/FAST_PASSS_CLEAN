/* ============================================================================
 * PROVA ARRENCADA / LLISTAT D'ESCALETES (2026-10-21)
 * ----------------------------------------------------------------------------
 * SIMPTOMA (mesura real, TNC V1 21/10 primera arrencada del dia):
 *     +    140 ms  checkContext · readFolder NAS (workFolder)  -> 14 ms
 *     +   5377 ms  checkContext · escaleta getStatus            -> 5233 ms (96%)
 *     +   5435 ms  ARRENCADA COMPLETA
 * El llistat de la carpeta d'escaletes el feia `IO.listFolder` del motor
 * ExtendScript (`scanDirectory`): `length` + `modified` + `created` de CADA
 * fitxer i, si `length` ix 0 (típic en UNC), obre el fitxer per `eof`.
 *
 * Aquesta prova fixa el comportament NOU de `EscaletaReader`:
 *  A) LLISTAT NATIU (Node async -> CEP) amb el MATEIX format d'entrada que
 *     `scanDirectory` (name/path/modified/created/size/isDir) i només .json.
 *  B) MEMORIA CURTA (`LIST_TTL_MS`) + `_invalidateEscaletas()`.
 *  C) DEDUPLICACIO de crides simultanies (1 sola lectura).
 *  D) RESPATLLERS en cascada: Node -> CEP -> ExtendScript, i camí de domini
 *     quan el primer camí torna BUIT.
 *  E) `load()` normalitza els separadors per a `cep.fs.readFile` (abans
 *     responia err=3 amb els camins que genera `workFolder()`, que porta '/').
 *  F) `findLatestValid()` NO rellegeix el JSON del fallback (ja el té).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '22-arrancada';

        var ER = UI && UI.EscaletaReader;
        ok('#BOOT/1 EscaletaReader carregat (js/core/escaleta_io.js al bundle)', !!ER, 'ER=' + !!ER);
        if (!ER) return;

        var BS = String.fromCharCode(92);
        var P1 = 'X:' + BS + 'ESC';
        var P2 = 'Y:' + BS + 'ESC';

        function setPath(name, val) {
            Object.defineProperty(ER, name, { get: function () { return val; }, configurable: true });
        }
        setPath('ESCALETES_PATH', P1);
        setPath('ESCALETES_PATH_DOMAIN', P2);

        // ── STUBS DE PLATAFORMA ──────────────────────────────────────────────
        var nodeCalls = [];
        var cepCalls = [];
        var jsxCalls = [];
        var nodeMode = 'ok';     // 'ok' | 'ko'
        var nodeItems = {};      // items per camí
        var nodePending = null;  // si no és null, la promesa es resol a mà

        UI.Utils = UI.Utils || {};
        UI.Utils._nodeFs = function () {
            return {
                promises: {
                    readdir: function (p) {
                        nodeCalls.push(p);
                        if (nodePending) return nodePending;
                        if (nodeMode === 'ko') return Promise.reject(new Error('ENOENT'));
                        return Promise.resolve(nodeItems[p] || []);
                    }
                }
            };
        };
        UI.Utils.callJSX = function (s) { jsxCalls.push(s); return Promise.resolve('[]'); };

        var cepMode = 'ok';      // 'ok' | 'ko'
        var cepItems = {};
        window.cep = {
            fs: {
                readdir: function (p) {
                    cepCalls.push(p);
                    if (cepMode === 'ko') return { err: 9, data: null };
                    var names = cepItems[p];
                    if (names === undefined) return { err: 3, data: null };
                    return { err: 0, data: names };
                },
                readFile: function () { return { err: 3, data: null }; }
            }
        };

        var itemsA = [
            { name: '20261021_120000_TN_COMARQUES_V1_a.json', isDirectory: function () { return false; } },
            { name: '20261021_130000_TN_COMARQUES_V1_b.json', isDirectory: function () { return false; } },
            { name: 'llegeix-me.txt', isDirectory: function () { return false; } },
            { name: 'subcarpeta.json', isDirectory: function () { return true; } }
        ];
        nodeItems = {}; nodeItems[P1] = itemsA;
        ER._invalidateEscaletas();

        // ── A. LLISTAT NATIU (Node) ──────────────────────────────────────────
        var r1 = await ER._listEscaletas();
        ok('#BOOT/2 llistat per Node (asíncron)', r1.via === 'node', 'via=' + r1.via);
        ok('#BOOT/3 només .json (fora .txt i carpetes)', r1.count === 2, 'count=' + r1.count);
        var parsed1 = JSON.parse(r1.raw || '[]');
        ok('#BOOT/4 format scanDirectory (name/path/isDir)',
            parsed1.length === 2 && parsed1[0].name.indexOf('.json') > 0 &&
            parsed1[0].path === P1 + BS + parsed1[0].name && parsed1[0].isDir === false &&
            parsed1[0].size === 0 && parsed1[0].created === 0,
            JSON.stringify(parsed1[0] || {}));

        // ── B. MEMORIA CURTA ─────────────────────────────────────────────────
        var before = nodeCalls.length;
        var r2 = await ER._listEscaletas();
        ok('#BOOT/5 segona crida surt de memòria (0 lectures)',
            r2.via === 'cache' && nodeCalls.length === before, 'via=' + r2.via + ' calls=' + nodeCalls.length);
        ok('#BOOT/6 LIST_TTL_MS definit (finestra curta, no eterna)',
            ER.LIST_TTL_MS > 0 && ER.LIST_TTL_MS <= 30000, 'ttl=' + ER.LIST_TTL_MS);

        ER._invalidateEscaletas();
        await ER._listEscaletas();
        ok('#BOOT/7 _invalidateEscaletas força lectura nova',
            nodeCalls.length === before + 1, 'calls=' + nodeCalls.length);

        // ── C. DEDUPLICACIO ──────────────────────────────────────────────────
        ER._invalidateEscaletas();
        var resolveNow = null;
        nodePending = new Promise(function (res) { resolveNow = res; });
        var c0 = nodeCalls.length;
        var pA = ER._listEscaletas();
        var pB = ER._listEscaletas();
        resolveNow(itemsA);
        nodePending = null;
        var rA = await pA; var rB = await pB;
        ok('#BOOT/8 crides simultànies comparteixen UNA lectura',
            nodeCalls.length === c0 + 1 && rA.raw === rB.raw, 'calls=' + (nodeCalls.length - c0));

        // ── D. RESPATLLERS ───────────────────────────────────────────────────
        ER._invalidateEscaletas();
        nodeMode = 'ko';
        cepItems = {};
        cepItems[P1] = ['20261021_120000_TN_COMARQUES_V1_a.json', 'nota.txt'];
        var r3 = await ER._listEscaletas();
        ok('#BOOT/9 sense Node cau a CEP natiu', r3.via === 'cep' && r3.count === 1,
            'via=' + r3.via + ' count=' + r3.count);

        ER._invalidateEscaletas();
        cepMode = 'ko';
        jsxCalls = [];
        UI.Utils.callJSX = function (s) {
            jsxCalls.push(s);
            return Promise.resolve('[{"name":"20261021_120000_TN_COMARQUES_V1_a.json","path":"z","isDir":false}]');
        };
        var r4 = await ER._listEscaletas();
        ok('#BOOT/10 sense Node ni CEP cau a ExtendScript',
            r4.via === 'jsx' && r4.count === 1 && jsxCalls.length > 0 && jsxCalls[0].indexOf('IO.listFolder(') === 0,
            'via=' + r4.via + ' count=' + r4.count + ' jsx=' + jsxCalls.length);

        // Camí 1 BUIT + camí 2 (domini) amb fitxers -> mana el que té fitxers.
        ER._invalidateEscaletas();
        nodeMode = 'ok'; cepMode = 'ok';
        nodeItems = {};
        nodeItems[P1] = [];
        nodeItems[P2] = [{ name: '20261021_120000_TN_COMARQUES_V1_c.json', isDirectory: function () { return false; } }];
        var r5 = await ER._listEscaletas();
        ok('#BOOT/11 camí buit no s\'imposa al de domini amb fitxers',
            r5.count === 1 && r5.path === P2, 'path=' + r5.path + ' count=' + r5.count);

        // ── E. load(): separadors normalitzats per al natiu ──────────────────
        // `workFolder()` genera "...\PROVES\02_COMARQUES_PROJECTES/2026_10_20/V1"
        // i `cep.fs.readFile` responia err=3 (al log real: "cep.fs.readFile err=3
        // → respatller JSX") → crida al motor que bloqueja Premiere + mojibake.
        ER.applyDurationOverrides = function () { return 0; };   // doble de prova
        var readPaths = [];
        var escaletaFake = JSON.stringify({ cleanFeed: { clips: [] }, escaleta: { lines: [] } });
        window.cep.fs.readFile = function (p) { readPaths.push(p); return { err: 0, data: escaletaFake }; };
        var mixed = 'C:' + BS + 'P' + BS + 'PROVES' + BS + '02_COMARQUES_PROJECTES/2026_10_20/V1' + BS + 'a.json';
        var d1 = await ER.load(mixed, true);
        ok('#BOOT/12 load llig amb el camí normalitzat (sense /)',
            !!d1 && readPaths.length === 1 && readPaths[0].indexOf('/') === -1 &&
            readPaths[0].indexOf('PROVES') > 0, readPaths[0] || '(cap lectura)');

        // ── F. findLatestValid: el fallback no rellegeix el JSON ────────────
        ER._getBlockLastItemEndSec = function () { return { endSec: 80000, source: 'test', num: '99' }; };
        readPaths = [];
        ER._invalidateEscaletas();
        nodeItems = {};
        nodeItems[P1] = [{ name: '20261021_120000_TN_COMARQUES_V1_a.json', isDirectory: function () { return false; } }];
        var fv = await ER.findLatestValid('TN_COMARQUES', 'V1', '20261021');
        ok('#BOOT/13 fallback vàlid amb UNA sola lectura del JSON',
            !!(fv && fv.valid && fv._fallback) && readPaths.length === 1,
            'valid=' + !!(fv && fv.valid) + ' fallback=' + !!(fv && fv._fallback) + ' reads=' + readPaths.length);

        // ── G. GUARDES sobre els fitxers REALS ─────────────────────────────
        // (1) cache-busts al dia (el panell de CEP cacheja els .js antics).
        // (2) el llistat s'engega en paral·lel a l'arrencada i el primer camí és
        //     NATIU: si algú torna a posar `IO.listFolder` primer, es veurà.
        var REPO = window.__REPO || '';
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            return await r.text();
        }
        var idx = await readRepo('index.html');
        ok('#BOOT/14 cache-busts al dia (escaleta_io v19 + main v87)',
            /\?v=19/.test(idx.match(/escaleta_io\.js\?v=\d+/) || '') &&
            /\?v=87/.test(idx.match(/main\.js\?v=\d+/) || ''),
            (idx.match(/escaleta_io\.js\?v=\d+/) || '') + ' ' + (idx.match(/main\.js\?v=\d+/) || ''));

        var mainSrc = await readRepo('js/main.js');
        var ioSrc = await readRepo('js/core/escaleta_io.js');
        ok('#BOOT/15 arrencada engega el llistat (warmList) i el primer camí és natiu',
            mainSrc.indexOf('FASTPASS_UI.EscaletaReader') > 0 &&
            mainSrc.indexOf('.warmList()') > 0 &&
            ioSrc.indexOf('warmList') > 0 &&
            ioSrc.indexOf('pNod = this._listViaNode') > 0 &&
            ioSrc.indexOf('_listViaCep') > 0,
            'main=' + (mainSrc.indexOf('.warmList()') > 0) +
            ' node=' + (ioSrc.indexOf('pNod = this._listViaNode') > 0));
    };
})();
