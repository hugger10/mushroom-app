#!/usr/bin/env bash
# Package the unsigned .app produced by the iOS build into an .ipa
# that can be signed locally on Windows with Sideloadly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_PATH="$REPO_ROOT/apps/mobile/ios/build/Build/Products/Release-iphoneos/Mesh.app"
IPA_PATH="$REPO_ROOT/apps/mobile/ios/build/Mesh-unsigned.ipa"

if [[ ! -d "$APP_PATH" ]]; then
  echo "error: .app bundle not found at $APP_PATH" >&2
  exit 1
fi

STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

mkdir -p "$STAGING/Payload"
cp -R "$APP_PATH" "$STAGING/Payload/"

cd "$STAGING"
zip -qry "$IPA_PATH" Payload

ls -lh "$IPA_PATH"
echo "IPA written to $IPA_PATH"
