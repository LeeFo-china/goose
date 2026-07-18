import { Errors } from "@/errors/error-factory";
import { PAYMENT_TYPE_VALUES } from "@gooes/domain";
import type { Json } from "@/types/database";
import {
  billingRechargeRepository,
  type TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import { paymentRepository, type PaymentRecord } from "@/repositories/payments";
import {
  wechatPayOrderRepository,
  type WechatPayNotificationRecord,
  type WechatPayOrderRecord,
} from "@/repositories/wechat-pay-orders";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import type { AuthContext } from "@/services/authorization";
import {
  type CallbackHeaders,
  type CreditRechargeCallbackContext,
  type ProjectPaymentCallbackContext,
  WechatPayCallbackContextMatcher,
  type WechatPayCallbackContextMatcherDependencies,
} from "@/services/wechat-pay-callback-context-matcher";
import { billingSubscriptionService } from "@/services/billing-subscriptions";
import { handleCreditRechargeRefundCallback } from "@/services/wechat-pay-callback-refunds";
import { workflowTaskPaymentBridge } from "@/services/workflow-task-payment-bridge";

type OrderRepositoryPort = Pick<
  typeof wechatPayOrderRepository,
  | "findByOutTradeNo"
  | "findNotificationByNotifyId"
  | "createNotification"
  | "markNotificationProcessed"
  | "markNotificationFailed"
  | "markOrderPaid"
>;
type PaymentRepositoryPort = Pick<typeof paymentRepository, "create">;
type WorkflowTaskRepositoryPort = Pick<typeof workflowTaskRepository, "findById">;
type PaymentBridgePort = Pick<typeof workflowTaskPaymentBridge, "complete">;
type CreditRechargeRepositoryPort = Pick<
  typeof billingRechargeRepository,
  | "findWechatOrderByOutTradeNo"
  | "findWechatRefundRequestByOutRefundNo"
  | "findWechatNotificationByNotifyId"
  | "createWechatNotification"
  | "markWechatNotificationProcessed"
  | "markWechatNotificationFailed"
  | "confirmWechatRecharge"
  | "confirmWechatRechargeRefund"
  | "applyWechatRechargeRefundCallbackState"
>;

type WechatPayCallbackServiceDependencies =
  WechatPayCallbackContextMatcherDependencies & {
  contextMatcher?: Pick<WechatPayCallbackContextMatcher, "match">;
  orderRepository?: OrderRepositoryPort;
  creditRechargeRepository?: CreditRechargeRepositoryPort;
  billingSubscriptionService?: {
    recoverAfterRecharge: (tenantId: string) => Promise<unknown>;
  };
  paymentRepository?: PaymentRepositoryPort;
  workflowTaskRepository?: WorkflowTaskRepositoryPort;
  paymentBridge?: PaymentBridgePort;
};

const SUCCESS_RESPONSE = { code: "SUCCESS", message: "成功" } as const;
type PaymentType = (typeof PAYMENT_TYPE_VALUES)[number];

export class WechatPayCallbackService {
  private readonly contextMatcher: Pick<WechatPayCallbackContextMatcher, "match">;
  private readonly orderRepository: OrderRepositoryPort;
  private readonly creditRechargeRepository: CreditRechargeRepositoryPort;
  private readonly billingSubscriptionService: {
    recoverAfterRecharge: (tenantId: string) => Promise<unknown>;
  };
  private readonly paymentRepository: PaymentRepositoryPort;
  private readonly workflowTaskRepository: WorkflowTaskRepositoryPort;
  private readonly paymentBridge: PaymentBridgePort;

  constructor(dependencies: WechatPayCallbackServiceDependencies = {}) {
    this.contextMatcher = dependencies.contextMatcher ??
      new WechatPayCallbackContextMatcher(dependencies);
    this.orderRepository = dependencies.orderRepository ??
      wechatPayOrderRepository;
    this.creditRechargeRepository = dependencies.creditRechargeRepository ??
      billingRechargeRepository;
    this.billingSubscriptionService = dependencies.billingSubscriptionService ??
      billingSubscriptionService;
    this.paymentRepository = dependencies.paymentRepository ?? paymentRepository;
    this.workflowTaskRepository = dependencies.workflowTaskRepository ??
      workflowTaskRepository;
    this.paymentBridge = dependencies.paymentBridge ?? workflowTaskPaymentBridge;
  }

  async handleCallback(input: {
    rawBody: string;
    headers: CallbackHeaders;
  }) {
    const payload = this.parsePayload(input.rawBody);
    const matched = await this.contextMatcher.match({
      rawBody: input.rawBody,
      headers: input.headers,
      payload,
    });
    const notifyId = this.requireString(payload, "id", "回调通知 ID 缺失");
    if (matched.kind === "credit_recharge_refund") {
      return handleCreditRechargeRefundCallback({
        matched,
        notifyId,
        payload,
        repository: this.creditRechargeRepository,
      });
    }
    if (matched.kind === "credit_recharge") {
      return this.handleCreditRechargeCallback({ matched, notifyId, payload });
    }

    return this.handleProjectPaymentCallback({ matched, notifyId, payload });
  }

  private async handleProjectPaymentCallback(input: {
    matched: ProjectPaymentCallbackContext;
    notifyId: string;
    payload: Record<string, unknown>;
  }) {
    const { matched, notifyId, payload } = input;
    const existing = await this.orderRepository.findNotificationByNotifyId({
      tenantId: matched.order.tenant_id,
      notifyId,
    });
    if (existing?.processed) {
      return SUCCESS_RESPONSE;
    }

    const notification = existing ?? await this.orderRepository.createNotification({
      tenant_id: matched.order.tenant_id,
      order_id: matched.order.id,
      notify_id: notifyId,
      event_type: this.requireString(payload, "event_type", "回调事件类型缺失"),
      resource_type: this.optionalString(payload.resource_type),
      summary: this.optionalString(payload.summary),
      raw_payload: payload as Json,
      signature_valid: true,
      processed: false,
    });

    try {
      await this.processSuccessfulTransaction({ matched, notification });
      await this.orderRepository.markNotificationProcessed({
        tenantId: matched.order.tenant_id,
        notificationId: notification.id,
      });
      return SUCCESS_RESPONSE;
    } catch (error) {
      await this.orderRepository.markNotificationFailed({
        tenantId: matched.order.tenant_id,
        notificationId: notification.id,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  }

  private async handleCreditRechargeCallback(input: {
    matched: CreditRechargeCallbackContext;
    notifyId: string;
    payload: Record<string, unknown>;
  }) {
    const { matched, notifyId, payload } = input;
    const existing =
      await this.creditRechargeRepository.findWechatNotificationByNotifyId({
        notifyId,
      });
    if (existing?.processed) {
      return SUCCESS_RESPONSE;
    }

    const notification = existing ??
      await this.creditRechargeRepository.createWechatNotification({
        tenant_id: matched.order.tenant_id,
        credit_order_id: matched.order.id,
        notify_id: notifyId,
        event_type: this.requireString(
          payload,
          "event_type",
          "回调事件类型缺失",
        ),
        resource_type: this.optionalString(payload.resource_type),
        raw_payload: payload as Record<string, unknown>,
        signature_valid: true,
        processed: false,
      });

    try {
      await this.processCreditRechargeTransaction({ matched, notification });
      await this.creditRechargeRepository.markWechatNotificationProcessed({
        notificationId: notification.id,
      });
      return SUCCESS_RESPONSE;
    } catch (error) {
      await this.creditRechargeRepository.markWechatNotificationFailed({
        notificationId: notification.id,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  }

  private async processSuccessfulTransaction(input: {
    matched: ProjectPaymentCallbackContext;
    notification: WechatPayNotificationRecord;
  }) {
    const { matched, notification } = input;
    if (matched.resource.trade_state !== "SUCCESS") {
      return;
    }
    if (matched.order.status === "paid" && matched.order.payment_id) {
      return;
    }
    this.assertCallbackAmountMatchesOrder(matched);

    const payment = await this.paymentRepository.create(
      this.buildPaymentInput(matched),
    );
    const task = await this.requireWorkflowTask(matched.order);
    await this.paymentBridge.complete({
      authContext: this.buildCallbackAuthContext(matched.order),
      task,
      action: "complete",
      output: {
        provider: "wechat_pay",
        out_trade_no: matched.order.out_trade_no,
        transaction_id: this.requireString(
          matched.resource,
          "transaction_id",
          "微信支付交易号缺失",
        ),
        notification_id: notification.id,
      },
    });
    await this.orderRepository.markOrderPaid({
      tenantId: matched.order.tenant_id,
      orderId: matched.order.id,
      paymentId: payment.id,
      transactionId: this.requireString(
        matched.resource,
        "transaction_id",
        "微信支付交易号缺失",
      ),
      paidAmount: this.fenToYuan(this.getResourceAmountTotal(matched.resource)),
      paidAt: this.optionalString(matched.resource.success_time) ??
        new Date().toISOString(),
      notificationId: notification.id,
    });
  }

  private async processCreditRechargeTransaction(input: {
    matched: CreditRechargeCallbackContext;
    notification: TenantCreditWechatNotificationRecord;
  }) {
    const { matched, notification } = input;
    if (matched.resource.trade_state !== "SUCCESS") {
      return;
    }
    if (matched.order.status === "paid" && matched.order.transaction_id) {
      return;
    }

    const paidAmountFen = this.getResourceAmountTotal(matched.resource);
    if (paidAmountFen !== matched.order.amount_fen) {
      throw Errors.business(
        409,
        "微信支付积分充值回调金额与订单金额不一致",
        "BILLING_RECHARGE_CALLBACK_AMOUNT_MISMATCH",
        {
          order_amount_fen: matched.order.amount_fen,
          callback_amount_fen: paidAmountFen,
          out_trade_no: matched.order.out_trade_no,
        },
      );
    }

    await this.creditRechargeRepository.confirmWechatRecharge({
      orderId: matched.order.id,
      transactionId: this.requireString(
        matched.resource,
        "transaction_id",
        "微信支付交易号缺失",
      ),
      paidAmountFen,
      paidAt: this.optionalString(matched.resource.success_time) ??
        new Date().toISOString(),
      notificationId: notification.id,
      metadata: {
        callback_notify_id: notification.notify_id,
        out_trade_no: matched.order.out_trade_no,
      },
    });
    await this.billingSubscriptionService.recoverAfterRecharge(
      matched.order.tenant_id,
    );
  }

  private buildPaymentInput(matched: ProjectPaymentCallbackContext) {
    const transactionId = this.requireString(
      matched.resource,
      "transaction_id",
      "微信支付交易号缺失",
    );
    return {
      project_id: matched.order.project_id,
      amount: this.fenToYuan(this.getResourceAmountTotal(matched.resource)),
      type: this.getPaymentType(matched.order),
      status: "confirmed" as const,
      evidence_images: [],
      handled_by: matched.order.created_by_employee_id,
      pay_date: this.optionalString(matched.resource.success_time) ??
        new Date().toISOString(),
      workflow_task_id: matched.order.workflow_task_id,
      source_type: "wechat_pay_order",
      source_id: matched.order.id,
      remark: "微信支付回调确认收款",
      payment_channel: "wechat_pay",
      provider: "wechat_pay",
      provider_transaction_id: transactionId,
      out_trade_no: matched.order.out_trade_no,
    };
  }

  private assertCallbackAmountMatchesOrder(matched: ProjectPaymentCallbackContext) {
    const callbackAmountFen = this.getResourceAmountTotal(matched.resource);
    const orderAmountFen = Math.round(Number(matched.order.amount || 0) * 100);
    if (callbackAmountFen !== orderAmountFen) {
      throw Errors.business(
        409,
        "微信支付回调金额与订单金额不一致",
        "WECHAT_PAY_CALLBACK_AMOUNT_MISMATCH",
        {
          order_amount: Number(matched.order.amount || 0),
          callback_amount: this.fenToYuan(callbackAmountFen),
          out_trade_no: matched.order.out_trade_no,
        },
      );
    }
  }

  private async requireWorkflowTask(order: WechatPayOrderRecord) {
    if (!order.workflow_task_id) {
      throw Errors.business(
        409,
        "微信支付订单未关联流程待办",
        "WECHAT_PAY_ORDER_TASK_MISSING",
      );
    }
    const task = await this.workflowTaskRepository.findById({
      tenantId: order.tenant_id,
      taskId: order.workflow_task_id,
    });
    if (!task?.instance) {
      throw Errors.business(
        404,
        "微信支付订单关联的流程待办不存在",
        "WECHAT_PAY_ORDER_TASK_NOT_FOUND",
      );
    }

    return {
      id: task.id,
      tenant_id: task.tenant_id,
      definition_id: task.definition_id,
      instance_id: task.instance_id,
      instance_node_id: task.instance_node_id,
      created_at: task.created_at,
      node_key: task.node_key,
      instance: {
        subject_id: task.instance.subject_id,
        current_node_snapshot: task.instance.current_node_snapshot,
      },
    };
  }

  private buildCallbackAuthContext(order: WechatPayOrderRecord): AuthContext {
    return {
      authUserId: "wechat-pay-callback",
      employeeId: order.created_by_employee_id,
      tenantId: order.tenant_id,
      tenantName: null,
      tenantSlug: null,
      tenantStatus: "active",
      isPlatformAdmin: false,
      employeeName: "微信支付回调",
      employeeStatus: "active",
      departmentId: null,
      tenantDepartmentId: null,
      departmentCode: null,
      departmentName: null,
      postId: null,
      postName: null,
      avatar: null,
      roleCodes: [],
      roles: [],
      permissions: [{ code: "finance.payment.confirm", scope: "all" }],
    };
  }

  private parsePayload(rawBody: string) {
    try {
      const payload: unknown = JSON.parse(rawBody);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw Errors.badRequest("微信支付回调格式不正确");
      }
      return payload as Record<string, unknown>;
    } catch (error) {
      if (isAppErrorLike(error)) throw error;
      throw Errors.badRequest("微信支付回调 JSON 格式不正确");
    }
  }

  private requireString(
    record: Record<string, unknown>,
    key: string,
    message: string,
  ) {
    const value = this.optionalString(record[key]);
    if (!value) {
      throw Errors.badRequest(message);
    }
    return value;
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private getResourceAmountTotal(resource: Record<string, unknown>) {
    const amount = resource.amount;
    if (!amount || typeof amount !== "object" || Array.isArray(amount)) {
      throw Errors.badRequest("微信支付回调金额缺失");
    }
    const total = Number((amount as Record<string, unknown>).total ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      throw Errors.badRequest("微信支付回调金额不正确");
    }
    return total;
  }

  private fenToYuan(amount: number) {
    return Math.round(amount) / 100;
  }

  private getPaymentType(order: WechatPayOrderRecord): PaymentType {
    const metadata = order.metadata;
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const paymentType = (metadata as Record<string, unknown>).payment_type;
      if (
        typeof paymentType === "string" &&
        PAYMENT_TYPE_VALUES.includes(paymentType as PaymentType)
      ) {
        return paymentType as PaymentType;
      }
    }
    return "deposit";
  }
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "微信支付回调处理失败";
}

function isAppErrorLike(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "statusCode" in error &&
      "code" in error,
  );
}

export const wechatPayCallbackService = new WechatPayCallbackService();
