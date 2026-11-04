<#
.SYNOPSIS
    Prova de CANCEL·LACIO A LA MOSTRA: diu si `mix - g*ref` queda en silenci.

.DESCRIPTION
    Pas 2 del calibratge de la neteja d'A1 (BUG #235). La prova al timeline
    (`Logic.A1Clean` amb `proof:true`) resol 1 frame; aixo NO val per a restar
    audio: 5 ms de desajust pugen el residu mes de 20 dB. Ací:

      1. ffmpeg decodifica els dos fitxers a RAW float32 mono (sense cap
         resampleig que emmascare el desajust, `-ar` fix).
      2. `bin\null_core.cs` busca el lag EN MOSTRES (pas de 1) dins de
         ±`SpanMs` alrededor del nominal i ajusta la ganancia per minims
         quadrats (`g = <mix,ref>/<ref,ref>`).
      3. Es mesura el residu `mix - g*ref` tram a tram (`TramSec`) i es diu
         quants dB baixa respecte del mix.

    Interpretacio:
      · reduccio >= MinNullDb  -> la careta del media es la MATEIXA gravacio que
        la plantilla. La resta es pot fer: el que quede en el tram amb veu es veu.
      · reduccio baixa          -> o el lag es fals, o la referencia no es la
        bona (fade-out, altra versio). No s'ha de restar res.

    Conveni: `MixPos` es el segon del mix on, SEGONS LA CORRELACIO, comenca el
    segon `SkipRef` de la plantilla. L'eina torna `refPosSec` ja corregit a la
    mostra (es el numero que ha de fer servir la resta).

.PARAMETER Mix
    Media on hi ha la careta (mp4/mov/wav). El que decodifica ffmpeg.

