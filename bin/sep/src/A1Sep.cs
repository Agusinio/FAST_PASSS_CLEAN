// ============================================================================
// A1Sep.cs — Separacio de fonts (IA) per a FAST >>> PASS · A1 Clean
// ----------------------------------------------------------------------------
// Envolta la pipeline MDX-Net/UVR de sherpa-onnx (Apache-2.0) i exposa un CLI
// estable per al panell:
//
//   A1Sep.exe --model K.onnx --in mix.wav --voice v.wav --music m.wav
//             --threads 20 --json sep.json [--template careta.wav] [--log x.txt]
//
// Sortides: dos stems WAV (veu / musica) + un JSON amb RTF, RMS, correlacions
// i energies per banda. No usa Python ni PyTorch: nomes ONNX Runtime natiu.
//
// Compilat amb csc.exe de .NET Framework 4.8 (C# 5): sense interpolacio de
// cadenes ni 'using var' a proposit, perque compila amb el compilador de serie.
// ============================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using SherpaOnnx;

internal static class A1Sep
{
    // ---------------------------------------------------------------- main ---
    private static int Main(string[] args)
    {
        Dictionary<string, string> o = ParseArgs(args);
        if (o.ContainsKey("help") || o.Count == 0)
        {
            Console.WriteLine(Usage());
            return o.Count == 0 ? 2 : 0;
        }

        string model = Get(o, "model", null);
        string input = Get(o, "in", null);
        if (model == null || input == null)
        {
            Console.Error.WriteLine("Falten --model o --in");
            return 2;
        }
        if (!File.Exists(model)) { Console.Error.WriteLine("No existeix el model: " + model); return 2; }
        if (!File.Exists(input)) { Console.Error.WriteLine("No existeix l'audio: " + input); return 2; }

        string dir = Path.GetDirectoryName(Path.GetFullPath(input));
        string voicePath = Get(o, "voice", Path.Combine(dir, "voice.wav"));
        string musicPath = Get(o, "music", Path.Combine(dir, "music.wav"));
        string jsonPath = Get(o, "json", null);
        string templatePath = Get(o, "template", null);
        int threads = int.Parse(Get(o, "threads", "0"), CultureInfo.InvariantCulture);
        if (threads <= 0) threads = Environment.ProcessorCount;

        var swTotal = Stopwatch.StartNew();
        var sb = new StringBuilder();
        try
        {
            // ------------------------------------------------ configuracio ---
            var cfg = new OfflineSourceSeparationConfig();
            cfg.Model.Uvr.Model = model;
            cfg.Model.NumThreads = threads;
            cfg.Model.Provider = Get(o, "provider", "cpu");
            cfg.Model.Debug = 0;

            var sw = Stopwatch.StartNew();
            var sep = new OfflineSourceSeparation(cfg);
            double tLoad = sw.Elapsed.TotalSeconds;
            int nStems = sep.NumberOfStems;
            int sr = sep.OutputSampleRate;
            Log(sb, "model=" + Path.GetFileName(model));
            Log(sb, "stems=" + nStems + " sampleRate=" + sr + " threads=" + threads);
            Log(sb, "carrega=" + F(tLoad) + "s");

            // ---------------------------------------------------- lectura ---
            sw = Stopwatch.StartNew();
            MultiChannelWaveData wav = OfflineSourceSeparation.ReadWaveMultiChannel(input);
            float[][] ch = wav.GetChannels();
            int inSr = wav.SampleRate;
            int inCh = wav.NumChannels;
            int inN = wav.NumSamples;
            double tRead = sw.Elapsed.TotalSeconds;
            double durIn = inSr > 0 ? (double)inN / inSr : 0.0;
            Log(sb, "entrada=" + inCh + "ch " + inSr + "Hz " + F(durIn) + "s");

            // ------------------------------------------------ separacio -----
            sw = Stopwatch.StartNew();
            // ATENCIO: el 2n argument de Process es el SAMPLE RATE de l'audio
            // d'entrada (no el nombre de canals). sherpa fa la conversio a la
            // frequencia del model (44100 Hz) internament.
            SourceSeparationOutput outp = sep.Process(ch, inSr);
            double tProc = sw.Elapsed.TotalSeconds;
            double durOut = sr > 0 ? (double)outp.GetStemSamples(0)[0].Length / sr : 0.0;
            double rtf = durIn > 0 ? tProc / durIn : 0.0;
            Log(sb, "separacio=" + F(tProc) + "s (RTF " + F(rtf) + ")");

            // ------------------------------------------- ordre dels stems ---
            // Per defecte MDX-Net: stem 0 = veu, stem 1 = acompanyament.
            // Amb --template decidim per correlacio (el que mes s'hi assembla
            // es la musica, o siga la careta).
            float[][] stem0 = outp.GetStemSamples(0);
            float[][] stem1 = nStems > 1 ? outp.GetStemSamples(1) : null;
            int voiceIdx = 0, musicIdx = nStems > 1 ? 1 : -1;
            double corrTpl0 = double.NaN, corrTpl1 = double.NaN;
            if (templatePath != null && File.Exists(templatePath) && stem1 != null)
            {
                float[] tpl = LoadMono(templatePath, sr);
                corrTpl0 = Corr(Mono(stem0), tpl);
                corrTpl1 = Corr(Mono(stem1), tpl);
                if (Math.Abs(corrTpl1) > Math.Abs(corrTpl0)) { voiceIdx = 0; musicIdx = 1; }
                else { voiceIdx = 1; musicIdx = 0; }
                Log(sb, "plantilla: corr(stem0)=" + F(corrTpl0) + " corr(stem1)=" + F(corrTpl1)
                      + " -> veu=stem" + voiceIdx);
            }

            // --------------------------------------------------- escriptura --
            sw = Stopwatch.StartNew();
            outp.SaveStemToWaveFile(voiceIdx, voicePath);
            if (musicIdx >= 0) outp.SaveStemToWaveFile(musicIdx, musicPath);
            double tWrite = sw.Elapsed.TotalSeconds;
            Log(sb, "veu=" + voicePath);
            if (musicIdx >= 0) Log(sb, "musica=" + musicPath);

            // ----------------------------------------------------- metriques -
            float[] vMono = Mono(outp.GetStemSamples(voiceIdx));
            float[] mMono = (musicIdx >= 0) ? Mono(outp.GetStemSamples(musicIdx)) : null;
            float[] inMono = Mono(ch);
            double rmsIn = RmsDb(inMono);
            double rmsV = RmsDb(vMono);
            double rmsM = mMono != null ? RmsDb(mMono) : double.NaN;
            double corrVM = (mMono != null) ? Corr(vMono, mMono) : double.NaN;

            // Reconstruccio: veu + musica - mix (en dB relatiu al mix)
            double recon = double.NaN;
            if (mMono != null)
            {
                int n = Math.Min(inMono.Length, Math.Min(vMono.Length, mMono.Length));
                var diff = new float[n];
                for (int i = 0; i < n; i++) diff[i] = vMono[i] + mMono[i] - inMono[i];
                recon = RmsDb(diff) - rmsIn;
            }

            double bandIn = BandRmsDb(inMono, sr, 300.0, 3400.0);
            double bandV = BandRmsDb(vMono, sr, 300.0, 3400.0);
            double bandM = mMono != null ? BandRmsDb(mMono, sr, 300.0, 3400.0) : double.NaN;

            // Cua (per defecte 0 - 0.24 s): on no hi hauria d'haver veu
            double tailV = double.NaN, tailIn = double.NaN;
            string tailArg = Get(o, "tail", null);
            if (tailArg != null)
            {
                string[] p = tailArg.Split(',');
                double a = double.Parse(p[0], CultureInfo.InvariantCulture);
                double b = p.Length > 1 ? double.Parse(p[1], CultureInfo.InvariantCulture) : 0.24;
                tailIn = RmsDb(inMono, (int)(a * sr), (int)(b * sr));
                tailV = RmsDb(vMono, (int)(a * sr), (int)(b * sr));
            }

            outp.Dispose();
            sep.Dispose();
            swTotal.Stop();
            long peak = 0;
            try { peak = Process.GetCurrentProcess().PeakWorkingSet64; } catch { }

            // -------------------------------------------------------- JSON ---
            var j = new StringBuilder();
            j.Append("{\n");
            j.Append("  \"ok\": true,\n");
            j.Append("  \"model\": \"").Append(Esc(Path.GetFileName(model))).Append("\",\n");
            j.Append("  \"input\": \"").Append(Esc(Path.GetFullPath(input))).Append("\",\n");
            j.Append("  \"voice\": \"").Append(Esc(voicePath)).Append("\",\n");
            j.Append("  \"music\": \"").Append(Esc(musicPath)).Append("\",\n");
            j.Append("  \"stems\": ").Append(nStems).Append(",\n");
            j.Append("  \"voiceStem\": ").Append(voiceIdx).Append(",\n");
            j.Append("  \"sampleRate\": ").Append(sr).Append(",\n");
            j.Append("  \"inSampleRate\": ").Append(inSr).Append(",\n");
            j.Append("  \"inChannels\": ").Append(inCh).Append(",\n");
            j.Append("  \"durationIn\": ").Append(N(durIn)).Append(",\n");
            j.Append("  \"durationOut\": ").Append(N(durOut)).Append(",\n");
            j.Append("  \"threads\": ").Append(threads).Append(",\n");
            j.Append("  \"tLoad\": ").Append(N(tLoad)).Append(",\n");
            j.Append("  \"tRead\": ").Append(N(tRead)).Append(",\n");
            j.Append("  \"tProcess\": ").Append(N(tProc)).Append(",\n");
            j.Append("  \"tWrite\": ").Append(N(tWrite)).Append(",\n");
            j.Append("  \"tTotal\": ").Append(N(swTotal.Elapsed.TotalSeconds)).Append(",\n");
            j.Append("  \"rtf\": ").Append(N(rtf)).Append(",\n");
            j.Append("  \"peakRamMB\": ").Append(peak / (1024 * 1024)).Append(",\n");
            j.Append("  \"rmsInDb\": ").Append(N(rmsIn)).Append(",\n");
            j.Append("  \"rmsVoiceDb\": ").Append(N(rmsV)).Append(",\n");
            j.Append("  \"rmsMusicDb\": ").Append(N(rmsM)).Append(",\n");
            j.Append("  \"corrVoiceMusic\": ").Append(N(corrVM)).Append(",\n");
            j.Append("  \"corrTemplateStem0\": ").Append(N(corrTpl0)).Append(",\n");
            j.Append("  \"corrTemplateStem1\": ").Append(N(corrTpl1)).Append(",\n");
            j.Append("  \"reconDbRelMix\": ").Append(N(recon)).Append(",\n");
            j.Append("  \"bandInDb\": ").Append(N(bandIn)).Append(",\n");
            j.Append("  \"bandVoiceDb\": ").Append(N(bandV)).Append(",\n");
            j.Append("  \"bandMusicDb\": ").Append(N(bandM)).Append(",\n");
            j.Append("  \"bandVoiceVsInDb\": ").Append(N(bandV - bandIn)).Append(",\n");
            j.Append("  \"tailInDb\": ").Append(N(tailIn)).Append(",\n");
            j.Append("  \"tailVoiceDb\": ").Append(N(tailV)).Append("\n");
            j.Append("}\n");
            string json = j.ToString();

            if (jsonPath != null)
            {
                File.WriteAllText(jsonPath, json, new UTF8Encoding(false));
                Log(sb, "json=" + jsonPath);
            }
            Log(sb, "rms in/veu/musica dB=" + F(rmsIn) + "/" + F(rmsV) + "/" + F(rmsM)
                  + " bandaVeu-vs-in=" + F(bandV - bandIn) + " recon=" + F(recon)
                  + " cua=" + F(tailV) + " ram=" + (peak / (1024 * 1024)) + "MB");
            Console.WriteLine(json);
            Console.WriteLine(sb.ToString());
            WriteLog(o, sb.ToString());
            return 0;
        }
        catch (Exception ex)
        {
            string msg = "ERROR: " + ex.GetType().Name + ": " + ex.Message;
            Console.Error.WriteLine(msg);
            Console.Error.WriteLine(ex.StackTrace);
            sb.AppendLine(msg);
            WriteLog(o, sb.ToString());
            if (jsonPath != null)
            {
                try
                {
                    File.WriteAllText(jsonPath,
                        "{\n  \"ok\": false,\n  \"error\": \"" + Esc(ex.Message) + "\"\n}\n",
                        new UTF8Encoding(false));
                }
                catch { }
            }
            return 1;
        }
    }

