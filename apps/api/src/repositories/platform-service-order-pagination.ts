export function normalizePagination(page: number, pageSize: number) {
  const normalizedPage = Math.max(1, Math.floor(page || 1));
  const normalizedPageSize = Math.min(
    100,
    Math.max(1, Math.floor(pageSize || 20)),
  );
  const from = (normalizedPage - 1) * normalizedPageSize;
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    from,
    to: from + normalizedPageSize - 1,
  };
}

export function pageResult<T>(
  data: unknown,
  count: number | null | undefined,
  pagination: ReturnType<typeof normalizePagination>,
) {
  const total = count ?? 0;
  return {
    list: (Array.isArray(data) ? data : []) as T[],
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: total ? Math.ceil(total / pagination.pageSize) : 0,
    },
  };
}

export function buildIlikePattern(value: string) {
  return `%${value.trim()}%`;
}
