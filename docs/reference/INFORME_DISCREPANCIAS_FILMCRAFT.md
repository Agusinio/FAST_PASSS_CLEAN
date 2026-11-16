# Informe de discrepancias: FAST >>> PASS (GitHub) frente al port a FilmCraft

**Fecha:** 16/11/2026
**FAST PASS analizado:** `Agusinio/FAST_PASSS_CLEAN`, rama `main`, commit `17b9e47`
**FilmCraft analizado:** fork Digition/Verticalización, panel `crates/ui-egui/src/panels/verticalization*`
(commit `4e7fcf90` + cambios locales sin publicar)

## Objetivo

El panel de Verticalización de FilmCraft se portó a partir de una copia **local** de FAST PASS del
**07/10/2026**. Desde entonces, FAST PASS ha cambiado de forma profunda. Los cambios más importantes
son de los días 21 al 23/10: rutas configurables (F2), modelo *local-first* y fin de la carpeta
VERTICALITZACIO. Este informe recoge, punto por punto, en qué se aparta hoy FilmCraft del
comportamiento de la versión de GitHub. Así se puede decidir qué se adapta y en qué orden.

No se ha modificado ningún código, ni de FilmCraft ni de FAST PASS. Este documento es solo de lectura.

## Cómo leer cada punto

- **FAST PASS:** qué hace la versión de GitHub, con el fichero y las líneas donde se ve.
- **FilmCraft:** qué hace hoy el port.
- **Impacto:** qué pasa en la práctica por la diferencia.
- **Propuesta:** qué habría que cambiar en FilmCraft para alinearlo.

Prioridad: 🔴 grave (el flujo es distinto) · 🟠 importante · 🟡 menor.

---

## Resumen

| # | Prioridad | Tema | Una línea |
|---|---|---|---|
| 1 | 🔴 | Vídeo de NOU | FAST PASS recorta el bloque del *clean feed* con ffmpeg; FilmCraft busca un MP4 ya hecho |
| 2 | 🔴 | `rutas.vertical` | Ha desaparecido del perfil; FilmCraft la necesita |
| 3 | 🔴 | NOU sin escaleta | FAST PASS no crea el proyecto; FilmCraft lo crea sin recortar |
| 4 | 🔴 | Subtítulos en NOU | FAST PASS ya no importa SRT al crear; FilmCraft sí |
| 5 | 🔴 | Pista de subtítulos | FilmCraft usa V5, que en el perfil es `v_video2` |
| 6 | 🔴 | FOTO de MATINS | Con el perfil nuevo FilmCraft pediría siempre `PRO1378` |
| 7 | 🟠 | Fecha de los WOTT | FilmCraft no aplica la regla nocturna y puede perder rótulos |
| 8 | 🟠 | Bloque de los WOTT | `V3` = `V03` y WOTT flotantes `V_` en FAST PASS |
| 9 | 🟠 | WOTT repetidos y fallidos | Por número/nombre y aborto en FAST PASS; por ruta en FilmCraft |
| 10 | 🟠 | Portadas | FAST PASS importa PNG en `PORTADES`; FilmCraft no |
| 11 | 🟠 | Tema del proyecto | De la escaleta en FAST PASS; del nombre del MP4 en FilmCraft |
| 12 | 🟠 | Estados del botón principal | MASSA D'HORA / CREA / PENDENT / ayer (Ctrl) |
| 13 | 🟠 | OBRIR | `.lock`, ingesta de lo nuevo y reconstrucción del manifest |
| 14 | 🟠 | Punto de entrada del clip | 10 s antes del bloque (FAST PASS) frente a 20 s (FilmCraft) |
| 15 | 🟠 | `Profile.json` | FilmCraft lee el perfil local antiguo |
| 16 | 🟡 | OUT & GO con V1 troceada | FAST PASS se salta también el corte OUT |
| 17 | 🟡 | Fases de marcadores de OUT & GO | Pendientes en FilmCraft (incluida la F8 Separació) |
| 18 | 🟡 | IN | FAST PASS solo recorta V1/A1; FilmCraft todas las pistas |
| 19 | 🟡 | Botones ◀ ▶ | Centro del clip (FAST PASS) frente al inicio (FilmCraft) |
| 20 | 🟡 | Deslizador X | FAST PASS limita por recortes y doble ventana |

---

## 1. 🔴 Origen del vídeo del bloque (NOU)

**FAST PASS**
- `js/workflows/flow_mainButton.js:786-791`: *«L'unica font de video es la captura del cleanFeed
  (extraccio ffmpeg amb els bounds calculats). Ja NO es busca cap MP4 a la carpeta de
  VERTICALITZACIO»*.
