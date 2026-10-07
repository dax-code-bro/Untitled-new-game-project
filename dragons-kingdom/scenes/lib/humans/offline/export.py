"""Binary character export for scenes/lib/humans/loader.js.

<id>.json : header (bones, meshes, attributes -> byte ranges, materials, metadata)
<id>.bin  : little-endian arrays, each 4-byte aligned
"""
import json
import os

import numpy as np


class Pack:
    def __init__(self):
        self.chunks = []
        self.size = 0

    def add(self, arr, dtype):
        a = np.ascontiguousarray(np.asarray(arr), dtype=dtype)
        b = a.tobytes()
        off = self.size
        pad = (-len(b)) % 4
        self.chunks.append(b + b'\0' * pad)
        self.size += len(b) + pad
        return {'offset': off, 'count': int(a.size), 'type': {np.float32: 'f32', np.uint16: 'u16', np.uint32: 'u32', np.uint8: 'u8', np.int16: 'i16'}[dtype]}

    def bytes(self):
        return b''.join(self.chunks)


def write_character(path_noext, header, meshes):
    """meshes: list of dicts {name, kind, material, attrs: {name: (array, itemSize, dtype)}, index: array, morphs: {name: array}}"""
    pk = Pack()
    out = []
    for m in meshes:
        e = {k: v for k, v in m.items() if k not in ('attrs', 'index', 'morphs')}
        e['attrs'] = {}
        for an, (arr, item, dt) in m['attrs'].items():
            d = pk.add(arr, dt)
            d['itemSize'] = item
            if dt in (np.uint8, np.uint16, np.int16) and an in ('skinWeight', 'color', 'aux'):
                d['normalized'] = True
            e['attrs'][an] = d
        idx = np.asarray(m['index'])
        e['index'] = pk.add(idx, np.uint32 if idx.max(initial=0) > 65535 else np.uint16)
        e['morphs'] = {mn: pk.add(arr, np.float32) for mn, arr in (m.get('morphs') or {}).items()}
        e['vertexCount'] = int(len(m['attrs']['position'][0]))
        out.append(e)
    header = dict(header)
    header['meshes'] = out
    header['binBytes'] = pk.size
    os.makedirs(os.path.dirname(path_noext), exist_ok=True)
    with open(path_noext + '.bin', 'wb') as f:
        f.write(pk.bytes())
    with open(path_noext + '.json', 'w') as f:
        json.dump(header, f, separators=(',', ':'))
    return pk.size
