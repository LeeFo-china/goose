const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function getAsiaShanghaiTodayRange(now = new Date()) {
  const shanghaiNow = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const startUtcMs = Date.UTC(
    shanghaiNow.getUTCFullYear(),
    shanghaiNow.getUTCMonth(),
    shanghaiNow.getUTCDate(),
  ) - SHANGHAI_OFFSET_MS;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000;

  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}
