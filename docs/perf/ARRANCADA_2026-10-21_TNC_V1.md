# Arrencada en fred — 2026-10-21 (TNC V1, primer projecte del dia)

> Mesurament capturat de `_boot_timing.log` (extensió) a les 11:29:32–11:29:38 del
> 21/10/2026, abans de canviar res. Còpia crua: `docs/perf/arrancada_2026-10-21_TNC_V1.log`.

## Mecanisme (on es bolquen els temps)

1. `js/main.js` (arrencada, ~L231) obre `_bootLines` i exposa `FASTPASS_UI.Boot.mark(etiqueta, lvl)`.
   Cada marca ESCRIU EL FITXER SENCER (`window.cep.fs.writeFile`) a:
   - `%EXTENSION%\_boot_timing.log` (destí natural), i
   - `C:\temp\_boot_timing.log` (còpia de seguretat).
   S'escriu amb `window.cep.fs` directament i NO amb `utils.log`, perquè a l'arrencada
   encara no hi ha ruta de log resolta (era el motiu pel qual les línies `⏱️ [BOOT]`
   no apareixien enlloc).
2. Qualsevol mòdul pot marcar: `4_Context.js` ho fa amb `_bmark()` (prefix `[Context]`),
   i des del 21/10 també `escaleta_io.js` (prefix `[ER:IO]`).
3. Quan l'arrencada acaba (`ARRENCADA COMPLETA`), `_bootClosed = true`: els cicles de
   fons (auto-refresc de 60 s) ja NO creixen el fitxer (només consola), excepte amb
   `lvl = 'force'`.
4. Si el total supera `_bootAutoOpenMs` (15 s per defecte, ajustable amb
   `FASTPASS_UI.Boot.setAutoOpen(ms)`), el log S'OBRE TOT SOL en acabar (un cop per sessió).
5. El log del PROJECTE (`FASTPASS.log` / `_keyframe_trace.log`) es buida en assignar
   projecte (`utils._setLogPath`), així que **l'arrencada només queda a `_boot_timing.log`**.

## Mesura (TNC V1, 21/10 11:29:32, primer arrencada del dia)

| + ms | Δ ms | Fita |
|---:|---:|---|
| 0 | 0 | main.js: arrencada |
| 6 | 6 | ruta de l'extensió resolta |
| 25 | 19 | DIAG P1 ping motor JSX (16 ms) |
| 41 | 16 | DIAG P2 `$.writeln` (11 ms) |
| 90 | 49 | DIAG P3 bootstrap (cua motor 2 ms, execució 44 ms) |
| 93 | 3 | motor JSX a punt |
| 117 | 24 | comprovació de frescor JSX (20 ms) |
| 121 | 4 | `[Context] init · selectors PROG/BLOC` |
| 140 | 19 | `checkContext · readFolder NAS` (14 ms, 0 fitxers) |
| 1523 / 3012 / 4522 | ~1500 | DIAG HB 1/2/3 → **el fil del panell és VIU** (no és un bloqueig JS) |
| **5377** | **~4400** | **`checkContext · escaleta getStatus` → 5233 ms** |
| 5384 | 7 | `escaleta local/FOTO` (4 ms) |
| 5404 | 20 | sonda ràpida media+wotts (17 ms) |
| 5407 | 3 | `checkContext · TOTAL` (5282 ms) → ESPERANT |
| 5435 | 3 | **ARRENCADA COMPLETA → 5,4 s** |

**Veredicte:** 5233 ms dels 5435 ms (96%) són UNA sola crida al motor
(`EscaletaReader.getStatus`), i els batecs cardíacs demostren que el panell estava
viu mentre esperava: el temps es consumia DINS d'ExtendScript, no en el fil de la UI.

## Causa

`getStatus` → `findLatestValid` → `_listEscaletas` → `IO.listFolder` →
`FASTPASS.IO.scanDirectory` (`jsx/modules/2_IO.jsx`), que per a CADA fitxer fa:

- `f.length`, `f.modified`, `f.created` (3 propietats = 3 stats pel pont ExtendScript), i
- si `f.length` val 0 (habitual en UNC) **obre el fitxer** (`f.open('r')` + `f.eof`).

La carpeta `\\192.168.147.199\public\...\ESCALETES` té **127 fitxers** i el natiu de
Windows la llista amb 3 propietats en **~10 ms** (mesurat amb PowerShell el 21/10;
`chyrons` amb 958 fitxers = 43 ms). És a dir: el cost no és la xarxa, és el motor
ExtendScript (≈4 ms per propietat/fitxer). A més, `getStatus` llistava la carpeta
**dos cops** (`findLatestValid` + `findLatest`).

## Canvis (2026-10-21)

