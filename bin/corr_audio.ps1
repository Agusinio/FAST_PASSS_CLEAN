<#
.SYNOPSIS
    Diu SI una plantilla d'audio (careta, molinet, sintonia) apareix DINS d'un
    tros de mescla, i ON: torna r (Pearson), el lag en segons i r per finestres.

.DESCRIPTION
    Es el detector de la neteja d'A1 (F1). Motor: bin\corr_core.cs (Pearson pur
    sobre el solapament + refi fi a nivell de mostra). Per que no val el metode
    vell: BUG #234 (`cmp_audio.ps1` normalitzava amb el z-score GLOBAL i no
    refinava el lag -> donava r>1 i falsos negatius: 0,987 real llegit com 0,016).

    Conveni de lag: positiu = la plantilla comenca AQUEIXS segons dins de la
    mescla. `mixPosSec = MixStart + lagSec` es la posicio del mix que equival al
    segon 0 de la plantilla (es el valor que necessita anlms per alinear-la).

    Nomes es consideren lags on la plantilla hi entra al menys `WinSec` (2 s):
    el borde de la finestra (0,15 s de plantilla dins) dona pics d'atzar que
    tapaven el match de veritat (BUG #236).

    Mesures reals que va validar el metode (03/11, `TNV_V1_CLIP.mp4` contra
    `Audios\3CATINFO_CARETA_20.WAV`):
        · control positiu (dos trams del MATEIX mp4) .......... r = 1,0000
        · tram 23,40 s del clip (el de la timeline) ........... r = 0,0090
        · careta real dins del media, a 10,7309 s ............. r = 0,9877

.PARAMETER Mix
    Fitxer on buscar (mp4, mov, wav...). El que decodifica ffmpeg.

.PARAMETER Ref
    Una plantilla concreta. Si no es dona, s'usa -RefDir.

.PARAMETER RefDir
    Carpeta de plantilles (per defecte: `Audios` del projecte).

.PARAMETER MixStart
    Segon d'inici del tros del mix a analitzar (per defecte 0).

.PARAMETER MixDur
    Durada del tros (per defecte -1 = fins al final).

.PARAMETER Accurate
    Decodifica EXACTE (-ss despres de -i): mes lent, pero el tros comenca
    exactament en MixStart. Sense este commutador s'usa el seek rapid.

.PARAMETER MinR
    Llindar per a dir «es la mateixa» (per defecte 0.70, criteri 5 de la spec).

.PARAMETER Json
    Fitxer on desar el resultat ({ ok, best:{...}, all:[...] }).

.PARAMETER Done
    Fitxer de senyal per al panell: escriu `OK` o `FAIL:...` (patro del repo).

.EXAMPLE
    bin\corr_audio.ps1 -Mix C:\temp\a1.wav -RefDir Audios

.EXAMPLE
    bin\corr_audio.ps1 -Mix "\\NAS\TNV_V1_CLIP.mp4" -MixStart 10.7 -MixDur 14 -Accurate -Ref Audios\3CATINFO_CARETA_20.WAV
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Mix,
    [string] $Ref       = '',
    [string] $RefDir    = '',
    [string] $Pattern   = '*.WAV',
    [double] $MixStart  = 0,
    [double] $MixDur    = -1,
    [double] $MaxLagSec = 3.0,
    [int]    $HopMs     = 20,
    [int]    $Rate      = 8000,
    [double] $WinSec    = 2.0,
    [int]    $StepMs    = 10,
    [double] $MinR      = 0.70,
    [switch] $Accurate,
    [string] $Json      = '',
    [string] $Done      = '',
    [switch] $Quiet
)

$ErrorActionPreference = 'Stop'
$binDir = $PSScriptRoot
$ffmpeg = Join-Path $binDir 'ffmpeg\bin\ffmpeg.exe'
$core   = Join-Path $binDir 'corr_core.cs'

function Write-Done {
    param([string] $Path, [string] $Text)
    if (-not $Path) { return }
    try { [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false))) }
    catch { }
}
function Invoke-Say {
    param([string] $Text)
    if (-not $Quiet) { Write-Host $Text }
}

if (-not (Test-Path -LiteralPath $ffmpeg)) { Write-Done $Done "FAIL:sense ffmpeg"; throw "No trobe $ffmpeg" }
if (-not (Test-Path -LiteralPath $core))   { Write-Done $Done "FAIL:sense corr_core.cs"; throw "No trobe $core" }
if (-not (Test-Path -LiteralPath $Mix))    { Write-Done $Done "FAIL:no existeix $Mix"; throw "No trobe $Mix" }

# Motor C# (compila en ~150 ms; si ja esta carregat, no el torna a compilar)
if (-not ('CorrCore' -as [type])) { Add-Type -Path $core }

