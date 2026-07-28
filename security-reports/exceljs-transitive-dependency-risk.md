# ExcelJS transitive dependency risk

Last reviewed: 2026-07-28

## Finding

`npm audit --omit=dev` reports the `brace-expansion` denial-of-service advisory
through this production dependency path:

```text
exceljs → archiver/readdir-glob → minimatch → brace-expansion
```

ExcelJS 4.4.0 is the current version used by Canopy. The automated remediation
proposes a forced downgrade or other breaking dependency changes, so it has not
been applied without an upstream-compatible release.

## Exposure in Canopy

- Spreadsheet imports are restricted to 5 MB and bounded row/column/cell counts.
- General attachments are restricted to 25 MB.
- Executable and active-web-content attachment extensions are rejected.
- Only authenticated members of this small private deployment can import files.
- The reported expansion behavior is not directly exposed as a user-controlled
  glob pattern by Canopy.

These controls reduce practical exposure for this private 20-person deployment,
but do not remove the vulnerable transitive packages.

## Maintenance decision

Do not run `npm audit fix --force` automatically. During monthly maintenance:

1. Check for a new ExcelJS or archiver release.
2. Update in a branch.
3. Run spreadsheet unit tests, lint, build and an XLSX import/export smoke test.
4. Re-run `npm audit --omit=dev`.

Reassess immediately if spreadsheet imports become public or untrusted users gain
access.
