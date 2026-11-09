/* ============================================================================
 * HARNES HEADLESS · AnalysisCenter v1 + SessionManifest v2 + LOGIC 16_ANALYSIS v2
 * ----------------------------------------------------------------------------
 * Carrega els fitxers REALS del repositori (via fp_smoke_build.ps1) i els
 * executa amb un stub de Utils (callJSX → mapa de fitxers en memòria).
 * Sense Premiere ni NAS: valida el CABLEJAT i les semàntiques de merge/rebuild.
 * L'estat global (__LOG, __FILES, __ERR, __PASS...) el crea fp_smoke_boot.js.
 * ==========================================================================*/

(function () {
    var FILES = window.__FILES;

    /** esc: rèplica exacta de Utils.escape (utils.js:862) */
    function esc(s) {
        return String(s)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/[\u0080-\uFFFF]/g, function (ch) {
                var h = ch.charCodeAt(0).toString(16);
                while (h.length < 4) { h = '0' + h; }
                return '\\u' + h;
            });
    }

    /** unesc: desfà esc() en UNA passada (l'ordre importa: \\n no és \ + \n) */
    function unesc(s) {
        return String(s).replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, function (m, g) {
            if (g.charAt(0) === 'u') return String.fromCharCode(parseInt(g.slice(1), 16));
            switch (g) {
                case 'n': return '\n';
                case 'r': return '\r';
                case 't': return '\t';
                case "'": return "'";
                case '\\': return '\\';
                default: return g;
            }
        });
    }

    window.__unesc = unesc;

    window.FASTPASS_UI.Utils = {
        log: function (m, lvl) { window.__LOG.push(String(lvl || 'DEBUG') + ' ' + String(m)); },
        delay: function () { return Promise.resolve(); },
        escape: esc,
        jsxName: function (n) { return String(n == null ? '' : n).replace(/%/g, '%25'); },
        workFolder: function (ctx) {
            return 'C:/TMP/NAS/' + ctx.progData.archivo + '_PROJECTES/' + ctx.dateDir + '/' + ctx.bloque;
        },
        ensureFolders: async function (dir) { window.__FOLDERS.push(dir); return true; },
        _fromMojibake: function (s) { return s; },
        callJSX: async function (expr) {
            var s = String(expr);
            window.__JSX.push(s.slice(0, 70));
            var m;
            if ((m = /^IO\.readTxt\('([\s\S]*)'\)$/.exec(s))) {
                var p = unesc(m[1]);
                return (FILES[p] === undefined) ? '' : FILES[p];
            }
            if ((m = /^IO\.writeTxt\('([\s\S]*?)', '([\s\S]*)'\)$/.exec(s))) {
                FILES[unesc(m[1])] = unesc(m[2]);
                return 'OK';
            }
            if ((m = /^IO\.appendTxt\('([\s\S]*?)', '([\s\S]*)'\)$/.exec(s))) {
                var ap = unesc(m[1]);
                FILES[ap] = (FILES[ap] || '') + unesc(m[2]);
                return 'OK';
            }
            return 'OK';
        }
    };
})();

/* ── Resultats ─────────────────────────────────────────────────────────────*/
window.__R = [];
window.__PASS = 0;
window.__FAIL = 0;
window.__ok = function (name, cond, extra) {
    if (cond) { window.__PASS++; window.__R.push('OK   ' + name); }
    else { window.__FAIL++; window.__R.push('FAIL ' + name + ' :: ' + (extra === undefined ? '' : extra)); }
};

window.__dump = function () {
    var head = 'AnalysisCenter v' + ((window.FASTPASS_UI.Core.AnalysisCenter || {}).VERSION || '?') +
        ' · SessionManifest v' + ((window.FASTPASS_UI.SessionManifest || {}).VERSION || '?') +
        ' | PASS ' + window.__PASS + ' FAIL ' + window.__FAIL +
        ' | JSX ' + window.__JSX.length + ' | FILES ' + Object.keys(window.__FILES).length +
        ' | FASE ' + (window.__PHASE || '-');
    var body = window.__R.join('\n');
    var errs = window.__ERR.length ? ('JSError(s):\n' + window.__ERR.join('\n')) : 'JSError(s): cap';
    var warns = window.__LOG.filter(function (l) { return /WARN|ERROR/.test(l); });
    return head + '\n' + body + '\n' + errs + '\nWARN/ERROR dels mòduls (' + warns.length + '):\n' +
        warns.slice(0, 12).map(function (l) { return '  ' + l; }).join('\n');
};

/* ── Fixtures ──────────────────────────────────────────────────────────────*/
window.__ctx = {
    dateDir: '15_10_2026_TNV',
    bloque: 'V1',
    progData: { archivo: 'TNV', wott: 'TNV', directorio: 'TNV_PROJECTES' },
    config: { rutas: { destinoBase: 'C:/TMP/NAS/' } }
};

