#!/usr/bin/env bash
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required. Install it from https://supabase.com/docs/guides/local-development/cli/getting-started"
  exit 1
fi

output_file="${1:-supabase/schema.sql}"
output_dir="$(dirname "$output_file")"
mkdir -p "$output_dir"

temporary_file="$(mktemp "${TMPDIR:-/tmp}/canopy-schema-XXXXXX.sql")"
trap 'rm -f "$temporary_file"' EXIT

# --linked exports the remote schema without copying application data.
# Public contains Canopy's tables, policies, triggers and functions. Auth and
# storage remain managed by Supabase and must not be recreated from this file.
supabase db dump --linked --schema public --file "$temporary_file"

if ! rg -q 'CREATE TABLE|create table' "$temporary_file"; then
  echo "Schema export did not contain any tables; refusing to replace $output_file."
  exit 1
fi

mv "$temporary_file" "$output_file"
trap - EXIT
echo "Supabase public schema written to $output_file"
