# ============================================================================
# Rastreja les PISTES DE VÍDEO d'un .prproj descomprimit (XML pla).
#
# Complement de `analyze_prproj_seq.py` (que resumeix per seqüència): aquest
# entra dins cada VideoTrackGroup i llista, pista per pista (V1, V2…), els
# track items amb nom de mèdia, entrada/sortida de timeline i In/Out del mèdia.
#
# Serveix per caçar clips col·locats a la pista equivocada. Cas real que va
# motivar-lo: TNC V3 (2026-10-15) → una traducció duplicada a V7.
#
# Ús:
#   analyze_prproj_tracks.py <xml_path> [--seq NOM|UUID] [--track N]
#                            [--from S] [--to S] [--max N] [--list]
#
#   --list        només la llista de seqüències amb comptatge per pista
#   --seq X       detall de la seqüència X (nom o ObjectUID); si s'omet,
#                 s'imprimeix el resum de totes les seqüències
#   --track N     filtra a la pista N (1 = V1)
#   --from/--to   filtra els items per solapament amb la finestra [from,to]
#   --max N       màxim d'items impresos per pista (defecte 40, 0 = tots)
# ============================================================================
import re, sys

TICKS = 254016000000.0

OBJ_RE = re.compile(r'<(\w+) Object(?:ID|UID)="([^"]+)"[^>]*>(.*?)</\1>', re.S)
TRACK_REF_RE = re.compile(r'<Track Index="(\d+)" Object(?:U)?Ref="([^"]+)"\s*/>')
TRACKITEM_REF_RE = re.compile(r'<TrackItem Index="\d+" Object(?:U)?Ref="([^"]+)"\s*/>')
TRACKGROUP_RE = re.compile(r'<TrackGroup [^>]*Index="(\d+)"[^>]*>(.*?)</TrackGroup>', re.S)
SECOND_REF_RE = re.compile(r'<Second Object(?:U)?Ref="([^"]+)"\s*/>')


def sec(t):
    """Ticks de Premiere → segons (None si no hi és)."""
    try:
        return None if t is None else int(t) / TICKS
    except (TypeError, ValueError):
        return None


def tag(body, name):
    m = re.search(r'<%s>([^<]*)</%s>' % (name, name), body)
    return m.group(1) if m else None


def media_name(objs, body, depth=0):
    """Resol el nom del mèdia seguint ObjectRefs (SubClip→Clip→ProjectItem)."""
    if depth > 4:
        return '?'
    nm = tag(body, 'Name')
    if nm and ('.' in nm[-6:] or depth > 0):
        return nm
    for rm in re.finditer(r'<\w+ Object(?:U)?Ref="([^"]+)"\s*/>', body):
        ref = objs.get(rm.group(1))
        if ref and ref[0] in ('SubClip', 'Clip', 'ProjectItem', 'MasterClip', 'Media'):
            n2 = media_name(objs, ref[1], depth + 1)
            if n2 and n2 != '?':
                return n2
    return nm or '?'