window.__runTests = async function () {
    var ok = window.__ok;
    var ph = function (n) { window.__PHASE = n; };
    ph('start');
    var UI = window.FASTPASS_UI;
    var AC = UI.Core.AnalysisCenter;
    var SM = UI.SessionManifest;
    var AN = UI.Logic.Analysis;
    var FILES = window.__FILES;
    var ctx = window.__ctx;

    var MPATH = SM.getPath(ctx);
    var MIRROR = AN._getPath(ctx);
    window.__MPATH = MPATH;
    window.__MIRROR = MIRROR;

    // ── 0. Mòduls i esquema ────────────────────────────────────────────────
    ok('mòduls carregats (AC 1.0 / SM 2.0 / Analysis)',
        !!(AC && SM && AN) && AC.VERSION === '1.0' && SM.VERSION === '2.0',
        [AC && AC.VERSION, SM && SM.VERSION].join('|'));
    var needSec = ['escaletaItems', 'clips', 'media', 'markers', 'chyrons', 'graphics',
                   'analysis', 'structure', 'phases'];
    var missing = needSec.filter(function (k) { return SM.SECTION_KEYS.indexOf(k) === -1; });
    ok('SECTION_KEYS cobreix les seccions v2.0', missing.length === 0, missing.join(','));
    ok('manifest path = <bloc>\\TNV_V1.fastpass.json', /\\TNV_V1\.fastpass\.json$/.test(MPATH), MPATH);
    ok('mirall = .../analisis_estructura/15_10_TNV_V1.json', /analisis_estructura\/15_10_TNV_V1\.json$/.test(MIRROR), MIRROR);

    // ── 1. FASE ESCALETA (saveEscaleta → manifest + mirall) ────────────────
    ph('1-escaleta');
    var LINES = [
        // NOTA: la línia d'escaleta real NO porta `horaSortidaOnAir` (el camp no
        // existeix al repo): la sortida OnAir es DERIVA de `horaEntradaOnAir +
        // durada`. Per això la durada de l'ítem 00 és 0:22 (finestra 72000→72022).
        { sequencia: 10, num: '00', titol: 'INICI', agrupacio: null, durada: '0:22',
          horaEntradaOnAir: '20:00:00', teVideo: true },
        { sequencia: 20, num: '01', titol: 'CRÒNICA', agrupacio: 'BLOQUE 3', durada: '3:00',
          horaEntradaPrevista: '20:01:00', horaSortidaPrevista: '20:04:00', teVideo: true },
        { sequencia: 30, num: '02DP', titol: 'IPD METEOROLOGIA', agrupacio: null, durada: '0:30', teVideo: true },
        { sequencia: 40, num: '03', titol: 'SUMARI', agrupacio: null, durada: '' }
    ];
    await AN.saveEscaleta(ctx, 'escaleta_TNV_V1.json', LINES,
        { prevVideoItem: { num: 'M1' }, nextVideoItem: { num: 'M2' } },
        { inSec: 1.5, outSec: 99 });

    ok('escriptura via IO.writeTxt (respatller JSX)', window.__JSX.some(function (s) { return s.indexOf('IO.writeTxt(') === 0; }));
    ok('manifest .fastpass.json escrit al disc', typeof FILES[MPATH] === 'string' && FILES[MPATH].length > 100,
        FILES[MPATH] ? FILES[MPATH].length + ' bytes' : 'ABSENT');
    ok('mirall analisis_estructura/*.json escrit', typeof FILES[MIRROR] === 'string',
        FILES[MIRROR] ? FILES[MIRROR].length + ' bytes' : 'ABSENT');

    var txt = FILES[MPATH] || '';
    ok('manifest en PRETTY-PRINT (salt de línia real, no \\n literal)',
        txt.indexOf('\n  "_version"') > 0 && txt.replace(/[^\n]/g, '').length > 50,
        JSON.stringify(txt.slice(0, 40)));
    var mm = null;
    try { mm = JSON.parse(txt); } catch (eP) { mm = null; }
    ok('manifest és JSON vàlid', !!mm);
    mm = mm || {};


    // ── 2. FASE MEDIA (clips de V1 = veritat física) ───────────────────────
    ph('2-media');
    await AC.writeMedia(ctx, [
        { name: '00_INICI.mxf', start: 72000, end: 72022, inPoint: 0 },
        { name: 'FUERA_DE_BLOC.mxf', start: 100, end: 200, inPoint: 0 },
        { name: '01A_CRONICA.mxf', start: 72070, end: 72130, inPoint: 12.5 },
        { name: '02DP_IPD.mxf', start: 72250, end: 72265, inPoint: 0 }
    ], { track: 1, label: 'Clips.getTrackClips' });
    mm = (SM._cache[MPATH] || {});
    ok('media.clipsV1 = 4 clips', !!(mm.media && mm.media.clipsV1.length === 4 && mm.media.clipCount === 4));
    ok('media.firstStartSec/lastEndSec', mm.media.firstStartSec === 72000 && mm.media.lastEndSec === 72265,
        [mm.media.firstStartSec, mm.media.lastEndSec].join('->'));

    // ── 3. FASE MARKERS (snapshot cru -> font dels TCs) ───────────────────
    ph('3-markers');
    await AC.writeMarkers(ctx, [
        { time: 20, comments: '00 · INICI', color: 1 },
        { time: 1200.5, comments: '02DP · IPD METEOROLOGIA', color: 7 }
    ], { source: 'Markers.get' });
    mm = (SM._cache[MPATH] || {});
    ok('markers.list = 2 marcadors', !!(mm.markers && mm.markers.list.length === 2));
    ok('marker num/digits derivats del comentari',
        mm.markers.list[1].num === '02DP' && mm.markers.list[1].numDigits === '02',
        mm.markers.list[1].num + '/' + mm.markers.list[1].numDigits);
    ok('marker tc calculat amb fps 25', mm.markers.list[1].tc === '00:20:00:12', mm.markers.list[1].tc);

    // ── 4. RETOLS COL·LOCATS (writeChyronsPlaced + dedup) ─────────────────
    ph('4-chyrons');
    await AC.writeChyronsPlaced(ctx, [
        AC.record('RT00_ESTRUCTURA', 3, 72005, 72015, { num: '00', tipus: 'RETOL', itemNum: '00' }),
        AC.record('RT03_SUMARI', 3, 5000, 5010, { num: '03', tipus: 'RETOL', itemNum: '03' })
    ], { bin: 'RETOLS_V1' });
    await AC.writeChyronsPlaced(ctx, [
        AC.record('RT00_ESTRUCTURA', 3, 72005, 72018, { num: '00', tipus: 'RETOL', itemNum: '00' })
    ]);
    mm = (SM._cache[MPATH] || {});
    ok('chyrons.placed deduplicat per num|name|track (2, no 3)',
        mm.chyrons.placed.length === 2 && mm.chyrons.countPlaced === 2, String(mm.chyrons.placed.length));
    ok('la re-col·locacio ACTUALITZA el registre (endSec 72018)',
        mm.chyrons.placed[0].endSec === 72018 && mm.chyrons.placed[0].durSec === 13,
        JSON.stringify([mm.chyrons.placed[0].endSec, mm.chyrons.placed[0].durSec]));
    ok('chyrons.bin preservat del 1r pedac', mm.chyrons.bin === 'RETOLS_V1', String(mm.chyrons.bin));

    // ── 5. GRAFISMES ──────────────────────────────────────────────────────
    ph('5-graphics');
    await AC.writeGraphics(ctx, [
        AC.record('TITOLET_00', 4, 72010, 72012, { num: '00', tipus: 'TITOLET', itemNum: '00' }),
        AC.record('CEP_03', 4, 9000, 9010, { num: '03', tipus: 'CEP', itemNum: '03' })
    ]);
    mm = (SM._cache[MPATH] || {});
    ok('graphics.list = 2 grafismes', mm.graphics.list.length === 2);

    ok('esquema migrat/creat a _version 2.0', mm._version === '2.0', mm._version);
    ok('analysis.escaleta.itemsBloc 4 ítems', !!(mm.analysis && mm.analysis.escaleta && mm.analysis.escaleta.itemsBloc.length === 4),
        mm.analysis && mm.analysis.escaleta ? mm.analysis.escaleta.itemsBloc.length : 'n/a');
    ok('analysis.meta.phases.escaleta = true', !!(mm.analysis && mm.analysis.meta && mm.analysis.meta.phases.escaleta === true));
    ok('no-ASCII sobreviu al pont JSX (titol CRONICA)',
        !!(mm.analysis && mm.analysis.escaleta && mm.analysis.escaleta.itemsBloc[1].titol === 'CR\u00d2NICA'),
        mm.analysis && mm.analysis.escaleta ? JSON.stringify(mm.analysis.escaleta.itemsBloc[1].titol) : 'n/a');
    ok('contextItems/trimBounds desats',
        !!(mm.analysis.escaleta.itemsContexte.prevVideoItem.num === 'M1' && mm.analysis.escaleta.trimBounds.outSec === 99));

    var mirrorObj = null;
    try { mirrorObj = JSON.parse(FILES[MIRROR] || 'null'); } catch (eM) { mirrorObj = null; }
    ok('mirall = copia exacta de manifest.analysis (pretty-print sobreviu)',
        !!mirrorObj && JSON.stringify(mirrorObj) === JSON.stringify(mm.analysis),
        mirrorObj ? 'claus: ' + Object.keys(mirrorObj).join(',') : 'mirall illegible');



    // ── 6. FASES crudo/cocinado (merge profund de sub-dades) ──────────────
    ph('6-phases');
    await AN.appendPhase(ctx, 'crudo', {
        inout: { '00': { inSec: 1, outSec: 5 } },
        marks: [ { num: '00', inSec: 2, outSec: 8, color: 4 } ]
    });
    await AN.appendPhase(ctx, 'crudo', { marks: [ { num: '01', inTc: '20:01:10:00', outTc: '20:01:20:00' } ] });
    await AN.appendPhase(ctx, 'cocinado', { marks: { list: [ { num: '02DP', inTc: '00:20:01:00', color: 6 } ] } });
    mm = (SM._cache[MPATH] || {});
    ok('crudo.inout de la 1a crida preservat pel merge', mm.analysis.crudo.inout['00'].outSec === 5);
    ok('crudo.marks es LLISTA -> la 2a crida la substitueix (no barreja)',
        mm.analysis.crudo.marks.length === 1 && mm.analysis.crudo.marks[0].num === '01',
        JSON.stringify(mm.analysis.crudo.marks.map(function (r) { return r.num; })));
    ok('cocinado.marks.list acceptat (forma {list:[]})', mm.analysis.cocinado.marks.list.length === 1);

    // ── 7. VISTA MESTRA (structure.items) ─────────────────────────────────
    ph('7-structure');
    var st = mm.structure;
    ok('structure.count = 4 items', st.count === 4, String(st.count));
    ok('structure.source (markers/clipsV1/chyronsPlaced/graphics/escaletaItems)',
        st.source.markers === 2 && st.source.clipsV1 === 4 && st.source.chyronsPlaced === 2 &&
        st.source.graphics === 2 && st.source.escaletaItems === 4, JSON.stringify(st.source));
    ok('structure.source.itemsFrom = mirall-analisi (sense master encara)',
        st.source.itemsFrom === 'mirall-analisi', String(st.source.itemsFrom));

    var i0 = st.items[0], i1 = st.items[1], i2 = st.items[2], i3 = st.items[3];
    ok('item 00 · classe ESTRUCTURAL / color VERMELL / ungrouped',
        i0.classe === 'ESTRUCTURAL' && i0.colorIdx === 1 && i0.ungrouped === true,
        [i0.classe, i0.colorIdx, i0.ungrouped].join('|'));
    ok('item 00 · finestra onAir 72000->72022',
        i0.window.source === 'onAir' && i0.window.inSec === 72000 && i0.window.outSec === 72022,
        JSON.stringify(i0.window));
    ok('item 00 · TC del MARCADOR (00:00:20:00)', i0.tc === '00:00:20:00' && i0.marker.timeSec === 20, i0.tc);
    ok('item 00 · markerPrevist null (ja hi ha marcador)', i0.markerPrevist === null);
    ok('item 00 · 1 clip dins la finestra (00_INICI)',
        i0.clips.length === 1 && i0.clips[0].name === '00_INICI.mxf' && i0.clips[0].overlapSec === 22,
        JSON.stringify(i0.clips.map(function (c) { return c.name; })));
    ok('item 00 · 1 retol + 1 grafic', i0.chyrons.length === 1 && i0.graphics.length === 1,
        i0.chyrons.length + '+' + i0.graphics.length);
    ok('item 00 · marks.crudo BUID (la 2a crida del crudo SUBSTITUEIX la llista)',
        !!(i0.marks && i0.marks.crudo === null),
        JSON.stringify(i0.marks && i0.marks.crudo));
    ok('item 00 · escaleta original dins la vista', !!(i0.escaleta && i0.escaleta.num === '00'));

    ok('item 01 · finestra prevista 72060->72240 + color BLAU (agrupacio)',
        i1.window.source === 'prevista' && i1.window.inSec === 72060 && i1.window.outSec === 72240 && i1.colorIdx === 6,
        JSON.stringify(i1.window) + '|' + i1.colorIdx);
    ok('item 01 · markerPrevist present (encara no hi ha marcador)',
        !!(i1.marker === null && i1.markerPrevist && i1.markerPrevist.colorIdx === 6),
        JSON.stringify(i1.markerPrevist && i1.markerPrevist.colorIdx));
    ok('item 01 · 1 clip (01A_CRONICA)', i1.clips.length === 1 && i1.clips[0].name === '01A_CRONICA.mxf',
        i1.clips.length + '');
    ok('item 01 · marks.crudo normalitzat des de TC (inSec 72070 / durSec 10)',
        !!(i1.marks.crudo && i1.marks.crudo.inSec === 72070 && i1.marks.crudo.durSec === 10),
        JSON.stringify(i1.marks.crudo && [i1.marks.crudo.inSec, i1.marks.crudo.durSec]));

    ok('item 02DP · finestra DEDUIDA encadenada (72240->72270)',
        i2.window.source === 'deduida' && i2.window.inSec === 72240 && i2.window.outSec === 72270,
        JSON.stringify(i2.window));
    ok('item 02DP · classe IPD / color TURQUESA', i2.classe === 'IPD' && i2.isIpd === true && i2.colorIdx === 7,
        [i2.classe, i2.colorIdx].join('|'));
    ok('item 02DP · TC del marcador 1200,5 s (00:20:00:12)', i2.tc === '00:20:00:12', i2.tc);
    ok('item 02DP · 1 clip dins la finestra deduida',
        i2.clips.length === 1 && i2.clips[0].name === '02DP_IPD.mxf', i2.clips.length + '');
    ok('item 02DP · marks.cocinado via {list:[]} + TC 1201',
        !!(i2.marks.cocinado && i2.marks.cocinado.inSec === 1201), JSON.stringify(i2.marks.cocinado && i2.marks.cocinado.inSec));

    ok('item 03 · classe GRAFIC / color GROC', i3.classe === 'GRAFIC' && i3.colorIdx === 4 && i3.ungrouped === false,
        [i3.classe, i3.colorIdx].join('|'));
    ok('item 03 · TC buit i markerPrevist null (sense hora ni marcador)',
        i3.tc === '' && i3.markerPrevist === null && i3.marker === null);
    ok('item 03 · finestra 72270->72270 -> cap clip', i3.window.inSec === 72270 && i3.clips.length === 0);
    ok('item 03 · retol i grafic lligats pel NUM (fora de finestra)',
        i3.chyrons.length === 1 && i3.graphics.length === 1, i3.chyrons.length + '+' + i3.graphics.length);

    ok('findItem("02") resol el 02DP pels digits', (AC.findItem(mm, '02') || {}).num === '02DP');
    ok('getItems() retorna el master d\'escaleta', SM.getItems(mm).length === 4);


    // ── 8. markPhase + relectura del disc ────────────────────────────────
    ph('8-markPhase+reload');
    await AC.markPhase(ctx, 'markersPlaced');
    mm = (SM._cache[MPATH] || {});
    ok('phases.markersPlaced = true', mm.phases.markersPlaced === true);

    SM._cache = {};                                  // obliga a rellegir del "disc"
    var rr = await SM.load(ctx, true);
    ok('recarrega del disc: _version 2.0 · 4 items (upstream mirall)',
        rr._version === '2.0' && SM.getItems(rr).length === 4 && rr.structure.items.length === 4 &&
        SM.getItemsSource(rr) === 'mirall-analisi',
        rr._version + '/' + SM.getItems(rr).length + ' via ' + SM.getItemsSource(rr));
    ok('recarrega: structure.items 4 + seccions preservades',
        rr.structure.items.length === 4 && rr.markers.list.length === 2 &&
        rr.chyrons.placed.length === 2 && rr.graphics.list.length === 2,
        [rr.structure.items.length, rr.markers.list.length, rr.chyrons.placed.length, rr.graphics.list.length].join('|'));

    // ── 9. MIGRACIO d'un manifest v1.0 (nomes escaleta) ──────────────────
    ph('9-migracio');
    var ctx1 = {
        dateDir: '15_10_2026_TNV', bloque: 'V2',
        progData: { archivo: 'TNV', wott: 'TNV', directorio: 'TNV_PROJECTES' },
        config: { rutas: { destinoBase: 'C:/TMP/NAS/' } }
    };
    var p1 = SM.getPath(ctx1);
    FILES[p1] = JSON.stringify({
        _version: '1.0',
        escaletaItems: [ { num: '05', titol: 'SUMARI', durada: '0:10', horaEntradaPrevista: '20:05:00' } ],
        ref: { fps: 25 }
    }, null, 2);
    var old = await SM.load(ctx1, true);
    ok('migracio v1.0 -> 2.0 sense perdre l\'escaleta',
        old._version === '2.0' && old.escaletaItems.length === 1 && !!old.markers && !!old.structure, old._version);
    var rebuilt = await SM.saveSection(ctx1, 'escaletaItems', old.escaletaItems, { reason: 'migracio' });
    ok('saveSection() recompon structure (rebuild -> AnalysisCenter)',
        rebuilt.structure.items.length === 1 && rebuilt.structure.items[0].window.source === 'prevista',
        JSON.stringify(rebuilt.structure.items[0] && rebuilt.structure.items[0].window));
    ok('upstream de l\'escaleta = master (escaletaItems desat)',
        SM.getItemsSource(rebuilt) === 'master', String(SM.getItemsSource(rebuilt)));
    ok('v1.0 heretat: seccions noves escrites al disc',
        typeof FILES[p1] === 'string' && FILES[p1].indexOf('"markers"') > 0 && FILES[p1].indexOf('"structure"') > 0);

    // ── 9b. La VISTA sempre es deriva de l'escaleta MARE (no de si mateixa) ──
    // Regressió: `composeStructure` llegia `getItems()` (que prefereix la vista
    // `structure`), per tant en reescriure el master (2n «Muntar») o desar el
    // mirall de l'anàlisi, la vista es recompomava amb les dades VELLES.
    var loopMan = {
        _version: '2.0',
        escaletaItems: [{ num: '01', titol: 'NOU', durada: '0:30', horaEntradaPrevista: '02:00:00' }],
        structure: {
            items: [{
                escaleta: { num: '01', titol: 'VELL', durada: '0:30', horaEntradaPrevista: '01:00:00' },
                window: { inSec: 3600, outSec: 3630, source: 'prevista' }
            }],
            count: 1
        }
    };
    AC.rebuild(loopMan, { reason: 'regressio-realimentacio' });
    ok('rebuild: la vista s\'ha de derivar del MASTER, no de la vista vella',
        loopMan.structure.items[0].titol === 'NOU' && loopMan.structure.items[0].window.inSec === 7200,
        loopMan.structure.items[0].titol + '@' + loopMan.structure.items[0].window.inSec);
    ok('rebuild: l\'escaleta de la vista és el MATEIX objecte que el master',
        loopMan.structure.items[0].escaleta === loopMan.escaletaItems[0]);
    // Sense master ni mirall, la vista existent es recompon sobre si mateixa (idempotent)
    var loopOnly = { _version: '2.0', structure: { items: [{ escaleta: { num: '04', durada: '0:10', horaEntradaPrevista: '03:00:00' } }], count: 1 } };
    AC.rebuild(loopOnly, { reason: 'idempotent' });
    ok('rebuild sense master: recompon des de la vista (idempotent, 1 item)',
        loopOnly.structure.items.length === 1 && loopOnly.structure.items[0].window.inSec === 10800,
        JSON.stringify(loopOnly.structure.items[0].window));

    // ── 10. Mirall de text llegible ──────────────────────────────────────
    ph('10-mirror-text');
    var mt = AC.mirrorAllTxt(mm);
    ok('mirrorAllTxt inclou marcadors + taula per item',
        mt.indexOf('SNAPSHOT MARCADORS') === 0 && mt.indexOf('VISTA PER') > 0 && mt.indexOf('02DP') > 0,
        mt.split('\n')[0]);

    // ── 11. AssemblyContext (F6): accés unificat als ítems del manifest ──
    ph('11-assembly-context');
    var ASM = window.FASTPASS_UI.Core.AssemblyContext;
    ok('AssemblyContext carregat amb el helper _itemsOf', !!(ASM && typeof ASM._itemsOf === 'function'));
    ok('_itemsOf() delega a getItems() (vista structure, 4 items)',
        ASM._itemsOf(mm).length === 4, String(ASM._itemsOf(mm).length));
    var asmMasterFirst = { escaletaItems: [{ num: '07', agrupacio: 'V1' }], analysis: { escaleta: { itemsBloc: [{ num: '08' }] } } };
    ok('_itemsOf(): el master «Muntar» mana sobre el mirall',
        ASM._itemsOf(asmMasterFirst)[0].num === '07', ASM._itemsOf(asmMasterFirst)[0].num);
    var asmStructFirst = { structure: { items: [{ escaleta: { num: '09' } }] }, escaletaItems: [{ num: '07' }] };
    ok('_itemsOf(): la vista structure té prioritat sobre les dues fonts',
        ASM._itemsOf(asmStructFirst)[0].num === '09', ASM._itemsOf(asmStructFirst)[0].num);
    ok('_itemsOf(): manifest buit o null → [] (sense excepció)',
        ASM._itemsOf(null).length === 0 && ASM._itemsOf({}).length === 0);
    // El mirall d'anàlisi és el que fa que el context funcioni ABANS del «Muntar»
    var asmMirrorOnly = { analysis: { escaleta: { itemsBloc: [{ num: '03', agrupacio: 'V1', flotant: false }] } } };
    ok('_itemsOf(): sense master, llegeix el mirall d\'anàlisi (pre-Muntar)',
        ASM._itemsOf(asmMirrorOnly).length === 1 && ASM._itemsOf(asmMirrorOnly)[0].num === '03');
    ok('getItemsSource() distingeix el mirall del master',
        SM.getItemsSource(asmMirrorOnly) === 'mirall-analisi' && SM.getItemsSource(asmMasterFirst) === 'master',
        SM.getItemsSource(asmMirrorOnly) + '/' + SM.getItemsSource(asmMasterFirst));

    // ── 12. flow_markers (F6): lectura unificada via itemsOf → getItems() ──
    ph('12-flow-markers');
    var FM = window.FASTPASS_UI.Workflows && window.FASTPASS_UI.Workflows.Markers;
    ok('flow_markers carregat (Workflows.Markers)',
        !!(FM && typeof FM._colorByNumFromManifest === 'function'));
    // Manifest SENSE escaletaItems ni mirall: només la vista structure.
    // Si quedés cap lectura directa de manifest.escaletaItems, sortiria buit.
    var fmStructOnly = {
        structure: {
            items: [
                { escaleta: { num: '05', titol: 'SUBMARI', agrupacio: 'v1' } },
                { escaleta: { num: '06', titol: 'GF' } }
            ]
        }
    };
    var fmCols = FM._colorByNumFromManifest(fmStructOnly);
    ok('_colorByNumFromManifest llegeix la VISTA structure (2 nums)',
        Object.keys(fmCols).length === 2 && fmCols['05'] !== undefined && fmCols['06'] !== undefined,
        JSON.stringify(fmCols));
    var fmMirrorOnly = { analysis: { escaleta: { itemsBloc: [{ num: '07', agrupacio: 'v1' }] } } };
    ok('_colorByNumFromManifest cau al mirall (pre-Muntar)',
        Object.keys(FM._colorByNumFromManifest(fmMirrorOnly)).length === 1,
        JSON.stringify(FM._colorByNumFromManifest(fmMirrorOnly)));
    ok('_colorByNumFromManifest amb manifest buit → {} (sense excepció)',
        Object.keys(FM._colorByNumFromManifest({})).length === 0 &&
        Object.keys(FM._colorByNumFromManifest(null)).length === 0);

    // ── 12b. F8·Separació (2026-10-27 · BUG #192): MAI dos marcadors superposats ──
    // Regla imperativa d'usuari: si dos marcadors coincidixen, se separen uns segons
    // i es deixen en ORDE D'ESCALETA. Cas real TNM_V1 26/10: F2 va fer «01dir»
    // marcador d'inici a 00:00 i F7 hi va afegir «01 TE-1», «01 TD-1» i «01BT» al
    // MATEIX 0,00 s (4 marcadors superposats, i 01dir és el 4t de l'escaleta).
    // (#248 · 06/11) DINS del clúster mana la JERARQUIA, no l'orde d'escaleta:
    //   OnAir → estructura → gràfic. Un gràfic MAI desplaça un estructural.
    ph('12b-f8-separacio');
    ok('F8: separateOverlappingMarkers + _calcSeparacioSuperposats (GAP 3 s)',
        !!(FM && typeof FM.separateOverlappingMarkers === 'function' &&
           typeof FM._calcSeparacioSuperposats === 'function') && FM._GAP_SEPARACIO === 3,
        typeof FM);
    var f8Cluster = [
        { prefix: '01dir', time: 0, seq: 28, comment: '01dir - conn MARTA MARTORELL', color: 6 },
        { prefix: '02', time: 41.56, seq: 30, comment: '02 - +++IPD ALDARULLS', color: 7 },
        { prefix: '01 TE-1', time: 0, seq: 25, comment: '01 TE-1 - TE ALDARULLS', color: 4 },
        { prefix: '03', time: 67.92, seq: 31, comment: '03 - +++IPD VERTICALS', color: 7 },
        { prefix: '01BT', time: 0, seq: 27, comment: '01BT - PG bona tarda', color: 6 },
        { prefix: '01 TD-1', time: 0, seq: 26, comment: '01 TD-1 - TD ALDARULLS', color: 4 }
    ];
    var f8a = FM._calcSeparacioSuperposats(f8Cluster, { gap: 3, tol: 0.20 });
    ok('F8: 4 marcadors a 0,00 s → se n\'hi mouen 3 (el 1r ESTRUCTURAL es queda)',
        f8a.length === 3, JSON.stringify(f8a));
    ok('F8·#248: JERARQUIA · estructura mana → 01dir@3 · 01 TE-1@6 · 01 TD-1@9',
        f8a.length === 3 && f8a[0].prefix === '01dir' && f8a[0].timeSec === 3 &&
        f8a[1].prefix === '01 TE-1' && f8a[1].timeSec === 6 &&
        f8a[2].prefix === '01 TD-1' && f8a[2].timeSec === 9,
        JSON.stringify(f8a.map(function (p) { return p.prefix + '@' + p.timeSec; })));
    ok('F8·#248: el marcador ESTRUCTURAL (01BT) es queda al 00:00',
        !f8a.some(function (p) { return p.prefix === '01BT'; }));
    // (#248) Cas real TNV_V4 06/11: un groc (gràfic) al 00:00 desplaçava el
    // marcador estructural del 00:00 (i el treia de lloc). El gràfic cedix.
    var f8V4 = FM._calcSeparacioSuperposats([
        { prefix: '01dir', time: 0, seq: 28, color: 6 },
        { prefix: '01 GF-1', time: 0, seq: 10, color: 4 }
    ], { gap: 3, tol: 0.20 });
    ok('F8·#248: el gràfic al 00:00 se\'n va a +3 s i l\'estructural es queda',
        f8V4.length === 1 && f8V4[0].prefix === '01 GF-1' && f8V4[0].timeSec === 3,
        JSON.stringify(f8V4));
    ok('F8: cap posició es repeteix (ni amb el marcador que es queda)',
        (function () {
            var ts = [0].concat(f8a.map(function (p) { return p.timeSec; }))
                .sort(function (a, b) { return a - b; });
            for (var i = 1; i < ts.length; i++) { if (ts[i] - ts[i - 1] < 0.5) return false; }
            return true;
        })(), JSON.stringify(f8a.map(function (p) { return p.timeSec; })));
    ok('F8: marcadors ja separats (01dir/02 i 02/03) → cap canvi',
        FM._calcSeparacioSuperposats([f8Cluster[0], f8Cluster[1]]).length === 0 &&
        FM._calcSeparacioSuperposats([f8Cluster[1], f8Cluster[3]]).length === 0);
    var f8Pinned = FM._calcSeparacioSuperposats([
        { prefix: '010', time: 41.56, seq: 29, color: 6 },
        { prefix: '02', time: 41.56, seq: 30, color: 7, pinned: true }
    ], { gap: 3 });
    ok('F8: el marcador amb OnAir NO es mou (l\'altre passa a +3 s)',
        f8Pinned.length === 1 && f8Pinned[0].prefix === '010' && f8Pinned[0].timeSec === 44.56,
        JSON.stringify(f8Pinned));
    var f8Tight = FM._calcSeparacioSuperposats([
        { prefix: 'A', time: 0, seq: 1, color: 6 },
        { prefix: 'B', time: 0, seq: 2, color: 6 },
        { prefix: 'C', time: 2, seq: 3, color: 6 }
    ], { gap: 3 });
    ok('F8: clúster amb poc espai → GAP reduït i 0,5 s de marge amb el següent',
        f8Tight.length === 1 && f8Tight[0].prefix === 'B' && f8Tight[0].timeSec === 1.5,
        JSON.stringify(f8Tight));
    ok('F8: sense escaleta (seq null) o <2 marcadors → []',
        FM._calcSeparacioSuperposats([{ prefix: 'X', time: 0 }, { prefix: 'Y', time: 0 }]).length === 0 &&
        FM._calcSeparacioSuperposats([]).length === 0);

    // ── 12b-bis. BUG #250 (2026-11-09): el 00:00 és de l'INICI, no d'un ítem aliè ──
    // Cas real TNM_V3 08/11 (`FASTPASS.log` 10:33:09-10): `20 +++IPD EIZENKOT+++` (ítem
    // SENSE agrupació, durada 0:00) cau fora del clip (-18,16 s) i el clamp de
    // `placeUngroupedMarkers` el clavava a 0,00; F8 separava el clúster i movia el
    // marcador d'INICI `22i intro` (1r estructural del bloc) a 00:00:03:00.
    // Ara: (a) la fase de no agrupats no el col·loca; (b) si de cas hi arriba, F8
    // desplaça l'ALIÈ i l'inici es queda al 00:00.
    ph('12b-bis-bug250-inici-zero');
    var f250 = FM._calcSeparacioSuperposats([
        { prefix: '20', time: 0, seq: 69, comment: '20 - +++IPD EIZENKOT+++', color: 7 },
        { prefix: '22i', time: 0, seq: 70, comment: '22i - intro', color: 6, inici: true }
    ], { gap: 3, tol: 0.20 });
    ok('#250: amb `inici` el 00:00 es queda a l\'inici del bloc i l\'ítem aliè va a +3 s',
        f250.length === 1 && f250[0].prefix === '20' && f250[0].timeSec === 3,
        JSON.stringify(f250.map(function (p) { return p.prefix + '@' + p.timeSec; })));
    var f250no = FM._calcSeparacioSuperposats([
        { prefix: '20', time: 0, seq: 69, color: 7 },
        { prefix: '22i', time: 0, seq: 70, color: 6 }
    ], { gap: 3, tol: 0.20 });
    ok('#250: regressió documentada · sense el flag `inici` guanyava l\'aliè (seq 69) i l\'inici anava a 3 s',
        f250no.length === 1 && f250no[0].prefix === '22i' && f250no[0].timeSec === 3,
        JSON.stringify(f250no.map(function (p) { return p.prefix + '@' + p.timeSec; })));
    ok('#250: `_potOcuparElZero` barra el 00:00 a tot el que no és l\'inici',
        typeof FM._potOcuparElZero === 'function' &&
        FM._potOcuparElZero('20', '22i') === false &&
        FM._potOcuparElZero('22i', '22i') === true &&
        FM._potOcuparElZero('22I', '22i') === true &&
        FM._potOcuparElZero('20', null) === true &&
        FM._potOcuparElZero('', '22i') === false,
        'tipus=' + typeof FM._potOcuparElZero);

    // ── 12c. BUG #193 (2026-10-27): inici del bloc i finestres degenerades ──
    // Cas real TNM_V1 26/10: `01 TE-1`/`01 TD-1` són GRAFICS (classe=GRAFIC al manifest)
    // però arriben SENSE hora (escaleta_bounds els anul·la la Prevista) → queien a
    // `unplacedItems`; `01BT` (capçalera, també sense hora) no era candidata a inici i el
    // 🔒 requeia en `01dir` → 4 marcadors a 0,00 s. R1+R2 ho tanquen a l'origen; R4 obri
    // la finestra degenerada de F5 i encadena durades.
    ph('12c-bug193-inici-bloc');
    var f193Lines = [
        { num: '01 TE-1', titol: 'TE ALDARULLS', horaEntradaOnAir: '00:00:00', horaEntradaPrevista: '', durada: '0:00', agrupacio: '01', sequencia: 25 },
        { num: '01 TD-1', titol: 'TD ALDARULLS', horaEntradaOnAir: '', horaEntradaPrevista: '', durada: '0:00', agrupacio: '01', sequencia: 26 },
        { num: '01BT', titol: 'PG bona tarda', horaEntradaOnAir: '', horaEntradaPrevista: '', durada: '0:33', agrupacio: '01', sequencia: 27 },
        { num: '01dir', titol: 'conn MARTA MARTORELL', horaEntradaOnAir: '14:32:13', horaEntradaPrevista: '14:32:13', durada: '0:07', agrupacio: '01', sequencia: 28 }
    ];
    var f193c = FM._classifyItems(f193Lines);
    var _f193nums = function (arr) { return (arr || []).map(function (l) { return l.num; }); };
    ok('#193/R1: els gràfics de capçalera SENSE hora van a graphicItems (no a unplacedItems)',
        _f193nums(f193c.graphicItems).indexOf('01 TE-1') !== -1 &&
        _f193nums(f193c.graphicItems).indexOf('01 TD-1') !== -1 &&
        _f193nums(f193c.unplacedItems).indexOf('01 TE-1') === -1 &&
        _f193nums(f193c.unplacedItems).indexOf('01 TD-1') === -1,
        JSON.stringify({ g: _f193nums(f193c.graphicItems), u: _f193nums(f193c.unplacedItems) }));
    ok('#193/R1: 1 estructural (01dir) · 2 gràfics · 1 sense hora (01BT)',
        f193c.structuralItems.length === 1 && _f193nums(f193c.structuralItems)[0] === '01dir' &&
        f193c.graphicItems.length === 2 && f193c.unplacedItems.length === 1 &&
        _f193nums(f193c.unplacedItems)[0] === '01BT',
        JSON.stringify({ s: _f193nums(f193c.structuralItems), g: _f193nums(f193c.graphicItems), u: _f193nums(f193c.unplacedItems) }));
    var f193horaRef = function (it) { return (it && it.horaEntradaOnAir === '14:32:13') ? 0 : null; };
    var f193pick = FM._pickStartItem(f193c.structuralItems, [], f193horaRef, f193c.graphicItems, f193c.unplacedItems);
    ok('#193/R2: el marcador d\'inici és 01BT (capçalera sense hora, seq 27), NO 01dir',
        f193pick && f193pick.num === '01BT', JSON.stringify(f193pick && f193pick.num));
    var f193pick2 = FM._pickStartItem([
        { num: '03', horaEntradaOnAir: '14:35:00', durada: '0:20', sequencia: 31 },
        { num: '01dir', horaEntradaOnAir: '14:32:13', durada: '0:07', sequencia: 28 }
    ], [], f193horaRef, [], [{ num: '01BT', durada: '0:33', sequencia: 27 }]);
    ok('#193/R2: amb candidats desordenats mana `sequencia` (01BT, seq 27)',
        f193pick2 && f193pick2.num === '01BT', JSON.stringify(f193pick2 && f193pick2.num));
    var f193pick3 = FM._pickStartItem(f193c.structuralItems, [], f193horaRef, f193c.graphicItems);
    ok('#193/R2: crida antiga (sense el 5é argument) no trenca: tria 01dir',
        f193pick3 && f193pick3.num === '01dir', JSON.stringify(f193pick3 && f193pick3.num));

    var f193ord = [{ num: '01BT', durada: '0:33' }, { num: '01dir', durada: '0:07' }, { num: '02', durada: '0:18' }];
    var f193oidx = { '01BT': 0, '01dir': 1, '02': 2 };
    var f193dur = function (it) {
        var p = String((it && it.durada) || '0:00').split(':').map(Number);
        return (p.length === 2 && !isNaN(p[0]) && !isNaN(p[1])) ? p[0] * 60 + p[1] : 0;
    };
    var f193D = FM._cadenaDuradesSec(f193ord, f193oidx, '01BT', 1, 0, f193dur);
    ok('#193/R4: cadena de durades · 01BT@0 (33 s) → 01dir a 33,00 s',
        f193D && Math.abs(f193D.time - 33) < 0.01, JSON.stringify(f193D));
    ok('#193/R4: cadena impossible (sense veí, ítem 1r, o durades 0) → null',
        FM._cadenaDuradesSec(f193ord, f193oidx, null, 1, 0, f193dur) === null &&
        FM._cadenaDuradesSec(f193ord, f193oidx, '01BT', 0, 0, f193dur) === null &&
        FM._cadenaDuradesSec([{ num: '01BT', durada: '0:00' }, { num: '01dir' }], f193oidx, '01BT', 1, 0, f193dur) === null);
    var f193w1 = FM._hiFinestraInferida('01dir', '01dir', 0, 70);
    ok('#193/R4: finestra [x → x] → s\'obri fins al final del bloc (70 s)',
        f193w1.degenerada === true && f193w1.hi === 70 && f193w1.nextNum === null, JSON.stringify(f193w1));
    var f193w2 = FM._hiFinestraInferida('01BT', '02', 41.56, 70);
    ok('#193/R4: finestra normal intacta (01BT@0 → 02@41,56)',
        f193w2.degenerada === false && f193w2.hi === 41.56 && f193w2.nextNum === '02', JSON.stringify(f193w2));
    ok('#193/R4: sense veí següent → final del bloc',
        FM._hiFinestraInferida('01BT', null, null, 70).hi === 70);

    // ── #193·R6: una hora FORA del material no pot situar cap marcador ──
    // Cas real TNM_V1 27/10: 01dir (Prevista 14:32:14 = 52334 s) → el clip comença a
    // 14:32:22,9 (52342,92) → F2 calculava -8,92 s, clavava a 00:00 i F8 separava a 3 s.
    var f193r6Lines = [
        { num: '01BT', titol: 'PG bona tarda', horaEntradaOnAir: '', horaEntradaPrevista: '', durada: '0:33', agrupacio: '01', sequencia: 27 },
        { num: '01dir', titol: 'conn MARTA MARTORELL', horaEntradaOnAir: '', horaEntradaPrevista: '14:32:14', durada: '0:07', agrupacio: '01', sequencia: 28 },
        { num: '02', titol: 'IPD ALDARULLS', horaEntradaOnAir: '14:33:04', horaEntradaPrevista: '14:33:04', durada: '0:26', agrupacio: '01', sequencia: 30 },
        { num: '03', titol: 'IPD VERTICALS', horaEntradaOnAir: '', horaEntradaPrevista: '14:33:30', durada: '0:11', agrupacio: '01', sequencia: 31 }
    ];
    var f193mb = FM._matBoundsSec({ anchorEfectiva: 52384, anchorEfTimelineSec: 41.08 }, [{ start: 0, end: 88 }]);
    ok('#193/R6: _matBoundsSec → el 0 del timeline és el segon 52342,92 del món (88 s de material)',
        f193mb && Math.abs(f193mb.startSec - 52342.92) < 0.01 && Math.abs(f193mb.endSec - 52430.92) < 0.01,
        JSON.stringify(f193mb));
    ok('#193/R6: sense anchors vàlids → _matBoundsSec null',
        FM._matBoundsSec(null, []) === null && FM._matBoundsSec({}, []) === null);
    var f193r6 = FM._classifyItems(f193r6Lines, { matBoundsSec: f193mb });
    var f193r6dir = f193r6.unplacedItems.filter(function (l) { return l.num === '01dir'; })[0];
    ok('#193/R6: Prevista FORA del material (01dir @14:32:14 < 14:32:22,9) → unplacedItems amb flag _foraMaterial',
        _f193nums(f193r6.unplacedItems).indexOf('01dir') !== -1 &&
        !!f193r6dir && f193r6dir._foraMaterial === true &&
        _f193nums(f193r6.structuralItems).indexOf('01dir') === -1,
        JSON.stringify({ u: _f193nums(f193r6.unplacedItems), s: _f193nums(f193r6.structuralItems) }));
    ok('#193/R6: la mateixa escaleta SENSE límits → 01dir seguix estructural (compatibilitat)',
        _f193nums(FM._classifyItems(f193r6Lines).structuralItems).indexOf('01dir') !== -1);
    ok('#193/R6: l\'OnAir no es descarta mai encara que caiga fora del material (02 @14:33:04)',
        _f193nums(f193r6.structuralItems).indexOf('02') !== -1 &&
        _f193nums(f193r6.unplacedItems).indexOf('02') === -1);
    ok('#193/R6: Prevista DINS del material (03 @14:33:30) → es queda estructural',
        _f193nums(f193r6.structuralItems).indexOf('03') !== -1 &&
        _f193nums(f193r6.unplacedItems).indexOf('03') === -1,
        JSON.stringify(_f193nums(f193r6.structuralItems)));

    // ── 12d. BUG #194 (2026-10-27): UN DIRECTE NO PORTA GRÀFICS MAI ──
    // Cas real TNM_V1 26/10 (MARCADORS_2026-10-27_1330): `01 TE-1`@35,82 i `01 TD-1`@37,59
    // s'ancoraven a `01dir`@32,28 → dins de la connexió en directe. El pare de plató és
    // `01BT`@0,00 (DonaPas) → +10/+15 s. `_resolveGraphicParents` és pura (sense JSX).
    ph('12d-bug194-grafics-fora-directe');
    var f194mk = [
        { time: 0, comments: '01BT - PG bona tarda i DONA PAS' },
        { time: 32.28, comments: '01dir - conn MARTA MARTORELL' },
        { time: 39.36, comments: '02 - +++IPD ALDARULLS' }
    ];
    var f194p = FM._resolveGraphicParents(f194mk);
    ok('#194: el pare de la base 01 és 01BT@0,00, MAI el directe 01dir@32,28',
        f194p['01'] === 0 && f194p['01'] !== 32.28, JSON.stringify(f194p));
    ok('#194: les altres bases no es contaminen (02 → 39,36)',
        f194p['02'] === 39.36, JSON.stringify(f194p));
    var f194pDir = FM._resolveGraphicParents([{ time: 32.28, comments: '01dir - conn MARTA MARTORELL' }]);
    ok('#194: si l\'únic marcador del número és un directe → no s\'ancora (sense pare)',
        f194pDir['01'] === undefined, JSON.stringify(f194pDir));
    var f194pDp = FM._resolveGraphicParents([
        { time: 0, comments: '01dp - donapas' },
        { time: 5, comments: '01i - intro' },
        { time: 32.28, comments: '01dir - conn' }
    ]);
    ok('#194: la intro mana sobre el donapas i el directe (01i@5)',
        f194pDp['01'] === 5, JSON.stringify(f194pDp));
    var f194pOff = FM._resolveGraphicParents([
        { time: 8, comments: '02f - off de continuïtat' },
        { time: 20, comments: '02dir - conn' }
    ]);
    ok('#194: l\'off (02f) és pare de plató vàlid i guanya al directe',
        f194pOff['02'] === 8, JSON.stringify(f194pOff));
    var f194pVid = FM._resolveGraphicParents([
        { time: 63, comments: '01 - vídeo propi' },
        { time: 0, comments: '01BT - capçalera' },
        { time: 32.28, comments: '01dir - conn' }
    ]);
    ok('#194: el vídeo propi (01@63) seguix manant quan existix',
        f194pVid['01'] === 63, JSON.stringify(f194pVid));
    var f194pGraf = FM._resolveGraphicParents([
        { time: 0, comments: '01BT - capçalera' },
        { time: 10, comments: '01 TE-1 - TE ALDARULLS' },
        { time: 32.28, comments: '01dir - conn' }
    ]);
    ok('#194: un gràfic ja col·locat no es pren com a pare de si mateix (01BT@0)',
        f194pGraf['01'] === 0, JSON.stringify(f194pGraf));

    // ── 13. flow_mainButton (F6c): un sol helper per a la forma del master ──
    ph('13-flow-mainbutton');
    var MB = window.FASTPASS_UI.Workflows && window.FASTPASS_UI.Workflows.MainButton;
    ok('flow_mainButton carregat (Workflows.MainButton) amb les 4 accions + _fullScan',
        !!(MB && typeof MB._runNew === 'function' && typeof MB._runUpdate === 'function' &&
           typeof MB._runLoad === 'function' && typeof MB._runGo === 'function' &&
           typeof MB._fullScan === 'function'),
        typeof MB);
    ok('flow_mainButton: cap Error de sintaxi (mòdul definit sencer)',
        !!(MB && MB.runMainAction && MB.runReset));


    // ── 14. FAMÍLIES DE RÈTOLS: cap TRADUCCIÓ a les altres fases (TNC V3) ──
    // Bug real (2026-10-15, TNC V3 bloc 14 «FAUNA ALIADA PER L'AGRICULTURA»):
    // `placeChyronNom` filtrava amb `c.name.includes("Nom")` sobre el nom SENCER del
    // fitxer, que inclou el TEXT del rètol → la traducció
    // «…_644349_TRADUCCIO [2-3] Només n'existei…» (conté "Només") se la quedava la
    // fase NOM: la col·locava a V7 (59.72→64.60) damunt del nom-càrrec legítim
    // («Hobun Ikeya_director») i la traducció quedava DUPLICADA (V7 + V8).
    ph('14-chyrons-families');
    var CH = window.FASTPASS_UI.Workflows && window.FASTPASS_UI.Workflows.Chyrons;
    ok('flow_chyrons carregat amb _isTraduccioWott (+ _isEnviatWott)',
        !!(CH && typeof CH._isTraduccioWott === 'function' && typeof CH._isEnviatWott === 'function'));
    var TRAD_TNC = {
        name: "Wott_TNC_v3_14_00.59_FAUNA ALIADA PER L'AGRICULTURA_644349_TRADUCCIO [2-3] Només n'existei.00644934.mov",
        rol: "TRADUCCIO [2-3] Només n'existei",
        tc: "00.59"
    };
    var NOM_TNC = {
        name: "Wott_TNC_v3_14_00.59_FAUNA ALIADA PER L'AGRICULTURA_599162_Nomcarrec_Hobun Ikeya_director.00644930.mov",
        rol: "NOMCARREC",
        tc: "00.59"
    };
    if (CH && typeof CH._isTraduccioWott === 'function') {
        ok('_isTraduccioWott: cas real TNC V3 (rol TRADUCCIO sense accent)',
            CH._isTraduccioWott(TRAD_TNC) === true);
        ok('_isTraduccioWott: TOKEN «TRADUCCIÓ» amb accent al nom',
            CH._isTraduccioWott({ name: 'Wott_TNV_14_00.59_PRG_644349_TRADUCCIÓ [2-3] Hola.006.mov', rol: '' }) === true);
        ok('_isTraduccioWott: rol TRADUCCIÓ (13_Parse accentuat)',
            CH._isTraduccioWott({ name: 'Wott_TNV_14_00.59_PRG_644349_TRADUCCIÓ [2-3] Hola.006.mov', rol: 'TRADUCCIÓ' }) === true);
        ok('_isTraduccioWott: un nom-càrrec NO és traducció', CH._isTraduccioWott(NOM_TNC) === false);
        ok('_isTraduccioWott: "traducció" dins d\'un token no compta',
            CH._isTraduccioWott({ name: 'Wott_TNV_03_01.10_PRG_599170_Nomcarrec_Servei de traducció.006.mov', rol: 'NOMCARREC' }) === false);
        ok('_isTraduccioWott: sense nom ni rol → false (sense excepció)',
            CH._isTraduccioWott(null) === false && CH._isTraduccioWott({}) === false);
    }
    // Filtres REALS dels botons (mateixa expressió que al codi, amb la guarda):
    // la traducció ha de quedar EXCLOSA de NOM/LLOC i només entrar a TRADUCCIÓ.
    // (2026-11-03 · BUG #230, 2a part) La família es decidix pel ROL (`_isNomCarrec` /
    // `_isLlocWott`), no per `name.includes(...)`: el TEXT del rètol viu al nom.
    var filtreNom = function (c) {
        return !CH._isTraduccioWott(c) && CH._isNomCarrec(c);
    };
    var filtreLloc = function (c) {
        return !CH._isTraduccioWott(c) && CH._isLlocWott(c);
    };
    ok('filtre NOM: la traducció de TNC V3 queda EXCLOSA (fix del duplicat a V7)', filtreNom(TRAD_TNC) === false);
    ok('filtre NOM: el nom-càrrec legítim segueix capturat', filtreNom(NOM_TNC) === true);
    ok('filtre LLOC: traducció amb "Lloc" al text queda EXCLOSA',
        filtreLloc({ name: 'Wott_TNV_14_00.59_PRG_644349_TRADUCCIO [1-2] Lloc de treball.006.mov', rol: 'TRADUCCIO [1-2] Lloc de treball' }) === false);
    ok('fase TRADUCCIÓ: la traducció sí que hi entra', CH._isTraduccioWott(TRAD_TNC) === true);
    // ── 14c. BUG #230 (03/11): un GRAFISME CREMAT no entra ni a LLOC ni a NOM ──────
    // Cas real TNM V2 02/11: el TITOLET eixia DOS voltes — una a l'inici de l'ítem
    // (marcador + 0,40 s, SENSE rastreig) i una altra al seu instant detectat. La
    // primera la feia una fase ANTERIOR a RESTO: LLOC/NOM capturen pel TEXT del nom
    // («Nom», «Carrec», «Lloc», «Data») i el NOM del wott porta el TEXT del rètol al
    // camp 5. Després, `_placeTitoletChain` no veia eixa inserció (TC distint) i en
    // col·locava una altra. La família cremada NOMÉS la col·loca la cadena de RESTO.
    ph('14c-bug230-cremat-fora-de-lloc-nom');
    var TITOLET_NOM = {
        name: "Wott_TNM_v2_12_00.00_Només els joves podran accedir-hi_630060_TITOLET_in_setembre.00630065.mov",
        rol: "TITOLET_in_setembre", tc: "00.00"
    };
    var TITOLET_LLOC = {
        name: "Wott_TNM_v2_12_00.00_Lloc de treball i Data del congrés_630061_TITOLET_in.00630066.mov",
        rol: "TITOLET_in", tc: "00.00"
    };
    var DADA_ITEM = {
        name: "Wott_TNM_v2_13_00.00_Nom de la dada_630062_DADA-ITEM_in.00630067.mov",
        rol: "DADA-ITEM_in", tc: "00.00"
    };
    // CAS REAL REPORTAT PER L'USUARI (03/11): el TITOLET «Nombre de contractes». Ací la
    // partícula «Nom» NO és una paraula: va DINS de «Nombre», i el filtre NOM feia
    // `name.includes("Nom")` (SUBSTRING, no paraula) → hi entrava igualment.
    var TITOLET_NOMBRE = {
        name: "Wott_TNM_v2_14_00.00_Nombre de contractes públics_630063_TITOLET_in.00630068.mov",
        rol: "TITOLET_in", tc: "00.00"
    };
    // `js/core/11_Configuracio.js` ja va al harness (fp_smoke_build.ps1): `Config.get()` és
    // el REAL de producció i `_burnedGrafRoles` hi troba les 27 etiquetes de `detectRoles`.
    if (CH && typeof CH._isBurnedGrafWott === 'function') {
        ok('#230: el TITOLET amb «Només» al TEXT és GRAFISME CREMAT',
            CH._isBurnedGrafWott(TITOLET_NOM) === true);
        ok('#230: el TITOLET amb «Lloc»/«Data» al TEXT és GRAFISME CREMAT',
            CH._isBurnedGrafWott(TITOLET_LLOC) === true);
        ok('#230: el DADA-ITEM és GRAFISME CREMAT (família de `titolet.detectRoles`)',
            CH._isBurnedGrafWott(DADA_ITEM) === true);
        ok('#230: un NOM-CARREC no és grafisme cremat (la guarda no el toca)',
            CH._isBurnedGrafWott(NOM_TNC) === false);
        // Filtres REALS de les fases LLOC/NOM (mateixa expressió que
        // `placeChyronLloc`/`placeChyronNom`, igual que fa §14 amb la traducció).
        // (2026-11-03 · BUG #230, 2a part) Ara PER ROL, no per substring del nom.
        var filtreNomReal = function (c) {
            return !CH._isTraduccioWott(c) && !CH._isBurnedGrafWott(c) && CH._isNomCarrec(c);
        };
        var filtreLlocReal = function (c) {
            return !CH._isTraduccioWott(c) && !CH._isBurnedGrafWott(c) && CH._isLlocWott(c);
        };
        // Filtre REAL de RESTO:
        //   c => !isTitol && !isConductor && !isLloc && !isNom && !isTraduccio &&
        //        !isTe && !isMarkerGraf
        // És el predicat que decidix qui col·loca el TITOLET: si ací cau fora (com
        // passava amb `isNom` = `name.includes("Nom")`), NO es col·loca enlloc.
        var filtreRestoReal = function (c) {
            return !CH._isTemaTitolWott(c) && !CH._isConductorWott(c) &&
                !(!CH._isTraduccioWott(c) && CH._isLlocWott(c)) &&
                !(!CH._isTraduccioWott(c) && CH._isNomCarrec(c)) &&
                !CH._isTraduccioWott(c) && !CH._isTeWott(c) && !CH._isMarkerGrafWott(c);
        };
        ok('#230: la fase NOM NO captura el TITOLET (abans sí: «Només»)',
            filtreNomReal(TITOLET_NOM) === false);
        ok('#230: la fase LLOC NO captura el TITOLET (abans sí: «Lloc»)',
            filtreLlocReal(TITOLET_LLOC) === false);
        ok('#230: la fase NOM NO captura el DADA-ITEM (abans sí: «Nom de la dada»)',
            filtreNomReal(DADA_ITEM) === false);
        ok('#230: la fase NOM sí captura el nom-càrrec legítim (sense regressió)',
            filtreNomReal(NOM_TNC) === true);
        ok('#230: «Nombre de contractes» — la partícula «Nom» va DINS de «Nombre» (substring)',
            TITOLET_NOMBRE.name.includes("Nom") === true,
            String(TITOLET_NOMBRE.name.split('_')[5]));
        ok('#230: la fase NOM NO captura el TITOLET «Nombre de contractes»',
            filtreNomReal(TITOLET_NOMBRE) === false);
        ok('#230: el TITOLET «Nombre de contractes» és grafisme cremat (rol al camp 7 del nom)',
            CH._isBurnedGrafWott(TITOLET_NOMBRE) === true,
            String(CH._burnedGrafRole(TITOLET_NOMBRE)));
        ok('#230: la traducció continua fora de NOM i LLOC (guarda del 16/10 intacta)',
            filtreNomReal(TRAD_TNC) === false && filtreLlocReal(TRAD_TNC) === false);
        // ── 2a part (03/11): el FORAT que va deixar la guarda. RESTO ha de REBRE el
        // TITOLET; si `isNom`/`isLloc` tornen a mirar el TEXT del nom, el TITOLET cau
        // fora de TOTES les fases i no es col·loca enlloc.
        ok('#230: RESTO REP el TITOLET «Nombre de contractes» (es torna a col·locar)',
            filtreRestoReal(TITOLET_NOMBRE) === true);
        ok('#230: RESTO REP els TITOLET amb «Només» i amb «Lloc»/«Data» al TEXT',
            filtreRestoReal(TITOLET_NOM) === true && filtreRestoReal(TITOLET_LLOC) === true);
        ok('#230: RESTO NO rep el nom-càrrec ni el grafisme amb marcador (famílies pròpies)',
            filtreRestoReal(NOM_TNC) === false && filtreRestoReal(DADA_ITEM) === false);
        // 🔑 Criteri NOU (petició d'usuari): un wott és NomCarrec pel ROL —camp 7 del
        // nom o `chy.rol`— amb IGUALTAT normalitzada, MAI per substring del nom.
        var WOTT_TEXT_NOM = {
            name: "Wott_TNM_v2_15_00.00_Nombre de contractes públics_630064_Rotul_.00630071.mov",
            rol: "Rotul"
        };
        ok('#230: el TEXT «Nombre…» amb rol Rotul NO és nom-càrrec (matx d\'IGUALTAT)',
            CH._isNomCarrec(WOTT_TEXT_NOM) === false &&
            WOTT_TEXT_NOM.name.indexOf('Nombre') !== -1);
        ok('#230: NOMCARREC sí que ho és pel rol (Nomcarrec al camp 7)',
            CH._isNomCarrec(NOM_TNC) === true &&
            CH._isNomCarrec({ name: 'Wott_TNM_v2_16_00.00_res_630065_Nomcarrec_Ada Colau.006.mov', rol: 'Nomcarrec' }) === true);
        ok('#230: LLOC pel rol (Lloc) i no pel TEXT («Lloc de treball» amb rol Rotul)',
            CH._isLlocWott({ name: 'Wott_TNM_v2_17_00.00_Barcelona_630066_Lloc_Catalunya.006.mov', rol: 'Lloc' }) === true &&
            CH._isLlocWott({ name: 'Wott_TNM_v2_18_00.00_Lloc de treball_630067_Rotul_.006.mov', rol: 'Rotul' }) === false);
        ok('#230: el TEMA-TÍTOL es decidix pel rol, i TITOLET no hi entra mai',
            CH._isTemaTitolWott({ name: 'Wott_TNM_v2_19_00.00_Tema_630068_Tema-Titol_Habitatge.006.mov', rol: 'Tema-Titol' }) === true &&
            CH._isTemaTitolWott(TITOLET_NOMBRE) === false);
        // Xarxa de seguretat dels noms d'exportació MANUAL (`WOTT_<PROG>_NC_<nom>`):
        // token SENCER, només si el wott no porta rol (`ROTUL` = valor per defecte).
        ok('#230: export manual «WOTT_TNC_NC_…» (sense rol) sí que és nom-càrrec',
            CH._isNomCarrec({ name: 'WOTT_TNC_NC_Miguel Domingo.mov', rol: '' }) === true &&
            CH._isNomCarrec({ name: 'WOTT_TNC_NC_Miguel Domingo.mov', rol: 'ROTUL' }) === true);
        ok('#230: …però amb rol propi (TITOLET) el nom NO fa endevinar res',
            CH._isNomCarrec({ name: 'WOTT_TNC_NC_Miguel Domingo.mov', rol: 'TITOLET_in' }) === false);
    } else {
        ok('#230: _isBurnedGrafWott exposat al mòdul', false, typeof (CH && CH._isBurnedGrafWott));
    }
    // ── 14d. BUG #230 (2a part, 03/11): ÀNCORA DEL MARCADOR ─────────────────────
    // El DADA-ITEM ha d'anar al SUB-MARCADOR groc del seu títol («13p72»), MAI al
    // marcador de l'ítem («13», l'inici del vídeo). Dos motius reals:
    //   · `isStructuralMarkerComment` (/^\d+\s*[a-z]{0,5}\s*-/) no accepta dígits
    //     darrere del sufix → «13p72 - p7 Dades HABITATGE» quedava FORA del pot;
    //   · el pot era únic i guanyava el marcador de l'ítem per punts de títol.
    if (CH && typeof CH._markerPools === 'function') {
        var amarillos = [
            { id: '13', time: 10.0, titol: 'IPD HABITATGE' },
            { id: '13p72', time: 47.2, titol: 'p7 Dades HABITATGE' },
            { id: '14', time: 90.0, titol: 'Un altre títol' }
        ];
        var pots = CH._markerPools('13', amarillos);
        ok('#230b: l\'àncora mira PRIMER el SUB-MARCADOR de l\'ítem',
            pots[0].length === 1 && pots[0][0].id === '13p72',
            (pots[0] || []).map(function (a) { return a.id; }).join(','));
        ok('#230b: el marcador de l\'ítem («13») queda de RESERVA (2n pot)',
            pots.length > 1 && pots[1].some(function (a) { return a.id === '13'; }));
        ok('#230b: «13» no arrossega «131» (frontera de dígit → xarxa de seguretat)',
            CH._markerPools('13', [{ id: '131', time: 5, titol: 'Altre' }]).length === 1);
        ok('#230b: un ítem TE sense sub-marcador usa el SEU marcador («25TE-2»)',
            CH._markerPools('25TE-2', [{ id: '25TE-2', time: 12, titol: 'TE tort DADES' }])[0][0].id === '25TE-2');
    } else {
        ok('#230b: _markerPools exposat al mòdul', false, typeof (CH && CH._markerPools));
    }
    if (CH && typeof CH._esComentariAncorable === 'function') {
        ok('#230b: «13p72 - p7 Dades HABITATGE» SÍ que és àncora (abans quedava fora)',
            CH._esComentariAncorable('13p72 - p7 Dades HABITATGE') === true);
        ok('#230b: «13 - IPD HABITATGE» continua sent àncora',
            CH._esComentariAncorable('13 - IPD HABITATGE') === true);
        ok('#230b: un marcador sense « - títol» no és àncora',
            CH._esComentariAncorable('13p72') === false);
        // (3a part) Formats NO canònics que sí han de poder ancorar.
        ok('#230c: «13p72-p7 Dades HABITATGE» (guions sense espais) també és àncora',
            CH._esComentariAncorable('13p72-p7 Dades HABITATGE') === true);
        ok('#230c: «13p72 · p7 Dades» (punt volat) també és àncora',
            CH._esComentariAncorable('13p72 · p7 Dades') === true);
    } else {
        ok('#230b: _esComentariAncorable exposat al mòdul', false, typeof (CH && CH._esComentariAncorable));
    }
    // ── 14e. BUG #230 (3a part, 03/11): EL DADA-ITEM MAI AL MARCADOR DE L'ÍTEM ──
    // En viu, amb la 2a part, el DADA-ITEM encara eixia al marcador «13»: el color del
    // marcador (Markers.get() pot tornar -1 o un índex distint) i el títol del sub-
    // marcador podien fer que es baixara al marcador de l'ítem. Ara:
    //   · el COLOR només desempata (mai descarta);
    //   · amb `strictSub`, si l'ítem TÉ sub-marcadors NO es baixa al de l'ítem.
    if (CH && typeof CH._triaAncora === 'function' && typeof CH._markerSplit === 'function') {
        var SCO = function (a, b) { return String(a) === String(b) ? 1 : 0; };
        var SUBS_T = [{ id: '13p72', time: 47.2, titol: 'p7 Dades HABITATGE' }];
        var ITEM_T = [{ id: '13', time: 10.0, titol: 'p7 Dades HABITATGE' }];
        var t1 = CH._triaAncora(SUBS_T, ITEM_T, 'p7 Dades HABITATGE', SCO, 0.6, true);
        ok('#230c: el DADA-ITEM va al SUB-MARCADOR («13p72») i no al de l\'ítem',
            !!t1.best && t1.best.mk.id === '13p72' && t1.why === 'sub',
            t1.best ? t1.best.mk.id : 'null');
        // El cas que va fallar: el títol del sub-marcador NO arriba al llindar.
        var t2 = CH._triaAncora([{ id: '13p72', time: 47.2, titol: 'Una altra cosa' }],
            ITEM_T, 'p7 Dades HABITATGE', SCO, 0.6, true);
        ok('#230c: si el sub-marcador no coincidix, el DADA-ITEM NO es col·loca (mai a «13»)',
            t2.best === null && t2.why === 'sub-sense-titol', String(t2.best));
        // El tòtem (sense strictSub) sí que pot caure al marcador de l\'ítem.
        var t3 = CH._triaAncora([{ id: '25TE-2p1', time: 5, titol: 'Altre' }],
            [{ id: '25TE-2', time: 12, titol: 'TE tort DADES' }], 'TE tort DADES', SCO, 0.6, false);
        ok('#230c: el tòtem manté la reserva del marcador de l\'ítem (no és DADA-ITEM)',
            !!t3.best && t3.best.mk.id === '25TE-2' && t3.why === 'item');
        // El color GROC (4) desempata, no descarta: un color -1 (il·legible) també val.
        var t4 = CH._triaAncora([{ id: '13p72', time: 47.2, titol: 'p7 Dades HABITATGE', color: -1 }],
            [], 'p7 Dades HABITATGE', SCO, 0.6, true);
        ok('#230c: un marcador amb color il·legible (-1) també pot ser àncora',
            !!t4.best && t4.best.mk.id === '13p72');
        var sp = CH._markerSplit('13', [
            { id: '13', time: 10.0, titol: 'IPD HABITATGE' },
            { id: '13p72', time: 47.2, titol: 'p7 Dades HABITATGE' },
            { id: '131', time: 5.0, titol: 'Altre' }
        ]);
        ok('#230c: _markerSplit separa SUB (13p72) i ÍTEM (13) i no arrossega «131»',
            sp.subs.length === 1 && sp.subs[0].id === '13p72' &&
            sp.item.length === 1 && sp.item[0].id === '13' &&
            sp.mine.length === 2, 'subs=' + sp.subs.length + ' item=' + sp.item.length);
        // El TÍTOL de l\'àncora s\'extrau igual amb o sense espais al voltant del guió.
        ok('#230c: _anchorMarkerTitle talla «13p72-p7 Dades HABITATGE» → «p7 Dades HABITATGE»',
            CH._anchorMarkerTitle('13p72-p7 Dades HABITATGE') === 'p7 Dades HABITATGE',
            CH._anchorMarkerTitle('13p72-p7 Dades HABITATGE'));
        ok('#230c: _anchorMarkerTitle no trenca «25TE-2 - TE tort DADES» (guionet intern)',
            CH._anchorMarkerTitle('25TE-2 - TE tort DADES') === 'TE tort DADES',
            CH._anchorMarkerTitle('25TE-2 - TE tort DADES'));
        // I el PNG de fons a V3 ja no existix (petició d'usuari: «son innecesarios»).
        ok('#230c: placeTeWotts ja no col·loca cap PNG de fons a V3',
            String(CH.placeTeWotts).indexOf('_placeTeFons') === -1 &&
            CH.TE_FONS_PNG === undefined);
    } else {
        ok('#230c: _triaAncora/_markerSplit exposats al mòdul', false,
            typeof (CH && CH._triaAncora) + '/' + typeof (CH && CH._markerSplit));
    }



    // ── 14f. BUG #230 (4a part, 03/11): ÀNCORA PER PARAULA CLAU I BLOC DE WOTTS ──
    // Cas real TNM V2 02/11 (log 12:41): els 3 DADA-ITEM de l'ítem «13» NO es podien
    // ancorar mai per títol, perquè el NOM del wott repeteix el títol de l'ÍTEM
    // («Wott_TNM_v2_13_00.00_ES FRENA EL PREU DEL LLOGUER_675009_DADA-ITEM_…») i el
    // sub-marcador diu una altra cosa («13P72 - p7 dades HABITATGE» → semblança 0,12).
    // Regla d'usuari: «Por nombre: la pista es "dades"» + «es col·loquen a partir d'eixe
    // marcador; el topall és el següent marcador ESTRUCTURAL i, si no hi caben, es
    // retallen de manera homogènia».
    if (CH && typeof CH._pickByKey === 'function' && typeof CH._blockFit === 'function') {
        var SUBS_K = [
            { id: '13P71', time: 10.0, titol: 'p7 foto HABITATGE', color: -1 },
            { id: '13P72', time: 15.0, titol: 'p7 dades HABITATGE', color: -1 }
        ];
        var k1 = CH._pickByKey(SUBS_K, 'dades');
        ok('#230d: _pickByKey troba el sub-marcador «dades» (13P72)', !!k1 && k1.mk.id === '13P72',
            k1 ? k1.mk.id : 'null');
        ok('#230d: _pickByKey no encerta el de «foto»', !!k1 && k1.mk.id !== '13P71');
        ok('#230d: _pickByKey és insensible a accents/majúscules/guions',
            !!CH._pickByKey([{ id: '13P72', time: 1, titol: 'P7-DADES' }], 'Dades'));
        ok('#230d: _pickByKey no inventa res si no hi ha la paraula',
            CH._pickByKey(SUBS_K, 'mapa') === null);
        // El TÍTOL del wott és el de l'ÍTEM: la semblança no arriba al llindar (0,12).
        var SCOF = function (a, b) {
            a = String(a).toUpperCase(); b = String(b).toUpperCase();
            if (a === b) return 1;
            return (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) ? 0.8 : 0;
        };
        var ITEM13 = [{ id: '13', time: 25.92, titol: 'ES FRENA EL PREU DEL LLOGUER' }];
        var a1 = CH._triaAncora(SUBS_K, ITEM13, 'ES FRENA EL PREU DEL LLOGUER', SCOF, 0.6, true, 'dades');
        ok('#230d: amb la pista «dades» el DADA-ITEM sí que té àncora (sub-clau)',
            !!a1.best && a1.best.mk.id === '13P72' && a1.why === 'sub-clau',
            a1.best ? a1.best.mk.id + '/' + a1.why : 'null/' + a1.why);
        var a2 = CH._triaAncora(SUBS_K, ITEM13, 'ES FRENA EL PREU DEL LLOGUER', SCOF, 0.6, true);
        ok('#230d: sense la pista es manté la regla estricta (no es col·loca)',
            a2.best === null && a2.why === 'sub-sense-titol', String(a2.best));
        // El tòtem (TE) no rep mai la pista: continua caient al marcador de l'ítem.
        var a3 = CH._triaAncora([{ id: '25TE-2p1', time: 5, titol: 'Altre' }],
            [{ id: '25TE-2', time: 12, titol: 'TE tort DADES' }], 'TE tort DADES', SCOF, 0.6, false);
        ok('#230d: el tòtem no canvia de comportament (reserva del marcador de l\'ítem)',
            !!a3.best && a3.best.mk.id === '25TE-2' && a3.why === 'item');
        // ── _blockFit: bloc de 3 wotts de 4 s (12 s) contra un topall a 10,92 s ──
        var f1 = CH._blockFit([4, 4, 4], 15, null, 0.04);
        ok('#230d: _blockFit sense topall deixa les durades naturals',
            f1.scale === 1 && Math.abs(f1.total - 12) < 1e-6, 'total=' + f1.total);
        var f2 = CH._blockFit([4, 4, 4], 15, 25.92, 0.04);
        ok('#230d: _blockFit retalla quan el bloc no hi cap',
            f2.scale < 1 && f2.total <= f2.room + 1e-6 &&
            Math.abs(f2.total - f2.room) < 0.5, 'total=' + f2.total.toFixed(2) + ' room=' + f2.room.toFixed(2));
        ok('#230d: el retall és HOMOGENI (tots els wotts iguals)',
            Math.abs(f2.durs[0] - f2.durs[1]) < 1e-6 && Math.abs(f2.durs[1] - f2.durs[2]) < 1e-6,
            f2.durs.map(function (d) { return d.toFixed(2); }).join('/'));
        var f3 = CH._blockFit([4, 4, 4], 0, 100, 0.04);
        ok('#230d: _blockFit no toca res si hi ha marge de sobres',
            f3.scale === 1 && Math.abs(f3.total - 12) < 1e-6 && f3.room === 100);
        ok('#230d: _blockFit sempre deixa almenys 1 frame per wott',
            CH._blockFit([4, 4, 4], 0, 0.1, 0.04).durs.every(function (d) { return d >= 0.04 - 1e-9; }));
        ok('#230d: el pla de bloc viu a placeTeWotts (topall = marcador estructural)',
            String(CH.placeTeWotts).indexOf('nextStructural') !== -1 &&
            String(CH.placeTeWotts).indexOf('_blockFit') !== -1);
    } else {
        ok('#230d: _pickByKey/_blockFit exposats al mòdul', false,
            typeof (CH && CH._pickByKey) + '/' + typeof (CH && CH._blockFit));
    }

    // Cas real TNM_V1 26/10 (CHYRONS_2026-10-27_1400): el rètol «Directe_PRESENCIAL_
    // Ciutat de la Justícia», penjat de `01BT - PG bona tarda i DONA PAS…` @0,00,
    // s'anava a `01dir`@32,28 + 0,40 = **32,68 s** (dins de la connexió) perquè `01BT`
    // no es reconeixia com a plató (sufix `bt` fora de la llista i el títol no comença
    // per cap token). Regla d'usuari: intro/off al principi → va amb el conductor.
    ph('14b-bug195-conductor-plato');
    var F195 = [
        { time: 0, comments: '01BT - PG bona tarda i DONA PAS CIUTAT JUSTÍCIA' },
        { time: 32.28, comments: '01dir - conn MARTA MARTORELL' },
        { time: 39.36, comments: '02 - +++IPD ALDARULLS NIT BCN' }
    ];
    ok('#195: «PG bona tarda i DONA PAS…» és títol de plató (token BONATARDA)',
        CH._isPresenterTitle('PG bona tarda i DONA PAS CIUTAT JUSTÍCIA') === true);
    ok('#195: 01BT compta com a ítem de plató (_isPresenterLine, sufix bt)',
        CH._isPresenterLine({ num: '01BT', titol: 'PG bona tarda i DONA PAS CIUTAT JUSTÍCIA' }) === true);
    ok('#195: la capçalera es reconeix pel SUFIX i pel NOM (01BT / «01 PG - …»)',
        CH._isCapcaleraPlato(F195[0], { suffix: 'bt' }) === true &&
        CH._isCapcaleraPlato({ time: 0, comments: '01 PG - PG bona tarda i DONA PAS' }, {}) === true,
        String(CH._isCapcaleraPlato(F195[0], { suffix: 'bt' })));
    ok('#195: 01dir i el 02 (IPD) NO són capçalera de plató',
        CH._isCapcaleraPlato(F195[1], { suffix: 'dir' }) === false &&
        CH._isCapcaleraPlato(F195[2], { suffix: '' }) === false);
    ok('#195: el rètol PRESENCIAL de la capçalera al inici es QUEDA al plató',
        CH._debeQuedarseEnPlato(F195[0], { suffix: 'bt' }, F195) === true);
    ok('#195: la intro de DIFERIT al inici seguix movent-se (regla #168 intacta)',
        CH._debeQuedarseEnPlato({ time: 0, comments: '04i - intro DIFERIT (VIMBODÍ I POBLET)' },
            { suffix: 'i' },
            [{ time: 0, comments: '04i - intro DIFERIT (VIMBODÍ I POBLET)' },
             { time: 34.36, comments: '05 - +++IPD POBLET VISITA' }]) === false);
    ok('#195: si la capçalera NO obri el bloc, no bloqueja el moviment',
        CH._debeQuedarseEnPlato(F195[0], { suffix: 'bt' },
            [{ time: -6, comments: '00 - prèvia' }].concat(F195)) === false);

    // ── 15. TN MIGDIA V1 (15/10/2026): marcador "01 PGi - PG Intro" ───────────
    // El 1r marcador del bloc és l'ítem de PLATÓ que l'obre i porta un ESPAI entre el
    // número i el sufix d'ítem. Amb la regex antiga (`/^\d+[a-z]{0,5}\s*-\s*.+$/`, i
    // `{0,3}` a dues fases) quedava FORA dels marcadors estructurals:
    //   (a) el Tema-Títol gran del ítem "01 PGi" queia al respatller per BASE i
    //       s'anclava al marcador de l'ALTRE ítem ("01" @32.32s) → 32 s tard;
    //   (b) el Conductor no trobava cap marcador de plató → s'ometia.
    // I el congelat de cobertura s'estirava fins a `zoneEnd`, 6 frames DAMUNT de la
    // peça de sortida (32.08→32.32) → la desaparició no es veia a pantalla.
    ph('15-tnm-marcador-pgi');
    if (CH && typeof CH._isStructuralMarkerComment === 'function') {
        ok('_isStructuralMarkerComment: "01 PGi - PG Intro" (TNM V1) SÍ és estructural',
            CH._isStructuralMarkerComment('01 PGi - PG Intro') === true);
        ok('_isStructuralMarkerComment: "01 - PENSIONS ENTREN EN PRECAMPANYA" segueix estructural',
            CH._isStructuralMarkerComment('01 - PENSIONS ENTREN EN PRECAMPANYA') === true);
        ok('_isStructuralMarkerComment: "01lead - INTRO" (TNV 29/09) segueix estructural',
            CH._isStructuralMarkerComment('01lead - INTRO') === true);
        ok('_isStructuralMarkerComment: comentari sense guió → false',
            CH._isStructuralMarkerComment('Línia Escaleta') === false);
        ok('_isStructuralMarkerComment: buit/null → false (sense excepció)',
            CH._isStructuralMarkerComment('') === false && CH._isStructuralMarkerComment(null) === false);
    } else {
        ok('_isStructuralMarkerComment exposat al mòdul', false, typeof (CH && CH._isStructuralMarkerComment));
    }
    // El filtre ha de ser el MATEIX a les dues fases (flow_markers el consulta al
    // mòdul de chyrons en temps de crida; aquí flow_markers ja s'ha carregat abans).
    ok('flow_markers delega el MATEIX filtre (Markers._isStructuralMarkerComment)',
        !!(FM && typeof FM._isStructuralMarkerComment === 'function') &&
        FM._isStructuralMarkerComment('01 PGi - PG Intro') === true &&
        FM._isStructuralMarkerComment('Línia Escaleta') === false);
    ok('_isPresenterTitle: "PG Intro" (pla general + INTRO) és plató',
        CH._isPresenterTitle('PG Intro') === true);
    ok('_isPresenterTitle: "Intro" i "OFF…" segueixen sent plató',
        CH._isPresenterTitle('Intro') === true && CH._isPresenterTitle('Off presentadora') === true);
    ok('_isPresenterTitle: ítem de vídeo NO és plató (PENSIONS…)',
        CH._isPresenterTitle('PENSIONS ENTREN EN PRECAMPANYA') === false);
    ok('_isPresenterTitle: "PG" sol (sense token després) → false',
        CH._isPresenterTitle('PG') === false);
    ok('_isPresenterLine: la línia "01 PGi / PG Intro" de l\'escaleta és plató',
        CH._isPresenterLine({ num: '01 PGi', titol: 'PG Intro' }) === true);
    ok('_isPresenterLine: la línia "01" (vídeo, font BVC) NO és plató',
        CH._isPresenterLine({ num: '01', titol: 'PENSIONS ENTREN EN PRECAMPANYA', tipus: 'NORMAL', font: 'BVC' }) === false);
    // Congelat vs sortida (TNM V1): encadenats 1.36→32.08 + 32.08→32.32, mai encavalcats.
    ok('_coberturaFreezeEnd: amb la sortida col·locada el congelat acaba al seu IN',
        CH._coberturaFreezeEnd(32.32, 32.08, true) === 32.08);
    ok('_coberturaFreezeEnd: sense sortida el congelat arriba a zoneEnd',
        CH._coberturaFreezeEnd(32.32, 32.08, false) === 32.32);
    ok('_coberturaFreezeEnd: exitStart no finit → zoneEnd',
        CH._coberturaFreezeEnd(4.8, NaN, true) === 4.8);
    // (2026-10-16 · #166) CADENA amb l'ancoratge REAL: `reverseStart` es deriva de `zoneEnd`
    // (IN del gran) i el congelat acaba EXACTAMENT aquí → ni solapament ni forat. Amb
    // l'ancoratge vell (`endZone` = marcador) i el congelat ja encadenat, el tram
    // `endZone → zoneEnd` quedava descobert quan el marcador anava abans del gran.
    var FR25 = 1 / 25, exitDur6 = 6 * FR25;               // peça de desaparició = 6 frames
    var zoneEndT = 32.32;                                  // IN del gran (marcador) — V6 mesurat
    var revStartT = Math.ceil((zoneEndT - exitDur6) / FR25 - 1e-6) * FR25;
    ok('cadena congelat→sortida→gran: reverseStart deriva de zoneEnd i el congelat hi acaba',
        Math.abs(revStartT - (zoneEndT - exitDur6)) < 1e-9 &&
        CH._coberturaFreezeEnd(zoneEndT, revStartT, true) === revStartT);

    // ── 16. BUG #197 (2026-10-27): el grafisme ocupa la SEUA DURADA SENCERA ──────
    // Un tall de V1 dins del mateix ítem encongia l'Out del rètol (el final s'agafava
    // de `ci.end`). Regla d'usuari: el gràfic s'inserix SENCER; només el MARCADOR
    // SEGÜENT el pot retallar. La regla viu a `_limiteOutChyron` (pura, sense JSX).
    ph('16-bug197-durada-sencera');
    ok('#197: _limiteOutChyron existeix (regla pura)', typeof CH._limiteOutChyron === 'function');
    var L197 = function (p) { return CH._limiteOutChyron(p); };
    // (a) Cas del bug: wott de 5 s que entra a 10 s i el clip de V1 acaba a 12 s,
    //     sense marcador següent → el final ha de ser 15 s (sencer), NO 12 s.
    var r197a = L197({ durOwn: 5, placeStart: 10, mkTime: 8, marcadorSeg: null, clipEnd: 12 });
    ok('#197: sense marcador següent mana la DURADA del wott (15 s), no el tall de V1 (12 s)',
        r197a.lim === 15, 'lim=' + r197a.lim + ' · ' + r197a.why);
    ok('#197: el motiu del límit ho diu al log (durada pròpia)',
        /durada pròpia/.test(r197a.why), r197a.why);
    // (b) El marcador següent SÍ que mana (frontera de l'ítem, regla 21/09).
    var r197b = L197({ durOwn: 5, placeStart: 10, mkTime: 8, marcadorSeg: 14, clipEnd: 12 });
    ok('#197: el MARCADOR SEGÜENT segueix manant (14 s) encara que V1 talle a 12 s',
        r197b.lim === 14, 'lim=' + r197b.lim + ' · ' + r197b.why);
    // (c) Sense durada resolta es manté el comportament antic (final del clip).
    var r197c = L197({ durOwn: 0, placeStart: 10, mkTime: 8, marcadorSeg: null, clipEnd: 12 });
    ok('#197: sense durada resolta (dur=0) es queda el final del clip (12 s)',
        r197c.lim === 12, 'lim=' + r197c.lim + ' · ' + r197c.why);
    var r197d = L197({ durOwn: null, placeStart: 10, mkTime: null, marcadorSeg: null, clipEnd: null });
    ok('#197: sense cap dada → sense límit (el cridador conserva la durada del mèdia)',
        r197d.lim === null, String(r197d.lim));
    // (d) Un «marcador» que no és posterior (nm ≤ mkTime+0.1) s'ignora: torna a manar la durada.
    var r197e = L197({ durOwn: 4, placeStart: 20, mkTime: 20, marcadorSeg: 20, clipEnd: 21 });
    ok('#197: el marcador del MATEIX ítem no compta com a «següent» → durada pròpia (24 s)',
        r197e.lim === 24, 'lim=' + r197e.lim + ' · ' + r197e.why);
    // (e) El FINAL calculat pel cridador cobreix tota la durada amb un tall de V1 pel mig.
    var st197 = 30, du197 = 3.2;
    var lim197 = L197({ durOwn: du197, placeStart: st197, mkTime: 28, marcadorSeg: null, clipEnd: st197 + 1.0 }).lim;
    ok('#197: el FINAL cobreix la durada sencera (30 → 33.2 s) amb un tall de V1 a 31 s',
        Math.abs(Math.min(lim197, st197 + du197) - 33.2) < 1e-9,
        'end=' + Math.min(lim197, st197 + du197));

    // ── 16b. BUG #201 (2026-10-28): rètols de text ACOTATS pel clip de referència ──
    // Decisió d'usuari (28/10): s'acoten NOM-CÀRREC i les connexions (Enviat / Directe /
    // Presencial); LLOC/DATA i FIRMA NO (mantenen la durada pròpia de #197). I el
    // decalatge de 10 frames només s'aplica al PRIMER clip del timeline.
    ph('16b-bug201-retol-acotat');
    ok('#201: _esRetolAcotat i _esPrimerClipTimeline existeixen (polítiques pures)',
        typeof CH._esRetolAcotat === 'function' && typeof CH._esPrimerClipTimeline === 'function');
    var ACOT = function (n, r) { return CH._esRetolAcotat({ name: n, rol: r }); };
    ok('#201: el NOM-CÀRREC s\'acota pel rol NOMCARREC',
        ACOT('Wott_TNC_v2_02_00.01_dona pas X_631037_Nomcarrec_Josep Fores_director.mov', 'NOMCARREC') === true);
    ok('#201: el NOM-CÀRREC es reconeix pel nom encara que el rol vinga buit',
        ACOT('WOTT_TNC_NC_Miguel Domingo.mov', '') === true);
    ok('#201: l\'ENVIAT s\'acota', ACOT('Wott_TNC_v2_04_ENVIAT_Laura Catalan.mov', 'ENVIAT') === true);
    ok('#201: el DIRECTE/PRESENCIAL s\'acota',
        ACOT('Wott_TNV_v1_04i_Directe_PRESENCIAL_Vimbodi i P..mov', 'DIRECTE') === true);
    ok('#201: LLOC/DATA NO s\'acota (conserva la durada pròpia)',
        ACOT('Wott_TNC_v2_02_Lloc_Barcelona.mov', 'LLOCDATA') === false);
    ok('#201: FIRMA NO s\'acota (conserva la durada pròpia)',
        ACOT('Wott_TNC_v2_02_Firma_Alcaldessa.mov', 'FIRMA') === false);
    ok('#201: una TRADUCCIÓ amb «Només» al text NO s\'acota',
        ACOT('Wott_TNC_v3_14_644349_TRADUCCIO [2-3] Només n\'existei un.mov', 'TRADUCCIO') === false);
    // El límit: amb `acotat:true` mana el FINAL del clip encara que el wott dure més
    // (cas real: Josep Forés 65,04 → 68,28 s, amb un wott estimat de 8 s).
    var r201a = CH._limiteOutChyron({ durOwn: 8, placeStart: 65.04, mkTime: 60, marcadorSeg: null, clipEnd: 68.28, acotat: true });
    ok('#201: rètol acotat → final del CLIP de referència (68,28 s), no la durada del wott (73,04 s)',
        Math.abs(r201a.lim - 68.28) < 1e-9 && /clip de referència/.test(r201a.why),
        'lim=' + r201a.lim + ' · ' + r201a.why);
    var r201b = CH._limiteOutChyron({ durOwn: 8, placeStart: 65.04, mkTime: 60, marcadorSeg: null, clipEnd: 68.28 });
    ok('#201: sense acotar (Lloc/Firma/grafisme) es manté #197 → durada pròpia (73,04 s)',
        Math.abs(r201b.lim - 73.04) < 1e-9, 'lim=' + r201b.lim);
    var r201c = CH._limiteOutChyron({ durOwn: 8, placeStart: 65.04, mkTime: 60, marcadorSeg: 66, clipEnd: 68.28, acotat: true });
    ok('#201: el MARCADOR SEGÜENT seguix manant per damunt del clip', r201c.lim === 66, 'lim=' + r201c.lim);
    // Decalatge d'entrada: només al primer clip del timeline.
    var c1 = { name: 'A', start: 0, end: 10 }, c2 = { name: 'B', start: 10, end: 20 };
    ok('#201: decalatge de 10 frames NOMÉS al primer clip del timeline',
        CH._esPrimerClipTimeline([c1, c2], c1) === true && CH._esPrimerClipTimeline([c1, c2], c2) === false,
        'primer=' + CH._esPrimerClipTimeline([c1, c2], c1) + ' segon=' + CH._esPrimerClipTimeline([c1, c2], c2));
    ok('#201: un sol clip que arrenca a 0 també compta com a «primer clip»',
        CH._esPrimerClipTimeline([c1], c1) === true);
    ok('#201: un clip que arrenca més enllà de 0 (o sense llista) no rep decalatge',
        CH._esPrimerClipTimeline([c2], c2) === false && CH._esPrimerClipTimeline(null, c2) === false);

    // ── Guarda de regressió: cap WARN/ERROR silenciós dels mòduls ─────────
    var warns = window.__LOG.filter(function (l) { return /WARN|ERROR/.test(l); });
    ok('cap WARN/ERROR dels mòduls al llarg del flux', warns.length === 0, warns.slice(0, 3).join(' | '));
};
