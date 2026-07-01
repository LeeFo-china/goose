import { randomUUID } from "node:crypto";
import { Errors } from "@/errors/error-factory";
import {
  wechatPayOrderRepository,
  type WechatPayOrderCreateInput,
  type WechatPayOrderListItem,
  type WechatPayOrderRecord,
  type WechatPayReceivablePlanRecord,
} from "@/repositories/wechat-pay-orders";
import { workflowTaskRepository } from "@/repositories/workflow-tasks";
import {
  wechatPayConfigRepository,
  type WechatPayConfigRecord,
} from "@/repositories/wechat-pay-configs";
import type {
  CreateWechatPayOrderInput,
  WechatPayOrderListQuery,
} from "@/schema/wechat-pay-orders";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import type { JsonObject } from "@/repositories/workflows";
import {
  wechatPayGateway,
  type WechatPayCreateJsapiPrepayResult,
} from "@/services/wechat-pay-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";

type WorkflowTaskRepositoryPort = Pick<typeof workflowTaskRepository, "findById">;
type WechatPayConfigRepositoryPort = Pick<
  typeof wechatPayConfigRepository,
  "findWechatPayConfig"
>;

type WechatPayOrderRepositoryPort = {
  findPendingByWorkflowTask: typeof wechatPayOrderRepository.findPendingByWorkflowTask;
  findReceivablePlan: typeof wechatPayOrderRepository.findReceivablePlan;
  createOrder: typeof wechatPayOrderRepository.createOrder;
  markPrepayCreated: typeof wechatPayOrderRepository.markPrepayCreated;
  listOrders: typeof wechatPayOrderRepository.listOrders;
};

type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

type WechatPayOrderServiceDependencies = {
  orderRepository?: WechatPayOrderRepositoryPort;
  workflowTaskRepository?: WorkflowTaskRepositoryPort;
  configRepository?: WechatPayConfigRepositoryPort;
  secretBundleService?: {
    load: (encryptedConfigRef: string | null) => Promise<WechatPaySecretBundle>;
  };
  wechatPayGateway?: {
    createJsapiPrepay: (input: {
      config: WechatPayConfigRecord;
      order: WechatPayOrderRecord;
      description: string;
      secretBundle: WechatPaySecretBundle;
    }) => Promise<WechatPayCreateJsapiPrepayResult>;
  };
  accessPolicyService?: AccessPolicyPort;
  tradeNoFactory?: () => string;
};

export type WechatPayOrderView = Omit<WechatPayOrderRecord, "amount" | "paid_amount"> & {
  amount: number;
  paid_amount: number;
};

export type WechatPayOrderCreateResult = {
  idempotent: boolean;
  payment_request: WechatPayCreateJsapiPrepayResult["paymentRequest"] | null;
  order: WechatPayOrderView;
  receivable_plan: {
    id: string;
    title: string;
    amount: number;
    paid_amount: number;
    remaining_amount: number;
    status: string;
  } | null;
};

export class WechatPayOrderService {
  private readonly orderRepository: WechatPayOrderRepositoryPort;
  private readonly workflowTaskRepository: WorkflowTaskRepositoryPort;
  private readonly configRepository: WechatPayConfigRepositoryPort;
  private readonly secretBundleService: NonNullable<
    WechatPayOrderServiceDependencies["secretBundleService"]
  >;
  private readonly wechatPayGateway: NonNullable<
    WechatPayOrderServiceDependencies["wechatPayGateway"]
  >;
  private readonly accessPolicyService: AccessPolicyPort;
  private readonly tradeNoFactory: () => string;

  constructor(dependencies: WechatPayOrderServiceDependencies = {}) {
    this.orderRepository = dependencies.orderRepository ?? wechatPayOrderRepository;
    this.workflowTaskRepository =
      dependencies.workflowTaskRepository ?? workflowTaskRepository;
    this.configRepository = dependencies.configRepository ??
      wechatPayConfigRepository;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.accessPolicyService =
      dependencies.accessPolicyService ?? accessPolicyService;
    this.tradeNoFactory = dependencies.tradeNoFactory ?? createOutTradeNo;
  }

  async createOrder(
    authContext: AuthContext,
    input: CreateWechatPayOrderInput,
  ): Promise<WechatPayOrderCreateResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    const task = await this.workflowTaskRepository.findById({
      tenantId,
      taskId: input.workflow_task_id,
    });
    if (!task) {
      throw Errors.business(
        404,
        "流程待办不存在",
        "WECHAT_PAY_TASK_NOT_FOUND",
      );
    }
    this.assertTaskExecutable({ authContext, task, input });

