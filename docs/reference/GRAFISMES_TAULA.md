# GRAFISMES — què és cada cosa i on va (taula + diagrames)

> **En una frase:** primer mirem **quin cognom porta el fitxer** (una paraula del nom); cada cognom
> té un camí fix fins a la seua pista del timeline. L'hora del nom (`00.00`) només importa en els
> casos on l'hora és el que decidix.
>
> Estat: **PLANEJAMENT** (30/10/2026). Este document no canvia cap codi.
> Cas que l'ha originat: **TNV V1 del 29/10** (el tuit de Gabriel Rufián).
> Bug obert: [`BUGS.md`](../../BUGS.md) **#210**. A la cua: [`FEATURES.md`](../../FEATURES.md) `XARXES_TC00`.
>
> Paraules que ixen al document:
> **wott** = el `.mov` de rètol que ens arriba · **TC** = l'hora que porta el nom del fitxer ·
> **OCR** = llegir el text de la imatge amb `bin/ocr.ps1` · **pista** = V1…V8 del timeline ·
> **cremat** = el grafisme ja està dins del vídeo, no és cap capa a part.

---

## 1 · El camí de qualsevol fitxer (mira'l de dalt a baix i para on diga SÍ)

```
        ENTRA UN FITXER (wott o .mov de la carpeta del dia)
                              |
                              v
   +-----------------------------------------------------+
   | 1. ÉS UN TUIT?                                      |
   |    al nom hi ha: XARXES · LUCYS · "wott x <nom>"    |
   |    o el bloc va solt (_V_00_)                        |
   +-----------------------------------------------------+
             | SÍ                                  | NO
             v                                     v
   ======================            +----------------------------------+
   CAMÍ  A  ·  TUIT                  | 2. ÉS UN GRAFISME CREMAT?        |
   Pista V3, tapat el clip           |    al nom hi ha una etiqueta de  |
   de V1 on el tuit es veu           |    la llista (TITOLET, PREGUNTA, |
   a la imatge. L'hora la           |    DADA-GRAN, LLISTA...)         |
   decidixen els ulls (OCR).         +----------------------------------+
   La hora del nom NO compta.                | SÍ                 | NO
                                             v                    v
                              ======================    +----------------------+
                              CAMÍ  B  ·  CREMAT        | 3. ÉS DE LA CARPETA  |
                              Pista V8 (si no cap,     |    DEL DIA?          |
                              V7), al segon que diu    |    es diu MAPA, o el |
                              el rastreig del vídeo.   |    títol del marcador|
                                                       |    ho diu             |
                                                       +----------------------+
                                                                 | SÍ       | NO
                                                                 v          v
                                               ======================   +--------------------+
                                               CAMÍ  C  ·  GRAFISME    | 4. ÉS UN RÈTOL?    |
                                               Pista V3 (o V2 si té    |    conductor, titol|
                                               peu gris). Al marcador  |    nom-carrec, lloc|
                                               de l'ítem que li toca.  |    firma, enviat...|
                                                                       +--------------------+
                                                                          | SÍ        | NO
                                                                          v           v
                                                          ======================  Se'n va al
                                                          CAMÍ  D  ·  RÈTOL      calaix: no es
                                                          Pistes V6/V7/V8, al    col·loca enlloc
                                                          marcador + la seua
                                                          hora (o a la connexió)
```

**Regla de memòria:** només els **rètols** (camí D) i les **traduccions** fan servir l'hora del nom.
Els **tuits** mai. Els **cremats** fan servir el vídeo (el rastreig).

---

## 2 · El nom del fitxer, tros a tros

```
Wott_TNV_V1_10_00.00_CAMPANYA ELECTORAL ACCIDENT_668645_XARXES-TEXT_tp_Gabriel Rufián_ERC_.00668981.mov
```

