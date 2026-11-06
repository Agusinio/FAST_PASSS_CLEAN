# bin/sep — Traçabilitat del motor de separació de fonts (A1 Clean IA)

> Document per a IT / seguretat: què és cada binari, d'on ve i com verificar-lo.
> Res d'aquesta carpeta s'executa sol: **el panell encara no en fa cap crida**
> (no hi ha integració a `js/logic/23_A1_Clean_Logic.js`).

## On viu cada cosa (2026-11-05)

- **`E:\A1_SEP_CORE\bin\`** → `A1Sep.exe` + `sherpa-onnx.dll` + `sherpa-onnx-c-api.dll`
  + `onnxruntime.dll`. **Mai dins d'`AppData\...\CEP\extensions\`**: l'EDR
  corporatiu bloqueja (`Acceso denegado`) l'execució d'executables sense signar
  dins d'eixa carpeta — provat el 05/11, després dels avisos de ransomware.
- **`bin\sep\` (esta carpeta, dins l'extensió)** → només `Kim_Vocal_2.onnx`
  (dades, no executable), `src\A1Sep.cs`, `src\add_uvr_metadata.py`,
  `src\a1_metrics.py` i este document.
- **`E:\A1_SEP_CORE\`** → taller de compilació: `src\`, `out\`, `bak\` i
  `bin\`. No hi ha .NET SDK a l'equip: es compila amb `csc.exe` del .NET
  Framework 4.8 (sintaxi C# 5). A `bin\` hi ha també el certificat públic de
  firma **`A1Sep-code-signing.cer`** (el privat és al magatzem de l'usuari,
  no exportable).


## Què és

Separació de veu/música per IA (model MDX-Net "Kim Vocal 2") executada amb
`onnxruntime` natiu. **No usa Python ni PyTorch.** S'utilitza per a A1 Clean:
treure la música de fons d'un clip de locució.

## Fitxers i procedència

| Fitxer | Bytes | SHA-256 | Origen |
|---|---|---|---|
| `A1Sep.exe` | 14.848 | `77CC4F3BD75732B9BE052FF5573E3752BCE9E09897F80EA9FB596C473B964F46` | Compilat localment amb `csc.exe` (.NET Framework 4.8) a partir de `src/A1Sep.cs` · **firmat Authenticode 2026-11-05** (vegeu §Signatura) |
| `sherpa-onnx.dll` | 53.248 | `DC122F8021C2607FD80EEE7BB2412B38DA266B4522043E9FEE3A9A684B792819` | NuGet `org.k2fsa.sherpa.onnx` 2.0.1 (https://www.nuget.org/packages/org.k2fsa.sherpa.onnx) |
| `sherpa-onnx-c-api.dll` | 4.294.656 | `5DD36DBD3572846B72C4A40A4017C5A770160EE8E00DA5053BEBC8B2632501E8` | NuGet `org.k2fsa.sherpa.onnx.runtime.win-x64` 2.0.1 |
| `onnxruntime.dll` | 17.799.168 | `7F66F939A881BAF4F46A2216496798EDF4A1429878B646D12674AA62F27D8A25` | Mateix paquet NuGet (build oficial d'ONNX Runtime) |
| `Kim_Vocal_2.onnx` | 66.759.512 | `922BCA81B84B85EB96FE46BCC4BECD7658B64B3841BB11B8FDEA0B04E44E761D` | https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/Kim_Vocal_2.onnx |

Model original **sense tocar** (66.759.214 bytes):
`CE74EF3B6A6024CE44211A07BE9CF8BC6D87728CC852A68AB34EB8E58CDE9C8B`

L'única modificació feta al `.onnx` és **metadata** (cap pes canviat) perquè
sherpa-onnx el puga carregar: `model_type=UVR`, `stems=2`, `sample_rate=44100`,
`n_fft=6144`, `win_length=6144`, `hop_length=1024`, `dim_f=3072`, `dim_t=256`,
`dim_c=4`, `center=1`, `window_type=hann`. Script: `src/add_uvr_metadata.py`
(adaptació de `scripts/uvr_mdx/add_meta_data_and_quantize.py` de sherpa-onnx,
sense quantitzar).

## Llicències

- **sherpa-onnx / onnxruntime**: Apache-2.0 i MIT (codi obert, ús comercial permès).
- **Model `Kim_Vocal_2.onnx`**: ve del repositori comunitari de models d'UVR
  (`TRvlvr/model_repo`). **No té una llicència explícita de redistribució**:
  és correcte per a ús intern en aquest equip, però **no s'ha de distribuir**
  amb l'extensió a altres equips sense revisió legal.

## Signatura de codi (2026-11-05)

`A1Sep.exe` està **firmat Authenticode** (SHA-256 + **segell de temps RFC-3161 de
DigiCert**), perquè el binari tinga identitat i integritat verificables encara
que qui el mire no es fie de nosaltres.

| Camp | Valor |
|---|---|
| Subjecte | `CN=FAST PASS A1Sep (eina interna), O=FAST PASS` |
| Emissor | el mateix (certificat **autofirmat**) |
| Thumbprint | `722C1937DDDB7917491AD25012F5B0DC97B9FF87` |
| Validesa | 2026-11-05 → 2029-11-05 |
| Clau | RSA 3072, **no exportable** (viu només al magatzem `Cert:\CurrentUser\My`) |
| Certificat públic | **`E:\A1_SEP_CORE\bin\A1Sep-code-signing.cer`** → este és el que s'ha de donar a IT |
| SHA-256 del fitxer firmat | `77CC4F3BD75732B9BE052FF5573E3752BCE9E09897F80EA9FB596C473B964F46` |
| SHA-256 abans de firmar | `DE4C9B547A1E610E214A16FC4970FEFBC826FCC5B6A7FC57CBF465422234BC01` |

L'estat que dona `Get-AuthenticodeSignature` és **`UnknownError`** amb el text
«…termina en un certificado de raíz no compatible con el proveedor de
confianza»: la firma és criptogràficament correcta, però **la cadena acaba en
una arrel que este equip encara no es fia**. És l'esperable en un autofirmat.

### Què ha de fer IT (requereix administrador)

```powershell
Import-Certificate -FilePath A1Sep-code-signing.cer -CertStoreLocation Cert:\LocalMachine\Root
Import-Certificate -FilePath A1Sep-code-signing.cer -CertStoreLocation Cert:\LocalMachine\TrustedPublisher
```

Després d'això el publicador passa a ser un nom conegut en compte de
«desconegut», i es pot autoritzar per **empremta del certificat** en compte de
per hash del fitxer (que canvia a cada recompilació).

### Què NO fa la firma

- **No lleva els avisos per si sola**: si l'agent corporatiu bloqueja per
  política, seguirà bloquejant. **La firma no és una manera de saltar-se el
  control**, és el que permet a IT dir «sí» amb criteri.
- **No firma les DLL de tercers** (`sherpa-onnx*.dll`, `onnxruntime.dll`): se
  signen només els binaris que hem escrit nosaltres; firmar els d'altres seria
  dir que són nostres.

### Si es recompila

La firma es perd (canvia el hash). Es torna a firmar amb el mateix certificat:

```powershell
$c = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
     Where-Object Thumbprint -eq '722C1937DDDB7917491AD25012F5B0DC97B9FF87'
