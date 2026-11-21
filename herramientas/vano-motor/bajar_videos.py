"""Baja los videos de videos.json (YouTube, 360p, primeros 5 min) y extrae los cuadros anotados a <datos>/video/.

Uso: python3 herramientas/vano-motor/bajar_videos.py <datos>      (necesita yt-dlp y ffmpeg)
Los videos son de sus autores: se usan solo para entrenar y medir; NO se suben al repositorio.
"""
import json, os, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
datos = sys.argv[1]
v = json.load(open(f"{AQUI}/videos.json"))
os.makedirs(f"{datos}/videos", exist_ok=True); os.makedirs(f"{datos}/video", exist_ok=True)
for vid in list(v["videos"]) + list(v.get("solo_estabilidad", {})):
    destino = f"{datos}/videos/{vid}.mp4"
    if os.path.exists(destino): continue
    subprocess.run(["yt-dlp", "--no-update", "-q", "-f", "bv*[height<=360][ext=mp4]/bv*[height<=360]/b[height<=360]",
                    "--download-sections", "*0-300", "--force-keyframes-at-cuts", "--merge-output-format", "mp4",
                    "-o", f"{datos}/videos/{vid}.%(ext)s", f"https://www.youtube.com/watch?v={vid}"], check=True)
for nombre, c in v["cuadros"].items():
    destino = f"{datos}/video/{nombre}"
    if os.path.exists(destino): continue
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(c["t"]), "-i", f"{datos}/videos/{c['video']}.mp4", "-frames:v", "1",
                    "-vf", "scale='if(gt(iw,ih),640,-2)':'if(gt(iw,ih),-2,640)'", "-q:v", "3", destino], check=True)
print(len(v["cuadros"]), "cuadros en", f"{datos}/video")
