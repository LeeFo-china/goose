import { PaginationQuerySchema } from "@/schema/request";
import {
  PROJECT_ACCEPTANCE_STATUS_VALUES,
  PROJECT_ACCEPTANCE_TYPE_VALUES,
  PROJECT_LOG_STAGE_CODE_VALUES,
} from "@gooes/domain";
import { z } from "zod";
import { customerBooleanQueryValue, optionalCustomerQueryValue } from "./shared";

export const CustomerProjectAcceptanceListQuerySchema = PaginationQuerySchema.extend({
  project_id: z.uuid("无效的项目 ID"),
  acceptance_type: optionalCustomerQueryValue(
    z.enum(PROJECT_ACCEPTANCE_TYPE_VALUES),
  ),
  status: optionalCustomerQueryValue(z.enum(PROJECT_ACCEPTANCE_STATUS_VALUES)),
  stage_code: optionalCustomerQueryValue(z.enum(PROJECT_LOG_STAGE_CODE_VALUES)),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(
    20,
    "每页验收单不能超过 20 条",
  ).default(10),
  debug_timing: customerBooleanQueryValue(false),
});
