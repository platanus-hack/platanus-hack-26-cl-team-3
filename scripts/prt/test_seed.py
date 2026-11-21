import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from openpyxl import Workbook

import import_vehicles
from seed import seed


class SeedTest(unittest.TestCase):
    def test_retry_reuse_and_existing_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            volume = root / "volume"
            existing = root / "existing.sqlite"
            with sqlite3.connect(existing) as db:
                db.execute("CREATE TABLE legacy(value)")
                db.execute("INSERT INTO legacy VALUES('preserve me')")
            before = existing.read_bytes()
            book = Workbook()
            book.active.append(import_vehicles.FIELDS)
            book.active.append(("ABCD12", "Example", "Test", "2020", 45660))
            xlsx = root / "sample.xlsx"
            book.save(xlsx)
            archive = root / "sample.zip"
            with ZipFile(archive, "w") as output:
                output.write(xlsx, xlsx.name)
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            url = "https://www.prt.cl/Descargas/docs/2025/1.Jan/sample.zip"
            entries = [(digest, url)]
            manifest = root / "manifest"
            manifest.write_text(f"{digest} {url}\n")
            with patch.object(import_vehicles, "MANIFEST", manifest):
                with patch.object(import_vehicles, "fetch_archive", side_effect=OSError("offline")):
                    with self.assertRaises(OSError):
                        seed(volume, existing, entries, 1, 1)
                target = volume / "vehicles.sqlite"
                self.assertFalse(target.exists())
                with patch.object(import_vehicles, "fetch_archive", return_value=archive):
                    seed(volume, existing, entries, 1, 1)
                inode = target.stat().st_ino
                with patch.object(import_vehicles, "build", side_effect=AssertionError("unexpected rebuild")):
                    seed(volume, existing, entries, 1, 1)
                    with sqlite3.connect(target) as writer:
                        writer.execute("PRAGMA journal_mode=WAL")
                        writer.execute("UPDATE vehicle_descriptions SET model='Committed WAL value'")
                        writer.commit()
                        seed(root / "second", target, entries, 1, 1)
                    with sqlite3.connect(root / "second" / "vehicles.sqlite") as copy:
                        self.assertEqual(copy.execute("PRAGMA journal_mode").fetchone(), ("delete",))
                        self.assertEqual(copy.execute("SELECT model FROM vehicle_descriptions").fetchone(), ("Committed WAL value",))
                self.assertEqual(target.stat().st_ino, inode)
                self.assertEqual(existing.read_bytes(), before)
                with self.assertRaises(ValueError):
                    seed(volume, existing, entries, 2, 1)
                self.assertEqual(target.stat().st_ino, inode)


if __name__ == "__main__":
    unittest.main()
