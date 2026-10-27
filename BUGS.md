# BUGS — catàleg únic

> **Únic lloc** on viu l'estat dels bugs. Actualitzat: **2026-10-27**.
> Les funcionalitats i implementacions viuen a [`FEATURES.md`](FEATURES.md).
>
> El text llarg de cada bug resolt (símptoma complet, causa arrel, solució i fitxers tocats)
> es va retirar el 27/10 per orde de l'usuari: queda a l'historial de git
> (`git log -p ce18186 -- docs/BUGS_FIXED.md`). Ací hi ha el resum operatiu de tots.

**Resum**: 10 pendents · 128 resolts/tancats.

---

## 1 · PENDENTS (10)

| Nº | Estat | Què passa |
|---|---|---|
| **#193** | R1+R2+R4+R6 **aplicats**; pendent validar R6 en viu + R3/R5 (27/10) | **Inici del bloc i finestres degenerades**: `01dir` havia d'anar a `34,50 s` i va quedar a `0,00 s` amb altres tres marcadors. Causa arrel (6 baules), retocs R1-R6 i rollback a [`docs/specs/FIX_INICI_BLOC.md`](docs/specs/FIX_INICI_BLOC.md) |
| **#191** | Pendent de validar en viu (26/10) | Els wotts amb el bloc **a seques** (`Wott_TNM_V_…`, els `XARXES-TEXT`) ja s'importen, però **no es col·loquen** |
| **#113** | Pendent de validar en fred | **Arrencada en fred lenta**: 92,7 s el 22/10 (el 99% era NAS fred dins `checkContext`) |
| **#111** | Investigació oberta (29/09) | Els ítems d'escaleta **FLOTANTS** (`flotant:true`) no reben cap marcador; segons la regla de l'usuari n'haurien de portar un de **VERMELL** |
| **#116** | Nota pendent de decisió (30/09) | **Marcador VERMELL DE CUA** que no hauria d'existir: el filtre el descarta bé i la vàlvula de seguretat de `_safePlaceByPrefixes` el torna a afegir |
| **#117** | Nota pendent de decisió (30/09) | **Semàfors trencats sense projecte** per `ReferenceError: mediaN is not defined` a `checkContext` → es perden els semàfors SRT i WOTTS |
| **#196** | Nou (27/10) · sense diagnòstic | **La finestra de GRÀFICS no obri sempre a la carpeta de la DATA del projecte**: ha d'arrancar al directori del dia del bloc (el de l'escaleta), no a l'últim recordat |
| **#197** | Nou (27/10) · sense diagnòstic | **El grafisme no s'inserix al timeline en tota la seua longitud**: un **corte a V1** afecta el seu **Out** (el gràfic s'encongeix). La inserció ha d'ocupar la durada sencera del gràfic, sense retallar-se al punt d'edició de V1 |
| **#198** | Nou (27/10) · sense diagnòstic | **Tancar el projecte amb el botó verd ha de BUIDAR l'editor de subtítols**: si hi ha un `.srt` carregat, en eixir el panell (i el projecte) ha de quedar net |
| **#199** | Nou (27/10) · sense diagnòstic | **El botó EXPORT no respecta la posició del clip original de V1**: en inserir els clips nous al final, han d'anar a la posició del clip de V1 original, no al final de la seqüència |

### 1.1 · ✅ Validats en viu · **CODI SENSIBLE: NO TOCAR**

> Ordre explícita de l'usuari (27/10). Estes funcions **queden congelades**: no es refactoritzen, no
> es retoquen i no s'hi afegeixen casos «de passada». Si mai cal tocar-les, és bug nou amb el seu
> número i validació en viu pròpia.

- **#194** · marcadors GROCS fora del directe. En viu: `01BT@0,00` · `01 TE-1@10,00` ·
  `01 TD-1@15,00` · `01dir@32,28` · `02@39,36` · `03@65,72`, cap groc dins de la connexió.
  **Congelat**: `Markers._resolveGraphicParents` (`js/workflows/flow_markers.js`).
- **#195** · els rètols del plató no cauen dins del directe: el conductor
  (`…_661940_Directe_PRESENCIAL_Ciutat de la Justícia…`) es queda a la capçalera `01BT` (0,40 s) i la
  connexió `01dir` es respecta. **Congelat**: `_isCapcaleraPlato`, `_debeQuedarseEnPlato`,
  `_isPresenterLine` (sufixos `bt`/`pg`), `_isPresenterTitle` (tokens `BONATARD*`/`BONANIT`) i la
  guarda `🏠 PLATÓ` dins `_ipdAnchorPlan` (`js/workflows/flow_chyrons.js`).



### #193 · Inici del bloc i finestres degenerades (`01dir` a `0,00 s`)

**Símptoma** (`TNM_V1` 26/10): `01dir` havia d'anar a `00:00:34:12` (`34,50 s`, tall d'escena
confirmat amb `ffmpeg`) i va quedar a `0,00 s` junt amb `01 TE-1`, `01 TD-1` i `01BT`.