# ─── Plantilles ──────────────────────────────────────────────────────────────
$refs = @()
if ($Ref) {
    if (-not (Test-Path -LiteralPath $Ref)) { Write-Done $Done "FAIL:no existeix $Ref"; throw "No trobe $Ref" }
    $refs = @($Ref)
} else {
    if (-not $RefDir) { $RefDir = Join-Path (Split-Path -Parent $binDir) 'Audios' }
    if (-not (Test-Path -LiteralPath $RefDir)) { Write-Done $Done "FAIL:sense plantilles"; throw "No trobe la carpeta $RefDir" }
    $refs = @(Get-ChildItem -LiteralPath $RefDir -Filter $Pattern -File | Sort-Object Name | ForEach-Object { $_.FullName })
}
if ($refs.Count -eq 0) { Write-Done $Done "FAIL:cap plantilla"; throw "Cap plantilla ($Pattern) a $RefDir" }

$tmp = Join-Path $env:TEMP ('fp_corr_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

$perFrame    = [int]($Rate * $HopMs / 1000)
$maxLagFrame = [int][Math]::Ceiling($MaxLagSec * 1000 / $HopMs)
$stepSamples = [int][Math]::Max(1, ($Rate * $StepMs / 1000))
$winSamples  = [int]($WinSec * $Rate)

# SOLAPAMENT MINIM per a donar un lag per bo: una finestra sencera (WinSec).
# Per que: si la plantilla nomes entra un tros al final de la finestra, el
# Pearson de l'embolcall es calcula sobre 8-40 trames i pot donar pics d'atzar
# mes alts que el match de veritat. Mesurat 04/11 amb TNV_V1_CLIP.mp4
# (MixStart 0, MixDur 40): el millor lag era 39,85 s amb 0,15 s de plantilla
# dins -> r=0,22, i el match real (14,49 s, r=0,87) quedava tapat: la neteja
# d'A1 no s'executava. Amb MixDur 55 sortia be per casualitat del borde.
$minOvFrames = [int][Math]::Max(8, [Math]::Ceiling($WinSec * 1000 / $HopMs))

function Get-F32 {
    param([string] $File, [double] $Start, [double] $Dur, [string] $Out, [switch] $Exact)
    $ff = @('-v', 'quiet', '-y')
    if ($Start -gt 0 -and -not $Exact) { $ff += @('-ss', [string]$Start) }
    $ff += @('-i', $File)
    if ($Start -gt 0 -and $Exact) { $ff += @('-ss', [string]$Start) }
    if ($Dur -gt 0) { $ff += @('-t', [string]$Dur) }
    $ff += @('-ac', '1', '-ar', [string]$Rate, '-f', 'f32le', $Out)
    & $ffmpeg @ff 2>&1 | Out-Null
    if (-not (Test-Path -LiteralPath $Out)) { return $null }
    $bytes = [System.IO.File]::ReadAllBytes($Out)
    $n = [int][Math]::Floor($bytes.Length / 4)
    if ($n -lt [CorrCore]::MIN_OVERLAP) { return $null }
    $smp = New-Object float[] $n
    [System.Buffer]::BlockCopy($bytes, 0, $smp, 0, $n * 4)
    return $smp
}

Invoke-Say ''
Invoke-Say ("corr_audio · {0} · mono {1} Hz · RMS/{2} ms · lag max +/-{3} s" -f [CorrCore]::Version(), $Rate, $HopMs, $MaxLagSec)
Invoke-Say ("  mix: {0}  (des de {1:N3} s{2})" -f $Mix, $MixStart, $(if ($MixDur -gt 0) { ", $MixDur s" } else { '' }))
Invoke-Say ("  plantilles: {0}" -f $refs.Count)
Invoke-Say ''

# ─── Mescla ──────────────────────────────────────────────────────────────────
$mixRaw = Join-Path $tmp 'mix.f32'
$A = Get-F32 -File $Mix -Start $MixStart -Dur $MixDur -Out $mixRaw -Exact:$Accurate
if ($null -eq $A) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue; Write-Done $Done "FAIL:no s'ha pogut decodificar el mix"; throw "No s'ha pogut decodificar $Mix" }
$mixSecs = [Math]::Round($A.Length / $Rate, 3)
$EA = [CorrCore]::Envelope($A, $perFrame)