    // -------------------------------------------------------------- utils ---
    private static string Usage()
    {
        return "A1Sep.exe --model <uvr.onnx> --in <mix.wav> [--voice <v.wav>] [--music <m.wav>]\n"
             + "          [--threads N] [--json <out.json>] [--template <careta.wav>]\n"
             + "          [--tail 0,0.24] [--provider cpu] [--log <log.txt>]";
    }

    private static Dictionary<string, string> ParseArgs(string[] args)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i];
            if (!a.StartsWith("--")) continue;
            string k = a.Substring(2);
            string v = "1";
            if (i + 1 < args.Length && !args[i + 1].StartsWith("--")) { v = args[++i]; }
            d[k] = v;
        }
        return d;
    }

    private static string Get(Dictionary<string, string> d, string k, string def)
    {
        string v;
        return d.TryGetValue(k, out v) ? v : def;
    }

    private static void Log(StringBuilder sb, string line)
    {
        sb.AppendLine(line);
        Console.Error.WriteLine(line);
    }

    private static void WriteLog(Dictionary<string, string> o, string text)
    {
        string p = Get(o, "log", null);
        if (p == null) return;
        try { File.WriteAllText(p, text, new UTF8Encoding(false)); } catch { }
    }

    private static string F(double v)
    {
        if (double.IsNaN(v)) return "nan";
        return v.ToString("0.000", CultureInfo.InvariantCulture);
    }

    private static string N(double v)
    {
        if (double.IsNaN(v) || double.IsInfinity(v)) return "null";
        return v.ToString("0.00000", CultureInfo.InvariantCulture);
    }

    private static string Esc(string s)
    {
        if (s == null) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
    }

    // ------------------------------------------------------------- senyal ---
    private static float[] Mono(float[][] ch)
    {
        if (ch == null || ch.Length == 0) return new float[0];
        if (ch.Length == 1) return ch[0];
        int n = ch[0].Length;
        var m = new float[n];
        for (int c = 0; c < ch.Length; c++)
        {
            float[] x = ch[c];
            int k = Math.Min(n, x.Length);
            for (int i = 0; i < k; i++) m[i] += x[i];
        }
        for (int i = 0; i < n; i++) m[i] /= ch.Length;
        return m;
    }

    private static float[] LoadMono(string path, int sr)
    {
        MultiChannelWaveData w = OfflineSourceSeparation.ReadWaveMultiChannel(path);
        float[] m = Mono(w.GetChannels());
        int wsr = w.SampleRate;
        w.Dispose();
        if (wsr != sr && sr > 0) m = ResampleLinear(m, wsr, sr);
        return m;
    }

    private static float[] ResampleLinear(float[] x, int from, int to)
    {
        if (from == to || from <= 0 || to <= 0 || x.Length == 0) return x;
        int n = (int)Math.Round((double)x.Length * to / from);
        var y = new float[n];
        double step = (double)from / to;
        for (int i = 0; i < n; i++)
        {
            double p = i * step;
            int i0 = (int)p;
            if (i0 >= x.Length) i0 = x.Length - 1;
            int i1 = Math.Min(i0 + 1, x.Length - 1);
            double f = p - i0;
            y[i] = (float)(x[i0] * (1.0 - f) + x[i1] * f);
        }
        return y;
    }

    private static double RmsDb(float[] x)
    {
        return RmsDb(x, 0, x == null ? 0 : x.Length);
    }

    private static double RmsDb(float[] x, int from, int to)
    {
        if (x == null || x.Length == 0) return double.NaN;
        if (from < 0) from = 0;
        if (to > x.Length) to = x.Length;
        if (to <= from) return double.NaN;
        double acc = 0;
        for (int i = from; i < to; i++) acc += (double)x[i] * x[i];
        double r = Math.Sqrt(acc / (to - from));
        return 20.0 * Math.Log10(r + 1e-12);
    }

    private static double Corr(float[] a, float[] b)
    {
        if (a == null || b == null) return double.NaN;
        int n = Math.Min(a.Length, b.Length);
        if (n < 16) return double.NaN;
        double sa = 0, sb = 0;
        for (int i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
        double ma = sa / n, mb = sb / n;
        double num = 0, da = 0, db = 0;
        for (int i = 0; i < n; i++)
        {
            double x = a[i] - ma, y = b[i] - mb;
            num += x * y; da += x * x; db += y * y;
        }
        if (da <= 1e-20 || db <= 1e-20) return 0.0;
        return num / Math.Sqrt(da * db);
    }

    // RMS en una banda amb dos biquads Butterworth (HP 2n + LP 2n) en cascada.
    private static double BandRmsDb(float[] x, int sr, double lo, double hi)
    {
        if (x == null || x.Length == 0 || sr <= 0) return double.NaN;
        float[] y = (float[])x.Clone();
        if (lo > 0) y = Biquad(y, sr, lo, true);
        if (hi > 0 && hi < sr * 0.49) y = Biquad(y, sr, hi, false);
        return RmsDb(y);
    }

    private static float[] Biquad(float[] x, int sr, double f0, bool highPass)
    {
        double w0 = 2.0 * Math.PI * f0 / sr;
        double cosw = Math.Cos(w0), sinw = Math.Sin(w0);
        double q = 0.7071067811865476;
        double alpha = sinw / (2.0 * q);
        double b0, b1, b2, a0, a1, a2;
        if (highPass) { b0 = (1 + cosw) / 2; b1 = -(1 + cosw); b2 = (1 + cosw) / 2; }
        else { b0 = (1 - cosw) / 2; b1 = 1 - cosw; b2 = (1 - cosw) / 2; }
        a0 = 1 + alpha; a1 = -2 * cosw; a2 = 1 - alpha;
        b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
        var y = new float[x.Length];
        double z1 = 0, z2 = 0;
        for (int i = 0; i < x.Length; i++)
        {
            double v = b0 * x[i] + z1;
            z1 = b1 * x[i] - a1 * v + z2;
            z2 = b2 * x[i] - a2 * v;
            y[i] = (float)v;
        }
        return y;
    }
}
