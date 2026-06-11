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

    await page.getByRole("link", { name: "返回流程列表" }).click();
    await expect(page).toHaveURL(/\/workflows$/);
    await page.locator(`a[href="/workflows/${workflowId}"]`).first().click();
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
