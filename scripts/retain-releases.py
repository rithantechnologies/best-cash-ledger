#!/usr/bin/env python3
"""Conservative Cash Ledger release retention. Dry-run unless --apply is supplied.

Only immutable runtime release directories directly under --root are eligible.
This tool intentionally does not stop processes, remove Git worktrees, or touch
databases/backups. Run during a maintenance window after deployments settle.
"""
from __future__ import annotations

import argparse
import fcntl
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from urllib.request import urlopen

RUNTIME_NAME = re.compile(r"(?:cashledger-[A-Za-z0-9_-]+-(?:runtime|stage)|[0-9a-f]{7,40})\Z")
NEVER_DATA = {"uploads", "upload", "storage", "backups", "backup", "media", "user-data", "user_uploads"}
SCAN_IGNORE = {".git", "node_modules", ".npm", ".cache", "__pycache__"}
DEFAULT_SCAN = ("/home/cashledger", "/var/www/cashledger", "/etc/nginx", "/etc/systemd/system")


def embedded(parent: Path, child: str) -> bool:
    """Check reference to a directory without matching lookalike prefixes."""
    value = str(parent)
    return child == value or child.startswith(value + "/") or child.startswith(value + " (deleted)")


def release_kind(path: Path) -> str | None:
    if path.is_symlink() or not path.is_dir() or (path / ".git").exists():
        return None
    if not RUNTIME_NAME.fullmatch(path.name) or "-source-" in path.name:
        return None
    web, api = (path / "web").is_dir(), (path / "api").is_dir()
    if not (web or api):
        return None
    return "combined" if web and api else "web" if web else "api"


def pins_from_file(path: Path) -> set[str]:
    if not path.is_file() or path.is_symlink():
        return set()
    result = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.partition("#")[0].strip()
        if line:
            if "/" in line or line.startswith("."):
                raise ValueError(f"invalid pin: {line!r}")
            result.add(line)
    return result


