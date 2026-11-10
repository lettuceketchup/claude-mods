"""Build the compact India basemap embedded in assets/plan-page.html.

One-time build; trips never need it. Inputs (download once):
  datameet/maps States/Admin2.{shp,dbf}  (CC BY 4.0, Survey of India boundaries)
  natural-earth-vector geojson/ne_10m_populated_places_simple.geojson  (public domain)
Usage: python -I build_basemap.py <dir with inputs> <out.js>
Output: one line `window.BASEMAP = {...}`, pasted over the BASEMAP line in the template.
"""
import json, struct, sys, math

TOL = 0.025      # simplification tolerance in degrees (~2.5 km); smaller = more detail, bigger file
MIN_AREA = 0.02  # drop islands smaller than this (deg^2), keeps Andaman and Lakshadweep main islands


def read_dbf_names(path):
    b = open(path, 'rb').read()
    n, hlen, rlen = struct.unpack('<IHH', b[4:12])
    fields, off, pos = [], 1, 32
    while b[pos] != 0x0D:
        name = b[pos:pos + 11].split(b'\0')[0].decode()
        flen = b[pos + 16]
        fields.append((name, off, flen))
        off += flen
        pos += 32
    rows = []
    for i in range(n):
        r = b[hlen + i * rlen: hlen + (i + 1) * rlen]
        rows.append({f: r[o:o + l].decode('utf-8', 'replace').strip() for f, o, l in fields})
    return rows


def read_shp_polygons(path):
    b = open(path, 'rb').read()
    pos, shapes = 100, []
    while pos < len(b):
        _, clen = struct.unpack('>ii', b[pos:pos + 8])
        c = b[pos + 8: pos + 8 + clen * 2]
        pos += 8 + clen * 2
        if struct.unpack('<i', c[:4])[0] != 5:
            shapes.append([])
            continue
        nparts, npts = struct.unpack('<ii', c[36:44])
        parts = list(struct.unpack(f'<{nparts}i', c[44:44 + 4 * nparts])) + [npts]
        p0 = 44 + 4 * nparts
        pts = struct.unpack(f'<{2 * npts}d', c[p0:p0 + 16 * npts])
        shapes.append([[(pts[2 * j], pts[2 * j + 1]) for j in range(parts[k], parts[k + 1])] for k in range(nparts)])
    return shapes


def dp(points, tol):
    """Douglas-Peucker, iterative."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, z = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[z]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy) or 1e-12
        best, bi = -1, -1
        for i in range(a + 1, z):
            x, y = points[i]
            d = abs(dy * (x - x1) - dx * (y - y1)) / L
            if d > best:
                best, bi = d, i
        if best > tol:
            keep[bi] = True
            stack += [(a, bi), (bi, z)]
    return [p for p, k in zip(points, keep) if k]


def area(r):
    return abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))) / 2


def build(src):
    names = read_dbf_names(f'{src}/Admin2.dbf')
    key = next(k for k in names[0] if 'NAME' in k.upper() or 'ST_NM' in k.upper())
    states = []
    for row, rings in zip(names, read_shp_polygons(f'{src}/Admin2.shp')):
        out = []
        biggest = max(rings, key=area)
        for r in rings:
            if area(r) < MIN_AREA and r is not biggest:  # small UTs and islands keep their main piece
                continue
            h = len(r) // 2  # closed ring: start == end, so simplify the two halves separately
            s = dp(r[:h + 1], TOL) + dp(r[h:], TOL)[1:]
            if len(s) >= 4:
                # flat [lat, lon, lat, lon, ...] at 0.01 deg (~1 km)
                out.append([round(v, 2) for x, y in s for v in (y, x)])
        if out:
            states.append([row[key].title(), out])
    gj = json.load(open(f'{src}/ne_10m_populated_places_simple.geojson', encoding='utf-8'))
    cities = []
    for f in gj['features']:
        p = f['properties']
        if p.get('adm0name') == 'India' or p.get('sov0name') == 'India':
            # rank 0 = biggest; shown from wider zooms first
            cities.append([p['name'], round(p['latitude'], 3), round(p['longitude'], 3), int(p.get('scalerank', 10))])
    cities.sort(key=lambda c: c[3])
    return {'states': states, 'cities': cities}


if __name__ == '__main__':
    data = build(sys.argv[1])
    js = 'window.BASEMAP = ' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';'
    open(sys.argv[2], 'w', encoding='utf-8').write(js)
    pts = sum(len(r) // 2 for _, rs in data['states'] for r in rs)
    print(f"{len(data['states'])} states, {pts} points, {len(data['cities'])} cities, {len(js) // 1024} KB")
