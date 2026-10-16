/**
 * ============================================================================
 * FASTPASS_UI.SessionManifest - v2.0.0
 * Mòdul de persistència de sessió (.fastpass.json) — FONT ÚNICA DE VERITAT
 *
 * v2.0.0 (2026-10-15) · CENTRALITZACIÓ DE LES DADES D'ANÀLISI
 *   El manifest passa a contenir TOTES les dades d'anàlisi del projecte, en
 *   seccions independents (vegeu docs/specs/FASTPASS_JSON_SPEC.md):
 *
 *     program        → identitat del projecte i del bloc
 *     ref/blockBounds→ referència de TC i límits temporals del bloc
 *     escaletaItems  → escaleta del bloc (MASTER, la desa el «Muntar»; si encara
 *                      no existeix, `getItems()` cau al mirall d'`analysis`)
 *     clips          → registre de clips (log de muntatge)
 *     markers        → marcadors de la seqüència amb el seu TC       (F2)
 *     media.clipsV1  → clips de la pista V1 (vídeo) del bloc         (F3)
 *     chyrons        → rètols importats al bin + col·locats          (F4)
 *     graphics       → grafismes col·locats (TITOLET, Tema-Títol…)   (F5)
 *     analysis       → MIRALL del JSON d'anàlisi (4 fases)           (F4)
 *     structure      → VISTA per ítem: TC, clip(s), rètols, grafismes, marks
 *
 *   Els fitxers derivats (MARCADORS_*.txt/.json, analisis_estructura/*.json)
 *   es continuen escrivint com a MIRALLS llegibles per a humans, però ja NO
 *   són la font de les dades: qui necessiti anàlisi la llegeix d'aquí.
 *
 *   · Pretty-print (indent 2): el fitxer ha de poder-se llegir i diffar.
 *   · Escriptura via `window.cep.fs.writeFile` (UTF-8 cru, sense límit de
 *     mida ni escolats). RESPATLLER ExtendScript per trossos (IO.writeTxt +
 *     IO.appendTxt) si `cep.fs` no estigués disponible.
 *   · Cua d'escriptura SÈRIE (`_writeChain`): les seccions es desen des de
 *     fluxos diferents (marcadors, rètols, anàlisi) i dues escriptures no es
 *     poden trepitjar. Una escriptura = una foto sencera del manifest.
 *   · `saveSection()` + `update()` + `flush()`: API per als fluxos que només
 *     volen tocar UNA secció o agrupar diverses escriptures (debounce).
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};

    /** Versió de l'esquema del manifest (v1.0 = només escaleta/ref/phases) */
    const VERSION = '2.0';

    const U = () => window.FASTPASS_UI.Utils;

    FASTPASS_UI.SessionManifest = {

        VERSION: VERSION,

        _cache: {},                       // path -> manifest viu en memòria (evita rellegir el NAS)
        _writeChain: Promise.resolve(),   // cua SÈRIE d'escriptures al NAS
        CHUNK: 24000,                     // mida de cada tros del respatller ExtendScript (ASCII)

        /**
         * Claus que són «secció» del manifest (per a `saveSection`).
         * Cobreix TOTES les seccions v2.0 (vegeu la capçalera): `escaletaItems`
         * (escaleta MASTER, la desa el «Muntar»; `saveSection` amb un array la
         * SUBSTITUEIX, mai la fusiona) i `clips` (log de muntatge) també són
         * seccions, igual que les fases de l'anàlisi (`markers`, `chyrons`…).
         */
        SECTION_KEYS: ['program', 'ref', 'cleanFeed', 'blockBounds', 'hierarchy', 'media',
                       'escaletaItems', 'clips', 'analysis', 'markers', 'structure',
                       'chyrons', 'graphics', 'phases'],

        /**
         * Retorna la ruta del fitxer manifest per al context actual.
         * Ubicació: mateixa carpeta que el .prproj
         */
        getPath: function(ctx) {
            // El ctx conté config.rutas.destinoBase, progData.directorio i dateDir
            // ctx.progData.wott sol ser el progId (TNV, TNC...)
            // (2026-09-24) El manifest viu a la carpeta del BLOC: <base><prog>_PROJECTES/<data>/<V*>
            const folder = window.FASTPASS_UI.Utils.workFolder(ctx);
            const filename = (ctx.progData.wott || 'PROG') + '_' + ctx.bloque + '.fastpass.json';
            return folder + '\\' + filename;
        },

        /**
         * _ctxOk: El ctx és prou complet per resoldre la ruta del manifest?
         * Els fluxos de rètols poden córrer amb un `State` a mitges: en comptes
         * de petar (`Cannot read properties of undefined`), es retorna false i
         * el flux continua sense desar.
         * @param {Object} ctx
         * @returns {boolean}
         */
        _ctxOk: function(ctx) {
            return !!(ctx && ctx.progData && ctx.progData.wott && ctx.bloque);
        },

        /**
         * getItemsSource: ORIGEN de l'escaleta del bloc (aigües amunt).
         * La vista `structure` és DERIVADA d'aquesta escaleta, per tant no compta
         * com a origen: només s'informa si és el que queda (vista sense escaleta
         * mare). Ordre: master → mirall-analisi → structure → cap.
         * @param {Object} manifest
         * @returns {string} 'master' | 'mirall-analisi' | 'structure' | 'cap'
         */
        getItemsSource: function(manifest) {
            const m = manifest || {};
            if (Array.isArray(m.escaletaItems) && m.escaletaItems.length > 0) return 'master';
            const an = m.analysis;
            if (an && an.escaleta && Array.isArray(an.escaleta.itemsBloc) && an.escaleta.itemsBloc.length > 0) {
                return 'mirall-analisi';
            }
            const st = m.structure;
            if (st && Array.isArray(st.items) && st.items.length > 0) return 'structure';
            return 'cap';
        },

        /**
         * getItems: Ítems del bloc amb la forma de l'escaleta (compatibilitat).
         * Prefereix `structure.items[].escaleta` (vista v2.0: la mateixa escaleta
         * MÉS el TC, els clips, els rètols i els grafismes de cada ítem), cau a
         * `escaletaItems` (master v1, el desa el «Muntar») i, si encara no existeix,
         * al MIRALL d'anàlisi `analysis.escaleta.itemsBloc` que desa la FASE 1
         * (`16_Analysis_Logic.saveEscaleta`). Així la VISTA `structure` es pot
         * construir durant el flux d'anàlisi, sense esperar el «Muntar».
         * @param {Object} manifest
         * @returns {Array<Object>}
         */
        getItems: function(manifest) {
            const m = manifest || {};
            const st = m.structure;
            if (st && Array.isArray(st.items) && st.items.length > 0) {
                return st.items.map(it => (it && it.escaleta) ? it.escaleta : it);
            }
            if (Array.isArray(m.escaletaItems) && m.escaletaItems.length > 0) return m.escaletaItems;
            const an = m.analysis;
            if (an && an.escaleta && Array.isArray(an.escaleta.itemsBloc)) return an.escaleta.itemsBloc;
            return [];
        },

        /**
         * getEscaletaItems: Llista de línies d'escaleta (master).
         * @param {Object} manifest
         * @returns {Array<Object>}
         */
        getEscaletaItems: function(manifest) {
            const m = manifest || {};
            if (Array.isArray(m.escaletaItems) && m.escaletaItems.length > 0) return m.escaletaItems;
            return this.getItems(m);
        },

        /**
         * getSection: Llegeix una secció del manifest (carregant-lo si cal).
         * @param {Object} ctx
         * @param {string} name - program | markers | structure | chyrons | graphics | analysis…
         * @returns {Promise<*>}
         */
        getSection: async function(ctx, name) {
            const m = await this.load(ctx);
            return m ? m[name] : undefined;
        },

        /**
         * prettify: Text del manifest tal com queda al disc (pretty-print).
         * @param {Object} manifest
         * @returns {string}
         */
        prettify: function(manifest) {
            return JSON.stringify(manifest, null, 2) + '\n';
        },

        /**
         * _readRaw: Llegeix un fitxer de text en UTF-8.
         * 1) `window.cep.fs.readFile` (preferit: UTF-8 de veritat).
         * 2) Respatller `IO.readTxt` + `Utils._fromMojibake` (ANSI → UTF-8).
         * @param {string} path
         * @returns {Promise<string>} contingut, '' o 'ERR...'
         */
        _readRaw: async function(path) {
            const utils = U();
            try {
                if (window.cep && window.cep.fs && window.cep.fs.readFile) {
                    const enc = (window.cep.encoding && window.cep.encoding.UTF8) ? window.cep.encoding.UTF8 : 'UTF-8';
                    const r = window.cep.fs.readFile(path, enc);
                    if (r && r.err === 0 && typeof r.data === 'string') {
                        // Treu el BOM si hi és: JSON.parse no el tolera.
                        return r.data.replace(/^\uFEFF/, '');
                    }
                }
            } catch (eFs) {
                utils.log(`⚠️ [SessionManifest] cep.fs.readFile: ${eFs.message} → respatller JSX`, 'WARN');
            }
            const raw = await utils.callJSX(`IO.readTxt('${utils.escape(path)}')`);
            if (raw === null || raw === undefined) return '';
            return utils._fromMojibake(String(raw), 'manifest');
        },

        /**
         * _writeRaw: Escriu el manifest sencer.
         *
         * 1) VIA NATIVA CEP (`window.cep.fs.writeFile`): UTF-8 cru, sense límits de
         *    mida ni escolats — el text NO creua cap literal ExtendScript.
         * 2) RESPATLLER ExtendScript: trossos de `CHUNK` caràcters ASCII via
         *    `IO.writeTxt` (1r) + `IO.appendTxt` (resta). El text s'escapa amb
         *    `Utils.escape`, que converteix tot el no-ASCII a \uXXXX: cap tros pot
         *    partir un caràcter pel mig.
         *
         * @param {string} path
         * @param {string} text
         * @returns {Promise<string>} 'OK' o 'ERR:...'
         */
        _writeRaw: async function(path, text) {
            const utils = U();
            try {
                if (window.cep && window.cep.fs && window.cep.fs.writeFile) {
                    const enc = (window.cep.encoding && window.cep.encoding.UTF8) ? window.cep.encoding.UTF8 : 'UTF-8';
                    const dir = path.substring(0, path.lastIndexOf('\\'));
                    try { if (dir && window.cep.fs.makedir) window.cep.fs.makedir(dir); } catch (eMk) { /* ja existeix */ }
                    const r = window.cep.fs.writeFile(path, text, enc);
                    if (r && r.err === 0) return 'OK';
                    utils.log(`⚠️ [SessionManifest] cep.fs.writeFile err=${r && r.err} → respatller JSX`, 'WARN');
                }
            } catch (eFs) {
                utils.log(`⚠️ [SessionManifest] cep.fs.writeFile: ${eFs.message} → respatller JSX`, 'WARN');
            }
            return await this._writeRawChunked(path, text);
        },

        /**
         * _writeRawChunked: Respatller ExtendScript de `_writeRaw`.
         * @param {string} path
         * @param {string} text
         * @returns {Promise<string>} 'OK' o 'ERR:...'
         */
        _writeRawChunked: async function(path, text) {
            const utils = U();
            const esc = utils.escape(text);
            const p = utils.escape(path);
            const n = Math.ceil(esc.length / this.CHUNK) || 1;
            let first = true;
            for (let i = 0, k = 1; i < esc.length; i += this.CHUNK, k++) {
                const part = esc.substring(i, i + this.CHUNK);
                const expr = first
                    ? `IO.writeTxt('${p}', '${part}')`
                    : `IO.appendTxt('${p}', '${part}')`;
                const res = await utils.callJSX(expr);
                if (typeof res === 'string' && res.indexOf('ERR') === 0) {
                    utils.log(`❌ [SessionManifest] tros ${k}/${n} fallit: ${res}`, 'ERROR');
                    return String(res);
                }
                first = false;
            }
            utils.log(`💾 [SessionManifest] manifest escrit per trossos (${n} × ${this.CHUNK} caràcters)`, 'DEBUG');
            return 'OK';
        },

        /**
         * Llegeix el manifest existent o retorna un objecte buit inicial si no existeix.
         * @param {Object} ctx
         * @param {boolean} [forceReload=false] - Ignora la cache en memòria
         */
        load: async function(ctx, forceReload) {
            const path = this.getPath(ctx);
            const utils = U();
            // Cache en memòria: la lectura del JSON al NAS triga ~20-25s i bloqueja
            // ExtendScript (causa dels cuelgues). Un cop llegit, es reutilitza.
            if (!forceReload && this._cache[path]) {
                return this._cache[path];
            }
            try {
                // (2026-10-02) IO.readTxt llegeix amb ANSI: els títols amb accents del
                // manifest tornaven malmesos i, en reescriure's, quedaven fixats.
                // (2026-10-15) v2.0: primer s'intenta `cep.fs` (UTF-8 de veritat).
                const raw = await this._readRaw(path);
                if (raw && raw !== '' && raw.indexOf('ERR') !== 0) {
                    const parsed = JSON.parse(raw);
                    const migrated = this._migrate(parsed, ctx);
                    this._cache[path] = migrated;
                    const nEsc = migrated.escaletaItems ? migrated.escaletaItems.length : 0;
                    const nMrk = (migrated.markers && migrated.markers.count) || 0;
                    const nStr = (migrated.structure && migrated.structure.count) || 0;
                    utils.log(`📂 [SessionManifest] Manifest v${migrated._version} carregat: ${nEsc} items · ` +
                        `${nMrk} marcadors · ${nStr} items d'estructura (${path.substring(Math.max(0, path.length - 60))})`, 'DEBUG');
                    return migrated;
                }
                utils.log(`⚠️ [SessionManifest] Manifest buit o no trobat: ${path}`, 'DEBUG');
            } catch (e) {
                utils.log(`⚠️ [SessionManifest] Error parsejant manifest: ${e.message} (${path})`, 'WARN');
            }
            const fresh = this._empty(ctx);
            this._cache[path] = fresh;
            return fresh;
        },

        /**
         * Desa el manifest fusionant les dades noves amb les existents (deep merge).
         * v2.0: l'escriptura passa per la CUA sèrie (`_queueWrite`) i es fa en
         * pretty-print; el fitxer es pot llegir i diffar.
         */
        save: async function(ctx, patch) {
            const existing = await this.load(ctx);
            const updated = this._deepMerge(existing, patch || {});
            updated._lastUpdated = new Date().toISOString();

            const path = this.getPath(ctx);
            // Actualitzar el cache en memòria abans de tornar (font de veritat immediata)
            this._cache[path] = updated;

            // v2.0: si el patch porta l'escaleta, recompon la VISTA `structure`
            // (TC, clips, rètols i grafismes per ítem) que llegeixen els consumidors.
            if (patch && patch.escaletaItems) this._rebuild(updated, 'escaleta');

            // Escriure al NAS en segon pla (no bloqueja l'edició ni els clics)
            this._queueWrite(ctx, updated);

            // Sincronització immediata amb l'estat global per a compatibilitat
            if (updated.ref) {
                window.FASTPASS_UI.State.ref = updated.ref;
            }
            if (updated.hierarchy) {
                window.FASTPASS_UI.State.hierarchy = updated.hierarchy;
            }

            return updated;
        },

        /**
         * _queueWrite: Encua una escriptura sencera del manifest (SÈRIE).
         * Sempre s'escriu la FOTO MÉS NOVA del manifest en memòria, de manera que
         * escriptures consecutives (marcadors → rètols → anàlisi…) mai deixen el
         * fitxer amb un estat vell ni es trepitgen entre elles.
         * @param {Object} ctx
         * @param {Object} manifest
         * @returns {Promise<string>} 'OK' o 'ERR:...'
         */
        _queueWrite: function(ctx, manifest) {
            const self = this;
            const utils = U();
            const path = this.getPath(ctx);
            this._writeChain = this._writeChain.then(async function() {
                const m = self._cache[path] || manifest;
                const text = self.prettify(m);
                const t0 = Date.now();
                const res = await self._writeRaw(path, text);
                const kb = Math.round(text.length / 1024);
                if (typeof res === 'string' && res.indexOf('ERR') === 0) {
                    utils.log(`❌ [SessionManifest] Error escrivint manifest: ${res} → ${path}`, 'ERROR');
                } else {
                    utils.log(`💾 [SessionManifest] manifest desat (${kb} KB, ${Date.now() - t0} ms) → ${path}`, 'DEBUG');
                }
                return res;
            }).catch(function(e) {
                utils.log(`❌ [SessionManifest] cua d'escriptura: ${e.message}`, 'ERROR');
                return 'ERR ' + e.message;
            });
            return this._writeChain;
        },

        /**
         * _rebuild: Recalcula la vista `structure` del manifest via `AnalysisCenter`.
         * @param {Object} manifest
         * @param {string} reason
         */
        _rebuild: function(manifest, reason) {
            try {
                const AC = window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.AnalysisCenter;
                if (AC && AC.rebuild) AC.rebuild(manifest, { reason: reason });
            } catch (e) {
                U().log(`⚠️ [SessionManifest] structure: ${e.message}`, 'WARN');
            }
        },

        /**
         * update: Carrega el manifest (de cache si ja s'ha llegit) i deixa mutar-lo
         * en memòria. NO escriu: l'escriptura la fan `flush()` o `saveSection()`.
         * @param {Object} ctx
         * @param {Function} fn - function(manifest) que pot mutar-lo
         * @returns {Promise<Object>} manifest mutat
         */
        update: async function(ctx, fn) {
            const m = await this.load(ctx);
            if (typeof fn === 'function') fn(m);
            m._lastUpdated = new Date().toISOString();
            return m;
        },

        /**
         * saveSection: Fusiona UNA secció del manifest i l'escriu.
         * @param {Object} ctx
         * @param {string} section - clau del manifest ('markers', 'chyrons', 'analysis'…)
         * @param {*} value - objecte (deep merge) o array (substitueix la secció)
         * @param {Object} [opts] - { rebuild:true, reason:'…', write:true }
         * @returns {Promise<Object>} manifest
         */
        saveSection: async function(ctx, section, value, opts) {
            const self = this;
            const o = opts || {};
            if (this.SECTION_KEYS.indexOf(section) === -1) {
                U().log(`⚠️ [SessionManifest] saveSection: secció desconeguda «${section}»`, 'WARN');
            }
            const m = await this.update(ctx, function(man) {
                if (Array.isArray(value)) {
                    man[section] = value;
                } else if (value && typeof value === 'object') {
                    man[section] = self._deepMerge(man[section] || {}, value);
                } else {
                    man[section] = value;
                }
            });
            if (o.rebuild !== false) this._rebuild(m, o.reason || section);
            if (o.write !== false) await this.flush(ctx);
            return m;
        },

        /**
         * flush: Escriu ARA el manifest en memòria (esperant la cua anterior).
         * @param {Object} ctx
         * @returns {Promise<string>} 'OK', 'ERR:…' o 'NORES' si no hi ha res carregat
         */
        flush: async function(ctx) {
            const path = this.getPath(ctx);
            const m = this._cache[path];
            if (!m) {
                U().log(`⚠️ [SessionManifest] flush sense manifest en memòria: ${path}`, 'WARN');
                return 'NORES';
            }
            return await this._queueWrite(ctx, m);
        },

        /** Objecte inicial buit amb l'estructura base (v2.0) */
        _empty: function(ctx) {
            const now = new Date().toISOString();
            const progData = (ctx && ctx.progData) || {};
            let folder = '';
            try { folder = (ctx && ctx.progData) ? window.FASTPASS_UI.Utils.workFolder(ctx) : ''; } catch (eWd) { folder = ''; }
            return {
                _version:    VERSION,
                _generated:  now,
                _lastUpdated: now,
                program: {
                    progId:        progData.wott || '',
                    blockId:       (ctx && ctx.bloque) || '',
                    projectFile:   '', // s'omple al crear projecte
                    projectFolder: folder,
                    escaletaFile:  ''  // s'omple al carregar JSON
                },
                cleanFeed: {},
                blockBounds: {},
                ref: {
                    worldSecMediaStart: null,
                    mp4ExpandedInPoint: null,
                    tlBlockInPointSec:  null,
                    tlClipStartSec:     null,
                    offsetSec:          null,
                    blockInSec:         null,
                    // (2026-10-15) v2.0 · referència del bloc dins el «món» del MP4
                    worldBlockStartSec: null,
                    worldBlockEndSec:   null,
                    InTier:             null,
                    fps:                null
                },
                hierarchy: {}, // Fase 4: Mapa de lineID -> data
                clips: [],
                escaletaItems: [],
                footprintVerification: null,
                // ── v2.0 · seccions d'anàlisi centralitzades ───────────────────
                // (vegeu docs/specs/FASTPASS_JSON_SPEC.md)
                media:    { updatedAt: null, clipCount: 0, clipsV1: [] },
                markers:  { updatedAt: null, count: 0, source: '', list: [] },
                chyrons:  { updatedAt: null, bin: '', countImported: 0, countPlaced: 0, imported: [], placed: [] },
                graphics: { updatedAt: null, count: 0, list: [] },
                analysis: { updatedAt: null, file: '', meta: {}, escaleta: null, crudo: null, cocinado: null, usuario: null },
                structure: { updatedAt: null, reason: '', count: 0, source: {}, items: [] },
                phases: {
                    boundsCalculated:   false,
                    mp4Imported:        false,
                    tcRefEstablished:   false,
                    trossejaDone:       false,
                    clipsLogged:        false,
                    footprintVerified:  false,
                    clipAnalysisDone:   false,
                    markersPlaced:      false,
                    chyronsPlaced:      false,
                    graphicsPlaced:     false,
                    hierarchyResolved:  false
                }
            };
        },

        /**
         * _migrate: Porta un manifest antic (v1.0) a l'esquema actual.
         * Afegeix les seccions que faltin amb el seu esquelet buit sense tocar-ne
         * el contingut existent: mai es descarta informació del fitxer.
         * @param {Object} obj - manifest ja parsejat
         * @param {Object} ctx
         * @returns {Object} manifest migrat
         */
        _migrate: function(obj, ctx) {
            if (!obj || typeof obj !== 'object') return this._empty(ctx);
            const utils = U();
            const empty = this._empty(ctx);
            const from = obj._version || '1.0';
            const added = [];
            for (const k of Object.keys(empty)) {
                if (obj[k] === undefined || obj[k] === null) {
                    obj[k] = empty[k];
                    added.push(k);
                } else if (empty[k] && typeof empty[k] === 'object' && !Array.isArray(empty[k]) &&
                           typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
                    for (const kk of Object.keys(empty[k])) {
                        if (obj[k][kk] === undefined || obj[k][kk] === null) {
                            obj[k][kk] = empty[k][kk];
                            added.push(k + '.' + kk);
                        }
                    }
                }
            }
            if (from !== VERSION) {
                obj._version = VERSION;
                utils.log(`🧬 [SessionManifest] esquema migrat ${from} → ${VERSION}` +
                    (added.length ? ` (seccions noves: ${added.join(', ')})` : ''), 'DEBUG');
            }
            return obj;
        },

        /** Merge profund recursiu (les llistes es substitueixen) */
        _deepMerge: function(base, patch) {
            const result = Object.assign({}, base);
            for (const key of Object.keys(patch)) {
                if (Array.isArray(patch[key])) {
                    result[key] = patch[key];
                } else if (patch[key] && typeof patch[key] === 'object') {
                    result[key] = this._deepMerge(base[key] || {}, patch[key]);
                } else {
                    result[key] = patch[key];
                }
            }
            return result;
        }
    };

    window.FASTPASS_UI = FASTPASS_UI;
})();
