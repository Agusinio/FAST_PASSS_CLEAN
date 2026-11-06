/* ============================================================================
 * null_core.cs - MOTOR DE CANCEL·LACIO (prova de sincronia A LA MOSTRA)
 * ----------------------------------------------------------------------------
 * Per que existeix (BUG #235, pas 2): la prova al timeline resol 1 frame (40 ms
 * a 25 fps) i eixa precisio NO val per a restar audio: 5 ms de desajust fan
 * pujar el residu 20 dB. Ací es busca el lag EN MOSTRES (pas de 1) i es mesura
 * el residu de `mix - g*ref` tram a tram.
 *
 * Model: mix(t) ~= g * ref(t - lag). Si la careta del media es la MATEIXA
 * gravacio que la plantilla, en el tram sense veu `mix - g*ref` ha de ser
 * ~soroll de quantitzacio (residu -60 dB o mes avall). Si no baixa, o el lag
 * es fals o la referencia no es la bona: en cap dels dos casos es pot restar.
 *
 * Conveni de lag (el mateix que corr_core.cs, pero en MOSTRES):
 *     lag > 0 -> b[0] cau a a[lag]  (a[lag + k] ~= g * b[k])
 *
 * Es compila des del .ps1 amb: Add-Type -Path (Join-Path $PSScriptRoot 'null_core.cs')
 * Sense accents ni caracters no-ASCII a proposit (Add-Type llig UTF-8 i no volem
 * dependre d'aixo).
 * ========================================================================== */

using System;
using System.IO;

public static class NullCore
{
    /** MIN_LEN: mostres minims per a donar un ajust per valid. */
    public const int MIN_LEN = 256;

    /** LoadRaw: llig un fitxer RAW float32 little-endian MONO. */
    public static float[] LoadRaw(string path)
    {
        byte[] bytes = File.ReadAllBytes(path);
        int n = bytes.Length / 4;
        float[] x = new float[n];
        if (n > 0) Buffer.BlockCopy(bytes, 0, x, 0, n * 4);
        return x;
    }

    /** Db: nivell RMS en dBFS (x ja es RMS lineal). Terra a -200 dB. */
    public static double Db(double x)
    {
        if (x <= 1e-10) return -200.0;
        return 20.0 * Math.Log10(x);
    }

    /**
     * PearsonAt: Pearson CENTRAT de a[la + k] contra b[lb + k], k < len.
     * Centrat (restant mitjanes) com `corr_core.PearsonAligned`: si no, un
     * corrent continu o un offset de nivell inflen el numero.
     */
    public static double PearsonAt(float[] a, int la, float[] b, int lb, int len)
    {
        if (len < MIN_LEN) return -2.0;
        double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (int k = 0; k < len; k++)
        {
            double x = a[la + k];
            double y = b[lb + k];
            sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
        }
        double n = len;
        double va = saa - sa * sa / n;
        double vb = sbb - sb * sb / n;
        if (va <= 1e-14 || vb <= 1e-14) return -2.0;
        return (sab - sa * sb / n) / Math.Sqrt(va * vb);
    }

    /**
     * Profile: diferencia d'energia (dB) entre mix i residu en una finestra.
     * Servix per al perfil tram a tram; `len` pot ser 0 -> -200.
     *
     * El residu de cada tram es mesura amb el guany BO d'eixe tram (minims
     * quadrats dins del tram), no amb el global: el motor que munta la senyal
     * (`NetSpanAdaptLR`) tambe en gasta un per tram, i si no, el perfil diu que
     * NO cancella res on si que ho fa (BUG #240: una cua de 0,36 s dins d'una
     * finestra de 3,5 s plena de veu -> el guany global eixia 0,75 i el de la
     * cua 0,89, i el tram de la cua no comptava com a cancel·lat). `g` nomes
     * s'usa si el tram no te referencia (sbb ~ 0).
     */
    public static double[] Profile(float[] a, float[] b, int lag, double g, int bStart, int len, int winSamples)
    {
        if (len < MIN_LEN || winSamples < MIN_LEN) return new double[0];
        int frames = len / winSamples;
        double[] res = new double[frames * 3];
        for (int f = 0; f < frames; f++)
        {
            int o = f * winSamples;
            double saa = 0, sbb = 0, sab = 0, see = 0;
            for (int k = 0; k < winSamples; k++)
            {
                double x = a[lag + bStart + o + k];
                double y = b[bStart + o + k];
                saa += x * x; sbb += y * y; sab += x * y;
            }
            double gOpt = (sbb > 1e-20) ? (sab / sbb) : g;
            if (gOpt > 1.2) gOpt = 1.2;
            if (gOpt < 0.0) gOpt = 0.0;
            for (int k = 0; k < winSamples; k++)
            {
                double x = a[lag + bStart + o + k];
                double y = b[bStart + o + k];
                double e = x - gOpt * y;
                see += e * e;
            }
            double d = winSamples;
            double rmsMix = Math.Sqrt(saa / d);
            double rmsRes = Math.Sqrt(see / d);
            res[f * 3 + 0] = Db(rmsMix);
            res[f * 3 + 1] = Db(rmsRes);
            res[f * 3 + 2] = gOpt;
        }
        return res;
    }