- Antes de calcular los límites del bloque, mide con ffprobe la **duración real** del *clean feed*.
  La escaleta es una foto del momento de publicación y su `mediaStop` puede quedarse corto
  (caso real TNM V4 29/09, `flow_mainButton.js:747-784`).
- Límites del bloque: `calcPrecisionTrimBounds(jsonData, bloc, mediaStart, mediaStopEfectivo, config)`
  (`flow_mainButton.js:859-865`).
- **Extracción con ffmpeg** (`flow_mainButton.js:973-1240`):
  - Fichero `<WOTT>_<bloc>_CLIP.mp4` en la **carpeta del proyecto**, junto al `.prproj` y al
    `AUDIO_REF.bin`.
  - Empieza en `mp4ExpandedInPoint` (el bloque menos los *handles*), ajustado al **fotograma clave**
    anterior (`keyframeAtOrBefore`) con *pre-roll*.
  - Termina en el final del bloque más los *handles*, más una **cola extra** de
    `clipExtraTailSec` (60 s por defecto). Así el clip se puede estirar si una conexión o un directo
    se alarga.
  - Los datos del clip extraído se recalculan (`cleanFeedData.mp4ExpandedInPoint/OutPoint`
    relativos al clip, `flow_mainButton.js:1080-1120`) y se guardan en el **manifest de sesión**.
- Si el bloque queda **fuera del rango** del *clean feed* (`isBoundsOutOfCleanFeedRange`), el
  proyecto se crea **sin vídeo** y se completa con ACTUALITZAR cuando llega la ingesta
  (`flow_mainButton.js:870-888`).
- `js/logic/3_Project_Logic.js:118-156`: se importa ese clip y se inserta en V1 con *insert + ripple*
  (para no borrar V2) y con *retrim* de vídeo **y audio**.

**FilmCraft**
- `block.rs::probe` (líneas 241-289) busca el MP4 del bloque en dos sitios:
  - **Digition** (`CLIPS_VERTICALITZACIO`), si el panel Digition tiene sesión;
  - **`rutas.vertical`** (`pick_media`), si no.
- Solo recorta por la escaleta si el nombre del MP4 importado coincide con el de
  `cleanFeed.mediaPath` (`block.rs::rundown_cut`, líneas 507-534). Si no coinciden, usa el rango del
  clip de Digition o el MP4 entero.
- El recorte es un **subclip sin restricción de recorte** (`clip.makeSubclip`, `restrictTrims:false`)
  del fichero completo: no extrae ningún fichero.

**Impacto**
- Con el flujo actual de FAST PASS, la carpeta donde FilmCraft busca el material ya no forma parte
  del proceso. El MP4 que encuentre puede ser antiguo o de otro bloque: es justo el caso que
  FAST PASS describe como «render PREMATUR amb material d'un altre bloc».
- Sin coincidencia de nombre con el *clean feed*, el proyecto se queda **sin recortar**.

**Propuesta**
- Tomar el vídeo **siempre** de `cleanFeed.mediaPath` de la escaleta (FOTO).
- Medir la duración real del fichero y aplicar los límites (ya portados en `bounds.rs`) con
  `mediaStop` efectivo.
- FilmCraft puede hacer el recorte **sin ffmpeg**: un subclip del *clean feed* con los mismos
  límites, más los 60 s de cola. Si se quiere un fichero propio en la carpeta del bloque (como
  FAST PASS), habría que añadir una exportación *smart-render*.
- Si el bloque está fuera del rango, crear el proyecto sin vídeo y dejar que ACTUALITZAR lo complete.

---

## 2. 🔴 `rutas.vertical` ha desaparecido

**FAST PASS**
- El `Profile.json` nuevo **no tiene** `rutas.vertical`.
- `js/logic/20_Rutas_Logic.js:241-249` (`normalizeRutas`) la **borra** expresamente si aparece en un
  perfil antiguo: *«Claus mortes: un Profile.json vell no les ha de reintroduir»*. Lo mismo hace con
  `escaletes` y `escaletes_domini`.
- Rutas nuevas del perfil:
  - `subtitulos`: `…\SRT_MP4_PER_TEMPS_15MINUTS`;
  - `subtitulosSinteticos`: `…\SRT_SINTETICS`, que se deriva de `subtitulos\SINTETICS` si falta;
  - `projectes`: alias de `destino_base`, que es la ruta autoritativa;
  - `grafismos`;
  - `nnews_root_1` y `nnews_root_2`.
- `portadas` y `render1` han cambiado de servidor: ahora están en `\\public.ad-ccrtv.local\Public\…`.