.PARAMETER Ref
    La plantilla neta (WAV de `Audios\`).

.PARAMETER MixPos
    Segon del mix on comenca el ref (nominal, el que dona `corr_audio.ps1`).

.PARAMETER SpanMs
    Mig ample de la busca del lag, en ms (per defecte 60 = ±1,5 frame a 25 fps).

.PARAMETER MinNullDb
    Reduccio minima (dB) per a declarar que cancela (per defecte 18).

.PARAMETER Net
    Si es pasa, GENERA la senyal neta (la que es munta al timeline): estereo,
    `mix - g*ref` a la mostra i canal a canal (L amb L, R amb R), des de
    `NetStart` i `NetDur` segons. El guany es el MESURAT (o `NetGain`) i
    l'offset tambe el mesurat (`refPosSec`): la mateixa compte que la mesura,
    no un filter_complex que arredonix.

.PARAMETER NetStart
    Segon del MIX on comenca el tram a netejar (per defecte `MixPos`). Es el
    punt on es munta la finestra del clip a A1.

.PARAMETER NetDur
    Durada del tram a netejar, en segons (per defecte `WinSec`). Pot ser mes
    llarga que la musica: on la plantilla s'acaba, el so ix tal qual.

.PARAMETER NetGain
    Forca la ganancia de la resta (0 = la mesurada). Servix per a reproduir una
    mesura anterior sense tornar a ajustar.

.PARAMETER NetMinR
    Correlacio minima d'un tram per a restar-hi (per defecte 0,7; 0 = sense
    gate). On la plantilla no es la mateixa gravacio, restar-hi fica careta
    invertida (al perfil hi ha trams amb G negatiu): el gate ho evita.

.PARAMETER NetTramSec
    Durada del tram del gate, en segons (per defecte 0,25).

.PARAMETER NetAdapt
    En compte del guany fix + gate, ajusta el guany de cada tram per minims
    quadrats (`g = <a,b>/<b,b>`, per canal) limitat a [0, `NetMaxG`]. Lleva tota
    la careta que hi haja, tambe on va fluixa (la cua del fade-out), i deixa
    `g = 0` on la plantilla no hi te res. Es la versio bona del `-Net`.

.PARAMETER NetMaxG
    Llimit superior del guany adaptatiu (per defecte 1,2).

.PARAMETER NetMinRefDb
    Nivell minim de la plantilla en un tram (dBFS) per a restar-hi (per
    defecte -60): per davall, el guany adaptatiu s'apaga.

.EXAMPLE
    bin\null_audio.ps1 -Mix "\\NAS\TNC_V1_CLIP.mp4" -Ref Audios\3CatInfo_TNC_careta_sense_alpha.WAV -MixPos 14.4509 -WinSec 10

.EXAMPLE
    # Pas 2 (lo que munta el panell): finestra neta d'un clip que entra en 25,44 s
    bin\null_audio.ps1 -Mix a1_mix.wav -Ref Audios\careta.WAV -MixPos 0 -WinSec 6.65 -SkipRef 10.9491 -Net a1_net.wav -NetDur 8.15
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $Mix,
    [Parameter(Mandatory = $true)][string] $Ref,
    [double] $MixPos     = 0,
    [double] $SkipRef    = 0,
    [double] $WinSec     = 10,
    [double] $SpanMs     = 60,
    [int]    $Rate       = 48000,
    [double] $TramSec    = 0.5,
    [double] $MinNullDb  = 18,
    [string] $Json       = '',
    [string] $Done       = '',
    [string] $Wav        = '',
    [string] $Net        = '',
    [double] $NetStart   = -1,
    [double] $NetDur     = -1,
    [double] $NetGain    = 0,
    [double] $NetMinR    = 0.7,
    [double] $NetTramSec = 0.25,
    [double] $NetMaxG    = 1.2,
    [double] $NetMinRefDb = -60,
    [switch] $NetAdapt,
    [switch] $Quiet
)

$ErrorActionPreference = 'Stop'
$inv     = [Globalization.CultureInfo]::InvariantCulture
$binDir  = $PSScriptRoot
$ffmpeg  = Join-Path $binDir 'ffmpeg\bin\ffmpeg.exe'
$core    = Join-Path $binDir 'null_core.cs'

function Write-Done {
    param([string] $Path, [string] $Text)
    if (-not $Path) { return }
    try { [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false))) } catch { }
}
function Invoke-Say {
    param([string] $Text)
    if (-not $Quiet) { Write-Host $Text }
}
function N { param([double] $v, [int] $d) return [Math]::Round($v, $d) }

if (-not (Test-Path -LiteralPath $ffmpeg)) { Write-Done $Done 'FAIL:sense ffmpeg'; throw "No trobe $ffmpeg" }
if (-not (Test-Path -LiteralPath $core))   { Write-Done $Done 'FAIL:sense null_core.cs'; throw "No trobe $core" }
if (-not (Test-Path -LiteralPath $Mix))    { Write-Done $Done "FAIL:no existeix $Mix"; throw "No existeix $Mix" }
if (-not (Test-Path -LiteralPath $Ref))    { Write-Done $Done "FAIL:no existeix $Ref"; throw "No existeix $Ref" }

if (-not ('NullCore' -as [type])) { Add-Type -Path $core }

$tmp = Join-Path $env:TEMP ('a1_null_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
[void](New-Item -ItemType Directory -Path $tmp -Force)

$spanSec  = $SpanMs / 1000.0
$spanSmp  = [int][Math]::Round($spanSec * $Rate)
$startA   = [Math]::Max(0.0, $MixPos - $spanSec)
$durA     = $WinSec + 2 * $spanSec
$rawA     = Join-Path $tmp 'a.raw'
$rawB     = Join-Path $tmp 'b.raw'

function Invoke-Ffmpeg {
    <#
      Llança ffmpeg i torna (stderr+stdout) com a text.
      PER QUE el canvi de $ErrorActionPreference: amb 'Stop', PowerShell convertix
      qualsevol línia d'stderr d'un executable natiu («Guessed Channel Layout…»)
      en una excepció que mata l'script (patró de `corr_audio.ps1`).
    #>
    param([string[]] $Arg)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $script:ffOut = ((& $ffmpeg @Arg 2>&1) -join "`n"); return ($LASTEXITCODE -eq 0) }
    finally { $ErrorActionPreference = $prev }
}

