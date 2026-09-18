#!/usr/bin/env bash
# Bundle a verify-page entry against lib src with a single litegraph copy.
# Usage: bundle-verify-page.sh <entry.ts> <out-bundle.js>
# Run from the repo root.
set -euo pipefail
node_modules/.bin/esbuild "$1" --bundle --format=iife --platform=browser \
  --external:ws \
  --alias:@haski/ta-lib=./packages/lib/src \
  --alias:litegraph.js=./node_modules/litegraph.js/build/litegraph.core.js \
  --outfile="$2" --log-level=warning
