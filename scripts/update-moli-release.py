#!/usr/bin/env python3
"""Pin the latest stable Moli release after verifying both Linux archives."""

from __future__ import annotations

import hashlib
import json
import os
import re
import struct
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "scripts/install-moli.sh"
PACKAGE = ROOT / "package.json"
LOCKFILE = ROOT / "package-lock.json"
README = ROOT / "README.md"
ADR = ROOT / "docs/decisions/ADR-003-moli-chrome-fallback.md"
CHANGELOG = ROOT / "CHANGELOG.md"
API_URL = "https://api.github.com/repos/lexmount/moli/releases/latest"
MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
TARGETS = {
    "amd64": ("moli-x86_64-unknown-linux-gnu.tar.gz", "x86_64-unknown-linux-gnu", 62),
    "arm64": ("moli-aarch64-unknown-linux-gnu.tar.gz", "aarch64-unknown-linux-gnu", 183),
}


def request(url: str) -> bytes:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "888-url2md-moli-updater",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=60) as response:
        return response.read()


def release_version(release: dict) -> tuple[str, tuple[int, int, int]]:
    tag = release.get("tag_name", "")
    match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", tag)
    if not match or release.get("draft") or release.get("prerelease"):
        raise ValueError(f"Latest Moli release has an unsupported tag: {tag!r}")
    return tag, tuple(int(part) for part in match.groups())


def pinned_version(installer: str) -> str:
    matches = re.findall(r"releases/download/(v\d+\.\d+\.\d+)/moli-", installer)
    if len(matches) != 1:
        raise ValueError(f"Expected one pinned Moli release URL, found {len(matches)}")
    return matches[0]


def download_and_verify(url: str, expected_name: str, expected_machine: int,
                        expected_version: str, temporary_dir: Path) -> str:
    archive = temporary_dir / expected_name
    digest = hashlib.sha256()
    req = Request(url, headers={"User-Agent": "888-url2md-moli-updater"})
    with urlopen(req, timeout=180) as response, archive.open("wb") as output:
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_ARCHIVE_BYTES:
            raise ValueError(f"{expected_name} exceeds the archive size limit")
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_ARCHIVE_BYTES:
                raise ValueError(f"{expected_name} exceeds the archive size limit")
            digest.update(chunk)
            output.write(chunk)

    binary = None
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar.getmembers():
            if Path(member.name).name == "moli" and member.isfile():
                binary = tar.extractfile(member)
                break
        if binary is None:
            raise ValueError(f"{expected_name} does not contain a regular moli binary")
        binary_path = temporary_dir / f"moli-{expected_machine}"
        binary_path.write_bytes(binary.read())
    binary_path.chmod(0o755)
    header = binary_path.read_bytes()[:20]
    if len(header) < 20 or header[:4] != b"\x7fELF" or header[4] != 2 or header[5] != 1:
        raise ValueError(f"{expected_name} does not contain a 64-bit little-endian ELF binary")
    machine = struct.unpack("<H", header[18:20])[0]
    if machine != expected_machine:
        raise ValueError(f"{expected_name} has ELF machine {machine}, expected {expected_machine}")
    if expected_machine == 62:
        result = subprocess.run([str(binary_path), "--version"], check=True,
                                capture_output=True, text=True, timeout=30)
        if expected_version not in result.stdout + result.stderr:
            raise ValueError(f"amd64 binary did not report {expected_version}")
    return digest.hexdigest()


def next_calver(current: str) -> str:
    today = datetime.now(timezone.utc).strftime("%Y.%m.%d")
    match = re.fullmatch(r"(\d{4}\.\d{2}\.\d{2})\.(\d+)", current)
    revision = int(match.group(2)) + 1 if match and match.group(1) == today else 1
    return f"{today}.{revision}"


def replace_once(text: str, old: str, new: str, description: str) -> str:
    count = text.count(old)
    if count != 1:
        raise ValueError(f"Expected one {description}, found {count}")
    return text.replace(old, new, 1)


