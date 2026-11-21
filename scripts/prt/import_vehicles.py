"""Build a new read-only lookup snapshot from the official inspection archives."""
import argparse
import hashlib
import os
import re
import shutil
import sqlite3
import tempfile
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zipfile import ZipFile

FIELDS = ("PPU", "MARCA", "MODELO", "ANO_FABRICACION", "FEC_REVISION")
MANIFEST = Path(__file__).with_name("archives.txt")


def archive_rows(path):
    import openpyxl

    with ZipFile(path) as archive:
        found = False
        for member in archive.namelist():
            if not member.lower().endswith(".xlsx"):
                continue
            with tempfile.TemporaryFile() as local, archive.open(member) as src:
                shutil.copyfileobj(src, local)
                local.seek(0)
                book = openpyxl.load_workbook(local, read_only=True, data_only=True)
                try:
                    for sheet in book:
                        rows = sheet.values
                        header = next(rows, ())
                        if "PPU" not in header:
                            continue
                        found = True
                        columns = [header.index(field) for field in FIELDS]
                        for row in rows:
                            yield tuple(row[i] for i in columns)
                finally:
                    book.close()
        if not found:
            raise ValueError(f"Missing inspection worksheet in {path}")


def clean(value):
    text = " ".join(str(value).split()) if value is not None else ""
    return None if text.upper() in ("", "NULL", "N/A") else text


def inspection_date(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return (date(1899, 12, 30) + timedelta(days=int(value))).isoformat()


def prepare_rows(rows, source, period):
    for plate, make, model, year, inspected in rows:
        if not clean(plate):
            continue
        plate = re.sub(r"[.\s-]", "", str(plate).upper())
        if not re.fullmatch(r"[A-Z0-9]{6}", plate):
            raise ValueError(f"Unexpected plate format in {source}")
        year = clean(year)
        reported = inspection_date(inspected) if inspected else None
        # A date after publication cannot establish the recency of an inspection.
        inspected_on = reported if reported and reported[:7] <= period else None
        yield plate, clean(make), clean(model), int(year) if year and year.isdecimal() else None, inspected_on, source, period


def fetch_archive(cache, url, digest):
    path = cache / url.rsplit("/", 1)[-1]
    if not path.exists():
        with tempfile.NamedTemporaryFile(dir=cache) as tmp:
            with urllib.request.urlopen(url, timeout=180) as response:
                shutil.copyfileobj(response, tmp)
            tmp.flush()
            tmp.seek(0)
            if hashlib.file_digest(tmp, "sha256").hexdigest() != digest:
                raise ValueError(f"Invalid download: {url}")
            os.link(tmp.name, path)
    with path.open("rb") as src:
        if hashlib.file_digest(src, "sha256").hexdigest() != digest:
            raise ValueError(f"Archive checksum mismatch: {path}")
    return path


def build(cache, output, reader=archive_rows):
    cache.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError(f"Choose a fresh output path: {output}")
    with tempfile.TemporaryDirectory(dir=output.parent) as scratch:
        stage = sqlite3.connect(Path(scratch) / "stage.sqlite")
        snapshot = Path(scratch) / "snapshot.sqlite"
        db = sqlite3.connect(snapshot)
        try:
            stage.execute("CREATE TABLE inspections(plate, make, model, year, inspected, source, period)")
            db.executescript("""
                CREATE TABLE sources(id INTEGER PRIMARY KEY, url TEXT NOT NULL, sha256 TEXT NOT NULL, inspections INTEGER NOT NULL);
                CREATE TABLE vehicle_descriptions(id INTEGER PRIMARY KEY, make TEXT, model TEXT, year INTEGER);
                CREATE TABLE vehicles(plate TEXT PRIMARY KEY, description_id INTEGER NOT NULL REFERENCES vehicle_descriptions,
                    inspected TEXT, source_id INTEGER NOT NULL REFERENCES sources) WITHOUT ROWID;
            """)
            for source, entry in enumerate(MANIFEST.read_text().splitlines(), 1):
                digest, url = entry.split()
                path = fetch_archive(cache, url, digest)
                year, month = re.search(r"/docs/(\d{4})/(\d+)\.", url).groups()
                period = f"{year}-{int(month):02d}"
                inserted = stage.executemany(
                    "INSERT INTO inspections VALUES(?,?,?,?,?,?,?)", prepare_rows(reader(path), source, period)
                ).rowcount
                if not inserted:
                    raise ValueError(f"No inspection records in {path}")
                db.execute("INSERT INTO sources VALUES(?,?,?,?)", (source, url, digest, inserted))
                print(path.name, inserted, flush=True)
            # Prefer the newest inspection that actually identifies a model.
            ordered = stage.execute("""SELECT plate, make, model, year, inspected, source FROM inspections
                ORDER BY plate, (model IS NOT NULL) DESC, COALESCE(inspected, period || '-00') DESC, (make IS NOT NULL) DESC,
                (year IS NOT NULL) DESC, source DESC, rowid DESC""")
            previous = None
            descriptions = {}
            for plate, make, model, year, inspected, source in ordered:
                if previous == plate:
                    continue
                previous = plate
                key = (make, model, year)
                if key not in descriptions:
                    descriptions[key] = db.execute(
                        "INSERT INTO vehicle_descriptions(make,model,year) VALUES(?,?,?)", key
                    ).lastrowid
                db.execute("INSERT INTO vehicles VALUES(?,?,?,?)", (plate, descriptions[key], inspected, source))
            db.commit()
            if db.execute("PRAGMA integrity_check").fetchone() != ("ok",) or db.execute("PRAGMA foreign_key_check").fetchone():
                raise ValueError("Lookup database failed its integrity check")
        finally:
            db.close()
            stage.close()
        os.link(snapshot, output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.cache, args.output)
