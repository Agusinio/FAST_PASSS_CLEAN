/* ============================================================================
 * LOGIC: A1 · NETEJA DE MÚSICA ARROSSEGADA (echo-off) - v1.8 (2026-11-04)
 * ----------------------------------------------------------------------------
 * QUÈ RESOL: el cleanFeed de TN porta la MÚSICA de la careta/molinet/sintonia
 * enganxada DAMUNT de la veu del presentador al PRIMER clip d'A1. Cal traure
 * eixa música sense tocar la veu ni la resta del clip.
 *
 * COM (3 passos):
 *   1. DETECTAR  quin tros del clip és música de careta. No es fa a cegues ni
 *      pel nom: s'extrauen els primers 30 s del clip a WAV i es correlaciona
 *      amb les 8 plantilles d'`Audios\` (`bin\corr_audio.ps1`, motor
 *      `bin\corr_core.cs`). Guards: r global < `minR` (0,70) o menys del
 *      `minRatio` (25 %) de finestres bones → NO es toca res.
 *   2. RESTAR    la plantilla que ha guanyat la correlació (careta O MOLINET,
 *      cadascun amb el seu àudio d'`Audios\`) restant-la A LA MOSTRA, canal a
 *      canal, amb `bin\null_audio.ps1 -Net -NetAdapt`: el guany s'ajusta per
 *      tram (0,25 s) i per canal per mínims quadrats (`g = <a,b>/<b,b>`,
 *      limitat a `netMaxG`). Així lleva tota la música que hi haja —també la
 *      CUA del fade-out, que amb guany fix es quedava a mitges— i deixa
 *      `g = 0` on la plantilla no hi és. Mesurat al material real (04/11):
 *      19-28 dB de reducció a la cua i, del segon 2,5 ençà, el clip ix
 *      IDÈNTIC al mix (la veu no es toca).
 *   3. MUNTAR    NOMÉS la finestra neta (música + 0,75 s de marge) damunt del
 *      tram equivalent amb `Clips.insert` (overwriteClip: sense ripple, ni V1
 *      ni A2). El clip original queda partit en dos i el so de fora de la
 *      finestra no passa mai per ffmpeg. Un clip de 40 min treballa 15 s.
 *
 * ON S'EXECUTA: NOMÉS en clicar la DIANA 🎯 COL·LOCAR (`runPlaceAllChyrons`,
 * `js/main.js`), via `Workflows.MainButton._cleanA1Echo`. MAI al flux d'INICI
 * (crear, actualitzar, obrir o canviar de focus) ni a OUT & GO: allà el
 * muntatge encara no està tancat o s'ha de poder revisar, i l'ordre de l'usuari
 * (04/11 nit) és que no es toque res fins que clique la DIANA.
 * Clicar dos voltes és segur: si el primer clip d'A1 ja és el WAV net
 * (`isNetName`), el pas no torna a mesurar res.
 * També es pot llançar a mà des de la consola del panell:
 *   FASTPASS_UI.Logic.A1Clean.run({mode:'dry'})   → només mesura i informa
 *
 * MODES (`Config` → `A1_CLEAN.mode`, o `run({mode})`):
 *   'off' → no fa res (ni tan sols mesura)
 *   'dry' → mesura, ho diu al log i s'atura (zero risc; per a proves)
 *   'on'  → a més, genera el WAV net i el munta a A1 (PER DEFECTE)
 *
 * PROVA DE SINCRONIA (`proof:true` a posta; PER DEFECTE `false` des del 04/11,
 * que és quan es va validar l'A/B de la neteja): mentres no estiga verificat
 * que el `refSkip` que ix de la correlació és bo, el pas NO neteja: DEIXA la
 * prova al FINAL DEL CONTINGUT del timeline (no a l'out point, que és un
 * marcador i pot estar a qualsevol lloc → `contentEnd()`), amb una còpia del
 * media des del seu INICI fins a l'out del primer clip d'A1 i, damunt (A2), la
 * plantilla alineada contra la posició REAL del clip (Premiere arrodonix al
 * frame; `proofNudgeFrames` permet moure-la a mà, però MESURAT a la mostra amb
 * `bin\null_audio.ps1` (BUG #235) el `refSkip` de la correlació ja cau exacte:
 * careta a 14,4909 s del media = 0 frames d'ajust). Si sonen alhora, la
 * sincronia és bona. `proof:false` → neteja de debò amb `null_audio.ps1`.
 *
 * PER QUÈ NO ES DECIDIX PEL NOM NI PER L'ESCALETA: mesurat (03/11) que el tram
 * d'A1 que ve de la timeline (`TNV_V1_CLIP.mp4`, inPoint 23,40 s) NO té res a
 * vore amb cap plantilla (r=0,0096) mentres que el mateix media SÍ que porta la
 * careta a 11,128 s (r=0,8189 amb 5 de 6 finestres a ~0,98). O siga: el nom
 * «careta» i la posició a l'escaleta no diuen si hi ha música dins del clip.
 * La correlació sí.
 *
 * TOT EL DOM de Premiere viu a `jsx/` (intacte): ací només es criden àtoms
 * existents (`Clips.count`, `Clips.get`, `Clips.insert`, `Clips.endAt`,
 * `Clips.trimBounds`, `Clips.at`, `Timeline.duration`, `FASTPASS.Project.items`,
 * `FASTPASS.IO.importFiles`) i `FFmpeg._sh/_waitDone`.
 * ==========================================================================*/
