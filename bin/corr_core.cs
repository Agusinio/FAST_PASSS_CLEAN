/* ============================================================================
 * corr_core.cs - MOTOR DE CORRELACIO (Pearson pur + refi fi)
 * ----------------------------------------------------------------------------
 * Per que existeix (BUG #234): `cmp_audio.ps1` normalitzava amb el z-score
 * GLOBAL de cada fitxer i despres feia el producte sobre el solapament SENSE
 * renormalitzar -> podia donar r > 1 (mesurat 1,1378). I, a mes, no refinava el
 * lag: l'embolcall RMS de 20 ms dona el desplacament amb +/-10 ms i, en musica,
 * 5 ms de desajust fan caure r de 0,987 a 0,016 (fals negatiu).
 *
 * Ac ve: Pearson DE VERITAT calculat sobre el solapament, i un REFI FI que
 * provoca tots els desplacaments en +/-1 trama de l'embolcall, a nivell de
 * MOSTRA, sobre la senyal crua. Es el que va localitzar la careta dins del
 * media: 10,7309 s, r=0,98 (la resta de posicions, r~0,01).
 *
 * Conveni de lag (el mateix a tot arreu):
 *     lag > 0  ->  la referencia B comenca L mostres EN DINS de A
 *                  (a[L + k] ~= b[k])  =>  A en la posicio L equival a B en 0
 *
 * Es compila des dels .ps1 amb:  Add-Type -Path (Join-Path $PSScriptRoot 'corr_core.cs')
 * Sense accents ni caracters no-ASCII a proposit: Add-Type llig el font amb
 * UTF-8 i no volem dependre d'aixo.
 * ========================================================================== */

using System;

public static class CorrCore
{
    /** MIN_OVERLAP: mostres minims per a donar un r per valid. */
    public const int MIN_OVERLAP = 128;

    /**
     * Envelope: embolcall RMS per finestres NO solapades de `perFrame` mostres.
     * Descriu "com sona" i no depen de la fase ni del nivell absolut.
     */
    public static double[] Envelope(float[] x, int perFrame)
    {
        if (x == null || perFrame <= 0) return new double[0];
        int frames = x.Length / perFrame;
        double[] env = new double[frames];
        for (int f = 0; f < frames; f++)
        {
            int b = f * perFrame;
            double acc = 0.0;
            for (int i = 0; i < perFrame; i++)
            {
                double v = x[b + i];
                acc += v * v;
            }
            env[f] = Math.Sqrt(acc / perFrame);
        }
        return env;
    }

    /**
     * PearsonEnv: Pearson del solapament de dos embolcalls amb lag en FRAMES.
     * Renormalitza sobre la longitud solapada (aixo es el que faltava: el
     * z-score global no val per a trossos de longitud diferent).
     */
    public static double PearsonEnv(double[] a, double[] b, int lagFrames)
    {
        if (a == null || b == null) return -2.0;
        int i0 = (lagFrames > 0) ? lagFrames : 0;
        int j0 = (lagFrames < 0) ? -lagFrames : 0;
        int len = Math.Min(a.Length - i0, b.Length - j0);
        if (len < 8) return -2.0;

        double sa = 0.0, sb = 0.0, saa = 0.0, sbb = 0.0, sab = 0.0;
        for (int k = 0; k < len; k++)
        {
            double x = a[i0 + k];
            double y = b[j0 + k];
            sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
        }
        double n = len;
        double va = saa - sa * sa / n;
        double vb = sbb - sb * sb / n;
        if (va <= 1e-12 || vb <= 1e-12) return -2.0;
        return (sab - sa * sb / n) / Math.Sqrt(va * vb);
    }

    /**
     * BestLagEnvelope: busca el lag (en FRAMES) que maximitza el Pearson de
     * l'embolcall, dins de +/-maxLagFrames. Sortida: lag i r (per ref).
     */
    public static int BestLagEnvelope(double[] a, double[] b, int maxLagFrames, out double r)
    {
        return BestLagEnvelopeRange(a, b, -maxLagFrames, maxLagFrames, out r);
    }

    /**
     * BestLagEnvelopeRange: com BestLagEnvelope, pero amb el rang de lag DONAT
     * (pot ser asimetric). Servix per a llevar els lags on la referencia nomes
     * entra un tros al final de la finestra: ahi el Pearson de poques trames
     * dona pics d'atzar (mesurat 04/11: r=0,22 en el borde en compte del 0,87
     * del match de veritat, i la neteja d'A1 no s'executava).
     */
    public static int BestLagEnvelopeRange(double[] a, double[] b, int minLagFrames, int maxLagFrames, out double r)
    {
        int best = 0;
        double bestR = -2.0;
        r = bestR;
        if (a == null || b == null || a.Length == 0 || b.Length == 0) return best;
        if (minLagFrames > maxLagFrames) { int t = minLagFrames; minLagFrames = maxLagFrames; maxLagFrames = t; }
        for (int lag = minLagFrames; lag <= maxLagFrames; lag++)
        {
            double v = PearsonEnv(a, b, lag);
            if (v > bestR) { bestR = v; best = lag; }
        }
        r = bestR;
        return best;
    }

