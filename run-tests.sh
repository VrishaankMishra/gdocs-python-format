#!/usr/bin/env bash
# Runs both tool suites. Node only — no browser, no network, no Google account.
set -euo pipefail
cd "$(dirname "$0")"

fail=0
for suite in \
  apps-script-addon/tests/test_tokenizer.js \
  apps-script-addon/tests/test_docs.js \
  chrome-extension/tests/test_format.js \
  chrome-extension/tests/test_integrity.js
do
  printf '%-48s ' "$suite"
  if out=$(node "$suite" 2>&1); then
    echo "${out##*$'\n'}"
  else
    echo "FAILED"
    echo "$out" | sed 's/^/    /'
    fail=1
  fi
done

exit "$fail"
