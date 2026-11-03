<#
.SYNOPSIS
    Calibra la NETeja de música d'A1 (careta/molinet/tornada) amb `anlms`.

.DESCRIPTION
    Eina de l'F0 de la spec docs/specs/OPCIONS_A1_I_ECHO_OFF.md §1.5: per cada
    combinacio order x mu mesura QUANT baixa la musica de la plantilla i QUANT
    es mou la veu. No toca el panell ni js/: es una eina de laboratori.

    Model: mescla(n) = veu(n) + h(n) * plantilla(n). `anlms` es un filtre
    adaptatiu NLMS amb senyal de referencia: estima `h` (guany + reverb + EQ +
    retard) i el residu `mescla - h*plantilla` es la veu.

    PER QUE LA MESURA ES PER BANDA I NO GLOBAL: una cancelacio bona d'un to de
    440 Hz dins d'una mescla dominada per la veu es invisible en el RMS global
    (la veu tapa el numero). Es mesuren les bandes d'octava on la plantilla
    PESA (detectades automaticament) i es compara abans/despres.

    MODES D'`anlms` (comprovat empiricament amb ffmpeg del repo, 2026-11-02):
      out_mode=o  -> RESIDU (la veu neta)  <- el que volem
      out_mode=e  -> MUSICA ESTIMADA      <- per a l'A/B
      out_mode=i/d/n -> plantilla/secundari (no els fem servir)

.PARAMETER Mix
    Tram d'A1 on es cola la musica (5-10 s de WAV exportat del projecte).

