import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const FinanceLedgerListQuerySchema = PaginationQuerySchema.extend({
  project_id: z.uuid("请选择有效的项目").optional(),
  direction: z.enum(["in", "out"], { message: "无效的流水方向" }).optional(),
  entry_type: z.enum(
    ["project_payment", "expense_settlement", "refund", "adjustment"],
    { message: "无效的流水类型" },
  ).optional(),
  date_from: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "开始日期格式必须为 YYYY-MM-DD")
    .optional(),
  date_to: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "结束日期格式必须为 YYYY-MM-DD")
    .optional(),
});

export type FinanceLedgerListQuery = z.infer<typeof FinanceLedgerListQuerySchema>;