**Causa arrel** (cinc baules, verificades al log de l'11:23):

1. `escaleta_bounds._sanitizeOnAir` anul·la la PREVISTA dels tres ítems de capçalera
   (`14:31:41` < highWater `14:32:13`) sense tolerància → el bloc perd la seua hora
   (`blockRefSec = null` → Tier0-IN cross-agrupació).
2. `_classifyItems` manda els ítems **sense hora** a `unplacedItems` **abans** de mirar si són
   gràfics → `01 TE-1`/`01 TD-1` (que el manifest dona `classe = GRAFIC`) entren al joc
   estructural.
3. `_pickStartItem` només mira `structuralItems` → `01BT` (capçalera sense hora) no és
   candidat → el 🔒 d'inici cau en `01dir` (`sequencia` 28).
4. La immunitat «faro de faros» es dona per **posició** (`tk <= 0,15`) i per `_frozen` → F3.5
   veu `Δ = 1,360 s` i no el pot aplicar, i F4/F5 queden bloquejats.
5. F5 ix amb la finestra `[01dir@0 → 01dir@0]` → `continue`; F7 apila a `max(0, next − 0,5)`.

**Fet**: disseny complet i document únic
[`docs/specs/FIX_INICI_BLOC.md`](docs/specs/FIX_INICI_BLOC.md) (R1 gràfics primer · R2 inici
per orde d'escaleta · R3 immunitat per identitat · R4 cadena de durades a F5 · R5 opcional a
`escaleta_bounds`) + xarxa de seguretat `docs/rollback/2026-10-27_FIX_INICI_BLOC/`
(instantànies `.orig`, `SHA256SUMS.txt` i `RESTAURAR.md`). F8·Separació (`#192`) queda com a
xarxa de seguretat, **no** com a solució.

**Què falta**: decidir si cal **R3** (immunitat del `00:00` per identitat; només si al log apareix
un `IMMUTABLE (faro de faros)` en un ítem equivocat) i **R5** (tolerància de la PREVISTA a
`escaleta_bounds`; pot moure l'IN/OUT). **I tornar a provar en viu després de R6** (la passada de
les 12:52 encara queia a `3,00 s`).

**Aplicat el 27/10** (`js/workflows/flow_markers.js`, decisió d'usuari): **R1** gràfics pel
sufix abans del test «sense hora» · **R2** `_pickStartItem` amb `unplacedItems` i orde per
`sequencia` (3 crides) · **R4** `_hiFinestraInferida` + `_cadenaDuradesSec` a F5. Smoke §12c
amb 19 assercions → `ALL GREEN | js 61/61 | smoke 471/471 | jsx intacte`. `jsx/` intacte.

**Validació en viu 27/10 12:52** (`MARCADORS_2026-10-27_1252.txt`): `01BT@0,00` ✓ ·
`01 TE-1@10,00`/`01 TD-1@15,00` (ara ixen com a gràfics, no com a estructura) ✓ · `02@41,08` ✓ ·
`03@67,44` ✓ · **`01dir@3,00` ✗**. El `00:00:03:00` **no era cap corte**: F2 clavava `01dir` a `0`
(`idealPosSec = 41,08 + (52334 − 52384) = −8,92 s`, clamp cec) i F8 la separava amb el GAP de
`3,0 s`. Causa: la seua Prevista (`14:32:14`) cau **8,92 s ABANS de l'inici del clip** — el clip
comença a `52342,92` (14:32:22,9), no al `worldBlockAnchorSec` (`52333`) → **baula 6** → **R6**.

**R6 aplicat el 27/10**: `_matBoundsSec(anchors, clips)` + `_classifyItems(lines, opts)` (una hora
fora del material → `unplacedItems` amb `_foraMaterial`, log `🚫 [FORA-MATERIAL]`) + F5 amb la
**cadena de durades prioritària**, **imant al corte** i la guarda del `0,00` oberta només per a
`_foraMaterial` (l'`OnAir` i el 🔒 d'inici, intocables). Corts reals de `TNM_V1_CLIP.mp4`
(`ffmpeg`, 188,88 s): `65,32` i `72,40` del fitxer = **`34,52`** i `41,60` de timeline (menys
30,8 s d'in-point) → `01dir` ha d'anar a **`34,52`**. Smoke §12c 19→25 → `ALL GREEN | 477/477`.

### #194 · Un directe no porta gràfics mai (marcadors grocs dins de la connexió)

**Símptoma** (`TNM_V1` 26/10, `MARCADORS_2026-10-27_1330.txt`): els marcadors **GROCS** de
`01 TE-1` i `01 TD-1` (F6·GF, `colorIdx 4`) van quedar a `35,82 s` i `37,59 s`, **dins de la
connexió en directe** (`01dir@32,28`). Un directe és plató pur: **no hi ha mai cap element gràfic**;
els grafismes van a la **Intro**, l'**off** o el **DonaPas**.

**Causa arrel**: `placeGraphicMarkers` ancorava els gràfics a un marcador "pare" del mateix número
base amb `PRIORITY_SUFFIXES = ['i', 'dp', 'dir']` — és a dir, **`dir` era pare vàlid**. En este bloc
no hi ha `01i`/`01dp`, així que el pare de `01` va ser `01dir@32,28`; el pare correcte és la
capçalera de plató `01BT@0,00`. Les posicions quadren exactes amb el motor: `nextMarker=39,36`,
`totalDur=7,08`, `segmentDur=1,77` → `32,28 + 2×1,77 = 35,82` i `+1,77 = 37,59`.

**Fet** (27/10, tot JS, `jsx/` intacte): la resolució eix a una funció **pura** i testable,
`Markers._resolveGraphicParents(markers)`, i el directe queda **exclòs com a pare**
(`DIRECT_SUFFIXES = ['dir','directe','especial']`). Ordre nou: (1) intro → donapas → off
(`i`,`dp`,`f`,`off`), (2) vídeo propi (prefix exacte), (3) estructural del mateix número (mai
directe), (4) **capçalera/plataforma** del mateix número (`01BT`, `01PG`…) que no siga directe ni
gràfic. Si l'únic marcador del número és un directe → **no s'ancora** (log `⏭️`), i decidix el
fallback per Prevista. Smoke §12d: **7 assercions** noves → `ALL GREEN | js 61/61 | smoke 484/484`.

**✅ VALIDAT EN VIU** (27/10, 14:00 · `MARCADORS_2026-10-27_1400.txt`): `01BT@0,000` ·
**`01 TE-1@10,000`** · **`01 TD-1@15,000`** · `01dir@32,280` · `02@39,360` · `03@65,720`. Cap groc
dins de la connexió. **NO TOCAR** (decisió d'usuari, 27/10): la resolució de pares
(`Markers._resolveGraphicParents`) queda congelada.

### #195 · Els rètols del plató cauen dins del marcador del directe

**Símptoma** (`TNM_V1` 26/10, `CHYRONS_2026-10-27_1400.txt`): els dos rètols del bloc queden
**dins de la connexió** i **cap a l'inici** (ni a `0,40 s` sobre `01BT@0,00`):

| Rètol (nom real) | rol | col·locat |
|---|---|---|
| `Wott_TNM_v1_01BT_00.00_…_661940_Directe_PRESENCIAL_Ciutat de…` | `Directe` | V8 · **`32,68 → 37,76 s`** |
| `Wott_TNM_v1_01BT_00.01_…_661951_Enviat_Sí_Marta Martorell_Chu…` | `Enviat` | V7 · **`37,68 → 39,32 s`** |

**Causa arrel** (dos mecanismes, tots dos per disseny antic; el `structure` diu que **els dos
rètols pengen de `01BT`**, no de `01dir`):

1. Rètol `Directe`/`PRESENCIAL` → `_isDirecteSenyalWott` = `true` → **`_ipdAnchorPlan`** (BUG #167)
   → `_pickDirecteDiferitAfter` tria el primer DIRECTE/DIFERIT **posterior** (`01dir@32,28`) →
   `32,28 + 0,40` (`CHYRON_OFFSET_SEC`) = **`32,68`**.
2. Rètol `Enviat` → `_isEnviatWott` = `true` i `_connexioMarkerTime(0,00)` = `01dir@32,28` → va al
   punt de connexió; busca el primer buit de la pista → **`37,68`**.

L'agreujant: **`01BT` no es reconeix com a ítem de plató** — `_isPresenterLine` mira els sufixos
`i|dp|dir|f|off` i `bt` no hi és; `_isPresenterTitle` mira tokens al **començament** del títol i
`PGBONATARDAIDONAPAS…` no comença per cap (`DONAPAS` no és al principi; `BONATARDA` no és a la
llista). Per això `placeChyronConductor`, `_blockStartTime` i `_casForceTimes` també prenen
`01dir@32,28` com "el plató del bloc".

**Fet** (27/10, tot JS, `jsx/` intacte · `js/workflows/flow_chyrons.js`). Regla d'usuari: «si hi ha
un ítem intro/off al principi, va amb el conductor; si no n'hi ha, no s'hi posa» → cal mirar **el
sufix I el NOM de l'ítem**:

1. `_isPresenterTitle` accepta `BONATARDA`/`BONATARDE`/`BONATARDES`/`BONANIT` (el «PG bona tarda i
   DONA PAS…» ja es reconeix: `PG` es lleva com a prefix i queda `BONATARDA…` al principi).
2. `_isPresenterLine` accepta els sufixos **`bt`** i **`pg`** (capçalera/plataforma de plató) →
   `placeChyronConductor`/`_blockStartTime`/`_casForceTimes` ancoraran a `01BT@0,00` → `0,40 s`.
3. Nous predicats **purs**: `_normTitol`, `_isCapcaleraPlato(m, entry)` (sufix `bt|pg|plato|estudi`,
   id `01BT`/`01 PG`, o títol `PG|PLA|PLATO|ESTUDI` + `BONATARD*|BONANIT|DONAPAS|SALUTACIO`; les
   INTRO queden fora) i `_debeQuedarseEnPlato(m, entry, markersFull)` (només si eixa capçalera
   **obri el bloc**, marge `0,05 s`).
4. `_ipdAnchorPlan` consulta la guarda **abans** de moure res → el rètol PRESENCIAL es queda al
   plató (log `🏠 … es QUEDA al plató`).

**Intactes**: regla #168 (`04i - intro DIFERIT…` seguix movent-se), `dp` (convenció 2026-09-21) i
ENVIAT (punt de connexió). PROVES: `bin/smoke/fp_smoke_ac.js` §14b
(`ph('14b-bug195-conductor-plato')`), **7 assercions** → `ALL GREEN | js 61/61 | smoke 491/491 |
jsx intacte`. **✅ VALIDAT EN VIU el 27/10 · NO TOCAR · CODI SENSIBLE**: `_isCapcaleraPlato`,
`_debeQuedarseEnPlato`, els sufixos `bt`/`pg` de `_isPresenterLine`, els tokens `BONATARD*` de
`_isPresenterTitle` i la guarda `🏠 PLATÓ` d'`_ipdAnchorPlan` queden **congelats**. Qualsevol canvi
posterior és un bug nou amb número propi i validació en viu.

### #191 · Wotts amb el bloc a seques (XARXES-TEXT) no es col·loquen

**Símptoma**: el generador deixa wotts amb el bloc **a seques** (`Wott_TNM_V_00_00.00_…`).
El filtre del `Scanner` exigia el prefix literal `PROG_BLOC_` (`TNM_V3_`) i `TNM_V_` no hi
encaixava, així que **no s'importaven mai** al projecte: els 3 wotts flotants del
`2026_10_25/V3/TNM_V3` es veien al NAS però el panell no els baixava.
**Fet**: `Scanner.wotts()` separa bloc (`V3`≡`V03`) de flotants i torna `bloc + flotants`;
`Parse._esFlotant` evita el bloc fantasma `00` a `State.structure`
(`Scanner.js?v=23`, `13_Parse.js?v=6`).
**Què falta validar**:
1. Recarregar el panell i reescanejar `2026_10_25/V3/TNM_V3` → al log hi ha d'eixir
   `🪁 [SCAN:wotts] 3 wott(s) FLOTANT(S)` i els **3 `XARXES-TEXT`** al bin.
2. **Decidir la regla de col·locació** (detector per ROI/text com `flow_graphics` /
   `17_TitoletDetect`, o deixar-los al bin per a col·locar-los a mà): `flow_chyrons.js`
   hui no té cap fase que busque wotts sense ítem.

### #113 · Arrencada en fred lenta

**Símptoma**: amb l'ordinador tot just engegat, `ARRENCADA COMPLETA` a **92,7 s**
(`_boot_timing.log` 22/10 08:57:33) i el log s'obre tot sol (llindar 15 s). El 99% del
temps era **NAS fred** dins `checkContext`, amb treball duplicat i un scan innecessari.
**Fet** (22/10): single-flight + *timeouts* a `js/core/4_Context.js`; dedupe de sondes
(`_probeInflight`/`_probeKey`) i **caché de dates persistent** (`localStorage`
`fp_wott_dates_v1`) a `js/logic/Scanner.js`; marques `[SCAN]` i `[Context] … sonda` al
`_boot_timing.log`; `Scanner.js?v=16`, `4_Context.js?v=28`. El 27/10 s'hi afegí la
**marca al `<head>`** (`index.html` + `Boot.page()`/`pageLoad()` a `js/main.js`) que ara
mesura també el tram de navegació + càrrega dels 48 mòduls.
**Què falta validar** (només val en **fred**, després de reiniciar l'equip):
- `ARRENCADA COMPLETA` **≤ ~10 s** i el log **no** s'obre tot sol.
- **Una sola** línia `checkContext · readFolder NAS`; `sonda wotts`/`sonda MP4` amb valor
  (o `TIMEOUT/ERROR (8 s)` → el botó queda en `ESPERA` i el poll de 15 s ho reintenta).
- Llegir les 2 línies noves del `_boot_timing.log`: la **negativa**
  (`pàgina: navegació → main.js`) i la de `load`. Si la negativa és ~11 s el temps és
  baixada/parseig dels 48 mòduls; si és ~0,3 s, els 11 s són arrencada del motor CEP.
- Comparativa: (a) sense projecte, (b) amb el projecte de sempre, (c) amb el *Customer
  Improvement Program* desactivat.
**Fitxers**: `js/core/4_Context.js`, `js/logic/Scanner.js`, `index.html`, `js/main.js`.

### #111 / #116 / #117 · Notes antigues de markers i semàfors

Cap d'elles té codi aplicat ni entrada detallada: s'han de **decidir** abans d'implementar.

- **#111**: els ítems `flotant:true` no reben marcador (cas real `03`
  «+++ IPD MEDIACIÓ MARICARMEN +++», bloc V2 del `TN_VESPRE` 28/09). Cal decidir si el
  marcador ha de ser **vermell** i amb quin criteri.
- **#116**: marcador **vermell de cua** (TNC V2, 131,64 s · 2a passada 131,52 s) que no
  hauria d'existir; el filtre el descarta i `_safePlaceByPrefixes` el torna a afegir
  (acaba amb `Nous: 1`). Cal decidir: excepció al filtre o a la vàlvula.
- **#117**: `ReferenceError: mediaN is not defined` a `checkContext` quan l'escaleta porta
  `mediaStop`+`blockOut` → es perden els semàfors SRT i WOTTS i s'escriu un ⚠️ fals.

---

## 2 · RESOLTS I TANCATS (126)

Ordre cronològic d'incident. La data és la del tancament; **els tancats el 2026-10-27**
(`#152`, `#153`, `#178b`, `#183`, `#189`, `#190`) ho foren **per decisió de l'usuari,
sense prova en viu**.

| Nº | Data | Descripció |
|---|---|---|
| **#8** | 2026-05-28 | CRASH F2: JSON.parse de respuesta 'ERR:...' del JSX → SyntaxError |
| **#9** | 2026-05-28 | Color de marcadores perdido al hacer delete+create en placeByPrefixes |
| **#10** | 2026-05-28 | Marcador rojo inesperado: lógica de color 'agrupacio ? 6 : 1' no distinguía rojo/amarillo |
| **#11** | 2026-05-28 | OUT del MP4 incorrecto por duradaOnAir inconsistente (TNC V2: OUT recortado a 54s en vez de extenderse 78s) |
| **#12** | 2026-05-28 | Ítems gráficos (TE, GI, etc.) colocados como estructurales por el codepath UNGROUPED |
| **#13** | 2026-05-28 | _deduceOnAirSortida y Tier 2 cruzan fronteras de agrupacio → OUT extendido 104s (TNV V1) |
| **#14** | 2026-05-29 | F3.5/F4/F5 cambian el color de los marcadores a verde al hacer snap |
| **#15** | 2026-05-29 | Marcador F2·Deducido '01i' no se coloca en 00:00 (TNC: colocado a 3.72s) |
| **#16** | 2026-05-29 | MP4 IN asigna worldBlockStartSec del item anterior (cross-agrupacio contamination) |
| **#17** | 2026-05-28 | TNV V3: OUT del MP4 extendido ~41s — posible inconsistencia de datos en la escaleta |
| **#55** | 2026-09-24 | Clip MP4 del bloc col·locat SENCER al timeline: tot el material ~12s a la dreta (12,04s = 10s de clipInOffset + 2,04s de desfase del fitxer extret) |
| **#56** | 2026-09-24 | Desfase de 10s entre àudio i vídeo del clip del bloc |
| **#57** | 2026-09-24 | Ancoratge de marcadors: el delta de correlació s'aplicava DUES vegades (F3 i F3.5) -> el marcador quedava 1,8s ABANS del seu corte |
| **#58** | 2026-09-24 | F4·Faro no clavava el marcador al corte tot i que el fix B ja era al codi (ventana ±1,5s) |
| **#59** | 2026-09-24 | Marcador del vídeo desviat uns frames del seu corte per F6·Ordre |
| **#60** | 2026-09-24 | Marcadors VERMELLS (ítems no agrupats) col·locats al final del bloc |
| **#61** | 2026-09-24 | Creant el V1 del 23/09: el panel agafava l'escaleta V2 (més recent) i el guarda «escaleta d'un altre bloc» avortava la creació |
| **#62** | 2026-09-24 | Ruta de treball única per BLOC: <prog>_PROJECTES/<data>/<V> (abans tots els blocs barrejats a la carpeta del dia) |
| **#93** | 2026-09-25 | ffmpeg -ss NO és el 0 del fitxer extret: el tall arrenca al KEYFRAME ANTERIOR (pre-roll) → 0,81 s d'error sistemàtic a tots els marcadors |
| **#94** | 2026-09-25 | Crash 'zonaInOffset is not defined' JUST després del trim: corchetes de seqüència sense fixar i ref del manifest sense finalitzar |
| **#95** | 2026-09-25 | IN·FLOOR incloïa ítems del MATEIX bloc → bloc buit (IN>=OUT) → IN/OUT-GUARD baixava l'IN minuts enrere |
| **#96** | 2026-09-25 | Ancoratge: l'offset de conversió fitxer→timeline usava la ref del manifest (FIX-A/B) en lloc del clip.inPoint REAL → biaix igual a clipInOffset/zonaInOffset (10 s a… |
| **#97** | 2026-09-25 | _rebuildManifestFromLocal reescrivia la ref en coords d'ORIGEN després de l'extracció (3r escriptor del manifest) |
| **#98** | 2026-09-25 | Clips.trimAudioA2 no està exposat pel bridge JSX: ERROR vermell a cada execució (no-op) |
| **#99** | 2026-09-25 | REPARTIR (traduccions/chyrons) només omplia el PRIMER clip de V1 quan les traduccions del tram queien a cavall de 2 clips seleccionats |
| **#100** | 2026-09-25 | REPARTIR destrossava el clip veí de la dreta de la pista (rètol Llocdata) en col·locar-hi les traduccions |
| **#101** | 2026-09-28 | El placement inicial de traduccions (per TC) col·locava les últimes traduccions FORA del seu clip de referència de V1 (TC=01.10: 2 clips @ 70.00s dur=10.00s quan el… |
| **#102** | 2026-09-28 | El chyron del CONDUCTOR no es col·locava (TNV V3 28/09) i el log deia '✅ col·locat' igualment |
| **#103** | 2026-09-28 | REPARTIR només tenia en compte el PRIMER clip seleccionat de V1 (2 clips seleccionats → 1 usat) |
| **#104** | 2026-09-28 | L'IN del bloc arrencava DINS del sumari anterior (TNM V1 27/09 'DIRECTE PUERTA DEL SOL': el corchete IN queia a 14:30:52 en lloc de 14:32:16 → 84 s de tema aliè a… |
| **#105** | 2026-09-28 | L'IN del bloc arrencava DINS d'un VÍDEO ALIÈ encara en emissió (TNM V1 28/09 'DIRECTE PUERTA DEL SOL': amb el #104 el corchete ja no cau dins del sumari, però cau a… |
| **#106** | 2026-09-29 | El chyron de CONDUCTOR s'inseria en un bloc que no té cap ítem de presentació (TNV V1 'LEAD DIAGONAL TALLADA' 29/09: conductor a 0.40s sobre un bloc que obre amb un… |
| **#107** | 2026-09-29 | El Tema-Títol GRAN s'ancorava al marcador d'un ALTRE ítem (un chyron de grafisme) i el titulillo d'entrada quedava 11s abans: TNV V1 'LEAD DIAGONAL TALLADA' 29/09… |
| **#108** | 2026-09-29 | Marcadors que queden VERDS (color per defecte de Premiere): TNV_V2 'NEGOCIACIONS HABITATGE' 29/09 — el marcador 01dir sortia verd després de la fase F4·ASIG |
| **#109** | 2026-09-29 | L'ítem NO agrupat 02dir ('LIN DIRECTE PUERTA DEL SOL', agrupacio:null) no rebia cap marcador vermell al bloc TNV_V2 29/09 |
| **#110** | 2026-09-29 | Els marcadors VERMELLS (ítems no del bloc) no es col·locaven MAI en el flux automàtic OUT&GO, i els no agrupats sense OnAir tampoc mai (cas 02dir) |
| **#112** | 2026-09-29 | IPD+: el clip de transparència de subtítols (pista V2) canvia de POSICIÓ a més de canviar de pista |
| **#114** | 2026-09-30 | NETEJA DEL REPO (P0→P5): 6.487 ficheros → 165 útiles, 87 .md → 22, bin/ 38 → 24 scripts, docs/SAMPLES (19 MB) fuera del git y higiene anti-contaminación para el… |
| **#115** | 2026-10-02 | CÓDIGO MUERTO en js/ y jsx/: 28 de los 72 .js NO los carga index.html y al menos uno (js/core/escaleta_trim.js) ni compila. NETeJA EXECUTADA el 2026-10-02 (OK… |
| **#118** | 2026-09-30 | BOUNDS TNM V1 (29/09): l'IN del bloc s'enfonsa de 14:31:53 a 14:29:58 (inici del sumari) i la fase de Vermells omple la capçalera del clip amb 10 marcadors vermells… |
| **#119** | 2026-09-30 | El marcador d'INICI del bloc (00:00) desapareix: F5·Inferits mou l'ítem que el sosté (TNM V1 30/09, '01dp'). El bloc tallat correctament per l'usuari acaba sense… |
| **#120** | 2026-09-30 | El projecte NOU es crea SENSE clip (V1 buida) quan el bloc no és dins del cleanFeed: la guarda 'cleanFeed encara en ingesta' (skipVideoIngesta) descarta també el… |
| **#121** | 2026-09-30 | S'importa material ALIÈ a V1 quan el bloc s'emet MÉS ENLLÀ del final del SNAPSHOT de l'escaleta: la guarda 'cleanFeed en ingesta' i el límit [OUT-MARGIN] es… |
| **#122** | 2026-09-30 | Gràfics del TNV (GF/P2) tractats com a ESTRUCTURALS: el marcador OnAir '01' queda 1,32 s ABANS del seu corte real, els GF es pinten VERMELLS i s'apilen a l'inici… |
| **#123** | 2026-09-30 | Els marcadors DEDUÏTS dels parells DP+DIR del TNV V2 (16dp i 16dir) queden a 7,00 s i 30,80 s del seu corte real (ruptures de densitat 23,36 s = 00:00:23:09 i 48,80… |
| **#124** | 2026-09-30 | El PNG de la PORTADA (workflow RENDER · runPortada) es componia sobre un frame DIFERENT del que es veu a la timeline: la còpia del clip de V1 es fa amb… |
| **#125** | 2026-09-30 | TNV_V1 del 29/09: el marcador de grafisme '01 GF-3' surt BLAU (hauria de ser GROC, com els altres tres GF) i col·locat a 58,52 s — dins del vídeo del discurs — en… |
| **#126** | 2026-10-01 | REVISIÓ DE LA MÀSCARA DE PISTA: cap procediment del panell la protegeix. (a) IPD+ té les pistes HARDCODEJADES SRC:2 (V2 = pista de la MÀSCARA al mapa 2026-09-22… |
| **#127** | 2026-09-30 | MECANISME DE SEGURETAT — si el panell no pot importar un MP4 vàlid, tota la lògica ha de funcionar igual amb el clip que l'operador hagi col·locat a V1: IN el… |
| **#128** | 2026-10-01 | TITULILLO (flow_chyrons): dos defectes al titulillo de sortida detectats per l'usuari testejant el 2026-10-01 — (a) el PRIMER clip col·locat queda 1 FRAME massa… |
| **#129** | 2026-10-01 | IPD+ (toggle V2->V3): el clip que es puja a PARK (V3) i el que es re-insereix a SRC (V2) al REVERTIR neixen amb el Motion PER DEFECTE, aixi que el clip que duu la… |
| **#130** | 2026-10-01 | REGRESSIÓ VIVA DEL #131 (report de l'usuari al test a Premiere del 2026-10-01, panell amb flow_chyrons.js?v=53): «ha aparegut el mateix problema amb els tematítol i… |
| **#131** | 2026-10-01 | TITULILLO (flow_chyrons): el TEMA-TÍTOL GRAN quedava RETALLAT PEL PRINCIPI (li falta la part esquerra) després del #128. La seva posició relativa era correcta… |
| **#132** | 2026-10-02 | EDITOR DE SUBTÍTOLS · FINESTRA MASSA AMPLA (report de l'usuari, 2026-10-01): «al editar los subtítulos, la ampliación del timeline (de subtítulos) era demasiado… |
| **#133** | 2026-10-02 | CHYRONS DUPLICATS A LA TIMELINE (report d'usuari 2026-10-02, TNM V1 del 01/10): «cuando hay el mismo chyron generado varias veces, con el mismo TC, se colocan… |
| **#135** | 2026-10-02 | IN DEL BLOC ANÒMAL (TNM V4, run del 02/10 sobre l'escaleta del 01/10): el motor va ancorar l'inici del bloc V4 a 15:06:58 (0:20 dins el clip extret) quan l'escaleta… |
| **#136** | 2026-10-02 | TRADUCCIONS DUPLICADES A LA TIMELINE (report d'usuari 2026-10-02, TNM bloc 36): «con las traducciones también hay que introducir un filtro que solo coloque la… |
| **#137** | 2026-10-02 | MOJIBAKE ALS ACENTS de TOT fitxer llegit pel pont (IO.readTxt): el nom del projecte al NAS sortia Pruebas_TNC_V1_CRANICA VACTOR SORRIBES PLUJA PERSISTENT A… |
| **#138** | 2026-10-02 | AL RESET ♻️ DELS SUBTÍTOLS ELS MARCADORS ES CONSERVEN (report d'usuari 2026-10-02: «al resetear los subtítulos, se conservan los marcadores. esto es erróneo. Los… |
| **#139** | 2026-10-05 | ELS MARCADORS DELS IPDs SURTIEN VERMELLS (report d'usuari 2026-10-05, bloc DONAPAS + DIRECTE): «Los marcadores de los IPDs aparecen en rojo. Eso es correcto si… |
| **#140** | 2026-10-05 | ELS MARCADORS DELS IPD (i dels ítems no agrupats) NO REBIEN L'AJUST AL CORTE MÉS PROPER (observació d'usuari 2026-10-05, després del fix del #139): «Puede ser que a… |
| **#141** | 2026-10-05 | 📷 FOTO: «No s'ha pogut desar» tot i que l'API SÍ que tenia l'escaleta (TNC V1 2026-10-05, 14:03:55). El botó FOTO ha de funcionar SEMPRE, fins i tot ABANS de cap… |
| **#142** | 2026-10-06 | CAP PNG I RES COL·LOCAT a la cadena de chyrons (report d'usuari 2026-10-06). Tots els congelats (Tema-Títol, titulillo, TITOLET, mapa, Portada) depenien de… |
| **#143** | 2026-10-06 | TITOLET: la targeta col·locada a la timeline durava 5 frames MÉS que el rètol cremat a l'aire (petició d'usuari 2026-10-06). |
| **#144** | 2026-10-07 | TEMA-TÍTOL · SORTIDA/transicions: el titulillo es tancava invertint el wott petit amb ffmpeg (_REV.mov). El Wott del Tema-Títol JA porta la seva pròpia animació de… |
| **#145** | 2026-10-07 | AUDIO FANTASMA a Clips.insert (l'àudio enllaçat d'un ítem amb so cau en una PISTA NOVA) + A1 truncat a 9,76 s pel TRIM-TAILS + Wott orfe a V6 596,64→597,04. |
| **#146** | 2026-10-08 | Botó 🎨 MAPA (2 parts, report d'usuari 2026-10-08): (1) el grafisme es col·locava al TC del MARCADOR de l'ítem i no al CABEZAL — amb el cabezal a 38,84 s el… |
| **#147** | 2026-10-08 | El CONGELAT (freeze) d'un rètol portava la imatge del PROGRAMA (V1) en lloc del grafisme: PNG de 524 KB en comptes de ~35 KB (TNM V3, passada real del 2026-10-08) |
| **#148** | 2026-10-08 | La MATEIXA firma col·locada DUES vegades en dues capes diferents (V7 i V8) al mateix tc (TNM V3, passada real del 2026-10-08) |
| **#149** | 2026-10-12 | TRADUCCIÓ (TRAD/COLOCAR i REPARTIR): quan l'espai assignat a una traducció és més LLARG que la durada del seu mèdia, els clips s'estiraven amb Clips.endAt més enllà… |
| **#150** | 2026-10-12 | Marge massa gran al PRIMER subtítol en col·locar/importar l'SRT a l'editor de subtítols (boto IN): el primer clip de subtítols començava 0,4 s (10 frames a 25 fps)… |
| **#151** | 2026-10-13 | TRADUCCIONS (test d'usuari 2026-10-13, TNM V3): (a) REPARTIR repartia les traduccions només dins del clip que CONTÉ la 1a traducció — la selecció de V1 només… |
| **#154** | 2026-10-13 | El PNG de portada no sempre es diu com l'MP4 exportat: el DESTÍ és correcte (AAA_PORTADES), el NOM no està garantit. Cal garantir la coincidència del nom base PNG ↔… |
| **#155** | 2026-10-13 | 4a reaparició de la familia de CODI MORT (restauració d'un arbre antic del pendrive dins l'extensió) + PORTA pre-commit que impedeix tornar-la a commitejar mai més. |
| **#156** | 2026-10-14 | Falta el marcador de l'ítem d'entrada del bloc TNV V1 del 13/10: 022f 'off' es va calcular amb una escaleta OBSOLETA (snapshot 21:15:24 amb agrupacio null) en… |
| **#156b** | 2026-10-14 | MARC P D'INICI (00:00) I SEPARACIÓ DE MARCADORS (report d'usuari 2026-10-14, TNV V1): el marcador d'inici s'assignava amb isItemEstructural (durada > 0) → queia… |
| **#157** | 2026-10-14 | El botó FOTO demanava l'escaleta del dia EQUIVOCAT: amb el projecte del 13/10 obert (carpeta PROVES/04_TN VESPRE_PROJECTES/2026_10_13/V1) va consultar digition amb… |
| **#158** | 2026-10-14 | TITOLET col·locats per CADÈNCIA al TNC V1 del 2026-10-14 (report d'usuari: «s'han col·locat al timeline però no al seu temps»). Els 6 TITOLET de l'ítem 04 (rol… |
| **#159** | 2026-10-14 | La part VIVA de les targetes de GRAFISME CREMAT (TITOLET i tota la família de titolet.detectRoles: PREGUNTA, CARTELL, DADA-GRAN…) s'inseria amb una durada MÉS… |
| **#160** | 2026-10-14 | EXPORTACIÓ DE LA PORTADA (PNG) TRENCADA (report d'usuari 14/10): (a) el PNG anava a AAA_PORTADES en comptes de la CARPETA DEL PROJECTE; (b) el PNG sortia NEGRE. |
| **#161** | 2026-10-14 | ÀTOMS FANTASMA AL BRIDGE (mateix llinatge que els flux_.js): Timeline.setWorkArea() i Timeline.getWorkAreaIn()/getWorkAreaOut() NO EXISTEIXEN a jsx/main.jsx → les… |
| **#162** | 2026-10-15 | ÀUDIO ORFE A LA ZONA NETA de la PORTADA (report d'usuari 2026-10-15): després de capturar el PNG quedava un clip d'ÀUDIO FANTASMA a A1 @ 151.00 s (zona morta), amb… |
| **#163** | 2026-10-15 | DESTÍ DEL PNG DE PORTADA (report d'usuari 2026-10-15): el PNG anava a la CARPETA DEL PROJECTE i ha d'anar a AAA_PORTADES — es REVERTEIX el canvi del 14/10 (#160a). |
| **#164** | 2026-10-16 | TNC V3 (bloc 14 «FAUNA ALIADA PER L'AGRICULTURA», 15/10): una TRADUCCIÓ acabava a V7, duplicada damunt del nom-càrrec legítim («…_644349_TRADUCCIO [2-3] Només… |
| **#165** | 2026-10-16 | TN MEDIODIA V1 (bloc «PG Intro / PENSIONS ENTREN EN PRECAMPANYA», emissió 15/10; mesurat al V6 auto-desat de les 09:52): el Tema-Títol GRAN entrava 32 s tard (32.32… |
| **#166** | 2026-10-16 | TN MEDIODIA V1 (15/10, V6): la peça de SORTIDA del titulillo (desaparició del Tema-Títol gran) no es veia a pantalla — quedava «mig amagada» per la cua del congelat. |
| **#167** | 2026-10-16 | TN MEDIODIA V2 (bloc «VIMBODÍ I POBLET», emissió 15/10): el rètol de LOCALITZACIÓ DEL DIRECTE («…_644353_Directe_PRESENCIAL_Vimbodí i P.») sortia a 0.40 s, o sigui… |
| **#168** | 2026-10-16 | TN MEDIODIA V2 (bloc «VIMBODÍ I POBLET», emissió 15/10): a l'entrega hi havia dues còpies del rètol de localització (…_644353_Directe_PRESENCIAL_Vimbodí i P.) —una… |
| **BOTO_MAIN_CUADRAT** | 2026-09-22 | El botón MAIN cambiaba de forma (se ajustaba al texto) al arrancar el panel y en cada cambio de estado |
| **CONDUCTOR_BLOC_AMB_GRAFISMES** | 2026-09-23 | El chyron de conductor se omitía porque el bloque abre con grafismos (P2 foto, P2 MAPA) y el ítem de plató (01i) es el 3º en la ESCALETA (aunque es el 1º del… |
| **DF_MAPA_A_CONFIG** | 2026-09-22 | Doble Finestra/Mapa usaban números de pista fijos (V1/V2/V3) en lugar de la config |
| **ESCAPE_BARRES_INJECTIO_JSX** | 2026-09-23 | Error d'escapada a la ingesta de fitxers: utils.importList només escapava les cometes simples, així que les barres invertides de la ruta es perdien dins del literal… |
| **ESPAI_FOCUS_BOTONS** | 2026-09-22 | Al pulsar ESPACIO con el foco en un botón del panel (p. ej. ▶ tras usar el slider) se saltaba al clip siguiente en lugar de hacer PLAY/PAUSA |
| **GRAF_REF_CLIP_V1** | 2026-09-22 | El GRAF tomaba como referencia el cabezal (CTI) y no el clip a sustituir |
| **GRAFISMES_PER_MARCADOR** | 2026-09-23 | Automatitzar el botó 🎨 (MAPA) guiat pels marcadors grocs: (1) la referència del punt d'entrada passa del clip seleccionat al MARCADOR; (2) congelat de 3 s (o fins… |
| **INVERSIO_PEREZOSA_TITULILLO** | 2026-09-22 | El titulillo se enviaba a invertir (ffmpeg) siempre, aunque el reverso no se fuera a colocar en el timeline |
| **IPD_PLUS_DOBLE_FINESTRA_VERTICAL** | 2026-09-23 | Botó IPD+ = TOGGLE per INTERVAL: talla el clip de V2 a l'interval seleccionat i el mou a V3, duplica V1 → V2, i aplica els atributs de capa inferior a V1… |
| **MARCADORS_GRAFICS_F6_DESCONNECTAT** | 2026-09-23 | Los marcadores amarillos/grocs (color 4) de los ítems gráficos (P2 foto, P2 MAPA, GF, TE…) nunca se generaban: F6·Gràfics (Workflows.Markers.placeGraphicMarkers) no… |
| **OUTGO_TOTES_LES_PISTES** | 2026-09-23 | OUT&GO no recortaba en V9 (Mosa): las pistas a limpiar eran listas FIJAS [2..8] y [A1,A2] |
| **PLAY_PANELL_FOCUS_HOST** | 2026-09-22 | El ESPACIO no hacía PLAY/PAUSA: el play del panel NUNCA ha funcionado porque qe.project.getActiveSequence().play() NO EXISTE en esta versión de Premiere (log… |
| **REGLA_TEMPS_FINAL** | 2026-10-02 | REGLA «TEMPS FINAL» (petició d'usuari 2026-10-02): en repassar els ítems de l'escaleta, el primer que conté el text «TEMPS FINAL» marca el FINAL de l'escaleta útil… |
| **REVERS_TITULILLO_FRAME** | 2026-09-22 | El reverso del titulillo (la animación invertida delante del Tema-Títol) quedaba 1 frame a la izquierda |
| **SLIDER_NO_ES_MOU_AMB_ESPAI** | 2026-09-22 | Al pulsar ESPACIO (play), el slider de reencuadre se iba al centro / perdía su posición |
| **SRT_NOMES_DEL_DIA** | 2026-09-22 | El fallback de SRT cargaba subtítulos de OTRO día (TNC V1 del 22/09 cargó el .SRT del 21/09 'EMPRESES DE LLEURE... CERDANYA') |
| **SRT_RESET_REBUSCA** | 2026-09-22 | El botón RESET (♻️) de subtítulos solo restauraba el SRT ya cargado; ahora vuelve a BUSCAR los .SRT del tema del bloque |
| **TITULILLO_SALIDA_MARCADOR** | 2026-09-22 | Titulillo de cobertura: el reverso acababa en la posición calculada del Tema-Títol grande, no en el TC del marcador del ítem |
| **TT_AL_MARCADOR** | 2026-09-22 | El Tema-Títol grande entraba 1 s (25 frames) después del marcador (se le sumaba el tc del nombre del wott) |
| **#171** | 2026-10-16 | Petició d'usuari 2026-10-16: «en general quan s'insereixen els chyrons, es col·loquen al timeline de manera que després NO es poden estirar amb el ratolí… |
| **#172** | 2026-10-16 | PORTADA — el PNG que es publicava NO era el frame demanat: la portada eixia amb el fotograma d'un altre moment de la timeline, i com que la captura sencera (còpia a… |
| **#173** | 2026-10-16 | Render de vídeo — flow_render.runVideo retallava el timeline SEMPRE a l'Out de la seqüència: amb una ÀREA DE TREBALL marcada (i sense IN/OUT) l'exportació ignorava… |
| **#174** | 2026-10-21 | PORTADA — en ocasions el PNG exportat NO és el frame triat: amb un clip LLARG i el cabezal CAP AL FINAL del clip, el PNG conté un frame d'uns 25 frames ABANS del… |
| **#175** | 2026-10-21 | El botó RESET GENERAL (🔄 d'INICI) no deixava la carpeta del projecte completament buida: hi quedaven fitxers (projecte .prproj, escaleta local, manifest...) i el… |
| **#176** | 2026-10-21 | En obrir CONFIG GRAL la finestra eixia BUIDA: cap camp omplert (ni AUTOR ni rutes), les pestanyes d'estructures sense cap targeta i cap desplegable de programa… |
| **#177** | 2026-10-21 | Tres defectes vistos provant F2/F3 a Premiere: (a) en desar CONFIG GRAL eixia «EvalScript error» i la configuració NO es desava; (b) el selector de rutes (📁) obria… |
| **#178** | 2026-10-21 | El DASHBOARD CONFIG (setup.html) es veia MÉS GRAN i molt més espaiat que la finestra principal: lletra de 13px, títol de 18px, targetes amb 15px de padding, 15-20px… |
| **#152** | 2026-10-27 | El JSON d'anàlisi del bloc (`analisis_estructura/DD_MM_PROG_BLOC.json`) no s'escrivia MAI: les carpetes existien buides (29/09→13/10, V1..V4) i no hi havia traça d'ítems de context ni de trimBounds | 
| **#153** | 2026-10-27 | Proposta d'unificar eixe JSON en una sola peça de 4 blocs (BLOC / MARCADORS / escaleta amb `elements` / context 3+3) — **descartada** per decisió de l'usuari: el JSON actual ja fa la faena |
| **#178b** | 2026-10-27 | El botó 📁 de CONFIG (RUTES DE XARXA) obria el diàleg ANTIC de carpetes del Windows: arbre de discs a l'esquerra, sense Accés ràpid/favorits, sense Ús recent i amb… |
| **#179** | 2026-10-22 | en clicar GUARDAR CONFIG [Profile.json] al dashboard de configuració, el perfil es desava (i eixia l'avís «Configuració desada a Profile.json»), però la finestra… |
| **#180** | 2026-10-22 | el botó RESET (reciclatge de la cantonada INICI) no tancava el projecte a Premiere ni esborrava el seu directori. El log real del NAS (PROVES\FASTPASS.log, 22/10… |
| **#181** | 2026-10-22 | Ctrl+clic al botó MAIN (mode correcció) per crear/reprendre el projecte del dia anterior «no feia res»: ni projecte, ni missatge clar, ni cap canvi al panell… |
| **#182c** | 2026-10-22 | Quan el wott es col·loca SENCER (no l'acurta cap pla de V1 ni el final del seu ítem) el clip del timeline ix 1 FRAME més llarg que el mèdia real. Peticio de… |
| **#183** | 2026-10-27 | en un TNC V3 del 22/10, el congelat del titullet (la targeta que va just abans del Tema-Títol, a V6) en compte de congelar el titullet va congelar el CLIP de V1: al… |
| **#189** | 2026-10-27 | en fusionar els SINT amb 🧩 (o en carregar-los, Ctrl+clic), cada subtítol sintètic eixia ~40 s ABANS del lloc on tocava — l'usuari ho descrivia com «el subtítol és… |
| **#190** | 2026-10-27 | al clicar 🧩 (REOMLIR) no passava res: cap avís clar al panell. Al FASTPASS.log del projecte hi havia ⚠️ SRT_SINT: cap sintetic del programa TN_COMARQUES per a… |
| **#192** | 2026-10-27 | **Marcadors SUPERPOSATS al 00:00** (TNM_V1 26/10): `01 TE-1`, `01 TD-1`, `01BT` i `01dir` tots quatre a `0,00 s`, perquè F2 va fer `01dir` (4t de l'escaleta) «marcador d'inici» i F7·Cobertura va afegir-hi els altres tres amb la mateixa posició (la finestra de F5 eixia `[0,00 → 0,00]`); a més l'orde d'escaleta quedava invertit. **Fet**: fase pròpia **F8·Separació** (`flow_markers.separateOverlappingMarkers`) com a ÚLTIMA passa del pipeline d'OUT&GO (`main.js`), amb `_calcSeparacioSuperposats` (càlcul pur) — separa els clústers (≤0,20 s) amb GAP de 3 s en ordre de `sequencia`, no mou mai els OnAir (pinned) i respecta el clúster següent; 9 assercions noves a `bin/smoke/fp_smoke_ac.js` |

---

## 3 · Com s'actualitza este fitxer

1. **Bug nou** → fila nova a §1 amb número correlatiu (`#192`, `#193`…), estat i una línia
   de símptoma. Quan es tanca, la fila passa a §2 amb la data.
2. Un bug **no** es tanca mai «perquè sí»: o s'ha validat en viu, o es tanca per decisió
   explícita de l'usuari (i es fa constar).
3. `docs/CHANGELOG.md` només recull canvis de codi; **l'estat dels bugs viu ací**.
