const REMOTE_DEVELOPMENT_POSTGRES_HOST = "api-dev.goodcms.cn";
const DEVELOPMENT_POSTGRES_DATABASE = "postgres";
const DEVELOPMENT_POSTGRES_HOSTS = new Set([
  REMOTE_DEVELOPMENT_POSTGRES_HOST,
  "localhost",
  "127.0.0.1",
  "[::1]",
]);
const SECURE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

export type SupplierPurchasableSkuDatabaseConnection = {
  adapter: "postgres";
  hostname: string;
  port: number;
  database: string;
  username: string;
  password: string;
  tls: boolean;
  url: string;
};

export type SupplierPurchasableSkuDevelopmentDatabase = {
  connection: SupplierPurchasableSkuDatabaseConnection;
};

export const SUPPLIER_PURCHASABLE_SKU_CLOSE_OPTIONS = {
  timeout: 5,
} as const;

export function createSupplierPurchasableSkuDatabaseOptions(
  connection: SupplierPurchasableSkuDatabaseConnection,
  max: number,
): Bun.SQL.Options {
  return {
    ...connection,
    max,
    prepare: false,
    connectionTimeout: 10,
    connection: {
      statement_timeout: "30s",
      lock_timeout: "10s",
    },
  };
}

function decodeUrlComponent(value: string, variableName: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${variableName} 必须是 PostgreSQL URL`);
  }
}

function normalizedPostgresUrl(input: {
  protocol: "postgres:" | "postgresql:";
  hostname: string;
  port: string;
  database: string;
  username: string;
  password: string;
  sslMode: string | undefined;
}): string {
  const credentials = `${encodeURIComponent(input.username)}:${
    encodeURIComponent(input.password)
  }`;
  const query = input.sslMode === undefined
    ? ""
    : `?sslmode=${encodeURIComponent(input.sslMode)}`;
  return `${input.protocol}//${credentials}@${input.hostname}:${input.port}/${
    encodeURIComponent(input.database)
  }${query}`;
}

export function parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
  value: string,
  variableName: string,
): SupplierPurchasableSkuDevelopmentDatabase {
  if (!value) throw new Error(`缺少 ${variableName}`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} 必须是 PostgreSQL URL`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${variableName} 必须是 PostgreSQL URL`);
  }
  const hostname = parsed.hostname.toLowerCase();
  const database = decodeUrlComponent(parsed.pathname.slice(1), variableName);
  const username = decodeUrlComponent(parsed.username, variableName);
  const password = decodeUrlComponent(parsed.password, variableName);
  if (
    hostname.trim().length === 0 ||
    parsed.port.length === 0 ||
    Number(parsed.port) === 0 ||
    database.trim().length === 0 ||
    username.trim().length === 0 ||
    password.trim().length === 0
  ) {
    throw new Error(
      `${variableName} 必须完整包含主机、端口、数据库名、用户名和密码`,
    );
  }
  if (!DEVELOPMENT_POSTGRES_HOSTS.has(hostname)) {
    throw new Error(`${variableName} 仅允许连接开发数据库主机`);
  }
  if (database !== DEVELOPMENT_POSTGRES_DATABASE) {
    throw new Error(`${variableName} 仅允许连接 postgres 数据库`);
  }
  for (const key of parsed.searchParams.keys()) {
    if (key !== "sslmode") {
      throw new Error(`${variableName} 不允许数据库 URL 查询参数 ${key}`);
    }
  }
  const sslModes = parsed.searchParams.getAll("sslmode");
  const sslMode = sslModes.length === 1 ? sslModes[0]?.toLowerCase() : undefined;
  if (
    sslModes.length > 1 ||
    (sslMode !== undefined && !SECURE_SSL_MODES.has(sslMode)) ||
    (hostname === REMOTE_DEVELOPMENT_POSTGRES_HOST && sslMode === undefined)
  ) {
    throw new Error(
      `${variableName} 远程开发数据库必须显式使用安全 sslmode`,
    );
  }
  return {
    connection: {
      adapter: "postgres",
      hostname,
      port: Number(parsed.port),
      database,
      username,
      password,
      tls: sslMode !== undefined,
      url: normalizedPostgresUrl({
        protocol: parsed.protocol,
        hostname,
        port: parsed.port,
        database,
        username,
        password,
        sslMode,
      }),
    },
  };
}

export function deriveSupplierPurchasableSkuDevelopmentDatabaseUrl(
  value: string,
  variableName: string,
): string {
  if (!value) throw new Error(`缺少 ${variableName}`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} 必须是 PostgreSQL URL`);
  }
  if (
    parsed.hostname.toLowerCase() === REMOTE_DEVELOPMENT_POSTGRES_HOST &&
    parsed.search.length === 0
  ) {
    parsed.searchParams.set("sslmode", "require");
  }
  return parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
    parsed.toString(),
    variableName,
  ).connection.url;
}

export function redactSupplierPurchasableSkuDevelopmentDatabaseUrl(
  value: string,
  variableName: string,
): string {
  const { connection } = parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
    value,
    variableName,
  );
  const url = new URL(connection.url);
  if (url.username) url.username = "***";
  if (url.password) url.password = "***";
  return url.toString();
}
