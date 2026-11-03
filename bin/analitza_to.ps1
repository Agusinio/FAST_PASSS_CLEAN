<#
.SYNOPSIS
    Analisi de FREQUENCIA (to) de dos audios: pics espectrals, afinacio, croma i
    el factor de velocitat k que millor els alinea. Despres, el tempo de cada un.

.DESCRIPTION
    Eina de laboratori de l'F0 de la spec docs/specs/OPCIONS_A1_I_ECHO_OFF.md
    (seccio 1.3-septies). No toca el panell ni js/.

    PER QUE: si la musica d'un clip fos la mateixa gravacio reproduida amb un
    rellotge distint, tots els pics espectrals coincidirien multiplicats pel
    MATEIX factor k (l'error classic 44,1 <-> 48 dona k = 1.0884 = +147 cents) i
    l'afinacio eixiria desviada. Si eix k = 1.000 i l'afinacio coincideix, la
    desviacio de velocitat queda descartada i el problema es de CONTINGUT.

    MESURA: FFT real 4096 punts (Cooley-Tukey iteratiu), audio a 8 kHz mono,
    finestra Hann, N finestres de 0.512 s repartides pel tram -> espectre mitja.
    Pics amb interpolacio parabolica. Banda util de pics: 60-2000 Hz.

    AVIS: ni els pics ni el croma no distingixen sons distints de la mateixa
    casa (tots van en el mateix to, La = 440), aixi que NO son una prova
    d'identitat. Per a aixo mana bin\cmp_audio.ps1 (correlacio d'ona). La unica
    mesura que depen del contingut es el TEMPO (autocorrelacio d'atacs).

.PARAMETER FitxerA
    Primer audio (qualsevol cosa que llig ffmpeg: mp4, wav, mxf...).

.PARAMETER DesA
    Segon on comenca el tram a analitzar (0 = des del principi).

.PARAMETER DurA
    Duracio del tram en segons. El mateix per a FitxerB (DesB, DurB).

.EXAMPLE
    .\analitza_to.ps1 -FitxerA clip.mp4 -DesA 13.32 -DurA 7 -FitxerB Audios\3CATINFO_CARETA_20.WAV -DurB 7

    Compara la finestra de careta del clip amb la plantilla: dona k, afinacio
    i pics de cada un.
#>
param(
    [Parameter(Mandatory = $true)][string] $FitxerA,
    [double] $DesA = 0,
    [double] $DurA = 7,
    [Parameter(Mandatory = $true)][string] $FitxerB,
    [double] $DesB = 0,
    [double] $DurB = 7,
    [int]    $Nfft  = 4096,
    [int]    $Rate  = 8000,
    [int]    $NWin  = 12,
    [int]    $TopP  = 12,
    [string] $EtqA  = 'A',
    [string] $EtqB  = 'B'
)

$ErrorActionPreference = 'Stop'
$binDir = $PSScriptRoot
$ffmpeg = Join-Path $binDir 'ffmpeg\bin\ffmpeg.exe'
if (-not (Test-Path -LiteralPath $ffmpeg)) { throw "No trobe $ffmpeg" }
$work = Join-Path $env:TEMP 'fp_analitza_to'
if (-not (Test-Path -LiteralPath $work)) { New-Item -ItemType Directory -Path $work | Out-Null }

function Get-RawF32 {
    param([string] $Path)
    $b = [IO.File]::ReadAllBytes($Path)
    $n = [int]($b.Length / 4)
    $s = New-Object float[] $n
    [Buffer]::BlockCopy($b, 0, $s, 0, $n * 4)
    return ,$s
}

# Descodifica un tram a mono f32 a $Rate Hz i el deixa a $work
function Get-Tram {
    param([string] $File, [double] $From, [double] $Dur, [string] $Tag, [int] $LoHz)
    $raw = Join-Path $work ("tr_" + $Tag + ".raw")
    $pre = @()
    if ($From -gt 0) { $pre = @('-ss', $From) }
    $af = "highpass=f=$LoHz,lowpass=f=3000"
    & $ffmpeg -v error -y @pre -t $Dur -i $File -vn -ac 1 -ar $Rate -af $af -f f32le $raw
    if (-not (Test-Path -LiteralPath $raw)) { throw "ffmpeg no ha escrit $raw" }
    return ,(Get-RawF32 $raw)
}

# Cooley-Tukey iteratiu, in place
function Invoke-Fft {
    param([double[]] $Re, [double[]] $Im)
    $n = $Re.Length
    $j = 0
    for ($i = 1; $i -lt $n; $i++) {
        $bit = $n -shr 1
        while ($j -band $bit) { $j = $j -bxor $bit; $bit = $bit -shr 1 }
        $j = $j -bxor $bit
        if ($i -lt $j) {
            $tr = $Re[$i]; $Re[$i] = $Re[$j]; $Re[$j] = $tr
            $ti = $Im[$i]; $Im[$i] = $Im[$j]; $Im[$j] = $ti
        }
    }
    for ($len = 2; $len -le $n; $len = $len -shl 1) {
        $ang = -2.0 * [Math]::PI / $len
        $wr = [Math]::Cos($ang); $wi = [Math]::Sin($ang)
        $half = $len -shr 1
        for ($i0 = 0; $i0 -lt $n; $i0 += $len) {
            $cr = 1.0; $ci = 0.0
            for ($q = 0; $q -lt $half; $q++) {
                $p0 = $i0 + $q; $p1 = $p0 + $half
                $tr = $cr * $Re[$p1] - $ci * $Im[$p1]
                $ti = $cr * $Im[$p1] + $ci * $Re[$p1]
                $Re[$p1] = $Re[$p0] - $tr; $Im[$p1] = $Im[$p0] - $ti
                $Re[$p0] = $Re[$p0] + $tr; $Im[$p0] = $Im[$p0] + $ti
                $nr = $cr * $wr - $ci * $wi
                $ci = $cr * $wi + $ci * $wr
                $cr = $nr
            }
        }
    }
}

# Espectre mitja + perfil de croma (12 classes de to) d'un tram
function Get-Espectre {
    param([string] $File, [double] $From, [double] $Dur, [string] $Tag, [int] $LoHz)
    $s = Get-Tram $File $From $Dur $Tag $LoHz
    $n = $s.Length
    $binHz = [double]$Rate / $Nfft
    $half = [int]($Nfft / 2)
    $spec = New-Object double[] $half
    $chroma = New-Object double[] 12
    $used = 0
    $hop = [int][Math]::Max($Nfft, [Math]::Floor(($n - $Nfft) / [Math]::Max(1, ($NWin - 1))))
    $w = New-Object double[] $Nfft
    for ($i = 0; $i -lt $Nfft; $i++) { $w[$i] = 0.5 - 0.5 * [Math]::Cos(2.0 * [Math]::PI * $i / ($Nfft - 1)) }
    $o = 0
    while ((($o + $Nfft) -le $n) -and ($used -lt $NWin)) {
        $re = New-Object double[] $Nfft
        $im = New-Object double[] $Nfft
        $rms = 0.0
        for ($i = 0; $i -lt $Nfft; $i++) { $v = $s[$o + $i]; $re[$i] = $v * $w[$i]; $rms += $v * $v }
        $rms = [Math]::Sqrt($rms / $Nfft)
        if ($rms -gt 1e-4) {
            Invoke-Fft $re $im
            $v = New-Object double[] 12
            for ($b = 15; $b -lt $half; $b++) {
                $m = [Math]::Sqrt($re[$b] * $re[$b] + $im[$b] * $im[$b])
                $spec[$b] += $m
                $f = $b * $binHz
                if (($f -ge 70) -and ($f -le 2000)) {
                    $pc = [int][Math]::Round(12.0 * [Math]::Log($f / 440.0, 2)) % 12
                    if ($pc -lt 0) { $pc += 12 }
                    $v[$pc] += $m
                }
            }
            $sq = 0.0
            for ($pc = 0; $pc -lt 12; $pc++) { $sq += $v[$pc] * $v[$pc] }
            $nrm = [Math]::Sqrt($sq)
            if ($nrm -gt 1e-6) { for ($pc = 0; $pc -lt 12; $pc++) { $chroma[$pc] += $v[$pc] / $nrm } }
            $used++
        }
        $o += $hop
    }
    for ($b = 0; $b -lt $half; $b++) { $spec[$b] = $spec[$b] / [Math]::Max(1, $used) }
    $sq = 0.0
    for ($pc = 0; $pc -lt 12; $pc++) { $sq += $chroma[$pc] * $chroma[$pc] }
    $nrm = [Math]::Sqrt($sq)
    if ($nrm -gt 1e-6) { for ($pc = 0; $pc -lt 12; $pc++) { $chroma[$pc] = $chroma[$pc] / $nrm } }
    return @{ Spec = $spec; Chroma = $chroma; Used = $used; Bin = $binHz }
}

# Pics locals de l'espectre mitja amb interpolacio parabolica (sub-bin)
function Get-Pics {
    param($Res, [int] $Top)
    $sp = $Res.Spec
    $half = $sp.Length
    $binHz = $Res.Bin
    $maxB = [Math]::Min($half - 2, [int](2000 / $binHz))
    $mx = 0.0
    for ($b = 15; $b -lt $maxB; $b++) { if ($sp[$b] -gt $mx) { $mx = $sp[$b] } }
    $ll = @()
    for ($b = 16; $b -lt $maxB; $b++) {
        if (($sp[$b] -gt 0.02 * $mx) -and ($sp[$b] -gt $sp[$b - 2]) -and ($sp[$b] -gt $sp[$b + 2]) -and
            ($sp[$b] -ge $sp[$b - 1]) -and ($sp[$b] -ge $sp[$b + 1])) {
            $den = $sp[$b - 1] - 2 * $sp[$b] + $sp[$b + 1]
            $dd = 0.0
            if ([Math]::Abs($den) -gt 1e-12) { $dd = 0.5 * ($sp[$b - 1] - $sp[$b + 1]) / $den }
            if ($dd -gt 0.5) { $dd = 0.5 }
            if ($dd -lt -0.5) { $dd = -0.5 }
            $ll += [pscustomobject]@{ F = ($b + $dd) * $binHz; M = $sp[$b] }
        }
    }
    return @($ll | Sort-Object M -Descending | Select-Object -First $Top)
}

function Get-Cents { param([double] $F) return 1200.0 * [Math]::Log($F / 440.0, 2) }

function Get-Nota {
    param([double] $F)
    $noms = @('La', 'La#', 'Si', 'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#')
    $m = [int][Math]::Round(12.0 * [Math]::Log($F / 440.0, 2))
    $pc = ((($m % 12) + 12) % 12)
    return $noms[$pc]
}

# Desviacio mitjana (mitjana circular) respecte de La = 440, en cents
function Measure-Afinacio {
    param($Pics)
    $sm = 0.0; $sn = 0.0
    $mx = ($Pics | Measure-Object M -Maximum).Maximum
    foreach ($p in $Pics) {
        if ($p.M -lt 0.15 * $mx) { continue }
        $c = (Get-Cents $p.F) % 100.0
        $an = $c * 2.0 * [Math]::PI / 100.0
        $sm += [Math]::Sin($an); $sn += [Math]::Cos($an)
    }
    return 100.0 * [Math]::Atan2($sm, $sn) / (2.0 * [Math]::PI)
}


# Tempo per autocorrelacio de l'envolupant d'atacs (20 ms). r baix = sense pols.
# Depen del CONTINGUT (a diferencia dels pics i del croma): dos talls distints de
# la mateixa casa donen BPM distints o r ~ 0.07.
function Measure-Tempo {
    param([string] $File, [double] $From, [double] $Dur, [string] $Tag)
    $s = Get-Tram $File $From $Dur $Tag 70
    $hop = [int]($Rate * 0.02)
    $m = [int][Math]::Floor($s.Length / $hop)
    $env1 = New-Object double[] $m
    for ($i = 0; $i -lt $m; $i++) {
        $e = 0.0
        for ($k = 0; $k -lt $hop; $k++) { $v = $s[$i * $hop + $k]; $e += $v * $v }
        $env1[$i] = [Math]::Sqrt($e / $hop)
    }
    $oc = New-Object double[] $m
    $w = 100
    for ($i = 0; $i -lt $m; $i++) {
        $d = 0.0
        if ($i -gt 0) { $d = $env1[$i] - $env1[$i - 1] }
        if ($d -lt 0) { $d = 0.0 }
        $a = [Math]::Max(0, $i - $w); $z = [Math]::Min($m - 1, $i + $w); $sm = 0.0
        for ($k = $a; $k -le $z; $k++) {
            $dk = 0.0
            if ($k -gt 0) { $dk = $env1[$k] - $env1[$k - 1] }
            if ($dk -lt 0) { $dk = 0.0 }
            $sm += $dk
        }
        $oc[$i] = $d - ($sm / ($z - $a + 1))
    }
    $res = @()
    $lmin = [int](0.25 * 50); $lmax = [int](1.20 * 50)
    for ($lag = $lmin; $lag -le $lmax; $lag++) {
        $sc = 0.0; $e1 = 0.0; $e2 = 0.0
        for ($i = 0; $i -lt ($m - $lag); $i++) {
            $sc += $oc[$i] * $oc[$i + $lag]
            $e1 += $oc[$i] * $oc[$i]
            $e2 += $oc[$i + $lag] * $oc[$i + $lag]
        }
        $den = [Math]::Sqrt($e1 * $e2)
        $r = 0.0
        if ($den -gt 1e-12) { $r = $sc / $den }
        $res += [pscustomobject]@{ Bpm = (60.0 / ($lag * 0.02)); R = $r }
    }
    return @($res | Sort-Object R -Descending | Select-Object -First 3)
}

# ---------------------------------------------------------------- informe ----
$A = Get-Espectre $FitxerA $DesA $DurA 'A' 70
$B = Get-Espectre $FitxerB $DesB $DurB 'B' 70
$pa = Get-Pics $A $TopP
$pb = Get-Pics $B $TopP

"$EtqA : $([IO.Path]::GetFileName($FitxerA))  [$DesA s + $DurA s]  $($A.Used) finestres"
"$EtqB : $([IO.Path]::GetFileName($FitxerB))  [$DesB s + $DurB s]  $($B.Used) finestres"
''
'{0,4} {1,9} {2,4} {3,8}    |    {4,4} {5,9} {6,4} {7,8}' -f '#', 'Hz', 'nota', 'cents', '#', 'Hz', 'nota', 'cents'
'----+---------+----+--------+----+---------+----+--------'
for ($i = 0; $i -lt [Math]::Max($pa.Count, $pb.Count); $i++) {
    $x = ''; $y = ''
    if ($i -lt $pa.Count) { $x = '{0,4} {1,9:N1} {2,4} {3,8:N1}' -f ($i + 1), $pa[$i].F, (Get-Nota $pa[$i].F), (Get-Cents $pa[$i].F) }
    if ($i -lt $pb.Count) { $y = '{0,4} {1,9:N1} {2,4} {3,8:N1}' -f ($i + 1), $pb[$i].F, (Get-Nota $pb[$i].F), (Get-Cents $pb[$i].F) }
    '{0,-38}  |  {1}' -f $x, $y
}
''
'AFINACIO (respecte de La = 440):'
'  {0,-10} {1,7:N1} cents' -f $EtqA, (Measure-Afinacio $pa)
'  {0,-10} {1,7:N1} cents' -f $EtqB, (Measure-Afinacio $pb)
''
'FACTOR k QUE ALINEA ELS PICS (0.90 - 1.10):'
$best = 0; $bk = 1.0; $bp = @()
$kk = 0.90
while ($kk -le 1.1001) {
    $cnt = 0; $pr = @()
    foreach ($x in $pa) {
        foreach ($y in $pb) {
            if ([Math]::Abs($y.F - $kk * $x.F) / ($kk * $x.F) -lt 0.004) {
                $cnt++
                if ($pr.Count -lt 8) { $pr += ('{0:N1}->{1:N1}' -f $x.F, $y.F) }
            }
        }
    }
    if ($cnt -gt $best) { $best = $cnt; $bk = $kk; $bp = $pr }
    $kk = $kk + 0.002
}
'  k = {0:N3}   {1} parells alineats (de {2}x{3})' -f $bk, $best, $pa.Count, $pb.Count
'  ' + ($bp -join ', ')
'  (k ~ 1.000 = mateixa velocitat; k = 1.0884 = error 44,1<->48)'
''
'CROMA (12 classes de to; cosinus):'
$dp = 0.0
for ($i = 0; $i -lt 12; $i++) { $dp += $A.Chroma[$i] * $B.Chroma[$i] }
'  {0,-4} {1}' -f '', ((1..12 | ForEach-Object { $_.ToString().PadLeft(5) }) -join '')
'  {0,-4} {1}' -f $EtqA, (($A.Chroma | ForEach-Object { $_.ToString('N3').PadLeft(5) }) -join '')
'  {0,-4} {1}' -f $EtqB, (($B.Chroma | ForEach-Object { $_.ToString('N3').PadLeft(5) }) -join '')
'  cosinus = {0:N3}' -f $dp
''
'TEMPO (autocorrelacio d''atacs, 50-240 BPM) -- aixo si depen del contingut:'
foreach ($p in @(@($EtqA, $FitxerA, $DesA, $DurA), @($EtqB, $FitxerB, $DesB, $DurB))) {
    $t = Measure-Tempo $p[1] $p[2] $p[3] ('t' + $p[0])
    '  {0,-10} {1,7:N2} BPM  (r={2:N3})  [2n: {3:N2}, 3r: {4:N2}]' -f $p[0], $t[0].Bpm, $t[0].R, $t[1].Bpm, $t[2].Bpm
}
'  (r < 0.15 = sense pols mesurable: la musica no te ritme o no es la materia)'

