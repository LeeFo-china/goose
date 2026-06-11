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
    config?: {
      branch_node_position?: { x: number; y: number } | null;
    };
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

async function dragLocatorBy(page: Page, locator: Locator, deltaX: number, deltaY: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + deltaX, centerY + deltaY, { steps: 12 });
  await page.mouse.up();
}

function parsePathStart(path: string | null) {
  const match = path?.match(/^M\s*([-\d.]+)[,\s]+([-\d.]+)/);
  expect(match).toBeTruthy();
  return {
    x: Number(match![1]),
    y: Number(match![2]),
  };
}

function parseCubicPath(path: string | null) {
  const match = path?.match(
    /^M\s*([-\d.]+)[,\s]+([-\d.]+)\s*C\s*([-\d.]+)[,\s]+([-\d.]+)\s+([-\d.]+)[,\s]+([-\d.]+)\s+([-\d.]+)[,\s]+([-\d.]+)/,
  );
  expect(match).toBeTruthy();
  return {
    sourceY: Number(match![2]),
    firstControlY: Number(match![4]),
    targetY: Number(match![8]),
  };
}

async function seedUpwardTargetGraph(page: Page, workflowId: string) {
  const response = await page.request.put(`/api/backend/workflows/${workflowId}/graph`, {
    data: {
      nodes: [
        {
          node_key: "start",
          node_type: "start",
          business_kind: null,
          title: "开始",
          description: null,
          position: { x: 120, y: 360 },
          config: {},
          sort_order: 10,
        },
        {
          node_key: "construction_start",
          node_type: "business",
          business_kind: "design",
          title: "开工",
          description: null,
          position: { x: 560, y: 120 },
          config: {},
          sort_order: 20,
        },
      ],
      edges: [
        {
          source_node_key: "start",
          target_node_key: "construction_start",
          label: null,
          condition: { operator: "always" },
          priority: 10,
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

test("目标节点在上方时连线不从出口反向下弯", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedUpwardTargetGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    const edgePath = page.locator(
      "path[data-workflow-edge-source-key='start'][data-workflow-edge-target-key='construction_start']",
    );
    await expect(edgePath).toBeVisible();
    const cubicPath = parseCubicPath(await edgePath.getAttribute("d"));

    expect(cubicPath.targetY).toBeLessThan(cubicPath.sourceY);
    expect(cubicPath.firstControlY).toBeLessThanOrEqual(cubicPath.sourceY + 1);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("收款节点本体作为菱形分流节点创建成功条件连线", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedPaymentGraphWithoutPaymentEdge(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await connectNodes(page, "payment_stage_1", "tile_work");

    await expect(page.locator("[data-workflow-branch-source-key='payment_stage_1']"))
      .toHaveCount(0);
    await expect(page.locator("[data-workflow-decision-node='payment_stage_1']"))
      .toBeVisible();
    await expect(page.locator("[data-workflow-node-key='payment_stage_1'] [data-workflow-branch-output='payment_success']"))
      .toHaveAttribute("data-workflow-branch-output-tone", "success");
    await expect(page.locator("[data-workflow-node-key='payment_stage_1'] [data-workflow-branch-output='payment_failed']"))
      .toHaveAttribute("data-workflow-branch-output-tone", "failure");

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

test("收款节点分流出口固定在菱形右侧和下侧", async ({ page }) => {
  test.setTimeout(60_000);
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedPaymentGraphWithoutPaymentEdge(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await connectNodes(page, "payment_stage_1", "tile_work");

    const paymentNode = page.locator("[data-workflow-node-key='payment_stage_1']");
    const successOutput = paymentNode.locator("[data-workflow-branch-output='payment_success']");
    const failedOutput = paymentNode.locator("[data-workflow-branch-output='payment_failed']");
    await expect(page.locator("[data-workflow-branch-source-key='payment_stage_1']"))
      .toHaveCount(0);
    await expect(paymentNode.locator("[data-workflow-decision-diamond='true']")).toBeVisible();
    await expect(successOutput).toHaveAttribute("data-workflow-branch-output-tone", "success");
    await expect(failedOutput).toHaveAttribute("data-workflow-branch-output-tone", "failure");
    await expect(paymentNode.getByText("成功", { exact: true })).toHaveCount(0);
    await expect(paymentNode.getByText("失败", { exact: true })).toHaveCount(0);

    const diamondBox = await paymentNode.locator("[data-workflow-decision-diamond='true']")
      .boundingBox();
    const successBox = await successOutput.boundingBox();
    const failedBox = await failedOutput.boundingBox();
    expect(diamondBox).not.toBeNull();
    expect(successBox).not.toBeNull();
    expect(failedBox).not.toBeNull();
    expect(Math.abs(
      successBox!.x + successBox!.width / 2 - (diamondBox!.x + diamondBox!.width),
    )).toBeLessThan(8);
    expect(Math.abs(
      successBox!.y + successBox!.height / 2 - (diamondBox!.y + diamondBox!.height / 2),
    )).toBeLessThan(8);
    expect(Math.abs(
      failedBox!.x + failedBox!.width / 2 - (diamondBox!.x + diamondBox!.width / 2),
    )).toBeLessThan(8);
    expect(Math.abs(
      failedBox!.y + failedBox!.height / 2 - (diamondBox!.y + diamondBox!.height),
    )).toBeLessThan(8);

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();

    const savedGraphResponse = await page.request.get(`/api/backend/workflows/${workflowId}/graph`);
    expect(savedGraphResponse.ok(), await savedGraphResponse.text()).toBe(true);
    const savedGraphPayload = await savedGraphResponse.json() as BackendPayload<WorkflowGraph>;
    const savedPaymentNode = savedGraphPayload.data!.nodes.find((node) =>
      node.node_key === "payment_stage_1"
    );
    expect(savedPaymentNode?.config?.branch_node_position).toBeUndefined();
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

    const failedPath = page.locator(
      "path[data-workflow-edge-source-key='payment_stage_1'][data-workflow-edge-target-key='collection_followup']",
    );
    const failedStart = parsePathStart(await failedPath.getAttribute("d"));
    expect(failedStart.x).toBeGreaterThan(0);
    expect(failedStart.y).toBeGreaterThan(0);

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