# 1) Decodificacio EXACTA (-ss DESPRES de -i): el tros ha de comencar just on diem.
$okA = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y', '-i', $Mix, '-ss', $startA.ToString($inv),
    '-t', $durA.ToString($inv), '-vn', '-ac', '1', '-ar', "$Rate", '-f', 'f32le', $rawA)
$okB = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y', '-i', $Ref, '-ss', $SkipRef.ToString($inv),
    '-t', $durA.ToString($inv), '-vn', '-ac', '1', '-ar', "$Rate", '-f', 'f32le', $rawB)
if (-not $okA -or -not $okB) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Done $Done 'FAIL:ffmpeg no ha pogut decodificar'
    throw 'ffmpeg KO'
}

$A = [NullCore]::LoadRaw($rawA)
$B = [NullCore]::LoadRaw($rawB)
if ($A.Length -lt [NullCore]::MIN_LEN -or $B.Length -lt [NullCore]::MIN_LEN) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Done $Done 'FAIL:audio massa curt'
    throw 'Audio massa curt'
}

# 2) Lag a la mostra: b[0] dins de a, buscant al voltant del nominal (spanSmp).
$lag0 = $spanSmp
$len  = [Math]::Min([int][Math]::Round($WinSec * $Rate), [Math]::Min($A.Length - $lag0, $B.Length))
if ($len -lt [NullCore]::MIN_LEN) {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Write-Done $Done 'FAIL:finestra massa curta'
    throw 'Finestra massa curta'
}

$rFine = 0.0
$lag   = [NullCore]::BestLagSample($A, $B, $lag0, $spanSmp, 0, $len, [ref]$rFine)
$fit   = [NullCore]::FitWindow($A, $B, $lag, 0, $len)
$g     = [double]$fit[0]
$rRaw  = [double]$fit[1]
$mixDb = [NullCore]::Db([double]$fit[2])
$resDb = [NullCore]::Db([double]$fit[3])
$uniDb = [NullCore]::Db([double]$fit[4])
$nullDb = $mixDb - $resDb
$nullUniDb = $mixDb - $uniDb
$driftMs   = ($lag - $lag0) / [double]$Rate * 1000.0
$refPosSec = $startA + ($lag / [double]$Rate)

# 3) Perfil del residu tram a tram (0,5 s): on cancela i on no.
$tramSmp = [int][Math]::Max([NullCore]::MIN_LEN, [Math]::Round($TramSec * $Rate))
$prof    = [NullCore]::Profile($A, $B, $lag, $g, 0, $len, $tramSmp)
$rows    = @()
$worst   = -200.0
$best    = -200.0
$tramsOk = 0
for ($i = 0; $i -lt ($prof.Length / 3); $i++) {
    $m = [double]$prof[$i * 3 + 0]
    $e = [double]$prof[$i * 3 + 1]
    $go = [double]$prof[$i * 3 + 2]
    $red = $m - $e
    if ($red -gt $worst) { $worst = $red }
    if ($red -gt $best) { $best = $red }
    if ($red -ge $MinNullDb) { $tramsOk++ }
    $rows += [pscustomobject]@{
        Tram   = N ($i * $TramSec) 2
        MixDb  = N $m 1
        ResDb  = N $e 1
        RedDb  = N $red 1
        G      = N $go 3
    }
}
if ($rows.Count -eq 0) { $worst = $nullDb; $best = $nullDb }

