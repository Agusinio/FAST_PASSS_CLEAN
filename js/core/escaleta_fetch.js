/**
 * ============================================================================
 * FASTPASS_UI.EscaletaReader: Sub-mòdul FETCH
 * ============================================================================
 * Genera una "foto" actualizada de la escaleta via API de digition.
 * No modifica nada en produccio (genera=false, force=false).
 *
 * Depen de: escaleta_io.js (load, findInFolder)
 *           Utils.callJSX
 *
 * Metodes:
 *   - fetchNewEscaleta(escaletaId, dateDir, programArchivo, blockId, folderPath)
 *   - _estimateEscaletaIdFromLocal(programArchivo, dateDir, projectRoot)
 *   - _invalidateSeries()
 *
 * (2026-10-23) La serie d'escaletaIds es dedueix de l'HISTORIAL LOCAL de
 * projectes (…/<PROG>_PROJECTES/YYYY_MM_DD\V*\escaleta_*.json). Ja no es
 * consulta la carpeta central d'escaletes del NAS.
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    var ER = FASTPASS_UI.EscaletaReader || {};

    var log = function (m) {
        (window.FASTPASS_UI.Utils && window.FASTPASS_UI.Utils.log)
            ? window.FASTPASS_UI.Utils.log(m, 'DEBUG')
            : (window.console && window.console.log(m));
    };

    // ----------------------------------------------------------------
    // CONFIGURACIO DE L'API
    // ----------------------------------------------------------------
    var API_BASE = "https://digition.3cat.cat/digition-api/v2/escaletes/";
    var API_AUTH = "Authorization:eyJhbGciOiJIUzUxMiJ9.eyJkaWciOiJQUk9EVUNDSU8iLCJzdWIiOiJhZ2VudF9vcmNoZXN0ciIsInVpZCI6MTAyMTQsImdpZCI6MTAwMSwiaWF0IjoxNzA2MjYzNTI5LCJleHAiOjQ4NTk4NjM1Mjl9.vIrnCXrQf3CiVAsMeMMcDIkiivKLJ9fz6g2YvsHHvYNlcuR58hZNskYH0xJxQCH0sChzSluaPo3W42vYH0LB_w";

    // Mapa d'escaletaId per programa (fallback si Config no te escaletaId)
    var DEFAULT_ESCALETA_IDS = {
        TN_COMARQUES: "PRO1439",
        TN_MIGDIA:    "PRO1440",
        TN_VESPRE:    "PRO1442",
        // MATINS: digition crea un rundown per dia feiner (DILLUNS..DIVENDRES),
        // aixi que l'ID puja ~1 per dia. Aquest es el darrer conegut (jueves
        // 2026-09-17); si l'API diu "no existeix" es proven els veins (+1/-1/+2)
        // i tambe l'estimat a partir dels 2-3 dies anteriors.
        MATINS:       "PRO1378"
    };

    /**
     * _buildCurlUrl: Construeix la URL del curl.
     * @param {string} escaletaId - Ex: "PRO1440"
     * @param {string} data - data en format YYYY-MM-DD
     * @param {string} hora - hora en format HH:MM:SS
     * @returns {string} URL completa
     */
    ER._buildFetchUrl = function (escaletaId, data, hora) {
        // ⚠️ BUGFIX (2026-09-16): NO s'escapa ':' com a '%3A'. L'URL s'executa dins d'un
        // .bat / cmd.exe, que EXPANDEIX els '%' ('%3A' → 'A' → l'API responia
        // "Format d'hora incorrecte"). Els ':' són vàlids en una query string (RFC 3986).
        return API_BASE + escaletaId + '/_clips?data=' + data +
            '&hora=' + hora +
            '&genera=false&force=false' +
            '&ajustaHoresSegonsEmissionsPlayout=true' +
            '&mostraEscaleta=true';
    };

    // ----------------------------------------------------------------
    // TRANSPORT DE LA PETICIO (2026-10-02)
    // ----------------------------------------------------------------
    // PER QUE: la resposta viatja pel pont ExtendScript (FASTPASS.IO.curl), que
    // llegeix la sortida de curl com a ANSI (CP1252). Com que l'API retorna
    // UTF-8, cada accent esdevenia DOS caracters ("O" accentuada -> "A"+cometes,
    // "C" trencada -> "A"+doble daguer) i, en desar-ho, el JSON quedava
    // DOBLEMENT codificat (TNC V1 02/10/2026: "titol":"CRONICA VICTOR..." ->
    // tema "CRANICA VACTOR" al nom del projecte).
    // SOLUCIO: la resposta es REPARA amb `Utils._fromMojibake` abans de tornar-la.
    // (2026-10-29) Fora la via Node+curl (`_curlExe`/`_execFileBuffer`): el
    // manifest no declara `--enable-nodejs`, aixi que la branca no s'executava mai
    // i la reparacio del mojibake es l'UNICA via real.

    /**
     * _fetchRaw: demana l'escaleta a l'API per curl d'ExtendScript i repara el
     * mojibake CP1252 → UTF-8.
     * @param {string} url
     * @param {string} [tag] - escaletaId per al log
     * @returns {Promise<string|null>} text del JSON o null si no hi ha resposta
     */
    ER._fetchRaw = async function (url, tag) {
        var U = window.FASTPASS_UI.Utils;
        var rawJsx = null;
        try {
            rawJsx = await U.callJSX(
                "FASTPASS.IO.curl('" + String(url).replace(/'/g, "\\'") + "', '" + API_AUTH.replace(/'/g, "\\'") + "')",
                { rawError: true }
            );
        } catch (eC) { rawJsx = null; }
        var txt = String(rawJsx == null ? '' : rawJsx);
        if (!txt || txt.indexOf('ERR') === 0) {
            log('❌ [ER:Fetch] curl d\'ExtendScript sense resposta: ' + (txt || 'buit'), 'ERROR');
            return null;
        }
        return U._fromMojibake(txt, 'API' + (tag ? ' ' + tag : ''));
    };

    /**
     * _writeEscaleta: desa el JSON de l'escaleta SEMPRE des del costat JS
     * (window.cep.fs.writeFile, UTF-8: mateix modul que EscaletaReader.load fa
     * servir per llegir-lo). Passar el text pel pont JSX era el que el malmetia.
     * @param {string} folderPath
     * @param {string} filename
     * @param {string} raw - JSON ja en UTF-8 correcte
     * @returns {string|null} ruta (separadors '/') o null si no s'ha pogut escriure
     */
    ER._writeEscaleta = function (folderPath, filename, raw) {
        if (!folderPath) {
            log('❌ [ER:Fetch] Carpeta destí desconeguda: no es pot desar ' + filename, 'ERROR');
            return null;
        }
        // ── BUGFIX (2026-10-05) ──────────────────────────────────────────────
        // cep.fs.writeFile torna err=3 (ERR_NOT_FOUND) si la carpeta pare no
        // existeix. La FOTO es pot prémer ABANS de cap execució NOU (carpeta del
        // bloc encara per crear) → la foto es perdia amb "No s'ha pogut desar"
        // malgrat que l'API hagués donat l'escaleta (i sense Node no hi ha pla B).
        // Regla UNC Path Safety: assegurar l'arbre des de JS abans d'escriure.
        try { window.FASTPASS_UI.Utils.ensureFolders(folderPath); }
        catch (eMk) { log('⚠️ [ER:Fetch] ensureFolders ha fallat: ' + eMk.message); }
        var path = String(folderPath).replace(/[\/\\]+$/, '') + '/' + filename;
        try {
            var w = window.cep.fs.writeFile(path, raw);
            if (w && w.err === 0) return path;
            log('⚠️ [ER:Fetch] cep.fs.writeFile err=' + (w && w.err));
        } catch (e1) { log('⚠️ [ER:Fetch] cep.fs.writeFile ha fallat: ' + e1.message); }
        log('❌ [ER:Fetch] No s\'ha pogut desar ' + filename + ' al projecte', 'ERROR');
        return null;
    };

    /**
     * fetchNewEscaleta: Fa una crida a l'API de digition per obtenir
     * la foto mes recent de l'escaleta i la guarda al directori del projecte.
     *
     * @param {string} escaletaId - Ex: "PRO1440"
     * @param {string} dateDir - Ex: "2026_07_30"
     * @param {string} programArchivo - Ex: "TN_MIGDIA"
     * @param {string} blockId - Ex: "V1"
     * @param {string} folderPath - Ruta on guardar el JSON
     * @returns {Promise<{path: string, filename: string}|null>}
     */
    // ── SERIE D'ESCALETA IDS (2026-09-17) ──────────────────────────────
    // Els rundowns de digition no son fixos: MATINS en crea un per dia feiner
    // (DILLUNS..DIVENDRES), aixi que l'ID puja ~1 per dia i els festius el
    // desplacen. El 17/09/2026 el motor demanava PRO1278 (inexistent) -> el
    // motor publicava {"missatge":"L'escaleta no existeix"}. Solucio: estimar
    // l'ID amb els 2-3 dies anteriors i, si falla, provar veins (+1/-1/+2...).

    /**
     * _escaletaIdParts: Separa prefix i numero d'un escaletaId ("PRO1378").
     */
    ER._escaletaIdParts = function (id) {
        var m = String(id || '').match(/^([A-Za-z]*)(\d+)$/);
        if (!m) return null;
        return { prefix: m[1], num: parseInt(m[2], 10) };
    };

    /**
     * _escaletaIdCandidates: Candidats al voltant d'un ID base (+1/-1/+2/-2...).
     * @param {string} baseId
     * @param {number} [maxPad=3] número de salts per banda
     * @returns {Array<string>}
     */
    ER._escaletaIdCandidates = function (baseId, maxPad) {
        var p = this._escaletaIdParts(baseId);
        if (!p) return [];
        var pad = (maxPad != null) ? maxPad : 3;
        var out = [];
        for (var d = 1; d <= pad; d++) {
            out.push(p.prefix + (p.num + d));
            out.push(p.prefix + (p.num - d));
        }
        return out;
    };

    /**
     * _ymdToDate: "20260917" -> Date local.
     */
    ER._ymdToDate = function (ymd) {
        var s = String(ymd || '');
        if (!/^\d{8}$/.test(s)) return null;
        return new Date(parseInt(s.substring(0, 4), 10), parseInt(s.substring(4, 6), 10) - 1, parseInt(s.substring(6, 8), 10));
    };

    /**
     * _weekdaysBetween: Dies FEINERS entre dues dates YYYYMMDD (cap de setmana fora).
     */
    ER._weekdaysBetween = function (fromYmd, toYmd) {
        var f = this._ymdToDate(fromYmd), t = this._ymdToDate(toYmd);
        if (!f || !t || t <= f) return 0;
        var n = 0, d = new Date(f.getTime());
        while (d < t) {
            d.setDate(d.getDate() + 1);
            var dow = d.getDay();
            if (dow !== 0 && dow !== 6) n++;
        }
        return n;
    };

    /** SERIES_TTL_MS: memòria curta de la sèrie estimada (10 min). */
    ER.SERIES_TTL_MS = 600000;
    ER._seriesCache = {};   // { '<PROGRAMA>|<YYYYMMDD>': { at, res } }

    /** _invalidateSeries: buida la memòria de sèries (força recalcular). */
    ER._invalidateSeries = function () {
        this._seriesCache = {};
    };

    /**
     * _listNames: noms d'una carpeta (cep.fs.readdir → Utils.readFolder).
     * @param {string} dir
     * @returns {Promise<string[]|null>} null si no s'ha pogut llegir
     */
    ER._listNames = async function (dir) {
        if (!dir) return null;
        try {
            if (window.cep && window.cep.fs && typeof window.cep.fs.readdir === 'function') {
                var cepDir = String(dir).split(String.fromCharCode(47)).join(String.fromCharCode(92));
                var r = window.cep.fs.readdir(cepDir);
                if (r && r.err === 0 && r.data) return r.data.slice();
            }
        } catch (eC) { }
        try {
            var U = window.FASTPASS_UI && window.FASTPASS_UI.Utils;
            if (U && typeof U.readFolder === 'function') {
                var arr = await U.readFolder(dir);
                if (arr) return arr.map(function (f) { return (typeof f === 'string') ? f : String((f && f.name) || ''); });
            }
        } catch (eU) { }
        return null;
    };

    /**
     * _stripSep: Lleva els separadors finals d'una ruta (sense expressions regulars).
     * @param {string} p
     * @returns {string}
     */
    ER._stripSep = function (p) {
        var s = String(p || '');
        var bs = String.fromCharCode(92);
        while (s.length > 1) {
            var ch = s.charAt(s.length - 1);
            if (ch !== bs && ch !== '/') break;
            s = s.substring(0, s.length - 1);
        }
        return s;
    };

    /**
     * _estimateEscaletaIdFromLocal: Estima l'escaletaId d'AVUI a partir de les
     * escaletes desades als projectes dels dies anteriors (HISTORIAL LOCAL).
     *
     * (2026-10-23) Abans es llistava la carpeta central d'escaletes del NAS.
     * Amb el model local-first eixa carpeta no existeix: la sèrie es dedueix
     * del MATEIX arbre de projectes.
     *   1) directoris `YYYY_MM_DD` de `projectRoot` (desc, sense avui, màx. 5)
     *   2) a cada dia, blocs `V*` → `escaleta_*.json` (FOTO primer, després NAS)
     *   3) se'n llig `escaleta.id` fins a 3 mostres vàlides
     * L'estimació és el PRIMER candidat: després es proven els veïns (+1/−1…).
     *
     * @param {string} programArchivo - Ex: "TN_MATI"
     * @param {string} dateDir - Ex: "2026_10_23" (dia de treball)
     * @param {string} projectRoot - Carpeta que conté els directoris YYYY_MM_DD
     *        (…/<PROG>_PROJECTES)
     * @returns {Promise<{estimate:string, step:number, seen:Array}|null>}
     */
    ER._estimateEscaletaIdFromLocal = async function (programArchivo, dateDir, projectRoot) {
        var datePrefix = String(dateDir || '').replace(/[^0-9]/g, '');   // YYYYMMDD (accepta 2026_10_23 i 2026-10-23)
        var key = String(programArchivo || '').toUpperCase() + '|' + datePrefix;
        this._seriesCache = this._seriesCache || {};
        var hit = this._seriesCache[key];
        if (hit && (Date.now() - hit.at) < this.SERIES_TTL_MS) return hit.res;
        var res = null;
        try {
            res = await this._estimateSeriesNow(programArchivo, datePrefix, projectRoot);
        } catch (e) {
            log('⚠️ [ER:Fetch] Estimacio de serie (local) fallida: ' + e.message);
            res = null;
        }
        this._seriesCache[key] = { at: Date.now(), res: res };
        return res;
    };

    /**
     * _estimateSeriesNow: feina bruta de l'estimació (sense memòria curta).
     * @param {string} programArchivo
     * @param {string} datePrefix - YYYYMMDD del dia de treball
     * @param {string} projectRoot
     * @returns {Promise<{estimate:string, step:number, seen:Array}|null>}
     */
    ER._estimateSeriesNow = async function (programArchivo, datePrefix, projectRoot) {
        if (!projectRoot || !this.load || typeof this._listNames !== 'function') return null;
        var top = await this._listNames(projectRoot);
        if (!top || !top.length) return null;
        var days = top.filter(function (n) { return /^\d{4}_\d{2}_\d{2}$/.test(String(n)); });
        if (!days.length) return null;
        days.sort();
        days.reverse();
        var seen = [];
        var scanned = 0;
        for (var i = 0; i < days.length && scanned < 5 && seen.length < 3; i++) {
            var day = String(days[i]);
            if (datePrefix && day.replace(/_/g, '') === datePrefix) continue;   // avui no compta
            scanned++;
            var dayPath = this._stripSep(projectRoot) + String.fromCharCode(92) + day;
            var subs = await this._listNames(dayPath);
            if (!subs || !subs.length) continue;
            var blocks = subs.filter(function (n) { return /^V\d+$/i.test(String(n)); }).sort();
            for (var bi = 0; bi < blocks.length && seen.length < 3; bi++) {
                var blkPath = dayPath + String.fromCharCode(92) + blocks[bi];
                var files = await this._listNames(blkPath);
                if (!files || !files.length) continue;
                var jsons = files.filter(function (n) {
                    var s = String(n).toLowerCase();
                    return s.indexOf('.json') === s.length - 5 && s.indexOf('escaleta') !== -1;
                });
                if (!jsons.length) continue;
                // FOTO (escaleta_on_demand_*) primer; dins de cada grup, la mes nova.
                jsons.sort(function (a, b) {
                    var fa = String(a).indexOf('escaleta_on_demand') === 0 ? 0 : 1;
                    var fb = String(b).indexOf('escaleta_on_demand') === 0 ? 0 : 1;
                    if (fa !== fb) return fa - fb;
                    return String(a) < String(b) ? 1 : (String(a) > String(b) ? -1 : 0);
                });
                var data = null;
                for (var j = 0; j < jsons.length && !data; j++) {
                    var cand = blkPath + String.fromCharCode(92) + jsons[j];
                    try { data = await this.load(cand); } catch (eL) { data = null; }
                    if (!data || !data.escaleta || !data.escaleta.id) data = null;
                }
                if (!data) continue;
                var pr = this._escaletaIdParts(data.escaleta.id);
                if (!pr) continue;
                seen.push({ date: day.replace(/_/g, ''), id: data.escaleta.id, num: pr.num, prefix: pr.prefix, block: blocks[bi] });
            }
        }
        if (seen.length === 0) return null;
        seen.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
        var newest = seen[0], oldest = seen[seen.length - 1];
        var daysBetween = this._weekdaysBetween(oldest.date, newest.date);
        var realStep = (daysBetween > 0 && seen.length > 1) ? ((newest.num - oldest.num) / daysBetween) : 1;
        var dToday = this._weekdaysBetween(newest.date, datePrefix);
        if (!(dToday > 0)) dToday = 1;
        var estStr = newest.prefix + (newest.num + dToday);
        log('🎯 [ER:Fetch] Serie ' + programArchivo + ': ' +
            seen.map(function (s) { return s.date.substring(4) + '=' + s.id; }).join(' · ') +
            ' | dies feiners des del darrer=' + dToday + ' | pas real≈' + realStep.toFixed(2) +
            ' → estimat avui: ' + estStr);
        return { estimate: estStr, step: realStep, seen: seen };
    };

    /**
     * _resolveEscaletaId: Troba l'escaletaId correcte per avui PROVANT-LO contra
     * l'API (1 crida per candidat). Ordre: estimat per serie → base de config →
     * veins (+1/-1/+2/-2/+3/-3). Es para al primer candidat que retorna una
     * escaleta valida i en desa el JSON per no haver de repetir la crida.
     * @returns {Promise<{id:string, raw:string}|null>}
     */
    ER._resolveEscaletaId = async function (programArchivo, baseId, dataStr, horaStr, projectRoot) {
        var est = null;
        try { est = await this._estimateEscaletaIdFromLocal(programArchivo, dataStr, projectRoot); } catch (e0) { est = null; }
        var list = [];
        var add = function (id) { if (id && list.indexOf(id) === -1) list.push(id); };
        add(baseId);
        if (est && est.estimate) add(est.estimate);
        var cands = this._escaletaIdCandidates(baseId, 3);
        for (var i = 0; i < cands.length; i++) add(cands[i]);
        var maxTry = Math.min(list.length, 3);   // (2026-09-17) 3 en comptes de 5: cada crida pot tardar ~30 s
        log('🔎 [ER:Fetch] Resolent escaletaId (' + programArchivo + ') · candidats: ' + list.slice(0, maxTry).join(', '));
        for (var c = 0; c < maxTry; c++) {
            var id = list[c];
            var url = this._buildFetchUrl(id, dataStr, horaStr);
            var raw = null;
            // (2026-10-02) Node/curl (bytes → UTF-8) amb respatller ExtendScript reparat
            try { raw = await this._fetchRaw(url, id); } catch (eC) { raw = null; }
            var js = null, ok = false;
            try {
                js = JSON.parse(String(raw || '').trim());
                ok = !!(js && !js.missatge && js.escaleta && js.cleanFeed);
            } catch (eP) { ok = false; }
            if (ok) {
                log('✅ [ER:Fetch] escaletaId resolt: ' + id + (c > 0 ? ' (candidat ' + (c + 1) + '/' + maxTry + ')' : ' (base)'));
                return { id: id, raw: String(raw) };
            }
            log('   ⏭️ [ER:Fetch] ' + id + ' → ' + ((js && js.missatge) ? js.missatge : 'resposta no valida'));
        }
        log('❌ [ER:Fetch] Cap escaletaId valid (' + maxTry + ' provats) per a ' + programArchivo);
        return null;
    };

    ER.fetchNewEscaleta = async function (escaletaId, dateDir, programArchivo, blockId, folderPath) {
        if (!escaletaId) {
            escaletaId = DEFAULT_ESCALETA_IDS[programArchivo] || null;
        }
        // Fallback per nom de programa si escaletaId no arriba des de config
        if (!escaletaId) {
            if (programArchivo.indexOf('TN_COMARQUES') !== -1) escaletaId = 'PRO1439';
            else if (programArchivo.indexOf('TN_MIGDIA') !== -1) escaletaId = 'PRO1440';
            else if (programArchivo.indexOf('TN_VESPRE') !== -1) escaletaId = 'PRO1442';
        }
        if (!escaletaId) {
            log('\u26A0\uFE0F [ER:Fetch] No es pot determinar escaletaId per a ' + programArchivo, 'ERROR');
            return null;
        }

        var dataStr = dateDir.replace(/_/g, '-'); // "2026_07_30" -> "2026-07-30"

        // Hora: (1) mediaStart del cleanFeed del JSON més recent del dia,
        // (2) hora d'inici del programa, (3) hora actual. MAI una hora fixa.
        var horaStr = null;
        try {
            var reader = window.FASTPASS_UI.EscaletaReader;
            if (reader && reader.findInFolder && reader.load) {
                // (2026-10-23 · LOCAL-FIRST) L'hora surt de l'escaleta del MATEIX
                // directori del projecte (còpia prèvia o FOTO): el NAS ja no es mira.
                var meta = await reader.findInFolder(folderPath, programArchivo);
                if (meta) {
                    var jsonData = await reader.load(meta.path);
                    if (jsonData && jsonData.cleanFeed && jsonData.cleanFeed.mediaStart) {
                        // mediaStart te format HH:MM:SS:FF -> extreure HH:MM:SS
                        var parts = jsonData.cleanFeed.mediaStart.split(':');
                        if (parts.length >= 3) {
                            horaStr = parts[0] + ':' + parts[1] + ':' + parts[2];
                        }
                    }
                }
            }
        } catch (e) {
            log('\u26A0\uFE0F [ER:Fetch] Error determinant hora: ' + e.message);
        }

        // ── Hora de la petició (2026-09-16) ─────────────────────────────────────
        // Si no hi ha JSON local del dia, s'usa l'hora d'inici del PROGRAMA
        // (Config.programStartHours: TNC 13:50, TNM 14:30, TNV 21:00, MAT 08:00) i, si no es pot
        // resoldre, l'hora actual. Abans s'enviava "14:00:00" fix, que només servia
        // per a TN COMARQUES i feia fallar la FOTO per a la resta de programes.
        if (!horaStr) {
            var cfgH = null;
            try { cfgH = window.FASTPASS_UI.Config && window.FASTPASS_UI.Config.get(); } catch (eCfgH) { cfgH = null; }
            var wottH = null;
            try {
                if (cfgH && cfgH.mapeoProgramas) {
                    for (var kH in cfgH.mapeoProgramas) {
                        if (cfgH.mapeoProgramas[kH].archivo === programArchivo) { wottH = cfgH.mapeoProgramas[kH].wott; break; }
                    }
                }
            } catch (eWott) { wottH = null; }
            var startH = (cfgH && cfgH.programStartHours && wottH && cfgH.programStartHours[wottH] != null)
                ? Number(cfgH.programStartHours[wottH]) : null;
            // ⚠️ BUGFIX (2026-09-17): `isFinite(null)` es TRUE a JavaScript (null -> 0),
            // aixi que si el programa no te hora d'inici (MAT no era a la llista) es
            // demanava l'escaleta amb hora "00:00:00" i l'API responia buit. Cal
            // comprovar `startH != null` ABANS d'isFinite.
            if (startH != null && isFinite(startH)) {
                var hhH = Math.floor(startH);
                var mmH = Math.round((startH - hhH) * 60);
                horaStr = (hhH < 10 ? '0' : '') + hhH + ':' + (mmH < 10 ? '0' : '') + mmH + ':00';
                log('\u23F0 [ER:Fetch] Hora de la petició: ' + horaStr + ' (inici de programa ' + wottH + ')');
            } else {
                var nowH = new Date();
                horaStr = (nowH.getHours() < 10 ? '0' : '') + nowH.getHours() + ':' +
                    (nowH.getMinutes() < 10 ? '0' : '') + nowH.getMinutes() + ':00';
                log('\u23F0 [ER:Fetch] Hora de la petició: ' + horaStr + ' (hora actual)');
            }
        }

        // ── RESOLUCIO DE L'ESCALETA ID (2026-09-17) ──────────────────────────
        // Els rundowns de digition canvien (MATINS: un per dia feiner). Si el
        // JSON del dia diu "L'escaleta no existeix", es proven candidats de la
        // serie (+1/-1/+2...) fins trobar el bo, i es guarda la SEVA escaleta.
        // projectRoot = carpeta que conte els directoris YYYY_MM_DD (â€¦/<PROG>_PROJECTES):
        // folderPath es .../<PROG>_PROJECTES/YYYY_MM_DD/V*, aixi que es pugen dos nivells.
        var _sep = String.fromCharCode(92);
        var projectRoot = String(folderPath || '');
        while (projectRoot.length > 1 && (projectRoot.charAt(projectRoot.length - 1) === _sep || projectRoot.charAt(projectRoot.length - 1) === '/')) {
            projectRoot = projectRoot.substring(0, projectRoot.length - 1);
        }
        for (var _lv = 0; _lv < 2; _lv++) {
            var _cut = Math.max(projectRoot.lastIndexOf(_sep), projectRoot.lastIndexOf('/'));
            if (_cut > 0) projectRoot = projectRoot.substring(0, _cut);
        }
        var probe = null;
        try { probe = await this._resolveEscaletaId(programArchivo, escaletaId, dataStr, horaStr, projectRoot); } catch (ePr) { probe = null; }
        if (probe && probe.raw) {
            try {
                var tsP = Date.now();
                var fnP = 'escaleta_on_demand_' + tsP + '.json';
                // (2026-10-02) Escriptura des de JS (UTF-8), mai pel pont JSX
                var savedP = this._writeEscaleta(folderPath, fnP, probe.raw);
                if (savedP) {
                    log('✅ [ER:Fetch] FOTO guardada amb escaletaId ' + probe.id + ': ' + savedP);
                    return { path: savedP, filename: fnP };
                }
                log('⚠️ [ER:Fetch] No s\'ha pogut guardar la foto resolta (' + probe.id + ')');
            } catch (eWP) {
                log('⚠️ [ER:Fetch] No s\'ha pogut guardar la foto resolta: ' + eWP.message);
            }
        }
        if (probe && probe.id) escaletaId = probe.id;

        var url = this._buildFetchUrl(escaletaId, dataStr, horaStr);

        // ── REINTENTS + MOTIU REAL DE L'API (2026-09-16) ────────────────────
        // L'API de digition triga uns minuts a "localitzar" el cleanFeed del dia:
        // mentre no el té, retorna {"missatge":"Error","debugInfo":"No s'ha
        // localitzat cap clean feed..."}. Abans es feia UN sol intent i, si la API
        // encara no tenia el cleanFeed, la foto fallava en silenci amb un genèric
        // "Resposta buida o no valida": no se sabia per què ni es reintentava.
        // Ara: fins a API_RETRIES intents separats API_RETRY_MS i el missatge REAL
        // de l'API al log i a la UI.
        // Un sol intent: cada intent pot bloquejar el motor JSX fins a ~24 s (el motor
        // és mono-fil) i encadenar-ne dos deixava el panell penjat més d'un minut.
        // Si falla, el motiu queda al log i l'usuari pot tornar a prémer FOTO.
        var API_RETRIES = 1;
        var API_RETRY_MS = 6000;
        var lastReason = 'sense resposta de l\'API';

        for (var att = 1; att <= API_RETRIES; att++) {
            var timestamp = Date.now();
            log('\uD83D\uDCE1 [ER:Fetch] Cridant API (intent ' + att + '/' + API_RETRIES + '): ' + url);

            var rawResult = null;
            // (2026-10-02) Via Node/curl: bytes → UTF-8 exacte (respatller ExtendScript reparat)
            try {
                rawResult = await this._fetchRaw(url);
            } catch (eCurl) {
                rawResult = null;
                lastReason = 'curl: ' + eCurl.message;
            }

            if (!rawResult || rawResult === '' || String(rawResult).indexOf('ERR') === 0) {
                if (!lastReason || lastReason.indexOf('curl:') !== 0) {
                    lastReason = String(rawResult || 'sense resposta de curl');
                }
                log('\u274C [ER:Fetch] Error a la crida API: ' + lastReason, 'ERROR');
            } else {
                // ── Validació de resposta (2026-09-07) ─────────────────────────
                // Si l'API no té emissió per a la data/hora demanada retorna [] o un
                // JSON d'error { missatge }. En aquests casos NO es guarda cap
                // escaleta_on_demand buida que pugui contaminar el directori.
                var trimmedRaw = String(rawResult || '').trim();
                var parsedRaw = null;
                var respuestaValida = false;
                if (trimmedRaw && trimmedRaw !== '[]' && trimmedRaw !== '{}') {
                    try {
                        parsedRaw = JSON.parse(trimmedRaw);
                        respuestaValida = !!(parsedRaw && typeof parsedRaw === 'object' && !Array.isArray(parsedRaw)
                            && !parsedRaw.missatge && parsedRaw.escaleta && parsedRaw.cleanFeed);
                    } catch (ePars) { respuestaValida = false; }
                }

                if (respuestaValida) {
                    // Guardar el resultat JSON al directori del projecte
                    var filename = 'escaleta_on_demand_' + timestamp + '.json';
                    // (2026-10-02) Escriptura des de JS (UTF-8), mai pel pont JSX
                    var savedPath = this._writeEscaleta(folderPath, filename, rawResult);
                    if (savedPath) {
                        log('\u2705 [ER:Fetch] JSON guardat: ' + savedPath);
                        return { path: savedPath, filename: filename };
                    }
                    lastReason = 'no s\'ha pogut desar el JSON al directori del projecte';
                }

                // Motiu REAL de l'API (abans aquesta informació es perdia)
                if (parsedRaw) {
                    lastReason = 'API: ' + (parsedRaw.missatge || 'resposta sense escaleta/cleanFeed') +
                        (parsedRaw.debugInfo ? ' — ' + String(parsedRaw.debugInfo).substring(0, 140) : '');
                } else {
                    lastReason = 'resposta no JSON: ' + trimmedRaw.substring(0, 140);
                }
                log('\u274C [ER:Fetch] Resposta no valida (' + dataStr + ' ' + horaStr + ') intent ' + att + ': ' + lastReason, 'ERROR');
            }

            if (att < API_RETRIES) {
                log('\u23F3 [ER:Fetch] Reintentant en ' + (API_RETRY_MS / 1000) + 's (l\'API tarda uns minuts a localitzar el cleanFeed)...');
                await new Promise(function (r) { setTimeout(r, API_RETRY_MS); });
            }
        }

        // Tots els intents fallits: motiu per a la UI (el log té el detall complet)
        try {
            window.FASTPASS_UI.Utils.status('FOTO: l\'API no té dades del dia (mira el log)', 'error');
        } catch (eSt) { }
        log('\u274C [ER:Fetch] FOTO fallida després de ' + API_RETRIES + ' intents. Motiu: ' + lastReason, 'ERROR');
        return null;
    };

    // ----------------------------------------------------------------
    // Registre al namespace
    // ----------------------------------------------------------------
    FASTPASS_UI.EscaletaReader = ER;
    window.FASTPASS_UI = FASTPASS_UI;

    log('[ER:Fetch] Sub-modul inicialitzat (fetchNewEscaleta)');
})();