#!/usr/bin/env bash
# Download a URL's HTML + linked CSS chunks into a directory for token-audit.
# Usage: fetch-url.sh <url> <out-dir>
set -euo pipefail

URL="$1"
OUT="$2"
BASE="$(echo "$URL" | sed -E 's|https?://([^/]+).*|\1|')"

mkdir -p "$OUT"

echo "· 下载 HTML → $OUT/index.html"
curl -sL -m 30 "$URL" -o "$OUT/index.html"

echo "· 提取并下载 CSS chunks…"
CSS_URLS=$(grep -oE 'href="[^"]*\.css[^"]*"' "$OUT/index.html" | sed -E 's/^href="([^"]*)"$/\1/')
COUNT=0
for css in $CSS_URLS; do
  # Resolve relative URLs against the base.
  if [[ "$css" == http* ]]; then
    FULL="$css"
  else
    FULL="https://$BASE$css"
  fi
  FILENAME=$(echo "$css" | tr '/' '_')
  curl -sL -m 20 "$FULL" -o "$OUT/$FILENAME" && COUNT=$((COUNT+1))
done

echo "· 下载完成：1 HTML + $COUNT CSS"
ls -la "$OUT" | head -20
