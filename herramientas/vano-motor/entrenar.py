"""Entrena el decodificador de CLIPSeg (CLIP congelado) para segmentar el VANO DEL MOTOR (todo lo que hay bajo el capó).

Uso (desde capo-ar/, con el venv de requisitos.txt):
  python -I herramientas/vano-motor/entrenar.py <datos> <modo: eval|final> <salida.safetensors>
    <datos>/pos    fotos de indice.txt (anotadas en poligonos.json)
    <datos>/neg    fotos sin capó abierto (máscara vacía)
    <datos>/video  cuadros de videos de YouTube de videos.json (bajar_videos.py los genera)
    eval : aparta fotos, videos completos (videos.json → "apartados") y la foto de referencia; mide contra CLIPSeg
           sin entrenar y contra el decodificador anterior (CAPO_ANTERIOR=archivo.safetensors).
    final: entrena con todo.
  CAPO_REFERENCIA=foto.webp: foto de referencia del equipo (garaje) con el polígono que marcó el equipo.

Criterio de anotación: la ABERTURA del vano, sin la tapa del capó, la pintura exterior de los guardabarros ni la
parrilla; si el vano sigue fuera del cuadro, el polígono va por el borde de la imagen. Primeros planos tomados desde
dentro del vano = todo el cuadro ("full").
"""
import hashlib, json, os, random, sys, time
import cv2, numpy as np, torch
from PIL import Image
from safetensors import safe_open
from safetensors.torch import save_file
from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor

torch.set_num_threads(4); random.seed(0); np.random.seed(0); torch.manual_seed(0)
DATOS, MODO, SALIDA = sys.argv[1], sys.argv[2], sys.argv[3]
AQUI = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get("CAPO_CACHE", os.path.join(DATOS, ".cache-activaciones"))
REV = "999e0328d9e10b484360c477313983f9afdd7050"
LADO = 352
EPOCAS, LOTE = 20, 12
MEDIA = np.array([0.485, 0.456, 0.406], np.float32); DESV = np.array([0.229, 0.224, 0.225], np.float32)
VAL_FOTOS = {"2", "9", "17", "21", "25", "29"}
REF_IMG = os.environ.get("CAPO_REFERENCIA")
REF_POL = (np.array([(433, 80), (825, 250), (585, 548), (233, 548), (150, 233)], np.float32) * [843 / 838, 576 / 564]).tolist()

proc = CLIPSegProcessor.from_pretrained("CIDAS/clipseg-rd64-refined", revision=REV)
model = CLIPSegForImageSegmentation.from_pretrained("CIDAS/clipseg-rd64-refined", revision=REV).eval()
for p in model.clip.parameters(): p.requires_grad_(False)
CAPAS = [i + 1 for i in model.extract_layers]


def fuentes():
    """Lista de (nombre, ruta, etiqueta, grupo, apartado). etiqueta: polígono en píxeles | 'full' | 'neg'."""
    f = []
    indice = {l.split()[0]: l.split()[1] for l in open(f"{AQUI}/indice.txt")}
    pol = json.load(open(f"{AQUI}/poligonos.json"))
    for k in sorted(pol, key=int):
        ruta = f"{DATOS}/pos/{indice[k]}"; w, h = Image.open(ruta).size
        f.append((f"foto:{indice[k]}", ruta, [(x * w / 10, y * h / 10) for x, y in pol[k]], "fotos", k in VAL_FOTOS))
    negs = sorted(os.listdir(f"{DATOS}/neg")); np.random.default_rng(0).shuffle(negs); n = 0
    for nombre in negs:
        if n >= 40: break
        try: Image.open(f"{DATOS}/neg/{nombre}").verify()
        except Exception: continue
        f.append((f"neg:{nombre}", f"{DATOS}/neg/{nombre}", "neg", "fotos-neg", False)); n += 1
    v = json.load(open(f"{AQUI}/videos.json"))
    for nombre, c in v["cuadros"].items():
        ruta = f"{DATOS}/video/{nombre}"; e = c["etiqueta"]
        if isinstance(e, list):
            w, h = Image.open(ruta).size; e = [(x * w / 10, y * h / 10) for x, y in e]
        f.append((f"video:{nombre}", ruta, e, "videos", c["video"] in v["apartados"]))
    if REF_IMG: f.append(("referencia", REF_IMG, REF_POL, "referencia", True))
    return f


def cargar(ruta, etiqueta):
    im = np.array(Image.open(ruta).convert("RGB")); m = np.zeros(im.shape[:2], np.uint8)
    if etiqueta == "full": m[:] = 1
    elif etiqueta != "neg": cv2.fillPoly(m, [np.array(etiqueta, np.int32)], 1)
    return im, m


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
    return [o.hidden_states[i][0] for i in CAPAS]