    /**
     * PearsonAligned: Pearson de la senyal CRUA amb un lag en MOSTRES.
     * Es el numero que decideix (0,98 = mateix audio; 0,01 = res a vore).
     */
    public static double PearsonAligned(float[] a, float[] b, int lagSamples, out int overlap)
    {
        overlap = 0;
        if (a == null || b == null) return -2.0;
        int i0 = (lagSamples > 0) ? lagSamples : 0;
        int j0 = (lagSamples < 0) ? -lagSamples : 0;
        int len = Math.Min(a.Length - i0, b.Length - j0);
        if (len < MIN_OVERLAP) return -2.0;
        overlap = len;

        double sa = 0.0, sb = 0.0, saa = 0.0, sbb = 0.0, sab = 0.0;
        for (int k = 0; k < len; k++)
        {
            double x = a[i0 + k];
            double y = b[j0 + k];
            sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
        }
        double n = len;
        double va = saa - sa * sa / n;
        double vb = sbb - sb * sb / n;
        if (va <= 1e-12 || vb <= 1e-12) return -2.0;
        return (sab - sa * sb / n) / Math.Sqrt(va * vb);
    }

    /**
     * RefineLag: a partir del lag de l'embolcall (en mostres), prova tots els
     * desplacaments en +/-halfWindow i torna el que maximitza el Pearson cru.
     * Es el pas que convertix un r=0,016 en r=0,987.
     */
    public static int RefineLag(float[] a, float[] b, int lagSamples, int halfWindow, out double r)
    {
        int best = lagSamples;
        double bestR = -2.0;
        int dummy;
        if (halfWindow < 1) halfWindow = 1;
        for (int d = -halfWindow; d <= halfWindow; d++)
        {
            double v = PearsonAligned(a, b, lagSamples + d, out dummy);
            if (v > bestR) { bestR = v; best = lagSamples + d; }
        }
        r = bestR;
        return best;
    }

    /**
     * WindowsR: r per finestres consecutives de `winSamples` al llarg del
     * solapament. Servix per a vore SI la coincidencia es trenca (la careta
     * dura 13 s i el WAV 17,5: les finestres de la cua han de caure).
     */
    public static double[] WindowsR(float[] a, float[] b, int lagSamples, int winSamples)
    {
        if (a == null || b == null || winSamples < MIN_OVERLAP) return new double[0];
        int i0 = (lagSamples > 0) ? lagSamples : 0;
        int j0 = (lagSamples < 0) ? -lagSamples : 0;
        int len = Math.Min(a.Length - i0, b.Length - j0);
        if (len < winSamples) return new double[0];

        int n = len / winSamples;
        double[] res = new double[n];
        for (int w = 0; w < n; w++)
        {
            int off = w * winSamples;
            double sa = 0.0, sb = 0.0, saa = 0.0, sbb = 0.0, sab = 0.0;
            for (int k = 0; k < winSamples; k++)
            {
                double x = a[i0 + off + k];
                double y = b[j0 + off + k];
                sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
            }
            double m = winSamples;
            double va = saa - sa * sa / m;
            double vb = sbb - sb * sb / m;
            res[w] = (va <= 1e-12 || vb <= 1e-12) ? -2.0 : (sab - sa * sb / m) / Math.Sqrt(va * vb);
        }
        return res;
    }

    /**
     * BestLagRaw: busca el lag en MOSTRES que maximitza el Pearson de la senyal
     * crua, en una rejilla de `stepSamples`.
     *
     * PER QUE NO N'HI HA PROU AMB L'EMBOLCALL (mesurat 03/11): amb la careta de
     * 3CatInfo dins del TNV_V1_CLIP, el maxim de l'embolcall RMS de 20 ms cau a
     * 1,6 s del maxim de veritat (la musica de davant s'hi pareix) i el refi de
     * +/-1 trama no el pot recuperar -> r=0,819 en compte de 0,98. Buscant
     * directament la senyal crua el maxim es unic i correcte.
     *
     * Es descarten les posicions amb poc solapament (`minOverlap`): sense aixo
     * una cua de 0,2 s pot donar r alt per casualitat.
     */
    public static int BestLagRaw(float[] a, float[] b, int maxLagSamples, int stepSamples, int minOverlap, out double r)
    {
        int best = 0;
        double bestR = -2.0;
        r = -2.0;
        if (a == null || b == null || stepSamples < 1) return 0;
        int maxOverlap = Math.Min(a.Length, b.Length);
        if (minOverlap < MIN_OVERLAP) minOverlap = MIN_OVERLAP;
        if (minOverlap > maxOverlap) minOverlap = maxOverlap;

        int dummy;
        for (int lag = -maxLagSamples; lag <= maxLagSamples; lag += stepSamples)
        {
            if (Overlap(a, b, lag) < minOverlap) continue;
            double v = PearsonAligned(a, b, lag, out dummy);
            if (v > bestR) { bestR = v; best = lag; }
        }
        r = bestR;
        return best;
    }

    /** Overlap: mostres comparables amb eixe lag. */
    public static int Overlap(float[] a, float[] b, int lagSamples)
    {
        int i0 = (lagSamples > 0) ? lagSamples : 0;
        int j0 = (lagSamples < 0) ? -lagSamples : 0;
        int len = Math.Min(a.Length - i0, b.Length - j0);
        return (len < 0) ? 0 : len;
    }

    /** Version llegible (per als logs i el JSON). */
    public static string Version() { return "corr_core v1 (Pearson pur + refi fi)"; }
}
