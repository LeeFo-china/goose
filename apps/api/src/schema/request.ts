import { z } from "zod";
export const IdParamSchema = z.object({
  id: z.uuid("请求的 ID 必须是合法的 UUID"),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(100, "每页条数不能超过 100").default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
