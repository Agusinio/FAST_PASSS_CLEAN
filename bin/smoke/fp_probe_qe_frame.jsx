/*
 * probe_qe_frame.jsx - DIAGNOSTIC EN VIU del congelat (BUG #183 · 2026-10-22)
 * ============================================================================
 * PREGUNTA: que exporta REALMENT `qe.project.getActiveSequence().exportFramePNG(?, path)`?
 *   (A) respecta el timecode "HH:MM:SS:FF" que se li passa?
 *   (B) respecta els ticks?
 *   (C) o ignora l'argument i exporta el frame del CABEZAL?
 *
 * PER QUE: l'usuari diu que el PNG del congelat es el frame del TC 00:00:00 de la
 * sequencia de treball. Si QE ignora el TC i exporta el cabezal, el PNG surt be o
 * mal segons on estiga el cabezal en aqueix moment -> "de vegades" captura el
 * programa. Si interpreta el string com a ticks, el resultat seria SEMPRE frame 0.
 *
 * COM S'EXECUTA (Premiere, amb el projecte i la sequencia de treball oberts):
 *   File > Scripts > Run Script File...  -> escollir aquest fitxer.
 *   IMPORTANT: posa el cabezal en una zona AMB RETOL (perque el frame de P siga
 *   visualment diferent del frame 0).
 *
 * NO TOCA EL PROJECTE: nomes escriu PNGs a C:\temp\probe_qe_frame i restaura el
 * cabezal. Escriu el resultat a C:\temp\probe_qe_frame\_report.txt i obre la carpeta.
 * ExtendScript ES3: sense let/const, fletxes ni template strings.
 */
