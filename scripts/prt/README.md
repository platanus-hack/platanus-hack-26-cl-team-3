# Chilean vehicle lookup

The API uses a read-only SQLite snapshot outside the APK. The bundled manifest identifies the 72 monthly RA1, RA2 and RB archives published for November 2024 through October 2026 by URL and SHA-256. The import needs Python 3.11 or later, disk for the source archives and staging database, and network access for uncached archives. [Official inspection archives](https://www.prt.cl/Descargas/index.html)

From the repository root:

```sh
python3 -m venv .venv-prt
.venv-prt/bin/pip install openpyxl==3.1.5
.venv-prt/bin/python scripts/prt/test_import_vehicles.py
.venv-prt/bin/python scripts/prt/import_vehicles.py --cache /path/to/prt-archives --output api/data/vehicles.sqlite
```

The importer verifies each source, selects one description per normalized plate, checks SQLite integrity, and publishes only a completed snapshot to a fresh output path. It prefers the most recent inspection that names a model. A record whose date falls after its archive month retains its archive provenance and has an empty inspection date. Conflicting descriptions are kept in their original archives. This snapshot contains vehicles seen in the imported inspections. An absent plate returns HTTP 404.

Run the API normally with Node 22.13 or later. Compose mounts `api/data` read-only. To serve an existing external snapshot named `vehicles.sqlite`, set `PRT_DATA_DIR` to its directory before starting the API. For a subsequent revision, build to a separate directory and verify that the new database still contains the previously served plates before switching it into service.

`GET /api/vehicles/{plate}` returns the normalized plate, make, model and manufacturing year. Missing fields are null. The API returns HTTP 400 for an invalid plate and HTTP 503 when the snapshot cannot be opened. The Android app sends only the plate and requires confirmation before selecting the returned vehicle.
