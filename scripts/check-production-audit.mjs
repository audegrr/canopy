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

const vulnerabilities = Object.values(report.vulnerabilities ?? {});

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
