"""
Génère website/src/assets/world-dots.svg : carte du monde « en points » (Atlantique / Sénégal → monde)
à partir de Natural Earth (domaine public) via le paquet npm world-atlas.

    curl -o land.json https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json
    python website/scripts/make-map.py land.json website/src/assets/world-dots.svg

Projection équirectangulaire recadrée : longitude −88…38, latitude 2…62, viewBox 1000×476.
Les mêmes constantes (LON0, LON1, LAT0, LAT1) servent dans index.html pour placer les liaisons.
"""
import json, sys
from PIL import Image, ImageDraw

LON0, LON1, LAT0, LAT1 = -88.0, 38.0, 2.0, 62.0
W = 1000.0
H = W * (LAT1 - LAT0) / (LON1 - LON0)   # ≈ 476
STEP = 5.2                               # pas de la grille de points (unités du viewBox)

topo = json.load(open(sys.argv[1], encoding='utf-8'))
sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
arcs = []
for a in topo['arcs']:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy
        pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)

def ring(idx):
    out = []
    for i in idx:
        pts = arcs[i] if i >= 0 else arcs[~i][::-1]
        out.extend(pts if not out else pts[1:])
    return out

def proj(lon, lat):
    return ((lon - LON0) / (LON1 - LON0) * W, (LAT1 - lat) / (LAT1 - LAT0) * H)

SS = 4  # sur-échantillonnage du masque
mask = Image.new('L', (int(W) * SS // 2, int(H) * SS // 2), 0)
d = ImageDraw.Draw(mask)
for geom in topo['objects']['land']['geometries']:
    polys = geom['arcs'] if geom['type'] == 'MultiPolygon' else [geom['arcs']]
    for poly in polys:
        for k, r in enumerate(poly):
            pts = [proj(lon, lat) for lon, lat in ring(r)]
            pts = [(px * SS / 2, py * SS / 2) for px, py in pts]
            if len(pts) > 2:
                d.polygon(pts, fill=255 if k == 0 else 0)

dots = []
y = STEP / 2
row = 0
while y < H:
    x = STEP / 2 + (STEP / 2 if row % 2 else 0)
    while x < W:
        if mask.getpixel((int(x * SS / 2), int(y * SS / 2))) > 127:
            dots.append((round(x, 1), round(y, 1)))
        x += STEP
    y += STEP * 0.866
    row += 1

path = ''.join(f'M{x:g} {y:g}h.01' for x, y in dots)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:g} {H:.1f}" width="{W:g}" height="{H:.0f}">'
       f'<path d="{path}" fill="none" stroke="#7FB4FF" stroke-width="2.6" stroke-linecap="round"/></svg>')
open(sys.argv[2], 'w', encoding='utf-8').write(svg)
print(len(dots), 'points,', len(svg) // 1024, 'Ko, viewBox', W, round(H, 1))
