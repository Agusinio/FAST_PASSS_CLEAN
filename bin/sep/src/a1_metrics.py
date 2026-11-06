# -*- coding: utf-8 -*-
"""a1_metrics.py — metriques objectives de la separacio A1 (veu/musica).

Compara: mescla original, stem de veu IA, stem de musica IA, resta antiga (_net)
i la plantilla (careta) que sonava de fons. Tot a 48 kHz estereo.

Us:
  python a1_metrics.py --mix mix.wav --voice voice48.wav --music music48.wav \
      --net net.wav --tpl tpl48.wav --tail 0.24 --out metrics.json
"""
import argparse
import json
import wave

import numpy as np

BAND = (300.0, 3400.0)   # banda de veu (Hz)


def read_wav(path):
    """Retorna (float32[2,n], sr). Nomes suporta PCM 16/24/32."""
    with wave.open(path, 'rb') as w:
        sr = w.getframerate()
        ch = w.getnchannels()
        sw = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sw == 2:
        a = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16))
        v = np.where(v & 0x800000, v - 0x1000000, v)
        a = v.astype(np.float32) / 8388608.0
    elif sw == 4:
        a = np.frombuffer(raw, dtype='<i4').astype(np.float32) / 2147483648.0
    else:
        raise ValueError('amplada de mostra no suportada: %d' % sw)
    a = a.reshape(-1, ch).T
    if ch == 1:
        a = np.vstack([a, a])
    return a, sr


def db(x):
    return float(20.0 * np.log10(max(x, 1e-12)))


def rms(a):
    return float(np.sqrt(np.mean(a.astype(np.float64) ** 2)))


def mono(a):
    return a.mean(axis=0)


def band_db(a, sr, lo, hi):
    """Energia de banda amb FFT sobre la mescla mono."""
    x = mono(a).astype(np.float64)
    if x.size < 16:
        return -300.0
    win = np.hanning(x.size)
    sp = np.abs(np.fft.rfft(x * win)) ** 2
    f = np.fft.rfftfreq(x.size, 1.0 / sr)
    m = (f >= lo) & (f <= hi)
    if not m.any():
        return -300.0
    p = sp[m].sum() / (np.sum(win ** 2) * x.size)
    return db(np.sqrt(max(p, 1e-24)) * 2.0)


def corr(a, b):
    """Correlacio de Pearson a lag 0 entre les mescles mono."""
    x, y = mono(a), mono(b)
    n = min(x.size, y.size)
    if n < 16:
        return 0.0
    x = x[:n] - x[:n].mean()
    y = y[:n] - y[:n].mean()
    d = float(np.sqrt((x * x).sum() * (y * y).sum()))
    return float((x * y).sum() / d) if d > 1e-12 else 0.0


def corr_best_lag(a, b, sr, max_ms=120.0):
    """Correlacio amb el millor retard dins +-max_ms (la plantilla pot anar desplacada)."""
    x, y = mono(a), mono(b)
    n = min(x.size, y.size)
    x, y = x[:n], y[:n]
    ml = int(sr * max_ms / 1000.0)
    if n <= ml * 2 + 8:
        return corr(a, b), 0
    yc = y - y.mean()
    best, bl = -2.0, 0
    for lag in range(-ml, ml + 1):
        if lag >= 0:
            xs, ys = x[lag:], yc[:n - lag]
        else:
            xs, ys = x[:n + lag], yc[-lag:]
        xs = xs - xs.mean()
        d = float(np.sqrt((xs * xs).sum() * (ys * ys).sum()))
        if d > 1e-12:
            c = float((xs * ys).sum() / d)
            if c > best:
                best, bl = c, lag
    return best, bl


def stats(a, sr, tail_s):
    n = max(1, int(round(tail_s * sr)))
    return {
        'rmsDb': round(db(rms(a)), 3),
        'peakDb': round(db(float(np.max(np.abs(a)))), 3),
        'tailDb': round(db(rms(a[:, :n])), 3),
        'bandDb': round(band_db(a, sr, *BAND), 3),
    }



def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mix', required=True)
    ap.add_argument('--voice', required=True)
    ap.add_argument('--music', required=True)
    ap.add_argument('--net', default=None)
    ap.add_argument('--tpl', default=None)
    ap.add_argument('--tail', type=float, default=0.24)
    ap.add_argument('--out', required=True)
    o = ap.parse_args()

    mix, sr = read_wav(o.mix)
    voice, sr_v = read_wav(o.voice)
    music, sr_m = read_wav(o.music)
    out = {
        'ok': True,
        'sampleRate': sr,
        'durationSec': round(mix.shape[1] / float(sr), 5),
        'tailSec': o.tail,
        'band': list(BAND),
        'srMatch': (sr_v == sr == sr_m),
        'mix': stats(mix, sr, o.tail),
        'aiVoice': stats(voice, sr_v, o.tail),
        'aiMusic': stats(music, sr_m, o.tail),
    }

    # reconstruccio: veu + musica hauria de tornar a ser la mescla
    n = min(mix.shape[1], voice.shape[1], music.shape[1])
    rec = (voice[:, :n] + music[:, :n]) - mix[:, :n]
    out['recon'] = {
        'errRelMixDb': round(db(rms(rec)) - db(rms(mix[:, :n])), 3),
        'corrVoiceMusic': round(corr(voice, music), 5),
        'corrVoiceMix': round(corr(voice, mix), 5),
    }

    if o.net:
        net, sr_n = read_wav(o.net)
        st = stats(net, sr_n, o.tail)
        m = min(mix.shape[1], net.shape[1])
        res = mix[:, :m] - net[:, :m]
        st['residualDb'] = round(db(rms(res)), 3)
        st['residualRelMixDb'] = round(db(rms(res)) - db(rms(mix[:, :m])), 3)
        st['corrNetMix'] = round(corr(net, mix), 5)
        out['oldNet'] = st

    if o.tpl:
        tpl, sr_t = read_wav(o.tpl)
        c, lag = corr_best_lag(music, tpl, sr_m)
        out['template'] = {
            'corrMusic': round(c, 5),
            'lagMs': round(1000.0 * lag / float(sr_m), 3),
            'corrVoice': round(corr(voice, tpl), 5),
            'rmsDb': round(db(rms(tpl)), 3),
        }
        if o.net:
            cn, lagn = corr_best_lag(net, tpl, sr_n)
            out['oldNet']['corrTpl'] = round(cn, 5)
            out['oldNet']['lagTplMs'] = round(1000.0 * lagn / float(sr_n), 3)

    out['gain'] = {
        'voiceVsMixDb': round(out['aiVoice']['rmsDb'] - out['mix']['rmsDb'], 3),
        'musicVsMixDb': round(out['aiMusic']['rmsDb'] - out['mix']['rmsDb'], 3),
        'tailDropDb': round(out['aiVoice']['tailDb'] - out['mix']['tailDb'], 3),
        'bandDropDb': round(out['aiVoice']['bandDb'] - out['mix']['bandDb'], 3),
    }

    with open(o.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(json.dumps(out['gain'], ensure_ascii=False))
    print('OK -> ' + o.out)


if __name__ == '__main__':
    main()
