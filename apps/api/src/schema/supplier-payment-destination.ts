import { z } from "zod";

export const SupplierPaymentDestinationFilterFields = {
  destination_type: z.enum(["project", "warehouse"]).optional(),
  warehouse_id: z.uuid("无效的仓库 ID").optional(),
};

export function validateSupplierPaymentDestination(input: {
  destination_type?: "project" | "warehouse"; project_id: string | null; warehouse_id?: string | null;
}, context: z.RefinementCtx): void {
  const valid = input.destination_type === "warehouse"
    ? input.project_id === null && Boolean(input.warehouse_id)
    : input.project_id !== null && input.warehouse_id == null;
  if (!valid) context.addIssue({ code: "custom", path: ["destination_type"], message: "付款申请目的地数据不一致" });
}
