import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPaymentConfirmSchema,
  SupplierPaymentListQuerySchema,
  SupplierPaymentRequestCancelSchema,
  SupplierPaymentRequestCloseSchema,
  SupplierPaymentRequestDraftSchema,
  SupplierPaymentRequestListQuerySchema,
  SupplierPaymentRequestParamSchema,
  SupplierPaymentRequestReviewSchema,
  SupplierPaymentRequestSubmitSchema,
} from "@/schema/supplier-payments";
import {
  supplierPaymentRequestsService,
} from "@/services/supplier-payment-requests";
import { Get, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

const PaymentIdempotencyKeySchema = z.uuid(
  "付款幂等键必须是 UUID",
);
const SupplierPaymentRequestCreateSchema =
  SupplierPaymentRequestDraftSchema.refine(
    (input) => input.expected_version === 0,
    {
      path: ["expected_version"],
      message: "创建付款申请时版本号必须为 0",
    },
  );
const SupplierPaymentRequestUpdateSchema =
  SupplierPaymentRequestDraftSchema.refine(
    (input) => input.expected_version > 0,
    {
      path: ["expected_version"],
      message: "更新付款申请时版本号必须为正整数",
    },
  );
const SupplierPaymentRequestRejectSchema =
  SupplierPaymentRequestReviewSchema.extend({
    remark: z.string()
      .trim()
      .min(1, "驳回原因不能为空")
      .max(500, "驳回原因不能超过 500 个字符"),
  }).strict();

class SupplierPaymentRequestsController extends TenantBaseController {
  constructor() {
    super("supplier-payment-requests");
  }

  @Get("/supplier-payment-requests")
  async listRequests(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPaymentRequestListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.list(auth, query),
    );
  }

  @Get("/supplier-payment-requests/:id")
  async getDetail(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPaymentRequestParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.detail(auth, id),
    );
  }

  @Get("/supplier-payment-requests/:id/payments")
  async listPayments(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPaymentRequestParamSchema,
      request.params,
    );
    const query = this.parse(
      SupplierPaymentListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.listPayments(auth, id, query),
    );
  }

  @Post("/supplier-payment-requests")
  async createDraft(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const input = this.parse(
      SupplierPaymentRequestCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.saveDraft(
        auth,
        input.id,
        input,
        key,
      ),
    );
  }

  @Put("/supplier-payment-requests/:id")
  async updateDraft(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPaymentRequestParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPaymentRequestUpdateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.saveDraft(auth, id, input, key),
    );
  }

  @Post("/supplier-payment-requests/:id/submit")
  async submit(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const { id } = this.parseId(request);
    const input = this.parse(
      SupplierPaymentRequestSubmitSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.submit(auth, id, input, key),
    );
  }

  @Post("/supplier-payment-requests/:id/approve")
  async approve(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const { id } = this.parseId(request);
    const input = this.parse(
      SupplierPaymentRequestReviewSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.approve(auth, id, input, key),
    );
  }

  @Post("/supplier-payment-requests/:id/reject")
  async reject(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const { id } = this.parseId(request);
    const input = this.parse(
      SupplierPaymentRequestRejectSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.reject(auth, id, input, key),
    );
  }

  @Post("/supplier-payment-requests/:id/cancel")
  async cancel(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const { id } = this.parseId(request);
    const input = this.parse(
      SupplierPaymentRequestCancelSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.cancel(auth, id, input, key),
    );
  }

  @Post("/supplier-payment-requests/:id/close")
  async close(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const { id } = this.parseId(request);
    const input = this.parse(
      SupplierPaymentRequestCloseSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.close(auth, id, input, key),
    );
  }

  @Post("/supplier-payment-requests/:id/payments")
  async confirmPayment(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = this.requirePaymentIdempotencyKey(request);
    const { id } = this.parseId(request);
    const input = this.parse(
      SupplierPaymentConfirmSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPaymentRequestsService.confirmPayment(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  private parseId(request: FastifyRequest) {
    return this.parse(SupplierPaymentRequestParamSchema, request.params);
  }

  private requirePaymentIdempotencyKey(request: FastifyRequest): string {
    const key = requireSupplierIdempotencyKey(request);
    return this.parse(PaymentIdempotencyKeySchema, key);
  }

  private parse<Schema extends z.ZodTypeAny>(
    schema: Schema,
    input: unknown,
  ): z.infer<Schema> {
    const result = schema.safeParse(input || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

export default new SupplierPaymentRequestsController();
