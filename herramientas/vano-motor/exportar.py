"""Exporta el modelo del vano del motor a ONNX (int8) y los vectores de texto para «capó abierto».

Uso: python -I exportar.py <decodificador.safetensors> <salida.onnx> <textos.json> <herramientas/detector-capo>
(lo llama scripts/preparar-modelo-vano.sh)
Salidas del ONNX (entrada pixel_values [1,3,352,352], cuadro completo aplastado, normalización ImageNet):
  vano          [1,88,88]  logits del vano del motor (sigmoid > 0,5 = dentro), promediados 4×4 desde 352×352
  image_embeds  [1,512]    vector de imagen de CLIP ViT-B/16 (para el puntaje de «capó abierto»)
"""
import json, sys
import numpy as np, torch
from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor

pt, salida, salida_textos = sys.argv[1:4]
from safetensors import safe_open
with safe_open(pt, "pt") as f:
    REV = f.metadata()["revision"]
    d = {"decoder": {k[len("decoder."):]: f.get_tensor(k) for k in f.keys() if k.startswith("decoder.")}, "cond": f.get_tensor("cond")}
model = CLIPSegForImageSegmentation.from_pretrained("CIDAS/clipseg-rd64-refined", revision=REV).eval()
model.decoder.load_state_dict(d["decoder"])
CAPAS = [i + 1 for i in model.extract_layers]


class Vano(torch.nn.Module):
    def __init__(self):
        super().__init__()
        self.clip, self.decoder = model.clip, model.decoder
        self.register_buffer("cond", d["cond"].float())

    def forward(self, pixel_values):
        o = self.clip.get_image_features(pixel_values=pixel_values, output_hidden_states=True)
        lg = self.decoder([o.hidden_states[i] for i in CAPAS], self.cond).logits.view(1, 1, 352, 352)
        return torch.nn.functional.avg_pool2d(lg, 4).view(1, 88, 88), o.pooler_output


m = Vano().eval()
x = torch.randn(1, 3, 352, 352)
fp32 = salida + ".fp32.tmp"
torch.onnx.export(m, (x,), fp32, input_names=["pixel_values"], output_names=["vano", "image_embeds"], opset_version=17, dynamo=False)

from onnxruntime.quantization import QuantType, quantize_dynamic
# Solo MatMul/Gemm a int8 (el grueso del transformer). Las convoluciones quedan en float: más simple y seguro en el teléfono.
quantize_dynamic(fp32, salida, weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul", "Gemm"])

# Paridad: torch vs ONNX int8
import onnxruntime as ort
with torch.no_grad(): ref_v, ref_e = m(x)
ov, oe = ort.InferenceSession(salida).run(None, {"pixel_values": x.numpy()})
cos = float((ref_e[0] / ref_e[0].norm()) @ torch.from_numpy(oe[0] / np.linalg.norm(oe[0])))
acuerdo = float(((ref_v.numpy() > 0) == (ov > 0)).mean())
print(f"paridad int8: coseno image_embeds {cos:.4f}, acuerdo de máscara {acuerdo:.3f}")

# Vectores de texto para «capó abierto» con la torre de texto de ESTE CLIP (ViT-B/16), mismas descripciones que antes.
sys.path.insert(0, sys.argv[4])
import generar_textos as gt  # herramientas/detector-capo/generar_textos.py
proc = CLIPSegProcessor.from_pretrained("CIDAS/clipseg-rd64-refined", revision=REV)
with torch.no_grad():
    t = model.clip.get_text_features(**proc(text=gt.POSITIVAS + gt.NEGATIVAS, return_tensors="pt", padding=True))
    t = getattr(t, "pooler_output", t); t = t / t.norm(dim=-1, keepdim=True)
json.dump({
    "modelo": f"CIDAS/clipseg-rd64-refined@{REV} (Apache-2.0), CLIP ViT-B/16; decodificador entrenado para el vano del motor",
    "generado_por": "herramientas/vano-motor/exportar.py",
    "escala_logit": 100.0, "positivas": gt.POSITIVAS, "negativas": gt.NEGATIVAS,
    "vectores": [[round(float(v), 5) for v in fila] for fila in t.numpy()],
}, open(salida_textos, "w"), separators=(",", ":"), ensure_ascii=False)
import os
os.remove(fp32)
print("textos:", salida_textos)
