#!/usr/bin/env bash
# Pinned upstream release assets; preserve the bundled third-party notices.
set -euo pipefail
moli_arch=${1:?Expected amd64 or arm64}
moli_destination=${2:-/opt/moli}
case "$moli_arch" in
  amd64)
    moli_target=x86_64-unknown-linux-gnu
    moli_checksum=04c73204626054c9ec0064f7fc00abb0dcfa7f8b9c3ec9df5de8e2afc301087f
    ;;
  arm64)
    moli_target=aarch64-unknown-linux-gnu
    moli_checksum=95c094a0214431193ee93142dec91cc7affbea79e9b35094213b8b9230ccd134
    ;;
  *) echo "Unsupported Moli architecture: $moli_arch" >&2; exit 1 ;;
esac
moli_tmp=$(mktemp -d)
trap 'rm -rf "$moli_tmp"' EXIT
curl --proto '=https' --tlsv1.2 -fsSL --retry 3 --max-time 180 \
  "https://github.com/lexmount/moli/releases/download/v1.1.25/moli-${moli_target}.tar.gz" \
  -o "$moli_tmp/moli.tar.gz"
printf '%s  %s\n' "$moli_checksum" "$moli_tmp/moli.tar.gz" | sha256sum -c -
mkdir -p "$moli_destination"
tar -xzf "$moli_tmp/moli.tar.gz" -C "$moli_destination" --strip-components=1
test -f "$moli_destination/moli"
chmod 755 "$moli_destination/moli"
"$moli_destination/moli" --version