# ─── Una mesura per plantilla ────────────────────────────────────────────────
$all = @()
foreach ($rf in $refs) {
    $rfName = Split-Path -Leaf $rf
    $refRaw = Join-Path $tmp ('ref_' + [guid]::NewGuid().ToString('N').Substring(0, 6) + '.f32')
    $B = Get-F32 -File $rf -Start 0 -Dur -1 -Out $refRaw
    if ($null -eq $B) { Write-Warning "No s'ha pogut decodificar $rfName"; continue }
    $EB = [CorrCore]::Envelope($B, $perFrame)

    # 1) CERCA: maxim de l'embolcall RMS (resolucio de trama, barat i estable).
    #    MESURAT 03/11: una rejilla de Pearson CRU cru ix malament encara que el
    #    pas siga de 10 ms, perque el pic d'un audio te ~1 mostra d'ample: 28 ms
    #    de desajust fan caure r de 0,82 a 0,11. L'embolcall no patix d'aixo.
    #    El rang de lag es limita per a que la plantilla hi ENTRE SENCERA (o al
    #    menys `$minOvFrames`): el borde de la finestra no es una posicio valida.
    $lagLo = [int][Math]::Max(-$maxLagFrame, ($minOvFrames - $EB.Length))
    $lagHi = [int][Math]::Min($maxLagFrame, ($EA.Length - $minOvFrames))
    if ($lagHi -lt $lagLo) { $lagLo = -$maxLagFrame; $lagHi = $maxLagFrame }
    $rEnv = 0.0
    $lagF = [CorrCore]::BestLagEnvelopeRange($EA, $EB, $lagLo, $lagHi, [ref]$rEnv)

    # 2) REFI a nivell de MOSTRA sobre la senyal crua (+/-1 trama de l'embolcall).
    #    Es el pas que convertix un r=0,016 en r=0,987.
    $rFine = 0.0
    $lagS = [CorrCore]::RefineLag($A, $B, ($lagF * $perFrame), [Math]::Max($perFrame, $stepSamples), [ref]$rFine)

    # 3) r per finestres: si la coincidencia es trenca, ací es veu
    $wins = @()
    try { $wins = @([CorrCore]::WindowsR($A, $B, $lagS, $winSamples)) } catch { $wins = @() }
    $winsTxt = @($wins | ForEach-Object { [Math]::Round([double]$_, 3) })
    $rMaxWin = 0.0
    if ($winsTxt.Count -gt 0) { $rMaxWin = ($winsTxt | Measure-Object -Maximum).Maximum }

    $lagSec = [Math]::Round($lagS / $Rate, 4)
    $all += [pscustomobject]@{
        ref       = $rfName
        path      = $rf
        r         = [Math]::Round($rFine, 4)
        rEnv      = [Math]::Round($rEnv, 4)
        rMaxWin   = [Math]::Round([double]$rMaxWin, 3)
        lagSec    = $lagSec
        mixPosSec = [Math]::Round(($MixStart + $lagSec), 4)
        overlapSec = [Math]::Round(([CorrCore]::Overlap($A, $B, $lagS) / $Rate), 3)
        windows   = $winsTxt
    }
    Remove-Item -LiteralPath $refRaw -Force -ErrorAction SilentlyContinue
}

if ($all.Count -eq 0) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue; Write-Done $Done "FAIL:cap plantilla mesurable"; throw "Cap plantilla mesurable" }

$sorted = @($all | Sort-Object -Property r -Descending)
$best = $sorted[0]
$hit = ($best.r -ge $MinR)

# ─── Informe ─────────────────────────────────────────────────────────────────
Invoke-Say '--- r per plantilla (Pearson sobre la mostra: 1,0 = mateix so) ---'
foreach ($row in $sorted) {
    $w = ''
    if ($row.windows.Count -gt 0) { $w = '  ·  finestres ' + ($row.windows -join '/') }
    if (-not $Quiet) {
        $color = if ($row.r -ge $MinR) { 'Green' } elseif ($row.r -ge 0.5) { 'Yellow' } else { 'DarkGray' }
        Write-Host ("  {0,7:N4}  pos {1,8:N3} s  {2}{3}" -f $row.r, $row.mixPosSec, $row.ref, $w) -ForegroundColor $color
    }
}
Invoke-Say ''
if ($hit) {
    Invoke-Say ("RESULT JA: {0} a {1:N3} s (r={2:N4}, lag={3:N3} s, eixida a {4:N3} s)" -f $best.ref, $best.mixPosSec, $best.r, $best.lagSec, ($best.mixPosSec + $best.overlapSec))
} else {
    Invoke-Say ("RESULT NO: cap plantilla arriba a r={0} (millor: {1}, r={2:N4})" -f $MinR, $best.ref, $best.r)
}

# ─── JSON (el que llig el panel) ─────────────────────────────────────────────
$result = [ordered]@{
    ok         = $true
    version    = 'v1'
    mix        = $Mix
    mixStart   = $MixStart
    mixSecs    = $mixSecs
    rate       = $Rate
    hopMs      = $HopMs
    minR       = $MinR
    hit        = $hit
    best       = $best
    all        = $sorted
}
$jsonTxt = ConvertTo-Json $result -Depth 6
if ($Json) {
    try { [System.IO.File]::WriteAllText($Json, $jsonTxt, (New-Object System.Text.UTF8Encoding($false))) }
    catch { Write-Warning "No s'ha pogut escriure $Json : $($_.Exception.Message)" }
    Invoke-Say ("  JSON: {0}" -f $Json)
}

Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Done $Done 'OK'
exit 0