.PARAMETER Template
    La plantilla neta: qualsevol WAV de la carpeta `Audios\` del projecte.

.PARAMETER Voice
    Opcional. Nomes per a proves sintetiques: la veu pura per a mesurar quant
    s'ha menjat la resta (error respecte de la veu). Amb material real no hi es.

.PARAMETER Orders
    Ordres d'`anlms` a provar (taps). 48000/44100 Hz: 1024 ~ 21 ms, 4096 ~ 85 ms,
    16384 ~ 341 ms, 32767 ~ 682 ms (cobreix reverb + retard curt).

.PARAMETER Mus
    Passos d'adaptacio a provar. Xicotet = estable i lent; gran = rapid i
    inestable amb senyals tonals.

.EXAMPLE
    bin\calibra_a1.ps1 -Mix A1.wav -Template Audios\3CatInfo_TN_Careta.WAV
    bin\calibra_a1.ps1 -Mix t\mescla.wav -Template t\plantilla.wav -Voice t\veu.wav
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Mix,
    [Parameter(Mandatory = $true)][string] $Template,
    [string]   $Voice   = '',
    [string[]] $Orders  = @('1024', '4096', '16384'),
    # Es rep com a text i es convertix amb cultura invariant: en un Windows en
    # català `[double]'0.02'` pot acabar valent 2. Accepta llistes escrites com
    # -Mus '0.005,0.02,0.1' (o separades per ';' o '/'). Amb -File NO es poden
    # passar valors separats per espais: PowerShell els aboca al paràmetre
    # següent (vist: -Mul 0.02 0.1 acabava en eps=4096).
    [string[]] $Mus     = @('0.005', '0.02', '0.1'),
    [string]   $Eps     = '1e-4',
    [string]   $Leakage = '0.0005',
    # Marge (dB) mescla-vs-plantilla per a classificar una banda d'octava com a
    # MÚSICA (plantilla prop o per damunt) o com a VEU (mescla molt per damunt).
    [string]   $MusicMargin = '6',
    [string]   $OutDir  = ''
)

$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture

function Split-Values {
    <# Trenca llistes escrites a mà: «0.005,0.02» / «0,005;0,02» / «1024 4096» / «1024,4096». #>
    param([string[]] $Raw)
    $acc = @()
    foreach ($chunk in $Raw) {
        foreach ($piece in ($chunk -split '[;/\s]+')) {
            if (-not $piece) { continue }
            # (2026-11-03) La coma es DECIMAL només en valors curts de laboratori
            # («0,005» → 0,005 · «12,5»). En una llista d'enters («1024,4096») la
            # coma és SEPARADOR: abans eixe cas entrava pel ramal decimal i, amb la
            # cultura ca-ES, `[int]'1024,4096'` arredonia a 1024 — la reixeta
            # sencera s'executava amb UN sol `order` sense avisar.
            if ($piece -match '^[+-]?\d{1,2},\d{1,3}$') { $acc += ($piece -replace ',', '.') }
            else { $acc += ($piece -split ',' | Where-Object { $_ -ne '' }) }
        }
    }
    return $acc
}

function ConvertTo-Double {
    param([string] $Text)
    $t = $Text.Trim() -replace ',', '.'
    return [double]::Parse($t, $inv)
}

$OrderList = @(Split-Values $Orders | ForEach-Object { [int]$_ })
$MusList = @(Split-Values $Mus | ForEach-Object { ConvertTo-Double $_ })
$EpsVal = ConvertTo-Double $Eps
$LeakVal = ConvertTo-Double $Leakage
$MusMargin = ConvertTo-Double $MusicMargin
$binDir = $PSScriptRoot
$ffmpeg = Join-Path $binDir 'ffmpeg\bin\ffmpeg.exe'
if (-not (Test-Path -LiteralPath $ffmpeg)) { throw "No trobe $ffmpeg" }
foreach ($f in @($Mix, $Template)) {
    if (-not (Test-Path -LiteralPath $f)) { throw "No trobe $f" }
}
if ($Voice -and -not (Test-Path -LiteralPath $Voice)) { throw "No trobe $Voice" }
if (-not $OutDir) { $OutDir = Join-Path $env:TEMP ('fp_calibra_a1_' + (Get-Date -Format 'yyyyMMdd_HHmmss')) }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

# Bandes d'octava (centre en Hz). `bandpass width_type=o:w=1` = una octava.
$Bands = @(63, 125, 250, 500, 1000, 2000, 4000, 8000)
$reMV = [regex]'mean_volume:\s*(-?[\d.]+|-inf)\s*dB'
$reFN = [regex]'Parse error|Error while|No such filter'

function Invoke-Ffmpeg {
    <#
      Llança ffmpeg i torna (stderr+stdout) com a text.
      PER QUE el canvi de $ErrorActionPreference: amb 'Stop', PowerShell convertix
      qualsevol línia d'stderr d'un executable natiu («Guessed Channel Layout…»)
      en una excepció que mata l'script.
    #>
    param([string[]] $FfArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { return ((& $ffmpeg @FfArgs 2>&1) -join "`n") }
    finally { $ErrorActionPreference = $prev }
}

function Get-Level {
    <# Nivell RMS (dBFS) d'un fitxer, opcionalment filtrat per una banda. #>
    param([string] $File, [double] $Freq = 0)
    $af = if ($Freq -gt 0) { "bandpass=f=$Freq`:width_type=o:w=1,volumedetect" } else { 'volumedetect' }
    $out = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-i', $File, '-af', $af, '-f', 'null', '-')
    if ($reFN.IsMatch($out)) { return [double]::NaN }
    $m = $reMV.Match($out)
    if (-not $m.Success) { return [double]::NaN }
    if ($m.Groups[1].Value -eq '-inf') { return -120.0 }
    return [double]::Parse($m.Groups[1].Value, $inv)
}

function Get-BandProfile {
    <# Perfil d'octaves: hashtable freq -> dBFS #>
    param([string] $File)
    $p = @{}
    foreach ($b in $Bands) { $p[$b] = (Get-Level -File $File -Freq $b) }
    return $p
}

function Invoke-Anlms {
    <# Una passada d'anlms. $Mode: o = residu, e = musica estimada. #>
    # ⚠️ El destí es diu $Dest i no $Out: PowerShell no distingix majúscules i
    # $out (text de ffmpeg) machacaria la ruta, deixant Test-Path en fals.
    param([string] $Dest, [int] $Order, [double] $Mu, [string] $Mode)
    $mu = $Mu.ToString($inv)
    $eps = $EpsVal.ToString($inv)
    $lk = $LeakVal.ToString($inv)
    $fc = "[1][0]anlms=order=$Order`:mu=$mu`:eps=$eps`:leakage=$lk`:out_mode=$Mode"
    $txt = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y', '-i', $Mix, '-i', $Template, '-filter_complex', $fc, $Dest)
    if ($reFN.IsMatch($txt) -or -not (Test-Path -LiteralPath $Dest)) {
        Write-Verbose $txt
        return $false
    }
    return $true
}

