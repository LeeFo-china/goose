let directSql: Bun.SQL | null | undefined;

export function getDirectPostgresSql() {
  if (directSql !== undefined) {
    return directSql;
  }

  directSql = process.env.SUPABASE_DB_URL
    ? new Bun.SQL(process.env.SUPABASE_DB_URL)
    : null;
  return directSql;
}
