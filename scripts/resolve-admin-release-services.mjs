const REQUESTED_ORDER = [
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
  "billing-reconcile-worker",
  "customer-rendering-input-review-worker",
  "customer-rendering-job-worker",
];
// Rendering workers exit while disabled and must be selected explicitly after their env gates are ready.
const ALL_SERVICES = REQUESTED_ORDER.slice(0, 5);
const BUILD_ORDER = ["api", "admin", "social-video-worker"];
const ALLOWED_SERVICES = new Set(REQUESTED_ORDER);

function reject(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [mode = "", rawServices = ""] = process.argv.slice(2);

if (mode !== "requested" && mode !== "build") {
  reject(`Unknown mode: ${mode}`);
}

const normalizedInput = rawServices.replaceAll(/\s/gu, "");
if (normalizedInput.length === 0) reject("No release service selected");

const services = normalizedInput === "all"
  ? ALL_SERVICES
  : normalizedInput.split(",");

if (services.some((service) => service.length === 0)) {
  reject("Release services must not contain empty values");
}

for (const service of services) {
  if (!ALLOWED_SERVICES.has(service)) reject(`Unknown service: ${service}`);
}

const requestedServices = new Set(services);
const resolvedServices = mode === "requested"
  ? REQUESTED_ORDER.filter((service) => requestedServices.has(service))
  : BUILD_ORDER.filter((service) =>
    service === "api"
      ? requestedServices.has("api")
        || requestedServices.has("cos-reconcile-worker")
        || requestedServices.has("billing-reconcile-worker")
        || requestedServices.has("customer-rendering-input-review-worker")
        || requestedServices.has("customer-rendering-job-worker")
      : requestedServices.has(service)
  );

process.stdout.write(`${resolvedServices.join(",")}\n`);
