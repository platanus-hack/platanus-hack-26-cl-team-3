"""Entrena el decodificador de CLIPSeg (CLIP congelado) para segmentar el VANO DEL MOTOR (todo lo que hay bajo el capó).

Uso (desde capo-ar/, con el venv de requisitos.txt):
  python -I herramientas/vano-motor/entrenar.py <fotos> <modo: eval|final> <salida.safetensors>
    <fotos>: carpeta con pos/ (las fotos de indice.txt) y neg/ (fotos sin capó abierto, máscara vacía).
    eval : separa 6 fotos anotadas y mide contra CLIPSeg sin entrenar (IoU de máscara, vista completa y recortes).
    final: entrena con todas las fotos anotadas.
  CAPO_REFERENCIA=foto.webp agrega a la medición la foto de referencia del equipo (nunca se usa para entrenar).

Anotaciones: poligonos.json (coordenadas 0-10 sobre ancho y alto de cada foto de indice.txt): la ABERTURA del vano,
sin la tapa del capó, la pintura exterior de los guardabarros ni la parrilla; si el vano sigue fuera del cuadro,
el polígono va por el borde de la imagen.
"""
import json, os, random, sys, time
import cv2, numpy as np, torch
from PIL import Image
from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor

torch.set_num_threads(4); random.seed(0); np.random.seed(0); torch.manual_seed(0)
DATOS, MODO, SALIDA = sys.argv[1], sys.argv[2], sys.argv[3]
AQUI = os.path.dirname(os.path.abspath(__file__))
REV = "999e0328d9e10b484360c477313983f9afdd7050"
LADO = 352
MEDIA = np.array([0.485, 0.456, 0.406], np.float32); DESV = np.array([0.229, 0.224, 0.225], np.float32)
proc = CLIPSegProcessor.from_pretrained("CIDAS/clipseg-rd64-refined", revision=REV)
model = CLIPSegForImageSegmentation.from_pretrained("CIDAS/clipseg-rd64-refined", revision=REV).eval()
for p in model.clip.parameters(): p.requires_grad_(False)
CAPAS = [i + 1 for i in model.extract_layers]

# Foto de referencia del equipo (garaje, 843×576) con su polígono de 5 esquinas; opcional.
REF_IMG = os.environ.get("CAPO_REFERENCIA")
REF_POL = (np.array([(433, 80), (825, 250), (585, 548), (233, 548), (150, 233)], np.float32) * [843 / 838, 576 / 564]).tolist()

indice = {l.split()[0]: l.split()[1] for l in open(f"{AQUI}/indice.txt")}
pol = json.load(open(f"{AQUI}/poligonos.json"))
VAL = {"2", "9", "17", "21", "25", "29"} if MODO == "eval" else set()

def cargar(ruta, poligono_px):
    im = np.array(Image.open(ruta).convert("RGB"))
    m = np.zeros(im.shape[:2], np.uint8)
    if poligono_px is not None: cv2.fillPoly(m, [np.array(poligono_px, np.int32)], 1)
    return im, m

def a_pixeles(k):
    ruta = f"{DATOS}/pos/{indice[k]}"; w, h = Image.open(ruta).size
    return ruta, [(x * w / 10, y * h / 10) for x, y in pol[k]]

