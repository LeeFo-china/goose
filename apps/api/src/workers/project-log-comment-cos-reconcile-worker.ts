import { setTimeout as sleep } from "node:timers/promises";
import {
  reconcileProjectLogCosObjects,
  summarizeProjectLogCosReconcile,
  writeProjectLogCosReconcileReport,
} from "@/scripts/project-log-cos-reconcile";
import {
  reconcileProjectLogCommentCosObjects,
  summarizeProjectLogCommentCosReconcile,
  writeProjectLogCommentCosReconcileReport,
} from "@/scripts/project-log-comment-cos-reconcile";

let stopping = false;
let running = false;

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    service: "project-log-comment-cos-reconcile-worker",
    message,
    ...(meta || {}),
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function parseBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function parseNumberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.floor(value), max));
}

function getWorkerConfig() {
  const lookbackMinutes = parseNumberEnv(
    "PROJECT_LOG_COMMENT_COS_RECONCILE_LOOKBACK_MINUTES",
    24 * 60,
    10,
    7 * 24 * 60,
  );

  return {
    enabled: parseBooleanEnv("PROJECT_LOG_COMMENT_COS_RECONCILE_WORKER_ENABLED", true),
    apply: parseBooleanEnv("PROJECT_LOG_COMMENT_COS_RECONCILE_APPLY", true),
    intervalMs: parseNumberEnv(
      "PROJECT_LOG_COMMENT_COS_RECONCILE_INTERVAL_MS",
      10 * 60 * 1000,
      60 * 1000,
      24 * 60 * 60 * 1000,
    ),
    lookbackMinutes,
    limit: parseNumberEnv("PROJECT_LOG_COMMENT_COS_RECONCILE_LIMIT", 1000, 1, 5000),
    tenantId: process.env.PROJECT_LOG_COMMENT_COS_RECONCILE_TENANT_ID?.trim() || undefined,
    commentOutDir: process.env.PROJECT_LOG_COMMENT_COS_RECONCILE_OUT_DIR?.trim() ||
      "reports/project-log-comment-cos-reconcile",
    logOutDir: process.env.PROJECT_LOG_COS_RECONCILE_OUT_DIR?.trim() ||
      "reports/project-log-cos-reconcile",
  };
}

function shouldWriteReport(summary: Record<string, number>) {
  return Boolean(
    summary.reconciled ||
      summary.failed ||
      summary.dry_run_missing,
  );
}

async function tick() {
  if (running) {
    log("warn", "previous tick still running");
    return;
  }

  const config = getWorkerConfig();
  if (!config.enabled) {
    log("info", "worker disabled");
    return;
  }

  running = true;
  const startedAt = Date.now();
  const since = new Date(Date.now() - config.lookbackMinutes * 60 * 1000).toISOString();

  try {
    const baseOptions = {
      limit: config.limit,
      outDir: config.commentOutDir,
      apply: config.apply,
      tenantId: config.tenantId,
      since,
    };
    const [logResults, commentResults] = await Promise.all([
      reconcileProjectLogCosObjects({
        ...baseOptions,
        outDir: config.logOutDir,
      }),
      reconcileProjectLogCommentCosObjects(baseOptions),
    ]);
    const logSummary = summarizeProjectLogCosReconcile(logResults);
    const commentSummary = summarizeProjectLogCommentCosReconcile(commentResults);
    let logOutputPath: string | null = null;
    let commentOutputPath: string | null = null;
    if (shouldWriteReport(logSummary)) {
      logOutputPath = await writeProjectLogCosReconcileReport(
        logResults,
        config.logOutDir,
      );
    }
    if (shouldWriteReport(commentSummary)) {
      commentOutputPath = await writeProjectLogCommentCosReconcileReport(
        commentResults,
        config.commentOutDir,
      );
    }

    log("info", "tick completed", {
      duration_ms: Date.now() - startedAt,
      apply: config.apply,
      tenant_id: config.tenantId || null,
      since,
      project_log: {
        scanned: logResults.length,
        summary: logSummary,
        output_path: logOutputPath,
      },
      project_log_comment: {
        scanned: commentResults.length,
        summary: commentSummary,
        output_path: commentOutputPath,
      },
    });
  } catch (error) {
    log("error", "tick failed", {
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

process.on("SIGINT", () => {
  stopping = true;
  log("warn", "received SIGINT");
});

process.on("SIGTERM", () => {
  stopping = true;
  log("warn", "received SIGTERM");
});

async function main() {
  log("info", "worker started", getWorkerConfig());

  while (!stopping) {
    await tick();
    await sleep(getWorkerConfig().intervalMs);
  }

  while (running) {
    log("info", "waiting for running tick before shutdown");
    await sleep(1000);
  }

  log("info", "worker stopped");
}

main().catch((error) => {
  log("error", "worker crashed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
