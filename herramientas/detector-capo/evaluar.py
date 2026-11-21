"""Mide el detector de capó abierto con fotos etiquetadas, imitando el preprocesamiento de la app.

Fotos: una carpeta con subcarpetas pos/ (capó abierto) y neg/ (cualquier otra cosa). Para armar una rápida desde
Wikimedia Commons: bajar_fotos.py (luego REVÍSALAS a mano: la búsqueda trae ruido). Lo mejor: fotos propias del Outback.

Uso (desde capo-ar/, con el venv de generar_textos.py):
    /tmp/venv-clip/bin/pip install pillow
    /tmp/venv-clip/bin/python -I herramientas/detector-capo/evaluar.py /ruta/fotos
    /tmp/venv-clip/bin/python -I herramientas/detector-capo/evaluar.py /ruta/fotos --fp32   # compara con el modelo sin cuantizar
"""
import json, os, sys
import numpy as np
import onnxruntime as ort
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import generar_textos as gt  # noqa: E402

VISION = {
    "int8": ("onnx/vision_model_int8.onnx", "0ab0c1b3ace708e539633af1744d5a95247fe4e14d3e08ff197ef82a6cb9bd93"),
    "fp32": ("onnx/vision_model.onnx", None),
}
MEDIA = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
DESV = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)


def preparar(ruta: str) -> np.ndarray:
    """Igual que la app: recorte cuadrado central → 224×224 → normalización de CLIP, en orden CHW."""
    im = Image.open(ruta).convert("RGB")
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((224, 224), Image.BILINEAR)
    return ((np.asarray(im, np.float32) / 255 - MEDIA) / DESV).transpose(2, 0, 1)


def main() -> None:
    fotos = sys.argv[1]
    variante = "fp32" if "--fp32" in sys.argv else "int8"
    ruta, sha = VISION[variante]
    if sha is None:  # el fp32 solo sirve para comparar; no se fija su hash
        destino = os.path.join(gt.CACHE, gt.REVISION, ruta)
        if not os.path.exists(destino):
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            import urllib.request
            urllib.request.urlretrieve(f"https://huggingface.co/{gt.REPO}/resolve/{gt.REVISION}/{ruta}", destino)
    else:
        destino = gt.bajar(ruta, sha)
    vision = ort.InferenceSession(destino)
    textos = json.load(open(gt.SALIDA))
    T = np.array(textos["vectores"], np.float32)
    n_pos = len(textos["positivas"])

    res = []
    for grupo, y in (("pos", 1), ("neg", 0)):
        for f in sorted(os.listdir(os.path.join(fotos, grupo))):
            try:
                x = preparar(os.path.join(fotos, grupo, f))
            except Exception:
                continue
            e = vision.run(None, {"pixel_values": x[None]})[0][0]
            e /= np.linalg.norm(e)
            z = textos["escala_logit"] * T @ e
            p = np.exp(z - z.max())
            p /= p.sum()
            res.append((float(p[:n_pos].sum()), y, f"{grupo}/{f}"))

    sc = np.array([r[0] for r in res])
    y = np.array([r[1] for r in res])
    print(f"modelo {variante}: {y.sum()} fotos de capó abierto, {(1 - y).sum()} de otras cosas")
    for umbral in (0.4, 0.5, 0.6, 0.7):
        pr = sc >= umbral
        print(f"  umbral {umbral}: aciertos {(pr == (y == 1)).mean():.1%} | capós detectados {(pr & (y == 1)).sum()}/{y.sum()}"
              f" | falsos positivos {(pr & (y == 0)).sum()}/{(1 - y).sum()}")
    for s, et, f in sorted(res):
        if (s >= 0.6) != (et == 1):
            print(f"    error con umbral 0.6: {f} (puntaje {s:.2f})")


if __name__ == "__main__":
    main()