def aumentar(im, m, rng, completa=False):
    h, w = m.shape
    if not completa:  # recorte aleatorio: simula enfocar solo una parte (vistas parciales) y otras proporciones
        area = rng.uniform(0.3, 1.0); asp = np.exp(rng.uniform(np.log(0.6), np.log(1.7)))
        cw = int(min(w, np.sqrt(area * w * h * asp))); ch = int(min(h, np.sqrt(area * w * h / asp)))
        x0 = rng.integers(0, w - cw + 1); y0 = rng.integers(0, h - ch + 1)
        im, m = im[y0:y0 + ch, x0:x0 + cw], m[y0:y0 + ch, x0:x0 + cw]
        ang = rng.uniform(-10, 10)
        if abs(ang) > 1:
            R = cv2.getRotationMatrix2D((im.shape[1] / 2, im.shape[0] / 2), ang, 1.0)
            im = cv2.warpAffine(im, R, im.shape[1::-1], borderMode=cv2.BORDER_REFLECT)
            m = cv2.warpAffine(m, R, m.shape[1::-1], flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_REFLECT)
        if rng.random() < 0.5: im, m = im[:, ::-1], m[:, ::-1]
        im = im.astype(np.float32) * rng.uniform(0.75, 1.25) + rng.uniform(-20, 20)
        gris = im.mean(2, keepdims=True); im = gris + (im - gris) * rng.uniform(0.7, 1.3)
        im = np.clip(im, 0, 255).astype(np.uint8)
    # La app aplasta el cuadro completo de la cámara a 352×352 (sin recortar): aquí igual.
    x = cv2.resize(np.ascontiguousarray(im), (LADO, LADO), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    y = cv2.resize(np.ascontiguousarray(m), (LADO, LADO), interpolation=cv2.INTER_NEAREST).astype(np.float32)
    return ((x - MEDIA) / DESV).transpose(2, 0, 1), y

@torch.no_grad()
def activaciones(x):
    o = model.clip.get_image_features(pixel_values=torch.from_numpy(x)[None], output_hidden_states=True)
    return [o.hidden_states[i][0].half() for i in CAPAS]

def norm(v):
    v = getattr(v, "pooler_output", v); return v / v.norm(dim=-1, keepdim=True)

# --- datos ---
t0 = time.time(); rng = np.random.default_rng(0)
muestras = []  # (activaciones fp16, máscara)
for k in sorted(pol, key=int):
    if k in VAL: continue
    im, m = cargar(*a_pixeles(k))
    for a in range(10):
        x, y = aumentar(im, m, rng, completa=(a == 0)); muestras.append((activaciones(x), torch.from_numpy(y).half()))
negs = sorted(os.listdir(f"{DATOS}/neg")); rng.shuffle(negs); n_neg = 0
for f in negs:
    if n_neg >= 40: break
    try: im, m = cargar(f"{DATOS}/neg/{f}", None)
    except Exception: continue
    for a in range(2):
        x, y = aumentar(im, m, rng, completa=(a == 0)); muestras.append((activaciones(x), torch.from_numpy(y).half()))
    n_neg += 1
print(f"{len(muestras)} muestras de entrenamiento en {time.time() - t0:.0f} s", flush=True)

# --- entrenamiento: decodificador + vector condicional ---
with torch.no_grad():
    textos = ["a car engine", "the engine compartment of a car", "engine bay under the open hood", "car engine parts, hoses and fluid reservoirs"]
    cond0 = norm(model.clip.get_text_features(**proc(text=textos, return_tensors="pt", padding=True))).mean(0, keepdim=True)
cond = torch.nn.Parameter(cond0.clone())
dec_inicial = {k: v.clone() for k, v in model.decoder.state_dict().items()}
opt = torch.optim.AdamW([{"params": model.decoder.parameters(), "lr": 5e-4}, {"params": [cond], "lr": 5e-3}], weight_decay=1e-4)
EPOCAS, LOTE = 25, 12
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, EPOCAS * ((len(muestras) + LOTE - 1) // LOTE))
model.decoder.train()
for ep in range(EPOCAS):
    random.shuffle(muestras); total = 0
    for i in range(0, len(muestras), LOTE):
        lote = muestras[i:i + LOTE]
        acts = [torch.stack([s[0][j] for s in lote]).float() for j in range(len(CAPAS))]
        y = torch.stack([s[1] for s in lote]).float()
        lg = model.decoder(acts, cond.expand(len(lote), -1)).logits.view(len(lote), LADO, LADO)
        p = torch.sigmoid(lg)
        dice = 1 - (2 * (p * y).sum((1, 2)) + 1) / (p.sum((1, 2)) + y.sum((1, 2)) + 1)
        loss = torch.nn.functional.binary_cross_entropy_with_logits(lg, y) + 0.5 * dice.mean()
        opt.zero_grad(); loss.backward(); opt.step(); sched.step(); total += loss.item() * len(lote)
    print(f"época {ep + 1}: pérdida {total / len(muestras):.4f}", flush=True)
model.decoder.eval()

# --- evaluación ---
def iou(a, b): return (a & b).sum() / max((a | b).sum(), 1)

@torch.no_grad()
def predecir(x, c, relativo):
    o = model.clip.get_image_features(pixel_values=torch.from_numpy(x)[None], output_hidden_states=True)
    p = torch.sigmoid(model.decoder([o.hidden_states[i] for i in CAPAS], c).logits.view(LADO, LADO)).numpy()
    return p >= (0.5 * p.max() if relativo else 0.5)

def evaluar(nombre, im, m):
    rng2 = np.random.default_rng(123); filas = []
    for a in range(4):  # vista completa + 3 recortes parciales fijos
        x, y = aumentar(im, m, rng2, completa=(a == 0)); y = y.astype(bool)
        nuevo = predecir(x, cond.detach(), False)
        dec_ent = {k: v.clone() for k, v in model.decoder.state_dict().items()}
        model.decoder.load_state_dict(dec_inicial); base = predecir(x, cond0, True); model.decoder.load_state_dict(dec_ent)
        filas.append((iou(base, y), iou(nuevo, y)))
    f = np.array(filas); print(f"  {nombre:28s} completa: base {f[0,0]:.2f} → entrenado {f[0,1]:.2f} | recortes: base {f[1:,0].mean():.2f} → entrenado {f[1:,1].mean():.2f}")
    return f

print("Evaluación (IoU de máscara; base = CLIPSeg sin entrenar con umbral relativo):")
res = [evaluar("REFERENCIA del equipo", *cargar(REF_IMG, REF_POL))] if REF_IMG else []
for k in sorted(VAL, key=int): res.append(evaluar(f"#{k} {indice[k][:20]}", *cargar(*a_pixeles(k))))
r = np.array(res)
if len(r): print(f"  PROMEDIO completa: base {r[:,0,0].mean():.2f} → entrenado {r[:,0,1].mean():.2f} | recortes: base {r[:,1:,0].mean():.2f} → entrenado {r[:,1:,1].mean():.2f}")
from safetensors.torch import save_file
save_file({**{f"decoder.{k}": v.contiguous() for k, v in model.decoder.state_dict().items()}, "cond": cond.detach().contiguous()}, SALIDA, metadata={"revision": REV})
print("guardado", SALIDA)
