import hashlib
import sqlite3
import tempfile
import unittest
from datetime import date
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from openpyxl import Workbook

import import_vehicles as importer


class SnapshotTest(unittest.TestCase):
    def test_overlapping_inspections_preserve_known_model_and_unique_plates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            manifest = root / "manifest.txt"
            lines = []
            for period, records in (
                ("2025/1.Jan", [("AB-CD12", "Make", "Earlier", 2020, date(2025, 1, 2)),
                                ("WW2222", "Example", "Only in year one", 2010, date(2025, 1, 3))]),
                ("2026/1.Jan", [("abcd12", "Make", None, 2020, date(2026, 1, 4)),
                                ("BB2345", "Make", "Known", 2021, date(2234, 1, 8))]),
            ):
                year = period[:4]
                archive = root / f"{year}.zip"
                book = Workbook()
                book.active.append(importer.FIELDS)
                for row in records:
                    book.active.append(row)
                workbook = BytesIO()
                book.save(workbook)
                with ZipFile(archive, "w") as zipped:
                    zipped.writestr("inspections.xlsx", workbook.getvalue())
                digest = hashlib.sha256(archive.read_bytes()).hexdigest()
                lines.append(f"{digest}  https://www.prt.cl/Descargas/docs/{period}/{archive.name}")
            manifest.write_text("\n".join(lines))
            output = root / "vehicles.sqlite"
            with patch.object(importer, "MANIFEST", manifest):
                importer.build(root, output)
                with self.assertRaises(FileExistsError):
                    importer.build(root, output)
            with sqlite3.connect(output) as db:
                rows = db.execute("""SELECT plate, model, inspected FROM vehicles v
                    JOIN vehicle_descriptions d ON v.description_id=d.id ORDER BY plate""").fetchall()
            self.assertEqual(rows, [("ABCD12", "Earlier", "2025-01-02"), ("BB2345", "Known", None),
                                    ("WW2222", "Only in year one", "2025-01-03")])


if __name__ == "__main__":
    unittest.main()