    const existing = await this.orderRepository.findPendingByWorkflowTask({
      tenantId,
      workflowTaskId: input.workflow_task_id,
    });
    if (existing) {
      return {
        idempotent: true,
        payment_request: null,
        order: this.toOrderView(existing),
        receivable_plan: null,
      };
    }

    const receivablePlan = await this.orderRepository.findReceivablePlan({
      tenantId,
      planId: input.receivable_plan_id,
    });
    this.assertReceivablePlan(input, receivablePlan);

    const config = await this.configRepository.findWechatPayConfig(tenantId);
    this.assertPaymentConfigReady(config);
    const orderInput = this.buildCreateInput({
      authContext,
      config,
      input,
      receivablePlan,
      tenantId,
      task,
    });
    const order = await this.orderRepository.createOrder(orderInput);
    const prepay = await this.createPrepay({
      config,
      order,
      taskTitle: task.title,
    });
    const orderWithPrepay = await this.orderRepository.markPrepayCreated({
      tenantId,
      orderId: order.id,
      prepayId: prepay.prepayId,
    });

    return {
      idempotent: false,
      payment_request: prepay.paymentRequest,
      order: this.toOrderView(orderWithPrepay),
      receivable_plan: this.toReceivablePlanView(receivablePlan),
    };
  }

  async listOrders(
    authContext: AuthContext,
    query: WechatPayOrderListQuery,
  ) {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (!this.accessPolicyService.hasPermission(
      authContext,
      "wechat_pay.order.read",
    )) {
      throw Errors.forbidden();
    }

    return this.orderRepository.listOrders({ tenantId, query });
  }

  private assertTaskExecutable(input: {
    authContext: AuthContext;
    task: NonNullable<Awaited<ReturnType<WorkflowTaskRepositoryPort["findById"]>>>;
    input: CreateWechatPayOrderInput;
  }) {
    const { authContext, task } = input;
    if (task.status !== "pending") {
      throw Errors.business(
        409,
        "流程待办已处理",
        "WECHAT_PAY_TASK_NOT_PENDING",
      );
    }
    if (!task.instance) {
      throw Errors.business(
        409,
        "流程实例不存在",
        "WECHAT_PAY_INSTANCE_NOT_FOUND",
      );
    }
    if (
      task.instance.subject_type !== "project" ||
      task.instance.subject_id !== input.input.project_id
    ) {
      throw Errors.business(
        409,
        "流程待办与项目不匹配",
        "WECHAT_PAY_TASK_PROJECT_MISMATCH",
      );
    }
    if (task.instance.current_node_key !== task.node_key) {
      throw Errors.business(
        409,
        "节点不是当前待处理节点",
        "WECHAT_PAY_NODE_NOT_CURRENT",
        { current_node_key: task.instance.current_node_key ?? null },
      );
    }
    const snapshot = asRecord(task.instance.current_node_snapshot);
    if (snapshot?.business_kind !== "payment_collection") {
      throw Errors.business(
        409,
        "当前流程待办不是收款节点",
        "WECHAT_PAY_TASK_NOT_PAYMENT_COLLECTION",
      );
    }
    if (!canExecuteWorkflowTask(authContext, task)) {
      throw Errors.business(
        403,
        "无权限创建该收款任务的微信支付订单",
        "WECHAT_PAY_TASK_NOT_EXECUTABLE",
      );
    }
  }

  private assertReceivablePlan(
    input: CreateWechatPayOrderInput,
    plan: WechatPayReceivablePlanRecord | null,
  ): asserts plan is WechatPayReceivablePlanRecord {
    if (!plan) {
      throw Errors.business(
        404,
        "应收计划不存在",
        "WECHAT_PAY_RECEIVABLE_NOT_FOUND",
      );
    }
    if (plan.project_id !== input.project_id) {
      throw Errors.business(
        409,
        "应收计划与项目不匹配",
        "WECHAT_PAY_RECEIVABLE_PROJECT_MISMATCH",
        {
          receivable_plan_id: plan.id,
          receivable_project_id: plan.project_id,
          project_id: input.project_id,
        },
      );
    }

    const remainingAmount = getReceivableRemainingAmount(plan);
    if (input.amount > remainingAmount) {
      throw Errors.business(
        409,
        "微信支付订单金额不能超过应收剩余金额",
        "WECHAT_PAY_AMOUNT_EXCEEDS_RECEIVABLE",
        {
          receivable_plan_id: plan.id,
          receivable_amount: plan.amount,
          receivable_paid_amount: plan.paid_amount,
          receivable_remaining_amount: remainingAmount,
          order_amount: input.amount,
        },
      );
    }
  }

  private assertPaymentConfigReady(
    config: WechatPayConfigRecord | null,
  ): asserts config is WechatPayConfigRecord {
    if (!config || config.status !== "active") {
      throw Errors.business(
        409,
        "微信支付配置未启用",
        "WECHAT_PAY_CONFIG_NOT_ACTIVE",
      );
    }
    if (!config.merchant_id || !config.app_id) {
      throw Errors.business(
        409,
        "微信支付商户号或 AppID 未配置",
        "WECHAT_PAY_CONFIG_INCOMPLETE",
      );
    }
    if (config.merchant_mode !== "service_provider_sub_merchant") {
      return;
    }
    if (
      !config.sub_merchant_id ||
      !config.sub_app_id ||
      config.applyment_state !== "opened" ||
      config.appid_binding_state !== "bound"
    ) {
      throw Errors.business(
        409,
        "租户特约商户尚未开通或 AppID 未完成绑定",
        "WECHAT_PAY_SUB_MERCHANT_NOT_READY",
        {
          applyment_state: config.applyment_state,
          appid_binding_state: config.appid_binding_state,
          has_sub_merchant_id: Boolean(config.sub_merchant_id),
          has_sub_app_id: Boolean(config.sub_app_id),
        },
      );
    }
  }

  private buildCreateInput(input: {
    authContext: AuthContext;
    config: WechatPayConfigRecord;
    input: CreateWechatPayOrderInput;
    receivablePlan: WechatPayReceivablePlanRecord;
    tenantId: string;
    task: NonNullable<Awaited<ReturnType<WorkflowTaskRepositoryPort["findById"]>>>;
  }): WechatPayOrderCreateInput {
    return {
      tenant_id: input.tenantId,
      payment_config_id: input.config.id,
      project_id: input.input.project_id,
      workflow_instance_id: input.task.instance_id,
      workflow_task_id: input.input.workflow_task_id,
      receivable_plan_id: input.input.receivable_plan_id,
      out_trade_no: this.tradeNoFactory(),
      amount: input.input.amount,
      payer_openid: input.input.payer_openid ?? null,
      status: "pending",
      currency: "CNY",
      created_by_employee_id: input.authContext.employeeId ?? null,
      metadata: {
        source: "workflow_task",
        workflow_task_id: input.input.workflow_task_id,
        workflow_node_key: input.task.node_key,
        receivable_plan_id: input.receivablePlan.id,
        payment_type: input.receivablePlan.payment_type,
        principal_type: input.config.principal_type,
        merchant_mode: input.config.merchant_mode,
        merchant_id: input.config.merchant_id,
        sub_merchant_id: input.config.sub_merchant_id,
        app_id: input.config.app_id,
        sub_app_id: input.config.sub_app_id,
        real_wechat_prepay_created: false,
      } satisfies JsonObject,
    };
  }

  private async createPrepay(input: {
    config: WechatPayConfigRecord;
    order: WechatPayOrderRecord;
    taskTitle: string;
  }) {
    const secretBundle = await this.secretBundleService.load(
      input.config.encrypted_config_ref,
    );
    return this.wechatPayGateway.createJsapiPrepay({
      config: input.config,
      order: input.order,
      description: input.taskTitle || "项目收款",
      secretBundle,
    });
  }

  private toReceivablePlanView(plan: WechatPayReceivablePlanRecord) {
    return {
      id: plan.id,
      title: plan.title,
      amount: plan.amount,
      paid_amount: plan.paid_amount,
      remaining_amount: getReceivableRemainingAmount(plan),
      status: plan.status,
    };
  }

  private toOrderView(order: WechatPayOrderRecord): WechatPayOrderView {
    return {
      ...order,
      amount: normalizeMoney(order.amount),
      paid_amount: normalizeMoney(order.paid_amount),
    };
  }
}

function canExecuteWorkflowTask(
  authContext: AuthContext,
  task: {
    assignee_employee_id: string | null;
    assignee_role_code: string | null;
    assignee_permission_code: string | null;
  },
) {
  if (task.assignee_employee_id) {
    return task.assignee_employee_id === authContext.employeeId;
  }
  if (task.assignee_role_code) {
    return authContext.roleCodes.includes(task.assignee_role_code);
  }
  if (task.assignee_permission_code) {
    return authContext.permissions.some((permission) =>
      permission.code === task.assignee_permission_code
    );
  }

  return true;
}

function getReceivableRemainingAmount(plan: WechatPayReceivablePlanRecord) {
  return Math.max(normalizeMoney(plan.amount) - normalizeMoney(plan.paid_amount), 0);
}

function normalizeMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function createOutTradeNo() {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds()),
  ].join("");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return `WX${timestamp}${suffix}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export const wechatPayOrderService = new WechatPayOrderService();
