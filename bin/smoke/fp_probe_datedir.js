/* ============================================================================
 * PROVA DATA DE SESSIÓ (2026-11-02) — BUG #220
 * ----------------------------------------------------------------------------
 * SIMPTOMA (report d'usuari): treballant amb un projecte d'AHIR apareixia el
 * directori del dia d'AVUI amb un `<PROG>_<bloc>.fastpass.json` dins.
 *
 * CAUSA ARREL: `Context.checkContext()` fixa `State.dateDir` a la data d'AVUI
 * (#177) encara que damunt hi haja obert el `.prproj` d'AHIR, i
 * `MainButton._setupContext()` construïa el ctx de SESSIÓ amb eixa data. Com
 * que `SessionManifest._writeRaw` fa `cep.fs.makedir` (i el respatller JSX,
 * `f.parent.create()`), el directori del dia s'INVENTAVA; els escriptors
 * afectats eren `flow_markers.dumpMarkersSnapshot`, `flow_graphics._recordGraphics`,
 * `flow_chyrons._manifestCtx`, la portada/rutes de `flow_render`, el SRT
 * d'emergència i OBRIR/GO (que a més deixava `State.projectDateDir` mal).
 *
 * Aquesta prova fa tres treballs:
 *  A) COMPORTAMENT de `MainButton._sessionDateDir()`: mana el path REAL del
 *     `.prproj` obert, amb memòria curta (2 s) per a no repetir `Project.path()`.
 *  B) COMPORTAMENT de `MainButton._sessionCtx()`: el ctx de sessió ix amb la
 *     data del projecte encara que `State.dateDir` siga HOY.
 *  C) GUARDES als fitxers REALS: cap escriptor de sessió torna a demanar
 *     `_setupContext()` a pèl, el render i el SRT anclen la data, i els
 *     cache-busts d'index.html estan al dia.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '27-datedir';

        var REPO = window.__REPO || '';
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            return await r.text();
        }

        var MB = UI.Workflows && UI.Workflows.MainButton;
        ok('#DIR/1 `Workflows.MainButton` carregat amb `_sessionDateDir` i `_sessionCtx`',
            !!MB && typeof MB._sessionDateDir === 'function' && typeof MB._sessionCtx === 'function',
            'MB=' + !!MB);
        if (!MB || typeof MB._sessionDateDir !== 'function') return;

        // ── Estat original (es restaura al final) ────────────────────────────
        var saved = {
            ctx: UI.Core && UI.Core.Context,
            dateDir: UI.State && UI.State.dateDir,
            gfd: UI.Utils.getFormattedDate,
            cfgGet: UI.Config.get,
            cache: MB._sessionDateCache,
            prog: document.getElementById('programa'),
            bloc: document.getElementById('bloc')
        };
        var crides = 0;
        var projDir = '2026_11_01';


        try {
            // ── A. _sessionDateDir: mana el PROJECTE OBERT ───────────────────
            UI.Utils.getFormattedDate = function () { return '2030_01_09'; };
            UI.Core = UI.Core || {};
            UI.Core.Context = {
                _resolveProjectDateDir: async function () { crides++; return projDir; }
            };

            UI.State = UI.State || {};
            UI.State.dateDir = '2026_11_02';
            MB._sessionDateCache = { at: 0, dir: '' };
            var d1 = await MB._sessionDateDir();
            ok('#DIR/2 amb el projecte del 01/11 obert i `State.dateDir` = 02/11 → guanya el PROJECTE',
                d1 === '2026_11_01' && crides === 1, 'd=' + d1 + ' crides=' + crides);

            var d2 = await MB._sessionDateDir();
            ok('#DIR/3 memòria curta: la segona crida (2 s) no torna a preguntar al pont',
                d2 === '2026_11_01' && crides === 1, 'd=' + d2 + ' crides=' + crides);

            MB._sessionDateCache = { at: 0, dir: '' };
            projDir = null;   // cap .prproj obert (o fora de l'arbre de treball)
            var d3 = await MB._sessionDateDir();
            ok('#DIR/4 sense projecte resoluble → reserva `State.dateDir` (HOY/AHIR)',
                d3 === '2026_11_02' && crides === 2, 'd=' + d3 + ' crides=' + crides);

            MB._sessionDateCache = { at: 0, dir: '' };
            UI.State.dateDir = null;
            var d4 = await MB._sessionDateDir();
            ok('#DIR/5 sense resolució ni `State.dateDir` → rellotge (últim recurs)',
                d4 === '2030_01_09', 'd=' + d4);

            // ── B. _sessionCtx: el ctx de sessió porta la data del projecte ──
            // Si alguna altra prova ha deixat selects amb estos ids, es retiren
            // (es restauren al finally) perquè `getElementById` trobe els meus.
            if (saved.prog && saved.prog.parentNode) saved.prog.parentNode.removeChild(saved.prog);
            if (saved.bloc && saved.bloc.parentNode) saved.bloc.parentNode.removeChild(saved.bloc);
            var selProg = document.createElement('select');
            selProg.id = 'programa';
            var opt = document.createElement('option');
            opt.value = 'PR1';
            opt.textContent = 'PR1';
            selProg.appendChild(opt);
            selProg.value = 'PR1';
            var selBloc = document.createElement('select');
            selBloc.id = 'bloc';
            ['V1', '---'].forEach(function (v) {
                var o = document.createElement('option');
                o.value = v;
                o.textContent = v;
                selBloc.appendChild(o);
            });
            selBloc.value = 'V1';
            document.body.appendChild(selProg);
            document.body.appendChild(selBloc);

            UI.Config = UI.Config || {};
            UI.Config.get = function () {
                return {
                    rutas: { destinoBase: 'C:/TMP/NAS/' },
                    mapeoProgramas: {
                        PR1: { archivo: 'TN_VESPRE', wott: 'TNV', directorio: 'TNV_PROJECTES' }
                    }
                };
            };
            UI.State.dateDir = '2026_11_02';
            MB._sessionDateCache = { at: 0, dir: '' };
            projDir = '2026_11_01';
            var ctxS = await MB._sessionCtx();
            ok('#DIR/6 `_sessionCtx()` ancla la data del ctx (02/11 → 01/11) i manté la resta',
                !!ctxS && ctxS.dateDir === '2026_11_01' && ctxS.bloque === 'V1' &&
                !!(ctxS.progData && ctxS.progData.wott === 'TNV') && ctxS.programa === 'PR1',
                'ctx=' + JSON.stringify(ctxS && { d: ctxS.dateDir, b: ctxS.bloque, p: ctxS.programa }));

            // Sense projecte resoluble, `_sessionCtx()` respecta `State.dateDir`.
            MB._sessionDateCache = { at: 0, dir: '' };
            projDir = null;
            var ctxT = await MB._sessionCtx();
            ok('#DIR/7 sense projecte resoluble, `_sessionCtx()` no toca la data de checkContext',
                !!ctxT && ctxT.dateDir === '2026_11_02', 'd=' + (ctxT && ctxT.dateDir));
        } finally {
            // ── Restauració (la resta de proves comparteixen el bundle) ──────
            try {
                ['programa', 'bloc'].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el && el.parentNode) el.parentNode.removeChild(el);
                });
                // Restaura els selects originals (si n'hi havia) al seu lloc.
                if (saved.prog) document.body.appendChild(saved.prog);
                if (saved.bloc) document.body.appendChild(saved.bloc);
            } catch (eDom) { }
            try {
                UI.Utils.getFormattedDate = saved.gfd;
                if (saved.ctx === undefined) { delete UI.Core.Context; } else { UI.Core.Context = saved.ctx; }
                UI.State.dateDir = saved.dateDir;
                if (saved.cfgGet === undefined) { delete UI.Config.get; } else { UI.Config.get = saved.cfgGet; }
                MB._sessionDateCache = saved.cache || { at: 0, dir: '' };
            } catch (eRest) { }
        }

        // ── C. GUARDES sobre els fitxers REALS ──────────────────────────────
        var srcMB = await readRepo('js/workflows/flow_mainButton.js');
        ok('#DIR/8 flow_mainButton: `_sessionCtx()` definit i emprat a OBRIR (`_runGo`) i CARREGAR (`_runLoad`)',
            (srcMB.match(/_sessionCtx\s*:\s*async function/g) || []).length === 1 &&
            (srcMB.match(/this\._sessionCtx\(\)/g) || []).length >= 2 &&
            /const ctx = await this\._sessionCtx\(\);\s*\n\s*const assets = await this\._fullScan\(ctx\);\s*\n\s*await this\._completeSyncUI\(ctx, assets\);/.test(srcMB),
            'def=' + (srcMB.match(/_sessionCtx\s*:\s*async function/g) || []).length +
            ' usos=' + (srcMB.match(/this\._sessionCtx\(\)/g) || []).length);

        var srcMk = await readRepo('js/workflows/flow_markers.js');
        ok('#DIR/9 flow_markers (snapshot de marcadors): ctx de SESSIÓ, no `_setupContext()` a pèl',
            /typeof MB\._sessionCtx === 'function'/.test(srcMk) &&
            srcMk.indexOf('await FASTPASS_UI.Workflows.MainButton._setupContext()') === -1);

        var srcGf = await readRepo('js/workflows/flow_graphics.js');
        ok('#DIR/10 flow_graphics (grafismes): ctx de SESSIÓ, no `_setupContext()` a pèl',
            /typeof MB\._sessionCtx === 'function'/.test(srcGf) &&
            srcGf.indexOf('await FASTPASS_UI.Workflows.MainButton._setupContext()') === -1);

        var srcCh = await readRepo('js/workflows/flow_chyrons.js');
        ok('#DIR/11 flow_chyrons (`_manifestCtx`): prefereix `_sessionCtx()` i cau a `_setupContext()`',
            /typeof MB\._sessionCtx === 'function'/.test(srcCh) &&
            /fCtx\.call\(MB\)/.test(srcCh));

        var srcRn = await readRepo('js/workflows/flow_render.js');
        ok('#DIR/12 flow_render: ancla la data (`_anclaDataSessio`) a runVideo i a la portada, i `_rutaExport` la llig',
            /_anclaDataSessio:\s*async function/.test(srcRn) &&
            (srcRn.match(/await this\._anclaDataSessio\(\)/g) || []).length >= 2 &&
            /dateDir:\s*this\._dateDirSessio \|\| st\.dateDir/.test(srcRn) &&
            /const stateDateDir = this\._dateDirSessio \|\| state\.dateDir/.test(srcRn));

        var srcSr = await readRepo('js/editor/srt_editor.js');
        ok('#DIR/13 srt_editor (SRT d\'emergència): busca el manifest amb la data del projecte obert',
            /MB\._sessionDateDir\(\)/.test(srcSr));

        var srcSm = await readRepo('js/core/session_manifest.js');
        ok('#DIR/14 session_manifest: és l\'escriptor que CREA la carpeta (origen del directori fantasma)',
            /cep\.fs\.makedir\(dir\)/.test(srcSm));

        var srcMp = await readRepo('js/workflows/flow_mp4.js');
        ok('#DIR/16 flow_mp4 (fase crudo + marcadors crus): ctx de SESSIÓ, no `_setupContext()` a pèl',
            (srcMp.match(/MainButton\._sessionCtx\(\)/g) || []).length >= 2 &&
            srcMp.indexOf('MainButton._setupContext()') === -1);

        var idx = await readRepo('index.html');
        ok('#DIR/15 index.html: cache-busts del #220 (mainButton 47 · chyrons 101 · graphics 27 · markers 68 · mp4 8 · render 40 · srt 90)',
            /flow_mainButton\.js\?v=47/.test(idx) && /flow_chyrons\.js\?v=101/.test(idx) &&
            /flow_graphics\.js\?v=27/.test(idx) && /flow_markers\.js\?v=68/.test(idx) &&
            /flow_mp4\.js\?v=8/.test(idx) &&
            /flow_render\.js\?v=40/.test(idx) && /srt_editor\.js\?v=90/.test(idx),
            (idx.match(/flow_mainButton\.js\?v=\d+/) || '') + ' ' +
            (idx.match(/flow_chyrons\.js\?v=\d+/) || '') + ' ' +
            (idx.match(/flow_graphics\.js\?v=\d+/) || '') + ' ' +
            (idx.match(/flow_markers\.js\?v=\d+/) || '') + ' ' +
            (idx.match(/flow_mp4\.js\?v=\d+/) || '') + ' ' +
            (idx.match(/flow_render\.js\?v=\d+/) || '') + ' ' +
            (idx.match(/srt_editor\.js\?v=\d+/) || ''));
    };
})();
