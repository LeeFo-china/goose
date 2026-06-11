import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const tenantAdminPhone = process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";

type BackendPayload<T> = {
  data?: T;
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
      workflow_key: `e2e_validation_${suffix}`,
      name: `e2e-validation-${suffix}`,
      description: "E2E validation playback fixture",
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
  expect(response.ok(), await response.text()).toBe(true);
}

async function archiveWorkflow(page: Page, workflowId: string) {
  await page.request.post(`/api/backend/workflows/${workflowId}/archive`);
}

test("本地校验按执行顺序播放节点和连线", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });

    const startNode = page.locator("[data-workflow-node-key='start']");
    const endNode = page.locator("[data-workflow-node-key='end']");

    await page.getByRole("button", { name: "本地校验" }).click();

    await expect(startNode).toHaveAttribute("data-workflow-validation-state", "active");
    await expect(page.locator("[data-workflow-edge-validation-state='active']").first())
      .toHaveAttribute("data-workflow-edge-validation-state", "active");
    await expect(endNode).toHaveAttribute("data-workflow-validation-state", "success", {
      timeout: 4000,
    });
    await expect(page.locator("[data-workflow-validation-playback='success']")).toBeVisible();
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});
