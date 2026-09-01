const DEVELOPMENT_POSTGRES_HOSTS = new Set([
  "api-dev.goodcms.cn",
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

export function parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
  value: string,
  variableName: string,
): URL {
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
  if (!DEVELOPMENT_POSTGRES_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(`${variableName} 仅允许连接开发数据库主机`);
  }
  return parsed;
}

export function redactSupplierPurchasableSkuDevelopmentDatabaseUrl(
  value: string,
  variableName: string,
): string {
  const parsed = parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
    value,
    variableName,
  );
  if (parsed.username) parsed.username = "***";
  if (parsed.password) parsed.password = "***";
  return parsed.toString();
}
