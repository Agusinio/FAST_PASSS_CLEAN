# OPCIONS — neteja de música a A1 i execució sense finestres (echo off)

> **Estat (2026-11-02)**:
> · **Echo off: FET** — `bin/hidden.vbs` + `Utils.execHidden()` (wscript GUI, 0 finestres, ~250 ms
>   per crida) i rellotge d'arena als botons (`.btn-busy`). Falta **només la prova en viu** a Premiere.
> · **A1 (neteja de música): EN MARXA** — plantilles rebudes a `Audios/` i eines de calibratge
>   escrites i provades (`bin/cmp_audio.ps1`, `bin/calibra_a1.ps1`). Falta l'**F0** amb trams reals
>   (§1.5 bis). La via triada no és IA: és **resta adaptativa amb la plantilla** (§1.3 bis, E1).
> Catàleg: `AUDIO_IA_DEREVERB` (pregunta 1, apuntada el 27/10 i ampliada hui) i `ECHO_OFF_UI`
> (pregunta 2) a [`FEATURES.md`](../../FEATURES.md) §3.
> Petició de l'usuari (30/10/2026):
> 1. *«A1: a vegades se cuela la música d'un molinet o careta de l'ítem anterior; vull saber si
>    puc implementar un model d'IA que limite eixe so.»*
>    **Matís del mateix dia — descarta el retall**: *«La detección de silencio no es viable. No hay
>    silencio. El problema es justamente que están mezclados. Lo que hay es una reverb de un sonido
>    sintético. Te podría adjuntar los sonidos concretos para compararlo y hacer una resta
>    matemática; solo habría que ajustar el "volumen" de la resta. Claro que puede que el técnico de
>    sonido varíe el volumen.»* → §1.3-E1.
> 2. *«Es pot fer tota la feina de ffmpeg (i qualsevol cosa per Terminal/PowerShell) sense que
>    s'obriga cap finestra? Un "echo off". I si sí, un rellotge d'arena per botó perquè
>    l'usuari sàpia que s'està treballant encara que no veja res.»*

---

## 0 · Resum (les dues respostes en una taula)

| Pregunta | Resposta curta | Opció recomanada |
|---|---|---|
| **1. Música a A1** | **Sí, i probablement sense IA.** Com que el so que es cola és una **careta sintètica coneguda**, la via bona és **restar-la**: el `ffmpeg` del repo ja porta `anlms`, un filtre **adaptatiu amb senyal de referència** que estima el guany (el «volum de la resta») i la reverb del tècnic i lleva només allò que correlaciona amb la plantilla. Mesurat hui en proves sintètiques: **10–17 dB de reducció de la careta amb la veu intacta (0,0–0,2 dB)**. Retall i silenci **descartats** (no hi ha silenci: estan mesclats). | **E1**: `anlms` amb la plantilla (0 dependències, 0 descàrregues) → **E2** només si no basta: separador IA lleuger (MDX-Net ONNX 20–120 MB) |
| **2. Finestres fora** | **Sí, i ja està mig fet al repo**: `IO.executeShell` obri una CMD per cada crida (`.bat` + `File.execute()`), però `utils.js` ja llança PowerShell **ocult** amb `cep.process.createProcess(... -WindowStyle Hidden ...)` per a l'esborrat de carpetes (#180). | **O-B1**: helper `Utils.execHidden()` amb `cep.process.createProcess` (no toca `jsx/`) + **O-C**: CSS `.btn-busy` (ja hi ha `markBtnBusy`, però el CSS no existix) i comptador de tasques |

---

## 1 · Problema A — música de l'ítem anterior al primer clip d'A1

### 1.1 · D'on ix el so (mecànica del projecte)

