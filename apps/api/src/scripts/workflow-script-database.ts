type EnvLike = Record<string, string | undefined>;

type ClosableSql = {
  close: () => Promise<unknown>;
};

const DEFAULT_CLOSE_TIMEOUT_MS = 5_000;

export function resolveScriptDatabaseUrl(env: EnvLike = process.env): string | null {
  return env.SUPABASE_DB_DIRECT_URL || env.SUPABASE_DB_URL || null;
}

export async function closeSqlWithTimeout(
  db: ClosableSql,
  timeoutMs = DEFAULT_CLOSE_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      db.close().then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
