const REMOTE_DEVELOPMENT_POSTGRES_HOST = "api-dev.goodcms.cn";
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
  url?: string;
};

export type SupplierPurchasableSkuDevelopmentDatabase = {
  connection: SupplierPurchasableSkuDatabaseConnection;
  url: URL;
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
  if (!DEVELOPMENT_POSTGRES_HOSTS.has(hostname)) {
    throw new Error(`${variableName} 仅允许连接开发数据库主机`);
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
      port: parsed.port ? Number(parsed.port) : 5432,
      database: decodeUrlComponent(parsed.pathname.slice(1), variableName),
      username: decodeUrlComponent(parsed.username, variableName),
      password: decodeUrlComponent(parsed.password, variableName),
      tls: sslMode !== undefined,
      ...(sslMode === undefined
        ? {}
        : {
          url: `${parsed.protocol}//${parsed.host}?sslmode=${sslMode}`,
        }),
    },
    url: parsed,
  };
}

export function redactSupplierPurchasableSkuDevelopmentDatabaseUrl(
  value: string,
  variableName: string,
): string {
  const { url } = parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
    value,
    variableName,
  );
  if (url.username) url.username = "***";
  if (url.password) url.password = "***";
  return url.toString();
}
