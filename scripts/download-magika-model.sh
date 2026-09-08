#!/usr/bin/env bash
# Download the pinned Magika model used by the Docker image.
# The model is Apache-2.0 licensed and is intentionally kept out of Git.

set -euo pipefail

cd "$(dirname "$0")/.."

MODEL_VERSION="${MAGIKA_MODEL_VERSION:-standard_v3_3}"
if [[ "$MODEL_VERSION" != "standard_v3_3" ]]; then
    echo "Unsupported Magika model version: $MODEL_VERSION" >&2
    exit 1
fi

BASE_URL="https://google.github.io/magika/models/${MODEL_VERSION}"
DEST_DIR="assets/magika/${MODEL_VERSION}"
mkdir -p "$DEST_DIR"

download_and_verify() {
    local name="$1"
    local expected_sha256="$2"
    local destination="$DEST_DIR/$name"
    local partial="$destination.partial"

    if [[ -s "$destination" ]] && printf '%s  %s\n' "$expected_sha256" "$destination" | sha256sum -c --status -; then
        echo "[download-magika] skip $name (verified)"
        return
    fi

    echo "[download-magika] get  $name"
    curl --fail --silent --show-error --location --retry 3 --retry-delay 2 \
        --proto '=https' --tlsv1.2 -o "$partial" "$BASE_URL/$name"
    printf '%s  %s\n' "$expected_sha256" "$partial" | sha256sum -c -
    mv "$partial" "$destination"
}

download_and_verify \
    "model.json" \
    "d6d04589239670e2fd0dc3f9ccd5f5a4b1b3b7bea7ee72298cbbb1eee52181f2"
download_and_verify \
    "config.min.json" \
    "ae24c742205358f6ff6dfd5facb6743fb69743dbba8373e73da58ff0cbd695db"
download_and_verify \
    "group1-shard1of1.bin" \
    "6845b20533c637e1235dadca576dfa12b6dbf91bb81db64f34b78394be661a0e"
