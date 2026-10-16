/* ============================================================================
 * PROVA F4/F5 (2026-10-15) · s'enganxa DESPRÉS dels tests del manifest.
 * ----------------------------------------------------------------------------
 * Valida la connexió NOVA dels productors a la font única quan el harness normal
 * no els executa (flow_chyrons._recordPlacedChyrons → chyrons.placed i
 * flow_graphics._recordGraphics → graphics.list) I el CTX amb què s'hi arriba.
 *
 * NOTA 1: `MainButton._setupContext()` depèn del DOM del panell (selects), que aquí
 *         no existeix → es substitueix pel fixture `window.__ctx` (el que fa servir
 *         la resta de tests). És el MATEIX ctx que el flux real (config, progData,
 *         bloque, dateDir).
 * NOTA 2: `js/core/4_Context.js` NO forma part del bundle → per provar el camí de
 *         reserva de `_manifestCtx()` s'injecta un `Core.Context._targetDateDir()`
 *         que retorna la data de treball del fixture (el que fa el mòdul real).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        var AC = UI.Core.AnalysisCenter;
        var SM = UI.SessionManifest;
        var ctx = window.__ctx;
        var FILES = window.__FILES;

        window.__PHASE = '14-flow-chyrons-graphics';

        var CHY = UI.Workflows.Chyrons;
        var GRA = UI.Workflows.Graphics;
        var MB = UI.Workflows.MainButton;

        ok('flow_chyrons carregat amb _recordPlacedChyrons + _manifestCtx',
            !!(CHY && CHY._recordPlacedChyrons && CHY._manifestCtx));
        ok('flow_graphics carregat amb _recordGraphics', !!(GRA && GRA._recordGraphics));
        if (!CHY || !GRA) { return; }

        // ── Context de SESSIÓ (el que dóna el panell) ────────────────────────
        var realSetup = MB._setupContext;
        var panelCtx = async function () { return ctx; };
        MB._setupContext = panelCtx;
        // `State` SENSE dateDir (com el flux real abans de _runNew / RESET): la ruta
        // del manifest NO la pot decidir State, ha de sortir del ctx de sessió.
        UI.State.progData = ctx.progData;
        UI.State.bloque = ctx.bloque;
        UI.State.config = ctx.config;
        UI.State.dateDir = null;

        var ref = SM.getPath(ctx);

        // ── F4: resolució del ctx del manifest ─────────────────────────────
        var got = SM.getPath(await CHY._manifestCtx());
        ok('F4 _manifestCtx() resol el MATEIX manifest que el ctx de sessió (amb dia!)',
            got === ref, got + '  ≠  ' + ref);
        ok('F4 _manifestCtx() NO depèn de State.dateDir',
            !UI.State.dateDir && got === ref, 'State.dateDir=' + String(UI.State.dateDir));

        // Camí de reserva: sense panell → State + data de treball de Core.Context.
        MB._setupContext = async function () { throw new Error('sense panell'); };
        UI.Core = UI.Core || {};
        var realTD = UI.Core.Context && UI.Core.Context._targetDateDir;
        UI.Core.Context = UI.Core.Context || {};
        UI.Core.Context._targetDateDir = function () { return ctx.dateDir; };
        var fb = await CHY._manifestCtx();
        ok('F4 fallback sense panell: ctx complet (wott+bloc+dateDir) i mateixa ruta',
            SM._ctxOk(fb) && !!fb.dateDir && SM.getPath(fb) === ref,
            'wott=' + String(fb.progData && fb.progData.wott) + ' bloc=' + String(fb.bloque) +
            ' dateDir=' + String(fb.dateDir));
        if (realTD) UI.Core.Context._targetDateDir = realTD;
        else delete UI.Core.Context._targetDateDir;
        MB._setupContext = panelCtx;

        // ── F4: chyrons.placed ─────────────────────────────────────────────
        var m = await SM.load(ctx);
        m.chyrons = m.chyrons || {}; m.chyrons.placed = [];
        m.graphics = m.graphics || {}; m.graphics.list = [];

        var rec = { num: '02', name: 'COND_02.png', track: 6, startSec: 12.5, endSec: 16, tipus: 'CHY' };
        await CHY._recordPlacedChyrons([rec], 'conductor');
        await CHY._recordPlacedChyrons([
            { num: '02', name: 'COND_02.png', track: 6, startSec: 12.5, endSec: 18, tipus: 'CHY' }
        ], 'conductor');

        m = await SM.load(ctx);
        var pl = (m.chyrons && m.chyrons.placed) || [];
        ok('F4 chyrons.placed: 1 registre (dedup num|name|track)',
            pl.length === 1 && m.chyrons.countPlaced === 1, JSON.stringify(pl));
        ok('F4 recol·locar ACTUALITZA el registre (endSec 18, no 16)',
            pl.length === 1 && Number(pl[0].endSec) === 18, pl.length ? String(pl[0].endSec) : '-');
        ok('F4 la vista el lliga a l\'ítem 02 (_insideWindow)',
            AC._insideWindow(pl, 11, 20, '02').length === 1);
        ok('F4 escrit AL FITXER del dia (<prog>_<bloc>.fastpass.json)',
            FILES[ref] !== undefined, Object.keys(FILES).join(' | '));

        // ── F5: graphics.list + clau d'identitat amb temps ─────────────────
        var g1 = { tipus: 'FONS', name: 'Fons_Vertical_Generic.png', track: 4, startSec: 10 };
        var g2 = { tipus: 'FONS', name: 'Fons_Vertical_Generic.png', track: 4, startSec: 40 };
        await GRA._recordGraphics([g1], 'PlaceBackground');
        await GRA._recordGraphics([g2], 'PlaceBackground');

        m = await SM.load(ctx);
        var gl = (m.graphics && m.graphics.list) || [];
        ok('F5 graphics.list: 2 col·locacions del MATEIX fitxer i pista (key amb temps)',
            gl.length === 2 && m.graphics.count === 2, JSON.stringify(gl));
        ok('F5 les claus generades inclouen el temps',
            gl.length === 2 && /^FONS\|4\|10\.00$/.test(String(gl[0].key)) &&
            /^FONS\|4\|40\.00$/.test(String(gl[1].key)),
            gl.map(function (r) { return r.key; }).join(' '));
        ok('F5 la vista reparteix el fons de les 10s al seu ítem (i no el de les 40s)',
            AC._insideWindow(gl, 5, 20, '01').length === 1 && AC._insideWindow(gl, 35, 50, '01').length === 1);
        ok('F5 escrit AL FITXER del dia (<prog>_<bloc>.fastpass.json)',
            FILES[ref] !== undefined && FILES[ref].indexOf('Fons_Vertical_Generic') !== -1);

        MB._setupContext = realSetup;
    };
})();