1. **Llistat natiu** (`escaleta_io.js`):
   - `_listViaNode`: `fs.promises.readdir(p, {withFileTypes:true})` — **asíncron**, fora
     del motor i del fil de la UI, sense cap stat. Només interessen noms `.json`.
   - `_listViaCep`: `cep.fs.readdir` (síncron natiu) com a segon camí.
   - `IO.listFolder` (motor) queda com a **últim** respatller, amb log `🐢`.
   - El format d'entrada és el mateix que `scanDirectory`
     (`name/path/modified/created/size/isDir`), així que `findLatest`/`findLatestValid`
     no canvien.
2. **Memòria curta** `LIST_TTL_MS = 8000` + `_invalidateEscaletas()`: el segon llistat de
   `getStatus` i els repintats surten gratis.
3. **Deduplicació** de crides simultànies (`_listInflight`).
4. **`warmList()`** cridat a `main.js` just després de resoldre la ruta de l'extensió:
   el llistat s'engega EN PARAL·LEL al bootstrap del motor.
5. **`load()`** normalitza els separadors per a `cep.fs.readFile` (`/` → `\`):
   `workFolder()` genera `…\PROVES\02_COMARQUES_PROJECTES/2026_10_20/V1/…` i el natiu
   responia `err=3` → queia al respatller ExtendScript (bloqueja Premiere + risc de
   mojibake; vist al log del 21/10 a les 11:31:08).
6. **`findLatestValid`** reutilitza el JSON ja llegit al fallback (`bestInvalid.data`):
   abans el tornava a llegir del NAS i a parsejar.
7. Instrumentació fina: `[ER:IO]` marca al `_boot_timing.log` el llistat (ms, fitxers,
   camí: node/cep/jsx), cada `load` (ms, KB) i el total de `getStatus`.

## Com verificar-ho

1. Tancar i reobrir el panell en fred (primer cop del dia) i mirar `_boot_timing.log`:
   han d'aparèixer, entre d'altres:
   - `escaletes: llistat engegat en paral·lel`
   - `[ER:IO] llistat escaletes (X ms, N fitxers, via node)`
   - `[ER:IO] getStatus TN_…/V1 (Y ms) → …`
   Si el total segueix per sobre de 1 s, la marca diu exactament quin camí s'ha fet
   servir (`via jsx` = ha caigut al motor → mirar `readdir Node KO`).
2. Prova automatitzada: `bin/smoke/fp_probe_arrancada.js` (fase 22-arrancada, #BOOT/1..#BOOT/15).

## Pendent (següent coll d'ampolla, ja fora de l'arrencada)

Al mateix log de projecte (11:31:08→11:31:28) el CREAR es menja ~20 s:
`[SCAN:wotts]` 4 s, portades 5 s, `ffprobe` 3 s i el cleanFeed 10 s. Els dos scans
també passen per `IO.scanDirectory` (necessiten `created`, que `cep.fs.stat` no dóna en
UNC) → el pas natural és `fs.promises.stat` de Node (`birthtime`) amb el mateix esquema
Node → CEP → JSX.

## Actualització (2026-10-21, mateixa jornada) · model LOCAL-FIRST

Un cop el llistat va ser natiu, el pas següent era **deixar de fer-lo**: `getStatus` sobre
`…\ESCALETES` només decidia l'estat del botó, i l'estat es pot decidir sense tocar el NAS.

- **Fora `getStatus` de l'arrencada** (i també del camí d'ACTUALITZAR, on no servia de res):
  l'escaleta es busca NOMÉS al directori del projecte (`lookupLocalStatus`, ara amb
  `_listProjectFiles` : Node → CEP → JSX, sense obrir el motor ni llistar dos cops).
- **Desbloqueig del CREAR = wotts del bloc d'avui** (`Scan.wottsToday`, `birthtime` amb caché
  per nom): `readdir` 32 ms (963 noms) + `stat` 1,5 ms/fitxer la primera vegada i ~35 ms per
  poll de 15 s després. Si no n'hi ha → `MASSA D'HORA`; si la carpeta del projecte no existeix
  o no té escaleta, el CREAR fa una FOTO i crea amb eixa escaleta.
- **Cost esperat de l'arrencada**: `readFolder(workFolder)` (~14 ms) + escaleta local (~20 ms)
  + sonda de wotts (35-250 ms la primera del dia) ≈ **70-300 ms**, contra els **5 435 ms**
  d'aquest mesurament. Queda pendent confirmar-ho amb un altre `_boot_timing.log` en fred: hi
  ha d'aparèixer `checkContext · escaleta local (…)` i CAP línia `escaleta getStatus`.
- **Wotts del CREAR**: `Scanner.wotts` (963 fitxers per JSX, ~4 s) s'ha substituït per
  `wottsToday` al semàfor; queden com a proper coll `portades` i `cleanFeed`.

