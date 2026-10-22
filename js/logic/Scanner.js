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

        selectedProject: function(fileList, progKey, blocKey) {
            if (!fileList || fileList.length === 0) return null;
            
            // El patrón de identidad: Pruebas_TNV_V1_ (con guión bajo final)
            // para evitar falsos positivos como V10 cuando buscamos V1
            const pattern = `Pruebas_${progKey}_${blocKey}_`.toLowerCase();
            
            const match = fileList.find(f => {
                const name = f.name.toLowerCase();
                // Verifiquem que comenci per la cadena i sigui un projecte de Premiere
                const matches = name.indexOf(pattern) === 0 && name.endsWith(".prproj");
                return matches;
            });
            
            return match ? match.name : null;
        },

        mediaAssets: async function (ctx, temaHint) {
            try {
                const pathNAS = ctx.config.rutas.verticalitzacio;
                const allFiles = await utils.readFolder(pathNAS);
                // ── F1 (2026-10-01) · lectura FALLIDA ≠ carpeta buida ─────────────
                // Sense això, un error/timeout del pont feia creure que el bloc no
                // té MP4/SRT (i el flux decidia com si no hi hagués material).
                if (!allFiles) {
                    utils.log('❌ [SCAN:media] Lectura FALLIDA de la carpeta de verticalització (' + pathNAS + ').', 'ERROR');
                    return { mp4: null, srt: null, failed: true };
                }
                if (allFiles.length === 0) return { mp4: null, srt: null };

                var datePrefix = ctx.dateDir ? ctx.dateDir.replace(/_/g, '') : null;
                var prefix = ctx.progData.archivo + '_' + ctx.bloque + '_';

                var validFiles = this._filterMediaByDate(allFiles, datePrefix, prefix);
                if (validFiles.length === 0) {
                    // MECÀNICA D'INICI (2026-09-04): NO es reintenta sense filtre de data.
                    // Si no hi ha MP4/SRT de la data de treball, es retorna buit (mai d'altre dia).
                    utils.log('⚠️ [SCAN:media] Cap MP4/SRT amb data ' + datePrefix + '. Retornant buit (no es busca en altres dies).', 'DEBUG');
                }

                if (validFiles.length === 0) return { mp4: null, srt: null };

                validFiles.sort(function (a, b) {
                    var da = this._extractDateFromFileName(a.name);
                    var db = this._extractDateFromFileName(b.name);
                    return (db || '').localeCompare(da || '');
                }.bind(this));

                var getAsset = function (ext) {
                    var upperExt = ext.toUpperCase();
                    for (var i = 0; i < validFiles.length; i++) {
                        if (validFiles[i].name.toUpperCase().endsWith(upperExt)) {
                            return { name: validFiles[i].name, path: pathNAS + validFiles[i].name };
                        }
                    }
                    return null;
                };

                var mp4 = getAsset('.MP4');
                var srt = getAsset('.SRT');

                // ─── AFINAR LA LOCALITZACIÓ DEL SRT ─────────────────────────────
                // Dins d'un mateix bloc hi pot haver diversos .srt (una per notícia).
                // Preferim el que coincideix amb el tema del projecte (si es coneix).
                if (srt && temaHint && String(temaHint).trim().length > 1) {
                    var normalizedTema = this._normalize(temaHint);
                    for (var j = 0; j < validFiles.length; j++) {
                        var candidate = validFiles[j].name;
                        if (!candidate.toUpperCase().endsWith('.SRT')) continue;
                        if (normalizedTema && this._normalize(candidate).indexOf(normalizedTema) !== -1) {
                            srt = { name: candidate, path: pathNAS + candidate };
                            utils.log('🎯 [SCAN:media] SRT coincident amb el tema "' + temaHint + '": ' + candidate, 'DEBUG');
                            break;
                        }
                    }
                }

                return { mp4: mp4, srt: srt };
            } catch (e) { return { mp4: null, srt: null }; }
        },

        _filterMediaByDate: function (files, datePrefix, nameFilter) {
            if (!files || files.length === 0) return [];
            var prefix = nameFilter.toUpperCase();
            var dateTarget = datePrefix;
            var self = this;
            return files.filter(function (f) {
                var name = f.name.toUpperCase();
                if (name.indexOf(prefix) === -1) return false;
                if (!name.endsWith('.MP4') && !name.endsWith('.SRT')) return false;
                if (dateTarget) {
                    var fileDate = self._extractDateFromFileName(f.name);
                    if (!fileDate) {
                        // Fallback: usar data de creació del fitxer (f.created)
                        // per a fitxers que no tenen data al nom (ex: .SRT)
                        if (f.created) {
                            var d = new Date(f.created);
                            var dd = ('0' + d.getDate()).slice(-2);
                            var mm = ('0' + (d.getMonth() + 1)).slice(-2);
                            fileDate = '' + d.getFullYear() + mm + dd;
                        }
                    }
                    if (!fileDate || fileDate !== dateTarget) return false;
                }
                return true;
            });
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
                    allFiles = await utils.readFolder(pathNAS);
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
                var fBloc = ctx.bloque ? '_' + ctx.bloque + '_' : '_V1_';
                var prefix = (fProg + fBloc).toUpperCase();
    
                let filtered = allFiles.filter(function (f) {
                    var name = f.name.toUpperCase();
                    return name.indexOf(prefix) !== -1 && name.endsWith('.MOV');
                });
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
                    var resF = this.filterByWorkDate(filtered, ctx.dateDir);
                    utils.log('[SCAN:wotts] Filtre per data projecte ' + dateTarget + ': ' + filtered.length + ' -> ' + resF.keep.length +
                        (resF.dropped.length ? ' (descartats ' + resF.dropped.length + " d'altres dies: " + resF.dropped.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : '') +
                        (resF.noDate.length ? ' (NO datables descartats: ' + resF.noDate.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : ''), 'INFO');
                    filtered = resF.keep;
                    if (filtered.length === 0) {
                        utils.log('[SCAN:wotts] Cap chyron de la data del projecte (' + dateTarget + "). No s'importara cap retol.", 'WARN');
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

                return { 
                    tema: tema, 
                    list: filtered.map(f => ({
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
        //   · Node sí: fs.stat().birthtime (≈1,5 ms/fitxer; 32 ms el readdir de
        //     963 noms, mesurat el 2026-10-21).
        // Cost per poll (15 s): readdir + stats NOMÉS dels noms no datats encara
        // (caché `_wottDateCache` per nom) → ~35 ms en règim estable.
        // ────────────────────────────────────────────────────────────────────
        _wottDateCache: null,    // { NOM_EN_MAJUSCULES: 'YYYYMMDD' }
        _wottProbeCache: null,   // { clau: { at, res } } · TTL 5 s
        WOTT_PROBE_TTL_MS: 5000,
        _mp4ProbeCache: null,    // { clau: { at, res } } · TTL 5 s (MP4 origen)
        MP4_PROBE_TTL_MS: 5000,
        _probeInflight: null,    // { clau: Promise } · sonda en curs (dedupe)

        /** _probeKey: clau d'una sonda (tipus + carpeta + bloc + dia de treball). */
        _probeKey: function (ctx, kind) {
            const r = (ctx && ctx.config && ctx.config.rutas) ? ctx.config.rutas : {};
            const folder = (kind === 'mp4') ? (r.verticalitzacio || '') : (r.chyrons || '');
            return kind + '|' + folder + '|' + ((ctx && ctx.bloque) || '') + '|' + ((ctx && ctx.dateDir) || '');
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
         * PER QUÈ CAL: en este equip el panell NO té Node (`_nodeFs()` → null) i, en
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
            const key = this._probeKey(ctx, 'wotts');
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

            // ── 1. NOMS (sense stats): Node → CEP → readFolder (JSX, últim recurs)
            let names = null;
            try {
                const fs = window.FASTPASS_UI.Utils._nodeFs();
                if (fs && fs.promises && fs.promises.readdir) {
                    names = await fs.promises.readdir(folder);
                    out.via = 'node';
                } else if (fs && fs.readdirSync) {
                    names = fs.readdirSync(folder);
                    out.via = 'node';
                }
            } catch (eN) { names = null; }

            if (!names && window.cep && window.cep.fs && window.cep.fs.readdir) {
                try {
                    const rd = window.cep.fs.readdir(folder);
                    if (rd && rd.err === 0 && rd.data) {
                        names = rd.data.map(function (n) { return (typeof n === 'string') ? n : (n && n.name); });
                        out.via = 'cep';
                    }
                } catch (eC) { names = null; }
            }

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

            // ── 2. DATACIÓ per birthtime (caché per NOM: cada fitxer, una vegada)
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

        /**
         * mp4Today: hi ha el MP4 ORIGEN del BLOC i del DIA de treball?
         *
         * (2026-10-21 · #177 · estats d'arrencada) El botó distingeix tres
         * situacions abans de crear: MASSA D'HORA (ni MP4 ni wotts), ESPERA (MP4
         * però encara sense wotts) i CREA (wotts). Este sondeig respon només a la
         * primera pregunta i HO FA BARAT: noms per Node (`readdir`, ~30 ms) i
         * `birthtime` NOMÉS dels candidats (els noms no sempre porten data).
         *
         * PER QUÈ NO `mediaAssets`: eixe àtom llig la carpeta amb
         * `Utils.readFolder`; en UNC això és un escaneig ExtendScript amb
         * `length/modified/created` de CADA fitxer (el mateix que va costar 93 s a
         * la portada). Ací només cal saber SI hi ha un .MP4 del bloc.
         *
         * @param {Object} ctx - { config, progData, bloque, dateDir }
         * @returns {Promise<{ok:boolean, found:boolean, name:string, via:string}>}
         *          `ok:false` = no s'ha pogut llistar → no es pot afirmar res.
         */
        mp4Today: async function (ctx) {
            // Mateix dedupe que `wottsToday` (2026-10-22 · #113).
            const key = this._probeKey(ctx, 'mp4');
            if (!this._probeInflight) this._probeInflight = {};
            if (this._probeInflight[key]) {
                utils.log('⏳ [SCAN:mp4Today] sonda en curs reaprofitada (' + key + ')', 'DEBUG');
                return await this._probeInflight[key];
            }
            const p = this._mp4TodayRun(ctx);
            this._probeInflight[key] = p;
            try { return await p; }
            finally { delete this._probeInflight[key]; }
        },

        _mp4TodayRun: async function (ctx) {
            const out = { ok: false, found: false, name: '', via: '' };
            if (!ctx || !ctx.config || !ctx.config.rutas) return out;
            const folder = ctx.config.rutas.verticalitzacio;
            const dateTarget = ctx.dateDir ? String(ctx.dateDir).replace(/_/g, '') : null;
            const prog = (ctx.progData && ctx.progData.archivo) ? String(ctx.progData.archivo).toUpperCase() : '';
            const bloc = ctx.bloque ? String(ctx.bloque).toUpperCase() : '';
            if (!folder || !dateTarget || !prog || !bloc) return out;
            const prefix = prog + '_' + bloc + '_';
            this._loadDateCache();      // #113: dates ja conegudes (sobreviuen a reinicis)
            const _t0 = Date.now();

            const cacheKey = folder + '|' + prefix + '|' + dateTarget;
            if (!this._mp4ProbeCache) this._mp4ProbeCache = {};
            const hit = this._mp4ProbeCache[cacheKey];
            if (hit && (Date.now() - hit.at) < (this.MP4_PROBE_TTL_MS || 5000)) return hit.res;

            // ── 1. NOMS (sense stats): Node → CEP → readFolder (JSX, últim recurs)
            let names = null;
            let createdByName = null;   // només el camí JSX ja porta `created`
            try {
                const fs = window.FASTPASS_UI.Utils._nodeFs();
                if (fs && fs.promises && fs.promises.readdir) {
                    names = await fs.promises.readdir(folder);
                    out.via = 'node';
                } else if (fs && fs.readdirSync) {
                    names = fs.readdirSync(folder);
                    out.via = 'node';
                }
            } catch (eN) { names = null; }

            if (!names && window.cep && window.cep.fs && window.cep.fs.readdir) {
                try {
                    const rd = window.cep.fs.readdir(folder);
                    if (rd && rd.err === 0 && rd.data) {
                        names = rd.data.map(function (n) { return (typeof n === 'string') ? n : (n && n.name); });
                        out.via = 'cep';
                    }
                } catch (eC) { names = null; }
            }

            if (!names) {
                try {
                    const all = await utils.readFolder(folder);
                    if (all) {
                        createdByName = {};
                        for (let i = 0; i < all.length; i++) createdByName[all[i].name] = all[i].created || 0;
                        names = all.map(function (f) { return f.name; });
                        out.via = 'jsx';
                    }
                } catch (eJ) { names = null; }
            }
            if (!names) {
                utils.log('❌ [SCAN:mp4Today] No s\'ha pogut llistar ' + folder + ' → estat del MP4 desconegut', 'ERROR');
                return out;   // ok:false
            }
            _bm('MP4 · llistat (' + _ms(_t0) + ', ' + names.length + ' noms, via ' + (out.via || '?') + ')');

            const cands = names.filter(function (n) {
                const u = String(n || '').toUpperCase();
                return u.indexOf(prefix) !== -1 && u.slice(-4) === '.MP4';
            });
            out.ok = true;                    // el llistat SÍ que ha funcionat
            if (cands.length === 0) {
                this._mp4ProbeCache[cacheKey] = { at: Date.now(), res: out };
                return out;
            }

            // ── 2. DATACIÓ: nom (YYYYMMDD) → created (JSX) → birthtime (caché)
            const dates = {};
            const pending = [];
            for (let k = 0; k < cands.length; k++) {
                const n = cands[k];
                const d8 = this._extractDateFromFileName(n);
                if (d8) { dates[String(n).toUpperCase()] = d8; continue; }
                const cr = createdByName ? this._localDate(createdByName[n]) : null;
                if (cr) { dates[String(n).toUpperCase()] = cr; continue; }
                pending.push(n);
            }
            if (pending.length > 0) {
                // Mateixa caché de dates que els wotts: clau = NOM SENCER (els .MP4 i
                // els .MOV no col·lideixen) i cada fitxer es data una sola vegada.
                const _tD = Date.now();
                await this._dateWotts(folder, pending);
                _bm('MP4 · datació (' + _ms(_tD) + ', ' + pending.length + ' fitxer(s) nous)');
                const cache = this._wottDateCache || {};
                for (let p = 0; p < pending.length; p++) {
                    const d8p = cache[String(pending[p]).toUpperCase()];
                    if (d8p) dates[String(pending[p]).toUpperCase()] = d8p;
                }
            }

            const todays = cands.filter(function (n) { return dates[String(n).toUpperCase()] === dateTarget; });
            out.found = todays.length > 0;
            out.name = todays.length > 0 ? String(todays[0]) : '';
            this._mp4ProbeCache[cacheKey] = { at: Date.now(), res: out };
            utils.log('🎬 [SCAN:mp4Today] ' + prefix + ' ' + dateTarget + ': ' + todays.length + '/' + cands.length +
                ' MP4 origen (' + (out.via || '?') + ') → ' + (out.found ? 'hi és' : 'encara no'), 'DEBUG');
            return out;
        },

        /**
         * _dateWotts: omple `_wottDateCache` (NOM → YYYYMMDD) pels noms indicats.
         * Ordre: birthtime (Node) → creationTime (CEP) → File.created (JSX).
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

            // ── 1. NODE · birthtime (l'única data fiable: el mtime el mou el procés nocturn)
            let fs = null;
            try { fs = window.FASTPASS_UI.Utils._nodeFs(); } catch (eF) { fs = null; }
            if (fs && fs.promises && fs.promises.stat) {
                const CHUNK = 16;   // no esclafar l'SMB amb 150 stats alhora
                for (let i = 0; i < names.length; i += CHUNK) {
                    const slice = names.slice(i, i + CHUNK);
                    const res = await Promise.all(slice.map(function (n) {
                        return fs.promises.stat(base + n).then(function (st) {
                            return { n: n, t: (st && st.birthtime) ? st.birthtime.getTime() : 0 };
                        }, function () { return { n: n, t: 0 }; });
                    }));
                    for (let j = 0; j < res.length; j++) {
                        put(res[j].n, self._localDate(res[j].t));
                    }
                }
                names = left(names);
                if (names.length === 0) { this._saveDateCache(); return; }
            }

            // ── 2. CEP · creationTime (en UNC sol venir buit, però és gratis provar-ho)
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

            // ── 3. JSX · File.created (una lectura cara, però queda cachejada per sempre)
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
                const allFiles = await utils.readFolder(pathNAS);
                if (!allFiles || allFiles.length === 0) return [];

                var fProg = (ctx.progData && ctx.progData.wott) ? ctx.progData.wott.toUpperCase() : 'TNV';
                var fBloc = ctx.bloque ? '_' + ctx.bloque + '_' : '_V1_';
                var prefix = (fProg + fBloc).toUpperCase();
    
                let filtered = allFiles.filter(function (f) {
                    var name = f.name.toUpperCase();
                    // (2026-10-21 · #177) La portada és el PNG amb `PORTADA` al nom;
                    // `TEMA-TITOL` pot faltar-hi (era el motiu del fals negatiu).
                    return name.indexOf(prefix) !== -1 && name.endsWith('.PNG') && name.indexOf('PORTADA') !== -1;
                });
    
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
                    var resF = this.filterByWorkDate(freshFiles, ctx.dateDir);
                    utils.log('[SCAN:portades] Filtre per data projecte ' + dateTarget + ': ' + freshFiles.length + ' -> ' + resF.keep.length +
                        (resF.dropped.length ? ' (descartats ' + resF.dropped.length + " d'altres dies: " + resF.dropped.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : '') +
                        (resF.noDate.length ? ' (NO datables descartats: ' + resF.noDate.slice(0, 3).map(function(x){ return x.name; }).join(', ') + '...)' : ''), 'INFO');
                    freshFiles = resF.keep;
                }

                return freshFiles.map(function (f) { return { name: f.name, path: pathNAS + f.name }; });
            } catch (e) { return []; }
        },

        /**
         * srtFallback: Cerca un .SRT de RECANVI a la carpeta de verticalització (la MATEIXA
         * on viuen els MP4 del bloc) SENSE els filtres estrictes de Scan.mediaAssets.
         *
         * (2026-09-22) **SEMPRE dins de la DATA DE TREBALL.** Abans hi havia dos nivells sense
         * filtre de data — «prefix (qualsevol data)» i «qualsevol .SRT de la carpeta» — que
         * podien carregar subtítols D'UN ALTRE DIA: cas real, el TNC V1 del 22/09 va carregar
         * el .SRT del 21/09 «EMPRESES DE LLEURE… LA CERDANYA» ✗. Ara, si no hi ha cap .SRT de
         * la data de treball, NO es carrega res (es diu el motiu al log i al panell).
         *
         * Nivells (s'atura al primer amb candidats), tots filtrats per la data de treball:
         *   N1: {archivo}_{bloque}_ + DATA de treball
         *   N2: qualsevol .SRT de la DATA de treball
         * Dins de cada nivell es tria el MÉS RECENT (data del nom/creació desc).
         *
         * @param {Object} ctx - { config, progData, bloque, dateDir }
         * @returns {{name:string, path:string, level:number, reason:string, candidates:number}|null}
         */
        srtFallback: async function (ctx) {
            try {
                if (!ctx || !ctx.config || !ctx.config.rutas || !ctx.progData) return null;
                var dir = String(ctx.config.rutas.verticalitzacio || '');
                if (!dir) return null;
                var last = dir.charAt(dir.length - 1);
                if (last !== '\\' && last !== '/') dir += '\\';

                var allFiles = await utils.readFolder(dir);
                if (!allFiles || allFiles.length === 0) {
                    utils.log('[SCAN:srtFallback] Carpeta inaccessible o buida: ' + dir, 'WARN');
                    return null;
                }
                var srts = allFiles.filter(function (f) { return /\.srt$/i.test(f.name || ''); });
                if (srts.length === 0) {
                    utils.log('[SCAN:srtFallback] Cap .SRT a ' + dir, 'WARN');
                    return null;
                }

                var self = this;
                // Més recent primer: data del nom/creació (YYYYMMDD) desc, després created.
                srts.sort(function (a, b) {
                    var da = self._fileDateYYYYMMDD(a) || '';
                    var db = self._fileDateYYYYMMDD(b) || '';
                    if (da !== db) return db.localeCompare(da);
                    return (b.created || 0) - (a.created || 0);
                });

                var dateTarget = ctx.dateDir ? String(ctx.dateDir).replace(/_/g, '') : null;
                if (!dateTarget) {
                    utils.log('[SCAN:srtFallback] Sense data de treball (dateDir) → NO es carrega cap .SRT (per seguretat).', 'WARN');
                    return null;
                }
                var progUp = String(ctx.progData.archivo || '').toUpperCase();
                var bloqueUp = String(ctx.bloque || '').toUpperCase();
                var prefix = progUp + '_' + bloqueUp + '_';
                var hasPrefix = function (f) { return progUp && (f.name || '').toUpperCase().indexOf(prefix) !== -1; };
                var ofDate = function (f) { return self._fileDateYYYYMMDD(f) === dateTarget; };

                // (2026-09-22) FILTRE ESTRICTE DE DATA: només .SRT del dia de treball.
                var delDia = srts.filter(ofDate);
                if (delDia.length === 0) {
                    utils.log('[SCAN:srtFallback] Cap .SRT de la data ' + dateTarget + ' a ' + dir +
                        ' (' + srts.length + ' .SRT d\'altres dies descartats). NO es carrega cap subtítol.', 'WARN');
                    return null;
                }

                // (2026-09-23) NOMÉS N1: el .SRT ha de ser DEL PROGRAMA I DEL BLOC actuals i del dia
                // de treball. L'antic N2 ("qualsevol .SRT del dia") s'ha ELIMINAT de soca-rel:
                // si no hi ha el .SRT del bloc, NO es carrega res — s'avisa i prou (queixa de
                // l'usuari: s'hi carregava un SRT de MATINS_V5 en un projecte TNC).
                var levels = [
                    { level: 1, reason: 'prefix programa_bloc + data de treball', list: delDia.filter(hasPrefix) }
                ];
                for (var i = 0; i < levels.length; i++) {
                    var L = levels[i];
                    if (L.list.length === 0) continue;
                    var pickF = L.list[0];
                    utils.log('[SCAN:srtFallback] N' + L.level + ' (' + L.reason + '): ' + L.list.length +
                        ' candidat(s) · triat "' + pickF.name + '" (' + (self._fileDateYYYYMMDD(pickF) || 'sense data') + ')', 'INFO');
                    return {
                        name: pickF.name,
                        path: dir + pickF.name,
                        level: L.level,
                        reason: L.reason,
                        candidates: L.list.length
                    };
                }
                return null;
            } catch (e) {
                utils.log('💥 [SCAN:srtFallback] ' + e.message, 'ERROR');
                return null;
            }
        },

        /**
         * srtSynthetic: SRT SINTETICS del dia de treball (F3.2).
         * Viuen a `rutas.subtitulosSinteticos` (per defecte `<subtitulos>/SINTETICS`).
         * Mateix criteri de data que `srtFallback`: si un fitxer no es pot datar
         * (nom sense YYYYMMDD i sense creacio) ES DESCARTA — mai subtitols d'un
         * altre dia dins del bloc.
         *
         * Nivells (s'atura al primer amb candidats):
         *   N1: `{archivo}_{bloque}_` + data de treball
         *   N2: `{archivo}_` (nomes programa) + data de treball
         *   N3: qualsevol `.srt` de la data a la carpeta de sintetics
         *
         * @param {Object} ctx - { config, progData, bloque, dateDir }
         * @returns {{name:string, path:string, level:number, reason:string, candidates:number}|null}
         */
        srtSynthetic: async function (ctx) {
            try {
                if (!ctx || !ctx.config || !ctx.config.rutas || !ctx.progData) return null;
                var dir = String(ctx.config.rutas.subtitulosSinteticos || '');
                if (!dir) {
                    utils.log('[SCAN:srtSynthetic] Cap ruta de subtitols sintetics configurada', 'WARN');
                    return null;
                }
                var allFiles = await utils.readFolder(dir);
                if (!allFiles || allFiles.length === 0) {
                    utils.log('[SCAN:srtSynthetic] Carpeta inaccessible o buida: ' + dir, 'WARN');
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
                var hasBoth = function (f) { return archivoUp && (f.name || '').toUpperCase().indexOf(pBoth) !== -1; };
                var hasProg = function (f) { return archivoUp && (f.name || '').toUpperCase().indexOf(pProg) !== -1; };
                var levels = [
                    { level: 1, reason: 'prefix programa_bloc + data de treball', list: delDia.filter(hasBoth) },
                    { level: 2, reason: 'prefix programa + data de treball', list: delDia.filter(hasProg) },
                    { level: 3, reason: 'qualsevol sintetic de la data', list: delDia }
                ];
                for (var i = 0; i < levels.length; i++) {
                    var L = levels[i];
                    if (L.list.length === 0) continue;
                    var pick = L.list[0];
                    utils.log('[SCAN:srtSynthetic] N' + L.level + ' (' + L.reason + '): ' + L.list.length +
                        ' candidat(s) · triat "' + pick.name + '" (' + (self._fileDateYYYYMMDD(pick) || 'sense data') + ')', 'INFO');
                    return {
                        name: pick.name,
                        path: dir + pick.name,
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
