/**
 * ============================================================================
 * WORKFLOW: RENDER (EXPORTACIÓ) - v2.9.5 Tactical
 * ============================================================================
 * 📤 PUBLICACIÓ (2026-10-09): el vídeo es renderitza UNA sola vegada I DIRECTAMENT a la
 *    carpeta de publicació EXPORTS PROVISIONALS (public.ad-ccrtv.local = `rutas.render1`);
 *    després es COPIA a 608-1080 (svftpccma = `rutas.render2`). El PNG de portada s'escriu
 *    a AAA_PORTADES (`rutas.portadas`: …\VERTICALITZACIO_INFORMATIUS\AAA_PORTADES) amb el nom
 *    EXACTE del render de la sessió (`State.lastRenderName`, el desa `runVideo` en
 *    exportar). (2026-10-15 · BUG #163: es reverteix el canvi del 14/10 · BUG #160, que
 *    l'escrivia a la carpeta del projecte.) Vegeu `_publishVideo` i `runPortada`.
 * ============================================================================
 */

(function () {
    var FASTPASS_UI = window.FASTPASS_UI || {};
    FASTPASS_UI.Workflows = FASTPASS_UI.Workflows || {};

    const getUtils = () => window.FASTPASS_UI.Utils;
    const getScanner = () => window.FASTPASS_UI.Logic.Scan;

    const log = (m, lvl) => getUtils().log(m, lvl || "DEBUG");
    const callJSX = (s, o) => getUtils().callJSX(s, o);
    // (2026-10-21 · BUG #174) Càlcul PUR de la finestra de captura de la portada
    // (`js/logic/18_Portada_Window.js`): decideix pre-roll i cua sense moure mai el frame.
    const getPortadaWindow = () => (window.FASTPASS_UI.Logic || {}).PortadaWindow;

    // ── PORTADA (2026-09-18) ─────────────────────────────────────────────────
    // Durada (s) dels clips temporals que es fan servir a la zona neta.
    const PORTADA_DUR = 2;
    // 🛡️ (2026-10-14 · BUG #160) PRE-ROLL (s) de la finestra de captura: la còpia
    // comença ABANS del frame del cabezal, perquè la captura no caigui mai al PRIMER
    // frame del clip (el borde és ambigu: el redondeig de Premiere pot deixar la
    // captura fora del clip → NEGRE). 0.08 s = 2 frames a 25 fps.
    // (2026-10-21 · BUG #174) És el MÀXIM: si el frame és al primer frame del media
    // no hi cap, i la CUA s'escurça si el clip s'acaba. El FRAME NO ES MOU MAI.
    const PORTADA_GUARD = 0.08;
    // Tolerància d'un frame a 25 fps (verificacions de marge).
    const FRAME_TOL = 0.04;
    // Marge (s) més enllà del final del projecte on es fa tota la composició.
    const CLEAN_MARGIN = 30;
    // Escala forçada de la portada en % (null = mantenir la que aplica Premiere).
    const PORTADA_SCALE = null;

    /**
     * buildRenderName: Nom del fitxer de render (amb extensió) a partir del nom de la
     * seqüència activa. FONT ÚNICA del nom: el MP4 (runVideo) i el PNG de la portada
     * (runPortada) surten amb el MATEIX nom i la MATEIXA hora.
     * @param {string} seqName - Nom de la seqüència activa (ex: "TNC_V1_TEMA").
     * @returns {string} ex: "TNC_TEMA_13_15.mp4"
     */
    function buildRenderName(seqName) {
        if (!seqName) return "Export_TBD.mp4";
        // El nom de la seqüència pot ser PROG_BLOC_TEMA o PROG_TEMA. ABANS es feia
        // sempre split("_") + slice(2) → amb "TNC_AFECTACIONS METRO..." (2 parts) no
        // hi havia TEMA i sortia el literal "TEMA". Ara: 3+ parts → tema = tot menys
        // PROG i BLOC; 2 parts → tema = la 2a. Fallback: títol del projecte/net.
        const parts = seqName.split("_");
        const prog = (parts[0] || "PROG").trim();
        let tema = (parts.length >= 3 ? parts.slice(2).join("_") : (parts[1] || "")).trim();
        if (!tema) {
            try {
                const projName = (window.FASTPASS_UI.State && window.FASTPASS_UI.State.lastOpenedProjectName) || "";
                tema = projName.replace(/\.[^.]+$/, "")
                    .replace(/^Pruebas[_\s-]*/i, "")
                    .replace(/^[A-Z0-9]+[_\s-]+V\d[_\s-]*/i, "")
                    .trim();
            } catch (eN) { }
        }
        if (!tema) tema = "TEMA";
        const now = new Date();
        const timeStr = ("0" + now.getHours()).slice(-2) + "_" + ("0" + now.getMinutes()).slice(-2);
        return `${prog}_${tema}_${timeStr}.mp4`;
    }

    /**
     * clipIndexAt: Índex del clip d'una pista que conté un temps determinat.
     * @returns {number} índex (0-based) o -1
     */
    async function clipIndexAt(trackIdx, atSec) {
        try {
            const raw = await callJSX(`Clips.at(${trackIdx}, ${atSec}, 'video')`);
            if (!raw || raw === "null") return -1;
            const o = JSON.parse(raw);
            return (o && typeof o.index === 'number') ? o.index : -1;
        } catch (e) { return -1; }
    }

    /**
     * readFileBytes: Bytes reals d'un fitxer amb `cep.fs.readFile` (natiu).
     * (2026-10-29) Fora el respatller per `fs` de Node: el manifest no declara
     * `--enable-nodejs`, així que `_nodeFs()` sempre tornava null.
     * Retorna un array indexable de bytes, o null si no es pot llegir.
     * @param {string} path - Ruta (UNC o local) del fitxer
     * @returns {Uint8Array|Array|null}
     */
    function readFileBytes(path) {
        const normP = String(path).replace(/\//g, "\\");
        try {
            const rr = window.cep.fs.readFile(normP);
            const d = (rr && rr.err === 0) ? rr.data : null;
            if (d) {
                if (typeof d.length === "number" && typeof d[0] === "number") return d;
                if (typeof ArrayBuffer !== "undefined" && d instanceof ArrayBuffer) return new Uint8Array(d);
                if (d.buffer) return new Uint8Array(d.buffer);
            }
        } catch (eCep) { }
        return null;
    }

    /**
     * waitPng: Espera que un PNG estigui REALMENT ACABAT a disc (2026-10-16 · BUG #172).
     * `waitFile` nomes mirava l'EXISTENCIA i QE escriu el fitxer de mica en mica: es podia
     * llegir/publicar un PNG a mitges (o un de VELL del mateix nom). Criteris:
     *   1) existeix i te mida > 0,
     *   2) la mida es manté ESTABLE entre dues lectures seguides.
     * (2026-10-21) La mida ve de `IO.fileInfo` (ExtendScript). L'antic criteri 3 (chunk
     * IEND) exigia llegir el PNG SENCER amb `cep.fs.readFile`, que en aquest equip falla
     * amb rutes UNC d'~1 MB → el `iend` era sempre fals i la captura es donava per perduda
     * tot i estar escrita. Si `IO.fileInfo` no existeix (panell sense recarregar) es manté
     * el mètode antic amb `cep.fs.readFile` + IEND.
     * @param {string} pathNoExt - Ruta (amb o sense `.png`)
     * @param {number} [tries=30] - Intents (~150/90 ms cada un)
     * @returns {Promise<{ok:boolean,size:number,iend:boolean,file:string,tries:number}>}
     */
    async function waitPng(pathNoExt, tries) {
        const utils = getUtils();
        const norm = String(pathNoExt).replace(/\//g, "\\");
        const target = /\.png$/i.test(norm) ? norm : (norm + ".png");
        const alias = target.replace(/\.png$/i, "");
        const maxTries = tries || 30;

        // (2026-10-21) FONT DE VERITAT: `IO.fileInfo` (ExtendScript).
        // Abans es llegia el PNG SENCER amb `cep.fs.readFile` per mirar el chunk IEND.
        // En aquest equip això falla amb PNG de ~1 MB a UNC (i `cep.fs.stat` no dóna
        // `.size`) → `waitPng` deia que la captura NO s'havia escrit quan el PNG ja hi
        // era: portada del 21/10/2026, escrita per QE a les 14:51:19 (990 KB, IEND OK),
        // donada per perduda, i el fallback `seq.exportFrame` (inexistent) va convertir
        // un èxit en un error visible.
        let viaJsx = true;
        try {
            const probe = await utils.callJSX('typeof IO.fileInfo', { rawError: true });
            viaJsx = (String(probe).indexOf('function') !== -1);
        } catch (eP) { viaJsx = false; }
        if (!viaJsx) {
            log('⚠️ [Portada] `IO.fileInfo` no disponible (recarrega el panell) · el PNG es verifica amb cep.fs.readFile', 'WARN');
        }

        let size = -1, stable = 0, iend = false, file = target;
        for (let i = 0; i < maxTries; i++) {
            let n = -1, exists = false;
            if (viaJsx) {
                const raw = await utils.callJSX(`IO.fileInfo(${JSON.stringify(target)})`, { rawError: true });
                try {
                    const info = JSON.parse(raw);
                    exists = !!info.exists;
                    n = Number(info.size) || 0;
                } catch (eJ) { exists = false; n = -1; }
            } else {
                const buf = readFileBytes(target) || readFileBytes(alias);
                exists = !!(buf && buf.length);
                n = exists ? buf.length : -1;
                iend = !!(exists && n >= 12 && buf[n - 8] === 0x49 && buf[n - 7] === 0x45 && buf[n - 6] === 0x4E && buf[n - 5] === 0x44);
            }
            if (exists && n > 0) {
                file = target;
                if (n === size) { stable++; } else { stable = 0; size = n; }
                // QE escriu el PNG d'un sol cop: dues lectures amb la MATEIXA mida
                // (> 0) volen dir que el fitxer ja està tancat i complet.
                if (stable >= 1) return { ok: true, size: n, iend: (iend || viaJsx), file: file, tries: i + 1 };
            } else {
                stable = 0; size = -1;
            }
            await utils.delay(i === 0 ? 150 : 90);
        }
        return { ok: false, size: (size < 0 ? 0 : size), iend: iend, file: file, tries: maxTries };
    }

    /**
     * seekCti: Mou el cabezal (CTI) a `sec` i VERIFICA la lectura REAL amb `Timeline.get()`
     * (2026-10-16 · BUG #172). Abans es feia `Timeline.set(tcCap)` + un `delay(500)` fixe
     * molt abans de capturar i, pel mig, el flux passava pel NAS i ampliava l'Out point:
     * si el CTI no quallava, el PNG de portada sortia d'un ALTRE frame i no s'avisava.
     * Ara: fins a 3 intents (amb `Timeline.refresh` pel mig) i, si no qualla, es LLANÇA
     * (millor cap PNG que un d'equivocat).
     * @param {number} sec - Instant destí (segons)
     * @param {string} label - Etiqueta per al registre
     * @returns {Promise<number>} Lectura REAL del CTI
     */
    async function seekCti(sec, label) {
        const utils = getUtils();
        let real = NaN;
        for (let i = 0; i < 3; i++) {
            const rs = await callJSX(`Timeline.set(${sec})`);
            await utils.delay(i === 0 ? 220 : 160);
            real = parseFloat((await callJSX('Timeline.get()')) || "0");
            if (isFinite(real) && Math.abs(real - sec) <= FRAME_TOL) {
                log(`[Portada] CTI ${label}: demanat ${sec.toFixed(2)}s · real ${real.toFixed(2)}s (${rs})`);
                return real;
            }
            log(`[Portada] El cabezal no s'ha quedat a ${sec.toFixed(2)}s (real=${isFinite(real) ? real.toFixed(2) : real}s) · reintent ${i + 2}/3`, "WARN");
            try { await callJSX('Timeline.refresh()'); } catch (eR) { }
        }
        throw new Error(`El cabezal no s'ha pogut fixar a ${sec.toFixed(2)}s (real=${isFinite(real) ? real.toFixed(2) : real}s): capturar ara donaria una portada d'un altre frame.`);
    }

    /**
     * pickVideoBase: Nom base (sense extensió) del VÍDEO de referència de la CARPETA DE
     * PUBLICACIÓ (2026-10-09: abans era la del projecte), perquè el PNG surti amb la
     * MATEIXA hora que el vídeo ja exportat.
     * Prioritat: noms amb el prefix PROG_TEMA_ → el MÉS RECENT (el nom acaba en _HH_MM
     * i ordenat desc dóna la darrera hora del dia).
     * @param {Array} files - Llista de la carpeta ({name, created, mtime})
     * @param {string} prefix - "PROG_TEMA_" del nom que tocaria ara
     * @returns {string|null} nom sense extensió o null
     */
    function pickVideoBase(files, prefix) {
        if (!files || !files.length) return null;
        const mp4s = files.filter(function (f) { return /\.mp4$/i.test(f.name || ''); });
        if (!mp4s.length) return null;
        const same = prefix
            ? mp4s.filter(function (f) { return (f.name || '').toUpperCase().indexOf(prefix) === 0; })
            : [];
        const list = same.length ? same : mp4s;
        list.sort(function (a, b) {
            const na = String(a.name || '').toUpperCase();
            const nb = String(b.name || '').toUpperCase();
            if (na !== nb) return nb.localeCompare(na);
            return (b.created || 0) - (a.created || 0);
        });
        return String(list[0].name).replace(/\.mp4$/i, '');
    }

    /**
     * pngSize: Mides (px) d'un PNG llegint la capçalera IHDR amb `cep.fs`.
     * Només s'usa per al log de diagnòstic de la portada.
     * (2026-10-29) Fora el `fs` de Node: els bytes venen de `readFileBytes`
     * (natiu de CEP). Si eixa lectura falla, retorna null i el log ix sense
     * les mides: mai no bloqueja el flux.
     * @returns {{w:number,h:number}|null}
     */
    function pngSize(path) {
        try {
            const b = readFileBytes(path);
            if (!b || b.length < 24) return null;
            if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4E || b[3] !== 0x47) return null;
            const be32 = function (i) {
                return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
            };
            const w = be32(16);
            const h = be32(20);
            return (w > 0 && h > 0) ? { w: w, h: h } : null;
        } catch (e) { return null; }
    }

    FASTPASS_UI.Workflows.Render = {

        /**
         * _rutaExport: resol una ruta d'EXPORTACIÓ (render1 / render2 / portadas) amb
         * els {tokens} del bloc actual (Config.resolvePath → Logic.Rutas).
         * (2026-10-23) Les tres rutes d'exportació accepten `{project}` (el nom del
         * .prproj): així cada projecte pot tindre la seua carpeta de publicació.
         * Si la ruta no porta cap '{' es retorna tal qual (cap cost per a les fixes).
         * @param {string} tpl
         * @returns {string} ruta Windows (sense tokens) o la plantilla original si falla
         */
        _rutaExport: function (tpl) {
            const raw = String(tpl || '').trim();
            if (!raw || raw.indexOf('{') < 0) return raw;
            try {
                const cfg = FASTPASS_UI.Config;
                const all = cfg.get();
                const st = window.FASTPASS_UI.State || {};
                const idProg = (document.getElementById('programa') || {}).value;
                const progData = st.progData || ((all.mapeoProgramas && all.mapeoProgramas[idProg]) || null);
                const bloque = st.bloque || ((document.getElementById('bloc') || {}).value) || '';
                const out = cfg.resolvePath(raw, {
                    autor: all.autor,
                    progData: progData || {},
                    bloque: bloque,
                    dateDir: st.dateDir || '',
                    tema: st.detectedTheme || st.masterTheme || '',
                    base: (all.rutas && all.rutas.destino_base) || ''
                });
                log('🗺️ [Render] Ruta d\'exportació resolta: ' + raw + ' → ' + out);
                return out;
            } catch (e) {
                log('⚠️ [Render] No s\'ha pogut resoldre la ruta d\'exportació "' + raw + '": ' + e.message, 'WARN');
                return raw;
            }
        },

        /**
         * MP4: Renderitza la seqüència activa amb el preset vertical (render DIRECTE de
         * Premiere, sense AME) DIRECTAMENT a la carpeta de publicació (2026-10-09,
         * `rutas.render1` = EXPORTS PROVISIONALS) i tot seguit en COPIA una a
         * `rutas.render2` (608-1080). Un sol render; la resta són còpies de fitxer.
         */
        runVideo: async function () {
            if (!(await getUtils().validateActiveSequence())) return;
            log("🚀 Preparant enviament a AME...");
            const config = FASTPASS_UI.Config.get();

            try {
                // ── DESTÍ DEL RENDER (2026-10-09) ────────────────────────────────
                // El MP4 s'exporta DIRECTAMENT a la carpeta de publicació
                // (`rutas.render1` = EXPORTS PROVISIONALS del NAS public.ad-ccrtv.local).
                // Ordre: 1) rutas.render1 · 2) carpeta del projecte · 3) workFolder.
                // (Abans l'exportació es feia a la carpeta del projecte i després es
                // copiava; ara ja no cal el viatge d'anada.)
                let outputDir = this._rutaExport(config.rutas && config.rutas.render1);
                if (outputDir) {
                    log('📤 [Render] Destí del render = carpeta de publicació (rutas.render1): ' + outputDir);
                } else {
                    outputDir = await callJSX("Context.folder()");
                    if (!outputDir) outputDir = getUtils().workFolder(window.FASTPASS_UI.State) || config.rutas.destinoBase || "C:\\Temp";
                    log('⚠️ [Render] Sense rutas.render1 a la config → es renderitza a: ' + outputDir, 'WARN');
                }
                // Ruta NATIVA (\\) i ARBRE DE CARPETES creat ABANS d'exportar (UNC Path
                // Safety: Premiere és fràgil amb rutes de xarxa que no existeixen).
                outputDir = String(outputDir).replace(/\//g, '\\').replace(/\\+$/, '');
                try { getUtils().ensureFolders(outputDir); } catch (eF) {
                    log('⚠️ [Render] ensureFolders(' + outputDir + '): ' + eF.message, 'WARN');
                }
                
                getUtils().status("Processant nom...", "procesando");

                const seqName = await callJSX('Context.activeSeq()');
                // Font ÚNICA del nom (buildRenderName): el PNG de la portada (runPortada)
                // surt amb el mateix nom i la mateixa hora que aquest MP4.
                const fileName = buildRenderName(seqName);

                // (2026-09-18) csInterface viu a FASTPASS_UI.Utils.csInterface (utils.js L7/12),
                // NO a FASTPASS_UI.csInterface → abans petava amb "Cannot read properties of
                // undefined (reading 'getSystemPath')".
                const csI = (getUtils() && getUtils().csInterface) || window.FASTPASS_UI.csInterface;
                const extRoot = csI.getSystemPath(SystemPath.EXTENSION);
                // (2026-09-18) Resolució FLEXIBLE del preset: qualsevol .epr de presets\ ,
                // amb prioritat a H264_2Pass_Vertical.epr. Així val tant el preset propi
                // (p.ex. "VERTIKAL XXX.epr") com el nom "oficial", i si es canvia el preset
                // no cal tocar codi (només deixar-lo a presets\).
                let presetNative = `${extRoot}/presets/VERTIKAL XXX.epr`;
                try {
                    const presetDirFwd = `${extRoot}/presets`;
                    const presetDirNative = presetDirFwd.replace(/\//g, '\\');
                    // OJO: `window.cep.fs.stat` NO és fiable aquí (no retorna .size → tot
                    // semblava de 0 bytes). Mesurem LLEGINT el fitxer.
                    const sizeOf = (nm) => {
                        try {
                            const r = window.cep.fs.readFile(presetDirNative + '\\' + nm);
                            if (!r || r.err !== 0 || !r.data) return -1;
                            return (typeof r.data.length === 'number') ? r.data.length
                                : (r.data.byteLength || 0);
                        } catch (eS) { return -1; }
                    };
                    const rd = window.cep.fs.readdir(presetDirFwd);
                    if (rd && rd.err === 0 && rd.data && rd.data.length) {
                        // Descartem porqueria ("._NOM.epr", ".DS_Store")
                        const eprs = rd.data.filter(f => /\.epr$/i.test(f) && f.charAt(0) !== '.');
                        // Preferència explícita → preset propi de l'usuari → qualsevol vàlid
                        const prefs = ['VERTIKAL XXX.epr', 'H264_2Pass_Vertical.epr'];
                        let chosen = null;
                        for (let iP = 0; iP < prefs.length && !chosen; iP++) {
                            const hit = eprs.find(f => f.toLowerCase() === prefs[iP].toLowerCase());
                            if (hit && sizeOf(hit) > 1024) chosen = hit;
                        }
                        if (!chosen) {
                            for (let iE = 0; iE < eprs.length; iE++) {
                                if (sizeOf(eprs[iE]) > 1024) { chosen = eprs[iE]; break; }
                            }
                        }
                        if (chosen) presetNative = presetDirNative + '\\' + chosen;
                        log('🎛️ [Render] Presets a presets\\: ' + eprs.join(', ') +
                            (chosen ? ' → ús: ' + chosen + ' (' + Math.round(sizeOf(chosen) / 1024) + ' KB)'
                                : ' → CAP de vàlid (>1KB)'));
                    }
                } catch (eL) { log('⚠️ [Render] No puc llistar presets/: ' + eL.message, 'WARN'); }
                // Normalització a ruta NATIVA (\): `cep.fs.stat` amb "/" retorna mida buida
                // (per això abans qualsevol preset semblava de 0 bytes). El JSX vol els "\" escapats.
                presetNative = presetNative.replace(/\//g, '\\');
                const presetPath = presetNative.replace(/\\/g, '\\\\');

                // (2026-09-18) Validació prèvia del preset: si no existeix o està BUIT, AME
                // falla amb un error críptic. Val més dir-ho clar (cas real: 0 bytes).
                try {
                    // Mesura per LECTURA: `cep.fs.stat` no retorna .size de forma fiable aquí
                    // (per això qualsevol preset semblava de 0 bytes).
                    const rP = window.cep.fs.readFile(presetNative);
                    const size = (rP && rP.err === 0 && rP.data)
                        ? ((typeof rP.data.length === 'number') ? rP.data.length : (rP.data.byteLength || 0))
                        : -1;
                    if (size === -1) {
                        getUtils().status('Falta el preset .epr a presets/', 'error');
                        log('❌ [Render] No puc llegir el preset: ' + presetNative, 'ERROR');
                        return;
                    }
                    if (size < 1024) {
                        getUtils().status("Preset .epr massa petit", 'error');
                        log('❌ [Render] El preset fa ' + size + ' bytes: ' + presetNative, 'ERROR');
                        return;
                    }
                    log('🎛️ [Render] Preset OK (' + Math.round(size / 1024) + ' KB): ' + presetNative);
                } catch (eP) {
                    log('⚠️ [Render] No puc validar el preset: ' + eP.message, 'WARN');
                }

                log(`📤 Destí: ${outputDir}\\${fileName}`);

                // ── (2026-09-21) EXPORTACIÓ = "EL QUE QUEDA" (decisió d'usuari en directe) ──
                // L'exportació directa de Premiere NO accepta cap rang (ignora IN/OUT) i no es
                // vol fer servir AME. Per tant, ABANS d'exportar es RETALLA el timeline a l'OUT
                // de la seqüència: s'ajusten (endAt) o s'eliminen tots els clips que hi ha més
                // enllà de l'OUT, a totes les pistes, i s'exporta el que queda.
                let outSec = 0, rngSrc = '';
                try {
                    const rngRaw = await callJSX('Render.exportRange()');
                    const rng = (rngRaw && String(rngRaw).indexOf('{') === 0) ? JSON.parse(rngRaw) : null;
                    if (rng && rng.outSec > 0.1) { outSec = rng.outSec; rngSrc = rng.src + (rng.mode === 2 ? ' (àrea de treball)' : ''); }
                } catch (eRng) { }
                if (!(outSec > 0.1)) {
                    // Fallback: el punt OUT de la seqüència (Timeline.getOut)
                    try { outSec = parseFloat(await callJSX('Timeline.getOut()') || '0') || 0; rngSrc = 'OUT de la seqüència'; } catch (eO) { }
                }
                if (outSec > 0.1) {
                    log(`✂️ [Render] Retall a ${outSec.toFixed(2)}s (${rngSrc})`);
                    getUtils().status('Retallant el timeline a l\'OUT…', 'procesando');
                    const tr = await this._trimTailAtOut(outSec);
                    log(`✂️ [Render] Timeline retallat a l'OUT (${outSec.toFixed(2)}s): ${tr.trimmed} clip(s) ajustat(s), ${tr.removed} eliminat(s) · ${tr.tracks} pista/es tocades`);
                } else {
                    log('⚠️ [Render] La seqüència no té OUT ni àrea de treball: s\'exporta el timeline tal com està', 'WARN');
                }

                getUtils().status('Renderitzant des de Premiere…', 'procesando');
                const rDir = await callJSX(`Render.renderDirect('${presetPath}', '${getUtils().escape(outputDir)}', '${getUtils().escape(fileName)}')`);
                log('🎬 [Render] directe → ' + rDir);

                if (rDir && String(rDir).indexOf('OK') === 0) {
                    getUtils().status(`OK: ${fileName}`, 'exito');
                    log(`✅ [Render] Exportat${outSec > 0.1 ? ' (retallat a ' + outSec.toFixed(2) + 's)' : ''}: ${fileName}`, 'INFO');
                    // ── NOM DEL RENDER: FONT ÚNICA I GARANTIDA (2026-10-09) ──────────
                    // runPortada (PNG de portada) NO pot deduir el nom de la carpeta del
                    // projecte perquè el render ja no hi viu: aquí es desa el nom EXACTE
                    // (amb la seva hora) i la ruta del MP4 publicat, i el PNG s'hi agafa.
                    FASTPASS_UI.State.lastRenderName = String(fileName).replace(/\.mp4$/i, '');
                    FASTPASS_UI.State.lastRenderMp4 = outputDir + '\\' + fileName;
                    // ── PUBLICACIÓ (2026-10-09): 1 render + CÒPIES ───────────────────
                    // El MP4 S'HA renderitzat directament a EXPORTS PROVISIONALS; aquí
                    // només es COPIA als altres destins (608-1080). `_publishVideo` omet
                    // el destí que coincideix amb la carpeta d'origen → mai re-copia ni
                    // re-renderitza, i tots els destins queden amb el MATEIX fitxer.
                    // Una còpia que falli NO tomba el render.
                    const pub = await this._publishVideo(outputDir, fileName, config);
                    if (pub.ok > 0) {
                        getUtils().status(`${fileName} → ${pub.ok} destí/ns publicat(s)${pub.copied ? ' · ' + pub.copied + ' còpia/es' : ''}`, 'exito');
                    }
                } else {
                    getUtils().status('Render fallit: ' + rDir, 'error');
                    throw new Error('Render fallit: ' + rDir);
                }

            } catch (e) { getUtils().handleError(e, "RenderVideo"); }
        },

        /**
         * _copyFile: Copia un fitxer (src → dest) amb l'àtom JSX `IO.copyFile`.
         *
         * (2026-10-09 · revisat 2026-10-29) Els MP4 de sortida fan centenars de
         * MB, així que la còpia NO passa el fitxer pel pont (que seria carregar-lo
         * en memòria ES3): es delega en `File.copy` del motor amb una sola crida.
         * Abans es provava `fs.copyFileSync` de Node, però el manifest no declara
         * `--enable-nodejs` i eixa branca no s'executava mai.
         *
         * @param {string} src - Ruta completa d'origen
         * @param {string} dest - Ruta completa de destí (amb nom de fitxer)
         * @returns {Promise<string>} "OK" o "ERR:..."
         */
        _copyFile: async function (src, dest) {
            try {
                return await callJSX(`IO.copyFile('${getUtils().escape(src)}', '${getUtils().escape(dest)}')`);
            } catch (eJ) { return 'ERR: ' + eJ.message; }
        },

        /**
         * _publishVideo: PUBLICA el MP4 ja renderitzat a les carpetes de PUBLICACIÓ.
         *
         * (2026-10-09 · revisat) El vídeo es renderitza UNA sola vegada I DIRECTAMENT a
         * `config.rutas.render1` (EXPORTS PROVISIONALS del NAS public.ad-ccrtv.local), que
         * per tant és la carpeta D'ORIGEN: aquest mètode la reconeix i NO la torna a
         * copiar (el fitxer ja hi és). Els altres destins — `config.rutas.render2`
         * (608-1080 del svftpccma) — es fan PER CÒPIA. MAI es torna a renderitzar.
         * Àtoms: `utils.ensureFolders` (crea l'arbre UNC abans de copiar) + `_copyFile`.
         *
         * @param {string} srcDir - Carpeta on s'ha renderitzat el MP4 (= rutas.render1)
         * @param {string} fileName - Nom del MP4 (amb extensió)
         * @param {Object} config - Config.get()
         * @returns {Promise<{ok:number, copied:number, inPlace:number, fail:number, details:string[]}>}
         */
        _publishVideo: async function (srcDir, fileName, config) {
            const res = { ok: 0, copied: 0, inPlace: 0, fail: 0, details: [] };
            const rutas = (config && config.rutas) ? config.rutas : {};
            const dests = [
                { label: 'PUB1 · EXPORTS PROVISIONALS', dir: this._rutaExport(rutas.render1) },
                { label: 'PUB2 · 608-1080',             dir: this._rutaExport(rutas.render2) }
            ];
            const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '');
            const srcFolder = norm(srcDir);
            const src = srcFolder + '\\' + fileName;
            for (let i = 0; i < dests.length; i++) {
                const d = dests[i];
                if (!d.dir) {
                    log(`⚠️ [Render] ${d.label}: sense ruta a la config → s'omet`, 'WARN');
                    continue;
                }
                const dir = norm(d.dir);
                // El render JA ha sortit en aquesta carpeta (és el destí de l'exportació):
                // no hi ha res a copiar. Es compta com a destí OK (publicat de fet).
                if (dir.toUpperCase() === srcFolder.toUpperCase()) {
                    res.inPlace++; res.ok++;
                    res.details.push(d.label + ' (origen del render)');
                    log(`📤 [Render] ${d.label} · ja hi és (carpeta d'origen del render, sense còpia): ${src}`);
                    continue;
                }
                const dest = dir + '\\' + fileName;
                // La carpeta del NAS ha d'existir ABANS de copiar: Premiere és fràgil amb UNC.
                try { getUtils().ensureFolders(dir); } catch (eF) { }
                const r = await this._copyFile(src, dest);
                if (r === 'OK') {
                    res.ok++; res.copied++; res.details.push(d.label + ' OK');
                    log(`📤 [Render] ${d.label} · copiat: ${dest}`);
                } else {
                    res.fail++; res.details.push(d.label + ' ' + r);
                    log(`❌ [Render] ${d.label} · NO copiat (${r}): ${dest}`, 'ERROR');
                }
            }
            if (res.ok === 0) {
                log(`⚠️ [Render] El MP4 NO s'ha publicat a cap destí (${res.details.join(' | ')})`, 'WARN');
            }
            return res;
        },

        /**
         * _resolvePortadaName: Decideix el NOM BASE (sense extensió) del PNG de portada.
         *
         * (2026-10-09) El render va DIRECTAMENT a la carpeta de publicació, així que el nom
         * del PNG NO es pot deduir de la carpeta del projecte (hi hauria 0 MP4). Ordre:
         *   1) `lastRenderName` (State, el nom EXACTE del render d'aquesta sessió) si el seu
         *      prefix coincideix amb la seqüència activa.
         *   2) MP4 més recent de la carpeta de publicació amb el mateix prefix
         *      (`pickVideoBase`; cas de panell recarregat, que buida State).
         *   3) `refBase` (buildRenderName amb l'hora actual) — última xarxa.
         * ⚠️ La carpeta de publicació és COMPARTIDA (tots els programes i temes): només
         * s'accepta un MP4 amb el MATEIX prefix PROG_TEMA_ i, si n'hi ha d'avui, només els
         * d'avui. Un MP4 d'un altre tema o d'un altre dia donaria al PNG un nom que no
         * correspon al vídeo que s'acaba d'exportar.
         * Mètode PUR (sense I/O ni JSX) per poder-se testejar fora de Premiere.
         *
         * @param {string} lastRenderName - State.lastRenderName ('' si no n'hi ha)
         * @param {string} refPrefix - "PROG_TEMA_" de la seqüència activa (majúscules)
         * @param {string} refBase - Nom amb l'hora actual (sense extensió)
         * @param {Array|null} files - Llistat de la carpeta de publicació (o null)
         * @returns {{name:string, src:'sessio'|'publicacio'|'hora'}}
         */
        _resolvePortadaName: function (lastRenderName, refPrefix, refBase, files) {
            const lastBase = String(lastRenderName || "");
            if (lastBase && (!refPrefix || lastBase.toUpperCase().indexOf(refPrefix) === 0)) {
                return { name: lastBase, src: 'sessio' };
            }
            const now = new Date();
            const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const all = (files || []).filter(function (f) {
                return refPrefix ? (f.name || '').toUpperCase().indexOf(refPrefix) === 0 : true;
            });
            const today = all.filter(function (f) { return (f.created || f.mtime || 0) >= midnight; });
            const fromFolder = pickVideoBase(today.length ? today : all, null);
            if (fromFolder) return { name: fromFolder, src: 'publicacio' };
            return { name: refBase, src: 'hora' };
        },

        /**
         * _snapAudio: FOTO dels clips d'àudio de la seqüència activa, en clau
         * "pista1based|nom|start" (start amb 2 decimals, com el retorna el JSX).
         * Serveix per detectar, a la neteja del flux Portada, els clips d'àudio que
         * APAREIXEN durant el flux: l'insert amb ripple de la còpia deixa un clip orfe en
         * un TC que decideix Premiere (no el demanat) → comparar per temps no serveix.
         * Composició d'àtoms JSX existents (`Clips.debugTracks`; l'índex de pista és 0-based).
         * @returns {Promise<Set<string>|null>} null si no s'ha pogut llegir (aleshores la
         *          neteja només aplica la regla d'orfes per nom + posició).
         */
        _snapAudio: async function () {
            try {
                const info = JSON.parse(await callJSX(`Clips.debugTracks('audio')`));
                const set = new Set();
                ((info && info.tracks) || []).forEach(function (t) {
                    const a = (parseInt(t.index, 10) || 0) + 1;
                    (t.clips || []).forEach(function (c) {
                        set.add(a + '|' + String(c.name || '') + '|' + (Number(c.start) || 0).toFixed(2));
                    });
                });
                return set;
            } catch (e) {
                log("⚠️ [Portada] No puc fotografiar l'àudio: " + e.message, "WARN");
                return null;
            }
        },

        /**
         * _trimTailAtOut: Retalla el timeline a l'OUT de la seqüència.
         *
         * Elimina (o ajusta amb endAt) TOTS els clips de TOTES les pistes (vídeo, àudio i
         * subtítols) que passen de l'OUT. Així l'exportació directa de Premiere —que no
         * accepta cap rang— exporta exactament "el que queda" ✔.
         *
         * Composició d'àtoms JSX existents (Tracks.count, Clips.count/get/remove/endAt):
         * zero JSX nou.
         *
         * @param {number} outSec - OUT de la seqüència en segons
         * @returns {Promise<{trimmed:number, removed:number, tracks:number}>}
         */
        _trimTailAtOut: async function (outSec) {
            const res = { trimmed: 0, removed: 0, tracks: 0 };
            // (2026-09-21) NOMÉS vídeo i àudio. La pista de SUBTÍTOLS ja ve cortada d'origen
            // (no s'ha de tocar).
            const kinds = ['video', 'audio'];
            for (const kind of kinds) {
                let nTracks = 0;
                try { nTracks = parseInt(await callJSX(`Tracks.count('${kind}')`) || '0', 10) || 0; } catch (eT) { continue; }
                for (let t = 1; t <= nTracks; t++) {
                    let n = 0;
                    try { n = parseInt(await callJSX(`Clips.count(${t}, '${kind}')`) || '0', 10) || 0; } catch (eC) { continue; }
                    if (n === 0) continue;
                    let did = false;
                    // De dalt a baix: en eliminar clips, els índexs es renumeren.
                    for (let i = n - 1; i >= 0; i--) {
                        let clip = null;
                        try {
                            const raw = await callJSX(`Clips.get(${t}, ${i}, '${kind}')`);
                            if (raw && raw !== 'null') clip = JSON.parse(raw);
                        } catch (eG) { continue; }
                        if (!clip) continue;
                        const label = `${kind.toUpperCase()}${t}[${i}] "${String(clip.name || '').substring(0, 40)}"`;
                        if (clip.start >= outSec - 0.02) {
                            const r = await callJSX(`Clips.remove(${t}, ${i}, '${kind}')`);
                            res.removed++; did = true;
                            log(`      ✂️ ${label} (${clip.start.toFixed(2)}→${clip.end.toFixed(2)}s) ELIMINAT (tot ell després de l'OUT) [${r}]`);
                        } else if (clip.end > outSec + 0.02) {
                            const r = await callJSX(`Clips.endAt(${t}, ${clip.start.toFixed(4)}, ${outSec.toFixed(4)}, '${kind}')`);
                            res.trimmed++; did = true;
                            log(`      ✂️ ${label} (${clip.start.toFixed(2)}→${clip.end.toFixed(2)}s) RETALLAT a ${outSec.toFixed(2)}s [${r}]`);
                        }
                    }
                    if (did) res.tracks++;
                }
            }
            return res;
        },

        // ═══════════════════════════════════════════════════════════════════
        // ENQUADRAMENT EXTRA: ANCHOR POINT + ROTATION — BUG #200 (28/10/2026)
        // ═══════════════════════════════════════════════════════════════════
        /**
         * _framingJsx: cos del script ExtendScript (una sola còpia per a llegir i
         * escriure) que troba el component Motion d'un clip de vídeo i les seues
         * propietats d'ENQUADRAMENT (Anchor Point i Rotation).
         *
         * PER QUÈ AIXÍ I NO `Anim.get/setMotionValues`: eixos dos àtoms (`jsx/`)
         * només exposen posició, escala, escala X i retalls. `jsx/` està congelat
         * per orde d'usuari, però `callJSX()` accepta scripts inline (mateix patró
         * que `srt_editor.js::_clearSubtitleTracks`) → no cal tocar el pont.
         *
         * Les propietats es busquen PEL NOM (matchName/displayName, anglés i
         * castellà) i, si el motor no les reporta, es cauen als ÍNDEXS estàndard
         * del component Motion: 0=Position, 1=Scale, 2=Scale Width, 3=Uniform
         * Scale, 4=Rotation, 5=Anchor Point, 6=Antialias, 7..10=Crops.
         * ⚠️ `_getMotionProps` (jsx/7_KF.jsx) documenta «2=Anchor Point»: és un
         * error heretat, l'índex 2 és Scale Width. Ací es fa servir el 5.
         *
         * @param {number} trackIdx - pista (1-based)
         * @param {number} clipIdx - índex del clip (0-based)
         * @param {string|null} writeJson - null = només llegir; si no, JSON
         *   `{"anchor":[x,y],"rotation":r}` amb el que s'ha d'escriure.
         * @returns {string} JSON `{anchor, rotation}` (+ `written` si escriu) o `ERR:…`
         */
        _framingJsx: function (trackIdx, clipIdx, writeJson) {
            var t = parseInt(trackIdx, 10) - 1;
            var c = parseInt(clipIdx, 10);
            return "(function(){try{"
                + "var seq=($.global.FASTPASS&&FASTPASS.Context)?FASTPASS.Context.getWorkSequence():app.project.activeSequence;"
                + "if(!seq)return 'ERR_NO_SEQ';"
                + "var tr=seq.videoTracks[" + t + "];"
                + "if(!tr||!tr.clips)return 'ERR_NO_TRACK';"
                + "var cl=tr.clips[" + c + "];"
                + "if(!cl)return 'ERR_NO_CLIP';"
                + "var cs=cl.components,n=(cs&&(cs.numItems||cs.length))||0,mo=null;"
                + "for(var i=0;i<n;i++){var k=cs[i];if(!k)continue;"
                + "var mn=String(k.matchName||'').toUpperCase(),dn=String(k.displayName||'').toUpperCase();"
                + "if(mn.indexOf('MOTION')!==-1||dn==='MOTION'||dn.indexOf('MOVIMIENTO')!==-1||dn.indexOf('MOVIMENT')!==-1){mo=k;break;}}"
                + "if(!mo||!mo.properties)return 'ERR_NO_MOTION';"
                + "var ps=mo.properties,pn=(ps.numItems||ps.length)||0;"
                + "var find=function(names,fb){for(var a=0;a<pn;a++){var p=ps[a];if(!p)continue;"
                + "var x=String(p.matchName||'').toUpperCase(),y=String(p.displayName||'').toUpperCase();"
                + "for(var j=0;j<names.length;j++){if(x.indexOf(names[j])!==-1||y.indexOf(names[j])!==-1)return p;}}"
                + "return (fb!=null)?(ps[fb]||null):null;};"
                + "var rd=function(p){try{if(!p)return null;var v=p.getValue();"
                + "if(v&&typeof v==='object'&&v.length){var o=[];for(var q=0;q<v.length;q++)o.push(Math.round(v[q]*10000)/10000);return o;}"
                + "return (v==null)?null:Math.round(v*10000)/10000;}catch(e){return null;}};"
                + "var pA=find(['ANCHOR','ANCLAJE','ANCORATGE'],5);"
                + "var pR=find(['ROTAT','ROTACI'],4);"
                + (writeJson
                    ? "var w=" + writeJson + ",done=[];"
                    + "if(w&&w.anchor&&w.anchor.length>=2&&pA){try{pA.setValue([w.anchor[0],w.anchor[1]]);done.push('anchor');}catch(eA){}}"
                    + "if(w&&w.rotation!=null&&pR){try{pR.setValue(w.rotation);done.push('rotation');}catch(eR){}}"
                    + "try{cl.setSelected(false,false);cl.setSelected(true,true);}catch(eS){}"
                    + "return JSON.stringify({written:done,anchor:rd(pA),rotation:rd(pR)});"
                    : "return JSON.stringify({anchor:rd(pA),rotation:rd(pR)});")
                + "}catch(e){return 'ERR: '+e.message;}})()";
        },

        /**
         * _framingProbe: llig Anchor Point i Rotation d'un clip.
         * @returns {Promise<{anchor:(number[]|null), rotation:(number|null), error?:string}>}
         */
        _framingProbe: async function (trackIdx, clipIdx) {
            try {
                const raw = await callJSX(this._framingJsx(trackIdx, clipIdx, null));
                if (!raw || String(raw).indexOf('ERR') === 0) {
                    return { anchor: null, rotation: null, error: String(raw) };
                }
                const o = JSON.parse(raw);
                return { anchor: o.anchor || null, rotation: (o.rotation == null ? null : o.rotation) };
            } catch (e) {
                return { anchor: null, rotation: null, error: e.message };
            }
        },

        /**
         * _framingApply: escriu Anchor Point i Rotation en un clip (BUG #200).
         * Només s'envien les claus que hi ha: la resta no es toca.
         * @returns {Promise<string>} `{written:[…],anchor:[…],rotation:r}` o `ERR:…`
         */
        _framingApply: async function (trackIdx, clipIdx, vals) {
            try {
                const w = {};
                if (vals && vals.anchor && vals.anchor.length >= 2) {
                    w.anchor = [Number(vals.anchor[0]), Number(vals.anchor[1])];
                }
                if (vals && vals.rotation != null && isFinite(Number(vals.rotation))) {
                    w.rotation = Number(vals.rotation);
                }
                if (!w.anchor && w.rotation == null) return '{"written":[]}';
                return String(await callJSX(this._framingJsx(trackIdx, clipIdx, JSON.stringify(w))));
            } catch (e) { return 'ERR: ' + e.message; }
        },

        /**
         * runPortada: Exporta el PNG de la PORTADA (PNG TEMA-TITOL) compost amb el
         * frame del clip de V1 que hi ha sota el cabezal.
         *
         * MECÀNICA (opció 2, 2026-09-18) — TOT passa en una ZONA NETA situada més
         * enllà del final del projecte, per no tocar MAI el muntatge real:
         *   1. CTI = Timeline.get() → clip de V1 que el conté (frame = mediaIn).
         *   2. Còpia d'aquest clip a la ZONA NETA de la MATEIXA V1 amb
         *      Clips.insertClipFrom (ripple: més enllà del final del projecte no desplaça
         *      res; NO s'usa Clips.duplicate perquè fa overwriteClip al START del clip
         *      font i machacaria la V1 real) i l'inPoint alineat al cabezal.
         *   2b. MOTION de l'original copiat a la còpia (posició, escala i retalls) amb
         *      Anim.get/setMotionValues: insertClip crea una INSTÀNCIA NOVA des de
         *      l'ítem i el Motion del clip de pista NO s'hereta. Sense això la captura
         *      NO és el frame que es veu a la timeline (IPD 144% + pos offsets, DF
         *      amb retalls…) i el PNG queda sobre una foto diferent.
         *   3. La PRIMERA portada del tema (Scan.portadas) a V2, damunt de la còpia i
         *      centrada.
         *   4. Cabezal a la zona neta i captura amb `Render.snapshot` (QE `exportFramePNG`,
         *      el mecanisme que funciona · 2026-10-06) i `Render.frame` com a reserva.
         *      🛡️ (2026-10-14 · BUG #160) La captura NO es fa mai al PRIMER frame del clip
         *      (el borde és ambigu: si el redondeig de Premiere mou el clip mig frame, el
         *      frame capturat pot quedar FORA → NEGRE). Es monta amb un PRE-ROLL de GUARD
         *      segons, i el TC de captura es CALCULA amb els valors REALS del clip llegits
         *      després de `moveToRange` (`start` + (`mediaIn` − `inPoint`)) i es verifica
         *      que cau DINS del clip amb marge; si no, es fa servir el 1r frame vàlid.
         *   5. Neteja: s'esborren NOMÉS la còpia i la portada (per TEMPS, amb els starts
         *      REALS llegits) i el cabezal torna on era. No es toca cap mute/lock.
         *   6. El PNG va a AAA_PORTADES (`rutas.portadas`:
         *      \\public.ad-ccrtv.local\Public\VERTICALITZACIO_INFORMATIUS\AAA_PORTADES) amb
         *      EXACTAMENT el mateix nom que el MP4 (inclosa l'hora):
         *      PROG_TEMA_13_15.mp4 → PROG_TEMA_13_15.png.
         *      (2026-10-15 · BUG #163: revertit el canvi del 14/10 · BUG #160, que l'escrivia
         *      a la carpeta del projecte.)
         *      ⚠️ El nom JA NO es dedueix del MP4 de la carpeta del projecte (allà no hi ha
         *      res: el render va DIRECTE a la carpeta de publicació). Es pren de
         *      `State.lastRenderName`, que `runVideo` hi deixa en exportar; si el panell
         *      s'ha recarregat, es busca el MP4 més recent de la carpeta de publicació; i
         *      com a última xarxa, l'hora actual.
         */
        /**
         * (2026-10-16 · BUG #172) GUARDA DE RE-ENTRADA: un segon clic mentre la primera
         * exportacio encara corre muntava una SEGONA composicio sobre la mateixa zona i
         * deixava la sequencia amb doble captura i doble neteja. Ara el segon clic es
         * descarta i s'avisa a la barra d'estat.
         */
        runPortada: async function () {
            const R = FASTPASS_UI.Workflows.Render || this;
            if (R._portadaRunning) {
                log("[Portada] Ja hi ha una exportacio en curs · clic ignorat", "WARN");
                getUtils().status("Portada en curs...", "info");
                return;
            }
            R._portadaRunning = true;
            try {
                await R._runPortadaBody();
            } finally {
                R._portadaRunning = false;
            }
        },

        _runPortadaBody: async function () {
            if (!(await getUtils().validateActiveSequence())) return;
            log("📸 [Portada] Inici (còpia a zona neta + captura de frame)...");

            const utils = getUtils();
            const T_V1 = 1;
            let cti = 0;
            let tempTC = 0;
            let tPort = 0;
            // 🛡️ (2026-10-14) TC REAL on es captura el frame (mai el primer del clip) i
            // starts REALS dels clips temporals (per a la neteja per TEMPS).
            let tcCap = 0;
            let copyStart = null;
            let portStart = null;
            // Out point original de la seqüència, si l'hem hagut d'ampliar per capturar.
            let outRestore = null;
            // (2026-10-16 · BUG #172) IN original i marca de si hem sincronitzat l'ÀREA DE
            // TREBALL amb IN/OUT (`Timeline.zoomToSelection`): totes dues coses es desfan al
            // finally (`Timeline.range(in0, …)`). ⚠️ El PONT (jsx/main.jsx) NOMÉS té
            // `Timeline.in/out/range/getIn/getOut/zoomToSelection`: no hi ha cap
            // `Timeline.inPoint`/`Timeline.outPoint` (aquesta confusió va ser la causa del #172).
            let in0 = 0;
            let waSynced = false;
            // 🛡️ (2026-10-15 · BUG #162) Nom del clip font, final del projecte i FOTO de
            // l'àudio ABANS d'inserir res: l'insert amb ripple de la còpia (insertClipFrom)
            // deixa un clip d'àudio ORFE (sense link, amb el MEDIA SENCER) en un TC que
            // decideix Premiere (vist: 2 s ABANS del punt d'inserció) → la neteja per temps
            // (cleanTC/tempTC) el falla i l'orfà queda a la seqüència. Amb la foto prèvia, a
            // la neteja s'esborra tot clip d'àudio (pista+nom+start) que NO hi era.
            let srcName = "";
            let maxEnd = 0;
            // (2026-10-16 · BUG #172) Guardes de la captura:
            //  · `insertedCopy`: nomes hi ha res a esborrar/restaurar si la copia temporal
            //    s'ha INSERIT de veritat (abans qualsevol error previ a la insercio deixava
            //    un avis de "Neteja INCOMPLETA" amb la sequencia intacta).
            //  · `t0` / `tPre` / `tCap`: cronometres per etapa (queixa de lentitud).
            let audioBefore = null;
            let insertedCopy = false;
            const t0 = Date.now();
            let tPre = 0;
            let tCap = 0;
            
            try {
                const config = FASTPASS_UI.Config.get();
                const state = FASTPASS_UI.State;
                // (2026-10-28 · BUG #200) Els àtoms d'enquadrament extra viuen al
                // mateix mòdul: es guarden en una constant per a poder-los cridar
                // des de dins de qualsevol bloc sense dependre de `this`.
                const RF = FASTPASS_UI.Workflows.Render || null;

                // ── 1. CTI → clip de V1 que el conté ─────────────────────────────
                cti = parseFloat((await callJSX('Timeline.get()')) || "0");
                const srcRaw = await callJSX(`Clips.at(${T_V1}, ${cti}, 'video')`);
                if (!srcRaw || srcRaw === "null") {
                    throw new Error(`No hi ha cap clip a V${T_V1} sota el cabezal (${cti.toFixed(2)}s).`);
                }
                const src = JSON.parse(srcRaw);
                srcName = String(src.name || "");
                const srcStartSec = parseFloat(src.start);
                const srcEndSec   = parseFloat(src.end);
                const srcInSec    = parseFloat(src.inPoint);
                if (!isFinite(srcInSec) || !isFinite(srcStartSec)) {
                    throw new Error(`No puc llegir el clip de V${T_V1} (inPoint=${src.inPoint}, start=${src.start}).`);
                }
                // Frame EXACTE que es veu sota el cabezal = inPoint + desplaçament.
                // ⚠️ Mai pot ser NaN: un NaN arribaria a Clips.inPoint → clip buit → NEGRE.
                let mediaIn = srcInSec + (cti - srcStartSec);
                const mediaEnd = isFinite(srcEndSec) ? (srcInSec + (srcEndSec - srcStartSec)) : NaN;
                // 🛡️ (2026-10-21 · BUG #174) EL FRAME TRIAT NO ES MOU MAI.
                // Fins al 2026-10-20, si el cabezal era a menys de PORTADA_DUR +
                // PORTADA_GUARD (2,08 s) del FINAL del clip es feia
                // `mediaIn = mediaEnd − 2,08` perquè la còpia tinguera prou material: el PNG
                // sortia `2,08 − d` segons ABANS del frame triat (d = distància al final del
                // clip) → amb d = 1,08 s, 25 frames a 25 fps (el cas reportat); amb el frame
                // allunyat del final, mai («en ocasions funciona bé»). Ara s'escurça la CUA
                // de la finestra (la còpia) i el frame es queda on l'ha posat l'usuari.
                // El càlcul és PUR: `js/logic/18_Portada_Window.js` (provat a 19-portada part E).
                if (!getPortadaWindow() || typeof getPortadaWindow().plan !== 'function') {
                    throw new Error("Falta l'àtom `PortadaWindow.plan` (js/logic/18_Portada_Window.js): no es pot garantir el frame de la portada.");
                }
                const winPlan = getPortadaWindow().plan({
                    mediaIn: mediaIn,
                    mediaEnd: mediaEnd,
                    dur: PORTADA_DUR,
                    guard: PORTADA_GUARD,
                    frameSec: FRAME_TOL
                });
                mediaIn = winPlan.mediaIn;
                if (winPlan.warn) log(`⚠️ [Portada] ${winPlan.warn}`, "WARN");
                log(`🎯 [Portada] CTI=${cti.toFixed(2)}s → V1[${src.index}] "${src.name}" (${srcStartSec.toFixed(2)}→${srcEndSec.toFixed(2)}s) | frame del cabezal = media ${mediaIn.toFixed(2)}s | finestra ${winPlan.windowDur.toFixed(2)}s (pre ${winPlan.preRoll.toFixed(2)} + cua ${winPlan.tail.toFixed(2)})`);

                // ── 1b. MOTION DE L'ORIGINAL (es llegeix ABANS de tocar res) ──────
                // `Clips.insertClipFrom` fa targetTrack.insertClip(projectItem) → crea una
                // INSTÀNCIA NOVA des de l'ÍTEM DEL PROJECTE, i Premiere li aplica el Motion
                // PER DEFECTE (centrat, escala 100, sense retalls): el Motion viu a la
                // instància de PISTA, no a l'ítem, i per tant NO s'hereta. Sense això la
                // captura sortia amb un frame diferent del que es veu a la timeline
                // (IPD 144% + pos [-94.5, 562] px, retalls de la DF…).
                // Es llegeix ARA perquè el CTI encara és al cabezal → valor del frame exacte
                // que es vol capturar; s'aplica a la còpia a 4b. Els àtoms get/set treballen
                // en les mateixes unitats (get torna PÍXELS i set els normalitza ell mateix).
                let srcMotion = null;
                try {
                    const mvSrc = await callJSX(`Anim.getMotionValues(${T_V1}, ${src.index})`);
                    if (mvSrc && String(mvSrc).indexOf('ERR') !== 0) {
                        srcMotion = JSON.parse(mvSrc);
                        log(`🎯 [Portada] Motion de l'ORIGINAL V${T_V1}[${src.index}]: ${mvSrc}`);
                    } else {
                        log(`⚠️ [Portada] Motion de l'original no llegible (${mvSrc}) → la còpia quedarà amb el Motion per defecte`, "WARN");
                    }
                } catch (eMv) {
                    log(`⚠️ [Portada] Llegint el Motion de l'original: ${eMv.message}`, "WARN");
                }

                // ── 1c. ENQUADRAMENT EXTRA DE L'ORIGINAL (BUG #200) ──────────────
                // `Anim.getMotionValues` NO exposa Anchor Point ni Rotation (jsx/
                // congelat), però `_framingProbe` els llig amb un script inline
                // sobre el MATEIX pont. Es llig ARA, amb el CTI encara al cabezal,
                // i s'aplica a la còpia a 4b.
                let srcFraming = null;
                try {
                    if (RF && typeof RF._framingProbe === 'function') {
                        srcFraming = await RF._framingProbe(T_V1, src.index);
                        if (srcFraming && !srcFraming.error) {
                            log(`🎯 [Portada] Enquadrament de l'ORIGINAL V${T_V1}[${src.index}]: anchor=${JSON.stringify(srcFraming.anchor)} rotation=${srcFraming.rotation}`);
                        } else {
                            log(`⚠️ [Portada] Enquadrament extra no llegible (${srcFraming ? srcFraming.error : 'sense mòdul'}) → la còpia quedarà amb el punt d'ancoratge per defecte`, "WARN");
                            srcFraming = null;
                        }
                    }
                } catch (eFr) {
                    log(`⚠️ [Portada] Llegint l'enquadrament extra: ${eFr.message}`, "WARN");
                    srcFraming = null;
                }

                // ── 2. PORTADA: la PRIMERA del tema ──────────────────────────────
                // La data de treball es passa explícitament perquè Scan.portades
                // filtri els PNG per la data del projecte actual (no només mtime).
                const stateDateDir = state.dateDir || utils.getFormattedDate().replace(/["\s]/g, "").trim();
                const ctx = { config, progData: state.progData, bloque: state.bloque, dateDir: stateDateDir };
                // (2026-10-16 · BUG #172) LECTURES INDEPENDENTS EN PARAL·LEL: la portada
                // (BIN PORTADES o, si el projecte no en té, el NAS), la foto de les pistes de
                // vídeo (per maxEnd) i la foto de l'àudio no depenen entre elles i abans anaven
                // EN SERIE (2-3 viatges al NAS, de 0,5-2 s cada un, dins d'un flux que l'usuari troba lent). Ara surten alhora.
                const tLect = Date.now();
                // (2026-10-21) Cada lectura amb el SEU cronòmetre: el total de 93,52 s
                // del 21/10 no deia si el cost era del NAS o de les pistes. Així, al log,
                // es veu exactament quina de les tres cal optimitzar.
                const tP0 = Date.now(), tV0 = Date.now(), tA0 = Date.now();
                const pPort = getScanner().portadas(ctx).then(function (r) {
                    log(`[Portada] ⏱ Scan.portades: ${((Date.now() - tP0) / 1000).toFixed(2)}s (${(r || []).length} candidata/es)`);
                    return r;
                });
                const pVid = callJSX(`Clips.debugTracks('video')`).then(function (r) {
                    log(`[Portada] ⏱ debugTracks(video): ${((Date.now() - tV0) / 1000).toFixed(2)}s`);
                    return r;
                });
                const pAud = this._snapAudio().then(function (r) {
                    log(`[Portada] ⏱ foto d'àudio: ${((Date.now() - tA0) / 1000).toFixed(2)}s`);
                    return r;
                });
                const lect = await Promise.all([pPort, pVid, pAud]);
                const portadas = lect[0];
                const vRaw = lect[1];
                audioBefore = lect[2];
                log(`[Portada] Lectures en paral·lel (portada + pistes de vídeo + foto d'àudio): ${((Date.now() - tLect) / 1000).toFixed(2)}s`);
                const portada = (portadas && portadas.length > 0) ? portadas[0] : null;
                
                if (!portada) {
                    throw new Error("No s'ha trobat cap PNG de portada (nom amb PORTADA) que coincideixi amb el Programa i el Bloc.");
                }
                const sz = pngSize(portada.path);
                log(`🖼️ [Portada] Portada del tema: ${portada.name}${sz ? ' (' + sz.w + 'x' + sz.h + ' px)' : ''}`);

                // ── 3. ZONA NETA: més enllà del final de TOT el projecte ─────────
                // ⚠️ `vRaw` ve de la lectura en PARAL·LEL de més amunt (2026-10-16 · BUG #172).
                let info = null;
                try { info = JSON.parse(vRaw); } catch (eV) { }
                if (!info || !info.tracks || !info.tracks.length) {
                    throw new Error("No puc llegir les pistes de vídeo (" + vRaw + ").");
                }
                const nVT = info.tracks.length;
                if (nVT < 2) throw new Error("Calen com a mínim 2 pistes de vídeo (còpia + portada).");

                maxEnd = parseFloat((await callJSX('Timeline.duration()')) || "0");
                info.tracks.forEach(function (t) {
                    (t.clips || []).forEach(function (c) { if (c.end > maxEnd) maxEnd = c.end; });
                });
                tempTC = Math.ceil(maxEnd) + CLEAN_MARGIN;
                // 🛡️ (2026-10-14) Finestra de captura amb PRE-ROLL: el clip comença
                // `winPlan.preRoll` s ABANS de tempTC → el frame del cabezal (mediaIn) NO és
                // mai el PRIMER frame del clip (el borde és ambigu i pot sortir NEGRE).
                // (2026-10-21 · BUG #174) La CUA també ve del pla: si el clip s'acaba just
                // després del frame, la finestra s'escurça (el FRAME NO es toca).
                const tStart = tempTC - winPlan.preRoll;
                const tEnd   = tStart + winPlan.windowDur;

                // La còpia va a la MATEIXA V1 (zona neta) i la portada a V2, damunt seu.
                const T_PORT = (config.tracks && config.tracks.video && config.tracks.video.fondos) || 2;
                log(`🧹 [Portada] Zona neta @ ${tempTC}s (final projecte=${maxEnd.toFixed(2)}s) | finestra ${tStart.toFixed(2)}→${tEnd.toFixed(2)}s | còpia a V${T_V1} | portada a V${T_PORT} (${nVT} pistes de vídeo)`);

                // 🛡️ (2026-10-15 · BUG #162) FOTO de l'àudio ABANS d'inserir la còpia: el
                // ripple insert deixa un clip d'àudio orfe en un TC impredictible, així que
                // la neteja es fa per DIFERÈNCIA contra aquesta foto (no per temps).
                // ⚠️ `audioBefore` ve de la lectura en PARAL·LEL de més amunt (2026-10-16 · BUG #172).
                log(`🧾 [Portada] Àudio abans d'inserir: ${audioBefore ? audioBefore.size + ' clips' : 'NO llegible (només regla d\'orfes)'}`);

                // ── 4. CÒPIA del clip de V1 a la zona neta (a la MATEIXA V1) ─────
                // S'usa insertClipFrom (ripple): com que tempTC és més enllà del final de
                // TOT el projecte, el ripple NO desplaça cap clip. NO s'usa Clips.duplicate
                // perquè fa overwriteClip al START del clip font (media sencer) i
                // machacaria la V1 real.
                const ins = await callJSX(`Clips.insertClipFrom(${T_V1}, ${src.index}, ${T_V1}, ${tempTC}, 'video')`);
                log(`🧬 [Portada] Clips.insertClipFrom V1[${src.index}] → V1 @ ${tempTC}s → ${ins}`);
                if (String(ins).indexOf('OK') !== 0) throw new Error("La còpia del clip a V1 ha fallat: " + ins);
                // (2026-10-16 · BUG #172) A partir d'aquí ja hi ha còpia a la zona neta: és el
                // senyal perquè el `finally` faci la neteja (abans qualsevol error previ a la
                // inserció deixava un avís de "Neteja INCOMPLETA" amb la seqüència intacta).
                insertedCopy = true;
                await utils.delay(300);
                const idxCopy = await clipIndexAt(T_V1, tempTC);
                if (idxCopy < 0) throw new Error(`No trobo la còpia a V${T_V1} @ ${tempTC}s.`);

                // inPoint ABANS de tancar la durada: Premiere ignora el setter d'inPoint
                // en el MATEIX evalScript que la inserció → cal una crida pròpia.
                // 🛡️ (2026-10-14) PRE-ROLL: l'inPoint va el pre-roll del pla (`winPlan.preRoll`,
                // 2 frames) ABANS del frame del cabezal, perquè aquest no caigui al primer
                // frame del clip. (2026-10-21 · BUG #174) El frame de referència és `mediaIn`,
                // que ja NO s'ha mogut.
                const copyIn = Math.max(0, mediaIn - winPlan.preRoll);
                await callJSX(`Clips.inPoint(${T_V1}, ${idxCopy}, ${copyIn}, 'video')`);
                const mv = await callJSX(`Clips.moveToRange(${T_V1}, ${idxCopy}, ${tStart}, ${tEnd}, 'video')`);
                log(`📐 [Portada] Còpia a la zona neta (${tStart.toFixed(2)}→${tEnd.toFixed(2)}s · inPoint ${copyIn.toFixed(2)}s): ${mv}`);
                if (String(mv).indexOf('OK') !== 0) {
                    log(`⚠️ [Portada] El moveToRange de la còpia no ha quadrat (${mv}) · es fan servir els temps REALS del clip`, "WARN");
                }

                // ── 4a. VERIFICACIÓ + TC DE CAPTURA AMB ELS VALORS REALS (2026-10-14) ──
                // Premiere redondeja start/end a frame: els valors reals poden diferir dels
                // demanats. El frame del cabezal (mediaIn) és a la timeline a:
                //     start_real + (mediaIn − inPoint_real)
                // Es verifica que aquest TC cau DINS del clip amb ≥1 frame de marge a cada
                // banda; si no, es captura el primer frame vàlid (mai un frame buit → NEGRE).
                let copyData = null;
                try { copyData = JSON.parse(await callJSX(`Clips.get(${T_V1}, ${idxCopy}, 'video')`)); } catch (eCpy) { }
                if (!copyData) throw new Error(`No puc llegir la còpia de V${T_V1} (índex ${idxCopy}) → captura insegura.`);
                copyStart = parseFloat(copyData.start);
                const copyEndSec = parseFloat(copyData.end);
                const copyInReal = isFinite(parseFloat(copyData.inPoint)) ? parseFloat(copyData.inPoint) : copyIn;
                log(`   · còpia V${T_V1}[${idxCopy}] start=${copyStart}s end=${copyEndSec}s in=${copyInReal}s out=${copyData.outPoint}s`);
                if (!isFinite(copyStart) || !isFinite(copyEndSec) || (copyEndSec - copyStart) <= FRAME_TOL) {
                    throw new Error(`La còpia de V${T_V1} ha quedat buida (${copyStart}s→${copyEndSec}s) · capturar-hi donaria NEGRE.`);
                }
                tcCap = copyStart + (mediaIn - copyInReal);
                if (!isFinite(tcCap) || tcCap <= copyStart + FRAME_TOL - 1e-6 || tcCap >= copyEndSec - FRAME_TOL + 1e-6) {
                    const safeCap = Math.min(copyStart + FRAME_TOL, copyEndSec - FRAME_TOL);
                    log(`⚠️ [Portada] El frame del cabezal (${isFinite(tcCap) ? tcCap.toFixed(2) : tcCap}s) no cau DINS de la còpia (${copyStart.toFixed(2)}→${copyEndSec.toFixed(2)}s) → capturo el 1r frame vàlid ${safeCap.toFixed(2)}s`, "WARN");
                    tcCap = safeCap;
                }
                log(`🎯 [Portada] Captura a ${tcCap.toFixed(2)}s (còpia ${copyStart.toFixed(2)}→${copyEndSec.toFixed(2)}s · inPoint real ${copyInReal.toFixed(2)}s · frame cabezal = media ${mediaIn.toFixed(2)}s)`);

                // ── 4b. HERETAR EL MOTION: posició + escala (+ retalls) = ORIGINAL ──
                // La còpia s'ha de veure EXACTAMENT com el clip original; si no, el PNG es
                // compon sobre un frame que no és el de la timeline. Només s'envien les
                // claus que el JSX ha pogut llegir (les null s'ometen i no es toquen).
                if (srcMotion) {
                    // 🐞 BUG #200 (2026-10-27 / 28): la còpia ha de quedar amb TOTES les
                    // propietats d'ENCUADRAMENT de l'original. Ací van les que SÍ exposa
                    // `Anim.getMotionValues` (posició, escala, escala X i retalls);
                    // l'Anchor Point i la Rotation s'apliquen just davall amb
                    // `_framingApply` (script inline, BUG #200).
                    const vals = {};
                    ['position', 'scale', 'scaleWidth',
                        'cropLeft', 'cropTop', 'cropRight', 'cropBottom']
                        .forEach(function (k) {
                            if (srcMotion[k] !== null && srcMotion[k] !== undefined) vals[k] = srcMotion[k];
                        });
                    try {
                        const mvRes = await callJSX(`Anim.setMotionValues(${T_V1}, ${idxCopy}, '${utils.escape(JSON.stringify(vals))}')`);
                        log(`🎯 [Portada] Motion heretat → còpia V${T_V1}[${idxCopy}]: ${JSON.stringify(vals)} → ${mvRes}`);
                        log(`   · comprovació còpia V${T_V1}[${idxCopy}] → ${await callJSX(`Anim.getMotionValues(${T_V1}, ${idxCopy})`)}`);
                        if (String(mvRes).indexOf('OK') !== 0) {
                            log(`⚠️ [Portada] La còpia NO ha pogut heretar el Motion (${mvRes}) → el frame capturat pot no coincidir amb la timeline`, "WARN");
                        }
                    } catch (eSm) {
                        log(`⚠️ [Portada] Aplicant el Motion a la còpia: ${eSm.message}`, "WARN");
                    }
                } else {
                    log("⚠️ [Portada] Sense Motion de l'original → còpia amb el Motion per defecte", "WARN");
                }

                // ── 4c. ANCHOR POINT + ROTATION DE LA CÒPIA (BUG #200, 28/10/2026) ──
                // Es VA DESPRÉS de `setMotionValues` perquè eixe àtom toca Scale
                // Width/Uniform Scale i ha de quedar-se amb l'última paraula en
                // eixes propietats (l'Anchor Point és una altra propietat i no es
                // trepitgen). Si l'original i la còpia ja coincidixen (el cas
                // normal: punt d'ancoratge per defecte), no canvia res.
                if (srcFraming && (srcFraming.anchor || srcFraming.rotation != null)) {
                    const wRes = await RF._framingApply(T_V1, idxCopy, srcFraming);
                    log(`🎯 [Portada] Enquadrament extra heretat → còpia V${T_V1}[${idxCopy}]: ${wRes}`);
                    const chk = await RF._framingProbe(T_V1, idxCopy);
                    const dA = (srcFraming.anchor && chk.anchor)
                        ? Math.max(Math.abs(srcFraming.anchor[0] - chk.anchor[0]), Math.abs(srcFraming.anchor[1] - chk.anchor[1])) : 0;
                    const dR = (srcFraming.rotation != null && chk.rotation != null)
                        ? Math.abs(srcFraming.rotation - chk.rotation) : 0;
                    log(`   · comprovació anchor=${JSON.stringify(chk.anchor)} rotation=${chk.rotation} (Δanchor=${dA} Δrot=${dR})`);
                    if (dA > 0.001 || dR > 0.01) {
                        log(`⚠️ [Portada] El motor no ha acceptat l'enquadrament extra (Δanchor=${dA}, Δrot=${dR}) → el PNG pot eixir desencaixat`, "WARN");
                    }
                } else {
                    log("🧪 [Portada] Enquadrament extra: l'original no té Anchor Point/Rotation llegibles → res a heretar (BUG #200)");
                }

                // ── 5. PORTADA DAMUNT de la còpia, CENTRADA ──────────────────────
                const look = await callJSX(`IO.lookFor('${utils.escape(JSON.stringify([portada.name]))}')`);
                if (String(look) !== "true") {
                    const payload = JSON.stringify([portada.path.replace(/\\/g, '/')]);
                    log(`📥 [Portada] Import al projecte → ${await callJSX(`IO.importFiles('${utils.escape(payload)}', 'root')`)}`);
                }
                // Pista de la portada: V2, damunt de la còpia. Si V2 estigués bloquejada de
                // veritat, es prova la de sobre (la zona neta és buida a totes les pistes).
                let insP = "";
                let insErr = "";
                for (let t = T_PORT; t <= nVT; t++) {
                    insP = await callJSX(`Clips.insert('${utils.escape(portada.name)}', ${t}, ${tStart}, ${tEnd}, 'video')`);
                    if (String(insP).indexOf('OK') === 0) { tPort = t; break; }
                    insErr = insP;
                    // Si l'item no és al projecte, cap pista servirà: no cal seguir provant.
                    if (String(insP).indexOf('ERR_ITEM_NOT_FOUND') === 0) break;
                    log(`⚠️ [Portada] insert a V${t} → ${insP} · es prova la pista de sobre...`, "WARN");
                }
                if (!tPort) throw new Error("No s'ha pogut inserir la portada (1a opció V" + T_PORT + "): " + insErr);
                const idxPort = await clipIndexAt(tPort, tempTC);
                if (idxPort < 0) throw new Error(`No trobo la portada a V${tPort} @ ${tempTC}s.`);
                // 🛡️ (2026-10-14) La portada s'ALINEA al rang REAL de la còpia (mateixos
                // start/end) perquè cobreixi EXACTAMENT el frame que es captura (tcCap).
                const mvP = await callJSX(`Clips.moveToRange(${tPort}, ${idxPort}, ${copyStart}, ${copyEndSec}, 'video')`);
                portStart = copyStart;
                log(`🖼️ [Portada] Alineada a la còpia (${copyStart.toFixed(2)}→${copyEndSec.toFixed(2)}s): ${mvP}`);
                if (String(mvP).indexOf('OK') !== 0) {
                    log(`⚠️ [Portada] El moveToRange de la portada no ha quadrat (${mvP}) · pot no cobrir el frame capturat`, "WARN");
                }

                // Escala de la portada: es conserva la que aplica Premiere en importar la
                // imatge (o PORTADA_SCALE si està fixada) i `Anim.setMotionValues` força
                // a més "Uniform Scale" + "Scale Width".
                const cur = await callJSX(`Anim.getMotionValues(${tPort}, ${idxPort})`);
                let sc = PORTADA_SCALE;
                try {
                    const o = JSON.parse(cur);
                    if (sc == null && o && typeof o.scale === 'number' && o.scale > 0) sc = o.scale;
                } catch (eS) { log("⚠️ [Portada] Motion il·legible (" + cur + ")", "WARN"); }
                if (sc == null) sc = 100;
                const scVia = (PORTADA_SCALE == null) ? 'llegida de la imatge' : 'forçada per PORTADA_SCALE';
                log(`🎯 [Portada] Escala V${tPort}[${idxPort}] = ${sc}% (${scVia}) → ${await callJSX(`Anim.setMotionValues(${tPort}, ${idxPort}, '${JSON.stringify({ scale: sc }).replace(/'/g, "\\'")}')`)}`);

                // ── CENTRAT: Posició crua [0.5, 0.5] ─────────────────────────────
                // ⚠️ Motion → Position és NORMALITZADA (0..1) i 0.5 = CENTRE del frame;
                // (0,0) seria la cantonada superior esquerra (per això sortia descentrat).
                // `Anim.setMotionValues` NO serveix per això: espera PÍXELS i els divideix
                // per la mida del frame, que la capa JS no pot consultar → s'escriu el
                // valor normalitzat EN CRU amb Clips.setProp (l'àtom ja ho preveu per a
                // "ADBE Video Position"). El valor actual es mostra en PÍXELS per poder-lo
                // comparar amb la UI (el centre és frameSize/2).
                const cRes = await callJSX(`Clips.setProp(${tPort}, ${idxPort}, 'AE.ADBE Motion', 'ADBE Video Position', [0.5, 0.5], 'video')`);
                log(`🎯 [Portada] Posició centrada [0.5, 0.5] → ${cRes} | motion=${await callJSX(`Anim.getMotionValues(${tPort}, ${idxPort})`)}`);

                // ── 6. CABEZAL + CAPTURA (mateix mecanisme que el freeze) ────────
                // 🛡️ (2026-10-14) La captura es fa a `tcCap` = TC REAL calculat
                // (start_real + (mediaIn − inPoint_real)), SEMPRE amb ≥1 frame de marge a
                // dins del clip: és l'instant en què la còpia mostra el frame del cabezal
                // sense el risc del borde (que és el que produïa el PNG NEGRE).
                // (2026-10-16 · BUG #172) El cabezal NO es mou aquí: es mou JUST ABANS de
                // capturar, a 6a (amb `seekCti`, que VERIFICA la lectura real). Abans es feia
                // `Timeline.set(tcCap)` aquí + un `delay(500)` fixe i, pel mig, el flux
                // passava pel NAS (carpeta de portades, noms, import…) i ampliava l'Out
                // point: si el CTI no quallava o Premiere el clampejava (l'Out encara era
                // curt!), la captura QE sortia d'un ALTRE frame i ningú no s'avisava.

                // ── 6b. DESTÍ del PNG: AAA_PORTADES (`config.rutas.portadas`) ──
                // 🛡️ (2026-10-15 · BUG #163) El PNG va a la carpeta de PORTADES PUBLICADES
                // (`\\public.ad-ccrtv.local\Public\VERTICALITZACIO_INFORMATIUS\AAA_PORTADES`),
                // com abans del 09/10-2026 — es REVERTEIX el canvi del 14/10 (BUG #160), que
                // l'escrivia a la carpeta del projecte. Ordre de resolució:
                //   1) config.rutas.portadas → AAA_PORTADES (destí normal; es crea si cal).
                //   2) Context.folder() → carpeta del .prproj (NOMÉS si no hi ha config).
                //   3) workFolder(State) → destinoBase → C:\Temp (últim recurs).
                const norm = (p) => String(p || "").replace(/\//g, "\\").replace(/\\+$/, "");
                const projFolder = await callJSX("Context.folder()");
                let outDir = norm((projFolder && String(projFolder).indexOf('ERR') !== 0) ? projFolder : '');
                if (!outDir) {
                    outDir = norm(utils.workFolder(window.FASTPASS_UI.State) || config.rutas.destinoBase || "C:\\Temp");
                    log(`⚠️ [Portada] Context.folder() no vàlid ("${projFolder}") → recurs alternatiu: ${outDir}`, "WARN");
                }
                // 🛡️ DESTÍ = carpeta de portades publicades (AAA_PORTADES).
                const portadesDir = norm(this._rutaExport(config.rutas && config.rutas.portadas));
                const pngDir = portadesDir || outDir;
                if (!portadesDir) {
                    log(`⚠️ [Portada] Sense "rutas.portadas" a la config → el PNG anirà a la carpeta del projecte (${outDir})`, "WARN");
                }

                // ── 6c. NOM del PNG: FONT GARANTIDA (2026-10-09) ─────────────────
                // ⚠️ El nom NO es pot deduir de la carpeta del projecte: `runVideo` exporta
                // el MP4 DIRECTAMENT a la carpeta de publicació (rutas.render1), o sigui que
                // el nom del PNG s'ASSEGURA així, per ordre de confiança:
                //   1) State.lastRenderName ← nom EXACTE del render d'aquesta sessió (el desa
                //      runVideo en exportar; prefix verificat contra la seqüència activa).
                //   2) MP4 més recent de la CARPETA DE PUBLICACIÓ amb el prefix PROG_TEMA_
                //      (cobreix el cas d'haver recarregat el panell, que buida State).
                //   3) buildRenderName() amb l'hora actual (última xarxa; avisa amb WARN).
                const refBase = buildRenderName(await callJSX('Context.activeSeq()')).replace(/\.mp4$/i, "");
                const refPrefix = refBase.replace(/_\d{2}_\d{2}$/, '_').toUpperCase();
                const lastBase = String(state.lastRenderName || "");
                const lastOk = !!(lastBase && (!refPrefix || lastBase.toUpperCase().indexOf(refPrefix) === 0));
                // Carpeta de publicació = on runVideo hi ha deixat el MP4 (rutas.render1).
                // Només s'hi llegeix si State no porta el nom (cap llistat NAS innecessari).
                const pubDir = norm(this._rutaExport(config.rutas && config.rutas.render1)) || outDir;
                let files = null;
                if (!lastOk) {
                    try { files = await utils.readFolder(pubDir); } catch (eL) { log("⚠️ [Portada] No puc llistar la carpeta: " + eL.message, "WARN"); }
                    if (files === null) log(`⚠️ [Portada] Lectura FALLIDA de ${pubDir} (null ≠ carpeta buida)`, "WARN");
                }
                const pick = this._resolvePortadaName(lastOk ? lastBase : "", refPrefix, refBase, files);
                const nameBase = pick.name;
                if (pick.src === 'sessio') {
                    log(`🎬 [Portada] Nom del PNG: ${nameBase}.png ← render d'aquesta sessió` +
                        (state.lastRenderMp4 ? ` (${state.lastRenderMp4})` : ""));
                } else if (pick.src === 'publicacio') {
                    log(`🎬 [Portada] Nom del PNG: ${nameBase}.png ← MP4 de la carpeta de publicació (${pubDir})`);
                } else {
                    log(`⚠️ [Portada] Cap MP4 de referència a ${pubDir}: el PNG es nomenarà amb l'hora actual (${nameBase})`, "WARN");
                }
                const destPath = `${pngDir}\\${nameBase}.png`;
                utils.ensureFolders(pngDir);
                log(`📸 [Portada] Captura a ${destPath} (t=${tcCap.toFixed(2)}s) | carpeta de portades (AAA_PORTADES) | publicació=${norm(config.rutas && config.rutas.render1)}`);

                // S'escriu DIRECTAMENT al destí final amb QE (com el freeze dels chyrons):
                // exportFrameQE ja crea la carpeta si cal i funciona amb rutes UNC. Evitem
                // el pas per C:\temp + cep.fs.rename (era on es perdia el PNG).
                //
                // El fotograma s'exporta amb un timecode DINS del rang de la seqüència: si
                // l'Out point està fixat i queda ABANS de la zona neta, QE no escriu res.
                // S'amplia temporalment i es restaura al finally.
                const out0 = parseFloat(await callJSX('Timeline.getOut()') || "0");
                // 🛡️ (2026-10-14) L'Out ha de cobrir la FINESTRA SENCERA (tStart→tEnd) amb
                // marge: si l'Out queda abans, QE `exportFramePNG` no escriu res (NEGRE).
                // Després es VERIFICA el valor REAL i s'avisa si no s'ha ampliat.
                const needOut = tEnd + 1;
                // (2026-10-16 · BUG #172) IN original: el rang sencer (IN+OUT) s'ha de poder
                // tornar exactament com estava (el pont NO té `Timeline.inPoint`: es restaura
                // amb `Timeline.range`, vegeu el finally).
                in0 = parseFloat(await callJSX('Timeline.getIn()') || "0");
                if (!(out0 >= needOut - 0.02)) {   // (BUG #172) abans: `out0 > 0 && out0 < needOut` no cobria out0 = 0/NaN
                    outRestore = (isFinite(out0) && out0 > 0) ? out0 : 0;   // (BUG #172) 0 = la seqüència no tenia Out
                    const rOut = await callJSX(`Timeline.out(${needOut})`);   // pont: Timeline.out → FASTPASS.Timeline.outPoint → seq.setOutPoint
                    const realOut = parseFloat(await callJSX('Timeline.getOut()') || "0");
                    // (2026-10-16 · BUG #172) Aquest valor és decisiu: `Render.snapshot` →
                    // `Render.exportFrameQE(timeSec, path)` converteix tcCap a timecode i crida
                    // `qeSeq.exportFramePNG(tc, path)`. Amb un TC FORA del rang de la seqüència
                    // (Out curt), QE escrivia un frame equivocat: la portada sortia d'un altre
                    // moment de la timeline. El mètode del PONT és `Timeline.out(v)`; el
                    // `Timeline.outPoint(v)` amb què es va intentar arreglar no existeix al pont
                    // (jsx/main.jsx: `"out"` → `FASTPASS.Timeline.outPoint`) i tornava
                    // `EvalScript error` en silenci. La comprovació de rang es fa a 6a.
                    log(`📐 [Portada] Out point ampliat temporalment ${out0.toFixed(2)}s → ${needOut}s (${rOut}) · real=${realOut.toFixed(2)}s`);
                    if (!isFinite(realOut) || realOut < needOut - 0.02) {
                        log(`⚠️ [Portada] L'Out point NO s'ha ampliat de veritat (real=${realOut}s < ${needOut}s) · la captura podria sortir NEGRA!`, "WARN");
                    }
                } else {
                    log(`📐 [Portada] Out point = ${out0.toFixed(2)}s · captura a ${tcCap.toFixed(2)}s (finestra ${tStart.toFixed(2)}→${tEnd.toFixed(2)}s)`);
                }

                // 🛡️ (2026-10-16 · BUG #172) ÀREA DE TREBALL: `Timeline.out` mou el corxet OUT,
                // però l'ÀREA DE TREBALL (el rang amb què exporta QE si està activada) només se
                // SINCRONITZA amb IN/OUT via `Timeline.zoomToSelection()` (pont →
                // `FASTPASS.Timeline.zoomToSelection` → setWorkAreaIn/OutPoint; patró ja seguit a
                // flow_graphics.js). Sense això el TC de captura podia quedar FORA de l'àrea de
                // treball → QE tornava un altre frame. Es fa SEMPRE abans de capturar (encara que
                // l'Out ja cobrira) i el finally el desfà. Mou el CTI a l'IN: la captura torna a
                // fixar el cabezal acte seguit (6a · `seekCti`).
                const rZoom = await callJSX('Timeline.zoomToSelection()');
                waSynced = true;
                log(`📐 [Portada] Àrea de treball sincronitzada amb IN/OUT (in=${in0.toFixed(2)}s → out=${Math.max(needOut, out0).toFixed(2)}s): ${rZoom}`);

                // (2026-10-06) El mètode que FUNCIONA és `Render.snapshot` = QE exportFramePNG
                // (main.jsx:669 → FASTPASS.Render.exportFrameQE; commit 4327704 «captura de frame
                // (Render.snapshot)»). Rep la ruta SENSE extensió. `Render.frame`
                // (= `seq.exportFrame`) LLANÇA «ERR: seq.exportFrame is not a function» → queda
                // com a segona opció per si algun dia l'API estàndard existeix al DOM.
                // 🛡️ (2026-10-14) VERIFICACIÓ del frame que es captura: hi ha d'haver la
                // còpia a V1 i la portada a la seva pista EXACTAMENT a tcCap (si no, NEGRE).
                // (2026-10-16 · BUG #172) Fi de la preparació: a partir d'aquí res no pot
                // tornar a moure el cabezal ni el rang de la seqüència.
                tPre = Date.now();

                // 🛡️ (2026-10-16 · BUG #172) GUARDA DE RANG: l'Out point HA de cobrir el frame de
                // captura; si no, `exportFrameQE` rep un TC fora del rang de la seqüència i QE
                // exporta un frame EQUIVOCAT enlloc de fallar. Només s'atura quan la LECTURA ho
                // PROVA (valor finit i més petit que el TC): si la lectura no és concloent (0/NaN
                // = no llegible) es continua amb avís, perquè deixar l'usuari sense portada quan
                // no hi ha cap prova de fallada seria pitjor que intentar la captura.
                const outCap = parseFloat((await callJSX('Timeline.getOut()')) || "0");
                if (isFinite(outCap) && outCap > 0 && outCap < tcCap + FRAME_TOL) {
                    throw new Error("L'Out point (" + outCap.toFixed(2) + "s) no cobreix el frame de captura (" + tcCap.toFixed(2) + "s) → QE exportaria una portada d'un altre frame.");
                }
                if (!(outCap >= tcCap + FRAME_TOL)) {
                    log(`⚠️ [Portada] No puc CONFIRMAR que l'Out point cobreix el frame de captura (getOut()=${isFinite(outCap) ? outCap.toFixed(2) : outCap}s vs tcCap=${tcCap.toFixed(2)}s) · continue (si la portada surt d'un altre frame, revisa el corxet OUT)`, "WARN");
                }
                // ── 6a. CABEZAL al frame de captura, VERIFICAT ───────────────────
                // `seekCti` fa `Timeline.set` + comprova la lectura REAL amb `Timeline.get`
                // (fins a 3 intents, amb `Timeline.refresh` pel mig) i, si no qualla, LLANÇA.
                tCap = Date.now();
                await seekCti(tcCap, 'captura');

                const chkCopy = await callJSX(`Clips.at(${T_V1}, ${tcCap}, 'video')`);
                const chkPort = await callJSX(`Clips.at(${tPort}, ${tcCap}, 'video')`);
                log(`🔎 [Portada] Frame ${tcCap.toFixed(2)}s → V${T_V1}: ${chkCopy} | V${tPort}: ${chkPort}`);
                if (!chkCopy || String(chkCopy) === "null") {
                    log(`⚠️ [Portada] NO hi ha còpia a V${T_V1} @ ${tcCap.toFixed(2)}s · el PNG sortirà NEGRE`, "WARN");
                }

                const tCapt = Date.now();
                const destExt = /\.png$/i.test(destPath) ? destPath : (destPath + ".png");
                const destNoExt = destExt.replace(/\.png$/i, "");
                // 🛡️ (2026-10-16 · BUG #172) Si ja hi ha un PNG amb aquest nom (exportació
                // anterior, o una que va quedar a mitges), s'ESBORRA abans d'exportar: abans
                // `waitFile` només mirava l'EXISTÈNCIA i un fitxer VELL passava la comprovació
                // → es publicava com si fos la portada nova.
                const stVell = window.cep.fs.stat(destExt);
                if (stVell && stVell.err === 0) {
                    let delOk = utils.deleteFile(destExt);
                    if (!delOk) { await utils.delay(200); delOk = utils.deleteFile(destExt); }
                    log(`[Portada] PNG anterior del mateix nom ${delOk ? 'ESBORRAT' : 'NO esborrat'} abans de capturar: ${destExt}`, delOk ? "INFO" : "WARN");
                    if (!delOk) throw new Error("Hi ha un PNG anterior a " + destExt + " i no s'ha pogut esborrar → publicar-lo donaria una portada VELLA.");
                }
                let snapRes = await callJSX(`Render.snapshot('${utils.escape(destNoExt)}', ${tcCap})`, { rawError: true });
                // 🛡️ `waitPng` = existeix + mida > 0 + mida ESTABLE entre dues lectures
                // (`IO.fileInfo`; el chunk IEND només s'usa al mètode antic amb cep.fs.readFile).
                let pngRes = await waitPng(destNoExt, 30);
                let pngOk = pngRes.ok;   // (BUG #172) `waitPng` ja n'ha verificat la integritat
                let via = 'QE';
                if (!pngOk) {
                    // (2026-10-21) El fallback anterior era `Render.frame` →
                    // `seq.exportFrame`, que ja NO existeix a Premiere
                    // («seq.exportFrame is not a function») i convertia un PNG escrit
                    // en un error. Ara: reintent del MATEIX mecanisme que funciona (QE).
                    log("[Portada] QE (Render.snapshot) no ha escrit el PNG dins del temps esperat · es reintenta el QE una vegada (l'API seq.exportFrame ja no existeix)", "WARN");
                    snapRes = await callJSX(`Render.snapshot('${utils.escape(destNoExt)}', ${tcCap})`, { rawError: true });
                    pngRes = await waitPng(destNoExt, 20);
                    pngOk = pngRes.ok;
                    via = 'QE-retry';
                }
                log(`📸 [Portada] ${via} → ${snapRes}`);

                // Verificació: el fitxer hi és i no és buit (`cep.fs.stat` no retorna .size
                // en aquest equip → la mida es comprova LLEGINT).
                if (!pngOk) throw new Error(`El PNG no s'ha escrit a ${destPath} (via ${via} → ${snapRes})`);
                // (2026-10-16 · BUG #172) La mida ve de `waitPng`, que a més ha comprovat que el
                // fitxer està COMPLET (mida estable entre dues lectures + chunk final IEND):
                // no cal tornar a llegir el PNG sencer (en un NAS no és gratis).
                const pngBytes = pngRes.size;
                if (pngBytes <= 0) throw new Error("El PNG existeix però no es pot llegir (" + destPath + ")");
                utils.status(`Portada OK: ${nameBase}.png (${Math.round(pngBytes / 1024)} KB)`, "exito");
                log(`✅ [Portada] PNG generat via ${via}: ${destPath} (${Math.round(pngBytes / 1024)} KB)`);

                log(`[Portada] TIMES (BUG #172): preparació=${((tPre - t0) / 1000).toFixed(2)}s · captura+publicació=${((Date.now() - tCap) / 1000).toFixed(2)}s · TOTAL=${((Date.now() - t0) / 1000).toFixed(2)}s`);
            } catch (e) {
                getUtils().handleError(e, "RenderPortada");
            } finally {
                // ── NETEJA: només el que hem inserit (vídeo per TEMPS, immune a reindexar;
                // àudio per DIFERÈNCIA + regla d'orfes, vegeu més avall) ──
                try {
                    if (tempTC > 0 && insertedCopy) {   // (BUG #172) res a netejar si la còpia no s'ha inserit
                        // 🛡️ (2026-10-14) S'esborra amb el START REAL de la còpia: els clips
                        // temporals comencen a `tStart` (pre-roll), NO a tempTC → buscar-los
                        // per tempTC fallaria (removeAt tolera només 0.05 s).
                        const cleanTC = (copyStart !== null && isFinite(copyStart)) ? copyStart : tempTC;
                        const cleanPort = (portStart !== null && isFinite(portStart)) ? portStart : cleanTC;
                        const rC = await callJSX(`Clips.removeAt(${T_V1}, ${cleanTC}, 'video')`);
                        const rP = (tPort > 0) ? await callJSX(`Clips.removeAt(${tPort}, ${cleanPort}, 'video')`) : '—';
                        log(`🧹 [Portada] Neteja de la zona neta (V${T_V1} @ ${cleanTC}s / V${tPort} @ ${cleanPort}s): còpia → ${rC} | portada → ${rP}`);
                        if (String(rC).indexOf('OK') !== 0 || (tPort > 0 && String(rP).indexOf('OK') !== 0)) {
                            log(`⚠️ [Portada] Neteja INCOMPLETA a la zona neta (${cleanTC}s): comprova la seqüència!`, "WARN");
                        }
                        // ÀUDIO ORFE (2026-10-15 · BUG #162): l'insert amb ripple de la còpia
                        // deixa un clip d'àudio ORFE (sense Link) amb el MEDIA SENCER del clip
                        // font, en un TC que decideix Premiere — NO a cleanTC ni a tempTC (vist:
                        // 151.00s per un insert a 153.00s, 2 s ABANS) → el `removeAt` per temps
                        // fallava i l'orfà quedava a A1. Regles (totes idempotents):
                        //   1) DIFERÈNCIA: tot clip d'àudio (pista+nom+start) que NO hi era a la
                        //      foto prèvia a la inserció.
                        //   2) ORFE: clip d'àudio amb el MATEIX nom que el clip font situat MÉS
                        //      ENLLÀ del final del projecte (zona neta) — mata també els orfes que
                        //      hagin quedat de sessions anteriors.
                        // ⚠️ L'àudio del PROGRAMA no es toca mai: els seus clips (mateix nom)
                        // viuen tots DINS del projecte (< maxEnd).
                        try {
                            const rA = [];
                            if (!audioBefore) {
                                // Xarxa sense foto: es proven els DOS temps de sempre.
                                const nAud = parseInt(await callJSX("Tracks.count('audio')") || "0");
                                for (let a = 1; a <= nAud; a++) {
                                    let ra = await callJSX(`Clips.removeAt(${a}, ${cleanTC}, 'audio')`);
                                    if (String(ra).indexOf('OK') !== 0 && Math.abs(cleanTC - tempTC) > 0.01) {
                                        ra += ' / ' + await callJSX(`Clips.removeAt(${a}, ${tempTC}, 'audio')`);
                                    }
                                    if (String(ra).indexOf('OK') === 0) rA.push(`A${a}@${cleanTC}(temps)→${ra}`);
                                }
                            }
                            const after = JSON.parse(await callJSX(`Clips.debugTracks('audio')`));
                            const refName = String(srcName || "").toUpperCase();
                            const deadFrom = maxEnd - FRAME_TOL;
                            for (const t of ((after && after.tracks) || [])) {
                                const a = (parseInt(t.index, 10) || 0) + 1;
                                for (const c of (t.clips || [])) {
                                    const st = Number(c.start) || 0;
                                    const key = a + '|' + String(c.name || '') + '|' + st.toFixed(2);
                                    const nou = audioBefore ? !audioBefore.has(key) : false;
                                    const orfe = (maxEnd > 0) && !!refName &&
                                        (String(c.name || '').toUpperCase() === refName) && (st >= deadFrom);
                                    if (!nou && !orfe) continue;
                                    const rr = await callJSX(`Clips.removeAt(${a}, ${st.toFixed(4)}, 'audio')`);
                                    rA.push(`A${a}@${st.toFixed(2)}(${nou ? 'nou' : 'orfe'})→${rr}`);
                                }
                            }
                            log(`🧹 [Portada] Neteja d'àudio orfe: ${rA.length ? rA.join(' | ') : 'cap'}` +
                                (audioBefore ? '' : " · ⚠️ sense foto prèvia (només regla d'orfes)"));
                            if (rA.some(function (x) { return x.indexOf('OK') < 0; })) {
                                log("⚠️ [Portada] Alguna neteja d'àudio NO ha quallat: comprova la seqüència!", "WARN");
                            }
                        } catch (eAud) {
                            log("⚠️ [Portada] Neteja d'àudio: " + eAud.message, "WARN");
                        }
                    }
                    if (outRestore !== null && outRestore > 0) {
                        // (2026-10-16 · BUG #172) El mètode del PONT per al corxet OUT és
                        // `Timeline.out(v)` (jsx/main.jsx: `"out"` → `FASTPASS.Timeline.outPoint`);
                        // `Timeline.outPoint` NO existeix al pont i la restauració fallava tan
                        // silenciosament com l'ampliació. Ara s'usa el mètode bo, es torna el RANG
                        // sencer amb `Timeline.range` i es re-sincronitza l'àrea de treball; el
                        // resultat es VERIFICA.
                        const rb = await callJSX(`Timeline.out(${outRestore})`);
                        let rbR = '—', rbZ = '—';
                        if (waSynced) {
                            rbR = await callJSX(`Timeline.range(${in0}, ${outRestore})`);
                            rbZ = await callJSX('Timeline.zoomToSelection()');
                        }
                        const rbV = parseFloat((await callJSX('Timeline.getOut()')) || "0");
                        if (Math.abs(rbV - outRestore) > 0.05) {
                            log(`[Portada] L'Out point NO ha tornat al valor original (${outRestore}s demanat vs ${isFinite(rbV) ? rbV.toFixed(2) : rbV}s real): revisa el corxet OUT de la seqüència`, "WARN");
                        }
                        log(`📐 [Portada] Out point restaurat a ${outRestore}s → ${rb} | rang ${in0.toFixed(2)}→${outRestore.toFixed(2)}s → ${rbR} | àrea de treball → ${rbZ}`);
                    } else if (outRestore === 0) {
                        // (2026-10-16 · BUG #172) La seqüència NO tenia Out point (0): NO es crida
                        // `Timeline.out(0)`, que fixaria el corxet a l'inici i deixaria el rang
                        // d'exportació BUIT. Es torna el rang fins al FINAL DEL PROJECTE (`maxEnd`,
                        // la zona neta ja s'ha netejat) i es re-sincronitza l'àrea de treball.
                        let rb = '—';
                        if (waSynced && maxEnd > 0) {
                            rb = await callJSX(`Timeline.range(${in0}, ${maxEnd})`);
                            await callJSX('Timeline.zoomToSelection()');
                        }
                        log(`[Portada] La seqüència no tenia Out point (0): es deixa el rang a [${in0.toFixed(2)}s, ${maxEnd > 0 ? maxEnd.toFixed(2) : '?'}s] (final del projecte) → ${rb} — revisa el corxet OUT si has d'exportar per àrea de treball`, "WARN");
                    }
                    await callJSX(`Timeline.set(${cti})`);
                } catch (eC) {
                    log("⚠️ [Portada] Neteja: " + eC.message, "WARN");
                }
            }
        },

        /**
         * _resetSrtForClose: BUIDA l'editor de subtítols (BUG #198).
         * Al tancar el projecte, el panell ha de quedar NET: si hi ha un `.srt`
         * carregat, la taula, els marcadors, el visor de vídeo i el mateix
         * contenidor de l'editor han de desaparèixer (sense projecte obert no té
         * sentit poder seguir editant subtítols). És idempotent: es pot cridar
         * abans i després de tancar.
         * @param {string} when - etiqueta per al log ('abans' / 'després')
         * @returns {boolean} cert si l'editor s'ha pogut buidar
         */
        _resetSrtForClose: function (when) {
            try {
                if (window.SrtEditor && typeof window.SrtEditor.reset === 'function') {
                    window.SrtEditor.reset();
                    log('🧹 [CLOSE] Editor de subtítols buidat (' + when + ' del tancament)');
                    return true;
                }
                log("⚠️ [CLOSE] SrtEditor no disponible (" + when + ") · no es pot buidar l'editor", 'WARN');
            } catch (e) {
                log("⚠️ [CLOSE] Error buidant l'editor de subtítols (" + when + '): ' + e.message, 'WARN');
            }
            return false;
        },

        runClose: async function () {
            const R = FASTPASS_UI.Workflows.Render || this;
            getUtils().log("🔘 Botó CLOSE clicat", "INFO");
            getUtils().log("🔍 isJsxReady: " + getUtils().isJsxReady, "DEBUG");
            if (!getUtils().isJsxReady) {
                getUtils().log("⚠️ JSX no preparat. Espera...", "INFO");
                return;
            }
            getUtils().log("🔒 Tancant projecte...", "INFO");
            let res = null;
            try {
                res = await FASTPASS_UI.Logic.Project.close();
            } catch (e) {
                getUtils().handleError(e, "RenderClose");
            }
            // (2026-10-28 · BUG #198) L'editor de subtítols es buida SEMPRE que
            // l'operador demana «validar» (desa i tanca): si el tancament ha anat
            // bé, perquè no hi ha projecte; si ha fallat, perquè el panell no pot
            // quedar-se amb el `.srt` d'un projecte que ja no és viu. Es fa amb
            // `_resetSrtForClose` perquè és idempotent i deixa traça al log.
            R._resetSrtForClose('després');
            if (res && res.ok) {
                getUtils().status("Projecte tancat i lock eliminat · editor de subtítols buidat", "exito");
            } else if (res && res.error) {
                getUtils().status("Projecte tancat amb avisos: " + res.error, "warn");
            }
        }
    };

    window.FASTPASS_UI.Workflows.Render = FASTPASS_UI.Workflows.Render;
})();