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
 *
 * AMPLIACIO 2026-10-22 (#180) - EL RESET NO TANCAVA NI ESBORRAVA
 *   Dos forats que el #175 no podia vore (li passaven un `fs` simulat):
 *   1) al panell NO hi ha Node (`_nodeFs()` -> null) i el motor no tenia
 *      alternativa → `SENSE-NODE` i cap fitxer esborrat. Nova part 4b: el MATEIX
 *      arbre, pero amb `cep.fs` simulat, per a `FsWipe.cepFs()`.
 *   2) `runReset` calculava la carpeta amb `_targetDateDir()` (sempre HOY) i el
 *      projecte obert podia ser d'una altra data → no el tancava i el `.prproj`
 *      seguia bloquejat. Nova part 5b/6: `_setupContext()` + carpeta del projecte
 *      obert, `Logic.Project.close()` amb informe verificat i `.lock` DESPRES.
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

            // ── 4b) MOTOR ALTERNATIU `cep.fs` (2026-10-22 · #180) ──────────────
            // En aquest equip el panell NO te Node (`_nodeFs()` -> null: el
            // manifest no porta --enable-nodejs): el RESET responia SENSE-NODE i
            // NO esborrava RES. `cepFs()` fa la mateixa faena amb `cep.fs` (natiu
            // de CEP, sempre present), amb els comptadors i el codi d'error iguals.
            ok('#180/1 `FsWipe.cepFs()` existeix (motor alternatiu sense Node)',
                typeof FW.cepFs === 'function', 'tipus=' + typeof FW.cepFs);

            /**
             * cepDisk: `cep.fs` SIMULAT sobre el mateix arbre del bloc.
             *
             * Per defecte imita el CEP NOU (`unlink`/`rmdir`, com si els tinguera).
             * Amb `hooks.real` imita el CEP 11/12 DE DEBÒ, que NO te ni `unlink`
             * ni `rmdir`: nomes `stat`, `readdir`, `deleteFile` (fitxers) i
             * `chmod`. El borrat de carpetes, doncs, NO pot vindre de cep.fs: ve
             * de `Utils._rmTreeProc` (`cep.process` + PowerShell) o, si no hi es,
             * queda la carpeta BUIDA.
             * `hooks.lock(path)` fa que deleteFile/unlink done err=13 (accés
             * denegat), com un fitxer obert per Premiere.
             */
            function cepDisk(entries, hooks) {
                var t = Object.create(null);
                Object.keys(entries).forEach(function (k) { t[k] = entries[k]; });
                var h = hooks || {};
                var calls = { readdir: 0, unlink: 0, rmdir: 0, stat: 0, deleteFile: 0, chmod: 0 };
                function norm(p) { return String(p || '').replace(/\//g, BS).replace(/\\+$/, ''); }
                var api = {
                    stat: function (p) {
                        calls.stat++;
                        var k = norm(p);
                        if (t[k] === undefined) return { err: 2 };
                        return { err: 0, data: { isDirectory: !!t[k].dir, isFile: !t[k].dir } };
                    },
                    readdir: function (p) {
                        calls.readdir++;
                        var k = norm(p);
                        if (t[k] === undefined || !t[k].dir) return { err: 2 };
                        var pre = k + BS, out = [];
                        for (var key in t) {
                            if (key === k || key.indexOf(pre) !== 0) continue;
                            var rest = key.substring(pre.length);
                            if (rest.indexOf(BS) !== -1) continue;
                            out.push({ name: rest, isDir: !!t[key].dir });
                        }
                        out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
                        return { err: 0, data: out };
                    },
                    unlink: function (p) {
                        calls.unlink++;
                        var k = norm(p);
                        if (t[k] === undefined) return { err: 2 };
                        if (h.lock && h.lock(k)) return { err: 13 };
                        delete t[k];
                        return { err: 0 };
                    },
                    rmdir: function (p) {
                        calls.rmdir++;
                        var k = norm(p);
                        if (t[k] === undefined) return { err: 2 };
                        for (var key in t) { if (key.indexOf(k + BS) === 0) return { err: 145 }; }
                        delete t[k];
                        return { err: 0 };
                    }
                };
                if (h.real) {
                    // CEP 11/12 de debò: `deleteFile` (nomes fitxers) i `chmod`.
                    api.deleteFile = function (p) {
                        calls.deleteFile++;
                        var k = norm(p);
                        if (t[k] === undefined) return { err: 2 };
                        if (t[k].dir) return { err: 12 };           // ERR_NOT_FILE
                        if (h.lock && h.lock(k)) return { err: 13 };
                        delete t[k];
                        return { err: 0 };
                    };
                    api.chmod = function (p) { calls.chmod++; return { err: 0 }; };
                    delete api.unlink;
                    delete api.rmdir;
                }
                return { fs: api, tree: t, calls: calls };
            }

            var oldCep = window.cep;
            try {
                var dC = cepDisk(blocTree(), {});
                window.cep = { fs: dC.fs };
                FW._cepFsCache = null;
                var adapt = FW.cepFs();
                ok('#180/2 adaptador cep.fs amb readdirSync/lstatSync/unlinkSync/rmdirSync',
                    !!(adapt && typeof adapt.readdirSync === 'function' && typeof adapt.lstatSync === 'function' &&
                        typeof adapt.unlinkSync === 'function' && typeof adapt.rmdirSync === 'function'),
                    'adapt=' + !!adapt);

                var rC = await FW.wipe(adapt, PROJ + BS, { delay: noWait });
                ok('#180/3 wipe amb cep.fs esborra TOT l arbre (sense Node)',
                    rC.ok === true && rC.reason === 'ESBORRADA' &&
                    Object.keys(dC.tree).length === 0 && rC.leftovers.length === 0,
                    'ok=' + rC.ok + ' * reason=' + rC.reason + ' * restes=' + Object.keys(dC.tree).length);
                ok('#180/4 cep.fs: comptador de fitxers i carpetes (7 fitxers, 4 carpetes)',
                    rC.files === 7 && rC.dirs === 4, 'files=' + rC.files + ' * dirs=' + rC.dirs);

                var dL = cepDisk(blocTree(), { lock: function (p) { return p === PROJ + BS + 'TNV_V3_CLIP.mp4'; } });
                window.cep = { fs: dL.fs };
                FW._cepFsCache = null;
                var rL = await FW.wipe(FW.cepFs(), PROJ, { delay: noWait, maxAttempts: 2 });
                ok('#180/5 cep.fs: un fitxer bloquejat NO diu ok i informa el codi CEP',
                    rL.ok === false && rL.reason === 'RESTES' &&
                    rL.leftovers.indexOf('TNV_V3_CLIP.mp4') !== -1 &&
                    rL.failed.length >= 1 && /^CEP-/.test(String(rL.failed[0].code)),
                    'ok=' + rL.ok + ' * reason=' + rL.reason + ' * code=' + (rL.failed[0] && rL.failed[0].code));

                // cep.fs DE DEBÒ (CEP 11/12): `deleteFile` i NI `unlink` NI `rmdir`.
                var dR = cepDisk(blocTree(), { real: true });
                window.cep = { fs: dR.fs };
                FW._cepFsCache = null;
                var rR = await FW.wipe(FW.cepFs(), PROJ, { delay: noWait, maxAttempts: 2 });
                var nomesRmdir = rR.failed.length > 0;
                for (var fR = 0; fR < rR.failed.length; fR++) {
                    if (rR.failed[fR].code !== 'CEP-NO-RMDIR') { nomesRmdir = false; break; }
                }
                ok('#180/27 cep.fs REAL (deleteFile, sense rmdir): lleva els 7 fitxers pero NO diu ok (queden 4 carpetes)',
                    rR.ok === false && rR.reason === 'RESTES' && rR.files === 7 && rR.dirs === 0 && nomesRmdir &&
                    Object.keys(dR.tree).length === 4 && dR.calls.deleteFile === 7,
                    'ok=' + rR.ok + ' * files=' + rR.files + ' * dirs=' + rR.dirs + ' * del=' + dR.calls.deleteFile +
                    ' * restes=' + Object.keys(dR.tree).length);
            } finally {
                // El harness NO te `window.cep` (com el panell sense CEP): restaurar
                // sempre, tambe si una assercio peta a mitjan cami.
                if (oldCep === undefined) { try { delete window.cep; } catch (eDel) { } }
                else { window.cep = oldCep; }
                FW._cepFsCache = null;
            }
            ok('#180/6 sense `window.cep` l adaptador torna null (cap estat penjat)',
                FW.cepFs() === null, 'cep=' + !!window.cep);

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

            /**
             * srcMethods: extreu metodes REALS de `js/core/utils.js` i els avalua
             * en un objecte propi. El harness NO carrega utils.js (xafaria els
             * stubs de `UI.Utils` que necessiten les altres proves), aixi que la
             * via d'esborrat nativa es prova sobre el MATEIX codi del repo.
             * @param {string} src - font (sense comentaris)
             * @param {string[]} names
             * @returns {Object}
             */
            function srcMethods(src, names) {
                var out = {
                    log: function () { },
                    delay: function () { return Promise.resolve(); },
                    _nodeFs: function () { return null; },
                    _fsWipe: function () { return FW; }
                };
                for (var i = 0; i < names.length; i++) {
                    var at = src.indexOf('\n        ' + names[i] + ': ');
                    if (at < 0) { continue; }
                    var from = at + 9;
                    var open = src.indexOf('{', from);
                    if (open < 0) { continue; }
                    var depth = 0, end = -1;
                    for (var p = open; p < src.length; p++) {
                        var ch = src.charAt(p);
                        if (ch === '{') { depth++; }
                        else if (ch === '}') { depth--; if (depth === 0) { end = p; break; } }
                    }
                    if (end < 0) { continue; }
                    try {
                        var one = eval('({' + src.substring(from, end + 1) + '})');
                        out[names[i]] = one[names[i]];
                    } catch (eEv) { }
                }
                return out;
            }
            var U = srcMethods(ut, ['_b64utf16', '_rmTreeProc', '_waitGone', '_wipeFs', 'wipeFolder']);

            ok('#175/19 utils: `wipeFolder` + `isInsideFolder` i CAP `fs.rmSync` (s\'aturava al 1r error)',
                /wipeFolder: async function/.test(ut) && /isInsideFolder: function/.test(ut) && !/fs\.rmSync\(/.test(ut),
                'wipeFolder=' + /wipeFolder: async function/.test(ut) + ' * rmSync=' + /fs\.rmSync\(/.test(ut));

            var idx = await readRepo('index.html');
            ok('#175/20 index.html carrega `19_Fs_Wipe.js` i ha pujat els cache-busts',
                /19_Fs_Wipe\.js\?v=2/.test(idx) && /utils\.js\?v=28/.test(idx) &&
                /flow_mainButton\.js\?v=38/.test(idx) && /srt_editor\.js\?v=86/.test(idx),
                'modul=' + /19_Fs_Wipe\.js\?v=2/.test(idx) + ' * utils=' + /utils\.js\?v=28/.test(idx) +
                ' * main=' + /flow_mainButton\.js\?v=38/.test(idx) + ' * srt=' + /srt_editor\.js\?v=86/.test(idx));

            // ── 5b) GUARDES DEL #180 (RESET: tancar el projecte i esborrar de debò) ──
            ok('#180/7 utils: `_wipeFs` tria motor i `wipeFolder`/`deleteFolder` l usen',
                /_wipeFs: function/.test(ut) && /var pick = o\.fs \?/.test(ut) &&
                (ut.match(/_wipeFs\(\)/g) || []).length >= 2 && !/var fs = o\.fs \|\| this\._nodeFs\(\)/.test(ut),
                'wipeFs=' + /_wipeFs: function/.test(ut) + ' * usos=' + (ut.match(/_wipeFs\(\)/g) || []).length);

            var pb = noComments(await readRepo('js/logic/3_Project_Logic.js'));
            var iClose = pb.indexOf('close: async function (opts)');
            var iProjClose = (iClose >= 0) ? pb.indexOf('FASTPASS.Project.close()', iClose) : -1;
            var iLock = (iClose >= 0) ? pb.indexOf('_removeLock(res.path)', iClose) : -1;
            ok('#180/8 Logic.Project.close retorna informe i VERIFICA amb Project.path()',
                iClose > 0 && /ok: false, path: '', closed: false/.test(pb) &&
                /res\.closed = true/.test(pb) && /Project\.path\(\)/.test(pb.slice(iClose, iClose + 4000)),
                'close=' + iClose + ' * closed=' + /res\.closed = true/.test(pb));
            ok('#180/9 el `.lock` s esborra DESPRES de tancar el projecte (no abans)',
                iClose > 0 && iProjClose > iClose && iLock > iProjClose,
                'close=' + iClose + ' * projecte=' + iProjClose + ' * lock=' + iLock);

            ok('#180/10 runReset usa `_setupContext()` (no `_targetDateDir`) com la resta de fluxos',
                /const ctx = await this\._setupContext\(\)/.test(body) && !/_targetDateDir/.test(body),
                'setupContext=' + /const ctx = await this\._setupContext\(\)/.test(body));
            ok('#180/11 runReset adopta la carpeta del projecte obert del MATEIX programa+bloc',
                /_sameProgramBloc\(openFolder, folderSel\)/.test(body) && /_parentFolder\(openPath\)/.test(body),
                'same=' + /_sameProgramBloc\(openFolder, folderSel\)/.test(body));
            ok('#180/12 runReset AVORTA si el projecte no s ha pogut tancar',
                /if \(!closeRes \|\| !closeRes\.ok\)/.test(body),
                'guarda=' + /if \(!closeRes \|\| !closeRes\.ok\)/.test(body));
            ok('#180/13 runReset esborra amb mes intents, alinea la DATA i no refresca el context',
                /maxAttempts: 6, waitMs: 500/.test(body) && /_folderDateSegment\(folder\)/.test(body) &&
                /close\(\{ refreshContext: false \}\)/.test(body),
                'intents=' + /maxAttempts: 6/.test(body) + ' * data=' + /_folderDateSegment\(folder\)/.test(body) +
                ' * ctx=' + /refreshContext: false/.test(body));

            // ── 5c) ESBORRAT DES DE JS, SENSE JSX (2026-10-22 · #180, 2a volta) ──
            // `cep.fs` no te `rmdir` (nomes `deleteFile`) i el manifest NO porta
            // `--enable-nodejs`: el borrat de CARPETES no pot ser ni cep.fs ni JSX.
            // `cep.process` (API nativa CEP 10+, la que ja usa setup.html) llança
            // PowerShell amb `-EncodedCommand` (base64 UTF-16LE) i lleva l'arbre.
            var iRm = ut.indexOf('_rmTreeProc: async function');
            var rmBody = (iRm >= 0) ? ut.slice(iRm, ut.indexOf('_waitGone: async function', iRm)) : '';
            ok('#180/18 utils: `_rmTreeProc` esborra amb `cep.process` (JS pur: sense Node i SENSE JSX)',
                /_rmTreeProc: async function/.test(ut) &&
                /cep\.process\.createProcess\(/.test(rmBody) && /-EncodedCommand/.test(rmBody) &&
                /Remove-Item -LiteralPath/.test(rmBody) && !/callJSX|evalScript/.test(rmBody),
                'metode=' + /_rmTreeProc: async function/.test(ut) + ' * proc=' + /cep\.process\.createProcess\(/.test(rmBody) +
                ' * jsx=' + /callJSX/.test(rmBody));
            ok('#180/19 utils: `wipeFolder` prova la via nativa ABANS de la passada per entrades i informa `via`',
                /if \(!o\.fs && norm && mod\.canRemove\(fs\) && mod\.exists\(fs, norm\)\)/.test(ut) &&
                ut.indexOf('_rmTreeProc(norm)') > 0 && ut.indexOf('_rmTreeProc(norm)') < ut.indexOf('mod.wipe(fs, path') &&
                /via: 'proc'/.test(ut) && /rep\.via = pick\.kind/.test(ut),
                'guarda=' + /if \(!o\.fs && norm/.test(ut) + ' * ordre=' + (ut.indexOf('_rmTreeProc(norm)') < ut.indexOf('mod.wipe(fs, path')));

            // El guio de PowerShell viatja en base64 UTF-16LE: ni espais ni cometes
            // poden trencar-lo (rutes amb espais, accents i prefix UNC).
            var encSrc = "Remove-Item -LiteralPath 'C:" + BS + 'PROVES' + BS + 'TN VESPRE' + BS + 'VERTICALITZACIÓ.prproj' + "' -Recurse -Force";
            var encB64 = U._b64utf16(encSrc);
            var encBack = '';
            try {
                var encBin = window.atob(encB64);
                for (var iE = 0; iE < encBin.length; iE += 2) {
                    encBack += String.fromCharCode(encBin.charCodeAt(iE) | (encBin.charCodeAt(iE + 1) << 8));
                }
            } catch (eE) { encBack = 'ERR:' + eE; }
            ok('#180/20 `_b64utf16` codifica UTF-16LE exacte i sense espais (transport segur)',
                typeof U._b64utf16 === 'function' && encB64.length > 0 &&
                encB64.indexOf(' ') === -1 && encB64.indexOf('"') === -1 && encBack === encSrc,
                'b64=' + encB64.length + ' * igual=' + (encBack === encSrc));

            // Sense `cep.process` la via nativa NO s'usa: no peta i ho diu.
            var prSense = await U._rmTreeProc(PROJ);
            ok('#180/21 sense `cep.process` la via nativa torna started=false (i no toca el disc)',
                prSense && prSense.started === false && prSense.why === 'sense cep.process',
                'started=' + (prSense && prSense.started) + ' * why=' + (prSense && prSense.why));

            var oldCep2 = window.cep;
            try {
                // a) amb `cep.process`: la comanda ha d'anar a powershell.exe en base64
                var seen = null;
                window.cep = {
                    fs: cepDisk(blocTree(), {}).fs,
                    process: {
                        createProcess: function () {
                            seen = Array.prototype.slice.call(arguments);
                            return { data: 4242, err: 0 };
                        }
                    }
                };
                FW._cepFsCache = null;
                var prProc = await U._rmTreeProc(PROJ);
                var iEnc = seen ? seen.indexOf('-EncodedCommand') : -1;
                var encArg = (iEnc >= 0) ? String(seen[iEnc + 1]) : '';
                var encTxt = '';
                try { encTxt = window.atob(encArg); } catch (eB) { encTxt = ''; }
                var decPs = '';
                for (var iD = 0; iD < encTxt.length; iD += 2) {
                    decPs += String.fromCharCode(encTxt.charCodeAt(iD) | (encTxt.charCodeAt(iD + 1) << 8));
                }
                ok('#180/22 amb `cep.process`: powershell.exe + `-EncodedCommand` amb la ruta i `Remove-Item`',
                    prProc.started === true && prProc.pid === 4242 && iEnc > 0 &&
                    String(seen[0]).toLowerCase().indexOf('powershell.exe') > 0 &&
                    decPs.indexOf(PROJ) !== -1 && decPs.indexOf('Remove-Item -LiteralPath') !== -1 &&
                    decPs.indexOf('attrib -R -S -H') !== -1,
                    'pid=' + prProc.pid + ' * exe=' + (seen && seen[0]) + ' * ruta=' + (decPs.indexOf(PROJ) !== -1));

                // b) `wipeFolder` amb `fs` de prova: MAI llança processos (tests deterministes)
                var trampa = 0;
                window.cep.process.createProcess = function () { trampa++; return { data: 1, err: 0 }; };
                var dP = vfs(blocTree(), {});
                var rP = await U.wipeFolder(PROJ, { fs: dP.fs, maxAttempts: 2, waitMs: 0, procWaitMs: 0 });
                ok('#180/23 `wipeFolder` amb `fs` de prova NO llança processos i acaba amb `via=prova`',
                    trampa === 0 && rP.ok === true && rP.via === 'prova' && Object.keys(dP.tree).length === 0,
                    'trampa=' + trampa + ' * ok=' + rP.ok + ' * via=' + rP.via);

                // c) via nativa COMPLETA: el procés buida el disc i la verificacio ho confirma
                var dN = cepDisk(blocTree(), {});
                window.cep = {
                    fs: dN.fs,
                    process: {
                        createProcess: function () {
                            Object.keys(dN.tree).forEach(function (k) {
                                if (k === PROJ || k.indexOf(PROJ + BS) === 0) { delete dN.tree[k]; }
                            });
                            return { data: 555, err: 0 };
                        }
                    }
                };
                FW._cepFsCache = null;
                var rN = await U.wipeFolder(PROJ + BS);
                ok('#180/24 via nativa: `ok` VERIFICAT al disc (via=proc) i cap error informat',
                    rN.ok === true && rN.reason === 'ESBORRADA' && rN.via === 'proc' &&
                    Object.keys(dN.tree).length === 0,
                    'ok=' + rN.ok + ' * via=' + rN.via + ' * reason=' + rN.reason);

                // d) si el procés deixa restes, es reintenta ENTRADA per ENTRADA amb cep.fs
                var dF = cepDisk(blocTree(), {});
                window.cep = {
                    fs: dF.fs,
                    process: { createProcess: function () { return { data: 666, err: 0 }; } }
                };
                FW._cepFsCache = null;
                var rF = await U.wipeFolder(PROJ, { procWaitMs: 0, maxAttempts: 2, waitMs: 0 });
                ok('#180/26 si el procés no esborra, es reintenta per entrades amb cep.fs i acaba net',
                    rF.ok === true && rF.via === 'cep.fs' && Object.keys(dF.tree).length === 0,
                    'ok=' + rF.ok + ' * via=' + rF.via + ' * restes=' + Object.keys(dF.tree).length);
            } finally {
                if (oldCep2 === undefined) { try { delete window.cep; } catch (eC2) { } }
                else { window.cep = oldCep2; }
                FW._cepFsCache = null;
            }

            // ── 6) `Logic.Project.close()` amb el PONT simulat (2026-10-22 · #180) ──
            var LP = UI.Logic && UI.Logic.Project;
            var origCall = UI.Utils.callJSX;
            var origDelay = UI.Utils.delay;
            try {
                ok('#180/14 `Logic.Project.close` disponible al bundle',
                    !!(LP && typeof LP.close === 'function'), 'close=' + !!(LP && LP.close));

                var openP = 'C:' + BS + 'PROVES' + BS + 'TNV' + BS + '2026_10_22' + BS + 'V1' + BS + 'Pruebas_TNV_V1.prproj';
                var calls = [];
                // a) el projecte es tanca al primer intent
                UI.Utils.callJSX = async function (expr) {
                    calls.push(expr);
                    if (expr.indexOf('FASTPASS.Project.path()') === 0) {
                        var tancat = calls.filter(function (c) { return c.indexOf('.close()') !== -1; }).length;
                        return tancat ? '' : openP;
                    }
                    if (expr.indexOf('FASTPASS.Project.close()') === 0) { return 'OK'; }
                    return 'OK';
                };
                UI.Utils.delay = function () { return Promise.resolve(); };
                var rA = await LP.close();
                ok('#180/15 close OK: informe ok/closed i el lock DESPRES de tancar',
                    rA.ok === true && rA.closed === true && rA.path === openP &&
                    calls.indexOf("IO.remove('" + openP.replace(/\\/g, '/') + ".lock')") >
                    calls.indexOf('FASTPASS.Project.close()'),
                    'ok=' + rA.ok + ' * closed=' + rA.closed + ' * calls=' + calls.length);

                // b) el projecte NO es tanca: ho ha de dir i no tocar el lock
                calls = [];
                UI.Utils.callJSX = async function (expr) {
                    calls.push(expr);
                    if (expr.indexOf('FASTPASS.Project.path()') === 0) { return openP; }
                    if (expr.indexOf('FASTPASS.Project.close()') === 0) { return 'ERR:CLOSE_FAILED'; }
                    return 'OK';
                };
                var rB = await LP.close();
                ok('#180/16 close KO: ok=false, error informat i cap IO.remove del lock',
                    rB.ok === false && rB.closed === false && !!rB.error &&
                    !calls.some(function (c) { return c.indexOf('IO.remove(') === 0; }),
                    'ok=' + rB.ok + ' * error=' + rB.error);

                // c) sense projecte obert no es un error
                UI.Utils.callJSX = async function () { return ''; };
                var rS = await LP.close();
                ok('#180/17 close sense projecte obert: ok i res a tancar',
                    rS.ok === true && rS.closed === false, 'ok=' + rS.ok + ' * closed=' + rS.closed);
            } finally {
                UI.Utils.callJSX = origCall;
                UI.Utils.delay = origDelay;
            }
        } catch (e) {
            ok('#175 la prova no ha llancat cap excepcio', false, e && (e.message + ' | ' + e.stack));
        }
    };
})();
