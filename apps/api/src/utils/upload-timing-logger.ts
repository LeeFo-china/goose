type UploadTimingExtra = Record<string, unknown>;

function now() {
  return Date.now();
}

function parseDurationThreshold() {
  const value = Number(process.env.UPLOAD_TIMING_LOG_MIN_DURATION_MS || "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function parseSceneFilter() {
  return new Set(
    (process.env.UPLOAD_TIMING_LOG_SCENES || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function resolveScene(extra: UploadTimingExtra) {
  const scene = extra.scene ?? extra.raw_scene;
  return typeof scene === "string" && scene.trim() ? scene.trim() : null;
}

export function logUploadTiming(
  prefix: string,
  stage: string,
  startedAt: number,
  extra: UploadTimingExtra = {},
) {
  if (process.env.UPLOAD_TIMING_LOG_ENABLED !== "true") return;

  const durationMs = now() - startedAt;
  const minDurationMs = parseDurationThreshold();
  if (minDurationMs > 0 && durationMs < minDurationMs) return;

  const sceneFilter = parseSceneFilter();
  const scene = resolveScene(extra);
  if (sceneFilter.size > 0 && (!scene || !sceneFilter.has(scene))) return;

  console.info(prefix, stage, {
    duration_ms: durationMs,
    ...extra,
  });
}