Set-AuthenticodeSignature -FilePath A1Sep.exe -Certificate $c `
    -HashAlgorithm SHA256 -TimestampServer http://timestamp.digicert.com
```

## Per què l'EDR pot avisar

1. Són binaris **sense signatura Authenticode** (no hi ha certificat de signatura).
2. Estan dins d'`AppData\Roaming\Adobe\CEP\extensions\`, una carpeta que els
   sistemes de seguretat consideren de "persistència".
3. Un procés nou carrega DLLs natives, obri un model de 64 MB i escriu WAVs.

Cap dels fitxers està en quarantena i **Windows Defender no té cap detecció**
registrada (`Get-MpThreatDetection` és buit): els avisos són de l'agent
corporatiu. Per a ús habitual cal que IT el validi o el pose a la llista blanca.

## Com regenerar-ho tot (sense descarregar res de tercers)

```
csc.exe /target:exe /platform:x64 /optimize+ /out:A1Sep.exe ^
  /r:org.k2fsa.sherpa.onnx\lib\net40\sherpa-onnx.dll ..\src\A1Sep.cs
```

Ús:

```
A1Sep.exe --model Kim_Vocal_2.onnx --in mix.wav --voice veu.wav --music musica.wav ^
          --threads 20 --json sep.json [--template careta.wav] [--tail 0,0.24]
```