    /**
     * BestLagSample: busca EN MOSTRES (pas de 1) la posicio de b[0] dins de a,
     * dins de [lag0 - span, lag0 + span], comparant la finestra de b que
     * comenca a `bStart` i fa `len` mostres. Torna el lag bo i `r`.
     *
     * PER QUE PAS DE 1: eixa es tota la gracia de l'eina. Amb pas de 10 ms
     * (el que fa el refi de `corr_audio.ps1`) el millor lag pot quedar 5 ms
     * fora, i 5 ms de desajust en musica fan pujar el residu mes de 20 dB.
     */
    public static int BestLagSample(float[] a, float[] b, int lag0, int span, int bStart, int len, out double r)
    {
        int best = lag0;
        double bestR = -2.0;
        r = -2.0;
        if (a == null || b == null || len < MIN_LEN) return lag0;
        if (bStart < 0) bStart = 0;
        for (int L = lag0 - span; L <= lag0 + span; L++)
        {
            int la = L + bStart;
            if (la < 0 || la + len > a.Length || bStart + len > b.Length) continue;
            double v = PearsonAt(a, la, b, bStart, len);
            if (v > bestR) { bestR = v; best = L; }
        }
        r = bestR;
        return best;
    }

    /**
     * BestRefShift: quantes MOSTRES cal desplaçar la REFERENCIA perque case
     * amb la finestra. Torna `d` (positiu = la referencia entra mes tard, es a
     * dir cal saltar-ne mes) i `r`.
     *
     * PER QUE NO `BestLagSample`: eixe busca desplacant la FINESTRA dins de `a`,
     * i aqui `a` comenca al principi del tall, o siga que no te pre-rotllos cap
     * a l'esquerra. Pero el desajust que deixa la correlacio (±1 mostra a 8 kHz
     * = ±6 mostres a 48 kHz) pot demanar tambe la referencia MES AVANT, i eixa
     * part de la plantilla si que existix: es pot saltar-ne menys. Amb una
     * plantilla decodificada amb `span` de mon (index `bOff` = on cau
     * `SkipRef`) es pot anar en les dos direccions i no cal inventar res.
     *
     * Cost: (2*span+1) x len comparacions, les mateixes que abans.
     */
    public static int BestRefShift(float[] a, int la, float[] b, int bOff, int span, int len, out double r)
    {
        int best = 0;
        double bestR = -2.0;
        r = -2.0;
        if (a == null || b == null || len < MIN_LEN) return 0;
        if (la < 0 || la + len > a.Length) return 0;
        if (span < 0) span = 0;
        for (int d = -span; d <= span; d++)
        {
            int q = bOff - d;
            if (q < 0 || q + len > b.Length) continue;
            double v = PearsonAt(a, la, b, q, len);
            if (v > bestR) { bestR = v; best = d; }
        }
        r = bestR;
        return best;
    }

    /**
     *   g        = <a,b>/<b,b>   (minims quadrats: el guany que millor cancela)
     *   rmsRes   = RMS de a - g*b
     *   rmsUnity = RMS de a - b  (resta a pel, sense ajustar guany)
     */
    public static double[] FitWindow(float[] a, float[] b, int lag, int bStart, int len)
    {
        double[] outv = new double[5];
        if (a == null || b == null || len < MIN_LEN) return outv;
        int la = lag + bStart;
        if (la < 0 || la + len > a.Length || bStart + len > b.Length) return outv;
        double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (int k = 0; k < len; k++)
        {
            double x = a[la + k];
            double y = b[bStart + k];
            sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
        }
        double n = len;
        double g = (sbb > 1e-20) ? (sab / sbb) : 0.0;
        double va = saa - sa * sa / n;
        double vb = sbb - sb * sb / n;
        double r = (va <= 1e-14 || vb <= 1e-14) ? -2.0 : (sab - sa * sb / n) / Math.Sqrt(va * vb);
        double see = 0, seu = 0;
        for (int k = 0; k < len; k++)
        {
            double x = a[la + k];
            double y = b[bStart + k];
            double e = x - g * y;
            double eu = x - y;
            see += e * e; seu += eu * eu;
        }
        outv[0] = g;
        outv[1] = r;
        outv[2] = Math.Sqrt(saa / n);
        outv[3] = Math.Sqrt(see / n);
        outv[4] = Math.Sqrt(seu / n);
        return outv;
    }

