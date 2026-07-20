import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { AuthContext } from "@/services/authorization";

export const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const projectId = "11111111-1111-4111-8111-111111111111";
export const receivablePlanId = "22222222-2222-4222-8222-222222222222";
export const workflowTaskId = "33333333-3333-4333-8333-333333333333";
export const workflowInstanceId = "44444444-4444-4444-8444-444444444444";
export const paymentConfigId = "55555555-5555-4555-8555-555555555555";
export const employeeId = "66666666-6666-4666-8666-666666666666";

export const paymentCollectionTask = {
  id: workflowTaskId,
  tenant_id: tenantId,
  instance_id: workflowInstanceId,
  instance_node_id: "77777777-7777-4777-8777-777777777777",
  definition_id: "88888888-8888-4888-8888-888888888888",
  version_id: "99999999-9999-4999-8999-999999999999",
  node_id: "aaaaaaaa-bbbb-4bbb-8bbb-aaaaaaaaaaaa",
  node_key: "payment_stage_2",
  node_type: "confirmation" as const,
  title: "中期进度款",
  status: "pending" as const,
  assignee_employee_id: null,
  assignee_role_code: null,
  assignee_permission_code: "finance.payment.confirm",
  due_at: null,
  completed_by: null,
  completed_at: null,
  created_at: "2026-07-01T10:00:00.000Z",
  updated_at: "2026-07-01T10:00:00.000Z",
  instance: {
    id: workflowInstanceId,
    subject_type: "project" as const,
    subject_id: projectId,
    status: "running" as const,
    current_node_key: "payment_stage_2",
    current_node_snapshot: {
      business_kind: "payment_collection",
      config: {
        payment_type: "stage_2",
      },
    },
  },
};

export const receivablePlan = {
  id: receivablePlanId,
  tenant_id: tenantId,
  project_id: projectId,
  workflow_instance_id: workflowInstanceId,
  workflow_node_key: "payment_stage_2",
  source_type: "workflow_node",
  source_id: "77777777-7777-4777-8777-777777777777",
  payment_type: "stage_2",
  title: "中期进度款",
  amount: 10000,
  paid_amount: 2000,
  status: "partially_paid",
  due_date: "2026-07-01",
};

export const activeConfig: WechatPayConfigRecord = {
  id: paymentConfigId,
  tenant_id: tenantId,
  platform_payment_config_id: null,
  provider: "wechat_pay",
  principal_type: "tenant",
  merchant_mode: "direct_merchant",
  merchant_name: "固始晴天装饰微信商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-app-1",
  sub_app_id: null,
  applyment_business_code: null,
  applyment_id: null,
  applyment_state: "not_started",
  applyment_state_message: null,
  appid_binding_state: "not_required",
  appid_binding_message: null,
  opened_at: null,
  suspended_at: null,
  status: "active",
  enabled_at: null,
  disabled_at: null,
  enabled_channels: ["project_payment"],
  settlement_account_summary: null,
  encrypted_config_ref: "env://WECHAT_PAY_TEST",
  risk_switches: {},
  serial_no: "TEST-SERIAL",
  notify_url: "https://api.example.com/pay/wechat/callback",
  validation_status: "valid",
  last_validated_at: null,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T09:00:00.000Z",
  updated_at: "2026-07-01T09:00:00.000Z",
};

export const pendingOrder = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  tenant_id: tenantId,
  payment_config_id: paymentConfigId,
  project_id: projectId,
  workflow_instance_id: workflowInstanceId,
  workflow_task_id: workflowTaskId,
  receivable_plan_id: receivablePlanId,
  payment_id: null,
  out_trade_no: "WX202607010001",
  transaction_id: null,
  amount: 8000,
  paid_amount: 0,
  currency: "CNY",
  status: "pending",
  payer_openid: null,
  prepay_id: null,
  paid_at: null,
  closed_at: null,
  failed_at: null,
  failure_reason: null,
  latest_notification_id: null,
  metadata: {},
  created_by_employee_id: employeeId,
  created_at: "2026-07-01T10:01:00.000Z",
  updated_at: "2026-07-01T10:01:00.000Z",
};

export function authContext(
  permissions: AuthContext["permissions"] = [
    { code: "finance.payment.confirm", scope: "all" },
  ],
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId,
    tenantId,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "小龙女",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "FINANCE",
    departmentName: "财务部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions,
    ...overrides,
  };
}
