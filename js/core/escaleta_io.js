/**
 * ============================================================================
 * FASTPASS_UI.EscaletaReader: Sub-mòdul IO  (MODEL LOCAL-FIRST)
 * ============================================================================
 * L'escaleta es treballa SEMPRE al DIRECTORI DEL PROJECTE:
 *   - la còpia feta prèviament del NAS (YYYYMMDD_HHMMSS_<PROG>_<V*>_….json)
 *   - o la «foto» generada amb el botó FOTO (escaleta_on_demand_<ts>.json)
 *
 * (2026-10-23) La carpeta central d'escaletes del NAS ja NO es consulta ni es
 * llista: va desaparèixer del flux junt amb la verticalització. Si al directori
 * del projecte no hi ha cap escaleta vàlida, el flux de CREAR fa una FOTO i
 * torna a cridar `ensureLocalCopy` / `findInFolder`.
 *
 * Depèn de: escaleta_config.js (applyDurationOverrides)
 *           escaleta_timecode.js (tcToSeconds)
 *           escaleta_bounds.js (getBlock, getLinesForBlock, isBlockFullyEmitted)
 *
 * Mètodes:
 *   - _escapePath(p)
 *   - _listProjectFiles(dir)   llistat natiu (Node → CEP → ExtendScript)
 *   - extractBlockIdFromFilename(name)
 *   - findInFolder(dir, prog)  JSON local més recent i vàlid
 *   - ensureLocalCopy(ctx)     escaleta del directori del projecte (només local)
 *   - lookupLocalStatus(ctx)   estat del semàfor des del directori del projecte
 *   - load(jsonPath, reload)   lectura UTF-8 + parseig + sanejament
 * ============================================================================
 */
