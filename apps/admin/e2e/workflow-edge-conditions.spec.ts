import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const tenantAdminPhone = process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";

type BackendPayload<T> = {
  data?: T;
};

type WorkflowDefinition = {
  id: string;
};

type WorkflowGraph = {
  edges: Array<{
    source_node_id: string;
    target_node_id: string;
    label: string | null;
    condition: {
      operator: string;
      field?: string | null;
      value?: string | number | boolean | string[] | null;
    };
  }>;
  nodes: Array<{
    id: string;
    node_key: string;
  }>;
};

type WorkflowRuntimeResult = {
  instance: {
    id: string;
    current_node_key: string | null;
  };
  nextNode?: {
    node_key?: string;
  } | null;
};

function createRuntimeSubjectId() {
  return `00000000-0000-4000-8000-${Math.random().toString().slice(2, 14).padEnd(12, "0")}`;
}

async function loginAsTenantAdmin(page: Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      phone: tenantAdminPhone,
      code: "",
    },
  });
  expect(loginResponse.ok()).toBe(true);
}

async function createTemporaryWorkflow(page: Page) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const response = await page.request.post("/api/backend/workflows", {
    data: {
      workflow_key: `e2e_branch_${suffix}`,
      name: `e2e-branch-${suffix}`,
      description: "E2E edge condition fixture",
      category: "construction",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json() as BackendPayload<WorkflowDefinition>;
  expect(payload.data?.id).toBeTruthy();
  return payload.data!.id;
}

async function seedPaymentBranchGraph(page: Page, workflowId: string) {
  const response = await page.request.put(`/api/backend/workflows/${workflowId}/graph`, {
    data: {
      nodes: [
        {
          node_key: "start",
          node_type: "start",
          business_kind: null,
          title: "开始",
          description: null,
          position: { x: 80, y: 180 },
          config: {},
          sort_order: 10,
        },
        {
          node_key: "payment_stage_1",
          node_type: "confirmation",
          business_kind: "payment_collection",
          title: "收款",
          description: null,
          position: { x: 330, y: 180 },
          config: {
            payment_type: "stage_1",
            requirement_mode: "any_confirmed",
            finance_reviewer_employee_id: "00000000-0000-0000-0000-000000000000",
          },
          sort_order: 20,
        },
        {
          node_key: "tile_work",
          node_type: "procedure",
          business_kind: "procedure_template",
          title: "瓦工",
          description: null,
          position: { x: 610, y: 120 },
          config: {
            stage_key: "tiling",
            require_log: false,
            min_image_count: 0,
            trigger_acceptance: false,
            customer_visible: false,
          },
          sort_order: 30,
        },
        {
          node_key: "collection_followup",
          node_type: "notification",
          business_kind: null,
          title: "催收",
          description: null,
          position: { x: 610, y: 260 },
          config: {
            channels: ["todo"],
            recipient_rule: "owner",
            template: "请跟进中期款催收",
          },
          sort_order: 40,
        },
        {
          node_key: "end",
          node_type: "end",
          business_kind: null,
          title: "结束",
          description: null,
          position: { x: 880, y: 180 },
          config: {},
          sort_order: 50,
        },
      ],
      edges: [
        {
          source_node_key: "start",
          target_node_key: "payment_stage_1",
          label: null,
          condition: { operator: "always" },
          priority: 10,
        },
        {
          source_node_key: "payment_stage_1",
          target_node_key: "tile_work",
          label: null,
          condition: { operator: "always" },
          priority: 20,
        },
        {
          source_node_key: "payment_stage_1",
          target_node_key: "collection_followup",
          label: null,
          condition: { operator: "always" },
          priority: 30,
        },
        {
          source_node_key: "collection_followup",
          target_node_key: "tile_work",
          label: null,
          condition: { operator: "always" },
          priority: 40,
        },
        {
          source_node_key: "tile_work",
          target_node_key: "end",
          label: null,
          condition: { operator: "always" },
          priority: 50,
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function archiveWorkflow(page: Page, workflowId: string) {
  await page.request.post(`/api/backend/workflows/${workflowId}/archive`);
}

async function selectEdgeCondition(page: Page, sourceKey: string, targetKey: string, label: string) {
  const edge = page.locator(
    `[data-edge-action='configure'][data-workflow-edge-source-key='${sourceKey}'][data-workflow-edge-target-key='${targetKey}']`,
  );
  await expect(edge).toBeAttached({ timeout: 5000 });
  await edge.click({ force: true });
  await expect(page.getByRole("heading", { name: "连线属性" })).toBeVisible();
  await page.getByLabel("分支条件").click();
  await page.getByRole("option", { name: label }).click();
}

test("收款节点出线可以配置成功和失败分支条件", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedPaymentBranchGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await selectEdgeCondition(page, "payment_stage_1", "tile_work", "收款成功");
    await selectEdgeCondition(page, "payment_stage_1", "collection_followup", "收款失败");
    await page.getByRole("button", { name: "本地校验" }).click();
    await expect(page.locator("[data-workflow-validation-playback='success']")).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();

    const graphResponse = await page.request.get(`/api/backend/workflows/${workflowId}/graph`);
    expect(graphResponse.ok(), await graphResponse.text()).toBe(true);
    const graphPayload = await graphResponse.json() as BackendPayload<WorkflowGraph>;
    const graph = graphPayload.data!;
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const successEdge = graph.edges.find((edge) =>
      nodeById.get(edge.source_node_id)?.node_key === "payment_stage_1" &&
      nodeById.get(edge.target_node_id)?.node_key === "tile_work"
    );
    const failedEdge = graph.edges.find((edge) =>
      nodeById.get(edge.source_node_id)?.node_key === "payment_stage_1" &&
      nodeById.get(edge.target_node_id)?.node_key === "collection_followup"
    );

    expect(successEdge?.label).toBe("收款成功");
    expect(successEdge?.condition).toEqual({
      operator: "eq",
      field: "payment_status",
      value: "success",
    });
    expect(failedEdge?.label).toBe("收款失败");
    expect(failedEdge?.condition).toEqual({
      operator: "eq",
      field: "payment_status",
      value: "failed",
    });

    const publishResponse = await page.request.post(`/api/backend/workflows/${workflowId}/publish`);
    expect(publishResponse.ok(), await publishResponse.text()).toBe(true);

    const startResponse = await page.request.post(`/api/backend/workflows/${workflowId}/runtime/instances`, {
      data: {
        subject_type: "manual",
        subject_id: `branch-${Date.now()}`,
        context: {},
      },
    });
    expect(startResponse.ok(), await startResponse.text()).toBe(true);
    const startPayload = await startResponse.json() as BackendPayload<WorkflowRuntimeResult>;
    const instanceId = startPayload.data!.instance.id;

    const failedPaymentResponse = await page.request.post(
      `/api/backend/workflows/${workflowId}/runtime/instances/${instanceId}/complete-node`,
      {
        data: {
          node_key: "payment_stage_1",
          action: "complete",
          output: { payment_status: "failed" },
        },
      },
    );
    expect(failedPaymentResponse.ok(), await failedPaymentResponse.text()).toBe(true);
    const failedPaymentPayload = await failedPaymentResponse.json() as BackendPayload<WorkflowRuntimeResult>;
    expect(failedPaymentPayload.data!.instance.current_node_key).toBe("collection_followup");
    expect(failedPaymentPayload.data!.nextNode?.node_key).toBe("collection_followup");
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("项目收款节点失败分支不应被未入账收款拦截", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedPaymentBranchGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await selectEdgeCondition(page, "payment_stage_1", "tile_work", "收款成功");
    await selectEdgeCondition(page, "payment_stage_1", "collection_followup", "收款失败");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();

    const publishResponse = await page.request.post(`/api/backend/workflows/${workflowId}/publish`);
    expect(publishResponse.ok(), await publishResponse.text()).toBe(true);

    const startResponse = await page.request.post(`/api/backend/workflows/${workflowId}/runtime/instances`, {
      data: {
        subject_type: "project",
        subject_id: createRuntimeSubjectId(),
        context: {},
      },
    });
    expect(startResponse.ok(), await startResponse.text()).toBe(true);
    const startPayload = await startResponse.json() as BackendPayload<WorkflowRuntimeResult>;
    const instanceId = startPayload.data!.instance.id;

    const failedPaymentResponse = await page.request.post(
      `/api/backend/workflows/${workflowId}/runtime/instances/${instanceId}/complete-node`,
      {
        data: {
          node_key: "payment_stage_1",
          action: "complete",
          output: { payment_status: "failed" },
        },
      },
    );
    expect(failedPaymentResponse.ok(), await failedPaymentResponse.text()).toBe(true);
    const failedPaymentPayload = await failedPaymentResponse.json() as BackendPayload<WorkflowRuntimeResult>;
    expect(failedPaymentPayload.data!.instance.current_node_key).toBe("collection_followup");
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});