Camp per camp (l'orde en què els llig el panell, començant per 1):

```
   [1]  TNV ....................... programa
   [2]  V1 ........................ "bloc"      <- farcit, no és de veritat
   [3]  10 ........................ "línia"     <- farcit, no és de veritat
   [4]  00.00 ..................... hora        <- farcida, no és un TC
   [5]  CAMPANYA ELECTORAL ACCIDENT  titular
   [6]  668645 .................... número intern del sistema (no decidix res)
   [7]  XARXES-TEXT ............... QUÈ ÉS      <== el que mana
   [8]  tp ........................ tipus de tuit ("tp" = tuit polític)
   [9]  Gabriel Rufián ............ protagonista
   [10] ERC ....................... partit
   [11] (buit) .................... sense ús
   [12] .00668981 ................. número de fitxer
```

| Tros | Diu | Serveix per a… |
|---|---|---|
| `[1]` | `TNV` | saber de quin programa és |
| `[2]` `[3]` | `V1` · `10` | **fingir** que pertany a un bloc i a una línia (quan algú ho exporta a mà) |
| `[4]` | `00.00` | l'hora; **ací és un farciment** |
| `[5]` | `CAMPANYA ELECTORAL ACCIDENT` | el text del titular |
| `[7]` | `XARXES-TEXT` | **el cognom bo: QUÈ és este fitxer** |
| `[9]` `[10]` | `Gabriel Rufián` · `ERC` | de qui és el tuit |

### 2.1 · Què mana i què no

| Mira… | Serveix? | Per què |
|---|---|---|
| `XARXES-TEXT` (tros 7) | ✅ **SÍ, mana este** | és el cognom que posa el sistema a tots els tuits |
| `LUCYS VERTICALITZACIÓ` (tros 5) | ❌ no | només és el text que apareix quan algú exporta el tuit **a mà**; si l'exportació és normal no hi és (en el cas del Rufián no hi és) |
| `V1` i `10` (tros 2 i 3) | ❌ no | el programa d'exportació els posa per omplir; el tuit no té ítem |
| `00.00` (tros 4) | ⚠️ depén | en un rètol vol dir "entra al marcador"; en un tuit vol dir "no en tinc ni idea" |


---

## 3 · Les pistes del timeline (qui posa què en cada una)

```
 PISTA   QUÈ HI VIU                                        QUI HO POSA
 -----   ------------------------------------------------  ----------------------------
 V1      el material de vídeo (els clips)                  (ja hi és)
 V2      la màscara de Reels (la franja)                   la màscara, o un grafisme
                                                           amb peu gris
 V3      els grafismes: MAPA, GF, P2 ... i ELS TUITS       botó 🎨 (carpeta) i TWITTS
 V6      el Tema-Títol (el títol gran)                     botó TÍTOL
 V7      els rètols de text: conductor, nom-càrrec,        botó COL·LOCAR 🎯
         firma, enviat, directe
 V8      els rètols de lloc/data, traduccions i (de        botó COL·LOCAR 🎯 / TRAD
         reserva) els grafismes cremats
```

> Els números de pista ixen de `Config.tracks.video` (`v_mp4`, `v_mascara`, `v_fondos`, `v_graf`,
> `v_graficos`, `v_video1`, `v_video2`, `v_tema`, `v_chyrons`, `v_lloc`, `v_trad`). Si un programa
> els canvia, tot el que hi ha davall s'adapta. V4 i V5 (`v_video1`/`v_video2`) són pistes auxiliars
> de vídeo i **no** intervenen en cap d'estes famílies. Qui decidix la pista al flux d'ensamblatge és
> `Assembly._resolveTrackForWott` (`js/logic/14_Assembly_Logic.js`).

---

## 4 · Taula de famílies (una línia per cada cosa que ens podem trobar)

| Grafisme | Com el reconec (sense endevinar) | Pista | D'on ix l'hora d'entrada | Si el nom diu `00.00` |
|---|---|---|---|---|
| 🎙️ **Conductor** | el nom diu `CONDUCTOR` (o el tries al desplegable) | V7 | el marcador de l'ítem | no passa res, és el normal |
| 📰 **Tema-Títol** | diu `Tema-Titol`, `_TITOL` o el rol `TEMA`, **i** el clip dura ≥ 4 s (`cfg.temaTitolMinSec`) | V6 | el marcador de l'ítem (o el marge del conductor) | no passa res |
| 🙋 **Nom-càrrec** | diu `Nom`, `Carrec` o `NC` | V7 (mai V8) | el clip on toca + el seu TC | entra al marcador |
| 📍 **Lloc / Data** | diu `Lloc`, `Data` o `LLOCDATA` | V8 (si està ple, V7) | el marcador + el seu TC | entra al marcador |
| ✍️ **Firma** | diu `Firma` o `FIR_` | V7 | el marcador + el seu TC | entra al marcador |
| 🔌 **Connexions** (enviat, directe, presencial, programes) | diu `_SENYAL_` / `_ENVIAT_` / `EN DIRECTO` → connexió; `PRESENCIAL` i la resta → rètol normal | V8 si és senyal/enviament; **V7** si és presencial | el punt de la connexió o el primer directe/IPD que ve | entra al marcador (i després es mou a la connexió) |
| 🌍 **Traducció** | diu `TRADUCCIÓ` (també amb accent) | V8 | el seu TC, repartint si n'hi ha moltes | és estrany que en porte |
| 🔥 **Grafisme cremat** (TITOLET i 26 etiquetes més) | el nom porta **exactament** una de les 27 etiquetes de `titolet.detectRoles` | V8 i, si no cap, V7 | el **rastreig del vídeo** (color + OCR); el TC només si és creïble (≥0,5 s) | **s'ignora**, ja està previst |
| 🗺️ **Grafisme de la carpeta del dia** | el títol del marcador diu `MAPA` i el nom del fitxer s'hi assembla (≥60 %) | V3, o **V2** si té peu gris | el marcador de l'ítem que li toca | estos fitxers no porten TC |
| 🐦 **Tuit / XARXES** | diu `XARXES` · `LUCYS` · `wott x <nom>` · o el bloc va solt (`_V_00_`) | V3, tapant el clip de V1 | **el clip de V1 on el tuit es veu a la imatge** (ho decidixen els ulls: OCR) | **no compta mai** |
| 🖼️ **Portada PNG** | el fitxer es diu `PORTADA...PNG` | — | — | no va al timeline |

### 4.1 · Llegenda ràpida (per a memòria)

```
   RÈTOLS  ->  l'hora del nom MANA      (V6 / V7 / V8)
   CREMATS ->  el vídeo MANA            (V8 / V7)
   GRAFISMES DE CARPETA -> el nom del fitxer MANA  (V3 / V2)
   TUITS   ->  el clip de V1 MANA        (V3)
```


---

## 5 · El cas del tuit de Rufián, dibuixat

### 5.1 · Què passa hui ❌

```
ÍTEM 10 DE L'ESCALETA
0:00                                                    0:41
|--------------------------------------------------------|  V1 · el vídeo
[XARXES-TEXT]                                               V7 · rètols
 ^
 |  El fitxer diu "hora 00.00", així que el panell l'apega
 |  al marcador de l'ítem (al principi del tot), com si fóra un rètol.
 |
 +- I com que ja "està col·locat", la passada dels tuits no el toca mai més.
```

### 5.2 · Què volem ✅

```
ÍTEM 10 DE L'ESCALETA
0:00                                                    0:41
|------------------|-------------|----------------------|  V1 · el vídeo
                   [XARXES-TEXT]                            V3 · grafismes
                    ^
                    |  Ací el tuit SÍ que es veu cremat dins de la imatge.
                    |  Ho diu l'OCR: compara el text del clip amb el nom del titular.
                    +-> el clip del tuit tapa eixe tros de vídeo i prou.
```

### 5.3 · Per què s'enganxa al marcador (3 passos, sense tecnicismes)

```
 PAS 1  El panell decidix si el fitxer "té ítem o no".
        Fa la prova només amb el bloc SOLT:  _V_00_  ->  "no en té".
        Este porta  V1_10  ->  el panell es pensa que SÍ en té.  ❌

 PAS 2  Com que té ítem, entra al bucle dels rètols. Eixe bucle
        suma la seua hora:  marcador (0:00) + 00.00  =  el marcador.  ❌

 PAS 3  Després, la passada dels tuits mira què falta per col·locar.
        Com que ja s'ha posat (encara que siga al lloc equivocat), no hi és.  ❌
```

### 5.4 · Què proposem (2 canvis, tots dos en `js/`, sense tocar `jsx/`)

```
 CANVI 1 · Un sol criteri per als tuits
   Ja existix la funció esXarxes() (22_TwittsOcr_Logic.js) i ja reconeix
   este nom. El que falta és QUE EL BUCLE DELS RÈTOLS LA PREGUNTE.

 CANVI 2 · Un filtre al bucle dels rètols
   Abans de col·locar res, el bucle diu:
        "si el fitxer és un tuit -> no el toque, ja el posarà TWITTS"
   Igual com ja es fa hui amb les traduccions (només les posa la fase TRAD).

      BUCLE DELS RÈTOLS                        PASSADA DELS TUITS
   +----------------------+                +----------------------+
   | traducció?  -> fora  |                | 1 frame per clip     |
   | tuit?       -> fora  | --deixa'ls-->   | OCR + comparar       |
   | la resta    -> dins  |                | col·locar a V3       |
   +----------------------+                +----------------------+
```

**Què passa si l'OCR no reconeix el tuit?** Queda pendent i el panell avisa
(`⚠️ [TWITTS] N tuit(s) sense col·locar`) i tu el pots fer a mà amb **Ctrl+clic a la DIANA 🎯**.
No es posa al marcador "per si de cas", perquè ja sabem que eixe lloc és fals.

---

## 6 · Les preguntes que necessite que em contestes

| # | Pregunta | Què proposo jo (si no em dius res, faig açò) |
|---|---|---|
| **D1** | ¿`LUCYS VERTICALITZACIÓ` ha de decidir alguna cosa? | **No.** Només informa. Mana `XARXES*` (ja funciona així hui) |
| **D2** | Un tuit amb hora bona (p. ex. `12.30`): ¿la respectem o l'enviem igualment a l'OCR? | **A l'OCR**: en esta família l'hora del nom no és de fiar |
| **D3** | Un rètol de text amb hora `00.00` (nom, lloc, firma): ¿es queda al marcador? | **Sí**, és el que fa hui i és correcte |
| **D4** | Si l'OCR no reconeix un tuit: ¿el deixem pendent o el posem al marcador igualment? | **Pendent + avís** (millor no posar res que posar-lo malament) |
| **D5** | ¿Els tuits han d'anar sempre a V3 encara que hi haja grafismes del dia? | **Sí**, V3 és la pista de grafismes i els tuits no tapen els rètols |

---

## 7 · On està cada cosa al codi (per si cal tocar-ho)

| Què | Fitxer | Funció |
|---|---|---|
| Reconèixer un tuit | `js/logic/22_TwittsOcr_Logic.js` | `esXarxes()` |
| Detectar el bloc solt (`_V_00_`) | `js/logic/13_Parse.js` | `_esFlotant()` |
| Llegir el nom (rol, hora, titular) | `js/logic/13_Parse.js` | `meta()` |
| Bucle que col·loca els rètols | `js/workflows/flow_chyrons.js` | `_placeChyronsByType()` |
| Col·locar el tuit amb OCR | `js/workflows/flow_twitts.js` | `runAuto()` / `_place()` |
| Rastreig dels cremats | `js/workflows/flow_chyrons.js` | `_placeTitoletChain()` |
| Grafismes de la carpeta | `js/workflows/flow_mapa.js` | `runFromMarkers()` / `_anchorMarker()` |
| Decidir la pista segons el rol | `js/logic/14_Assembly_Logic.js` | `_resolveTrackForWott()` |
| Peu gris (V2) | `js/logic/21_GrafZonaGris_Logic.js` | `decideSeries()` |
| Pistes i etiquetes | `js/core/11_Configuracio.js` | `tracks.video`, `titolet.detectRoles` |

**Ordre en què corren les coses** (`js/main.js`, botó COL·LOCAR):

```
COL·LOCAR 🎯 --> 1. rètols (conductor, titol, lloc, nom, resta, traducció)
                 2. grafismes de la carpeta (MAPA)
                 3. TUITS (OCR)      <-- si el pas 1 els ha tocat, ací ja no hi són
                 4. tornar el focus a V1
```

> ⚠️ Per això el filtre del CANVI 2 ha d'anar al **pas 1**: si no, el pas 3 arriba tard.

---

## 8 · Com afegir una família nova (quan aparega un cognom que no coneixem)

```
 1. Escriure el nom REAL del fitxer en un comentari d'este document.
 2. Decidir QUÈ mana: ¿l'hora del nom, el vídeo, o el clip de V1?
 3. Buscar la pista que li toca (taula §3) i comprovar que no està ocupada.
 4. Escriure una funció que només responga SÍ o NO (a `js/logic/`).
 5. Afegir-la a la taula §4 i una prova a `bin/smoke/`.
```

