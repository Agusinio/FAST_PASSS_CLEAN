/* ============================================================================
 * PROVA A1 · ECHO-OFF (2026-11-04) — F1
 * ----------------------------------------------------------------------------
 * QUÈ PROVA: la lògica PURA de `Logic.A1Clean` (la que decidix si hi ha música
 * de careta dins del primer clip d'A1 i com es resta), sense CEP ni Premiere.
 *
 * PER QUÈ: esta lògica decidix si es TOCA el timeline. Els errors que ha de
 * caçar són els que es van trobar en viu el 04/11:
 *   · `leak` no existix a `anlms` (l'opció és `leakage`): ffmpeg petava.
 *   · `out_mode='o'` no és la senyal neta: eixos modes DESTRUÏXEN la veu
 *     (mesurat, rVeu 0,06). El bo és 'n' (rVeu 0,99, música -38 dB).
 *   · Restar sobre TOT el clip es menjava el so de la resta del clip: ara
 *     només es re-munta la finestra (música + marge) i la resta no es toca.
 *   · Un `maxLagSec` menut (3 s) no troba mai una careta que comença a 11 s.
 * ==========================================================================*/
(function () {
    var orig = window.__runTests;
    window.__runTests = async function () {
        await orig();

        var ok = window.__ok;
        var UI = window.FASTPASS_UI;
        window.__PHASE = '28-a1clean';

        var A1 = UI.Logic && UI.Logic.A1Clean;
        ok('#A1C/1 `Logic.A1Clean` carregat amb les funcions pures',
            !!A1 && typeof A1.windowOf === 'function' && typeof A1.decision === 'function' &&
            typeof A1.buildNullArgs === 'function' && typeof A1.cfg === 'function',
            'A1=' + !!A1);
        if (!A1 || typeof A1.windowOf !== 'function') return;

        // ── DEFAULTS: neteja ACTIVA, guany adaptatiu i sense prova ──────────
        var c = A1.cfg({});
        ok('#A1C/2 per defecte NETEEJA (`mode` on, `proof` off) amb guany ADAPTATIU',
            c.mode === 'on' && c.proof === false && c.netAdapt === true &&
            Math.abs(c.netMaxG - 1.2) < 1e-9 && Math.abs(c.netTramSec - 0.25) < 1e-9,
            'mode=' + c.mode + ' proof=' + c.proof + ' adapt=' + c.netAdapt +
            ' maxG=' + c.netMaxG);
        ok('#A1C/3 `maxLagSec` deixa trobar una careta que comença a 11 s',
            c.maxLagSec >= 12, 'maxLagSec=' + c.maxLagSec);

        // ── windowOf: només es re-munta la música + marge ───────────────────
        var w = A1.windowOf(120, 11.128, 17.4, 0.75);
        ok('#A1C/4 finestra = música ± 0,75 s (clip de 120 s)',
            Math.abs(w.start - 10.378) < 0.002 && Math.abs(w.dur - 18.9) < 0.002 &&
            Math.abs(w.at - 0.75) < 0.002 && Math.abs(w.len - 17.4) < 0.002,
            JSON.stringify(w));

        var wc = A1.windowOf(5, 4.5, 17.4, 0.75);
        ok('#A1C/5 la finestra no se ix del clip (clip de 5 s)',
            wc.start >= 0 && wc.start + wc.dur <= 5.001 && wc.len <= 0.501,
            JSON.stringify(wc));

        ok('#A1C/6 sense durada no hi ha finestra (guarda)',
            A1.windowOf(0, 0, 0, 0.75).dur === 0, '');

        // ── decision: guards de r i de finestres ────────────────────────────
        var hit = A1.decision({
            best: { ref: 'CARETA', r: 0.8189, lagSec: 11.128, overlapSec: 17.4,
                    windows: [0.98, 0.98, 0.99, 0.97, 0.98, 0.02] }
        }, { minR: 0.7, minRatio: 0.25, maxSec: 30 });
        ok('#A1C/7 cas real (r=0,819) → HI HA música, a 11,128 s, 17,4 s',
            hit.hit === true && Math.abs(hit.atSec - 11.128) < 0.001 &&
            Math.abs(hit.cleanSec - 17.4) < 0.001, JSON.stringify(hit));

        var no = A1.decision({
            best: { ref: 'CARETA', r: 0.0096, lagSec: 0, overlapSec: 14, windows: [0.01, 0] }
        }, { minR: 0.7, minRatio: 0.25, maxSec: 30 });
        ok('#A1C/8 cas timeline (r=0,0096) → NO es toca res', no.hit === false, no.why);

        var badwin = A1.decision({
            best: { ref: 'X', r: 0.75, lagSec: 2, overlapSec: 14, windows: [0.9, 0.1, 0.1, 0.1] }
        }, { minR: 0.7, minRatio: 0.5, maxSec: 30 });
        ok('#A1C/9 r alt però poques finestres bones → NO es toca res',
            badwin.hit === false, badwin.why);

        // ── buildNullArgs: la resta A LA MOSTRA (`bin\null_audio.ps1`) ─────
        // El motor NO és cap filtre d'ffmpeg: busca el lag a la mostra i
        // ajusta el guany per tram (Wiener), així que no hi ha `-NetGain`
        // fix ni `anlms` pel mig.
        var a = A1.buildNullArgs({
            mix: 'M.wav', ref: 'R.wav', out: 'O.wav', json: 'J.json',
            winDurSec: 8.09, musicSec: 6.65, refSkipSec: 10.9491
        });
        var sA = a.join(' ');
        ok('#A1C/10 `null_audio` amb guany ADAPTATIU i sense guany fix',
            sA.indexOf('-NetAdapt') > 0 && sA.indexOf('-NetGain') < 0 &&
            sA.indexOf('-NetMaxG 1.200') > 0 && sA.indexOf('-NetMinRefDb -60.0') > 0,
            sA);
        ok('#A1C/11 la finestra ja comença al mix (MixPos 0) i salta el ja sonat',
            sA.indexOf('-MixPos 0') > 0 && sA.indexOf('-SkipRef 10.949100') > 0 &&
            sA.indexOf('-WinSec 6.650') > 0, sA);
        ok('#A1C/12 la senyal neta té la llargada de la FINESTRA (no la de la música)',
            sA.indexOf('-NetStart 0') > 0 && sA.indexOf('-NetDur 8.090000') > 0, sA);

        var b = A1.buildNullArgs({
            mix: 'M', ref: 'R', out: 'O', winDurSec: 5, musicSec: 9, refSkipSec: -3,
            adapt: false, minR: 0.8, tramSec: 0.5
        });
        var sB = b.join(' ');
        ok('#A1C/13 la música mai passa de la finestra i el salt mai és negatiu',
            sB.indexOf('-WinSec 5.000') > 0 && sB.indexOf('-SkipRef 0.000000') > 0, sB);
        ok('#A1C/14 el pla B (guany fix + gate) només si es demana a posta',
            sB.indexOf('-NetAdapt') < 0 && sB.indexOf('-NetMinR 0.800') > 0 &&
            sB.indexOf('-NetTramSec 0.500') > 0, sB);

        // ── ON es crida el pas (ordre d'usuari, 04/11 nit) ──────────────────
        // Al flux d'INICI (crear / actualitzar / obrir / canviar de focus) NO es
        // neteja, i a OUT & GO tampoc: el bloc s'ha de poder muntar i revisar
        // sense que es toque l'àudio. El pas es dispara NOMÉS en clicar la
        // DIANA 🎯 COL·LOCAR (`runPlaceAllChyrons`), abans dels chyrons.
        var REPO = window.__REPO || '';
        var flow = '';
        try { flow = await (await fetch('file:///' + REPO + '/js/workflows/flow_mainButton.js')).text(); } catch (e) { flow = ''; }
        var nCrides = (flow.match(/_cleanA1Echo\(\)/g) || []).length;
        ok('#A1C/15 `_cleanA1Echo` existix i el flux d\'INICI NO la crida (0 crides)',
            typeof (UI.Workflows.MainButton || {})._cleanA1Echo === 'function' &&
            flow.length > 0 && nCrides === 0,
            'crides=' + nCrides + ' flow=' + flow.length);

        var mainJs = '';
        try { mainJs = await (await fetch('file:///' + REPO + '/js/main.js')).text(); } catch (eM) { mainJs = ''; }
        var iChy = mainJs.indexOf('async function runPlaceAllChyrons');
        var iPipe = mainJs.indexOf('async function runFullPipelineOut');
        var nMain = (mainJs.match(/'_cleanA1Echo'/g) || []).length;
        var iChyCall = (iChy >= 0) ? mainJs.indexOf("'_cleanA1Echo'", iChy) : -1;
        // Cos d'OUT & GO = des de `runFullPipelineOut` fins a `runPlaceAllChyrons`.
        var pipeBody = (iPipe >= 0 && iChy > iPipe) ? mainJs.slice(iPipe, iChy) : '';
        var pipeCalls = pipeBody ? (pipeBody.match(/_cleanA1Echo/g) || []).length : -1;
        var iDup = (iChy >= 0) ? mainJs.indexOf("'Chyrons', 'resetDupSkipped'", iChy) : -1;
        ok('#A1C/16 la neteja es dispara NOMÉS a la DIANA 🎯 (cap crida a OUT & GO)',
            nMain === 1 && iChyCall > iChy && (iDup < 0 || iChyCall < iDup) && pipeCalls === 0,
            'n=' + nMain + ' chy=' + iChyCall + ' dup=' + iDup +
            ' pipe=' + iPipe + ' pipeCalls=' + pipeCalls);

        // PRE-FINESTRA (04/11, en viu): al primer clip d'A1 només hi ha la COLA
        // del so; el transitori va quedar fora del tall. Mirant cap avant, r=0,109;
        // mirant 20 s enrere, r=0,873. Només es mira el PRIMER clip d'A1.
        var cfgDef = A1.cfg({});
        ok('#A1C/17 mira 20 s ENRERE del tall i només el primer clip d\'A1',
            Math.abs(cfgDef.windowMargin - 1.5) < 0.001 && cfgDef.preSec >= 15 &&
            cfgDef.maxItems === 1 && cfgDef.maxLagSec >= cfgDef.preSec,
            'margin=' + cfgDef.windowMargin + ' preSec=' + cfgDef.preSec +
            ' maxItems=' + cfgDef.maxItems + ' maxLag=' + cfgDef.maxLagSec);

        // Cas REAL del 03/11 (TNC_V1_CLIP.mp4): la música comença a 14,49 s del
        // media i el clip talla a 25,44 s → en el clip només entren 6,53 s de cua
        // (17,48 - 10,95). S'ha de restar des del segon 0 i saltar 10,95 s de
        // plantilla; abans es tornava `atSec=0` sense saltar res (r=0,109).
        var cua = A1.decision({
            best: { ref: '3CatInfo_TNC_careta_sense_alpha.WAV', r: 0.8728, rMaxWin: 0.995,
                    lagSec: 9.0509, mixPosSec: 14.4909, overlapSec: 17.6,
                    windows: [0.831, 0.991, 0.992, 0.988, 0.995, 0.737, 0.168, 0.017] }
        }, { minR: 0.7, minRatio: 0.25, maxSec: 30, inPoint: 25.44 });
        ok('#A1C/18 només la cua dins del clip → resta des de 0 i salta 10,95 s de plantilla',
            cua.hit === true && Math.abs(cua.atSec) < 0.001 &&
            Math.abs(cua.refSkipSec - 10.9491) < 0.01 &&
            Math.abs(cua.cleanSec - 6.65) < 0.2, JSON.stringify(cua));

        // El tros analitzat inclou la pre-finestra: si la música ja sonava abans
        // del tall, la finestra NO pot començar en negatiu ni passar-se del clip.
        var winCua = A1.windowOf(120, cua.atSec, cua.cleanSec, 1.5);
        ok('#A1C/19 finestra de la cua: comença a 0 i no passa de la música + marge',
            winCua.start === 0 && winCua.dur > cua.cleanSec &&
            Math.abs(winCua.dur - (cua.cleanSec + 1.5)) < 0.01, JSON.stringify(winCua));

        // ── PROVA DE SINCRONIA: eina de recalibratge, ja NO el camí per defecte
        // (04/11: l'A/B de la neteja es va validar i el pas neteja de debò). Al
        // final del timeline munta la còpia del media (des del seu inici fins a
        // l'out del clip) i la plantilla alineada. Trellat: si `syncLayout` es
        // trenca, s'escriu al timeline en posicions boges i la prova enganya.
        ok('#A1C/20 la PROVA DE SINCRONIA es demana a posta i amb l\'aritmètica pura',
            cfgDef.proof === false && A1.cfg({ proof: true }).proof === true &&
            cfgDef.proofTrack === 2 &&
            typeof A1.syncLayout === 'function' && typeof A1.syncProof === 'function',
            'proof=' + cfgDef.proof + ' track=' + cfgDef.proofTrack +
            ' syncLayout=' + (typeof A1.syncLayout));

        // Cas REAL del 03/11: clip a 25,44 s del media (inPoint), 13,3 s de clip,
        // 10,949 s de plantilla ABANS del tall. La còpia ha de durar fins a
        // 38,74 s i la plantilla ha de començar 14,49 s abans de la còpia
        // (base+inPoint-refSkip): el seu segon 10,949 cau damunt de 25,44.
        var lay = A1.syncLayout(25.44, 13.3, 10.9491, 100, 1);
        ok('#A1C/21 la plantilla alineada: refStart = base + inPoint − refSkip',
            Math.abs(lay.base - 101) < 0.001 &&
            Math.abs(lay.mediaOut - 38.74) < 0.01 &&
            Math.abs(lay.refStart - 115.4909) < 0.01 &&
            Math.abs((lay.refStart + lay.refSkip) - (lay.base + lay.inPt)) < 0.001,
            JSON.stringify(lay));

        // Si la plantilla no cap davant del tall (inPoint 0, 20 s de skip) la
        // prova s'ha d'allunyar perquè no caiga a temps negatiu.
        var lay2 = A1.syncLayout(0, 10, 20, 0, 1);
        ok('#A1C/22 si la plantilla no hi cap, la prova s\'allunya (refStart ≥ 0)',
            lay2.refStart >= 0 && lay2.base > 1 && lay2.mediaOut === 10,
            JSON.stringify(lay2));

        // ── On s'acaba el contingut (i no l'out point) ──────────────────────
        // `Timeline.duration()` és l'OUT POINT de la seqüència: un marcador que
        // pot estar a qualsevol lloc. El 04/11 la prova va caure damunt del
        // projecte per això. `maxEndOf` llig `Clips.debugTracks` i pren el final
        // més gran de totes les pistes.
        var dbg = '{"count":2,"tracks":[{"index":0,"clips":[{"index":0,"start":0,"end":12.5}]},' +
            '{"index":1,"clips":[{"index":0,"start":10,"end":30.75},{"index":1,"start":31,"end":3}]}]}';
        ok('#A1C/23 el final del contingut ix del `end` més gran de totes les pistes',
            typeof A1.maxEndOf === 'function' && Math.abs(A1.maxEndOf(dbg) - 30.75) < 0.001 &&
            A1.maxEndOf('') === 0 && A1.maxEndOf('ERR: sense seqüència') === 0 &&
            A1.maxEndOf('{"count":0,"tracks":[]}') === 0 &&
            Math.abs(A1.maxEndOf('{"count":1,"tracks":[{"clips":[{"end":99.5}]}]}') - 99.5) < 0.001,
            'dbg=' + A1.maxEndOf(dbg) + ' buit=' + A1.maxEndOf('') + ' err=' + A1.maxEndOf('ERR: x'));

        // ── Ancoratge al frame REAL: res del desfase d'un frame ─────────────
        // Premiere arrodonix la inserció al frame: la còpia pot caure, per
        // exemple, a 101,04 s i no a 101. La plantilla s'ha d'alinear contra
        // eixa posició real (`anchor`) i acceptar un ajust fi (`nudge`).
        var layR = A1.syncLayout(25.44, 13.3, 10.9491, 100, 1, 0, 101.04);
        var layN = A1.syncLayout(25.44, 13.3, 10.9491, 100, 1, -0.04, 101.04);
        ok('#A1C/24 la plantilla s\'ancora a la posició REAL de la còpia (anchor)',
            Math.abs(layR.anchor - 101.04) < 0.001 &&
            Math.abs(layR.refStart - 115.5309) < 0.01 &&
            Math.abs(layR.base - 101) < 0.001 &&
            Math.abs((layR.refStart + layR.refSkip) - (layR.anchor + layR.inPt)) < 0.001 &&
            Math.abs(A1.syncLayout(25.44, 13.3, 10.9491, 100, 1, 0, 0).anchor - 101) < 0.001,
            JSON.stringify(layR));

        // `proofNudge` corregix el desfase d'un frame sense tocar res més:
        // 101,04 + 25,44 − 10,9491 − 0,04 = 115,4909 (la posició teòrica).
        // MESURAT a TNV V1 (04/11, a la MOSTRA amb bin\null_audio.ps1): el
        // `refSkip` de la correlació cau exacte —careta a 14,4909 s del media,
        // lag de 4800 mostres— → el valor de fàbrica és 0 frames.
        ok('#A1C/25 `proofNudgeFrames` = 0 (el `refSkip` ja cau a la mostra)',
            cfgDef.proofNudgeFrames === 0 && cfgDef.proofFrameSec === 0.04 &&
            Math.abs(cfgDef.proofNudge) < 1e-9 &&
            Math.abs(layN.refStart - 115.4909) < 0.01 &&
            Math.abs(layN.base - layR.base) < 0.001 &&
            Math.abs(layN.anchor - layR.anchor) < 0.001 &&
            Math.abs(layN.mediaOut - layR.mediaOut) < 0.001,
            'frames=' + cfgDef.proofNudgeFrames + ' s=' + cfgDef.proofNudge +
            ' refStart=' + layN.refStart);

        // L'ajust fi es pot canviar sense tocar codi (consola del panell):
        // `Logic.A1Clean.setProofNudge(-1)` = un frame (`cfg` el passa a segons).
        var nudge1 = typeof A1.setProofNudge === 'function' ? A1.setProofNudge(-1) : null;
        var cfgNud = A1.cfg({}).proofNudge;
        var nudgeBig = typeof A1.setProofNudge === 'function' ? A1.setProofNudge(99) : null;
        var nudge0 = typeof A1.setProofNudge === 'function' ? A1.setProofNudge(0) : null;
        var lsOk = (typeof localStorage === 'undefined' || localStorage === null);
        ok('#A1C/26 `setProofNudge` va en frames, acota a ±50 i `cfg` el passa a segons',
            nudge1 === -1 && nudgeBig === 50 && nudge0 === 0 &&
            (lsOk || Math.abs(cfgNud + 0.04) < 1e-9) &&
            Math.abs(A1.cfg({ proofNudgeFrames: 2 }).proofNudge - 0.08) < 1e-9 &&
            Math.abs(A1.cfg({ proofNudgeFrames: -1, proofFrameSec: 0.033367 }).proofNudge + 0.033367) < 1e-9,
            'set=' + nudge1 + ' cfg=' + cfgNud + ' big=' + nudgeBig + ' zero=' + nudge0);

        // ── La configuració pot arribar com a TEXT ──────────────────────────
        // `Config.A1_CLEAN` es desa en JSON i pot portar `'false'`/`'0'`: per a
        // `if()` una cadena és certa, així que `cfg` ho decidix una sola volta
        // (si no, el panell netejaria quan li demanen el contrari).
        ok('#A1C/27 un `false` escrit com a text no activa la neteja ni la prova',
            A1.cfg({ netAdapt: 'false' }).netAdapt === false &&
            A1.cfg({ proof: 'off' }).proof === false &&
            A1.cfg({ proof: '0' }).proof === false &&
            A1.cfg({ netAdapt: 'true' }).netAdapt === true &&
            Math.abs(A1.cfg({ netTramSec: 0 }).netTramSec - 0.05) < 1e-9 &&
            Math.abs(A1.cfg({ netMaxG: 99 }).netMaxG - 2) < 1e-9 &&
            Math.abs(A1.cfg({ netMinRefDb: -300 }).netMinRefDb + 120) < 1e-9,
            'adapt=' + A1.cfg({ netAdapt: 'false' }).netAdapt +
            ' proof=' + A1.cfg({ proof: 'off' }).proof +
            ' tram=' + A1.cfg({ netTramSec: 0 }).netTramSec);

        // ── El salt de plantilla a l'INICI DE LA FINESTRA (BUG #236) ────────
        // `refSkip` és la plantilla gastada a l'inici del CLIP, no de la
        // finestra: la finestra comença `win.start` s dins del clip i la música
        // pot arrancar més enllà. Amb la fórmula vella (`refSkip + win.start`)
        // el cas de sota demanava 2,99 s de salt que no tocaven.
        ok('#A1C/28 el salt de plantilla a l\'inici de la finestra es compta des del clip',
            Math.abs(A1.refSkipAtWindow(0, 10.9491, 0) - 10.9491) < 1e-9 &&
            Math.abs(A1.refSkipAtWindow(4.4909, 0, 2.991)) < 1e-9 &&
            Math.abs(A1.refSkipAtWindow(4, 0, 10) - 6) < 1e-9 &&
            Math.abs(A1.refSkipAtWindow(0, 0, 0)) < 1e-9 &&
            Math.abs(A1.refSkipAtWindow(2, -5, -3)) < 1e-9,
            'cua=' + A1.refSkipAtWindow(0, 10.9491, 0) +
            ' dins=' + A1.refSkipAtWindow(4.4909, 0, 2.991) +
            ' tart=' + A1.refSkipAtWindow(4, 0, 10));

        // Cas REAL del 04/11 (reset, inPoint=10): la careta comença a 14,49 s
        // del media → a 4,49 s del clip, i la finestra [2,991 · 23,591] porta
        // 1,5 s de marge al davant. El motor ha de rebre `-SkipRef 0` i
        // `-MixPos 1,5` (on cau el segon 0 de la plantilla dins la finestra):
        // amb `-MixPos 0` fix buscava el so on no era i la resta eixia plana.
        var dins = A1.decision({
            best: { ref: '3CatInfo_TNC_careta_sense_alpha.WAV', r: 0.8728, rMaxWin: 0.995,
                    lagSec: 4.4909, mixPosSec: 14.4909, overlapSec: 17.6,
                    windows: [0.831, 0.991, 0.992, 0.988, 0.995, 0.737, 0.168, 0.017] }
        }, { minR: 0.7, minRatio: 0.25, maxSec: 30, inPoint: 10 });
        var wDins = A1.windowOf(242, dins.atSec, dins.cleanSec, 1.5);
        var mAt = A1.musicAtWindow(dins.atSec, dins.refSkipSec, wDins.start);
        var skDins = Math.max(0, -mAt);
        var mDins = Math.min(wDins.dur, Math.max(2, wDins.at + wDins.len));
        var aDins = A1.buildNullArgs({
            mix: 'M', ref: 'R', out: 'O', winDurSec: wDins.dur,
            musicSec: mDins, mixPosSec: Math.max(0, mAt), refSkipSec: skDins
        }).join(' ');
        ok('#A1C/29 música DINS del clip (inPoint=10): `-MixPos` al segon 0 i salt 0',
            dins.hit === true && Math.abs(dins.atSec - 4.4909) < 1e-9 &&
            Math.abs(dins.refSkipSec) < 1e-9 && Math.abs(dins.cleanSec - 17.6) < 0.01 &&
            Math.abs(wDins.start - 2.991) < 0.002 && Math.abs(wDins.at - 1.5) < 0.002 &&
            Math.abs(mAt - 1.5) < 0.002 && Math.abs(skDins) < 1e-9 &&
            aDins.indexOf('-MixPos 1.499900') > 0 && aDins.indexOf('-SkipRef 0.000000') > 0,
            'hit=' + dins.hit + ' at=' + dins.atSec + ' win=' + JSON.stringify(wDins) +
            ' musicAt=' + mAt + ' skip=' + skDins);

        // ── IDEMPOTÈNCIA (04/11 nit): la DIANA es pot clicar més d'una volta ──
        // El primer clip d'A1 és el WAV net quan la neteja ja s'ha fet: el nom el
        // fixa `cleanAndMount` (`a1_<ms>_net.wav`) i ningú més. Amb la guarda,
        // la segona crida no torna a pagar la correlació.
        ok('#A1C/30 la guarda reconeix el WAV net (`a1_<ms>_net.wav`) i res més',
            A1.isNetName('a1_1730000000000_net.wav') === true &&
            A1.isNetName('  A1_173_net.WAV ') === true &&
            A1.isNetName('TNC_V1_CLIP.mp4') === false &&
            A1.isNetName('a1_173_mix.wav') === false &&
            A1.isNetName('a1_net.wav') === false &&
            A1.isNetName('') === false && A1.isNetName(null) === false,
            'net=' + A1.isNetName('a1_1_net.wav') + ' mp4=' + A1.isNetName('TNC_V1_CLIP.mp4') +
            ' mix=' + A1.isNetName('a1_1_mix.wav'));

        // La guarda ha d'estar DINS del recorregut (abans de correlacionar) i no
        // enlloc més: es mira el codi de `_runOnce`.
        var a1src = '';
        try { a1src = await (await fetch('file:///' + REPO + '/js/logic/23_A1_Clean_Logic.js')).text(); } catch (eA) { a1src = ''; }
        var iOnce = a1src.indexOf('async function _runOnce');
        var iGuard = (iOnce >= 0) ? a1src.indexOf('isNetName(clips[0].name)', iOnce) : -1;
        var iCorr = (iOnce >= 0) ? a1src.indexOf('await correlate(media', iOnce) : -1;
        ok('#A1C/31 la guarda va DINS de `_runOnce` i ABANS de correlacionar',
            iGuard > iOnce && iCorr > iGuard,
            'once=' + iOnce + ' guard=' + iGuard + ' correq=' + iCorr);

        // ── ALINEAMENT A LA MOSTRA (BUG #240, 05/11) ────────────────────────
        // El motor desplaça la REFERÈNCIA (`BestRefShift`), no la finestra: el
        // tall no té pre-roll i la reixa ancorada a `spanSmp` només podia anar
        // cap avant. Mesurat a la cua del TNC V1: 12 dB de reducció amb el lag
        // mal posat i 27,4 dB amb els 4 mostres que falten (0,08 ms).
        ok('#A1C/32 el perfil es mesura amb el MATEIX tram que la resta',
            sA.indexOf('-NetTramSec 0.250') > 0 && sA.indexOf('-TramSec 0.250') > 0,
            sA);

        var psSrc = '', csSrc = '';
        try { psSrc = await (await fetch('file:///' + REPO + '/bin/null_audio.ps1')).text(); } catch (eP) { psSrc = ''; }
        try { csSrc = await (await fetch('file:///' + REPO + '/bin/null_core.cs')).text(); } catch (eC) { csSrc = ''; }
        ok('#A1C/33 el desajust es busca desplaçant la REFERÈNCIA (no la finestra)',
            csSrc.indexOf('public static int BestRefShift(') > 0 &&
            psSrc.indexOf('BestRefShift') > 0 && psSrc.indexOf('BestLagSample') < 0 &&
            psSrc.indexOf('$refLead') > 0 && psSrc.indexOf('$bOff') > 0 &&
            psSrc.indexOf('refShift') > 0,
            'ps=' + psSrc.length + ' cs=' + csSrc.length +
            ' shift=' + (psSrc.indexOf('BestRefShift') > 0) +
            ' vell=' + (psSrc.indexOf('BestLagSample') > 0));

        // ── ON es desa el net (2026-11-05 · orde d'usuari) ──────────────────
        // El WAV net s'importa al projecte: si viu a %TEMP%, un projecte obert en
        // un altre equip el busca i el clip ix offline. Ha d'anar a la carpeta
        // del `.prproj` (`Context.folder()`), dins de `mediaSubdir`.
        var pd = A1.pickDir(['', 'ERR:no hi ha projecte', 'undefined', '  ',
            'C:\\temp\\a1_clean\\', '\\\\srv\\share\\proj', 'D:\\altre']);
        ok('#A1C/34 `pickDir` descarta ERR/buides i exigix ruta ABSOLUTA (primera valida)',
            pd === 'C:\\temp\\a1_clean' &&
            A1.pickDir(['', 'ERR:x', 'undefined', 'null', 'relativa\\carpeta']) === '' &&
            A1.pickDir(['\\\\srv\\share\\proj\\']) === '\\\\srv\\share\\proj' &&
            A1.pickDir(null) === '',
            'pd=' + pd + ' rel=' + A1.pickDir(['relativa\\carpeta']));

        var iProj = a1src.indexOf('await projectDir(o)');
        var iPod = a1src.indexOf('var netWav = mediaPod');
        var iImp = a1src.indexOf("_importChunk([netWav]", iProj);
        ok('#A1C/35 el net es desa a la carpeta del PROJECTE (mix/net/JSON), no a `outDir`',
            iProj > 0 && iPod > iProj && iImp > iPod &&
            a1src.indexOf('mediaSubdir') > 0 &&
            a1src.indexOf("var netWav = o.outDir") < 0,
            'proj=' + iProj + ' pod=' + iPod + ' imp=' + iImp);

        // ── GUARDA DE CANCEL·LACIÓ (BUG #240, 05/11) ────────────────────────
        // Amb els JSON REALS de la viu del 05/11: el bo té `tramsOk=0/14` (la veu
        // tapa la música) i s'ha de MUNTAR; el que no resta res s'ha de refusar.
        var gBona = A1.shouldMount({ trams: 14, tramsOk: 0, bestTramDb: 5.51, nullDb: 0.28 });
        var gNoop = A1.shouldMount({ trams: 10, tramsOk: 0, bestTramDb: 0.4, nullDb: 0.1 });
        var gNull = A1.shouldMount(null);
        ok('#A1C/36 `tramsOk=0` NO bloqueja (la veu tapa la música); el no-op sí',
            gBona.mount === true && gNoop.mount === false && gNull.mount === true,
            'bona=' + gBona.mount + ' noop=' + gNoop.mount + ' null=' + gNull.mount +
            ' why=' + gNoop.why);

        ok('#A1C/37 la guarda usa `shouldMount` (no el `tramsOk` del motor)',
            a1src.indexOf('shouldMount(nj, o)') > 0 &&
            typeof A1.shouldMount === 'function' &&
            a1src.indexOf('num(nj.tramsOk, 0) === 0') < 0,
            'usa=' + (a1src.indexOf('shouldMount(nj, o)') > 0) +
            ' vell=' + (a1src.indexOf('num(nj.tramsOk, 0) === 0') > 0));

        // ── (#249 · 06/11) NOMÉS compta la música DINS del clip ─────────────
        // Cas REAL TNV_V4 (05/11): `3CatInfo_TN_tornada_publi_` sona 17,08–21,80 s
        // del media i el clip d'A1 comença en 21,92 s (inPoint). La pre-finestra
        // (20 s) la veia i `decision` deia "6,92 s de música" → es pagava tota la
        // correlació + extracció + resta, el motor no baixava res (0,1 dB) i la
        // guarda ho rebutjava. El hit era FALS: dins del clip no hi ha cap
        // finestra bona (les 2 bones cauen abans del tall).
        var foraTall = A1.decision({
            best: {
                ref: '3CatInfo_TN_tornada_publi_.WAV', r: 0.7227, rMaxWin: 0.995,
                lagSec: 15.1556, mixPosSec: 17.0756, overlapSec: 11.76,
                windows: [0.995, 0.99, 0.297, 0.015, 0.007]
            }
        }, { minR: 0.7, minRatio: 0.25, maxSec: 30, inPoint: 21.92, durSec: 16.96 });
        ok('#A1C/38 (#249) la música que ACABA abans del tall → cap hit (res a restar)',
            foraTall.hit === false && foraTall.ratio === 0 && foraTall.dinsWin === 3 &&
            foraTall.cleanSec >= 0,
            'hit=' + foraTall.hit + ' ratio=' + foraTall.ratio +
            ' dins=' + foraTall.dinsWin + ' why=' + foraTall.why);

        // El filtre no pot trencar el cas bo: la pre-finestra troba l'atac FORA
        // del clip però la música continua dins (cas #A1C/29, ara amb `durSec`).
        var dinsAmbDur = A1.decision({
            best: { ref: '3CatInfo_TNC_careta_sense_alpha.WAV', r: 0.8728, rMaxWin: 0.995,
                    lagSec: 4.4909, mixPosSec: 14.4909, overlapSec: 17.6,
                    windows: [0.831, 0.991, 0.992, 0.988, 0.995, 0.737, 0.168, 0.017] }
        }, { minR: 0.7, minRatio: 0.25, maxSec: 30, inPoint: 10, durSec: 242 });
        ok('#A1C/39 (#249) amb `durSec` la música que SÍ continua dins del clip seguix comptant',
            dinsAmbDur.hit === true && Math.abs(dinsAmbDur.atSec - 4.4909) < 1e-9 &&
            Math.abs(dinsAmbDur.cleanSec - 17.6) < 0.01 && dinsAmbDur.dinsWin === 8,
            'hit=' + dinsAmbDur.hit + ' at=' + dinsAmbDur.atSec +
            ' net=' + dinsAmbDur.cleanSec + ' dins=' + dinsAmbDur.dinsWin +
            ' ratio=' + dinsAmbDur.ratio);

        // El camí real passa `durSec` (la durada del clip) a `decision`.
        ok('#A1C/40 el motor passa `durSec` a `decision` i el trau a `_last_run.txt`',
            /inPoint:\s*inPt,\s*durSec:\s*dur/.test(a1src) &&
            a1src.indexOf("' dins=' +") > 0,
            'crida=' + /inPoint:\s*inPt,\s*durSec:\s*dur/.test(a1src) +
            ' seen=' + (a1src.indexOf("' dins=' +") > 0));

    };
})();

