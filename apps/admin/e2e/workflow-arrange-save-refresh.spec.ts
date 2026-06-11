import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const tenantAdminPhone = process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";

type BackendPayload<T> = {
  data?: T;
  success?: boolean;
};

type WorkflowDefinition = {
  id: string;
};

type WorkflowGraph = {
  nodes: Array<{
    node_key: string;
    position: { x: number; y: number };
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
      workflow_key: `e2e_arrange_${suffix}`,
      name: `e2e-arrange-${suffix}`,
      description: "E2E arrange persistence fixture",
      category: "sales",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json() as BackendPayload<WorkflowDefinition>;
  expect(payload.data?.id).toBeTruthy();
  return payload.data!.id;
}

async function seedWorkflowGraph(page: Page, workflowId: string) {
  const response = await page.request.put(`/api/backend/workflows/${workflowId}/graph`, {
    data: {
      nodes: [
        {
          node_key: "start",
          node_type: "start",
          business_kind: null,
          title: "开始",
          description: null,
          position: { x: 80, y: 160 },
          config: {},
          sort_order: 10,
        },
        {
          node_key: "lead",
          node_type: "business",
          business_kind: "customer_lead",
          title: "客户线索",
          description: null,
          position: { x: 340, y: 160 },
          config: {},
          sort_order: 20,
        },
        {
          node_key: "design",
          node_type: "business",
          business_kind: "design",
          title: "方案设计",
          description: null,
          position: { x: 600, y: 160 },
          config: {},
          sort_order: 30,
        },
        {
          node_key: "end",
          node_type: "end",
          business_kind: null,
          title: "结束",
          description: null,
          position: { x: 860, y: 160 },
          config: {},
          sort_order: 40,
        },
      ],
      edges: [
        {
          source_node_key: "start",
          target_node_key: "lead",
          label: null,
          condition: { operator: "always" },
          priority: 10,
        },
        {
          source_node_key: "lead",
          target_node_key: "design",
          label: null,
          condition: { operator: "always" },
          priority: 20,
        },
        {
          source_node_key: "design",
          target_node_key: "end",
          label: null,
          condition: { operator: "always" },
          priority: 30,
        },
      ],
    },
  });
  expect(response.ok()).toBe(true);
}

async function seedBranchWorkflowGraph(page: Page, workflowId: string) {
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
        {
          node_key: "finance_review",
          node_type: "business",
          business_kind: null,
          title: "财务复核",
          description: null,
          position: { x: 860, y: 320 },
          config: {},
          sort_order: 50,
        },
        {
          node_key: "end",
          node_type: "end",
          business_kind: null,
          title: "结束",
          description: null,
          position: { x: 1120, y: 180 },
          config: {},
          sort_order: 60,
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
          label: "收款成功",
          condition: { operator: "eq", field: "payment_status", value: "success" },
          priority: 20,
        },
        {
          source_node_key: "payment_stage_1",
          target_node_key: "collection_followup",
          label: "收款失败",
          condition: { operator: "eq", field: "payment_status", value: "failed" },
          priority: 30,
        },
        {
          source_node_key: "tile_work",
          target_node_key: "end",
          label: null,
          condition: { operator: "always" },
          priority: 40,
        },
        {
          source_node_key: "collection_followup",
          target_node_key: "finance_review",
          label: null,
          condition: { operator: "always" },
          priority: 50,
        },
        {
          source_node_key: "finance_review",
          target_node_key: "end",
          label: null,
          condition: { operator: "always" },
          priority: 60,
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function seedLinearWorkflowGraph(page: Page, workflowId: string) {
  const workflowNodes = Array.from({ length: 12 }, (_, index) => {
    const first = index === 0;
    const last = index === 11;
    return {
      node_key: first ? "start" : last ? "end" : `step_${index}`,
      node_type: first ? "start" : last ? "end" : "business",
      business_kind: null,
      title: first ? "开始" : last ? "结束" : `线性节点 ${index}`,
      description: null,
      position: { x: 80 + index * 240, y: 180 },
      config: {},
      sort_order: (index + 1) * 10,
    };
  });
  const response = await page.request.put(`/api/backend/workflows/${workflowId}/graph`, {
    data: {
      nodes: workflowNodes,
      edges: workflowNodes.slice(0, -1).map((node, index) => ({
        source_node_key: node.node_key,
        target_node_key: workflowNodes[index + 1].node_key,
        label: null,
        condition: { operator: "always" },
        priority: (index + 1) * 10,
      })),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function archiveWorkflow(page: Page, workflowId: string) {
  await page.request.post(`/api/backend/workflows/${workflowId}/archive`);
}

async function getNodeBoxes(nodes: Locator) {
  return nodes.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      };
    })
  );
}

async function dragLocatorBy(page: Page, locator: Locator, deltaX: number, deltaY: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + deltaX, centerY + deltaY);
  await page.mouse.up();
}

async function getEntityBoxes(page: Page) {
  return page.locator("[data-workflow-node='true'], [data-workflow-branch-source-key]")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        const nodeKey = element.getAttribute("data-workflow-node-key");
        const branchSourceKey = element.getAttribute("data-workflow-branch-source-key");
        return {
          label: nodeKey
            ? `node:${nodeKey}`
            : branchSourceKey
              ? `branch:${branchSourceKey}`
              : "entity",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
        };
      })
    );
}