(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    var ER = FASTPASS_UI.EscaletaReader || {};

    var callJSX = function (s) {
        return window.FASTPASS_UI.Utils && window.FASTPASS_UI.Utils.callJSX
            ? window.FASTPASS_UI.Utils.callJSX(s)
            : '';
    };

    var log = function (m) {
        (window.FASTPASS_UI.Utils && window.FASTPASS_UI.Utils.log)
            ? window.FASTPASS_UI.Utils.log(m, 'DEBUG')
            : (window.console && window.console.log(m));
    };

    /**
     * _escapePath: Escapa una ruta per incrustar-la dins d'una crida JSX.
     * @param {string} p
     * @returns {string}
     */
    ER._escapePath = function (p) {
        return p.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    };
    var _bm = function (lbl) {
        try {
            var B = window.FASTPASS_UI && window.FASTPASS_UI.Boot;
            if (B && typeof B.mark === 'function') B.mark('[EscaletaIO] ' + lbl);
        } catch (eBm) { }
    };
    var _bsecLoad = function (ms) {
        return (ms >= 10000 ? (Math.round(ms / 100) / 10) + ' s' : ms + ' ms');
    };
    var BS = String.fromCharCode(92);


    /** _stripTrail: lleva els separadors finals d'una carpeta. */
    var _stripTrail = function (p) {
        var s = String(p || '');
        while (s.length > 1) {
            var ch = s.charAt(s.length - 1);
            if (ch !== BS && ch !== '/') break;
            s = s.substring(0, s.length - 1);
        }
        return s;
    };

    /** _nodeFs: `fs` de Node (cascada cep_node → require). Cachejat al mòdul. */
    ER._nodeFs = function () {
        if (this.__nodeFs !== undefined) return this.__nodeFs;
        var fs = null;
        try {
            if (window.cep_node && typeof window.cep_node.require === 'function') {
                fs = window.cep_node.require('fs');
            }
        } catch (eN1) { fs = null; }
        if (!fs) {
            try {
                if (typeof require === 'function') fs = require('fs');
            } catch (eN2) { fs = null; }
        }
        this.__nodeFs = fs || null;
        return this.__nodeFs;
    };

    /**
     * _listViaNode: readdir + stat ASÍNCRON (Node). No bloqueja ni el motor de
     * Premiere ni el fil de la UI. Només fitxers .json (és tot el que cal).
     * @param {string} p - directori
     * @returns {Promise<{raw:string, count:number}>|null} null si Node no hi és
     */
    ER._listViaNode = function (p) {
        var fs = this._nodeFs();
        if (!fs || typeof fs.readdir !== 'function') return null;
        var dir = _stripTrail(p);
        return new Promise(function (resolve) {
            fs.readdir(dir, function (err, names) {
                if (err || !names) { resolve(null); return; }
                var entries = [];
                for (var i = 0; i < names.length; i++) {
                    var nm = String(names[i] || '');
                    if (!nm) continue;
                    if (nm.toLowerCase().indexOf('.json') !== nm.length - 5) continue;
                    entries.push(nm);
                }
                if (entries.length === 0) { resolve({ raw: '[]', count: 0 }); return; }
                var out = [];
                var pending = entries.length;
                entries.forEach(function (name) {
                    var full = dir + BS + name;
                    var push = function (isDir, modified, created, size) {
                        out.push({
                            name: name, path: full, isDir: !!isDir,
                            modified: modified || 0, created: created || 0, size: size || 0
                        });
                        if (--pending === 0) resolve({ raw: JSON.stringify(out), count: out.length });
                    };
                    if (typeof fs.stat !== 'function') { push(false, 0, 0, 0); return; }
                    fs.stat(full, function (eS, st) {
                        if (eS || !st) { push(false, 0, 0, 0); return; }
                        var isDir = (typeof st.isDirectory === 'function') ? st.isDirectory() : false;
                        var mod = st.mtime ? new Date(st.mtime).getTime() : 0;
                        var cre = st.birthtime ? new Date(st.birthtime).getTime() : 0;
                        push(isDir, mod, cre, st.size);
                    });
                });
            });
        });
    };

    /**
     * _listViaCep: readdir natiu de CEP (síncron, sense obrir el motor).
     * @param {string} p - directori
     * @returns {Array<{name,path,isDir,modified,created,size}>|null}
     */
    ER._listViaCep = function (p) {
        if (!window.cep || !window.cep.fs || typeof window.cep.fs.readdir !== 'function') return null;
        var res = null;
        try { res = window.cep.fs.readdir(p); } catch (eCep) { return null; }
        if (!res || res.err !== 0 || !res.data) return null;
        var base = _stripTrail(p);
        var out = [];
        for (var i = 0; i < res.data.length; i++) {
            var name = String(res.data[i] || '');
            if (!name) continue;
            if (name.toLowerCase().indexOf('.json') !== name.length - 5) continue;
            var full = base + BS + name;
            var isDir = false, modified = 0, created = 0, size = 0;
            try {
                var st = window.cep.fs.stat(full);
                if (st && st.err === 0 && st.data) {
                    isDir = (st.data.isDirectory === true) || (st.data.isDir === true);
                    modified = st.data.modified || 0;
                    size = st.data.size || 0;
                }
            } catch (eC) { }
            out.push({ name: name, path: full, isDir: isDir, modified: modified, created: created, size: size });
        }
        return out;
    };

    /**
     * _listProjectFiles: Llistat dels .json del directori del projecte.
     * Cascada Node (asíncron) → CEP natiu → ExtendScript (últim recurs).
     * @param {string} p - directori
     * @returns {Promise<Array<{name,path,isDir,modified,created,size}>|null>}
     */
    ER._listProjectFiles = async function (p) {
        if (!p) return null;
        // 1) Node: asíncron, fora del motor i del fil de la UI.
        var pNod = this._listViaNode(p);
        if (pNod) {
            try {
                var nod = await pNod;
                if (nod && nod.raw) {
                    var arrN = JSON.parse(nod.raw);
                    if (arrN && arrN.length) return arrN;
                }
            } catch (eN) {
                log('⚠️ [ER:IO] readdir Node KO (' + p + '): ' + (eN && eN.message));
            }
        }
        // 2) CEP natiu (síncron, sense stats per fitxer).
        try {
            var arrC = this._listViaCep(p);
            if (arrC && arrC.length) return arrC;
        } catch (eC) { }
        // 3) JSX — últim recurs (bloqueja el motor: només si Node i CEP fallen).
        try {
            var raw = await callJSX("IO.listFolder('" + this._escapePath(p) + "')");
            if (!raw || raw === '[]' || raw.indexOf('ERR') === 0) return null;
            var arr = JSON.parse(raw);
            return (arr && arr.length) ? arr : [];
        } catch (eJ) { return null; }
    };
    // ----------------------------------------------------------------
    // 2. LOCALITZAR L'ESCALETA AL DIRECTORI DEL PROJECTE
    // ----------------------------------------------------------------

    /**
     * extractBlockIdFromFilename: Extreu el blockId (V1, V2, V3, V4) del nom d'un fitxer JSON.
     * Format de la còpia del NAS: YYYYMMDD_HHMMSS_PROGRAMA_BLOQUE_...json
     * @param {string} filename
     * @returns {string|null} BlockId (ex: "V1") o null si no es pot extreure
     */
    ER.extractBlockIdFromFilename = function (filename) {
        if (!filename) return null;
        var m = filename.match(/_(V\d+)_/i);
        return m ? m[1].toUpperCase() : null;
    };

    /**
     * findInFolder: Busca el JSON d'escaleta més recent al directori del projecte.
     * Reconeix tant les escaletes copiades del NAS (YYYYMMDD_HHMMSS_PROGRAMA_*.json)
     * com les generades pel botó Foto (escaleta_on_demand_*.json).
     *
     * @param {string} folderPath - Directori del projecte (on viu el .prproj)
     * @param {string} [programArchivo] - Filtre opcional pel nom del programa (ex: "TN_VESPRE")
     * @returns {Promise<{path:string, filename:string}|null>}
     */
    ER.findInFolder = async function (folderPath, programArchivo) {
        if (!folderPath) return null;
        try {
            // (2026-10-21) Llistat NATIU (Node → CEP → JSX): abans era sempre
            // IO.listFolder, una obertura del motor per cada checkContext.
            var files = await this._listProjectFiles(folderPath);
            if (!files || files.length === 0) return null;


            var progKey = programArchivo ? programArchivo.toUpperCase() : null;
            var candidates = files.filter(function (f) {
                var name = (f.name || '');
                if (name.toLowerCase().indexOf('.json') !== name.length - 5) return false;
                var isNasCopy = /^\d{8}_\d{6}_/.test(name);
                var isOnDemand = name.indexOf('escaleta_on_demand') === 0;
                if (!isNasCopy && !isOnDemand) return false;
                if (progKey) {
                    // Escaletes del NAS copiades: han de contenir el programa.
                    // Les on_demand no porten programa al nom, es consideren del projecte actiu.
                    return name.toUpperCase().indexOf(progKey) !== -1 || isOnDemand;
                }
                return true;
            });
            if (candidates.length === 0) return null;


            // ── PRIORITAT (2026-09-16): la FOTO (escaleta_on_demand_*) mana SEMPRE sobre
            // les còpies del NAS: si l'usuari ha fet FOTO, aquesta és la font. Dins de
            // cada grup, la més recent. I es descarten els JSON invàlids (fitxers
            // d'error del motor: {"missatge":"Error",...}) així com els que no es poden
            // llegir.
            candidates.sort(function (a, b) { return (b.modified || 0) - (a.modified || 0); });
            var fotos = [], nasCopies = [];
            for (var ci2 = 0; ci2 < candidates.length; ci2++) {
                var nm2 = String(candidates[ci2].name || '');
                if (nm2.indexOf('escaleta_on_demand') === 0) fotos.push(candidates[ci2]);
                else nasCopies.push(candidates[ci2]);
            }
            var ordered = fotos.concat(nasCopies);
            var maxTryF = Math.min(ordered.length, 4);
            for (var fi2 = 0; fi2 < maxTryF; fi2++) {
                var best = ordered[fi2];
                var path = folderPath.replace(/[\\/]+$/, '') + '\\' + best.name;
                var localData = null;
                try { localData = await this.load(path, true); } catch (eLF) { localData = null; }
                if (!localData) {
                    log('\u26A0\uFE0F [ER:IO] Escaleta local descartada (no vàlida): ' + best.name);
                    continue;
                }
                log('\uD83D\uDCC1 [ER:IO] Escaleta local trobada: ' + best.name + (fi2 < fotos.length ? ' [FOTO]' : ''));
                return { path: path, filename: best.name };
            }
            log('\u274C [ER:IO] Cap escaleta local vàlida al directori del projecte');
            return null;
        } catch (e) {
            log('\u26A0\uFE0F [ER:IO] Error en findInFolder: ' + e.message);
            return null;
        }
    };

    /**
     * ensureLocalCopy: Retorna l'escaleta VÀLIDA del directori del projecte.
     *
     * (2026-10-23 · MODEL LOCAL-FIRST) El directori del projecte és l'ÚNICA font:
     * la còpia prèvia de l'escaleta o la «foto» del botó FOTO. La carpeta central
     * d'escaletes del NAS ja NO es consulta; si no hi ha res, el flux de CREAR fa
     * una FOTO nova i torna a cridar aquesta funció.
     *
     * @param {Object} ctx - Context del projecte (config, progData, dateDir, bloque)
     * @returns {Promise<{path:string, filename:string}|null>} Escaleta local
     */
    ER.ensureLocalCopy = async function (ctx) {
        if (!ctx || !ctx.config || !ctx.progData || !ctx.dateDir) return null;
        var folderPath = window.FASTPASS_UI.Utils.workFolder(ctx);
        var local = await this.findInFolder(folderPath, ctx.progData.archivo);
        if (local) return local;
        log('ℹ️ [ER:IO] Sense escaleta al directori del projecte (caldrà una FOTO)');
        return null;
    };

    // ----------------------------------------------------------------
    // 3. LLEGIR I PARSEJAR EL JSON
    // ----------------------------------------------------------------


    /**
     * lookupLocalStatus: Comprova si al directori del projecte del dia hi ha una
     * escaleta local — còpia del NAS (YYYYMMDD_HHMMSS_*.json) o la "foto" generada
     * amb el botó FOTO (escaleta_on_demand_*.json) — i retorna el seu estat en el
     * mateix format que la resta del semafor.
     *
     * S'usa a checkContext com a FONT ALTERNATIVA quan el servidor central encara
     * no té el JSON del dia (bloc acabat d'emetre): si la foto local existeix, la
     * extensió pot passar de "MASSA D'HORA" a "CREAR".
     *
     * @param {Object} ctx - Context (config, progData, dateDir, bloque)
     * @returns {Promise<{found, ready, local, filename, timestamp, mediaStop, blockOut, wottsExpected, totalExpected}>}
     */
    ER.lookupLocalStatus = async function (ctx) {
        if (!ctx || !ctx.config || !ctx.progData || !ctx.dateDir) {
            return { found: false, ready: false };
        }
        try {
            var folderPath = window.FASTPASS_UI.Utils.workFolder(ctx);
            // (2026-10-21) Llistat NATIU. Abans: IO.listFolder (motor) — i a més
            // es llistava aquesta mateixa carpeta dues vegades per checkContext.
            var files = await this._listProjectFiles(folderPath);
            if (!files || files.length === 0) return { found: false, ready: false };


            var progKey = (ctx.progData.archivo || '').toUpperCase();
            var candidates = files.filter(function (f) {
                var name = String(f.name || '');
                if (name.toLowerCase().indexOf('.json') !== name.length - 5) return false;
                var isNasCopy = /^\d{8}_\d{6}_/.test(name);
                var isOnDemand = name.indexOf('escaleta_on_demand') === 0;
                if (!isNasCopy && !isOnDemand) return false;
                // Les còpies del NAS han de contenir el programa; les on_demand no
                // porten programa al nom (es consideren del dia/projecte actiu).
                if (progKey) return name.toUpperCase().indexOf(progKey) !== -1 || isOnDemand;
                return true;
            });
            if (candidates.length === 0) return { found: false, ready: false };


            // ── PRIORITAT (2026-09-16): la FOTO (escaleta_on_demand_*) va PRIMER: si
            // l'usuari ha fet FOTO, aquesta és la font, encara que hi hagi una còpia del
            // NAS més recent. Dins de cada grup, la més recent.
            candidates.sort(function (a, b) { return (b.modified || 0) - (a.modified || 0); });
            var fotosL = [], nasL = [];
            for (var ciL = 0; ciL < candidates.length; ciL++) {
                if (String(candidates[ciL].name || '').indexOf('escaleta_on_demand') === 0) fotosL.push(candidates[ciL]);
                else nasL.push(candidates[ciL]);
            }
            candidates = fotosL.concat(nasL);


            // Iterar de més recent a més antic: el primer que contingui el bloc és la
            // foto/escaleta vàlida del bloc demanat (sense mirar el repositori central).
            for (var ci = 0; ci < candidates.length; ci++) {
                var cand = candidates[ci];
                var path = folderPath.replace(/[\\/]+$/, '') + '\\' + cand.name;
                var data = await this.load(path);
                if (!data) continue;
                var block = this.getBlock(data, ctx.bloque);
                if (!block) continue;


                var mediaScan = data.cleanFeed ? data.cleanFeed : {};
                var lines = this.getLinesForBlock(data, ctx.bloque);
                var wottsExpected = lines
                    .filter(function (l) { return l.num && (l.teVideo || ['OFT', 'BVI'].indexOf(l.font) !== -1); })
                    .map(function (l) { return l.num; });


                // Criteri d'arrancada: la FOTO (o la còpia local) és vàlida si TOTS els
                // ítems del bloc ja s'han emès. Si el bloc encara s'està emetent, l'estat
                // queda en ESPERANT encara que la foto existeixi.
                var complete = { ok: false, emitted: 0, total: 0, reason: 'n/d', pending: null };
                try {
                    if (typeof this.isBlockFullyEmitted === 'function') {
                        complete = this.isBlockFullyEmitted(data, ctx.bloque);
                    }
                } catch (eCE) { }
                var isOnDemand = String(cand.name).indexOf('escaleta_on_demand') === 0;
                // FIX (2026-09-16): una FOTO sempre és utilitzable (l'usuari l'ha
                // demanada expressament), encara que el bloc no consti com a emès del tot.
                var isReady = isOnDemand || !!complete.ok;
                log('📷 [ER:IO] Escaleta local trobada per al bloc ' + ctx.bloque + ': ' + cand.name +
                    (isOnDemand ? ' [FOTO → té preferència]' : ' [còpia NAS]'));
                return {
                    found: true,
                    ready: isReady,
                    local: true,
                    isFoto: isOnDemand,
                    complete: complete,
                    filename: cand.name,
                    timestamp: isOnDemand ? 'FOTO' : String(cand.name).split('_').slice(-2).join('_').replace('.json', ''),
                    mediaStop: mediaScan.mediaStop || null,
                    blockOut: block.out || null,
                    wottsExpected: Array.from(new Set(wottsExpected)),
                    totalExpected: wottsExpected.length
                };
            }


            // Hi ha candidats locals però cap conté el bloc demanat.
            if (candidates.length > 0) {
                log('⚠️ [ER:IO] Escaleta local sense bloc ' + ctx.bloque + ': ' + candidates[0].name);
                return { found: true, ready: false, local: true, filename: candidates[0].name };
            }
            return { found: false, ready: false };
        } catch (e) {
            log('⚠️ [ER:IO] Error en lookupLocalStatus: ' + e.message);
            return { found: false, ready: false };
        }
    };

    /**
     * truncateAtTempsFinal: Talla l'escaleta a l'ítem "TEMPS FINAL".
     *
     * (2026-10-02 · regla d'usuari) L'editor de l'escaleta hi deixa ítems de prova
     * DESPRÉS del marcatge "TEMPS FINAL" (ex: TNM V1 01/10: un ítem de V1 solt al
     * final). El playout NO els emet, però contaminaven els bounds del bloc (talls
     * massa llargs) i els marcadors.
     * Regla: en repassar els ítems, el primer que conté "TEMPS FINAL" (inclòs) marca
     * el final de l'escaleta útil → el procés s'atura aquí.
     *
     * S'aplica dins de ER.load, just abans de cachejar: tots els consumidors (bounds,
     * marcadors, manifest `escaletaItems`, semàfor d'estat) veuen la MATEIXA escaleta
     * retallada, sense haver de repetir la regla a cada flux.
     *
     * @param {Object} data - JSON complet de l'escaleta (es muta in-place)
     * @returns {{cut:number, dropped:number, titol:string}|null} null si no hi és
     */
    ER.truncateAtTempsFinal = function (data) {
        var lines = (data && data.escaleta && data.escaleta.liniesEscaleta)
            ? data.escaleta.liniesEscaleta : null;
        if (!lines || lines.length === 0) return null;
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i] || {};
            var text = String(l.titol || l.titular || l.nom || '');
            if (text.toUpperCase().indexOf('TEMPS FINAL') !== -1) {
                var dropped = lines.length - i;
                data.escaleta.liniesEscaleta = lines.slice(0, i);
                return { cut: i, dropped: dropped, titol: text };
            }
        }
        return null;
    };


    /**
     * load: Llegeix el JSON des de la ruta UNC via bridge JSX i el parseja.
     * Cacheja el resultat a window.FASTPASS_UI.State._escaletaCache
     * per evitar parsejar el mateix JSON de 7000+ línies fins a 5 cops per workflow.
     * @param {string} jsonPath - ruta UNC completa al fitxer
     * @param {boolean} [forceReload=false] - Si true, ignora la cache i rellegeix
     * @returns {Promise<Object|null>} - { cleanFeed, parallelAntena, escaleta }
     */
    ER.load = async function (jsonPath, forceReload) {
        var state = window.FASTPASS_UI.State;
        if (!forceReload && state._escaletaCache && state._escaletaCache.path === jsonPath) {
            log('\uD83D\uDCE6 [ER:IO] JSON retornat de cache: ' + jsonPath);
            return state._escaletaCache.data;
        }


        log('\uD83D\uDCD6 [ER:IO] Llegint JSON: ' + jsonPath);
        try {
            var _tLoad = Date.now();
            // (2026-09-23) LLEGIR EN UTF-8 des del COSTAT JS (window.cep.fs.readFile).
            // ExtendScript (IO.readTxt) llegeix el fitxer com a ANSI/Latin-1 → ELS CARÀCTERS
            // CATALANS DEL JSON ES CORROMPIEN i el tema (i per tant el nom del projecte i de la
            // seqüència) sortia tipus "TNC_COMENÃ‡A LA TARDOR…" (queixa d'usuari 2026-09-23).
            // Es manté IO.readTxt com a RESPATLLER si cep.fs no estigués disponible.
            var raw = null;
            // (2026-10-21) `cep.fs.readFile` vol el camí amb '\': `workFolder()`
            // genera els segments amb '/' (…\PROVES\02_COMARQUES_PROJECTES/2026_10_20/V1/…)
            // i el natiu responia err=3 → es queia al respatller ExtendScript (una
            // crida al motor que BLOQUEJA Premiere + accents en risc de mojibake).
            // Es normalitza NOMÉS per al natiu: el camí original es conserva per
            // als logs i com a clau de la memòria cau.
            var cepPath = String(jsonPath).split('/').join(BS);
            try {
                var fRes = window.cep.fs.readFile(cepPath);
                if (fRes && fRes.err === 0 && fRes.data) {
                    raw = fRes.data;
                } else {
                    log('\u26A0\uFE0F [ER:IO] cep.fs.readFile err=' + (fRes && fRes.err) + ' → respatller JSX');
                }
            } catch (eRf) {
                log('\u26A0\uFE0F [ER:IO] cep.fs.readFile ha fallat (' + eRf.message + ') → respatller JSX');
            }
            if (!raw) {
                log('\u26A0\uFE0F [ER:IO] Llegint amb ExtendScript: els accents d\'aquest JSON poden sortir malmesos');
                raw = await callJSX("IO.readTxt('" + this._escapePath(jsonPath) + "')");
            }
            if (!raw || raw === '' || raw.indexOf('ERR') === 0) {
                log('\u26A0\uFE0F [ER:IO] No s\'ha pogut llegir: ' + jsonPath);
                return null;
            }
            // ── (2026-10-02) REPARACIÓ DE MOJIBAKE A LA CARREGA ────────────────
            // Les escaletes FOTO (escaleta_on_demand_*.json) escrites fins ara passaven
            // pel pont ExtendScript amb el text JA malmès pel descodificador ANSI →
            // el fitxer quedava DOBLEMENT codificat ("CRÃ’NICA VÃ�CTOR", 74 "Ã" + 5 U+FFFD
            // al bloque V1 de TNC 02/10) i el tema en sortia com a "CRANICA VACTOR".
            // Es repara EN MEMÒRIA perquè cap consumidor arribi a veure el text malmès.
            try {
                var U = window.FASTPASS_UI.Utils;
                if (U && U._isMojibake && U._isMojibake(raw)) {
                    raw = U._fromMojibake(raw, String(jsonPath || '').split(/[\/\\]/).pop());
                }
            } catch (eMb) { /* si no es pot reparar, es continua amb el text original */ }
            var data = JSON.parse(raw);
            // ── Validar que el JSON és una escaleta real, no un error del servidor ──
            // Ex: JSON V3 de TNC 06/07: {"missatge":"Error","debugInfo":"No s'ha localitzat..."}
            if (data.missatge || !data.cleanFeed || !data.escaleta) {
        // Motiu real per al semafor (2026-09-17): abans nomes anava al log, aixi que
        // l'usuari veia "ESPERANT" sense saber que el motor publicava un error
        // (p. ex. {"missatge":"L'escaleta no existeix","debugInfo":"/v2/escaletes/PRO1278/_clips"}).
        ER._lastReject = {
            filename: String(jsonPath || '').split(/[\/\\]/).pop(),
            reason: data.missatge
                ? (data.missatge + (data.debugInfo ? ' [' + String(data.debugInfo).substring(0, 120) + ']' : ''))
                : 'estructura invalida (sense cleanFeed/escaleta)'
        };
                log('\u26A0\uFE0F [ER:IO] JSON descartat (error del servidor o estructura invàlida): ' + jsonPath);
                if (data.missatge) log('\u26A0\uFE0F [ER:IO]   Motiu: ' + data.missatge + (data.debugInfo ? ' [' + String(data.debugInfo).substring(0, 160) + ']' : ''));
                return null;
            }
            var clipCount = data && data.cleanFeed && data.cleanFeed.clips ? data.cleanFeed.clips.length : 0;
            var _jf = String(jsonPath || '').split(BS).pop().split('/').pop();
            _bm('JSON ' + _jf + ' llegit+parsejat (' + _bsecLoad(Date.now() - _tLoad) + ', ' +
                Math.round(String(raw).length / 1024) + ' KB)');
            log('\u2705 [ER:IO] JSON parsejat. Blocs cleanFeed: ' + clipCount);
            var corrected = this.applyDurationOverrides(data);
            if (corrected > 0) {
                log('\uD83D\uDCD0 [ER:IO] ' + corrected + ' duracions corregides a l\'escaleta');
            }
            // (2026-09-21) SANEJAT GLOBAL d'hores mentideres: abans només s'aplicava dins de
            // calcPrecisionTrimBounds, però els fluxos de MARCADORS/ANÀLISI tornen a llegir el
            // JSON i tornaven a donar per bo el TC mentider (cas TNM V2 21/09: "20p7" disparat
            // a 14:27:34, anterior a l'inici de programa, i amb duradaOnAir "0:-1" corrupta).
            // Ara es neteja a la CÀRREGA, abans que cap consumidor el llegeixi.
            try {
                if (typeof this._sanitizeOnAirLies === 'function') {
                    var nLies = this._sanitizeOnAirLies(data, null);
                    if (nLies > 0) log('\uD83D\uDD75\uFE0F [ER:IO] ' + nLies + ' hores mentideres neutralitzades a la càrrega');
                }
            } catch (eLies) {
                log('\u26A0\uFE0F [ER:IO] No s\'han pogut sanejar les hores mentideres: ' + eLies.message, 'WARN');
            }
            // (2026-10-02) TALL "TEMPS FINAL": el primer ítem que conté aquest text
            // (inclòs) ja no és escaleta útil → el procés s'atura aquí. Es fa ABANS de
            // cachejar perquè cap consumidor torni a veure els ítems de prova del final.
            try {
                var tf = this.truncateAtTempsFinal(data);
                if (tf) {
                    log('\uD83D\uDED1 [ER:IO] "TEMPS FINAL" a l\'ítem #' + tf.cut + ' ("' + tf.titol +
                        '") \u2192 ' + tf.dropped + ' ítem(s) descartat(s) de l\'escaleta');
                }
            } catch (eTF) {
                log('\u26A0\uFE0F [ER:IO] No s\'ha pogut tallar per "TEMPS FINAL": ' + eTF.message, 'WARN');
            }
            state._escaletaCache = { path: jsonPath, data: data };
            return data;
        } catch (e) {
            log('\u274C [ER:IO] Error en load: ' + e.message);
            return null;
        }
    };

    // ----------------------------------------------------------------
    // Registre al namespace
    // ----------------------------------------------------------------
    FASTPASS_UI.EscaletaReader = ER;
    window.FASTPASS_UI = FASTPASS_UI;
    log('[ER:IO] Sub-mòdul inicialitzat (_escapePath, _listProjectFiles, findInFolder, ensureLocalCopy, lookupLocalStatus, load)');
})();
