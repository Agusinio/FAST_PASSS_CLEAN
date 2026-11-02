<#
.SYNOPSIS
    Compara els WAV d'una carpeta i diu quins són EL MATEIX SO encara que el
    nom siga diferent (retallats, amb silenci de més o desplaçats).

.DESCRIPTION
    Comparar fitxers per hash només detecta duplicats EXACTES. Ací el que
    interessa és el cas de «careta.wav» i «careta_v2.wav» amb 120 ms de cua de
    silenci, o un molinet amb una segona menys.

    Mètode (barat i robust, sense dependències):
      1. ffmpeg decodifica a mono 8 kHz float32 (l'alineació temporal no depén
         de l'estèreo ni del bit depth).
      2. Embolcall RMS per finestres de 20 ms: descriu «com sona» i no depén de
         la fase ni del nivell absolut.
      3. Per a cada parell es busca el desplaçament (lag) que maximitza la
         correlació de Pearson de l'embolcall (±3 s).
      4. Es retorna la millor correlació, el lag i la cobertura. Si
         corr >= -Threshold es considera el mateix so (1.0 = idèntic).

.PARAMETER Path
    Carpeta (o llista de fitxers) a comparar. Per defecte: Audios del projecte.

.PARAMETER Pattern
    Filtre de fitxers. Per defecte: *.WAV

.PARAMETER Threshold
    Correlació mínima per a considerar «mateix so». Per defecte: 0.90

.EXAMPLE
    bin\cmp_audio.ps1
    bin\cmp_audio.ps1 -Threshold 0.8 -KeepRaw
#>
[CmdletBinding()]
param(
    [string] $Path      = '',
    [string] $Pattern   = '*.WAV',
    [double] $Threshold = 0.90,
    [int]    $HopMs     = 20,
    [double] $MaxLagSec = 3.0,
    [switch] $KeepRaw
)

$ErrorActionPreference = 'Stop'
# $PSScriptRoot no està disponible dins d'un `param(...)` en Windows PowerShell 5.1,
# així que les rutes es resolen al cos (mateix patró que check_all.ps1).
$binDir = $PSScriptRoot
if (-not $Path) { $Path = Join-Path (Split-Path -Parent $binDir) 'Audios' }
$ffmpeg = Join-Path $binDir 'ffmpeg\bin\ffmpeg.exe'
if (-not (Test-Path -LiteralPath $ffmpeg)) { throw "No trobe $ffmpeg" }

$files = @(Get-ChildItem -LiteralPath $Path -Filter $Pattern -File | Sort-Object Name)
if ($files.Count -lt 2) { throw "Calen almenys 2 fitxers a $Path" }

$tmp = Join-Path $env:TEMP ('fp_cmp_audio_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$rate = 8000

function Get-Envelope {
    param([string] $File, [string] $OutRaw, [int] $Rate, [int] $Hop)
    & $ffmpeg -v quiet -y -i $File -ac 1 -ar $Rate -f f32le $OutRaw
    if (-not (Test-Path -LiteralPath $OutRaw)) { return $null }
    $bytes = [System.IO.File]::ReadAllBytes($OutRaw)
    $n = [int]($bytes.Length / 4)
    if ($n -le 0) { return $null }
    # Buffer.BlockCopy -> float[] és molt més ràpid que BitConverter per mostra.
    $smp = New-Object float[] $n
    [System.Buffer]::BlockCopy($bytes, 0, $smp, 0, $n * 4)
    $perFrame = [int]($Rate * $Hop / 1000)
    $frames = [int][Math]::Floor($n / $perFrame)
    $env = New-Object double[] $frames
    for ($f = 0; $f -lt $frames; $f++) {
        $base = $f * $perFrame
        $acc = 0.0
        for ($i = 0; $i -lt $perFrame; $i++) { $v = $smp[$base + $i]; $acc += $v * $v }
        $env[$f] = [Math]::Sqrt($acc / $perFrame)
    }
    return @{ env = $env; secs = ($n / $Rate); frames = $frames }
}

function Get-ZScore {
    param([double[]] $a)
    $m = 0.0; for ($i = 0; $i -lt $a.Length; $i++) { $m += $a[$i] }
    $m /= $a.Length
    $v = 0.0; for ($i = 0; $i -lt $a.Length; $i++) { $d = $a[$i] - $m; $v += $d * $d }
    $sd = [Math]::Sqrt($v / $a.Length)
    if ($sd -lt 1e-9) { $sd = 1.0 }
    $z = New-Object double[] $a.Length
    for ($i = 0; $i -lt $a.Length; $i++) { $z[$i] = ($a[$i] - $m) / $sd }
    return $z
}

function Get-BestCorr {
    param([double[]] $A, [double[]] $B, [int] $MaxLag)
    $best = -2.0; $bestLag = 0
    for ($lag = -$MaxLag; $lag -le $MaxLag; $lag++) {
        $i0 = [Math]::Max(0, $lag)
        $j0 = [Math]::Max(0, -$lag)
        $len = [Math]::Min($A.Length - $i0, $B.Length - $j0)
        if ($len -lt 8) { continue }
        # z-score previ -> el producte ja és la correlació de Pearson.
        $s = 0.0
        for ($k = 0; $k -lt $len; $k++) { $s += $A[$i0 + $k] * $B[$j0 + $k] }
        $r = $s / $len
        if ($r -gt $best) { $best = $r; $bestLag = $lag }
    }
    return @{ r = $best; lag = $bestLag }
}


Write-Host ''
Write-Host "Comparant $($files.Count) fitxers de $Path (mono ${rate} Hz, RMS/$HopMs ms)" -ForegroundColor Cyan
Write-Host ''

$data = @()
foreach ($f in $files) {
    $raw = Join-Path $tmp ($f.BaseName + '.f32')
    $e = Get-Envelope -File $f.FullName -OutRaw $raw -Rate $rate -Hop $HopMs
    if ($null -eq $e) { Write-Warning "No s'ha pogut decodificar $($f.Name)"; continue }
    $data += [pscustomobject]@{
        Name   = $f.Name
        Bytes  = $f.Length
        Secs   = [Math]::Round($e.secs, 3)
        Frames = $e.frames
        Z      = (Get-ZScore $e.env)
    }
    Write-Host ("  {0,-42} {1,7:N2}s  {2} frames" -f $f.Name, $e.secs, $e.frames) -ForegroundColor DarkGray
}

$maxLag = [int]($MaxLagSec * 1000 / $HopMs)
$pairs = @()
for ($i = 0; $i -lt $data.Count; $i++) {
    for ($j = $i + 1; $j -lt $data.Count; $j++) {
        $c = Get-BestCorr -A $data[$i].Z -B $data[$j].Z -MaxLag $maxLag
        $pairs += [pscustomobject]@{
            A     = $data[$i].Name
            B     = $data[$j].Name
            Corr  = [Math]::Round($c.r, 4)
            LagMs = $c.lag * $HopMs
            Same  = ($c.r -ge $Threshold)
        }
    }
}

Write-Host ''
Write-Host '--- Parells ordenats per correlacio (1.0 = mateix so) ---' -ForegroundColor Cyan
$pairs | Sort-Object -Property Corr -Descending | ForEach-Object {
    $color = if ($_.Same) { 'Green' } elseif ($_.Corr -ge 0.75) { 'Yellow' } else { 'DarkGray' }
    Write-Host ("  {0,7:N4}  lag {1,6} ms  {2}  <->  {3}" -f $_.Corr, $_.LagMs, $_.A, $_.B) -ForegroundColor $color
}

Write-Host ''
$dup = @($pairs | Where-Object { $_.Same })
if ($dup.Count -eq 0) {
    Write-Host "Cap parell supera $Threshold : tots els audios son diferents." -ForegroundColor Green
} else {
    Write-Host "$($dup.Count) parell(s) per damunt de $Threshold (probablement el MATEIX so):" -ForegroundColor Yellow
    $dup | ForEach-Object { Write-Host ("  * {0}  ==  {1}   (r={2:N4}, lag={3} ms)" -f $_.A, $_.B, $_.Corr, $_.LagMs) -ForegroundColor Yellow }
}

if (-not $KeepRaw) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
else { Write-Host "Raw a $tmp" -ForegroundColor DarkGray }

# Sortida maquina-llegible per a altres scripts (sense perdre els Write-Host).
$pairs | Sort-Object -Property Corr -Descending