def load(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        xml = f.read()
    print("XML: %.1f MB" % (len(xml) / 1e6))
    objs = {}
    for m in OBJ_RE.finditer(xml):
        objs[m.group(2)] = (m.group(1), m.group(3))
    print("Objectes indexats:", len(objs))
    return objs


def track_items(objs, track_body):
    """Items d'un VideoClipTrack, ordenats per temps d'entrada."""
    items = []
    for rm in TRACKITEM_REF_RE.finditer(track_body):
        ref = objs.get(rm.group(1))
        if not ref:
            continue
        tb = ref[1]
        s, e = sec(tag(tb, 'Start')), sec(tag(tb, 'End'))
        sub = re.search(r'<SubClip Object(?:U)?Ref="([^"]+)"\s*/>', tb)
        mi = mo = None
        if sub:
            so = objs.get(sub.group(1))
            if so:
                mi, mo = sec(tag(so[1], 'InPoint')), sec(tag(so[1], 'OutPoint'))
        items.append({'s': s, 'e': e, 'i': mi, 'o': mo,
                      'name': media_name(objs, tb), 'type': ref[0]})
    items.sort(key=lambda x: (x['s'] if x['s'] is not None else -1))
    return items


def sequences(objs):
    """[(nom, uid, [ {track, items} ])] per a cada Sequence del projecte."""
    out = []
    for oid, (typ, body) in objs.items():
        if typ != 'Sequence':
            continue
        name = tag(body, 'Name') or ('(sense nom) ' + oid[:8])
        tracks = []
        for gm in TRACKGROUP_RE.finditer(body):
            sm = SECOND_REF_RE.search(gm.group(2))
            if not sm:
                continue
            grp = objs.get(sm.group(1))
            if not grp:
                continue
            for tm in TRACK_REF_RE.finditer(grp[1]):
                tb = objs.get(tm.group(2))
                if not tb or tb[0] != 'VideoClipTrack':
                    continue    # els grups d'àudio queden fora
                tracks.append({'track': int(tm.group(1)) + 1,   # Index 0 → V1
                               'items': track_items(objs, tb[1])})
        out.append((name, oid, tracks))
    out.sort(key=lambda x: -sum(len(t['items']) for t in x[2]))
    return out


def fmt(v):
    return ("%8.2f" % v) if v is not None else "     ---"


def main():
    argv = sys.argv[1:]
    if not argv:
        print("Ús: analyze_prproj_tracks.py <xml_path> [--seq NOM] [--track N] "
              "[--from S] [--to S] [--max N] [--list]")
        return
    xml_path = argv[0]
    seq_arg = track_arg = frm = to = None
    max_n, list_only, i = 40, False, 1
    while i < len(argv):
        a = argv[i]
        if a == '--list':
            list_only = True
        elif a == '--seq':
            i += 1; seq_arg = argv[i]
        elif a == '--track':
            i += 1; track_arg = int(argv[i])
        elif a == '--from':
            i += 1; frm = float(argv[i])
        elif a == '--to':
            i += 1; to = float(argv[i])
        elif a == '--max':
            i += 1; max_n = int(argv[i])
        i += 1

    objs = load(xml_path)
    seqs = sequences(objs)
    print("\nSEQÜÈNCIES AMB PISTES DE VÍDEO (%d)" % len(seqs))

    want = seq_arg.lower() if seq_arg else None
    for name, uid, tracks in seqs:
        if list_only or want is None:
            print("  - %-40s items=%4d  %s" % (
                name[:40], sum(len(t['items']) for t in tracks),
                " ".join("V%d:%d" % (t['track'], len(t['items']))
                         for t in tracks if t['items'])))
        if want is None or list_only:
            continue
        if want not in name.lower() and not uid.lower().startswith(want):
            continue

        print("\n=== %s  [%s] ===" % (name, uid))
        for t in tracks:
            if track_arg and t['track'] != track_arg:
                continue
            items = t['items']
            if frm is not None or to is not None:
                lo = frm if frm is not None else -1e9
                hi = to if to is not None else 1e9
                items = [x for x in items
                         if x['s'] is not None and x['e'] is not None
                         and x['e'] > lo and x['s'] < hi]
            if not items:
                continue
            tl = max([(x['e'] or 0) for x in t['items']], default=0)
            print("\n-- V%d (%d items a la pista, timeline fins %.2fs) --"
                  % (t['track'], len(t['items']), tl))
            for x in (items if max_n <= 0 else items[:max_n]):
                print("   %s->%s  <- %s->%s  %-6s %s"
                      % (fmt(x['s']), fmt(x['e']), fmt(x['i']), fmt(x['o']),
                         x['type'], str(x['name'])[:70]))

    # ── Diagnòstic: mateix mèdia col·locat a MÉS D'UNA pista ───────────────
    print("\n=== DUPLICATS ENTRE PISTES (mateix mèdia en 2+ pistes) ===")
    for name, uid, tracks in seqs:
        seen = {}
        for t in tracks:
            for x in t['items']:
                seen.setdefault(x['name'], []).append((t['track'], x['s'], x['e']))
        dups = {k: v for k, v in seen.items() if len({p[0] for p in v}) > 1}
        if not dups:
            continue
        print("  [%s]" % name[:60])
        for k, v in dups.items():
            print("    %s" % str(k)[:70])
            for tr, s, e in sorted(v, key=lambda z: (z[1] or 0)):
                print("        V%-2d %s->%s" % (tr, fmt(s), fmt(e)))


if __name__ == '__main__':
    main()
