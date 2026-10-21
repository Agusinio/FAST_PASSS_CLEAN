# Pla de feines per fases — FAST >>> PASS

Data: **2026-10-21** · origen: sessió de proves amb usuaris reals
Abast: 4 punts reportats per l'usuari. Cada fase es tanca amb validació (smoke + Premiere) i
entrada a `docs/BUGS_FIXED.md` / `docs/CHANGELOG.md`.

| Fase | Tema | Estat |
|------|------|-------|
| **F0** | Portada (#174): el PNG ha de ser EXACTAMENT el frame triat | implementada · **pendent validació a Premiere** |
| **F1** | RESET GENERAL: esborrat ABSOLUT de la carpeta del projecte (#175) | implementada · pendent validació a Premiere |
| **F2** | Pantalla de CONFIG: rutes i variables definides per l'usuari | implementada · pendent validació a Premiere |
| **F3** | Editor de SUBTÍTOLS: seleccionar/esborrar clips + importar sintètics (Ctrl) + reomplir buits | pendent |
| **F4** | MARKERS: anàlisi completa de la mecànica + snapshots de posicions + fi dels TC amuntegats | pendent (document primer) |

---

## F0 · PORTADA: el frame triat no es mou (BUG #174)

**Fet:** `js/logic/18_Portada_Window.js` (`PortadaWindow.plan` / `frameError`), `flow_render.js`
usa el pla (s'escurça la CUA de la finestra, mai el frame), `9_Render.jsx` llig el timebase REAL
de la seqüència per construir el timecode de QE. Guarnició: part E de `fp_probe_portada.js`.

**Pendent (manual, a Premiere):**
1. Recarregar el panell (cache-busts de `flow_render.js` i `18_Portada_Window.js`).
2. Frame **a prop del final** d'un clip llarg → exportar portada → el PNG ha de ser el frame
   triat; al log: `finestra X.XXs (pre 0,08 + cua Y.YY)` amb la cua escurçada.
3. Frame **lluny del final** → comportament idèntic a l'anterior (#160).
4. Seqüència **no-25 fps** (23,976 / 24 / 29,97 / 50 / 59,94) → el frame exportat és el triat.

---

## F1 · RESET GENERAL: esborrat absolut (#175) — FET EN AQUESTA FASE

**Problema:** el RESET deixava fitxers dins la carpeta del projecte i el flux NOU treballava
sobre material vell.

**Causa:** `fs.rmSync({recursive:true,force:true})` s'atura al primer error (a Windows: `.prproj`
i `Adobe Premiere Pro Auto-Save` encara oberts → EPERM) i deixa l'arbre MIG esborrat; a més
`runReset` només avisava i **continuava** creant el projecte. Fora de la carpeta sobrevivien les
còpies de marcadors SRT de `C:/temp` (mateix `projectKey` → es podien restaurar al projecte nou).

**Solució implementada:**
- `js/logic/19_Fs_Wipe.js` (NOU, pur): esborrat entrada per entrada, `chmod` per als fitxers de
  només lectura, reintents (4) i **verificació final**; informe `{ok, attempts, files, dirs,
  failed[], leftovers[], reason}`.
- `js/core/utils.js`: `wipeFolder()` (async, verificat) + `isInsideFolder()`; `deleteFolder`
  reescrit sobre el mateix motor (sense `rmSync`).
- `js/workflows/flow_mainButton.js` (`runReset`): guarda de carpeta (dins `rutas.destinoBase` i
  últim tram = bloc), espera de 700 ms després de `Project.close()`, `wipeFolder` i **avortament**
  si `!wipe.ok` (no es crida `_runNew()` sobre restes) + `SrtEditor.wipeMarkersForProject()`.
- `js/editor/srt_editor.js`: `wipeMarkersForProject(folder)` buida les còpies de `C:/temp` del
  projecte.
- Guarnició: `bin/smoke/fp_probe_reset.js` (20 assercions, disc simulat).


**Pendent (manual, a Premiere):** RESET amb el projecte obert (ha d'esborrar tot i recrear) i
RESET amb el projecte tancat; al log ha de sortir `Carpeta esborrada del tot: ... (N fitxers,
M carpetes, intent 1)` i, si queda alguna resta, `Esborrat INCOMPLET` + la llista.

---

## F2 · PANTALLA DE CONFIG: rutes i variables d'usuari — FET EN AQUESTA FASE

**Objectiu:** que CAP ruta de treball viva al codi. Tot definit per l'usuari a la finestra de
configuració i consumit per una única API (`Config.get().rutas` + un resolutor de variables).

### Estat actual (mesurat)
- `Profile.json` (arrel de l'extensió) → `rutas`: `nas_informatius`, `plantilla`, `vertical`,
  `chyrons`, `conductors`, `destino_base`, `portadas`, `render1`, `render2`; `estructuras`
  (pistes + programes).
- `setup.html` ja edita aquestes rutes amb els camps `path-plantilla`, `path-vertical`,
  `path-chyrons`, `path-conductors`, `path-destino_base`, `path-render1`, `path-render2`,
  `path-portadas`.
- `js/core/11_Configuracio.js` mapeja `rutas.*` → noms interns (`plantilla_net`,
  `verticalitzacio`, `chyrons`, `conductors`, `destinoBase`, `portadas`, `render1`, `render2`).

### Rutes que demana l'usuari i forat actual
| Ruta demanada | Clau actual | Forat |
|---|---|---|
| Projectes | `destino_base` | ja hi és (cal aclarir el nom a la UI) |
| Chyrons | `chyrons` | ok |
| Subtítols | — | **hardcoded** a `srt_editor.js` (`SRT_MP4_PER_TEMPS_15MINUTS`) |
| Subtítols sintètics | — | **no existeix** (ni clau, ni carpeta, ni codi) |
| Grafismes | — | **hardcoded** a `flow_mapa.js` (`GRAF_ROOT` = `ZZZ_GRAFISME`) |
| Render1 | `render1` | ok |
| Render2 | `render2` | ok |
| Portades | `portadas` | ok |

Altres rutes fixades al codi que haurien de derivar de les anteriors:
`escaleta_config.js` (`ESCALETES_PATH`, que hauria de ser `vertical` + `ESCALETES`).

### Pla
1. **Esquema**: `rutas.projectes` (àlies de `destino_base`), `rutas.subtitulos`,
   `rutas.subtitulosSinteticos`, `rutas.grafismos`. Migració suau: si falten, es deriven dels
   valors actuals (compatibilitat amb els `Profile.json` ja desplegats).
2. **Variables d'usuari**: tokens `{autor}`, `{prog}`, `{archivo}`, `{wott}`, `{bloque}`,
   `{fecha}` (YYYY_MM_DD), `{tema}`, `{base}`. Nou `Config.resolvePath(tpl, ctx)` (pur,
   testable) aplicat a TOTES les rutes de sortida (projecte, renders, portada, grafismes,
   subtítols).
3. **Finestra de config** (`setup.html`): camps per a les 8 rutes + ajuda de variables + botó
   «Prova» que resol la ruta amb un ctx d'exemple i diu si existeix.
4. **Consumidors**: `flow_mapa.js` (`GRAF_ROOT`), `srt_editor.js` (subtítols), `flow_render.js`
   (portada/renders) i `escaleta_config.js` (escaletes) passen a llegir de `Config.get().rutas`.
5. **Guarda nova**: prova que cap fitxer de `js/` continga el prefix UNC dels servidors coneguts
   (`DSMEDIA07`, `192.168`, `public.ad-ccrtv`, `svftpccma`, `nas1.ad-ccrtv`) fora de
   `11_Configuracio.js` (defaults) i de les línies de comentari.

### F2.0 · Forat descobert en implementar (BLOCANT)

`Profile.json` **no es llegia enlloc**: `setup.html` l'escrivia, però `11_Configuracio.js`
retornava sempre `_activeConfig`, un objecte fix del codi. Canviar qualsevol ruta a la finestra
de configuració **no tenia cap efecte** (calia editar el `.js`), i per tant el criteri
d'acceptació era impossible. S'ha resolt amb:

- `Config` llig `Profile.json` en carregar-se amb `cep.fs.readFile` (sincron, UTF-8 de debò i
  sense dependre del motor JSX, que encara no hi és) i el **fusiona** damunt d'una còpia dels
  defaults (`Logic.Rutas.mergeProfile`: els arrays es reemplacen sencers, els defaults no es
  muten → recarregar N voltes no acumula res).
- Recàrrega en desar: `setup.html` ja feia `dispatchEvent('FASTPASS_CONFIG_UPDATED')`;
  `Config` escolta l'event i torna a llegir el perfil (efecte immediat, sense reiniciar CEP).
- `Config.applyProfile(obj)` / `loadProfile()` / `profilePath()` / `profileStatus()` per a
  proves i diagnòstic.

### Fet (2026-10-21)

| Peça | Fitxer | Què fa |
|---|---|---|
| Resolutor PUR | `js/logic/20_Rutas_Logic.js` | `resolve` (producció, sense `{token}`), `resolveDetailed` (diu què falta), `normalize`, `join`, `fechaOf`, `tokensIn`, `mergeProfile`, `normalizeRutas` |
| Config | `js/core/11_Configuracio.js` | càrrega + fusió del perfil, recàrrega per event, `resolvePath`/`applyProfile`, `rutas.*` noves a `get()` |
| Esquema | `Profile.json` | `projectes`, `escaletes`, `escaletes_domini`, `grafismos`, `subtitulos`, `subtitulosSinteticos` (i `escaletaId` de MATINS, que el perfil no portava) |
| Finestra | `setup.html` | 10 camps de ruta amb 🧪 «Prova» (resol + `cep.fs.stat`/`readdir`), targeta «Variables de Ruta» amb PROVA de plantilla; desa TOTS els `path-*`; targeta «Gestió de Programes» amb `id`/`archivo`/**`dir`**/`wott`/`conductor` |
| Consumidors | `escaleta_config.js`, `srt_editor.js`, `flow_mapa.js` | `ESCALETES_PATH`/`DOMAIN` són *getters* de la config; `_srt15MinDir()` i `_grafRoot()` lliguen la ruta en cada ús |
| Guardes | `bin/check_rutas.ps1`, `bin/smoke/fp_probe_rutas.js`, `bin/smoke/fp_probe_setup_ui.ps1` | cap literal UNC dins de cadenes a `js/` ni `jsx/` (fora dels defaults) + 29 assercions (resolutor, fusió, fitxers reals, `dir` dels programes) + 15 assercions de la FINESTRA (rutes dels `<script src>` al disc, cache-bust de l'iframe i DOM real de la targeta de programes) |

**Derivació per a perfils vells**: si `Profile.json` no porta les claus noves,
`normalizeRutas` les deriva de `vertical` (`ESCALETES`, `ZZZ_GRAFISME`,
`SRT_MP4_PER_TEMPS_15MINUTS`, `…\SINTETICS`) i `projectes` de `destino_base` (i al revés).
Les rutes que JA portaven separador final el **conserven**: mig codi concatena amb `+` sense
posar-ne (`${rutas.conductors}${fitxer}`, `rutas.destinoBase + progDir`). Els DEFAULTS també es
normalitzen: si `Profile.json` no es pot llegir (absència, JSON trencat, permisos), les rutes
derivades existeixen igualment i el panell no es queda sense escaletes/grafismes/subtítols.

**Etiquetes del desplegable PROGRAMA (2026-10-21):** l'`id` de cada programa és alhora la clau de
`mapeoProgramas` i el text de l'opció (`4_Context.js:1056-1069`; el valor triat es torna a fer
servir com a clau a `:391` i `:423`), així que s'ha pogut renombrar a
«TN Comarques / TN Migdia / TN Vespre» sense tocar `archivo`, `wott` ni `dir` (que són els que fan
noms de carpeta i crides). Els noms viuen a `Profile.json` (font real des de F2) i, com a fallback,
als defaults de `11_Configuracio.js`. `Config.loadSelection` ara ignora un valor desat que ja no
existeix (abans deixava el desplegable buit i el botó principal desactivat).

**Camp `dir` a GESTIÓ DE PROGRAMES (FET 2026-10-21):** `dir` és la subcarpeta de projectes que
fa servir `utils.workFolder` (`destinoBase + dir + data + bloc`). Abans `setup.html` editava
`id` / `archivo` / `wott` / `conductor` però **no `dir`**, i `addProg` creava el programa sense
`dir` → el projecte hauria caigut a l'ARREL de `PROVES` (barrejat amb els altres). Ara:

- La targeta té una columna **CARPETA (dir)** editable (`'dir'` → `updateProg`, que ja era genèric)
  i la graella passa a `fr` (6 columnes) perquè la columna nova no empenyi la fila fora de la
  targeta en una finestra estreta.
- `addProg` crea el programa amb `dir: ""` i `salvarTodo` **avisa** (llista programa → pestanya)
  si es desa algun programa sense carpeta.
- `Config._getLegacyMapping` normalitza `directorio` a `''` (mai `undefined` dins d'una ruta) i
  deixa un `console.warn` per diagnosticar perfils vells.
- Assercions noves `#F2/26` (tots els programes del `Profile.json` tenen `dir`) i `#F2/27`
  (el camp és a la targeta).

**Carpetes reals** (`\\DSMEDIA07\portal324\PROJECTE 9x16 PREMIERE 2\AAA_PROJECTES PREMIERE
VERTICALITZACIO`, revisat 2026-10-21): `01_MATINS_PROJECTES`, `02_COMARQUES_PROJECTES`,
`03_TN MIGDIA_PROJECTES`, `04_TN VESPRE_PROJECTES`, `05_VIDEOMATON`, `PROVES`. Els quatre `dir`
del perfil hi coincideixen exactament (MATINS = `01_MATINS_PROJECTES`). `05_VIDEOMATON` encara no
té cap programa associat (la pestanya «Fotomató» té `programas: []`).

### F2.1 · Retirar `escaletes` i `escaletes_domini` — NUCLI FET (2026-10-21)

> **ESTAT:** el CREAR ja NO consumeix les escaletes del motor. `_runNew` crida
> `ensureLocalCopy(ctx, datePrefix, {localOnly:true})` (només el directori del projecte) i, si no
> hi ha res, fa la FOTO (`_photoEscaleta`) i crea amb eixa escaleta; s'ha esborrat
> `_escaletaFromLaterBlock` (el pas «bloc POSTERIOR del NAS»). **Queda** (un altre coll, no
> bloqueja): les dues claus del perfil i `_listEscaletas`, que només s'usa dins de la FOTO
> (`escaleta_fetch._estimateEscaletaIdFromHistory`) per deduir la sèrie d'`escaletaId`; si es
> retira, la FOTO ha de provar config + veïns (cada intent pot costar ~30 s).

**Idea (usuari, 2026-10-21):** en la mecànica final aquestes dues claus no calen. En comptes de
llegir l'escaleta que genera el motor a la carpeta de digition, el **Crear** del botó MAIN ha de fer
la FOTO de l'escaleta en aquell moment i treballar sempre amb aquesta còpia (que ja es desa dins la
carpeta del bloc, `workFolder(ctx)`). Si la font passa a ser la foto, la ruta de digition no s'ha
d'emmagatzemar ni consultar mai més.

**Qui les crida avui** (`rutas.escaletes` → `ESCALETES_PATH` · `rutas.escaletes_domini` → `ESCALETES_PATH_DOMAIN`):

| # | Procés | Fitxer:línia | Què en fa |
|---|---|---|---|
| 1 | Export a l'API | `js/core/11_Configuracio.js:587-588` | `get().rutas.escaletes` / `.escaletesDomini` |
| 2 | Getters | `js/core/escaleta_config.js:50-60` | `ESCALETES_PATH` / `ESCALETES_PATH_DOMAIN` llegeixen la config a cada accés |
| 3 | Llistat de la carpeta | `js/core/escaleta_io.js:52-74` (`ER._listEscaletas`) | prova la IP i després el domini; és l'ÚNIC punt que toca la ruta |
| 4 | Tria del JSON | `js/core/escaleta_io.js:119` (`ER.findLatest`) i `:436` (`findLatestValid`) | llista → filtra per programa/data/bloc → valida |
| 5 | Estimació d'ID | `js/core/escaleta_fetch.js:263-290` (`_estimateEscaletaIdFromHistory`) | reconstrueix els IDs dels dies anteriors (la ruta, a la línia 270) |
| 6 | Consumidors | `flow_mainButton.js:375,429,749,1747,1926` i `flow_mp4.js:165` → `ensureLocalCopy` (que mira PRIMER la carpeta del projecte i només cau al NAS a `escaleta_io.js:336`) · `flow_mp4.js:73` → `findLatest` directe · `escaleta_fetch.js:376-380` → FOTO · `4_Context.js:473` → `getStatus` · `flow_mainButton.js:256` → `_listEscaletas` (usat a `4_Context.js:148` i `flow_mainButton.js:407`) | aquí es nota la ruta: sense foto prèvia, tot cau al NAS |
| 7 | Finestra de config | `setup.html:163-164` (camps) i `:232` (mapa de claus) | edició de les dues rutes |
| 8 | Derivació | `js/logic/20_Rutas_Logic.js:225-226` | `normalizeRutas` les deriva de `vertical` per a perfils vells |

**Què cal fer (en aquest ordre):**
1. `Crear` (Main) → cridar `EscaletaReader.fetchNewEscaleta` SEMPRE (no només al botó FOTO) i desar
   la còpia dins `workFolder(ctx)` (el paràmetre `folderDest` ja existeix: `main.js:959-977`); si
   l'API falla, **avortar** amb missatge clar (mai crear amb una escaleta vella).
2. `ensureLocalCopy` ja prefereix la còpia del projecte: només cal **llevar el pla B del NAS**
   (`escaleta_io.js:335-340`) i restringir `findLatest` / `findLatestValid` a la carpeta del bloc.
   `flow_mp4.js:73` crida `findLatest` sense `datePrefix` → passa a llegir la còpia local.
3. Esborrar les dues claus de: `Profile.json`, defaults de `11_Configuracio.js`, `get().rutas`,
   getters d'`escaleta_config.js`, `normalizeRutas` i els dos camps de `setup.html`.
4. `grep -ri "escaletes_domini|ESCALETES_PATH" js/ jsx/ setup.html Profile.json` → 0 resultats.

**Nota:** `escaletaId` (`PRO1439`…) NO es pot retirar: és el paràmetre de la petició a l'API
d'escaletes (`main.js:972`).

---

### F2.2 · Arrencada en fred: el llistat d'escaletes (FET 2026-10-21)

**Mesura** (`_boot_timing.log`, TNC V1, primera arrencada del dia 11:29:32):
`checkContext · escaleta getStatus` = **5233 ms** d'un total de **5435 ms** (96%),
amb el fil del panell viu tot el temps (batecs `DIAG HB` a +1,5/+3/+4,5 s) → el temps
es consumia DINS del motor ExtendScript. Detall complet a
`docs/perf/ARRANCADA_2026-10-21_TNC_V1.md`.

**Causa:** `ER._listEscaletas` llistava la carpeta de digition (127 `.json`) amb
`IO.listFolder` → `FASTPASS.IO.scanDirectory` (`length`+`modified`+`created` per fitxer,
i `f.open('r')`/`eof` quan `length` val 0 en UNC). El natiu de Windows fa el mateix
llistat en ~10 ms; el motor hi esmerça segons. A més `getStatus` ho feia dos cops.

**Fet:** llistat amb `fs.promises.readdir` de Node (asíncron) → `cep.fs.readdir` (natiu) →
motor (últim respatller); memòria curta `LIST_TTL_MS` + `_invalidateEscaletas()` +
deduplicació; `warmList()` a `main.js` (engega el llistat en paral·lel al bootstrap);
`load()` normalitza `/`→`\` per a `cep.fs.readFile` (`err=3` → respatller ExtendScript);
`findLatestValid` reutilitza el JSON del fallback; marques `[ER:IO]` al timing.
Prova: `bin/smoke/fp_probe_arrancada.js` (#BOOT/1..#BOOT/15).

**Pendent (següent coll, fora de l'arrencada):** `[SCAN:wotts]` 4 s, portades 5 s i
cleanFeed 10 s al CREAR (11:31:08→11:31:28) — també passen per `IO.scanDirectory`
perquè necessiten `created`; el pas natural és `fs.promises.stat` de Node (`birthtime`).

### F2.3 · Desbloqueig del CREAR per WOTTS (FET 2026-10-21)

**Idea (usuari):** «una manera de saber que ja puc editar el projecte d'avui… si no hi ha wotts del
programa d'avui, el botó està en MASSA D'HORA; si existeixen, passa a CREAR». Els wotts es generen
just en acabar l'emissió del bloc → és un fet físic, no un horari.

| Situació | Estat del botó |
|---|---|
| Existeix el `.prproj` del dia | `ACTUALITZAR` (sense cap consulta al NAS) |
| No existeix · hi ha wotts del bloc d'avui | `CREAR` |
| No existeix · escaleta al directori del projecte (còpia o FOTO) | `CREAR` (vàlvula manual: el botó FOTO desbloqueja) |
| No existeix · ni wotts ni escaleta | `MASSA D'HORA` + poll de 15 s (`main.js`, `_ctxRefreshPollMs`) |

`ESPERANT` desapareix com a estat: el seu significat («el bloc encara s'emet») ara és exactament
«no hi ha wotts».

**Per què `birthtime` i no `mtime`:** els noms dels wotts no porten data
(`Wott_TNV_v1_05_00.01_TEMA_…mov`) i el `mtime` està contaminat pel procés nocturn (mesurat: creat
16/10 19:17 UTC → modificat 17/10 00:32 UTC). Mesura del 2026-10-21 sobre `…\VERTICALITZACIO`
(963 entrades): `readdir` **32 ms**, `stat` **1,5 ms/fitxer** → primera passada ~220 ms (149 wotts
de `_V1_` de tots els dies) i, amb caché per nom, **~35 ms per poll**.

**Fet:** `Scan.wottsToday` + `_dateWotts` (Node → CEP → JSX, caché `_wottDateCache` i memòria
curta `_wottProbeCache` de 5 s; si no es pot llistar retorna `ok:false` i el botó **no es bloqueja**),
`Context._wottsToday`, estat nou a `checkContext`, llums (`sem-esc` en `pending` quan encara no hi ha
escaleta local) i tooltips;
`Scanner.js?v=12`, `4_Context.js?v=26`, `escaleta_io.js?v=19`, `flow_mainButton.js?v=35`,
`main.js?v=84`. Prova: `bin/smoke/fp_probe_wotts.js` (#WOTT/1..#WOTT/11, `fs` simulat).

**AHIR (Ctrl+clic a MAIN): mateix mecanisme, data canviada.** No hi ha cap camí especial: `_onMainClick`
posa `State.workTarget='yesterday'`, `_targetDateDir()` retorna el dia natural anterior i TOT el flux
va amb `ctx.dateDir` d'AHIR — gate de wotts (`wottsToday` filtra per `dateTarget`), `lookupLocalStatus`
sobre el directori del projecte d'AHIR, `_runNew` amb `datePrefix` d'AHIR i FOTO amb la data d'AHIR.
La carpeta de wotts en conserva ~7 dies (mesurat 2026-10-21: 785 fitxers, del 14/10 al 21/10), així
que l'AHIR sempre és dins la finestra; la memòria curta porta el dia a la clau (`folder|prefix|dia`) i
`_wottDateCache` (nom → dia) es reutilitza, així que el poll d'AHIR també costa ~35 ms i HOY/AHIR no es
contaminen. Si el dia anterior no va tenir emissió (ni wotts ni escaleta al directori ni `.prproj`), el
botó diu `AHIR: sense material per corregir`; la vàlvula és el botó FOTO (o `Ctrl+FOTO`, que força la
data d'AHIR): deixa l'`escaleta_on_demand_*.json` al directori d'AHIR i el següent Ctrl+clic ja troba
`CREAR`. El retorn a HOY (`workTarget='today'` + repintat) viu en un `finally`: abans, si
`runMainAction` petava, `workTarget` quedava en `'yesterday'` i el poll de 15 s repintava l'AHIR
indefinidament. Matís heretat (BUG #156): amb un projecte obert, `_targetDateDir()` retorna
`projectDateDir` (la data del `.prproj` obert) i ignora `workTarget`, així que per corregir AHIR no hi
pot haver ancorat un projecte d'un altre dia.

**Pendent (manual, a Premiere):**
1. Primera arrencada del dia, abans del bloc → `MASSA D'HORA` i al log
   `[SCAN:wottsToday] TNV_V1 <data>: 0/N wotts del dia`.
2. En acabar l'emissió, sense tocar res, el botó ha de passar a `CREAR` en ≤15 s.
3. `CREAR` sense escaleta local → `📷 [NOU] Cap escaleta del bloc … → FOTO automàtica` i el projecte
   es crea amb l'escaleta de la FOTO.
4. `Ctrl+clic` (AHIR) amb els wotts d'ahir → `CREAR` directe (i `ACTUALITZAR` si el `.prproj` d'ahir
   ja existeix).

---

**Criteri d'acceptació:** canviar qualsevol de les 8 rutes a `setup.html` → reiniciar el panell →
el projecte, els renders, la portada, els grafismes i els subtítols es creen/lligen de la ruta
nova, sense tocar cap fitxer `.js`.

---

## F3 · EDITOR DE SUBTÍTOLS: selecció/esborrat + sintètics + reomplir buits

### Estat actual (DESPRÉS de F3, 2026-10-21)
- `js/editor/srt_editor.js`: canvas amb wave/marcadors, previsualització i exportació a
  Premiere (`exportToPremiere({track})` → `tracks.subtitle.s1` o **`s2`**). **No hi ha cap
  taula HTML**: la «taula d'entrades» és la fila de clips del canvas, i la selecció es fa
  clicant el clip.
- Botons a `index.html` (`#secSubtitols`): `btnSrtLoad` (⬇️ CARREGAR · **Ctrl = SINT** ·
  Alt = fallback directe), `btnSrtExport` (💾 · Ctrl = força S2), `btnSrtReset` (♻️),
  **`btnSrtFill` (🧩 REOMLIR)** i **`btnSrtDel` (🗑 ESBORRAR)**, `btnSrtIn` / `btnSrtOut`.
- Ruta de sintètics: `rutas.subtitulosSinteticos` (F2) + `Scanner.srtSynthetic` (F3.2).

### Fet (2026-10-21)
El pla s'ha implementat sencer, amb tres desviacions que cal tindre presents:

1. **No existix la «taula d'entrades»** que el pla pressuposava: l'editor només té el
   canvas. La selecció de F3.1 s'ha fet sobre el **clip del canvas**
   (`_clipAtSec`/`_selectAtSec`, ressaltat blanc + número i començament del text) i les
   tecles Supr/Backspace més el botó 🗑. Els dos abasts es mantenen: **taula**
   (`_entries` i `_originalEntries`) i **timeline** (només el clip de subtítol de la pista
   on cau el TC, sense ripple).
2. **No s'ha creat cap àtom nou `Srt.removeAt`**: l'esborrat al timeline és JSX inline
   sobre `seq.subtitleTracks` (`_refreshTimelineSubs` + `_removeTimelineSubAt`). El motiu:
   `Clips.removeAt(track, startSec, type)` casa el clip per `start` amb ±0,05 s i el TC del
   SRT pot anar quantitzat a frame; el JSX nou casa per **interval** (amb ±0,2 s de marge)
   i retorna la pista, que és el que el log necessita. `Clips.removeAt` no s'ha tocat.
3. **`placeSrtOnExistingSubtitleTrack` guanya `trackIdx`** (0 = S1, 1 = S2). I la neteja
   prèvia de l'exportació, que abans esborrava **totes** les pistes de subtítols, ara
   esborra **només la pista de destí** — imprescindible per tindre NORMAL a S1 i SINT a S2
   alhora.

Detall per sub-fase:

- **F3.1 · FET.** `_selIndex`, `deleteSelected()`, `_initKeys` (Supr/Backspace), botó 🗑.
  Confirmació si l'entrada ja està al timeline (`confirm`: Accepta = timeline + taula,
  Cancel·la = només taula). `_loadedEntries` intacte → ♻️ restaura; el `.srt` del NAS no
  s'escriu mai. L'entrada s'esborra també de `_originalEntries`: si no, el drag de
  marcadors la reconstruïa i «tornava» (forat detectat en implementar).
- **F3.2 · FET.** `Scanner.srtSynthetic` (3 nivells, sempre filtrat per data de treball,
  fitxers no datables descartats) + `loadSrt(path,{kind:'SINT'})`. Les taules viuen a
  `_views`: el SRT normal queda guardat i el **segon Ctrl+clic hi torna**. Color taronja
  per als SINT; exportació per defecte a **S2**; Ctrl+clic a 💾 força S2. L'antic
  Ctrl+clic (fallback forçat) passa a **Alt+clic**. `createCaptionTrack` com a fallback si
  la S2 no existix; `_detectExportTrack` informa de la pista real (si no hi havia cap
  pista de subtítols, Premiere crea la S1 encara que es demanara la S2).
- **F3.3 · FET (opció A i opció B).** Opció A: carregar SINT (Ctrl) i exportar a S2.
  Opció B (automàtica): `SrtParser.findGaps` / `mergeSyntheticGaps` / `removeEntryAt`
  (pures, provades aïlladament) i botó 🧩. Només AFEGIX, amb tolerància
  `general.srtSyntheticGapTolSec` (**0,2 s**): `solapa`, `duplicat` i `fora-del-tram` es
  descarten i es compten al log. Resultat = vista **MOD** (verda) amb `_loadedEntries` =
  SRT normal (♻️ ho desfà). `findGaps` no compta el cap ni la cua, només els buits reals
  entre entrades.

**Prova**: `bin/smoke/fp_probe_srt.js` (27 assercions, `#F3/1..#F3/27`). Validació:
smoke PASS 336 / FAIL 0, `check_js_v8` 61/61, `check_dead` 0 orfes, `check_rutas` OK.
**Pendent**: validació manual a Premiere (acceptació de davall).

### Pla original (per a traçabilitat)

### F3.1 · Seleccionar i esborrar un clip de subtítol — FET (2026-10-21)
1. Estat de selecció únic a l'editor (`_selIndex`) alimentat per: clic a la fila de la taula i
   clic al clip del canvas (ressaltat visual).
2. Esborrar amb `Supr`/`Backspace` i amb un botó 🗑 de la secció SUBTÍTOLS. Dos abasts:
   - **Taula** (el SRT carregat): treu l'entrada → no s'exportarà.
   - **Timeline** (clips ja inserits): nou àtom JSX `Srt.removeAt(tc, trackKey)` que esborra el
     clip de subtítol que cau en eixe TC (mai altres pistes).
3. Confirmació si l'entrada ja està exportada + log del que s'ha tret; mai es toca el `.srt`
   original del NAS (l'editor treballa sobre la còpia del projecte).

### F3.2 · Ctrl+clic a CARREGAR = importar els SINTÈTICS — FET (2026-10-21)
1. Ruta nova `rutas.subtitulosSinteticos` (F2).
2. `btnSrtLoad` amb `ctrlKey` → `Workflow.Srt.runSrtLoadSynthetic()`: busca
   `{archivo}_{bloque}_*` del dia de treball (mateix patró que els normals) i el carrega a
   l'editor amb marca `SINT` (color propi) i estat separat del SRT normal.
3. Es pot exportar a una altra pista (`s2`) per tenir-los al costat sense barrejar-los:
   `exportToPremiere({ track: 's2' })`.
4. `Ctrl+clic` a RESET (♻️) continua reiniciant com ara; el reset del SINT és explícit.

### F3.3 · Reomplir buits (opcions, de menys a més automàtic) — FET (A i B, 2026-10-21)
- **Opció A (simple, recomanada per començar):** carregar els SINT i exportar-los a S2; l'operador
  col·loca a mà els que falten. Cap barreja automàtica, risc zero.
- **Opció B (automàtica):** detectar BUITS del SRT normal (cap entrada dins d'una finestra on el
  SINT sí que en té) i inserir NOMÉS les entrades sintètiques que cauen dins del buit, amb
  tolerància (`srtSyntheticGapTolSec`, per defecte 0,2 s). Resultat = SRT fusionat marcat `MOD`
  (mai se sobreescriu l'original) + log de les entrades afegides.
- Criteris: no duplicar intervals, no tocar entrades existents, mateix eix de temps que el SRT
  normal (`_axisOrigin`).

**Criteri d'acceptació:** esborrar un clip de la taula i un altre del timeline; importar SINT amb
Ctrl i exportar-los a S2; fusionar un buit amb l'opció B i comprovar al timeline que no hi ha ni
solapaments ni entrades duplicades.

---

## F4 · MARKERS: anàlisi, snapshots i TC amuntegats

**Per què primer un document:** els marcadors són la peça central (tot en depèn). Abans de tocar
codi s'escriu `docs/specs/MARKERS_OPERATIVA.md` amb la mecànica COMPLETA i la de cada botó.

### Abast de l'anàlisi
- Pipeline OUT & GO (`main.js`): fases OUT → TROSSEJA → MARCADORS (`flow_cut.js`,
  `flow_markers.js`) i què deixa cada una a la seqüència.
- `flow_markers.js`: `_setupEstructural`, `_classifyItems`, `_calcTemporalAnchors`,
  `_correlationSnap`, `_imantAlCorte`, `_asignarAnclasPorDuracion`, `_preAssignDeducedToBreaks`,
  `_chooseSnapTarget` (quan un marcador s'imanta a un tall o a un silenci).
- COL·LOCAR / REPARTIR (`flow_chyrons.js`): quan es creen marcadors addicionals, quins es mouen i
  quins no.
- Manifest: `AnalysisCenter.writeMarkers` + `manifest.markers.list` (font de veritat) i els
  derivats `MARCADORS_*.txt/.json`.
- Colors i famílies (`docs/specs/MARKER_COLORS*`).

### Snapshot de posicions (eina de diagnòstic)
- Ja existeix `Markers.dumpMarkersSnapshot()` i `main.js` la crida **al final d'OUT & GO**
  (`MARCADORS_<data>_<hora>.txt` + `.json` a la carpeta del projecte).
- **Falta**: cridar-la al **principi de COL·LOCAR** (abans que el flux toque res) i ampliar-la amb
  etiqueta: `dumpMarkersSnapshot({ tag: 'pre-chyrons' })` → `MARCADORS_<stamp>_<tag>.json`
  (`out-go`, `pre-chyrons`, `post-chyrons`). Així es pot comparar «com els deixa l'usuari» amb
  «com els deixa el procés».
- Eina nova `bin/compare_markers.ps1`: llig tots els `MARCADORS_*` d'un projecte i llista
  (a) TC duplicats (±1 frame), (b) marcadors que han canviat de posició, (c) marcadors afegits i
  (d) colors canviats.

### Regla dura
**Dos marcadors al mateix TC (o a menys de 1 frame) és un ERROR.** La deduplicació ha de ser
ABANS de crear el marcador (funció única `_canPlaceAt(tc)`), no una neteja posterior: netejar
després deixa el manifest i el log inconsistents i pot trencar l'ancoratge dels chyrons.

### Mètode
1. Obrir els projectes del dia anterior (ja creats) i desar els snapshots.
2. Comparar amb `bin/compare_markers.ps1` + `bin/analyze_prproj_*.py`.
3. Anotar cada cas real amb TC, ítem i botó que l'ha creat.
4. Només després: correccions, una per una, amb prova que reproduïsca el cas.

---

## Ordre d'execució
1. **F0/F1** — validació manual a Premiere (portada i reset).
2. **F2** — config (base per a F3.2: la carpeta de sintètics).
3. **F3** — subtítols (A i després B). **FET 2026-10-21** (pendent només la validació manual).
4. **F4** — document d'anàlisi → snapshots → deduplicació.

## Convencions de tancament (cada fase)
- `.js` / `.jsx`: sense accents al codi (només a les cadenes d'usuari), com la resta del repo.
- Cache-bust a `index.html` per a cada fitxer tocat.
- `bin/smoke/fp_smoke_build.ps1` (PASS/FAIL), `bin/check_js_v8.ps1` (60/60), `bin/check_dead.ps1`
  (0 orfes) en verd abans de commitar.
- Entrada a `docs/BUGS_FIXED.md` (SIMPTOMA / CAUSA ARREL / SOLUCIO / FITXERS / VALIDACIO) i a
  `docs/CHANGELOG.md`.
