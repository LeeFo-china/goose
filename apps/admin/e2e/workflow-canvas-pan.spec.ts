import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

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
      workflow_key: `e2e_canvas_pan_${suffix}`,
      name: `e2e-canvas-pan-${suffix}`,
      description: "E2E canvas pan fixture",
      category: "sales",
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const payload = await response.json() as BackendPayload<WorkflowDefinition>;
  expect(payload.data?.id).toBeTruthy();
  return payload.data!.id;
}

async function seedWideWorkflowGraph(page: Page, workflowId: string) {
  const workflowNodes = Array.from({ length: 12 }, (_, index) => {
    const first = index === 0;
    const last = index === 11;
    return {
      node_key: first ? "start" : last ? "end" : `step_${index}`,
      node_type: first ? "start" : last ? "end" : "business",
      business_kind: null,
      title: first ? "开始" : last ? "结束" : `画布拖拽 ${index}`,
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

test("横向滚动条出现后可以拖拽画布平移", async ({ page }) => {
  await loginAsTenantAdmin(page);
  const workflowId = await createTemporaryWorkflow(page);

  try {
    await seedWideWorkflowGraph(page, workflowId);
    await page.goto(`/workflows/${workflowId}`, { waitUntil: "load" });
    await page.getByRole("button", { name: "整理画布" }).click();
    await expect(page.getByText("画布已整理")).toBeVisible();

    const scrollArea = page.locator("[data-workflow-canvas-scroll='true']");
    await expect.poll(async () => scrollArea.evaluate((element) =>
      element.scrollWidth > element.clientWidth,
    )).toBe(true);
    const before = await scrollArea.evaluate((element) => ({
      left: element.scrollLeft,
      canScrollX: element.scrollWidth > element.clientWidth,
    }));
    expect(before.canScrollX).toBe(true);

    const box = await scrollArea.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width * 0.55;
    const startY = box!.y + box!.height * 0.32;
    const hit = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        workflowCanvas: Boolean(element?.closest("[data-workflow-canvas='true']")),
        workflowNode: Boolean(element?.closest("[data-workflow-node='true']")),
      };
    }, { x: startX, y: startY });
    expect(hit.workflowCanvas).toBe(true);
    expect(hit.workflowNode).toBe(false);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 220, startY, { steps: 8 });
    await page.mouse.up();

    const after = await scrollArea.evaluate((element) => ({
      left: element.scrollLeft,
    }));
    expect(after.left).toBeGreaterThan(before.left + 40);
  } finally {
    await archiveWorkflow(page, workflowId);
  }
});
