import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export function parseRecord<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

export function normalizePage(input: { page: number; pageSize: number }) {
  return {
    page: Number.isInteger(input.page) && input.page > 0 ? input.page : 1,
    pageSize: Number.isInteger(input.pageSize) && input.pageSize > 0
      ? Math.min(100, input.pageSize)
      : 20,
  };
}

export function pageRange(input: { page: number; pageSize: number }) {
  const start = (input.page - 1) * input.pageSize;
  return { start, end: start + input.pageSize - 1 };
}

export function toPage<T>(
  list: T[],
  input: { page: number; pageSize: number },
  count: number | null,
) {
  const total = count ?? 0;
  return {
    list,
    pagination: {
      ...input,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
    },
  };
}

export function sanitizeKeyword(keyword?: string) {
  return keyword?.replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim() || "";
}

export function compactRecord(input: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
