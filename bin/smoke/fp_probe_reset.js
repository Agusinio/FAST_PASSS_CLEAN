/* ============================================================================
 * PROVA RESET (2026-10-21) - ESBORRAT ABSOLUT de la carpeta del projecte
 * ----------------------------------------------------------------------------
 * SIMPTOMA (report d'usuari): el boto RESET deixava fitxers dins la carpeta del
 * projecte; el flux NOU que ve tot seguit reaprofitava material vell i generava
 * mes problemes que solucions.
 *
 * CAUSA ARREL: utils.deleteFolder feia `fs.rmSync(dir,{recursive:true,force:true})`,
 * que S'ATURA al primer error (a Windows: el .prproj o la carpeta
 * `Adobe Premiere Pro Auto-Save` encara oberts per Premiere) i deixa l'arbre MIG
 * esborrat. A mes, runReset nomes AVISAVA si returnava false i CONTINUAVA creant
 * el projecte nou sobre les restes. Fora de la carpeta sobrevivien les copies de
 * marcadors de subtitols de C:/temp, que es poden re-injectar al projecte nou.
 *
 * Aquesta prova fa dos treballs:
 *  A) MOTOR REAL (`FASTPASS_UI.Logic.FsWipe`, ja al bundle) amb un DISC SIMULAT:
 *     arbre real d'un bloc (Auto-Save, Snapshots, analisi, .prproj, MP4, SRT),
 *     fitxer de NOMES LECTURA, fitxer BLOQUEJAT (mai no es pot esborrar) i lock
 *     TRANSITORI (s'allibera al 4t intent). Comprova que: s'esborra tot, que un
 *     fitxer bloquejat NO atura la resta, que NO es diu "ok" si queden restes i
 *     que els reintents funcionen.
 *  B) GUARDES ESTATIQUES sobre els fitxers REALS: runReset usa `wipeFolder`
 *     (mai `deleteFolder`), AVORTA si `!wipe.ok` ABANS de `_runNew()`, te la
 *     guarda de carpeta (`isInsideFolder` + tram del bloc) i buida les copies de
 *     marcadors (`wipeMarkersForProject`). Cache-busts d'index.html al dia.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '20-reset';

        var REPO = window.__REPO || '';
        var FILES = window.__TEXT_FILES || [];
        var BS = String.fromCharCode(92);          // barra invertida (sense escapes)
        var PROJ = 'C:' + BS + 'PROVES' + BS + '04_TN VESPRE_PROJECTES' + BS + '2026_10_21' + BS + 'V3';

        function noComments(src) {
            return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
        }
        async function readRepo(rel) {
            var r = await fetch('file:///' + REPO + '/' + rel);
            return await r.text();
        }

        /**
         * vfs: disc SIMULAT per al motor real. `entries` es un mapa
         * ruta -> {dir:true} | {ro:true}. `hooks.lock(path)` simula un fitxer
         * bloquejat per un altre proces (unlink -> EPERM).
         */
        function vfs(entries, hooks) {
            var t = Object.create(null);
            Object.keys(entries).forEach(function (k) { t[k] = entries[k]; });
            var h = hooks || {};
            var calls = { unlink: 0, chmod: 0, rmdir: 0, readdir: 0 };
            function kids(p) {
                var out = [], pre = p + BS;
                for (var k in t) {
                    if (k === p || k.indexOf(pre) !== 0) continue;
                    var rest = k.substring(pre.length);
                    if (rest.indexOf(BS) === -1) out.push(rest);
                }
                return out;
            }
            function err(name, code) { var e = new Error(name); e.code = code; return e; }
            var fs = {
                existsSync: function (p) { return !!t[p]; },
                readdirSync: function (p) {
                    calls.readdir++;
                    if (!t[p]) throw err('ENOENT', 'ENOENT');
                    if (!t[p].dir) throw err('ENOTDIR', 'ENOTDIR');
                    return kids(p);
                },
                lstatSync: function (p) {
                    if (!t[p]) throw err('ENOENT', 'ENOENT');
                    var q = t[p];
                    return { isDirectory: function () { return !!q.dir; } };
                },
                unlinkSync: function (p) {
                    calls.unlink++;
                    if (h.lock && h.lock(p)) throw err('EPERM', 'EPERM');
                    if (!t[p] || t[p].dir) throw err('ENOENT', 'ENOENT');
                    if (t[p].ro) throw err('EPERM', 'EPERM');
                    delete t[p];
                },
                chmodSync: function (p) {
                    calls.chmod++;
                    if (t[p]) t[p].ro = false;
                },
                rmdirSync: function (p) {
                    calls.rmdir++;
                    if (!t[p] || !t[p].dir) throw err('ENOENT', 'ENOENT');
                    if (kids(p).length > 0) throw err('ENOTEMPTY', 'ENOTEMPTY');
                    delete t[p];
                }
            };
            return { fs: fs, tree: t, calls: calls, kids: kids };
        }

        /** blocTree: arbre d'una carpeta de bloc REAL (mesurada al NAS). */
        function blocTree() {
            var e = {};
            e[PROJ] = { dir: true };
            e[PROJ + BS + 'Pruebas_TNV_V3.prproj'] = {};
            e[PROJ + BS + 'TNV_V3.fastpass.json'] = {};
            e[PROJ + BS + 'TNV_V3_CLIP.mp4'] = {};
            e[PROJ + BS + 'TNV_V3_CLIP_AUDIO_REF.bin'] = { ro: true };   // nomes lectura
            e[PROJ + BS + 'Adobe Premiere Pro Auto-Save'] = { dir: true };
            e[PROJ + BS + 'Adobe Premiere Pro Auto-Save' + BS + 'Pruebas_TNV_V3.prproj'] = {};
            e[PROJ + BS + 'Snapshots'] = { dir: true };
            e[PROJ + BS + 'Snapshots' + BS + 'snap_0001.png'] = {};
            e[PROJ + BS + 'analisis_estructura'] = { dir: true };
            e[PROJ + BS + 'analisis_estructura' + BS + 'estructura.json'] = {};
            return e;
        }

        try {
            ok('#175/1 harness amb acces als fitxers del repo', !!(REPO && FILES.length),
                'REPO=' + (REPO || '(buit)') + ' * FILES=' + FILES.length);
            var FW = UI.Logic && UI.Logic.FsWipe;
            ok('#175/2 `FsWipe` carregat (js/logic/19_Fs_Wipe.js al bundle)',
                !!(FW && typeof FW.wipe === 'function' && typeof FW.removeTree === 'function' && typeof FW.isInside === 'function'),
                'wipe=' + !!(FW && FW.wipe) + ' * removeTree=' + !!(FW && FW.removeTree));
            if (!FW || !REPO) { return; }

            var noWait = function () { return Promise.resolve(); };

            // ── 1) CARPETA REAL: s'ho emporta TOT (inclos el fitxer nomes lectura)
            var d1 = vfs(blocTree(), {});
            var r1 = await FW.wipe(d1.fs, PROJ + BS, { delay: noWait });
            ok('#175/3 arbre de bloc: esborrat COMPLET (' + r1.files + ' fitxers, ' + r1.dirs + ' carpetes)',
                r1.ok === true && r1.reason === 'ESBORRADA' && Object.keys(d1.tree).length === 0 && r1.leftovers.length === 0,
                'ok=' + r1.ok + ' * reason=' + r1.reason + ' * resta=' + JSON.stringify(r1.leftovers));
            ok('#175/4 el fitxer de NOMES LECTURA es desbloqueja (chmod) i tambe desapareix',
                r1.files === 7 && r1.dirs === 4 && d1.calls.chmod >= 1 &&
                !d1.tree[PROJ + BS + 'TNV_V3_CLIP_AUDIO_REF.bin'],
                'files=' + r1.files + ' * dirs=' + r1.dirs + ' * chmod=' + d1.calls.chmod);
            ok('#175/5 la barra final de la ruta no impedeix res i el 1r intent basta',
                r1.attempts === 1 && r1.path === PROJ, 'attempts=' + r1.attempts + ' * path=' + r1.path);

            // ── 2) FITXER BLOQUEJAT PER SEMPRE: no es pot dir "ok" i ha de quedar constancia
            var mp4 = PROJ + BS + 'TNV_V3_CLIP.mp4';
            var d2 = vfs(blocTree(), { lock: function (p) { return p === mp4; } });
            var r2 = await FW.wipe(d2.fs, PROJ, { delay: noWait, maxAttempts: 3 });
            ok('#175/6 fitxer bloquejat: `ok=false`, `RESTES` i la resta queda llistada',
                r2.ok === false && r2.reason === 'RESTES' && r2.attempts === 3 &&
                r2.leftovers.indexOf('TNV_V3_CLIP.mp4') !== -1,
                'ok=' + r2.ok + ' * reason=' + r2.reason + ' * attempts=' + r2.attempts +
                ' * leftovers=' + JSON.stringify(r2.leftovers));
            ok('#175/7 un fitxer bloquejat NO atura la resta de l\'arbre (Auto-Save i Snapshots fora)',
                !d2.tree[PROJ + BS + 'Snapshots' + BS + 'snap_0001.png'] &&
                !d2.tree[PROJ + BS + 'Adobe Premiere Pro Auto-Save'] && r2.files === 6,
                'files=' + r2.files + ' * queda=' + JSON.stringify(Object.keys(d2.tree)));
            ok('#175/8 l\'informe diu QUIN fitxer ha fallat i amb quin codi (EPERM)',
                r2.failed.length >= 1 && r2.failed[0].code === 'EPERM' && r2.failed[0].path === mp4,
                JSON.stringify(r2.failed));

            // ── 3) LOCK TRANSITORI: Premiere l'allibera al cap d'uns intents
            //    (cada intent crida unlinkSync 2 vegades: la 2a es el reintent
            //    despres del chmod, aixi que el lock s'ha de cedir mes enlla).
            var nTry = 0;
            var d3 = vfs(blocTree(), {
                lock: function (p) {
                    if (p !== mp4) { return false; }
                    nTry++;
                    return nTry <= 4;
                }
            });
            var r3 = await FW.wipe(d3.fs, PROJ, { delay: noWait });
            ok('#175/9 reintents: un lock que s\'allibera al 3r intent acaba amb la carpeta BUIDA',
                r3.ok === true && r3.reason === 'ESBORRADA' && r3.attempts >= 2 && Object.keys(d3.tree).length === 0,
                'ok=' + r3.ok + ' * attempts=' + r3.attempts + ' * queda=' + JSON.stringify(Object.keys(d3.tree)));

            // ── 4) CASOS LIMIT: mai "ok" sense haver comprovat
            var r4 = await FW.wipe(d1.fs, '', {});
            ok('#175/10 ruta buida -> RUTA-BUIDA (no toca res)', r4.ok === false && r4.reason === 'RUTA-BUIDA' && r4.attempts === 0,
                'ok=' + r4.ok + ' * reason=' + r4.reason);
            var r5 = await FW.wipe({}, PROJ, {});
            ok('#175/11 sense Node fs -> SENSE-NODE (mai ok en fals)', r5.ok === false && r5.reason === 'SENSE-NODE',
                'ok=' + r5.ok + ' * reason=' + r5.reason);
            var d6 = vfs(blocTree(), {});
            var r6 = await FW.wipe(d6.fs, 'C:' + BS + 'NO-EXISTEIX', { delay: noWait });
            ok('#175/12 carpeta inexistent -> JA-NO-EXISTEIX (ok) sense tocar res',
                r6.ok === true && r6.reason === 'JA-NO-EXISTEIX' &&
                Object.keys(d6.tree).length === Object.keys(blocTree()).length,
                'ok=' + r6.ok + ' * reason=' + r6.reason + ' * arbre=' + Object.keys(d6.tree).length);

            // ── 5) GUARDES ESTATIQUES sobre els fitxers REALS del repo ────────
            var fmb = noComments(await readRepo('js/workflows/flow_mainButton.js'));
            var iReset = fmb.indexOf('runReset: async function');
            var iNew = (iReset >= 0) ? fmb.indexOf('await this._runNew()', iReset) : -1;
            var iGuard = (iReset >= 0) ? fmb.indexOf('if (!wipe.ok)', iReset) : -1;
            var body = (iReset >= 0 && iNew > iReset) ? fmb.slice(iReset, iNew) : '';
            ok('#175/13 runReset usa `wipeFolder` (motor verificat) i ja NO `deleteFolder`',
                /wipeFolder\(/.test(body) && !/deleteFolder\(/.test(body),
                'wipe=' + /wipeFolder\(/.test(body) + ' * delete=' + /deleteFolder\(/.test(body));
            ok('#175/14 runReset AVORTA si `!wipe.ok` ABANS de `_runNew()`',
                iGuard > iReset && iGuard < iNew, 'iReset=' + iReset + ' * iGuard=' + iGuard + ' * iNew=' + iNew);
            ok('#175/15 runReset valida la carpeta abans d\'esborrar (isInsideFolder + tram = bloc)',
                /isInsideFolder\(folder, baseProj\)/.test(body) && /lastSeg !== blocSeg/.test(body),
                'isInside=' + /isInsideFolder\(folder, baseProj\)/.test(body) + ' * tram=' + /lastSeg !== blocSeg/.test(body));
            ok('#175/16 runReset espera l\'alliberament dels locks de Premiere (delay abans del wipe)',
                /getUtils\(\)\.delay\(\d+\)/.test(body) && body.indexOf('getUtils().delay(') < body.indexOf('wipeFolder('),
                'delay=' + /getUtils\(\)\.delay\(\d+\)/.test(body));
            ok('#175/17 runReset buida les copies de marcadors de fora la carpeta',
                /wipeMarkersForProject\(folder\)/.test(body), 'crida=' + /wipeMarkersForProject\(folder\)/.test(body));

            var ed = noComments(await readRepo('js/editor/srt_editor.js'));
            ok('#175/18 srt_editor: `wipeMarkersForProject` filtra per `projectKey`',
                /wipeMarkersForProject: function/.test(ed) && /parsed\.projectKey/.test(ed) && /pk !== key/.test(ed),
                'metode=' + /wipeMarkersForProject: function/.test(ed));

            var ut = noComments(await readRepo('js/core/utils.js'));
            ok('#175/19 utils: `wipeFolder` + `isInsideFolder` i CAP `fs.rmSync` (s\'aturava al 1r error)',
                /wipeFolder: async function/.test(ut) && /isInsideFolder: function/.test(ut) && !/fs\.rmSync\(/.test(ut),
                'wipeFolder=' + /wipeFolder: async function/.test(ut) + ' * rmSync=' + /fs\.rmSync\(/.test(ut));

            var idx = await readRepo('index.html');
            ok('#175/20 index.html carrega `19_Fs_Wipe.js` i ha pujat els cache-busts',
                /19_Fs_Wipe\.js\?v=1/.test(idx) && /utils\.js\?v=26/.test(idx) &&
                /flow_mainButton\.js\?v=33/.test(idx) && /srt_editor\.js\?v=76/.test(idx),
                'modul=' + /19_Fs_Wipe\.js\?v=1/.test(idx) + ' * utils=' + /utils\.js\?v=26/.test(idx) +
                ' * main=' + /flow_mainButton\.js\?v=33/.test(idx) + ' * srt=' + /srt_editor\.js\?v=76/.test(idx));
        } catch (e) {
            ok('#175 la prova no ha llancat cap excepcio', false, e && (e.message + ' | ' + e.stack));
        }
    };
})();
