#!/bin/bash

set -euo pipefail

APP_PATH="${1:-forge-out/Rowly-mas-arm64/Rowly.app}"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Rowly app bundle not found: $APP_PATH" >&2
  echo "Run npm run make, then pass the generated .app path to this script." >&2
  exit 1
fi

echo "Verifying code signature…"
/usr/bin/codesign --verify --deep --strict --verbose=4 "$APP_PATH"

ENTITLEMENTS=$(/usr/bin/codesign -d --entitlements :- "$APP_PATH" 2>&1)

for REQUIRED_KEY in \
  com.apple.application-identifier \
  com.apple.developer.team-identifier \
  com.apple.security.app-sandbox \
  com.apple.security.application-groups \
  com.apple.security.files.user-selected.read-write \
  com.apple.security.files.bookmarks.app-scope
do
  if ! /usr/bin/grep -q "$REQUIRED_KEY" <<<"$ENTITLEMENTS"; then
    echo "Missing required entitlement: $REQUIRED_KEY" >&2
    exit 1
  fi
done

PROFILE_PATH="$APP_PATH/Contents/embedded.provisionprofile"
if [[ -f "$PROFILE_PATH" ]]; then
  PROFILE_XML=$(/usr/bin/openssl smime -inform der -verify -noverify -in "$PROFILE_PATH" 2>/dev/null)
  if ! /usr/bin/grep -q '55PJ732NTM.com.teddymarchildon.easycsv' <<<"$PROFILE_XML"; then
    echo "The embedded provisioning profile does not authorize Rowly's application identifier." >&2
    exit 1
  fi
fi

INFO_PLIST="$APP_PATH/Contents/Info.plist"
CSV_TYPE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDocumentTypes:0:LSItemContentTypes:0' "$INFO_PLIST")
TSV_TYPE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDocumentTypes:1:LSItemContentTypes:0' "$INFO_PLIST")

if [[ "$CSV_TYPE" != "public.comma-separated-values-text" ]]; then
  echo "CSV document type is not registered correctly." >&2
  exit 1
fi

if [[ "$TSV_TYPE" != "public.tab-separated-values-text" ]]; then
  echo "TSV document type is not registered correctly." >&2
  exit 1
fi

VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INFO_PLIST")
ARCH=$(basename "$(dirname "$APP_PATH")" | /usr/bin/sed 's/^Rowly-mas-//')
PKG_PATH="${2:-forge-out/make/Rowly-${VERSION}-${ARCH}.pkg}"

if [[ -f "$PKG_PATH" ]]; then
  VERIFY_TEMP_DIR=$(/usr/bin/mktemp -d /private/tmp/rowly-mas-verify.XXXXXX)
  trap '/bin/rm -rf "$VERIFY_TEMP_DIR"' EXIT
  /usr/sbin/pkgutil --expand-full "$PKG_PATH" "$VERIFY_TEMP_DIR/expanded"
  /usr/bin/codesign \
    --verify \
    --deep \
    --strict \
    --verbose=4 \
    "$VERIFY_TEMP_DIR/expanded/com.teddymarchildon.easycsv.pkg/Payload/Rowly.app"
fi

echo "MAS app and installer payload signatures, bookmark entitlements, and document types look valid."
