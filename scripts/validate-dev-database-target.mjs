import { pathToFileURL } from "node:url";

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const PROJECT_REF_PATTERN = /^[a-z0-9]{10,63}$/;
const DEV_PROXY_PLACEHOLDER_USERNAMES = new Set(["postgres.your-tenant-id"]);

function splitList(value = "") {
  return value.split(/\s+/).filter(Boolean);
}

function isValidProjectRef(value) {
  return PROJECT_REF_PATTERN.test(value ?? "");
}

function parsePostgresUrl(value) {
  try {
    const parsed = new URL(value);
    if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) return null;
    if (!parsed.username || !parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
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

function isDevProxyPlaceholderUsername(username) {
  return DEV_PROXY_PLACEHOLDER_USERNAMES.has(username);
}

function decodeUsername(parsed) {
  try {
    return decodeURIComponent(parsed.username);
  } catch {
    return null;
  }
}

function resolveDirectProjectRef(value, databaseHostname = null) {
  if (!value) {
    return { isValid: true, projectRef: null, usesPlaceholder: false };
  }

  const parsed = parsePostgresUrl(value);
  if (!parsed) {
    return { isValid: false, projectRef: null, usesPlaceholder: false };
  }
  const match = /^db\.([a-z0-9]{10,63})\.supabase\.co$/.exec(parsed.hostname);
  if (match) {
    return { isValid: true, projectRef: match[1], usesPlaceholder: false };
  }

  const username = decodeUsername(parsed);
  if (
    username &&
    databaseHostname &&
    parsed.hostname === databaseHostname &&
    isDevProxyPlaceholderUsername(username)
  ) {
    return { isValid: true, projectRef: null, usesPlaceholder: true };
  }

  return { isValid: false, projectRef: null, usesPlaceholder: false };
}

function resolveDatabaseProjectRef(value) {
  const parsed = parsePostgresUrl(value);
  if (!parsed) {
    return {
      hostname: null,
      isValid: false,
      projectRef: null,
      usesPlaceholder: false,
    };
  }

  const username = decodeUsername(parsed);
  if (!username) {
    return {
      hostname: parsed.hostname,
      isValid: false,
      projectRef: null,
      usesPlaceholder: false,
    };
  }

  if (isDevProxyPlaceholderUsername(username)) {
    return {
      hostname: parsed.hostname,
      isValid: true,
      projectRef: null,
      usesPlaceholder: true,
    };
  }

  if (!username.startsWith("postgres.")) {
    return {
      hostname: parsed.hostname,
      isValid: true,
      projectRef: null,
      usesPlaceholder: false,
    };
  }

  const projectRef = username.slice("postgres.".length);
  if (!isValidProjectRef(projectRef)) {
    return {
      hostname: parsed.hostname,
      isValid: false,
      projectRef: null,
      usesPlaceholder: false,
    };
  }
  return {
    hostname: parsed.hostname,
    isValid: true,
    projectRef,
    usesPlaceholder: false,
  };
}

export function resolveProjectRef(environment = process.env) {
  const configuredProjectRef = environment.SUPABASE_PROJECT_REF ?? "";
  if (configuredProjectRef && !isValidProjectRef(configuredProjectRef)) {
    return null;
  }

  const database = resolveDatabaseProjectRef(environment.SUPABASE_DB_URL ?? "");
  const direct = resolveDirectProjectRef(
    environment.SUPABASE_DB_DIRECT_URL ?? "",
    database.hostname,
  );
  if (!direct.isValid || !database.isValid) return null;

  const databaseProjectRefs = [direct.projectRef, database.projectRef].filter(
    Boolean,
  );
  if (databaseProjectRefs.length === 0) {
    if (
      configuredProjectRef &&
      (direct.usesPlaceholder || database.usesPlaceholder)
    ) {
      return configuredProjectRef;
    }
    return null;
  }

  const projectRefs = configuredProjectRef
    ? [configuredProjectRef, ...databaseProjectRefs]
    : databaseProjectRefs;
  if (!projectRefs.every((projectRef) => projectRef === projectRefs[0])) {
    return null;
  }
  return projectRefs[0];
}

export function validateDatabaseTarget(args) {
  if (args.length < 4 || args.length > 6) return false;

  const [
    rawDatabaseUrl,
    actualProjectRef,
    expectedHost,
    expectedProjectRef,
    blockedHostsValue = "",
    blockedRefsValue = "",
  ] = args;

  if (!isCanonicalHostname(expectedHost)) return false;
  if (
    !isValidProjectRef(actualProjectRef) ||
    !isValidProjectRef(expectedProjectRef)
  ) {
    return false;
  }

  const databaseUrl = parsePostgresUrl(rawDatabaseUrl);
  if (!databaseUrl) return false;
  if (databaseUrl.hostname !== expectedHost) return false;
  if (actualProjectRef !== expectedProjectRef) return false;

  const blockedHosts = splitList(blockedHostsValue);
  if (blockedHosts.includes(databaseUrl.hostname)) return false;

  const blockedRefs = splitList(blockedRefsValue);
  if (
    blockedRefs.includes(actualProjectRef) ||
    blockedRefs.some((blockedRef) => rawDatabaseUrl.includes(blockedRef))
  ) {
    return false;
  }
  return true;
}

export function validateDirectMigrationHistoryTarget(args) {
  if (args.length < 4 || args.length > 6) return false;

  const [
    rawDatabaseUrl,
    actualProjectRef,
    expectedHost,
    expectedProjectRef,
    blockedHostsValue = "",
    blockedRefsValue = "",
  ] = args;

  if (!isCanonicalHostname(expectedHost)) return false;
  if (
    !isValidProjectRef(actualProjectRef) ||
    !isValidProjectRef(expectedProjectRef) ||
    actualProjectRef !== expectedProjectRef
  ) {
    return false;
  }

  const databaseUrl = parsePostgresUrl(rawDatabaseUrl);
  if (!databaseUrl) return false;
  if (databaseUrl.port !== "5432") return false;

  const canonicalDirectHost = `db.${expectedProjectRef}.supabase.co`;
  if (
    databaseUrl.hostname !== expectedHost &&
    databaseUrl.hostname !== canonicalDirectHost
  ) {
    return false;
  }

  const blockedHosts = splitList(blockedHostsValue);
  if (blockedHosts.includes(databaseUrl.hostname)) return false;

  const blockedRefs = splitList(blockedRefsValue);
  if (
    blockedRefs.includes(actualProjectRef) ||
    blockedRefs.some((blockedRef) => rawDatabaseUrl.includes(blockedRef))
  ) {
    return false;
  }
  return true;
}

function reject() {
  console.error("development database target rejected");
  process.exit(1);
}

function runCli() {
  const args = process.argv.slice(2);
  if (args[0] === "--resolve-project-ref") {
    if (args.length !== 1) reject();
    const projectRef = resolveProjectRef();
    if (!projectRef) reject();
    process.stdout.write(projectRef);
    return;
  }

  if (args[0] === "--direct-migration-history") {
    if (!validateDirectMigrationHistoryTarget(args.slice(1))) reject();
    return;
  }

  if (!validateDatabaseTarget(args)) reject();
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  runCli();
}
