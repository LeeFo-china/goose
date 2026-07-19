export type TrustMetric = { label: string; value: string };

export function buildTrustMetrics(value: unknown): TrustMetric[] {
  if (!Array.isArray(value)) return [];
  const metrics: TrustMetric[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const metricValue = typeof item.value === "string" ? item.value.trim() : "";
    if (!label || !metricValue || label.length > 20 || metricValue.length > 20) continue;
    metrics.push({ label, value: metricValue });
    if (metrics.length === 4) break;
  }
  return metrics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
