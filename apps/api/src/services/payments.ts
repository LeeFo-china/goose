import { Errors } from "@/errors/error-factory";
import { paymentRepository } from "@/repositories/payments";
import type {
  CreatePaymentInput,
  PaymentListQuery,
  UpdatePaymentInput,
} from "@/schema/payment";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

class PaymentService {
  private normalizePaymentInput<T extends CreatePaymentInput | UpdatePaymentInput>(
    input: T,
  ): T {
    const normalized = { ...input } as T & {
      paid_at?: string | null;
      pay_date?: string | null;
    };

    if (normalized.paid_at && !normalized.pay_date) {
      normalized.pay_date = normalized.paid_at;
    }
    delete normalized.paid_at;

    return normalized as T;
  }

  private requireProjectId(projectId: string | null | undefined) {
    if (!projectId) {
      throw Errors.badRequest("收款记录必须关联项目");
    }

    return projectId;
  }

  private async getReadableProjectIds(authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );

    if (visibleProjectIds === null) {
      return paymentRepository.listProjectIdsByTenant(tenantId);
    }

    return visibleProjectIds;
  }

  private async assertProjectAccess(
    authContext: AuthContext,
    projectId: string,
    permissionCode: "project.read" | "project.update",
  ) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      permissionCode,
    );

    if (!hasAccess) {
      throw Errors.forbidden();
    }
  }

  async listPayments(authContext: AuthContext, params: PaymentListQuery) {
    const projectIds = await this.getReadableProjectIds(authContext);

    if (params.project_id && !projectIds.includes(params.project_id)) {
      throw Errors.forbidden();
    }

    return paymentRepository.list(params, projectIds);
  }

  async getPaymentById(authContext: AuthContext, id: string) {
    const payment = await paymentRepository.findById(id);
    if (!payment) {
      throw Errors.badRequest("收款记录不存在");
    }

    const projectId = this.requireProjectId(payment.project_id);
    await this.assertProjectAccess(authContext, projectId, "project.read");
    return payment;
  }

  async createPayment(authContext: AuthContext, input: CreatePaymentInput) {
    const projectId = this.requireProjectId(input.project_id);
    await this.assertProjectAccess(authContext, projectId, "project.update");
    return paymentRepository.create({
      ...this.normalizePaymentInput(input),
      project_id: projectId,
    });
  }

  async updatePayment(
    authContext: AuthContext,
    id: string,
    input: UpdatePaymentInput,
  ) {
    const existing = await paymentRepository.findById(id);
    if (!existing) {
      throw Errors.badRequest("收款记录不存在");
    }

    const existingProjectId = this.requireProjectId(existing.project_id);
    await this.assertProjectAccess(authContext, existingProjectId, "project.update");

    if (input.project_id === null) {
      throw Errors.badRequest("收款记录必须关联项目");
    }

    if (input.project_id && input.project_id !== existingProjectId) {
      await this.assertProjectAccess(authContext, input.project_id, "project.update");
    }

    return paymentRepository.update(id, this.normalizePaymentInput(input));
  }
}

export const paymentService = new PaymentService();
