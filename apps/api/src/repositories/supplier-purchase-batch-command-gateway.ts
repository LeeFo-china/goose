import { Errors } from "@/errors/error-factory";
import {
  assertProjectProcurementDestination,
} from "@/repositories/procurement-destination-records";
import { throwSupplierCommandDatabaseError } from "@/repositories/supplier-command-errors";
import {
  SupplierPurchaseBatchCommandEnvelopeSchema,
  SupplierPurchaseBatchRevisionErrorCodeSchema,
  type SupplierPurchaseBatchBlocker,
  type SupplierPurchaseBatchOrderSummary,
  type SupplierPurchaseBatchRevisionErrorCode,
} from "@/repositories/supplier-purchase-batch-command-records";
import {
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
  | (BaseResult & { status: "rejected" })
  | (BaseResult & { status: "cancelled" })
  | (BaseResult & { status: "ordered"; requisition_ids: string[];
    orders: SupplierPurchaseBatchOrderSummary[] })
  | (BaseResult & { status: "revision_required";
    error_code: SupplierPurchaseBatchRevisionErrorCode;
    details: SupplierPurchaseBatchBlocker[] });

const STATUS_BY_RESULT = {
  saved: "draft",
  submitted: "pending_approval",
  rejected: "rejected",
  cancelled: "cancelled",
  ordered: "ordered",
  revision_required: "draft",
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
  allowRevisionRequired?: boolean;
}): Promise<SupplierPurchaseBatchCommandResult> {
  const { data, error } = await input.client.rpc(input.name, input.params);
  if (error) throwSupplierCommandDatabaseError(error, input.message);
  const parsed = SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(data);
  if (!parsed.success) throw Errors.dbError(input.message, parsed.error.issues);
  const envelope = parsed.data;
  if (envelope.status === "revision_required" &&
    input.allowRevisionRequired) {
    assertBatchIdentity(envelope, input.params, input.message);
    const revisionCode = SupplierPurchaseBatchRevisionErrorCodeSchema
      .safeParse(envelope.error_code);
    if (!envelope.details || !revisionCode.success) {
      throw Errors.dbError(input.message, envelope);
    }
    assertProjectProcurementDestination(envelope.batch!);
    return { status: "revision_required", idempotent: envelope.idempotent,
      batch: envelope.batch!, version: envelope.version!,
      error_code: revisionCode.data, details: envelope.details };
  }
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
  assertBatchIdentity(envelope, input.params, input.message);
  if (input.successStatus === "submitted" || input.successStatus === "ordered") {
    if (!envelope.requisition_ids?.length ||
      envelope.requisition_ids.length !== envelope.batch!.supplier_count) {
      throw Errors.dbError(input.message, envelope);
    }
  } else if (envelope.requisition_ids !== undefined) {
    throw Errors.dbError(input.message, envelope);
  }
  assertProjectProcurementDestination(envelope.batch!);
  const base = { idempotent: envelope.idempotent, batch: envelope.batch,
    version: envelope.version } as BaseResult;
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
  if (envelope.status === "ordered") {
    if (!envelope.requisition_ids || !envelope.orders) {
      throw Errors.dbError(input.message, envelope);
    }
    return { ...base, status: "ordered",
      requisition_ids: envelope.requisition_ids, orders: envelope.orders };
  }
  if (envelope.status === "rejected") return { ...base, status: "rejected" };
  return { ...base, status: "cancelled" };
}

function assertBatchIdentity(
  envelope: ReturnType<typeof SupplierPurchaseBatchCommandEnvelopeSchema.parse>,
  params: Record<string, unknown>,
  message: string,
) {
  const expectedStatus = STATUS_BY_RESULT[envelope.status as
    keyof typeof STATUS_BY_RESULT];
  if (!expectedStatus || !envelope.batch || envelope.version === undefined ||
    envelope.batch.id !== params.p_batch_id ||
    envelope.batch.tenant_id !== params.p_tenant_id ||
    envelope.batch.version !== envelope.version ||
    envelope.batch.status !== expectedStatus) {
    throw Errors.dbError(message, envelope);
  }
}
