export type LatestRequestGate = ReturnType<typeof createLatestRequestGate>;

export function createLatestRequestGate() {
  let latestRequest = 0;

  return {
    begin() {
      latestRequest += 1;
      return latestRequest;
    },
    isCurrent(request: number) {
      return request === latestRequest;
    },
    invalidate() {
      latestRequest += 1;
    },
  };
}

export function isLatestResourceRequest(
  gate: LatestRequestGate,
  request: number,
  requestedResourceId: string,
  selectedResourceId: string | null,
) {
  return gate.isCurrent(request) &&
    requestedResourceId === selectedResourceId;
}
