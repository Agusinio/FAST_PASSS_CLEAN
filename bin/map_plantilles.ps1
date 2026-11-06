<#
.SYNOPSIS
    Mapa MESURAT «item d'escaleta -> plantilla d'Audios\» (careta/molinet/publi).

.DESCRIPTION
    `Audios\` té 8 WAV (caretes i molinets) i l'escaleta en diu el NOM de
    l'item, pero NO diu quin d'eixos WAV sona. Eixa relacio no s'endevina pel
    nom: es MESURA. Per a cada item d'escaleta (careta, molinet, anada/tornada
    de publi...) que cau dins del media s'extrau el tros que li toca i es busca
    (A CEGUES, les 8 plantilles) quina hi casa, amb `cmp_samples.ps1` al gra fi
    (lag a la mostra, guany, cancel.lacio per finestres). El guanyador es el que
    mes cancela (i, a igualtat, el que te mes r).

    PER QUE AIXO I NO EL NOM: mesurat el 06/11 al TNV (V4): l'item
    «MOLINET TORNADA PUBLI 1» (21:36:39) casa amb
    `3CatInfo_TN_tornada_publi_.WAV` (r=0,999 · 25,6 dB de cancel.lacio) i no
    amb `3CatInfo_TN_molinet_01/02` (r<=0,44). I l'item «MOLINET 1» (21:22:06)
    NO arriba al guard amb cap de les 8 (millor `molinet_01` r=0,659 · 2,5 dB):
    eixe molinet no te plantilla o va molt cobert per la veu.

    EL QUE NO FA: tocar res. Només llig i escriu un JSON (i una taula per
    pantalla). Les plantilles i el motor son els de sempre.

.PARAMETER Fastpass
    JSON d'on ixen els items i el media. Pot ser:
      - l'escaleta del dia (`escaleta_on_demand_*.json`): `escaleta.liniesEscaleta`
        (tots els items) + `cleanFeed.mediaPath/mediaStart`  <- el bo per al mapa
      - el manifest del bloc (`TNV_V4.fastpass.json`): nomes porta els
        `escaletaItems` del bloc (servix per a mirar un item concret)
    Alias: `-Escaleta`.

.PARAMETER Media
    Fitxer d'audio a mesurar. Per defecte, `cleanFeed.mediaPath` del JSON.

.PARAMETER RefDir
    Carpeta de plantilles (per defecte `Audios` de l'extensio).

.PARAMETER Titol
    Patro (regex) dels titols d'item a mesurar (per defecte
    `CARETA|MOLINET|PUBLI|TORNADA`). Els blocs d'anuncis (`++++PUBLI++++`) es
    salten sempre.

.PARAMETER Dur
    Segons de media a analitzar per item (per defecte 6).

.PARAMETER MaxLagSec
    Marge de busca del lag (per defecte 2,5 s: els molinets porten ~1,2 s de
    capcalera abans de la musica).

.PARAMETER Rate
    Mostreig del WAV temporal del media (per defecte 16000: prou per a decidir
    QUINA plantilla es, i prou lleuger per a extraure els 76 min del media).

.PARAMETER CmpRate
    Mostreig de la MESURA (`cmp_samples.ps1`). Per defecte 48000, i no es pot
    baixar: mesurat el 06/11, la MATEIXA musica dona r=0,999 / 25,6 dB a
    48 kHz i r=0,781 / 4,1 dB a 16 kHz (amb el lag arrodonit a la mostra, el
    que queda del dalt de la banda es descorrelaciona). El mix pot vindre
    limitat en banda del WAV temporal: aixo NO afecta la decisio.

.PARAMETER MinR / MinDb
    Guards: un item compta com a HIT si el guanyador te r >= MinR (0,70) i
    cancel.lacio >= MinDb (6 dB).

.PARAMETER Out
    Fitxer JSON de resultat (per defecte `%TEMP%\fp_map_plantilles.json`).

.PARAMETER Cache
    WAV temporal on es deixa l'audio del media a `-Rate` (per defecte
    `%TEMP%\fp_map_<nom>.wav`). Si ja hi es, no es torna a extraure.

.EXAMPLE
    bin\map_plantilles.ps1 -Fastpass "\\NAS\...\V4\TNV_V4.fastpass.json" -Out C:\temp\map.json
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][Alias('Escaleta')][string] $Fastpass,
    [string] $Media       = '',
    [string] $RefDir      = 'Audios',
    [string] $Titol       = 'CARETA|MOLINET|PUBLI|TORNADA',
    [double] $Dur         = 6,
    [double] $MaxLagSec   = 2.5,
    [int]    $Rate        = 16000,
    [int]    $CmpRate     = 48000,
    [double] $MinR        = 0.70,
    [double] $MinDb        = 6,
    [int]    $MaxItemDur  = 60,
    [string] $Out         = '',
    [string] $Cache       = ''
)

$root   = Split-Path -Parent $PSScriptRoot
$cmpPs  = Join-Path $PSScriptRoot 'cmp_samples.ps1'
if (-not (Test-Path -LiteralPath $cmpPs)) { throw "No trobe $cmpPs" }
if (-not $Out) { $Out = Join-Path $env:TEMP 'fp_map_plantilles.json' }
if (-not $Cache) {
    $Cache = Join-Path $env:TEMP ('fp_map_' + [IO.Path]::GetFileNameWithoutExtension($Fastpass) + '_' + $Rate + '_st.wav')
}
$refFull = if ([IO.Path]::IsPathRooted($RefDir)) { $RefDir } else { Join-Path $root $RefDir }

# ---------------------------------------------------------------- utils ---

# TC -> segons. Admet "mm:ss", "hh:mm:ss" i "hh:mm:ss:ff" (el TC del media
# porta els fotogrames: `cleanFeed.mediaStart` = "20:59:00:00"). $null si no es
# llegible.
function TcToSec([object] $s) {
    if ($null -eq $s) { return $null }
    $txt = ([string] $s).Trim()
    if ($txt -eq '' -or $txt -eq '00:00:00') { return $null }
    $parts = @($txt -split ':')
    if ($parts.Count -lt 2 -or $parts.Count -gt 4) { return $null }
    $nums = @()
    foreach ($p in $parts) {
        $n = 0.0
        if (-not [double]::TryParse($p, [ref] $n)) { return $null }
        $nums += $n
    }
    # Els fotogrames (4t camp) NO son decimals: es passen a fraccio de segon.
    if ($nums.Count -eq 4) {
        $ff = $nums[3]
        $nums = @($nums[0], $nums[1], $nums[2])
        $fra = $ff / 25.0
    } else {
        $fra = 0.0
    }
    $tot = 0.0
    foreach ($n in $nums) { $tot = $tot * 60 + $n }
    return ($tot + $fra)
}

function FmtTc([double] $sec) {
    if ($null -eq $sec) { return '-' }
    $h = [int][Math]::Floor($sec / 3600)
    $m = [int][Math]::Floor(($sec - $h * 3600) / 60)
    $s = $sec - $h * 3600 - $m * 60
    return ('{0:00}:{1:00}:{2:00}' -f $h, $m, [int][Math]::Floor($s))
}

# Ressenya d'un JSON de cmp_samples: per a cada plantilla, el millor punt
# (r, cancel.lacio, nivell, lag) i quantes finestres passen el guard de dB.
function Ressenya([object] $res) {
    $br = -2.0; $bdb = -999.0; $blev = 0.0; $bsec = 0.0; $nOk = 0
    foreach ($c in $res.channels) {
        foreach ($w in $c.rows) {
            $r = [double] $w.r
            if ([double]::IsNaN($r)) { continue }
            if ($r -gt $br) { $br = $r; $bdb = [double] $w.db; $blev = [double] $w.lev; $bsec = [double] $w.sec }
            if ([double] $w.db -ge $MinDb) { $nOk++ }
        }
    }
    $lag = 0.0
    if ($res.channels -and $res.channels.Count -gt 0) { $lag = [double] $res.channels[0].lagMs }
    return [pscustomobject]@{ ref = $res.ref; r = $br; db = $bdb; lev = $blev; sec = $bsec; lagMs = $lag; winOk = $nOk }
}


# ---------------------------------------------------------------- lectura ---

if (-not (Test-Path -LiteralPath $Fastpass)) { throw "No trobe $Fastpass" }
$mf = Get-Content -LiteralPath $Fastpass -Raw -Encoding UTF8 | ConvertFrom-Json
$mediaStart = TcToSec $mf.cleanFeed.mediaStart
if ($null -eq $mediaStart) { throw 'cleanFeed.mediaStart no llegible al JSON' }
if (-not $Media) { $Media = [string] $mf.cleanFeed.mediaPath }
if (-not $Media) { throw 'Cal -Media: el JSON no porta cleanFeed.mediaPath' }

# Items: si el JSON es l'escaleta sencera (`escaleta.liniesEscaleta`, 230
# linies del dia) s'agafa d'ahi; si es el manifest del bloc (`.fastpass.json`,
# `escaletaItems`) nomes hi son els del bloc. Els camps de temps son els
# mateixos.
if ($mf.escaleta -and $mf.escaleta.liniesEscaleta) {
    $items = @($mf.escaleta.liniesEscaleta)
    $font = 'escaleta sencera'
} elseif ($mf.escaletaItems) {
    $items = @($mf.escaletaItems)
    $font = 'escaletaItems del manifest (nomes el bloc)'
} else {
    throw 'El JSON no porta ni escaleta.liniesEscaleta ni escaletaItems'
}

Write-Host ('map_plantilles | WAV temporal ' + $Rate + ' Hz estereo | mesura ' + $CmpRate + ' Hz | finestres 0,5 s | marge lag +/-' + $MaxLagSec + ' s')
Write-Host ('MEDIA: ' + $Media + '  (mediaStart ' + (FmtTc $mediaStart) + ', TC del dia)')
Write-Host ('REF:   ' + $refFull)

# Un sol descodificat del media a un WAV temporal: despres cada item es mesura
# contra el WAV local (si no, cada `-ss` sobre el media del NAS costa ~1 min).
# ESTEREO a posta: `cmp_samples` compara canal a canal, i amb un downmix mono
# la cancel.lacio cau de 25 dB a 4 dB (mesurat: la mateixa musica dona r=0,999
# en estereo i r=0,788 en mono).
$ffmpeg = Join-Path $PSScriptRoot 'ffmpeg\bin\ffmpeg.exe'
if (-not (Test-Path -LiteralPath $ffmpeg)) { throw "No trobe $ffmpeg" }
if (-not (Test-Path -LiteralPath $Cache)) {
    Write-Host ('extraient l''audio del media (estereo ' + $Rate + ' Hz) -> ' + $Cache)
    $log = & $ffmpeg -hide_banner -loglevel error -y -i $Media -vn -ac 2 -ar $Rate -c:a pcm_s16le $Cache 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Cache)) {
        throw ('ffmpeg KO: ' + (($log | Select-Object -Last 3) -join ' '))
    }
}

# ---------------------------------------------------------------- mesura ---

$rows = New-Object System.Collections.ArrayList
$vists = @()
Write-Host ('items: ' + $items.Count + ' (' + $font + ')')
foreach ($it in $items) {
    $ti = ([string] $it.titol).Trim()
    if ($ti -eq '' -or $ti -notmatch $Titol) { continue }
    if ($ti.StartsWith('+')) { continue }   # blocs d'anuncis: no son plantilla

    # Entrada de l'item: OnAir -> (SortidaPrevista - duradaOnAir) -> Prevista
    $ent = TcToSec $it.horaEntradaOnAir
    if ($null -eq $ent) {
        $sort = TcToSec $it.horaSortidaPrevista
        $durA = TcToSec $it.duradaOnAir
        if ($null -ne $sort -and $null -ne $durA) { $ent = $sort - $durA }
    }
    if ($null -eq $ent) { $ent = TcToSec $it.horaEntradaPrevista }
    if ($null -eq $ent) { continue }

    $durIt = TcToSec $it.durada
    if ($null -ne $durIt -and $durIt -gt $MaxItemDur) { continue }

    $pos = $ent - $mediaStart
    if ($pos -lt 0) { continue }
    # Dos items poden resoldre's al mateix segon: es mesura una sola volta.
    if (@($vists | Where-Object { [Math]::Abs($_ - $pos) -lt 1.0 }).Count -gt 0) { continue }
    $vists += $pos

    Write-Host ('  ' + (FmtTc $ent) + '  ' + $pos.ToString('N1') + ' s del media  ' + $ti)
    $tmpJ = Join-Path $env:TEMP ('fp_map_' + [guid]::NewGuid().ToString('N') + '.json')
    $res = @()
    try {
        & $cmpPs -Mix $Cache -MixStart $pos -Dur $Dur -RefDir $refFull -Rate $CmpRate `
            -MaxLagSec $MaxLagSec -WinSec 0.5 -Json $tmpJ *> $null
        if (Test-Path -LiteralPath $tmpJ) {
            $cj = Get-Content -LiteralPath $tmpJ -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($r0 in $cj.results) { $res += (Ressenya $r0) }
        }
    } catch {
        Write-Host ('    KO: ' + $_.Exception.Message)
    }
    Remove-Item -LiteralPath $tmpJ -Force -ErrorAction SilentlyContinue
    if ($res.Count -eq 0) { continue }

    # Mana la cancel.lacio (si la musica hi es, cancela; si no, 0 dB) i
    # despres el r. Ull: `r` sola enganya amb senyals baixos (soroll correlat).
    $ord = @($res | Sort-Object -Property @{ Expression = 'db'; Descending = $true },
                                          @{ Expression = 'r';  Descending = $true })
    $w = $ord[0]
    $snd = if ($ord.Count -gt 1) { $ord[1] } else { $null }
    $hit = ($w.r -ge $MinR -and $w.db -ge $MinDb)
    $rows.Add([pscustomobject]@{
        titol    = $ti
        tc       = (FmtTc $ent)
        mediaSec = [Math]::Round($pos, 1)
        ref      = $w.ref
        r        = [Math]::Round($w.r, 3)
        db       = [Math]::Round($w.db, 1)
        lev      = [Math]::Round($w.lev, 1)
        lagMs    = [Math]::Round($w.lagMs, 0)
        winOk    = $w.winOk
        segon    = if ($snd) { $snd.ref } else { '' }
        segonDb  = if ($snd) { [Math]::Round($snd.db, 1) } else { 0 }
        ok       = $hit
    }) | Out-Null
}