def muestras_de(nombre, ruta, etiqueta):
    """Aumentos de una fuente con sus activaciones de CLIP (en caché en disco: son lo caro y no cambian)."""
    archivo = os.path.join(CACHE, hashlib.sha1(nombre.encode()).hexdigest()[:16] + ".pt")
    if os.path.exists(archivo): return torch.load(archivo)
    n = 6 if isinstance(etiqueta, list) else 3 if etiqueta == "full" else 2
    rng = np.random.default_rng(int(hashlib.sha1(nombre.encode()).hexdigest()[:8], 16))
    im, m = cargar(ruta, etiqueta); salida = []
    for a in range(n):
        x, y = aumentar(im, m, rng, completa=(a == 0))
        salida.append(([t.half() for t in activaciones(x)], torch.from_numpy(y).to(torch.uint8)))
    os.makedirs(CACHE, exist_ok=True); torch.save(salida, archivo)
    return salida


def norm(v):
    v = getattr(v, "pooler_output", v); return v / v.norm(dim=-1, keepdim=True)


# ---------------- datos ----------------
t0 = time.time()
todas = fuentes()
entreno = [f for f in todas if not (MODO == "eval" and f[4])]
apartadas = [f for f in todas if MODO == "eval" and f[4]]
muestras = [s for f in entreno for s in muestras_de(*f[:3])]
print(f"{len(entreno)} fuentes → {len(muestras)} muestras de entrenamiento ({time.time() - t0:.0f} s); apartadas: {len(apartadas)}", flush=True)

# ---------------- entrenamiento: decodificador + vector condicional ----------------
with torch.no_grad():
    textos = ["a car engine", "the engine compartment of a car", "engine bay under the open hood", "car engine parts, hoses and fluid reservoirs"]
    cond0 = norm(model.clip.get_text_features(**proc(text=textos, return_tensors="pt", padding=True))).mean(0, keepdim=True)
cond = torch.nn.Parameter(cond0.clone())
dec_inicial = {k: v.clone() for k, v in model.decoder.state_dict().items()}
opt = torch.optim.AdamW([{"params": model.decoder.parameters(), "lr": 5e-4}, {"params": [cond], "lr": 5e-3}], weight_decay=1e-4)
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
    if ep % 5 == 4 or ep == EPOCAS - 1: print(f"época {ep + 1}: pérdida {total / len(muestras):.4f}", flush=True)
model.decoder.eval()
nuevo = ({k: v.clone() for k, v in model.decoder.state_dict().items()}, cond.detach().clone())
save_file({**{f"decoder.{k}": v.contiguous() for k, v in nuevo[0].items()}, "cond": nuevo[1].contiguous()}, SALIDA, metadata={"revision": REV})
print("guardado", SALIDA, flush=True)

# ---------------- evaluación en lo apartado ----------------
if apartadas:
    modelos = {"sin entrenar": (dec_inicial, cond0, True)}
    anterior = os.environ.get("CAPO_ANTERIOR")
    if anterior:
        with safe_open(anterior, "pt") as f:
            modelos["anterior"] = ({k[8:]: f.get_tensor(k) for k in f.keys() if k.startswith("decoder.")}, f.get_tensor("cond"), False)
    modelos["nuevo"] = (nuevo[0], nuevo[1], False)

    @torch.no_grad()
    def mascara(acts, m):
        estado, c, relativo = m
        model.decoder.load_state_dict(estado)
        p = torch.sigmoid(model.decoder([a[None].float() for a in acts], c).logits.view(LADO, LADO)).numpy()
        return p >= (0.5 * p.max() if relativo else 0.5)

    res = {}  # (grupo, tipo, vista) → {modelo: [valores]}
    for nombre, ruta, etiqueta, grupo, _ in apartadas:
        tipo = "pol" if isinstance(etiqueta, list) else etiqueta
        im, m = cargar(ruta, etiqueta); rng = np.random.default_rng(123)
        for a in range(4 if tipo == "pol" else 1):  # vista completa + 3 recortes parciales fijos
            x, y = aumentar(im, m, rng, completa=(a == 0)); y = y.astype(bool); acts = activaciones(x)
            for nm, mod in modelos.items():
                pr = mascara(acts, mod)
                valor = float(pr.mean()) if tipo == "neg" else float((pr & y).sum() / max((pr | y).sum(), 1))
                res.setdefault((grupo, tipo, "completa" if a == 0 else "recortes"), {}).setdefault(nm, []).append(valor)
    print("Evaluación en datos apartados (IoU de máscara; en 'neg', fracción del cuadro marcada: menor es mejor):")
    for (grupo, tipo, vista), r in sorted(res.items()):
        n = len(next(iter(r.values())))
        nota = "  [el anterior SÍ vio estas fotos]" if grupo == "fotos" else ""
        print(f"  {grupo:10s} {tipo:4s} {vista:8s} n={n:2d}: " + " | ".join(f"{nm} {np.mean(v):.2f}" for nm, v in r.items()) + nota)
