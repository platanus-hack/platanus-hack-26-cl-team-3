import json, os, sys
from PIL import Image, ImageDraw
S = sys.argv[1]; idx = {l.split()[0]: l.split()[1] for l in open(f"{S}/anotar/indice.txt")}
pol = json.load(open(f"{S}/anotar/poligonos.json")); W = 240; cols = 6; ks = sorted(pol, key=int)
hoja = Image.new("RGB", (cols * W, ((len(ks) + cols - 1) // cols) * W), "white")
for n, k in enumerate(ks):
    im = Image.open(f"{S}/fotos/pos/{idx[k]}").convert("RGB"); im.thumbnail((W - 6, W - 20)); w, h = im.size
    capa = im.copy(); d = ImageDraw.Draw(capa, "RGBA"); pts = [(x * w / 10, y * h / 10) for x, y in pol[k]]
    d.polygon(pts, fill=(255, 90, 90, 90), outline=(255, 0, 0, 255))
    for p in pts: d.ellipse([p[0] - 3, p[1] - 3, p[0] + 3, p[1] + 3], fill=(255, 0, 0))
    ImageDraw.Draw(capa).text((3, 3), f"#{k}", fill=(255, 255, 0)); hoja.paste(capa, ((n % cols) * W, (n // cols) * W))
hoja.save(f"{S}/anotar/control.jpg", quality=85); print(len(ks), "anotadas")
