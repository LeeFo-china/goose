import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

const ownerId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const tenantId = "33333333-3333-4333-8333-333333333333";

const authContext: AuthContext = {
  authUserId: "auth-1",
  employeeId: ownerId,
  tenantId,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "测试员工",
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
  permissions: [{ code: "customer.create", scope: "all" }],
};

const getRequiredAuthContext = mock(async () => authContext);
const assertTenantContext = mock(() => tenantId);
const assertPermission = mock(() => "all");
const createCustomer = mock(async (payload: Record<string, unknown>) => ({
  id: customerId,
  tenant_id: tenantId,
  name: payload.name,
  phone: payload.phone,
  owner_id: payload.owner_id,
  status: "potential",
  source: null,
  avatar: null,
  douyin_screenshot_images: [],
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
}));
const initialize = mock(async () => ({
  status: "degraded" as const,
  attempts: 2,
  code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED" as const,
  reason: "exception",
}));
const assertActiveTenantOwner = mock(async () => undefined);
const upsertCustomerPrimaryProperty = mock(async () => null);
const createPrivacyContext = mock(async () => ({ authContext }));
const getLatestFollowUpMap = mock(async () => new Map());
const getCustomerSourceSummaryMap = mock(async () => new Map());
const getState = mock(async () => ({ workflow_state: null }));
const findLatestProject = mock(async () => null);

mock.module("@/services/authorization", () => ({
  authorizationService: { getRequiredAuthContext },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: { assertTenantContext, assertPermission },
}));

mock.module("@/services/customer-core", () => ({
  customerCoreService: {
    createCustomer,
    getFollowUpState: () => "none",
  },
}));

mock.module("@/services/customer-workflow-initialization", () => ({
  customerWorkflowInitializationService: { initialize },
}));

mock.module("@/services/customer-owner-assignments", () => ({
  customerOwnerAssignmentService: { assertActiveTenantOwner },
}));

mock.module("@/services/customer-properties", () => ({
  customerPropertyService: { upsertCustomerPrimaryProperty },
}));

mock.module("@/services/customer-phone-privacy", () => ({
  customerPhonePrivacyService: {
    createPrivacyContext,
    serializeCustomerPhoneFields: () => ({
      phone: "13800000000",
      phone_masked: "138****0000",
      can_view_phone: true,
      can_call_phone: true,
      can_copy_phone: true,
    }),
    maskPhone: () => "138****0000",
  },
}));

mock.module("@/services/customer-follow-ups", () => ({
  customerFollowUpService: { getLatestFollowUpMap },
}));

mock.module("@/services/customer-sources", () => ({
  customerSourceService: { getCustomerSourceSummaryMap },
}));

mock.module("@/services/workflow-subjects", () => ({
  workflowSubjectsService: { getState },
}));

mock.module("@/repositories/customer-core", () => ({
  customerCoreRepository: { findLatestProject },
}));

beforeEach(() => {
  initialize.mockClear();
  createCustomer.mockClear();
  assertActiveTenantOwner.mockClear();
});

describe("CustomerController.create workflow initialization", () => {
  test("returns degraded initialization metadata and emits a redacted structured log", async () => {
    const logError = mock(() => undefined);
    const request = {
      id: "request-1",
      method: "POST",
      routeOptions: {
        url: "/customers",
        config: { tenantServiceAccess: "write" },
      },
      user: { sub: "auth-1" },
      body: {
        name: "不得进入日志的客户姓名",
        phone: "13800000000",
        owner_id: ownerId,
      },
      log: {
        error: logError,
        warn: mock(() => undefined),
        info: mock(() => undefined),
      },
    } as unknown as FastifyRequest;
    const reply = {} as FastifyReply;
    const { default: customerController } = await import("./index");

    const response = await customerController.create(request, reply);

    expect(initialize).toHaveBeenCalledWith({
      authContext,
      tenantId,
      customerId,
      ownerId,
    });
    expect(response.data.workflow_initialization).toEqual({
      status: "degraded",
      attempts: 2,
      code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED",
      reason: "exception",
    });
    expect(logError).toHaveBeenCalledWith({
      requestId: "request-1",
      tenantId,
      customerId,
      code: "CUSTOMER_WORKFLOW_INITIALIZATION_FAILED",
      reason: "exception",
      attempts: 2,
    }, "[customer-create] workflow initialization degraded");

    const serializedLog = JSON.stringify(logError.mock.calls);
    expect(serializedLog).not.toContain("不得进入日志的客户姓名");
    expect(serializedLog).not.toContain("13800000000");
  });
});
