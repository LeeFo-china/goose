import { readFileSync } from "node:fs";
import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

export type LocalSupabasePostgresResolution =
  | {
    available: true;
    container: string;
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

export function resolveLocalSupabasePostgres(
  runner: CommandRunner = defaultRunner,
): LocalSupabasePostgresResolution {
  const projectId = localProjectId();
  if (!projectId) {
    return { available: false, reason: "supabase/config.toml 缺少 project_id" };
  }

  const dockerPs = runner("docker", ["ps", "--format", "{{json .}}"]);
  if (dockerPs.exitCode !== 0) {
    return {
      available: false,
      reason: `命令 docker ps 失败（exit code ${dockerPs.exitCode}）；请确认 Docker 可用并先运行 supabase start`,
    };
  }

  const container = parseSupabasePostgresContainer(
    dockerPs.stdout,
    projectId,
  );
  if (!container) {
    return {
      available: false,
      reason: "命令 docker ps 未解析到唯一运行中的本地 Supabase PostgreSQL 容器（exit code 0）；请先运行 supabase start",
    };
  }

  return {
    available: true,
    container,
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
    throw new Error(
      `命令 docker exec psql 失败（exit code ${result.exitCode}）；本地数据库行为验证未完成`,
    );
  }
  return result.stdout;
}

export type PsqlSession = {
  child: ChildProcessWithoutNullStreams;
  completed: Promise<number>;
  output: { stdout: string; stderr: string };
};

export function startPsqlSession(
  container: string,
  sql: string,
): PsqlSession {
  const child = spawn("docker", [
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
    "--no-align",
    "--tuples-only",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  const output = { stdout: "", stderr: "" };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output.stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output.stderr += chunk;
  });

  const completed = new Promise<number>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("命令 docker exec psql 超过 25 秒，已终止"));
    }, 25_000);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("命令 docker exec psql 启动失败"));
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });

  child.stdin.end(sql);
  return { child, completed, output };
}

export function waitForMarker(
  session: PsqlSession,
  marker: string,
): Promise<void> {
  if (session.output.stdout.includes(marker)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`等待 ${marker} 超过 10 秒`));
    }, 10_000);
    const onData = () => {
      if (session.output.stdout.includes(marker)) {
        cleanup();
        resolve();
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error(`docker exec psql 在输出 ${marker} 前退出`));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      session.child.stdout.off("data", onData);
      session.child.off("close", onClose);
    };

    session.child.stdout.on("data", onData);
    session.child.once("close", onClose);
  });
}

export function createConcurrentFixture() {
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  const actorEmployeeId = randomUUID();
  const slug = `supplier-rollout-concurrent-${tenantId}`;

  return {
    setupSql: `
BEGIN;
SET LOCAL statement_timeout = '20s';
INSERT INTO public.tenants (id, name, slug, status)
VALUES ('${tenantId}', '供应商灰度并发测试租户', '${slug}', 'active');
INSERT INTO public.employees (id, name, status, tenant_id)
VALUES ('${actorEmployeeId}', '供应商灰度并发测试操作人', 'active', '${tenantId}');
COMMIT;
SELECT 'SUPPLIER_ROLLOUT_CONCURRENT_SETUP_OK';
`,
    sessionASql: `
SET statement_timeout = '20s';
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.set_tenant_supplier_rollout_settings(
  '${tenantId}', true, false, false, false, false, false,
  0, '${actorUserId}', '${actorEmployeeId}',
  'concurrent-writer-a-${tenantId}', NULL
);
\\echo SESSION_A_LOCKED
SELECT pg_catalog.pg_sleep(3);
COMMIT;
\\echo SESSION_A_COMMITTED
`,
    sessionBSql: `
SET statement_timeout = '20s';
SET ROLE service_role;
\\echo SESSION_B_STARTED
DO $concurrent_b$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.set_tenant_supplier_rollout_settings(
    '${tenantId}', true, false, false, false, false, false,
    0, '${actorUserId}', '${actorEmployeeId}',
    'concurrent-writer-b-${tenantId}', NULL
  );
  IF v_result ->> 'status' <> 'version_conflict'
    OR v_result ->> 'error_code' <> 'SUPPLIER_VERSION_CONFLICT'
    OR (v_result ->> 'version')::integer <> 1
  THEN
    RAISE EXCEPTION 'concurrent writer was not rejected';
  END IF;
END
$concurrent_b$;
\\echo SESSION_B_VERSION_CONFLICT
`,
    verifySql: `
DO $verify$
DECLARE
  v_event_count bigint;
  v_version integer;
BEGIN
  SELECT setting.version
  INTO v_version
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = '${tenantId}'
    AND setting.module_enabled
    AND NOT setting.ownership_reads_enabled
    AND NOT setting.private_supplier_writes_enabled
    AND NOT setting.private_catalog_writes_enabled
    AND NOT setting.procurement_snapshot_v1_enabled;
  IF v_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'expected final settings version 1';
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_event_count
  FROM public.supplier_command_events AS event
  WHERE event.tenant_id = '${tenantId}'
    AND event.resource_type = 'tenant_supplier'
    AND event.resource_id = '${tenantId}'
    AND event.command = 'set_tenant_supplier_rollout_settings'
    AND event.actor_user_id = '${actorUserId}'
    AND event.actor_employee_id = '${actorEmployeeId}'
    AND event.result_version = 1;
  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one successful concurrent event';
  END IF;
END
$verify$;
SELECT 'SUPPLIER_ROLLOUT_CONCURRENT_VERIFY_OK';
`,
    cleanupSql: `
BEGIN;
SET LOCAL statement_timeout = '20s';
DELETE FROM public.supplier_command_events AS event
WHERE event.tenant_id = '${tenantId}'
  AND event.resource_id = '${tenantId}'
  AND event.actor_user_id = '${actorUserId}'
  AND event.actor_employee_id = '${actorEmployeeId}';
DELETE FROM public.tenant_supplier_settings AS setting
WHERE setting.tenant_id = '${tenantId}';
DELETE FROM public.employees AS employee
WHERE employee.id = '${actorEmployeeId}'
  AND employee.tenant_id = '${tenantId}';
DELETE FROM public.tenants AS tenant
WHERE tenant.id = '${tenantId}';
COMMIT;
DO $cleanup_verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.supplier_command_events
    WHERE tenant_id = '${tenantId}' AND actor_user_id = '${actorUserId}'
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_supplier_settings
    WHERE tenant_id = '${tenantId}'
  ) OR EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = '${actorEmployeeId}' AND tenant_id = '${tenantId}'
  ) OR EXISTS (
    SELECT 1 FROM public.tenants WHERE id = '${tenantId}'
  ) THEN
    RAISE EXCEPTION 'concurrent fixture cleanup incomplete';
  END IF;
END
$cleanup_verify$;
SELECT 'SUPPLIER_ROLLOUT_CONCURRENT_CLEANUP_OK';
`,
  };
}
