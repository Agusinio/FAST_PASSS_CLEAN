# CHYRON_OUT_POLICY — Qui s'acota pel clip de referència i qui conserva la durada sencera

> Estat: **APLICADA** (28/10/2026) · pendent de validar en viu · bug [`#201`](../../BUGS.md)
> Implementada a `js/workflows/flow_chyrons.js` (**NO** s'ha tocat `jsx/`)
> Validació: **ALL GREEN | js 61/61 | smoke 533/533 | jsx intacte**

## 1 · El problema en una línia

El fix del bug **#197** (27/10) va fer que **tot** rètol que passa pel bucle genèric
(`_placeChyronsByType`) deixara de mirar el final del clip de V1 i només fera cas a
«marcador següent → durada pròpia del wott». Això era correcte per als **gràfics amb
animació** (que s'han d'inserir sencers), però **no** per als **rètols de text**: la regla
del 16/09 diu que un rètol «entra a +10 frames del seu clip de referència **i ACABA quan
acaba eixe clip**».

Efecte en cadena (TNC V2, bloc del 27/10): un nom-càrrec que s'allarga més enllà del seu
clip ocupa la pista quan hauria d'entrar el següent → `_chooseSlot` → `_firstFreeStart`
salta al `end` del clip ocupat → el rètol següent entra **al final de l'anterior** i
arrossega el tercer.

## 2 · Inventari de famílies (com està el codi hui)

| Família | Funció / via | Pista | Regla de FINAL hui | Ha d'anar acotada? |
|---|---|---|---|---|
| **NomCàrrec** (`rol=NOMCARREC`, `NC_`) | `placeChyronNom` → `_placeChyronsByType` | `V_CHYRONS` | `_limiteOutChyron`: marcador seg. → **durada pròpia** → clip | **SÍ** (aplicat 28/10) |
| **Lloc / Data** (`rol=LLOCDATA`) | `placeChyronLloc` → `_placeChyronsByType` | `V_LLOC` → `V_CHYRONS` | ídem | **NO** (decisió 28/10: durada pròpia) |
| **Firma** | `placeChyronResto` → `_placeChyronsByType` | `V_CHYRONS` | ídem | **NO** (decisió 28/10: durada pròpia) |
| **Resto**: `Enviat`, `Directe_*`, `PRESENCIAL`, `PROGRAMES` | `placeChyronResto` → `_placeChyronsByType` | `V_LLOC` → `V_CHYRONS` | ídem | **SÍ** (connexions · aplicat 28/10) |
| **Resto**: grafisme amb durada pròpia (xarxa de seguretat si no s'ha detectat com a cremat) | `placeChyronResto` → `_placeChyronsByType` | `V_LLOC` | ídem | **NO** (regla #197) |
| **TITOLET / grafismes cremats** (27 etiquetes de `titolet.detectRoles`) | `_placeTitoletChain` (cadena targeta + congelat) | V8 preferent → V7 | rang reservat + `itemEnd` (**no** passa per `_limiteOutChyron`) | **NO** (ja té regla pròpia) |
| **Traducció** | `placeChyronTraduccio` / `repartirChyronTraduccio` | `V_LLOC`/`V_LLOCDATA` | per TC + REPARTIR | **NO** (regla pròpia) |
| **Conductor** | `placeChyronConductor` | `V_CHYRONS` | marge del clip + regla de plató/cabecera | **NO** (regla pròpia) |
| **Tema-Títol** | `placeChyronTitol` | `V_CHYRONS` | marcador de l'ítem + transicions | **NO** (regla pròpia) |

## 3 · Proposta

### 3.1 · Política de final (predicat pur) — **APLICAT**

`_limiteOutChyron` rep el booleà `acotat` (resultat del predicat pur `_esRetolAcotat(c)`):

| `acotat` | Ordre de límits |
|---|---|
| **`true`** (NomCàrrec + connexions) | 1) **marcador següent** → 2) **final del clip de referència** → 3) durada pròpia → 4) final del clip |
| **`false`** (Lloc/Data, Firma, grafismes) | 1) **marcador següent** → 2) **durada pròpia** → 3) final del clip *(comportament #197)* |

`_esRetolAcotat` és **cert** per a `NOMCARREC/NOMCAREC` (rol, `Nom`/`Carrec` al nom o token
**exacte** `NC`) i per a les **connexions** via `_isConexioWott` (`DIRECTE`, `ENVIAT`,
`PRESENCIAL`, `CONNEXIO`, `CONEXIO`), i **fals** per a traduccions (`_isTraduccioWott`) i
grafismes cremats (`_isBurnedGrafWott`).

⚠️ **Trampa caçada per la prova del smoke**: buscar `NC_` amb `indexOf` sobre el nom fa
**fals positiu** amb «WOTT_**NC_**V2» (el codi de programa) i hauria acotat LLOC/DATA i
FIRMA, que l'usuari ha deixat fora. Per això el token es busca **exacte** (`split('_')`).

⚠️ Conseqüència assumida: amb `acotat=true`, un **tall de V1 dins del mateix ítem** torna a
retallar el rètol. És el que demana l'usuari per als noms-càrrec i les connexions («acaba
amb el seu clip de referència»), i no afecta els gràfics ni Lloc/Data ni Firma, que
conserven #197.

### 3.2 · Decalatge de 10 frames — **APLICAT**

`CHYRON_OFFSET_SEC` (0,40 s = 10 frames @25 fps) només s'aplica **quan l'entrada cau al
PRIMER clip del timeline** (`_esPrimerClipTimeline`: el clip arranca a 00:00 i no n'hi ha
cap d'anterior); en la resta, `placeStart = max(inici del clip, marcador)` **exacte**. El
log `📐` mostra els frames reals d'entrada (`+10f` o `+0f`).

Resta d'usos del 0,40 s que **no** s'han tocat (són regles diferents i validades):
`placeChyronConductor` (marge del bloc/cabecera) i les probes `#167/#170`.

## 4 · Decisions preses (usuari, 28/10)

| Pregunta | Resposta aplicada |
|---|---|
| Rètols de text a acotar | **NomCàrrec + Enviat/Directe/Presencial**. LLOC/DATA i FIRMA **fora** |
| Rètol més llarg que el seu clip | S'acurta al clip (i el log diu `acurtat per final del clip de referència`) |
| Decalatge del primer clip | Es manté en **10 frames** |
| Traduccions i grafismes | Sense canvis (regles pròpies) |
