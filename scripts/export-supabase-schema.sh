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
dump_script="$(mktemp "${TMPDIR:-/tmp}/canopy-schema-command-XXXXXX.sh")"
trap 'rm -f "$temporary_file" "$dump_script"' EXIT

# --linked exports the remote schema without copying application data.
# Public contains Canopy's tables, policies, triggers and functions. Auth and
# storage remain managed by Supabase and must not be recreated from this file.
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  supabase db dump --linked --schema public --file "$temporary_file"
else
  pg_dump_dir=""
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump_dir="$(dirname "$(command -v pg_dump)")"
  elif command -v brew >/dev/null 2>&1 && brew --prefix libpq >/dev/null 2>&1; then
    pg_dump_dir="$(brew --prefix libpq)/bin"
  fi
  if [[ -z "$pg_dump_dir" || ! -x "$pg_dump_dir/pg_dump" ]]; then
    echo "Docker Desktop or the PostgreSQL client (libpq) is required to export the schema."
    exit 1
  fi
  supabase db dump --linked --schema public --dry-run > "$dump_script"
  PATH="$pg_dump_dir:$PATH" bash "$dump_script" > "$temporary_file"
fi

perl -0pi -e 's/[ \t]+\n/\n/g; s/\n+\z/\n/' "$temporary_file"

if ! rg -q 'CREATE TABLE|create table' "$temporary_file"; then
  echo "Schema export did not contain any tables; refusing to replace $output_file."
  exit 1
fi

mv "$temporary_file" "$output_file"
rm -f "$dump_script"
trap - EXIT
echo "Supabase public schema written to $output_file"
