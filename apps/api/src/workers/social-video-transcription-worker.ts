import { setTimeout as sleep } from "node:timers/promises";
import { socialVideoTranscriptionRepository } from "@/repositories/social-video-transcriptions";
import { systemSettingsService } from "@/services/system-settings";
import { socialVideoTranscriptionService } from "@/services/social-video-transcriptions";

type WorkerSlot = {
  running: boolean;
};

const workerSlots: WorkerSlot[] = [];
let stopping = false;

function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const payload = {
    level,
    time: new Date().toISOString(),
    service: "social-video-transcription-worker",
    message,
    ...(meta || {}),
  };
  const line = JSON.stringify(payload);
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

async function getConcurrencyLimit() {
  const limit = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_CONCURRENCY_LIMIT",
    1,
  );

  if (!Number.isFinite(limit)) return 1;
  return Math.max(1, Math.min(Math.floor(limit), 4));
}

async function getPollIntervalMs() {
  const value = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_WORKER_POLL_INTERVAL_MS",
    3000,
  );
  if (!Number.isFinite(value)) return 3000;
  return Math.max(500, Math.min(Math.floor(value), 30000));
}

async function getStaleTaskTimeoutMs() {
  const value = await systemSettingsService.getNumber(
    "SOCIAL_VIDEO_STALE_TASK_TIMEOUT_MS",
    15 * 60 * 1000,
  );
  if (!Number.isFinite(value)) return 15 * 60 * 1000;
  return Math.max(60 * 1000, Math.min(Math.floor(value), 60 * 60 * 1000));
}

async function processNext(slot: WorkerSlot) {
  const staleTimeoutMs = await getStaleTaskTimeoutMs();
  const staleBefore = new Date(Date.now() - staleTimeoutMs).toISOString();
  const task = await socialVideoTranscriptionRepository.claimNextPending(staleBefore);
  if (!task) {
    return false;
  }

  slot.running = true;
  log("info", "claimed task", { id: task.id });
  try {
    await socialVideoTranscriptionService.processTask(task.id);
    log("info", "task processed", { id: task.id });
  } catch (error) {
    log("error", "task process crashed", {
      id: task.id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    slot.running = false;
  }

  return true;
}

async function tick() {
  const concurrency = await getConcurrencyLimit();
  while (workerSlots.length < concurrency) {
    workerSlots.push({ running: false });
  }
  if (workerSlots.length > concurrency) {
    workerSlots.length = concurrency;
  }

  await Promise.all(
    workerSlots
      .filter((slot) => !slot.running)
      .map((slot) => processNext(slot)),
  );
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
  log("info", "worker started");

  while (!stopping) {
    await tick().catch((error) => {
      log("error", "worker tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    await sleep(await getPollIntervalMs());
  }

  while (workerSlots.some((slot) => slot.running)) {
    log("info", "waiting for running tasks before shutdown");
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