# El veredicte GLOBAL (mitjana de tota la finestra) no pot ser l'unic criteri:
# si hi ha VEU damunt de la musica (el cas normal al tall), eixa veu no es a la
# plantilla i el residu NO pot baixar. El que diu si la resta servix es el
# comportament TRAM A TRAM: on nomes hi ha careta, ha de cancelar.
$cancela  = ($nullDb -ge $MinNullDb)
$quotaOk  = [int][Math]::Max(2.0, [Math]::Ceiling($rows.Count / 3.0))
$parcial  = (-not $cancela) -and ($rows.Count -gt 0) -and ($tramsOk -ge $quotaOk)
$verdict  = if ($cancela) { 'NULL' } elseif ($parcial) { 'NULL_PARCIAL' } else { 'NO_NULL' }

# 4) Informe
Invoke-Say ''
Invoke-Say ('=== CANCEL·LACIO A LA MOSTRA · ' + [NullCore]::Version() + ' ===')
Invoke-Say ("  mix .......... {0}" -f $Mix)
Invoke-Say ("  ref .......... {0} (des de {1:N3} s)" -f $Ref, $SkipRef)
Invoke-Say ("  finestra ..... {0:N2} s a {1} Hz ({2} mostres), busca ±{3:N1} ms" -f $WinSec, $Rate, $len, $SpanMs)
Invoke-Say ("  decode ....... mix des de {0:N4} s ({1:N3} s) · {2} / {3} mostres carregades" -f $startA, $durA, $A.Length, $B.Length)
Invoke-Say ("  lag bo ....... {0} mostres ({1:N3} ms) · deriva {2:N2} ms respecte del nominal" -f $lag, ($lag / [double]$Rate * 1000.0), $driftMs)
Invoke-Say ("  refPosSec .... {0:N6} s  <-- el numero que ha de fer servir la resta" -f $refPosSec)
Invoke-Say ("  r (cru, 1.0 = mateix so) ... {0:N5}" -f $rRaw)
Invoke-Say ("  guany g ...... {0:N4} ({1:N2} dB)" -f $g, [NullCore]::Db([Math]::Abs($g)))
Invoke-Say ("  mix .......... {0,7:N1} dBFS" -f $mixDb)
Invoke-Say ("  residu amb g . {0,7:N1} dBFS  ->  baixa {1:N1} dB" -f $resDb, $nullDb)
Invoke-Say ("  residu a pel . {0,7:N1} dBFS  ->  baixa {1:N1} dB" -f $uniDb, $nullUniDb)
if ($rows.Count -gt 0) {
    Invoke-Say ''
    $rows | Format-Table -AutoSize Tram, MixDb, ResDb, RedDb, G | Out-String -Width 100 | Write-Host
    Invoke-Say ("  trams que cancel·len (>= {0:N1} dB): {1} de {2} · millor tram {3:N1} dB" -f $MinNullDb, $tramsOk, $rows.Count, $best)
}

if (-not $Quiet) {
    if ($cancela) {
        Write-Host ("VEREDICTE: NULL OK · la resta baixa {0:N1} dB (minim {1:N1}) i el pitjor tram {2:N1} dB" -f $nullDb, $MinNullDb, $worst) -ForegroundColor Green
    } elseif ($parcial) {
        Write-Host ("VEREDICTE: NULL PARCIAL · la resta baixa {0:N1} dB de mitjana pero {1} de {2} trams cancel·len (>= {3:N1} dB; millor {4:N1} dB)" -f $nullDb, $tramsOk, $rows.Count, $MinNullDb, $best) -ForegroundColor Green
        Write-Host '  -> on NO hi ha veu la careta desapareix: el residu que queda en els altres trams es la VEU. La resta es pot fer (guany fix per tram).' -ForegroundColor DarkGray
    } else {
        Write-Host ("VEREDICTE: NO_NULL · la resta nomes baixa {0:N1} dB (minim {1:N1}); nomes {2} de {3} trams cancel·len (millor {4:N1} dB)" -f $nullDb, $MinNullDb, $tramsOk, $rows.Count, $best) -ForegroundColor Yellow
        Write-Host '  -> o el lag es fals o la plantilla no es la mateixa gravacio. NO s''ha de restar.' -ForegroundColor DarkYellow
    }
}

