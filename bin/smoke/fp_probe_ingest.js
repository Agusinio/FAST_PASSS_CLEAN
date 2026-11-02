/* ============================================================================
 * PROVA INGESTA DE WOTTS (2026-11-02) — BUG #221
 * ----------------------------------------------------------------------------
 * SIMPTOMA (report d'usuari): «de vegades el menú de càrrega de wotts es queda
 * parat fins que clique Cancel·lar; una vegada ho faig ho carrega tot
 * perfectament».
 *
 * CAUSA: en importar els rètols (`app.project.importFiles`, síncron) Premiere
 * obri la finestra modal de progrés «Import Files» (el `suppressUI` no la lleva)
 * i, amb rètols ProRes per xarxa, sovint NO es tanca sola quan ja ha acabat.
 * Mentre està oberta el motor ExtendScript està bloquejat: el panell no pot
 * fer res ni dir res. Quan l'usuari prem Cancel·lar, la crida torna i els
 * fitxers JA hi eren → «ho carrega tot perfectament».
 *
 * Aquesta prova fa dos treballs:
 *  A) CONTRACTE de `Utils.importList` (retorns sense tocar la xarxa).
 *  B) GUARDES als fitxers REALS: avís proactiu + watchdog de 20 s a `utils.js`,
 *     i que `ingestAssets` NO avorte quan el motor respon però el bloc ha
 *     caducat (es verifica al final al bin CHY).
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '28-ingest';

        var REPO = window.__REPO || '';
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            return await r.text();
        }

        // El harness SUBSTITUÏX `window.FASTPASS_UI.Utils` per un stub
        // (bin/smoke/fp_smoke_ac.js): els mètodes d'ingesta no hi són. Per això
        // les guardes es fan sobre el CODI REAL del repo, que és el que importa.
        var srcU = await readRepo('js/core/utils.js');

        ok('#ING/1 utils.js: `importList` treballa en blocs i delega en `_importChunk`',
            /importList:\s*async function\(pathList, binName, opts\)/.test(srcU) &&
            /_importChunk:\s*async function\(paths, binName, timeoutMs\)/.test(srcU) &&
            /_engineAlive:\s*async function\(timeoutMs\)/.test(srcU) &&
            /const out = \{ ok: true, sent: 0, chunks: 0, failed: 0, timeout: false, blocked: false \}/.test(srcU),
            '');

        ok('#ING/2 utils.js: llista buida ix ABANS de tocar el motor (cap crida a `importFiles`)',
            /if \(!pathList \|\| !pathList\.length\) return out;/.test(srcU) &&
            /const rawPaths = pathList\.map\(item => item\.path \|\| item\)\.filter\(p => !!p\);/.test(srcU) &&
            /if \(rawPaths\.length === 0\) return out;/.test(srcU),
            '');

        ok('#ING/3 utils.js: avís proactiu ABANS del primer bloc (diu què fer amb «Import Files»)',
            /_avisModal/.test(srcU) &&
            /si la finestra «Import Files» de Premiere es queda quieta,/.test(srcU) &&
            /prem Cancel·lar: no es perd res del que ja ha entrat al projecte/.test(srcU),
            'avis=' + (srcU.match(/_avisModal/g) || []).length);

        ok('#ING/4 utils.js: watchdog de 20 s mentre el bloc espera (i es neteja sempre)',
            /setInterval\(function \(\) \{/.test(srcU) &&
            /\}, 20000\);/.test(srcU) &&
            /clearInterval\(_wd\)/.test(srcU) &&
            /sense resposta des de fa \$\{s\} s/.test(srcU),
            'wd=' + (srcU.match(/clearInterval\(_wd\)/g) || []).length);

        ok('#ING/5 utils.js: `__TIMEOUT__` no es reintenta (invariant #217) i el missatge depén de `blocked`',
            /res !== "__TIMEOUT__"/.test(srcU) &&
            /out\.blocked \? 'no es reintenta sobre un motor bloquejat\.'/.test(srcU),
            '');

        ok('#ING/6 utils.js: resum final a la barra d\'estat amb els fitxers enviats',
            /this\.status\(out\.timeout/.test(srcU) &&
            /aturada per falta de resposta/.test(srcU),
            '');

        var srcP = await readRepo('js/logic/3_Project_Logic.js');

        ok('#ING/7 3_Project_Logic.js: només avorta si el motor està BLOQUEJAT (`impW.timeout && impW.blocked`)',
            /if \(impW\.timeout && impW\.blocked\) \{/.test(srcP),
            'trobar=' + (srcP.match(/impW\.timeout/g) || []).length);

        ok('#ING/8 3_Project_Logic.js: amb el motor viu i el bloc caducat, CONTINUA (WARN, no `throw`)',
            /if \(impW\.timeout\) \{[\s\S]{0,700}?utils\.log\('⏳ \[INGEST\] La importació ha caducat esperant Premiere/.test(srcP) &&
            !/if \(impW\.timeout\) \{\s*\r?\n\s*throw/.test(srcP),
            '');

        ok('#ING/9 3_Project_Logic.js: la verificació final del bin CHY explica què fer amb «Import Files»',
            /Si tens la finestra «Import ' \+\s*\r?\n\s*'Files» oberta, prem Cancel·lar/.test(srcP),
            '');

        ok('#ING/10 `ingestAssets` verifica el bin CHY abans de donar la ingesta per bona',
            /const postW = await this\._getExistingAssets\(\)/.test(srcP) &&
            /if \(arribats <= 0\) \{/.test(srcP),
            '');

        var idx = await readRepo('index.html');
        ok('#ING/11 index.html: cache-busts del #221 (utils 32 · Project_Logic 36)',
            /utils\.js\?v=32/.test(idx) && /3_Project_Logic\.js\?v=36/.test(idx),
            (idx.match(/utils\.js\?v=\d+/) || '') + ' ' +
            (idx.match(/3_Project_Logic\.js\?v=\d+/) || ''));
    };
})();
