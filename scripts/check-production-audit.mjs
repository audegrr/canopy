import { spawnSync } from "node:child_process";

const allowedAdvisory =
  "https://github.com/advisories/GHSA-mh99-v99m-4gvg";
const allowedPackages = new Set([
  "archiver",
  "archiver-utils",
  "brace-expansion",
  "exceljs",
  "glob",
  "minimatch",
  "readdir-glob",
  "rimraf",
  "zip-stream",
]);

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
const unexpected = vulnerabilities.filter((vulnerability) => {
  if (!allowedPackages.has(vulnerability.name)) return true;
  if (vulnerability.severity !== "high") return true;
  if (vulnerability.isDirect !== (vulnerability.name === "exceljs")) return true;

  return vulnerability.via.some((cause) =>
    typeof cause === "string"
      ? !allowedPackages.has(cause)
      : cause.url !== allowedAdvisory ||
        cause.name !== "brace-expansion" ||
        cause.severity !== "high",
  );
});

const presentPackages = new Set(
  vulnerabilities.map((vulnerability) => vulnerability.name),
);
const allowlistChanged =
  presentPackages.size !== allowedPackages.size ||
  [...allowedPackages].some((name) => !presentPackages.has(name));

if (unexpected.length > 0 || allowlistChanged) {
  console.error(
    "Production dependency audit differs from the reviewed ExcelJS exception.",
  );
  if (unexpected.length > 0) {
    console.error(
      `Unexpected findings: ${unexpected.map(({ name }) => name).join(", ")}`,
    );
  }
  console.error("Run `npm audit --omit=dev` and review every change.");
  process.exit(1);
}

console.warn(
  `Allowed reviewed exception: ${allowedPackages.size} high findings all trace to ${allowedAdvisory}.`,
);
console.warn(
  "See security-reports/exceljs-transitive-dependency-risk.md. Any changed or new finding fails this check.",
);
