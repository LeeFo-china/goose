let directSql: Bun.SQL | null | undefined;

export function getDirectPostgresSql() {
  if (directSql !== undefined) {
    return directSql;
  }

  const databaseUrl = process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DB_DIRECT_URL;

  directSql = databaseUrl
    ? new Bun.SQL(databaseUrl)
    : null;
  return directSql;
}
