#!/usr/bin/env bash
# Package the unsigned .app produced by the iOS build into an .ipa
# that can be signed locally on Windows with Sideloadly.
set -euo pipefail

IOS_DIR="apps/mobile/ios"
APP_PATH="$IOS_DIR/build/Build/Products/Release-iphoneos/Mesh.app"
IPA_PATH="$IOS_DIR/build/Mesh-unsigned.ipa"

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
