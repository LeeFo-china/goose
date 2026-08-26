import { CATALOG_SPEC_VALUE_TYPE_VALUES } from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type { CatalogClient } from "./supplier-catalog-read";

const REPLAY_SELECT =
  "tenant_id,command,resource_type,resource_id,from_state";
const status = z.enum(["active", "inactive"]);
const actorRequest = {
  expected_version: z.number().int().positive(),
  tenant_id: z.uuid().nullable(),
  actor_employee_id: z.uuid(),
};
const CategoryRequestSchema = z.object({
  category_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  code: z.string(),
  name: z.string(),
  status,
  sort_order: z.number().int(),
  mapped_platform_category_id: z.uuid().nullable(),
  ...actorRequest,
}).strict();
const BrandRequestSchema = z.object({
  brand_id: z.uuid(),
  category_id: z.uuid().nullable(),
  code: z.string(),
  name: z.string(),
  legal_name: z.string().nullable(),
  logo_file_id: z.uuid().nullable(),
  status,
  sort_order: z.number().int(),
  mapped_platform_brand_id: z.uuid().nullable(),
  ...actorRequest,
}).strict();
const SpecRequestSchema = z.object({
  spec_definition_id: z.uuid(),
  category_id: z.uuid(),
  code: z.string(),
  name: z.string(),
  value_type: z.enum(CATALOG_SPEC_VALUE_TYPE_VALUES),
  enum_options: z.array(z.string()),
  unit_dimension: z.string().nullable(),
  is_required: z.boolean(),
  participates_in_sku_name: z.boolean(),
  is_filterable: z.boolean(),
  sort_order: z.number().int(),
  status,
  ...actorRequest,
}).strict();
const EventSchema = z.object({
  tenant_id: z.uuid().nullable(),
  command: z.string(),
  resource_type: z.string(),
  resource_id: z.uuid(),
  from_state: z.json(),
}).strict();

export type CategoryUpdateReplayRequest = z.infer<typeof CategoryRequestSchema>;
export type BrandUpdateReplayRequest = z.infer<typeof BrandRequestSchema>;
export type SpecUpdateReplayRequest = z.infer<typeof SpecRequestSchema>;
export type CatalogUpdateReplay = {
  tenant_id: string | null;
  command: string;
  resource_type: string;
  resource_id: string;
  request: unknown;
};

export class SupplierCatalogReplayRepository {
  constructor(private readonly client: CatalogClient) {}

  async find(actorUserId: string, idempotencyKey: string) {
    const { data, error } = await this.client.from("supplier_command_events")
      .select(REPLAY_SELECT)
      .eq("actor_user_id", actorUserId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw Errors.dbError("查询供应商目录命令重放失败", error);
    if (data === null) return null;

    const parsed = EventSchema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("解析供应商目录命令重放失败", parsed.error.issues);
    }
    const event = parsed.data;
    const request = parseKnownRequest(event);
    return {
      tenant_id: event.tenant_id,
      command: event.command,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
      request,
    } satisfies CatalogUpdateReplay;
  }
}

function parseKnownRequest(event: z.infer<typeof EventSchema>): unknown {
  let schema: z.ZodType | null = null;
  if (
    event.command === "update_tenant_catalog_category" &&
    event.resource_type === "catalog_category"
  ) schema = CategoryRequestSchema;
  if (
    event.command === "update_tenant_catalog_brand" &&
    event.resource_type === "catalog_brand"
  ) schema = BrandRequestSchema;
  if (
    event.command === "update_catalog_spec_definition" &&
    event.resource_type === "catalog_spec_definition"
  ) schema = SpecRequestSchema;
  if (!schema) return null;

  const state = z.object({ _request: z.unknown() }).passthrough()
    .safeParse(event.from_state);
  if (!state.success) {
    throw Errors.dbError("解析供应商目录命令状态失败", state.error.issues);
  }

  const parsed = schema.safeParse(state.data._request);
  if (parsed.success) return parsed.data;
  throw Errors.dbError("解析供应商目录命令请求失败", parsed.error.issues);
}
