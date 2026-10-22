/**
 * ============================================================================
 * 19_Fs_Wipe.js - ESBORRAT ABSOLUT d'un arbre de carpetes (RESET GENERAL)
 * ============================================================================
 * PER QUE EXISTEIX (2026-10-21)
 *   El RESET GENERAL (boto de reciclatge de la seccio INICI) ha de deixar la
 *   carpeta del projecte COMPLETAMENT buida: projecte .prproj, escaleta local,
 *   MP4 del bloc, manifest .fastpass.json, snapshots, analisi, .srt, marcadors,
 *   carpetes d'Auto-Save de Premiere... Si en queda UNA resta, el flux NOU que
 *   ve tot seguit treballa sobre material vell (projecte o escaleta d'una altra
 *   versio, manifest amb pistes que ja no existeixen...) i genera mes problemes
 *   que solucions.
 *
 *   La via anterior (utils.deleteFolder -> fs.rmSync amb recursive+force) tenia
 *   dos defectes que aqui es corregeixen:
 *     1) S'ATURA al primer error. A Windows n'hi ha prou que Premiere tingui el
 *        .prproj o la carpeta `Adobe Premiere Pro Auto-Save` oberta uns segons
 *        perque l'esborrat done EPERM i deixe l'arbre MIG esborrat.
 *     2) NO VERIFICA. Retornava false i el RESET continuava endavant creant el
 *        projecte nou sobre les restes.
 *
 * DISSENY
 *   - Esborrat ENTRADA per ENTRADA (readdirSync + lstatSync + unlinkSync +
 *     rmdirSync): un fitxer bloquejat no impedeix esborrar els altres.
 *   - Els fitxers de NOMES LECTURA es desbloquegen amb chmodSync i es reintenten
 *     (a Windows `force` no lleva l'atribut).
 *   - `wipe()` reintenta l'arbre sencer N vegades (Premiere allibera els locks
 *     al cap d'un parell de segons) i ACABA VERIFICANT que la carpeta no hi es.
 *   - TOTES les funcions reben `fs` (Node `fs` o un doble de prova) i cap toca
 *     el disc pel seu compte: el modul es pot provar sense CEP ni Premiere.
 *
 * ACTUALITZACIO 2026-10-22 (#180) - SENSE NODE
 *   En aquest equip el panell NO te Node.js (`_nodeFs()` retorna null: el
 *   manifest no porta `--enable-nodejs`), aixi que `Utils.wipeFolder` responia
 *   SENSE-NODE i el RESET no esborrava RES (nomes ho deia al log). S'afegeix
 *   `cepFs()`: un adaptador amb la mateixa forma que `fs` de Node pero sobre
 *   `cep.fs` (natiu de CEP, SEMPRE present), de manera que el motor d'esborrat
 *   funciona igual amb Node o sense.
 * ============================================================================
 */
