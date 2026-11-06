<#
.SYNOPSIS
    Compara DOS senyals A LA MOSTRA (estereo, sense reductors) i diu si son el
    MATEIX so, on cau el lag exacte i quant es cancela per finestres.

.DESCRIPTION
    Per a que servix (BUG #249): `corr_audio.ps1` treballa amb un embolcall de
    20 ms a 8 kHz i mono; aixi detecta BE si una plantilla apareix dins d'una
    mescla i a quin segon, pero NO pot dir si el que queda despres del tall es
    o no la CONTINUACIO de la plantilla, ni si el desajust es de mostres. Esta
    eina va al gra fi:

      1. ffmpeg decodifica els dos fitxers a float32 ESTEREO a `-Rate` (48 kHz
         per defecte), amb `-ss` DESPRES de `-i` (seek exacte, mostra a mostra).
      2. Es busca el TRANSITORI INICIAL de cada senyal (primer instant on dos
         marcs d'1 ms seguits passen el 10 % del pic). Eixa es l'ancora neta.
      3. S'hi alinea i es REFINA el lag a la mostra (Pearson sobre 2 s).
      4. Es mesura per finestres (`-WinSec`): r de Pearson, GUANY (minims
         quadrats), CANCEL.LACIO en dB de `mix - guany*ref` i NIVELL del mix en
         dBFS. Si la musica hi es, la cancel.lacio puja; si no hi es, es queda a
         ~0 dB. Ull: amb senyals molt baixes (per davall de -45 dBFS) la r pot
         pujar per soroll correlacionat, aixi que manen la cancel.lacio i el nivell.

    Motor: C# embegut (no toca `corr_core.cs`, que compartixen `corr_audio` i
    `cmp_audio`). Tot el que escriu per pantalla es ASCII a posta: els .ps1 del
    repo van sense BOM i Windows PowerShell 5.1 els llig com ANSI.

.PARAMETER Mix
    Fitxer on buscar (mp4/mov/wav). Es el senyal del timeline o el media.

.PARAMETER MixStart
    Segon del `Mix` on comenca el tros (per defecte 0).

.PARAMETER Dur
    Durada del tros del `Mix` (per defecte -1 = fins al final del fitxer).

.PARAMETER Ref
    Plantilla (wav). Si no es dona, s'usa `-RefDir`.

.PARAMETER RefDir
    Carpeta de plantilles (per defecte: `Audios` del projecte). Fa la busca
    CEGA de cada WAV i ordena els resultats per r.

.PARAMETER RefStart
    Segon de la plantilla per on comencar (per defecte 0). Es el `SkipRef` de
    `null_audio.ps1`.

.PARAMETER RefDur
    Durada de la plantilla (per defecte -1 = sencera). No es retalla amb `-Dur`
    perque aleshores els lags grans es quedarien sense solapament.

.PARAMETER MaxLagSec
    Marge de busca del lag, en segons (per defecte 0.5). Per davall de 2 ms va
    directe al refi fi; per damunt fa abans un escombrat grueix (pas 64 mostres).

.PARAMETER WinSec
    Amplaria de les finestres de mesura (per defecte 0.5 s).

.PARAMETER Json
    Fitxer on desar el resultat ({ ok, rate, results:[...] }).

.EXAMPLE
    # control positiu: la plantilla on se sap que sona
    bin\cmp_samples.ps1 -Mix "\\NAS\TNV_V4_CLIP.mp4" -MixStart 17.0756 -Dur 4.7 -Ref Audios\3CatInfo_TN_tornada_publi_.WAV -RefStart 0

.EXAMPLE
    # la cua: el tros de plantilla que ja no casa
    bin\cmp_samples.ps1 -Mix "\\NAS\TNV_V4_CLIP.mp4" -MixStart 21.92 -Dur 7 -Ref Audios\3CatInfo_TN_tornada_publi_.WAV -RefStart 4.84

.EXAMPLE
    # busca cega de les 8 plantilles dins del clip sencer
    bin\cmp_samples.ps1 -Mix "\\NAS\TNV_V4_CLIP.mp4" -MixStart 21.92 -Dur 17 -RefDir Audios -MaxLagSec 3
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Mix,
    [double] $MixStart  = 0,
    [double] $Dur       = -1,
    [string] $Ref       = '',
    [string] $RefDir    = '',
    [double] $RefStart  = 0,
    [double] $RefDur    = -1,
    [int]    $Rate      = 48000,
    [double] $MaxLagSec = 0.5,
    [double] $WinSec    = 0.5,
    [string] $Json      = ''
)