(function () {
    var OUTDIR = "C:/temp/probe_qe_frame";
    var lines = [];

    function say(s) { lines.push(String(s)); $.writeln("[probe_qe] " + s); }
    function pad(n) { return (n < 10 ? "0" + n : "" + n); }
    function fsize(p) { var f = new File(p); return f.exists ? f.length : -1; }

    function head(p) {
        var f = new File(p);
        if (!f.exists) return "";
        try {
            f.encoding = "BINARY";
            if (!f.open("r")) return "";
            var s = f.read(48);
            f.close();
            return String(s);
        } catch (e) { return ""; }
    }
    function same(a, b) {
        var sa = fsize(a), sb = fsize(b);
        if (sa < 0 || sb < 0) return false;
        return (sa === sb) && (head(a) === head(b));
    }
    function nameOf(p) {
        var a = String(p).split("/");
        return a[a.length - 1];
    }

    var folder = new Folder(OUTDIR);
    if (!folder.exists) folder.create();

    function flush() {
        var f = new File(OUTDIR + "/_report.txt");
        try {
            f.encoding = "UTF-8";
            f.open("w");
            f.write(lines.join("\r\n") + "\r\n");
            f.close();
        } catch (eW) { }
    }

    try {
        app.enableQE();
        var seq = app.project.activeSequence;
        var qeSeq = qe.project.getActiveSequence();
        if (!seq || !qeSeq) {
            say("ERR: no hi ha sequencia activa (DOM=" + (!!seq) + " QE=" + (!!qeSeq) + ")");
            flush();
            return;
        }

        var workSeq = null;
        try {
            if ($.global.FASTPASS && FASTPASS.Context && FASTPASS.Context.getWorkSequence) {
                workSeq = FASTPASS.Context.getWorkSequence();
            }
        } catch (eW) { }

        say("=========== PROBE QE exportFramePNG ===========");
        say("project            = " + app.project.name);
        say("DOM activeSequence = " + seq.name);
        say("QE  getActiveSequence = " + qeSeq.name);
        say("Context workSequence  = " + (workSeq ? workSeq.name : "(no disponible)"));
        say("mateixa sequencia DOM/QE? " + (seq.name === qeSeq.name ? "SI" : "NO  <-- ATENCIO"));

        // ---- timebase real ----
        var tb = 0, fsec = 0, fpsProp = "";
        try {
            var st = seq.getSettings();
            tb = st.videoTimebase;
            fpsProp = "" + st.videoFrameRate;
        } catch (eS) { }
        try { var tt = new Time(); tt.ticks = tb; fsec = tt.seconds; } catch (eT) { }
        if (!(fsec > 0) || !isFinite(fsec) || fsec > 1) fsec = 1 / 25;
        var nominal = Math.round(1 / fsec);
        if (!(nominal >= 1 && nominal <= 300)) nominal = 25;
        say("videoTimebase=" + tb + "  fps(prop)=" + fpsProp + "  ->  fsec=" + fsec + "  base nominal=" + nominal);

        function tcOf(sec) {
            var totalFrames = Math.round(sec / fsec);
            var ff = totalFrames % nominal;
            var totalS = Math.floor(totalFrames / nominal);
            var ss = totalS % 60;
            var tm = Math.floor(totalS / 60);
            var mm = tm % 60;
            var hh = Math.floor(tm / 60);
            return pad(hh) + ":" + pad(mm) + ":" + pad(ss) + ":" + pad(ff);
        }

        function setPos(s, sec) {
            try {
                var t = new Time();
                t.seconds = sec;
                s.setPlayerPosition(t.ticks);
                $.sleep(250);
                return true;
            } catch (e) { say("  (setPlayerPosition ha fallat: " + e.message + ")"); return false; }
        }

        // ---- cabezal ----
        var p = seq.getPlayerPosition();
        var Psec = p.seconds;
        var Pticks = p.ticks;
        var qp = qeSeq.getPlayerPosition();
        var qpSec = qp ? qp.seconds : null;
        var qpTicks = qp ? qp.ticks : null;
        var TCP = tcOf(Psec);
        say("cabezal DOM = " + Psec.toFixed(4) + "s  ticks=" + Pticks + "  timecode=" + TCP);
        say("cabezal QE  = " + qpSec + "s  ticks=" + qpTicks);
        say("");

        var n = 0;
        function tryExport(label, arg) {
            n = n + 1;
            var path = OUTDIR + "/" + pad(n) + "_" + label + ".png";
            var exc = "";
            try {
                qeSeq.exportFramePNG(arg, path);
            } catch (e) { exc = "EXC: " + e.message; }
            $.sleep(350);
            var sz = fsize(path);
            say("  [" + n + "] " + label + "  arg=" + arg + "  ->  " + (sz >= 0 ? sz + " bytes" : "CAP FITXER") + (exc ? "  " + exc : ""));
            return path;
        }

        say("== EXPORTACIONS ==");
        // T1: cabezal a P, TC de P (com fa el panell hui)
        var t1 = tryExport("T1_ctiP_tcP", TCP);
        // T2: cabezal a P, TC de 0  -> si ix el frame 0, el string s'interpreta
        var t2 = tryExport("T2_ctiP_tc0", tcOf(0));
        // T3: cabezal a 0, TC de P  -> si ix el frame de P, el string s'interpreta
        setPos(seq, 0);
        var t3 = tryExport("T3_cti0_tcP", TCP);
        // T4: cabezal a 0, arg "0" (referencia frame 0)
        var t4 = tryExport("T4_cti0_arg0", "0");
        // T5: cabezal a P, ticks de P
        setPos(seq, Psec);
        var t5 = tryExport("T5_ctiP_ticksP", "" + Pticks);
        // T6: cabezal a P, objecte Time de P
        var t6 = null;
        try {
            var tObj = new Time();
            tObj.seconds = Psec;
            t6 = tryExport("T6_ctiP_TimeObj", tObj);
        } catch (eT6) { say("  [6] T6 Time object: EXC " + eT6.message); }

        setPos(seq, Psec);

        // ---- veredicte ----
        say("");
        say("== COMPARACIONS (mateix contingut?) ==");
        say("T1 (cti=P, tc=P)     = " + nameOf(t1) + "  " + fsize(t1) + " b");
        say("T2 (cti=P, tc=0)     = " + nameOf(t2) + "  " + fsize(t2) + " b");
        say("T3 (cti=0, tc=P)     = " + nameOf(t3) + "  " + fsize(t3) + " b");
        say("T4 (cti=0, arg=0)    = " + nameOf(t4) + "  " + fsize(t4) + " b  <== REFERENCIA frame 0");
        say("T5 (cti=P, ticks=P)  = " + nameOf(t5) + "  " + fsize(t5) + " b");
        if (t6) say("T6 (cti=P, TimeObj)  = " + nameOf(t6) + "  " + fsize(t6) + " b");
        say("");
        say("T2 == T4 ? " + same(t2, t4) + "   (TC 0 -> frame 0 = el string S'INTERPRETA)");
        say("T2 == T1 ? " + same(t2, t1) + "   (TC 0 -> mateix que P = el string S'IGNORA)");
        say("T3 == T1 ? " + same(t3, t1) + "   (cabezal 0 + TC P -> frame de P = el TC MANA)");
        say("T3 == T4 ? " + same(t3, t4) + "   (cabezal 0 + TC P -> frame 0 = el CABEZAL mana)");
        say("T5 == T1 ? " + same(t5, t1) + "   (ticks de P = frame de P)");
        say("T5 == T4 ? " + same(t5, t4) + "   (ticks de P -> frame 0 = ticks NO interpretats)");
        say("T1 == T4 ? " + same(t1, t4) + "   <== EL BUG: si es SI, el congelat ix SEMPRE frame 0");
        say("");
        var useTC = same(t3, t1) && !same(t3, t4);
        var useCTI = same(t3, t4) && !same(t3, t1);
        if (useTC) {
            say("VEREDICTE: exportFramePNG RESPECTA el timecode (T3 == T1).");
            say("           -> el problema es el TC que arriba (0) o la sequencia, no la conversio.");
        } else if (useCTI) {
            say("VEREDICTE: exportFramePNG IGNORA el timecode i exporta el frame del CABEZAL (T3 == T4).");
            say("           -> cal garantir el cabezal (Timeline.set) ABANS de la captura i VERIFICAR-lo.");
        } else {
            say("VEREDICTE: NO CONCLOENT. Repeteix amb el cabezal en una zona AMB RETOL i el TC 0");
            say("           sense retol (si els dos frames son iguals, les comparacions no distingeixen).");
        }
        if (same(t1, t4)) {
            say("");
            say("*** ATENCIO: T1 (TC de P) ha donat el MATEIX PNG que el frame 0. Aixo REPRODUEIX #183:");
            say("    el congelat del titullet seria el primer frame del programa (V1), no el retol. ***");
        }
    } catch (eAll) {
        say("EXCEPCIO GENERAL: " + eAll.message + " (linia " + eAll.line + ")");
    }

    flush();
    try { folder.execute(); } catch (eX) { }
})();