# 5) WAV de la diferencia (opcional, per a l'A/B a orelles).
# Es genera des del MOTOR (mateixa cuenta que la mesura), no amb un
# filter_complex: `atrim`+`amix` alineen per PTS i la resta eixia 9 dB alta.
if ($Wav) {
    $resRaw = Join-Path $tmp 'e.raw'
    $res = [NullCore]::Residual($A, $B, $lag, $g, 0, $len)
    if ($res.Length -gt 0) {
        [NullCore]::SaveRaw($res, $resRaw)
        $okW = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y',
            '-f', 'f32le', '-ar', "$Rate", '-ac', '1', '-i', $resRaw,
            '-ac', '1', '-ar', "$Rate", $Wav)
        if ($okW) {
            Invoke-Say ("  WAV diferencia: {0}  ({1:N2} s, ha de sonar a {2:N1} dBFS)" -f $Wav, ($len / [double]$Rate), $resDb)
        } else { Write-Warning "No s'ha pogut escriure $Wav" }
    }
}

# 5-bis) SENYAL NETA (pas 2: es el que es munta al timeline).
# La finestra del clip i la plantilla es decodifiquen totes dues en ESTEREO i es
# resta A LA MOSTRA, CANAL A CANAL, amb el guany mesurat. L'offset no es torna a
# buscar: eix de `refPosSec` (el lag bo de la mesura). Si la referencia comenca
# abans que el tram, els primers frames (`pre`) ixen sense tocar; si s'acaba
# abans, la cua tambe: mai s'inventa silenci on no hi havia referencia.
$netInfo = $null
if ($Net) {
    $netStart = if ($NetStart -ge 0) { $NetStart } else { $MixPos }
    $netDur   = if ($NetDur -gt 0)   { $NetDur }   else { $WinSec }
    $netGain  = if ($NetGain -ne 0)  { $NetGain }  else { $g }
    # `refPosSec` = on cau la mostra $SkipRef de la plantilla DINS del mix. Per
    # al tram que comenca a $netStart cal saltar-ne l'equivalent.
    $refSkipNet = $SkipRef + ($netStart - $refPosSec)
    $preSec = 0.0
    if ($refSkipNet -lt 0) { $preSec = -$refSkipNet; $refSkipNet = 0 }

    $preSmp  = [int][Math]::Round($preSec * $Rate)
    $refDur  = [Math]::Max(0.0, $netDur - $preSec)
    $rawMix2 = Join-Path $tmp 'mix2.raw'
    $rawRef2 = Join-Path $tmp 'ref2.raw'
    $rawNet  = Join-Path $tmp 'net.raw'

    $okM2 = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y', '-i', $Mix, '-ss', $netStart.ToString($inv),
        '-t', $netDur.ToString($inv), '-vn', '-ac', '2', '-ar', "$Rate", '-f', 'f32le', $rawMix2)
    $okR2 = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y', '-i', $Ref, '-ss', $refSkipNet.ToString($inv),
        '-t', $refDur.ToString($inv), '-vn', '-ac', '2', '-ar', "$Rate", '-f', 'f32le', $rawRef2)
    if (-not $okM2 -or -not $okR2) {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Write-Done $Done 'FAIL:no s-ha pogut decodificar la finestra neta'
        throw 'ffmpeg KO (senyal neta)'
    }

    $A2 = [NullCore]::LoadRaw($rawMix2)
    $B2 = [NullCore]::LoadRaw($rawRef2)
    $tramSmp = [int][Math]::Round($NetTramSec * $Rate)
    if ($NetAdapt) {
        $netSig = [NullCore]::NetSpanAdaptLR($A2, $B2, $preSmp, $NetMaxG, $tramSmp, $NetMinRefDb)
    } else {
        $netSig = [NullCore]::NetSpanStereoLR($A2, $B2, $preSmp, $netGain, $NetMinR, $tramSmp)
    }
    if ($netSig.Length -lt 2) {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Write-Done $Done 'FAIL:la resta ha eixit buida'
        throw 'Resta buida'
    }

    [NullCore]::SaveRaw($netSig, $rawNet)
    $okN = Invoke-Ffmpeg @('-hide_banner', '-nostdin', '-y',
        '-f', 'f32le', '-ar', "$Rate", '-ac', '2', '-i', $rawNet,
        '-ac', '2', '-ar', "$Rate", '-c:a', 'pcm_s16le', $Net)
    if (-not $okN -or -not (Test-Path -LiteralPath $Net)) {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        Write-Done $Done "FAIL:no s-ha pogut escriure $Net"
        throw 'WAV net KO'
    }

    $netInfo = [ordered]@{
        path       = $Net
        startSec   = N $netStart 6
        durSec     = N $netDur 6
        g          = N $netGain 5
        minR       = N $NetMinR 3
        tramSec    = N $NetTramSec 3
        adapt      = [bool]$NetAdapt
        maxG       = N $NetMaxG 3
        minRefDb   = N $NetMinRefDb 2
        skipRef    = N $refSkipNet 6
        preMs      = N ($preSec * 1000.0) 3
        frames     = [int]($netSig.Length / 2)
    }
    Invoke-Say ''
    Invoke-Say ('  SENYAL NETA: {0}' -f $Net)
    Invoke-Say ("    tram ...... {0:N3} s + {1:N3} s ({2} frames) · g={3:N4} · salt de ref {4:N4} s · pre {5:N1} ms" -f `
        $netStart, $netDur, $netInfo.frames, $netGain, $refSkipNet, ($preSec * 1000.0))
    if ($NetAdapt) {
        Invoke-Say ("    guany ..... ADAPTATIU per tram (minims quadrats, limit {0:N2}, trams de {1:N3} s, ref minima {2:N0} dBFS)" -f $NetMaxG, $NetTramSec, $NetMinRefDb)
    } elseif ($NetMinR -gt 0) {
        Invoke-Say ("    gate ...... nomes es resta on r >= {0:N2} (trams de {1:N3} s)" -f $NetMinR, $NetTramSec)
    }
}

# 6) JSON
$result = [ordered]@{
    ok        = $true
    version   = 'v1'
    core      = [NullCore]::Version()
    mix       = $Mix
    ref       = $Ref
    rate      = $Rate
    mixPos    = N $MixPos 6
    skipRef   = N $SkipRef 6
    winSec    = $WinSec
    spanMs    = $SpanMs
    lag0      = $lag0
    lagSamples = $lag
    driftMs   = N $driftMs 3
    refPosSec = N $refPosSec 6
    r         = N $rRaw 5
    g         = N $g 5
    gDb       = N ([NullCore]::Db([Math]::Abs($g))) 2
    mixDb     = N $mixDb 2
    resDb     = N $resDb 2
    nullDb    = N $nullDb 2
    nullUnityDb = N $nullUniDb 2
    worstTramDb = N $worst 2
    bestTramDb = N $best 2
    tramsOk   = $tramsOk
    trams     = $rows.Count
    minNullDb = $MinNullDb
    verdict   = $verdict
    net       = $netInfo
    profile   = $rows
}
if ($Json) {
    try {
        [System.IO.File]::WriteAllText($Json, (ConvertTo-Json $result -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
        Invoke-Say ("  JSON: {0}" -f $Json)
    } catch {
        Write-Warning "No s'ha pogut escriure $Json : $($_.Exception.Message)"
    }
}

Write-Done $Done $verdict
Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
# NULL i NULL_PARCIAL son verds (la resta servix); NO_NULL es error.
if ($verdict -eq 'NO_NULL') { exit 1 } else { exit 0 }