# ---------------------------------------------------------------- motor C# ---
if (-not ('SampleMatch' -as [type])) {
    Add-Type -TypeDefinition @'
using System;

public static class SampleMatch
{
    public const int MIN_OVERLAP = 480;

    // Canal d'un buffer interleaved (f32le estereo -> vector del canal)
    public static float[] Channel(float[] inter, int ch, int nch)
    {
        int n = inter.Length / nch;
        float[] o = new float[n];
        for (int i = 0; i < n; i++) o[i] = inter[i * nch + ch];
        return o;
    }

    // Embolcall: maxim de |x| per cada `perFrame` mostres
    public static double[] Env(float[] x, int perFrame)
    {
        int nf = x.Length / perFrame;
        double[] e = new double[nf];
        for (int f = 0; f < nf; f++)
        {
            double m = 0;
            int i0 = f * perFrame;
            for (int i = i0; i < i0 + perFrame; i++)
            {
                double v = x[i];
                if (v < 0) v = -v;
                if (v > m) m = v;
            }
            e[f] = m;
        }
        return e;
    }

    // Transitori inicial: primer marc on eixe marc i el seguent passen `frac` del pic
    public static int FirstTransient(float[] x, int perFrame, double frac)
    {
        double[] e = Env(x, perFrame);
        double mx = 0;
        for (int i = 0; i < e.Length; i++) if (e[i] > mx) mx = e[i];
        if (mx <= 0) return -1;
        for (int i = 0; i + 1 < e.Length; i++)
            if (e[i] > frac * mx && e[i + 1] > frac * mx) return i * perFrame;
        return -1;
    }

    // Pearson sobre el solapament amb `lag` (a[i] <-> b[i-lag]); limitLen=0 -> tot
    public static double PearsonLag(float[] a, float[] b, int lag, int limitLen)
    {
        int i0 = lag > 0 ? lag : 0;
        int i1 = a.Length;
        int bEnd = b.Length + lag;
        if (bEnd < i1) i1 = bEnd;
        if (limitLen > 0 && i0 + limitLen < i1) i1 = i0 + limitLen;
        int n = i1 - i0;
        if (n < MIN_OVERLAP) return double.NaN;
        double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
        for (int i = i0; i < i1; i++)
        {
            double x = a[i], y = b[i - lag];
            sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
        }
        double va = saa - sa * sa / n;
        double vb = sbb - sb * sb / n;
        if (va <= 0 || vb <= 0) return double.NaN;
        return (sab - sa * sb / n) / Math.Sqrt(va * vb);
    }

    // Millor lag a la mostra al voltant de lag0
    public static int Refine(float[] a, float[] b, int lag0, int half, int probeLen, out double r)
    {
        int best = lag0;
        r = double.NaN;
        double bestR = -2;
        for (int L = lag0 - half; L <= lag0 + half; L++)
        {
            double v = PearsonLag(a, b, L, probeLen);
            if (double.IsNaN(v)) continue;
            if (v > bestR) { bestR = v; best = L; r = v; }
        }
        return best;
    }

    // Busca cega del lag: escombrat amb pas `step` i despres refi fi al voltant
    public static int BestLag(float[] a, float[] b, int maxSamples, int step, int probeLen, out double r)
    {
        int best = 0;
        double bestR = -2;
        r = double.NaN;
        for (int L = -maxSamples; L <= maxSamples; L += step)
        {
            double v = PearsonLag(a, b, L, probeLen);
            if (double.IsNaN(v)) continue;
            if (v > bestR) { bestR = v; best = L; }
        }
        return Refine(a, b, best, step, probeLen, out r);
    }

    // Finestres: [i0, n, r, guany, cancelDb] x N (5 camps per finestra)
    public static double[] Windows(float[] a, float[] b, int lag, int win)
    {
        int i0 = lag > 0 ? lag : 0;
        int i1 = a.Length;
        int bEnd = b.Length + lag;
        if (bEnd < i1) i1 = bEnd;
        int total = i1 - i0;
        if (total < MIN_OVERLAP) return new double[0];
        int nw = total / win;
        double[] o = new double[nw * 6];
        for (int w = 0; w < nw; w++)
        {
            int s = i0 + w * win;
            int e = s + win;
            double sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
            for (int i = s; i < e; i++)
            {
                double x = a[i], y = b[i - lag];
                sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
            }
            double n = e - s;
            double cov = sab - sa * sb / n;
            double va = saa - sa * sa / n;
            double vb = sbb - sb * sb / n;
            double rr = (va > 0 && vb > 0) ? cov / Math.Sqrt(va * vb) : double.NaN;
            double g = vb > 0 ? cov / vb : 0;
            double res = 0;
            for (int i = s; i < e; i++)
            {
                double d = a[i] - g * b[i - lag];
                res += d * d;
            }
            double db = (res > 0 && va > 0) ? 10 * Math.Log10(va / res) : 0;
            double lev = saa / n > 0 ? 10 * Math.Log10(saa / n) : -120;
            o[w * 6 + 0] = s;      // index de mostra dins `a`
            o[w * 6 + 1] = n;
            o[w * 6 + 2] = rr;
            o[w * 6 + 3] = g;
            o[w * 6 + 4] = db;
            o[w * 6 + 5] = lev;    // nivell del mix en dBFS (mitjana quadratica)
        }
        return o;
    }
}
'@
}

