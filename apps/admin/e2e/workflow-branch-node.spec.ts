import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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
      workflow_key: `e2e_branch_node_${suffix}`,
      name: `e2e-branch-node-${suffix}`,
      description: "E2E branch node fixture",
      category: "construction",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json() as BackendPayload<WorkflowDefinition>;
  expect(payload.data?.id).toBeTruthy();
  return payload.data!.id;
}

async function seedPaymentGraphWithoutPaymentEdge(page: Page, workflowId: string) {
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
          title: "中期收款",
          description: null,
          position: { x: 250, y: 180 },
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
          position: { x: 590, y: 180 },
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
          position: { x: 590, y: 320 },
          config: {
            channels: ["todo"],
            recipient_rule: "owner",
            template: "请跟进中期款催收",
          },
          sort_order: 40,
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
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function archiveWorkflow(page: Page, workflowId: string) {
  await page.request.post(`/api/backend/workflows/${workflowId}/archive`);
}

async function connectNodes(page: Page, sourceKey: string, targetKey: string) {
  const source = page.locator(
    `[data-workflow-node-key='${sourceKey}'] [data-node-action='output']`,
  );
  await connectLocatorToNode(page, source, targetKey);
}

async function connectBranchOutcome(page: Page, outcomeKey: string, targetKey: string) {
  const source = page.locator(`[data-workflow-branch-output='${outcomeKey}']`);
  await connectLocatorToNode(page, source, targetKey);
}

async function connectLocatorToNode(
  page: Page,
  source: Locator,
  targetKey: string,
) {
  const target = page.locator(
    `[data-workflow-node-key='${targetKey}'] [data-node-input='true']`,
  );
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2);
  await page.mouse.up();
}

test("收款节点拖线自动生成判断节点", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedPaymentGraphWithoutPaymentEdge(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await connectNodes(page, "payment_stage_1", "tile_work");

    await expect(page.locator("[data-workflow-branch-source-key='payment_stage_1']"))
      .toBeVisible();
    await expect(page.getByText("收款判断")).toBeVisible();

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

    expect(successEdge?.label).toBe("收款成功");
    expect(successEdge?.condition).toEqual({
      operator: "eq",
      field: "payment_status",
      value: "success",
    });
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("连线不再提供属性配置入口", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedPaymentGraphWithoutPaymentEdge(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await connectNodes(page, "payment_stage_1", "tile_work");

    await expect(page.locator("[data-edge-action='configure']")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "连线属性" })).toHaveCount(0);
    await expect(page.getByText("收款成功")).toBeVisible();
    await expect(page.getByRole("button", { name: "删除连线" }).first()).toBeVisible();
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("收款判断节点失败出口可以连接催收流程", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedPaymentGraphWithoutPaymentEdge(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await connectNodes(page, "payment_stage_1", "tile_work");
    await connectBranchOutcome(page, "payment_failed", "collection_followup");

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();

    const graphResponse = await page.request.get(`/api/backend/workflows/${workflowId}/graph`);
    expect(graphResponse.ok(), await graphResponse.text()).toBe(true);
    const graphPayload = await graphResponse.json() as BackendPayload<WorkflowGraph>;
    const graph = graphPayload.data!;
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const failedEdge = graph.edges.find((edge) =>
      nodeById.get(edge.source_node_id)?.node_key === "payment_stage_1" &&
      nodeById.get(edge.target_node_id)?.node_key === "collection_followup"
    );

    expect(failedEdge?.label).toBe("收款失败");
    expect(failedEdge?.condition).toEqual({
      operator: "eq",
      field: "payment_status",
      value: "failed",
    });
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});