    /**
     * Residual: la resta alineada `a[lag + bStart + k] - g * b[bStart + k]`.
     * Servix per a ESCOLTAR exactament el que s'ha mesurat: abans el WAV de la
     * diferencia es feia amb un filter_complex (atrim + volume + amix) i eixia
     * 9 dB MES ALT que el mix -no pel guany sino perque `atrim` deixa el PTS
     * corregut i `amix` alinea per PTS-. Fer-ho des d'ací lleva el dubte.
     */
    public static float[] Residual(float[] a, float[] b, int lag, double g, int bStart, int len)
    {
        if (a == null || b == null || len < 1) return new float[0];
        int la = lag + bStart;
        if (la < 0 || la + len > a.Length || bStart + len > b.Length) return new float[0];
        float[] e = new float[len];
        for (int k = 0; k < len; k++)
        {
            e[k] = (float)(a[la + k] - g * b[bStart + k]);
        }
        return e;
    }

    /**
     * NetSpanStereoLR: la resta que es MONTA al timeline (pas 2 del BUG #235).
     * `a` i `b` son ESTEREO INTERCALAT (L,R,L,R...): la finestra del media i la
     * plantilla. Es resta CANAL A CANAL (L amb L, R amb R) perque la careta te
     * estereo de veritat (el `side` L-R esta nomes 2,2 dB sota el `mid`, tan a
     * la plantilla com al media): restant el promig dels canals a tots dos, el
     * `side` del media quedava intacte i nomes baixava 5,7 dB per canal; canal a
     * canal baixa 12,1 dB (mesurat sobre la careta).
     * Si la plantilla es mono (un sol canal), el mateix valor cau als dos costats.
     * Els primers `pre` frames ixen TAL QUAL (encara no hi ha referencia) i, si
     * la plantilla s'acaba abans que el tram, la cua tambe ix tal qual: mai
     * s'inventa silenci on no hi havia referencia.
     */
    public static float[] NetSpanStereoLR(float[] a, float[] b, int pre, double g)
    {
        return NetSpanStereoLR(a, b, pre, g, 0.0, 0);
    }