def process_references(releases: list[Path]) -> set[str]:
    active: set[str] = set()
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            cmdline = (proc / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
        except (PermissionError, OSError):
            cmdline = ""
        pointers = []
        for key in ("cwd", "exe"):
            try:
                pointers.append(os.readlink(proc / key))
            except (PermissionError, OSError):
                pass
        try:
            fds = list((proc / "fd").iterdir())
        except (PermissionError, OSError):
            fds = []
        for f in fds:
            try:
                pointers.append(os.readlink(f))
            except (PermissionError, OSError):
                pass
        for r in releases:
            if str(r) in cmdline or any(embedded(r, s) for s in pointers):
                active.add(r.name)
    return active


def external_symlink_references(releases: list[Path], scan_roots: list[Path]) -> set[str]:
    protected: set[str] = set()
    for scan_root in scan_roots:
        if not scan_root.is_dir():
            continue
        for folder, dirs, files in os.walk(scan_root, followlinks=False):
            place = Path(folder)
            if place.parent in {p.parent for p in releases} and place in releases:
                dirs.clear()
                continue
            dirs[:] = [d for d in dirs if d not in SCAN_IGNORE and not d.startswith(".next")]
            for name in dirs + files:
                item = place / name
                if not item.is_symlink():
                    continue
                try:
                    resolved = item.resolve(strict=False)
                except (RuntimeError, OSError):
                    continue
                for r in releases:
                    if item == r or item.is_relative_to(r):
                        continue
                    if resolved == r or r in resolved.parents:
                        protected.add(r.name)
    return protected



def configured_references(releases: list[Path]) -> set[str]:
    """Protect directories mentioned literally in installed proxy, service, or cron files."""
    roots = (Path("/etc/nginx"), Path("/etc/systemd/system"), Path("/etc/cron.d"))
    protected: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        for folder, _, files in os.walk(root, followlinks=False):
            for filename in files:
                config = Path(folder) / filename
                try:
                    if config.stat().st_size > 1024 * 1024:
                        continue
                    content = config.read_text(encoding="utf-8", errors="replace")
                except (OSError, PermissionError):
                    continue
                for release in releases:
                    if str(release) in content:
                        protected.add(release.name)
    return protected


def unique_data_guard(path: Path, reference_env: Path | None) -> str | None:
    for folder, dirs, files in os.walk(path, followlinks=False):
        here = Path(folder)
        dirs[:] = [x for x in dirs if x != "node_modules" and not x.startswith(".next")]
        for d in dirs:
            if d.lower() in NEVER_DATA:
                return f"contains protected data directory {str(here / d)}"
        for f in files:
            if f.endswith((".sqlite", ".sqlite3", ".db", ".pem", ".key")):
                return f"contains protected file {str(here / f)}"
            if f == ".env" or f.startswith(".env."):
                env = here / f
                if reference_env is None or not reference_env.is_file():
                    return "contains .env without verified reference"
                if env.read_bytes() != reference_env.read_bytes():
                    return "contains nonmatching .env"
    return None


def kib_size(path: Path) -> int:
    result = subprocess.run(["du", "-sk", "--", str(path)], capture_output=True, text=True, check=True)
    return int(result.stdout.split()[0])


def health(urls: list[str]) -> None:
    for url in urls:
        if not url.startswith(("http://127.0.0.1:", "http://localhost:")):
            raise RuntimeError(f"health URL must use loopback HTTP: {url}")
        with urlopen(url, timeout=6) as res:
            if res.status != 200:
                raise RuntimeError(f"health check failed: {url} -> {res.status}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("/home/cashledger/releases"))
    parser.add_argument("--min-age-days", type=int, default=30)
    parser.add_argument("--keep-latest", type=int, default=3, help="Newest runtime folders per web/api/combined group")
    parser.add_argument("--max-delete", type=int, default=5, help="Maximum directories per apply run")
    parser.add_argument("--pins-file", type=Path, help="One protected folder name per line")
    parser.add_argument("--env-reference", type=Path, help="Existing trusted environment file for comparing copied .env files")
    parser.add_argument("--scan-root", action="append", type=Path, help="Additional paths to scan for references")
    parser.add_argument("--health-url", action="append", default=[], help="Local health endpoints required before and after apply")
    parser.add_argument("--apply", action="store_true", help="Actually delete approved candidates")
    parser.add_argument("--confirm-root", help="Required with --apply; must match --root exactly")
    args = parser.parse_args(argv)
    root = args.root.resolve(strict=True)
    if args.root.is_symlink() or not root.is_dir() or root == Path("/"):
        parser.error("root must be an existing physical releases directory")
    if not 1 <= args.min_age_days <= 3650:
        parser.error("min-age-days must be from 1 to 3650")
    if args.keep_latest < 2 or not 1 <= args.max_delete <= 20:
        parser.error("keep-latest must be >= 2 and max-delete between 1 and 20")
    if args.apply and args.confirm_root != str(root):
        parser.error("--apply requires --confirm-root equal to the resolved --root")
    pins_path = args.pins_file or (root.parent / ".cashledger-release-pins")
    if args.apply and not pins_path.is_file():
        parser.error(f"refusing apply without an explicit pins file: {pins_path}")
    pins = pins_from_file(pins_path)
    print(f"ROOT {root} | {'APPLY' if args.apply else 'DRY RUN'} | pins {len(pins)}")
    lock = root.parent / ".cashledger-release-retention.lock"
    lock_fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("ABORT: another retention job is running", file=sys.stderr)
        return 3

    all_releases = [p for p in root.iterdir() if release_kind(p)]
    all_releases.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    by_group: dict[str, list[Path]] = {}
    for release in all_releases:
        by_group.setdefault(release_kind(release) or "unknown", []).append(release)
    retained = {p.name for group in by_group.values() for p in group[:args.keep_latest]}
    active = process_references(all_releases)
    symlinks = external_symlink_references(all_releases, list(map(Path, DEFAULT_SCAN)) + (args.scan_root or []))
    configured = configured_references(all_releases)
    cutoff = time.time() - args.min_age_days * 86400
    recent_activity = any(p.stat().st_mtime > time.time() - 3600 for p in all_releases)
    env_ref = args.env_reference
    candidates = []
    skipped: dict[str, int] = {}
    for release in all_releases:
        reason = None
        if release.name in pins:
            reason = "pinned"
        elif release.name in active:
            reason = "process reference"
        elif release.name in symlinks:
            reason = "external symlink"
        elif release.name in configured:
            reason = "service/config reference"
        elif release.name in retained:
            reason = "newest rollback set"
        elif release.stat().st_mtime >= cutoff:
            reason = "too young"
        else:
            reason = unique_data_guard(release, env_ref)
        if reason:
            skipped[reason] = skipped.get(reason, 0) + 1
        else:
            candidates.append(release)
    candidates.sort(key=lambda p: p.stat().st_mtime)
    for p in candidates:
        print(f"CANDIDATE {p.name}: {kib_size(p) / 1024:.1f} MiB; age {(time.time() - p.stat().st_mtime)/86400:.1f}d")
    print(f"TOTAL {len(all_releases)} runtime folders, {len(candidates)} candidates; protected: {skipped}")
    if not args.apply:
        print("DRY RUN ONLY. To apply, supply --apply --confirm-root and a valid --pins-file.")
        os.close(lock_fd)
        return 0
    if recent_activity:
        print("ABORT: a release has been modified in the last 60 minutes", file=sys.stderr)
        os.close(lock_fd)
        return 4
    health(args.health_url)
    removed = []
    for p in candidates[:args.max_delete]:
        # Repeat all dynamic safety checks immediately before each deletion.
        if p.is_symlink() or not p.is_dir() or release_kind(p) is None:
            continue
        if p.stat().st_mtime >= cutoff or p.name in pins or p.name in retained:
            continue
        if p.name in process_references([p]):
            continue
        if p.name in external_symlink_references([p], list(map(Path, DEFAULT_SCAN)) + (args.scan_root or [])):
            continue
        if p.name in configured_references([p]):
            continue
        if unique_data_guard(p, env_ref):
            continue
        size = kib_size(p)
        shutil.rmtree(p)
        removed.append(p.name)
        print(f"DELETED {p.name}: {size / 1024:.1f} MiB")
    print(f"DONE deleted {len(removed)} runtime folders")
    health(args.health_url)
    os.close(lock_fd)
    return 0


if __name__ == "__main__":
    sys.exit(main())
