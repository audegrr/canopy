import { spawnSync } from "node:child_process";

const audit = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["audit", "--omit=dev", "--json"],
  { encoding: "utf8" },
);

if (audit.error) {
  console.error(`Could not run npm audit: ${audit.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("npm audit did not return a valid JSON report.");
  if (audit.stderr) console.error(audit.stderr.trim());
  process.exit(1);
}

if (report.error) {
  console.error(`npm audit failed: ${report.message ?? "unknown error"}`);
  process.exit(1);
}

// PptxGenJS currently depends on the latest published image-size release, which
// has no patched version. Canopy's presentation generator only adds text and
// vector shapes, so the vulnerable ICNS/JXL/HEIF parsers are never invoked.
// Keep this exception tied to the exact advisories so any new image-size issue
// (or any other production vulnerability) still fails the workflow.
const acceptedAdvisories = new Set([
  "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
]);

const unresolvedNames = new Set(
  Object.values(report.vulnerabilities ?? {})
    .filter(({ via }) =>
      via.some(
        (cause) =>
          typeof cause === "object" && !acceptedAdvisories.has(cause.url),
      ),
    )
    .map(({ name }) => name),
);

let changed = true;
while (changed) {
  changed = false;
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    if (
      !unresolvedNames.has(vulnerability.name) &&
      vulnerability.via.some(
        (cause) => typeof cause === "string" && unresolvedNames.has(cause),
      )
    ) {
      unresolvedNames.add(vulnerability.name);
      changed = true;
    }
  }
}

const vulnerabilities = Object.values(report.vulnerabilities ?? {}).filter(
  ({ name }) => unresolvedNames.has(name),
);

if (vulnerabilities.length > 0) {
  console.error("Production dependency audit found vulnerabilities.");
  console.error(
    `Findings: ${vulnerabilities
      .map(({ name, severity }) => `${name} (${severity})`)
      .join(", ")}`,
  );
  console.error("Run `npm audit --omit=dev` and review every finding.");
  process.exit(1);
}

console.log("Production dependency audit found no vulnerabilities.");
