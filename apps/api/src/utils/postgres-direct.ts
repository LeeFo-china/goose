let directSql: Bun.SQL | null | undefined;

export const DIRECT_POSTGRES_SQL_OPTIONS = {
  max: 2,
  prepare: false,
} as const;

export function resolveDirectPostgresUrl(
  env: Record<string, string | undefined> = process.env,
) {
  return env.SUPABASE_DB_DIRECT_URL || env.SUPABASE_DB_URL || null;
}

export function getDirectPostgresSql() {
  if (directSql !== undefined) {
    return directSql;
  }

  const databaseUrl = resolveDirectPostgresUrl();
  directSql = databaseUrl
    ? new Bun.SQL(databaseUrl, DIRECT_POSTGRES_SQL_OPTIONS)
    : null;
  return directSql;
}