$ErrorActionPreference = 'Stop'
$binDir = $PSScriptRoot
$root   = Split-Path -Parent $binDir
$ffmpeg = Join-Path $binDir 'ffmpeg\bin\ffmpeg.exe'
if (-not (Test-Path -LiteralPath $ffmpeg)) { throw "No trobe $ffmpeg" }
if (-not $Ref -and -not $RefDir) { throw 'Cal -Ref o -RefDir' }
if ($Ref) { $RefDir = '' }


# ------------------------------------------------------------------ helpers ---
$tmp = Join-Path $env:TEMP ('fp_cmp_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
[void](New-Item -ItemType Directory -Path $tmp -Force)
$inv = [System.Globalization.CultureInfo]::InvariantCulture

function Get-PcmStereo {
    param([string]$Path, [double]$Start, [double]$Seconds, [string]$Out)
    $arg = @('-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', $Path, '-ss', $Start.ToString($inv))
    if ($Seconds -gt 0) { $arg += @('-t', $Seconds.ToString($inv)) }
    $arg += @('-vn', '-ac', '2', '-ar', "$Rate", '-f', 'f32le', $Out)
    # ffmpeg escriu a stderr: amb ErrorActionPreference=Stop aixo seria un error
    # terminant (NativeCommandError). Es baixa a Continue mentre dura la crida.
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $log = & $ffmpeg @arg 2>&1
    $rc = $LASTEXITCODE
    $ErrorActionPreference = $eap
    if ($rc -ne 0) { throw ('ffmpeg KO: ' + (($log | Select-Object -Last 3) -join ' ')) }
    $bytes = [System.IO.File]::ReadAllBytes($Out)
    $n = [int][Math]::Floor($bytes.Length / 4)
    $smp = New-Object 'single[]' $n
    [System.Buffer]::BlockCopy($bytes, 0, $smp, 0, $n * 4)
    return $smp
}

function Invoke-Cmp {
    param([string]$RefPath)
    $mixPcm = Get-PcmStereo -Path $Mix -Start $MixStart -Seconds $Dur -Out (Join-Path $tmp 'mix.f32')
    # La plantilla es decodifica SENCERA per defecte: si es retallara amb `-Dur`
    # no es podrien buscar lags grans (el solapament s'acabaria).
    $refPcm = Get-PcmStereo -Path $RefPath -Start $RefStart -Seconds $RefDur -Out (Join-Path $tmp 'ref.f32')

    $perFrame = [int][Math]::Max(1, [Math]::Round($Rate / 1000))   # 1 ms
    $half     = [int][Math]::Round($MaxLagSec * $Rate)
    $probe    = [int][Math]::Min(2.0 * $Rate, [Math]::Floor($refPcm.Length / 2) - 2)
    if ($probe -lt 480) { $probe = 0 }
    $win      = [int][Math]::Max(480, [Math]::Round($WinSec * $Rate))

    $chans = @()
    for ($ch = 0; $ch -lt 2; $ch++) {
        $a = [SampleMatch]::Channel($mixPcm, $ch, 2)
        $b = [SampleMatch]::Channel($refPcm, $ch, 2)
        $trA = [SampleMatch]::FirstTransient($a, $perFrame, 0.10)
        $trB = [SampleMatch]::FirstTransient($b, $perFrame, 0.10)
        $lag0 = if ($trA -ge 0 -and $trB -ge 0) { $trA - $trB } else { 0 }
        $r = [double]::NaN
        if ($half -gt 0 -and $probe -gt 0) {
            if ($half -gt 96) {
                # Busca ampla: escombrat grueix (pas 64 mostres, sonda curta) i
                # despres refi a la mostra. Sense aixo un marge de segons seria
                # O(lags x sonda) i no acabaria mai.
                $stepC = 64
                $probeC = [int][Math]::Min([Math]::Round(0.25 * $Rate), $probe)
                $rC = [double]::NaN
                $lagC = [SampleMatch]::BestLag($a, $b, $half, $stepC, $probeC, [ref]$rC)
                $lag = [SampleMatch]::Refine($a, $b, $lagC, $stepC, $probe, [ref]$r)
            } else {
                $lag = [SampleMatch]::Refine($a, $b, $lag0, $half, $probe, [ref]$r)
            }
        } else {
            $lag = $lag0
            $r = [SampleMatch]::PearsonLag($a, $b, $lag, $probe)
        }
        $ws = [SampleMatch]::Windows($a, $b, $lag, $win)
        $rows = @()
        for ($i = 0; $i -lt $ws.Length; $i += 6) {
            $rows += [pscustomobject]@{
                sec  = [Math]::Round($ws[$i] / $Rate, 2)
                r    = $ws[$i + 2]
                gain = [Math]::Round($ws[$i + 3], 4)
                db   = [Math]::Round($ws[$i + 4], 1)
                lev  = [Math]::Round($ws[$i + 5], 1)
            }
        }
        $chans += [pscustomobject]@{
            ch         = $(if ($ch -eq 0) { 'L' } else { 'R' })
            trMixMs    = [Math]::Round(1000 * $trA / $Rate, 1)
            trRefMs    = [Math]::Round(1000 * $trB / $Rate, 1)
            lagSamples = $lag
            lagMs      = [Math]::Round(1000 * $lag / $Rate, 3)
            r          = $r
            rows       = $rows
        }
    }

    $nom = Split-Path -Leaf $RefPath
    Write-Host ''
    Write-Host ("== $nom  (plantilla des de " + $RefStart.ToString('0.###') + ' s) ==')
    foreach ($c in $chans) {
        $rt = if ([double]::IsNaN($c.r)) { 'n/a' } else { $c.r.ToString('N4') }
        Write-Host ("  canal {0}: transitori mix {1} ms / plantilla {2} ms -> lag {3} mostres ({4} ms) | r={5}" -f `
            $c.ch, $c.trMixMs, $c.trRefMs, $c.lagSamples, $c.lagMs, $rt)
        foreach ($row in $c.rows) {
            $rs = if ([double]::IsNaN($row.r)) { '  n/a' } else { '{0,6:N3}' -f $row.r }
            Write-Host ("    {0,7:N2} s | r={1} | guany={2,7:N4} | cancel={3,6:N1} dB | mix={4,6:N1} dBFS" -f $row.sec, $rs, $row.gain, $row.db, $row.lev)
        }
    }
    return $chans
}

# ---------------------------------------------------------------- execucio ----

Write-Host ("cmp_samples | {0} Hz estereo | finestres {1} s | marge lag +/-{2} s" -f $Rate, $WinSec, $MaxLagSec)
$durTxt = if ($Dur -gt 0) { "$Dur s" } else { 'fins al final' }
Write-Host ("MIX: {0}  (des de {1} s, {2})" -f $Mix, $MixStart, $durTxt)
Write-Host ("REF: {0}" -f $(if ($Ref) { $Ref } else { $RefDir }))

$result = @()
if ($Ref) {
    $refFull = if ([System.IO.Path]::IsPathRooted($Ref)) { $Ref } else { Join-Path $root $Ref }
    $result += [pscustomobject]@{ ref = (Split-Path -Leaf $refFull); channels = (Invoke-Cmp -RefPath $refFull) }
} else {
    $dirFull = if ([System.IO.Path]::IsPathRooted($RefDir)) { $RefDir } else { Join-Path $root $RefDir }
    $wavs = @(Get-ChildItem -LiteralPath $dirFull -Filter '*.WAV' | Sort-Object Name)
    if ($wavs.Count -eq 0) { throw "Cap WAV a $dirFull" }
    foreach ($w in $wavs) {
        $result += [pscustomobject]@{ ref = $w.Name; channels = (Invoke-Cmp -RefPath $w.FullName) }
    }
}

# Ressenya: el millor r de cada plantilla (per a ordenar la busca cega)
Write-Host ''
Write-Host '== RESSENYA (millor r per plantilla) =='
$rank = foreach ($res in $result) {
    $vals = @($res.channels | ForEach-Object { $_.r } | Where-Object { -not [double]::IsNaN($_) })
    $bestR = if ($vals.Count -gt 0) { ($vals | Measure-Object -Maximum).Maximum } else { $null }
    [pscustomobject]@{ ref = $res.ref; r = $bestR }
}
$rank | Sort-Object -Property r -Descending | ForEach-Object {
    $rt = if ($null -eq $_.r) { 'n/a' } else { $_.r.ToString('N4') }
    Write-Host ("  {0,-36} r={1}" -f $_.ref, $rt)
}

if ($Json) {
    $payload = [pscustomobject]@{
        ok = $true; rate = $Rate; mix = $Mix; mixStart = $MixStart; dur = $Dur
        refStart = $RefStart; winSec = $WinSec; maxLagSec = $MaxLagSec
        results = $result
    }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Json, ($payload | ConvertTo-Json -Depth 6), $enc)
    Write-Host ("JSON -> " + $Json)
}

Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
