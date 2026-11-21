import json, os, sys, urllib.parse, urllib.request
UA = {"User-Agent": "capo-ar-eval/0.1 (hackathon prototype)"}
base, n = sys.argv[1], int(sys.argv[2])
for grupo, consulta in [l.split("|", 1) for l in sys.argv[3:]]:
    q = urllib.parse.urlencode({"action": "query", "format": "json", "generator": "search", "gsrsearch": consulta + " filetype:bitmap",
        "gsrnamespace": 6, "gsrlimit": n, "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 400})
    d = json.load(urllib.request.urlopen(urllib.request.Request("https://commons.wikimedia.org/w/api.php?" + q, headers=UA), timeout=30))
    os.makedirs(f"{base}/{grupo}", exist_ok=True)
    for i, p in enumerate((d.get("query") or {}).get("pages", {}).values()):
        u = p["imageinfo"][0].get("thumburl")
        if not u or not u.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png")): continue
        nombre = f"{base}/{grupo}/{consulta.replace(' ','_')[:20]}_{i}.jpg"
        try:
            open(nombre, "wb").write(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read())
        except Exception as e: print("fallo", u, e)
