import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type LocalMigrationEntry = {
  version: string;
  fileName: string;
};

export type MigrationHistoryReport = {
  pendingMigrationFiles: string[];
  alignment: { ok: boolean; detail: string };
};

type MigrationVersionRow = {
  version: string;
};

const LOCAL_MIGRATION_PATTERN = /^(\d{14})_.+\.sql$/;

export function parseLocalMigrationFileName(
  fileName: string,
): LocalMigrationEntry | null {
  const match = fileName.match(LOCAL_MIGRATION_PATTERN);
  if (!match) return null;
  const version = match[1];
  if (!version) return null;
  return {
    version,
    fileName,
  };
}

export function findPendingMigrationFiles(
  localMigrations: readonly LocalMigrationEntry[],
  remoteVersions: readonly string[],
): string[] {
  const remoteVersionSet = new Set(remoteVersions);
  return localMigrations
    .filter((migration) => !remoteVersionSet.has(migration.version))
    .map((migration) => migration.fileName);
}

export function summarizeMigrationHistoryAlignment(
  localMigrations: readonly LocalMigrationEntry[],
  remoteVersions: readonly string[],
): { ok: boolean; detail: string } {
  const localVersionSet = new Set(localMigrations.map((migration) =>
    migration.version
  ));
  const remoteVersionSet = new Set(remoteVersions);
  const mismatches = [
    ...localMigrations
      .filter((migration) => !remoteVersionSet.has(migration.version))
      .map((migration) => `${migration.version}->missing`),
    ...remoteVersions
      .filter((version) => !localVersionSet.has(version))
      .map((version) => `missing->${version}`),
  ];

  if (mismatches.length === 0 && localMigrations.length > 0) {
    return { ok: true, detail: `aligned=${localMigrations.length}` };
  }
  if (localMigrations.length === 0 && remoteVersions.length === 0) {
    return { ok: false, detail: "no migration rows parsed" };
  }
  return {
    ok: false,
    detail: `mismatches=${mismatches.join(", ")}`,
  };
}

export async function loadMigrationHistoryReport(
  databaseUrl: string,
  repoRoot = findRepoRoot(),
): Promise<MigrationHistoryReport> {
  const [localMigrations, remoteVersions] = await Promise.all([
    readLocalMigrationEntries(repoRoot),
    readRemoteMigrationVersions(databaseUrl),
  ]);
  return {
    pendingMigrationFiles: findPendingMigrationFiles(
      localMigrations,
      remoteVersions,
    ),
    alignment: summarizeMigrationHistoryAlignment(
      localMigrations,
      remoteVersions,
    ),
  };
}

async function readLocalMigrationEntries(
  repoRoot: string,
): Promise<LocalMigrationEntry[]> {
  const fileNames = await readdir(join(repoRoot, "supabase/migrations"));
  return fileNames
    .map(parseLocalMigrationFileName)
    .filter((migration): migration is LocalMigrationEntry =>
      migration !== null
    )
    .sort((left, right) => left.version.localeCompare(right.version));
}

async function readRemoteMigrationVersions(
  databaseUrl: string,
): Promise<string[]> {
  const db = new Bun.SQL(databaseUrl);
  try {
    const rows = await db<MigrationVersionRow[]>`
      select version
      from supabase_migrations.schema_migrations
      order by version;
    `;
    return rows.map((row) => row.version);
  } finally {
    await db.close();
  }
}

function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}