def main() -> None:
    release = json.loads(request(API_URL))
    new_tag, new_version = release_version(release)
    installer = INSTALLER.read_text()
    current_tag = pinned_version(installer)
    baseline_tag = os.environ.get("MOLI_BASELINE_PIN", current_tag)
    baseline_match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", baseline_tag)
    if not baseline_match:
        raise ValueError(f"Invalid Moli baseline pin: {baseline_tag!r}")
    current_version = tuple(int(part) for part in baseline_match.groups())
    pinned_version_tuple = tuple(int(part) for part in current_tag[1:].split("."))
    output_path = os.environ.get("GITHUB_OUTPUT")

    def output(name: str, value: str) -> None:
        if output_path:
            with open(output_path, "a", encoding="utf-8") as handle:
                handle.write(f"{name}={value}\n")

    output("moli_version", new_tag[1:])
    if new_version <= current_version or new_version <= pinned_version_tuple:
        output("changed", "false")
        print(f"No newer stable Moli release: baseline={baseline_tag}, latest={new_tag}")
        return

    asset_names = {asset["name"] for asset in release.get("assets", [])}
    new_checksums: dict[str, str] = {}
    with tempfile.TemporaryDirectory(prefix="moli-release-") as temp:
        temp_path = Path(temp)
        for arch, (asset_name, _target, machine) in TARGETS.items():
            if asset_name not in asset_names:
                raise ValueError(f"Release {new_tag} is missing {asset_name}")
            url = f"https://github.com/lexmount/moli/releases/download/{new_tag}/{asset_name}"
            new_checksums[arch] = download_and_verify(
                url, asset_name, machine, new_tag[1:], temp_path,
            )

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    old_checksums = {
        arch: re.search(rf"(?m)^\s*moli_checksum=([0-9a-f]{{64}})$", installer[installer.index(f"    {arch})"):])
        for arch in TARGETS
    }
    for arch, match in old_checksums.items():
        if not match:
            raise ValueError(f"Could not find pinned {arch} checksum")
        installer = replace_once(installer, match.group(1), new_checksums[arch], f"{arch} checksum")
    installer = replace_once(installer, f"/download/{current_tag}/", f"/download/{new_tag}/", "release URL")

    readme = README.read_text()
    readme, zh_count = re.subn(r"Moli v" + re.escape(current_tag[1:]), f"Moli v{new_tag[1:]}", readme, count=1)
    readme, en_count = re.subn(r"Moli v" + re.escape(current_tag[1:]), f"Moli v{new_tag[1:]}", readme, count=1)
    if zh_count != 1 or en_count != 1:
        raise ValueError("README must contain one current Moli pin in both language sections")

    adr = ADR.read_text()
    adr = replace_once(adr, f"Docker bundles Moli {current_tag}",
                       f"Docker bundles Moli {new_tag}", "ADR pinned version")
    adr = replace_once(adr, f"https://github.com/lexmount/moli/tree/{current_tag}",
                       f"https://github.com/lexmount/moli/tree/{new_tag}", "ADR upstream link")

    package = json.loads(PACKAGE.read_text())
    old_calver = package["version"]
    new_calver = next_calver(old_calver)
    package["version"] = new_calver
    lock = json.loads(LOCKFILE.read_text())
    lock["version"] = new_calver
    lock["packages"][""]["version"] = new_calver

    changelog = CHANGELOG.read_text()
    title = f"## [{new_calver}] - {today} - Moli 上游版本更新 (Moli Upstream Update)"
    entry = (f"{title}\n\n### Updated\n"
             f"- 固定 Moli {new_tag[1:]}；amd64 / arm64 發行檔均通過 ELF 架構檢查與 SHA-256 驗證。\n"
             f"- Pin Moli {new_tag[1:]}; both amd64 / arm64 release archives passed ELF architecture and SHA-256 verification.\n\n")
    changelog = changelog.replace("\n## [", f"\n{entry}## [", 1)

    INSTALLER.write_text(installer)
    README.write_text(readme)
    ADR.write_text(adr)
    PACKAGE.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")
    LOCKFILE.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n")
    CHANGELOG.write_text(changelog)
    output("changed", "true")
    output("calver", new_calver)
    print(f"Updated pinned Moli {current_tag} -> {new_tag}; CalVer {old_calver} -> {new_calver}")


if __name__ == "__main__":
    main()
