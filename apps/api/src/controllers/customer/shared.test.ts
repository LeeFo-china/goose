import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const getPrimaryCustomerPropertySummary = mock(async () => null);
const getCustomerPropertySummaries = mock(async () => []);
const getLatestFollowUpMap = mock(async () => new Map());
const getCustomerSourceSummaryMap = mock(async () => new Map());
const getFollowUpState = mock(() => "none");
const serializeCustomerPhoneFields = mock(() => ({
  phone: "13200001003",
  phone_masked: "132****1003",
  can_view_phone: true,
  can_call_phone: true,
  can_copy_phone: true,
}));
const warnLog = mock(() => undefined);
const getState = mock(async () => ({
  workflow_state: {
    subject_type: "customer",
    subject_id: "customer-1",
    instance_id: "instance-1",
    current_node_key: "potential",
    actions: [
      {
        key: "complete",
        task_id: "task-1",
        node_key: "potential",
        node_type: "business",
        business_domain: "customer_status",
        business_action: "start_following",
        disabled: false,
        requires_reason: false,
        output_fields: [],
      },
    ],
  },
}));

mock.module("@/services/customer-properties", () => ({
  customerPropertyService: {
    getPrimaryCustomerPropertySummary,
    getCustomerPropertySummaries,
    serializePropertySummary: (item: unknown) => item,
  },
}));

mock.module("@/services/customer-follow-ups", () => ({
  customerFollowUpService: {
    getLatestFollowUpMap,
  },
}));

mock.module("@/services/customer-sources", () => ({
  customerSourceService: {
    getCustomerSourceSummaryMap,
  },
}));

mock.module("@/services/customer-phone-privacy", () => ({
  customerPhonePrivacyService: {
    maskPhone: (phone: string | null | undefined) => phone ?? null,
    serializeCustomerPhoneFields,
  },
}));

mock.module("@/services/customer-core", () => ({
  customerCoreService: {
    getFollowUpState,
  },
}));

mock.module("@/services/workflow-subjects", () => ({
  workflowSubjectsService: {
    getState,
  },
}));

let CustomerBaseController: typeof import("./shared").CustomerBaseController;

describe("CustomerBaseController.buildCustomerDetailResponse", () => {
  beforeAll(async () => {
    ({ CustomerBaseController } = await import("./shared"));
  });

  beforeEach(() => {
    getPrimaryCustomerPropertySummary.mockClear();
    getCustomerPropertySummaries.mockClear();
    getLatestFollowUpMap.mockClear();
    getCustomerSourceSummaryMap.mockClear();
    getFollowUpState.mockClear();
    serializeCustomerPhoneFields.mockClear();
    getState.mockClear();
    warnLog.mockClear();
  });

  test("includes accessible customer workflow state for detail responses", async () => {
    class TestCustomerController extends CustomerBaseController {
      buildDetail(
        customer: Record<string, unknown>,
        options: Record<string, unknown>,
      ) {
        return this.buildCustomerDetailResponse(customer as never, options as never);
      }
    }

    const controller = new TestCustomerController();

    const response = await controller.buildDetail(
      {
        id: "customer-1",
        name: "苏有朋",
        phone: "13200001003",
        status: "potential",
        owner_id: "employee-1",
        owner: { id: "employee-1", name: "珠珠", phone: "18800001002" },
        avatar: null,
        douyin_screenshot_images: [],
      },
      {
        tenantId: "tenant-1",
        authContext: {
          tenantId: "tenant-1",
          employeeId: "employee-1",
          roleCodes: [],
          permissions: [{ code: "customer.update" }],
        },
      },
    );

    expect(getState).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        employeeId: "employee-1",
      }),
      {
        subjectType: "customer",
        subjectId: "customer-1",
      },
    );
    expect(response.workflow_state).toMatchObject({
      subject_type: "customer",
      subject_id: "customer-1",
      current_node_key: "potential",
      actions: [
        expect.objectContaining({
          task_id: "task-1",
          key: "complete",
          business_action: "start_following",
        }),
      ],
    });
  });

  test("keeps customer detail available when workflow state loading fails", async () => {
    getState.mockImplementationOnce(async () => {
      throw new Error("查询流程待办失败");
    });

    class TestCustomerController extends CustomerBaseController {
      buildDetail(
        customer: Record<string, unknown>,
        options: Record<string, unknown>,
      ) {
        return this.buildCustomerDetailResponse(customer as never, options as never);
      }
    }

    const controller = new TestCustomerController();

    const response = await controller.buildDetail(
      {
        id: "customer-1",
        name: "苏有朋",
        phone: "13200001003",
        status: "potential",
        owner_id: "employee-1",
        owner: { id: "employee-1", name: "珠珠", phone: "18800001002" },
        avatar: null,
        douyin_screenshot_images: [],
      },
      {
        tenantId: "tenant-1",
        authContext: {
          tenantId: "tenant-1",
          employeeId: "employee-1",
          roleCodes: [],
          permissions: [{ code: "customer.update" }],
        },
        request: {
          id: "request-1",
          log: {
            warn: warnLog,
          },
        },
      },
    );

    expect(response.id).toBe("customer-1");
    expect(response.workflow_state).toBeNull();
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-1",
        tenantId: "tenant-1",
        customerId: "customer-1",
        employeeId: "employee-1",
        err: expect.any(Error),
      }),
      "[customer-detail] workflow_state load failed",
    );
  });

  test("keeps full customer phone permission-gated in detail responses", async () => {
    class TestCustomerController extends CustomerBaseController {
      buildDetail(customer: Record<string, unknown>, options: Record<string, unknown>) {
        return this.buildCustomerDetailResponse(customer as never, options as never);
      }
    }

    const response = await new TestCustomerController().buildDetail(
      {
        id: "customer-1",
        name: "李女士",
        phone: "13800138000",
        status: "potential",
        owner_id: null,
        avatar: null,
        douyin_screenshot_images: [],
      },
      {
        tenantId: "tenant-1",
        phonePrivacyContext: {
          authContext: {
            tenantId: "tenant-1",
            employeeId: "employee-1",
            roleCodes: [],
            permissions: [{ code: "customer.read" }],
          },
        },
      },
    );

    expect(response).toMatchObject({
      phone: "13200001003",
      phone_masked: "132****1003",
      can_view_phone: true,
      can_call_phone: true,
      can_copy_phone: true,
    });
    expect(serializeCustomerPhoneFields).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext: expect.objectContaining({ tenantId: "tenant-1" }),
      }),
      { id: "customer-1", owner_id: null, phone: "13800138000" },
    );
    expect(getCustomerSourceSummaryMap).toHaveBeenCalledWith({
      authContext: expect.objectContaining({ tenantId: "tenant-1" }),
      customerIds: ["customer-1"],
    });
  });

  test("keeps the detail activity source query bounded to twenty", async () => {
    const controller = await Bun.file(
      new URL("./extras-controller.ts", import.meta.url),
    ).text();
    const activityStart = controller.indexOf("const [followUps, sources]");
    const activityEnd = controller.indexOf(
      "return ResponseHandler.success",
      activityStart,
    );
    const activity = controller.slice(activityStart, activityEnd);

    expect(activity).toContain("listAccessibleCustomerSources");
    expect(activity).toContain("page: 1");
    expect(activity).toContain("pageSize: 20");
    expect(controller).toContain("detail_activity");
  });
});
