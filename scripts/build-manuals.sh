#!/usr/bin/env bash
# Render manuals/src/*.html to text PDFs with headless Chrome (macOS path; set CHROME to override).
# The PDFs are committed, so this only needs to run after editing a manual.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
for src in manuals/src/*.html; do
  id=$(basename "$src" .html)
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="manuals/$id.pdf" "file://$PWD/$src" 2>/dev/null
  printf '{ "metadataAttributes": { "productId": "%s", "docType": "manual" } }\n' "$id" > "manuals/$id.pdf.metadata.json"
  echo "manuals/$id.pdf: $(mdls -name kMDItemNumberOfPages -raw "manuals/$id.pdf" 2>/dev/null || echo '?') pages"
done