**FilmCraft**
- `block.rs::probe` devuelve el error «El perfil no define rutas.vertical» cuando no hay sesión de
  Digition.
- El SRT del bloque también se busca en `rutas.vertical`.

**Impacto**
- Con el perfil nuevo y sin Digition, NOU no puede crear el proyecto.
- Con Digition, el proyecto se crea sin SRT.

**Propuesta**
- Dejar de depender de `rutas.vertical` (lo resuelve el punto 1).
- Leer las rutas nuevas (`subtitulos`, `subtitulosSinteticos`, `grafismos`).
- Aplicar las mismas normalizaciones que `normalizeRutas`: `destino_base` ↔ `projectes`, la
  derivación de los sintéticos y el respeto del separador final.

---

## 3. 🔴 NOU sin escaleta

**FAST PASS** (`flow_mainButton.js:658-699`)
- **Nunca** crea un proyecto si el bloque no se ha emitido completo
  (`EscaletaReader.isBlockFullyEmitted`).
- Hay dos excepciones, y en las dos el proyecto es **PROVISIONAL** y se completa con ACTUALITZAR:
  - hay una FOTO local (`escaleta_on_demand_*.json`);
  - hay escaleta del sistema con `cleanFeed` y `escaleta`.
- Sin escaleta cargable: *«No es crea el projecte: … Fes FOTO quan el bloc acabi d'emetre»*. Así
  se evitan los proyectos genéricos del tipo `Pruebas_*_INTRO.prproj`.

**FilmCraft**
- `block.rs::create` (líneas 559-588): sin FOTO crea igualmente el proyecto con el estado
  *«sin escaleta (FOTO): vídeo sin recortar»*.

**Impacto**
- Pueden nacer proyectos con el material entero, sin In/Out y con un tema poco fiable (ver el
  punto 11).

**Propuesta**
- Exigir escaleta (FOTO o del sistema) para NOU.
- Si el bloque aún está en emisión, crear el proyecto como provisional y avisar en la línea de
  estado.

---

## 4. 🔴 Subtítulos en NOU

**FAST PASS**
- `3_Project_Logic.js:463-467` y `671-673`: *«Ja NO ingesta MP4/SRT … els subtítols viuen al costat
  del .prproj (SrtEditor CARREGAR/EXPORTAR)»*.
- `flow_srt.js:224-230`: la carga directa del SRT en la línea de tiempo está **desactivada**; se
  hace con el editor SRT.