(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Logic = FASTPASS_UI.Logic || {};

    var FsWipe = {

        // Cache de l'adaptador cep.fs (es crea una sola vegada per sessio).
        _cepFsCache: null,
        // Coneixement "aquest cami es carpeta" obtingut de `cep.fs.readdir`
        // (evita un stat per entrada): clau normalitzada -> boolean.
        _cepDir: null,

        /**
         * norm: ruta absoluta normalitzada en forma Windows (barres invertides,
         * sense barra final). Conserva el prefix UNC (`\\servidor\recurs`).
         * @param {string} path
         * @returns {string} '' si no hi ha ruta
         */
        norm: function (path) {
            var p = String(path == null ? '' : path);
            if (!p) return '';
            p = p.replace(/\//g, '\\');
            var unc = (p.charAt(0) === '\\' && p.charAt(1) === '\\');
            p = p.replace(/\\{2,}/g, '\\');
            if (unc) p = '\\' + p;
            return p.replace(/\\+$/, '');
        },

        /** key: clau de comparacio (normalitzada i en minuscules). */
        key: function (path) {
            return this.norm(path).toLowerCase();
        },

        /**
         * isInside: cert NOMES si `child` es DINS de `base` (no igual, no germa).
         * Es la guarda que impedeix que un RESET mal calculat esborre una carpeta
         * de data, de programa o l'arrel de projectes.
         * @param {string} child
         * @param {string} base
         * @returns {boolean}
         */
        isInside: function (child, base) {
            var c = this.key(child), b = this.key(base);
            if (!c || !b || c === b) return false;
            return c.indexOf(b + '\\') === 0;
        },

        /** canRemove: el `fs` donat te les primitives que calen per esborrar. */
        canRemove: function (fs) {
            return !!(fs && typeof fs.readdirSync === 'function' &&
                typeof fs.unlinkSync === 'function' && typeof fs.rmdirSync === 'function');
        },

        /**
         * cepFs: adaptador `fs`-like SOBRE `cep.fs` (natiu de CEP, SENSE Node).
         *
         * PER QUE (2026-10-22 · #180): en aquest equip el panell no te Node.js
         * (`_nodeFs()` -> null), i `Utils.wipeFolder` no podia esborrar res: el
         * RESET deia "Node fs no disponible" i s'aturava. `cep.fs` sempre hi es
         * (el log i els llistats ja el fan servir), aixi que el motor d'esborrat
         * pot treballar-hi igual.
         *
         * ATENCIO (verificat a `CEPEngine_extensions.js` de CEP 11 i 12): `cep.fs`
         * NO te `unlink` ni `rmdir`. Te:
         *   readdir(path)            -> {err, data:[{name,isDir,...}]}
         *   stat(path)               -> {err, data:{isDirectory,isFile,...}}
         *   deleteFile(path)         -> {err}   (NOMES fitxers: si es carpeta,
         *                                        torna ERR_NOT_FILE)
         *   chmod(path, mode)        -> {err}   (best effort per a nomes lectura)
         * Per aixo `rmdirSync` llança `CEP-NO-RMDIR` si el CEP no porta `rmdir`:
         * les CARPETES les lleva `Utils._rmTreeProc` amb `cep.process` +
         * PowerShell (API nativa de CEP, sense Node i sense JSX); si eixa via no
         * esta disponible, la carpeta queda BUIDA i el RESET ho sap.
         *
         * Forma EXACTA que espera `removeTree`/`unlink`:
         *   readdirSync(p) -> [noms]  (llança si no es pot llegir)
         *   lstatSync(p)   -> { isDirectory(), isFile() }
         *   unlinkSync(p)  -> true (llança si falla)
         *   rmdirSync(p)   -> true (llança si falla)
         *   existsSync(p)  -> boolean
         *
         * @returns {Object|null} null si `cep.fs` no te les primitives necessaries
         */
        cepFs: function () {
            if (this._cepFsCache) return this._cepFsCache;
            var CF = (window.cep && window.cep.fs) ? window.cep.fs : null;
            // `deleteFile` es el nom REAL a CEP 11/12; `unlink` es dóna tambe per
            // si una versio futura l'exposa.
            var del = (CF && typeof CF.deleteFile === 'function') ? 'deleteFile'
                : ((CF && typeof CF.unlink === 'function') ? 'unlink' : '');
            if (!CF || typeof CF.readdir !== 'function' || !del) {
                return null;
            }
            var self = this;

            /** fail: error amb `code` llegible (el codi numeric de cep.fs). */
            function fail(res, what) {
                var n = (res && res.err != null) ? res.err : '?';
                var e = new Error('cep.fs.' + what + ' (err=' + n + ')');
                e.code = 'CEP-' + n;
                return e;
            }

            var api = {
                existsSync: function (p) {
                    try { if (CF.stat(p).err === 0) return true; } catch (e1) { }
                    try { if (CF.readdir(p).err === 0) return true; } catch (e2) { }
                    return false;
                },
                readdirSync: function (p) {
                    var r = CF.readdir(p);
                    if (!r || r.err !== 0 || !r.data) throw fail(r, 'readdir');
                    var out = [];
                    for (var i = 0; i < r.data.length; i++) {
                        var it = r.data[i];
                        var nm = (typeof it === 'string') ? it : (it && it.name);
                        if (!nm) continue;
                        // CEP 10+ retorna objectes amb `isDir`: s'aprofita per no
                        // fer un stat per entrada (a UNC cada stat costa).
                        if (it && typeof it === 'object' && typeof it.isDir === 'boolean') {
                            self._cepDir = self._cepDir || Object.create(null);
                            self._cepDir[self.key(p + '\\' + nm)] = it.isDir;
                        }
                        out.push(nm);
                    }
                    return out;
                },
                lstatSync: function (p) {
                    var k = self.key(p);
                    var isDir;
                    if (self._cepDir && typeof self._cepDir[k] === 'boolean') {
                        isDir = self._cepDir[k];
                    } else {
                        try {
                            var st = CF.stat(p);
                            if (st && st.err === 0 && st.data) {
                                if (typeof st.data.isDirectory === 'boolean') isDir = st.data.isDirectory;
                                else if (typeof st.data.isFile === 'boolean') isDir = !st.data.isFile;
                            }
                        } catch (eS) { }
                        if (isDir === undefined) {
                            // Sonda: si es pot llistar es carpeta; si no, fitxer.
                            var rd = null;
                            try { rd = CF.readdir(p); } catch (eR) { rd = null; }
                            isDir = !!(rd && rd.err === 0);
                        }
                        self._cepDir = self._cepDir || Object.create(null);
                        self._cepDir[k] = isDir;
                    }
                    return {
                        isDirectory: function () { return !!isDir; },
                        isFile: function () { return !isDir; }
                    };
                },
                unlinkSync: function (p) {
                    var r = CF[del](p);
                    if (!r || r.err !== 0) throw fail(r, del);
                    return true;
                },
                chmodSync: function (p) {
                    // Best effort: a Windows lleva l'atribut de nomes lectura.
                    if (typeof CF.chmod !== 'function') return;
                    var r = CF.chmod(p, 438);   // 0666
                    if (!r || r.err !== 0) throw fail(r, 'chmod');
                },
                rmdirSync: function (p) {
                    // CEP 11/12 NO exposen `rmdir`: les carpetes buides les lleva
                    // `Utils.wipeFolder` amb `_rmTreeViaJsx` i torna a verificar.
                    if (typeof CF.rmdir !== 'function') {
                        var e = new Error('cep.fs sense rmdir (CEP 11/12)');
                        e.code = 'CEP-NO-RMDIR';
                        throw e;
                    }
                    var r = CF.rmdir(p);
                    if (!r || r.err !== 0) throw fail(r, 'rmdir');
                    return true;
                }
            };
            this._cepFsCache = api;
            return api;
        },

        /**
         * exists: existencia tolerant. `existsSync` pot dir que no quan la ruta
         * es un enllac ropat o la xarxa ha tingut un badall; es confirma amb
         * `readdirSync` (que a mes valida que siga una CARPETA).
         */
        exists: function (fs, path) {
            var p = this.norm(path);
            if (!p || !fs) return false;
            try { if (typeof fs.existsSync === 'function' && fs.existsSync(p)) return true; } catch (e1) { }
            try { fs.readdirSync(p); return true; } catch (e2) { }
            return false;
        },

        /**
         * list: noms de les entrades d'una carpeta.
         * @returns {Array<string>|null} null = NO s'ha pogut llegir (no es buida)
         */
        list: function (fs, path) {
            var p = this.norm(path);
            if (!p || !fs || typeof fs.readdirSync !== 'function') return null;
            try { return fs.readdirSync(p) || []; } catch (e) { return null; }
        },

        /** codeOf: codi d'error llegible (EPERM, EACCES, EBUSY, ENOTEMPTY...). */
        codeOf: function (e) {
            if (!e) return 'ERROR';
            return String(e.code || e.message || 'ERROR');
        },

        /**
         * unlink: esborra UN fitxer tolerant errors. Si la primera passa falla
         * (tipic: fitxer de NOMES LECTURA a Windows) es lleva l'atribut amb
         * chmodSync i es reintenta.
         * @param {Object} fs - Node fs (o doble de prova)
         * @param {string} path - ruta completa del fitxer
         * @param {Object} acc - acumulador {removed, files, dirs, failed[]}
         * @returns {boolean} true si el fitxer ja no hi es
         */
        unlink: function (fs, path, acc) {
            var p = path;
            try { fs.unlinkSync(p); acc.files++; acc.removed++; return true; } catch (e1) {
                try { if (typeof fs.chmodSync === 'function') fs.chmodSync(p, 438); } catch (e2) { }
                try { fs.unlinkSync(p); acc.files++; acc.removed++; return true; } catch (e3) {
                    acc.failed.push({ path: p, code: this.codeOf(e3) });
                    return false;
                }
            }
        },

        /**
         * removeTree: esborra l'arbre de `path` ENTRADA per ENTRADA i acumula el
         * resultat. MAI llança: els errors van a `acc.failed` i l'arbre continua
         * (un fitxer bloquejat no ha d'impedir esborrar la resta).
         * @param {Object} fs
         * @param {string} path
         * @param {Object} acc - {removed, files, dirs, failed[]}
         * @returns {Object} el mateix `acc`
         */
        removeTree: function (fs, path, acc) {
            var p = this.norm(path);
            var names = this.list(fs, p);
            if (names === null) {
                // No es pot llegir: o es un FITXER o no tenim permis.
                var st = null;
                try { st = (typeof fs.lstatSync === 'function') ? fs.lstatSync(p) : null; } catch (e1) { st = null; }
                if (st && typeof st.isDirectory === 'function' && !st.isDirectory()) {
                    this.unlink(fs, p, acc);
                    return acc;
                }
                acc.failed.push({ path: p, code: 'NO-LLEGIBLE' });
                return acc;
            }
            for (var i = 0; i < names.length; i++) {
                var full = p + '\\' + names[i];
                var st2 = null;
                try { st2 = (typeof fs.lstatSync === 'function') ? fs.lstatSync(full) : null; } catch (e2) { st2 = null; }
                if (st2 && typeof st2.isDirectory === 'function' && st2.isDirectory()) {
                    this.removeTree(fs, full, acc);
                } else {
                    this.unlink(fs, full, acc);
                }
            }
            try {
                fs.rmdirSync(p);
                acc.dirs++;
                acc.removed++;
            } catch (e3) {
                acc.failed.push({ path: p, code: this.codeOf(e3) });
            }
            return acc;
        },

        /**
         * wipe: ESBORRAT ABSOLUT amb reintents i VERIFICACIO FINAL.
         *
         * Per que reintenta: Premiere allibera el `.prproj`, el `.lock` i la
         * carpeta `Adobe Premiere Pro Auto-Save` un instant DESPRES de
         * `Project.close()`. Un sol intent deixa restes que el flux NOU acaba
         * reaprofitant; amb 4 intents (~1,6 s) el cas normal queda net.
         *
         * @param {Object} fs - Node fs, l'adaptador `cepFs()` o un doble de prova
         * @param {string} path - carpeta (o fitxer) a esborrar
         * @param {Object} [opts] - {maxAttempts=4, waitMs=400, delay=fn(ms)->Promise}
         * @returns {Promise<Object>} informe:
         *   {ok, path, attempts, removed, files, dirs, failed[], leftovers[], reason}
         *   reason: 'ESBORRADA' | 'JA-NO-EXISTEIX' | 'RESTES' | 'RUTA-BUIDA' | 'SENSE-NODE'
         */
        wipe: async function (fs, path, opts) {
            var o = opts || {};
            var wait = (typeof o.delay === 'function') ? o.delay : null;
            var maxAttempts = Math.max(1, parseInt(o.maxAttempts, 10) || 4);
            var waitMs = (o.waitMs != null) ? Number(o.waitMs) : 400;
            var rep = {
                ok: false, path: this.norm(path), attempts: 0,
                removed: 0, files: 0, dirs: 0, failed: [], leftovers: [], reason: ''
            };
            if (!rep.path) { rep.reason = 'RUTA-BUIDA'; return rep; }
            if (!this.canRemove(fs)) { rep.reason = 'SENSE-NODE'; return rep; }
            // Coneixement fresc d'aquest esborrat (l'adaptador cep.fs hi desa si
            // cada entrada es carpeta o fitxer).
            this._cepDir = Object.create(null);
            if (!this.exists(fs, rep.path)) { rep.ok = true; rep.reason = 'JA-NO-EXISTEIX'; return rep; }
            for (var a = 1; a <= maxAttempts; a++) {
                rep.attempts = a;
                var acc = { removed: 0, files: 0, dirs: 0, failed: [] };
                this.removeTree(fs, rep.path, acc);
                rep.removed += acc.removed;
                rep.files += acc.files;
                rep.dirs += acc.dirs;
                rep.failed = acc.failed;
                if (!this.exists(fs, rep.path)) {
                    rep.ok = true;
                    rep.reason = 'ESBORRADA';
                    break;
                }
                rep.reason = 'RESTES';
                // (2026-10-22 · #180) `cep.fs` de CEP 11/12 no te `rmdir`: si l'unic
                // que ha fallat son CARPETES (`CEP-NO-RMDIR`) reintentar no canvia
                // res. Les lleva `Utils._rmTreeProc` (`cep.process` + PowerShell,
                // JS pur) ABANS d'arribar aci; si tampoc pot, queden buides i el
                // RESET ho sap (mai es diu ok sense comprovar).
                var nomesDirs = acc.failed.length > 0;
                for (var f = 0; f < acc.failed.length; f++) {
                    if (acc.failed[f].code !== 'CEP-NO-RMDIR') { nomesDirs = false; break; }
                }
                if (nomesDirs) { break; }
                if (a < maxAttempts && wait) { await wait(waitMs); }
            }
            // Verificacio FINAL (independent dels reintents): la carpeta nomes
            // queda "esborrada" si JA NO HI ES o si es pot llegir i esta BUIDA.
            // Una lectura fallida NO es pot tractar mai com a exit.
            var gone = !this.exists(fs, rep.path);
            var rest = gone ? [] : this.list(fs, rep.path);
            rep.leftovers = rest || [];
            rep.ok = gone || (rest !== null && rest.length === 0);
            if (rep.ok) { rep.reason = 'ESBORRADA'; }
            return rep;
        }
    };

    // Export: el consumeixen `Utils.wipeFolder` / `Utils.deleteFolder`
    // (js/core/utils.js) i el RESET GENERAL (js/workflows/flow_mainButton.js).
    FASTPASS_UI.Logic.FsWipe = FsWipe;

    window.FASTPASS_UI = FASTPASS_UI;
})();
