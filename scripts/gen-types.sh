#!/usr/bin/env bash
# Regenerates src/types/database.ts from the local Supabase stack (never hand-edit the output).
set -euo pipefail
pnpm exec supabase gen types typescript --local --schema public > src/types/database.ts
echo "Wrote src/types/database.ts"