Write-Host ''
Write-Host 'CALIBRATGE A1 · anlms (NLMS amb referencia)' -ForegroundColor Cyan
Write-Host "  mescla   : $Mix"
Write-Host "  plantilla: $Template"
if ($Voice) { Write-Host "  veu pura : $Voice (mode sintetic)" }
Write-Host "  eixida   : $OutDir"
Write-Host ("  reixeta  : orders={0} | mu={1} | eps={2} | leakage={3}" -f `
        ($OrderList -join '/'), (($MusList | ForEach-Object { $_.ToString($inv) }) -join '/'), `
        $EpsVal.ToString($inv), $LeakVal.ToString($inv)) -ForegroundColor DarkGray
Write-Host ''

# --- 1. Perfils ABANS -------------------------------------------------------
$mixAll   = Get-Level -File $Mix
$tmplAll  = Get-Level -File $Template
$pMix0    = Get-BandProfile -File $Mix
$pTmpl    = Get-BandProfile -File $Template

# Bandes de MÚSICA vs bandes de VEU. La clau: on la plantilla està prop del
# nivell de la mescla (marge < $MusMargin dB) la música hi manarà -> ha de
# BAIXAR. On la mescla està molt per damunt (marge >= $VoiceMargin) no hi ha
# música que llevar -> si baixa, s'ha menjat veu.
$musicBands = @()
$voiceBands = @()
foreach ($b in $Bands) {
    if ([double]::IsNaN($pTmpl[$b]) -or [double]::IsNaN($pMix0[$b])) { continue }
    $margin = $pMix0[$b] - $pTmpl[$b]      # >0 -> la mescla té més que la plantilla (normal)
    if ($margin -lt $MusMargin) { $musicBands += $b } else { $voiceBands += $b }
}
if ($musicBands.Count -eq 0) {
    Write-Warning "La plantilla no destaca en cap banda d'octava (marge < $MusMargin dB)."
    Write-Warning 'Pot ser que la mesura siga soroll, o que la plantilla no es corresponga a eixe tram.'
    $musicBands = $Bands
}

