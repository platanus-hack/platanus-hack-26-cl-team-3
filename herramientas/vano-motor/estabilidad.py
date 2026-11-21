"""Mide qué tan estable es la máscara del vano cuando la cámara se mueve (video real, 5 cuadros por segundo).

Uso: python -I estabilidad.py nombre=decodificador.safetensors[,nombre2=...] video.mp4[@inicio[@duración[@filtro_ffmpeg]]] ...
Por cada video: IoU medio entre máscaras consecutivas (0,2 s; 1 = no cambia) y % de cuadros con vano detectado.
"""
import subprocess, sys
import numpy as np, torch
from safetensors import safe_open
from transformers import CLIPSegForImageSegmentation

torch.set_num_threads(4)
REV = "999e0328d9e10b484360c477313983f9afdd7050"
model = CLIPSegForImageSegmentation.from_pretrained("CIDAS/clipseg-rd64-refined", revision=REV).eval()
CAPAS = [i + 1 for i in model.extract_layers]
MEDIA = np.array([0.485, 0.456, 0.406], np.float32); DESV = np.array([0.229, 0.224, 0.225], np.float32)
decs = {}
for par in sys.argv[1].split(","):
    nombre, archivo = par.split("=")
    with safe_open(archivo, "pt") as f:
        decs[nombre] = ({k[8:]: f.get_tensor(k) for k in f.keys() if k.startswith("decoder.")}, f.get_tensor("cond"))

for spec in sys.argv[2:]:
    p = spec.split("@"); video = p[0]; ss = p[1] if len(p) > 1 and p[1] else "0"; dur = p[2] if len(p) > 2 and p[2] else "10"
    vf = (p[3] + "," if len(p) > 3 else "") + "fps=5,scale=352:352"
    crudo = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", ss, "-t", dur, "-i", video, "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           capture_output=True, check=True).stdout
    cuadros = np.frombuffer(crudo, np.uint8).reshape(-1, 352, 352, 3)
    mascaras = {n: [] for n in decs}
    with torch.no_grad():
        for c in cuadros:
            x = torch.from_numpy(((c.astype(np.float32) / 255 - MEDIA) / DESV).transpose(2, 0, 1))[None]
            o = model.clip.get_image_features(pixel_values=x, output_hidden_states=True); acts = [o.hidden_states[i] for i in CAPAS]
            for n, (estado, cond) in decs.items():
                model.decoder.load_state_dict(estado)
                mascaras[n].append((model.decoder(acts, cond).logits.view(352, 352) > 0).numpy())
    print(f"{video.split('/')[-1]} ({len(cuadros)} cuadros):")
    for n, ms in mascaras.items():
        ious = [1.0 if not (a | b).any() else (a & b).sum() / (a | b).sum() for a, b in zip(ms, ms[1:])]
        print(f"  {n:9s} IoU entre cuadros consecutivos {np.mean(ious):.3f} (mínimo {np.min(ious):.2f}) | con vano (≥4 % del cuadro): {np.mean([m.mean() >= 0.04 for m in ms]):.0%}")
