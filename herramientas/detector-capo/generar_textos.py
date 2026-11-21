"""Genera app/src/detector/textos-clip.json: los vectores de texto de CLIP para el detector de capó abierto.

El detector compara cada imagen de la cámara con estas descripciones (zero-shot). La app solo lleva el codificador de
imagen; los vectores de texto se calculan una vez aquí y se guardan en el JSON.

Uso (desde capo-ar/):
    python3 -m venv /tmp/venv-clip && /tmp/venv-clip/bin/pip install onnxruntime numpy tokenizers
    /tmp/venv-clip/bin/python -I herramientas/detector-capo/generar_textos.py

Si cambias las descripciones, vuelve a correr evaluar.py y anota el resultado en el README de esta carpeta.
"""
import hashlib, json, os, sys, urllib.request
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
SALIDA = os.path.join(RAIZ, "app", "src", "detector", "textos-clip.json")
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "capo-ar", "clip")

# Modelo: OpenAI CLIP ViT-B/32 (licencia MIT), exportado a ONNX por Xenova. Revisión fijada.
REPO = "Xenova/clip-vit-base-patch32"
REVISION = "6b7c523703ae26e39be4b03774966f8571c7f523"
ARCHIVOS = {
    "onnx/text_model.onnx": "3f6571f5bad13a97c469c1622e1cfc4d9aef78b79fdbfcff804ca357bfada8cc",
    "tokenizer.json": "f7f3b7af117d467b58374797691a6438d3e6b9e9cef800dfd5dced7f697a90cd",
}

# Descripciones. Las POSITIVAS suman la probabilidad de «capó abierto»; las NEGATIVAS son distractores habituales
# (lo que suele aparecer al apuntar el teléfono a un auto o a su alrededor).
POSITIVAS = [
    "a photo of a car engine bay with the hood open",
    "an open car hood showing the engine",
    "a close-up photo of a car engine under the hood",
    "a photo of the engine compartment of a car",
]
NEGATIVAS = [
    "a photo of a car with the hood closed", "a photo of the front of a car", "a photo of a car parked on the street",
    "a photo of a car dashboard", "a photo of a car interior", "a photo of an open car trunk", "a photo of a car wheel",
    "a photo of a street", "a photo of a parking lot", "a photo of a room", "a photo of a person", "a photo of a building",
    "a photo of a train or bus", "a photo of an industrial machine", "a blurry photo", "a photo of the ground",
]


def bajar(ruta: str, sha: str) -> str:
    destino = os.path.join(CACHE, REVISION, ruta)
    if not os.path.exists(destino):
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        url = f"https://huggingface.co/{REPO}/resolve/{REVISION}/{ruta}"
        print("bajando", url, file=sys.stderr)
        urllib.request.urlretrieve(url, destino + ".parcial")
        os.replace(destino + ".parcial", destino)
    h = hashlib.sha256(open(destino, "rb").read()).hexdigest()
    if h != sha:
        sys.exit(f"ERROR: {ruta} tiene sha256 {h}, se esperaba {sha}")
    return destino


def vectores_texto(frases: list[str]) -> np.ndarray:
    tok = Tokenizer.from_file(bajar("tokenizer.json", ARCHIVOS["tokenizer.json"]))
    sesion = ort.InferenceSession(bajar("onnx/text_model.onnx", ARCHIVOS["onnx/text_model.onnx"]))
    fin = tok.token_to_id("<|endoftext|>")
    ids = [tok.encode(f).ids for f in frases]
    largo = max(map(len, ids))
    entrada = np.array([i + [fin] * (largo - len(i)) for i in ids], dtype=np.int64)
    v = sesion.run(None, {"input_ids": entrada})[0]
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def main() -> None:
    v = vectores_texto(POSITIVAS + NEGATIVAS)
    datos = {
        "modelo": f"{REPO}@{REVISION} (OpenAI CLIP ViT-B/32, MIT)",
        "generado_por": "herramientas/detector-capo/generar_textos.py",
        "escala_logit": 100.0,
        "positivas": POSITIVAS,
        "negativas": NEGATIVAS,
        # Fila i = vector normalizado de (POSITIVAS + NEGATIVAS)[i]. 5 decimales bastan (error < 1e-4 en el coseno).
        "vectores": [[round(float(x), 5) for x in fila] for fila in v],
    }
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w") as f:
        json.dump(datos, f, separators=(",", ":"), ensure_ascii=False)
    print(f"escrito {SALIDA} ({len(v)} descripciones)")


if __name__ == "__main__":
    main()