Write-Host "--- Perfil d'octaves ABANS (dBFS) ---" -ForegroundColor Cyan
Write-Host ('  {0,7}  {1,8}  {2,8}  {3}' -f 'Hz', 'mescla', 'plantilla', 'us')
foreach ($b in $Bands) {
    $mark = if ($musicBands -contains $b) { 'MUSICA' } elseif ($voiceBands -contains $b) { 'veu' } else { '' }
    $mm = if ([double]::IsNaN($pMix0[$b])) { '   n/a' } else { '{0,8:N1}' -f $pMix0[$b] }
    $tt = if ([double]::IsNaN($pTmpl[$b])) { '   n/a' } else { '{0,8:N1}' -f $pTmpl[$b] }
    Write-Host ("  {0,7}  {1}  {2}  {3}" -f $b, $mm, $tt, $mark) -ForegroundColor $(if ($mark -eq 'MUSICA') { 'Yellow' } else { 'DarkGray' })
}
Write-Host ''
Write-Host ("Mescla: {0:N1} dBFS / plantilla: {1:N1} dBFS / musica: {2} / veu: {3}" -f `
        $mixAll, $tmplAll, ($musicBands -join ','), ($voiceBands -join ',')) -ForegroundColor DarkGray
Write-Host ''

# --- 2. Reixeta order x mu --------------------------------------------------
$rows = @()
foreach ($order in $OrderList) {
    foreach ($mu in $MusList) {
        $tag  = 'o{0}_mu{1}' -f $order, ($mu.ToString($inv).Replace('.', 'p'))
        $resF = Join-Path $OutDir ("res_$tag.wav")
        $estF = Join-Path $OutDir ("est_$tag.wav")
        $t0 = Get-Date
        if (-not (Invoke-Anlms -Dest $resF -Order $order -Mu $mu -Mode 'o')) {
            Write-Warning "anlms KO (order=$order mu=$mu)"; continue
        }
        $ms = [int]((Get-Date) - $t0).TotalMilliseconds
        [void](Invoke-Anlms -Dest $estF -Order $order -Mu $mu -Mode 'e')

        $pRes = Get-BandProfile -File $resF
        # Delta per banda (negatiu = ha baixat). Es separen MÚSICA i VEU:
        # el bo és música molt negativa i veu prop de 0.
        $dMus = @()
        foreach ($b in $musicBands) {
            if ([double]::IsNaN($pRes[$b])) { continue }
            $dMus += ($pRes[$b] - $pMix0[$b])
        }
        $dVoice = @()
        foreach ($b in $voiceBands) {
            if ([double]::IsNaN($pRes[$b])) { continue }
            $dVoice += ($pRes[$b] - $pMix0[$b])
        }
        $avgMus = if ($dMus.Count) { ($dMus | Measure-Object -Average).Average } else { [double]::NaN }
        $avgVoice = if ($dVoice.Count) { ($dVoice | Measure-Object -Average).Average } else { [double]::NaN }
        $resAll = Get-Level -File $resF
        $errAll = [double]::NaN
        if ($Voice) {
            $diffF = Join-Path $OutDir ("err_$tag.wav")
            $o = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y', '-i', $resF, '-i', $Voice, '-filter_complex', '[1]volume=-1[v];[0][v]amix=inputs=2:duration=shortest:normalize=0', $diffF)
            if (-not $reFN.IsMatch($o)) { $errAll = Get-Level -File $diffF }
            Remove-Item -LiteralPath $diffF -ErrorAction SilentlyContinue
        }
        $rows += [pscustomobject]@{
            Order      = $order
            Mu         = $mu
            MusicDb    = [Math]::Round($avgMus, 2)
            VoiceDb    = [Math]::Round($avgVoice, 2)
            ResidDb    = [Math]::Round($resAll, 2)
            MixDb      = [Math]::Round($mixAll, 2)
            VoiceErrDb = if ([double]::IsNaN($errAll)) { $null } else { [Math]::Round($errAll, 2) }
            Ms         = $ms
            ResFile    = $resF
            EstFile    = $estF
        }
    }
}

# --- 3. Resultats ----------------------------------------------------------
Write-Host ''
Write-Host '--- Resultats (MusicDb <0 = la musica ha baixat; VoiceDb ~0 = veu intacta) ---' -ForegroundColor Cyan
$rows | Sort-Object -Property MusicDb | Format-Table -AutoSize Order, Mu, MusicDb, VoiceDb, ResidDb, MixDb, VoiceErrDb, Ms |
    Out-String -Width 120 | Write-Host

$best = $rows | Sort-Object -Property MusicDb | Select-Object -First 1
if ($best) {
    Write-Host ("MILLOR: order={0} mu={1} -> musica {2:N1} dB / veu {3:N1} dB ({4} ms)" -f $best.Order, $best.Mu, $best.MusicDb, $best.VoiceDb, $best.Ms) -ForegroundColor Green
    Write-Host ("  A/B: escolta '{0}' (residu) i '{1}' (musica estimada)" -f (Split-Path -Leaf $best.ResFile), (Split-Path -Leaf $best.EstFile)) -ForegroundColor Green
    $csv = Join-Path $OutDir 'calibracio.csv'
    $rows | Select-Object Order, Mu, MusicDb, VoiceDb, ResidDb, MixDb, VoiceErrDb, Ms |
        Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
    Write-Host "CSV: $csv" -ForegroundColor DarkGray
}

Write-Host ''
Write-Host 'Recorda: la metrica nomes orienta. La decisio es A/B amb orelles (ResFile vs EstFile).' -ForegroundColor DarkYellow
$rows | Sort-Object -Property MusicDb
