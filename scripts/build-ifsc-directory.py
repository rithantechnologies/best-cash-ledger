#!/usr/bin/env python3
"""Build the customer bank/branch directory from Razorpay's RBI-derived IFSC.csv release.

Usage: python3 scripts/build-ifsc-directory.py IFSC.csv apps/api/data/ifsc-branches.v2.0.62.json.gz
Dataset source: https://github.com/razorpay/ifsc/releases
Refresh periodically; staff can manually enter codes missing from the published dataset.
"""
import csv
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path


def build(source: Path, destination: Path) -> None:
    directory = defaultdict(list)
    seen = set()
    with source.open(newline="", encoding="utf-8-sig") as csv_file:
        for row in csv.DictReader(csv_file):
            bank = (row.get("BANK") or "").strip()
            code = (row.get("IFSC") or "").strip().upper()
            if not bank or not code or (bank, code) in seen:
                continue
            seen.add((bank, code))
            directory[bank].append([
                code,
                (row.get("BRANCH") or "").strip(),
                (row.get("CITY") or "").strip(),
                (row.get("STATE") or "").strip(),
            ])
    result = {bank: sorted(rows, key=lambda entry: (entry[2], entry[1], entry[0]))
              for bank, rows in sorted(directory.items())}
    destination.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(result, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    with destination.open("wb") as out:
        with gzip.GzipFile(filename="", mode="wb", fileobj=out, compresslevel=9, mtime=0) as compressed:
            compressed.write(content)
    print(f"{len(result)} banks, {sum(map(len, result.values()))} IFSC branches -> {destination}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build-ifsc-directory.py INPUT_IFSC_CSV OUTPUT_GZ")
    build(Path(sys.argv[1]), Path(sys.argv[2]))
