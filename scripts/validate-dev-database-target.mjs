const args = process.argv.slice(2);

function reject() {
  console.error("development database target rejected");
  process.exit(1);
}

function splitList(value = "") {
  return value.split(/\s+/).filter(Boolean);
}

function isValidProjectRef(value) {
  return /^[a-z0-9]{10,63}$/.test(value ?? "");
}

function isCanonicalHostname(value) {
  if (!value) return false;

  try {
    const parsed = new URL(`postgresql://x:y@${value}`);
    return (
      parsed.hostname === value &&
      parsed.host === value &&
      parsed.username === "x" &&
      parsed.password === "y" &&
      parsed.port === "" &&
      parsed.pathname === ""
    );
  } catch {
    return false;
  }
}

if (args.length < 4 || args.length > 6) reject();

const [
  rawDatabaseUrl,
  actualProjectRef,
  expectedHost,
  expectedProjectRef,
  blockedHostsValue = "",
  blockedRefsValue = "",
] = args;

if (!isCanonicalHostname(expectedHost)) reject();
if (!isValidProjectRef(actualProjectRef) || !isValidProjectRef(expectedProjectRef)) {
  reject();
}

let databaseUrl;
try {
  databaseUrl = new URL(rawDatabaseUrl);
} catch {
  reject();
}

if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) reject();
if (!databaseUrl.username || !databaseUrl.password) reject();
if (databaseUrl.hostname !== expectedHost) reject();
if (actualProjectRef !== expectedProjectRef) reject();

const blockedHosts = splitList(blockedHostsValue);
if (blockedHosts.includes(databaseUrl.hostname)) reject();

const blockedRefs = splitList(blockedRefsValue);
if (
  blockedRefs.includes(actualProjectRef) ||
  blockedRefs.some((blockedRef) => rawDatabaseUrl.includes(blockedRef))
) {
  reject();
}
