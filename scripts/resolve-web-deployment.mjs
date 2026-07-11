const [rawServices = "", migrationVersion = "", verifiedSha = "", smoke = "", currentSha = ""] =
  process.argv.slice(2);

const LEGACY_ALL_SERVICES = [
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
];
const ALLOWED_SERVICES = new Set([...LEGACY_ALL_SERVICES, "web"]);
const REQUIRED_MIGRATION = "20260711120000";
const REQUIRED_SMOKE = "API_HEALTH_AND_SMS_CONCURRENCY_SMOKE_PASSED";

function reject(message) {
  console.error(message);
  process.exit(1);
}

const normalizedInput = rawServices.replaceAll(/\s/g, "");
if (normalizedInput === "all") {
  console.log(LEGACY_ALL_SERVICES.join(" "));
  process.exit(0);
}

const services = normalizedInput.split(",").filter(Boolean);
if (services.length === 0) reject("No deployment service selected");

for (const service of services) {
  if (!ALLOWED_SERVICES.has(service)) reject(`Unknown service: ${service}`);
}

if (services.includes("web")) {
  if (services.length !== 1) reject("Web must be deployed separately");
  if (
    migrationVersion !== REQUIRED_MIGRATION ||
    verifiedSha !== currentSha ||
    smoke !== REQUIRED_SMOKE
  ) {
    reject("Web deployment gate rejected: migration, SHA, or SMS smoke evidence mismatch");
  }
}

console.log(services.join(" "));