# ---------------------------------------------------------------- ressenya ---

Write-Host ''
Write-Host '== MAPA (guanyador per cancel.lacio, despres r) =='
foreach ($r in $rows) {
    $stat = if ($r.ok) { 'HIT ' } else { 'no  ' }
    Write-Host ('{0} {1,-34} {2,-30} {3} r={4,5:N3} canc={5,5:N1} dB  lev={6,6:N1} dBFS  lag={7,6:N0} ms  win={8,2}  | 2n {9} ({10:N1} dB)' -f `
        $r.tc, $r.titol, $r.ref, $stat, $r.r, $r.db, $r.lev, $r.lagMs, $r.winOk, $r.segon, $r.segonDb)
}

$payload = [pscustomobject]@{
    ok = $true
    fastpass = $Fastpass; media = $Media; mediaStart = $mediaStart
    rate = $Rate; cmpRate = $CmpRate; dur = $Dur; maxLagSec = $MaxLagSec; minR = $MinR; minDb = $MinDb
    rows = @($rows)
}
$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($Out, ($payload | ConvertTo-Json -Depth 6), $enc)
Write-Host ''
Write-Host ('JSON -> ' + $Out)
Write-Host ('items mesurats: ' + $rows.Count + ' | HIT: ' + @($rows | Where-Object { $_.ok }).Count)
