export type PaginationStatus = "idle" | "loading" | "error" | "end";

export type PageResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PaginationState<T extends { id: string }> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  status: PaginationStatus;
  requestSequence: number;
  failedPage: number | null;
};

export type PaginationRequest = {
  page: number;
  pageSize: number;
  sequence: number;
};

export function createPaginationState<T extends { id: string }>(
  pageSize = 20,
): PaginationState<T> {
  return {
    items: [],
    page: 0,
    pageSize,
    total: 0,
    totalPages: 0,
    status: "idle",
    requestSequence: 0,
    failedPage: null,
  };
}

export function beginPaginationRequest<T extends { id: string }>(
  current: PaginationState<T>,
  mode: "loadMore" | "refresh" | "retry",
): { state: PaginationState<T>; request: PaginationRequest } {
  const sequence = current.requestSequence + 1;
  const page = mode === "refresh"
    ? 1
    : mode === "retry" && current.failedPage
      ? current.failedPage
      : current.page + 1;
  const reset = mode === "refresh";
  const state: PaginationState<T> = {
    ...current,
    items: reset ? [] : current.items,
    page: reset ? 0 : current.page,
    total: reset ? 0 : current.total,
    totalPages: reset ? 0 : current.totalPages,
    status: "loading",
    requestSequence: sequence,
    failedPage: null,
  };
  return { state, request: { page, pageSize: current.pageSize, sequence } };
}

export function resolvePaginationRequest<T extends { id: string }>(
  current: PaginationState<T>,
  request: PaginationRequest,
  response: PageResponse<T>,
): PaginationState<T> {
  if (request.sequence !== current.requestSequence) return current;
  if (response.pagination.page !== request.page
    || response.pagination.pageSize !== request.pageSize) {
    return { ...current, status: "error", failedPage: request.page };
  }
  const items = request.page === 1
    ? uniqueById(response.items)
    : uniqueById([...current.items, ...response.items]);
  const ended = response.pagination.totalPages === 0
    || request.page >= response.pagination.totalPages
    || items.length >= response.pagination.total;
  return {
    ...current,
    items,
    page: request.page,
    total: response.pagination.total,
    totalPages: response.pagination.totalPages,
    status: ended ? "end" : "idle",
    failedPage: null,
  };
}

export function rejectPaginationRequest<T extends { id: string }>(
  current: PaginationState<T>,
  request: PaginationRequest,
): PaginationState<T> {
  if (request.sequence !== current.requestSequence) return current;
  return { ...current, status: "error", failedPage: request.page };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
