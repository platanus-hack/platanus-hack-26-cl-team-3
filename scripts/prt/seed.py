"""Populate the persistent lookup volume once, without modifying a host database."""
from contextlib import closing
import fcntl
import os
import shutil
import sqlite3
from pathlib import Path

import import_vehicles

PLATES = 6_825_264
INSPECTIONS = 16_305_103


def verify(path, manifest, plates, inspections):
    with closing(sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)) as db:
        sources = db.execute("SELECT sha256, url FROM sources").fetchall()
        if sorted(sources) != sorted(manifest):
            raise ValueError("The inspection archives differ from the seed manifest")
        if db.execute("SELECT SUM(inspections) FROM sources").fetchone()[0] != inspections:
            raise ValueError("Incomplete inspection history")
        if db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0] != plates:
            raise ValueError("Incomplete plate index")
        if db.execute("PRAGMA quick_check").fetchone() != ("ok",) or db.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Invalid vehicle snapshot")


def seed(directory, existing, manifest, plates, inspections):
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "vehicles.sqlite"
    with (directory / ".seed.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if target.exists():
            verify(target, manifest, plates, inspections)
            print("Verified existing seed", flush=True)
            return
        # This directory belongs exclusively to the seeder. A killed import can leave staging files.
        stage = directory / ".building"
        if stage.exists():
            shutil.rmtree(stage)
        stage.mkdir()
        staged = stage / "vehicles.sqlite"
        cache = directory / ".archives"
        try:
            if existing.is_file():
                # Take a consistent copy, including transactions still in SQLite's WAL.
                try:
                    with closing(sqlite3.connect(f"{existing.resolve().as_uri()}?mode=ro", uri=True)) as src:
                        with closing(sqlite3.connect(staged)) as dst:
                            src.backup(dst)
                            # The read-only API volume must not require WAL sidecars.
                            dst.execute("PRAGMA journal_mode=DELETE")
                    verify(staged, manifest, plates, inspections)
                except (sqlite3.Error, ValueError):
                    staged.unlink(missing_ok=True)
            if not staged.exists():
                import_vehicles.build(cache, staged)
                verify(staged, manifest, plates, inspections)
            os.link(staged, target)
            print(f"Published {plates:,} plates", flush=True)
        finally:
            shutil.rmtree(stage)
        if cache.exists():
            shutil.rmtree(cache)


if __name__ == "__main__":
    entries = [tuple(line.split()) for line in import_vehicles.MANIFEST.read_text().splitlines()]
    seed(Path("/seed"), Path("/existing/vehicles.sqlite"), entries, PLATES, INSPECTIONS)