(function () {
    'use strict';

    window.FASTPASS_UI = window.FASTPASS_UI || {};
    var Logic = window.FASTPASS_UI.Logic = window.FASTPASS_UI.Logic || {};

    var VER = 'v1.9';
    var _running = false;   // guard de reentrada: no repetir dins la mateixa passada

    var DEFAULTS = {
        mode: 'on',             // 'off' | 'dry' | 'on'  (ON: la DIANA neteja de debò)
        track: 1,               // pista d'àudio del bloc (A1)
        maxSec: 30,             // tros del clip a analitzar (la música pot començar tard)
        // PRE-FINESTRA (mesurat en viu el 04/11): al primer clip d'A1 només hi ha
        // la COLA del so — el transitori es va quedar fora del tall. Mirant 30 s
        // cap avant la careta no apareixia (r=0,109); mirant 20 s ENRERE des del
        // `inPoint` ix r=0,873 (música a 14,49 s del media, clip a 25,44 s).
        preSec: 20,
        minR: 0.70,             // guard: per davall, no es toca res
        minRatio: 0.25,         // guard: fracció mínima de finestres bones
        maxLagSec: 0,           // 0 = automàtic (preSec + maxSec)
        windowMargin: 1.5,      // s de marge a cada costat de la finestra que es re-munta
                                // (la cua/eco de la careta se sent més enllà de la música:
                                //  amb 0,75 s quedaven 2-3 s sense netejar)
        templateDir: 'Audios',  // plantilles (relatiu a l'arrel de l'extensió)
        // TEMPORALS (el `.ps1`, el `.done`, el `.verdict` i `_last_run.txt`).
        outDir: 'C:\\temp\\a1_clean',
        // CARPETA DEL MATERIAL QUE ES MONTA (2026-11-05 · orde d'usuari): el
        // `_net.wav` que s'importa al projecte NO pot viure a `%TEMP%` — si el
        // projecte s'obri en un altre equip, el clip ix offline. Va a la carpeta
        // del `.prproj` obert (`Context.folder()`), dins d'este subdirectori;
        // només si no se sap quina és, cau a `outDir`.
        mediaSubdir: 'A1_CLEAN',
        // Reducció MÍNIMA del millor tram per a muntar el net (dB). Si el motor no
        // ha llevat res de cap tram, muntar eixe WAV només amaga el problema.
        minTramDb: 3,
        maxItems: 1,            // només el PRIMER clip d'A1: la careta (o la seua
                                // cua) sempre cau ahí; mirar-ne més només afig temps
        // ─── RESTA A LA MOSTRA (BUG #235 · validada amb l'A/B del 04/11) ─────
        // La fa `bin\null_audio.ps1 -Net -NetAdapt` (motor `bin\null_core.cs`).
        // `netAdapt` ajusta el guany de cada tram (0,25 s) i de cada CANAL per
        // mínims quadrats: on la plantilla no hi és deixa `g = 0` (no inventa
        // careta invertida) i on està fluixa —la CUA del fade-out, que amb
        // guany fix es quedava a mitges— la lleva igual. `netMinRefDb` apaga la
        // resta on la plantilla és inaudible.
        netAdapt: true,
        netMaxG: 1.2,
        netMinRefDb: -60,
        netTramSec: 0.25,
        // Segons de finestra que es MESUREN per a afinar el lag a la mostra
        // (0 = automàtic: tot el solapament de música, mínim 2 s). És el tram
        // que es compara amb la plantilla; si el guard `minR` passa, ací no
        // falla mai per llargada perquè el .ps1 retalla al que hi ha.
        measureSec: 0,
        // Guarda d'energia: si el WAV net guanya més de `maxGainDb` dB respecte
        // del tram original, el filtre ha sumat artefactes → no es munta res.
        maxGainDb: 3,
        // ─── PROVA DE SINCRONIA (calibratge, 04/11) ─────────────────────────
        // Amb `proof:true` el pas NO neteja res: munta al FINAL del timeline una
        // còpia del primer clip d'A1 amb TOT el so anterior que hi ha al media
        // (inPoint 0 → out del clip) i, a `proofTrack` (A2), la plantilla
        // col·locada de manera que el seu segon `refSkipSec` caiga exactament on
        // comença el clip. Servix per a comprovar a orella que el `lag` de
        // `corr_audio.ps1` és bo abans de confiar-li la resta.
        // `proof:false` (PER DEFECTE) → neteja de debò amb `null_audio.ps1`.
        proof: false,
        proofTrack: 2,
        proofGap: 1,            // s de marge després del final del contingut
        // Ajust FI de la plantilla respecte de la còpia, EN FRAMES: negatiu
        // AVANÇA la plantilla (la trau del retràs), positiu la retrassa.
        // La prova al timeline no pot resoldre més que 1 frame, però la RESTA
        // necessita precisió de MOSTRA: `bin\null_audio.ps1` busca el lag amb
        // pas de 1 mostra (BUG #235) i a TNV V1 (04/11) va trobar-lo a **4800
        // mostres = 100,000 ms exactes** (`refPosSec` 14,4909 s del media), o
        // siga que el `refSkip` de la correlació JA cau a la mostra i no cal
        // cap nudge. Un −1 frame el deixaria 40 ms curt (5 ms de desajust ja
        // fan pujar el residu de la resta més de 20 dB).
        proofNudgeFrames: 0,
        proofFrameSec: 0.04     // 25 fps (convenció FRAME_TOL del repo)
    };

    function utils() {
        return (window.FASTPASS_UI && window.FASTPASS_UI.Utils) ? window.FASTPASS_UI.Utils : null;
    }
    function log(msg, lvl) {
        try { utils().log('[A1] ' + msg, lvl || 'DEBUG'); }
        catch (e) { try { console.log('[A1] ' + msg); } catch (e2) { } }
    }
    function ffmpegLogic() {
        var L = window.FASTPASS_UI && window.FASTPASS_UI.Logic;
        return (L && L.FFmpeg) ? L.FFmpeg : null;
    }
    function num(v, def) {
        var n = Number(v);
        return isFinite(n) ? n : def;
    }
    /**
     * esFalse: `false` de veritat —o el mateix escrit com a text (`'false'`,
     * `'0'`, `'off'`)—. La configuració del panell pot arribar com a cadena i
     * un `'false'` és cert per a `if()`: ací es decidix una sola volta.
     */
    function esFalse(v) {
        if (v === false || v === 0) return true;
        if (v === null || v === undefined) return false;
        var s = String(v).toLowerCase();
        return (s === 'false' || s === '0' || s === 'off');
    }
    function baseName(p) {
        var s = String(p == null ? '' : p);
        var i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
        return (i >= 0) ? s.substring(i + 1) : s;
    }
    function noExt(p) {
        var b = baseName(p);
        var d = b.lastIndexOf('.');
        return (d > 0) ? b.substring(0, d) : b;
    }
    /** 0.98765 → '0,9877' (el log del panell va amb coma decimal). */
    function fmt(n, dec) {
        var v = Number(n);
        if (!isFinite(v)) return '?';
        return v.toFixed(dec == null ? 4 : dec).replace('.', ',');
    }

    /**
     * cfg: DEFAULTS + el que hi haja a `Config.get().A1_CLEAN` (si el panell té
     * configuració) + el que es passe a `run()`.
     */
    function cfg(o) {
        var out = {};
        var k;
        for (k in DEFAULTS) { if (DEFAULTS.hasOwnProperty(k)) out[k] = DEFAULTS[k]; }
        // Ajust fi de la PROVA DE SINCRONIA desat des de fora del codi
        // (`setProofNudge`, en FRAMES), abans de Config i del que es passe a
        // `run()`: així una crida explícita sempre mana sobre el valor guardat.
        try {
            if (typeof localStorage !== 'undefined' && localStorage) {
                var ndLS = localStorage.getItem('fp_a1_proof_nudge_frames');
                if (ndLS !== null && ndLS !== '') out.proofNudgeFrames = num(ndLS, out.proofNudgeFrames);
            }
        } catch (eLS) { }
        var C = window.FASTPASS_UI && window.FASTPASS_UI.Core && window.FASTPASS_UI.Core.Config;
        if (C && typeof C.get === 'function') {
            var all = null;
            try { all = C.get(); } catch (eC) { all = null; }
            var mine = all && all.A1_CLEAN;
            if (mine && typeof mine === 'object') {
                for (k in mine) { if (mine.hasOwnProperty(k)) out[k] = mine[k]; }
            }
        }
        if (o && typeof o === 'object') {
            for (k in o) { if (o.hasOwnProperty(k)) out[k] = o[k]; }
        }
        // Normalitzacions (una config mal escrita no ha de trencar el pas)
        out.mode = String(out.mode || 'on').toLowerCase();
        out.track = Math.max(1, Math.round(num(out.track, 1)));
        out.maxSec = Math.max(3, num(out.maxSec, 30));
        out.preSec = Math.min(60, Math.max(0, num(out.preSec, 20)));
        out.minR = Math.min(0.99, Math.max(0.1, num(out.minR, 0.70)));
        out.minRatio = Math.min(1, Math.max(0.01, num(out.minRatio, 0.25)));
        out.windowMargin = Math.min(5, Math.max(0.05, num(out.windowMargin, 1.5)));
        var lag = num(out.maxLagSec, 0);
        out.maxLagSec = (lag > 0)
            ? Math.min(out.preSec + out.maxSec + 5, lag)
            : (out.preSec + out.maxSec);
        out.maxItems = Math.max(1, Math.round(num(out.maxItems, 1)));
        // Nudge en FRAMES → segons (el codi de col·locació treballa en segons).
        out.proofFrameSec = Math.max(0.001, Math.min(0.1, num(out.proofFrameSec, 0.04)));
        out.proofNudgeFrames = Math.max(-50, Math.min(50, Math.round(num(out.proofNudgeFrames, 0))));
        out.proofNudge = Math.max(-2, Math.min(2, out.proofNudgeFrames * out.proofFrameSec));
        // ─── Resta a la mostra (`bin\null_audio.ps1 -Net`) ──────────────────
        // Una config desada com a text (`'false'`, `'0'`, `'off'`) no ha de
        // poder deixar el motor en un estat impossible: tot es normalitza ací
        // i les crides a `run({...})` sempre manen sobre el que hi haja.
        out.netAdapt = !esFalse(out.netAdapt);
        out.proof = !esFalse(out.proof);
        out.netMaxG = Math.min(2, Math.max(0.2, num(out.netMaxG, 1.2)));
        out.netMinRefDb = Math.min(0, Math.max(-120, num(out.netMinRefDb, -60)));
        out.netTramSec = Math.min(2, Math.max(0.05, num(out.netTramSec, 0.25)));
        out.measureSec = Math.min(60, Math.max(0, num(out.measureSec, 0)));
        out.maxGainDb = Math.min(30, Math.max(0, num(out.maxGainDb, 3)));
        return out;
    }

    /**
     * setProofNudge: ajust fi de la PROVA DE SINCRONIA, **en frames**.
     * Es desa al navegador i es pot fer des de la consola del panell, sense
     * tocar codi ni reiniciar:
     *   Logic.A1Clean.setProofNudge(-1)   ← la plantilla va 1 frame tarde
     *   Logic.A1Clean.setProofNudge(1)    ← va 1 frame avant
     *   Logic.A1Clean.setProofNudge(0)    ← sense ajust (VALOR DE FÀBRICA:
     *                                       mesurat a la mostra, el `refSkip`
     *                                       de la correlació ja és exacte)
     * @param {number} frames - frames a moure (s'acota a ±50)
     * @returns {number} el valor que queda
     */
    function setProofNudge(frames) {
        var v = Math.max(-50, Math.min(50, Math.round(num(frames, 0))));
        try {
            if (typeof localStorage !== 'undefined' && localStorage) {
                localStorage.setItem('fp_a1_proof_nudge_frames', String(v));
            }
        } catch (e) { }
        log('prova de sincronia: nudge = ' + v + ' frame(s) (' +
            fmt(v * num(cfg({}).proofFrameSec, 0.04), 3) + ' s)', 'INFO');
        return v;
    }


    // ════════════════════════════════════════════════════════════════════════
    // PURES (provades headless, sense CEP ni Premiere)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * decision: a partir del JSON de `corr_audio.ps1` decidix si hi ha música de
     * careta dins del tros, i en quina posició.
     *
     * @param {Object} corr - { hit, best:{ ref, r, lagSec, mixPosSec, overlapSec, windows[] }, all[] }
     * @param {Object} o    - { minR, minRatio, maxSec, inPoint, durSec }
     *        `durSec` (opcional): durada del clip. Si es passa, NOMÉS compta la
     *        música que cau DINS del clip (#249): la pre-finestra pot veure una
     *        pista que acaba just abans del `inPoint` — llavors no hi ha res a
     *        restar i no pot haver-hi `hit`.
     * @returns {{hit:boolean, ref:string, r:number, lagSec:number, atSec:number,
     *            ratio:number, cleanSec:number, why:string}}
     *   atSec    = posició dins del clip on comença la música (el que necessita la finestra)
     *   ratio    = fracció de finestres de 2 s per damunt del guard
     *   cleanSec = quants segons de música es poden restar (solapament mesurat DINS del clip)
     */
    function decision(corr, o) {
        var opt = o || {};
        var minR = num(opt.minR, 0.70);
        var minRatio = num(opt.minRatio, 0.25);
        var maxSec = num(opt.maxSec, 30);
        var buit = {
            hit: false, ref: '', r: -2, lagSec: 0, atSec: 0, refSkipSec: 0,
            ratio: 0, cleanSec: 0, why: 'sense dades'
        };
        if (!corr || !corr.best) return buit;
        var b = corr.best;
        var r = num(b.r, -2);
        var lag = num(b.lagSec, 0);
        var wins = (b.windows && b.windows.length) ? b.windows : [];
        var bones = 0, i;
        for (i = 0; i < wins.length; i++) { if (num(wins[i], -2) >= minR) bones++; }
        var ratio = wins.length ? (bones / wins.length) : ((r >= minR) ? 1 : 0);

        // ─── On cau la música, respecte de l'INICI DEL CLIP ─────────────────
        // El tros analitzat pot començar ABANS del `inPoint` (pre-finestra): en
        // A1 només hi ha la COLA del so, perquè el transitori es va quedar fora
        // del tall. Amb `mixPosSec` (posició dins del MEDIA) es calcula on
        // comença la música respecte del clip: pot ser NEGATIU (= ja sonava).
        var havePos = isFinite(num(b.mixPosSec, NaN));
        var atClip = havePos ? (num(b.mixPosSec, 0) - num(opt.inPoint, 0)) : lag;
        var atSec = Math.max(0, atClip);            // dins del clip mai negatiu
        var refSkip = Math.max(0, -atClip);         // quanta plantilla cal saltar

        // Quanta MÚSICA es pot restar: el solapament mesurat entre el tros i la
        // plantilla, descomptant la part que va quedar fora del clip.
        var used = num(b.overlapSec, 0);
        if (!(used > 0)) used = wins.length * 2;
        used = Math.min(used, maxSec);
        var over = num(b.overlapSec, 0);
        var avail = Math.max(0, used - refSkip);

        // ─── (#249 · 06/11) NOMÉS compta la música DINS del clip ────────────
        // Cas real TNV_V4: `tornada_publi` sona 17,08–21,80 s del media i el
        // clip d'A1 comença en 21,92 s. La pre-finestra la veia (r=0,72, 2
        // finestres a 0,99) i el motor deia "6,92 s de música", però dins del
        // clip no n'hi havia cap: la resta no baixava res i el guard ho
        // rebutjava. Les finestres es repartixen al llarg del solapament, així
        // que cada una té el seu tros dins del clip i es pot comptar.
        var durClip = num(opt.durSec, 0);
        var dinsWin = -1;               // -1 = no comprovat (sense durSec)
        if (durClip > 0 && havePos) {
            var clipIni = num(opt.inPoint, 0);
            var clipFi = clipIni + durClip;
            var mixPos = num(b.mixPosSec, 0);
            var overFi = Math.max(0, (mixPos + over) - clipFi);
            avail = Math.max(0, Math.min(used, over - refSkip - overFi));
            var wSec = wins.length ? (over / wins.length) : 0;
            if (wSec > 0) {
                var dins = 0, bonesDins = 0;
                for (i = 0; i < wins.length; i++) {
                    var wa = mixPos + i * wSec;
                    var ovl = Math.min(wa + wSec, clipFi) - Math.max(wa, clipIni);
                    if (ovl >= wSec * 0.5) {          // la majoria de la finestra, dins
                        dins++;
                        if (num(wins[i], -2) >= minR) bonesDins++;
                    }
                }
                dinsWin = dins;
                ratio = dins ? (bonesDins / dins) : 0;
            } else {
                dinsWin = 0;
                ratio = 0;
            }
        }

        var hit = (r >= minR) && (ratio >= minRatio) && (avail >= 1);
        var why = (r < minR)
            ? 'r=' + fmt(r) + ' per davall del guard ' + fmt(minR, 2)
            : ((ratio < minRatio)
                ? 'només ' + fmt(ratio * 100, 0) + '% de finestres bones dins del clip (mínim ' +
                  fmt(minRatio * 100, 0) + '%)'
                : 'r=' + fmt(r) + ' · ' + fmt(ratio * 100, 0) + '% finestres · ' + fmt(avail, 2) + ' s de música' +
                  (refSkip > 0.05 ? ' (el so començava ' + fmt(refSkip, 2) + ' s abans del clip)' : ''));
        if (dinsWin === 0) {
            why = 'la música de «' + String(b.ref || '') + '» ACABA abans del tall' +
                (refSkip > 0.05 ? ' (' + fmt(refSkip, 2) + ' s abans del clip)' : '') +
                ': cap finestra bona dins del clip → res a restar';
        }
        return {
            hit: hit, ref: String(b.ref || ''), r: r, lagSec: lag,
            atSec: atSec, refSkipSec: refSkip,
            ratio: ratio, dinsWin: dinsWin,
            cleanSec: Math.max(0, Math.round(avail * 100) / 100), why: why
        };
    }

    /**
     * windowOf: la FINESTRA del clip que es re-munta (pura).
     *
     * No es toca tot el clip: només el tram de música amb `margin` segons de
     * marge a cada costat. Així el clip original d'A1 queda partit en tres
     * (abans · finestra neta · després) i el so de fora de la finestra no
     * passa mai per ffmpeg. Un clip de 40 min només treballa 15 s.
     *
     * @param {number} durSec - durada del clip a A1
     * @param {number} atSec  - on comença la música dins del clip
     * @param {number} lenSec - quants segons de música cal restar
     * @param {number} margin - marge a cada costat (s)
     * @returns {{start:number, dur:number, at:number, len:number}}
     *   start/dur = tram del clip a re-muntar · at/len = música DINS la finestra
     */
    function windowOf(durSec, atSec, lenSec, margin) {
        var dur = num(durSec, 0);
        var at = Math.max(0, num(atSec, 0));
        var len = Math.max(0, num(lenSec, 0));
        var mg = Math.max(0, num(margin, 0.75));
        if (!(dur > 0)) return { start: 0, dur: 0, at: 0, len: 0 };
        var s = Math.max(0, at - mg);
        var e = Math.min(dur, at + len + mg);
        if (e - s < 0.3) {
            s = Math.max(0, Math.min(dur - 0.3, at - mg));
            e = Math.min(dur, s + 0.3);
        }
        var atIn = Math.max(0, Math.min(e, at) - s);
        var lenIn = Math.min(len, Math.max(0, e - at));
        if (!(lenIn > 0.05)) lenIn = Math.max(0, e - atIn);
        return {
            start: Math.round(s * 1000) / 1000,
            dur: Math.round((e - s) * 1000) / 1000,
            at: Math.round(atIn * 1000) / 1000,
            len: Math.round(lenIn * 1000) / 1000
        };
    }


    /**
     * musicAtWindow: on comença la música DINS de la finestra de neteja (pura).
     *
     * Pot ser NEGATIU: aleshores la música ja sonava quan comença la finestra
     * (cas de la cua: en A1 només entra el final del so) i la plantilla s'ha
     * d'agafar més endins. Positiu vol dir que la finestra porta `margin` de
     * marge abans de la música.
     *
     * @param {number} atSec      - on comença la música dins del clip
     * @param {number} refSkipSec - plantilla ja gastada a l'inici del clip
     * @param {number} winStart   - on comença la finestra dins del clip
     * @returns {number} segons (negatiu = ja sonava al començar la finestra)
     */
    function musicAtWindow(atSec, refSkipSec, winStart) {
        var atClip = Math.max(0, num(atSec, 0)) - Math.max(0, num(refSkipSec, 0));
        return atClip - Math.max(0, num(winStart, 0));
    }

    /**
     * refSkipAtWindow: quants segons de la plantilla ja han passat a l'INICI de
     * la finestra de neteja (pura).
     *
     * No és el `refSkip` del clip: la finestra comença `winStart` segons DINS
     * del clip, i la música pot arrancar més enllà (`atSec`). Si la finestra
     * comença ABANS que la música —el cas normal, perquè hi ha `margin` de
     * marge— el salt és 0 i la referència s'agafa des del seu segon 0.
     *
     * BUG #236 (04/11, en viu): amb `inPoint=10` la música cau a 4,49 s del
     * clip i la fórmula vella (`refSkip + win.start`) demanava 2,99 s de salt
     * que no tocaven; el motor restava desplaçat i no netejava res.
     *
     * @returns {number} segons de plantilla a saltar (mai negatiu)
     */
    function refSkipAtWindow(atSec, refSkipSec, winStart) {
        return Math.max(0, -musicAtWindow(atSec, refSkipSec, winStart));
    }


    /**
     * isNetName: el nom d'un clip és el WAV NET que munta esta neteja?
     * (`a1_<ms>_net.wav`, el que genera `cleanAndMount` a la carpeta del
     * projecte; el nom no el tria ningú més). Pura: es prova headless.
     *
     * PER QUÈ: el pas es dispara en clicar la DIANA 🎯 (i potser més voltes:
     * l'operador pot clicar-la dos voltes). Si el primer clip d'A1 ja és
     * eixe WAV, la música d'eixa finestra JA està restada: no s'ha de tornar a
     * mesurar (la correlació és el car del pas) ni tornar a restar.
     */
    function isNetName(name) {
        return /^a1_\d+_net\.wav$/i.test(String(name || '').trim());
    }


    /**
     * buildNullArgs: arguments de `bin\null_audio.ps1` per a restar la música
     * de la FINESTRA del clip A LA MOSTRA (BUG #235, motor `bin\null_core.cs`).
     *
     * El motor decodifica la finestra i la plantilla en ESTEREO i resta
     * `mix - g*ref` canal a canal (L amb L, R amb R). Amb `netAdapt` el guany
     * el busca ell per mínims quadrats a cada tram: no cal calibrar-lo ni
     * encertar un llindar de correlació, i on la plantilla no hi és deixa
     * `g = 0`. L'offset no es torna a estimar amb un filtre d'ffmpeg: es busca
     * A LA MOSTRA dins de ±`SpanMs` al voltant del `refSkip` de la correlació,
     * que és el que fa que 5 ms de desajust no arruïnen la resta.
     *
     * @param {Object} o - { mix, ref, out, json, done, winDurSec, musicSec,
     *                       refSkipSec, adapt, maxG, minRefDb, tramSec, minR }
     *   mix        = WAV de la finestra del clip (extret del media)
     *   ref        = plantilla d'`Audios\` (la careta O el molinet que ha
     *                guanyat la correlació)
     *   out        = WAV net a generar (mateixa llargada que `winDurSec`)
     *   winDurSec  = durada de la finestra (el que es munta al timeline)
     *   musicSec   = segons de música que es MESUREN per a afinar el lag
     *   refSkipSec = quants segons de la plantilla ja han passat a l'inici de
     *                la finestra (`refSkipAtWindow`, MAI `refSkip + win.start`:
     *                eixa suma comptava el marge de davant com a música)
     *   mixPosSec  = on cau el segon 0 de la plantilla DINS de la finestra
     *                (`musicAtWindow` si és positiu; 0 si ja sonava). Amb `-MixPos
     *                0` fix, la música que comença més enllà del marge es
     *                buscava on no és i la resta eixia plana (BUG #236)
     * @returns {Array<string>} arguments per al .ps1 (sense el binari)
     */
    function buildNullArgs(o) {
        var winDur = Math.max(0.2, num(o.winDurSec, 8));
        var music = Math.max(0.5, Math.min(winDur, num(o.musicSec, winDur)));
        var skip = Math.max(0, num(o.refSkipSec, 0));
        var pos = Math.max(0, num(o.mixPosSec, 0));
        // Només un dels dos pot ser > 0: si la música ja sonava en començar la
        // finestra es salta dins la plantilla (`-SkipRef`); si comença més
        // enllà, el que es mou és on cau el segon 0 (`-MixPos`).
        var a = [
            '-Mix', String(o.mix || ''),
            '-Ref', String(o.ref || ''),
            '-MixPos', pos.toFixed(6),
            '-SkipRef', skip.toFixed(6),
            '-WinSec', music.toFixed(3),
            '-Net', String(o.out || ''),
            '-NetStart', '0',
            '-NetDur', winDur.toFixed(6)
        ];
        if (o.adapt === false) {
            // Pla B (guany fix + gate): només si algú el demana a posta.
            a.push('-NetMinR', num(o.minR, 0.7).toFixed(3));
        } else {
            a.push('-NetAdapt');
            a.push('-NetMaxG', num(o.maxG, 1.2).toFixed(3));
            a.push('-NetMinRefDb', num(o.minRefDb, -60).toFixed(1));
        }
        a.push('-NetTramSec', num(o.tramSec, 0.25).toFixed(3));
        // El PERFIL de la mesura es fa amb el mateix tamany de tram que la resta.
        // Amb trams de 0,5 s, un tram que porta 0,36 s de cua i 0,14 s de veu no
        // compta com a cancel·lat (5 dB en compte de 26) i el panell no pot saber
        // si la resta ha fet res de bo (BUG #240).
        a.push('-TramSec', num(o.tramSec, 0.25).toFixed(3));
        if (o.json) a.push('-Json', String(o.json));
        if (o.done) a.push('-Done', String(o.done));
        a.push('-Quiet');
        return a;
    }

    /**
     * shouldMount: decidix si el WAV net es pot muntar a A1 (PURA: es prova
     * headless amb els JSON reals del motor).
     *
     * BUG #240 (05/11, en viu): la guarda mirava `tramsOk` (trams que arriben al
     * `MinNullDb` de reducció) i REFUSAVA neteges bones — amb la veu damunt, un
     * tram pot cancel·lar 26 dB de música i no arribar-hi mai (la mitjana del
     * tram la mana la veu). Mesura real del 05/11: `tramsOk=0/14`, `nullDb=0,28`
     * i la cua a −52 dBFS (inaudible): eixe net NO s'haguera muntat mai.
     *
     * El senyal de veritat és si ALGUNA cosa ha baixat: el millor tram
     * (`bestTramDb`) i la mitjana (`nullDb`). Si ni això, el motor no ha restat.
     *
     * @param {Object|null} nj - JSON del motor (`bin\null_audio.ps1 -Json`)
     * @param {Object} [o]     - `minTramDb` (per defecte 3 dB)
     * @returns {{mount:boolean, why:string}}
     */
    function shouldMount(nj, o) {
        var minTram = num((o ? o.minTramDb : NaN), num(DEFAULTS.minTramDb, 3));
        if (!nj || !num(nj.trams, 0)) return { mount: true, why: 'sense mesura del motor' };
        var best = num(nj.bestTramDb, 0);
        var mean = num(nj.nullDb, 0);
        if (best >= minTram || mean >= 1) {
            return { mount: true, why: 'millor tram −' + fmt(best, 1) + ' dB (' + fmt(mean, 1) + ' dB de mitjana)' };
        }
        return {
            mount: false,
            why: 'el millor tram només baixa ' + fmt(best, 1) + ' dB i la mitjana ' + fmt(mean, 1) + ' dB'
        };
    }

    // ════════════════════════════════════════════════════════════════════════
    // I/O (cep.fs) i Premiere (callJSX)
    // ════════════════════════════════════════════════════════════════════════

    function cepFs() { return (window.cep && window.cep.fs) ? window.cep.fs : null; }
    function writeText(path, txt) {
        var fs = cepFs();
        if (!fs || !fs.writeFile) return false;
        try { return fs.writeFile(path, txt).err === 0; } catch (e) { return false; }
    }
    function readText(path) {
        var fs = cepFs();
        if (!fs || !fs.readFile) return null;
        try {
            var res = fs.readFile(path);
            return (res && res.err === 0) ? res.data : null;
        } catch (e) { return null; }
    }
    function readJson(path) {
        var t = readText(path);
        if (!t) return null;
        try { return JSON.parse(t); } catch (e) { return null; }
    }
    function removeFile(path) {
        var fs = cepFs();
        if (!fs || !path) return;
        try { if (fs.deleteFile) fs.deleteFile(path); } catch (e) { }
    }
    function ensureDir(dir) {
        var fs = cepFs();
        if (!fs || !dir) return;
        try { if (fs.makedir) fs.makedir(dir); } catch (e) { }
    }
    function exists(path) {
        var fs = cepFs();
        if (!fs || !fs.stat) return true; // no ho podem saber: no bloqueigem
        try { return fs.stat(path).err === 0; } catch (e) { return true; }
    }

    /** Ruta de l'ffmpeg: el propi del repo i, si no, els candidats dels equips. */
    function ffmpegBin(extRoot) {
        var cands = [
            String(extRoot || '') + '\\bin\\ffmpeg\\bin\\ffmpeg.exe',
            'E:\\ffmpeg\\bin\\ffmpeg.exe',
            'C:\\Program Files\\Dalet\\DaletPlus.409526\\bin\\ffmpeg.exe'
        ];
        for (var i = 0; i < cands.length; i++) { if (exists(cands[i])) return cands[i]; }
        return cands[0];
    }

    /**
     * pickDir: tria la primera ruta ABSOLUTA vàlida d'una llista de candidates.
     *
     * Funció PURA (així es pot provar sense CEP ni Premiere): descarta el que el
     * pont JSX torna quan no hi ha projecte (`''`, `ERR:…`, `undefined`,
     * `EvalScript error`…) i exigix ruta absoluta (`C:\…` o UNC `\\servidor\…`).
     * @returns {string} ruta sense barra final, o `''` si no en queda cap
     */
    function pickDir(cands) {
        var list = (cands && cands.length) ? cands : [];
        for (var i = 0; i < list.length; i++) {
            var d = String(list[i] == null ? '' : list[i]).replace(/^"|"$/g, '').trim();
            if (!d) continue;
            if (/^(err|error|undefined|null|eval|exception|nan)/i.test(d)) continue;
            if (!(d.charAt(1) === ':' || d.indexOf('\\\\') === 0)) continue;
            return d.replace(/[\\\/]+$/, '');
        }
        return '';
    }

    /**
     * projectDir: carpeta on ha de viure el material que es MONTA al timeline.
     *
     * 2026-11-05 (ordre d'usuari): el `_net.wav` que s'importa al projecte no pot
     * quedar-se a `%TEMP%` — un projecte obert en un altre equip el buscaria i el
     * clip eixiria offline. Ordre de fonts, de la més fiable a la de reserva:
     * `o.mediaDir` explícit → `Context.folder()` (la carpeta del `.prproj`
     * obert) → `Utils.workFolder(State)` (`destinoBase + prog + data + bloc`) →
     * `o.outDir` (temp: millor que res, però es pot perdre).
     * @returns {Promise<string>} ruta sense barra final
     */
    async function projectDir(o) {
        var U = utils();
        var cands = [];
        if (o && o.mediaDir) cands.push(o.mediaDir);
        if (U && U.callJSX) {
            try { cands.push(await U.callJSX('Context.folder()', { timeoutMs: 15000 })); }
            catch (e1) { }
            try { if (U.workFolder) cands.push(U.workFolder(window.FASTPASS_UI.State)); }
            catch (e2) { }
        }
        var d = pickDir(cands);
        return d || String((o && o.outDir) || '');
    }


    /** clipsOf: clips d'una pista, ordenats per posició (array de {name,start,inPoint,duration,...}). */
    async function clipsOf(track) {
        var U = utils();
        var n = 0;
        try {
            n = parseInt(await U.callJSX('FASTPASS.Clips.count(' + track + ', "audio")', { timeoutMs: 20000 }), 10);
        } catch (e) { n = 0; }
        if (!isFinite(n) || n <= 0) return [];
        var out = [];
        for (var i = 0; i < n; i++) {
            var raw = '';
            try {
                raw = await U.callJSX('FASTPASS.Clips.get(' + track + ', ' + i + ', "audio")', { timeoutMs: 20000 });
            } catch (e2) { raw = ''; }
            if (!raw || raw === 'null' || raw === '[]') continue;
            try {
                var c = JSON.parse(raw);
                if (c && c.name) out.push(c);
            } catch (e3) { }
        }
        out.sort(function (a, b) { return num(a.start, 0) - num(b.start, 0); });
        return out;
    }

    /**
     * mediaPathOf: ruta al disc del media d'un clip, pel nom. Es pregunta al
     * projecte (`FASTPASS.Project.items`), que és l'única font fiable: el
     * `nodeId`/`mediaPath` del clip no existix a l'API de Premiere.
     */
    async function mediaPathOf(clipName) {
        var U = utils();
        var raw = '';
        try { raw = await U.callJSX('FASTPASS.Project.items("")', { timeoutMs: 30000 }); }
        catch (e) { return ''; }
        if (!raw || raw === 'null') return '';
        var items = null;
        try { items = JSON.parse(raw); } catch (e2) { return ''; }
        if (!items || !items.length) return '';
        var want = String(clipName || '').toLowerCase();
        var wantNoExt = noExt(want);
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (!it) continue;
            var p = String(it.path || it.mediaPath || '');
            if (!p) continue;                       // els bins no tenen ruta
            var nm = String(it.name || baseName(p)).toLowerCase();
            if (nm === want || noExt(nm) === wantNoExt) return p;
        }
        return '';
    }

    // ════════════════════════════════════════════════════════════════════════
    // CORRELACIÓ (bin\corr_audio.ps1)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * correlate: mesura si dins del tros [inPoint, inPoint+dur] del media hi ha
     * alguna de les plantilles de `templateDir`. El treball (decodificar +
     * Pearson) el fa `bin\corr_audio.ps1`; ací només es llança i es llig el JSON.
     *
     * @returns {Promise<Object|null>} el JSON de corr_audio, o null si ha fallat
     */
    async function correlate(media, inPoint, dur, o) {
        var U = utils();
        var FF = ffmpegLogic();
        if (!FF || !FF._sh || !FF._waitDone) { log('Sense Logic.FFmpeg: no puc mesurar', 'ERROR'); return null; }
        var extRoot = '';
        try { extRoot = String(await U.callJSX('System.getExtPath()') || ''); } catch (e0) { extRoot = ''; }
        if (!extRoot) { log('No sé la ruta de l\'extensió', 'ERROR'); return null; }
        var corrPs = extRoot + '\\bin\\corr_audio.ps1';
        if (!exists(corrPs)) { log('No trobe ' + corrPs, 'ERROR'); return null; }

        ensureDir(o.outDir);
        var ts = Date.now();
        var psFile = o.outDir + '\\a1corr_' + ts + '.ps1';
        var doneFile = o.outDir + '\\a1corr_' + ts + '.done';
        var jsonFile = o.outDir + '\\a1corr_' + ts + '.json';
        var tplDir = extRoot + '\\' + String(o.templateDir || 'Audios');
        removeFile(jsonFile);
        removeFile(doneFile);

        // Comentaris en ASCII a posta: el .ps1 es desa sense BOM i PowerShell 5.1
        // llegiria malament qualsevol accent.
        var ps = '';
        ps += 'try {\r\n';
        ps += '  & "' + corrPs + '" -Mix "' + media + '" -MixStart ' + num(inPoint, 0).toFixed(3) +
              ' -MixDur ' + num(dur, 30).toFixed(3) + ' -Accurate -MaxLagSec ' + num(o.maxLagSec, 30) +
              ' -RefDir "' + tplDir + '" -Json "' + jsonFile + '" -Quiet\r\n';
        ps += '  if (Test-Path -LiteralPath "' + jsonFile + '") { Write-Output "OK" > "' + doneFile + '" }\r\n';
        ps += '  else { Write-Output "FAIL:corr_audio no ha escrit el JSON" > "' + doneFile + '" }\r\n';
        ps += '} catch { Write-Output ("FAIL:" + $_.Exception.Message) > "' + doneFile + '" }\r\n';
        if (!writeText(psFile, ps)) { log('No puc escriure ' + psFile, 'ERROR'); return null; }

        var timeoutMs = 240000;   // -Accurate decodifica el media sencer
        var shRes = null;
        try {
            shRes = await FF._sh('powershell -NoProfile -ExecutionPolicy Bypass -File "' + psFile + '"', { timeoutMs: timeoutMs });
            await FF._waitDone(doneFile, shRes, 500, timeoutMs);
        } catch (e) {
            log('corr_audio ha fallat: ' + (e && e.message ? e.message : e), 'ERROR');
            removeFile(psFile);
            return null;
        }
        removeFile(psFile);
        removeFile(doneFile);
        var json = readJson(jsonFile);
        if (!json) { log('JSON de correlació il·legible: ' + jsonFile, 'ERROR'); return null; }
        return json;
    }


    // ════════════════════════════════════════════════════════════════════════
    // RESTA + MUNTATGE (només amb mode 'on')
    // ════════════════════════════════════════════════════════════════════════

    /**
     * cleanAndMount: extrau la FINESTRA del clip, li resta la música A LA
     * MOSTRA (`bin\null_audio.ps1 -Net -NetAdapt`) i la munta damunt del tram
     * equivalent d'A1.
     *
     * Còpia de seguretat: `outDir` conserva `_mix.wav` (la finestra ORIGINAL)
     * al costat de `_net.wav` i del `.json` del motor; els noms i l'interval
     * queden al log, així que es pot desfer a mà (tornar a muntar `_mix.wav` a
     * la mateixa posició) sense dependre de la memòria de Premiere.
     */
    async function cleanAndMount(clip, media, dur, d, o) {
        var U = utils();
        var FF = ffmpegLogic();
        var extRoot = '';
        try { extRoot = String(await U.callJSX('System.getExtPath()') || ''); } catch (e0) { extRoot = ''; }
        var ff = ffmpegBin(extRoot);
        if (!exists(ff)) { log('No trobe ffmpeg (' + ff + ')', 'ERROR'); return { ok: false, why: 'sense ffmpeg' }; }
        if (!d.refPath) { log('No sé quina plantilla he de restar', 'ERROR'); return { ok: false, why: 'sense plantilla' }; }
        // El motor de la resta viu fora del panell: si no hi és, no es toca res.
        var nullPs = extRoot + '\\bin\\null_audio.ps1';
        if (!exists(nullPs)) { log('No trobe ' + nullPs, 'ERROR'); return { ok: false, why: 'sense null_audio.ps1' }; }

        // ─── ON es desa el material (2026-11-05 · orde d'usuari) ────────────
        // El WAV net s'IMPORTA al projecte: si viu a `%TEMP%`, un projecte obert
        // en un altre equip el busca on no és i el clip ix offline. El mix, el net
        // i el JSON de la mesura van a la carpeta del PROJECTE (`projectDir`),
        // dins de `mediaSubdir`; els transitoris (.ps1/.done/.verdict) es queden
        // a `o.outDir`, que és temp i ningú no trobarà a faltar.
        ensureDir(o.outDir);
        var projRoot = await projectDir(o);
        var mediaPod = projRoot ? (projRoot + '\\' + String(o.mediaSubdir || 'A1_CLEAN')) : String(o.outDir);
        ensureDir(mediaPod);
        if (!exists(mediaPod)) {
            log('no puc crear «' + mediaPod + '»: el net va a ' + o.outDir + ' (temp)', 'WARN');
            mediaPod = String(o.outDir);
        } else if (projRoot) {
            log('material del clip net: «' + mediaPod + '»', 'DEBUG');
        }
        var ts = Date.now();
        var mixWav = mediaPod + '\\a1_' + ts + '_mix.wav';
        var netWav = mediaPod + '\\a1_' + ts + '_net.wav';
        var jsonFile = mediaPod + '\\a1_' + ts + '.json';
        var doneFile = o.outDir + '\\a1_' + ts + '.done';       // el que llig el panell
        var verdictFile = o.outDir + '\\a1_' + ts + '.verdict'; // el que escriu el .ps1
        var psFile = o.outDir + '\\a1_' + ts + '.ps1';
        var inPt = num(clip.inPoint, 0);
        var startSec = num(clip.start, 0);
        var clipDur = Math.max(0.5, num(clip.duration, dur));

        // ─── Finestra de treball (només el tram de música + marge) ──────────
        var win = windowOf(clipDur, d.atSec, d.cleanSec, o.windowMargin);
        if (!(win.dur > 0.2) || !(win.len > 0.05)) {
            log('la finestra de neteja ix buida (' + JSON.stringify(win) + ')', 'WARN');
            return { ok: false, why: 'finestra buida' };
        }
        // Quants segons de la plantilla han passat a l'INICI DE LA FINESTRA: si
        // el so ja sonava abans del tall (cas normal: en A1 només entra la cua)
        // la referència s'agafa més endins. `refSkipSec` ve alineat amb el
        // clip, i la finestra pot començar un poc més arrere o més avant.
        var refSkip = Math.max(0, num(d.refSkipSec, Math.max(0, -num(d.lagSec, 0))));
        // On cau la música dins de la finestra: negatiu = ja sonava (salt de
        // plantilla), positiu = la finestra porta marge i el segon 0 de la
        // plantilla cau més enllà (`-MixPos`). Mai els dos alhora.
        var musicAt = musicAtWindow(d.atSec, refSkip, win.start);
        var winMixPos = Math.max(0, musicAt);
        var winRefSkip = Math.max(0, -musicAt);
        // Segons de música que es MESUREN per a afinar el lag a la mostra: tot
        // el solapament (mai el marge, que no té plantilla) i, si algú fixa
        // `measureSec`, allò. Amb menys de 2 s la mesura no seria fiable.
        var musicSec = Math.min(win.dur, Math.max(2, num(win.at, 0) + num(win.len, 0)));
        if (num(o.measureSec, 0) > 0) musicSec = Math.min(musicSec, num(o.measureSec, 0));

        var args = buildNullArgs({
            mix: mixWav, ref: d.refPath, out: netWav,
            json: jsonFile, done: verdictFile,
            winDurSec: win.dur, musicSec: musicSec,
            mixPosSec: winMixPos, refSkipSec: winRefSkip,
            adapt: o.netAdapt, maxG: o.netMaxG, minRefDb: o.netMinRefDb,
            tramSec: o.netTramSec, minR: o.minR
        });
        var parts = [];
        for (var i = 0; i < args.length; i++) {
            var t = String(args[i]);
            parts.push(/^-/.test(t) ? t : '"' + t + '"');
        }

        // Extracció PRECISA de la finestra: `-ss` DESPRÉS de `-i`. Abans de `-i`
        // ffmpeg salta al paquet més pròxim del contenidor i el tall pot caure
        // desenes de ms fora (mesurat: fa caure un r=0,98 a 0,02).
        // .ps1 sense accents (es desa sense BOM): només ASCII.
        var ps = '';
        ps += 'try {\r\n';
        ps += '  & "' + ff + '" -v error -y -i "' + media + '" -ss ' + (inPt + win.start).toFixed(3) +
              ' -t ' + win.dur.toFixed(3) + ' -vn -ac 2 -ar 48000 -c:a pcm_s16le "' + mixWav + '"\r\n';
        ps += '  if (-not (Test-Path -LiteralPath "' + mixWav + '")) { Write-Output "FAIL:no s-extrau la finestra" > "' + doneFile + '"; exit }\r\n';
        ps += '  & "' + nullPs + '" ' + parts.join(' ') + '\r\n';
        ps += '  $code = $LASTEXITCODE\r\n';
        ps += '  if (-not (Test-Path -LiteralPath "' + netWav + '")) { Write-Output ("FAIL:el motor no ha generat la senyal neta (exit=" + $code + ")") > "' + doneFile + '"; exit }\r\n';
        // Veredicte de la mesura del propi motor (NULL / NULL_PARCIAL /
        // NO_NULL): va al log, no decidix res. Amb guany adaptatiu, on la
        // plantilla no hi és el guany queda a 0 i el so passa tal qual.
        ps += '  $vd = ""\r\n';
        ps += '  if (Test-Path -LiteralPath "' + verdictFile + '") { $vd = (Get-Content -LiteralPath "' + verdictFile + '" -Raw).Trim() }\r\n';
        // Guarda d'energia: mean_volume del tram netejat ABANS (mix) i DESPRES
        // (net). Si el net guanya nivell, la resta ha sumat artefactes.
        var mAt = win.at.toFixed(3);
        var mLen = win.len.toFixed(3);
        ps += '  $o1 = (& "' + ff + '" -hide_banner -ss ' + mAt + ' -t ' + mLen + ' -i "' + mixWav + '" -af volumedetect -f null - 2>&1 | Out-String)\r\n';
        ps += '  $o2 = (& "' + ff + '" -hide_banner -ss ' + mAt + ' -t ' + mLen + ' -i "' + netWav + '" -af volumedetect -f null - 2>&1 | Out-String)\r\n';
        ps += '  $v1 = [regex]::Match($o1, \'mean_volume:\\s*(-?[\\d.]+)\').Groups[1].Value\r\n';
        ps += '  $v2 = [regex]::Match($o2, \'mean_volume:\\s*(-?[\\d.]+)\').Groups[1].Value\r\n';
        ps += '  Write-Output ("OK:" + $v1 + ":" + $v2 + ":" + $vd) > "' + doneFile + '"\r\n';
        ps += '} catch { Write-Output ("FAIL:" + $_.Exception.Message) > "' + doneFile + '" }\r\n';
        removeFile(doneFile);
        removeFile(verdictFile);
        removeFile(jsonFile);
        if (!writeText(psFile, ps)) { log('No puc escriure ' + psFile, 'ERROR'); return { ok: false, why: 'ps1' }; }

        try {
            var shRes = await FF._sh('powershell -NoProfile -ExecutionPolicy Bypass -File "' + psFile + '"', { timeoutMs: 240000 });
            await FF._waitDone(doneFile, shRes, 500, 240000);
        } catch (e) {
            log('la resta a la mostra ha fallat: ' + (e && e.message ? e.message : e), 'ERROR');
            removeFile(psFile);
            return { ok: false, why: 'null_audio: ' + (e && e.message ? e.message : e) };
        }
        var doneTxt = String(readText(doneFile) || '');
        removeFile(psFile);
        removeFile(doneFile);
        removeFile(verdictFile);
        if (!exists(netWav)) {
            log('el motor no ha generat ' + netWav + ' (' + doneTxt + ')', 'ERROR');
            return { ok: false, why: 'sense WAV net', mixWav: mixWav };
        }

        // ─── Què diu el motor de la resta que ha fet ────────────────────────
        // El JSON (`bin\null_audio.ps1 -Json`) porta la reducció mesurada, el
        // veredicte i la posició de la plantilla a la mostra. Es desa al costat
        // del WAV: si una neteja ix rara, ací està el perquè.
        var nj = readJson(jsonFile);
        var nInfo = (nj && nj.net) ? nj.net : null;
        if (nj) {
            log('motor: millor tram −' + fmt(num(nj.bestTramDb, 0), 1) + ' dB (' +
                num(nj.tramsOk, 0) + ' de ' + num(nj.trams, 0) + ' trams cancel·len) · ' +
                'mitjana ' + fmt(num(nj.nullDb, 0), 1) + ' dB · plantilla a ' +
                fmt(num(nj.refPosSec, 0), 4) + ' s del mix · ' +
                (nInfo ? fmt(num(nInfo.frames, 0), 0) + ' frames' : 'sense senyal neta') +
                (nInfo && nInfo.adapt ? ' · guany ADAPTATIU (màx ' + fmt(num(nInfo.maxG, 1.2), 2) + ')' : ''),
                'DEBUG');
            if (String(nj.verdict) === 'NO_NULL' && num(nj.tramsOk, 0) > 0) {
                // Normal i no és un error: la finestra mesurada porta la VEU a
                // sobre, així que la MITJANA no pot baixar. El que val és tram a
                // tram — el primer, on només hi ha música, baixa 20-25 dB.
                log('nota: la mitjana de la finestra no baixa (hi ha veu damunt); ' +
                    'el guany adaptatiu decidix tram a tram', 'INFO');
            }
        }

        // ─── GUARDA DE CANCEL·LACIÓ (BUG #240, 05/11) ───────────────────────
        // Si el motor diu que la resta NO ha llevat res, muntar eixe WAV és pitjor
        // que no fer res: el so queda igual i damunt sembla que la neteja ha
        // funcionat. Qui decidix és `shouldMount` (pura, provada amb els JSON
        // reals): `tramsOk` NO servix — amb la veu damunt eix número pot ser 0 i
        // la música estar cancel·lada 26 dB.
        var sj = shouldMount(nj, o);
        if (!sj.mount) {
            log('la resta no ha llevat res (' + sj.why + '): A1 es queda com està. ' +
                'Revisa «' + mixWav + '» i «' + netWav + '» (l\'offset i el guany són al JSON)',
                'ERROR');
            return { ok: false, why: sj.why, mixWav: mixWav, netWav: netWav };
        }

        // Guarda d'energia (mesurada al mateix .ps1): si el net puja de nivell
        // és que la resta ha sumat artefactes en compte de llevar música.
        var dbMix = NaN, dbNet = NaN;
        var mm = /OK:(-?[\d.]+):(-?[\d.]+)/.exec(doneTxt);
        if (mm) { dbMix = Number(mm[1]); dbNet = Number(mm[2]); }
        if (isFinite(dbMix) && isFinite(dbNet)) {
            var gain = dbNet - dbMix;
            log('nivell del tram: ' + fmt(dbMix, 1) + ' dB → ' + fmt(dbNet, 1) +
                ' dB (' + (gain >= 0 ? '+' : '') + fmt(gain, 1) + ' dB)', 'DEBUG');
            if (gain > num(o.maxGainDb, 3)) {
                log('la resta ha PUJAT el nivell (' + (gain >= 0 ? '+' : '') + fmt(gain, 1) +
                    ' dB): no munte res. Revisa «' + netWav + '» a mà', 'ERROR');
                return { ok: false, why: 'guarda d\'energia', mixWav: mixWav, netWav: netWav };
            }
        }


        // ─── Muntatge: només la finestra neta damunt del tram equivalent ────
        // `Clips.insert` fa overwriteClip a la pista d'àudio: substituïx
        // exactament la finestra i no arrastra res (sense ripple, sense tocar
        // V1 ni A2 — `insertWithBounds` sí buidava A2 i retocava el vídeo).
        // Primer s'importa (el que pot fallar) i només després es toca A1.
        var chunk = '';
        try { chunk = await U._importChunk([netWav], 'A1_CLEAN'); }
        catch (e2) { chunk = 'ERR:' + (e2 && e2.message ? e2.message : e2); }
        if (String(chunk) !== 'OK') {
            log('No he pogut importar el net: ' + chunk, 'ERROR');
            return { ok: false, why: 'import: ' + chunk, mixWav: mixWav, netWav: netWav };
        }

        var name = baseName(netWav);
        var tlStart = startSec + win.start;
        var ins = '';
        try {
            ins = await U.callJSX('FASTPASS.Clips.insert(' + JSON.stringify(name) + ', ' + o.track +
                ', ' + tlStart.toFixed(3) + ', 0, "audio", true)', { timeoutMs: 30000 });
        } catch (e3) { ins = 'ERR:' + (e3 && e3.message ? e3.message : e3); }
        if (String(ins).indexOf('ERR') === 0) {
            log('No he pogut col·locar el net a A1: ' + ins, 'ERROR');
            return { ok: false, why: 'insert: ' + ins, mixWav: mixWav, netWav: netWav };
        }

        // El clip nou ha d'acabar EXACTAMENT on s'acaba la finestra: si queda
        // més llarg, se menja el clip que hi ha després (overwrite).
        var endRes = '';
        try {
            endRes = await U.callJSX('FASTPASS.Clips.endAt(' + o.track + ', ' + tlStart.toFixed(3) +
                ', ' + (tlStart + win.dur).toFixed(3) + ', "audio")', { timeoutMs: 20000 });
        } catch (e4) { endRes = 'ERR:' + (e4 && e4.message ? e4.message : e4); }
        if (String(endRes).indexOf('ERR') === 0) {
            log('Avís: no he pogut fixar el final del clip net (' + endRes + ')', 'WARN');
        }

        // Verificació: a la finestra hi ha d'haver el WAV net, no l'original.
        var ver = '';
        try {
            ver = await U.callJSX('FASTPASS.Clips.at(' + o.track + ', ' +
                (tlStart + Math.min(0.2, win.dur / 2)).toFixed(3) + ', "audio")', { timeoutMs: 15000 });
        } catch (e5) { ver = ''; }
        var vName = '';
        try { vName = String(JSON.parse(ver).name || ''); } catch (e6) { vName = ''; }
        if (vName !== name) {
            log('Avís: a A1 hi ha «' + (vName || '?') + '» on esperava «' + name + '»', 'WARN');
        }

        log('✅ A1 netejada: ' + name + ' a ' + fmt(tlStart, 3) + ' s (' + fmt(win.dur, 2) +
            ' s de finestra, ' + fmt(win.len, 2) + ' s de música restada)', 'INFO');
        return { ok: true, mixWav: mixWav, netWav: netWav, name: name, win: win, tlStart: tlStart };
    }


    /**
     * maxEndOf: el `end` més gran de tots els clips que torna
     * `FASTPASS.Clips.debugTracks` (JSON). Pura: es prova headless.
     * Serveix per a saber on s'ACABA el contingut de veritat.
     */
    function maxEndOf(rawJson) {
        var end = 0;
        var j = null;
        try { j = JSON.parse(String(rawJson)); } catch (e) { return 0; }
        if (!j || !j.tracks) return 0;
        for (var t = 0; t < j.tracks.length; t++) {
            var cl = (j.tracks[t] && j.tracks[t].clips) ? j.tracks[t].clips : [];
            for (var c = 0; c < cl.length; c++) {
                var e2 = num(cl[c].end, 0);
                if (e2 > end) end = e2;
            }
        }
        return end;
    }

    /**
     * contentEnd: final REAL del contingut del timeline.
     *
     * NO s'usa `FASTPASS.Timeline.duration()`: això és l'**out point de la
     * seqüència**, un marcador que pot estar a qualsevol lloc (i en un projecte
     * acabat sol estar al principi) → la prova cau DAMUNT dels clips. Ací es
     * miren totes les pistes (vídeo i àudio) amb `Clips.debugTracks` i es pren
     * el `end` més gran: 2 crides i mai s'invadix res.
     *
     * @returns {Promise<number>} segons (0 si no es pot saber)
     */
    async function contentEnd(U) {
        var end = 0;
        var kinds = ['video', 'audio'];
        for (var k = 0; k < kinds.length; k++) {
            var raw = '';
            try { raw = await U.callJSX('FASTPASS.Clips.debugTracks("' + kinds[k] + '")', { timeoutMs: 20000 }); }
            catch (e) { raw = ''; }
            var v = maxEndOf(raw);
            if (v > end) end = v;
        }
        return end;
    }

    /**
     * syncLayout: aritmètica de la PROVA DE SINCRONIA (pura, es prova headless).
     *
     *   base      = on comença la còpia al timeline (final del CONTINGUT + marge)
     *   mediaOut  = fins on s'ha de sentir el media: `inPoint + durada` (tot el so
     *               anterior al tall + el del clip)
     *   anchor    = posició REAL on ha quedat la còpia (Premiere arrodonix al
     *               frame). Si no se sap, es pren `base`.
     *   refStart  = on s'ha de muntar la plantilla perquè el seu segon `refSkip`
     *               caiga EXACTAMENT damunt de l'inici del clip →
     *               `anchor + inPoint − refSkip + nudge`
     *
     * Si eixa posició fóra negativa (plantilla més llarga que el que hi ha davant
     * del tall) la prova s'allunya del final fins que hi cap.
     *
     * @param {number} inPt      - inPoint del clip dins del media (s)
     * @param {number} clipDur   - durada del clip al timeline (s)
     * @param {number} refSkip   - segons de plantilla ABANS de l'inici del clip
     * @param {number} seqEnd    - final del contingut del timeline (s)
     * @param {number} gap       - marge després del final (s)
     * @param {number} [nudge]   - ajust fi en segons (±1 frame = 0,04 s a 25 fps)
     * @param {number} [startReal] - start REAL que ha deixat Premiere per a la còpia
     * @returns {{base:number, anchor:number, refStart:number, mediaOut:number,
     *            inPt:number, refSkip:number, clipDur:number}}
     */
    function syncLayout(inPt, clipDur, refSkip, seqEnd, gap, nudge, startReal) {
        var a = Math.max(0, num(inPt, 0));
        var dur = Math.max(0.5, num(clipDur, 0));
        var skip = Math.max(0, num(refSkip, 0));
        var g = Math.max(0, num(gap, 1));
        var base = Math.max(0, num(seqEnd, 0)) + g;
        var need = a - skip;               // desplaçament plantilla → còpia
        if (base + need < 0.5) base = 0.5 - need;
        if (!(base > 0)) base = g;
        var sr = num(startReal, 0);
        var anchor = (sr > 0) ? sr : base; // on és la còpia DE VERITAT
        return {
            base: base, anchor: anchor,
            refStart: anchor + a - skip + num(nudge, 0),
            mediaOut: a + dur, inPt: a, refSkip: skip, clipDur: dur
        };
    }

    /**
     * syncProof: PROVA DE SINCRONIA (pas 1 del calibratge).
     *
     * NO neteja res. Al FINAL DEL CONTINGUT del timeline (el `end` més gran de
     * totes les pistes, + `proofGap`; MAI a l'out point de la seqüència) munta:
     *   1. a A1 (`o.track`) una còpia del MATEIX media amb tot el so anterior
     *      disponible: inPoint 0 → `inPt + dur` (l'out del primer clip d'A1),
     *   2. a A2 (`o.proofTrack`) la plantilla, col·locada de manera que el seu
     *      segon `refSkip` caiga exactament on comença el clip d'A1, ancorada a
     *      la posició REAL que ha deixat Premiere (`Clips.at`) i amb l'ajust fi
     *      `proofNudgeFrames` (en frames: l'arrodoniment al frame pot moure-la
     *      1 frame). Mesurat a TNV V1: la careta anava 1 frame TARDE → −1.
     *
     * Així el `lag` que ha eixit de `corr_audio.ps1` es pot comprovar a ull
     * (les dos ones han de coincidir al mostreig) abans de confiar-li la resta.
     *
     * @param {Object} clip - { inPoint, duration, start, name } del clip d'A1
     * @param {string} media - ruta del media del clip
     * @param {Object} d    - resultat de `decision()` (refPath, refSkipSec, lagSec)
     * @param {Object} o    - config normalitzada
     * @returns {Promise<{ok:boolean, why:string, base:number, anchor:number,
     *                    refStart:number, inPt:number, refSkip:number,
     *                    mediaOut:number}>}
     *   base     = on s'havia de muntar la còpia (número teòric)
     *   anchor   = on ha quedat de veritat (frame arrodonit)
     *   refStart = on comença la plantilla a A2
     *   La correcció del `refSkip` que ix d'ací és `refSkip + proofNudge` (log).
     */
    async function syncProof(clip, media, d, o) {
        var U = utils();
        if (!d.refPath) { log('prova de sincronia: no sé quina plantilla alinear', 'ERROR'); return { ok: false, why: 'sense plantilla' }; }

        var trackRef = Math.max(1, Math.round(num(o.proofTrack, 2)));
        var clipDur = Math.max(0.5, num(clip.duration, 0));

        // 1) Final REAL del contingut (no l'out point de la seqüència) + marge.
        var seqEnd = 0;
        try { seqEnd = await contentEnd(U); } catch (e0) { seqEnd = 0; }
        if (!(seqEnd > 0)) {
            // reserva: out point de la seqüència o, si no, final del clip
            try { seqEnd = num(await U.callJSX('FASTPASS.Timeline.duration()', { timeoutMs: 15000 }), 0); }
            catch (e0b) { seqEnd = 0; }
        }
        if (!(seqEnd > 0)) seqEnd = Math.max(0, num(clip.start, 0) + clipDur);
        var L = syncLayout(clip.inPoint, clipDur,
            num(d.refSkipSec, Math.max(0, -num(d.lagSec, 0))), seqEnd, o.proofGap, o.proofNudge);
        var inPt = L.inPt, mediaOut = L.mediaOut, refSkip = L.refSkip, base = L.base;
        // 2) A1: el media des del seu INICI fins a l'out del clip.
        var copyName = baseName(media);
        var ins1 = '';
        try {
            ins1 = await U.callJSX('FASTPASS.Clips.insert(' + JSON.stringify(copyName) + ', ' + o.track +
                ', ' + base.toFixed(3) + ', 0, "audio", true)', { timeoutMs: 30000 });
        } catch (e1) { ins1 = 'ERR:' + (e1 && e1.message ? e1.message : e1); }
        if (String(ins1).indexOf('ERR') === 0) {
            log('prova: no he pogut muntar la còpia a A' + o.track + ' (' + ins1 + ')', 'ERROR');
            return { ok: false, why: 'insert còpia: ' + ins1 };
        }
        var tr1 = '';
        try {
            tr1 = await U.callJSX('FASTPASS.Clips.trimBounds(' + base.toFixed(3) + ', 0, ' +
                mediaOut.toFixed(3) + ', ' + o.track + ', "audio")', { timeoutMs: 20000 });
        } catch (e2) { tr1 = 'ERR:' + (e2 && e2.message ? e2.message : e2); }
        if (String(tr1).indexOf('ERR') === 0) {
            log('prova: la còpia no ha quedat retallada (' + tr1 + '): pot ser més llarga del compte', 'WARN');
        }

        // 2b) On ha quedat la còpia DE VERITAT: Premiere arrodonix al frame, així
        // que la plantilla s'alinea contra eixe `start` i no contra el número
        // teòric (eixa era part del desfase d'1 frame que es veia al timeline).
        var startReal = 0;
        var rawC = '';
        try {
            rawC = await U.callJSX('FASTPASS.Clips.at(' + o.track + ', ' +
                (base + 0.05).toFixed(3) + ', "audio")', { timeoutMs: 15000 });
        } catch (eC) { rawC = ''; }
        try {
            var jc = JSON.parse(String(rawC));
            if (jc && isFinite(jc.start)) startReal = Number(jc.start);
        } catch (eC2) { startReal = 0; }
        if (!(startReal > 0)) startReal = 0;

        // 3) A2: la plantilla, amb el seu segon `refSkip` damunt de l'inici del clip.
        var refName = baseName(d.refPath);
        var chunk = '';
        try { chunk = await U._importChunk([d.refPath], 'A1_CLEAN'); }
        catch (e3) { chunk = 'ERR:' + (e3 && e3.message ? e3.message : e3); }
        if (String(chunk) !== 'OK') {
            log('prova: no he pogut importar la plantilla (' + chunk + ')', 'ERROR');
            return { ok: false, why: 'import plantilla: ' + chunk };
        }
        // Amb la posició real + l'ajust fi (`proofNudgeFrames` → `proofNudge`).
        var L2 = syncLayout(clip.inPoint, clipDur, refSkip, seqEnd, o.proofGap, o.proofNudge, startReal);
        var refStart = L2.refStart;
        var ins2 = '';
        try {
            ins2 = await U.callJSX('FASTPASS.Clips.insert(' + JSON.stringify(refName) + ', ' + trackRef +
                ', ' + refStart.toFixed(3) + ', 0, "audio", true)', { timeoutMs: 30000 });
        } catch (e4) { ins2 = 'ERR:' + (e4 && e4.message ? e4.message : e4); }
        if (String(ins2).indexOf('ERR') === 0) {
            log('prova: no he pogut muntar la plantilla a A' + trackRef + ' (' + ins2 + ')', 'ERROR');
            return { ok: false, why: 'insert plantilla: ' + ins2 };
        }

        var anchor = startReal > 0 ? startReal : base;
        var drift = anchor - base;
        var nf = num(o.proofNudgeFrames, 0);
        log('🧪 PROVA DE SINCRONIA muntada al final del contingut del timeline:', 'INFO');
        log('  A' + o.track + ': «' + copyName + '» a ' + fmt(anchor, 3) + ' s, del segon 0 al ' +
            fmt(mediaOut, 3) + ' s del media (' + fmt(inPt, 2) + ' s abans del tall + ' +
            fmt(clipDur, 2) + ' s de clip)' +
            (Math.abs(drift) > 0.001 ? ' · la copia ha caigut ' + fmt(drift * 1000, 0) + ' ms fora del número' : ''),
            'INFO');
        log('  A' + trackRef + ': «' + refName + '» a ' + fmt(refStart, 3) + ' s → el seu segon ' +
            fmt(refSkip, 3) + ' cau a ' + fmt(anchor + inPt, 3) + ' s (inici del clip)' +
            (nf !== 0 ? ' · nudge ' + nf + ' frame(s) = ' + fmt(o.proofNudge, 3) + ' s' : ''), 'INFO');
        log('  Offset EFECTIU de la plantilla: ' + fmt(refSkip + num(o.proofNudge, 0), 3) +
            ' s (el que s\'ha de fer servir a la resta).', 'INFO');
        log('  Escolta-ho: si les dos pistes sonen alhora, el lag és bo. Si la careta va un frame ' +
            'tarde → `Logic.A1Clean.setProofNudge(-1)`; si va avant → `(1)`; `(0)` ho lleva.', 'INFO');

        return {
            ok: true, why: '', base: base, anchor: anchor, refStart: refStart, inPt: inPt,
            refSkip: refSkip, mediaOut: mediaOut, refName: refName, copyName: copyName
        };
    }

    // ════════════════════════════════════════════════════════════════════════
    // RUN (el que crida el flux de la DIANA)
    // ════════════════════════════════════════════════════════════════════════

    /**
     * run: punt d'entrada. Per defecte (`mode:'on'`, `proof:false`) mesura per
     * correlació i, si hi ha música de careta o de MOLINET dins del primer clip
     * d'A1, la lleva i munta la finestra neta (el que fa la DIANA al clicar).
     * Amb `proof:true` NO neteja: deixa la PROVA DE SINCRONIA al final del
     * timeline (recalibratge). Amb `mode:'dry'` només mesura i ho diu al log.
     *
     * @param {Object} [opts] - sobreescriu qualsevol clau de DEFAULTS
     * @returns {Promise<{ok:boolean, ver:string, mode:string, clips:number,
     *                    hits:number, why:string}>}
     */
    async function run(opts) {
        var o = cfg(opts);
        if (_running) {
            log('ja hi ha una neteja d\'A1 en marxa: no en llance una altra', 'WARN');
            return { ok: true, ver: VER, mode: o.mode, clips: 0, hits: 0, why: 'ja en marxa' };
        }
        _running = true;
        try {
            var r = await _runOnce(o);
            // Rastre a disc del ÚLTIM `run()`: permet saber des de fora si el pas
            // s'ha executat (i amb quin resultat) encara que el log del panell no
            // arribe. Si este fitxer no canvia d'hora després d'un flux, és que
            // `run()` NO s'ha cridat (o que el panell duu JS vell a la memòria).
            try {
                ensureDir(o.outDir);
                var txt = '[' + new Date().toISOString() + '] mode=' + r.mode +
                    ' clips=' + r.clips + ' hits=' + r.hits +
                    ' ok=' + r.ok + ' why=' + (r.why || '-') +
                    ' | minR=' + o.minR + ' margin=' + o.windowMargin +
                    ' maxItems=' + o.maxItems + ' maxSec=' + o.maxSec +
                    ' preSec=' + o.preSec + '\r\n';
                var seen = (r && r.seen && r.seen.length) ? r.seen : [];
                for (var iS = 0; iS < seen.length; iS++) { txt += '  · ' + seen[iS] + '\r\n'; }
                writeText(o.outDir + '\\_last_run.txt', txt);
            } catch (eM) { }
            return r;
        } finally {
            _running = false;
        }
    }

    async function _runOnce(o) {
        var res = { ok: true, ver: VER, mode: o.mode, clips: 0, hits: 0, why: '', seen: [] };

        if (o.mode === 'off') { log('mode off: no es fa res', 'INFO'); res.why = 'off'; return res; }

        log('revisió d\'A1: pista A' + o.track + ' · mode=' + o.mode + ' · v' + VER, 'INFO');
        var clips = await clipsOf(o.track);
        res.clips = clips.length;
        if (!clips.length) {
            log('A1 no té clips: no hi ha res a netejar', 'WARN');
            res.ok = false; res.why = 'A1 buida';
            return res;
        }
        log('A1 té ' + clips.length + ' clip(s); el primer comença a ' + fmt(clips[0].start, 3) +
            ' s (' + String(clips[0].name) + ')', 'INFO');

        // GUARDA D'IDEMPOTÈNCIA (04/11 nit): si el primer clip d'A1 ja és el WAV
        // net que va muntar esta neteja (`a1_<ms>_net.wav`), la música d'eixa
        // finestra ja està restada. La DIANA es pot clicar dos voltes i només
        // s'ha de fer una: ací no es torna a correlacionar res.
        // (La correlació és el car: 7 plantilles × el tram del clip.)
        if (!o.proof && isNetName(clips[0].name)) {
            log('A1 ja està neta («' + clips[0].name + '»): no es torna a mesurar', 'INFO');
            res.why = 'ja net';
            return res;
        }

        var n = Math.min(o.maxItems, clips.length);
        for (var i = 0; i < n; i++) {
            var clip = clips[i];
            var media = await mediaPathOf(clip.name);
            if (!media) {
                log('no sé d\'on ix «' + clip.name + '» (no és al projecte): em salte', 'WARN');
                res.why = 'sense mediaPath';
                res.seen.push(String(clip.name) + '@' + fmt(num(clip.start, 0), 3) + 's r=- (sense media)');
                continue;
            }
            var inPt = num(clip.inPoint, 0);
            var dur = Math.min(o.maxSec, Math.max(1, num(clip.duration, o.maxSec)));
            // PRE-FINESTRA: el tall sol començar DESPRÉS del transitori, així que
            // el clip només en porta la cua. Es mira enrere (`preSec`) per a
            // trobar l'atac i saber quants segons de plantilla cal saltar.
            var pre = Math.max(0, Math.min(o.preSec, inPt));
            var mixStart = inPt - pre;
            var mixDur = pre + dur;
            log('analitze «' + clip.name + '»: ' + fmt(mixDur, 2) + ' s des del segon ' +
                fmt(mixStart, 2) + ' del media (' + fmt(pre, 2) + ' s abans del tall)', 'INFO');

            var corr = await correlate(media, mixStart, mixDur, o);
            if (!corr) {
                res.ok = false; res.why = 'correlació fallida';
                res.seen.push(String(clip.name) + '@' + fmt(num(clip.start, 0), 3) + 's r=- (correlació fallida)');
                continue;
            }

            var d = decision(corr, {
                minR: o.minR, minRatio: o.minRatio, maxSec: o.maxSec,
                inPoint: inPt, durSec: dur
            });
            d.refPath = (corr.best && corr.best.path) ? String(corr.best.path) : '';

            // Rastre per clip: què ha vist la correlació dins d'ESTE clip (r del
            // millor candidat, on cau, quants segons de so hi ha DINS del clip i
            // quants de la plantilla cal saltar). Va a `_last_run.txt` perquè el
            // motiu d'un no-op es puga llegir des de fora del panell.
            var bb = corr.best || {};
            res.seen.push(String(clip.name) + '@' + fmt(num(clip.start, 0), 3) + 's' +
                ' in=' + fmt(inPt, 2) + ' from=' + fmt(mixStart, 2) +
                ' r=' + fmt(num(bb.r, -2), 3) +
                ' ref=' + String(bb.ref || '-') + ' lag=' + fmt(num(bb.lagSec, 0), 2) +
                ' over=' + fmt(num(bb.overlapSec, 0), 2) +
                ' at=' + fmt(d.atSec, 2) + ' skip=' + fmt(d.refSkipSec, 2) +
                ' dins=' + (num(d.dinsWin, -1) < 0 ? '-' : num(d.dinsWin, 0)) +
                ' net=' + fmt(d.cleanSec, 2) + (d.hit ? ' HIT' : ''));
            if (!d.hit) { log('cap música de careta/molinet dins del clip (' + d.why + ')', 'INFO'); continue; }

            res.hits++;
            log('🔎 música de careta/molinet: ' + d.ref + ' a ' + fmt(d.atSec, 3) +
                ' s del clip · ' + d.why, 'INFO');

            if (o.mode !== 'on') {
                log('mode ' + o.mode + ': només informe (timeline intacte)', 'INFO');
                continue;
            }

            if (o.proof) {
                var pr = await syncProof(clip, media, d, o);
                if (!pr.ok) { res.ok = false; res.why = pr.why; }
                else {
                    res.seen.push('PROVA A' + o.track + ' còpia@' + fmt(pr.base, 3) + 's (0→' +
                        fmt(pr.mediaOut, 2) + 's del media) · A' + o.proofTrack + ' ' + pr.refName +
                        '@' + fmt(pr.refStart, 3) + 's skip=' + fmt(pr.refSkip, 3) +
                        ' in=' + fmt(pr.inPt, 3));
                }
                continue;
            }

            var m = await cleanAndMount(clip, media, dur, d, o);
            if (!m.ok) { res.ok = false; res.why = m.why; }
        }
        return res;
    }

    Logic.A1Clean = {
        VER: VER,
        DEFAULTS: DEFAULTS,
        cfg: cfg,
        decision: decision,
        windowOf: windowOf,
        musicAtWindow: musicAtWindow,
        refSkipAtWindow: refSkipAtWindow,
        isNetName: isNetName,
        pickDir: pickDir,
        shouldMount: shouldMount,
        buildNullArgs: buildNullArgs,
        run: run,
        correlate: correlate,
        clipsOf: clipsOf,
        mediaPathOf: mediaPathOf,
        syncLayout: syncLayout,
        maxEndOf: maxEndOf,
        contentEnd: contentEnd,
        setProofNudge: setProofNudge,
        syncProof: syncProof
    };
})();

