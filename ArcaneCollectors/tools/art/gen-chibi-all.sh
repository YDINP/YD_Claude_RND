#!/usr/bin/env bash
set -u
for h in base_sera base_luca base_kai base_lin base_omar base_sol base_hana base_leon base_paolo; do
  echo "=== $h"
  node tools/art/gen-chibi.mjs --hero "$h" --seed 771201 2>&1 | grep -E "OK|FAIL"
done
echo "ALL CHIBI DONE"
