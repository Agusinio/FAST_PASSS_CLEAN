#!/usr/bin/env python3
# ============================================================================
# add_uvr_metadata.py — Afig la metadata que sherpa-onnx exigeix als models
# MDX-Net/UVR crus (descarregats de TRvlvr/model_repo).
#
#   python add_uvr_metadata.py --filename Kim_Vocal_2.onnx
#
# Adaptacio de scripts/uvr_mdx/add_meta_data_and_quantize.py de sherpa-onnx
# (Apache-2.0), SENSE quantitzar ni passar a fp16: nomes afig metadata i
# conserva els pesos originals per no perdre qualitat.
#
# Claus obligatories (offline-source-separation-uvr-model.cc):
#   model_type=UVR · stems=2 · sample_rate · n_fft · center · win_length
#   hop_length · dim_t · dim_f · dim_c · window_type
# n_fft i win_length es deriven de dim_f*2, igual que fa el script oficial.
# ============================================================================

import argparse
import shutil
from pathlib import Path

import onnx


def get_args():
    p = argparse.ArgumentParser(formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    p.add_argument("--filename", type=str, required=True, help="Path to onnx model")
    p.add_argument("--sample-rate", type=int, default=44100)
    p.add_argument("--hop-length", type=int, default=1024)
    p.add_argument("--backup-dir", type=str, default=None,
                   help="Si s'indica, desa una copia del model original abans de tocar-lo")
    p.add_argument("--quantize", action="store_true",
                   help="Afig 'quantize' a la metadata (no quantitza de veritat)")
    return p.parse_args()


def main():
    args = get_args()
    fn = Path(args.filename)
    if not fn.is_file():
        raise ValueError(f"{fn} does not exist")

    model = onnx.load(str(fn))
    inp = model.graph.input[0]
    dims = [d.dim_value for d in inp.type.tensor_type.shape.dim]
    print("input", inp.name, dims)
    if len(dims) != 4 or any(d <= 0 for d in dims[1:]):
        raise ValueError(f"esperava [batch, dim_c, dim_f, dim_t] amb dims fixes: {dims}")

    dim_c, dim_f, dim_t = dims[1], dims[2], dims[3]

    if args.backup_dir:
        bdir = Path(args.backup_dir)
        bdir.mkdir(parents=True, exist_ok=True)
        bak = bdir / fn.name
        if not bak.exists():
            shutil.copy2(fn, bak)
            print("backup", bak)

    meta = {
        "model_type": "UVR",
        "model_name": fn.stem,
        "sample_rate": args.sample_rate,
        "comment": "This model is downloaded from https://github.com/TRvlvr/model_repo/releases",
        "n_fft": dim_f * 2,
        "center": 1,
        "window_type": "hann",
        "win_length": dim_f * 2,
        "hop_length": args.hop_length,
        "dim_t": dim_t,
        "dim_f": dim_f,
        "dim_c": dim_c,
        "stems": 2,
    }
    if args.quantize:
        meta["quantize"] = 1

    while len(model.metadata_props):
        model.metadata_props.pop()
    for k, v in meta.items():
        item = model.metadata_props.add()
        item.key = k
        item.value = str(v)

    onnx.save(model, str(fn))
    print("metadata afegida a", fn)
    for k, v in meta.items():
        print("  ", k, "=", v)


if __name__ == "__main__":
    main()