    /**
     * NetSpanStereoLR amb GATE de correlacio per trams (BUG #235, causa (j)).
     * Restar a cegues fa dos mals: on la plantilla te energia pero NO es la
     * mateixa gravacio, hi fica careta invertida (al perfil hi ha trams amb
     * G negatiu, -2,88); i on la plantilla casi no te res, el guany es dispara
     * i deixa un buit de silenci. Amb `minR` > 0 i `tramFrames` > 0 es mira la
     * correlacio de cada tram: nomes es resta on r >= `minR`, amb una rampa de
     * 1/8 de tram a les vores perque no es senta el clic. `minR` = 0 desactiva
     * el gate (comportament antic).
     */
    public static float[] NetSpanStereoLR(float[] a, float[] b, int pre, double g, double minR, int tramFrames)
    {
        if (a == null || a.Length < 2) return new float[0];
        if (pre < 0) pre = 0;
        int frames = a.Length / 2;
        if (pre > frames) pre = frames;
        int bFrames = (b == null) ? 0 : b.Length / 2;
        bool bStereo = (bFrames > 0);
        if (!bStereo) bFrames = (b == null) ? 0 : b.Length;
        float[] e = new float[a.Length];

        bool gate = (minR > 0.0 && tramFrames >= 64 && bFrames > 0);
        double[] tg = null;
        int nTram = 0, ramp = 1;
        if (gate)
        {
            nTram = (frames + tramFrames - 1) / tramFrames;
            tg = new double[nTram];
            for (int t = 0; t < nTram; t++)
            {
                int k0 = t * tramFrames;
                int k1 = k0 + tramFrames;
                if (k1 > frames) k1 = frames;
                double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
                int n = 0;
                for (int k = k0; k < k1; k++)
                {
                    int bi = k - pre;
                    if (bi < 0 || bi >= bFrames) continue;
                    double av = bStereo ? 0.5 * (a[2 * k] + a[2 * k + 1]) : a[2 * k];
                    double bv = bStereo ? 0.5 * (b[2 * bi] + b[2 * bi + 1]) : b[bi];
                    sa += av; sb += bv; saa += av * av; sbb += bv * bv; sab += av * bv; n++;
                }
                double corr = 0.0;
                if (n > 8)
                {
                    double ma = sa / n, mb = sb / n;
                    double va = saa / n - ma * ma;
                    double vb = sbb / n - mb * mb;
                    double cv = sab / n - ma * mb;
                    if (va > 1e-12 && vb > 1e-12) corr = cv / Math.Sqrt(va * vb);
                }
                tg[t] = (n > 8 && corr >= minR) ? g : 0.0;
            }
            ramp = tramFrames / 8;
            if (ramp < 1) ramp = 1;
        }

        for (int k = 0; k < frames; k++)
        {
            double gg = g;
            if (gate)
            {
                int t = k / tramFrames;
                if (t >= nTram) t = nTram - 1;
                int off = k - t * tramFrames;
                gg = tg[t];
                if (off < ramp && t > 0)
                {
                    double p = (double)off / ramp;
                    gg = tg[t - 1] * (1.0 - p) + tg[t] * p;
                }
            }
            int bi = k - pre;
            bool has = (b != null && bi >= 0 && bi < bFrames);
            double rl = 0.0, rr = 0.0;
            if (has && gg != 0.0)
            {
                rl = gg * b[bStereo ? 2 * bi : bi];
                rr = gg * b[bStereo ? 2 * bi + 1 : bi];
            }
            e[2 * k]     = (float)(a[2 * k]     - rl);
            e[2 * k + 1] = (float)(a[2 * k + 1] - rr);
        }
        return e;
    }

    /**
     * NetSpanAdaptLR: resta CANAL A CANAL amb GUANY ADAPTATIU PER TRAMS
     * (BUG #235, causa (k)). El guany de cada tram s'ajusta per minims
     * quadrats (`g = <a,b>/<b,b>`, un PER CANAL) i es limita a [0, gMax]: on la
     * plantilla hi es pero fluixa (el fade-out de la careta) ix un guany alt i
     * la cua s'esborra del tot; on la plantilla no hi te res (`<b,b>` ~ 0) ix
     * `g = 0` i el so queda intacte. Com que el guany de minims quadrats ja es
     * proporcional a la correlacio, no cal cap llindar de `r`: on la careta hi
     * es a mitges (r ~ 0,45) es lleva la part que hi es, i no s'hi fica res on
     * no n'hi ha (els `G` negatius del perfil ixen 0). Els guanys s'interpolen
     * entre centres de tram perque no es senta cap grao.
     */
    public static float[] NetSpanAdaptLR(float[] a, float[] b, int pre, double gMax, int tramFrames, double minRefDb)
    {
        if (a == null || a.Length < 2) return new float[0];
        if (pre < 0) pre = 0;
        int frames = a.Length / 2;
        if (pre > frames) pre = frames;
        int bFrames = (b == null) ? 0 : b.Length / 2;
        bool bStereo = (bFrames > 0);
        if (!bStereo) bFrames = (b == null) ? 0 : b.Length;
        float[] e = new float[a.Length];
        if (tramFrames < 64) tramFrames = 64;

        int nTram = (frames + tramFrames - 1) / tramFrames;
        double[] gl = new double[nTram];
        double[] gr = new double[nTram];
        double minE = Math.Pow(10.0, minRefDb / 10.0);
        for (int t = 0; t < nTram; t++)
        {
            int k0 = t * tramFrames;
            int k1 = k0 + tramFrames;
            if (k1 > frames) k1 = frames;
            int n = k1 - k0;
            if (n < 1) n = 1;
            double nl = 0, dl = 0, nr = 0, dr = 0;
            for (int k = k0; k < k1; k++)
            {
                int bi = k - pre;
                if (bi < 0 || bi >= bFrames) continue;
                double bl = b[bStereo ? 2 * bi : bi];
                double br = b[bStereo ? 2 * bi + 1 : bi];
                nl += a[2 * k] * bl;
                dl += bl * bl;
                nr += a[2 * k + 1] * br;
                dr += br * br;
            }
            double gL = (dl > 0.0 && dl / n > minE) ? nl / dl : 0.0;
            double gR = (dr > 0.0 && dr / n > minE) ? nr / dr : 0.0;
            gl[t] = (gL > gMax) ? gMax : (gL > 0.0 ? gL : 0.0);
            gr[t] = (gR > gMax) ? gMax : (gR > 0.0 ? gR : 0.0);
        }

        for (int k = 0; k < frames; k++)
        {
            int t = k / tramFrames;
            if (t >= nTram) t = nTram - 1;
            int c = t * tramFrames + tramFrames / 2;
            int t2 = t;
            double f = 0.0;
            if (k >= c)
            {
                if (t + 1 < nTram) { t2 = t + 1; f = (double)(k - c) / tramFrames; }
            }
            else if (t > 0)
            {
                t2 = t - 1;
                f = (double)(c - k) / tramFrames;
            }
            if (f > 1.0) f = 1.0;
            double gLk = gl[t] * (1.0 - f) + gl[t2] * f;
            double gRk = gr[t] * (1.0 - f) + gr[t2] * f;
            int bi = k - pre;
            bool has = (b != null && bi >= 0 && bi < bFrames);
            double rl = 0.0, rr = 0.0;
            if (has)
            {
                rl = gLk * b[bStereo ? 2 * bi : bi];
                rr = gRk * b[bStereo ? 2 * bi + 1 : bi];
            }
            e[2 * k]     = (float)(a[2 * k]     - rl);
            e[2 * k + 1] = (float)(a[2 * k + 1] - rr);
        }
        return e;
    }

