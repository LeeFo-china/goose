import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import {
  SupplierPurchaseBatchCommandEnvelopeSchema,
  type SupplierPurchaseBatch,
  type SupplierPurchaseBatchSplitPreview,
} from "@/repositories/supplier-purchase-batch-records";

type RpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type BaseResult = {
  idempotent: boolean;
  batch: SupplierPurchaseBatch;
  version: number;
};

export type SupplierPurchaseBatchCommandResult =
  | (BaseResult & { status: "saved";
    split_preview: SupplierPurchaseBatchSplitPreview[] })
  | (BaseResult & { status: "submitted"; requisition_ids: string[] })
  | (BaseResult & { status: "cancelled" });

const STATUS_BY_RESULT = {
  saved: "draft",
  submitted: "pending_approval",
  cancelled: "cancelled",
} as const;

const ERROR_STATUS = {
  validation_error: 400,
  not_found: 404,
  version_conflict: 409,
  state_conflict: 409,
  price_changed: 409,
  supplier_not_eligible: 409,
  project_invalid: 409,
} as const;

export async function executeSupplierPurchaseBatchCommand(input: {
  client: RpcClient;
  name: string;
  params: Record<string, unknown>;
  message: string;
  successStatus: SupplierPurchaseBatchCommandResult["status"];
}): Promise<SupplierPurchaseBatchCommandResult> {
  const { data, error } = await input.client.rpc(input.name, input.params);
  if (error) throwSupplierCommandDatabaseError(error, input.message);
  const parsed = SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(data);
  if (!parsed.success) throw Errors.dbError(input.message, parsed.error.issues);
  const envelope = parsed.data;
  if (envelope.status !== input.successStatus) {
    const statusCode = ERROR_STATUS[
      envelope.status as keyof typeof ERROR_STATUS
    ];
    if (!statusCode || !envelope.error_code) {
      throw Errors.dbError(input.message, envelope);
    }
    throw Errors.business(
      statusCode,
      envelope.reason ?? input.message,
      envelope.error_code,
      envelope.details,
    );
  }
  const batchId = input.params.p_batch_id;
  const tenantId = input.params.p_tenant_id;
  if (!envelope.batch || envelope.version === undefined ||
    envelope.batch.id !== batchId || envelope.batch.tenant_id !== tenantId ||
    envelope.batch.version !== envelope.version ||
    envelope.batch.status !== STATUS_BY_RESULT[input.successStatus]) {
    throw Errors.dbError(input.message, envelope);
  }
  if (input.successStatus === "submitted") {
    if (!envelope.requisition_ids?.length ||
      envelope.requisition_ids.length !== envelope.batch.supplier_count) {
      throw Errors.dbError(input.message, envelope);
    }
  } else if (envelope.requisition_ids !== undefined) {
    throw Errors.dbError(input.message, envelope);
  }
  const base = { idempotent: envelope.idempotent, batch: envelope.batch,
    version: envelope.version };
  if (envelope.status === "saved") {
    if (!envelope.split_preview) throw Errors.dbError(input.message, envelope);
    return { ...base, status: "saved", split_preview: envelope.split_preview };
  }
  if (envelope.status === "submitted") {
    if (!envelope.requisition_ids) {
      throw Errors.dbError(input.message, envelope);
    }
    return { ...base, status: "submitted",
      requisition_ids: envelope.requisition_ids };
  }
  return { ...base, status: "cancelled" };
}
