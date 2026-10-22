# Arrencada en fred — 2026-10-22 (ordinador engegat, primer cop del dia)

> Mesurament capturat de `_boot_timing.log` (extensió) a les 08:57:33–08:59:05 del
> 22/10/2026, **després** de tots els canvis del 21/10 (fora `getStatus`, sondes
> `wottsToday`/`mp4Today`). Còpia crua: `docs/perf/arrancada_2026-10-22_cold.log`.
> Reobre el **BUG #113** (mars de 2026-09-30 el donava per `fet_parcial` amb 14,1 s).

## Mesura

| + ms | Δ ms | Fita |
|---:|---:|---|
| 1 | 1 | `main.js: arrencada` |
| 13 | 8 | `[ER:IO] llistat escaletes (5 ms, 125 fitxers, via cep)` |
| 95 | 53 | `DIAG P3 bootstrap` (cua motor 2 ms · execució 44 ms) |
| 128 | 7 | `checkContext · readFolder NAS` (**3 ms**, 0 fitxers) |
| 133 | 5 | `checkContext · escaleta local` (1 ms) |
| 1530 … 84027 | ~1500 | `DIAG HB 1…56` → **el fil del panell és VIU** (no és un bloqueig JS) |
| **84073** | **46** | **`checkContext · readFolder NAS` (72,1 s, 0 fitxers)** ← 2a execució |
| **84078** | **5** | **`checkContext · readFolder NAS` (69,1 s, 0 fitxers)** ← 3a execució |
| 92684 | 2606 | `checkContext · MASSA D'HORA (sense MP4 origen ni wotts)` |
| 92689 | 5 | `checkContext · TOTAL (92,6 s) → MASSA [early]` |
| 92712 | 3 | `ARRENCADA COMPLETA` → **92,7 s** (s'obre el log tot sol) |

## Diagnòstic

Les marques diuen dues coses que, juntes, expliquen els 92,7 s:

1. **Hi havia TRES `checkContext` en vol alhora.** La línia de +128 ms és la
   invocació d'`init()` (3 ms). Les dos de +84 s són **altres dos** `checkContext`
   que van arrancar a ~+12 s i ~+15 s (72,1 s i 69,1 s d'espera dins del
   `readFolder`): el poll de 15 s de `main.js` (`_ctxRefreshPollMs`) i el
   `Registry._onProjectChange`. Cap de les tres sabia de les altres.
2. **El temps es consumeix al NAS, no al fil de la UI.** Els batecs cardíacs de
   1,5 s no s'aturen mai: el panell és viu. El que s'encua són les lectures
   (llistat del directori del bloc i, sobretot, `stat`/`birthtime` de cada
   candidat) contra un SMB **fred** (reconnectat de nou en engegar l'ordinador).
   La primera lectura del `workFolder` torna en 3 ms (carpeta inexistent), però
   les sondes de wotts/MP4 paguen la connexió i el recorregut, i mentrestant
   qualsevol altra lectura s'hi queda darrere.

Contribuïa a empitjorar-ho que la **caché de dates (`_wottDateCache`) vivia
només a memòria**: cada recàrrega del panell tornava a fer `stat` de tots els
candidats del bloc (`birthtime`, l'única data fiable), encara que ja s'hagueren
datat el dia abans. Amb el NAS calent eren ~1,5 ms/fitxer; amb el NAS fred, el
mateix treball es mesura en desenes de segons.

**Veredicte:** no és un únic `getStatus` lent (això es va arreglar el 21/10), és
**treball duplicat i sense límit sobre un NAS fred**: 3 execucions del
sintetitzador × (llistat + sondes) i cap espera màxima, així que el panell
ensenya l'estat quan l'última lectura acaba de tornar (92,6 s).

## Canvis (22/10, #113)

1. **Single-flight de `checkContext`** (`js/core/4_Context.js`): `checkContext`
   passa a ser la porta d'entrada i delega el cos a `_runCheckContext`. Si ja hi
   ha una execució en vol, la crida s'hi **enganxa** (no en llança cap altra) i,
   com a molt, es programa **un** recàlcul en acabar (`_ccAgain`).
2. **Sondes amb espera limitada i en paral·lel**: `_wottsToday` i `_mediaToday`
   van amb `_withTimeout(…, PROBE_TIMEOUT_MS = 8000)` i es llancen amb
   `Promise.all`. Si el NAS no respon, l'estat cau a **ESPERA** (mai `MASSA
   D'HORA` per error) i el poll de 15 s ho reintenta; **la sonda no es cancel·la**:
   segueix en segon pla omplint la caché.
3. **Dedupe de sondes al `Scanner`**: `_probeInflight`/`_probeKey` fan que
   `wottsToday`/`mp4Today` compartisquen UNA lectura per clau encara que les
   demanen tres crides alhora.
4. **Caché de dates persistent**: `_wottDateCache` es desa a `localStorage`
   (`fp_wott_dates_v1`, sostre de 3000 noms) i es recupera a l'arrencada → una
   recàrrega del panell **no torna a fer `stat`** de res ja datat.
5. **Instrumentació fina al `_boot_timing.log`**: marques `[SCAN]` amb el temps de
   cada meitat de la sonda (`wotts · llistat (… noms, via node)`, `wotts ·
   datació (… fitxer(s) nous)`, `MP4 · llistat`, `MP4 · datació`) i marques
   `[Context] checkContext · sonda wotts / sonda MP4` (o `TIMEOUT/ERROR`).

## Com verificar-ho (proper arrencada en fred)

Reiniciar l'ordinador i obrir el panell; al `_boot_timing.log`:

- `ARRENCADA COMPLETA` **≤ ~10 s** (abans 92,7 s) i, per tant, el log **no**
  s'obre tot sol (llindar 15 s).
- **Una sola** línia `checkContext · readFolder NAS`. Si n'hi ha dos o tres, el
  single-flight no està actiu (mirar el cache-bust de `4_Context.js`).
- `[Context] checkContext · sonda wotts (…)` i `sonda MP4 (…)` amb valors, o
  `TIMEOUT/ERROR (8 s)` si el NAS encara estava fred → llavors el botó queda en
  **ESPERA** uns segons i el poll de 15 s el resol (log `Sonda de wotts KO`).
- `[SCAN] wotts · llistat (X ms, N noms, via node)` i `wotts · datació (X ms, M
  fitxer(s) nous)`: la segona ha de ser petita o desaparèixer després de la
  primera arrencada del dia (caché persistida).
- Prova automatitzada: `bin/smoke/fp_smoke_build.ps1` → `#WOTT/25` (dedupe),
  `#WOTT/26` (caché persistent), `#WOTT/27` (single-flight), `#WOTT/28`
  (timeout + paral·lel) i `#WOTT/29` (marques `[SCAN]`).

## Pendent (següent coll d'ampolla)

- Si la datació per `birthtime` segueix costant desenes de segons amb el NAS fred,
  el següent pas és **no datar en calent**: usar la data del NOM quan hi siga i,
  si no, deixar la sonda en `pending` (ESPERA) fins que el poll la resolga amb el
  NAS calent — la caché persistida ja evita repetir-ho entre recàrregues.
- El mateix patró (single-flight + espera limitada) es podria aplicar al
  `Registry.poll` si algun dia torna a fer feina pesada.