- El muntatge importa el **cleanFeed** a V1 amb `keepAudio`: el so del clip acaba a **A1**.
- Quan un ítem anterior s'ha tancat amb `OUT & GO` (`flow_cut.js` → `ClipsLogic.rippleAllOut(...,
  videoTracks, audioTracks, false)`), el que queda a A1 és el **so del mateix cleanFeed** del tram
  anterior: si eixe tram acaba amb **molinet / careta / sintonía**, eixe so és el que sona damunt de
  l'inici del bloc nou (o just abans).
- És a dir: **no és un fitxer alié** — és el **mateix** àudio continu del cleanFeed, tallat en un
  punt que deixa la cua musical dins del bloc.

**Correcció del 30/10 (dada real de l'usuari)**: eixa lectura era massa optimista. En el material que
arriba al primer clip d'A1 **no hi ha cap forat**: la **veu i la careta estan mesclades** (el tècnic
de so barreja el so sintètic amb la locució i, a més, **pot moure el volum**). Conseqüències:
- **Retallar / silenciar queda descartat** com a solució general (O-A1, O-A2, O-A4 i O-A5 cauen com
  a via principal: no hi ha silenci on tallar). Es queden com a registre i com a diagnòstic.
- La via bona és **llevar la careta restant-la**: hi ha una **plantilla coneguda** (l'usuari té els
  sons concrets) i el `ffmpeg` del repo **ja porta** el filtre adaptatiu que ho fa → **§1.3-E1**.

### 1.2 · Què hi ha disponible hui (mesurat al codi)

| Peça | Estat | Fitxer |
|---|---|---|
| Llegir clips d'àudio (`start`, `end`, `inPoint`, `outPoint`) | ✅ existix | `Clips.get(track, idx, 'audio')` · `Tracks.clips(idx,'audio')` |
| Retallar / re-situar un clip (també d'àudio) | ✅ existix | `Clips.trim`, `Clips.retrim`, `Clips.inPoint`, `Clips.start`, `Clips.end` (`jsx/modules/6_Clips.jsx`) |
| Llevar un clip o el seu àudio vinculat | ✅ existix | `Clips.remove`, `Clips.removeAt`, `Clips.removeLinkedAudio` |
| Propietats del clip (p. ex. `Volume`) | ✅ existix (valor estàtic) | `Clips.getProp` / `Clips.setProp` |
| Mutar una **pista** sencera | ✅ existix | `Tracks.mute(idx, true, 'audio')` |
| Keyframes d'àudio (fade) | ❌ no hi ha àtom | només `jsx/` nou (⛔ permís) |
| Analitzar so (silenci, RMS, veu) | ✅ `ffmpeg`/`ffprobe` propis | `bin\ffmpeg\bin\ffmpeg.exe` (211 MB), `ffprobe.exe` (211 MB) |
| Reimportar un WAV net | ✅ existix | `Project.importFiles` / `IO.importFiles` |

> ⚠️ Tot el que **escriu** a la timeline passa per `jsx/` (regla 2 de `.clinerules`). Les opcions
> marcades **«0 jsx»** es poden fer només amb `js/**`.

### 1.3 · Opcions

#### O-A0 · No automatitzar (marcar i decidir a mà) — cost 0
Deixar el comportament actual i que l'operador retoque. Avantatge: risc zero. Inconvenient: és
exactament el que es vol estalviar (una decisió per bloc, a mà, amb pressa).

#### O-A1 · Retall determinista del clip d'A1 fins a l'inici del bloc (0 jsx: `Clips.trim` ja existix)
> ❌ **Descartada com a via el 30/10**: **no hi ha forat** on tallar (veu i careta mesclades). Només
> valdria en un cas concret: que el tall caiguera en un forat real, cosa que l'usuari descarta.
Moure el `inPoint` del primer clip d'A1 (o el seu `start`) fins al **primer frame del bloc**
(el mateix instant que el marcador/IN de V1), o fins al **primer instant amb veu** calculat per
O-A4/O-A5.
- **Precís** (frame exacte), **instantani** (< 1 s, cap procés extern), **reversible**
  (`Ctrl+Z` / `Clips.retrim` amb el valor original), **sense IA**.
- Risc: si dins del tram tallat **ja hi ha veu** (el locutor parla damunt de la careta), es talla veu.
  → mitigar amb O-A4/O-A5 (tallar al forat, no al marcador) i amb un **màxim de retall** (p. ex.
  ≤ 3 s; si cal més, avisar i no tocar).

#### O-A2 · Silenciar el clip (o llevar-lo) — 0 jsx
> ⚠️ **Parcialment descartada**: silenciar mata **també la veu**. Només té sentit **després** d'E1,
> sobre el tram del residu on ja no hi ha veu (criteri 3 de §1.6).
Si eixe àudio no aporta res (típic: el bloc porta locució pròpia o veu d'una altra font),
`Clips.setProp` `Volume → −96 dB` o `Clips.removeAt`. Més barroer que O-A1: mata **tot** el clip,
no només la cua.

#### O-A3 · Fundit curt d'entrada (4–8 frames) — ⛔ requereix `jsx/`
Un `afade` evita el «clic» del tall sec, però a Premiere és un **keyframe de Volume**, i no hi ha
àtom. Alternativa **0 jsx**: renderitzar el tram amb `ffmpeg -af afade` i reimportar-lo.

#### O-A4 · **Detecció del forat amb ffmpeg** (`silencedetect` / `astats`) — 0 jsx
> ❌ **Descartada com a via el 30/10**: en el material real **no hi ha silenci** (veu i careta
> mesclades). Es queda com a eina de diagnòstic i com a registre.
1. Exportar els primers **N segons** del primer clip d'A1 a WAV mono 16 kHz:
   `ffmpeg -ss <start> -t 6 -vn -ac 1 -ar 16000 -y out.wav`.
2. `ffmpeg -i out.wav -af silencedetect=n=-38dB:d=0.3 -f null -` → intervals de silenci pel stderr.
3. Triar el **primer final de silenci** > 0,15 s que vaja seguit d'energia (la veu) i tallar-hi (O-A1).
- Cost: ~0,3–1 s per bloc (2 arrencades d'ffmpeg sobre 6 s d'àudio).
- Límit: si la careta i la veu **no tenen cap forat** (música enganxada a la veu), no detecta res
  → cal O-A5 o O-A6.

#### O-A5 · **Detecció de VEU (VAD)** — 0 jsx, +1 model petit
> ❌ **Descartada com a via el 30/10**: diu **on** hi ha veu, però **no lleva** la música que va
> damunt d'eixa veu; no resol el cas.
`Silero VAD` (ONNX, ~2 MB, CPU quasi instantani) o `WebRTC VAD` (`py-webrtcvad`) → primer instant de
parla amb precisió de 30 ms; tallar **just abans** (menys 2–3 frames de marge).
- Millora clau sobre O-A4: distingeix **música** de **parla** encara que no hi haja silenci absolut.
- Requisits: Python + `onnxruntime` (~50 MB) o un binari embolcallat amb el model; es pot cridar des
  de PowerShell ocult (O-B1) i llegir un JSON de sortida.

#### O-A6 · **Separació de fonts amb IA** (traure música, deixar veu) — l'enfocament «clàssic»
| Motor | Model | Mida | Depèn de | Temps (CPU) | Qualitat |
|---|---|---|---|---|---|
| **Demucs v4** | `htdemucs` (2 stems: vocals / no_vocals) | ~300 MB de pesos + torch ~2,5 GB | Python 3.10 + `torch` (CPU o CUDA) | ≈ **1–3× el temps real** (1 min → 1–3 min) | **La millor** de les opcions lliures |
| **MDX-Net / UVR5** | `.onnx` (UVR-MDX-NET Inst HQ 2) | 50–200 MB | `audio-separator` (pip) o UVR CLI | ≈ 0,3–1× el temps real | Molt bona, un poc pitjor en veu |
| **Spleeter** | 2 stems | ~100 MB | TensorFlow 2 | ≈ 0,2× el temps real | La pitjor; projecte poc mantingut |

> ⚠️ **En este equip no hi ha Python** (`py` no existix; `python` és el *stub* de la Microsoft Store):
> qualsevol via amb `pip`/`torch`/`onnxruntime` obliga a **instal·lar Python** o a usar un **binari
> precompilat** (sherpa-onnx `OfflineSourceSeparation`, amb models Spleeter/UVR; `demucs.cpp`;
> Free-Music-Demixer).

**Realitat per al cas plantejat** (cua de careta de 0,5–3 s):
- Amb 2 stems, el resultat és `vocals.wav` → **es perd** la música (bé) però també **el to/ambient**
  i sovint apareixen **artefactes** («burbolles» metàl·liques) si la música és densa.
- Si al tram hi ha **veu + música alhora**, la IA pot **menjar-se consonants** o deixar restes de
  música: sempre cal **A/B** (escoltar) → no pot ser 100 % automàtic ni silenciós.
- Per a un informatiu diari, **afegeix una dependència gran** (Python + 2,5 GB) i un punt de fallada
  nou al pipeline.

**Veredicte**: tècnicament viable, però **sobredimensionat** per a un problema que es resol millor
restant la plantilla (E1). Recomanat **només** com a mode opcional «neteja forta» per a trams on el
solape és llarg i la música tapa la veu (i sempre amb avís a l'usuari i A/B).

#### O-A7 · Restauració / denoise (no lleva música)
`RNNoise` / `DeepFilterNet` (ONNX, lleugers, CPU), `Adobe Enhance Speech` (núvol), `iZotope RX`
(de pagament, **sense CLI pública**), `Auphonic` (núvol). Serveixen per a **soroll** (molinet, vent,
zumbit), **no** per a música: un acord de careta no és «renou». Útil com a complement, no com a solució.

#### O-A8 · Natiu de Premiere
`Essential Sound` → *Diàleg* (`DeNoise`, `DeHum`, `Reduce Reverb`) o *Música* (`Remix`); o esborrar a
mà (`.` / Supr). Automatitzar-ho exigeix `applyEffect` per `jsx/` (⛔) o un preset de pista aplicat a
mà. **No** resol el problema de forma desatesa avui.

#### O-A9 · Núvol (lalal.ai, AudioShake, Adobe Podcast API)
Qualitat alta i zero manteniment local, però: **puja àudio del canal a Internet** (confidencialitat),
cost per minut, latència i dependència de xarxa. **Descartat** per a este flux.

### 1.3 bis · **E1 · Resta amb referència coneguda (plantilla)** ⭐ la via que demanava l'usuari

> **Resposta a la consulta** (*«te podría adjuntar los sonidos concretos… hacer una resta
> matemática… ajustar el volumen de la resta»*): **sí, es pot, i el repo ja té l'eina instal·lada**.

**Model**: `mescla(n) = veu(n) + h(n) * plantilla(n)`.
`h` és tot el que el tècnic ha fet sobre eixa careta: **volum**, **reverb** de la sala, **EQ** i un
**retard**. Si s'estima `h`, el **residu** `mescla − h*plantilla` és **la veu**.

**Per què la resta ha de ser adaptativa** (i no un `volume=-6dB` fix): el fader canvia cada dia i fins
i tot dins del mateix tall, i la reverb no és un simple factor. Un filtre **NLMS** actualitza `h`
**mostra a mostra**: «ajustar el volum de la resta» **ho fa el propi filtre** (en règim estacionari,
el coeficient principal **és** eixe volum) i la resta de coeficients absorbixen **reverb, EQ i retard**.

**Ja està instal·lat** — `bin\ffmpeg\bin\ffmpeg.exe` (git 2026-01-19) porta el filtre:

| Filtre | Firma | Què fa |
|---|---|---|
| **`anlms`** | `AA->A` | NLMS adaptatiu: **2 entrades** (`input` = **plantilla**, `desired` = **mescla**) i **1 eixida**. `out_mode=o` → `desired − w*input` = **residu (la veu)**; `out_mode=e` → `w*input` = **la careta estimada** (per a A/B); `out_mode=n` → `input − output` |
| `anlmf` | `AA->A` | Igual, amb error de 4t ordre (més robust amb pics) |

Paràmetres (`ffmpeg -h filter=anlms`): `order` **1–32767** taps (per defecte 256) · `mu` 0–2
(adaptació: 0,005 lent i estable … 0,2 ràpid si el tècnic mou el fader) · `eps` 0–1 (regularització;
**deixar-lo baix**, 1e-6…1e-3: amb `eps=1` el pas s'ofega i no adapta) · `leakage` 0–1 (0,0005 per a
que `h` no es desboque en trams sense careta) · `precision` · `enable` (per a aplicar-ho només al
tram inicial). A 48 kHz, `order=32767` = **0,68 s** de memòria → cobrix **reverb + retard curt** sense
alinear a mà.

**Recepta (1 comanda, 0 `jsx`, 0 dependències)**:
```
ffmpeg -i a1_mescla.wav -i careta.wav -filter_complex "[1][0]anlms=order=4096:mu=0.02:eps=1e-4:out_mode=o" -y a1_net.wav
```
`[1]` careta → `input`; `[0]` mescla → `desired`; eixida = residu (la veu).

**Mesurat hui amb el ffmpeg del repo** (proves sintètiques, **no** amb el teu material):

| Prova | Paràmetres | Abans | Després | Veu |
|---|---|---|---|---|
| To 440 Hz («careta») mesclat amb to 300 Hz («veu»), 0,5/0,8 | `order=256…1024`, `mu=0.001…0.05` | 440 = **−26,9 dB** | **−40,0 … −43,8 dB** (**13–17 dB** menys) | 300 Hz: −23,0 → **−23,0 dB** (intacte) |
| Soroll rosa 2–20 kHz («careta») + veu < 1 kHz | `order=512`, `mu=0.05` | 3 kHz = **−44,9 dB** | **−55,3 dB** (**10,4 dB** menys) | 300 Hz: −40,0 → **−39,9 dB** (intacte) |

→ **La part correlacionada amb la plantilla baixa 10–17 dB i la veu no es toca** (0,0–0,2 dB). Amb
material real (so sintètic **determinista**, no soroll) la cancel·lació sol ser millor, però **només
ho diu una prova amb els teus àudios**.

**Límits honestos**
1. **Compressió/limitador** del màster → la relació deixa de ser lineal → queda **residu** (un «rest»
   de careta). Mitigació: `mu` més gran + porta (`agate`/`afftdn`) sobre el tram ja sense veu.
2. **Pitch o velocitat canviats** pel tècnic → la plantilla no encaixa. Mitigació: reixeta amb
   `rubberband`/`atempo` (±2 %, ±5 %) i triar la que més baixa (N passades, més lent).
3. **Retard > 0,68 s** entre plantilla i mescla → `adelay`/`atrim` o correlació prèvia.
4. **Tram sense veu**: el residu pot quedar audible → ahí sí es pot **silenciar** (ara el «silenci» el
   crea la resta; abans no existia).

**Extra gratis — A/B**: `out_mode=e` dona **la careta estimada** (`w*plantilla`). Escoltar eixe fitxer
al costat del resultat és la manera més ràpida de vore si la resta és bona o si s'ha menjat veu.

**Què cal de l'usuari per a calibrar** (1 sessió, fora del panell):
1. Les **plantilles netes** (WAV o MP3, sense veu): molinet, careta, sintonía… una per cada so.
2. **2–3 trams d'A1** on es cola (5–10 s de WAV exportat del projecte).
3. Confirmar si el tècnic **canvia el pitch o la velocitat** (no només el volum).
4. Confirmar si **sempre són els mateixos fitxers** o si el so sintètic es regenera cada dia.

Amb eixos 4 punts es mesura la cancel·lació real (dB per banda, amb i sense veu) **abans** d'escriure
una línia al panell. Script de calibratge `bin\calibra_a1.ps1` (fora de `js/`): per cada plantilla ×
cada mostra prova `order` `{1024, 4096, 16384}` × `mu` `{0.005, 0.02, 0.1}` i trau una taula de dB
(quant baixa la banda de la careta / quant es mou la de la veu).

### 1.3 ter · Les plantilles REALS (`Audios/`, rebudes 2026-11-02) ⭐

L'usuari ha deixat **7 WAV** a la carpeta `Audios/` del projecte. Tots són **48 kHz, 16 bits,
estèreo, PCM** (`pcm_s16le`), sense canal alfa (el nom «sense_alpha» ve del generador).

| Fitxer | Durada | Bytes |
|---|---|---|
| `3CatInfo_TN_Careta.WAV` | 17,480 s | 3.356.672 |
| `3CatInfo_TNC_careta_sense_alpha.WAV` | 17,600 s | 3.379.712 |
| `3CatInfo_TN_molinet_01.WAV` | 11,400 s | 2.189.312 |
| `3CatInfo_TN_molinet_02.WAV` | 11,000 s | 2.112.512 |
| `3CatInfo_TNC_molinet_1.WAV` | 11,760 s | 2.258.432 |
| `3CatInfo_TN_anada_publi.WAV` | 11,680 s | 2.243.072 |
| `3CatInfo_TN_tornada_publi_.WAV` | 11,760 s | 2.258.432 |

**Cap duplicat EXACTE**: el MD5 del fitxer *i* el MD5 de l'àudio decodificat són distints en els
7. Però l'usuari sospitava el cas difícil —«el mateix so amb un altre nom»— i eixe sí que hi és:
mesurat amb [`bin/cmp_audio.ps1`](../../bin/cmp_audio.ps1) (embolcall RMS de 20 ms, mono 8 kHz,
correlació de Pearson amb cerca de desplaçament ±3 s):

| Parell | r | lag | Lectura |
|---|---|---|---|
| `anada_publi` ↔ `tornada_publi_` | **0,993** | 0 ms | **el mateix so** (dos talls del mateix màster: 11,68 vs 11,76 s) |
| `molinet_01` ↔ `molinet_02` | **0,931** | +380 ms | **el mateix molinet** (distint tall/nivell; 11,40 vs 11,00 s) |
| `molinet_01` ↔ `TNC molinet_1` | 0,851 | +220 ms | mateix molinet, variant TNC (0,36 s més llarg) |
| `molinet_02` ↔ `TNC molinet_1` | 0,865 | −260 ms | igual que l'anterior |
| `TN Careta` ↔ `TNC careta_sense_alpha` | 0,823 | −900 ms | **la mateixa careta**; la de TNC és 0,12 s més llarga |
| careta ↔ molinet/publi (8 parells) | 0,14–0,48 | — | **sons diferents** |

→ **7 fitxers = 2 sons reals**: **careta** (17,5 s) i **molinet/publi** (11–11,8 s). El «publi»
d'anada i el de tornada són el mateix màster, i els tres molinets també. **Decisió pràctica**: per
a calibrar (F0) n'hi ha prou amb **2 plantilles**; per a la producció convé conservar les 7 perquè
cada dia pot canviar el tall que sona. L'última paraula és un **A/B d'orella** (el número orienta).

**Ús doble de `cmp_audio.ps1`**: a més de detectar duplicats, és la manera de **triar la plantilla
automàticament**: es compara el tram d'A1 exportat contra cada WAV de `Audios/` i la plantilla amb
`r` més alt (i el seu `lag`) és la que es passa a `anlms`. Si el millor `r` baixa de ~0,7, eixe dia
no és cap dels sons coneguts (o el tècnic n'ha canviat el to/la velocitat) → avisar i no tocar res.

### 1.3 quater · `bin/calibra_a1.ps1` — el calibratge F0, ja escrit i provat

Eina de laboratori (fora de `js/`, no toca el panell). Fa la reixeta `order × mu` de la §1.5,
mesura **per bandes d'octava** i trau la taula de dB:

```
bin\calibra_a1.ps1 -Mix "C:\...\A1.wav" -Template "Audios\3CatInfo_TN_Careta.WAV"
bin\calibra_a1.ps1 -Mix t\mescla.wav -Template t\plantilla.wav -Voice t\veu.wav -Orders '1024,4096' -Mus '0.005,0.02,0.1'
```

- **Per què per bandes i no RMS global**: amb la veu 5–15 dB per damunt, una cancel·lació perfecta
  de la careta és invisible en el RMS global. El perfil d'octaves (63…8000 Hz) separa les bandes on
  **manaria la música** (plantilla a menys de `-MusicMargin` dB de la mescla → hi ha de **baixar**) de
  les bandes on **manaria la veu** (hi ha de **quedar igual**). Columnes `MusicDb` i `VoiceDb`.
- Sortida: `res_*.wav` (residu = veu neta), `est_*.wav` (**música estimada**, per a l'A/B) i
  `calibracio.csv` en `%TEMP%\fp_calibra_a1_<data>`.
- **Provat** amb material sintètic (to 440 Hz de «plantilla» + to 300 Hz de «veu»): `mu=0.005` →
  música −2,8 dB i veu −0,6 dB (conservador); `mu=0.02` → −3,7 / −1,4; `mu=0.1` → **−10,6 / −8,4**
  (agressiu: s'emporta la veu). Confirma el que deia la §1.3-bis: **`mu` massa alt menja veu**.
- `out_mode` comprovat empíricament amb el ffmpeg del repo: **`o` = residu** (el que volem) i
  **`e` = música estimada** (A/B). `eps` per defecte val **1** al filtre (no adapta): sempre cal
  passar-lo baix (`1e-4`). `leakage=0.0005` evita que `h` es desboque en trams sense música.

#### Mesures amb àudio REAL (2026-11-03) · primera reixeta sobre `Audios/`

El parell més net de les plantilles reals (`3CatInfo_TN_anada_publi.WAV` ≡
`3CatInfo_TN_tornada_publi_.WAV`, **r = 0,993**, lag 0) fa de cas fàcil: les dos
porten la MATEIXA música, així que el que es mesura és **quanta música de la mescla
absorbix `anlms`**. Eixe tram no té veu (les 8 bandes d'octava ixqueren totes
classificades com a MÚSICA i per això `VoiceDb` = NaN).

| `mu` (`order`=1024) | 0,005 | 0,02 | 0,05 | 0,1 | 0,2 | 0,4 | 0,75 |
|---|---|---|---|---|---|---|---|
| música (dB) | −1,88 | −3,85 | −5,88 | −7,95 | −10,59 | −13,85 | **−17,36** |
| residu (dBFS) | −25,1 | −27,6 | −29,8 | −31,8 | −34,1 | −36,8 | −39,3 |

- **`order` no decidix**: 1024, 4096 i 16384 donen el mateix dB (±0,3) i costen
  **0,3 s / 1,1 s / 6,3 s** per a un clip d'11,8 s → **`order=1024`** (20× més ràpid
  que 16384 per a res en este material).
- **`mu` és l'única palanca** i la corba és monòtona fins al màxim del filtre (`mu`
  va de 0 a 1). `eps=1e-6` + `leakage=1e-5` només afigen **+0,5 dB** (−17,86 a
  `mu=0,75`): no cal tocar-los.
- **Falta la dada que decidix**: eixe parell NO té veu. Per a triar `mu` de
  producció cal **un export real d'A1** (veu + molinet/careta mesclats). La prova
  sintètica de dalt diu que `mu` alt es menja la veu (−8,4 dB a `mu=0,1`) i eixa
  mesura diu que `mu` baix deixa la música dins (−8 dB a `mu=0,1`): el punt de
  treball és eixe marge. **Criteri proposat per a F1**: `order=1024`, `mu=0,05`
  conservador (o `0,1` si l'A/B de l'operador ho aguanta), `eps=1e-4`,
  `leakage=0,0005`.
- **Defecte corregit a l'eina (03/11)**: `-Orders '1024,4096'` s'executava com a
  **un sol** `order` (la coma es prenia per decimal i `[int]'1024,4096'` arredonia a
  1024 amb la cultura ca-ES). Ara la coma només és decimal en valors curts
  (`0,005`, `12,5`) i les llistes d'enters es trenquen com cal.

### 1.3 quinquies · Mapping **escaleta → clip** i prova amb el clip REAL (2026-11-03) ⭐

#### a) La fórmula que cal usar (surt de l'escaleta i del `ref` del projecte)

El `TNV_V<n>.fastpass.json` ja guarda tot el que cal; no fa falta cap TC «d'original» a mà:

| Camp | Exemple (TNV V1 · 2026-11-02) | Què és |
|---|---|---|
| `ref.extractedWorldSecMediaStart` | **75696,68** | segons de món (00:00 = 00:00 del dia) on comença el **clip exportat** |
| `ref.blockInSec` | **75657** | inici de **bloc** segons l'escaleta (ítem de vídeo V1) |
| `ref.mp4ExpandedInPoint` = `tlBlockInPointSec` | **20,32** | on cau eixe inici **dins del clip** |
| `escaletaItems[].horaEntradaPrevista` | `21:01:50` (CARETA) · `21:01:57` (Intro) | hora **on air** de cada ítem |

Connexió (verificada amb el JSON del 02/11): `mp4ExpandedInPoint` **no** és el
`blockInSec` — és l'inici del **primer ítem que realment entra** (ací la *Intro*),
que va **després** de la careta:

```
world(ítem) = horaOnAir → segons de món      (21:01:57 = 75600+60+57 = 75717)
clip(ítem)  = world(ítem) − extractedWorldSecMediaStart   (75717 − 75696,68 = 20,32 ✓)
```

| Ítem de l'escaleta | On air | world (s) | **clip (s)** | Durada |
|---|---|---|---|---|
| **CARETA TNV** | 21:01:50 → 21:02:20 | 75710 → 75740 | **13,32 → 43,32** | 30,0 s |
| **Intro** («01i») | 21:01:57 → 21:02:20 | 75717 → 75740 | **20,32 → 43,32** | 23,0 s (= marcador 23,080) |
| SÁNCHEZ… («01») | 21:02:20 → 21:04:22 | 75740 → 75862 | 43,32 → 165,32 | 122 s |

**Conseqüència de disseny**: la careta **no és un ítem anterior** al clip d'A1 (la §1.5-bis
punt 1 ho suposava): és **damunt** de la intro. L'àudio del primer clip d'A1 (la intro) porta
la careta des del **sample 0** i el que cal llevar és eixa música, no un tros de cua.

Corol·lari útil: **els 7 s previs a la intro** (clip 13,32 → 20,32) són **careta neta, sense
veu** — eixe tram és el candidat natural per a *localitzar* el so (correlació) i, si fa falta,
per a aprendre'n el guany: eixa dada no existia en el diagnòstic del 30/10.

#### b) Prova amb les 7 plantilles contra eixa finestra (RESULTAT: cap encaixa)

`bin\cmp_audio.ps1`-style (embolcall RMS 20 ms, mono 8 kHz, banda 40–2000 Hz, cerca de
desplaçament completa dins la finestra):

| Finestra del clip | Plantilla que més s'hi acosta | r màxim |
|---|---|---|
| 13,32 s + 30,08 s (careta sencera) | `TNC_careta_sense_alpha` a +12,42 s | **0,258** |
| 13,32 s + 17,48 s (= durada de la careta WAV) | `TN_tornada_publi_` / `TN_anada_publi` a +1,60 s (**les dos caretes WAV no hi caben** i se salten) | **0,277** |
| 20,32 s + 23,08 s (intro) | `TN_molinet_02` a +0,58 s | **0,248** |
| 19,32 s + 24,08 s | `TNC_careta_sense_alpha` a +6,42 s | **0,247** |
| clip sencer (245 s) | `TN_anada_publi` a 1,44 s · `TN_molinet_02` a 107,7 s | 0,62 / 0,42 |

Referència del que és una còpia real: **0,82–0,99** (§1.3-ter). Amb `r ≤ 0,27` la conclusió és
clara: **la careta que sona el 02/11 a TNV V1 no és cap dels 7 WAV**. A més, la careta de
l'escaleta dura **30 s** i els dos WAV de careta fan **17,5 s**: no és el mateix tall.

> ⚠️ Estos `r` són d'un estimador **no** normalitzat per finestra. El resultat es va repetir
> amb Pearson pur a **§1.3-sexies** (control d'auto-correlació = 1,000): seguix sense encaixar
> res, i el fitxer `CARETA_20` que va arribar el 03/11 és el **mateix so** que `TN_Careta`.

I no és un problema d'alineament: la reixeta `order` (1024/4096/16384) ja es va provar amb
àudio real i, amb la plantilla equivocada, `anlms` **no lleva res** (mesurat amb
`bin\calibra_a1.ps1` sobre la intro: música −0,5…−0,7 dB, és a dir pèrdua de nivell, no
cancel·lació; la cancel·lació de veritat dona −17 dB, §1.3-quater).

#### c) Què falta (i què fa el codi mentrestant)

Segons el **criteri d'acceptació 5** (§1.6): *«sense plantilla del so que es cola → no es toca
res i el log ho diu»*. És exactament el cas del 02/11.

Falta **el màster del tall que sona eixe dia**: un WAV de la *careta* de 30 s (o el tall exacte
que envie el tècnic). Dos camins, per ordre de cost:

1. **El WAV** (0 codi): deixar-lo a `Audios/` → la selecció automàtica per correlació (§1.5-bis
   punt 3, llindar `r ≥ 0,7`) el triarà i `anlms` farà la resta.
2. **Treure'l del propi clean feed** (si mai no arriba): la careta sona **neta** en algun punt
   del dia (ací, clip 13,32 → 20,32; en general, abans que arranque la veu de la intro). Amb
   eixe tros es pot **localitzar** el so i calcular el guany/retard (`r` alt contra si mateix),
   però per a restar 23 s de música cal la referència **sencera** o una finestra prou curta:
   viables només els primers segons (F2/F4), no la intro completa.

### 1.3 sexies · Mètode de correlació **corregit** i fitxer nou del 03/11 (2026-11-03)

#### a) L'estimador anterior no era Pearson pur

Els números de §1.3-quinquies eixien de z-scorar la **mescla sencera** i la plantilla per
separat, i després fer el producte escalar. Això **no** és el coeficient de Pearson de la
finestra: la mitjana/desviació de la mescla han de ser les **de cada finestra** (si no, el
valor ix esbiaixat i no servix com a llindar absolut).

Corregit amb **sumes prefixades** de la mescla (mitjana i variància de cada finestra en O(1)):

```
r(lag) = [ Σ_i zt[i] · zm[lag+i] / nt ] / sd( zm[lag .. lag+nt) )
```

Controls que validen el mètode (imprescindibles abans de creure's un resultat negatiu):

| Control | r esperat | r mesurat |
|---|---|---|
| Els 7 s de careta neta del clip (13,32→20,32) **contra si mateix** dins del clip sencer | 1,000 | **1,000** (al seu lloc exacte, 13,32 s) |
| `molinet_01` (mescla) vs `molinet_02` (plantilla) | ~0,93 | **0,927** a +0,38 s |

#### b) Resultat definitiu amb Pearson pur — cap plantilla encaixa

| Finestra del clip | Millor plantilla | r | Altres pics |
|---|---|---|---|
| **clip sencer (245 s)** | `TN_anada_publi` a 1,44 s | **0,452** | `TN_tornada_publi_` 0,450 · `TN_molinet_01` 0,418 · `TN_molinet_02` 0,404 · **`TN_Careta` i `CARETA_20` 0,403** (tots dos al mateix t=10,74 s) |
| **13,32 s + 30,08 s** (careta) | `TN_tornada_publi_` a 1,60 s | **0,285** | `TN_anada_publi` 0,284 · `TN_molinet_02` 0,262 · `TNC_careta_sense_alpha` 0,248 · **`TN_Careta` i `CARETA_20` 0,200** (al mateix t=12,24 s) |
| **20,32 s + 23,08 s** (intro) | — | **≤ 0,25** | — |

Una còpia real dona **0,82–1,00**. Amb **0,20–0,45** la conclusió no admet discussió: **la
música que sona el 02/11 no és cap dels WAV de `Audios/`**.

#### c) `Audios/3CATINFO_CARETA_20.WAV` (arribat el 03/11) **no és el màster que falta**

| Prova | Resultat | Lectura |
|---|---|---|
| `bin\cmp_audio.ps1` `CARETA_20` vs `TN_Careta` | **Corr = 1,000 · Lag = 0 ms · Same = True** | **és el mateix so** (MD5 distint: re-exportat, no duplicat binari) |
| Pearson contra el clip sencer / la finestra | 0,403 / 0,200 — **idèntic a `TN_Careta`** i al mateix desplaçament | no aporta informació nova |
| Estirat amb `atempo` 0,5 / 0,583 / 0,667 / 0,75 / 1,25 / 1,5 / 2,0 (per si el tècnic el va passar de velocitat: 30 s d'escaleta vs 17,5 s de WAV) | r màxim **0,262** (x1,25) | no és un problema de velocitat |
| Els 7 s de careta neta com a plantilla de la intro (hipòtesi «la música és un bucle») | **0,239** | la música **evoluciona**: el tros net no servix per a restar la resta del tall |

#### d) Conseqüència operativa

Es complix el **criteri d'acceptació 5** (§1.6): *«sense plantilla del so que es cola → no es
toca res i el log ho diu»*. El pas de Diana ha de fer **no-op + log** (`r < 0,7`) amb este
material. Per a vore una cancel·lació de veritat fa falta **el màster del 02/11** (o el tall
exacte de 30 s); el que hi ha a `Audios/` és una altra careta.

#### e) Descartat també: freqüència de mostreig, «cinta» i drift (2026-11-03)

Pregunta de l'usuari: *«¿cabe la posibilidad de que el clip mp4 tenga un sampleado diferente del wav?»*.
Provat, i descartat amb números:

| Hipòtesi | Com s'ha provat | Resultat |
|---|---|---|
| Mostreig distint clip/WAV → decodificació esbiaixada | `ffprobe`: clip = **AAC 48 kHz estèreo**; **tots** els WAV = **PCM `s16le` 48 kHz estèreo** (`CARETA_20` inclòs). Cada flux es decodifica a la seua freqüència i després es re-mostreja a 8 kHz per a l'embolcall | cap desajust: la re-mostreja és transparent |
| Canvi de rellotge «de cinta» (to **i** velocitat alhora, com 44,1 k tocat a 48 k) | `asetrate = sr·k` amb **k = 0,30 … 1,30** (inclou 0,9187 = 44,1→48 i 1,0884 = 48→44,1), Pearson pur contra la finestra de careta | **r màxim = 0,267** (k = 1,28) |
| El mateix amb la plantilla de molinet contra la intro | `molinet_01`, k = 0,85 … 1,15 | **r màxim = 0,269** |
| Drift de rellotge (dos clocks que se separen al llarg de 30 s) | correlació per **fragments de 2,5 s** (immunes al drift) | ❌ mètrica **no vàlida**: el control **negatiu** (`molinet_01` vs `anada_publi`) dona **0,93–0,95**, com el positiu (0,93–0,94) → una finestra de 2,5 s no discrimina res. Es descarta com a prova; la mesura amb la plantilla sencera (17,5 s) sí que nota el drift i dona 0,200 |
| To distint amb el mateix tempo (transposició) | centroide espectral mitjà (`aspectralstats`) | ❌ tampoc discrimina: la família va de **1.639 Hz** (`TN_Careta`) a **3.370 Hz** (`molinet_02`) entre sons que són idèntics. La música neta del clip dona **2.305 Hz**, dins del rang |

Conclusió: **no és mostreig, ni velocitat, ni alineament, ni drift: és una altra gravació.**

#### f) Anàlisi de **freqüència** (to): la desviació que demanava l'usuari, mesurada (2026-11-03)

Pregunta de l'usuari: *«fes una anàlisi de freqüència dels dos, compara les notes; si hi ha una
desviació de freqüència hi ha una desviació en algun lloc (reproducció o gravació)»*.

Eina: **`bin/analitza_to.ps1`** (nova). FFT real 4096 punts a 8 kHz mono (`highpass 70` +
`lowpass 3500`), finestra Hann, **12 finestres de 0,512 s** repartides pel tram; espectre mitjà;
pics amb **interpolació parabòlica**; banda de pics 60–2.000 Hz. D'eixos pics se'n trau: **afinació**
(mitjana circular de `1200·log2(f/440) mod 100`), **croma** (12 classes de to) i el **factor `k`**
(0,90–1,10) que millor alinea els pics dels dos senyals (tolerància 0,4%).

| Parell comparat (finestres de 7 s) | tipus | `k` | pics (de 12) | croma | tempo A / B |
|---|---|---|---|---|---|
| `TN_Careta` vs `CARETA_20` | **control positiu: còpia exacta** | 0,998 | **12** | **1,000** | 81,08 / 81,08 |
| `molinet_01` vs `molinet_02` | positiu (desplaçat 0,38 s) | 0,998 | **4** | 0,964 | 120,00 / 81,08 |
| `molinet_01` vs `anada_publi` | **negatiu: sons distints** | 1,000 | 5 | 0,968 | 120,00 / 81,08 |
| `molinet_01` vs `CARETA_20` | negatiu | 0,994 | 5 | 0,923 | 120,00 / 81,08 |
| **clip 13,32 s vs `CARETA_20` (0–7 s)** | **el cas que busquem** | **0,998** | 6 | 0,995 | 157,89 (2n 81,08) / 81,08 |

Pics del clip davant dels de `CARETA_20` (Hz): **97,6 / 97,8** · 292,9 / 292,7 · 390,9 / 390,8 ·
783,3 / 780,1 · 880,3 / 879,3 · 146,4 / 145,8 → tots són harmònics (×1, ×3, ×4, ×8, ×9) d'una
fonamental a **≈97,7 Hz**, la **mateixa** als dos. Afinació del clip **−1,3 cents** contra **−5,3**
de `CARETA_20` (repetint la mesura ix −1,9 / −5,4: el mètode té **±1 cent** de soroll). La música
del clip va **en el mateix to i a la mateixa velocitat** que la plantilla.

**Conclusió 1 (la pregunta de l'usuari): no hi ha cap desviació de freqüència.**
Si el clip fóra la mateixa música reproduïda a un altre rellotge, l'error clàssic 44,1↔48 donaria
`k` = **1,0884** i **±147 cents** d'afinació; la mesura dona `k` = **0,998** (0,2%) i **±3,5 cents**
de diferència (−1,9 vs −5,4, dins del soroll de mesura). Descartat, doncs, que el problema siga de
reproducció o de gravació: **els dos àudios corren igual**.

**Conclusió 2 (per què no servix com a prova d'identitat):** cap d'estos mètrics **discrimina**.
Els parells **negatius** també donen **5 pics** a `k` ≈ 1, perquè tots els talls de la casa estan en
el mateix to i afinats a La = 440; el **croma** del negatiu `molinet_01`/`anada_publi` és **0,968**,
gairebé el **0,995** del cas que volem decidir; i el **tempo** és el pitjor de tots: el parell
**positiu** `molinet_01`/`molinet_02` (el mateix so!) dona **120,00 contra 81,08 BPM** segons la
finestra — la mateixa peça mesurada dos voltes ix amb temps distints. És a dir: **ni els pics, ni el
croma, ni el tempo decidixen res**; només el parell de còpia exacta trau números rodons (12 pics,
croma 1,000, 81,08/81,08) i eixe cas no necessita cap anàlisi.

**Conclusió 3 (quina mesura decidix, doncs):** només la **correlació d'ona** de §1.3-sexies, que
està validada amb controls (0,93–1,00 per a una còpia real, fins i tot desplaçada, contra
**0,20–0,45** ací). Eixa diu que el contingut **no coincidix** a cap desplaçament del clip.

Lectura final: **no hi ha cap desviació de freqüència**, i en això l'usuari tenia raó —és el que
descartava. I l'orella tampoc enganya: **mateix to, mateixa afinació, mateixa família** de música de
la casa (fins i tot el pols a 81 BPM apareix als dos). Però que coincidisca «tot el que és musical»
no prova que siga la mateixa gravació, i la mesura que sí que ho prova diu que no: la careta que va
eixir el 02/11 **no és l'àudio de `CARETA_20`**, sinó un **tall/versió diferent** de la mateixa
música. Per tant es manté el criteri 5: **no-op + log** fins que arribe el màster del 02/11.
Reproduïble amb
`bin\analitza_to.ps1 -FitxerA <clip> -DesA 13.32 -DurA 7 -FitxerB <wav> -DesB 0 -DurB 7`.

### 1.4 · Comparativa

| Opció | Què fa | Dependències noves | Temps per bloc | Risc | Toca `jsx/`? |
|---|---|---|---|---|---|
| **E1 ⭐** | **resta adaptativa amb plantilla (`anlms`)** | **cap** (ffmpeg ja hi és) | **0,1–0,5× el tram** | residu si hi ha compressió; falla si canvien pitch/velocitat | no |
| O-A0 | res | — | 0 | 0 | no |
| **O-A1** | retalla el clip d'àudio | cap | **< 1 s** | talla veu si ja n'hi ha | no (`Clips.trim` ja existix) |
| O-A2 | silencia el clip | cap | < 1 s | mata tot el clip | no |
| O-A3 | fundit d'entrada | ffmpeg (ja hi és) | 1–3 s | clip nou a la timeline | sí (o reimport) |
| ~~O-A4~~ ❌ | troba el forat de silenci | cap (ffmpeg ja hi és) | 0,3–1 s | **no hi ha forat en el material real** | no |
| ~~O-A5~~ ❌ | troba on comença la veu (VAD) | Python + ONNX (~50 MB) | 0,2–1 s | no lleva la música que va damunt | no |
| O-A6 | separa música/veu (IA) | Python + torch (≈2,5 GB) | 1–3× el tram | artefactes, roba veu | no (exporta/reimporta) |
| O-A7 | denoise | RNNoise/DeepFilterNet | ~0,1× | no lleva música | no |
| O-A8 | Essential Sound | preset a mà | — | gens automàtic | sí |
| O-A9 | núvol | xarxa + compte | 5–30 s | puja material del canal | no |

### 1.5 · Recomanació per fases

| Fase | Què | Cost | Per què |
|---|---|---|---|
| **F0** | **Calibratge amb material real** (`bin\calibra_a1.ps1`, fora del panell): plantilles + 2–3 trams → taula de dB per banda | 1 sessió | Decidix **si E1 basta** abans d'escriure codi; risc 0 |
| **F1** | **E1 integrat**: exportar els primers N s del clip d'A1 → `anlms` amb la plantilla → **reimportar** el WAV net i posar-lo a A1 | 1–2 sessions (JS + ffmpeg) | 0 dependències, 0 descàrregues; resol el cas real (mescla) |
| **F2** | **Refí**: porta (`agate`) o `afftdn` sobre el tram del residu **sense veu**, i `afade` de 4–6 frames | 0,5 sessió | Mata el residu audible i el «clic» d'entrada |
| **F3** | **Pitch/velocitat**: reixeta `rubberband`/`atempo` (±2 %, ±5 %) | 1 sessió | Només si F0 detecta que el tècnic els canvia |
| **F4** | **E2 · IA lleugera** (MDX-Net ONNX 20–120 MB + binari precompilat **sense Python**, amb botó i A/B) | 2 sessions + ~100 MB | Només si E1 no arriba (solape llarg, artefactes del màster) |
| ~~F5~~ | ~~Demucs~~ | — | 2,5 GB + Python: **descartat** llevat d'últim recurs |

**Guarda comuna** (totes les fases): només s'actua sobre el **primer** clip d'A1, mai sobre més d'un
tram; sempre amb `utils.log('🎚️ [A1] …')` dient **què** s'ha fet (plantilla, `order`/`mu`, dB llevats);
flag `_a1Running` per a no repetir-ho dins de la mateixa passada; i el **WAV original copiat** a
`C:\temp\a1_<bloc>\` per a poder tornar arrere encara que el projecte es tanque.

### 1.5 bis · Pla F1 concret (què es farà al panell quan l'F0 done números bons)

Tot amb àtoms que **ja existixen** (cap `jsx/` nou, ⛔ no cal permís):

1. **Detectar** que el primer clip d'A1 ve darrere d'un ítem amb música: la pròpia escaleta ja ho
   diu (`escaleta_items._isCareta`, títol amb `MOLINET`, `TORNADA DE PUBLI`; durades a
   `escaleta_config.ITEM_DURATION_OVERRIDES`). L'ítem anterior és el que s'ha de mirar.
2. **Exportar** els primers *N* s (N = durada de la plantilla + 1 s, topall 20 s) del clip d'A1:
   `FFmpeg.extractClip` (ja migrat a `execHidden`) → WAV 48 kHz.
3. **Triar plantilla**: `cmp_audio.ps1` (correlació) entre eixe WAV i `Audios/*.WAV` → la de `r` més
   alt + el `lag` (el `lag` és el desplaçament que necessita `anlms`; si és llarg, `adelay`).
4. **Netejar**: `anlms` (`execHidden`, ja sense finestres) → residu.
5. **Muntar-ho**: `callJSX("Clips.insert('<residu.wav>', <A1>, <inici>, null, 'audio')")` a la pista
   d'àudio lliure i **silenciar/retallar** el tros original: `Tracks.mute` + `Clips.trim`, o
   `Clips.removeLinkedAudio` si el clip d'àudio és enllaçat — els tres àtoms ja estan en ús a
   `flow_graphics`/`flow_chyrons`.
6. **Rètol al log** (`Utils.log`) amb `r`, `lag`, `order`/`mu` i els dB de `calibracio.csv`, i **no
   tocar res** si `r < 0.7` o si el tram no té música.

**El que falta de l'usuari** (1 sessió, res de codi): exportar **2–3 trams d'A1** de 5–10 s on se
sent la cua, i confirmar si el tècnic **canvia el volum**, el **to** o la **velocitat** de les
plantilles entre dies (si canvia pitch/velocitat, caldrà la reixeta `rubberband`/`atempo`, F3).

### 1.6 · Criteris d'acceptació (F1 · E1)

1. Tram de prova amb la careta mesclada damunt de la veu → el residu baixa **≥ 10 dB** en la banda de
   la careta i mou **< 1 dB** la banda de la veu (mesurat amb `bandpass=f=…:width_type=q:w=10,volumedetect`).
2. Escolta A/B (el residu contra l'`out_mode=e`, la careta estimada): **cap** «burbolla» ni pèrdua de
   consonants.
3. El tram on **només** hi havia careta queda en silenci (< −50 dB).
4. Si el tècnic puja el fader a mitjan tram, el residu **no puja** més de 3 dB (l'adaptació seguix).
5. Sense plantilla del so que es cola → **no es toca res** i el log ho diu
   (`ℹ️ [A1] sense plantilla per a «molinet» → sense canvis`).
6. El WAV net s'importa i queda a **A1**, en el mateix punt; el clip original es pot restaurar
   (backup a `C:\temp\a1_<bloc>\`).

---

## 2 · Problema B — cap finestra de consola (echo off) + rellotge d'arena

> ## Resposta directa: **SÍ, es pot** — i no cal instal·lar ni descarregar res
>
> 1. **Per què hui s'obri una finestra negra**: per a qualsevol cosa d'`ffmpeg`/`ffprobe`/OCR, el
>    panell escriu un `.bat` a `%TEMP%` i el llança amb `File.execute()` d'ExtendScript. Eixe mètode
>    **obri una consola de CMD sempre**. `@echo off` només lleva el **text** de les comandes dins
>    d'eixa consola, **no la finestra** — per això ja hi és al codi i no servix de res.
> 2. **La via silenciosa ja està en ús al repo**: l'esborrat de carpetes (#180) llança PowerShell amb
>    `cep.process.createProcess(..., '-WindowStyle','Hidden', '-EncodedCommand', …)` i **no mostra res**.
> 3. **Què falta**: un helper (`Utils.execHidden`) que faça el mateix amb **qualsevol** comanda, i
>    desviar 4 crides (`ffmpeg`, `ffprobe`, OCR, `curl`) per ell. **No es toca cap `.jsx`**: CEP ja
>    porta eixa API (`cep.process`), no és una llibreria externa.
> 4. **L'única part que s'ha de programar a mà**: hui la consola visible també fa d'«espera» (el `.bat`
>    escriu un `.exit` quan acaba); en la via oculta cal **esperar llegint eixos fitxers** — el patró
>    ja existix (`_waitForPath` a `utils.js`).
> 5. **I el preu**: si no hi ha finestra, l'error tampoc no es veu → **tot** error s'ha d'escriure al
>    `FASTPASS.log` (O-B5). Sense eixa part, no és un avanç, és perdre informació.
> 6. **Pla B** si algun antivirus/EDR fa un flaix: `bin\hidden.vbs` amb `WScript.Shell.Run …, 0`
>    (O-B2), mateix efecte amb un fitxer de 3 línies.

### 2.1 · Com funciona hui (mesurat al codi)

| Peça | Com llança processos | Finestra? |
|---|---|---|
| `IO.executeShell(cmd)` (`jsx/modules/2_IO.jsx:264-287`) | Escriu un `.bat` a `%TEMP%\fp_exec_<ms>.bat` i fa `tempFile.execute()` | **SÍ, sempre** (comentari del propi codi: *«obre una finestra de CMD»*). `@echo off` només lleva el ressò de les comandes, **no la finestra** |
| `FFmpeg.runCommand` (`15_FFmpeg_Logic.js:616`) | `IO.executeShell('"<ffmpeg>" <args>')` | **SÍ** (una per cada ffmpeg) |
| `FFmpeg.getMediaDuration` (`15_FFmpeg_Logic.js:210`) | `IO.executeShell('<ffprobe> … > temp.txt 2>&1')` | **SÍ** — i des del #212 es crida **per cada clip** en col·locar tuits |
| `ocrText` (`17_TitoletDetect_Logic.js:911`) | `IO.executeShell('powershell … ocr.ps1 …')` | **SÍ** (~1.900 ms + arrancada de PowerShell) |
| `IO.curl` / redireccions de keyframes / `10_Srt_Logic.js:876` | `IO.executeShell` | **SÍ** |
| **Esborrat de carpetes** (`utils.js:1240-1262`) | `cep.process.createProcess(powershell, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-EncodedCommand', b64])` | **NO** ✅ (via ja validada al repo des del #180) |

**Conclusió**: la via silenciosa **ja existix al projecte**; el que passa és que només s'usa per a
l'esborrat. La resta (ffmpeg, ffprobe, OCR, curl) va pel `.bat` visible. En una passada de tuits això
són **una ràfega de 10–20 finestres**.

> Nota: el manifest **no declara `--enable-nodejs`** (`utils.js:129-136`), així que **no** hi ha
> `child_process`/`spawn`. Les dues vies reals són `cep.process.createProcess` o un `.vbs`.

### 2.2 · Opcions

#### O-B1 · **`Utils.execHidden(cmd)` amb `cep.process.createProcess`** ⭐ (0 jsx)
Un helper nou a `js/core/utils.js` (germà del que ja esborra carpetes):

```
cep.process.createProcess(
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-EncodedCommand', <b64 UTF-16LE>])
```
El guió PowerShell redirigix `*>` a `C:\temp\fp_exec\<id>.log` i escriu `C:\temp\fp_exec\<id>.exit`
amb el codi de sortida. El JS fa **polling del `.exit`** (patró idèntic al `_waitForPath` de l'OCR i
al bucle de `getMediaDuration`), així que no cal capturar stdout.
- **0 finestres**, no bloqueja la UI, **no toca `jsx/`**.
- Cost: ~60 línies a `utils.js` + substituir 4 crides (`runCommand`, `getMediaDuration`, `ocrText`,
  `curl`). Els fluxos que ja esperen per fitxer (`_waitForPath`) no canvien de lògica.
- Requisit a ffmpeg: `-nostdin` (si no, pot quedar-se esperant una entrada que no arribarà), `-y` i
  `-loglevel error` (o `warning`) per a no omplir el log.

#### O-B2 · `bin\hidden.vbs` + `wscript.exe` (pla B)
`WScript.Shell.Run "<cmd>", 0, False` → `0` = finestra oculta, garantit i independent de CEP.
Cost: **1 fitxer nou** (~3 línies) + cridar-lo amb `createProcess` (`wscript.exe hidden.vbs "<cmd>"`).
Bo com a *fallback* si `-WindowStyle Hidden` fera un flaix en algun equip (passa amb alguns
antivirus/EDR que re-llancen la consola).

#### O-B3 · `cmd /c start /B` — descartable
`/B` no obri finestra nova però **hereta la consola del pare**; des d'ExtendScript no hi ha pare
consistent → pot deixar processos orfes o no arrancar. **No recomanat.**

#### O-B4 · `@echo off` dins del `.bat` — no resol res
Ja hi és (línia 274 de `2_IO.jsx`) i la finestra continua eixint: `@echo off` afecta l'**eco** de les
comandes, no la creació de la consola. Confusió habitual: **l'equivalent real** a «echo off» ací és
`-WindowStyle Hidden` / `Run …,0`.

#### O-B5 · No perdre la visibilitat (obligatori amb qualsevol de les anteriors)
Si les finestres desapareixen, **l'error també**. Regles:
1. Cada comanda oculta deixa `<id>.log` (stdout+stderr) a `C:\temp\fp_exec\`.
2. Si `.exit ≠ 0` → es bolca el log al `FASTPASS.log` amb `❌ [EXEC] …` i el flux **falla explícitament**
   (mai «seguit com si res»).
3. Esborrar `.log`/`.exit` en acabar (o `fp_exec\*.log` amb més de 24 h) per a no deixar brossa —
   la lliçó del `fp_twitts_<n>.png` del #212.

### 2.3 · Rellotge d'arena / feedback per botó (O-C)

**Què hi ha hui** (i per què no es veu):

| Peça | On | Estat |
|---|---|---|
| `markBtnBusy(btn, '⏳')` / `clearBtnBusy(btn)` | `js/main.js:1389-1407` (#172) | ✅ funcionen… si el CSS existira |
| Classe `.btn-busy` | `markBtnBusy` la posa | ❌ **no està definida a `setup.css`** → hui no es veu cap efecte |
| `updateUIState('BUSY')` | `js/core/utils.js:970` → `#main-content.busy` | ✅ existeix (sense CSS propi tampoc) |
| `btn.disabled = true; btn.innerText = '⏳'` … `'🔄'` | `flow_mainButton.js:171` / `:258` | ⚠️ manual i **restaura una etiqueta fixa** (`🔄`) en lloc de l'original → si el botó no era 🔄, queda mal |
| Semàfors `#sem-esc` `#sem-mp4` `#sem-wot` `#sem-srt` | `setup.css.panel`/`index.html` | ✅ ja hi ha 4 llums + estats intermitents |

**Opcions de feedback**:

| Opció | Què és | Cost | Valor |
|---|---|---|---|
| **O-C1** | Helper únic `withBusy(btn, label, fn)` a `main.js`: `markBtnBusy` + `try/finally` + comptador global `_busyCount` (i `updateUIState('BUSY')` automàtic) | ~25 línies | Un sol patró per a tots els botons; elimina els `⏳`/`🔄` a mà |
| **O-C2** ⭐ | **CSS `.btn-busy`**: `opacity .6`, `cursor: progress` i un **spinner** amb `::after` (`border` + `@keyframes fp-spin`) | ~20 línies de `setup.css` | És el «rellotge d'arena» literal, sense imatges ni JS |
| **O-C3** ⭐ | **Comptador de tasques externes** a la barra: `⏳ 3` mentre hi ha processos de `execHidden` vius (el propi helper incrementa/decrementa) | ~15 línies + 1 span a `index.html` | El rellotge és **real**: diu quantes tasques queden, no és decoratiu |
| O-C4 | **Text de fase** al comptador (`ffprobe 12/17`, `OCR clip 3/8`) via callback de progrés | ~30 línies | Molt útil en passades llargues (tuïts, OUT & GO); es pot afegir després |
| O-C5 | `document.title` / `aria-busy` | 5 línies | Accessibilitat i visibilitat si el panell està darrere |

**Botons que llancen processos externs** (per a aplicar-hi O-C1): 🎯 COL·LOCAR (OCR + ffmpeg + ffprobe),
📷 FOTO (curl), `IN`, `TROSSEJA`, `OUT & GO`, `🔄 RESET`, 🎨 `MAPA import`, 🗺️ `MAPA ZOOM`,
`⬇️/💾/♻️` SRT, portada i render.

**ESTAT REAL (2026-11-02)** — fet i validat amb `bin\check_all.ps1 -Only js,smoke,dead` (ALL GREEN):

| Fase | Estat | Com ha quedat |
|---|---|---|
| **B1** | ✅ FET | `Utils.execHidden(command, {timeoutMs, intervalMs, keepFiles, silent})` → `_runHiddenOnce`: escriu la comanda a `%TEMP%\fp_exec_<tag>.txt`, llança `wscript.exe //nologo //B bin\hidden.vbs <cmd> <exit>` **variàdic** (un argument per token, com `pick_folder.ps1`), poll de `<tag>.exit` i esborra els dos fitxers. Retorna `{ok,started,code,mode,err,timedOut,ms,tag}`. |
| **B2** | ✅ FET | `15_FFmpeg_Logic`: `_sh()` i `_waitDone()`; migrats `getMediaDuration`, `checkSourceDuration`, `keyframeAtOrBefore`, `extractRoiSeries`, `extractFramePng`, `extractClip`, `reverse` i `runCommand` (ara **espera** i torna `ERR:exit=N`). |
| **B3** | ✅ FET | `17_TitoletDetect_Logic.ocrText`: `execHidden` primer; si `started:false`, cau a `IO.executeShell` + `_waitForPath`. |
| **B4** | ✅ FET | `style.css` `.btn-busy` (pols 1,6 s + anell-rellotge `::before` girant 0,75 s, `cursor:progress`), `main.js` `markBtnBusy`/`clearBtnBusy` (comptador re-entrant `_busyCount`, recorda el `disabled` previ, temporitzador de seguretat de 15 min, `_clickedBtn` capturat en fase de captura) i `flow_mainButton` (classe al costat de `⏳`/`🔄`). |
| **B5** | ✅ FET | Els `.txt`/`.exit` s'esborren en acabar cada crida (`keepFiles:false`); el timeout fa `taskkill /T` des del propi `.vbs`. |

### 2.4 · Pla d'implementació

| Fase | Què | Fitxers | Prova |
|---|---|---|---|
| **B1** | `Utils.execHidden()` + redirecció a `.log`/`.exit` + polling | `js/core/utils.js` | llançar `ffprobe -version` ocult: 0 finestres i `.exit = 0` |
| **B2** | Migrar `FFmpeg.runCommand` i `FFmpeg.getMediaDuration` | `js/logic/15_FFmpeg_Logic.js` | col·locar tuïts: cap finestra, `🧷 … exacta` al log, durades idèntiques |
| **B3** | Migrar `ocrText` (`ocr.ps1`) | `js/logic/17_TitoletDetect_Logic.js` | OCR d'un PNG dona el mateix text |
| **B4** | O-C1 + O-C2 + O-C3 (helper, CSS, comptador) | `js/main.js`, `setup.css`, `index.html` | clicar 🎯/OUT: spinner al botó + comptador, i el botó torna a la seua etiqueta original |
| **B5** | Buidar `C:\temp\fp_exec` (i log de restes > 24 h) | `js/core/utils.js` | després de 20 execucions: 0 fitxers orfes |

Validació de cada fase: `bin\check_all.ps1 -Only js,smoke` (B1–B5) i `-Only setup` (si es toca
`setup.css`/`index.html` → `-Only js,smoke,setup`). Cap fitxer de `jsx/` no es toca en este pla.

### 2.5 · Riscos

| Risc | Mitigació |
|---|---|
| Un `ffmpeg` ocult es queda penjat (espera `stdin`) | `-nostdin` + timeouts al polling (`getMediaDuration` ja té 25×400 ms) |
| Un error deixa de ser visible | O-B5: `.log` + `.exit` + volcat al `FASTPASS.log` |
| `-WindowStyle Hidden` fa un flaix en algun equip | O-B2 (`hidden.vbs`, `Run …,0`) com a alternativa per configuració |
| Moltes tasques «en marxa» però el comptador no baixa | El comptador viu en `try/finally`; si un flux peta, es reseteja a 0 en acabar el workflow |
| Doble clic mentre hi ha una tasca | `disabled` + `_busyCount` (ja hi ha guardes de re-entrada per flux: `_portadaRunning`, `_a1Running`…) |

---

## 3 · Decisions pendents (per a l'usuari)

| # | Pregunta | Proposta (si no em dius res, vaig per ací) |
|---|---|---|
| **1** | **Materials**: ¿pots passar les **plantilles netes** (molinet, careta, sintonía…) i **2–3 trams d'A1** amb el problema? | **Sí**: és el que decidix si E1 basta (fase F0) |
| **2** | ¿El tècnic **canvia el pitch o la velocitat** del so, o només el **volum**? | Assumir **només volum** fins que la prova diga el contrari |
| **3** | ¿Sempre són **els mateixos fitxers** de so, o es regeneren cada dia? | Si són fixes, la plantilla pot viure a `bin\audio\` |
| **4** | ¿**On** s'executa E1: dins del pipeline (en acabar `OUT & GO`/col·locar, **sense botó nou**) o amb un botó? | Dins del pipeline, amb flag `_a1Running` |
| **5** | ¿**Substituir** el clip d'A1 pel WAV net (reimportar-lo al mateix punt) o deixar l'original mut i posar el net en una **pista nova**? | Substituir a A1 (menys pistes, menys sorpreses) |
| **6** | **Echo off**: `-WindowStyle Hidden` (O-B1) o `hidden.vbs` (O-B2)? | **RESOLT 2026-11-02: O-B2** (`bin\hidden.vbs`). Mesurat: `-WindowStyle Hidden` ~800 ms per crida i arranca PowerShell sencer; `wscript.exe` és subsistema GUI → **0 finestres garantides** i ~250 ms. `execHidden` és autoproveïdora: si `wscript` o `cep.process` fallen, torna `started:false` i cada cridador cau al camí vell (`IO.executeShell`) |
| **7** | **Rellotge**: spinner + comptador (O-C2+O-C3), o també text de fase (`ffprobe 12/17`, O-C4)? | C2+C3 primer; C4 si la passada es fa pesada |

---

## 4 · Referències al codi

| Tema | Fitxer:línia |
|---|---|
| `.bat` visible + `File.execute()` | `jsx/modules/2_IO.jsx:264-287` |
| **`anlms` (NLMS amb referència) al ffmpeg del repo** | `bin\ffmpeg\bin\ffmpeg.exe -h filter=anlms` (git 2026-01-19, firma `AA->A`); `anlmf` al costat |
| Proves de cancel·lació fetes el 30/10 | `%TEMP%\a1test\` (`ref.wav`, `mix.wav`, `ref2.wav`, `mix2.wav` + variants `anlms … out_mode=o`) |
| Via oculta ja validada (`createProcess` + `-WindowStyle Hidden`) | `js/core/utils.js:1240-1262` |
| Sense Node (`--enable-nodejs` absent) | `js/core/utils.js:129-136` |
| ffmpeg / ffprobe propis | `bin\ffmpeg\bin\ffmpeg.exe`, `bin\ffmpeg\bin\ffprobe.exe`; resolució a `js/logic/15_FFmpeg_Logic.js:69-95` |
| `ffprobe` per a la duració exacta (#212 · D29) | `js/logic/15_FFmpeg_Logic.js:191-250` |
| `IO.executeShell` des de `runCommand` | `js/logic/15_FFmpeg_Logic.js:616-630` |
| `IO.executeShell` des de l'OCR | `js/logic/17_TitoletDetect_Logic.js:896-929` |
| Àtoms de timeline per a ÀUDIO | `jsx/modules/6_Clips.jsx` (`trim`, `retrim`, `inPoint`, `getProp`, `setProp`, `removeAt`, `removeLinkedAudio`) |
| Mute de pista | `jsx/modules/5_Tracks.jsx:43-56` |
| Estat ocupat de botó (sense CSS) | `js/main.js:1382-1407` |
| `⏳`/`🔄` manual | `js/workflows/flow_mainButton.js:171, 258` |
| `updateUIState('BUSY')` | `js/core/utils.js:970-975` |
| Ripple d'àudio a OUT & GO | `js/workflows/flow_cut.js:193-208` |
