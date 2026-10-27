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
 *  A) `_listProjectFiles` (Node → CEP → ExtendScript) i el seu format.
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
        var nodeCalls = [];
        var cepCalls = [];
        var jsxCalls = [];
        var nodeMode = 'ok';        // 'ok' | 'ko'
        var nodeNames = {};         // directori → [noms]
        var statMtime = 0;

        UI.Utils = UI.Utils || {};
        UI.State = UI.State || {};
        window.cep_node = {
            require: function () {
                return {
                    readdir: function (p, cb) {
                        nodeCalls.push(p);
                        if (nodeMode === 'ko') { cb(new Error('ENOENT')); return; }
                        cb(null, nodeNames[p] || null);
                    },
                    stat: function (p, cb) {
                        cb(null, {
                            isDirectory: function () { return false; },
                            mtime: new Date(statMtime),
                            birthtime: new Date(statMtime),
                            size: 1234
                        });
                    }
                };
            }
        };

        var cepMode = 'ok';
        var cepNames = {};
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
                stat: function () { return { err: 3, data: null }; }
            }
        };
        UI.Utils.callJSX = function (s) { jsxCalls.push(s); return Promise.resolve('[]'); };

        // ── A. LLISTAT DEL DIRECTORI DEL PROJECTE (Node) ─────────────────────
        var FOTO = 'escaleta_on_demand_1761123456789.json';
        var NAS1 = '20261021_120000_TN_COMARQUES_V1_a.json';
        var NAS2 = '20261021_130000_TN_COMARQUES_V1_b.json';
        nodeNames[DIR] = [FOTO, NAS1, NAS2, 'llegeix-me.txt'];
        statMtime = 1761123456789;

        var files = await ER._listProjectFiles(DIR);
        ok('#BOOT/3 llistat per Node: només .json (fora .txt)', !!files && files.length === 3,
            'n=' + (files ? files.length : '-'));
        ok('#BOOT/4 format del llistat (name/path/isDir/modified)',
            !!files && files[0].name === FOTO && files[0].path === DIR + BS + FOTO &&
            files[0].isDir === false && files[0].modified === statMtime,
            JSON.stringify(files && files[0] ? { n: files[0].name, m: files[0].modified } : {}));
        ok('#BOOT/5 readdir rep el directori SENSE separador final',
            nodeCalls.length === 1 && nodeCalls[0] === DIR, nodeCalls[0] || '(cap)');

        // ── B. RESPATLLERS: Node KO → CEP ────────────────────────────────────
        nodeMode = 'ko';
        cepNames[DIR] = [NAS1];
        var filesCep = await ER._listProjectFiles(DIR);
        ok('#BOOT/6 sense Node cau a CEP natiu (readdir)',
            !!filesCep && filesCep.length === 1 && filesCep[0].name === NAS1,
            'n=' + (filesCep ? filesCep.length : '-'));
        nodeMode = 'ok';

        // ── C. RESPATLLER FINAL: ExtendScript ────────────────────────────────
        cepMode = 'ko';
        nodeMode = 'ko';
        var savedCallJSX = UI.Utils.callJSX;
        UI.Utils.callJSX = function (s) { jsxCalls.push(s); return Promise.resolve('ERR:KO'); };
        var filesJsx = await ER._listProjectFiles(DIR);
        ok('#BOOT/7 sense Node ni CEP cau a ExtendScript (IO.listFolder) i no inventa res',
            filesJsx === null && jsxCalls.length > 0 && jsxCalls[0].indexOf('IO.listFolder') === 0,
            'res=' + (filesJsx === null ? 'null' : '-'));
        UI.Utils.callJSX = savedCallJSX;
        cepMode = 'ok';
        nodeMode = 'ok';
        cepNames[DIR] = [NAS1, NAS2];


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
            nodeCalls.indexOf(DIR) >= 0 && nodeCalls.every(function (p) { return p === DIR; }),
            nodeCalls.join(' | '));

        nodeNames[DIR] = [];
        cepNames[DIR] = [];
        var metaBuit = await ER.ensureLocalCopy(ctx);
        ok('#BOOT/10 sense escaleta local retorna null (el flux farà FOTO)',
            metaBuit === null, 'res=' + (metaBuit === null ? 'null' : '?'));

        nodeNames[DIR] = ['escaleta_invalida.json'];
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
    };
})();

