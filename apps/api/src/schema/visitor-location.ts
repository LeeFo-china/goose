import {
  LocationBootstrapConfirmSchema,
  LocationBootstrapSchema,
} from "@/schema/tenant-service-areas";
import { z } from "zod";

export const VisitorLocationBootstrapSchema = LocationBootstrapSchema;

export const VisitorLocationConfirmSchema = LocationBootstrapConfirmSchema;

export const VisitorLocationSkipSchema = z.object({
  context_id: z.uuid("无效的定位上下文 ID"),
});

export type VisitorLocationBootstrapInput = z.infer<typeof VisitorLocationBootstrapSchema>;
export type VisitorLocationConfirmInput = z.infer<typeof VisitorLocationConfirmSchema>;
export type VisitorLocationSkipInput = z.infer<typeof VisitorLocationSkipSchema>;