- El editor SRT (`js/editor/srt_editor.js`) carga desde tres fuentes:
  - el `.srt` que está al lado del `.prproj`;
  - **Emergencia** (Ctrl+clic en CARREGAR, `srt_editor.js:607-910`), que lee los SRT de 15 minutos
    de `rutas.subtitulos`:
    - nombre: `AAAA-MM-DD_Telenot_cies_{migdia|vespre|comarques}_HH_MM_SS_HH_MM_SS.srt`
      (solo TNM, TNV y TNC);
    - ventana: desde el inicio del bloque, **sin margen delante**, hasta el final + máx(handles,
      `srtEmergencyTailSec` = 120 s);
    - también lee el fichero de 15 minutos **siguiente** para no cortar la última frase;
    - recalcula los tiempos con la base `worldSecMediaStart`, ajustada al clip real de la línea de
      tiempo (BUG #186, #223);
    - escribe `<nombre>_EMERGENCIA.srt` en la carpeta del proyecto;
  - **SINT**: SRT sintéticos de `rutas.subtitulosSinteticos` (`Scanner.srtSynthetic`,
    `flow_srt.js:512-640`), que rellenan los huecos del SRT normal (parámetros
    `srtSynthetic*` de la configuración).
- El eje del editor es **siempre** el IN del primer clip de V1 (BUG #262, commit `1beb0ea`).

**FilmCraft**
- `block.rs::add_captions` y `subtitles_on_v5`: al crear el proyecto lee el SRT de `rutas.vertical`,
  lo desplaza al recorte y lo convierte en clips de texto en V5.

**Impacto**
- La fuente de los subtítulos ya no existe en el flujo de FAST PASS.
- No hay equivalente del modo de emergencia ni de los sintéticos.

**Propuesta**
- Implementar la carga desde los SRT de 15 minutos (emergencia) y desde los sintéticos, con las
  mismas ventanas y la misma base de tiempo.
- Decidir si se carga automáticamente al crear el proyecto o con un botón, como en FAST PASS.

---

## 5. 🔴 Pista de los subtítulos

**FAST PASS**
- Pistas del perfil (`estructuras.*.tracks`): `v_mp4`=1, `v_mascara`=2, `v_fondos/graf/graficos`=3,
  `v_video1`=4, **`v_video2`=5**, `v_tema`=6, `v_chyrons`=7, `v_lloc`=8, `v_trad`=4,
  **`s_s1`=1, `s_s2`=2** (pistas de subtítulos).
- Los subtítulos van en pistas de subtítulos (*caption tracks*), no en una pista de vídeo.

**FilmCraft**
- `block.rs`: `SUBTITLE_TRACK = 4` (V5). Los subtítulos se convierten en clips de texto en V5 y se
  borra la pista de subtítulos.

**Impacto**
- V5 es la pista `v_video2` (segunda ventana de la doble ventana / IPD+). Cuando se porten esas
  funciones, chocarán con los subtítulos.

**Propuesta**
- Confirmar con el equipo la pista. Si se quiere fidelidad, usar las pistas de subtítulos `s_s1` y
  `s_s2`. FilmCraft tiene pistas de subtítulos con estilo propio.
- Si se mantienen como clips de texto, moverlos a una pista que el perfil no use.

---

## 6. 🔴 FOTO de MATINS

**FAST PASS** (`js/core/escaleta_fetch.js:149-396`)
- `DEFAULT_ESCALETA_IDS.MATINS = "PRO1378"` (línea 47). El perfil nuevo también trae
  `"escaletaId": "PRO1378"` para MATINS.
- Modelo: Digition crea **una escaleta por día laborable**; el id sube ~1 cada día laborable y los
  festivos lo desplazan.
- Orden de candidatos (`_resolveEscaletaId`):
  1. el id base del perfil;
  2. un id **estimado** con las escaletas guardadas en los proyectos de días anteriores. Se recorren
     hasta 5 días y se toman hasta 3 muestras. El estimado es el último id + los días laborables que
     han pasado (`_estimateEscaletaIdFromLocal`);
  3. los vecinos ±1, ±2 y ±3 del id base.
- Como máximo **3 intentos**, porque cada llamada puede tardar unos 30 s.
- Una respuesta es válida si trae `escaleta` y `cleanFeed` y no trae `missatge`. Se guarda como
  `escaleta_on_demand_<ms>.json`.

**FilmCraft** (`escaleta.rs:28-115`)
- Si el perfil trae `escaletaId`, **pide solo ese id**, sin vecinos (`candidates`, líneas 88-90).
- Solo cuando el perfil no trae id, usa un modelo distinto: **un id fijo por día de la semana**
  (`DAILY_IDS` = PRO1374 L, PRO1376 M, PRO1377 X, PRO1378 J, PRO1375 V). Recuerda el que funcionó
  para cada día en `escaleta_id.json` y prueba vecinos ±1 a ±4, hasta **10 intentos**.

**Impacto**
- Con el perfil nuevo, la FOTO de MATINS pedirá `PRO1378` todos los días. Solo puede acertar el día
  al que corresponda ese id.
- Los dos modelos (una serie que sube cada día o un id fijo por día de la semana) son
  incompatibles: hay que confirmar con datos reales cuál es el bueno.

**Propuesta**
- Comprobar con la API qué id tiene MATINS de varios días seguidos.
- Según el resultado, adoptar la estimación de FAST PASS o mantener el modelo semanal. En los dos
  casos, el id del perfil debe ser un **punto de partida** y no el único candidato.
- Limitar los intentos (FAST PASS: 3) por el tiempo de cada llamada.

---

## 7. 🟠 Fecha de los rótulos WOTT

**FAST PASS** (`js/logic/Scanner.js`)
- Orden de datación (`_fileDateYYYYMMDD`, líneas 58-86): **nombre del fichero → fecha de creación
  → fecha de modificación**.
- **Regla nocturna** (`_mtimeDateYYYYMMDD`, líneas 630-655): el proceso de la noche reescribe la
  fecha de modificación de los WOTT del día anterior hacia las 02:30. Por eso una modificación
  anterior a las **05:00** (`NIGHT_SHIFT_END_HOUR`) cuenta como del **día anterior**. Solo se usa
  como último recurso.
- Un fichero que no se puede datar se **descarta** (regla anticontaminación).
- Caché persistente de fechas por nombre (`fp_wott_dates_v1`).

**FilmCraft** (`block.rs:217-237`, `entries`)
- El día de cada fichero es la **más tardía** de creación y modificación: *«the later of creation
  and modification»*.

**Impacto**
- Un WOTT creado el 21/10 a las 13:58 y reescrito el 22/10 a las 02:31 queda con fecha **22/10**.
- Si el bloque se trabaja después de esa hora (por ejemplo, reabrir o actualizar el bloque de ayer),
  sus rótulos **no se importan**.

**Propuesta**
- Usar el mismo orden y la regla nocturna para los WOTT.
- Revisar por qué FilmCraft eligió la fecha más tardía. Venía de los MP4 de MATINS reescritos con el
  mismo nombre, un caso que con el punto 1 ya no aplica.

---

## 8. 🟠 Bloque de los WOTT

**FAST PASS** (`Scanner.js:171-207` y `394-414`)
- `_blocKey` normaliza el bloque a «LETRA|NÚMERO»: `V3` → `V|3`, `V03` → `V|3` y `V` → `V|`.
- `_wottBlocOf` busca el trozo del nombre que es exactamente el programa (`TNM`) y toma el
  **siguiente** como bloque. No confunde roles como `XARXES-TEXT`.
- Se importan también los WOTT **flotantes** (`Wott_TNM_V_…`, bloque sin número): XARXES-TEXT que no
  están ligados a ningún elemento. Van al bin, pero **no** sirven para dar nombre al tema.
- `wottsToday` (para el estado del botón) usa el prefijo `PROG_BLOC_`.

**FilmCraft** (`block.rs::pick_wotts`, líneas 333-343)
- Acepta `.mov` cuyo nombre contenga `<WOTT>_<bloc>_`, sin distinguir mayúsculas.

**Impacto**
- Los WOTT con el bloque escrito con cero delante (`V03`) y los flotantes no se importan.

**Propuesta**
- Portar `_blocKey` y `_wottBlocOf` e importar los flotantes en el bin `CHY`, sin usarlos para el
  tema.

---

## 9. 🟠 WOTT repetidos y fallidos

**FAST PASS** (`3_Project_Logic.js:468-669`, `ingestAssets`)
- Filtro final de seguridad: vuelve a datar cada rótulo contra el día de trabajo justo antes de
  importarlo.
- Un rótulo **ya existe** si su número de **6 o más cifras** (el último del nombre) ya está en el
  bin `CHY`, o si coincide el nombre base. El nombre base no tiene extensión ni el sufijo «` 1`» que
  Premiere añade al importar dos veces.
- Importa en bloques y, si falla, reintenta uno a uno (BUG #215).
- **Verificación final:** si no llega **ningún** rótulo al bin `CHY`, aborta con
  *«Projecte NO creat»*.

**FilmCraft** (`block.rs::new_wotts` e `import_wotts`, líneas 650-688)
- Un rótulo ya existe solo si su **ruta** coincide, sin distinguir mayúsculas ni barras.
- Si la importación falla, lo cuenta en la nota de estado y sigue.

**Impacto**
- Un rótulo con el mismo número y otro nombre o ruta se importaría dos veces.
- Se puede crear un proyecto sin rótulos sin que nadie se dé cuenta.

**Propuesta**
- Comparar por número y nombre base.
- Decidir si un proyecto sin ningún rótulo debe abortar, como en FAST PASS, o solo avisar.

---

## 10. 🟠 Portadas

**FAST PASS**
- `Scanner.portadas` y `portadasFromProject` (`Scanner.js:868-1030`) buscan la portada del tema (un
  PNG con el literal PORTADA y el prefijo `PROG_BLOC`) en `rutas.portadas`.
- `ingestAssets` las importa al bin **`PORTADES`**, filtradas por fecha y sin repetidos
  (`3_Project_Logic.js:675-729`).

**FilmCraft**
- No importa portadas. El botón de portada solo exporta un PNG.

**Propuesta**
- Añadir la ingesta de portadas al bin `PORTADES` en NOU, ACTUALITZAR y OBRIR.

---

## 11. 🟠 Tema del proyecto

**FAST PASS** (`flow_mainButton.js:576-745`)
1. **De la escaleta:**
   - Se toman las líneas del bloque ordenadas por hora.
   - Se queda el primer elemento estructural (o con vídeo), no flotante, cuyo título no contenga una
     palabra reservada (`RESERVED_THEMES`).
   - Si todos son reservados, se reconstruye desde el primer elemento **OFF/OFD**, o si no desde el
     primer estructural, quitando los prefijos reservados.
2. **De los WOTT** (`Scanner.wotts`, líneas 474-505): el nombre que contiene `Tema-Titol`, o el
   primero; el tema es lo que va tras `__` y antes del id `_NNNNN_`.
3. **Del título del bloque** en `cleanFeed.clips[].titol`: la última parte tras `__`
   (convención `…__intro__<TEMA>`).
4. Si el tema queda vacío, tiene menos de 3 caracteres o es una palabra reservada, **no se crea el
   proyecto**.
   - Con un diagnóstico explícito si la escaleta encontrada es de otro bloque.

- Nombres:
  - proyecto `Pruebas_<WOTT>_<bloc>_<TEMA>.prproj` (`flow_mainButton.js:801-803`);
  - secuencia `<WOTT>_<bloc>_<TEMA>` (`3_Project_Logic.js:104-107`).
  - Coinciden con FilmCraft.

**FilmCraft** (`block.rs::theme_of`, líneas 345-361)
- El tema es lo que sigue a `<archivo>_<bloc>_` en el nombre del MP4. Si no hay nada, es `TEMA`, y
  sin MP4 es `PENDENT`.

**Impacto**
- Si el MP4 sale de la escaleta (punto 1), su nombre deja de llevar el tema.
- Hoy el tema depende de cómo se llame el fichero de Digition o de la carpeta.

**Propuesta**
- Portar la extracción del tema desde la escaleta, con los dos respaldos y la lista de palabras
  reservadas.

---

## 12. 🟠 Estados del botón principal

**FAST PASS** (`js/core/4_Context.js:704-810`)
- Sin proyecto del día, el botón puede estar en tres estados:
  - **CREA**: hay WOTT del bloque y del día (`wottsToday`) **o** una escaleta local completa.
  - **ESPERA**: estado heredado.
  - **MASSA D'HORA** ("demasiado pronto"): no hay WOTT ni escaleta. Los semáforos se ponen en rojo.
  - Si la carpeta de WOTT no responde, **no** se bloquea el botón.
- Semáforo MP4: verde si `mediaStop` del *clean feed* ya pasa del final del bloque.
- Se actualiza solo cada 15 s.
- **Ctrl+clic = trabajar el bloque de AYER** (modo corrección; `4_Context.js:218` y `441`).
- ACTUALITZAR (`flow_mainButton.js:1500-1551`): si el proyecto se llama `PENDENT`, lo **promociona**
  al nombre con el tema. Guarda con el nombre nuevo, borra el `PENDENT` y su `.lock`, y crea el
  lock nuevo.

**FilmCraft** (`verticalization.rs::main_button`, `block.rs::mode`)
- NOU, OBRIR o ACTUALITZAR según exista el proyecto y esté abierto o no. NOU depende de que haya
  MP4.
- Revisa la carpeta cada 15 s (`PROBE_EVERY`).
- No hay MASSA D'HORA, ni bloque de ayer, ni promoción desde `PENDENT`.

**Propuesta**
- Añadir el estado MASSA D'HORA (sin WOTT ni escaleta), el Ctrl+clic para el bloque de ayer y la
  promoción del proyecto PENDENT.

---

## 13. 🟠 OBRIR

**FAST PASS** (`flow_mainButton.js:1639-1725`, `_runLoad`)
1. Mira el `.lock` del proyecto. Si es de **otro usuario**, avisa (*«X ya está editando …»*) y deja
   el botón en **LOCKED**.
2. Crea su propio lock (`Project.lock`).
3. Abre el proyecto.
4. **Sincroniza**: importa los rótulos y portadas que faltan (`_fullScan` + `_completeSyncUI`).
5. **Reconstruye el manifest** de sesión desde la última escaleta local
   (`_rebuildManifestFromLocal`).

- `Project.create` también crea el `.lock` al guardar (`3_Project_Logic.js:456-457`).

**FilmCraft** (`block.rs::run`, `Mode::Open`)
- Rechaza abrir si el proyecto actual tiene cambios sin guardar.
- Abre el proyecto y confía en las carpetas del bloque (para que no salga el aviso de medios
  perdidos).
- No hay `.lock` ni importa rótulos nuevos.

**Impacto**
- Dos operadores pueden editar el mismo bloque a la vez sin aviso.
- Los WOTT que han llegado después de crear el proyecto no entran hasta ACTUALITZAR.

**Propuesta**
- Leer y escribir el mismo `.lock`, con el mismo formato (el nombre del autor en texto), para
  convivir con FAST PASS.
- Importar los WOTT y portadas nuevos al abrir.

---

## 14. 🟠 Punto de entrada del clip en NOU

**FAST PASS** (`3_Project_Logic.js:189-208` y `343-375`; configuración en `11_Configuracio.js:324`
y `641-648`)
- Valores por defecto: `handles` = 20, `clipInOffset` = 10, `zonaInOffset` = 10, `tcOffset` = 0,
  `clipOutMarginSec` = 0 y `clipExtraTailSec` = 60.
- IN del clip en el fichero: `max(0.05, refIn + tcOffset − max(clipInOffset, zonaInOffset))`.
  - Con el clip extraído, `refIn` = `handles`, así que el clip empieza **10 s antes** del bloque.
- OUT del clip: `mp4ExpandedOutPoint + tcOffset`, recortado a la duración real del fichero.
- Marcas de la secuencia: **In = `zonaInOffset` (10 s)** y Out = duración del clip − `handles`.
- Después recorta las colas de todas las pistas al final real de V1 y hace zoom a la selección.

**FilmCraft** (`bounds.rs::trim`, `block.rs::mark_block`)
- El clip empieza en `block_in − handles` (**20 s antes**). El In está a 20 s y el Out en el último
  fotograma del bloque.
- No usa `tcOffset`, `clipInOffset` ni `zonaInOffset`.

**Impacto**
- El operador ve 20 s de cabecera en lugar de 10, y las marcas no están donde las pone FAST PASS.
- Sin `tcOffset` no se puede corregir el desfase de la ingesta.

**Propuesta**
- Leer `general.clipInOffset`, `zonaInOffset` y `tcOffset` del perfil y aplicar las mismas fórmulas.

---

## 15. 🟠 `Profile.json`

**FAST PASS**
- `Profile.json` con las rutas nuevas (punto 2), programas renombrados
  (`"id": "TN Comarques"`, `"TN Migdia"`, `"TN Vespre"`) y MATINS con `escaletaId`.
- Mezcla los valores por defecto del código con el perfil (`mergeProfile`): las listas se
  sustituyen enteras y los objetos se fusionan.
- Las rutas admiten variables (`{autor} {prog} {archivo} {wott} {bloque} {fecha} {tema} {base}
  {project}`, `20_Rutas_Logic.js`).
- `general.programStartHours` es la única fuente de las horas de inicio.

**FilmCraft** (`verticalization.rs:59`)
- Lee `FAST_PASS_PROFILE` o, si no está, `D:\OPENSHOT-VERT\EXTENSION-PREMIERE\Profile.json`, que es
  la **copia local antigua**.
- La selección (programa y bloque) se guarda por el `id` del programa.

**Impacto**
- Al pasar al perfil nuevo, el `id` de los programas cambia (`TNCOMARQUES` → `TN Comarques`) y la
  selección guardada se pierde.
- Las variables `{…}` de las rutas no se resolverían.

**Propuesta**
- Apuntar al perfil nuevo.
- Resolver las variables de ruta como `Rutas.resolve`.
- Hacer que la selección acepte el `archivo` o el `wott` como clave estable.

---

## 16. 🟡 OUT & GO con V1 ya troceada

**FAST PASS** (`js/main.js:1610-1621`)
- Si V1 ya tiene 2 o más clips, se saltan **las dos** primeras fases: el corte OUT y el troceado
  (TROSSEJA). Solo se vuelven a poner los marcadores.

**FilmCraft** (`out_go.rs:21-67`)
- Siempre corta en el cabezal (borra lo que queda detrás en todas las pistas) y solo se salta el
  troceado.

**Impacto**
- Pulsar OUT & GO otra vez con el cabezal en otro sitio vuelve a cortar el bloque.

**Propuesta**
- Con V1 troceada, no cortar. Solo los marcadores, cuando estén portados.

---

## 17. 🟡 Fases de marcadores de OUT & GO

**FAST PASS** (`main.js:1568-1650`, `runFullPipelineOut`)
- Orden de fases:
  1. OUT (recorte y limpieza)
  2. TROSSEJA
  3. Dedu (F2)
  4. Prev (F3)
  5. Correl (F3.5)
  6. Density (F4)
  7. Inferits (F5)
  8. Ordre (F6)
  9. Gràfics (F6·GF, marcadores amarillos)
  10. Vermells (elementos no agrupados, BUG #110)
  11. **Separació (F8)**: dos marcadores nunca se superponen; separación de 3 s (BUG #192)
- Al final guarda una **instantánea** `MARCADORS_<fecha>_<hora>.txt/.json` en la carpeta del
  proyecto.
- La limpieza del eco de la careta en A1 se hace **solo** en COLOCAR (🎯), nunca en OUT & GO.
- En modo TEST el botón OUT solo cierra la pieza.

**FilmCraft**
- Solo OUT y el troceado. Los marcadores están pendientes.

**Propuesta**
- Portar las fases en este orden, con la F8 y la instantánea.

---

## 18. 🟡 IN

**FAST PASS** (`js/workflows/flow_cut.js:31-160`)
- Busca la secuencia por los tokens `<WOTT>` + `<bloc>`.
- Recorta **solo V1 y su audio A1** hasta el cabezal y los lleva a cero (`Clips.rippleIn`,
  `6_Clips_Logic.js:34-69`).
- Mueve el Out hacia la izquierda lo mismo que se ha recortado; el In queda a 0.
- Vuelve a colocar los marcadores desplazados y pone el cabezal a 0.
- Si se recortan más de 30 s de cabecera, **avisa** pero recorta igual.

**FilmCraft** (`cut_in.rs:15-48`)
- Extrae lo que hay antes del cabezal en **todas** las pistas (subtítulos incluidos) y cierra el
  hueco, en un solo paso de deshacer.
- El aviso de 30 s es el mismo.

**Impacto**
- Si hay material en otras pistas, FAST PASS lo deja en su sitio y FilmCraft lo desplaza con V1.
  Antes de colocar los rótulos el resultado es el mismo.

**Propuesta**
- Decidir con el equipo qué comportamiento se prefiere. El de FilmCraft mantiene todo sincronizado.

---

## 19. 🟡 Botones ◀ ▶ (clip anterior y siguiente)

**FAST PASS** (`flow_cut.js:276-320`)
- Pone el cabezal en el **centro** del clip anterior o siguiente de V1:
  `(start + end) / 2`.
- Después sincroniza el deslizador.

**FilmCraft** (`verticalization.rs:396-411`)
- Selecciona el clip anterior o siguiente y pone el cabezal en su **inicio**
  (`playhead.selectedClipStart`).

**Propuesta**
- Poner el cabezal en el centro del clip, como FAST PASS. En el inicio se puede ver el último
  fotograma del clip anterior.

---

## 20. 🟡 Deslizador X (reencuadre)

**FAST PASS** (`main.js:160-227`, `applySliderLimits`)
- El valor del deslizador es la posición X en píxeles. Para 608 px, el recorrido es de
  **−351 a 959**.
- Los límites salen de `Anim.sliderLimits()` y **tienen en cuenta los recortes** del clip.
- **Doble ventana**: con un clip seleccionado en V2 o V3, el recorrido se limita a ±un margen
  alrededor de la base del PAS4.
- Modo SLIDER / KEYFRAME según el clip seleccionado (`syncKfMode`).

**FilmCraft** (`verticalization.rs::target`, líneas 129-155)
- El mismo recorrido para el caso normal (centro ± el exceso de anchura escalado).
- No tiene en cuenta los recortes ni la doble ventana.

**Propuesta**
- Incluir los recortes de Motion/Crop en los límites.
- Añadir el límite de la doble ventana cuando se porte esa función.

---

## Coincidencias (no hay que cambiar nada)

- Carpeta de trabajo `<destino_base>\<dir>\<AAAA_MM_DD>\<bloc>`.
- Nombres del proyecto `Pruebas_<WOTT>_<bloc>_<TEMA>` y de la secuencia `<WOTT>_<bloc>_<TEMA>`.
- `handles` = 20 s, `clipOutMarginSec` y `programStartHours`
  (TNV 21:00, TNM 14:30, TNC 13:50, MAT 07:55).
- FOTO:
  - la respuesta es válida con `escaleta` y `cleanFeed` y sin `missatge`;
  - se guarda como `escaleta_on_demand_<ms>.json` en la carpeta del bloque;
  - la hora de la petición sale del `mediaStart` de la última escaleta, si no de la hora de inicio
    del programa, y si no de la hora actual.
- Bin `CHY` para los rótulos.
- OUT:
  - limpia todas las pistas desde el cabezal;
  - In 0 y Out en el cabezal −1 fotograma;
  - zoom al rango y cabezal a 0;
  - troceado de V1 por cambios de plano.
- El recorrido del deslizador X en el caso normal.

---

## Orden de trabajo propuesto

1. **Perfil y rutas** (puntos 2 y 15): sin esto, lo demás no funciona con el perfil nuevo.
2. **Vídeo desde el *clean feed*** y la regla de no crear el proyecto sin escaleta (puntos 1, 3
   y 14).
3. **Tema desde la escaleta** (punto 11).
4. **WOTT**: fecha, bloque, repetidos y flotantes (puntos 7, 8 y 9), más las portadas (punto 10).
5. **FOTO de MATINS** (punto 6), después de comprobar el modelo con la API.
6. **Subtítulos**: fuente y pista (puntos 4 y 5).
7. **Botón principal y OBRIR**: estados, `.lock` y bloque de ayer (puntos 12 y 13).
8. **Detalles de OUT & GO, IN, ◀ ▶ y el deslizador** (puntos 16 a 20).