function boxesOverlap(
  left: Awaited<ReturnType<typeof getEntityBoxes>>[number],
  right: Awaited<ReturnType<typeof getEntityBoxes>>[number],
) {
  return left.left < right.right &&
    left.right > right.left &&
    left.top < right.bottom &&
    left.bottom > right.top;
}

function findEntityBox(
  boxes: Awaited<ReturnType<typeof getEntityBoxes>>,
  label: string,
) {
  const box = boxes.find((item) => item.label === label);
  expect(box, `missing entity ${label}`).toBeTruthy();
  return box!;
}

test("整理后保存草稿再重新进入节点位置不漂移到右下角", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await page.getByRole("button", { name: "整理画布" }).click();
    await expect(page.getByText("画布已整理")).toBeVisible();
    await expect(page.locator("[data-workflow-canvas-zoom='true']")).toHaveText("60%");

    const nodes = page.locator("[data-workflow-node='true']");
    await expect(nodes.first()).toBeVisible();
    const arrangedBoxes = await getNodeBoxes(nodes);

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();

    await page.reload({ waitUntil: "load" });
    await expect(page.locator("[data-workflow-canvas-view-ready='true']")).toBeVisible();
    await expect(page.locator("[data-workflow-canvas-zoom='true']")).toHaveText("60%");
    await expect(nodes.first()).toBeVisible();
    const reloadedBoxes = await getNodeBoxes(nodes);

    expect(reloadedBoxes).toEqual(arrangedBoxes);

    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });
    await expect(page).toHaveURL(new RegExp(`/workflows/${workflowId}$`));
    await expect(page.locator("[data-workflow-canvas-view-ready='true']")).toBeVisible();
    await expect(page.locator("[data-workflow-canvas-zoom='true']")).toHaveText("60%");
    await expect(nodes.first()).toBeVisible();
    const reopenedBoxes = await getNodeBoxes(nodes);

    expect(reopenedBoxes).toEqual(arrangedBoxes);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("整理画布后普通节点和判断节点不重叠", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedBranchWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await page.getByRole("button", { name: "整理画布" }).click();
    await expect(page.getByText("画布已整理")).toBeVisible();
    await expect(page.locator("[data-workflow-branch-source-key='payment_stage_1']"))
      .toBeVisible();

    const boxes = await getEntityBoxes(page);
    expect(boxes.length).toBeGreaterThanOrEqual(7);
    const paymentBox = findEntityBox(boxes, "node:payment_stage_1");
    const branchBox = findEntityBox(boxes, "branch:payment_stage_1");
    const successBox = findEntityBox(boxes, "node:tile_work");
    const failureBox = findEntityBox(boxes, "node:collection_followup");
    expect(branchBox.left).toBeGreaterThan(paymentBox.right);
    expect(successBox.top).toBeLessThan(failureBox.top - 48);
    for (let index = 0; index < boxes.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < boxes.length; nextIndex += 1) {
        expect(
          boxesOverlap(boxes[index], boxes[nextIndex]),
          `${boxes[index].label} overlaps ${boxes[nextIndex].label}`,
        ).toBe(false);
      }
    }

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();

    const graphResponse = await page.request.get(`/api/backend/workflows/${workflowId}/graph`);
    expect(graphResponse.ok(), await graphResponse.text()).toBe(true);
    const graphPayload = await graphResponse.json() as BackendPayload<WorkflowGraph>;
    const paymentNode = graphPayload.data?.nodes.find((node) =>
      node.node_key === "payment_stage_1"
    );
    expect(paymentNode?.config?.branch_node_position?.x).toBeGreaterThan(0);
    expect(paymentNode?.config?.branch_node_position?.y).toBeGreaterThan(0);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("缩小后节点不能拖出画布左上边界", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await page.getByRole("button", { name: "缩小画布" }).click();
    await expect(page.locator("[data-workflow-canvas-zoom='true']")).toHaveText("90%");
    await dragLocatorBy(
      page,
      page.locator("[data-workflow-node-key='start']"),
      -900,
      -900,
    );

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("流程草稿已保存")).toBeVisible();

    const graphResponse = await page.request.get(`/api/backend/workflows/${workflowId}/graph`);
    expect(graphResponse.ok(), await graphResponse.text()).toBe(true);
    const graphPayload = await graphResponse.json() as BackendPayload<WorkflowGraph>;
    const startNode = graphPayload.data?.nodes.find((node) => node.node_key === "start");
    expect(startNode?.position.x).toBeGreaterThanOrEqual(0);
    expect(startNode?.position.y).toBeGreaterThanOrEqual(0);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});

test("线性流程整理后可以平移访问末端节点", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedLinearWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    await page.getByRole("button", { name: "整理画布" }).click();
    await expect(page.getByText("画布已整理")).toBeVisible();

    const pane = page.locator("[data-workflow-canvas='true'] .react-flow__pane");
    const endNode = page.locator("[data-workflow-node-key='end']");
    const paneBox = await pane.boundingBox();
    expect(paneBox).not.toBeNull();
    for (let index = 0; index < 5; index += 1) {
      await page.mouse.move(paneBox!.x + paneBox!.width * 0.75, paneBox!.y + paneBox!.height * 0.45);
      await page.mouse.down();
      await page.mouse.move(paneBox!.x + paneBox!.width * 0.15, paneBox!.y + paneBox!.height * 0.45, { steps: 10 });
      await page.mouse.up();
    }
    await expect(endNode).toBeInViewport();
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});