    /**
     * PeakIndex: index del maxim de |x| dins de [from,to). -1 si no hi ha res.
     * Es l'ancoratge de la resta: el PIC TRANSITORI d'inici de la mostra es el
     * que no enganya (la correlacio de 10 s pot caure a qualsevol tram on la
     * musica s'assembla).
     */
    public static int PeakIndex(float[] x, int from, int to)
    {
        if (x == null || x.Length < 1) return -1;
        if (from < 0) from = 0;
        if (to > x.Length) to = x.Length;
        if (to - from < 1) return -1;
        int bi = from;
        double bv = Math.Abs((double)x[from]);
        for (int i = from + 1; i < to; i++)
        {
            double v = Math.Abs((double)x[i]);
            if (v > bv) { bv = v; bi = i; }
        }
        return bi;
    }

    /** OnsetIndex: primer index de [from,to) amb |x| >= thresh (llindar absolut). -1 si no n'hi ha. */
    public static int OnsetIndex(float[] x, int from, int to, double thresh)
    {
        if (x == null) return -1;
        if (from < 0) from = 0;
        if (to > x.Length) to = x.Length;
        for (int i = from; i < to; i++)
        {
            if (Math.Abs((double)x[i]) >= thresh) return i;
        }
        return -1;
    }

    /**
     * PeakFrac: desplacament fraccionari del pic (mostres, dins de [-0,5,0,5])
     * per interpolacio parabolica de |x| als tres punts. Servix per a alinear
     * "fi, fi": a 48 kHz una mostra son 20 us i a la resta es nota.
     */
    public static double PeakFrac(float[] x, int idx)
    {
        if (x == null || idx <= 0 || idx >= x.Length - 1) return 0.0;
        double y0 = Math.Abs((double)x[idx - 1]);
        double y1 = Math.Abs((double)x[idx]);
        double y2 = Math.Abs((double)x[idx + 1]);
        double d = y0 - 2.0 * y1 + y2;
        if (Math.Abs(d) < 1e-20) return 0.0;
        double f = 0.5 * (y0 - y2) / d;
        if (f > 0.5) f = 0.5;
        if (f < -0.5) f = -0.5;
        return f;
    }

    /** SaveRaw: escriu un array com a RAW float32 little-endian (per a ffmpeg). */
    public static void SaveRaw(float[] x, string path)
    {
        if (x == null) return;
        byte[] bytes = new byte[x.Length * 4];
        Buffer.BlockCopy(x, 0, bytes, 0, bytes.Length);
        File.WriteAllBytes(path, bytes);
    }

    /** Version llegible (per als logs i el JSON). */
    public static string Version() { return "null_core v1 (lag a la mostra + residu per tram)"; }
}
