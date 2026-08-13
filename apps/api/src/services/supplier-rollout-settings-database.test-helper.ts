import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export type LocalSupabasePostgresResolution =
  | {
    available: true;
    container: string;
    statusDiagnostic: string;
  }
  | { available: false; reason: string };

type DockerPsRecord = {
  Image?: unknown;
  Labels?: unknown;
  Names?: unknown;
  State?: unknown;
};

type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type CommandRunner = (
  command: string,
  args: readonly string[],
  input?: string,
) => CommandResult;

const defaultRunner: CommandRunner = (command, args, input) => {
  const result = spawnSync(command, [...args], {
    cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
    encoding: "utf8",
    input,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.error
      ? `${result.stderr ?? ""}\n${result.error.message}`.trim()
      : result.stderr ?? "",
  };
};

function labelsContainProject(labels: string, projectId: string): boolean {
  return labels.split(",").some((label) =>
    label.trim() === `com.supabase.cli.project=${projectId}`
  );
}

export function parseSupabasePostgresContainer(
  dockerPsOutput: string,
  projectId: string,
): string | null {
  const matches = dockerPsOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line): DockerPsRecord[] => {
      try {
        return [JSON.parse(line) as DockerPsRecord];
      } catch {
        return [];
      }
    })
    .filter((record) =>
      typeof record.Image === "string" &&
      /(?:^|\/)postgres:\d/.test(record.Image) &&
      typeof record.Labels === "string" &&
      labelsContainProject(record.Labels, projectId) &&
      record.State === "running" &&
      typeof record.Names === "string" &&
      record.Names.trim()
    )
    .map((record) => record.Names as string);

  return matches.length === 1 ? matches[0] ?? null : null;
}

function localProjectId(): string | null {
  const config = readFileSync(fileURLToPath(new URL(
    "../../../../supabase/config.toml",
    import.meta.url,
  )), "utf8");
  return config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

function summarize(result: CommandResult): string {
  return [
    `exit=${result.exitCode}`,
    result.stderr.trim(),
    result.stdout.trim(),
  ].filter(Boolean).join(" | ");
}

export function resolveLocalSupabasePostgres(
  runner: CommandRunner = defaultRunner,
): LocalSupabasePostgresResolution {
  const projectId = localProjectId();
  if (!projectId) {
    return { available: false, reason: "supabase/config.toml 缺少 project_id" };
  }

  const status = runner("supabase", ["status", "-o", "env"]);
  const dockerPs = runner("docker", ["ps", "--format", "{{json .}}"]);
  if (dockerPs.exitCode !== 0) {
    return {
      available: false,
      reason: `docker ps 不可用；${summarize(dockerPs)}`,
    };
  }

  const container = parseSupabasePostgresContainer(
    dockerPs.stdout,
    projectId,
  );
  if (!container) {
    return {
      available: false,
      reason: [
        `未找到 project=${projectId} 的唯一运行中 Supabase PostgreSQL 容器`,
        `supabase status: ${summarize(status)}`,
      ].join("；"),
    };
  }

  return {
    available: true,
    container,
    statusDiagnostic: status.exitCode === 0
      ? "supabase status 可用"
      : `supabase status 不可用，已按 docker label 回退：${summarize(status)}`,
  };
}

export function executePsql(
  container: string,
  sql: string,
  runner: CommandRunner = defaultRunner,
): string {
  const result = runner("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-X",
    "--set",
    "ON_ERROR_STOP=1",
    "--no-psqlrc",
  ], sql);
  if (result.exitCode !== 0) {
    throw new Error([
      `local PostgreSQL behavior test failed in container ${container}`,
      `exit=${result.exitCode}`,
      `stdout:\n${result.stdout}`,
      `stderr:\n${result.stderr}`,
    ].join("\n"));
  }
  return result.stdout;
}
