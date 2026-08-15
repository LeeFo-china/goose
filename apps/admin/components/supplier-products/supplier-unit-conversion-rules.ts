import type { UnitConversionEdge } from "@gooes/domain";

export type UnitReferenceForConversion = {
  id: string;
  symbol?: string;
  name: string;
};

export function validateConversionEdges(
  edges: readonly UnitConversionEdge[],
): string | null {
  const seen = new Set<string>();
  for (const edge of edges) {
    const factor = Number(edge.factor);
    if (!Number.isFinite(factor) || factor <= 0) {
      return "换算系数必须大于 0";
    }
    if (edge.fromUnitId === edge.toUnitId) {
      return "不允许自环换算";
    }
    const key = `${edge.fromUnitId}->${edge.toUnitId}`;
    if (seen.has(key)) {
      return "换算边不能重复";
    }
    seen.add(key);
  }
  return null;
}

export function buildConversionChainSummary(
  edges: readonly UnitConversionEdge[],
  units: readonly UnitReferenceForConversion[],
  startUnitId: string,
): string {
  const unitName = (id: string) => {
    const unit = units.find((item) => item.id === id);
    return unit?.symbol || unit?.name || id;
  };

  const edgeByFrom = new Map(edges.map((edge) => [edge.fromUnitId, edge]));
  const parts = [`1 ${unitName(startUnitId)}`];
  let current = startUnitId;
  let cumulative = 1;
  const visited = new Set<string>([startUnitId]);

  while (true) {
    const edge = edgeByFrom.get(current);
    if (!edge || visited.has(edge.toUnitId)) break;
    cumulative *= Number(edge.factor);
    current = edge.toUnitId;
    visited.add(current);
    parts.push(`${cumulative} ${unitName(current)}`);
  }

  return parts.join(" = ");
}
