/**
 * ============================================================================
 * SRT EDITOR: Pseudotimeline dins l'extensió
 * Renderitza: regle de temps + 1 track (captions) + waveform (baix)
 * Permet: IN, OUT, AJUSTAR, zoom, PLAY/PAUSA, preview text net
 * Exporta: PROJECTE_MOD.srt → import → createCaptionTrack
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Editor = FASTPASS_UI.Editor || {};

    const getUtils = () => window.FASTPASS_UI.Utils;
    const log = (m) => getUtils().log(m, "DEBUG");
    const callJSX = (s) => getUtils().callJSX(s);

    FASTPASS_UI.Editor.SrtEditor = {

        _entries: [],
        _loadedEntries: [],
        _originalEntries: [],
        _pixelsPerSec: 20,
        _maxSec: 120,
        _rulerHeight: 18,
        // Disposició compacta superposada: la WF és el FONS de la zona de treball i
        // els clips de subtítols hi queden superposats (semitransparents). Així es
        // suprimeix la franja separada de clips → timeline més baix.
        _workZoneH: 40,          // alçada de la zona única WF+clips (per sota la regla)
        _waveformGain: 2.8,   // amplifica visualment la WF (àudio ~-9dB)
        _playheadSec: 0,
        _pollInterval: null,
        _srtPath: "",
        _srtName: "",
        _canvas: null,
        _ctx: null,
        _isDirty: false,
        _waveformPeaks: null,
        _waveformPPS: 480,
        _wfCacheKey: "",
        _wfPixelHeights: null,
        _waveformSegments: [],
        _waveformMediaTag: "",
        _wfMediaStart: 0,
        _wfMediaEnd: 0,
        _axisOrigin: 0,     // media on comença el timeline (IN del primer clip) → eix del editor
        // (F3.6 · BUG #188 · 2026-10-23) Entrades SINT que la fusió 🧩 ha afegit als
        // BUITS de la taula. Serveixen per a pintar-les amb un to propi a l'editor i
        // per al resum del log: el 🧩 NO exporta res al timeline (allò és 💾).
        _gapAdded: [],
        // (#132, 2026-10-02) FINESTRA D'EDICIÓ: un cop fixats l'IN/OUT de la peça
        // (botons IN / OUT de l'editor) l'eix es cenyeix al TRAM DE LA PEÇA amb un
        // marge a la dreta, en lloc d'estirar-se sobre tot el clip carregat.
        // Són temps de MEDIA (com la resta de l'editor) i afecten NOMÉS l'eix
        // (dibuix, regle, zoom i barra inferior): `_axisOrigin` continua essent
        // l'origen real de la conversió MEDIA→TIMELINE de l'exportació.
        _editWinStart: null,
        _editWinEnd: null,
        _pollCount: 0,
        _localPlayInterval: null,
        _ctiSec: 0,
        _ctiAt: 0,
        _timelineRunning: false,
        _pendingSeek: null,   // seek pendent (clic al canvas) — el CTI encara ha d'arribar
        _lastCtiSec: -1,
        _lastLocalT: -1,
        _lastLocalPx: -1,
        _isPlaying: false,
        _playheadLocal: false,  // playhead més enllà de l'OUT (desacoblat de Premiere)
        _zoomBarDragging: false,  // s'està arrossegant la barra de zoom (no auto-scroll)
        // Control del visor de vídeo (PLAY fluït sense micro-tirons):
        _lastSubsHtml: "",    // últim text de l'overlay escrit (evita innerHTML repetit sobre el <video>)
        _lastPlyLogT: 0,      // throttle del log "⏱ PLY" (escriure al fitxer a cada poll tensa la UI)
        _lastVideoSeekT: 0,   // histèresi entre re-anclatges (seek) del <video> en PLAY
        _lastVideoDrift: 0,   // últim desfàs mesurat v.currentTime − playhead (diagnòstic)
        _videoBlobUrl: null,  // objectURL del MP4 carregat a MEMÒRIA (s'ha d'alliberar sempre)
        _videoSrcTag: '',     // origen real del vídeo carregat (MEMÒRIA/LOCAL/XARXA) — HUD
        _videoFps: -1,        // fps reals que pinta el <video> (requestVideoFrameCallback) — HUD
        _vfcId: null,         // id del requestVideoFrameCallback actiu
        _vfcLastT: 0,         // base del comptador de fps
        _vfcCount: 0,         // frames comptats des de la base
        _vfcTimer: null,      // watchdog: si no arriben frames, el HUD baixa a 0 fps
        _vfcWallT: 0,         // instant (wall clock) de l'últim frame vist
        // ORIGEN DEL VÍDEO DEL VISOR. Clic al HUD → rota els modes (es guarda a
        // localStorage). 'auto' = memòria → còpia local → UNC; 'unc' = només xarxa
        // (per mesurar-la amb el HUD); 'local' = sense memòria; 'mem' = només memòria.
        _videoSourceModes: ['auto', 'unc', 'local', 'mem'],
        _videoSource: (function () {
            try {
                var v = localStorage.getItem('fastpass_video_source');
                return (v === 'unc' || v === 'local' || v === 'mem' || v === 'auto') ? v : 'unc';
            } catch (e) { return 'unc'; }
        })(),
        _videoMediaPath: '',  // clip carregat (per recarregar-lo al canviar de mode)
        _hudBound: false,     // el clic del HUD ja enganxat
        _lastCtiT: 0,         // timestamp del darrer poll (per calcular la VELOCITAT del CTI)
        _pollBusy: false,     // un poll en curs (evita solapar Timeline.get si un poll va lent)
        _srtFingerprint: "",  // empremta del contingut del SRT carregat: els marcadors només
                              // es restauren si el SRT és el MATEIX (evita portar marques antigues
                              // d'una altra peça/sessió que comparteix el nom 'emergencia_EMERGENCIA')
        _markers: [],
        _originalMarkers: [],
        _dragIdx: -1,
        _didDrag: false,
        _suppressClick: false,
        _MARKER_TOL_PX: 12,
        // Tolerància MÍNIMA de captura de marcadors en SEGONS (per cada costat).
        // Amb zooms amples (p. ex. mode emergència SRT / blocs de 15 min) la tol en
        // píxels (12/pps) es queda en pocs segons i és difícil agafar el marcador
        // sense "pillar-se els dits". 2026-09-04: mínim de 20s (ajustable).
        _MARKER_TOL_MIN_SEC: 20,
        _lastSegLog: -1,

        // ── F3 (2026-10-21) · SELECCIO, SINTETICS I REOMLIMENT ──────────────
        // _selIndex: entrada PRINCIPAL de la TAULA QUE ES VEU (la primera de la
        //   selecció). -1 = cap. Es conserva per compatibilitat (exportar, Supr,
        //   missatges) i ha de coincidir amb el primer índex de _selIndices.
        _selIndex: -1,
        // (F3.4, 2026-10-21) SELECCIO MULTIPLE de clips (Ctrl/Shift+clic al clip):
        //   _selIndices → índexs seleccionats (ordenats) · _selAnchor → àncora del
        //   Shift. Supr/Backspace esborra TOTS els clips de _selIndices.
        //   El CURSOR només es mou clicant la REGLA (la resta del canvas no fa seek).
        _selIndices: [],
        _selAnchor: -1,
        // Franja (px) dels extrems d'un clip que NO alterna la selecció: el
        // "centre" del clip és el que selecciona/deselecciona (F3.4).
        _CLIP_EDGE_PX: 4,
        // _kind: quina taula es viu ara → color dels clips i pista per defecte a
        // l'exportar. 'NORMAL' (SRT del dia) · 'SINT' (sintetics) · 'MOD' (fusio).
        _kind: 'NORMAL',
        // _views: instantanies de les taules que NO es veuen (kind → vista), per
        // poder alternar NORMAL↔SINT sense rellegir res i sense barrejar-les.
        _views: {},
        // (BUG #189 · 2026-10-23) Desplacament (s) aplicat a la taula SINT per a
        // portar-la a l'eix de MEDIA del SRT NORMAL. Es guarda per a aplicar-lo
        // tambe als marcadors que es restauren DESPRES de l'ajust.
        _sintShiftSec: 0,
        // _timelineSubs: caché de clips de subtitol del timeline [{track,start,end}]
        // (per saber si l'entrada seleccionada ja esta exportada). 0 = sense llegir.
        _timelineSubs: null,
        _timelineSubsAt: 0,

        init: function () {
            this._canvas = document.getElementById('srtCanvas');
            if (!this._canvas) return false;
            this._ctx = this._canvas.getContext('2d');
            var self = this;

            // (F3.4, 2026-10-21) El CURSOR només es mou des de la REGLA: la resta del
            // canvas (zona de treball + clips) ja NO fa seek; allí el clic
            // selecciona/deselecciona clips (ho resol el mousedown).
            this._canvas.addEventListener('click', function (e) {
                if (self._suppressClick) { self._suppressClick = false; return; }
                if (!self._inRulerZone(e)) return;
                var sec = self._canvasXToSec(e);
                log("🖱 CLIC canvas (regla) → media=" + sec.toFixed(2) + "s");
                self.setPlayhead(sec);
            });

            // Click dret (zona de treball): crear marcador (o esborrar-lo si ja n'hi ha un a sota).
            this._canvas.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                // La regla no és zona de marcadors (només cabezal).
                if (self._inRulerZone(e)) return;
                var rawSec = self._canvasXToSec(e);

                // 1) Borrar si el clic cau sobre un marcador existent (mateixa tol que el drag).
                var idx = self._markerAtSec(rawSec);
                if (idx >= 0) {
                    var delSec = self._markers[idx];
                    self._markers.splice(idx, 1);
                    if (idx < self._originalMarkers.length) self._originalMarkers.splice(idx, 1);
                    log("📝 SRT_EDIT: Marcador esborrat a " + delSec.toFixed(2) + "s");
                } else {
                    // 2) Crear marcador snap al límit del clip que ES VEU (taula actual),
                    //    i mapejar-lo a l'espai ORIGINAL per a _originalMarkers.
                    var snapActual = self._snapToSubtitleBoundary(rawSec, self._entries);
                    var snapOriginal = self._actualToOriginal(snapActual);
                    self._markers.push(snapActual);
                    self._markers.sort(function (a, b) { return a - b; });
                    self._originalMarkers.push(snapOriginal);
                    self._originalMarkers.sort(function (a, b) { return a - b; });
                    log("📝 SRT_EDIT: Marcador creat a " + snapActual.toFixed(2) + "s (orig " + snapOriginal.toFixed(2) + "s, clic " + rawSec.toFixed(2) + "s)");
                }
                self._isDirty = true;
                self._applyAllMarkers();
                self.render();
                self._persistMarkers();
            });

            // Botó esquerre (disseny compacte):
            //  - REGLA → SOLS el cabezal (playhead), mai drag ni selecció.
            //  - Zona de treball → marcadors (drag) i, si no n'hi ha cap davall el
            //    cursor, SELECCIÓ de clips (F3.4):
            //      · centre del clip  → selecciona/deselecciona (clic simple);
            //      · Ctrl/Cmd+clic    → afig/leva de la selecció (multi);
            //      · Shift+clic       → rang des de l'àncora;
            //      · zona buida       → buida la selecció.
            //    En cap cas mou el cabezal (eixe és només de la regla).
            this._canvas.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                var sec = self._canvasXToSec(e);
                if (self._inRulerZone(e)) {
                    log("🖱 MOUSEDOWN canvas (regla) → media=" + sec.toFixed(2) + "s");
                    self.setPlayhead(sec);
                    self._suppressClick = true; // el clic següent no ha de repetir el seek
                    return;
                }
                // Si el clic cau DINS del cos d'un clip, la tolerància per agafar un
                // marcador és l'ESTRICTA (px): la tol ampliada (20 s) faria impossible
                // seleccionar un clip que tinguera un marcador a prop.
                var hit = self._clipHitAtEvent(e);
                // Tol ampliada per capturar el marcador per ARROSSEGAR-lo (wideTol=true).
                var idx = self._markerAtSec(sec, !hit);
                if (idx >= 0) {
                    self._dragIdx = idx;
                    self._didDrag = false;
                    e.preventDefault();
                    return;
                }
                // Cap marcador davall el cursor → selecció de clips (sense seek).
                if (hit) {
                    self._toggleSelectionAt(hit.index, e, hit.inCenter);
                } else if (!(e.ctrlKey || e.metaKey || e.shiftKey)) {
                    self._clearSelection();
                    self.render();
                    log("🖱 MOUSEDOWN zona buida → selecció buidada");
                }
                self._suppressClick = true; // el clic següent no ha de moure el cabezal
                e.preventDefault();
            });

            // El drag es segueix a nivell de document (com a la barra de zoom): si el
            // cursor surt del canvas a mig arrossegament, el marcador NO es deixa anar.
            var dragMove = function (e) {
                if (self._dragIdx >= 0) {
                    self._didDrag = true;
                    self._applyMarkerDrag(self._canvasXToSec(e));
                    self.render();
                }
            };
            var endDrag = function () {
                if (self._dragIdx >= 0) {
                    if (self._didDrag) {
                        self._suppressClick = true; // el click del mouseup no ha de moure el playhead
                        self._isDirty = true;
                        self._persistMarkers();
                    }
                    self._dragIdx = -1;
                    self._didDrag = false;
                }
            };
            document.addEventListener('mousemove', dragMove);
            document.addEventListener('mouseup', endDrag);
            this._canvas.addEventListener('mousemove', dragMove);
            this._canvas.addEventListener('mouseup', endDrag);

            this._scrollWrap = this._canvas.parentElement;
            this._initZoomBar();
            this._initKeys();
            return true;
        },

        /**
         * _initKeys (F3.1 · F3.4): Supr/Backspace esborren el/els subtitol(s)
         * seleccionat(s) (selecció múltiple amb Ctrl/Shift+clic).
         * Nomes actua amb l'editor VISIBLE (el contenidor te display:none quan no
         * hi ha SRT) i MAI des de dins d'un camp de text.
         */
        _initKeys: function () {
            var self = this;
            document.addEventListener('keydown', function (e) {
                var k = e.key || e.code || '';
                if (k !== 'Delete' && k !== 'Backspace') return;
                if (!self._canvas || !self._canvas.offsetParent) return;   // editor amagat
                var el = document.activeElement;
                var tag = el ? String(el.tagName || '').toUpperCase() : '';
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
                e.preventDefault();
                self.deleteSelected();
            });
        },

        // --- BARRA DE ZOOM (estil Premiere) ---
        _initZoomBar: function () {
            var self = this;
            var bar = document.getElementById('srtZoomBar');
            if (!bar) return;
            var dragMode = null;
            var dragStartX = 0;
            var dragStartView = null;
            var dragBarPxPerTl = 1;
            var dragMinWidth = 0;
            var MIN_PPS = 5, MAX_PPS = 150;

            var totalTl = function () {
                // (#132) El total de l'eix és el de la FINESTRA d'edició si està fixada.
                return Math.max(0.001, self._viewEnd() - self._viewOrigin());
            };

            var getView = function () {
                var pps = self._pixelsPerSec || 1;
                var clientW = self._scrollWrap ? self._scrollWrap.clientWidth : bar.clientWidth;
                var scrollPx = self._scrollWrap ? self._scrollWrap.scrollLeft : 0;
                return { start: scrollPx / pps, end: (scrollPx + clientW) / pps, clientW: clientW, pps: pps };
            };

            var applyView = function (start, end) {
                var clientW = getView().clientW;
                var total = totalTl();
                var minWidth = clientW / MAX_PPS;   // zoom màxim
                if (start < 0) { end -= start; start = 0; }
                if (end > total) { start -= (end - total); end = total; }
                if (start < 0) start = 0;
                if (end > total) end = total;
                if (end - start < minWidth) end = Math.min(total, start + minWidth);
                var pps = clientW / Math.max(0.001, (end - start));
                if (pps < MIN_PPS) pps = MIN_PPS;
                if (pps > MAX_PPS) pps = MAX_PPS;
                self._pixelsPerSec = pps;
                if (self._scrollWrap) self._scrollWrap.scrollLeft = start * pps;
                self.render();
                self._updateZoomBar();
            };

            bar.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                var id = e.target.id;
                if (id === 'srtZoomHandleL') dragMode = 'L';
                else if (id === 'srtZoomHandleR') dragMode = 'R';
                else if (id === 'srtZoomFill') dragMode = 'pan';
                else return;
                // Captura l'offset inicial: el handle es mou SOLIDARI amb el rató
                // (sense saltar a la posició del cursor).
                dragStartX = e.clientX;
                dragStartView = getView();
                dragBarPxPerTl = bar.clientWidth / totalTl();
                dragMinWidth = dragStartView.clientW / MAX_PPS;
                self._zoomBarDragging = true;
                e.preventDefault();
            });

            document.addEventListener('mousemove', function (e) {
                if (!dragMode) return;
                var deltaTl = (e.clientX - dragStartX) / dragBarPxPerTl;
                var v = dragStartView;
                if (dragMode === 'L') {
                    var newStart = v.start + deltaTl;
                    if (newStart > v.end - dragMinWidth) newStart = v.end - dragMinWidth;
                    if (newStart < 0) newStart = 0;
                    applyView(newStart, v.end);
                } else if (dragMode === 'R') {
                    var newEnd = v.end + deltaTl;
                    if (newEnd < v.start + dragMinWidth) newEnd = v.start + dragMinWidth;
                    var total = totalTl();
                    if (newEnd > total) newEnd = total;
                    applyView(v.start, newEnd);
                } else {
                    // Pan natural (com a Premiere): arrossegar cap a la dreta desplaça
                    // la vista cap a la dreta (scrollLeft augmenta).
                    applyView(v.start + deltaTl, v.end + deltaTl);
                }
            });

            document.addEventListener('mouseup', function () {
                dragMode = null;
                self._zoomBarDragging = false;
            });
        },

        _updateZoomBar: function () {
            var bar = document.getElementById('srtZoomBar');
            var fill = document.getElementById('srtZoomFill');
            var hL = document.getElementById('srtZoomHandleL');
            var hR = document.getElementById('srtZoomHandleR');
            if (!bar || !fill || !hL || !hR) return;
            var barW = bar.clientWidth;
            if (barW <= 0) return;
            var totalTl = Math.max(0.001, this._maxSec - (this._axisOrigin || 0));
            var pps = this._pixelsPerSec || 1;
            var clientW = this._scrollWrap ? this._scrollWrap.clientWidth : barW;
            var scrollPx = this._scrollWrap ? this._scrollWrap.scrollLeft : 0;
            var startTl = Math.max(0, scrollPx / pps);
            var endTl = Math.min(totalTl, startTl + clientW / pps);
            var leftPct = (startTl / totalTl) * 100;
            var rightPct = (endTl / totalTl) * 100;
            if (rightPct - leftPct < 1) rightPct = Math.min(100, leftPct + 1);
            fill.style.left = leftPct + '%';
            fill.style.width = (rightPct - leftPct) + '%';
            hL.style.left = 'calc(' + leftPct + '% - 4px)';
            hR.style.left = 'calc(' + rightPct + '% - 4px)';
        },

        _ensurePlayheadVisible: function () {
            if (!this._scrollWrap || this._zoomBarDragging) return;
            // Auto-scroll NOMÉS amb el cabezal en PLAY (Premiere o play local).
            // Si el timeline està parat (clic, pan o zoom manuals), NO recol·locar la vista.
            if (!this._timelineRunning && !(this._playheadLocal && this._isPlaying)) return;
            var pps = this._pixelsPerSec || 1;
            var x = this._secToX(this._playheadSec);
            var cw = this._scrollWrap.clientWidth;
            var sl = this._scrollWrap.scrollLeft;
            var margin = 40;
            var maxScroll = Math.max(0, this._scrollWrap.scrollWidth - cw);
            if (x < sl + margin) {
                this._scrollWrap.scrollLeft = Math.max(0, x - margin);
            } else if (x > sl + cw - margin) {
                this._scrollWrap.scrollLeft = Math.min(maxScroll, x - cw + margin);
            }
            this._updateZoomBar();
        },

        /**
         * loadSrt: llegeix un .srt, munta la taula, la waveform i els marcadors.
         * @param {string} srtPath - Ruta del .srt a carregar.
         * @param {Object} [opts] - { skipMarkerRestore: true } → NO restaura els marcadors
         *   persistits. El fa servir el RESET ♻️ (#138): un cop esborrats, els marcadors
         *   no han de tornar a aparèixer en recarregar el mateix .srt.
         *   { kind: 'SINT' } (F3.2) → la taula es marca com a SINTETICA (color taronja,
         *   exportació per defecte a S2) i la que es veia es guarda a `_views`.
         * @returns {boolean} true si s'ha carregat
         */
        loadSrt: async function (srtPath, opts) {
            var skipMarkerRestore = !!(opts && opts.skipMarkerRestore);
            // (F3.2) kind: 'NORMAL' (per defecte) o 'SINT'. Les taules NO es
            // barregen: la que es deixa de veure es guarda a _views.
            var kind = (opts && opts.kind) ? String(opts.kind).toUpperCase() : 'NORMAL';
            if (kind !== 'SINT' && kind !== 'NORMAL') kind = 'NORMAL';
            if (this._kind !== kind && (this._entries || []).length > 0) this._stashCurrentView();
            delete this._views[kind];   // es carrega de nou: la instantania vella ja no val
            log("📝 SRT_EDIT: Carregant " + srtPath + (kind === 'SINT' ? " [SINT]" : "") + (skipMarkerRestore ? " (sense restaurar marcadors)" : ""));
            var escapedPath = srtPath.replace(/\\/g, '\\\\');
            // (2026-10-02) IO.readTxt llegeix amb ANSI i els .srt del projecte són UTF-8
            // → els accents arribaven malmesos ("Ã“" en lloc de "Ó"). Es repara aquí.
            var srtContent = getUtils()._fromMojibake(await callJSX("IO.readTxt('" + escapedPath + "')"), 'srt_editor');
            if (!srtContent || srtContent.indexOf('ERR') === 0) {
                // (2026-10-23 · BUG #185) Sense esta traça, un path mal format (p.ex.
                // carpeta+nom enganxats) deixava el log mut després de "Carregant ...":
                // l'usuari veia que el botó "no carregava" sense cap motiu.
                log("⚠️ SRT_EDIT: NO s'ha pogut llegir '" + srtPath + "' (" +
                    (srtContent ? String(srtContent).slice(0, 140) : 'resposta buida') + ")");
                getUtils().status("Error llegint .srt", "error");
                return false;
            }
            this._entries = window.FASTPASS_UI.Logic.SrtParser.srtToEntries(srtContent);
            // Taula carregada immutable: estat inicial per al botó RESET (mai no s'actualitza)
            this._loadedEntries = this._entries.map(function (e) { return { index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec, endSec: e.endSec }; });
            // Taula original: base de TOTES les edicions de marcadors (evita degradació acumulada)
            this._originalEntries = this._entries.map(function (e) { return { index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec, endSec: e.endSec }; });
            this._srtPath = srtPath;
            this._srtName = srtPath.split('\\').pop().replace(/\.srt$/i, '');
            // Empremta del contingut: els marcadors persistits només es poden restaurar
            // si el SRT és exactament el mateix (vegeu _restoreMarkers).
            this._srtFingerprint = this._fingerprintSrt();
            // (F3) La taula carregada passa a ser la VIVA i la seua marca de color
            this._kind = kind;
            this._sintShiftSec = 0;   // (BUG #189) cap ajust de SINT encara
            this._clearSelection();
            this._timelineSubs = null;
            this._gapAdded = [];   // (F3.6) SRT nou → cap clip pendent d'exportar a S2
            // (BUG #189) Els .srt sintetics no comencen al media 0 del clip: es
            // MESURA el desfasament amb les frases en comu i es desplaça la taula
            // SINT abans de pintar res (si l'altra taula ja esta a _views).
            this._applySintAlignment();
            if (this._entries.length > 0) {
                this._maxSec = this._entries[this._entries.length - 1].endSec + 10;
            }
            this._clearEditWindow();   // (#132) SRT nou → eix sencer del clip
            log("📝 SRT_EDIT: " + this._entries.length + " entrades");
            this._isDirty = false;
            this._showEditor();
            this._startPolling();
            this._waveformPeaks = null;
            this._markers = [];
            this._originalMarkers = [];

            // Carregar waveform des del fitxer .bin (WAV 8-bit 480Hz, 1 byte = 1 peak)
            try {
                var wg = window.FASTPASS_UI.Logic.WaveformGenerator;
                var projFolder = await callJSX("Context.folder()");
                if (projFolder && String(projFolder).indexOf('ERR') !== 0) this._projectKey = projFolder;
                // Els marcadors es guarden a la CARPETA DEL PROJECTE (al costat del
                // manifest), no a C:/temp, perquè cada projecte tingui els seus.
                if (skipMarkerRestore) log("📝 SRT_EDIT: marcadors NO restaurats (RESET ♻️)");
                else await this._restoreMarkers();
                // (BUG #189) Els marcadors es desen amb els temps del .srt ORIGINAL
                // (l'eix propi del SINT). Si la taula s'ha desplaçat per quadrar-la
                // amb el SRT NORMAL, els marcadors han de viatjar igual.
                if (kind === 'SINT' && this._sintShiftSec) {
                    var shS = Number(this._sintShiftSec) || 0;
                    this._markers = (this._markers || []).map(function (m) { return Math.max(0, m + shS); });
                    this._originalMarkers = (this._originalMarkers || []).map(function (m) { return Math.max(0, m + shS); });
                    log("📝 SRT_EDIT: marcadors SINT desplaçats " + shS.toFixed(2) + "s (" + this._markers.length + ")");
                }
                if (wg && projFolder) {
                    var binPath = await wg.getBinPath(projFolder);
                    if (binPath) {
                        log("📝 SRT_EDIT: Bin trovato: " + binPath);
                        var wfResult = await wg.loadPeaksFromBin(binPath, 480);
                        if (wfResult && wfResult.peaks && wfResult.peaks.length > 0) {
                            this._waveformPeaks = wfResult.peaks;
                            this._waveformPPS = wfResult.peaksPerSec || 480;
                            this._waveformMediaTag = binPath.split(/[\\/]/).pop().toUpperCase().replace(/_AUDIO_REF\.BIN$/i, '').replace(/\.BIN$/i, '');
                            log("📝 SRT_EDIT: " + wfResult.peaks.length + " peaks (" + this._waveformPPS + "/s, " + wfResult.durSec.toFixed(1) + "s)");
                            await this._refreshWaveformSegments();
                        } else {
                            log("⚠️ SRT_EDIT: No s'han pogut carregar peaks del .bin");
                        }
                    } else {
                        log("⚠️ SRT_EDIT: No s'ha trobat fitxer .bin al directori del projecte");
                    }
                }
            } catch(e) {
                log("⚠️ SRT_EDIT: Error carregant .bin: " + e.message);
            }

            // Carregar el vídeo del clip al visor vertical (PLAN_VIDEO_PREVIEW)
            try {
                var videoTag = this._waveformMediaTag;
                var projFolder2 = await callJSX("Context.folder()");
                if (videoTag && projFolder2) {
                    await this._loadVideo(projFolder2 + '\\' + videoTag + '.mp4');
                } else {
                    log("⚠️ SRT_EDIT: Sense dades per localitzar el MP4 del clip");
                }
            } catch(e3) {
                log("⚠️ SRT_EDIT: Error carregant vídeo: " + e3.message);
            }
            
            // Aplicar els marcadors restaurats a la taula de clips (warp).
            this._applyAllMarkers();
            this.render();
            getUtils().status((kind === "SINT" ? "SINT carregat" : "SRT carregat") + ": " + this._entries.length + " entrades", "exito");
            return true;
        },

        /**
         * EMERGÈNCIA SRT (Control+click a CARREGAR): si el .srt per defecte està mal
         * tallat, carrega el troç del bloc des del directori de blocs de 15 min:
         *   \\public.ad-ccrtv.local\Public\VERTICALITZACIO_INFORMATIUS\SRT_MP4_PER_TEMPS_15MINUTS
         * Nom: {YYYY-MM-DD}_Telenot_cies_{migdia|vespre|comarques}_{HH_MM_SS}_{HH_MM_SS}.srt
         */
        loadEmergencySrt: async function () {
            const u = getUtils();
            try {
                log("🚨 SRT_EMERGENCIA: iniciant càrrega des de blocs de 15 min...");

                // 1. Context (mateixes fonts que _setupContext del MainButton)
                const config = FASTPASS_UI.Config.get();
                const idProg = (document.getElementById('programa') || {}).value;
                const progData = config.mapeoProgramas && config.mapeoProgramas[idProg];
                if (!progData) {
                    u.status("Selecciona un programa", "warn");
                    log("⚠️ SRT_EMERGENCIA: cap programa seleccionat (o id '" + idProg + "' fora de mapeoProgramas)");
                    return;
                }
                const bloque = (document.getElementById('bloc') || {}).value;
                const stateDateDir = (FASTPASS_UI.State && FASTPASS_UI.State.dateDir);
                const dateDir = stateDateDir || u.getFormattedDate().replace(/["\s]/g, "").trim();
                const ctx = { config: config, progData: progData, programa: idProg, bloque: bloque, dateDir: dateDir };

                // 2. Rang real del bloc (hora del dia, en segons) des del manifest
                // (2026-10-23 · BUG #185b) El manifest es busca amb la DATA DE TREBALL,
                // però en mode correcció (projecte d'ahir obert hui) eixa data pot ser
                // la de hui, i el manifest de hui pot ser un STUB (`ref` tot a null) →
                // eixia "no s'ha carregat cap .srt" tot i que el projecte obert SÍ que
                // té rang. Es reintenta amb la data/bloc del PROJECTE OBERT.
                let projFolder = '';
                try { projFolder = String(await callJSX("Context.folder()") || ''); } catch (eF) { projFolder = ''; }
                if (projFolder && projFolder.indexOf('ERR') === 0) projFolder = '';
                const hasRange = function (m) {
                    return !!(m && m.ref && m.ref.worldBlockStartSec != null &&
                        m.ref.worldBlockEndSec != null && m.ref.worldBlockEndSec > m.ref.worldBlockStartSec);
                };
                let manifest = await FASTPASS_UI.SessionManifest.load(ctx);
                if (!hasRange(manifest) && projFolder) {
                    const pc = this._projectCtxFromPath(projFolder);
                    if (pc && (pc.dateDir !== ctx.dateDir || (pc.bloque && pc.bloque !== ctx.bloque))) {
                        log("🔁 SRT_EMERGENCIA: el manifest de la data de treball (" + ctx.dateDir +
                            ") no té rang → provant el del PROJECTE OBERT (" + pc.dateDir + " · " +
                            (pc.bloque || ctx.bloque) + ")");
                        const ctx2 = {
                            config: config, progData: progData, programa: idProg,
                            bloque: pc.bloque || ctx.bloque, dateDir: pc.dateDir
                        };
                        const m2 = await FASTPASS_UI.SessionManifest.load(ctx2);
                        if (hasRange(m2)) {
                            manifest = m2;
                            ctx.dateDir = ctx2.dateDir;
                            ctx.bloque = ctx2.bloque;
                            log("✅ SRT_EMERGENCIA: manifest del projecte obert · bloc world [" +
                                Number(m2.ref.worldBlockStartSec).toFixed(1) + "s → " +
                                Number(m2.ref.worldBlockEndSec).toFixed(1) + "s]");
                        } else {
                            log("⚠️ SRT_EMERGENCIA: el manifest del projecte obert tampoc no té rang (" + pc.dateDir + ")");
                        }
                    }
                }
                const worldStart = manifest.ref && manifest.ref.worldBlockStartSec;
                const worldEnd = manifest.ref && manifest.ref.worldBlockEndSec;
                if (worldStart == null || worldEnd == null || worldEnd <= worldStart) {
                    u.status("El manifest no té el rang del bloc (executa NOU primer)", "warn");
                    // (2026-10-23 · BUG #185) Motiu EXPLÍCIT al log. Amb un manifest
                    // buit (projecte obert sense escaleta → `ref` tot a null) el
                    // carregador ix ací i al log només es veia "no s'ha carregat cap
                    // .srt": semblava que el botó estiguera trencat.
                    log("⚠️ SRT_EMERGENCIA: el manifest NO té rang de bloc (" +
                        "worldStart=" + worldStart + ", worldEnd=" + worldEnd + ") · programa=" + idProg +
                        " · bloc=" + ctx.bloque + " · data=" + ctx.dateDir +
                        " → executa NOU o FOTO de l'escaleta per reconstruir el manifest");
                    return;
                }
                // Margen de captura GARANTITZAT per banda en la càrrega per blocs de 15 min.
                // Preferim que sobri una mica de temps (subtítols limítrofs de la peça veïna)
                // a perdre text del bloc: recuperar subtítols perduts és complex.
                const handles = (config.handles != null) ? config.handles : 20;
                const srtAir = 20; // segons mínims garantits a cada banda del bloc
                const marginSecs = Math.max(handles, srtAir);
                // Finestra ASIMÈTRICA (2026-09-15):
                //  - per DAVANT: cap marge → no arrosseguem rètols de la peça anterior
                //    (l'usuari veia "subtítols de molt abans", que no són del bloc).
                //  - per DARRERE: s'allarga MÉS ENLLÀ del final del bloc, perquè la peça
                //    sovint continua i no s'ha de perdre el final del text.
                const tailSec = (config.srtEmergencyTailSec != null) ? Number(config.srtEmergencyTailSec) : 60;
                const winStart = worldStart;
                const winEnd = worldEnd + Math.max(marginSecs, tailSec);
                log("🚨 SRT_EMERGENCIA: bloc world [" + worldStart.toFixed(1) + "s → " + worldEnd.toFixed(1) + "s], finestra [" + winStart.toFixed(1) + "s → " + winEnd.toFixed(1) + "s] (davant sense marge · darrere +" + Math.max(marginSecs, tailSec) + "s)");

                // ⚠️ ORIGEN DE L'EIX (2026-09-16 · CORREGIT 2026-10-23 · BUG #186)
                // `worldSecMediaStart` JA és el TC DE MÓN on comença el MEDIA 0 del clip
                // (per als extractes = `extractedClip.extractedWorldSecMediaStart`).
                // `mp4ExpandedInPoint` és una coordenada DINS del MP4, NO un desplaçament
                // de món: sumar-la movia tot l'SRT eixos segons ABANS del clip. Eixa era
                // la causa que l'usuari veiés els subtítols "molt del principi" i que
                // l'exportació a Premiere els deixés desplaçats el mateix temps.
                // Conversió bona (igual per a clip extret i per a cleanFeed sencer):
                //     media(W) = W − worldSecMediaStart
                const theExIn = (manifest.ref && manifest.ref.mp4ExpandedInPoint != null)
                    ? Number(manifest.ref.mp4ExpandedInPoint)
                    : ((manifest.blockBounds && manifest.blockBounds.mp4ExpandedInPoint != null)
                        ? Number(manifest.blockBounds.mp4ExpandedInPoint) : 0);
                const baseMediaStart = (manifest.ref && manifest.ref.worldSecMediaStart != null)
                    ? Number(manifest.ref.worldSecMediaStart)
                    : ((manifest.extractedClip && manifest.extractedClip.extractedWorldSecMediaStart != null)
                        ? Number(manifest.extractedClip.extractedWorldSecMediaStart)
                        : worldStart);
                const refStartSec = baseMediaStart;
                const blockInMedia = worldStart - refStartSec;
                // Contrast amb el manifest: `tlBlockInPointSec` = on cau l'inici del bloc
                // dins del MP4. Si no quadra amb la base calculada, ho deixem al log
                // (el símptoma seria exactament el de BUG #186: tot el bloc desplaçat).
                const tlBlockInPt = (manifest.ref && manifest.ref.tlBlockInPointSec != null)
                    ? Number(manifest.ref.tlBlockInPointSec) : NaN;
                log("🚨 SRT_EMERGENCIA: base de temps = món " + refStartSec.toFixed(1) + "s (media 0)" +
                    " → bloc a " + blockInMedia.toFixed(2) + "s dins del MP4 del clip" +
                    " · manifest: tlBlockInPointSec=" + (isFinite(tlBlockInPt) ? tlBlockInPt.toFixed(2) + "s" : "N/D") +
                    ", mp4ExpandedInPoint=" + (isFinite(theExIn) ? theExIn.toFixed(2) + "s (NO se suma: és coordenada de media)" : "N/D"));
                if (isFinite(tlBlockInPt) && Math.abs(blockInMedia - tlBlockInPt) > 0.5) {
                    log("⚠️ SRT_EMERGENCIA: desviació de " + (blockInMedia - tlBlockInPt).toFixed(2) +
                        "s entre la base calculada i el manifest (tlBlockInPointSec) → revisa worldSecMediaStart", "WARN");
                }

                // 3. Programa → carpeta dels blocs de 15 min
                const progMap = { TNM: 'migdia', TNV: 'vespre', TNC: 'comarques' };
                const programa = progMap[(progData.wott || '').toUpperCase()];
                if (!programa) {
                    u.status("Programa no suportat per emergència", "warn");
                    log("⚠️ SRT_EMERGENCIA: wott '" + (progData.wott || '?') + "' sense carpeta de blocs (TNM/TNV/TNC)");
                    return;
                }
                const fecha = (ctx.dateDir || '').replace(/_/g, '-');
                const prefix = fecha + '_Telenot_cies_' + programa + '_';
                const dir = this._srt15MinDir();
                if (!dir) {
                    u.status("Falta la ruta dels SRT de 15 min (Configuracio → Subtitols)", "warn");
                    log("SRT_EMERGENCIA: ruta 'rutas.subtitulos' buida a la configuracio");
                    return;
                }

                // 4. Llistar i seleccionar els arxius que solapen la finestra del bloc
                const files = await u.readFolder(dir);
                if (!files || files.length === 0) {
                    u.status("No es pot llegir el directori de SRTs de 15 min", "warn");
                    log("⚠️ SRT_EMERGENCIA: carpeta de blocs inaccessible o buida: " + dir);
                    return;
                }
                const candidates = [];
                for (let i = 0; i < files.length; i++) {
                    const name = files[i].name || '';
                    if (!name.toUpperCase().endsWith('.SRT')) continue;
                    if (name.indexOf(prefix) !== 0) continue;
                    const t = this._parseSrt15Times(name);
                    if (!t) continue;
                    if (t.startSec <= winEnd && t.endSec >= winStart) {
                        candidates.push({ name: name, path: dir + '\\' + name, startSec: t.startSec, endSec: t.endSec });
                    }
                }
                candidates.sort(function (a, b) { return a.startSec - b.startSec; });
                // Assegurar el fitxer de 15 min SEGÜENT si el darrer seleccionat pot
                // tenir frases que creuen el tall (la part final aniria a l'arxiu següent
                // i la darrera frase del bloc es perdria sense ell).
                if (candidates.length > 0) {
                    const lastCand = candidates[candidates.length - 1];
                    for (let i = 0; i < files.length; i++) {
                        const name2 = files[i].name || '';
                        if (!name2.toUpperCase().endsWith('.SRT')) continue;
                        if (name2.indexOf(prefix) !== 0) continue;
                        const t2 = this._parseSrt15Times(name2);
                        if (!t2) continue;
                        if (t2.startSec >= lastCand.endSec - 0.5 && t2.startSec < lastCand.endSec + 60 * 16) {
                            if (!candidates.some(function (c) { return c.startSec === t2.startSec; })) {
                                candidates.push({ name: name2, path: dir + '\\' + name2, startSec: t2.startSec, endSec: t2.endSec });
                            }
                        }
                    }
                    candidates.sort(function (a, b) { return a.startSec - b.startSec; });
                }
                log("🚨 SRT_EMERGENCIA: " + candidates.length + " arxius de 15 min seleccionats" +
                    (candidates.length
                        ? " (" + candidates.map(function (c) { return c.name; }).join(' | ') + ")"
                        : " · prefix '" + prefix + "' · " + files.length + " fitxers a " + dir));
                if (candidates.length === 0) {
                    u.status("No s'ha trobat cap SRT de 15 min per al bloc", "warn");
                    log("⚠️ SRT_EMERGENCIA: cap .srt del bloc · prefix='" + prefix + "' · finestra [" +
                        winStart.toFixed(1) + "s → " + winEnd.toFixed(1) + "s] · carpeta=" + dir);
                    return;
                }

                // 5. Llegir, extreure i re-temporitzar el troç (concatena si cau entre arxius)
                const all = [];
                for (let c = 0; c < candidates.length; c++) {
                    const cand = candidates[c];
                    // (2026-10-02) readTxt → ANSI: reparar el mojibake dels SRT UTF-8.
                    const content = u._fromMojibake(await callJSX(`IO.readTxt('${u.escape(cand.path)}')`), 'srt_emergencia');
                    if (!content || content.indexOf('ERR') === 0) {
                        log("⚠️ SRT_EMERGENCIA: no s'ha pogut llegir " + cand.path + " (" +
                            (content ? String(content).slice(0, 120) : 'buit') + ")");
                        continue;
                    }
                    const entries = FASTPASS_UI.Logic.SrtParser.srtToEntries(content);
                    for (let e = 0; e < entries.length; e++) {
                        const ent = entries[e];
                        const realStart = cand.startSec + ent.startSec;
                        // Recórrer el final de la frase al límit de la finestra (bloc+marge):
                        // el SRT no ha d'estirar-se a la peça veïna més enllà del handle.
                        const realEnd = Math.min(cand.startSec + ent.endSec, winEnd);
                        if (realEnd <= winStart || realStart >= winEnd) continue;
                        const ns = realStart - refStartSec;
                        const ne = realEnd - refStartSec;
                        if (ne <= 0) continue;
                        all.push({ startSec: (ns < 0 ? 0 : ns), endSec: ne, texts: ent.texts.slice(), index: 0, timeStr: '' });
                    }
                }
                if (all.length === 0) {
                    u.status("No s'han trobat subtítols dins del bloc", "warn");
                    log("⚠️ SRT_EMERGENCIA: cap entrada dins la finestra · fitxers llegits=" +
                        candidates.length + " · base de temps=" + refStartSec.toFixed(1) + "s");
                    return;
                }
                all.sort(function (a, b) { return a.startSec - b.startSec; });
                for (let n = 0; n < all.length; n++) all[n].index = n + 1;
                const srtContent = FASTPASS_UI.Logic.SrtParser.entriesToSrt(all);
                log("🚨 SRT_EMERGENCIA: " + all.length + " entrades extretes");

                // 6. Escriure temporal i carregar amb loadSrt (reutilitza WF/vídeo/marcadors)
                // (2026-10-23 · BUG #185b) `projFolder` ja s'ha resolt al punt 2.
                if (!projFolder) {
                    try { projFolder = String(await callJSX("Context.folder()") || ''); } catch (eF2) { projFolder = ''; }
                }
                const base = this._srtName || 'emergencia';
                const tempName = base + '_EMERGENCIA.srt';
                const tempPath = ((projFolder && projFolder.indexOf('ERR') !== 0) ? projFolder : 'C:\\temp').replace(/[\\/]+$/, '') + '\\' + tempName;
                const escPath = tempPath.replace(/\\/g, '\\\\');
                const escContent = srtContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
                const writeRes = await callJSX(`IO.writeTxt('${escPath}','${escContent}')`);
                if (writeRes !== "OK") {
                    try { window.cep.fs.writeFile(tempPath, srtContent); } catch (e2) { }
                }
                await this.loadSrt(tempPath);
            } catch (e) {
                log("💥 SRT_EMERGENCIA: " + e.message);
                u.status("Error emergència SRT: " + e.message, "error");
            }
        },

        /**
         * _projectCtxFromPath (BUG #185b): trau la DATA de treball i el BLOC de la
         * carpeta del projecte obert (`…\<YYYY_MM_DD>\<V#>\`). Servix per a buscar el
         * manifest correcte quan la data de treball del panell no coincidix amb el
         * projecte obert (mode correcció: hui s'obri el projecte d'ahir).
         * @param {string} folderPath - Carpeta del .prproj (`Context.folder()`)
         * @returns {{dateDir:string, bloque:(string|null)}|null}
         */
        _projectCtxFromPath: function (folderPath) {
            if (!folderPath) return null;
            const parts = String(folderPath).replace(/\//g, '\\').split('\\');
            for (let i = parts.length - 1; i >= 0; i--) {
                if (/^\d{4}_\d{2}_\d{2}$/.test(parts[i])) {
                    const bloc = (parts[i + 1] && /^V\d+$/i.test(parts[i + 1])) ? parts[i + 1].toUpperCase() : null;
                    return { dateDir: parts[i], bloque: bloc };
                }
            }
            return null;
        },

        /**
         * _parseSrt15Times: Extreu {startSec, endSec} (segons del dia) del nom d'un
         * arxiu de 15 min. Format final del nom: ..._HH_MM_SS_HH_MM_SS.srt
         */
        _parseSrt15Times: function (name) {
            if (!name) return null;
            const m = name.match(/(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})\.srt$/i);
            if (!m) return null;
            const h1 = parseInt(m[1], 10), mi1 = parseInt(m[2], 10), s1 = parseInt(m[3], 10);
            const h2 = parseInt(m[4], 10), mi2 = parseInt(m[5], 10), s2 = parseInt(m[6], 10);
            const startSec = h1 * 3600 + mi1 * 60 + s1;
            const endSec = h2 * 3600 + mi2 * 60 + s2;
            if (endSec <= startSec) return null;
            return { startSec: startSec, endSec: endSec };
        },

        /**
         * _srt15MinDir (F2): carpeta dels SRT de 15 min, de la CONFIGURACIO.
         * ABANS era un literal UNC aci dins. Es llig en cada us perque un canvi a
         * la finestra de configuracio s'aplique sense reiniciar el panell.
         * @returns {string} '' si l'usuari encara no l'ha configurada.
         */
        _srt15MinDir: function () {
            try {
                const cfg = window.FASTPASS_UI.Config.get();
                const p = (cfg && cfg.rutas && cfg.rutas.subtitulos) ? cfg.rutas.subtitulos : '';
                // Sense separador final: davall s'hi concatena '\\' + nom del fitxer.
                return String(p).replace(/[\\/]+$/, '');
            } catch (e) { return ''; }
        },

        _showEditor: function () {
            var container = document.getElementById('srtEditorContainer');
            if (container) container.style.display = 'block';
        },

        _hideEditor: function () {
            var container = document.getElementById('srtEditorContainer');
            if (container) container.style.display = 'none';
            // Aturar i buidar el visor de vídeo (PLAN_VIDEO_PREVIEW)
            try {
                var v = document.getElementById('srtVideo');
                if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
                var subs = document.getElementById('srtVideoSubs');
                if (subs) subs.innerHTML = '';
            } catch (e) { }
            this._revokeVideoBlob();
            this._stopVideoFrameMeter();
            this._pendingSeek = null;
            this.stop();
        },

        /**
         * VISOR DE VÍDEO (PLAN_VIDEO_PREVIEW)
         * Càrrega el MP4 del clip al visor vertical 9:16. Primer intent amb file://
         * directa (UNC, 4 barres). Si la seguretat CEP/CORS ho bloqueja → fallback:
         * copia local a C:\temp\fastpass_media.mp4 i file:///C:/temp/...
         */
        /**
         * _loadVideo: Obre el MP4 del clip al visor, en ordre de preferència:
         *   1) A MEMÒRIA (XHR → Blob → objectURL): el fitxer sencer al buffer ⇒ la
         *      reproducció no torna a tocar el disc/NAS (sense tirones ni negres).
         *      Requereix `--allow-file-access-from-files` al CEF (vegeu .debug).
         *   2) CÒPIA LOCAL a disc (C:\temp\fastpass_video): el <video> llegeix local.
         *   3) file:////UNC directe (comportament antic) — darrer recurs.
         * @param {string} mediaPath - Ruta UNC del MP4 del clip
         * @returns {Promise<boolean>}
         */
        _loadVideo: async function (mediaPath) {
            var v = document.getElementById('srtVideo');
            if (!v) return false;
            this._videoMediaPath = mediaPath;
            this._bindVideoHud();
            var mode = this._videoSource || 'auto';

            // 1) MEMÒRIA (en 'auto' i 'mem'; en 'unc'/'local' es salta per disseny)
            if (mode === 'auto' || mode === 'mem') {
                if (await this._loadVideoFromMemory(mediaPath)) {
                    await this._seekVideoToPlayhead();
                    return true;
                }
            }

            // 2) CÒPIA LOCAL (en 'auto' i 'local'; no depèn del flag del CEF)
            if (mode === 'auto' || mode === 'local') {
                var local = await this._ensureLocalVideoCopy(mediaPath);
                if (local) {
                    v.preload = "auto";
                    v.src = "file:///" + local;
                    v.load();
                    if (await this._waitVideoReady(v, 8000)) {
                        log("✅ SRT_EDIT: Vídeo carregat des de la còpia local");
                        this._setVideoSrcTag("💾 LOCAL (còpia a C:\\temp)");
                        this._startVideoFrameMeter();
                        await this._seekVideoToPlayhead();
                        return true;
                    }
                    log("⚠️ SRT_EDIT: la còpia local no reprodueix (còdec?)");
                }
            }

            // 3) UNC directe (mode 'unc' → única via; resta → darrer recurs)
            var url = "file:////" + mediaPath.replace(/\\/g, "/");
            log("📝 SRT_EDIT: Vídeo → " + url + " (mode " + mode + ")");
            v.preload = "auto";
            v.src = url;
            v.load();
            var ok = await this._waitVideoReady(v, 8000);
            if (ok) {
                log("✅ SRT_EDIT: Vídeo carregat (file:// directa)");
                this._setVideoSrcTag("🌐 XARXA (UNC, sense còpia)");
                this._startVideoFrameMeter();
                await this._seekVideoToPlayhead();
                return true;
            }
            log("⚠️ SRT_EDIT: file:// directa bloquejada → copiant a C:\\temp...");
            return await this._loadVideoFallback(mediaPath);
        },

        /**
         * ORIGEN DEL VÍDEO (HUD): clic al HUD rota auto → unc → local → mem i recarrega
         * el clip actual. Serveix per mesurar amb el mateix HUD quina via va millor.
         */
        _bindVideoHud: function () {
            if (this._hudBound) return;
            var h = document.getElementById('srtVideoHud');
            if (!h) return;
            var self = this;
            h.addEventListener('click', function () { self._cycleVideoSource(); });
            h.title = "Clic: canvia l'origen del vídeo (auto / UNC / local / memòria)";
            this._hudBound = true;
            this._renderVideoHud();
        },

        _cycleVideoSource: function () {
            var modes = this._videoSourceModes || ['auto', 'unc', 'local', 'mem'];
            var i = modes.indexOf(this._videoSource);
            this._videoSource = modes[(i + 1) % modes.length];
            try { localStorage.setItem('fastpass_video_source', this._videoSource); } catch (e) { }
            log("🎞️ SRT_EDIT: Origen del visor → " + this._videoSource.toUpperCase() + " (clic al HUD per canviar)");
            this._renderVideoHud();
            if (this._videoMediaPath) {
                var self = this;
                this._loadVideo(this._videoMediaPath).then(function () { self._seekVideoToPlayhead(); }, function () { });
            }
        },

        /**
         * HUD DEL VISOR (diagnòstic): origen real del fitxer (MEMÒRIA/LOCAL/XARXA) i
         * fps que està pintant el <video>. Serveix per saber d'un cop d'ull si el
         * vídeo s'està refrescant de veritat.
         */
        _setVideoSrcTag: function (tag) {
            this._videoSrcTag = tag || '';
            this._renderVideoHud();
        },

        _renderVideoHud: function () {
            var h = document.getElementById('srtVideoHud');
            if (!h) return;
            var fps = (this._videoFps < 0) ? '—' : this._videoFps;
            var mode = String(this._videoSource || 'auto').toUpperCase();
            h.textContent = '[' + mode + '] ' + (this._videoSrcTag || '—') + ' · ' + fps + ' fps';
        },

        /**
         * _startVideoFrameMeter: Compta els frames REALS que el <video> entrega
         * (requestVideoFrameCallback) i els mostra al HUD 1 cop per segon.
         */
        _startVideoFrameMeter: function () {
            var v = document.getElementById('srtVideo');
            this._stopVideoFrameMeter();
            if (!v || typeof v.requestVideoFrameCallback !== 'function') {
                this._videoFps = -1;   // CEF sense rVFC: no es pot mesurar
                this._renderVideoHud();
                return;
            }
            var self = this;
            this._vfcLastT = 0;
            this._vfcCount = 0;
            this._vfcWallT = 0;
            var cb = function (now) {
                if (self._vfcId === null) return;
                self._vfcCount++;
                if (!self._vfcLastT) self._vfcLastT = now;
                self._vfcWallT = (window.performance && performance.now) ? performance.now() : Date.now();
                var dt = now - self._vfcLastT;
                if (dt >= 1000) {
                    self._videoFps = Math.round(self._vfcCount * 1000 / dt);
                    self._vfcCount = 0;
                    self._vfcLastT = now;
                    self._renderVideoHud();
                }
                try { self._vfcId = v.requestVideoFrameCallback(cb); } catch (e) { self._vfcId = null; }
            };
            try { this._vfcId = v.requestVideoFrameCallback(cb); } catch (e) { this._vfcId = null; }
            // Watchdog: si en 1,5 s no ha arribat cap frame (vídeo pausat o CEF que no
            // repinta), el HUD ho mostra com a 0 fps → diagnòstic immediat.
            this._vfcTimer = setInterval(function () {
                var w = (window.performance && performance.now) ? performance.now() : Date.now();
                if (self._vfcWallT && (w - self._vfcWallT) > 1500 && self._videoFps !== 0) {
                    self._videoFps = 0;
                    self._renderVideoHud();
                }
            }, 1000);
        },

        _stopVideoFrameMeter: function () {
            if (this._vfcId !== null && this._vfcId !== undefined) {
                try {
                    var v = document.getElementById('srtVideo');
                    if (v && typeof v.cancelVideoFrameCallback === 'function') v.cancelVideoFrameCallback(this._vfcId);
                } catch (e) { }
            }
            this._vfcId = null;
            if (this._vfcTimer) { clearInterval(this._vfcTimer); this._vfcTimer = null; }
            this._videoFps = -1;
        },

        /**
         * _ctiState: Classifica l'avanç del CTI entre polls. Els polls poden trigar
         * 0,25-3 s si el panell està ocupat, per això es mira la VELOCITAT
         * (Δ CTI / Δ temps real) i no el Δ absolut: un poll lent s'ha de llegir com
         * a reproducció, no com a salt (que pausava el vídeo = "no es refresca").
         * @param {number} deltaSec  - |CTI ara − CTI anterior|
         * @param {number} dtRealSec - temps real transcorregut entre els dos polls
         * @returns {string} 'stop' | 'play' | 'salt'
         */
        _ctiState: function (deltaSec, dtRealSec) {
            var dt = (dtRealSec && dtRealSec > 0.05) ? dtRealSec : 0.05;
            var vel = Math.abs(deltaSec) / dt;
            if (deltaSec < 0.08 || vel < 0.35) return 'stop';
            if (vel > 2.5) return 'salt';
            return 'play';
        },

        /**
         * _revokeVideoBlob: Allibera l'objectURL retingut (evita deixar 150-200 MB
         * en memòria en carregar un altre clip o en tancar el visor).
         */
        _revokeVideoBlob: function () {
            if (this._videoBlobUrl) {
                try { URL.revokeObjectURL(this._videoBlobUrl); } catch (e) { }
                this._videoBlobUrl = null;
            }
        },

        /**
         * _loadVideoFromMemory: Carrega el MP4 SENCER a memòria i el reprodueix des
         * d'un objectURL. Amb el fitxer al buffer del navegador, la reproducció no
         * depèn del NAS: desapareixen els tirones i els fotogrames negres.
         * @param {string} mediaPath
         * @returns {Promise<boolean>}
         */
        _loadVideoFromMemory: function (mediaPath) {
            var self = this;
            var v = document.getElementById('srtVideo');
            if (!v) return Promise.resolve(false);
            return new Promise(function (resolve) {
                var t0 = Date.now();
                var url = "file:////" + String(mediaPath).replace(/\\/g, "/");
                var xhr;
                try { xhr = new XMLHttpRequest(); } catch (eX) { return resolve(false); }
                try {
                    xhr.open('GET', url, true);
                    xhr.responseType = 'blob';
                    xhr.timeout = 25000;   // si el NAS va muy lent, es passa a la còpia local
                } catch (eO) { return resolve(false); }
                xhr.onload = function () {
                    try {
                        if (xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)) return resolve(false);
                        var blob = xhr.response;
                        if (!blob || !blob.size) return resolve(false);
                        self._revokeVideoBlob();
                        self._videoBlobUrl = URL.createObjectURL(blob);
                        v.preload = "auto";
                        v.src = self._videoBlobUrl;
                        v.load();
                        self._waitVideoReady(v, 8000).then(function (ok) {
                            if (!ok) { log("⚠️ SRT_EDIT: el blob a memòria no reprodueix (còdec?)"); return resolve(false); }
                            log("🎞️ SRT_EDIT: Vídeo A MEMÒRIA: " + (blob.size / 1048576).toFixed(1) + " MB en " +
                                ((Date.now() - t0) / 1000).toFixed(1) + "s · reproducció sense xarxa");
                            self._setVideoSrcTag("🧠 MEMÒRIA " + (blob.size / 1048576).toFixed(0) + "MB");
                            self._startVideoFrameMeter();
                            resolve(true);
                        });
                    } catch (eL) { resolve(false); }
                };
                xhr.onerror = function () { resolve(false); };
                xhr.ontimeout = function () {
                    log("⚠️ SRT_EDIT: el vídeo triga massa a baixar del NAS (25s) → còpia local");
                    resolve(false);
                };
                try { xhr.send(); } catch (eS) { resolve(false); }
            });
        },

        /**
         * _ensureLocalVideoCopy: Assegura una CÒPIA LOCAL del MP4 (C:\temp\fastpass_video)
         * i en retorna la ruta. Si ja existeix amb la mateixa mida que l'original, la
         * reutilitza (el mateix clip es reutilitza entre CARs). Amb el fitxer a disc
         * local, el <video> no depèn del NAS: s'eliminen els tirones per xarxa.
         * @param {string} mediaPath - Ruta UNC de l'original
         * @returns {Promise<string|null>}
         */
        _ensureLocalVideoCopy: async function (mediaPath) {
            try {
                var name = String(mediaPath).split(/[\\/]/).pop();
                if (!name) return null;
                var dir = 'C:/temp/fastpass_video';
                var dest = dir + '/' + name;
                var src = String(mediaPath).replace(/\\/g, "/").replace(/'/g, "");
                var res = await callJSX(
                    "(function(){try{var d=new Folder('" + dir + "');if(!d.exists)d.create();" +
                    "var s=new File('" + src + "');if(!s.exists)return 'ERR:no-src';" +
                    "var t=new File('" + dest + "');" +
                    "if(t.exists&&t.length===s.length)return 'CACHED;'+t.length;" +
                    "if(t.exists)t.remove();" +
                    "return s.copy(t)?('OK;'+t.length):'ERR:copy-false'}catch(e){return 'ERR:'+e.message}})()"
                );
                var parts = String(res).split(';');
                if (parts[0] === 'OK' || parts[0] === 'CACHED') {
                    var mb = parts[1] ? (parseFloat(parts[1]) / 1048576).toFixed(1) + ' MB' : '? MB';
                    log("🎞️ SRT_EDIT: còpia local del vídeo " + (parts[0] === 'CACHED' ? 'reutilitzada' : 'feta') + " (" + mb + ") → reproducció local");
                    return dest;
                }
                log("⚠️ SRT_EDIT: no s'ha pogut assegurar la còpia local del vídeo (" + res + ")");
                return null;
            } catch (e) {
                log("⚠️ SRT_EDIT: error amb la còpia local del vídeo: " + e.message);
                return null;
            }
        },

        _loadVideoFallback: async function (mediaPath) {
            var v = document.getElementById('srtVideo');
            if (!v) return false;
            try {
                try { window.cep.fs.makedir("C:/temp"); } catch (e1) { }
                // File.copy d'ExtendScript: fiable amb binari i rutes UNC
                var src = mediaPath.replace(/\\/g, "/").replace(/'/g, "");
                var copyResult = await callJSX(
                    "(function(){try{var f=new File('" + src + "');var d=new File('C:/temp/fastpass_media.mp4');"
                    + "if(d.exists)d.remove();var ok=f.copy(d);return ok?'OK':'ERR:copy=false'}catch(e){return 'ERR:'+e.message}})()"
                );
                if (copyResult !== "OK") {
                    log("⚠️ SRT_EDIT: copia del MP4 fallida → " + copyResult);
                    return false;
                }
                v.preload = "auto";
                v.src = "file:///C:/temp/fastpass_media.mp4";
                v.load();
                var ok = await this._waitVideoReady(v, 8000);
                if (ok) {
                    log("✅ SRT_EDIT: Vídeo carregat des de C:\\temp");
                    await this._seekVideoToPlayhead();
                    return true;
                }
                log("⚠️ SRT_EDIT: el MP4 local tampoc carrega (codec?)");
                return false;
            } catch (e) {
                log("⚠️ SRT_EDIT: Error fallback vídeo: " + e.message);
                return false;
            }
        },

        _waitVideoReady: function (v, timeoutMs) {
            return new Promise(function (resolve) {
                if (!v) return resolve(false);
                if (v.readyState >= 2) return resolve(true);
                var done = false, timer = null;
                var onOk = function () { finish(true); };
                var onErr = function () { finish(false); };
                var finish = function (ok) {
                    if (done) return; done = true;
                    v.removeEventListener('loadeddata', onOk);
                    v.removeEventListener('canplay', onOk);
                    v.removeEventListener('error', onErr);
                    if (timer) clearTimeout(timer);
                    resolve(ok);
                };
                v.addEventListener('loadeddata', onOk);
                v.addEventListener('canplay', onOk);
                v.addEventListener('error', onErr);
                timer = setTimeout(function () { finish(false); }, timeoutMs || 8000);
            });
        },

        _seekVideoToPlayhead: async function () {
            var v = document.getElementById('srtVideo');
            if (!v || v.readyState < 2) return;
            var ph = this._playheadSec;
            try {
                var cti = parseFloat(await callJSX("Timeline.get()"));
                if (!isNaN(cti)) {
                    var mPh = this._mediaAtSec(cti);
                    ph = (mPh < 0) ? cti : mPh;
                }
            } catch (e) { }
            v.currentTime = ph;
        },

        _syncVideo: function (mediaSec) {
            var v = document.getElementById('srtVideo');
            if (!v || !v.src) return;
            if (v.readyState < 2) return;
            // RUN: si l'usuari ha demanat PLAY (botó del panell) o el CTI confirma que
            // el timeline corre (espai a Premiere), el <video> ha de córrer SEMPRE.
            // Abans s'exigia `_timelineRunning` també amb el botó: si un poll arribava
            // tard (0,6-3 s), el Δ del CTI es prenia per un salt i el vídeo es PAUSAVA
            // → "no es refresca". Ara la pausa només la mana l'usuari.
            var run = !!(this._isPlaying || this._timelineRunning);
            var d = v.currentTime - mediaSec;
            var ad = Math.abs(d);
            var nowT = (window.performance && performance.now) ? performance.now() : Date.now();
            try {
                if (run) {
                    if (v.paused) {
                        // Transició d'arrencada: alinear el <video> al playhead abans de
                        // reproduir per no començar amb un desfàs que forci seeks.
                        if (ad > 0.05) { try { v.currentTime = mediaSec; } catch (eA) { } }
                        var pr = v.play(); if (pr && pr.catch) pr.catch(function () { });
                    }
                } else if (!v.paused) {
                    v.pause();
                }
            } catch (eP) { }
            // Re-llegir el drift (un seek d'alineació pot haver mogut v.currentTime).
            d = v.currentTime - mediaSec;
            ad = Math.abs(d);
            if (run) {
                // Reproducció real: el <video> és la FONT de la imatge i corre a 1x
                // nativa (els clips del timeline van SEMPRE al 100%). Per tant NO es
                // toca el playbackRate (rate ≠ 1 trenca la cadència i provoca els
                // micro-tirons); només es re-ancla amb un seek quan el desfàs és gran
                // (canvi de clip a una altra pista o deriva de rellotge), amb una
                // histèresi per no encadenar seeks.
                try { if (Math.abs(v.playbackRate - 1) > 0.005) v.playbackRate = 1; } catch (eR0) { }
                if (ad > 0.6 && (nowT - (this._lastVideoSeekT || 0)) > 250) {
                    this._lastVideoSeekT = nowT;
                    try { v.currentTime = mediaSec; } catch (eS) { }
                    if (getUtils().forceLog) {
                        getUtils().forceLog("🎞️ VSYNC seek (PLAY): drift=" + d.toFixed(2) + "s → media=" + mediaSec.toFixed(2));
                    }
                }
            } else {
                // Parat: posició exacta (seek només si el desfàs és perceptible).
                try { if (Math.abs(v.playbackRate - 1) > 0.005) v.playbackRate = 1; } catch (eR4) { }
                if (ad > 0.15) { try { v.currentTime = mediaSec; } catch (eS2) { } }
            }
            this._lastVideoDrift = d;
        },

        _setVideoRunning: function (run) {
            var v = document.getElementById('srtVideo');
            if (!v || !v.src) return;
            try {
                if (run) { if (v.paused) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () { }); } }
                else { if (!v.paused) v.pause(); }
            } catch (e) { }
        },

        _startPolling: function () {
            if (this._pollInterval) clearInterval(this._pollInterval);
            var self = this;
            this._pollInterval = setInterval(function () { if (self._pollBusy) return; self._pollBusy = true; self._pollTick().then(function () { self._pollBusy = false; }, function () { self._pollBusy = false; }); }, 400);
            // Seguiment CONTINU del cabezal. Només s'extrapola a 1× quan el timeline està
            // en PLAY (_timelineRunning=true); parat o amb salt, el CTI es considera fix
            // fins al proper poll per evitar deriva. El suavitzat evita salts.
            if (this._localPlayInterval) clearInterval(this._localPlayInterval);
            this._localPlayInterval = setInterval(function () {
                var now = (window.performance && performance.now) ? performance.now() : Date.now();
                var estTl;
                if (self._pendingSeek !== null && self._pendingSeek !== undefined) {
                    // Seek pendent (clic al canvas): usar el target per no derivar
                    estTl = self._pendingSeek;
                } else if (self._timelineRunning) {
                    // En PLAY: el temps de timeline avança a 1× entre polls
                    estTl = self._ctiSec + (now - self._ctiAt) / 1000;
                } else {
                    // Parat (o salt/scrub): el CTI és fix fins al proper poll → sense deriva
                    estTl = self._ctiSec;
                }
                if (estTl < 0) estTl = 0;
                var mPh = self._mediaAtSec(estTl);
                var ph = (mPh < 0) ? estTl : mPh;
                // En PLAY amb el <video> natiu corrent i ben sincronitzat amb el CTI
                // (drift petit), el rellotge mostrat és el del PROPI vídeo: és la font
                // de la imatge i corre natiu a 1x. Seguir-lo en lloc de fer-lo seguir
                // evita els micro-tirons del servo de seeks/rate. Si el drift creix
                // (>0.35s) tornem al mode perseguidor i _syncVideo re-ancla amb seek.
                var vT = -1;
                if (self._timelineRunning && !self._playheadLocal && (self._pendingSeek === null || self._pendingSeek === undefined)) {
                    var vEl = document.getElementById('srtVideo');
                    if (vEl && vEl.src && !vEl.paused && vEl.readyState >= 2) {
                        try { vT = vEl.currentTime; } catch (eVT) { vT = -1; }
                    }
                }
                if (vT >= 0 && self._timelineRunning) {
                    var _vDrift = vT - ph;
                    if (Math.abs(_vDrift) < 0.35) {
                        // Sincronitzat: el rellotge mostrat és el del propi vídeo.
                        self._playheadSec = vT;
                    } else if (Math.abs(_vDrift) > 0.6) {
                        // Salt de clip (canvi de pista/media no contigu) o deriva gran:
                        // re-anclar directe perquè _syncVideo faci UN sol seek (no dos).
                        self._playheadSec = ph;
                    } else {
                        // Desfàs mitjà: segueix amb el filtre suau.
                        self._playheadSec += (ph - self._playheadSec) * 0.6;
                    }
                } else {
                    self._playheadSec += (ph - self._playheadSec) * 0.6;
                }
                if (Math.abs(self._playheadSec - self._lastLocalT) < 0.02) return;
                self._lastLocalT = self._playheadSec;
                self.render();
                self._updatePreview(self._playheadSec);
                self._syncVideo(self._playheadSec);
            }, 100);
        },

        _pollTick: async function () {
            try {
                var now0 = (window.performance && performance.now) ? performance.now() : Date.now();
                var cti = await callJSX("Timeline.get()");
                var now1 = (window.performance && performance.now) ? performance.now() : Date.now();
                if (cti && cti !== "null" && cti !== "") {
                    var sec = parseFloat(cti);
                    if (!isNaN(sec)) {
                        // Si el playhead és LOCAL (més enllà de l'OUT), NO tocar _ctiSec
                        // amb el CTI real (que es queda a l'OUT): el _localPlayInterval
                        // faria revertir el playhead cap a l'OUT.
                        if (this._playheadLocal) {
                            this._lastCtiSec = sec;
                            this._updatePreview(this._playheadSec);
                            this._syncVideo(this._playheadSec);
                            this._pollCount = (this._pollCount || 0) + 1;
                            this.render();
                            return;
                        }
                        this._ctiSec = sec; // CTI real de Premiere (temps de timeline)
                        // El CTI llegat correspon a ~mig vol del evalScript (compensa latència)
                        this._ctiAt = now0 + (now1 - now0) / 2;
                        // Posició real en MEDIA
                        var mediaPh = this._mediaAtSec(sec);
                        var realPh = (mediaPh < 0) ? sec : mediaPh;
                        // Seek pendent (clic al canvas): no revertir el playhead fins que
                        // el CTI real arribi al target (evita "el clic no fa cas").
                        if (this._pendingSeek !== null && this._pendingSeek !== undefined) {
                            if (Math.abs(sec - this._pendingSeek) < 0.05) {
                                this._pendingSeek = null; // seek completat
                            } else if (Math.abs(sec - this._pendingSeek) > 1.0) {
                                // El CTI s'ha allunyat del target (moviment manual o PLAY):
                                // cancel·lar el seek pendent i seguir la lògica normal.
                                this._pendingSeek = null;
                            } else {
                                // El CTI encara no ha arribat al target: mantenir el
                                // playhead on el va deixar setPlayhead (punt del clic).
                                this._lastCtiSec = sec;
                                this._updatePreview(this._playheadSec);
                                this._syncVideo(this._playheadSec);
                                this._pollCount = (this._pollCount || 0) + 1;
                                this.render();
                                return;
                            }
                        }
                        // Detecció d'estat del cabezal PER VELOCITAT (Δ CTI / Δ temps real):
                        //  - Δ < 0,08 s o vel < 0,35× → parat (o jitter): posició exacta
                        //  - vel > 2,5×               → salt real (clic/scrub/seek)
                        //  - resta                    → reproducció, encara que el poll hagi
                        //    trigat 1-3 s. Abans es mirava el Δ absolut (>0,5 s = salt) i un
                        //    poll lent pausava el vídeo → "no es refresca".
                        var ctiDelta = Math.abs(sec - this._lastCtiSec);
                        var _dtReal = (now1 - (this._lastCtiT || now0)) / 1000;
                        this._lastCtiT = now1;
                        var _vel = ctiDelta / Math.max(0.05, _dtReal);
                        var _st = this._ctiState(ctiDelta, _dtReal);
                        if (_st === 'stop') {
                            this._timelineRunning = false;
                            this._playheadSec = realPh;
                        } else if (_st === 'salt') {
                            this._timelineRunning = false;
                            this._playheadSec = realPh;
                            log("🎯 PLY salt tl=" + sec.toFixed(2) + " real=" + realPh.toFixed(2) + " (Δ=" + ctiDelta.toFixed(2) + " vel=" + _vel.toFixed(2) + "x)");
                        } else {
                            // Transició parat → PLAY: alinear el playhead a l'instant real
                            // (el vídeo encara està pausat i arrencarà alineat al següent tick).
                            var _wasRunning = this._timelineRunning;
                            this._timelineRunning = true;
                            if (!_wasRunning) {
                                this._playheadSec = realPh;
                                this._lastCtiSec = sec;   // perquè el següent poll no el vegi com a salt
                            }
                            // Log throttled: escriure al fitxer a cada poll (250ms) tensa la
                            // UI i pot provocar talls al <video>. Com a màxim 1/s.
                            var _nowLog = (window.performance && performance.now) ? performance.now() : Date.now();
                            if ((_nowLog - (this._lastPlyLogT || 0)) > 1000) {
                                this._lastPlyLogT = _nowLog;
                                log("⏱ PLY tl=" + sec.toFixed(2) + " real=" + realPh.toFixed(2) + " show=" + this._playheadSec.toFixed(2) + " rtt=" + Math.round(now1 - now0) + "ms vel=" + _vel.toFixed(2) + "x driftV=" + (this._lastVideoDrift || 0).toFixed(2));
                            }
                        }
                        this._lastCtiSec = sec;
                        this._updatePreview(this._playheadSec);
                        // El <video> en PLAY el condueix el _localPlayInterval (reloj del
                        // propi vídeo); aquí només es reposiciona quan el CTI està parat
                        // o ha fet un salt (seek/scrub).
                        if (!this._timelineRunning) {
                            this._syncVideo(this._playheadSec);
                        }
                    }
                }
                this._pollCount = (this._pollCount || 0) + 1;
                this.render();
            } catch(e) { }
        },

        /**
         * Llegeix els clips de vídeo de la seqüència i construeix el mapa
         * temps_timeline → temps_media, perquè la waveform correspongui
         * a l'àudio que realment sona al timeline (IN/OUT/talls inclosos).
         */
        _refreshWaveformSegments: async function () {
            try {
                var tag = (this._waveformMediaTag || "").replace(/'/g, "");
                // Mateixa seqüència que el cabezal (getWorkSequence = projecte ancorat)
                var jsx = "(function(){try{var seq=($.global.FASTPASS&&FASTPASS.Context)?FASTPASS.Context.getWorkSequence():app.project.activeSequence;if(!seq)return'[]';var segs=[];var all=[];"
                    + "for(var v=0;v<seq.videoTracks.numTracks;v++){var clips=seq.videoTracks[v].clips;"
                    + "for(var i=0;i<clips.numItems;i++){var c=clips[i];var nm='';try{nm=c.projectItem?c.projectItem.name:''}catch(e2){}"
                    + "var o={v:v,s:c.start.seconds,e:c.end.seconds,m:c.inPoint.seconds,m2:c.outPoint.seconds,n:nm};all.push(o);"
                    + "if('" + tag + "'===''||nm.toUpperCase().indexOf('" + tag + "')>=0)segs.push(o)}}"
                    // FALLBACK: si el tag no coincideix amb cap clip, NO agafem TOTES les
                    // pistes (V1..V8). Els clips de grafismes/rètols/fons tenen inPoints
                    // propers a 0 i feien que l'eix (media IN mínim → _axisOrigin) baixés a
                    // 0: el clip del MP4 (media ≈20s = handle) es dibuixava 20s endavant i
                    // quedava un buit gran al principi del timeline del editor.
                    // Prioritat al fallback: la pista del MP4 (v=0 → V1); si no, tot.
                    + "var mode='tag';"
                    + "if(segs.length===0){mode='v1';for(var k=0;k<all.length;k++){if(all[k].v===0)segs.push(all[k]);}}"
                    + "if(segs.length===0){mode='all';segs=all}"
                    + "return JSON.stringify({seqName:String(seq.name),segs:segs,mode:mode})}catch(e){return'ERR:'+e.message}})()";
                var raw = await callJSX(jsx);
                if (!raw || raw.indexOf('ERR') === 0) return;
                var parsed = JSON.parse(raw);
                var arr = parsed.segs || (Array.isArray(parsed) ? parsed : []);
                var segs = [];
                for (var i = 0; i < arr.length; i++) {
                    var o = arr[i];
                    if (!isFinite(o.s) || !isFinite(o.e) || !isFinite(o.m)) continue;
                    // IMPORTANT: en aquests projectes els clips del timeline van SEMPRE al 100%
                    // (mai s'acceleren). L'outPoint del TrackItem NO és fiable com a fi de MEDIA:
                    // retorna valors que donaven velocitats absurdes (ex: r=1.86, r=10.6).
                    // Per tant, la durada en MEDIA = durada al timeline (velocitat 1x).
                    // Salvaguarda: si outPoint donés una velocitat "normal" (0.9-1.1x), es respecta.
                    var durTl = o.e - o.s;
                    var r = 1;
                    if (durTl > 0 && isFinite(o.m2) && o.m2 > o.m) {
                        var rCand = (o.m2 - o.m) / durTl;
                        if (rCand > 0.9 && rCand < 1.1) { r = rCand; }
                    }
                    segs.push({ v: o.v, s: o.s, e: o.e, m: o.m, r: r, n: o.n || "" });
                }
                segs.sort(function (a, b) { return a.v - b.v || a.s - b.s; });
                this._waveformSegments = segs;
                // Rang de media cobert pel timeline (recurs de la WF al trimeo real)
                var wfStart = Infinity, wfEnd = -Infinity;
                for (var wi = 0; wi < segs.length; wi++) {
                    var mIn = segs[wi].m;
                    var mOut = segs[wi].m + (segs[wi].e - segs[wi].s) * segs[wi].r;
                    if (mIn < wfStart) wfStart = mIn;
                    if (mOut > wfEnd) wfEnd = mOut;
                }
                this._wfMediaStart = isFinite(wfStart) ? wfStart : 0;
                this._wfMediaEnd = isFinite(wfEnd) ? wfEnd : 0;
                this._axisOrigin = this._wfMediaStart;   // eix del timeline: x=0 = IN del primer clip
                // DIAGNÒSTIC de l'origen del mapa: 'tag' = clips del MP4 triats pel nom;
                // 'v1' = fallback a la pista V1 (el tag no ha coincidit amb cap clip);
                // 'all' = totes les pistes (pitjor cas: l'eix pot baixar a 0 i el clip
                // del MP4 sortir desplaçat amb un buit gran al davant).
                log("📝 SRT_EDIT: Mapa de clips mode=" + (parsed.mode || "?") + " tag=\"" + tag +
                    "\" → _axisOrigin=" + this._axisOrigin.toFixed(2) + "s (" + segs.length + " segs)");
                if (parsed.mode && parsed.mode !== 'tag') {
                    log("⚠️ SRT_EDIT: cap clip del projecte conté el tag \"" + tag + "\" → mapa per " +
                        (parsed.mode === 'v1' ? "la pista V1" : "TOTES les pistes") +
                        ". Si el timeline de l'editor surt desplaçat, revisa el nom del MP4 al projecte.");
                }
                // Log diagnòstic quan canvia el mapa (o primer cop): resum de medias + primers segments
                if (this._lastSegLog !== segs.length) {
                    this._lastSegLog = segs.length;
                    log("📝 SRT_EDIT: WF segments=" + segs.length + " seq=\"" + (parsed.seqName || "?") + "\"");
                    var counts = {};
                    for (var c = 0; c < segs.length; c++) { var key = segs[c].n || "?"; counts[key] = (counts[key] || 0) + 1; }
                    for (var kname in counts) { log("📝 SRT_EDIT:   media " + counts[kname] + "x \"" + kname + "\""); }
                    var N = Math.min(8, segs.length);
                    for (var d = 0; d < N; d++) {
                        var sg = segs[d];
                        // media_out = m + (e - s) * r  (últim segon de media del segment)
                        var mOut = sg.m + (sg.e - sg.s) * sg.r;
                        log("📝 SRT_EDIT:   seg[" + d + "] v" + sg.v + " tl=" + sg.s.toFixed(2) + "-" + sg.e.toFixed(2) + "s (dur=" + (sg.e - sg.s).toFixed(2) + ") ← media=" + sg.m.toFixed(2) + "->" + mOut.toFixed(2) + "s r=" + sg.r.toFixed(3) + " \"" + (sg.n || "?") + "\"");
                    }
                }
            } catch(e) { }
        },

        stop: function () {
            if (this._pollInterval) {
                clearInterval(this._pollInterval);
                this._pollInterval = null;
            }
            if (this._localPlayInterval) {
                clearInterval(this._localPlayInterval);
                this._localPlayInterval = null;
            }
        },

        togglePlay: function () {
            this._isPlaying = !this._isPlaying;
            this._pendingSeek = null; // si hi ha un seek pendent, cancel·lar-lo
            var btn = document.getElementById('btnSrtPlay');
            var self = this;
            // El <video> s'ha de posar en marxa ALINEAT quan el CTI confirmi el PLAY
            // (ho fa _syncVideo al tick de 100ms); aquí només s'atura en PAUSA.
            if (!this._isPlaying) this._setVideoRunning(false);
            if (this._isPlaying) {
                if (this._playheadLocal) {
                    // PLAY LOCAL (més enllà de l'OUT): avançar el playhead a 1x en MEDIA
                    // sense dependre del CTI de Premiere (que es queda al final físic).
                    log("▶▶ PLAY LOCAL (més enllà de l'OUT): media=" + this._playheadSec.toFixed(2));
                    this._timelineRunning = true;
                    this._ctiAt = (window.performance && performance.now) ? performance.now() : Date.now();
                    this._setVideoRunning(true);
                    if (btn) btn.innerHTML = '⏸ PAUSA';
                    if (this._pollInterval) clearInterval(this._pollInterval);
                    this._pollInterval = setInterval(function () { if (self._pollBusy) return; self._pollBusy = true; self._pollTick().then(function () { self._pollBusy = false; }, function () { self._pollBusy = false; }); }, 400);
                    return;
                }
                log("▶▶ PLAY inici: media=" + this._playheadSec.toFixed(2) + " tl=" + this._ctiSec.toFixed(2));
                // Anclar el <video> al punt de sortida abans de deixar-lo córrer a 1x:
                // evita començar amb un drift gran que forci un seek durant la marxa.
                try {
                    var vPlay = document.getElementById('srtVideo');
                    if (vPlay && vPlay.src && vPlay.readyState >= 2) {
                        if (Math.abs(vPlay.currentTime - this._playheadSec) > 0.05) {
                            vPlay.currentTime = this._playheadSec;
                        }
                        try { vPlay.playbackRate = 1; } catch (eR9) { }
                    }
                } catch (eP9) { }
                callJSX("(function(){try{app.enableQE();qe.project.getActiveSequence().play();return'OK'}catch(e){return'ERR:'+e.message}})()").then(function(result){
                    log("📝 SRT: PLAY result: " + result);
                });
                if (btn) btn.innerHTML = '⏸ PAUSA';
                if (this._pollInterval) clearInterval(this._pollInterval);
                this._pollInterval = setInterval(function () { if (self._pollBusy) return; self._pollBusy = true; self._pollTick().then(function () { self._pollBusy = false; }, function () { self._pollBusy = false; }); }, 250);
                // (l'interpolació local del cabezal ja corre contínuament des de _startPolling)
            } else {
                if (this._playheadLocal) {
                    this._timelineRunning = false;
                    // Fixar la base al playhead actual perquè el _localPlayInterval no torni enrere.
                    this._ctiSec = this._tlAtMedia(this._playheadSec);
                    this._ctiAt = (window.performance && performance.now) ? performance.now() : Date.now();
                    log("⏸⏸ PAUSA LOCAL: media=" + this._playheadSec.toFixed(2));
                } else {
                    callJSX("(function(){try{app.enableQE();qe.project.getActiveSequence().stop();return'OK'}catch(e){return'ERR:'+e.message}})()").then(function(result){
                        log("📝 SRT: STOP result: " + result);
                    });
                }
                if (btn) btn.innerHTML = '▶ PLAY';
                log("⏸⏸ PAUSA: media=" + this._playheadSec.toFixed(2) + " tl=" + this._ctiSec.toFixed(2));
                if (this._pollInterval) clearInterval(this._pollInterval);
                this._pollInterval = setInterval(function () { if (self._pollBusy) return; self._pollBusy = true; self._pollTick().then(function () { self._pollBusy = false; }, function () { self._pollBusy = false; }); }, 400);
                this._pollTick(); // re-sincronitzar el playhead amb el CTI real de seguida
            }
        },

        // Layout únic compacte: regla a dalt + UNA zona de treball on la WF fa de
        // fons i els clips de subtítols hi queden superposats (semitransparents).
        _getLayout: function () {
            var zoneTop = this._rulerHeight + 1;   // la zona comença just sota la regla
            var zoneH = this._workZoneH || 40;
            var canvasH = zoneTop + zoneH + 1;
            return { rulerHeight: this._rulerHeight, zoneTop: zoneTop, zoneH: zoneH, canvasH: canvasH };
        },

        // Coordenada X del cursor en l'espai del canvas (compensa l'escalat CSS).
        _eventX: function (e) {
            var rect = this._canvas.getBoundingClientRect();
            var scaleX = (rect.width > 0) ? (this._canvas.width / rect.width) : 1;
            return (e.clientX - rect.left) * scaleX;
        },

        // Coordenada Y del cursor en l'espai del canvas (compensa l'escalat CSS).
        _eventY: function (e) {
            var rect = this._canvas.getBoundingClientRect();
            var scaleY = (rect.height > 0) ? (this._canvas.height / rect.height) : 1;
            return (e.clientY - rect.top) * scaleY;
        },

        // La REGLA és l'única zona del cabezal: tot el que queda per sota
        // (zona de treball WF+clips) és zona de marcadors.
        _inRulerZone: function (e) {
            return this._eventY(e) < this._getLayout().rulerHeight;
        },

        // ════════════════════════════════════════════════════════════════════
        // F3 · SELECCIO / ESBORRAT / SINTETICS / REOMLIMENT DE BUITS
        // ════════════════════════════════════════════════════════════════════

        /** _trackStyle: colors dels clips segons la taula que es veu. */
        _trackStyle: function () {
            // (BUG #188) `fillSint`/`strokeSint`: to propi de les entrades que el 🧩
            // ha encaixat al buit (venen del SINT) → es distingixen de la resta.
            var SINTF = { fillSint: 'rgba(212,120,32,0.55)', strokeSint: 'rgba(255,205,130,0.95)' };
            if (this._kind === 'SINT') return { fill: 'rgba(212,120,32,0.45)', stroke: 'rgba(255,210,150,0.95)', sel: 'rgba(255,190,90,0.85)', fillSint: SINTF.fillSint, strokeSint: SINTF.strokeSint };
            if (this._kind === 'MOD') return { fill: 'rgba(32,160,120,0.45)', stroke: 'rgba(170,255,225,0.95)', sel: 'rgba(120,255,200,0.85)', fillSint: SINTF.fillSint, strokeSint: SINTF.strokeSint };
            return { fill: 'rgba(143,74,212,0.45)', stroke: 'rgba(210,175,255,0.9)', sel: 'rgba(235,215,255,0.9)', fillSint: SINTF.fillSint, strokeSint: SINTF.strokeSint };
        },

        /** _clipAtSec: index de l'entrada que cau davall `sec` (o -1). */
        _clipAtSec: function (sec) {
            var list = this._entries || [];
            for (var i = 0; i < list.length; i++) {
                if (sec >= list[i].startSec && sec < list[i].endSec) return i;
            }
            return -1;
        },

        /**
         * _clipHitAtPx: quin clip cau davall una X del canvas i si el punt és al
         * CENTRE del clip (F3.4). Els extrems (franja de _CLIP_EDGE_PX px) no
         * alternen la selecció: queden reservats per a futurs retalls IN/OUT.
         * @returns {{index:number, inCenter:boolean}|null}
         */
        _clipHitAtPx: function (px) {
            var list = this._entries || [];
            for (var i = 0; i < list.length; i++) {
                var x0 = this._secToX(list[i].startSec);
                var x1 = this._secToX(list[i].endSec);
                if (x1 - x0 < 2) x1 = x0 + 2;   // clips quasi nuls → àrea mínima
                if (px < x0 || px > x1) continue;
                var edge = Math.min(this._CLIP_EDGE_PX || 4, (x1 - x0) * 0.25);
                return { index: i, inCenter: (px >= x0 + edge && px <= x1 - edge) };
            }
            return null;
        },

        /** _clipHitAtEvent: _clipHitAtPx amb les coordenades de l'esdeveniment. */
        _clipHitAtEvent: function (e) {
            return this._clipHitAtPx(this._eventX(e));
        },

        /** _selectedIndices: índexs VÀLIDS de la selecció (ordenats, sense duplicats). */
        _selectedIndices: function () {
            var out = [], src = this._selIndices || [];
            var n = (this._entries || []).length;
            for (var i = 0; i < src.length; i++) {
                var k = Number(src[i]);
                if (isFinite(k) && k >= 0 && k < n && out.indexOf(k) < 0) out.push(k);
            }
            out.sort(function (a, b) { return a - b; });
            return out;
        },

        /** _isSelected: l'entrada `i` és a la selecció? (el fa servir _drawTrack) */
        _isSelected: function (i) {
            return (this._selIndices || []).indexOf(i) >= 0;
        },

        /**
         * _setSelection: fixa la selecció (índexs vàlids i ordenats) i l'àncora
         * del Shift, i torna a pintar. Manté `_selIndex` = primer índex (per al
         * codi que encara el llig: exportar, Supr, missatges…).
         */
        _setSelection: function (list, anchor) {
            var valid = [];
            var n = (this._entries || []).length;
            for (var i = 0; i < (list || []).length; i++) {
                var k = Number(list[i]);
                if (isFinite(k) && k >= 0 && k < n && valid.indexOf(k) < 0) valid.push(k);
            }
            valid.sort(function (a, b) { return a - b; });
            this._selIndices = valid;
            var a = Number(anchor);
            this._selAnchor = (isFinite(a) && a >= 0 && a < n) ? a : (valid.length ? valid[0] : -1);
            this._selIndex = valid.length ? valid[0] : -1;
            this.render();
            return valid;
        },

        /** _clearSelection: cap clip seleccionat (NO pinta: ho fa qui crida). */
        _clearSelection: function () {
            this._selIndices = [];
            this._selAnchor = -1;
            this._selIndex = -1;
        },

        /** _logSelection: log + missatge d'estat de la selecció actual. */
        _logSelection: function () {
            var sel = this._selectedIndices();
            var n = (this._entries || []).length;
            if (!sel.length) {
                getUtils().status("Cap subtitol seleccionat", "warn");
                return;
            }
            if (sel.length === 1) {
                var e = this._entries[sel[0]];
                if (!e) return;
                log("📝 SRT_EDIT: seleccionat #" + (sel[0] + 1) + "/" + n + " [" + this._secToTimeStr(e.startSec) + " → " + this._secToTimeStr(e.endSec) + "] " +
                    (e.texts || []).join(' ').substring(0, 60));
                getUtils().status("Subtitol " + (sel[0] + 1) + "/" + n + " seleccionat · Supr esborra", "exito");
            } else {
                log("📝 SRT_EDIT: " + sel.length + " subtitols seleccionats (#" + sel.map(function (k) { return k + 1; }).join(', #') + ") · Supr esborra");
                getUtils().status(sel.length + " subtítols seleccionats · Supr esborra", "exito");
            }
        },

        /**
         * _toggleSelectionAt (F3.4): clic sobre el clip `i` de la zona de treball.
         *   - Shift+clic    → RANG des de l'àncora fins a `i` (Ctrl+Shift → uneix).
         *   - Ctrl/Cmd+clic → afig/leva `i` de la selecció (multi-selecció).
         *   - Clic simple   → només `i`; si ja era l'ÚNIC seleccionat → deselecciona.
         *   - `inCenter=false` (franja dels extrems) → selecciona sense alternar.
         */
        _toggleSelectionAt: function (i, ev, inCenter) {
            var e = ev || {};
            var ctrl = !!(e.ctrlKey || e.metaKey);
            var shift = !!e.shiftKey;
            var cur = this._selectedIndices();
            var n = (this._entries || []).length;
            if (i < 0 || i >= n) return cur;

            var anchor = (this._selAnchor >= 0 && this._selAnchor < n)
                ? this._selAnchor : (cur.length ? cur[0] : i);

            if (shift) {
                var a = Math.min(anchor, i), b = Math.max(anchor, i);
                var range = [];
                for (var k = a; k <= b; k++) range.push(k);
                if (ctrl) {
                    for (var c = 0; c < cur.length; c++) if (range.indexOf(cur[c]) < 0) range.push(cur[c]);
                }
                this._setSelection(range, anchor);
            } else if (ctrl) {
                var multi = cur.slice();
                var at = multi.indexOf(i);
                if (at >= 0) multi.splice(at, 1); else multi.push(i);
                this._setSelection(multi, i);
            } else if (cur.length === 1 && cur[0] === i) {
                // Clic simple damunt l'ÚNIC clip seleccionat → el deselecciona.
                this._clearSelection();
                this.render();
                log("📝 SRT_EDIT: #" + (i + 1) + " deseleccionat (clic al centre)");
                getUtils().status("Subtitol " + (i + 1) + " deseleccionat · Supr esborra", "warn");
                return [];
            } else if (!inCenter && cur.indexOf(i) >= 0) {
                // Extrem d'un clip ja seleccionat: no alterna (no es deselecciona sense voler).
                this._setSelection(cur, i);
            } else {
                this._setSelection([i], i);
            }
            this._logSelection();
            return this._selectedIndices();
        },

        /** _selectAtSec: selecciona el clip davall `sec` (compatibilitat F3.1). */
        _selectAtSec: function (sec) {
            var i = this._clipAtSec(sec);
            if (i < 0) {
                this._clearSelection();
                this.render();
                return -1;
            }
            if (this._selIndices.length === 1 && this._selIndices[0] === i) return i;
            this._setSelection([i], i);
            this._logSelection();
            return i;
        },

        /** _secToTimeStr: HH:MM:SS.mmm (nomes per als missatges). */
        _secToTimeStr: function (sec) {
            var s = Math.max(0, Number(sec) || 0);
            var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
            var ms = Math.round((s - Math.floor(s)) * 1000);
            var p = function (v, n) { var t = String(v); while (t.length < n) t = '0' + t; return t; };
            return p(h, 2) + ':' + p(m, 2) + ':' + p(ss, 2) + '.' + p(ms, 3);
        },

        /** _snapshotView: instantania COMPLETA de la taula viva (per poder tornar-hi). */
        _snapshotView: function () {
            var P = window.FASTPASS_UI.Logic.SrtParser;
            return {
                kind: this._kind,
                path: this._srtPath,
                name: this._srtName,
                fingerprint: this._srtFingerprint,
                entries: P.cloneEntries(this._entries),
                loadedEntries: P.cloneEntries(this._loadedEntries),
                originalEntries: P.cloneEntries(this._originalEntries),
                markers: (this._markers || []).slice(),
                originalMarkers: (this._originalMarkers || []).slice(),
                // (BUG #189) eixe desplaçament ja està aplicat a `entries` i `markers`:
                // si la vista torna a ser la viva cal saber-lo per a desar-los bé.
                sintShiftSec: Number(this._sintShiftSec) || 0,
                maxSec: this._maxSec,
                editWinStart: this._editWinStart,
                editWinEnd: this._editWinEnd,
                isDirty: this._isDirty
            };
        },

        /** _stashCurrentView: guarda la taula viva a _views[<kind>]. */
        _stashCurrentView: function () {
            if (!this._entries || this._entries.length === 0) return;
            this._views[this._kind] = this._snapshotView();
            log("📝 SRT_EDIT: taula " + this._kind + " guardada (" + this._entries.length + " entrades, " + this._srtName + ")");
        },

        /** _applyView: restaura una instantania damunt de la taula viva. */
        _applyView: function (v) {
            var P = window.FASTPASS_UI.Logic.SrtParser;
            this._srtPath = v.path || '';
            this._srtName = v.name || '';
            this._srtFingerprint = v.fingerprint || '';
            this._entries = P.cloneEntries(v.entries);
            this._loadedEntries = P.cloneEntries(v.loadedEntries);
            this._originalEntries = P.cloneEntries(v.originalEntries);
            this._markers = (v.markers || []).slice();
            this._originalMarkers = (v.originalMarkers || []).slice();
            // (BUG #189) la instantania pot portar la taula SINT ja desplaçada: el
            // desplaçament viatja amb ella per a poder desar els marcadors a l'eix
            // del FITXER i no tornar-los a moure en el pròxim carregament.
            this._sintShiftSec = Number(v.sintShiftSec) || 0;
            this._maxSec = v.maxSec || (this._entries.length ? this._entries[this._entries.length - 1].endSec + 10 : 120);
            this._editWinStart = (v.editWinStart != null) ? v.editWinStart : null;
            this._editWinEnd = (v.editWinEnd != null) ? v.editWinEnd : null;
            this._isDirty = !!v.isDirty;
            this._kind = String(v.kind || 'NORMAL').toUpperCase();
            this._clearSelection();
            this._timelineSubs = null;
        },

        /** switchView: alterna NORMAL↔SINT (o MOD) sense rellegir cap fitxer. */
        switchView: function (kind) {
            var k = String(kind || '').toUpperCase();
            var v = this._views[k];
            if (!v) return false;
            this._stashCurrentView();
            this._applyView(v);
            delete this._views[k];   // ara es viva: la instantania ja no cal
            this.render();
            log("📝 SRT_EDIT: vista " + k + " restaurada (" + this._entries.length + " entrades, " + this._srtName + ")");
            return true;
        },

        /** hasView: hi ha una taula guardada d'aquest tipus? */
        hasView: function (kind) {
            return !!this._views[String(kind || '').toUpperCase()];
        },

        /**
         * _refreshTimelineSubs: llig els clips de subtitol del timeline
         * [{t: pista, s: inici, e: final}] amb memoria curta de 4 s.
         */
        _refreshTimelineSubs: async function (force) {
            var now = Date.now();
            if (!force && this._timelineSubs && (now - this._timelineSubsAt) < 4000) return this._timelineSubs;
            var jsx = "(function(){try{var s=app.project.activeSequence;if(!s)return'ERR_NO_SEQ';"
                + "var out=[];if(s.subtitleTracks){var n=s.subtitleTracks.numTracks||s.subtitleTracks.numItems||0;"
                + "for(var t=0;t<n;t++){var tr=s.subtitleTracks[t];if(!tr||!tr.clips)continue;"
                + "for(var i=0;i<tr.clips.numItems;i++){var c=tr.clips[i];"
                + "out.push({t:t,s:c.start.seconds,e:c.end.seconds});}}}"
                + "return JSON.stringify(out)}catch(e){return'ERR:'+e.message}})()";
            var raw = await callJSX(jsx);
            var list = [];
            if (raw && String(raw).charAt(0) === '[') {
                try { list = JSON.parse(raw); } catch (eP) { list = []; }
            } else {
                log("⚠️ SRT_EDIT: no s'han pogut llegir els subtitols del timeline: " + raw);
            }
            this._timelineSubs = list;
            this._timelineSubsAt = now;
            return list;
        },

        /** _findTimelineSubAt: clip de subtitol del timeline que cau a `tlSec`. */
        _findTimelineSubAt: async function (tlSec) {
            var list = await this._refreshTimelineSubs(false);
            var tl = Number(tlSec) || 0;
            var best = null, bestD = Infinity;
            for (var i = 0; i < list.length; i++) {
                var s = list[i];
                if (tl >= s.s - 0.08 && tl < s.e - 0.02) return s;
                var d = Math.abs(s.s - tl);
                if (d < bestD) { bestD = d; best = s; }
            }
            return (best && bestD <= 0.2) ? best : null;
        },

        /**
         * _removeTimelineSubAt: esborra NOMES el clip de subtitol que cau a
         * `tlSec` (mai altres pistes ni altres clips). Deixa el forat (sense
         * ripple): els subtitols no s'han de desplaçar.
         */
        _removeTimelineSubAt: async function (tlSec) {
            var tc = (Number(tlSec) || 0).toFixed(3);
            var jsx = "(function(){try{var s=app.project.activeSequence;if(!s)return'ERR_NO_SEQ';"
                + "if(!s.subtitleTracks)return'ERR_NO_SUB_TRACKS';var tc=" + tc + ";"
                + "var n=s.subtitleTracks.numTracks||s.subtitleTracks.numItems||0;var best=null,bt=-1,bi=-1,bd=1e9;"
                + "for(var t=0;t<n;t++){var tr=s.subtitleTracks[t];if(!tr||!tr.clips)continue;"
                + "for(var i=0;i<tr.clips.numItems;i++){var c=tr.clips[i];var st=c.start.seconds,en=c.end.seconds;"
                + "var inside=(tc>=st-0.08&&tc<en-0.02);var d=inside?0:Math.abs(st-tc);"
                + "if((inside||d<=0.2)&&d<bd){bd=d;best=c;bt=t;bi=i;}}}"
                + "if(!best)return'ERR_NOT_FOUND_AT_'+tc;"
                + "try{best.remove()}catch(e1){best.remove(false,false)}return'OK_S'+(bt+1)+'_I'+bi}"
                + "catch(e){return'ERR:'+e.message}})()";
            return await callJSX(jsx);
        },

        /**
         * _detectExportTrack: en quina pista de subtitols ha aterrat el SRT
         * (1-based). Es mira quin clip comença al TC indicat; si la pista no
         * existia i se n'ha creat una de zero, `createCaptionTrack` pot haver
         * fet la S1 encara que es demanara la S2 → el log ha de dir la REAL.
         */
        _detectExportTrack: async function (tlSec, fallbackIdx) {
            try {
                var list = await this._refreshTimelineSubs(true);
                var tl = Number(tlSec) || 0;
                var bestT = -1;
                for (var i = 0; i < list.length; i++) {
                    if (Math.abs(list[i].s - tl) <= 0.25 && list[i].t > bestT) bestT = list[i].t;
                }
                if (bestT >= 0) return bestT + 1;
            } catch (eT) { }
            return (Number(fallbackIdx) || 0) + 1;
        },

        /**
         * deleteSelected (F3.1 · F3.4): esborra els subtítols SELECCIONATS
         * (un o molts, amb Ctrl/Shift+clic) o, si no n'hi ha cap, el que cau
         * davall el cabezal.
         *   - Taula: les entrades ixen de _entries → no s'exportaran. El .srt del
         *     NAS no es toca mai (i _loadedEntries es conserva → ♻️ ho restaura).
         *   - Timeline: si algun subtitol ja esta inserit, es pregunta UNA SOLA
         *     VEGADA i (opcional) s'esborra NOMES eixe clip de la seua pista de
         *     subtitols (sense ripple).
         * @param {Object} [opts] { alsoTimeline: true|false } (salta la confirmacio)
         */
        deleteSelected: async function (opts) {
            var o = opts || {};
            var P = window.FASTPASS_UI.Logic.SrtParser;
            if (!this._entries || this._entries.length === 0) {
                getUtils().status("No hi ha entrades per esborrar", "warn");
                return false;
            }
            // (F3.4, 2026-10-21) MULTI: esborra TOTS els clips seleccionats
            // (Ctrl/Shift+clic). Sense selecció → l'entrada davall el cabezal
            // (comportament F3.1, per si es crida des de Supr sense haver clicat cap clip).
            var idxs = this._selectedIndices();
            if (!idxs.length) {
                var single = (this._selIndex >= 0 && this._selIndex < this._entries.length)
                    ? this._selIndex : P.findTargetByTime(this._entries, this._playheadSec);
                if (single < 0) {
                    getUtils().status("Cap subtitol seleccionat (clic al clip) ni davall el cabezal", "warn");
                    return false;
                }
                idxs = [single];
            }
            // 1) Quins clips ja són al timeline? (una consulta per entrada)
            var tlOf = {}, subOf = {}, withSub = [];
            for (var q = 0; q < idxs.length; q++) {
                var eq = this._entries[idxs[q]];
                if (!eq) continue;
                var tlq = this._tlAtMedia(eq.startSec);
                tlOf[idxs[q]] = tlq;
                var subq = null;
                try { subq = await this._findTimelineSubAt(tlq); } catch (eF) { log("⚠️ SRT_EDIT: consulta del timeline: " + eF.message); }
                subOf[idxs[q]] = subq;
                if (subq) withSub.push(idxs[q]);
            }

            // 2) UNA sola confirmació per a tot el bloc (no una per clip).
            var alsoTimeline = false;
            if (withSub.length) {
                if (o.alsoTimeline === true) alsoTimeline = true;
                else if (o.alsoTimeline === false) alsoTimeline = false;
                else if (typeof window.confirm === 'function') {
                    var pistes = [];
                    for (var w = 0; w < withSub.length; w++) {
                        var sw = subOf[withSub[w]];
                        if (sw && pistes.indexOf(Number(sw.t) + 1) < 0) pistes.push(Number(sw.t) + 1);
                    }
                    alsoTimeline = window.confirm(
                        (withSub.length === 1
                            ? "Aquest subtitol ja esta al timeline"
                            : withSub.length + " d'aquests " + idxs.length + " subtitols ja estan al timeline") +
                        " (pista S" + pistes.join('/S') + ").\n\n" +
                        "Accepta = esborrar-los DEL TIMELINE tambe.\n" +
                        "Cancel·la = esborrar-los nomes de la taula (no s'exportaran)."
                    );
                } else alsoTimeline = true;
            }

            // 3) Timeline (si s'ha acceptat): clip a clip; la llista es refresca
            //    a cada borrat perquè els índexs dels clips de subtítol canvien.
            if (alsoTimeline) {
                for (var r = 0; r < withSub.length; r++) {
                    var tlR = tlOf[withSub[r]];
                    var res = await this._removeTimelineSubAt(tlR);
                    log("📝 SRT_EDIT: esborrat del timeline a tl " + tlR.toFixed(3) + "s → " + res);
                }
                this._timelineSubs = null;
            }
            // 4) Taula: de DALT a BAIX (índexs descendents) perquè l'índex no es
            //    desplace mentre s'esborra. _entries i _originalEntries van 1:1:
            //    si no s'esborra també de l'original, qualsevol drag de marcador
            //    reconstruiria la taula desde ella i els subtítols tornarien.
            var removed = [];
            var desc = idxs.slice().sort(function (a, b) { return b - a; });
            for (var d = 0; d < desc.length; d++) {
                var kd = desc[d];
                var ek = this._entries[kd];
                if (!ek) continue;
                removed.push({
                    n: kd + 1,
                    t0: this._secToTimeStr(ek.startSec),
                    t1: this._secToTimeStr(ek.endSec),
                    txt: String((ek.texts || []).join(' ')).substring(0, 50)
                });
                this._entries = P.removeEntryAt(this._entries, kd);
                this._originalEntries = P.removeEntryAt(this._originalEntries, kd);
            }
            removed.sort(function (a, b) { return a.n - b.n; });   // missatge en ordre de taula
            this._clearSelection();
            this._isDirty = true;
            this.render();

            var detall = removed.map(function (x) {
                return "#" + x.n + " [" + x.t0 + " → " + x.t1 + "] " + x.txt;
            }).join(' | ');
            log("📝 SRT_EDIT: " + removed.length + " entrada(es) esborrada(es) " +
                (alsoTimeline ? "+ timeline" : "(nomes taula)") + " · queden " + this._entries.length + " · " + detall);
            getUtils().status((removed.length === 1 ? "Esborrat 1 subtitol" : "Esborrats " + removed.length + " subtitols") +
                (alsoTimeline ? " (taula + timeline)" : " (taula)") + " · queden " + this._entries.length, "exito");
            return true;
        },

        /**
         * _applySintAlignment (BUG #189 · 2026-10-23): porta les entrades SINT a
         * l'eix del SRT NORMAL (temps de MEDIA del clip).
         *
         * Els `.srt` sintetics no comencen al media 0 del clip: el seu 00:00:00 es
         * l'inici del material del qual s'han generat. Mesurat en viu (22/10):
         * -16,97 s al TN_COMARQUES V3 i -39,55 s al V1 (ELS_DIPOSTIS) — per aixo
         * NO es pot usar una constant. Aci es MESURA amb les frases en comu
         * (`SrtParser.estimateOffsetSec`) i es desplaça la taula SINT sencera
         * (entrades, taula carregada, taula original, marcadors i `maxSec`).
         *
         * Es IDEMPOTENT: un colp ajustada, la mediana torna a ser ~0 i no es toca
         * res mes; per aixo es pot cridar abans de cada fusio.
         *
         * @returns {Object|null} l'estimacio ({offsetSec,pairs,used,spreadSec,method})
         *   o null si encara no hi ha les dos taules (NORMAL i SINT).
         */
        _applySintAlignment: function () {
            var P = window.FASTPASS_UI.Logic.SrtParser;
            if (!P || typeof P.estimateOffsetSec !== 'function' || typeof P.shiftEntries !== 'function') return null;
            var baseView = this._views['NORMAL'] || null;
            var base = baseView ? baseView.entries : (this._kind === 'NORMAL' ? this._entries : null);
            if (!base || base.length === 0) return null;
            var holder = (this._kind === 'SINT') ? this : (this._views['SINT'] || null);
            if (!holder || !holder.entries || holder.entries.length === 0) return null;
            var est = P.estimateOffsetSec(base, holder.entries);
            var name = holder.name || this._srtName || '?';
            if (est.method === 'fora-de-rang') {
                log("⚠️ SINT_AJUST: desfasament mesurat de " + Number(est.offsetSecRaw).toFixed(1) +
                    "s (" + est.pairs + " frases en comu) → NO es creible, NO s'ajusta el SINT «" + name + "»", "WARN");
                return est;
            }
            var d = Number(est.offsetSec) || 0;
            if (est.used < 3 || Math.abs(d) < 0.25) {
                log("🎯 SINT_AJUST: res a desplaçar · " + est.pairs + " frases en comu, " + est.used +
                    " usades · Δ=" + d.toFixed(2) + "s · SINT=" + name);
                return est;
            }
            holder.entries = P.shiftEntries(holder.entries, d);
            if (holder.loadedEntries && holder.loadedEntries.length) holder.loadedEntries = P.shiftEntries(holder.loadedEntries, d);
            if (holder.originalEntries && holder.originalEntries.length) holder.originalEntries = P.shiftEntries(holder.originalEntries, d);
            if (holder.markers && holder.markers.length) {
                holder.markers = holder.markers.map(function (m) { return Math.max(0, m + d); });
            }
            if (holder.originalMarkers && holder.originalMarkers.length) {
                holder.originalMarkers = holder.originalMarkers.map(function (m) { return Math.max(0, m + d); });
            }
            // El desplaçament s'ACUMULA: una segona fusió pot corregir un residual
            // (p. ex. 0,8 s) i eixe total és el que cal desfer en desar els marcadors.
            var shPrev = (holder === this) ? (Number(this._sintShiftSec) || 0) : (Number(holder.sintShiftSec) || 0);
            var shNow = shPrev + d;
            if (holder === this) this._sintShiftSec = shNow; else holder.sintShiftSec = shNow;
            if (holder === this) {
                // (_markers es reinicia just despres a loadSrt i es desplaça en
                //  restaurar-los; ací NO s'han de tocar)
                this._maxSec = this._entries.length
                    ? this._entries[this._entries.length - 1].endSec + 10
                    : Math.max(1, (Number(this._maxSec) || 0) + d);
            } else if (holder.maxSec != null) {
                holder.maxSec = Math.max(1, Number(holder.maxSec) + d);
            }
            var first = holder.entries[0], last = holder.entries[holder.entries.length - 1];
            log("✅ SINT_AJUST: «" + name + "» desplaçat " + d.toFixed(2) + "s per a quadrar-lo amb el SRT normal" +
                " · " + est.pairs + " frases en comu (" + est.used + " usades, dispersio " + est.spreadSec.toFixed(2) + "s)" +
                " · ara " + holder.entries.length + " entrades de " + this._secToTimeStr(first.startSec) +
                " a " + this._secToTimeStr(last.endSec));
            return est;
        },

        /**
         * mergeSyntheticGaps (F3.3 · opcio B): reomple els BUITS del SRT normal
         * amb les entrades SINTETIQUES que hi cauen.
         *   - MAI toca les entrades existents (start/end/text queden igual).
         *   - El resultat viu en una vista MOD, en la MATEIXA pista de la taula
         *     (el NORMAL es conserva intacte) i NO s'exporta al timeline: allo es
         *     fa a posta amb 💾 (BUG #188).
         *   - (BUG #188) Si un SINT no hi cap exacte, s'ENCOGEIX fins a la vora del
         *     buit (`general.srtSyntheticMaxTrimSec`, defecte 0,8 s) sense quedar-se
         *     per davall de `general.srtSyntheticMinDurSec` (0,4 s).
         *   - Sense SINT carregat (Ctrl+clic a CARREGAR) o sense buits → avisa.
         * @returns {Promise<boolean>} true si s'ha afegit alguna entrada
         */
        mergeSyntheticGaps: async function () {
            var P = window.FASTPASS_UI.Logic.SrtParser;
            // (BUG #189) Les dos taules s'han de creuar en el MATEIX eix de temps:
            // el SINT es desplaça a l'eix de MEDIA del NORMAL abans de fusionar.
            this._applySintAlignment();
            var baseView = this._views['NORMAL'] || null;
            var base = baseView ? baseView.entries : (this._kind === 'NORMAL' ? this._entries : null);
            var sint = (this._kind === 'SINT') ? this._entries : (this._views['SINT'] ? this._views['SINT'].entries : null);
            // (2026-10-23) Nom del .srt sintètic en ús: al log ha de quedar clar D'ON
            // surten les entrades afegides (cal poder verificar la càrrega dels SINT).
            var sintName = (this._kind === 'SINT') ? (this._srtName || '')
                : (this._views['SINT'] ? (this._views['SINT'].name || '') : '');
            if (!base || base.length === 0) {
                getUtils().status("Cal el SRT NORMAL carregat per reomplir buits", "warn");
                return false;
            }
            if (!sint || sint.length === 0) {
                getUtils().status("Cal carregar els SINT abans (Ctrl+clic a CARREGAR)", "warn");
                return false;
            }
            var cfg = (window.FASTPASS_UI.Config && window.FASTPASS_UI.Config.get) ? window.FASTPASS_UI.Config.get() : null;
            var tol = (cfg && cfg.srtSyntheticGapTolSec != null) ? Number(cfg.srtSyntheticGapTolSec) : 0.2;
            // (BUG #188) Marge de RETALL: el sintetic s'encongeix fins al buit si el
            // retall no passa de `maxTrim` i la durada final no baixa de `minDur`.
            var minDur = (cfg && cfg.srtSyntheticMinDurSec != null) ? Number(cfg.srtSyntheticMinDurSec) : 0.4;
            var maxTrim = (cfg && cfg.srtSyntheticMaxTrimSec != null) ? Number(cfg.srtSyntheticMaxTrimSec) : 0.8;
            var res = P.mergeSyntheticGaps(base, sint, { tolSec: tol, minDurSec: minDur, maxTrimSec: maxTrim });
            // (2026-10-23) GUARDA DE PERTINENÇA: el Scanner ja només deixa passar
            // sintètics del MATEIX PROGRAMA (BUG #187), però pot ser el d'un ALTRE
            // BLOC d'eixe programa (N2) i ompliria buits amb frases d'un altre guió.
            // Mirem quin % de frases compartixen (sense mirar TC) i avisem si és molt baix.
            var ovl = (typeof P.textOverlap === 'function') ? P.textOverlap(base, sint) : null;
            if (ovl) {
                log("📝 SRT_EDIT: SINT↔NORMAL comparteixen " + ovl.hits + "/" + ovl.total +
                    " frases (" + ovl.pct + "%) · SINT=" + (sintName || '?'));
                if (sint.length >= 10 && ovl.pct < 20) {
                    log("⚠️ SRT_EDIT: el SINT «" + (sintName || '?') + "» només coincidix en el " + ovl.pct +
                        "% de les frases → pot ser d'un ALTRE bloc/guio del mateix programa", "WARN");
                    getUtils().status("⚠️ SINT poc coincident amb el SRT (" + ovl.pct + "%): mira el log abans de guardar", "warn");
                }
            }
            if (!res.added.length) {
                // (2026-10-23) Desglossem els motius: 'solapa' = TC xocat; 'duplicat-text'
                // = la mateixa frase ja hi era (comparació de text); 'fora-del-tram' = fora;
                // (BUG #188) 'massa-curt' / 'no-cab' = el buit no dona per al sintetic.
                var rTxt = res.rejected.filter(function (x) { return x.reason === 'duplicat-text'; }).length;
                var rSol = res.rejected.filter(function (x) { return x.reason === 'solapa'; }).length;
                var rCurt = res.rejected.filter(function (x) { return x.reason === 'massa-curt'; }).length;
                var rNoCab = res.rejected.filter(function (x) { return x.reason === 'no-cab'; }).length;
                getUtils().status("SINT: cap buit a reomplir (" + res.rejected.length + " entrades descartades)", "warn");
                log("📝 SRT_EDIT: fusio SINT sense canvis · SINT=" + (sintName || '?') +
                    " · base=" + base.length + " · sint=" + sint.length +
                    " · buits=" + res.gaps.length + " · descartades=" + res.rejected.length +
                    " (solapa=" + rSol + ", duplicat-text=" + rTxt + ", massa-curt=" + rCurt + ", no-cab=" + rNoCab + ")" +
                    " · tol=" + res.tolSec + "s · retall màx=" + res.maxTrimSec + "s · durada mín=" + res.minDurSec + "s");
                return false;
            }
            // Guardar la taula viva abans de canviar de vista
            this._stashCurrentView();
            if (baseView) {
                this._srtPath = baseView.path || this._srtPath;
                this._srtName = baseView.name || this._srtName;
                this._srtFingerprint = baseView.fingerprint || this._srtFingerprint;
            }
            this._entries = P.cloneEntries(res.entries);
            this._originalEntries = P.cloneEntries(res.entries);
            // (BUG #188) QUINES entrades són NOVES (venen del SINT): a l'editor es
            // pinten amb un to propi i NO s'exporta res sol: el timeline es toca
            // només quan l'usuari prem 💾 (abans el 🧩 hi col·locava els clips).
            this._gapAdded = P.cloneEntries(res.added);
            log("🧩 SRT_EDIT: " + this._gapAdded.length + " entrades SINT encaixades als buits de la taula (" +
                res.trimmed + " retallades) · MOD a l'editor, sense exportar");
            // Base del RESET ♻️: la taula NORMAL (la fusio no sobreescriu el fitxer)
            this._loadedEntries = P.cloneEntries(base);
            var mk = baseView ? (baseView.markers || []) : (this._markers || []);
            this._markers = mk.slice();
            this._originalMarkers = mk.slice();   // warp identitat: res es mou per si sol
            this._kind = 'MOD';
            this._clearSelection();
            this._isDirty = true;
            this._maxSec = (res.entries.length ? res.entries[res.entries.length - 1].endSec + 10 : this._maxSec);
            this.render();
            var detall = res.added.slice(0, 6).map(function (a) {
                return this._secToTimeStr(a.startSec) + '→' + this._secToTimeStr(a.endSec) + ' «' + (a.texts || []).join(' ').substring(0, 40) + '»';
            }, this).join(' | ');
            log("📝 SRT_EDIT: fusio SINT → " + res.added.length + " entrades afegides (" + res.trimmed + " retallades · tol " + res.tolSec + "s, retall màx " + res.maxTrimSec + "s, durada mín " + res.minDurSec + "s) · " +
                "SINT=" + (sintName || '?') + " (" + sint.length + " entrades) · " +
                res.rejected.length + " descartades · " + (res.entries.length - base.length) + " noves de " + res.entries.length + " · " + detall);
            getUtils().status("Reomplert: " + res.added.length + " entrades SINT en " + res.gaps.length + " buits" +
                (res.trimmed ? " (" + res.trimmed + " retallades)" : "") + " · MOD (prem 💾 per al timeline)", "exito");
            return true;
        },

        render: function () {
            if (!this._ctx || !this._canvas) return;
            var ctx = this._ctx;
            var origin = this._axisOrigin || 0;
            // (#132) L'amplada es calcula sobre la FINESTRA d'edició (peça + marge),
            // no sobre el clip sencer: un clip llarg ja no aplana la vista.
            var canvasW = Math.max(1800, (this._viewEnd() - this._viewOrigin()) * this._pixelsPerSec + 100);
            if (!isFinite(canvasW) || canvasW > 60000) canvasW = 60000; // guard de seguretat (evita cuelgues)
            var L = this._getLayout();
            this._canvas.width = canvasW;
            this._canvas.height = L.canvasH;
            
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvasW, L.canvasH);
            
            this._drawRuler(ctx);
            // Capes superposades a la zona de treball: primer la WF (fons) i per
            // sobre els clips de subtítols semitransparents → es veuen les pauses
            // d'àudio a través dels clips per encaixar els subtítols.
            this._drawWaveform(ctx, L.zoneTop, L.zoneH);
            this._drawTrack(ctx, L.zoneTop, L.zoneH);
            // El playhead es dibuixa ABAIX dels marcadors perquè no els tapi
            // (els marcadors sempre visibles durant el drag).
            this._drawPlayhead();
            this._drawMarkers(ctx);

            // Actualitzar la barra de zoom (estil Premiere) i mantenir el cabezal visible
            this._updateZoomBar();
            this._ensurePlayheadVisible();
        },

        // Eix del timeline: x=0 correspon a l'ORIGEN VISIBLE (la finestra d'edició si
        // està fixada; si no, l'IN del primer clip = _axisOrigin).
        // Així el que es veu a l'extensió coincideix amb el que es veu al timeline de Premiere
        // (regla, subtítols i waveform es mostren en temps de TIMELINE, no de media).

        /** _viewOrigin: inici de l'eix visible (finestra d'edició si n'hi ha). */
        _viewOrigin: function () {
            return (this._editWinStart != null) ? this._editWinStart : (this._axisOrigin || 0);
        },

        /** _viewEnd: final de l'eix visible (finestra d'edició si n'hi ha). */
        _viewEnd: function () {
            return (this._editWinEnd != null) ? this._editWinEnd : (this._maxSec || 0);
        },

        /**
         * _setEditWindow: Fixa la finestra d'edició al tram dels subtítols actuals
         * (#132): [primer inici − marge esquerre, últim final + marge dret].
         * El marge esquerre (`general.srtEditMarginLeftSec`, defecte 0,4 s) s'ancora al
         * primer clip o a l'IN del clip (el que sigui més tardà) i NO pot quedar-se'l
         * el terra de l'eix: si el primer clip ja està a tocar de l'IN, el borde queda
         * igualment a `mL` del clip (abans el terra `_axisOrigin` anul·lava el marge).
         * Cridat pels botons IN i OUT de l'editor. Sense entrades → s'allibera.
         */
        _setEditWindow: function () {
            if (!this._entries || this._entries.length === 0) { this._clearEditWindow(); return; }
            var cfg = (window.FASTPASS_UI.Config && window.FASTPASS_UI.Config.get) ? window.FASTPASS_UI.Config.get() : null;
            var mR = (cfg && cfg.srtEditMarginRightSec != null) ? Number(cfg.srtEditMarginRightSec) : 4;
            var mL = (cfg && cfg.srtEditMarginLeftSec != null) ? Number(cfg.srtEditMarginLeftSec) : 0.4;
            if (!isFinite(mR) || mR < 0) mR = 4;
            if (!isFinite(mL) || mL < 0) mL = 0.4;
            var first = this._entries[0].startSec;
            var lastEnd = this._entries[this._entries.length - 1].endSec;
            var minStart = this._axisOrigin || 0;
            // Àncora = el més tardà entre el primer clip i l'IN del clip. El terra a 0 evita
            // que el regle dibuixi temps negatius si el clip carregat comença a 0.
            var anchor = Math.max(first, minStart);
            this._editWinStart = Math.max(0, anchor - mL);
            this._editWinEnd = lastEnd + mR;
            log("📝 SRT_EDIT: Finestra d'edició [" + this._editWinStart.toFixed(2) + "s → " + this._editWinEnd.toFixed(2) +
                "s] (media, marges -" + mL + "s/+" + mR + "s · àncora " + anchor.toFixed(2) + "s) · clip sencer = " +
                (0).toFixed(0) + "→" + ((this._maxSec || 0) - minStart).toFixed(1) + "s");
        },

        /** _clearEditWindow: Torna a l'eix sencer del clip carregat. */
        _clearEditWindow: function () {
            this._editWinStart = null;
            this._editWinEnd = null;
        },

        _secToX: function (sec) {
            return (sec - this._viewOrigin()) * this._pixelsPerSec;
        },

        _xToSec: function (px) {
            return px / this._pixelsPerSec + this._viewOrigin();
        },

        _drawRuler: function (ctx) {
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(0, 0, this._canvas.width, this._rulerHeight);
            ctx.fillStyle = '#888';
            ctx.font = '9px monospace';
            ctx.strokeStyle = '#555';
            var secInterval = Math.max(1, Math.floor(40 / this._pixelsPerSec));
            var origin = this._axisOrigin || 0;
            // (#132) El regle dibuixa l'eix VISIBLE (finestra d'edició si n'hi ha).
            for (var s = this._viewOrigin(); s <= this._viewEnd(); s += secInterval) {
                var x = this._secToX(s);
                ctx.beginPath();
                ctx.moveTo(x, this._rulerHeight - 6);
                ctx.lineTo(x, this._rulerHeight);
                ctx.stroke();
                var showSec = s - origin;   // temps de TIMELINE (0 = IN del clip)
                var mm = Math.floor(showSec / 60);
                var ss = Math.floor(showSec % 60);
                ctx.fillText((mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss, x + 2, this._rulerHeight - 2);
            }
        },

        // Clips de subtítols SEMITRANSPARENTS superposats a la WF (fons): el fill
        // translúcid deixa veure les pauses d'àudio per sota i encaixar els
        // subtítols sense necessitar una franja pròpia per als clips.
        _drawTrack: function (ctx, y, h) {
            var bh = h - 3;               // alçada del bloc del clip (marge vertical)
            var by = y + 1;
            var st = this._trackStyle();
            // (F3.4) Selecció MÚLTIPLE: tots els clips de _selIndices es ressalten
            // (si algú deixa només _selIndex posat, també es pinta).
            var sel = this._selectedIndices();
            if (!sel.length && this._selIndex >= 0) sel = [this._selIndex];
            for (var i = 0; i < this._entries.length; i++) {
                var e = this._entries[i];
                var x = this._secToX(e.startSec);
                var w = (e.endSec - e.startSec) * this._pixelsPerSec;
                if (w < 2) w = 2;
                var isSel = (sel.length > 0) && (sel.indexOf(i) >= 0);
                // (BUG #188) Entrada SINT encaixada al buit: to propi + barra a dalt.
                var fromSint = !!e.sint;
                ctx.fillStyle = fromSint ? st.fillSint : st.fill;   // lila / taronja (SINT) / verd (MOD)
                ctx.fillRect(x, by, w, bh);
                if (isSel) {
                    // F3.1: el clip SELECCIONAT es veu de seguida (vel + marc blanc)
                    ctx.fillStyle = st.sel;
                    ctx.fillRect(x, by, w, bh);
                }
                if (fromSint && w >= 3) {
                    ctx.fillStyle = st.strokeSint;
                    ctx.fillRect(x, by, w, 2);
                }
                if (w >= 4) {
                    ctx.strokeStyle = isSel ? '#ffffff' : (fromSint ? st.strokeSint : st.stroke);
                    ctx.lineWidth = isSel ? 2 : 1;
                    ctx.strokeRect(x + (isSel ? 1 : 0.5), by + (isSel ? 1 : 0), w - (isSel ? 2 : 1), bh - (isSel ? 2 : 0));
                }
                // Número d'entrada: prou per saber quants clips hi ha i quin s'esborra.
                // (2026-10-23) FORA el text del subtítol dins del clip: tapava la WF i,
                // a 8 px, era il·legible. El text es llig a la vista de vídeo / taula.
                if (w >= 26 && bh >= 18) {
                    ctx.fillStyle = isSel ? '#101010' : 'rgba(240,235,255,0.92)';
                    ctx.font = '8px monospace';
                    ctx.fillText(String(i + 1), x + 3, by + bh - 4);
                }
            }
        },

        // WF com a FONS de tota la zona de treball, sense atenuar (cal veure bé les
        // pauses d'àudio per encaixar els subtítols). h = alçada de la zona.
        _drawWaveform: function (ctx, y, h) {
            ctx.fillStyle = '#0d2818';
            ctx.fillRect(0, y, this._canvas.width, h);
            if (this._waveformPeaks && this._waveformPeaks.length > 0) {
                // Espai de MEDIA del clip (identitat): la WF coincideix amb els
                // subtítols del SRT (que viuen en temps de media). El cabezal
                // converteix tl↔media (vegeu _mediaAtSec/_tlAtMedia).
                // ⚡ Pre-càlcul: les altures per píxel només es recalculen quan
                // canvia zoom/peaks/rangs (no a cada render → evita cuelgues al clicar).
                var key = this._canvas.width + '|' + this._pixelsPerSec + '|' + this._waveformPeaks.length + '|' + this._axisOrigin + '|' + this._wfMediaStart + '|' + this._wfMediaEnd + '|' + this._viewOrigin() + '|' + this._viewEnd();
                if (key !== this._wfCacheKey || !this._wfPixelHeights || this._wfPixelHeights.length !== this._canvas.width) {
                    this._wfCacheKey = key;
                    this._computeWaveformPixels();
                }
                var H = this._wfPixelHeights || [];
                ctx.fillStyle = '#22cc66';
                for (var px = 0; px < H.length; px++) {
                    var g = Math.min(1, H[px] * (this._waveformGain || 1));
                    var hcol = g * (h - 2);
                    if (hcol < 1) hcol = 1;
                    ctx.fillRect(px, y + h - hcol, 1, hcol);
                }
            }
            // Sense dades la zona queda amb el fons verd fosc de la WF.
        },

        /**
         * _computeWaveformPixels: Pre-calcula les altures de la waveform per píxel
         * (una sola vegada per zoom/càrrega). El render només fa fillRect, sense
         * el bucle anidat sobre peaks → evita que el clic/arrossegament es pengi.
         */
        _computeWaveformPixels: function () {
            var W = this._canvas.width;
            this._wfPixelHeights = new Array(W);
            if (!this._waveformPeaks || this._waveformPeaks.length === 0) {
                for (var z = 0; z < W; z++) this._wfPixelHeights[z] = 0;
                return;
            }
            var pps = this._waveformPPS || 480;
            var nPeaks = this._waveformPeaks.length;
            var wfStart = this._wfMediaStart || 0;
            var wfEnd = this._wfMediaEnd || 0;
            var hasRange = (wfEnd > wfStart);
            // Els peaks del .bin comencen a l'INICIAL del clip amb què es va generar
            // (= el seu inPoint de MEDIA, p.ex. 27.92s amb handle de 20s), NO a media 0.
            // Cal descomptar aquest origen abans d'indexar: sense això la waveform
            // sortia desplaçada exactament aquest offset i quedava un buit gran al
            // principi del timeline de l'editor (era petit quan el handle era petit).
            var binStart = (this._wfMediaStart || 0);
            for (var px = 0; px < W; px++) {
                var sec = this._xToSec(px);
                var secEnd = this._xToSec(px + 1);
                if (hasRange && (sec < wfStart || sec >= wfEnd)) { this._wfPixelHeights[px] = 0; continue; }
                var idxStart = Math.floor((sec - binStart) * pps);
                var idxEnd = Math.max(idxStart + 1, Math.floor((secEnd - binStart) * pps));
                if (idxStart < 0 || idxStart >= nPeaks) { this._wfPixelHeights[px] = 0; continue; }
                if (idxEnd > nPeaks) idxEnd = nPeaks;
                var maxV = 0;
                for (var k = idxStart; k < idxEnd; k++) {
                    if (this._waveformPeaks[k] > maxV) maxV = this._waveformPeaks[k];
                }
                this._wfPixelHeights[px] = maxV;
            }
        },

        _drawPlayhead: function () {
            if (!this._ctx) return;
            var x = this._secToX(this._playheadSec);
            var ctx = this._ctx;
            ctx.strokeStyle = 'rgba(255, 60, 60, 0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this._canvas.height);
            ctx.stroke();
            ctx.fillStyle = '#ff3333';
            ctx.beginPath();
            ctx.moveTo(x - 4, 0); ctx.lineTo(x + 4, 0); ctx.lineTo(x, 6);
            ctx.closePath();
            ctx.fill();
        },

        _updatePreview: function (ctiSec) {
            var entry = null;
            for (var i = 0; i < this._entries.length; i++) {
                if (ctiSec >= this._entries[i].startSec && ctiSec < this._entries[i].endSec) { entry = this._entries[i]; break; }
            }
            var text = entry ? entry.texts.join('<br>') : '';
            // Overlay de subtítols sobre el vídeo (PLAN_VIDEO_PREVIEW).
            // ⚡ Només s'escriu quan canvia el text: un innerHTML repetit a 10Hz sobre
            // el <video> força repintats de la composició i pot provocar talls visuals.
            if (text !== this._lastSubsHtml) {
                this._lastSubsHtml = text;
                var subs = document.getElementById('srtVideoSubs');
                if (subs) subs.innerHTML = text;
            }
        },

        _drawMarkers: function (ctx) {
            if (!this._markers || this._markers.length === 0) return;
            for (var i = 0; i < this._markers.length; i++) {
                var x = this._secToX(this._markers[i]);
                var inDrag = (i === this._dragIdx);
                // Línia més gruixuda per facilitar l'apuntat i el drag
                ctx.strokeStyle = inDrag ? '#ffd24d' : '#ffaa00';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, this._canvas.height);
                ctx.stroke();
                // Indicador superior ben visible
                ctx.fillStyle = inDrag ? '#ffd24d' : '#ffaa00';
                ctx.beginPath();
                ctx.moveTo(x - 7, 0); ctx.lineTo(x + 7, 0); ctx.lineTo(x, 10);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        },

        _canvasXToSec: function (e) {
            return this._xToSec(this._eventX(e));
        },

        _markerAtSec: function (sec, wideTol) {
            // Tolerància de captura. Amb wideTol=true (arrossegament) s'usa el més gran
            // entre la tol en píxels (12/pps) i un mínim en segons (20s per defecte) per
            // no "pillar-se els dits" en zooms amples. Amb wideTol=false (crear/esborrar
            // marcadors amb clic dret / drag normal) es manté la tol estricta en píxels.
            var tolPx = this._MARKER_TOL_PX / this._pixelsPerSec;
            var tol = (wideTol) ? Math.max(tolPx, this._MARKER_TOL_MIN_SEC || 0) : tolPx;
            // Sempre es captura el marcador MÉS PROPER dins de la tol (no el primer que
            // la compleixi): evita agafar un marcador llunyà si n'hi ha un de més a prop.
            var best = -1, bestD = Infinity;
            for (var i = 0; i < this._markers.length; i++) {
                var d = Math.abs(this._markers[i] - sec);
                if (d <= tol && d < bestD) { bestD = d; best = i; }
            }
            return best;
        },

        /**
         * _snapToSubtitleBoundary: retorna el startSec/endSec més proper de les
         * entrades (subtítols) a 'sec'. Si no hi ha entrades, retorna 'sec' tal qual.
         * @param {number} sec - Posició (en temps de media)
         * @param {Array} [entriesRef] - Entrades de referència (per defecte: this._entries)
         */
        _snapToSubtitleBoundary: function (sec, entriesRef) {
            var refs = entriesRef || this._entries;
            if (!refs || refs.length === 0) return sec;
            var best = sec, bestDist = Infinity;
            for (var i = 0; i < refs.length; i++) {
                var cands = [refs[i].startSec, refs[i].endSec];
                for (var c = 0; c < cands.length; c++) {
                    var d = Math.abs(cands[c] - sec);
                    if (d < bestDist) { bestDist = d; best = cands[c]; }
                }
            }
            return best;
        },

        /**
         * _actualToOriginal: Mapeja un punt de l'espai ACTUAL (el que es veu,
         * _entries deformada pel warp) a l'espai ORIGINAL (_originalEntries).
         * Per a límits de clip (IN/OUT) fa un mapatge precís clip-a-clip; per a
         * punts interiors fa servir la inversa lineal del warp com a fallback.
         */
        _actualToOriginal: function (sec) {
            var orig = this._originalEntries || [];
            var cur = this._entries || [];
            if (orig.length === 0) return sec;

            // 1) Mapatge precís per límits de clip (IN/OUT). _entries i _originalEntries
            //    comparteixen ordre i nombre, així que el mateix índex = el mateix clip.
            for (var i = 0; i < cur.length; i++) {
                if (i >= orig.length) break;
                if (Math.abs(cur[i].startSec - sec) < 0.001) return orig[i].startSec;
                if (Math.abs(cur[i].endSec - sec) < 0.001) return orig[i].endSec;
            }

            // 2) Fallback: inversa lineal del warp (per a punts que no són límits exactes).
            var O = (this._originalMarkers || []).slice().sort(function (a, b) { return a - b; });
            var C = (this._markers || []).slice().sort(function (a, b) { return a - b; });
            var k = Math.min(O.length, C.length);
            var firstIn = orig[0].startSec;
            var lastOut = orig[orig.length - 1].endSec;

            // La cua posterior a l'últim marcador es desplaça per delta (MOVE), igual que a
            // _applyAllMarkers, així que el darrer límit actual és lastOut + delta (no lastOut).
            var cLast = lastOut;
            if (k > 0) cLast = lastOut + (C[k - 1] - O[k - 1]);

            var oBounds = [firstIn].concat(O.slice(0, k)).concat([lastOut]);
            var cBounds = [firstIn].concat(C.slice(0, k)).concat([cLast]);

            for (var s = 0; s < cBounds.length - 1; s++) {
                var ca = cBounds[s], cb = cBounds[s + 1];
                if (sec >= ca && sec <= cb) {
                    var oa = oBounds[s], ob = oBounds[s + 1];
                    if (cb - ca < 0.0001) return oa;
                    return oa + (sec - ca) * (ob - oa) / (cb - ca);
                }
            }
            return sec;
        },

        /**
         * _mediaAtSec: retorna el temps de media que correspon a un instant de
         * timeline 'sec' (invers del mapeig dels segments). -1 si fora de clip.
         */
        _mediaAtSec: function (sec) {
            var segs = this._waveformSegments || [];
            if (segs.length === 0) return sec;
            for (var g = 0; g < segs.length; g++) {
                var sg = segs[g];
                if (sec >= sg.s && sec < sg.e) return sg.m + (sec - sg.s) * sg.r;
            }
            // Fora dels clips: estendre linealment el mapa per poder editar
            // més enllà de l'OUT (i abans de l'IN) sense que el playhead salti.
            var first = segs[0];
            if (sec < first.s) return first.m + (sec - first.s) * first.r;
            var last = segs[segs.length - 1];
            var lastMEnd = last.m + (last.e - last.s) * last.r;
            return lastMEnd + (sec - last.e) * last.r;
        },

        /**
         * _tlAtMedia: retorna el temps de timeline on sona el temps de media 'media'.
         * (invers de _mediaAtSec). Fora de cap segment → retorna 'media' (identitat).
         */
        _tlAtMedia: function (media) {
            var segs = this._waveformSegments || [];
            if (segs.length === 0) return media - (this._axisOrigin || 0);
            for (var g = 0; g < segs.length; g++) {
                var sg = segs[g];
                var mEnd = sg.m + (sg.e - sg.s) * sg.r;
                if (media >= sg.m && media < mEnd) {
                    return sg.s + (media - sg.m) / sg.r;
                }
            }
            // Fora dels clips: estendre linealment el mapa (no retornar 'media' tal qual,
            // que inflava el temps de timeline i feia saltar/retornar el playhead).
            var first = segs[0];
            if (media < first.m) return first.s + (media - first.m) / first.r;
            var last = segs[segs.length - 1];
            var lastMEnd = last.m + (last.e - last.s) * last.r;
            return last.e + (media - lastMEnd) / last.r;
        },

        /**
         * _getTlMaxSec: final físic del timeline (final del darrer clip de vídeo).
         * Més enllà d'aquest punt el CTI de Premiere no hi pot anar.
         */
        _getTlMaxSec: function () {
            var segs = this._waveformSegments || [];
            var maxE = -Infinity;
            for (var g = 0; g < segs.length; g++) {
                if (segs[g].e > maxE) maxE = segs[g].e;
            }
            return isFinite(maxE) ? maxE : null;
        },

        /**
         * _applyAllMarkers: Recalcula TOTA la taula de clips des de la taula ORIGINAL
         * (_originalEntries) segons les posicions dels marcadors. Cada segment entre
         * marcadors consecutius es re-escala amb scaleSegmentWithGaps (acordió: separació
         * base 3 frames + pauses escalables); la cua posterior a l'últim marcador es
         * desplaça sòlidament (MOVE). Així l'edició és pura i no es degrada amb
         * iteracions (sempre es recalcula des de l'original).
         */
        _applyAllMarkers: function () {
            var P = window.FASTPASS_UI.Logic.SrtParser;
            var orig = this._originalEntries || [];
            if (orig.length === 0) { this._entries = []; return; }

            var O = (this._originalMarkers || []).slice().sort(function (a, b) { return a - b; });
            var C = (this._markers || []).slice().sort(function (a, b) { return a - b; });
            var k = Math.min(O.length, C.length);

            var firstIn = orig[0].startSec;
            var result = [];

            // Escala un segment [oa, ob] → [ca, cb] (acordió amb gaps de 3 frames).
            var scaleRange = function (oa, ob, ca, cb) {
                var segClips = [];
                for (var i = 0; i < orig.length; i++) {
                    if (orig[i].startSec >= oa && orig[i].startSec < ob) segClips.push(orig[i]);
                }
                if (segClips.length === 0) return;
                var gaps = [segClips[0].startSec - oa]; // lead
                for (var j = 0; j < segClips.length - 1; j++) gaps.push(segClips[j + 1].startSec - segClips[j].endSec);
                gaps.push(ob - segClips[segClips.length - 1].endSec); // trail
                var scaled = P.scaleSegmentWithGaps(segClips, gaps, ca, cb);
                result = result.concat(scaled);
            };

            // Segmentos ACORDIÓ: [firstIn, o0], [o0, o1], ..., [o_{k-2}, o_{k-1}]
            for (var s = 0; s < k; s++) {
                var oa = (s === 0) ? firstIn : O[s - 1];
                var ob = O[s];
                var ca = (s === 0) ? firstIn : C[s - 1];
                var cb = C[s];
                scaleRange(oa, ob, ca, cb);
            }

            // Cua final (després de l'últim marcador): MOVE (desplaçament sòlid, sense escalar)
            if (k > 0) {
                var delta = C[k - 1] - O[k - 1];
                for (var t = 0; t < orig.length; t++) {
                    var e = orig[t];
                    if (e.startSec >= O[k - 1]) {
                        result.push({ index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec + delta, endSec: e.endSec + delta });
                    }
                }
            } else {
                // Sense marcadors: copiar la taula original tal qual
                for (var c0 = 0; c0 < orig.length; c0++) {
                    var e0 = orig[c0];
                    result.push({ index: e0.index, timeStr: e0.timeStr, texts: e0.texts.slice(), startSec: e0.startSec, endSec: e0.endSec });
                }
            }

            for (var r = 0; r < result.length; r++) result[r].index = r + 1;
            this._entries = result;
        },

        /**
         * _applyMarkerDrag: Mou el marcador _dragIdx a P1 i recalcula la taula completa.
         * El clamp impedeix creuar els marcadors veïns (l'ordre original es manté).
         */
        _applyMarkerDrag: function (P1) {
            if (typeof P1 !== 'number' || !isFinite(P1)) return; // protecció contra NaN/Infinity
            var i = this._dragIdx;
            if (i < 0 || i >= this._markers.length) return;
            var C = (this._markers || []).slice();
            var firstIn = (this._originalEntries && this._originalEntries.length) ? this._originalEntries[0].startSec : 0;
            // Els límits es prenen de les posicions ACTUALS dels marcadors veïns
            // (no de les originals), per no crear barreres artificials al drag.
            var A = i > 0 ? C[i - 1] : firstIn;
            var N = i < C.length - 1 ? C[i + 1] : null;
            if (P1 < A + 0.1) P1 = A + 0.1;
            if (N !== null && P1 > N - 0.1) P1 = N - 0.1;
            this._markers[i] = P1;
            this._applyAllMarkers();
        },

        _getManifestCtx: function () {
            var ctx = window.FASTPASS_UI.State;
            if (!ctx || !ctx.progData || !ctx.config || !ctx.dateDir || !ctx.bloque) return null;
            if (!ctx.config.rutas || !ctx.config.rutas.destinoBase) return null;
            return ctx;
        },

        /**
         * _fingerprintSrt: Empremta ràpida del contingut del SRT carregat (nombre
         * d'entrades + seqüència de temps start/end). Dos SRT que comparteixen nom
         * (p. ex. 'emergencia_EMERGENCIA') però amb subtítols diferents (altra peça
         * o sessió) obtenen empremtes diferents → els marcadors no es porten d'una
         * peça a l'altra.
         */
        _fingerprintSrt: function () {
            var e = this._entries || [];
            if (e.length === 0) return '';
            var max = Math.min(e.length, 600);
            var s = String(e.length) + '|' + (e[0].startSec || 0) + '-' + (e[0].endSec || 0) + '|' + (e[e.length - 1].endSec || 0);
            for (var i = 0; i < max; i++) {
                s += '|' + (e[i].startSec || 0) + '-' + (e[i].endSec || 0);
            }
            // Hash FNV-1a de 32 bits → cadena curta i estable per comparar.
            var h = 2166136261;
            for (var j = 0; j < s.length; j++) {
                h ^= s.charCodeAt(j);
                h = (h * 16777619) >>> 0;
            }
            return h.toString(36) + '_' + String(e.length);
        },

        /**
         * _markersFilePath: ruta d'un fitxer LOCAL petit per als marcadors.
         * Evita reescriure el manifest de 224 ítems (53KB) al NAS en cada operació,
         * que era la causa dels cuelgues (IO.writeTxt bloquejava ExtendScript ~25s).
         * @param {string} [srtNameOverride] - Nom del SRT (sense extensió) per al qual
         *   es vol la ruta; per defecte, el SRT carregat (`_srtName`).
         */
        _markersFilePath: function (srtNameOverride) {
            var safe = (srtNameOverride || this._srtName || 'srt').replace(/[^a-zA-Z0-9_-]/g, '_');
            // Els marcadors viuen a la CARPETA DEL PROJECTE (al costat del manifest
            // .fastpass.json), de manera que cada projecte té els seus propis marcadors
            // i no s'interfereixen entre projectes. Fallback local si no hi ha projecte.
            var base = (this._projectKey && String(this._projectKey).indexOf('ERR') !== 0)
                ? this._projectKey
                : 'C:/temp';
            return String(base).replace(/[\\/]+$/, '').replace(/\\/g, '/') + '/fastpass_srt_markers_' + safe + '.json';
        },

        /**
         * _wipeMarkersFile: BUIDA al disc el fitxer de marcadors persistits d'un .SRT.
         * (2026-10-02 · BUG #138) El RESET ♻️ esborrava els marcadors de MEMÒRIA i desava
         * la llista buida, però només per al .srt que estava carregat. Com que el RESET
         * acaba carregant el .srt DEL TEMA (que sovint NO és el que hi havia obert, p. ex.
         * l'emergència de 15 min), `loadSrt` tornava a llegir el fitxer d'AQUEST altre .srt
         * —que continuava amb les marques antigues— i els marcadors reapareixien: semblava
         * que el RESET no els esborrés. Amb aquesta crida el fitxer queda buit de debò (els
         * marcadors s'esborren «amb la resta»), tant al projecte com al respatller C:/temp.
         * @param {string} srtPathOrName - Ruta o nom del .srt objectiu.
         */
        _wipeMarkersFile: function (srtPathOrName) {
            try {
                var raw = String(srtPathOrName || this._srtName || 'srt');
                var name = raw.split(/[\\/]/).pop().replace(/\.srt$/i, '');
                var safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
                var full = this._markersFilePath(name);
                try { window.cep.fs.writeFile(full, ''); } catch (e1) { }
                // Respatller local: si l'escriptura al projecte (UNC) ha fallat, el de
                // C:/temp encara podria contenir marques antigues i restaurar-les.
                if (String(full).indexOf('C:/temp') !== 0) {
                    try { window.cep.fs.writeFile("C:/temp/fastpass_srt_markers_" + safe + ".json", ''); } catch (e2) { }
                }
                log("📝 SRT_EDIT: marcadors buidats al disc per a '" + safe + "'");
            } catch (eW) {
                log("⚠️ SRT_EDIT: Error buidant els marcadors: " + eW.message);
            }
        },

        /**
         * wipeMarkersForProject: BUIDA les copies de marcadors de TOTS els .SRT
         * d'un projecte que viuen FORA de la carpeta del projecte.
         *
         * (2026-10-21) El RESET GENERAL esborra la carpeta del bloc, pero
         * l'editor SRT desa una COPIA de seguretat a `C:/temp`
         * (`fastpass_srt_markers_<srt>.json`) quan la carpeta del projecte no es
         * pot escriure. Aqueixa copia sobreviu a l'esborrat i `_restoreMarkers`
         * la pot re-injectar al projecte nou: nomes comprova projectKey + nom +
         * empremta, i el projectKey es exactament la MATEIXA carpeta. Aqui es
         * buiden totes les copies el projectKey de les quals siga la carpeta
         * indicada, abans que el flux NOU torne a carregar cap .srt.
         * @param {string} projectFolder - Carpeta del projecte (la que s'esborra)
         * @returns {number} Nombre de fitxers de marcadors buidats
         */
        wipeMarkersForProject: function (projectFolder) {
            var n = 0;
            try {
                var key = String(projectFolder || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
                if (!key) return 0;
                var fs = window.cep && window.cep.fs;
                if (!fs || typeof fs.readdir !== 'function') return 0;
                var ls = fs.readdir('C:/temp');
                if (!ls || ls.err !== 0 || !ls.data) return 0;
                for (var i = 0; i < ls.data.length; i++) {
                    var nm = String(ls.data[i] || '');
                    if (nm.indexOf('fastpass_srt_markers_') !== 0) continue;
                    var full = 'C:/temp/' + nm;
                    var rd = null;
                    try { rd = fs.readFile(full); } catch (eR) { rd = null; }
                    if (!rd || rd.err !== 0 || !rd.data) continue;
                    var parsed = null;
                    try { parsed = JSON.parse(rd.data); } catch (eP) { parsed = null; }
                    if (!parsed || !parsed.projectKey) continue;
                    var pk = String(parsed.projectKey).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
                    if (pk !== key) continue;
                    try { fs.writeFile(full, ''); n++; } catch (eW) { }
                }
                log("SRT_EDIT: copies de marcadors de C:/temp buidades per al projecte: " + n);
            } catch (e) {
                log("SRT_EDIT: error buidant els marcadors del projecte: " + e.message);
            }
            return n;
        },

        _persistMarkers: function () {
            try {
                try { window.cep.fs.makedir("C:/temp"); } catch (e1) { }
                var data = this._markersPayload();
                var pathMarkers = this._markersFilePath();
                var wRes = window.cep.fs.writeFile(pathMarkers, data);
                // Si la carpeta del projecte (UNC) no es pot escriure amb cep.fs
                // (alguns entorns no ho permeten), cau a C:/temp per no perdre els marcadors.
                if (wRes && wRes.err !== 0 && String(pathMarkers).indexOf('C:/temp') !== 0) {
                    var safe = (this._srtName || 'srt').replace(/[^a-zA-Z0-9_-]/g, '_');
                    window.cep.fs.writeFile("C:/temp/fastpass_srt_markers_" + safe + ".json", data);
                }
            } catch (e) {
                try {
                    var safe2 = (this._srtName || 'srt').replace(/[^a-zA-Z0-9_-]/g, '_');
                    window.cep.fs.writeFile("C:/temp/fastpass_srt_markers_" + safe2 + ".json", this._markersPayload());
                } catch (e2) { }
            }
        },

        /**
         * _markersPayload: JSON dels marcadors per a disc.
         *
         * (BUG #189) A memoria els marcadors viuen a l'eix del SRT CARREGAT, pero
         * si eixe SRT es un SINT que s'ha alineat (`_sintShiftSec`) l'eix ja no es
         * el del FITXER. Al disc es desa SEMPRE en l'eix del fitxer (es desfa el
         * desplacament) perque `_restoreMarkers` el torne a aplicar: si es desessin
         * desplacats, cada recarrega els desplaçaria una altra volta.
         * @returns {string} JSON a escriure
         */
        _markersPayload: function () {
            var sh = Number(this._sintShiftSec) || 0;
            var toFile = function (arr) {
                var src = Array.isArray(arr) ? arr : [];
                if (!sh) return src.slice();
                return src.map(function (m) { return Math.round((Number(m) - sh) * 1000) / 1000; });
            };
            return JSON.stringify({
                srtName: this._srtName,
                srtFingerprint: this._srtFingerprint || '',
                projectKey: this._projectKey || '',
                markers: toFile(this._markers),
                originalMarkers: toFile(this._originalMarkers),
                updatedAt: new Date().toISOString()
            });
        },

        _restoreMarkers: async function () {
            try {
                var res = window.cep.fs.readFile(this._markersFilePath());
                // Si la carpeta del projecte (UNC) no és llegible amb cep.fs, provar
                // el respaldo local C:/temp (sempre amb la comprovació de projectKey).
                if (!(res && res.err === 0 && res.data)) {
                    var pMarkers = this._markersFilePath();
                    if (String(pMarkers).indexOf('C:/temp') !== 0) {
                        var safeAlt = (this._srtName || 'srt').replace(/[^a-zA-Z0-9_-]/g, '_');
                        var altRes = window.cep.fs.readFile("C:/temp/fastpass_srt_markers_" + safeAlt + ".json");
                        if (altRes && altRes.err === 0 && altRes.data) res = altRes;
                    }
                }
                if (res && res.err === 0 && res.data) {
                    var parsed = JSON.parse(res.data);
                    // Només es restaura si és del MATEIX projecte/sessió: la persistència
                    // local és per recuperar la sessió en curs, no per portar marques de
                    // projectes o sessions anteriors al carregar un SRT nou.
                    var keyActual = this._projectKey || '';
                    if (!keyActual) {
                        try {
                            var pf = await callJSX("Context.folder()");
                            keyActual = (pf && String(pf).indexOf('ERR') !== 0) ? String(pf) : '';
                            this._projectKey = keyActual;
                        } catch (eK) { }
                    }
                    var sameProject = !!(keyActual && parsed && parsed.projectKey && parsed.projectKey === keyActual);
                    var sameSrt = !!(parsed && parsed.srtName === this._srtName);
                    // El contingut del SRT ha de ser el mateix: si la peça/sessió actual ha
                    // regenerat el SRT (mateix nom 'emergencia_EMERGENCIA' però altra peça),
                    // els marcadors antics ja no pertanyen a aquest contingut → es descarten.
                    var sameContent = !!(this._srtFingerprint && parsed && parsed.srtFingerprint && parsed.srtFingerprint === this._srtFingerprint);
                    if (sameSrt && sameContent && Array.isArray(parsed.markers) && sameProject) {
                        this._markers = parsed.markers.filter(function (m) { return typeof m === 'number' && isFinite(m); });
                        this._markers.sort(function (a, b) { return a - b; });
                        var om = Array.isArray(parsed.originalMarkers) ? parsed.originalMarkers : parsed.markers;
                        this._originalMarkers = om.filter(function (m) { return typeof m === 'number' && isFinite(m); });
                        this._originalMarkers.sort(function (a, b) { return a - b; });
                        if (this._markers.length > 0) log("📝 SRT_EDIT: " + this._markers.length + " marcadors restaurats (local, mateixa sessió i mateix contingut SRT)");
                    } else if (parsed && (parsed.srtName || parsed.projectKey || parsed.srtFingerprint)) {
                        // Restes d'un altre projecte o d'un SRT anterior amb el mateix nom
                        // (p. ex. 'emergencia_EMERGENCIA' regenerat per a una altra peça):
                        // netejar-les per no contaminar la sessió actual.
                        var motiu = !sameProject ? "d'un altre projecte" : (!sameSrt ? "d'un altre SRT" : "d'un SRT amb el mateix nom però contingut diferent");
                        log("📝 SRT_EDIT: Marcadors locals " + motiu + " descartats (neteja).", "WARN");
                        try { window.cep.fs.writeFile(this._markersFilePath(), ''); } catch (eCl) { }
                        // Netejar també el respaldo C:/temp (el que normalment conté les restes).
                        try {
                            var safeCl = (this._srtName || 'srt').replace(/[^a-zA-Z0-9_-]/g, '_');
                            var pathCl = this._markersFilePath();
                            if (String(pathCl).indexOf('C:/temp') !== 0) {
                                window.cep.fs.writeFile("C:/temp/fastpass_srt_markers_" + safeCl + ".json", '');
                            }
                        } catch (eCl2) { }
                    }
                }
            } catch (e) { }
        },

        setPlayhead: function (sec) {
            if (sec < 0) sec = 0;
            // sec és temps de MEDIA (espai dels subtítols i la WF) → convertir a TL per Premiere
            this._playheadSec = sec;
            var tl = this._tlAtMedia(sec);
            // Abans de l'IN del clip (media < origen) no hi ha contingut al timeline → tl=0
            if (tl < 0 || sec < (this._axisOrigin || 0)) tl = 0;
            // Actualitzar la base d'interpolació per no derivar cap al CTI anterior
            this._ctiSec = tl;
            this._ctiAt = (window.performance && performance.now) ? performance.now() : Date.now();
            this._timelineRunning = false;
            // El cabezal de Premiere SÍ pot anar més enllà del final del darrer clip
            // (manualment funciona): enviem el tl REAL, sense clampar a cap OUT/zona de treball.
            this._playheadLocal = false;
            this._pendingSeek = tl;
            getUtils().status("Cabezal → tl " + tl.toFixed(2) + "s (media " + sec.toFixed(2) + "s)", "exito");
            callJSX("Timeline.set(" + tl.toFixed(3) + ")").then(function (r) {
                log("🖱 Timeline.set(" + tl.toFixed(3) + ") → " + r);
            });
            this.render();
            this._updatePreview(sec);
            this._syncVideo(sec);
        },

        applyIn: function () {
            var cti = this._playheadSec;
            var targetIdx = window.FASTPASS_UI.Logic.SrtParser.findTargetByTime(this._entries, cti);
            log("📝 SRT_EDIT: IN cti=" + cti.toFixed(2) + "s → targetIdx=" + targetIdx + "/" + this._entries.length
                + (targetIdx >= 0 ? " (entry start=" + this._entries[targetIdx].startSec.toFixed(2) + "s)" : ""));
            if (targetIdx < 0) { getUtils().status("CTI no sobre cap caption", "warn"); return; }
            var originalStart = this._entries[targetIdx].startSec;
            // Padding inicial: 10 frames = 0.4s a 25fps. El primer subtítol NO pot
            // començar a 00:00; ha de començar a 00:00:00:10 (10 frames).
            // En temps de MEDIA cal sumar l'origen (IN del clip) perquè l'editor ho
            // mostri al punt correcte; la conversió media→timeline es fa a l'exportar.
            var PAD_START_SEC = 0.4;
            var newStart = (this._axisOrigin || 0) + PAD_START_SEC;
            log("📝 SRT_EDIT: IN → primer clip a media " + newStart.toFixed(2) + "s (padding " + PAD_START_SEC.toFixed(2) + "s)");
            this._entries = window.FASTPASS_UI.Logic.SrtParser.applyTrimIn(this._entries, targetIdx, newStart);
            // Marcadors: mateix offset que les entrades + àncora al primer clip
            var offset = newStart - originalStart;
            this._markers = this._markers.map(function (m) { return m + offset; }).filter(function (m) { return m >= 0.39; });
            if (this._entries.length > 0) {
                var first = this._entries[0].startSec;
                var exists = this._markers.some(function (m) { return Math.abs(m - first) < 0.05; });
                if (!exists) this._markers.push(first);
                this._markers.sort(function (a, b) { return a - b; });
            }
            this._originalEntries = this._entries.map(function (e) { return { index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec, endSec: e.endSec }; });
            this._originalMarkers = this._markers.slice();
            // (#132) IN fixat → l'eix es cenyeix al tram de la peça (marge esquerre) i
            // deixarà de dependre de la llargada del clip carregat.
            this._setEditWindow();
            this._clearSelection(); this._isDirty = true; this.render();
            this._persistMarkers();
            getUtils().status("IN: " + this._entries.length + " entrades", "exito");
        },

        applyOut: function () {
            var cti = this._playheadSec;
            var targetIdx = window.FASTPASS_UI.Logic.SrtParser.findTargetByTime(this._entries, cti);
            if (targetIdx < 0) { getUtils().status("CTI no sobre cap caption", "warn"); return; }
            this._entries = window.FASTPASS_UI.Logic.SrtParser.applyTrimOut(this._entries, targetIdx);
            // Marcador al final del darrer clip: deixa ben definit el final dels
            // subtítols encara que s'editen marcadors intermedis.
            if (this._entries.length > 0) {
                var finalSec = this._entries[this._entries.length - 1].endSec;
                var exists = this._markers.some(function (m) { return Math.abs(m - finalSec) < 0.05; });
                if (!exists) {
                    this._markers.push(finalSec);
                    this._markers.sort(function (a, b) { return a - b; });
                    log("📝 SRT_EDIT: OUT → marcador final afegit a " + finalSec.toFixed(2) + "s");
                }
            }
            this._originalEntries = this._entries.map(function (e) { return { index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec, endSec: e.endSec }; });
            this._originalMarkers = this._markers.slice();
            // (#132) OUT fixat → finestra d'edició = [inici de la peça − marge, OUT + marge dret].
            this._setEditWindow();
            this._clearSelection(); this._isDirty = true; this.render();
            this._persistMarkers();
            getUtils().status("OUT: " + this._entries.length + " entrades", "exito");
        },

        applyAdjust: function () {
            var P = window.FASTPASS_UI.Logic.SrtParser;
            var orig = this._originalEntries;
            if (!orig || orig.length === 0) { getUtils().status("No hi ha entrades", "warn"); return; }
            var cti = this._playheadSec;
            var firstIn = orig[0].startSec;
            var lastOut = orig[orig.length - 1].endSec;
            if (cti <= firstIn + 0.05) { getUtils().status("CTI massa a l'inici", "warn"); return; }

            // Escalar TOT el segment [firstIn, lastOut] → [firstIn, cti] respectant gaps de 3 frames
            var gaps = [0];
            for (var j = 0; j < orig.length - 1; j++) gaps.push(orig[j + 1].startSec - orig[j].endSec);
            gaps.push(0);
            this._entries = P.scaleSegmentWithGaps(orig, gaps, firstIn, cti);

            // Escalar marcadors (posicions actuals i originals) amb el mateix factor
            var curDur = lastOut - firstIn, newDur = cti - firstIn;
            if (curDur > 0 && newDur > 0) {
                var ratio = newDur / curDur;
                this._markers = this._markers.map(function (m) { return firstIn + (m - firstIn) * ratio; });
                this._originalMarkers = this._originalMarkers.map(function (m) { return firstIn + (m - firstIn) * ratio; });
            }

            this._originalEntries = this._entries.map(function (e) { return { index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec, endSec: e.endSec }; });
            this._clearSelection(); this._isDirty = true; this.render();
            this._persistMarkers();
            getUtils().status("AJUSTAT: " + this._entries.length + " entrades", "exito");
        },

        /**
         * _entriesToTimeline: taula en coordenades de MEDIA → entrades amb temps de
         * TIMELINE (el .srt que es col·loca a Premiere s'interpreta en timeline).
         * Conversió: timeline = media − `_axisOrigin` (IN del primer clip).
         * @param {Array} entries - entrades {startSec,endSec,texts}
         * @returns {Array} entrades amb startSec/endSec de timeline (les que acaben
         *   abans del 0 es descarten)
         */
        _entriesToTimeline: function (entries) {
            var origin = this._axisOrigin || 0;
            var out = [];
            var list = entries || [];
            for (var i = 0; i < list.length; i++) {
                var e = list[i];
                var s = Number(e.startSec) - origin;
                var en = Number(e.endSec) - origin;
                if (!isFinite(s) || !isFinite(en) || en <= 0) continue;
                out.push({
                    index: e.index, timeStr: e.timeStr || '',
                    texts: (e.texts || []).slice(),
                    startSec: (s < 0) ? 0 : s, endSec: en
                });
            }
            return out;
        },

        /**
         * _existingSubRanges: intervals [s,e] (TIMELINE) dels clips de subtítol que JA
         * hi ha a la seqüència del projecte, en TOTES les pistes caption.
         * Servix per no tornar a escriure el que ja està col·locat (`onlyMissing`).
         * @returns {Promise<Array<{t:number,s:number,e:number}>>}
         */
        _existingSubRanges: async function () {
            var jsx = "(function(){try{var s=($.global.FASTPASS&&FASTPASS.Context)?FASTPASS.Context.getWorkSequence():app.project.activeSequence;if(!s)return'[]';"
                + "var out=[];if(s.subtitleTracks){var n=s.subtitleTracks.numTracks||s.subtitleTracks.numItems||0;"
                + "for(var t=0;t<n;t++){var tr=s.subtitleTracks[t];for(var i=0;i<tr.clips.numItems;i++){var c=tr.clips[i];"
                + "try{out.push({t:t,s:c.start.seconds,e:c.end.seconds})}catch(e2){}}}}"
                + "return JSON.stringify(out)}catch(e){return'ERR:'+e.message}})()";
            try {
                var raw = await callJSX(jsx);
                if (!raw || String(raw).indexOf('ERR') === 0) {
                    log("⚠️ SRT_EDIT: no s'han pogut llegir els subtítols del timeline (" +
                        String(raw || '').slice(0, 120) + ")");
                    return [];
                }
                var arr = JSON.parse(raw);
                return Array.isArray(arr) ? arr : [];
            } catch (e) {
                log("⚠️ SRT_EDIT: _existingSubRanges: " + e.message);
                return [];
            }
        },

        exportToPremiere: async function (opts) {
            var o = opts || {};
            // (F3.6, 2026-10-23 · BUG #186) Font de les entrades: per defecte la taula
            // viva; `o.entries` permet exportar NOMÉS un subconjunt (p.ex. els clips
            // SINT afegits als buits) sense tocar la resta.
            var srcEntries = (o.entries && o.entries.length) ? o.entries : this._entries;
            if (!srcEntries || srcEntries.length === 0) {
                getUtils().status("No hi ha entrades per exportar", "warn");
                return false;
            }
            // (F3.2) Pista de destí: `opts.track` (0 = s1, 1 = s2). Per defecte els
            // SINTETICS van a S2 per poder tenir-los AL COSTAT del SRT normal sense
            // barrejar-los; NORMAL i MOD van a S1.
            var trackIdx = (o.track != null) ? parseInt(o.track, 10) : ((this._kind === 'SINT') ? 1 : 0);
            if (!isFinite(trackIdx) || trackIdx < 0) trackIdx = 0;
            log("📝 SRT_EDIT: exportant " + srcEntries.length + " entrades de la taula " + (this._kind || 'NORMAL') +
                " → pista S" + (trackIdx + 1) + (o.onlyMissing ? " (NOMÉS BUITS: no toca els clips que ja hi ha)" : ""));
            this._hideEditor();
            var projectFolder = await callJSX("Context.folder()");
            if (!projectFolder || projectFolder.indexOf('ERR') === 0) projectFolder = "C:\\temp";
            var projName = this._srtName || "subtitles";
            // Nom ÚNIC per exportació: l'API d'ExtendScript no permet esborrar ProjectItems
            // de forma fiable (no hi ha ProjectItem.delete), així que evitem col·lisions de nom.
            // Si reutilitzéssim "_MOD.srt", importFiles crearia "_MOD 1.srt" i Project.find
            // retornaria el contingut ANTIC (la "última versió" no s'aplicaria).
            var modName = projName + "_MOD_" + (new Date().getTime()) + ".srt";
            var modPath = projectFolder + "\\" + modName;
            log("📝 SRT_EDIT: Exportant a " + modPath);
            // Convertir els temps de MEDIA a TIMELINE per al .srt de sortida:
            // createCaptionTrack interpreta els temps del .srt com a temps de timeline.
            // (els subtítols del SRT original viuen en MEDIA; el timeline comença a l'IN del clip)
            // Conversió MEDIA → TIMELINE: resta de l'origen (el clip està trocejat però
            // contigu a velocitat 1x, així que media - origin = timeline exacte).
            // (NO fem servir _tlAtMedia aquí perquè retorna el valor sense convertir
            //  quan el temps cau fora del darrer segment, inflant la durada del darrer clip.)
            var exportEntries = this._entriesToTimeline(srcEntries);
            // (BUG #186 · 2026-10-23) EXPORTACIÓ NO DESTRUCTIVA (`onlyMissing`): les
            // entrades que ja tenen un clip de subtítol al timeline (qualsevol pista) NO
            // es tornen a escriure. Servix per AFEGIR al costat del SRT base sense
            // esborrar-lo: era exactament la queixa ("ha eliminat els clips que hi havia").
            if (o.onlyMissing) {
                var exRanges = await this._existingSubRanges();
                var tol = (o.tolSec != null && isFinite(Number(o.tolSec))) ? Number(o.tolSec) : 0.2;
                var kept = [];
                for (var q = 0; q < exportEntries.length; q++) {
                    var eq = exportEntries[q];
                    var dup = false;
                    for (var r = 0; r < exRanges.length; r++) {
                        if (eq.startSec < exRanges[r].e + tol && eq.endSec > exRanges[r].s - tol) { dup = true; break; }
                    }
                    if (!dup) kept.push(eq);
                }
                log("📝 SRT_EDIT: NOMÉS BUITS → " + kept.length + "/" + exportEntries.length +
                    " entrades (la resta ja tenen clip al timeline · " + exRanges.length +
                    " clips de subtítol existents · tol=" + tol + "s)");
                exportEntries = kept;
                if (exportEntries.length === 0) {
                    getUtils().status("Cap entrada nova: el timeline ja les té totes", "warn");
                    return false;
                }
            }
            if (exportEntries.length > 0) {
                log("📝 SRT_EDIT: Exportant " + exportEntries.length + " entrades (de " + srcEntries.length + "), timeline [" + exportEntries[0].startSec.toFixed(2) + "s → " + exportEntries[exportEntries.length - 1].endSec.toFixed(2) + "s]");
            }
            var srtContent = window.FASTPASS_UI.Logic.SrtParser.entriesToSrt(exportEntries);
            if (!srtContent) { getUtils().status("Error generant SRT", "error"); return; }
            var escapedPath = modPath.replace(/\\/g, '\\\\');
            var escapedContent = srtContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '');
            var writeResult = await callJSX("IO.writeTxt('" + escapedPath + "','" + escapedContent + "')");
            if (writeResult !== "OK") {
                try { window.cep.fs.writeFile(modPath, srtContent); } catch(e) { getUtils().status("Error escrivint _MOD.srt", "error"); return; }
            }
            // 1) Netejar NOMÉS el TRAM que s'escriurà, i només a la PISTA DE DESTÍ.
            //    (BUG #186 · 2026-10-23) Abans s'esborraven TOTS els clips de la pista:
            //    si el timeline ja tenia subtítols, una exportació els feia desaparéixer.
            //    Ara només es substituïxen els que SOLAPEN amb el rang que es col·loca;
            //    la resta del timeline queda intacta.
            var fromTl = exportEntries[0].startSec;
            var toTl = exportEntries[exportEntries.length - 1].endSec;
            try {
                var cleanJsx = "(function(){try{var s=($.global.FASTPASS&&FASTPASS.Context)?FASTPASS.Context.getWorkSequence():app.project.activeSequence;if(!s)return'ERR_NO_SEQ';"
                    + "var removed=0,kept=0,tt=" + trackIdx + ",from=" + fromTl.toFixed(3) + ",to=" + toTl.toFixed(3) + ";"
                    + "if(s.subtitleTracks){var n=s.subtitleTracks.numTracks||s.subtitleTracks.numItems||0;"
                    + "if(tt<n){var tr=s.subtitleTracks[tt];"
                    + "for(var i=tr.clips.numItems-1;i>=0;i--){var c=tr.clips[i],cs=0,ce=0;"
                    + "try{cs=c.start.seconds;ce=c.end.seconds}catch(e0){cs=-1;ce=-1}"
                    + "if(ce>from&&cs<to){try{c.remove();removed++}catch(e2){}}else{kept++}}}}"
                    + "return'OK_removed_'+removed+'_kept_'+kept}catch(e){return'ERR:'+e.message}})()";
                var cleanResult = await callJSX(cleanJsx);
                log("📝 SRT_EDIT: tram [" + fromTl.toFixed(2) + "s → " + toTl.toFixed(2) + "s] netejat a S" + (trackIdx + 1) + ": " + cleanResult);
            } catch(e) {
                log("⚠️ SRT_EDIT: Error netejant el tram de subtítols: " + e.message);
            }

            // 2) Eliminar els items _MOD.srt anteriors del projecte (recursiu). Si no es fa,
            //    importFiles crea un duplicat (_MOD 1.srt) i Project.find retorna el contingut
            //    ANTIC: la versió editada a l'extensió no s'aplicaria al timeline.
            var cleanItems = await callJSX("(function(){try{var root=app.project.rootItem;var removed=0;function scan(bin){if(!bin||!bin.children)return;for(var i=bin.children.numItems-1;i>=0;i--){var c=bin.children[i];if(c&&c.name&&c.name.toUpperCase().indexOf('_MOD.SRT')>=0){try{c.delete();removed++}catch(e){}}else if(c&&c.type===2){scan(c)}}}scan(root);return'OK_removed_'+removed}catch(e){return'ERR:'+e.message}})()");
            log("📝 SRT_EDIT: Items _MOD.srt anteriors eliminats: " + cleanItems);
            var importResult = await callJSX("(function(){try{app.project.importFiles(['" + modPath.replace(/\\/g, '/') + "'],true,app.project.rootItem,false);return'OK'}catch(e){return'ERR:'+e.message}})()");
            if (importResult !== "OK") { getUtils().status("Error important _MOD.srt", "error"); return; }
            var escapedModName = encodeURIComponent(modName);
            var findResult = await callJSX("FASTPASS.Project.find(decodeURIComponent('" + escapedModName + "'))");
            if (!findResult || findResult === 'null') { getUtils().status("No es troba _MOD.srt al projecte", "error"); return; }

            var encModName = encodeURIComponent(modName);
            // 1) Col·locar el SRT a la pista de destí SI EXISTEIX (conserva l'estil)
            var captionResult = await callJSX("FASTPASS.Clips.placeSrtOnExistingSubtitleTrack('" + encModName + "', 0, " + trackIdx + ")");
            log("📝 SRT_EDIT: placeSrtOnExistingSubtitleTrack(S" + (trackIdx + 1) + ") → " + captionResult);
            // 2) Fallback: la pista no existix → crear-ne una de nova (createCaptionTrack
            //    ja hi col·loca el SRT: no cal tornar-lo a sobreescriure)
            if (captionResult !== "OK" && String(captionResult).indexOf("OK_S") !== 0) {
                captionResult = await callJSX("(function(){var s=app.project.activeSequence;if(!s)return'ERR_NO_SEQ';var i=FASTPASS.Project.find(decodeURIComponent('" + encModName + "'));if(!i)return'ERR_ITEM_NOT_FOUND';if(typeof s.createCaptionTrack!=='function')return'ERR_NO_CAPTION_API';return s.createCaptionTrack(i,0)?'OK':'ERR_FAILED'})()");
                log("📝 SRT_EDIT: createCaptionTrack (pista nova) → " + captionResult);
            }
            this._timelineSubs = null;
            if (captionResult === "OK" || String(captionResult).indexOf("OK_S") === 0) {
                // (F3.6 · 2026-10-23) ETIQUETA DE COLOR per als clips AFEGITS: cada
                // exportació crea el seu propi .srt al projecte (`_MOD_<timestamp>`), així
                // que pintar eixe item no afecta les altres taules ja col·locades.
                var colLabel = (o.colorLabel != null) ? parseInt(o.colorLabel, 10) : NaN;
                if (isFinite(colLabel) && colLabel >= 0) {
                    var colRes = await callJSX("FASTPASS.Clips.setItemColorLabel('" + encodeURIComponent(modName) + "'," + colLabel + ")");
                    log("🎨 SRT_EDIT: etiqueta de color " + colLabel + " a " + modName + " → " + colRes);
                }
                var tlFirst = this._tlAtMedia(srcEntries[0].startSec);
                var onTrack = await this._detectExportTrack(tlFirst, trackIdx);
                getUtils().status("Exportat: " + exportEntries.length + " entrades → S" + onTrack, "exito");
                log("✅ SRT_EDIT: Export OK " + modName + " (taula " + this._kind + " → S" + onTrack + ")");
                return true;
            }
            getUtils().status("Error col·locant subtítols: " + captionResult, "error");
            return false;
        },

        /**
         * resetToOriginal: Torna a la situació inicial: restaura la taula del SRT
         * carregat (sense edicions), esborra tots els marcadors —de memòria I DEL DISC
         * (#138)— i elimina els clips de subtítols de la seqüència.
         */
        resetToOriginal: async function () {
            if (!this._loadedEntries || this._loadedEntries.length === 0) {
                getUtils().status("No hi ha SRT carregat per reiniciar", "warn");
                return;
            }
            var base = this._loadedEntries.map(function (e) {
                return { index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec, endSec: e.endSec };
            });
            this._entries = base;
            this._originalEntries = base.map(function (e) {
                return { index: e.index, timeStr: e.timeStr, texts: e.texts.slice(), startSec: e.startSec, endSec: e.endSec };
            });
            this._markers = [];
            this._originalMarkers = [];
            this._dragIdx = -1;
            this._isDirty = false;
            this._clearSelection();
            this._timelineSubs = null;
            // Esborrar també els clips de subtítols (pistes caption) de la seqüència
            await this._clearSubtitleTracks();
            this.render();
            // (2026-10-02 · BUG #138) Els marcadors s'esborren «amb la resta»: a més de
            // buidar la memòria, es buida el fitxer persistit al projecte. Només desant-hi
            // la llista buida, el .srt del tema que carrega el RESET (normalment un de
            // DIFERENT de l'obert) podia restaurar les seves marques i els marcadors
            // tornaven a aparèixer.
            this._wipeMarkersFile(this._srtName);
            getUtils().status("SRT reiniciat i subtítols de la seqüència esborrats", "exito");
        },

        /**
         * _exploreCaptionApi: introspecciona la API de caption/subtitle tracks en
         * runtime (no documentada) per descobrir si hi ha mètodes de borrat de PISTES
         * (no només clips). El resultat es mostra al log per decidir la via correcta.
         */
        _exploreCaptionApi: async function () {
            try {
                var jsx = "(function(){try{var out=[];"
                    + "var w=($.global.FASTPASS&&FASTPASS.Context)?FASTPASS.Context.getWorkSequence():app.project.activeSequence;"
                    + "if(!w)return'ERR_NO_SEQ';"
                    + "out.push('name='+w.name);"
                    + "if(w.videoTracks){out.push('vt='+w.videoTracks.numTracks);"
                    + "for(var i=0;i<w.videoTracks.numTracks;i++){var t=w.videoTracks[i];var tn='';try{tn=t.name}catch(e){}"
                    + "var pr=[];for(var k in t){pr.push(k)}"
                    + "out.push('V'+i+':'+tn+':'+pr.join(','));}}"
                    + "return out.join('|')}catch(e){return'ERR:'+e.message}})()";
                var result = await callJSX(jsx);
                log("🔍 SRT_EDIT: videoTracks → " + result);
                return result;
            } catch (e) {
                log("⚠️ SRT_EDIT: Error explorant API: " + e.message);
                return null;
            }
        },

        /**
         * _clearSubtitleTracks: elimina els clips de subtítols de TOTES les pistes
         * caption de la seqüència activa. (L'API no permet esborrar les pistes buides.)
         */
        _clearSubtitleTracks: async function () {
            try {
                // Diagnòstic previ: descobrir què exposa la API per a les PISTES
                await this._exploreCaptionApi();
            } catch (e) { }
            try {
                var cleanJsx = "(function(){try{var s=($.global.FASTPASS&&FASTPASS.Context)?FASTPASS.Context.getWorkSequence():app.project.activeSequence;if(!s)return'ERR_NO_SEQ';"
                    + "var removed=0;if(s.subtitleTracks){var n=s.subtitleTracks.numTracks||s.subtitleTracks.numItems;"
                    + "for(var t=0;t<n;t++){var tr=s.subtitleTracks[t];"
                    + "for(var i=tr.clips.numItems-1;i>=0;i--){try{tr.clips[i].remove();removed++}catch(e2){}}}}"
                    + "return'OK_removed_'+removed}catch(e){return'ERR:'+e.message}})()";
                var cleanResult = await callJSX(cleanJsx);
                log("📝 SRT_EDIT: Nets subtítols de la seqüència: " + cleanResult);
                return cleanResult;
            } catch (e) {
                log("⚠️ SRT_EDIT: Error netejant subtítols: " + e.message);
                return null;
            }
        },

        reset: function () {
            // (2026-10-28 · BUG #198) A PROVA D'EXCEPCIONS. Abans era una llista
            // plana d'assignacions: si qualsevol crida llançava (canvas, visor de
            // vídeo, selecció…), les instruccions del darrere —inclosa
            // `_hideEditor()`— no s'executaven i el panell es quedava amb la taula
            // i el canvas pintats. Ara cada bloc va aïllat i l'editor SEMPRE
            // acaba ocult.
            var self = this;
            function pas(fn) {
                try { fn(); } catch (e) { try { log('⚠️ SRT_EDIT: reset parcial: ' + e.message); } catch (e2) { } }
            }
            pas(function () { self.stop(); });
            pas(function () {
                self._entries = []; self._loadedEntries = []; self._originalEntries = [];
                self._playheadSec = 0; self._isDirty = false;
                self._srtPath = ""; self._srtName = ""; self._srtFingerprint = "";
            });
            pas(function () { self._clearSelection(); });
            pas(function () {
                self._kind = 'NORMAL'; self._views = {};
                self._timelineSubs = null; self._timelineSubsAt = 0;
                self._sintShiftSec = 0;
            });
            pas(function () {
                self._waveformPeaks = null; self._waveformPPS = 480; self._wfCacheKey = "";
                self._wfPixelHeights = null; self._isPlaying = false;
            });
            pas(function () {
                self._waveformSegments = []; self._waveformMediaTag = "";
                self._pollCount = 0;
                self._gapAdded = [];   // (F3.6) res pendent d'exportar a S2
                self._wfMediaStart = 0; self._wfMediaEnd = 0;
            });
            pas(function () { self._clearEditWindow(); });   // (#132)
            pas(function () {
                self._markers = []; self._originalMarkers = []; self._dragIdx = -1;
                self._lastCtiSec = -1; self._lastLocalT = -1; self._lastLocalPx = -1;
                self._pendingSeek = null;
            });
            pas(function () {
                if (self._ctx) self._ctx.clearRect(0, 0, self._canvas.width, self._canvas.height);
            });
            // El panell s'oculta PASSI EL QUE PASSE (és el que veu l'operador).
            pas(function () { self._hideEditor(); });
        }
    };

    window.FASTPASS_UI.Editor.SrtEditor = FASTPASS_UI.Editor.SrtEditor;
    window.SrtEditor = FASTPASS_UI.Editor.SrtEditor;
})();
