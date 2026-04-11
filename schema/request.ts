import { z } from "zod";
export const IdParamSchema = z.object({
  id: z.string().uuid("请求的 ID 必须是合法的 UUID"),
});
