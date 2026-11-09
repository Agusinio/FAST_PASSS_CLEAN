/** 
 * =================================================================================
 * Utils.js - VERSIÓ ULTRA-ATÒMICA (Pla LIPO)
 * =================================================================================
 */
(function() {
    var csInterface = new CSInterface();
    window.FASTPASS_UI = window.FASTPASS_UI || {};
    
    window.FASTPASS_UI.Utils = {
        isJsxReady: false,
        csInterface: csInterface,

        _logBuffer: [],
        _debugLogPath: null,
        // Auditoria de crides JSX: registra cada script enviat a Premiere per poder
        // comparar les accions REALS amb les que el codi pretén executar.
        _auditBuffer: [],
        _auditPath: null,
        // ── 📊 PERF (FASE 0 · TEMPORAL 2026-09-16) ─────────────────────────
        // Instrumentació per mesurar el coll d'ampolla del slider de reencuadre.
        // NO altera cap comportament: només compta temps, bytes i crides.
        // Retirar (o posar _perfOn = false) quan ja no calgui.
        _perfOn: true,
        _ioStats: { n: 0, ms: 0, maxMs: 0, bytes: 0, logN: 0, auditN: 0, syncN: 0, asyncN: 0, blockMs: 0 },
        _jsxStats: { n: 0, byPrefix: {}, other: 0 },
        // ── 🚀 FASE 2 (2026-09-16): I/O fora del camí calent ───────────────
        // Mesura Fase 0: 206 escriptures / 2411 ms / 35 MB reescrits en un barrido
        // de 4,5 s (54% del temps) — writeFile de CEP és SÍNCRON i va a un share
        // de xarxa. Ara s'acumulen línies i s'escriuen amb UNA escriptura de
        // `cep.fs.writeFile` com a molt 1 cop cada _ioFlushMs; ERROR/forceLog
        // forcen flush. (2026-10-29) Fora la via Node: el manifest no declara
        // `--enable-nodejs`, així que `_nodeFs`/`_nodeReq` eren codi mort.
        _ioFlushMs: 400,
        _logPending: [],
        _auditPending: [],
        _ioTimer: 0,
        // (2026-11-02 · O-B1) Estat de la via OCULTA (`execHidden`): ruta ja
        // resolta de bin\hidden.vbs i carpeta temporal verificada. Es desen per
        // no repetir `cep.fs.stat`/proves d'escriptura a cada tasca.
        _hiddenRunnerPath: '',
        _hiddenTempDir: '',
        // Filtre de logs per tema: string amb keywords separades per coma o null (desactivat).
        // Quan està actiu, log() NOMÉS escriu els missatges que continguin alguna keyword.
        // ⚠️ TEMPORAL (2026-09-04): DESACTIVAT per poder veure els logs del botó Main
        // (diagnòstic deriva IN del MP4). Per reactivar el filtre: setLogFilter('DoblePantalla')
        // o setLogFilter('Main, ProgramStart, sweet') des de la consola del panell.
        _logFilter: null,

        /**
         * Activa el filtre de logs per tema. Ex: setLogFilter('DoblePantalla') o
         * setLogFilter('Chyrons, PAS') o setLogFilter('') per desactivar.
         */
        setLogFilter: function(keywords) {
            this._logFilter = (keywords && String(keywords).trim()) ? String(keywords).split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean) : null;
            this.log("🎛️ Filtre de logs: " + (this._logFilter ? this._logFilter.join(', ') : 'DESACTIVAT'), "DEBUG");
        },

        clearLogFilter: function() {
            this.setLogFilter("");
        },

        /**
         * Inicialitza (o reinicia) el fitxer de log per al projecte actiu.
         * Es crida des de _runNew() i _runLoad() per tenir un log per projecte.
         * @param {string} folderPath - Ruta absoluta a la carpeta del projecte (ex: \\...\\09_06_2026\)
         * @param {string} projectName - Nom del fitxer .prproj (ex: Pruebas_TNV_V1_TEMA.prproj)
         */
        _setLogPath: function(folderPath, projectName) {
            // 🚀 FASE 2: abans de canviar de fitxer, buida el que quedi pendent.
            this._ioFlushNow();
            var normalized = folderPath.replace(/\\/g, '\\').replace(/\/$/, '');
            // Log comú a la carpeta PROVES (per seguir qualsevol projecte des d'un únic fitxer obert a l'editor)
            var provIdx = normalized.toUpperCase().indexOf('\\PROVES\\');
            if (provIdx > 0) {
                normalized = normalized.substring(0, provIdx) + '\\PROVES';
            }
            this._debugLogPath = normalized + '\\FASTPASS.log';
            this._logBuffer = [];
            this._logPending = [];          // 🚀 FASE 2
            try {
                window.cep.fs.writeFile(this._debugLogPath, '');
            } catch(e) {}
            // Fitxer d'auditoria de crides JSX (sense filtre de tema)
            this._auditPath = normalized + '\\FASTPASS_audit.log';
            this._auditBuffer = [];
            this._auditPending = [];        // 🚀 FASE 2
            try {
                window.cep.fs.writeFile(this._auditPath, '');
            } catch(e) {}
            this.log("📄 Log iniciat per a: " + projectName, "DEBUG");
        },

        /**
         * Retorna timestamp ISO local: [YYYY-MM-DD HH:MM:SS]
         */
        _timestamp: function() {
            var d = new Date();
            var pad = function(n) { return (n < 10 ? '0' : '') + n; };
            return '[' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                   ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + ']';
        },

        // ── 📊 PERF (FASE 0 · TEMPORAL 2026-09-16) ─────────────────────────
        /** Reinicia els comptadors de mesura (I/O i crides JSX). */
        _perfReset: function() {
            this._ioStats = { n: 0, ms: 0, maxMs: 0, bytes: 0, logN: 0, auditN: 0, syncN: 0, asyncN: 0, blockMs: 0 };
            this._jsxStats = { n: 0, byPrefix: {}, other: 0 };
        },

        /**
         * _timedWrite: window.cep.fs.writeFile mesurant quant triga i quants bytes
         * reescriu. El writeFile de CEP és SÍNCRON i les rutes de log viuen en un
         * share de xarxa (UNC) → aquesta mesura és la que ha de dir si l'I/O és el
         * coll d'ampolla del slider.
         * @param {string} path
         * @param {string} data
         * @param {string} kind - 'log' | 'audit' (per al desglossament)
         */
        _timedWrite: function(path, data, kind) {
            var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            var res = null;
            try { res = window.cep.fs.writeFile(path, data); } catch(eIO) { res = null; }
            if (this._perfOn) {
                var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                var s = this._ioStats;
                var d = t1 - t0;
                s.n++; s.ms += d; if (d > s.maxMs) s.maxMs = d;
                s.syncN++; s.blockMs += d;      // escriptura SÍNCRONA: temps bloquejant la UI
                s.bytes += (data ? data.length : 0);
                if (kind === 'audit') { s.auditN++; } else { s.logN++; }
            }
            return res;
        },

        // ── 🚀 FASE 2: escriptura diferida ─────────────────────────────────
        // (2026-10-29) Ací vivien `_nodeFs()` i `_nodeReq()` (mòduls `fs` i
        // `child_process` de Node). El manifest d'esta extensió NO declara
        // `--enable-nodejs`: dins de CEP no hi ha ni `require` ni `cep_node`,
        // així que les branques sempre tornaven null. Tota l'I/O va per
        // `cep.fs` (natiu) o pel pont JSX.

        /**
         * _writeNow: escriu les línies acumulades a disc.
         * Reescriu el buffer SENCER amb `window.cep.fs.writeFile` (síncron),
         * però només 1 cop per flush en comptes de 1 cop per missatge.
         * @param {string} path
         * @param {string[]} pending - línies noves (es buiden aquí)
         * @param {string} kind - 'log' | 'audit'
         */
        _writeNow: function(path, pending, kind) {
            if (!path || !pending || pending.length === 0) return;
            var lines = pending.splice(0, pending.length);
            // Reescriure el buffer SENCER (comportament clàssic de CEP),
            // però només 1 cop per flush en comptes de 1 cop per missatge.
            var full = (kind === 'audit') ? this._auditBuffer : this._logBuffer;
            this._timedWrite(path, full.join('\n') + '\n', kind);
        },

        /**
         * _ensureExtLogPath: Ruta del fitxer de log local de l'extensió. S'usa com a
         * fallback quan encara no hi ha projecte (fase prèvia a CREAR: FOTO,
         * checkContext, semàfors) o quan forceLog no té fitxer de projecte.
         * La primera vegada el fitxer es deixa NET (log de sessió, sense barrejar
         * amb execucions anteriors).
         */
        _ensureExtLogPath: function() {
            if (this._extLogPath) return this._extLogPath;
            // (2026-09-22) ABANS només es provava window.location.href: durant l'ARRENCADA del
            // panell (les línies ⏱️ [BOOT]) encara no està resolta → la ruta era null i
            // utils.log DESCARTAVA aquells missatges (no es veien enlloc). Ara es prova primer
            // la ruta nativa de l'extensió (el mateix mètode que fa servir main.js).
            var candidates = [];
            try {
                if (this.csInterface && typeof SystemPath !== 'undefined' && SystemPath.EXTENSION) {
                    var ext = this.csInterface.getSystemPath(SystemPath.EXTENSION);
                    if (ext) candidates.push(String(ext).replace(/[\\/]+$/, ''));
                }
            } catch (eExt) { }
            try {
                var href = window.location.href;
                var qi = href.indexOf('/index.html');
                if (qi > 0) {
                    var p = decodeURIComponent(href.substring(0, qi));
                    if (p.indexOf('file:///') === 0) p = p.substring(8);
                    candidates.push(p.replace(/\//g, '\\'));
                }
            } catch (eHref) { }
            for (var i = 0; i < candidates.length; i++) {
                var full = candidates[i] + '\\_keyframe_trace.log';
                try {
                    window.cep.fs.writeFile(full, '');
                    this._logBuffer = [];
                    this._extLogPath = full;
                    return full;
                } catch (eW) { }
            }
            return this._extLogPath;
        },

        /** Buida immediatament els pendents de log i auditoria. */
        _ioFlushNow: function() {
            if (this._ioTimer) { clearTimeout(this._ioTimer); this._ioTimer = 0; }
            // FIX (2026-09-16): sense projecte assignat, el log va al fitxer local de l'extensió.
            var logPath = this._debugLogPath || this._ensureExtLogPath();
            if (logPath && this._logPending.length) { this._writeNow(logPath, this._logPending, 'log'); }
            if (this._auditPath && this._auditPending.length) { this._writeNow(this._auditPath, this._auditPending, 'audit'); }
        },

        /** Agenda un flush diferit (com a molt 1 cada _ioFlushMs). */
        _ioSchedule: function() {
            if (this._ioTimer) return;
            var self = this;
            // El writeFile de CEP és SÍNCRON i reescriu el fitxer SENCER: el cost
            // per escriptura creix amb la mida del log → s'allarga l'interval
            // perquè el temps bloquejant per segon es mantingui petit i constant.
            var ms = 400 + Math.min(3000, this._logBuffer.length * 2);
            this._ioTimer = setTimeout(function () {
                self._ioTimer = 0;
                self._ioFlushNow();
            }, ms);
        },

        /**
         * _jsxLabel: etiqueta curta d'un script JSX per al desglossament del
         * comptador (ex: "Anim.sliderApply", "Registry.poll").
         */
        _jsxLabel: function(script) {
            try {
                var m = /([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(script);
                return m ? m[1] : 'altres';
            } catch(e) { return 'altres'; }
        },

        /** Compta una crida JSX realment enviada a Premiere (desglossada per etiqueta). */
        _jsxCount: function(script) {
            if (!this._perfOn) return;
            var s = this._jsxStats;
            s.n++;
            var k = this._jsxLabel(script);
            if (s.byPrefix[k] === undefined) {
                if (Object.keys(s.byPrefix).length >= 30) { s.other++; return; }
                s.byPrefix[k] = 0;
            }
            s.byPrefix[k]++;
        },

        // ── DEDUPLICACIÓ DE MISSATGES REPETITS ─────────────────────────────
        // Un error dins d'un poll es repeteix molts cops per segon (cas real:
        // 2.029 línies idèntiques → 1,1 MB de log en una sessió). Aquí, si el
        // mateix missatge es repeteix dins de LOG_DEDUPE_MS, no s'escriu; només
        // se n'imprimeix 1 de cada LOG_DEDUPE_EVERY repeticions (amb comptador).
        LOG_DEDUPE_MS: 5000,
        LOG_DEDUPE_EVERY: 100,
        _logDedupe: {},
        _logDedupeCount: 0,

        log: function(msg, level) { 
            // Filtre de logs per tema (estalvia tokens/ruido al chat).
            // Els missatges de nivell ERROR sempre es mostren.
            if (this._logFilter && level !== "ERROR") {
                var filter = this._logFilter;
                if (typeof filter === "string") filter = [String(filter).toLowerCase()];
                var _m = String(msg).toLowerCase();
                var _match = false;
                for (var _i = 0; _i < filter.length; _i++) {
                    if (_m.indexOf(String(filter[_i]).toLowerCase()) !== -1) { _match = true; break; }
                }
                if (!_match) return;
            }

            // Deduplicació: només suprimeix repeticions EXACTES seguides.
            // Un missatge únic s'escriu sempre; les repeticions ràpides s'agrupen.
            var _key = String(msg);
            var _now = Date.now();
            var _d = this._logDedupe[_key];
            if (_d && (_now - _d.last) < this.LOG_DEDUPE_MS) {
                _d.n++;
                _d.last = _now;
                if ((_d.n % this.LOG_DEDUPE_EVERY) !== 0) return;
                msg = _key + '  [repetit x' + _d.n + ']';
            } else {
                this._logDedupe[_key] = { last: _now, n: 1 };
                // Poda periòdica: primer treure les entrades caducades; si tot i això
                // n'hi ha massa (molts missatges únics seguits), reiniciar el mapa.
                if (++this._logDedupeCount > 500) {
                    var _cut = _now - this.LOG_DEDUPE_MS;
                    var _live = 0;
                    for (var _k in this._logDedupe) {
                        if (this._logDedupe[_k].last < _cut) { delete this._logDedupe[_k]; }
                        else { _live++; }
                    }
                    if (_live > 400) { this._logDedupe = {}; }
                    this._logDedupeCount = 0;
                }
            }

            const colors = { "INFO": "🔵", "DEBUG": "🟢", "ERROR": "🔴", "WARN": "🟡" };
            var ts = this._timestamp();
            var formatted = ts + ' ' + (colors[level || "INFO"] || '🔵') + ' [FASTPASS]: ' + msg;
            console.log(formatted);
            // Escriure al fitxer de debug del projecte perquè el Cline pugui llegir-lo.
            // FIX (2026-09-16): en la fase PRÈVIA al projecte (FOTO, checkContext,
            // semàfors, ESCALETA...) no hi ha cap fitxer assignat i aquests missatges
            // només anaven a la consola del panell → impossibles de diagnosticar.
            // Ara, si no hi ha fitxer de projecte, s'escriuen al fitxer local de
            // l'extensió (_ensureExtLogPath), amb el mateix flush diferit.
            var _logPath = this._debugLogPath || this._ensureExtLogPath();
            if (_logPath) {
                this._logBuffer.push(formatted);
                this._logPending.push(formatted);     // 🚀 FASE 2: acumula
                // Els ERRORs s'escriuen sempre de seguida (no es poden perdre).
                if (level === "ERROR") { this._ioFlushNow(); } else { this._ioSchedule(); }
            }
        },

        clearLogFile: function() {
            this._logBuffer = [];
            this._logPending = [];          // 🚀 FASE 2
            this._auditPending = [];        // 🚀 FASE 2
            if (this._ioTimer) { clearTimeout(this._ioTimer); this._ioTimer = 0; }
            if (this._debugLogPath) {
                try {
                    window.cep.fs.writeFile(this._debugLogPath, '');
                    this.log("🧹 Log file reiniciat", "DEBUG");
                } catch(e) {}
            }
        },

        /**
         * forceLog: Escriu SEMPRE al console i al fitxer FASTPASS.log, saltant-se
         * el filtre de tema (_logFilter). Útil per a traçes de diagnòstic.
         */
        forceLog: function(msg) {
            try {
                var ts = this._timestamp();
                var formatted = ts + ' 🟢 [FASTPASS]: ' + msg;
                console.log(formatted);
                // Mateix camí per als dos casos (FIX 2026-09-16): amb projecte escriu al
                // log del projecte; sense projecte, _ioFlushNow resol el fitxer local de
                // l'extensió (_ensureExtLogPath) → els missatges de diagnòstic previs a
                // CREAR ja no es perden a la consola.
                this._logBuffer.push(formatted);
                this._logPending.push(formatted);   // 🚀 FASE 2
                this._ioFlushNow();                 // diagnòstic: escriptura immediata
            } catch(e) {}
        },

        /**
         * JSX_TIMEOUT_MS: (2026-11-02 · BUG #215) Vigilància del pont ExtendScript.
         *
         * PER QUÈ: `csInterface.evalScript` no té temps límit. Si Premiere obri un
         * diàleg MODAL (el cas real: la finestra de progrés «Import Files» en
         * ingestar 26 rètols ProRes de 44 MB per xarxa) el motor queda bloquejat i
         * la resposta NO arriba MAI: el panell esperava indefinidament, sense
         * rellotge al botó ni cap error al log (FASTPASS.log es quedava mut des de
         * l'inici de la importació). Amb esta vigilància la crida es talla amb un
         * ERROR explícit i el flux pot reintentar o avortar en compte de penjar-se.
         * `opts.timeoutMs = 0` la desactiva per a una crida concreta.
         *
         * VALOR: 15 min, el mateix topall que la xarxa de seguretat del botó ocupat
         * (`BUSY_MAX_MS` a `main.js`). És prou llarg per a una crida legítimament
         * lenta (`Project.open` d'una plantilla gran, `saveAs`…) i, en canvi, talla
         * un bloqueig infinit. La RENDER (`Render.renderDirect` =
         * `exportAsMediaDirect`) va amb `timeoutMs: 0`: un export pot dur molt més.
         */
        JSX_TIMEOUT_MS: 900000,

        /**
         * Pont asíncron cap al motor ExtendScript (JSX).
         */
        callJSX: function(script, opts) {
            // opts.rawError: si true, un ERR de JSX es retorna TAL QUAL (per poder
            // distingir "error de transport" de "resposta buida"). Per defecte es
            // manté el comportament clàssic (ERR → "[]") per no alterar els llamants.
            var rawError = !!(opts && opts.rawError);
            // Vigilància (BUG #215): valor per defecte generós; el retorn és el
            // sentinella '__TIMEOUT__' (no comença per "ERR:" perquè no és un error
            // del codi JSX, sinó que Premiere no ha contestat).
            var timeoutMs = (opts && typeof opts.timeoutMs === 'number')
                ? opts.timeoutMs
                : (typeof this.JSX_TIMEOUT_MS === 'number' ? this.JSX_TIMEOUT_MS : 900000);
            var self = this;
            // Auditoria: registra cada script enviat a Premiere (per poder comparar
            // les accions reals amb el que el codi pretén executar)
            if (this._auditPath) {
                try {
                    var _auditLine = this._timestamp() + " JSX> " + script;
                    this._auditBuffer.push(_auditLine);
                    this._auditPending.push(_auditLine);   // 🚀 FASE 2: acumula
                    this._ioSchedule();                    // 🚀 FASE 2: flush diferit
                } catch(e) {}
            }
            // Si estem en mode batching i NO és una crida de consulta crítica (com Anim.x), encolar
            if (this.Batch._isBatching && !script.includes("Anim.x") && !script.includes(".get") && !script.includes(".active")) {
                this.Batch._queue.push(script);
                return Promise.resolve("QUEUED");
            }

            this._jsxCount(script);   // 📊 FASE 0: compta la crida real a Premiere

            return new Promise(function(resolve) {
                var safeScript = "try{" + script + "}catch(e){'ERR:'+e.message}";
                // (2026-11-02 · BUG #215) rellotge de vigilància + guarda perquè la
                // resposta tardana (Premiere desbloquejat després del timeout) no
                // resolga dos vegades ni trepitge el sentinella.
                var resolt = false;
                var timer = null;
                if (timeoutMs > 0) {
                    timer = setTimeout(function() {
                        if (resolt) return;
                        resolt = true;
                        self.log('⏱️ [JSX] Premiere no ha contestat en ' + Math.round(timeoutMs / 1000) + ' s · ' +
                            String(script).substring(0, 140) +
                            ' — si hi ha un diàleg de Premiere obert (p. ex. «Import Files»), tanca\'l o cancel·la\'l.', 'ERROR');
                        resolve('__TIMEOUT__');
                    }, timeoutMs);
                }
                csInterface.evalScript(safeScript, function(res) {
                    if (resolt) return;
                    resolt = true;
                    if (timer) clearTimeout(timer);
                    if (!res || res === "undefined") {
                        resolve("");
                    } else if (res.indexOf("ERR:") === 0) {
                        window.FASTPASS_UI.Utils.log("💥 [JSX ERROR]: " + res, "ERROR");
                        resolve(rawError ? res : "[]");
                    } else {
                        resolve(res);
                    }
                });
            });
        },

        /**
         * Sistema de Batching per a comandes JSX (Fase 1 Mejora Eficiencia)
         */
        Batch: {
            _queue: [],
            _isBatching: false,
            begin: function() { 
                this._isBatching = true; 
                this._queue = [];
                window.FASTPASS_UI.Utils.log("📥 Batching JSX iniciat...", "DEBUG");
            },
            flush: async function() {
                if (this._queue.length === 0) {
                    this._isBatching = false;
                    return "EMPTY";
                }
                const fullScript = this._queue.join(";\n");
                const count = this._queue.length;
                this._queue = [];
                this._isBatching = false;
                
                window.FASTPASS_UI.Utils.log(`📤 Enviant batch de ${count} comandes...`, "DEBUG");
                return await window.FASTPASS_UI.Utils.callJSX(fullScript);
            }
        },

        /**
         * Algoritme de cerca binària per a llistes ordenades per temps (Fase 2)
         */
        binarySearchForTime: function(list, time, timeKey = 'start') {
            let low = 0;
            let high = list.length - 1;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const midTime = list[mid][timeKey];
                if (midTime === time) return mid;
                if (midTime < time) low = mid + 1;
                else high = mid - 1;
            }
            return high; // Retorna l'índex immediatament anterior o coincident
        },

        /**
         * _decodeName: Desfà l'URL-encoding que ExtendScript pot aplicar a
         * File.name en rutes UNC (ex: 'Pruebas_TNC_V1_CAP%20POLICIA.prproj').
         * Sense això els noms no coincideixen amb els del projecte obert
         * (Project.path() dóna el nom real) i el context conclou LOAD en
         * comptes d'UPDATE → els semàfors no es calculen i queden apagats.
         * @param {string} name
         * @returns {string}
         */
        _decodeName: function(name) {
            var n = String(name === null || name === undefined ? '' : name);
            if (n.indexOf('%') === -1) return n;
            try { return decodeURIComponent(n); } catch (e) { return n; }
        },

        // ── REPARACIÓ DE MOJIBAKE (2026-10-02) ──────────────────────────────
        // El pont ExtendScript (File.read / callSystem) descodifica com a ANSI
        // (CP1252). Quan el que hi arriba és UTF-8 (l'API de digition), cada
        // caràcter accentuat es converteix en DOS ("Ò" → "Ã’") i, en tornar-se a
        // escriure en UTF-8, el text queda DOBLEMENT codificat. Conseqüència real:
        // el tema del bloc V1 de TNC (02/10/2026) va sortir com a "CRANICA VACTOR"
        // perquè el NFD de sanitizeName convertia "Ã" en "A" i inventava la lletra.
        /** Taula inversa CP1252 → byte (només el bloc 0x80-0x9F; la resta és identitat). */
        _CP1252_HIGH: {
            0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
            0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
            0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
            0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
            0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
            0x017E: 0x9E, 0x0178: 0x9F
        },

        /**
         * _isMojibake: detecta el patró "Ã"/"Â"/"â"/"ð" (bytes de capçalera UTF-8)
         * seguits d'un caràcter del bloc CP1252 0x80-0xBF (o del caràcter de
         * substitució U+FFFD que deixa el descodificador quan el byte no existeix
         * a CP1252). Ex: "Ã’"=Ò, "Ã‡"=Ç, "Ã©"=é, "â€”"=—, "Â·"=·.
         * Un text català net MAI té aquestes combinacions.
         * @param {string} str
         * @returns {boolean}
         */
        _isMojibake: function(str) {
            var s = String(str === null || str === undefined ? '' : str);
            return /[\u00C2\u00C3\u00C5\u00E2\u00F0][\u0080-\u00BF\uFFFD\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u20AC\u2122\u0160\u0161\u0152\u0153\u017D\u017E\u0178\u02C6\u02DC\u0192]/.test(s);
        },

        /**
         * _fromMojibake: DESFÀ el mojibake CP1252 tornant cada caràcter al seu byte
         * original i descodificant el resultat com a UTF-8 de debò.
         * - Byte perdut (U+FFFD): CP1252 no defineix 0x81/0x8D/0x8F/0x90/0x9D. Darrere
         *   d'un "Ã" (0xC3) la lletra original és À/Í/Ï/Ð/Ý; en català només hi ha Í i
         *   Ï i totes dues donen la mateixa lletra base ("I") → s'assumeix 0x8D (Í).
         * - Si la reparació no quadra, no hi ha TextDecoder o el text ja és net, es
         *   retorna l'entrada sense tocar.
         * @param {string} str
         * @param {string} [where] - origen per al log
         * @returns {string}
         */
        _fromMojibake: function(str, where) {
            var s = String(str === null || str === undefined ? '' : str);
            if (!this._isMojibake(s)) return s;
            var map = this._CP1252_HIGH, bytes = [], ambig = 0, i, c;
            for (i = 0; i < s.length; i++) {
                c = s.charCodeAt(i);
                if (c === 0xFFFD) {
                    // Byte que CP1252 NO defineix (0x81/0x8D/0x8F/0x90/0x9D): el
                    // descodificador ja l'ha perdut, així que se n'ha de triar un.
                    // Darrere d'un 0xC3 ("Ã") la lletra original és À/Í/Ï/Ð/Ý → 0x8D
                    // (Í: l'única possible en català). En qualsevol altre cas és
                    // puntuació tipogràfica ("â€…") → 0x9D (cometes de tancament ”).
                    // Si la tria fes una seqüència UTF-8 invàlida, es descarta tota
                    // la reparació (retorna l'original) gràcies al guard de sota.
                    bytes.push(bytes.length && bytes[bytes.length - 1] === 0xC3 ? 0x8D : 0x9D);
                    ambig++;
                }
                else if (c <= 0xFF) { bytes.push(c); }
                else if (map[c] !== undefined) { bytes.push(map[c]); }
                else { return s; }   // text real (no mojibake): no tocar res
            }
            try {
                var txt = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
                if (txt.indexOf('\uFFFD') !== -1) return s;
                this.log('🩹 Mojibake CP1252 reparat' + (where ? ' (' + where + ')' : '') +
                    (ambig ? ' · ' + ambig + ' byte(s) ambigu(s) assumits com a Í' : ''), 'WARN');
                return txt;
            } catch (e) { return s; }
        },

        readFolder: async function(path) {
            // ── FILTRAT PER DATA DE CREACIÓ (2026-09-07) ───────────────────────
            // Els fitxers del NAS (wotts .mov, portades .png, SRT...) poden tenir el
            // mtime DESPLAÇAT per processos nocturns (ex: 02:31 del dia següent).
            // La data FIABLE és la de CREACIÓ (creationTime / File.created), que cap
            // procés modifica. Per això en rutes UNC es llegeix SEMPRE via JSX
            // (scanDirectory → File.created) i mai s'usa mtime com a created.
            //
            // ⚠️ (2026-09-22) INTENT DESCARTAT d'optimitzar-ho amb cep.fs.readdir +
            // cep.fs.stat també en UNC: en aquesta màquina el stat sobre UNC NO dóna
            // creationTime → created quedava buit → filterByWorkDate descartava TOTS
            // els wotts/portades ("69 -> 0, NO datables") i no es col·locava res.
            // Revertit al JSX. Si es vol tornar a intentar, cal PRIMER verificar que
            // cep.fs.stat('./ruta UNC') retorna creationTime.
            // ── CONTRACTE (F1, 2026-10-01) ──────────────────────────────────────
            //   Array (fins i tot []) = lectura OK ([ ] = carpeta buida DE DEBÒ)
            //   null                  = la lectura ha FALLAT (pont/motor/permisos)
            // Els cridaners han de comprovar `!result` per distingir-ho: un null
            // MAI s'ha de tractar com "no hi ha res" sense avisar l'usuari.
            var isUnc = (path || '').indexOf('\\\\') === 0 || (path || '').indexOf('//') === 0;
            if (isUnc) {
                return await this._readFolderViaJsx(path);   // pot ser null (F1)
            }

            // Rutes locals: CEP (més ràpid). creationTime directe; mai mtime com a created.
            var result = window.cep.fs.readdir(path);
            if (result.err === 0) {
                var filenames = result.data;
                var filesWithStats = [];
                var folderPath = path.replace(/[\\/]*$/, "\\");
                var needCreated = [];

                for (var i = 0; i < filenames.length; i++) {
                    var name = filenames[i];
                    var fullPath = folderPath + name;
                    var stat = window.cep.fs.stat(fullPath);
                    var created = (stat.err === 0) ? stat.data.creationTime : null;
                    filesWithStats.push({
                        name: this._decodeName(name),
                        mtime: (stat.err === 0) ? stat.data.mtime : 0,
                        created: created
                    });
                    if (!created || isNaN(created) || created === 0) needCreated.push(name);
                }

                // Si CEP no exposa creationTime (comú), completar amb File.created via JSX.
                if (needCreated.length > 0) {
                    var jsxMap = await this._scanDirectoryMap(path);
                    if (jsxMap) {
                        for (var j = 0; j < filesWithStats.length; j++) {
                            var it2 = jsxMap[filesWithStats[j].name];
                            if (!it2) continue;
                            if (!filesWithStats[j].created || isNaN(filesWithStats[j].created) || filesWithStats[j].created === 0) {
                                filesWithStats[j].created = it2.created || 0;
                            }
                        }
                    }
                }
                return filesWithStats;
            } else {
                this.log(`CEP error ${result.err} leyendo carpeta, intentando via JSX: ${path}`, "DEBUG");
                return await this._readFolderViaJsx(path);
            }
        },

        /**
         * _scanDirectoryMap: Llista la carpeta via JSX (File.created) i la retorna
         * com a mapa name → { modified, created, size }.
         *
         * ── F1 (2026-10-01) · LECTURA FALLIDA ≠ CARPETA BUIDA ─────────────────
         * Retorna `null` NOMÉS quan la lectura ha FALLAT:
         *   · el pont no ha retornat res ('' / undefined),
         *   · error del motor ('ERR…'),
         *   · la crida ha quedat encuada pel Batching ('QUEUED'),
         *   · el motor diu 0 fitxers MENTRE CEP n'hi veu (readdir) → llistat perdut.
         * Un mapa buit (`{}`) vol dir carpeta buida de debò.
         * ABANS, qualsevol d'aquests errors es convertia en una llista buida
         * silenciosa → el panell creia "no hi ha rètols del bloc" i els botons de
         * chyrons quedaven morts sense cap pista (cas real 2026-10-01: 0 wotts
         * importats tot i haver-hi 24 .mov del bloc V1 al NAS).
         * @param {string} path
         * @returns {Promise<Object|null>} mapa (pot ser {}) o null si ha FALLAT
         */
        _scanDirectoryMap: async function(path) {
            // Testimoni independent del motor: cep.fs.readdir (barat, sense stats
            // per fitxer) diu quants fitxers hi hauria d'haver.
            var expected = null;
            try {
                var rd = window.cep.fs.readdir(path);
                if (rd && rd.err === 0 && rd.data) expected = rd.data.length;
            } catch (eRd) { expected = null; }

            var items = null;
            try {
                // rawError:true → els ERR del motor arriben TAL QUAL (no es
                // converteixen en "[]", que és el que amagava la fallada).
                var raw = await this.callJSX(`IO.scanDirectory('${this.escape(path)}')`, { rawError: true });
                if (raw === 'QUEUED') {
                    this.log('❌ [FS] Lectura FALLIDA: la crida ha quedat encuada pel Batching: ' + path, 'ERROR');
                    return null;
                }
                if (raw === undefined || raw === null || raw === '') {
                    this.log('❌ [FS] Lectura FALLIDA (el pont no ha retornat res): ' + path +
                        ' · CEP hi veu ' + (expected === null ? '?' : expected) + ' fitxers', 'ERROR');
                    return null;
                }
                if (String(raw).indexOf('ERR') === 0) {
                    this.log('❌ [FS] Error del motor llistant ' + path + ': ' + String(raw).substring(0, 80), 'ERROR');
                    return null;
                }
                items = JSON.parse(raw);
            } catch (e) {
                this.log(`💥 Error en scanDirectory JSX (${path}): ${e.message}`, "ERROR");
                return null;
            }

            if (!items || items.length === 0) {
                // El motor diu buit. Si CEP hi veu fitxers, la lectura s'ha perdut.
                if (expected && expected > 0) {
                    this.log('❌ [FS] Lectura INCOMPLETA de ' + path + ': el motor diu 0 fitxers i CEP n\'hi veu ' +
                        expected + ' → es descarta (NO es tracta com a carpeta buida)', 'ERROR');
                    return null;
                }
                return {};   // carpeta buida de debò
            }
            if (expected !== null && items.length !== expected) {
                this.log('⚠️ [FS] Llistat parcial de ' + path + ': motor=' + items.length + ' · CEP=' + expected, 'WARN');
            }

            var map = {};
            for (var k = 0; k < items.length; k++) {
                map[items[k].name] = {
                    modified: items[k].modified || 0,
                    created: items[k].created || 0,
                    size: items[k].size || 0
                };
            }
            return map;
        },

        /**
         * _readFolderViaJsx: Llegeix la carpeta completament via JSX (rutas UNC).
         * created prové de File.created (data de creació real, fiable).
         * @returns {Promise<Array|null>} [] = carpeta buida · null = lectura FALLIDA
         */
        _readFolderViaJsx: async function(path) {
            var jsxMap = await this._scanDirectoryMap(path);
            if (!jsxMap) return null;   // F1: fallada (null) ≠ carpeta buida ([])
            var out = [];
            for (var name in jsxMap) {
                if (!jsxMap.hasOwnProperty(name)) continue;
                var it = jsxMap[name];
                out.push({ name: this._decodeName(name), mtime: it.modified, created: it.created, size: it.size });
            }
            return out;
        },

        /**
         * Crea directoris de forma recursiva al NAS/Local des de JS
         */
        ensureFolders: function(path) {
            const fs = window.cep.fs;
            let normalizedPath = path.replace(/\//g, '\\');
            let parts = normalizedPath.split('\\');
            let currentPath = "";
        
            // Gestió de ruta UNC (\\DSMEDIA07...)
            let isUNC = normalizedPath.indexOf('\\\\') === 0;
            this.log(`🔍 [JS-FS] Analitzant ruta: ${normalizedPath} (UNC: ${isUNC})`, "DEBUG");
            
            // Si és UNC, el començament és \\SERVIDOR\RECURS
            if (isUNC) {
                currentPath = '\\\\' + parts[2] + '\\' + parts[3];
                var startIndex = 4;
            } else {
                currentPath = parts[0]; // Unitat C: o similar
                var startIndex = 1;
            }
        
            for (let i = startIndex; i < parts.length; i++) {
                if (!parts[i]) continue;
                currentPath += '\\' + parts[i];
                
                let stat = fs.stat(currentPath);
                
                // 📍 Si no existe (err 2) O si hay un error de acceso (err 3, etc.)
                // intentamos crearla de todos modos por si es un subdirectorio nuevo.
                if (stat.err !== 0) { 
                    let result = fs.makedir(currentPath);
                    
                    if (result.err === 0) {
                        this.log(`✅ [JS-FS] Carpeta creada: ${currentPath}`, "DEBUG");
                    } else if (result.err === 82) { // 82 = Ya existe (pero el stat falló por red)
                        this.log(`ℹ️ [JS-FS] La carpeta ya existía: ${currentPath}`, "DEBUG");
                    } else {
                        // Solo logueamos como error si realmente no podemos crearla
                        this.log(`⚠️ [JS-FS] Intentant crear ${currentPath}: Codi ${result.err}`, "DEBUG");
                    }
                }
            }
            return true;
        },


        /**
         * _importChunk: una sola crida `FASTPASS.IO.importFiles` per a un bloc de rutes.
         * @param {Array<string>} paths - rutes ja normalitzades
         * @param {string} binName - bin destí
         * @param {number} timeoutMs - vigilància del pont JSX
         * @returns {Promise<string>} "OK" o el motiu del fracàs ("__TIMEOUT__", "ERR:...", …)
         */
        _importChunk: async function(paths, binName, timeoutMs) {
            // 📍 BLINDAJE: (2026-09-23) El payload viatja dins d'un LITERAL ExtendScript
            // ('...'), així que cal una DOBLE escapada: JSON.stringify converteix cada \
            // en \\ i utils.escape les torna a duplicar, de manera que el literal les
            // retorni senceres (i de pas escapa les cometes simples).
            // ABANS només s'escapaven les cometes simples → les barres invertides es
            // perdien en arribar al JSX (\P, \Z, \S… → P, Z, S) i la ruta quedava
            // trencada: la ingesta fallava amb ERR:MOVE_FAILED i després l'ítem no
            // existia (ERR_ITEM_NOT_FOUND en col·locar-lo).
            // No es notava al flux de Project perquè allà les rutes es passen amb "/"
            // (f.path.replace(/\\/g, "/")) i escape() no toca les barres normals.
            // Mateixa tècnica que _freezeTemaTitol (flow_chyrons.js).
            const payload = this.escape(JSON.stringify(paths));
            const res = await this.callJSX(`FASTPASS.IO.importFiles('${payload}', '${binName}')`,
                { timeoutMs: timeoutMs });
            return res;
        },

        /**
         * _engineAlive: sonda CURTA del motor ExtendScript (`FASTPASS.version()`, no
         * toca el projecte ni el timeline). Servix per a distinguir «Premiere està
         * bloquejat dins d'una altra crida» de «la crida ha fallat» sense esperar el
         * temps límit llarg (180 s) una segona volta.
         * @param {number} [timeoutMs=8000]
         * @returns {Promise<boolean>} true = el motor contesta
         */
        _engineAlive: async function(timeoutMs) {
            const t = (Number(timeoutMs) > 0) ? Number(timeoutMs) : 8000;
            let r = '';
            try {
                r = String(await this.callJSX('FASTPASS.version()', { timeoutMs: t }) || '');
            } catch (e) { return false; }
            if (!r || r === '__TIMEOUT__') return false;
            return (r.indexOf('ERR') !== 0);
        },

        /**
         * Ingesta de fitxers a Premiere Pro, EN BLOCS i amb reintent.
         *
         * (2026-11-02 · BUG #215) PER QUÈ EN BLOCS: `FASTPASS.IO.importFiles` fa un
         * `app.project.importFiles()` SÍNCRON. Amb 26 rètols ProRes-4444 de 44 MB
         * per xarxa, Premiere obri un diàleg modal de progrés («Import Files») que
         * es va quedar penjat: el motor ExtendScript no va tornar mai la resposta,
         * l'usuari el va cancel·lar i el flux va continuar com si s'haguera
         * importat → **projecte creat sense cap rètol**, en silenci.
         * Amb blocs: (a) cada crida és curta, (b) si un bloc no contesta se sap
         * QUINS fitxers han sigut, (c) es reintenta automàticament QUAN el bloc ha
         * contestat amb error (el reintent és el que sempre ha funcionat a mà) i
         * (d) es retorna un resum perquè el cridador puga verificar-ho abans de
         * construir el projecte.
         *
         * (2026-11-02 · BUG #217) Un `__TIMEOUT__` NO es reintenta: el motor seguix
         * dins de la crida anterior, així que reenviar el bloc n'encua una segona i,
         * quan Premiere es desbloqueja, importa els mateixos fitxers dos pics.
         *
         * (2026-11-02 · BUG #221) Mentres un bloc espera, un watchdog de 20 s escriu
         * al log i a la barra d'estat què cal fer si la finestra «Import Files» de
         * Premiere es queda quieta: **prem Cancel·lar** (el que ja ha entrat es
         * conserva). El fil del panell seguix viu encara que el motor estiga bloquejat
         * dins d'`importFiles`, així que l'avís sí que arriba.
         *
         * @param {Array} pathList - Llista de rutes (UNC o locals) o objectes { path }.
         * @param {string} binName - Nom del Bin de destí (o "root").
         * @param {Object} [opts] - { chunkSize = 5, timeoutMs = 180000 }
         * @returns {Promise<{ok:boolean, sent:number, chunks:number, failed:number, timeout:boolean, blocked:boolean}>}
         *   `timeout:true` = Premiere ha deixat de contestar; les rutes que queden NO
         *   s'han intentat (el cridador ha d'avortar, no de reintentar-ho tot).
         *   `blocked:true` = la sonda curta (`FASTPASS.version()`, 8 s) tampoc no ha
         *   contestat → el motor està dins d'una altra crida (diàleg modal obert).
         */
        importList: async function(pathList, binName, opts) {
            const out = { ok: true, sent: 0, chunks: 0, failed: 0, timeout: false, blocked: false };
            if (!pathList || !pathList.length) return out;

            // Extraemos solo el path si es un objeto
            const rawPaths = pathList.map(item => item.path || item).filter(p => !!p);
            if (rawPaths.length === 0) return out;

            const chunkSize = Math.max(1, (opts && opts.chunkSize) || 5);
            const timeoutMs = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : 180000;
            const total = Math.ceil(rawPaths.length / chunkSize);
            let n = 0;

            // ── (2026-11-02 · BUG #221) AVÍS PROACTIU DE LA FINESTRA MODAL ────────
            // Premiere obri la finestra de progrés «Import Files» mentre importa
            // (el `suppressUI` de `importFiles` NO la lleva) i, amb rètols ProRes
            // per xarxa, sovint NO es tanca sola quan ja ha acabat. Mentre està
            // oberta el motor ExtendScript està bloquejat (`importFiles` és
            // síncron): ni logs, ni sonda, ni cap altra crida. El fil del panell,
            // en canvi, seguix viu, així que es pot dir QUÈ fer ABANS que el bloc
            // caduque (abans l'usuari havia d'endevinar que calia «Cancel·lar»).
            const self = this;
            const _avisModal = 'si la finestra «Import Files» de Premiere es queda quieta, ' +
                'prem Cancel·lar: no es perd res del que ja ha entrat al projecte';
            this.log(`📥 [INGEST] ${rawPaths.length} fitxer(s) → ${binName} en ${total} bloc(s) de ${chunkSize} · ` +
                _avisModal, 'INFO');
            this.status(`📥 INGEST: carregant ${rawPaths.length} fitxer(s) a Premiere… ` +
                '(«Import Files» quieta → Cancel·lar)', 'debug');

            try {
                for (let i = 0; i < rawPaths.length; i += chunkSize) {
                    const chunk = rawPaths.slice(i, i + chunkSize);
                    n++;
                    out.chunks++;
                    const _bloc = n;
                    this.log(`📥 [INGEST] Bloc ${_bloc}/${total} (${chunk.length} fitxer(s)) → ${binName}`, 'DEBUG');

                    // Vigilància de la finestra modal (BUG #221): cada 20 s, un avís
                    // amb els segons que porta el bloc. El fil del panell seguix viu
                    // encara que el motor estiga bloquejat dins d'`importFiles`.
                    const _tBloc = Date.now();
                    let _wd = null;
                    if (typeof setInterval === 'function') {
                        _wd = setInterval(function () {
                            const s = Math.round((Date.now() - _tBloc) / 1000);
                            self.log(`⏳ [INGEST] bloc ${_bloc}/${total} sense resposta des de fa ${s} s · ` +
                                _avisModal, 'WARN');
                            self.status(`⏳ INGEST: esperant Premiere (${s} s)… ` +
                                'si «Import Files» no avança, prem Cancel·lar', 'warn');
                        }, 20000);
                    }
                    let res;
                    try {
                        res = await this._importChunk(chunk, binName, timeoutMs);
                    } finally {
                        if (_wd) clearInterval(_wd);
                    }
                    if (res === "OK") {
                        this.status(`📥 INGEST: bloc ${_bloc}/${total} importat (${out.sent + chunk.length} fitxer(s))`, 'debug');
                    }
                    // ⛔ (2026-11-02 · BUG #217) UN `__TIMEOUT__` NO ES REINTENTA.
                    // El motor ExtendScript continua DINS de la crida anterior (no ha
                    // tornat mai), així que reenviar el bloc només encua una SEGONA
                    // `importFiles` damunt del mateix motor bloquejat: es paga el temps
                    // límit dos voltes i, quan Premiere es desbloqueja, els mateixos
                    // fitxers entren dos pics. Cas real (TNV V2, 02/11 13:44): bloc de
                    // 5 wotts → 180 s + reintent → altres 180 s, i tres crides mortes
                    // a la cua (importFiles ×2 + scanDirectory).
                    if (res !== "OK" && res !== "__TIMEOUT__") {
                        // Reintent (una vegada): és el que s'ha fet sempre a mà.
                        this.log(`⚠️ [INGEST] Bloc ${n}/${total} no ha importat (${res}) → reintent en 1,5 s…`, 'WARN');
                        await this.delay(1500);
                        res = await this._importChunk(chunk, binName, timeoutMs);
                    }
                    if (res === "OK") {
                        out.sent += chunk.length;
                    } else {
                        out.failed++;
                        out.ok = false;
                        this.log(`❌ [INGEST] Bloc ${n}/${total} NO importat (${res}) · primers: ` +
                            chunk.slice(0, 2).map(p => String(p).split('/').pop()).join(', '), 'ERROR');
                        // Cortacircuits: si Premiere no respon, els blocs que queden
                        // també esperarien el temps límit (n × timeout). S'atura ací.
                        if (res === '__TIMEOUT__') {
                            out.timeout = true;
                            // Sonda CURTA (8 s): distinguix «motor bloquejat» de «ha
                            // tornat però la importació no ha contestat».
                            out.blocked = !(await this._engineAlive(8000));
                            this.log(out.blocked
                                ? '⛔ [INGEST] El motor de Premiere està BLOQUEJAT: no contesta ni la sonda. ' +
                                  'Si hi ha un diàleg obert («Import Files»), tanca\'l o cancel·la\'l.'
                                : '⚠️ [INGEST] El motor ha tornat a contestar (sonda OK) però la importació ' +
                                  'del bloc no ha respost: bloc massa gran o diàleg tancat massa tard.',
                                out.blocked ? 'ERROR' : 'WARN');
                            this.log(`⛔ [INGEST] S'atura la resta (${total - n} bloc(s) pendent(s)): ` +
                                (out.blocked ? 'no es reintenta sobre un motor bloquejat.'
                                             : 'el bloc no ha contestat dins del temps límit.'), out.blocked ? 'ERROR' : 'WARN');
                            break;
                        }
                    }
                }
            } catch (e) {
                out.ok = false;
                this.log(`🔴 Error Ingesta: ${e.message}`, "ERROR");
            }
            // (2026-11-02 · BUG #221) Resum a la barra d'estat: si el bloc s'ha
            // desbloquejat cancel·lant la finestra, es veu de seguida què ha entrat.
            this.status(out.timeout
                ? `⏳ INGEST: aturada per falta de resposta (${out.sent}/${rawPaths.length} fitxer(s) enviats)`
                : `📥 INGEST: ${out.sent}/${rawPaths.length} fitxer(s) importat(s) a Premiere`,
                out.timeout ? 'warn' : (out.ok ? 'debug' : 'error'));
            return out;
        },

        sanitizeName: function(str) {
            if (!str) return "Unnamed_Item";
            // (2026-10-02) XARXA DE SEGURETAT: si el text arriba doblement codificat
            // (mojibake CP1252, p. ex. "CRÃ’NICA"), reparar-lo ABANS del NFD. Sense
            // això el NFD convertia "Ã" en "A" i inventava lletres ("CRÒNICA"→"CRANICA").
            if (this._isMojibake(str)) str = this._fromMojibake(str, 'sanitizeName');
            // (2026-09-23) NOMS SEMPRE EN ASCII I IDÈNTICS entre bloc, projecte i seqüència.
            // 1. NFD + treure diacrítics: Ç→C, à→a, è→e, í→i, ·→(res), ’→'…
            var normalized = String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            // 2. QUALSEVOL resta de caràcter no-ASCII s'ELIMINA: així cap nom pot arrossegar
            //    mojibake ("COMENA‡A", "Ã‡", "Â€") ni símbols estranys.
            normalized = normalized.replace(/[^\x20-\x7E]/g, "");
            // 3. Caràcters prohibits a Windows + espais col·lapsats + límit de 60 caràcters.
            var pattern = new RegExp('[<>:"/\\\\|?*#]', 'g');
            return normalized.replace(pattern, "").replace(/\s+/g, " ").trim().substring(0, 60);
        },

        /**
         * workFolder(ctx): RUTA DE TREBALL ÚNICA de l'extensió (2026-09-24).
         * Estructura: <destinoBase><prog>_PROJECTES/<YYYY_MM_DD>/<V*>
         * TOTS els artefactes del bloc viuen aquí dins (projecte, escaleta local,
         * MP4 del bloc, manifest, snapshots, anàlisi, SRT, renders) → cap bloc
         * barreja fitxers amb un altre.
         * @param {Object} ctx - {config, progData, dateDir, bloque} (State també val)
         * @returns {string} Ruta sense barra final (separador "/" entre els segments nous)
         */
        workFolder: function(ctx) {
            if (!ctx) return "";
            var rutas = (ctx.config && ctx.config.rutas) ? ctx.config.rutas : {};
            var progDir = (ctx.progData && ctx.progData.directorio) ? ctx.progData.directorio : "";
            var date = ctx.dateDir ? String(ctx.dateDir) : "";
            // El bloc ("V1", "V2"…) entra com a subdirectori de la carpeta de data.
            var bloc = ctx.bloque ? this.sanitizeName(ctx.bloque).replace(/\s+/g, "") : "";
            var out = String(rutas.destinoBase || "") + progDir + "/" + date;
            if (bloc) out += "/" + bloc;
            return out;
        },

        /**
         * jsxName: Nom d'ítem de projecte a punt per creuar el pont JSX.
         *
         * Les funcions JSX que RESOLEN un nom (`Clips.insert`, `Project.find`…) fan
         * `decodeURIComponent(itemName)` (vegeu 6_Clips.jsx). ExtendScript llança
         * «Bad or invalid URI» si el nom porta un `%` literal (p.ex. un rètol
         * «…in_Crèdits al 0% d'int…») i LA CRIDA FALLA EN SILENCI.
         * (2026-10-08) Cas real TNM V3: el wott amb `%` no s'inseria mai → el congelat
         * del TITOLET capturava el frame del PROGRAMA (PNG de 524 KB en lloc de 35 KB).
         * S'escapa NOMÉS el `%` (`%25`): els accents ja viatgen com a \uXXXX i
         * decodeURIComponent no els toca.
         * @param {string} name
         * @returns {string}
         */
        jsxName: function(name) {
            return String(name == null ? "" : name).replace(/%/g, "%25");
        },

        escape: function(str) {
            if (!str) return "";
            // Escapem caràcters perillosos per a injecció en literals ExtendScript (ES3).
            // Els caràcters de control (\n \r \t) es converteixen a seqüències d'escapada
            // per evitar que trenquin el literal de string dins d'evalScript().
            // Les barres invertides i comilles simples també s'escapen.
            // (2026-09-23) NOMÉS ASCII: qualsevol caràcter no-ASCII (à, è, ç, ·, ’ …) s'envia
            // com a \uXXXX perquè ExtendScript no el corrompi en creuar el pont evalScript
            // (era la causa que el nom del projecte/seqüència perdés els caràcters catalans).
            return str
                .replace(/\\/g, "\\\\")
                .replace(/'/g, "\\'")
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t")
                .replace(/[\u0080-\uFFFF]/g, function (ch) {
                    var h = ch.charCodeAt(0).toString(16);
                    while (h.length < 4) { h = "0" + h; }
                    return "\\u" + h;
                });
        },

        delay: function(ms) { 
            return new Promise(resolve => setTimeout(resolve, ms)); 
        },

        getFormattedDate: function() {
            var d = new Date();
            var day = ("0" + d.getDate()).slice(-2);
            var month = ("0" + (d.getMonth() + 1)).slice(-2);
            var year = d.getFullYear();
            return year + "_" + month + "_" + day;
        },

        /**
         * getYesterdayDateDir: Retorna la data del dia natural anterior (YYYY_MM_DD).
         * MECÀNICA D'INICI (2026-09-04): usada pel Ctrl+clic (mode correcció) i Ctrl+FOTO.
         * @returns {string} Ex: "2026_09_06"
         */
        getYesterdayDateDir: function() {
            var d = new Date();
            d.setDate(d.getDate() - 1);
            var dd = ("0" + d.getDate()).slice(-2);
            var mm = ("0" + (d.getMonth() + 1)).slice(-2);
            return "" + d.getFullYear() + "_" + mm + "_" + dd;
        },

        /**
         * Valida que un dateDir (DD_MM_YYYY) estigui dins de la finestra
         * temporal permesa per a la cerca de projectes en directoris germans.
         *
         * Regles:
         *   - Sempre s'accepta el dia d'avui.
         *   - Sempre s'accepta ahir (l'editor pot necessitar obrir el projecte
         *     del dia anterior fins al dia següent).
         *   - Qualsevol data anterior (fa 2+ dies) es rebutja.
         *   - NO s'usa mtime del directori perquè no és fiable (s'actualitza
         *     amb auto-save, .lock, etc.).
         *
         * @param {string} dateDirStr - Data en format DD_MM_YYYY, ex: "26_05_2026"
         * @returns {boolean} true si la data està dins de la finestra permesa
         */
        isDateDirInTemporalWindow: function(dateDirStr) {
            if (!dateDirStr) return false;

            // Nomes s'accepten directoris d'avui o ahir (finestra de 22h implicita:
            // cada projecte viu al seu directori de data, i l'editor pot necessitar
            // obrir-lo fins al dia seguent). Qualsevol data anterior es rebutja.
            // NO usem dirMtime perque no es fiable (s'actualitza amb auto-save, locks...).
            // Format esperat: YYYY_MM_DD
            var parts = dateDirStr.split('_');
            if (parts.length !== 3) return false;
            var y = parseInt(parts[0], 10);
            var m = parseInt(parts[1], 10);
            var d = parseInt(parts[2], 10);
            if (isNaN(d) || isNaN(m) || isNaN(y)) return false;

            var dirDate = new Date(y, m - 1, d);
            var now = new Date();
            var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            var yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            var dirTime = dirDate.getTime();
            var accepted = (dirTime === today.getTime() || dirTime === yesterday.getTime());
            if (window.FASTPASS_UI && window.FASTPASS_UI.Utils) {
                window.FASTPASS_UI.Utils.log('🔒 [TemporalWindow] dir=' + dateDirStr + ' accepted=' + accepted, 'DEBUG');
            }
            return accepted;
        },

        /**
         * D7.5: Extreu la data d'emissió en format DD_MM_YYYY des del nom
         * d'un fitxer d'escaleta. És la FONT ÚNICA de dateDir.
         *
         * Format esperat del filename: TN_VESPRE_20260517_215504.json
         * Extrau el penúltim segment (YYYYMMDD) i el converteix a DD_MM_YYYY.
         *
         * @param {string} filename - Nom del fitxer (sense ruta), ex: "TN_VESPRE_20260517_215504.json"
         * @returns {string|null} Data en format DD_MM_YYYY, o null si no es pot extreure
         */
        extractDateFromEscaletaFilename: function(filename) {
            if (!filename) return null;
            var noExt = filename.replace(/\.json$/i, '');
            var parts = noExt.split('_');
            if (parts.length < 2) return null;
            var yyyymmdd = null;
            // Nou format: YYYYMMDD al segment [0]
            if (/^\d{8}$/.test(parts[0])) {
                yyyymmdd = parts[0];
            } else {
                // Fallback: format antic (data al penultim segment)
                var old = parts[parts.length - 2];
                if (old && old.length === 8 && /^\d{8}$/.test(old)) {
                    yyyymmdd = old;
                }
            }
            if (!yyyymmdd) return null;
            var dd = yyyymmdd.substring(6, 8);
            var mm = yyyymmdd.substring(4, 6);
            var yyyy = yyyymmdd.substring(0, 4);
            return yyyy + '_' + mm + '_' + dd;
        },

        /**
         * Extreu la data d'emissió en format YYYYMMDD (prefix) des del nom
         * d'un fitxer d'escaleta. S'usa per filtrar JSONs per data exacta.
         * @param {string} filename
         * @returns {string|null} "20260618" o null
         */
        extractDatePrefixFromFilename: function(filename) {
            if (!filename) return null;
            var noExt = filename.replace(/\.json$/i, '');
            var parts = noExt.split('_');
            if (parts.length >= 1 && /^\d{8}$/.test(parts[0])) {
                return parts[0];
            }
            return null;
        },

        /**
         * Converteix format "00.46" o "01.00" a segons (float).
         */
        timeToSeconds: function(tcStr) {
            if (!tcStr) return 0;
            const parts = tcStr.split('.');
            if (parts.length === 1) return parseFloat(parts[0]);
            const m = parseFloat(parts[0]) || 0;
            const s = parseFloat(parts[1]) || 0;
            return (m * 60) + s;
        },

        handleError: function(e, context) {
            this.log(`💥 [${context}] Error: ${e.message}`, "ERROR");
            this.status(`Error en ${context}`, "error");
        },

        status: function(msg, type) {
            const el = document.getElementById('estado');
            if (!el) return;
            el.innerText = msg;
            el.className = "status-" + (type || "debug");
        },

        updateUIState: function(state) {
            const main = document.getElementById('main-content');
            if (main) main.classList.toggle('busy', state === 'BUSY');
        },

        /**
         * 🛡️ SEGURETAT: Verifica si la seqüència activa en Premiere coincideix 
         * amb el context triat al panell.
         */
        validateActiveSequence: async function() {
            const state = window.FASTPASS_UI.State;
            const config = window.FASTPASS_UI.Config.get();
            const elProg = document.getElementById('programa');
            const elBloc = document.getElementById('bloc');
            
            if (!elProg || !elBloc) return true; // Fail-safe si no hi ha UI
            
            // Actualizar la secuencia activa desde Premiere
            const activeSeq = await this.refreshActiveSequence();
            
            const progKey = elProg.value;
            const blocVal = elBloc.value;
            
            // Si estem en una seqüència buida o NO n'hi ha cap de activa
            if (!activeSeq) {
                this.status("⚠️ Cap seqüència activa!", "error");
                return false;
            }

            // Validació per paraules clau (Tokens)
            // Busquem si el nom de la seqüència inclou el codi del programa i el bloc
            const progData = config.mapeoProgramas[progKey];
            const progFileName = progData ? progData.archivo : "";
            const progWott = progData ? progData.wott : "";
            
            const hasProg = activeSeq.indexOf(progFileName) !== -1 || activeSeq.indexOf(progWott) !== -1;
            const hasBloc = activeSeq.indexOf(blocVal) !== -1;

            if (!hasProg) {
                const msg = `⚠️ Sincronia Perduda! Estàs a '${activeSeq.substring(0,15)}...' però el panell diu ${progKey}`;
                this.status(msg, "error");
                this.log(msg, "WARN");
                return false;
            }
            // Opcional: advertir si el bloque no coincide pero no bloquear
            if (!hasBloc) {
                this.log(`⚠️ El bloque ${blocVal} no aparece en la secuencia activa. Continuando...`, "DEBUG");
            }

            return true;
        },

        /**
         * Obtiene el nombre de la secuencia activa desde Premiere y actualiza el estado.
         * @returns {Promise<string>} Nombre de la secuencia activa (vacío si no hay).
         */
        refreshActiveSequence: async function() {
            const state = window.FASTPASS_UI.State;
            try {
                const seqName = await this.callJSX("Context.activeSeq()");
                state.activeSequenceName = seqName && seqName.indexOf("ERROR") === -1 ? seqName : "";
                this.log(`🔍 Secuencia activa actualizada: ${state.activeSequenceName || "(ninguna)"}`, "DEBUG");
                return state.activeSequenceName;
            } catch (e) {
                this.log(`⚠️ Error al refrescar secuencia activa: ${e.message}`, "WARN");
                state.activeSequenceName = "";
                return "";
            }
        },

        /**
         * 🎯 focusV1: Torna el "clip objectiu" del panell a V1 (auto-selecció a V1).
         * Per què cal: `Anim.setMotionValues` (i els inserts/overwrites) acaben amb un toggle
         * de selecció intern; si l'últim clip SELECCIONAT és de V2/V3/V6/V7, el clip objectiu
         * del panell (Anim.sliderApply / Anim.modeInfo → _sliderTarget → Clips.getSelectedVideo,
         * que recorre les pistes d'abaix cap amunt) deixa de ser V1.
         * Tècnica (sense JSX nou): re-aplicar al clip de V1 els SEUS MATEIXOS valors de Motion
         * (getMotionValues → setMotionValues) → mateix estat visual, però V1 torna a quedar
         * seleccionat. Patró validat a DoblePantalla (2026-09-21).
         * @param {string} [tag]    - Etiqueta pel log (ex: "DoblePantalla", "Repartir").
         * @param {number} [refSec] - Segon de referència (p. ex. l'inici del clip tractat).
         *                            Si no es passa, s'usa el clip de V1 sota el CTI.
         * @returns {Promise<boolean>} true si el focus s'ha pogut restaurar a V1.
         */
        focusV1: async function(tag, refSec) {
            const t = tag || "FOCUS";
            try {
                let raw = null;
                if (typeof refSec === 'number' && isFinite(refSec)) {
                    raw = await this.callJSX(`Clips.at(1, ${(refSec + 0.1).toFixed(2)}, 'video')`);
                }
                if (!raw || raw === 'null') {
                    const cti = parseFloat(await this.callJSX('Timeline.get()') || '0');
                    raw = await this.callJSX(`Clips.at(1, ${cti.toFixed(2)}, 'video')`);
                }
                if (!raw || raw === 'null') {
                    this.log(`🎯 [${t}] focus V1: cap clip de V1 per seleccionar.`, "WARN");
                    return false;
                }
                const c1 = JSON.parse(raw);
                const mvRaw = await this.callJSX(`Anim.getMotionValues(1, ${c1.index})`);
                if (!mvRaw || String(mvRaw).indexOf('ERR') === 0) {
                    this.log(`🎯 [${t}] focus V1: sense valors de Motion a V1[${c1.index}] (${mvRaw}).`, "WARN");
                    return false;
                }
                const selAbans = await this.callJSX('Clips.getSelectedVideo()');
                const res = await this.callJSX(`Anim.setMotionValues(1, ${c1.index}, '${String(mvRaw).replace(/'/g, "\\'")}')`);
                await this.delay(150);
                const selDespres = await this.callJSX('Clips.getSelectedVideo()');
                this.log(`🎯 [${t}] focus → V1[${c1.index}] "${c1.name}" | toggle ${res} | clip objectiu: ${selAbans} → ${selDespres}`, "INFO");
                return true;
            } catch (eF) {
                this.log(`🎯 [${t}] focus V1: ${eF.message}`, "WARN");
                return false;
            }
        },

        /**
         * 🎯 targetOnlyV1: Deixa el TARGETING (autoselecció de pista) NOMÉS a V1 i A1.
         * Per què cal: `Tracks.target(1, true)` (que fan alguns fluxos) no desactiva les
         * altres pistes; si alguna operació (inserts amb ripple, `_limitarTargets`, etc.) les
         * ha deixat totes activades, Premiere queda amb "totes les pistes enfocades" i un
         * insert cauria a qualsevol pista. Aquí ho deixem determinista: V1 i A1 actius.
         * @param {string} [tag] - Etiqueta pel log (ex: "Col·locar").
         * @returns {Promise<boolean>}
         */
        targetOnlyV1: async function(tag) {
            const t = tag || "FOCUS";
            try {
                const nV = parseInt(await this.callJSX("Tracks.count('video')") || '0', 10) || 0;
                for (let i = 1; i <= nV; i++) {
                    await this.callJSX(`Tracks.target(${i}, ${i === 1}, 'video')`);
                }
                const nA = parseInt(await this.callJSX("Tracks.count('audio')") || '0', 10) || 0;
                for (let i = 1; i <= nA; i++) {
                    await this.callJSX(`Tracks.target(${i}, ${i === 1}, 'audio')`);
                }
                this.log(`🎯 [${t}] targeting → només V1 (de ${nV} pistes de vídeo) i A1 (de ${nA} d'àudio)`, "INFO");
                return true;
            } catch (eT) {
                this.log(`🎯 [${t}] targeting: ${eT.message}`, "WARN");
                return false;
            }
        },

        /**
         * applyGlobalOffsetSec: Aplica el desplaçament global de TC (tcOffset) a un valor en segons.
         * La deriva sistemàtica d'ingesta (ex: 12 frames ~0.48s) es corregeix centralitzadament
         * des de Profile.json > general.tcOffset.
         * @param {number} seconds - Valor en segons a corregir
         * @returns {number} - Valor corregit amb l'offset configurat
         */
        applyGlobalOffsetSec: function(seconds) {
            const cfg = window.FASTPASS_UI.Config.get();
            const offset = cfg.tcOffset || 0;
            if (offset !== 0) {
                this.log(`📐 [GLOBAL_OFFSET] Aplicant offset de ${offset}s a ${seconds.toFixed(3)}s → ${(seconds + offset).toFixed(3)}s`, "DEBUG");
            }
            return seconds + offset;
        },

        deleteFile: function(path) {
            try {
                const fs = window.cep.fs;
                // Normalizamos barras para Node/CEP
                const normalizedPath = path.replace(/\//g, '\\');
                const result = fs.unlink(normalizedPath);
                
                if (result.err === 0) {
                    this.log(`✅ Arxiu eliminat del NAS: ${normalizedPath}`, "DEBUG");
                    return true;
                } else {
                    this.log(`⚠️ No s'ha pogut esborrar (Error ${result.err}): ${normalizedPath}`, "DEBUG");
                    return false;
                }
            } catch(e) { 
                return false; 
            }
        },

        /**
         * _fsWipe: modul PUR d'esborrat d'arbres (js/logic/19_Fs_Wipe.js).
         * @returns {Object|null} FsWipe o null si no s'ha carregat
         */
        _fsWipe: function() {
            return (window.FASTPASS_UI && window.FASTPASS_UI.Logic && window.FASTPASS_UI.Logic.FsWipe) || null;
        },

        /**
         * _wipeFs: tria el MOTOR d'esborrat disponible.
         *
         * (2026-10-22 · #180) En este equip el panell NO te Node.js: el manifest
         * no declara `--enable-nodejs`, aixi que `wipeFolder` responia SENSE-NODE
         * → el RESET no esborrava RES (només ho escrivia al log) i s'aturava
         * abans de recrear el projecte. `cep.fs` és natiu de CEP i sempre hi és,
         * aixi que s'usa com a motor amb la MATEIXA semantica
         * (readdirSync/lstatSync/unlinkSync/rmdirSync).
         * (2026-10-29) Fora la branca Node: només existeix el motor `cep.fs`.
         * @returns {{fs:Object|null, kind:string}} kind: 'cep.fs' | 'cap'
         */
        _wipeFs: function() {
            var mod = this._fsWipe();
            var alt = (mod && typeof mod.cepFs === 'function') ? mod.cepFs() : null;
            if (alt) return { fs: alt, kind: 'cep.fs' };
            return { fs: null, kind: 'cap' };
        },

        /**
         * isInsideFolder: cert NOMES si `child` es DINS de `base` (mai igual ni germa).
         * (2026-10-21 · RESET absolut) Guarda de seguretat ABANS d'esborrar: el
         * RESET nomes pot tocar la carpeta del bloc, no la de la data, la del
         * programa ni l'arrel de projectes.
         * @param {string} child
         * @param {string} base
         * @returns {boolean}
         */
        isInsideFolder: function(child, base) {
            var mod = this._fsWipe();
            if (mod) return mod.isInside(child, base);
            var c = String(child || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
            var b = String(base || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
            if (!c || !b || c === b) return false;
            return c.indexOf(b + '\\') === 0;
        },

        /**
         * _b64utf16: codifica un text com a base64 de UTF-16LE.
         *
         * PER QUE (2026-10-22 · #180): `cep.process` no passa per cap shell i no
         * garanteix com s'entrecomillen els arguments, i les rutes d'este flux
         * porten espais, accents i prefix UNC (`\\srv\share\...`). Amb
         * `-EncodedCommand` el guio viatja com a base64 (sense espais ni
         * cometes), aixi que el transport no pot trencar la comanda.
         * @param {string} s
         * @returns {string} '' si el navegador no te `btoa`
         */
        _b64utf16: function(s) {
            var txt = String(s == null ? '' : s);
            if (typeof window.btoa !== 'function') return '';
            var bin = '';
            for (var i = 0; i < txt.length; i++) {
                var c = txt.charCodeAt(i);
                bin += String.fromCharCode(c & 0xFF) + String.fromCharCode((c >> 8) & 0xFF);
            }
            try { return window.btoa(bin); } catch (e) { return ''; }
        },

        /**
         * _rmTreeProc: esborra un ARBRE de carpetes des de la capa JS, sense JSX.
         *
         * PER QUE (2026-10-22 · #180): `cep.fs` no te `rmdir` (nomes `deleteFile`),
         * aixi que per si sol no pot llevar carpetes; i el manifest no porta
         * `--enable-nodejs`, aixi que tampoc hi ha `fs.rmSync`. Pero `cep.process`
         * es l'API NATIVA de CEP (CEP 10+, sense Node) i el projecte ja la fa
         * servir per a `pick_folder.ps1` (setup.html) i `manage_prproj.ps1`
         * (10_Srt_Logic.js). Amb ella llancem PowerShell, que si que esborra
         * arbres sencers ([IO.Directory]::Delete, natiu, i `Remove-Item -Recurse -Force` de recanç; inclou fitxers de nomes
         * lectura, ocults i de sistema) i NO bloqueja la UI del panell.
         *
         * @param {string} path - ruta completa (es normalitza abans)
         * @returns {Promise<{started:boolean, pid:number, why:string}>}
         */
        _rmTreeProc: async function(path) {
            var p = String(path == null ? '' : path);
            if (!p) return { started: false, pid: 0, why: 'ruta buida' };
            var cep = window.cep || window.__adobe_cep__ || null;
            if (!cep || !cep.process || typeof cep.process.createProcess !== 'function') {
                return { started: false, pid: 0, why: 'sense cep.process' };
            }
            var psExe = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
            // Comilla simple de PowerShell: es redobla.
            var q = p.replace(/['\u2019]/g, "''");

            // Rastre del guió (quin intent falla i per què) → arrel de l'extensió,
            // que sempre és escrivible; si no es resol, $env:TEMP. Es llig a
            // `_logWipeTrace()` quan la via nativa acaba amb restes.
            var traceRoot = this._extRoot();
            var tracePath = traceRoot ? (traceRoot + '\\_wipe_trace.log') : '';
            var tq = traceRoot ? traceRoot.replace(/['\u2019]/g, "''") : '';

            // (2026-11-09 · #253 · 2a passada) EL BORRAT VA TOT DINS DEL MATEIX
            // PROCÉS DE POWERSHELL, AMB REINTENTS ACTIUS. Per què (log del 09/11,
            // RESET d'un bloc d'AHIR al NAS: `Tancament 863 ms · esborrat 60 166 ms`):
            // `_waitGone` mirava el disc durant 60 s SENSE TORNAR A PROVAR
            // l'esborrat; el fitxer que havia quedat (el `.prproj` encara agafat per
            // Premiere o pel client SMB) no es reintentava fins a esgotar el marge,
            // i aleshores la passada entrada per entrada l'esborrava AL PRIMER
            // intent. Eren 60 s tirats.
            // ARA el guió fa 12 intents cada 600 ms (≈7 s) i acaba AIXÍ QUE la
            // carpeta desapareix: `[IO.Directory]::Delete` (natiu, un sol recorregut)
            // → `attrib -R -S -H` només als intents 2 i 6 (recanç per a fitxers de
            // només lectura) → `Remove-Item -Recurse -Force` com a últim recurs.
            // I deixa un rastre (`_wipe_trace.log`, UTF-8 SENSE BOM) amb el motiu
            // EXACTE de cada intent fallit: així se sap QUIN fitxer bloqueja.
            var trace = tracePath ? ("'" + tq + "'") : "($env:TEMP + '\\fp_wipe_trace.log')";
            var script = "$ErrorActionPreference='SilentlyContinue';" +
                "$p='" + q + "';" +
                "$t=" + trace + ";" +
                "[IO.File]::WriteAllText($t, ('inici ' + (Get-Date -Format o) + [Environment]::NewLine));" +
                "for($i=1; $i -le 12; $i++){" +
                    "if(-not (Test-Path -LiteralPath $p)){ break };" +
                    "try{[IO.Directory]::Delete($p,$true)}catch{ [IO.File]::AppendAllText($t, ('intent ' + $i + ' : ' + $_.Exception.Message + [Environment]::NewLine)) };" +
                    "if(-not (Test-Path -LiteralPath $p)){ break };" +
                    "if($i -eq 2 -or $i -eq 6){ attrib -R -S -H ($p+'\\*.*') /S /D 2>$null | Out-Null };" +
                    "Start-Sleep -Milliseconds 600" +
                "};" +
                "if(Test-Path -LiteralPath $p){ Remove-Item -LiteralPath $p -Recurse -Force 2>$null };" +
                "[IO.File]::AppendAllText($t, ('fi ' + (Get-Date -Format o) + ' queda=' + (Test-Path -LiteralPath $p) + [Environment]::NewLine))";
            var enc = this._b64utf16(script);
            if (!enc) return { started: false, pid: 0, why: 'sense btoa' };
            var r = null;
            try {
                r = cep.process.createProcess(psExe,
                    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                    '-WindowStyle', 'Hidden', '-EncodedCommand', enc);
            } catch (e) {
                return { started: false, pid: 0, why: String((e && e.message) || e) };
            }
            if (!r || typeof r.data !== 'number' || r.data <= 0) {
                return { started: false, pid: 0, why: 'createProcess err=' + ((r && r.err) != null ? r.err : '?') };
            }
            this.log('🧹 [FS] PowerShell esborrant l\'arbre (pid ' + r.data + '): ' + p, 'DEBUG');
            return { started: true, pid: r.data, why: '' };
        },

        /**
         * _waitGone: espera (sense bloquejar) que `path` desaparega del disc.
         * Es la VERIFICACIO de la via `_rmTreeProc`: `cep.process` no dona codi
         * d'eixida, aixi que l'exit es comprova al sistema de fitxers.
         * @param {Object} mod - FsWipe
         * @param {Object} fs - motor (cep.fs / Node)
         * @param {string} path
         * @param {number} ms - temps maxim d'espera
         * @returns {Promise<boolean>} true si ja no hi es
         */
        _waitGone: async function(mod, fs, path, ms) {
            var limit = Math.max(0, Number(ms) || 0);
            var t0 = Date.now();
            for (;;) {
                try { if (!mod.exists(fs, path)) return true; } catch (e) { /* reintenta */ }
                if (Date.now() - t0 >= limit) return false;
                await this.delay(250);
            }
        },

        /**
         * _logWipeTrace: bufa al log el rastre del guió d'esborrat natiu
         * (`_wipe_trace.log`, vegeu `_rmTreeProc`). S'usa quan la via nativa es
         * queda amb restes: diu QUIN intent falla i amb quin error, o siga quin
         * fitxer bloqueja (Premiere, client SMB) i per què — sense endevinar.
         */
        _logWipeTrace: function() {
            try {
                var root = this._extRoot();
                var cep = window.cep || window.__adobe_cep__ || null;
                if (!root || !cep || !cep.fs || typeof cep.fs.readFile !== 'function') return;
                var r = cep.fs.readFile(root + '\\_wipe_trace.log');
                if (!r || (r.err && r.err !== 0)) return;
                var lines = String(r.data || '').split(/\r?\n/);
                var n = 0;
                for (var i = 0; i < lines.length && n < 6; i++) {
                    var ln = String(lines[i] || '').replace(/^\s+|\s+$/g, '');
                    if (!ln) continue;
                    this.log('   · rastre esborrat: ' + ln, 'WARN');
                    n++;
                }
            } catch (e) { }
        },

        /**
         * _extRoot: carpeta REAL de l'extensió (sense barra final) o '' si no es
         * pot resoldre. Mateix mètode que `_ensureExtLogPath`.
         * @returns {string}
         */
        _extRoot: function() {
            try {
                if (this.csInterface && typeof SystemPath !== 'undefined' && SystemPath.EXTENSION) {
                    var p = this.csInterface.getSystemPath(SystemPath.EXTENSION);
                    if (p) return String(p).replace(/[\\/]+$/, '');
                }
            } catch (e) { }
            return '';
        },

        /**
         * _hiddenRunner: ruta de `bin\hidden.vbs` (llançador ocult). Es prova la
         * ruta nativa de l'extensió i, si no, la de la pàgina. NO es desa un
         * resultat negatiu: si CEP encara no estava a punt, la propera crida ho
         * torna a provar.
         * @returns {string} '' si no s'ha trobat
         */
        _hiddenRunner: function() {
            if (this._hiddenRunnerPath) return this._hiddenRunnerPath;
            var cands = [];
            var ext = this._extRoot();
            if (ext) cands.push(ext + '\\bin\\hidden.vbs');
            try {
                var href = window.location.href;
                var qi = href.indexOf('/index.html');
                if (qi > 0) {
                    var p = decodeURIComponent(href.substring(0, qi));
                    if (p.indexOf('file:///') === 0) p = p.substring(8);
                    cands.push(p.replace(/\//g, '\\') + '\\bin\\hidden.vbs');
                }
            } catch (eH) { }
            var fs = window.cep && window.cep.fs;
            if (fs && fs.stat) {
                for (var i = 0; i < cands.length; i++) {
                    try {
                        var st = fs.stat(cands[i]);
                        if (st && st.err === 0) { this._hiddenRunnerPath = cands[i]; return cands[i]; }
                    } catch (eS) { }
                }
            }
            return '';
        },

        /**
         * _tempDir: carpeta per als fitxers de `execHidden` (.txt / .exit).
         * Primer `Folder.temp` del sistema (l'única que sempre existix i sempre
         * es pot escriure) i, si no, `C:\temp` (la que ja usa el flux de ffmpeg).
         * Es comprova ESCREVINT: `cep.fs` no dona cap manera de saber-ho abans.
         * @returns {Promise<string>} '' si no n'hi ha cap d'escrivible
         */
        _tempDir: async function() {
            if (this._hiddenTempDir) return this._hiddenTempDir;
            var fs = window.cep && window.cep.fs;
            if (!fs || !fs.writeFile) return '';
            var cands = [];
            try {
                var t = String(await this.callJSX('Folder.temp.fsName') || '');
                if (t && t.indexOf('ERR') !== 0 && t.indexOf('/') !== 0) cands.push(t.replace(/[\\/]+$/, ''));
            } catch (eT) { }
            cands.push('C:\\temp');
            for (var i = 0; i < cands.length; i++) {
                var probe = cands[i] + '\\fp_probe_' + Date.now() + '.tmp';
                try {
                    var w = fs.writeFile(probe, 'ok');
                    if (w && w.err === 0) {
                        try { fs.deleteFile(probe); } catch (eD) { }
                        this._hiddenTempDir = cands[i];
                        return cands[i];
                    }
                } catch (eW) { }
                // `C:\temp` pot no existir en un equip nou: es prova de crear.
                try {
                    if (fs.makedir) {
                        fs.makedir(cands[i]);
                        var w2 = fs.writeFile(probe, 'ok');
                        if (w2 && w2.err === 0) {
                            try { fs.deleteFile(probe); } catch (eD2) { }
                            this._hiddenTempDir = cands[i];
                            return cands[i];
                        }
                    }
                } catch (eM) { }
            }
            return '';
        },

        /**
         * _readNum: llig un fitxer i en trau el primer enter ('' → null).
         * S'usa per llegir el `.exit` que deixa `bin\hidden.vbs`.
         * @param {string} path
         * @returns {number|null}
         */
        _readNum: function(path) {
            try {
                var fs = window.cep && window.cep.fs;
                if (!fs || !fs.readFile) return null;
                var r = fs.readFile(path);
                if (!r || r.err !== 0 || r.data == null) return null;
                var s = String(r.data).replace(/[^\-0-9]/g, '');
                if (!s || s === '-') return null;
                var n = parseInt(s, 10);
                return isFinite(n) ? n : null;
            } catch (e) { return null; }
        },

        /**
         * execHidden: executa una comanda de sistema SENSE finestra de consola.
         *
         * PER QUE (2026-11-02 · O-B1): `IO.executeShell` (jsx/modules/2_IO.jsx)
         * escriu un .bat i el llança amb `File.execute()`, que SEMPRE obri una
         * finestra de CMD. Amb 30 clips són 30 finestres tapant el panell.
         * Ací es llança `wscript.exe //nologo //B bin\hidden.vbs <cmd.txt> <exit>`
         * amb `cep.process.createProcess` (l'API nativa de CEP que ja fa servir
         * setup.html per a pick_folder.ps1): wscript és una app GUI (no crea
         * consola) i el seu `sh.Run(cmd, 0, True)` engega cmd.exe amb finestra 0 i
         * en RETORNA el codi d'eixida. Mesurat en este equip: ~250 ms per llancada
         * i 0 finestres (PowerShell ocult, la via del #180, en costa ~800).
         *
         * AUTOPROVEÏDORA: la primera crida de la sessió llança una comanda trivial
         * (`echo fp_ok`) pel MATEIX camí (mateix .vbs, mateixa carpeta temporal) i,
         * si no torna cap codi, deixa la via oculta DESACTIVADA. Així, si algun dia
         * `cep.process`, `wscript` o una ruta amb espais fallen en un equip, no es
         * queda un flux penjat 3 minuts: es va pel camí antic i punt.
         *
         * @param {string} command - comanda tal com aniria dins del .bat
         * @param {Object} [opts] - { timeoutMs=180000, intervalMs=80, keepFiles=false }
         * @returns {Promise<{ok:boolean, started:boolean, code:number, mode:string,
         *                    err:string, timedOut:boolean, ms:number, tag:string}>}
         *   `started:false` = NO s'ha pogut llançar → el cridador ha de fer servir
         *   la via antiga (IO.executeShell) perquè res deixe de funcionar.
         *   `mode:'hidden'` = el procés JA ha acabat quan torna la promesa.
         */
        execHidden: async function(command, opts) {
            if (this._hiddenOk === false) {
                return { ok: false, started: false, code: -1, mode: 'cap', err: 'via oculta desactivada', timedOut: false, ms: 0, tag: '' };
            }
            if (this._hiddenOk === null) {
                // 1a crida de la sessió: prova d'encesa pel camí real.
                var probe = await this._runHiddenOnce('echo fp_ok', { timeoutMs: 15000, silent: true });
                this._hiddenOk = !!(probe.started && !probe.timedOut);
                this.log(this._hiddenOk
                    ? '🖥️ [EXEC ocult] actiu (' + probe.ms + ' ms via ' + (probe.via || '?') + ')'
                    : '⚠️ [EXEC ocult] DESACTIVAT (' + (probe.err || '?') + ') → es llançarà amb IO.executeShell (amb finestra de CMD)', this._hiddenOk ? 'INFO' : 'WARN');
                if (!this._hiddenOk) {
                    return { ok: false, started: false, code: -1, mode: 'cap', err: probe.err || 'prova KO', timedOut: false, ms: probe.ms, tag: '' };
                }
            }
            return await this._runHiddenOnce(command, opts);
        },

        /**
         * _wscriptExe: ruta ABSOLUTA de `wscript.exe`, o '' si no hi és.
         *
         * PER QUE (2026-11-02 · #213): `cep.process.createProcess` NO busca res
         * al PATH: amb `'wscript.exe'` a seques torna `err=3`
         * (ERROR_PATH_NOT_FOUND) i la crida queia al camí vell
         * (`IO.executeShell` → finestra de CMD). Es va vore al log del panell:
         *   «[shell] execHidden no disponible (createProcess err=3)»
         * → cada ffmpeg/ffprobe/OCR obria la seua finestra damunt de Premiere,
         * i el clipeig del MP4 (6-30 s de ffmpeg) era la més cantada.
         * @returns {string}
         */
        _wscriptExe: function() {
            var cands = [
                'C:\\Windows\\System32\\wscript.exe',
                'C:\\Windows\\SysWOW64\\wscript.exe'
            ];
            var fs = window.cep && window.cep.fs;
            if (!fs || !fs.stat) return '';
            for (var i = 0; i < cands.length; i++) {
                try {
                    var st = fs.stat(cands[i]);
                    if (st && st.err === 0) return cands[i];
                } catch (eW) { }
            }
            return '';
        },

        /**
         * _psHiddenPayload: script PowerShell (base64 UTF-16LE) que executa la
         * comanda del `.txt` i deixa el codi d'eixida al `.exit`.
         *
         * És la VIA B de `_runHiddenOnce`: la recepta del #180 (la de
         * l'esborrat de l'arbre, `_rmTreeProc`) però amb el MATEIX contracte
         * `.txt`/`.exit` que `bin\hidden.vbs`, així el bucle d'espera és el
         * mateix. Costa ~800 ms perquè arranca PowerShell sencer, però és
         * preferible a caure al `.bat` visible si `bin\hidden.vbs` no hi és.
         *
         * La comanda es llig del fitxer (no viatja per la línia de comandes) i
         * s'executa amb `cmd.exe /d /s /c`: /d evita l'AutoRun i /s lleva només
         * la primera i l'última cometa, així una comanda que comence per cometa
         * (`"C:\Program Files\...\ffmpeg.exe" -i ...`) arriba intacta.
         * @param {string} cmdFile
         * @param {string} exitFile
         * @returns {string} base64 ('' si no hi ha btoa)
         */
        _psHiddenPayload: function(cmdFile, exitFile) {
            var q = function(s) { return String(s == null ? '' : s).replace(/'/g, "''"); };
            var ps = "$ErrorActionPreference='Continue';" +
                "$c='';" +
                "try{$c=[IO.File]::ReadAllText('" + q(cmdFile) + "',[Text.Encoding]::UTF8)}catch{};" +
                "$c=$c.Trim();" +
                "$code=-1;" +
                "if($c){& cmd.exe /d /s /c $c; if($LASTEXITCODE -ne $null){$code=$LASTEXITCODE}};" +
                "try{[IO.File]::WriteAllText('" + q(exitFile) + "',[string]$code)}catch{}";
            return this._b64utf16(ps);
        },

        /**
         * _runHiddenOnce: cos de `execHidden` (una llancada). No la crides directament
         * llevat de l'autoproveïdora.
         * @param {string} command
         * @param {Object} [opts] - { timeoutMs, intervalMs, keepFiles, silent }
         */
        _runHiddenOnce: async function(command, opts) {
            var o = opts || {};
            var t0 = Date.now();
            var res = { ok: false, started: false, code: -1, mode: 'cap', err: '', timedOut: false, ms: 0, tag: '', via: '' };
            var cmd = String(command == null ? '' : command).trim();
            if (!cmd) { res.err = 'comanda buida'; return res; }
            var cep = window.cep || window.__adobe_cep__ || null;
            var fs = cep && cep.fs;
            if (!cep || !cep.process || typeof cep.process.createProcess !== 'function' || !fs || !fs.writeFile) {
                res.err = 'sense cep.process/cep.fs';
                return res;
            }
            var runner = this._hiddenRunner();
            // ⚠️ (2026-11-02 · #213) Sense `bin\hidden.vbs` NO s'abandona: la VIA B
            // (PowerShell ocult) no el necessita, i abandonar ací era justament el
            // que deixava la finestra de CMD quan el .vbs no es trobava.
            var dir = await this._tempDir();
            if (!dir) { res.err = 'sense carpeta temporal escrivible'; return res; }

            var tag = 'fp_exec_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
            var cmdFile = dir + '\\' + tag + '.txt';
            var exitFile = dir + '\\' + tag + '.exit';
            res.tag = tag;
            try { fs.deleteFile(exitFile); } catch (eD0) { }
            var w = null;
            try { w = fs.writeFile(cmdFile, cmd); } catch (eW) { w = { err: -1 }; }
            if (!w || w.err !== 0) { res.err = 'no s\'ha pogut escriure ' + cmdFile; return res; }

            // ⚠️ `cep.process.createProcess` es crida VARIÀDIC (un argument per token),
            // que és com ho fa setup.html amb pick_folder.ps1: passar una sola cadena
            // amb espais la deixa com UN argument i wscript no trobaria el .vbs.
            // ⚠️⚠️ I l'EXECUTABLE VA AMB RUTA ABSOLUTA (#213): `cep.process` no
            // busca al PATH i `'wscript.exe'` a seques torna err=3.
            var ws = this._wscriptExe();
            var r = null;
            var whyA = '';
            if (ws && runner) {
                try { r = cep.process.createProcess(ws, '//nologo', '//B', runner, cmdFile, exitFile); } catch (eC) { r = { err: String((eC && eC.message) || eC) }; }
                if (!r || (r.err != null && r.err !== 0)) {
                    whyA = 'wscript err=' + ((r && r.err != null) ? r.err : '?');
                    r = null;
                } else {
                    res.via = 'wscript';
                }
            } else {
                whyA = 'wscript.exe no trobat';
            }

            // ── VIA B (reserva): PowerShell OCULT (`-WindowStyle Hidden` + base64)
            // Mateix contracte `.txt`/`.exit` que bin\hidden.vbs. Només s'usa si la
            // via A no està disponible: així mai es cau al .bat visible.
            if (!r) {
                var enc = this._psHiddenPayload(cmdFile, exitFile);
                var psExe = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
                if (!enc) {
                    res.err = whyA + ' · sense btoa';
                    try { fs.deleteFile(cmdFile); } catch (eD1a) { }
                    return res;
                }
                try {
                    r = cep.process.createProcess(psExe,
                        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                        '-WindowStyle', 'Hidden', '-EncodedCommand', enc);
                } catch (eP) { r = { err: String((eP && eP.message) || eP) }; }
                if (!r || (r.err != null && r.err !== 0)) {
                    res.err = whyA + ' · powershell err=' + ((r && r.err != null) ? r.err : '?');
                    try { fs.deleteFile(cmdFile); } catch (eD1b) { }
                    return res;
                }
                res.via = 'powershell';
            }
            res.started = true;
            res.mode = 'hidden';

            // Espera el `.exit`: el fitxer es crea BUID i s'ompli tot seguit, així
            // que una lectura sense número només vol dir «encara no».
            var timeoutMs = Number(o.timeoutMs) > 0 ? Number(o.timeoutMs) : 180000;
            var iv = Number(o.intervalMs) > 0 ? Number(o.intervalMs) : 80;
            var code = null;
            var tw = Date.now();
            for (;;) {
                code = this._readNum(exitFile);
                if (code !== null) break;
                if (Date.now() - tw >= timeoutMs) break;
                await this.delay(iv);
            }
            res.ms = Date.now() - t0;
            if (code === null) {
                res.timedOut = true;
                res.code = -2;
                res.err = 'timeout ' + Math.round(timeoutMs / 1000) + 's';
            } else {
                res.code = code;
                res.ok = (code === 0);
                if (!res.ok) res.err = 'exit=' + code;
            }
            if (!o.keepFiles) {
                try { fs.deleteFile(exitFile); } catch (eD2) { }
                try { fs.deleteFile(cmdFile); } catch (eD3) { }
            }
            // B5: res passa en silenci — al log del panell sempre hi ha una línia.
            // (`silent` només el fa servir l'autoproveïdora, que ja logueja el resultat.)
            var shortCmd = String(cmd).replace(/\s+/g, ' ').substring(0, 140);
            if (!res.ok) {
                this.log('⚠️ [EXEC ocult] ' + res.err + ' (' + res.ms + ' ms via ' + (res.via || '?') + ') · ' + shortCmd, 'WARN');
            } else if (!o.silent) {
                this.log('🖥️ [EXEC ocult] exit=0 · ' + res.ms + ' ms via ' + (res.via || '?') + ' · ' + shortCmd, 'DEBUG');
            }
            return res;
        },

        /**
         * wipeFolder: ESBORRAT ABSOLUT i VERIFICAT d'una carpeta (recursiu).
         *
         * (2026-10-21) Substitueix el vell `deleteFolder` per a operacions que NO
         * poden deixar restes (RESET GENERAL). Diferencies:
         *   · Esborra ENTRADA per ENTRADA tolerant errors (un fitxer bloquejat no
         *     atura la resta) i reintenta l'arbre fins a 4 vegades: Premiere
         *     allibera el .prproj i l'Auto-Save un instant despres de tancar.
         *   · VERIFICA al final: `ok` nomes es true si la carpeta ja no hi es.
         *   · Retorna un informe amb `leftovers` per poder avisar l'usuari i
         *     AVORTAR en lloc de crear el projecte nou sobre les restes.
         * (2026-10-22 · #180) PRIMER la via nativa `cep.process` (PowerShell,
         * sense Node i SENSE JSX): un sol procés lleva l'arbre sencer, tambe les
         * carpetes (que `cep.fs` no pot llevar: no te `rmdir`) i els fitxers de
         * nomes lectura. Si no arranca o deixa restes, es fa la passada ENTRADA
         * per ENTRADA amb `cep.fs` (o Node) i es torna a verificar.
         * @param {string} path - Carpeta a esborrar
         * @param {Object} [opts] - {maxAttempts, waitMs, fs, procWaitMs} (fs = doble de prova)
         * @returns {Promise<{ok:boolean, path:string, attempts:number, removed:number,
         *                    files:number, dirs:number, failed:Array, leftovers:string[],
         *                    reason:string, via:string}>}
         */
        wipeFolder: async function(path, opts) {
            var o = opts || {};
            var pick = o.fs ? { fs: o.fs, kind: 'prova' } : this._wipeFs();
            var fs = pick.fs;
            var mod = this._fsWipe();
            var self = this;
            if (!mod) {
                this.log('❌ [FS] FsWipe no carregat (js/logic/19_Fs_Wipe.js): esborrat avortat', 'ERROR');
                return { ok: false, path: String(path || ''), attempts: 0, removed: 0, files: 0, dirs: 0, failed: [], leftovers: [], reason: 'SENSE-MODUL', via: '' };
            }
            var norm = mod.norm(path);
            // ── 1) VIA NATIVA (JS pur): `cep.process` + PowerShell ─────────────
            // Un doble de prova (`o.fs`) NO ha de llançar processos: els tests han
            // de ser deterministes i no tocar el disc de debò.
            if (!o.fs && norm && mod.canRemove(fs) && mod.exists(fs, norm)) {
                var tProc = Date.now();
                var pr = await this._rmTreeProc(norm);
                if (pr.started) {
                    // (2026-11-09 · #253) Marge pensat per a arbres grans al NAS: si
                    // s'esgota, es passa a la passada entrada per entrada MENTRES el
                    // procés encara esborra, que és el pitjor dels mons. La via
                    // nativa retorna només `pid` (cep.process no dóna codi d'eixida),
                    // així que l'exit es comprova al disc cada 250 ms i s'ix de seguida.
                    var gone = await this._waitGone(mod, fs, norm, (o.procWaitMs != null ? o.procWaitMs : 30000));   // 30 s (#253): només compta si el borrat FALLA. Els reintents del fitxer que queda (Premiere/SMB) els fa el guió de `_rmTreeProc` (12 intents × 600 ms), no esta espera
                    if (gone) {
                        this.log('🗑️ [FS] Carpeta esborrada (motor cep.process/PowerShell, ' +
                            (Date.now() - tProc) + ' ms): ' + norm, 'DEBUG');
                        return {
                            ok: true, path: norm, attempts: 1, removed: 0, files: 0, dirs: 0,
                            failed: [], leftovers: [], reason: 'ESBORRADA', via: 'proc'
                        };
                    }
                    this.log('⚠️ [FS] El procés de esborrat ha deixat restes (' + (Date.now() - tProc) +
                        ' ms): es reintenta entrada per entrada (' + norm + ')', 'WARN');
                    // (2026-11-09 · #253) Diu QUIN fitxer bloqueja i amb quin error.
                    if (typeof this._logWipeTrace === 'function') { this._logWipeTrace(); }
                } else if (pr.why) {
                    this.log('ℹ️ [FS] Via nativa no disponible (' + pr.why + '): esborrat amb ' + pick.kind, 'DEBUG');
                }
            }
            // ── 2) PASADA ENTRADA per ENTRADA (cep.fs / Node) + reintents ──────
            var rep = await mod.wipe(fs, path, {
                maxAttempts: o.maxAttempts,
                waitMs: o.waitMs,
                delay: function(ms) { return self.delay(ms); }
            });
            rep.via = pick.kind;
            if (rep.reason === 'SENSE-NODE') {
                this.log("❌ [FS] Cap motor d'esborrat (cep.fs): no es pot esborrar " + rep.path, 'ERROR');
                return rep;
            }
            if (rep.ok) {
                if (rep.reason === 'ESBORRADA') {
                    this.log('🗑️ [FS] Carpeta esborrada (' + rep.files + ' fitxers, ' + rep.dirs + ' carpetes; intent ' + rep.attempts +
                        '; motor ' + pick.kind + '): ' + rep.path, 'DEBUG');
                }
            } else if (rep.reason === 'RESTES') {
                this.log("❌ [FS] NO s'ha pogut esborrar del tot (" + rep.attempts + ' intents, ' + rep.failed.length +
                    ' errors; motor ' + pick.kind + '): ' + rep.path, 'ERROR');
                for (var i = 0; i < rep.leftovers.length && i < 20; i++) {
                    this.log('   · resta: ' + rep.leftovers[i], 'ERROR');
                }
            }
            return rep;
        },

        /**
         * deleteFolder: Esborra una carpeta sencera (recursiu) del NAS/local.
         * (2026-10-07, revisat 2026-10-21) Usa el modul FsWipe: esborrat entrada
         * per entrada, tolerant errors. Per a operacions que NO poden deixar
         * restes cal usar `wipeFolder` (verifica i informa).
         * (2026-10-22 · #180 · 2026-10-29) Motor ÚNIC: l'adaptador `cep.fs`
         * (natiu de CEP) — abans, sense Node, ací no s'esborrava res.
         * No llança: retorna false si queda alguna resta (lock, xarxa...).
         * @param {string} path - Ruta completa de la carpeta a esborrar
         * @returns {boolean} true si s'ha esborrat (o ja no existia)
         */
        deleteFolder: function(path) {
            var mod = this._fsWipe();
            if (!mod) {
                this.log('⚠️ [FS] FsWipe no carregat: no es pot esborrar la carpeta ' + path, 'WARN');
                return false;
            }
            var norm = mod.norm(path);
            if (!norm) return false;
            var pick = this._wipeFs();
            var fs = pick.fs;
            if (!mod.canRemove(fs)) {
                this.log("⚠️ [FS] Cap motor d'esborrat (Node fs ni cep.fs): no es pot esborrar la carpeta " + norm, 'WARN');
                return false;
            }
            if (!mod.exists(fs, norm)) return true;
            var acc = { removed: 0, files: 0, dirs: 0, failed: [] };
            mod.removeTree(fs, norm, acc);
            if (!mod.exists(fs, norm)) {
                this.log('🗑️ [FS] Carpeta eliminada (' + acc.files + ' fitxers, ' + acc.dirs + ' carpetes): ' + norm, 'DEBUG');
                return true;
            }
            this.log("⚠️ [FS] No s'ha pogut esborrar del tot la carpeta " + norm + ' (' + acc.failed.length + ' errors, queden restes)', 'WARN');
            return false;
        }

    };
})();
