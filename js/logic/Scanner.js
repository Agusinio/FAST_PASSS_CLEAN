/**
 * ============================================================================
 * LOGIC: SCAN (Motor de cerca de materials) - v2.6.0 literal-premium
 * ============================================================================
 */
(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Logic = FASTPASS_UI.Logic || {};

    const utils = {
        log: (m, type) => (FASTPASS_UI.Utils) ? FASTPASS_UI.Utils.log(m, type || "DEBUG") : console.log(m),
        readFolder: (p) => (FASTPASS_UI.Utils) ? FASTPASS_UI.Utils.readFolder(p) : []
    };

    // ── MARQUES D'ARRENCADA (2026-10-22 · #113) ────────────────────────────
    // Les sondes de wotts/MP4 són les úniques que toquen el NAS abans que el
    // panell estiga a punt. Amb el NAS FRED el cost real no és el readdir sinó
    // el `stat` de cada candidat (log 22/10: 84 s dins del checkContext).
    // Aquestes marques (`[SCAN]`) van al `_boot_timing.log` i diuen QUINA part
    // de la sonda es menja el temps, per poder-ho ajustar amb dades.
    const _bm = (lbl) => {
        try {
            const B = window.FASTPASS_UI && window.FASTPASS_UI.Boot;
            if (B && typeof B.mark === 'function') B.mark('[SCAN] ' + lbl);
        } catch (eBM) { }
    };
    const _ms = (t0) => (Date.now() - t0) + ' ms';

    FASTPASS_UI.Logic.Scan = {

        _discardOld: function (files, guardaHours) {
            var now = Date.now();
            var cutoff = now - (guardaHours * 60 * 60 * 1000);
            return files.filter(function (f) {
                if (!f.mtime) return true;
                var fileTime = new Date(f.mtime).getTime();
                return isNaN(fileTime) ? true : (fileTime >= cutoff);
            });
        },

        /**
         * Extreu YYYYMMDD del nom d'un fitxer de media (MP4/SRT).
         * @param {string} name - Nom del fitxer
         * @returns {string|null} "20260618" o null
         */
        _extractDateFromFileName: function (name) {
            if (!name) return null;
            var parts = name.split('_');
            for (var i = 0; i < parts.length; i++) {
                if (/^\d{8}$/.test(parts[i])) return parts[i];
                if (/^\d{14}$/.test(parts[i])) return parts[i].substring(0, 8);
            }
            return null;
        },

        /**
         * _fileDateYYYYMMDD: Data d'un fitxer (YYYYMMDD) per datar-lo.
         * FILTRAT PER DATA DE CREACIÓ (2026-09-07): es fa servir NOMÉS la data de
         * creació real (el mtime del NAS pot estar desplaçat per processos nocturns).
         * Ordre: nom del fitxer → created → mtime (2026-10-22 · #182).
         *
         * PER QUÈ HI HA EL MTIME AL FINAL: en este equip el panell no té Node i, en
         * UNC, `File.created` arriba a 0 → tot es descartava com a «no datable» i
         * `Scan.wotts` no importava cap retol. El mtime amb la regla nocturna
         * (`_mtimeDateYYYYMMDD`) recupera la data sense falsos positius.
         * @param {Object} f - { name, created, mtime }
         */
        _fileDateYYYYMMDD: function (f) {
            if (!f) return null;
            var d = this._extractDateFromFileName(f.name);
            if (d) return d;
            if (f.created) {
                var cd = new Date(f.created);
                if (!isNaN(cd.getTime())) {
                    var d8 = '' + cd.getFullYear() +
                        ('0' + (cd.getMonth() + 1)).slice(-2) +
                        ('0' + cd.getDate()).slice(-2);
                    if (this._validDate8(d8)) return d8;
                }
            }
            // (2026-10-22 · #182) Últim recurs: mtime (regla nocturna).
            return this._mtimeDateYYYYMMDD(f.mtime);
        },

        /**
         * filterByWorkDate: MECANISME ÚNIC de filtrat per la data de treball.
         * Regla anti-contaminació: si un fitxer no es pot datar, es descarta.
         * @param {Array} files - Llista { name, created, mtime }
         * @param {string} dateDir - Data de treball (YYYY_MM_DD) o null (sense filtre)
         * @returns {{keep:Array, dropped:Array, noDate:Array}}
         */
        filterByWorkDate: function (files, dateDir) {
            var dateTarget = dateDir ? String(dateDir).replace(/_/g, '') : null;
            if (!dateTarget) return { keep: files || [], dropped: [], noDate: [] };
            if (!files) return { keep: [], dropped: [], noDate: [] };
            var keep = [], dropped = [], noDate = [];
            for (var i = 0; i < files.length; i++) {
                var fileDate = this._fileDateYYYYMMDD(files[i]);
                if (!fileDate) noDate.push(files[i]);
                else if (fileDate !== dateTarget) dropped.push(files[i]);
                else keep.push(files[i]);
            }
            return { keep: keep, dropped: dropped, noDate: noDate };
        },

        /**
         * _normalize: Redueix una cadena a minúscules sense accents ni símbols.
         * Serveix per comparar el "tema" del projecte amb els noms dels .srt
         * (ex: "DONAPAS BARCELONA" == "Donapas_Barcelona" == "donapasbarcelona").
         */
        _normalize: function (s) {
            if (!s) return '';
            var str = String(s).toLowerCase();
            var map = {
                'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a',
                'ç':'c',
                'è':'e','é':'e','ê':'e','ë':'e',
                'ì':'i','í':'i','î':'i','ï':'i',
                'ñ':'n',
                'ò':'o','ó':'o','ô':'o','õ':'o','ö':'o',
                'ù':'u','ú':'u','û':'u','ü':'u',
                'ý':'y','ÿ':'y'
            };
            str = str.replace(/[àáâãäåçèéêëìíîïñòóôõöùúûüýÿ]/g, function (ch) { return map[ch] || ch; });
            return str.replace(/[^a-z0-9]+/g, '');
        },

        /**
         * _projectPrefix: (2026-11-04 nit · #238) PREFIX d'identitat del `.prproj`
         * del bloc: `Pruebas_<progKey>_<blocKey>_`, en minúscules i amb el guió
         * baix FINAL (buscant V1 no s'ha d'agafar V10). És l'ÚNICA definició del
         * patró: la fan servir `selectedProject` (llistat del NAS) i
         * `matchesProjectName` (un nom que ve de l'estat o de `Project.path()`).
         */
        _projectPrefix: function (progKey, blocKey) {
            return ('Pruebas_' + progKey + '_' + blocKey + '_').toLowerCase();
        },

        /**
         * matchesProjectName: (2026-11-04 nit · #238) És este nom el `.prproj` del BLOC?
         *
         * Funció PURA (ni NAS ni DOM), per poder provar-la aïllada. La fa servir
         * el fallback «acabat de crear» de `Context.checkContext`: just després
         * de crear el projecte, el llistat de la carpeta pot arribar tard (o
         * tornar null amb el pont JSX ocupat) i el `.prproj` encara no hi és.
         * @param {string} name - nom del fitxer (amb `.prproj`)
         * @param {string} progKey - `ctx.progData.wott || ctx.progData.archivo`
         * @param {string} blocKey - `ctx.bloque` (ex: 'V1')
         * @returns {boolean}
         */
        matchesProjectName: function (name, progKey, blocKey) {
            if (!name || !progKey || !blocKey) return false;
            const n = String(name).toLowerCase();
            return n.indexOf(this._projectPrefix(progKey, blocKey)) === 0 &&
                n.slice(-7) === '.prproj';
        },

        selectedProject: function(fileList, progKey, blocKey) {
            if (!fileList || fileList.length === 0) return null;
            // Patró d'identitat del bloc (vegeu `_projectPrefix`): començar pel
            // prefix I ser un projecte de Premiere.
            const match = fileList.find(f => this.matchesProjectName(f && f.name, progKey, blocKey));
            return match ? match.name : null;
        },

        // (2026-10-23) RETIRAT `mediaAssets`: escanejava la carpeta de VERTICALITZACIÓ
        // del NAS a la recerca del MP4/SRT del bloc. El vídeo del projecte ja no es
        // busca enlloc: ix de la captura del cleanFeed (extracció ffmpeg amb els
        // bounds calculats) i els subtítols, del .srt que viu al costat del .prproj.

        /**
         * _blocKey: NORMALITZA el tros de BLOC d'un nom de wott a «LLETRA|NUMERO».
         * (2026-10-26) Els wotts del generador porten el bloc com un TROS del nom
         * separat per guions baixos, però NO sempre igual:
         *     Wott_TNM_V3_...   → bloc 'V3'   → clau 'V|3'
         *     Wott_TNM_V03_...  → bloc 'V03'  → clau 'V|3'   (zero davant = mateix bloc)
         *     Wott_TNM_V_...    → bloc 'V'    → clau 'V|'    (FLOTANT: bloc a seques)
         * Comparar CLAUS (i no `indexOf('TNM_V3_')`) és el que fa possible acceptar
         * el bloc sense número sense obrir la porta a 'V1', 'V10' o 'V2'.
         * @param {string} tok - Tros del nom (ex: 'V3')
         * @returns {string|null} Clau normalitzada, o null si el tros no és un bloc
         */
        _blocKey: function (tok) {
            var m = String(tok || '').toUpperCase().match(/^([A-Z]+)0*(\d*)$/);
            if (!m) return null;
            return m[1] + '|' + (m[2] || '');
        },

        /**
         * _wottBlocOf: Tros de BLOC del nom d'un wott, normalitzat amb `_blocKey`.
         * Es busca el PRIMER tros que siga exactament el programa (`TNM`) i el bloc
         * és el tros SEGÜENT. Així `Wott_TNM_V_00_00.00_...` → 'V|' i
         * `Wott_TNM_V3_...` → 'V|3' (el rol `XARXES-TEXT`, que va més arrere al nom,
         * no es pot confondre amb el bloc).
         * @param {string} name - Nom del fitxer
         * @param {string} prog - Programa (`TNV`, `TNM`...)
         * @returns {string|null} Clau del bloc, o null si el nom no és d'eixe programa
         */
        _wottBlocOf: function (name, prog) {
            var p = String(prog || '').toUpperCase();
            if (!p) return null;
            var t = String(name || '').toUpperCase().split('_');
            for (var i = 0; i < t.length - 1; i++) {
                if (t[i] === p) return this._blocKey(t[i + 1]);
            }
            return null;
        },

        /**
         * _listNamesNative: noms d'una carpeta per la via NATIVA de CEP
         * (`cep.fs.readdir`), SENSE demanar cap atribut de cap fitxer.
         *
         * (2026-10-29 · BUG #204) PER QUÈ CAL: en UNC, `Utils.readFolder` va per
         * JSX (`IO.scanDirectory`), que demana `length`, `modified` i `created`
         * de CADA fitxer —i si `length` ve 0 (habitual en .mov per UNC) el
         * FITXER S'OBRI (`f.open('r')` + `eof`) per traure'n la mida. Amb 1281
         * fitxers això són milers d'operacions sobre SMB dins del motor
         * d'ExtendScript: 103 s el 29/10 en fred, amb el fil del panell
         * BLOQUEJAT. Mesurat eixe dia des de .NET (la mateixa via nativa que
         * usa CEP): 1281 noms en 2 ms i 1281 FileInfo amb `created` en 3 ms.
         * El NAS no és lent: ho era la manera de preguntar-li-ho.
         * @param {string} folder - Ruta de la carpeta (UNC o local)
         * @returns {Array<string>|null} noms, o null si la via nativa no llistat
         */
        _listNamesNative: function (folder) {
            try {
                if (!window.cep || !window.cep.fs || !window.cep.fs.readdir) return null;
                var rd = window.cep.fs.readdir(folder);
                if (!rd || rd.err !== 0 || !rd.data) return null;
                var out = [];
                for (var i = 0; i < rd.data.length; i++) {
                    var n = rd.data[i];
                    n = (typeof n === 'string') ? n : (n && n.name);
                    if (!n) continue;
                    // Mateixa reparació de mojibake CP1252 que `readFolder`.
                    out.push((utils && utils._decodeName) ? utils._decodeName(n) : n);
                }
                return out;
            } catch (eLN) { return null; }
        },

        /** _d8ToMs: 'YYYYMMDD' (local) → ms. 0 si la data no és vàlida. */
        _d8ToMs: function (d8) {
            var v = this._validDate8(d8);
            if (!v) return 0;
            return new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)).getTime();
        },

        /**
         * _dateCandidates: ompli `created`/`mtime` NOMÉS dels fitxers indicats.
         *
         * (2026-10-29 · BUG #204) El filtre per data necessita la data de cada
         * candidat, no la dels 1281 fitxers de la carpeta. Ací es daten només
         * els candidats del bloc (decenes) i en tres passades de cost creixent:
         *   1. caché persistent `fp_wott_dates_v1` (cost 0; sobreviu a reinicis),
         *   2. `cep.fs.stat` natiu (≈0,1-1,5 ms per fitxer; mai bloqueja el
         *      motor de Premiere perquè no és ExtendScript),
         *   3. `IO.fileInfo` via JSX (File.created) només per als pocs noms que
         *      ni la caché ni el stat han pogut datar.
         * @param {string} folder - Carpeta que conté els fitxers
         * @param {Array<Object>} files - Objectes { name, created?, mtime? } (es modifiquen)
         * @returns {Promise<number>} quants n'han quedat amb data
         */
        _dateCandidates: async function (folder, files) {
            if (!files || files.length === 0) return 0;
            this._loadDateCache();
            if (!this._wottDateCache) this._wottDateCache = {};
            var dates = this._wottDateCache;
            var base = String(folder || '').replace(/[\\/]+$/, '') + '\\';
            var pend = [];
            var ok = 0;

            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                var k = String(f.name || '').toUpperCase();
                // 0) Si l'origen ja va posar la data (llista vinguda de `readFolder`
                //    JSX, o passada anterior en caché de 30 s), no es toca res: així
                //    el camí de sempre queda idèntic i no es paga cap stat de més.
                if (f.created || f.mtime) {
                    var d0 = this._fileDateYYYYMMDD(f);
                    if (d0) {
                        dates[k] = d0;
                        this._dateCacheDirty = true;
                        ok++;
                        continue;
                    }
                }
                // 1) Ja datat en una sessió anterior: la caché val per al filtre.
                var d8 = this._validDate8(dates[k]);
                if (d8) {
                    if (!f.created) f.created = this._d8ToMs(d8);
                    ok++;
                    continue;
                }
                // 2) `cep.fs.stat` natiu (només d'eixe fitxer).
                var st = null;
                try { st = window.cep && window.cep.fs ? window.cep.fs.stat(base + f.name) : null; } catch (eSt) { st = null; }
                if (st && st.err === 0 && st.data) {
                    f.created = st.data.creationTime || 0;
                    f.mtime = st.data.mtime || 0;
                    var d2 = this._fileDateYYYYMMDD(f);
                    if (d2) {
                        dates[k] = d2;
                        this._dateCacheDirty = true;
                        ok++;
                        continue;
                    }
                }
                pend.push(f);
            }

            // 3) Últim recurs: File.created via JSX, un fitxer a la vegada (pocs).
            var nJsx = 0;
            for (var j = 0; j < pend.length; j++) {
                var pj = pend[j];
                try {
                    var raw = await utils.callJSX("IO.fileInfo('" + utils.escape(base + pj.name) + "')");
                    if (raw && String(raw).indexOf('ERR') !== 0) {
                        var info = JSON.parse(raw);
                        if (!info || !info.exists) continue;
                        pj.created = info.created || 0;
                        pj.mtime = info.modified || 0;
                        var d3 = this._fileDateYYYYMMDD(pj);
                        if (d3) {
                            dates[String(pj.name).toUpperCase()] = d3;
                            this._dateCacheDirty = true;
                            nJsx++;
                        }
                    }
                } catch (eJP) { }
            }
            ok += nJsx;
            if (pend.length > nJsx) {
                utils.log('⚠️ [SCAN:wotts] ' + (pend.length - nJsx) + ' candidat(s) sense data fiable ' +
                    '(ni caché, ni stat, ni File.created): ' + pend.slice(0, 3).map(function (x) { return x.name; }).join(', '), 'WARN');
            }
            this._saveDateCache();
            return ok;
        },

        wotts: async function (ctx) {
            try {
                const pathNAS = ctx.config.rutas.chyrons;
                // CACHÉ (2026-09-16): llegir aquesta carpeta pel NAS és CAR (75+ .mov de
                // presentadors) i es feia a CADA checkContext (auto-refresh cada 15 s +
                // polls), cosa que bloquejava la UI del panell i endarreria la llista de
                // presentadors. Amb 30 s de TTL n'hi ha prou: la ingesta no canvia en
                // mig minut i el botó CREAR/ACTUALITZAR treballa amb el mateix marge.
                // (2026-10-01 · F2) La caché NOMÉS guarda llistes NO buides: una
                // lectura fallida o buida no s'hi pot quedar 30 s enverinant el panell.
                var _now = Date.now();
                if (!this._readCache) this._readCache = {};
                var _key = 'wotts:' + pathNAS;
                var _c = this._readCache[_key];
                var allFiles;
                // ── F2 (2026-10-01) · NOMÉS es reutilitza una llista NO buida ──────
                // Abans una lectura buida o FALLIDA quedava cachetada 30 s i el
                // panell treballava amb 0 rètols tot i tenir-los al NAS.
                if (_c && (_now - _c.at) < 30000 && _c.list && _c.list.length > 0) {
                    allFiles = _c.list;
                } else {
                    // (2026-10-29 · #204) LLISTAT PER LA VIA NATIVA (`cep.fs.readdir`).
                    // En UNC, `Utils.readFolder` anava per JSX (`File.created` de CADA
                    // fitxer, i obertura dels .mov amb `length`=0): 103 s en fred amb el
                    // fil del panell bloquejat. Ací només es demanen els NOMS (2 ms
                    // mesurats amb 1281 fitxers) i els atributs es pidolen després,
                    // només als candidats del bloc (`_dateCandidates`).
                    var _tRF = Date.now();
                    var _names = this._listNamesNative(pathNAS);
                    if (_names) {
                        allFiles = [];
                        for (var _iN = 0; _iN < _names.length; _iN++) allFiles.push({ name: _names[_iN] });
                        _bm('wotts · llistat natiu (' + _ms(_tRF) + ', ' + allFiles.length + ' noms)');
                    } else {
                        // Via nativa no disponible: es manté el camí de sempre (JSX).
                        allFiles = await utils.readFolder(pathNAS);
                        _bm('wotts · carpeta de rètols via JSX (' + _ms(_tRF) + ', ' +
                            (allFiles ? allFiles.length : 'null') + ' fitxer(s))');
                    }
                    if (allFiles && allFiles.length > 0) {
                        this._readCache[_key] = { at: _now, list: allFiles };
                    } else {
                        delete this._readCache[_key];   // mai cachejar buit/fallada
                    }
                }
                // ── F1/F3: null = la lectura ha FALLAT (no és "no hi ha rètols") ──
                if (!allFiles) {
                    utils.log('❌ [SCAN:wotts] Lectura de la carpeta de rètols FALLIDA (' + pathNAS +
                        '). NO es pot saber si hi ha wotts del bloc → es conserva l\'estat anterior.', 'ERROR');
                    return { tema: 'ERROR', list: [], failed: true };
                }
                if (allFiles.length === 0) return { tema: "PENDENT", list: [] };
    
                var fProg = (ctx.progData && ctx.progData.wott) ? ctx.progData.wott.toUpperCase() : 'TNV';
                // (2026-10-26) El bloc es compara per CLAU de tros del nom (`_blocKey`) i
                // no per `indexOf('PROG_BLOC_')`: així 'V3' i 'V03' són el mateix bloc i
                // el bloc BUIT (`Wott_TNM_V_...`, els XARXES-TEXT flotants) es pot
                // reconéixer com a FLOTANT en lloc de quedar fora del projecte.
                var blocKey = this._blocKey(ctx.bloque || 'V1') || 'V|1';
                var floatKey = String(blocKey).split('|')[0] + '|';   // 'V|3' → 'V|' (a seques)
    
                var self = this;
                var isMovWott = function (f) { return /\.MOV$/.test(String(f.name || '').toUpperCase()); };
                var isBlocWott = function (f) {
                    return isMovWott(f) && self._wottBlocOf(f.name, fProg) === blocKey;
                };
                // FLOTANT = mateixa LLETRA de bloc però SENSE número (bloc «V» a seques).
                var isFloatWott = function (f) {
                    return isMovWott(f) && self._wottBlocOf(f.name, fProg) === floatKey;
                };
    
                let filtered = allFiles.filter(isBlocWott);
                // Si el bloc demanat ja ve sense número, no hi ha res «flotant» a part.
                let flotants = (floatKey === blocKey) ? [] : allFiles.filter(isFloatWott);

                // MECÀNICA D'INICI (2026-09-04): eliminada la guarda per mtime (22h).
                // El filtre per data del projecte (a continuació) és l'únic criteri vàlid.

                // ---- FILTRE PER DATA DEL PROJECTE (2026-09-02) ----
                // La guarda per mtime (22h) NO es suficient: un chyron d'ahir
                // generat fa menys de 22h encara hi cap dins la guarda, de manera
                // que s'importarien retols que NO pertanyen al projecte actual.
                // Exigim que la data del fitxer (extreta del nom si el porta, o de
                // la data de creacio/mtime com a fallback) coincideixi amb la data
                // de treball del projecte (ctx.dateDir). Si no es pot datar, es
                // DESCARTÀ (anti-contaminació: mai importar rètols d'un dia incert).
                // MECANISME ÚNIC de filtrat per data (Scan.filterByWorkDate).
                var dateTarget = ctx.dateDir ? String(ctx.dateDir).replace(/_/g, '') : null;
                if (dateTarget) {
                    // (2026-10-26) Es data la UNIÓ (bloc + flotants) d'una sola passada i
                    // després es torna a separar: el TEMA del projecte només pot eixir
                    // dels wotts DEL BLOC (un XARXES-TEXT flotant no pot batejar el projecte).
                    // ── DATACIÓ DELS CANDIDATS (2026-10-29 · #204) ─────────────
                    // El filtre per data només necessita la data dels candidats del
                    // bloc (decenes), no la dels 1281 fitxers de la carpeta.
                    // `_dateCandidates` passa per caché persistent → stat natiu →
                    // File.created (JSX) i deixa `created`/`mtime` posats en els
                    // MATEIXOS objectes de `filtered`/`flotants` (són referències).
                    var _tDt = Date.now();
                    var _cands = filtered.concat(flotants);
                    var _nDated = await this._dateCandidates(pathNAS, _cands);
                    _bm('wotts · datació de candidats (' + _ms(_tDt) + ', ' + _nDated + '/' + _cands.length + ')');
                    // SALVAGUARDA: si cap candidat no es pot datar, es torna al camí de
                    // sempre (JSX amb `File.created`). Sense això es repetiria el desastre
                    // del 2026-09-22 («69 → 0, NO datables») i no s'importaria cap retol.
                    if (_cands.length > 0 && _nDated === 0) {
                        utils.log('⚠️ [SCAN:wotts] Cap candidat datable per caché/stat → es relig la carpeta via JSX (File.created)', 'WARN');
                        var _full = await utils.readFolder(pathNAS);
                        if (_full && _full.length) {
                            var _byName = {};
                            for (var _kF = 0; _kF < _full.length; _kF++) _byName[String(_full[_kF].name).toUpperCase()] = _full[_kF];
                            for (var _kC = 0; _kC < _cands.length; _kC++) {
                                var _hit = _byName[String(_cands[_kC].name).toUpperCase()];
                                if (_hit) { _cands[_kC].created = _hit.created || 0; _cands[_kC].mtime = _hit.mtime || 0; }
                            }
                        }
                    }
                    var _tFD = Date.now();
                    var resF = this.filterByWorkDate(_cands, ctx.dateDir);
                    _bm('wotts · filtre per data (' + _ms(_tFD) + ', ' + resF.keep.length + ' conservat(s))');
                    utils.log('[SCAN:wotts] Filtre per data projecte ' + dateTarget + ': ' + filtered.length +
                        ' del bloc + ' + flotants.length + ' flotant(s) -> ' + resF.keep.length +
                        (resF.dropped.length ? ' (descartats ' + resF.dropped.length + " d'altres dies: " + resF.dropped.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : '') +
                        (resF.noDate.length ? ' (NO datables descartats: ' + resF.noDate.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : ''), 'INFO');
                    filtered = resF.keep.filter(isBlocWott);
                    flotants = resF.keep.filter(isFloatWott);
                    if (filtered.length === 0) {
                        utils.log('[SCAN:wotts] Cap chyron del bloc de la data del projecte (' + dateTarget + "). No s'importara cap retol." +
                            (flotants.length ? ' (' + flotants.length + ' flotant(s) del dia descartats: sense wotts de bloc no hi ha TEMA per al projecte)' : ''), 'WARN');
                        return { tema: 'PENDENT', list: [] };
                    }
                }
    
                // 2. EXTRACCIÓ INTEL·LIGENT DEL TEMA
                const nameSource = filtered.find(f => f.name.includes("Tema-Titol")) || filtered[0];
                let tema = "PENDENT"; 

                const parts = nameSource.name.split('__');

                const reserved = ["INTR", "LÍNIA", "CHYRON", "GF", "PG", "TD", "TE", "P2", "P5", "P7", "LEAD", "BD", "BON DIA", "CHYRONS", "GUIO", "COL.LECCIO", "OFF", "CURT"];

                for (let i = 1; i < parts.length; i++) {
                    let currentBlock = parts[i];
                    let titleCandidate = "";
                    
                    const idMatch = currentBlock.match(/_[0-9]{5,}_/);
                    if (idMatch) {
                        tema = currentBlock.substring(0, idMatch.index).trim();
                    }

                    const upperCandidate = titleCandidate.toUpperCase();
                    const isReserved = reserved.some(r => upperCandidate.indexOf(r) !== -1);
                    
                    if (!isReserved && titleCandidate.length > 2) {
                        tema = titleCandidate;
                        break; 
                    }
                }

                if (tema === "PENDENT") {
                    const fallback = nameSource.name.split('_');
                    tema = fallback[5] ? fallback[5].replace(/\..+$/, "") : "TEMA";
                }

                utils.log(`🏷️ Tema detectat (Smart Filter): [${tema}]`, "INFO");

                // ── WOTTS FLOTANTS (2026-10-26) ─────────────────────────────
                // Els wotts amb el bloc a seques (`Wott_TNM_V_...`) són els XARXES-TEXT
                // que el generador no lliga a cap ítem de l'esquema. S'importen igualment
                // (van al bin del projecte) però `Parse.assign` no els troba cap línia,
                // així que queden SENSE col·locar. Fins ara ni tan sols s'importaven.
                if (flotants.length > 0) {
                    utils.log('🪁 [SCAN:wotts] ' + flotants.length + ' wott(s) FLOTANT(S) (bloc «' +
                        String(blocKey).split('|')[0] + '» a seques) → s\'importen sense ítem: ' +
                        flotants.slice(0, 5).map(function (x) { return x.name; }).join(' · ') +
                        (flotants.length > 5 ? ' …' : ''), 'INFO');
                }

                return { 
                    tema: tema, 
                    list: filtered.concat(flotants).map(f => ({
                        name: f.name, 
                        path: (pathNAS + f.name).replace(/\\/g, "/")
                    }))
                };
            } catch (e) {
                utils.log("💥 Error Scan.wotts: " + e.message, "ERROR");
                return { tema: "ERROR", list: [] };
            }
        },

        // ────────────────────────────────────────────────────────────────────
        // wottsToday (2026-10-21) · DESBLOQUEIG FÍSIC DEL BOTÓ
        // --------------------------------------------------------------------
        // Els wotts es generen JUST en acabar l'emissió del bloc: si n'hi ha del
        // bloc i del dia de treball → CREAR; si no → MASSA D'HORA. És un fet
        // físic, no un horari, i substitueix el vell getStatus sobre el
        // repositori central (5,2 s d'arrencada).
        //
        // PER QUÈ NO S'USA `created` DEL SCAN NORMAL:
        //   · Els noms dels wotts NO porten data (Wott_TNV_v1_05_00.01_TEMA...mov).
        //   · El mtime ESTÀ CONTAMINAT pel procés nocturn (ex: creat 16/10 19:17
        //     UTC, modificat 17/10 00:32 UTC) → dataria el bloc al dia següent.
        //   · cep.fs.stat no dóna creationTime en UNC en aquesta màquina (vegeu
        //     Utils.readFolder) i IO.scanDirectory triga ~4 s amb 963 fitxers.
        //   · Node no hi és (el manifest no declara `--enable-nodejs`), així que
        //     `birthtime` no es pot consultar: creació via `cep.fs.stat`.
        // Cost per poll (15 s): readdir + stats NOMÉS dels noms no datats encara
        // (caché `_wottDateCache` per nom) → ~35 ms en règim estable.
        // ────────────────────────────────────────────────────────────────────
        _wottDateCache: null,    // { NOM_EN_MAJUSCULES: 'YYYYMMDD' }
        _wottProbeCache: null,   // { clau: { at, res } } · TTL 5 s
        WOTT_PROBE_TTL_MS: 5000,
        _probeInflight: null,    // { clau: Promise } · sonda en curs (dedupe)

        /** _probeKey: clau de la sonda de wotts (carpeta + bloc + dia de treball). */
        _probeKey: function (ctx) {
            const r = (ctx && ctx.config && ctx.config.rutas) ? ctx.config.rutas : {};
            return 'wotts|' + (r.chyrons || '') + '|' + ((ctx && ctx.bloque) || '') + '|' + ((ctx && ctx.dateDir) || '');
        },

        // ── CACHÉ DE DATES PERSISTENT (2026-10-22 · #113) ──────────────────
        // El `birthtime` d'un fitxer no canvia mai, però la caché vivia només a
        // memòria: cada recàrrega del panell tornava a fer `stat` de TOTS els
        // candidats del bloc. Amb el NAS fred això són desenes de segons (cada
        // stat espera l'SMB). Ara es desa a localStorage (`fp_wott_dates_v1`) i
        // sobreviu a recàrregues i reinicis: només es daten els NOMS NOUS.
        DATE_CACHE_KEY: 'fp_wott_dates_v1',
        _dateCacheLoaded: false,
        _dateCacheDirty: false,

        _loadDateCache: function () {
            if (this._dateCacheLoaded) return;
            this._dateCacheLoaded = true;
            if (!this._wottDateCache) this._wottDateCache = {};
            try {
                const raw = window.localStorage ? window.localStorage.getItem(this.DATE_CACHE_KEY) : null;
                if (!raw) return;
                const obj = JSON.parse(raw);
                let n = 0;
                for (const k in obj) {
                    if (!obj.hasOwnProperty(k)) continue;
                    // (2026-10-22 · #182) Descarta dates impossibles ('19700101' que
                    // deixava `File.created=0` en UNC): si es conservaven, eixe nom
                    // no es tornava a datar MAI i la sonda deia 0 per sempre.
                    const d8 = this._validDate8(obj[k]);
                    if (!d8) continue;
                    if (!this._wottDateCache[k]) { this._wottDateCache[k] = d8; n++; }
                }
                if (n > 0) utils.log('🗓️ [SCAN] caché de dates recuperada (' + n + ' fitxers ja datats)', 'DEBUG');
            } catch (eLC) { /* caché corrupta: es regenera */ }
        },

        _saveDateCache: function () {
            if (!this._dateCacheDirty) return;
            try {
                if (!window.localStorage) return;
                // Sostre de seguretat: la caché creix amb cada fitxer vist al NAS.
                // Per damunt de 3000 noms no es desa (la de memòria segueix valent).
                if (Object.keys(this._wottDateCache || {}).length > 3000) {
                    this._dateCacheDirty = false;
                    return;
                }
                window.localStorage.setItem(this.DATE_CACHE_KEY, JSON.stringify(this._wottDateCache || {}));
                this._dateCacheDirty = false;
            } catch (eSC) {
                // Quota plena o localStorage bloquejat: la caché de memòria segueix
                // valent per a aquesta sessió (pitjor cas: es torna a datar).
            }
        },

        /** _localDate: Date|ms → 'YYYYMMDD' amb components LOCALS. null si no és datable. */
        _localDate: function (d) {
            if (!d) return null;
            var t = (d instanceof Date) ? d.getTime() : Number(d);
            if (!t || isNaN(t) || t < 946684800000) return null;   // < 2000 → soroll
            var dd = (d instanceof Date) ? d : new Date(t);
            return '' + dd.getFullYear() +
                ('0' + (dd.getMonth() + 1)).slice(-2) +
                ('0' + dd.getDate()).slice(-2);
        },

        /** _validDate8 (2026-10-22 · #182): 'YYYYMMDD' plausible (≥ 2000) o null. */
        _validDate8: function (d8) {
            var s = (d8 === null || d8 === undefined) ? '' : String(d8);
            return (/^\d{8}$/.test(s) && s >= '20000101') ? s : null;
        },

        /**
         * _mtimeDateYYYYMMDD (2026-10-22 · #182): data DEDUÏDA del `mtime` quan el
         * fitxer no té ni `birthtime` (Node) ni `created` (CEP/JSX).
         *
         * PER QUÈ CAL: el panell NO té Node (el manifest no declara
         * `--enable-nodejs`) i, en
         * UNC, ni `cep.fs.stat().creationTime` ni `File.created` tornen res → la
         * sonda de wotts deia 0/43 tenint els 43 wotts del dia al NAS, i el botó es
         * quedava a MASSA D'HORA amb l'escaleta ja baixada per FOTO.
         *
         * REGLA NOCTURNA: el procés de la nit reescriu el mtime dels wotts del dia
         * anterior cap a les ~02:30 del dia següent (mesurat al NAS: creat 21/10
         * 13:58 → modificat 22/10 02:31). Per tant un mtime entre 00:00 i
         * NIGHT_SHIFT_END_HOUR és del DIA ANTERIOR; qualsevol altre, del seu dia.
         * Només s'usa com a ÚLTIM recurs: mai per sobre de birthtime/created.
         */
        NIGHT_SHIFT_END_HOUR: 5,
        _mtimeDateYYYYMMDD: function (t) {
            if (!t) return null;
            var ms = (t instanceof Date) ? t.getTime() : Number(t);
            if (!ms || isNaN(ms) || ms < 946684800000) return null;   // < 2000 → soroll
            var d = new Date(ms);
            if (d.getHours() < this.NIGHT_SHIFT_END_HOUR) d = new Date(ms - 86400000);
            return '' + d.getFullYear() +
                ('0' + (d.getMonth() + 1)).slice(-2) +
                ('0' + d.getDate()).slice(-2);
        },


        /**
         * wottsToday: hi ha wotts del BLOC i del DIA de treball?
         * @param {Object} ctx - { config, progData, bloque, dateDir }
         * @returns {Promise<{ok:boolean, found:boolean, count:number, names:Array, via:string}>}
         *          `ok:false` = no s'ha pogut llegir → NO s'ha de canviar d'estat.
         */
        wottsToday: async function (ctx) {
            // ── DEDUPE DE SONDES (2026-10-22 · #113) ───────────────────────────
            // checkContext es rellança des de diversos llocs (poll de 15 s,
            // Registry, triggers d'INICI). Amb el NAS FRED cada crida tornava a
            // pagar el MATEIX readdir + stats i s'encuaven unes darrere les
            // altres (log 22/10: 3 llistats de ~70 s). Ara la sonda en curs es
            // COMPARTEIX: una sola lectura per clau encara que la demanen 3 cops.
            const key = this._probeKey(ctx);
            if (!this._probeInflight) this._probeInflight = {};
            if (this._probeInflight[key]) {
                utils.log('⏳ [SCAN:wottsToday] sonda en curs reaprofitada (' + key + ')', 'DEBUG');
                return await this._probeInflight[key];
            }
            const p = this._wottsTodayRun(ctx);
            this._probeInflight[key] = p;
            try { return await p; }
            finally { delete this._probeInflight[key]; }
        },

        _wottsTodayRun: async function (ctx) {
            const out = { ok: false, found: false, count: 0, names: [], via: '' };
            if (!ctx || !ctx.config || !ctx.config.rutas) return out;
            const folder = ctx.config.rutas.chyrons;
            const dateTarget = ctx.dateDir ? String(ctx.dateDir).replace(/_/g, '') : null;
            const prog = (ctx.progData && ctx.progData.wott) ? String(ctx.progData.wott).toUpperCase() : '';
            const bloc = ctx.bloque ? String(ctx.bloque).toUpperCase() : '';
            if (!folder || !dateTarget || !prog || !bloc) return out;
            const prefix = prog + '_' + bloc + '_';   // Wott_TNV_v1_... → 'TNV_V1_'
            this._loadDateCache();      // #113: dates ja conegudes (sobreviuen a reinicis)
            const _t0 = Date.now();

            // Memòria curta: el poll de 15 s, el repintat manual i el semàfor
            // comparteixen el mateix veredicte dins de la finestra.
            const cacheKey = folder + '|' + prefix + '|' + dateTarget;
            if (!this._wottProbeCache) this._wottProbeCache = {};
            const hit = this._wottProbeCache[cacheKey];
            if (hit && (Date.now() - hit.at) < (this.WOTT_PROBE_TTL_MS || 5000)) return hit.res;

            // ── 1. NOMS (sense stats): CEP natiu → readFolder (JSX, últim recurs)
            // (2026-10-29) Fora la via Node (`fs.promises.readdir`): el manifest
            // no declara `--enable-nodejs`, i `cep.fs.readdir` és la MATEIXA
            // consulta nativa (noms sols, en mil·lisegons).
            let names = this._listNamesNative(folder);
            if (names) out.via = 'cep';

            if (!names) {
                // Últim recurs: scan amb JSX (car, ~4 s amb 963 fitxers). Si
                // funciona, deixa TOT datat en caché i no es torna a pagar.
                try {
                    const all = await utils.readFolder(folder);
                    if (all) {
                        if (!this._wottDateCache) this._wottDateCache = {};
                        for (let i = 0; i < all.length; i++) {
                            // (2026-10-22 · #182) created (File.created) → mtime amb
                            // la regla nocturna quan `created` arriba buit/0 en UNC.
                            const d0 = this._fileDateYYYYMMDD(all[i]);
                            if (d0) {
                                this._wottDateCache[String(all[i].name).toUpperCase()] = d0;
                                this._dateCacheDirty = true;
                            }
                        }
                        this._saveDateCache();
                        names = all.map(function (f) { return f.name; });
                        out.via = 'jsx';
                    }
                } catch (eJ) { names = null; }
            }
            if (!names) {
                utils.log('❌ [SCAN:wottsToday] No s\'ha pogut llistar ' + folder + ' → es conserva l\'estat anterior', 'ERROR');
                return out;   // ok:false
            }
            _bm('wotts · llistat (' + _ms(_t0) + ', ' + names.length + ' noms, via ' + (out.via || '?') + ')');

            const cands = names.filter(function (n) {
                const u = String(n || '').toUpperCase();
                return u.indexOf(prefix) !== -1 && u.slice(-4) === '.MOV';
            });
            out.ok = true;                    // el llistat SÍ que ha funcionat
            if (cands.length === 0) {
                this._wottProbeCache[cacheKey] = { at: Date.now(), res: out };
                return out;
            }

            // ── 2. DATACIÓ per creationTime/mtime (caché per NOM: cada fitxer, una vegada)
            if (!this._wottDateCache) this._wottDateCache = {};
            const dates = this._wottDateCache;
            // (2026-10-22 · #182) una data invàlida ('19700101') NO compta com a datada.
            const pending = cands.filter(n => !this._validDate8(dates[String(n).toUpperCase()]));
            const _tD = Date.now();
            let datedN = 0;
            if (pending.length > 0) {
                await this._dateWotts(folder, pending);
                // (2026-10-22 · #182) quants s'han pogut datar DE BÉ (abans el log
                // deia «datats nous: 43» encara que no se n'haguera datat cap).
                datedN = pending.filter(n => this._validDate8(dates[String(n).toUpperCase()])).length;
                _bm('wotts · datació (' + _ms(_tD) + ', ' + datedN + '/' + pending.length + ' fitxer(s) datats)');
            }

            const todays = cands.filter(function (n) { return dates[String(n).toUpperCase()] === dateTarget; });
            out.found = todays.length > 0;
            out.count = todays.length;
            out.names = todays;
            out.dated = datedN;
            out.pendingDates = pending.length;
            this._wottProbeCache[cacheKey] = { at: Date.now(), res: out };
            utils.log('🗓️ [SCAN:wottsToday] ' + prefix + ' ' + dateTarget + ': ' + todays.length + '/' + cands.length +
                ' wotts del dia (' + (out.via || '?') + ' · datats: ' + datedN + '/' + pending.length + ') → ' +
                (out.found ? 'CREAR permès' : 'encara no'), 'DEBUG');
            return out;
        },

        // (2026-10-23) RETIRAT `mp4Today`/`_mp4TodayRun`: sondava el MP4 origen del bloc
        // a la carpeta de VERTICALITZACIO del NAS per decidir l'estat d'arrencada.
        // El video del projecte ix NOMES de la captura del cleanFeed; si el bloc encara
        // no te video, el projecte es crea sense V1 i es completa amb ACTUALITZAR.

        /**
         * _dateWotts: omple `_wottDateCache` (NOM → YYYYMMDD) pels noms indicats.
         * Ordre: creationTime/mtime (CEP) → File.created (JSX).
         * (2026-10-29) Fora el pas per `birthtime` de Node: el manifest no
         * declara `--enable-nodejs` i, en UNC, eixa branca sempre tornava null.
         * @param {string} folder
         * @param {Array<string>} names
         */
        _dateWotts: async function (folder, names) {
            this._loadDateCache();                 // #113: partir de les dates persistides
            if (!this._wottDateCache) this._wottDateCache = {};
            const dates = this._wottDateCache;
            const base = String(folder).replace(/[\\/]+$/, '') + '\\';
            const self = this;
            const left = function (arr) {
                return arr.filter(function (n) { return !self._validDate8(dates[String(n).toUpperCase()]); });
            };
            // `put`: única via d'escriptura a la caché (marca que cal desar-la).
            const put = function (n, d8) {
                const v8 = self._validDate8(d8);
                if (!v8) return;
                const k = String(n).toUpperCase();
                if (dates[k] === v8) return;
                dates[k] = v8;
                self._dateCacheDirty = true;
            };

            // ── 1. CEP · creationTime (en UNC sol venir buit, però és gratis provar-ho)
            if (window.cep && window.cep.fs && window.cep.fs.stat) {
                let undated = 0, sample = null;
                for (let k = 0; k < names.length; k++) {
                    try {
                        const st = window.cep.fs.stat(base + names[k]);
                        if (st && st.err === 0 && st.data) {
                            // (2026-10-22 · #182) creationTime buit en UNC → mtime amb
                            // la regla nocturna (sense Node no hi ha birthtime).
                            put(names[k], self._localDate(st.data.creationTime) ||
                                self._mtimeDateYYYYMMDD(st.data.mtime));
                            // TESTIMONI (#182): si TAMPOC el mtime no el data, volem vore
                            // QUÈ torna el stat; si no, el proper pas (JSX) no es pot
                            // diagnosticar des del log.
                            if (!self._validDate8(dates[String(names[k]).toUpperCase()])) {
                                undated++;
                                if (!sample) sample = { c: st.data.creationTime, m: st.data.mtime };
                            }
                        } else { undated++; }
                    } catch (eS) { }
                }
                if (undated > 0) {
                    utils.log('🗓️ [SCAN:dates] CEP no ha datat ' + undated + '/' + names.length + ' fitxer(s)' +
                        (sample ? ' (creationTime=' + sample.c + ' · mtime=' + sample.m + ')' : ' (stat KO)') +
                        ' → es prova File.created (JSX)', 'WARN');
                }
                names = left(names);
                if (names.length === 0) { this._saveDateCache(); return; }
            }

            // ── 2. JSX · File.created (una lectura cara, però queda cachejada per sempre)
            try {
                const U = window.FASTPASS_UI.Utils;
                if (U && typeof U._scanDirectoryMap === 'function') {
                    const map = await U._scanDirectoryMap(folder);
                    if (map) {
                        for (let m = 0; m < names.length; m++) {
                            const it = map[names[m]];
                            if (it) {
                                // (2026-10-22 · #182) created (File.created) → mtime
                                // amb la regla nocturna quan `created` arriba a 0.
                                put(names[m], self._fileDateYYYYMMDD({ name: names[m], created: it.created, mtime: it.modified }));
                            } else {
                                put(names[m], null);
                            }
                        }
                    }
                }
            } catch (eM) { }
            // (2026-10-22 · #182) Si després de File.created encara queden noms sense
            // data, el nom no porta YYYYMMDD i el NAS no dóna cap data: s'avisa (una
            // vegada per tanda) en compte de dir «datats» a tort.
            const rest = left(names);
            if (rest.length > 0) {
                utils.log('⚠️ [SCAN:dates] ' + rest.length + ' fitxer(s) sense data fiable (ni created ni mtime): ' +
                    rest.slice(0, 3).join(', ') + (rest.length > 3 ? ' …' : ''), 'WARN');
            }
            this._saveDateCache();
        },

        /**
         * portadasFromProject: PORTADES que JA SÓN AL PROJECTE (bin PORTADES).
         *
         * (2026-10-21 · lentitud de la portada) El flux de la portada només necessita
         * UN PNG, i aquest PNG ja s'ha importat amb la ingesta del projecte. Abans es
         * cridava `utils.readFolder(rutas.chyrons)`: a UNC això és `IO.scanDirectory`,
         * que demana length/modified/created de CADA fitxer → amb 1.028 fitxers
         * (871 .mov de 214 GB) el Promise.all de la portada s'endugé **93,52 s**
         * (log del 21/10/2026 14:51:16) per trobar una portada que ja era al bin.
         *
         * FILTRE (2026-10-21 · #177): la portada del tema és un PNG amb el literal
         * `PORTADA` al nom (p. ex. `Wott_TNC_v1_01i_..._PORTADA_...png`), i viu al
         * bin PORTADES. Abans es filtrava per `TEMA-TITOL`, que NO sempre hi és, i
         * el camí ràpid tornava null → 93 s d'escaneig del NAS per a res.
         * Ordre de preferència: PORTADA + prefix PROG_BLOC → qualsevol PORTADA del
         * bin (el bin és del projecte obert: no pot portar material d'un altre).
         * Si el bin no en té cap (projecte nou, encara sense ingesta) retorna null i
         * `portadas` fa el camí antic.
         *
         * @param {Object} ctx - { config, progData, bloque, dateDir }
         * @returns {Promise<Array|null>} [{name, path}] (més recent primer) o null
         */
        portadasFromProject: async function (ctx) {
            try {
                var U = window.FASTPASS_UI && window.FASTPASS_UI.Utils;
                if (!U || typeof U.callJSX !== 'function') return null;
                var raw = await U.callJSX("FASTPASS.Project.pngItems('PORTADES')", { rawError: true });
                if (!raw || String(raw).indexOf('ERR') === 0) return null;
                var items = JSON.parse(raw);
                if (!items || items.length === 0) return null;

                var fProg = (ctx.progData && ctx.progData.wott) ? ctx.progData.wott.toUpperCase() : 'TNV';
                var fBloc = ctx.bloque ? '_' + ctx.bloque + '_' : '_V1_';
                var prefix = (fProg + fBloc).toUpperCase();

                // 1) El PNG de portada: nom amb `PORTADA` i `.PNG` (el bin pot tindre
                //    altres PNG del tema; només interessa el de portada).
                var cand = items.filter(function (it) {
                    var name = String(it.name || '').toUpperCase();
                    return name.endsWith('.PNG') && name.indexOf('PORTADA') !== -1 && !!it.mediaPath;
                });
                if (cand.length === 0) return null;

                // 2) Preferència pel programa+bloc; si cap el porta al nom, val
                //    qualsevol portada del bin (és el bin del PROJECTE OBERT).
                var pref = cand.filter(function (it) {
                    return String(it.name || '').toUpperCase().indexOf(prefix) !== -1;
                });
                if (pref.length > 0) cand = pref;
                else U.log('[SCAN:portades] Cap portada amb el prefix ' + prefix +
                    ' al bin PORTADES: s\'usa la del bin (' + cand.length + ')', 'WARN');

                // Mateix filtre per data de treball que el camí del NAS, però NOMÉS
                // sobre les portades del bin (poques) → cap escaneig de carpeta.
                var list = cand.map(function (it) {
                    return { name: it.name, created: it.created || 0, mtime: it.modified || 0, path: it.mediaPath };
                });
                if (ctx.dateDir) {
                    var resF = this.filterByWorkDate(list, ctx.dateDir);
                    if (resF.keep.length > 0) {
                        list = resF.keep;
                    } else {
                        // El bin és la FONT DE VERITAT del projecte obert: si cap data
                        // coincideix (projecte reutilitzat, dates del NAS mogudes…) es
                        // fa servir la portada MÉS RECENT del bin en compte de fallar.
                        U.log('[SCAN:portades] El bin PORTADES té ' + list.length +
                            " portada(es) però cap és de la data " + String(ctx.dateDir).replace(/_/g, '') +
                            " → s'usa la MÉS RECENT del bin (no es toca el NAS)", 'WARN');
                        list = list.slice().sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
                        if (list.length > 1) list = list.slice(0, 1);
                    }
                }
                // Més recent primer: `_runPortadaBody` fa servir portadas[0].
                list.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
                U.log('[SCAN:portades] ' + list.length + " portada(es) del BIN PORTADES (cap escaneig del NAS): " +
                    list.map(function (x) { return x.name; }).slice(0, 3).join(', '));
                return list.map(function (x) { return { name: x.name, path: x.path, created: x.created, mtime: x.mtime }; });
            } catch (e) { return null; }
        },

        portadas: async function (ctx) {
            try {
                // ── CAMÍ RÀPID (2026-10-21): la portada JA ÉS AL PROJECTE ──────
                const fromProj = await this.portadasFromProject(ctx);
                if (fromProj && fromProj.length > 0) return fromProj;

                const pathNAS = ctx.config.rutas.chyrons;

                var fProg = (ctx.progData && ctx.progData.wott) ? ctx.progData.wott.toUpperCase() : 'TNV';
                var fBloc = ctx.bloque ? '_' + ctx.bloque + '_' : '_V1_';
                var prefix = (fProg + fBloc).toUpperCase();
                // (2026-10-21 · #177) La portada és el PNG amb `PORTADA` al nom;
                // `TEMA-TITOL` pot faltar-hi (era el motiu del fals negatiu).
                var isPortada = function (nm) {
                    var up = String(nm || '').toUpperCase();
                    return up.indexOf(prefix) !== -1 && up.slice(-4) === '.PNG' && up.indexOf('PORTADA') !== -1;
                };

                // ── LLISTAT (2026-10-30 · rendiment d'arrencada) ─────────────────
                // ABANS: `utils.readFolder(pathNAS)` via JSX (File.created de CADA
                // fitxer de la carpeta de rètols, 1281 noms) → **17,9 s** mesurats al
                // `_boot_timing.log` del 30/10 (era el 99% de l'espera en obrir el
                // panell: `_fullScan · portades`). I és la MATEIXA carpeta que
                // `Scan.wotts` acaba de llistar per la via nativa.
                // ARA: només els NOMS (`cep.fs.readdir`, 2-54 ms) i es daten DESPRÉS
                // només els candidats (`_dateCandidates`: caché + `cep.fs.stat`).
                var allFiles = null;
                var _tN0 = Date.now();
                if (!this._readCache) this._readCache = {};
                var _ck = 'names:' + pathNAS;
                var _cch = this._readCache[_ck];
                if (_cch && (Date.now() - _cch.at) < 30000 && _cch.list && _cch.list.length > 0) {
                    allFiles = _cch.list;
                } else {
                    var _names = this._listNamesNative(pathNAS);
                    if (_names) {
                        allFiles = _names.map(function (n) { return { name: n }; });
                    } else {
                        // Via nativa no disponible: es manté el camí de sempre (JSX).
                        allFiles = await utils.readFolder(pathNAS);
                    }
                    if (allFiles && allFiles.length > 0) this._readCache[_ck] = { at: Date.now(), list: allFiles };
                }
                if (!allFiles || allFiles.length === 0) return [];
                _bm('portades · llistat (' + _ms(_tN0) + ', ' + allFiles.length + ' noms)');

                let filtered = allFiles.filter(function (f) { return isPortada(f.name); });
    
                // MECÀNICA D'INICI (2026-09-04): eliminada la guarda per mtime (22h);
                // el filtre per data (a continuació) ja restringeix al dia de treball.
                let freshFiles = filtered;

                // ---- FILTRE PER DATA DEL PROJECTE (2026-09-02) ----
                // Mateix criteri que Scan.wotts: nomes portades de la data de
                // treball del projecte (ctx.dateDir). Data del nom (YYYYMMDD),
                // o created/mtime com a fallback; si no es pot datar, es descarta.
                // MECANISME ÚNIC de filtrat per data (Scan.filterByWorkDate).
                var dateTarget = ctx.dateDir ? String(ctx.dateDir).replace(/_/g, '') : null;
                if (dateTarget) {
                    // (2026-10-30 · rendiment) Si el llistat ve de la via nativa els
                    // candidats NO porten `created`/`mtime`: es daten ARA, i només
                    // ells (caché persistent + `cep.fs.stat`), amb el mateix
                    // mecanisme que `Scan.wotts` (#182/#204). Amb la llista JSX
                    // antiga ja venien datats i este pas no costa res (pas 0).
                    var _tD0 = Date.now();
                    if (freshFiles.length > 0) await this._dateCandidates(pathNAS, freshFiles);
                    _bm('portades · datació de candidats (' + _ms(_tD0) + ', ' + freshFiles.length + ')');
                    var resF = this.filterByWorkDate(freshFiles, ctx.dateDir);
                    utils.log('[SCAN:portades] Filtre per data projecte ' + dateTarget + ': ' + freshFiles.length + ' -> ' + resF.keep.length +
                        (resF.dropped.length ? ' (descartats ' + resF.dropped.length + " d'altres dies: " + resF.dropped.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : '') +
                        (resF.noDate.length ? ' (NO datables descartats: ' + resF.noDate.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : ''), 'INFO');
                    freshFiles = resF.keep;
                }

                return freshFiles.map(function (f) { return { name: f.name, path: pathNAS + f.name }; });
            } catch (e) { return []; }
        },

        // (2026-10-23) RETIRAT `srtFallback`: buscava un .SRT de recanvi a la carpeta de
        // VERTICALITZACIO del NAS. Els subtitols del projecte viuen al costat del .prproj
        // (CARREGAR) o a la carpeta de sintetics (`srtSynthetic`).

        /**
         * _sintProgTokens: Tokens que identifiquen el PROGRAMA en el nom d'un .srt
         * sintetic. S'accepten els dos codis del perfil (`archivo` i `wott`), perque
         * la carpeta `SRT_SINTETICS` la nodrixen eines externes i el nom pot portar
         * cualsevol dels dos (`TN_COMARQUES_V3_…` o `TNC_V3_…`).
         * @param {Object} progData - Entrada de `mapeoProgramas`
         * @returns {string[]} Tokens en MAJUSCULES (p.ex. ['TN_COMARQUES','TNC'])
         */
        _sintProgTokens: function (progData) {
            var toks = [];
            var push = function (v) {
                var s = String(v || '').trim().toUpperCase();
                if (s && toks.indexOf(s) === -1) toks.push(s);
            };
            push(progData && progData.archivo);
            push(progData && progData.wott);
            return toks;
        },

        /**
         * _sintNameMatchesProg: (2026-10-23 · BUG #187) El `.srt` sintetic és del
         * MATEIX PROGRAMA que el bloc que s'esta editant?
         *
         * PER QUE ES MIRA NOMES EL PREFIX: els sintetics de la carpeta es diuen
         * `<PROGRAMA>_<BLOC>_<titol>…_Subtitles.srt` (a voltes amb `YYYYMMDD_` al
         * davant). Mirar el prefix (i no `indexOf` a tot el nom) evita que un titol
         * que continga «MAT» o «TNC» faça passar per bo un fitxer d'un altre programa.
         * @param {string} name - Nom (o path) del .srt
         * @param {Object} progData - { archivo, wott }
         * @returns {string|null} Token que ha casat, o null si és d'un altre programa
         */
        _sintNameMatchesProg: function (name, progData) {
            var n = String(name || '').toUpperCase();
            if (!n) return null;
            // Path complet → nom solt; despres lleva el prefix de data opcional.
            n = n.split('\\').pop().split('/').pop();
            n = n.replace(/^\d{8}[_\-]/, '');
            var toks = this._sintProgTokens(progData);
            for (var i = 0; i < toks.length; i++) {
                if (n.indexOf(toks[i] + '_') === 0) return toks[i];
            }
            return null;
        },

        /**
         * srtSynthetic: SRT SINTETICS del dia de treball (F3.2).
         * Viuen a `rutas.subtitulosSinteticos` (per defecte `<subtitulos>/SINTETICS`).
         * Mateix criteri de data que les altres sondes: si un fitxer no es pot datar
         * (nom sense YYYYMMDD i sense creacio) ES DESCARTA — mai subtitols d'un
         * altre dia dins del bloc.
         *
         * (2026-10-23 · BUG #187) MATEIX PROGRAMA, SEMPRE: `dateDir` ha de ser la del
         * PROJECTE OBERT (ho resol `flow_srt._srtCtx`) i el nom del .srt ha de
         * començar pel codi del programa (`_sintNameMatchesProg`). Abans hi havia un
         * N3 «qualsevol .srt de la data» que, en un bloc de `TN_COMARQUES V3`, va
         * carregar `MATINS_V5_GUIO_LA_PLOMA_…` (0/68 frases en comú) i el 🧩 va
         * col·locar al timeline subtítols d'un altre programa.
         *
         * Nivells (s'atura al primer amb candidats · tots dos filtren per programa):
         *   N1: `{archivo}_{bloque}_` + data de treball
         *   N2: `{archivo}_` (nomes programa) + data de treball
         * Sense candidat del programa → `null` (i el motiu al log): mai material alié.
         *
         * @param {Object} ctx - { config, progData, bloque, dateDir }
         * @returns {{name:string, path:string, level:number, reason:string, candidates:number}|null}
         */
        srtSynthetic: async function (ctx) {
            try {
                // (2026-10-23 · BUG #190) MOTIU PER AL PANELL: quan no hi ha cap
                // candidat, la barra d'estat ha de poder dir EL PER QUÈ. El 🧩
                // responia «revisa rutas.subtitulosSinteticos» tot i que la carpeta
                // estava bé: eixe dia només hi havia sintetics d'un ALTRE programa
                // (els descarta la guarda de #187) → pareixia que el botó no feia res.
                this._sintMiss = null;
                if (!ctx || !ctx.config || !ctx.config.rutas || !ctx.progData) return null;
                var dir = String(ctx.config.rutas.subtitulosSinteticos || '');
                if (!dir) {
                    utils.log('[SCAN:srtSynthetic] Cap ruta de subtitols sintetics configurada', 'WARN');
                    return null;
                }
                var allFiles = await utils.readFolder(dir);
                if (!allFiles || allFiles.length === 0) {
                    utils.log('[SCAN:srtSynthetic] Carpeta inaccessible o buida: ' + dir, 'WARN');
                    this._sintMiss = { reason: 'carpeta', date: null, dir: dir };
                    return null;
                }
                var srts = allFiles.filter(function (f) { return /\.srt$/i.test(f.name || ''); });
                if (srts.length === 0) {
                    utils.log('[SCAN:srtSynthetic] Cap .SRT a ' + dir, 'WARN');
                    return null;
                }
                var dateTarget = ctx.dateDir ? String(ctx.dateDir).replace(/_/g, '') : null;
                if (!dateTarget) {
                    utils.log('[SCAN:srtSynthetic] Sense data de treball (dateDir) → NO es carrega cap .SRT.', 'WARN');
                    return null;
                }
                var self = this;
                var delDia = srts.filter(function (f) { return self._fileDateYYYYMMDD(f) === dateTarget; });
                if (delDia.length === 0) {
                    utils.log('[SCAN:srtSynthetic] Cap .SRT de la data ' + dateTarget + ' a ' + dir +
                        ' (' + srts.length + " d'altres dies descartats)", 'WARN');
                    this._sintMiss = { reason: 'cap-del-dia', date: dateTarget, dir: dir, otros: srts.length };
                    return null;
                }
                delDia.sort(function (a, b) {
                    var da = self._fileDateYYYYMMDD(a) || '';
                    var db = self._fileDateYYYYMMDD(b) || '';
                    if (da !== db) return db.localeCompare(da);
                    return (b.created || 0) - (a.created || 0);
                });
                var archivoUp = String(ctx.progData.archivo || '').toUpperCase();
                var bloqueUp = String(ctx.bloque || '').toUpperCase();
                var pBoth = archivoUp + '_' + bloqueUp + '_';
                var pProg = archivoUp + '_';
                // ── (2026-10-23 · BUG #187) GUARDA DURA DE PROGRAMA ───────────────
                // Antes N3 tornava QUALSEVOL .srt de la data si no hi havia cap del
                // programa: en el bloc `2026_10_22/V3` (TN_COMARQUES) es va carregar
                // `MATINS_V5_GUIO_LA_PLOMA_…` — 0/68 frases en comú amb el SRT del
                // bloc — i el 🧩 va col·locar al timeline subtítols d'un altre
                // programa. Ara el programa es filtra ABANS de triar nivell.
                var delProg = delDia.filter(function (f) { return !!self._sintNameMatchesProg(f.name, ctx.progData); });
                if (delProg.length === 0) {
                    var aliens = delDia.slice(0, 4).map(function (f) { return f.name; }).join(' | ');
                    utils.log('[SCAN:srtSynthetic] Cap .srt sintetic del programa ' + (archivoUp || '?') +
                        ' el ' + dateTarget + " → NO es carrega res (mai subtitols d'un altre programa). " +
                        "Descartats " + delDia.length + ' del dia: ' + aliens + (delDia.length > 4 ? ' …' : ''), 'WARN');
                    // (BUG #190) El motiu ha d'arribar a la barra d'estat del panell.
                    this._sintMiss = {
                        reason: 'altres-programes', date: dateTarget, dir: dir,
                        programa: archivoUp, delDia: delDia.length,
                        aliens: delDia.slice(0, 4).map(function (f) { return f.name; })
                    };
                    return null;
                }
                if (delProg.length !== delDia.length) {
                    utils.log('[SCAN:srtSynthetic] ' + (delDia.length - delProg.length) +
                        " .srt del dia descartats per programa (no comencen per " + (archivoUp || '?') +
                        ' ni pel seu codi alternatiu)', 'INFO');
                }
                var hasBoth = function (f) { return !!bloqueUp && (f.name || '').toUpperCase().indexOf(pBoth) !== -1; };
                var levels = [
                    { level: 1, reason: 'prefix ' + pBoth + ' + data de treball', list: delProg.filter(hasBoth) },
                    { level: 2, reason: 'prefix ' + pProg + ' + data de treball (qualsevol bloc)', list: delProg.slice() }
                ];
                for (var i = 0; i < levels.length; i++) {
                    var L = levels[i];
                    if (L.list.length === 0) continue;
                    var pick = L.list[0];
                    utils.log('[SCAN:srtSynthetic] N' + L.level + ' (' + L.reason + '): ' + L.list.length +
                        ' candidat(s) · triat "' + pick.name + '" (' + (self._fileDateYYYYMMDD(pick) || 'sense data') + ')', 'INFO');
                    // Els altres candidats DEL MATEIX PROGRAMA tambe queden al log: si
                    // el triat no és el bloc correcte es pot veure d'on vindria.
                    if (L.list.length > 1) {
                        utils.log('[SCAN:srtSynthetic] N' + L.level + ' altres del programa: ' +
                            L.list.slice(1, 6).map(function (f) { return f.name; }).join(' | ') +
                            (L.list.length > 6 ? ' …' : ''), 'INFO');
                    }
                    return {
                        name: pick.name,
                        // (2026-10-23 · BUG #185) `readFolder` torna NOMS solts: cal
                        // enganxar-hi el separador. Sense la barra el path quedava
                        // `...\SRT_SINTETICSMATINS_V5_..._Subtitles.srt` (carpeta i
                        // nom fusionats) → `IO.readTxt` fallava i el Ctrl+clic de ⬇️
                        // "no carregava res" (al log només hi havia "SRT_EDIT:
                        // Carregant ..." i cap "N entrades").
                        path: String(dir).replace(/[\\/]+$/, '') + '\\' + pick.name,
                        level: L.level,
                        reason: L.reason,
                        candidates: L.list.length
                    };
                }
                return null;
            } catch (e) {
                utils.log('💥 [SCAN:srtSynthetic] ' + e.message, 'ERROR');
                return null;
            }
        }

    };

    window.Scan = FASTPASS_UI.Logic.Scan;
})();
