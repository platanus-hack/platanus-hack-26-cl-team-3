# Chilean vehicle lookup

The API uses a read-only SQLite snapshot outside the APK. The bundled manifest identifies the 72 monthly RA1, RA2 and RB archives published for November 2024 through October 2026 by URL and SHA-256. The import needs Python 3.11 or later, disk for the source archives and staging database, and network access for uncached archives. [Official inspection archives](https://www.prt.cl/Descargas/index.html)

### Automatic seed on deployment

Starting the stack with `docker compose up -d --build` starts the seed service, including when targeting just `api`. On the first deployment it reuses a verified two-year snapshot from `PRT_DATA_DIR` if one is present. Otherwise it downloads the pinned public PRT archives and builds the database on the deployment host. Allow time and disk for the first import, including the compressed archives, temporary workbooks, staging database and finished snapshot. `docker compose logs -f prt-seed` shows import progress by archive.

The seed is published atomically to the persistent `prt-seed` volume after checking all 72 source identities and hashes, 16,305,103 inspections, 6,825,264 unique plates and SQLite integrity. A concurrent or restarted job reuses the completed snapshot. A failed download retries using the verified archive cache. The API mounts the volume read-only. Existing records in the original host-supplied database take precedence. Other API routes and existing lookups remain available while the seed is being built. Until it is ready, requests that need the seed return HTTP 503.

On this public repository, GitHub-hosted CI tests the seed on pull requests and pushes to `main`. If the production host already follows pushes to `main`, its normal Compose rollout starts the seed. For a host that accepts an HTTPS deployment callback, set the GitHub Actions secret `COMPOSE_DEPLOY_HOOK_URL` to its authenticated, repo-scoped POST URL. After successful GitHub-hosted verification, the workflow checks that the revision is still the head of `main` and posts JSON with `repository`, `ref`, and `after` (commit SHA). The receiver must apply the matching Compose revision; a 2xx response only acknowledges the request. Configure one trigger to avoid duplicate rollouts. Without an external main subscription or a configured hook the workflow verifies the revision only. Keep the volume when recreating the stack.

### Building a snapshot manually

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
