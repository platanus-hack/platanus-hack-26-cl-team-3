import os, sys
from PIL import Image, ImageDraw
carpeta, salida = sys.argv[1], sys.argv[2]
fs = sorted(f for f in os.listdir(carpeta))
idx = []
W = 480
for k in range(0, len(fs), 4):
    hoja = Image.new("RGB", (2 * W, 2 * W), "white")
    for j, f in enumerate(fs[k:k + 4]):
        im = Image.open(os.path.join(carpeta, f)).convert("RGB")
        im.thumbnail((W - 30, W - 30)); w, h = im.size
        c = Image.new("RGB", (W, W), "white"); c.paste(im, (24, 20)); d = ImageDraw.Draw(c)
        for i in range(11):
            x = 24 + i * w / 10; y = 20 + i * h / 10
            col = (255, 255, 0) if i % 5 == 0 else (0, 255, 255)
            d.line([(x, 20), (x, 20 + h)], fill=col, width=1); d.line([(24, y), (24 + w, y)], fill=col, width=1)
            d.text((x - 4, 6), str(i), fill="black"); d.text((6, y - 5), str(i), fill="black")
        d.text((30, 20 + h + 2), f"#{k + j}", fill="red")
        hoja.paste(c, ((j % 2) * W, (j // 2) * W)); idx.append(f"{k + j} {f} {Image.open(os.path.join(carpeta, f)).size}")
    hoja.save(f"{salida}/hoja_{k // 4:02d}.jpg", quality=88)
open(f"{salida}/indice.txt", "w").write("\n".join(idx))
print(len(fs), "fotos")
