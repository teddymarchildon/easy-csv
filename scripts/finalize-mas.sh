#!/bin/bash

set -euo pipefail

ARCH="${npm_config_arch:-$(uname -m)}"
APP_PATH="forge-out/Rowly-mas-${ARCH}/Rowly.app"
TEMP_DIR=$(/usr/bin/mktemp -d /private/tmp/rowly-mas-package.XXXXXX)
TEMP_PKG="$TEMP_DIR/Rowly.pkg"
EXPANDED_PKG="$TEMP_DIR/expanded"
trap '/bin/rm -rf "$TEMP_DIR"' EXIT

if [[ ! -d "$APP_PATH" ]]; then
  echo "Rowly app bundle not found: $APP_PATH" >&2
  exit 1
fi

VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")
PKG_PATH="forge-out/make/Rowly-${VERSION}-${ARCH}.pkg"

echo "Applying the final Mac App Store signature…"
/usr/bin/xattr -cr "$APP_PATH"
/usr/bin/codesign --remove-signature "$APP_PATH"
/usr/bin/codesign \
  --force \
  --options runtime \
  --timestamp \
  --entitlements entitlements.mas.plist \
  --sign 'Apple Distribution: Teddy Marchildon (55PJ732NTM)' \
  "$APP_PATH"

/usr/bin/codesign --verify --deep --strict --verbose=4 "$APP_PATH"

echo "Rebuilding the signed installer…"
/usr/bin/productbuild \
  --component "$APP_PATH" /Applications \
  --sign '3rd Party Mac Developer Installer: Teddy Marchildon (55PJ732NTM)' \
  "$TEMP_PKG"

echo "Verifying the installer payload…"
/usr/sbin/pkgutil --expand-full "$TEMP_PKG" "$EXPANDED_PKG"
/usr/bin/codesign \
  --verify \
  --deep \
  --strict \
  --verbose=4 \
  "$EXPANDED_PKG/com.teddymarchildon.easycsv.pkg/Payload/Rowly.app"

/bin/mv -f "$TEMP_PKG" "$PKG_PATH"

echo "Final Mac App Store package: $PKG_PATH"
