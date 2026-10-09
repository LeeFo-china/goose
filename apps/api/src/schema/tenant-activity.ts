import { z } from "zod";

export const TenantActivityViewSchema = z.object({
  screen: z.enum(["customers", "projects", "dashboard", "finance"]),
}).strict();
export type TenantActivityViewInput = z.infer<typeof TenantActivityViewSchema>;
