export const migrationPath = new URL(
  "../../../../supabase/migrations/20260810190000_create_platform_service_contract_access.sql",
  import.meta.url,
);

export const migrationFile = Bun.file(migrationPath);

export const readMigration = async () =>
  (await migrationFile.exists()) ? migrationFile.text() : "";

export const normalizeSql = (sql: string) =>
  sql.replace(/\s+/g, " ").trim().toLowerCase();

export const extractFunctionDefinition = (sql: string, functionName: string) =>
  sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";

export const extractFunctionBody = (sql: string, functionName: string) => {
  const definition = extractFunctionDefinition(sql, functionName);
  const bodyStart = definition.indexOf("\nAS $$\n");
  const bodyEnd = definition.lastIndexOf("\n$$;");
  if (bodyStart < 0 || bodyEnd < 0) return "";
  return definition.slice(bodyStart + "\nAS $$\n".length, bodyEnd);
};

export const extractFunctionSignature = (sql: string, functionName: string) => {
  const definition = extractFunctionDefinition(sql, functionName);
  const signatureEnd = definition.indexOf("\nRETURNS ");
  return signatureEnd < 0 ? "" : definition.slice(0, signatureEnd);
};

export const extractPreflight = (sql: string) => {
  const start = sql.indexOf("-- Historical invariant preflight");
  const end = sql.indexOf("\n$$;", start);
  return start < 0 || end < 0 ? "" : sql.slice(start, end + 4);
};

export const extractConstraint = (sql: string, constraintName: string) => {
  const start = sql.indexOf(`ADD CONSTRAINT ${constraintName}`);
  if (start < 0) return "";
  const end = sql.indexOf(";", start);
  return end < 0 ? "" : sql.slice(start, end + 1);
};

export const extractStatement = (sql: string, marker: string) => {
  const start = sql.indexOf(marker);
  if (start < 0) return "";
  const end = sql.indexOf(";", start);
  return end < 0 ? "" : sql.slice(start, end + 1);
};
