const [mode = "deploy", rawServices = ""] = process.argv.slice(2);

const LEGACY_ALL_SERVICES = [
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
  "billing-reconcile-worker",
];
const ALLOWED_SERVICES = new Set([...LEGACY_ALL_SERVICES, "h5", "web"]);

function reject(message) {
  console.error(message);
  process.exit(1);
}

if (mode !== "build" && mode !== "deploy") reject(`Unknown mode: ${mode}`);

const normalizedInput = rawServices.replaceAll(/\s/g, "");
if (normalizedInput === "all") {
  console.log(
    (mode === "build"
      ? ["api", "admin", "h5", "web", "social-video-worker"]
      : LEGACY_ALL_SERVICES
    ).join(" "),
  );
  process.exit(0);
}

const services = normalizedInput.split(",").filter(Boolean);
if (services.length === 0) reject("No deployment service selected");

for (const service of services) {
  if (!ALLOWED_SERVICES.has(service)) reject(`Unknown service: ${service}`);
}

if (mode === "deploy" && services.includes("web") && services.length !== 1) {
  reject("Web must be deployed separately");
}

const normalizedServices = mode === "build"
  ? services.map((service) =>
    service === "cos-reconcile-worker" || service === "billing-reconcile-worker"
      ? "api"
      : service
  )
  : services;
console.log([...new Set(normalizedServices)].join(" "));
